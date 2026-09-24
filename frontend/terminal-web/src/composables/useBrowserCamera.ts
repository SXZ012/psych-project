import { ref } from 'vue'

/**
 * 浏览器摄像头：流获取/录制 + 视频元素动态绑定。
 *
 * 绑定修复：阶段切换会销毁/重建 <video>（就位页大预览 ↔ 顶部小预览），
 * 注册进 sink 的元素在挂载时（重新）接到当前流，卸载时注销——
 * 不再要求“start 时元素必须已存在”，杜绝切换后黑屏。
 */
export function useBrowserCamera() {
  const stream = ref<MediaStream | null>(null)
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let startedAt = 0
  const bound = new Set<HTMLVideoElement>()

  async function start(videoTargets: Array<HTMLVideoElement | null>) {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    videoTargets.filter(Boolean).forEach(target => attach(target))
  }

  /** 注册视频元素并接到当前流（元素挂载时调用；流可能尚未开启，开启时会统一接上） */
  function attach(el: HTMLVideoElement | null): void {
    if (!el || bound.has(el)) return
    bound.add(el)
    if (stream.value) { el.srcObject = stream.value; el.play().catch(() => undefined) }
  }
  function detach(el: HTMLVideoElement | null): void {
    if (el) bound.delete(el)
  }

  function startRecording() {
    if (!stream.value || (recorder && recorder.state !== 'inactive')) return false
    chunks = []; startedAt = performance.now()
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    recorder = new MediaRecorder(stream.value, { mimeType, videoBitsPerSecond: 1_500_000 })
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
    recorder.start(1000)
    return true
  }
  function stopRecording(): Promise<Blob | null> { return new Promise(resolve => {
    if (!recorder || recorder.state === 'inactive') return resolve(null)
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' })
      resolve(performance.now() - startedAt >= 30_000 && blob.size >= 50_000 ? blob : null)
    }
    recorder.requestData(); recorder.stop()
  }) }
  function stop() {
    if (recorder?.state === 'recording') recorder.stop()
    stream.value?.getTracks().forEach(track => track.stop())
    stream.value = null; recorder = null; chunks = []
    bound.forEach(el => { el.srcObject = null })
    bound.clear()
  }
  return { stream, start, attach, detach, startRecording, stopRecording, stop }
}
