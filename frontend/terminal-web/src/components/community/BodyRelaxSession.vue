<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
const audioUrl = '/static/assets/community/relax/body-relax-120.mp3'
const backgroundStyle = { '--body-background': 'url(/static/assets/community/relax/body-lake.webp)' }
import guide from '../../assets/body-relax/guide.json'

const emit = defineEmits<{ close: []; home: [] }>()
const player = ref<HTMLAudioElement | null>(null)
const source = ref('')
const loading = ref(true)
const starting = ref(false)
const running = ref(false)
const started = ref(false)
const finished = ref(false)
const elapsed = ref(0)
const volume = ref(.55)
const error = ref('')
let controller: AbortController | undefined
let playVersion = 0
let disposed = false
const stepIndex = computed(() => guide.reduce((current, step, i) => elapsed.value >= step.start ? i : current, 0))
const step = computed(() => guide[stepIndex.value]!)
const remaining = computed(() => Math.max(0, Math.ceil(120-elapsed.value)))
const timeLabel = computed(() => `${Math.floor(remaining.value/60)}:${String(remaining.value%60).padStart(2,'0')}`)
const elapsedLabel = computed(() => `${Math.floor(elapsed.value/60)} 分 ${Math.floor(elapsed.value%60)} 秒`)

async function loadAudio() {
  controller?.abort()
  const request = new AbortController()
  controller = request
  loading.value = true
  error.value = ''
  const timeout = setTimeout(() => request.abort(), 30000)
  try {
    const response = await fetch(audioUrl, { signal: request.signal })
    if (!response.ok) throw new Error('audio unavailable')
    const blob = await response.blob()
    if (disposed || controller !== request) return
    if (source.value) URL.revokeObjectURL(source.value)
    source.value = URL.createObjectURL(blob)
  } catch {
    if (!disposed && controller === request) error.value = '语音暂未加载成功，请重试。'
  } finally {
    clearTimeout(timeout)
    if (!disposed && controller === request) loading.value = false
  }
}
function pause() {
  playVersion++
  starting.value = false
  player.value?.pause()
  running.value = false
}
async function toggle() {
  if (running.value || starting.value) { pause(); return }
  if (loading.value || finished.value) return
  if (error.value) { await loadAudio(); return }
  const audio = player.value
  if (!audio || !source.value) return
  const version = ++playVersion
  starting.value = true
  audio.volume = volume.value
  try {
    await audio.play()
    if (disposed || version !== playVersion) { audio.pause(); return }
    started.value = true
    running.value = true
  } catch {
    if (!disposed && version === playVersion) error.value = '声音未能播放，请重试。'
  } finally {
    if (version === playVersion) starting.value = false
  }
}
function updateTime() { elapsed.value = player.value?.currentTime ?? 0 }
function finish() { updateTime(); pause(); finished.value = true }
function ended() { elapsed.value = 120; pause(); finished.value = true }
function failed() { pause(); error.value = '声音未能播放，请重试。' }
function restart() {
  pause()
  if (player.value) player.value.currentTime = 0
  elapsed.value = 0
  started.value = false
  finished.value = false
}
function leave(target: 'close' | 'home') { pause(); if (target === 'home') emit('home'); else emit('close') }
function toggleSound() {
  volume.value = volume.value > 0 ? 0 : .55
  if (player.value) player.value.volume = volume.value
}
function hidden() { if (document.hidden) pause() }
onMounted(() => { void loadAudio(); document.addEventListener('visibilitychange', hidden) })
onBeforeUnmount(() => {
  disposed = true
  pause()
  controller?.abort()
  if (source.value) URL.revokeObjectURL(source.value)
  document.removeEventListener('visibilitychange', hidden)
})
</script>

