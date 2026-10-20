import assert from "node:assert/strict";
import { test } from "node:test";
import { createGate } from "../src/lib/gate.ts";

test("同时最多 3 个任务在跑，其余按先来后到排队", async () => {
  const run = createGate(3);
  let active = 0;
  let peak = 0;
  const started: number[] = [];
  const releases: (() => void)[] = [];
  const tasks = [0, 1, 2, 3, 4, 5].map((i) =>
    run(async () => {
      active++;
      peak = Math.max(peak, active);
      started.push(i);
      await new Promise<void>((resolve) => releases.push(resolve));
      active--;
      return i;
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, [0, 1, 2]);
  // 结束一个时，排着的下一个接上；同时新来的任务不能插队抢名额。
  releases.shift()!();
  const late = run(async () => {
    started.push(99);
    return "late";
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(started, [0, 1, 2, 3]);
  while (releases.length) {
    releases.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 99]);
  assert.equal(await late, "late");
  assert.equal(peak, 3);
});

test("任务抛错也会让出名额", async () => {
  const run = createGate(1);
  await assert.rejects(run(async () => Promise.reject(new Error("boom"))));
  assert.equal(await run(async () => "ok"), "ok");
});
