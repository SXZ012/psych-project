<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import { COMMUNITY_STAGE_MS, COMMUNITY_TRUST_POINTS } from '@/config/community/content'
import { usePauseableCountdown } from '@/composables/usePauseableCountdown'

/**
 * 完成页：报告已生成（由 report_processing 轮询推进而来）。
 * - 触摸暂停倒计时（默认 120s，按住屏幕不跳走，扫码从容）；
 * - 二维码/报告说明/返回按钮层级清晰；
 * - 信任声明与欢迎页、隐私页一字不差。
 */
const props = defineProps<{ sessionId: string; sessionCode?: string }>()
const emit = defineEmits<{ finish: [] }>()

const rootEl = ref<HTMLElement | null>(null)
const countdown = usePauseableCountdown(COMMUNITY_STAGE_MS.completeAutoExitSec, () => emit('finish'))
onMounted(() => { if (rootEl.value) countdown.bind(rootEl.value); countdown.start() })

const qrSvg = computed(() => {
  if (!props.sessionId) return ''
  const url = `${window.location.origin}/api/v1/community/h5/report?session_id=${props.sessionId}`
  try {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    const count = qr.getModuleCount()
    let path = ''
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`
      }
    }
    return `<svg viewBox="-2 -2 ${count + 4} ${count + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${count + 4}" height="${count + 4}" fill="#fff"/><path d="${path}" fill="#263c35"/></svg>`
  } catch {
    return ''
  }
})
</script>

<template>
  <main ref="rootEl" class="terminal-shell community-stage cc-shell">
    <section class="cc-card">
      <p class="cc-kicker">ALL DONE</p>
      <h1>体验完成，报告已经生成</h1>

      <div class="cc-main">
        <div class="cc-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6 9 17l-5-5"/></svg>
        </div>

        <div v-if="qrSvg" class="cc-qr-area">
          <div class="cc-qr" v-html="qrSvg" />
          <p class="cc-qr-hint">手机扫码，立即查看报告</p>
          <p class="cc-qr-sub">现在没空也没关系：报告可以稍后查看，不必在这里等待</p>
          <p v-if="sessionCode" class="cc-code">报告编号 <b>{{ sessionCode }}</b>（可抄录，之后凭编号向工作人员查询）</p>
        </div>
      </div>

      <ul class="cc-trust" aria-label="体验边界说明">
        <li v-for="point in COMMUNITY_TRUST_POINTS" :key="point">{{ point }}</li>
      </ul>

      <button class="primary" @click.stop="$emit('finish')">完成并返回首页</button>
      <p class="cc-countdown">{{ countdown.paused.value ? '已暂停 · 松开手继续计时' : `${countdown.remaining.value} 秒后自动返回首页` }}</p>
    </section>
  </main>
</template>

<style scoped>
/* 962×602 横屏：花与码并肩，信任声明两栏，主按钮恒定在屏内 */
.cc-shell{display:grid;place-items:center;padding:56px 24px 18px;touch-action:manipulation}
.cc-card{z-index:1;display:flex;flex-direction:column;width:min(760px,calc(100vw - 48px));max-height:100%;padding:22px 36px;border-radius:26px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #0006}
.cc-kicker{margin:0 0 6px;color:#5c9484;font-size:12.5px;letter-spacing:.16em;font-weight:700}
.cc-card h1{margin:0 0 14px;color:#263c35;font-size:24px;font-family:serif}
.cc-main{flex:0 1 auto;display:flex;align-items:center;justify-content:center;gap:36px;margin:0 0 14px;min-height:0}
.cc-check{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;color:#397b6e;background:#e7f3ed;border:2px solid #8cb9aa}
.cc-check svg{width:36px;height:36px}
.cc-qr-area{display:grid;justify-items:center;gap:5px}
.cc-qr{width:min(148px,26vw,24vh);aspect-ratio:1;padding:9px;border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px #e2e8e5}
.cc-qr :deep(svg){width:100%;height:100%;display:block}
.cc-qr-hint{margin:0;color:#3a5a4a;font-size:14.5px;font-weight:700}
.cc-qr-sub{margin:0;color:#8aa89b;font-size:12px}
.cc-code{margin:2px 0 0;color:#8aa89b;font-size:11.5px;line-height:1.5;max-width:200px}
.cc-code b{font-family:ui-monospace,monospace;letter-spacing:.08em;color:#315347;font-size:13px}
.cc-trust{flex:0 1 auto;display:grid;grid-template-columns:repeat(2,1fr);gap:4px 20px;margin:0 0 14px;padding:10px 16px;border-radius:14px;background:#f2f7f4;list-style:none;text-align:left;min-height:0;overflow:auto}
.cc-trust li{position:relative;padding-left:16px;color:#5a7a6d;font-size:12px;line-height:1.5}
.cc-trust li::before{content:"·";position:absolute;left:5px;font-weight:900;color:#3e7367}
.cc-card .primary{flex:none;width:100%;min-height:54px;font-size:16.5px}
.cc-countdown{margin:10px 0 0;color:#8aa89b;font-size:12.5px}
@media(max-width:700px){.cc-main{flex-direction:column;gap:18px}.cc-trust{grid-template-columns:1fr}}
</style>
