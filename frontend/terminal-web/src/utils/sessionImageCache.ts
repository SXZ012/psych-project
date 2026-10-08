/** Compressed media lives only for one assessment; no decoded image objects are retained. */
export class SessionImageCache {
  private urls = new Map<string, string>()
  private controller = new AbortController()
  private pending = new Map<string, Promise<string>>()
  private sizes = new Map<string, number>()
  private usedBytes = 0
  private request: typeof fetch
  private limitBytes: number
  constructor(request: typeof fetch = fetch, limitBytes = 24 * 1024 * 1024) {
    // Chromium WebView 96 requires the native fetch receiver to remain Window.
    // Calling an unbound fetch as this.request() instead passes the cache object.
    this.request = request.bind(globalThis)
    this.limitBytes = limitBytes
  }
  get size() { return this.urls.size }
  get bytes() { return this.usedBytes }
  get(source: string) { return this.urls.get(source) }

  load(source: string, requestUrl: string): Promise<string> {
    const cached = this.urls.get(source)
    if (cached) return Promise.resolve(cached)
    const pending = this.pending.get(source)
    if (pending) return pending
    const loading = this.fetchImage(source, requestUrl)
    this.pending.set(source, loading)
    void loading.finally(() => {
      if (this.pending.get(source) === loading) this.pending.delete(source)
    }).catch(() => undefined)
    return loading
  }

  evict(source: string, expectedUrl: string) {
    if (this.urls.get(source) !== expectedUrl) return
    URL.revokeObjectURL(expectedUrl)
    this.urls.delete(source)
    this.usedBytes -= this.sizes.get(source) || 0
    this.sizes.delete(source)
  }

  private async fetchImage(source: string, requestUrl: string): Promise<string> {
    const cached = this.urls.get(source)
    if (cached) return cached
    const lifetime = this.controller.signal
    const request = new AbortController()
    const abort = () => request.abort()
    lifetime.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(abort, 25000)
    try {
      const response = await this.request(requestUrl, { signal: request.signal, cache: 'no-store' })
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('云端图片加载失败')
      const blob = await response.blob()
      if (lifetime.aborted) throw new Error('本次素材准备已取消')
      if (request.signal.aborted || blob.size === 0) throw new Error('云端图片加载超时或为空')
      if (this.usedBytes + blob.size > this.limitBytes) throw new Error('本次图片超过缓存上限，请联系工作人员优化素材')
      const url = URL.createObjectURL(blob)
      this.urls.set(source, url)
      this.sizes.set(source, blob.size)
      this.usedBytes += blob.size
      return url
    } finally {
      clearTimeout(timeout)
      lifetime.removeEventListener('abort', abort)
    }
  }

  clear() {
    this.controller.abort()
    this.controller = new AbortController()
    for (const url of this.urls.values()) URL.revokeObjectURL(url)
    this.urls.clear()
    this.pending.clear()
    this.sizes.clear()
    this.usedBytes = 0
  }
}
