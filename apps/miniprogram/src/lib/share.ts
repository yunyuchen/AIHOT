// 分享卡片（标题、路径、图）。条目页“分享给同事”、日报“分享日报”是 open-type 为 share 的按钮，和右上角菜单走页面同一个
// useShareAppMessage 回调；回调里用页面已经拿到的 share 字段当场算出来，不在分享时临时请求。不定义朋友圈分享，事件页不分享。
// 五个 tab 页的右上角转发按 D27 转发小程序本身（指向精选、标题是小程序名、包里的兜底图）。
// 纯函数，tests/ 里直接跑；接上 useShareAppMessage、兜底图和分享图预检的是 use-share.ts。
import type { MiniprogramDaily } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../../config/boards";
import type { DailyScreen } from "./daily";
import type { ItemScreen } from "./item";
import { dailyIssuePage, itemPage, type DrillTarget } from "./page-stack.ts";

export interface SharePayload {
  title: string;
  /** 以 / 开头的完整路径。 */
  path: string;
  /** 远程分享图的绝对地址，或包里兜底图的代码包路径。 */
  imageUrl: string;
}

/** 和页面内容无关的部分。 */
export interface ShareBasis {
  /** 小程序名：tab 页转发和拿不到内容时的标题。 */
  appName: string;
  /** 包里的 5:4 兜底图（纯品牌图，不带“AI 摘要”字样）的代码包路径。 */
  fallbackImage: string;
  /** 这张分享图预检时拿不到（403 占位、404、503 出图失败），改用兜底图。 */
  imageFailed: (url: string) => boolean;
}

/** 精选 tab：D27 的转发都指向它（也是 app.config 的第一个页面）。 */
export const FEED_PATH = "/pages/feed/index";

/** 转发小程序本身（D27）：五个 tab 页的右上角菜单，以及没有可分享内容的下钻页（参数不对、已下线或不存在、没有这一期）。 */
export function appShare(basis: ShareBasis): SharePayload {
  return { title: basis.appName, path: FEED_PATH, imageUrl: basis.fallbackImage };
}

/** 接口 share 字段里能用的部分：title 是非空字符串、imageUrl 是 http(s) 绝对地址才用，缺了或形状不对的那一项是 null。 */
export function shareFields(value: unknown): { title: string | null; imageUrl: string | null } {
  const share = value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const title = typeof share.title === "string" && share.title.trim() !== "" ? share.title.trim() : null;
  const imageUrl = typeof share.imageUrl === "string" && /^https?:\/\/\S+$/.test(share.imageUrl) ? share.imageUrl : null;
  return { title, imageUrl };
}

/**
 * 分享图预检（HEAD 一次）的结论：回了 4xx、5xx（占位 403、撤稿 404、出图失败 503）算拿不到，改用兜底图。
 * 没拿到响应（status 为 null：连不上、超时、分享图的域名不在 request 合法域名里）不下结论，照样用远程图：
 * 微信拉分享卡片的图不走小程序的合法域名，预检自己失败不说明图坏了。
 */
export function probeFailed(status: number | null): boolean {
  return status !== null && status >= 400;
}

/** 分享图：接口给了、并且预检没说拿不到，就用远程的 5:4 分享图，否则用包里的兜底图。 */
export function shareImage(imageUrl: string | null, basis: ShareBasis): string {
  return imageUrl !== null && !basis.imageFailed(imageUrl) ? imageUrl : basis.fallbackImage;
}

/**
 * 条目页的分享。有内容时：标题用 share.title（缺了用条目标题），路径是这条的条目页（board、id），图按 shareImage。
 * 参数不对、已下线或不存在：转发小程序本身。占位（403）、加载中、加载失败：路径仍是这条的条目页（占位结束后点开就是它），
 * 标题用小程序名、图用兜底图（这时手上没有标题和分享图，也不能把占位期间的内容发出去）。
 */
export function itemShare(target: DrillTarget | null, screen: ItemScreen, basis: ShareBasis): SharePayload {
  if (!target || screen.kind === "missing") return appShare(basis);
  if (screen.kind !== "content") return { title: basis.appName, path: itemPage(target.board, target.id), imageUrl: basis.fallbackImage };
  const share = shareFields(screen.item.share);
  return { title: share.title ?? screen.item.title, path: itemPage(target.board, screen.item.id), imageUrl: shareImage(share.imageUrl, basis) };
}

/**
 * 一期日报的分享（日报 tab 的“分享日报”、某期日报页的按钮和右上角菜单）：路径一律是那一期的某期日报页，日报 tab 分享最新一期
 * 时也用那一期的日期。有内容时标题用 share.title（缺了按接口的写法拼“日报名 M 月 D 日：头条”），图按 shareImage。
 * date 是正在看的那一期（null 是最新一期、还不知道日期）。没有这一期（404、日期不对）、配置有误、没有日报栏目：转发小程序本身；
 * 占位、加载中、加载失败：知道日期时路径仍是那一期，标题用小程序名、图用兜底图，不知道日期时转发小程序本身。
 */
export function issueShare(board: BoardKey, date: string | null, screen: DailyScreen, basis: ShareBasis): SharePayload {
  if (screen.kind === "content") {
    const { daily } = screen;
    const share = shareFields(daily.share);
    return { title: share.title ?? dailyTitle(daily), path: dailyIssuePage(board, daily.date), imageUrl: shareImage(share.imageUrl, basis) };
  }
  if (date === null || screen.kind === "missing" || screen.kind === "mismatch" || screen.kind === "off") return appShare(basis);
  return { title: basis.appName, path: dailyIssuePage(board, date), imageUrl: basis.fallbackImage };
}

/** share.title 缺了时的日报标题，和接口的写法一致：“锐奇制造日报 10 月 16 日：头条标题”（没有头条时不带冒号后面）。 */
function dailyTitle(daily: MiniprogramDaily): string {
  const [, month, day] = daily.date.split("-");
  const headline = daily.lead?.title.trim() || daily.highlights?.[0]?.title || "";
  return `${daily.title} ${Number(month)} 月 ${Number(day)} 日${headline ? `：${headline}` : ""}`;
}

/**
 * tab 页的分享回调：右上角菜单（from 为 menu）一律转发小程序本身（D27）；日报 tab 头条卡的“分享日报”按钮（from 为 button）
 * 分享正在看的那一期。按钮只在有内容时画，issue 为 null 时也退回转发小程序本身。
 */
export function tabShare(from: string | undefined, issue: SharePayload | null, basis: ShareBasis): SharePayload {
  return from === "button" && issue ? issue : appShare(basis);
}
