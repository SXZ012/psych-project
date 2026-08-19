<script setup lang="ts">
import AppStatus from '@/components/common/AppStatus.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber, getAt } from '@/utils/formatters'
import { managementActions, overviewCards } from '@/utils/report'

const props = defineProps<{ report: AssessmentDetail }>()
const cards = () => overviewCards(props.report)
const quality = () => { const source = props.report.result?.summary_json; return [['人脸有效率', getAt(source, 'quality.face_valid_ratio', null)], ['人脸质量', getAt(source, 'quality.face_quality', null)], ['运动干扰', getAt(source, 'quality.motion_noise_index', null)], ['丢帧率', getAt(source, 'quality.drop_rate_percent', null)]] }
const notice = () => ({ positioning: getAt(props.report.result?.summary_json, 'clinical_notice.positioning', getAt(props.report.result?.summary_json, 'product_logic_summary.positioning', '本报告为心理状态筛查与辅助观察依据，不作为疾病诊断。')), limitations: getAt(props.report.result?.summary_json, 'clinical_notice.limitations', []) as string[] })
</script>
<template><div class="overview-grid"><article v-for="card in cards()" :key="card.name" class="result-card"><div><span>{{ card.name }}</span><AppStatus :label="String(card.value)"/></div><strong>{{ card.score == null ? '—' : displayNumber(card.score) }}</strong><small>审计值仅用于追溯专业数据，不应脱离指标定义单独解释。</small></article></div><div class="evidence-grid"><section class="panel"><h3>证据质量</h3><dl><div v-for="item in quality()" :key="item[0]"><dt>{{ item[0] }}</dt><dd>{{ item[1] == null ? '—' : displayNumber(item[1]) }}</dd></div></dl></section><section class="panel"><h3>建议处理</h3><ol class="action-list"><li v-for="action in managementActions(report)" :key="action">{{ action }}</li></ol></section></div><details class="professional-details"><summary>专业说明与限制（报告必须保留）</summary><p>{{ notice().positioning }}</p><ul><li v-for="line in notice().limitations" :key="line">{{ line }}</li></ul></details></template>
