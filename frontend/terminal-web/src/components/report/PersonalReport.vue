<script setup lang="ts">
/**
 * 终端个人测评报告（四页卡片）——与管理员网页报告同口径。
 *
 * 数据与口径：全部来自后端"个人安全报告视图"（白名单子集）经共享映射层
 * （@report-kit/mapping）计算——同一分数、同一等级标签、同一颜色规则
 * （statusTone）、同一指标解释；本组件不计算、不补造任何指标。
 * 结构：总览 / 方向筛查 / 核心状态 / 数据证据；仅通过页签切换，
 * 每页独立纵向滚动；返回首页按钮由父级固定在底部。
 * 管理端专属内容（他人数据、原始视频/波形/热图、AU 图、任务与错误、
 * 内部备注）在个人视图中结构性不存在，本组件也无对应展示逻辑。
 */
import { computed, ref } from 'vue'
import type { ReportPayload } from '@/composables/useReportLookup'
import { toReportSource } from '@/composables/useReportLookup'
import type { DetailedMetricView, ReportTab } from '@report-kit/types'
import { displayNumber, displayPercent, formatDateTime, statusTone } from '@report-kit/formatters'
import {
  confidenceConcerns, coreMetricViews, dataQualityVerdict,
  eyeAvailable, hasPartnerThresholds, isScreeningRange,
  managementActions, pageMetrics, qualityCards, rppgAvailable, rppgReasons,
  overviewNarrative, pageSummary, REPORT_TABS, resultOverview, screeningMetricViews, standardRangeText,
} from '@report-kit/mapping'
import { MESSAGES } from '@/aviation/messages'

const props = withDefaults(defineProps<{ payload: ReportPayload; audience?: 'aviation' | 'community' }>(), { audience: 'aviation' })

const TABS = REPORT_TABS
const active = ref<ReportTab>('overview')

const source = computed(() => ({ ...toReportSource(props.payload), scene: props.audience }))
const overview = computed(() => resultOverview(source.value))
const coreViews = computed(() => coreMetricViews(source.value))
const screeningViews = computed(() => screeningMetricViews(source.value))
const quality = computed(() => qualityCards(source.value))
const qualityVerdict = computed(() => dataQualityVerdict(source.value))
const concerns = computed(() => confidenceConcerns(source.value))
const actions = computed(() => managementActions(source.value))
const eyeOk = computed(() => eyeAvailable(source.value))
const rppgOk = computed(() => rppgAvailable(source.value))
const rppgWhy = computed(() => rppgReasons(source.value))
const eyeMetrics = computed(() => pageMetrics(source.value, 'eye'))
const auMetrics = computed(() => pageMetrics(source.value, 'au'))
const rppgMetrics = computed(() => pageMetrics(source.value, 'rppg'))
const vibraMetrics = computed(() => pageMetrics(source.value, 'vibra'))
const emotionGuide = REPORT_TABS.find(tab => tab.key === 'screening')!
const behaviorGuide = REPORT_TABS.find(tab => tab.key === 'evidence')!
const coreGuide = REPORT_TABS.find(tab => tab.key === 'core')!
const narratives = computed(() => overviewNarrative(source.value))
const emotionSummary = computed(() => pageSummary(source.value, 'screening'))
const behaviorSummary = computed(() => pageSummary(source.value, 'evidence'))
const coreSummary = computed(() => pageSummary(source.value, 'core'))

/** 总览头条（与管理员网页总览同口径：重点关注项或整体正常） */
const headline = computed(() => {
  if (props.payload.result_valid === false) return '本次结果暂不建议正式解释'
  const attention = overview.value.attention
  if (!attention.length) return '本次核心结果整体正常，未见需立即关注项'
  return `本次建议重点关注：${attention.map(item => `${item.name}（${item.level}）`).join('、')}`
})

const keyMetrics = computed(() => {
  const all = overview.value.metrics
  const order = ['depression', 'anxiety', 'stress_load', 'fatigue_recovery', 'physiological_arousal', 'attention_focus']
  return [
    ...order.map(key => all.find(item => item.key === key)).filter((item): item is DetailedMetricView => Boolean(item)),
    ...all.filter(item => !order.includes(item.key)),
  ]
})

