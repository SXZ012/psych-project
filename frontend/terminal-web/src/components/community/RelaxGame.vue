<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ close: []; home: [] }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const finished = ref(false)
const paused = ref(false)
const score = ref(0)
const selectedDuration = ref(60)
const remainingSeconds = ref(60)
const feedback = ref('')
const bestCombo=ref(0)
const playedSeconds=computed(()=>selectedDuration.value-remainingSeconds.value)
function endRound() {
  remainingSeconds.value = Math.max(0, Math.ceil((paused.value ? pausedRemaining : gameDeadline-performance.now())/1000))
  started.value=false; finished.value=true; paused.value=false
  pointerHeld=false; lastPoint=undefined
  fruits.length=0; sparks.length=0; trail.length=0
  if(feedbackTimeout) clearTimeout(feedbackTimeout)
  feedback.value=''
}
const resultMessage = computed(() => score.value >= 25 ? '收获满满，挥得漂亮。' : score.value >= 10 ? '这一篮水果，收得真不错。' : score.value > 0 ? '收获一点轻松，按自己的节奏就好。' : '歇一会儿，想玩时再来。')

type Fruit = { x:number; y:number; vx:number; vy:number; radius:number; color:string; leaf:number; sliced:boolean }
type Spark = { x:number; y:number; vx:number; vy:number; radius:number; color:string; life:number; maxLife:number }
type Point = { x:number; y:number; life:number }
const fruits: Fruit[] = []
const sparks: Spark[] = []
const trail: Point[] = []
const fruitColors = ['#f18b67','#f2b955','#79b982','#e887a2','#8bb8d6','#cf91c6']
let frame = 0
let previousFrame = 0
let spawnClock = 0
let gameDeadline = 0
let pausedRemaining = 0
let lastSliceAt = 0
let comboCount = 0
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined
let resizeObserver: ResizeObserver | undefined
let pointerHeld = false
let lastPoint: Point | undefined
let width = 0
let height = 0
let pixelRatio = 1
let context: CanvasRenderingContext2D | null = null

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const bounds = canvas.getBoundingClientRect()
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  width = bounds.width
  height = bounds.height
  canvas.width = Math.round(width * pixelRatio)
  canvas.height = Math.round(height * pixelRatio)
  context = canvas.getContext('2d')
  context?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
}

function launchFruit() {
  const count = Math.random() > .7 ? 3 : 2
  for (let i = 0; i < count; i += 1) {
    const radius = 31 + Math.random() * 13
    fruits.push({
      x: radius + 20 + Math.random() * Math.max(1, width - radius * 2 - 40),
      y: height + radius + Math.random() * 30,
      vx: (Math.random() - .5) * 105,
      vy: -Math.sqrt(720 * Math.max(110, height * (.55 + Math.random() * .2))),
      radius,
      color: fruitColors[Math.floor(Math.random() * fruitColors.length)]!,
      leaf: Math.random() * .7 - .35,
      sliced: false,
    })
  }
}

