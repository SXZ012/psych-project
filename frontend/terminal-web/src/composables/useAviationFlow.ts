/**
 * 航空测评编排层（薄胶水）：把纯控制器接进 Vue 响应式世界。
 *
 * 职责划分（详见 docs/aviation-architecture.md）：
 * - FlowController    阶段状态机（转换表约束，非法转换一律拒绝）
 * - CaptureController 录制计时/质量门禁/封存失效（唯一判定来源，本轮未改动）
 * - QuestionScheduler 题池/自定节奏切题/收尾调度（正式+预训练两个实例）
 * - AudioCoordinator  语音优先级/防重叠/取消语义
 * - FaceReadiness     结构化就位/预警/过期
 * - SubmissionService 幂等提交/重试/状态区分
 * - 本文件只做：创建实例、桥接 DOM/摄像头/计时器、把状态映射成 refs。
 *
 * 关键规则：
 * - 正式 60 秒从录制实际启动成功起算（CaptureController.start 为零点），单调时钟；
 * - 采集结束（封存/失效）→ 冻结调度与音频、取消挂起回调；
 * - 上传失败重试复用同一 client_token，不重复创建测评记录；
 * - 完成退出清空终端身份/答题/音频状态（不删除任何服务端数据）。
 */
import { computed, nextTick, onBeforeUnmount, provide, reactive, ref, watch } from 'vue'
import { useAndroidCamera, type NativeFaceResult } from '@/composables/useAndroidCamera'
import { useBrowserCamera } from '@/composables/useBrowserCamera'
import { useBrowserFaceDetection } from '@/composables/useBrowserFaceDetection'
import { CaptureController, type CaptureSummary } from '@/capture/CaptureController'
import { FlowController } from '@/aviation/FlowController'
import { QuestionScheduler } from '@/aviation/QuestionScheduler'
import { AudioCoordinator } from '@/aviation/AudioCoordinator'
import { createHtmlAudioFactory } from '@/aviation/audioPlayers'
import { FaceReadiness } from '@/aviation/FaceReadiness'
import { SubmissionService } from '@/aviation/SubmissionService'
import { buildSessionPool, preloadAssets, type BuiltSession } from '@/aviation/questionPool'
import { AVIATION_CONFIG, QUESTION_PROTOCOL_VERSION, TICK_MS } from '@/aviation/config'
import { CAMERA_SINK_KEY, type CameraSink } from '@/aviation/cameraSink'
import type {
  FaceReadinessState, FaceNotice, Phase, SchedulerCard, SubmitPayload, SubmitSelection,
} from '@/aviation/types'
import type { UserIdentity } from '@/types/terminal'

const P = AVIATION_CONFIG.protocol

/** 开发模拟模式（?sim=1）：状态机照常运转，注入合成人脸事件；不录像、不提交任何数据。 */
const SIM_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sim')

/** 提示音节流：非采集阶段的位置提醒间隔（采集阶段走 sustainedAlert 门槛） */
const REMINDER_THROTTLE_MS = 7_000

/** 知情同意版本：ConsentPanel 条款实质变更时递增（随提交上报，可追溯） */
const CONSENT_VERSION = 'aviation-consent-v1'

