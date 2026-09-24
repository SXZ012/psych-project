<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { resubmitAssessment, updateInfo } from '@/api/assessments'
import AppEmpty from '@/components/common/AppEmpty.vue'
import AppStatus from '@/components/common/AppStatus.vue'
import CoreReport from '@/components/report/CoreReport.vue'
import EvidenceReport from '@/components/report/EvidenceReport.vue'
import OverviewReport from '@/components/report/OverviewReport.vue'
import PageSummary from '@/components/report/PageSummary.vue'
import ReportTabs from '@/components/report/ReportTabs.vue'
import ScreeningReport from '@/components/report/ScreeningReport.vue'
import { useAssessmentStore } from '@/stores/assessments'
import type { ReportTab } from '@/types/report'
import type { ReviewStatus } from '@/types/assessment'
import { formatDateTime, maskId } from '@/utils/formatters'
import { pageSummary, REPORT_TABS } from '@/utils/report'
import { processLabel } from '@/utils/status'

const props = defineProps<{ id: string }>()
const store = useAssessmentStore(), router = useRouter()
const activeTab = ref<ReportTab>('overview'), note = ref(''), savingNote = ref(false), editOpen = ref(false), savingInfo = ref(false), editError = ref('')
const form = ref({ name: '', subject_id: '', id_card: '' })
const report = computed(() => store.current)
const tab = computed(() => REPORT_TABS.find(item => item.key === activeTab.value)!)
const summary = computed(() => report.value ? pageSummary(report.value, activeTab.value) : null)
// 终端四项信息中的性别/年龄（存于 selections_data.basic_info，旧记录为空）
const basicGenderAge = computed(() => {
  const info = (report.value as unknown as { basic_info?: Record<string, unknown> | null } | null)?.basic_info
  if (!info) return ''
  return [info.gender ? String(info.gender) : '', info.age ? `${info.age} 岁` : ''].filter(Boolean).join(' · ')
})
const activeComponent = computed(() => ({ overview: OverviewReport, screening: ScreeningReport, core: CoreReport, evidence: EvidenceReport })[activeTab.value])

// ---- 处理状态分支：未完成/失败/无效时不展示四页空报告 ----
const PROCESSING_STATUSES = ['pending', 'video_processing', 'uploading', 'queued', 'processing', 'report_generating']
const status = computed(() => report.value?.status)
const isProcessing = computed(() => Boolean(status.value && PROCESSING_STATUSES.includes(status.value)))
const isFailed = computed(() => status.value === 'failed')
const isInvalid = computed(() => status.value === 'invalid_result')

const FAILURE_REASONS: Record<string, string> = {
  VideoQAFailed: '上传的视频未达到分析要求（时长不足或画面异常）。重新分析会复用同一段视频，若反复失败，建议按标准条件重新测评。',
  TimeoutError: '分析超时，分析服务未在规定时间内返回结果。可直接重新分析，无需重新录制。',
  InvalidV3Result: '本次分析返回的结果无效，本报告不作为正式结论。',
}
const failureReason = computed(() => FAILURE_REASONS[report.value?.error_code || ''] || report.value?.error_message || '未知原因，可尝试重新分析；若反复失败建议联系维护人员。')

// 分析中每 5 秒自动轮询，完成后自动进入正式报告
let pollTimer: number | null = null
function stopPolling() { if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null } }
function startPolling() {
  stopPolling()
  pollTimer = window.setInterval(() => {
    if (!store.detailLoading) void store.open(props.id).catch(() => undefined)
  }, 5000)
}
watch(status, value => { if (value && PROCESSING_STATUSES.includes(value)) startPolling(); else stopPolling() }, { immediate: true })
onBeforeUnmount(stopPolling)

// 失败重试：复用已保存视频，防重复点击
const retrying = ref(false), retryError = ref('')
async function retryAnalysis() {
  if (!report.value || retrying.value) return
  retrying.value = true; retryError.value = ''
  try {
    await resubmitAssessment(report.value.id)
    await store.open(report.value.id)
  } catch (error) {
    retryError.value = error instanceof Error ? error.message : '重新分析请求失败，请稍后重试'
  } finally {
    retrying.value = false
  }
}

