// The mini program exit (/api/mp/v1) through the real api routes: the board's meta comes from the
// industry pack, its readings count the Beijing calendar day from the read layer, the feed folds the
// selected set into the home timeline's reading groups behind the release gate, and the conventions
// every operation follows hold: strict queries, cache headers with ETag / 304, a cacheable Problem 404
// for anything else under /api/mp, and responses carrying exactly the contract's fields. The 5:4 share
// images the item page and the daily point to are 1000×800 PNGs under the same rules.
import { tag } from "./setup.ts"; // first: the environment the backend modules read at import
import { DEFAULT_CATEGORY, seeds, type SeedAnalysisOptions, type SeedArticleOptions, type StoryOrigin, type TranslationOrigin } from "./seed.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { overrideFields, setVisibility } from "@aihot/backend/admin/content";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { RICH_TEXT_NOTE, RICH_TEXT_TAGS } from "@aihot/backend/content/rich-text";
import { verifyProxyRequest } from "@aihot/backend/media/imgproxy";
import { loadMiniprogramFeed } from "@aihot/backend/publication/miniprogram";
import { MINIPROGRAM_CACHE_CONTROL } from "@aihot/contracts/http-policy";
import type {
  MiniprogramCard, MiniprogramDaily, MiniprogramDailyEntry, MiniprogramFeed, MiniprogramFocus, MiniprogramHotline, MiniprogramItem, MiniprogramMeta,
  MiniprogramPlaceholder, MiniprogramStory,
} from "@aihot/contracts/miniprogram";
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { FEATURES } from "@aihot/industry/features";
import { BOARD, SITE, siteDaily } from "@aihot/industry/site";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { buildApp } from "../apps/api/src/app.ts";
import { AI_LABEL_KEYWORD } from "../apps/api/src/og/miniprogram.ts";

const T = tag();
const SOURCE = `test-miniprogram-${T}`;
const seed = seeds(T, SOURCE);
const app = await buildApp();

before(async () => {
  await seed.source(SOURCE, { name: "Test miniprogram" });
});
after(async () => {
  await app.close();
  await stopBoss();
  await closeDb();
});

const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: "GET", url, headers });
async function meta(): Promise<MiniprogramMeta> {
  const res = await get("/api/mp/v1/meta");
  assert.equal(res.statusCode, 200);
  return JSON.parse(res.body) as MiniprogramMeta;
}

interface SelectedOptions {
  beforePublish?: (id: string) => Promise<void>;
  releasedAt?: Date;
  sourceId?: string;
  /** Defaults to the first sighting; null for a source that gave no time. */
  publishedAt?: Date | null;
  analysis?: SeedAnalysisOptions;
  /** The material's language, body and the like. */
  article?: Omit<SeedArticleOptions, "sourceId" | "discoveredAt" | "publishedAt">;
}

/**
 * A selected article first seen (and so anchored) at `at`, released a minute ago unless `releasedAt` says
 * otherwise. It counts as analysed, so an old first sighting never looks like stuck work to the ops alerts.
 */
async function selectedAt(at: number, opts: SelectedOptions = {}): Promise<string> {
  const id = await seed.selected({
    ...opts.article,
    discoveredAt: new Date(at), publishedAt: opts.publishedAt === undefined ? new Date(at) : opts.publishedAt, sourceId: opts.sourceId, analysis: opts.analysis,
  });
  await sql`UPDATE articles SET processing_state = 'analyzed' WHERE id = ${id}`;
  await opts.beforePublish?.(id); // story membership is read when the item is published
  await seed.publishReleased(id, opts.releasedAt ? { releasedAt: opts.releasedAt } : {});
  return id;
}

// The contract's field sets; each literal is compile-checked against the type, missing or extra keys alike.
const META_FIELDS: Record<keyof MiniprogramMeta, true> = {
  schemaVersion: true, board: true, status: true, placeholder: true, columns: true, categories: true, notice: true, readings: true, generatedAt: true,
};
const BOARD_FIELDS: Record<keyof MiniprogramMeta["board"], true> = { key: true, name: true, siteName: true, description: true };
const PLACEHOLDER_FIELDS: Record<keyof MiniprogramPlaceholder, true> = { title: true, body: true };
const COLUMN_FIELDS: Record<keyof MiniprogramMeta["columns"], true> = { feed: true, stories: true, daily: true };
const CATEGORY_FIELDS: Record<keyof MiniprogramMeta["categories"][number], true> = { key: true, label: true };
const NOTICE_FIELDS: Record<keyof MiniprogramMeta["notice"], true> = { footer: true, hotline: true };
const HOTLINE_FIELDS: Record<keyof MiniprogramHotline, true> = { label: true, number: true, categories: true };
const READING_FIELDS: Record<keyof MiniprogramMeta["readings"], true> = { date: true, cards: true, stories: true, sources: true, times: true, updatedAt: true };
const sameFields = (value: object, fields: object, what: string) => assert.deepEqual(Object.keys(value).sort(), Object.keys(fields).sort(), what);

/** A PNG's size, from its IHDR chunk. */
function pngSize(png: Buffer) {
  assert.equal(png.subarray(1, 4).toString("latin1"), "PNG", "a PNG");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}
/** A PNG's text chunks (tEXt, and iTXt left uncompressed), keyword to text. */
function pngText(png: Buffer): Record<string, string> {
  const texts: Record<string, string> = {};
  for (let at = 8; at < png.length; at += 12 + png.readUInt32BE(at)) {
    const type = png.subarray(at + 4, at + 8).toString("latin1");
    const data = png.subarray(at + 8, at + 8 + png.readUInt32BE(at));
    const end = data.indexOf(0);
    const keyword = data.subarray(0, end).toString("latin1");
    if (type === "tEXt") texts[keyword] = data.subarray(end + 1).toString("latin1");
    if (type === "iTXt" && data[end + 1] === 0) {
      // Then the compression flag and method, the language tag and the translated keyword, each ending in a zero byte but the flags.
      const language = data.indexOf(0, end + 3);
      texts[keyword] = data.subarray(data.indexOf(0, language + 1) + 1).toString("utf8");
    }
  }
  return texts;
}
/** Asserts a 5:4 share image: a 1000×800 PNG for ten minutes, with an ETag answering 304; returns the response. */
async function expectShareImage(url: string) {
  const res = await get(url, { cookie: `session=${T}` });
  assert.equal(res.statusCode, 200, `${url}: ${res.body.slice(0, 200)}`);
  assert.match(String(res.headers["content-type"]), /^image\/png/, url);
  assert.deepEqual(pngSize(res.rawPayload), { width: 1000, height: 800 }, `${url}: 5:4`);
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.shareImage, url);
  const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
  assert.ok(Math.abs(deadline - (Date.now() / 1000 + 600)) <= 5, `${url}: X-Accel-Expires ${res.headers["x-accel-expires"]}`);
  assert.equal(res.headers["set-cookie"], undefined, url);
  const etag = res.headers.etag as string;
  assert.ok(etag, url);
  const again = await get(url, { "if-none-match": etag });
  assert.equal(again.statusCode, 304, url);
  assert.equal(again.body, "", url);
  assert.equal(again.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.shareImage, url);
  assert.equal(again.headers.etag, etag, url);
  return res;
}
/** Asserts the cacheable Problem 404 a share image answers when there is none. */
async function expectNoShareImage(url: string) {
  const res = await get(url);
  assert.equal(res.statusCode, 404, url);
  assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, url);
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound, url);
  assert.equal(JSON.parse(res.body).code, "not_found", url);
  assert.equal((await get(url, { "if-none-match": res.headers.etag as string })).statusCode, 304, url);
}

test("meta describes the board the industry pack declares", async () => {
  const body = await meta();
  assert.equal(body.schemaVersion, 1);
  assert.deepEqual(body.board, { key: BOARD.key, name: BOARD.name, siteName: SITE.name, description: BOARD.description });
  assert.equal(body.status, "normal");
  assert.deepEqual(body.placeholder, BOARD.placeholder);
  assert.deepEqual(body.columns, { feed: true, stories: true, daily: FEATURES.reports });
  assert.deepEqual(body.categories, CATEGORIES.map((c) => ({ key: c.key, label: c.label })), "the pack's categories: keys, labels and order");
  // The footer and the hotline (its text, number and categories) are the pack's, verbatim: a pack without them (manufacturing)
  // answers null for both, and the mini program shows neither.
  assert.deepEqual(body.notice, BOARD.notice);
  // Compared as plain strings: with a pack selected, the key's type is that pack's literal and tsc would reject the comparison.
  const packKey: string = body.board.key;
  if (packKey === "manufacturing") assert.deepEqual(body.notice, { footer: null, hotline: null }, "manufacturing has no footer and no hotline");
  // The mini program matches cards and item pages to the hotline by category key, so they must be this pack's own keys.
  for (const key of body.notice.hotline?.categories ?? []) {
    assert.ok(CATEGORIES.some((c) => c.key === key), `the hotline's category ${key} is one of the pack's categories`);
  }
  assert.equal(body.readings.date, beijingDate(body.generatedAt));
});

test("meta carries exactly the contract's fields", async () => {
  const body = await meta();
  sameFields(body, META_FIELDS, "meta");
  sameFields(body.board, BOARD_FIELDS, "board");
  if (body.placeholder) sameFields(body.placeholder, PLACEHOLDER_FIELDS, "placeholder");
  sameFields(body.columns, COLUMN_FIELDS, "columns");
  for (const category of body.categories) sameFields(category, CATEGORY_FIELDS, "category");
  sameFields(body.notice, NOTICE_FIELDS, "notice");
  if (body.notice.hotline) sameFields(body.notice.hotline, HOTLINE_FIELDS, "hotline");
  sameFields(body.readings, READING_FIELDS, "readings");
  assert.ok(Array.isArray(body.readings.times) && body.readings.times.every((t) => typeof t === "string"));
});

