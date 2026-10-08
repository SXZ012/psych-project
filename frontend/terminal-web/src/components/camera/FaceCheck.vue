<script setup lang="ts">
/**
 * 就位检查（纯展示）：大预览 + 分项清单。
 * 只呈现 FaceReadiness 的结构化事实——无检测能力的项不显示通过，
 * 也不声称“持续注视已验证”。文案全部来自 messages.ts。
 */
import { computed } from 'vue'
import { useCameraSink } from '@/composables/useCameraSink'
import type { FaceReadinessState, FaceNotice } from '@/aviation/types'
import { MESSAGES, faceMessage } from '@/aviation/messages'

const props = defineProps<{
  readiness: FaceReadinessState
  notice: FaceNotice
  native: boolean
}>()
defineEmits<{ start: [] }>()

useCameraSink('videoEl')

const checklist = computed(() => [
  { label: MESSAGES.face.checklist.camera, pass: props.readiness.cameraOn },
  { label: MESSAGES.face.checklist.singleFace, pass: props.readiness.singleFace },
  { label: MESSAGES.face.checklist.position, pass: props.readiness.positionOk },
])
const headline = computed(() =>
  props.readiness.ready ? MESSAGES.face.readyHeadline : faceMessage(props.notice.messageKey),
)
const longError = computed(() => props.notice.level === 'error')
</script>

<template>
  <main class="terminal-shell face-check">
    <section>
      <p class="face-check__eyebrow">采集准备</p>
      <div class="face-preview" data-native-preview-anchor="detect">
        <video v-if="!native" ref="videoEl" autoplay muted playsinline></video>
        <div class="face-oval" :class="{ ready: readiness.ready, error: longError }"></div>
      </div>
      <h1>{{ headline }}</h1>
      <p class="face-check__message" role="status">{{ readiness.ready ? MESSAGES.face.readyMessage : faceMessage(notice.messageKey) }}</p>
      <div class="readiness-list" aria-label="采集就绪状态">
        <span v-for="item in checklist" :key="item.label" :class="{ pass: item.pass }">
          <i :aria-hidden="true">{{ item.pass ? '✓' : '·' }}</i>{{ item.label }}
        </span>
      </div>
      <p class="face-check__note">{{ MESSAGES.face.note }}</p>
      <button v-if="readiness.ready" class="primary primary--wide" @click="$emit('start')">开始操作体验</button>
      <div v-else class="loading-dots"><i></i><i></i><i></i></div>
    </section>
    <small>心理状态辅助评估 · 非临床诊断</small>
  </main>
</template>

