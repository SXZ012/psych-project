<script setup lang="ts">
import { nextTick } from 'vue'
import { REPORT_TABS } from '@/utils/report'
import type { ReportTab } from '@/types/report'
defineProps<{modelValue:ReportTab}>()
const emit=defineEmits<{(e:'update:modelValue',value:ReportTab):void}>()
// 键盘支持：←/→ 循环切换，Home/End 跳到首尾；切换后焦点跟随
function onKeydown(event:KeyboardEvent,index:number){
  let next:number|null=null
  if(event.key==='ArrowRight')next=(index+1)%REPORT_TABS.length
  else if(event.key==='ArrowLeft')next=(index-1+REPORT_TABS.length)%REPORT_TABS.length
  else if(event.key==='Home')next=0
  else if(event.key==='End')next=REPORT_TABS.length-1
  if(next==null)return
  event.preventDefault()
  const tab=REPORT_TABS[next]
  emit('update:modelValue',tab.key)
  void nextTick(()=>document.getElementById(`report-tab-${tab.key}`)?.focus())
}
</script>
<template><nav class="report-tabs" role="tablist" aria-label="四页报告导航"><button v-for="(tab,index) in REPORT_TABS" :id="`report-tab-${tab.key}`" :key="tab.key" role="tab" type="button" :aria-selected="modelValue===tab.key" :tabindex="modelValue===tab.key?0:-1" aria-controls="report-panel" :class="{active:modelValue===tab.key}" @click="$emit('update:modelValue',tab.key)" @keydown="onKeydown($event,index)">{{ tab.label }}</button></nav></template>
