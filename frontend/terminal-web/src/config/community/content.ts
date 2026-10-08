/**
 * 社区场景固定内容配置 v4（测评前流程压缩 + 题池扩容）。
 * 图题素材由 OSS 提供，测评准备时临时加载，采集完成或退出后释放。
 * 题干及提示音预先生成并在准备阶段加载；缺失音频时明确阻止开始，避免无声测评。
 */

const UX = '/static/assets/community/ux'

/** 各阶段固定时长（毫秒） */
export const COMMUNITY_STAGE_MS = {
  /** 预训练完成后的开始倒计时（不计入正式 60 秒），对齐航空 3 秒 */
  countdown: 3_000,
  /** 选中后锁定反馈时长，随后切下一题（对齐航空自定节奏） */
  selectFeedback: 120,
  /** 只避免保存页面闪烁；上传完成后立即提供报告凭证，不额外等待动画。 */
  closing: 900,
  /** 报告生成中页的自动返回（触摸会暂停；用户通常在此离开） */
  reportProcessingAutoExitSec: 90,
  /** 完成页自动返回（触摸暂停 + 交互重置） */
  completeAutoExitSec: 120,
  /** 失败/异常页自动返回首页（共享终端不留个人信息） */
  failureAutoExitSec: 120,
} as const

/**
 * 正式题池与调度配置（对齐航空自定节奏协议，参数含义见 aviation/config.ts）。
 * 正式池请求 30 道，最低 24 道；排除预训练同图后按实际可用数量准备。
 */
export const COMMUNITY_QUESTION_CONFIG = {
  /** 向后端请求的正式题池上限 */
  poolRequestCount: 30,
  /** 低于此数阻止进入正式采集（明确提示素材不足，不静默降级） */
  poolMinimum: 24,
  /** 剩余 > tailFromMs 新题用常规题；≤ tailFromMs 优先收尾题 */
  tailFromMs: 10_000,
  /** 剩余 ≤ closingFromMs：完成当前题后进入收尾页，不再出新题 */
  closingFromMs: 4_000,
  /** 从题池尾部划出作收尾题的数量 */
  tailPoolSize: 6,
  /** 剩余 ≤ 该秒数且仍在答题时，显示不遮挡题目的柔和收尾提示（并语音提醒一次） */
  finalHintSec: 5,
} as const

/**
 * 信任与边界声明：欢迎页、说明页、完成页统一呈现（口径一字不差）。
 * 不使用“只属于你本人 / 不会保留任何信息”等绝对表述；
 * 边界说明（非医学诊断、可随时退出、可申请删除）必须保留。
 */
export const COMMUNITY_TRUST_POINTS = [
  '这是一次心理状态小测，不是医学诊断',
  '结果不用于判断人格、能力或工作资格',
  '摄像头只用于本次体验，拍摄面部画面',
  '终端退出后自动清除本地显示，记录按隐私说明保存和使用',
  '报告仅限本人及经授权的服务人员查看，可申请删除',
] as const

/** 统一隐私口径：说明页/知情同意共用的标准句（需求六指定表述） */
export const COMMUNITY_PRIVACY_STATEMENT
  = '终端退出后会自动清除本地显示。测评记录将按您已同意的隐私说明保存和使用；报告仅限本人及经授权的服务人员查看。' as const

/** 就位页安抚语（替代指令式提示，降低紧张感） */
export const FACE_CALM_NOTE = '别紧张，这一步只是确认位置' as const

/**
 * 预训练 3 题（集中定义，供 CommunityPractice 展示与正式题池去重共用）。
 * 正式题池会按图片路径排除这三题，保证“正式题与预训练题不重复”。
 */
export const PRACTICE_QUESTIONS = [
  { image: `${UX}/38239121.jpg`, question: '看到这片安静的湖面，你更想？', audioUrl: '/static/assets/community/audio/questions/cq-36e62ea019934248.wav', options: ['安静地停留一会儿', '继续往前走'] },
  { image: `${UX}/5392095.jpg`, question: '这个清晨给你的感觉更接近？', audioUrl: '/static/assets/community/audio/questions/cq-37bc0da3b0625883.wav', options: ['平静而舒展', '想快一些开始'] },
  { image: `${UX}/37443455.jpg`, question: '看到晨光映在水面上，你更想？', audioUrl: '/static/assets/community/audio/questions/cq-b939c34a0142cc60.wav', options: ['安静地多看一会儿', '继续往前走走'] },
] as const

/** 正式题池排除清单：预训练图片（防止正式采集出现预训练用过的图片） */
export const PRACTICE_IMAGE_PATHS: readonly string[] = PRACTICE_QUESTIONS.map(q => q.image)
