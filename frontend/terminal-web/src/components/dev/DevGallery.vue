<script setup lang="ts">
/**
 * 开发演示入口（?demo=1）：查看各阶段与异常状态的纯展示画廊。
 *
 * - 只渲染真实组件 + mock props，不挂任何业务编排；
 * - 不开启摄像头/录像，不请求题库，不发送任何提交——不可能污染正式测评数据；
 * - 每一屏都有明显的“开发演示”水印，不会与正式界面混淆。
 * 视觉协作者可在此逐一核对各阶段的替换效果。
 */
import { computed, ref } from 'vue'
import IdentityForm from '@/components/identity/IdentityForm.vue'
import ConsentPanel from '@/components/consent/ConsentPanel.vue'
import FaceCheck from '@/components/camera/FaceCheck.vue'
import CountdownStage from '@/components/assessment/CountdownStage.vue'
import PracticeStage from '@/components/assessment/PracticeStage.vue'
import QuestionStage from '@/components/assessment/QuestionStage.vue'
import CapturedNotice from '@/components/feedback/CapturedNotice.vue'
import CaptureInvalid from '@/components/feedback/CaptureInvalid.vue'
import QualityRestart from '@/components/feedback/QualityRestart.vue'
import ResultState from '@/components/feedback/ResultState.vue'
import type { FaceReadinessState, FaceNotice, SchedulerCard, SessionQuestion } from '@/aviation/types'
import type { UserIdentity } from '@/types/terminal'

const SCREENS = [
  'identity', 'consent', 'consent-error', 'face-ok', 'face-warn', 'face-fail', 'face-error',
  'practice-demo', 'practice-complete', 'practice-skipped', 'countdown',
  'assess-question', 'assess-feedback', 'assess-closing', 'assess-interrupting',
  'captured', 'capture-invalid', 'quality-restart',
  'result-loading', 'result-submitting', 'result-failed', 'result-complete',
] as const
type Screen = typeof SCREENS[number]
const screen = ref<Screen>('assess-question')

const question: SessionQuestion = {
  id: 'demo-q1',
  question: '当多个信息同时变化时，你通常更接近哪种处理方式？',
  options: [
    { id: 'demo-q1-a', text: '先确认最关键的信息，再依次处理其他变化。' },
    { id: 'demo-q1-b', text: '先快速浏览全部信息，再决定从哪里开始。' },
  ],
  image: '/static/assets/aviation/a01-instrument-monitoring.jpg',
  imageAlt: '航空情境图片',
  audioUrl: '',
  dimension: '注意分配',
  contentVersion: 'demo',
  scoringMode: 'observation_only',
}

const readiness = (over: Partial<FaceReadinessState> = {}): FaceReadinessState => ({
  cameraOn: true, singleFace: true, positionOk: true, detectionFresh: true, stableMs: 3000, ready: true, ...over,
})
const notice = (level: FaceNotice['level'], messageKey: string): FaceNotice => ({ level, messageKey })

const faceStates: Record<string, { readiness: FaceReadinessState; notice: FaceNotice }> = {
  'face-ok': { readiness: readiness(), notice: notice('ok', 'readyMessage') },
  'face-warn': { readiness: readiness({ positionOk: true, ready: false }), notice: notice('warn', 'nearCenterEdge') },
  'face-fail': { readiness: readiness({ singleFace: false, positionOk: false, ready: false }), notice: notice('fail', 'tooFar') },
  'face-error': { readiness: readiness({ cameraOn: false, ready: false }), notice: notice('error', 'cameraDenied') },
}

const cards: Record<string, SchedulerCard> = {
  'assess-question': { kind: 'question', instance: { instanceId: 1, question, role: 'regular' } },
  'assess-feedback': { kind: 'feedback', instance: { instanceId: 1, question, role: 'regular' }, outcome: 'selected', optionId: 'demo-q1-a' },
  'assess-closing': { kind: 'closing' },
  'assess-interrupting': { kind: 'question', instance: { instanceId: 2, question, role: 'regular' } },
}

const practiceCards: Record<string, SchedulerCard> = {
  'practice-demo': cards['assess-question']!,
  'practice-complete': { kind: 'none' },
  'practice-skipped': { kind: 'none' },
}

const consentStates: Record<string, { ready: boolean; error: string }> = {
  consent: { ready: true, error: '' },
  'consent-error': { ready: false, error: '正式题库不足（可用 4 题，至少需要 10 题），请联系工作人员补充题库' },
}

