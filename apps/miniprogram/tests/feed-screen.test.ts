import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramCard, MiniprogramFeed, MiniprogramFocus, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { Failure } from "../src/lib/errors.ts";
import { INITIAL_FEED, seedFeed, type FeedState } from "../src/lib/feed.ts";
import { feedScreen, visibleFocus } from "../src/lib/feed-screen.ts";
import { snapshotStamp, staleNotice } from "../src/lib/screen.ts";
import { BUILT_IN_PLACEHOLDER, type MetaState } from "../src/lib/meta.ts";

const NOW = Date.parse("2026-10-17T11:18:00+08:00");

const meta: MiniprogramMeta = {
  schemaVersion: 1,
  board: { key: "manufacturing", name: "制造", siteName: "锐奇制造日报", description: "…" },
  status: "normal",
  placeholder: null,
  columns: { feed: true, stories: true, daily: true },
  categories: [{ key: "battery", label: "锂电" }],
  notice: { footer: null, hotline: null },
  readings: { date: "2026-10-17", cards: 12, stories: 10, sources: 150, times: [], updatedAt: null },
  generatedAt: "2026-10-17T11:18:00+08:00",
};

const ready = (overrides: Partial<MiniprogramMeta> = {}, fetchedAt: number | null = NOW): MetaState => ({
  status: "ready",
  meta: { ...meta, ...overrides },
  fetchedAt,
});
const placeholderMeta = (placeholder: MiniprogramMeta["placeholder"] = null) => ready({ status: "placeholder", placeholder });

const failure = (kind: Failure["kind"]): Failure => ({ kind, status: kind === "unavailable" ? 503 : null, code: null, requestId: null });
const pausedFailure: Failure = { kind: "paused", status: 403, code: "section_paused", requestId: null };

function card(id: string, anchorAt = "2026-10-17T09:00:00+08:00"): MiniprogramCard {
  return {
    id,
    title: `标题 ${id}`,
    summary: "",
    category: "battery",
    source: { name: "电池网" },
    anchorAt,
    publishedAt: anchorAt,
    sourceCount: 1,
    storyId: null,
    ai: { title: true, summary: true },
  };
}

function page(cards: MiniprogramCard[], generatedAt = "2026-10-17T08:05:00+08:00"): MiniprogramFeed {
  return { schemaVersion: 1, query: { category: null }, focus: null, cards, page: { nextCursor: null, hasMore: false }, refreshAt: null, generatedAt };
}

/** 刚成功拿到第一页的列表。 */
function loaded(cards: MiniprogramCard[], generatedAt = "2026-10-17T11:18:00+08:00"): FeedState {
  return { ...INITIAL_FEED, phase: "ready", cards, firstCount: cards.length, fetchedAt: NOW, generatedAt };
}

test("冷启动有快照：先显示快照的卡片，头部标上快照的时间，不提示网络不好", () => {
  const snapshot = seedFeed(page([card("a")]));
  const refreshing: FeedState = { ...snapshot, phase: "loading" };
  for (const feed of [snapshot, refreshing]) {
    assert.deepEqual(feedScreen(ready({}, null), feed), { kind: "content", stale: null, snapshotAt: "2026-10-17T08:05:00+08:00" });
  }
  // 元信息还没有（没有元信息快照）也照样先显示卡片。
  assert.equal(feedScreen({ status: "loading" }, refreshing).kind, "content");
});

test("快照 → 刷新成功：普通的内容，不再标快照时间", () => {
  assert.deepEqual(feedScreen(ready(), loaded([card("n"), card("a")])), { kind: "content", stale: null, snapshotAt: null });
});

test("快照 → 刷新失败（网络、超时、503）：卡片不清空，顶部提示网络不好，头部不再重复标时间", () => {
  for (const kind of ["network", "timeout", "unavailable", "error"] as const) {
    const feed: FeedState = { ...seedFeed(page([card("a")])), phase: "failed", failure: failure(kind) };
    assert.deepEqual(feedScreen(ready({}, null), feed), { kind: "content", stale: failure(kind), snapshotAt: null });
  }
});

test("已有内容时下拉刷新失败：同样是顶部提示，列表留着", () => {
  const feed: FeedState = { ...loaded([card("a"), card("b")]), phase: "failed", failure: failure("network") };
  assert.deepEqual(feedScreen(ready(), feed), { kind: "content", stale: failure("network"), snapshotAt: null });
});

