import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramMeta } from "@aihot/contracts/miniprogram";
import { FALLBACK_CATEGORY_COLOR, SPORTS_CATEGORY_COLORS } from "../config/boards.ts";
import { activeCategory, filterChips, footerText, hotlineFor, ledeLines } from "../src/lib/board-feed.ts";

// 运动健康行业包（industry-packs/sports/site.ts 的 BOARD）现在给的样子；号码在人工核对前是空的。
const sportsMeta: MiniprogramMeta = {
  schemaVersion: 1,
  board: { key: "sports", name: "运动健康", siteName: "锐奇运动健康", description: "健康生活与大众运动，每天十来条。不做诊疗建议，不推荐药品和保健品。" },
  status: "normal",
  placeholder: { title: "这个板块正在调整", body: "暂不提供内容，其他板块照常。" },
  columns: { feed: true, stories: true, daily: false },
  categories: [
    { key: "work-health", label: "职业健康" },
    { key: "sleep", label: "睡眠与心理" },
    { key: "general", label: "公共卫生" },
  ],
  notice: {
    footer: "本板块为健康生活资讯，标题与摘要由 AI 生成，以原文为准，不构成医疗建议；身体不适请及时就医。",
    hotline: { label: "心理援助热线", number: "", categories: ["sleep"] },
  },
  readings: { date: "2026-10-17", cards: 9, stories: 3, sources: 17, times: [], updatedAt: null },
  generatedAt: "2026-10-17T11:18:00+08:00",
};

const withHotline = (number: string, categories = ["sleep"]) => ({ label: "心理援助热线", number, categories });

test("头部导语：板块说明一句一行（原型 sports.html），边界那句照样显示", () => {
  assert.deepEqual(ledeLines(sportsMeta.board.description), ["健康生活与大众运动，每天十来条。", "不做诊疗建议，不推荐药品和保健品。"]);
  // 没有句号的一句、首尾空白、空串、元信息还没到。
  assert.deepEqual(ledeLines(" 健康生活与大众运动 "), ["健康生活与大众运动"]);
  assert.deepEqual(ledeLines(""), []);
  assert.deepEqual(ledeLines(undefined), []);
});

test("分类筛选条：“全部”打头，后面照元信息的顺序；圆点颜色取构建配置，D3 定下前运动健康一律兜底灰", () => {
  assert.deepEqual(filterChips(sportsMeta.categories, SPORTS_CATEGORY_COLORS), [
    { key: null, label: "全部", color: null },
    { key: "work-health", label: "职业健康", color: FALLBACK_CATEGORY_COLOR },
    { key: "sleep", label: "睡眠与心理", color: FALLBACK_CATEGORY_COLOR },
    { key: "general", label: "公共卫生", color: FALLBACK_CATEGORY_COLOR },
  ]);
  // 配色表里有的 key 用表里的颜色，元信息新加的分类（表里没有）用兜底灰；名字始终从元信息读。
  const chips = filterChips([{ key: "sleep", label: "睡眠" }, { key: "brand-new", label: "新分类" }], { sleep: "#8f6cf6" });
  assert.deepEqual(chips.slice(1), [
    { key: "sleep", label: "睡眠", color: "#8f6cf6" },
    { key: "brand-new", label: "新分类", color: FALLBACK_CATEGORY_COLOR },
  ]);
  assert.deepEqual(filterChips([], SPORTS_CATEGORY_COLORS), [{ key: null, label: "全部", color: null }]);
});

test("正在看的分类：还在元信息的分类表里才算，不在了或还没有元信息回到全部", () => {
  assert.equal(activeCategory("sleep", sportsMeta), "sleep");
  assert.equal(activeCategory(null, sportsMeta), null);
  assert.equal(activeCategory("fitness", sportsMeta), null);
  assert.equal(activeCategory("sleep", null), null);
});

test("页脚声明：来自元信息 notice.footer；制造为 null 不画，空白也不画", () => {
  assert.equal(footerText(sportsMeta), sportsMeta.notice.footer);
  assert.equal(footerText({ ...sportsMeta, notice: { footer: null, hotline: null } }), null);
  assert.equal(footerText({ ...sportsMeta, notice: { footer: "  ", hotline: null } }), null);
  assert.equal(footerText(null), null);
});

test("心理援助热线：notice.hotline 指定的分类才显示，文案和号码都从元信息取", () => {
  const hotline = withHotline("12356");
  assert.deepEqual(hotlineFor("sleep", hotline), { label: "心理援助热线", number: "12356" });
  assert.equal(hotlineFor("work-health", hotline), null);
  assert.equal(hotlineFor(null, hotline), null);
  // 改文案、改号码、改挂在哪些分类上，都只改元信息（行业包），小程序不用发版。
  assert.deepEqual(hotlineFor("general", { label: "需要倾诉可拨打", number: " 400-161-9995 ", categories: ["sleep", "general"] }), {
    label: "需要倾诉可拨打",
    number: "400-161-9995",
  });
});

test("心理援助热线：号码还没核对（空的）、文案是空的、制造没有热线时都不显示", () => {
  assert.equal(hotlineFor("sleep", sportsMeta.notice.hotline), null);
  assert.equal(hotlineFor("sleep", { ...withHotline("12356"), label: " " }), null);
  assert.equal(hotlineFor("sleep", null), null);
  assert.equal(hotlineFor("sleep", undefined), null);
});
