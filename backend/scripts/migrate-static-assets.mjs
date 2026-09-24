#!/usr/bin/env node
/**
 * Build a checksum manifest and optionally migrate public media to OSS.
 * Run from the repository root:
 *   node backend/scripts/migrate-static-assets.mjs
 *   node backend/scripts/migrate-static-assets.mjs --upload
 *
 * Existing OSS credentials/bucket are reused by default. Objects are isolated
 * under static-assets/ and only those objects receive a public-read ACL.
 */
import { createHash, createHmac } from 'node:crypto'
import {
  createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync,
  readdirSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MEDIA_EXTENSIONS = new Set([
  '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.wav', '.mp3',
  '.mp4', '.webm', '.ogg', '.m4a',
])
const MIME = {
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
}

function readEnv() {
  const values = { ...process.env }
  const envPath = join(ROOT, '.env')
  let contents = ''
  try { contents = readFileSync(envPath, 'utf8') } catch { return values }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || values[match[1]]) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trim()
    }
    values[match[1]] = value
  }
  return values
}

function walk(root, prefix, files = [], sourceRoot = root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) walk(path, prefix, files, sourceRoot)
    else if (entry.isFile() && MEDIA_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      const rel = relative(sourceRoot, path).split(sep).join('/')
      files.push({
        source: relative(ROOT, path).split(sep).join('/'),
        key: `static-assets/${prefix}/${rel}`,
        path,
      })
    }
  }
  return files
}

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function collectAssets() {
  const roots = [
    [join(ROOT, 'backend', 'app', 'static', 'assets'), 'assets'],
    [join(ROOT, 'community-assets'), 'community'],
  ]
  const files = []
  for (const [root, prefix] of roots) {
    try { walk(root, prefix, files) } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const assets = []
  for (const file of files.sort((a, b) => a.key.localeCompare(b.key))) {
    const extension = extname(file.path).toLowerCase()
    assets.push({
      source: file.source,
      key: file.key,
      size: statSync(file.path).size,
      sha256: await sha256(file.path),
      content_type: MIME[extension] || 'application/octet-stream',
    })
  }
  return assets
}

function settingsFrom(env) {
  const accessKeyId = env.ASSET_OSS_ACCESS_KEY_ID || env.OSS_ACCESS_KEY_ID || ''
  const accessKeySecret = env.ASSET_OSS_ACCESS_KEY_SECRET || env.OSS_ACCESS_KEY_SECRET || ''
  const bucket = env.ASSET_OSS_BUCKET_NAME || env.OSS_BUCKET_NAME || ''
  const endpoint = (env.ASSET_OSS_ENDPOINT || env.OSS_ENDPOINT || '')
    .replace(/^https?:\/\//, '').replace(/\/$/, '')
  const origin = bucket && endpoint ? `https://${bucket}.${endpoint}` : ''
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    endpoint,
    cdnBase: (env.ASSET_CDN_BASE_URL || origin).replace(/\/$/, ''),
  }
}

function encodeObjectKey(key) {
  return key.split('/').map(part => encodeURIComponent(part)).join('/')
}

function signedHeaders(config, key, asset) {
  const date = new Date().toUTCString()
  const contentType = String(asset.content_type)
  const acl = 'public-read'
  const canonicalResource = `/${config.bucket}/${key}`
  const stringToSign = [
    'PUT', '', contentType, date,
    `x-oss-object-acl:${acl}\n${canonicalResource}`,
  ].join('\n')
  const signature = createHmac('sha1', config.accessKeySecret)
    .update(stringToSign).digest('base64')
  return {
    Date: date,
    'Content-Type': contentType,
    'Content-Length': String(asset.size),
    'Cache-Control': 'public, max-age=86400',
    'x-oss-object-acl': acl,
    Authorization: `OSS ${config.accessKeyId}:${signature}`,
  }
}

function signedDeleteHeaders(config, key) {
  const date = new Date().toUTCString()
  const canonicalResource = `/${config.bucket}/${key}`
  const stringToSign = `DELETE\n\n\n${date}\n${canonicalResource}`
  const signature = createHmac('sha1', config.accessKeySecret)
    .update(stringToSign).digest('base64')
  return { Date: date, Authorization: `OSS ${config.accessKeyId}:${signature}` }
}

function ossRequest(config, method, key, headers = {}, filePath = undefined) {
  return new Promise((resolvePromise, reject) => {
    const request = https.request({
      hostname: `${config.bucket}.${config.endpoint}`,
      method,
      path: `/${encodeObjectKey(key)}`,
      headers,
    }, response => {
      const chunks = []
      response.on('data', chunk => { if (chunks.reduce((n, c) => n + c.length, 0) < 8192) chunks.push(chunk) })
      response.on('end', () => resolvePromise({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    request.on('error', reject)
    if (filePath) {
      const stream = createReadStream(filePath)
      stream.on('error', reject)
      stream.pipe(request)
    } else request.end()
  })
}

async function readManifest(manifestPath) {
  return JSON.parse(readFileSync(manifestPath, 'utf8'))
}

async function verifyPublicAssets(config, assets) {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]
    const meta = await ossRequest(config, 'HEAD', asset.key)
    if (meta.status !== 200 || Number(meta.headers['content-length']) !== asset.size) {
      throw new Error(`Public object check failed (${meta.status}) for ${asset.key}`)
    }
    if ((index + 1) % 25 === 0 || index + 1 === assets.length) {
      console.log(`[verified ${index + 1}/${assets.length}]`)
    }
  }
}

function safeSourcePath(source) {
  const path = resolve(ROOT, source)
  if (!path.startsWith(`${ROOT}${sep}`)) throw new Error(`Invalid manifest source path: ${source}`)
  return path
}

async function downloadAssets(baseUrl, assets) {
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]
    const target = safeSourcePath(asset.source)
    if (existsSync(target) && await sha256(target) === asset.sha256) continue
    mkdirSync(dirname(target), { recursive: true })
    const temporary = `${target}.download-part`
    const url = `${baseUrl}/${encodeObjectKey(asset.key)}`
    const response = await new Promise((resolvePromise, reject) => {
      https.get(url, res => {
        if (res.statusCode !== 200) {
          res.resume()
          reject(new Error(`Download failed (${res.statusCode}) for ${asset.key}`))
          return
        }
        resolvePromise(res)
      }).on('error', reject)
    })
    const hash = createHash('sha256')
    const hashingStream = new Transform({
      transform(chunk, encoding, callback) {
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    try {
      await pipeline(response, hashingStream, createWriteStream(temporary))
      if (hash.digest('hex') !== asset.sha256) throw new Error(`SHA-256 mismatch for ${asset.key}`)
      renameSync(temporary, target)
    } catch (error) {
      if (existsSync(temporary)) unlinkSync(temporary)
      throw error
    }
    console.log(`[downloaded ${index + 1}/${assets.length}] ${asset.source}`)
  }
}

async function cleanupFlattenedKeys(config, assets) {
  const correctKeys = new Set(assets.map(asset => asset.key))
  const staleKeys = new Set()
  for (const asset of assets) {
    const sourcePrefix = asset.source.startsWith('backend/app/static/assets/')
      ? 'static-assets/assets'
      : 'static-assets/community'
    const flatKey = `${sourcePrefix}/${asset.source.split('/').pop()}`
    if (!correctKeys.has(flatKey)) staleKeys.add(flatKey)
  }
  for (const key of staleKeys) {
    const response = await ossRequest(config, 'DELETE', key, signedDeleteHeaders(config, key))
    if (response.status !== 204 && response.status !== 200) {
      throw new Error(`Could not remove migration's flattened key (${response.status}): ${key}`)
    }
  }
  console.log(`Removed ${staleKeys.size} unused flat object keys from static-assets/.`)
}

async function main() {
  const env = readEnv()
  const config = settingsFrom(env)
  const args = process.argv.slice(2)
  const upload = args.includes('--upload')
  const download = args.includes('--download')
  const pruneLocal = args.includes('--prune-local')
  const cleanupFlattened = args.includes('--cleanup-flattened')
  const manifestFlag = args.indexOf('--manifest')
  const manifestPath = manifestFlag >= 0 && args[manifestFlag + 1]
    ? resolve(process.cwd(), args[manifestFlag + 1])
    : join(ROOT, 'static-assets-manifest.json')

  if (download || pruneLocal || cleanupFlattened) {
    const manifest = await readManifest(manifestPath)
    const assets = manifest.assets || []
    if (download) {
      const baseUrl = manifest.cdn_base_url || config.cdnBase
      if (!baseUrl) throw new Error('No CDN/OSS base URL found in manifest or .env.')
      await downloadAssets(baseUrl, assets)
      return
    }
    if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.endpoint) {
      throw new Error('OSS configuration missing; set OSS_* or ASSET_OSS_* in .env.')
    }
    if (cleanupFlattened) await cleanupFlattenedKeys(config, assets)
    if (pruneLocal) {
      await verifyPublicAssets(config, assets)
      for (const asset of assets) {
        const path = safeSourcePath(asset.source)
        if (!existsSync(path)) continue
        if (await sha256(path) !== asset.sha256) {
          throw new Error(`Local asset changed since upload; refusing to remove ${asset.source}`)
        }
      }
      for (const asset of assets) {
        const path = safeSourcePath(asset.source)
        if (existsSync(path)) unlinkSync(path)
      }
      console.log(`Removed ${assets.length} uploaded source files from the project.`)
    }
    return
  }

  const assets = await collectAssets()
  if (existsSync(manifestPath) && !args.includes('--refresh-manifest')) {
    const previous = await readManifest(manifestPath)
    if (Array.isArray(previous.assets) && previous.assets.length > assets.length) {
      throw new Error(
        `Local media (${assets.length}) is fewer than the saved manifest ` +
        `(${previous.assets.length}); use --download to restore or ` +
        '--refresh-manifest to intentionally replace the manifest.',
      )
    }
  }
  const manifest = { version: 1, cdn_base_url: config.cdnBase, assets }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  const totalBytes = assets.reduce((sum, asset) => sum + asset.size, 0)
  console.log(`Manifest: ${manifestPath}`)
  console.log(`Media: ${assets.length} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`)
  if (!upload) {
    console.log('Manifest only; pass --upload to upload and verify public access.')
    return
  }
  if (!config.accessKeyId || !config.accessKeySecret || !config.bucket || !config.endpoint) {
    throw new Error('OSS configuration missing; set OSS_* or ASSET_OSS_* in .env.')
  }

  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index]
    const headers = signedHeaders(config, asset.key, asset)
    const put = await ossRequest(config, 'PUT', asset.key, headers, join(ROOT, asset.source))
    if (put.status < 200 || put.status >= 300) {
      throw new Error(`OSS upload failed (${put.status}) for ${asset.key}: ${put.body.slice(0, 500)}`)
    }
    const publicRead = await ossRequest(config, 'HEAD', asset.key)
    if (publicRead.status !== 200 || Number(publicRead.headers['content-length']) !== asset.size) {
      throw new Error(`OSS metadata check failed (${publicRead.status}) for ${asset.key}`)
    }
    console.log(`[${index + 1}/${assets.length}] ${asset.key}`)
  }
  console.log('OSS upload and object-size checks completed. Local files are unchanged.')
}

main().catch(error => {
  console.error(error.message || error)
  process.exitCode = 1
})
