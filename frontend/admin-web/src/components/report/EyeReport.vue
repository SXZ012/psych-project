<script setup lang="ts">
import AppEmpty from '@/components/common/AppEmpty.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { eyeAvailable, eyePointCount, heatCells, heatColor, pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const available=()=>eyeAvailable(props.report);const metrics=()=>pageMetrics(props.report,'eye');const heat=()=>heatCells(props.report)
</script>
<template><template v-if="available()"><div class="metric-grid metric-grid--four"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><div class="two-panel-grid"><section class="panel"><header><h3>视线落点热区</h3><small>低分辨率落点分布估算</small></header><div v-if="heat().length" class="heatmap"><i v-for="(value,index) in heat()" :key="index" :style="{background:heatColor(value)}"/></div><AppEmpty v-else title="本次未载入热区数据"/></section><section class="panel"><h3>采集说明</h3><p class="body-copy">视觉关注线索由普通摄像头视频估算形成，应结合采集质量与有效率解释，不等同于专业眼动仪结果。</p><p class="subtle">有效轨迹点：{{ eyePointCount(report) }} 个</p></section></div></template><AppEmpty v-else title="本次未采集眼动数据" description="因此不输出视觉注意力分数，也不使用其他线索代替眼动结论。"/></template>
