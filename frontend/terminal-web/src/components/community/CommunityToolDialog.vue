<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'
import PrivacyIdleGuard from '../common/PrivacyIdleGuard.vue'
import LeaveConfirmation from '../common/LeaveConfirmation.vue'
import { createAnswerGate } from '@/utils/answerGate'
import { fetchWithTimeout } from '@/utils/net'
import { clientToken } from '@/utils/clientToken'

import { computed, ref } from 'vue'
import { extraAssessments, extraAssessmentResult } from '@/config/community/extraAssessments'
import { communityLibrary } from '@/community/library'
const scales = communityLibrary.value.scales

const props = defineProps<{ kind: 'self' | 'appointment' | 'hotline'; index?: number }>()
const emit = defineEmits<{ close: []; home: []; support: []; assessment: [index: number] }>()

const selected = ref<number[]>([])
const rawSelected = ref<number[]>([])
const answerGate = createAnswerGate()
const step = ref(0)
const finished = ref(false)
const safetyNotice = ref(false)
const submitted = ref(false)
const submitting = ref(false)
const appointmentToken = clientToken()
const appointmentTopics = ref<string[]>([])
const appointmentTopicOptions = ['情绪与压力', '睡眠困扰', '家庭与人际', '其他咨询']
const appointmentPhone = ref('')
const appointmentTime = ref('工作日上午')
const appointmentPhoneError = ref('')
const phoneKeypadOpen = ref(false)
const leaveTarget = ref<'close' | 'home' | null>(null)
function leave(target: 'close' | 'home') {
  if (submitting.value) return
  const hasDraft = props.kind === 'self'
    ? !finished.value && rawSelected.value.length > 0
    : props.kind === 'appointment' && !submitted.value && (appointmentPhone.value.length > 0 || appointmentTopics.value.length > 0)
  if (hasDraft) leaveTarget.value = target
  else if (target === 'home') emit('home')
  else emit('close')
}
function confirmLeave() {
  const target = leaveTarget.value
  leaveTarget.value = null
  if (target === 'home') emit('home')
  else emit('close')
}
const checkin = computed(() => scales[props.index || 0] || scales[0]!)
const extraResult = computed(() => finished.value && extraAssessments.some(item => item.short === checkin.value.short) ? extraAssessmentResult(checkin.value.short, selected.value, checkin.value) : null)
const score = computed(() => extraResult.value?.total ?? selected.value.reduce((total, value) => total + (value || 0), 0))
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