test("readings count today's reading groups by the Beijing calendar day", async () => {
  const before = await meta();
  const now = Date.now();
  const midnight = beijingMidnight(beijingDate(now)).getTime();
  const today = (share: number) => midnight + Math.floor((now - midnight) * share); // never before midnight, never ahead of now

  const yesterday = await selectedAt(midnight - 3600_000);
  // Two selected items of one story: one card, anchored at the later one, and one story.
  const story = await seed.story();
  const inStory = async (id: string) => seed.link(await seed.fact(story.id), id);
  await selectedAt(today(0.5), { beforePublish: inStory });
  await selectedAt(today(0.6), { beforePublish: inStory });
  // A fact outside any story and a standalone item: a card each, no story.
  await selectedAt(today(0.7), {
    beforePublish: async (id) => {
      const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, title) VALUES (${`fact-${T}-alone`}, ${`FACT-${T}`}) RETURNING id`;
      await seed.link(fact!.id, id);
    },
  });
  await selectedAt(today(0.8));

  const after = await meta();
  assert.equal(after.readings.date, beijingDate(now));
  assert.equal(after.readings.cards - before.readings.cards, 3, "the story card, the fact card and the standalone card; not yesterday's");
  assert.equal(after.readings.stories - before.readings.stories, 1, "one story however many of its items are selected; cards outside a story count none");
  const added = after.readings.times.filter((t) => !before.readings.times.includes(t)).sort();
  assert.deepEqual(added, [today(0.6), today(0.7), today(0.8)].map((t) => new Date(t).toISOString()), "each card's anchor, today only");
  const [y] = await sql<{ sort_at: Date }[]>`SELECT sort_at FROM publications WHERE article_id = ${yesterday}`;
  assert.ok(!after.readings.times.includes(y!.sort_at.toISOString()), "yesterday's card is not today's");
  assert.equal(after.readings.cards, after.readings.times.length);
});

test("readings count the enabled editorial sources", async () => {
  const before = await meta();
  await seed.source(`${SOURCE}-editorial`);
  await seed.source(`${SOURCE}-heat`, { participationMode: "hot_signal" });
  await seed.source(`${SOURCE}-isolated`, { participationMode: "isolated" });
  await seed.source(`${SOURCE}-disabled`);
  await sql`UPDATE sources SET enabled = false WHERE id = ${`${SOURCE}-disabled`}`;
  const after = await meta();
  assert.equal(after.readings.sources - before.readings.sources, 1);
});

test("readings.updatedAt is the latest release of a selected item", async () => {
  // First seen two hours ago, released only now: the release, not the anchor, is the update.
  const releasedAt = new Date();
  await selectedAt(releasedAt.getTime() - 7200_000, { releasedAt });
  const body = await meta();
  assert.ok(body.readings.updatedAt, "a release exists");
  const updated = Date.parse(body.readings.updatedAt);
  assert.ok(updated >= releasedAt.getTime(), `updatedAt ${body.readings.updatedAt} predates the release ${releasedAt.toISOString()}`);
  assert.ok(updated <= Date.parse(body.generatedAt), "never ahead of the response");
});

test("meta is cached for a minute with an ETag, answers 304 to it, and stays anonymous", async () => {
  const res = await get("/api/mp/v1/meta", { cookie: `session=${T}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.meta);
  assert.equal(res.headers["cache-control"], "public, max-age=60, s-maxage=60");
  const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
  assert.ok(Math.abs(deadline - (Date.now() / 1000 + 60)) <= 5, `X-Accel-Expires ${res.headers["x-accel-expires"]}`);
  assert.equal(res.headers["set-cookie"], undefined);
  const etag = res.headers.etag as string;
  assert.ok(etag);
  const again = await get("/api/mp/v1/meta", { "if-none-match": etag });
  assert.equal(again.statusCode, 304);
  assert.equal(again.body, "");
  assert.equal(again.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.meta);
});

test("meta stays out of the OpenAPI document", async () => {
  const res = await get("/openapi-v1.json");
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.includes("/api/mp"));
});

test("an unknown or repeated query parameter is 400 invalid_request, never cached", async () => {
  for (const url of ["/api/mp/v1/meta?x=1", "/api/mp/v1/meta?_=1760000000", "/api/mp/v1/meta?a=1&a=2"]) {
    const res = await get(url);
    assert.equal(res.statusCode, 400, url);
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, url);
    assert.equal(res.headers["cache-control"], "no-store", url);
    const problem = JSON.parse(res.body);
    assert.equal(problem.code, "invalid_request", url);
    assert.equal(problem.status, 400, url);
    assert.ok(problem.requestId, url);
  }
});

test("a missing path or another method under /api/mp is a cacheable Problem 404, never a 405", async () => {
  const cases: Array<["GET" | "POST" | "PUT" | "DELETE", string]> = [
    ["GET", "/api/mp/v1/nope"], ["GET", "/api/mp/v2/meta"], ["GET", "/api/mp"], ["GET", "/api/mp/v1/meta/"],
    ["POST", "/api/mp/v1/meta"], ["PUT", "/api/mp/v1/meta"], ["DELETE", "/api/mp/v1/meta"],
  ];
  for (const [method, url] of cases) {
    const res = await app.inject({ method, url });
    const what = `${method} ${url}`;
    assert.equal(res.statusCode, 404, what);
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, what);
    assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound, what);
    assert.ok(res.headers.etag, what);
    const problem = JSON.parse(res.body);
    assert.equal(problem.code, "not_found", what);
    assert.equal(problem.status, 404, what);
    assert.equal(problem.requestId, res.headers["x-request-id"], what);
  }
  const first = await get("/api/mp/v1/nope");
  const again = await get("/api/mp/v1/nope", { "if-none-match": first.headers.etag as string });
  assert.equal(again.statusCode, 304);
  assert.equal(again.body, "");
});

// ── The feed ─────────────────────────────────────────────────────────────────────────────

const FEED_FIELDS: Record<keyof MiniprogramFeed, true> = { schemaVersion: true, query: true, focus: true, cards: true, page: true, refreshAt: true, generatedAt: true };
const FEED_QUERY_FIELDS: Record<keyof MiniprogramFeed["query"], true> = { category: true };
const PAGE_FIELDS: Record<keyof MiniprogramFeed["page"], true> = { nextCursor: true, hasMore: true };
const CARD_FIELDS: Record<keyof MiniprogramCard, true> = {
  id: true, title: true, summary: true, category: true, source: true, anchorAt: true, publishedAt: true, sourceCount: true, storyId: true, ai: true,
};
const CARD_SOURCE_FIELDS: Record<keyof MiniprogramCard["source"], true> = { name: true };
const CARD_AI_FIELDS: Record<keyof MiniprogramCard["ai"], true> = { title: true, summary: true };
const FOCUS_FIELDS: Record<keyof MiniprogramFocus, true> = { ...CARD_FIELDS, sourceNames: true, latestAt: true };

const qs = (params: Record<string, string | null | undefined>) => {
  const entries = Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string");
  return entries.length ? `?${new URLSearchParams(entries)}` : "";
};
async function feed(params: Record<string, string | null | undefined> = {}): Promise<MiniprogramFeed> {
  const res = await get(`/api/mp/v1/feed${qs(params)}`);
  assert.equal(res.statusCode, 200, `${qs(params)}: ${res.body}`);
  return JSON.parse(res.body) as MiniprogramFeed;
}
/** Every card in a scope, page after page: the shared test database keeps every earlier run's rows. */
async function allCards(category: string | null = null): Promise<MiniprogramCard[]> {
  const cards: MiniprogramCard[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 200; page += 1) {
    const body = await feed({ category, cursor, limit: "40" });
    cards.push(...body.cards);
    if (!body.page.hasMore) return cards;
    cursor = body.page.nextCursor;
  }
  throw new Error("the feed did not end within 200 pages");
}
const maxAge = (cacheControl: unknown) => Number(/max-age=(\d+)/.exec(String(cacheControl))?.[1] ?? NaN);
async function expectProblem(url: string, status: number, code: string) {
  const res = await get(url);
  assert.equal(res.statusCode, status, url);
  assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, url);
  assert.equal(res.headers["cache-control"], "no-store", url);
  const problem = JSON.parse(res.body);
  assert.equal(problem.code, code, url);
  assert.equal(problem.status, status, url);
  assert.ok(problem.requestId, url);
}

test("feed: one card per reading group; two selected reports of one fact are one card counting both sources", async () => {
  const second = await seed.source(`${SOURCE}-second`, { name: "Test miniprogram second" });
  const story = await seed.story();
  const fact = await seed.fact(story.id);
  const now = Date.now();
  const first = await selectedAt(now - 120_000, { beforePublish: (id) => seed.link(fact, id) });
  const other = await selectedAt(now - 60_000, { sourceId: second, beforePublish: (id) => seed.link(fact, id) });
  const lone = await selectedAt(now - 30_000, { publishedAt: null });

  const cards = await allCards();
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length, "no item twice");
  const ofFact = cards.filter((c) => c.id === first || c.id === other);
  assert.equal(ofFact.length, 1, "one card for the fact, shown by one of its reports");
  const card = ofFact[0]!;
  assert.equal(card.sourceCount, 2, "two sources report the fact");
  assert.equal(card.storyId, story.publicId);
  const [group] = await sql<{ t: Date }[]>`SELECT max(sort_at) AS t FROM publications WHERE article_id IN ${sql([first, other])}`;
  assert.equal(card.anchorAt, group!.t.toISOString(), "the reading group's anchor, as on the home timeline");
  const site = JSON.parse((await get(`/api/site/items/${card.id}`)).body);
  assert.equal(card.sourceCount, (site.group?.additionalSourceCount ?? 0) + 1, "the item page counts the same sources");

  const alone = cards.find((c) => c.id === lone);
  assert.ok(alone, "a standalone item is a card of its own");
  const [row] = await sql<{ published_at: Date | null; discovered_at: Date; title: string; summary: string }[]>`
    SELECT published_at, discovered_at, title, summary FROM publications WHERE article_id = ${lone}`;
  assert.equal(row!.published_at, null);
  assert.deepEqual(alone, {
    id: lone, title: row!.title, summary: row!.summary, category: DEFAULT_CATEGORY, source: { name: "Test miniprogram" },
    anchorAt: row!.discovered_at.toISOString(), publishedAt: row!.discovered_at.toISOString(), sourceCount: 1, storyId: null,
    ai: { title: false, summary: false },
  }, "publishedAt falls back to the discovery time; one source; no story");
});

test("feed: the category filter works on every category of the pack", async () => {
  const now = Date.now();
  const planted = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) planted.set(c.key, await selectedAt(now - 10_000 + i * 100, { analysis: { category: c.key } }));
  for (const c of CATEGORIES) {
    const first = await feed({ category: c.key });
    assert.deepEqual(first.query, { category: c.key });
    const cards = await allCards(c.key);
    assert.ok(cards.some((card) => card.id === planted.get(c.key)), `${c.key} lists its card`);
    assert.deepEqual([...new Set(cards.map((card) => card.category))], [c.key], `${c.key} lists nothing else`);
  }
  assert.deepEqual((await feed()).query, { category: null });
});

