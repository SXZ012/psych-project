<script setup lang="ts">
/**
 * 航空终端外壳（一体化产品路由）：首页 ↔ 测评流程 ↔ 报告查询 ↔ 工作人员面板。
 *
 * - 首页为默认态；测评与查询互不共享任何状态（各自组件持有，退出即清空）；
 * - 测评组件以递增 key 挂载：每场全新实例，杜绝 A/B 用户状态串号；
 * - 完成测评回到首页后，A 的后台分析在服务端继续，B 可立即开始；
 * - 工作人员热区由首页 emit（staffWake），认证后才出现管理面板。
 */
import { ref, watch } from 'vue'
import AviationHome from '@/components/home/AviationHome.vue'
import AviationFlow from '@/components/AviationFlow.vue'
import ReportLookup from '@/components/report/ReportLookup.vue'
import StaffGate from '@/components/staff/StaffGate.vue'

type Mode = 'home' | 'assessment' | 'report'
const emit = defineEmits<{ 'entry-state': [atEntry: boolean] }>()
const mode = ref<Mode>('home')
const staffOpen = ref(false)
const assessmentKey = ref(0)

function startAssessment() {
  assessmentKey.value += 1   // 全新流程实例：状态零残留
  mode.value = 'assessment'
}

watch(mode, current => emit('entry-state', current === 'home'), { immediate: true })
</script>

<template>
  <AviationHome
    v-if="mode === 'home'"
    @start="startAssessment"
    @lookup="mode = 'report'"
    @staff-wake="staffOpen = true"
  />
  <AviationFlow v-else-if="mode === 'assessment'" :key="assessmentKey" @exit="mode = 'home'" />
  <ReportLookup v-else-if="mode === 'report'" @back="mode = 'home'" />

  <StaffGate v-if="staffOpen" @close="staffOpen = false" />
</template>