function answer(value: number, event: MouseEvent) {
  if (finished.value || event.detail > 1 || !answerGate.accept()) return
  rawSelected.value[step.value] = value
  selected.value[step.value] = extraAssessments.some(item => item.short === checkin.value.short) ? value : checkin.value.scoreMaps?.[step.value]?.[value] ?? value
  if (checkin.value.short === 'PHQ-9' && step.value === 8 && value > 0) safetyNotice.value = true
  if (step.value < checkin.value.questions.length - 1) step.value += 1
  else finished.value = true
}
function previousQuestion() { if (step.value > 0 && answerGate.accept()) step.value -= 1 }
const followupScales = computed(() => checkin.value.short === 'PHQ-4' ? [3, 5] : checkin.value.short === 'GAD-2' ? [3] : checkin.value.short === 'PHQ-2' ? [5] : [])
function toggleAppointmentTopic(topic: string) {
  appointmentTopics.value = appointmentTopics.value.includes(topic)
    ? appointmentTopics.value.filter(item => item !== topic)
    : [...appointmentTopics.value, topic]
}
async function submitAppointment() {
  if (submitting.value || submitted.value) return
  if (appointmentTopics.value.length === 0) {
    appointmentPhoneError.value = '请先选择希望获得的支持类型。'
    return
  }
  if (!/^1[3-9]\d{9}$/.test(appointmentPhone.value.trim())) {
    appointmentPhoneError.value = '请输入有效的 11 位手机号码，方便后续联系。'
    return
  }
  appointmentPhoneError.value = ''
  phoneKeypadOpen.value = false
  submitting.value = true
  try {
    const response = await fetchWithTimeout('/api/v1/community/appointments', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': localStorage.getItem('psych.device_token') || '' },
      body: JSON.stringify({ client_token: appointmentToken, device_id: localStorage.getItem('psych.device_id') || '', phone: appointmentPhone.value.trim(), topics: appointmentTopics.value, contact_time: appointmentTime.value }),
    }, 15000)
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : '暂时无法登记，请稍后重试')
    submitted.value = true
  } catch (error) { appointmentPhoneError.value = error instanceof Error && error.name !== 'AbortError' ? error.message : '连接暂时中断，可重新提交，不会重复登记' }
  finally { submitting.value = false }
}
const maskedAppointmentPhone = computed(() => appointmentPhone.value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2'))
function enterPhoneDigit(value: string) {
  if (appointmentPhone.value.length < 11) appointmentPhone.value += value
  appointmentPhoneError.value = ''
}
function editPhone(action: 'backspace' | 'clear') {
  appointmentPhone.value = action === 'clear' ? '' : appointmentPhone.value.slice(0, -1)
  appointmentPhoneError.value = ''
}

</script>

<template>
  <PrivacyIdleGuard v-if="kind !== 'hotline'" @expire="emit('home')" />
  <Teleport to="body">
  <LeaveConfirmation v-if="leaveTarget" :title="kind==='self' ? '这份自测还没完成' : '预约信息还未提交'" :message="kind==='self' ? '现在离开会清除本次答案。可以继续作答，也可以退出后重新开始。' : '现在离开会清除已填写的信息。可以继续填写，也可以直接退出。'" :stay-label="kind==='self' ? '继续作答' : '继续填写'" :leave-label="leaveTarget==='home' ? '退出并返回首页' : '退出并返回列表'" @stay="leaveTarget=null" @leave="confirmLeave" />
  <div :inert="leaveTarget ? true : undefined" :class="kind === 'self' ? 'self-assessment-screen' : 'service-screen'">
    <section class="dialog" :class="{ 'dialog--self': kind === 'self', 'dialog--appointment-keypad': kind === 'appointment' && phoneKeypadOpen }">
      <header v-if="kind === 'appointment' || kind === 'hotline'" class="service-header"><NavigationButton :disabled="submitting" @click="leave('close')">返回支持方式</NavigationButton><h1>{{ kind === 'appointment' ? '社区咨询预约' : '心理援助热线' }}</h1><NavigationButton :disabled="submitting" @click="leave('home')">返回首页</NavigationButton></header>
      <template v-if="kind === 'self'">
        <header class="self-assessment__header">
          <NavigationButton class="self-assessment__back" @click="leave('close')">返回量表列表</NavigationButton>
          <div class="self-assessment__title"><span>{{ checkin.resultMode === 'profile' ? '生活感受 · 中文参考译文' : '状态筛查' }} · {{ checkin.timeframe || '回顾过去两周' }}</span><h1>{{ checkin.title }}</h1></div>
          <div class="self-assessment__step"><b>{{ finished ? checkin.questions.length : step + 1 }}</b><span>/ {{ checkin.questions.length }} 题</span><NavigationButton class="service-home" @click="leave('home')">返回首页</NavigationButton></div>
        </header>
        <main class="self-assessment__main">
          <div class="self-assessment__content" :class="{ 'is-result': finished }">
            <section v-if="!finished" class="self-assessment__question-panel">
              <div class="self-assessment__progress"><div><span>已完成 {{ step }} 题</span><b>{{ Math.round(step / checkin.questions.length * 100) }}%</b></div><div class="progress"><i :style="{ width: `${step / checkin.questions.length * 100}%` }"/></div></div>
              <p class="self-assessment__kicker">第 {{ step + 1 }} 题</p><p v-if="checkin.questionHint" class="self-assessment__timeframe">{{ checkin.questionHint }}</p>
              <h2>{{ checkin.questions[step] }}</h2>
              <p class="self-assessment__timeframe">请根据{{ checkin.timeframe || '过去两周' }}的实际感受作答。</p>
            </section>
            <section v-if="!finished" class="self-assessment__answers-panel">
              <h2>请选择最符合你的选项</h2>
              <div class="answers" :class="{ 'answers--three': answerOptions.length === 3, 'answers--five': answerOptions.length === 5, 'answers--rating': checkin.resultMode === 'profile' }"><button v-for="(label,value) in answerOptions" :key="`${step}-${label}`" :class="{ selected: rawSelected[step] === value }" :aria-pressed="rawSelected[step] === value" @keydown="($event.repeat && $event.preventDefault())" @click="answer(value, $event)"><span v-if="checkin.resultMode!=='profile'">{{ String.fromCharCode(65 + value) }}</span>{{ label }}<b v-if="checkin.resultMode!=='profile'">›</b></button></div>
              <div class="answer-footer"><NavigationButton v-if="step>0" @click="previousQuestion">返回上一题</NavigationButton><small class="boundary">按真实感受选择，选好后自动继续。</small></div>
            </section>
            <section v-else class="self-assessment__result-panel" :class="{'is-profile':checkin.resultMode==='profile'}">
              <span class="self-assessment__result-mark">✓</span><p class="self-assessment__kicker">{{ checkin.resultMode==='profile' ? '生活感受记录已完成' : '本次筛查已完成' }}</p>
              <h2>{{ checkin.title }}</h2>
              <div v-if="checkin.resultMode==='profile'" class="self-profile-results"><article v-for="(label,index) in checkin.profileLabels" :key="label"><span>{{ label }}</span><strong>{{ extraResult?.scores[index] }}<small> / 10</small></strong><p>{{ index===3 ? '越高表示焦虑感越强' : '越高表示相应感受越强' }}</p></article></div><div v-else class="result"><span>本次得分</span><strong>{{ score }} / {{ maxScore }}</strong><b>{{ level }}</b></div><div class="result-explain"><h3>怎样理解这次结果</h3><p>{{ checkin.resultHint || subscaleHint || ((checkin.short === 'GAD-2' || checkin.short === 'PHQ-2') && score >= 3 ? '快速筛查达到参考界值，建议继续完成对应完整版量表，并结合专业人员意见理解结果。' : score >= 10 ? '建议联系心理或精神卫生专业人员进行进一步评估。' : '请结合日常功能和持续时间理解结果；如困扰持续或加重，建议主动求助。') }}</p></div>
              <div class="result-actions"><button v-for="index in followupScales" :key="index" class="primary" @click="emit('assessment', index)">继续 {{ scales[index]!.short }} 筛查</button><button class="primary" @click="emit('support')">查看支持方式</button></div><div v-if="checkin.resultMode!=='profile'" class="result-next"><span>接下来</span><p>先阅读结果说明，再结合日常感受理解。需要支持时，可以从首页进入社区咨询或查看心理援助热线。</p></div><p class="source">来源：{{ checkin.source }}<br />结果仅反映相应时间范围内的自报状态，不等于临床诊断。</p>
              <a v-if="checkin.sourceUrl" class="source" :href="checkin.sourceUrl" target="_blank" rel="noopener noreferrer">查看题目与计分来源 ↗</a><a v-if="checkin.licenseUrl" class="source" :href="checkin.licenseUrl" target="_blank" rel="noopener noreferrer">开放许可说明 ↗</a><NavigationButton class="primary" @click="$emit('close')">完成并返回自测列表</NavigationButton>
            </section>
          </div>
        </main>
        <div v-if="safetyNotice" class="safety"><section><span>请优先关注当前安全</span><h3>你刚才表示近期出现过伤害自己的想法</h3><p>请不要独自承受，尽快告诉身边可信任的人，并联系专业人员。若你现在可能立即伤害自己，请立刻拨打 110 / 120 或前往最近的急诊。</p><div><b>心理援助热线</b><strong>12356</strong></div><button class="primary" @click="safetyNotice=false">我已了解，查看筛查结果</button></section></div>
      </template>

      <main v-else-if="kind === 'appointment'" class="service-main">
        <section class="service-content" :class="{'service-content--success':submitted}">
          <template v-if="!submitted">
            <div class="appointment-intro"><span class="support-eyebrow">从说说近况开始</span><h2>想聊些什么？</h2><p class="intro">不需要准备专业的说法，选择你想聊的方向就好，可多选。</p></div>
            <div class="appointment-layout">
              <div class="appointment-form">
                <div class="choices" role="group" aria-label="希望获得的支持"><button v-for="topic in appointmentTopicOptions" :key="topic" type="button" :class="{selected:appointmentTopics.includes(topic)}" :aria-pressed="appointmentTopics.includes(topic)" @click="toggleAppointmentTopic(topic)"><span>{{ topic }}<small>{{ ({ "情绪与压力":"最近有点累，想找人聊聊", "睡眠困扰":"想聊聊最近的睡眠情况", "家庭与人际":"相处中的烦恼与困惑", "其他咨询":"还说不清楚，也可以" })[topic] }}</small></span><span v-if="appointmentTopics.includes(topic)" aria-hidden="true"> ✓</span></button></div>
                <div class="appointment-fields"><label>联系电话<input :value="appointmentPhone" type="tel" inputmode="none" readonly placeholder="点击输入 11 位手机号" @click="phoneKeypadOpen=true" /></label><label>方便联系时段<select v-model="appointmentTime"><option>工作日上午</option><option>工作日下午</option><option>周末</option></select></label></div>
                <p v-if="appointmentPhoneError" class="appointment-error" role="alert">{{ appointmentPhoneError }}</p>
                <button class="primary" :disabled="submitting" @click="submitAppointment">{{ submitting ? '正在登记…' : '提交预约意向' }}</button>
              </div>
              <aside v-if="phoneKeypadOpen" class="appointment-keypad" aria-label="手机号数字键盘"><header><b>输入联系电话</b><button type="button" @click="phoneKeypadOpen=false">完成</button></header><div class="appointment-keypad__grid"><button v-for="digit in ['1','2','3','4','5','6','7','8','9']" :key="digit" type="button" @click="enterPhoneDigit(digit)">{{ digit }}</button><button type="button" class="utility" @click="editPhone('clear')">清空</button><button type="button" @click="enterPhoneDigit('0')">0</button><button type="button" class="utility" aria-label="退格" @click="editPhone('backspace')">⌫</button></div><p>请输入 11 位手机号</p></aside>
            </div>
          </template>
          <template v-else><div class="success">✓</div><h2>预约意向已登记</h2><p class="intro">联系电话：{{ maskedAppointmentPhone }}<br />方便联系：{{ appointmentTime }}</p><NavigationButton class="primary" @click="$emit('home')">返回首页</NavigationButton></template>
        </section>
      </main>
      <main v-else class="service-main">
        <section class="service-content hotline-content">
          <div class="hotline-primary"><span class="eyebrow">全国统一心理援助热线</span><div class="hotline">12356</div><h2>需要时，有人听你说</h2><p class="intro">请使用手机拨打，获取心理咨询、疏导与支持。<br />具体服务时间以当地接听安排为准。</p></div>
          <div class="hotline-support"><div class="call-guide"><h2>不知道怎么开口？</h2><p>可以从这句话开始：</p><blockquote>“我最近有些困扰，想找人聊一聊。”</blockquote><span>找个相对安静的位置，按自己的节奏说就好。</span></div><div class="urgent"><b>遇到紧急危险时</b><span>如有立即伤害自己或他人的危险，请拨打 <strong>110 / 120</strong>，或前往最近的医疗机构急诊，并请身边可信任的人陪同。</span></div><p class="source">来源：国家卫生健康委员会《关于应用“12356”全国统一心理援助热线电话号码的通知》。</p><NavigationButton class="primary" @click="$emit('close')">返回支持方式</NavigationButton></div>
        </section>
      </main>
    </section>
  </div>
  </Teleport>
</template>

<style scoped>
.self-assessment-screen .answers--rating{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:12px!important}
.self-assessment-screen .answers--rating button{display:grid!important;place-items:center;min-height:62px!important;padding:10px!important;font-size:24px!important}
.self-profile-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:18px 0}
.self-profile-results article{padding:18px;border-radius:18px;background:#edf3ef;text-align:left}
.self-profile-results span,.self-profile-results strong{display:block;color:#304b41}
.self-profile-results strong{margin:6px 0;font-size:30px}.self-profile-results small{font-size:16px;font-weight:400}
.self-profile-results p{margin:0;color:#52665e;font-size:14px}


.overlay{position:fixed;z-index:420;inset:0;display:grid;place-items:center;padding:24px;background:rgba(30,47,41,.48);backdrop-filter:blur(6px)}.dialog{position:relative;box-sizing:border-box;width:min(720px,94vw);max-height:88vh;overflow:auto;padding:34px 40px;border-radius:28px;background:#fff;color:#30463f;box-shadow:0 28px 80px rgba(20,39,32,.28)}.close{position:absolute;right:18px;top:16px;width:42px;height:42px;border:0;border-radius:50%;background:#eef3f0;color:#526861;font-size:25px}.eyebrow{color:#54806f;font-size:12px;font-weight:800}.dialog h2{margin:8px 0 22px;font-size:27px}.timer{display:grid;justify-items:center;padding:20px;border-radius:20px;background:#e8f2ed}.timer i{width:76px;height:76px;border-radius:50%;background:#83b5a0}.timer i.running{animation:pulse 10s ease-in-out infinite}.timer strong{margin-top:8px;font-size:30px}.timer small{color:#667a72}.dialog ol{display:grid;gap:10px;padding-left:24px;line-height:1.6}.source,.boundary{display:block;color:#7b8a84;font-size:11px;line-height:1.6}.primary{min-width:180px;height:50px;margin-top:18px;border:0;border-radius:13px;background:#397866;color:#fff;font-size:15px;font-weight:800}.primary:disabled{background:#9badA6}.progress{height:8px;margin-bottom:25px;border-radius:10px;background:#e9eeeb}.progress i{display:block;height:100%;border-radius:10px;background:#6ba089}.question{min-height:62px;font-size:20px;font-weight:700;line-height:1.55}.answers,.choices{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.answers button,.choices button{min-height:54px;border:1px solid #d9e3de;border-radius:13px;background:#f8faf9;color:#344c44;font-weight:700}.result,.urgent{padding:20px;border-radius:17px;background:#f1f5f3}.result b,.urgent b,.urgent span{display:block}.result p,.intro{color:#61736c;line-height:1.7}.dialog label{display:grid;gap:8px;margin-top:18px;font-weight:700}.dialog select{height:48px;padding:0 14px;border:1px solid #d9e3de;border-radius:12px;background:#fff}.success{display:grid;place-items:center;width:74px;height:74px;border-radius:50%;background:#dceee5;color:#397866;font-size:35px}.hotline{padding:20px;border-radius:18px;background:#e8eef5;color:#4e6e88;font-size:42px;font-weight:850;letter-spacing:.12em;text-align:center}.urgent{margin-top:15px;background:#f8ece8}.urgent span{margin-top:6px;color:#735e56;line-height:1.6}@keyframes pulse{0%,100%{transform:scale(.72)}40%,60%{transform:scale(1)}}
.answers--three{grid-template-columns:repeat(3,1fr)}
.answers--five{grid-template-columns:repeat(5,1fr)}.answers--five button{padding:8px;font-size:12px}


.result span,.result strong{display:block}.result strong{margin:5px 0;color:#397866;font-size:36px}.safety{position:absolute;z-index:5;inset:0;display:grid;place-items:center;padding:28px;background:rgba(75,39,35,.58);backdrop-filter:blur(5px)}.safety section{padding:30px;border-radius:22px;background:#fff7f4;box-shadow:0 20px 60px rgba(72,30,27,.28)}.safety section>span{color:#a44e45;font-weight:800}.safety h3{font-size:22px}.safety p{color:#66534e;line-height:1.75}.safety section>div{display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:14px;background:#f4dfd9}.safety section>div b{display:block}.safety strong{font-size:28px;letter-spacing:.1em}


/* 社区工具弹窗亲和视觉层。 */
.overlay{background:rgba(40,56,50,.36);backdrop-filter:blur(8px)}
.dialog{width:min(760px,94vw);padding:38px 44px;border-radius:32px;background:#fffdfa;color:#2c433b;box-shadow:0 26px 70px rgba(35,54,47,.22);font-family:"Microsoft YaHei UI","PingFang SC",sans-serif}
.close{right:20px;top:18px;border-radius:15px;background:#edf2ee;color:#52685f}.eyebrow{display:inline-block;padding:6px 10px;border-radius:9px;background:#e7f1eb;color:#477261;font-size:13px}.dialog h2{margin:12px 0 25px;font-size:29px;line-height:1.4}.progress{height:10px;border-radius:99px;background:#edf0ec}.progress i{background:#73a98f}.question{min-height:74px;font-size:23px;line-height:1.6}.answers,.choices{gap:14px}.answers button,.choices button{min-height:62px;padding:10px 16px;border:0;border-radius:17px;background:#eff4f0;color:#324940;font-size:15px}.answers button:nth-child(2n),.choices button:nth-child(2n){background:#edf1f7}.primary{height:54px;border-radius:15px;font-size:16px;box-shadow:0 8px 18px rgba(57,120,102,.14)}.timer{border-radius:25px;background:#e6f1eb}.result,.urgent{padding:25px;border-radius:22px;background:#eef4f0}.result strong{font-size:42px}.result p,.intro{font-size:14px;line-height:1.8}.source,.boundary{font-size:12px}.hotline{border-radius:22px;background:#e7eef5}
@media(max-width:1050px),(max-height:650px){.dialog{padding:27px 32px}.dialog h2{font-size:24px}.question{min-height:58px;font-size:19px}.answers button,.choices button{min-height:52px;font-size:13px}}


/* 心理自测是独立全屏页面，不使用居中弹窗。 */
.self-assessment-screen{position:fixed;z-index:420;inset:0;overflow:hidden;background:#f4f7f3;color:#30483c}
.dialog.dialog--self{position:relative;display:grid;grid-template-rows:92px minmax(0,1fr);box-sizing:border-box;width:100vw;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;overflow:hidden;padding:0;border:0;border-radius:0;background:#f4f7f3;box-shadow:none}
.self-assessment__header{display:grid;grid-template-columns:minmax(190px,1fr) minmax(300px,1.4fr) minmax(190px,1fr);align-items:center;gap:18px;padding:0 24px;background:#fff;box-shadow:0 5px 18px rgba(47,73,58,.045)}
.self-assessment__back{justify-self:start;min-height:46px;padding:0 16px;border:0;border-radius:14px;background:#edf3ed;color:#42654d;font-size:21px;font-weight:700}
.self-assessment__back span{font-size:14px}
.self-assessment__title{text-align:center}
.self-assessment__title>span{color:#718479;font-size:12px}
.self-assessment__title h1{margin:3px 0 0;color:#2d4838;font-size:22px}
.self-assessment__step{justify-self:end;display:flex;align-items:baseline;gap:6px;color:#75857a}
.self-assessment__step b{color:#4c8060;font-size:25px}
.self-assessment__step span{font-size:13px}
.self-assessment__main{display:grid;min-height:0;overflow:auto;place-items:center;padding:28px clamp(22px,5vw,72px)}
.self-assessment__content{display:grid;grid-template-columns:minmax(0,1fr) minmax(390px,.92fr);gap:22px;width:min(1120px,100%);align-items:stretch}
.self-assessment__question-panel,.self-assessment__answers-panel,.self-assessment__result-panel{box-sizing:border-box;min-width:0;padding:clamp(25px,3vw,42px);border:1px solid rgba(255,255,255,.86);border-radius:26px;background:#fff;box-shadow:0 12px 34px rgba(48,72,60,.055)}
.self-assessment__question-panel{display:flex;flex-direction:column;justify-content:center;min-height:420px;background:linear-gradient(145deg,#e8f1e9,#eef3ed 78%)}
.self-assessment__progress{margin-bottom:auto}
.self-assessment__progress>div:first-child{display:flex;justify-content:space-between;margin-bottom:10px;color:#6c8072;font-size:13px}
.self-assessment__progress>div:first-child b{color:#4a7b59}
.self-assessment__progress .progress{height:8px;margin:0;background:#dce8dd}
.self-assessment__progress .progress i{background:#55916a}
.self-assessment__kicker{margin:28px 0 8px;color:#598068;font-size:13px;font-weight:800}
.self-assessment__question-panel h2{margin:0;color:#2b4636;font-size:clamp(25px,3vw,34px);line-height:1.55}
.self-assessment__timeframe{margin:14px 0 0;color:#6d7d71;font-size:15px;line-height:1.6}
.self-assessment__answers-panel{display:flex;flex-direction:column;justify-content:center}
.self-assessment__answers-panel>h2{margin:0 0 18px;color:#3b5545;font-size:18px}
.dialog--self .answers{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.dialog--self .answers button{display:grid;grid-template-columns:34px minmax(0,1fr) 18px;align-items:center;gap:10px;min-height:68px;padding:10px 14px;border:1px solid #e1e9e1;border-radius:16px;background:#f8faf7;color:#354d3e;text-align:left;font-size:15px;font-weight:700;line-height:1.4}
.dialog--self .answers button:nth-child(2n){background:#f1f5f0}
.dialog--self .answers button>span{display:grid;width:30px;height:30px;place-items:center;border-radius:10px;background:#e3eee3;color:#568061;font-size:13px;font-weight:800}
.dialog--self .answers button>b{color:#8c9b8e;font-size:23px;font-weight:500}
.dialog--self .answers button:active{border-color:#79a783;background:#e8f2e8;transform:scale(.99)}
.self-assessment__answers-panel .boundary{margin-top:17px}
.self-assessment__content.is-result{grid-template-columns:minmax(0,760px);justify-content:center}
.self-assessment__result-panel{display:grid;justify-items:center;text-align:center;padding:34px 48px}
.self-assessment__result-mark{display:grid;width:62px;height:62px;place-items:center;border-radius:50%;background:#e4f0e6;color:#4d8a61;font-size:30px;font-weight:800}
.self-assessment__result-panel .self-assessment__kicker{margin:14px 0 4px}
.self-assessment__result-panel>h2{margin:0 0 18px;color:#2d4838;font-size:25px}
.self-assessment__result-panel .result{width:100%;padding:22px;border-radius:20px;background:#f1f6f1;text-align:center}
.self-assessment__result-panel .result p{max-width:620px;margin:12px auto 0}
.self-assessment__result-panel .source{margin-top:15px}
.self-assessment__result-panel .primary{min-width:230px;margin-top:14px}
@media(max-width:900px),(max-height:650px){
  .dialog.dialog--self{grid-template-rows:76px minmax(0,1fr)}
  .self-assessment__header{grid-template-columns:minmax(120px,1fr) minmax(220px,1.4fr) minmax(90px,1fr);gap:10px;padding-inline:18px}
  .self-assessment__back{min-height:42px;padding-inline:12px;font-size:18px}
  .self-assessment__back span{font-size:12px}
  .self-assessment__title h1{font-size:19px}
  .self-assessment__content{grid-template-columns:minmax(0,1fr) minmax(330px,.92fr);gap:14px}
  .self-assessment__question-panel{min-height:350px}
  .self-assessment__question-panel,.self-assessment__answers-panel,.self-assessment__result-panel{padding:24px}
  .dialog--self .answers{gap:9px}
  .dialog--self .answers button{min-height:58px;padding:8px 10px;font-size:13px}
}
@media(max-width:700px),(orientation:portrait){
  .dialog.dialog--self{grid-template-rows:72px minmax(0,1fr)}
  .self-assessment__header{grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding-inline:10px}
  .self-assessment__back{width:42px;min-height:42px;padding:0;overflow:hidden;font-size:20px;white-space:nowrap}
  .self-assessment__back span{display:none}
  .self-assessment__title{text-align:left}
  .self-assessment__title>span{font-size:10px}
  .self-assessment__title h1{font-size:16px}
  .self-assessment__step b{font-size:20px}
  .self-assessment__step span{font-size:11px}
  .self-assessment__main{align-items:start;padding:14px}
  .self-assessment__content,.self-assessment__content.is-result{grid-template-columns:minmax(0,1fr);gap:12px}
  .self-assessment__question-panel{min-height:230px}
  .self-assessment__question-panel,.self-assessment__answers-panel,.self-assessment__result-panel{padding:20px;border-radius:20px}
  .self-assessment__kicker{margin-top:20px}
  .self-assessment__question-panel h2{font-size:22px}
  .self-assessment__answers-panel>h2{font-size:16px}
  .dialog--self .answers{grid-template-columns:minmax(0,1fr)}
  .dialog--self .answers button{min-height:52px}
  .self-assessment__result-panel .result{padding:17px}
  .self-assessment__result-panel .primary{min-width:0;width:100%}
}


.overlay button { -webkit-appearance: none; appearance: none; -webkit-tap-highlight-color: transparent; }
.overlay button:focus:not(:focus-visible) { outline: none; box-shadow: none; }
.overlay button:focus-visible { outline: 2px solid #78a88e; outline-offset: 2px; }
.overlay .choices button.selected { border: 2px solid #78a88e; background: #dcece4 !important; color: #315e50; box-shadow: inset 0 0 0 1px rgba(49,94,80,.06); }
.overlay .choices button:active { transform: none; filter: none; }
.overlay .choices button:nth-child(2n) { background: #eff4f0; }
.overlay select { -webkit-tap-highlight-color: transparent; }
.overlay select:focus { outline: none; border-color: #78a88e !important; box-shadow: 0 0 0 3px rgba(120,168,142,.18); }
.appointment-fields{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:end}
.appointment-fields label{min-width:0}
.appointment-fields input{box-sizing:border-box;width:100%;height:48px;padding:0 14px;border:1px solid #d9e3de;border-radius:12px;background:#fff;color:#344c44;font:inherit;font-weight:500}
.appointment-fields input::placeholder{color:#9aa7a1}
.appointment-fields input:focus{outline:none;border-color:#78a88e;box-shadow:0 0 0 3px rgba(120,168,142,.18)}
.appointment-error{margin:8px 0 0;color:#a64e46;font-size:13px}
@media(max-width:700px){.appointment-fields{grid-template-columns:1fr;gap:0}}


.dialog.dialog--appointment-keypad { width: min(930px, calc(100vw - 40px)); }
.appointment-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; align-items: center; }
.dialog--appointment-keypad .appointment-layout { grid-template-columns: minmax(0, 1fr) 228px; }
.appointment-form { min-width: 0; }
.appointment-keypad { min-width: 0; padding: 15px; border-radius: 18px; background: #f1f5f2; }
.appointment-keypad header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; color: #344c44; }
.appointment-keypad header button { padding: 7px 10px; border: 0; border-radius: 9px; background: #dcece4; color: #315e50; font-size: 13px; font-weight: 750; }
.appointment-keypad__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.appointment-keypad__grid button { min-width: 0; min-height: 46px; padding: 0; border: 0; border-radius: 11px; background: #fff; color: #344c44; font-size: 20px; font-weight: 700; }
.appointment-keypad__grid button.utility { background: #e4ece6; color: #536b5f; font-size: 13px; }
.appointment-keypad>p { margin: 10px 0 0; color: #7c8c83; font-size: 11px; text-align: center; }
.appointment-fields input { cursor: pointer; }
@media(max-width:700px){.dialog.dialog--appointment-keypad{width:calc(100vw - 24px)}.dialog--appointment-keypad .appointment-layout{grid-template-columns:minmax(0,1fr)}.appointment-keypad__grid button{min-height:40px}}
</style>
<style scoped src="../../styles/community-tools.css"></style>

<style scoped>
.self-assessment-screen .self-assessment__result-panel.is-profile{display:block!important;width:min(940px,100%);max-width:940px}
.is-profile .self-profile-results{grid-template-columns:repeat(4,minmax(0,1fr));margin:22px 0}
.is-profile .result-explain{margin:18px 0}
@media(max-width:700px){.is-profile .self-profile-results{grid-template-columns:repeat(2,minmax(0,1fr))}}

.answers button.selected{background:#d5e9dd!important;color:#214c38!important;border:2px solid #397b65!important}.result-actions{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.result-actions button{min-height:52px;padding:12px 20px;font-size:17px}.primary:disabled{opacity:.6}</style>
