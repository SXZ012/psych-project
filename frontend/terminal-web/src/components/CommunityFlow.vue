<script setup lang="ts">
/**
 * 社区场景外壳：按 v6 状态机路由，统一挂顶部阶段进度条。
 * welcome → brief(测评与隐私说明·合并页) → payment_mock → consent ⇄ assets_loading
 * → opening(10 秒·可跳过) → face_ready(就位检查) → practice(3 道预训练·可跳过)
 * → countdown(3 秒) → capturing(60 秒有效采集·自定节奏)
 * → closing(整理) → report_processing → complete
 * 失败态（assets/device/quality/submit）均可恢复、均显示编号、结束不新建支付。
 * 测评内核（就位 → 预训练 → 倒计时 → 60 秒采集）与航空完全同构。
 */
import { computed, nextTick, onMounted, watch } from 'vue'
import CommunityWelcome from '@/components/community/CommunityWelcome.vue'
import CommunityBrief from '@/components/community/CommunityBrief.vue'
import ExperienceConfirm from '@/components/community/ExperienceConfirm.vue'
import CommunityConsent from '@/components/community/CommunityConsent.vue'
import AssetsLoading from '@/components/community/AssetsLoading.vue'
import CinematicOpening from '@/components/community/CinematicOpening.vue'
import FaceReady from '@/components/community/FaceReady.vue'
import CommunityPractice from '@/components/community/CommunityPractice.vue'
import CommunityCountdown from '@/components/community/CommunityCountdown.vue'
import CommunityQuestionStage from '@/components/community/CommunityQuestionStage.vue'
import JourneyClosing from '@/components/community/JourneyClosing.vue'
import CommunityResultState from '@/components/community/CommunityResultState.vue'
import ReportProcessing from '@/components/community/ReportProcessing.vue'
import CommunityComplete from '@/components/community/CommunityComplete.vue'
import CommunityTopBar from '@/components/community/CommunityTopBar.vue'
import { useCommunityFlow } from '@/composables/useCommunityFlow'
import { COMMUNITY_QUESTION_CONFIG } from '@/config/community/content'
import { PHASE_STEP } from '@/community/flowSteps'

const props = defineProps<{ deviceId: string; questionCount?: number }>()
const emit = defineEmits<{ 'entry-state': [atEntry: boolean] }>()
const flow = useCommunityFlow(props.deviceId, props.questionCount ?? COMMUNITY_QUESTION_CONFIG.poolRequestCount)

const showTopBar = computed(() => PHASE_STEP[flow.phase.value] !== null)

/** 预训练按钮的人脸门禁：就位稳定为 ok，检测异常为 error，其余为提醒 */
const practiceFaceLevel = computed<'ok' | 'warn' | 'fail' | 'error'>(() =>
  flow.faceReady.value ? 'ok' : flow.faceState.value === 'error' ? 'error' : 'warn')

onMounted(() => { if (flow.phase.value === 'payment_mock' && !flow.sessionId.value) void flow.createSession() })

