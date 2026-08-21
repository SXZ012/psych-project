<script setup lang="ts">
import DetailedMetricCard from './DetailedMetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { screeningMetricViews } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>()
</script>
<template>
  <section class="screening-notice"><strong>筛查结果不是临床诊断</strong><p>分类以合作方接口返回的 classification_label 为准；需要关注时应结合标准量表、访谈和专业人员判断。</p></section>
  <div class="detailed-metric-grid detailed-metric-grid--two"><DetailedMetricCard v-for="metric in screeningMetricViews(props.report)" :key="metric.key" :metric="metric"/></div>
</template>
