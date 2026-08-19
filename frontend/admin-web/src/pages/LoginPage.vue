<script setup lang="ts">
import { ref } from 'vue'
import { useRoute,useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
const password=ref(''),error=ref(''),submitting=ref(false),router=useRouter(),route=useRoute(),auth=useAuthStore()
async function submit(){if(!password.value){error.value='请输入管理口令';return}submitting.value=true;error.value='';try{await auth.signIn(password.value);await router.replace(typeof route.query.redirect==='string'?route.query.redirect:'/assessments')}catch(e){error.value=e instanceof Error?e.message:'登录失败'}finally{submitting.value=false}}
</script>
<template><main class="login-page"><section class="login-copy"><div class="eyebrow">PSYCHOLOGICAL ASSESSMENT</div><h1>让专业测评结果<br>更清晰、更可追溯</h1><p>统一查看多模态心理生理数据、专业依据与管理跟进记录。</p></section><form class="login-card" @submit.prevent="submit"><div class="login-card__icon">心</div><h2>管理后台</h2><p>请输入管理口令进入报告中心</p><label>管理口令<input v-model="password" type="password" autocomplete="current-password" placeholder="请输入口令" autofocus></label><div class="form-error" role="alert">{{ error }}</div><button class="primary-button" :disabled="submitting">{{ submitting?'正在验证…':'进入后台' }}</button></form></main></template>
