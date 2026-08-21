<script setup lang="ts">
import { watch, nextTick } from 'vue'
import IdentityForm from '@/components/identity/IdentityForm.vue'
import ConsentPanel from '@/components/consent/ConsentPanel.vue'
import FaceCheck from '@/components/camera/FaceCheck.vue'
import CameraMonitor from '@/components/camera/CameraMonitor.vue'
import IntroStage from '@/components/assessment/IntroStage.vue'
import QuestionStage from '@/components/assessment/QuestionStage.vue'
import ResultState from '@/components/feedback/ResultState.vue'
import { useAssessmentFlow } from '@/composables/useAssessmentFlow'

const flow = useAssessmentFlow()
watch(() => flow.phase.value, async phase => { if (['intro', 'assess', 'loading', 'submitting'].includes(phase)) { await nextTick(); void flow.syncPreview('monitor') } })
</script>
<template>
  <video id="analysis-video" autoplay muted playsinline style="position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:-10px;top:-10px"></video>
  <IdentityForm v-if="flow.phase.value==='login'" @submit="flow.enter" />
  <ConsentPanel v-else-if="flow.phase.value==='consent'" :assets-ready="flow.assetsReady.value" :assets-error="flow.assetsError.value" @retry-assets="flow.prepareAssets" @confirm="flow.confirmConsent" />
  <FaceCheck v-else-if="flow.phase.value==='detect'" :ready="flow.faceReady.value" :message="flow.cameraMessage.value" :native="flow.native.available.value" :state="flow.faceState.value" @start="flow.begin" />
  <template v-else-if="flow.phase.value==='intro'"><CameraMonitor :native="flow.native.available.value" :message="flow.cameraMessage.value" :state="flow.faceState.value"/><IntroStage /></template>
  <template v-else-if="flow.phase.value==='assess'"><QuestionStage :question="flow.current.value" :index="flow.index.value" :progress="flow.progress.value" :selected="flow.selections.value[flow.index.value]" :native="flow.native.available.value" :camera-message="flow.cameraMessage.value" :face-state="flow.faceState.value" @select="flow.select"/></template>
  <template v-else-if="flow.phase.value==='loading'"><CameraMonitor :native="flow.native.available.value" :message="flow.cameraMessage.value" :state="flow.faceState.value"/><ResultState kind="loading" :countdown="flow.finalCountdown.value"/></template>
  <ResultState v-else-if="flow.phase.value==='submitting'" kind="submitting"/>
  <ResultState v-else-if="flow.phase.value==='submit_failed'" kind="failed" :message="flow.failure.value" @retry="flow.retry"/>
  <ResultState v-else kind="complete" :countdown="flow.completeCountdown.value" @activity="flow.resetCompleteCountdown" @finish="flow.finish"/>
</template>
