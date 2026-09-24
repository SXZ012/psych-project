<script setup lang="ts">
import AppStatus from '@/components/common/AppStatus.vue'
import type { AssessmentDetail } from '@/types/assessment'
import type { DetailedMetricView } from '@/types/report'
import { displayNumber, displayPercent, getAt } from '@/utils/formatters'
import {
  confidenceConcerns,
  dataQualityVerdict,
  hasPartnerThresholds,
  isScreeningRange,
  managementActions,
  qualityCards,
  resultOverview,
  standardRangeText,
} from '@/utils/report'

const props = defineProps<{ report: AssessmentDetail }>()
const overview = () => resultOverview(props.report)
const metrics = () => overview().metrics
const quality = () => qualityCards(props.report)
const qualityVerdict = () => dataQualityVerdict(props.report)
const concerns = () => confidenceConcerns(props.report)
const qualityValue = (item:ReturnType<typeof quality>[number]) => item.value == null ? '—' : item.percent ? displayPercent(item.value) : displayNumber(item.value)
const keyMetrics = () => {
  const all = metrics()
  const order = ['depression', 'anxiety', 'stress_load', 'fatigue_recovery', 'physiological_arousal', 'attention_focus']
  return [
    ...order.map(key => all.find(item => item.key === key)).filter((item): item is DetailedMetricView => Boolean(item)),
    ...all.filter(item => !order.includes(item.key)),
  ]
}
const overallTitle = () => {
  if (props.report.result_valid === false) return '本次结果暂不建议正式解释'
  const attention = overview().attention
  if (!attention.length) return '本次核心结果整体正常，未见需立即关注项'
  return `本次建议重点查看：${attention.map(item => `${item.name}（${item.level}）`).join('、')}`
}
const metricMeaning = (key:string) => ({
  depression: '情绪低落相关表现',
  anxiety: '紧张与担忧相关表现',
  stress_load: '当前压力应对状态',
  fatigue_recovery: '疲劳与恢复状态',
  physiological_arousal: '身体激活与放松状态',
  attention_focus: '视觉关注稳定程度',
} as Record<string, string>)[key] || '本次状态线索'
const interpretation = () => props.report.result_valid === false ? '本次结果暂不建议正式解释，需先复核采集与分析有效性。' : '本次视频已完成分析，可结合下方质量信息和正式指标进行解读。'
const nextStep = () => managementActions(props.report)[0] || '建议由授权管理人员结合实际情况完成复核。'
const resultValue = (item:DetailedMetricView) => item.score == null ? '—' : displayNumber(item.score)
const screeningMetrics = () => {
  const byKey = (key:string) => metrics().find(item => item.key === key)
  const result = (key:string) => {
    const item = byKey(key)
    if (!item) return '未提供'
    return `${item.name}${item.score == null ? '' : displayNumber(item.score)}（${item.level}）`
  }
  return { depression: result('depression'), anxiety: result('anxiety') }
}
const coreMetrics = () => {
  const byKey = (key:string) => metrics().find(item => item.key === key)
  const result = (key:string) => {
    const item = byKey(key)
    if (!item) return '未提供'
    return `${item.name}${item.score == null ? '' : displayNumber(item.score)}（${item.level}）`
  }
  return [result('stress_load'), result('fatigue_recovery'), result('physiological_arousal'), result('attention_focus')]
}
const markerStyle = (item:DetailedMetricView) => ({ left:`${Math.max(0, Math.min(100, Number(item.score) || 0))}%` })
const normalStyle = (item:DetailedMetricView) => {
  if (!hasPartnerThresholds(item)) return { left:'0%', width:'0%' }
  const [,b,c] = item.thresholds
  if (isScreeningRange(item)) return { left:'0%', width:'50%' }
  if (item.direction === 'higher_better') return { left:`${b}%`, width:`${100 - b}%` }
  const start = b, end = c
  return { left:`${start}%`, width:`${Math.max(0, end-start)}%` }
}
const rangeTicks = (item:DetailedMetricView) => {
  const [, lower, upper] = item.thresholds
  if (isScreeningRange(item)) return [{ value: lower, left: lower }, { value: upper, left: upper }]
  if (item.direction === 'higher_better') return [{ value: lower, left: lower }]
  return [{ value: lower, left: lower }, { value: upper, left: upper }]
}
const notice = () => ({ positioning:getAt(props.report.result?.summary_json, 'clinical_notice.positioning', getAt(props.report.result?.summary_json, 'product_logic_summary.positioning', '本报告为心理状态筛查与辅助观察依据，不作为疾病诊断。')), limitations:getAt(props.report.result?.summary_json, 'clinical_notice.limitations', []) as string[] })
</script>

