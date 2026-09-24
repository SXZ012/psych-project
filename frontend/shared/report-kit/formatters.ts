/** 共享格式化工具（与 admin-web 原实现逐字一致；两端不得各自再实现一份）。 */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
export function displayNumber(value: unknown, digits = 1) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(digits) : '—' }
export function displayPercent(value: unknown) { const n = Number(value); if (!Number.isFinite(n)) return '—'; return `${(Math.abs(n) <= 1 ? n * 100 : n).toFixed(1)}%` }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getAt(source: unknown, path: string, fallback: unknown = null): any { let current: any = source; for (const key of path.split('.')) { if (current == null || typeof current !== 'object' || !(key in current)) return fallback; current = current[key] } return current ?? fallback }

/** 等级标签 → 语义色调；admin-web 的 statusTone 与终端徽章共用此规则。 */
export function statusTone(value: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (/completed|closed|正常|稳定|良好|通过|低/.test(value)) return 'success'
  if (/failed|invalid|失败|高风险|明显/.test(value)) return 'danger'
  if (/processing|uploading|queued|following|偏高|关注|分散|干扰较高|需谨慎/.test(value)) return 'warning'
  return 'neutral'
}
