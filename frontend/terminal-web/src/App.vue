<script setup lang="ts">
/**
 * 应用根：设备配置门控（按绑定场景启动）+ 场景外壳挂载。
 *
 * 管理入口说明：场景切换等管理能力不再由"左上角连点直接打开面板"提供——
 * 连点热区只出现在航空首页（AviationHome 内），唤起 StaffGate 认证，
 * 认证通过后才能执行设备配置（服务端口令校验，前端不隐藏按钮代替鉴权）。
 */
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AviationApp from '@/components/AviationApp.vue'
import CommunityFlow from '@/components/CommunityFlow.vue'
import DevGallery from '@/components/dev/DevGallery.vue'
import CommunityPreview from '@/components/dev/CommunityPreview.vue'
import { useDeviceConfig } from '@/composables/useDeviceConfig'
import { SCENE_SWITCHER_ENABLED } from '@/config/sceneSwitcher'

const device = useDeviceConfig()
// 开发演示入口：?demo=1 查看各阶段与异常状态（不录像/不提交）
const demoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')
const atSceneEntry = ref(true)
const communityPreview = SCENE_SWITCHER_ENABLED && new URLSearchParams(window.location.search).get('demo') === 'community'

function switchTestScene(scene: 'aviation' | 'community') {
  device.switchTestScene(scene)
}

// A kiosk stays open across deployments. Refresh only at the home entry, never during a paid session.
let versionTimer: ReturnType<typeof setInterval> | undefined
let checkingVersion = false
async function checkClientVersion() {
  if (import.meta.env.DEV || checkingVersion || !atSceneEntry.value || document.hidden || device.status.value !== 'ready') return
  const current = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src
  if (!current) return
  checkingVersion = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3000)
  try {
    const response = await fetch('/login/', { cache: 'no-store', signal: controller.signal })
    if (!response.ok) return
    const html = new DOMParser().parseFromString(await response.text(), 'text/html')
    const src = html.querySelector('script[type="module"][src]')?.getAttribute('src')
    if (src && atSceneEntry.value && !document.hidden && new URL(src, location.origin).href !== current) location.reload()
  } catch { /* Network interruption is handled by the existing resource gate. */ }
  finally { clearTimeout(timeout); checkingVersion = false }
}
onMounted(() => { versionTimer = setInterval(() => { void checkClientVersion() }, 60000) })
watch(atSceneEntry, value => { if (value) void checkClientVersion() })
onBeforeUnmount(() => clearInterval(versionTimer))

let nativeSplashNotified = false

// Android 原生启动页使用的就是登录背景图。必须等 Vue 已经渲染出最终首屏
// （首页或明确错误页）再移除它，避免“原生加载页 → 深色加载页 → 首页”的闪跳。
watch(() => device.status.value, async currentStatus => {
  if (nativeSplashNotified || currentStatus === 'loading') return
  nativeSplashNotified = true
  await nextTick()
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const bridge = (window as unknown as { AndroidCamera?: { notifyPageReady?: () => void } }).AndroidCamera
      bridge?.notifyPageReady?.()
    } catch {
      // 浏览器调试路径没有原生桥，不需要处理。
    }
  }))
}, { immediate: true })
</script>
<template>
  <!-- 浏览器路径人脸检测的隐藏输入源（两种场景共用） -->
  <video id="analysis-video" autoplay muted playsinline style="position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:-10px;top:-10px"></video>

  <!-- 已绑定设备但配置拉取失败：明确报错，绝不静默切到另一个场景 -->
  <main v-if="device.status.value === 'error'" class="terminal-shell device-error">
    <section class="de-card">
      <p class="eyebrow">DEVICE CONFIG</p>
      <h1>设备配置获取失败</h1>
      <p class="de-copy">{{ device.error.value }}</p>
      <p class="de-meta">设备标识：{{ device.deviceId.value || '未设置' }}</p>
      <button class="primary" @click="device.retry">重试</button>
      <button class="de-reset" @click="device.resetDevice">清除设备标识并刷新</button>
    </section>
  </main>

  <main v-else-if="device.status.value === 'loading'" class="terminal-shell device-loading">
    <div class="de-orbit"><i></i><i></i><i></i></div>
    <p>正在加载设备配置…</p>
  </main>

  <!-- 启动时按后台绑定的设备场景进入航空测评或社区服务。 -->
  <CommunityPreview v-else-if="communityPreview" />
  <CommunityFlow
    v-else-if="device.scene.value === 'community'"
    :device-id="device.deviceId.value || ''"
    :question-count="device.config.value?.questionCount"
    @entry-state="atSceneEntry = $event"
  />
  <!-- 开发演示画廊：?demo=1。纯展示 + mock 数据，不录像/不提交/不污染正式数据。 -->
  <DevGallery v-else-if="demoMode" />
  <AviationApp v-else @entry-state="atSceneEntry = $event" />

  <!-- 仅测试构建显示（VITE_ENABLE_SCENE_SWITCHER，生产构建编译期隐藏）：
       便于现场核验两套流程，不改变后台设备绑定。切换 = v-if 换组件，
       另一场景流程整体卸载并执行自身清理，回不到对方半路的临时状态。 -->
  <aside v-if="device.status.value === 'ready' && SCENE_SWITCHER_ENABLED && !demoMode && atSceneEntry" :class="['test-scene-switcher', `scene-${device.scene.value}`]" aria-label="测试场景切换">
    <span>测试场景</span>
    <button :class="{ active: device.scene.value === 'aviation' }" @click="switchTestScene('aviation')">航空</button>
    <button :class="{ active: device.scene.value === 'community' }" @click="switchTestScene('community')">社区</button>
  </aside>