test("有卡片但元信息失败了（没有快照）：也是顶部提示，不整屏报错", () => {
  const screen = feedScreen({ status: "failed", failure: failure("network") }, loaded([card("a")]));
  assert.deepEqual(screen, { kind: "content", stale: failure("network"), snapshotAt: null });
});

test("续页失败不算刷新失败：不出顶部提示（底部有重试）", () => {
  const feed: FeedState = { ...loaded([card("a")]), more: "failed", failure: failure("network") };
  assert.deepEqual(feedScreen(ready(), feed), { kind: "content", stale: null, snapshotAt: null });
});

test("没有任何卡片时失败：整屏加载失败加重试", () => {
  const feed: FeedState = { ...INITIAL_FEED, phase: "failed", failure: failure("unavailable") };
  assert.deepEqual(feedScreen(ready(), feed), { kind: "failed", failure: failure("unavailable") });
  // 元信息失败、第一页还在加载：也先显示失败（重试会两个都拉）。
  const metaFailed: MetaState = { status: "failed", failure: failure("timeout") };
  assert.deepEqual(feedScreen(metaFailed, { ...INITIAL_FEED, phase: "loading" }), { kind: "failed", failure: failure("timeout") });
});

test("还没有卡片、第一页还没回来：加载中", () => {
  assert.deepEqual(feedScreen({ status: "loading" }, INITIAL_FEED), { kind: "loading" });
  assert.deepEqual(feedScreen(ready(), { ...INITIAL_FEED, phase: "loading" }), { kind: "loading" });
});

test("空态：第一页成功回来、一张卡都没有", () => {
  assert.deepEqual(feedScreen(ready(), loaded([])), { kind: "empty", filtered: false });
  assert.deepEqual(feedScreen({ status: "loading" }, loaded([])), { kind: "empty", filtered: false });
});

test("空态：筛了分类时是分类的空态（“这个分类最近没有内容”加“看全部”），和整个板块没有精选分开", () => {
  assert.deepEqual(feedScreen(ready(), loaded([]), "sleep"), { kind: "empty", filtered: true });
  // 筛了分类、第一页还没回来或失败了，照常是加载中、加载失败，不是空态。
  assert.deepEqual(feedScreen(ready(), { ...INITIAL_FEED, phase: "loading" }, "sleep"), { kind: "loading" });
  assert.equal(feedScreen(ready(), { ...INITIAL_FEED, phase: "failed", failure: failure("network") }, "sleep").kind, "failed");
  // 占位优先于分类的空态。
  assert.equal(feedScreen(placeholderMeta(), loaded([]), "sleep").kind, "placeholder");
});

test("今天没有、往日有：不算空态，照常显示内容", () => {
  const yesterday = card("y", "2026-10-16T21:00:00+08:00");
  assert.equal(feedScreen(ready({ readings: { ...meta.readings, cards: 0 } }), loaded([yesterday])).kind, "content");
});

test("占位：元信息是 placeholder 时整屏占位，哪怕手上有卡片（含快照）", () => {
  assert.deepEqual(feedScreen(placeholderMeta(), loaded([card("a")])), { kind: "placeholder", title: BUILT_IN_PLACEHOLDER, body: null });
  assert.deepEqual(feedScreen(placeholderMeta(), seedFeed(page([card("a")]))).kind, "placeholder");
  assert.deepEqual(feedScreen(placeholderMeta(), INITIAL_FEED).kind, "placeholder");
});

test("占位：行业包给了文案就用行业包的", () => {
  const screen = feedScreen(placeholderMeta({ title: "这个板块正在调整", body: "暂不提供内容，其他板块照常。" }), INITIAL_FEED);
  assert.deepEqual(screen, { kind: "placeholder", title: "这个板块正在调整", body: "暂不提供内容，其他板块照常。" });
});

test("占位：元信息还是正常（60 秒内的旧值）但精选流回了 section_paused，也是占位；文案取手上元信息的", () => {
  const firstPage: FeedState = { ...seedFeed(page([card("a")])), phase: "failed", failure: pausedFailure };
  assert.deepEqual(feedScreen(ready(), firstPage), { kind: "placeholder", title: BUILT_IN_PLACEHOLDER, body: null });
  const withText = ready({ placeholder: { title: "调整中", body: "" } });
  assert.deepEqual(feedScreen(withText, firstPage), { kind: "placeholder", title: "调整中", body: null });
  // 续页回 section_paused 一样。
  const more: FeedState = { ...loaded([card("a")]), more: "failed", failure: pausedFailure };
  assert.equal(feedScreen(ready(), more).kind, "placeholder");
  // 元信息也没有时用内置文案。
  assert.deepEqual(feedScreen({ status: "loading" }, { ...INITIAL_FEED, phase: "failed", failure: pausedFailure }), {
    kind: "placeholder",
    title: BUILT_IN_PLACEHOLDER,
    body: null,
  });
});

