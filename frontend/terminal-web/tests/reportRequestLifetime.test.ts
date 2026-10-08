import { test } from 'node:test'
import assert from 'node:assert/strict'
import { useReportLookup } from '../src/composables/useReportLookup.ts'
test('a response arriving after exit cannot restore the last report', async () => {
  let resolve!: (response:Response)=>void
  const lookup = useReportLookup((() => new Promise<Response>(done=>{resolve=done})) as typeof fetch)
  const pending = lookup.lookupByReportId('1234ABCD')
  lookup.exit()
  resolve(new Response(JSON.stringify({status:'completed',report:{private:true}})))
  assert.equal(await pending,false)
  assert.equal(lookup.result.value,null)
  assert.equal(lookup.submittedCode.value,null)
  assert.equal(lookup.loading.value,false)
})
