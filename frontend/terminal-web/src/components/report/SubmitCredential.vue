<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

/**
 * 提交成功页（查询凭证）：只在服务端持久化测评与后台任务后出现。
 *
 * - 不显示虚假进度百分比，不承诺 4 分钟内完成；
 * - 显示：已提交、通常 3—4 分钟、可离开座位、稍后首页查询、查询码；
 * - 查询码为大字号便于抄录（本轮不做纸质打印/二维码——见交接文档）；
 * - 隐私自动退出倒计时，指针活动重置。
 */

defineProps<{
  reportId: string | null
  subjectNo: string
  countdown: number
  simMode: boolean
}>()
const emit = defineEmits<{ finish: []; activity: [] }>()
</script>

<template>
  <main class="terminal-shell credential" @pointerdown="emit('activity')" @touchstart="emit('activity')">
    <section class="credential__card">
      <div class="credential__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <h1>测评已提交，分析通常需要 3—4 分钟</h1>
      <p class="credential__body">
        本次记录已安全保存，您可以离开座位。请先用手机拍下下方报告编号；
        分析完成后，在首页点击「查询报告」，输入报告编号即可查看结果。
      </p>

      <div v-if="!simMode && reportId" class="credential__code">
        <p>本次报告编号</p>
        <b>{{ reportId }}</b>
        <small>工号：{{ subjectNo || '—' }} · 报告编号与管理员列表保持一致</small>
      </div>
      <p v-if="!simMode && reportId" class="credential__photo">请使用手机拍照保存报告编号</p>
      <p v-else-if="simMode" class="credential__sim">（开发模拟模式：未提交任何数据，无报告编号）</p>

      <NavigationButton class="primary credential__done" @click="emit('finish')">完成并返回首页</NavigationButton>
      <small class="credential__countdown">为保护您的隐私，本页面将在 {{ countdown }} 秒后自动返回首页</small>
    </section>
  </main>
</template>

<style scoped>
.credential{display:grid;place-items:center}
.credential__card{z-index:1;width:min(620px,calc(100vw - 48px));padding:36px 44px;border-radius:26px;background:#101e30d9;border:1px solid #b7d1e42e;box-shadow:0 24px 70px #0006;display:grid;justify-items:center;gap:14px;text-align:center}
.credential__icon{display:grid;place-items:center;width:72px;height:72px;border:1px solid rgba(95,226,168,.7);border-radius:50%;color:#94edc0;background:rgba(21,69,67,.45)}
.credential__icon svg{width:34px;height:34px}
.credential h1{margin:0;font-size:24px;font-weight:500;font-family:serif}
.credential__body{margin:0;color:var(--tx-soft,#a6bed3);font-size:var(--fs-body,15px);line-height:1.8}
.credential__code{display:grid;gap:6px;width:100%;padding:18px 20px;border:1px dashed #86dfb4;border-radius:18px;background:#4d8b811a}
.credential__code p{margin:0;color:#cfe8dc;font-size:var(--fs-caption,13px);letter-spacing:.1em}
.credential__code b{font-size:40px;letter-spacing:.14em;color:#fff;font-family:ui-monospace,monospace}
.credential__code small{color:var(--tx-faint,#96aebf);font-size:var(--fs-micro,12px)}
.credential__photo{margin:0;color:#d4f3e3;font-size:14px;font-weight:650}
.credential__sim{margin:0;color:#f5be50;font-size:var(--fs-caption,13px)}
.credential__done{min-width:280px;margin-top:6px}
.credential__countdown{color:#aab3cc99;font-size:var(--fs-micro,12px)}


/* 查询码页采用高对比白色凭证卡，拍照时也能清楚识别。 */
.credential{background:#edf5f4}.credential__card{background:#fff;border-color:#d2e2df;box-shadow:0 16px 38px rgba(35,68,73,.14)}
.credential__icon{color:#fff;background:#328b76;border:3px solid #dff3ea}.credential h1{color:#203e4d;font-weight:650}.credential__body{color:#42616d;font-size:16px;font-weight:500}
.credential__code{border-color:#4f8d82;background:#edf7f3}.credential__code p{color:#2a665d;font-size:15px;font-weight:700}.credential__code b{color:#203e4d}.credential__code small{color:#486570;font-size:13px;font-weight:500}.credential__photo{color:#286458;font-size:15px}.credential__countdown{color:#59717a;font-size:13px}.credential__sim{color:#8c611c}
</style>
