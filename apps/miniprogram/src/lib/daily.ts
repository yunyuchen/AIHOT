// 日报（日报 tab 和某期日报页共用）：响应的核对、请求路径、翻期和刷新的状态、整屏状态和显示规则。
// 纯逻辑，不依赖微信运行时：请求和快照读写由调用方注入，tests/ 里用假的直接跑；接上 getJson、本机存储和 React 状态的是 use-daily.ts。
// 只有最新一期（dailies/latest）写本机快照 snap.v1.{board}.daily，某期日报不存（规格）。
import type { MiniprogramDaily, MiniprogramDailyEntry, MiniprogramDailySection } from "@aihot/contracts/miniprogram";
import { headerDate } from "./beijing.ts";
import { categoryChip, FALLBACK_CATEGORY_COLOR } from "./card.ts";
import type { Failure } from "./errors";
import { isFresh } from "./fresh.ts";
import type { MetaState } from "./meta.ts";
import type { Result } from "./request";
import { boardGate, type GateScreen } from "./screen.ts";

/** 日报的固定文案（规格“空态、错误态”“AI 标识呈现”）。 */
export const DAILY_COPY = {
  /** 出刊时刻，头部读数和页尾说明用。 */
  issueTime: "08:00",
  /** 页尾，前面一个“AI 摘要”。 */
  note: "日报由模型根据前一日 08:00 至当日 08:00 的精选内容整理，每日 08:00 出刊",
  /** 最新一期回 404。 */
  firstPending: "首期日报尚未发布，每日 08:00 出刊",
  /** 某一期回 404（或某期日报页的日期不对）。 */
  noIssue: "该日期暂无日报",
  latest: "查看最新一期",
  /** 零条的一期。 */
  empty: "本期暂无条目",
  /** 元信息说这个板块没有日报栏目。 */
  off: "本板块不提供日报",
  /** 快讯节的节名。 */
  flashes: "快讯",
} as const;

/** dailies/latest 或 dailies/{date}。 */
export function dailyPath(date: string | null): string {
  return date === null ? "dailies/latest" : `dailies/${encodeURIComponent(date)}`;
}

/** 形状大体对、schemaVersion 是 1 才收下，否则回 null（按响应形状不对处理）。highlights 和 share 这里不用，不核对。 */
export function checkDaily(data: unknown): MiniprogramDaily | null {
  const daily = data as Partial<MiniprogramDaily> | null;
  if (!daily || typeof daily !== "object" || daily.schemaVersion !== 1) return null;
  if (typeof daily.date !== "string" || typeof daily.title !== "string") return null;
  const lead = daily.lead;
  if (lead !== null && (!lead || typeof lead !== "object" || typeof lead.title !== "string" || typeof lead.paragraph !== "string")) return null;
  if (!Array.isArray(daily.sections) || !daily.sections.every(isSection)) return null;
  if (!Array.isArray(daily.flashes) || !daily.flashes.every(isEntry)) return null;
  if ((daily.prev !== null && typeof daily.prev !== "string") || (daily.next !== null && typeof daily.next !== "string")) return null;
  if (!daily.ai || typeof daily.ai !== "object") return null;
  return daily as MiniprogramDaily;
}

function isSection(value: unknown): boolean {
  const section = value as Partial<MiniprogramDailySection> | null;
  return (
    !!section &&
    typeof section === "object" &&
    typeof section.label === "string" &&
    Array.isArray(section.categories) &&
    Array.isArray(section.items) &&
    section.items.every(isEntry)
  );
}

function isEntry(value: unknown): boolean {
  const entry = value as Partial<MiniprogramDailyEntry> | null;
  return (
    !!entry &&
    typeof entry === "object" &&
    typeof entry.itemId === "string" &&
    typeof entry.title === "string" &&
    !!entry.source &&
    typeof entry.source.name === "string" &&
    !!entry.ai &&
    typeof entry.ai === "object"
  );
}

export interface DailyState {
  /** 正在看的那一期：null 是最新一期（dailies/latest），否则是那一期的日期。 */
  date: string | null;
  /** 这一期的请求：还没请求、加载中（刷新同一期时已有的内容留着）、拿到了、失败。 */
  phase: "idle" | "loading" | "ready" | "failed";
  /** 正在显示的那一期。翻到别的一期时清空（不把上一期当成这一期显示），刷新同一期时留着。 */
  daily: MiniprogramDaily | null;
  failure: Failure | null;
  /** 最新一期的日期（最近一次 latest 响应或快照）：翻回到它时按最新一期请求，又能写快照、又能按 60 秒规则刷新。 */
  latestDate: string | null;
  /** 这次会话里这一期上次成功响应的本机时刻；快照为 null。 */
  fetchedAt: number | null;
  /** 正在显示的是冷启动放上来的快照，这次会话还没刷新成功。 */
  fromSnapshot: boolean;
}

