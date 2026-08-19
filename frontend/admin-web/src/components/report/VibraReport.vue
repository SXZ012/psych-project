<script setup lang="ts">
import AppEmpty from '@/components/common/AppEmpty.vue'
import AppStatus from '@/components/common/AppStatus.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber } from '@/utils/formatters'
import { formalRows, formalStatus, pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const metrics=()=>pageMetrics(props.report,'vibra');const rows=()=>formalRows(props.report)
</script>
<template><div class="metric-grid metric-grid--three"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><section class="formal-panel"><header><div><h3>Formal 12 分段统计</h3><p>Feature 编号遵循合作方契约，心理命名仅供研发，不用于管理结论。</p></div><AppStatus :label="formalStatus(report)"/></header><div v-if="rows().length" class="table-wrap"><table class="formal-table"><thead><tr><th>编号</th><th>指标</th><th>均值</th><th>最低 / 最高</th><th>样本</th><th>波动</th></tr></thead><tbody><tr v-for="row in rows()" :key="row.key"><td>F{{ String(row.index).padStart(2,'0') }}</td><td>Feature F{{ String(row.index).padStart(2,'0') }}</td><td>{{ displayNumber(row.range.mean) }}</td><td>{{ displayNumber(row.range.min) }} / {{ displayNumber(row.range.max) }}</td><td>{{ row.range.sample_count ?? '—' }}</td><td><AppStatus :label="row.range.is_stable === false ? '有波动' : '相对稳定'"/></td></tr></tbody></table></div><AppEmpty v-else title="本次报告没有 Formal 12 分段数据"/></section></template>