<template>
  <Teleport to="body">
    <section class="body-relax" :style="backgroundStyle" :class="{ 'body-relax--finished': finished }" aria-label="身体放松">
      <audio ref="player" :src="source || undefined" preload="auto" @timeupdate="updateTime" @ended="ended" @error="failed" />
      <header class="body-head">
        <NavigationButton @click="leave('close')">返回情绪放松</NavigationButton>
        <h1>身体放松</h1>
        <NavigationButton @click="leave('home')">返回首页</NavigationButton>
      </header>
      <main class="body-main">
        <section class="body-copy" :class="{ 'body-copy--finished': finished }">
          <template v-if="finished">
            <h2>{{ remaining===0 ? '这两分钟，留给了自己' : '本次放松已结束' }}</h2>
            <p>已练习 {{ elapsedLabel }}。<br />按自己的节奏，慢慢回来。</p>
          </template>
          <template v-else-if="!started">
            <h2>让身体歇一会儿</h2>
            <p>坐得舒服些，听着就好。</p>
          </template>
          <template v-else>
            <h2 :key="step.title">{{ step.title }}</h2>
            <p>{{ running ? step.cue : '已暂停，按自己的节奏继续。' }}</p>
          </template>
        </section>
      </main>
      <footer class="body-footer">
        <p v-if="error" class="body-error" role="alert">{{ error }}</p>
        <template v-if="!finished">
          <div class="body-timing"><b>{{ timeLabel }}</b><span>{{ started ? '剩余时间' : '本次时长' }}</span></div>
          <div class="body-progress" role="progressbar" aria-label="身体放松进度" :aria-valuenow="Math.round(elapsed/120*100)" :aria-valuemin="0" :aria-valuemax="100"><i :style="{ width: `${elapsed/120*100}%` }" /></div>
          <button class="body-sound" :aria-pressed="volume>0" @click="toggleSound">{{ volume>0 ? '声音开' : '声音关' }}</button>
          <button class="body-primary" :disabled="loading || starting" @click="toggle">{{ loading ? '正在准备语音…' : starting ? '正在播放…' : error ? '重试加载' : running ? '暂停一下' : started ? '继续放松' : '开始放松' }}</button>
          <button v-if="started" @click="finish">结束</button>
        </template>
        <template v-else><button @click="restart">再休息一次</button><NavigationButton class="body-primary" @click="leave('close')">返回情绪放松</NavigationButton></template>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.body-relax{position:fixed;inset:0;z-index:2000;background:#eef2e8 var(--body-background) center/cover no-repeat;color:#294335;font-family:inherit;isolation:isolate;overflow:auto}
.body-relax:before{content:'';position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,#f3f7e947,#f5f7ebc9 52%,#f5f7ebed 82%)}
.body-relax *{box-sizing:border-box}.body-relax audio{display:none}.body-relax button{min-height:52px;padding:0 22px;border:0;border-radius:28px;background:#ffffff70;color:#294335;font:inherit;font-size:17px;font-weight:650;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.body-relax button:focus:not(:focus-visible){outline:none}.body-relax button:focus-visible{outline:3px solid #48775c;outline-offset:3px}.body-relax button:active{transform:none}.body-relax button:disabled{opacity:.65;cursor:wait}
.body-head{position:absolute;top:16px;left:24px;right:24px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px}.body-head h1{font-size:21px;font-weight:600;margin:0}.body-head button{background:transparent}.body-head button:first-child{justify-self:start}.body-head button:last-child{justify-self:end}
.body-main{position:absolute;inset:20% 7% 31% 51%;display:flex;align-items:center}.body-copy{width:100%;max-width:620px}.body-copy h2{font-size:clamp(30px,3vw,42px);font-weight:650;line-height:1.5;letter-spacing:.02em;margin:0 0 20px}.body-copy p{font-size:21px;line-height:1.85;margin:0;max-width:26em}
.body-footer{position:absolute;left:51%;right:7%;bottom:13%;display:grid;grid-template-columns:1fr auto auto;gap:18px 14px;align-items:center}.body-timing{display:flex;gap:12px;align-items:baseline;grid-column:1/-1}.body-timing b{font-size:19px;font-weight:550;font-variant-numeric:tabular-nums}.body-timing span{font-size:13px;color:#506653}.body-progress{grid-column:1/-1;height:3px;background:#cbd7c37a;border-radius:5px;overflow:hidden;margin-top:-10px;margin-bottom:10px}.body-progress i{display:block;height:100%;background:#6a8b60}.body-sound{grid-column:2;grid-row:3;font-size:15px!important;background:transparent!important}.body-relax .body-primary{grid-column:1;grid-row:3;background:#466e50;color:white;min-width:150px}.body-footer>button:last-child:not(.body-primary):not(.body-sound){grid-column:3;grid-row:3}.body-relax--finished .body-footer{display:flex;flex-wrap:wrap}.body-error{position:absolute;bottom:100%;margin:0 0 14px;color:#813e2e;font-size:16px}
@media(max-height:680px){.body-head{top:10px;left:18px;right:18px}.body-head h1{font-size:20px}.body-main{inset:20% 6% 34% 50%}.body-copy h2{font-size:30px;margin-bottom:16px}.body-copy p{font-size:18px}.body-footer{left:50%;right:6%;bottom:12%;gap:14px 10px}.body-relax button{padding:0 16px;font-size:16px}.body-relax .body-primary{min-width:130px}}
@media(max-width:700px){.body-relax:before{background:#f5f7ebd4}.body-head{left:8px;right:8px;gap:5px}.body-head h1{font-size:17px}.body-head button{padding:0 8px;font-size:14px}.body-main{inset:20% 8% 36%}.body-copy h2{font-size:30px}.body-copy p{font-size:18px}.body-footer{left:8%;right:8%;bottom:12%}.body-relax .body-primary{min-width:120px}}
@media(max-height:440px){.body-relax{min-height:440px;position:absolute}}
</style>
