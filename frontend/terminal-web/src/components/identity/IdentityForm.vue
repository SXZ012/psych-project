<script setup lang="ts">
import { computed, ref } from 'vue'
import type { UserIdentity } from '@/types/terminal'

const emit = defineEmits<{ submit: [identity: UserIdentity] }>()
const name = ref(''), idCard = ref(''), error = ref(''), idPadOpen = ref(false)
const idValid = computed(() => /^\d{17}[\dX]$/.test(idCard.value))
const idDisplay = computed(() => `${idCard.value.slice(0, 6)} ${idCard.value.slice(6, 14)} ${idCard.value.slice(14)}`.trim())
function openIdPad() { idPadOpen.value = true; error.value = '' }
function idKey(key: string) { if (idCard.value.length >= 18 || (key === 'X' && idCard.value.length !== 17)) return; idCard.value += key; error.value = '' }
function idBackspace() { idCard.value = idCard.value.slice(0, -1); error.value = '' }
function idClear() { idCard.value = ''; error.value = '' }
function submit() { if (name.value.trim().length < 2) return void (error.value = '请输入 2—20 个字符的真实姓名'); if (!idValid.value) return void (error.value = '请输入完整的 18 位身份证号码'); emit('submit', { name: name.value.trim(), id_card: idCard.value }); }
</script>
<template>
  <main class="identity-screen">
    <div class="identity-brand">心理健康测评系统</div>
    <aside class="id-keypad" :class="{ open: idPadOpen }" aria-label="身份证数字键盘">
      <p>身份证号键盘 · 已输入 {{ idCard.length }}/18 位</p>
      <div class="id-keypad__grid">
        <button v-for="key in ['1','2','3']" :key="key" @click="idKey(key)">{{ key }}</button><button class="id-keypad__function" aria-label="退格" @click="idBackspace">⌫</button>
        <button v-for="key in ['4','5','6']" :key="key" @click="idKey(key)">{{ key }}</button><button class="id-keypad__function" @click="idClear">清空</button>
        <button v-for="key in ['7','8','9']" :key="key" @click="idKey(key)">{{ key }}</button><button class="id-keypad__function" :disabled="idCard.length !== 17" @click="idKey('X')">X</button>
        <button class="id-keypad__zero" @click="idKey('0')">0</button><button class="id-keypad__done" @click="idPadOpen=false">完成</button>
      </div>
    </aside>
    <section class="identity-card"><p class="eyebrow">WELCOME</p><h1>请填写测评信息</h1><p class="muted">身份信息仅用于本次测评与记录关联</p><label>真实姓名<input v-model="name" maxlength="20" autocomplete="off" placeholder="请输入姓名" @focus="idPadOpen=false" @input="error=''" @keyup.enter="submit"></label><label>身份证号码<span class="input-meta">{{ idCard.length }}/18</span><input :value="idDisplay" readonly inputmode="none" autocomplete="off" placeholder="请输入 18 位身份证号码" @focus="openIdPad" @click="openIdPad" @keyup.enter="idPadOpen=false"></label><p class="form-error">{{ error }}</p><button class="primary" @click="submit">开始测评</button><small>您的身份信息将被严格保密</small></section>
  </main>
</template>

<style scoped>
.id-keypad{position:absolute;z-index:2;top:50%;right:calc(11% + 490px);width:min(340px,37vw);padding:16px;border:1px solid #dce6e1;border-radius:22px;background:#f5f8f6;box-shadow:0 8px 22px #3753471f;transform:translate3d(0,-50%,0);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .14s ease,visibility .14s}.id-keypad.open{opacity:1;visibility:visible;pointer-events:auto}.id-keypad p{margin:0 0 10px;padding-left:4px;color:#4b625c;font-size:12px;font-weight:650;letter-spacing:.08em}.id-keypad__grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.id-keypad button{height:56px;border:1px solid #cbdad3;border-radius:12px;color:#263c35;background:#fff;font-size:21px;font-weight:650;touch-action:manipulation}.id-keypad button:active{background:#e4ede6}.id-keypad .id-keypad__function{color:#3e6154;background:#668d7e21;font-size:14px}.id-keypad .id-keypad__zero,.id-keypad .id-keypad__done{grid-column:span 2}.id-keypad .id-keypad__done{color:#fff;background:#4e7f70;font-size:15px}@media(max-height:680px){.id-keypad{width:320px;padding:12px}.id-keypad__grid{gap:8px}.id-keypad button{height:48px}}@media(max-width:800px),(orientation:portrait){.id-keypad{position:fixed;top:auto;right:24px;bottom:24px;width:calc(100% - 48px);max-width:480px;transform:none}}
</style>
