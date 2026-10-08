// Only a scoped access link is remembered; report contents and personal data stay on the server.
export type ReportAccess = { token: string; session: string; expiresAt: number }
export const ACCESS_KEY = 'psych.community.report_access'
const WEEK = 7 * 24 * 60 * 60 * 1000

export function rememberAccess(storage: Pick<Storage, 'setItem'>, token: string, session: string, now = Date.now()) {
  if (!token && !session) return
  let expiresAt = now + WEEK
  if (token) {
    try {
      const encoded = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
      const exp = JSON.parse(atob(encoded)).exp
      if (typeof exp === 'number') expiresAt = Math.min(expiresAt, exp * 1000)
    } catch { /* The server always verifies the token; decoding only bounds local retention. */ }
  }
  try { storage.setItem(ACCESS_KEY, JSON.stringify({ token, session: token ? '' : session, expiresAt })) } catch { /* Private browsers can still use the current URL. */ }
}

export function restoreAccess(storage: Pick<Storage, 'getItem' | 'removeItem'>, now = Date.now()): ReportAccess | null {
  try {
    const saved = JSON.parse(storage.getItem(ACCESS_KEY) || 'null')
    if (saved && typeof saved.token === 'string' && typeof saved.session === 'string'
      && (saved.token || saved.session) && typeof saved.expiresAt === 'number' && saved.expiresAt > now) return saved
    storage.removeItem(ACCESS_KEY)
  } catch { /* A blocked or corrupt store must not prevent opening a fresh scan. */ }
  return null
}

export function forgetAccess(storage: Pick<Storage, 'removeItem'>) {
  try { storage.removeItem(ACCESS_KEY) } catch { /* Current page remains usable. */ }
}
