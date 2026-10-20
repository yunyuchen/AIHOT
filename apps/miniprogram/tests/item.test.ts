import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramItem } from "@aihot/contracts/miniprogram";
import { MANUFACTURING_CATEGORY_COLORS } from "../config/boards.ts";
import type { Failure } from "../src/lib/errors.ts";
import { bodyNodes, checkItem, itemPath, itemScreen, itemView, SOURCE_NOTE, type ItemLoad } from "../src/lib/item.ts";

const NOW = "2026-10-17T11:18:00+08:00";
const TARGET = { board: "manufacturing" as const, id: "it_1" };
const labels = { semiconductor: "半导体" };

function item(overrides: Partial<MiniprogramItem> = {}): MiniprogramItem {
  return {
    schemaVersion: 1,
    id: "it_1",
    title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议",
    summary: "新协议把双方原有供应关系从 150mm 衬底技术转为 200mm。",
    category: "semiconductor",
    source: { name: "Compound Semiconductor" },
    publishedAt: "2026-10-15T09:30:00+08:00",
    reason: "200mm 衬底供应落地，直接关系碳化硅产线的量产节奏。",
    sourceCount: 2,
    originalUrl: "https://example.com/news/1",
    fullText: { allowed: false, html: null, translated: false, complete: true },
    story: { id: "st_1", title: "SiC 晶圆供应", sourceCount: 4, otherSourceNames: ["Semiconductor Today", "SEMI 中国", "第三代半导体产业网"], ai: { title: true } },
    ai: { title: true, summary: true, reason: true, body: false },
    share: { title: "英飞凌与 Wolfspeed 签署 200mm SiC 晶圆多年供应协议", imageUrl: "https://example.com/og/posters/it_1.png" },
    generatedAt: NOW,
    ...overrides,
  };
}

const failure = (kind: Failure["kind"], status: number | null = null, code: string | null = null): Failure => ({ kind, status, code, requestId: null });
const failed = (f: Failure): ItemLoad => ({ phase: "failed", failure: f });

test("请求路径：items/{id}，id 编码", () => {
  assert.equal(itemPath("it_1"), "items/it_1");
  assert.equal(itemPath("a/b"), "items/a%2Fb");
});

test("响应核对：v1 的形状收下，其余回 null", () => {
  assert.ok(checkItem(item()));
  assert.ok(checkItem(item({ story: null, reason: null, sourceCount: null, category: null })));
  assert.equal(checkItem(null), null);
  assert.equal(checkItem("<html></html>"), null);
  assert.equal(checkItem({ ...item(), schemaVersion: 2 }), null);
  assert.equal(checkItem({ ...item(), originalUrl: undefined }), null);
  assert.equal(checkItem({ ...item(), source: null }), null);
  assert.equal(checkItem({ ...item(), fullText: {} }), null);
  assert.equal(checkItem({ ...item(), ai: null }), null);
  assert.equal(checkItem({ ...item(), story: "st_1" }), null);
});

test("整屏状态：参数不对时不请求，直接“已下线或不存在”", () => {
  assert.deepEqual(itemScreen(null, { phase: "loading" }), { kind: "missing" });
});

test("整屏状态：加载中、拿到了", () => {
  assert.deepEqual(itemScreen(TARGET, { phase: "loading" }), { kind: "loading" });
  const data = item();
  assert.deepEqual(itemScreen(TARGET, { phase: "ready", item: data }), { kind: "content", item: data });
});

test("整屏状态：404 是“已下线或不存在”，section_paused 是占位（不算错误）", () => {
  assert.deepEqual(itemScreen(TARGET, failed(failure("not_found", 404, "not_found"))), { kind: "missing" });
  assert.deepEqual(itemScreen(TARGET, failed(failure("paused", 403, "section_paused"))), { kind: "placeholder" });
});

test("整屏状态：连不上、超时、503、形状不对都是加载失败加重试，不会变成占位或已下线", () => {
  for (const kind of ["network", "timeout", "unavailable", "error", "invalid_request"] as const) {
    const f = failure(kind);
    assert.deepEqual(itemScreen(TARGET, failed(f)), { kind: "failed", failure: f }, kind);
  }
});

