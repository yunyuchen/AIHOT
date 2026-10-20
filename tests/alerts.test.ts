// Ops alerts reach the site owner: a problem is announced once, repeated no more than its level allows
// (hourly for reader impact), closed with one recovery message; entries from before the levels existed
// close without a message. Every message names the site, since two instances may share one chat.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { alertText } from "@aihot/backend/notify/feishu";
import { checkAlerts, collectFindings, sendDigest } from "@aihot/backend/operations/alerts";
import { FEATURES } from "@aihot/industry/features";
import { SITE } from "@aihot/industry/site";

const T = tag();
const SOURCE = `test-alerts-${T}`;
let saved: { key: string; value: unknown }[] = [];
const ids: string[] = [];

// Feishu's message app, answered here; nothing is sent unless a test turns FEISHU_INTERNAL_ENABLED on.
process.env.FEISHU_APP_ID = "test-app";
process.env.FEISHU_APP_SECRET = "test-secret";
process.env.FEISHU_ALERT_CHAT_ID = "oc_alerts";
const sent: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (!url.startsWith("https://open.feishu.cn/")) return realFetch(input, init);
  if (url.endsWith("/auth/v3/tenant_access_token/internal")) return Response.json({ code: 0, tenant_access_token: "t", expire: 7200 });
  if (url.includes("/im/v1/messages")) {
    sent.push(JSON.parse(JSON.parse(String(init?.body)).content).text);
    return Response.json({ code: 0, data: { message_id: "m1" } });
  }
  throw new Error(`unexpected request ${url}`);
}) as typeof fetch;

before(async () => {
  await getBoss(); // collectFindings reads the job tables
  saved = await sql`SELECT key, value FROM settings WHERE key IN ('alerts.state', 'heartbeat.worker', 'leaderboard.fetch')`;
  await sql`DELETE FROM settings WHERE key = 'heartbeat.worker'`;
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${SOURCE}, 'Test alerts', 'rss', '2100-01-01')`;
  // Ten new articles that have waited three hours: new content is stuck, readers see nothing new.
  for (let i = 0; i < 10; i++) {
    const { articleId } = await upsertMaterial({ sourceId: SOURCE, url: `https://example.com/${T}-${i}`, title: `stuck ${i}`, bodyStatus: "none", via: "fetch" } as never);
    ids.push(articleId);
  }
  await sql`UPDATE articles SET discovered_at = now() - interval '3 hours', processing_state = 'new' WHERE id IN ${sql(ids)}`;
});
after(async () => {
  await sql`DELETE FROM articles WHERE source_id = ${SOURCE}`;
  await sql`DELETE FROM sources WHERE id = ${SOURCE}`;
  await sql`DELETE FROM settings WHERE key IN ('alerts.state', 'leaderboard.fetch')`;
  for (const s of saved) await sql`INSERT INTO settings (key, value, updated_by) VALUES (${s.key}, ${sql.json(s.value as never)}, 'test') ON CONFLICT (key) DO NOTHING`;
  globalThis.fetch = realFetch;
  await stopBoss();
  await closeDb();
});

