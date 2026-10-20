// "提醒我明天的日报": the write through the real api route, and the worker's send, recovery and cleanup called
// directly. WeChat is answered here (global fetch, only https://api.weixin.qq.com/), and the safety valve is
// opened per test and closed again. What a reader is promised is checked on the table itself: the openid is
// kept for one message, deleted once the send has an outcome or 48 hours on, never resent, and never in a
// backup. The daily saved by the 08:00 job or the hourly catch-up queues that day's send.
import { tag } from "./setup.ts"; // first: the environment the backend modules read at import
import { seeds } from "./seed.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { runsOverview } from "@aihot/backend/admin/runs";
import { switchRectification } from "@aihot/backend/admin/settings";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { getBoss, recordRun, stopBoss } from "@aihot/backend/jobs/queue";
import { createReminder, expireReminders, recoverStaleReminders, sendReminders } from "@aihot/backend/notify/reminders";
import { collectFindings } from "@aihot/backend/operations/alerts";
import { dumpArgs, runBackup } from "@aihot/backend/operations/backup";
import { catchUpReports, composeDaily } from "@aihot/backend/reports/compose";
import type { MiniprogramReminder } from "@aihot/contracts/miniprogram";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { FEATURES } from "@aihot/industry/features";
import { BOARD, siteDaily } from "@aihot/industry/site";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const seed = seeds(T, `test-reminders-${T}`);
const ACTOR = `test:reminders-${T}`;
const TEMPLATE = `tmpl-${T}`;
const URL_ = "/api/mp/v1/reminders";
const openid = (name: string) => `o-${T}-${name}`;
const mine = () => sql`openid LIKE ${`o-${T}-%`}`;
const app = await buildApp();
const startedAt = new Date();

// ---- WeChat, answered here -------------------------------------------------------------------------
interface Call { path: string; url: URL; body: Record<string, unknown> | null }
const wechat = {
  calls: [] as Call[],
  /** The subscribe send's answer for one request (default: sent). */
  send: (_body: Record<string, unknown>, _token: string): Response => Response.json({ errcode: 0, errmsg: "ok", msgid: 1 }),
  tokens: 0,
};
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const href = input instanceof Request ? input.url : String(input);
  if (!href.startsWith("https://api.weixin.qq.com/")) return realFetch(input, init);
  const url = new URL(href);
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  wechat.calls.push({ path: url.pathname, url, body });
  if (url.pathname === "/sns/jscode2session") {
    const code = url.searchParams.get("js_code")!;
    if (code.startsWith("bad")) return Response.json({ errcode: 40029, errmsg: "invalid code" });
    if (code.startsWith("down")) return new Response("busy", { status: 503 });
    if (code.startsWith("slow")) throw timeout();
    return Response.json({ openid: openid(code), session_key: "secret-session-key" });
  }
  if (url.pathname === "/cgi-bin/stable_token") {
    wechat.tokens += 1;
    return Response.json({ access_token: `tok-${wechat.tokens}`, expires_in: 7200 });
  }
  if (url.pathname === "/cgi-bin/message/subscribe/send") return wechat.send(body!, url.searchParams.get("access_token")!);
  throw new Error(`unexpected WeChat request ${url.pathname}`);
}) as typeof fetch;

const calls = (p: string) => wechat.calls.filter((c) => c.path === p);
const sends = () => calls("/cgi-bin/message/subscribe/send");

let app_ = 0;
/** Runs `fn` with the valve open and credentials set (a fresh app id unless one is given), then puts both back. */
async function withWechat<R>(fn: () => Promise<R>, env: Record<string, string | undefined> = {}): Promise<R> {
  app_ += 1;
  const set: Record<string, string | undefined> = {
    WECHAT_SUBSCRIBE_PUSH_ENABLED: "true", WECHAT_MINIPROGRAM_APPID: `wx-${T}-${app_}`, WECHAT_MINIPROGRAM_SECRET: "test-secret",
    WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID: TEMPLATE, WECHAT_MINIPROGRAM_STATE: undefined, ...env,
  };
  const saved = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(set)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  }
}

