<script setup lang="ts">
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber, displayPercent } from '@/utils/formatters'
import { dataQualityVerdict, qualityCards } from '@/utils/report'
import AuReport from './AuReport.vue'
import RppgReport from './RppgReport.vue'
import VibraReport from './VibraReport.vue'
import EyeReport from './EyeReport.vue'
const props=defineProps<{report:AssessmentDetail}>()
const quality=()=>qualityCards(props.report)
const qualityVerdict=()=>dataQualityVerdict(props.report)
const qualityValue=(item:ReturnType<typeof quality>[number])=>item.value==null?'—':item.percent?displayPercent(item.value):displayNumber(item.value)
const captureQuality=()=>props.report.capture_quality
</script>
<template>
  <section class="evidence-glossary">
    <article><b>采集质量</b><p>确认人脸有效率、画面质量、运动干扰和丢帧是否支持正式解释。</p></article>
    <article><b>面部动作线索（AU）</b><p>为压力、疲劳等核心结果提供面部活动依据，不直接等同于具体情绪或疾病。</p></article>
    <article><b>面部微振动线索（Vibra）</b><p>记录细微运动形成的状态依据，不用于输出人格、攻击性或岗位结论。</p></article>
    <article><b>面部生理节律估计（rPPG）</b><p>通过面部视频估算心率等线索，受光照、头动和信号质量影响。</p></article>
    <article><b>视觉关注线索</b><p>普通摄像头形成的关注近似估计，不等同于专业眼动仪。</p></article>
  </section>
  <section class="panel evidence-quality-panel"><h3>本次采集质量</h3><div><article v-for="item in quality()" :key="item.name"><span>{{ item.name }}</span><strong>{{ qualityValue(item) }}</strong><span v-if="item.verdict !== '可解释'" class="quality-verdict" :class="{ 'quality-verdict--caution': item.verdict === '建议谨慎解释', 'quality-verdict--missing': item.verdict === '未提供' }"><i />{{ item.verdict }}</span></article></div><p v-if="captureQuality()" class="evidence-quality-note">有效采集 {{ captureQuality()?.effective_duration_seconds ?? '—' }} 秒 · 人脸偏离暂停 {{ captureQuality()?.paused_count ?? 0 }} 次</p><p v-if="qualityVerdict().lowConfidence" class="evidence-quality-note">本次整体置信度较低，建议谨慎解释各项采集质量结果。</p></section>
  <section class="report-boundary"><b>这些观察线索如何使用</b><p>面部动作、细微运动、生理节律估计和视觉关注线索，用于支持本次状态结果的综合判断。单项偏高或偏低不等同于心理风险，也不会单独作为重点关注结论。</p></section>
  <details class="evidence-detail"><summary>面部动作线索（AU）</summary><AuReport :report="report"/></details>
  <details class="evidence-detail"><summary>面部微振动线索（Vibra）</summary><VibraReport :report="report"/></details>
  <details class="evidence-detail" open><summary>面部生理节律估计（rPPG）</summary><RppgReport :report="report"/></details>
  <details class="evidence-detail"><summary>视觉关注线索</summary><EyeReport :report="report"/></details>
</template>
