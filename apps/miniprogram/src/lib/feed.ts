// 精选流：响应的核对、请求路径，和列表的分页状态（快照先显示、首页、触底追加、到底、游标失效重载），以及时间轴去掉焦点卡。
// 纯逻辑，不依赖微信运行时：请求和快照读写由调用方注入，tests/ 里用假的直接跑；接上 getJson、本机存储和 React 状态的是 use-feed.ts。
import type { MiniprogramCard, MiniprogramFeed, MiniprogramFocus } from "@aihot/contracts/miniprogram";
import type { Failure } from "./errors";
import { isFresh } from "./fresh.ts";
import type { Result } from "./request";

/** 一页几张卡（接口允许 1–40，默认 20）。 */
export const FEED_PAGE_SIZE = 20;

export interface FeedQuery {
  category: string | null;
  cursor: string | null;
  limit: number;
}

/** feed?limit=…&category=…&cursor=…：只带有值的参数，空的分类不发（分类不在表里会回 400 invalid_request）。 */
export function feedPath(query: FeedQuery): string {
  const params = [`limit=${query.limit}`];
  if (query.category) params.push(`category=${encodeURIComponent(query.category)}`);
  if (query.cursor) params.push(`cursor=${encodeURIComponent(query.cursor)}`);
  return `feed?${params.join("&")}`;
}

/**
 * 形状大体对、schemaVersion 是 1 才收下，否则回 null（按响应形状不对处理）。
 * 焦点卡形状不对（或没有这个字段）时只当没有焦点卡，不连累整页卡片。
 */
export function checkFeed(data: unknown): MiniprogramFeed | null {
  const feed = data as Partial<MiniprogramFeed> | null;
  if (!feed || typeof feed !== "object" || feed.schemaVersion !== 1) return null;
  if (!Array.isArray(feed.cards) || !feed.cards.every(isCard)) return null;
  const page = feed.page;
  if (!page || typeof page !== "object" || typeof page.hasMore !== "boolean") return null;
  if (page.nextCursor !== null && typeof page.nextCursor !== "string") return null;
  return { ...(feed as MiniprogramFeed), focus: isFocus(feed.focus) ? feed.focus : null };
}

function isFocus(value: unknown): value is MiniprogramFocus {
  const focus = value as Partial<MiniprogramFocus> | null;
  return isCard(focus) && Array.isArray(focus!.sourceNames) && typeof focus!.latestAt === "string";
}

function isCard(value: unknown): boolean {
  const card = value as Partial<MiniprogramCard> | null;
  return (
    !!card &&
    typeof card === "object" &&
    typeof card.id === "string" &&
    typeof card.title === "string" &&
    typeof card.anchorAt === "string" &&
    !!card.source &&
    typeof card.source === "object" &&
    !!card.ai &&
    typeof card.ai === "object"
  );
}

export interface FeedState {
  /** 第一页：还没请求、加载中（重载时已有的第一页卡片留着）、拿到了、失败。 */
  phase: "idle" | "loading" | "ready" | "failed";
  /** 按时间倒序，已经按 id 去重。焦点卡那张也在里面，画时间轴时用 withoutFocus 去掉。 */
  cards: MiniprogramCard[];
  /** 正在显示的第一页带的今日焦点卡（只有不带分类筛选的第一页有）；续页不改它。 */
  focus: MiniprogramFocus | null;
  nextCursor: string | null;
  hasMore: boolean;
  /** 续页：空闲、加载中、失败（已加载的卡片不清空）。 */
  more: "idle" | "loading" | "failed";
  /** 第一页或续页失败的原因。 */
  failure: Failure | null;
  /** 第一页有几张卡：游标失效时只丢续页，留下这几张。 */
  firstCount: number;
  /** 刚因为游标失效重载过第一页、还没成功拿到续页。这时再收到 invalid_cursor 就当普通失败，不再重载，免得来回循环。 */
  cursorReset: boolean;
  /** 上次第一页成功响应的本机时刻，和那次响应的 refreshAt（下一条精选放出的时刻）：判断第一页还新不新鲜。 */
  fetchedAt: number | null;
  refreshAt: string | null;
  /** 正在显示的第一页的 generatedAt：快照的时间标记和“网络不好，显示的是 HH:mm 的内容”用它。 */
  generatedAt: string | null;
  /** 第一页是冷启动时从本机快照放上来的，这次会话还没刷新成功。 */
  fromSnapshot: boolean;
}

export const INITIAL_FEED: FeedState = {
  phase: "idle",
  cards: [],
  focus: null,
  nextCursor: null,
  hasMore: false,
  more: "idle",
  failure: null,
  firstCount: 0,
  cursorReset: false,
  fetchedAt: null,
  refreshAt: null,
  generatedAt: null,
  fromSnapshot: false,
};

/**
 * 冷启动的初始状态：有快照就先放快照里的第一页。fetchedAt、refreshAt 不从快照带过来，它们只管这次会话里的响应：
 * fetchedAt 为 null，第一次 revalidate 一定重拉。
 */
export function seedFeed(snapshot: MiniprogramFeed | null): FeedState {
  if (!snapshot) return INITIAL_FEED;
  const cards = dedupe([], snapshot.cards);
  return {
    ...INITIAL_FEED,
    cards,
    focus: snapshot.focus,
    firstCount: cards.length,
    ...pageOf(snapshot),
    generatedAt: snapshot.generatedAt,
    fromSnapshot: true,
  };
}

export type FetchFeed = (query: FeedQuery) => Promise<Result<MiniprogramFeed>>;

