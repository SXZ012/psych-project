<script setup lang="ts">
import { ref } from 'vue'
import PrivacyIdleGuard from '../common/PrivacyIdleGuard.vue'
const props = defineProps<{ code?: string; resume?: (code: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; exit: [] }>()
const value = ref(''), error = ref(''), busy = ref(false)
async function restore() {
  if (busy.value || value.value.length !== 12) return
  busy.value = true; error.value = ''
  try { await props.resume?.(value.value); emit('close') }
  catch (e) { error.value = e instanceof Error ? e.message : '恢复失败，请重试' }
  finally { busy.value = false }
}
</script>
<template>
  <Teleport to="body"><div class="recovery-overlay"><section role="dialog" aria-modal="true" aria-labelledby="recovery-title">
    <h2 id="recovery-title">{{ resume ? '恢复未完成测评' : '保存恢复码，再返回首页' }}</h2>
    <p v-if="!resume">请拍照保存这组 12 位测评恢复码。退出或断电后，7 天内可在本机选择“已支付 · 恢复未完成测评”，核验原订单后继续，无需重复支付。未完成的 60 秒采集将重新开始。</p>
    <p v-else>输入手机确认页或退出时保存的 12 位测评恢复码（不是报告编号）。核验原订单后即可继续，无需重复支付。</p>
    <strong v-if="!resume">{{ code?.replace(/(.{4})(?=.)/g, '$1 ') || '请保留手机确认页面' }}</strong>
    <template v-else><input :value="value" readonly inputmode="none" placeholder="12 位测评恢复码" aria-label="测评恢复码" /><div class="keypad"><button v-for="key in '123456789'" :key="key" :disabled="busy" @click="value=(value+key).slice(0,12)">{{ key }}</button><button @click="value=''">清空</button><button @click="value=(value+'0').slice(0,12)">0</button><button @click="value=value.slice(0,-1)">退格</button></div></template>
    <p v-if="error" role="alert">{{ error }}</p>
    <footer><button :disabled="busy" @click="emit('close')">{{ resume ? '返回' : '继续测评' }}</button><button class="primary" :disabled="busy || (Boolean(resume) && value.length!==12)" @click="resume ? restore() : emit('exit')">{{ busy ? '正在恢复…' : resume ? '恢复测评' : '已保存，返回首页' }}</button></footer>
  </section></div></Teleport>
  <PrivacyIdleGuard :seconds="120" @expire="emit('exit')" />
</template>
<style scoped>
.recovery-overlay{position:fixed;inset:0;z-index:900;background:#23382f55;display:grid;place-items:center;padding:20px}.recovery-overlay section{width:min(600px,90vw);max-height:90vh;overflow:auto;border-radius:24px;padding:28px;background:#f8faf6;color:#2b4338}.recovery-overlay h2{font-size:28px;margin:0 0 16px}.recovery-overlay p{font-size:18px;line-height:1.7}.recovery-overlay strong{display:block;font-size:32px;letter-spacing:.15em;margin:24px 0}.recovery-overlay input{width:100%;box-sizing:border-box;font-size:26px;padding:12px;border:1px solid #cad8cd;border-radius:12px}.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}button{min-height:52px;background:#e5ece5;border:0;border-radius:12px;font-size:18px;color:#2d4b3b;-webkit-tap-highlight-color:transparent}button:disabled{opacity:.55}footer{display:flex;gap:12px;margin-top:22px}footer button{flex:1}.primary{background:#397b65;color:white}
</style>
