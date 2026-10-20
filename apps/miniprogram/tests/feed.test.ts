import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramCard, MiniprogramFeed, MiniprogramFocus } from "@aihot/contracts/miniprogram";
import type { Failure } from "../src/lib/errors.ts";
import { checkFeed, createFeedStore, FEED_PAGE_SIZE, feedPath, INITIAL_FEED, seedFeed, withoutFocus, type FeedQuery, type FeedSnapshot, type FeedState } from "../src/lib/feed.ts";
import type { Result } from "../src/lib/request.ts";

function card(id: string, overrides: Partial<MiniprogramCard> = {}): MiniprogramCard {
  return {
    id,
    title: `标题 ${id}`,
    summary: `摘要 ${id}`,
    category: "battery",
    source: { name: "电池网" },
    anchorAt: "2026-10-17T09:00:00+08:00",
    publishedAt: "2026-10-17T08:40:00+08:00",
    sourceCount: 1,
    storyId: null,
    ai: { title: true, summary: true },
    ...overrides,
  };
}

function feed(ids: string[], nextCursor: string | null, hasMore = nextCursor !== null): MiniprogramFeed {
  return {
    schemaVersion: 1,
    query: { category: null },
    focus: null,
    cards: ids.map((id) => card(id)),
    page: { nextCursor, hasMore },
    refreshAt: null,
    generatedAt: "2026-10-17T11:18:00+08:00",
  };
}

const failure = (kind: Failure["kind"], code: string | null = null): Failure => ({ kind, status: code ? 400 : null, code, requestId: null });

/** 假的请求：每次调用排一个待答的请求，测试按顺序给答复。 */
function fakeFetch() {
  const calls: { query: FeedQuery; answer: (result: Result<MiniprogramFeed>) => Promise<void> }[] = [];
  const fetchFeed = (query: FeedQuery) =>
    new Promise<Result<MiniprogramFeed>>((resolve) => {
      calls.push({
        query,
        // 答复后等一轮微任务，让 store 把状态写完。
        answer: async (result) => {
          resolve(result);
          await new Promise((r) => setTimeout(r, 0));
        },
      });
    });
  return { calls, fetchFeed };
}

const ok = (data: MiniprogramFeed): Result<MiniprogramFeed> => ({ ok: true, data, status: 200 });
const fail = (f: Failure): Result<MiniprogramFeed> => ({ ok: false, failure: f });
const ids = (state: FeedState) => state.cards.map((c) => c.id);

function setup(category: string | null = null, now: () => number = Date.now) {
  const { calls, fetchFeed } = fakeFetch();
  let state: FeedState | null = null;
  const store = createFeedStore(
    fetchFeed,
    category,
    (next) => {
      state = next;
    },
    now,
  );
  return { calls, store, state: () => state! };
}

test("请求路径：只带有值的参数，游标和分类编码", () => {
  assert.equal(feedPath({ category: null, cursor: null, limit: 20 }), "feed?limit=20");
  assert.equal(feedPath({ category: "", cursor: "", limit: 20 }), "feed?limit=20");
  assert.equal(feedPath({ category: "energy-storage", cursor: null, limit: 5 }), "feed?limit=5&category=energy-storage");
  assert.equal(feedPath({ category: null, cursor: "a+b/c=", limit: 20 }), "feed?limit=20&cursor=a%2Bb%2Fc%3D");
});

test("响应核对：v1 的形状收下，其余回 null", () => {
  assert.ok(checkFeed(feed(["a"], "c1")));
  assert.ok(checkFeed(feed([], null)));
  assert.equal(checkFeed(null), null);
  assert.equal(checkFeed("<html></html>"), null);
  assert.equal(checkFeed({ ...feed(["a"], null), schemaVersion: 2 }), null);
  assert.equal(checkFeed({ ...feed(["a"], null), cards: null }), null);
  assert.equal(checkFeed({ ...feed(["a"], null), page: null }), null);
  assert.equal(checkFeed({ ...feed(["a"], null), page: { nextCursor: 3, hasMore: true } }), null);
  assert.equal(checkFeed({ ...feed([], null), cards: [{ id: "a" }] }), null);
});

test("首页：加载中，然后拿到卡片和游标", async () => {
  const { calls, store, state } = setup();
  const done = store.refresh();
  assert.equal(state().phase, "loading");
  assert.deepEqual(calls[0]!.query, { category: null, cursor: null, limit: FEED_PAGE_SIZE });
  await calls[0]!.answer(ok(feed(["a", "b"], "c1")));
  await done;
  assert.equal(state().phase, "ready");
  assert.deepEqual(ids(state()), ["a", "b"]);
  assert.equal(state().nextCursor, "c1");
  assert.equal(state().hasMore, true);
});

