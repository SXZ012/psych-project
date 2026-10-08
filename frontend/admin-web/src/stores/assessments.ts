import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getAssessment, listAssessments, updateNote, updateReviewStatus } from '@/api/assessments'
import type { AssessmentDetail, AssessmentListItem, ReviewFilter, ReviewStatus, SceneFilter } from '@/types/assessment'
import { beijingDate } from '@/utils/formatters'

const PAGE_SIZE = 100
export const useAssessmentStore = defineStore('assessments', () => {
  const records = ref<AssessmentListItem[]>([]), current = ref<AssessmentDetail | null>(null)
  const total = ref(0)
  const loading = ref(false), loadingMore = ref(false), hasMore = ref(false), detailLoading = ref(false)
  const error = ref(''), search = ref(''), scene = ref<SceneFilter>('all')
  const reviewFilter = ref<ReviewFilter>('all'), dateFilter = ref<string>('all')
  let listRun = 0, detailRun = 0
  const reviewState = (item: AssessmentListItem): Exclude<ReviewFilter, 'all'> => item.review_status === 'pending' ? 'pending' : 'viewed'
  const filtered = computed(() => records.value.filter(item => {
    const status = reviewFilter.value === 'all' || reviewState(item) === reviewFilter.value
    const date = dateFilter.value === 'all' || beijingDate(item.created_at) === dateFilter.value
    const q = search.value.trim().toLowerCase()
    const keyword = !q || [item.name, item.id_card, item.subject_id, item.id, item.id.replace(/-/g, '').slice(0, 8)].some(v => v?.toLowerCase().includes(q))
    return status && date && keyword
  }))
  async function load() {
    const run = ++listRun
    loading.value = true; loadingMore.value = false; error.value = ''; records.value = []; total.value = 0; hasMore.value = false
    try {
      const page = await listAssessments({ limit: PAGE_SIZE, scene: scene.value, q: search.value.trim() || undefined })
      if (run !== listRun) return
      records.value = page.items; total.value = page.total; hasMore.value = records.value.length < total.value
    } catch (e) { if (run === listRun) error.value = e instanceof Error ? e.message : '加载失败' }
    finally { if (run === listRun) loading.value = false }
  }
  async function setScene(value: SceneFilter) {
    if (value === scene.value) return
    scene.value = value; dateFilter.value = 'all'; reviewFilter.value = 'all'
    await load()
  }
  async function loadMore() {
    if (loading.value || loadingMore.value || !hasMore.value) return
    const run = listRun
    loadingMore.value = true; error.value = ''
    try {
      const page = await listAssessments({ limit: PAGE_SIZE, offset: records.value.length, scene: scene.value, q: search.value.trim() || undefined })
      if (run !== listRun) return
      const seen = new Set(records.value.map(r => r.id))
      records.value.push(...page.items.filter(r => !seen.has(r.id))); total.value = page.total; hasMore.value = page.items.length > 0 && records.value.length < total.value
    } catch (e) { if (run === listRun) error.value = e instanceof Error ? e.message : '加载更多失败' }
    finally { if (run === listRun) loadingMore.value = false }
  }
  async function open(id: string) {
    const run = ++detailRun
    detailLoading.value = true; error.value = ''
    if (current.value?.id !== id) current.value = null
    try {
      const result = await getAssessment(id)
      if (run === detailRun) current.value = result
    } catch (e) {
      if (run === detailRun) error.value = e instanceof Error ? e.message : '报告加载失败'
      throw e
    } finally { if (run === detailRun) detailLoading.value = false }
  }
  function closeDetail() { detailRun++; current.value = null; detailLoading.value = false }
  async function setReviewStatus(id: string, status: ReviewStatus) {
    await updateReviewStatus(id, status)
    const row = records.value.find(x => x.id === id)
    if (row) row.review_status = status
    if (current.value?.id === id) current.value.review_status = status
  }
  async function saveNote(id: string, note: string | null) {
    await updateNote(id, note)
    const row = records.value.find(x => x.id === id)
    if (row) row.admin_note = note
    if (current.value?.id === id) current.value.admin_note = note
  }
  return { records, total, current, loading, loadingMore, hasMore, detailLoading, error, search, scene, setScene, reviewFilter, dateFilter, reviewState, filtered, load, loadMore, open, closeDetail, setReviewStatus, saveNote }
})
