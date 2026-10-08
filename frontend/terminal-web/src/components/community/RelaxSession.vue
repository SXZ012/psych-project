<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ index: number }>()
const emit = defineEmits<{ close: []; home: [] }>()
const backgroundStyle = { '--wind-background': 'url(/static/assets/community/relax/wind-meadow-carolina.jpg)' }
const activities = [
  { title: '平稳呼吸', eyebrow: '给自己一点慢下来的时间', description: '找一个舒服的坐姿。跟随圆圈，轻轻吸气，再慢慢呼气。', durations: [60,120,180], initial: 60 },
  { title: '自然风声', eyebrow: '把这一刻，留给自己', description: '不必专注于某一个声音。听见风声，也允许思绪自然来去。', durations: [60,180,300], initial: 180 },
]
const activity = activities[props.index] || activities[0]!
const duration = ref(activity.initial)
const elapsed = ref(0)
const spent = ref(0)
const running = ref(false)
const started = ref(false)
const finished = ref(false)
const feeling = ref('')
const audio = ref<HTMLAudioElement | null>(null)
const volume = ref(.3)
const audioError = ref('')
const starting = ref(false)
const buffering = ref(false)
let bufferTimeout: ReturnType<typeof setTimeout> | undefined
let timer: ReturnType<typeof setInterval> | undefined
let beganAt = 0
let baseElapsed = 0
let baseSpent = 0
let playAttempt = 0
const secondsLeft = computed(() => Math.max(0,Math.ceil(duration.value - elapsed.value)))
const clock = computed(() => `${Math.floor(secondsLeft.value/60).toString().padStart(2,'0')}:${(secondsLeft.value%60).toString().padStart(2,'0')}`)
const progress = computed(() => Math.min(100,elapsed.value/duration.value*100))
const windStatus = computed(() => audioError.value ? '播放遇到问题' : starting.value ? '声音准备中' : buffering.value ? '声音缓冲中，计时已暂停' : running.value ? '正在聆听' : started.value ? '已暂停' : '到时自动结束')
const windAction = computed(() => starting.value ? '正在加载…' : running.value ? '暂停一下' : audioError.value ? '重试播放' : started.value ? '继续聆听' : '开始聆听')
const phase = computed(() => elapsed.value%10 < 4 ? '吸气' : '呼气')
const phaseLeft = computed(() => Math.ceil((phase.value==='吸气'?4:10)-elapsed.value%10))
const bubbleSize = computed(() => .78 + .22*(phase.value==='吸气' ? elapsed.value%10/4 : 1-(elapsed.value%10-4)/6))
const elapsedLabel = computed(() => `${Math.floor(spent.value/60)} 分 ${Math.floor(spent.value%60)} 秒`)
function clearTimer() { if(timer) clearInterval(timer); timer=undefined }
function updateClock() { if(buffering.value) return; const delta=(performance.now()-beganAt)/1000; elapsed.value=Math.min(duration.value,baseElapsed+delta); spent.value=baseSpent+Math.min(delta,duration.value-baseElapsed) }
function audioWaiting() {
  if (!running.value || buffering.value) return
  updateClock()
  buffering.value=true
  bufferTimeout=setTimeout(audioFailed,12000)
}
function audioPlaying() {
  if (!buffering.value) return
  clearTimeout(bufferTimeout)
  buffering.value=false
  beganAt=performance.now(); baseElapsed=elapsed.value; baseSpent=spent.value
}
function pause() {
  playAttempt++
  starting.value=false
  if(running.value) updateClock()
  clearTimeout(bufferTimeout)
  buffering.value=false
  running.value=false
  clearTimer()
  audio.value?.pause()
}
function finish() { pause(); finished.value=true }
function audioFailed() { pause(); audioError.value='声音未能播放，请点击重试。' }
async function toggle() {
  if(running.value) { pause(); return }
  if(starting.value || finished.value) return
  audioError.value=''
  const attempt=++playAttempt
  if(audio.value) {
    starting.value=true
    audio.value.volume=volume.value
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([audio.value.play(), new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('play timeout')),12000)})])
    }
    catch { if(attempt===playAttempt) { audio.value?.pause(); audioError.value='声音未能播放，请点击重试。'; starting.value=false }; return }
    finally { clearTimeout(timeout) }
    if(attempt!==playAttempt) { audio.value?.pause(); return }
    starting.value=false
  }
  started.value=true
  running.value=true
  beganAt=performance.now()
  baseElapsed=elapsed.value
  baseSpent=spent.value
  timer=setInterval(()=>{ updateClock(); if(elapsed.value>=duration.value) finish() },100)
}
function selectDuration(value: number) { if(!started.value) { duration.value=value; elapsed.value=0 } }
function restart() { pause(); elapsed.value=0; spent.value=0; started.value=false; finished.value=false; feeling.value=''; if(audio.value) audio.value.currentTime=0 }
function setVolume(event:Event) { volume.value=Number((event.target as HTMLInputElement).value); if(audio.value) audio.value.volume=volume.value }
function hidden() { if(document.hidden) pause() }
document.addEventListener('visibilitychange',hidden)
onBeforeUnmount(()=>{pause(); document.removeEventListener('visibilitychange',hidden)})
</script>

