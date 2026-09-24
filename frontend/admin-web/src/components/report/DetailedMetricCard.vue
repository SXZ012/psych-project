<script setup lang="ts">
import AppStatus from '@/components/common/AppStatus.vue'
import type { DetailedMetricView } from '@/types/report'
import { displayNumber } from '@/utils/formatters'
import { hasPartnerThresholds, isScreeningRange, standardRangeText } from '@/utils/report'
defineProps<{ metric:DetailedMetricView }>()
const marker = (score:number|null) => `${Math.max(0, Math.min(100, Number(score) || 0))}%`
const showRange = (metric:DetailedMetricView) => hasPartnerThresholds(metric)
const normalStyle = (metric:DetailedMetricView) => {
  const [,b,c] = metric.thresholds
  if (isScreeningRange(metric)) return { left:'0%', width:'50%' }
  if (metric.direction === 'higher_better') return { left:`${b}%`, width:`${Math.max(0, 100-b)}%` }
  const start=b, end=c
  return { left:`${start}%`, width:`${end-start}%` }
}
const rangeTicks = (metric:DetailedMetricView) => {
  const [, lower, upper] = metric.thresholds
  if (isScreeningRange(metric)) return [{ value: lower, left: lower }, { value: upper, left: upper }]
  if (metric.direction === 'higher_better') return [{ value: lower, left: lower }]
  return [{ value: lower, left: lower }, { value: upper, left: upper }]
}
</script>
<template>
  <article class="detail-metric-card">
    <header><div><h3>{{ metric.name }}</h3></div><AppStatus :label="metric.level"/></header>
    <div class="metric-result"><strong>{{ metric.score == null ? '—' : displayNumber(metric.score) }}<small v-if="showRange(metric)">参考区间 {{ standardRangeText(metric) }}</small></strong></div>
    <p class="metric-grade">结果分类：{{ metric.level }} · {{ metric.grade }} · 置信度{{ metric.confidence }}</p>
    <template v-if="showRange(metric)"><div class="detail-standard-track" :class="{ 'detail-standard-track--screening': isScreeningRange(metric) }"><i :style="normalStyle(metric)"></i><b v-if="metric.score!=null" :style="{left:marker(metric.score)}"><span>{{ displayNumber(metric.score) }}</span></b></div><div class="detail-standard-scale"><span>0</span><b v-for="tick in rangeTicks(metric)" :key="tick.left" :style="{ left: `${tick.left}%` }">{{ tick.value }}</b><span>100</span></div></template>
    <p v-else class="metric-range-note">参考区间：{{ standardRangeText(metric) }}</p>
    <p v-if="metric.weakReference" class="weak-reference">本项为弱参考或参考样本有限，应与其他指标共同解释。</p>
    <dl class="metric-explanation">
      <div><dt>综合解读</dt><dd>{{ metric.definition }}</dd></div>
      <div><dt>实际解读</dt><dd>{{ metric.aviationMeaning }}</dd></div>
      <div><dt>结果边界</dt><dd>{{ metric.limitation }}</dd></div>
    </dl>
  </article>
</template>