test("触底：用 nextCursor 加载下一页追加，按 id 去重，带上分类筛选", async () => {
  const { calls, store, state } = setup("battery");
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a", "b"], "c1")));
  void store.loadMore();
  assert.equal(state().more, "loading");
  assert.deepEqual(calls[1]!.query, { category: "battery", cursor: "c1", limit: FEED_PAGE_SIZE });
  // 加载中再触底不重复请求。
  void store.loadMore();
  assert.equal(calls.length, 2);
  await calls[1]!.answer(ok(feed(["b", "c", "d"], "c2")));
  assert.deepEqual(ids(state()), ["a", "b", "c", "d"]);
  assert.equal(state().more, "idle");
  assert.equal(state().nextCursor, "c2");
});

test("到底：hasMore 为 false 后触底不再请求", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null, false)));
  assert.equal(state().hasMore, false);
  await store.loadMore();
  assert.equal(calls.length, 2);
});

test("到底：接口说还有但没给游标，也当到底", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], null, true)));
  assert.equal(state().hasMore, false);
  await store.loadMore();
  assert.equal(calls.length, 1);
});

test("首页还没好时触底不请求", async () => {
  const { calls, store } = setup();
  await store.loadMore();
  assert.equal(calls.length, 0);
  void store.refresh();
  void store.loadMore();
  assert.equal(calls.length, 1);
});

test("游标失效：丢掉续页、从第一页重新加载一次", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a", "b"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["c"], "c2")));
  void store.loadMore();
  await calls[2]!.answer(fail(failure("invalid_cursor", "invalid_cursor")));
  // 只留第一页的卡，重新请求第一页（不带游标）。
  assert.deepEqual(ids(state()), ["a", "b"]);
  assert.equal(state().phase, "loading");
  assert.deepEqual(calls[3]!.query, { category: null, cursor: null, limit: FEED_PAGE_SIZE });
  await calls[3]!.answer(ok(feed(["n", "a", "b"], "c9")));
  assert.equal(state().phase, "ready");
  assert.deepEqual(ids(state()), ["n", "a", "b"]);
  assert.equal(state().nextCursor, "c9");
  assert.equal(state().failure, null);
});

test("游标失效：重载后马上又失效就当普通失败，不来回循环", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(fail(failure("invalid_cursor", "invalid_cursor")));
  await calls[2]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[3]!.answer(fail(failure("invalid_cursor", "invalid_cursor")));
  assert.equal(calls.length, 4);
  assert.equal(state().more, "failed");
  assert.equal(state().failure?.kind, "invalid_cursor");
  assert.deepEqual(ids(state()), ["a"]);
});

test("游标失效：续页成功过之后再失效，可以再重载一次", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(fail(failure("invalid_cursor", "invalid_cursor")));
  await calls[2]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[3]!.answer(ok(feed(["b"], "c2")));
  void store.loadMore();
  await calls[4]!.answer(fail(failure("invalid_cursor", "invalid_cursor")));
  assert.equal(state().phase, "loading");
  assert.deepEqual(calls[5]!.query.cursor, null);
});

test("续页失败：已加载的卡不清空，重试重拉同一页", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(fail(failure("network")));
  assert.equal(state().more, "failed");
  assert.equal(state().failure?.kind, "network");
  assert.deepEqual(ids(state()), ["a"]);
  void store.retry();
  assert.equal(calls[2]!.query.cursor, "c1");
  await calls[2]!.answer(ok(feed(["b"], null)));
  assert.deepEqual(ids(state()), ["a", "b"]);
  assert.equal(state().failure, null);
});

test("首页失败：重试重拉第一页", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(fail(failure("timeout")));
  assert.equal(state().phase, "failed");
  assert.equal(state().failure?.kind, "timeout");
  void store.retry();
  assert.equal(calls[1]!.query.cursor, null);
  await calls[1]!.answer(ok(feed(["a"], null)));
  assert.equal(state().phase, "ready");
});

test("刷新顶掉迟到的旧响应", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  void store.refresh();
  // 刷新前发出的续页晚到，丢掉。
  await calls[1]!.answer(ok(feed(["old"], "c-old")));
  assert.deepEqual(ids(state()), ["a"]);
  assert.equal(state().phase, "loading");
  await calls[2]!.answer(ok(feed(["n", "a"], "c2")));
  assert.deepEqual(ids(state()), ["n", "a"]);
  assert.equal(state().nextCursor, "c2");
});

// 节流：本机时钟用假的，从 11:18 开始。
function clock() {
  let t = Date.parse("2026-10-17T11:18:00+08:00");
  return { now: () => t, advance: (ms: number) => void (t += ms) };
}

