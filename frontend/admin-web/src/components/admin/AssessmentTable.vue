<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppStatus from '@/components/common/AppStatus.vue'
import AppEmpty from '@/components/common/AppEmpty.vue'
import type { AssessmentListItem,ReviewStatus } from '@/types/assessment'
import { formatDateTime,maskId } from '@/utils/formatters'
import { processLabel,reviewLabel,reviewOptions } from '@/utils/status'
const props=defineProps<{records:AssessmentListItem[];loading:boolean}>(),emit=defineEmits<{(e:'status',payload:{id:string;status:ReviewStatus}):void}>(),router=useRouter()
function open(id:string){router.push(`/assessments/${id}/report`)}
</script>
<template><div class="table-card"><div v-if="loading" class="table-loading">正在加载测评记录…</div><AppEmpty v-else-if="!records.length" title="暂无符合条件的测评记录" description="可以调整搜索关键词、日期或查看状态后重试。"/><div v-else class="table-wrap"><table><thead><tr><th>被测人员</th><th>测评时间</th><th>分析状态</th><th>查看状态</th><th>备注</th><th></th></tr></thead><tbody><tr v-for="item in records" :key="item.id"><td><div class="person"><span>{{ (item.name||'?').slice(0,1) }}</span><div><strong>{{ item.name||'未填写姓名' }}</strong><small>{{ item.subject_id||'受测者' }} · {{ maskId(item.id_card) }}</small></div></div></td><td><time>{{ formatDateTime(item.created_at) }}</time><small class="subtle">报告编号 {{ item.id.replace(/-/g,'').slice(0,8).toUpperCase() }}</small></td><td><AppStatus :label="processLabel(item.status)"/><small v-if="item.error_message" class="error-line">{{ item.error_message }}</small></td><td><select :value="item.review_status" :class="`review-select review-select--${item.review_status==='pending'?'pending':item.review_status==='closed'?'closed':'viewed'}`" @change="emit('status',{id:item.id,status:($event.target as HTMLSelectElement).value as ReviewStatus})"><option v-for="option in reviewOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></td><td><span class="note-preview">{{ item.admin_note||'—' }}</span></td><td><button class="secondary-button" @click="open(item.id)">查看报告</button></td></tr></tbody></table></div></div></template>

<style scoped>.review-select--viewed{background:#e9f8f0;color:#19714f}.review-select--closed{background:#eef1f6;color:#44506b}</style>