<template>
  <section class="overview-hero">
    <div class="overview-hero__signal"><i></i><span>{{ report.result_valid === false ? '结果有效性待确认' : '本次测评数据已完成分析' }}</span></div>
    <h3>{{ overallTitle() }}</h3>
    <p class="overview-hero__screening">方向筛查结果：<strong>{{ screeningMetrics().depression }}</strong>，<strong>{{ screeningMetrics().anxiety }}</strong>。该结果用于提示后续复核方向，不等同于临床诊断。</p>
    <p class="overview-hero__lead">核心状态结果：<strong v-for="(item, index) in coreMetrics()" :key="item">{{ item }}<span v-if="index < coreMetrics().length - 1">，</span></strong>。这些结果描述的是测评时段内压力、恢复、生理激活与视觉关注的组合状态，不是对长期人格或能力的直接判定。</p>
    <div class="overview-hero__decision">
      <article><small>结果可信度</small><p>{{ interpretation() }}</p></article>
      <article><small>建议处理</small><p>{{ nextStep() }}</p></article>
    </div>
    <small>本报告用于心理状态辅助评估，不作为疾病诊断；如有持续异常或实际困扰，建议由专业人员进一步确认。</small>
  </section>
  <div class="overview-reading-grid">
    <section class="overview-reading-card overview-reading-card--stable"><header><span>✓</span><div><small>STABLE FINDINGS</small><h3>本次稳定表现</h3></div></header><ul><li v-for="item in overview().stable" :key="item.key"><b>{{ item.name }}</b><span>{{ item.level }}</span></li><li v-if="!overview().stable.length">本次未提供可归入该组的正式结果。</li></ul></section>
    <section class="overview-reading-card" :class="overview().attention.length ? 'overview-reading-card--attention' : 'overview-reading-card--stable'"><header><span>{{ overview().attention.length ? '!' : '✓' }}</span><div><small>REVIEW PRIORITY</small><h3>建议重点查看</h3></div></header><ul><li v-for="item in overview().attention" :key="item.key"><b>{{ item.name }}</b><span>{{ item.level }}</span></li><li v-if="!overview().attention.length">当前未见需重点查看项目。</li></ul></section>
  </div>
  <section class="overview-results">
    <header><div><div class="eyebrow">KEY RESULTS</div><h3>本次核心结果</h3></div><p>绿色区段为参考范围，刻度显示其边界值。</p></header>
    <div class="overview-results__grid">
      <article v-for="item in keyMetrics()" :key="item.key" :class="{ 'is-attention': overview().attention.some(candidate => candidate.key === item.key) }">
        <div><b>{{ item.name }}<small class="overview-result-meaning">（{{ metricMeaning(item.key) }}）</small></b><AppStatus :label="item.level"/></div>
        <strong>{{ resultValue(item) }}<small v-if="hasPartnerThresholds(item)">参考区间 {{ standardRangeText(item) }}</small></strong>
        <template v-if="hasPartnerThresholds(item)"><div class="overview-result-bar" :class="{ 'overview-result-bar--screening': isScreeningRange(item) }"><i :style="normalStyle(item)"></i><b v-if="item.score != null" :style="markerStyle(item)"><span>{{ resultValue(item) }}</span></b></div><div class="overview-result-scale"><span>0</span><b v-for="tick in rangeTicks(item)" :key="tick.left" :style="{ left: `${tick.left}%` }">{{ tick.value }}</b><span>100</span></div></template>
      </article>
    </div>
  </section>
  <section class="overview-retest-hint" v-if="qualityVerdict().lowConfidence">
    <div><small>复测建议</small><p>本次整体置信度较低{{ concerns().length ? `，主要与${concerns().join('、')}有关` : '' }}。建议之后在光线充足、面部居于画面中央、保持安静坐姿的条件下复测一次；本次结果仅作趋势参考，不作为正式结论依据。</p></div>
  </section>
  <section class="overview-quality-summary"><header><div><div class="eyebrow">DATA QUALITY</div><h3>本次数据质量</h3></div><div class="quality-head-note"><span v-if="qualityVerdict().lowConfidence" class="quality-verdict quality-verdict--caution"><i />整体置信度较低，建议谨慎解释</span><p>用于判断本次结果是否具备解释基础。</p></div></header><div><article v-for="item in quality()" :key="item.name"><span>{{ item.name }}</span><strong>{{ qualityValue(item) }}</strong><span v-if="item.verdict !== '可解释'" class="quality-verdict" :class="{ 'quality-verdict--caution': item.verdict === '建议谨慎解释', 'quality-verdict--missing': item.verdict === '未提供' }"><i />{{ item.verdict }}</span></article></div></section>
  <section class="overview-actions"><div><div class="eyebrow">NEXT STEP</div><h3>建议与下一步</h3></div><ol><li v-for="action in managementActions(report)" :key="action">{{ action }}</li></ol></section>
  <details class="professional-details"><summary>查看专业定位与报告限制</summary><p>{{ notice().positioning }}</p><ul><li v-for="line in notice().limitations" :key="line">{{ line }}</li></ul></details>
</template>

