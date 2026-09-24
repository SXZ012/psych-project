<script setup lang="ts">
/**
 * 顶部阶段进度条：五大步（了解→确认→准备→体验→报告）+ 当前阶段名。
 * 由 CommunityFlow 在主流程阶段统一挂载；失败态不显示。
 */
import { computed } from 'vue'
import { COMMUNITY_JOURNEY_STEPS, PHASE_STEP } from '@/community/flowSteps'
import type { CommunityPhase } from '@/types/community'

const props = defineProps<{ phase: CommunityPhase }>()
const emit = defineEmits<{ home: [] }>()

const stepIndex = computed(() => PHASE_STEP[props.phase])

const STAGE_LABELS: Partial<Record<CommunityPhase, string>> = {
  brief: '了解这次体验',
  payment_mock: '确认开始',
  consent: '知情同意',
  assets_loading: '内容准备',
  opening: '放松片刻',
  face_ready: '就位检查',
  practice: '操作练习',
  countdown: '即将开始',
  capturing: '正式小测',
  closing: '整理保存',
  report_processing: '报告生成',
  complete: '完成',
}
const stageLabel = computed(() => STAGE_LABELS[props.phase] ?? '')
</script>

<template>
  <header v-if="stepIndex !== null" class="ctb" aria-label="体验进度">
    <button class="ctb__home" type="button" @click="emit('home')">← 返回首页</button>
    <nav class="ctb__steps">
      <template v-for="(label, i) in COMMUNITY_JOURNEY_STEPS" :key="label">
        <span class="ctb__step" :class="{ done: i < stepIndex, active: i === stepIndex }">
          <i aria-hidden="true">{{ i < stepIndex ? '✓' : i + 1 }}</i>{{ label }}
        </span>
        <i v-if="i < COMMUNITY_JOURNEY_STEPS.length - 1" class="ctb__line" :class="{ lit: i < stepIndex }" aria-hidden="true" />
      </template>
    </nav>
    <p class="ctb__stage">{{ stageLabel }}</p>
  </header>
</template>

<style scoped>
.ctb{position:fixed;z-index:40;top:0;left:0;right:0;display:flex;align-items:center;gap:15px;padding:10px 22px;background:linear-gradient(180deg,rgba(9,26,21,.64),rgba(9,26,21,.28) 70%,transparent);pointer-events:none;color:#fff}
.ctb__home{pointer-events:auto;flex:none;min-height:36px;padding:0 13px;border:1px solid rgba(255,255,255,.5);border-radius:10px;background:rgba(255,255,255,.9);color:#315f51;font-size:12px;font-weight:750;box-shadow:0 4px 14px rgba(8,29,22,.12)}
.ctb__steps{display:flex;align-items:center;gap:8px}
.ctb__step{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:650;color:rgba(255,255,255,.55);transition:color .3s}
.ctb__step i{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);font-size:11px;font-style:normal;font-weight:700}
.ctb__step.active{color:#fff}
.ctb__step.active i{border-color:#9fd6bd;background:rgba(79,141,130,.55)}
.ctb__step.done{color:rgba(214,235,224,.85)}
.ctb__step.done i{border-color:transparent;background:#4f8d82;color:#eaf5ef}
.ctb__line{width:26px;height:2px;border-radius:2px;background:rgba(255,255,255,.22)}
.ctb__line.lit{background:rgba(159,214,189,.75)}
.ctb__stage{margin:0 0 0 auto;font-size:12.5px;font-weight:650;color:rgba(230,242,236,.9);padding:4px 12px;border-radius:999px;background:rgba(9,26,21,.4)}
@media(max-width:760px){.ctb{padding:8px 12px;gap:7px}.ctb__home{min-height:32px;padding:0 9px;font-size:10px}.ctb__step{font-size:11px;gap:4px}.ctb__step i{width:17px;height:17px;font-size:10px}.ctb__line{width:10px}.ctb__stage{font-size:11px;padding:3px 9px}}
</style>
