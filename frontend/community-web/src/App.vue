<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

type Report = { id: string; created_at: string | null; status: 'analyzing' | 'completed' | 'failed'; status_label: string; has_pdf: boolean }
const tokenKey = 'psych.community.customer_token'
const token = ref(localStorage.getItem(tokenKey) || '')
// 仅开发联调：终端“模拟支付”没有真实手机用户时，可用固定 mock_code
// 重新登录为该笔订单绑定的 Mock 用户。真实服务号模式不会使用此参数。
const mockCodeFromUrl = new URLSearchParams(location.search).get('mock_code') || ''
const terminalMode = new URLSearchParams(location.search).get('terminal') === '1'
const reports = ref<Report[]>([])
const report = ref<Report | null>(null)
const loading = ref(false)
const error = ref('')
let refreshTimer: number | null = null
const isDetail = computed(() => /^\/community\/reports\/[^/]+\/?$/.test(location.pathname))
const reportId = computed(() => {
  if (!isDetail.value) return ''
  const parts = location.pathname.split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
})

function headers() { return { Authorization: `Bearer ${token.value}` } }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
function statusClass(value: string) { return `status status--${value}` }
function mockCode() {
  if (mockCodeFromUrl) return mockCodeFromUrl
  // Android 旧 WebView / 部分国产浏览器没有 crypto.randomUUID。
  const random = Math.random().toString(36).slice(2)
  return `mock-community-h5-${Date.now().toString(36)}-${random}`
}

async function mockLogin() {
  loading.value = true; error.value = ''
  try {
    const response = await fetch('/api/v1/community/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: mockCode() }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.detail || '登录失败')
    token.value = body.token; localStorage.setItem(tokenKey, body.token)
    await load()
  } catch (e) { error.value = e instanceof Error ? e.message : '登录失败' } finally { loading.value = false }
}

async function load() {
  if (!token.value) return
  loading.value = true; error.value = ''
  try {
    const path = reportId.value ? `/api/v1/community/me/reports/${reportId.value}` : '/api/v1/community/me/reports'
    const response = await fetch(path, { headers: headers() })
    const body = await response.json()
    if (!response.ok) throw new Error(body.detail || '获取报告失败')
    if (reportId.value) {
      report.value = body as Report
      if (report.value.status === 'analyzing') scheduleRefresh()
    }
    else reports.value = body.reports as Report[]
  } catch (e) { error.value = e instanceof Error ? e.message : '获取报告失败' } finally { loading.value = false }
}
function scheduleRefresh() {
  if (refreshTimer) window.clearTimeout(refreshTimer)
  refreshTimer = window.setTimeout(() => { void load() }, 5000)
}

async function download() {
  if (!report.value?.has_pdf) return
  const response = await fetch(`/api/v1/community/me/reports/${report.value.id}/download-url`, { headers: headers() })
  const body = await response.json()
  if (!response.ok) { error.value = body.detail || '暂时无法下载报告'; return }
  window.location.assign(body.url)
}
function openReport(id: string) { location.assign(`/community/reports/${id}${terminalMode ? '?terminal=1' : ''}`) }
function goToReports() { window.location.assign(`/community/reports${terminalMode ? '?terminal=1' : ''}`) }
function goTerminalHome() { window.location.assign('/login/') }
function logout() { localStorage.removeItem(tokenKey); token.value = ''; reports.value = []; report.value = null }
onMounted(() => {
  if (!token.value && mockCodeFromUrl) void mockLogin()
  else void load()
})
onBeforeUnmount(() => { if (refreshTimer) window.clearTimeout(refreshTimer) })
</script>

<template>
  <main class="page"><header><button v-if="terminalMode" class="terminal-home" @click="goTerminalHome">← 返回首页</button><div class="brand">心理状态辅助测评</div><button v-if="token" class="text" @click="logout">退出</button></header>
    <section v-if="!token" class="card center"><h1>查看我的报告</h1><p>请使用测评时的微信身份登录。当前开发阶段可使用模拟登录。</p><button :disabled="loading" @click="mockLogin">{{ loading ? '登录中…' : '模拟登录' }}</button></section>
    <template v-else-if="isDetail"><button class="back" @click="goToReports">‹ 我的报告</button><section class="card" v-if="report"><span :class="statusClass(report.status)">{{ report.status_label }}</span><h1>心理状态辅助测评报告</h1><p class="date">测评时间：{{ formatDate(report.created_at) }}</p><p class="report-id">报告编号：{{ report.id.toUpperCase() }}</p><div v-if="report.status === 'completed'" class="notice"><h2>报告已经准备好</h2><p>报告包含结果总览、情绪状态参考、核心指标和生活建议。</p><button :disabled="!report.has_pdf" @click="download">查看并下载 PDF</button></div><div v-else-if="report.status === 'analyzing'" class="notice"><h2>正在生成个人报告</h2><div class="progress"><i /></div><p>通常需要 3 至 4 分钟。本页面会自动更新，您可以暂时离开后再回来查看。</p><button class="secondary" @click="load">立即刷新</button></div><div v-else class="notice"><p>本次结果暂不建议解释。如有持续困扰，请咨询专业心理或医疗人员。</p></div><div class="next-services"><b>报告之外，您还可以</b><span>短时情绪放松</span><span>阅读心理知识</span><span>联系社区服务</span></div><p class="disclaimer">本测评仅作个人心理状态辅助参考，不构成医学诊断或治疗建议。</p></section></template>
    <section v-else class="card"><h1>我的报告</h1><p class="muted">仅展示您本人在心理社区场景完成的测评。</p><div v-if="!loading && !reports.length" class="empty">暂时没有可查看的报告</div><button v-for="item in reports" :key="item.id" class="report-row" @click="openReport(item.id)"><span><b>心理测评报告</b><small>{{ formatDate(item.created_at) }}</small></span><i :class="statusClass(item.status)">{{ item.status_label }}</i><em>›</em></button></section>
    <p v-if="error" class="error">{{ error }}</p><p v-if="loading && token" class="loading">正在加载…</p>
  </main>
</template>
