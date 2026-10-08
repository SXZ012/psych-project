<script setup lang="ts">
/**
 * 报告状态视图（分析中/完成/需处理/采集无效）+ 手动与自动退出。
 *
 * - 状态不只靠颜色：分析中带旋转指示，完成带对勾，需处理/无效带图标与说明；
 * - 处理中文案不出现内部技术表述：主标题"分析中"，阶段仅两档用户文案；
 * - 超过预计时间切"分析时间较长，本次记录已保存，请稍后再查"；
 * - 所有状态固定提供"返回首页"按钮（手动退出）；自动退出倒计时
 *   （完成态 120s，其余 60s），任何指针活动重置；
 * - 手动/自动退出路径一致：停止轮询 → 清空凭证与报告 → 通知父级
 *   （父级负责隐藏原生摄像头预览/停止提示音并返回首页）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PersonalReport from './PersonalReport.vue'
import NavigationButton from '../common/NavigationButton.vue'
import PrivacyIdleGuard from '../common/PrivacyIdleGuard.vue'
import type { useReportLookup } from '@/composables/useReportLookup'
import { MESSAGES } from '@/aviation/messages'

type Lookup = ReturnType<typeof useReportLookup>
const props = defineProps<{ lookup: Lookup }>()
const emit = defineEmits<{ exit: [] }>()

const result = computed(() => props.lookup.result.value)
const isCompleted = computed(() => result.value?.status === 'completed' && !!result.value?.report)
const AUTO_EXIT_SEC = computed(() => 300)
const countdown = ref(AUTO_EXIT_SEC.value)
let timer: number | null = null

function startTimer() {
  stopTimer()
  timer = window.setInterval(() => {
    countdown.value -= 1
    countdown.value = Math.max(0, countdown.value)
  }, 1_000)
}
function stopTimer() { if (timer !== null) { window.clearInterval(timer); timer = null } }
function resetCountdown() { countdown.value = AUTO_EXIT_SEC.value }

function leave() {
  stopTimer()
  props.lookup.exit()
  emit('exit')
}

function formatTime(iso: string | null): string {
  if (!iso) return MESSAGES.report.notProvided
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return MESSAGES.report.notProvided
  }
}

onMounted(startTimer)
onBeforeUnmount(stopTimer)
</script>

<template>
  <PrivacyIdleGuard @expire="leave" />
  <section v-if="result" class="waiting" @pointerdown="resetCountdown" @keydown="resetCountdown" @scroll.capture="resetCountdown">
    <p v-if="lookup.error.value" role="alert">{{ lookup.errorMessage() }} <button v-if="lookup.error.value==='network'" @click="lookup.retry">重新连接</button></p>
    <p v-if="!isCompleted && props.lookup.submittedCode.value" class="waiting__report-id">报告编号：<b>{{ props.lookup.submittedCode.value }}</b></p>
    <!-- 分析中（不出现内部技术表述） -->
    <template v-if="result.status === 'processing'">
      <div class="waiting__orb" aria-hidden="true"><i></i><i></i><i></i></div>
      <h2>{{ MESSAGES.report.processingTitle }}</h2>
      <p v-if="result.stage_label" class="waiting__stage">{{ result.stage_label }}</p>
      <p class="waiting__hint">{{ props.lookup.isSlow() ? MESSAGES.report.processingSlow : MESSAGES.report.processing }}</p>
      <p class="waiting__meta">{{ MESSAGES.report.submittedAt.replace('{time}', formatTime(result.submitted_at)) }}</p>
    </template>

    <!-- 完成：四页报告 -->
    <template v-else-if="isCompleted">
      <PersonalReport :payload="result.report!" />
    </template>

    <!-- 需工作人员处理 -->
    <template v-else-if="result.status === 'needs_attention'">
      <div class="waiting__warn" aria-hidden="true">!</div>
      <h2>{{ MESSAGES.report.needsAttention }}</h2>
      <p class="waiting__meta">{{ MESSAGES.report.submittedAt.replace('{time}', formatTime(result.submitted_at)) }}</p>
    </template>

    <!-- 采集无效：需重新测评 -->
    <template v-else>
      <div class="waiting__warn" aria-hidden="true">↺</div>
      <h2>{{ MESSAGES.report.invalid }}</h2>
      <p class="waiting__meta">{{ MESSAGES.report.submittedAt.replace('{time}', formatTime(result.submitted_at)) }}</p>
    </template>

    <footer class="waiting__footer" :class="{ 'waiting__footer--compact': isCompleted }">
      <template v-if="!isCompleted">
        <p>{{ MESSAGES.report.autoExit.replace('{sec}', String(countdown)) }}</p>
        <p class="waiting__privacy">{{ MESSAGES.report.privacyNote }}</p>
      </template>
      <p v-else class="waiting__clear-notice">为保护隐私，{{ countdown }} 秒无操作后自动清屏</p>
      <NavigationButton class="waiting__exit" @click="leave">{{ isCompleted ? '退出报告' : MESSAGES.report.exitButton }}</NavigationButton>
    </footer>
  </section>
</template>

<style scoped>
.waiting{position:relative;display:grid;gap:12px;justify-items:center;text-align:center;width:100%}
.waiting h2{margin:4px 0 0;font-size:22px;font-weight:500;color:var(--tx-strong,#fff);line-height:1.6}
.waiting__stage{margin:0;color:var(--tx-medium,#c6d0e8);font-size:var(--fs-body,15px)}
.waiting__meta,.waiting__hint{margin:0;color:var(--tx-faint,#96aebf);font-size:var(--fs-caption,13px)}
.waiting__report-id{margin:0;padding:7px 13px;border:1px solid #b8d3ca;border-radius:999px;background:#edf7f3;color:#2d665b;font-size:14px;font-weight:600}.waiting__report-id b{font-family:ui-monospace,monospace;letter-spacing:.08em;color:#203e4d}
.waiting__orb{position:relative;width:96px;height:96px;margin:8px 0}
.waiting__orb i{position:absolute;inset:0;border-radius:50%;border:1px solid #9db2ec66;border-top-color:#9db2ec;animation:wspin 1.2s linear infinite}
.waiting__orb i:nth-child(2){inset:14px;animation-delay:.2s}
.waiting__orb i:nth-child(3){inset:28px;animation-delay:.4s}
@keyframes wspin{to{transform:rotate(360deg)}}
.waiting__done{display:grid;place-items:center;width:64px;height:64px;margin:4px 0;border:1px solid rgba(95,226,168,.7);border-radius:50%;color:#94edc0;background:rgba(21,69,67,.45)}
.waiting__done svg{width:30px;height:30px}
.waiting__warn{display:grid;place-items:center;width:72px;height:72px;margin:6px 0;border:1px solid rgba(245,190,80,.7);border-radius:50%;color:#ffe0a0;background:rgba(154,99,12,.22);font-size:30px}
/* 完成态：报告占满，底部操作条固定 */
.waiting__footer{display:grid;gap:6px;justify-items:center;width:100%;margin-top:10px;padding:12px 0 0;border-top:1px solid #ffffff1c}
.waiting__footer--compact{position:absolute;right:0;bottom:0;z-index:4;display:flex;align-items:center;gap:12px;width:auto;margin:0;padding:0;border:0}
.waiting__footer p{margin:0;color:var(--tx-faint,#96aebf);font-size:var(--fs-micro,12px)}
.waiting__privacy{color:#aab3cc99!important}
.waiting__exit{min-width:280px;min-height:56px;font-size:16px}
.waiting__clear-notice{white-space:nowrap;color:#637984!important;font-size:12px!important;font-weight:600}
.waiting__footer--compact .waiting__exit{min-width:112px;min-height:52px;padding:0 18px;border-radius:12px;background:#2f5d7cdd;box-shadow:0 5px 16px rgba(38,55,70,.18);font-size:15px}


.waiting h2{color:#294354}.waiting__stage{color:#54717c}.waiting__meta,.waiting__hint{color:#72848b}
.waiting__orb i{border-color:#a9c2ca;border-top-color:#5f8b9f}.waiting__done{color:#397b6e;background:#e7f3ed;border-color:#8cb9aa}.waiting__warn{color:#9c6a27;background:#fbf2e1;border-color:#ddbf87}
.waiting__footer{border-top-color:#d7e2df}.waiting__footer p{color:#72848b}.waiting__privacy{color:#829199!important}
</style>