function drawFruit(ctx: CanvasRenderingContext2D, fruit: Fruit) {
  const { x, y, radius } = fruit
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(fruit.leaf)
  ctx.shadowColor = 'rgba(67,105,77,.16)'
  ctx.shadowBlur = 14
  ctx.shadowOffsetY = 7
  const gradient = ctx.createRadialGradient(-radius * .35, -radius * .42, 2, 0, 0, radius * 1.2)
  gradient.addColorStop(0, '#fff4d7')
  gradient.addColorStop(.23, fruit.color)
  gradient.addColorStop(1, fruit.color)
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(0, 0, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = 'rgba(255,255,255,.45)'
  ctx.beginPath()
  ctx.ellipse(-radius * .35, -radius * .32, radius * .19, radius * .31, -.55, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#668d5f'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0, -radius + 2)
  ctx.quadraticCurveTo(4, -radius - 9, 9, -radius - 11)
  ctx.stroke()
  ctx.fillStyle = '#78a96e'
  ctx.beginPath()
  ctx.ellipse(11, -radius - 8, 9, 4, -.45, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function makeSparks(fruit: Fruit) {
  for (let i = 0; i < 10; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 55 + Math.random() * 190
    sparks.push({ x:fruit.x, y:fruit.y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-45, radius:3+Math.random()*5, color:fruit.color, life:.65+Math.random()*.4, maxLife:1 })
  }
  score.value += 1
  const now = performance.now()
  comboCount = now - lastSliceAt < 900 ? comboCount + 1 : 1
  bestCombo.value=Math.max(bestCombo.value,comboCount)
  lastSliceAt = now
  feedback.value = comboCount >= 3 ? `连续收集 ${comboCount} 个，太棒了！` : '挥得漂亮，+1'
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  feedbackTimeout = setTimeout(() => { feedback.value = '' }, 950)
}

function pointToSegmentDistance(px:number, py:number, ax:number, ay:number, bx:number, by:number) {
  const dx = bx - ax
  const dy = by - ay
  const length = dx * dx + dy * dy
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function sliceAlong(a:Point, b:Point) {
  for (const fruit of fruits) {
    if (!fruit.sliced && pointToSegmentDistance(fruit.x, fruit.y, a.x, a.y, b.x, b.y) < fruit.radius + 7) {
      fruit.sliced = true
      makeSparks(fruit)
    }
  }
}

function getPointerPoint(event: PointerEvent): Point {
  const bounds = canvasRef.value!.getBoundingClientRect()
  return { x:event.clientX-bounds.left, y:event.clientY-bounds.top, life:.22 }
}

function onPointerDown(event: PointerEvent) {
  if (!started.value || paused.value) return
  event.preventDefault()
  canvasRef.value?.setPointerCapture(event.pointerId)
  pointerHeld = true
  lastPoint = getPointerPoint(event)
  trail.push({ ...lastPoint })
  sliceAlong(lastPoint, lastPoint)
}

function onPointerMove(event: PointerEvent) {
  if (!pointerHeld || !started.value || paused.value) return
  event.preventDefault()
  const point = getPointerPoint(event)
  if (lastPoint) sliceAlong(lastPoint, point)
  trail.push({ ...point })
  lastPoint = point
}

function onPointerUp() {
  pointerHeld = false
  lastPoint = undefined
}

function draw(now:number) {
  const ctx = context
  if (!ctx || !width || !height) {
    frame = requestAnimationFrame(draw)
    return
  }
  const delta = paused.value ? 0 : Math.min(.04, previousFrame ? (now - previousFrame) / 1000 : 0)
  previousFrame = now
  ctx.clearRect(0, 0, width, height)
  if (started.value && !paused.value) {
    const nextRemaining = Math.max(0, Math.ceil((gameDeadline - performance.now()) / 1000))
    if (nextRemaining !== remainingSeconds.value) remainingSeconds.value = nextRemaining
    if (nextRemaining === 0) {
      endRound()
    }
  }
  if (started.value && !paused.value) {
    spawnClock += delta
    if (spawnClock > 1.05) {
      spawnClock = 0
      launchFruit()
    }
  }
  for (let index = fruits.length - 1; index >= 0; index -= 1) {
    const fruit = fruits[index]!
    if (fruit.sliced) {
      fruits.splice(index, 1)
      continue
    }
    fruit.x += fruit.vx * delta
    fruit.y += fruit.vy * delta
    fruit.vy += 360 * delta
    fruit.leaf += fruit.vx * delta * .002
    drawFruit(ctx, fruit)
    if (fruit.y > height + fruit.radius * 2) fruits.splice(index, 1)
  }
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index]!
    spark.x += spark.vx * delta
    spark.y += spark.vy * delta
    spark.vy += 260 * delta
    spark.life -= delta
    ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife)
    ctx.fillStyle = spark.color
    ctx.beginPath()
    ctx.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    if (spark.life <= 0) sparks.splice(index, 1)
  }
  for (let index = trail.length - 1; index >= 0; index -= 1) {
    trail[index]!.life -= delta
    if (trail[index]!.life <= 0) trail.splice(index, 1)
  }
  if (trail.length > 1) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,.9)'
    ctx.lineWidth = 7
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowColor = 'rgba(105,166,112,.35)'
    ctx.shadowBlur = 12
    ctx.beginPath()
    ctx.moveTo(trail[0]!.x, trail[0]!.y)
    for (const point of trail.slice(1)) ctx.lineTo(point.x, point.y)
    ctx.stroke()
    ctx.restore()
  }
  frame = requestAnimationFrame(draw)
}

