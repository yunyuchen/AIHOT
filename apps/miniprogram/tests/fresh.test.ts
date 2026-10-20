import assert from "node:assert/strict";
import { test } from "node:test";
import { AWAY_MS, awayTooLong, FRESH_MS, isFresh } from "../src/lib/fresh.ts";

const T = Date.parse("2026-10-17T11:18:00+08:00");

test("60 秒内不重拉，满 60 秒就重拉", () => {
  assert.equal(FRESH_MS, 60_000);
  assert.equal(isFresh(T, null, T), true);
  assert.equal(isFresh(T, null, T + 59_999), true);
  assert.equal(isFresh(T, null, T + 60_000), false);
});

test("过了上次响应的 refreshAt 就重拉，哪怕还没到 60 秒", () => {
  const refreshAt = "2026-10-17T11:18:30+08:00";
  assert.equal(isFresh(T, refreshAt, T + 29_999), true);
  assert.equal(isFresh(T, refreshAt, T + 30_000), false);
  // refreshAt 比 60 秒还远时还是 60 秒到期。
  assert.equal(isFresh(T, "2026-10-17T12:00:00+08:00", T + 60_000), false);
  // 解析不了的 refreshAt 当没有。
  assert.equal(isFresh(T, "soon", T + 1_000), true);
});

test("本机时钟往回拨过时按过期算", () => {
  assert.equal(isFresh(T, null, T - 1), false);
});

test("切回：离开超过 30 分钟才强制重拉，正好 30 分钟不算（D26）", () => {
  assert.equal(AWAY_MS, 30 * 60_000);
  assert.equal(awayTooLong(T, T + AWAY_MS), false);
  assert.equal(awayTooLong(T, T + AWAY_MS + 1), true);
  assert.equal(awayTooLong(T, T + 5 * 60_000), false);
});

test("切回：冷启动第一次显示（没隐藏过）不算离开；本机时钟往回拨过算离开很久", () => {
  assert.equal(awayTooLong(null, T), false);
  assert.equal(awayTooLong(T, T - 1), true);
});
