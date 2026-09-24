import { ref } from 'vue'
import { SCENE_SWITCHER_ENABLED } from '@/config/sceneSwitcher'
import type { DeviceSceneConfig } from '@/types/community'

/**
 * 终端设备配置：启动时按后台绑定的场景加载对应服务。
 *
 * 规则：
 * - 后端 Device 配置决定终端启动场景：航空设备直达航空测评，社区设备直达社区服务。
 *   工作人员认证后仍可现场切换场景，用于维护与演示。
 *   query 里的 device_id 只用于"首次绑定设备标识"，绑定后立即写入
 *   localStorage 并从 URL 清除。
 * - 未绑定设备标识的终端按 aviation 处理（与既有航空设备行为完全一致）。
 * - 已绑定但配置拉取失败时，先安全回退到默认航空首页；不会自动进入社区、
 *   不会绕过支付。这样后端短暂不可达或设备配置失效时，终端也不会卡死在错误页。
 */

const DEVICE_STORAGE_KEY = 'psych.device_id'
const DEVICE_TOKEN_STORAGE_KEY = 'psych.device_token'
const CONFIG_REQUEST_TIMEOUT_MS = 4500

export type DeviceLoadStatus = 'loading' | 'ready' | 'error'

const deviceId = ref<string | null>(null)
const deviceToken = ref<string>('')
const scene = ref<'aviation' | 'community'>('aviation')
const config = ref<DeviceSceneConfig | null>(null)
const status = ref<DeviceLoadStatus>('loading')
const error = ref('')
/** 后端环境是否为开发环境（/health 的 env 字段）；生产环境隐藏一切调试入口 */
const isDevEnv = ref(false)
const configuredScene = ref<'aviation' | 'community'>('aviation')

function consumeDeviceIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  const fromQuery = params.get('device_id') || params.get('device')
  // 设备密钥由原生启动层随 device_id 一次性注入，持久化后立即从 URL 清除
  const tokenFromQuery = params.get('device_token') || params.get('token')
  if (fromQuery || tokenFromQuery) {
    if (fromQuery) window.localStorage.setItem(DEVICE_STORAGE_KEY, fromQuery)
    if (tokenFromQuery) window.localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, tokenFromQuery)
    params.delete('device_id')
    params.delete('device')
    params.delete('device_token')
    params.delete('token')
    const query = params.toString()
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`
    window.history.replaceState(null, '', next)
    return fromQuery ?? window.localStorage.getItem(DEVICE_STORAGE_KEY)
  }
  return window.localStorage.getItem(DEVICE_STORAGE_KEY)
}

async function load() {
  status.value = 'loading'
  error.value = ''
  const id = deviceId.value ?? consumeDeviceIdFromUrl()
  deviceId.value = id
  deviceToken.value = window.localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) || ''

  // 健康检查只影响调试标记，绝不能阻塞终端登录首屏。
  // 旧逻辑即使没有 device_id 也会等待一次网络往返，弱网下会多出明显卡顿。
  void fetch('/health')
    .then(response => response.json().catch(() => ({})))
    .then(body => { isDevEnv.value = String(body.env || '').toLowerCase() !== 'prod' })
    .catch(() => { isDevEnv.value = false })

  // 未绑定设备标识：按航空终端处理（历史行为，兼容存量航空设备）
  if (!id) {
    scene.value = 'aviation'
    configuredScene.value = 'aviation'
    config.value = null
    status.value = 'ready'
    return
  }

  try {
    const headers: Record<string, string> = {}
    if (deviceToken.value) headers['X-Device-Token'] = deviceToken.value
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), CONFIG_REQUEST_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(`/api/v1/session/config?device_id=${encodeURIComponent(id)}`, {
        headers,
        signal: controller.signal,
      })
    } finally {
      window.clearTimeout(timeout)
    }
    const body = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(body.detail || `设备配置获取失败（${response.status}）`)
    }
    const parsed = {
      scene: body.scene === 'community' ? 'community' : 'aviation',
      deviceName: body.device_name ?? null,
      deviceLocation: body.device_location ?? null,
      needPayment: Boolean(body.need_payment),
      needVideo: Boolean(body.need_video),
      needFaceCheck: Boolean(body.need_face_check),
      questionCount: Number(body.question_count) || 6,
      questionDuration: Number(body.question_duration) || 10,
      reportType: String(body.report_type || 'admin'),
      phases: Array.isArray(body.phases) ? body.phases.map(String) : [],
    } satisfies DeviceSceneConfig
    configuredScene.value = parsed.scene
    scene.value = parsed.scene
    config.value = parsed
    status.value = 'ready'
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设备配置获取失败'
    // 设备配置只决定“能否额外进入社区场景”，不能阻塞默认测评终端。
    // config 保持为空，因此即使回退首页也没有进入社区或绕过支付的可能。
    configuredScene.value = 'aviation'
    scene.value = 'aviation'
    config.value = null
    status.value = 'ready'
  }
}

function enterCommunity() {
  if (configuredScene.value !== 'community' || !config.value) {
    error.value = '当前设备未绑定心理社区场景'
    return false
  }
  scene.value = 'community'
  return true
}

function exitToAviation() {
  scene.value = 'aviation'
}

/**
 * 现场演示切换（航空⇄社区），不写回设备后台绑定。
 * 仅测试构建开放（VITE_ENABLE_SCENE_SWITCHER=true）；生产构建编译期关闭，
 * 不依赖后端环境字段。管理员切换走 StaffGate 认证路径，与此无关。
 */
function switchTestScene(nextScene: 'aviation' | 'community') {
  if (!SCENE_SWITCHER_ENABLED) return false
  scene.value = nextScene
  return true
}

function resetDevice() {
  window.localStorage.removeItem(DEVICE_STORAGE_KEY)
  window.localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY)
  window.location.reload()
}

// 模块级单例：App 与各流程共享同一次加载结果
void load()

export function useDeviceConfig() {
  return {
    deviceId, deviceToken, scene, configuredScene, config, status, error, isDevEnv,
    retry: load, resetDevice, enterCommunity, exitToAviation, switchTestScene,
  }
}