test("feed: a selected item released in the future stays out, and the cache ends by its release", async () => {
  const category = CATEGORIES[CATEGORIES.length - 1]!.key;
  const releaseAt = new Date(Date.now() + 30_000);
  const gated = await selectedAt(Date.now(), { releasedAt: releaseAt, analysis: { category } });
  for (const scope of [null, category]) {
    const res = await get(`/api/mp/v1/feed${qs({ category: scope })}`);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as MiniprogramFeed;
    assert.ok(body.refreshAt, `${scope}: a release is pending`);
    const refreshAt = Date.parse(body.refreshAt);
    assert.ok(refreshAt <= releaseAt.getTime() && refreshAt > Date.parse(body.generatedAt), `${scope}: refreshAt ${body.refreshAt} is the next release`);
    const left = (refreshAt - Date.parse(body.generatedAt)) / 1000;
    const cacheControl = String(res.headers["cache-control"]);
    assert.ok(maxAge(cacheControl) <= left, `${scope}: ${cacheControl} outlives the release ${left}s away`);
    assert.equal(maxAge(cacheControl), Math.min(60, Math.floor(left)), `${scope}: ${cacheControl}`);
    assert.match(cacheControl, new RegExp(`^public, max-age=${maxAge(cacheControl)}, s-maxage=${maxAge(cacheControl)}$`), "no stale-while-revalidate");
    const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
    assert.ok(deadline <= Math.ceil(refreshAt / 1000), `${scope}: X-Accel-Expires ${res.headers["x-accel-expires"]} outlives the release`);
    assert.ok(!(await allCards(scope)).some((c) => c.id === gated), `${scope}: an unreleased item is listed`);
  }
  // Once released it is a card like any other (and nothing of this file stays behind the gate).
  await sql`UPDATE publications SET visible_after = now() - interval '1 second' WHERE article_id = ${gated}`;
  await sql`UPDATE selected_ledger SET visible_at = now() WHERE article_id = ${gated} AND visible_at > now()`;
  assert.ok((await allCards(category)).some((c) => c.id === gated), "the released item is listed");
});

test("feed: AI marks follow the analysis behind the card; an editor's correction keeps a model draft marked", async () => {
  const now = Date.now();
  const model = await selectedAt(now - 5000, { analysis: { origin: "model" } });
  const replay = await selectedAt(now - 4000, { analysis: { origin: "replay" } });
  const rule = await selectedAt(now - 3000, { analysis: { origin: "rule" } });
  const editedModel = await selectedAt(now - 2000, { analysis: { origin: "model" } });
  const editedRule = await selectedAt(now - 1000, { analysis: { origin: "rule" } });
  await overrideFields(editedModel, { fields: { title: `EDITED-MODEL-${T}`, summary: `EDITED-SUMMARY-${T}` }, reason: "test", version: 0 }, "test");
  await overrideFields(editedRule, { fields: { title: `EDITED-RULE-${T}` }, reason: "test", version: 0 }, "test");

  const byId = new Map((await allCards()).map((c) => [c.id, c]));
  const marked = { title: true, summary: true };
  const unmarked = { title: false, summary: false };
  assert.deepEqual(byId.get(model)?.ai, marked, "model");
  assert.deepEqual(byId.get(replay)?.ai, marked, "replay");
  assert.deepEqual(byId.get(rule)?.ai, unmarked, "rule");
  assert.equal(byId.get(editedModel)?.title, `EDITED-MODEL-${T}`, "the correction is shown");
  assert.equal(byId.get(editedModel)?.summary, `EDITED-SUMMARY-${T}`);
  assert.deepEqual(byId.get(editedModel)?.ai, marked, "a corrected model draft stays marked");
  assert.equal(byId.get(editedRule)?.title, `EDITED-RULE-${T}`);
  assert.deepEqual(byId.get(editedRule)?.ai, unmarked, "a corrected rule text stays unmarked");
});

