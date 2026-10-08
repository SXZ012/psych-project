<script setup lang="ts">
/**
 * 图题卡（纯展示）：预训练与正式阶段共用同一组件与选项位置。
 * 事件携带题目实例标识 instanceId——旧题事件/穿透点击在上层调度器被拒绝。
 * 不请求题库、不控制录音、不建计时器。
 */
import type { QuestionInstance } from '@/aviation/types'
import { MESSAGES } from '@/aviation/messages'

defineProps<{
  instance: QuestionInstance
  /** 当前选中（反馈高亮）；null = 等待选择 */
  selected: string | null
  /** 已跳过反馈 */
  skipped?: boolean
  disabled?: boolean
  /** 是否显示“暂时跳过”（仅正式阶段） */
  skippable?: boolean
}>()
const emit = defineEmits<{
  select: [instanceId: number, optionId: string]
  skip: [instanceId: number]
}>()
</script>

<template>
  <section class="image-question">
    <img :src="instance.question.image" :alt="instance.question.imageAlt" />
    <div class="image-question__body">
      <p>{{ MESSAGES.assess.hint }}</p>
      <h1>{{ instance.question.question }}</h1>
      <div class="image-question__options">
        <button
          v-for="(option, i) in instance.question.options" :key="option.id"
          :disabled="disabled || !!selected" :class="{ selected: selected === option.id }"
          @click="emit('select', instance.instanceId, option.id)"
        >
          <b>{{ selected === option.id ? '✓' : i === 0 ? 'A' : 'B' }}</b><span>{{ option.text }}</span>
        </button>
      </div>
      <div class="image-question__actions">
        <small v-if="!skipped">{{ selected ? '已记录，即将继续' : '点击后自动继续' }}</small>
        <small v-else class="image-question__skipped">{{ MESSAGES.assess.skippedFeedback }}</small>
        <button
          v-if="skippable && !selected && !skipped" class="image-question__skip"
          :disabled="disabled" @click="emit('skip', instance.instanceId)"
        >{{ MESSAGES.assess.skip }}</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.image-question{display:grid;grid-template-columns:var(--aq-image-col,40%) 1fr;gap:var(--aq-gap,30px);width:min(var(--aq-width,1120px),calc(100vw - 64px));margin:auto;padding:var(--aq-padding,24px);border:1px solid var(--aq-border,#b7d1e42e);border-radius:var(--aq-radius,24px);background:var(--aq-bg,#101e30e8);box-shadow:var(--aq-shadow,0 18px 50px #0003);box-sizing:border-box;transition:opacity var(--motion-fast,.15s)}
.image-question>img{width:100%;height:100%;min-height:var(--aq-image-min-h,280px);max-height:var(--aq-image-max-h,400px);object-fit:cover;border-radius:calc(var(--aq-radius,24px) * .66)}
.image-question__body{display:flex;flex-direction:column;justify-content:center;min-width:0;color:var(--tx-strong,#fff)}
.image-question__body>p{font-size:var(--fs-caption,13px);color:var(--tx-soft,#a6bed3);margin:0 0 12px}
.image-question h1{font-size:var(--fs-title,25px);line-height:1.5;font-weight:500;margin:0 0 22px}
.image-question__options{display:grid;gap:var(--aq-option-gap,14px)}
.image-question button{display:flex;align-items:center;gap:14px;height:var(--aq-option-h,76px);min-height:var(--aq-option-h,76px);box-sizing:border-box;padding:15px 20px;border:1px solid var(--aq-option-border,#a7c1d64d);border-radius:var(--aq-option-radius,14px);background:var(--aq-option-bg,#ffffff0b);color:var(--tx-strong,#eff6fc);text-align:left;font-size:var(--fs-body,18px);line-height:1.5;transition:background var(--motion-fast,.15s),border-color var(--motion-fast,.15s)}
.image-question button b{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:50%;background:var(--aq-badge-bg,#c6e4fa1a);color:var(--aq-badge-tx,#afd6ee);font-size:15px}
.image-question button.selected{background:var(--aq-selected-bg,#4d8b8155);border-color:var(--aq-selected-border,#86dfb4)}
.image-question__actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.image-question__actions small{color:var(--tx-faint,#96aebf);font-size:var(--fs-micro,12px)}
.image-question__skipped{color:var(--warn-tx,#f5be50)!important}
.image-question__skip{margin-left:auto;min-height:44px;padding:0 22px;border:1px solid var(--aq-option-border,#a7c1d64d);border-radius:999px;background:transparent;color:var(--tx-soft,#a6bed3);font-size:var(--fs-caption,14px)}
.image-question__skip:active{background:var(--aq-option-bg,#ffffff0b)}
@media(max-height:700px){.image-question{padding:18px;gap:22px}.image-question>img{min-height:210px;max-height:310px}.image-question h1{font-size:21px;margin-bottom:12px}.image-question button{min-height:60px;padding:10px 14px;font-size:16px}}


/* 预训练与正式答题共用：白色题卡配深色文字，确保题干、选项和反馈清晰。 */
.image-question{background:#f9fcfc;border-color:#d0e0df;box-shadow:0 12px 28px rgba(35,68,73,.15)}
.image-question__body{color:#203e4d}.image-question__body>p{color:#45626e}.image-question h1{color:#203e4d;font-weight:650}
.image-question button{color:#203e4d;background:#fff;border-color:#b9cfce;font-weight:560}
.image-question button b{color:#2c665f;background:#e4f0ed}.image-question button.selected{color:#1f514b;background:#e1f0ea;border-color:#4f8d82}
.image-question__actions small{color:#4b6570;font-size:14px;font-weight:500}.image-question__skip{color:#285d75;background:#f4f8f8}


/* 预训练与正式测评使用同一题卡：题目/图片长短均不改变卡片外轮廓。 */
.image-question{height:clamp(330px,46vh,420px);grid-template-rows:minmax(0,1fr)}
.image-question>img{height:100%;min-height:0;max-height:none}.image-question__body{min-height:0}
@media(max-height:700px){.image-question{height:clamp(320px,48vh,360px)}.image-question>img{min-height:0;max-height:none}}
</style>
