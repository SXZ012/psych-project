<script setup lang="ts">
import { useRouter } from 'vue-router'
import ReportNumber from '@/components/report/ReportNumber.vue'
import AppStatus from '@/components/common/AppStatus.vue'
import AppEmpty from '@/components/common/AppEmpty.vue'
import type { AssessmentListItem, ReviewStatus } from '@/types/assessment'
import { formatDateTime, maskId } from '@/utils/formatters'
import { processLabel, reviewOptions } from '@/utils/status'

defineProps<{ records: AssessmentListItem[]; loading: boolean }>()
const emit = defineEmits<{ (e: 'status', payload: { id: string; status: ReviewStatus }): void }>()
const router = useRouter()
function open(id: string) { router.push(`/assessments/${id}/report`) }
function personName(item: AssessmentListItem) {
  return item.name || (item.scene === 'community' ? '社区用户' : '未填写姓名')
}
function personInfo(item: AssessmentListItem) {
  const identity = item.subject_id || (item.scene === 'community' ? '社区测评' : '受测者')
  return item.id_card ? `${identity} · ${maskId(item.id_card)}` : identity
}
</script>

<template>
  <div class="table-card">
    <div v-if="loading" class="table-loading">正在加载测评记录…</div>
    <AppEmpty v-else-if="!records.length" title="暂无符合条件的测评记录" description="可以调整搜索关键词、日期或查看状态后重试。"/>
    <div v-else class="table-wrap">
      <table>
        <colgroup>
          <col class="col-person"><col class="col-scene"><col class="col-time">
          <col class="col-process"><col class="col-review"><col class="col-note"><col class="col-action">
        </colgroup>
        <thead><tr><th>被测人员</th><th>场景</th><th>测评时间</th><th>分析状态</th><th>查看状态</th><th>备注</th><th><span class="action-heading">操作</span></th></tr></thead>
        <tbody>
          <tr v-for="item in records" :key="item.id">
            <td>
              <div class="person">
                <span>{{ personName(item).slice(0, 1) }}</span>
                <div class="person__text">
                  <strong :title="personName(item)">{{ personName(item) }}</strong>
                  <small :title="personInfo(item)">{{ personInfo(item) }}</small>
                </div>
              </div>
            </td>
            <td><span class="scene-label" :class="item.scene">{{ item.scene === 'community' ? '社区' : '航空' }}</span></td>
            <td><time>{{ formatDateTime(item.created_at) }}</time><ReportNumber :id="item.id"/></td>
            <td><AppStatus :label="processLabel(item.status)"/><small v-if="item.error_message" class="error-line" :title="item.error_message">{{ item.error_message }}</small></td>
            <td>
              <select :value="item.review_status" :aria-label="`${personName(item)}的查看状态`" :class="`review-select review-select--${item.review_status === 'pending' ? 'pending' : item.review_status === 'closed' ? 'closed' : 'viewed'}`" @change="emit('status', { id: item.id, status: ($event.target as HTMLSelectElement).value as ReviewStatus })">
                <option v-for="option in reviewOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </td>
            <td><span class="note-preview" :title="item.admin_note || undefined">{{ item.admin_note || '—' }}</span></td>
            <td><button class="secondary-button" @click="open(item.id)">查看报告</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Both scenes use the same column geometry, independent of record contents. */
.table-card table{width:100%;min-width:900px;table-layout:fixed}
.col-person{width:20%}.col-scene{width:8%}.col-time{width:19%}
.col-process{width:14%}.col-review{width:13%}.col-note{width:14%}.col-action{width:12%}
.table-card th,.table-card td{padding-left:12px;padding-right:12px}
.table-card th,.table-card time,.table-card .secondary-button{white-space:nowrap}
.table-card td{height:88px;padding-top:16px;padding-bottom:16px;vertical-align:middle}
.person{min-width:0;gap:10px}
.person>span{flex:0 0 36px}
.person__text{min-width:0;flex:1}
.person strong,.person small,.error-line,.note-preview{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.person strong{font-size:13px;line-height:20px}
.person small{font-size:11px;line-height:16px}
.error-line,.note-preview{max-width:100%}
.error-line{line-height:16px}
.review-select{width:100%;max-width:112px;height:34px}
.table-card .secondary-button{height:38px;width:100%;max-width:100px;padding:8px}
.scene-label{display:inline-block;white-space:nowrap;padding:5px 10px;border-radius:8px;color:#37617d;background:#eaf2f8;font-size:12px;font-weight:650}
.scene-label.community{color:#33704f;background:#eaf5ed}
.review-select--viewed{background:#e9f8f0;color:#19714f}
.review-select--closed{background:#eef1f6;color:#44506b}
.action-heading{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
</style>