test("显示：分类色标、标题上方的“AI 摘要”看标题或摘要", () => {
  const view = itemView(item(), labels, MANUFACTURING_CATEGORY_COLORS, NOW);
  assert.equal(view.chip?.label, "半导体");
  assert.equal(view.chip?.color, "#3b7bf6");
  assert.equal(view.aiBadge, true);
  assert.equal(itemView(item({ ai: { title: false, summary: true, reason: false, body: false } }), labels, {}, NOW).aiBadge, true);
  assert.equal(itemView(item({ ai: { title: false, summary: false, reason: true, body: false } }), labels, {}, NOW).aiBadge, false);
  assert.equal(itemView(item({ category: null }), labels, {}, NOW).chip, null);
  // 元信息还没到：先显示 key。
  assert.equal(itemView(item(), {}, MANUFACTURING_CATEGORY_COLORS, NOW).chip?.label, "semiconductor");
});

test("显示：“为什么值得看”有内容才显示，AI 标按 ai.reason 单独给", () => {
  assert.deepEqual(itemView(item(), labels, {}, NOW).reason, { text: "200mm 衬底供应落地，直接关系碳化硅产线的量产节奏。", ai: true });
  const byRule = itemView(item({ ai: { title: true, summary: true, reason: false, body: false } }), labels, {}, NOW);
  assert.equal(byRule.reason?.ai, false);
  assert.equal(itemView(item({ reason: null }), labels, {}, NOW).reason, null);
  assert.equal(itemView(item({ reason: "  " }), labels, {}, NOW).reason, null);
});

test("显示：“MM-DD 发布”只取 publishedAt 的北京日期", () => {
  assert.equal(itemView(item(), labels, {}, NOW).published, "10-15 发布");
  // 北京时间已经是 16 日。
  assert.equal(itemView(item({ publishedAt: "2026-10-15T16:30:00Z" }), labels, {}, NOW).published, "10-16 发布");
  // 当天也写日期，不写时刻。
  assert.equal(itemView(item({ publishedAt: "2026-10-17T08:00:00+08:00" }), labels, {}, NOW).published, "10-17 发布");
  // 跨年带年份。
  assert.equal(itemView(item({ publishedAt: "2025-12-31T20:00:00+08:00" }), labels, {}, NOW).published, "2025-12-31 发布");
});

const NOTE = "<p>完整排版请复制来源链接查看</p>";
const fullText = (overrides: Partial<MiniprogramItem["fullText"]> = {}): MiniprogramItem["fullText"] => ({
  allowed: true,
  html: `<p>正文第一段</p>${NOTE}`,
  translated: false,
  complete: true,
  ...overrides,
});
const ai = (body: boolean): MiniprogramItem["ai"] => ({ title: true, summary: true, reason: true, body });

test("全文：不允许站内全文时没有正文，来源卡说只展示摘要", () => {
  const view = itemView(item(), labels, {}, NOW);
  assert.equal(view.body, null);
  assert.equal(view.sourceNote, "这里只展示摘要，原文版权归来源所有。复制链接后可在浏览器里打开原文。");
  // allowed 为假时接口照理不给正文；给了也不画。
  assert.equal(itemView(item({ fullText: fullText({ allowed: false }) }), labels, {}, NOW).body, null);
});

test("全文：允许但没给正文（null、空串）时只有摘要，说明同只展示摘要，不再写“稍后提供”", () => {
  for (const html of [null, "", "  "]) {
    const view = itemView(item({ fullText: fullText({ html }) }), labels, {}, NOW);
    assert.equal(view.body, null, String(html));
    assert.equal(view.sourceNote, SOURCE_NOTE.summaryOnly);
  }
  assert.ok(!Object.values(SOURCE_NOTE).some((note) => note.includes("稍后提供")));
});

test("全文：中文原文，块标题“正文”，不标 AI，说明写正文由来源提供", () => {
  const view = itemView(item({ fullText: fullText(), ai: ai(false) }), labels, {}, NOW);
  assert.equal(view.body?.label, "正文");
  assert.equal(view.body?.ai, false);
  assert.equal(view.body?.incomplete, false);
  assert.equal(view.sourceNote, "来源允许站内阅读全文，以上正文由来源提供，原文版权归来源所有。");
});

test("全文：模型译文（ai.body 为真），块标题“译文”，正文前再标一次“AI 摘要”，说明写译文由模型翻译", () => {
  const view = itemView(item({ fullText: fullText({ translated: true }), ai: ai(true) }), labels, {}, NOW);
  assert.equal(view.body?.label, "译文");
  assert.equal(view.body?.ai, true);
  assert.equal(view.sourceNote, SOURCE_NOTE.translated);
  assert.match(view.sourceNote, /模型/);
});

test("全文：来源自带的译文（translated 为真、ai.body 为假）不标 AI，说明同来源提供", () => {
  const view = itemView(item({ fullText: fullText({ translated: true }), ai: ai(false) }), labels, {}, NOW);
  assert.equal(view.body?.label, "译文");
  assert.equal(view.body?.ai, false);
  assert.equal(view.sourceNote, SOURCE_NOTE.fullText);
});

