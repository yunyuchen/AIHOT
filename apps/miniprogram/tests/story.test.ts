import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramStory, MiniprogramStoryReport } from "@aihot/contracts/miniprogram";
import type { Failure } from "../src/lib/errors.ts";
import { checkStory, storyPath, storyScreen, storyView, timeline, type StoryLoad } from "../src/lib/story.ts";

const NOW = "2026-10-16T19:20:00+08:00";
const TARGET = { board: "manufacturing" as const, id: "st_1" };

function report(source: string, publishedAt: string, overrides: Partial<MiniprogramStoryReport> = {}): MiniprogramStoryReport {
  return { itemId: null, title: `${source} 的标题`, source: { name: source }, publishedAt, ai: { title: false }, ...overrides };
}

function story(overrides: Partial<MiniprogramStory> = {}): MiniprogramStory {
  return {
    schemaVersion: 1,
    id: "st_1",
    title: "英飞凌与 Wolfspeed 扩大延长 SiC 晶圆供应协议",
    digest: "2026 年 10 月 15 日，英飞凌与 Wolfspeed 宣布扩大并延长现有的长期碳化硅晶圆供应协议。",
    sourceCount: 4,
    reportCount: 4,
    firstReportAt: "2026-10-15T22:41:00+08:00",
    latestAt: "2026-10-16T16:57:00+08:00",
    reports: [
      report("第三代半导体产业网", "2026-10-15T22:41:00+08:00", { itemId: "it_1", ai: { title: true } }),
      report("Compound Semiconductor", "2026-10-15T23:10:00+08:00"),
      report("SEMI 中国·半导体", "2026-10-16T09:00:00+08:00"),
      report("Semiconductor Today", "2026-10-16T16:57:00+08:00", { itemId: "it_4" }),
    ],
    ai: { title: true, digest: true },
    generatedAt: NOW,
    ...overrides,
  };
}

const failure = (kind: Failure["kind"], status: number | null = null): Failure => ({ kind, status, code: null, requestId: null });
const loaded = (data: MiniprogramStory | null, phase: StoryLoad["phase"] = "ready", f: Failure | null = null): StoryLoad => ({
  phase,
  story: data,
  failure: f,
});

test("请求路径：stories/{id}，id 编码", () => {
  assert.equal(storyPath("st_1"), "stories/st_1");
  assert.equal(storyPath("a/b"), "stories/a%2Fb");
});

test("响应核对：v1 的形状收下，其余回 null", () => {
  assert.ok(checkStory(story()));
  assert.ok(checkStory(story({ digest: null, reports: [] })));
  assert.equal(checkStory(null), null);
  assert.equal(checkStory({ ...story(), schemaVersion: 2 }), null);
  assert.equal(checkStory({ ...story(), title: undefined }), null);
  assert.equal(checkStory({ ...story(), digest: 3 }), null);
  assert.equal(checkStory({ ...story(), reports: null }), null);
  assert.equal(checkStory({ ...story(), reports: [{ title: "x" }] }), null);
  assert.equal(checkStory({ ...story(), reports: [{ ...report("甲", NOW), itemId: 7 }] }), null);
  assert.equal(checkStory({ ...story(), ai: null }), null);
});

test("整屏状态：参数不对时不请求，直接“已下线或不存在”", () => {
  assert.deepEqual(storyScreen(null, loaded(null, "loading")), { kind: "missing" });
});

test("整屏状态：加载中、拿到了", () => {
  assert.deepEqual(storyScreen(TARGET, loaded(null, "loading")), { kind: "loading" });
  const data = story();
  assert.deepEqual(storyScreen(TARGET, loaded(data)), { kind: "content", story: data, stale: null });
  // 下拉刷新期间照旧显示。
  assert.deepEqual(storyScreen(TARGET, loaded(data, "loading")), { kind: "content", story: data, stale: null });
});

test("整屏状态：合并过的事件回的 id 和请求的不同，照常显示", () => {
  const merged = story({ id: "st_survivor" });
  assert.deepEqual(storyScreen(TARGET, loaded(merged)), { kind: "content", story: merged, stale: null });
});

test("整屏状态：404 是“已下线或不存在”，section_paused 是占位；手上有内容也一样", () => {
  for (const data of [null, story()]) {
    assert.deepEqual(storyScreen(TARGET, loaded(data, "failed", failure("not_found", 404))), { kind: "missing" });
    assert.deepEqual(storyScreen(TARGET, loaded(data, "failed", failure("paused", 403))), { kind: "placeholder" });
  }
});

test("整屏状态：还没有内容时连不上、超时、503、形状不对是加载失败；有内容时降成顶部提示", () => {
  for (const kind of ["network", "timeout", "unavailable", "error", "invalid_request"] as const) {
    const f = failure(kind);
    assert.deepEqual(storyScreen(TARGET, loaded(null, "failed", f)), { kind: "failed", failure: f }, kind);
    const data = story();
    assert.deepEqual(storyScreen(TARGET, loaded(data, "failed", f)), { kind: "content", story: data, stale: f }, kind);
  }
});