test("feed: pages through a cursor bound to the category; a malformed or foreign cursor is 400 invalid_cursor", async () => {
  const [a, b] = [CATEGORIES[0]!.key, CATEGORIES[1]!.key];
  const now = Date.now();
  const planted = [];
  for (let i = 0; i < 3; i += 1) planted.push(await selectedAt(now - 3000 + i * 1000, { analysis: { category: b } }));

  const first = await feed({ category: b, limit: "1" });
  assert.equal(first.cards.length, 1);
  assert.equal(first.page.hasMore, true);
  assert.ok(first.page.nextCursor);
  const second = await feed({ category: b, limit: "1", cursor: first.page.nextCursor });
  assert.equal(second.cards.length, 1);
  assert.notEqual(second.cards[0]!.id, first.cards[0]!.id, "the next page is another card");
  assert.ok(second.cards[0]!.anchorAt <= first.cards[0]!.anchorAt, "newest first");
  const seen = [...first.cards, ...second.cards].map((c) => c.id);
  let page = second;
  for (let i = 0; page.page.hasMore; i += 1) {
    assert.ok(i < 200, "the feed ends");
    assert.equal(typeof page.page.nextCursor, "string");
    page = await feed({ category: b, limit: "40", cursor: page.page.nextCursor });
    seen.push(...page.cards.map((c) => c.id));
  }
  assert.deepEqual(page.page, { nextCursor: null, hasMore: false }, "the last page");
  assert.equal(new Set(seen).size, seen.length, "no card on two pages");
  for (const id of planted) assert.ok(seen.includes(id), `${id} is on a page`);

  const cursor = first.page.nextCursor!;
  const json = (value: unknown) => `tl1.${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
  for (const bad of ["nonsense", "tl1.", "tl1.!!!!", json([1]), json({ a: 1 }), json({ a: "x", g: "a1", b: "0" }), cursor.slice(0, -4)]) {
    await expectProblem(`/api/mp/v1/feed${qs({ category: b, cursor: bad })}`, 400, "invalid_cursor");
  }
  await expectProblem(`/api/mp/v1/feed?cursor=`, 400, "invalid_cursor");
  await expectProblem(`/api/mp/v1/feed${qs({ category: a, cursor })}`, 400, "invalid_cursor");
  await expectProblem(`/api/mp/v1/feed${qs({ cursor })}`, 400, "invalid_cursor");
});

test("feed: the focus card tops the unfiltered first page only, and no rank or heat values anywhere", async () => {
  await selectedAt(Date.now() - 2000);
  await selectedAt(Date.now() - 1000);
  const first = await get("/api/mp/v1/feed?limit=1");
  const firstBody = JSON.parse(first.body) as MiniprogramFeed;
  assert.ok(firstBody.focus, "today has cards, so the first page has a focus card");
  assert.ok((JSON.parse((await get("/api/mp/v1/feed")).body) as MiniprogramFeed).focus, "whatever the limit");
  const next = await get(`/api/mp/v1/feed${qs({ limit: "1", cursor: firstBody.page.nextCursor })}`);
  const filtered = await get(`/api/mp/v1/feed${qs({ category: DEFAULT_CATEGORY })}`);
  const filteredNext = await get(`/api/mp/v1/feed${qs({ category: DEFAULT_CATEGORY, limit: "1", cursor: (JSON.parse(filtered.body) as MiniprogramFeed).page.nextCursor })}`);
  for (const res of [next, filtered, filteredNext]) assert.equal((JSON.parse(res.body) as MiniprogramFeed).focus, null, "a later page or a filter has none");
  for (const res of [first, next, filtered, filteredNext]) {
    assert.equal(res.statusCode, 200);
    assert.ok((JSON.parse(res.body) as MiniprogramFeed).cards.length > 0);
    assert.doesNotMatch(res.body, /"(score|rank|ranking|hot|heat|selected)"\s*:/, "no ranking or heat field");
  }
});

test("feed: cached for a minute unless a release comes sooner, with an ETag answering 304, and anonymous", async () => {
  assert.equal(MINIPROGRAM_CACHE_CONTROL.feed, "public, max-age=60, s-maxage=60");
  const res = await get("/api/mp/v1/feed", { cookie: `session=${T}` });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as MiniprogramFeed;
  const left = body.refreshAt ? Math.floor((Date.parse(body.refreshAt) - Date.parse(body.generatedAt)) / 1000) : Infinity;
  const seconds = Math.min(60, left);
  // The default holds whenever no release is due within the minute (this file leaves none behind).
  assert.equal(res.headers["cache-control"], left >= 60 ? MINIPROGRAM_CACHE_CONTROL.feed : `public, max-age=${seconds}, s-maxage=${seconds}`);
  const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
  assert.ok(Math.abs(deadline - (Date.now() / 1000 + seconds)) <= 5, `X-Accel-Expires ${res.headers["x-accel-expires"]}`);
  assert.equal(res.headers["set-cookie"], undefined);
  const etag = res.headers.etag as string;
  assert.ok(etag);
  const again = await get("/api/mp/v1/feed", { "if-none-match": etag });
  assert.equal(again.statusCode, 304);
  assert.equal(again.body, "");
  assert.ok(String(again.headers["cache-control"]).startsWith("public, max-age="));
  assert.ok(again.headers["x-accel-expires"]);
});

test("feed: an unknown or repeated parameter, a bad limit or a category outside the pack is 400 invalid_request, never cached", async () => {
  const c = CATEGORIES[0]!.key;
  const urls = [
    "?x=1", "?_=1760000000", "?limit=1&limit=2", `?category=${c}&category=${c}`, "?cursor=a&cursor=b",
    "?limit=0", "?limit=41", "?limit=1.5", "?limit=abc", "?limit=-1", "?limit=", "?limit=%201", "?limit=1e1",
    "?category=nope", "?category=", `?category=${encodeURIComponent(c.toUpperCase())}`,
  ];
  for (const url of urls) await expectProblem(`/api/mp/v1/feed${url}`, 400, "invalid_request");
  for (const limit of ["1", "40"]) assert.ok((await feed({ limit })).cards.length <= Number(limit));
});

test("feed carries exactly the contract's fields", async () => {
  await selectedAt(Date.now());
  for (const body of [await feed(), await feed({ category: DEFAULT_CATEGORY, limit: "5" })]) {
    sameFields(body, FEED_FIELDS, "feed");
    sameFields(body.query, FEED_QUERY_FIELDS, "query");
    sameFields(body.page, PAGE_FIELDS, "page");
    if (body.focus) {
      sameFields(body.focus, FOCUS_FIELDS, "focus");
      sameFields(body.focus.source, CARD_SOURCE_FIELDS, "focus.source");
      sameFields(body.focus.ai, CARD_AI_FIELDS, "focus.ai");
      assert.ok(body.focus.sourceNames.length >= 1 && body.focus.sourceNames.every((n) => typeof n === "string"));
      assert.ok(!Number.isNaN(Date.parse(body.focus.latestAt)));
    }
    assert.equal(body.schemaVersion, 1);
    assert.ok(body.cards.length > 0);
    for (const card of body.cards) {
      sameFields(card, CARD_FIELDS, "card");
      sameFields(card.source, CARD_SOURCE_FIELDS, "card.source");
      sameFields(card.ai, CARD_AI_FIELDS, "card.ai");
      assert.ok(typeof card.id === "string" && typeof card.title === "string" && typeof card.summary === "string");
      assert.ok(card.category === null || CATEGORIES.some((x) => x.key === card.category));
      assert.ok(!Number.isNaN(Date.parse(card.anchorAt)) && !Number.isNaN(Date.parse(card.publishedAt)));
      assert.ok(Number.isInteger(card.sourceCount) && card.sourceCount >= 1);
      assert.ok(card.storyId === null || typeof card.storyId === "string");
      assert.ok(typeof card.ai.title === "boolean" && typeof card.ai.summary === "boolean");
    }
  }
});

// ── The item page ────────────────────────────────────────────────────────────────────────

const ITEM_FIELDS: Record<keyof MiniprogramItem, true> = {
  schemaVersion: true, id: true, title: true, summary: true, category: true, source: true, publishedAt: true, reason: true, sourceCount: true,
  originalUrl: true, fullText: true, story: true, ai: true, share: true, generatedAt: true,
};
const ITEM_SOURCE_FIELDS: Record<keyof MiniprogramItem["source"], true> = { name: true };
const FULL_TEXT_FIELDS: Record<keyof MiniprogramItem["fullText"], true> = { allowed: true, html: true, translated: true, complete: true };
const ITEM_STORY_FIELDS: Record<keyof NonNullable<MiniprogramItem["story"]>, true> = { id: true, title: true, sourceCount: true, otherSourceNames: true, ai: true };
const ITEM_AI_FIELDS: Record<keyof MiniprogramItem["ai"], true> = { title: true, summary: true, reason: true, body: true };
const SHARE_FIELDS: Record<keyof MiniprogramItem["share"], true> = { title: true, imageUrl: true };

async function item(id: string): Promise<MiniprogramItem> {
  const res = await get(`/api/mp/v1/items/${id}`);
  assert.equal(res.statusCode, 200, `${id}: ${res.body}`);
  return JSON.parse(res.body) as MiniprogramItem;
}
const siteItem = async (id: string) => JSON.parse((await get(`/api/site/items/${id}`)).body);
/** A pool item outside the selection: published at once, no release gate. */
async function unselected(analysis: SeedAnalysisOptions = {}, article: SeedArticleOptions = {}): Promise<string> {
  const id = await seed.article(article);
  await seed.analysis(id, { selected: false, ...analysis });
  await seed.publishReleased(id);
  return id;
}

test("item: carries exactly the contract's fields, its card's values and the site item page's", async () => {
  const second = await seed.source(`${SOURCE}-item-second`, { name: "Test miniprogram item second" });
  const story = await seed.story({ title: `ITEM-STORY-${T}` });
  const fact = await seed.fact(story.id);
  const now = Date.now();
  const id = await selectedAt(now - 90_000, { beforePublish: (x) => seed.link(fact, x), analysis: { origin: "model", reasonZh: `REASON-${T}` } });
  const other = await selectedAt(now - 80_000, { sourceId: second, beforePublish: (x) => seed.link(fact, x) });

  const body = await item(id);
  sameFields(body, ITEM_FIELDS, "item");
  sameFields(body.source, ITEM_SOURCE_FIELDS, "item.source");
  sameFields(body.fullText, FULL_TEXT_FIELDS, "item.fullText");
  sameFields(body.story!, ITEM_STORY_FIELDS, "item.story");
  sameFields(body.story!.ai, { title: true }, "item.story.ai");
  sameFields(body.ai, ITEM_AI_FIELDS, "item.ai");
  sameFields(body.share, SHARE_FIELDS, "item.share");
  const [row] = await sql<{ title: string; summary: string; category: string; url: string; published_at: Date }[]>`
    SELECT title, summary, category, url, published_at FROM publications WHERE article_id = ${id}`;
  assert.deepEqual({ ...body, generatedAt: undefined }, {
    schemaVersion: 1, id, title: row!.title, summary: row!.summary, category: row!.category, source: { name: "Test miniprogram" },
    publishedAt: row!.published_at.toISOString(), reason: `REASON-${T}`, sourceCount: 2, originalUrl: row!.url,
    fullText: { allowed: true, html: body.fullText.html, translated: false, complete: false },
    story: { id: story.publicId, title: `ITEM-STORY-${T}`, sourceCount: 2, otherSourceNames: ["Test miniprogram item second"], ai: { title: true } },
    ai: { title: true, summary: true, reason: true, body: false },
    share: { title: row!.title, imageUrl: `${config.siteUrl}/og/mp/items/${id}.png` },
    generatedAt: undefined,
  });
  assert.match(body.fullText.html ?? "", new RegExp(`^<p>BODY-${T}-\\d+</p><p>${RICH_TEXT_NOTE}</p>$`), "the stored body, then the closing line");
  assert.ok(body.share.imageUrl.startsWith(`${config.siteUrl}/`), "an absolute address");
  assert.equal((await get(new URL(body.share.imageUrl).pathname)).statusCode, 200, "the share image is there");

  const card = (await allCards()).find((c) => c.storyId === story.publicId);
  assert.ok(card, "the fact's card");
  for (const x of [id, other]) assert.equal((await item(x)).sourceCount, card.sourceCount, `${x}: the item page counts what its card counts`);

  // The same item on the site: title, summary, source and publication time agree, a missing time included.
  const undated = await selectedAt(now - 70_000, { publishedAt: null });
  for (const x of [id, undated]) {
    const mp = await item(x);
    const site = await siteItem(x);
    assert.deepEqual(
      { title: mp.title, summary: mp.summary, source: mp.source.name, publishedAt: mp.publishedAt },
      { title: site.title, summary: site.summary, source: site.source.name, publishedAt: site.publishedAt ?? site.discoveredAt },
      x,
    );
  }
  assert.equal((await siteItem(undated)).publishedAt, null, "the site leaves it out, the card and the item page fill in the discovery time");
});

test("item: the reason only on a selected item", async () => {
  const chosen = await selectedAt(Date.now(), { analysis: { origin: "model", reasonZh: `CHOSEN-${T}` } });
  const left = await unselected({ origin: "model", reasonZh: `LEFT-${T}` });
  const a = await item(chosen);
  const b = await item(left);
  assert.equal(a.reason, `CHOSEN-${T}`);
  assert.equal(a.ai.reason, true);
  assert.equal(b.reason, null, "an unselected pool item keeps its page but has no reason");
  assert.equal(b.ai.reason, false, "nothing to mark");
  assert.deepEqual([b.ai.title, b.ai.summary], [true, true]);
});

test("item: full text follows the source's licence and a confirmed body", async () => {
  const closed = await seed.source(`${SOURCE}-closed`, { name: "Test miniprogram closed", siteFulltext: false });
  const now = Date.now();
  const licensed = await selectedAt(now - 3000, { article: { language: "zh", bodyHtml: `<p>LICENSED-${T}</p>` } });
  const unlicensed = await selectedAt(now - 2000, { sourceId: closed, article: { language: "zh" } });
  const unconfirmed = await selectedAt(now - 1000, { article: { bodyText: null } });
  assert.deepEqual((await item(licensed)).fullText, { allowed: true, html: `<p>LICENSED-${T}</p><p>${RICH_TEXT_NOTE}</p>`, translated: false, complete: true });
  assert.ok((await siteItem(licensed)).body, "the site shows the body");
  for (const id of [unlicensed, unconfirmed]) {
    assert.deepEqual((await item(id)).fullText, { allowed: false, html: null, translated: false, complete: false }, id);
    assert.equal((await siteItem(id)).body, null, `${id}: nor does the site`);
  }
});

test("item: under summary-only there is no full text, reason, story or source count, on the site neither", async () => {
  const second = await seed.source(`${SOURCE}-reduced-second`, { name: "Test miniprogram reduced second" });
  const fact = await seed.fact((await seed.story()).id);
  const now = Date.now();
  const id = await selectedAt(now - 2000, { article: { language: "zh" }, beforePublish: (x) => seed.link(fact, x), analysis: { origin: "model" } });
  await selectedAt(now - 1000, { sourceId: second, beforePublish: (x) => seed.link(fact, x) });
  const before = await item(id);
  assert.equal(before.fullText.allowed, true);
  assert.ok(before.reason && before.story && before.sourceCount === 2);

  await setVisibility(id, { visibility: "summary-only", reason: "test", version: 0 }, "test");
  const after = await item(id);
  assert.deepEqual(after.fullText, { allowed: false, html: null, translated: false, complete: false });
  assert.equal(after.reason, null);
  assert.equal(after.story, null);
  assert.equal(after.sourceCount, null);
  assert.deepEqual(after.ai, { title: true, summary: true, reason: false, body: false });
  assert.deepEqual([after.title, after.summary, after.originalUrl], [before.title, before.summary, before.originalUrl], "the summary stays");
  const site = await siteItem(id);
  assert.equal(site.readingMode, "summary-only");
  assert.equal(site.body, null, "the site has no body either");
  assert.equal(site.reason, null);
});

test("item: anything without a page, a missing item and a malformed id are the same cacheable 404", async () => {
  const SIGNAL = `${SOURCE}-item-signal`;
  await seed.source(SIGNAL, { name: "Test miniprogram signal", participationMode: "hot_signal" });
  const plain = await seed.article(); // the model never summarised it
  await seed.publishReleased(plain);
  const blocked = await unselected({ relevance: "block" });
  const unsummarised = await unselected({ summaryZh: null });
  const signal = await unselected({ origin: "replay" }, { sourceId: SIGNAL });
  const withdrawn = await selectedAt(Date.now());
  assert.equal((await get(`/api/mp/v1/items/${withdrawn}`)).statusCode, 200, "it had a page");
  assert.equal((await get(`/og/mp/items/${withdrawn}.png`)).statusCode, 200, "and a share image");
  await setVisibility(withdrawn, { visibility: "withdrawn", reason: "test", version: 0 }, "test");

  const ids = [plain, blocked, unsummarised, signal, withdrawn, `missing-${T}`];
  const malformed = ["a.b", "x".repeat(81), encodeURIComponent("中文"), "a%20b", "a%2Fb", "x".repeat(400)];
  for (const id of [...ids, ...malformed]) {
    const url = `/api/mp/v1/items/${id}`;
    const res = await get(url);
    assert.equal(res.statusCode, 404, url);
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, url);
    assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound, url);
    assert.ok(res.headers["x-accel-expires"], url);
    const problem = JSON.parse(res.body);
    assert.deepEqual([problem.status, problem.code], [404, "not_found"], url);
    assert.ok(problem.requestId, url);
    const again = await get(url, { "if-none-match": res.headers.etag as string });
    assert.equal(again.statusCode, 304, url);
  }
  for (const id of ids.slice(0, 5)) assert.equal((await get(`/api/site/items/${id}`)).statusCode, 404, `${id}: the site agrees`);

  // Its 5:4 share image: the same cacheable 404, and so is an address that is not a PNG of an item.
  const images = [...[...ids, "a.b", "a%20b", encodeURIComponent("中文")].map((id) => `/og/mp/items/${id}.png`), `/og/mp/items/${withdrawn}`, `/og/mp/items/${withdrawn}.jpg`];
  for (const url of images) await expectNoShareImage(url);
});

test("item: AI marks follow the analysis, the translation and the story behind the page", async () => {
  const now = Date.now();
  const model = await selectedAt(now - 9000, { analysis: { origin: "model" } });
  const replay = await selectedAt(now - 8000, { analysis: { origin: "replay" } });
  const rule = await selectedAt(now - 7000, { analysis: { origin: "rule" } });
  const editedModel = await selectedAt(now - 6000, { analysis: { origin: "model" } });
  const editedRule = await selectedAt(now - 5000, { analysis: { origin: "rule" } });
  await overrideFields(editedModel, { fields: { title: `EDITED-ITEM-${T}`, summary: `EDITED-ITEM-SUMMARY-${T}`, reason: `EDITED-REASON-${T}` }, reason: "test", version: 0 }, "test");
  await overrideFields(editedRule, { fields: { title: `EDITED-RULE-ITEM-${T}` }, reason: "test", version: 0 }, "test");
  const all = { title: true, summary: true, reason: true, body: false };
  const none = { title: false, summary: false, reason: false, body: false };
  assert.deepEqual((await item(model)).ai, all, "model");
  assert.deepEqual((await item(replay)).ai, all, "replay");
  assert.deepEqual((await item(rule)).ai, none, "rule");
  const edited = await item(editedModel);
  assert.deepEqual([edited.title, edited.summary, edited.reason], [`EDITED-ITEM-${T}`, `EDITED-ITEM-SUMMARY-${T}`, `EDITED-REASON-${T}`], "the corrections are shown");
  assert.deepEqual(edited.ai, all, "a corrected model draft stays marked");
  assert.equal((await item(editedRule)).title, `EDITED-RULE-ITEM-${T}`);
  assert.deepEqual((await item(editedRule)).ai, none, "a corrected rule text stays unmarked");

  // The body: marked only when it is a model's translation; a source's own translation and a Chinese original are not.
  const translated = async (origin: TranslationOrigin, complete: boolean) => {
    const id = await selectedAt(Date.now(), { analysis: { origin: "rule" }, article: { language: "en", bodyHtml: "<p>English body</p>" } });
    await seed.translation(id, { origin, bodyHtml: "<p>中文译文</p>", bodyText: "中文译文", complete });
    return id;
  };
  for (const [origin, complete, body] of [["model", false, true], ["replay", true, true], ["source", true, false]] as const) {
    const page = await item(await translated(origin, complete));
    assert.deepEqual(page.fullText, { allowed: true, html: `<p>中文译文</p><p>${RICH_TEXT_NOTE}</p>`, translated: true, complete }, `${origin}: the translation is the body shown`);
    assert.equal(page.ai.body, body, `a ${origin} translation`);
    assert.equal(page.ai.title, false, `${origin}: the rule analysis still decides the title`);
  }
  const chinese = await selectedAt(Date.now(), { article: { language: "zh" } });
  await seed.translation(chinese, { origin: "model", bodyHtml: "<p>译文</p>" });
  const zh = await item(chinese);
  assert.deepEqual([zh.fullText.translated, zh.fullText.complete, zh.ai.body], [false, true, false], "a Chinese original");
  const bodiless = await selectedAt(Date.now(), { article: { language: "en", bodyText: null } });
  await seed.translation(bodiless, { origin: "model", bodyHtml: "<p>译文</p>" });
  const summaryOnly = await item(bodiless);
  assert.deepEqual([summaryOnly.fullText.allowed, summaryOnly.ai.body], [false, false], "no body shown, nothing marked");

  // The story title: model, replay and manual (an editor's correction of a model draft) are all marked.
  for (const origin of ["model", "replay", "manual"] as StoryOrigin[]) {
    const id = await selectedAt(Date.now(), { beforePublish: (x) => seed.storyFor(x, "report", { origin }).then(() => {}) });
    assert.deepEqual((await item(id)).story?.ai, { title: true }, `a ${origin} story`);
  }
});

test("item: the story panel counts the whole story's sources and names up to three others, never the item's own", async () => {
  const name = (x: string) => `Test miniprogram panel ${x} ${T}`;
  const others = new Map<string, string>();
  for (const x of ["A", "B", "C", "D"]) others.set(x, await seed.source(`${SOURCE}-panel-${x}`, { name: name(x) }));
  const story = await seed.story({ title: `PANEL-${T}` });
  const main = await seed.fact(story.id);
  const later = await seed.fact(story.id);
  const base = Date.now() - 600_000;
  const id = await selectedAt(base + 50_000, { beforePublish: (x) => seed.link(main, x) });
  // The other fact: this item's own source first, then D, B, A, C.
  await selectedAt(base, { beforePublish: (x) => seed.link(later, x) });
  for (const [x, at] of [["D", 10_000], ["B", 20_000], ["A", 30_000], ["C", 40_000]] as const) {
    await selectedAt(base + at, { sourceId: others.get(x)!, beforePublish: (y) => seed.link(later, y) });
  }
  const page = await item(id);
  assert.equal(page.sourceCount, 1, "alone in its own fact");
  assert.deepEqual(page.story, {
    id: story.publicId, title: `PANEL-${T}`, sourceCount: 5, otherSourceNames: [name("D"), name("B"), name("A")], ai: { title: true },
  }, "the story's five sources; the first three others by first report");
});

test("item: cached for a minute with an ETag answering 304, anonymous, and strict about its query", async () => {
  const id = await selectedAt(Date.now());
  assert.equal(MINIPROGRAM_CACHE_CONTROL.item, "public, max-age=60, s-maxage=60");
  const res = await get(`/api/mp/v1/items/${id}`, { cookie: `session=${T}` });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.item);
  const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
  assert.ok(Math.abs(deadline - (Date.now() / 1000 + 60)) <= 5, `X-Accel-Expires ${res.headers["x-accel-expires"]}`);
  assert.equal(res.headers["set-cookie"], undefined);
  const etag = res.headers.etag as string;
  assert.ok(etag);
  const again = await get(`/api/mp/v1/items/${id}`, { "if-none-match": etag });
  assert.equal(again.statusCode, 304);
  assert.equal(again.body, "");
  assert.equal(again.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.item);
  for (const url of [`/api/mp/v1/items/${id}?x=1`, `/api/mp/v1/items/${id}?_=1760000000`]) await expectProblem(url, 400, "invalid_request");
  assert.equal((await app.inject({ method: "POST", url: `/api/mp/v1/items/${id}` })).statusCode, 404, "read-only: another method is a 404");
});

test("item: its 5:4 share image is a 1000×800 PNG for ten minutes with an ETag answering 304, labelled in the file when a model wrote the item", async () => {
  assert.equal(MINIPROGRAM_CACHE_CONTROL.shareImage, "public, max-age=600, s-maxage=600");
  const model = await selectedAt(Date.now() - 2000, { analysis: { origin: "model" } });
  const rule = await selectedAt(Date.now() - 1000, { analysis: { origin: "rule" } });
  for (const [id, ai] of [[model, true], [rule, false]] as const) {
    const page = await item(id);
    assert.equal(page.ai.title, ai, id);
    assert.equal(page.share.imageUrl, `${config.siteUrl}/og/mp/items/${id}.png`);
    const res = await expectShareImage(new URL(page.share.imageUrl).pathname);
    assert.equal(pngText(res.rawPayload)[AI_LABEL_KEYWORD], ai ? "标题与摘要由 AI 生成" : undefined, `${id}: the implicit label (D15) follows the item page's mark`);
  }
  // A withdrawal takes it down at once: the old ETag no longer answers 304.
  const url = `/og/mp/items/${model}.png`;
  const etag = (await get(url)).headers.etag as string;
  await setVisibility(model, { visibility: "withdrawn", reason: "test", version: 0 }, "test");
  assert.equal((await get(url, { "if-none-match": etag })).statusCode, 404);
});