test("api 完全连不上：是加载失败，不是占位", () => {
  const metaDown: MetaState = { status: "failed", failure: failure("network") };
  const feedDown: FeedState = { ...INITIAL_FEED, phase: "failed", failure: failure("network") };
  assert.deepEqual(feedScreen(metaDown, feedDown), { kind: "failed", failure: failure("network") });
  // 超时、503 也一样。
  assert.equal(feedScreen({ status: "failed", failure: failure("timeout") }, { ...feedDown, failure: failure("unavailable") }).kind, "failed");
});

test("配置有误优先于一切：连到别的行业实例时它的占位和卡片都不作数", () => {
  const mismatch: MetaState = { status: "mismatch", actual: "sports" };
  assert.deepEqual(feedScreen(mismatch, { ...INITIAL_FEED, phase: "failed", failure: pausedFailure }), { kind: "mismatch", actual: "sports" });
  assert.deepEqual(feedScreen(mismatch, loaded([card("a")])), { kind: "mismatch", actual: "sports" });
});

test("顶部提示的文案：按统一的时间显示写 generatedAt", () => {
  assert.equal(staleNotice("2026-10-17T08:05:00+08:00", NOW), "网络不好，显示的是 08:05 的内容");
  assert.equal(staleNotice("2026-10-16T22:40:00+08:00", NOW), "网络不好，显示的是 昨天 22:40 的内容");
  assert.equal(staleNotice("2026-10-12T07:00:00+08:00", NOW), "网络不好，显示的是 10-12 07:00 的内容");
  assert.equal(staleNotice(null, NOW), "网络不好，显示的是之前的内容");
  assert.equal(staleNotice("not a time", NOW), "网络不好，显示的是之前的内容");
});

test("头部的快照时间标记", () => {
  assert.equal(snapshotStamp("2026-10-17T08:05:00+08:00", NOW), "08:05 的内容");
  assert.equal(snapshotStamp("2026-10-16T22:40:00+08:00", NOW), "昨天 22:40 的内容");
  assert.equal(snapshotStamp("bad", NOW), "");
});

const focus: MiniprogramFocus = { ...card("f"), sourceNames: ["电池网", "高工锂电"], latestAt: "2026-10-17T10:00:00+08:00" };

test("焦点卡：内容状态、板块渲染焦点卡、第一页带了焦点卡才画", () => {
  const feed: FeedState = { ...loaded([card("f"), card("a")]), focus };
  assert.equal(visibleFocus(feedScreen(ready(), feed), feed, true), focus);
  // 运动健康不渲染焦点卡（也就不从时间轴里去掉那张）。
  assert.equal(visibleFocus(feedScreen(ready(), feed), feed, false), null);
  const none = loaded([card("a")]);
  assert.equal(visibleFocus(feedScreen(ready(), none), none, true), null);
});

test("焦点卡：快照和“网络不好”时照样画（都是内容）", () => {
  const snapshot = seedFeed({ ...page([card("f")]), focus });
  assert.equal(visibleFocus(feedScreen(ready(), snapshot), snapshot, true), focus);
  const stale: FeedState = { ...loaded([card("f")]), focus, phase: "failed", failure: failure("network") };
  assert.equal(feedScreen(ready(), stale).kind, "content");
  assert.equal(visibleFocus(feedScreen(ready(), stale), stale, true), focus);
});

test("焦点卡：占位、配置有误、加载中、空态、加载失败都不画", () => {
  const feed: FeedState = { ...loaded([card("f")]), focus };
  assert.equal(visibleFocus(feedScreen(placeholderMeta(), feed), feed, true), null);
  assert.equal(visibleFocus(feedScreen({ status: "mismatch", actual: "sports" }, feed), feed, true), null);
  const paused: FeedState = { ...feed, phase: "failed", failure: pausedFailure };
  assert.equal(visibleFocus(feedScreen(ready(), paused), paused, true), null);
  for (const empty of [
    { ...INITIAL_FEED, focus },
    { ...INITIAL_FEED, phase: "ready" as const, focus },
    { ...INITIAL_FEED, phase: "failed" as const, failure: failure("network"), focus },
  ]) {
    assert.notEqual(feedScreen(ready(), empty).kind, "content");
    assert.equal(visibleFocus(feedScreen(ready(), empty), empty, true), null);
  }
});
