// Collection picks up where it stopped: an X search longer than one run continues in later runs until
// it meets the old watermark (no post in between is skipped, no page is bought twice), and a WeChat body
// that failed for a passing reason is fetched again on the next check. A new source's backlog stays
// bounded by its first import on the runs after it, and a list's User-Agent fetches its article bodies
// too. And the pace a site that refuses bursts sets: a fetch minute the scheduler keeps, an interval
// floor the daily adaptation keeps.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, before, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { extractArticleBody } from "@aihot/backend/content/extract";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { adaptIntervals, collectSource, fetchWindowOpens, scheduleDueSources } from "@aihot/backend/sources/collect";
import { checkMpAccount } from "@aihot/backend/sources/mp";

const T = tag();
const X_SOURCE = `test-x-${T}`;
const MP_SOURCE = `test-mp-${T}`;
const WEB_SOURCE = `test-web-${T}`;
const DAY = 86_400_000;

// A new source's list: two posts from the last half hour, one from 20 hours ago, two from days ago; once
// the source is imported, a post newer than the import joins them.
const LISTED_AT = Date.now();
let laterPost: number | null = null;
const listing = http.createServer((req, res) => {
  if (req.url?.startsWith("/browser-only/")) {
    // An article page of a site that answers only a browser (kepuchina.cn sends a crawler 502).
    const browser = /Chrome\//.test(req.headers["user-agent"] ?? "");
    res.writeHead(browser ? 200 : 502, { "content-type": "text/html; charset=utf-8" });
    res.end(browser ? `<html><body><article><h1>午睡多久合适</h1>${"<p>午睡二十到三十分钟最合适，时间太长反而容易醒后昏沉，影响下午的工作和夜里的睡眠。</p>".repeat(8)}</article></body></html>` : "502 Bad Gateway");
    return;
  }
  const posts: Array<[string, number]> = [
    ...(laterPost ? [["later", laterPost] as [string, number]] : []),
    ["a", LISTED_AT - 10 * 60_000], ["b", LISTED_AT - 20 * 60_000], ["yesterday", LISTED_AT - 20 * 3_600_000], ["old1", LISTED_AT - 3 * DAY], ["old2", LISTED_AT - 5 * DAY],
  ];
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<ul>${posts.map(([slug, at]) => `<li><a href="/post/${slug}-${T}">Post ${slug} ${T}</a><time datetime="${new Date(at).toISOString()}"></time></li>`).join("")}</ul>`);
});
await new Promise<void>((resolve) => listing.listen(0, "127.0.0.1", () => resolve()));
const listingSite = `http://127.0.0.1:${(listing.address() as { port: number }).port}`;

// SocialData: 450 posts newer than the watermark, newest first, 20 a page; `cursor` is the page number.
const BASE = BigInt(Date.now()) * 1000n;
const WATERMARK = BASE + 100n;
const POSTS = Array.from({ length: 450 }, (_, i) => BASE + 550n - BigInt(i));
const tweet = (id: bigint) => ({
  id_str: String(id), tweet_created_at: new Date(Date.now() - Number(BASE + 550n - id) * 60_000).toISOString(),
  full_text: `Post ${id} ${T}`, lang: "en", user: { name: "Test account", screen_name: `acct${T}` },
});
const socialdata = await stub((_hit, req) => {
  const u = new URL(req.url, "http://stub");
  const since = BigInt(/since_id:(\d+)/.exec(u.searchParams.get("query") ?? "")?.[1] ?? "0");
  const page = Number(u.searchParams.get("cursor") ?? 0);
  const ids = POSTS.filter((id) => id > since);
  return { tweets: ids.slice(page * 20, page * 20 + 20).map(tweet), next_cursor: (page + 1) * 20 < ids.length ? String(page + 1) : null };
});

// Dajiala: one new post whose body answers 503 the first time.
const MP_URL = `https://mp.weixin.qq.com/s/test-${T}`;
let bodyCalls = 0;
const dajiala = await stub((_hit, req) => {
  if (req.url.startsWith("/fbmain/monitor/v3/post_history")) {
    return { code: 0, data: [{ position: 1, url: MP_URL, title: `公众号文章 ${T}`, post_time: Math.floor(Date.now() / 1000) - 3600, digest: "摘要", sn: `sn-${T}` }], remain_money: 100 };
  }
  bodyCalls += 1;
  if (bodyCalls === 1) return new Reply(503, { error: "busy" });
  return { code: 0, title: `公众号文章 ${T}`, content: `<p>正文第一段 ${T}</p><p>正文第二段</p>`, author: "作者", desc: "描述" };
});

process.env.SOCIALDATA_BASE_URL = socialdata.url;
process.env.SOCIALDATA_API_KEY = "test-key";
process.env.DAJIALA_BASE_URL = dajiala.url;
process.env.DAJIALA_KEY = "test-key";
config.allowPrivateNetworkFetch = true;

let savedBudgets: Array<{ service: string; per_minute: number; per_hour: number; per_day: number }> = [];
before(async () => {
  savedBudgets = await sql`SELECT service, per_minute, per_hour, per_day FROM budgets WHERE service IN ('socialdata', 'dajiala')`;
  await sql`UPDATE budgets SET per_minute = 1000, per_hour = 10000, per_day = 100000 WHERE service IN ('socialdata', 'dajiala')`;
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, cursor, next_fetch_at)
            VALUES (${X_SOURCE}, 'Test X', 'x_search', ${sql.json({ query: `from:acct${T}` })}, 'T1', 'editorial',
                    ${sql.json({ initializedAt: new Date().toISOString(), lastTweetId: String(WATERMARK) })}, '2100-01-01'),
                   (${MP_SOURCE}, 'Test mp', 'mp_account', ${sql.json({ ghid: `gh_${T}` })}, 'T1', 'editorial',
                    ${sql.json({ lastCheckedAt: new Date().toISOString() })}, '2100-01-01')`;
});
after(async () => {
  for (const b of savedBudgets) await sql`UPDATE budgets SET per_minute = ${b.per_minute}, per_hour = ${b.per_hour}, per_day = ${b.per_day} WHERE service = ${b.service}`;
  await socialdata.close();
  await dajiala.close();
  await new Promise<void>((resolve) => listing.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

test("an X search longer than one run is read to the old watermark over the next runs", async () => {
  const stored = async () => Number((await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM articles WHERE source_id = ${X_SOURCE}`)[0]!.n);
  const cursor = async () => (await sql<{ cursor: { lastTweetId: string; xBacklog?: unknown[] } }[]>`SELECT cursor FROM sources WHERE id = ${X_SOURCE}`)[0]!.cursor;

  const first = await collectSource(X_SOURCE, { force: true });
  assert.equal(first.status, "ok");
  assert.equal(await stored(), 400, "a run reads its own pages and ten more of the stretch left over");
  assert.equal((await cursor()).lastTweetId, String(BASE + 550n), "the watermark moves to the newest post");
  assert.equal((await cursor()).xBacklog?.length, 1, "the unread stretch is kept for the next run");
  const [run] = await sql<{ detail: { truncated: boolean; backlog: number } }[]>`SELECT detail FROM fetch_runs WHERE source_id = ${X_SOURCE} ORDER BY id DESC LIMIT 1`;
  assert.deepEqual([run!.detail.truncated, run!.detail.backlog], [true, 1], "the admin sees the stretch still to read");

  const second = await collectSource(X_SOURCE, { force: true });
  assert.equal(second.status, "ok");
  assert.equal(await stored(), 450, "every post between the old watermark and the newest is stored");
  assert.equal((await cursor()).xBacklog, undefined, "nothing is left to read");
  assert.equal(socialdata.hits(), 20 + 1 + 3, "no page is requested twice");
});

