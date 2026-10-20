// 两个板块各由一个行业实例供稿，一个挂了另一个照常：元信息的状态、进行中的请求、本机快照都按板块分开（lib/meta-store.ts）。
// 精选流的快照也按板块存（snap.v1.{board}.feed，见 storage.test.ts），列表各页面各建各的（use-feed.ts 按板块请求）。
import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../config/boards.ts";
import type { Failure } from "../src/lib/errors.ts";
import { createMetaStore, type FetchMeta } from "../src/lib/meta-store.ts";
import type { Result } from "../src/lib/request.ts";
import { createStorage, readSnapshot, writeSnapshot, type StorageBackend } from "../src/lib/storage.ts";

const T = Date.parse("2026-10-17T11:18:00+08:00");

function meta(key: BoardKey, overrides: Partial<MiniprogramMeta> = {}): MiniprogramMeta {
  return {
    schemaVersion: 1,
    board: { key, name: key === "sports" ? "运动健康" : "制造", siteName: "站名", description: "…" },
    status: "normal",
    placeholder: null,
    columns: { feed: true, stories: true, daily: key === "manufacturing" },
    categories: [],
    notice: { footer: null, hotline: null },
    readings: { date: "2026-10-17", cards: 1, stories: 0, sources: 1, times: [], updatedAt: null },
    generatedAt: "2026-10-17T11:18:00+08:00",
    ...overrides,
  };
}

const ok = (data: unknown): Result<unknown> => ({ ok: true, data, status: 200 });
const fail = (kind: Failure["kind"], status: number | null = null): Result<unknown> => ({
  ok: false,
  failure: { kind, status, code: null, requestId: null },
});

function memory() {
  const data = new Map<string, unknown>();
  const backend: StorageBackend = {
    get: (key) => (data.has(key) ? structuredClone(data.get(key)) : ""),
    set: (key, value) => void data.set(key, structuredClone(value)),
    remove: (key) => void data.delete(key),
  };
  return { data, storage: createStorage(backend) };
}

/** 按板块回不同结果的假请求，记下请求了哪些板块。answer 返回 null 表示一直不回（连不上、超时之前）。 */
function fakeFetch(answer: (board: BoardKey) => Result<unknown> | null) {
  const calls: BoardKey[] = [];
  const fetchMeta: FetchMeta = (board) => {
    calls.push(board);
    const result = answer(board);
    return result ? Promise.resolve(result) : new Promise(() => {});
  };
  return { calls, fetchMeta };
}

const BOTH: BoardKey[] = ["manufacturing", "sports"];

test("运动健康的行业实例连不上：只有运动健康是失败，制造的元信息照常", async () => {
  const { storage } = memory();
  const { fetchMeta, calls } = fakeFetch((board) => (board === "manufacturing" ? ok(meta("manufacturing")) : fail("network")));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
  await Promise.all([store.load("manufacturing"), store.load("sports")]);
  assert.deepEqual(calls, ["manufacturing", "sports"], "各请求各的行业实例");
  assert.equal(store.states().manufacturing?.status, "ready");
  assert.equal(store.states().sports?.status, "failed");
});

test("反过来，制造挂了（503、形状不对）运动健康照常", async () => {
  for (const broken of [fail("unavailable", 503), ok({ schemaVersion: 2 })]) {
    const { storage } = memory();
    const { fetchMeta } = fakeFetch((board) => (board === "sports" ? ok(meta("sports")) : broken));
    const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
    await Promise.all([store.load("manufacturing"), store.load("sports")]);
    assert.equal(store.states().manufacturing?.status, "failed");
    assert.equal(store.states().sports?.status, "ready");
  }
});

test("一个板块的请求一直不回，不挡另一个板块：进行中的请求按板块分开，谁也不等谁", async () => {
  const { storage } = memory();
  const { fetchMeta, calls } = fakeFetch((board) => (board === "sports" ? null : ok(meta("manufacturing"))));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
  void store.load("sports");
  await store.load("manufacturing");
  assert.equal(store.states().manufacturing?.status, "ready");
  assert.equal(store.states().sports?.status, "loading");
  // 同一板块正在请求时，后来的调用等同一个请求，不再发。
  void store.load("sports", { force: true });
  assert.deepEqual(calls, ["sports", "manufacturing"]);
});

