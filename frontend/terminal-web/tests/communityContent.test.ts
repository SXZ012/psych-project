import test from 'node:test'
import assert from 'node:assert/strict'
import { extraAssessmentResult, extraAssessments, extraAssessmentCards } from '../src/config/community/extraAssessments.ts'
import { knowledgeExpansion, extraDetails, extraResources } from '../src/config/community/knowledgeExpansion.ts'

test('K10 keeps official answer order and recodes all-time=4 / none=0', () => {
  assert.equal(extraAssessmentResult('K10', Array(10).fill(0)).total, 40)
  assert.equal(extraAssessmentResult('K10', Array(10).fill(4)).total, 0)
  assert.equal(extraAssessmentResult('K10', [0,1,2,3,4,0,1,2,3,4]).total, 20)
})
test('ONS4 retains four separate scores and never invents a combined clinical score', () => {
  assert.deepEqual(extraAssessmentResult('ONS4', [8,7,6,2]), { scores: [8,7,6,2], total: null })
  assert.equal(extraAssessmentResult('ONS4', [0,0,0,10]).total, null)
})
test('partial, missing and out-of-range answers do not produce assessment results', () => {
  for (const answers of [[], [0,1,2], [0,0,0,11], [0,0,0,-1], [0,0,0,1.5]]) {
    assert.throws(() => extraAssessmentResult('ONS4', answers))
  }
  assert.throws(() => extraAssessmentResult('unknown', [0,0,0,0]))
})
test('new catalogue entries correspond to complete question sets and source records', () => {
  assert.deepEqual(extraAssessmentCards.map(item => item.short), extraAssessments.map(item => item.short))
  for (const scale of extraAssessments) {
    assert.ok(scale.sourceUrl.startsWith('https://'))
    if (scale.scoreMaps) assert.equal(scale.scoreMaps.length, scale.questions.length)
  }
})
test('each added reading card has its own complete local article, source and action', () => {
  assert.equal(new Set(extraResources.map(item => item.title)).size, extraResources.length)
  for (const article of knowledgeExpansion) {
    assert.ok(article.url.startsWith('https://www.nimh.nih.gov/health/'))
    const sections = extraDetails[article.title]
    assert.ok(sections && sections.length >= 3)
    assert.ok(sections.every(section => section.paragraphs.length > 0))
    assert.ok(article.action.length > 10)
  }
})
