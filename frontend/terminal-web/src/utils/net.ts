/**
 * 网络工具：带超时的 fetch。
 *
 * 网络挂起（不报错、也不返回）时裸 fetch 会永久 pending——上传/提交
 * 场景必须可失败可重试，超时按 AbortError 走既有 catch 分支。
 */

/** 上传大视频的宽裕超时（慢网络下 60s 视频编码上传可能接近两分钟） */
export const UPLOAD_TIMEOUT_MS = 120_000
/** 轻量 JSON 请求（状态轮询/配置拉取）超时 */
export const API_TIMEOUT_MS = 10_000

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
