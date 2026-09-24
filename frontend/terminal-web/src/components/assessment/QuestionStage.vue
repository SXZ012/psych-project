<script setup lang="ts">
/**
 * 正式采集舞台（纯展示）：60 秒自定节奏连续图题。
 * - 不展示“第几题/共几题”，不奖励答题速度、不把题量当指标；
 * - 卡片三态：question（等待作答）/ feedback（已锁定反馈）/ closing（收尾页）；
 * - 剩余时间为真实采集时钟；进度条只表达状态，不承担计时。
 */
import { computed } from 'vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import ImageQuestion from './ImageQuestion.vue'
import type { SchedulerCard } from '@/aviation/types'
import { MESSAGES } from '@/aviation/messages'

const props = defineProps<{
  card: SchedulerCard; elapsedSec: number; remainingSec: number; progressPct: number; interrupting: boolean; interruptReason: string; cameraMessage: string; faceLevel: 'ok' | 'warn' | 'fail' | 'error'; native: boolean
}>()
const emit = defineEmits<{ select: [instanceId: number, optionId: string] }>()
const isFinalReminder = computed(() => props.remainingSec > 0 && props.remainingSec <= 5)
</script>

<template>
  <main class="paired-stage">
    <CameraMonitor
      :native="native" :expanded="interrupting"
      :message="interrupting ? interruptReason : cameraMessage"
      :state="interrupting ? 'warning' : faceLevel === 'ok' ? 'ok' : faceLevel === 'error' ? 'error' : 'warning'"
    />
    <header><p>{{ MESSAGES.assess.eyebrow }}</p><h2>请按您的节奏作答</h2><small>请保持面部在取景范围内</small></header>
    <aside class="time">
      <p>{{ MESSAGES.assess.remainingLabel }}</p>
      <b>{{ remainingSec }}<small> 秒</small></b>
      <span>{{ MESSAGES.assess.totalLabel }}</span>
    </aside>

    <ImageQuestion
      v-if="card.kind === 'question' || card.kind === 'feedback'"
      :key="card.instance.instanceId"
      :instance="card.instance"
      :selected="card.kind === 'feedback' && card.outcome === 'selected' ? card.optionId : null"
      :skipped="card.kind === 'feedback' && card.outcome === 'skipped'"
      :disabled="card.kind === 'feedback'"
      @select="(id, option) => emit('select', id, option)"
    />
    <section v-else-if="card.kind === 'closing'" class="closing">
      <h1>{{ MESSAGES.assess.closingTitle }}</h1>
      <p>{{ MESSAGES.assess.closingBody }}</p>
      <p>剩余 {{ remainingSec }} 秒，结束后会有语音提示</p>
    </section>

    <div class="progress"><i :style="{ width: progressPct + '%' }" /></div>
    <div v-if="isFinalReminder" class="finish-notice" role="status" aria-live="polite"><b>即将完成采集</b><span>请完成当前选择，系统将在 {{ remainingSec }} 秒后结束</span></div>
  </main>
</template>

<style scoped>
.paired-stage{position:relative;min-height:100vh;box-sizing:border-box;padding:var(--stage-pad-top,254px) 0 36px;background:var(--stage-bg,radial-gradient(ellipse at 50% 0,#25475d,#0a1524 70%));color:var(--tx-strong,#fff);display:flex;align-items:center}
.paired-stage header{position:absolute;top:55px;left:52px}
.paired-stage header p,.time p{color:var(--tx-soft,#9db9cb);font-size:var(--fs-caption,13px);margin:0 0 10px}
.paired-stage h2{font-size:var(--fs-title,26px);margin:0 0 12px;font-weight:500}
.paired-stage header small{color:var(--tx-faint,#a4b8c6)}
.time{position:absolute;right:60px;top:45px;text-align:right}
.time>b{display:block;font-size:var(--fs-clock,46px);font-weight:500;color:var(--accent-clock,#e4d3ad)}
.time b small{font-size:15px}
.time>span{color:var(--tx-faint,#9eb3c3);font-size:var(--fs-caption,13px)}
.progress{position:absolute;bottom:15px;left:32px;right:32px;height:4px;border-radius:4px;background:#ffffff18;overflow:hidden}
.progress i{display:block;height:100%;background:var(--accent-progress,#91bba9);transition:width .1s linear}
.finish-notice{position:absolute;z-index:4;left:50%;bottom:36px;display:flex;align-items:center;gap:12px;padding:11px 18px;border:1px solid rgba(255,218,144,.5);border-radius:999px;background:rgba(35,27,15,.9);box-shadow:0 12px 30px rgba(0,0,0,.28);color:#ffedc1;transform:translateX(-50%);font-size:14px;white-space:nowrap}.finish-notice b{font-weight:700}.finish-notice span{color:#f8dfaa}
.closing{position:relative;width:min(1080px,calc(100vw - 64px));height:340px;margin:auto;border-radius:var(--aq-radius,24px);border:1px solid var(--aq-border,#b7d1e42e);background:var(--aq-bg,#101e30e8);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.closing h1{font-weight:500;font-size:var(--fs-title,28px)}
.closing p{margin:6px;color:var(--tx-soft,#d3e0ea)}
@media(max-height:700px){.paired-stage{padding-top:220px}.paired-stage header{top:40px}.closing{height:260px}}
</style>

<style scoped>
/* 正式答题保持白色内容卡，背景收深一档以集中注意力。 */
.paired-stage{background:linear-gradient(145deg,#557585 0%,#385665 100%);color:#f7fbfb}
.paired-stage header p,.time p{color:#c7dcde}.paired-stage h2{color:#fff}.paired-stage header small,.time>span{color:#dbe7e8}.time>b{color:#f1e3c2}
.progress{background:rgba(255,255,255,.22)}.progress i{background:#9bc6b7}.finish-notice{background:rgba(83,63,27,.94);box-shadow:0 8px 20px rgba(23,37,42,.22)}
.closing{background:#fff;border-color:#d7e2df;color:#294354}.closing p{color:#647780}
</style>

<style scoped>
/* 连续测评阶段统一舞台色。 */
.paired-stage{background:#8badb1}
</style>

<style scoped>
/* 正式测评的舞台文字加深，题卡本身由 ImageQuestion 统一为高对比白底。 */
.paired-stage{color:#203e4d}.paired-stage header p,.time p{color:#365f6a;font-size:15px;font-weight:700}.paired-stage h2{color:#203e4d;font-weight:650}.paired-stage header small,.time>span{color:#486570;font-size:14px;font-weight:600}.time>b{color:#244f65;font-weight:700}
.progress{background:rgba(34,69,77,.24)}.progress i{background:#3f8579}
</style>
