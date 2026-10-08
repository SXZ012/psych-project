<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import PersonalReport from '@/components/report/PersonalReport.vue'
import PrivacyIdleGuard from '@/components/common/PrivacyIdleGuard.vue'
import NavigationButton from '@/components/common/NavigationButton.vue'
import type { ReportPayload } from '@/composables/useReportLookup'
import { forgetAccess, rememberAccess, restoreAccess } from './reportAccess'

type Receipt = { id?: string; report_id: string; status: string; status_label?: string; submitted_at?: string; has_pdf: boolean; is_demo?: boolean; pdf_status?: string; access_token?: string; report?: ReportPayload }
const api = '/api/v1/community/report-center'
const params = new URLSearchParams(location.search)
const terminal = params.get('terminal') === '1'
const session = ref(params.get('session_id') || '')
const legacyId = /\/reports\/([0-9a-f-]{36})\/?$/i.exec(location.pathname)?.[1] || ''
let mobileStorage: Storage | null = null
let customerToken = ''
try {
  if (!terminal) { mobileStorage = localStorage; customerToken = mobileStorage.getItem('psych.community.customer_token') || '' }
} catch { mobileStorage = null /* The access URL works without storage. */ }
const grant = ref(new URLSearchParams(location.hash.slice(1)).get('access') || '')
const savedAccess = !mobileStorage || grant.value || session.value || legacyId ? null : restoreAccess(mobileStorage)
if (savedAccess) { grant.value = savedAccess.token; session.value = savedAccess.session }
const centerOpen = ref(params.get('view') === 'center' || (!grant.value && !session.value && !legacyId))
const lookupExpanded = ref(false)
const receipt = ref<Receipt | null>(null)
const code = ref('')
const busy = ref(false)
const error = ref('')
const shareOpen = ref(false)
const remaining = ref(300)
let poll: number | undefined
let clock: number | undefined
let requestVersion = 0
let lastInteraction = Date.now()
let controller: AbortController | undefined
const shareUrl = computed(() => `${location.origin}/community/reports#access=${grant.value}`)
const qr = computed(() => {
  if (!grant.value) return ''
  const image = qrcode(0, 'M'); image.addData(shareUrl.value); image.make()
  return image.createSvgTag({ cellSize: 4, margin: 16, scalable: true })
})
const date = computed(() => receipt.value?.submitted_at ? new Date(receipt.value.submitted_at).toLocaleString('zh-CN', { hour12: false }) : '')
const needsRefresh = computed(() => receipt.value && (['processing', 'awaiting_assessment'].includes(receipt.value.status) || (receipt.value.status === 'completed' && !receipt.value.has_pdf && receipt.value.pdf_status !== 'failed')))
const delayed = computed(() => receipt.value?.status === 'processing' && !!receipt.value.submitted_at && Date.now() - new Date(receipt.value.submitted_at).getTime() > 4 * 60_000)
const showingReport = computed(() => !!receipt.value && (terminal || !centerOpen.value))
const recentStatus = computed(() => receipt.value?.status === 'completed' ? '报告已生成' : receipt.value?.status === 'processing' ? '分析中' : receipt.value?.status === 'awaiting_assessment' ? '等待完成测评' : '本次报告暂不可用')
const recentHint = computed(() => {
  const current = receipt.value
  if (current?.status === 'completed') return current.has_pdf ? '报告已准备好，可继续阅读或保存 PDF。' : current.pdf_status === 'failed' ? '可以在线阅读。PDF 暂不可用，请联系现场工作人员。' : '可以先阅读报告，PDF 正在准备，完成后即可保存。'
  if (current?.status === 'processing') return '结果生成后会自动更新，无需重新输入报告编号。'
  if (current?.status === 'awaiting_assessment') return '请先在终端完成测评，再从这里查看结果。'
  return '记录已保留，请联系现场工作人员协助处理。'
})
function interact() { lastInteraction = Date.now(); remaining.value = 300 }
function enter(key: string) { code.value = (code.value + key).slice(0, 8); error.value = '' }
function normalize() { code.value = code.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8); error.value = '' }
function reset() {
  requestVersion++; controller?.abort(); clearTimeout(poll)
  grant.value = ''; session.value = ''; receipt.value = null; code.value = ''; error.value = ''; shareOpen.value = false; busy.value = false
  history.replaceState(null, '', '/community/reports' + (terminal ? '?terminal=1' : ''))
  interact()
}
function home() { reset(); location.assign('/login/') }
function updateMobileUrl(push = false) {
  if (terminal) return
  const query = new URLSearchParams()
  if (centerOpen.value) query.set('view', 'center')
  if (!grant.value && session.value) query.set('session_id', session.value)
  const search = query.toString()
  const url = '/community/reports' + (search ? '?' + search : '') + (grant.value ? '#access=' + encodeURIComponent(grant.value) : '')
  if (url !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', url)
}
function openCenter(other = false) {
  centerOpen.value = true; lookupExpanded.value = other; error.value = ''; shareOpen.value = false
  updateMobileUrl(true)
}
function openCurrent() {
  centerOpen.value = false; lookupExpanded.value = false; error.value = ''
  updateMobileUrl(true)
  void load()
}
function onHistory() {
  centerOpen.value = new URLSearchParams(location.search).get('view') === 'center'
  lookupExpanded.value = false
}
async function load(lookup = false) {
  if (busy.value) return
  if (lookup && code.value.length !== 8) { error.value = '请输入完整的 8 位报告编号'; return }
  const version = ++requestVersion
  controller = new AbortController()
  const timeout = window.setTimeout(() => controller?.abort(), 15000)
  clearTimeout(poll); busy.value = true; error.value = ''
  try {
    let url = `${api}/view?token=${encodeURIComponent(grant.value)}`
    let options: RequestInit = { signal: controller.signal, cache: 'no-store' }
    if (lookup) {
      url = `${api}/lookup`
      options = { ...options, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report_id: code.value }) }
    } else if (!grant.value && session.value) url = `${api}/session/${encodeURIComponent(session.value)}`
    else if (!grant.value && legacyId && customerToken) {
      url = `${api}/mine/${legacyId}`
      options.headers = { Authorization: `Bearer ${customerToken}` }
    } else if (!grant.value) return
    const response = await fetch(url, options)
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401 && !lookup) {
        if (mobileStorage) forgetAccess(mobileStorage)
        grant.value = ''; session.value = ''; receipt.value = null; centerOpen.value = true
        updateMobileUrl()
      }
      throw new Error(typeof data.detail === 'string' ? data.detail : '暂时无法查询，请稍后再试')
    }
    if (version !== requestVersion) return
    receipt.value = data
    if (data.access_token) grant.value = data.access_token
    if (!terminal) {
      if (mobileStorage) rememberAccess(mobileStorage, grant.value, session.value)
      if (lookup) { centerOpen.value = false; lookupExpanded.value = false }
      updateMobileUrl()
    }
  } catch (e) {
    if (version === requestVersion) error.value = e instanceof Error && e.name !== 'AbortError' ? e.message : '连接暂时中断，请重试'
  } finally {
    clearTimeout(timeout)
    if (version === requestVersion) {
      busy.value = false
      if (needsRefresh.value || (!lookup && session.value && !receipt.value)) poll = window.setTimeout(() => void load(), 5000)
    }
  }
}
function pdf(download: boolean) {
  const url = `${api}/pdf?token=${encodeURIComponent(grant.value)}&download=${download}`
  const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'
  document.body.append(link); link.click(); link.remove()
}
onMounted(() => {
  if (grant.value || session.value || (legacyId && customerToken)) void load()
  if (!terminal) window.addEventListener('popstate', onHistory)
  // Terminal never restores the previous user's mobile login or report.
  if (terminal) {
    try { localStorage.removeItem('psych.community.customer_token') } catch { /* No previous identity to clear. */ }
    clock = window.setInterval(() => {
      remaining.value = Math.max(0, 300 - Math.floor((Date.now() - lastInteraction) / 1000))
    }, 1000)
  }
})
onBeforeUnmount(() => { requestVersion++; controller?.abort(); clearTimeout(poll); clearInterval(clock); window.removeEventListener('popstate', onHistory) })
</script>

