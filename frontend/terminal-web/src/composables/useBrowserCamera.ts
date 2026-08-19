import { ref } from 'vue'

export function useBrowserCamera() {
  const stream = ref<MediaStream | null>(null)
  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let startedAt = 0

  async function start(videoTargets: Array<HTMLVideoElement | null>) {
    stream.value = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    videoTargets.filter(Boolean).forEach(target => { if (target) { target.srcObject = stream.value; target.play().catch(() => undefined) } })
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
  function stop() { if (recorder?.state === 'recording') recorder.stop(); stream.value?.getTracks().forEach(track => track.stop()); stream.value = null; recorder = null; chunks = [] }
  return { stream, start, startRecording, stopRecording, stop }
}
