import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const require = createRequire(new URL('../frontend/terminal-web/package.json', import.meta.url))
const { build } = require('esbuild')
const result = await build({ entryPoints: [fileURLToPath(new URL('./export-community-library.ts', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', target: 'node18', write: false })
const payload = JSON.parse(execFileSync(process.execPath, ['-'], { input: result.outputFiles[0].text, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }))
const version = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
const dir = fileURLToPath(new URL('../backend/app/content/', import.meta.url))
mkdirSync(dir, { recursive: true })
writeFileSync(`${dir}/community-library.json`, JSON.stringify({ name: 'community-library', version, payload }, null, 2) + '\n')
console.log(`Community content exported: ${payload.scales.length} scales, ${payload.officialResources.length} articles`)
