// Published dates on list pages: a date without a zone is read in the source's offset, whatever zone
// the server runs in (Docker runs in UTC; run this file with TZ=UTC and TZ=Asia/Shanghai to see both).
import assert from "node:assert/strict";
import { test } from "node:test";
import { dateInUrl, parseLooseDate, parsePartialDate } from "@aihot/backend/sources/web-list";

const iso = (v: string, offset?: string) => parseLooseDate(v, offset)?.toISOString() ?? null;
const partial = (v: string, now: string, offset?: string) => parsePartialDate(v, offset, new Date(now))?.toISOString() ?? null;
const fromUrl = (url: string) => dateInUrl(url)?.toISOString() ?? null;

test("a date and time without a zone is in the source's offset, not the server's", () => {
  assert.equal(iso("2026-09-26 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026-09-26T10:00:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026/09/26 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026年9月26日 10:00"), "2026-09-26T02:00:00.000Z");
  assert.equal(iso("2026-09-26 10:00", "-07:00"), "2026-09-26T17:00:00.000Z");
});

test("a bare date is midnight in the source's offset; an ISO date alone stays UTC midnight", () => {
  assert.equal(iso("2026/09/26"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("2026年9月26日"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("Sep 26, 2026"), "2026-09-25T16:00:00.000Z");
  assert.equal(iso("2026-09-26"), "2026-09-26T00:00:00.000Z");
  assert.equal(iso("September 26th, 2026", "+00:00"), "2026-09-26T00:00:00.000Z");
});

test("a date that carries its zone keeps it", () => {
  assert.equal(iso("2026-09-26T10:00:00Z"), "2026-09-26T10:00:00.000Z");
  assert.equal(iso("2026-09-26T10:00:00.000+09:00"), "2026-09-26T01:00:00.000Z");
  assert.equal(iso("Sat, 26 Sep 2026 10:00:00 GMT"), "2026-09-26T10:00:00.000Z");
  assert.equal(iso("Sat, 26 Sep 2026 10:00:00 +0200", "-07:00"), "2026-09-26T08:00:00.000Z");
});

test("no date at all is null", () => {
  assert.equal(iso(""), null);
  assert.equal(iso("yesterday"), null);
});

// 2026-10-17 11:00 in Beijing.
const NOW = "2026-10-17T03:00:00Z";

test("a month and day without the year is the latest such day; one still ahead is last year's", () => {
  assert.equal(partial("10-16", NOW), "2026-10-15T16:00:00.000Z");
  assert.equal(partial("10/16 09:30", NOW), "2026-10-16T01:30:00.000Z");
  assert.equal(partial("10月16日", NOW), "2026-10-15T16:00:00.000Z");
  assert.equal(partial("10-18", NOW), "2026-10-17T16:00:00.000Z", "tomorrow is within a day: this year");
  assert.equal(partial("12-28", NOW), "2025-12-27T16:00:00.000Z");
  // On the first morning of a year, the last day of December is the one just gone.
  assert.equal(partial("12-31", "2027-01-01T01:00:00Z"), "2026-12-30T16:00:00.000Z");
  assert.equal(partial("01-01", "2027-01-01T01:00:00Z"), "2026-12-31T16:00:00.000Z");
  // The year turns at the source's offset: 2026-12-31 20:00 UTC is already 2027 in Beijing.
  assert.equal(partial("01-01", "2026-12-31T20:00:00Z"), "2026-12-31T16:00:00.000Z");
  assert.equal(partial("10-16", NOW, "-07:00"), "2026-10-16T07:00:00.000Z");
});

test("a time alone is today, or yesterday while today's is still ahead", () => {
  assert.equal(partial("09:49", NOW), "2026-10-17T01:49:00.000Z");
  assert.equal(partial("上传时间：09:49", NOW), "2026-10-17T01:49:00.000Z");
  assert.equal(partial("11:30", NOW), "2026-10-17T03:30:00.000Z", "within the hour ahead: a clock a little fast");
  assert.equal(partial("23:50", NOW), "2026-10-16T15:50:00.000Z");
});

test("no partial date: one with its year, a day the calendar lacks, or nothing like a date", () => {
  assert.equal(partial("2026-10-16", NOW), null);
  assert.equal(partial("02-30", NOW), null);
  assert.equal(partial("13-01", NOW), null);
  assert.equal(partial("(16日 09:41)", NOW), null, "a day of the month alone names no month");
  assert.equal(partial("", NOW), null);
});

test("the day an address names: /20261010/, t20261009_, /2026/1016/, /2026/10/16/, /2026-10/16/", () => {
  assert.equal(fromUrl("https://www.thecfa.cn/cgzq/20261017/38289.html"), "2026-10-16T16:00:00.000Z");
  assert.equal(fromUrl("https://www.chinacdc.cn/jkts/202609/t20260921_1840422.html"), "2026-09-20T16:00:00.000Z");
  assert.equal(fromUrl("http://health.people.com.cn/n1/2026/1017/c14739-40816587.html"), "2026-10-16T16:00:00.000Z");
  assert.equal(fromUrl("https://jiankang.cctv.com/2026/10/13/ARTIjRpYhTRTBbvjV13KI0FN261013.shtml"), "2026-10-12T16:00:00.000Z");
  assert.equal(fromUrl("https://health.gmw.cn/2026-10/09/content_39041552.htm"), "2026-10-08T16:00:00.000Z");
  // Column and item ids are no dates, nor is a run of digits that goes on, nor a day the calendar lacks.
  assert.equal(fromUrl("https://www.sport.gov.cn/n20001280/n20745751/c30113179/content.html"), null);
  assert.equal(fromUrl("https://example.org/content_2026101612345.htm"), null);
  assert.equal(fromUrl("https://example.org/2026/0230/1.html"), null);
  assert.equal(fromUrl("not a url"), null);
});
