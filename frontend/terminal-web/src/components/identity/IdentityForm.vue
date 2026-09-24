<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UserIdentity } from '@/types/terminal'

const emit = defineEmits<{ submit: [identity: UserIdentity]; back: [] }>()
const name = ref('')
const employeeNo = ref('')
const error = ref('')
const padOpen = ref<'employee' | null>(null)

// 姓名使用终端系统输入法；工号和年龄继续使用数字键盘。
const employeeNoValid = computed(() => /^\d{2,18}$/.test(employeeNo.value.trim()))
const canSubmit = computed(() => name.value.trim().replace(/\s+/g, ' ').length >= 2 && employeeNoValid.value)
const padTitle = computed(() => `工号输入 · ${employeeNo.value.length}/18 位`)

function openPad() { padOpen.value = 'employee'; error.value = '' }
function closePad() { padOpen.value = null }

function addKey(key: string) {
  const target = padOpen.value
  if (target === 'employee') {
    if (employeeNo.value.length < 18) employeeNo.value += key
  }
  error.value = ''
}

function backspace() {
  if (padOpen.value === 'employee') employeeNo.value = employeeNo.value.slice(0, -1)
  error.value = ''
}

function clearPad() {
  if (padOpen.value === 'employee') employeeNo.value = ''
  error.value = ''
}

function submit() {
  const cleanName = name.value.trim().replace(/\s+/g, ' ')
  if (cleanName.length < 2) return void (error.value = '请输入 2—20 位姓名，支持中文和英文')
  if (!employeeNoValid.value) return void (error.value = '请点击工号栏，输入 2—18 位数字工号')
  // 合作方接口仍保留这两个可选字段；终端不再采集，提交为空值即可。
  emit('submit', { name: cleanName, employee_no: employeeNo.value.trim(), gender: '', age: 0 })
}
</script>

<template>
  <main class="identity-screen" :class="{ 'identity-screen--keypad': padOpen }">
    <div class="identity-brand">AI视觉心理评估终端</div>
    <aside v-if="padOpen" class="employee-keypad open" aria-label="数字输入键盘">
      <div class="employee-keypad__head"><p>{{ padTitle }}</p><button class="employee-keypad__close" @click="closePad">完成</button></div>
      <div class="employee-keypad__grid">
        <button v-for="key in ['1','2','3']" :key="key" @click="addKey(key)">{{ key }}</button><button class="employee-keypad__function" aria-label="退格" @click="backspace">⌫</button>
        <button v-for="key in ['4','5','6']" :key="key" @click="addKey(key)">{{ key }}</button><button class="employee-keypad__function" @click="clearPad">清空</button>
        <button v-for="key in ['7','8','9']" :key="key" @click="addKey(key)">{{ key }}</button><i class="employee-keypad__placeholder" aria-hidden="true"></i>
        <button class="employee-keypad__zero" @click="addKey('0')">0</button><button class="employee-keypad__done" @click="closePad">完成</button>
      </div>
    </aside>
    <section class="identity-intro">
      <h1>开始前，确认您的信息</h1>
      <p>仅需两项信息，即可开始本次心理状态辅助测评。</p>
      <div class="identity-intro__steps">
        <span><b>01</b>填写姓名与工号</span><span><b>02</b>确认知情同意</span><span><b>03</b>人脸就位与操作体验</span><span><b>04</b>进行约 60 秒正式测评</span>
      </div>
      <small>信息仅用于本次测评与报告关联</small>
    </section>
    <section class="identity-card">
      <p class="eyebrow">测评准备 · 第 1 步，共 4 步</p><h1>填写测评信息</h1><p class="muted">请确认信息准确，便于后续查询报告</p>
      <label>真实姓名<span class="input-meta">{{ name.length }}/20</span>
        <input v-model="name" class="field-display" type="text" inputmode="text" lang="zh-CN" xml:lang="zh-CN" spellcheck="true" autocapitalize="words" maxlength="20" autocomplete="name" placeholder="请输入姓名（支持中文）" @focus="closePad" />
      </label>
      <label>工号<span class="input-meta">{{ employeeNo.length }}/18</span>
        <button type="button" class="field-display" tabindex="-1" @click="openPad">
          <span :class="{ placeholder: !employeeNo }">{{ employeeNo || '请点击输入工号' }}</span>
        </button>
      </label>
      <p class="form-error">{{ error }}</p><button class="primary" :disabled="!canSubmit" @click="submit">下一步：阅读知情同意</button><button class="identity-back" type="button" @click="emit('back')">← 返回首页</button><small>填写姓名和工号后即可继续</small>
    </section>
  </main>
</template>

