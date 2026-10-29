// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。
// 运动健康行业实例的网页是否对外还没定（规格待定 D11），站名目前只在后台、RSS 和日报名里出现；读者在小程序里看到的是板块名（BOARD）。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "锐奇运动健康",
  /**
   * 行业词：拼进默认说法里，比如“AI 日报”“AI 动态”。
   * 改成“法律”“HR”“黄金”之类，页面上就会变成“法律日报”“法律动态”。
   */
  subject: "运动健康",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "锐奇运动健康 — 健康生活与大众运动 · 每日精选",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "汇集官方机构和主流媒体的健康生活与大众运动资讯，由模型生成摘要、评分与精选，归并同一事件的多篇报道，每日精选约十条。不做诊疗建议，不推荐药品和保健品。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "健康生活与大众运动精选",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 reechi_sports_get_latest、reechi_sports_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "reechi_sports",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。 */
  footerNote: null as string | null,
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "锐奇运动健康",
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
  key: "sports",
  /** 板块名：小程序的 tab 和页面上用，不从站名推。 */
  name: "运动健康",
  /** 小程序名：给小程序的 5:4 分享图左上角的品牌字样。所有板块写同一个名字。 */
  appName: "锐奇微报",
  /** 板块的一句话说明。 */
  description: "健康生活与大众运动资讯，每日精选约十条。不做诊疗建议，不推荐药品和保健品。",
  /** 整改开关切到占位时显示的文案（选填），null 时小程序用内置文案。 */
  placeholder: { title: "本板块调整中", body: "暂不提供内容，其他板块正常开放。" } as null | { title: string; body: string },
  notice: {
    /** 板块页脚的一行声明（选填），用“本板块”的说法。 */
    footer: "本板块为健康生活资讯，标题与摘要由 AI 生成，以原文为准，不构成医疗建议；身体不适请及时就医。" as string | null,
    /**
     * 心理援助热线（选填）：label 是文案，number 是号码（由人核对官方公布的号码后写入，不由模型写），
     * categories 是在哪些分类的卡片和条目页上显示它（分类 key 见 taxonomy.ts）。
     * 号码在人工核对前留空（票 27 核对后写入）；显示在哪些分类随 D3 确认，确认前按草案推荐的“睡眠与心理”。
     */
    hotline: { label: "心理援助热线", number: "", categories: ["sleep"] } as null | { label: string; number: string; categories: string[] },
  },
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["关注健康生活，", "精选大众运动资讯。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 汇集 {sources} 个信源的资讯，经采集、归并、评分与筛选，每日精选约十条健康生活与大众运动资讯。不做诊疗建议，不推荐药品和保健品。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "定期采集疾控、卫健、体育总局等官方机构和主流媒体的健康、体育栏目，采集周期依据各信源的更新频率设置。",
    store: "保存采集内容，归并同一事件的多篇报道，并根据独立来源数量计算事件热度。",
    select: "模型评估健康生活与大众运动相关性，排除诊疗、药品、保健品及博彩竞猜内容，生成中文标题和摘要，过滤营销内容与夸大标题。",
    publish: "持续更新精选，按今日、昨日分组展示；同一事件的后续报道归并展示。",
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
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有，内容不构成医疗建议。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** 主题目录（/topics）三个分组的名字和简介。key 固定为 company、field、genre（数据库里有约束），名字和简介可以改。 */
export const TOPIC_GROUPS = [
  { key: "company", name: "机构", blurb: "追踪疾控、卫健、体育总局等官方机构发布的资讯" },
  { key: "field", name: "话题", blurb: "按话题浏览：倒班作息、久坐防护、饮食营养、科学健身、路跑赛事" },
  { key: "genre", name: "消息类型", blurb: "按类型浏览：指南政策、健康提示、研究数据、方法指导等" },
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
