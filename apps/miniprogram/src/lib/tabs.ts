// 原生 tabBar 和 app.config 的页面表，按构建期配置的板块列表推出来：src/app.config.ts 用它，板块列表和 tabBar 只有这一处来源，
// 备用构建（--mode prod-no-sports）去掉运动健康板块时，运动健康 tab 和它的页面一起少掉。纯函数，tests/ 里直接跑。
// app.config.ts 只在构建时求值，这个文件不进小程序的包。
import type { BoardConfig, BoardTab } from "../../config/boards";

export interface TabConfig {
  key: BoardTab | "saved" | "reechi";
  pagePath: string;
  /** tabBar 上的字，静态配置，不随整改开关变化。 */
  text: string;
}

/** 五个 tab，顺序固定（规格：精选、日报、运动健康、收藏、锐奇）。图标是 src/assets/tab/{key}.png 和 {key}-on.png。 */
export const TABS: readonly TabConfig[] = [
  { key: "feed", pagePath: "pages/feed/index", text: "精选" },
  { key: "daily", pagePath: "pages/daily/index", text: "日报" },
  { key: "sports", pagePath: "pages/sports/index", text: "运动健康" },
  { key: "saved", pagePath: "pages/saved/index", text: "收藏" },
  { key: "reechi", pagePath: "pages/reechi/index", text: "锐奇" },
];

/** 由板块供内容的 tab：要有板块的 tabs 包含它才出现。收藏和锐奇不靠板块，一直在。 */
const BOARD_TABS: readonly string[] = ["feed", "daily", "sports"] satisfies BoardTab[];

/** 下钻页，排在 tab 页后面：文档、条目、事件、某期日报。 */
export const DRILL_PAGES = ["pages/doc/index", "pages/item/index", "pages/story/index", "pages/daily-issue/index"] as const;

/** 这份板块列表出现哪些 tab，顺序照 TABS。 */
export function appTabs(boards: readonly Pick<BoardConfig, "tabs">[]): TabConfig[] {
  return TABS.filter((tab) => !BOARD_TABS.includes(tab.key) || boards.some((board) => (board.tabs as string[]).includes(tab.key)));
}

/** app.config 的 pages：tab 页按 tabBar 的顺序（第一个是首页，即精选），再接下钻页。不出现的 tab 页不编译、不进包。 */
export function appPages(boards: readonly Pick<BoardConfig, "tabs">[]): string[] {
  return [...appTabs(boards).map((tab) => tab.pagePath), ...DRILL_PAGES];
}
