<script setup lang="ts">
import type { AssessmentDetail } from '@/types/assessment'
import { displayNumber, displayPercent, getAt } from '@/utils/formatters'
import AuReport from './AuReport.vue'
import RppgReport from './RppgReport.vue'
import VibraReport from './VibraReport.vue'
import EyeReport from './EyeReport.vue'
const props=defineProps<{report:AssessmentDetail}>()
const quality=()=>{
  const source=props.report.result?.summary_json
  return [
    {name:'人脸有效率',value:getAt(source,'quality.face_valid_ratio',null),percent:true},
    {name:'人脸质量',value:getAt(source,'quality.face_quality',null),percent:false},
    {name:'运动干扰',value:getAt(source,'quality.motion_noise_index',null),percent:false},
    {name:'丢帧率',value:getAt(source,'quality.drop_rate_percent',null),percent:true},
  ]
}
const qualityValue=(item:ReturnType<typeof quality>[number])=>item.value==null?'—':item.percent?displayPercent(item.value):displayNumber(item.value)
</script>
<template>
  <section class="evidence-glossary">
    <article><b>采集质量</b><p>确认人脸有效率、画面质量、运动干扰和丢帧是否支持正式解释。</p></article>
    <article><b>AU 面部动作</b><p>为压力、疲劳等核心结果提供面部活动依据，不直接等同于具体情绪或疾病。</p></article>
    <article><b>Vibra 微振动</b><p>保留身体微小运动形成的状态依据，不用于输出人格、攻击性或岗位结论。</p></article>
    <article><b>rPPG 生理节律</b><p>通过面部视频估算心率等线索，受光照、头动和信号质量影响。</p></article>
    <article><b>眼动代理</b><p>普通摄像头形成的视觉关注近似估计，不等同于专业眼动仪。</p></article>
  </section>
  <section class="panel evidence-quality-panel"><h3>本次采集质量</h3><div><article v-for="item in quality()" :key="item.name"><span>{{ item.name }}</span><strong>{{ qualityValue(item) }}</strong></article></div></section>
  <section class="report-boundary"><b>底层证据如何使用</b><p>AU、Vibra、rPPG与眼动用于说明合作方核心结果的数据来源和变化依据。单个底层指标偏高或偏低不等同于心理风险，也不进入综合概览的重点关注统计。</p></section>
  <details class="evidence-detail"><summary>AU 面部动作证据</summary><AuReport :report="report"/></details>
  <details class="evidence-detail"><summary>Vibra 微振动证据</summary><VibraReport :report="report"/></details>
  <details class="evidence-detail" open><summary>rPPG 生理节律证据</summary><RppgReport :report="report"/></details>
  <details class="evidence-detail"><summary>眼动注意证据</summary><EyeReport :report="report"/></details>
</template>
