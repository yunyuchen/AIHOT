// 下钻页（条目页、事件页、某期日报页）的路由、参数和跳转方式。纯函数，tests/ 里直接跑；接上 Taro 跳转的是 open-page.ts。
// 条目页（board、id）和某期日报页（date，另带 board）的路由和参数名上线后不改：分享出去的卡片、服务通知会一直留在会话里。
// 事件页同样用 board、id。
import type { BoardKey, BoardTab } from "../../config/boards";
import { headerDate } from "./beijing.ts";

export const ITEM_PAGE = "/pages/item/index";
export const STORY_PAGE = "/pages/story/index";
export const DAILY_ISSUE_PAGE = "/pages/daily-issue/index";

/** 微信的页面栈最多 10 层。在条目页和事件页之间来回点，栈里到 9 层以后改用 redirectTo（替换当前页），不再往上叠。 */
export const REDIRECT_DEPTH = 9;

/** 当前页面栈有 depth 层时，打开下钻页用哪种跳转。 */
export function navigation(depth: number): "navigateTo" | "redirectTo" {
  return depth >= REDIRECT_DEPTH ? "redirectTo" : "navigateTo";
}

/** 条目页地址：board 决定请求哪个行业实例，id 原样编码（id 是不透明字符串，小程序不解析）。 */
export function itemPage(board: BoardKey, id: string): string {
  return `${ITEM_PAGE}?board=${board}&id=${encodeURIComponent(id)}`;
}

export function storyPage(board: BoardKey, id: string): string {
  return `${STORY_PAGE}?board=${board}&id=${encodeURIComponent(id)}`;
}

/** 某期日报页地址（分享日报、服务通知、收藏里的日报都指向它）。date 是北京日期 YYYY-MM-DD。 */
export function dailyIssuePage(board: BoardKey, date: string): string {
  return `${DAILY_ISSUE_PAGE}?board=${board}&date=${encodeURIComponent(date)}`;
}

export interface DrillTarget {
  board: BoardKey;
  id: string;
}

/**
 * 下钻页的参数（useRouter().params）：board 是构建配置里有的板块、id 不是空的才算数，否则回 null（页面显示“已下线或不存在”）。
 * 微信交给页面的参数不解码，这里解一次；解不了（坏的 % 序列）就用原样，交给接口回 404。
 */
export function drillTarget(params: Readonly<Partial<Record<string, string>>>, boards: readonly string[]): DrillTarget | null {
  const board = decode(params.board ?? "");
  const id = decode(params.id ?? "");
  if (id === "" || !boards.includes(board)) return null;
  return { board: board as BoardKey, id };
}

export interface IssueTarget {
  board: BoardKey;
  date: string;
}

/**
 * 某期日报页的参数：date 是合法的北京日期 YYYY-MM-DD 才算数。board 可以不带（规格只定了 date，服务通知的 page 也可能只带 date），
 * 不带时用有日报 tab 的第一个板块；带了就得是有日报的板块。不算数时回 null（页面显示“这一天没有日报”）。
 */
export function issueTarget(params: Readonly<Partial<Record<string, string>>>, dailyBoards: readonly string[]): IssueTarget | null {
  const date = decode(params.date ?? "");
  const board = params.board === undefined ? dailyBoards[0] : decode(params.board);
  // headerDate 只认日历上有的 YYYY-MM-DD。
  if (!board || !dailyBoards.includes(board) || headerDate(date) === null) return null;
  return { board: board as BoardKey, date };
}

const TAB_HOME: Record<BoardTab, { url: string; label: string }> = {
  feed: { url: "/pages/feed/index", label: "回到精选" },
  daily: { url: "/pages/daily/index", label: "回到日报" },
  sports: { url: "/pages/sports/index", label: "回到运动健康" },
};

/** 条目“已下线或不存在”时回哪个 tab：板块所在的第一个 tab（制造回精选，运动健康回运动健康）；板块认不出来时回精选。 */
export function homeTab(tab: BoardTab | undefined): { url: string; label: string } {
  return TAB_HOME[tab ?? "feed"];
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