// ── The focus card ───────────────────────────────────────────────────────────────────────

const HEAT = 98765;
/**
 * Makes a ranking of these stories (first ranked first) the latest published one while `fn` runs, then
 * removes it. Its far-future time keeps it latest whatever rankings the shared database holds.
 */
async function withRanking(storyIds: number[], fn: () => Promise<void>) {
  const entries = storyIds.map((storyId, i) => ({ rank: i + 1, storyId, storyPublicId: "", title: `RANKED-${T}`, heat: HEAT + i }));
  const [saved] = await sql<{ id: number }[]>`
    INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES ('2099-12-31T00:00:00Z', 'test', ${sql.json(entries as never)}, true) RETURNING id`;
  try {
    await fn();
  } finally {
    await sql`DELETE FROM hot_rankings WHERE id = ${saved!.id}`;
  }
}
/** A moment today (Beijing), `share` of the way from midnight to now. */
function todayAt(share: number): number {
  const now = Date.now();
  const midnight = beijingMidnight(beijingDate(now)).getTime();
  return midnight + Math.floor((now - midnight) * share);
}

test("focus: the hot ranking's first story is the focus when it has a card today, with its sources in order of first report", async () => {
  const other = await seed.source(`${SOURCE}-focus-other`, { name: "Test miniprogram focus other" });
  const story = await seed.story({ title: `FOCUS-${T}` });
  const fact = await seed.fact(story.id);
  // The other source reported first (a pool report outside the selection), then this file's source was selected.
  const early = await seed.article({ sourceId: other, discoveredAt: new Date(todayAt(0.2)), publishedAt: new Date(todayAt(0.2)) });
  await seed.analysis(early, { selected: false });
  await seed.link(fact, early);
  await seed.publishReleased(early);
  const rep = await selectedAt(todayAt(0.5), { beforePublish: (x) => seed.link(fact, x), analysis: { origin: "model" } });
  // A better-scored card today does not displace the ranked story.
  await selectedAt(todayAt(0.6), { analysis: { score: 998 } });
  const runnerUp = await seed.story();

  await withRanking([story.id, runnerUp.id], async () => {
    const res = await get("/api/mp/v1/feed");
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body) as MiniprogramFeed;
    assert.ok(body.focus, "a focus card");
    sameFields(body.focus, FOCUS_FIELDS, "focus");
    const { sourceNames, latestAt, ...card } = body.focus;
    assert.equal(card.id, rep, "the story's card, shown by its representative");
    assert.equal(card.storyId, story.publicId);
    // The timeline keeps the card too (the mini program drops it there by id), with the same fields.
    assert.deepEqual(card, (await allCards()).find((c) => c.id === rep), "the card's own fields, as the timeline has them");
    assert.equal(card.sourceCount, 2);
    assert.deepEqual(card.ai, { title: true, summary: true }, "marked by the card's rule");
    assert.deepEqual(sourceNames, ["Test miniprogram focus other", "Test miniprogram"], "first report first");
    const [newest] = await sql<{ t: Date }[]>`SELECT max(coalesce(published_at, discovered_at)) AS t FROM publications WHERE article_id IN ${sql([early, rep])}`;
    assert.equal(latestAt, newest!.t.toISOString(), "the latest report");
    for (const value of [String(HEAT), String(HEAT + 1), `RANKED-${T}`]) assert.ok(!res.body.includes(value), `the ranking leaks ${value}`);
    assert.doesNotMatch(res.body, /"(score|rank|ranking|hot|heat|selected)"\s*:/);
    assert.equal((await feed({ category: DEFAULT_CATEGORY })).focus, null, "not under a filter");
  });
});

