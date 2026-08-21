import type { TerminalQuestion } from '@/types/terminal'

const fallbackImages = [
  '/static/assets/aviation/a01-instrument-monitoring.jpg',
  '/static/assets/aviation/b01-workload.jpg',
  '/static/assets/aviation/c01-situation-awareness.jpg',
  '/static/assets/aviation/d01-procedure-check.jpg',
  '/static/assets/aviation/e01-crew-communication.jpg',
]

const aviationDrafts = [
  ['q1', '注意分配', '仪表监控', '当多个信息同时变化时，你通常更接近哪种处理方式？', '先确认最关键的信息，再依次处理其他变化。', '先快速浏览全部信息，再决定从哪里开始。'],
  ['q2', '工作负荷', '时间压力', '当时间压力增加而任务仍未完成时，你更倾向于？', '重新确认优先级，按关键程度继续推进。', '尽量维持原有节奏，避免临时调整计划。'],
  ['q3', '情境意识', '天气变化', '当外部条件与预期逐渐出现偏差时，你更倾向于？', '及时更新判断，并为替代方案预留空间。', '继续观察变化，等信息更明确后再调整。'],
  ['q4', '程序与安全意识', '交叉检查', '在熟悉任务且时间紧张的情况下，你更接近哪种做法？', '仍按步骤完成必要复核，避免遗漏。', '依靠经验简化部分步骤，提高处理速度。'],
  ['q5', '机组沟通', '协同决策', '当同伴的判断与你不一致时，你更倾向于？', '说明依据并共同核对关键事实。', '先保留意见，等待后续情况进一步明确。'],
] as const

export const makeQuestions = (): TerminalQuestion[] => aviationDrafts.map(([id, dimension, scenario, question, first, second], index) => ({
  id, question, dimension, scenario, contentVersion: 'aviation-draft-v2', scoringMode: 'observation_only', image: fallbackImages[index],
  options: [{ id: `${id}a`, text: first }, { id: `${id}b`, text: second }],
}))
