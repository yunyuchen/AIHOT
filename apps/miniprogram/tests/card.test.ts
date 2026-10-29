import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLBACK_CATEGORY_COLOR as CONFIG_FALLBACK, MANUFACTURING_CATEGORY_COLORS } from "../config/boards.ts";
import { categoryChip, FALLBACK_CATEGORY_COLOR, focusFoot, showAiBadge, sourceCountChip, tint } from "../src/lib/card.ts";

const labels = { battery: "锂电", semiconductor: "半导体", "brand-new": "新分类" };

test("兜底灰和构建配置里的一致", () => {
  assert.equal(FALLBACK_CATEGORY_COLOR, CONFIG_FALLBACK);
  assert.equal(FALLBACK_CATEGORY_COLOR, "#8a959e");
});

test("分类色标：认识的 key 用配色表的颜色，名字取元信息", () => {
  assert.deepEqual(categoryChip("battery", labels, MANUFACTURING_CATEGORY_COLORS), {
    label: "锂电",
    color: "#ff7a45",
    tint: "rgba(255, 122, 69, 0.15)",
  });
  assert.equal(categoryChip("semiconductor", labels, MANUFACTURING_CATEGORY_COLORS)?.color, "#3b7bf6");
});

test("分类色标：配色表里没有的 key 用兜底灰", () => {
  assert.equal(categoryChip("brand-new", labels, MANUFACTURING_CATEGORY_COLORS)?.color, "#8a959e");
  assert.equal(categoryChip("brand-new", labels, MANUFACTURING_CATEGORY_COLORS)?.label, "新分类");
  // 运动健康的配色表还是空的，全走兜底灰。
  assert.equal(categoryChip("battery", labels, {})?.color, "#8a959e");
  // 原型链上的键不算认识。
  assert.equal(categoryChip("constructor", {}, MANUFACTURING_CATEGORY_COLORS)?.color, "#8a959e");
});

test("分类色标：元信息还没到或表里没有时名字先显示 key", () => {
  assert.equal(categoryChip("battery", {}, MANUFACTURING_CATEGORY_COLORS)?.label, "battery");
  assert.equal(categoryChip("constructor", {}, MANUFACTURING_CATEGORY_COLORS)?.label, "constructor");
});

test("分类色标：category 为 null 不画", () => {
  assert.equal(categoryChip(null, labels, MANUFACTURING_CATEGORY_COLORS), null);
});

test("来源数量：两家起才显示，圆点最多五个", () => {
  assert.equal(sourceCountChip(1), null);
  assert.equal(sourceCountChip(0), null);
  assert.match(sourceCountChip(2)?.label ?? "", /2/);
  assert.equal(sourceCountChip(2)?.dots, 2);
  assert.match(sourceCountChip(4)?.label ?? "", /4/);
  assert.equal(sourceCountChip(4)?.dots, 4);
  assert.match(sourceCountChip(12)?.label ?? "", /12/);
  assert.equal(sourceCountChip(12)?.dots, 5);
});

test("AI 摘要角标：标题或摘要任一为真就标", () => {
  assert.equal(showAiBadge({ title: true, summary: true }), true);
  assert.equal(showAiBadge({ title: true, summary: false }), true);
  assert.equal(showAiBadge({ title: false, summary: true }), true);
  assert.equal(showAiBadge({ title: false, summary: false }), false);
});

test("浅底：#rrggbb 换成 rgba，不是 #rrggbb 原样返回", () => {
  assert.equal(tint("#13191c", 0.15), "rgba(19, 25, 28, 0.15)");
  assert.equal(tint("#2CE2E8", 0.2), "rgba(44, 226, 232, 0.2)");
  assert.equal(tint("red", 0.15), "red");
});

test("焦点卡底栏：N 用 sourceNames 的个数，来源名按顺序用顿号连，右侧是 latestAt 的北京 HH:mm 和“MM-DD 最新”", () => {
  const names = ["Compound Semiconductor", "Semiconductor Today", "SEMI 中国·半导体", "第三代半导体产业网"];
  assert.deepEqual(focusFoot({ sourceNames: names, latestAt: "2026-10-16T08:57:00Z", source: { name: "Compound Semiconductor" } }), {
    echo: { count: 4, dots: 4 },
    sources: "Compound Semiconductor、Semiconductor Today、SEMI 中国·半导体、第三代半导体产业网",
    latest: { clock: "16:57", day: "10-16 最新" },
  });
});

test("焦点卡底栏：只有一个来源时不显示数量标记，来源名照常列；圆点最多五个", () => {
  const one = focusFoot({ sourceNames: ["电池网"], latestAt: "2026-10-17T07:05:00+08:00", source: { name: "电池网" } });
  assert.equal(one.echo, null);
  assert.equal(one.sources, "电池网");
  assert.deepEqual(one.latest, { clock: "07:05", day: "10-17 最新" });
  const many = focusFoot({ sourceNames: ["a", "b", "c", "d", "e", "f", "g"], latestAt: "2026-10-17T00:00:00+08:00", source: { name: "a" } });
  assert.deepEqual(many.echo, { count: 7, dots: 5 });
  assert.deepEqual(many.latest, { clock: "00:00", day: "10-17 最新" });
});

test("焦点卡底栏：sourceNames 是空的用代表条目的来源名；latestAt 解析不了不显示时刻", () => {
  const foot = focusFoot({ sourceNames: [], latestAt: "bad", source: { name: "电池网" } });
  assert.equal(foot.echo, null);
  assert.equal(foot.sources, "电池网");
  assert.equal(foot.latest, null);
});
