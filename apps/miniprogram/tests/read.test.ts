import assert from "node:assert/strict";
import { test } from "node:test";
import { createReadStore, markRead, parseRead, pruneRead, READ_LIMIT, READ_TTL_MS, type ReadMarks } from "../src/lib/read.ts";
import { createStorage, STORAGE_KEYS, type StorageBackend } from "../src/lib/storage.ts";

/** 内存里的假存储，像 wx.getStorageSync：没有的 key 回空字符串。读、写可以分别弄坏。 */
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
      if (broken.set) throw new Error("setStorageSync:fail");
      writes += 1;
      data.set(key, structuredClone(value));
    },
    remove(key) {
      data.delete(key);
    },
  };
  return { data, broken, storage: createStorage(backend), writes: () => writes };
}

const T = Date.parse("2026-10-17T11:18:00+08:00");
const DAY = 24 * 60 * 60 * 1000;

/** 某个板块 n 条已读，第 i 条在 T - i 秒读的（i 越大越旧）。 */
function many(n: number, prefix = "it"): Record<string, number> {
  return Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}`, T - i * 1000]));
}

test("上限和期限：每个板块 1000 条、30 天", () => {
  assert.equal(READ_LIMIT, 1000);
  assert.equal(READ_TTL_MS, 30 * DAY);
});

test("记已读：按板块分开记下时刻，再记一次刷新时刻，不改传进来的对象", () => {
  const empty: ReadMarks = {};
  const one = markRead(empty, "manufacturing", "it_1", T);
  assert.deepEqual(one, { manufacturing: { it_1: T } });
  assert.deepEqual(empty, {});
  const two = markRead(one, "sports", "it_1", T + 1);
  assert.deepEqual(two, { manufacturing: { it_1: T }, sports: { it_1: T + 1 } });
  assert.deepEqual(markRead(two, "manufacturing", "it_1", T + 2).manufacturing, { it_1: T + 2 });
});

test("每个板块最多 1000 条：超了先删最旧的，别的板块不受影响", () => {
  const marks: ReadMarks = { manufacturing: many(READ_LIMIT), sports: many(3) };
  const next = markRead(marks, "manufacturing", "new", T + 1000);
  const ids = Object.keys(next.manufacturing!);
  assert.equal(ids.length, READ_LIMIT);
  assert.ok(ids.includes("new"));
  // 最旧的那条（it999）被删，次旧的留着。
  assert.ok(!ids.includes(`it${READ_LIMIT - 1}`));
  assert.ok(ids.includes(`it${READ_LIMIT - 2}`));
  assert.equal(Object.keys(next.sports!).length, 3);
  // 读过的再读一次不算新增，不删别的。
  assert.equal(Object.keys(markRead(marks, "manufacturing", "it999", T + 1000).manufacturing!).length, READ_LIMIT);
  assert.ok("it998" in markRead(marks, "manufacturing", "it999", T + 1000).manufacturing!);
});

test("启动时的淘汰：删 30 天以前的，正好 30 天的留着，删空的板块不留", () => {
  const marks: ReadMarks = {
    manufacturing: { fresh: T - DAY, edge: T - 30 * DAY, old: T - 30 * DAY - 1, older: T - 90 * DAY },
    sports: { old: T - 31 * DAY },
  };
  assert.deepEqual(pruneRead(marks, T), { manufacturing: { fresh: T - DAY, edge: T - 30 * DAY } });
});

test("启动时的淘汰：超过 1000 条的板块先删最旧的", () => {
  const next = pruneRead({ manufacturing: many(READ_LIMIT + 50) }, T);
  const ids = Object.keys(next.manufacturing!);
  assert.equal(ids.length, READ_LIMIT);
  assert.ok(ids.includes("it0"));
  assert.ok(ids.includes(`it${READ_LIMIT - 1}`));
  assert.ok(!ids.includes(`it${READ_LIMIT}`));
});

test("读出来的 read.v1：不是对象当没有，时刻不是数的丢掉", () => {
  assert.deepEqual(parseRead(""), {});
  assert.deepEqual(parseRead([1, 2]), {});
  assert.deepEqual(parseRead({ manufacturing: { a: T, b: "x", c: null, d: Number.NaN }, sports: "x", other: [1] }), { manufacturing: { a: T } });
});

test("store：记已读写进 read.v1，ids 按板块给，下次冷启动读得回来", () => {
  const m = memory();
  const store = createReadStore(m.storage, () => T);
  assert.equal(store.ids("manufacturing").size, 0);
  let changes = 0;
  store.subscribe(() => (changes += 1));
  store.mark("manufacturing", "it_1");
  assert.equal(changes, 1);
  assert.ok(store.ids("manufacturing").has("it_1"));
  assert.equal(store.ids("sports").has("it_1"), false);
  assert.deepEqual(m.data.get(STORAGE_KEYS.read), { manufacturing: { it_1: T } });
  assert.ok(createReadStore(m.storage).ids("manufacturing").has("it_1"));
});

test("store：没变时 ids 回同一个 Set，记了新的才换", () => {
  const store = createReadStore(memory().storage, () => T);
  const a = store.ids("manufacturing");
  assert.equal(store.ids("manufacturing"), a);
  store.mark("manufacturing", "it_1");
  assert.notEqual(store.ids("manufacturing"), a);
});

test("store：启动时淘汰，删了才写回", () => {
  const m = memory();
  m.storage.write(STORAGE_KEYS.read, { manufacturing: { fresh: T - DAY, old: T - 40 * DAY } });
  const store = createReadStore(m.storage, () => T);
  const writes = m.writes();
  store.prune();
  assert.deepEqual(m.data.get(STORAGE_KEYS.read), { manufacturing: { fresh: T - DAY } });
  assert.equal(m.writes(), writes + 1);
  assert.equal(store.ids("manufacturing").has("old"), false);
  store.prune();
  assert.equal(m.writes(), writes + 1);
});

test("store：本机读不出来时只记在内存里、不覆盖本机；读得出来以后并进去", () => {
  const m = memory();
  m.storage.write(STORAGE_KEYS.read, { manufacturing: { kept: T - DAY } });
  m.broken.get = true;
  const store = createReadStore(m.storage, () => T);
  const writes = m.writes();
  store.prune();
  store.mark("manufacturing", "it_1");
  assert.ok(store.ids("manufacturing").has("it_1"));
  assert.equal(m.writes(), writes);
  m.broken.get = false;
  store.mark("manufacturing", "it_2");
  assert.deepEqual(m.data.get(STORAGE_KEYS.read), { manufacturing: { kept: T - DAY, it_1: T, it_2: T } });
  assert.ok(store.ids("manufacturing").has("kept"));
});

test("store：写不进时不抛，内存里照样记着（阅读不受影响）", () => {
  const m = memory();
  m.broken.set = true;
  const store = createReadStore(m.storage, () => T);
  store.mark("manufacturing", "it_1");
  store.prune();
  assert.ok(store.ids("manufacturing").has("it_1"));
  assert.equal(createReadStore(createStorage(null)).ids("manufacturing").size, 0);
});
