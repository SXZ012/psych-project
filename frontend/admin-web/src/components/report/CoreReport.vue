<script setup lang="ts">
import DetailedMetricCard from './DetailedMetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { coreMetricViews } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>()
</script>
<template><div class="detailed-metric-grid"><DetailedMetricCard v-for="metric in coreMetricViews(props.report)" :key="metric.key" :metric="metric"/></div></template>