test("节流：第一页 60 秒内切回不重拉，满 60 秒重拉；记下响应时刻和 refreshAt", async () => {
  const c = clock();
  const { calls, store, state } = setup(null, c.now);
  void store.refresh();
  await calls[0]!.answer(ok({ ...feed(["a"], null), refreshAt: null }));
  assert.equal(state().fetchedAt, c.now());
  assert.equal(state().refreshAt, null);
  c.advance(59_000);
  await store.revalidate();
  assert.equal(calls.length, 1);
  c.advance(1_000);
  void store.revalidate();
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.query.cursor, null);
});

test("节流：过了上次响应的 refreshAt，不到 60 秒也重拉", async () => {
  const c = clock();
  const { calls, store, state } = setup(null, c.now);
  void store.refresh();
  await calls[0]!.answer(ok({ ...feed(["a"], null), refreshAt: "2026-10-17T11:18:20+08:00" }));
  assert.equal(state().refreshAt, "2026-10-17T11:18:20+08:00");
  c.advance(19_000);
  await store.revalidate();
  assert.equal(calls.length, 1);
  c.advance(1_000);
  void store.revalidate();
  assert.equal(calls.length, 2);
  await calls[1]!.answer(ok({ ...feed(["n", "a"], null), refreshAt: null }));
  assert.deepEqual(ids(state()), ["n", "a"]);
});

test("节流：下拉刷新强制重拉，不看 60 秒", async () => {
  const c = clock();
  const { calls, store } = setup(null, c.now);
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], null)));
  c.advance(1_000);
  void store.refresh();
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.query.cursor, null);
});

test("节流：正在加载时切回不重复请求；第一页失败后切回会重拉", async () => {
  const c = clock();
  const { calls, store } = setup(null, c.now);
  void store.refresh();
  await store.revalidate();
  assert.equal(calls.length, 1);
  await calls[0]!.answer(fail(failure("network")));
  void store.revalidate();
  assert.equal(calls.length, 2);
});

test("节流：读者已经加载了续页，切回时不把列表收回第一页（下拉才重拉）", async () => {
  const c = clock();
  const { calls, store, state } = setup(null, c.now);
  void store.refresh();
  await calls[0]!.answer(ok({ ...feed(["a"], "c1"), refreshAt: "2026-10-17T11:18:10+08:00" }));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null)));
  c.advance(120_000);
  await store.revalidate();
  assert.equal(calls.length, 2);
  assert.deepEqual(ids(state()), ["a", "b"]);
  void store.refresh();
  assert.equal(calls.length, 3);
});

// 本机快照：假的快照读写，记下每次保存和删除。
function snapshotIo(initial: MiniprogramFeed | null) {
  const saved: MiniprogramFeed[] = [];
  let dropped = 0;
  const io: FeedSnapshot = { initial, save: (f) => void saved.push(f), drop: () => void dropped++ };
  return { io, saved, dropped: () => dropped };
}

function setupWithSnapshot(initial: MiniprogramFeed | null) {
  const { calls, fetchFeed } = fakeFetch();
  const snap = snapshotIo(initial);
  let state: FeedState | null = null;
  const store = createFeedStore(fetchFeed, null, (next) => void (state = next), Date.now, snap.io);
  return { calls, store, snap, state: () => state! };
}

test("快照：冷启动先放快照里的第一页，标成快照，还没请求过", () => {
  const seeded = seedFeed({ ...feed(["a", "b"], "c1"), generatedAt: "2026-10-17T08:05:00+08:00", refreshAt: "2026-10-17T08:30:00+08:00" });
  assert.deepEqual(ids(seeded), ["a", "b"]);
  assert.equal(seeded.phase, "idle");
  assert.equal(seeded.fromSnapshot, true);
  assert.equal(seeded.generatedAt, "2026-10-17T08:05:00+08:00");
  assert.equal(seeded.fetchedAt, null);
  assert.equal(seeded.refreshAt, null);
  assert.equal(seeded.firstCount, 2);
  assert.equal(seeded.nextCursor, "c1");
  assert.deepEqual(seedFeed(null), INITIAL_FEED);
});

test("快照 → 刷新成功：换成新的第一页，整份写回快照，不再是快照", async () => {
  const { calls, store, snap, state } = setupWithSnapshot(feed(["old1", "old2"], "c0"));
  void store.refresh();
  // 刷新期间快照里的卡留着。
  assert.equal(state().phase, "loading");
  assert.deepEqual(ids(state()), ["old1", "old2"]);
  assert.equal(state().fromSnapshot, true);
  const fresh = { ...feed(["n", "old1"], "c1"), generatedAt: "2026-10-17T11:20:00+08:00" };
  await calls[0]!.answer(ok(fresh));
  assert.deepEqual(ids(state()), ["n", "old1"]);
  assert.equal(state().fromSnapshot, false);
  assert.equal(state().generatedAt, "2026-10-17T11:20:00+08:00");
  assert.deepEqual(snap.saved, [fresh]);
});