// —— 参考区间条（与网页版 DetailedMetricCard 同一规则） ——
const markerLeft = (score: number | null) => `${Math.max(0, Math.min(100, Number(score) || 0))}%`
const normalStyle = (item: DetailedMetricView) => {
  if (!hasPartnerThresholds(item)) return { left: '0%', width: '0%' }
  const [, b, c] = item.thresholds
  if (isScreeningRange(item)) return { left: '0%', width: '50%' }
  if (item.direction === 'higher_better') return { left: `${b}%`, width: `${100 - b}%` }
  return { left: `${b}%`, width: `${Math.max(0, c - b)}%` }
}
const rangeTicks = (item: DetailedMetricView) => {
  const [, lower, upper] = item.thresholds
  if (isScreeningRange(item)) return [{ value: lower, left: lower }, { value: upper, left: upper }]
  if (item.direction === 'higher_better') return [{ value: lower, left: lower }]
  return [{ value: lower, left: lower }, { value: upper, left: upper }]
}
const qualityValue = (item: { value: number | null; percent: boolean }) =>
  item.value == null ? '—' : item.percent ? displayPercent(item.value) : displayNumber(item.value)

</script>

<template>
  <article class="preport">
    <header class="preport__head">
      <div>
        <h2>{{ MESSAGES.report.reportTitle }}</h2>
        <p class="preport__time">{{ MESSAGES.report.summaryTime }}：{{ formatDateTime(payload.submitted_at) }}</p>
      </div>
    </header>

    <nav class="preport__tabs" role="tablist" aria-label="报告页签">
      <button v-for="tab in TABS" :key="tab.key" role="tab" type="button"
              :aria-selected="active === tab.key" :class="{ active: active === tab.key }"
              @click="active = tab.key">{{ tab.label }}</button>
    </nav>

    <!-- ═══ 页1 总览 ═══ -->
    <section v-show="active === 'overview'" class="preport__page" role="tabpanel">
      <div class="page-guide"><h3>{{ audience === 'community' ? '本次状态与阅读重点' : '本次状态与复核重点' }}</h3><span>先了解本次结果重点，再查看各项指标和数据质量。</span></div>
      <div class="preport__hero">
        <h3>{{ headline }}</h3>
        <p>{{ narratives[0] }}</p>
      </div>
      <div class="preport__duo">
        <div class="panel panel--ok">
          <h4>本次稳定表现</h4>
          <ul>
            <li v-for="item in overview.stable" :key="item.key"><b>{{ item.name }}</b><span class="lv" :class="`lv--${statusTone(item.level)}`">{{ item.level }}</span></li>
            <li v-if="!overview.stable.length" class="empty">本次未提供可归入该组的结果</li>
          </ul>
        </div>
        <div class="panel" :class="overview.attention.length ? 'panel--warn' : 'panel--ok'">
          <h4>建议重点关注</h4>
          <ul>
            <li v-for="item in overview.attention" :key="item.key"><b>{{ item.name }}</b><span class="lv" :class="`lv--${statusTone(item.level)}`">{{ item.level }}</span></li>
            <li v-if="!overview.attention.length" class="empty">当前未见需重点关注项目</li>
          </ul>
        </div>
      </div>
      <div class="panel">
        <h4>本次核心结果</h4>
        <p class="range-legend"><i></i>绿色区段为参考范围，竖线为本次位置，刻度为范围边界。</p>
        <div class="metric-grid">
          <article v-for="item in keyMetrics" :key="item.key" class="metric-card" :class="{ 'metric-card--attention': overview.attention.some(m => m.key === item.key) }">
            <div class="metric-card__row"><b>{{ item.name }}</b><span class="lv" :class="`lv--${statusTone(item.level)}`">{{ item.level }}</span></div>
            <strong>{{ item.score == null ? '—' : displayNumber(item.score) }}<small v-if="hasPartnerThresholds(item)">参考区间 {{ standardRangeText(item) }}</small></strong>
            <template v-if="hasPartnerThresholds(item) && item.score != null">
              <div class="rangebar" :class="{ 'rangebar--screening': isScreeningRange(item) }">
                <i :style="normalStyle(item)"></i><b :style="{ left: markerLeft(item.score) }"></b>
              </div>
              <div class="rangescale"><span>0</span><b v-for="tick in rangeTicks(item)" :key="tick.left" :style="{ left: `${tick.left}%` }">{{ tick.value }}</b><span>100</span></div>
            </template>
          </article>
        </div>
      </div>
      <div class="panel compact-advice"><h4>建议与下一步</h4><ol class="advice-list"><li v-for="action in actions" :key="action">{{ action }}</li></ol></div>
    </section>

    <!-- ═══ 页2 情绪状态 ═══ -->
    <section v-show="active === 'screening'" class="preport__page" role="tabpanel">
      <div class="page-guide"><h3>{{ emotionGuide.title }}</h3><span>{{ emotionGuide.hint }}</span></div>
      <div class="page-summary"><b>本页摘要</b><p>{{ emotionSummary.text }}</p></div>
      <div class="screening-grid">
      <div v-for="item in screeningViews" :key="item.key" class="panel detail">
        <header><h4>{{ item.name }}</h4><span class="lv" :class="`lv--${statusTone(item.level)}`">{{ item.level }}</span></header>
        <strong>{{ item.score == null ? '—' : displayNumber(item.score) }}<small v-if="hasPartnerThresholds(item)">参考区间 {{ standardRangeText(item) }}</small></strong>
        <template v-if="hasPartnerThresholds(item) && item.score != null">
          <div class="rangebar rangebar--screening"><i :style="normalStyle(item)"></i><b :style="{ left: markerLeft(item.score) }"></b></div>
          <div class="rangescale"><span>0</span><b v-for="tick in rangeTicks(item)" :key="tick.left" :style="{ left: `${tick.left}%` }">{{ tick.value }}</b><span>100</span></div>
        </template>
        <p class="panel-note">{{ item.definition }}</p>
        <p class="panel-note interpretation">{{ audience === 'community' ? item.plainMeaning : item.aviationMeaning }}</p>
        <p class="panel-note muted">{{ item.limitation }}</p>
      </div>
      </div>
    </section>

    <!-- ═══ 页3 行为与视觉信号 ═══ -->
    <section v-show="active === 'evidence'" class="preport__page" role="tabpanel">
      <div class="page-guide"><h3>{{ behaviorGuide.title }}</h3><span>{{ behaviorGuide.hint }}</span></div>
      <div class="page-summary"><b>本页摘要</b><p>{{ behaviorSummary.text }}</p></div>
      <div class="signal-glossary">
        <article><b>采集质量</b><p>确认人脸有效率、画面质量、运动干扰和丢帧是否支持正式解释。</p></article>
        <article><b>视觉关注</b><p>由普通摄像头形成的关注近似估计，不等同于专业眼动仪。</p></article>
        <article><b>面部动作（AU）</b><p>为核心结果提供面部活动依据，不直接等同于具体情绪或疾病。</p></article>
        <article><b>微振动（Vibra）</b><p>记录细微运动形成的状态线索，不用于人格或岗位结论。</p></article>
        <article><b>生理节律（rPPG）</b><p>由面部视频估算心率等线索，受光照、头动和信号质量影响。</p></article>
      </div>
      <div class="panel evidence-quality-panel">
        <h4>本次采集质量<span v-if="qualityVerdict.lowConfidence" class="chip chip--warn">整体置信度较低，建议谨慎解释</span></h4>
        <div class="quality-grid"><div v-for="item in quality" :key="item.name" class="quality-item"><span>{{ item.name }}</span><strong>{{ qualityValue(item) }}</strong><em v-if="item.verdict !== '可解释'" :class="item.verdict === '未提供' ? 'quality-verdict quality-verdict--missing' : 'quality-verdict'">{{ item.verdict }}</em></div></div>
        <p v-if="qualityVerdict.lowConfidence" class="panel-note">本次整体置信度较低{{ concerns.length ? `，主要与${concerns.join('、')}有关` : '' }}；建议在光线充足、面部居中的条件下复测，本次结果仅作趋势参考。</p>
      </div>
      <div class="panel"><h4>面部微振动线索</h4><div class="metric-grid"><article v-for="m in vibraMetrics" :key="m.key" class="metric-card metric-card--slim"><div class="metric-card__row"><b>{{ m.name }}</b><span class="lv lv--neutral">{{ m.level }}</span></div><strong>{{ m.value }}</strong></article><p v-if="!vibraMetrics.length" class="empty">本次未提供该项数据</p></div></div>
      <div class="panel">
        <h4>视觉注意与眼动</h4>
        <template v-if="eyeOk">
          <div class="metric-grid">
            <article v-for="m in eyeMetrics" :key="m.key" class="metric-card metric-card--slim">
              <div class="metric-card__row"><b>{{ m.name }}</b><span class="lv" :class="`lv--${statusTone(m.level)}`">{{ m.level }}</span></div>
              <strong>{{ m.value }}</strong>
            </article>
          </div>
        </template>
        <p v-else class="empty">本次未提供该项数据（眼动未采集，不据此推断注意力）</p>
      </div>
      <div class="panel">
        <h4>面部行为线索</h4>
        <div v-if="auMetrics.length" class="metric-grid">
          <article v-for="m in auMetrics" :key="m.key" class="metric-card metric-card--slim">
            <div class="metric-card__row"><b>{{ m.name }}</b><span class="lv lv--neutral">{{ m.level }}</span></div>
            <strong>{{ m.value }}</strong>
          </article>
        </div>
        <p v-else class="empty">本次未提供该项数据</p>
      </div>
      <div class="panel">
        <h4>生理节律信号</h4>
        <template v-if="rppgOk">
          <div class="metric-grid">
            <article v-for="m in rppgMetrics" :key="m.key" class="metric-card metric-card--slim">
              <div class="metric-card__row"><b>{{ m.name }}</b><span class="lv" :class="`lv--${statusTone(m.level)}`">{{ m.level }}</span></div>
              <strong>{{ m.value }}</strong>
            </article>
          </div>
          <p class="panel-note muted">生理节律由面部视频估算，受光照与头动影响，仅作辅助证据。</p>
        </template>
        <p v-else class="empty">本次未提供该项数据{{ rppgWhy ? `（${rppgWhy}）` : '' }}</p>
      </div>
      <div class="evidence-boundary"><b>这些线索如何使用</b><p>面部动作、微振动、生理节律与视觉关注线索用于支持本次状态的综合理解；单项偏高或偏低不等同于心理风险，也不单独形成重点关注结论。</p></div>
    </section>

    <!-- ═══ 页4 核心状态 ═══ -->
    <section v-show="active === 'core'" class="preport__page" role="tabpanel">
      <div class="page-guide"><h3>{{ coreGuide.title }}</h3><span>{{ coreGuide.hint }}</span></div>
      <div class="page-summary"><b>本页摘要</b><p>{{ coreSummary.text }}</p></div>
      <div class="core-grid">
        <article v-for="item in coreViews" :key="item.key" class="panel detail">
          <header><h4>{{ item.name }}</h4><span class="lv" :class="`lv--${statusTone(item.level)}`">{{ item.level }}</span></header>
          <strong>{{ item.score == null ? '—' : displayNumber(item.score) }}<small v-if="hasPartnerThresholds(item)">参考区间 {{ standardRangeText(item) }}</small></strong>
          <template v-if="hasPartnerThresholds(item) && item.score != null"><div class="rangebar"><i :style="normalStyle(item)"></i><b :style="{ left: markerLeft(item.score) }"></b></div><div class="rangescale"><span>0</span><b v-for="tick in rangeTicks(item)" :key="tick.left" :style="{ left: `${tick.left}%` }">{{ tick.value }}</b><span>100</span></div></template>
          <p class="panel-note">{{ item.definition }}</p><p class="panel-note interpretation">{{ audience === 'community' ? item.plainMeaning : item.aviationMeaning }}</p><p class="panel-note muted">{{ item.limitation }}</p>
        </article>
      </div>
    </section>
  </article>
