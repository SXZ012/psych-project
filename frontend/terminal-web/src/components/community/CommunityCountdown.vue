<script setup lang="ts">
/**
 * 开始倒计时（社区皮肤，对齐航空 3 秒）：倒计时结束即进入 60 秒正式采集。
 * 倒计时期间人脸必须保持在框内，否则暂停推进并给出提示。
 */
import CameraMonitor from '@/components/camera/CameraMonitor.vue'

defineProps<{
  countdown: number
  native: boolean
  cameraMessage: string
  faceOk: boolean
}>()
</script>
<template>
  <main class="cc-stage">
    <CameraMonitor class="stage-top" :message="cameraMessage" :native="native" :state="faceOk ? 'ok' : 'warning'" />
    <div class="cc-rings" aria-hidden="true"><i></i><i></i></div>
    <section class="cc-content">
      <p class="cc-eyebrow">正式测评准备中</p>
      <div class="cc-number" aria-live="assertive">{{ countdown }}</div>
      <h1>正式测评即将开始</h1>
      <p>请保持坐姿自然、面部位于画面框内</p>
      <p class="cc-hint">倒计时结束后开始 60 秒连续采集，期间请勿离开座位</p>
    </section>
  </main>
</template>
<style scoped>
/* 社区绿基调（与就位/预训练/采集页一致），不用航空科技蓝 */
.cc-stage{position:relative;isolation:isolate;width:100%;height:100%;display:grid;text-align:center;overflow:hidden;background:linear-gradient(145deg,#41605b 0%,#2c4643 100%)}
/* 摄像头框（正上方居中，与航空一致）之下才是倒计时内容区 */
.cc-rings i{position:absolute;left:50%;top:68%;width:280px;height:280px;border:1px solid rgba(220,238,231,.24);border-radius:50%;transform:translate(-50%,-50%);animation:ccRing 2.6s ease-out infinite}
.cc-rings i:nth-child(2){animation-delay:1.3s}
@keyframes ccRing{0%{transform:translate(-50%,-50%) scale(.7);opacity:.9}100%{transform:translate(-50%,-50%) scale(1.45);opacity:0}}
.cc-content{position:absolute;z-index:1;left:0;right:0;top:322px;bottom:0;display:grid;justify-items:center;align-content:center}
.cc-eyebrow{margin:0 0 12px;color:#c8ded4;font-size:13px;font-weight:700;letter-spacing:.24em}
.cc-number{display:grid;place-items:center;width:112px;height:112px;border:2px solid rgba(229,241,242,.65);border-radius:50%;color:#fff;background:rgba(255,255,255,.1);font-family:serif;font-size:56px;font-weight:500;box-shadow:0 8px 22px rgba(18,45,57,.2),inset 0 0 20px rgba(255,255,255,.08);animation:ccPulse 1s ease-in-out infinite}
@keyframes ccPulse{50%{box-shadow:0 8px 34px rgba(18,45,57,.3),inset 0 0 26px rgba(255,255,255,.14)}}
.cc-content h1{margin:14px 0 0;color:#fff;font-family:serif;font-size:25px;font-weight:500;letter-spacing:.06em}
.cc-content p{margin:8px 0 0;color:#e2efe9;font-size:15.5px}
.cc-hint{color:#c2d8cd!important;font-size:13px!important}
@media(max-height:680px){
  .cc-number{width:100px;height:100px;font-size:50px}
  .cc-content{top:300px}
  .cc-content h1{font-size:23px}
  .cc-content p{font-size:14px}
}


/* Calm community assessment surface; capture geometry and timing stay unchanged. */
.cc-stage{background:#e9f0e9}.cc-rings{display:none}.cc-content h1{color:#294735;font-family:inherit;font-weight:650}.cc-content p,.cc-content .cc-hint{color:#4d6556!important}.cc-number{background:#dcebdd;color:#34724e;border:0;box-shadow:none;animation:none;font-family:inherit;font-weight:750}
</style>
<style scoped src="../../styles/community-capture.css"></style>
