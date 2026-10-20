// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。
// 运动健康的类别、内容类型和标签取自 docs/drafts/sports-health-sources-and-criteria.md（类别用 2.1 的 A 版），等老板逐条确认（待定 D3）。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * D3 确认后冻结 key：key 会进小程序出口的接口参数、分享路径和收藏记录，上线后不改；label 和 guide 可以改。
 * general 放最后，兼作兜底类。
 */
export const CATEGORIES = [
  { key: "work-health", label: "职业健康", section: "职业健康", guide: "职场和产线上的健康：倒班与夜班作息、久坐久站、噪声粉尘高温等防护、工间活动、劳动保护法规与职工权益；职业病的症状、诊断和治疗不归这里" },
  { key: "fitness", label: "运动健身", section: "运动健身", guide: "运动科学与科学健身：分人群的运动建议、碎片化运动、大众运动的方法与防伤、健身步道和场馆开放" },
  { key: "events", label: "赛事", section: "赛事", guide: "读者能参加的马拉松、骑行、徒步、企业运动会等大众赛事与活动的报名、赛历和规则变化，赛事中的伤亡事故与官方通报，以及奥运会、世锦赛等国家级赛事节点；常规赛果、转会和俱乐部经营不归这里" },
  { key: "nutrition", label: "饮食营养", section: "饮食营养", guide: "膳食指南、食品安全与消费提示、食堂与外卖、控盐控糖控油、饮水；不写某种食物治某种病" },
  { key: "sleep", label: "睡眠与心理", section: "睡眠与心理", guide: "睡眠作息、压力管理与情绪调适、官方心理援助与求助渠道；只用非临床的说法，心理疾病的诊断和用药不归这里" },
  { key: "general", label: "公共卫生", section: "公共卫生", guide: "官方的季节与极端天气健康提示、传染病防护要点、控烟与健康政策，以及不属于以上类别的健康生活内容" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = [
  "guideline_policy", "health_alert", "safety_incident", "research_finding", "practical_method", "mass_event", "workplace_practice", "pro_sports", "explainer_opinion",
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "指南/政策", "提示/预警", "研究/数据", "方法/指导", "赛事/活动", "单位实践", "职业体育", "科普/观点",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "倒班作息", "久坐久站", "高温防护", "噪声粉尘", "劳动保护", "睡眠", "压力调适", "膳食指南", "食品安全", "减盐控糖",
  "体重管理", "科学健身", "跑步", "马拉松", "骑行", "徒步登山", "足球", "奥运会", "全民健身", "控烟",
  "传染病防护", "极端天气",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["国家卫健委", "中国疾控中心", "国家体育总局", "世界卫生组织", "市场监管总局", "中国足协", "中国田协"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  指南: "指南/政策", 政策: "指南/政策", 标准: "指南/政策", 规划: "指南/政策", 法规: "指南/政策", 条例: "指南/政策", "政策/标准": "指南/政策",
  提示: "提示/预警", 预警: "提示/预警", 健康提示: "提示/预警", 召回: "提示/预警", 事故: "提示/预警", 通报: "提示/预警",
  研究: "研究/数据", 论文: "研究/数据", 数据: "研究/数据", 调查: "研究/数据", 报告: "研究/数据",
  方法: "方法/指导", 指导: "方法/指导", 建议: "方法/指导", 做法: "方法/指导",
  赛事: "赛事/活动", 活动: "赛事/活动", 比赛: "赛事/活动", 报名: "赛事/活动",
  企业实践: "单位实践", 工会: "单位实践", 职业联赛: "职业体育", 国家队: "职业体育",
  科普: "科普/观点", 辟谣: "科普/观点", 观点: "科普/观点", 访谈: "科普/观点", 评论: "科普/观点",
  倒班: "倒班作息", 夜班: "倒班作息", 轮班: "倒班作息", 久坐: "久坐久站", 久站: "久坐久站",
  高温: "高温防护", 中暑: "高温防护", 热射病: "高温防护", 噪声: "噪声粉尘", 粉尘: "噪声粉尘", 职业防护: "劳动保护",
  失眠: "睡眠", 午睡: "睡眠", 压力: "压力调适", 情绪: "压力调适", 心理健康: "压力调适",
  膳食: "膳食指南", 营养: "膳食指南", 食安: "食品安全", 减盐: "减盐控糖", 控糖: "减盐控糖", 肥胖: "体重管理", 减重: "体重管理",
  健身: "科学健身", 路跑: "跑步", 半马: "马拉松", 半程马拉松: "马拉松", 自行车: "骑行", 徒步: "徒步登山", 登山: "徒步登山",
  奥运: "奥运会", 吸烟: "控烟", 戒烟: "控烟", 二手烟: "控烟", 传染病: "传染病防护", 流感: "传染病防护", 寒潮: "极端天气", 暴雨: "极端天气",
  卫健委: "国家卫健委", 国家卫生健康委: "国家卫健委", 中国疾病预防控制中心: "中国疾控中心", 体育总局: "国家体育总局",
  世卫组织: "世界卫生组织", WHO: "世界卫生组织", who: "世界卫生组织", 国家市场监督管理总局: "市场监管总局",
  中国足球协会: "中国足协", 中国田径协会: "中国田协",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  guideline_policy: "指南/政策", health_alert: "提示/预警", safety_incident: "提示/预警", research_finding: "研究/数据",
  practical_method: "方法/指导", mass_event: "赛事/活动", workplace_practice: "单位实践", pro_sports: "职业体育", explainer_opinion: "科普/观点",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/** 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。这个板块的主体是发布机构。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  nhc: { name: "国家卫健委", displayTag: "国家卫健委", aliases: ["国家卫健委", "国家卫生健康委", "国家卫生健康委员会"] },
  chinacdc: { name: "中国疾控中心", displayTag: "中国疾控中心", aliases: ["中国疾控中心", "中国疾病预防控制中心", "China CDC"] },
  ndcpa: { name: "国家疾控局", displayTag: null, aliases: ["国家疾控局", "国家疾病预防控制局"] },
  sport: { name: "国家体育总局", displayTag: "国家体育总局", aliases: ["国家体育总局", "体育总局"] },
  who: { name: "世界卫生组织", displayTag: "世界卫生组织", aliases: ["世界卫生组织", "世卫组织", "WHO"] },
  samr: { name: "市场监管总局", displayTag: "市场监管总局", aliases: ["市场监管总局", "国家市场监督管理总局"] },
  cfsa: { name: "国家食品安全风险评估中心", displayTag: null, aliases: ["国家食品安全风险评估中心", "食品安全风险评估中心"] },
  nihe: { name: "中国健康教育中心", displayTag: null, aliases: ["中国健康教育中心"] },
  acftu: { name: "全国总工会", displayTag: null, aliases: ["全国总工会", "中华全国总工会"] },
  coc: { name: "中国奥委会", displayTag: null, aliases: ["中国奥委会", "中国奥林匹克委员会"] },
  cfa: { name: "中国足协", displayTag: "中国足协", aliases: ["中国足协", "中国足球协会"] },
  caa: { name: "中国田协", displayTag: "中国田协", aliases: ["中国田协", "中国田径协会"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。这个板块的主体是官方机构和协会，先留空。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [];

/** 这些域名上的文章，发布方就是对应的公司（托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
