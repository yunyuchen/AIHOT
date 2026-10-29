// 收藏：只存本机（saved.v1），新的在前，最多 300 条，满了提示、不自动删。收藏页不请求接口，记录里的快照够离线画出列表；
// 打开收藏过的条目时用新拿到的标题、分类、来源数和 ai 更新快照。某个板块的元信息（这次会话内存里的，或本机快照里的）是占位时，
// 收藏页先隐藏这个板块的收藏（不删），恢复正常后重新出现。
// 纯逻辑，不依赖微信运行时：存储由调用方注入（storage.ts），tests/ 里用内存假存储直接跑；接上微信存储、React 和提示的是 use-saved.ts。
import type { MiniprogramDaily, MiniprogramItem, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../../config/boards";
import { showAiBadge } from "./card.ts";
import { checkMeta, type MetaState } from "./meta.ts";
import { readSnapshot, STORAGE_KEYS, type Storage } from "./storage.ts";

/** 最多收藏几条（规格：约 120KB）。满了提示读者先取消一些，不自动删最旧的。 */
export const SAVED_LIMIT = 300;

/** 收藏页和收藏按钮上的固定文案。 */
export const SAVED_COPY = {
  /** 头部那一行。 */
  local: "仅保存在本机，设备间不同步",
  /** 页面底部的说明；“分享给同事”加粗。 */
  note: ["收藏仅保存在本机，不上传、不登录。清理微信缓存后将被清除，且无法同步至新设备。重要内容可通过", "“分享给同事”", "发送至会话留存。"],
  emptyTitle: "暂无收藏",
  emptyDetail: "在条目页或日报头条卡片上选择“收藏”，即可在此查看。收藏仅保存在本机，不上传、不登录。",
  unreadable: "无法读取收藏",
  unreadableDetail: "本机存储暂不可用，请稍后重试。查看内容不受影响。",
  full: `收藏已达 ${SAVED_LIMIT} 条，请先取消部分收藏`,
  saved: "已收藏",
  removed: "已取消收藏",
  saveFailed: "收藏失败，请稍后再试",
  removeFailed: "取消收藏失败，请稍后再试",
  missingRemove: "从收藏移除",
  missingRemoved: "已从收藏移除",
} as const;

export type SavedKind = "item" | "daily";

/**
 * 一条收藏（规格“本机存储”表的 saved.v1）。条目的 id 是条目 id，日报的 id 是日报日期 YYYY-MM-DD。
 * 日报没有分类、来源名和来源数（都是 null），只有日报才有 siteName（日报名）；日报的 title 是那一期的头条，没有头条时是空字符串。
 * sourceCount 是同一事实的来源数，“仅显示摘要”时接口给 null，收藏页不显示。
 * ai：标题或摘要任一是模型写的（日报看头条和导语），收藏卡右上角标“AI 摘要”。savedAt 是收藏时的本机时刻（毫秒）。
 */
export interface SavedEntry {
  kind: SavedKind;
  board: BoardKey;
  id: string;
  title: string;
  category: string | null;
  sourceName: string | null;
  sourceCount: number | null;
  ai: boolean;
  siteName?: string;
  savedAt: number;
}

/** 收藏按钮手上的那一条：还没有 savedAt，点下去的时候才记。 */
export type SavedDraft = Omit<SavedEntry, "savedAt">;

/** 条目页的收藏：快照取接口这一次给的。 */
export function itemDraft(board: BoardKey, item: MiniprogramItem): SavedDraft {
  return {
    kind: "item",
    board,
    id: item.id,
    title: item.title,
    category: item.category,
    sourceName: item.source.name,
    sourceCount: item.sourceCount,
    ai: showAiBadge(item.ai),
  };
}

/** 日报头条卡上的收藏：id 是日期，标题是头条（没有时空着），siteName 是日报名。 */
export function dailyDraft(board: BoardKey, daily: MiniprogramDaily): SavedDraft {
  const title = daily.lead?.title.trim() ?? "";
  const paragraph = daily.lead?.paragraph.trim() ?? "";
  return {
    kind: "daily",
    board,
    id: daily.date,
    title,
    category: null,
    sourceName: null,
    sourceCount: null,
    ai: (title !== "" || paragraph !== "") && (daily.ai.leadTitle === true || daily.ai.leadParagraph === true),
    siteName: daily.title,
  };
}

/**
 * 读出来的 saved.v1：不是数组（没有这个 key 时微信回空字符串）当没有收藏；数组里形状不对的记录丢掉。
 * 回的总是数组，所以 storage.read 回 null 只可能是存储本身读不出来。
 */
export function parseSaved(value: unknown): SavedEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry);
}

function isEntry(value: unknown): value is SavedEntry {
  const e = value as Partial<SavedEntry> | null;
  return (
    !!e &&
    typeof e === "object" &&
    (e.kind === "item" || e.kind === "daily") &&
    typeof e.board === "string" &&
    typeof e.id === "string" &&
    e.id !== "" &&
    typeof e.title === "string" &&
    (e.category === null || typeof e.category === "string") &&
    (e.sourceName === null || typeof e.sourceName === "string") &&
    (e.sourceCount === null || typeof e.sourceCount === "number") &&
    typeof e.ai === "boolean" &&
    (e.siteName === undefined || typeof e.siteName === "string") &&
    typeof e.savedAt === "number" &&
    Number.isFinite(e.savedAt)
  );
}

const same = (e: SavedEntry, kind: SavedKind, board: string, id: string) => e.kind === kind && e.board === board && e.id === id;