// 原生预览覆盖层跟随阶段：就位用大框，预训练/倒计时/采集用正上方居中同款小框
watch(() => flow.phase.value, async phase => {
  emit('entry-state', phase === 'welcome')
  const anchor = phase === 'face_ready' ? 'detect'
    : (phase === 'practice' || phase === 'countdown' || phase === 'capturing') ? 'monitor' : null
  if (!anchor) return
  await nextTick()
  if (flow.native.available.value) void flow.native.place(document.querySelector(`[data-native-preview-anchor="${anchor}"]`))
}, { immediate: true })
</script>
<template>
  <CommunityTopBar v-if="showTopBar" :phase="flow.phase.value" @home="flow.finish" />

  <!-- 1. 欢迎 -->
  <CommunityWelcome v-if="flow.phase.value === 'welcome'" @start="flow.startFromWelcome" @entry-state="emit('entry-state', $event)" />
  <!-- 2. 测评与隐私说明（合并页） -->
  <CommunityBrief v-else-if="flow.phase.value === 'brief'" @next="flow.onBriefDone" />
  <!-- 3. 体验确认（支付占位） -->
  <ExperienceConfirm
    v-else-if="flow.phase.value === 'payment_mock'"
    :status="flow.payStatus.value" :qr-url="flow.payQrUrl.value" :amount-fen="flow.amountFen.value"
    :countdown="flow.payCountdown.value" :error="flow.payError.value" :mock="flow.payMock.value"
    :mock-busy="flow.payMockBusy.value"
    @confirm="flow.confirmExperience" @mock-pay="flow.mockPayNow" @restart="flow.restartPayment"
  />
  <!-- 4. 知情同意（素材并行准备） -->
  <CommunityConsent
    v-else-if="flow.phase.value === 'consent'"
    :assets-ready="flow.assetsReady.value" :assets-error="flow.assetsError.value"
    @retry-assets="flow.retryAssets" @confirm="flow.onConsentConfirm"
  />
  <!-- 4b. 素材准备过渡（确认后未就绪时才显示） -->
  <AssetsLoading v-else-if="flow.phase.value === 'assets_loading'" :progress="{ loaded: flow.assetsProgress.value, total: flow.total.value }" />
  <!-- 5. 社区开场短片（10 秒 · 可跳过） -->
  <CinematicOpening v-else-if="flow.phase.value === 'opening'" @done="flow.onOpeningDone" />
  <!-- 6. 就位检查（三检查点通过后由用户确认） -->
  <FaceReady
    v-else-if="flow.phase.value === 'face_ready'"
    :ready="flow.ready.value" :checklist="flow.readyChecklist.value"
    :message="flow.faceMessage.value" :native="flow.native.available.value"
    @confirm="flow.confirmReady" @simulate-ready="flow.simulateFaceReady"
  />
  <!-- 7. 3 道预训练（可跳过，完成后用户点“开始正式测评”） -->
  <CommunityPractice
    v-else-if="flow.phase.value === 'practice'"
    :native="flow.native.available.value" :camera-message="flow.cameraMessage.value"
    :face-level="practiceFaceLevel"
    @start="flow.beginCountdown"
  />
  <!-- 8. 3 秒倒计时（只显示 3/2/1） -->
  <CommunityCountdown
    v-else-if="flow.phase.value === 'countdown'"
    :countdown="flow.countdownSec.value" :native="flow.native.available.value"
    :camera-message="flow.cameraMessage.value" :face-ok="flow.ready.value"
  />
  <!-- 9. 60 秒有效采集（自定节奏：调度器驱动，≤4s 不出新题，题库耗尽进收尾页） -->
  <CommunityQuestionStage
    v-else-if="flow.phase.value === 'capturing'"
    :card="flow.card.value" :presented-count="flow.presentedCount.value" :total="flow.total.value"
    :progress="flow.progress.value" :remaining-sec="flow.captureRemainingSec.value"
    :native="flow.native.available.value" :camera-message="flow.cameraMessage.value"
    :face-state="flow.faceState.value" :interrupting="flow.interrupting.value"
    :interrupt-reason="flow.interruptReason.value" :final-hint="flow.finalHint.value"
    @select="flow.select"
  />
  <!-- 10. 整理本次体验（真实状态驱动） -->
  <JourneyClosing
    v-else-if="flow.phase.value === 'closing'"
    :step="flow.closingStep.value" :uploading="flow.uploading.value" :error="flow.closingError.value"
  />
  <!-- 12. 报告生成中（可离开·扫码·报告编号） -->
  <ReportProcessing
    v-else-if="flow.phase.value === 'report_processing'"
    :session-id="flow.sessionId.value" :session-code="flow.sessionCode.value" :submitted-at-text="''"
    @finish="flow.finish"
  />
  <!-- 提交失败（编号 + 重试 + 结束） -->
  <CommunityResultState
    v-else-if="flow.phase.value === 'submit_failed'" :message="flow.failure.value" :session-code="flow.sessionCode.value"
    @retry="flow.retrySubmit" @end="flow.endSession"
  />
  <!-- 质量异常（同会话重新就位，不重新支付） -->
  <main v-else-if="flow.phase.value === 'quality_failed'" class="terminal-shell community-stage device-error-view">
    <section class="de2-card">
      <div class="de2-icon de2-icon--svg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.5-7 8-7s8 3 8 7"/><path d="M4 4l16 16"/></svg>
      </div>
      <h1>这次的画面条件不太稳定</h1>
      <p>刚才的记录没有被采用。别担心，重新坐好再来一次就好。</p>
      <div class="de2-actions">
        <button class="primary" @click="flow.retryCapture">重新采集</button>
        <button class="secondary-button" @click="flow.endSession">返回首页</button>
      </div>
      <small>重新采集不需要再次确认，你的体验不受影响</small>
      <p v-if="flow.sessionCode.value" class="de2-code">编号 <b>{{ flow.sessionCode.value }}</b>（向工作人员求助时报这个编号）</p>
    </section>
  </main>
  <!-- 素材失败 -->
  <main v-else-if="flow.phase.value === 'assets_failed'" class="terminal-shell community-stage device-error-view">
    <section class="de2-card">
      <div class="de2-icon de2-icon--svg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M8 15h4"/></svg>
      </div>
      <h1>内容暂时没有准备好</h1>
      <p>{{ flow.failure.value }}</p>
      <div class="de2-actions">
        <button class="primary" @click="flow.retryAssets">再试一次</button>
        <button class="secondary-button" @click="flow.endSession">返回首页</button>
      </div>
      <p v-if="flow.sessionCode.value" class="de2-code">编号 <b>{{ flow.sessionCode.value }}</b>（向工作人员求助时报这个编号）</p>
    </section>
  </main>
  <!-- 设备异常 -->
  <main v-else-if="flow.phase.value === 'device_error'" class="terminal-shell community-stage device-error-view">
    <section class="de2-card">
      <div class="de2-icon de2-icon--svg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="7" width="13" height="11" rx="2.5"/><path d="M16 11l5-2.5v8L16 14"/><path d="M4 4l16 16" /></svg>
      </div>
      <h1>摄像头暂时打不开</h1>
      <p>{{ flow.failure.value }}</p>
      <div class="de2-actions">
        <button class="primary" @click="flow.retryCapture">再试一次</button>
        <button class="secondary-button" @click="flow.endSession">返回首页</button>
      </div>
      <small>多次失败时，请联系现场工作人员</small>
      <p v-if="flow.sessionCode.value" class="de2-code">编号 <b>{{ flow.sessionCode.value }}</b>（向工作人员求助时报这个编号）</p>
    </section>
  </main>
  <!-- 13. 完成页 -->
  <CommunityComplete
    v-else :session-id="flow.sessionId.value" :session-code="flow.sessionCode.value"
    @finish="flow.finish"
  />
