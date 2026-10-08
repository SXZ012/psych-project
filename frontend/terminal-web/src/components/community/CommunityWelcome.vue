<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useDeviceConfig } from '@/composables/useDeviceConfig'
import { fetchWithTimeout } from '@/utils/net'
import qrcode from 'qrcode-generator'
import CommunityToolDialog from './CommunityToolDialog.vue'
import RelaxGame from './RelaxGame.vue'
import RelaxSession from './RelaxSession.vue'
import BodyRelaxSession from './BodyRelaxSession.vue'
import KnowledgeLibrary from './KnowledgeLibrary.vue'
import KnowledgeArtwork from './KnowledgeArtwork.vue'
import { knowledgePresentation } from './knowledgePresentation'
import { communityLibrary, loadCommunityLibrary } from '@/community/library'
import type { SelfCategory, ResourceKind, OfficialResource } from '@/config/community/libraryContent'
const selfScales = computed(() => communityLibrary.value.selfScales)
const officialResources = computed(() => communityLibrary.value.officialResources)
const scienceDetails = computed(() => communityLibrary.value.scienceDetails)
const windBackground = '/static/assets/community/relax/wind-meadow-carolina.jpg'
const bodyBackground = '/static/assets/community/relax/body-lake.webp'

const emit = defineEmits<{ start: []; 'entry-state': [atHome: boolean] }>()
const device = useDeviceConfig()
const serviceAvailable = ref(false)
const checkingService = ref(true)
let serviceTimer: number | undefined
let mounted = true
async function checkService() {
  try {
    const response = await fetchWithTimeout('/health', { cache: 'no-store' }, 5000)
    if (mounted) serviceAvailable.value = response.ok
  } catch { if (mounted) serviceAvailable.value = false }
  finally { if (mounted) checkingService.value = false }
}
const serviceLabel = computed(() => checkingService.value ? '正在检查服务' : !serviceAvailable.value ? '测评服务暂不可用 · 免费工具可用' : !device.deviceId.value ? '演示浏览 · 测评需绑定设备' : '测评服务已连接')
onMounted(() => { void loadCommunityLibrary(); void checkService(); serviceTimer = window.setInterval(() => void checkService(), 30000); window.addEventListener('online', checkService); window.addEventListener('offline', checkService) })
onBeforeUnmount(() => { mounted = false; clearInterval(serviceTimer); window.removeEventListener('online', checkService); window.removeEventListener('offline', checkService) })
type Section = 'home' | 'report' | 'relax' | 'self' | 'knowledge' | 'help'
const active = ref<Section>('home')
const selected = ref(0)
const selfCategory = ref<SelfCategory>('综合状态')
const selfCategories: SelfCategory[] = ['综合状态', '焦虑', '抑郁', '躯体感受', '生活习惯', '老年关怀']
const showAllScales = ref(false)
const largeReading = ref(false)
const readerBody = ref<HTMLElement | null>(null)
const knowledgeScroll = ref(0)
const readingSection = ref('overview')
function updateReadingSection() {
  const body = readerBody.value
  if (!body) return
  const top = body.getBoundingClientRect().top
  let current = 'overview'
  for (const section of body.querySelectorAll<HTMLElement>('section[id]')) {
    if (section.getBoundingClientRect().top <= top + 64) current = section.id
  }
  if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4 && currentResource.value.action) current = 'action'
  readingSection.value = current
}
function readSection(id: string) {
  const body = readerBody.value
  const section = body?.querySelector<HTMLElement>(`[id="${id}"]`)
  if (!body || !section) return
  body.scrollTo({ top: body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top - 12, behavior: 'instant' })
  readingSection.value = id
}
async function nextResource() {
  resourceIndex.value=(resourceIndex.value+1)%visibleResources.value.length
  await nextTick()
  readerBody.value?.scrollTo({top:0, behavior:'instant'})
  readingSection.value='overview'
}
const resourceKind = ref<ResourceKind>('science')
const resourceIndex = ref(0)
const resourceQrOpen = ref(false)
const readingOpen = ref(false)
const heroImage = '/static/assets/community/ux/community-selfcare-illustration-v1.png?v=20260922-2'
const toolDialog = ref<{ kind: 'relax' | 'self' | 'appointment' | 'hotline'; index?: number } | null>(null)
const relaxGameOpen = ref(false)

/**
 * 官方内容索引：标题、来源和摘要均取自对应政府/国家平台公开页面。
 * 终端提供可直接阅读的整理内容；原始页面入口保留为补充查证渠道。
 */
const content = {
  relax: { title:'情绪放松', intro:'从一段短练习开始，让身体和注意力慢慢安静下来。', items:[['1分钟平稳呼吸','适合暂时紧张或需要安静时','1 分钟'],['自然风声','用自然风声短暂休息','3 分钟'],['身体放松','跟随声音，让身体歇一会儿','2 分钟']] },
  self: { title:'心理自测', intro:'按需要选择状态筛查或生活感受问答，结果不等于诊断。', items:[['PHQ-4 情绪筛查','快速了解焦虑与抑郁方向','4 题'],['GAD-7 焦虑筛查','了解过去两周焦虑症状频率','7 题'],['PHQ-9 抑郁筛查','了解过去两周抑郁症状频率','9 题'],['GAD-2 焦虑快筛','两题快速筛查焦虑方向','2 题'],['PHQ-2 抑郁快筛','两题快速筛查抑郁方向','2 题'],['PHQ-15 躯体筛查','了解近四周常见躯体困扰','15 题']] },
  knowledge: { title:'官方科普与课程', intro:'精选官方健康知识、学习课程与求助指引，可直接阅读。', items:[['心理健康素养','国家卫生健康系统公开内容','官方科普'],['心理健康课程','国家智慧教育平台课程','在线学习'],['求助与服务','全国统一心理援助服务信息','官方指南']] },
  help: { title:'寻求帮助', intro:'选择社区咨询预约，或查看全国统一心理援助热线。', items:[['社区咨询预约','登记服务意向和方便时间','进入预约'],['心理援助热线','全国统一心理援助服务','12356']] },
} as const

const current = computed(() => active.value === 'relax' || active.value === 'self' || active.value === 'knowledge' || active.value === 'help' ? content[active.value] : null)
const visibleResources = computed(() => officialResources.value.filter(item => item.kind === resourceKind.value))
const visibleSelfScales = computed(() => selfScales.value.map((scale, index) => ({ ...scale, index })).filter(scale => scale.category === selfCategory.value))
const currentResource = computed<OfficialResource>(() => visibleResources.value[resourceIndex.value] || visibleResources.value[0] || officialResources.value[0]!)
const currentDetails = computed(() => scienceDetails.value[currentResource.value.title] || [])
const resourceQrSvg = computed(() => {
  if (!resourceQrOpen.value || !currentResource.value) return ''
  try {
    const qr = qrcode(0, 'M'); qr.addData(currentResource.value.url); qr.make()
    const count = qr.getModuleCount(); let path = ''
    for (let row=0; row<count; row+=1) for (let col=0; col<count; col+=1) if (qr.isDark(row,col)) path += `M${col} ${row}h1v1h-1z`
    return `<svg viewBox="-2 -2 ${count+4} ${count+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${count+4}" height="${count+4}" fill="#fff"/><path d="${path}" fill="#263c35"/></svg>`
  } catch { return '' }
})
const relaxActivities = [
  { title:'平稳呼吸', detail:'跟着舒适的节奏，慢慢放松下来', duration:'可选 1 / 2 / 3 分钟', cue:'吸气 4 秒 · 呼气 6 秒', image:'/static/assets/community/ux/38239121.jpg', tone:'breath' },
  { title:'自然风声', detail:'听一会儿轻柔风声，让注意力休息', duration:'可选 1 / 3 / 5 分钟', cue:'轻柔风声 · 可调节音量', image:windBackground, tone:'sound' },
  { title:'身体放松', detail:'跟随轻柔引导，让身体歇一会儿', duration:'2 分钟', cue:'坐着聆听 · 可随时暂停', image:'/static/assets/community/ux/28945280.jpg', tone:'stretch' },
]
/** 推荐位固定为 1 分钟的平稳呼吸：进入放松板块后不需要先做选择。 */
const relaxHero = relaxActivities[0]!
const relaxSideItems = relaxActivities.slice(1).map((item, index) => ({ ...item, index: index + 1 }))

const greeting = '这一刻，给自己一点轻松'
const headerSubtitle = computed(() => {
  if (active.value === 'home') return '选择一项服务开始体验'
  if (active.value === 'report') return '查询、查看或下载个人测评报告'
  if (active.value === 'relax') return greeting
  return current.value?.intro || ''
})

function openRelax(index: number) {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  selected.value = index
  toolDialog.value = { kind: 'relax', index }
}

watch(active, section => {
  emit('entry-state', section === 'home')
  if (section === 'relax') {
    // Prepare the existing backgrounds while the activity menu is visible.
    for (const url of [windBackground, bodyBackground]) {
      const image = new Image()
      image.src = url
      void image.decode().catch(() => {})
    }
  }
}, { immediate: true })
watch(resourceKind, () => { resourceIndex.value = 0; knowledgeScroll.value = 0 })
function go(section: Section) { readingOpen.value = false; resourceQrOpen.value = false; selected.value = 0; selfCategory.value = '综合状态'; showAllScales.value = false; active.value = section }
function openReports() { window.location.assign('/community/reports?terminal=1') }
function showOfficialSource() { resourceQrOpen.value = true }
function openResource(index: number) { resourceIndex.value = index; readingSection.value = 'overview'; readingOpen.value = true }
</script>