<style scoped>
.face-check{min-height:100dvh;box-sizing:border-box;display:grid;grid-template-rows:minmax(0,1fr) auto;justify-items:center;align-items:center;padding:20px 32px 22px}.face-check>section{z-index:1;display:grid;justify-items:center;align-content:center;text-align:center}
.face-preview{position:relative;width:var(--fc-preview-w,500px);height:var(--fc-preview-h,350px);margin-bottom:12px;overflow:hidden;border-radius:var(--fc-radius,28px);background:#111932;box-shadow:0 24px 65px #0008}
.face-preview video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.face-oval{position:absolute;left:25%;top:10%;width:50%;height:72%;border:2px solid #ffffffaa;border-radius:46% / 50%;box-shadow:0 0 0 999px #070a165c;transition:border-color var(--motion-slow,.45s)}
.face-oval.ready{border-color:var(--ok-border,#5fe2a8);box-shadow:0 0 35px #5fe2a866,0 0 0 999px #070a164d inset}
.face-oval.error{border-color:var(--error-border,#f87171)}
.face-check h1{margin:0;font-size:var(--fs-headline,27px);font-family:serif}
.face-check p{color:var(--tx-soft,#aab3cc)}
.face-check__message{min-height:22px;margin:9px 0 0!important;color:var(--tx-medium,#c6d0e8)!important}
.readiness-list{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}
.readiness-list span{display:flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid rgba(197,211,244,.16);border-radius:999px;background:rgba(7,13,30,.33);color:var(--tx-faint,#9daccc);font-size:var(--fs-micro,12px);transition:.25s}
.readiness-list i{display:grid;place-items:center;width:14px;height:14px;border-radius:50%;border:1px solid #d4a45355;color:#d4a453;font-size:10px;font-style:normal}
.readiness-list .pass{border-color:rgba(95,226,168,.28);color:#d4eee1}
.readiness-list .pass i{background:#5fe2a8;border-color:transparent;color:#0b301f;box-shadow:0 0 10px rgba(95,226,168,.7)}
.face-check__note{max-width:520px;margin:9px 0 0!important;color:var(--tx-faint,#a8b5ce)!important;font-size:var(--fs-micro,12px)!important;line-height:1.5}
.face-check .primary--wide{min-height:58px;margin-top:14px;padding-inline:48px}
.face-check>small{position:static;margin-top:16px;color:#aab3cc99;font-size:12px}
.loading-dots{display:flex;gap:8px;margin-top:26px}
.loading-dots i{width:10px;height:10px;border-radius:50%;background:#9db2ec;animation:pulse 1s infinite alternate}
.loading-dots i:nth-child(2){animation-delay:.2s}
.loading-dots i:nth-child(3){animation-delay:.4s}
@keyframes pulse{to{transform:translateY(-7px);opacity:.4}}
@media(max-height:820px){.face-preview{width:460px;height:320px}.face-check h1{font-size:24px}}@media(max-height:680px){.face-check{padding-top:12px;padding-bottom:16px}.face-preview{width:420px;height:280px;margin-bottom:9px}.face-check h1{font-size:22px}.readiness-list{margin-top:7px}.face-check__note{margin-top:6px!important}.face-check .primary--wide{margin-top:10px;min-height:52px}.face-check>small{margin-top:10px}}


/* 正式采集前使用中性蓝灰舞台，和明亮服务页形成清楚的阶段切换。 */
.face-check{color:#f5fafb;background:linear-gradient(145deg,#587788 0%,#3d5d6c 100%)}
.face-check:before,.face-check:after{opacity:.1}.face-check h1{color:#fff}.face-check p,.face-check__message{color:#e5eef0!important}.face-check__eyebrow{color:#c7dfd7}.face-check__note{color:#d5e1e4!important}.face-check>small{color:#d5e1e4}
.readiness-list span{color:#dce8ea;background:rgba(20,43,53,.25);border-color:rgba(226,238,240,.26)}.readiness-list .pass{color:#edfaf4;border-color:rgba(170,220,201,.55)}.readiness-list .pass i{background:#a7d8c3;color:#23483e;box-shadow:none}
.face-preview{box-shadow:0 12px 30px rgba(19,42,52,.28)}


/* 连续测评阶段统一舞台色。 */
.face-check{background:#8badb1}.face-check:before,.face-check:after{display:none}


/* 原生预览接管前会短暂露出此容器：用浅雾青取代旧深蓝黑底，避免形成黑色边框。 */
.face-preview{
  background:#7fa3a8;
  border:1px solid rgba(247,252,251,.62);
  box-shadow:0 10px 24px rgba(49,80,85,.16);
}
.face-oval{
  border-color:rgba(247,252,251,.82);
  box-shadow:0 0 0 999px rgba(39,78,84,.10);
}
.face-oval.ready{
  border-color:#b7dfca;
  box-shadow:0 0 0 3px rgba(183,223,202,.22),0 0 0 999px rgba(39,78,84,.10);
}


/* 就位页同样采用浅背景上的深色文字，避免与舞台色混在一起。 */
.face-check{color:#203e4d}.face-check h1{color:#203e4d;font-weight:650}.face-check p,.face-check__message{color:#365864!important;font-weight:550}.face-check__eyebrow{color:#365f6a;font-weight:700}.face-check__note{color:#45646f!important;font-weight:500}.face-check>small{color:#4b6872}
.readiness-list span{color:#294e5a;background:rgba(255,255,255,.6);border-color:rgba(55,91,96,.32);font-weight:600}.readiness-list .pass{color:#25584e;border-color:rgba(64,126,113,.55)}
</style>
