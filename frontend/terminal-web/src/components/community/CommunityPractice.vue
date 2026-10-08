<script setup lang="ts">
/**
 * 预训练（社区皮肤）：与航空 PracticeStage 同一套流程语义。
 * 3 道图片题、不录像不上传、不计入结果；右上角可「跳过」；
 * 完成（或跳过后）由用户点「开始正式测评」进入 3 秒倒计时。
 * 人脸不达标时按钮不可用，并给出提示。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import ImageQuestion from '@/components/assessment/ImageQuestion.vue'
import type { QuestionInstance } from '@/aviation/types'
import { PRACTICE_QUESTIONS } from '@/config/community/content'

const props = defineProps<{
  native: boolean
  cameraMessage: string
  faceLevel: 'ok' | 'warn' | 'fail' | 'error'
  imageUrls?: Record<string, string>
}>()
const emit = defineEmits<{ start: []; question: [key: string, text: string, audioUrl: string]; answer: []; finished: [skipped: boolean] }>()

type PracticeQuestion = { image: string; question: string; audioUrl: string; options: readonly string[] }

const stage = ref<'demo' | 'complete' | 'skipped'>('demo')
const questionIndex = ref(0)
const selectedOption = ref<string | null>(null)
const showHelpHint = ref(false)
let helpTimer: number | null = null
let advanceTimer: number | null = null

const currentQuestion = computed<PracticeQuestion | undefined>(() => {
  const question = PRACTICE_QUESTIONS[questionIndex.value]
  return question ? { ...question, image: props.imageUrls?.[question.image] || question.image } : undefined
})
const questionInstance = computed<QuestionInstance | null>(() => {
  const question = currentQuestion.value
  return question ? { instanceId:questionIndex.value, role:'regular', question:{ id:`practice-${questionIndex.value}`, question:question.question, image:question.image, imageAlt:'预训练情境图片', audioUrl:'', dimension:'操作练习', contentVersion:'practice', scoringMode:'observation_only', options:question.options.map((text,index)=>({id:String(index),text})) } } : null
})
const selectedId = computed(() => selectedOption.value === null ? null : String(currentQuestion.value?.options.indexOf(selectedOption.value) ?? -1))
function chooseById(_instanceId: number, optionId: string) {
  const option = currentQuestion.value?.options[Number(optionId)]
  if (option) choose(option)
}
const monitorState = computed(() => props.faceLevel === 'ok' ? 'ok' : props.faceLevel === 'error' ? 'error' : 'warning')

function armHelpHint() {
  if (helpTimer) window.clearTimeout(helpTimer)
  helpTimer = window.setTimeout(() => { if (stage.value === 'demo' && !selectedOption.value) showHelpHint.value = true }, 8000)
}

function speakCurrentQuestion() {
  if (stage.value === 'demo' && currentQuestion.value) emit('question', `practice-${questionIndex.value}`, currentQuestion.value.question, currentQuestion.value.audioUrl)
}

onMounted(() => {
  speakCurrentQuestion()
  armHelpHint()
})

function choose(option: string) {
  if (stage.value !== 'demo' || selectedOption.value) return
  emit('answer')
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
      emit('finished', false)
    }
  }, 180)
}

function skipAll() {
  if (stage.value !== 'demo') return
  if (advanceTimer) { window.clearTimeout(advanceTimer); advanceTimer = null }
  if (helpTimer) { window.clearTimeout(helpTimer); helpTimer = null }
  selectedOption.value = null
  stage.value = 'skipped'
  emit('finished', true)
}

function start() {
  if (props.faceLevel !== 'ok') return
  emit('answer')
  emit('start')
}

onBeforeUnmount(() => {
  if (helpTimer) window.clearTimeout(helpTimer)
  if (advanceTimer) window.clearTimeout(advanceTimer)
  emit('answer')
})
</script>
<template>
  <main class="pd-stage">
    <CameraMonitor class="stage-top" :message="cameraMessage" :native="native" :state="monitorState" />
    <ImageQuestion v-if="stage === 'demo' && questionInstance" :instance="questionInstance" :selected="selectedId" :disabled="selectedOption !== null" @select="chooseById" />

    <div v-if="stage === 'demo'" class="pd-foot">
      <p class="pd-badge">第 {{ questionIndex + 1 }} / {{ PRACTICE_QUESTIONS.length }} 题</p>
      <div class="pd-progress">
        <i v-for="n in PRACTICE_QUESTIONS.length" :key="n" :class="{ active: n - 1 === questionIndex, done: n - 1 < questionIndex }" />
      </div>
      <p class="pd-note">{{ showHelpHint ? '点击更符合感受的选项，即可继续' : '预训练 · 不计入正式测评结果' }}</p>
      <button class="pd-skip" @click="skipAll">跳过预训练</button>
    </div>

    <section v-if="stage !== 'demo'" class="pd-finish-overlay">
      <div class="pd-finish-icon">{{ stage === 'complete' ? '✓' : '⟩⟩' }}</div>
      <h1>{{ stage === 'complete' ? '您已学会操作' : '预训练已跳过' }}</h1>
      <p>正式采集 60 秒。为保证测评质量，请尽量保持头部稳定，并持续看向屏幕。</p>
      <button class="primary pd-start" :disabled="faceLevel !== 'ok'" @click="start">开始正式测评</button>
      <small v-if="faceLevel !== 'ok'">{{ cameraMessage }}</small>
    </section>
  </main>
</template>
<style scoped>
.pd-stage{position:relative;width:100%;height:100%;overflow:hidden}
.pd-foot{position:absolute;z-index:14;left:0;right:0;bottom:10px;display:flex;align-items:center;gap:14px;padding:0 26px}
.pd-badge{margin:0;padding:6px 14px;border-radius:999px;font-size:14px;font-weight:700;white-space:nowrap}
.pd-note{margin:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pd-progress{display:flex;gap:7px;flex:none}
.pd-progress i{width:26px;height:4px;border-radius:99px}.pd-progress i.active{width:40px}
.pd-skip{margin-left:auto;min-height:44px;padding:0 18px;border-radius:14px;font-size:15px;font-weight:650;white-space:nowrap}
.pd-finish-overlay{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:#e9f0e9}
.pd-finish-icon{display:grid;place-items:center;width:54px;height:54px;border-radius:50%;color:#fff;background:#3f8579;font-size:26px;font-weight:800}
.pd-finish-overlay h1{margin:3px 0 0;color:#294735;font-size:25px;font-family:inherit}
.pd-finish-overlay p{max-width:680px;margin:0;color:#3c5846;font-size:16px;font-weight:650;line-height:1.55}
.pd-start{min-width:300px;min-height:54px;margin-top:5px;font-size:17px}.pd-start:disabled{opacity:.5}
.pd-finish-overlay small{color:#425f50;font-size:14px}
</style>
<style scoped src="../../styles/community-capture.css"></style>
