import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { getAssessment, listAssessments, type AssessmentPage } from '@/api/assessments'
import type { AssessmentDetail, AssessmentListItem } from '@/types/assessment'
import { useAssessmentStore } from '../assessments'

vi.mock('@/api/assessments', () => ({
  getAssessment: vi.fn(), listAssessments: vi.fn(), updateNote: vi.fn(), updateReviewStatus: vi.fn(),
}))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const row = (id: string, scene = 'community') => ({ id, scene, created_at: '2026-09-30T00:00:00Z' }) as AssessmentListItem
beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks() })

describe('admin scene reports', () => {
  it('shows the complete total while loading records in pages', async () => {
    vi.mocked(listAssessments)
      .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => row(String(i))), total: 153 })
      .mockResolvedValueOnce({ items: Array.from({ length: 53 }, (_, i) => row(String(i + 100))), total: 153 })
    const store = useAssessmentStore()
    await store.load()
    expect(store.total).toBe(153)
    expect(store.records).toHaveLength(100)
    expect(store.hasMore).toBe(true)
    await store.loadMore()
    expect(listAssessments).toHaveBeenLastCalledWith({ limit: 100, offset: 100, scene: 'all', q: undefined })
    expect(store.records).toHaveLength(153)
    expect(store.total).toBe(153)
    expect(store.hasMore).toBe(false)
  })
  it('does not offer an empty extra page when the total is exactly 100', async () => {
    vi.mocked(listAssessments).mockResolvedValue({ items: Array.from({ length: 100 }, (_, i) => row(String(i))), total: 100 })
    const store = useAssessmentStore()
    await store.load()
    expect(store.total).toBe(100)
    expect(store.hasMore).toBe(false)
    await store.loadMore()
    expect(listAssessments).toHaveBeenCalledTimes(1)
  })
  it('defaults to all scenes and sends number search to the server', async () => {
    vi.mocked(listAssessments).mockResolvedValue({ items: [], total: 0 })
    const store = useAssessmentStore()
    store.search = ' A1B2C3D4 '
    await store.load()
    expect(listAssessments).toHaveBeenCalledWith({ limit: 100, scene: 'all', q: 'A1B2C3D4' })
  })
  it('ignores stale list results after switching scenes', async () => {
    const old = deferred<AssessmentPage>()
    vi.mocked(listAssessments).mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [row('new')], total: 26 })
    const store = useAssessmentStore()
    const loading = store.load()
    await store.setScene('community')
    old.resolve({ items: [row('old', 'aviation')], total: 127 }); await loading
    expect(store.records.map(x => x.id)).toEqual(['new'])
    expect(store.scene).toBe('community')
    expect(store.total).toBe(26)
  })
  it('ignores old load-more response after switching scenes', async () => {
    const more = deferred<AssessmentPage>()
    vi.mocked(listAssessments).mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, i) => row(String(i))), total: 153 })
      .mockReturnValueOnce(more.promise).mockResolvedValueOnce({ items: [row('aviation', 'aviation')], total: 1 })
    const store = useAssessmentStore()
    await store.load()
    const pending = store.loadMore()
    await store.setScene('aviation')
    more.resolve({ items: [row('late-community')], total: 153 }); await pending
    expect(store.records.map(x => x.id)).toEqual(['aviation'])
    expect(store.loadingMore).toBe(false)
    expect(store.total).toBe(1)
  })
  it('does not restore a report after leaving its detail page', async () => {
    const pending = deferred<AssessmentDetail>()
    vi.mocked(getAssessment).mockReturnValueOnce(pending.promise)
    const store = useAssessmentStore()
    const opening = store.open('old')
    store.closeDetail()
    pending.resolve(row('old') as AssessmentDetail); await opening
    expect(store.current).toBeNull()
    expect(store.detailLoading).toBe(false)
  })
})
