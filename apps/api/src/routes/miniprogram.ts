// Mini program exit (/api/mp/v1/*), contract in @aihot/contracts/miniprogram. Read-only and anonymous:
// no cookies, no CORS (wx.request is not a browser), and kept out of /agent and the OpenAPI document.
// Every answer a proxy may keep (successes, 403, 404) carries an ETag, a lifetime from the mini program
// cache table and X-Accel-Expires; 400 and 503 are no-store. The code says miniprogram because `mp`
// already means WeChat official-account sources; only the path says mp. The mini program's 5:4 share
// images live with the site's share images under /og/mp/, and follow the rules here.
//
// One answer per address, for every reader: nothing here branches on who asks, the region, the time of
// day, the WeChat scene value or the mini program version, and no response varies with Referer or any
// other request header beyond the conditional request. The placeholder switch (整改开关) is the only
// state, read per request and the same for everyone at once. ADR 0002 keeps it for a rectification
// order and never for hiding the section from a review: WeChat's rules (5.19, 3.1) forbid showing groups
// of readers different content and hiding a category, so no such branch may be added here.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { MINIPROGRAM_CACHE_CONTROL } from "@aihot/contracts/http-policy";
import type { MiniprogramDaily } from "@aihot/contracts/miniprogram";
import { CATEGORY_LABELS, isCategoryKey } from "@aihot/contracts/taxonomy";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { FEATURES } from "@aihot/industry/features";
import { InvalidCursorError } from "@aihot/backend/lib/cursor";
import {
  loadMiniprogramDaily, loadMiniprogramFeed, loadMiniprogramItem, loadMiniprogramItemShare, loadMiniprogramMeta, loadMiniprogramStory, loadRectification,
  type MiniprogramItemShare,
} from "@aihot/backend/publication/miniprogram";
import { etagMatches, QueryError, sendJsonWithEtag, sendProblem, strictQuery, weakEtag, type ProblemInit } from "../http/respond.ts";
import { miniprogramShareEtag, renderMiniprogramShare, type DailyShareCard, type ItemShareCard, type MiniprogramShareCard } from "../og/miniprogram.ts";

type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

/** Lets a proxy in front keep the answer as long as its shared lifetime (an absolute deadline, as the site API sends). */
function proxyExpires(reply: FastifyReply, cacheControl: string) {
  const seconds = Number(/s-maxage=(\d+)/.exec(cacheControl)?.[1] ?? 0);
  reply.header("X-Accel-Expires", `@${Math.floor(Date.now() / 1000) + seconds}`);
}

/**
 * The feed's lifetime: the table's, cut short at the next release in scope (the site timeline's rule),
 * so neither a proxy nor the mini program keeps a page past the moment a new card appears.
 */
function feedCacheControl(refreshAt: string | null, now: number): string {
  const table = MINIPROGRAM_CACHE_CONTROL.feed;
  if (!refreshAt) return table;
  const left = Math.max(0, Math.floor((Date.parse(refreshAt) - now) / 1000));
  return left >= Number(/max-age=(\d+)/.exec(table)![1]) ? table : `public, max-age=${left}, s-maxage=${left}`;
}

/** A cacheable Problem: the ETag stands for the problem, not the per-request requestId. */
function sendCachedProblem(req: FastifyRequest, reply: FastifyReply, p: ProblemInit & { cacheControl: string }) {
  const etag = weakEtag("miniprogram-problem", JSON.stringify({ status: p.status, code: p.code, detail: p.detail }));
  reply.header("ETag", etag);
  proxyExpires(reply, p.cacheControl);
  if (etagMatches(req.headers["if-none-match"], etag)) return reply.code(304).header("Cache-Control", p.cacheControl).send();
  return sendProblem(req, reply, p);
}

/** YYYY-MM-DD naming a day that exists (2026-02-30 does not). */
function isCalendarDate(value: string): boolean {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  return day !== null && !Number.isNaN(day.getTime()) && day.toISOString().slice(0, 10) === value;
}

