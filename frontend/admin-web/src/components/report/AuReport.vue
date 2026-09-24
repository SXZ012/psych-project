<script setup lang="ts">
import { ref, watch } from 'vue'
import AppEmpty from '@/components/common/AppEmpty.vue'
import MetricCard from '@/components/report/MetricCard.vue'
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber } from '@/utils/formatters'
import { auCandidates, auVisual, auVisualImageUrl, pageMetrics } from '@/utils/report'
const props=defineProps<{report:AssessmentDetail}>();const metrics=()=>pageMetrics(props.report,'au');const visual=()=>auVisual(props.report);const candidates=()=>auCandidates(props.report)

// 标注图首次访问可能需要从合作方刷新，做加载占位与失败重试，避免空白
const imageUrl=()=>auVisualImageUrl(props.report)
const imageState=ref<'none'|'loading'|'ready'|'error'>('none')
const imageSrc=ref('')
watch(()=>props.report.id,()=>{prepare()},{immediate:true})
function prepare(){
  const src=imageUrl()
  if(!src){imageState.value='none';imageSrc.value='';return}
  imageState.value='loading';imageSrc.value=src
}
function retryImage(){
  const src=imageUrl()
  if(!src)return
  imageState.value='loading'
  imageSrc.value=`${src}${src.includes('?')?'&':'?'}retry=${Date.now()}`
}
</script>
<template><div class="metric-grid metric-grid--five"><MetricCard v-for="metric in metrics()" :key="metric.key" :metric="metric"/></div><div class="two-panel-grid"><section class="panel panel--flush"><header><h3>代表性语义标注图</h3><small>面部动作语义标注结果</small></header><div v-if="imageState!=='none'" class="au-image" :class="{ 'au-image--loading': imageState==='loading' }">
  <img v-if="imageSrc && imageState!=='error'" :src="imageSrc" alt="AU 语义标注图" @load="imageState='ready'" @error="imageState='error'">
  <div v-if="imageState==='loading'" class="au-image__state"><i class="au-image__spin"></i>正在载入标注图，首次查看可能需要数秒…</div>
  <div v-else-if="imageState==='error'" class="au-image__state au-image__state--error"><span>标注图暂时无法打开，可稍后重试。</span><button class="secondary-button au-image__retry" @click="retryImage">重新载入</button></div>
</div><AppEmpty v-else title="本次报告未提供 AU 语义标注图"/><p class="panel__foot">{{ visual().representative_time_seconds != null ? `代表时点 ${displayNumber(visual().representative_time_seconds)}s · ` : '' }}{{ visual().display_hint || '语义区域仅用于解释面部动作变化，不代表病灶。' }}</p></section><section class="panel"><header><h3>候选事件时间点</h3><small>面部动作候选片段</small></header><div v-if="candidates().length" class="event-list"><article v-for="(event,index) in candidates()" :key="index"><b>{{ displayNumber(event.representative_time_seconds ?? event.t_start) }}s</b><div><strong>{{ event.label || 'AU 动作候选' }}</strong><span>相对强度 {{ displayNumber(event.value) }} · 仅用于回看定位</span></div></article></div><AppEmpty v-else title="没有可展示的候选时间点"/></section></div></template>

<style scoped>
.au-image{position:relative;overflow:hidden;border-radius:10px;background:#f4f8f6;min-height:180px}
.au-image img{display:block;width:100%;height:auto}
.au-image--loading::after{content:'';position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,#ffffffb3 50%,transparent 70%) 0 0/220% 100%;animation:auShimmer 1.4s ease-in-out infinite}
.au-image__state{display:flex;flex-direction:column;align-items:center;gap:12px;justify-content:center;min-height:170px;padding:22px;color:#5c7a6d;font-size:13px}
.au-image__state--error{color:#a2592f}
.au-image__spin{width:22px;height:22px;border-radius:50%;border:2.5px solid #cfe3da;border-top-color:#3e7367;animation:auSpin 0.9s linear infinite}
.au-image__retry{min-height:38px;padding:0 20px;border-radius:10px;font-size:13px}
@keyframes auSpin{to{transform:rotate(360deg)}}
@keyframes auShimmer{to{background-position:-220% 0}}
</style>
