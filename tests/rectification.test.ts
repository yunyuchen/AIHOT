// The placeholder switch (整改开关) through the backend function the admin calls and the real api
// routes: a switch needs a reason and leaves an audit row; under the placeholder meta still answers with
// the status and the industry pack's text, every other route registered under /api/mp/ and every 5:4
// share image under /og/mp/ (whatever its method, read from Fastify's own route table) answers a cacheable
// 403 section_paused, paths that do not exist stay 404, and the same item stays on the site, v1, RSS, MCP
// and the site's share image. Switching back restores the exit. The file always leaves the switch at
// normal for the other files.
import { tag } from "./setup.ts"; // first: the environment the backend modules read at import
import { seeds } from "./seed.ts";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { loadRectificationSetting, switchRectification } from "@aihot/backend/admin/settings";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { RECTIFICATION_KEY } from "@aihot/backend/publication/miniprogram";
import { MINIPROGRAM_CACHE_CONTROL } from "@aihot/contracts/http-policy";
import { MCP_TOOL_NAMES } from "@aihot/contracts/mcp";
import type { MiniprogramFeed, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import { FEATURES } from "@aihot/industry/features";
import { BOARD } from "@aihot/industry/site";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const SOURCE = `test-rectification-${T}`;
const ACTOR = `test:rectification-${T}`;
const META = "/api/mp/v1/meta";
const FALLBACK = "/api/mp/*";
const SHARE_IMAGES = "/og/mp/";
const seed = seeds(T, SOURCE);
const app = await buildApp();
let item = "";

before(async () => {
  // An interrupted earlier run may have left the switch on.
  if ((await loadRectificationSetting()).status !== "normal") await switchRectification({ status: "normal", reason: "test start" }, ACTOR);
  await seed.source(SOURCE, { name: "Test rectification" });
  item = await seed.selected();
  await sql`UPDATE articles SET processing_state = 'analyzed' WHERE id = ${item}`;
  await seed.publishReleased(item);
});
after(async () => {
  try {
    await switchRectification({ status: "normal", reason: "test end" }, ACTOR);
  } finally {
    await app.close();
    await stopBoss();
    await closeDb();
  }
});

const inject = (method: string, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: method as "GET", url, headers: { host: "localhost", ...headers } });
const get = (url: string, headers: Record<string, string> = {}) => inject("GET", url, headers);
const auditRows = () => sql<{ id: string; actor: string; subject: string; reason: string | null; before: unknown; after: unknown; created_at: Date }[]>`
  SELECT id, actor, subject, reason, before, after, created_at FROM audit_log WHERE actor = ${ACTOR} AND action = 'settings.rectification' ORDER BY id`;

/** Every route in Fastify's own table, read from printRoutes' radix tree (each node's text continues its parent's). */
function registeredRoutes(): Array<{ method: string; url: string }> {
  const routes: Array<{ method: string; url: string }> = [];
  const path: string[] = [];
  for (const line of app.printRoutes().split("\n")) {
    const m = /^((?:│ {3}| {4})*)[├└]── (.+?)(?: \(([A-Z, ]+)\))?$/.exec(line);
    if (!m) continue;
    path.length = m[1]!.length / 4;
    path.push(m[2]!);
    if (m[3]) for (const method of m[3].split(", ")) routes.push({ method, url: path.join("") });
  }
  return routes;
}
/** The routes the switch closes: every one registered under /api/mp/ but meta and the 404 fallback, and every 5:4 share image. */
function closedRoutes() {
  const routes = registeredRoutes();
  assert.ok(routes.some((r) => r.method === "GET" && r.url === META), "the route table was read");
  const closed = routes.filter((r) => (r.url.startsWith("/api/mp/") && r.url !== META && r.url !== FALLBACK) || r.url.startsWith(SHARE_IMAGES));
  assert.ok(closed.some((r) => r.method === "GET" && r.url === "/api/mp/v1/feed"), "the feed is among them");
  assert.ok(closed.some((r) => r.method === "GET" && r.url === "/api/mp/v1/items/:id"), "the item page is among them");
  assert.ok(closed.some((r) => r.method === "GET" && r.url === "/api/mp/v1/stories/:id"), "the story page is among them");
  assert.ok(closed.some((r) => r.method === "GET" && r.url === `${SHARE_IMAGES}items/:file`), "the item's 5:4 share image is among them");
  for (const url of ["/api/mp/v1/dailies/latest", "/api/mp/v1/dailies/:date", `${SHARE_IMAGES}dailies/:file`]) {
    assert.equal(closed.some((r) => r.method === "GET" && r.url === url), FEATURES.reports, `${url} is registered, and closed, where the pack has a daily`);
  }
  return closed;
}
const concrete = (url: string) => url.replace(/:[^/]+/g, "x");