<template>
  <main :inert="toolDialog || relaxGameOpen ? true : undefined" class="hub" :class="[{ 'hub--feature': active !== 'home' }, `hub--${active}`]">
    <section v-if="active === 'knowledge' && readingOpen" class="immersive-reader" :class="{'reader--large':largeReading}">
      <header><NavigationButton @click="readingOpen=false">返回内容列表</NavigationButton><div><h1>科普阅读</h1></div><div class="reader-header-actions"><button :aria-pressed="largeReading" @click="largeReading=!largeReading">{{ largeReading ? '标准字号' : '大字阅读' }}</button><button class="reader-source-button" @click="showOfficialSource">官方原文</button><NavigationButton @click="go('home')">返回首页</NavigationButton></div></header>
      <div class="reader-layout"><aside><b>本篇导读</b><a href="#overview" :aria-current="readingSection==='overview' ? 'location' : undefined" @click.prevent="readSection('overview')">内容简介</a><a v-if="currentResource.points?.length" href="#points" :aria-current="readingSection==='points' ? 'location' : undefined" @click.prevent="readSection('points')">阅读重点</a><a v-for="(section,index) in currentDetails" :key="section.title" :href="`#detail-${index}`" :aria-current="readingSection===`detail-${index}` ? 'location' : undefined" @click.prevent="readSection(`detail-${index}`)">{{ section.title }}</a><a v-if="currentResource.action" href="#action" :aria-current="readingSection==='action' ? 'location' : undefined" @click.prevent="readSection('action')">行动建议</a></aside><article ref="readerBody" @scroll="updateReadingSection"><section id="overview" class="reader-hero"><div><span class="reader-topic">{{ knowledgePresentation(currentResource.title).topic }}</span><h2>{{ currentResource.title }}</h2><p>{{ currentResource.summary }}</p><span class="reader-source">{{ currentResource.source }}</span></div><KnowledgeArtwork class="reader-cover" :theme="knowledgePresentation(currentResource.title).theme" /></section><section v-if="currentResource.points?.length" id="points" class="reader-section reader-takeaways"><h2>先了解这几件事</h2><div class="reader-points"><p v-for="(point,index) in currentResource.points" :key="point"><i>{{ index+1 }}</i>{{ point }}</p></div></section><section v-for="(section,index) in currentDetails" :id="`detail-${index}`" :key="section.title" class="reader-section reader-prose"><h2><span class="reader-section-number">{{ String(index+1).padStart(2,'0') }}</span>{{ section.title }}</h2><p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p><ul v-if="section.bullets"><li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li></ul></section><section v-if="currentResource.action" id="action" class="reader-section"><h2>今天可以怎么做</h2><div class="reader-action">{{ currentResource.action }}</div></section><footer><p>本文依据公开的官方健康资料整理，用于健康教育，不替代专业诊疗。</p><div class="reader-next"><span>继续了解<b>{{ visibleResources[(resourceIndex+1)%visibleResources.length]?.title }}</b></span><button @click="nextResource">阅读下一篇 →</button><NavigationButton @click="readingOpen=false">返回列表</NavigationButton></div></footer></article></div>
    </section>
    <KnowledgeLibrary v-else-if="active === 'knowledge'" :resources="officialResources" :kind="resourceKind" :scroll-position="knowledgeScroll" @scroll="knowledgeScroll=$event" @home="go('home')" @select="resourceKind=$event" @read="openResource" />
    <section v-else class="hub-main">
      <header class="hub-top"><NavigationButton v-if="active !== 'home'" class="feature-back" @click="go('home')">返回首页</NavigationButton><div><h1>{{ active === 'home' ? '今天，也关心一下自己的状态' : active === 'report' ? '我的报告' : current?.title }}</h1><p>{{ headerSubtitle }}</p></div><span v-if="active === 'home'" class="hub-status"><i />{{ serviceLabel }}</span></header>

      <div v-if="active === 'home'" class="home-grid">
        <article class="primary-card card-green"><div class="primary-copy"><span class="tag">核心服务</span><h2>心理状态辅助测评</h2><p>通过 60 秒非接触采集，辅助了解近期心理状态。</p><ul><li>预训练 3 题，可跳过</li><li>采集后约 3–4 分钟出报告</li></ul></div><button :disabled="!serviceAvailable || !device.deviceId.value" @click="emit('start')">开始测评</button><div class="hero-art"><span /><img :src="heroImage" alt="" /></div></article>
        <article class="report-card card-blue"><span class="tag">个人报告</span><h2>查看我的报告</h2><p>输入报告编号查看结果，也可扫码保存 PDF。</p><div class="report-preview" aria-hidden="true"><i /><i /><i /><span><b /><b /><b /></span></div><button @click="openReports">查看报告 <b>→</b></button></article>

        <section class="tools"><header><h2>日常心理工具</h2><span>按需要选择</span></header><div class="tool-row">
          <button class="tool-card peach" @click="go('relax')"><i>◌</i><span><b>情绪放松</b><small>呼吸 · 自然声音</small></span><em>→</em></button>
          <button class="tool-card violet" @click="go('self')"><i>✓</i><span><b>心理自测</b><small>{{ selfScales.length }} 项自测 · 按需选择</small></span><em>→</em></button>
          <button class="tool-card yellow" @click="go('knowledge')"><i>◇</i><span><b>官方科普</b><small>科普文章 · 国家平台课程</small></span><em>→</em></button>
        </div></section>
        <button class="help-strip" @click="go('help')"><span><b>社区心理服务与求助</b><small>查看咨询预约、12356 心理援助和紧急求助指引</small></span><em>查看支持方式 →</em></button>
      </div>

      <div v-else-if="active === 'report'" class="section-layout">
        <article class="feature-card report-feature"><span>个人报告</span><h2>查看测评结果与 PDF</h2><p>报告通常在测评结束后 3 至 4 分钟生成。请妥善保管报告编号和访问链接。</p><button @click="openReports">进入报告中心</button></article><aside class="info-card"><h3>可以查看</h3><p>结果总览与情绪状态参考</p><p>核心指标与生活建议</p><p>可保存的个人 PDF 报告</p></aside>
      </div>

      <div v-else-if="active === 'relax'" class="relax-page">
        <div class="relax-cards">
          <button class="relax-hero" @click="openRelax(0)">
            <span class="relax-hero__tag">今日推荐</span>
            <span class="relax-hero__ring" aria-hidden="true"><i /><i /><i /><b /></span>
            <b class="relax-hero__title">{{ relaxHero.title }}</b>
            <small class="relax-hero__desc">跟着节奏，{{ relaxHero.cue }}</small>
            <em class="relax-hero__cta">开始练习 · {{ relaxHero.duration }}</em>
          </button>
          <div class="relax-side">
            <button v-for="item in relaxSideItems" :key="item.title" class="relax-side-card" :class="`relax-side-card--${item.tone}`" @click="openRelax(item.index)">
              <span class="relax-side-card__icon" aria-hidden="true">
                <svg v-if="item.tone === 'sound'" viewBox="0 0 36 36" width="36" height="36" fill="none"><path d="M8 15v6M14 10v16M20 6v24M26 10v16M32 15v6" stroke="#47809F" stroke-width="2.5" stroke-linecap="round" /></svg>
                <svg v-else viewBox="0 0 36 36" width="36" height="36" fill="none"><path d="M8 19c0-8 5-12 10-12s10 4 10 12M8 18v8h5v-8H8Zm15 0v8h5v-8h-5ZM23 28c-2 3-5 3-7 2" stroke="#C08F3E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </span>
              <span class="relax-side-card__copy"><b>{{ item.title }}</b><small>{{ item.detail }} <span class="relax-duration-label">{{ item.duration }}</span></small></span>
              <span class="relax-side-card__play" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="20" height="20"><path d="M7 4.5l9 5.5-9 5.5z" :fill="item.tone === 'sound' ? '#47809F' : '#C08F3E'" /></svg>
              </span>
            </button>
            <button class="relax-side-card relax-side-card--game" @click="relaxGameOpen=true">
              <span class="relax-side-card__icon relax-game-card__icon" aria-hidden="true">🍊</span>
              <span class="relax-side-card__copy"><b>轻挥果园</b><small>轻轻划过水果，收集一点轻松</small></span>
              <span class="relax-side-card__play" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M7 4.5l9 5.5-9 5.5z" fill="#b87b42" /></svg></span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="active === 'self'" class="self-page">
        <article class="self-recommend-bar"><div><span>推荐</span><h2>PHQ-4 情绪快速筛查</h2></div><p>同时了解焦虑与抑郁方向</p><div class="recommend-pills"><b>4题</b><b>约1分钟</b></div><button @click="toolDialog={kind:'self',index:0}">开始　→</button></article>
        <section class="self-library" :class="{'self-library--many':visibleSelfScales.length>2}">
          <header><div><h3>你想了解哪一方面？</h3><p>选择一个方向，按需要了解自己的状态</p></div><button class="all-scales-link" @click="showAllScales=true">查看全部 {{ selfScales.length }} 项自测</button></header>
          <nav class="self-filters"><button v-for="category in selfCategories" :key="category" type="button" :aria-pressed="selfCategory===category" :class="{active:selfCategory===category}" @click="selfCategory=category">{{ category }}</button></nav>
          <div class="self-category-title"><span>{{ selfCategory }}</span><p>{{ selfCategory==='综合状态'?'适合第一次了解整体状态':selfCategory==='焦虑'||selfCategory==='抑郁'?'可先快筛，再按需要完成完整版':'按近期真实感受完成专项筛查' }}</p></div>
          <div class="self-cards"><article v-for="scale in visibleSelfScales" :key="scale.short" :class="['self-card',`self-card--${scale.tone}`, { 'self-card--compact': selfCategory === '生活习惯' || selfCategory === '老年关怀' }]"><div class="scale-copy"><h3>{{ scale.title }}</h3><p>{{ scale.description }}</p><small>{{ scale.meta.split(' · ').slice(0,2).join(' · ') }}</small></div><button @click="selected=scale.index; toolDialog={kind:'self',index:scale.index}">开始测评　→</button></article></div>
        </section>
        <div v-if="showAllScales" class="scale-catalog" @click.self="showAllScales=false"><section><header><div><span>量表目录</span><h2>全部 {{ selfScales.length }} 项心理自测</h2></div><NavigationButton @click="showAllScales=false">返回分类</NavigationButton></header><div><button v-for="(scale,index) in selfScales" :key="scale.short" :class="`catalog-card catalog-card--${scale.tone}`" @click="showAllScales=false; selected=index; toolDialog={kind:'self',index}"><div><b>{{ scale.title }}</b><p>{{ scale.description }}</p><small>{{ scale.category }} · {{ scale.meta }}</small></div><em>开始测评　→</em></button></div><footer>所有结果仅作为状态筛查线索，不构成医学诊断。</footer></section></div>
      </div>

      <div v-else-if="active === 'help'" class="help-page">
        <section class="support-simple"><div class="support-actions"><button class="support-action support-action--appointment" @click="toolDialog={kind:'appointment'}"><i>约</i><span><b>社区咨询预约</b><small>登记服务意向和方便时间</small></span><em>进入预约 →</em></button><button class="support-action support-action--hotline" @click="toolDialog={kind:'hotline'}"><i>电</i><span><b>心理援助热线</b><small>全国统一心理援助服务</small></span><strong>12356</strong><em>查看热线 →</em></button></div></section>
      </div>
      <BodyRelaxSession v-if="toolDialog?.kind==='relax' && toolDialog.index===2" @close="toolDialog=null" @home="toolDialog=null; go('home')" />
      <RelaxSession v-else-if="toolDialog?.kind==='relax'" :key="toolDialog.index" :index="toolDialog.index ?? 0" @close="toolDialog=null" @home="toolDialog=null; go('home')" />
      <CommunityToolDialog v-else-if="toolDialog" :key="`${toolDialog.kind}-${toolDialog.index}`" @support="toolDialog=null; go('help')" @assessment="toolDialog={kind:'self',index:$event}" :kind="toolDialog.kind" :index="toolDialog.index" @close="toolDialog=null" @home="toolDialog=null; go('home')" />
      <RelaxGame v-if="relaxGameOpen" @close="relaxGameOpen=false" @home="relaxGameOpen=false; go('home')" />
    </section>
    <Teleport to="body"><div v-if="resourceQrOpen" class="resource-modal" role="dialog" aria-modal="true" aria-label="官方原文" @click.self="resourceQrOpen=false"><section><button class="resource-close" aria-label="关闭官方原文" @click="resourceQrOpen=false">×</button><div class="resource-qr" v-html="resourceQrSvg" /><h2>{{ currentResource.title }}</h2><p>使用手机扫码，在官方页面查看完整内容</p><small>{{ currentResource.source }}</small></section></div></Teleport>
  </main>
