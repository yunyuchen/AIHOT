import assert from "node:assert/strict";
import { test } from "node:test";
import { beijingDate, displayDate, displayTime, headerDate } from "../src/lib/beijing.ts";

test("北京日期按 UTC+8 跨日", () => {
  assert.equal(beijingDate("2026-10-16T15:59:59Z"), "2026-10-16");
  assert.equal(beijingDate("2026-10-16T16:00:00Z"), "2026-10-17");
  assert.equal(beijingDate("2026-10-17T00:30:00+08:00"), "2026-10-17");
  assert.equal(beijingDate(Date.parse("2026-12-31T16:00:00Z")), "2027-01-01");
});

test("头部日期：月日不补零，星期写成周几", () => {
  assert.deepEqual(headerDate("2026-10-16"), { day: "10月16日", weekday: "周五" });
  assert.deepEqual(headerDate("2026-10-18"), { day: "10月18日", weekday: "周日" });
  assert.deepEqual(headerDate("2026-10-19"), { day: "10月19日", weekday: "周一" });
  assert.deepEqual(headerDate("2027-01-05"), { day: "1月5日", weekday: "周二" });
  assert.deepEqual(headerDate("2028-02-29"), { day: "2月29日", weekday: "周二" });
});

test("头部日期：不是合法的 YYYY-MM-DD 回 null", () => {
  assert.equal(headerDate(""), null);
  assert.equal(headerDate("2026-10-16T00:00:00Z"), null);
  assert.equal(headerDate("2026-02-30"), null);
  assert.equal(headerDate("2026-13-01"), null);
});

// “现在”取北京时间 2026-10-17 11:18。
const NOW = "2026-10-17T11:18:00+08:00";

test("时间显示：当天 HH:mm", () => {
  assert.equal(displayTime("2026-10-17T09:05:00+08:00", NOW), "09:05");
  assert.equal(displayTime("2026-10-17T00:00:00+08:00", NOW), "00:00");
  // 北京时间换算：UTC 前一天 16:00 是北京当天 0 点，不按设备时区。
  assert.equal(displayTime("2026-10-16T16:00:00Z", NOW), "00:00");
  assert.equal(displayTime(Date.parse("2026-10-17T03:18:00Z"), NOW), "11:18");
});

test("时间显示：昨天“昨天 HH:mm”", () => {
  assert.equal(displayTime("2026-10-16T19:18:00+08:00", NOW), "昨天 19:18");
  // UTC 当天 15:59 还是北京昨天 23:59。
  assert.equal(displayTime("2026-10-16T15:59:00Z", NOW), "昨天 23:59");
  assert.equal(displayTime("2026-10-16T00:00:00+08:00", NOW), "昨天 00:00");
});

test("时间显示：今年更早 MM-DD HH:mm", () => {
  assert.equal(displayTime("2026-10-15T23:59:00+08:00", NOW), "10-15 23:59");
  assert.equal(displayTime("2026-01-01T00:00:00+08:00", NOW), "01-01 00:00");
  // UTC 当天 15:59 是北京 10-15 23:59，16:00 才进 10-16（昨天）。
  assert.equal(displayTime("2026-10-15T15:59:00Z", NOW), "10-15 23:59");
});

test("时间显示：跨年 YYYY-MM-DD", () => {
  assert.equal(displayTime("2025-12-31T23:59:00+08:00", NOW), "2025-12-31");
  // UTC 2025-12-31 16:00 已经是北京 2026-01-01，算今年。
  assert.equal(displayTime("2025-12-31T16:00:00Z", NOW), "01-01 00:00");
});

test("时间显示：1 月 1 日看 12 月 31 日是昨天，不按跨年", () => {
  const newYear = "2027-01-01T08:00:00+08:00";
  assert.equal(displayTime("2026-12-31T22:10:00+08:00", newYear), "昨天 22:10");
  assert.equal(displayTime("2026-12-30T22:10:00+08:00", newYear), "2026-12-30");
  assert.equal(displayTime("2027-01-01T07:59:00+08:00", newYear), "07:59");
});

test("时间显示：时刻解析不了回空字符串", () => {
  assert.equal(displayTime("not a time", NOW), "");
});

test("只要日期的地方：今年写 MM-DD（当天、昨天也写日期），跨年写 YYYY-MM-DD", () => {
  assert.equal(displayDate("2026-10-17T08:00:00+08:00", NOW), "10-17");
  assert.equal(displayDate("2026-10-16T22:10:00+08:00", NOW), "10-16");
  assert.equal(displayDate("2026-01-01T00:00:00+08:00", NOW), "01-01");
  assert.equal(displayDate("2025-12-31T23:59:00+08:00", NOW), "2025-12-31");
});

test("只要日期的地方：按北京日期切日", () => {
  assert.equal(displayDate("2026-10-15T15:59:00Z", NOW), "10-15");
  assert.equal(displayDate("2026-10-15T16:00:00Z", NOW), "10-16");
  // UTC 2025-12-31 16:00 已经是北京 2026-01-01，算今年。
  assert.equal(displayDate("2025-12-31T16:00:00Z", NOW), "01-01");
  assert.equal(displayDate("not a time", NOW), "");
});