test("focus: a first story without a card today gives way to today's best-scored card", async () => {
  const story = await seed.story();
  const midnight = beijingMidnight(beijingDate(Date.now())).getTime();
  await selectedAt(midnight - 3600_000, { beforePublish: async (x) => seed.link(await seed.fact(story.id), x) }); // yesterday's card
  const best = await selectedAt(Math.max(midnight, Date.now() - 1000), { analysis: { score: 999 } });
  await withRanking([story.id], async () => {
    const body = await feed();
    assert.ok(body.focus);
    assert.equal(body.focus.id, best, "today's highest score");
    assert.equal(body.focus.storyId, null);
    assert.deepEqual(body.focus.sourceNames, ["Test miniprogram"], "a lone item: its own source");
    assert.equal(body.focus.latestAt, body.focus.publishedAt);
  });
});

test("focus: none on a day without cards, though the feed has some", async () => {
  const midnight = beijingMidnight(beijingDate(Date.now())).getTime();
  // First seen and released yesterday: a card at a minute past midnight, but not one of today's.
  await selectedAt(midnight - 7200_000, { releasedAt: new Date(midnight - 3600_000) });
  const body = await loadMiniprogramFeed({ category: null, cursor: null, limit: 40 }, new Date(midnight + 1));
  assert.equal(body.focus, null);
  assert.ok(body.cards.length > 0, "the feed itself has cards");
});

// ── The item body ────────────────────────────────────────────────────────────────────────

/** Every tag name in an HTML string, closing tags included. */
const tagNames = (html: string) => [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]!.toLowerCase());

test("item: the body keeps only rich-text tags, links lose their address, embeds and nested tables go, and images are signed proxy addresses of this site", async () => {
  const picture = `https://images.example.com/${T}/chart.png?w=800&h=400`;
  const bodyHtml = [
    `<h1>大标题-${T}</h1><h2>小节-${T}</h2>`,
    `<p>正文<a href="https://example.com/${T}/linked">链接文字-${T}</a><b>粗体</b><i>斜体</i><span>行内</span></p>`,
    `<p><img src="${picture.replace(/&/g, "&amp;")}" width="800" height="400" alt="图表"></p>`,
    `<p><img src="data:image/png;base64,AAAA"></p>`,
    `<video src="https://example.com/${T}.mp4" poster="https://example.com/${T}.jpg"></video>`,
    `<iframe src="https://example.com/${T}/embed"></iframe><script>window.x = "SCRIPT-${T}"</script><style>.x { color: red }</style>`,
    `<table><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody><tr><td>良率</td><td>98%</td></tr></tbody></table>`,
    `<table><tr><td><table><tr><td>NESTED-${T}</td></tr></table></td></tr></table>`,
    `<blockquote><p>引用-${T}</p></blockquote><ul><li>第一</li><li>第二</li></ul><ol><li>甲</li></ol><h5>细节-${T}</h5>`,
  ].join("");
  const id = await selectedAt(Date.now(), { article: { language: "zh", bodyHtml, bodyText: `正文 ${T}` } });
  const { fullText } = await item(id);
  assert.equal(fullText.allowed, true);
  const html = fullText.html ?? "";
  const allowed: readonly string[] = RICH_TEXT_TAGS;
  for (const name of tagNames(html)) assert.ok(allowed.includes(name), `<${name}> is no rich-text tag: ${html}`);
  assert.ok(!/\shref=/i.test(html) && !tagNames(html).includes("a"), "no link keeps an address");
  for (const kept of [
    `链接文字-${T}`, "<strong>粗体</strong>", "<em>斜体</em>", "行内", `<h2>大标题-${T}</h2>`, `<h2>小节-${T}</h2>`, `<h4>细节-${T}</h4>`,
    `<blockquote><p>引用-${T}</p></blockquote>`, "<ul><li>第一</li><li>第二</li></ul>", "<ol><li>甲</li></ol>",
    "<table><tr><th>指标</th><th>数值</th></tr><tr><td>良率</td><td>98%</td></tr></table>",
  ]) assert.ok(html.includes(kept), `keeps ${kept}: ${html}`);
  for (const gone of [`${T}.mp4`, `${T}.jpg`, `${T}/embed`, `SCRIPT-${T}`, "color: red", `NESTED-${T}`, `${T}/linked`, "data:"]) assert.ok(!html.includes(gone), `drops ${gone}`);
  assert.ok(html.endsWith(`<p>${RICH_TEXT_NOTE}</p>`), "ends with the closing line");

  const sources = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));
  assert.equal(sources.length, 1, "the source's picture, not the inline data");
  assert.ok(sources[0]!.startsWith(`${config.siteUrl}/api/img-proxy?`), `${sources[0]} is an absolute proxy address of this site`);
  const query = Object.fromEntries(new URL(sources[0]!).searchParams);
  assert.deepEqual(Object.keys(query).sort(), ["exp", "mode", "sig", "u"]);
  assert.equal(query.u, picture, "the proxy fetches the source's picture");
  assert.equal(verifyProxyRequest(query).ok, true, "the signature holds");
  assert.equal(verifyProxyRequest({ ...query, u: `${picture}&other` }).ok, false, "for that picture only");
});

test("item: a translated body is the translation in rich-text tags, marked translated", async () => {
  const id = await selectedAt(Date.now(), { article: { language: "en", bodyHtml: `<p>ORIGINAL-${T} <a href="https://example.com/${T}">link</a></p>` } });
  await seed.translation(id, { origin: "model", bodyHtml: `<h2>译文小节</h2><p>译文-${T}<a href="https://example.com/${T}">链接</a></p>`, bodyText: `译文-${T}`, complete: true });
  const page = await item(id);
  assert.deepEqual(page.fullText, { allowed: true, html: `<h2>译文小节</h2><p>译文-${T}链接</p><p>${RICH_TEXT_NOTE}</p>`, translated: true, complete: true });
  assert.equal(page.ai.body, true);
});

// ── The story page ───────────────────────────────────────────────────────────────────────

const STORY_FIELDS: Record<keyof MiniprogramStory, true> = {
  schemaVersion: true, id: true, title: true, digest: true, sourceCount: true, reportCount: true, firstReportAt: true, latestAt: true, reports: true, ai: true,
  generatedAt: true,
};
const STORY_REPORT_FIELDS: Record<keyof MiniprogramStory["reports"][number], true> = { itemId: true, title: true, source: true, publishedAt: true, ai: true };
const STORY_AI_FIELDS: Record<keyof MiniprogramStory["ai"], true> = { title: true, digest: true };

async function storyPage(publicId: string): Promise<MiniprogramStory> {
  const res = await get(`/api/mp/v1/stories/${publicId}`);
  assert.equal(res.statusCode, 200, `${publicId}: ${res.body}`);
  return JSON.parse(res.body) as MiniprogramStory;
}
/** A selected report of a new fact under the story, first seen now. */
const reportIn = async (storyId: number) => selectedAt(Date.now(), { beforePublish: async (x) => seed.link(await seed.fact(storyId), x) });

test("story: digest, counts, first and latest times and the readable reports earliest first, as the site's story page has them", async () => {
  const second = await seed.source(`${SOURCE}-story-second`, { name: "Test miniprogram story second" });
  const SIGNAL = `${SOURCE}-story-signal`;
  await seed.source(SIGNAL, { name: "Test miniprogram story signal", participationMode: "hot_signal" });
  const first = new Date(Date.now() - 4 * 3600_000);
  const latest = new Date(Date.now() - 600_000);
  const story = await seed.story({ title: `STORY-PAGE-${T}`, digest: `DIGEST-${T}`, firstReportAt: first, latestAt: latest });
  const [a, b] = [await seed.fact(story.id), await seed.fact(story.id)];
  const base = first.getTime();
  const late = await selectedAt(base + 30 * 60_000, { analysis: { origin: "replay" }, beforePublish: (x) => seed.link(b, x) });
  const early = await selectedAt(base, { analysis: { origin: "model" }, beforePublish: (x) => seed.link(a, x) });
  const middle = await selectedAt(base + 10 * 60_000, { sourceId: second, analysis: { origin: "rule" }, beforePublish: (x) => seed.link(a, x) });
  // Not listed: material the model never summarised, a judgement without a Chinese title or summary, and hot_signal material.
  const plain = await seed.article({ publishedAt: new Date(base + 5 * 60_000) });
  await seed.publishReleased(plain);
  const untitled = await unselected({ titleZh: null, summaryZh: null }, { publishedAt: new Date(base + 6 * 60_000) });
  const signal = await unselected({ origin: "replay", titleZh: `信号-${T}`, summaryZh: `SIGNAL-SUMMARY-${T}` }, { sourceId: SIGNAL, publishedAt: new Date(base + 7 * 60_000) });
  for (const x of [plain, untitled, signal]) await seed.link(a, x);

  const res = await get(`/api/mp/v1/stories/${story.publicId}`);
  assert.equal(res.statusCode, 200, res.body);
  const body = JSON.parse(res.body) as MiniprogramStory;
  const rows = new Map((await sql<{ id: string; title: string; at: Date }[]>`
    SELECT article_id AS id, title, coalesce(published_at, discovered_at) AS at FROM publications WHERE article_id IN ${sql([early, middle, late])}`).map((r) => [r.id, r]));
  const report = (id: string, name: string, ai: boolean) => ({ itemId: id, title: rows.get(id)!.title, source: { name }, publishedAt: rows.get(id)!.at.toISOString(), ai: { title: ai } });
  assert.deepEqual({ ...body, generatedAt: undefined }, {
    schemaVersion: 1, id: story.publicId, title: `STORY-PAGE-${T}`, digest: `DIGEST-${T}`, sourceCount: 2, reportCount: 3,
    firstReportAt: first.toISOString(), latestAt: latest.toISOString(),
    reports: [report(early, "Test miniprogram", true), report(middle, "Test miniprogram story second", false), report(late, "Test miniprogram", true)],
    ai: { title: true, digest: true },
    generatedAt: undefined,
  });
  for (const x of [plain, untitled, signal]) assert.ok(!res.body.includes(x), `${x} has no page and is not listed`);
  assert.ok(!res.body.includes(`SIGNAL-SUMMARY-${T}`) && !res.body.includes(`信号-${T}`), "nothing of the hot_signal material");
  for (const r of body.reports) assert.equal(r.ai.title, (await item(r.itemId!)).ai.title, `${r.itemId}: the report's mark is its item's own`);

  // The site's story page: the same digest, counts, times and reports (newest first there).
  const site = JSON.parse((await get(`/api/site/stories/${story.publicId}`)).body);
  assert.equal(body.digest, site.digest ?? site.summary);
  assert.deepEqual([body.sourceCount, body.reportCount, body.firstReportAt, body.latestAt], [site.sourceCount, site.reportCount, site.firstReportAt, site.latestAt]);
  assert.deepEqual(
    body.reports.map((r) => [r.itemId, r.title, r.source.name, r.publishedAt]),
    site.timeline.map((r: { id: string; title: string; source: { name: string }; publishedAt: string }) => [r.id, r.title, r.source.name, r.publishedAt]).reverse(),
  );
});

