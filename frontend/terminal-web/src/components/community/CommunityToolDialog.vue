<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{ kind: 'relax' | 'self' | 'appointment' | 'hotline'; index?: number }>()

type RelaxActivity = { title: string; duration: number; steps: string[]; source: string; audio?: string; stretchSteps?: Array<{ title: string; cue: string }> }
const relaxItems: RelaxActivity[] = [
  { title: '平稳呼吸', duration: 60, steps: ['双脚平放，找一个舒服的坐姿', '跟着提示轻轻吸气 4 秒', '缓缓呼气 6 秒，不必刻意吸深'], source: '如果 4 秒吸气、6 秒呼气让你不舒服，就恢复自然呼吸。' },
  { title: '自然风声', duration: 180, audio: '/static/assets/community/audio/cm-ambience-wind.mp3', steps: ['调到舒适的音量', '听听风声细微的变化', '走神时，再把注意力带回声音'], source: '短暂休息使用；本练习不替代专业心理或睡眠服务。' },
  { title: '肩颈舒展', duration: 120, stretchSteps: [
    { title:'肩膀轻轻向上', cue:'吸气时轻轻耸肩，呼气时自然放下。重复几次，不用用力。' },
    { title:'肩膀向后绕动', cue:'肩膀缓慢向后画小圈，再放松。动作幅度以舒服为准。' },
    { title:'颈侧轻柔伸展', cue:'头部轻轻向一侧倾斜，停留片刻后回正，再换另一侧。不要绕颈。' },
    { title:'回到自然坐姿', cue:'放松肩膀和下巴，轻轻活动手臂，感受身体是否更舒展。' },
  ], steps: ['动作轻柔，不要憋气或追求拉伸幅度', '每一步约 30 秒，可提前进入下一步', '如感到疼痛、眩晕或不适，请立即停止'], source: '如有颈肩损伤或相关疾病，请按医生建议活动。' },
]
type Scale = { title: string; short: string; questions: string[]; levels: Array<[number, string]>; source: string; options?: string[]; optionsByQuestion?: string[][]; scoreMaps?: number[][]; timeframe?: string; resultHint?: string }
const gadQuestions = ['感觉紧张、焦虑或着急', '不能停止或控制担忧', '对各种各样的事情担忧过多', '很难放松下来', '由于不安而无法静坐', '变得容易烦恼或急躁', '感到似乎将有可怕的事情发生而害怕']
const phqQuestions = ['做事时提不起劲或没有兴趣', '感到心情低落、沮丧或绝望', '入睡困难、睡不安稳或睡得过多', '感到疲倦或没有活力', '食欲不振或吃得太多', '觉得自己很糟、很失败，或让自己或家人失望', '对事物专注有困难，例如阅读报纸或看电视时', '行动或说话速度缓慢到别人已经察觉，或相反地比平时更烦躁、坐立不安', '有不如死掉或用某种方式伤害自己的念头']
const scales: Scale[] = [
  { title: 'PHQ-4 情绪快速筛查', short: 'PHQ-4', questions: [...gadQuestions.slice(0, 2), ...phqQuestions.slice(0, 2)], levels: [[2, '无明显困扰'], [5, '轻度困扰'], [8, '中度困扰'], [12, '较重困扰']], source: 'Patient Health Questionnaire-4（PHQ-4）' },
  { title: 'K6 心理困扰筛查', short: 'K6', questions: ['感到紧张不安', '感到绝望', '感到坐立不安或烦躁', '感到情绪低落，什么都不能使你振作', '感到做任何事情都很费力', '感到自己毫无价值'], levels: [[12, '未达到 13 分参考界值'], [24, '达到进一步评估参考界值']], source: 'Kessler Psychological Distress Scale（K6）', options:['从不','很少','有时','多数时间','一直'], timeframe:'回顾过去 30 天', resultHint:'K6 采用 0–24 分计分，13 分及以上是常用的严重心理困扰筛查参考界值；该界值会受具体人群影响，结果不能代替诊断。' },
  { title: 'GAD-2 焦虑快速筛查', short: 'GAD-2', questions: gadQuestions.slice(0, 2), levels: [[2, '未达到进一步筛查参考界值'], [6, '建议进一步完成 GAD-7 评估']], source: 'Generalized Anxiety Disorder-2（GAD-2）' },
  { title: 'GAD-7 焦虑症状筛查', short: 'GAD-7', questions: gadQuestions, levels: [[4, '无或极轻度'], [9, '轻度'], [14, '中度'], [21, '重度']], source: 'Generalized Anxiety Disorder-7（GAD-7）' },
  { title: 'PHQ-2 抑郁快速筛查', short: 'PHQ-2', questions: phqQuestions.slice(0, 2), levels: [[2, '未达到进一步筛查参考界值'], [6, '建议进一步完成 PHQ-9 评估']], source: 'Patient Health Questionnaire-2（PHQ-2）' },
  { title: 'PHQ-9 抑郁症状筛查', short: 'PHQ-9', questions: phqQuestions, levels: [[4, '无或极轻度'], [9, '轻度'], [14, '中度'], [19, '中重度'], [27, '重度']], source: 'Patient Health Questionnaire-9（PHQ-9）' },
  { title: 'PHQ-15 躯体症状筛查', short: 'PHQ-15', questions: ['胃痛', '背痛', '手臂、腿或关节疼痛', '女性月经期间的痛经或其他问题（不适用请选择“没有困扰”）', '头痛', '胸痛', '头晕', '昏厥发作', '感到心脏砰砰跳或心跳加快', '呼吸短促', '性交时疼痛或其他问题', '便秘、腹泻或稀便', '恶心、胀气或消化不良', '感到疲倦或没有精力', '睡眠困难'], levels: [[4, '极轻度'], [9, '轻度'], [14, '中度'], [30, '重度']], source: 'Patient Health Questionnaire-15（PHQ-15）', options:['没有困扰','有一点困扰','非常困扰'], timeframe: '回顾过去四周' },
  { title: 'AUDIT-C 饮酒风险快速筛查', short: 'AUDIT-C', questions: ['你多久喝一次含酒精的饮品？', '在通常喝酒的一天，你会喝多少标准杯？', '你多久会一次喝下 6 杯或更多酒？'], levels: [[2, '低于常用筛查参考界值'], [12, '请对照人群参考界值']], source: 'WHO Alcohol Use Disorders Identification Test（AUDIT-C）', timeframe:'回顾过去一年', optionsByQuestion:[['从不','每月不超过一次','每月 2 至 4 次','每周 2 至 3 次','每周 4 次或更多'],['1 至 2 杯','3 至 4 杯','5 至 6 杯','7 至 9 杯','10 杯或更多'],['从不','少于每月一次','每月一次','每周一次','每天或几乎每天']], resultHint:'AUDIT-C 总分为 0–12 分。常用阳性参考界值为女性 3 分及以上、男性 4 分及以上；若得分仅来自饮酒频率，还应结合实际饮酒量进一步确认。' },
  { title: 'GDS-15 老年情绪筛查', short: 'GDS-15', questions: ['你对自己的生活基本满意吗？', '你是否减少了很多活动和兴趣？', '你是否觉得生活很空虚？', '你是否经常感到无聊？', '你大多数时候心情愉快吗？', '你是否担心会有不好的事情发生？', '你大多数时候感到幸福吗？', '你是否经常觉得无助？', '你是否更愿意待在家里，而不愿外出做新事情？', '你是否觉得自己的记忆问题比多数人严重？', '你是否觉得活着很美好？', '你是否觉得自己现在毫无价值？', '你是否感到精力充沛？', '你是否觉得自己的处境没有希望？', '你是否觉得多数人比你过得好？'], levels:[[4,'正常范围'],[8,'轻度抑郁线索'],[11,'中度抑郁线索'],[15,'重度抑郁线索']], source:'Geriatric Depression Scale-15（GDS-15）', options:['是','否'], scoreMaps:[[0,1],[1,0],[1,0],[1,0],[0,1],[1,0],[0,1],[1,0],[1,0],[1,0],[0,1],[1,0],[0,1],[1,0],[1,0]], timeframe:'回顾最近一周', resultHint:'本量表面向老年人提供情绪筛查线索。5–8 分、9–11 分和 12–15 分分别对应轻度、中度和重度线索，仍需结合身体与认知情况由专业人员判断。' },
]
const selected = ref<number[]>([])
const step = ref(0)
const finished = ref(false)
const safetyNotice = ref(false)
const remaining = ref(relaxItems[props.index || 0]?.duration || 60)
const running = ref(false)
const relaxFinished = ref(false)
const stretchStep = ref(0)
const stretchStepRemaining = ref(30)
const audioVolume = ref(0.3)
const audioError = ref('')
const audioRef = ref<HTMLAudioElement | null>(null)
const submitted = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
let deadline = 0
let stretchDeadline = 0
const relax = computed(() => relaxItems[props.index || 0] || relaxItems[0]!)
const checkin = computed(() => scales[props.index || 0] || scales[0]!)
const timeText = computed(() => `${Math.floor(remaining.value / 60).toString().padStart(2, '0')}:${(remaining.value % 60).toString().padStart(2, '0')}`)
const relaxPhase = computed(() => {
  const phase = (relax.value.duration - remaining.value) % 10
  return phase < 4 ? '吸气' : '呼气'
})
const relaxPhaseCount = computed(() => {
  const phase = (relax.value.duration - remaining.value) % 10
  return phase < 4 ? 4 - phase : 10 - phase
})
const currentStretchStep = computed(() => relax.value.stretchSteps?.[stretchStep.value])
const score = computed(() => selected.value.reduce((total, value) => total + (value || 0), 0))
const level = computed(() => checkin.value.levels.find(([max]) => score.value <= max)?.[1] || '需进一步关注')
const answerOptions = computed(() => checkin.value.optionsByQuestion?.[step.value] || checkin.value.options || ['完全不会','有几天','一半以上天数','几乎每天'])
const maxScore = computed(() => checkin.value.questions.reduce((total, _, index) => total + ((checkin.value.optionsByQuestion?.[index]?.length || checkin.value.options?.length || 4) - 1), 0))
const subscaleHint = computed(() => {
  if (checkin.value.short !== 'PHQ-4') return ''
  const anxiety = (selected.value[0] || 0) + (selected.value[1] || 0)
  const depression = (selected.value[2] || 0) + (selected.value[3] || 0)
  if (anxiety >= 3 && depression >= 3) return '焦虑与抑郁两个方向均建议进一步评估。'
  if (anxiety >= 3) return '焦虑方向建议进一步评估。'
  if (depression >= 3) return '抑郁方向建议进一步评估。'
  return '两个分项均未达到建议进一步筛查的参考界值。'
})

