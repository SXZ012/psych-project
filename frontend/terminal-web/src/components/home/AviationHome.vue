<script setup lang="ts">
/**
 * 航空终端首页（独立组件）：只显示两个主要用户入口 + 辅助信息。
 *
 * - 不展示上一位用户的任何信息（首页无状态）；
 * - "了解测评"为轻量弹层（用途/流程/结果边界）；
 * - 工作人员热区（左上角连点 5 下）只负责"唤起认证"，不给管理权限——
 *   认证与面板由父级 AviationApp 处理（staffWake 事件）。
 */
import { onMounted, ref } from 'vue'
import { useAndroidCamera } from '@/composables/useAndroidCamera'
import { MESSAGES } from '@/aviation/messages'

const emit = defineEmits<{ start: []; lookup: []; staffWake: [] }>()
const native = useAndroidCamera()
onMounted(() => { native.hide(); native.stopPromptAudio() })

const aboutOpen = ref(false)
const TAPS_TO_WAKE = 5
const tapCount = ref(0)
let tapTimer: number | null = null

function onStaffZoneTap() {
  tapCount.value += 1
  if (tapTimer) window.clearTimeout(tapTimer)
  if (tapCount.value >= TAPS_TO_WAKE) {
    tapCount.value = 0
    emit('staffWake')   // 只唤起认证窗口，不直接获得管理权限
    return
  }
  tapTimer = window.setTimeout(() => { tapCount.value = 0 }, 5000)
}
</script>

<template>
  <main class="terminal-shell home">
    <div class="debug-tap-zone" aria-hidden="true" @click="onStaffZoneTap"></div>
    <header class="home__topbar">
      <div class="home__brand"><i>AI</i><span>AI视觉心理评估终端</span><small>心理状态辅助测评</small></div>
      <button class="home__help" @click="aboutOpen = true">{{ MESSAGES.home.about }}</button>
    </header>
    <section class="home__hero">
      <p class="eyebrow">关心状态 · 从容开始</p>
      <h1>{{ MESSAGES.home.title }}</h1>
      <p class="home__sub">{{ MESSAGES.home.infoFlow }}</p>
      <div class="home__entries">
        <button class="home__entry home__entry--primary" @click="$emit('start')">
          <i class="home__entry-icon" aria-hidden="true">◎</i>
          <b>{{ MESSAGES.home.startButton }}</b>
          <span>{{ MESSAGES.home.infoCapture }}</span>
          <em>填写信息并开始</em>
        </button>
        <button class="home__entry" @click="$emit('lookup')">
          <i class="home__entry-icon" aria-hidden="true">⌁</i>
          <b>{{ MESSAGES.home.lookupButton }}</b>
          <span>{{ MESSAGES.home.infoAnalysis }}</span>
          <em>输入报告编号查看结果</em>
        </button>
      </div>
      <section class="home__capabilities" aria-label="终端服务能力">
        <div><i>◉</i><span><b>智能视觉采集</b><small>约 60 秒完成</small></span></div>
        <div><i>▤</i><span><b>自助报告查询</b><small>分析完成后随时查看</small></span></div>
        <div><i>⌑</i><span><b>隐私安全保护</b><small>仅用于本次测评关联</small></span></div>
      </section>
    </section>
    <small class="home__footer">{{ MESSAGES.home.footer }}</small>

    <div v-if="aboutOpen" class="home__about-backdrop" @click.self="aboutOpen = false">
      <section class="home__about-card">
        <h2>{{ MESSAGES.home.aboutTitle }}</h2>
        <p v-for="item in MESSAGES.home.aboutItems" :key="item">{{ item }}</p>
        <button class="primary" @click="aboutOpen = false">我知道了</button>
      </section>
    </div>
  </main>
</template>

