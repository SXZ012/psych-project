<script setup lang="ts">
import { computed } from 'vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import ImageQuestion from '@/components/assessment/ImageQuestion.vue'
import type { SchedulerCard } from '@/aviation/types'

const props = defineProps<{
  card: SchedulerCard; presentedCount: number; total: number; progress: number; remainingSec: number
  native: boolean; cameraMessage: string; faceState: 'ok' | 'warning' | 'error'
  interrupting: boolean; interruptReason: string; finalHint: boolean
}>()
const emit = defineEmits<{ select: [id: string] }>()
const monitorState = computed(() => props.interrupting ? 'warning' : props.faceState)
</script>

<template>
  <main class="community-assess">
    <CameraMonitor class="stage-top" :native="native" :expanded="interrupting" :message="interrupting ? interruptReason : cameraMessage" :state="monitorState" />
    <header><p>正式测评</p><h2>请按第一感觉作答</h2><small>保持头部稳定，并持续看向屏幕</small></header>
    <aside class="time"><p>剩余时间</p><b>{{ remainingSec }}<small> 秒</small></b><span>本次采集 60 秒</span></aside>
    <ImageQuestion v-if="card.kind === 'question' || card.kind === 'feedback'" :key="card.instance.instanceId"
      :instance="card.instance" :selected="card.kind === 'feedback' && card.outcome === 'selected' ? card.optionId : null"
      :disabled="card.kind === 'feedback'" @select="(_, option) => emit('select', option)" />
    <section v-else-if="card.kind === 'closing'" class="closing"><div>✓</div><h1>本轮采集即将完成</h1><p>请继续保持自然状态，面部留在画面框内</p><small>还有 {{ remainingSec }} 秒</small></section>
    <div v-if="finalHint && (card.kind === 'question' || card.kind === 'feedback')" class="finish-notice" role="status"><b>即将完成采集</b><span>请完成当前选择，系统将在 {{ remainingSec }} 秒后结束</span></div>
    <div class="progress"><i :style="{ width: progress + '%' }" /></div>
  </main>
</template>

<style scoped>
.community-assess{position:relative;min-height:100vh;box-sizing:border-box;padding:254px 0 36px;background:#8badb1;color:#203e4d;display:flex;align-items:center;overflow:hidden}
header{position:absolute;top:55px;left:52px}header p,.time p{margin:0 0 9px;color:#365f6a;font-size:15px;font-weight:700}h2{margin:0 0 10px;color:#203e4d;font-size:26px;font-weight:650}header small,.time>span{color:#486570;font-size:14px;font-weight:600}.time{position:absolute;right:60px;top:45px;text-align:right}.time>b{display:block;color:#244f65;font-size:46px;font-weight:700}.time b small{font-size:15px}
.progress{position:absolute;bottom:15px;left:32px;right:32px;height:4px;border-radius:4px;background:rgba(34,69,77,.24);overflow:hidden}.progress i{display:block;height:100%;background:#3f8579;transition:width .1s linear}.finish-notice{position:absolute;z-index:4;left:50%;bottom:36px;display:flex;gap:12px;align-items:center;padding:11px 18px;border:1px solid rgba(255,218,144,.6);border-radius:999px;background:rgba(83,63,27,.94);color:#ffedc1;transform:translateX(-50%);font-size:14px;white-space:nowrap}.finish-notice span{color:#f8dfaa}
.closing{width:min(1080px,calc(100vw - 64px));height:340px;margin:auto;border:1px solid #d7e2df;border-radius:24px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#294354}.closing div{display:grid;place-items:center;width:72px;height:72px;border-radius:50%;background:#e1f0ea;color:#3f8579;font-size:34px;font-weight:800}.closing h1{margin:14px 0 5px;font-size:28px}.closing p{margin:4px;color:#506a72;font-size:17px}.closing small{margin-top:8px;color:#647780}
@media(max-height:700px){.community-assess{padding-top:220px}header{top:40px}.closing{height:260px}}


/* Calm community assessment surface; capture geometry and timing stay unchanged. */
.community-assess{background:#e9f0e9}.community-assess>header{top:64px}.community-assess>.time{top:64px}.community-assess>header p,.community-assess>header small{color:#496451}.community-assess h2{font-size:24px}
</style>
<style scoped src="../../styles/community-capture.css"></style>
