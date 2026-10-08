<script setup lang="ts">
defineProps<{ countdown: number }>()
</script>

<template>
  <main class="terminal-shell countdown-stage">
    <div class="countdown-rings" aria-hidden="true"><i></i><i></i></div>
    <section class="countdown-stage__content">
      <p class="countdown-stage__eyebrow">正式采集准备中</p>
      <div class="countdown-stage__number" aria-live="assertive">{{ countdown }}</div>
      <h1>正式采集即将开始</h1>
      <p>请保持坐姿自然、面部位于画面框内</p>
      <p class="countdown-stage__hint">倒计时结束后将开始 60 秒连续采集，期间请勿离开座位</p>
    </section>
  </main>
</template>

<style scoped>
.countdown-stage{isolation:isolate;display:grid;place-items:center;text-align:center;background:radial-gradient(ellipse 110% 85% at 50% 115%,#3f527b 0%,#131d37 42%,#060b17 85%)}
.countdown-rings i{position:absolute;left:50%;top:50%;width:280px;height:280px;border:1px solid rgba(202,217,255,.25);border-radius:50%;transform:translate(-50%,-50%);animation:cdRing 2.6s ease-out infinite}
.countdown-rings i:nth-child(2){animation-delay:1.3s}
@keyframes cdRing{0%{transform:translate(-50%,-50%) scale(.7);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.45);opacity:0}}
.countdown-stage__content{position:relative;z-index:1;display:grid;justify-items:center}
.countdown-stage__eyebrow{margin:0 0 18px;color:#aebfe9;font-size:11px;font-weight:700;letter-spacing:.26em}
.countdown-stage__number{display:grid;place-items:center;width:150px;height:150px;border:2px solid rgba(202,217,255,.4);border-radius:50%;color:#fff;font-family:serif;font-size:74px;font-weight:500;box-shadow:0 0 60px rgba(121,148,221,.35),inset 0 0 34px rgba(134,162,236,.12);animation:cdPulse 1s ease-in-out infinite}
@keyframes cdPulse{50%{box-shadow:0 0 92px rgba(121,148,221,.55),inset 0 0 34px rgba(134,162,236,.2)}}
.countdown-stage h1{margin:20px 0 0;font-family:serif;font-size:30px;font-weight:500;letter-spacing:.07em}
.countdown-stage p{margin:10px 0 0;color:#c5cee3;font-size:17px}
.countdown-stage__hint{color:#8f9dbb!important;font-size:13px!important}


/* 倒计时比服务页略深，用于建立采集开始的专注感，但不使用黑底。 */
.countdown-stage{background:linear-gradient(145deg,#557586 0%,#385766 100%)}
.countdown-rings i{border-color:rgba(220,237,238,.26)}.countdown-stage__eyebrow{color:#cce0df}.countdown-stage__number{color:#fff;border-color:rgba(229,241,242,.65);background:rgba(255,255,255,.1);box-shadow:0 8px 22px rgba(18,45,57,.2),inset 0 0 20px rgba(255,255,255,.08)}
.countdown-stage h1{color:#fff}.countdown-stage p{color:#e4edef}.countdown-stage__hint{color:#c8d8dc!important}


/* 倒计时只保留清晰的仪式感，移除黑底、霓虹和扫描式光圈。 */
.countdown-stage{background:linear-gradient(145deg,#edf4f5 0%,#f8faf9 100%)}
.countdown-rings i{border-color:rgba(79,141,130,.2)}.countdown-stage__eyebrow{color:#567781}.countdown-stage__number{color:#2f5d7c;border-color:#aac4ce;background:#fff;box-shadow:0 8px 22px rgba(47,93,124,.1),inset 0 0 20px rgba(163,197,208,.12)}
.countdown-stage h1{color:#294354}.countdown-stage p{color:#5d737d}.countdown-stage__hint{color:#7b8c93!important}


/* 最终阶段色彩覆盖：置于早先浅色倒计时样式之后。 */
.countdown-stage{background:linear-gradient(145deg,#557586 0%,#385766 100%)}
.countdown-rings i{border-color:rgba(220,237,238,.26)}.countdown-stage__eyebrow{color:#cce0df}.countdown-stage__number{color:#fff;border-color:rgba(229,241,242,.65);background:rgba(255,255,255,.1);box-shadow:0 8px 22px rgba(18,45,57,.2),inset 0 0 20px rgba(255,255,255,.08)}
.countdown-stage h1{color:#fff}.countdown-stage p{color:#e4edef}.countdown-stage__hint{color:#c8d8dc!important}


/* 连续测评阶段统一舞台色。 */
.countdown-stage{background:#8badb1}.countdown-stage:before,.countdown-stage:after{display:none}


/* 倒计时在浅色舞台保持明确的深色信息层级。 */
.countdown-rings i{border-color:rgba(39,81,88,.28)}.countdown-stage__eyebrow{color:#365f6a;font-size:13px}.countdown-stage__number{color:#244f65;border-color:#547f86;background:#fff;box-shadow:0 8px 22px rgba(35,68,73,.14)}
.countdown-stage h1{color:#203e4d;font-weight:650}.countdown-stage p{color:#365864;font-weight:550}.countdown-stage__hint{color:#45646f!important;font-size:14px!important}
</style>
