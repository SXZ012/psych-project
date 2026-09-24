<script setup lang="ts">
/**
 * 预训练（社区皮肤）：与航空 PracticeStage 同一套流程语义。
 * 3 道图片题、不录像不上传、不计入结果；右上角可「跳过」；
 * 完成（或跳过后）由用户点「开始正式测评」进入 3 秒倒计时。
 * 人脸不达标时按钮不可用，并给出提示。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import { PRACTICE_QUESTIONS } from '@/config/community/content'

const props = defineProps<{
  native: boolean
  cameraMessage: string
  faceLevel: 'ok' | 'warn' | 'fail' | 'error'
}>()
const emit = defineEmits<{ start: [] }>()

type PracticeQuestion = { image: string; question: string; options: readonly string[] }

const stage = ref<'demo' | 'complete' | 'skipped'>('demo')
const questionIndex = ref(0)
const selectedOption = ref<string | null>(null)
const showHelpHint = ref(false)
let helpTimer: number | null = null
let advanceTimer: number | null = null
type Bridge = { speakPrompt?: (t: string) => void; stopPromptAudio?: () => void }
const bridge = () => (window as unknown as { AndroidCamera?: Bridge }).AndroidCamera

const currentQuestion = computed(() => PRACTICE_QUESTIONS[questionIndex.value])
const monitorState = computed(() => props.faceLevel === 'ok' ? 'ok' : props.faceLevel === 'error' ? 'error' : 'warning')

function armHelpHint() {
  if (helpTimer) window.clearTimeout(helpTimer)
  helpTimer = window.setTimeout(() => { if (stage.value === 'demo' && !selectedOption.value) showHelpHint.value = true }, 8000)
}

function speakCurrentQuestion() {
  try { bridge()?.stopPromptAudio?.(); bridge()?.speakPrompt?.(currentQuestion.value?.question || '') } catch { /* 浏览器无原生语音 */ }
}

onMounted(() => {
  speakCurrentQuestion()
  armHelpHint()
})

function choose(option: string) {
  if (stage.value !== 'demo' || selectedOption.value) return
  selectedOption.value = option
  showHelpHint.value = false
  if (helpTimer) { window.clearTimeout(helpTimer); helpTimer = null }
  advanceTimer = window.setTimeout(() => {
    advanceTimer = null
    selectedOption.value = null
    if (questionIndex.value < PRACTICE_QUESTIONS.length - 1) {
      questionIndex.value += 1
      nextTick(speakCurrentQuestion)
      armHelpHint()
    } else {
      stage.value = 'complete'
    }
  }, 180)
}

function skipAll() {
  if (stage.value !== 'demo') return
  if (advanceTimer) { window.clearTimeout(advanceTimer); advanceTimer = null }
  if (helpTimer) { window.clearTimeout(helpTimer); helpTimer = null }
  selectedOption.value = null
  try { bridge()?.stopPromptAudio?.() } catch { /* 忽略 */ }
  stage.value = 'skipped'
}

function start() {
  if (props.faceLevel !== 'ok') return
  try { bridge()?.stopPromptAudio?.() } catch { /* 忽略 */ }
  emit('start')
}

onBeforeUnmount(() => {
  if (helpTimer) window.clearTimeout(helpTimer)
  if (advanceTimer) window.clearTimeout(advanceTimer)
  try { bridge()?.stopPromptAudio?.() } catch { /* 忽略 */ }
})
</script>
<template>
  <main class="pd-stage">
    <img v-if="stage === 'demo' && currentQuestion" class="pd-photo" :src="currentQuestion.image" alt="预训练图片" />
    <div v-else class="pd-photo pd-photo--plain" />
    <div class="pd-shade" />

    <CameraMonitor v-if="stage === 'demo'" class="stage-top" :message="cameraMessage" :native="native" :state="monitorState" />

    <section v-if="stage === 'demo' && currentQuestion" class="pd-card">
      <h1>{{ currentQuestion.question }}</h1>
      <p class="pd-hint">点击更符合您感受的答案</p>
      <div class="pd-options">
        <button v-for="opt in currentQuestion.options" :key="opt"
          :class="{ picked: selectedOption === opt, help: showHelpHint }"
          @click="choose(opt)">
          <span>{{ selectedOption === opt ? '✓' : '○' }}</span>{{ opt }}
        </button>
      </div>
    </section>

    <div v-if="stage === 'demo'" class="pd-foot">
      <p class="pd-badge">第 {{ questionIndex + 1 }} / {{ PRACTICE_QUESTIONS.length }} 题</p>
      <div class="pd-progress">
        <i v-for="n in PRACTICE_QUESTIONS.length" :key="n" :class="{ active: n - 1 === questionIndex, done: n - 1 < questionIndex }" />
      </div>
      <p class="pd-note">预训练 · 不计入正式测评结果</p>
      <button class="pd-skip" @click="skipAll">跳过预训练</button>
    </div>

    <section v-if="stage !== 'demo'" class="pd-finish-overlay">
      <div class="pd-finish-icon">{{ stage === 'complete' ? '✓' : '⟩⟩' }}</div>
      <h1>{{ stage === 'complete' ? '您已学会操作' : '预训练已跳过' }}</h1>
      <p>正式测评约 1 分钟。为保证测评质量，请尽量保持头部稳定，并持续看向屏幕。</p>
      <button class="primary pd-start" :disabled="faceLevel !== 'ok'" @click="start">开始正式测评</button>
      <small v-if="faceLevel !== 'ok'">{{ cameraMessage }}</small>
    </section>
  </main>
