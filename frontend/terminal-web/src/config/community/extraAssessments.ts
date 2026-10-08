/** Sources and reuse terms checked 2026-09-29; see docs/community-content-sources.md. */
export const extraAssessmentCards = [
  { title: 'K10 心理困扰筛查', short: 'K10', description: '从疲惫、紧张与低落了解近期困扰', meta: '10 题 · 约 2 分钟 · 近30天', category: '综合状态', tone: 'teal', kind: '完整筛查' },
  { title: 'ONS4 生活感受', short: 'ONS4', description: '分别看看满意、意义、快乐与焦虑感受', meta: '4 题 · 约 1 分钟 · 生活感受', category: '综合状态', tone: 'teal', kind: '生活感受' },
] as const

export const extraAssessments = [
  {
    title: 'K10 心理困扰筛查', short: 'K10',
    questions: ['无法解释的筋疲力尽？', '紧张？', '太紧张以至于什么都不能让您平静下来？', '绝望？', '不安或烦躁？', '太不安以至于静坐不能？', '沮丧的？', '太沮丧以至于什么都不能让您愉快起来？', '做每一件事情都很费劲？', '无价值？'],
    options: ['全部时间', '大部分时间', '一部分时间', '偶尔', '无'],
    scoreMaps: Array.from({ length: 10 }, () => [4, 3, 2, 1, 0]),
    levels: [[40, '请结合困扰的持续时间和生活影响理解']] as Array<[number, string]>,
    timeframe: '过去 30 天', questionHint: '过去 30 天中，您有多少时间感到以下情况？',
    source: 'Kessler 等（2003）；普通话译文：北京大学精神卫生研究所 Huang、Liu。Copyright © Ronald C. Kessler, PhD. All rights reserved.',
    sourceUrl: 'https://rckessler.scholars.harvard.edu/k10-and-k6-scales',
    resultHint: '采用作者提供的 0–40 分计分：每题“无”为 0 分，“全部时间”为 4 分。分数越高表示自报困扰越多。这不是诊断，也不能直接套用另一种 10–50 分版本的分界值；如困扰持续或影响日常生活，可联系专业人员评估。',
  },
  {
    title: 'ONS4 生活感受', short: 'ONS4',
    questions: ['总体而言，你对目前的生活有多满意？', '总体而言，你觉得自己生活中所做的事情有多大意义？', '总体而言，你昨天感到有多快乐？', '总体而言，你昨天感到有多焦虑？'],
    options: Array.from({ length: 11 }, (_, i) => String(i)),
    levels: [] as Array<[number, string]>, timeframe: '题目指定的当前或昨天',
    questionHint: '0 表示完全没有，10 表示完全如此。请选择最接近的程度。',
    source: 'Office for National Statistics（英国国家统计局），Open Government Licence v3.0。中文参考译文由本项目整理，未进行本地常模验证。',
    sourceUrl: 'https://www.ons.gov.uk/peoplepopulationandcommunity/wellbeing/methodologies/personalwellbeingfrequentlyaskedquestions',
    licenseUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
    resultMode: 'profile' as const,
    resultHint: '四个问题分别反映不同感受，不能相加为一个心理健康总分。前三项越高，表示相应正向感受越强；“昨天焦虑”越高表示焦虑感越强。这里仅用于自我观察，不划分疾病等级，也不提供诊断。',
    profileLabels: ['生活满意', '生活意义', '昨天快乐', '昨天焦虑'],
  },
]

/** Returns item scores only; ONS4 intentionally has no combined score. */
export function extraAssessmentResult(id: string, choices: number[], definition?: { short: string; questions: string[]; options?: string[]; scoreMaps?: number[][]; resultMode?: 'profile' }) {
  const scale = definition || extraAssessments.find(item => item.short === id)
  if (!scale || !scale.options || choices.length !== scale.questions.length || Array.from(choices).some(value => !Number.isInteger(value) || value < 0 || value >= scale.options!.length)) {
    throw new Error('请完整作答后再查看结果')
  }
  const scores = choices.map((choice, index) => scale.scoreMaps?.[index]?.[choice] ?? choice)
  return { scores, total: scale.resultMode === 'profile' ? null : scores.reduce((sum, value) => sum + value, 0) }
}