before(async () => {
  wechat.calls = [];
  await getBoss(); // the send queue and the alerts read pg-boss's tables
});
/** Reports this file saved, removed when it is done. */
const planted: Array<() => Promise<void>> = [];
after(async () => {
  globalThis.fetch = realFetch;
  try {
    for (const remove of planted) await remove();
    await sql`DELETE FROM miniprogram_reminders WHERE ${mine()}`;
    await sql`DELETE FROM job_runs WHERE job = 'reminders.send' AND started_at >= ${startedAt}`;
    await switchRectification({ status: "normal", reason: "test end" }, ACTOR);
  } finally {
    await app.close();
    await stopBoss();
    await closeDb();
  }
});

let ip = 0;
const post = (payload: unknown, from = `198.51.100.${++ip}`) =>
  app.inject({ method: "POST", url: URL_, headers: { host: "localhost", "x-real-ip": from }, payload: payload as Record<string, unknown> });
const rows = (who: string) => sql<{ openid: string; target_date: string; template_id: string; created_at: Date; status: string }[]>`
  SELECT openid, target_date::text, template_id, created_at, status FROM miniprogram_reminders WHERE openid = ${who}`;
const minePlanted = async () => (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM miniprogram_reminders WHERE ${mine()}`)[0]!.n;
const tomorrow = () => addDays(beijingDate(Date.now()), 1);
const problem = (res: { body: string }) => JSON.parse(res.body) as { status: number; code: string; requestId: string };

// ---- The write: POST /api/mp/v1/reminders --------------------------------------------------------

test(FEATURES.reports ? "the pack has a daily column: the route is registered" : "the pack has no daily column: the route is a 404 like any other path", async () => {
  const res = await post({ code: "c-route", templateId: TEMPLATE });
  if (FEATURES.reports) assert.notEqual(res.statusCode, 404);
  else {
    assert.equal(res.statusCode, 404);
    assert.equal(problem(res).code, "not_found");
  }
});

if (FEATURES.reports) {
  test("with the valve off: 503 reminders_disabled, WeChat is never asked and nothing is stored", async () => {
    const before = wechat.calls.length;
    const res = await post({ code: "c-off", templateId: TEMPLATE });
    assert.equal(res.statusCode, 503);
    assert.equal(problem(res).code, "reminders_disabled");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/);
    assert.equal(wechat.calls.length, before, "no request to WeChat");
    assert.equal((await rows(openid("c-off"))).length, 0);
  });

  test("with the valve on but WeChat credentials missing: 503 reminders_disabled, and WeChat is never asked", async () => {
    const before = wechat.calls.length;
    for (const missing of ["WECHAT_MINIPROGRAM_APPID", "WECHAT_MINIPROGRAM_SECRET", "WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID"]) {
      const res = await withWechat(() => post({ code: "c-nocreds", templateId: TEMPLATE }), { [missing]: undefined });
      assert.equal(res.statusCode, 503, missing);
      assert.equal(problem(res).code, "reminders_disabled", missing);
    }
    assert.equal(wechat.calls.length, before);
    assert.equal((await rows(openid("c-nocreds"))).length, 0);
  });

  test("with the valve on: one row for the next Beijing day, an answer without the openid, and asking again keeps one row", async () => {
    const dayBefore = tomorrow();
    const res = await withWechat(() => post({ code: "c-ok", templateId: TEMPLATE }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.headers["cache-control"], "no-store");
    const body = JSON.parse(res.body) as MiniprogramReminder;
    assert.deepEqual(Object.keys(body).sort(), ["schemaVersion", "targetDate"]);
    assert.equal(body.schemaVersion, 1);
    assert.ok([dayBefore, tomorrow()].includes(body.targetDate), "the day after the request, in Beijing");
    assert.ok(!res.body.includes(openid("c-ok")), "the openid stays on the server");

    const exchange = calls("/sns/jscode2session").at(-1)!;
    assert.equal(exchange.url.searchParams.get("js_code"), "c-ok");
    assert.equal(exchange.url.searchParams.get("grant_type"), "authorization_code");
    assert.equal(exchange.url.searchParams.get("secret"), "test-secret");
    const [row] = await rows(openid("c-ok"));
    assert.deepEqual({ target: row!.target_date, template: row!.template_id, status: row!.status }, { target: body.targetDate, template: TEMPLATE, status: "pending" });
    assert.ok(Math.abs(row!.created_at.getTime() - Date.now()) < 60_000, "when it was asked for");

    const again = await withWechat(() => post({ code: "c-ok", templateId: TEMPLATE }));
    assert.equal(again.statusCode, 200);
    assert.equal((await rows(openid("c-ok"))).length, 1, "the same reader, the same day: one row");
  });

  test("a template other than this board's is 400, and WeChat is never asked", async () => {
    const before = wechat.calls.length;
    const res = await withWechat(() => post({ code: "c-tmpl", templateId: "someone-elses-template" }));
    assert.equal(res.statusCode, 400);
    assert.equal(problem(res).code, "invalid_request");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(wechat.calls.length, before);
    assert.equal((await rows(openid("c-tmpl"))).length, 0);
  });

  test("a malformed body is 400 invalid_request, and WeChat is never asked", async () => {
    const before = wechat.calls.length;
    await withWechat(async () => {
      for (const payload of [{ code: 1, templateId: TEMPLATE }, { code: "", templateId: TEMPLATE }, { code: "c-x", templateId: TEMPLATE, date: "2026-01-01" }, ["c-x"]]) {
        const res = await post(payload);
        assert.equal(res.statusCode, 400, JSON.stringify(payload));
        assert.equal(problem(res).code, "invalid_request");
      }
      const text = await app.inject({ method: "POST", url: URL_, headers: { host: "localhost", "content-type": "application/json", "x-real-ip": "198.51.100.250" }, payload: "{not json" });
      assert.equal(text.statusCode, 400);
      assert.equal(problem(text).code, "invalid_request");
      assert.equal(text.headers["cache-control"], "no-store");
    });
    assert.equal(wechat.calls.length, before);
  });

  test("a code WeChat refuses is 400 and nothing is stored", async () => {
    const res = await withWechat(() => post({ code: "bad-code", templateId: TEMPLATE }));
    assert.equal(res.statusCode, 400);
    assert.equal(problem(res).code, "invalid_request");
    assert.equal((await rows(openid("bad-code"))).length, 0);
  });

  test("WeChat answering 5xx or timing out is 503 temporarily_unavailable and nothing is stored", async () => {
    for (const code of ["down-1", "slow-1"]) {
      const res = await withWechat(() => post({ code, templateId: TEMPLATE }));
      assert.equal(res.statusCode, 503, code);
      assert.equal(problem(res).code, "temporarily_unavailable", code);
      assert.equal(res.headers["cache-control"], "no-store", code);
      assert.equal((await rows(openid(code))).length, 0, code);
    }
  });

  test("more than 10 requests a minute from one address are 429 rate_limited; other addresses are not held back", async () => {
    const from = "198.51.100.200";
    for (let i = 0; i < 10; i++) assert.equal((await post({ code: `c-rate-${i}`, templateId: TEMPLATE }, from)).statusCode, 503, `request ${i + 1}`);
    const res = await post({ code: "c-rate-10", templateId: TEMPLATE }, from);
    assert.equal(res.statusCode, 429);
    assert.equal(problem(res).code, "rate_limited");
    assert.equal(res.headers["cache-control"], "no-store");
    assert.ok(Number(res.headers["retry-after"]) > 0);
    assert.equal((await post({ code: "c-rate-other", templateId: TEMPLATE }, "198.51.100.201")).statusCode, 503);
  });

  test("the target date is the day after the request in Beijing at 07:59, 08:01 and 23:59", async () => {
    await withWechat(async () => {
      for (const [at, code] of [["07:59", "c-0759"], ["08:01", "c-0801"], ["23:59", "c-2359"]] as const) {
        const { targetDate } = await createReminder({ code, templateId: TEMPLATE }, new Date(`2026-10-17T${at}:00+08:00`));
        assert.equal(targetDate, "2026-10-18", at);
        assert.equal((await rows(openid(code)))[0]?.target_date, "2026-10-18", at);
      }
      // 00:01 is already the next Beijing day (16:01 UTC the day before).
      const { targetDate } = await createReminder({ code: "c-0001", templateId: TEMPLATE }, new Date("2026-10-17T16:01:00Z"));
      assert.equal(targetDate, "2026-10-19");
    });
  });

  test("under the placeholder switch the write is 403 section_paused, before the body is read", async () => {
    await switchRectification({ status: "placeholder", reason: `paused-${T}` }, ACTOR);
    try {
      const res = await withWechat(() => post({ code: "c-paused", templateId: TEMPLATE }));
      assert.equal(res.statusCode, 403);
      assert.equal(problem(res).code, "section_paused");
      assert.equal(res.headers["cache-control"], "no-store", "a write is never cached");
      assert.equal((await rows(openid("c-paused"))).length, 0);
    } finally {
      await switchRectification({ status: "normal", reason: `back-${T}` }, ACTOR);
    }
  });
}

// ---- The send, the recovery and the cleanup ---------------------------------------------------------

// Issues under past dates no report job writes (catch-up looks back a week), one per test.
let dayN = Math.floor(Math.random() * 300);
const issueDay = () => addDays("2001-01-01", (dayN += 1));
const withItems = (date: string) => ({
  date, lead: { title: `MODEL-HEADLINE-${T}`, leadParagraph: "模型写的导语" }, highlights: [],
  sections: [{ label: "一节", items: [{ itemId: `i-${T}`, title: `MODEL-ITEM-${T}`, summary: "s", sourceName: "src", sourceUrl: "https://example.com" }] }], flashes: [],
});
async function issue(date: string, content: unknown = withItems(date)) {
  const r = await seed.report(content, { key: date });
  planted.push(r.remove);
}
async function plant(name: string, date: string, opts: { createdAt?: Date; status?: "pending" | "sending"; lockedAt?: Date; template?: string } = {}) {
  await sql`INSERT INTO miniprogram_reminders (openid, target_date, template_id, created_at, status, locked_at)
            VALUES (${openid(name)}, ${date}, ${opts.template ?? TEMPLATE}, ${opts.createdAt ?? new Date()}, ${opts.status ?? "pending"}, ${opts.lockedAt ?? null})`;
}
const left = async (...names: string[]) => (await sql<{ openid: string }[]>`SELECT openid FROM miniprogram_reminders WHERE openid IN ${sql(names.map(openid))}`).map((r) => r.openid);

test("before the issue is saved, or before 08:00 on its day, nothing is sent and the rows stay", async () => {
  const day = issueDay();
  await plant("wait-1", day);
  await plant("wait-2", day);
  const before = sends().length;
  const run = await withWechat(() => sendReminders({ date: day }));
  assert.equal(run.sent, 0);
  assert.ok(run.waiting >= 2);
  assert.equal(sends().length, before, "no send");
  assert.deepEqual((await left("wait-1", "wait-2")).length, 2);

  await issue(day);
  const early = await withWechat(() => sendReminders({ date: day, now: new Date(`${day}T07:59:00+08:00`) }));
  assert.equal(early.sent, 0, "the issue's own day, before 08:00");
  assert.equal(sends().length, before);
  assert.equal((await left("wait-1", "wait-2")).length, 2);
  await sql`DELETE FROM miniprogram_reminders WHERE openid IN ${sql([openid("wait-1"), openid("wait-2")])}`;
});

test("once the issue is saved each row is sent once (touser, template_id, page, miniprogram_state, fixed text) and deleted; the run shares one token", async () => {
  const day = issueDay();
  await issue(day);
  await plant("send-1", day);
  await plant("send-2", day, { template: `${TEMPLATE}-older` });
  const before = sends().length;
  const tokens = wechat.tokens;
  const run = await withWechat(() => sendReminders({ date: day }), { WECHAT_MINIPROGRAM_STATE: "trial" });
  assert.equal(run.sent, 2);
  assert.deepEqual([run.failed, run.unknown, run.skipped], [0, 0, 0]);
  assert.equal(wechat.tokens - tokens, 1, "one access token for both sends");
  const sent = sends().slice(before).map((c) => c.body!);
  assert.deepEqual(sent.map((b) => b.touser).sort(), [openid("send-1"), openid("send-2")]);
  assert.deepEqual(sent.map((b) => b.template_id).sort(), [TEMPLATE, `${TEMPLATE}-older`], "the template each reader accepted");
  const [y, m, d] = day.split("-").map(Number);
  for (const b of sent) {
    assert.equal(b.page, `pages/daily-issue/index?board=${BOARD.key}&date=${day}`, "that issue's page");
    assert.equal(b.miniprogram_state, "trial");
    const values = Object.values(b.data as Record<string, { value: string }>).map((v) => v.value);
    assert.deepEqual(values, [siteDaily().slice(0, 20), `${y}年${m}月${d}日`, "今天的日报已出刊，点开查看"], "fixed text");
    assert.ok(!JSON.stringify(b).includes("MODEL-"), "nothing a model wrote");
  }
  assert.deepEqual(await left("send-1", "send-2"), [], "deleted once sent");
  const again = await withWechat(() => sendReminders({ date: day }));
  assert.equal(again.sent, 0);
  assert.equal(sends().length, before + 2, "not sent twice");
});

test("miniprogram_state defaults to formal", async () => {
  const day = issueDay();
  await issue(day);
  await plant("formal", day);
  const before = sends().length;
  await withWechat(() => sendReminders({ date: day }));
  assert.equal(sends()[before]?.body?.miniprogram_state, "formal");
  assert.deepEqual(await left("formal"), []);
});

test("43101 and any other refusal (an error code, an HTTP 4xx): the row is deleted and counted failed", async () => {
  const day = issueDay();
  await issue(day);
  for (const name of ["f-43101", "f-47003", "f-http400"]) await plant(name, day);
  wechat.send = (body) => {
    if (body.touser === openid("f-43101")) return Response.json({ errcode: 43101, errmsg: "user refuse to accept the msg" });
    if (body.touser === openid("f-47003")) return Response.json({ errcode: 47003, errmsg: "argument invalid" });
    return new Response("bad request", { status: 400 });
  };
  try {
    const run = await withWechat(() => sendReminders({ date: day }));
    assert.deepEqual([run.sent, run.failed, run.unknown], [0, 3, 0]);
    assert.equal(run.reasons?.["43101"], 1);
    assert.deepEqual(await left("f-43101", "f-47003", "f-http400"), []);
  } finally {
    wechat.send = () => Response.json({ errcode: 0, errmsg: "ok", msgid: 1 });
  }
});

test("5xx, a timeout and a lost connection: the row is deleted and counted unknown, and another run sends nothing", async () => {
  const day = issueDay();
  await issue(day);
  for (const name of ["u-502", "u-timeout", "u-reset"]) await plant(name, day);
  wechat.send = (body) => {
    if (body.touser === openid("u-502")) return new Response("bad gateway", { status: 502 });
    if (body.touser === openid("u-timeout")) throw timeout();
    throw new TypeError("fetch failed");
  };
  try {
    const before = sends().length;
    const run = await withWechat(() => sendReminders({ date: day }));
    assert.deepEqual([run.sent, run.failed, run.unknown], [0, 0, 3]);
    assert.deepEqual(await left("u-502", "u-timeout", "u-reset"), []);
    await withWechat(() => sendReminders({ date: day }));
    await withWechat(() => sendReminders());
    assert.equal(sends().length, before + 3, "never resent");
  } finally {
    wechat.send = () => Response.json({ errcode: 0, errmsg: "ok", msgid: 1 });
  }
});

test("a row left sending for more than 15 minutes is dropped as unknown by the recovery", async () => {
  const day = issueDay();
  await plant("stale", day, { status: "sending", lockedAt: new Date(Date.now() - 16 * 60_000) });
  await plant("busy", day, { status: "sending", lockedAt: new Date(Date.now() - 5 * 60_000) });
  const recovered = await recoverStaleReminders();
  assert.ok(recovered.unknown >= 1);
  assert.deepEqual(await left("stale", "busy"), [openid("busy")], "one still being sent stays");
  await sql`DELETE FROM miniprogram_reminders WHERE openid = ${openid("busy")}`;
});

test("rows asked for more than 48 hours ago are deleted by the cleanup, sent or not", async () => {
  const day = issueDay();
  await plant("old", day, { createdAt: new Date(Date.now() - 49 * 3600_000) });
  await plant("old-sending", day, { createdAt: new Date(Date.now() - 49 * 3600_000), status: "sending", lockedAt: new Date() });
  await plant("young", day, { createdAt: new Date(Date.now() - 47 * 3600_000) });
  const cleaned = await expireReminders();
  assert.ok(cleaned.expired >= 2);
  assert.deepEqual(await left("old", "old-sending", "young"), [openid("young")]);
  // The sender drops them too.
  await sql`UPDATE miniprogram_reminders SET created_at = now() - interval '49 hours' WHERE openid = ${openid("young")}`;
  const run = await sendReminders({ date: day });
  assert.ok(run.expired >= 1);
  assert.deepEqual(await left("young"), []);
});

test("with the valve off, a saved issue's rows are dropped as skipped and WeChat is not called", async () => {
  const day = issueDay();
  await issue(day);
  await plant("skip-1", day);
  await plant("skip-2", day);
  const before = wechat.calls.length;
  const run = await sendReminders({ date: day });
  assert.equal(run.skipped, 2);
  assert.equal(run.sent, 0);
  assert.equal(wechat.calls.length, before, "no request to WeChat");
  assert.deepEqual(await left("skip-1", "skip-2"), []);
});

test("a refused access token is refreshed once in a run, and only once", async () => {
  const day = issueDay();
  await issue(day);
  for (const name of ["t-1", "t-2", "t-3"]) await plant(name, day);
  let refusals = 0;
  // The first token is refused; after the refresh one send is refused again (no second refresh: that row fails).
  wechat.send = (body, token) => {
    if (token === firstToken || (body.touser === openid("t-2") && refusals === 1)) {
      refusals += 1;
      return Response.json({ errcode: refusals === 1 ? 40001 : 42001, errmsg: "invalid credential" });
    }
    return Response.json({ errcode: 0, errmsg: "ok", msgid: 1 });
  };
  const firstToken = `tok-${wechat.tokens + 1}`;
  const tokenCalls = calls("/cgi-bin/stable_token").length;
  try {
    const run = await withWechat(() => sendReminders({ date: day }));
    assert.deepEqual([run.sent, run.failed, run.unknown], [2, 1, 0]);
    assert.equal(run.reasons?.["token 42001"], 1);
    const asked = calls("/cgi-bin/stable_token").slice(tokenCalls).map((c) => c.body!.force_refresh);
    assert.deepEqual(asked, [false, true], "one normal token, one forced refresh");
    assert.deepEqual(await left("t-1", "t-2", "t-3"), []);
  } finally {
    wechat.send = () => Response.json({ errcode: 0, errmsg: "ok", msgid: 1 });
  }
});

test("an issue without items sends nothing; its rows stay until the 48-hour cleanup", async () => {
  const day = issueDay();
  await issue(day, { date: day, lead: null, highlights: [], sections: [], flashes: [] });
  await plant("empty", day);
  const before = sends().length;
  const run = await withWechat(() => sendReminders({ date: day }));
  assert.equal(run.sent, 0);
  assert.equal(sends().length, before);
  assert.deepEqual(await left("empty"), [openid("empty")]);
  await sql`UPDATE miniprogram_reminders SET created_at = now() - interval '49 hours' WHERE openid = ${openid("empty")}`;
  await expireReminders();
  assert.deepEqual(await left("empty"), []);
});

test("a run that got no reminder out is alerted at once; failed and unknown ones go to the digest; the runs page shows each run's counts", async () => {
  const day = issueDay();
  await issue(day);
  await plant("alert-1", day);
  await plant("alert-2", day);
  wechat.send = () => Response.json({ errcode: 43101, errmsg: "user refuse to accept the msg" });
  try {
    await withWechat(() => recordRun("reminders.send", () => sendReminders({ date: day })));
  } finally {
    wechat.send = () => Response.json({ errcode: 0, errmsg: "ok", msgid: 1 });
  }
  let findings = await collectFindings();
  const failed = findings.find((f) => f.key === "reminders.failed");
  assert.equal(failed?.level, "today", "announced at once");
  assert.match(failed!.detail ?? "", /43101/);
  assert.equal(findings.find((f) => f.key === "reminders.missed")?.level, "digest");
  const overview = await runsOverview();
  assert.ok(overview.reminders.runs.some((r) => r.job === "reminders.send" && r.failed === 2), "the run's counts on the runs page");
  assert.ok(overview.reminders.totals.failed >= 2);

  await plant("alert-3", day);
  await withWechat(() => recordRun("reminders.send", () => sendReminders({ date: day })));
  findings = await collectFindings();
  assert.ok(!findings.some((f) => f.key === "reminders.failed"), "a later run that got one out closes it");
  assert.ok(findings.some((f) => f.key === "reminders.missed"), "the day's failures still go to the digest");
});

test("the daily saved by the 08:00 job and by the hourly catch-up queues that day's send", async () => {
  const scheduled = "2099-11-27";
  const caughtUp = "2099-11-28";
  const jobs = (date: string) => sql<{ state: string }[]>`SELECT state FROM pgboss.job WHERE name = 'notify.reminders' AND data->>'date' = ${date}`;
  await sql`DELETE FROM reports WHERE kind = 'daily' AND key IN ${sql([scheduled, caughtUp])}`;
  await sql`DELETE FROM pgboss.job WHERE name = 'notify.reminders' AND data->>'date' IN ${sql([scheduled, caughtUp])}`;
  const made: string[] = [`daily:${scheduled}`];
  try {
    // reports.daily runs composeDaily for the day; nothing is published in that window, so no model call.
    await composeDaily(scheduled);
    assert.equal((await jobs(scheduled)).length, 1, "queued by the 08:00 job");
    const { generated } = await catchUpReports(new Date(`${caughtUp}T09:00:00+08:00`), 1);
    made.push(...generated);
    assert.ok(generated.includes(`daily:${caughtUp}`), "the catch-up made the missing daily");
    assert.equal((await jobs(caughtUp)).length, 1, "queued by the catch-up");
  } finally {
    for (const m of made) {
      const [kind, key] = m.split(":");
      await sql`DELETE FROM reports WHERE kind = ${kind!} AND key = ${key!}`;
    }
    await sql`DELETE FROM pgboss.job WHERE name = 'notify.reminders' AND data->>'date' IN ${sql([scheduled, caughtUp])}`;
  }
});

// ---- The backup ------------------------------------------------------------------------------------

const exec = promisify(execFile);
const pgDump = await exec("which", ["pg_dump"]).then((r) => r.stdout.trim(), () => "");

test(pgDump ? "the daily backup keeps the reminders table and none of its rows (a real pg_dump, restored)" : "the daily backup is told to skip the reminders table's rows", async () => {
  assert.ok(dumpArgs("x.dump").includes("--exclude-table-data=miniprogram_reminders"));
  if (!pgDump) return;
  await plant("backup", issueDay());
  const [last] = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'backup.last'`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "aihot-reminders-backup-"));
  const restoreDb = `aihot_restore_${T}_test`;
  try {
    // Without an object store the dump is made and checked locally, then the run reports it was not uploaded.
    await assert.rejects(runBackup(), /not uploaded/);
    const dumps = (await readdir(path.join(config.dataDir, "backups"))).filter((f) => f.endsWith(".dump"));
    assert.equal(dumps.length, 1);
    await sql.unsafe(`CREATE DATABASE "${restoreDb}"`);
    const url = new URL(config.databaseUrl);
    url.pathname = `/${restoreDb}`;
    await exec("pg_restore", ["--no-owner", "--table=miniprogram_reminders", `--dbname=${url.href}`, path.join(config.dataDir, "backups", dumps[0]!)]);
    const restored = postgres(url.href, { max: 1, onnotice: () => {} });
    try {
      const [t] = await restored<{ exists: boolean; n: number }[]>`SELECT to_regclass('public.miniprogram_reminders') IS NOT NULL AS exists, (SELECT count(*)::int FROM miniprogram_reminders) AS n`;
      assert.deepEqual({ ...t }, { exists: true, n: 0 }, "the table is there, empty");
    } finally {
      await restored.end();
    }
  } finally {
    await sql.unsafe(`DROP DATABASE IF EXISTS "${restoreDb}"`);
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
    if (last) await sql`UPDATE settings SET value = ${sql.json(last.value as never)} WHERE key = 'backup.last'`;
    else await sql`DELETE FROM settings WHERE key = 'backup.last'`;
    await sql`DELETE FROM miniprogram_reminders WHERE openid = ${openid("backup")}`;
  }
});

// ---- Last ------------------------------------------------------------------------------------------

test("48 hours on, the cleanup has left none of the openids this file planted", async () => {
  await expireReminders(new Date(Date.now() + 49 * 3600_000));
  assert.equal(await minePlanted(), 0);
});
