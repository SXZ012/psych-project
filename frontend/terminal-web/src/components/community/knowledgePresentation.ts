import { extraPresentations } from '../../config/community/knowledgeExpansion'
export type KnowledgeTheme = 'book' | 'sun' | 'emotion' | 'sleep' | 'move' | 'course' | 'support'
type Presentation = { title: string; intro: string; topic: string; theme: KnowledgeTheme; source: string }
const entries: Record<string, Presentation> = {
  ...extraPresentations,
  '心理健康素养十条': { title: '照顾心情，从日常开始', intro: '关于心理健康，值得了解的十件事。', topic: '认识自己', theme: 'book', source: '国家卫生健康委' },
  '健康中国行动：心理健康促进行动': { title: '忙碌的日子，也照顾好自己', intro: '认识压力、调整节奏，也学会主动求助。', topic: '日常调适', theme: 'sun', source: '国家卫生健康委' },
  '正确认识焦虑与抑郁': { title: '焦虑与低落，该怎样理解？', intro: '分清情绪波动，了解何时需要帮助。', topic: '读懂情绪', theme: 'emotion', source: '国家卫生健康委' },
  '睡眠健康核心信息': { title: '关于睡个好觉的那些事', intro: '从作息、睡前习惯，到值得留意的信号。', topic: '好好休息', theme: 'sleep', source: '全国爱卫办 · 国家卫生健康委' },
  '运动与心理健康': { title: '动一动，让心情换个节奏', intro: '找到适合自己的活动，慢慢建立日常习惯。', topic: '活力生活', theme: 'move', source: '国家卫生健康委' },
  '心理健康传播与普及': { title: '一起认识心理健康', intro: '从基础知识到日常调适，循序了解。', topic: '知识入门', theme: 'book', source: '国家智慧教育平台 · 西南交通大学' },
  '大学生心理健康教育': { title: '在成长中，更好地认识自己', intro: '了解学习、关系与成长中的心理话题。', topic: '成长课堂', theme: 'course', source: '国家智慧教育平台 · 中国矿业大学' },
  '老年护理学：心理卫生与精神护理': { title: '多一份理解，陪伴更有温度', intro: '认识长辈的心理变化，也关心照护者。', topic: '关爱长辈', theme: 'sun', source: '国家智慧教育平台 · 福建医科大学' },
  '大学生心理健康': { title: '面对压力，找到自己的节奏', intro: '从情绪、人际关系到主动求助。', topic: '心理调适', theme: 'emotion', source: '国家智慧教育平台 · 福建师范大学' },
  '全国统一心理援助热线 12356': { title: '想找人聊聊，可以打给谁？', intro: '认识 12356，了解热线能提供哪些支持。', topic: '有人倾听', theme: 'support', source: '国家卫生健康委' },
  '心理问题何时需要专业帮助': { title: '什么时候，该寻求帮助？', intro: '了解求助信号，迈出联系专业人员的第一步。', topic: '求助指引', theme: 'book', source: '国家卫生健康委新闻发布会' },
}
export function knowledgePresentation(title: string): Presentation {
  return entries[title] || { title, intro: '', topic: '健康阅读', theme: 'book', source: '官方资料' }
}