/** 精选第一页的本机快照（只有不带分类筛选的列表有）。 */
export interface FeedSnapshot {
  /** 冷启动先显示的第一页；没有快照为 null。 */
  initial: MiniprogramFeed | null;
  /** 第一页成功：整份覆盖快照。 */
  save(feed: MiniprogramFeed): void;
  /** 第一页回 section_paused：占位期间不留快照里的卡片。 */
  drop(): void;
}

export interface FeedStore {
  /** 从第一页重新加载（挂载、下拉刷新）。 */
  refresh(): Promise<void>;
  /**
   * 不强制的重拉（切回页面时）：第一页正在加载、上次的响应还新鲜（60 秒内、没过 refreshAt）时不请求；
   * 读者已经往下加载过续页时也不请求，免得把看到一半的列表收回成第一页，要看新的就下拉。
   */
  revalidate(): Promise<void>;
  /** 触底：用 nextCursor 加载下一页追加。正在加载、没有更多、第一页还没好时什么都不做。 */
  loadMore(): Promise<void>;
  /** 失败后重试：第一页失败重拉第一页，续页失败重拉续页。 */
  retry(): Promise<void>;
}

/**
 * 一个分类筛选（null 为全部）的列表。每次状态变化调 onChange。now 是本机时钟，测试里换成假的。
 * 有 snapshot 时先放快照里的第一页，刷新期间和刷新失败时都留着；第一页每次成功都写回快照。
 */
export function createFeedStore(
  fetchFeed: FetchFeed,
  category: string | null,
  onChange: (state: FeedState) => void,
  now: () => number = Date.now,
  snapshot: FeedSnapshot | null = null,
): FeedStore {
  let state = seedFeed(snapshot?.initial ?? null);
  // 每次从第一页加载加一；迟到的旧响应（重载前发出的续页、被新一次刷新顶掉的第一页）对不上就丢掉。
  let generation = 0;
  const set = (next: FeedState) => {
    state = next;
    onChange(state);
  };

  async function loadFirst(afterCursorReset: boolean) {
    const gen = ++generation;
    set({ ...state, phase: "loading", more: "idle", failure: null, cursorReset: afterCursorReset });
    const result = await fetchFeed({ category, cursor: null, limit: FEED_PAGE_SIZE });
    if (gen !== generation) return;
    if (!result.ok) {
      if (result.failure.kind === "paused") snapshot?.drop();
      // 已经显示的卡片（快照、上次的列表）不清空，页面顶部提示“网络不好”。
      return set({ ...state, phase: "failed", failure: result.failure });
    }
    const cards = dedupe([], result.data.cards);
    const fresh = { fetchedAt: now(), refreshAt: result.data.refreshAt, generatedAt: result.data.generatedAt, fromSnapshot: false };
    // 焦点卡只在不带筛选的第一页出现（接口保证），这里再守一道。
    const focus = category === null ? result.data.focus : null;
    set({ ...state, phase: "ready", cards, focus, firstCount: cards.length, ...pageOf(result.data), failure: null, ...fresh });
    snapshot?.save(result.data);
  }

  async function revalidate() {
    if (state.phase === "loading") return;
    if (state.phase === "ready") {
      if (state.fetchedAt !== null && isFresh(state.fetchedAt, state.refreshAt, now())) return;
      if (state.cards.length > state.firstCount) return;
    }
    return loadFirst(false);
  }

  async function loadMore() {
    const cursor = state.nextCursor;
    if (state.phase !== "ready" || !state.hasMore || !cursor || state.more === "loading") return;
    const gen = generation;
    set({ ...state, more: "loading", failure: null });
    const result = await fetchFeed({ category, cursor, limit: FEED_PAGE_SIZE });
    if (gen !== generation) return;
    if (result.ok) {
      set({ ...state, cards: dedupe(state.cards, result.data.cards), ...pageOf(result.data), more: "idle", cursorReset: false });
      return;
    }
    if (result.failure.kind === "invalid_cursor" && !state.cursorReset) {
      // 游标坏了或和筛选对不上：丢掉已加载的续页，从第一页重新加载一次。
      set({ ...state, cards: state.cards.slice(0, state.firstCount), nextCursor: null, hasMore: false });
      return loadFirst(true);
    }
    set({ ...state, more: "failed", failure: result.failure });
  }

  return {
    refresh: () => loadFirst(false),
    revalidate,
    loadMore,
    retry: () => (state.phase === "failed" ? loadFirst(state.cursorReset) : state.more === "failed" ? loadMore() : Promise.resolve()),
  };
}

/**
 * 时间轴要画的卡：按 id 去掉正在显示的焦点卡那张（焦点卡不在时间轴里重复）。focusId 为 null（没有焦点卡、或这个板块不渲染焦点卡）时原样返回，
 * 不渲染焦点卡的板块不能去掉它，不然那张卡就看不到了。
 */
export function withoutFocus(cards: readonly MiniprogramCard[], focusId: string | null): MiniprogramCard[] {
  return focusId === null ? [...cards] : cards.filter((card) => card.id !== focusId);
}

// 接口说还有但没给游标时当到底处理，免得触底一直空转。
function pageOf(feed: MiniprogramFeed): { nextCursor: string | null; hasMore: boolean } {
  const nextCursor = feed.page.nextCursor;
  return { nextCursor, hasMore: feed.page.hasMore && !!nextCursor };
}

// 按 id 去重追加：续页和已有的卡重叠时不出重复的卡（也不出重复的 React key）。
function dedupe(existing: MiniprogramCard[], incoming: MiniprogramCard[]): MiniprogramCard[] {
  const cards = [...existing];
  const seen = new Set(existing.map((card) => card.id));
  for (const card of incoming) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}
