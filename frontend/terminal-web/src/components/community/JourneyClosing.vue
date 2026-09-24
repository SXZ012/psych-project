<script setup lang="ts">
defineProps<{ step: number; uploading: boolean; error: string | null }>()
</script>
<template>
  <main class="terminal-shell community-stage jc-shell">
    <section class="jc-card">
      <div class="jc-orbit"><i /><i /><i /><span>✦</span></div>
      <h1>正在整理本次体验</h1>
      <div class="jc-route">
        <div class="jc-node" :class="{ done: step >= 1, active: step === 0 }">
          <i /><b>整理旅程</b>
        </div>
        <div class="jc-line" :class="{ lit: step >= 1 }" />
        <div class="jc-node" :class="{ done: step >= 2, active: step === 1 }">
          <i /><b>安全保存</b>
        </div>
        <div class="jc-line" :class="{ lit: step >= 2 }" />
        <div class="jc-node" :class="{ done: step >= 3, active: step === 2 }">
          <i /><b>等待分析</b>
        </div>
        <div class="jc-line" :class="{ lit: step >= 3 }" />
        <div class="jc-node" :class="{ done: step >= 4, active: step === 3 }">
          <i /><b>完成</b>
        </div>
      </div>
      <p v-if="error" class="jc-error">{{ error }}</p>
      <p v-else class="jc-status">{{ uploading ? '正在整理，请稍等…' : '整理完成，即将进入下一步…' }}</p>
    </section>
  </main>
</template>
<style scoped>
.jc-shell{display:grid;place-items:center;padding:56px 24px 18px}
.jc-card{z-index:1;display:grid;justify-items:center;gap:14px;padding:48px 56px;border-radius:26px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #0006}
.jc-orbit{position:relative;width:100px;height:100px;margin-bottom:8px}
.jc-orbit i{position:absolute;inset:0;border-radius:50%;border:2px solid #cfe3da}
.jc-orbit i:nth-child(1){animation:jcSpin 3.4s linear infinite;border-top-color:#3e7367}
.jc-orbit i:nth-child(2){inset:14px;animation:jcSpin 2.2s linear reverse infinite;border-top-color:#668d7e}
.jc-orbit i:nth-child(3){inset:28px;animation:jcSpin 1.6s linear infinite;border-top-color:#9fd6bd}
.jc-orbit span{position:absolute;inset:0;display:grid;place-items:center;font-size:28px;color:#3e7367;animation:jcPulse 2s ease-in-out infinite}
.jc-card h1{margin:0;font-size:24px;color:#2c4a41;font-family:serif}
.jc-route{display:flex;align-items:center;gap:0;margin-top:10px}
.jc-node{display:grid;justify-items:center;gap:6px;min-width:72px}
.jc-node i{width:20px;height:20px;border-radius:50%;background:#dde8e1;transition:background .5s,box-shadow .5s}
.jc-node.active i{background:#f5be50;box-shadow:0 0 14px rgba(245,190,80,.6)}
.jc-node.done i{background:#3e7367;box-shadow:0 0 10px rgba(62,115,103,.4)}
.jc-node b{font-size:13px;color:#5a8a72;font-weight:600}
.jc-line{width:36px;height:3px;background:#dde8e1;transition:background .5s}
.jc-line.lit{background:#3e7367}
.jc-status{margin:0;color:#8aa89b;font-size:14px}
.jc-error{margin:0;color:#b3552f;font-size:14px;max-width:380px;line-height:1.6}
@keyframes jcSpin{to{transform:rotate(360deg)}}
@keyframes jcPulse{50%{transform:scale(1.15)}}
</style>

@media (prefers-reduced-motion: reduce){.jc-orbit i,.jc-orbit span{animation:none}}