/** 某一期（date 为 null 是最新一期）的初始状态：看最新一期并且有快照时先放快照。 */
export function seedDaily(date: string | null, snapshot: MiniprogramDaily | null): DailyState {
  const empty: DailyState = { date, phase: "idle", daily: null, failure: null, latestDate: null, fetchedAt: null, fromSnapshot: false };
  if (date !== null || !snapshot) return empty;
  return { ...empty, daily: snapshot, latestDate: snapshot.date, fromSnapshot: true };
}

export type FetchDaily = (date: string | null) => Promise<Result<MiniprogramDaily>>;

/** 最新一期的本机快照（只有日报 tab 用）。 */
export interface DailySnapshot {
  /** 冷启动先显示的最新一期；没有快照为 null。 */
  initial: MiniprogramDaily | null;
  /** 最新一期成功：整份覆盖。 */
  save(daily: MiniprogramDaily): void;
  /** 回 section_paused（占位期间不留内容），或最新一期回 404：删掉。 */
  drop(): void;
}

export interface DailyStore {
  /** 重拉正在看的那一期（挂载、下拉刷新、重试）。 */
  refresh(): Promise<void>;
  /** 翻到某一期（头部的前一天、后一天）：页内切换，不开新页。翻回最新一期的日期时按最新一期请求。 */
  go(date: string): Promise<void>;
  /** 回到最新一期（“看最新一期”）。 */
  latest(): Promise<void>;
  /**
   * 切回 tab 时不强制的重拉：只管最新一期，正在加载、上次的响应还在 60 秒内就不请求；读者翻到往期时不动，留在他看的那一期。
   */
  revalidate(): Promise<void>;
}

/** 一个日报页的状态。initialDate 为 null 是最新一期。每次状态变化调 onChange；now 是本机时钟，测试里换成假的。 */
export function createDailyStore(
  fetchDaily: FetchDaily,
  initialDate: string | null,
  onChange: (state: DailyState) => void,
  now: () => number = Date.now,
  snapshot: DailySnapshot | null = null,
): DailyStore {
  let state = seedDaily(initialDate, snapshot?.initial ?? null);
  // 每次请求加一；连点翻期、被新一次请求顶掉的旧响应对不上就丢掉。
  let generation = 0;
  const set = (next: DailyState) => {
    state = next;
    onChange(state);
  };

  async function load(date: string | null) {
    const gen = ++generation;
    const same = date === state.date;
    set({ ...state, date, phase: "loading", failure: null, ...(same ? {} : { daily: null, fetchedAt: null, fromSnapshot: false }) });
    const result = await fetchDaily(date);
    if (gen !== generation) return;
    if (!result.ok) {
      if (result.failure.kind === "paused" || (date === null && result.failure.kind === "not_found")) snapshot?.drop();
      // 已显示的这一期（快照、上次的内容）不清空，页面顶部显示更新失败提示。
      return set({ ...state, phase: "failed", failure: result.failure });
    }
    const daily = result.data;
    set({ ...state, phase: "ready", daily, failure: null, fetchedAt: now(), fromSnapshot: false, latestDate: date === null ? daily.date : state.latestDate });
    if (date === null) snapshot?.save(daily);
  }

  return {
    refresh: () => load(state.date),
    go: (date) => load(date === state.latestDate ? null : date),
    latest: () => load(null),
    async revalidate() {
      if (state.date !== null || state.phase === "loading") return;
      if (state.phase === "ready" && state.fetchedAt !== null && isFresh(state.fetchedAt, null, now())) return;
      return load(null);
    },
  };
}

export type DailyScreen =
  | GateScreen
  /** 元信息说这个板块没有日报栏目（运动健康）。 */
  | { kind: "off" }
  /** 404：最新一期暂未发布，某一期暂无日报并可查看最新一期。 */
  | { kind: "missing"; latest: boolean }
  /** 还没有内容时连不上、超时、503、形状不对：加载失败加重试。 */
  | { kind: "failed"; failure: Failure }
  | { kind: "loading" }
  | {
      kind: "content";
      daily: MiniprogramDaily;
      /** 有内容时刷新失败：顶部显示更新失败提示，可点击重试。 */
      stale: Failure | null;
      /** 还是冷启动放上来的快照、刷新还没回来：头部标上快照的 generatedAt。有 stale 时不标。 */
      snapshotAt: string | null;
    };

