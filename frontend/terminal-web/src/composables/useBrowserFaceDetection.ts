type FaceResult = { count:number; xCenter?:number; yCenter?:number; width?:number; height?:number; error?:string }

export function useBrowserFaceDetection(onResult: (result: FaceResult) => void) {
  let detector: any = null
  let timer: number | null = null
  let busy = false

  async function start(video: HTMLVideoElement) {
    try {
      const modulePath = '/static/vendor/mediapipe/vision_bundle.mjs'
      const vision = await import(/* @vite-ignore */ modulePath)
      const fileset = await vision.FilesetResolver.forVisionTasks('/static/vendor/mediapipe/wasm')
      detector = await vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: '/static/vendor/mediapipe/face_detector.task', delegate: 'CPU' },
        runningMode: 'VIDEO', minDetectionConfidence: .60,
      })
      const run = () => {
        if (!detector) return
        if (!busy && video.readyState >= 2) {
          busy = true
          try {
            const detections = detector.detectForVideo(video, performance.now())?.detections || []
            if (!detections.length) onResult({ count: 0 })
            else {
              const box = detections[0].boundingBox || detections[0].locationData?.relativeBoundingBox
              if (!box) onResult({ count: detections.length })
              else {
                const sw = video.videoWidth || 1, sh = video.videoHeight || 1
                let width = Number(box.width || 0), height = Number(box.height || 0), xCenter:number, yCenter:number
                if (box.originX !== undefined || width > 1 || height > 1) { xCenter = (Number(box.originX || 0) + width / 2) / sw; yCenter = (Number(box.originY || 0) + height / 2) / sh; width /= sw; height /= sh }
                else { xCenter = box.xCenter !== undefined ? Number(box.xCenter) : Number(box.xmin || 0) + width / 2; yCenter = box.yCenter !== undefined ? Number(box.yCenter) : Number(box.ymin || 0) + height / 2 }
                onResult({ count: detections.length, xCenter, yCenter, width, height })
              }
            }
          } catch (error) { onResult({ count: 0, error: `人脸检测异常：${String(error)}` }) } finally { busy = false }
        }
        timer = window.setTimeout(run, 200)
      }
      run()
    } catch { onResult({ count: 0, error: '人脸检测初始化失败，请联系现场工作人员' }) }
  }

  function stop() { if (timer) window.clearTimeout(timer); timer = null; try { detector?.close() } catch { /* no-op */ }; detector = null }
  return { start, stop }
}