/** Pages through the feed until the item turns up. */
async function feedLists(id: string): Promise<boolean> {
  let cursor: string | null = null;
  for (let page = 0; page < 200; page += 1) {
    const res = await get(`/api/mp/v1/feed?limit=40${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body) as MiniprogramFeed;
    if (body.cards.some((c) => c.id === id)) return true;
    if (!body.page.hasMore) return false;
    cursor = body.page.nextCursor;
  }
  return false;
}

/** The same item on the exits the switch must leave alone: what a reader gets from each. */
async function otherExits(id: string) {
  const mcp = await app.inject({
    method: "POST", url: "/api/mcp",
    headers: { host: "localhost", "content-type": "application/json", accept: "application/json, text/event-stream" },
    payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: MCP_TOOL_NAMES.latest, arguments: { mode: "selected", window: "24h", limit: 30 } } },
  });
  const site = await get(`/api/site/items/${id}`);
  const v1 = await get("/api/v1/items?mode=selected");
  const rss = await get("/feed.xml");
  const og = await get(`/og/items/${id}.png`);
  return { site, v1, rss, og, mcp };
}

let normalMetaEtag = "";
let normalExits: Awaited<ReturnType<typeof otherExits>> | null = null;

test("before any switch: the exit is normal and lists the item", async () => {
  const meta = await get(META);
  assert.equal(meta.statusCode, 200);
  assert.equal((JSON.parse(meta.body) as MiniprogramMeta).status, "normal");
  normalMetaEtag = meta.headers.etag as string;
  assert.ok(await feedLists(item), "the feed lists the item");
  assert.equal((await get(`/api/mp/v1/items/${item}`)).statusCode, 200, "and has its item page");
  assert.equal((await get(`/og/mp/items/${item}.png`)).statusCode, 200, "and its 5:4 share image");
  normalExits = await otherExits(item);
});

test("a switch needs a reason and a known status; a refused one changes nothing", async () => {
  const rows = (await auditRows()).length;
  for (const reason of ["", "   ", undefined as unknown as string]) {
    await assert.rejects(switchRectification({ status: "placeholder", reason }, ACTOR), (e: Error & { statusCode?: number }) => e.statusCode === 400, `reason ${JSON.stringify(reason)}`);
  }
  for (const status of ["", "on", "closed", "PLACEHOLDER"]) {
    await assert.rejects(switchRectification({ status, reason: "test" }, ACTOR), (e: Error & { statusCode?: number }) => e.statusCode === 400, `status ${status}`);
  }
  assert.equal((await auditRows()).length, rows, "nothing audited");
  assert.equal((await loadRectificationSetting()).status, "normal");
  assert.equal((await get("/api/mp/v1/feed")).statusCode, 200);
});

test("switching to the placeholder is stored and audited: who, when, why, and the status before and after", async () => {
  const before = Date.now();
  const reason = `  REASON-${T}  `;
  const switched = await switchRectification({ status: "placeholder", reason }, ACTOR);
  assert.equal(switched.status, "placeholder");
  assert.equal(switched.reason, `REASON-${T}`);
  assert.equal(switched.changedBy, ACTOR);
  assert.ok(Date.parse(switched.changedAt!) >= before - 1000);
  assert.deepEqual(await loadRectificationSetting(), switched, "the admin reads what was stored");
  const [row] = await sql<{ updated_by: string }[]>`SELECT updated_by FROM settings WHERE key = ${RECTIFICATION_KEY}`;
  assert.equal(row!.updated_by, ACTOR);

  const audit = (await auditRows()).at(-1)!;
  assert.equal(audit.actor, ACTOR);
  assert.equal(audit.subject, `settings:${RECTIFICATION_KEY}`);
  assert.equal(audit.reason, `REASON-${T}`);
  assert.deepEqual(audit.before, { status: "normal" });
  assert.deepEqual(audit.after, { status: "placeholder" });
  assert.ok(audit.created_at.getTime() >= before - 1000 && audit.created_at.getTime() <= Date.now() + 1000, "when");
});

test("under the placeholder meta answers 200 with the status and the industry pack's placeholder text", async () => {
  const res = await get(META);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as MiniprogramMeta;
  assert.equal(body.status, "placeholder");
  assert.deepEqual(body.placeholder, BOARD.placeholder, "the pack's text; null leaves the mini program's built-in one");
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.meta);
  assert.ok(res.headers.etag && res.headers.etag !== normalMetaEtag, "a new ETag, so no cache answers 304 with the normal meta");
  assert.equal((await get(META, { "if-none-match": normalMetaEtag })).statusCode, 200);
});

test("under the placeholder every other registered /api/mp route and every 5:4 share image, any method, is a 403 section_paused, cacheable for a read", async () => {
  const closed = closedRoutes();
  for (const { method, url } of closed) {
    const path = concrete(url);
    const what = `${method} ${path}`;
    const res = await inject(method, path);
    assert.equal(res.statusCode, 403, what);
    if (method !== "GET" && method !== "HEAD") {
      // A write (a reminder) is never cached, so it carries no ETag either.
      assert.equal(res.headers["cache-control"], "no-store", what);
      assert.equal(res.headers.etag, undefined, what);
      assert.equal(JSON.parse(res.body).code, "section_paused", what);
      continue;
    }
    assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.paused, what);
    assert.equal(res.headers["cache-control"], "public, max-age=60, s-maxage=60", what);
    assert.ok(res.headers["x-accel-expires"], what);
    const etag = res.headers.etag as string;
    assert.ok(etag, what);
    if (method !== "HEAD") {
      assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, what);
      const problem = JSON.parse(res.body);
      assert.equal(problem.status, 403, what);
      assert.equal(problem.code, "section_paused", what);
      assert.equal(problem.requestId, res.headers["x-request-id"], what);
    }
    const again = await inject(method, path, { "if-none-match": etag });
    assert.equal(again.statusCode, 304, what);
    assert.equal(again.body, "", what);
    assert.equal(again.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.paused, what);
  }
  // The switch comes before the query: a request that would be a 400 is closed all the same.
  for (const url of ["/api/mp/v1/feed?x=1", "/api/mp/v1/feed?limit=0", "/api/mp/v1/feed?cursor=nonsense"]) {
    const res = await get(url);
    assert.equal(res.statusCode, 403, url);
    assert.equal(JSON.parse(res.body).code, "section_paused", url);
  }
});

test("under the placeholder a path or method nobody registered is still 404", async () => {
  const closed = closedRoutes();
  const registered = (method: string, path: string) =>
    closed.some((r) => r.method === method && new RegExp(`^${r.url.replace(/:[^/]+/g, "[^/]+")}$`).test(path));
  const candidates: Array<[string, string]> = [
    ["GET", "/api/mp/v1/nope"], ["GET", "/api/mp/v2/feed"], ["GET", "/api/mp"], ["GET", "/api/mp/v1/feed/"],
    ["POST", "/api/mp/v1/meta"], ["POST", "/api/mp/v1/feed"], ["DELETE", "/api/mp/v1/feed"],
    // Registered only where the industry pack turns the daily column on.
    ["GET", "/api/mp/v1/dailies/latest"], ["GET", "/api/mp/v1/dailies/2099-12-31"], ["POST", "/api/mp/v1/reminders"],
  ];
  const missing = candidates.filter(([method, path]) => !registered(method, path));
  assert.ok(missing.length >= 7, "most candidates are missing under any pack");
  for (const [method, path] of missing) {
    const res = await inject(method, path);
    const what = `${method} ${path}`;
    assert.equal(res.statusCode, 404, what);
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, what);
    assert.equal(JSON.parse(res.body).code, "not_found", what);
    assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound, what);
  }
  // Beside the share images, an address nobody registered falls to the site's plain 404.
  for (const path of ["/og/mp/nope.png", "/og/mp/stories/x.png", ...(FEATURES.reports ? [] : ["/og/mp/dailies/2099-12-31.png"])]) {
    assert.ok(!registered("GET", path), path);
    assert.equal((await get(path)).statusCode, 404, path);
  }
});

test("under the placeholder the item page and its 5:4 share image are closed for an item that has them, not only for a made-up id", async () => {
  for (const url of [`/api/mp/v1/items/${item}`, `/og/mp/items/${item}.png`]) {
    const res = await get(url);
    assert.equal(res.statusCode, 403, url);
    assert.equal(JSON.parse(res.body).code, "section_paused", url);
  }
});

test("under the placeholder the same item stays on the site, v1, RSS, MCP and the share image", async () => {
  assert.ok(normalExits, "measured before the switch");
  const now = await otherExits(item);
  for (const key of ["site", "v1", "rss", "og", "mcp"] as const) {
    assert.equal(now[key].statusCode, 200, key);
    assert.equal(now[key].statusCode, normalExits[key].statusCode, key);
    assert.notEqual(now[key].statusCode, 403, key);
  }
  assert.deepEqual(JSON.parse(now.site.body), JSON.parse(normalExits.site.body), "the item page is unchanged");
  assert.ok(now.v1.body.includes(item), "v1 lists the item");
  assert.ok(now.rss.body.includes(item), "RSS lists the item");
  assert.ok(now.mcp.body.includes(item), "MCP lists the item");
  assert.match(String(now.og.headers["content-type"]), /^image\/png/);
  assert.equal(now.og.headers.etag, normalExits.og.headers.etag, "the same share image");
});

test("switching back to normal restores the feed and meta, and is audited", async () => {
  const paused = await get("/api/mp/v1/feed");
  assert.equal(paused.statusCode, 403);
  await switchRectification({ status: "normal", reason: `BACK-${T}` }, ACTOR);
  const audit = (await auditRows()).at(-1)!;
  assert.equal(audit.reason, `BACK-${T}`);
  assert.deepEqual(audit.before, { status: "placeholder" });
  assert.deepEqual(audit.after, { status: "normal" });

  const meta = JSON.parse((await get(META)).body) as MiniprogramMeta;
  assert.equal(meta.status, "normal");
  const res = await get("/api/mp/v1/feed", { "if-none-match": paused.headers.etag as string });
  assert.equal(res.statusCode, 200, "the paused ETag no longer matches");
  assert.ok(await feedLists(item), "the feed lists the item again");
  assert.equal((await get(`/api/mp/v1/items/${item}`)).statusCode, 200, "the item page is back");
  assert.equal((await get(`/og/mp/items/${item}.png`)).statusCode, 200, "and its 5:4 share image");
  for (const { method, url } of closedRoutes()) assert.notEqual((await inject(method, concrete(url))).statusCode, 403, `${method} ${url}`);
});

test("a switch stored by another process applies here within five seconds, without a restart", async () => {
  assert.equal((await get("/api/mp/v1/feed")).statusCode, 200); // this process now holds "normal"
  const value = { status: "placeholder", reason: `ELSEWHERE-${T}`, changedBy: ACTOR, changedAt: new Date().toISOString() };
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${RECTIFICATION_KEY}, ${sql.json(value)}, ${ACTOR})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
  const started = Date.now();
  let status = 200;
  while (status !== 403 && Date.now() - started < 7000) {
    status = (await get("/api/mp/v1/feed")).statusCode;
    if (status !== 403) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(status, 403, "the placeholder took effect");
  assert.ok(Date.now() - started <= 5800, `took ${Date.now() - started} ms (five seconds of process cache, plus polling)`);
  await switchRectification({ status: "normal", reason: "test" }, ACTOR);
  assert.equal((await get("/api/mp/v1/feed")).statusCode, 200);
});
