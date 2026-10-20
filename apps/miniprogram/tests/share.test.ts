import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { test } from "node:test";
import type { MiniprogramDaily, MiniprogramItem } from "@aihot/contracts/miniprogram";
import type { DailyScreen } from "../src/lib/daily.ts";
import type { Failure } from "../src/lib/errors.ts";
import type { ItemScreen } from "../src/lib/item.ts";
import { appShare, FEED_PATH, issueShare, itemShare, probeFailed, shareFields, shareImage, tabShare, type ShareBasis } from "../src/lib/share.ts";

const FALLBACK = "/assets/share/fallback.png";
const ITEM_IMAGE = "https://hot.example/og/mp/items/it_1.png";
const DAILY_IMAGE = "https://hot.example/og/mp/dailies/2026-10-16.png";

/** failed 里的分享图预检时拿不到。 */
const basis = (...failed: string[]): ShareBasis => ({ appName: "锐奇热点", fallbackImage: FALLBACK, imageFailed: (url) => failed.includes(url) });
const APP = { title: "锐奇热点", path: "/pages/feed/index", imageUrl: FALLBACK };

function item(overrides: Partial<MiniprogramItem> = {}): MiniprogramItem {
  return {
    schemaVersion: 1,
    id: "it_1",
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    summary: "…",
    category: "semiconductor",
    source: { name: "Compound Semiconductor" },
    publishedAt: "2026-10-15T09:30:00+08:00",
    reason: null,
    sourceCount: 1,
    originalUrl: "https://example.com/news/1",
    fullText: { allowed: false, html: null, translated: false, complete: true },
    story: null,
    ai: { title: true, summary: true, reason: false, body: false },
    share: { title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议", imageUrl: ITEM_IMAGE },
    generatedAt: "2026-10-17T11:18:00+08:00",
    ...overrides,
  };
}

function daily(overrides: Partial<MiniprogramDaily> = {}): MiniprogramDaily {
  return {
    schemaVersion: 1,
    date: "2026-10-16",
    title: "锐奇制造日报",
    publishedAt: "2026-10-16T08:00:30+08:00",
    window: { start: "2026-10-15T08:00:00+08:00", end: "2026-10-16T08:00:00+08:00" },
    lead: { title: "七部门印发新型电池产业“十五五”规划", paragraph: "…" },
    highlights: [{ itemId: "p1", title: "第一条要闻", source: { name: "甲" }, ai: { title: true } }],
    sections: [],
    flashes: [],
    prev: "2026-10-15",
    next: null,
    ai: { leadTitle: true, leadParagraph: true },
    share: { title: "锐奇制造日报 10 月 16 日：七部门印发新型电池产业“十五五”规划", imageUrl: DAILY_IMAGE },
    generatedAt: "2026-10-16T08:05:00+08:00",
    ...overrides,
  };
}

const failure = (kind: Failure["kind"]): Failure => ({ kind, status: null, code: null, requestId: null });
const TARGET = { board: "manufacturing" as const, id: "it_1" };
const itemContent = (i = item()): ItemScreen => ({ kind: "content", item: i });
const dailyContent = (d = daily()): DailyScreen => ({ kind: "content", daily: d, stale: null, snapshotAt: null });

test("tab 页转发小程序本身（D27）：指向精选页，标题“锐奇热点”，包里的兜底图", () => {
  assert.equal(FEED_PATH, "/pages/feed/index");
  assert.deepEqual(appShare(basis()), APP);
});

test("tab 页的分享回调：右上角菜单一律转发小程序本身；日报 tab 的“分享日报”按钮分享那一期", () => {
  const issue = { title: "锐奇制造日报 10 月 16 日", path: "/pages/daily-issue/index?board=manufacturing&date=2026-10-16", imageUrl: DAILY_IMAGE };
  assert.deepEqual(tabShare("menu", null, basis()), APP);
  assert.deepEqual(tabShare("menu", issue, basis()), APP);
  assert.deepEqual(tabShare(undefined, null, basis()), APP);
  assert.deepEqual(tabShare("button", issue, basis()), issue);
  // 按钮只在有内容时画；万一没有这一期，也退回转发小程序本身。
  assert.deepEqual(tabShare("button", null, basis()), APP);
});

test("share 字段：标题非空、图是 http(s) 绝对地址才用，缺了或形状不对的那一项是 null", () => {
  assert.deepEqual(shareFields({ title: " 标题 ", imageUrl: ITEM_IMAGE }), { title: "标题", imageUrl: ITEM_IMAGE });
  assert.deepEqual(shareFields(undefined), { title: null, imageUrl: null });
  assert.deepEqual(shareFields(null), { title: null, imageUrl: null });
  assert.deepEqual(shareFields("x"), { title: null, imageUrl: null });
  assert.deepEqual(shareFields({ title: "  ", imageUrl: "/og/mp/items/it_1.png" }), { title: null, imageUrl: null });
  assert.deepEqual(shareFields({ title: "标题", imageUrl: 3 }), { title: "标题", imageUrl: null });
  assert.deepEqual(shareFields({ imageUrl: ITEM_IMAGE }), { title: null, imageUrl: ITEM_IMAGE });
});

test("分享图预检：4xx、5xx 算拿不到；没拿到响应不下结论，照样用远程图", () => {
  assert.equal(probeFailed(403), true); // 整改开关为占位
  assert.equal(probeFailed(404), true); // 撤稿
  assert.equal(probeFailed(503), true); // 出图失败
  assert.equal(probeFailed(429), true);
  assert.equal(probeFailed(200), false);
  assert.equal(probeFailed(304), false);
  assert.equal(probeFailed(null), false); // 连不上、超时、域名不在 request 合法域名里
});

test("分享图：有远程图并且预检没说拿不到才用它，否则用兜底图", () => {
  assert.equal(shareImage(ITEM_IMAGE, basis()), ITEM_IMAGE);
  assert.equal(shareImage(ITEM_IMAGE, basis(ITEM_IMAGE)), FALLBACK);
  assert.equal(shareImage(null, basis()), FALLBACK);
});

test("条目页分享：有内容时用 share.title、这条的条目页、远程分享图", () => {
  assert.deepEqual(itemShare(TARGET, itemContent(), basis()), {
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    path: "/pages/item/index?board=manufacturing&id=it_1",
    imageUrl: ITEM_IMAGE,
  });
  // id 编码；路径用接口回的 id。
  const odd = item({ id: "a b&c", share: { title: "运动", imageUrl: "https://sports.example/og/mp/items/x.png" } });
  assert.deepEqual(itemShare({ board: "sports", id: "a b&c" }, itemContent(odd), basis()), {
    title: "运动",
    path: "/pages/item/index?board=sports&id=a%20b%26c",
    imageUrl: "https://sports.example/og/mp/items/x.png",
  });
});

test("条目页分享图拿不到：share 缺失或形状不对、预检失败，都换兜底图；share 缺了标题用条目标题", () => {
  const noShare = item({ share: undefined as unknown as MiniprogramItem["share"] });
  assert.deepEqual(itemShare(TARGET, itemContent(noShare), basis()), {
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    path: "/pages/item/index?board=manufacturing&id=it_1",
    imageUrl: FALLBACK,
  });
  const badImage = item({ share: { title: "标题", imageUrl: "" } });
  assert.equal(itemShare(TARGET, itemContent(badImage), basis()).imageUrl, FALLBACK);
  assert.equal(itemShare(TARGET, itemContent(), basis(ITEM_IMAGE)).imageUrl, FALLBACK);
});

test("条目页没有内容时：已下线或参数不对转发小程序本身；占位、加载中、失败仍指向这条，标题用小程序名、图用兜底图", () => {
  assert.deepEqual(itemShare(null, { kind: "missing" }, basis()), APP);
  assert.deepEqual(itemShare(TARGET, { kind: "missing" }, basis()), APP);
  const holding = { title: "锐奇热点", path: "/pages/item/index?board=manufacturing&id=it_1", imageUrl: FALLBACK };
  assert.deepEqual(itemShare(TARGET, { kind: "placeholder" }, basis()), holding);
  assert.deepEqual(itemShare(TARGET, { kind: "loading" }, basis()), holding);
  assert.deepEqual(itemShare(TARGET, { kind: "failed", failure: failure("network") }, basis()), holding);
});

test("日报分享：路径一律是那一期的某期日报页；日报 tab 看最新一期（date 为 null）时也用那一期的日期", () => {
  const expected = {
    title: "锐奇制造日报 10 月 16 日：七部门印发新型电池产业“十五五”规划",
    path: "/pages/daily-issue/index?board=manufacturing&date=2026-10-16",
    imageUrl: DAILY_IMAGE,
  };
  assert.deepEqual(issueShare("manufacturing", null, dailyContent(), basis()), expected);
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", dailyContent(), basis()), expected);
  // 日报 tab 里翻到往期：分享正在看的那一期。
  const older = daily({ date: "2026-10-12", share: { title: "锐奇制造日报 10 月 12 日", imageUrl: "https://hot.example/og/mp/dailies/2026-10-12.png" } });
  assert.equal(issueShare("manufacturing", "2026-10-12", dailyContent(older), basis()).path, "/pages/daily-issue/index?board=manufacturing&date=2026-10-12");
});

test("日报分享图拿不到：share 缺失换兜底图，标题按接口的写法拼；预检失败换兜底图", () => {
  const noShare = daily({ share: undefined as unknown as MiniprogramDaily["share"] });
  assert.deepEqual(issueShare("manufacturing", null, dailyContent(noShare), basis()), {
    title: "锐奇制造日报 10 月 16 日：七部门印发新型电池产业“十五五”规划",
    path: "/pages/daily-issue/index?board=manufacturing&date=2026-10-16",
    imageUrl: FALLBACK,
  });
  const noLead = daily({ lead: null, date: "2026-10-07", share: { title: "", imageUrl: "nope" } });
  assert.equal(issueShare("manufacturing", null, dailyContent(noLead), basis()).title, "锐奇制造日报 10 月 7 日：第一条要闻");
  const empty = daily({ lead: null, highlights: [], share: null as unknown as MiniprogramDaily["share"] });
  assert.equal(issueShare("manufacturing", null, dailyContent(empty), basis()).title, "锐奇制造日报 10 月 16 日");
  assert.equal(issueShare("manufacturing", null, dailyContent(), basis(DAILY_IMAGE)).imageUrl, FALLBACK);
});

test("日报没有内容时：没有这一期、配置有误、没有日报栏目转发小程序本身；占位、加载中、失败知道日期就指向那一期", () => {
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "missing", latest: false }, basis()), APP);
  assert.deepEqual(issueShare("manufacturing", null, { kind: "missing", latest: true }, basis()), APP);
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "mismatch", actual: "sports" }, basis()), APP);
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "off" }, basis()), APP);
  const holding = { title: "锐奇热点", path: "/pages/daily-issue/index?board=manufacturing&date=2026-10-16", imageUrl: FALLBACK };
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "placeholder", title: "t", body: "b" }, basis()), holding);
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "loading" }, basis()), holding);
  assert.deepEqual(issueShare("manufacturing", "2026-10-16", { kind: "failed", failure: failure("timeout") }, basis()), holding);
  // 最新一期还没回来、不知道日期。
  assert.deepEqual(issueShare("manufacturing", null, { kind: "loading" }, basis()), APP);
});

