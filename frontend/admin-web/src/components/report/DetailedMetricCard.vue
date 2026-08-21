<script setup lang="ts">
import AppStatus from '@/components/common/AppStatus.vue'
import type { DetailedMetricView } from '@/types/report'
import { displayNumber } from '@/utils/formatters'
import { standardRangeText } from '@/utils/report'
defineProps<{ metric:DetailedMetricView }>()
const marker = (score:number|null) => `${Math.max(0, Math.min(100, Number(score) || 0))}%`
const normalStyle = (metric:DetailedMetricView) => {
  if (metric.key === 'depression' || metric.key === 'anxiety') return { left:'0%', width:'50%' }
  const [,b,c] = metric.thresholds
  if (metric.direction === 'higher_better') return { left:`${Number.isFinite(b) ? b : 45}%`, width:`${100-(Number.isFinite(b) ? b : 45)}%` }
  const start=Number.isFinite(b) ? b : 35, end=Number.isFinite(c) ? c : 55
  return { left:`${start}%`, width:`${end-start}%` }
}
</script>
<template>
  <article class="detail-metric-card">
    <header><div><div class="metric-kicker">{{ metric.technicalName }}</div><h3>{{ metric.name }}</h3></div><AppStatus :label="metric.level"/></header>
    <div class="metric-result"><strong>{{ metric.score == null ? '—' : displayNumber(metric.score) }}</strong><span>合作方分档依据值 · {{ metric.grade }} · 置信度{{ metric.confidence }}</span></div>
    <div class="metric-standard-range">标准值区间 {{ standardRangeText(metric) }}</div>
    <div class="detail-standard-track"><i :style="normalStyle(metric)"></i><b v-if="metric.score!=null" :style="{left:marker(metric.score)}"><span>{{ displayNumber(metric.score) }}</span></b></div>
    <div class="detail-standard-scale"><span>0</span><span>标准值区间</span><span>100</span></div>
    <p v-if="metric.weakReference" class="weak-reference">本项为弱参考或参考样本有限，应与其他指标共同解释。</p>
    <dl class="metric-explanation">
      <div><dt>综合解读</dt><dd>{{ metric.definition }}</dd></div>
      <div><dt>航空场景意义</dt><dd>{{ metric.aviationMeaning }}</dd></div>
      <div><dt>结果边界</dt><dd>{{ metric.limitation }}</dd></div>
    </dl>
    <footer>数据来源：{{ metric.source }}</footer>
  </article>
</template>
