<script setup lang="ts">
// UI-only review: no flow composable, camera activation, session creation or submission.
import { computed, ref } from 'vue'
import CommunityTopBar from '../community/CommunityTopBar.vue'
import CommunityBrief from '../community/CommunityBrief.vue'
import CommunityConsent from '../community/CommunityConsent.vue'
import FaceReady from '../community/FaceReady.vue'
import CommunityPractice from '../community/CommunityPractice.vue'
import CommunityCountdown from '../community/CommunityCountdown.vue'
import CommunityQuestionStage from '../community/CommunityQuestionStage.vue'
import JourneyClosing from '../community/JourneyClosing.vue'
import { PRACTICE_QUESTIONS } from '@/config/community/content'
import type { CommunityPhase } from '@/types/community'
import type { SchedulerCard } from '@/aviation/types'

const screens = ['说明','知情同意','人脸准备','预训练','倒计时','正式答题','采集完成'] as const
const screen = ref<typeof screens[number]>('说明')
const menu = ref<HTMLDetailsElement | null>(null)
const phases: CommunityPhase[] = ['brief','consent','face_ready','practice','countdown','capturing','closing']
const phase = computed(() => phases[screens.indexOf(screen.value)]!)
const example = PRACTICE_QUESTIONS[0]!
const card: SchedulerCard = { kind:'question', instance:{ instanceId:1, role:'regular', question:{ id:'preview-only', question:example.question, image:example.image, imageAlt:'社区情境图片', audioUrl:'', dimension:'界面演示', contentVersion:'preview', scoringMode:'observation_only', options:example.options.map((text,index)=>({id:String(index),text})) } } }
function pick(value: typeof screens[number]) { screen.value=value; if(menu.value) menu.value.open=false }
</script>
<template>
  <CommunityTopBar :phase="phase" @home="pick('说明')" />
  <CommunityBrief v-if="screen==='说明'" @next="pick('知情同意')" />
  <CommunityConsent v-else-if="screen==='知情同意'" :assets-ready="true" assets-error="" @confirm="pick('人脸准备')" />
  <FaceReady v-else-if="screen==='人脸准备'" :native="false" :ready="true" :checklist="[{label:'摄像头就绪',pass:true},{label:'单人面部',pass:true},{label:'位置合适',pass:true}]" message="位置合适，请保持自然坐姿" @confirm="pick('预训练')" />
  <CommunityPractice v-else-if="screen==='预训练'" :native="false" camera-message="位置合适" face-level="ok" @start="pick('倒计时')" />
  <CommunityCountdown v-else-if="screen==='倒计时'" :native="false" :countdown="3" :face-ok="true" camera-message="位置合适" />
  <CommunityQuestionStage v-else-if="screen==='正式答题'" :native="false" :card="card" :presented-count="1" :total="24" :progress="20" :remaining-sec="48" camera-message="位置合适" face-state="ok" :interrupting="false" interrupt-reason="" :final-hint="false" />
  <JourneyClosing v-else :uploading="false" error="" />
  <details ref="menu" class="preview-menu"><summary>界面预览 · 模拟数据</summary><button v-for="item in screens" :key="item" @click="pick(item)">{{ item }}</button></details>
</template>
<style scoped>
.preview-menu{position:fixed;z-index:600;right:12px;bottom:8px;max-width:500px;padding:8px 12px;border-radius:12px;background:#fff3d6;color:#695020;font-size:12px;box-shadow:0 2px 8px #0001}
.preview-menu summary{cursor:pointer}.preview-menu button{margin:8px 4px 0;padding:8px;border:0;border-radius:8px;background:#ede2c6;color:#50411f}
</style>
