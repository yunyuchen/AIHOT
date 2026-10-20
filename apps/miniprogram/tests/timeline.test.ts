import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramCard } from "@aihot/contracts/miniprogram";
import { timelineSections, type TimelineSection } from "../src/lib/timeline.ts";

function card(id: string, anchorAt: string): MiniprogramCard {
  return {
    id,
    title: `标题 ${id}`,
    summary: "",
    category: null,
    source: { name: "电池网" },
    anchorAt,
    publishedAt: anchorAt,
    sourceCount: 1,
    storyId: null,
    ai: { title: true, summary: true },
  };
}

/** 段的要点：标题、小字、条数、是否当前时段、段里的卡片 id。 */
const brief = (sections: TimelineSection[]) =>
  sections.map((s) => ({ title: s.title, range: s.range, count: s.count, live: s.live, ids: s.cards.map((c) => c.id) }));

test("今天四个时段的边界：0、6、12、18 时，最新的在上，现在所在的时段是当前时段", () => {
  const cards = [
    card("19:18", "2026-10-17T19:18:00+08:00"),
    card("18:00", "2026-10-17T18:00:00+08:00"),
    card("17:59", "2026-10-17T17:59:00+08:00"),
    card("12:00", "2026-10-17T12:00:00+08:00"),
    card("11:59", "2026-10-17T11:59:00+08:00"),
    // UTC 前一天 22:00 是北京 06:00，按北京时间分段。
    card("06:00", "2026-10-16T22:00:00Z"),
    card("05:59", "2026-10-17T05:59:00+08:00"),
    card("00:00", "2026-10-17T00:00:00+08:00"),
  ];
  assert.deepEqual(brief(timelineSections(cards, "2026-10-17T19:18:00+08:00")), [
    { title: "晚间", range: "18 时以后", count: 2, live: true, ids: ["19:18", "18:00"] },
    { title: "下午", range: "12–18 时", count: 2, live: false, ids: ["17:59", "12:00"] },
    { title: "上午", range: "6–12 时", count: 2, live: false, ids: ["11:59", "06:00"] },
    { title: "凌晨", range: "0–6 时", count: 2, live: false, ids: ["05:59", "00:00"] },
  ]);
});

test("当前时段：现在所在的时段还没有卡片时，没有哪一段算当前时段", () => {
  const cards = [card("a", "2026-10-17T09:00:00+08:00"), card("b", "2026-10-17T02:00:00+08:00")];
  const sections = timelineSections(cards, "2026-10-17T13:00:00+08:00");
  assert.deepEqual(
    sections.map((s) => [s.title, s.live]),
    [
      ["上午", false],
      ["凌晨", false],
    ],
  );
  // 23:59 还在晚间。
  const late = timelineSections([card("c", "2026-10-17T23:59:00+08:00")], "2026-10-17T23:59:30+08:00");
  assert.deepEqual(brief(late), [{ title: "晚间", range: "18 时以后", count: 1, live: true, ids: ["c"] }]);
});

test("跨天：往日按天分段，昨天带日期，更早的只写日期；北京 0 点按 UTC+8 切", () => {
  const cards = [
    card("today-am", "2026-10-17T08:00:00+08:00"),
    // UTC 10-16 16:00 是北京 10-17 00:00，算今天凌晨。
    card("today-0", "2026-10-16T16:00:00Z"),
    // UTC 10-16 15:59 是北京 10-16 23:59，算昨天。
    card("y-late", "2026-10-16T15:59:00Z"),
    card("y-early", "2026-10-16T00:00:00+08:00"),
    card("older", "2026-10-15T10:00:00+08:00"),
  ];
  assert.deepEqual(brief(timelineSections(cards, "2026-10-17T08:30:00+08:00")), [
    { title: "上午", range: "6–12 时", count: 1, live: true, ids: ["today-am"] },
    { title: "凌晨", range: "0–6 时", count: 1, live: false, ids: ["today-0"] },
    { title: "昨天", range: "10月16日", count: 2, live: false, ids: ["y-late", "y-early"] },
    { title: "10月15日", range: null, count: 1, live: false, ids: ["older"] },
  ]);
});

