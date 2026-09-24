import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { COMMUNITY_QUESTION_CONFIG, COMMUNITY_STAGE_MS, PRACTICE_IMAGE_PATHS, PRACTICE_QUESTIONS } from '@/config/community/content'
import { useAndroidCamera } from '@/composables/useAndroidCamera'
import { useBrowserCamera } from '@/composables/useBrowserCamera'
import { useBrowserFaceDetection } from '@/composables/useBrowserFaceDetection'
import { useCommunityAudio } from '@/composables/useCommunityAudio'
import { CaptureController, type CaptureSummary } from '@/capture/CaptureController'
import { STRICT_CONTINUOUS_V2 } from '@/capture/protocol'
import { classifySubmitError, formatSessionCode } from '@/community/flowSteps'
import { QuestionScheduler } from '@/aviation/QuestionScheduler'
import type { SchedulerCard, SessionQuestion } from '@/aviation/types'
import type { CommunityPhase } from '@/types/community'
import { fetchWithTimeout, UPLOAD_TIMEOUT_MS } from '@/utils/net'
import { SCENE_SWITCHER_ENABLED } from '@/config/sceneSwitcher'

/**
 * 社区体验 v6 状态机（测评内核与航空完全一致）：
 *
 *   welcome → brief(测评与隐私说明·合并页) → payment_mock(体验确认)
 *   → consent(知情同意 ⇄ assets_loading 素材准备) → opening(10 秒开场·可跳过)
 *   → face_ready(就位检查·三检查点 + 确认) → practice(3 道预训练·可跳过)
 *   → countdown(3 秒倒计时) → capturing(60 秒有效采集·自定节奏)
 *   → closing(整理本次体验·真实状态驱动) → report_processing(报告生成中·可离开)
 *   → complete(完成·扫码 + 报告编号) → welcome
 *
 * 与航空同构的测评内核：
 * - 就位：三项检查全部通过且稳定 readyStableMs 后才出现「开始操作体验」；
 * - 预训练：3 道、不录像不上传、可跳过；完成后由用户点「开始正式测评」；
 * - 倒计时：3 秒（只显示 3/2/1，无语音），不计入正式采集；
 * - 正式采集：复用航空 CaptureController（strict-continuous-v2）与
 *   QuestionScheduler（200ms 反馈切题、≤4s 不出新题、题不重复、题库耗尽进收尾页）
 *   作为唯一判定来源；持续偏离 ≥3s 才判本轮无效 → 重采（不重复支付）；
 * - 偏离语音：偏离持续 ≥ sustainedAlertMs 播一次“请将面部回到画面中央”，回正后重置；
 * - 收尾提示：剩余 ≤5s 语音+页面柔和提示一次；题池 ≥12 道，不足明确报素材不足。
 *
 * 恢复语义（不重复支付、不丢会话）：
 * - 一切失败态的“结束”回到 welcome，不新建支付会话；
 * - 摄像头/质量失败“重试”复用同一会话重新就位；
 * - 提交带 client_token 幂等；服务端“已提交过”判定为成功（假失败恢复）；
 * - 上传失败页展示会话短码，支持原视频重新提交。
 */

export type PayStatus = 'creating' | 'waiting' | 'paid' | 'expired' | 'error'

/** 偏离提示的显示阈值（ms，对齐航空：短暂抖动不打扰用户） */
const INTERRUPT_HINT_MS = 150
/** 判定/展示刷新节拍（对齐航空 TICK_MS） */
const TICK_MS = 100

/** 社区会话题池（SessionQuestion 形态，供调度器与展示共用） */
type CommunityPool = SessionQuestion[]

