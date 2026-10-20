import assert from "node:assert/strict";
import { test } from "node:test";
import { SCAN_WIDTH, scanBar } from "../src/lib/scan-bar.ts";

const NOW = "2026-10-17T19:18:00+08:00";
const SLOT = SCAN_WIDTH / 48;

function near(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message ?? ""} ${actual} ≠ ${expected}`);
}

test("落点：每个半小时一格，圆点在格子正中，最下面一颗贴着底线", () => {
  const bar = scanBar(["2026-10-17T00:00:00+08:00", "2026-10-17T23:59:00+08:00"], null, NOW);
  assert.equal(bar.pips.length, 2);
  // 原型：0 点那颗在 1.7。
  near(bar.pips[0]!.left, 1.729);
  near(bar.pips[0]!.top, 17);
  near(bar.pips[1]!.left, 47 * SLOT + 1.729);
});

test("落点：半小时的边界，08:29 和 08:30 落在相邻两格", () => {
  const bar = scanBar(["2026-10-17T08:29:00+08:00", "2026-10-17T08:30:00+08:00"], null, NOW);
  near(bar.pips[1]!.left - bar.pips[0]!.left, SLOT);
  near(bar.pips[0]!.top, 17);
  near(bar.pips[1]!.top, 17);
});

test("堆叠：同一个半小时里的往上堆，间距 5.5（原型 08:00 的三条在 121、top 17/11.5/6）", () => {
  const bar = scanBar(["2026-10-17T08:00:00+08:00", "2026-10-17T08:00:00+08:00", "2026-10-17T08:20:00+08:00"], null, NOW);
  assert.equal(bar.pips.length, 3);
  for (const pip of bar.pips) near(pip.left, 121.06);
  assert.deepEqual(
    bar.pips.map((p) => p.top),
    [17, 11.5, 6],
  );
});

test("堆叠：一格里超过 4 颗时压缩间距，全部挤在条里，不往上溢出", () => {
  const times = Array.from({ length: 8 }, () => "2026-10-17T08:00:00+08:00");
  const bar = scanBar(times, null, NOW);
  assert.equal(bar.pips.length, 8);
  near(bar.pips[0]!.top, 17);
  near(bar.pips[7]!.top, 0.5);
  near(bar.pips[0]!.top - bar.pips[1]!.top, 16.5 / 7);
});

test("只画北京时间今天的时刻：别的日期和解析不了的跳过", () => {
  const bar = scanBar(
    [
      "2026-10-16T23:59:00+08:00",
      "not a time",
      // UTC 10-16 16:00 是北京今天 0 点。
      "2026-10-16T16:00:00Z",
    ],
    null,
    NOW,
  );
  assert.equal(bar.pips.length, 1);
  near(bar.pips[0]!.left, 1.729);
  assert.deepEqual(scanBar([], null, NOW).pips, []);
});

test("游标在当前时刻；“HH:mm 更新”取 updatedAt，为 null 时不显示", () => {
  const bar = scanBar([], "2026-10-17T19:18:00+08:00", NOW);
  // 原型：19:18 的游标在 287.5（线宽 1，中心 288）。
  near(bar.cursor, (19.3 / 24) * SCAN_WIDTH);
  assert.equal(bar.label, "19:18 更新");
  assert.equal(bar.labelSide, "right");
  assert.equal(bar.capSide, "left");
  assert.equal(scanBar([], null, NOW).label, null);
  // 今天还没有新精选时，最近一次放出在昨天：按统一的时间显示写成“昨天 HH:mm”。
  assert.equal(scanBar([], "2026-10-16T22:10:00+08:00", "2026-10-17T09:00:00+08:00").label, "昨天 22:10 更新");
});

test("靠近右端时标签放到游标左边；游标走到左端时“发布时刻”挪到右上角", () => {
  assert.equal(scanBar([], "2026-10-17T23:00:00+08:00", "2026-10-17T23:30:00+08:00").labelSide, "left");
  assert.equal(scanBar([], "2026-10-17T19:00:00+08:00", "2026-10-17T19:20:00+08:00").labelSide, "right");
  assert.equal(scanBar([], null, "2026-10-17T01:00:00+08:00").capSide, "right");
  assert.equal(scanBar([], null, "2026-10-17T06:00:00+08:00").capSide, "left");
});

test("焦点卡那条：同一时刻的第一个点星青、直径 5，底边仍贴着底线（原型 .pip.hot 在 247.3、top 16）", () => {
  const focusAt = "2026-10-17T16:40:00+08:00";
  const bar = scanBar(["2026-10-17T08:00:00+08:00", "2026-10-17T16:40:00.000+08:00", "2026-10-17T17:10:00+08:00"], null, NOW, focusAt);
  assert.deepEqual(
    bar.pips.map((p) => p.hot),
    [false, true, false],
  );
  const hot = bar.pips[1]!;
  near(hot.left, 33 * SLOT + (SLOT - 5) / 2);
  near(hot.left, 247.35);
  near(hot.top, 16);
});

test("焦点卡那条：按时刻比较（写法不同也认），只标一颗；在堆里的位置不变", () => {
  const times = ["2026-10-17T08:00:00+08:00", "2026-10-17T00:10:00Z", "2026-10-17T08:10:00+08:00"];
  const bar = scanBar(times, null, NOW, "2026-10-17T08:10:00+08:00");
  assert.deepEqual(
    bar.pips.map((p) => p.hot),
    [false, true, false],
  );
  // 第二颗往上堆了一格，再往上提 1 让底边对齐。
  near(bar.pips[1]!.top, 17 - 5.5 - 1);
  // 同一时刻有两张卡也只标第一颗。
  const twice = scanBar(["2026-10-17T08:10:00+08:00", "2026-10-17T08:10:00+08:00"], null, NOW, "2026-10-17T08:10:00+08:00");
  assert.deepEqual(
    twice.pips.map((p) => p.hot),
    [true, false],
  );
});

test("焦点卡那条：没有焦点卡、焦点时刻不在 times 里或不是今天，没有星青的点", () => {
  const times = ["2026-10-17T08:00:00+08:00"];
  assert.ok(scanBar(times, null, NOW).pips.every((p) => !p.hot));
  assert.ok(scanBar(times, null, NOW, "2026-10-17T09:00:00+08:00").pips.every((p) => !p.hot));
  assert.ok(scanBar(times, null, NOW, "bad").pips.every((p) => !p.hot));
  assert.ok(scanBar(["2026-10-16T08:00:00+08:00"], null, NOW, "2026-10-16T08:00:00+08:00").pips.every((p) => !p.hot));
});
