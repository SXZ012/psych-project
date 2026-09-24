<script setup lang="ts">
/**
 * 社区提交失败页：显示会话短码（求助/对账凭据）+ 重新提交 + 结束。
 * 语气安抚、说明恢复路径；结束回欢迎页（不重复确认/支付）。
 */
defineProps<{ message: string; sessionCode: string; retrying?: boolean }>()
const emit = defineEmits<{ retry: []; end: [] }>()
</script>
<template>
  <main class="crs-shell">
    <section class="crs-card">
      <div class="crs-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      </div>
      <h1>这次没有保存成功</h1>
      <p class="crs-msg">{{ message || '网络暂时不太稳定。你的体验内容还在，可以直接重试。' }}</p>
      <p v-if="sessionCode" class="crs-code">报告编号 <b>{{ sessionCode }}</b>（向工作人员求助时报这个编号）</p>
      <div class="crs-actions">
        <button class="crs-primary" :disabled="retrying" @click="emit('retry')">
          {{ retrying ? '正在重新提交…' : '重新提交' }}
        </button>
        <button class="crs-secondary" @click="emit('end')">返回首页</button>
      </div>
      <small>结束不会影响你的体验记录；需要帮助请联系现场工作人员</small>
    </section>
  </main>
</template>

<style scoped>
/* 社区绿基调（与场景视觉一致），避免航空科技蓝 */
.crs-shell{position:relative;width:100%;height:100%;display:grid;place-items:center;overflow:hidden;background:radial-gradient(1100px 700px at 72% -10%,#41605b,#223c36 62%)}
.crs-shell:before,.crs-shell:after{content:"";position:absolute;width:52vw;height:52vw;border-radius:50%;filter:blur(55px);opacity:.16;pointer-events:none}
.crs-shell:before{left:-23vw;top:-28vw;background:#5f9e8c}
.crs-shell:after{right:-27vw;bottom:-34vw;background:#c7b473}
.crs-card{z-index:1;width:min(480px,calc(100vw - 48px));padding:38px 36px;border-radius:24px;text-align:center;background:#fffffff0;box-shadow:0 28px 80px #00000070}
.crs-icon{display:grid;place-items:center;width:84px;height:84px;margin:0 auto 22px;border-radius:50%;color:#b3552f;background:rgba(239,120,68,.14);border:2px solid rgba(239,120,68,.45)}
.crs-icon svg{width:40px;height:40px}
.crs-card h1{margin:0 0 10px;font-size:23px;color:#263c35;font-family:serif}
.crs-msg{margin:0 0 14px;color:#8a5b4a;font-size:14px;line-height:1.7}
.crs-code{margin:0 0 20px;padding:10px 14px;border-radius:12px;background:#f5f0e8;color:#7a6a52;font-size:13px;line-height:1.6}
.crs-code b{font-family:ui-monospace,monospace;letter-spacing:.08em;color:#4a3f2c;font-size:15px}
.crs-actions{display:grid;gap:12px}
.crs-primary{min-height:54px;border:0;border-radius:14px;color:#fff;background:linear-gradient(135deg,#668d7e,#3e7367);font-size:16px;font-weight:650;box-shadow:0 10px 26px rgba(62,115,103,.3)}
.crs-primary:disabled{opacity:.55}
.crs-secondary{min-height:50px;border:1px solid #bfd2ca;border-radius:14px;color:#3e7367;background:#fff;font-size:15px}
.crs-card small{display:block;margin-top:14px;color:#82918b;font-size:12px;line-height:1.6}
</style>
