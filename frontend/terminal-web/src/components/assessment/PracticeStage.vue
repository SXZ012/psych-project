<script setup lang="ts">
/**
 * 预训练舞台（纯展示）：与正式阶段共用 ImageQuestion，选项位置一致。
 * 不录像、不上传、不计入正式答案；三道完成后或主动跳过后展示正式开始说明。
 */
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import ImageQuestion from './ImageQuestion.vue'
import type { SchedulerCard } from '@/aviation/types'
import { MESSAGES } from '@/aviation/messages'

defineProps<{
  step: 'demo' | 'complete' | 'skipped'
  card: SchedulerCard
  index: number
  total: number
  native: boolean
  cameraMessage: string
  faceLevel: 'ok' | 'warn' | 'fail' | 'error'
}>()
const emit = defineEmits<{
  selectDemo: [instanceId: number, optionId: string]
  startCountdown: []
  skipAll: []
}>()
</script>

<template>
  <main class="practice-stage">
    <CameraMonitor :native="native" :message="cameraMessage" :state="faceLevel === 'ok' ? 'ok' : faceLevel === 'error' ? 'error' : 'warning'" />
    <header>
      <p>{{ MESSAGES.practice.eyebrow }}</p>
      <h2>{{ step === 'demo' ? `第 ${index} / ${total} 题` : (step === 'skipped' ? '预训练已跳过' : MESSAGES.practice.completeTitle) }}</h2>
      <small>{{ MESSAGES.practice.meta }}</small>
    </header>

    <template v-if="step === 'demo' && (card.kind === 'question' || card.kind === 'feedback')">
      <ImageQuestion
        :key="card.instance.instanceId"
        :instance="card.instance"
        :selected="card.kind === 'feedback' && card.outcome === 'selected' ? card.optionId : null"
        :disabled="card.kind === 'feedback'"
        @select="(id, option) => emit('selectDemo', id, option)"
      />
      <button class="practice-stage__skip-all" @click="emit('skipAll')">{{ MESSAGES.practice.skipAll }}</button>
    </template>

    <section v-else class="practice-complete">
      <span v-if="step === 'complete'">✓</span>
      <span v-else class="practice-complete__skip">⟩⟩</span>
      <h1>{{ step === 'skipped' ? MESSAGES.practice.skippedNote : MESSAGES.practice.completeTitle }}</h1>
      <p>{{ MESSAGES.practice.completeBody }}</p>
      <button class="primary" :disabled="faceLevel !== 'ok'" @click="emit('startCountdown')">开始正式测评</button>
      <small v-if="faceLevel !== 'ok'">{{ cameraMessage }}</small>
    </section>
  </main>
</template>

<style scoped>
.practice-stage{position:relative;min-height:100vh;box-sizing:border-box;padding:var(--stage-pad-top,254px) 0 30px;background:var(--stage-bg,radial-gradient(ellipse at 50% 0,#25475d,#0a1524 70%));color:var(--tx-strong,#fff);display:flex;align-items:center}
.practice-stage header{position:absolute;top:55px;left:52px}
.practice-stage header p{color:var(--tx-soft,#a8c4d6);font-size:var(--fs-caption,13px)}
.practice-stage header h2{font-size:var(--fs-title,26px);font-weight:500}
.practice-stage header small{color:var(--tx-faint,#adc0cd)}
.practice-stage__skip-all{position:absolute;top:58px;right:60px;min-height:44px;padding:0 22px;border:1px solid var(--aq-option-border,#a7c1d64d);border-radius:999px;background:transparent;color:var(--tx-soft,#a6bed3);font-size:var(--fs-caption,14px)}
.practice-stage__skip-all:active{background:var(--aq-option-bg,#ffffff0b)}
.practice-complete{margin:auto;text-align:center;padding:24px}
.practice-complete>span{display:inline-grid;place-items:center;width:54px;height:54px;border-radius:50%;background:#4d90794a;color:#9de1bb;font-size:30px}
.practice-complete>span.practice-complete__skip{background:#c8b96a4a;color:#f2dfa9;font-size:22px}
.practice-complete h1{font-size:var(--fs-title,28px);font-weight:500}
.practice-complete p{color:var(--tx-soft,#bdcedb);font-size:var(--fs-body,16px)}
.practice-complete button{margin-top:16px;min-width:260px}
.practice-complete small{display:block;margin-top:12px;color:var(--tx-faint,#adc0cd)}
@media(max-height:700px){.practice-stage{padding-top:220px}.practice-stage header{top:35px}}


/* 连续测评阶段统一舞台色。 */
.practice-stage{background:#8badb1}


/* 浅色舞台上的顶部信息、跳过入口和完成提示统一使用深色文字。 */
.practice-stage{color:#203e4d}.practice-stage header p{color:#365f6a;font-size:15px;font-weight:700}.practice-stage header h2{color:#203e4d;font-weight:650}.practice-stage header small{color:#486570;font-size:14px;font-weight:500}
.practice-stage__skip-all{color:#244f65;border-color:#547f86;background:rgba(255,255,255,.7);font-size:16px;font-weight:650}
.practice-complete h1{color:#203e4d;font-weight:650}.practice-complete p{max-width:540px;color:#385864;font-size:18px;font-weight:500;line-height:1.6}.practice-complete small{color:#385864;font-size:14px;font-weight:600}


/* 正式采集前的完成标识必须一眼可见，并突出稳定注视要求。 */
.practice-complete>span{width:68px;height:68px;color:#fff;background:#328b76;border:3px solid #dff3ea;box-shadow:0 8px 18px rgba(39,111,91,.28);font-size:38px;font-weight:800}
.practice-complete>span.practice-complete__skip{background:#b48235;border-color:#fff2d5}
</style>
