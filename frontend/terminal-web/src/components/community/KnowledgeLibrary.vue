<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, nextTick, onMounted, ref, watch } from 'vue'
import KnowledgeArtwork from './KnowledgeArtwork.vue'
import { knowledgePresentation } from './knowledgePresentation'

type Kind = 'science' | 'course' | 'service'
type Resource = { kind: Kind; title: string; source: string; meta: string; summary: string; url: string }
const props = defineProps<{ resources: Resource[]; kind: Kind; scrollPosition?: number }>()
const emit = defineEmits<{ home: []; select: [kind: Kind]; read: [index: number]; scroll: [top: number] }>()
const categories: { kind: Kind; title: string }[] = [
  { kind: 'science', title: '健康科普' },
  { kind: 'course', title: '轻课与课程' },
  { kind: 'service', title: '求助指南' },
]
const items = computed(() => props.resources.filter(item => item.kind === props.kind).map(item => ({ ...item, preview: knowledgePresentation(item.title) })))
const list = ref<HTMLElement | null>(null)
onMounted(() => { list.value?.scrollTo({ top: props.scrollPosition || 0, behavior: 'instant' }) })
watch(() => props.kind, async () => { await nextTick(); list.value?.scrollTo({ top: 0 }) })
</script>

<template>
  <section class="knowledge" :class="`knowledge--${kind}`" aria-label="官方科普">
    <header class="knowledge-header"><NavigationButton @click="emit('home')">返回首页</NavigationButton><h1>官方科普</h1><span aria-hidden="true" /></header>
    <nav class="knowledge-tabs" aria-label="内容分类">
      <button v-for="category in categories" :key="category.kind" :aria-pressed="kind===category.kind" @click="emit('select',category.kind)">{{ category.title }}<span>{{ resources.filter(item=>item.kind===category.kind).length }}</span></button>
    </nav>
    <div ref="list" class="knowledge-scroll" @scroll="emit('scroll', ($event.target as HTMLElement).scrollTop)">
      <div class="knowledge-grid">
        <button v-for="(item,index) in items" :key="item.title" class="knowledge-card" :aria-label="`阅读：${item.title}`" @click="emit('read',index)">
          <span class="knowledge-copy">
            <span class="knowledge-topic">{{ item.preview.topic }}</span>
            <span class="knowledge-title" role="heading" aria-level="2">{{ item.preview.title }}</span>
            <span class="knowledge-summary">{{ item.preview.intro }}</span>
          </span>
          <KnowledgeArtwork class="knowledge-cover" :theme="item.preview.theme" />
          <span class="knowledge-card-foot"><small>{{ item.preview.source }}</small><b>{{ item.meta==='图文轻课' ? '学一学' : kind==='course' ? '了解课程' : '读一读' }} <span aria-hidden="true">↗</span></b></span>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.knowledge{position:absolute;inset:0;z-index:20;display:grid;grid-template-rows:80px 78px minmax(0,1fr);background:#faf9f6;color:#303844;font-family:inherit;--card:#f5eae0;--accent:#586982;--selected:#e5e9ef;overflow:hidden}
.knowledge--course{--card:#eaf0f5;--accent:#586982;--selected:#e5e9ef}.knowledge--service{--card:#f3eadf;--accent:#77634c;--selected:#ede5da}
.knowledge *{box-sizing:border-box}.knowledge button{font:inherit;border:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;color:inherit}.knowledge button:active{transform:none}.knowledge button:focus:not(:focus-visible){outline:none}.knowledge button:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.knowledge-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:10px 24px;gap:16px}.knowledge-header button{justify-self:start;min-height:52px;padding:0 18px;background:transparent;font-size:18px;font-weight:650}.knowledge-header h1{margin:0;font-size:25px;font-weight:650}
.knowledge-tabs{display:flex;align-items:center;justify-content:center;gap:12px;padding:0 24px 14px}.knowledge-tabs button{display:flex;align-items:center;justify-content:center;gap:10px;min-width:174px;min-height:54px;padding:0 22px;border-radius:28px;background:transparent;font-size:19px;font-weight:650;color:#525b67}.knowledge-tabs button[aria-pressed=true]{background:var(--selected);color:var(--accent)}.knowledge-tabs span{font-size:14px;font-weight:500;opacity:.85}
.knowledge-scroll{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 30px 30px;scrollbar-width:thin;scrollbar-color:#c4c7cd transparent}.knowledge-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;width:min(1160px,100%);margin:0 auto;align-content:start}
.knowledge .knowledge-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 125px;grid-template-rows:1fr auto;align-items:center;column-gap:6px;row-gap:20px;min-height:250px;padding:26px 28px;border-radius:24px;background:var(--card);text-align:left;box-shadow:none;overflow:hidden}.knowledge--science .knowledge-card:nth-child(4n+2){background:#f2eee2}.knowledge--science .knowledge-card:nth-child(4n+3){background:#eee9f4}.knowledge--science .knowledge-card:nth-child(4n+4){background:#e7eff5}.knowledge--science .knowledge-card:nth-child(5){background:#e6efec}.knowledge--course .knowledge-card:nth-child(even){background:#eeeaf3}.knowledge--service .knowledge-card:nth-child(even){background:#e9edf3}.knowledge-copy{display:flex;flex-direction:column;align-items:flex-start}.knowledge-topic{font-size:13px;color:#646672;font-weight:550;letter-spacing:.08em}.knowledge-card .knowledge-title{font-size:25px;font-weight:650;line-height:1.45;margin:10px 0;color:#303844;text-wrap:pretty}.knowledge-card .knowledge-summary{font-size:16px;line-height:1.7;color:#505a67}.knowledge-cover{width:125px;align-self:center}.knowledge-card-foot{grid-column:1/-1;display:flex;align-items:center;gap:12px;justify-content:space-between;width:100%}.knowledge-card-foot small{font-size:12px;font-weight:400;line-height:1.5;color:#626b76;max-width:75%}.knowledge-card-foot b{display:flex;gap:10px;align-items:center;font-size:16px;white-space:nowrap;font-weight:650;color:#46556b}.knowledge-card-foot b>span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#ffffff80;font-size:20px}
@media(max-height:680px){.knowledge{grid-template-rows:68px 66px minmax(0,1fr)}.knowledge-header{padding:8px 22px}.knowledge-header h1{font-size:23px}.knowledge-tabs{padding-bottom:8px}.knowledge-tabs button{min-height:50px;font-size:18px}.knowledge-scroll{padding:10px 24px 26px}.knowledge-grid{gap:18px}.knowledge .knowledge-card{min-height:218px;padding:20px 24px;grid-template-columns:minmax(0,1fr) 110px;row-gap:15px}.knowledge-cover{width:110px}.knowledge-card .knowledge-title{font-size:22px;margin:8px 0}.knowledge-card .knowledge-summary{font-size:15px}}
@media(max-width:700px){.knowledge-header{padding:8px 12px}.knowledge-header button{padding:0 8px;font-size:16px}.knowledge-header h1{font-size:21px}.knowledge-tabs{gap:5px;padding-inline:12px}.knowledge-tabs button{min-width:0;flex:1;padding:0 12px;font-size:16px;gap:6px}.knowledge-scroll{padding:10px 18px 24px}.knowledge-grid{grid-template-columns:1fr}.knowledge .knowledge-card{min-height:210px;padding:24px}.knowledge-card .knowledge-title{font-size:22px}}
</style>
