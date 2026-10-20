import assert from "node:assert/strict";
import { test } from "node:test";
import type { MiniprogramDaily, MiniprogramDailyEntry, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import { MANUFACTURING_CATEGORY_COLORS } from "../config/boards.ts";
import { checkDaily, createDailyStore, DAILY_COPY, dailyPath, dailyScreen, dailyView, seedDaily, type DailySnapshot, type DailyState } from "../src/lib/daily.ts";
import type { Failure } from "../src/lib/errors.ts";
import { BUILT_IN_PLACEHOLDER, type MetaState } from "../src/lib/meta.ts";
import type { Result } from "../src/lib/request.ts";

const NOW = Date.parse("2026-10-16T09:00:00+08:00");
const colors = MANUFACTURING_CATEGORY_COLORS;

function entry(itemId: string, aiTitle = false): MiniprogramDailyEntry {
  return { itemId, title: `标题 ${itemId}`, source: { name: `来源 ${itemId}` }, ai: { title: aiTitle } };
}

function daily(date = "2026-10-16", overrides: Partial<MiniprogramDaily> = {}): MiniprogramDaily {
  return {
    schemaVersion: 1,
    date,
    title: "锐奇制造日报",
    publishedAt: `${date}T08:00:30+08:00`,
    window: { start: "2026-10-15T08:00:00+08:00", end: `${date}T08:00:00+08:00` },
    lead: { title: "七部门印发新型电池产业“十五五”规划", paragraph: "新型电池首次以独立赛道进入国家级顶层设计。" },
    highlights: [entry("p1")],
    sections: [
      { label: "政策与标准", categories: ["policy"], items: [entry("p1", true), entry("p2")] },
      { label: "锂电", categories: ["battery", "energy-storage"], items: [entry("b1"), entry("b2"), entry("b3")] },
      { label: "半导体", categories: ["semiconductor"], items: [entry("s1")] },
    ],
    flashes: [entry("f1"), entry("f2")],
    prev: "2026-10-15",
    next: null,
    ai: { leadTitle: true, leadParagraph: true },
    share: { title: "锐奇制造日报 10 月 16 日：七部门印发新型电池产业“十五五”规划", imageUrl: "https://hot.example/og/mp/daily/2026-10-16.png" },
    generatedAt: `${date}T08:05:00+08:00`,
    ...overrides,
  };
}

const zero = (date = "2026-10-16") => daily(date, { lead: null, highlights: [], sections: [], flashes: [] });

const meta: MiniprogramMeta = {
  schemaVersion: 1,
  board: { key: "manufacturing", name: "制造", siteName: "锐奇制造日报", description: "…" },
  status: "normal",
  placeholder: null,
  columns: { feed: true, stories: true, daily: true },
  categories: [],
  notice: { footer: null, hotline: null },
  readings: { date: "2026-10-16", cards: 0, stories: 0, sources: 0, times: [], updatedAt: null },
  generatedAt: "2026-10-16T09:00:00+08:00",
};
const ready = (overrides: Partial<MiniprogramMeta> = {}): MetaState => ({ status: "ready", meta: { ...meta, ...overrides }, fetchedAt: NOW });

const failure = (kind: Failure["kind"], status: number | null = null): Failure => ({ kind, status, code: null, requestId: null });
const state = (overrides: Partial<DailyState>): DailyState => ({ ...seedDaily(null, null), ...overrides });

// ---------- 路径与核对 ----------

test("请求路径：最新一期 dailies/latest，某一期 dailies/{date}", () => {
  assert.equal(dailyPath(null), "dailies/latest");
  assert.equal(dailyPath("2026-10-16"), "dailies/2026-10-16");
});

test("响应核对：v1 的形状收下（含零条的一期），其余回 null", () => {
  assert.ok(checkDaily(daily()));
  assert.ok(checkDaily(zero()));
  assert.equal(checkDaily(null), null);
  assert.equal(checkDaily({ ...daily(), schemaVersion: 2 }), null);
  assert.equal(checkDaily({ ...daily(), date: undefined }), null);
  assert.equal(checkDaily({ ...daily(), lead: { title: "x" } }), null);
  assert.equal(checkDaily({ ...daily(), sections: null }), null);
  assert.equal(checkDaily({ ...daily(), sections: [{ label: "x", categories: [], items: [{ title: "没有 itemId" }] }] }), null);
  assert.equal(checkDaily({ ...daily(), flashes: [{ ...entry("f1"), source: null }] }), null);
  assert.equal(checkDaily({ ...daily(), prev: 20261015 }), null);
  assert.equal(checkDaily({ ...daily(), ai: null }), null);
});

// ---------- 显示 ----------

test("头部日期和星期：“10月16日”“周五”，日期不对时为 null", () => {
  assert.deepEqual(dailyView(daily("2026-10-16"), colors).heading, { day: "10月16日", weekday: "周五" });
  assert.deepEqual(dailyView(daily("2026-10-15"), colors).heading, { day: "10月15日", weekday: "周四" });
  assert.deepEqual(dailyView(daily("2026-01-01"), colors).heading, { day: "1月1日", weekday: "周四" });
  assert.equal(dailyView(daily("2026-02-30"), colors).heading, null);
});

test("分节：节名、第一个分类的颜色、条数、每行标题和来源，快讯是最后一节", () => {
  const view = dailyView(daily(), colors);
  assert.deepEqual(
    view.sections.map((s) => [s.label, s.color, s.count]),
    [
      ["政策与标准", "#13191c", 2],
      ["锂电", "#ff7a45", 3],
      ["半导体", "#3b7bf6", 1],
      ["快讯", null, 2],
    ],
  );
  assert.deepEqual(view.sections[1]!.lines.map((l) => [l.itemId, l.title, l.source]), [
    ["b1", "标题 b1", "来源 b1"],
    ["b2", "标题 b2", "来源 b2"],
    ["b3", "标题 b3", "来源 b3"],
  ]);
  assert.equal(view.sections[3]!.label, DAILY_COPY.flashes);
});

test("头部读数：分节数含快讯节，条数含快讯", () => {
  const view = dailyView(daily(), colors);
  assert.equal(view.sectionCount, 4);
  assert.equal(view.itemCount, 8);
  const noFlash = dailyView(daily("2026-10-16", { flashes: [] }), colors);
  assert.equal(noFlash.sectionCount, 3);
  assert.equal(noFlash.itemCount, 6);
  assert.ok(!noFlash.sections.some((s) => s.label === "快讯"));
});

test("分节：不认识的分类、没有分类用兜底灰；没有条目的节不画", () => {
  const view = dailyView(
    daily("2026-10-16", {
      sections: [
        { label: "新分类", categories: ["robotics"], items: [entry("r1")] },
        { label: "无分类", categories: [], items: [entry("n1")] },
        { label: "空节", categories: ["battery"], items: [] },
      ],
      flashes: [],
    }),
    colors,
  );
  assert.deepEqual(view.sections.map((s) => [s.label, s.color]), [
    ["新分类", "#8a959e"],
    ["无分类", "#8a959e"],
  ]);
});

test("AI 标：节标题旁按节内任一条目的标题标一次，节名不标；快讯节同样", () => {
  const view = dailyView(daily("2026-10-16", { flashes: [entry("f1"), entry("f2", true)] }), colors);
  assert.deepEqual(view.sections.map((s) => s.ai), [true, false, false, true]);
});

test("头条卡：头条或导语任一是模型写的就在右上角标；零条的一期不画头条卡", () => {
  assert.deepEqual(dailyView(daily(), colors).lead, {
    headline: { title: "七部门印发新型电池产业“十五五”规划", paragraph: "新型电池首次以独立赛道进入国家级顶层设计。" },
    ai: true,
  });
  assert.equal(dailyView(daily("2026-10-16", { ai: { leadTitle: false, leadParagraph: true } }), colors).lead?.ai, true);
  assert.equal(dailyView(daily("2026-10-16", { ai: { leadTitle: false, leadParagraph: false } }), colors).lead?.ai, false);
  // 有条目但没有头条：卡片留着放按钮，不标 AI。
  assert.deepEqual(dailyView(daily("2026-10-16", { lead: null }), colors).lead, { headline: null, ai: false });
  assert.deepEqual(dailyView(daily("2026-10-16", { lead: { title: " ", paragraph: "" } }), colors).lead, { headline: null, ai: false });
});

test("零条的一期：保留头部（读数为 0），不画头条卡，显示“这一期没有条目”", () => {
  const view = dailyView(zero(), colors);
  assert.equal(view.empty, true);
  assert.equal(view.lead, null);
  assert.deepEqual(view.sections, []);
  assert.equal(view.sectionCount, 0);
  assert.equal(view.itemCount, 0);
  assert.deepEqual(view.heading, { day: "10月16日", weekday: "周五" });
  assert.equal(DAILY_COPY.empty, "这一期没有条目");
  // 只有快讯也不算零条。
  assert.equal(dailyView(daily("2026-10-16", { sections: [], flashes: [entry("f1")] }), colors).empty, false);
});

test("前一天、后一天：prev、next 为 null 时不能点", () => {
  assert.deepEqual([dailyView(daily(), colors).prev, dailyView(daily(), colors).next], ["2026-10-15", null]);
  const middle = dailyView(daily("2026-10-15", { prev: "2026-10-14", next: "2026-10-16" }), colors);
  assert.deepEqual([middle.prev, middle.next], ["2026-10-14", "2026-10-16"]);
  const first = dailyView(daily("2026-09-01", { prev: null, next: "2026-09-02" }), colors);
  assert.deepEqual([first.prev, first.next], [null, "2026-09-02"]);
});

test("页尾说明照规格", () => {
  assert.equal(DAILY_COPY.note, "日报由模型从前一天 08:00 到当天 08:00 的精选里整理，08:00 出刊");
});

// ---------- 整屏状态 ----------

test("整屏状态：配置有误最先，别的都不作数", () => {
  const mismatch: MetaState = { status: "mismatch", actual: "sports" };
  assert.deepEqual(dailyScreen(mismatch, state({ phase: "ready", daily: daily() })), { kind: "mismatch", actual: "sports" });
});

test("整屏状态：占位（元信息占位或日报回 section_paused），手上有快照也不显示", () => {
  const withContent = state({ phase: "ready", daily: daily(), fromSnapshot: true });
  assert.deepEqual(dailyScreen(ready({ status: "placeholder", placeholder: { title: "调整中", body: "稍后再来" } }), withContent), {
    kind: "placeholder",
    title: "调整中",
    body: "稍后再来",
  });
  assert.deepEqual(dailyScreen(ready(), state({ phase: "failed", daily: daily(), failure: failure("paused", 403) })), {
    kind: "placeholder",
    title: BUILT_IN_PLACEHOLDER,
    body: null,
  });
});

test("整屏状态：元信息说没有日报栏目时“这个板块没有日报”", () => {
  assert.deepEqual(dailyScreen(ready({ columns: { feed: true, stories: true, daily: false } }), state({ phase: "loading" })), { kind: "off" });
});

test("整屏状态：404 分最新一期（第一期还没出刊）和某一期（这一天没有日报）", () => {
  assert.deepEqual(dailyScreen(ready(), state({ date: null, phase: "failed", failure: failure("not_found", 404) })), { kind: "missing", latest: true });
  assert.deepEqual(dailyScreen(ready(), state({ date: "2026-10-12", phase: "failed", failure: failure("not_found", 404) })), {
    kind: "missing",
    latest: false,
  });
});

test("整屏状态：还没有内容时失败是加载失败，没回来是加载中；连不上、503 不会变成占位", () => {
  for (const kind of ["network", "timeout", "unavailable", "error"] as const) {
    assert.deepEqual(dailyScreen(ready(), state({ phase: "failed", failure: failure(kind) })), { kind: "failed", failure: failure(kind) });
  }
  assert.deepEqual(dailyScreen(ready(), state({ phase: "idle" })), { kind: "loading" });
  assert.deepEqual(dailyScreen({ status: "loading" }, state({ phase: "loading" })), { kind: "loading" });
});

test("整屏状态：快照先显示并标时间；刷新失败降成顶部提示、不再标时间；元信息失败不挡日报", () => {
  const snap = seedDaily(null, daily());
  assert.deepEqual(dailyScreen(ready(), { ...snap, phase: "loading" }), {
    kind: "content",
    daily: snap.daily!,
    stale: null,
    snapshotAt: "2026-10-16T08:05:00+08:00",
  });
  const stale = { ...snap, phase: "failed" as const, failure: failure("network") };
  assert.deepEqual(dailyScreen(ready(), stale), { kind: "content", daily: snap.daily!, stale: failure("network"), snapshotAt: null });
  const fresh = state({ phase: "ready", daily: daily(), fetchedAt: NOW });
  assert.deepEqual(dailyScreen({ status: "failed", failure: failure("network") }, fresh), { kind: "content", daily: fresh.daily!, stale: null, snapshotAt: null });
});

// ---------- 翻期、刷新和快照 ----------

/** 假的请求：每次调用排一个待答的请求，测试按顺序给答复。 */
function setup(initialDate: string | null, snap: MiniprogramDaily | null = null, clock = { now: NOW }) {
  const calls: { date: string | null; answer: (result: Result<MiniprogramDaily>) => Promise<void> }[] = [];
  const saved: string[] = [];
  let dropped = 0;
  const snapshot: DailySnapshot = { initial: snap, save: (d) => void saved.push(d.date), drop: () => void dropped++ };
  let current: DailyState = seedDaily(initialDate, snap);
  const store = createDailyStore(
    (date) =>
      new Promise((resolve) => {
        calls.push({
          date,
          answer: async (result) => {
            resolve(result);
            await new Promise((r) => setTimeout(r, 0));
          },
        });
      }),
    initialDate,
    (next) => void (current = next),
    () => clock.now,
    initialDate === null ? snapshot : null,
  );
  return { store, calls, saved, dropped: () => dropped, state: () => current };
}
const ok = (data: MiniprogramDaily): Result<MiniprogramDaily> => ({ ok: true, data, status: 200 });
const fail = (f: Failure): Result<MiniprogramDaily> => ({ ok: false, failure: f });

test("冷启动：最新一期先放快照，刷新成功后换成新的并整份写回快照", async () => {
  const t = setup(null, daily("2026-10-15", { next: null }));
  assert.equal(t.state().daily?.date, "2026-10-15");
  assert.equal(t.state().fromSnapshot, true);
  void t.store.refresh();
  assert.equal(t.calls[0]!.date, null);
  assert.equal(t.state().daily?.date, "2026-10-15");
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  assert.equal(t.state().daily?.date, "2026-10-16");
  assert.equal(t.state().fromSnapshot, false);
  assert.deepEqual(t.saved, ["2026-10-16"]);
});

test("刷新失败：快照留着；section_paused 和最新一期的 404 删掉快照", async () => {
  const t = setup(null, daily());
  void t.store.refresh();
  await t.calls[0]!.answer(fail(failure("network")));
  assert.equal(t.state().daily?.date, "2026-10-16");
  assert.equal(t.state().phase, "failed");
  assert.equal(t.dropped(), 0);
  void t.store.refresh();
  await t.calls[1]!.answer(fail(failure("paused", 403)));
  assert.equal(t.dropped(), 1);
  void t.store.refresh();
  await t.calls[2]!.answer(fail(failure("not_found", 404)));
  assert.equal(t.dropped(), 2);
});

test("翻期：页内切到前一天，按日期请求，切换时不把上一期当这一期显示，往期不写快照", async () => {
  const t = setup(null);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  void t.store.go("2026-10-15");
  assert.equal(t.calls[1]!.date, "2026-10-15");
  assert.equal(t.state().date, "2026-10-15");
  assert.equal(t.state().daily, null);
  await t.calls[1]!.answer(ok(daily("2026-10-15", { next: "2026-10-16" })));
  assert.equal(t.state().daily?.date, "2026-10-15");
  assert.deepEqual(t.saved, ["2026-10-16"]);
});

test("翻期：翻回最新一期的日期时按最新一期请求（又写快照）", async () => {
  const t = setup(null);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  void t.store.go("2026-10-15");
  await t.calls[1]!.answer(ok(daily("2026-10-15", { next: "2026-10-16" })));
  void t.store.go("2026-10-16");
  assert.equal(t.calls[2]!.date, null);
  assert.equal(t.state().date, null);
  await t.calls[2]!.answer(ok(daily("2026-10-16")));
  assert.deepEqual(t.saved, ["2026-10-16", "2026-10-16"]);
});

test("翻期：连点两下，先发的请求晚回来时丢掉", async () => {
  const t = setup(null);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  void t.store.go("2026-10-15");
  void t.store.go("2026-10-14");
  await t.calls[2]!.answer(ok(daily("2026-10-14")));
  await t.calls[1]!.answer(ok(daily("2026-10-15")));
  assert.equal(t.state().daily?.date, "2026-10-14");
  assert.equal(t.state().date, "2026-10-14");
});

test("刷新同一期：刷新期间和失败时内容留着", async () => {
  const t = setup("2026-10-12");
  void t.store.refresh();
  assert.equal(t.calls[0]!.date, "2026-10-12");
  await t.calls[0]!.answer(ok(daily("2026-10-12")));
  void t.store.refresh();
  assert.equal(t.state().phase, "loading");
  assert.equal(t.state().daily?.date, "2026-10-12");
  await t.calls[1]!.answer(fail(failure("timeout")));
  assert.equal(t.state().daily?.date, "2026-10-12");
  assert.equal(t.state().failure?.kind, "timeout");
});

test("某期日报页：不读不写快照", async () => {
  const t = setup("2026-10-12", daily("2026-10-16"));
  assert.equal(t.state().daily, null);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-12")));
  assert.deepEqual(t.saved, []);
});

test("看最新一期：从 404 的那一天回到 dailies/latest", async () => {
  const t = setup(null);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  void t.store.go("2026-10-12");
  await t.calls[1]!.answer(fail(failure("not_found", 404)));
  assert.deepEqual(dailyScreen(ready(), t.state()), { kind: "missing", latest: false });
  void t.store.latest();
  assert.equal(t.calls[2]!.date, null);
});

test("切回 tab：最新一期 60 秒内不重拉，过了重拉；翻到往期时不动", async () => {
  const clock = { now: NOW };
  const t = setup(null, null, clock);
  void t.store.refresh();
  await t.calls[0]!.answer(ok(daily("2026-10-16")));
  clock.now = NOW + 59_000;
  void t.store.revalidate();
  assert.equal(t.calls.length, 1);
  clock.now = NOW + 60_000;
  void t.store.revalidate();
  assert.equal(t.calls.length, 2);
  await t.calls[1]!.answer(ok(daily("2026-10-16")));
  void t.store.go("2026-10-15");
  await t.calls[2]!.answer(ok(daily("2026-10-15")));
  clock.now = NOW + 10 * 60_000;
  void t.store.revalidate();
  assert.equal(t.calls.length, 3);
});

test("切回 tab：快照还没刷新成功、上次失败都重拉；正在加载时不重复请求", async () => {
  const t = setup(null, daily());
  void t.store.revalidate();
  assert.equal(t.calls.length, 1);
  void t.store.revalidate();
  assert.equal(t.calls.length, 1);
  await t.calls[0]!.answer(fail(failure("network")));
  void t.store.revalidate();
  assert.equal(t.calls.length, 2);
});
