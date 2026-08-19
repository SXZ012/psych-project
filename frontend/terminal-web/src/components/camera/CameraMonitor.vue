<script setup lang="ts">defineProps<{message:string;native:boolean;state?:'ok'|'warning'|'error'}>()</script>
<template><aside class="camera-monitor" :class="state || 'warning'"><div class="camera-monitor__view" data-native-preview-anchor="monitor"><video v-if="!native" id="monitor-video" autoplay muted playsinline></video><i></i></div><p>{{ message }}</p></aside></template>

<style scoped>
.camera-monitor__view{aspect-ratio:4/3}
.camera-monitor__view{border-color:rgba(255,255,255,.34)}.camera-monitor.ok .camera-monitor__view{border-color:rgba(95,226,168,.72)}.camera-monitor.warning .camera-monitor__view{border-color:rgba(245,190,80,.86)}.camera-monitor.error .camera-monitor__view{border-color:rgba(248,113,113,.88);box-shadow:0 8px 30px rgba(127,29,29,.28)}
</style>