test("an outage is announced once, repeated hourly, and closed with one recovery", async () => {
  process.env.COLLECT_ENABLED = "true";
  process.env.MODEL_CALLS_ENABLED = "true";
  const t0 = Date.now();
  await sql`INSERT INTO settings (key, value, updated_by) VALUES ('alerts.state', ${sql.json({ "receipts.unknown": { title: "付费请求结果未知", since: new Date(t0 - 86400_000).toISOString(), sentAt: new Date(t0 - 3600_000).toISOString() } })}, 'test')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  const stuck = (sent: string[]) => sent.filter((k) => k.startsWith("content.process"));

  let r = await checkAlerts(t0);
  assert.deepEqual(stuck(r.sent), ["content.process"]);
  assert.ok(!r.sent.some((k) => k.startsWith("receipts.unknown")), "an entry from before the levels closes silently");
  assert.ok(!r.open.includes("receipts.unknown"));
  r = await checkAlerts(t0 + 50 * 60_000);
  assert.deepEqual(stuck(r.sent), [], "no repeat within the hour");
  r = await checkAlerts(t0 + 61 * 60_000);
  assert.deepEqual(stuck(r.sent), ["content.process"], "hourly reminder while it lasts");

  await sql`UPDATE articles SET processing_state = 'analyzed' WHERE id IN ${sql(ids)}`;
  r = await checkAlerts(t0 + 70 * 60_000);
  assert.deepEqual(stuck(r.sent), ["content.process:recovered"]);
  r = await checkAlerts(t0 + 80 * 60_000);
  assert.deepEqual(stuck(r.sent), []);
});

test("every alert, recovery and digest names the site once, and outside production the environment", async () => {
  process.env.COLLECT_ENABLED = "true";
  process.env.MODEL_CALLS_ENABLED = "true";
  const environment = config.environmentName;
  try {
    config.environmentName = "production";
    assert.equal(alertText("🔴 新内容卡住了", ["影响：精选会缺内容"]), `【${SITE.name}】🔴 新内容卡住了\n影响：精选会缺内容`);
    config.environmentName = "staging";
    assert.equal(alertText("🔴 新内容卡住了", ["影响：精选会缺内容"]), `【${SITE.name}】【staging】🔴 新内容卡住了\n影响：精选会缺内容`);

    // What reaches the chat: an outage, its recovery, and a digest with one leaderboard source failing for two days.
    process.env.FEISHU_INTERNAL_ENABLED = "true";
    const t0 = Date.now();
    await sql`DELETE FROM settings WHERE key = 'alerts.state'`;
    await sql`UPDATE articles SET processing_state = 'new' WHERE id IN ${sql(ids)}`;
    await checkAlerts(t0);
    await sql`UPDATE articles SET processing_state = 'analyzed' WHERE id IN ${sql(ids)}`;
    await checkAlerts(t0 + 10 * 60_000);
    const failing = { sources: { [`test-${T}`]: { ok: false, lastOkAt: new Date(t0 - 2 * 86400_000).toISOString(), error: "HTTP 500" } } };
    await sql`INSERT INTO settings (key, value, updated_by) VALUES ('leaderboard.fetch', ${sql.json(failing)}, 'test')
              ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
    await sendDigest(t0);

    const label = `【${SITE.name}】【staging】`;
    assert.ok(sent.some((t) => t.startsWith(`${label}🔴 新内容卡住了`)), "the outage");
    assert.ok(sent.some((t) => t.startsWith(`${label}✅ 已恢复：新内容卡住了`)), "its recovery");
    assert.ok(sent.some((t) => t.startsWith(`${label}📋 系统日报`) && t.includes(`test-${T}`)), "the digest");
    for (const t of sent) assert.equal(t.split(SITE.name).length, 2, `the site named once: ${t}`);
  } finally {
    delete process.env.FEISHU_INTERNAL_ENABLED;
    config.environmentName = environment;
  }
});

// A board without a daily column (the sports pack) never composes one, so a missing daily there is not an
// outage; with the column on, a daily still missing at 10:00 is.
test(`the missing-daily alert follows the industry pack's daily column: ${FEATURES.reports ? "on, a daily missing after 10:00 is reported" : "off, a missing daily is never reported"}`, async () => {
  process.env.COLLECT_ENABLED = "true";
  process.env.MODEL_CALLS_ENABLED = "true";
  // A far-off day nothing else writes a daily for (seed reports use 2099-12).
  const day = "2098-03-17";
  const at = (time: string) => Date.parse(`${day}T${time}:00+08:00`);
  const daily = async (now: number) => (await collectFindings(now)).some((f) => f.key === "report.daily");
  try {
    assert.equal(await daily(at("09:30")), false, "before 10:00 the hourly catch-up still has time");
    assert.equal(await daily(at("12:00")), FEATURES.reports, FEATURES.reports ? "no daily at noon is reported" : "no daily column, nothing to report");
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
              VALUES ('daily', ${day}, ${new Date(at("08:00") - 86400_000)}, ${new Date(at("08:00"))}, ${sql.json({})}, now(), 'manual')`;
    assert.equal(await daily(at("12:00")), false, "a saved daily closes it");
  } finally {
    await sql`DELETE FROM reports WHERE kind = 'daily' AND key = ${day}`;
  }
});