</template>

<style scoped>
.preport{display:flex;flex:1;flex-direction:column;min-height:0;width:min(1100px,100%);margin:0 auto;overflow:hidden}
.preport__head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:0 4px 6px}
.preport__head h2{margin:0 0 3px;font-family:"Noto Serif SC",serif;font-size:22px;color:var(--tx-strong,#eff6fc)}
.preport__time{margin:0;font-size:13px;color:var(--tx-soft,#a6bed3)}
.chip{display:inline-flex;align-items:center;padding:3px 11px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
.chip--ok{background:rgba(95,226,168,.14);color:#8df0bb}
.chip--warn{background:rgba(245,190,80,.16);color:#ffe0a0}

.preport__tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:3px 0 9px}
.preport__tabs button{min-height:46px;border:1px solid #a7c1d64d;border-radius:11px;background:#ffffff0d;color:var(--tx-soft,#a6bed3);font-size:14px;font-weight:650;white-space:nowrap;transition:background var(--motion-fast,.15s),border-color var(--motion-fast,.15s);touch-action:manipulation}
.preport__tabs button.active{border-color:#86dfb4;background:rgba(77,139,129,.35);color:#fff}
.preport__tabs button:active{transform:scale(.98)}

.preport__page{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding:2px 8px 74px 4px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;touch-action:pan-y}
.preport__page::-webkit-scrollbar{width:6px}
.preport__page::-webkit-scrollbar-thumb{border-radius:6px;background:#ffffff30}

.preport__hero{padding:16px 20px;border:1px solid #a7c1d64d;border-radius:14px;background:#101e30d9}
.preport__hero h3{margin:0 0 6px;font-size:19px;line-height:1.6;color:var(--tx-strong,#eff6fc);font-weight:600}
.preport__hero p{margin:0;font-size:13px;color:var(--tx-faint,#96aebf)}
.page-guide{padding:2px 4px 1px}.page-guide h3{margin:0;color:#294354;font-size:20px}.page-guide span{display:block;margin-top:3px;color:#59717b;font-size:12px;line-height:1.55}
.page-summary{display:grid;grid-template-columns:38px minmax(0,1fr);align-items:center;column-gap:12px;padding:10px 14px;border:1px solid #c9ddd7;border-radius:12px;background:#eef7f3}.page-summary b{justify-self:center;color:#2a6258;font-size:12px;line-height:1.15;writing-mode:vertical-rl;letter-spacing:2px}.page-summary p{margin:0;color:#365764;font-size:13px;font-weight:600;line-height:1.55}.screening-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.range-legend{display:flex;align-items:center;gap:7px;margin:-2px 0 9px;color:#607983;font-size:11px;line-height:1.4}.range-legend i{display:block;width:22px;height:6px;border-radius:999px;background:#8cb9aa}.signal-glossary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.signal-glossary article{padding:9px 11px;border:1px solid #d7e4e0;border-radius:11px;background:#f5faf8}.signal-glossary b{color:#365a61;font-size:12px}.signal-glossary p{margin:3px 0 0;color:#647982;font-size:11px;line-height:1.5}.evidence-boundary{padding:11px 14px;border:1px solid #dfd0a9;border-radius:12px;background:#fffaf0}.evidence-boundary b{color:#765822;font-size:13px}.evidence-boundary p{margin:3px 0 0;color:#62542f;font-size:12px;line-height:1.6}

.preport__duo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.core-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
@media(max-width:760px){.preport__duo,.core-grid,.screening-grid{grid-template-columns:1fr}}
@media(max-width:760px){.preport__tabs{gap:5px;padding-bottom:9px}.preport__tabs button{min-height:46px;padding:0 6px;font-size:clamp(12px,3.2vw,14px)}.preport__head h2{font-size:20px}}
.panel{padding:13px 15px;border:1px solid #ffffff1f;border-radius:13px;background:#101e30cc}
.panel--ok{border-color:rgba(95,226,168,.35)}
.panel--warn{border-color:rgba(245,190,80,.4)}
.panel--notice{border-color:rgba(245,190,80,.35);background:rgba(64,52,24,.35)}
.panel h4{margin:0 0 9px;font-size:15px;color:var(--tx-strong,#eff6fc);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.panel ul,.panel ol{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.panel-note{margin:10px 0 0;font-size:13px;line-height:1.75;color:var(--tx-medium,#c6d0e8)}
.panel-note.interpretation{padding-left:10px;border-left:3px solid #8cb9aa;color:#3f626a;font-weight:600}
.panel-note.muted{color:var(--tx-faint,#96aebf)}
.panel-note.strong{color:#ffe0a0;font-weight:600}
.empty{margin:0;font-size:13px;color:var(--tx-faint,#96aebf);line-height:1.7}

.lv{display:inline-flex;align-items:center;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;white-space:nowrap}
.lv::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor;margin-right:6px}
.lv--success{background:rgba(95,226,168,.14);color:#8df0bb}
.lv--warning{background:rgba(245,190,80,.16);color:#ffe0a0}
.lv--danger{background:rgba(248,113,113,.16);color:#fca5a5}
.lv--neutral{background:#ffffff14;color:#a6bed3}

.metric-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;list-style:none;margin:0;padding:0}
@media(max-width:760px){.metric-grid{grid-template-columns:1fr}}
.metric-card{display:flex;flex-direction:column;gap:6px;padding:11px 13px;border:1px solid #ffffff1a;border-radius:11px;background:#ffffff08}
.metric-card--attention{border-color:rgba(245,190,80,.45);background:rgba(245,190,80,.07)}
.metric-card--slim{padding:12px 14px}
.metric-card__row{display:flex;justify-content:space-between;align-items:center;gap:8px}
.metric-card__row b,.detail header b{font-size:15px;color:var(--tx-medium,#c6d0e8)}
.metric-card strong,.detail strong{font-size:26px;color:var(--tx-strong,#eff6fc);font-variant-numeric:tabular-nums}
.metric-card strong small,.detail strong small{margin-left:8px;font-size:12px;font-weight:400;color:var(--tx-faint,#96aebf)}

.rangebar{position:relative;height:9px;border-radius:999px;background:#e7ecee26}
.rangebar i{position:absolute;inset-block:0;border-radius:999px;background:rgba(120,190,160,.55)}
.rangebar b{position:absolute;top:-5px;width:3px;height:19px;transform:translateX(-50%);border-radius:3px;background:#7fd4bf;box-shadow:0 0 0 2px #0a1524}
.rangebar--screening{background:linear-gradient(90deg,#ffffff20 0 50%,rgba(245,190,80,.25) 50% 70%,rgba(248,113,113,.25) 70% 100%)}
.rangescale{position:relative;height:20px;margin-top:8px;color:#8ba0b5;font-size:12px;line-height:1}
.rangescale>span{position:absolute;top:0}
.rangescale>span:first-child{left:0}
.rangescale>span:last-child{right:0}
.rangescale b{position:absolute;top:0;transform:translateX(-50%);color:#a6bed3;font-weight:600}

.detail{display:flex;flex-direction:column;gap:10px}
.detail header{display:flex;justify-content:space-between;align-items:center;gap:10px}
.detail-inline{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.detail-inline b{color:var(--tx-medium,#c6d0e8)}

.quality-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
@media(max-width:760px){.quality-grid{grid-template-columns:repeat(2,1fr)}}
.quality-item{display:grid;gap:4px;padding:12px;border-radius:10px;background:#ffffff08}
.quality-item span{font-size:12.5px;color:var(--tx-faint,#96aebf)}
.quality-item strong{font-size:19px;color:var(--tx-strong,#eff6fc);font-variant-numeric:tabular-nums}
.quality-verdict{width:max-content;padding:2px 6px;border-radius:999px;background:#fbf1dc;color:#9a6824;font-size:10px;font-style:normal;font-weight:700}.quality-verdict--missing{background:#eef2f2;color:#5e737c}

.advice-list{margin:0;padding-left:20px;display:grid;gap:8px;font-size:14px;line-height:1.75;color:var(--tx-medium,#c6d0e8)}
.rec-list{display:grid;gap:10px}
.rec-list li{display:grid;gap:4px;padding:11px 13px;border-radius:10px;background:#ffffff08}
.rec-list li.rec-list--attention{background:rgba(245,190,80,.08)}
.rec-list b{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--tx-strong,#eff6fc)}
.rec-list p{margin:0;font-size:13px;line-height:1.7;color:var(--tx-soft,#a6bed3)}


/* 个人报告与页面保持同一浅色服务体系，四页结构不变。 */
.preport__eyebrow,.preport__time{color:#72848b}.preport__head h2{color:#294354}
.chip--ok,.lv--success{color:#347064;background:#e5f2ed}.chip--warn,.lv--warning{color:#9a6824;background:#fbf1dc}.lv--danger{color:#a85454;background:#f8e8e8}.lv--neutral{color:#5e737c;background:#eef2f2}
.preport__tabs button{color:#58707a;background:#f8faf9;border-color:#d4e0df}.preport__tabs button.active{color:#fff;background:#2f5d7c;border-color:#2f5d7c}
.preport__page::-webkit-scrollbar-thumb{background:#c6d4d4}.preport__hero,.panel{background:#fff;border-color:#d7e2df;box-shadow:0 3px 10px rgba(38,55,70,.035)}.preport__hero h3,.panel h4,.metric-card strong,.detail strong{color:#294354}.preport__hero p,.panel-note.muted,.empty{color:#72848b}.panel-note,.advice-list{color:#526772}.panel--notice{background:#fffaf0;border-color:#ead4aa}.panel-note.strong{color:#916425}
.metric-card,.quality-item,.rec-list li{background:#f7faf9;border-color:#dce6e3}.metric-card--attention,.rec-list li.rec-list--attention{background:#fff7e9;border-color:#ecd2a2}.metric-card__row b,.detail header b{color:#49616e}.metric-card strong small,.detail strong small,.quality-item span{color:#7a8b92}
.rangebar{background:#e7efed}.rangebar i{background:#8cb9aa}.rangebar b{background:#397b6e;box-shadow:0 0 0 2px #fff}.rangebar--screening{background:linear-gradient(90deg,#dceae6 0 50%,#f7e6bf 50% 70%,#efd0d0 70% 100%)}.rangescale{color:#78909a}.rangescale b{color:#59727d}
@media(max-width:760px){.signal-glossary{grid-template-columns:1fr}.page-guide h3{font-size:19px}}
</style>