const META = "/api/mp/v1/meta";
const FALLBACK = "/api/mp/*";
/** The mini program's 5:4 share images, beside the site's share images. */
const SHARE_IMAGES = "/og/mp/";

/**
 * Routes the placeholder switch closes: every route registered under /api/mp/, by whichever module and
 * with whatever method, except meta (it carries the status and the placeholder text) and the 404 fallback
 * (a path that does not exist stays 404); and every 5:4 share image under /og/mp/. The site's own share
 * images stay.
 */
const closedByPlaceholder = (route: string | undefined) =>
  route !== undefined && ((route.startsWith("/api/mp/") && route !== FALLBACK && route !== META) || route.startsWith(SHARE_IMAGES));

/** A share image's 404: the same cacheable Problem for a missing, withdrawn or malformed one. */
function shareImageNotFound(req: FastifyRequest, reply: FastifyReply) {
  return sendCachedProblem(req, reply, {
    status: 404, code: "not_found", title: "Not found", detail: "No share image exists at this address.", cacheControl: MINIPROGRAM_CACHE_CONTROL.notFound,
  });
}

/**
 * A 5:4 share image: ten minutes (the table's), with an ETag that answers 304 before anything is drawn.
 * When drawing fails the handler answers 503, and the mini program shows its bundled image instead.
 */
async function sendShareImage(req: FastifyRequest, reply: FastifyReply, prefix: string, card: MiniprogramShareCard) {
  const etag = `"${prefix}-${miniprogramShareEtag(card)}"`;
  const cacheControl = MINIPROGRAM_CACHE_CONTROL.shareImage;
  const headers = () => {
    reply.header("ETag", etag).header("Cache-Control", cacheControl);
    proxyExpires(reply, cacheControl);
  };
  if (etagMatches(req.headers["if-none-match"], etag)) {
    headers();
    return reply.code(304).send();
  }
  const { png } = await renderMiniprogramShare(card);
  headers();
  return reply.type("image/png").send(png);
}

/** The date under the source, as the item page writes it: MM-DD this year, YYYY-MM-DD before. */
function shareDate(instant: string, now: Date): string {
  const date = beijingDate(instant);
  return date.slice(0, 4) === beijingDate(now).slice(0, 4) ? date.slice(5) : date;
}

/** An item's card: the item page's category, title, source, publication date, source count and title mark. */
function itemShareCard(d: MiniprogramItemShare, now: Date): ItemShareCard {
  return {
    kind: "item",
    // An older row can carry a category the current taxonomy no longer has.
    category: (d.category && CATEGORY_LABELS[d.category]) || null,
    title: d.title,
    source: d.source.name.replace(/（[^）]*）\s*$/, ""),
    date: shareDate(d.publishedAt, now),
    sourceCount: d.sourceCount,
    ai: d.ai,
  };
}

/**
 * An issue's card. The headline is the lead, else the first listed item (as the share title has it); the
 * points are the first three highlights, else the first listed items, without the headline's. The readings
 * are the daily page's: flashes make the last section and count among the items.
 */
function dailyShareCard(d: MiniprogramDaily): DailyShareCard {
  const listed = d.sections.flatMap((s) => s.items);
  const top = d.lead ? null : listed[0] ?? null;
  const points = (d.highlights.length ? d.highlights : listed).filter((e) => e.itemId !== top?.itemId).slice(0, 3);
  return {
    kind: "daily",
    name: d.title,
    date: d.date,
    headline: d.lead?.title ?? top?.title ?? null,
    points: points.map((e) => e.title),
    sections: d.sections.length + (d.flashes.length ? 1 : 0),
    items: listed.length + d.flashes.length,
    publishedAt: beijingTime(d.window.end),
    ai: d.ai.leadTitle || [...(top ? [top] : []), ...points].some((e) => e.ai.title),
  };
}