<template>
  <Teleport to="body">
    <section class="session" :style="backgroundStyle" :class="[`session--${index}`,{ 'session--finished':finished }]" aria-label="放松练习">
      <audio v-if="index===1" ref="audio" src="/static/assets/community/audio/cm-ambience-wind.mp3" preload="auto" loop @error="audioFailed" @waiting="audioWaiting" @playing="audioPlaying" />
      <header class="session-head"><NavigationButton @click="emit('close')">返回情绪放松</NavigationButton><h1 v-if="index!==1">{{ activity.title }}</h1><NavigationButton @click="emit('home')">返回首页</NavigationButton></header>
      <main v-if="index===1" class="wind-stage">
        <section class="wind-player" :class="{'wind-player--finished':finished}" aria-labelledby="wind-title">
          <div class="wind-player-heading">
            <div class="wind-intro">
              <p v-if="finished" class="wind-kicker">本次聆听已结束</p>
              <h1 id="wind-title">{{ finished ? '让这份轻松，多停留一会儿' : '自然风声' }}</h1>
              <p v-if="finished" class="wind-description">本次聆听 {{ elapsedLabel }}，按自己的节奏慢慢回来。</p>
            </div>
            <div v-if="!finished" class="wind-duration">
              <div v-if="!started" class="wind-duration-options" role="group" aria-label="聆听时长">
                <button v-for="value in activity.durations" :key="value" :aria-pressed="duration===value" :disabled="starting" @click="selectDuration(value)">{{ value/60 }} 分钟</button>
              </div>
              <b v-else class="wind-clock" :aria-label="`剩余时间 ${clock}`">{{ clock }}</b>
            </div>
          </div>
          <template v-if="!finished">
            <div class="wind-progress-meta"><span role="status">{{ windStatus }}</span><span>{{ started ? `${duration/60} 分钟` : clock }}</span></div>
            <div class="wind-track" role="progressbar" aria-label="聆听进度" :aria-valuenow="Math.round(progress)" :aria-valuemin="0" :aria-valuemax="100"><i :style="{width:`${progress}%`}" /></div>
            <div class="wind-player-controls">
              <label class="wind-volume"><span>音量</span><input type="range" min="0" max="1" step=".05" :value="volume" @input="setVolume" /><output>{{ Math.round(volume*100) }}%</output></label>
              <div class="wind-actions"><button v-if="started" class="wind-end" @click="finish">结束聆听</button><button class="session-primary" :disabled="starting" @click="toggle">{{ windAction }}</button></div>
            </div>
            <p v-if="audioError" class="wind-error" role="alert">{{ audioError }}</p>
          </template>
          <div v-else class="wind-complete-actions"><button @click="restart">再听一次</button><NavigationButton class="session-primary" @click="emit('close')">返回情绪放松</NavigationButton></div>
        </section>
      </main>
      <main v-else-if="!finished" class="session-main">
        <template v-if="index===0">
          <div class="breath-visual" aria-hidden="true"><div class="breath-orbit"><div class="breath-light" :style="{transform:`scale(${started ? bubbleSize : .85})`}" /><div class="breath-center"><b>{{ started ? phase : '慢下来' }}</b><span>{{ started ? `${phaseLeft} 秒` : '从一次呼吸开始' }}</span></div></div></div>
          <section class="session-guide"><span class="session-eyebrow">{{ activity.eyebrow }}</span><h2>{{ running ? (phase==='吸气'?'轻轻吸气':'慢慢呼气') : started ? '停一下，也很好' : '跟着呼吸，找回自己的节奏' }}</h2><p>{{ activity.description }}</p><div class="breath-rhythm"><span><b>4 秒</b>轻轻吸气</span><i>→</i><span><b>6 秒</b>缓缓呼气</span></div><p class="session-note">不必刻意吸深。如果这个节奏不舒服，就恢复自然呼吸。</p><div v-if="!started" class="duration-pick" role="group" aria-label="呼吸练习时长"><button v-for="value in activity.durations" :key="value" :aria-pressed="duration===value" @click="selectDuration(value)">{{ value/60 }} 分钟</button></div><p v-else class="session-micro">{{ running ? '圆圈变大时吸气，变小时呼气' : '点击继续，从刚才的节奏接着来' }}</p></section>
        </template>
      </main>
      <main v-else class="session-complete"><div class="completion-mark" aria-hidden="true">✓</div><span class="session-eyebrow">这一段时间，属于你自己</span><h2>{{ secondsLeft===0 ? (index===1?'聆听完成':'练习完成') : '本次练习已结束' }}</h2><p>本次用时 <b>{{ elapsedLabel }}</b>。不必急着判断效果，先感受此刻的自己。</p><div class="feeling-pick"><span>现在感觉如何？<small>可选</small></span><div role="group" aria-label="练习后的感受"><button v-for="item in ['轻松一些','和平时差不多','想再休息一会儿']" :key="item" :aria-pressed="feeling===item" @click="feeling=item">{{ item }}</button></div><p aria-live="polite">{{ feeling ? '谢谢你留意自己的感受，按自己的节奏就好。' : '不选择也可以，随时返回或再来一次。' }}</p></div></main>
      <footer v-if="index!==1" class="session-controls"><div v-if="!finished" class="session-time"><b>{{ clock }}</b><span>{{ started ? (running?'剩余时间':'已暂停') : '本次时长' }}</span></div><div v-if="!finished" class="session-track" role="progressbar" aria-label="练习进度" :aria-valuenow="Math.round(progress)" :aria-valuemin="0" :aria-valuemax="100"><i :style="{width:`${progress}%`}"/></div><template v-if="!finished"><button class="session-primary" :disabled="starting" @click="toggle">{{ starting?'正在加载…':running?'暂停一下':audioError?'重试播放':started?'继续练习':'开始练习' }}</button><button v-if="started" @click="finish">结束</button></template><template v-else><button @click="restart">再练一次</button><NavigationButton class="session-primary" @click="emit('close')">返回情绪放松</NavigationButton></template></footer>
    </section>
  </Teleport>
</template>

<style scoped src="../../styles/relax-session.css"></style>
<style scoped src="../../styles/wind-session.css"></style>