</template>

<style scoped>
.hub{width:100%;height:100%;display:grid;grid-template-columns:1fr;overflow:hidden}
.hub-main{min-width:0;display:grid;grid-template-rows:82px 1fr;padding:0 28px 20px}
.hub-top{display:flex;align-items:center;justify-content:space-between}
.hub-top h1{margin:0;color:#253e36}
.hub-top p{margin:4px 0 0}
.hub-status{display:flex;align-items:center;gap:7px}
.hub-status i{width:8px;height:8px;border-radius:50%;background:#56a477}
.home-grid{min-height:0;display:grid;grid-template-columns:1.7fr .9fr;grid-template-rows:minmax(190px,1.4fr) minmax(130px,.8fr) 76px}
.primary-card{position:relative;overflow:hidden}
.report-card{position:relative;overflow:hidden}
.feature-card{position:relative;overflow:hidden;border-radius:20px}
.info-card{position:relative;overflow:hidden;border-radius:20px;padding:24px}
.card-green{background:linear-gradient(125deg,#d9ebe1 0%,#e8f2ec 68%,#f3e4d8 100%)}
.card-blue{background:linear-gradient(140deg,#d9e8f2,#e9f0f5)}
.tag{display:inline-block;color:#527168;font-weight:750}
.primary-copy{position:relative;z-index:2;max-width:68%}
.primary-card h2{margin:12px 0 6px}
.report-card h2{margin:12px 0 6px}
.primary-card p{margin:0;color:#587068}
.report-card p{margin:0;color:#587068}
.primary-card ul{display:flex;gap:18px;margin:13px 0 17px;padding:0;list-style:none;color:#49665d}
.primary-card li::before{content:'✓';margin-right:5px;color:#36745f}
.primary-card button{position:absolute;z-index:3;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:56px;min-height:56px;margin:0;padding:0 20px;border:0;color:#fff;font-weight:750;line-height:1}
.report-card button{position:absolute;z-index:3;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:56px;min-height:56px;margin:0;padding:0 20px;border:0;color:#fff;font-weight:750;line-height:1}
.primary-card button{background:#397866}
.feature-card button{min-height:48px;padding:0 24px;border:0;border-radius:12px;color:#fff;font-size:15px;font-weight:750}
.hero-art{position:absolute;z-index:1;display:grid;place-items:center}
.hero-art>span{position:absolute;border-radius:62% 38% 44% 56% / 47% 55% 45% 53%;background:rgba(255,255,255,.6);transform:rotate(-5deg)}
.hero-art img{position:relative;filter:drop-shadow(0 12px 18px rgba(48,89,75,.12))}
.report-preview{position:absolute;right:-22px;bottom:9px;width:132px;height:138px;transform:rotate(5deg)}
.report-preview>i{position:absolute;width:84px;height:108px;border-radius:11px;background:rgba(255,255,255,.58);box-shadow:0 8px 18px rgba(63,94,114,.1)}
.report-preview>i:nth-child(1){right:26px;top:12px;transform:rotate(-11deg)}
.report-preview>i:nth-child(2){right:13px;top:15px;transform:rotate(-2deg)}
.report-preview>i:nth-child(3){right:0;top:20px;background:#fff}
.report-preview>span{position:absolute;z-index:2;right:12px;top:45px;width:60px;display:grid;gap:8px}
.report-preview b{height:5px;border-radius:9px;background:#86a9bf}
.report-preview b:nth-child(1){width:74%;background:#65a087}
.report-preview b:nth-child(2){width:100%}
.report-preview b:nth-child(3){width:58%;background:#e0b477}
.report-card h2{position:relative;z-index:2;max-width:74%}
.report-card p{position:relative;z-index:2;max-width:74%}
.report-card button{background:#547e9d}
.report-card button b{margin-left:14px}
.tools{grid-column:1/-1;display:grid;grid-template-rows:auto 1fr;min-height:0}
.tools header{display:flex;align-items:center;justify-content:space-between}
.tools h2{margin:0}
.tools header span{color:#81908a}
.tool-row{min-height:0;display:grid;grid-template-columns:repeat(3,1fr)}
.tool-card{position:relative;overflow:hidden;display:flex;align-items:center;gap:16px;height:100%;color:#344b44;text-align:left}
.tool-card::after{content:'';position:absolute;right:-27px;top:-34px;width:112px;height:112px;border-radius:42% 58% 66% 34% / 50% 44% 56% 50%;background:rgba(255,255,255,.32)}
.tool-card>i{position:relative;z-index:1}
.tool-card span{position:relative;z-index:1}
.tool-card em{position:relative;z-index:1}
.tool-card>i{display:grid;place-items:center;font-style:normal}
.tool-card span{flex:1}
.tool-card b{display:block}
.tool-card small{display:block}
.tool-card small{margin-top:5px;color:#6f7b77}
.tool-card em{font-style:normal}
.help-strip{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:0 292px 0 28px;color:#344b44;text-align:left}
.help-strip b{display:block}
.help-strip small{display:block}
.help-strip small{margin-top:3px;color:#667a71}
.help-strip em{white-space:nowrap;color:#397866;font-style:normal;font-weight:750}
.section-layout{min-height:0;display:grid;grid-template-columns:1.45fr .8fr;gap:16px;align-content:center}
.feature-card{padding:38px;min-height:310px;background:#dce9f3}
.feature-card>span{color:#557b96;font-size:12px;font-weight:700}
.feature-card h2{margin:16px 0 10px;font-size:29px}
.feature-card p{max-width:560px;color:#5a6f78;line-height:1.8}
.feature-card button{background:#547e9d;margin-top:30px}
.info-card{background:#fff}
.info-card h3{font-size:18px}
.info-card p{padding:12px 0;margin:0;border-bottom:1px solid #e6ece9;color:#596c65}
@media (max-width:1050px),(max-height:650px){
  .hub{grid-template-columns:1fr}
  .hub-main{grid-template-rows:66px 1fr;padding:0 18px 12px}
  .hub-top h1{font-size:21px}
  .home-grid{grid-template-rows:minmax(160px,1.2fr) minmax(100px,.8fr) 58px}
  .primary-card h2{margin:7px 0 4px}
  .report-card h2{margin:7px 0 4px}
  .primary-card ul{margin:8px 0 10px}
  .primary-card button{left:17px;bottom:17px;min-height:42px}
  .report-card button{left:17px;bottom:17px;min-height:42px}
  .hero-art{transform:scale(.75)}
  .report-preview{right:-38px;bottom:-2px;transform:scale(.78) rotate(5deg)}
  .tool-card{padding:10px 12px}
  .tool-card>i{width:36px;height:36px}
}
.self-library{box-sizing:border-box}
.self-library header p{margin-top:6px}
.self-library .scale-copy h3{margin-bottom:10px}
.self-library .scale-copy p{line-height:1.65}
.self-library .self-card::before{display:none!important}
.hub--self .self-library{row-gap:0}
.hub--self .self-library>header{align-self:end}
.self-recommend-bar{animation:selfRise .52s cubic-bezier(.2,.72,.28,1) both}
.self-library{animation:selfRise .52s cubic-bezier(.2,.72,.28,1) both}
.self-library{animation-delay:.08s}
.self-recommend-bar{position:relative;overflow:hidden}
.self-recommend-bar::before{content:'';position:absolute;border-radius:50%;pointer-events:none}
.self-recommend-bar::after{content:'';position:absolute;border-radius:50%;pointer-events:none}
.self-recommend-bar::before{right:-52px;bottom:-42px;width:175px;height:175px;background:rgba(255,255,255,.36);animation:selfFloat 7s ease-in-out infinite}
.self-recommend-bar::after{right:42px;bottom:78px;width:46px;height:46px;background:rgba(126,181,158,.22);animation:selfFloat 5.5s ease-in-out -1.5s infinite reverse}
.self-recommend-bar>*{position:relative;z-index:1}
@keyframes selfRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes selfFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(-8px,-10px,0)}}
@media (prefers-reduced-motion:reduce){
  .self-recommend-bar{animation:none!important}
  .self-library{animation:none!important}
  .self-recommend-bar::before{animation:none!important}
  .self-recommend-bar::after{animation:none!important}
  .self-filters button.active::after{animation:none!important}
  .self-library .self-card{transition:none!important}
  .self-filters button{transition:none!important}
}
.self-library .self-card--teal{background:#e2f0eb!important}
.self-library .self-card--blue{background:#e3eef5!important}
.self-library .self-card--violet{background:#ece6f4!important}
.self-library .self-card--amber{background:#f4ecd9!important}
.self-library .self-card--green{background:#e8f1dd!important}
.self-library .self-card--rose{background:#f3e5e3!important}
.hub--self .hub-top{padding-bottom:8px}
.self-page{align-items:stretch}
.self-library{min-width:0}
.self-library>header{display:flex;align-items:center;justify-content:space-between}
.self-library h3{margin:0;color:#2e443d}
.self-library header p{margin:4px 0 0;color:#7b8984}
.self-library>header>span{padding:7px 11px;border-radius:999px;background:#f0f4f1;color:#63756e;font-size:10px}
.self-filters button{font-weight:700}
.self-filters button.active{border-color:#4e806f}
.self-library .self-card{flex-direction:column}
.self-card>div{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between}
.self-card>div span{padding:4px 7px;border-radius:6px;background:rgba(255,255,255,.72);font-size:9px;font-weight:750}
.self-card>div em{color:#718079;font-size:10px;font-style:normal;font-weight:800}
.self-library .self-card h3{margin:10px 0 3px;font-size:14px}
.self-library .self-card p{min-height:29px;font-size:10px;line-height:1.45}
.self-card footer{position:relative;z-index:1;display:flex;align-items:end;justify-content:space-between;margin-top:auto;padding-top:8px}
.self-card footer small{margin:0;color:#718079;font-size:9px}
.self-card footer b{font-size:10px}
.self-card--violet{background:#eee9f5!important;border-color:#e2d9ee!important}
.self-card--blue{background:#e7f0f6!important;border-color:#d7e6ef!important}
.self-card--amber{background:#f5eddc!important;border-color:#ebdfc8!important}
.self-card--teal{background:#e4f0ed!important;border-color:#d2e5df!important}
.self-card--green{background:#e9f1df!important;border-color:#dce9cc!important}
.self-card--rose{background:#f4e8e6!important;border-color:#ead8d4!important}
.self-library .self-card:active{transform:scale(.985)}
@media (max-width:1050px),(max-height:650px){
  .self-filters button{padding:0 9px}
  .self-library .self-card h3{margin-top:7px;font-size:12px}
  .self-library .self-card p{font-size:9px}
}
.hub.hub--feature{grid-template-columns:1fr;background:#f4f6f3}
.hub--feature .hub-main{padding:0 34px 24px}
.hub--feature .hub-top{display:grid;grid-template-columns:190px 1fr 150px;gap:22px}
.hub--feature .hub-top>div{text-align:center}
.feature-back{min-height:46px;padding:0 16px;color:#355f52;font-weight:750;text-align:left}
.hub--feature .relax-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .self-page{margin:0 auto}
.hub--feature .knowledge-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .help-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .section-layout{width:min(1120px,100%);margin:auto}
.relax-page{min-height:0;display:grid}
.self-page{gap:16px;min-height:0;display:grid}
.knowledge-page{min-height:0;display:grid}
.help-page{min-height:0;gap:16px}
.article-lead button{padding:0 24px;border:0;color:#fff;font-weight:750}
.topic-list{padding:24px}
.self-page{grid-template-columns:1fr 1fr}
.self-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:center}
.self-card{position:relative;overflow:hidden;min-height:94px;padding:14px 16px;border:0;color:#344841;text-align:left}
.self-card::after{content:'';position:absolute;right:-24px;bottom:-42px;width:128px;height:100px;border-radius:56% 44% 32% 68% / 52% 40% 60% 48%;background:rgba(255,255,255,.28)}
.self-card--0{background:#e5dff2}
.self-card--3{background:#e5dff2}
.self-card--1{background:#dbeaf3}
.self-card--4{background:#dbeaf3}
.self-card--2{background:#f1e5cd}
.self-card--5{background:#f1e5cd}
.self-card.active{box-shadow:inset 0 0 0 2px #596b6340,0 10px 25px #384c4419}
.self-card>span{position:absolute;right:14px;top:7px;color:#30433c2e;font-size:24px;font-weight:800}
.self-card h3{position:relative;z-index:1}
.self-card p{position:relative;z-index:1}
.self-card small{position:relative;z-index:1}
.self-card h3{margin:0 0 3px;font-size:14px}
.self-card p{margin:0;color:#65766f;font-size:10px}
.self-card small{display:block;margin-top:6px;font-size:10px;font-weight:700}
.knowledge-page{grid-template-columns:1.55fr .65fr}
.article-shelf{display:grid;grid-template-rows:1.25fr .65fr;gap:14px}
.article-lead{position:relative;overflow:hidden;display:grid;grid-template-columns:1.05fr .95fr;background:#f5ecd2}
.article-photo{min-width:0;background-image:linear-gradient(90deg,rgba(239,227,189,.04),#f5ecd2 96%),var(--article-image);background-position:center;background-size:cover}
.article-copy{display:flex;flex-direction:column;justify-content:center;padding:24px 30px 24px 8px}
.article-copy>span{color:#8a7134;font-size:11px;font-weight:750}
.article-lead h2{margin:9px 0 5px;font-size:25px;line-height:1.25}
.article-lead p{margin:0;color:#70684e;font-size:12px;line-height:1.55}
.article-copy>small{margin-top:8px;color:#887d60;font-size:9px;line-height:1.45}
.article-lead button{min-height:42px;margin-top:11px;background:#846b30;align-self:flex-start}
.topic-list button{display:grid;gap:3px;width:100%;padding:14px 8px;border:0;border-bottom:1px solid #e8eeeb;background:transparent;color:#63756e;text-align:left}
.topic-list button span{font-size:14px}
.topic-list button em{color:#93a09b;font-size:9px;font-style:normal;font-weight:500}
.topic-list button.active{padding-left:13px;border-radius:10px;background:#f5eed8;color:#806827;font-weight:750}
.topic-list button.active em{color:#8d7a46}
.source-note{margin-top:18px;padding:14px}
.source-note b{font-size:11px}
.source-note p{margin:5px 0 0;color:#7b8984;font-size:9px;line-height:1.55}
.resource-modal{position:fixed;z-index:300;inset:0;display:grid;place-items:center;background:rgba(24,42,35,.44);backdrop-filter:blur(5px)}
.resource-modal section{position:relative;width:min(430px,calc(100vw - 48px));padding:28px;border-radius:25px;background:#fff;text-align:center;box-shadow:0 26px 70px rgba(20,43,34,.3)}
.resource-close{position:absolute;right:13px;top:12px;width:38px;height:38px;border:0;background:#edf2ef;color:#4d675e;font-size:24px}
.resource-qr{width:190px;height:190px;margin:0 auto 14px}
.resource-qr :deep(svg){width:100%;height:100%}
.resource-modal h2{margin:0 32px 6px;font-size:20px}
.resource-modal p{margin:0 0 7px;color:#61736c}
.resource-modal small{color:#89958f;font-size:10px}
.hub--help{background:#f7f6f3}
.hub--help .hub-main{box-sizing:border-box;grid-template-rows:120px minmax(0,1fr);padding:0 34px 20px}
.hub--help .hub-top{border-bottom:1px solid #e2e6e2}
.hub--help .hub-top h1{color:#30473f}
.hub--help .hub-top p{color:#788780}
.hub--help .feature-back{border-color:#d7e0dc;color:#3e6659;background:#fff}
.help-page{display:grid;place-items:center;padding:24px;border-radius:28px}
.support-simple{width:min(1020px,100%);padding:42px}
.support-actions{display:grid;grid-template-columns:1fr 1fr}
.support-action{position:relative;display:grid;grid-template-columns:62px 1fr auto;grid-template-rows:auto auto;align-items:center;min-height:210px;padding:32px;color:#344941;text-align:left}
.support-action>i{grid-row:1/3;display:grid;place-items:center;width:52px;height:52px;background:rgba(255,255,255,.8);font-size:19px;font-style:normal;font-weight:750}
.support-action span{align-self:end}
.support-action b{display:block}
.support-action small{display:block}
.support-action small{margin-top:6px;color:#6e7d77}
.support-action em{grid-column:2;align-self:start;margin-top:17px;color:#436c5e;font-style:normal;font-weight:750}
.support-action strong{grid-row:1/3;align-self:center;color:#536a83;font-size:31px;letter-spacing:.08em}
.support-action--appointment{border-color:#d6e4dc}
.support-action--hotline{border-color:#d8e2ec}
.support-action--hotline>i{color:#526f89}
.support-action--hotline em{color:#526f89}
.hub--help .help-page{box-sizing:border-box;width:100%;max-width:none;height:100%;margin:0;padding:20px 0;display:grid;place-items:center;background:transparent;border-radius:0}
.hub--help .support-simple{box-sizing:border-box;width:100%;max-width:none;padding:0;background:transparent;box-shadow:none}
.hub--help .support-actions{width:100%;gap:24px}
.hub--help .support-action{box-sizing:border-box;height:250px;min-height:250px;grid-template-columns:62px minmax(0,1fr) auto;grid-template-rows:minmax(0,1fr) auto;align-content:stretch}
.hub--help .support-action>i{grid-column:1;grid-row:1/3;align-self:center}
.hub--help .support-action span{grid-column:2;grid-row:1;align-self:center}
.hub--help .support-action strong{grid-column:3;grid-row:1;align-self:center}
.hub--help .support-action em{grid-column:2/-1;grid-row:2;align-self:end;margin:0;font-size:16px;line-height:1.4}
.kind-switch{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.kind-switch button{padding:9px 5px!important;border:0!important;text-align:center!important}
.resource-list{display:grid;gap:5px;max-height:220px;margin-top:10px;overflow:auto}
.resource-list button b{display:block}
.resource-list button small{display:block}
.resource-list button small{margin-top:2px;color:#87958f}
.reading-action{padding:16px 18px;border-radius:14px;background:#edf4df}
.reading-action p{margin:6px 0 0;color:#596a4f;line-height:1.6}
.immersive-reader{position:absolute;z-index:20;inset:0;display:grid;grid-template-rows:82px 1fr;color:#2c443c}
.immersive-reader>header{display:grid;grid-template-columns:220px 1fr 280px;align-items:center;padding:0 34px;background:#fff}
.immersive-reader>header button{justify-self:start;min-height:44px;padding:0 16px;border:1px solid #d3ded8;border-radius:11px;background:#fff;color:#3b6758;font-weight:750}
.immersive-reader>header div{text-align:center}
.immersive-reader>header span{color:#769087;font-size:10px}
.immersive-reader>header h1{margin:3px 0;font-size:21px}
.immersive-reader>header>small{text-align:right;color:#7d8d87;font-size:10px}
.reader-layout{min-height:0;display:grid;grid-template-columns:205px 1fr;width:min(1180px,100%);margin:0 auto;padding:24px 30px;box-sizing:border-box;gap:24px}
.reader-layout>aside{position:sticky;top:20px;align-self:start;display:grid;gap:6px;padding:20px;background:#fff}
.reader-layout>aside>b{margin-bottom:9px}
.reader-layout>aside a{padding:10px;border-radius:9px;color:#667970;text-decoration:none;font-size:12px}
.reader-layout>aside a:hover{background:#eef4f0}
.reader-layout>aside button{min-height:42px;margin-top:10px;border:1px solid #cfdcd5;border-radius:10px;background:#fff;color:#3b6859;font-weight:700}
.reader-layout>article{min-width:0;overflow:auto;padding-right:8px;scroll-behavior:smooth}
.reader-hero{position:relative;overflow:hidden;min-height:240px;background-image:linear-gradient(90deg,rgba(38,60,52,.92),rgba(38,60,52,.44)),var(--reader-image);background-position:center;background-size:cover;color:#fff}
.reader-hero>div{max-width:590px;padding:38px}
.reader-hero span{font-size:11px}
.reader-hero h2{margin:12px 0;font-size:31px}
.reader-hero p{line-height:1.8}
.reader-section{padding:30px 30px 6px}
.reader-section>span{color:#718c82;font-size:11px;font-weight:800}
.reader-section>h2{margin:7px 0 18px;font-size:23px}
.reader-points{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.reader-points p{display:flex;gap:12px;margin:0;padding:17px;background:#fff;line-height:1.65}
.reader-points i{flex:0 0 auto;display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:#dfeee6;color:#397866;font-style:normal;font-weight:800}
.reader-action{padding:22px;font-size:16px;line-height:1.8}
.reader-videos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.reader-videos button{position:relative;overflow:hidden;min-height:150px;padding:18px;border:0;border-radius:16px;background-image:linear-gradient(0deg,rgba(28,47,40,.9),rgba(28,47,40,.12)),var(--video-image);background-position:center;background-size:cover;color:#fff;text-align:left}
.reader-videos button>i{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.88);color:#3e6859;font-style:normal}
.reader-videos button>span{position:absolute;right:16px;bottom:15px;left:16px}
.reader-videos small{display:block}
.reader-videos b{display:block}
.reader-videos em{display:block}
.reader-videos b{margin:4px 0;font-size:13px}
.reader-videos em{font-size:9px;font-style:normal;opacity:.8}
.reader-layout>article>footer{padding:26px 30px 35px;color:#7d8d87;font-size:11px;text-align:center}
.article-shelf--simple{grid-template-rows:1fr auto}
.article-note{padding:18px 22px;color:#405950}
.article-note p{margin:5px 0 0;color:#6e7f78;line-height:1.6}
.reader-prose{margin:18px 30px 0;padding:28px 32px;background:#fff}
.reader-prose p{margin:0 0 14px;color:#4e625a;font-size:15px;line-height:1.95}
.reader-prose ul{display:grid;gap:9px;margin:18px 0 0;padding:0;list-style:none}
.reader-prose li{position:relative;padding:12px 15px 12px 38px;border-radius:11px;background:#f2f6f3;color:#50635c;line-height:1.65}
.reader-prose li::before{content:'•';position:absolute;left:17px;color:#4b876f;font-size:20px;font-weight:900}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .hub-main{padding:0 20px 14px}
  .hub--feature .hub-top{gap:12px}
  .feature-back{min-height:40px;font-size:12px}
  .topic-list{padding:18px}
  .self-card{min-height:94px}
  .article-lead{padding:25px}
}
.self-recommend-bar{color:#29483e}
.self-recommend-bar span{color:#4c806f;font-weight:800}
.self-recommend-bar p{margin:0;color:#65776f;font-size:11px}
.recommend-pills b{border-radius:99px}
.self-recommend-bar>button{border:0;background:#397866;color:#fff;font-weight:800}
.self-library>header .all-scales-link{font-weight:750}
.self-category-title{gap:10px;display:flex;align-items:baseline}
.self-category-title span{color:#304b42;font-weight:850}
.self-category-title p{margin:0;color:#84918c}
.self-library .self-cards{align-content:start;display:grid}
.self-library .self-card{position:relative;align-items:center;gap:16px;box-sizing:border-box;text-align:left}
.self-library .self-card::after{width:150px;height:125px;right:auto;bottom:-48px;left:-38px}
.scale-copy{position:relative;z-index:1;display:block!important}
.self-library .self-card>button{font-weight:800;position:relative;z-index:1;white-space:nowrap}
.scale-catalog{position:fixed;z-index:410;inset:0;display:grid;place-items:center;padding:24px;backdrop-filter:blur(6px)}
.scale-catalog>section{box-sizing:border-box;overflow:auto;box-shadow:0 26px 80px rgba(25,44,37,.3)}
.scale-catalog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}
.scale-catalog header span{color:#648076;font-size:10px;font-weight:800}
.scale-catalog h2{margin:4px 0 0;font-size:23px}
.scale-catalog header button{width:42px;height:42px;border:0;background:#e9efeb;color:#526861;font-size:24px}
.scale-catalog>section>div{display:grid}
.scale-catalog>section>div>button{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:10px;min-height:76px;padding:12px;border:1px solid #e0e7e3;border-radius:14px;background:#fff;color:#334b43;text-align:left}
.scale-catalog b{display:block}
.scale-catalog small{display:block}
.scale-catalog b{font-size:12px}
.scale-catalog small{margin-top:4px;color:#7b8984;font-size:9px}
.scale-catalog em{color:#42705f;font-size:9px;font-style:normal;font-weight:800}
.scale-catalog footer{margin-top:16px;color:#819089;font-size:10px;text-align:center}
@media (max-width:1050px),(max-height:650px){
  .self-library .self-card{gap:11px}
  .scale-catalog>section>div>button{min-height:66px}
}
.hub--feature .self-page{align-content:start}
.self-recommend-bar{grid-template-columns:minmax(250px,1fr) minmax(180px,.8fr) auto auto}
.self-recommend-bar>div:first-child{align-items:center;gap:12px}
.self-recommend-bar span{border-radius:6px;background:#d6e7de}
.self-recommend-bar>p{color:#65776f}
.recommend-pills{display:flex;gap:6px}
.recommend-pills b{padding:0;background:transparent;color:#718078;font-weight:650}
.recommend-pills b+b::before{content:'·';margin-right:6px;color:#a1ada7}
.self-recommend-bar>button{border-radius:10px}
.self-library>header{padding:0 2px}
.self-library>header .all-scales-link{min-height:34px;padding:0;border:0;border-radius:0;background:transparent;color:#58776c}
.self-filters button{position:relative;color:#66766f}
.self-filters button.active{border:0;font-weight:850}
.self-filters button.active::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:3px;border-radius:99px;background:#43806b}
.self-category-title{margin:0 2px 12px}
.self-library .self-card{box-shadow:0 8px 24px rgba(43,64,56,.055);display:grid;grid-template-columns:minmax(0,1fr) auto;border:0!important;border-radius:16px;background:transparent;overflow:hidden}
.self-library .self-card::before{width:5px;content:'';position:absolute;top:0;bottom:0;left:0;background:#a9bdb5}
.self-library .self-card--violet::before{background:#ae9bc5}
.self-library .self-card--blue::before{background:#86adc5}
.self-library .self-card--amber::before{background:#d2b46d}
.self-library .self-card--teal::before{background:#78ad9f}
.self-library .self-card--green::before{background:#91b36b}
.self-library .self-card--rose::before{background:#c6938e}
.self-library .self-card::after{display:none}
.self-library .scale-copy h3{margin:0 0 8px}
.self-library .scale-copy p{margin:0 0 16px;color:#66776f;min-height:auto}
.scale-copy small{color:#7d8a84}
.self-library .self-card>button{align-self:end;border:0}
.self-library .self-card>button:active{opacity:.65}
@media (max-width:1050px),(max-height:650px){
  .self-library .self-card{grid-template-columns:minmax(0,1fr) auto}
}
/* 心理自测最终横屏结构：左侧推荐，右侧分类后展示一组量表。 */
/* 心理自测轻量视觉：减少容器与控件轮廓，仅保留内容层级。 */
.hub--self .hub-main{background:#f5f6f2}
.hub--feature .self-page{grid-template-columns:330px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:22px;align-items:stretch;width:min(1160px,100%)}
.self-recommend-bar{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;min-height:0;padding:36px 30px}
.self-recommend-bar>div:first-child{display:block}
.self-recommend-bar span{display:inline-block;padding:6px 10px;font-size:11px}
.self-recommend-bar h2{max-width:270px;margin:15px 0 0;font-size:24px;line-height:1.3}
.self-recommend-bar>p{max-width:250px;margin:13px 0 0;font-size:14px;line-height:1.7}
.recommend-pills{margin-top:22px}
.recommend-pills b{font-size:12px}
.self-recommend-bar>button{min-height:52px;margin-top:27px;padding:0 24px;font-size:15px}
.self-library{display:grid;grid-template-rows:auto auto auto minmax(0,1fr);padding:28px 30px}
.self-library h3{font-size:23px}
.self-library header p{font-size:13px}
.self-library>header .all-scales-link{font-size:13px}
.self-filters{display:grid;grid-template-columns:repeat(6,1fr);margin:22px 0 24px}
.self-filters button{min-height:46px;padding:0 6px;font-size:14px}
.self-category-title{margin-bottom:16px}
.self-category-title span{font-size:17px}
.self-category-title p{font-size:12px}
.self-library .self-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.self-library .self-card{min-height:166px;padding:28px 25px}
.self-library .scale-copy h3{font-size:20px}
.self-library .scale-copy p{margin-bottom:22px;font-size:13px}
.scale-copy small{font-size:12px}
.self-library .self-card>button{font-size:13px}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .self-page{grid-template-columns:260px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px}
  .self-recommend-bar{min-height:0;padding:25px 22px}
  .self-recommend-bar h2{font-size:21px}
  .self-recommend-bar>p{font-size:12px}
  .self-recommend-bar>button{min-height:46px}
  .self-library{padding:19px 21px}
  .self-library h3{font-size:19px}
  .self-library header p{font-size:11px}
  .self-library>header .all-scales-link{font-size:11px}
  .self-filters{margin:14px 0 16px}
  .self-filters button{min-height:38px;font-size:12px}
  .self-category-title{margin-bottom:10px}
  .self-library .self-card{min-height:128px;padding:20px}
  .self-library .scale-copy h3{font-size:17px}
  .self-library .scale-copy p{margin-bottom:13px;font-size:11px}
  .scale-copy small{font-size:10px}
}
/* 心理自测横屏最终重心：内容组纵向居中，避免上密下空。 */
/* 自测页纵向重心：将标题、分类和量表卡作为一组置于屏幕中部。 */
/* 心理自测横屏最终重心：内容组纵向居中，避免上密下空。 */
.hub--self .self-page{align-self:stretch}
.hub--self .self-library{grid-template-rows:auto auto auto auto;align-content:center;padding-top:34px;padding-bottom:34px}
.hub--self .self-filters{margin-top:24px;margin-bottom:22px}
.hub--self .self-category-title{margin-bottom:18px}
.hub--self .self-library .self-cards{align-content:center;gap:18px}
@media (max-width:1050px),(max-height:650px){
  .hub--self .self-library{align-content:center;padding-top:18px;padding-bottom:18px}
  .hub--self .self-filters{margin-top:14px;margin-bottom:14px}
  .hub--self .self-category-title{margin-bottom:10px}
  .hub--self .self-library .self-cards{gap:12px}
}
.scale-catalog>section{width:min(980px,94vw);max-height:90vh;padding:28px 30px}
.scale-catalog>section>div{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.scale-catalog>section>div>.catalog-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;box-sizing:border-box;min-height:124px;padding:20px 22px;border:0;overflow:hidden}
.scale-catalog>section>div>.catalog-card::after{content:'';position:absolute;right:-35px;bottom:-55px;width:150px;height:120px;border-radius:55% 45% 38% 62%;background:rgba(255,255,255,.28);pointer-events:none}
.scale-catalog .catalog-card>div{position:relative;z-index:1}
.scale-catalog .catalog-card>em{position:relative;z-index:1}
.scale-catalog .catalog-card b{font-size:16px}
.scale-catalog .catalog-card p{margin:7px 0 12px;color:#5f716a;font-size:11px;line-height:1.55}
.scale-catalog .catalog-card small{color:#6d7e77;font-size:10px}
.scale-catalog .catalog-card em{align-self:end;color:#315f50;font-size:11px}
.scale-catalog .catalog-card--teal{background:#dceee8}
.scale-catalog .catalog-card--blue{background:#dceaf3}
.scale-catalog .catalog-card--violet{background:#e8e0f1}
.scale-catalog .catalog-card--amber{background:#f1e6cd}
.scale-catalog .catalog-card--green{background:#e3eed5}
.scale-catalog .catalog-card--rose{background:#f0dfdc}
@media (max-width:1050px),(max-height:650px){
  .scale-catalog>section{padding:20px 22px}
  .scale-catalog>section>div{gap:10px}
  .scale-catalog>section>div>.catalog-card{min-height:98px;padding:14px 17px}
  .scale-catalog .catalog-card b{font-size:13px}
  .scale-catalog .catalog-card p{margin:4px 0 7px;font-size:9px}
}
/* 心理自测主页面可读性：放大文字，并用卡片内容消化横屏空白。 */
.hub--self .self-recommend-bar{padding:42px 34px}
.hub--self .self-recommend-bar span{padding:7px 11px;font-size:13px}
.hub--self .self-recommend-bar h2{max-width:275px;margin-top:18px;font-size:28px;line-height:1.35}
.hub--self .self-recommend-bar>p{max-width:265px;margin-top:16px;font-size:16px;line-height:1.75}
.hub--self .recommend-pills{margin-top:25px;gap:16px}
.hub--self .recommend-pills b{font-size:14px}
.hub--self .self-recommend-bar>button{min-height:56px;margin-top:30px;padding:0 28px;font-size:17px}
.hub--self .self-library{padding-right:34px;padding-left:34px}
.hub--self .self-library h3{font-size:26px}
.hub--self .self-library header p{margin-top:8px;font-size:15px}
.hub--self .self-library>header .all-scales-link{min-height:42px;font-size:14px}
.hub--self .self-filters{gap:7px}
.hub--self .self-filters button{min-height:50px;font-size:16px}
.hub--self .self-category-title{align-items:center;gap:14px}
.hub--self .self-category-title span{font-size:19px}
.hub--self .self-category-title p{font-size:13px}
.hub--self .self-library .self-card{min-height:190px;padding:31px 29px}
.hub--self .self-library .scale-copy h3{margin-bottom:12px;font-size:23px}
.hub--self .self-library .scale-copy p{margin-bottom:25px;font-size:15px;line-height:1.65}
.hub--self .scale-copy small{font-size:14px}
.hub--self .self-library .self-card>button{padding:12px 2px;font-size:15px}
@media (max-width:1050px),(max-height:650px){
  .hub--self .self-recommend-bar{padding:27px 24px}
  .hub--self .self-recommend-bar span{font-size:11px}
  .hub--self .self-recommend-bar h2{margin-top:12px;font-size:23px}
  .hub--self .self-recommend-bar>p{margin-top:10px;font-size:13px}
  .hub--self .recommend-pills{margin-top:16px}
  .hub--self .recommend-pills b{font-size:12px}
  .hub--self .self-recommend-bar>button{min-height:48px;margin-top:18px;font-size:15px}
  .hub--self .self-library{padding-right:22px;padding-left:22px}
  .hub--self .self-library h3{font-size:21px}
  .hub--self .self-library header p{font-size:12px}
  .hub--self .self-library>header .all-scales-link{font-size:12px}
  .hub--self .self-filters button{min-height:40px;font-size:13px}
  .hub--self .self-category-title span{font-size:16px}
  .hub--self .self-category-title p{font-size:11px}
  .hub--self .self-library .self-card{min-height:142px;padding:21px 22px}
  .hub--self .self-library .scale-copy h3{font-size:18px}
  .hub--self .self-library .scale-copy p{margin-bottom:14px;font-size:12px}
  .hub--self .scale-copy small{font-size:11px}
  .hub--self .self-library .self-card>button{font-size:12px}
}
/* 心理自测目录是独立功能页：铺满终端内容区，不套居中窄版模块容器。 */
.hub--self.hub--feature .hub-main{box-sizing:border-box;width:100%;min-width:0;padding:0 24px 16px;grid-template-rows:120px minmax(0,1fr)}
.hub--self.hub--feature .hub-top{position:relative;z-index:2;min-height:0;grid-template-columns:190px minmax(0,1fr) 150px;gap:18px}
.hub--self.hub--feature .hub-top>div p{color:#687a71!important;opacity:1}
.hub--self.hub--feature .self-page{box-sizing:border-box;width:100%;max-width:none;margin:0;grid-template-columns:minmax(260px,.72fr) minmax(0,1.8fr);gap:22px}
.hub--self.hub--feature .self-library{min-width:0}
.hub--self .self-library .self-card--compact{box-sizing:border-box;height:142px!important;min-height:142px!important;max-height:142px!important;padding:15px 20px!important;align-self:start}
.hub--self .self-library .self-card--compact .scale-copy h3{margin:0 0 6px;font-size:18px;line-height:1.25}
.hub--self .self-library .self-card--compact .scale-copy p{margin:0 0 8px;font-size:13px;line-height:1.35}
.hub--self .self-library{align-content:center!important}
.hub--self .self-library .self-cards{min-height:190px;align-content:center!important}
.hub--self .self-filters button{-webkit-appearance:none;appearance:none;-webkit-tap-highlight-color:transparent;outline:none;box-shadow:none;transition:background-color .12s ease,color .12s ease}
.hub--self .self-filters button:focus,.hub--self .self-filters button:focus-visible{outline:none!important;box-shadow:none!important}
@media (max-width:1050px),(max-height:650px){
  .hub--self.hub--feature .hub-main{padding:0 16px 12px;grid-template-rows:100px minmax(0,1fr)}
  .hub--self.hub--feature .hub-top{grid-template-columns:150px minmax(0,1fr) 0;gap:12px}
  .hub--self.hub--feature .self-page{grid-template-columns:minmax(220px,.68fr) minmax(0,1.8fr);gap:14px}
}
/* 2026-09 社区端亲和产品化视觉层：弱化线框，使用完整柔和色块与清晰大字。 */
.hub{background:#f7f7f2;color:#283f37;font-family:"Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif}
.hub-main{padding-right:34px;padding-left:34px}
.hub-top h1{font-size:27px;font-weight:800;letter-spacing:.01em}
.hub-top p{color:#687a73;font-size:14px}
.hub-status{color:#45685c;font-size:13px;padding:9px 14px;border-radius:999px;background:#e8f3ec}
.hub-status i{box-shadow:none}
.primary-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.report-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.feature-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.info-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.tool-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.help-strip{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.home-grid{gap:18px}
.primary-card{padding:29px}
.report-card{padding:29px}
.primary-card{border-radius:28px 58px 28px 28px;background:linear-gradient(130deg,#dceee4,#edf5ef 70%,#f7e8dd)}
.report-card{border-radius:28px 28px 54px 28px;background:linear-gradient(140deg,#deedf7,#edf4f8)}
.tag{padding:6px 11px;border-radius:9px;background:rgba(255,255,255,.76);font-size:12px}
.primary-card h2{font-size:27px;margin-top:14px}
.report-card h2{font-size:27px;margin-top:14px}
.primary-card p{font-size:14px;line-height:1.7}
.report-card p{font-size:14px;line-height:1.7}
.primary-card ul{font-size:12px}
.primary-card button{left:29px;bottom:27px;width:196px;border-radius:16px;font-size:17px;box-shadow:0 8px 18px rgba(57,120,102,.15)}
.report-card button{left:29px;bottom:27px;width:196px;border-radius:16px;font-size:17px;box-shadow:0 8px 18px rgba(57,120,102,.15)}
.tools header{margin-bottom:11px}
.tools h2{font-size:19px}
.tools header span{font-size:12px}
.tool-row{gap:16px}
.tool-card{min-height:116px;padding:20px 23px;border-radius:25px}
.tool-card>i{width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.78);font-size:25px}
.tool-card b{font-size:19px}
.tool-card small{font-size:13px}
.tool-card em{font-size:25px}
.peach{background:#f4e3d8}
.violet{background:#e9e3f4}
.yellow{background:#f4eccf}
.help-strip{border-radius:22px 42px 22px 22px;background:#e8f0eb}
.help-strip b{font-size:17px}
.help-strip small{font-size:12px}
.help-strip em{font-size:14px}
.hub--feature{background:#f7f7f2}
.hub--feature .hub-top{border:0}
.feature-back{border:0;border-radius:15px;background:#fff;font-size:15px;box-shadow:0 6px 18px rgba(50,75,66,.07)}
.hub--feature .hub-top>div h1{font-size:26px}
.hub--feature .hub-top>div p{font-size:13px}
.self-recommend-bar{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.self-library{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.article-shelf{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.topic-list{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.support-simple{box-shadow:0 12px 30px rgba(54,76,68,.055)}
.self-recommend-bar{border-radius:29px 58px 29px 29px!important;background:linear-gradient(150deg,#dceee5,#eef5f0)!important}
.self-library{border-radius:29px!important;background:rgba(255,255,255,.9)!important}
.self-filters{gap:8px!important;border-bottom:0!important}
.self-filters button{border:0!important;border-radius:13px!important;background:#f1f3ef!important}
.self-filters button.active{background:#dcece4!important;color:#315e50!important}
.self-filters button.active::after{display:none!important}
.self-card{border-radius:22px!important;box-shadow:none!important}
.self-library .self-card>button{padding:0 16px!important;color:#315f50!important;min-height:42px!important;background:rgba(255,255,255,.72)!important;border-radius:12px!important}
.knowledge-page{gap:20px}
.article-lead{border-radius:30px 62px 30px 30px}
.article-note{border-radius:21px;background:#e8f0eb}
.article-note b{font-size:16px}
.article-note p{font-size:13px}
.topic-list{border-radius:29px 52px 29px 29px;background:#fff}
.kind-switch button{border-radius:14px!important;background:#f2f4f1!important}
.kind-switch button.active{background:#f3e8c9!important}
.resource-list button{padding:12px!important;border:0!important;border-radius:13px!important;margin-top:4px;background:#f7f8f5!important}
.resource-list button.active{background:#f3ead1!important}
.resource-list button b{font-size:13px}
.resource-list button small{font-size:10px}
.source-note{border-radius:17px;background:#edf3ef}
.article-lead button{border-radius:14px;font-size:14px}
.help-page{background:transparent}
.support-simple{border:0;border-radius:0;background:transparent}
.support-actions{gap:24px}
.support-action{border:0;border-radius:28px;box-shadow:none}
.support-action--appointment{background:#e3f0e9}
.support-action--hotline{background:#e4edf6}
.support-action>i{border-radius:18px}
.support-action b{font-size:22px}
.support-action small{font-size:13px}
.support-action em{font-size:13px}
.immersive-reader{background:#f7f7f2}
.immersive-reader>header{border-bottom:0;box-shadow:0 5px 18px rgba(50,72,64,.05)}
.reader-layout>aside{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-prose{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-points p{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-hero{border-radius:30px 62px 30px 30px}
.reader-action{border-left:0;border-radius:18px;background:#e5f0df}
.scale-catalog{background:rgba(43,57,51,.34)}
/* 全部量表：沿用主页面整卡色块，并放大为横屏双列。 */
.scale-catalog>section{border-radius:30px;background:#fafbf8}
.scale-catalog header button{border-radius:15px}
.resource-close{border-radius:15px}
.close{border-radius:15px}
.scale-catalog>section>div>.catalog-card{border-radius:21px;box-shadow:none}
@media (max-width:1050px),(max-height:650px){
  .hub-main{padding-right:22px;padding-left:22px}
  .home-grid{gap:12px}
  .primary-card{padding:20px}
  .report-card{padding:20px}
  .primary-card h2{font-size:22px}
  .report-card h2{font-size:22px}
  .tool-card{min-height:78px;border-radius:19px}
  .tool-card b{font-size:16px}
  .tool-card small{font-size:11px}
  .hub--feature .hub-top>div h1{font-size:22px}
  .support-action b{font-size:18px}
}
/* 首页陪伴插画完整露出，避免被装饰底形遮挡。 */
.hero-art{right:5px;bottom:-2px;width:300px;height:235px}
.hero-art>span{inset:31px 4px 4px 45px;z-index:1}
.hero-art img{width:280px;height:220px;object-fit:contain;z-index:2;object-position:center bottom}
@media (max-width:1050px),(max-height:650px){
  .hero-art{right:-8px;bottom:-25px;width:265px;height:210px}
  .hero-art img{width:250px;height:195px}
}
.hub--relax .hub-top>div h1{letter-spacing:.02em}
.hub--relax .hub-top{grid-template-columns:190px minmax(0,1fr) 0!important}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .hub-top{grid-template-columns:165px minmax(0,1fr) 0!important}
}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .hub-top{grid-template-columns:52px minmax(0,1fr) 0!important}
}
/* 情绪放松采用暖米白、草木绿与真实自然图像，弱化设备面板感。 */
/* 情绪放松入口改版：推荐位 + 次级练习卡 + 本周练习记录，卡片一色一练、卡外文字保持克制。 */
.hub--relax{background:#f6faf7}
.hub--relax .hub-top{border:0}
.hub--relax .hub-top>div h1{color:#1f3b33}
.hub--relax .hub-top>div p{color:#8a9c93}
.hub--relax .hub-status{background:#e9f5ee;color:#3e7d63;padding:9px 14px;border-radius:999px;font-size:13px}
.hub--relax .hub-status i{background:#4c9a7e;box-shadow:0 0 0 4px rgba(76,154,126,.12)}
.hub--relax .relax-cards{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr);align-self:center;gap:32px;height:min(452px,100%);min-height:0}
.hub--relax .relax-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-width:0;min-height:0;padding:28px;border:0;border-radius:28px;background:#dff0e6;color:#1e3b32;font-family:inherit;text-align:center;cursor:pointer;box-shadow:0 8px 24px rgba(31,59,51,.08);transition:transform .16s ease,box-shadow .16s ease;-webkit-tap-highlight-color:transparent;outline:none}
.hub--relax .relax-hero:active{transform:scale(.995)}
.hub--relax .relax-hero:focus-visible{outline:3px solid #4c9a7e;outline-offset:3px}
.relax-hero__tag{padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.7);color:#2f6e56;font-size:13px;font-weight:750}
.relax-hero__ring{position:relative;display:grid;place-items:center;width:124px;height:124px}
.relax-hero__ring i{display:none}
.relax-hero__ring b{width:92px;height:92px;border-radius:50%;background:radial-gradient(circle at 32% 26%,#c3e2cc,#78b58e 68%,#5c9a73);box-shadow:0 16px 34px rgba(63,142,112,.18);animation:relaxBreath 10s ease-in-out infinite}
@keyframes relaxBreath{0%,100%{transform:scale(.82)}40%{transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){
  .relax-hero__ring b{animation:none}
}
.relax-hero__title{font-size:26px;font-weight:750;line-height:1.3}
.relax-hero__desc{color:#5e7a70;font-size:14px;line-height:1.6}
.relax-hero__cta{display:flex;align-items:center;justify-content:center;min-height:50px;padding:0 26px;border-radius:16px;background:#3f8e70;color:#fff;font-size:16px;font-style:normal;font-weight:750;box-shadow:0 8px 20px rgba(63,142,112,.2)}
.hub--relax .relax-side{display:grid;grid-template-rows:1fr 1fr;gap:32px;min-height:0}
.hub--relax .relax-side-card{display:grid;grid-template-columns:64px minmax(0,1fr) 46px;align-items:center;gap:16px;min-width:0;min-height:0;padding:22px;border:0;border-radius:24px;color:#1e3b32;font-family:inherit;text-align:left;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease;-webkit-tap-highlight-color:transparent;outline:none}
.hub--relax .relax-side-card--sound{background:#dceaf6}
.hub--relax .relax-side-card--stretch{background:#fbeedc}
.hub--relax .relax-side-card:active{transform:scale(.995)}
.hub--relax .relax-side-card:focus-visible{outline:3px solid #4c9a7e;outline-offset:3px}
.hub--relax .relax-hero:focus:not(:focus-visible),.hub--relax .relax-side-card:focus:not(:focus-visible){outline:none;box-shadow:none}
.relax-side-card__icon{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.9)}
.relax-side-card__icon svg{width:30px;height:30px}
.relax-side-card__copy{display:block;min-width:0}
.relax-side-card__copy b{display:block;font-size:19px;font-weight:750;line-height:1.3}
.relax-side-card__copy small{display:block;margin-top:4px;color:#5a7c8c;font-size:13px;line-height:1.5}
.hub--relax .relax-side-card--stretch .relax-side-card__copy small{color:#8a6e3c}
.relax-side-card__play{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.75)}
.relax-side-card__play svg{width:17px;height:17px}
@media (max-width:1050px),(max-height:650px){
  .hub--relax .relax-page{gap:14px}
  .hub--relax .relax-cards{gap:18px;height:min(392px,100%)}
  .hub--relax .relax-hero{gap:10px;padding:20px}
  .relax-hero__tag{font-size:11px}
  .relax-hero__ring{width:104px;height:104px}
  .relax-hero__ring b{width:78px;height:78px}
  .relax-hero__title{font-size:22px}
  .relax-hero__desc{font-size:12px}
  .relax-hero__cta{min-height:46px;padding:0 22px;font-size:15px}
  .hub--relax .relax-side{gap:18px}
  .hub--relax .relax-side-card{grid-template-columns:56px minmax(0,1fr) 42px;gap:13px;padding:16px;border-radius:21px}
  .relax-side-card__icon{width:56px;height:56px}
  .relax-side-card__icon svg{width:26px;height:26px}
  .relax-side-card__copy b{font-size:17px}
  .relax-side-card__copy small{font-size:12px}
  .relax-side-card__play{width:42px;height:42px}
  .relax-side-card__play svg{width:15px;height:15px}
}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .relax-page{height:auto}
  .hub--relax .relax-cards{grid-template-columns:1fr}
  .hub--relax .relax-hero{min-height:340px}
  .hub--relax .relax-side{grid-template-rows:auto auto}
}
/* 情绪放松选择页：把练习本身作为主角，减少重复说明与空白。 */
.relax-page{gap:22px;grid-template-columns:minmax(0,1.25fr) minmax(390px,.85fr);align-items:stretch}
@media (max-width:1050px),(max-height:650px){
  .relax-page{grid-template-columns:minmax(0,1.15fr) minmax(340px,.9fr);gap:14px}
}
/* 简化后的情绪放松入口：标题沿用页面页头，主体只呈现三张可直接开始的练习卡。 */
/* 最终布局覆盖旧版选择页规则，卡片在终端横屏中保持紧凑、等高。 */
.hub--relax .hub-status{display:none}
.hub--relax .hub-top>div p{color:#526c60}
.hub--relax .relax-page{grid-template-columns:1fr;gap:22px;display:grid;grid-template-rows:minmax(0,1fr) auto;width:min(1120px,100%);height:100%;min-height:0;margin:0 auto}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .hub-main{overflow-y:auto}
  .hub--relax .relax-page{grid-template-rows:auto auto}
}
/* 官方科普：横屏内容库 + 独立沉浸阅读。 */
.hub--knowledge .hub-main{min-height:0}
.hub--knowledge .hub-status{display:none}
.knowledge-page{width:min(1240px,100%);height:100%;min-height:0;margin:0 auto;padding-top:14px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:12px}
.hub--knowledge .kind-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.hub--knowledge .kind-switch button{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:10px;min-width:0;min-height:54px;padding:7px 14px!important;border:1px solid #e1e8df!important;border-radius:14px!important;background:#f7f8f4!important;text-align:left!important;color:#334c40;cursor:pointer}
.hub--knowledge .kind-switch button>i{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:#e8efe5;color:#4e765b;font-size:15px;font-style:normal;font-weight:800}
.hub--knowledge .kind-switch button:nth-child(2)>i{background:#e8eef5;color:#587695}
.hub--knowledge .kind-switch button:nth-child(3)>i{background:#f5eee1;color:#987441}
.hub--knowledge .kind-switch button>span{min-width:0;display:flex;align-items:baseline;gap:8px}
.hub--knowledge .kind-switch button b{font-size:15px;font-weight:750}
.hub--knowledge .kind-switch button small{color:#728078;font-size:12px}
.hub--knowledge .kind-switch button.active{border-color:#9dbba2!important;background:#edf4eb!important;box-shadow:0 4px 12px rgba(68,109,76,.07)}
.hub--knowledge .kind-switch button.active>i{background:#527d5f;color:#fff}
.knowledge-library{min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:208px;align-content:start;gap:18px;padding:8px 8px 18px;scrollbar-width:thin;scrollbar-color:#ccd8ce transparent}
.resource-card{min-width:0;min-height:0;overflow:hidden;display:grid;grid-template-columns:minmax(112px,30%) minmax(0,1fr);border:1px solid #e4e9e1;border-radius:19px;background:#fff;box-shadow:0 6px 18px rgba(44,68,53,.055)}
.resource-card__visual{position:relative;min-width:0;min-height:0;background-image:linear-gradient(180deg,rgba(29,54,43,.03),rgba(29,54,43,.3)),var(--resource-image);background-size:cover;background-position:center}
.resource-card:not(.resource-card--featured) .resource-card__visual{background-position:center;background-color:#edf2ec}
.resource-card__visual span{position:absolute;left:10px;bottom:10px;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.92);color:#45644f;font-size:11px;font-weight:750;line-height:1.2}
.resource-card__body{min-width:0;display:flex;flex-direction:column;align-items:flex-start;padding:16px 18px 14px}
.resource-card__body>small{overflow:hidden;max-width:100%;color:#748178;font-size:11px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.resource-card__body h3{display:-webkit-box;overflow:hidden;margin:8px 0 7px;color:#2e463a;font-size:18px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.resource-card__body p{display:-webkit-box;overflow:hidden;margin:0;color:#65746b;font-size:14px;line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.resource-card__actions{display:flex;align-items:center;gap:14px;margin-top:auto;padding-top:12px}
.resource-card__actions button{min-height:42px;border:0;border-radius:12px;font:inherit;font-size:13px;font-weight:750;cursor:pointer}
.resource-read{padding:0 14px;background:#4e7b5d;color:#fff}
.resource-read b{margin-left:8px}
.resource-original{padding:0 8px;background:transparent;color:#56735e}
.resource-card__actions button:focus-visible,.hub--knowledge .kind-switch button:focus-visible{outline:3px solid #83ad8b;outline-offset:2px}
.reader-source-button{justify-self:end;min-height:42px;padding:0 15px;border:1px solid #d5e0d7;border-radius:12px;background:#f6f8f4;color:#456d51;font-size:13px;font-weight:750;cursor:pointer}
.reader-layout{grid-template-columns:190px minmax(0,1fr);width:min(1200px,100%);gap:22px;padding:20px 28px 26px}
.reader-layout>aside{gap:4px;padding:16px;border:1px solid #e6ebe4;border-radius:18px;background:#fff}
.reader-layout>aside>b{color:#334b3e;font-size:14px}
.reader-layout>aside a{color:#5d7164;font-size:13px;line-height:1.45}
.reader-layout>article{min-width:0;max-width:960px;width:100%;justify-self:center;padding:0 8px 0 0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.reader-hero{min-height:190px;padding:30px 34px;border-radius:22px;background-image:linear-gradient(90deg,rgba(248,249,244,.97) 0%,rgba(248,249,244,.9) 52%,rgba(248,249,244,.35) 100%),var(--reader-image);background-position:center 45%;background-size:cover}
.reader-hero>div{max-width:680px}
.reader-hero span{color:#5e8067;font-size:12px;font-weight:700}
.reader-hero h2{margin:10px 0 7px;color:#2e4638;font-size:26px;line-height:1.3}
.reader-hero p{max-width:620px;margin:0;color:#53695b;font-size:15px;line-height:1.65}
.reader-section{margin-top:16px;padding:22px 28px;border:1px solid #e8ece5;border-radius:20px;background:#fff}
.reader-section>span{color:#64846c;font-size:12px;font-weight:750}
.reader-section h2{margin:6px 0 12px;color:#30483b;font-size:21px;line-height:1.4}
.reader-points{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.reader-points p{display:flex;align-items:flex-start;gap:10px;margin:0;padding:12px;border-radius:13px;background:#f5f7f2;color:#506258;font-size:14px;line-height:1.6}
.reader-points i{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#e2eee1;color:#4d7956;font-size:12px;font-style:normal;font-weight:750}
.reader-prose p,.reader-prose li{color:#4e5f55;font-size:16px;line-height:1.85}
.reader-prose p{margin:0 0 13px}
.reader-prose ul{margin:8px 0 0;padding-left:22px}
.reader-prose li{padding:3px 0}
.reader-action{padding:16px 18px;border-radius:15px;background:#edf4eb;color:#46684d;font-size:15px;line-height:1.7}
.reader-layout>article>footer{padding:20px 12px 28px;color:#77837a;font-size:12px;line-height:1.5}
@media (max-width:1050px),(max-height:700px){
  .knowledge-page{gap:10px}
  .hub--knowledge .kind-switch{gap:8px}
  .hub--knowledge .kind-switch button{min-height:58px;padding:8px 11px!important;grid-template-columns:38px minmax(0,1fr) 14px}
  .hub--knowledge .kind-switch button>i{width:36px;height:36px}
  .knowledge-library{grid-auto-rows:184px;gap:14px;padding-inline:5px}
  .resource-card{grid-template-columns:minmax(92px,28%) minmax(0,1fr)}
  .resource-card__body{padding:13px 14px 12px}
  .resource-card__body h3{font-size:16px}
  .resource-card__body p{font-size:12px}
  .resource-card__actions button{min-height:36px}
}
@media (max-width:760px),(orientation:portrait){
  .hub--knowledge .hub-main{overflow-y:auto;grid-template-rows:74px 1fr;padding:0 16px 16px}
  .knowledge-page{height:auto;min-height:100%;grid-template-rows:auto auto;gap:12px}
  .hub--knowledge .kind-switch{grid-template-columns:1fr;gap:7px}
  .hub--knowledge .kind-switch button{min-height:56px}
  .knowledge-library{overflow:visible;grid-template-columns:1fr;grid-auto-rows:auto;padding-bottom:12px}
  .resource-card,.resource-card--featured{grid-column:auto;grid-template-columns:76px minmax(0,1fr);min-height:170px}
  .resource-card__body{padding:12px}
  .resource-card__body h3{font-size:16px}
  .resource-card__body p{font-size:13px}
  .immersive-reader{position:fixed;grid-template-rows:72px minmax(0,1fr)}
  .immersive-reader>header{grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:0 12px}
  .immersive-reader>header button{min-height:40px;padding:0 10px;font-size:12px}
  .immersive-reader>header h1{overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}
  .immersive-reader>header span{font-size:10px}
  .reader-layout{display:block;overflow:auto;padding:12px 12px 20px}
  .reader-layout>aside{display:none}
  .reader-layout>article{height:auto;overflow:visible;padding:0}
  .reader-hero{min-height:170px;padding:22px 18px;background-position:60% center}
  .reader-hero h2{font-size:21px}
  .reader-hero p{font-size:14px}
  .reader-section{margin-top:11px;padding:18px}
  .reader-section h2{font-size:18px}
  .reader-points{grid-template-columns:1fr}
  .reader-prose p,.reader-prose li{font-size:15px}
}
.hub--relax .relax-side{grid-template-rows:repeat(3,minmax(0,1fr));gap:18px}
.hub--relax .relax-side-card--game{background:#ece8f6;color:#50456d}
.hub--relax .relax-side-card--game .relax-game-card__icon{background:rgba(255,255,255,.9);color:#65558c;font-size:31px}
.hub--relax .relax-side-card--game .relax-side-card__copy small{color:#70668a}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .relax-side{grid-template-rows:repeat(3,minmax(96px,auto))}
}
</style>
<style scoped src="../../styles/community-service.css"></style>


























<style scoped src="../../styles/knowledge-reader.css"></style>

<style scoped>
.hub--self{grid-template-rows:minmax(0,1fr)}
.hub--self .hub-main{min-height:0}
.hub--self .self-page{min-height:0!important}
.hub--self .self-library--many{min-height:0;grid-template-rows:auto auto auto minmax(0,1fr)!important;align-content:stretch!important}
.hub--self .self-library--many .self-cards{min-height:0!important;overflow-y:auto;overscroll-behavior:contain;align-content:start!important;padding-right:4px}
</style>
