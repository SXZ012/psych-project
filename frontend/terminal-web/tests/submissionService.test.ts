/**
 * SubmissionService 测试：client_token 幂等、重试不重建、状态区分（失败/QA/录像无效）。
 * 运行：node --test --experimental-strip-types tests/submissionService.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { SubmissionService } from '../src/aviation/SubmissionService.ts'
import type { SubmitPayload } from '../src/aviation/types.ts'

function payload(): SubmitPayload {
  return {
    name: '张三', id_card: '', subject_id: 'E001', gender: '男', age: 30,
    selections: [{ question_id: 'q1', picked: ['q1-a'], answered_ms: 1200, outcome: 'selected', role: 'regular' }],
    duration_seconds: 60, effective_duration_seconds: 60, paused_count: 0,
    client_token: '',
  }
}

const VIDEO = new Blob(['x'], { type: 'video/webm' })

function jsonResponse(id: string) {
  return new Response(JSON.stringify({ id }), { status: 201 })
}

test('浏览器首次提交成功：POST /submit 携带 client_token', async () => {
  const calls: Array<{ url: string; form: FormData }> = []
  const service = new SubmissionService({
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), form: init!.body as FormData })
      return jsonResponse('a1')
    },
    randomToken: () => 'token-1',
  })
  service.begin()
  const outcome = await service.submit(payload(), VIDEO)
  assert.equal(outcome.status, 'succeeded')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/v1/assessments/submit')
  assert.equal(calls[0].form.get('client_token'), 'token-1')
})

test('网络失败后重试：同一 client_token 重发原视频（幂等键不变）', async () => {
  const tokens: string[] = []
  let fail = true
  const service = new SubmissionService({
    fetchImpl: async (url, init) => {
      tokens.push((init!.body as FormData).get('client_token') as string)
      if (fail) { fail = false; throw new TypeError('network down') }
      return jsonResponse('a2')
    },
    randomToken: () => 'token-2',
  })
  service.begin()
  const first = await service.submit(payload(), VIDEO)
  assert.equal(first.status, 'failed')
  assert.equal((first as { canRetry: boolean }).canRetry, true)
  const second = await service.submit(payload(), VIDEO)
  assert.equal(second.status, 'succeeded')
  assert.deepEqual(tokens, ['token-2', 'token-2'], '重试复用同一幂等令牌')
})

test('服务端 QA 拒绝（VideoQAFailed）→ qa_rejected，与网络失败区分', async () => {
  const service = new SubmissionService({
    fetchImpl: async () => new Response(
      JSON.stringify({ detail: { code: 'VideoQAFailed', message: '视频质量未达到分析要求' } }),
      { status: 422 },
    ),
    randomToken: () => 't',
  })
  service.begin()
  const outcome = await service.submit(payload(), VIDEO)
  assert.equal(outcome.status, 'qa_rejected')
  assert.equal((outcome as { message: string }).message.includes('视频质量'), true)
})

test('录像无效（无视频）与上传失败是不同状态', async () => {
  const service = new SubmissionService({ randomToken: () => 't' })
  service.begin()
  const outcome = await service.submit(payload(), null)
  assert.equal(outcome.status, 'video_invalid')
  assert.equal((outcome as { canRetry?: boolean }).canRetry, undefined)
})

test('原生路径：payload 透传（token 与审计字段由原生层随 multipart 重传）', async () => {
  const submitted: SubmitPayload[] = []
  let fail = true
  const service = new SubmissionService({
    nativeSubmit: async p => {
      submitted.push(p)
      if (fail) { fail = false; return { ok: false, error: 'HTTP 500' } }
      return { ok: true, assessment_id: 'n1' }
    },
    randomToken: () => 'token-n',
  })
  service.begin()
  assert.equal((await service.submit(payload(), null)).status, 'failed')
  const outcome = await service.submit(payload(), null)
  assert.equal(outcome.status, 'succeeded')
  assert.equal(submitted.length, 2)
  assert.equal(submitted[0].client_token, 'token-n')
  assert.equal(submitted[1].client_token, 'token-n', '原生重试同 token')
})

test('begin() 重置：新一次测评生成新 token', async () => {
  const service = new SubmissionService({ randomToken: () => `t-${Math.random()}` })
  const first = service.begin()
  const second = service.begin()
  assert.notEqual(first, second)
})