</template>
<style scoped>
.pd-stage{position:relative;width:100%;height:100%;overflow:hidden}
.pd-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pd-photo--plain{background:linear-gradient(160deg,#5f7d78 0%,#3c5a57 100%)}
.pd-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,18,14,.30) 0%,rgba(10,18,14,.26) 26%,rgba(10,18,14,.42) 60%,rgba(10,18,14,.72) 100%)}

/* 962×602 横屏：摄像头框与航空一致（正上方居中 360 宽），题卡在其正下方，
   题号/进度/跳过收进底部信息条，互不遮挡 */
.pd-foot{position:absolute;z-index:14;left:0;right:0;bottom:10px;display:flex;align-items:center;gap:14px;padding:0 26px}
.pd-badge{margin:0;padding:6px 14px;border-radius:999px;background:rgba(62,115,103,.75);backdrop-filter:blur(8px);color:#fff;font-size:14px;font-weight:700;letter-spacing:.05em;white-space:nowrap}
.pd-note{margin:0;color:rgba(255,255,255,.62);font-size:12.5px;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-progress{display:flex;justify-content:center;gap:7px;margin:0;flex:none}
.pd-progress i{width:26px;height:4px;border-radius:99px;background:rgba(255,255,255,.32);transition:all .4s}
.pd-progress i.active{width:40px;background:#fff}
.pd-progress i.done{background:#9fd6bd}

.pd-skip{margin-left:auto;min-height:44px;padding:0 18px;border:1px solid rgba(255,255,255,.42);border-radius:999px;background:rgba(9,26,21,.42);backdrop-filter:blur(8px);color:#eaf5f0;font-size:14px;font-weight:650;white-space:nowrap}
.pd-skip:active{background:rgba(9,26,21,.6)}

.pd-card{position:absolute;z-index:5;left:0;right:0;top:330px;bottom:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 30px;text-align:center}
.pd-card h1{margin:0 0 4px;max-width:600px;color:#fff;font-family:serif;font-size:23px;font-weight:500;line-height:1.45;text-shadow:0 2px 18px rgba(0,0,0,.55)}
.pd-hint{margin:0 0 12px;color:rgba(228,240,234,.75);font-size:13.5px}
.pd-options{display:flex;flex-direction:column;gap:12px;width:min(520px,100%)}
.pd-options button{min-height:52px;padding:10px 24px;border:1.5px solid rgba(255,255,255,.22);border-radius:16px;text-align:center;color:#f2f7f4;background:rgba(255,255,255,.06);backdrop-filter:blur(3px);font-size:16.5px;line-height:1.45;letter-spacing:.03em;transition:border-color .2s,background .3s,box-shadow .3s;touch-action:manipulation}
.pd-options button span{margin-right:8px;color:rgba(191,230,210,.85)}
.pd-options button:active{transform:scale(.97)}
.pd-options button.picked{border-color:rgba(191,230,210,.8);background:rgba(62,115,103,.82);box-shadow:0 0 0 1px rgba(191,230,210,.4),0 8px 24px rgba(62,115,103,.4)}
.pd-options button.picked span{color:#bfe6d2}
.pd-options button.help{animation:pdHelp 1.2s ease-in-out infinite}
@keyframes pdHelp{50%{border-color:#5fe2a8;box-shadow:0 0 0 5px rgba(95,226,168,.2)}}

.pd-finish-overlay{position:absolute;inset:0;z-index:21;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;padding:320px 30px 26px;text-align:center;background:#8badb1}
.pd-finish-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;color:#fff;background:#3f8579;border:2px solid rgba(255,255,255,.7);font-size:26px;font-weight:800}
.pd-finish-overlay h1{margin:3px 0 0;color:#203e4d;font-size:25px;font-family:serif}
.pd-finish-overlay p{max-width:680px;margin:0;color:#2f515b;font-size:16px;font-weight:650;line-height:1.55}
.pd-start{min-width:300px;min-height:54px;margin-top:5px;font-size:17px}
.pd-start:disabled{opacity:.5}
.pd-finish-overlay small{color:#425f68;font-size:13px}

@media(max-height:680px){
  .pd-card{top:318px;bottom:56px}
  .pd-card h1{font-size:21px}
  .pd-options button{min-height:48px;padding:8px 20px}
  .pd-finish-icon{width:70px;height:70px;font-size:30px}
}
</style>
