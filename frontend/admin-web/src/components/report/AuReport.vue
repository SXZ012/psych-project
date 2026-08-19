<script setup lang="ts">
import AppEmpty from '@/components/common/AppEmpty.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber } from '@/utils/formatters'
import { auCandidates, auVisual, auVisualImageUrl, pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const metrics=()=>pageMetrics(props.report,'au');const visual=()=>auVisual(props.report);const imageUrl=()=>auVisualImageUrl(props.report);const candidates=()=>auCandidates(props.report)
</script>
<template><div class="metric-grid metric-grid--five"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><div class="two-panel-grid"><section class="panel panel--flush"><header><h3>代表性语义标注图</h3><small>summary.modules.au.visualization</small></header><div v-if="imageUrl()" class="au-image"><img :src="imageUrl()" alt="AU 语义标注图"></div><AppEmpty v-else title="本次报告未提供 AU 语义标注图"/><p class="panel__foot">{{ visual().representative_time_seconds != null ? `代表时点 ${displayNumber(visual().representative_time_seconds)}s · ` : '' }}{{ visual().display_hint || '语义区域仅用于解释面部动作变化，不代表病灶。' }}</p></section><section class="panel"><header><h3>候选事件时间点</h3><small>timeline.au_event_frames</small></header><div v-if="candidates().length" class="event-list"><article v-for="(event,index) in candidates()" :key="index"><b>{{ displayNumber(event.representative_time_seconds ?? event.t_start) }}s</b><div><strong>{{ event.label || 'AU 动作候选' }}</strong><span>相对强度 {{ displayNumber(event.value) }} · 仅用于回看定位</span></div></article></div><AppEmpty v-else title="没有可展示的候选时间点"/></section></div></template>