onMounted(async () => {
  await store.open(props.id)
  // 报告成功打开即标记为已查看；历史状态不强行改写。
  if (store.current?.review_status === 'pending') await store.setReviewStatus(props.id, 'following')
  syncForm()
})
function syncForm() { if (!report.value) return; note.value = report.value.admin_note || ''; form.value = { name: report.value.name || '', subject_id: report.value.subject_id || '', id_card: report.value.id_card || '' } }
async function saveNote() { if (!report.value) return; savingNote.value = true; try { await store.saveNote(report.value.id, note.value.trim() || null) } finally { savingNote.value = false } }
function openEdit() { editError.value = ''; syncForm(); editOpen.value = true }
async function saveInfo() { if (!report.value) return; editError.value = ''; if (!form.value.name.trim()) { editError.value = '姓名不能为空'; return } if (form.value.id_card && !/^\d{17}[\dXx]$/.test(form.value.id_card)) { editError.value = '身份证号应为 18 位'; return }; savingInfo.value = true; try { await updateInfo(report.value.id, { name: form.value.name.trim(), subject_id: form.value.subject_id.trim(), id_card: form.value.id_card || undefined }); await store.open(report.value.id); editOpen.value = false } catch (error) { editError.value = error instanceof Error ? error.message : '保存失败' } finally { savingInfo.value = false } }
async function updateReviewStatus(event: Event) {
  if (!report.value) return
  const next = (event.target as HTMLSelectElement).value as ReviewStatus
  await store.setReviewStatus(report.value.id, next)
}
</script>

<template>
  <main class="report-screen">
    <header class="report-topbar"><button class="back-button" @click="router.push('/assessments')">← 返回报告列表</button><div class="report-topbar__actions"><button class="secondary-button" @click="openEdit">编辑人员信息</button></div></header>
    <div v-if="store.detailLoading && !report" class="report-loading">正在读取完整报告…</div>
    <div v-else-if="store.error" class="report-error"><AppEmpty title="报告加载失败" :description="store.error"><button class="secondary-button" @click="router.push('/assessments')">返回列表</button></AppEmpty></div>
    <template v-else-if="report">
      <section class="report-identity"><div class="report-identity__avatar">{{ (report.name || '?').slice(0, 1) }}</div><div><div class="eyebrow">AI VISUAL PSYCHOLOGICAL ASSESSMENT</div><h1>{{ report.name || '未填写姓名' }}的心理评估报告</h1><p>{{ report.subject_id || '受测者' }}<template v-if="report.id_card"> · {{ maskId(report.id_card) }}</template><template v-if="basicGenderAge"> · {{ basicGenderAge }}</template> · {{ formatDateTime(report.created_at) }}</p><div class="report-context"><span>本次状态记录</span><span>心理状态辅助参考</span></div></div><div class="report-identity__status"><AppStatus :label="processLabel(report.status)"/><label class="report-review-status">查看状态<select :value="report.review_status==='pending'?'pending':'following'" :class="{ 'is-viewed': report.review_status !== 'pending' }" @change="updateReviewStatus"><option value="pending">待查看</option><option value="following">已查看</option></select></label><small class="report-algorithm">算法版本：{{ report.result?.algorithm_version || '—' }}</small></div></section>

      <!-- 社区记录不在当前终端报告中心展示：两套报告体系完全独立 -->
      <section v-if="report.scene === 'community'" class="report-state report-state--invalid" role="note">
        <div class="report-state__icon report-state__icon--invalid">!</div>
        <h2>社区测评记录</h2>
        <p>本报告中心仅展示当前终端测评。社区用户的报告由社区链路（微信侧领取 PDF）交付，订单与会话状态请通过社区管理接口查询。</p>
      </section>

      <!-- 分析处理中：不展示四页空报告 -->
      <section v-else-if="isProcessing" class="report-state report-state--processing" role="status" aria-live="polite">
        <div class="report-state__orb"><i></i></div>
        <h2>报告分析处理中</h2>
        <p>当前环节：{{ processLabel(report.status) }}。分析通常在几分钟内完成，本页会自动刷新，完成后直接进入正式报告，无需手动操作。</p>
        <button class="secondary-button" :disabled="store.detailLoading" @click="store.open(report.id).catch(() => undefined)">{{ store.detailLoading ? '正在刷新…' : '立即刷新' }}</button>
      </section>

      <!-- 分析失败：原因 + 重新分析（复用已保存视频） -->
      <section v-else-if="isFailed" class="report-state report-state--failed" role="alert">
        <div class="report-state__icon report-state__icon--failed">!</div>
        <h2>本次分析未能完成</h2>
        <p>{{ failureReason }}</p>
        <div class="report-state__actions"><button class="primary-button" :disabled="retrying" @click="retryAnalysis">{{ retrying ? '正在提交重新分析…' : '重新分析' }}</button><span class="report-state__hint">重新分析使用已保存的原始视频，无需被测者重新录制。</span></div>
        <p v-if="retryError" class="report-state__error">{{ retryError }}</p>
        <details class="report-state__debug"><summary>排查信息</summary><p>{{ report.error_code || '—' }} · {{ report.error_message || '—' }}</p></details>
      </section>

      <!-- 结果无效：保留提示与原始数据说明，不展示易被误解为正式结论的卡片 -->
      <section v-else-if="isInvalid" class="report-state report-state--invalid" role="note">
        <div class="report-state__icon report-state__icon--invalid">!</div>
        <h2>本次结果不用于正式解释</h2>
        <p>本次视频未能得出可正式解释的分析结果。原始数据已保留用于排查，本页不展示核心结果与筛查内容，避免误读为正式结论。</p>
        <p class="report-state__hint">如需获得正式结果，建议在光线充足、面部居于画面中央的条件下重新测评。</p>
        <details class="report-state__debug"><summary>排查信息</summary><p>{{ report.error_code || '—' }} · {{ report.error_message || '—' }}</p></details>
      </section>

      <template v-else>
      <ReportTabs v-model="activeTab"/>
      <section class="report-content" id="report-panel" role="tabpanel" :aria-labelledby="`report-tab-${activeTab}`" tabindex="0">
        <header class="report-section-head"><div><div class="eyebrow">{{ tab.kicker }}</div><h2>{{ tab.title }}</h2><p>{{ tab.hint }}</p></div><AppStatus v-if="activeTab === 'screening'" label="筛查不等于诊断"/><AppStatus v-else-if="activeTab === 'evidence'" label="辅助证据层"/></header>
        <PageSummary v-if="summary && activeTab !== 'overview'" :summary="summary"/>
        <component :is="activeComponent" :report="report"/>
      </section>
      </template>

      <section v-if="!isProcessing" class="admin-note"><div><h3>内部跟进备注</h3><p>仅管理人员可见，不进入被测人员报告，也不参与测评分析。</p></div><textarea v-model="note" maxlength="2000" placeholder="记录回访情况、复测安排或管理说明"></textarea><button class="primary-button" :disabled="savingNote" @click="saveNote">{{ savingNote ? '保存中…' : '保存备注' }}</button></section>
    </template>
  </main>
  <div v-if="editOpen" class="modal-backdrop" @click.self="editOpen = false"><form class="edit-modal" @submit.prevent="saveInfo"><header><div><h2>编辑基础信息</h2><p>仅可修改身份信息，测评分数与结果标签受保护。</p></div><button type="button" class="text-button" @click="editOpen = false">×</button></header><label>姓名<input v-model="form.name" maxlength="64"></label><label>部门 / 工号<input v-model="form.subject_id" maxlength="64"></label><label>身份证号<input v-model="form.id_card" maxlength="18"></label><p class="form-error">{{ editError }}</p><footer><button type="button" class="secondary-button" @click="editOpen = false">取消</button><button class="primary-button" :disabled="savingInfo">{{ savingInfo ? '保存中…' : '保存修改' }}</button></footer></form></div>
