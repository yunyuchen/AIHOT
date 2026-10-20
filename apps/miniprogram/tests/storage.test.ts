import assert from "node:assert/strict";
import { test } from "node:test";
import { createStorage, readSnapshot, removeSnapshot, STORAGE_KEYS, writeSnapshot, type StorageBackend } from "../src/lib/storage.ts";

/** 内存里的假存储，像 wx.getStorageSync：没有的 key 回空字符串。broken 为真时每个操作都抛错（满了、被禁用）。 */
function memory() {
  const data = new Map<string, unknown>();
  let broken = false;
  const backend: StorageBackend = {
    get(key) {
      if (broken) throw new Error("getStorageSync:fail");
      return data.has(key) ? structuredClone(data.get(key)) : "";
    },
    set(key, value) {
      if (broken) throw new Error("setStorageSync:fail exceed storage max size 10MB");
      data.set(key, structuredClone(value));
    },
    remove(key) {
      if (broken) throw new Error("removeStorageSync:fail");
      data.delete(key);
    },
  };
  return { data, backend, break: () => void (broken = true) };
}

const asList = (value: unknown) => (Array.isArray(value) ? (value as string[]) : null);
const T = Date.parse("2026-10-17T11:18:00+08:00");

test("key 都带版本号，和规格的本机存储表一致", () => {
  assert.equal(STORAGE_KEYS.saved, "saved.v1");
  assert.equal(STORAGE_KEYS.read, "read.v1");
  assert.equal(STORAGE_KEYS.snapshot("manufacturing", "meta"), "snap.v1.manufacturing.meta");
  assert.equal(STORAGE_KEYS.snapshot("sports", "feed"), "snap.v1.sports.feed");
  assert.equal(STORAGE_KEYS.snapshot("manufacturing", "daily"), "snap.v1.manufacturing.daily");
  const m = memory();
  const storage = createStorage(m.backend);
  writeSnapshot(storage, "manufacturing", "feed", { cards: [] }, T);
  storage.write(STORAGE_KEYS.saved, []);
  for (const key of m.data.keys()) assert.match(key, /\.v\d+(\.|$)/);
});

test("读写：写进去的读得回来，没有的 key 和形状不对的都回 null", () => {
  const storage = createStorage(memory().backend);
  assert.equal(storage.read(STORAGE_KEYS.saved, asList), null);
  assert.equal(storage.write(STORAGE_KEYS.saved, ["a", "b"]), true);
  assert.deepEqual(storage.read(STORAGE_KEYS.saved, asList), ["a", "b"]);
  storage.write(STORAGE_KEYS.saved, { not: "a list" });
  assert.equal(storage.read(STORAGE_KEYS.saved, asList), null);
  assert.equal(storage.remove(STORAGE_KEYS.saved), true);
  assert.equal(storage.read(STORAGE_KEYS.saved, asList), null);
});

test("存储抛错时不往外抛：读回 null，写和删回 false", () => {
  const m = memory();
  const storage = createStorage(m.backend);
  storage.write(STORAGE_KEYS.saved, ["a"]);
  m.break();
  assert.equal(storage.read(STORAGE_KEYS.saved, asList), null);
  assert.equal(storage.write(STORAGE_KEYS.saved, ["b"]), false);
  assert.equal(storage.remove(STORAGE_KEYS.saved), false);
  assert.equal(readSnapshot(storage, "manufacturing", "meta", (d) => d), null);
  assert.equal(writeSnapshot(storage, "manufacturing", "meta", {}, T), false);
  assert.equal(removeSnapshot(storage, "manufacturing", "meta"), false);
});

test("check 自己抛错也兜住", () => {
  const storage = createStorage(memory().backend);
  storage.write(STORAGE_KEYS.read, { manufacturing: {} });
  assert.equal(
    storage.read(STORAGE_KEYS.read, () => {
      throw new Error("bad");
    }),
    null,
  );
});

test("拿不到存储（backend 为 null）时什么都读不到、写不进", () => {
  const storage = createStorage(null);
  assert.equal(storage.read(STORAGE_KEYS.saved, asList), null);
  assert.equal(storage.write(STORAGE_KEYS.saved, []), false);
  assert.equal(storage.remove(STORAGE_KEYS.saved), false);
});

test("快照：带上拉取时刻存下，读的时候 data 再核对一遍", () => {
  const storage = createStorage(memory().backend);
  const check = (d: unknown) => ((d as { v?: number })?.v === 1 ? (d as { v: 1; cards: string[] }) : null);
  assert.equal(readSnapshot(storage, "manufacturing", "feed", check), null);
  assert.equal(writeSnapshot(storage, "manufacturing", "feed", { v: 1, cards: ["a"] }, T), true);
  assert.deepEqual(readSnapshot(storage, "manufacturing", "feed", check), { data: { v: 1, cards: ["a"] }, fetchedAt: T });
  // 不同板块、不同种类各是各的。
  assert.equal(readSnapshot(storage, "sports", "feed", check), null);
  assert.equal(readSnapshot(storage, "manufacturing", "meta", check), null);
  // data 核对不过（旧版本写的）当没有。
  writeSnapshot(storage, "manufacturing", "feed", { v: 0, cards: ["a"] }, T);
  assert.equal(readSnapshot(storage, "manufacturing", "feed", check), null);
});

test("快照：每次成功整份覆盖，不和旧的合并", () => {
  const m = memory();
  const storage = createStorage(m.backend);
  const check = (d: unknown) => d as Record<string, unknown>;
  writeSnapshot(storage, "manufacturing", "feed", { cards: ["a", "b"], extra: "old" }, T);
  writeSnapshot(storage, "manufacturing", "feed", { cards: ["c"] }, T + 1000);
  assert.deepEqual(readSnapshot(storage, "manufacturing", "feed", check), { data: { cards: ["c"] }, fetchedAt: T + 1000 });
  removeSnapshot(storage, "manufacturing", "feed");
  assert.equal(readSnapshot(storage, "manufacturing", "feed", check), null);
});

test("快照：记录本身被改坏（没有拉取时刻、不是对象）当没有", () => {
  const storage = createStorage(memory().backend);
  const key = STORAGE_KEYS.snapshot("manufacturing", "meta");
  const check = (d: unknown) => d;
  storage.write(key, { data: { a: 1 } });
  assert.equal(readSnapshot(storage, "manufacturing", "meta", check), null);
  storage.write(key, "garbage");
  assert.equal(readSnapshot(storage, "manufacturing", "meta", check), null);
  storage.write(key, null);
  assert.equal(readSnapshot(storage, "manufacturing", "meta", check), null);
});
