<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const emit = defineEmits<{ close: [] }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const started = ref(false)
const finished = ref(false)
const score = ref(0)
const selectedDuration = ref(60)
const remainingSeconds = ref(60)
const feedback = ref('')
const resultMessage = computed(() => score.value >= 25 ? '手感真棒，果园收获满满！' : score.value >= 10 ? '不错，收集到了不少清新。' : score.value > 0 ? '轻轻松松，完成了一轮小练习。' : '慢慢来，每次挥动都是给自己的放松。')

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
      vy: -(390 + Math.random() * 120),
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
  const now = Date.now()
  comboCount = now - lastSliceAt < 900 ? comboCount + 1 : 1
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
  if (!started.value) return
  event.preventDefault()
  canvasRef.value?.setPointerCapture(event.pointerId)
  pointerHeld = true
  lastPoint = getPointerPoint(event)
  trail.push({ ...lastPoint })
}

function onPointerMove(event: PointerEvent) {
  if (!pointerHeld || !started.value) return
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
  const delta = Math.min(.04, previousFrame ? (now - previousFrame) / 1000 : 0)
  previousFrame = now
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#f2f7ec'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(155,191,141,.13)'
  for (let i = 0; i < 7; i += 1) {
    const x = (i * 197 + 70) % Math.max(width, 1)
    const y = (i * 113 + 40) % Math.max(height, 1)
    ctx.beginPath()
    ctx.ellipse(x, y, 25, 9, -.65, 0, Math.PI * 2)
    ctx.fill()
  }
  if (started.value) {
    const nextRemaining = Math.max(0, Math.ceil((gameDeadline - Date.now()) / 1000))
    if (nextRemaining !== remainingSeconds.value) remainingSeconds.value = nextRemaining
    if (nextRemaining === 0) {
      started.value = false
      finished.value = true
    }
  }
  if (started.value) {
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
  fruits.length = 0
  sparks.length = 0
  trail.length = 0
  score.value = 0
  feedback.value = ''
  comboCount = 0
  lastSliceAt = 0
  spawnClock = .8
  remainingSeconds.value = selectedDuration.value
  gameDeadline = Date.now() + selectedDuration.value * 1000
  finished.value = false
  started.value = true
}

onMounted(() => {
  resizeCanvas()
  if (canvasRef.value) {
    resizeObserver = new ResizeObserver(resizeCanvas)
    resizeObserver.observe(canvasRef.value)
  }
  frame = requestAnimationFrame(draw)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  resizeObserver?.disconnect()
})
</script>

<template>
  <Teleport to="body">
    <section class="relax-game" role="dialog" aria-modal="true" aria-label="轻挥果园解压小游戏">
      <header class="relax-game__header">
        <button class="relax-game__back" @click="emit('close')">‹ <span>返回情绪放松</span></button>
        <div class="relax-game__title"><small>轻松玩一会</small><h1>轻挥果园</h1></div>
        <div class="relax-game__score" aria-live="polite"><span>{{ started ? '剩余时间' : '收集水果' }}</span><b>{{ started ? `${remainingSeconds}秒` : score }}</b></div>
      </header>
      <main class="relax-game__play">
        <canvas ref="canvasRef" class="relax-game__canvas" aria-label="用手指划过飘起的水果来收集它们" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp" />
        <div v-if="!started && !finished" class="relax-game__welcome">
          <span class="relax-game__fruit" aria-hidden="true">🍊</span>
          <p class="relax-game__eyebrow">慢一点，也没关系</p>
          <h2>轻轻划过飘来的水果</h2>
          <p>选择一段轻松时长，跟着自己的节奏挥动手指。水果漏掉也没关系，没有失误惩罚。</p>
          <div class="relax-game__durations" role="group" aria-label="选择游戏时长">
            <button v-for="duration in [30,60,90]" :key="duration" :aria-pressed="selectedDuration===duration" :class="{selected:selectedDuration===duration}" @click="selectedDuration=duration">{{ duration }} 秒</button>
          </div>
          <button @click="startGame">开始轻挥</button>
        </div>
        <div v-if="finished" class="relax-game__welcome relax-game__welcome--finished">
          <span class="relax-game__fruit" aria-hidden="true">🌿</span>
          <p class="relax-game__eyebrow">本轮战绩</p>
          <h2>收集了 {{ score }} 个水果</h2>
          <p class="relax-game__result-time">用时 {{ selectedDuration }} 秒</p>
          <p>{{ resultMessage }} 想再玩一轮，或者回到其他放松练习都可以。</p>
          <button @click="startGame">再玩一轮 · {{ selectedDuration }} 秒</button>
        </div>
        <p v-if="started" class="relax-game__hint" aria-live="polite">轻轻划过水果　·　已收集 {{ score }} 个</p>
        <p v-if="started && feedback" class="relax-game__feedback" aria-live="polite">{{ feedback }}</p>
      </main>
      <footer class="relax-game__footer">
        <span>{{ started ? '水果漏掉也没关系，按自己的节奏玩。' : '每轮可选 30、60 或 90 秒。' }}</span>
        <button v-if="started" class="relax-game__restart" @click="startGame">重新开始</button>
        <button class="relax-game__exit" @click="emit('close')">结束游戏</button>
      </footer>
    </section>
  </Teleport>
</template>

<style scoped>
.relax-game{position:fixed;z-index:2000;inset:0;display:grid;grid-template-rows:92px minmax(0,1fr) 72px;overflow:hidden;background:#f6f8f1;color:#284638;font-family:"Microsoft YaHei UI","PingFang SC",sans-serif}
.relax-game__header{z-index:2;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:0 clamp(22px,4vw,58px);background:rgba(255,255,255,.94);box-shadow:0 5px 18px rgba(46,74,54,.06)}
.relax-game__back{justify-self:start;min-height:46px;padding:0 16px;border:0;border-radius:14px;background:#edf3e9;color:#41654c;font-size:22px;font-weight:700}
.relax-game__back span{font-size:14px}
.relax-game__title{text-align:center}
.relax-game__title small{color:#78917c;font-size:12px}
.relax-game__title h1{margin:1px 0 0;color:#2d553e;font-size:24px}
.relax-game__score{justify-self:end;display:flex;align-items:center;gap:10px;color:#668071;font-size:14px}
.relax-game__score b{display:grid;min-width:72px;height:40px;padding:0 8px;place-items:center;white-space:nowrap;border-radius:14px;background:#e4f0dc;color:#46734e;font-size:18px}
.relax-game__play{position:relative;min-height:0;overflow:hidden;background:#f2f7ec}
.relax-game__canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}
.relax-game__welcome{position:absolute;top:50%;left:50%;display:grid;justify-items:center;width:min(520px,calc(100% - 36px));padding:28px 38px 32px;transform:translate(-50%,-50%);border:1px solid rgba(255,255,255,.78);border-radius:30px;background:rgba(255,255,255,.86);box-shadow:0 20px 55px rgba(52,91,61,.11);text-align:center;backdrop-filter:blur(10px);pointer-events:none}
.relax-game__fruit{display:grid;width:72px;height:72px;place-items:center;border-radius:24px;background:#fff2dc;font-size:42px}
.relax-game__eyebrow{margin:16px 0 0;color:#719171;font-size:13px;font-weight:700}
.relax-game__welcome h2{margin:5px 0 0;color:#31553c;font-size:25px}
.relax-game__welcome>p:not(.relax-game__eyebrow){max-width:410px;margin:10px 0 0;color:#66786a;font-size:15px;line-height:1.7}
.relax-game__durations{display:flex;gap:10px;margin-top:19px;pointer-events:auto}
.relax-game__durations button{min-width:88px;min-height:40px;margin:0;border:1px solid #dce8d7;border-radius:13px;background:#f4f7ef;color:#56705b;font-size:14px;font-weight:700}
.relax-game__durations button.selected{border-color:#4d8b68;background:#4d8b68;color:#fff;box-shadow:0 5px 12px rgba(77,139,104,.16)}
.relax-game__welcome>button{min-width:170px;min-height:50px;margin-top:20px;border:0;border-radius:16px;background:#4d8b68;color:#fff;font-size:16px;font-weight:750;box-shadow:0 8px 18px rgba(77,139,104,.18);pointer-events:auto}
.relax-game__welcome--finished .relax-game__fruit{background:#e8f1de}
.relax-game__result-time{margin-top:5px!important;color:#4f8060!important;font-weight:750}
.relax-game__hint{position:absolute;top:22px;left:50%;margin:0;padding:10px 18px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,255,255,.78);color:#4d7257;font-size:14px;pointer-events:none;backdrop-filter:blur(8px)}
.relax-game__feedback{position:absolute;top:75px;left:50%;margin:0;padding:9px 16px;transform:translateX(-50%);border-radius:999px;background:#fff3d9;color:#8a6834;font-size:14px;font-weight:750;box-shadow:0 6px 18px rgba(91,78,47,.1);pointer-events:none;animation:fruit-feedback-in .18s ease-out}
@keyframes fruit-feedback-in{from{opacity:0;translate:0 -5px}to{opacity:1;translate:0 0}}
.relax-game__footer{z-index:2;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 clamp(22px,4vw,58px);background:#fff}
.relax-game__footer>span{margin-right:auto;color:#7a887c;font-size:13px}
.relax-game__footer button{min-height:42px;padding:0 18px;border:0;border-radius:13px;font-size:14px;font-weight:700}
.relax-game__restart{background:#edf3e9;color:#4d7257}
.relax-game__exit{background:#4d8060;color:#fff}
@media (max-width:760px),(orientation:portrait){
  .relax-game{grid-template-rows:76px minmax(0,1fr) 66px}
  .relax-game__header{gap:8px;padding:0 12px}
  .relax-game__back{min-height:40px;padding:0 10px;font-size:19px}
  .relax-game__back span{font-size:11px}
  .relax-game__title h1{font-size:19px}
  .relax-game__title small{font-size:10px}
  .relax-game__score{gap:5px;font-size:11px}
  .relax-game__score b{min-width:56px;height:34px;font-size:14px}
  .relax-game__welcome{padding:22px 20px 25px}
  .relax-game__welcome h2{font-size:21px}
  .relax-game__welcome>p:not(.relax-game__eyebrow){font-size:14px}
  .relax-game__feedback{top:64px;font-size:12px}
  .relax-game__durations{gap:7px;margin-top:14px}
  .relax-game__durations button{min-width:72px;min-height:38px;font-size:12px}
  .relax-game__footer{gap:7px;padding:0 10px}
  .relax-game__footer>span{font-size:10px}
  .relax-game__footer button{min-height:38px;padding:0 10px;font-size:12px}
}
</style>