test("a WeChat body that failed for a passing reason is fetched on the next check and analysed again", async () => {
  const article = async () =>
    (await sql<{ body_status: string; revision: number; retry: { attempts: number } | null }[]>`
      SELECT body_status, revision, raw->'dajiala'->'bodyRetry' AS retry FROM articles WHERE source_id = ${MP_SOURCE}`)[0]!;

  const first = await checkMpAccount(MP_SOURCE, "manual");
  assert.equal(first.status, "ok");
  assert.deepEqual({ ...(await article()) }, { body_status: "none", revision: 1, retry: { attempts: 1, error: "dajiala HTTP 503" } });

  const second = await checkMpAccount(MP_SOURCE, "manual");
  assert.equal(second.status, "ok");
  assert.equal(bodyCalls, 2, "the body is asked for once more");
  const now = await article();
  assert.deepEqual([now.body_status, now.revision, now.retry], ["ok", 2, null], "the body arrives as a new revision and retrying stops");
  const [queued] = await sql<{ processing_state: string }[]>`SELECT processing_state FROM articles WHERE source_id = ${MP_SOURCE}`;
  assert.equal(queued!.processing_state, "new", "the article goes back to analysis");

  await checkMpAccount(MP_SOURCE, "manual");
  assert.equal(bodyCalls, 2, "a body already stored is not bought again");
});