/** 打开收藏过的条目时拿到的新值。 */
export interface SavedFresh {
  title: string;
  category: string | null;
  sourceCount: number | null;
  ai: boolean;
}

export function itemFresh(item: MiniprogramItem): SavedFresh {
  return { title: item.title, category: item.category, sourceCount: item.sourceCount, ai: showAiBadge(item.ai) };
}

/** 用新拿到的标题、分类、来源数和 ai 更新这条收藏的快照；没收藏或都没变时原样回（同一个数组，调用方据此不写存储）。 */
export function refreshEntries(entries: readonly SavedEntry[], board: string, id: string, fresh: SavedFresh): readonly SavedEntry[] {
  const i = entries.findIndex((e) => same(e, "item", board, id));
  if (i < 0) return entries;
  const old = entries[i]!;
  if (old.title === fresh.title && old.category === fresh.category && old.sourceCount === fresh.sourceCount && old.ai === fresh.ai) return entries;
  const next = [...entries];
  next[i] = { ...old, ...fresh };
  return next;
}

/** 收藏页要画的：板块在 boards 里（构建配置里有、没被隐藏），按收藏时间倒序（同一时刻保持存的顺序）。 */
export function visibleEntries(entries: readonly SavedEntry[], boards: readonly string[]): SavedEntry[] {
  return entries.filter((e) => boards.includes(e.board)).sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * 收藏页要不要先隐藏这个板块的收藏（不删）：这次会话内存里有元信息就听它的（占位隐藏，正常显示，所以恢复正常后重新出现）；
 * 内存里还没有（收藏页不为此请求）、或者请求失败了，就看本机快照里的元信息是不是占位。冷启动时占位的快照不会放进内存
 * （meta.ts 的 snapshotMeta），所以要单独读快照。
 */
export function boardHidden(memory: MetaState | undefined, snapshot: MiniprogramMeta | null): boolean {
  if (memory?.status === "ready") return memory.meta.status === "placeholder";
  if (memory?.status === "failed" && memory.failure.kind === "paused") return true;
  return snapshot?.status === "placeholder";
}

/** 分类名：内存里的元信息优先，没有时用本机快照里的；都没有时空表（色标先显示 key，同精选卡片）。 */
export function savedLabels(memory: MetaState | undefined, snapshot: MiniprogramMeta | null): Record<string, string> {
  const meta = memory?.status === "ready" ? memory.meta : snapshot;
  const labels: Record<string, string> = {};
  for (const c of meta?.categories ?? []) labels[c.key] = c.label;
  return labels;
}

/** 本机快照里这个板块的元信息，占位的也读出来（收藏页据此隐藏）。 */
export function readMetaSnapshot(storage: Storage, board: BoardKey): MiniprogramMeta | null {
  return (
    readSnapshot(storage, board, "meta", (data) => {
      const checked = checkMeta(data, board);
      return checked.ok ? checked.meta : null;
    })?.data ?? null
  );
}

export type SaveOutcome = "saved" | "removed" | "full" | "failed";

export interface SavedStore {
  /** 全部收藏，新的在前（含被隐藏板块的）；本机存储读不出来时为 null。 */
  entries(): readonly SavedEntry[] | null;
  has(kind: SavedKind, board: string, id: string): boolean;
  /** 收藏按钮：没收藏就收藏（满 300 条回 full，不删旧的），收藏了就取消。存储读不出来、写不进时回 failed，什么都不改。 */
  toggle(draft: SavedDraft): SaveOutcome;
  /** 从收藏移除（条目已下线时的按钮）。没收藏也算成功；写不进时回 false。 */
  remove(kind: SavedKind, board: string, id: string): boolean;
  /** 打开收藏过的条目、拿到新内容时更新快照；没收藏或都没变时不写。 */
  refresh(board: string, id: string, fresh: SavedFresh): void;
  subscribe(listener: () => void): () => void;
}

/**
 * 收藏的读写。第一次用到时从本机读出来放在内存里，之后只有写成功了才改内存，内存和本机始终一致。
 * 读不出来（存储抛错）时不当成“没有收藏”，什么都不写，免得一次读失败就把本机的收藏整份覆盖掉；下次用到时再读一次。
 */
export function createSavedStore(storage: Storage, now: () => number = Date.now): SavedStore {
  let list: readonly SavedEntry[] | null = null;
  const listeners = new Set<() => void>();

  const load = () => {
    if (list === null) list = storage.read(STORAGE_KEYS.saved, parseSaved);
    return list;
  };
  const commit = (next: readonly SavedEntry[]) => {
    if (!storage.write(STORAGE_KEYS.saved, next)) return false;
    list = next;
    for (const listener of [...listeners]) listener();
    return true;
  };

  return {
    entries: load,
    has(kind, board, id) {
      return load()?.some((e) => same(e, kind, board, id)) ?? false;
    },
    toggle(draft) {
      const current = load();
      if (!current) return "failed";
      if (current.some((e) => same(e, draft.kind, draft.board, draft.id))) {
        return commit(current.filter((e) => !same(e, draft.kind, draft.board, draft.id))) ? "removed" : "failed";
      }
      if (current.length >= SAVED_LIMIT) return "full";
      return commit([{ ...draft, savedAt: now() }, ...current]) ? "saved" : "failed";
    },
    remove(kind, board, id) {
      const current = load();
      if (!current) return false;
      if (!current.some((e) => same(e, kind, board, id))) return true;
      return commit(current.filter((e) => !same(e, kind, board, id)));
    },
    refresh(board, id, fresh) {
      const current = load();
      if (!current) return;
      const next = refreshEntries(current, board, id, fresh);
      if (next !== current) commit(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
