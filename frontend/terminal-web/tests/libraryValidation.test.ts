import test from 'node:test'
import assert from 'node:assert/strict'
import { scales } from '../src/config/community/scales.ts'
import { selfScales, officialResources, scienceDetails } from '../src/config/community/libraryContent.ts'
import { validLibrary } from '../src/community/libraryValidation.ts'
const library = { scales, selfScales, officialResources, scienceDetails }
const ids = scales.map(item => item.short)

test('the database edition contains complete cards, scoring definitions and reading sections', () => {
  assert.equal(validLibrary(library, ids), true)
  assert.equal(new Set(ids).size, 11)
})
test('incompatible scale order or incomplete content keeps the bundled edition usable', () => {
  const reordered = structuredClone(library)
  reordered.scales.reverse()
  assert.equal(validLibrary(reordered, ids), false)
  const missing = structuredClone(library)
  delete missing.scienceDetails[missing.officialResources[0]!.title]
  assert.equal(validLibrary(missing, ids), false)
  const broken = structuredClone(library)
  broken.scales[0]!.scoreMaps = [[Infinity]]
  assert.equal(validLibrary(broken, ids), false)
})