export function useCommunityFlow(deviceId: string, questionCount: number = COMMUNITY_QUESTION_CONFIG.poolRequestCount) {
  const phase = ref<CommunityPhase>('welcome')

  // ---- 体验确认（支付占位） ----
  const payStatus = ref<PayStatus>('creating')
  const payError = ref('')
  const payMock = ref(false)
  const payMockBusy = ref(false)
  const sessionId = ref('')
  const amountFen = ref(400)
  const payExpiresAt = ref<string | null>(null)
  const payCountdown = ref('')
  const payQrUrl = ref('')

  // ---- 素材 / 题目 ----
  const questions = ref<CommunityPool>([])
  const assetsReady = ref(false)
  const assetsError = ref('')
  const assetsProgress = ref(0)
  const progress = ref(0)

  // ---- 就位检查（三检查点，对齐航空 FaceCheck） ----
  const readyCameraOn = ref(false)
  const readySingleFace = ref(false)
  const readyPositionOk = ref(false)
  /** 三项通过且稳定保持 readyStableMs 后为 true（决定「开始操作体验」是否出现） */
  const ready = ref(false)

  // ---- 倒计时（对齐航空 3 秒） ----
  const countdownSec = ref(Math.ceil(COMMUNITY_STAGE_MS.countdown / 1000))

  // ---- 正式采集（与航空同一套协议 + 同一个调度器） ----
  const card = ref<SchedulerCard>({ kind: 'none' })
  const captureElapsedMs = ref(0)
  const captureRemainingSec = ref(Math.ceil(STRICT_CONTINUOUS_V2.requiredMs / 1000))
  const interrupting = ref(false)
  const interruptReason = ref('')
  /** 剩余 ≤5s 的收尾提示（不遮挡题目/选项/摄像头） */
  const finalHint = ref(false)

  // ---- 人脸（监视框展示用） ----
  const faceReady = ref(false)
  const faceState = ref<'ok' | 'warning' | 'error'>('warning')
  const faceMessage = ref('正在开启摄像头…')
  const cameraMessage = computed(() => faceMessage.value)

  // ---- closing / 报告 ----
  const closingStep = ref(0)
  const uploading = ref(false)
  const closingError = ref<string | null>(null)
  const failure = ref('')
  const reportReady = ref(false)

  const native = useAndroidCamera()
  const browser = useBrowserCamera()
  const browserFace = useBrowserFaceDetection(handleFace)
  const communityAudio = useCommunityAudio()

  const total = computed(() => questions.value.length || questionCount)
  /** 当前第几题：直接取调度器实例的展示序号（instanceId 从 1 递增，随 card 响应式更新） */
  const presentedCount = computed(() => {
    const current = card.value
    return current.kind === 'question' || current.kind === 'feedback' ? current.instance.instanceId : 0
  })
  const sessionCode = computed(() => sessionId.value ? formatSessionCode(sessionId.value) : '')
  const elapsedSec = computed(() => Math.min(Math.round(captureElapsedMs.value / 1000), Math.round(STRICT_CONTINUOUS_V2.requiredMs / 1000)))
  const readyChecklist = computed(() => [
    { label: '摄像头已开启', pass: readyCameraOn.value },
    { label: '单人面部已确认', pass: readySingleFace.value },
    { label: '位置与大小符合要求', pass: readyPositionOk.value },
  ])

  let stageTimer: number | null = null
  let countdownTimer: number | null = null
  let payTimer: number | null = null
  let reportTimer: number | null = null
  let submitFailTimer: number | null = null
  let captureController: CaptureController | null = null
  let scheduler: QuestionScheduler | null = null
  let sealedElapsedMs = 0
  /** 封存/失效时点的采集时长（stopCaptureClock 置空 controller 前记录，供 finalize 补记 unanswered） */
  let lastCaptureElapsedMs = 0
  let lastSubmissionId: string | null = null
  let pendingBrowserVideo: Blob | null = null
  let clientToken = ''
  let faceValidSince: number | null = null
  let faceInvalidSince: number | null = null
  /** 最近一次人脸事件时刻；超过 staleDetectionMs 无事件 = 检测信号中断（对齐航空） */
  let lastFaceEventAt = 0
  /** 偏离语音每段只播一次（对齐航空 sustainedAlert） */
  let sustainedAlerted = false
  /** 收尾语音+提示只触发一次 */
  let finalHintDone = false
  let lastPlayedInstance = 0
  /** 采集结束后在后台开始的提交（Promise<true|错误串>） */
  let backgroundUpload: Promise<true | string> | null = null
  /** 联调构建的人脸模拟开关；生产构建中入口与逻辑均不可达。 */
  let testFaceSimulation = false

  function makeClientToken(): string {
    try { return crypto.randomUUID() } catch {
      return `ck-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }
  }

  // ---- 耗时记录（仅 DEV console） ----
  const stageTimings = new Map<string, number>()
  let lastStageName = ''
  let flowStartWall = 0
  function markStage(name: string) {
    const now = Date.now()
    if (!flowStartWall) flowStartWall = now
    if (import.meta.env.DEV && lastStageName) {
      const prevT = stageTimings.get(lastStageName) || now
      console.info(`[community] ${lastStageName} → ${name} (+${((now - prevT) / 1000).toFixed(1)}s)`)
    }
    stageTimings.set(name, now)
    lastStageName = name
  }
  function logTotal() {
    if (!import.meta.env.DEV || !flowStartWall) return
    const totalMs = (Date.now() - flowStartWall) / 1000
    console.info(`[community] 总耗时: ${totalMs.toFixed(0)}s (${(totalMs / 60).toFixed(1)}min)`)
  }

  // ---- 正式采集协议：CaptureController + QuestionScheduler 为唯一判定来源（与航空共用） ----
  function stopCaptureClock() {
    if (stageTimer != null) { window.clearInterval(stageTimer); stageTimer = null }
    captureController?.dispose()
    captureController = null
    interrupting.value = false; interruptReason.value = ''
  }

  function tickCapture() {
    const controller = captureController
    if (!controller || phase.value !== 'capturing') return
    if (testFaceSimulation) {
      lastFaceEventAt = performance.now()
      controller.reportQuality(true)
    }
    // 检测信号过期（检测器停转/页面后台）：按不合格计，不冒充有效（对齐航空）
    if (lastFaceEventAt && performance.now() - lastFaceEventAt > STRICT_CONTINUOUS_V2.staleDetectionMs) {
      controller.reportQuality(false, '检测信号中断')
    }
    controller.tick()
    const active = controller.activeInterruption
    interrupting.value = active !== null && active.durationMs >= INTERRUPT_HINT_MS
    interruptReason.value = active ? '检测到面部偏离，请回到画面中央' : ''
    // 偏离持续超过阈值 → 语音提醒一次（回正后重置，可再次提醒）
    if (active && !sustainedAlerted && controller.elapsedMs - active.startMs >= STRICT_CONTINUOUS_V2.sustainedAlertMs) {
      sustainedAlerted = true
      speak('请将面部回到画面中央')
    }
    if (controller.state !== 'recording') return   // sealed/invalid 已由回调接管
    captureElapsedMs.value = controller.elapsedMs
    captureRemainingSec.value = Math.max(0, Math.ceil((STRICT_CONTINUOUS_V2.requiredMs - controller.elapsedMs) / 1000))
    progress.value = Math.min(100, controller.elapsedMs / STRICT_CONTINUOUS_V2.requiredMs * 100)
    // 剩余 ≤5s 且仍在答题：柔和收尾提示 + 语音一次（不遮挡题目/选项/摄像头）
    if (!finalHintDone && captureRemainingSec.value > 0 && captureRemainingSec.value <= COMMUNITY_QUESTION_CONFIG.finalHintSec) {
      finalHintDone = true
      finalHint.value = true
      speak('本次采集即将完成，请完成当前选择即可')
    }
    // 自定节奏切题由采集时钟驱动（200ms 反馈期结束才切，≤4s 不出新题）
    scheduler?.update(controller.elapsedMs)
    card.value = scheduler ? { ...scheduler.card } : { kind: 'none' }
    playCurrentQuestionAudio()
  }

  /** 页面切到后台等同采集条件不满足（与航空一致） */
  function onVisibilityChange() {
    if (document.hidden && phase.value === 'capturing') captureController?.reportQuality(false, '页面切到后台')
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  // ---- 人脸：三检查点事实 + 采集质量上报 ----
  function setInvalidFace(message: string) {
    const now = performance.now(); faceValidSince = null; if (!faceInvalidSince) faceInvalidSince = now
    faceReady.value = false; ready.value = false
    faceState.value = now - faceInvalidSince >= 3000 ? 'error' : 'warning'
    faceMessage.value = message; native.setGuideState(faceState.value)
    if (phase.value === 'capturing') captureController?.reportQuality(false, message)
  }

  function setValidFace() {
    const now = performance.now(); faceInvalidSince = null; if (!faceValidSince) faceValidSince = now
    const stable = now - faceValidSince >= STRICT_CONTINUOUS_V2.readyStableMs
    faceState.value = 'ok'
    faceMessage.value = phase.value === 'face_ready'
      ? (stable ? '位置合适，请保持' : '就快好了，请保持这个位置')
      : (stable ? '位置合适' : '位置合适，请保持')
    faceReady.value = stable
    ready.value = stable
    native.setGuideState(stable ? 'ok' : 'warning')
    if (phase.value === 'capturing') {
      sustainedAlerted = false   // 回正后重置偏离语音（下次偏离可再提醒一次）
      captureController?.reportQuality(true)
    }
  }

  function handleFace(result: { count?: number; xCenter?: number; yCenter?: number; width?: number; height?: number; error?: string } | null) {
    if (testFaceSimulation) return
    if (!result) return
    lastFaceEventAt = performance.now()
    if (result.error || !result.count) {
      readySingleFace.value = false; readyPositionOk.value = false
      return setInvalidFace(result.error ? '人脸识别遇到一点问题，请保持坐好' : '没有看到面部，请回到画面框内')
    }
    if (result.count > 1) {
      readySingleFace.value = false; readyPositionOk.value = false
      return setInvalidFace('画面里好像不止一个人，请单独体验')
    }
    readySingleFace.value = true
    const w = result.width || 0, h = result.height || 0, x = result.xCenter || 0, y = result.yCenter || 0
    if (w < .11) { readyPositionOk.value = false; setInvalidFace('离屏幕稍微有点远，向前坐一点') }
    else if (w > .72 || h > .88) { readyPositionOk.value = false; setInvalidFace('离屏幕稍微有点近，向后坐一点') }
    else if (x < .20 || x > .80 || y < .15 || y > .82) { readyPositionOk.value = false; setInvalidFace('请把面部轻轻移到画面中间') }
    else { readyPositionOk.value = true; setValidFace() }
  }
  watch(native.faceResult, handleFace)

  /** 仅供现场联调：绕过真人就位并持续提供合格采集信号。 */
  function simulateFaceReady() {
    if (!SCENE_SWITCHER_ENABLED || phase.value !== 'face_ready') return
    testFaceSimulation = true
    lastFaceEventAt = performance.now()
    faceValidSince = performance.now() - STRICT_CONTINUOUS_V2.readyStableMs
    readyCameraOn.value = true
    readySingleFace.value = true
    readyPositionOk.value = true
    setValidFace()
    faceMessage.value = '测试模式：已模拟人脸就位'
  }

  function clear(timer: number | null) { if (timer) window.clearInterval(timer) }
  function speak(text: string) { if (native.available.value) native.speakPrompt(text) }

  // ---- 体验确认（支付占位：一键确认；mock 后端自动走通，不碰真实微信） ----
  function stopPayPolling() { clear(payTimer); payTimer = null }
  function startPayCountdown() {
    clear(countdownTimer)
    const tick = () => {
      if (!payExpiresAt.value) { payCountdown.value = ''; return }
      const remaining = new Date(payExpiresAt.value).getTime() - Date.now()
      if (remaining <= 0) { payCountdown.value = ''; if (payStatus.value === 'waiting') payStatus.value = 'expired'; return }
      const m = Math.floor(remaining / 60_000), s = Math.floor((remaining % 60_000) / 1000)
      payCountdown.value = `${m}:${String(s).padStart(2, '0')}`
    }
    tick(); countdownTimer = window.setInterval(tick, 1000)
  }
  async function pollPayStatus() {
    if (!sessionId.value || payStatus.value !== 'waiting') return
    try {
      const r = await fetch(`/api/v1/community/session/${sessionId.value}/status`)
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error()
      if (body.status === 'expired') { payStatus.value = 'expired'; stopPayPolling(); return }
      if (body.paid) {
        payStatus.value = 'paid'; stopPayPolling(); clear(countdownTimer)
        // 确认成功过渡：先在终端明确反馈 2 秒（用户此时正从手机回看终端），再进入须知页。
        window.setTimeout(() => {
          if (payStatus.value !== 'paid') return
          phase.value = 'consent'; markStage('consent')
          void prepareAssets()
        }, 2000)
      }
    } catch { /* 继续轮询 */ }
  }
  async function createSession() {
    stopPayPolling(); clear(countdownTimer)
    sessionId.value = ''; payError.value = ''; payStatus.value = 'creating'
    try {
      const r = await fetch('/api/v1/community/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(body.detail || `会话创建失败（${r.status}）`)
      sessionId.value = String(body.session_id || '')
      clientToken = makeClientToken()   // 每次新会话一个幂等令牌；本会话内全部重试复用
      amountFen.value = Number(body.amount_fen) || 400
      payExpiresAt.value = body.expires_at ?? null
      payMock.value = Boolean(body.pay_params?._mock)
      payQrUrl.value = sessionId.value ? `${window.location.origin}/api/v1/community/mock-pay?session_id=${sessionId.value}` : ''
      payStatus.value = 'waiting'; startPayCountdown()
      payTimer = window.setInterval(() => void pollPayStatus(), 3000)
      void pollPayStatus()
    } catch (error) {
      payStatus.value = 'error'
      payError.value = error instanceof Error ? error.message : '会话创建失败'
    }
  }
  /** 一键确认：创建会话后，若后端为模拟模式则自动完成确认（不出现支付概念） */
  async function confirmExperience() {
    await createSession()
    if (payStatus.value === 'waiting' && payMock.value) await mockPayNow()
  }
  async function mockPayNow() {
    if (!sessionId.value || payMockBusy.value || payStatus.value !== 'waiting') return
    payMockBusy.value = true; payError.value = ''
    try {
      const authRes = await fetch('/api/v1/community/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: `mock-${sessionId.value.slice(0, 12)}` }) })
      const auth = await authRes.json().catch(() => ({}))
      if (!authRes.ok) throw new Error(auth.detail || '模拟登录失败')
      const payRes = await fetch('/api/v1/community/pay', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` }, body: JSON.stringify({ session_id: sessionId.value }) })
      const pay = await payRes.json().catch(() => ({}))
      if (!payRes.ok) throw new Error(pay.detail || '模拟下单失败')
      const hex = /mock_([0-9a-f]{32})/.exec(String(pay.package || ''))?.[1]
      if (!hex) throw new Error('支付参数缺少 Mock 订单号')
      const orderId = hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')
      const notifyRes = await fetch('/api/v1/community/pay/mock-notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }) })
      if (!notifyRes.ok) throw new Error('Mock 回调失败')
      await pollPayStatus()
    } catch (error) { payError.value = error instanceof Error ? error.message : '模拟支付失败' }
    finally { payMockBusy.value = false }
  }
  function restartPayment() { void createSession() }

  // ---- 题库（预加载门禁；正式池 ≥12 道，与预训练题不重复） ----
  const decodedImages = new Map<string, HTMLImageElement>()
  async function loadAndDecode(url: string, retries = 2): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const img = new Image()
        img.decoding = 'async'
        await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('load')); img.src = url })
        if (img.decode) await img.decode().catch(() => undefined)
        decodedImages.set(url, img)
        return true
      } catch { if (attempt < retries) await new Promise(r => window.setTimeout(r, 180 * (attempt + 1))) }
    }
    return false
  }
  async function preloadImages(items: CommunityPool): Promise<Set<string>> {
    const urls = [...new Set([...PRACTICE_QUESTIONS.map(q => q.image), ...items.map(q => q.image)])]
    const succeeded = new Set<string>(); let cursor = 0; let done = 0
    const worker = async () => { while (cursor < urls.length) { const url = urls[cursor++]; if (await loadAndDecode(url)) succeeded.add(url); done += 1; assetsProgress.value = done } }
    await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker))
    return succeeded
  }
  function warmPracticeAssets() { void Promise.all(PRACTICE_QUESTIONS.map(q => loadAndDecode(q.image))) }
  async function prepareAssets() {
    assetsReady.value = false; assetsError.value = ''; assetsProgress.value = 0
    try {
      const query = new URLSearchParams({ count: String(questionCount), scene: 'community', session_id: sessionId.value })
      // 排除预训练用过的图片，保证“正式题与预训练题不重复”
      query.set('exclude_images', PRACTICE_IMAGE_PATHS.map(p => p.split('/').pop()).filter(Boolean).join(','))
      const r = await fetch(`/api/v1/pairs/session?${query.toString()}`)
      if (!r.ok) throw new Error('题库请求失败')
      const body = await r.json()
      const pairs = Array.isArray(body.pairs) ? body.pairs.filter((i: { image_url?: string }) => i?.image_url) : []
      if (pairs.length < COMMUNITY_QUESTION_CONFIG.poolMinimum) {
        throw new Error(`正式题库不足（当前 ${pairs.length} 道，至少需要 ${COMMUNITY_QUESTION_CONFIG.poolMinimum} 道），请稍后再试或联系工作人员`)
      }
      const pairIds = new Set(pairs.map((pair: Record<string, unknown>) => String(pair.pair_id || '')))
      const imageIds = new Set(pairs.map((pair: Record<string, unknown>) => String(pair.image_id || '')))
      if (pairIds.size !== pairs.length || imageIds.size !== pairs.length) {
        throw new Error('社区题组存在重复题目或图片')
      }
      let prepared: CommunityPool = pairs.map((pair: Record<string, unknown>, i: number) => {
        const id = String(pair.pair_id || `community-${i}`)
        return {
          id, question: String(pair.question || ''), image: String(pair.image_url),
          imageAlt: `生活情境图片 ${i + 1}`,
          options: [{ id: `${id}a`, text: String(pair.option_a || '') }, { id: `${id}b`, text: String(pair.option_b || '') }],
          audioUrl: pair.audio_url ? String(pair.audio_url) : '',
          dimension: pair.dimension ? String(pair.dimension) : undefined,
          scenario: pair.scenario ? String(pair.scenario) : undefined,
        } satisfies SessionQuestion
      })
      if (prepared.some((q: SessionQuestion) => !q.question || !q.options[0].text || !q.options[1].text)) throw new Error('社区题库数据不完整')
      const loaded = await preloadImages(prepared)
      prepared = prepared.filter(q => loaded.has(q.image))
      if (prepared.length < COMMUNITY_QUESTION_CONFIG.poolMinimum) throw new Error(`测评图片加载不足（已准备 ${prepared.length} 道），请重新准备`)
      questions.value = prepared
      await communityAudio.preload(prepared)
      assetsReady.value = true
    } catch (error) { assetsError.value = error instanceof Error ? error.message : '社区题库准备失败' }
  }
  /** 素材就绪后的统一入口：在哪个阶段等待，就回到哪个阶段 */
  function proceedAfterAssets() {
    if (assetsError.value) { failure.value = assetsError.value; phase.value = 'assets_failed'; return }
    if (!assetsReady.value) { phase.value = 'assets_loading'; return }
    // 同意后先看社区开场短片（10 秒可跳过），短片结束进入就位检查（测评内核与航空同序）
    markStage('opening'); phase.value = 'opening'
  }
  watch(assetsReady, ready => { if (ready && phase.value === 'assets_loading') proceedAfterAssets() })
  watch(assetsError, err => { if (err && phase.value === 'assets_loading') proceedAfterAssets() })

  async function retryAssets() {
    failure.value = ''
    await prepareAssets()
    if (assetsReady.value) proceedAfterAssets()
    else { failure.value = assetsError.value; phase.value = 'assets_failed' }
  }

  // ---- 摄像头与就位检查 ----
  async function enterFaceReady() {
    markStage('face_ready')
    phase.value = 'face_ready'
    faceReady.value = false; ready.value = false
    readyCameraOn.value = false; readySingleFace.value = false; readyPositionOk.value = false
    faceState.value = 'warning'; faceMessage.value = '正在开启摄像头…'
    faceValidSince = null; faceInvalidSince = null; lastFaceEventAt = 0
    native.setGuideState('warning')
    await nextTick()
    const anchor = document.querySelector<HTMLElement>('[data-native-preview-anchor="detect"]')
    if (native.available.value) {
      const ok = await native.startPreview(anchor)
      if (!ok) return deviceError(`摄像头暂时打不开：${native.message.value}`)
    } else {
      try {
        const analysis = document.querySelector<HTMLVideoElement>('#analysis-video')
        await browser.start([document.querySelector('#detect-video'), document.querySelector('#monitor-video'), analysis])
        if (analysis) await browserFace.start(analysis)
      } catch (error) { return deviceError(error instanceof Error ? error.message : '无法使用摄像头') }
    }
    readyCameraOn.value = true
    faceMessage.value = '请让面部出现在框里'
  }

  /** 就位通过后用户确认 → 进入 3 道预训练 */
  function confirmReady() {
    if (phase.value !== 'face_ready' || !ready.value) return
    markStage('practice'); phase.value = 'practice'
  }

  /** 预训练完成（或跳过后）→ 3 秒倒计时 → 正式采集 */
  function beginCountdown() {
    if (phase.value !== 'practice') return
    if (!ready.value) { faceMessage.value = '请让面部回到画面框内'; return }
    markStage('countdown'); phase.value = 'countdown'
    countdownSec.value = Math.ceil(COMMUNITY_STAGE_MS.countdown / 1000)
    clear(countdownTimer)
    countdownTimer = window.setInterval(() => {
      if (phase.value !== 'countdown') { clear(countdownTimer); countdownTimer = null; return }
      if (!ready.value) { faceMessage.value = '请让面部回到画面框内'; return }
      // 只显示 3→2→1，到 1 后直接进入采集，不出现 0（对齐航空）
      if (countdownSec.value <= 1) { clear(countdownTimer); countdownTimer = null; void beginCapture(); return }
      countdownSec.value -= 1
    }, 1000)
  }

  function closeCamera(keepNativeReady = false) {
    native.stopPromptAudio()
    if (keepNativeReady && native.available.value) native.hide()
    else native.stopPreview()
    browserFace.stop(); browser.stop()
  }

  function armCaptureClock() {
    stopCaptureClock()
    captureController = new CaptureController({
      requiredMs: STRICT_CONTINUOUS_V2.requiredMs,
      detectionDebounceMs: STRICT_CONTINUOUS_V2.detectionDebounceMs,
      protocolVersion: STRICT_CONTINUOUS_V2.version,
      onProgress: elapsed => {
        captureElapsedMs.value = elapsed
        captureRemainingSec.value = Math.max(0, Math.ceil((STRICT_CONTINUOUS_V2.requiredMs - elapsed) / 1000))
        progress.value = Math.min(100, elapsed / STRICT_CONTINUOUS_V2.requiredMs * 100)
      },
      onSealed: (summary: CaptureSummary) => {
        sealedElapsedMs = summary.effectiveContinuousMs || summary.elapsedMs
        lastCaptureElapsedMs = summary.elapsedMs
        void endCapture()
      },
      onInvalid: (reason: string, summary: CaptureSummary) => {
        lastCaptureElapsedMs = summary.elapsedMs
        void abortForQuality(reason)
      },
    })
    scheduler = new QuestionScheduler(questions.value, {
      requiredMs: STRICT_CONTINUOUS_V2.requiredMs,
      tailFromMs: COMMUNITY_QUESTION_CONFIG.tailFromMs,
      closingFromMs: COMMUNITY_QUESTION_CONFIG.closingFromMs,
      selectFeedbackMs: COMMUNITY_STAGE_MS.selectFeedback,
      skipFeedbackMs: COMMUNITY_STAGE_MS.selectFeedback,
      tailPoolSize: COMMUNITY_QUESTION_CONFIG.tailPoolSize,
    })
    sustainedAlerted = false
    finalHintDone = false
    finalHint.value = false
    interrupting.value = false; interruptReason.value = ''
    captureController.start()
    scheduler.start(0)
    card.value = { ...scheduler.card }
    stageTimer = window.setInterval(tickCapture, TICK_MS)
  }

  async function beginCapture() {
    if (phase.value !== 'countdown') return
    if (sessionId.value) void fetch(`/api/v1/community/session/${sessionId.value}/start`, { method: 'POST' }).catch(() => undefined)
    if (native.available.value) {
      const result = await native.startRecording()
      if (!result.ok) return deviceError(`录制没能开始：${result.error || '未知原因'}`)
    } else if (!browser.startRecording()) return deviceError('浏览器录制启动失败')
    captureElapsedMs.value = 0
    captureRemainingSec.value = Math.ceil(STRICT_CONTINUOUS_V2.requiredMs / 1000)
    progress.value = 0
    markStage('capturing')
    phase.value = 'capturing'
    armCaptureClock()
    playCurrentQuestionAudio(true)
  }

  /** 新题实例出现时播题（同一实例只播一次） */
  function playCurrentQuestionAudio(force = false) {
    const current = card.value
    if (current.kind !== 'question' && current.kind !== 'feedback') return
    if (!force && lastPlayedInstance === current.instance.instanceId) return
    lastPlayedInstance = current.instance.instanceId
    void communityAudio.playQuestion(current.instance.question).then(ok => { if (!ok) speak(current.instance.question.question) })
  }

  /** 自定节奏：选中即锁定反馈，约 200ms 后由采集时钟切下一题（实例不匹配/重复点击被调度器拒绝） */
  function select(optionId: string) {
    const current = card.value
    if (current.kind !== 'question' || phase.value !== 'capturing' || !captureController) return
    communityAudio.stop()
    if (scheduler?.select(current.instance.instanceId, optionId, captureController.elapsedMs)) {
      card.value = { ...scheduler.card }
    }
  }

  async function endCapture() {
    stopCaptureClock()
    scheduler?.finalize(lastCaptureElapsedMs)
    card.value = { kind: 'none' }
    communityAudio.stop(); native.stopPromptAudio()
    try {
      if (native.available.value) {
        const rec = await native.stopRecording()
        if (!rec.ok) throw new Error(rec.error || '视频保存失败')
        const released = await native.releasePreviewForUpload()
        if (!released.ok) throw new Error(released.error || '摄像头关闭失败')
      } else {
        const video = await browser.stopRecording()
        if (!video) throw new Error('录制时长不足，视频没有保存成功')
        pendingBrowserVideo = video
      }
    } catch (error) {
      closeCamera(false)
      return deviceError(error instanceof Error ? error.message : '录制结束失败')
    }
    // 采集结束即关摄像头；整理和报告页不再出现人脸框。
    closeCamera(native.available.value)
    // 采集完成后立即整理并提交，不插入额外互动环节。
    backgroundUpload = doUpload()
    void runSubmit()
  }

  /** 采集条件确认失效（确认出框/硬失效）→ 本轮记录作废，同会话重新就位 */
  async function abortForQuality(reason = '') {
    stopCaptureClock()
    scheduler?.finalize(lastCaptureElapsedMs)
    card.value = { kind: 'none' }
    backgroundUpload = null
    communityAudio.stop(); native.stopPromptAudio()
    try {
      if (native.available.value) await native.stopRecording()
      else { await browser.stopRecording(); pendingBrowserVideo = null }
    } catch { /* 丢弃 */ }
    closeCamera(false)
    failure.value = reason || '刚才的画面条件不太稳定，这次记录没有采用'
    phase.value = 'quality_failed'
  }

  // ---- 提交（closing 承载真实上传状态；最短停留后进入报告生成中） ----
  async function runSubmit() {
    markStage('closing')
    phase.value = 'closing'
    closingStep.value = 0; uploading.value = true; closingError.value = null; failure.value = ''
    const stepInterval = window.setInterval(() => { closingStep.value = Math.min(3, closingStep.value + 1) }, 2500)
    const uploadPromise = backgroundUpload ?? doUpload()
    backgroundUpload = uploadPromise
    const [result] = await Promise.all([uploadPromise, new Promise<void>(r => window.setTimeout(r, COMMUNITY_STAGE_MS.closing))])
    window.clearInterval(stepInterval)
    uploading.value = false
    if (result !== true) {
      closingError.value = '你的体验记录暂时没有保存成功'
      failure.value = result || '提交失败'
      // 纳入定时器跟踪：2 秒内点"重新提交"进入新一轮 closing 时，旧跳转不得再触发
      clear(submitFailTimer)
      submitFailTimer = window.setTimeout(() => { phase.value = 'submit_failed' }, 2000)
      return
    }
    closingStep.value = 4
    window.setTimeout(() => enterReportProcessing(), 800)
  }

  async function doUpload(): Promise<true | string> {
    try {
      // 全量作答记录：selected/skipped/unanswered 分列（来自调度器，审计可追溯）
      const selections = (scheduler?.results ?? []).map(record => ({
        question_id: record.questionId,
        picked: record.optionId === null ? [] : [record.optionId],
        answered_ms: record.outcome === 'selected' ? Math.max(0, record.atMs) : 0,
        outcome: record.outcome,
        role: record.role,
      }))
      const payload = {
        name: '', id_card: '',
        selections,
        // 正式采集时长以采集时钟为准（60 秒有效窗口），不再按题数估算
        duration_seconds: sealedElapsedMs ? Math.round(sealedElapsedMs / 1000) : elapsedSec.value,
        session_id: sessionId.value,
        self_report: JSON.stringify({}),
      }
      if (native.available.value) {
        const result = await native.submitAssessment({ ...payload, client_token: clientToken })
        if (!result.ok) {
          // 服务端已有本次会话的测评（响应丢失后的重试）→ 不是失败，报告已存在
          if (classifySubmitError(result.error || '') === 'already-submitted') return true
          throw new Error(result.error || '上传没有成功')
        }
        lastSubmissionId = String(result.assessment_id || '') || null
        return true
      }
      const video = pendingBrowserVideo
      if (!video) return '没有找到可提交的记录，请重新体验一次'
      const form = new FormData()
      form.append('name', ''); form.append('id_card', '')
      form.append('selections', JSON.stringify(payload.selections))
      form.append('duration_seconds', String(payload.duration_seconds))
      form.append('session_id', sessionId.value)
      form.append('self_report', payload.self_report)
      form.append('client_token', clientToken)
      form.append('video', video, 'assessment.webm')
      const r = await fetchWithTimeout('/api/v1/assessments/submit', { method: 'POST', body: form }, UPLOAD_TIMEOUT_MS)
      if (!r.ok) {
        const text = await r.text().catch(() => '')
        if (classifySubmitError(text) === 'already-submitted') return true
        throw new Error(`保存没有成功（${r.status}）`)
      }
      lastSubmissionId = (await r.json()).id || null
      return true
    } catch (error) {
      console.error('[community] upload error:', error)
      return error instanceof Error ? error.message : '保存没有成功'
    }
  }

  // ---- 报告生成中（可离开；就绪后转完成页） ----
  function enterReportProcessing() {
    markStage('report_processing')
    phase.value = 'report_processing'
    reportReady.value = false
    clear(reportTimer)
    reportTimer = window.setInterval(() => void pollReportReady(), 5_000)
    void pollReportReady()
  }
  async function pollReportReady() {
    if (phase.value !== 'report_processing' || !sessionId.value) return
    try {
      const r = await fetch(`/api/v1/community/session/${sessionId.value}/status`)
      if (!r.ok) return
      const body = await r.json().catch(() => ({}))
      if (body.report_ready) {
        reportReady.value = true
        clear(reportTimer)
        showComplete()
      }
    } catch { /* 网络抖动：下轮再查 */ }
  }

  function retrySubmit() { backgroundUpload = null; void runSubmit() }

  /** 质量/设备异常后重采：同会话重新就位（不需要再次确认/支付） */
  function retryCapture() {
    progress.value = 0
    captureElapsedMs.value = 0
    captureRemainingSec.value = Math.ceil(STRICT_CONTINUOUS_V2.requiredMs / 1000)
    scheduler = null
    card.value = { kind: 'none' }
    pendingBrowserVideo = null; failure.value = ''
    void enterFaceReady()
  }

  /** 失败后结束：回到欢迎页；不新建支付会话（同一次体验不重复确认/支付） */
  function endSession() {
    cleanup(); failure.value = ''
    phase.value = 'welcome'
  }

  function showComplete() {
    markStage('complete'); logTotal()
    clear(reportTimer)
    phase.value = 'complete'
  }

  function finish() {
    cleanup()
    sessionId.value = ''; payStatus.value = 'creating'
    progress.value = 0; failure.value = ''
    lastSubmissionId = null; pendingBrowserVideo = null
    backgroundUpload = null
    reportReady.value = false
    phase.value = 'welcome'
  }

  function deviceError(message: string) { failure.value = message; phase.value = 'device_error' }

  function cleanup() {
    stopCaptureClock()
    clear(countdownTimer); clear(reportTimer); clear(submitFailTimer); stopPayPolling()
    scheduler = null
    card.value = { kind: 'none' }
    communityAudio.stop(); native.stopPromptAudio()
    // 采集/上传中途退出也要停掉原生录制会话，释放编码器与摄像头
    //（浏览器路径 browser.stop 已覆盖；未在录制时原生层自行忽略）
    try { void native.stopRecording() } catch { /* no-op */ }
    native.stopPreview()
    browserFace.stop(); browser.stop()
  }
  onBeforeUnmount(() => { document.removeEventListener('visibilitychange', onVisibilityChange); cleanup() })

  // 整页刷新/跳转不会触发 Vue 卸载：页面离开前把原生摄像头预览层收掉，避免残留在下一页
  window.addEventListener('pagehide', () => {
    try { native.stopPromptAudio(); native.stopPreview() } catch { /* 忽略 */ }
  })

  // ---- 阶段推进 ----
  function startFromWelcome() { warmPracticeAssets(); markStage('brief'); phase.value = 'brief' }
  function onBriefDone() { markStage('payment_mock'); phase.value = 'payment_mock'; void createSession() }
  function onConsentConfirm() { proceedAfterAssets() }
  function onOpeningDone() { void enterFaceReady() }

  return {
    phase, payStatus, payError, payMock, payMockBusy, sessionId, sessionCode, amountFen, payCountdown, payQrUrl,
    questions, assetsReady, assetsError, assetsProgress, total, presentedCount, progress,
    ready, readyChecklist, faceReady, faceState, faceMessage, cameraMessage,
    countdownSec, card, captureElapsedMs, captureRemainingSec, elapsedSec, interrupting, interruptReason, finalHint,
    closingStep, uploading, closingError, failure, reportReady,
    native,
    startFromWelcome, onBriefDone, onConsentConfirm, onOpeningDone,
    confirmReady, beginCountdown, simulateFaceReady,
    confirmExperience, createSession, restartPayment, mockPayNow, prepareAssets, retryAssets,
    select, retrySubmit, retryCapture, endSession, finish,
    syncPreview: (kind: 'detect' | 'monitor') => {
      if (native.available.value) void native.place(document.querySelector(`[data-native-preview-anchor="${kind}"]`))
    },
  }
}
