<script setup lang="ts">
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const metrics=()=>pageMetrics(props.report,'vibra')
</script>
<template><div class="metric-grid metric-grid--three"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><p class="caution vibra-caution">面部微振动线索反映面部细微运动形成的状态依据，用于支持核心结果的综合判断；单项偏高或偏低不等同于心理风险，不用于输出人格、攻击性或岗位结论。</p></template>

<style scoped>
.vibra-caution{margin:14px 0 0}
</style>
