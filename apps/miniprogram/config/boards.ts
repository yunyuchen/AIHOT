// 构建期配置的形状：开发、体验、正式三份（boards.dev.ts、boards.trial.ts、boards.prod.ts）各写一份，
// config/index.ts 按 --mode 选一份（见 modes.ts），经 defineConstants 注入成全局常量 BUILD_CONFIG。
// 这里放类型和两个板块三份共用的部分（除了 api 基址都一样）。tabBar 和页面由 src/app.config.ts 按板块列表推出来（src/lib/tabs.ts）。
// 小程序代码只 import type，不会把这个文件打进包里。

/** 板块 key：写进分享路径和收藏记录，上线后不改。 */
export type BoardKey = "manufacturing" | "sports";

/** 板块所在的 tab。制造供“精选”和“日报”两个 tab，运动健康供“运动健康” tab。 */
export type BoardTab = "feed" | "daily" | "sports";

export interface BoardConfig {
  key: BoardKey;
  /** 该行业实例的地址，不带末尾斜杠；请求拼成 {apiBase}/api/mp/v1/…。体验版和正式版必须是 HTTPS。 */
  apiBase: string;
  /** 板块名的兜底值，运行时以元信息的 board.name 为准。 */
  name: string;
  tabs: BoardTab[];
  /** 精选流是否渲染焦点卡：制造是，运动健康否。 */
  focusCard: boolean;
  /** 精选流的分类筛选条：读取元信息 categories，加“全部”。 */
  filterBar: boolean;
  /**
   * 按天看的精选流（运动健康）：一律按天分段，卡片不显示时刻。
   * 为 false 时（制造）今天按凌晨、上午、下午、晚间分段，卡片显示时刻。
   */
  byDay: boolean;
  /** 分类 key → 色标颜色。分类名从元信息读；不在表里的 key 用 FALLBACK_CATEGORY_COLOR。 */
  categoryColors: Readonly<Record<string, string>>;
  /**
   * “提醒我明天的日报”的一次性订阅模板 id，只有有日报的板块（制造）配，必须和该行业实例的 WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID
   * 一字不差（对不上接口回 400）。空字符串或不写时日报 tab 不画提醒按钮（没有可订阅的模板）。
   */
  reminderTemplateId?: string;
}

export interface BuildConfig {
  env: "dev" | "trial" | "prod";
  /** 小程序名，tab 页标题和品牌字样用。 */
  appName: string;
  /** 板块列表，顺序固定。 */
  boards: BoardConfig[];
}

/** 不认识的分类 key 用的兜底灰。 */
export const FALLBACK_CATEGORY_COLOR = "#8a959e";

/** 制造的分类配色，取原型 A 版的色值；key 和行业包 industry/taxonomy.ts 的分类一致。 */
export const MANUFACTURING_CATEGORY_COLORS = {
  battery: "#ff7a45",
  "energy-storage": "#1fb57a",
  semiconductor: "#3b7bf6",
  "film-materials": "#8f6cf6",
  inspection: "#2ce2e8",
  policy: "#13191c",
  industry: "#8a959e",
} as const;

/**
 * 运动健康的分类配色：key 取行业包 industry-packs/sports/taxonomy.ts 的草案分类（A 版）。老板还没确认分类（待定 D3），
 * 确认前一律用兜底灰；D3 定下来后按确认的 key 补色（换了 key 就连 key 一起换）。分类名始终从元信息读，不用发版。
 */
export const SPORTS_CATEGORY_COLORS = {
  "work-health": FALLBACK_CATEGORY_COLOR,
  fitness: FALLBACK_CATEGORY_COLOR,
  events: FALLBACK_CATEGORY_COLOR,
  nutrition: FALLBACK_CATEGORY_COLOR,
  sleep: FALLBACK_CATEGORY_COLOR,
  general: FALLBACK_CATEGORY_COLOR,
} as const;

/** 制造板块：除了 api 基址，三份构建期配置都一样。 */
export const MANUFACTURING_BOARD = {
  key: "manufacturing",
  name: "制造",
  tabs: ["feed", "daily"],
  focusCard: true,
  filterBar: true,
  byDay: false,
  categoryColors: MANUFACTURING_CATEGORY_COLORS,
} satisfies Omit<BoardConfig, "apiBase">;

/** 运动健康板块：轻量板块，只有精选流和事件页，没有日报和焦点卡。 */
export const SPORTS_BOARD = {
  key: "sports",
  name: "运动健康",
  tabs: ["sports"],
  focusCard: false,
  filterBar: true,
  byDay: true,
  categoryColors: SPORTS_CATEGORY_COLORS,
} satisfies Omit<BoardConfig, "apiBase">;

/** 去掉一个板块的构建期配置（备用构建去掉运动健康，见 modes.ts）。 */
export function dropBoard(config: BuildConfig, key: BoardKey): BuildConfig {
  return { ...config, boards: config.boards.filter((board) => board.key !== key) };
}
