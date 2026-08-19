<script setup lang="ts">
import AppEmpty from '@/components/common/AppEmpty.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { eyeAvailable, eyeData, eyePointCount, heatCells, heatColor, pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const available=()=>eyeAvailable(props.report);const metrics=()=>pageMetrics(props.report,'eye');const data=()=>eyeData(props.report);const heat=()=>heatCells(props.report)
</script>
<template><template v-if="available()"><div class="metric-grid metric-grid--four"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><div class="two-panel-grid"><section class="panel"><header><h3>热区格网</h3><small>9 × 16 proxy heatmap</small></header><div v-if="heat().length" class="heatmap"><i v-for="(value,index) in heat()" :key="index" :style="{background:heatColor(value)}"/></div><AppEmpty v-else title="本次未载入热区数据"/></section><section class="panel"><h3>采集说明</h3><p class="body-copy">{{ data().display_policy || '当前为视频级 proxy 眼动证据，应结合有效率和采集质量解释。' }}</p><p class="subtle">有效轨迹点：{{ eyePointCount(report) }} 个</p></section></div></template><AppEmpty v-else title="本次上传报告未采集眼动数据" :description="data().display_policy || '因此不输出视觉注意力分数，也不使用其他模态代替眼动结论。'"/></template>
