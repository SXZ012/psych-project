<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

import { computed, onMounted, ref } from 'vue'
import qrcode from 'qrcode-generator'
import { usePauseableCountdown } from '@/composables/usePauseableCountdown'
const props = defineProps<{ sessionId: string; sessionCode: string; submittedAtText?: string; completed?: boolean; needsAttention?: boolean; error?: string; delayed?: boolean }>()
const emit = defineEmits<{ finish: []; retry: [] }>()
const rootEl = ref<HTMLElement | null>(null)
const countdown = usePauseableCountdown(120, () => emit('finish'))
onMounted(() => { if (rootEl.value) countdown.bind(rootEl.value); countdown.start() })
const reportUrl = computed(() => `/community/reports?session_id=${encodeURIComponent(props.sessionId)}`)
const qrSvg = computed(() => {
  if (!props.sessionId) return ''
  const qr = qrcode(0, 'M'); qr.addData(window.location.origin + reportUrl.value); qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 16, scalable: true })
})
function openReport() { location.assign(reportUrl.value + '&terminal=1') }
</script>
<template>
  <main ref="rootEl" class="receipt-shell">
    <div class="receipt-top"><span>社区心理服务</span><NavigationButton class="receipt-back" @click="$emit('finish')">返回首页</NavigationButton></div>
    <div v-if="error || delayed" class="receipt-status" role="status">{{ error || '处理时间较长，本次记录已保存。可稍后查看，或联系现场工作人员。' }} <button @click="emit('retry')">刷新状态</button></div>
    <section class="receipt-body"><div class="receipt-copy"><span class="receipt-check" :class="{'receipt-check--attention':needsAttention}">{{ needsAttention ? '!' : '✓' }}</span><p class="receipt-label">测评已完成</p><h1>{{ needsAttention ? '本次报告需要进一步确认' : completed ? '报告已生成' : '报告分析中' }}</h1><p class="receipt-note">{{ needsAttention ? '请保留报告编号，联系现场工作人员了解详情，无需重复支付。' : completed ? '可以在屏幕上阅读，也可以带到手机上查看和保存。' : '通常需要 3–4 分钟。现在扫码保留报告页面，生成后会自动更新，无需在这里等待。' }}</p><div v-if="sessionCode" class="receipt-number"><span>报告编号</span><strong>{{ sessionCode }}</strong><small>也可在首页“查看我的报告”中输入此编号</small></div><div class="receipt-actions"><button @click="openReport">{{ completed ? '阅读我的报告' : '查看报告进度' }}</button><NavigationButton class="receipt-back" @click="$emit('finish')">完成并返回首页</NavigationButton></div><p class="receipt-timer">{{ countdown.paused.value ? '触摸已暂停自动返回' : `${countdown.remaining.value} 秒后返回首页` }}</p></div><aside class="receipt-phone"><div class="receipt-qr" v-html="qrSvg"/><h2>手机扫码，带走报告</h2><p>在线阅读 · 查看 PDF · 下载保存</p><small>请妥善保管编号及报告链接</small></aside></section>
    <footer>心理状态辅助参考，不构成医学诊断</footer>
  </main>
</template>
<style scoped>
.receipt-shell{position:fixed;inset:0;z-index:60;display:flex;flex-direction:column;padding:22px 38px;background:#f3f6f3;color:#263f34;overflow:auto;box-sizing:border-box}.receipt-top{display:flex;align-items:center;justify-content:space-between;font-size:18px;font-weight:700}.receipt-shell button{border:0;border-radius:14px;background:#397b65;color:white;min-height:52px;padding:12px 22px;font-size:17px;font-weight:700;-webkit-tap-highlight-color:transparent}.receipt-shell .receipt-back{background:#e5ede6;color:#345442}.receipt-body{display:grid;grid-template-columns:minmax(0,1fr) 310px;align-items:center;gap:50px;flex:1;width:min(1050px,100%);margin:18px auto}.receipt-check{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:#d7ecdc;color:#277444;font-size:36px;font-weight:800}.receipt-label{color:#426f52;font-size:17px;margin:14px 0 6px}.receipt-copy h1{font-size:36px;margin:0 0 16px;color:#263f34}.receipt-note{font-size:18px;color:#4d6658;line-height:1.8;max-width:560px;margin:0 0 18px}.receipt-number{display:grid;grid-template-columns:auto 1fr;gap:5px 18px;align-items:center;padding:14px 18px;background:#fff;border-radius:16px}.receipt-number strong{font-size:30px;letter-spacing:.14em}.receipt-number small{grid-column:1/-1;color:#5c7063;font-size:13px}.receipt-actions{display:flex;gap:12px;margin-top:20px}.receipt-timer{font-size:13px;color:#647768}.receipt-phone{background:white;border-radius:26px;padding:24px;text-align:center}.receipt-qr{width:240px;max-width:100%;margin:auto}.receipt-qr :deep(svg){width:100%;height:auto;display:block}.receipt-phone h2{font-size:23px;margin:10px 0}.receipt-phone p{font-size:15px;color:#4d6658}.receipt-phone small,footer{font-size:12px;color:#657769}footer{text-align:center}@media(max-width:760px){.receipt-body{grid-template-columns:1fr}.receipt-shell{padding:20px}.receipt-phone{max-width:350px;width:100%;margin:auto}}@media(min-width:761px) and (max-height:650px){.receipt-shell{padding:16px 28px}.receipt-body{gap:32px;grid-template-columns:minmax(0,1fr) 280px;margin:10px auto}.receipt-note{font-size:16px}.receipt-copy h1{font-size:32px}.receipt-phone{padding:18px}.receipt-number strong{font-size:26px}.receipt-qr{width:216px}.receipt-actions button{font-size:15px;padding:10px 16px}}


.receipt-check--attention{background:#f2e4cf;color:#876536}
</style>
