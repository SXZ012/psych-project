<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { updateInfo } from '@/api/assessments'
import AppEmpty from '@/components/common/AppEmpty.vue'
import AppStatus from '@/components/common/AppStatus.vue'
import AuReport from '@/components/report/AuReport.vue'
import EyeReport from '@/components/report/EyeReport.vue'
import OverviewReport from '@/components/report/OverviewReport.vue'
import PageSummary from '@/components/report/PageSummary.vue'
import ReportTabs from '@/components/report/ReportTabs.vue'
import RppgReport from '@/components/report/RppgReport.vue'
import VibraReport from '@/components/report/VibraReport.vue'
import { useAssessmentStore } from '@/stores/assessments'
import type { ReportTab } from '@/types/report'
import { formatDateTime, maskId } from '@/utils/formatters'
import { eyeAvailable, pageSummary, REPORT_TABS, rppgAvailable } from '@/utils/report'
import { processLabel } from '@/utils/status'

const props = defineProps<{ id: string }>()
const store = useAssessmentStore(), router = useRouter()
const activeTab = ref<ReportTab>('overview'), note = ref(''), savingNote = ref(false), editOpen = ref(false), savingInfo = ref(false), editError = ref('')
const form = ref({ name: '', subject_id: '', id_card: '' })
const report = computed(() => store.current)
const tab = computed(() => REPORT_TABS.find(item => item.key === activeTab.value)!)
const summary = computed(() => report.value ? pageSummary(report.value, activeTab.value) : null)
const rppgReady = computed(() => report.value ? rppgAvailable(report.value) : false)
const eyeReady = computed(() => report.value ? eyeAvailable(report.value) : false)
const activeComponent = computed(() => ({ overview: OverviewReport, au: AuReport, rppg: RppgReport, vibra: VibraReport, eye: EyeReport })[activeTab.value])

onMounted(async () => { await store.open(props.id); syncForm() })
function syncForm() { if (!report.value) return; note.value = report.value.admin_note || ''; form.value = { name: report.value.name || '', subject_id: report.value.subject_id || '', id_card: report.value.id_card || '' } }
async function saveNote() { if (!report.value) return; savingNote.value = true; try { await store.saveNote(report.value.id, note.value.trim() || null) } finally { savingNote.value = false } }
function openEdit() { editError.value = ''; syncForm(); editOpen.value = true }
async function saveInfo() { if (!report.value) return; editError.value = ''; if (!form.value.name.trim()) { editError.value = '姓名不能为空'; return } if (form.value.id_card && !/^\d{17}[\dXx]$/.test(form.value.id_card)) { editError.value = '身份证号应为 18 位'; return }; savingInfo.value = true; try { await updateInfo(report.value.id, { name: form.value.name.trim(), subject_id: form.value.subject_id.trim(), id_card: form.value.id_card || undefined }); await store.open(report.value.id); editOpen.value = false } catch (error) { editError.value = error instanceof Error ? error.message : '保存失败' } finally { savingInfo.value = false } }
function printReport() { window.print() }
</script>

<template>
  <main class="report-screen">
    <header class="report-topbar"><button class="back-button" @click="router.push('/assessments')">← 返回报告列表</button><div class="report-topbar__actions"><button class="secondary-button" @click="openEdit">编辑人员信息</button><button class="secondary-button" @click="printReport">打印报告</button></div></header>
    <div v-if="store.detailLoading" class="report-loading">正在读取完整报告…</div>
    <div v-else-if="store.error" class="report-error"><AppEmpty title="报告加载失败" :description="store.error"><button class="secondary-button" @click="router.push('/assessments')">返回列表</button></AppEmpty></div>
    <template v-else-if="report">
      <section class="report-identity"><div class="report-identity__avatar">{{ (report.name || '?').slice(0, 1) }}</div><div><div class="eyebrow">ASSESSMENT REPORT</div><h1>{{ report.name || '未填写姓名' }}的心理测评报告</h1><p>{{ report.subject_id || '受测者' }} · {{ maskId(report.id_card) }} · {{ formatDateTime(report.created_at) }}</p></div><div class="report-identity__status"><AppStatus :label="processLabel(report.status)"/><small>算法版本 {{ report.result?.algorithm_version || '—' }}</small></div></section>
      <section v-if="report.status === 'invalid_result'" class="alert alert--warning">合作方分析结果无效，本报告只保留原始数据用于排查，不作为正式可解释结论。</section>
      <ReportTabs v-model="activeTab"/>
      <section class="report-content">
        <header class="report-section-head"><div><div class="eyebrow">{{ tab.kicker }}</div><h2>{{ tab.title }}</h2><p>{{ tab.hint }}</p></div><AppStatus v-if="activeTab === 'rppg'" :label="rppgReady ? '质量门控通过' : '不建议解释'"/><AppStatus v-else-if="activeTab === 'eye'" :label="eyeReady ? '已采集' : '未采集'"/></header>
        <PageSummary v-if="summary" :summary="summary"/>
        <component :is="activeComponent" :report="report"/>
      </section>
      <section class="admin-note"><div><h3>内部跟进备注</h3><p>仅管理人员可见，不进入被测人员报告及合作方分析。</p></div><textarea v-model="note" maxlength="2000" placeholder="记录回访情况、复测安排或管理说明"></textarea><button class="primary-button" :disabled="savingNote" @click="saveNote">{{ savingNote ? '保存中…' : '保存备注' }}</button></section>
    </template>
  </main>
  <div v-if="editOpen" class="modal-backdrop" @click.self="editOpen = false"><form class="edit-modal" @submit.prevent="saveInfo"><header><div><h2>编辑基础信息</h2><p>仅可修改身份信息，测评分数与结果标签受保护。</p></div><button type="button" class="text-button" @click="editOpen = false">×</button></header><label>姓名<input v-model="form.name" maxlength="64"></label><label>部门 / 工号<input v-model="form.subject_id" maxlength="64"></label><label>身份证号<input v-model="form.id_card" maxlength="18"></label><p class="form-error">{{ editError }}</p><footer><button type="button" class="secondary-button" @click="editOpen = false">取消</button><button class="primary-button" :disabled="savingInfo">{{ savingInfo ? '保存中…' : '保存修改' }}</button></footer></form></div>
</template>
