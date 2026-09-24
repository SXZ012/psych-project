<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { COMMUNITY_STAGE_MS, OPENING_FRAMES } from '@/config/community/content'

const emit = defineEmits<{ done: [] }>()
const frame = ref(0)
const videoState = ref<'loading' | 'playing' | 'failed'>('loading')
const videoEl = ref<HTMLVideoElement | null>(null)
const showCover = ref(true)
let frameTimer: number | null = null
let doneTimer: number | null = null
let loadTimer: number | null = null
let fallbackNarration: HTMLAudioElement | null = null
let doneScheduled = false
let finishEmitted = false

const VIDEO_URL = '/static/assets/community/intro-production/output/community-mental-health-original-60s.mp4'
const COVER_PHOTO = OPENING_FRAMES[0].photo // 与首帧风格一致的封面

function startFrameFallback() {
  if (frameTimer) window.clearInterval(frameTimer)
  const per = COMMUNITY_STAGE_MS.opening / OPENING_FRAMES.length
  frameTimer = window.setInterval(() => {
    if (frame.value < OPENING_FRAMES.length - 1) frame.value += 1
  }, per)
}

function startNarration() {
  fallbackNarration?.play().catch(() => undefined)
}

function startCaptionTimeline() {
  if (frameTimer) window.clearInterval(frameTimer)
  const per = COMMUNITY_STAGE_MS.opening / OPENING_FRAMES.length
  frameTimer = window.setInterval(() => {
    if (frame.value < OPENING_FRAMES.length - 1) frame.value += 1
  }, per)
}

function scheduleDone() {
  if (doneScheduled) return
  doneScheduled = true
  // 开场短片统一 10 秒封顶（视频素材本身约 60 秒，到点即进下一阶段），
  // 用户也随时可以点“跳过”立即结束。
  doneTimer = window.setTimeout(() => finishOpening(), COMMUNITY_STAGE_MS.opening)
}

/** 结束开场（自然到时 / 视频提前播完 / 用户跳过共用出口，幂等） */
function finishOpening() {
  if (frameTimer) { window.clearInterval(frameTimer); frameTimer = null }
  if (doneTimer) { window.clearTimeout(doneTimer); doneTimer = null }
  fallbackNarration?.pause()
  if (videoEl.value) { try { videoEl.value.pause() } catch { /* 忽略 */ } }
  if (doneScheduled && !finishEmitted) { finishEmitted = true; emit('done') }
  doneScheduled = true
}

onMounted(() => {
  // 与航空同款音色的中文旁白，预生成并随社区素材离线部署。
  try {
    fallbackNarration = new Audio('/static/assets/community/audio/cm-psychology-intro.mp3')
    fallbackNarration.volume = 0.9
    fallbackNarration.preload = 'auto'
    fallbackNarration.load()
  } catch { /* 静默 */ }

  const video = videoEl.value
  scheduleDone()   // 无论视频还是照片降级，10 秒封顶

  if (!video) {
    videoState.value = 'failed'; startFrameFallback(); startNarration()
    return
  }

  video.preload = 'auto'

  const onCanPlay = () => {
    if (videoState.value !== 'loading') return
    if (loadTimer) window.clearTimeout(loadTimer)
    loadTimer = null
    videoState.value = 'playing'
    // 真正开始播放后才淡出封面
    void video.play().then(() => {
      // 多等一拍再揭视频层：避开 WebView 视频层刚合成时的尺寸瞬变（曾出现半屏闪烁）
      window.setTimeout(() => {
        showCover.value = false
        startCaptionTimeline()
      }, 900)
    }).catch(() => {
      videoState.value = 'failed'; startFrameFallback(); startNarration()
    })
  }
  const onError = () => {
    if (videoState.value !== 'loading') return
    if (loadTimer) window.clearTimeout(loadTimer)
    loadTimer = null
    videoState.value = 'failed'; startFrameFallback(); startNarration()
  }

  video.addEventListener('canplay', onCanPlay, { once: true })
  video.addEventListener('error', onError, { once: true })
  video.load()

  // 兜底：如果 canplay 3 秒还没触发，走照片降级
  loadTimer = window.setTimeout(() => {
    if (videoState.value === 'loading') {
      videoState.value = 'failed'; startFrameFallback(); startNarration()
    }
  }, 3000)

  // 视频若短于 10 秒提前自然结束，直接收尾；长视频由 10 秒封顶裁断。
  video.addEventListener('ended', () => finishOpening(), { once: true })
})

