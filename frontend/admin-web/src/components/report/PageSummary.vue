<script setup lang="ts">import type { PageSummary } from '@/types/report';defineProps<{summary:PageSummary}>()</script>
<template><section class="page-summary"><div class="page-summary__title">本页结果摘要</div><p>{{ summary.text }}</p><small>{{ summary.constraint }}</small></section></template>