export function useAviationFlow() {
  // ── 子系统 ──
  const native = useAndroidCamera()
  const browser = useBrowserCamera()
  const browserFace = useBrowserFaceDetection(result => onFaceEvent(result))
  const flow = new FlowController({ onPhaseChange: next => { phase.value = next } })
  const face = new FaceReadiness({ onReadyChange: () => syncFaceRefs() })
  /** 音频协调器在整场结束（finish）后销毁重建，避免 dispose 后复用 */
  function makeAudio() {
    return new AudioCoordinator({
      factory: createHtmlAudioFactory(),
      isQuestionCurrent: instanceId => currentInstanceId() === instanceId,
    })
  }
  let audio = makeAudio()
  const submission = new SubmissionService(
    native.available.value
      ? {
          nativeSubmit: async payload => {
            const result = await native.submitAssessment(payload as unknown as object)
            return {
              ok: Boolean(result.ok), assessment_id: result.assessment_id,
              access_code: (result as { access_code?: string }).access_code,
              error: result.error,
            }
          },
        }
      : {},
  )

  // ── 响应式状态（UI 只读这些） ──
  const phase = ref<Phase>('login')
  const identity = ref<UserIdentity | null>(null)
  const failure = ref('')
  const canRetrySubmit = ref(true)
  const assetsReady = ref(false)
  const assetsError = ref('')
  const assetProgress = reactive({ loaded: 0, total: 0 })
  const readiness = ref<FaceReadinessState>({ ...face.snapshot })
  const faceNotice = ref<FaceNotice>({ ...face.currentNotice })
  const faceReady = computed(() => readiness.value.ready)
  const countdownSec = ref(AVIATION_CONFIG.countdownSeconds)
  const practicePhase = ref<'demo' | 'complete' | 'skipped'>('demo')
  const practiceCard = ref<SchedulerCard>({ kind: 'none' })
  const card = ref<SchedulerCard>({ kind: 'none' })
  const captureElapsedMs = ref(0)
  const captureRemainingSec = ref(Math.ceil(AVIATION_CONFIG.requiredMs / 1000))
  const interrupting = ref(false)
  const interruptReason = ref('')
  const completeCountdown = ref(AVIATION_CONFIG.completeTimeoutSec)
  /** 固定报告编号：assessment UUID 前八位，与管理员报告列表一致。 */
  const reportId = ref<string | null>(null)

  // ── 运行时句柄 ──
  let sessionBuild: BuiltSession | null = null
  let practiceScheduler: QuestionScheduler | null = null
  let formalScheduler: QuestionScheduler | null = null
  let captureController: CaptureController | null = null
  let captureSummary: CaptureSummary | null = null
  let sealedVideo: Blob | null = null
  let practiceStartedAt = 0
  const timers = new Set<number>()
  let lastRemindedAt = -Infinity
  let sustainedAlerted = false
  let finalReminderAnnounced = false
  let lastPlayedInstance = { practice: 0, formal: 0 }

  function setTimer(id: number) { timers.add(id); return id }
  function clearTimers() { timers.forEach(id => { window.clearInterval(id); window.clearTimeout(id) }); timers.clear() }

  // ═══════════════ 人脸事件（原生 + 浏览器统一入口） ═══════════════
  function onFaceEvent(result: NativeFaceResult | null) {
    const evaluation = face.evaluate(result)
    syncFaceRefs()
    if (phase.value === 'assess') {
      captureController?.reportQuality(evaluation.ok, evaluation.issueKey)
      if (evaluation.ok) { sustainedAlerted = false; audio.resetPositionReminder() }
    }
    maybePlayPositionReminder(evaluation.ok, evaluation.issueKey)
  }

  function syncFaceRefs() {
    readiness.value = { ...face.snapshot }
    faceNotice.value = { ...face.currentNotice }
    native.setGuideState(
      faceNotice.value.level === 'ok' ? 'ok'
      : faceNotice.value.level === 'error' ? 'error' : 'warning',
    )
  }

  /** 位置提醒：非采集阶段节流 7s；采集阶段由 sustained 门槛驱动（见 captureTick）。 */
  function maybePlayPositionReminder(ok: boolean, issueKey: string) {
    // 采集封存后进入提交/查询码页面，不再需要位置提醒，也不能让残留的人脸事件触发语音。
    if (!['detect', 'practice', 'countdown', 'assess'].includes(phase.value)) return
    if (ok) { audio.resetPositionReminder(); return }
    if (phase.value === 'assess') return
    const now = performance.now()
    if (now - lastRemindedAt < REMINDER_THROTTLE_MS) return
    lastRemindedAt = now
    audio.playPositionReminder(issueKey === 'tooFar' ? 'far' : issueKey === 'tooNear' ? 'near' : 'deviation')
  }

  if (!SIM_MODE) watch(native.faceResult, result => onFaceEvent(result))
  else registerSimHooks()

  /** sim 模式当前合成人脸状态（周期重放，模拟真实检测流的节拍） */
  let simFace: { count: number; xCenter?: number; yCenter?: number; width?: number; height?: number } = { count: 1, xCenter: .5, yCenter: .5, width: .3, height: .4 }

  function registerSimHooks() {
    ;(window as unknown as { __aviationSim?: { setFace: (state: 'ok' | 'far' | 'multi' | 'none') => void } }).__aviationSim = {
      setFace(state) {
        const states = {
          ok: { count: 1, xCenter: .5, yCenter: .5, width: .3, height: .4 },
          far: { count: 1, xCenter: .5, yCenter: .5, width: .05, height: .08 },
          multi: { count: 2 },
          none: { count: 0 },
        } as const
        simFace = states[state]
        onFaceEvent(simFace)
      },
    }
  }

  /** “等待就位”阶段共用慢节拍：稳定计时推进 + 过期判定（sim 模式重放合成信号） */
  function startReadinessTick() {
    clearTimers()
    setTimer(window.setInterval(() => {
      if (SIM_MODE) onFaceEvent(simFace)   // 模拟 ~5Hz 检测流，验证过期判定路径
      face.refresh()
    }, 200))
  }

  function onVisibilityChange() {
    if (document.hidden && phase.value === 'assess') captureController?.reportQuality(false, '页面切到后台')
  }
  // 终端不刷新页面连轴接待多位用户：监听挂在组件生命周期上，
  // finish() 只重置业务状态不移除监听，否则第二位用户起失去"切后台"检测。
  document.addEventListener('visibilitychange', onVisibilityChange)

  // ═══════════════ 素材准备 ═══════════════
  async function prepareAssets() {
    assetsReady.value = false; assetsError.value = ''
    assetProgress.loaded = 0; assetProgress.total = 0
    const debug = typeof window !== 'undefined'
      ? (window as unknown as { __assetsDebug?: Record<string, unknown> }).__assetsDebug ??= {}
      : undefined
    if (debug) debug.stage = 'pool'
    try {
      sessionBuild = await buildSessionPool()
      if (debug) debug.stage = 'preload'
      await preloadAssets(sessionBuild, audio, (loaded, total) => {
        assetProgress.loaded = loaded; assetProgress.total = total
      })
      if (debug) debug.stage = 'ready'
      assetsReady.value = true
    } catch (error) {
      if (debug) { debug.stage = 'error'; debug.error = String(error) }
      assetsError.value = error instanceof Error
        ? error.message.replace(/^audio_preload_failed:[\s\S]*$/, '语音素材加载失败，请重新加载')
        : '测评素材准备失败'
    }
  }

  // ═══════════════ 阶段推进（UI 调用；非法调用被 FlowController 拒绝） ═══════════════

  function enter(identityValue: UserIdentity) {
    identity.value = identityValue
    flow.dispatch({ type: 'IDENTITY_SUBMITTED' })
    void prepareAssets()
  }

  async function confirmConsent() {
    if (!assetsReady.value) return
    if (!flow.dispatch({ type: 'CONSENT_CONFIRMED' })) return
    face.resetForPositionCheck()
    syncFaceRefs()
    await nextTick()
    void syncPreview()
    if (SIM_MODE) {
      face.setCamera(true)
      onFaceEvent({ count: 1, xCenter: .5, yCenter: .5, width: .3, height: .4 })
      startReadinessTick()
      return
    }
    if (native.available.value) {
      const anchor = document.querySelector<HTMLElement>('[data-native-preview-anchor="detect"]')
      const ok = await native.startPreview(anchor)
      face.setCamera(ok, ok ? undefined : 'cameraFailed')
      syncFaceRefs()
      if (ok) startReadinessTick()
    } else {
      try {
        const analysis = document.querySelector<HTMLVideoElement>('#analysis-video')
        await browser.start([analysis])
        if (analysis) await browserFace.start(analysis)
        face.setCamera(true)
      } catch {
        face.setCamera(false, 'cameraDenied')
        syncFaceRefs()
        failure.value = '无法使用摄像头，请允许权限后重试'
        flow.dispatch({ type: 'FINISHED' })   // consent → login：回登录页可重试
        return
      }
      syncFaceRefs()
      startReadinessTick()
    }
  }

  /** 就位通过 → 预训练；重测（采集失效后）时预训练已完成则直接开倒计时 */
  function begin() {
    if (!faceReady.value && !SIM_MODE) return
    audio.stopAll()
    if (practicePhase.value !== 'demo') { startCountdown(); return }
    if (!flow.dispatch({ type: 'BEGIN_PRACTICE' })) return
    startPractice()
  }

  function startPractice() {
    practiceScheduler = new QuestionScheduler(sessionBuild?.practice ?? [], {
      mode: 'practice',
      requiredMs: Number.POSITIVE_INFINITY, tailFromMs: 0, closingFromMs: 0,
      selectFeedbackMs: AVIATION_CONFIG.selectFeedbackMs, skipFeedbackMs: AVIATION_CONFIG.skipFeedbackMs,
      tailPoolSize: 0,
    })
    practicePhase.value = 'demo'
    practiceStartedAt = performance.now()
    lastPlayedInstance.practice = 0
    practiceScheduler.start(0)
    practiceCard.value = { ...practiceScheduler.card }
    playCurrentQuestionAudio('practice')
    startReadinessTick()
    setTimer(window.setInterval(() => {
      if (!practiceScheduler || phase.value !== 'practice' || practicePhase.value !== 'demo') return
      practiceScheduler.update(performance.now() - practiceStartedAt)
      practiceCard.value = { ...practiceScheduler.card }
      if (practiceScheduler.finished) {
        practicePhase.value = 'complete'
        audio.playCue('practice-complete')
        return
      }
      playCurrentQuestionAudio('practice')
    }, TICK_MS))
  }

  function selectPractice(optionId: string) {
    const current = practiceCard.value
    if (current.kind !== 'question') return
    audio.stopQuestionAudio()
    if (practiceScheduler?.select(current.instance.instanceId, optionId, performance.now() - practiceStartedAt)) {
      practiceCard.value = { ...practiceScheduler.card }
    }
  }

  /** 主动跳过整段预训练（不凭未确认身份认定“老用户”）；完成后仍需手动开始正式采集 */
  function skipPractice() {
    if (phase.value !== 'practice' || practicePhase.value !== 'demo') return
    audio.stopAll()
    practiceScheduler = null
    practiceCard.value = { kind: 'none' }
    practicePhase.value = 'skipped'
    audio.playCue('practice-skipped')
    startReadinessTick()   // 保持就位检查节拍（开始正式采集的门槛）
  }

  function startCountdown() {
    if (phase.value !== 'practice' && phase.value !== 'detect') return
    if (!assetsReady.value) return
    if (practicePhase.value !== 'complete' && practicePhase.value !== 'skipped') return
    audio.stopAll()
    native.stopPromptAudio()
    if (!faceReady.value && !SIM_MODE) return      // 就位失效则不进入正式采集
    if (!flow.dispatch({ type: 'START_COUNTDOWN' })) return
    clearTimers()
    countdownSec.value = AVIATION_CONFIG.countdownSeconds
    // 3/2/1 只保留视觉动效：数字语音已按要求移除，倒计时期间静默。
    setTimer(window.setInterval(() => {
      // 3 → 2 → 1 后直接进入采集，UI 不进入 0 状态。
      if (countdownSec.value <= 1) {
        clearTimers()
        // 倒计时开始前已完成就位校验。此处不因原生预览换位或检测流短暂刷新
        // 再次退回就位页，否则用户会在 3/2/1 后无法进入正式测评。
        // 正式采集开始后的连续质量门禁仍由 CaptureController 负责。
        void startCapture()
        return
      }
      countdownSec.value -= 1
    }, 1_000))
  }

  // ═══════════════ 正式采集 ═══════════════
  async function startCapture() {
    // 1. 录制器真实启动成功是零点前提（模拟模式跳过录制桥，状态机照常运转）
    if (SIM_MODE) {
      // no-op
    } else if (native.available.value) {
      const result = await startNativeRecordingWithRecovery()
      if (!result.ok) return fail('RECORD_START_FAILED', `录制启动失败：${result.error || '未知原因'}`)
    } else if (!browser.startRecording()) {
      return fail('RECORD_START_FAILED', '浏览器录制启动失败，请重新开始')
    }

    // 2. 采集控制器（唯一时长/终止判定来源）+ 正式调度器
    captureSummary = null
    sealedVideo = null
    captureController = new CaptureController({
      requiredMs: AVIATION_CONFIG.requiredMs,
      detectionDebounceMs: P.detectionDebounceMs,
      protocolVersion: P.version,
      onSealed: handleCaptureSealed,
      onInvalid: handleCaptureInvalid,
    })
    formalScheduler = new QuestionScheduler(sessionBuild?.formal ?? [], {
      requiredMs: AVIATION_CONFIG.requiredMs,
      tailFromMs: AVIATION_CONFIG.tailFromMs,
      closingFromMs: AVIATION_CONFIG.closingFromMs,
      selectFeedbackMs: AVIATION_CONFIG.selectFeedbackMs,
      skipFeedbackMs: AVIATION_CONFIG.skipFeedbackMs,
      tailPoolSize: AVIATION_CONFIG.tailPoolSize,
    })
    submission.begin()                       // 幂等令牌：本次测评的全部提交/重试共用
    sustainedAlerted = false
    finalReminderAnnounced = false
    audio.resetPositionReminder()
    interrupting.value = false; interruptReason.value = ''
    if (!flow.dispatch({ type: 'COUNTDOWN_FINISHED' })) {
      teardownCapture()
      return
    }
    // 倒计时结束后唯一的语音：正式采集开始提示（随真实阶段切换同步播放，
    // 经协调器代际守卫，倒计时中断/重复进入不会出现延迟旧语音）
    audio.playCue('start')
    // 3. 零点 = 录制实际启动完成；tick 只驱动判定，时长按单调时钟差计算
    captureController.start()
    formalScheduler.start(0)
    lastPlayedInstance.formal = 0
    card.value = { ...formalScheduler.card }
    // 短开始提示音结束后由协调器立即接续首题，避免互相打断。
    playCurrentQuestionAudio('formal')
    clearTimers()
    setTimer(window.setInterval(captureTick, TICK_MS))
  }

  function captureTick() {
    const controller = captureController
    if (!controller || phase.value !== 'assess') return
    // 检测信号过期（页面后台/检测器停止）：按中断计，不冒充有效
    if (!SIM_MODE) {
      face.tickStale()
      if (!face.snapshot.detectionFresh) controller.reportQuality(false, '检测信号中断')
    }
    controller.tick()
    const active = controller.activeInterruption
    // UI 防抖：仅 ≥150ms 的持续不合格显示横幅；有效性判定完全由控制器决定
    interrupting.value = active !== null && active.durationMs >= 150
    interruptReason.value = active ? '检测到面部偏离，请回到画面中央' : ''
    if (active && !sustainedAlerted && controller.elapsedMs - active.startMs >= P.sustainedAlertMs) {
      sustainedAlerted = true
      const key: 'far' | 'near' | 'deviation' =
        active.reason.includes('靠近') ? 'far' : active.reason.includes('后坐') ? 'near' : 'deviation'
      audio.playPositionReminder(key)
    }
    if (controller.state !== 'recording') return    // sealed/invalid 已由回调接管
    captureElapsedMs.value = controller.elapsedMs
    captureRemainingSec.value = Math.max(0, Math.ceil((AVIATION_CONFIG.requiredMs - controller.elapsedMs) / 1000))
    if (!finalReminderAnnounced && captureRemainingSec.value > 0 && captureRemainingSec.value <= 5 && audio.playCue('finishing')) {
      finalReminderAnnounced = true
      // 预加载语音只播一次；位置提醒优先，不依赖设备系统 TTS。
    }
    formalScheduler?.update(controller.elapsedMs)
    card.value = formalScheduler ? { ...formalScheduler.card } : { kind: 'none' }
    playCurrentQuestionAudio('formal')
  }

  /** 新题实例出现时播题（协调器自带“当前实例”校验与恢复保护） */
  function playCurrentQuestionAudio(which: 'practice' | 'formal') {
    const scheduler = which === 'practice' ? practiceScheduler : formalScheduler
    const current = scheduler?.card
    if (!current || current.kind === 'none') return
    const instance = current.kind === 'question' || current.kind === 'feedback' ? current.instance : null
    if (!instance) return
    if (lastPlayedInstance[which] === instance.instanceId) return
    lastPlayedInstance[which] = instance.instanceId
    audio.playQuestion(instance)
  }

  /** 当前实例 id（协调器校验恢复目标是否仍有效） */
  function currentInstanceId(): number | null {
    const current = phase.value === 'assess' ? card.value
      : phase.value === 'practice' && practicePhase.value === 'demo' ? practiceCard.value : null
    if (!current || (current.kind !== 'question' && current.kind !== 'feedback')) return null
    return current.instance.instanceId
  }

  /** 用户选择（组件事件来自具体题目实例；旧实例/反馈期点击被调度器拒绝） */
  function select(optionId: string) {
    const current = card.value
    if (current.kind !== 'question' || !captureController || phase.value !== 'assess') return
    audio.stopQuestionAudio()
    if (formalScheduler?.select(current.instance.instanceId, optionId, captureController.elapsedMs)) {
      card.value = { ...formalScheduler.card }
    }
  }

  /** 暂时跳过（固定操作；跳过/未完成/已选择分别记录） */
  function skip() {
    const current = card.value
    if (current.kind !== 'question' || !captureController || phase.value !== 'assess') return
    audio.stopQuestionAudio()
    if (formalScheduler?.skip(current.instance.instanceId, captureController.elapsedMs)) {
      card.value = { ...formalScheduler.card }
    }
  }

  // ═══════════════ 采集结束（唯一来源 = CaptureController 回调） ═══════════════
  function handleCaptureSealed(summary: CaptureSummary) {
    captureSummary = summary
    formalScheduler?.finalize(summary.elapsedMs)
    card.value = formalScheduler ? { ...formalScheduler.card } : { kind: 'none' }
    audio.stopAll()
    clearTimers()
    if (!flow.dispatch({ type: 'CAPTURE_SEALED' })) return
    void sealRecording().then(videoOk => {
      if (!videoOk) return
      if (!flow.dispatch({ type: 'VIDEO_SEALED' })) return
      audio.playCue('complete')
      // 短暂"采集完成"反馈后直接进入真实提交（状态由服务端确认驱动，无固定等待）
      setTimer(window.setTimeout(() => {
        if (flow.dispatch({ type: 'UPLOAD_START' })) void beginUpload()
      }, AVIATION_CONFIG.capturedNoticeMs))
    })
  }

  function handleCaptureInvalid(reason: string) {
    formalScheduler?.finalize(captureController?.elapsedMs ?? 0)
    card.value = { kind: 'none' }
    clearTimers()
    // 本轮无效：停止并丢弃视频（不提交）；引导重新就位，由用户主动重开
    void discardRecording()
    if (!flow.dispatch({ type: 'CAPTURE_INVALIDATED' })) return
    failure.value = reason
    audio.stopAll()
    // 失效说明必须完整播放（critical：后续 stopAll 不打断，仅整场 dispose 终止）
    audio.playInvalidExplanation()
  }

  async function sealRecording(): Promise<boolean> {
    try {
      if (SIM_MODE) return true
      if (native.available.value) {
        const recording = await native.stopRecording()
        if (!recording.ok) throw new Error(recording.error || '原生视频封装失败')
        // 录制封存后必须立即停止原生语音并释放预览：不能让已排队的偏离提醒
        // 继续播到采集完成页或查询码页，也不保留后台人脸检测。
        native.stopPromptAudio()
        await native.releasePreviewForUpload()
        // 已封存即撤去原生悬浮预览，完成/提交页不再保留人脸框。
        native.hide()
      } else {
        const video = await browser.stopRecording()
        if (!video) throw new Error('录制时长不足或视频无效')
        sealedVideo = video
      }
      return true
    } catch (error) {
      fail('SEAL_FAILED', error instanceof Error ? error.message : '录制结束失败')
      return false
    }
  }

  async function discardRecording(): Promise<void> {
    try {
      if (SIM_MODE) return
      if (native.available.value) await native.stopRecording()   // 文件保留在设备待覆盖，绝不上传
      else await browser.stopRecording()
    } catch { /* 丢弃路径的失败不影响重新就位 */ }
    sealedVideo = null
  }

  /** 采集失效后重开：保留预训练完成状态（practicePhase 不重置） */
  function restartAfterInvalid() {
    if (phase.value !== 'capture_invalid') return
    teardownCapture()
    failure.value = ''
    flow.dispatch({ type: 'RESTART_AFTER_INVALID' })
    face.resetForPositionCheck()
    syncFaceRefs()
    startReadinessTick()
    void nextTick(() => void syncPreview())
  }

  function teardownCapture() {
    clearTimers()
    captureController?.dispose()
    captureController = null
    formalScheduler = null
    card.value = { kind: 'none' }
    captureElapsedMs.value = 0
    captureRemainingSec.value = Math.ceil(AVIATION_CONFIG.requiredMs / 1000)
    interrupting.value = false; interruptReason.value = ''
    audio.stopAll()
  }

  // ═══════════════ 提交 ═══════════════
  async function beginUpload() {
    if (SIM_MODE) {
      // 模拟模式走真实状态机路径但不触达网络/提交（不产生查询码）
      if (flow.dispatch({ type: 'UPLOAD_SUCCEEDED' })) void 0
      completeCountdown.value = AVIATION_CONFIG.completeTimeoutSec
      startCompleteTimer()
      return
    }
    await uploadCurrent()
  }

  function buildPayload(): SubmitPayload | null {
    const summary = captureSummary
    if (!summary || !identity.value) return null
    // 全量作答记录：selected / skipped / unanswered 分列（不自动代选、不冒充已答）
    const selections: SubmitSelection[] = (formalScheduler?.results ?? []).map(record => ({
      question_id: record.questionId,
      picked: record.optionId === null ? [] : [record.optionId],
      answered_ms: record.outcome === 'selected' ? Math.max(0, record.atMs) : 0,
      outcome: record.outcome,
      role: record.role,
    }))
    return {
      name: identity.value.name,
      id_card: '',
      subject_id: identity.value.employee_no,
      gender: identity.value.gender,
      age: identity.value.age,
      selections,
      duration_seconds: Math.max(1, Math.round(summary.elapsedMs / 1000)),
      // 严格零中断：effectiveContinuousMs 即可证明的连续有效时长
      effective_duration_seconds: Math.round(summary.effectiveContinuousMs / 1000),
      paused_count: 0,
      client_token: submission.token ?? '',
      protocol_version: summary.protocolVersion,
      question_protocol_version: QUESTION_PROTOCOL_VERSION,
      content_version: sessionBuild?.contentVersion,
      interruptions: summary.interruptions,
      interrupted_ms: Math.round(summary.interruptedMs),
      scheduling_notes: [...(sessionBuild?.notes ?? []), ...(formalScheduler?.notes ?? [])],
      consent_version: CONSENT_VERSION,
    }
  }

  async function uploadCurrent() {
    const payload = buildPayload()
    if (!payload) return fail('UPLOAD_FAILED', '没有可提交的测评数据，请重新测评')
    const outcome = await submission.submit(payload, sealedVideo)
    if (outcome.status === 'succeeded' && outcome.assessmentId) {
      // 每次测评的固定编号取自服务端 UUID 前八位，终端和管理端共用。
      reportId.value = outcome.assessmentId.replace(/-/g, '').slice(0, 8).toUpperCase()
      flow.dispatch({ type: 'UPLOAD_SUCCEEDED' })
      completeCountdown.value = AVIATION_CONFIG.completeTimeoutSec
      startCompleteTimer()
      return
    }
    if (outcome.status === 'succeeded') {
      canRetrySubmit.value = true
      failure.value = '提交确认未返回报告编号，请重新提交或联系现场工作人员。'
      flow.dispatch({ type: 'UPLOAD_FAILED', retryable: true })
      return
    }
    if (outcome.status === 'qa_rejected') {
      failure.value = outcome.message
      teardownCapture()
      sealedVideo = null
      flow.dispatch({ type: 'VIDEO_QA_REJECTED' })
      return
    }
    // failed（视频仍在，可重试原视频）/ video_invalid（录像无效，需重新测评）
    canRetrySubmit.value = outcome.status === 'failed'
    failure.value = outcome.message
    flow.dispatch({ type: 'UPLOAD_FAILED', retryable: outcome.status === 'failed' })
  }

  async function retrySubmit() {
    if (phase.value !== 'submit_failed' || !canRetrySubmit.value) return
    if (!flow.dispatch({ type: 'RETRY_SUBMIT' })) return
    await uploadCurrent()
  }

  async function restartAfterQuality() {
    if (phase.value !== 'quality_restart') return
    teardownCapture()
    failure.value = ''
    submission.reset()
    flow.dispatch({ type: 'RESTART_AFTER_QA' })
    face.resetForPositionCheck()
    syncFaceRefs()
    startReadinessTick()
    await nextTick(); void syncPreview()
  }

  function startCompleteTimer() {
    clearTimers()
    setTimer(window.setInterval(() => {
      completeCountdown.value -= 1
      if (completeCountdown.value <= 0) finish()
    }, 1_000))
  }
  function resetCompleteCountdown() {
    if (phase.value === 'complete') completeCountdown.value = AVIATION_CONFIG.completeTimeoutSec
  }

  /** 采集/封存/提交硬失败：按事件类型走状态机，呈现真实状态 */
  function fail(event: 'RECORD_START_FAILED' | 'SEAL_FAILED' | 'UPLOAD_FAILED', message: string) {
    canRetrySubmit.value = false
    failure.value = message
    teardownCapture()
    if (event === 'UPLOAD_FAILED') flow.dispatch({ type: event, retryable: false })
    else flow.dispatch({ type: event })
  }

  // ═══════════════ 完成退出 / 清理 ═══════════════
  function finish() {
    clearTimers()
    captureController?.dispose()
    captureController = null
    formalScheduler = null
    practiceScheduler = null
    card.value = { kind: 'none' }
    practiceCard.value = { kind: 'none' }
    practicePhase.value = 'demo'
    audio.dispose()
    audio = makeAudio()               // 下一场重新预加载/播放
    face.resetAll()
    syncFaceRefs()
    try { native.stopPromptAudio(); native.stopPreview() } catch { /* no-op */ }
    browserFace.stop()
    browser.stop()
    // 清空终端身份与答题状态；不删除任何服务端历史视频/记录/数据
    identity.value = null
    failure.value = ''
    submission.reset()
    sealedVideo = null
    reportId.value = null
    sessionBuild = null
    assetsReady.value = false
    assetsError.value = ''
    flow.reset()
    phase.value = 'login'
  }

  async function startNativeRecordingWithRecovery() {
    const first = await native.startRecording()
    if (first.ok) return first
    // RK3568 偶发在“预览 → 预览+编码”切换时丢失会话；与人脸位置无关。
    native.stopPreview()
    await new Promise(resolve => setTimer(window.setTimeout(resolve, 350)))
    const anchor = document.querySelector<HTMLElement>('[data-native-preview-anchor="monitor"]')
    const previewReady = await native.startPreview(anchor)
    if (!previewReady) return first
    await new Promise(resolve => setTimer(window.setTimeout(resolve, 250)))
    return native.startRecording()
  }

  async function syncPreview() {
    if (SIM_MODE) return
    const kind = phase.value === 'detect' ? 'detect' : 'monitor'
    if (native.available.value) {
      await native.place(document.querySelector(`[data-native-preview-anchor="${kind}"]`))
    }
  }

  // 每次阶段切换都会重建对应的 Vue 组件和锚点。原生预览是 WebView 上方的独立视图，
  // 必须在新 DOM 挂载后重新定位，否则会沿用“人脸就位页”的大框并遮挡练习/正式题目。
  watch(phase, current => {
    if (!['detect', 'practice', 'countdown', 'assess'].includes(current)) return
    void nextTick(() => void syncPreview())
  })

  // 浏览器路径视频源动态绑定（阶段切换后组件重新挂载时接上流）
  provide(CAMERA_SINK_KEY, { attach: browser.attach, detach: browser.detach } satisfies CameraSink)

  onBeforeUnmount(finish)
  // finish() 不再移除 visibilitychange（连轴接待时第二位用户起仍需后台检测），
  // 真正的解绑只在组件卸载时做一次。
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibilityChange))

  return {
    // 状态
    phase, identity, failure, canRetrySubmit, simMode: SIM_MODE,
    assetsReady, assetsError, assetProgress,
    readiness, faceNotice, faceReady,
    practicePhase, practiceCard,
    practiceIndex: computed(() => {
      const current = practiceCard.value
      return current.kind === 'question' || current.kind === 'feedback'
        ? current.instance.instanceId : AVIATION_CONFIG.practiceCount
    }),
    countdownSec,
    card, captureElapsedMs, captureRemainingSec, interrupting, interruptReason,
    completeCountdown, reportId, subjectNo: computed(() => identity.value?.employee_no ?? ''), native,
    // 动作
    enter, prepareAssets, confirmConsent, begin,
    selectPractice, skipPractice, startCountdown,
    select, skip,
    retrySubmit, restartAfterInvalid, restartAfterQuality,
    finish, resetCompleteCountdown,
  }
}
