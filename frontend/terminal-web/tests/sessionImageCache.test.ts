import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionImageCache } from '../src/utils/sessionImageCache.ts'
import { loadSessionImage } from '../src/utils/loadSessionImage.ts'

const picture = () => new Response(new Blob(['picture'], { type: 'image/jpeg' }))

test('原生 fetch 始终绑定全局对象，兼容要求 Window 接收者的旧 WebView', async () => {
  const nativeLikeFetch = function(this: unknown) {
    if (this !== globalThis) throw new TypeError('Illegal invocation')
    return Promise.resolve(picture())
  }
  const cache = new SessionImageCache(nativeLikeFetch)
  await cache.load('one', '/cloud/one')
  assert.equal(cache.size, 1)
  cache.clear()
})

test('并行请求同一张图只下载一次', async () => {
  let calls = 0
  const cache = new SessionImageCache(async () => { calls++; return picture() })
  const [one, two] = await Promise.all([cache.load('one', '/cloud/one'), cache.load('one', '/cloud/one')])
  assert.equal(one, two)
  assert.equal(calls, 1)
  assert.equal(cache.bytes, 7)
  cache.clear()
})

function imageFactory(fails: boolean) {
  const image = {
    naturalWidth: fails ? 0 : 1600, naturalHeight: fails ? 0 : 900, complete: false,
    onload: null as (() => void) | null, onerror: null as (() => void) | null,
    set src(_value: string) { queueMicrotask(() => fails ? this.onerror?.() : this.onload?.()) },
    decode: () => new Promise<void>(() => {}), removeAttribute: () => {},
  }
  return image as unknown as HTMLImageElement
}

test('WebView decode 永不返回也不阻塞已正常显示的图片', async () => {
  const cache = new SessionImageCache(async () => picture())
  const url = await loadSessionImage(cache, 'one', '/cloud/one', () => true, () => imageFactory(false))
  assert.equal(cache.get('one'), url)
  cache.clear()
})

test('图片无法解码时丢弃缓存重新下载，不反复读取同一份坏图', async () => {
  let calls = 0, images = 0
  const cache = new SessionImageCache(async () => { calls++; return picture() })
  await loadSessionImage(cache, 'one', '/cloud/one', () => true, () => imageFactory(images++ === 0))
  assert.equal(calls, 2)
  assert.equal(cache.size, 1)
  assert.equal(cache.bytes, 7)
  cache.clear()
})

test('仅临时加载本次图片，复用后退出撤销 URL 和字节计数', async () => {
  let calls = 0
  const cache = new SessionImageCache(async (_url, options) => {
    calls++
    assert.equal(options?.cache, 'no-store')
    return picture()
  })
  const url = await cache.load('one', '/cloud/one')
  assert.equal(await cache.load('one', '/cloud/one'), url)
  assert.equal(calls, 1)
  assert.equal(await (await fetch(url)).text(), 'picture')
  assert.equal(cache.bytes, 7)
  cache.clear()
  assert.equal(cache.size, 0)
  assert.equal(cache.bytes, 0)
  await assert.rejects(fetch(url))
})

test('退出后迟到响应不能污染下一次测评缓存', async () => {
  let complete!: (response: Response) => void
  let signal: AbortSignal | null | undefined
  const cache = new SessionImageCache(async (_url, options) => {
    signal = options?.signal
    return new Promise<Response>(resolve => { complete = resolve })
  })
  const loading = cache.load('one', '/cloud/one')
  cache.clear()
  assert.equal(signal?.aborted, true)
  complete(picture())
  await assert.rejects(loading, /取消/)
  assert.equal(cache.size, 0)
  assert.equal(cache.bytes, 0)
})

test('限制单次压缩素材缓存，拒绝非图片响应', async () => {
  const cache = new SessionImageCache(async () => picture(), 6)
  await assert.rejects(cache.load('one', '/cloud/one'), /上限/)
  assert.equal(cache.size, 0)
  const invalid = new SessionImageCache(async () => new Response('error'))
  await assert.rejects(invalid.load('one', '/cloud/one'), /失败/)
})