function miniprogramHandler(fn: Handler): Handler {
  return async (req, reply) => {
    try {
      return await fn(req, reply);
    } catch (error) {
      if (error instanceof QueryError) return sendProblem(req, reply, { status: 400, code: "invalid_request", title: "Invalid request", detail: error.message });
      if (error instanceof InvalidCursorError) return sendProblem(req, reply, { status: 400, code: "invalid_cursor", title: "Invalid cursor", detail: "The cursor is malformed or belongs to another query; start again from the first page." });
      req.log.error({ err: error, path: req.url.split("?")[0] }, "miniprogram api error");
      return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "The service is temporarily unavailable; retry later.", retryAfter: 30 });
    }
  };
}

export function registerMiniprogram(app: FastifyInstance) {
  // The switch is checked on the matched route before anything else (query, body), in one app-wide hook,
  // so an operation added later is closed with the rest without checking for itself.
  app.addHook("onRequest", async (req, reply) => {
    if (!closedByPlaceholder(req.routeOptions.url)) return;
    if ((await loadRectification()).status !== "placeholder") return;
    const paused = { status: 403, code: "section_paused", title: "Section paused", detail: "This section is paused; meta carries the placeholder." };
    // Reads are cached like any other answer under the switch; a write (a reminder) is never cached, so no ETag either.
    if (req.method !== "GET" && req.method !== "HEAD") return sendProblem(req, reply, paused);
    return sendCachedProblem(req, reply, { ...paused, cacheControl: MINIPROGRAM_CACHE_CONTROL.paused });
  });

  app.get(META, miniprogramHandler(async (req, reply) => {
    strictQuery(req, []);
    const body = await loadMiniprogramMeta();
    const { generatedAt: _, ...content } = body;
    const cacheControl = MINIPROGRAM_CACHE_CONTROL.meta;
    proxyExpires(reply, cacheControl);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: "miniprogram-meta", cacheControl, etagOf: content });
  }));

  app.get("/api/mp/v1/feed", miniprogramHandler(async (req, reply) => {
    const q = strictQuery(req, ["category", "cursor", "limit"]);
    const limit = q.limit === undefined ? 20 : Number(q.limit);
    if (q.limit !== undefined && (!/^\d+$/.test(q.limit) || limit < 1 || limit > 40)) throw new QueryError("limit must be an integer from 1 to 40.");
    const category = q.category ?? null;
    if (category !== null && !isCategoryKey(category)) throw new QueryError(`Unknown category: ${category}.`);
    if (q.cursor === "") throw new InvalidCursorError("empty cursor");
    const body = await loadMiniprogramFeed({ category, cursor: q.cursor ?? null, limit });
    const { generatedAt: _, ...content } = body;
    const cacheControl = feedCacheControl(body.refreshAt, Date.parse(body.generatedAt));
    proxyExpires(reply, cacheControl);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: "miniprogram-feed", cacheControl, etagOf: content });
  }));

  // An item without a page (withdrawn, blocked, unsummarised, hot_signal), a missing one and a malformed
  // id are the same cacheable 404, so an id reveals nothing about what was taken down.
  app.get("/api/mp/v1/items/:id", miniprogramHandler(async (req, reply) => {
    strictQuery(req, []);
    const id = (req.params as { id: string }).id;
    const body = /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? await loadMiniprogramItem(id) : null;
    if (!body) {
      return sendCachedProblem(req, reply, {
        status: 404, code: "not_found", title: "Not found", detail: "The item does not exist or is no longer available.", cacheControl: MINIPROGRAM_CACHE_CONTROL.notFound,
      });
    }
    const { generatedAt: _, ...content } = body;
    const cacheControl = MINIPROGRAM_CACHE_CONTROL.item;
    proxyExpires(reply, cacheControl);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: "miniprogram-item", cacheControl, etagOf: content });
  }));

  // A merged story answers as the story it was merged into, under its id: the mini program follows no
  // redirect (the site's and v1's 308 stay). A story with nothing to list, a missing one and a malformed
  // id are the same cacheable 404.
  app.get("/api/mp/v1/stories/:id", miniprogramHandler(async (req, reply) => {
    strictQuery(req, []);
    const body = await loadMiniprogramStory((req.params as { id: string }).id);
    if (!body) {
      return sendCachedProblem(req, reply, {
        status: 404, code: "not_found", title: "Not found", detail: "The story does not exist or is no longer available.", cacheControl: MINIPROGRAM_CACHE_CONTROL.notFound,
      });
    }
    const { generatedAt: _, ...content } = body;
    const cacheControl = MINIPROGRAM_CACHE_CONTROL.story;
    proxyExpires(reply, cacheControl);
    return sendJsonWithEtag(req, reply, body, { etagPrefix: "miniprogram-story", cacheControl, etagOf: content });
  }));

  // The daily exists only where the industry pack turns its column on; elsewhere these paths fall
  // through to the 404 below, and meta's columns.daily already says so.
  if (FEATURES.reports) {
    const daily = async (req: FastifyRequest, reply: FastifyReply, date: string, cacheControl: string) => {
      const body = await loadMiniprogramDaily(date);
      if (!body) {
        return sendCachedProblem(req, reply, {
          status: 404, code: "not_found", title: "Not found", detail: date === "latest" ? "No daily has been published yet." : `No daily was published for ${date}.`,
          cacheControl: MINIPROGRAM_CACHE_CONTROL.notFound,
        });
      }
      const { generatedAt: _, ...content } = body;
      proxyExpires(reply, cacheControl);
      return sendJsonWithEtag(req, reply, body, { etagPrefix: "miniprogram-daily", cacheControl, etagOf: content });
    };
    app.get("/api/mp/v1/dailies/latest", miniprogramHandler(async (req, reply) => {
      strictQuery(req, []);
      return daily(req, reply, "latest", MINIPROGRAM_CACHE_CONTROL.latestDaily);
    }));
    app.get("/api/mp/v1/dailies/:date", miniprogramHandler(async (req, reply) => {
      strictQuery(req, []);
      const date = (req.params as { date: string }).date;
      if (!isCalendarDate(date)) throw new QueryError("date must be a calendar date written YYYY-MM-DD.");
      return daily(req, reply, date, MINIPROGRAM_CACHE_CONTROL.dailyByDate);
    }));
  }

  // The 5:4 share images, at the addresses share.imageUrl gives: an item's while it has a page (the site's
  // item page rule), an issue's where the industry pack has a daily.
  app.get(`${SHARE_IMAGES}items/:file`, miniprogramHandler(async (req, reply) => {
    const file = (req.params as { file: string }).file;
    const id = file.endsWith(".png") ? file.slice(0, -4) : "";
    const d = /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? await loadMiniprogramItemShare(id) : null;
    if (!d) return shareImageNotFound(req, reply);
    return sendShareImage(req, reply, "mp-item", itemShareCard(d, new Date()));
  }));
  if (FEATURES.reports) {
    app.get(`${SHARE_IMAGES}dailies/:file`, miniprogramHandler(async (req, reply) => {
      const file = (req.params as { file: string }).file;
      const date = file.endsWith(".png") ? file.slice(0, -4) : "";
      const d = isCalendarDate(date) ? await loadMiniprogramDaily(date) : null;
      if (!d) return shareImageNotFound(req, reply);
      return sendShareImage(req, reply, "mp-daily", dailyShareCard(d));
    }));
  }

  // Any other path under /api/mp, and any other method on a read-only path: a cacheable 404, never a 405.
  const notFound: Handler = async (req, reply) => {
    const path = (req.raw.url ?? "").split("?")[0];
    return sendCachedProblem(req, reply, {
      status: 404, code: "not_found", title: "Not found", detail: `No mini program operation exists at ${path}.`, cacheControl: MINIPROGRAM_CACHE_CONTROL.notFound,
    });
  };
  for (const url of ["/api/mp", FALLBACK]) app.route({ method: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], url, handler: notFound });
}