</template>

<style scoped>
.report-review-status{display:flex;align-items:center;gap:7px;color:#7a8794;font-size:11px}.report-review-status select{min-width:94px;padding:6px 25px 6px 10px;border:1px solid #f0dfad;border-radius:999px;outline:0;color:#8a691e;background:#fff8e8;font-size:12px;font-weight:650;box-shadow:none;transition:border-color .18s,background .18s}.report-review-status select.is-viewed{border-color:#cde8dc;color:#19714f;background:#e9f8f0}.report-review-status select:focus{border-color:#d5b35c;background:#fffdf7}.report-review-status select.is-viewed:focus{border-color:#8bc7b1;background:#f4fcf8}.report-review-status select:hover{background:#fffaf0}.report-review-status select.is-viewed:hover{background:#f4fcf8}.report-algorithm{color:#8b98a5;font-size:10px}.report-context{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.report-context span{padding:3px 7px;border-radius:999px;color:#58736a;background:#eff6f3;font-size:10px}
.report-state{display:grid;justify-items:center;gap:10px;padding:52px 40px;margin-bottom:22px;border:1px solid var(--color-line,#dce9e5);border-radius:17px;background:#fff;text-align:center}.report-state h2{margin:8px 0 0;font-size:21px;color:#2c4a41}.report-state p{max-width:560px;margin:0;color:#5c6f69;font-size:14px;line-height:1.8}.report-state__hint{color:#8aa098!important;font-size:12px!important}.report-state__orb{position:relative;width:74px;height:74px}.report-state__orb i{position:absolute;inset:0;border-radius:50%;border:3px solid #cfe3da;border-top-color:#3e7367;animation:reportSpin 1s linear infinite}.report-state--processing .report-state__orb::after{content:'';position:absolute;inset:18px;border-radius:50%;background:radial-gradient(circle,#bfe2d4,#e8f4ee 70%)}.report-state__icon{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;font-size:30px;font-weight:800}.report-state__icon--failed{color:#b3552f;background:#fdeee6;border:2px solid #f0c4ad}.report-state__icon--invalid{color:#8a681b;background:#fdf4dd;border:2px solid #ead9ae}.report-state__actions{display:flex;flex-direction:column;align-items:center;gap:9px;margin-top:10px}.report-state__error{color:#b3552f!important;font-size:13px!important}.report-state__debug{max-width:560px;margin-top:12px;font-size:12px;color:#8aa098}.report-state__debug summary{cursor:pointer}.report-state__debug p{margin:8px 0 0;font-size:12px;word-break:break-all}.report-state .secondary-button{margin-top:14px;min-height:44px}
@keyframes reportSpin{to{transform:rotate(360deg)}}
</style>
