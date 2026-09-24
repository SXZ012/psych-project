<script setup lang="ts">
import { onMounted } from 'vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import AssessmentTable from '@/components/admin/AssessmentTable.vue'
import { useAssessmentStore } from '@/stores/assessments'
import type { ReviewStatus } from '@/types/assessment'
const store=useAssessmentStore();onMounted(()=>store.load())
async function setStatus(payload:{id:string;status:ReviewStatus}){try{await store.setReviewStatus(payload.id,payload.status)}catch{await store.load()}}
</script>
<template><AdminLayout><header class="page-header"><div><div class="eyebrow">ASSESSMENT REPORTS</div><h1>测评报告</h1><p>查看专业结果、数据质量与查看状态。</p></div><button class="secondary-button" :disabled="store.loading" @click="store.load">刷新数据</button></header><section class="toolbar"><div class="search-box"><span>⌕</span><input v-model="store.search" placeholder="搜索姓名、工号或测评编号"></div></section><div v-if="store.error" class="alert alert--error">{{ store.error }}</div><AssessmentTable :records="store.filtered" :loading="store.loading" @status="setStatus"/></AdminLayout></template>
