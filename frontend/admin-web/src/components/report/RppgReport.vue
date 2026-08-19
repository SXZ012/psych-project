<script setup lang="ts">
import AppEmpty from '@/components/common/AppEmpty.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { pageMetrics, rppgAvailable, rppgCharts, rppgReasons, sparkline } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const available=()=>rppgAvailable(props.report);const metrics=()=>pageMetrics(props.report,'rppg');const charts=()=>rppgCharts(props.report)
</script>
<template><template v-if="available()"><div class="metric-grid metric-grid--four"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><div class="chart-grid"><section v-for="chart in charts()" :key="chart.key" class="panel chart"><header><h3>{{ chart.name }}</h3><small>{{ chart.range }}</small></header><svg v-if="chart.series.length > 1" viewBox="0 0 320 70" preserveAspectRatio="none"><line x1="0" y1="69" x2="320" y2="69"/><polyline :points="sparkline(chart.series)"/></svg><div v-else class="chart__empty">本次未载入曲线证据</div></section></div></template><template v-else><AppEmpty title="本次 rPPG 生理数据不满足展示条件" :description="rppgReasons(report) || '有效窗口或信号质量不足。'"/><div class="metric-grid metric-grid--three"><MetricCard v-for="metric in metrics().filter(item => ['信号质量','运动干扰','光照干扰'].includes(item.name))" :key="metric.key" :metric="metric"/></div></template><p class="caution">rPPG 心率与 HRV 为视频估算值，受头动、光照和信号质量影响，只作为心理生理状态的辅助证据。</p></template>