test("快照 → 刷新失败：快照里的卡不清空，还标着快照，不写快照", async () => {
  const { calls, store, snap, state } = setupWithSnapshot(feed(["old1"], null));
  void store.refresh();
  await calls[0]!.answer(fail(failure("network")));
  assert.equal(state().phase, "failed");
  assert.deepEqual(ids(state()), ["old1"]);
  assert.equal(state().fromSnapshot, true);
  assert.equal(snap.saved.length, 0);
  assert.equal(snap.dropped(), 0);
});

test("快照：续页成功不写快照（快照只存第一页）", async () => {
  const { calls, store, snap } = setupWithSnapshot(null);
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null)));
  assert.equal(snap.saved.length, 1);
  assert.deepEqual(snap.saved[0]!.cards.map((c) => c.id), ["a"]);
});

test("快照：第一页回 section_paused 时删掉快照，占位期间不留卡片", async () => {
  const { calls, store, snap, state } = setupWithSnapshot(feed(["old1"], null));
  void store.refresh();
  await calls[0]!.answer(fail({ kind: "paused", status: 403, code: "section_paused", requestId: null }));
  assert.equal(snap.dropped(), 1);
  assert.equal(state().failure?.kind, "paused");
});

test("下拉刷新失败：已加载的卡（含续页）不清空，记下失败", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null)));
  void store.refresh();
  await calls[2]!.answer(fail(failure("timeout")));
  assert.equal(state().phase, "failed");
  assert.deepEqual(ids(state()), ["a", "b"]);
  assert.equal(state().failure?.kind, "timeout");
});

test("离开超过 30 分钟切回（页面调 refresh）：已经加载的续页收回，只留新的第一页", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok(feed(["a"], "c1")));
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null)));
  void store.refresh();
  await calls[2]!.answer(ok(feed(["n", "a"], "c2")));
  assert.deepEqual(ids(state()), ["n", "a"]);
  assert.equal(state().firstCount, 2);
  assert.equal(state().nextCursor, "c2");
});

function focusOf(id: string): MiniprogramFocus {
  return { ...card(id), sourceNames: ["电池网", "高工锂电"], latestAt: "2026-10-17T10:00:00+08:00" };
}

test("焦点卡：响应核对时形状不对或没有这个字段只当没有焦点卡，不连累整页", () => {
  assert.deepEqual(checkFeed({ ...feed(["a"], null), focus: focusOf("a") })?.focus, focusOf("a"));
  assert.equal(checkFeed(feed(["a"], null))?.focus, null);
  const { focus: _, ...withoutField } = feed(["a"], null);
  assert.equal(checkFeed(withoutField)?.focus, null);
  assert.equal(checkFeed({ ...feed(["a"], null), focus: { ...focusOf("a"), sourceNames: "电池网" } })?.focus, null);
  assert.equal(checkFeed({ ...feed(["a"], null), focus: { id: "a" } })?.cards.length, 1);
});

test("焦点卡：第一页带的焦点卡记进状态，续页不改它；刷新换成新的", async () => {
  const { calls, store, state } = setup();
  void store.refresh();
  await calls[0]!.answer(ok({ ...feed(["f", "a"], "c1"), focus: focusOf("f") }));
  assert.equal(state().focus?.id, "f");
  // 卡片列表里焦点那张照样在，画时间轴时才去掉。
  assert.deepEqual(ids(state()), ["f", "a"]);
  void store.loadMore();
  await calls[1]!.answer(ok(feed(["b"], null)));
  assert.equal(state().focus?.id, "f");
  void store.refresh();
  await calls[2]!.answer(ok(feed(["n"], null)));
  assert.equal(state().focus, null);
});

test("焦点卡：带分类筛选的列表不收焦点卡；快照里的焦点卡冷启动先放出来", async () => {
  const { calls, store, state } = setup("battery");
  void store.refresh();
  await calls[0]!.answer(ok({ ...feed(["f"], null), focus: focusOf("f") }));
  assert.equal(state().focus, null);
  assert.equal(seedFeed({ ...feed(["f", "a"], null), focus: focusOf("f") }).focus?.id, "f");
  assert.equal(INITIAL_FEED.focus, null);
});

test("时间轴去掉焦点卡：按 id 去掉那一张，顺序不变；没有焦点卡时原样", () => {
  const cards = ["a", "f", "b"].map((id) => card(id));
  assert.deepEqual(withoutFocus(cards, "f").map((c) => c.id), ["a", "b"]);
  assert.deepEqual(withoutFocus(cards, null).map((c) => c.id), ["a", "f", "b"]);
  // 焦点卡还不在已加载的卡里（比如在续页上）：什么都不去掉。
  assert.deepEqual(withoutFocus(cards, "z").map((c) => c.id), ["a", "f", "b"]);
  assert.deepEqual(withoutFocus([card("f")], "f"), []);
});