test("跨年：1 月 1 日看 12 月 31 日还是昨天，再早的带年份", () => {
  const cards = [
    card("new", "2027-01-01T07:00:00+08:00"),
    card("eve", "2026-12-31T22:10:00+08:00"),
    card("old", "2026-12-30T09:00:00+08:00"),
    card("jan", "2026-01-05T09:00:00+08:00"),
  ];
  assert.deepEqual(brief(timelineSections(cards, "2027-01-01T09:00:00+08:00")), [
    { title: "上午", range: "6–12 时", count: 1, live: true, ids: ["new"] },
    { title: "昨天", range: "12月31日", count: 1, live: false, ids: ["eve"] },
    { title: "2026年12月30日", range: null, count: 1, live: false, ids: ["old"] },
    { title: "2026年1月5日", range: null, count: 1, live: false, ids: ["jan"] },
  ]);
  // 同一年里更早的不带年份。
  assert.equal(timelineSections([card("x", "2026-01-05T09:00:00+08:00")], "2026-10-17T09:00:00+08:00")[0]!.title, "1月5日");
});

test("空列表没有段", () => {
  assert.deepEqual(timelineSections([], "2026-10-17T19:18:00+08:00"), []);
});

test("今天还没有精选：时间轴直接从往日开始", () => {
  const cards = [
    card("a", "2026-10-16T20:00:00+08:00"),
    card("b", "2026-10-16T08:00:00+08:00"),
    card("c", "2026-10-15T10:00:00+08:00"),
  ];
  assert.deepEqual(brief(timelineSections(cards, "2026-10-17T09:00:00+08:00")), [
    { title: "昨天", range: "10月16日", count: 2, live: false, ids: ["a", "b"] },
    { title: "10月15日", range: null, count: 1, live: false, ids: ["c"] },
  ]);
});

test("触底追加后重算：条数跟着已加载的卡片变，同一段不出两个段头", () => {
  const first = [card("a", "2026-10-17T10:00:00+08:00"), card("b", "2026-10-17T07:00:00+08:00")];
  assert.deepEqual(brief(timelineSections(first, "2026-10-17T11:00:00+08:00")).map((s) => s.count), [2]);
  // 续页接着上一页（顺序偶尔不严格时也并进同一段，段按时间倒序）。
  const more = [...first, card("c", "2026-10-17T05:00:00+08:00"), card("d", "2026-10-17T06:30:00+08:00"), card("e", "2026-10-16T22:00:00+08:00")];
  assert.deepEqual(brief(timelineSections(more, "2026-10-17T11:00:00+08:00")), [
    { title: "上午", range: "6–12 时", count: 3, live: true, ids: ["a", "b", "d"] },
    { title: "凌晨", range: "0–6 时", count: 1, live: false, ids: ["c"] },
    { title: "昨天", range: "10月16日", count: 1, live: false, ids: ["e"] },
  ]);
});

test("本机时钟慢了、卡片日期比今天还晚：算进今天的晚间", () => {
  const cards = [card("next", "2026-10-18T00:05:00+08:00"), card("a", "2026-10-17T21:00:00+08:00")];
  assert.deepEqual(brief(timelineSections(cards, "2026-10-17T23:58:00+08:00")), [
    { title: "晚间", range: "18 时以后", count: 2, live: true, ids: ["next", "a"] },
  ]);
});

test("按天分段（运动健康）：今天、昨天、日期，今天这一段是当前时段，今天里不再分时段", () => {
  const cards = [
    card("evening", "2026-10-17T19:00:00+08:00"),
    card("morning", "2026-10-17T08:00:00+08:00"),
    // UTC 10-16 16:00 是北京 10-17 00:00，算今天。
    card("midnight", "2026-10-16T16:00:00Z"),
    card("y", "2026-10-16T21:00:00+08:00"),
    card("older", "2026-10-15T10:00:00+08:00"),
  ];
  assert.deepEqual(brief(timelineSections(cards, "2026-10-17T20:00:00+08:00", true)), [
    { title: "今天", range: "10月17日", count: 3, live: true, ids: ["evening", "morning", "midnight"] },
    { title: "昨天", range: "10月16日", count: 1, live: false, ids: ["y"] },
    { title: "10月15日", range: null, count: 1, live: false, ids: ["older"] },
  ]);
});

test("按天分段：今天还没有精选时从昨天开始；本机时钟慢了、卡片日期比今天还晚时算进今天", () => {
  const yesterdayOnly = [card("y", "2026-10-16T21:00:00+08:00")];
  assert.deepEqual(brief(timelineSections(yesterdayOnly, "2026-10-17T09:00:00+08:00", true)), [
    { title: "昨天", range: "10月16日", count: 1, live: false, ids: ["y"] },
  ]);
  const ahead = [card("next", "2026-10-18T00:05:00+08:00"), card("a", "2026-10-17T21:00:00+08:00")];
  assert.deepEqual(brief(timelineSections(ahead, "2026-10-17T23:58:00+08:00", true)), [
    { title: "今天", range: "10月17日", count: 2, live: true, ids: ["next", "a"] },
  ]);
});
