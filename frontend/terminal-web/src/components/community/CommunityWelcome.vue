<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import qrcode from 'qrcode-generator'
import CommunityToolDialog from './CommunityToolDialog.vue'
import RelaxGame from './RelaxGame.vue'

const emit = defineEmits<{ start: []; 'entry-state': [atHome: boolean] }>()
type Section = 'home' | 'report' | 'relax' | 'self' | 'knowledge' | 'help'
const active = ref<Section>('home')
const selected = ref(0)
type SelfCategory = '综合状态' | '焦虑' | '抑郁' | '躯体感受' | '生活习惯' | '老年关怀'
type SelfScaleCard = { title: string; short: string; description: string; meta: string; category: SelfCategory; tone: string; kind: '快速筛查' | '完整筛查' | '专项筛查'; featured?: boolean }
const selfCategory = ref<SelfCategory>('综合状态')
const selfCategories: SelfCategory[] = ['综合状态', '焦虑', '抑郁', '躯体感受', '生活习惯', '老年关怀']
const showAllScales = ref(false)
const selfScales: SelfScaleCard[] = [
  { title:'PHQ-4 情绪筛查', short:'PHQ-4', description:'快速了解焦虑与抑郁两个方向', meta:'4 题 · 约 1 分钟 · 近两周', category:'综合状态', tone:'teal', kind:'快速筛查', featured:true },
  { title:'K6 心理困扰筛查', short:'K6', description:'了解整体心理困扰程度', meta:'6 题 · 约 1 分钟 · 近30天', category:'综合状态', tone:'teal', kind:'完整筛查' },
  { title:'GAD-2 焦虑快筛', short:'GAD-2', description:'两题快速了解焦虑方向', meta:'2 题 · 约 30 秒 · 近两周', category:'焦虑', tone:'blue', kind:'快速筛查' },
  { title:'GAD-7 焦虑筛查', short:'GAD-7', description:'完整了解焦虑症状频率', meta:'7 题 · 约 2 分钟 · 近两周', category:'焦虑', tone:'blue', kind:'完整筛查' },
  { title:'PHQ-2 抑郁快筛', short:'PHQ-2', description:'两题快速了解抑郁方向', meta:'2 题 · 约 30 秒 · 近两周', category:'抑郁', tone:'violet', kind:'快速筛查' },
  { title:'PHQ-9 抑郁筛查', short:'PHQ-9', description:'完整了解抑郁症状频率', meta:'9 题 · 约 2 分钟 · 近两周', category:'抑郁', tone:'violet', kind:'完整筛查' },
  { title:'PHQ-15 躯体筛查', short:'PHQ-15', description:'了解常见躯体困扰', meta:'15 题 · 约 3 分钟 · 近四周', category:'躯体感受', tone:'amber', kind:'专项筛查' },
  { title:'AUDIT-C 饮酒风险快筛', short:'AUDIT-C', description:'了解饮酒方式是否存在风险', meta:'3 题 · 约 1 分钟 · 近一年', category:'生活习惯', tone:'green', kind:'快速筛查' },
  { title:'GDS-15 老年情绪筛查', short:'GDS-15', description:'面向老年人了解近期情绪状态', meta:'15 题 · 约 3 分钟 · 近一周', category:'老年关怀', tone:'rose', kind:'专项筛查' },
]
type ResourceKind = 'science' | 'course' | 'service'
type OfficialResource = { kind: ResourceKind; title: string; source: string; meta: string; summary: string; url: string; image: string; points?: string[]; action?: string }
const resourceKind = ref<ResourceKind>('science')
const resourceIndex = ref(0)
const resourceQrOpen = ref(false)
const readingOpen = ref(false)
const heroImage = '/static/assets/community/ux/community-selfcare-illustration-v1.png?v=20260922-2'
const toolDialog = ref<{ kind: 'relax' | 'self' | 'appointment' | 'hotline'; index?: number } | null>(null)
const relaxGameOpen = ref(false)

/**
 * 官方内容索引：标题、来源和摘要均取自对应政府/国家平台公开页面。
 * 终端提供可直接阅读的整理内容；原始页面入口保留为补充查证渠道。
 */