test("本地兜底图：5:4 的 PNG，大于 2KB（Taro 不会内联成 base64，分享接口才认），体积不超过 20KB", () => {
  const path = new URL("../src/assets/share/fallback.png", import.meta.url);
  const png = readFileSync(path);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.subarray(12, 16).toString("latin1"), "IHDR");
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width * 4, height * 5);
  const bytes = statSync(path).size;
  assert.ok(bytes > 2048, `兜底图只有 ${bytes} 字节`);
  assert.ok(bytes <= 20 * 1024, `兜底图有 ${bytes} 字节`);
});

test("哪些页面能转发：五个 tab 页、条目页、某期日报页开 enableShareAppMessage；事件页、文档页不开；都不开朋友圈分享", () => {
  const config = (page: string) => readFileSync(new URL(`../src/pages/${page}/index.config.ts`, import.meta.url), "utf8");
  for (const page of ["feed", "daily", "sports", "saved", "reechi", "item", "daily-issue"]) {
    assert.match(config(page), /enableShareAppMessage: true/, page);
  }
  for (const page of ["story", "doc"]) assert.doesNotMatch(config(page), /enableShareAppMessage/, page);
  for (const page of ["feed", "daily", "sports", "saved", "reechi", "item", "daily-issue", "story", "doc"]) {
    assert.doesNotMatch(config(page), /enableShareTimeline/, page);
  }
});

test("页面接的分享回调：五个 tab 页用 useTabShare（D27），条目页、某期日报页用 usePageShare，事件页不接", () => {
  const source = (page: string) => readFileSync(new URL(`../src/pages/${page}/index.tsx`, import.meta.url), "utf8");
  for (const page of ["feed", "daily", "sports", "saved", "reechi"]) assert.match(source(page), /\buseTabShare\(/, page);
  for (const page of ["item", "daily-issue"]) assert.match(source(page), /\busePageShare\(/, page);
  for (const page of ["story", "doc"]) assert.doesNotMatch(source(page), /useShareAppMessage|useTabShare|usePageShare/, page);
});
