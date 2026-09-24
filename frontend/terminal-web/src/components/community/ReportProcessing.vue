<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import { COMMUNITY_STAGE_MS } from '@/config/community/content'
import { usePauseableCountdown } from '@/composables/usePauseableCountdown'

/**
 * 报告生成中（report_processing）：上传已完成，分析在服务端进行。
 * - 明确告知"可以离开了"，稍后扫码同样能看；
 * - 二维码 + 会话短码立即可见（用户拍完照随时可走）；
 * - 自动返回倒计时触摸暂停（按住屏幕不跳走）；
 * - 报告就绪由父级轮询推进到完成页，此页无需操作。
 */
const props = defineProps<{
  sessionId: string
  sessionCode: string
  submittedAtText: string
}>()
const emit = defineEmits<{ finish: [] }>()

const rootEl = ref<HTMLElement | null>(null)
const countdown = usePauseableCountdown(COMMUNITY_STAGE_MS.reportProcessingAutoExitSec, () => emit('finish'))
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
  <main ref="rootEl" class="terminal-shell rp-shell">
    <section class="rp-card">
      <div class="rp-body">
        <div class="rp-main">
          <div class="rp-status" aria-live="polite">
            <span class="rp-dot" /><p>测评完成，报告正在生成</p>
          </div>
          <h1>现在可以放心离开了</h1>
          <p class="rp-copy">报告通常需要 3—4 分钟生成。用手机拍下右边的二维码，稍后随时扫码查看，不用在屏幕前等待。</p>
          <button class="primary" @click.stop="$emit('finish')">完成并返回首页</button>
          <p class="rp-countdown">{{ countdown.paused.value ? '已暂停 · 松开手继续计时' : `${countdown.remaining.value} 秒后自动返回首页` }}</p>
          <p class="rp-notice">本结果仅供个人参考，不构成医学诊断</p>
        </div>

        <div class="rp-qr-area">
          <div class="rp-qr" v-html="qrSvg" />
          <p class="rp-qr-hint">手机扫码查看我的报告</p>
          <p class="rp-code">报告编号 <b>{{ sessionCode }}</b></p>
          <p class="rp-code-hint">可以把编号抄下来，之后凭编号向现场工作人员查询</p>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
/* 962×602 横屏：左文右码两栏，去掉了原来的竖排长卡片（原先超过一屏会被裁掉） */
.rp-shell{display:grid;place-items:center;padding:56px 24px 18px;touch-action:manipulation}
.rp-card{z-index:1;width:min(840px,calc(100vw - 48px));max-height:100%;padding:24px 36px;border-radius:26px;text-align:left;background:#fffffff0;box-shadow:0 28px 80px #0006}
.rp-body{display:grid;grid-template-columns:minmax(0,1fr) 208px;gap:32px;align-items:center}
.rp-main{display:flex;flex-direction:column;align-items:flex-start;min-width:0}
.rp-status{display:inline-flex;align-items:center;gap:9px;padding:6px 14px;border-radius:999px;background:#eaf5ef;color:#2f6d5b;font-size:13.5px;font-weight:650}
.rp-status p{margin:0}
.rp-dot{width:9px;height:9px;border-radius:50%;background:#3e9e6e;animation:rpBlink 1.6s ease-in-out infinite}
.rp-card h1{margin:12px 0 8px;color:#263c35;font-size:24px;font-family:serif}
.rp-copy{margin:0 0 16px;color:#667c73;font-size:14px;line-height:1.75}
.rp-card .primary{width:100%;min-height:52px;font-size:16px}
.rp-countdown{margin:8px 0 0;color:#8aa89b;font-size:12.5px;align-self:center}
.rp-notice{margin:6px 0 0;color:#a3b5aa;font-size:11px;align-self:center}
.rp-qr-area{display:grid;justify-items:center;align-content:center;gap:7px}
.rp-qr{width:min(168px,30vw,26vh);aspect-ratio:1;padding:9px;border-radius:14px;background:#fff;box-shadow:inset 0 0 0 1px #e2e8e5}
.rp-qr :deep(svg){width:100%;height:100%;display:block}
.rp-qr-hint{margin:0;color:#3a5a4a;font-size:14px;font-weight:650}
.rp-code{margin:0;color:#8aa89b;font-size:12.5px;text-align:center}
.rp-code b{font-family:ui-monospace,monospace;letter-spacing:.08em;color:#315347;font-size:14px}
.rp-code-hint{margin:0;color:#a3b5aa;font-size:11px;text-align:center;line-height:1.5;max-width:190px}
@keyframes rpBlink{50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.rp-dot{animation:none}}
</style>