const officialResources: OfficialResource[] = [
  { kind:'science', title:'心理健康素养十条', source:'国家卫生健康委发布 · 政府网站转载', meta:'心理健康基础知识', summary:'了解身心健康、运动、睡眠、主动求助和科学缓解压力等核心知识。', url:'https://www.yantai.gov.cn/art/2024/6/20/art_93485_3200966.html', image:'/static/assets/community/ux/38239121.jpg', points:['心理健康是整体健康的重要组成部分，身体和心理会相互影响。','适量运动有助于情绪健康；睡眠问题也值得重视。','出现心理困扰时主动求助，是负责任的健康行为。','焦虑、抑郁等问题可以防治，应科学认识并尽早评估。','缓解压力要采用运动、沟通、休息和专业支持等积极方法。'], action:'今天可以从规律作息、适量活动，或与可信任的人谈一谈开始。' },
  { kind:'science', title:'健康中国行动：心理健康促进行动', source:'国家卫生健康委员会', meta:'国家行动指南', summary:'掌握情绪与压力管理方法，培养规律作息和主动求助习惯。', url:'https://www.nhc.gov.cn/xcs/c100122/201907/d21c1320a6ea4175a9e7b954f363e5ab.shtml', image:'/static/assets/community/ux/28945280.jpg', points:['心理健康素养包括知识、重视心理健康的意识以及自我调适技能。','每个人一生中都可能遇到心理困扰，不必因此羞耻或自责。','保持规律睡眠、适量运动、兴趣爱好和稳定的人际联系，有助于维护心理健康。','持续的消极情绪若已影响工作、学习或生活，应及时寻求专业帮助。'], action:'把“能识别、会调节、愿求助”作为日常心理健康管理的三个步骤。' },
  { kind:'science', title:'正确认识焦虑与抑郁', source:'中国公民健康素养 · 国家卫生健康委员会', meta:'情绪与求助', summary:'区分短期情绪反应与需要专业评估的持续困扰。', url:'https://www.nhc.gov.cn/cms-search/downFiles/bab2c48185d24a4a8aa13ff85b66b402.pdf', image:'/static/assets/community/ux/33500208.jpg', points:['短期焦虑或低落是常见情绪反应，可通过休息、沟通和自我调适得到缓解。','如果情绪持续存在、逐渐加重，或明显影响睡眠、工作、学习与人际交往，需要进一步评估。','不要仅凭一次自测给自己下诊断，也不要因为病耻感延误求助。','规范评估和治疗应由精神科、心理科或精神卫生专业机构完成。'], action:'若出现伤害自己或他人的紧迫危险，请立即拨打 110、120，并让可信任的人陪同。' },
  { kind:'science', title:'睡眠健康核心信息', source:'全国爱卫办 · 国家卫生健康委员会', meta:'睡眠健康', summary:'了解良好睡眠的表现、规律作息和需要及时就医的情况。', url:'https://www.nhc.gov.cn/guihuaxxs/c100133/202503/70d5836afe804a858b899ee951a24a13.shtml', image:'/static/assets/community/ux/37443455.jpg', points:['成年人通常需要每天 7 至 8 小时睡眠，但个体之间存在差异。','睡醒后精神充沛、情绪稳定、注意力较好，是评价睡眠质量的重要表现。','保持相对固定的入睡和起床时间，营造安静、避光、温度适宜的睡眠环境。','睡前减少电子产品、酒精、浓茶咖啡和剧烈运动的影响。','长期睡不好或已经明显影响白天功能时，应及时就医，不要自行长期服用助眠药。'], action:'先连续一周记录上床、入睡、醒来和白天精神状况，再有针对性地调整。' },
  { kind:'science', title:'运动与心理健康', source:'中国公民健康素养 · 国家卫生健康委员会', meta:'健康生活方式', summary:'适量运动有助于释放压力、改善情绪并增强心理韧性。', url:'https://www.gov.cn/lianbo/bumen/202405/P020240530783730074981.pdf', image:'/static/assets/community/ux/28945280.jpg', points:['体育活动既维护身体健康，也能帮助调节情绪和释放压力。','选择适合自身健康状况、能够长期坚持的活动，比短期高强度运动更实用。','散步、骑行、慢跑、球类、舞蹈等都可以成为规律活动方式。','运动可以作为心理健康支持的一部分，但不能替代必要的专业诊疗。'], action:'从今天安排一次 10 至 20 分钟的舒适活动开始，循序渐进形成规律。' },
  { kind:'course', title:'心理健康传播与普及', source:'国家高等教育智慧教育平台 · 西南交通大学', meta:'在线课程', summary:'围绕心理健康科学传播、心理疏导方法和社会心理服务开展系统学习。', url:'https://higher.smartedu.cn/course/6883ff2e16c43a09c0000168', image:'/static/assets/community/ux/37443455.jpg' },
  { kind:'course', title:'大学生心理健康教育', source:'国家高等教育智慧教育平台 · 中国矿业大学', meta:'16 章在线课程', summary:'覆盖生命、生活和生涯教育，帮助学习者提升自助与主动求助能力。', url:'https://higher.smartedu.cn/course/69811c3195df98bb27c3c188', image:'/static/assets/community/ux/28945280.jpg' },
  { kind:'course', title:'老年护理学：心理卫生与精神护理', source:'国家高等教育智慧教育平台 · 福建医科大学', meta:'老年关怀课程', summary:'包含老年心理特点、常见心理问题、睡眠指导与心理卫生等学习章节。', url:'https://higher.smartedu.cn/course/64f11879374ed23bd755d6e9', image:'/static/assets/community/ux/38239121.jpg' },
  { kind:'course', title:'大学生心理健康', source:'国家高等教育智慧教育平台 · 福建师范大学', meta:'心理调适课程', summary:'涵盖情绪管理、人际交往、压力与挫折应对、生命教育和主动求助。', url:'https://higher.smartedu.cn/course/68d46915a9f4619f8f64c2ea', image:'/static/assets/community/ux/33500208.jpg' },
  { kind:'service', title:'全国统一心理援助热线 12356', source:'国家卫生健康委员会', meta:'心理援助服务', summary:'可拨打 12356 获取心理健康教育、心理咨询、心理疏导和心理危机干预等服务。', url:'https://www.nhc.gov.cn/yzygj/c100068/202412/49a1a65386cd4be582d4702fd0926ee8.shtml', image:'/static/assets/community/ux/37443455.jpg' },
  { kind:'service', title:'心理问题何时需要专业帮助', source:'国家卫生健康委新闻发布会', meta:'就医与求助指引', summary:'当心理困扰持续、明显影响生活或出现危险时，应及时联系专业人员、医疗机构或紧急服务。', url:'https://www.nhc.gov.cn/xcs/c100122/202501/5039a41e26d240b09c3f625f879961d5.shtml', image:'/static/assets/community/ux/33500208.jpg' },
]
type ReadingSection = { title: string; paragraphs: string[]; bullets?: string[] }
const scienceDetails: Record<string, ReadingSection[]> = {
  '心理健康素养十条': [
    { title:'心理健康不只是“没有心理疾病”', paragraphs:['心理健康是人在认知、情绪、行为和社会适应方面保持相对良好状态的能力。一个心理健康的人同样会紧张、难过或生气，区别在于能否识别这些感受、采取合适的调节方式，并在需要时获得支持。','身体和心理会相互影响。长期疼痛、睡眠不足或慢性疾病可能影响情绪；持续压力和焦虑也可能表现为心慌、胃口变化、头痛或疲劳。因此，维护健康时需要同时关注身体感受与心理状态。'] },
    { title:'日常维护心理健康的四个支点', paragraphs:['心理健康很少依赖某一种“速效方法”，更有效的是建立稳定、可持续的生活基础。规律睡眠、适量运动、可靠的人际联系和有节奏的工作休息，能够共同提升面对压力时的恢复能力。'], bullets:['尽量保持相对固定的入睡和起床时间。','选择能够长期坚持的运动，从散步、骑行或舒展开始。','保留与家人、朋友或同事真实交流的时间。','把大任务拆成小步骤，为每天安排短暂的恢复时间。'] },
    { title:'主动求助是一种健康能力', paragraphs:['当自我调节已经难以缓解困扰，主动求助能够减少问题持续和加重的风险。求助对象可以从可信任的亲友、社区工作人员开始，也可以直接联系心理咨询师、综合医院心理科或精神科。','专业人员会结合症状持续时间、严重程度、生活功能和身体情况进行综合判断。一次网络测试或终端自测只能提供线索，不能代替专业诊断。'] },
    { title:'常见误区', paragraphs:['心理困扰不是意志薄弱，也不是简单地“想开一点”就能解决。对心理疾病患者的责备、排斥和标签会增加求助阻力。药物治疗需要遵医嘱，不应自行加量、减量或停药。科学认识、理解陪伴和及时治疗，比隐瞒或硬扛更有帮助。'] },
  ],
  '健康中国行动：心理健康促进行动': [
    { title:'什么是心理健康素养', paragraphs:['心理健康素养包括三个部分：知道基本的心理健康知识，愿意重视和维护心理健康，以及掌握识别、调节和求助的基本技能。它并不要求每个人成为心理专家，而是帮助人在遇到困扰时知道下一步可以做什么。'] },
    { title:'学会观察自己的状态变化', paragraphs:['可以从情绪、睡眠、身体、思维和日常功能五个方面观察变化。偶尔紧张、低落或睡不好很常见；如果变化持续存在、越来越重，或者已经影响工作、学习、照顾家庭和正常交往，就需要给予更多关注。'], bullets:['情绪：低落、焦虑、易怒是否持续出现。','睡眠：是否长期难入睡、早醒或白天困倦。','身体：是否反复心慌、疲劳、胃口改变。','思维：是否难以集中注意，反复担忧或自责。','功能：是否明显回避工作、社交或日常责任。'] },
    { title:'建立个人的压力应对工具箱', paragraphs:['面对压力时，可以同时使用问题解决和情绪调节两类方法。能改变的问题，先梳理优先级、拆分步骤并寻求资源；暂时不能改变的部分，则通过规律作息、运动、呼吸放松、表达感受和获得社会支持降低消耗。','不建议长期依赖饮酒、熬夜、暴食、冲动消费或沉迷网络来回避压力，这些方式可能带来新的健康问题。'] },
    { title:'从自助走向专业支持', paragraphs:['如果自助方法效果有限，可以先咨询社区心理服务、学校或单位心理服务人员。症状较重、持续时间较长或伴有明显身体不适时，应到正规医疗机构接受评估。出现伤害自己或他人的想法、计划或行为时，应立即联系身边可信任的人，并拨打110、120或前往急诊。'] },
  ],
  '正确认识焦虑与抑郁': [
    { title:'情绪反应与心理障碍并不相同', paragraphs:['焦虑是面对不确定性、风险或重要任务时常见的警觉反应，适度焦虑有时能帮助人集中注意、提前准备。抑郁情绪通常表现为难过、失望或动力下降，也可能在遭遇挫折后短暂出现。','当焦虑或低落没有明确原因却反复发生，持续时间较长，并伴随明显痛苦或生活功能受损时，就需要考虑接受专业评估。是否属于心理障碍，不能只依据某一个症状或一次自测结果。'] },
    { title:'值得留意的持续表现', paragraphs:['焦虑方向可能出现难以控制的担忧、坐立不安、容易疲劳、注意力下降、肌肉紧张、心慌和睡眠问题。抑郁方向可能出现兴趣减少、持续低落、精力下降、食欲或睡眠改变、自我评价下降以及对未来悲观。'], bullets:['症状是否持续两周左右或更久。','是否在多数日子反复出现。','是否影响工作、学习、人际或自我照顾。','是否伴随强烈绝望、自伤或自杀想法。'] },
    { title:'可以先做什么', paragraphs:['记录情绪出现的时间、诱因、持续多久以及对生活的影响，有助于看清变化趋势。保持基本作息和饮食，减少酒精和过量咖啡因，安排适度活动，并把自己的真实感受告诉可信任的人。','这些方法可以提供支持，但如果困扰持续或已经明显影响生活，应尽快预约专业评估，不要因为害怕标签而拖延。'] },
    { title:'紧急情况如何处理', paragraphs:['如果已经出现明确的自伤、自杀或伤害他人的想法、计划、准备行为，应把安全放在第一位：不要独处，暂时移开可能造成伤害的物品，请可信任的人陪同，立即拨打110、120或前往最近的急诊。也可拨打全国统一心理援助热线12356获得支持。'] },
  ],
  '睡眠健康核心信息': [
    { title:'怎样理解“睡得好”', paragraphs:['睡眠时长是重要参考，但不是唯一标准。成年人通常需要每天7至8小时睡眠，个体之间会有差异。醒来后是否精神恢复、白天能否保持清醒和注意力、情绪是否相对稳定，同样是判断睡眠质量的重要依据。','偶尔一晚没睡好不必过度紧张。对睡眠过分监测和担忧，反而可能增加入睡压力。更适合观察一到两周的整体规律，而不是只看某一晚。'] },
    { title:'建立有利于睡眠的日常节律', paragraphs:['稳定的起床时间有助于维持生物节律。白天接受适量自然光并进行活动，晚上逐渐降低环境亮度和兴奋程度，可以帮助身体形成明确的昼夜信号。'], bullets:['每天尽量在接近的时间起床，包括周末。','睡前减少手机、平板和持续刺激的信息。','下午或晚上减少浓茶、咖啡和能量饮料。','避免把饮酒当作助眠方式。','卧室保持安静、避光、温度适宜。'] },
    { title:'睡不着时怎么办', paragraphs:['如果躺下较长时间仍很清醒，可以暂时离开床，到光线较暗的地方做安静、单调的活动，出现困意后再回到床上。不要反复查看时间，也不必强迫自己立刻入睡。','白天长时间补觉可能进一步打乱节律。午休可根据个人情况安排，但不宜过晚或过长。规律运动有助于睡眠，但临睡前应避免高强度活动。'] },
    { title:'什么时候需要就医', paragraphs:['经常入睡困难、夜间反复醒来、白天无法保持清醒、鼾声响亮并伴随呼吸暂停，或睡眠问题已经明显影响健康与工作生活时，应到医疗机构接受评估。不同睡眠障碍的原因和处理方式不同，不建议自行长期服用安眠药。'] },
  ],
  '运动与心理健康': [
    { title:'运动为什么能支持心理健康', paragraphs:['规律活动可以帮助释放压力、改善情绪，并为生活提供节奏感和可完成的目标。运动时对呼吸、动作和身体感受的关注，也能让注意力暂时从反复担忧中转移出来。','运动不是越累越好。能够根据身体状况循序渐进、长期坚持，比偶尔进行一次高强度训练更有价值。'] },
    { title:'选择适合自己的活动', paragraphs:['散步、慢跑、骑行、游泳、舞蹈、球类、太极和简单力量训练都可以成为日常活动。对于长期久坐的人，可以先从每次10至20分钟开始，再逐渐增加频率和时间。'], bullets:['选择自己相对喜欢、场地容易获得的活动。','把运动安排到日程中，而不是等待“有空再做”。','与家人朋友一起活动，增加坚持的可能。','运动后关注精神、睡眠和身体恢复，而不只看消耗。'] },
    { title:'安全和边界', paragraphs:['开始运动前应考虑年龄、既往疾病、疼痛和体能状况。运动过程中出现胸痛、明显呼吸困难、眩晕或其他不适时应立即停止，必要时就医。','运动能够支持心理健康，但不能替代对焦虑症、抑郁症或其他精神心理问题的专业评估与治疗。已经接受治疗的人，应根据医生建议安排运动。'] },
    { title:'一个容易执行的开始', paragraphs:['今天选择一种舒适活动进行10分钟，结束后记录心情和身体感受。连续一周在相对固定的时间完成，再根据恢复情况逐步延长。目标是建立稳定习惯，而不是一次达到很高强度。'] },
  ],
  '心理健康传播与普及': [
    { title:'这门课程主要学习什么', paragraphs:['课程围绕心理健康教育的基本原理、常见心理困扰、心理调适方法和社会心理服务展开，帮助学习者形成科学、理性、无污名的心理健康观。它既讨论个人如何认识自己、管理情绪，也关注如何向他人传播准确的心理健康知识。'], bullets:['心理健康的基本概念与判断边界。','自我认知、情绪管理和压力应对。','人际沟通、学习适应和网络使用。','心理咨询、心理测评与心理健康服务的基本原则。'] },
    { title:'适合哪些人学习', paragraphs:['适合希望系统了解心理健康知识的普通公众、社区工作人员、教育工作者和服务志愿者。课程并不等同于临床培训，完成学习后不能据此为他人诊断或治疗，但可以提升识别问题、正确沟通和合理转介的能力。'] },
    { title:'怎样把知识用到生活中', paragraphs:['学习时可以结合真实生活记录：遇到压力时自己有哪些身体和情绪反应，通常采用什么方式应对，哪些方法有效，哪些方法只带来短暂逃避。把抽象概念对应到具体场景，更容易形成可持续的调适能力。','与他人讨论心理健康时，应尊重隐私，避免随意贴标签，也不要把个人经验当作适用于所有人的结论。'] },
    { title:'学习边界与进一步支持', paragraphs:['在线课程适合知识普及，不能替代个人化评估。如果自己或他人已经出现持续痛苦、明显功能受损、自伤或伤人风险，应及时联系正规心理或精神卫生专业服务。'] },
  ],
  '大学生心理健康教育': [
    { title:'课程覆盖的成长主题', paragraphs:['课程从生命、生活和生涯三个方向讨论大学阶段常见的适应任务，包括认识自我、情绪调节、学习管理、人际交往、亲密关系、压力与挫折、生涯规划和生命教育。重点是提升自助能力，也帮助学习者知道何时应主动求助。'] },
    { title:'大学阶段常见的心理挑战', paragraphs:['进入新的学习和生活环境后，角色变化、学业要求、人际关系、经济压力和职业选择可能同时出现。短期的不适应并不罕见，但如果长期回避、睡眠紊乱、情绪持续低落或焦虑，并明显影响上课、社交和生活，就需要认真对待。'], bullets:['建立相对稳定的作息和学习节奏。','把目标拆分为可完成的小任务。','主动建立同伴、教师和家庭支持。','了解学校心理中心和医疗服务入口。'] },
    { title:'如何提高学习效果', paragraphs:['建议按主题学习后完成一次自我反思，例如记录本周主要压力源、自动出现的想法、情绪强度和实际采取的行动。通过反复练习识别和调整，而不是只记忆概念，才能把课程内容转化为实际能力。'] },
    { title:'遇到危机时怎么办', paragraphs:['当出现强烈绝望、自伤或自杀想法时，不要独自承受，也不要只依赖网络课程。应立即告诉可信任的同学、老师或家人，联系学校心理中心、12356心理援助热线，存在紧迫危险时拨打110、120或前往急诊。'] },
  ],
  '老年护理学：心理卫生与精神护理': [
    { title:'理解老年期心理变化', paragraphs:['退休、身体功能变化、慢性疾病、丧亲和社会联系减少，都可能影响老年人的情绪与生活适应。正常老化不等于必然抑郁、失眠或认知障碍，对明显变化应当观察和评估，而不是简单归因于“年纪大了”。'] },
    { title:'值得家人留意的信号', paragraphs:['持续兴趣下降、反复诉说无价值感、明显食欲或睡眠变化、拒绝社交、记忆和行为突然改变，都值得进一步关注。老年人的心理困扰有时更多表现为身体不适、疼痛或反复就医，沟通时应耐心倾听。'], bullets:['观察变化出现的时间和发展速度。','记录药物、睡眠、饮食和日常功能变化。','避免指责、争辩或强迫其“想开”。','及时联系全科、老年医学、心理科或精神科。'] },
    { title:'日常支持可以怎么做', paragraphs:['保持规律生活、适量活动、力所能及的家庭角色和稳定社会联系，有助于维护身心功能。家人可以提供陪伴和选择，而不是完全替代老年人做决定。对存在跌倒风险、认知下降或用药问题的人，还应加强环境与用药安全。'] },
    { title:'照护者也需要支持', paragraphs:['长期照护可能带来疲劳、焦虑和内疚。照护者需要安排休息、分担任务并获得社区或医疗资源支持。只有照护者得到基本恢复，才能提供更稳定的照护。'] },
  ],
  '大学生心理健康': [
    { title:'从认识自己开始', paragraphs:['自我认知包括了解自己的优势、限制、价值观、情绪规律和应对方式。客观看待自己并不等于否定不足，而是在现实基础上确定可以改变的部分，并接纳暂时无法改变的部分。'] },
    { title:'情绪、压力与挫折应对', paragraphs:['情绪本身没有好坏之分，它提示我们正在经历什么。有效调节不是压住所有负面情绪，而是先识别和命名感受，再选择表达、解决问题、暂时休息或寻求支持。面对挫折时，把一次结果与对自我整体价值的评价分开，有助于恢复行动。'], bullets:['用具体词语描述感受，而不是只说“很烦”。','区分事实、猜测和对自己的评价。','先完成一个最小可行步骤。','持续受困时主动使用学校和医疗资源。'] },
    { title:'建设健康的人际关系', paragraphs:['良好关系需要表达、倾听、边界和协商。既要尊重他人，也要允许自己拒绝不合理要求。冲突并不一定意味着关系失败，关键在于能否围绕具体事情沟通，而不是攻击人格或长期回避。'] },
    { title:'把求助当作成长能力', paragraphs:['心理咨询提供的是专业、保密和有边界的支持。主动预约咨询不代表问题严重，也不代表个人软弱。若症状持续、生活功能明显下降或出现安全风险，应进一步接受医疗评估。'] },
  ],
  '全国统一心理援助热线 12356': [
    { title:'12356可以提供什么', paragraphs:['12356是全国统一心理援助热线号码，用于向公众提供心理健康教育、心理咨询、心理疏导和心理危机干预等服务。接听人员会了解来电者当前困扰和安全状况，并根据需要提供支持或转介建议。具体接听安排以当地服务为准。'] },
    { title:'哪些时候可以拨打', paragraphs:['当你感到情绪难以承受、不知道向谁倾诉，或身边的人出现明显心理危机时，都可以尝试拨打。无需等到问题非常严重才求助。热线也可以帮助了解当地有哪些心理咨询或精神卫生服务。'], bullets:['持续焦虑、低落、失眠或强烈压力。','经历突发事件、丧失或关系危机。','出现自伤、自杀或伤人想法。','担心亲友的情绪和安全，但不知道如何处理。'] },
    { title:'拨打前可以准备什么', paragraphs:['尽量到相对安静、安全的位置，简单说明自己在哪里、发生了什么、目前最难承受的部分，以及是否存在立即伤害自己或他人的危险。即使一时说不清楚，也可以直接告诉接线人员“我现在很难受，需要有人帮助”。'] },
    { title:'热线与急救的区别', paragraphs:['心理援助热线提供远程支持，但不能替代现场急救。若已经实施伤害、持有明确计划或工具，或无法保证当前安全，应立即拨打110、120，前往最近急诊，并请可信任的人陪同，不要独处。'] },
  ],
  '心理问题何时需要专业帮助': [
    { title:'判断是否需要帮助的四个维度', paragraphs:['可以从持续时间、痛苦程度、生活功能和安全风险四个方面判断。短暂波动可以先观察和自助；如果症状持续数周、逐渐加重，已经影响工作学习、人际交往或自我照顾，就更需要专业支持。'] },
    { title:'可以选择哪些服务', paragraphs:['轻中度困扰可以从社区心理服务、学校或单位心理咨询开始。需要疾病评估、药物治疗，或伴有明显躯体症状和功能受损时，应选择综合医院心理科、精神科或精神专科医院。紧急风险应直接联系急救和公安。'], bullets:['心理咨询：帮助理解困扰、改善应对和关系模式。','心理治疗：由受过专业训练的人员实施结构化干预。','精神科评估：判断症状、风险和是否需要医学治疗。','社区支持：提供信息、随访、转介和社会资源连接。'] },
    { title:'第一次求助可以怎么说', paragraphs:['不需要提前准备专业术语。可以说明“从什么时候开始”“最困扰的症状是什么”“睡眠、饮食和工作生活受到什么影响”“自己尝试过哪些方法”“是否有伤害自己或他人的想法”。如正在服药，也应携带药物名称和使用情况。'] },
    { title:'如果当事人拒绝求助', paragraphs:['先表达关心并倾听，不争辩、不指责，也不要承诺替对方保守涉及生命安全的秘密。可以陪同预约、提供交通或一起拨打热线。存在明确危险时，应优先保障安全并联系110、120或医疗机构。'] },
  ],
}