/**
 * 日报页整屏显示哪种状态，优先级从高到低：配置有误、占位（screen.ts 的 boardGate，日报回 section_paused 也算）、
 * 没有日报栏目、404、加载失败、加载中、内容（哪怕是快照）。元信息自己失败不挡日报：日报照常请求、照常显示。
 */
export function dailyScreen(meta: MetaState, state: DailyState): DailyScreen {
  const gate = boardGate(meta, state.failure);
  if (gate) return gate;
  if (meta.status === "ready" && meta.meta.columns?.daily === false) return { kind: "off" };
  const failure = state.phase === "failed" ? state.failure : null;
  if (failure?.kind === "not_found") return { kind: "missing", latest: state.date === null };
  if (!state.daily) return failure ? { kind: "failed", failure } : { kind: "loading" };
  return { kind: "content", daily: state.daily, stale: failure, snapshotAt: state.fromSnapshot && !failure ? state.daily.generatedAt : null };
}

export interface DailyLine {
  key: string;
  itemId: string;
  title: string;
  source: string;
}

export interface DailySectionView {
  key: string;
  label: string;
  /** 节名前圆点的颜色（categories 的第一个 key 配色，不认识或没有时兜底灰）；null 是快讯节，画空心圈。 */
  color: string | null;
  count: number;
  /** 节标题旁标一次“AI 摘要”：节里任一条目的标题是模型写的。节名不是模型写的，不因它标。 */
  ai: boolean;
  lines: DailyLine[];
}

export interface DailyView {
  /** 头部的日期和星期“10月16日”“周五”；日期不对时为 null。 */
  heading: { day: string; weekday: string } | null;
  /** 分节，快讯（flashes 非空时）是最后一节；没有条目的节不画。 */
  sections: DailySectionView[];
  /** 头部读数：分节数（含快讯节）、条数（含快讯）。 */
  sectionCount: number;
  itemCount: number;
  /**
   * 头条卡：零条的一期不画（回 null）。有条目时总有这张卡（按钮在里面）；headline 是头条和导语，没有时只剩按钮。
   * ai：头条或导语任一是模型写的，卡片右上角标一次。
   */
  lead: { headline: { title: string; paragraph: string } | null; ai: boolean } | null;
  /** 零条的一期：保留头部，不显示头条卡，显示空态。 */
  empty: boolean;
  /** 前一天、后一天；null 时按钮不能点。 */
  prev: string | null;
  next: string | null;
}

/** 日报的显示规则。colors 是构建配置的分类配色。 */
export function dailyView(daily: MiniprogramDaily, colors: Readonly<Record<string, string>>): DailyView {
  const sections: DailySectionView[] = daily.sections
    .filter((section) => section.items.length > 0)
    .map((section, i) => ({
      key: `s${i}:${section.label}`,
      label: section.label,
      color: section.categories[0] ? categoryChip(section.categories[0], {}, colors)!.color : FALLBACK_CATEGORY_COLOR,
      count: section.items.length,
      ai: section.items.some((entry) => entry.ai.title === true),
      lines: lines(section.items),
    }));
  if (daily.flashes.length > 0) {
    sections.push({
      key: "flashes",
      label: DAILY_COPY.flashes,
      color: null,
      count: daily.flashes.length,
      ai: daily.flashes.some((entry) => entry.ai.title === true),
      lines: lines(daily.flashes),
    });
  }
  const itemCount = sections.reduce((sum, section) => sum + section.count, 0);
  const title = daily.lead?.title.trim() ?? "";
  const paragraph = daily.lead?.paragraph.trim() ?? "";
  const headline = title || paragraph ? { title, paragraph } : null;
  return {
    heading: headerDate(daily.date),
    sections,
    sectionCount: sections.length,
    itemCount,
    lead: itemCount === 0 ? null : { headline, ai: headline !== null && (daily.ai.leadTitle === true || daily.ai.leadParagraph === true) },
    empty: itemCount === 0,
    prev: daily.prev,
    next: daily.next,
  };
}

function lines(entries: readonly MiniprogramDailyEntry[]): DailyLine[] {
  return entries.map((entry, i) => ({ key: `${i}:${entry.itemId}`, itemId: entry.itemId, title: entry.title, source: entry.source.name }));
}
