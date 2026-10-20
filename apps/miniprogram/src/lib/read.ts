// 已读：只存本机（read.v1，`{ [board]: { [itemId]: readAt } }`），打开条目页即记为已读，精选流里已读卡片的标题改用正文灰（D25）。
// 每个板块最多 1000 条，超上限先删最旧的；启动时删 30 天以前的。
// 纯逻辑，不依赖微信运行时：存储由调用方注入（storage.ts），tests/ 里用内存假存储直接跑；接上微信存储和 React 的是 use-read.ts。
import { STORAGE_KEYS, type Storage } from "./storage.ts";

/** 每个板块最多记几条已读。 */
export const READ_LIMIT = 1000;

/** 已读记多久：启动时删掉比这更早的。 */
export const READ_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 板块 key → 条目 id → 记为已读的本机时刻（毫秒）。 */
export type ReadMarks = Record<string, Record<string, number>>;

/** 读出来的 read.v1：不是对象当没有；时刻不是数的记录丢掉。回的总是对象，所以 storage.read 回 null 只可能是存储本身读不出来。 */
export function parseRead(value: unknown): ReadMarks {
  const marks: ReadMarks = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return marks;
  for (const [board, ids] of Object.entries(value as Record<string, unknown>)) {
    if (!ids || typeof ids !== "object" || Array.isArray(ids)) continue;
    const kept: Record<string, number> = {};
    for (const [id, at] of Object.entries(ids as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) kept[id] = at;
    }
    marks[board] = kept;
  }
  return marks;
}

/** 记一条已读（读过的再记一次刷新时刻），这个板块超过 1000 条时先删最旧的。不改传进来的对象。 */
export function markRead(marks: ReadMarks, board: string, id: string, now: number): ReadMarks {
  return { ...marks, [board]: capped({ ...marks[board], [id]: now }) };
}

/** 启动时的淘汰：删 30 天以前的（正好 30 天的留着），每个板块再按上限删最旧的。删空的板块不留。 */
export function pruneRead(marks: ReadMarks, now: number): ReadMarks {
  const oldest = now - READ_TTL_MS;
  const next: ReadMarks = {};
  for (const [board, ids] of Object.entries(marks)) {
    const kept = capped(Object.fromEntries(Object.entries(ids).filter(([, at]) => at >= oldest)));
    if (Object.keys(kept).length > 0) next[board] = kept;
  }
  return next;
}

function capped(ids: Record<string, number>): Record<string, number> {
  const entries = Object.entries(ids);
  if (entries.length <= READ_LIMIT) return ids;
  // 新的在前，留前 1000 条。
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, READ_LIMIT));
}

function count(marks: ReadMarks): number {
  return Object.values(marks).reduce((sum, ids) => sum + Object.keys(ids).length, 0);
}

export interface ReadStore {
  /** 启动时调一次：删 30 天以前的、超上限的，有删的才写回。 */
  prune(): void;
  /** 打开条目页：记为已读。 */
  mark(board: string, id: string): void;
  /** 这个板块已读的条目 id；没变时回同一个 Set（React 据此不重算）。 */
  ids(board: string): ReadonlySet<string>;
  subscribe(listener: () => void): () => void;
}

/**
 * 已读的读写，内存里放一份。本机读不出来（存储抛错）时只记在内存里，不写回，免得把本机的已读整份覆盖掉；
 * 下次记已读时再读一次，读出来了就并进去。写不进时也只在内存里，阅读不受影响。
 */
export function createReadStore(storage: Storage, now: () => number = Date.now): ReadStore {
  let marks: ReadMarks = {};
  let loaded = false;
  const sets = new Map<string, ReadonlySet<string>>();
  const listeners = new Set<() => void>();

  const load = () => {
    if (loaded) return;
    const stored = storage.read(STORAGE_KEYS.read, parseRead);
    if (stored === null) return;
    // 内存里先记下的（本机读不出来那会儿）并进去，同一条以内存里的为准。
    for (const [board, ids] of Object.entries(marks)) stored[board] = { ...stored[board], ...ids };
    marks = stored;
    loaded = true;
    sets.clear();
  };
  const changed = () => {
    sets.clear();
    for (const listener of [...listeners]) listener();
  };

  return {
    prune() {
      load();
      const next = pruneRead(marks, now());
      if (count(next) === count(marks)) return;
      marks = next;
      if (loaded) storage.write(STORAGE_KEYS.read, marks);
      changed();
    },
    mark(board, id) {
      load();
      marks = markRead(marks, board, id, now());
      if (loaded) storage.write(STORAGE_KEYS.read, marks);
      changed();
    },
    ids(board) {
      load();
      let set = sets.get(board);
      if (!set) {
        set = new Set(Object.keys(marks[board] ?? {}));
        sets.set(board, set);
      }
      return set;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
