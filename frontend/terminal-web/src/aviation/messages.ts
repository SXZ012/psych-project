/**
 * 航空测评全部提示文案集中管理。
 *
 * 状态机/控制器只输出 key（FaceNotice.messageKey、AudioCue、阶段副标题 key 等），
 * UI 从这里取词。视觉协作者改文案不动逻辑；翻译/口吻调整也只动这一份。
 */

export const MESSAGES = {
  // —— 身份页 ——
  identity: {
    brand: 'AI视觉心理评估终端',
    title: '请填写测评信息',
    note: '信息仅用于本次测评与记录关联',
    privacy: '您的信息将被严格保密',
  },

  // —— 就位检查 ——
  face: {
    opening: '正在开启摄像头…',
    confirming: '正在确认人物位置…',
    cameraDenied: '无法使用摄像头，请允许权限后重试',
    cameraFailed: '摄像头开启失败，请联系工作人员',
    noFace: '未检测到面部，请回到画面框内',
    multiFace: '画面中出现多人，请其他人暂时避开',
    tooFar: '请向屏幕靠近一点',
    tooNear: '请稍微向后坐',
    offCenter: '请将面部移到框中央',
    nearCenterEdge: '请将面部移到画面中央',
    detectError: '人脸检测异常，请联系现场工作人员',
    detectInitFailed: '人脸检测初始化失败，请联系现场工作人员',
    signalLost: '检测信号中断，请正对屏幕',
    reposition: '就位条件变化，请重新确认位置',
    restartHint: '请正对屏幕，重新确认位置',
    readyHeadline: '采集条件已就绪',
    readyMessage: '位置合适，请保持当前坐姿',
    startButton: '开始操作体验',
    note: '正式采集共60秒。请保持自然坐姿，让面部全程位于框内。',
    checklist: {
      camera: '摄像头已开启',
      singleFace: '单人面部已确认',
      position: '位置与大小符合要求',
    },
  },

  // —— 预训练 ——
  practice: {
    eyebrow: '操作预训练',
    meta: '预训练 · 不计入正式测评结果',
    completeTitle: '三道预训练已完成',
    completeBody: '接下来进行 60 秒正式测评。为保证采集质量，请保持自然坐姿，尽量减少头部移动，并让面部持续处于取景框内。',
    startButton: '开始正式测评',
    skipAll: '跳过预训练',
    skippedNote: '已按您的选择跳过预训练',
  },

  // —— 正式采集 ——
  assess: {
    eyebrow: '正式测评',
    hint: '请按当下第一反应选择，无需判断对错',
    remainingLabel: '连续视频采集',
    totalLabel: '共 60 秒',
    skip: '暂时跳过',
    skippedFeedback: '已跳过',
    keepLooking: '请继续自然看向屏幕',
    closingTitle: '请继续自然看向屏幕',
    closingBody: '本段采集即将结束，请保持放松',
    exhaustedTitle: '请继续自然看向屏幕',
    exhaustedBody: '本组题目已全部展示，请保持放松直到采集结束',
    positionOk: '位置合适',
  },

  // —— 采集完成 / 失效 ——
  captured: {
    title: '采集完成，正在保存本次测评数据。',
    body: '视频已停止录制并封存，正在准备提交。',
    simNote: '（开发模拟模式：不会上传任何数据）',
  },
  captureInvalid: {
    title: '本轮采集已失效',
    body: '本次 60 秒连续采集中断时间过长，为保证分析视频的连续有效性，这一轮不会用于测评。',
    reasonPrefix: '具体原因：',
    hint: '请重新就位后，由您主动重新开始一次采集。',
    button: '重新就位',
  },

  // —— 提交与完成 ——
  submit: {
    savingTitle: '正在保存本次测评',
    savingBody: '请勿关闭，数据正在安全提交中…',
    failedTitle: '本次测评暂未成功提交',
    failedFallback: '请检查网络连接或联系现场工作人员协助处理。',
    retryButton: '重新提交',
    completeTitle: '测评数据已提交',
    completeBody: '本次标准化采集已完成，系统正在进行专业分析（通常需要 3—4 分钟）。\n稍后可凭本次报告编号查看报告。',
    completeNotice: '本结果仅用于日常心理状态辅助参考，不构成医学诊断，不直接用于作出适航、录用、晋升或淘汰决定。',
    completeCountdown: '为保护您的隐私，本页面将在 {sec} 秒后自动退出。',
    finishButton: '‹  完成并返回首页',
    videoMissing: '没有可提交的视频，请重新测评',
    noData: '没有可重新提交的测评数据，请重新测评',
  },

  // —— 素材 ——
  assets: {
    loading: '正在准备本次标准化测评素材，请稍候…',
    failedPrefix: '素材准备失败：',
    retry: '重新加载',
    audioMissing: '部分题目缺少语音，请联系工作人员',
    imageFailed: '图片下载失败',
    audioLoadFailed: '语音素材加载失败，请重新加载',
    audioTimeout: '语音加载超时，请重新加载',
    poolTooSmall: '正式题库不足（可用 {count} 题，至少需要 {min} 题），请联系工作人员补充题库',
    poolRequestFailed: '题库请求失败',
    practicePoolFailed: '预训练题目加载失败',
  },

  // —— 知情同意 ——
  consent: {
    summary: ['3 道预训练 · 自定节奏作答', '连续采集 60 秒 · 全程题目语音', '不构成诊断或岗位结论'],
  },


  // —— 首页（一体化入口） ——
  home: {
    brand: 'AI视觉心理评估终端',
    title: '心理状态辅助测评',
    startButton: '开始测评',
    lookupButton: '查询报告',
    infoCapture: '正式采集约 60 秒',
    infoAnalysis: '提交后分析通常需要 3—4 分钟',
    infoFlow: '测评 → 提交分析 → 稍后凭报告编号查看报告',
    about: '了解测评',
    aboutTitle: '关于本测评',
    aboutItems: [
      '用途：通过 60 秒面部视频与标准题组，对当前心理生理状态做辅助筛查。',
      '流程：身份确认 → 知情同意 → 面部就位 → 三道预训练 → 60 秒正式测评 → 提交分析。',
      '结果：分析通常需要 3—4 分钟；完成后凭本次报告编号在首页“查询报告”查看。',
      '边界：结果为辅助筛查参考，不构成医学诊断，不直接用于适航、录用、晋升或淘汰决定。',
    ],
    footer: '心理状态辅助评估 · 非临床诊断',
  },

  // —— 报告查询 ——
  report: {
    lookupTitle: '查询报告',
    lookupIntro: '请输入本次测评完成后获得的固定报告编号',
    subjectLabel: '工号',
    codeLabel: '报告查询码',
    codePlaceholder: '例如 ABCDE-FGHIJ',
    submitButton: '查询',
    querying: '正在查询…',
    invalidCredential: '报告编号有误，请核对后重新输入',
    rateLimited: '尝试过于频繁，请稍后再试',
    networkError: '网络异常，请稍后重试',
    backHome: '返回首页',
    // 状态文案（处理中/超时/完成/失败/无效）——终端不出现"合作方/算法/任务/上传"等内部表述
    processingTitle: '分析中',
    processing: '通常需要 3—4 分钟，您可以稍后再查。',
    processingStage: '{stage}',
    processingSlow: '分析时间较长，本次记录已保存，请稍后再查。',
    slowAfterMinutes: 8,
    completed: '报告已生成，可以查看。',
    viewReport: '查看报告',
    needsAttention: '本次报告暂未生成，请联系工作人员。',
    invalid: '本次采集未达到分析要求，需要重新测评。',
    submittedAt: '提交时间：{time}',
    exitButton: '完成并返回首页',
    privacyNote: '查看完毕请退出；退出后本页内容立即清除',
    autoExit: '{sec} 秒后自动退出',
    notProvided: '暂未提供',
    // 报告页
    reportTitle: '个人测评报告',
    summaryTitle: '本次结果摘要',
    summaryTime: '测评时间',
    summaryQuality: '采集质量',
    summaryQualityOk: '视频质量合格',
    summaryQualityUnknown: '采集质量：暂未提供',
    summaryReview: '专业复核',
    reviewed: '已经过工作人员复核',
    notReviewed: '尚未进行专业复核',
    indicatorsTitle: '详细指标',
    indicatorSource: '数据来源：合作方算法',
    adviceTitle: '建议与后续',
    adviceItems: [
      '本结果为一次时点的辅助筛查参考，不构成医学诊断或岗位结论。',
      '如指标提示需要关注，建议结合近期作息与压力状况解读。',
      '需要进一步解读时，请联系授权工作人员进行专业复核。',
      '如近期有明显不适或持续困扰，建议前往正规医疗机构就诊。',
    ],
    disclaimer: '辅助筛查，不构成医学诊断和适航结论',
    templateVersion: '报告模板 {version}',
    minutes: '分钟',
  },

  // —— 工作人员入口 ——
  staff: {
    authTitle: '工作人员认证',
    authIntro: '请输入管理密码继续（认证后可切换航空测评或社区服务）',
    passwordLabel: '管理密码',
    authButton: '认证',
    authFailed: '密码错误',
    panelTitle: '现场管理',
    panelDevice: '设备',
    panelScene: '场景',
    panelVersion: '版本',
    panelTasks: '待处理任务',
    panelActions: '操作',
    taskRetry: '重试任务',
    taskRetried: '已重新入队',
    networkCheck: '网络检查',
    networkOk: '后端连接正常',
    networkBad: '后端不可达',
    sceneAviation: '切换到航空场景',
    sceneCommunity: '切换到社区场景',
    exit: '退出管理',
  },
  // —— 语音（AudioCue → 文件名，缺一即预加载失败）——
  audioCueFiles: {
    invalid: 'invalid.wav',
    deviation: 'deviation.wav',
    near: 'near.wav',
    far: 'far.wav',
    start: 'start.wav',
    complete: 'complete.wav',
    'practice-complete': 'practice-complete.wav',
    'practice-skipped': 'practice-skipped.wav',
  } as Record<string, string>,
} as const

/** FaceNotice.messageKey → 文案（key 缺失时回退原文，便于排查漏配） */
export function faceMessage(key: string): string {
  const table = MESSAGES.face as unknown as Record<string, unknown>
  const value = table[key]
  return typeof value === 'string' ? value : key
}