test("a new source's backlog stays bounded after its first import: older entries stay out, yesterday's is archived by its own time", async () => {
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, next_fetch_at)
            VALUES (${WEB_SOURCE}, 'Test list', 'web_list',
                    ${sql.json({ url: `${listingSite}/news`, itemSelector: "li", linkSelector: "a", publishedAtSelector: "time", _aihot: { initialBackfillLimit: 2 } })},
                    'T2', 'editorial', '2100-01-01')`;
  const stored = async () =>
    new Map((await sql<{ url: string; backfill: boolean; backfill_reason: string | null; published_at: Date; timeline_at: Date }[]>`
      SELECT url, backfill, backfill_reason, published_at, timeline_at FROM articles WHERE source_id = ${WEB_SOURCE}`).map((r) => [r.url.replace(`${listingSite}/post/`, "").replace(`-${T}`, ""), r]));

  const first = await collectSource(WEB_SOURCE, { force: true });
  assert.deepEqual([first.status, [...(await stored()).keys()].sort()], ["ok", ["a", "b"]], "the first import takes its limit, newest first");

  laterPost = Date.now() + 60_000;
  const second = await collectSource(WEB_SOURCE, { force: true });
  assert.equal(second.status, "ok");
  const rows = await stored();
  assert.deepEqual([...rows.keys()].sort(), ["a", "b", "later", "yesterday"], "entries dated days before the import are not brought in afterwards");
  const yesterday = rows.get("yesterday")!;
  assert.deepEqual([yesterday.backfill, yesterday.backfill_reason], [true, "first-import"], "what the import left from the last day is backlog all the same");
  assert.equal(yesterday.timeline_at.getTime(), yesterday.published_at.getTime(), "archived by its own time: yesterday's post is not today's news");
  assert.equal(rows.get("later")!.backfill, false, "a post newer than the import is news");
});

test("a list's User-Agent also fetches its article bodies", async () => {
  const [withUa, without] = [`test-ua-${T}`, `test-noua-${T}`];
  const listConfig = (headers?: Record<string, string>) => sql.json({ url: `${listingSite}/news`, ...(headers ? { headers } : {}) });
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, next_fetch_at)
            VALUES (${withUa}, 'Browser only', 'web_list', ${listConfig({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" })}, 'T2', 'editorial', '2100-01-01'),
                   (${without}, 'Crawler UA', 'web_list', ${listConfig()}, 'T2', 'editorial', '2100-01-01')`;
  const article = async (sourceId: string) =>
    (await upsertMaterial({ sourceId, url: `${listingSite}/browser-only/${sourceId}`, title: `午睡多久合适 ${sourceId}`, via: "fetch", publishedAt: new Date() })).articleId;
  assert.equal(await extractArticleBody(await article(withUa), false), "ok");
  assert.equal(await extractArticleBody(await article(without), false), "unconfirmed", "the crawler's own User-Agent is refused");
});