<style scoped>
.home{min-height:100dvh;display:grid;place-items:center;padding:clamp(24px,5vh,56px) clamp(28px,6vw,96px);background:radial-gradient(90% 90% at 50% 28%,#245879 0%,#15334f 50%,#10243d 100%)}
.debug-tap-zone{position:absolute;z-index:3;top:0;left:0;width:220px;height:124px}
.home:before{width:62vw;height:62vw;left:-25vw;top:28vh;background:#5aa79555}.home:after{width:56vw;height:56vw;right:-22vw;bottom:-28vw;background:#5d83b655}
.home__topbar{position:absolute;z-index:2;top:clamp(22px,4vh,46px);left:clamp(28px,5vw,76px);right:clamp(28px,5vw,76px);display:flex;align-items:center;justify-content:space-between}
.home__brand{display:flex;align-items:center;gap:10px;color:#f3fbff;font-size:clamp(17px,1.7vw,22px);font-weight:650;letter-spacing:.04em}.home__brand i{display:grid;place-items:center;width:34px;height:34px;border:1px solid #9de9d0aa;border-radius:10px;color:#c8ffed;background:#67c9a526;font-size:13px;font-style:normal}.home__brand small{padding-left:10px;border-left:1px solid #d6ecf34d;color:#bdd3e2;font-size:clamp(12px,1.15vw,15px);font-weight:400;letter-spacing:0}
.home__help{min-height:48px;padding:0 20px;border:1px solid #d5e8f066;border-radius:999px;color:#eff9ff;background:#ffffff12;font-size:clamp(15px,1.35vw,18px)}
.home__hero{z-index:1;display:grid;justify-items:center;gap:clamp(12px,2vh,20px);width:min(920px,100%);text-align:center}.home__hero h1{margin:0;font-size:clamp(34px,4vw,56px);font-weight:500;letter-spacing:.04em;font-family:serif}.home__sub{margin:0;color:#c8dce9;font-size:clamp(16px,1.65vw,21px)}
.home__entries{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:clamp(18px,2.4vw,34px);width:100%;margin-top:clamp(10px,2vh,18px)}
.home__entry{display:grid;grid-template-columns:auto 1fr;grid-template-areas:'icon title' 'icon sub' 'icon hint';align-content:center;column-gap:20px;row-gap:8px;min-height:clamp(172px,24vh,228px);padding:clamp(24px,3vw,38px);border:1px solid #d4e8f06b;border-radius:24px;color:var(--tx-strong,#eff6fc);background:#17344ed1;box-shadow:0 18px 42px #07172838;text-align:left;transition:background var(--motion-fast,.15s),transform var(--motion-fast,.15s),border-color var(--motion-fast,.15s)}
.home__entry-icon{grid-area:icon;display:grid;place-items:center;width:clamp(52px,5vw,70px);height:clamp(52px,5vw,70px);border:1px solid #b9d9e688;border-radius:20px;color:#d7f5ff;background:#8fc9e11c;font-size:clamp(27px,2.7vw,36px);font-style:normal}.home__entry b{grid-area:title;font-size:clamp(25px,2.5vw,34px);font-weight:600}.home__entry span{grid-area:sub;color:#c0d7e4;font-size:clamp(14px,1.35vw,17px)}.home__entry em{grid-area:hint;color:#8ba9ba;font-size:clamp(12px,1.1vw,14px);font-style:normal}
.home__entry:active{transform:scale(.98);background:#214560}.home__entry--primary{background:linear-gradient(135deg,#278d7c,#216555);border-color:#9de9d0;box-shadow:0 20px 50px #0e4c4673}.home__entry--primary .home__entry-icon{border-color:#d5fff0aa;color:#e7fff6;background:#d9fff321}.home__entry--primary span{color:#e0f5eb}.home__entry--primary em{color:#b7ddcf}
.home__capabilities{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;width:100%;margin-top:clamp(6px,1vh,12px);padding-top:clamp(14px,2vh,20px);border-top:1px solid #d6e9f136}.home__capabilities>div{display:flex;align-items:center;justify-content:center;gap:9px;color:#c5dbe7;text-align:left}.home__capabilities i{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:#9fe6d0;background:#72cdb51c;font-size:15px;font-style:normal}.home__capabilities span{display:grid;gap:2px}.home__capabilities b{font-size:clamp(12px,1.1vw,14px);font-weight:600}.home__capabilities small{color:#8eacbb;font-size:clamp(10px,.9vw,12px)}
.home__footer{position:absolute;bottom:24px;color:#aab3cc99}
.home__about-backdrop{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:#04070ecc}
.home__about-card{width:min(560px,calc(100vw - 48px));padding:30px 34px;border-radius:22px;background:#101e30;display:grid;gap:12px;color:var(--tx-medium,#c6d0e8)}
.home__about-card h2{margin:0 0 4px;font-size:20px;color:var(--tx-strong,#fff)}
.home__about-card p{margin:0;font-size:var(--fs-body,15px);line-height:1.7}
.home__about-card .primary{margin-top:10px}
@media (max-width:760px),(orientation:portrait){.home{place-items:end center;padding:96px 24px 70px}.home__topbar{left:24px;right:24px}.home__brand small{display:none}.home__entries{grid-template-columns:1fr}.home__entry{min-height:132px}.home__capabilities{grid-template-columns:1fr;gap:10px}.home__capabilities>div{justify-content:flex-start}.home__footer{bottom:24px}.home__about-card{width:calc(100vw - 36px)}}
@media (max-height:680px) and (orientation:landscape){.home__hero{gap:9px}.home__entries{margin-top:4px}.home__entry{min-height:142px;padding:20px 26px}.home__capabilities{padding-top:10px}.home__footer{bottom:14px}}


/* 产品化色彩覆盖：不改变首页的网格、位置与尺寸。 */
.home{background:linear-gradient(145deg,#f6f9f9 0%,#eaf1f3 100%)}
.home:before{background:#a4c3ce55}.home:after{background:#b8d4c655}
.home__brand{color:#294354}.home__brand i{color:#2f5d7c;background:#e6f0f3;border-color:#b7ced5}.home__brand small{color:#71828b;border-left-color:#cbdadd}
.home__help{color:#385968;background:#ffffffbf;border-color:#c9d9dc}
.home__hero h1{color:#294354}.home__sub{color:#637984}
.home__entry{color:#294354;background:#fff;border-color:#d5e1e2;box-shadow:0 10px 28px rgba(38,55,70,.08)}
.home__entry-icon{color:#487084;background:#eaf2f4;border-color:#c7d9de}.home__entry span{color:#617681}.home__entry em{color:#82939a}
.home__entry:active{background:#f5f9f9}.home__entry--primary{color:#fff;background:#2f5d7c;border-color:#2f5d7c;box-shadow:0 12px 30px rgba(47,93,124,.2)}
.home__entry--primary .home__entry-icon{color:#fff;background:#ffffff1f;border-color:#ffffff80}.home__entry--primary span{color:#e2edf1}.home__entry--primary em{color:#c5dbe4}
.home__capabilities{border-top-color:#cfdddf}.home__capabilities>div{color:#4f6570}.home__capabilities i{color:#4f8d82;background:#e5f1ed}.home__capabilities small{color:#7d9097}
.home__footer{color:#71838b}.home__about-backdrop{background:rgba(38,55,70,.25)}.home__about-card{color:#526772;background:#fff;box-shadow:0 16px 40px rgba(38,55,70,.18)}.home__about-card h2{color:#294354}

/* 视觉中心略高于屏幕中线，给底部提示与终端留出呼吸空间。 */
.home__hero{transform:translateY(clamp(-82px,-8.5vh,-46px))}
@media(max-width:760px),(orientation:portrait){.home__hero{transform:translateY(0)}}


/* 首页信息层级加深：远距离终端阅读也能清楚辨识。 */
.home__brand{color:#1f394a}.home__brand small{color:#4d6570}
.home__help{color:#294e61}.home__hero h1{color:#1d394a}.home__sub{color:#3f5b69}
.home__entry{color:#213e4e}.home__entry span{color:#405e6b}.home__entry em{color:#647b85}
.home__capabilities>div{color:#38525e}.home__capabilities small{color:#607782}.home__footer{color:#5f737d}


/* 终端远距离阅读：入口说明与能力说明不再使用低对比的小号灰字。 */
.home__entry span{font-size:clamp(16px,1.5vw,19px);font-weight:500;color:#365565}
.home__entry em{font-size:clamp(13px,1.12vw,15px);color:#506d79}
.home__entry--primary b,.home__entry--primary span{color:#fff}.home__entry--primary em{color:#edf7f8}
.home__entry--primary .home__entry-icon{color:#fff;border-color:rgba(255,255,255,.82);background:rgba(255,255,255,.19)}
.home__capabilities b{font-size:clamp(15px,1.3vw,17px);color:#294755}.home__capabilities small{font-size:clamp(12px,1.05vw,14px);color:#526d78}


.home__hero h1{font-family:inherit;font-weight:650}
.home__entry{border:0;box-shadow:none}
.home__entry-icon{border:0}
.home__capabilities{border-top:0}
.home__help{border:0;background:#fff;color:#34586d}
</style>
