import type { SessionImageCache } from './sessionImageCache.ts'

/** onload + real dimensions are the completion signal. Old WebViews can leave decode() pending. */
export async function loadSessionImage(
  cache: SessionImageCache, source: string, requestUrl: string,
  active: () => boolean = () => true,
  makeImage: () => HTMLImageElement = () => new Image(),
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!active()) throw new Error('图片准备已取消')
    const image = makeImage()
    let url: string | undefined
    try {
      url = await cache.load(source, requestUrl)
      if (!active()) throw new Error('图片准备已取消')
      await new Promise<void>((resolve, reject) => {
        let settled = false
        const finish = (ok: boolean) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          image.onload = null; image.onerror = null
          if (ok && image.naturalWidth > 0 && image.naturalHeight > 0) resolve()
          else reject(new Error('图片加载失败'))
        }
        const timer = setTimeout(() => finish(false), 12000)
        image.onload = () => finish(true)
        image.onerror = () => finish(false)
        image.src = url!
        if (image.complete) finish(image.naturalWidth > 0)
      })
      // Prewarming is optional and never holds the preparation gate open.
      try { void image.decode?.().catch(() => undefined) } catch { /* Older WebView. */ }
      if (!active()) throw new Error('图片准备已取消')
      return url
    } catch (error) {
      if (url) cache.evict(source, url)
      if (!active() || attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 180 * (attempt + 1)))
    } finally {
      image.onload = null; image.onerror = null; image.removeAttribute('src')
    }
  }
  throw new Error('图片加载失败')
}
