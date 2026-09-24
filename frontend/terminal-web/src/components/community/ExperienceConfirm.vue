<script setup lang="ts">
import { computed } from 'vue'
import qrcode from 'qrcode-generator'
import type { PayStatus } from '@/composables/useCommunityFlow'
const props = defineProps<{ status: PayStatus; qrUrl: string; amountFen: number; countdown: string; error: string; mock: boolean; mockBusy: boolean }>()
const emit = defineEmits<{ confirm: []; mockPay: []; restart: [] }>()
const amountYuan = computed(() => (props.amountFen / 100).toFixed(2))
const qrSvg = computed(() => { if (!props.qrUrl) return ''; try { const qr=qrcode(0,'M'); qr.addData(props.qrUrl); qr.make(); const n=qr.getModuleCount(); let path=''; for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))path+=`M${c} ${r}h1v1h-1z`; return `<svg viewBox="-2 -2 ${n+4} ${n+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n+4}" height="${n+4}" fill="#fff"/><path d="${path}" fill="#263c35"/></svg>` } catch { return '' } })
</script>

<template>
  <main class="confirm-page">
    <section class="confirm-info">
      <p>体验确认</p><h1>{{ status === 'paid' ? '确认成功' : '扫码开始体验' }}</h1>
      <template v-if="status !== 'paid'">
        <span>使用手机扫码确认，终端会自动进入下一步。</span>
        <div class="price"><small>本次体验</small><b>¥{{ amountYuan }}</b></div>
        <ul><li>全程约 4 分钟</li><li>正式采集约 60 秒</li><li>结束后手机查看 PDF 报告</li></ul>
      </template>
      <template v-else><span>接下来阅读知情同意书，并完成摄像头准备。</span><div class="success-steps"><i>1</i>阅读说明 <i>2</i>面部就位 <i>3</i>开始测评</div></template>
      <small class="boundary">演示环境不会产生真实扣款 · 本测评不构成医学诊断</small>
    </section>

    <section class="confirm-action">
      <template v-if="status === 'creating'"><div class="loader"><i/><i/><i/></div><p>正在准备体验…</p></template>
      <template v-else-if="status === 'waiting'"><div class="qr" v-html="qrSvg"/><b>请使用手机扫码确认</b><small>体验通道 {{ countdown }} 内有效</small><button v-if="mock" class="mock" :disabled="mockBusy" @click="emit('mockPay')">{{ mockBusy ? '正在确认…' : '演示确认' }}</button></template>
      <template v-else-if="status === 'paid'"><div class="done">✓</div><b>已完成确认</b><small>即将自动进入下一步</small></template>
      <template v-else><div class="fail">!</div><b>{{ status === 'expired' ? '体验通道已超时' : (error || '体验准备失败') }}</b><button class="primary" @click="emit('restart')">重新开始</button></template>
    </section>
  </main>
</template>

<style scoped>
.confirm-page{display:grid;grid-template-columns:46% 54%;width:100%;height:100%;padding-top:60px;box-sizing:border-box;background:linear-gradient(130deg,#eaf3ee 0 46%,#f8f5ee 46%);color:#29443b;overflow:hidden}.confirm-info{display:flex;flex-direction:column;justify-content:center;padding:32px 54px 42px 72px}.confirm-info>p{margin:0 0 10px;color:#4f8d82;font-size:15px;font-weight:750;letter-spacing:.15em}.confirm-info h1{margin:0;font-size:38px}.confirm-info>span{margin-top:12px;color:#60776e;font-size:17px;line-height:1.7}.price{display:flex;align-items:flex-end;gap:16px;margin:28px 0 10px}.price small{padding-bottom:8px;color:#7a8d85}.price b{color:#3f8374;font-size:42px}.confirm-info ul{margin:16px 0 0;padding:0;list-style:none;color:#506b61;font-size:15px;line-height:2}.confirm-info li:before{content:'✓';margin-right:10px;color:#4f9a78;font-weight:800}.boundary{margin-top:auto;color:#73867e;font-size:12px}.success-steps{display:flex;align-items:center;gap:10px;margin-top:36px;color:#49665b;font-weight:650}.success-steps i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#d9ebe2;color:#387969;font-style:normal}
.confirm-action{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 60px 34px;text-align:center}.qr{width:276px;height:276px;padding:14px;border:1px solid #d6e3dd;border-radius:24px;background:#fff;box-shadow:0 18px 44px rgba(50,76,65,.12)}.qr :deep(svg){display:block;width:100%;height:100%}.confirm-action>b{margin-top:18px;font-size:19px}.confirm-action>small{margin-top:8px;color:#7b8d86}.mock{margin-top:18px;min-width:180px;min-height:44px;border:1px dashed #8daf9f;border-radius:12px;background:#edf5f1;color:#426c5e;font-weight:700}.done,.fail{display:grid;place-items:center;width:124px;height:124px;border-radius:50%;background:#dceee4;color:#3d8a6c;font-size:58px;font-weight:800;box-shadow:0 18px 42px rgba(63,131,116,.18)}.fail{background:#f6e9df;color:#ad704e}.confirm-action .primary{min-width:240px;margin-top:22px}.loader{display:flex;gap:10px}.loader i{width:13px;height:13px;border-radius:50%;background:#5c9b88;animation:pulse .8s infinite alternate}.loader i:nth-child(2){animation-delay:.18s}.loader i:nth-child(3){animation-delay:.36s}@keyframes pulse{to{transform:translateY(-8px);opacity:.4}}
</style>