const current = computed(() => screen.value)
function pick(next: Screen) { screen.value = next }
function onIdentitySubmit(identity: UserIdentity) { console.info('[demo] identity submit', identity) }
</script>

<template>
  <main class="dev-gallery">
    <nav class="dev-gallery__nav">
      <h1>开发演示 · 航空测评阶段画廊</h1>
      <p>纯展示 + mock 数据 · 不提交 · 不污染正式测评数据</p>
      <div class="dev-gallery__buttons">
        <button v-for="name in SCREENS" :key="name" :class="{ active: current === name }" @click="pick(name)">{{ name }}</button>
      </div>
    </nav>
    <section class="dev-gallery__stage" :data-screen="current">
      <span class="dev-gallery__watermark">DEV DEMO</span>

      <IdentityForm v-if="current === 'identity'" @submit="onIdentitySubmit" />
      <ConsentPanel
        v-else-if="current === 'consent' || current === 'consent-error'"
        :assets-ready="consentStates[current]!.ready" :assets-error="consentStates[current]!.error"
      />
      <FaceCheck
        v-else-if="current.startsWith('face')"
        :readiness="faceStates[current]!.readiness" :notice="faceStates[current]!.notice" :native="false"
      />
      <PracticeStage
        v-else-if="current.startsWith('practice')"
        :step="current === 'practice-demo' ? 'demo' : current === 'practice-complete' ? 'complete' : 'skipped'"
        :card="practiceCards[current]!" :index="1" :total="3"
        :native="false"
        :camera-message="current === 'practice-demo' ? '位置合适' : '请将面部移到框中央'"
        :face-level="current === 'practice-demo' ? 'ok' : 'warn'"
      />
      <CountdownStage v-else-if="current === 'countdown'" :countdown="2" />
      <QuestionStage
        v-else-if="current.startsWith('assess')"
        :card="cards[current]!"
        :elapsed-sec="current === 'assess-closing' ? 57 : 12"
        :remaining-sec="current === 'assess-closing' ? 3 : 48"
        :progress-pct="current === 'assess-closing' ? 95 : 20"
        :interrupting="current === 'assess-interrupting'"
        :interrupt-reason="current === 'assess-interrupting' ? '未检测到面部，请回到画面框内' : ''"
        :camera-message="current === 'assess-interrupting' ? '未检测到面部，请回到画面框内' : '位置合适'"
        :face-level="current === 'assess-interrupting' ? 'fail' : 'ok'"
        :native="false"
      />
      <CapturedNotice v-else-if="current === 'captured'" />
      <CaptureInvalid v-else-if="current === 'capture-invalid'" reason="人脸离开有效框（未检测到面部）——本协议要求全程在框，本轮无效" />
      <QualityRestart v-else-if="current === 'quality-restart'" />
      <ResultState v-else-if="current === 'result-loading'" kind="loading" :countdown="7" />
      <ResultState v-else-if="current === 'result-submitting'" kind="submitting" />
      <ResultState v-else-if="current === 'result-failed'" kind="failed" message="网络异常：上传超时" :can-retry="true" />
      <ResultState v-else-if="current === 'result-complete'" kind="complete" :countdown="30" />
    </section>
  </main>
</template>

<style scoped>
.dev-gallery{display:grid;grid-template-rows:auto 1fr;width:100%;height:100%;overflow:hidden;background:#0a0f1e}
.dev-gallery__nav{padding:14px 20px;border-bottom:1px solid #ffffff22;color:#dfe8ff}
.dev-gallery__nav h1{margin:0;font-size:16px;color:#f5be50}
.dev-gallery__nav p{margin:4px 0 10px;font-size:12px;color:#96aebf}
.dev-gallery__buttons{display:flex;flex-wrap:wrap;gap:6px}
.dev-gallery__buttons button{padding:6px 10px;border:1px solid #ffffff33;border-radius:8px;background:transparent;color:#c6d0e8;font-size:12px}
.dev-gallery__buttons button.active{background:#f5be5026;border-color:#f5be50;color:#ffe0a0}
.dev-gallery__stage{position:relative;overflow:hidden}
.dev-gallery__watermark{position:absolute;z-index:99;right:14px;bottom:12px;padding:4px 10px;border-radius:8px;background:#f5be5026;border:1px solid #f5be5088;color:#ffe0a0;font-size:11px;letter-spacing:.18em;pointer-events:none}
</style>