function startGame() {
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  fruits.length = 0
  sparks.length = 0
  trail.length = 0
  score.value = 0
  bestCombo.value = 0
  feedback.value = ''
  comboCount = 0
  lastSliceAt = 0
  spawnClock = .8
  remainingSeconds.value = selectedDuration.value
  gameDeadline = performance.now() + selectedDuration.value * 1000
  paused.value = false
  pointerHeld = false
  lastPoint = undefined
  previousFrame = 0
  finished.value = false
  started.value = true
}

function pauseGame() {
  if(!started.value || paused.value) return
  pausedRemaining = Math.max(0, gameDeadline-performance.now())
  if(pausedRemaining === 0) { endRound(); return }
  remainingSeconds.value = Math.ceil(pausedRemaining/1000)
  paused.value = true
  onPointerUp()
  trail.length=0
  feedback.value=''
}
function resumeGame() {
  gameDeadline = performance.now()+pausedRemaining
  previousFrame=0
  paused.value=false
}
function hidden() { if(document.hidden) pauseGame() }

onMounted(() => {
  document.addEventListener('visibilitychange', hidden)
  resizeCanvas()
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvasRef.value)
  }
  frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', hidden)
  cancelAnimationFrame(frame)
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  resizeObserver?.disconnect()
})
</script>

