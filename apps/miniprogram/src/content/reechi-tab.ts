// 锐奇 tab 的文案，来自 docs/drafts/compliance/reechi-tab-copy.md（v0.2，草稿，待客户确认）。
// 一句话介绍、关于锐奇、产品与案例、联系我们按锐奇官网填好了（每个说法都有官网原文，要客户确认的事列在草稿第 4 节后面）；
// 反馈与侵权投诉里的方括号还是草稿原样的占位，上线前由提审准备的票换成客户给的内容；页面上不能留方括号。
// 纯文本，不引 Taro。

/** 联系方式的一行。call 点了拨号，copy 点了复制；值还是占位时按钮禁用。 */
export interface ContactLine {
  label: string;
  value: string;
  /** 跟在值后面的说明，比如接听时间。 */
  note?: string;
  action: "call" | "copy";
  icon: "phone" | "mail" | "pin" | "chat";
}

export const REECHI_NAME = "锐奇";

export const REECHI_LEAD = "为锂电、泛半导体和薄膜产线提供测厚、面密度、3D 轮廓和 X 射线成像检测设备";

/** 关于锐奇：两到三段。 */
export const REECHI_ABOUT: string[] = [
  "常州锐奇精密测量技术有限公司 2017 年成立，在常州武进国家高新区，做工业产线上的精密测量与检测设备。产品线有 X/β 射线面密度和测厚，激光、光谱共焦和光学干涉测厚，3D 光学轮廓，X 射线成像检测，以及近红外水分和测厚。",
  "锐奇 2017 年从锂电的 X 射线测厚仪起步。X/β 射线面密度仪、激光测厚仪和射线激光一体机用在极片涂布、辊压、隔膜和铜箔工序，在线测面密度、厚度和涂布削薄区；3D 线光谱轮廓仪检测密封钉焊接缺陷和极耳焊印。",
  "泛半导体和精密陶瓷方面，测碳化硅等晶圆的厚度、TTV 和翘曲，静电卡盘凸点的共面度，MLCC 流延涂层的面密度。薄膜卷材方面，给塑料薄膜、PI 膜、无纺布和胶带涂层做在线面密度和厚度测量。设备已出口美国、德国、韩国、日本、印度等地。",
];

/** 产品与案例：建议 2 到 4 项。配图可选，每张 100KB 以内，整页合计 600KB 以内。 */
export const REECHI_PRODUCTS: { name: string; text: string }[] = [
  { name: "X 射线全检面密度仪", text: "锂电涂布：全幅宽在线测极片面密度，不再靠 Z 字形扫描抽检，削薄区也能测。" },
  { name: "双层涂布分层测量", text: "硅碳负极双层涂布：X、β 双射线同点扫描，分别算出上下层面密度，不只看总量。" },
  { name: "晶圆与陶瓷件测量", text: "碳化硅等晶圆、静电卡盘、陶瓷基板：光谱共焦对射测厚度、TTV、平面度和翘曲。" },
  { name: "超薄膜面密度", text: "隔膜、PI 膜等超薄材料：用 5keV 低能 X 射线在线测面密度和厚度。" },
];

export const REECHI_CONTACTS: ContactLine[] = [
  { label: "电话", value: "0519-85180560", action: "call", icon: "phone" },
  { label: "400 热线", value: "400-800-3126", action: "call", icon: "phone" },
  { label: "邮箱", value: "peter@reechitech.cn", action: "copy", icon: "mail" },
  { label: "地址", value: "江苏省常州市武进国家高新技术产业开发区武宜南路377号22幢", action: "copy", icon: "pin" },
];

/** 反馈与侵权投诉：就在本页内，不另开页面，不放表单。 */
export const FEEDBACK_INTRO = "摘要写错、分类不对，或者内容侵犯了你的权利，请联系我们：";

export const FEEDBACK_CONTACTS: ContactLine[] = [
  { label: "邮箱", value: "[侵权投诉邮箱，待客户填]", action: "copy", icon: "mail" },
  { label: "电话", value: "[侵权投诉电话，待客户填]", note: "[接听时间，待客户填]", action: "call", icon: "phone" },
  // 可以是邮箱也可以是电话，复制两种都用得上。
  { label: "违法和不良信息举报", value: "[邮箱 / 电话，待客户填，可与上面相同]", action: "copy", icon: "chat" },
];

export const FEEDBACK_HANDLING =
  "请说明是哪一条内容（标题或截图），以及希望怎么处理（更正、只显示摘要或撤下）。处理时限：[D14：待客户定，建议 3 个工作日内响应]。";