test("story: without a digest the story's summary stands in; with neither the digest is null and unmarked", async () => {
  const summarised = await seed.story();
  await sql`UPDATE stories SET summary = ${`STORY-SUMMARY-${T}`} WHERE id = ${summarised.id}`;
  const bare = await seed.story();
  for (const s of [summarised, bare]) await reportIn(s.id);
  const a = await storyPage(summarised.publicId);
  assert.deepEqual([a.digest, a.ai.digest], [`STORY-SUMMARY-${T}`, true]);
  const b = await storyPage(bare.publicId);
  assert.deepEqual([b.digest, b.ai.digest], [null, false]);
  for (const [s, page] of [[summarised, a], [bare, b]] as const) {
    const site = JSON.parse((await get(`/api/site/stories/${s.publicId}`)).body);
    assert.equal(page.digest, site.digest ?? site.summary, "the site's story page opens with the same text");
  }
});

test("story: the title is marked whether a model, a replay or an editor wrote it last", async () => {
  for (const origin of ["model", "replay", "manual"] as StoryOrigin[]) {
    const s = await seed.story({ origin });
    await reportIn(s.id);
    assert.deepEqual((await storyPage(s.publicId)).ai.title, true, origin);
  }
});

test("story: a merged story answers 200 as the story it was merged into, under that id; the site and v1 still redirect", async () => {
  const survivor = await seed.story({ title: `SURVIVOR-${T}` });
  const middle = await seed.story();
  const merged = await seed.story();
  const id = await reportIn(survivor.id);
  await sql`UPDATE stories SET merged_into = ${survivor.id} WHERE id = ${middle.id}`;
  await sql`UPDATE stories SET merged_into = ${middle.id} WHERE id = ${merged.id}`;
  for (const publicId of [merged.publicId, middle.publicId]) {
    const res = await get(`/api/mp/v1/stories/${publicId}`);
    assert.equal(res.statusCode, 200, publicId);
    assert.equal(res.headers.location, undefined);
    const body = JSON.parse(res.body) as MiniprogramStory;
    assert.equal(body.id, survivor.publicId, "the surviving story's id, along the merge chain");
    assert.equal(body.title, `SURVIVOR-${T}`);
    assert.deepEqual(body.reports.map((r) => r.itemId), [id]);
  }
  assert.equal((await get(`/api/site/stories/${merged.publicId}`)).statusCode, 308);
  assert.equal((await get(`/api/v1/stories/${merged.publicId}`)).statusCode, 308);
});

test("story: a malformed id, a missing story and one with nothing readable left are the same cacheable 404", async () => {
  const empty = await seed.story();
  const unreadable = await seed.story();
  const plain = await seed.article();
  await seed.publishReleased(plain);
  await seed.link(await seed.fact(unreadable.id), plain);
  const withdrawnStory = await seed.story();
  const withdrawn = await reportIn(withdrawnStory.id);
  assert.equal((await get(`/api/mp/v1/stories/${withdrawnStory.publicId}`)).statusCode, 200, "it had a page");
  await setVisibility(withdrawn, { visibility: "withdrawn", reason: "test", version: 0 }, "test");

  const ids = [empty.publicId, unreadable.publicId, withdrawnStory.publicId, randomUUID(), "not-a-uuid", "x".repeat(400), encodeURIComponent("中文")];
  for (const id of ids) {
    const url = `/api/mp/v1/stories/${id}`;
    const res = await get(url);
    assert.equal(res.statusCode, 404, url);
    assert.match(String(res.headers["content-type"]), /^application\/problem\+json/, url);
    assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound, url);
    assert.ok(res.headers["x-accel-expires"], url);
    const problem = JSON.parse(res.body);
    assert.deepEqual([problem.status, problem.code], [404, "not_found"], url);
    assert.ok(problem.requestId, url);
    assert.equal((await get(url, { "if-none-match": res.headers.etag as string })).statusCode, 304, url);
  }
});

test("story: lists at most 100 reports, the earliest one and the latest 99", async () => {
  const s = await seed.story();
  const fact = await seed.fact(s.id);
  const base = Date.now() - 3 * 3600_000;
  const ids: string[] = [];
  for (let i = 0; i < 101; i += 1) ids.push(await unselected({}, { publishedAt: new Date(base + i * 60_000) }));
  for (const id of ids) await seed.link(fact, id);
  const body = await storyPage(s.publicId);
  assert.equal(body.reportCount, 101, "the count is the story's");
  assert.deepEqual(body.reports.map((r) => r.itemId), [ids[0], ...ids.slice(2)], "the first report and the latest 99, earliest first");
});

test("story: carries exactly the contract's fields and no share card; cached for a minute with an ETag answering 304, strict about its query", async () => {
  const s = await seed.story();
  await reportIn(s.id);
  const url = `/api/mp/v1/stories/${s.publicId}`;
  const res = await get(url, { cookie: `session=${T}` });
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body) as MiniprogramStory;
  sameFields(body, STORY_FIELDS, "story");
  sameFields(body.ai, STORY_AI_FIELDS, "story.ai");
  for (const r of body.reports) {
    sameFields(r, STORY_REPORT_FIELDS, "story.reports[]");
    sameFields(r.source, { name: true }, "story.reports[].source");
    sameFields(r.ai, { title: true }, "story.reports[].ai");
  }
  assert.ok(!("share" in body));
  assert.equal(MINIPROGRAM_CACHE_CONTROL.story, "public, max-age=60, s-maxage=60");
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.story);
  const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
  assert.ok(Math.abs(deadline - (Date.now() / 1000 + 60)) <= 5, `X-Accel-Expires ${res.headers["x-accel-expires"]}`);
  assert.equal(res.headers["set-cookie"], undefined);
  const again = await get(url, { "if-none-match": res.headers.etag as string });
  assert.equal(again.statusCode, 304);
  assert.equal(again.body, "");
  for (const bad of [`${url}?x=1`, `${url}?_=1760000000`]) await expectProblem(bad, 400, "invalid_request");
  assert.equal((await app.inject({ method: "POST", url })).statusCode, 404, "read-only: another method is a 404");
});

// ── The daily ────────────────────────────────────────────────────────────────────────────

const DAILY_FIELDS: Record<keyof MiniprogramDaily, true> = {
  schemaVersion: true, date: true, title: true, publishedAt: true, window: true, lead: true, highlights: true, sections: true, flashes: true, prev: true,
  next: true, ai: true, share: true, generatedAt: true,
};
const DAILY_ENTRY_FIELDS: Record<keyof MiniprogramDailyEntry, true> = { itemId: true, title: true, source: true, ai: true };
const DAILY_SECTION_FIELDS: Record<keyof MiniprogramDaily["sections"][number], true> = { label: true, categories: true, items: true };
const DAILY_AI_FIELDS: Record<keyof MiniprogramDaily["ai"], true> = { leadTitle: true, leadParagraph: true };

/** Where the industry pack has no daily these routes are not registered (the last test checks that). */
const daily = { skip: FEATURES.reports ? false : "the industry pack turns the daily column off" };
/** Issue D covers Beijing D-1 08:00 to D 08:00. */
function dailyWindow(key: string) {
  const end = new Date(beijingMidnight(key).getTime() + 8 * 3600_000);
  return { windowStart: new Date(end.getTime() - 86_400_000), windowEnd: end };
}
const emptyIssue = (key: string) => ({ date: key, lead: null, highlights: [], sections: [], flashes: [], metrics: { totalEvents: 0, sourcesCount: 0, firstPartyEvents: 0 } });
/** Plants issues under far-future keys while `fn` runs, then removes them. */
async function withIssues(issues: Array<[string, unknown]>, fn: () => Promise<void>) {
  const planted = [];
  try {
    for (const [key, content] of issues) planted.push(await seed.report(content, { key, origin: "model", ...dailyWindow(key) }));
    await fn();
  } finally {
    for (const issue of planted) await issue.remove();
  }
}

