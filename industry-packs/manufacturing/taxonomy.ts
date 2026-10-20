// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 */
export const CATEGORIES = [
  { key: "battery", label: "锂电", section: "锂电", guide: "动力、消费、固态与钠离子电池，以及正负极、隔膜、电解液、铜箔铝箔等电池材料的扩产投产、工艺与技术路线、质量与安全事件、企业经营" },
  { key: "energy-storage", label: "储能", section: "储能", guide: "储能电芯与系统、储能电站与项目、储能技术路线与安全事故" },
  { key: "semiconductor", label: "半导体", section: "半导体", guide: "晶圆制造、先进封装、碳化硅等衬底与外延、陶瓷基板与精密陶瓷零部件、MLCC、光模块的产线、工艺、良率与企业经营" },
  { key: "film-materials", label: "薄膜与材料", section: "薄膜与材料", guide: "塑料薄膜、光学膜与功能膜、涂布与涂覆层、无纺布、纸张、金属箔材、胶带与离型膜、橡胶等卷材的产线、工艺与材料进展" },
  { key: "inspection", label: "检测与设备", section: "检测与设备", guide: "测厚、面密度、X 射线、机器视觉、工业 CT 等检测量测设备，以及涂布、辊压等制造设备厂商的新品、订单、融资与应用案例" },
  { key: "policy", label: "政策与标准", section: "政策与标准", guide: "政府与协会发布的产业政策、规划、行业规范条件、国家标准与强制性标准、监管处罚及其解读；只涉及单个行业的也归这里" },
  { key: "industry", label: "综合", section: "综合动态", guide: "不属于以上类别的制造业动态：氢能、光伏与钙钛矿、新能源汽车整车、跨行业的宏观与公司消息" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = [
  "capacity_project", "process_technology", "quality_safety", "policy_standard", "equipment_inspection", "company_event", "research_report", "opinion_analysis",
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "扩产/投产", "工艺/技术", "设备/检测", "质量/安全", "政策/标准", "公司动态", "市场/行情", "研究/数据", "观点/分析", "会展/活动",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "锂电", "储能", "固态电池", "钠离子电池", "电池材料", "隔膜", "铜箔/铝箔", "涂布/辊压", "干法电极", "复合集流体",
  "半导体", "先进封装", "碳化硅", "陶瓷基板", "MLCC", "光模块", "薄膜/光学膜", "无纺布/纸张", "氢能", "钙钛矿",
  "测厚/面密度", "X射线/CT", "机器视觉",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["宁德时代", "比亚迪", "亿纬锂能", "国轩高科", "中创新航", "欣旺达", "LG新能源", "先导智能", "赢合科技", "恩捷股份", "三环集团", "工信部"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  扩产: "扩产/投产", 投产: "扩产/投产", 开工: "扩产/投产", 建厂: "扩产/投产", 新产线: "扩产/投产", "项目/扩产": "扩产/投产",
  工艺: "工艺/技术", 技术: "工艺/技术", 技术路线: "工艺/技术", "技术/工艺": "工艺/技术", 新品: "工艺/技术", 量产: "工艺/技术",
  设备: "设备/检测", 检测: "设备/检测", 量测: "设备/检测", 检测设备: "设备/检测", "检测/设备": "设备/检测", 测量: "设备/检测",
  质量: "质量/安全", 安全: "质量/安全", 召回: "质量/安全", 事故: "质量/安全",
  政策: "政策/标准", 标准: "政策/标准", 监管: "政策/标准", 法规: "政策/标准", 规划: "政策/标准", "政策/监管": "政策/标准",
  行业动态: "公司动态", 融资: "公司动态", 并购: "公司动态", 收购: "公司动态", 财报: "公司动态", 合作: "公司动态", 人事: "公司动态", 投资: "公司动态",
  行情: "市场/行情", 价格: "市场/行情", 市场: "市场/行情",
  研究: "研究/数据", 论文: "研究/数据", 数据: "研究/数据", 报告: "研究/数据", paper: "研究/数据",
  观点: "观点/分析", 分析: "观点/分析", 访谈: "观点/分析", 评论: "观点/分析",
  会展: "会展/活动", 展会: "会展/活动", 活动: "会展/活动", 论坛: "会展/活动",
  锂电池: "锂电", 动力电池: "锂电", 锂离子电池: "锂电", 储能电池: "储能", 新型储能: "储能",
  全固态电池: "固态电池", 固态: "固态电池", 钠电: "钠离子电池", 钠电池: "钠离子电池",
  正极材料: "电池材料", 负极材料: "电池材料", 电解液: "电池材料", 锂电隔膜: "隔膜", 铜箔: "铜箔/铝箔", 铝箔: "铜箔/铝箔",
  涂布: "涂布/辊压", 辊压: "涂布/辊压", 极片: "涂布/辊压", 集流体: "复合集流体",
  芯片: "半导体", 晶圆: "半导体", 封装: "先进封装", SiC: "碳化硅", sic: "碳化硅", 精密陶瓷: "陶瓷基板", mlcc: "MLCC", 光通信: "光模块",
  薄膜: "薄膜/光学膜", 光学膜: "薄膜/光学膜", 功能膜: "薄膜/光学膜", 无纺布: "无纺布/纸张", 纸张: "无纺布/纸张", 造纸: "无纺布/纸张",
  氢燃料电池: "氢能", 燃料电池: "氢能", 钙钛矿电池: "钙钛矿",
  测厚: "测厚/面密度", 面密度: "测厚/面密度", 测厚仪: "测厚/面密度", "X-ray": "X射线/CT", "x-ray": "X射线/CT", X射线: "X射线/CT", 工业CT: "X射线/CT", CT: "X射线/CT",
  视觉检测: "机器视觉", CCD: "机器视觉", AOI: "机器视觉",
  CATL: "宁德时代", catl: "宁德时代", BYD: "比亚迪", byd: "比亚迪", 亿纬: "亿纬锂能", 国轩: "国轩高科", 恩捷: "恩捷股份", 三环: "三环集团",
  LGES: "LG新能源", lges: "LG新能源", 工业和信息化部: "工信部",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  capacity_project: "扩产/投产", process_technology: "工艺/技术", quality_safety: "质量/安全", policy_standard: "政策/标准",
  equipment_inspection: "设备/检测", company_event: "公司动态", research_report: "研究/数据", opinion_analysis: "观点/分析",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/** 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  catl: { name: "宁德时代", displayTag: "宁德时代", aliases: ["宁德时代", "CATL"] },
  byd: { name: "比亚迪", displayTag: "比亚迪", aliases: ["比亚迪", "BYD", "弗迪电池"] },
  eve: { name: "亿纬锂能", displayTag: "亿纬锂能", aliases: ["亿纬锂能", "亿纬", "EVE Energy"] },
  gotion: { name: "国轩高科", displayTag: "国轩高科", aliases: ["国轩高科", "国轩", "Gotion"] },
  calb: { name: "中创新航", displayTag: "中创新航", aliases: ["中创新航", "CALB"] },
  sunwoda: { name: "欣旺达", displayTag: "欣旺达", aliases: ["欣旺达", "Sunwoda"] },
  svolt: { name: "蜂巢能源", displayTag: null, aliases: ["蜂巢能源", "SVOLT"] },
  lges: { name: "LG新能源", displayTag: "LG新能源", aliases: ["LG新能源", "LG Energy Solution", "LGES"] },
  "samsung-sdi": { name: "三星SDI", displayTag: null, aliases: ["三星SDI", "Samsung SDI"] },
  panasonic: { name: "松下", displayTag: null, aliases: ["松下", "Panasonic"] },
  lead: { name: "先导智能", displayTag: "先导智能", aliases: ["先导智能", "无锡先导"] },
  yinghe: { name: "赢合科技", displayTag: "赢合科技", aliases: ["赢合科技", "赢合"] },
  putailai: { name: "璞泰来", displayTag: null, aliases: ["璞泰来", "新嘉拓"] },
  semcorp: { name: "恩捷股份", displayTag: "恩捷股份", aliases: ["恩捷股份", "恩捷", "SEMCORP"] },
  senior: { name: "星源材质", displayTag: null, aliases: ["星源材质"] },
  cctc: { name: "三环集团", displayTag: "三环集团", aliases: ["三环集团", "潮州三环", "CCTC"] },
  dacheng: { name: "大成精密", displayTag: null, aliases: ["大成精密"] },
  shuangyuan: { name: "双元科技", displayTag: null, aliases: ["双元科技"] },
  unicomp: { name: "日联科技", displayTag: null, aliases: ["日联科技", "UNICOMP"] },
  zhengye: { name: "正业科技", displayTag: null, aliases: ["正业科技"] },
  opt: { name: "奥普特", displayTag: null, aliases: ["奥普特"] },
  luster: { name: "凌云光", displayTag: null, aliases: ["凌云光"] },
  tztek: { name: "天准科技", displayTag: null, aliases: ["天准科技", "天准", "TZTEK"] },
  jingce: { name: "精测电子", displayTag: null, aliases: ["精测电子"] },
  skyverse: { name: "中科飞测", displayTag: null, aliases: ["中科飞测"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "catl", name: "宁德时代", patterns: [/宁德时代|\bCATL\b|Contemporary Amperex/i] },
  { id: "byd", name: "比亚迪", patterns: [/比亚迪|\bBYD\b|弗迪电池|FinDreams/i] },
  { id: "eve", name: "亿纬锂能", patterns: [/亿纬|EVE Energy/i] },
  { id: "gotion", name: "国轩高科", patterns: [/国轩|\bGotion\b/i] },
  { id: "calb", name: "中创新航", patterns: [/中创新航|\bCALB\b/i] },
  { id: "sunwoda", name: "欣旺达", patterns: [/欣旺达|sunwoda/i] },
  { id: "svolt", name: "蜂巢能源", patterns: [/蜂巢能源|\bSVOLT\b/i] },
  { id: "lges", name: "LG新能源", patterns: [/LG\s?新能源|LG Energy Solution|\bLGES\b|\bLG\s?Ensol\b/i] },
  { id: "samsung-sdi", name: "三星SDI", patterns: [/三星\s?SDI|Samsung SDI/i] },
  { id: "panasonic", name: "松下", patterns: [/(?<![放轻宽])松下|panasonic/i] },
  { id: "sk-on", name: "SK On", patterns: [/\bSK\s?On\b/i] },
  { id: "tesla", name: "特斯拉", patterns: [/特斯拉|\bTesla\b/i] },
  { id: "volkswagen", name: "大众汽车", patterns: [/大众汽车|大众集团|volkswagen|\bPowerCo\b/i] },
  { id: "toyota", name: "丰田", patterns: [/丰田|\bToyota\b/i] },
  { id: "huawei", name: "华为", patterns: [/华为|huawei/i] },
  { id: "hithium", name: "海辰储能", patterns: [/海辰储能|hithium/i] },
  { id: "rept", name: "瑞浦兰钧", patterns: [/瑞浦兰钧|\bREPT\b/i] },
  { id: "aesc", name: "远景动力", patterns: [/远景动力|\bAESC\b/i] },
  { id: "sungrow", name: "阳光电源", patterns: [/阳光电源|sungrow/i] },
  { id: "northvolt", name: "Northvolt", patterns: [/northvolt/i] },
  { id: "lead", name: "先导智能", patterns: [/先导智能|无锡先导|Wuxi Lead/i] },
  { id: "yinghe", name: "赢合科技", patterns: [/赢合科技/i] },
  { id: "putailai", name: "璞泰来", patterns: [/璞泰来|新嘉拓|putailai/i] },
  { id: "semcorp", name: "恩捷股份", patterns: [/恩捷|semcorp/i] },
  { id: "senior", name: "星源材质", patterns: [/星源材质/i] },
  { id: "cctc", name: "三环集团", patterns: [/三环集团|潮州三环|\bCCTC\b/i] },
  { id: "tsmc", name: "台积电", patterns: [/台积电|\bTSMC\b/i] },
  { id: "smic", name: "中芯国际", patterns: [/中芯国际|\bSMIC\b/i] },
  { id: "samsung-electronics", name: "三星电子", patterns: [/三星电子|Samsung Electronics/i] },
  { id: "semco", name: "三星电机", patterns: [/三星电机|Samsung Electro-Mechanics/i] },
  { id: "sk-hynix", name: "SK 海力士", patterns: [/海力士|SK\s?hynix/i] },
  { id: "tankeblue", name: "天科合达", patterns: [/天科合达|tankeblue/i] },
  { id: "sicc", name: "天岳先进", patterns: [/天岳先进|\bSICC\b/i] },
  { id: "wolfspeed", name: "Wolfspeed", patterns: [/wolfspeed/i] },
  { id: "dacheng", name: "大成精密", patterns: [/大成精密/i] },
  { id: "shuangyuan", name: "双元科技", patterns: [/双元科技/i] },
  { id: "unicomp", name: "日联科技", patterns: [/日联科技|unicomp/i] },
  { id: "zhengye", name: "正业科技", patterns: [/正业科技/i] },
  { id: "opt", name: "奥普特", patterns: [/奥普特/i] },
  { id: "luster", name: "凌云光", patterns: [/凌云光/i] },
  { id: "tztek", name: "天准科技", patterns: [/天准科技|tztek/i] },
  { id: "jingce", name: "精测电子", patterns: [/精测电子/i] },
  { id: "skyverse", name: "中科飞测", patterns: [/中科飞测|skyverse/i] },
  { id: "kla", name: "KLA", patterns: [/\bKLA\b|科磊/i] },
  { id: "thermo-fisher", name: "赛默飞", patterns: [/赛默飞|thermo\s?fisher/i] },
  { id: "keyence", name: "基恩士", patterns: [/基恩士|keyence/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "catl", domains: ["catl.com"] },
  { entityId: "eve", domains: ["evebattery.com"] },
  { entityId: "gotion", domains: ["gotion.com.cn"] },
  { entityId: "calb", domains: ["calb-tech.com"] },
  { entityId: "sunwoda", domains: ["sunwoda.com"] },
  { entityId: "svolt", domains: ["svolt.cn"] },
  { entityId: "lges", domains: ["lgensol.com"] },
  { entityId: "panasonic", domains: ["panasonic.com"] },
  { entityId: "lead", domains: ["leadintelligent.com"] },
  { entityId: "putailai", domains: ["putailai.com"] },
  { entityId: "semcorp", domains: ["semcorp.com"] },
  { entityId: "senior", domains: ["senior798.com"] },
  { entityId: "unicomp", domains: ["unicomp.cn"] },
  { entityId: "zhengye", domains: ["zhengyee.com"] },
  { entityId: "luster", domains: ["lusterinc.com"] },
  { entityId: "tztek", domains: ["tztek.com"] },
  { entityId: "skyverse", domains: ["skyverse.cn"] },
  { entityId: "kla", domains: ["kla.com"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [];