const content = {
  relax: { title:'情绪放松', intro:'从一段短练习开始，让身体和注意力慢慢安静下来。', items:[['1分钟平稳呼吸','适合暂时紧张或需要安静时','1 分钟'],['自然风声','用自然风声短暂休息','3 分钟'],['肩颈舒展','缓解久坐带来的紧绷感','2 分钟']] },
  self: { title:'心理自测', intro:'使用公开的标准筛查量表了解近期状态，结果不等于诊断。', items:[['PHQ-4 情绪筛查','快速了解焦虑与抑郁方向','4 题'],['GAD-7 焦虑筛查','了解过去两周焦虑症状频率','7 题'],['PHQ-9 抑郁筛查','了解过去两周抑郁症状频率','9 题'],['GAD-2 焦虑快筛','两题快速筛查焦虑方向','2 题'],['PHQ-2 抑郁快筛','两题快速筛查抑郁方向','2 题'],['PHQ-15 躯体筛查','了解近四周常见躯体困扰','15 题']] },
  knowledge: { title:'官方科普与课程', intro:'精选官方健康知识、学习课程与求助指引，可直接阅读。', items:[['心理健康素养','国家卫生健康系统公开内容','官方科普'],['心理健康课程','国家智慧教育平台课程','在线学习'],['求助与服务','全国统一心理援助服务信息','官方指南']] },
  help: { title:'寻求帮助', intro:'选择社区咨询预约，或查看全国统一心理援助热线。', items:[['社区咨询预约','登记服务意向和方便时间','进入预约'],['心理援助热线','全国统一心理援助服务','12356']] },
} as const

const current = computed(() => active.value === 'relax' || active.value === 'self' || active.value === 'knowledge' || active.value === 'help' ? content[active.value] : null)
const visibleResources = computed(() => officialResources.filter(item => item.kind === resourceKind.value))
const visibleSelfScales = computed(() => selfScales.map((scale, index) => ({ ...scale, index })).filter(scale => scale.category === selfCategory.value))
const currentResource = computed<OfficialResource>(() => visibleResources.value[resourceIndex.value] || visibleResources.value[0] || officialResources[0]!)
const currentDetails = computed(() => scienceDetails[currentResource.value.title] || [])
const resourceQrSvg = computed(() => {
  if (!resourceQrOpen.value || !currentResource.value) return ''
  try {
    const qr = qrcode(0, 'M'); qr.addData(currentResource.value.url); qr.make()
    const count = qr.getModuleCount(); let path = ''
    for (let row=0; row<count; row+=1) for (let col=0; col<count; col+=1) if (qr.isDark(row,col)) path += `M${col} ${row}h1v1h-1z`
    return `<svg viewBox="-2 -2 ${count+4} ${count+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${count+4}" height="${count+4}" fill="#fff"/><path d="${path}" fill="#263c35"/></svg>`
  } catch { return '' }
})
const relaxActivities = [
  { title:'平稳呼吸', detail:'跟着舒适的节奏，慢慢放松下来', duration:'1 分钟', cue:'吸气 4 秒 · 呼气 6 秒', image:'/static/assets/community/ux/38239121.jpg', tone:'breath' },
  { title:'自然风声', detail:'听一会儿轻柔风声，让注意力休息', duration:'3 分钟', cue:'轻柔风声 · 可调节音量', image:'/static/assets/community/ux/37443455.jpg', tone:'sound' },
  { title:'肩颈舒展', detail:'用几个轻缓动作松开久坐后的紧绷', duration:'2 分钟', cue:'4 个舒缓步骤 · 可随时暂停', image:'/static/assets/community/ux/28945280.jpg', tone:'stretch' },
]
/** 推荐位固定为 1 分钟的平稳呼吸：进入放松板块后不需要先做选择。 */
const relaxHero = relaxActivities[0]!
const relaxSideItems = relaxActivities.slice(1).map((item, index) => ({ ...item, index: index + 1 }))

/** 问候语跟随终端当前时间变化，常来的居民会感觉被回应。 */
const greeting = computed(() => {
  const hour = new Date().getHours()
  const part = hour < 6 ? '夜深了' : hour < 11 ? '上午好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
  return `${part}，今天也照顾一下自己`
})
const headerSubtitle = computed(() => {
  if (active.value === 'home') return '选择一项服务开始体验'
  if (active.value === 'report') return '查询、查看或下载个人测评报告'
  if (active.value === 'relax') return greeting.value
  return current.value?.intro || ''
})

function openRelax(index: number) {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  selected.value = index
  toolDialog.value = { kind: 'relax', index }
}

watch(active, section => emit('entry-state', section === 'home'), { immediate: true })
watch(resourceKind, () => { resourceIndex.value = 0 })
function go(section: Section) { selected.value = 0; selfCategory.value = '综合状态'; showAllScales.value = false; active.value = section }
function openReports() { window.location.assign('/community/reports?terminal=1') }
function showOfficialSource() { readingOpen.value = false; resourceQrOpen.value = true }
function openResource(index: number) { resourceIndex.value = index; readingOpen.value = true }
</script>

