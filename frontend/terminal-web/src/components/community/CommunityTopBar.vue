<script setup lang="ts">
import NavigationButton from '../common/NavigationButton.vue'

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
  <header v-if="stepIndex !== null" class="ctb" :class="{'ctb--focused':['practice','countdown','capturing'].includes(phase)}" aria-label="体验进度">
    <NavigationButton class="ctb__home" type="button" @click="emit('home')">返回首页</NavigationButton>
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
.ctb{position:fixed;z-index:40;top:0;left:0;right:0;height:62px;display:flex;align-items:center;gap:20px;padding:5px 24px;background:#f4f8f3;color:#344f40;pointer-events:none}
.ctb__home{pointer-events:auto;flex:none;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#e3ece2;color:#315d47;font-size:15px;font-weight:750}
.ctb__steps{display:flex;align-items:center;gap:9px}
.ctb__step{display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:650;color:#627364}
.ctb__step i{display:grid;place-items:center;width:24px;height:24px;border-radius:50%;background:#e6ece3;font-size:13px;font-style:normal}
.ctb__step.active{color:#2f6248}.ctb__step.active i{background:#3d7758;color:#fff}
.ctb__step.done{color:#486b54}.ctb__step.done i{background:#e0eddd;color:#3a6848}
.ctb__line{width:18px;height:1px;background:#ccd9ca}.ctb__line.lit{background:#90ac91}
.ctb__stage{margin:0 0 0 auto;color:#4c6555;font-size:14px}
.ctb--focused{right:auto;height:62px;background:transparent;padding:5px 24px}
.ctb--focused .ctb__steps,.ctb--focused .ctb__stage{display:none}
@media(max-width:760px){.ctb{gap:10px;padding-inline:12px}.ctb__steps{gap:6px}.ctb__line{width:8px}.ctb__step{font-size:12px;gap:4px}.ctb__stage{display:none}}
</style>