test("daily: an issue lists its lead, highlights, sections with their category keys, flashes, neighbours and share card; a withdrawn item leaves every field", daily, async () => {
  const [first, last] = [CATEGORIES[0]!, CATEGORIES[CATEGORIES.length - 1]!];
  const [before, key, after] = ["2199-11-01", "2199-11-03", "2199-11-05"];
  const now = Date.now();
  const a = await selectedAt(now - 5000, { analysis: { origin: "model", category: first.key } });
  const b = await selectedAt(now - 4000, { analysis: { origin: "rule", category: first.key } });
  const c = await selectedAt(now - 3000, { analysis: { origin: "replay", category: last.key } });
  const f = await selectedAt(now - 2000, { analysis: { origin: "model" } });
  const w = await selectedAt(now - 1000, { analysis: { origin: "model" } });
  const cite = (itemId: string, n: string) => ({
    itemId, title: `${n}-TITLE-${T}`, summary: `${n}-SUMMARY-${T}`, sourceName: `${n}-SOURCE-${T}`, sourceUrl: `https://example.com/${n}-ORIGINAL-${T}`,
    publishedAt: new Date(now).toISOString(),
  });
  const content = {
    date: key,
    lead: { title: `LEAD-${T}`, leadParagraph: `PARAGRAPH-${T}` },
    highlights: [c, w, a],
    sections: [
      { label: first.section, items: [cite(a, "A"), cite(b, "B")] },
      { label: last.section, items: [cite(w, "W"), cite(c, "C")] },
      { label: `ONLY-WITHDRAWN-${T}`, items: [cite(w, "W")] },
    ],
    flashes: [cite(f, "F"), cite(w, "W"), cite(`missing-${T}`, "M")],
  };
  await withIssues([[before, emptyIssue(before)], [key, content], [after, emptyIssue(after)]], async () => {
    await setVisibility(w, { visibility: "withdrawn", reason: "test", version: 0 }, "test");
    const res = await get(`/api/mp/v1/dailies/${key}`);
    assert.equal(res.statusCode, 200, res.body);
    const body = JSON.parse(res.body) as MiniprogramDaily;
    const [saved] = await sql<{ generated_at: Date }[]>`SELECT generated_at FROM reports WHERE kind = 'daily' AND key = ${key}`;
    const { windowStart, windowEnd } = dailyWindow(key);
    const entry = (itemId: string, n: string, ai: boolean) => ({ itemId, title: `${n}-TITLE-${T}`, source: { name: `${n}-SOURCE-${T}` }, ai: { title: ai } });
    const keys = (label: string) => CATEGORIES.filter((x) => x.section === label).map((x) => x.key);
    assert.deepEqual({ ...body, generatedAt: undefined }, {
      schemaVersion: 1,
      date: key,
      title: siteDaily(),
      publishedAt: saved!.generated_at.toISOString(),
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
      lead: { title: `LEAD-${T}`, paragraph: `PARAGRAPH-${T}` },
      highlights: [entry(c, "C", true), entry(a, "A", true)],
      sections: [
        { label: first.section, categories: keys(first.section), items: [entry(a, "A", true), entry(b, "B", false)] },
        { label: last.section, categories: keys(last.section), items: [entry(c, "C", true)] },
      ],
      flashes: [entry(f, "F", true)],
      prev: before,
      next: after,
      ai: { leadTitle: true, leadParagraph: true },
      share: { title: `${siteDaily()} 11 月 3 日：LEAD-${T}`, imageUrl: `${config.siteUrl}/og/mp/dailies/${key}.png` },
      generatedAt: undefined,
    });
    assert.ok(body.sections[0]!.categories.includes(first.key) && body.sections[1]!.categories.includes(last.key), "each section names its categories");
    for (const text of [`W-TITLE-${T}`, `W-SUMMARY-${T}`, `W-SOURCE-${T}`, `W-ORIGINAL-${T}`, w, `missing-${T}`]) assert.ok(!res.body.includes(text), `the issue still carries ${text}`);
    for (const e of [...body.highlights, ...body.sections.flatMap((s) => s.items), ...body.flashes]) {
      assert.equal(e.ai.title, (await item(e.itemId)).ai.title, `${e.itemId}: the entry's mark is its item's own`);
    }
    sameFields(body, DAILY_FIELDS, "daily");
    sameFields(body.window, { start: true, end: true }, "daily.window");
    sameFields(body.lead!, { title: true, paragraph: true }, "daily.lead");
    sameFields(body.ai, DAILY_AI_FIELDS, "daily.ai");
    sameFields(body.share, SHARE_FIELDS, "daily.share");
    for (const s of body.sections) sameFields(s, DAILY_SECTION_FIELDS, "daily.sections[]");
    for (const e of [...body.highlights, ...body.sections.flatMap((s) => s.items), ...body.flashes]) {
      sameFields(e, DAILY_ENTRY_FIELDS, "daily entry");
      sameFields(e.source, { name: true }, "daily entry source");
      sameFields(e.ai, { title: true }, "daily entry ai");
    }
    const image = await get(new URL(body.share.imageUrl).pathname);
    assert.equal(image.statusCode, 200, "the share image is there");
    assert.match(String(image.headers["content-type"]), /^image\/png/);
    assert.deepEqual(pngSize(image.rawPayload), { width: 1000, height: 800 }, "5:4");
  });
});

test("daily: an issue without items answers 200 with no lead, sections or flashes", daily, async () => {
  const key = "2199-10-01";
  await withIssues([[key, emptyIssue(key)]], async () => {
    const body = (await get(`/api/mp/v1/dailies/${key}`)).body;
    const issue = JSON.parse(body) as MiniprogramDaily;
    assert.equal(issue.date, key);
    assert.equal(issue.lead, null);
    assert.deepEqual([issue.highlights, issue.sections, issue.flashes], [[], [], []]);
    assert.deepEqual(issue.ai, { leadTitle: false, leadParagraph: false });
    assert.equal(issue.share.title, `${siteDaily()} 10 月 1 日`);
    sameFields(issue, DAILY_FIELDS, "daily");
  });
});

test("daily: latest is the newest issue; latest is cached for a minute and a date for five, each with an ETag answering 304, strict about the query", daily, async () => {
  const [older, newest] = ["2199-12-30", "2199-12-31"];
  await withIssues([[older, emptyIssue(older)], [newest, emptyIssue(newest)]], async () => {
    assert.equal(MINIPROGRAM_CACHE_CONTROL.latestDaily, "public, max-age=60, s-maxage=60");
    assert.equal(MINIPROGRAM_CACHE_CONTROL.dailyByDate, "public, max-age=300, s-maxage=300");
    const cases: Array<[string, string, number, string]> = [
      ["/api/mp/v1/dailies/latest", MINIPROGRAM_CACHE_CONTROL.latestDaily, 60, newest],
      [`/api/mp/v1/dailies/${older}`, MINIPROGRAM_CACHE_CONTROL.dailyByDate, 300, older],
    ];
    for (const [url, cacheControl, seconds, date] of cases) {
      const res = await get(url, { cookie: `session=${T}` });
      assert.equal(res.statusCode, 200, url);
      const body = JSON.parse(res.body) as MiniprogramDaily;
      assert.equal(body.date, date, url);
      assert.equal(res.headers["cache-control"], cacheControl, url);
      const deadline = Number(String(res.headers["x-accel-expires"]).replace(/^@/, ""));
      assert.ok(Math.abs(deadline - (Date.now() / 1000 + seconds)) <= 5, `${url}: X-Accel-Expires ${res.headers["x-accel-expires"]}`);
      assert.equal(res.headers["set-cookie"], undefined, url);
      const again = await get(url, { "if-none-match": res.headers.etag as string });
      assert.equal(again.statusCode, 304, url);
      assert.equal(again.body, "", url);
      for (const bad of [`${url}?x=1`, `${url}?_=1760000000`]) await expectProblem(bad, 400, "invalid_request");
    }
    assert.equal(JSON.parse((await get(`/api/mp/v1/dailies/${older}`)).body).next, newest);
  });
});

test("daily: its 5:4 share image is a 1000×800 PNG for ten minutes with an ETag answering 304, labelled in the file when it shows a model's writing; a day without an issue has none", daily, async () => {
  const [key, empty] = ["2199-08-03", "2199-08-04"];
  const id = await selectedAt(Date.now(), { analysis: { origin: "model" } });
  const content = {
    date: key, lead: { title: `POSTER-LEAD-${T}`, leadParagraph: `POSTER-PARAGRAPH-${T}` }, highlights: [id],
    sections: [{ label: CATEGORIES[0]!.section, items: [{ itemId: id, title: `POSTER-${T}`, sourceName: "Test" }] }], flashes: [],
  };
  await withIssues([[key, content], [empty, emptyIssue(empty)]], async () => {
    for (const [date, ai] of [[key, true], [empty, false]] as const) {
      const issue = JSON.parse((await get(`/api/mp/v1/dailies/${date}`)).body) as MiniprogramDaily;
      assert.equal(issue.share.imageUrl, `${config.siteUrl}/og/mp/dailies/${date}.png`);
      const res = await expectShareImage(new URL(issue.share.imageUrl).pathname);
      assert.equal(pngText(res.rawPayload)[AI_LABEL_KEYWORD], ai ? "头条与条目标题由 AI 生成" : undefined, `${date}: an issue without items shows nothing a model wrote`);
    }
    await expectNoShareImage(`/og/mp/dailies/${key}`);
  });
  const missing = "2198-06-16";
  assert.equal((await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${missing}`).length, 0);
  for (const file of [`${missing}.png`, "2199-02-30.png", "latest.png", "2199-1-01.png"]) await expectNoShareImage(`/og/mp/dailies/${file}`);
});

test("daily: a malformed date is 400 invalid_request, never cached; a day without an issue is a cacheable 404", daily, async () => {
  for (const date of ["2199-1-01", "21991001", "2199-02-30", "2199-13-01", "latest2", "2199-10-01T00:00", "%20"]) {
    await expectProblem(`/api/mp/v1/dailies/${date}`, 400, "invalid_request");
  }
  const missing = "2198-06-15";
  assert.equal((await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${missing}`).length, 0);
  const url = `/api/mp/v1/dailies/${missing}`;
  const res = await get(url);
  assert.equal(res.statusCode, 404);
  assert.match(String(res.headers["content-type"]), /^application\/problem\+json/);
  assert.equal(res.headers["cache-control"], MINIPROGRAM_CACHE_CONTROL.notFound);
  assert.deepEqual([JSON.parse(res.body).status, JSON.parse(res.body).code], [404, "not_found"]);
  assert.equal((await get(url, { "if-none-match": res.headers.etag as string })).statusCode, 304);
});

test(`dailies follow the industry pack's daily column: ${FEATURES.reports ? "on, they answer" : "off, they are not registered and fall to the /api/mp 404"}`, async () => {
  const key = "2199-09-01";
  await withIssues([[key, emptyIssue(key)]], async () => {
    // The issue's share image too; where the column is off its address is not registered either.
    assert.equal((await get(`/og/mp/dailies/${key}.png`)).statusCode, FEATURES.reports ? 200 : 404);
    for (const url of ["/api/mp/v1/dailies/latest", `/api/mp/v1/dailies/${key}`]) {
      const res = await get(url);
      if (FEATURES.reports) {
        assert.equal(res.statusCode, 200, url);
        continue;
      }
      assert.equal(res.statusCode, 404, url);
      const problem = JSON.parse(res.body);
      assert.equal(problem.code, "not_found", url);
      assert.match(problem.detail, /No mini program operation exists/, `${url}: the fallback, not a missing issue`);
    }
  });
});
