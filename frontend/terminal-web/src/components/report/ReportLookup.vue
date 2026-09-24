<script setup lang="ts">
/**
 * 报告查询入口（触控友好）：员工编号 + 报告查询码 → 状态/报告。
 *
 * - 凭证只进 POST body；错误提示统一，不泄露记录存在性；
 * - 分析中/完成/需处理/无效由 ReportWaiting 呈现并自动轮询；
 * - 打开查询页与退出查询页都会撤去原生摄像头预览/人脸框并停止提示音
 *   （报告页不属于采集流程，原生层不得遮挡内容）；
 * - 退出清空一切（含内存中的查询码），返回终端首页。
 */
import { onMounted, ref } from 'vue'
import ReportWaiting from './ReportWaiting.vue'
import { useReportLookup } from '@/composables/useReportLookup'
import { useAndroidCamera } from '@/composables/useAndroidCamera'
import { MESSAGES } from '@/aviation/messages'

const emit = defineEmits<{ back: [] }>()
const lookup = useReportLookup()
const native = useAndroidCamera()

function settleNativeLayers() {
  // 隐藏独立于 WebView 的原生预览与人脸引导层，停止任何提示音
  native.hide()
  native.setGuideState('ok')
  native.stopPromptAudio()
}
onMounted(settleNativeLayers)

const reportId = ref('')
const submitted = ref(false)

function submit() {
  const id = reportId.value.trim().toUpperCase()
  if (!id) return
  void lookup.lookupByReportId(id).then(ok => { if (ok) submitted.value = true })
}

function onExit() {
  lookup.exit()                 // 停轮询 + 清凭证/报告/状态
  reportId.value = ''
  submitted.value = false
  settleNativeLayers()          // 再次确保原生预览/提示音已关闭
  emit('back')                  // 返回终端首页
}
</script>

<template>
  <main class="terminal-shell lookup" :class="{ 'lookup--wide': submitted }">
    <section v-if="submitted" class="lookup__report-card">
      <ReportWaiting :lookup="lookup" @exit="onExit" />
    </section>

    <section v-else class="lookup__card">
      <p class="eyebrow">REPORT LOOKUP</p>
      <h1>{{ MESSAGES.report.lookupTitle }}</h1>
      <p class="lookup__intro">输入本次测评完成后显示的固定报告编号，即可查看进度和报告。</p>

      <form class="lookup__form" @submit.prevent="submit">
        <label>
          报告编号
          <input v-model="reportId" type="text" autocomplete="off" autocapitalize="characters"
                 placeholder="例如 A1B2C3D4" maxlength="8" required />
        </label>
        <p class="lookup__tip">报告编号与管理员报告列表中的“编号”完全一致，请拍照或记录保存。</p>
        <p v-if="lookup.error.value" class="lookup__error" role="alert">{{ lookup.errorMessage() }}</p>
        <button class="primary" type="submit" :disabled="lookup.loading.value || reportId.trim().length !== 8">
          {{ lookup.loading.value ? MESSAGES.report.querying : MESSAGES.report.submitButton }}
        </button>
        <button class="lookup__back" type="button" @click="onExit">{{ MESSAGES.report.backHome }}</button>
      </form>
    </section>
  </main>
</template>

<style scoped>
.lookup{display:grid;place-items:center}
/* 完成态/状态态：撑满横向终端屏，报告四页独立滚动 */
.lookup--wide{place-items:stretch;padding:0}
.lookup__report-card{z-index:1;display:flex;flex-direction:column;width:100%;max-width:none;height:100dvh;margin:0;padding:20px 32px;border:0;border-radius:0;background:#101e30c9;box-shadow:none;min-height:0;overflow:hidden}
.lookup--wide :deep(.waiting){flex:1;min-height:0;height:100%;display:flex;flex-direction:column;justify-items:stretch;overflow:hidden}
.lookup--wide :deep(.waiting > .preport){flex:1;min-height:0}
.lookup--wide :deep(.waiting > .waiting__footer){margin-top:auto}
.lookup__card{z-index:1;width:min(520px,calc(100vw - 48px));padding:36px 40px;border-radius:26px;background:#101e30d9;border:1px solid #b7d1e42e;box-shadow:0 24px 70px #0006;display:grid;gap:12px;transform:translateY(-32px)}
.lookup__card h1{margin:0;font-size:26px;font-weight:500;font-family:serif}
.lookup__intro{margin:0;color:var(--tx-soft,#a6bed3);font-size:var(--fs-caption,14px);line-height:1.6}
.lookup__tip{margin:0;padding:10px 12px;border:1px solid rgba(134,223,180,.22);border-radius:10px;color:#c7e4d8;background:rgba(77,139,129,.13);font-size:var(--fs-caption,13px);line-height:1.6}
.lookup__form{display:grid;gap:16px;margin-top:8px}
.lookup__form label{display:grid;gap:8px;color:var(--tx-medium,#c6d0e8);font-size:var(--fs-caption,14px);font-weight:600}
.lookup__form input{min-height:58px;padding:0 18px;border:1px solid #a7c1d64d;border-radius:14px;background:#0a1524;color:var(--tx-strong,#eff6fc);font-size:20px;letter-spacing:.06em;outline:0}
.lookup__form input:focus{border-color:#86dfb4;box-shadow:0 0 0 4px #4d8b8133}
.lookup__error{margin:0;color:#fca5a5;font-size:var(--fs-caption,14px)}
.lookup__back{min-height:52px;border:0;background:transparent;color:#c5dce8;font-size:clamp(17px,1.35vw,19px);font-weight:600;text-decoration:underline;text-underline-offset:4px}
@media(max-width:760px){.lookup--wide{padding:0}.lookup__report-card{height:100dvh;padding:14px}.lookup__card{transform:translateY(-16px)}}
</style>

<style scoped>
/* 保持既有查询布局，仅换为明亮、可信的服务卡片。 */
.lookup__report-card,.lookup__card{background:rgba(255,255,255,.96);border-color:#d7e2e3;box-shadow:0 14px 36px rgba(38,55,70,.12)}
.lookup__report-card{box-shadow:none}
.lookup__card h1{color:#173545;font-weight:700}.lookup__intro{color:#294957;font-weight:650}.lookup__tip{color:#174d45;background:#eaf5f0;border-color:#afcfc3;font-weight:700}
.lookup__form label{color:#1d4050;font-weight:750}.lookup__form input{color:#173545;background:#fbfcfc;border-color:#afc5cb;font-weight:650}.lookup__form input::placeholder{color:#405c68;opacity:1;font-weight:600}.lookup__form input:focus{border-color:#3b7087;box-shadow:0 0 0 4px rgba(59,112,135,.16)}
.lookup__error{color:#843232;font-weight:650}.lookup__back{color:#173f60;font-weight:750}
</style>
