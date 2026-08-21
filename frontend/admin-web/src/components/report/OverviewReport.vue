<script setup lang="ts">
import AppStatus from '@/components/common/AppStatus.vue'
import type { AssessmentDetail } from '@/types/assessment'
import type { DetailedMetricView } from '@/types/report'
import { displayNumber, displayPercent, getAt } from '@/utils/formatters'
import { managementActions, overviewNarrative, resultOverview, standardRangeText } from '@/utils/report'

const props = defineProps<{ report: AssessmentDetail }>()
const overview = () => resultOverview(props.report)
const metrics = () => overview().metrics
const metric = (key:string) => metrics().find(item => item.key === key)
const quality = () => {
  const source = props.report.result?.summary_json
  return [
    { name:'人脸有效率', value:getAt(source, 'quality.face_valid_ratio', null), percent:true },
    { name:'人脸质量', value:getAt(source, 'quality.face_quality', null), percent:false },
    { name:'运动干扰', value:getAt(source, 'quality.motion_noise_index', null), percent:false },
    { name:'丢帧率', value:getAt(source, 'quality.drop_rate_percent', null), percent:true },
  ]
}
const qualityValue = (item:ReturnType<typeof quality>[number]) => item.value == null ? '—' : item.percent ? displayPercent(item.value) : displayNumber(item.value)
const themes = () => [
  { kicker:'FLIGHT TASK STATE', title:'持续注意与任务状态', description:'观察持续监控、恢复负荷和任务处理稳定性线索。', items:[metric('attention_focus'), metric('fatigue_recovery')].filter(Boolean) as DetailedMetricView[] },
  { kicker:'STRESS & AROUSAL', title:'压力与生理唤醒', description:'观察短时压力、紧张、兴奋和生理唤醒程度。', items:[metric('stress_load'), metric('physiological_arousal')].filter(Boolean) as DetailedMetricView[] },
  { kicker:'DIRECTION SCREENING', title:'心理方向筛查', description:'用于发现需要进一步确认的抑郁、焦虑方向线索。', items:[metric('depression'), metric('anxiety')].filter(Boolean) as DetailedMetricView[] },
]
const overallTitle = () => {
  if (props.report.result_valid === false) return '本次结果暂不建议正式解释'
  const count = overview().attention.length
  return count ? `本次有 ${count} 项正式结果建议重点查看` : '本次核心结果整体正常，未见需立即关注项'
}
const rangeMetrics = () => metrics()
const resultValue = (item:DetailedMetricView) => item.score == null ? '—' : displayNumber(item.score)
const markerStyle = (item:DetailedMetricView) => ({ left:`${Math.max(0, Math.min(100, Number(item.score) || 0))}%` })
const normalStyle = (item:DetailedMetricView) => {
  if (item.key === 'depression' || item.key === 'anxiety') return { left:'0%', width:'50%' }
  const [,b,c] = item.thresholds
  if (item.direction === 'higher_better') return { left:`${Number.isFinite(b) ? b : 45}%`, width:`${100 - (Number.isFinite(b) ? b : 45)}%` }
  const start = Number.isFinite(b) ? b : 35, end = Number.isFinite(c) ? c : 55
  return { left:`${start}%`, width:`${Math.max(0, end-start)}%` }
}
const notice = () => ({ positioning:getAt(props.report.result?.summary_json, 'clinical_notice.positioning', getAt(props.report.result?.summary_json, 'product_logic_summary.positioning', '本报告为心理状态筛查与辅助观察依据，不作为疾病诊断。')), limitations:getAt(props.report.result?.summary_json, 'clinical_notice.limitations', []) as string[] })
</script>

<template>
  <section class="overview-hero">
    <div class="overview-hero__signal"><i></i><span>{{ report.result_valid === false ? '结果有效性待确认' : '本次测评数据已完成分析' }}</span></div>
    <h3>{{ overallTitle() }}</h3>
    <div class="overview-hero__narrative"><p v-for="line in overviewNarrative(report)" :key="line">{{ line }}</p></div>
    <small>本页仅解释合作方返回的正式指标；筛查结果不是医学诊断，需结合量表、访谈和实际情况综合判断。</small>
  </section>
  <div class="overview-theme-grid">
    <article v-for="(theme,index) in themes()" :key="theme.title" class="overview-theme-card">
      <div class="overview-theme-card__head"><div><small>{{ theme.kicker }}</small><h3>{{ theme.title }}</h3></div><span>0{{ index+1 }}</span></div>
      <p>{{ theme.description }}</p>
      <div class="overview-theme-card__items"><div v-for="item in theme.items" :key="item.key"><span>{{ item.name }}</span><strong>{{ resultValue(item) }}</strong><AppStatus :label="item.level"/></div></div>
    </article>
    <article class="overview-theme-card overview-theme-card--quality">
      <div class="overview-theme-card__head"><div><small>DATA CONFIDENCE</small><h3>数据可信程度</h3></div><span>04</span></div>
      <p>说明本次视频是否具备稳定解释基础，避免脱离质量评价结果。</p>
      <div class="overview-quality-grid"><div v-for="item in quality()" :key="item.name"><span>{{ item.name }}</span><strong>{{ qualityValue(item) }}</strong></div></div>
    </article>
  </div>
  <section class="overview-panorama">
    <header><div><div class="eyebrow">RESULT POSITION</div><h3>核心结果与标准值区间</h3></div><p><i></i>绿色区域表示标准值区间，深色指针表示本次数值。</p></header>
    <div class="overview-range-list">
      <article v-for="item in rangeMetrics()" :key="item.key">
        <div class="overview-range-meta"><div><b>{{ item.name }}</b><em>标准值 {{ standardRangeText(item) }}</em><span>{{ item.level }}</span></div></div>
        <div class="overview-range-track"><i :style="normalStyle(item)"></i><b v-if="item.score != null" :style="markerStyle(item)"><span>{{ displayNumber(item.score) }}</span></b></div>
        <div class="overview-range-scale"><span>0</span><span>标准值区间</span><span>100</span></div>
      </article>
    </div>
  </section>
  <div class="overview-reading-grid">
    <section class="overview-reading-card overview-reading-card--stable"><header><span>✓</span><div><small>STABLE FINDINGS</small><h3>本次稳定表现</h3></div></header><ul><li v-for="item in overview().stable" :key="item.key"><b>{{ item.name }}</b><span>{{ item.level }}</span></li><li v-if="!overview().stable.length">本次未提供可归入该组的正式结果。</li></ul></section>
    <section class="overview-reading-card overview-reading-card--attention"><header><span>!</span><div><small>REVIEW PRIORITY</small><h3>建议重点查看</h3></div></header><ul><li v-for="item in overview().attention" :key="item.key"><b>{{ item.name }}</b><span>{{ item.level }}</span></li><li v-if="!overview().attention.length">当前未见需要立即升级处理的合作方正式分类。</li></ul></section>
  </div>
  <section class="overview-actions"><div><div class="eyebrow">NEXT STEP</div><h3>建议与下一步</h3></div><ol><li v-for="action in managementActions(report)" :key="action">{{ action }}</li></ol></section>
  <details class="professional-details"><summary>查看专业定位与报告限制</summary><p>{{ notice().positioning }}</p><ul><li v-for="line in notice().limitations" :key="line">{{ line }}</li></ul></details>
</template>
