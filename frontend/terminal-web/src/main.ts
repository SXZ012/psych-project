import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/terminal.css'

createApp(App).use(createPinia()).mount('#app')

// 原生启动层一直覆盖到 Vue 首屏真正提交到 WebView 合成层之后。
// 两次 requestAnimationFrame 避免 Android 11 WebView 在首次绘制时偶发露出黑帧。
requestAnimationFrame(() => requestAnimationFrame(() => {
  try {
    const bridge = (window as unknown as { AndroidCamera?: { notifyPageReady?: () => void } }).AndroidCamera
    bridge?.notifyPageReady?.()
  } catch {
    // 浏览器调试路径不存在原生桥，保持静默即可。
  }
}))
