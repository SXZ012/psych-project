import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { makeQuestions } from '@/data/questions'
import { useAndroidCamera } from '@/composables/useAndroidCamera'
import { useBrowserCamera } from '@/composables/useBrowserCamera'
import { useBrowserFaceDetection } from '@/composables/useBrowserFaceDetection'
import { usePromptAudio } from '@/composables/usePromptAudio'
import type { TerminalPhase, TerminalQuestion, UserIdentity } from '@/types/terminal'

const PER_QUESTION_MS = 10_000
const INTRO_MS = 5_000
const OUTRO_MS = 5_000

export function useAssessmentFlow() {
  const phase = ref<TerminalPhase>('login')
  const identity = ref<UserIdentity | null>(null)
  const questions = ref(makeQuestions())
  const index = ref(0), progress = ref(0), selections = ref<string[][]>(questions.value.map(() => []))
  const faceReady = ref(false), faceState = ref<'ok'|'warning'|'error'>('warning'), faceMessage = ref('请正对屏幕，让头部完整位于框内'), finalCountdown = ref(5), completeCountdown = ref(30), failure = ref('')
  const native = useAndroidCamera(), browser = useBrowserCamera(), browserFace = useBrowserFaceDetection(handleFace)
  const promptAudio = usePromptAudio()
  let stageTimer: number | null = null, countdownTimer: number | null = null, completeTimer: number | null = null, lastSubmissionId: string | null = null
  let pendingPayload: {name:string;id_card:string;selections:{question_id:string;picked:string[]}[];duration_seconds:number} | null = null
  let pendingBrowserVideo: Blob | null = null
  const current = computed(() => questions.value[index.value])
  const cameraMessage = computed(() => faceMessage.value)
  let faceValidSince: number | null = null, faceInvalidSince: number | null = null

  function setInvalidFace(message: string) {
    const now = performance.now(); faceValidSince = null; if (!faceInvalidSince) faceInvalidSince = now
    faceReady.value = false; faceState.value = now - faceInvalidSince >= 3000 ? 'error' : 'warning'; faceMessage.value = message; native.setGuideState(faceState.value)
  }
  function setValidFace() {
    const now = performance.now(); faceInvalidSince = null; if (!faceValidSince) faceValidSince = now
    faceState.value = 'ok'; faceMessage.value = phase.value === 'detect' ? '位置合适，请保持当前坐姿' : '位置合适'; faceReady.value = now - faceValidSince >= 800; native.setGuideState(faceReady.value ? 'ok' : 'warning')
  }
  function handleFace(result: {count?:number;xCenter?:number;yCenter?:number;width?:number;height?:number;error?:string}|null) {
    if (!result) return
    if (result.error) return setInvalidFace(result.error)
    if (!result.count) return setInvalidFace('未检测到面部，请回到画面框内')
    if (result.count > 1) return setInvalidFace('请确保画面中只有一人')
    const width=result.width || 0, height=result.height || 0, x=result.xCenter || 0, y=result.yCenter || 0
    if (width < .11) setInvalidFace('距离稍远，请向屏幕靠近一点')
    else if (width > .72 || height > .88) setInvalidFace('距离稍近，请向后调整一点')
    else if (x < .20 || x > .80 || y < .15 || y > .82) setInvalidFace('请将头部移至画面框中央')
    else setValidFace()
  }
  watch(native.faceResult, handleFace)

  function clear(timer: number | null) { if (timer) window.clearInterval(timer) }
  function delay(ms: number) { return new Promise<void>(resolve => window.setTimeout(resolve, ms)) }
  async function preloadPairs() {
    try {
      const response = await fetch('/api/v1/pairs/session?count=5')
      const body = await response.json()
      const pairs = Array.isArray(body.pairs) ? body.pairs.filter((item: { image_url?: string }) => item?.image_url) : []
      questions.value = makeQuestions().map((fallback, i) => {
        const pair = pairs[i]
        if (!pair) return fallback
        const pairId = String(pair.pair_id || fallback.id)
        return {
          ...fallback,
          id: pairId,
          image: pair.image_url || fallback.image,
          question: pair.question || fallback.question,
          options: [
            { id: `${pairId}a`, text: pair.option_a || fallback.options[0].text },
            { id: `${pairId}b`, text: pair.option_b || fallback.options[1].text },
          ],
          dimension: pair.dimension || fallback.dimension,
          scenario: pair.scenario || fallback.scenario,
          audioUrl: pair.audio_url || undefined,
          contentVersion: pair.content_version || fallback.contentVersion,
          scoringMode: pair.scoring_mode === 'validated' ? 'validated' : 'observation_only',
        } satisfies TerminalQuestion
      })
      questions.value.forEach(question => { const image = new Image(); image.src = question.image })
      promptAudio.preload(questions.value)
    } catch { /* 断网或图库异常时使用内置兜底图 */ }
  }
  function enter(identityValue: UserIdentity) { identity.value = identityValue; phase.value = 'consent' }
  async function confirmConsent() {
    phase.value = 'detect'; faceReady.value = false; faceState.value = 'warning'; faceMessage.value = '正在开启摄像头…'; faceValidSince = null; faceInvalidSince = null; native.setGuideState('warning')
    await nextTick()
    const anchor = document.querySelector<HTMLElement>('[data-native-preview-anchor="detect"]')
    if (native.available.value) {
      const ok = await native.startPreview(anchor)
      if (!ok) { faceState.value = 'error'; faceMessage.value = native.message.value }
      else faceMessage.value = '正在确认人物位置…'
    } else {
      try {
        const analysis = document.querySelector<HTMLVideoElement>('#analysis-video')
        await browser.start([document.querySelector('#detect-video'), document.querySelector('#monitor-video'), analysis])
        if (analysis) await browserFace.start(analysis)
      } catch { failure.value = '无法使用摄像头，请允许权限后重试'; phase.value = 'submit_failed' }
    }
  }
  async function syncPreview(kind: 'detect' | 'monitor') { if (native.available.value) await native.place(document.querySelector(`[data-native-preview-anchor="${kind}"]`)) }
  async function begin() {
    if (!faceReady.value) return
    // Must run synchronously within the user's click event for Chrome autoplay policy.
    promptAudio.unlock()
    phase.value = 'intro'; await nextTick(); await syncPreview('monitor')
    if (native.available.value) {
      const result = await native.startRecording()
      if (!result.ok) return fail(`录制启动失败：${result.error || '未知原因'}`)
      native.playIntroAudio()
    } else if (!browser.startRecording()) return fail('浏览器录制启动失败，请重新开始')
    window.setTimeout(() => { phase.value = 'assess'; startQuestion() }, INTRO_MS)
  }
  function startQuestion() {
    clear(stageTimer); progress.value = 0; void promptAudio.playQuestion(current.value); const start = performance.now()
    stageTimer = window.setInterval(() => {
      progress.value = Math.min(100, (performance.now() - start) / PER_QUESTION_MS * 100)
      if (progress.value >= 100) nextQuestion()
    }, 50)
  }
  function select(option: string) { const currentSelection = selections.value[index.value]; selections.value[index.value] = currentSelection[0] === option ? [] : [option] }
  function nextQuestion() { clear(stageTimer); if (index.value < questions.value.length - 1) { index.value += 1; startQuestion() } else void submit() }
  async function submit() {
    promptAudio.stop()
    phase.value = 'loading'; finalCountdown.value = 5; native.available.value ? native.playOutroAudio() : undefined
    clear(countdownTimer); countdownTimer = window.setInterval(() => { finalCountdown.value = Math.max(1, finalCountdown.value - 1) }, 1000)
    await delay(OUTRO_MS); clear(countdownTimer)
    const payload = { name: identity.value?.name || '', id_card: identity.value?.id_card || '', selections: selections.value.map((picked, i) => ({ question_id: questions.value[i].id, picked })), duration_seconds: 60 }
    pendingPayload = payload
    phase.value = 'submitting'
    try {
      if (native.available.value) {
        const recording = await native.stopRecording(); if (!recording.ok) throw new Error(recording.error || '原生视频封装失败')
        const result = await native.submitAssessment(payload); if (!result.ok) throw new Error(result.error || '原生上传失败'); lastSubmissionId = String(result.assessment_id || '') || null
      } else {
        const video = await browser.stopRecording(); if (!video) throw new Error('录制时长不足或视频无效'); pendingBrowserVideo = video
        const form = new FormData(); form.append('name', payload.name); form.append('id_card', payload.id_card); form.append('selections', JSON.stringify(payload.selections)); form.append('duration_seconds', '60'); form.append('video', video, 'assessment.webm')
        const url = lastSubmissionId ? `/api/v1/assessments/${lastSubmissionId}/resubmit` : '/api/v1/assessments/submit'
        const response = await fetch(url, { method: 'POST', body: form }); if (!response.ok) throw new Error(`提交失败（${response.status}）`); lastSubmissionId = (await response.json()).id || null
      }
      showComplete()
    } catch (error) { fail(error instanceof Error ? error.message : '提交失败') }
  }
  function fail(message: string) { failure.value = message; phase.value = 'submit_failed' }
  async function retry() {
    if (!pendingPayload) return fail('没有可重新提交的测评数据，请重新测评')
    phase.value = 'submitting'
    try {
      if (native.available.value) {
        const result = await native.submitAssessment(pendingPayload); if (!result.ok) throw new Error(result.error || '原生上传失败'); lastSubmissionId = String(result.assessment_id || '') || null
      } else {
        if (!pendingBrowserVideo) throw new Error('没有可重新提交的视频，请重新测评')
        const form = new FormData(); form.append('name', pendingPayload.name); form.append('id_card', pendingPayload.id_card); form.append('selections', JSON.stringify(pendingPayload.selections)); form.append('duration_seconds', '60'); form.append('video', pendingBrowserVideo, 'assessment.webm')
        const response = await fetch('/api/v1/assessments/submit', { method: 'POST', body: form }); if (!response.ok) throw new Error(`提交失败（${response.status}）`); lastSubmissionId = (await response.json()).id || null
      }
      showComplete()
    } catch (error) { fail(error instanceof Error ? error.message : '提交失败') }
  }
  function showComplete() { phase.value = 'complete'; completeCountdown.value = 30; clear(completeTimer); completeTimer = window.setInterval(() => { completeCountdown.value -= 1; if (completeCountdown.value <= 0) finish() }, 1000) }
  function resetCompleteCountdown() { if (phase.value === 'complete') completeCountdown.value = 30 }
  function finish() { clear(stageTimer); clear(countdownTimer); clear(completeTimer); promptAudio.stop(); native.stopPromptAudio(); native.stopPreview(); browserFace.stop(); browser.stop(); phase.value = 'login'; identity.value = null; index.value = 0; progress.value = 0; selections.value = questions.value.map(() => []); faceReady.value = false; lastSubmissionId = null; pendingPayload = null; pendingBrowserVideo = null; failure.value = '' }
  void preloadPairs()
  onBeforeUnmount(finish)
  return { phase, current, index, progress, selections, faceReady, faceState, finalCountdown, completeCountdown, failure, native, cameraMessage, enter, confirmConsent, begin, select, retry, finish, resetCompleteCountdown, syncPreview }
}