function clearRelaxTimer() {
  if (timer) clearInterval(timer)
  timer = undefined
}
function stopRelaxAudio() {
  if (audioRef.value) { audioRef.value.pause(); audioRef.value.currentTime = 0 }
}
async function toggleTimer() {
  if (running.value) {
    remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    if (relax.value.stretchSteps) stretchStepRemaining.value = Math.max(0, Math.ceil((stretchDeadline - Date.now()) / 1000))
    running.value = false
    clearRelaxTimer()
    audioRef.value?.pause()
    return
  }
  if (relaxFinished.value || remaining.value <= 0) return
  audioError.value = ''
  if (relax.value.audio && audioRef.value) {
    audioRef.value.volume = audioVolume.value
    try { await audioRef.value.play() }
    catch { audioError.value = '声音暂时无法播放，请点击重试或继续安静练习。'; return }
  }
  running.value = true
  const now = Date.now()
  deadline = now + remaining.value * 1000
  if (relax.value.stretchSteps) stretchDeadline = now + stretchStepRemaining.value * 1000
  timer = setInterval(() => {
    const tickNow = Date.now()
    remaining.value = Math.max(0, Math.ceil((deadline - tickNow) / 1000))
    if (relax.value.stretchSteps && remaining.value > 0) {
      if (tickNow >= stretchDeadline) {
        advanceStretchStep()
        stretchDeadline = tickNow + stretchStepRemaining.value * 1000
      } else stretchStepRemaining.value = Math.max(0, Math.ceil((stretchDeadline - tickNow) / 1000))
    }
    if (remaining.value <= 0) finishRelax()
  }, 250)
}
function advanceStretchStep() {
  if (!relax.value.stretchSteps) return
  if (stretchStep.value < relax.value.stretchSteps.length - 1) {
    stretchStep.value += 1
    stretchStepRemaining.value = 30
    stretchDeadline = Date.now() + 30_000
  }
}
function nextStretchStep() {
  if (!relax.value.stretchSteps || !running.value) return
  advanceStretchStep()
}
function finishRelax(completed = true) {
  if (completed) remaining.value = 0
  running.value = false
  relaxFinished.value = true
  clearRelaxTimer()
  stopRelaxAudio()
}
function setAudioVolume(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  audioVolume.value = value
  if (audioRef.value) audioRef.value.volume = value
}
async function restartRelax() {
  remaining.value = relax.value.duration
  running.value = false
  relaxFinished.value = false
  stretchStep.value = 0
  stretchStepRemaining.value = 30
  stopRelaxAudio()
  await toggleTimer()
}
function answer(value: number) {
  selected.value[step.value] = checkin.value.scoreMaps?.[step.value]?.[value] ?? value
  if (checkin.value.short === 'PHQ-9' && step.value === 8 && value > 0) safetyNotice.value = true
  if (step.value < checkin.value.questions.length - 1) step.value += 1
  else finished.value = true
}
onBeforeUnmount(() => { clearRelaxTimer(); stopRelaxAudio() })
</script>

