<script setup lang="ts">import { computed } from 'vue';import { statusTone } from '@/utils/status';const props=defineProps<{label:string}>();const tone=computed(()=>statusTone(props.label))</script>
<template><span class="status" :class="`status--${tone}`"><i />{{ label }}</span></template>