<template>
  <main class="hub" :class="[{ 'hub--feature': active !== 'home' }, `hub--${active}`]">
    <section v-if="active === 'knowledge' && readingOpen" class="immersive-reader">
      <header><button @click="readingOpen=false">← 返回内容列表</button><div><span>{{ currentResource.meta }}</span><h1>{{ currentResource.title }}</h1></div><button class="reader-source-button" @click="showOfficialSource">查看官方原文</button></header>
      <div class="reader-layout"><aside><b>本篇导读</b><a href="#overview">内容简介</a><a href="#points">阅读重点</a><a v-for="(section,index) in currentDetails" :key="section.title" :href="`#detail-${index}`">{{ section.title }}</a><a v-if="currentResource.action" href="#action">行动建议</a></aside><article><section id="overview" class="reader-hero" :style="{ '--reader-image': `url(${currentResource.image})` }"><div><span>{{ currentResource.source }} · {{ currentResource.meta }}</span><h2>{{ currentResource.title }}</h2><p>{{ currentResource.summary }}</p></div></section><section id="points" class="reader-section"><span>阅读提示</span><h2>先看重点，再了解具体方法</h2><div class="reader-points"><p v-for="(point,index) in currentResource.points || [currentResource.summary]" :key="point"><i>{{ index+1 }}</i>{{ point }}</p></div></section><section v-for="(section,index) in currentDetails" :id="`detail-${index}`" :key="section.title" class="reader-section reader-prose"><span>{{ String(index+1).padStart(2,'0') }} · 专题内容</span><h2>{{ section.title }}</h2><p v-for="paragraph in section.paragraphs" :key="paragraph">{{ paragraph }}</p><ul v-if="section.bullets"><li v-for="bullet in section.bullets" :key="bullet">{{ bullet }}</li></ul></section><section v-if="currentResource.action" id="action" class="reader-section"><span>行动清单</span><h2>今天可以怎么做</h2><div class="reader-action">{{ currentResource.action }}</div></section><footer>本文依据公开的官方健康资料整理，用于健康教育，不替代专业诊疗。</footer></article></div>
    </section>
    <section v-else class="hub-main">
      <header class="hub-top"><button v-if="active !== 'home'" class="feature-back" @click="go('home')">← 返回服务首页</button><div><h1>{{ active === 'home' ? '今天，也关心一下自己的状态' : active === 'report' ? '我的报告' : current?.title }}</h1><p>{{ headerSubtitle }}</p></div><span class="hub-status"><i />设备服务正常</span></header>

      <div v-if="active === 'home'" class="home-grid">
        <article class="primary-card card-green"><div class="primary-copy"><span class="tag">核心服务</span><h2>心理状态辅助测评</h2><p>通过约 60 秒非接触采集，辅助了解近期心理状态。</p><ul><li>全程约 4 分钟</li><li>无需佩戴设备</li><li>手机查看 PDF 报告</li></ul></div><button @click="emit('start')">开始测评</button><div class="hero-art"><span /><img :src="heroImage" alt="" /></div></article>
        <article class="report-card card-blue"><span class="tag">个人报告</span><h2>查看我的报告</h2><p>使用手机身份或报告编号，查看结果并下载 PDF。</p><div class="report-preview"><i /><i /><i /><span><b /><b /><b /></span></div><button @click="openReports">查看报告 <b>→</b></button></article>

        <section class="tools"><header><h2>日常心理工具</h2><span>按需要选择</span></header><div class="tool-row">
          <button class="tool-card peach" @click="go('relax')"><i>◌</i><span><b>情绪放松</b><small>呼吸 · 自然声音</small></span><em>→</em></button>
          <button class="tool-card violet" @click="go('self')"><i>✓</i><span><b>心理自测</b><small>PHQ-4 · GAD-7 · PHQ-9 等标准量表</small></span><em>→</em></button>
          <button class="tool-card yellow" @click="go('knowledge')"><i>◇</i><span><b>官方科普</b><small>科普文章 · 国家平台课程</small></span><em>→</em></button>
        </div></section>
        <button class="help-strip" @click="go('help')"><span><b>社区心理服务与求助</b><small>查看咨询预约、12356 心理援助和紧急求助指引</small></span><em>查看支持方式 →</em></button>
      </div>

      <div v-else-if="active === 'report'" class="section-layout">
        <article class="feature-card report-feature"><span>个人报告</span><h2>查看测评结果与 PDF</h2><p>报告通常在测评结束后 3 至 4 分钟生成。请妥善保管报告编号和访问链接。</p><button @click="openReports">进入报告中心</button></article><aside class="info-card"><h3>可以查看</h3><p>结果总览与情绪状态参考</p><p>核心指标与生活建议</p><p>可保存的个人 PDF 报告</p></aside>
      </div>

      <div v-else-if="active === 'relax'" class="relax-page">
        <div class="relax-cards">
          <button class="relax-hero" @click="openRelax(0)">
            <span class="relax-hero__tag">今日推荐</span>
            <span class="relax-hero__ring" aria-hidden="true"><i /><i /><i /><b /></span>
            <b class="relax-hero__title">{{ relaxHero.title }}</b>
            <small class="relax-hero__desc">跟着节奏，{{ relaxHero.cue }}</small>
            <em class="relax-hero__cta">开始练习 · {{ relaxHero.duration }}</em>
          </button>
          <div class="relax-side">
            <button v-for="item in relaxSideItems" :key="item.title" class="relax-side-card" :class="`relax-side-card--${item.tone}`" @click="openRelax(item.index)">
              <span class="relax-side-card__icon" aria-hidden="true">
                <svg v-if="item.tone === 'sound'" viewBox="0 0 36 36" width="36" height="36" fill="none"><path d="M8 15v6M14 10v16M20 6v24M26 10v16M32 15v6" stroke="#47809F" stroke-width="2.5" stroke-linecap="round" /></svg>
                <svg v-else viewBox="0 0 36 36" width="36" height="36" fill="none"><path d="M18 7v22M18 7l-5.5 5.5M18 7l5.5 5.5M18 29l-5.5-5.5M18 29l5.5-5.5" stroke="#C08F3E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </span>
              <span class="relax-side-card__copy"><b>{{ item.title }}</b><small>{{ item.detail }} · {{ item.duration }}</small></span>
              <span class="relax-side-card__play" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="20" height="20"><path d="M7 4.5l9 5.5-9 5.5z" :fill="item.tone === 'sound' ? '#47809F' : '#C08F3E'" /></svg>
              </span>
            </button>
            <button class="relax-side-card relax-side-card--game" @click="relaxGameOpen=true">
              <span class="relax-side-card__icon relax-game-card__icon" aria-hidden="true">🍊</span>
              <span class="relax-side-card__copy"><b>轻挥果园</b><small>轻轻划过水果，收集一点轻松</small></span>
              <span class="relax-side-card__play" aria-hidden="true"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M7 4.5l9 5.5-9 5.5z" fill="#b87b42" /></svg></span>
            </button>
          </div>
        </div>
      </div>

      <div v-else-if="active === 'self'" class="self-page">
        <article class="self-recommend-bar"><div><span>推荐</span><h2>PHQ-4 情绪快速筛查</h2></div><p>同时了解焦虑与抑郁方向</p><div class="recommend-pills"><b>4题</b><b>约1分钟</b></div><button @click="toolDialog={kind:'self',index:0}">开始　→</button></article>
        <section class="self-library">
          <header><div><h3>你想了解哪一方面？</h3><p>选择方向后，再选择快速筛查或完整筛查</p></div><button class="all-scales-link" @click="showAllScales=true">查看全部 {{ selfScales.length }} 份量表</button></header>
          <nav class="self-filters"><button v-for="category in selfCategories" :key="category" :class="{active:selfCategory===category}" @click="selfCategory=category">{{ category }}</button></nav>
          <div class="self-category-title"><span>{{ selfCategory }}</span><p>{{ selfCategory==='综合状态'?'适合第一次了解整体状态':selfCategory==='焦虑'||selfCategory==='抑郁'?'可先快筛，再按需要完成完整版':'按近期真实感受完成专项筛查' }}</p></div>
          <div class="self-cards"><article v-for="scale in visibleSelfScales" :key="scale.short" :class="['self-card',`self-card--${scale.tone}`]"><div class="scale-copy"><h3>{{ scale.title }}</h3><p>{{ scale.description }}</p><small>{{ scale.meta.split(' · ').slice(0,2).join(' · ') }}</small></div><button @click="selected=scale.index; toolDialog={kind:'self',index:scale.index}">开始测评　→</button></article></div>
        </section>
        <div v-if="showAllScales" class="scale-catalog" @click.self="showAllScales=false"><section><header><div><span>量表目录</span><h2>全部 {{ selfScales.length }} 份心理自测</h2></div><button @click="showAllScales=false">×</button></header><div><button v-for="(scale,index) in selfScales" :key="scale.short" :class="`catalog-card catalog-card--${scale.tone}`" @click="showAllScales=false; selected=index; toolDialog={kind:'self',index}"><div><b>{{ scale.title }}</b><p>{{ scale.description }}</p><small>{{ scale.category }} · {{ scale.meta }}</small></div><em>开始测评　→</em></button></div><footer>所有结果仅作为状态筛查线索，不构成医学诊断。</footer></section></div>
      </div>

      <div v-else-if="active === 'knowledge'" class="knowledge-page">
        <nav class="kind-switch" aria-label="内容分类"><button :class="{active:resourceKind==='science'}" @click="resourceKind='science'"><i>知</i><span><b>健康科普</b><small>{{ officialResources.filter(item=>item.kind==='science').length }} 篇</small></span></button><button :class="{active:resourceKind==='course'}" @click="resourceKind='course'"><i>学</i><span><b>在线课程</b><small>{{ officialResources.filter(item=>item.kind==='course').length }} 门</small></span></button><button :class="{active:resourceKind==='service'}" @click="resourceKind='service'"><i>助</i><span><b>求助指南</b><small>{{ officialResources.filter(item=>item.kind==='service').length }} 项</small></span></button></nav>
        <section class="knowledge-library" :aria-label="`${current?.title}内容列表`"><article v-for="(item,index) in visibleResources" :key="item.url" class="resource-card"><div class="resource-card__visual" :style="{ '--resource-image': `url(${item.image})` }" /><div class="resource-card__body"><small>{{ item.source }}</small><h3>{{ item.title }}</h3><p>{{ item.summary }}</p><div class="resource-card__actions"><button class="resource-read" @click="openResource(index)">阅读内容 <b>→</b></button><button class="resource-original" @click="resourceIndex=index; showOfficialSource()">官方原文</button></div></div></article></section>
      </div>

      <div v-else-if="active === 'help'" class="help-page">
        <section class="support-simple"><div class="support-actions"><button class="support-action support-action--appointment" @click="toolDialog={kind:'appointment'}"><i>约</i><span><b>社区咨询预约</b><small>登记服务意向和方便时间</small></span><em>进入预约 →</em></button><button class="support-action support-action--hotline" @click="toolDialog={kind:'hotline'}"><i>电</i><span><b>心理援助热线</b><small>全国统一心理援助服务</small></span><strong>12356</strong><em>查看热线 →</em></button></div></section>
      </div>
      <div v-if="resourceQrOpen" class="resource-modal" @click.self="resourceQrOpen=false"><section><button class="resource-close" @click="resourceQrOpen=false">×</button><div class="resource-qr" v-html="resourceQrSvg" /><h2>{{ currentResource.title }}</h2><p>使用手机扫码，在官方页面查看完整内容</p><small>{{ currentResource.source }}</small></section></div>
      <CommunityToolDialog v-if="toolDialog" :kind="toolDialog.kind" :index="toolDialog.index" @close="toolDialog=null" />
      <RelaxGame v-if="relaxGameOpen" @close="relaxGameOpen=false" />
    </section>
  </main>
</template>

