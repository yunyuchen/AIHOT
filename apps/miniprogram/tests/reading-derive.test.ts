import assert from "node:assert/strict";
import { test } from "node:test";
import { clockOf, dayWeek, isoWeek, sectionDate, sourceTotal, stampParts, windowText } from "../src/components/reading/derive.ts";

const NOW = Date.parse("2026-11-07T06:40:00+08:00");

test("ISO 周序号：周一起算，含当年第一个周四的那一周是第 1 周", () => {
  assert.equal(isoWeek("2026-11-07"), 45);
  assert.equal(isoWeek("2026-11-02"), 45);
  assert.equal(isoWeek("2026-11-08"), 45);
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek("2025-12-29"), 1);
  assert.equal(isoWeek("2026-12-31"), 53);
  assert.equal(isoWeek("2027-01-01"), 53);
  assert.equal(isoWeek("2027-01-04"), 1);
  assert.equal(isoWeek("2026-02-30"), null);
  assert.equal(isoWeek("x"), null);
});
test("日期加星期", () => {
  assert.equal(dayWeek("2026-11-07"), "11月7日 周六");
  assert.equal(dayWeek("2026-13-01"), null);
});
test("北京时刻", () => {
  assert.equal(clockOf("2026-11-06T10:27:00Z"), "18:27");
  assert.equal(clockOf("2026-11-06T16:05:00Z"), "00:05");
  assert.equal(clockOf("坏的"), "");
});
test("段头日期：今天不写，昨天写日期和星期，更早只写星期", () => {
  assert.equal(sectionDate("2026-11-07/0", "凌晨", NOW), null);
  assert.equal(sectionDate("2026-11-07", "今天", NOW), null);
  assert.equal(sectionDate("2026-11-06", "昨天", NOW), "11月6日 周五");
  assert.equal(sectionDate("2026-11-05", "11月5日", NOW), "周四");
  assert.equal(sectionDate("2025-12-31", "2025年12月31日", NOW), "周三");
});
test("焦点“最新”的读数", () => {
  assert.deepEqual(stampParts("2026-11-06T17:53:00Z", NOW), { day: "", clock: "01:53" });
  assert.deepEqual(stampParts("2026-11-06T09:28:00Z", NOW), { day: "昨天", clock: "17:28" });
  assert.deepEqual(stampParts("2026-11-05T01:00:00Z", NOW), { day: "11-05", clock: "09:00" });
  assert.deepEqual(stampParts("2025-12-31T02:00:00Z", NOW), { day: "2025-12-31", clock: "10:00" });
  assert.equal(stampParts("坏的", NOW), null);
});
test("日报时间窗", () => {
  assert.equal(windowText({ start: "2026-11-05T08:00:00+08:00", end: "2026-11-06T08:00:00+08:00" }), "11月5日 08:00 至 11月6日 08:00");
  assert.equal(windowText(null), null);
  assert.equal(windowText({ start: "坏的", end: "2026-11-06T08:00:00+08:00" }), null);
  assert.equal(windowText({ start: null as unknown as string, end: "2026-11-06T08:00:00+08:00" }), null);
});
test("来源数：取整、至少 1", () => {
  assert.equal(sourceTotal(3), 3);
  assert.equal(sourceTotal(2.7), 2);
  assert.equal(sourceTotal(0), 1);
  assert.equal(sourceTotal(Number.NaN), 1);
});