onBeforeUnmount(() => {
  if (frameTimer) window.clearInterval(frameTimer)
  if (doneTimer) window.clearTimeout(doneTimer)
  if (loadTimer) window.clearTimeout(loadTimer)
  fallbackNarration?.pause()
})
</script>

<template>
  <main class="terminal-shell co-shell">
    <!-- 封面图：始终存在，视频就绪后淡出 -->
    <div class="co-cover" :class="{ hiding: !showCover }" :style="{ backgroundImage: `url(${COVER_PHOTO})` }" />
    <div class="co-cover-veil" :class="{ hiding: !showCover }" />

    <!-- 视频（加载中隐藏） -->
    <video
      v-show="videoState === 'playing' && !showCover"
      ref="videoEl"
      class="co-video" autoplay playsinline preload="auto"
      :src="VIDEO_URL"
    />

    <!-- 跳过按钮：开场阶段必须可跳过（需求四） -->
    <button class="co-skip" @click="finishOpening">跳过 ›</button>

    <!-- 照片降级 -->
    <div v-if="videoState === 'failed'" class="co-frames">
      <div v-for="(f, i) in OPENING_FRAMES" :key="f.photo" class="co-frame" :class="{ active: i === frame }"
        :style="{ backgroundImage: `url(${f.photo})`, '--zoom': f.zoom }" />
      <div class="co-veil" />
    </div>

    <section v-if="videoState === 'failed'" class="co-copy">
      <transition name="fade" mode="out-in">
        <h1 v-if="OPENING_FRAMES[frame]?.caption" :key="frame">{{ OPENING_FRAMES[frame].caption }}</h1>
      </transition>
      <div class="co-dots">
        <i v-for="(f, i) in OPENING_FRAMES" :key="i" :class="{ active: i <= frame }" />
      </div>
    </section>
  </main>
</template>

<style scoped>
.co-shell{overflow:hidden;padding:0;margin:0;display:block;line-height:0;background:#000}
.co-skip{position:absolute;z-index:9;right:22px;bottom:22px;min-height:46px;padding:0 22px;border:1px solid rgba(255,255,255,.5);border-radius:999px;background:rgba(9,26,21,.5);backdrop-filter:blur(8px);color:#eaf5f0;font-size:15px;font-weight:650;letter-spacing:.06em;touch-action:manipulation}
.co-skip:active{background:rgba(9,26,21,.72)}
.co-cover{position:absolute;top:0;left:0;right:0;bottom:0;z-index:3;background-size:cover;background-position:center;transition:opacity 1.2s ease}
.co-cover.hiding{opacity:0;pointer-events:none}
.co-cover-veil{position:absolute;top:0;left:0;right:0;bottom:0;z-index:4;background:linear-gradient(180deg,#0a120e20 0%,#0a120e10 45%,#0a120e80 100%);transition:opacity 1.2s ease}
.co-cover-veil.hiding{opacity:0;pointer-events:none}
.co-video{position:absolute;top:0;left:0;z-index:2;width:100vw;height:100vh;min-width:100%;min-height:100%;object-fit:cover;display:block;border:0;padding:0;margin:0}
.co-frames,.co-frame{position:absolute;inset:0;z-index:1}
.co-frame{background-size:cover;background-position:center;opacity:0;transition:opacity 1.6s ease;transform:scale(1.02)}
.co-frame.active{opacity:1;animation:coZoom 5.2s ease-out forwards}
@keyframes coZoom{from{transform:scale(1.02)}to{transform:var(--zoom)}}
.co-veil{position:absolute;inset:0;background:linear-gradient(180deg,#0a120e30 0%,#0a120e10 45%,#0a120ec0 100%)}
.co-copy{position:absolute;left:0;right:0;bottom:10%;z-index:5;display:grid;justify-items:center;gap:16px;text-align:center}
.co-copy h1{margin:0;min-height:42px;color:#fff;font-size:32px;font-family:serif;letter-spacing:.08em;text-shadow:0 2px 20px #0009}
.co-dots{display:flex;gap:10px}
.co-dots i{width:36px;height:3px;border-radius:99px;background:#ffffff44;transition:background .8s}
.co-dots i.active{background:#fff}
.fade-enter-active,.fade-leave-active{transition:opacity 1.2s}
.fade-enter-from,.fade-leave-to{opacity:0}
</style>
