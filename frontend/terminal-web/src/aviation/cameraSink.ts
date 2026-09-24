/**
 * 浏览器路径视频源注册表（provide/inject 键与类型）。
 *
 * 预览 <video> 随阶段切换销毁/重建；组件挂载时把元素注册进 sink，
 * 由 useBrowserCamera 接上当前流——阶段切换后预览不再黑屏。
 * 原生路径没有 <video>，不受影响。
 */
export interface CameraSink {
  attach: (el: HTMLVideoElement | null) => void
  detach: (el: HTMLVideoElement | null) => void
}
export const CAMERA_SINK_KEY: symbol = Symbol('aviation-camera-sink')