test("显示：事件卡的“N 家在报”用事件层级的来源数，圆点最多 5 个，只有一家也显示", () => {
  assert.deepEqual(storyView(story(), NOW).echo, { label: "4 家在报", dots: 4 });
  assert.deepEqual(storyView(story({ sourceCount: 12 }), NOW).echo, { label: "12 家在报", dots: 5 });
  assert.deepEqual(storyView(story({ sourceCount: 1 }), NOW).echo, { label: "1 家在报", dots: 1 });
});

test("显示：首报、最新写北京时间 MM-DD HH:mm（当天也写日期），跨年写 YYYY-MM-DD", () => {
  const view = storyView(story(), NOW);
  assert.equal(view.first, "10-15 22:41");
  assert.equal(view.latest, "10-16 16:57");
  assert.equal(storyView(story({ firstReportAt: "2025-12-31T23:00:00+08:00" }), NOW).first, "2025-12-31");
  // UTC 的 15 日 16:30 是北京的 16 日 00:30。
  assert.equal(storyView(story({ latestAt: "2026-10-15T16:30:00Z" }), NOW).latest, "10-16 00:30");
  assert.equal(storyView(story({ latestAt: "not a time" }), NOW).latest, "");
});

test("显示：标题和综述各按字段标 AI；没有综述整块不显示", () => {
  const view = storyView(story(), NOW);
  assert.equal(view.titleAi, true);
  assert.deepEqual(view.digest, { text: "2026 年 10 月 15 日，英飞凌与 Wolfspeed 宣布扩大并延长现有的长期碳化硅晶圆供应协议。", ai: true });
  const plain = storyView(story({ ai: { title: false, digest: false } }), NOW);
  assert.equal(plain.titleAi, false);
  assert.equal(plain.digest?.ai, false);
  assert.equal(storyView(story({ digest: null }), NOW).digest, null);
  assert.equal(storyView(story({ digest: "  " }), NOW).digest, null);
});

test("显示：“谁在报，怎么说”块标题旁的 AI 标，任一报道标题是模型写的就标一次", () => {
  assert.equal(storyView(story(), NOW).reportsAi, true);
  const reports = story().reports.map((r) => ({ ...r, ai: { title: false } }));
  assert.equal(storyView(story({ reports }), NOW).reportsAi, false);
  assert.equal(storyView(story({ reports: [] }), NOW).reportsAi, false);
});

test("报道时间轴：按发布时间从早到晚，第一条“首报”，最后一条“最新”且是星青节点", () => {
  const view = storyView(story(), NOW);
  assert.deepEqual(
    view.reports.map((r) => [r.source, r.tag, r.latest]),
    [
      ["第三代半导体产业网", "首报", false],
      ["Compound Semiconductor", null, false],
      ["SEMI 中国·半导体", null, false],
      ["Semiconductor Today", "最新", true],
    ],
  );
});

test("报道时间轴：接口给乱了也排回从早到晚，同一时刻保持接口顺序，解析不了的排最后", () => {
  const a = report("甲", "2026-10-16T09:00:00+08:00");
  const b = report("乙", "2026-10-15T22:00:00+08:00");
  const c = report("丙", "2026-10-16T09:00:00+08:00");
  const d = report("丁", "坏时间");
  // UTC 写法的北京 10-16 08:00，比甲、丙早。
  const e = report("戊", "2026-10-16T00:00:00Z");
  assert.deepEqual(timeline([a, d, b, c, e]).map((r) => r.source.name), ["乙", "戊", "甲", "丙", "丁"]);
});

test("报道时间轴：只有一条时它是首报，节点按最新画", () => {
  const view = storyView(story({ reports: [report("甲", "2026-10-16T09:00:00+08:00")] }), NOW);
  assert.deepEqual(view.reports.map((r) => [r.tag, r.latest]), [["首报", true]]);
  assert.deepEqual(storyView(story({ reports: [] }), NOW).reports, []);
});

test("报道行：时间只取北京日期，有条目页的才能点", () => {
  const view = storyView(story(), NOW);
  assert.deepEqual(view.reports.map((r) => r.date), ["10-15", "10-15", "10-16", "10-16"]);
  assert.deepEqual(view.reports.map((r) => r.itemId), ["it_1", null, null, "it_4"]);
  const crossYear = storyView(story({ reports: [report("甲", "2025-12-31T20:00:00+08:00")] }), NOW);
  assert.equal(crossYear.reports[0]!.date, "2025-12-31");
  // 空字符串的 itemId 也当没有条目页。
  assert.equal(storyView(story({ reports: [report("甲", NOW, { itemId: "" })] }), NOW).reports[0]!.itemId, null);
});

test("报道行：key 在同一来源、同一时刻的两条之间也不重复", () => {
  const twin = report("甲", "2026-10-16T09:00:00+08:00");
  const keys = storyView(story({ reports: [twin, { ...twin }] }), NOW).reports.map((r) => r.key);
  assert.equal(new Set(keys).size, 2);
});