<style scoped>
.employee-keypad{position:absolute;z-index:2;top:50%;right:calc(11% + 490px);width:min(340px,37vw);padding:16px;border:1px solid #dce6e1;border-radius:22px;background:#f5f8f6;box-shadow:0 8px 22px #3753471f;transform:translate3d(0,-50%,0)}.employee-keypad.open{opacity:1;visibility:visible;pointer-events:auto}.employee-keypad__head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:11px}.employee-keypad__head p{margin:0;color:#4b625c;font-size:12px;font-weight:650;letter-spacing:.06em}.employee-keypad__close{display:none}.employee-keypad__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.employee-keypad__grid button{height:56px;border:1px solid #cbdad3;border-radius:12px;color:#263c35;background:#fff;font-size:21px;font-weight:650;touch-action:manipulation}.employee-keypad__grid button:active{background:#e4ede6}.employee-keypad__function{color:#3e6154!important;background:#668d7e21!important;font-size:14px!important}.employee-keypad__placeholder{border:1px solid transparent;border-radius:12px}.employee-keypad__zero,.employee-keypad__done{grid-column:span 2}.employee-keypad__done{color:#fff!important;background:#4e7f70!important;font-size:15px!important}
.employee-keypad.name-mode{position:fixed;top:auto;right:auto;bottom:18px;left:50%;transform:translateX(-50%);width:min(660px,calc(100vw - 36px))}.employee-keypad__letters{display:grid;grid-template-columns:repeat(10,1fr);gap:7px}.employee-keypad__letters button{height:52px;border:1px solid #cbdad3;border-radius:10px;color:#263c35;background:#fff;font-size:15px;font-weight:650;touch-action:manipulation}.employee-keypad__letters button:active{background:#e4ede6}.employee-keypad__letters-back{color:#3e6154!important;background:#668d7e21!important;font-size:14px!important}.employee-keypad__letters-done{color:#fff!important;background:#4e7f70!important;font-size:13px!important}.employee-keypad__function{font-size:13px!important}
.field-display{display:flex;align-items:center;width:100%;height:56px;padding:0 17px;border:1px solid #738f8559;border-radius:14px;background:#fffde;color:#263c35;font-size:17px;text-align:left;cursor:pointer;touch-action:manipulation}.field-display:active{border-color:#79a99a;background:#f2f7f4}.field-display span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.field-display span.placeholder{color:#9ab0a6;font-size:15px}
.gender-toggle{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.gender-toggle button{height:56px;border:1px solid #738f8559;border-radius:14px;background:#fffde;color:#263c35;font-size:17px;font-weight:650;transition:border-color .15s,background .15s,box-shadow .15s;touch-action:manipulation}
.gender-toggle button.active{border-color:#79a99a;background:#e9f2ec;box-shadow:inset 0 0 0 1px #79a99a55}
.identity-back{border:0;background:transparent;color:#627b72;font-size:14px;text-decoration:underline}
@media(max-height:680px){.employee-keypad{width:320px;padding:12px}.employee-keypad__grid{gap:8px}.employee-keypad__grid button{height:48px}.employee-keypad__letters{gap:6px}.employee-keypad__letters button{height:44px;font-size:14px}.field-display{height:48px}}
@media(max-width:800px),(orientation:portrait){.employee-keypad{position:fixed;top:auto;right:24px;bottom:24px;left:auto;transform:none;width:calc(100% - 48px);max-width:480px}}
</style>

<style scoped>
/* 浅色服务主题的最终覆盖：不改登记页布局，只恢复输入可读性。 */
.field-display{border-color:#c9d8dc;background:#fbfcfc;color:#263746}.field-display:active{border-color:#5f8b9f;background:#f2f7f7}.field-display span.placeholder{color:#7d9098}
.identity-back{color:#2f5d7c}.identity-intro{color:#385563}.identity-intro h1{color:#294354}.identity-intro>p{color:#607782}.identity-intro__steps span{color:#506a75}.identity-intro__steps b{color:#3c7069;background:#e5f1ed;border-color:#b8d8cf}.identity-intro>small{color:#71848d}
.employee-keypad{background:#fff;border-color:#d5e1e2;box-shadow:0 12px 30px rgba(38,55,70,.15)}.employee-keypad__head p{color:#49616e}.employee-keypad__grid button{color:#294354;background:#fbfcfc;border-color:#d1dfe0}.employee-keypad__grid button:active{background:#edf4f3}.employee-keypad__function{color:#3f7168!important;background:#e7f2ee!important}.employee-keypad__done{background:#4f8d82!important}.identity-screen--keypad .employee-keypad{box-shadow:0 18px 42px rgba(38,55,70,.18)}
</style>

<style scoped>
/* 登记信息页提高文字对比度，保留既有蓝色背景和绿色操作按钮。 */
.identity-brand{color:#29495d}.identity-intro{color:#2d4c5b}.identity-intro h1{color:#203d4e}
.identity-intro>p{color:#46626f}.identity-intro__steps span{color:#3d5967}.identity-intro>small{color:#637984}
.identity-card h1{color:#203d4e}.identity-card label{color:#385463}.identity-card .muted{color:#4c6672}.input-meta{color:#607984}
.field-display span.placeholder{color:#687f8a}.identity-back{color:#285b77}.identity-card>small{color:#5d7480}
</style>

<style scoped>
/* 登记页与首页使用同一套终端主题，避免出现浅色网页表单。 */
.field-display{height:58px;border-color:#b7d8df70;background:#0f2a41d9;color:#f4fbff;font-size:18px}.field-display:active{border-color:#77d6bd;background:#153850}.field-display span.placeholder{color:#9db8c8;font-size:16px}
.gender-toggle button{height:58px;border-color:#b7d8df70;background:#0f2a41d9;color:#edf8ff;font-size:18px}.gender-toggle button.active{border-color:#77d6bd;background:#236454;box-shadow:inset 0 0 0 1px #9de9d055}.identity-back{min-height:48px;color:#c5dce8;font-size:17px}
.employee-keypad{right:calc(10% + 510px);border-color:#b6d8dd77;background:#173a54f5;box-shadow:0 12px 36px #07182870}.employee-keypad__head p{color:#c6dce7}.employee-keypad__grid button{border-color:#b6d8dd5c;color:#effaff;background:#0f2a41}.employee-keypad__grid button:active{background:#244e65}.employee-keypad__function{color:#afe5d5!important;background:#58b4971c!important}.employee-keypad__done{background:#287969!important}
</style>

<style scoped>
.identity-screen{gap:clamp(42px,7vw,108px)}
.identity-intro{position:relative;z-index:1;width:min(410px,34vw);display:grid;gap:18px;align-content:center;color:#eff9ff}.identity-intro h1{margin:0;font-family:serif;font-size:clamp(30px,3.1vw,45px);font-weight:500;line-height:1.3;letter-spacing:.03em}.identity-intro>p{margin:0;color:#c5d9e5;font-size:clamp(16px,1.5vw,19px);line-height:1.75}.identity-intro__steps{display:grid;gap:12px;margin-top:8px}.identity-intro__steps span{display:flex;align-items:center;gap:12px;color:#d8e8f0;font-size:clamp(14px,1.3vw,17px)}.identity-intro__steps b{display:grid;place-items:center;width:32px;height:32px;border:1px solid #8edec8a8;border-radius:50%;color:#b8f3df;background:#65c6ad24;font-size:12px}.identity-intro>small{margin-top:8px;color:#91adbc;font-size:14px}.identity-card{margin:0}.identity-card .primary{margin-top:8px}
@media(max-width:960px),(orientation:portrait){.identity-screen{justify-content:center}.identity-intro{display:none}.employee-keypad{right:calc(50% + 260px)}}
@media(max-width:760px),(orientation:portrait){.employee-keypad{right:24px}}
.identity-card .primary:disabled{cursor:not-allowed;filter:saturate(.45);opacity:.48;box-shadow:none}
.identity-screen--keypad .identity-intro{filter:blur(5px);opacity:.42;transition:filter .18s ease,opacity .18s ease}.identity-screen--keypad .identity-card{position:relative;z-index:1}.identity-screen--keypad .employee-keypad{z-index:4;box-shadow:0 20px 52px #061624aa}
</style>

<style scoped>
/* 最终色彩覆盖必须置于历史深色样式之后。 */
.field-display{border-color:#c9d8dc;background:#fbfcfc;color:#263746}.field-display:active{border-color:#5f8b9f;background:#f2f7f7}.field-display span.placeholder{color:#7d9098}
.identity-back{color:#2f5d7c}.identity-intro{color:#385563}.identity-intro h1{color:#294354}.identity-intro>p{color:#607782}.identity-intro__steps span{color:#506a75}.identity-intro__steps b{color:#3c7069;background:#e5f1ed;border-color:#b8d8cf}.identity-intro>small{color:#71848d}
.employee-keypad{background:#fff;border-color:#d5e1e2;box-shadow:0 12px 30px rgba(38,55,70,.15)}.employee-keypad__head p{color:#49616e}.employee-keypad__grid button{color:#294354;background:#fbfcfc;border-color:#d1dfe0}.employee-keypad__grid button:active{background:#edf4f3}.employee-keypad__function{color:#3f7168!important;background:#e7f2ee!important}.employee-keypad__done{background:#4f8d82!important}.identity-screen--keypad .employee-keypad{box-shadow:0 18px 42px rgba(38,55,70,.18)}
</style>
