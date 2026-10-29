// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "锐奇制造日报",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "制造",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "锐奇制造日报 — 锂电、半导体、薄膜等制造业动态 · 每日精选与热点",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "汇集锂电、储能、半导体、薄膜等制造行业资讯，由模型生成摘要、评分与精选，归并同一事件的多篇报道，每日发布日报。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "值得关注的制造动态",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 reechi_get_latest、reechi_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "reechi",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: null as string | null,
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "锐奇制造日报",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "ReechiHotBot",
} as const;

/**
 * 小程序里的板块：一个行业实例供一个板块，经小程序出口的元信息（/api/mp/v1/meta）交给小程序。
 * key 和 name 也写在小程序的构建配置里，两边要一致；key 上线后不要改。
 */
export const BOARD = {
  /** 板块 key（小写字母），小程序按它对上构建配置里的板块。 */
  key: "manufacturing",
  /** 板块名：小程序的 tab 和页面上用，不从站名推。 */
  name: "制造",
  /** 小程序名：给小程序的 5:4 分享图左上角的品牌字样。所有板块写同一个名字。 */
  appName: "锐奇微报",
  /** 板块的一句话说明。 */
  description: "锂电、储能、半导体、薄膜等制造行业的每日精选、事件和日报。",
  /** 整改开关切到占位时显示的文案（选填），null 时小程序用内置文案。 */
  placeholder: null as null | { title: string; body: string },
  notice: {
    /** 板块页脚的一行声明（选填），用“本板块”的说法。 */
    footer: null as string | null,
    /**
     * 心理援助热线（选填）：label 是文案，number 是号码（由人核对官方公布的号码后写入，不由模型写），
     * categories 是在哪些分类的卡片和条目页上显示它（分类 key 见 taxonomy.ts）。
     */
    hotline: null as null | { label: string; number: string; categories: string[] },
  },
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["关注制造业动态，", "精选每日重点资讯。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 汇集 {sources} 个信源的资讯，经采集、归并、评分与筛选，每日 08:00 发布日报。免费阅读，无需注册。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "定期采集政府与协会网站、行业媒体、企业官网及交易所公告。",
    store: "保存采集内容，归并同一事件的多篇报道，并根据独立来源数量计算事件热度。",
    select: "模型评估行业相关性和信息价值，生成中文标题、摘要与推荐理由，过滤营销内容和重复转发。",
    publish: "每日 08:00 发布日报，每周一发布周报，每月 1 日发布月报；重点精选可推送至飞书群。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** 主题目录（/topics）三个分组的名字和简介。key 固定为 company、field、genre（数据库里有约束），名字和简介可以改。 */
export const TOPIC_GROUPS = [
  { key: "company", name: "公司与机构", blurb: "追踪公司扩产、工艺调整与订单进展" },
  { key: "field", name: "行业与工艺", blurb: "按行业与工艺环节浏览：锂电、半导体、薄膜，以及测厚、X 射线、视觉检测" },
  { key: "genre", name: "消息类型", blurb: "按类型浏览：扩产、工艺、质量安全、政策标准等" },
] as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}

/** 站名加“AI 日报”，比如“MyHOT AI 日报”。站名本身已经以这个词结尾时不再重复。 */
export function siteDaily(): string {
  const daily = withSubject("日报");
  return SITE.name.endsWith(daily) ? SITE.name : `${SITE.name} ${daily}`;
}
