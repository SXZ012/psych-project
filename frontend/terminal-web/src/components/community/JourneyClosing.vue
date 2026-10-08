<script setup lang="ts">
defineProps<{ uploading: boolean; error: string | null }>()
</script>
<template>
  <main class="terminal-shell community-stage jc-shell">
    <section class="jc-card">
      <div class="jc-orbit"><i /><i /><i /><span>✦</span></div>
      <h1>采集已完成</h1>
      <p class="jc-save-title">{{ error ? '暂未保存成功' : uploading ? '正在保存本次测评' : '保存完成' }}</p>
      <p v-if="error" class="jc-error">{{ error }}</p>
      <p v-else class="jc-status">{{ uploading ? '请稍候，保存完成后会显示报告编号。' : '即将进入报告页面…' }}</p>
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
.jc-status{margin:0;color:#8aa89b;font-size:14px}
.jc-error{margin:0;color:#b3552f;font-size:14px;max-width:380px;line-height:1.6}
@keyframes jcSpin{to{transform:rotate(360deg)}}
@keyframes jcPulse{50%{transform:scale(1.15)}}
/* Calm community assessment surface; capture geometry and timing stay unchanged. */
.jc-shell{background:#e9f0e9}.jc-shell::before,.jc-shell::after{display:none}.jc-card{background:transparent;box-shadow:none}.jc-card h1{font-family:inherit}.jc-status{color:#4a6653}.jc-orbit i:nth-child(2),.jc-orbit i:nth-child(3){display:none}
@media (prefers-reduced-motion:reduce){.jc-orbit i,.jc-orbit span{animation:none}}
.jc-card{width:min(660px,100%);box-sizing:border-box;padding:32px 24px}.jc-card h1{font-size:30px;color:#29443b}.jc-save-title{font-size:21px;color:#3e5a4d;margin:0}.jc-status,.jc-error{font-size:17px;line-height:1.8}.jc-orbit{width:76px;height:76px}.jc-orbit span{font-size:24px}
</style>