<style scoped>
.overview-hero>h3{font-weight:400}.overview-hero__lead,.overview-hero__screening{position:relative;max-width:930px;margin:15px 0 0;color:#385249;font-size:16px;line-height:1.85}.overview-hero__screening{margin-top:15px}.overview-hero__decision{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:24px 0}.overview-hero__decision article{min-height:92px;padding:18px 20px;border:1px solid rgba(167,199,187,.4);border-radius:14px;background:rgba(255,255,255,.7)}.overview-hero__decision small{display:block;margin-bottom:9px;color:#5f8b7c;font-size:12px;font-weight:750;letter-spacing:.05em}.overview-hero__decision p{margin:0;color:#385249;font-size:14px;line-height:1.75}.overview-hero small{font-size:14px;line-height:1.65}.overview-results,.overview-quality-summary{padding:28px;margin-bottom:22px;border:1px solid var(--color-line);border-radius:17px;background:#fff}.overview-results>header,.overview-quality-summary>header{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:24px}.overview-results h3,.overview-quality-summary h3{margin:4px 0 0;font-size:20px;color:var(--color-ink)}.overview-results header p,.overview-quality-summary header p{margin:0;color:var(--color-muted);font-size:13px}.overview-results__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.overview-results__grid article{min-height:158px;padding:21px 22px;border:1px solid #dce9e5;border-radius:15px;background:#f9fcfb}.overview-results__grid article.is-attention{border-color:#e9d4a4;background:#fffaf0}.overview-results__grid article>div{display:flex;justify-content:space-between;align-items:center;gap:8px}.overview-results__grid b{font-size:16px;color:var(--color-ink)}.overview-result-meaning{margin-left:3px;color:#4d665e;font-size:13px;font-weight:600;white-space:nowrap}.overview-results__grid .status{font-size:11px}.overview-results__grid strong{display:block;margin-top:19px;color:var(--color-primary-dark);font-size:28px;line-height:1}.overview-results__grid strong small{margin-left:6px;color:var(--color-muted);font-size:12px;font-weight:500}.overview-quality-summary>div{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.overview-quality-summary article{display:grid;gap:7px;align-content:start;padding:17px;border-radius:12px;background:#f5f9f8}.overview-quality-summary span,.overview-quality-summary strong{display:block}.overview-quality-summary span{font-size:13px;color:var(--color-muted)}.overview-quality-summary strong{margin-top:2px;font-size:20px;color:var(--color-primary-dark)}.quality-head-note{display:grid;gap:7px;justify-items:end;text-align:right}.quality-head-note p{margin:0}.quality-verdict{display:inline-flex;align-items:center;gap:6px;width:max-content;padding:3px 9px;border-radius:999px;background:#e8f4ee;color:#2f6d5b;font-size:11px;font-weight:650}.quality-verdict i{width:7px;height:7px;border-radius:50%;background:#3d9c7d}.quality-verdict--caution{background:#fdf4dd;color:#8a681b}.quality-verdict--caution i{background:#d5a537}.quality-verdict--missing{background:#eef1f3;color:#7c8a86}.overview-retest-hint{display:grid;grid-template-columns:200px 1fr;gap:26px;margin-bottom:22px;padding:19px 22px;border:1px solid #ead9ae;border-radius:15px;background:#fffaf0}.overview-retest-hint small{display:block;color:#8a681b;font-size:12px;font-weight:750;letter-spacing:.05em}.overview-retest-hint p{margin:6px 0 0;color:#5d4c22;font-size:14px;line-height:1.8}@media(max-width:980px){.overview-hero__decision,.overview-results__grid{grid-template-columns:1fr}.overview-quality-summary>div{grid-template-columns:repeat(2,1fr)}.overview-retest-hint{grid-template-columns:1fr;gap:8px}.overview-result-meaning{display:block;margin:3px 0 0;white-space:normal}}
.overview-result-bar{position:relative;height:9px;margin-top:15px;border-radius:999px;background:#e7ecee}.overview-result-bar i{position:absolute;inset-block:0;border-radius:999px;background:#9fd6bd}.overview-result-bar b{position:absolute;top:-5px;width:3px;height:19px;transform:translateX(-50%);border-radius:3px;background:#2f6f88;box-shadow:0 0 0 2px #fff}.overview-result-bar b span{position:absolute;top:21px;left:50%;transform:translateX(-50%);padding:2px 5px;border-radius:5px;background:#edf5f7;color:#285e73;font-size:12px;font-weight:750;white-space:nowrap}
.overview-result-bar--screening{background:linear-gradient(90deg,#e7ecee 0 50%,#f8e7b8 50% 70%,#f6d8d8 70% 100%)}
.overview-result-scale{position:relative;height:22px;margin-top:17px;color:#70847e;font-size:12px;line-height:1}.overview-result-scale>span{position:absolute;top:0}.overview-result-scale>span:first-child{left:0}.overview-result-scale>span:last-child{right:0}.overview-result-scale b{position:absolute;top:0;transform:translateX(-50%);color:#456b60;font-size:12px;font-weight:750}.overview-result-scale b::before{content:'';position:absolute;left:50%;bottom:15px;width:1px;height:5px;background:#89aea2}
</style>
