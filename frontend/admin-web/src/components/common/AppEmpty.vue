<script setup lang="ts">defineProps<{title:string;description?:string}>()</script>
<template><div class="empty"><div class="empty__icon">◇</div><strong>{{ title }}</strong><p v-if="description">{{ description }}</p><slot /></div></template>