<style scoped>
.hub{width:100%;height:100%;display:grid;grid-template-columns:1fr;overflow:hidden}
.hub-main{min-width:0;display:grid;grid-template-rows:82px 1fr;padding:0 28px 20px}
.hub-top{display:flex;align-items:center;justify-content:space-between}
.hub-top h1{margin:0;color:#253e36}
.hub-top p{margin:4px 0 0}
.hub-status{display:flex;align-items:center;gap:7px}
.hub-status i{width:8px;height:8px;border-radius:50%;background:#56a477}
.home-grid{min-height:0;display:grid;grid-template-columns:1.7fr .9fr;grid-template-rows:minmax(190px,1.4fr) minmax(130px,.8fr) 76px}
.primary-card{position:relative;overflow:hidden}
.report-card{position:relative;overflow:hidden}
.feature-card{position:relative;overflow:hidden;border-radius:20px}
.info-card{position:relative;overflow:hidden;border-radius:20px;padding:24px}
.card-green{background:linear-gradient(125deg,#d9ebe1 0%,#e8f2ec 68%,#f3e4d8 100%)}
.card-blue{background:linear-gradient(140deg,#d9e8f2,#e9f0f5)}
.tag{display:inline-block;color:#527168;font-weight:750}
.primary-copy{position:relative;z-index:2;max-width:68%}
.primary-card h2{margin:12px 0 6px}
.report-card h2{margin:12px 0 6px}
.primary-card p{margin:0;color:#587068}
.report-card p{margin:0;color:#587068}
.primary-card ul{display:flex;gap:18px;margin:13px 0 17px;padding:0;list-style:none;color:#49665d}
.primary-card li::before{content:'✓';margin-right:5px;color:#36745f}
.primary-card button{position:absolute;z-index:3;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:56px;min-height:56px;margin:0;padding:0 20px;border:0;color:#fff;font-weight:750;line-height:1}
.report-card button{position:absolute;z-index:3;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:56px;min-height:56px;margin:0;padding:0 20px;border:0;color:#fff;font-weight:750;line-height:1}
.primary-card button{background:#397866}
.feature-card button{min-height:48px;padding:0 24px;border:0;border-radius:12px;color:#fff;font-size:15px;font-weight:750}
.hero-art{position:absolute;z-index:1;display:grid;place-items:center}
.hero-art>span{position:absolute;border-radius:62% 38% 44% 56% / 47% 55% 45% 53%;background:rgba(255,255,255,.6);transform:rotate(-5deg)}
.hero-art img{position:relative;filter:drop-shadow(0 12px 18px rgba(48,89,75,.12))}
.report-preview{position:absolute;right:-22px;bottom:9px;width:132px;height:138px;transform:rotate(5deg)}
.report-preview>i{position:absolute;width:84px;height:108px;border-radius:11px;background:rgba(255,255,255,.58);box-shadow:0 8px 18px rgba(63,94,114,.1)}
.report-preview>i:nth-child(1){right:26px;top:12px;transform:rotate(-11deg)}
.report-preview>i:nth-child(2){right:13px;top:15px;transform:rotate(-2deg)}
.report-preview>i:nth-child(3){right:0;top:20px;background:#fff}
.report-preview>span{position:absolute;z-index:2;right:12px;top:45px;width:60px;display:grid;gap:8px}
.report-preview b{height:5px;border-radius:9px;background:#86a9bf}
.report-preview b:nth-child(1){width:74%;background:#65a087}
.report-preview b:nth-child(2){width:100%}
.report-preview b:nth-child(3){width:58%;background:#e0b477}
.report-card h2{position:relative;z-index:2;max-width:74%}
.report-card p{position:relative;z-index:2;max-width:74%}
.report-card button{background:#547e9d}
.report-card button b{margin-left:14px}
.tools{grid-column:1/-1;display:grid;grid-template-rows:auto 1fr;min-height:0}
.tools header{display:flex;align-items:center;justify-content:space-between}
.tools h2{margin:0}
.tools header span{color:#81908a}
.tool-row{min-height:0;display:grid;grid-template-columns:repeat(3,1fr)}
.tool-card{position:relative;overflow:hidden;display:flex;align-items:center;gap:16px;height:100%;color:#344b44;text-align:left}
.tool-card::after{content:'';position:absolute;right:-27px;top:-34px;width:112px;height:112px;border-radius:42% 58% 66% 34% / 50% 44% 56% 50%;background:rgba(255,255,255,.32)}
.tool-card>i{position:relative;z-index:1}
.tool-card span{position:relative;z-index:1}
.tool-card em{position:relative;z-index:1}
.tool-card>i{display:grid;place-items:center;font-style:normal}
.tool-card span{flex:1}
.tool-card b{display:block}
.tool-card small{display:block}
.tool-card small{margin-top:5px;color:#6f7b77}
.tool-card em{font-style:normal}
.help-strip{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding:0 292px 0 28px;color:#344b44;text-align:left}
.help-strip b{display:block}
.help-strip small{display:block}
.help-strip small{margin-top:3px;color:#667a71}
.help-strip em{white-space:nowrap;color:#397866;font-style:normal;font-weight:750}
.section-layout{min-height:0;display:grid;grid-template-columns:1.45fr .8fr;gap:16px;align-content:center}
.feature-card{padding:38px;min-height:310px;background:#dce9f3}
.feature-card>span{color:#557b96;font-size:12px;font-weight:700}
.feature-card h2{margin:16px 0 10px;font-size:29px}
.feature-card p{max-width:560px;color:#5a6f78;line-height:1.8}
.feature-card button{background:#547e9d;margin-top:30px}
.info-card{background:#fff}
.info-card h3{font-size:18px}
.info-card p{padding:12px 0;margin:0;border-bottom:1px solid #e6ece9;color:#596c65}
@media (max-width:1050px),(max-height:650px){
  .hub{grid-template-columns:1fr}
  .hub-main{grid-template-rows:66px 1fr;padding:0 18px 12px}
  .hub-top h1{font-size:21px}
  .home-grid{grid-template-rows:minmax(160px,1.2fr) minmax(100px,.8fr) 58px}
  .primary-card h2{margin:7px 0 4px}
  .report-card h2{margin:7px 0 4px}
  .primary-card ul{margin:8px 0 10px}
  .primary-card button{left:17px;bottom:17px;min-height:42px}
  .report-card button{left:17px;bottom:17px;min-height:42px}
  .hero-art{transform:scale(.75)}
  .report-preview{right:-38px;bottom:-2px;transform:scale(.78) rotate(5deg)}
  .tool-card{padding:10px 12px}
  .tool-card>i{width:36px;height:36px}
}
.self-library{box-sizing:border-box}
.self-library header p{margin-top:6px}
.self-library .scale-copy h3{margin-bottom:10px}
.self-library .scale-copy p{line-height:1.65}
.self-library .self-card::before{display:none!important}
.hub--self .self-library{row-gap:0}
.hub--self .self-library>header{align-self:end}
.self-recommend-bar{animation:selfRise .52s cubic-bezier(.2,.72,.28,1) both}
.self-library{animation:selfRise .52s cubic-bezier(.2,.72,.28,1) both}
.self-library{animation-delay:.08s}
.self-recommend-bar{position:relative;overflow:hidden}
.self-recommend-bar::before{content:'';position:absolute;border-radius:50%;pointer-events:none}
.self-recommend-bar::after{content:'';position:absolute;border-radius:50%;pointer-events:none}
.self-recommend-bar::before{right:-52px;bottom:-42px;width:175px;height:175px;background:rgba(255,255,255,.36);animation:selfFloat 7s ease-in-out infinite}
.self-recommend-bar::after{right:42px;bottom:78px;width:46px;height:46px;background:rgba(126,181,158,.22);animation:selfFloat 5.5s ease-in-out -1.5s infinite reverse}
.self-recommend-bar>*{position:relative;z-index:1}
@keyframes selfRise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes selfFloat{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(-8px,-10px,0)}}
@media (prefers-reduced-motion:reduce){
  .self-recommend-bar{animation:none!important}
  .self-library{animation:none!important}
  .self-recommend-bar::before{animation:none!important}
  .self-recommend-bar::after{animation:none!important}
  .self-filters button.active::after{animation:none!important}
  .self-library .self-card{transition:none!important}
  .self-filters button{transition:none!important}
}
.self-library .self-card--teal{background:#e2f0eb!important}
.self-library .self-card--blue{background:#e3eef5!important}
.self-library .self-card--violet{background:#ece6f4!important}
.self-library .self-card--amber{background:#f4ecd9!important}
.self-library .self-card--green{background:#e8f1dd!important}
.self-library .self-card--rose{background:#f3e5e3!important}
.hub--self .hub-top{padding-bottom:8px}
.self-page{align-items:stretch}
.self-library{min-width:0}
.self-library>header{display:flex;align-items:center;justify-content:space-between}
.self-library h3{margin:0;color:#2e443d}
.self-library header p{margin:4px 0 0;color:#7b8984}
.self-library>header>span{padding:7px 11px;border-radius:999px;background:#f0f4f1;color:#63756e;font-size:10px}
.self-filters button{font-weight:700}
.self-filters button.active{border-color:#4e806f}
.self-library .self-card{flex-direction:column}
.self-card>div{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between}
.self-card>div span{padding:4px 7px;border-radius:6px;background:rgba(255,255,255,.72);font-size:9px;font-weight:750}
.self-card>div em{color:#718079;font-size:10px;font-style:normal;font-weight:800}
.self-library .self-card h3{margin:10px 0 3px;font-size:14px}
.self-library .self-card p{min-height:29px;font-size:10px;line-height:1.45}
.self-card footer{position:relative;z-index:1;display:flex;align-items:end;justify-content:space-between;margin-top:auto;padding-top:8px}
.self-card footer small{margin:0;color:#718079;font-size:9px}
.self-card footer b{font-size:10px}
.self-card--violet{background:#eee9f5!important;border-color:#e2d9ee!important}
.self-card--blue{background:#e7f0f6!important;border-color:#d7e6ef!important}
.self-card--amber{background:#f5eddc!important;border-color:#ebdfc8!important}
.self-card--teal{background:#e4f0ed!important;border-color:#d2e5df!important}
.self-card--green{background:#e9f1df!important;border-color:#dce9cc!important}
.self-card--rose{background:#f4e8e6!important;border-color:#ead8d4!important}
.self-library .self-card:active{transform:scale(.985)}
@media (max-width:1050px),(max-height:650px){
  .self-filters button{padding:0 9px}
  .self-library .self-card h3{margin-top:7px;font-size:12px}
  .self-library .self-card p{font-size:9px}
}
.hub.hub--feature{grid-template-columns:1fr;background:#f4f6f3}
.hub--feature .hub-main{padding:0 34px 24px}
.hub--feature .hub-top{display:grid;grid-template-columns:190px 1fr 150px;gap:22px}
.hub--feature .hub-top>div{text-align:center}
.feature-back{min-height:46px;padding:0 16px;color:#355f52;font-weight:750;text-align:left}
.hub--feature .relax-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .self-page{margin:0 auto}
.hub--feature .knowledge-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .help-page{width:min(1180px,100%);margin:0 auto}
.hub--feature .section-layout{width:min(1120px,100%);margin:auto}
.relax-page{min-height:0;display:grid}
.self-page{gap:16px;min-height:0;display:grid}
.knowledge-page{min-height:0;display:grid}
.help-page{min-height:0;gap:16px}
.article-lead button{padding:0 24px;border:0;color:#fff;font-weight:750}
.topic-list{padding:24px}
.self-page{grid-template-columns:1fr 1fr}
.self-cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;align-content:center}
.self-card{position:relative;overflow:hidden;min-height:94px;padding:14px 16px;border:0;color:#344841;text-align:left}
.self-card::after{content:'';position:absolute;right:-24px;bottom:-42px;width:128px;height:100px;border-radius:56% 44% 32% 68% / 52% 40% 60% 48%;background:rgba(255,255,255,.28)}
.self-card--0{background:#e5dff2}
.self-card--3{background:#e5dff2}
.self-card--1{background:#dbeaf3}
.self-card--4{background:#dbeaf3}
.self-card--2{background:#f1e5cd}
.self-card--5{background:#f1e5cd}
.self-card.active{box-shadow:inset 0 0 0 2px #596b6340,0 10px 25px #384c4419}
.self-card>span{position:absolute;right:14px;top:7px;color:#30433c2e;font-size:24px;font-weight:800}
.self-card h3{position:relative;z-index:1}
.self-card p{position:relative;z-index:1}
.self-card small{position:relative;z-index:1}
.self-card h3{margin:0 0 3px;font-size:14px}
.self-card p{margin:0;color:#65766f;font-size:10px}
.self-card small{display:block;margin-top:6px;font-size:10px;font-weight:700}
.knowledge-page{grid-template-columns:1.55fr .65fr}
.article-shelf{display:grid;grid-template-rows:1.25fr .65fr;gap:14px}
.article-lead{position:relative;overflow:hidden;display:grid;grid-template-columns:1.05fr .95fr;background:#f5ecd2}
.article-photo{min-width:0;background-image:linear-gradient(90deg,rgba(239,227,189,.04),#f5ecd2 96%),var(--article-image);background-position:center;background-size:cover}
.article-copy{display:flex;flex-direction:column;justify-content:center;padding:24px 30px 24px 8px}
.article-copy>span{color:#8a7134;font-size:11px;font-weight:750}
.article-lead h2{margin:9px 0 5px;font-size:25px;line-height:1.25}
.article-lead p{margin:0;color:#70684e;font-size:12px;line-height:1.55}
.article-copy>small{margin-top:8px;color:#887d60;font-size:9px;line-height:1.45}
.article-lead button{min-height:42px;margin-top:11px;background:#846b30;align-self:flex-start}
.topic-list button{display:grid;gap:3px;width:100%;padding:14px 8px;border:0;border-bottom:1px solid #e8eeeb;background:transparent;color:#63756e;text-align:left}
.topic-list button span{font-size:14px}
.topic-list button em{color:#93a09b;font-size:9px;font-style:normal;font-weight:500}
.topic-list button.active{padding-left:13px;border-radius:10px;background:#f5eed8;color:#806827;font-weight:750}
.topic-list button.active em{color:#8d7a46}
.source-note{margin-top:18px;padding:14px}
.source-note b{font-size:11px}
.source-note p{margin:5px 0 0;color:#7b8984;font-size:9px;line-height:1.55}
.resource-modal{position:fixed;z-index:300;inset:0;display:grid;place-items:center;background:rgba(24,42,35,.44);backdrop-filter:blur(5px)}
.resource-modal section{position:relative;width:min(430px,calc(100vw - 48px));padding:28px;border-radius:25px;background:#fff;text-align:center;box-shadow:0 26px 70px rgba(20,43,34,.3)}
.resource-close{position:absolute;right:13px;top:12px;width:38px;height:38px;border:0;background:#edf2ef;color:#4d675e;font-size:24px}
.resource-qr{width:190px;height:190px;margin:0 auto 14px}
.resource-qr :deep(svg){width:100%;height:100%}
.resource-modal h2{margin:0 32px 6px;font-size:20px}
.resource-modal p{margin:0 0 7px;color:#61736c}
.resource-modal small{color:#89958f;font-size:10px}
.hub--help{background:#f7f6f3}
.hub--help .hub-top{border-bottom:1px solid #e2e6e2}
.hub--help .hub-top h1{color:#30473f}
.hub--help .hub-top p{color:#788780}
.hub--help .feature-back{border-color:#d7e0dc;color:#3e6659;background:#fff}
.help-page{display:grid;place-items:center;padding:24px;border-radius:28px}
.support-simple{width:min(1020px,100%);padding:42px}
.support-actions{display:grid;grid-template-columns:1fr 1fr}
.support-action{position:relative;display:grid;grid-template-columns:62px 1fr auto;grid-template-rows:auto auto;align-items:center;min-height:210px;padding:32px;color:#344941;text-align:left}
.support-action>i{grid-row:1/3;display:grid;place-items:center;width:52px;height:52px;background:rgba(255,255,255,.8);font-size:19px;font-style:normal;font-weight:750}
.support-action span{align-self:end}
.support-action b{display:block}
.support-action small{display:block}
.support-action small{margin-top:6px;color:#6e7d77}
.support-action em{grid-column:2;align-self:start;margin-top:17px;color:#436c5e;font-style:normal;font-weight:750}
.support-action strong{grid-row:1/3;align-self:center;color:#536a83;font-size:31px;letter-spacing:.08em}
.support-action--appointment{border-color:#d6e4dc}
.support-action--hotline{border-color:#d8e2ec}
.support-action--hotline>i{color:#526f89}
.support-action--hotline em{color:#526f89}
.kind-switch{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.kind-switch button{padding:9px 5px!important;border:0!important;text-align:center!important}
.resource-list{display:grid;gap:5px;max-height:220px;margin-top:10px;overflow:auto}
.resource-list button b{display:block}
.resource-list button small{display:block}
.resource-list button small{margin-top:2px;color:#87958f}
.reading-action{padding:16px 18px;border-radius:14px;background:#edf4df}
.reading-action p{margin:6px 0 0;color:#596a4f;line-height:1.6}
.immersive-reader{position:absolute;z-index:20;inset:0;display:grid;grid-template-rows:82px 1fr;color:#2c443c}
.immersive-reader>header{display:grid;grid-template-columns:220px 1fr 280px;align-items:center;padding:0 34px;background:#fff}
.immersive-reader>header button{justify-self:start;min-height:44px;padding:0 16px;border:1px solid #d3ded8;border-radius:11px;background:#fff;color:#3b6758;font-weight:750}
.immersive-reader>header div{text-align:center}
.immersive-reader>header span{color:#769087;font-size:10px}
.immersive-reader>header h1{margin:3px 0;font-size:21px}
.immersive-reader>header>small{text-align:right;color:#7d8d87;font-size:10px}
.reader-layout{min-height:0;display:grid;grid-template-columns:205px 1fr;width:min(1180px,100%);margin:0 auto;padding:24px 30px;box-sizing:border-box;gap:24px}
.reader-layout>aside{position:sticky;top:20px;align-self:start;display:grid;gap:6px;padding:20px;background:#fff}
.reader-layout>aside>b{margin-bottom:9px}
.reader-layout>aside a{padding:10px;border-radius:9px;color:#667970;text-decoration:none;font-size:12px}
.reader-layout>aside a:hover{background:#eef4f0}
.reader-layout>aside button{min-height:42px;margin-top:10px;border:1px solid #cfdcd5;border-radius:10px;background:#fff;color:#3b6859;font-weight:700}
.reader-layout>article{min-width:0;overflow:auto;padding-right:8px;scroll-behavior:smooth}
.reader-hero{position:relative;overflow:hidden;min-height:240px;background-image:linear-gradient(90deg,rgba(38,60,52,.92),rgba(38,60,52,.44)),var(--reader-image);background-position:center;background-size:cover;color:#fff}
.reader-hero>div{max-width:590px;padding:38px}
.reader-hero span{font-size:11px}
.reader-hero h2{margin:12px 0;font-size:31px}
.reader-hero p{line-height:1.8}
.reader-section{padding:30px 30px 6px}
.reader-section>span{color:#718c82;font-size:11px;font-weight:800}
.reader-section>h2{margin:7px 0 18px;font-size:23px}
.reader-points{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.reader-points p{display:flex;gap:12px;margin:0;padding:17px;background:#fff;line-height:1.65}
.reader-points i{flex:0 0 auto;display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:#dfeee6;color:#397866;font-style:normal;font-weight:800}
.reader-action{padding:22px;font-size:16px;line-height:1.8}
.reader-videos{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.reader-videos button{position:relative;overflow:hidden;min-height:150px;padding:18px;border:0;border-radius:16px;background-image:linear-gradient(0deg,rgba(28,47,40,.9),rgba(28,47,40,.12)),var(--video-image);background-position:center;background-size:cover;color:#fff;text-align:left}
.reader-videos button>i{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.88);color:#3e6859;font-style:normal}
.reader-videos button>span{position:absolute;right:16px;bottom:15px;left:16px}
.reader-videos small{display:block}
.reader-videos b{display:block}
.reader-videos em{display:block}
.reader-videos b{margin:4px 0;font-size:13px}
.reader-videos em{font-size:9px;font-style:normal;opacity:.8}
.reader-layout>article>footer{padding:26px 30px 35px;color:#7d8d87;font-size:11px;text-align:center}
.article-shelf--simple{grid-template-rows:1fr auto}
.article-note{padding:18px 22px;color:#405950}
.article-note p{margin:5px 0 0;color:#6e7f78;line-height:1.6}
.reader-prose{margin:18px 30px 0;padding:28px 32px;background:#fff}
.reader-prose p{margin:0 0 14px;color:#4e625a;font-size:15px;line-height:1.95}
.reader-prose ul{display:grid;gap:9px;margin:18px 0 0;padding:0;list-style:none}
.reader-prose li{position:relative;padding:12px 15px 12px 38px;border-radius:11px;background:#f2f6f3;color:#50635c;line-height:1.65}
.reader-prose li::before{content:'•';position:absolute;left:17px;color:#4b876f;font-size:20px;font-weight:900}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .hub-main{padding:0 20px 14px}
  .hub--feature .hub-top{gap:12px}
  .feature-back{min-height:40px;font-size:12px}
  .topic-list{padding:18px}
  .self-card{min-height:94px}
  .article-lead{padding:25px}
}
.self-recommend-bar{color:#29483e}
.self-recommend-bar span{color:#4c806f;font-weight:800}
.self-recommend-bar p{margin:0;color:#65776f;font-size:11px}
.recommend-pills b{border-radius:99px}
.self-recommend-bar>button{border:0;background:#397866;color:#fff;font-weight:800}
.self-library>header .all-scales-link{font-weight:750}
.self-category-title{gap:10px;display:flex;align-items:baseline}
.self-category-title span{color:#304b42;font-weight:850}
.self-category-title p{margin:0;color:#84918c}
.self-library .self-cards{align-content:start;display:grid}
.self-library .self-card{position:relative;align-items:center;gap:16px;box-sizing:border-box;text-align:left}
.self-library .self-card::after{width:150px;height:125px;right:auto;bottom:-48px;left:-38px}
.scale-copy{position:relative;z-index:1;display:block!important}
.self-library .self-card>button{font-weight:800;position:relative;z-index:1;white-space:nowrap}
.scale-catalog{position:fixed;z-index:410;inset:0;display:grid;place-items:center;padding:24px;backdrop-filter:blur(6px)}
.scale-catalog>section{box-sizing:border-box;overflow:auto;box-shadow:0 26px 80px rgba(25,44,37,.3)}
.scale-catalog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:17px}
.scale-catalog header span{color:#648076;font-size:10px;font-weight:800}
.scale-catalog h2{margin:4px 0 0;font-size:23px}
.scale-catalog header button{width:42px;height:42px;border:0;background:#e9efeb;color:#526861;font-size:24px}
.scale-catalog>section>div{display:grid}
.scale-catalog>section>div>button{display:grid;grid-template-columns:12px 1fr auto;align-items:center;gap:10px;min-height:76px;padding:12px;border:1px solid #e0e7e3;border-radius:14px;background:#fff;color:#334b43;text-align:left}
.scale-catalog b{display:block}
.scale-catalog small{display:block}
.scale-catalog b{font-size:12px}
.scale-catalog small{margin-top:4px;color:#7b8984;font-size:9px}
.scale-catalog em{color:#42705f;font-size:9px;font-style:normal;font-weight:800}
.scale-catalog footer{margin-top:16px;color:#819089;font-size:10px;text-align:center}
@media (max-width:1050px),(max-height:650px){
  .self-library .self-card{gap:11px}
  .scale-catalog>section>div>button{min-height:66px}
}
.hub--feature .self-page{align-content:start}
.self-recommend-bar{grid-template-columns:minmax(250px,1fr) minmax(180px,.8fr) auto auto}
.self-recommend-bar>div:first-child{align-items:center;gap:12px}
.self-recommend-bar span{border-radius:6px;background:#d6e7de}
.self-recommend-bar>p{color:#65776f}
.recommend-pills{display:flex;gap:6px}
.recommend-pills b{padding:0;background:transparent;color:#718078;font-weight:650}
.recommend-pills b+b::before{content:'·';margin-right:6px;color:#a1ada7}
.self-recommend-bar>button{border-radius:10px}
.self-library>header{padding:0 2px}
.self-library>header .all-scales-link{min-height:34px;padding:0;border:0;border-radius:0;background:transparent;color:#58776c}
.self-filters button{position:relative;color:#66766f}
.self-filters button.active{border:0;font-weight:850}
.self-filters button.active::after{content:'';position:absolute;right:0;bottom:-1px;left:0;height:3px;border-radius:99px;background:#43806b}
.self-category-title{margin:0 2px 12px}
.self-library .self-card{box-shadow:0 8px 24px rgba(43,64,56,.055);display:grid;grid-template-columns:minmax(0,1fr) auto;border:0!important;border-radius:16px;background:transparent;overflow:hidden}
.self-library .self-card::before{width:5px;content:'';position:absolute;top:0;bottom:0;left:0;background:#a9bdb5}
.self-library .self-card--violet::before{background:#ae9bc5}
.self-library .self-card--blue::before{background:#86adc5}
.self-library .self-card--amber::before{background:#d2b46d}
.self-library .self-card--teal::before{background:#78ad9f}
.self-library .self-card--green::before{background:#91b36b}
.self-library .self-card--rose::before{background:#c6938e}
.self-library .self-card::after{display:none}
.self-library .scale-copy h3{margin:0 0 8px}
.self-library .scale-copy p{margin:0 0 16px;color:#66776f;min-height:auto}
.scale-copy small{color:#7d8a84}
.self-library .self-card>button{align-self:end;border:0}
.self-library .self-card>button:active{opacity:.65}
@media (max-width:1050px),(max-height:650px){
  .self-library .self-card{grid-template-columns:minmax(0,1fr) auto}
}
/* 心理自测最终横屏结构：左侧推荐，右侧分类后展示一组量表。 */
/* 心理自测轻量视觉：减少容器与控件轮廓，仅保留内容层级。 */
.hub--self .hub-main{background:#f5f6f2}
.hub--feature .self-page{grid-template-columns:330px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:22px;align-items:stretch;width:min(1160px,100%)}
.self-recommend-bar{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:0;min-height:0;padding:36px 30px}
.self-recommend-bar>div:first-child{display:block}
.self-recommend-bar span{display:inline-block;padding:6px 10px;font-size:11px}
.self-recommend-bar h2{max-width:270px;margin:15px 0 0;font-size:24px;line-height:1.3}
.self-recommend-bar>p{max-width:250px;margin:13px 0 0;font-size:14px;line-height:1.7}
.recommend-pills{margin-top:22px}
.recommend-pills b{font-size:12px}
.self-recommend-bar>button{min-height:52px;margin-top:27px;padding:0 24px;font-size:15px}
.self-library{display:grid;grid-template-rows:auto auto auto minmax(0,1fr);padding:28px 30px}
.self-library h3{font-size:23px}
.self-library header p{font-size:13px}
.self-library>header .all-scales-link{font-size:13px}
.self-filters{display:grid;grid-template-columns:repeat(6,1fr);margin:22px 0 24px}
.self-filters button{min-height:46px;padding:0 6px;font-size:14px}
.self-category-title{margin-bottom:16px}
.self-category-title span{font-size:17px}
.self-category-title p{font-size:12px}
.self-library .self-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
.self-library .self-card{min-height:166px;padding:28px 25px}
.self-library .scale-copy h3{font-size:20px}
.self-library .scale-copy p{margin-bottom:22px;font-size:13px}
.scale-copy small{font-size:12px}
.self-library .self-card>button{font-size:13px}
.self-library .self-card:only-child{grid-column:1/-1;width:calc(50% - 8px)}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .self-page{grid-template-columns:260px minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:14px}
  .self-recommend-bar{min-height:0;padding:25px 22px}
  .self-recommend-bar h2{font-size:21px}
  .self-recommend-bar>p{font-size:12px}
  .self-recommend-bar>button{min-height:46px}
  .self-library{padding:19px 21px}
  .self-library h3{font-size:19px}
  .self-library header p{font-size:11px}
  .self-library>header .all-scales-link{font-size:11px}
  .self-filters{margin:14px 0 16px}
  .self-filters button{min-height:38px;font-size:12px}
  .self-category-title{margin-bottom:10px}
  .self-library .self-card{min-height:128px;padding:20px}
  .self-library .scale-copy h3{font-size:17px}
  .self-library .scale-copy p{margin-bottom:13px;font-size:11px}
  .scale-copy small{font-size:10px}
}
/* 心理自测横屏最终重心：内容组纵向居中，避免上密下空。 */
/* 自测页纵向重心：将标题、分类和量表卡作为一组置于屏幕中部。 */
/* 心理自测横屏最终重心：内容组纵向居中，避免上密下空。 */
.hub--self .self-page{align-self:stretch}
.hub--self .self-library{grid-template-rows:auto auto auto auto;align-content:center;padding-top:34px;padding-bottom:34px}
.hub--self .self-filters{margin-top:24px;margin-bottom:22px}
.hub--self .self-category-title{margin-bottom:18px}
.hub--self .self-library .self-cards{align-content:center;gap:18px}
@media (max-width:1050px),(max-height:650px){
  .hub--self .self-library{align-content:center;padding-top:18px;padding-bottom:18px}
  .hub--self .self-filters{margin-top:14px;margin-bottom:14px}
  .hub--self .self-category-title{margin-bottom:10px}
  .hub--self .self-library .self-cards{gap:12px}
}
.scale-catalog>section{width:min(980px,94vw);max-height:90vh;padding:28px 30px}
.scale-catalog>section>div{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.scale-catalog>section>div>.catalog-card{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;box-sizing:border-box;min-height:124px;padding:20px 22px;border:0;overflow:hidden}
.scale-catalog>section>div>.catalog-card::after{content:'';position:absolute;right:-35px;bottom:-55px;width:150px;height:120px;border-radius:55% 45% 38% 62%;background:rgba(255,255,255,.28);pointer-events:none}
.scale-catalog .catalog-card>div{position:relative;z-index:1}
.scale-catalog .catalog-card>em{position:relative;z-index:1}
.scale-catalog .catalog-card b{font-size:16px}
.scale-catalog .catalog-card p{margin:7px 0 12px;color:#5f716a;font-size:11px;line-height:1.55}
.scale-catalog .catalog-card small{color:#6d7e77;font-size:10px}
.scale-catalog .catalog-card em{align-self:end;color:#315f50;font-size:11px}
.scale-catalog .catalog-card--teal{background:#dceee8}
.scale-catalog .catalog-card--blue{background:#dceaf3}
.scale-catalog .catalog-card--violet{background:#e8e0f1}
.scale-catalog .catalog-card--amber{background:#f1e6cd}
.scale-catalog .catalog-card--green{background:#e3eed5}
.scale-catalog .catalog-card--rose{background:#f0dfdc}
@media (max-width:1050px),(max-height:650px){
  .scale-catalog>section{padding:20px 22px}
  .scale-catalog>section>div{gap:10px}
  .scale-catalog>section>div>.catalog-card{min-height:98px;padding:14px 17px}
  .scale-catalog .catalog-card b{font-size:13px}
  .scale-catalog .catalog-card p{margin:4px 0 7px;font-size:9px}
}
/* 心理自测主页面可读性：放大文字，并用卡片内容消化横屏空白。 */
.hub--self .self-recommend-bar{padding:42px 34px}
.hub--self .self-recommend-bar span{padding:7px 11px;font-size:13px}
.hub--self .self-recommend-bar h2{max-width:275px;margin-top:18px;font-size:28px;line-height:1.35}
.hub--self .self-recommend-bar>p{max-width:265px;margin-top:16px;font-size:16px;line-height:1.75}
.hub--self .recommend-pills{margin-top:25px;gap:16px}
.hub--self .recommend-pills b{font-size:14px}
.hub--self .self-recommend-bar>button{min-height:56px;margin-top:30px;padding:0 28px;font-size:17px}
.hub--self .self-library{padding-right:34px;padding-left:34px}
.hub--self .self-library h3{font-size:26px}
.hub--self .self-library header p{margin-top:8px;font-size:15px}
.hub--self .self-library>header .all-scales-link{min-height:42px;font-size:14px}
.hub--self .self-filters{gap:7px}
.hub--self .self-filters button{min-height:50px;font-size:16px}
.hub--self .self-category-title{align-items:center;gap:14px}
.hub--self .self-category-title span{font-size:19px}
.hub--self .self-category-title p{font-size:13px}
.hub--self .self-library .self-card{min-height:190px;padding:31px 29px}
.hub--self .self-library .scale-copy h3{margin-bottom:12px;font-size:23px}
.hub--self .self-library .scale-copy p{margin-bottom:25px;font-size:15px;line-height:1.65}
.hub--self .scale-copy small{font-size:14px}
.hub--self .self-library .self-card>button{padding:12px 2px;font-size:15px}
@media (max-width:1050px),(max-height:650px){
  .hub--self .self-recommend-bar{padding:27px 24px}
  .hub--self .self-recommend-bar span{font-size:11px}
  .hub--self .self-recommend-bar h2{margin-top:12px;font-size:23px}
  .hub--self .self-recommend-bar>p{margin-top:10px;font-size:13px}
  .hub--self .recommend-pills{margin-top:16px}
  .hub--self .recommend-pills b{font-size:12px}
  .hub--self .self-recommend-bar>button{min-height:48px;margin-top:18px;font-size:15px}
  .hub--self .self-library{padding-right:22px;padding-left:22px}
  .hub--self .self-library h3{font-size:21px}
  .hub--self .self-library header p{font-size:12px}
  .hub--self .self-library>header .all-scales-link{font-size:12px}
  .hub--self .self-filters button{min-height:40px;font-size:13px}
  .hub--self .self-category-title span{font-size:16px}
  .hub--self .self-category-title p{font-size:11px}
  .hub--self .self-library .self-card{min-height:142px;padding:21px 22px}
  .hub--self .self-library .scale-copy h3{font-size:18px}
  .hub--self .self-library .scale-copy p{margin-bottom:14px;font-size:12px}
  .hub--self .scale-copy small{font-size:11px}
  .hub--self .self-library .self-card>button{font-size:12px}
}
/* 2026-09 社区端亲和产品化视觉层：弱化线框，使用完整柔和色块与清晰大字。 */
.hub{background:#f7f7f2;color:#283f37;font-family:"Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif}
.hub-main{padding-right:34px;padding-left:34px}
.hub-top h1{font-size:27px;font-weight:800;letter-spacing:.01em}
.hub-top p{color:#687a73;font-size:14px}
.hub-status{color:#45685c;font-size:13px;padding:9px 14px;border-radius:999px;background:#e8f3ec}
.hub-status i{box-shadow:none}
.primary-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.report-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.feature-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.info-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.tool-card{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.help-strip{border:0;box-shadow:0 10px 26px rgba(55,79,70,.055)}
.home-grid{gap:18px}
.primary-card{padding:29px}
.report-card{padding:29px}
.primary-card{border-radius:28px 58px 28px 28px;background:linear-gradient(130deg,#dceee4,#edf5ef 70%,#f7e8dd)}
.report-card{border-radius:28px 28px 54px 28px;background:linear-gradient(140deg,#deedf7,#edf4f8)}
.tag{padding:6px 11px;border-radius:9px;background:rgba(255,255,255,.76);font-size:12px}
.primary-card h2{font-size:27px;margin-top:14px}
.report-card h2{font-size:27px;margin-top:14px}
.primary-card p{font-size:14px;line-height:1.7}
.report-card p{font-size:14px;line-height:1.7}
.primary-card ul{font-size:12px}
.primary-card button{left:29px;bottom:27px;width:196px;border-radius:16px;font-size:17px;box-shadow:0 8px 18px rgba(57,120,102,.15)}
.report-card button{left:29px;bottom:27px;width:196px;border-radius:16px;font-size:17px;box-shadow:0 8px 18px rgba(57,120,102,.15)}
.tools header{margin-bottom:11px}
.tools h2{font-size:19px}
.tools header span{font-size:12px}
.tool-row{gap:16px}
.tool-card{min-height:116px;padding:20px 23px;border-radius:25px}
.tool-card>i{width:56px;height:56px;border-radius:18px;background:rgba(255,255,255,.78);font-size:25px}
.tool-card b{font-size:19px}
.tool-card small{font-size:13px}
.tool-card em{font-size:25px}
.peach{background:#f4e3d8}
.violet{background:#e9e3f4}
.yellow{background:#f4eccf}
.help-strip{border-radius:22px 42px 22px 22px;background:#e8f0eb}
.help-strip b{font-size:17px}
.help-strip small{font-size:12px}
.help-strip em{font-size:14px}
.hub--feature{background:#f7f7f2}
.hub--feature .hub-top{border:0}
.feature-back{border:0;border-radius:15px;background:#fff;font-size:15px;box-shadow:0 6px 18px rgba(50,75,66,.07)}
.hub--feature .hub-top>div h1{font-size:26px}
.hub--feature .hub-top>div p{font-size:13px}
.self-recommend-bar{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.self-library{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.article-shelf{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.topic-list{border:0;box-shadow:0 12px 30px rgba(54,76,68,.055)}
.support-simple{box-shadow:0 12px 30px rgba(54,76,68,.055)}
.self-recommend-bar{border-radius:29px 58px 29px 29px!important;background:linear-gradient(150deg,#dceee5,#eef5f0)!important}
.self-library{border-radius:29px!important;background:rgba(255,255,255,.9)!important}
.self-filters{gap:8px!important;border-bottom:0!important}
.self-filters button{border:0!important;border-radius:13px!important;background:#f1f3ef!important}
.self-filters button.active{background:#dcece4!important;color:#315e50!important}
.self-filters button.active::after{display:none!important}
.self-card{border-radius:22px!important;box-shadow:none!important}
.self-library .self-card>button{padding:0 16px!important;color:#315f50!important;min-height:42px!important;background:rgba(255,255,255,.72)!important;border-radius:12px!important}
.knowledge-page{gap:20px}
.article-lead{border-radius:30px 62px 30px 30px}
.article-note{border-radius:21px;background:#e8f0eb}
.article-note b{font-size:16px}
.article-note p{font-size:13px}
.topic-list{border-radius:29px 52px 29px 29px;background:#fff}
.kind-switch button{border-radius:14px!important;background:#f2f4f1!important}
.kind-switch button.active{background:#f3e8c9!important}
.resource-list button{padding:12px!important;border:0!important;border-radius:13px!important;margin-top:4px;background:#f7f8f5!important}
.resource-list button.active{background:#f3ead1!important}
.resource-list button b{font-size:13px}
.resource-list button small{font-size:10px}
.source-note{border-radius:17px;background:#edf3ef}
.article-lead button{border-radius:14px;font-size:14px}
.help-page{background:#f1f3ee}
.support-simple{border:0;border-radius:31px;background:#fff}
.support-actions{gap:24px}
.support-action{border:0;border-radius:28px;box-shadow:none}
.support-action--appointment{background:#e3f0e9}
.support-action--hotline{background:#e4edf6}
.support-action>i{border-radius:18px}
.support-action b{font-size:22px}
.support-action small{font-size:13px}
.support-action em{font-size:13px}
.immersive-reader{background:#f7f7f2}
.immersive-reader>header{border-bottom:0;box-shadow:0 5px 18px rgba(50,72,64,.05)}
.reader-layout>aside{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-prose{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-points p{border-radius:20px;border:0;box-shadow:0 7px 22px rgba(49,73,64,.045)}
.reader-hero{border-radius:30px 62px 30px 30px}
.reader-action{border-left:0;border-radius:18px;background:#e5f0df}
.scale-catalog{background:rgba(43,57,51,.34)}
/* 全部量表：沿用主页面整卡色块，并放大为横屏双列。 */
.scale-catalog>section{border-radius:30px;background:#fafbf8}
.scale-catalog header button{border-radius:15px}
.resource-close{border-radius:15px}
.close{border-radius:15px}
.scale-catalog>section>div>.catalog-card{border-radius:21px;box-shadow:none}
@media (max-width:1050px),(max-height:650px){
  .hub-main{padding-right:22px;padding-left:22px}
  .home-grid{gap:12px}
  .primary-card{padding:20px}
  .report-card{padding:20px}
  .primary-card h2{font-size:22px}
  .report-card h2{font-size:22px}
  .tool-card{min-height:78px;border-radius:19px}
  .tool-card b{font-size:16px}
  .tool-card small{font-size:11px}
  .hub--feature .hub-top>div h1{font-size:22px}
  .support-action b{font-size:18px}
}
/* 首页陪伴插画完整露出，避免被装饰底形遮挡。 */
.hero-art{right:5px;bottom:-2px;width:300px;height:235px}
.hero-art>span{inset:31px 4px 4px 45px;z-index:1}
.hero-art img{width:280px;height:220px;object-fit:contain;z-index:2;object-position:center bottom}
@media (max-width:1050px),(max-height:650px){
  .hero-art{right:-8px;bottom:-25px;width:265px;height:210px}
  .hero-art img{width:250px;height:195px}
}
.hub--relax .hub-top>div h1{letter-spacing:.02em}
.hub--relax .hub-top{grid-template-columns:190px minmax(0,1fr) 0!important}
@media (max-width:1050px),(max-height:650px){
  .hub--feature .hub-top{grid-template-columns:165px minmax(0,1fr) 0!important}
}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .hub-top{grid-template-columns:52px minmax(0,1fr) 0!important}
}
/* 情绪放松采用暖米白、草木绿与真实自然图像，弱化设备面板感。 */
/* 情绪放松入口改版：推荐位 + 次级练习卡 + 本周练习记录，卡片一色一练、卡外文字保持克制。 */
.hub--relax{background:#f6faf7}
.hub--relax .hub-top{border:0}
.hub--relax .hub-top>div h1{color:#1f3b33}
.hub--relax .hub-top>div p{color:#8a9c93}
.hub--relax .hub-status{background:#e9f5ee;color:#3e7d63;padding:9px 14px;border-radius:999px;font-size:13px}
.hub--relax .hub-status i{background:#4c9a7e;box-shadow:0 0 0 4px rgba(76,154,126,.12)}
.hub--relax .relax-cards{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.9fr);align-self:center;gap:32px;height:min(452px,100%);min-height:0}
.hub--relax .relax-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;min-width:0;min-height:0;padding:28px;border:0;border-radius:28px;background:#dff0e6;color:#1e3b32;font-family:inherit;text-align:center;cursor:pointer;box-shadow:0 8px 24px rgba(31,59,51,.08);transition:transform .16s ease,box-shadow .16s ease;-webkit-tap-highlight-color:transparent;outline:none}
.hub--relax .relax-hero:active{transform:scale(.995)}
.hub--relax .relax-hero:focus-visible{outline:3px solid #4c9a7e;outline-offset:3px}
.relax-hero__tag{padding:6px 14px;border-radius:999px;background:rgba(255,255,255,.7);color:#2f6e56;font-size:13px;font-weight:750}
.relax-hero__ring{position:relative;display:grid;place-items:center;width:124px;height:124px}
.relax-hero__ring i{display:none}
.relax-hero__ring b{width:92px;height:92px;border-radius:50%;background:radial-gradient(circle at 32% 26%,#c3e2cc,#78b58e 68%,#5c9a73);box-shadow:0 16px 34px rgba(63,142,112,.18);animation:relaxBreath 10s ease-in-out infinite}
@keyframes relaxBreath{0%,100%{transform:scale(.82)}40%{transform:scale(1.12)}}
@media (prefers-reduced-motion:reduce){
  .relax-hero__ring b{animation:none}
}
.relax-hero__title{font-size:26px;font-weight:750;line-height:1.3}
.relax-hero__desc{color:#5e7a70;font-size:14px;line-height:1.6}
.relax-hero__cta{display:flex;align-items:center;justify-content:center;min-height:50px;padding:0 26px;border-radius:16px;background:#3f8e70;color:#fff;font-size:16px;font-style:normal;font-weight:750;box-shadow:0 8px 20px rgba(63,142,112,.2)}
.hub--relax .relax-side{display:grid;grid-template-rows:1fr 1fr;gap:32px;min-height:0}
.hub--relax .relax-side-card{display:grid;grid-template-columns:64px minmax(0,1fr) 46px;align-items:center;gap:16px;min-width:0;min-height:0;padding:22px;border:0;border-radius:24px;color:#1e3b32;font-family:inherit;text-align:left;cursor:pointer;transition:transform .16s ease,box-shadow .16s ease;-webkit-tap-highlight-color:transparent;outline:none}
.hub--relax .relax-side-card--sound{background:#dceaf6}
.hub--relax .relax-side-card--stretch{background:#fbeedc}
.hub--relax .relax-side-card:active{transform:scale(.995)}
.hub--relax .relax-side-card:focus-visible{outline:3px solid #4c9a7e;outline-offset:3px}
.hub--relax .relax-hero:focus:not(:focus-visible),.hub--relax .relax-side-card:focus:not(:focus-visible){outline:none;box-shadow:none}
.relax-side-card__icon{display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.9)}
.relax-side-card__icon svg{width:30px;height:30px}
.relax-side-card__copy{display:block;min-width:0}
.relax-side-card__copy b{display:block;font-size:19px;font-weight:750;line-height:1.3}
.relax-side-card__copy small{display:block;margin-top:4px;color:#5a7c8c;font-size:13px;line-height:1.5}
.hub--relax .relax-side-card--stretch .relax-side-card__copy small{color:#8a6e3c}
.relax-side-card__play{display:grid;place-items:center;width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.75)}
.relax-side-card__play svg{width:17px;height:17px}
@media (max-width:1050px),(max-height:650px){
  .hub--relax .relax-page{gap:14px}
  .hub--relax .relax-cards{gap:18px;height:min(392px,100%)}
  .hub--relax .relax-hero{gap:10px;padding:20px}
  .relax-hero__tag{font-size:11px}
  .relax-hero__ring{width:104px;height:104px}
  .relax-hero__ring b{width:78px;height:78px}
  .relax-hero__title{font-size:22px}
  .relax-hero__desc{font-size:12px}
  .relax-hero__cta{min-height:46px;padding:0 22px;font-size:15px}
  .hub--relax .relax-side{gap:18px}
  .hub--relax .relax-side-card{grid-template-columns:56px minmax(0,1fr) 42px;gap:13px;padding:16px;border-radius:21px}
  .relax-side-card__icon{width:56px;height:56px}
  .relax-side-card__icon svg{width:26px;height:26px}
  .relax-side-card__copy b{font-size:17px}
  .relax-side-card__copy small{font-size:12px}
  .relax-side-card__play{width:42px;height:42px}
  .relax-side-card__play svg{width:15px;height:15px}
}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .relax-page{height:auto}
  .hub--relax .relax-cards{grid-template-columns:1fr}
  .hub--relax .relax-hero{min-height:340px}
  .hub--relax .relax-side{grid-template-rows:auto auto}
}
/* 情绪放松选择页：把练习本身作为主角，减少重复说明与空白。 */
.relax-page{gap:22px;grid-template-columns:minmax(0,1.25fr) minmax(390px,.85fr);align-items:stretch}
@media (max-width:1050px),(max-height:650px){
  .relax-page{grid-template-columns:minmax(0,1.15fr) minmax(340px,.9fr);gap:14px}
}
/* 简化后的情绪放松入口：标题沿用页面页头，主体只呈现三张可直接开始的练习卡。 */
/* 最终布局覆盖旧版选择页规则，卡片在终端横屏中保持紧凑、等高。 */
.hub--relax .hub-status{display:none}
.hub--relax .hub-top>div p{color:#526c60}
.hub--relax .relax-page{grid-template-columns:1fr;gap:22px;display:grid;grid-template-rows:minmax(0,1fr) auto;width:min(1120px,100%);height:100%;min-height:0;margin:0 auto}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .hub-main{overflow-y:auto}
  .hub--relax .relax-page{grid-template-rows:auto auto}
}
/* 官方科普：横屏内容库 + 独立沉浸阅读。 */
.hub--knowledge .hub-main{min-height:0}
.hub--knowledge .hub-status{display:none}
.knowledge-page{width:min(1240px,100%);height:100%;min-height:0;margin:0 auto;padding-top:14px;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:12px}
.hub--knowledge .kind-switch{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0}
.hub--knowledge .kind-switch button{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:10px;min-width:0;min-height:54px;padding:7px 14px!important;border:1px solid #e1e8df!important;border-radius:14px!important;background:#f7f8f4!important;text-align:left!important;color:#334c40;cursor:pointer}
.hub--knowledge .kind-switch button>i{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;background:#e8efe5;color:#4e765b;font-size:15px;font-style:normal;font-weight:800}
.hub--knowledge .kind-switch button:nth-child(2)>i{background:#e8eef5;color:#587695}
.hub--knowledge .kind-switch button:nth-child(3)>i{background:#f5eee1;color:#987441}
.hub--knowledge .kind-switch button>span{min-width:0;display:flex;align-items:baseline;gap:8px}
.hub--knowledge .kind-switch button b{font-size:15px;font-weight:750}
.hub--knowledge .kind-switch button small{color:#728078;font-size:12px}
.hub--knowledge .kind-switch button.active{border-color:#9dbba2!important;background:#edf4eb!important;box-shadow:0 4px 12px rgba(68,109,76,.07)}
.hub--knowledge .kind-switch button.active>i{background:#527d5f;color:#fff}
.knowledge-library{min-height:0;overflow:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:208px;align-content:start;gap:18px;padding:8px 8px 18px;scrollbar-width:thin;scrollbar-color:#ccd8ce transparent}
.resource-card{min-width:0;min-height:0;overflow:hidden;display:grid;grid-template-columns:minmax(112px,30%) minmax(0,1fr);border:1px solid #e4e9e1;border-radius:19px;background:#fff;box-shadow:0 6px 18px rgba(44,68,53,.055)}
.resource-card__visual{position:relative;min-width:0;min-height:0;background-image:linear-gradient(180deg,rgba(29,54,43,.03),rgba(29,54,43,.3)),var(--resource-image);background-size:cover;background-position:center}
.resource-card:not(.resource-card--featured) .resource-card__visual{background-position:center;background-color:#edf2ec}
.resource-card__visual span{position:absolute;left:10px;bottom:10px;padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.92);color:#45644f;font-size:11px;font-weight:750;line-height:1.2}
.resource-card__body{min-width:0;display:flex;flex-direction:column;align-items:flex-start;padding:16px 18px 14px}
.resource-card__body>small{overflow:hidden;max-width:100%;color:#748178;font-size:11px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.resource-card__body h3{display:-webkit-box;overflow:hidden;margin:8px 0 7px;color:#2e463a;font-size:18px;line-height:1.4;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.resource-card__body p{display:-webkit-box;overflow:hidden;margin:0;color:#65746b;font-size:14px;line-height:1.6;-webkit-box-orient:vertical;-webkit-line-clamp:3}
.resource-card__actions{display:flex;align-items:center;gap:14px;margin-top:auto;padding-top:12px}
.resource-card__actions button{min-height:42px;border:0;border-radius:12px;font:inherit;font-size:13px;font-weight:750;cursor:pointer}
.resource-read{padding:0 14px;background:#4e7b5d;color:#fff}
.resource-read b{margin-left:8px}
.resource-original{padding:0 8px;background:transparent;color:#56735e}
.resource-card__actions button:focus-visible,.hub--knowledge .kind-switch button:focus-visible{outline:3px solid #83ad8b;outline-offset:2px}
.reader-source-button{justify-self:end;min-height:42px;padding:0 15px;border:1px solid #d5e0d7;border-radius:12px;background:#f6f8f4;color:#456d51;font-size:13px;font-weight:750;cursor:pointer}
.reader-layout{grid-template-columns:190px minmax(0,1fr);width:min(1200px,100%);gap:22px;padding:20px 28px 26px}
.reader-layout>aside{gap:4px;padding:16px;border:1px solid #e6ebe4;border-radius:18px;background:#fff}
.reader-layout>aside>b{color:#334b3e;font-size:14px}
.reader-layout>aside a{color:#5d7164;font-size:13px;line-height:1.45}
.reader-layout>article{min-width:0;max-width:960px;width:100%;justify-self:center;padding:0 8px 0 0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.reader-hero{min-height:190px;padding:30px 34px;border-radius:22px;background-image:linear-gradient(90deg,rgba(248,249,244,.97) 0%,rgba(248,249,244,.9) 52%,rgba(248,249,244,.35) 100%),var(--reader-image);background-position:center 45%;background-size:cover}
.reader-hero>div{max-width:680px}
.reader-hero span{color:#5e8067;font-size:12px;font-weight:700}
.reader-hero h2{margin:10px 0 7px;color:#2e4638;font-size:26px;line-height:1.3}
.reader-hero p{max-width:620px;margin:0;color:#53695b;font-size:15px;line-height:1.65}
.reader-section{margin-top:16px;padding:22px 28px;border:1px solid #e8ece5;border-radius:20px;background:#fff}
.reader-section>span{color:#64846c;font-size:12px;font-weight:750}
.reader-section h2{margin:6px 0 12px;color:#30483b;font-size:21px;line-height:1.4}
.reader-points{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
.reader-points p{display:flex;align-items:flex-start;gap:10px;margin:0;padding:12px;border-radius:13px;background:#f5f7f2;color:#506258;font-size:14px;line-height:1.6}
.reader-points i{flex:none;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#e2eee1;color:#4d7956;font-size:12px;font-style:normal;font-weight:750}
.reader-prose p,.reader-prose li{color:#4e5f55;font-size:16px;line-height:1.85}
.reader-prose p{margin:0 0 13px}
.reader-prose ul{margin:8px 0 0;padding-left:22px}
.reader-prose li{padding:3px 0}
.reader-action{padding:16px 18px;border-radius:15px;background:#edf4eb;color:#46684d;font-size:15px;line-height:1.7}
.reader-layout>article>footer{padding:20px 12px 28px;color:#77837a;font-size:12px;line-height:1.5}
@media (max-width:1050px),(max-height:700px){
  .knowledge-page{gap:10px}
  .hub--knowledge .kind-switch{gap:8px}
  .hub--knowledge .kind-switch button{min-height:58px;padding:8px 11px!important;grid-template-columns:38px minmax(0,1fr) 14px}
  .hub--knowledge .kind-switch button>i{width:36px;height:36px}
  .knowledge-library{grid-auto-rows:184px;gap:14px;padding-inline:5px}
  .resource-card{grid-template-columns:minmax(92px,28%) minmax(0,1fr)}
  .resource-card__body{padding:13px 14px 12px}
  .resource-card__body h3{font-size:16px}
  .resource-card__body p{font-size:12px}
  .resource-card__actions button{min-height:36px}
}
@media (max-width:760px),(orientation:portrait){
  .hub--knowledge .hub-main{overflow-y:auto;grid-template-rows:74px 1fr;padding:0 16px 16px}
  .knowledge-page{height:auto;min-height:100%;grid-template-rows:auto auto;gap:12px}
  .hub--knowledge .kind-switch{grid-template-columns:1fr;gap:7px}
  .hub--knowledge .kind-switch button{min-height:56px}
  .knowledge-library{overflow:visible;grid-template-columns:1fr;grid-auto-rows:auto;padding-bottom:12px}
  .resource-card,.resource-card--featured{grid-column:auto;grid-template-columns:76px minmax(0,1fr);min-height:170px}
  .resource-card__body{padding:12px}
  .resource-card__body h3{font-size:16px}
  .resource-card__body p{font-size:13px}
  .immersive-reader{position:fixed;grid-template-rows:72px minmax(0,1fr)}
  .immersive-reader>header{grid-template-columns:auto minmax(0,1fr) auto;gap:8px;padding:0 12px}
  .immersive-reader>header button{min-height:40px;padding:0 10px;font-size:12px}
  .immersive-reader>header h1{overflow:hidden;font-size:15px;text-overflow:ellipsis;white-space:nowrap}
  .immersive-reader>header span{font-size:10px}
  .reader-layout{display:block;overflow:auto;padding:12px 12px 20px}
  .reader-layout>aside{display:none}
  .reader-layout>article{height:auto;overflow:visible;padding:0}
  .reader-hero{min-height:170px;padding:22px 18px;background-position:60% center}
  .reader-hero h2{font-size:21px}
  .reader-hero p{font-size:14px}
  .reader-section{margin-top:11px;padding:18px}
  .reader-section h2{font-size:18px}
  .reader-points{grid-template-columns:1fr}
  .reader-prose p,.reader-prose li{font-size:15px}
}
.hub--relax .relax-side{grid-template-rows:repeat(3,minmax(0,1fr));gap:18px}
.hub--relax .relax-side-card--game{background:#ece8f6;color:#50456d}
.hub--relax .relax-side-card--game .relax-game-card__icon{background:rgba(255,255,255,.9);color:#65558c;font-size:31px}
.hub--relax .relax-side-card--game .relax-side-card__copy small{color:#70668a}
@media (max-width:760px),(orientation:portrait){
  .hub--relax .relax-side{grid-template-rows:repeat(3,minmax(96px,auto))}
}
</style>

























