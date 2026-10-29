import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramDaily, MiniprogramItem, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { Failure } from "../src/lib/errors.ts";
import type { MetaState } from "../src/lib/meta.ts";
import {
  boardHidden,
  createSavedStore,
  dailyDraft,
  itemDraft,
  itemFresh,
  parseSaved,
  readMetaSnapshot,
  refreshEntries,
  SAVED_LIMIT,
  savedLabels,
  visibleEntries,
  type SavedDraft,
  type SavedEntry,
} from "../src/lib/saved.ts";
import { createStorage, STORAGE_KEYS, writeSnapshot, type StorageBackend } from "../src/lib/storage.ts";

/** 内存里的假存储，像 wx.getStorageSync：没有的 key 回空字符串。读、写可以分别弄坏（满了、被禁用）。 */
function memory() {
  const data = new Map<string, unknown>();
  const broken = { get: false, set: false };
  let writes = 0;
  const backend: StorageBackend = {
    get(key) {
      if (broken.get) throw new Error("getStorageSync:fail");
      return data.has(key) ? structuredClone(data.get(key)) : "";
    },
    set(key, value) {
      if (broken.set) throw new Error("setStorageSync:fail exceed storage max size 10MB");
      writes += 1;
      data.set(key, structuredClone(value));
    },
    remove(key) {
      data.delete(key);
    },
  };
  return { data, broken, backend, storage: createStorage(backend), writes: () => writes };
}

const T = Date.parse("2026-10-17T11:18:00+08:00");

function draft(id: string, overrides: Partial<SavedDraft> = {}): SavedDraft {
  return {
    kind: "item",
    board: "manufacturing",
    id,
    title: `标题 ${id}`,
    category: "semiconductor",
    sourceName: "Compound Semiconductor",
    sourceCount: 2,
    ai: true,
    ...overrides,
  };
}

const entry = (id: string, savedAt: number, overrides: Partial<SavedEntry> = {}): SavedEntry => ({ ...draft(id), savedAt, ...overrides });

/** 一个会走的假时钟。 */
function clock(start = T) {
  let now = start;
  return { now: () => now, tick: (ms = 1000) => void (now += ms) };
}

