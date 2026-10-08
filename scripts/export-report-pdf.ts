import { readFileSync } from 'node:fs'
import { REPORT_TABS, resultOverview, coreMetricViews, screeningMetricViews, overviewNarrative, pageSummary, qualityCards, dataQualityVerdict, confidenceConcerns, managementActions, pageMetrics, rppgAvailable, rppgReasons, eyeAvailable, hasPartnerThresholds, standardRangeText, isScreeningRange } from '../frontend/shared/report-kit/mapping'
import { displayNumber, displayPercent } from '../frontend/shared/report-kit/formatters'
import type { ReportSource, DetailedMetricView } from '../frontend/shared/report-kit/types'
const source: ReportSource = JSON.parse(readFileSync(0, 'utf8'))
function detail(item: DetailedMetricView) {
  const thresholds = hasPartnerThresholds(item)
  const [, lower, upper] = item.thresholds
  const start = isScreeningRange(item) ? 0 : lower
  const end = isScreeningRange(item) ? 50 : item.direction === 'higher_better' ? 100 : upper
  return { ...item, aviationMeaning: source.scene === 'community' ? item.plainMeaning : item.aviationMeaning, scoreText: item.score == null ? '未提供' : displayNumber(item.score),
    reference: thresholds ? standardRangeText(item) : '未提供正式参考区间', thresholdsAvailable: thresholds,
    rangeStart: start, rangeWidth: Math.max(0,end-start), marker: Math.max(0,Math.min(100,item.score || 0)),
  }
}
const overview = resultOverview(source)
const output = {
  tabs: REPORT_TABS, overview, narratives: overviewNarrative(source),
  headline: source.result_valid === false ? '本次结果暂不建议正式解释' : overview.attention.length ? `本次建议重点查看：${overview.attention.map(i=>`${i.name}（${i.level}）`).join('、')}` : '本次核心结果整体正常，未见需立即关注项',
  summaries: {screening:pageSummary(source,'screening'),core:pageSummary(source,'core'),evidence:pageSummary(source,'evidence')},
  core:coreMetricViews(source).map(detail), screening:screeningMetricViews(source).map(detail),
  metrics:overview.metrics.map(detail),
  quality:qualityCards(source).map(q=>({...q,display:q.value==null?'未提供':q.percent?displayPercent(q.value):displayNumber(q.value)})),
  qualityVerdict:dataQualityVerdict(source),concerns:confidenceConcerns(source),actions:managementActions(source),
  evidence: [
    {name:'面部动作线索（AU）',definition:'为压力、疲劳等核心结果提供面部活动依据，不直接等同于具体情绪或疾病。',items:pageMetrics(source,'au'),available:true},
    {name:'面部微振动线索（Vibra）',definition:'记录细微运动形成的状态依据，不用于输出人格、攻击性或岗位结论。',items:pageMetrics(source,'vibra'),available:true},
    {name:'面部生理节律估计（rPPG）',definition:'通过面部视频估算心率等线索，受光照、头动和信号质量影响。',items:pageMetrics(source,'rppg'),available:rppgAvailable(source),reasons:rppgReasons(source)},
    {name:'视觉关注线索',definition:'普通摄像头形成的关注近似估计，不等同于专业眼动仪。',items:pageMetrics(source,'eye'),available:eyeAvailable(source)},
  ],
}
process.stdout.write(JSON.stringify(output))
