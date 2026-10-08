<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ id: string }>()
const number = computed(() => props.id.replace(/-/g, '').slice(0, 8).toUpperCase())
</script>
<template>
  <small class="subtle report-number">报告编号 {{ number }}</small>
</template>
<style scoped>
.report-number{display:block;white-space:nowrap;user-select:text}
</style>