<template>
  <Teleport to="body">
  <div :class="kind === 'relax' ? 'relax-screen' : 'overlay'" @click.self="kind !== 'relax' && $emit('close')">
    <section class="dialog" :class="[{ 'dialog--relax': kind === 'relax', 'dialog--wind': kind === 'relax' && props.index === 1 }, kind === 'relax' ? `relax-tone--${props.index ?? 0}` : '', kind === 'relax' && props.index === 0 ? 'dialog--breath' : '']">
      <button v-if="kind !== 'relax'" class="close" @click="$emit('close')">×</button>
      <template v-if="kind === 'relax'">
        <audio v-if="relax.audio" ref="audioRef" :src="relax.audio" preload="auto" loop />
        <header class="relax-head">
          <button class="relax-back" @click="$emit('close')">‹ <span>返回练习选择</span></button>
          <div><span>{{ relaxFinished ? '练习完成' : running ? '正在练习' : '准备好了就开始' }}</span><h2>{{ relax.title }}</h2></div>
          <span v-if="!relaxFinished" class="relax-head__privacy">{{ running ? '可随时暂停或结束' : '按自己的节奏开始' }}</span>
        </header>
        <main class="relax-experience" :class="[`relax-experience--${props.index ?? 0}`,{running,finished:relaxFinished}]" :style="{ '--relax-image': `url(/static/assets/community/ux/${props.index===1?'37443455.jpg':props.index===2?'28945280.jpg':'38239121.jpg'})` }">
          <template v-if="props.index===1">
            <div class="sound-exercise sound-exercise--wind">
              <figure class="wind-view" aria-label="安静柔和的自然风景背景"></figure>
              <div v-if="!relaxFinished" class="wind-glass">
                <div class="wind-glass__heading">
                  <span class="sound-mark">♪</span>
                  <div><b>{{ running ? '听听风声的变化' : '一段轻柔的自然风声' }}</b><p>{{ audioError || (running ? '可以闭上眼睛，也可以自然地看着前方' : '声音与草地画面会循环播放') }}</p></div>
                  <span class="sound-wave" :class="{ on: running }" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                </div>
                <label class="wind-glass__volume">音量 <input type="range" min="0" max="1" step="0.05" :value="audioVolume" @input="setAudioVolume" /><span>{{ Math.round(audioVolume*100) }}%</span></label>
                <div class="wind-glass__actions">
                  <div class="relax-clock"><strong>{{ timeText }}</strong><span>{{ running ? '跟随当下节奏' : '安静陪伴你的练习时间' }}</span></div>
                  <button class="relax-primary" @click="toggleTimer">{{ running ? '暂停一下' : audioError ? '重试播放' : remaining < relax.duration ? '继续聆听' : '开始聆听' }}</button>
                  <button v-if="running" class="relax-secondary" @click="finishRelax(false)">结束</button>
                </div>
              </div>
              <div v-else class="wind-glass wind-glass--done">
                <div class="relax-done"><span>✓</span><h3>{{ remaining===0 ? '聆听完成' : '已结束本次聆听' }}</h3><p>{{ remaining===0 ? '这一段时间留给了自己。需要时，欢迎再回来听一会儿。' : '本次练习已结束，想继续时可以再来一次。' }}</p></div>
                <div class="wind-glass__actions"><button class="relax-secondary" @click="restartRelax">再听一次</button><button class="relax-primary" @click="$emit('close')">返回练习选择</button></div>
              </div>
            </div>
          </template>
          <template v-else-if="!relaxFinished">
            <div v-if="props.index===0" class="breath-exercise" :class="running ? (relaxPhase==='吸气' ? 'is-in' : 'is-out') : 'is-idle'">
              <div class="breath-ambient" aria-hidden="true"><i v-for="n in 3" :key="n" /></div>
              <div class="breath-stage"><div class="breath-bubble" /></div>
              <div class="breath-guidance" aria-live="polite">
                <p v-if="running" class="breath-phase"><b>{{ relaxPhase }}</b><span>{{ relaxPhaseCount }} 秒</span></p>
                <p v-else class="breath-hint">{{ remaining < relax.duration ? '已暂停 · 点击「继续练习」接着来' : '跟随提示轻轻吸气，再慢慢呼气' }}</p>
              </div>
            </div>
            <div v-else class="stretch-exercise">
              <span>第 {{ stretchStep+1 }} 步 · 共 4 步</span>
              <b>{{ running ? currentStretchStep?.title : '选择一个舒服的坐姿' }}</b>
              <p>{{ running ? currentStretchStep?.cue : '跟着每一步提示，轻柔活动肩颈。全程不要勉强拉伸。' }}</p>
              <span class="stretch-dots" :class="{ on: running }" aria-hidden="true"><i v-for="(item, i) in (relax.stretchSteps || [])" :key="item.title" :class="{ done: i < stretchStep, now: i === stretchStep }" /></span>
              <small>{{ running ? `本步约剩 ${stretchStepRemaining} 秒` : '出现疼痛、眩晕或不适，请立即停止。' }}</small>
            </div>
          </template>
          <div v-if="relaxFinished && props.index!==1" class="relax-done"><span>✓</span><h3>{{ remaining===0 ? '练习完成' : '已结束本次练习' }}</h3><p>{{ remaining===0 ? '这一段时间留给了自己。需要时，欢迎再回来练习。' : '本次练习已结束，想继续时可以再来一次。' }}</p></div>
        </main>
        <footer v-if="props.index!==1" class="relax-controls">
          <div class="relax-clock"><strong>{{ timeText }}</strong><span>{{ running ? '跟随当下节奏' : relaxFinished ? '可以回到练习选择' : '安静陪伴你的练习时间' }}</span></div>
          <template v-if="!relaxFinished"><button class="relax-primary" @click="toggleTimer">{{ running ? '暂停一下' : audioError ? '重试播放' : remaining < relax.duration ? '继续练习' : '开始练习' }}</button><button v-if="running" class="relax-secondary" @click="finishRelax(false)">结束</button><button v-if="running&&relax.stretchSteps" class="relax-secondary" @click="nextStretchStep">下一步　›</button></template>
          <template v-else><button class="relax-secondary" @click="restartRelax">再练一次</button><button class="relax-primary" @click="$emit('close')">返回练习选择</button></template>
        </footer>
      </template>

      <template v-else-if="kind === 'self'">
        <span class="eyebrow">标准量表 · {{ checkin.timeframe || '回顾过去两周' }}</span><h2>{{ checkin.title }}</h2>
        <template v-if="!finished">
          <div class="progress"><i :style="{ width: `${(step + 1) / checkin.questions.length * 100}%` }"/></div>
          <p class="question">{{ step + 1 }}. {{ checkin.questions[step] }}</p>
          <div class="answers" :class="{ 'answers--three': answerOptions.length === 3, 'answers--five': answerOptions.length === 5 }"><button v-for="(label,value) in answerOptions" :key="label" @click="answer(value)">{{ label }}</button></div>
          <small class="boundary">请选择最符合实际情况的频率。量表用于筛查，不构成医学诊断。</small>
        </template>
        <template v-else>
          <div class="result"><span>本次得分</span><strong>{{ score }} / {{ maxScore }}</strong><b>{{ level }}</b><p>{{ checkin.resultHint || subscaleHint || ((checkin.short === 'GAD-2' || checkin.short === 'PHQ-2') && score >= 3 ? '快速筛查达到参考界值，建议继续完成对应完整版量表，并结合专业人员意见理解结果。' : score >= 10 ? '建议联系心理或精神卫生专业人员进行进一步评估。' : '请结合日常功能和持续时间理解结果；如困扰持续或加重，建议主动求助。') }}</p></div>
          <p class="source">量表：{{ checkin.source }}。结果仅反映相应时间范围内的自报状态，不等于临床诊断。</p>
          <button class="primary" @click="$emit('close')">完成并返回</button>
        </template>
        <div v-if="safetyNotice" class="safety"><section><span>请优先关注当前安全</span><h3>你刚才表示近期出现过伤害自己的想法</h3><p>请不要独自承受，尽快告诉身边可信任的人，并联系专业人员。若你现在可能立即伤害自己，请立刻拨打 110 / 120 或前往最近的急诊。</p><div><b>心理援助热线</b><strong>12356</strong></div><button class="primary" @click="safetyNotice=false">我已了解，查看筛查结果</button></section></div>
      </template>

      <template v-else-if="kind === 'appointment'">
        <span class="eyebrow">社区服务演示</span><h2>社区咨询预约</h2>
        <template v-if="!submitted"><p class="intro">选择希望获得的支持，现场工作人员可据此进行后续联系。</p><div class="choices"><button>情绪与压力</button><button>睡眠困扰</button><button>家庭与人际</button><button>其他咨询</button></div><label>方便联系时段<select><option>工作日上午</option><option>工作日下午</option><option>周末</option></select></label><button class="primary" @click="submitted=true">提交预约意向</button></template>
        <template v-else><div class="success">✓</div><h3>预约意向已登记</h3><p class="intro">演示模式不会发送真实预约。正式部署后可接入社区服务台和短信通知。</p><button class="primary" @click="$emit('close')">返回</button></template>
      </template>

      <template v-else>
        <span class="eyebrow">官方心理援助服务</span><h2>全国统一心理援助热线</h2><div class="hotline">12356</div>
        <p class="intro">可获得心理健康教育、心理咨询、心理疏导和心理危机干预等服务。具体服务时间以当地接听安排为准。</p>
        <div class="urgent"><b>如有立即伤害自己或他人的危险</b><span>请立即拨打 110 / 120，或前往最近的医疗机构急诊，并请身边可信任的人陪同。</span></div>
        <p class="source">来源：国家卫生健康委员会《关于应用“12356”全国统一心理援助热线电话号码的通知》。</p>
        <button class="primary" @click="$emit('close')">我知道了</button>
      </template>
    </section>
  </div>
  </Teleport>
</template>

