<script setup lang="ts">
defineProps<{ simMode?: boolean }>()
</script>
<template>
  <main class="terminal-shell captured-notice">
    <section>
      <div class="captured-notice__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <p class="eyebrow">CAPTURE COMPLETE</p>
      <h1>采集完成，正在保存本次测评数据</h1>
      <p>视频已停止录制并封存，正在安全保存并提交本次测评数据。</p>
      <p v-if="simMode" class="captured-notice__sim">（开发模拟模式：不会上传任何数据）</p>
    </section>
  </main>
</template>

<style scoped>
.captured-notice section{z-index:1;display:grid;justify-items:center;text-align:center}
.captured-notice__icon{display:grid;place-items:center;width:76px;height:76px;margin:0 0 22px;border:1px solid rgba(149,226,192,.7);border-radius:50%;color:#94edc0;background:rgba(21,69,67,.45);box-shadow:0 0 36px rgba(95,226,168,.32)}
.captured-notice__icon svg{width:36px;height:36px}
.captured-notice h1{margin:0 0 12px;font-family:serif;font-size:27px;color:#fff}
.captured-notice p{margin:0;color:rgba(255,255,255,.6);font-size:14px}
.captured-notice__sim{margin-top:14px;color:#f5be50!important;font-size:12px!important}


/* 结束页不再用浅字叠在浅背景上，统一为清晰的信息卡。 */
.captured-notice{background:#edf5f4}.captured-notice section{width:min(620px,calc(100vw - 48px));padding:42px 48px;border:1px solid #d2e2df;border-radius:28px;background:#fff;box-shadow:0 16px 38px rgba(35,68,73,.14)}
.captured-notice__icon{color:#fff;background:#328b76;border:3px solid #dff3ea;box-shadow:0 8px 18px rgba(39,111,91,.22)}.captured-notice h1{color:#203e4d;font-weight:650}.captured-notice p{color:#42616d;font-size:16px;font-weight:500}.captured-notice .eyebrow{color:#2f7166;font-weight:750}.captured-notice__sim{color:#8c611c!important}
</style>