<template>
  <PrivacyIdleGuard v-if="terminal" @expire="home" />
  <main class="report-center" :class="{ 'is-terminal': terminal, 'is-reading': showingReport && receipt?.report }" @pointerdown="interact" @keydown="interact" @scroll.capture="interact">
    <header class="center-header">
      <NavigationButton v-if="terminal || (showingReport && !centerOpen)" @click="terminal ? home() : openCenter()">{{ terminal ? '返回首页' : '报告中心' }}</NavigationButton>
      <div class="center-brand">我的测评报告 <small v-if="receipt?.report_id">{{ receipt.report_id }}</small></div>
      <template v-if="showingReport && receipt">
        <span v-if="terminal" class="clear-note">{{ remaining }} 秒无操作后清屏</span>
        <button v-if="terminal && grant" @click="shareOpen = true">手机查看 / 下载</button>
        <button v-if="!terminal && receipt.has_pdf" class="quiet" @click="pdf(false)">查看 PDF</button>
        <button v-if="!terminal && receipt.has_pdf" @click="pdf(true)">下载 PDF</button>
        <button v-if="terminal" class="quiet" @click="reset">退出报告</button>
      </template>
    </header>
    <div v-if="error" role="alert" class="error-banner">{{ error }} <button v-if="receipt || session || grant" class="quiet" @click="load()">重新连接</button></div>
    <div v-if="showingReport && receipt?.is_demo" class="demo-note">演示报告 · 模拟数据，仅用于流程展示</div>
    <div v-if="showingReport && receipt?.status === 'completed' && !receipt.has_pdf" class="pdf-note">{{ receipt.pdf_status === 'failed' ? 'PDF 暂不可用，请联系工作人员；您仍可阅读下方报告。' : 'PDF 正在准备，完成后即可查看和下载。' }}</div>

    <section v-if="!terminal && centerOpen && receipt" class="recent-report" aria-labelledby="recent-title">
      <span class="section-label">本次测评</span><div class="recent-heading"><h1 id="recent-title">{{ recentStatus }}</h1><span class="report-status">{{ receipt.status === 'completed' ? '可阅读' : receipt.status === 'processing' ? '自动更新' : '已保留入口' }}</span></div>
      <p>{{ recentHint }}</p>
      <div v-if="receipt.is_demo" class="demo-note">演示报告 · 模拟数据，仅用于流程展示</div>
      <div class="recent-meta"><span v-if="receipt.report_id">报告编号 <b>{{ receipt.report_id }}</b></span><span v-if="date">{{ date }}</span></div>
      <button class="recent-open" @click="openCurrent">{{ receipt.status === 'completed' ? '继续查看报告' : '查看本次进度' }}</button>
      <div v-if="receipt.has_pdf" class="recent-pdf"><button class="quiet" @click="pdf(false)">查看 PDF</button><button class="quiet" @click="pdf(true)">下载 PDF</button></div>
      <p class="access-note">{{ receipt.report_id ? '本次访问链接有效期为 7 天。需要长期保存，请下载 PDF。' : '测评完成后，可在这里查看结果并下载 PDF。' }}</p>
      <button class="text-button" :aria-expanded="lookupExpanded" @click="lookupExpanded = !lookupExpanded">{{ lookupExpanded ? '收起编号查询' : '查询其他报告' }}</button>
    </section>
    <section v-if="!receipt && busy && (grant || session)" class="opening-state" role="status"><h1>正在打开本次报告</h1><p>请稍候…</p></section>
    <section v-else-if="!showingReport && (!receipt || lookupExpanded)" class="lookup-layout">
      <div class="lookup-copy"><span class="section-label">报告中心</span><h1>查看自己的<br>测评报告</h1><p>输入测评结束时显示的 8 位编号，<br>查看报告进度、阅读结果和保存 PDF。</p><div class="lookup-steps"><span><b>01</b> 输入编号</span><span><b>02</b> 阅读报告</span><span><b>03</b> 保存 PDF</span></div></div>
      <form class="lookup-form" @submit.prevent="load(true)"><label for="report-number">8 位报告编号</label><input id="report-number" v-model="code" :readonly="terminal" :inputmode="terminal ? 'none' : 'text'" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="例如 A1B2C3D4" @input="normalize"><p class="field-hint">编号由数字和 A–F 字母组成</p>
        <div v-if="terminal" class="report-keypad"><button v-for="key in '1234567890ABCDEF'" :key="key" type="button" class="key" @click="enter(key)">{{ key }}</button><button type="button" class="key edit-key" @click="code = ''">清空</button><button type="button" class="key edit-key" @click="code = code.slice(0, -1)">退格 ←</button></div>
        <button class="lookup-submit" :disabled="busy || code.length !== 8">{{ busy ? '正在查询…' : '查看报告' }}</button><p class="lookup-help">没有编号？请重新打开扫码时的链接，或请现场工作人员协助查询。</p>
      </form>
    </section>

    <PersonalReport v-else-if="showingReport && receipt?.report" :payload="receipt.report" audience="community" />
    <section v-else-if="showingReport && receipt" class="status-layout">
      <div class="status-copy"><span class="status-icon" :class="{ 'status-error': !['processing', 'awaiting_assessment'].includes(receipt.status) }">{{ ['processing', 'awaiting_assessment'].includes(receipt.status) ? '…' : '!' }}</span><span class="section-label">{{ receipt.report_id ? `报告编号 ${receipt.report_id}` : '本次测评' }}</span><h1>{{ receipt.status === 'processing' ? '分析中' : receipt.status === 'awaiting_assessment' ? '等待完成测评' : '本次报告暂不可用' }}</h1><p v-if="delayed">处理时间较长，本次记录已保存。<br>本页会继续更新，也可联系现场工作人员了解进度。</p><p v-else-if="receipt.status === 'processing'">通常需要 3–4 分钟，本页会自动更新。<br>{{ terminal ? '可以先返回首页，稍后用报告编号查询；也可扫码在手机上查看。' : '返回报告中心仍可继续查看本次进度，无需再次输入编号。' }}</p><p v-else-if="receipt.status === 'awaiting_assessment'">请在终端完成测评。<br>完成后，这里会自动显示报告进度。</p><p v-else>本次未获得可供阅读的有效报告。<br>请联系现场工作人员协助处理。</p><small v-if="date">测评时间 {{ date }}</small><div class="status-actions"><button :disabled="busy" @click="load()">{{ busy ? '正在刷新…' : '刷新状态' }}</button><NavigationButton @click="terminal ? home() : openCenter()">{{ terminal ? '返回首页' : '返回报告中心' }}</NavigationButton></div></div>
      <aside v-if="terminal && qr" class="phone-card"><div class="qr" v-html="qr"/><h2>把报告带到手机上</h2><p>现在扫码，报告生成后自动更新<br>可在线阅读，也可下载 PDF</p></aside>
      <aside v-else class="reading-note"><h2>本次报告入口已保留</h2><p>可返回报告中心继续查看。<br>建议收藏当前链接，报告生成后下载 PDF。</p><p>报告仅供个人心理状态参考，<br>不构成医学诊断。</p></aside>
    </section>
    <footer v-if="!showingReport || !receipt?.report" class="center-footer">报告仅供本人查看 · 心理状态辅助参考，不构成医学诊断</footer>
    <div v-if="shareOpen" class="share-overlay" @click.self="shareOpen = false" @keydown.esc="shareOpen = false"><section class="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><button class="quiet share-close" autofocus @click="shareOpen = false">关闭 ×</button><h2 id="share-title">手机查看与保存报告</h2><div class="qr" v-html="qr"/><b>报告编号 {{ receipt?.report_id }}</b><p>扫码打开本次报告，无需再次输入编号。<br>进入手机页面后，点击“下载 PDF”。</p><small>链接 7 天内有效，请勿转发给他人。<br>过期后可重新查询并获取链接。</small></section></div>
  </main>
</template>
