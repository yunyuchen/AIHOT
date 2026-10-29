import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILT_IN_PLACEHOLDER, checkMeta, placeholderText, snapshotMeta } from "../src/lib/meta.ts";

const meta = {
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

test("板块 key 对上时通过", () => {
  const checked = checkMeta(meta, "manufacturing");
  assert.equal(checked.ok, true);
});

test("板块 key 对不上时报 board_mismatch，带上接口回的 key", () => {
  assert.deepEqual(checkMeta(meta, "sports"), { ok: false, reason: "board_mismatch", actual: "manufacturing" });
});

test("不是 v1 元信息时报 malformed", () => {
  assert.deepEqual(checkMeta({ ...meta, schemaVersion: 2 }, "manufacturing"), { ok: false, reason: "malformed" });
  assert.deepEqual(checkMeta("<html></html>", "manufacturing"), { ok: false, reason: "malformed" });
  assert.deepEqual(checkMeta(null, "manufacturing"), { ok: false, reason: "malformed" });
  assert.deepEqual(checkMeta({ schemaVersion: 1 }, "manufacturing"), { ok: false, reason: "malformed" });
});

test("本机快照里的元信息：正常的才拿来先显示，占位的、板块不对的、坏的都不用", () => {
  assert.equal(snapshotMeta(meta, "manufacturing")?.board.key, "manufacturing");
  assert.equal(snapshotMeta({ ...meta, status: "placeholder" }, "manufacturing"), null);
  assert.equal(snapshotMeta(meta, "sports"), null);
  assert.equal(snapshotMeta({ ...meta, schemaVersion: 2 }, "manufacturing"), null);
  assert.equal(snapshotMeta("", "manufacturing"), null);
});

test("占位文案：行业包给了就用，没给或标题为空用内置文案（D30）", () => {
  assert.deepEqual(placeholderText({ title: "这个板块正在调整", body: "暂不提供内容，其他板块照常。" }), {
    title: "这个板块正在调整",
    body: "暂不提供内容，其他板块照常。",
  });
  assert.deepEqual(placeholderText(null), { title: BUILT_IN_PLACEHOLDER, body: null });
  assert.deepEqual(placeholderText(undefined), { title: BUILT_IN_PLACEHOLDER, body: null });
  assert.deepEqual(placeholderText({ title: "  ", body: "只有正文" }), { title: BUILT_IN_PLACEHOLDER, body: null });
  assert.deepEqual(placeholderText({ title: "调整中", body: "" }), { title: "调整中", body: null });
});
