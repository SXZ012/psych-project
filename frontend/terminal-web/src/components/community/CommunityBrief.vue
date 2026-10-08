<script setup lang="ts">
defineEmits<{ next: []; resume: [] }>()
const items = [
  { value: '3 道练习', label: '熟悉操作，可跳过', icon: '◷' },
  { value: '60 秒', label: '摄像头正式采集', icon: '▣' },
  { value: '约 3–4 分钟', label: '采集结束后等待报告', icon: '▤' },
] as const
</script>

<template>
  <main class="brief-page">
    <section class="brief-copy">
      <p>测评说明</p>
      <h1>开始前，了解三件事</h1>
      <span>看画面、听题目，按第一感觉选择。阅读与准备不限时，报告可稍后在手机查看。</span>
    </section>
    <section class="brief-items">
      <article v-for="item in items" :key="item.value">
        <i>{{ item.icon }}</i><div><b>{{ item.value }}</b><span>{{ item.label }}</span></div>
      </article>
    </section>
    <footer>
      <button class="resume-button" @click="$emit('resume')">已支付 · 恢复未完成测评</button>
      <p>本测评用于了解近期状态，不构成医学诊断；您可以随时退出。</p>
      <button class="primary" @click="$emit('next')">继续</button>
    </footer>
  </main>
</template>

<style scoped>
.brief-page{position:relative;width:100%;height:100%;box-sizing:border-box;padding:112px 72px 38px;background:linear-gradient(135deg,#eef5f1 0%,#f8f5ef 100%);color:#29443b;overflow:hidden}.brief-page:after{content:"";position:absolute;right:-70px;top:85px;width:360px;height:360px;border-radius:50%;background:#dcece4;opacity:.7}
.brief-copy,.brief-items,footer{position:relative;z-index:1}.brief-copy p{margin:0 0 8px;color:#4f8d82;font-size:15px;font-weight:750;letter-spacing:.15em}.brief-copy h1{margin:0;color:#263f37;font-size:36px}.brief-copy span{display:block;margin-top:10px;color:#60776e;font-size:17px}
.brief-items{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:42px}.brief-items article{display:flex;align-items:center;gap:18px;min-height:126px;padding:22px 26px;border:1px solid #d5e4dc;border-radius:22px;background:rgba(255,255,255,.84);box-shadow:0 12px 30px rgba(53,84,71,.08)}.brief-items i{display:grid;place-items:center;width:54px;height:54px;border-radius:16px;background:#e0eee7;color:#3f7d6e;font-size:25px;font-style:normal}.brief-items b,.brief-items span{display:block}.brief-items b{font-size:21px}.brief-items span{margin-top:5px;color:#71867d;font-size:14px}
footer{position:absolute;left:72px;right:72px;bottom:34px;display:flex;align-items:center;justify-content:space-between;gap:30px}footer p{margin:0;color:#687e75;font-size:14px}footer .primary{width:300px;min-height:58px;font-size:18px}

.resume-button{min-height:52px;border:0;border-radius:14px;padding:12px 20px;white-space:nowrap;background:#e0eae2;color:#355e49;font-size:16px}footer{flex-wrap:wrap;gap:12px}footer p{flex:1;min-width:180px}</style>