function item(overrides: Partial<MiniprogramItem> = {}): MiniprogramItem {
  return {
    schemaVersion: 1,
    id: "it_1",
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    summary: "新协议把双方原有供应关系从 150mm 衬底技术转为 200mm。",
    category: "semiconductor",
    source: { name: "Compound Semiconductor" },
    publishedAt: "2026-10-15T09:30:00+08:00",
    reason: null,
    sourceCount: 4,
    originalUrl: "https://example.com/news/1",
    fullText: { allowed: false, html: null, translated: false, complete: true },
    story: null,
    ai: { title: false, summary: true, reason: false, body: false },
    share: { title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议", imageUrl: "https://example.com/og/posters/it_1.png" },
    generatedAt: "2026-10-17T11:18:00+08:00",
    ...overrides,
  };
}

function daily(overrides: Partial<MiniprogramDaily> = {}): MiniprogramDaily {
  return {
    schemaVersion: 1,
    date: "2026-10-16",
    title: "锐奇制造日报",
    publishedAt: "2026-10-16T08:00:00+08:00",
    window: { start: "2026-10-15T08:00:00+08:00", end: "2026-10-16T08:00:00+08:00" },
    lead: { title: "七部门印发新型电池产业“十五五”规划", paragraph: "规划提出……" },
    highlights: [],
    sections: [],
    flashes: [],
    prev: "2026-10-15",
    next: null,
    ai: { leadTitle: true, leadParagraph: true },
    share: { title: "锐奇制造日报 10月16日", imageUrl: "https://example.com/og/daily.png" },
    generatedAt: "2026-10-16T08:00:00+08:00",
    ...overrides,
  };
}

function meta(status: MiniprogramMeta["status"], board = "manufacturing"): MiniprogramMeta {
  return {
    schemaVersion: 1,
    board: { key: board, name: "制造", siteName: "锐奇制造日报", description: "" },
    status,
    placeholder: null,
    columns: { feed: true, stories: true, daily: true },
    categories: [{ key: "semiconductor", label: "半导体" }],
    notice: { footer: null, hotline: null },
    readings: { date: "2026-10-17", cards: 12, stories: 3, sources: 40, times: [], updatedAt: null },
    generatedAt: "2026-10-17T11:18:00+08:00",
  } as MiniprogramMeta;
}

const ready = (status: MiniprogramMeta["status"], fetchedAt: number | null = T): MetaState => ({ status: "ready", meta: meta(status), fetchedAt });
const failure = (kind: Failure["kind"]): Failure => ({ kind, status: null, code: null, requestId: null });

test("收藏记录：条目带 kind、board、id、标题、分类、来源名、来源数、ai；日报的 id 是日期、带 siteName", () => {
  assert.deepEqual(itemDraft("manufacturing", item()), {
    kind: "item",
    board: "manufacturing",
    id: "it_1",
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    category: "semiconductor",
    sourceName: "Compound Semiconductor",
    sourceCount: 4,
    ai: true,
  });
  assert.equal(itemDraft("sports", item({ ai: { title: false, summary: false, reason: true, body: true } })).ai, false);
  assert.equal(itemDraft("manufacturing", item({ sourceCount: null })).sourceCount, null);

  assert.deepEqual(dailyDraft("manufacturing", daily()), {
    kind: "daily",
    board: "manufacturing",
    id: "2026-10-16",
    title: "七部门印发新型电池产业“十五五”规划",
    category: null,
    sourceName: null,
    sourceCount: null,
    ai: true,
    siteName: "锐奇制造日报",
  });
  // 没有头条：标题空着，也不标 AI（同头条卡）。
  const noLead = dailyDraft("manufacturing", daily({ lead: null }));
  assert.equal(noLead.title, "");
  assert.equal(noLead.ai, false);
  assert.equal(dailyDraft("manufacturing", daily({ ai: { leadTitle: false, leadParagraph: false } })).ai, false);
});

test("收藏和取消：新的在前，记下收藏时刻，写进 saved.v1", () => {
  const m = memory();
  const c = clock();
  const store = createSavedStore(m.storage, c.now);
  assert.deepEqual(store.entries(), []);
  assert.equal(store.toggle(draft("a")), "saved");
  c.tick();
  assert.equal(store.toggle(draft("b")), "saved");
  assert.deepEqual(
    store.entries()!.map((e) => [e.id, e.savedAt]),
    [
      ["b", T + 1000],
      ["a", T],
    ],
  );
  assert.equal(store.has("item", "manufacturing", "a"), true);
  // 同一个 id 在另一个板块、或者是日报，都不算同一条。
  assert.equal(store.has("item", "sports", "a"), false);
  assert.equal(store.has("daily", "manufacturing", "a"), false);
  // 再点一下取消。
  assert.equal(store.toggle(draft("a")), "removed");
  assert.deepEqual(
    store.entries()!.map((e) => e.id),
    ["b"],
  );
  // 本机里存的和内存一致，换一个 store（下次冷启动）读得回来。
  assert.deepEqual(parseSaved(m.data.get(STORAGE_KEYS.saved)), store.entries());
  assert.deepEqual(createSavedStore(m.storage).entries(), store.entries());
});

test("满 300 条：提示满了，不收藏、也不自动删旧的；取消一条以后又能收藏", () => {
  const m = memory();
  const full = Array.from({ length: SAVED_LIMIT }, (_, i) => entry(`old${i}`, T - i));
  m.storage.write(STORAGE_KEYS.saved, full);
  const store = createSavedStore(m.storage, () => T + 1);
  const writes = m.writes();
  assert.equal(store.toggle(draft("new")), "full");
  assert.equal(m.writes(), writes);
  assert.equal(store.entries()!.length, SAVED_LIMIT);
  assert.equal(store.has("item", "manufacturing", "new"), false);
  assert.equal(store.has("item", "manufacturing", "old299"), true);
  // 满了照样能取消，取消以后能收藏。
  assert.equal(store.toggle(draft("old5")), "removed");
  assert.equal(store.toggle(draft("new")), "saved");
  assert.equal(store.entries()!.length, SAVED_LIMIT);
  assert.equal(store.entries()![0]!.id, "new");
});

test("299 条时还能收藏第 300 条", () => {
  const m = memory();
  m.storage.write(
    STORAGE_KEYS.saved,
    Array.from({ length: SAVED_LIMIT - 1 }, (_, i) => entry(`old${i}`, T - i)),
  );
  const store = createSavedStore(m.storage, () => T + 1);
  assert.equal(store.toggle(draft("last")), "saved");
  assert.equal(store.entries()!.length, SAVED_LIMIT);
  assert.equal(store.toggle(draft("one-more")), "full");
});

test("写不进（存储满了、被禁用）：回 failed，内存和本机都不变，不抛", () => {
  const m = memory();
  const store = createSavedStore(m.storage, () => T);
  store.toggle(draft("a"));
  m.broken.set = true;
  assert.equal(store.toggle(draft("b")), "failed");
  assert.equal(store.toggle(draft("a")), "failed");
  assert.deepEqual(
    store.entries()!.map((e) => e.id),
    ["a"],
  );
  assert.equal(store.remove("item", "manufacturing", "a"), false);
  assert.equal(store.has("item", "manufacturing", "a"), true);
  // 恢复以后照常。
  m.broken.set = false;
  assert.equal(store.toggle(draft("b")), "saved");
});

test("读不出来（存储抛错）：不当成没有收藏，不写，免得把本机的收藏覆盖掉；恢复后读得回来", () => {
  const m = memory();
  m.storage.write(STORAGE_KEYS.saved, [entry("kept", T)]);
  m.broken.get = true;
  const store = createSavedStore(m.storage, () => T + 1);
  const writes = m.writes();
  assert.equal(store.entries(), null);
  assert.equal(store.has("item", "manufacturing", "kept"), false);
  assert.equal(store.toggle(draft("new")), "failed");
  assert.equal(store.remove("item", "manufacturing", "kept"), false);
  store.refresh("manufacturing", "kept", itemFresh(item()));
  assert.equal(m.writes(), writes);
  m.broken.get = false;
  assert.deepEqual(
    store.entries()!.map((e) => e.id),
    ["kept"],
  );
});

test("拿不到存储（backend 为 null）：收藏失败，不抛", () => {
  const store = createSavedStore(createStorage(null));
  assert.equal(store.entries(), null);
  assert.equal(store.toggle(draft("a")), "failed");
});

test("读出来的 saved.v1：没有这个 key、不是数组当没有，形状不对的记录丢掉", () => {
  assert.deepEqual(parseSaved(""), []);
  assert.deepEqual(parseSaved(undefined), []);
  assert.deepEqual(parseSaved({ a: 1 }), []);
  const good = entry("a", T);
  const daily = entry("2026-10-16", T, { kind: "daily", category: null, sourceName: null, sourceCount: null, siteName: "锐奇制造日报" });
  assert.deepEqual(
    parseSaved([good, daily, { ...good, kind: "story" }, { ...good, id: "" }, { ...good, savedAt: "x" }, { ...good, ai: 1 }, null, "a"]),
    [good, daily],
  );
});

test("从收藏移除（条目已下线）：只删这一条；没收藏也算成功", () => {
  const m = memory();
  const store = createSavedStore(m.storage, () => T);
  store.toggle(draft("a"));
  store.toggle(draft("b"));
  assert.equal(store.remove("item", "manufacturing", "a"), true);
  assert.deepEqual(
    store.entries()!.map((e) => e.id),
    ["b"],
  );
  const writes = m.writes();
  assert.equal(store.remove("item", "manufacturing", "nope"), true);
  assert.equal(m.writes(), writes);
});

test("打开收藏过的条目：用新的标题、分类、来源数和 ai 更新快照，收藏时刻和位置不变", () => {
  const m = memory();
  const c = clock();
  const store = createSavedStore(m.storage, c.now);
  store.toggle(draft("it_1", { title: "旧标题", category: "battery", sourceCount: 1, ai: false }));
  c.tick();
  store.toggle(draft("b"));
  store.refresh("manufacturing", "it_1", itemFresh(item()));
  const [, updated] = store.entries()!;
  assert.deepEqual(updated, {
    kind: "item",
    board: "manufacturing",
    id: "it_1",
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    category: "semiconductor",
    sourceName: "Compound Semiconductor",
    sourceCount: 4,
    ai: true,
    savedAt: T,
  });
  assert.deepEqual(parseSaved(m.data.get(STORAGE_KEYS.saved))[1], updated);
  // 都没变、没收藏、别的板块：不写。
  const writes = m.writes();
  store.refresh("manufacturing", "it_1", itemFresh(item()));
  store.refresh("manufacturing", "nope", itemFresh(item()));
  store.refresh("sports", "it_1", itemFresh(item({ title: "别的" })));
  assert.equal(m.writes(), writes);
});

test("refreshEntries：没变时回同一个数组；“只显示摘要”时来源数变成 null", () => {
  const list = [entry("a", T)];
  assert.equal(refreshEntries(list, "manufacturing", "a", { title: "标题 a", category: "semiconductor", sourceCount: 2, ai: true }), list);
  const next = refreshEntries(list, "manufacturing", "a", { title: "标题 a", category: "semiconductor", sourceCount: null, ai: true });
  assert.notEqual(next, list);
  assert.equal(next[0]!.sourceCount, null);
  // 日报不按条目更新。
  const daily = [entry("2026-10-16", T, { kind: "daily" })];
  assert.equal(refreshEntries(daily, "manufacturing", "2026-10-16", { title: "x", category: null, sourceCount: null, ai: false }), daily);
});

test("收藏页的顺序：按收藏时间倒序，同一时刻保持存的顺序；只列给定的板块", () => {
  const list = [entry("b", T + 5), entry("a", T + 9), entry("s", T + 7, { board: "sports" }), entry("c", T + 5), entry("d", T)];
  assert.deepEqual(
    visibleEntries(list, ["manufacturing", "sports"]).map((e) => e.id),
    ["a", "s", "b", "c", "d"],
  );
  assert.deepEqual(
    visibleEntries(list, ["manufacturing"]).map((e) => e.id),
    ["a", "b", "c", "d"],
  );
  // 构建配置里没有的板块不列（不删）。
  assert.deepEqual(visibleEntries([entry("x", T, { board: "retired" as never })], ["manufacturing", "sports"]), []);
  // 不改传进来的数组。
  assert.deepEqual(
    list.map((e) => e.id),
    ["b", "a", "s", "c", "d"],
  );
});

test("占位时隐藏：内存里的元信息说了算，占位隐藏、正常显示（恢复后重新出现）", () => {
  assert.equal(boardHidden(ready("placeholder"), null), true);
  assert.equal(boardHidden(ready("normal"), null), false);
  // 这次会话拿到了正常的元信息：哪怕快照还是占位也显示（快照每次成功都会覆盖，这里只是保险）。
  assert.equal(boardHidden(ready("normal"), meta("placeholder")), false);
  assert.equal(boardHidden(ready("placeholder"), meta("normal")), true);
  // 元信息回了 section_paused 也算占位。
  assert.equal(boardHidden({ status: "failed", failure: failure("paused") }, null), true);
});

test("占位时隐藏：内存里还没有（收藏页不请求）或请求失败了，看本机快照里的元信息", () => {
  assert.equal(boardHidden(undefined, meta("placeholder")), true);
  assert.equal(boardHidden({ status: "loading" }, meta("placeholder")), true);
  assert.equal(boardHidden({ status: "failed", failure: failure("network") }, meta("placeholder")), true);
  assert.equal(boardHidden(undefined, meta("normal")), false);
  assert.equal(boardHidden(undefined, null), false);
  assert.equal(boardHidden({ status: "failed", failure: failure("network") }, null), false);
  assert.equal(boardHidden({ status: "mismatch", actual: "other" }, null), false);
});

test("占位只是隐藏：板块被隐藏期间收藏原样留在本机，恢复后一条不少", () => {
  const m = memory();
  const store = createSavedStore(m.storage, () => T);
  store.toggle(draft("m1"));
  store.toggle(draft("s1", { board: "sports" }));
  const boards = (sportsMeta: MetaState | undefined) => (["manufacturing", "sports"] as const).filter((b) => b === "manufacturing" || !boardHidden(sportsMeta, null));
  assert.deepEqual(
    visibleEntries(store.entries()!, boards(ready("placeholder"))).map((e) => e.id),
    ["m1"],
  );
  assert.equal(store.entries()!.length, 2);
  assert.deepEqual(
    visibleEntries(store.entries()!, boards(ready("normal"))).map((e) => e.id).sort(),
    ["m1", "s1"],
  );
});

test("本机快照里的元信息：占位的也读出来；板块对不上、形状不对当没有", () => {
  const m = memory();
  assert.equal(readMetaSnapshot(m.storage, "sports"), null);
  writeSnapshot(m.storage, "sports", "meta", meta("placeholder", "sports"), T);
  assert.equal(readMetaSnapshot(m.storage, "sports")?.status, "placeholder");
  writeSnapshot(m.storage, "sports", "meta", meta("normal", "manufacturing"), T);
  assert.equal(readMetaSnapshot(m.storage, "sports"), null);
  writeSnapshot(m.storage, "sports", "meta", { schemaVersion: 2 }, T);
  assert.equal(readMetaSnapshot(m.storage, "sports"), null);
});

test("收藏页的分类名：内存里的元信息优先，没有时用快照，都没有是空表", () => {
  const other = { ...meta("normal"), categories: [{ key: "semiconductor", label: "芯片" }] };
  assert.deepEqual(savedLabels(ready("normal"), other), { semiconductor: "半导体" });
  assert.deepEqual(savedLabels(undefined, other), { semiconductor: "芯片" });
  assert.deepEqual(savedLabels({ status: "loading" }, null), {});
});