test("全文：AI 标只看 ai.body，不靠 translated 推", () => {
  assert.equal(itemView(item({ fullText: fullText({ translated: false }), ai: ai(true) }), labels, {}, NOW).body?.ai, true);
  assert.equal(itemView(item({ fullText: fullText({ translated: true }), ai: ai(false) }), labels, {}, NOW).body?.ai, false);
});

test("全文：译文没译完时提示，中文原文的 complete 不看", () => {
  assert.equal(itemView(item({ fullText: fullText({ translated: true, complete: false }), ai: ai(true) }), labels, {}, NOW).body?.incomplete, true);
  assert.equal(itemView(item({ fullText: fullText({ translated: false, complete: false }) }), labels, {}, NOW).body?.incomplete, false);
});

test("全文：rich-text 节点加上段间距等行内样式，已带 style 的图片不动，末尾那段画成小字", () => {
  const html =
    '<h2>小标题</h2><p>第一段<strong>加粗</strong><br>换行</p><ul><li>一</li></ul><blockquote>引用</blockquote>' +
    '<table><tr><th>项</th><td colspan="2">值</td></tr></table><p><img src="https://hot.example/api/img-proxy?u=1" style="max-width:100%;height:auto"></p>' +
    NOTE;
  const nodes = bodyNodes(html);
  assert.match(nodes, /^<h2 style="margin:20px 0 10px;[^"]*">小标题<\/h2>/);
  assert.match(nodes, /<p style="margin:0 0 12px">第一段<strong>加粗<\/strong><br>换行<\/p>/);
  assert.match(nodes, /<ul style="[^"]*padding-left:20px">/);
  assert.match(nodes, /<li style="margin:0 0 4px">一<\/li>/);
  assert.match(nodes, /<blockquote style="[^"]*border-left:3px solid #c5cbd0[^"]*">/);
  assert.match(nodes, /<td colspan="2" style="padding:6px 8px;[^"]*">值<\/td>/);
  assert.match(nodes, /<img src="https:\/\/hot\.example\/api\/img-proxy\?u=1" style="max-width:100%;height:auto">/);
  assert.match(nodes, /<p style="margin:16px 0 0;font-size:13px;[^"]*">完整排版请复制来源链接查看<\/p>$/);
  // 不认识的标签、已经带 style 的标签原样留着。
  assert.equal(bodyNodes('<p style="color:red">x</p>'), '<p style="color:red">x</p>');
});

test("显示：事件入口卡用事件层级的来源数，列出其他来源名", () => {
  assert.deepEqual(itemView(item(), labels, {}, NOW).story, {
    id: "st_1",
    title: "同一件事，4 家在报",
    dots: 4,
    line: "Semiconductor Today、SEMI 中国、第三代半导体产业网也报道了，看事件脉络",
  });
});

test("显示：事件入口卡在条目自己的来源数为 1 时照样显示；其他来源没列全时加“等”，圆点最多 5 个", () => {
  const story = { id: "st_2", title: "x", sourceCount: 9, otherSourceNames: ["甲", "乙", "丙"], ai: { title: true } };
  const view = itemView(item({ sourceCount: 1, story }), labels, {}, NOW).story;
  assert.equal(view?.title, "同一件事，9 家在报");
  assert.equal(view?.dots, 5);
  assert.equal(view?.line, "甲、乙、丙等也报道了，看事件脉络");
  const alone = itemView(item({ story: { ...story, sourceCount: 1, otherSourceNames: [] } }), labels, {}, NOW).story;
  assert.equal(alone?.line, "看事件脉络");
});

test("显示：没归进事件或“只显示摘要”时没有事件入口卡", () => {
  assert.equal(itemView(item({ story: null }), labels, {}, NOW).story, null);
});

test("显示：同一事实的“N 家在报”只在没归进事件、≥ 2 时跟在发布日期后面", () => {
  assert.equal(itemView(item({ story: null, sourceCount: 3 }), labels, {}, NOW).echo, "3 家在报");
  assert.equal(itemView(item({ story: null, sourceCount: 1 }), labels, {}, NOW).echo, null);
  // “只显示摘要”：接口给 null。
  assert.equal(itemView(item({ story: null, sourceCount: null }), labels, {}, NOW).echo, null);
  // 归进事件时由事件入口卡说。
  assert.equal(itemView(item({ sourceCount: 3 }), labels, {}, NOW).echo, null);
});
