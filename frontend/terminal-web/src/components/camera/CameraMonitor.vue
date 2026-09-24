<script setup lang="ts">
/**
 * 顶部固定小预览（纯展示）：正式/练习/倒计时阶段共用。
 * 视频元素通过 camera sink 动态接流（阶段切换重建后不再黑屏）。
 */
import { useCameraSink } from '@/composables/useCameraSink'

defineProps<{
  message: string
  native: boolean
  state?: 'ok' | 'warning' | 'error'
  /** 正式采集异常时原位适度展开（恢复后平稳收起） */
  expanded?: boolean
}>()
const videoEl = useCameraSink()
const STATE_ICON: Record<string, string> = { ok: '✓', warning: '!', error: '✕' }
</script>
<template>
  <aside class="camera-monitor" :class="[state || 'warning', { expanded }]">
    <div class="camera-monitor__view" data-native-preview-anchor="monitor"><video v-if="!native" ref="videoEl" autoplay muted playsinline></video><i></i></div>
    <p v-if="state !== 'ok'"><b aria-hidden="true">{{ STATE_ICON[state || 'warning'] }}</b>{{ message }}</p>
  </aside>
</template>

<style scoped>
.camera-monitor{position:fixed;z-index:20;left:50%;transform:translateX(-50%);top:var(--cm-top,14px);width:var(--cm-w,300px);pointer-events:none}
.camera-monitor.expanded{width:var(--cm-w-expanded,340px)}
.camera-monitor__view{position:relative;aspect-ratio:4/3;overflow:hidden;border:2px solid rgba(255,255,255,.34);border-radius:var(--cm-radius,16px);background:#070a16;box-shadow:0 8px 28px #0006;max-height:200px}
.camera-monitor.ok .camera-monitor__view{border-color:rgba(95,226,168,.72)}
.camera-monitor.warning .camera-monitor__view{border-color:rgba(245,190,80,.86)}
.camera-monitor.error .camera-monitor__view{border-color:rgba(248,113,113,.88);box-shadow:0 8px 30px rgba(127,29,29,.28)}
.camera-monitor__view video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.camera-monitor__view i{position:absolute;left:25%;top:10%;width:50%;height:72%;border:1px solid #ffffffaa;border-radius:46%/50%}
.camera-monitor p{display:flex;align-items:center;gap:6px;margin:7px 0;padding:6px 9px;border-radius:999px;text-align:left;background:#070a16a6;font-size:var(--fs-micro,11px);line-height:1.45}
.camera-monitor p b{display:grid;place-items:center;flex:none;width:15px;height:15px;border-radius:50%;font-size:10px;font-weight:700}
.camera-monitor.ok p b{background:#5fe2a833;color:#8df0bb}
.camera-monitor.warning p b{background:#f5be5033;color:#f5be50}
.camera-monitor.error p b{background:#f8717133;color:#fca5a5}
@media(max-height:700px){.camera-monitor{width:240px}.camera-monitor__view{max-height:160px}}
</style>

<style scoped>
/* 预览在右上，状态说明移至左侧，不再挤占题卡的垂直空间。 */
.camera-monitor{left:50%;right:auto;top:26px;width:360px;transform:translateX(-50%)}.camera-monitor.expanded{width:400px}
.camera-monitor__view{max-height:none;box-shadow:0 8px 22px rgba(28,58,63,.2)}
.camera-monitor p{position:absolute;top:50%;left:calc(100% + 18px);width:236px;margin:0;padding:12px 14px;border:1px solid rgba(255,255,255,.42);border-radius:14px;color:#254b58;background:rgba(246,251,250,.72);box-shadow:0 8px 20px rgba(33,66,70,.09);backdrop-filter:blur(10px);font-size:15px;font-weight:650;transform:translateY(-50%)}
@media(max-width:1200px){.camera-monitor{width:310px}.camera-monitor.expanded{width:330px}.camera-monitor p{left:calc(100% + 12px);width:204px;font-size:14px}}
@media(max-height:700px){.camera-monitor{top:16px;width:280px}.camera-monitor.expanded{width:300px}.camera-monitor__view{max-height:none}.camera-monitor p{width:184px;padding:8px 10px;font-size:12px}}
</style>

<style scoped>
/* 社区主流程：与航空同款「正上方居中的大取景框」，只整体下移让开顶部阶段进度条。
   原生预览层按此锚点落位，因此社区与航空的取景框大小位置完全一致。 */
.camera-monitor.stage-top{top:46px;width:360px}
.camera-monitor.stage-top.expanded{width:386px}
.camera-monitor.stage-top p{width:214px;padding:9px 12px;font-size:12.5px}
@media(max-height:620px){.camera-monitor.stage-top{width:330px}.camera-monitor.stage-top.expanded{width:352px}}
</style>
