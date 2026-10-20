// The worker's schedules (apps/worker/src/schedules.ts) follow the industry pack's daily column
// (FEATURES.reports): on, the four report schedules and the daily reminders' 10-minute fallback are in
// pg-boss's schedule table; off, none of them is, and an instance that had the column on loses them when
// the worker starts again. The other schedules
// (hot ranking, stories) stay either way. Registration runs against the real schedule table but takes no
// work, so nothing scheduled runs in the test.
import "./setup.ts"; // first: the environment the backend modules read at import
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { FEATURES } from "@aihot/industry/features";
import { closeDb } from "@aihot/backend/db";
import { ensureQueue, getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { registerSchedules, SCHEDULES } from "../apps/worker/src/schedules.ts";

const REPORTS = ["reports.daily", "reports.weekly", "reports.monthly", "reports.catch-up"];
const REMINDERS = "reminders.send";
const KEPT = ["hot.rank", "hot.snapshot", "stories.status", "stories.links", "reports.source-health"];

after(async () => {
  const boss = await getBoss();
  for (const name of new Set([...SCHEDULES.map((s) => s.name), ...REPORTS, REMINDERS])) await boss.unschedule(`cron.${name}`);
  await stopBoss();
  await closeDb();
});

test(`the daily column is ${FEATURES.reports ? "on: the four report schedules and the reminders' fallback are registered" : "off: the four report schedules and the reminders' fallback are not registered, and ones left from an earlier start are removed"}`, async () => {
  const boss = await getBoss();
  // An earlier start of this instance, with the column on, left the four report schedules behind.
  for (const name of [...REPORTS, REMINDERS]) {
    await ensureQueue(`cron.${name}`, { policy: "singleton", retryLimit: 1, expireInSeconds: 3600 });
    await boss.schedule(`cron.${name}`, "0 8 * * *", {}, { tz: "Asia/Shanghai" });
  }
  await registerSchedules({
    schedule: boss.schedule.bind(boss),
    getSchedules: boss.getSchedules.bind(boss),
    unschedule: boss.unschedule.bind(boss),
    work: async () => "no handler in the test",
  });

  const scheduled = new Set((await boss.getSchedules()).map((s) => s.name));
  assert.deepEqual(REPORTS.filter((name) => scheduled.has(`cron.${name}`)), FEATURES.reports ? REPORTS : []);
  assert.equal(scheduled.has(`cron.${REMINDERS}`), FEATURES.reports, "the reminders' 10-minute fallback goes with the daily column");
  for (const name of KEPT) assert.ok(scheduled.has(`cron.${name}`), `${name} is scheduled whatever the daily column`);
});
