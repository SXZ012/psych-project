/** 固定解释层字典（admin-web 与 terminal-web 共用；从 admin-web 迁移，内容逐字一致）。 */
export interface MetricDefinition {
  name: string
  plainMeaning: string
  aviationMeaning: string
  limitation: string
  recommendation: string
  direction: 'higher_load' | 'higher_better'
}

/** 固定解释层：不含任何个人分数、档位或阈值，个人事实只读合作方返回。 */
export const CORE_METRIC_DICTIONARY: Record<string, MetricDefinition> = {
  stress_load: {
    name: '压力/唤醒负荷',
    plainMeaning: '反映测评期间短时压力、紧张、兴奋和动作活跃共同形成的负荷状态。',
    aviationMeaning: '有助于观察时间压力、任务密度或突发情境下的即时激活程度。',
    limitation: '高值也可能来自兴奋、动作或采集干扰，不等同于焦虑症，也不能单独判断工作能力。',
    recommendation: '结合近期作息、睡眠和任务压力复核；持续偏离时建议在相近条件下复测。',
    direction: 'higher_load',
  },
  fatigue_recovery: {
    name: '疲劳/恢复负荷',
    plainMeaning: '反映疲劳、低活动及恢复不足等状态线索。',
    aviationMeaning: '疲劳可能影响持续注意、反应速度和任务处理稳定性，应结合近期作息与休息情况查看。',
    limitation: '一次短视频只能反映测评时段线索，不能代替睡眠记录和医学评估。',
    recommendation: '结合睡眠和近期工作节奏观察；结果持续偏离时建议休息后复测。',
    direction: 'higher_load',
  },
  physiological_arousal: {
    name: '生理唤醒线索',
    plainMeaning: '由心率、呼吸、面部活动和身体微小运动等数据形成的测试时段生理激活线索；较低通常表示当时较安静、放松。',
    aviationMeaning: '唤醒水平与日常警觉和状态调节有关，但本项只反映安静坐姿测试中的短时状态。',
    limitation: '本项是辅助线索，不参与风险关注计数；rPPG为视频估算且参考样本有限，不能据此判断异常或岗位能力。',
    recommendation: '结合信号质量解读；质量不足或结果波动较大时应改善采集条件后复测。',
    direction: 'higher_load',
  },
  attention_focus: {
    name: '视觉注意力',
    plainMeaning: '反映测评过程中视觉聚焦、注视稳定和离屏情况形成的注意线索。',
    aviationMeaning: '与持续关注、信息获取和注意稳定有关，是日常任务中的重要观察方向。',
    limitation: '普通摄像头结果属于眼动代理估计，不等同于经过校准的专业眼动仪。',
    recommendation: '结合眼动是否实际采集和数据质量查看；未采集时不得依据面部居中推断注意力。',
    direction: 'higher_better',
  },
}

export const SCREENING_DICTIONARY = {
  depression: {
    name: '抑郁方向筛查',
    plainMeaning: '用于发现与抑郁方向有关、需要进一步确认的状态线索。',
    aviationMeaning: '仅作为心理健康支持和后续复核的辅助信息，不用于自动作出岗位决定。',
    limitation: '筛查结果不是临床诊断；无量表时尤其需要结合访谈和实际情境。',
    recommendation: '以本次结果分类为准；需要关注时补充标准量表或专业访谈。',
    direction: 'higher_load',
  },
  anxiety: {
    name: '焦虑方向筛查',
    plainMeaning: '用于发现与焦虑、紧张方向有关、需要进一步确认的状态线索。',
    aviationMeaning: '可作为压力管理和心理支持的辅助观察，不直接代表工作胜任力。',
    limitation: '筛查结果不是临床诊断，不能写作“患有焦虑”。',
    recommendation: '以本次结果分类为准；需要关注时结合量表、访谈和近期压力事件复核。',
    direction: 'higher_load',
  },
} satisfies Record<string, MetricDefinition>
