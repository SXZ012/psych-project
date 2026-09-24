import { inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { CAMERA_SINK_KEY, type CameraSink } from '@/aviation/cameraSink'

/**
 * 预览组件注册视频元素：挂载时接上当前摄像头流，卸载时注销。
 * 没有提供方（演示页等）时静默不生效。
 */
export function useCameraSink() {
  const sink = inject<CameraSink | null>(CAMERA_SINK_KEY, null)
  const videoEl = ref<HTMLVideoElement | null>(null)
  let bound: HTMLVideoElement | null = null
  onMounted(() => {
    bound = videoEl.value
    if (bound) sink?.attach(bound)
  })
  onBeforeUnmount(() => {
    if (bound) sink?.detach(bound)
    bound = null
  })
  return videoEl
}