<template>
  <Teleport to="body">
    <section class="orchard" :class="{ 'orchard--playing': started, 'orchard--paused': paused }" aria-label="轻挥果园">
      <div class="orchard-landscape" aria-hidden="true"><i /><i /></div>
      <header class="orchard-header">
        <NavigationButton @click="emit('close')">返回情绪放松</NavigationButton>
        <h1>轻挥果园</h1>
        <NavigationButton @click="emit('home')">返回首页</NavigationButton>
      </header>
      <main class="orchard-main">
        <canvas ref="canvasRef" class="orchard-canvas" :class="{ 'orchard-canvas--inactive': !started }" aria-label="轻点或划过水果即可收集" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" @lostpointercapture="onPointerUp" />
        <section v-if="!started" class="orchard-center">
          <svg class="orchard-art" viewBox="0 0 240 135" aria-hidden="true">
            <ellipse cx="120" cy="119" rx="91" ry="8" fill="#bbc99b" opacity=".18" />
            <g transform="translate(56 79) rotate(-14)"><circle r="32" fill="#a7c583"/><ellipse cx="-10" cy="-10" rx="7" ry="11" fill="#dbeac4"/><path d="M0-30q-2-14 10-18" fill="none" stroke="#6a8050" stroke-width="4" stroke-linecap="round"/><ellipse cx="-9" cy="-36" rx="13" ry="6" fill="#779b5c" transform="rotate(20)"/></g>
            <g transform="translate(182 80) rotate(15)"><circle r="30" fill="#edb365"/><ellipse cx="-9" cy="-10" rx="7" ry="10" fill="#fbe0a8"/><path d="M0-28q0-12 7-16" fill="none" stroke="#7e8350" stroke-width="4" stroke-linecap="round"/><ellipse cx="10" cy="-33" rx="12" ry="5" fill="#88a768" transform="rotate(-15)"/></g>
            <g transform="translate(120 68)"><circle r="45" fill="#ee9965"/><ellipse cx="-16" cy="-15" rx="9" ry="15" fill="#ffd6a0" transform="rotate(-20)"/><path d="M0-42q-3-11 5-17" fill="none" stroke="#73814e" stroke-width="5" stroke-linecap="round"/><ellipse cx="16" cy="-48" rx="17" ry="7" fill="#85a568" transform="rotate(-14)"/></g>
          </svg>
          <template v-if="!finished">
            <h2>轻轻一挥，收获一点轻松</h2>
            <p>划过水果即可收集，漏掉也没关系。</p>
            <div class="orchard-durations" role="group" aria-label="选择游戏时长">
              <button v-for="duration in [30,60,90]" :key="duration" :aria-pressed="selectedDuration===duration" @click="selectedDuration=duration">{{ duration }} 秒</button>
            </div>
            <button class="orchard-primary orchard-start" @click="startGame">开始轻挥</button>
          </template>
          <template v-else>
            <h2>收集了 <strong>{{ score }}</strong> 个水果</h2>
            <p>{{ resultMessage }}</p>
            <div class="orchard-stats"><span>用时 <b>{{ playedSeconds }}</b> 秒</span><i /><span>最高连击 <b>{{ bestCombo }}</b> 个</span></div>
            <div class="orchard-result-actions"><button @click="finished=false">调整时长</button><button class="orchard-primary" @click="startGame">再玩一轮</button></div>
          </template>
        </section>
        <template v-else>
          <div class="orchard-hud" aria-label="本轮进度"><span>收集 <b>{{ score }}</b> 个</span><i /><span :class="{ 'orchard-final-seconds':remainingSeconds<=5 }">剩余 <b>{{ remainingSeconds }}</b> 秒</span></div>
          <p v-if="!paused" class="orchard-feedback" role="status">{{ remainingSeconds<=5 ? '这一轮快结束了，最后轻挥几下' : feedback }}</p>
          <section v-if="paused" class="orchard-pause"><h2>歇一会儿</h2><p>准备好了，再接着玩。</p><button class="orchard-primary" @click="resumeGame">继续轻挥</button></section>
        </template>
      </main>
      <footer v-if="started" class="orchard-controls"><button v-if="!paused" @click="pauseGame">暂停一下</button><button @click="endRound">结束本轮</button></footer>
    </section>
  </Teleport>
</template>

