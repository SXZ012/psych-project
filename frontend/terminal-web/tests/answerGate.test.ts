import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAnswerGate } from '../src/utils/answerGate.ts'
test('double tap and held key cannot answer the next question', () => {
  let time = 1000
  const gate = createAnswerGate(() => time)
  assert.equal(gate.accept(), true)
  time += 200
  assert.equal(gate.accept(), false)
  time += 201
  assert.equal(gate.accept(true), false)
  assert.equal(gate.accept(), true)
})