test("a source with a fetch minute is fetched only in its window", async () => {
  const at = new Date("2026-10-17T10:07:30Z");
  assert.equal(fetchWindowOpens({ _aihot: { fetchMinute: 5 } }, at), null, "two minutes into its window");
  assert.equal(fetchWindowOpens({ _aihot: { fetchMinute: 0 } }, at), null, "seven minutes in");
  assert.equal(fetchWindowOpens({ _aihot: { fetchMinute: 25 } }, at)?.toISOString(), "2026-10-17T10:25:00.000Z");
  assert.equal(fetchWindowOpens({ _aihot: { fetchMinute: 55 } }, at)?.toISOString(), "2026-10-17T10:55:00.000Z");
  assert.equal(fetchWindowOpens({ _aihot: { fetchMinute: 45 } }, new Date("2026-10-17T10:58:00Z"))?.toISOString(), "2026-10-17T11:45:00.000Z");
  assert.equal(fetchWindowOpens({}, at), null, "a source without one is fetched whenever due");

  // Two columns of one site due at once, as after a seed: the one whose window is open goes, the other waits for its own.
  const minute = new Date().getUTCMinutes();
  const [open, later] = [`test-slot-open-${T}`, `test-slot-later-${T}`];
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, next_fetch_at)
            VALUES (${open}, 'Slot open', 'web_list', ${sql.json({ url: "https://example.org/a", _aihot: { fetchMinute: minute } })}, 'T1', 'editorial', now() - interval '1 minute'),
                   (${later}, 'Slot later', 'web_list', ${sql.json({ url: "https://example.org/b", _aihot: { fetchMinute: (minute + 30) % 60 } })}, 'T1', 'editorial', now() - interval '1 minute')`;
  await scheduleDueSources(1000);
  const jobs = await sql<{ id: string }[]>`
    SELECT data->>'sourceId' AS id FROM pgboss.job WHERE name = 'sources.fetch' AND created_on > now() - interval '1 minute' AND data->>'sourceId' IN ${sql([open, later])}`;
  assert.deepEqual(jobs.map((j) => j.id), [open]);
  const [waiting] = await sql<{ next_fetch_at: Date }[]>`SELECT next_fetch_at FROM sources WHERE id = ${later}`;
  assert.equal(waiting!.next_fetch_at.getUTCMinutes(), (minute + 30) % 60, "it is due when its window opens");
  assert.ok(waiting!.next_fetch_at.getTime() > Date.now() + 15 * 60_000);
});

test("the daily adaptation never sets an interval below the source's floor", async () => {
  const [quiet, busy, busyNoFloor] = [`test-floor-quiet-${T}`, `test-floor-busy-${T}`, `test-nofloor-busy-${T}`];
  await sql`INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, next_fetch_at)
            VALUES (${quiet}, 'Quiet', 'web_list', ${sql.json({ url: "https://example.org/q", _aihot: { minIntervalMinutes: 90 } })}, 'T1', 'editorial', 30, '2100-01-01'),
                   (${busy}, 'Busy', 'web_list', ${sql.json({ url: "https://example.org/b", _aihot: { minIntervalMinutes: 60 } })}, 'T1', 'editorial', 30, '2100-01-01'),
                   (${busyNoFloor}, 'Busy without floor', 'web_list', ${sql.json({ url: "https://example.org/n" })}, 'T1', 'editorial', 30, '2100-01-01')`;
  // Ten posts a day over the week: left to itself, a list that busy is looked at every 48 minutes.
  for (const id of [busy, busyNoFloor]) {
    for (let i = 0; i < 70; i++) await upsertMaterial({ sourceId: id, url: `https://example.org/${id}/${i}`, title: `Post ${i} ${id}`, via: "fetch", publishedAt: new Date() });
  }
  await adaptIntervals();
  const intervals = new Map((await sql<{ id: string; interval_minutes: number }[]>`
    SELECT id, interval_minutes FROM sources WHERE id IN ${sql([quiet, busy, busyNoFloor])}`).map((r) => [r.id, r.interval_minutes]));
  assert.deepEqual([intervals.get(busyNoFloor), intervals.get(busy), intervals.get(quiet)], [48, 60, 90]);
});
