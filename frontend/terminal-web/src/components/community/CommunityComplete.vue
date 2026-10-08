<script setup lang="ts">
import ReportProcessing from './ReportProcessing.vue'
defineProps<{ sessionId: string; sessionCode?: string }>()
defineEmits<{ finish: [] }>()
</script>
<template><ReportProcessing :session-id="sessionId" :session-code="sessionCode || ''" completed @finish="$emit('finish')" /></template>
