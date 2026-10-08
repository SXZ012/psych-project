<script setup lang="ts">
import { SCENE_SWITCHER_ENABLED } from '@/config/sceneSwitcher'
/**
 * 就位检查（社区皮肤）：与航空 FaceCheck 同一套判定与交互。
 * 三项检查（摄像头 / 单人面部 / 位置与大小）全部通过并稳定后，
 * 才出现「开始操作体验」按钮；就位不再自动进入采集。
 * 坐姿提示降为页内小字，不再单独占用一个页面。
 */
defineProps<{
  ready: boolean
  checklist: { label: string; pass: boolean }[]
  message: string
  native: boolean
}>()
defineEmits<{ confirm: []; simulateReady: [] }>()
</script>
<template>
  <main class="terminal-shell face-ready">
    <section class="fr-section">
      <!-- 容器与脸框尺寸沿用航空 FaceCheck（290×282、46%/50% 椭圆），社区独立维护 -->
      <div class="fr-preview" data-native-preview-anchor="detect">
        <video v-if="!native" id="detect-video" autoplay muted playsinline></video>
        <div class="fr-oval" :class="{ ready }"></div>
      </div>
      <p class="fr-eyebrow">采集准备</p>
      <h1>{{ ready ? '就位完成，可以开始了' : '正在确认你的位置…' }}</h1>
      <p class="fr-message" role="status">{{ message }}</p>

      <div class="fr-checklist" aria-label="采集就绪状态">
        <span v-for="item in checklist" :key="item.label" :class="{ pass: item.pass }">
          <i aria-hidden="true">{{ item.pass ? '✓' : '·' }}</i>{{ item.label }}
        </span>
      </div>

      <p class="fr-note">坐直、身体正对屏幕 · 距屏幕约一臂 · 避免背光</p>

      <button v-if="ready" class="primary fr-start" @click="$emit('confirm')">开始操作体验</button>
      <div v-else class="fr-dots" aria-hidden="true"><i></i><i></i><i></i></div>
      <button v-if="SCENE_SWITCHER_ENABLED && !ready" class="fr-simulate" @click="$emit('simulateReady')">测试：模拟人脸已就位</button>
    </section>
    <small class="fr-foot">接下来是 3 道可跳过的练习 · 正式采集 60 秒</small>
  </main>
</template>
<style scoped>
.face-ready{display:grid;place-items:center;padding:56px 20px 26px}
.fr-section{z-index:1;display:grid;justify-items:center;text-align:center;width:min(620px,calc(100vw - 48px))}
.fr-preview{position:relative;width:290px;height:282px;margin-bottom:16px;overflow:hidden;border-radius:28px;background:#dce9e4;box-shadow:0 12px 32px rgba(38,73,62,.14)}
.fr-preview video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.fr-oval{position:absolute;inset:28px 66px;border:2px solid rgba(79,141,130,.62);border-radius:46%/50%;box-shadow:0 0 0 999px rgba(237,246,241,.15) inset;transition:.45s}
.fr-oval.ready{border-color:#4f8d82;box-shadow:0 0 0 3px rgba(79,141,130,.14),0 0 0 999px rgba(237,246,241,.1) inset}
.fr-eyebrow{margin:0 0 4px;color:#aecabf;font-size:13px;font-weight:700;letter-spacing:.08em}
.fr-section h1{margin:0 0 6px;font-size:27px;font-family:serif;color:#f4faf6}
.fr-message{min-height:22px;margin:0;color:#d8e8df;font-size:15px}
.fr-checklist{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:14px}
.fr-checklist span{display:flex;align-items:center;gap:6px;padding:7px 12px;border:1.5px solid #dbe7e1;border-radius:999px;background:rgba(255,255,255,.72);color:#7d938a;font-size:13px;font-weight:600;transition:.25s}
.fr-checklist i{display:grid;place-items:center;width:15px;height:15px;border-radius:50%;border:1px solid #d4b884;color:#c09a55;font-size:10px;font-style:normal}
.fr-checklist .pass{border-color:#b6d6c6;color:#2c4a41;background:#f2f9f5}
.fr-checklist .pass i{background:#4f8d82;border-color:transparent;color:#fff}
.fr-note{margin:14px 0 0;color:#b4cdc2;font-size:12.5px}
.fr-start{width:min(320px,100%);min-height:58px;margin-top:18px;font-size:18px}
.fr-dots{display:flex;gap:8px;margin-top:24px}
.fr-dots i{width:10px;height:10px;border-radius:50%;background:#9dbcb0;animation:frPulse 1s infinite alternate}
.fr-dots i:nth-child(2){animation-delay:.2s}
.fr-dots i:nth-child(3){animation-delay:.4s}
.fr-simulate{margin-top:12px;min-height:42px;padding:0 18px;border:1px dashed rgba(216,232,223,.55);border-radius:999px;color:#d8e8df;background:rgba(255,255,255,.08);font-size:13px}
@keyframes frPulse{to{transform:translateY(-6px);opacity:.45}}
.fr-foot{position:absolute;bottom:24px;color:#b4cdc2}
@media(max-height:680px){.fr-preview{width:240px;height:234px;margin-bottom:10px}.fr-section h1{font-size:24px}.fr-start{margin-top:12px;min-height:52px}}


/* 就位页用深青绿舞台 + 浅色文字，保证可读性（与社区其他阶段一致）。 */
.face-ready{color:#f4faf6;background:linear-gradient(145deg,#41605b 0%,#2c4643 100%)}


/* Calm community assessment surface; capture geometry and timing stay unchanged. */
.face-ready{background:#e9f0e9;color:#2c4837;padding-top:72px;padding-bottom:38px}.face-ready::before,.face-ready::after{display:none}.fr-section h1{color:#2c4837;font-family:inherit}.fr-eyebrow,.fr-message,.fr-note,.fr-foot{color:#486451}.fr-checklist span{color:#516657}.fr-simulate{color:#416950;border-color:#94b59d;background:#f6faf5}.fr-foot{bottom:12px}
</style>
