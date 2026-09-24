<script setup lang="ts">
/**
 * 工作人员入口：连点热区只负责唤起本组件；未通过认证不得进行任何管理操作。
 *
 * - 认证 = 本地管理密码 → 服务端 /admin/login（administrator 角色 cookie 会话）；
 *   服务端未通过前，任何配置/任务接口都会 401（不靠前端隐藏按钮）；
 * - 面板能力：设备/场景/版本、网络检查、待处理失败任务列表 + 安全重试、场景切换；
 * - 退出时调用 /admin/logout 清除管理会话（多人共用终端的隐私要求）。
 */
import { onBeforeUnmount, ref } from 'vue'
import { useDeviceConfig } from '@/composables/useDeviceConfig'
import { MESSAGES } from '@/aviation/messages'

const emit = defineEmits<{ close: [] }>()
const device = useDeviceConfig()

const stage = ref<'auth' | 'panel'>('auth')
const password = ref('')
const authing = ref(false)
const authError = ref('')
const networkOk = ref<boolean | null>(null)
const tasks = ref<Array<{
  assessment_id: string; stage: string; status: string; attempts: number
  max_attempts: number; uncertain_remote: boolean; last_error: string | null
}>>([])
const taskFilter = ref<'active' | 'dead' | 'uncertain'>('active')
const taskMessage = ref('')
let authed = false

async function authenticate() {
  if (!password.value.trim()) return
  authing.value = true; authError.value = ''
  try {
    const response = await fetch('/api/v1/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value, role: 'administrator' }),
    })
    if (!response.ok) { authError.value = MESSAGES.staff.authFailed; return }
    authed = true
    stage.value = 'panel'
    void checkNetwork()
    void loadTasks()
  } catch {
    authError.value = '网络异常，请检查后端连接'
  } finally {
    authing.value = false
  }
}

async function checkNetwork() {
  try {
    const response = await fetch('/api/v1/health', { cache: 'no-store' })
    networkOk.value = response.ok
  } catch {
    networkOk.value = false
  }
}

async function loadTasks() {
  try {
    const response = await fetch(`/api/v1/admin/tasks?status_filter=${taskFilter.value}`, { cache: 'no-store' })
    if (!response.ok) return
    tasks.value = await response.json()
  } catch { /* 面板静默失败，重试按钮可手动再拉 */ }
}

async function retryTask(assessmentId: string) {
  taskMessage.value = ''
  try {
    const response = await fetch(`/api/v1/admin/tasks/${assessmentId}/retry`, { method: 'POST' })
    taskMessage.value = response.ok ? MESSAGES.staff.taskRetried : '重试失败'
    if (response.ok) await loadTasks()
  } catch {
    taskMessage.value = '网络异常'
  }
}

function switchScene(scene: 'aviation' | 'community') {
  if (scene === 'community') device.enterCommunity()
  else device.exitToAviation()
}

async function logout() {
  try { await fetch('/api/v1/admin/logout', { method: 'POST' }) } catch { /* 清理尽力而为 */ }
  authed = false
  password.value = ''
  stage.value = 'auth'
  emit('close')
}

onBeforeUnmount(() => { if (authed) void fetch('/api/v1/admin/logout', { method: 'POST' }).catch(() => undefined) })
</script>

