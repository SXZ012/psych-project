import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ACCESS_KEY, forgetAccess, rememberAccess, restoreAccess } from '../src/reportAccess.ts'

function store() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
test('scan before completion survives returning and reloading without a report ID', () => {
  const storage = store()
  rememberAccess(storage, '', 'paid-session', 1000)
  assert.equal(restoreAccess(storage, 2000)?.session, 'paid-session')
})
test('verified report replaces the session link and retains only a scoped capability', () => {
  const storage = store()
  rememberAccess(storage, '', 'paid-session', 1000)
  rememberAccess(storage, 'scoped-report', 'paid-session', 2000)
  assert.deepEqual(restoreAccess(storage, 3000), { token: 'scoped-report', session: '', expiresAt: 2000 + 604800000 })
})
test('an expired signed link is not silently extended by revisiting', () => {
  const storage = store()
  const token = 'header.' + btoa(JSON.stringify({ exp: 10 })) + '.signature'
  rememberAccess(storage, token, '', 2000)
  assert.equal(restoreAccess(storage, 9000)?.expiresAt, 10000)
  assert.equal(restoreAccess(storage, 10000), null)
  assert.equal(storage.getItem(ACCESS_KEY), null)
})
test('revoked access is removed instead of repeatedly restoring it', () => {
  const storage = store()
  rememberAccess(storage, 'revoked', '', 1000)
  forgetAccess(storage)
  assert.equal(restoreAccess(storage, 2000), null)
})
test('blocked browser storage does not prevent a scoped URL from working', () => {
  const storage = { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') }, removeItem: () => { throw Error('blocked') } }
  assert.doesNotThrow(() => rememberAccess(storage, 'access', '', 1000))
  assert.equal(restoreAccess(storage, 1000), null)
  assert.doesNotThrow(() => forgetAccess(storage))
})
test('corrupt stored data is ignored', () => {
  const storage = store()
  storage.setItem(ACCESS_KEY, '{bad json')
  assert.equal(restoreAccess(storage), null)
})