<style scoped>
.orchard{position:fixed;inset:0;z-index:2000;isolation:isolate;overflow:hidden;background:radial-gradient(ellipse at 50% 32%,#fffdf1 0%,#f8f7e9 55%,#edf2df 100%);color:#304c38;font-family:inherit;display:grid;grid-template-rows:80px minmax(0,1fr) 80px}
.orchard *{box-sizing:border-box}.orchard button{min-height:52px;padding:0 24px;border:0;border-radius:28px;background:#ffffff87;color:#36583e;font:inherit;font-size:17px;font-weight:650;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}.orchard button:active{transform:none}.orchard button:focus:not(:focus-visible){outline:none}.orchard button:focus-visible{outline:3px solid #49724d;outline-offset:4px}.orchard .orchard-primary{background:#497453;color:white;min-width:190px}.orchard-landscape{position:absolute;inset:0;overflow:hidden;z-index:-1;pointer-events:none}.orchard-landscape i{position:absolute;width:86%;height:28%;bottom:-19%;left:-14%;border-radius:50%;background:#c8d8ad66;transform:rotate(5deg)}.orchard-landscape i:last-child{left:auto;right:-14%;bottom:-21%;background:#b5cda14a;transform:rotate(-7deg)}
.orchard-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:14px;padding:12px 24px}.orchard-header h1{margin:0;font-size:22px;font-weight:600}.orchard-header button{background:transparent}.orchard-header button:first-child{justify-self:start}.orchard-header button:last-child{justify-self:end}
.orchard-main{position:relative;min-height:0}.orchard-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}.orchard-canvas--inactive{visibility:hidden;pointer-events:none}.orchard-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px 28px;text-align:center;overflow:auto}.orchard-art{width:220px;height:124px;flex-shrink:0;margin-bottom:12px}.orchard-center h2,.orchard-pause h2{margin:0;color:#304c38;font-size:clamp(28px,2.8vw,38px);font-weight:650;line-height:1.4}.orchard-center h2 strong{font-size:1.25em;font-weight:700;color:#497453}.orchard-center>p,.orchard-pause p{font-size:19px;line-height:1.6;margin:14px 0 0;color:#576c50}.orchard-durations{display:flex;gap:10px;margin-top:28px}.orchard-durations button{min-width:108px;background:#e6ecd9}.orchard-durations button[aria-pressed=true]{background:#d4e2bc;color:#2d5431;box-shadow:inset 0 0 0 2px #82a36c}.orchard .orchard-start{margin-top:20px;min-width:240px;min-height:56px}.orchard-stats{display:flex;align-items:center;justify-content:center;gap:25px;font-size:17px;color:#576c50;margin-top:25px}.orchard-stats b{font-size:22px;color:#355b3e;font-weight:650}.orchard-stats i,.orchard-hud i{width:1px;height:20px;background:#bdc9ac}.orchard-result-actions{display:flex;gap:14px;margin-top:26px}
.orchard-hud{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:24px;white-space:nowrap;pointer-events:none;font-size:18px;color:#506646}.orchard-hud b{font-size:28px;color:#304c38;display:inline-block;min-width:35px;text-align:center;font-variant-numeric:tabular-nums}.orchard-hud .orchard-final-seconds,.orchard-hud .orchard-final-seconds b{color:#92612f}.orchard-feedback{position:absolute;top:60px;left:20px;right:20px;text-align:center;pointer-events:none;font-size:18px;font-weight:600;color:#7c6535;min-height:28px;margin:0}.orchard-controls{grid-row:3;display:flex;justify-content:center;align-items:center;gap:18px;padding:10px 20px}.orchard-controls button{background:#ffffff80;min-width:126px}.orchard-pause{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;background:transparent;text-align:center}.orchard-pause button{margin-top:25px}.orchard--paused .orchard-canvas{opacity:.12}.orchard--paused .orchard-hud{visibility:hidden}
@media(max-height:680px){.orchard{grid-template-rows:68px minmax(0,1fr) 64px}.orchard-header{padding:8px 24px}.orchard-header h1{font-size:21px}.orchard-art{width:170px;height:96px;margin-bottom:8px}.orchard-center h2,.orchard-pause h2{font-size:29px}.orchard-center>p{font-size:18px;margin-top:10px}.orchard-durations{margin-top:20px}.orchard .orchard-start{margin-top:18px;min-height:52px}.orchard-result-actions,.orchard-stats{margin-top:20px}.orchard-hud{top:8px}.orchard-feedback{top:48px}.orchard-center{padding:8px 24px}.orchard button{font-size:16px}}
@media(max-width:700px){.orchard-header{padding:8px 10px;gap:6px}.orchard-header h1{font-size:18px}.orchard-header button{font-size:14px;padding:0 8px}.orchard-center{padding:12px 18px}.orchard-center h2{font-size:26px}.orchard-center>p{font-size:16px}.orchard-durations{gap:8px}.orchard-durations button{min-width:86px;padding:0 16px}.orchard-art{width:180px;height:100px}.orchard-result-actions{gap:10px}.orchard-result-actions button{padding:0 18px;min-width:120px}.orchard-hud{font-size:16px;gap:18px}.orchard-stats{font-size:15px;gap:18px}}
@media(max-height:460px){.orchard-center{justify-content:flex-start}.orchard-art{height:64px;width:115px}.orchard-center h2{font-size:24px}.orchard-center>p{margin-top:6px}.orchard-durations{margin-top:10px}.orchard .orchard-start{margin-top:10px}}
</style>