</template>

<style scoped>
.device-error{display:grid;place-items:center}
.de-card{z-index:1;width:min(460px,calc(100vw - 48px));padding:36px;border-radius:24px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #00000070}
.de-card h1{margin:6px 0 8px;font-size:23px;color:#263c35;font-family:serif}
.de-copy{margin:0 0 10px;color:#a05252;font-size:14px;line-height:1.7}
.de-meta{margin:0 0 22px;color:#82918b;font-size:12px}
.de-card .primary{width:100%}
.de-reset{display:block;width:100%;margin-top:12px;border:0;background:transparent;color:#7d938a;font-size:13px;text-decoration:underline}
.device-loading{display:grid;place-items:center;gap:18px}
.device-loading p{color:#aab3cc;font-size:14px}
.de-orbit{position:relative;width:90px;height:90px}
.de-orbit i{position:absolute;inset:0;border-radius:50%;border:1px solid #9db2ec66;border-top-color:#9db2ec;animation:deSpin 1.1s linear infinite}
.de-orbit i:nth-child(2){inset:14px;animation-delay:.15s}
.de-orbit i:nth-child(3){inset:28px;animation-delay:.3s}
@keyframes deSpin{to{transform:rotate(360deg)}}
.test-scene-switcher{position:fixed;z-index:100;right:18px;bottom:18px;display:flex;align-items:center;gap:5px;padding:6px;border:1px solid rgba(214,236,244,.35);border-radius:999px;background:rgba(8,26,43,.82);box-shadow:0 8px 22px rgba(0,0,0,.24);backdrop-filter:blur(10px);color:#bad4e1;font-size:12px}.test-scene-switcher span{padding:0 7px}.test-scene-switcher button{min-height:36px;padding:0 14px;border:1px solid transparent;border-radius:999px;color:#c6dce7;background:transparent;font-size:14px}.test-scene-switcher button.active{border-color:rgba(140,231,202,.75);color:#effff9;background:rgba(63,166,139,.42)}
.test-scene-switcher.scene-aviation{color:#526d7d;background:rgba(239,246,249,.95);border-color:#c3d4dc;box-shadow:0 5px 16px rgba(38,71,88,.14)}
.test-scene-switcher.scene-aviation button{color:#587487}
.test-scene-switcher.scene-aviation button.active{color:#fff;background:#47758c;border-color:#47758c;box-shadow:0 3px 8px rgba(47,93,124,.2)}
.test-scene-switcher.scene-community{color:#687b73;background:rgba(245,248,245,.96);border-color:#cfdcd5;box-shadow:0 6px 18px rgba(48,78,67,.14)}
.test-scene-switcher.scene-community button{color:#597067}
.test-scene-switcher.scene-community button.active{color:#fff;background:#397866;border-color:#397866;box-shadow:0 3px 8px rgba(43,102,84,.2)}
</style>
