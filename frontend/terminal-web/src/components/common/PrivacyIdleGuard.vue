<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
const props = withDefaults(defineProps<{ seconds?: number }>(), { seconds: 300 })
const emit = defineEmits<{ expire: [] }>()
const remaining = ref(props.seconds)
let lastActivity = Date.now()
let timer: number | undefined
function continueUsing() { lastActivity = Date.now(); remaining.value = props.seconds }
function tick() {
  remaining.value = Math.max(0, props.seconds - Math.floor((Date.now() - lastActivity) / 1000))
  if (remaining.value === 0) { clearInterval(timer); emit('expire') }
}
const events = ['pointerdown', 'keydown', 'scroll'] as const
function restored(event: PageTransitionEvent) { if (event.persisted) emit('expire') }
onMounted(() => {
  events.forEach(event => document.addEventListener(event, continueUsing, true))
  document.addEventListener('visibilitychange', tick)
  timer = window.setInterval(tick, 1000)
  window.addEventListener('pageshow', restored)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  events.forEach(event => document.removeEventListener(event, continueUsing, true))
  document.removeEventListener('visibilitychange', tick)
  window.removeEventListener('pageshow', restored)
})
</script>
<template>
  <Teleport to="body"><aside v-if="remaining <= 30" class="privacy-idle" role="alert">
    <span>{{ remaining }} 秒无操作后返回首页，并清除本次屏幕信息</span>
    <button type="button" @click="continueUsing">继续使用</button>
  </aside></Teleport>
</template>
<style scoped>
.privacy-idle{position:fixed;z-index:9999;bottom:20px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:20px;max-width:90vw;padding:14px 20px;border-radius:18px;background:#fff;color:#293e35;box-shadow:0 8px 40px #1c342633;font-size:18px}.privacy-idle button{min-height:52px;white-space:nowrap;border:0;border-radius:12px;padding:10px 20px;background:#397b65;color:#fff;font-size:18px}
</style>