</template>
<style scoped>
.device-error-view{display:grid;place-items:center}
.de2-card{z-index:1;width:min(480px,calc(100vw - 48px));padding:36px;border-radius:24px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #0006}
.de2-icon--svg{display:grid;place-items:center;width:76px;height:76px;margin:0 auto 14px;border-radius:50%;background:#fdeee6;border:2px solid rgba(239,120,68,.4)}
.de2-icon--svg svg{width:38px;height:38px;color:#c96a42}
.de2-card h1{margin:0 0 8px;font-size:23px;color:#263c35;font-family:serif}
.de2-card p{margin:0 0 20px;color:#7d8f86;font-size:14px;line-height:1.7}
.de2-actions{display:grid;gap:12px}
.de2-actions .primary{width:100%}
.de2-actions .secondary-button{width:100%;min-height:54px;border:1px solid #bfd2ca;border-radius:14px;color:#3e7367;background:#fff;font-size:15px}
.de2-card small{display:block;margin-top:14px;color:#82918b;font-size:12px}
.de2-code{margin:14px 0 0 !important;padding:10px 14px;border-radius:12px;background:#f5f0e8;color:#7a6a52;font-size:13px;line-height:1.6}
.de2-code b{font-family:ui-monospace,monospace;letter-spacing:.08em;color:#4a3f2c;font-size:15px}
</style>
