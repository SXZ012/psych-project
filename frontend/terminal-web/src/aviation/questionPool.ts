/**
 * 会话题池构建：后端航空题库 → 预训练/正式题池 + 素材预加载校验。
 *
 * - 题库接口为航空专用 /api/v1/pairs/aviation/pool（按 pair 去重、图片优先不重复），
 *   能返回足量题目；社区 /pairs/session 的“按维度+图片去重”规则不受影响。
 * - 不足 poolMinimum 直接抛错（明确、可追踪），绝不伪造题目或带缺口静默进入正式采集。
 * - 预训练与正式题不重复（从同一池划分）；题池过小时的取舍记录进 notes，
 *   随提交审计上传。
 * - 音频 URL 统一重定向到本仓 paired-v1 目录（题库 audio_url 只取文件名部分，
 *   不信任其路径/版本参数——以仓库实际存在的预生成文件为准）。
 */
import type { SessionQuestion } from './types.ts'
import { AVIATION_CONFIG } from './config.ts'
import { MESSAGES } from './messages.ts'
import type { AudioCoordinator } from './AudioCoordinator.ts'

interface RawPair {
  pair_id: string
  image_url: string
  question: string
  option_a: string
  option_b: string
  audio_url?: string | null
  dimension?: string | null
  scenario?: string | null
  content_version?: string | null
  scoring_mode?: string | null
}

export interface BuiltSession {
  practice: SessionQuestion[]
  formal: SessionQuestion[]
  contentVersion: string
  /** 构建取舍说明（题池紧张、图片复用等），随提交审计 */
  notes: string[]
}

export interface PoolBuildOptions {
  fetchImpl?: typeof fetch
  /** 打乱（测试注入确定性序列） */
  shuffle?: <T>(items: T[]) => T[]
}

function audioUrlFor(pair: RawPair): string {
  const filename = (pair.audio_url || '').split('/').pop()?.split('?')[0] || ''
  if (!filename || !filename.endsWith('.wav')) {
    throw new Error(`pair ${pair.pair_id} audio missing: ${pair.audio_url || '(empty)'}`)
  }
  return AVIATION_CONFIG.audioRoot + filename
}

function toSessionQuestion(pair: RawPair): SessionQuestion {
  const question = String(pair.question || '').trim()
  const optionA = String(pair.option_a || '').trim()
  const optionB = String(pair.option_b || '').trim()
  if (!question || !optionA || !optionB || !pair.image_url) {
    throw new Error(`题库内容不完整: pair ${pair.pair_id}`)
  }
  return {
    id: String(pair.pair_id),
    question,
    options: [
      { id: `${pair.pair_id}-a`, text: optionA },
      { id: `${pair.pair_id}-b`, text: optionB },
    ],
    image: String(pair.image_url),
    imageAlt: '航空情境图片',
    audioUrl: audioUrlFor(pair),
    dimension: pair.dimension ? String(pair.dimension) : undefined,
    scenario: pair.scenario ? String(pair.scenario) : undefined,
    contentVersion: pair.content_version ? String(pair.content_version) : undefined,
    scoringMode: pair.scoring_mode === 'validated' ? 'validated' : 'observation_only',
  }
}

/** 拉取并划分题池。任何结构性问题（不足/内容缺失/音频缺失）抛错。 */
export async function buildSessionPool(options: PoolBuildOptions = {}): Promise<BuiltSession> {
  const doFetch = options.fetchImpl ?? fetch
  const shuffle = options.shuffle ?? ((items: unknown[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  })

  const response = await doFetch(`${AVIATION_CONFIG.poolUrl}?count=${AVIATION_CONFIG.poolRequestCount}`)
  if (!response.ok) throw new Error(MESSAGES.assets.poolRequestFailed)
  const body = await response.json() as { pairs?: RawPair[] }
  const rawPairs = Array.isArray(body.pairs) ? body.pairs : []

  const minimum = AVIATION_CONFIG.poolMinimum
  if (rawPairs.length < minimum) {
    throw new Error(
      MESSAGES.assets.poolTooSmall
        .replace('{count}', String(rawPairs.length))
        .replace('{min}', String(minimum)),
    )
  }

  const notes: string[] = []
  const mapped = rawPairs.map(toSessionQuestion)
  const shuffled = shuffle(mapped) as SessionQuestion[]

  // 预训练 3 题从池首划出；剩余全部为正式题池
  const practice = shuffled.slice(0, AVIATION_CONFIG.practiceCount)
  const formal = shuffled.slice(AVIATION_CONFIG.practiceCount)
  if (formal.length < minimum - AVIATION_CONFIG.practiceCount) {
    // 到达这里说明题池接近下限：可运行但记录在案
    notes.push(`formal_pool_tight=${formal.length}`)
  }
  const imageCount = new Set(formal.map(q => q.image)).size
  if (imageCount < formal.length) notes.push(`image_reused_in_formal=${formal.length - imageCount}`)

  return {
    practice,
    formal,
    contentVersion: mapped[0]?.contentVersion || 'unknown',
    notes,
  }
}

/**
 * 预加载并校验全部所需素材（题图 + 题目语音 + 提示语音）。
 * 任一失败抛错 → 素材层显示明确错误与重新加载入口。
 */
export async function preloadAssets(
  session: BuiltSession,
  audio: AudioCoordinator,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const questions = [...session.practice, ...session.formal]
  const cueUrls = Object.values(MESSAGES.audioCueFiles).map(file => AVIATION_CONFIG.audioRoot + file)
  const audioUrls = [...new Set([...questions.map(q => q.audioUrl), ...cueUrls])]
  const imageUrls = [...new Set(questions.map(q => q.image))]
  const total = audioUrls.length + imageUrls.length
  let loaded = 0
  const step = () => { loaded += 1; onProgress?.(loaded, total) }
  // 诊断钩子（非 UI）：真机排查素材预加载卡点
  const debug = typeof window !== 'undefined'
    ? (window as unknown as { __preloadDebug?: Record<string, unknown> }).__preloadDebug ??= {}
    : undefined
  if (debug) {
    debug.images = {}
    debug.audioUrls = audioUrls.length
    debug.imageUrls = imageUrls.length
  }

  await Promise.all([
    audio.preload(audioUrls).then(
      () => { if (debug) debug.audio = 'ok'; for (let i = 0; i < audioUrls.length; i++) step() },
      error => { if (debug) debug.audio = String(error); throw error },
    ),
    ...imageUrls.map(url => preloadImage(url).then(
      () => { if (debug) (debug.images as Record<string, string>)[url] = 'ok'; step() },
      error => { if (debug) (debug.images as Record<string, string>)[url] = String(error); throw error },
    )),
  ])
  if (debug) debug.done = true
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(guard)
      if (error) reject(error)
      else resolve()
    }
    // 兜底：onload 依赖事件循环，30s 仍未完成按失败处理（明确错误+重试入口）
    const guard = window.setTimeout(() => finish(new Error(MESSAGES.assets.imageFailed)), 30_000)
    const image = new Image()
    // onload 即视为可用；decode 仅作预热，不作为完成条件
    // （部分 WebView 对缓存命中的图片 decode() Promise 不收敛）
    image.onload = () => {
      try { void image.decode?.().catch(() => undefined) } catch { /* no-op */ }
      finish()
    }
    image.onerror = () => finish(new Error(MESSAGES.assets.imageFailed))
    image.src = url
  })
}
