// 构建期配置：板块列表、tabBar 和页面表来自同一处（tabBar 和页面由板块列表推出来），备用构建（-no-sports）只少运动健康，
// 两个板块各自的 api 基址、样子和分类配色。
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES as MANUFACTURING_CATEGORIES } from "../../../industry-packs/manufacturing/taxonomy.ts";
import { CATEGORIES as SPORTS_CATEGORIES } from "../../../industry-packs/sports/taxonomy.ts";
import { FALLBACK_CATEGORY_COLOR, MANUFACTURING_CATEGORY_COLORS, SPORTS_CATEGORY_COLORS, type BuildConfig } from "../config/boards.ts";
import { buildTarget } from "../config/modes.ts";
import { appPages, appTabs, DRILL_PAGES } from "../src/lib/tabs.ts";

const board = (config: BuildConfig, key: string) => config.boards.find((b) => b.key === key);

test("完整构建：五个 tab 依次是精选、日报、运动健康、收藏、锐奇，第一个页面是精选，下钻页排在后面", () => {
  for (const mode of ["dev", "trial", "prod"]) {
    const { config, outputRoot } = buildTarget(mode);
    assert.equal(outputRoot, "dist");
    assert.deepEqual(
      config.boards.map((b) => b.key),
      ["manufacturing", "sports"],
    );
    assert.deepEqual(
      appTabs(config.boards).map((t) => t.text),
      ["精选", "日报", "运动健康", "收藏", "锐奇"],
    );
    assert.deepEqual(appPages(config.boards), [
      "pages/feed/index",
      "pages/daily/index",
      "pages/sports/index",
      "pages/saved/index",
      "pages/reechi/index",
      ...DRILL_PAGES,
    ]);
  }
});

test("备用构建（-no-sports）：板块列表去掉运动健康，tabBar 和页面跟着少掉运动健康，只剩四个 tab，产物另放一个目录", () => {
  for (const env of ["dev", "trial", "prod"]) {
    const full = buildTarget(env).config;
    const { config, outputRoot } = buildTarget(`${env}-no-sports`);
    assert.equal(outputRoot, "dist-no-sports");
    assert.equal(config.env, full.env);
    assert.deepEqual(config.boards, full.boards.filter((b) => b.key !== "sports"), "制造的配置原样留着");
    const tabs = appTabs(config.boards);
    assert.deepEqual(
      tabs.map((t) => t.text),
      ["精选", "日报", "收藏", "锐奇"],
    );
    assert.ok(!appPages(config.boards).includes("pages/sports/index"), "运动健康页不进包");
    assert.deepEqual(
      appPages(config.boards).slice(-DRILL_PAGES.length),
      [...DRILL_PAGES],
      "条目页、事件页照常在（旧分享卡片里的运动健康条目由条目页显示“已下线或不存在”）",
    );
  }
});

test("tab 只跟着板块列表走：哪个板块的 tabs 包含它才出现，收藏和锐奇一直在", () => {
  assert.deepEqual(
    appTabs([]).map((t) => t.key),
    ["saved", "reechi"],
  );
  assert.deepEqual(
    appTabs([{ tabs: ["sports"] }]).map((t) => t.key),
    ["sports", "saved", "reechi"],
  );
});

test("不认识的模式在构建时就停下；体验和正式的 api 基址必须是 https", () => {
  assert.throws(() => buildTarget("production"), /未知的构建模式/);
  assert.throws(() => buildTarget("prod-no-manufacturing"), /未知的构建模式/);
  assert.throws(() => buildTarget("-no-sports"), /未知的构建模式/);
  for (const mode of ["trial", "prod"]) {
    for (const b of buildTarget(mode).config.boards) assert.match(b.apiBase, /^https:\/\//, `${mode} ${b.key}`);
  }
});

test("运动健康板块：key 是 sports，api 基址用 D12 的子域名（开发指本机 3002），名字兜底、所在 tab、不渲染焦点卡、有筛选条、按天看", () => {
  assert.equal(board(buildTarget("prod").config, "sports")!.apiBase, "https://sports.yunyuchen.fun");
  assert.equal(board(buildTarget("trial").config, "sports")!.apiBase, "https://sports.yunyuchen.fun");
  assert.equal(board(buildTarget("dev").config, "sports")!.apiBase, "http://127.0.0.1:3002");
  const { apiBase: _, ...sports } = board(buildTarget("prod").config, "sports")!;
  assert.deepEqual(sports, {
    key: "sports",
    name: "运动健康",
    tabs: ["sports"],
    focusCard: false,
    filterBar: true,
    byDay: true,
    categoryColors: SPORTS_CATEGORY_COLORS,
  });
});

test("两个板块的 api 基址不同：各请求各的行业实例", () => {
  for (const mode of ["dev", "trial", "prod"]) {
    const { config } = buildTarget(mode);
    assert.notEqual(board(config, "manufacturing")!.apiBase, board(config, "sports")!.apiBase, mode);
  }
});

test("制造板块：有焦点卡，没有筛选条，今天按时段分段", () => {
  // reminderTemplateId（“提醒我明天的日报”的订阅模板 id）三份各配各的，不在共用部分里，tests/reminder.test.ts 另核对。
  const { apiBase: _, reminderTemplateId, ...manufacturing } = board(buildTarget("prod").config, "manufacturing")!;
  assert.equal(typeof reminderTemplateId, "string");
  assert.deepEqual(manufacturing, {
    key: "manufacturing",
    name: "制造",
    tabs: ["feed", "daily"],
    focusCard: true,
    filterBar: false,
    byDay: false,
    categoryColors: MANUFACTURING_CATEGORY_COLORS,
  });
});

// 配色表的 key 对着行业包的分类表（只有改了这个目录或契约包时才跑，改了行业包的分类要在这里手动跑一次 npm test）。
test("分类配色表的 key 和各自行业包的分类一致；运动健康在 D3 定下前一律兜底灰", () => {
  assert.deepEqual(Object.keys(MANUFACTURING_CATEGORY_COLORS).sort(), MANUFACTURING_CATEGORIES.map((c) => c.key).sort());
  assert.deepEqual(Object.keys(SPORTS_CATEGORY_COLORS).sort(), SPORTS_CATEGORIES.map((c) => c.key).sort());
  for (const color of Object.values(SPORTS_CATEGORY_COLORS)) assert.equal(color, FALLBACK_CATEGORY_COLOR);
});