test("api 基址配错、连到了另一个板块的行业实例：这个板块是配置有误，另一个板块照常", async () => {
  const { storage } = memory();
  // 两个地址都指到了制造的行业实例。
  const { fetchMeta } = fakeFetch(() => ok(meta("manufacturing")));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
  await Promise.all([store.load("manufacturing"), store.load("sports")]);
  assert.equal(store.states().manufacturing?.status, "ready");
  assert.deepEqual(store.states().sports, { status: "mismatch", actual: "manufacturing" });
});

test("运动健康切到占位：只删运动健康自己的内容快照，制造的快照和元信息不动", async () => {
  const { storage } = memory();
  writeSnapshot(storage, "manufacturing", "feed", { cards: ["m"] }, T);
  writeSnapshot(storage, "manufacturing", "daily", { date: "2026-10-17" }, T);
  writeSnapshot(storage, "sports", "feed", { cards: ["s"] }, T);
  const { fetchMeta } = fakeFetch((board) => ok(board === "sports" ? meta("sports", { status: "placeholder" }) : meta("manufacturing")));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
  await Promise.all([store.load("manufacturing"), store.load("sports")]);
  const any = (data: unknown) => data;
  assert.equal(readSnapshot(storage, "sports", "feed", any), null);
  assert.deepEqual(readSnapshot(storage, "manufacturing", "feed", any)?.data, { cards: ["m"] });
  assert.deepEqual(readSnapshot(storage, "manufacturing", "daily", any)?.data, { date: "2026-10-17" });
  assert.equal(store.states().manufacturing?.status, "ready");
  const sports = store.states().sports;
  assert.equal(sports?.status === "ready" && sports.meta.status, "placeholder");
});

test("快照按板块读写：冷启动各放各的，每个板块成功了只覆盖自己的那份", async () => {
  const { storage, data } = memory();
  writeSnapshot(storage, "manufacturing", "meta", meta("manufacturing", { generatedAt: "old" }), T - 1000);
  const { fetchMeta } = fakeFetch((board) => (board === "sports" ? ok(meta("sports")) : fail("network")));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => T);
  // 冷启动：制造放快照（fetchedAt 为 null），运动健康没有快照。
  assert.deepEqual(store.states().manufacturing, { status: "ready", meta: meta("manufacturing", { generatedAt: "old" }), fetchedAt: null });
  assert.equal(store.states().sports, undefined);
  await Promise.all([store.load("manufacturing"), store.load("sports")]);
  // 制造刷新失败：留着快照，不变成失败；运动健康成功：写自己的快照。
  assert.equal(store.states().manufacturing?.status, "ready");
  assert.deepEqual(
    [...data.keys()].sort(),
    ["snap.v1.manufacturing.meta", "snap.v1.sports.meta"],
  );
  assert.equal((data.get("snap.v1.manufacturing.meta") as { data: MiniprogramMeta }).data.generatedAt, "old");
});

test("备用构建没有运动健康：不读运动健康的快照", () => {
  const { storage } = memory();
  writeSnapshot(storage, "sports", "meta", meta("sports"), T);
  const { fetchMeta } = fakeFetch(() => null);
  const store = createMetaStore(["manufacturing"], fetchMeta, storage, () => T);
  assert.deepEqual(store.states(), {});
});

test("60 秒内不重复请求；force 强制重拉；订阅的人收到每次变化，取消后不再收到", async () => {
  const { storage } = memory();
  let now = T;
  const { fetchMeta, calls } = fakeFetch((board) => ok(meta(board)));
  const store = createMetaStore(BOTH, fetchMeta, storage, () => now);
  const seen: string[] = [];
  const stop = store.subscribe((states) => seen.push(states.sports?.status ?? "none"));
  await store.load("sports");
  await store.load("sports");
  now += 59_000;
  await store.load("sports");
  assert.deepEqual(calls, ["sports"]);
  await store.load("sports", { force: true });
  assert.deepEqual(calls, ["sports", "sports"]);
  assert.deepEqual(seen, ["loading", "ready", "ready"]);
  stop();
  await store.load("sports", { force: true });
  assert.equal(seen.length, 3);
});