<style scoped>
.overlay{position:fixed;z-index:420;inset:0;display:grid;place-items:center;padding:24px;background:rgba(30,47,41,.48);backdrop-filter:blur(6px)}.dialog{position:relative;box-sizing:border-box;width:min(720px,94vw);max-height:88vh;overflow:auto;padding:34px 40px;border-radius:28px;background:#fff;color:#30463f;box-shadow:0 28px 80px rgba(20,39,32,.28)}.close{position:absolute;right:18px;top:16px;width:42px;height:42px;border:0;border-radius:50%;background:#eef3f0;color:#526861;font-size:25px}.eyebrow{color:#54806f;font-size:12px;font-weight:800}.dialog h2{margin:8px 0 22px;font-size:27px}.timer{display:grid;justify-items:center;padding:20px;border-radius:20px;background:#e8f2ed}.timer i{width:76px;height:76px;border-radius:50%;background:#83b5a0}.timer i.running{animation:pulse 10s ease-in-out infinite}.timer strong{margin-top:8px;font-size:30px}.timer small{color:#667a72}.dialog ol{display:grid;gap:10px;padding-left:24px;line-height:1.6}.source,.boundary{display:block;color:#7b8a84;font-size:11px;line-height:1.6}.primary{min-width:180px;height:50px;margin-top:18px;border:0;border-radius:13px;background:#397866;color:#fff;font-size:15px;font-weight:800}.primary:disabled{background:#9badA6}.progress{height:8px;margin-bottom:25px;border-radius:10px;background:#e9eeeb}.progress i{display:block;height:100%;border-radius:10px;background:#6ba089}.question{min-height:62px;font-size:20px;font-weight:700;line-height:1.55}.answers,.choices{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.answers button,.choices button{min-height:54px;border:1px solid #d9e3de;border-radius:13px;background:#f8faf9;color:#344c44;font-weight:700}.result,.urgent{padding:20px;border-radius:17px;background:#f1f5f3}.result b,.urgent b,.urgent span{display:block}.result p,.intro{color:#61736c;line-height:1.7}.dialog label{display:grid;gap:8px;margin-top:18px;font-weight:700}.dialog select{height:48px;padding:0 14px;border:1px solid #d9e3de;border-radius:12px;background:#fff}.success{display:grid;place-items:center;width:74px;height:74px;border-radius:50%;background:#dceee5;color:#397866;font-size:35px}.hotline{padding:20px;border-radius:18px;background:#e8eef5;color:#4e6e88;font-size:42px;font-weight:850;letter-spacing:.12em;text-align:center}.urgent{margin-top:15px;background:#f8ece8}.urgent span{margin-top:6px;color:#735e56;line-height:1.6}@keyframes pulse{0%,100%{transform:scale(.72)}40%,60%{transform:scale(1)}}
.answers--three{grid-template-columns:repeat(3,1fr)}
.answers--five{grid-template-columns:repeat(5,1fr)}.answers--five button{padding:8px;font-size:12px}
</style>
<style scoped>
.result span,.result strong{display:block}.result strong{margin:5px 0;color:#397866;font-size:36px}.safety{position:absolute;z-index:5;inset:0;display:grid;place-items:center;padding:28px;background:rgba(75,39,35,.58);backdrop-filter:blur(5px)}.safety section{padding:30px;border-radius:22px;background:#fff7f4;box-shadow:0 20px 60px rgba(72,30,27,.28)}.safety section>span{color:#a44e45;font-weight:800}.safety h3{font-size:22px}.safety p{color:#66534e;line-height:1.75}.safety section>div{display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:14px;background:#f4dfd9}.safety section>div b{display:block}.safety strong{font-size:28px;letter-spacing:.1em}
</style>
<style scoped>
/* 社区工具弹窗亲和视觉层。 */
.overlay{background:rgba(40,56,50,.36);backdrop-filter:blur(8px)}
.dialog{width:min(760px,94vw);padding:38px 44px;border-radius:32px;background:#fffdfa;color:#2c433b;box-shadow:0 26px 70px rgba(35,54,47,.22);font-family:"Microsoft YaHei UI","PingFang SC",sans-serif}
.close{right:20px;top:18px;border-radius:15px;background:#edf2ee;color:#52685f}.eyebrow{display:inline-block;padding:6px 10px;border-radius:9px;background:#e7f1eb;color:#477261;font-size:13px}.dialog h2{margin:12px 0 25px;font-size:29px;line-height:1.4}.progress{height:10px;border-radius:99px;background:#edf0ec}.progress i{background:#73a98f}.question{min-height:74px;font-size:23px;line-height:1.6}.answers,.choices{gap:14px}.answers button,.choices button{min-height:62px;padding:10px 16px;border:0;border-radius:17px;background:#eff4f0;color:#324940;font-size:15px}.answers button:nth-child(2n),.choices button:nth-child(2n){background:#edf1f7}.primary{height:54px;border-radius:15px;font-size:16px;box-shadow:0 8px 18px rgba(57,120,102,.14)}.timer{border-radius:25px;background:#e6f1eb}.result,.urgent{padding:25px;border-radius:22px;background:#eef4f0}.result strong{font-size:42px}.result p,.intro{font-size:14px;line-height:1.8}.source,.boundary{font-size:12px}.hotline{border-radius:22px;background:#e7eef5}
@media(max-width:1050px),(max-height:650px){.dialog{padding:27px 32px}.dialog h2{font-size:24px}.question{min-height:58px;font-size:19px}.answers button,.choices button{min-height:52px;font-size:13px}}
</style>
<style scoped>
/* 全屏放松练习：按终端横屏尺寸固定顶部、主体和底部控制区。 */
.overlay:has(.dialog--relax){padding:0;background:#f6f6f1;backdrop-filter:none}
.dialog.dialog--relax{position:relative;display:grid;grid-template-rows:92px minmax(0,1fr) 104px;gap:0;box-sizing:border-box;width:100vw;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;overflow:hidden;padding:0;border-radius:0;background:#f7f7f2;color:#2d443a;box-shadow:none}
.dialog--relax audio{display:none}
.relax-head{display:grid;grid-template-columns:minmax(190px,1fr) minmax(250px,1.2fr) minmax(190px,1fr);align-items:center;gap:16px;padding:0 clamp(22px,4vw,58px);background:#fff}
.relax-head>div{text-align:center}.relax-head>div>span{color:#668276;font-size:12px;font-weight:700}.relax-head h2{margin:3px 0 0;font-size:22px}.relax-back{justify-self:start;display:flex;align-items:center;gap:8px;min-height:46px;padding:0 14px;border:0;border-radius:14px;background:#f0f3ee;color:#3e6858;font-size:23px}.relax-back span{font-size:14px;font-weight:750}.relax-head__privacy{justify-self:end;color:#78867f;font-size:12px}
.relax-experience{position:relative;isolation:isolate;display:grid;place-items:center;min-height:0;overflow:hidden;padding:22px clamp(20px,5vw,70px);background:#e7eee7}
.relax-experience::before{content:'';position:absolute;z-index:-2;inset:0;background-image:linear-gradient(90deg,rgba(232,240,233,.9),rgba(238,244,235,.68)),var(--relax-image);background-position:center;background-size:cover;filter:saturate(.78)}
.relax-experience::after{content:'';position:absolute;z-index:-1;inset:0;background:radial-gradient(ellipse at center,rgba(255,255,255,.42),rgba(255,255,255,0) 68%)}
.breath-exercise,.sound-exercise,.stretch-exercise,.relax-done{display:grid;justify-items:center;width:min(760px,100%);text-align:center;color:#2c493d}/* 平稳呼吸：全屏动态气泡场景（铺满练习区，吸气胀、呼气收，无按钮感） */
.breath-exercise{position:absolute;inset:0;width:100%;place-content:center;row-gap:0}
.breath-ambient{position:absolute;inset:0;overflow:hidden;pointer-events:none;transition:transform 4s ease-in-out}
.breath-ambient i{position:absolute;border-radius:50%;background:radial-gradient(circle at 32% 28%,rgba(255,255,255,.85),rgba(178,218,196,.5) 46%,rgba(88,158,126,.2) 80%);box-shadow:inset 0 0 24px rgba(255,255,255,.45);opacity:.55;animation:breathFloat 26s ease-in-out infinite}
.breath-ambient i:nth-child(1){width:120px;height:120px;left:9%;top:18%}
.breath-ambient i:nth-child(2){width:64px;height:64px;left:20%;bottom:16%;animation-delay:-7s;animation-duration:32s}
.breath-ambient i:nth-child(3){width:170px;height:170px;right:11%;top:13%;animation-delay:-13s;animation-duration:30s;opacity:.4;filter:blur(2px)}
.breath-ambient i:nth-child(4){width:88px;height:88px;right:22%;bottom:20%;animation-delay:-19s}
.breath-ambient i:nth-child(5){width:46px;height:46px;left:33%;top:10%;animation-delay:-11s;animation-duration:22s;opacity:.42}
.breath-ambient i:nth-child(6){width:140px;height:140px;right:34%;bottom:8%;animation-delay:-23s;animation-duration:36s;opacity:.34;filter:blur(3px)}
@keyframes breathFloat{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-42px) scale(1.08)}}
.breath-stage{position:relative;display:grid;place-items:center;width:clamp(290px,50vh,450px);height:clamp(290px,50vh,450px)}
.breath-stage::before{content:'';position:absolute;inset:-12%;border-radius:50%;background:radial-gradient(circle,rgba(120,190,158,.4),rgba(120,190,158,0) 70%);transform:scale(1);opacity:.5;transition:transform 4s ease-in-out,opacity 4s ease-in-out}
.breath-stage::after{content:'';position:absolute;inset:2.5%;border-radius:50%;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.28)}
.breath-bubble{position:relative;width:100%;height:100%;border-radius:50%;background:radial-gradient(circle at 31% 25%,rgba(255,255,255,.95),rgba(219,244,230,.9) 16%,rgba(255,255,255,0) 44%),radial-gradient(circle at 66% 80%,rgba(34,120,90,.5),rgba(34,120,90,0) 55%),radial-gradient(circle at 50% 45%,#a8dcc2 0%,#6cb596 52%,#2f7d5f 100%);background-size:100% 100%,130% 130%,180% 180%;background-position:0 0,60% 70%,20% 20%;box-shadow:inset 0 24px 50px rgba(255,255,255,.45),inset 0 -28px 64px rgba(12,72,52,.4),0 42px 110px rgba(35,100,76,.35),0 12px 36px rgba(35,100,76,.2);transform:scale(1);transition:transform 4s cubic-bezier(.42,0,.32,1);animation:breathDrift 18s ease-in-out infinite}
@keyframes breathDrift{0%,100%{background-position:0 0,62% 72%,22% 22%}50%{background-position:0 0,38% 28%,78% 78%}}
.is-in .breath-bubble{transform:scale(1.17);transition-duration:4s}
.is-out .breath-bubble{transform:scale(.8);transition-duration:6s}
.is-in .breath-stage::before{transform:scale(1.3);opacity:.9;transition-duration:4s}
.is-out .breath-stage::before{transform:scale(.84);opacity:.35;transition-duration:6s}
.is-in .breath-ambient{transform:scale(1.06);transition-duration:4s}
.is-out .breath-ambient{transform:scale(.965);transition-duration:6s}
.is-idle .breath-bubble{animation:breathIdle 7s ease-in-out infinite,breathDrift 18s ease-in-out infinite}
@keyframes breathIdle{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
.breath-exercise .breath-hint{margin-top:clamp(24px,5vh,46px);font-size:clamp(15px,1.7vw,20px);letter-spacing:.02em}
@media(prefers-reduced-motion:reduce){.is-idle .breath-bubble{animation:none}.breath-bubble{animation:none}.breath-ambient i{animation:none}}.breath-exercise p,.sound-exercise p,.stretch-exercise p,.relax-done p{max-width:700px;margin:8px 0 0;color:#526c5e;font-size:clamp(15px,1.6vw,19px);line-height:1.7}
.sound-exercise{align-content:center;min-height:min(370px,52vh);padding:32px;border:1px solid rgba(255,255,255,.6);border-radius:32px;background:rgba(255,255,255,.64);box-shadow:0 12px 38px rgba(58,79,65,.08)}.sound-mark{display:grid;place-items:center;width:78px;height:78px;margin-bottom:12px;border-radius:25px;background:#e3efe7;color:#498369;font-size:42px}.sound-exercise>b{font-size:clamp(23px,3vw,32px)}.sound-exercise label{display:flex;align-items:center;gap:12px;width:min(390px,90%);margin-top:28px;color:#536b5e;font-size:13px}.sound-exercise input{flex:1;accent-color:#4e8a70}.sound-exercise label span{min-width:38px;text-align:right}
.stretch-exercise{align-content:center;min-height:min(330px,48vh);padding:30px 40px;border-radius:32px;background:rgba(255,255,255,.62)}.stretch-exercise>span{padding:8px 12px;border-radius:999px;background:#e6f1e9;color:#47725f;font-size:14px;font-weight:750}.stretch-exercise>b{margin-top:17px;font-size:clamp(26px,3.5vw,40px)}.stretch-exercise p{min-height:3.2em}.stretch-exercise small{margin-top:16px;color:#78867f;font-size:13px}.relax-done>span{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:#dceee2;color:#438166;font-size:38px}.relax-done h3{margin:20px 0 0;font-size:clamp(25px,3vw,36px)}
.relax-controls{display:flex;align-items:center;justify-content:center;gap:12px;padding:12px clamp(22px,4vw,58px);background:#fff}.relax-clock{display:grid;justify-items:center;min-width:145px;margin-right:18px}.relax-clock strong{color:#2d493d;font-size:25px;font-variant-numeric:tabular-nums}.relax-clock span{margin-top:2px;color:#75837c;font-size:11px}.relax-primary,.relax-secondary{min-width:148px;min-height:54px;padding:0 22px;border:0;border-radius:15px;font-size:16px;font-weight:800}.relax-primary{background:#397866;color:#fff;box-shadow:0 7px 18px rgba(53,112,89,.13)}.relax-secondary{background:#eef2ed;color:#45675a}
@media(max-width:1050px),(max-height:650px){.dialog.dialog--relax{grid-template-rows:72px minmax(0,1fr) 82px}.relax-head{grid-template-columns:minmax(150px,1fr) minmax(210px,1.2fr) minmax(140px,1fr);padding:0 22px}.relax-head h2{font-size:18px}.relax-back{min-height:40px}.relax-back span{font-size:12px}.relax-head__privacy{font-size:10px}.relax-experience{padding:12px 20px}.breath-stage{width:clamp(240px,46vh,330px);height:clamp(240px,46vh,330px)}.breath-ambient i:nth-child(3),.breath-ambient i:nth-child(6){display:none}.breath-exercise .breath-hint{margin-top:clamp(14px,3.5vh,28px)}.sound-exercise{min-height:min(270px,49vh);padding:20px}.sound-mark{width:58px;height:58px;font-size:32px}.sound-exercise label{margin-top:17px}.stretch-exercise{min-height:min(230px,44vh);padding:20px 28px}.stretch-exercise>b{margin-top:10px;font-size:28px}.stretch-exercise p{font-size:15px}.stretch-exercise small{margin-top:8px;font-size:11px}.relax-controls{gap:8px;padding:8px 20px}.relax-clock{min-width:120px;margin-right:8px}.relax-clock strong{font-size:21px}.relax-primary,.relax-secondary{min-width:122px;min-height:46px;padding:0 15px;font-size:14px}}
@media(max-width:760px){.dialog.dialog--relax{grid-template-rows:70px minmax(0,1fr) 112px}.relax-head{grid-template-columns:1fr auto;padding:0 12px}.relax-head>div{grid-column:2;grid-row:1}.relax-head__privacy{display:none}.relax-back{min-width:42px;padding:0 10px}.relax-back span{display:none}.relax-controls{flex-wrap:wrap;gap:7px}.relax-clock{width:100%;margin:0}.relax-primary,.relax-secondary{flex:1;min-width:100px;min-height:42px;font-size:13px}}
</style>
<style scoped>
/* 练习进行中延续自然温暖的配色，控件轻一点，内容更像陪伴提示。 */
.overlay:has(.dialog--relax){background:rgba(62,57,46,.24)}
.dialog.dialog--relax{background:#f6f1e7;color:#485244}
.dialog--relax .relax-head,.dialog--relax .relax-controls{background:#fbf8f0}
.dialog--relax .relax-head h2{color:#4b5547;font-weight:650}
.dialog--relax .relax-head>div>span,.dialog--relax .relax-head__privacy{color:#82816f}
.dialog--relax .relax-back{border-radius:18px;background:#efecdf;color:#667258}
.dialog--relax .relax-experience{background:#e9eadf}
.dialog--relax .relax-experience::before{background-image:linear-gradient(90deg,rgba(240,235,218,.50),rgba(240,235,218,.20)),var(--relax-image);filter:saturate(.72) brightness(.98)}
.dialog--relax .relax-experience::after{background:radial-gradient(ellipse at center,rgba(251,247,235,.54),rgba(251,247,235,.08) 72%)}
.dialog--relax .breath-exercise,.dialog--relax .sound-exercise,.dialog--relax .stretch-exercise,.dialog--relax .relax-done{color:#4b5547}
.dialog--relax .sound-exercise>b,.dialog--relax .stretch-exercise>b,.dialog--relax .relax-done h3{font-weight:650}
.dialog--relax .breath-exercise p,.dialog--relax .sound-exercise p,.dialog--relax .stretch-exercise p,.dialog--relax .relax-done p{color:#777665}
.dialog--relax .sound-exercise,.dialog--relax .stretch-exercise{border:1px solid rgba(255,255,255,.58);background:rgba(251,248,239,.78);box-shadow:0 10px 30px rgba(86,77,57,.06)}
.dialog--relax .sound-mark{background:#e8eadb;color:#7c8766}
.dialog--relax .sound-exercise label{color:#777866}
.dialog--relax .sound-exercise input{accent-color:#87916d}
.dialog--relax .stretch-exercise>span,.dialog--relax .relax-done>span{background:#e8eadb;color:#73805f}
.dialog--relax .stretch-exercise small,.dialog--relax .relax-clock span{color:#858372}
.dialog--relax .relax-clock strong{color:#4b5547}
.dialog--relax .relax-primary{border-radius:17px;background:#788866;box-shadow:0 6px 16px rgba(91,103,68,.14)}
.dialog--relax .relax-secondary{border-radius:17px;background:#eeecdf;color:#667256}
.dialog.dialog--relax{grid-template-rows:84px minmax(0,1fr) 128px}
.dialog--relax .relax-head{position:relative}
.dialog--relax .relax-head__privacy{position:absolute;right:clamp(20px,3vw,42px);max-width:170px;white-space:nowrap;text-align:right;font-size:11px}
.dialog--relax .relax-controls{padding-top:8px;padding-bottom:8px}
@media(max-width:1050px),(max-height:650px){.dialog.dialog--relax{grid-template-rows:68px minmax(0,1fr) 98px}.dialog--relax .relax-controls{padding-top:6px;padding-bottom:6px}}
</style>
<style scoped>
/* 练习进行中沿用入口三张卡片的色系：平稳呼吸=薄荷绿、自然声音=雾蓝、肩颈舒展=暖沙。 */
.dialog.dialog--relax{grid-template-rows:88px minmax(0,1fr) 116px;gap:0;background:#f7fbf8;color:#1f3b33}
.dialog--relax .relax-head,.dialog--relax .relax-controls{background:#fff}
.dialog--relax .relax-head h2{color:#1f3b33;font-weight:750}
.dialog--relax .relax-head>div>span,.dialog--relax .relax-head__privacy{color:#8a9c93}
.dialog--relax .relax-back{background:#f1f6f2;color:#3d7a62}
.dialog--relax .relax-experience{background:#eef6f1}
.dialog--relax .relax-experience::before{background-image:linear-gradient(180deg,rgba(247,251,248,.9),rgba(240,248,243,.94)),var(--relax-image);filter:saturate(.7)}
.dialog--relax .relax-experience::after{background:radial-gradient(ellipse at center,rgba(255,255,255,.5),rgba(255,255,255,0) 70%)}
.dialog--relax .sound-exercise>b,.dialog--relax .stretch-exercise>b,.dialog--relax .relax-done h3{color:#1f3b33;font-weight:750}
.dialog--relax .breath-exercise p,.dialog--relax .sound-exercise p,.dialog--relax .stretch-exercise p,.dialog--relax .relax-done p{color:#68807a}
.dialog--relax .breath-exercise .breath-hint{color:#476a5b}
.dialog--relax .sound-exercise,.dialog--relax .stretch-exercise{border:1px solid rgba(255,255,255,.72);background:rgba(255,255,255,.72);box-shadow:0 14px 40px rgba(45,80,66,.07)}
.dialog--relax .sound-mark{background:#dceaf6;color:#47809f}
.dialog--relax .sound-exercise label{color:#6d8492}
.dialog--relax .sound-exercise input{accent-color:#47809f}
.dialog--relax .stretch-exercise>span{background:#fbeedc;color:#a97c2c}
.dialog--relax .stretch-exercise small,.dialog--relax .relax-clock span{color:#8a9c93}
.dialog--relax .relax-clock strong{color:#1f3b33}
.dialog--relax .relax-primary{border-radius:16px;background:#3f8e70;box-shadow:0 6px 18px rgba(63,142,112,.16)}
.dialog--relax .relax-secondary{border-radius:16px;background:#eef4f0;color:#48695c}
.dialog--relax .relax-done>span{background:#dff0e6;color:#3f8e70}
/* 自然声音：让“正在播放”看得见 */
.dialog--relax .sound-wave{display:flex;align-items:center;gap:7px;height:44px;margin:14px 0 2px}
.dialog--relax .sound-wave i{width:9px;border-radius:999px;background:#cfe2ef;transform:scaleY(.34);transition:transform .3s ease}
.dialog--relax .sound-wave i:nth-child(1){height:34px}
.dialog--relax .sound-wave i:nth-child(2){height:44px}
.dialog--relax .sound-wave i:nth-child(3){height:26px}
.dialog--relax .sound-wave i:nth-child(4){height:40px}
.dialog--relax .sound-wave i:nth-child(5){height:30px}
.dialog--relax .sound-wave.on i{background:#47809f;animation:soundWave 1.8s ease-in-out infinite}
.dialog--relax .sound-wave.on i:nth-child(2){animation-delay:.18s}
.dialog--relax .sound-wave.on i:nth-child(3){animation-delay:.36s}
.dialog--relax .sound-wave.on i:nth-child(4){animation-delay:.54s}
.dialog--relax .sound-wave.on i:nth-child(5){animation-delay:.72s}
@keyframes soundWave{0%,100%{transform:scaleY(.34)}50%{transform:scaleY(1)}}
@media(prefers-reduced-motion:reduce){.dialog--relax .sound-wave.on i{animation:none;transform:scaleY(.7)}}
/* 肩颈舒展：四步进度点 */
.dialog--relax .stretch-dots{display:flex;gap:8px;margin-top:15px}
.dialog--relax .stretch-dots i{width:30px;height:6px;border-radius:999px;background:#f0e2cc}
.dialog--relax .stretch-dots i.done{background:#dcb87f}
.dialog--relax .stretch-dots i.now{background:#c08f3e}
/* 三种练习各自的色系 */
.dialog--relax.relax-tone--1 .relax-experience{background:#edf4fa}
.dialog--relax.relax-tone--1 .relax-experience::before{background-image:linear-gradient(180deg,rgba(246,251,255,.9),rgba(237,245,251,.94)),var(--relax-image);filter:saturate(.42) brightness(1.03)}
.dialog--relax.relax-tone--1 .relax-back{background:#eef5fa;color:#3f7392}
.dialog--relax.relax-tone--1 .relax-primary{background:#47809f;box-shadow:0 6px 18px rgba(71,128,159,.18)}
.dialog--relax.relax-tone--1 .relax-secondary{background:#eef3f8;color:#4a6f87}
.dialog--relax.relax-tone--2 .relax-experience{background:#fbf3e7}
.dialog--relax.relax-tone--2 .relax-experience::before{background-image:linear-gradient(180deg,rgba(254,250,243,.9),rgba(251,243,231,.94)),var(--relax-image);filter:saturate(.5) brightness(1.04)}
.dialog--relax.relax-tone--2 .relax-back{background:#fbf1e2;color:#a97c2c}
.dialog--relax.relax-tone--2 .relax-primary{background:#c08f3e;box-shadow:0 6px 18px rgba(192,143,62,.18)}
.dialog--relax.relax-tone--2 .relax-secondary{background:#f8f0e3;color:#8a6e3c}
.dialog--relax.relax-tone--2 .relax-done>span{background:#fbeedc;color:#c08f3e}
@media(max-width:1050px),(max-height:650px){.dialog.dialog--relax{grid-template-rows:72px minmax(0,1fr) 100px}.dialog--relax .sound-wave{height:36px;margin:9px 0 0}.dialog--relax .stretch-dots{margin-top:9px}}
</style>
<style scoped>
/* 全局练习页：脱离欢迎页的裁切上下文，所有练习共用可见的顶栏、主体和操作栏。 */
.relax-screen{position:fixed;z-index:10000;inset:0;display:block;width:100%;height:100%;height:100dvh;overflow:hidden;background:#f3f8f4}
.dialog.dialog--relax{position:absolute;inset:0;display:grid;grid-template-rows:82px minmax(0,1fr) 104px;gap:0;width:100%;height:100%;min-height:0;max-height:none;margin:0;padding:0;overflow:hidden;border:0;border-radius:0;background:#f3f8f4;color:#233e32;box-shadow:none}
.dialog--relax .relax-head{position:relative;inset:auto;z-index:2;grid-template-columns:minmax(0,1fr) minmax(220px,1.2fr) minmax(0,1fr);gap:16px;min-width:0;padding:0 clamp(20px,4vw,56px);background:#f8fbf8;border-bottom:1px solid #e2ece4}
.dialog--relax .relax-head>div>span{color:#526f60;font-size:13px}
.dialog--relax .relax-head h2{color:#233e32;font-size:22px;font-weight:750}
.dialog--relax .relax-back{min-height:48px;background:#e8f1e9;color:#315f49;font-size:23px}
.relax-screen button{-webkit-tap-highlight-color:transparent}
.relax-screen button:focus:not(:focus-visible){outline:none;box-shadow:none}
.dialog--relax .relax-back span{font-size:15px}
.dialog--relax .relax-head__privacy{position:static;max-width:180px;white-space:normal;text-align:right;color:#526f60;font-size:13px}
.dialog--relax .relax-experience{position:relative;min-height:0;padding:20px clamp(20px,5vw,64px);overflow:hidden;background:#edf5ef}
.dialog--relax .relax-experience::before{background-image:linear-gradient(180deg,rgba(247,250,247,.95),rgba(239,246,240,.96)),var(--relax-image);filter:saturate(.4)}
.dialog--relax .relax-experience::after{background:radial-gradient(ellipse at center,rgba(255,255,255,.34),rgba(255,255,255,0) 70%)}
.dialog--breath .relax-experience{background:#edf5ef}
.dialog--breath .relax-experience::before{background-image:linear-gradient(180deg,rgba(246,250,247,.98),rgba(238,246,240,.98))}
.dialog--breath .relax-experience::after{background:radial-gradient(ellipse at center,rgba(255,255,255,.28),rgba(255,255,255,0) 70%)}
.dialog--relax .relax-controls{position:relative;inset:auto;z-index:2;display:flex;align-items:center;justify-content:center;gap:14px;min-height:0;padding:10px max(20px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(20px,env(safe-area-inset-left));background:#f8fbf8;border-top:1px solid #e2ece4}
.dialog--relax .relax-clock{min-width:128px;margin-right:4px}
.dialog--relax .relax-clock strong{color:#233e32;font-size:25px}
.dialog--relax .relax-clock span{color:#526f60;font-size:12px}
.dialog--relax .relax-primary,.dialog--relax .relax-secondary{min-width:152px;min-height:56px;font-size:16px}
.dialog--relax .relax-primary{background:#347a5d}
.dialog--relax .relax-secondary{background:#e7efe8;color:#315f49}
.dialog--relax .breath-exercise{row-gap:0}
.dialog--relax .breath-ambient i{animation-play-state:paused;opacity:.27}
.dialog--relax .breath-exercise.is-in .breath-ambient i,.dialog--relax .breath-exercise.is-out .breath-ambient i{animation-play-state:running}
.dialog--relax .breath-ambient i:nth-child(1){width:150px;height:150px;left:12%;top:16%}
.dialog--relax .breath-ambient i:nth-child(2){width:92px;height:92px;right:16%;bottom:15%;left:auto;animation-delay:-8s}
.dialog--relax .breath-ambient i:nth-child(3){width:64px;height:64px;right:26%;top:13%;left:auto;animation-delay:-14s}
.dialog--relax .breath-stage{width:clamp(230px,39vh,340px);height:clamp(230px,39vh,340px)}
.dialog--relax .breath-stage::before{inset:-8%;background:radial-gradient(circle,rgba(100,162,124,.2),rgba(100,162,124,0) 72%)}
.dialog--relax .breath-stage::after{display:none}
.dialog--relax .breath-bubble{background:radial-gradient(circle at 32% 26%,rgba(255,255,255,.78),rgba(255,255,255,0) 40%),linear-gradient(145deg,#acd4b7,#70a982);box-shadow:0 24px 60px rgba(61,113,78,.2);animation:none}
.dialog--relax .is-in .breath-bubble{transform:scale(1.12)}
.dialog--relax .is-out .breath-bubble{transform:scale(.88)}
.dialog--relax .is-idle .breath-bubble{transform:scale(1)}
.dialog--relax .is-idle .breath-bubble{transition:none}
.dialog--relax .breath-guidance{min-height:62px;margin-top:clamp(14px,3vh,28px)}
.dialog--relax .breath-phase{display:flex;align-items:baseline;justify-content:center;gap:12px;margin:0;color:#2f6848}
.dialog--relax .breath-phase b{font-size:clamp(24px,3vw,34px);font-weight:750}
.dialog--relax .breath-phase span{font-size:clamp(20px,2.5vw,28px);font-variant-numeric:tabular-nums}
.dialog--relax .breath-hint{margin:0;color:#365c46;font-size:17px}
.dialog--relax .sound-exercise,.dialog--relax .stretch-exercise{border:0;border-radius:26px;background:rgba(255,255,255,.82);box-shadow:0 10px 30px rgba(45,80,66,.06)}
.dialog--relax .sound-exercise>b,.dialog--relax .stretch-exercise>b,.dialog--relax .relax-done h3{color:#233e32;font-weight:750}
.dialog--relax .breath-exercise p,.dialog--relax .sound-exercise p,.dialog--relax .stretch-exercise p,.dialog--relax .relax-done p{color:#4f695a}
.dialog--relax .sound-exercise label,.dialog--relax .stretch-exercise small{color:#526f60}
.dialog--relax.relax-tone--1 .relax-primary{background:#3f7392}
.dialog--relax.relax-tone--1 .relax-back{background:#e8f1e9;color:#315f49}
.dialog--relax.relax-tone--1 .relax-experience{background:#edf4fa}
.dialog--relax.relax-tone--2 .relax-experience{background:#fbf3e7}
.dialog--relax.relax-tone--2 .relax-primary{background:#9b722f}
.dialog--relax.relax-tone--2 .relax-secondary{background:#f4ead8;color:#705521}
.dialog--relax.relax-tone--2 .relax-back{background:#e8f1e9;color:#315f49}
@media(max-width:900px),(max-height:620px){
  .dialog.dialog--relax{grid-template-rows:68px minmax(0,1fr) 88px}
  .dialog--relax .relax-head{grid-template-columns:minmax(0,1fr) minmax(170px,1.1fr) minmax(0,1fr);gap:8px;padding-inline:18px}
  .dialog--relax .relax-head h2{font-size:18px}
  .dialog--relax .relax-head>div>span,.dialog--relax .relax-head__privacy{font-size:11px}
  .dialog--relax .relax-back{min-height:42px;padding-inline:10px}
  .dialog--relax .relax-back span{font-size:12px}
  .dialog--relax .relax-controls{gap:8px;padding-top:6px;padding-bottom:max(6px,env(safe-area-inset-bottom))}
  .dialog--relax .relax-primary,.dialog--relax .relax-secondary{min-width:120px;min-height:46px;padding-inline:14px;font-size:14px}
  .dialog--relax .relax-clock{min-width:100px}
  .dialog--relax .relax-clock strong{font-size:21px}
  .dialog--relax .breath-stage{width:clamp(190px,37vh,270px);height:clamp(190px,37vh,270px)}
}
@media(max-width:760px),(orientation:portrait){
  .dialog.dialog--relax{grid-template-rows:66px minmax(0,1fr) 106px}
  .dialog--relax .relax-head{grid-template-columns:48px minmax(0,1fr) 0;gap:8px;padding-inline:10px}
  .dialog--relax .relax-head>div{grid-column:2;grid-row:1}
  .dialog--relax .relax-head__privacy{display:none}
  .dialog--relax .relax-back{width:44px;min-width:44px;padding:0;justify-content:center}
  .dialog--relax .relax-back span{display:none}
  .dialog--relax .relax-controls{flex-wrap:wrap;gap:6px;padding-inline:10px}
  .dialog--relax .relax-clock{width:100%;min-width:0;margin:0}
  .dialog--relax .relax-primary,.dialog--relax .relax-secondary{flex:1;min-width:96px;min-height:40px;padding-inline:8px;font-size:13px}
  .dialog--relax .breath-stage{width:clamp(180px,34vh,270px);height:clamp(180px,34vh,270px)}
}
@media(prefers-reduced-motion:reduce){
  .dialog--relax .breath-bubble,.dialog--relax .breath-ambient i,.dialog--relax .sound-wave.on i{animation:none;transition:none}
}
/* 全屏自然风景背景 + 半透明磨砂播放控制。图源：matuska / Pixabay，https://pixabay.com/photos/field-meadow-green-meadow-nature-2329198/ */
.dialog.dialog--relax.dialog--wind{display:block;isolation:isolate;background:#dce9de;color:#fff}
.dialog--wind .relax-head{position:absolute;inset:20px 24px auto;z-index:4;display:grid;grid-template-columns:1fr auto 1fr;min-height:0;padding:0;border:0;background:transparent;pointer-events:none}
.dialog--wind .relax-head>*{pointer-events:auto}
.dialog--wind .relax-head>div{grid-column:2;grid-row:1;padding:9px 20px;border:1px solid rgba(255,255,255,.24);border-radius:18px;background:rgba(17,39,31,.38);text-align:center;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.dialog--wind .relax-head>div>span,.dialog--wind .relax-head h2,.dialog--wind .relax-head__privacy{color:#fff}
.dialog--wind .relax-head h2{font-size:20px}
.dialog--wind .relax-head__privacy{justify-self:end;align-self:center;padding:10px 14px;border:1px solid rgba(255,255,255,.22);border-radius:999px;background:rgba(17,39,31,.38);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.dialog--wind .relax-back{min-height:46px;padding:0 16px;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(17,39,31,.42);color:#fff;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)}
.dialog.dialog--relax.dialog--wind .relax-experience{position:absolute;inset:0;z-index:0;display:block;min-height:0;padding:0;overflow:hidden;background:radial-gradient(ellipse at 50% 12%,rgba(255,255,255,.88),transparent 44%),linear-gradient(150deg,#d7e5d8 0%,#b9cfbd 56%,#a4c1ad 100%)}
.dialog--wind .relax-experience::before,.dialog--wind .relax-experience::after{display:none}
.dialog--wind .sound-exercise--wind{position:absolute;inset:0;display:block;width:100%;height:100%;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:transparent;box-shadow:none}
.dialog--wind .wind-view{position:absolute;inset:0;width:100%;height:100%;min-height:0;margin:0;overflow:hidden;border-radius:0;background:#53635a}
.dialog--wind .wind-view::before{position:absolute;inset:0;content:"";background-image:linear-gradient(180deg,rgba(22,61,43,.08),rgba(242,248,229,0) 42%,rgba(31,68,43,.10)),url('/static/assets/community/ux/meadow-sunlight-pixabay.jpg');background-position:center;background-size:cover;filter:brightness(1.01) saturate(1.04) contrast(.99)}
.dialog--wind .wind-glass{position:absolute;z-index:2;right:20px;bottom:max(24px,env(safe-area-inset-bottom));left:50%;width:min(560px,calc(100% - 40px));padding:16px 18px 14px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.38);border-radius:22px;background:rgba(245,250,239,.24);color:#153b2a;box-shadow:0 16px 42px rgba(13,33,25,.12);backdrop-filter:blur(22px) saturate(1.3);-webkit-backdrop-filter:blur(22px) saturate(1.3)}
.dialog--wind .wind-glass__heading{display:flex;align-items:center;gap:10px}
.dialog--wind .wind-glass__heading>div{min-width:0;flex:1}
.dialog--wind .wind-glass__heading b{display:block;color:#153b2a;font-size:18px;font-weight:750}
.dialog--wind .wind-glass__heading p{margin:3px 0 0;color:#153b2a;font-size:12px}
.dialog--wind .wind-glass .sound-mark{display:grid;flex:none;width:40px;height:40px;place-items:center;margin:0;border-radius:14px;background:rgba(255,255,255,.34);color:#153b2a;font-size:22px}
.dialog--wind .wind-glass .sound-wave{flex:none;margin:0 4px}
.dialog--wind .wind-glass .sound-wave i{background:#91b69a}
.dialog--wind .wind-glass .sound-wave.on i{background:#3f8e70}
.dialog--wind .wind-glass__volume{display:grid;grid-template-columns:auto minmax(90px,1fr) 44px;align-items:center;gap:9px;margin-top:10px;color:#153b2a;font-size:12px}
.dialog--wind .wind-glass__volume input{width:100%;accent-color:#3f8e70}
.dialog--wind .wind-glass__volume span{text-align:right;font-variant-numeric:tabular-nums}
.dialog--wind .wind-glass__actions{display:flex;align-items:center;justify-content:center;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(21,59,42,.17)}
.dialog--wind .relax-clock{display:grid;min-width:105px;margin:0 8px 0 0}
.dialog--wind .relax-clock strong{color:#153b2a;font-size:23px;font-variant-numeric:tabular-nums}
.dialog--wind .relax-clock span{color:#153b2a;font-size:11px}
.dialog--wind .wind-glass__actions .relax-primary,.dialog--wind .wind-glass__actions .relax-secondary{min-width:120px;min-height:44px;font-size:14px;color:#153b2a}
.dialog--wind .wind-glass__actions .relax-primary{border:1px solid rgba(255,255,255,.70);background:rgba(245,250,239,.34);color:#153b2a;box-shadow:inset 0 1px 0 rgba(255,255,255,.44),0 5px 14px rgba(32,75,49,.08);backdrop-filter:blur(16px) saturate(1.25);-webkit-backdrop-filter:blur(16px) saturate(1.25)}
.dialog--wind .wind-glass__actions .relax-secondary{border:1px solid rgba(255,255,255,.62);background:rgba(245,250,239,.28);color:#153b2a;box-shadow:inset 0 1px 0 rgba(255,255,255,.45);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.dialog--wind .relax-controls{display:none}
.dialog--wind .wind-glass--done{padding:24px}
.dialog--wind .wind-glass--done .relax-done{display:grid;justify-items:center;text-align:center}
.dialog--wind .wind-glass--done .relax-done>span{display:grid;width:48px;height:48px;place-items:center;margin-bottom:8px;border-radius:50%;background:#dff0e6;color:#32805d;font-size:26px}
.dialog--wind .wind-glass--done .relax-done h3{margin:0;color:#153b2a;font-size:20px}
.dialog--wind .wind-glass--done .relax-done p{margin:7px 0 0;color:#153b2a;font-size:14px}
.dialog--wind .wind-glass--done .wind-glass__actions{margin-top:16px;padding-top:0;border-top:0}
@media(max-width:760px),(orientation:portrait){
  .dialog--wind .relax-head{inset:12px 12px auto;grid-template-columns:44px 1fr 0;gap:8px}
  .dialog--wind .relax-head>div{grid-column:2;grid-row:1;padding:7px 10px}
  .dialog--wind .relax-head h2{font-size:16px}
  .dialog--wind .relax-head__privacy{display:none}
  .dialog--wind .relax-back{width:42px;min-width:42px;padding:0;justify-content:center}
  .dialog--wind .relax-back span{display:none}
  .dialog--wind .wind-glass{right:12px;bottom:max(12px,env(safe-area-inset-bottom));left:12px;width:auto;padding:15px 16px 14px;transform:none;border-radius:21px}
  .dialog--wind .wind-glass__heading b{font-size:17px}
  .dialog--wind .wind-glass__heading p{font-size:12px}
  .dialog--wind .wind-glass .sound-mark{width:40px;height:40px;border-radius:13px}
  .dialog--wind .wind-glass .sound-wave{display:none}
  .dialog--wind .wind-glass__actions{gap:8px;margin-top:10px;padding-top:10px}
  .dialog--wind .relax-clock{min-width:86px;margin-right:auto}
  .dialog--wind .relax-clock strong{font-size:21px}
  .dialog--wind .relax-clock span{max-width:90px;font-size:10px}
  .dialog--wind .wind-glass__actions .relax-primary,.dialog--wind .wind-glass__actions .relax-secondary{min-width:0;min-height:44px;padding-inline:12px;font-size:13px}
}
@media(prefers-reduced-motion:reduce){.dialog--wind .wind-glass .sound-wave.on i{animation:none;transform:scaleY(.7)}}
</style>
