<script setup lang="ts">
defineProps<{ reason: string }>()
defineEmits<{ restart: [] }>()
</script>
<template>
  <main class="terminal-shell capture-invalid">
    <section>
      <div class="capture-invalid__icon" aria-hidden="true">✕</div>
      <p class="eyebrow">CAPTURE INTERRUPTED</p>
      <h1>本轮采集已失效</h1>
      <p>本次 60 秒连续采集中断时间过长，为保证分析视频的连续有效性，这一轮不会用于测评。</p>
      <p class="capture-invalid__reason" role="alert">具体原因：{{ reason }}</p>
      <p class="capture-invalid__hint">请重新就位后，由您主动重新开始一次采集。</p>
      <button class="primary" @click="$emit('restart')">重新就位</button>
    </section>
  </main>
</template>

<style scoped>
.capture-invalid section{z-index:1;width:min(580px,calc(100vw - 48px));text-align:center}
.capture-invalid__icon{display:grid;place-items:center;width:68px;height:68px;margin:0 auto 20px;border:1px solid rgba(248,113,113,.7);border-radius:50%;color:#fca5a5;background:rgba(127,29,29,.22);font-size:26px}
.capture-invalid h1{margin:8px 0 14px;font-family:serif;font-size:28px;color:#fff}
.capture-invalid p{color:#cad4e8;line-height:1.8}
.capture-invalid__reason{color:#f3b4b4!important;font-size:13px}
.capture-invalid__hint{color:#f2d9a9!important;font-size:13px}
.capture-invalid .primary{margin-top:18px;padding-inline:34px}
</style>
