<script setup lang="ts">
import DetailedMetricCard from './DetailedMetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { screeningMetricViews } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>()
</script>
<template>
  <section class="screening-notice"><strong>筛查结果不是临床诊断</strong><p>结果用于提示当前是否存在需要进一步确认的方向；如提示需要关注，建议结合标准量表、访谈和专业人员意见综合判断。</p></section>
  <div class="detailed-metric-grid detailed-metric-grid--two"><DetailedMetricCard v-for="metric in screeningMetricViews(props.report)" :key="metric.key" :metric="metric"/></div>
</template>
