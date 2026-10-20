import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dailyIssuePage, drillTarget, homeTab, issueTarget, itemPage, navigation, REDIRECT_DEPTH, storyPage } from "../src/lib/page-stack.ts";
import type { BoardConfig } from "../config/boards.ts";
import { appPages } from "../src/lib/tabs.ts";

const BOARDS = ["manufacturing", "sports"];

test("页面栈：不到 9 层用 navigateTo，到 9 层及以上改用 redirectTo（微信上限 10 层）", () => {
  assert.equal(REDIRECT_DEPTH, 9);
  assert.equal(navigation(0), "navigateTo");
  assert.equal(navigation(1), "navigateTo");
  assert.equal(navigation(8), "navigateTo");
  assert.equal(navigation(9), "redirectTo");
  assert.equal(navigation(10), "redirectTo");
});

test("下钻页地址：board 和 id，id 编码", () => {
  assert.equal(itemPage("manufacturing", "it_01ABC-x"), "/pages/item/index?board=manufacturing&id=it_01ABC-x");
  assert.equal(itemPage("sports", "a b&c"), "/pages/item/index?board=sports&id=a%20b%26c");
  assert.equal(storyPage("manufacturing", "st_9"), "/pages/story/index?board=manufacturing&id=st_9");
});

test("下钻页参数：board 是构建配置里的板块、id 非空才算数", () => {
  assert.deepEqual(drillTarget({ board: "manufacturing", id: "it_1" }, BOARDS), { board: "manufacturing", id: "it_1" });
  assert.deepEqual(drillTarget({ board: "sports", id: "x" }, BOARDS), { board: "sports", id: "x" });
  assert.equal(drillTarget({ board: "manufacturing" }, BOARDS), null);
  assert.equal(drillTarget({ board: "manufacturing", id: "" }, BOARDS), null);
  assert.equal(drillTarget({ id: "it_1" }, BOARDS), null);
  assert.equal(drillTarget({ board: "finance", id: "it_1" }, BOARDS), null);
  assert.equal(drillTarget({}, BOARDS), null);
});

test("下钻页参数：微信不解码，这里解一次；坏的 % 序列原样交给接口", () => {
  assert.deepEqual(drillTarget({ board: "sports", id: "a%20b%26c" }, BOARDS), { board: "sports", id: "a b&c" });
  assert.deepEqual(drillTarget({ board: "sports", id: "100%" }, BOARDS), { board: "sports", id: "100%" });
  // 和 itemPage 来回一趟不变。
  const url = itemPage("manufacturing", "a/b?c");
  const query = Object.fromEntries(url.split("?")[1]!.split("&").map((kv) => kv.split("=") as [string, string]));
  assert.deepEqual(drillTarget(query, BOARDS), { board: "manufacturing", id: "a/b?c" });
});

test("已下线时回哪个 tab：板块的第一个 tab，认不出板块回精选", () => {
  assert.deepEqual(homeTab("feed"), { url: "/pages/feed/index", label: "回到精选" });
  assert.deepEqual(homeTab("sports"), { url: "/pages/sports/index", label: "回到运动健康" });
  assert.deepEqual(homeTab(undefined), { url: "/pages/feed/index", label: "回到精选" });
});

test("条目页和事件页来回点：前 8 次往上叠，栈到 9 层以后每次都替换当前页，栈不超过 10 层", () => {
  let depth = 1;
  const ops: string[] = [];
  for (let i = 0; i < 20; i++) {
    const op = navigation(depth);
    ops.push(op);
    if (op === "navigateTo") depth++;
    assert.ok(depth <= 10);
  }
  assert.deepEqual(ops.slice(0, 8), Array(8).fill("navigateTo"));
  assert.ok(ops.slice(8).every((op) => op === "redirectTo"));
  assert.equal(depth, 9);
});

test("某期日报页地址：board 和 date", () => {
  assert.equal(dailyIssuePage("manufacturing", "2026-10-16"), "/pages/daily-issue/index?board=manufacturing&date=2026-10-16");
});

test("某期日报页参数：date 是日历上有的 YYYY-MM-DD；board 不带时用有日报的第一个板块，带了得是有日报的板块", () => {
  const daily = ["manufacturing"];
  assert.deepEqual(issueTarget({ board: "manufacturing", date: "2026-10-16" }, daily), { board: "manufacturing", date: "2026-10-16" });
  assert.deepEqual(issueTarget({ date: "2026-10-16" }, daily), { board: "manufacturing", date: "2026-10-16" });
  assert.equal(issueTarget({ board: "sports", date: "2026-10-16" }, daily), null);
  assert.equal(issueTarget({ board: "", date: "2026-10-16" }, daily), null);
  assert.equal(issueTarget({ board: "manufacturing" }, daily), null);
  assert.equal(issueTarget({ date: "2026-02-30" }, daily), null);
  assert.equal(issueTarget({ date: "2026-10-6" }, daily), null);
  assert.equal(issueTarget({ date: "latest" }, daily), null);
  assert.equal(issueTarget({ date: "2026-10-16" }, []), null);
  // 和 dailyIssuePage 来回一趟不变。
  const url = dailyIssuePage("manufacturing", "2026-10-16");
  const query = Object.fromEntries(url.split("?")[1]!.split("&").map((kv) => kv.split("=") as [string, string]));
  assert.deepEqual(issueTarget(query, daily), { board: "manufacturing", date: "2026-10-16" });
});

test("服务通知点开的地址（后端 notify/reminders.ts 拼的 page）是注册过的某期日报页，参数解析得出那一期", () => {
  const root = new URL("../../../", import.meta.url);
  const backend = readFileSync(new URL("packages/backend/src/notify/reminders.ts", root), "utf8");
  // 后端：pages/daily-issue/index?board=${BOARD.key}&date=${date}（订阅消息的 page 不带开头的斜杠）。
  assert.match(backend, /`pages\/daily-issue\/index\?board=\$\{BOARD\.key\}&date=\$\{date\}`/);
  const page = "pages/daily-issue/index?board=manufacturing&date=2026-10-18";
  assert.equal(`/${page}`, dailyIssuePage("manufacturing", "2026-10-18"));
  // 页面表由 lib/tabs.ts 按板块列表推出来（app.config.ts 只是调它）：某期日报页注册在下钻页里；首页（回首页按钮回到的页面）是
  // pages 的第一个，即精选。备用构建去掉运动健康板块后也一样。
  const full: Pick<BoardConfig, "tabs">[] = [{ tabs: ["feed", "daily"] }, { tabs: ["sports"] }];
  for (const boards of [full, full.slice(0, 1)]) {
    const pages = appPages(boards);
    assert.ok(pages.includes("pages/daily-issue/index"));
    assert.equal(pages[0], "pages/feed/index");
  }
  const query = Object.fromEntries(page.split("?")[1]!.split("&").map((kv) => kv.split("=") as [string, string]));
  assert.deepEqual(issueTarget(query, ["manufacturing"]), { board: "manufacturing", date: "2026-10-18" });
});
