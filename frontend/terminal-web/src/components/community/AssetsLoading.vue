<script setup lang="ts">
/**
 * 素材准备（assets_loading）：知情同意确认后若素材未就绪的过渡页。
 * 显示真实进度（图片张数），就绪/失败由状态机自动推进，用户无需操作。
 */
defineProps<{ progress: { loaded: number; total: number } }>()
</script>
<template>
  <main class="terminal-shell al-shell">
    <section class="al-card">
      <div class="al-orbit" aria-hidden="true"><i /><i /><i /></div>
      <h1>正在为你准备小测内容</h1>
      <p>题目和图片马上就好，请稍等片刻</p>
      <div class="al-bar" role="status" :aria-label="`已准备 ${progress.loaded} / ${progress.total}`">
        <i :style="{ width: `${progress.total ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 8}%` }" />
      </div>
      <small>{{ progress.total ? `${progress.loaded} / ${progress.total} 张图片` : '准备中…' }}</small>
    </section>
  </main>
</template>

<style scoped>
.al-shell{display:grid;place-items:center;padding:56px 24px 18px}
.al-card{z-index:1;display:grid;justify-items:center;gap:10px;padding:44px 56px;border-radius:26px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #0006}
.al-orbit{position:relative;width:88px;height:88px;margin-bottom:6px}
.al-orbit i{position:absolute;inset:0;border-radius:50%;border:2px solid #cfe3da}
.al-orbit i:nth-child(1){animation:alSpin 2.6s linear infinite;border-top-color:#3e7367}
.al-orbit i:nth-child(2){inset:13px;animation:alSpin 2s linear reverse infinite;border-top-color:#668d7e}
.al-orbit i:nth-child(3){inset:26px;animation:alSpin 1.5s linear infinite;border-top-color:#9fd6bd}
.al-card h1{margin:0;font-size:23px;color:#2c4a41;font-family:serif}
.al-card p{margin:0;color:#8aa89b;font-size:14px}
.al-bar{width:min(320px,60vw);height:6px;margin-top:12px;border-radius:99px;background:#e6efe9;overflow:hidden}
.al-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#79aa99,#3e7367);transition:width .4s}
.al-card small{color:#a3b5aa;font-size:12px}
@keyframes alSpin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.al-orbit i{animation:none}}
</style>
