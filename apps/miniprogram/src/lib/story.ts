// 事件页：响应的核对、请求路径、整屏状态和显示规则。纯函数，tests/ 里直接跑；接上 getJson 和 React 状态的是 use-story.ts。
// 事件不存本机快照（规格：条目、事件、某期日报不存快照）。合并过的事件接口直接回存活的那个（id 可能和请求的不同），照常显示，不跳转。
import type { MiniprogramStory, MiniprogramStoryReport } from "@aihot/contracts/miniprogram";
import { dayClock, displayDate } from "./beijing.ts";
import type { Failure } from "./errors";
import type { DrillTarget } from "./page-stack.ts";

/** stories/{id}：id 原样编码。 */
export function storyPath(id: string): string {
  return `stories/${encodeURIComponent(id)}`;
}

/** 形状大体对、schemaVersion 是 1 才收下，否则回 null（按响应形状不对处理）。 */
export function checkStory(data: unknown): MiniprogramStory | null {
  const story = data as Partial<MiniprogramStory> | null;
  if (!story || typeof story !== "object" || story.schemaVersion !== 1) return null;
  if (typeof story.id !== "string" || typeof story.title !== "string") return null;
  if (story.digest !== null && typeof story.digest !== "string") return null;
  if (typeof story.sourceCount !== "number" || typeof story.firstReportAt !== "string" || typeof story.latestAt !== "string") return null;
  if (!Array.isArray(story.reports) || !story.reports.every(isReport)) return null;
  if (!story.ai || typeof story.ai !== "object") return null;
  return story as MiniprogramStory;
}

function isReport(value: unknown): boolean {
  const report = value as Partial<MiniprogramStoryReport> | null;
  return (
    !!report &&
    typeof report === "object" &&
    (report.itemId === null || typeof report.itemId === "string") &&
    typeof report.title === "string" &&
    !!report.source &&
    typeof report.source.name === "string" &&
    typeof report.publishedAt === "string" &&
    !!report.ai &&
    typeof report.ai === "object"
  );
}

/**
 * 一次请求的结果。story 是正在显示的事件：下拉刷新期间和刷新失败时留着（failure 是这次失败的原因），
 * 重试、下拉刷新回 404 或占位时按整屏状态走。
 */
export interface StoryLoad {
  phase: "loading" | "ready" | "failed";
  story: MiniprogramStory | null;
  failure: Failure | null;
}

export type StoryScreen =
  /** “已下线或不存在”：接口回 404，或者页面参数不对（没有 id、板块认不出来）。 */
  | { kind: "missing" }
  /** 整改开关为占位（403 section_paused）：显示和精选 tab 一样的占位文案，不算错误；手上有内容也不显示。 */
  | { kind: "placeholder" }
  /** 还没有内容时连不上、超时、503、形状不对：加载失败加重试。 */
  | { kind: "failed"; failure: Failure }
  | { kind: "loading" }
  /** stale：有内容时下拉刷新失败了，顶部提示“网络不好”，点一下重试。 */
  | { kind: "content"; story: MiniprogramStory; stale: Failure | null };

/** 事件页整屏显示哪种状态。target 为 null 时不发请求，直接“已下线或不存在”。 */
export function storyScreen(target: DrillTarget | null, load: StoryLoad): StoryScreen {
  if (!target) return { kind: "missing" };
  const failure = load.phase === "failed" ? load.failure : null;
  if (failure?.kind === "not_found") return { kind: "missing" };
  if (failure?.kind === "paused") return { kind: "placeholder" };
  if (!load.story) return failure ? { kind: "failed", failure } : { kind: "loading" };
  return { kind: "content", story: load.story, stale: failure };
}

/** “N 家在报”后面的圆点最多几个（同卡片）。 */
const MAX_DOTS = 5;

export interface ReportView {
  key: string;
  /** 有条目页才能点；null 不能点。 */
  itemId: string | null;
  title: string;
  source: string;
  /** 只取 publishedAt 的北京日期（规格：事件页报道行只要日期）。 */
  date: string;
  /** 第一条“首报”，最后一条（不止一条时）“最新”。 */
  tag: "首报" | "最新" | null;
  /** 最新的一条：节点是星青实心圈，往下接虚线。 */
  latest: boolean;
}

export interface StoryView {
  /** 事件层级的“N 家在报”和圆点数，至少 1。 */
  echo: { label: string; dots: number };
  /** 头部“首报 MM-DD HH:mm | 最新 MM-DD HH:mm”；解析不了时为空字符串，不显示那一格。 */
  first: string;
  latest: string;
  /** 标题旁的“AI 摘要”（事件来源是 model、replay、manual 时接口给真）。 */
  titleAi: boolean;
  /** “事件综述”：没有内容整块不显示；ai 按 ai.digest 标。 */
  digest: { text: string; ai: boolean } | null;
  /** “谁在报，怎么说”块标题旁标一次：任一报道的标题是模型写的。 */
  reportsAi: boolean;
  /** 从早到晚。 */
  reports: ReportView[];
}

/** 事件页的显示规则。 */
export function storyView(story: MiniprogramStory, now: number | string | Date): StoryView {
  const count = Math.max(1, Math.floor(story.sourceCount) || 1);
  const digest = story.digest?.trim() ?? "";
  const reports = timeline(story.reports);
  return {
    echo: { label: `${count} 家在报`, dots: Math.min(count, MAX_DOTS) },
    first: dayClock(story.firstReportAt, now),
    latest: dayClock(story.latestAt, now),
    titleAi: story.ai.title === true,
    digest: digest ? { text: digest, ai: story.ai.digest === true } : null,
    reportsAi: story.reports.some((report) => report.ai.title === true),
    reports: reports.map((report, i) => {
      const last = i === reports.length - 1;
      return {
        key: `${i}:${report.itemId ?? ""}:${report.publishedAt}`,
        itemId: typeof report.itemId === "string" && report.itemId !== "" ? report.itemId : null,
        title: report.title,
        source: report.source.name,
        date: displayDate(report.publishedAt, now),
        tag: i === 0 ? "首报" : last ? "最新" : null,
        latest: last,
      };
    }),
  };
}

/** 报道按发布时间从早到晚（接口已经排好，这里再守一道）；同一时刻保持接口的顺序，解析不了的时刻排到最后。 */
export function timeline(reports: readonly MiniprogramStoryReport[]): MiniprogramStoryReport[] {
  const at = (report: MiniprogramStoryReport) => {
    const ms = Date.parse(report.publishedAt);
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  };
  return reports
    .map((report, index) => ({ report, index, at: at(report) }))
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at < b.at ? -1 : 1))
    .map(({ report }) => report);
}