<template>
  <div class="staff-backdrop" @click.self="emit('close')">
    <!-- 第一步：认证（未认证不出现在任何管理功能） -->
    <section v-if="stage === 'auth'" class="staff-card staff-card--auth">
      <h2>{{ MESSAGES.staff.authTitle }}</h2>
      <p>{{ MESSAGES.staff.authIntro }}</p>
      <form @submit.prevent="authenticate">
        <label>
          {{ MESSAGES.staff.passwordLabel }}
          <input v-model="password" type="password" autocomplete="off" />
        </label>
        <p v-if="authError" class="staff-error" role="alert">{{ authError }}</p>
        <button class="primary" type="submit" :disabled="authing || !password.trim()">
          {{ authing ? '认证中…' : MESSAGES.staff.authButton }}
        </button>
      </form>
      <button class="staff-cancel" type="button" @click="emit('close')">取消</button>
    </section>

    <!-- 第二步：现场管理面板（administrator 已认证） -->
    <section v-else class="staff-card staff-card--panel">
      <header>
        <h2>{{ MESSAGES.staff.panelTitle }}</h2>
        <button class="staff-close" @click="emit('close')">×</button>
      </header>

      <div class="staff-grid">
        <div class="staff-row">
          <span>{{ MESSAGES.staff.panelDevice }}</span>
          <b>{{ device.deviceId.value || '未绑定' }}</b>
        </div>
        <div class="staff-row">
          <span>{{ MESSAGES.staff.panelScene }}</span>
          <b>{{ device.scene.value === 'community' ? '心理社区' : '航空' }}</b>
        </div>
        <div class="staff-row">
          <span>{{ MESSAGES.staff.panelVersion }}</span>
          <b>{{ device.config.value?.scene ?? 'aviation' }}</b>
        </div>
        <div class="staff-row">
          <span>网络检查</span>
          <b :class="{ ok: networkOk === true, bad: networkOk === false }">
            {{ networkOk === null ? '检查中…' : networkOk ? MESSAGES.staff.networkOk : MESSAGES.staff.networkBad }}
          </b>
        </div>
      </div>

      <div class="staff-scenes">
        <button @click="switchScene('aviation')">{{ MESSAGES.staff.sceneAviation }}</button>
        <button :disabled="device.config.value?.scene !== 'community'" @click="switchScene('community')">
          {{ MESSAGES.staff.sceneCommunity }}
        </button>
      </div>

      <div class="staff-tasks">
        <header>
          <h3>{{ MESSAGES.staff.panelTasks }}</h3>
          <div class="staff-filters">
            <button v-for="f in (['active','dead','uncertain'] as const)" :key="f"
                    :class="{ active: taskFilter === f }" @click="taskFilter = f; loadTasks()">
              {{ f === 'active' ? '进行中/失败' : f === 'dead' ? '超限' : '远端不确定' }}
            </button>
          </div>
        </header>
        <p v-if="taskMessage" class="staff-note">{{ taskMessage }}</p>
        <p v-if="!tasks.length" class="staff-empty">当前没有该类任务</p>
        <ul v-else>
          <li v-for="task in tasks" :key="task.assessment_id">
            <div class="staff-task__main">
              <b>{{ task.assessment_id.slice(0, 8) }}</b>
              <span>{{ task.stage }} · {{ task.status }} · {{ task.attempts }}/{{ task.max_attempts }}</span>
              <span v-if="task.uncertain_remote" class="staff-task__uncertain">远端不确定</span>
            </div>
            <p v-if="task.last_error" class="staff-task__error">{{ task.last_error.slice(0, 80) }}</p>
            <button :disabled="task.uncertain_remote && task.status !== 'failed'" @click="retryTask(task.assessment_id)">
              {{ MESSAGES.staff.taskRetry }}
            </button>
          </li>
        </ul>
      </div>

      <footer>
        <button class="staff-logout" @click="logout">{{ MESSAGES.staff.exit }}（清除管理会话）</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.staff-backdrop{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:#04070ed9;overflow:auto;padding:24px}
.staff-card{width:min(640px,100%);padding:28px 32px;border-radius:22px;background:#101e30;display:grid;gap:14px;color:var(--tx-medium,#c6d0e8)}
.staff-card--auth{width:min(420px,100%);text-align:center}
.staff-card h2{margin:0;font-size:20px;color:#fff}
.staff-card--auth p{margin:0;font-size:var(--fs-caption,13px);color:var(--tx-soft,#a6bed3)}
.staff-card--auth form{display:grid;gap:10px;margin-top:6px}
.staff-card--auth label{display:grid;gap:8px;font-size:var(--fs-caption,13px)}
.staff-card--auth input{min-height:52px;padding:0 16px;border:1px solid #a7c1d64d;border-radius:12px;background:#0a1524;color:#fff;font-size:18px;outline:0}
.staff-error{margin:0;color:#fca5a5;font-size:var(--fs-caption,13px)}
.staff-cancel{border:0;background:transparent;color:var(--tx-faint,#96aebf);font-size:var(--fs-caption,13px);text-decoration:underline}
.staff-card--panel header{display:flex;justify-content:space-between;align-items:center}
.staff-close{border:0;background:transparent;color:#fff;font-size:24px}
.staff-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.staff-row{display:flex;justify-content:space-between;gap:10px;padding:8px 12px;border:1px solid #ffffff1f;border-radius:10px;font-size:var(--fs-caption,13px)}
.staff-row span{color:var(--tx-faint,#96aebf)}
.staff-row b.ok{color:#8df0bb}
.staff-row b.bad{color:#fca5a5}
.staff-scenes{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.staff-scenes button{min-height:46px;border:1px solid #a7c1d64d;border-radius:10px;background:#ffffff0d;color:var(--tx-medium,#c6d0e8);font-size:var(--fs-caption,13px)}
.staff-tasks{display:grid;gap:8px}
.staff-tasks header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px}
.staff-tasks h3{margin:0;font-size:15px;color:#fff}
.staff-filters{display:flex;gap:6px}
.staff-filters button{padding:4px 10px;border:1px solid #ffffff2f;border-radius:999px;background:transparent;color:var(--tx-faint,#96aebf);font-size:var(--fs-micro,11px)}
.staff-filters button.active{border-color:#86dfb4;color:#cfe8dc}
.staff-note{margin:0;color:#8df0bb;font-size:var(--fs-micro,12px)}
.staff-empty{margin:0;color:var(--tx-faint,#96aebf);font-size:var(--fs-caption,13px)}
.staff-tasks ul{list-style:none;margin:0;padding:0;display:grid;gap:8px;max-height:220px;overflow:auto}
.staff-tasks li{display:grid;gap:6px;padding:10px 12px;border:1px solid #ffffff1f;border-radius:10px}
.staff-task__main{display:flex;align-items:center;gap:10px;font-size:var(--fs-micro,12px)}
.staff-task__main b{color:#fff;font-family:ui-monospace,monospace}
.staff-task__uncertain{padding:1px 8px;border-radius:999px;background:#f5be5026;color:#ffe0a0}
.staff-task__error{margin:0;color:#fca5a5b3;font-size:var(--fs-micro,11px);word-break:break-all}
.staff-tasks li>button{justify-self:start;padding:6px 16px;border:1px solid #a7c1d64d;border-radius:999px;background:transparent;color:var(--tx-medium,#c6d0e8);font-size:var(--fs-micro,12px)}
.staff-tasks li>button:disabled{opacity:.4}
.staff-logout{width:100%;min-height:46px;border:1px solid #f8717155;border-radius:10px;background:transparent;color:#fca5a5;font-size:var(--fs-caption,13px)}
</style>
