<script setup lang="ts">
/**
 * 航空场景测评流程：按 FlowController 阶段路由到各舞台。
 * 只做 props 下传与事件上抛——完成/超时退出时 emit('exit') 回到外壳首页。
 */
import { computed, nextTick, watch } from 'vue'
import IdentityForm from '@/components/identity/IdentityForm.vue'
import ConsentPanel from '@/components/consent/ConsentPanel.vue'
import FaceCheck from '@/components/camera/FaceCheck.vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import CountdownStage from '@/components/assessment/CountdownStage.vue'
import PracticeStage from '@/components/assessment/PracticeStage.vue'
import QuestionStage from '@/components/assessment/QuestionStage.vue'
import CapturedNotice from '@/components/feedback/CapturedNotice.vue'
import CaptureInvalid from '@/components/feedback/CaptureInvalid.vue'
import QualityRestart from '@/components/feedback/QualityRestart.vue'
import ResultState from '@/components/feedback/ResultState.vue'
import SubmitCredential from '@/components/report/SubmitCredential.vue'
import { useAviationFlow } from '@/composables/useAviationFlow'
import { AVIATION_CONFIG } from '@/aviation/config'
import { MESSAGES, faceMessage } from '@/aviation/messages'

const emit = defineEmits<{ exit: [] }>()
const flow = useAviationFlow()

const elapsedSec = computed(() => Math.min(60, Math.floor(flow.captureElapsedMs.value / 1000)))
const progressPct = computed(() => Math.min(100, flow.captureElapsedMs.value / AVIATION_CONFIG.requiredMs * 100))
const cameraMessage = computed(() =>
  flow.faceReady.value ? MESSAGES.assess.positionOk : faceMessage(flow.faceNotice.value.messageKey))

function finishAndExit() {
  flow.finish()
  emit('exit')   // 回到外壳首页；流程组件随后被卸载，全部状态清空
}

// 隐私自动退出（完成页倒计时归零 → finish → 回 login）：同样送回首页
watch(() => flow.phase.value, phase => { if (phase === 'login') emit('exit') })

// 人脸就位后会新增“开始操作体验”按钮，内容区随之重新居中。
// 原生预览在 WebView 上层，必须在 Vue 完成这一帧布局后重算位置，
// 否则会保留在按钮出现前的旧坐标，形成上下错开的双层边框。
watch(
  () => flow.faceReady.value,
  async () => {
    if (flow.phase.value !== 'detect' || !flow.native.available.value) return
    await nextTick()
    void flow.native.place(document.querySelector<HTMLElement>('[data-native-preview-anchor="detect"]'))
  },
  { flush: 'post' },
)
</script>
<template>
  <IdentityForm v-if="flow.phase.value==='login'" @submit="flow.enter" @back="finishAndExit" />
  <ConsentPanel
    v-else-if="flow.phase.value==='consent'"
    :assets-ready="flow.assetsReady.value" :assets-error="flow.assetsError.value"
    @retry-assets="flow.prepareAssets" @confirm="flow.confirmConsent"
  />
  <FaceCheck
    v-else-if="flow.phase.value==='detect'"
    :readiness="flow.readiness.value" :notice="flow.faceNotice.value" :native="flow.native.available.value"
    @start="flow.begin"
  />
  <PracticeStage
    v-else-if="flow.phase.value==='practice'"
    :step="flow.practicePhase.value" :card="flow.practiceCard.value"
    :index="flow.practiceIndex.value" :total="AVIATION_CONFIG.practiceCount"
    :native="flow.native.available.value" :camera-message="cameraMessage"
    :face-level="flow.faceReady.value ? 'ok' : (flow.faceNotice.value.level === 'error' ? 'error' : flow.faceNotice.value.level === 'warn' ? 'warn' : 'fail')"
    @select-demo="(id, option) => flow.selectPractice(option)"
    @start-countdown="flow.startCountdown" @skip-all="flow.skipPractice"
  />
  <!-- 3 秒倒计时：准备/练习/倒计时均不计入正式 60 秒 -->
  <template v-else-if="flow.phase.value==='countdown'">
    <CameraMonitor
      :native="flow.native.available.value"
      :message="flow.faceReady.value ? MESSAGES.assess.positionOk : faceMessage(flow.faceNotice.value.messageKey)"
      :state="flow.faceReady.value ? 'ok' : 'warning'"
    />
    <CountdownStage :countdown="flow.countdownSec.value" />
  </template>
  <!-- 60 秒连续采集：自定节奏出题，剩余时间为真实采集时钟 -->
  <QuestionStage
    v-else-if="flow.phase.value==='assess'"
    :card="flow.card.value"
    :elapsed-sec="elapsedSec" :remaining-sec="flow.captureRemainingSec.value" :progress-pct="progressPct"
    :interrupting="flow.interrupting.value" :interrupt-reason="flow.interruptReason.value"
    :camera-message="cameraMessage"
    :face-level="flow.interrupting.value ? 'warn' : (flow.faceReady.value ? 'ok' : (flow.faceNotice.value.level === 'error' ? 'error' : flow.faceNotice.value.level === 'warn' ? 'warn' : 'fail'))"
    :native="flow.native.available.value"
    @select="(id, option) => flow.select(option)"
  />
  <CapturedNotice v-else-if="flow.phase.value==='captured'" :sim-mode="flow.simMode" />
  <CapturedNotice v-else-if="flow.phase.value==='loading'" :sim-mode="flow.simMode" />
  <CaptureInvalid v-else-if="flow.phase.value==='capture_invalid'" :reason="flow.failure.value" @restart="flow.restartAfterInvalid" />
  <QualityRestart v-else-if="flow.phase.value==='quality_restart'" @restart="flow.restartAfterQuality" />
  <ResultState v-else-if="flow.phase.value==='submitting'" kind="submitting" />
  <ResultState
    v-else-if="flow.phase.value==='submit_failed'" kind="failed" :message="flow.failure.value"
    :can-retry="flow.canRetrySubmit.value" @retry="flow.retrySubmit"
  />
  <!-- 提交成功：服务端已持久化测评与任务，显示固定报告编号 -->
  <SubmitCredential
    v-else
    :report-id="flow.reportId.value" :subject-no="flow.subjectNo.value"
    :countdown="flow.completeCountdown.value" :sim-mode="flow.simMode"
    @finish="finishAndExit" @activity="flow.resetCompleteCountdown"
  />
</template>
