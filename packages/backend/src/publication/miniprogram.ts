// The mini program exit's projection (/api/mp/v1, contract in @aihot/contracts/miniprogram). It only
// reshapes what this layer already decides: visibility and the release gate stay with the conditions it
// reuses. The code says miniprogram because `mp` already means WeChat official-account sources.
import { BOARD, SITE, siteDaily } from "@aihot/industry/site";
import { FEATURES } from "@aihot/industry/features";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import type { TimelineCard } from "@aihot/contracts/site";
import type {
  MiniprogramCard, MiniprogramDaily, MiniprogramDailyEntry, MiniprogramFeed, MiniprogramFocus, MiniprogramItem, MiniprogramMeta, MiniprogramReadings,
  MiniprogramStory,
} from "@aihot/contracts/miniprogram";
import type { CategoryKey } from "@aihot/contracts/taxonomy";
import { beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { config } from "../config.ts";
import { toRichText } from "../content/rich-text.ts";
import { sql } from "../db.ts";
import { latestHotRanking } from "../events/hot-read.ts";
import { loadItemDetail } from "./detail.ts";
import { selectedCondition } from "./items.ts";
import { siteUrl } from "./links.ts";
import { neighbors } from "./reports.ts";
import { hasItemPage, storyTitleByModel, writtenByModel } from "./rules.ts";
import { resolveStory, storyContent } from "./stories.ts";
import { groupCards, loadTimeline, READING_GROUP_KEY, type GroupRow } from "./timeline.ts";

/** The placeholder switch (整改开关), kept in `settings` under this key; no row means normal. */
export const RECTIFICATION_KEY = "miniprogram.rectification";

/** The switch's state and its last change: who (the audit actor), when and why. */
export interface Rectification {
  status: MiniprogramMeta["status"];
  reason: string | null;
  changedBy: string | null;
  changedAt: string | null;
}

/** How long a process keeps the switch it read: at most five seconds, so a change needs no restart. */
const RECTIFICATION_TTL_MS = 5_000;
let rectificationCache: { at: number; value: Rectification } | null = null;

/**
 * The switch as stored, read when a request needs it and kept by this process for up to five seconds
 * (`fresh` skips that, for the admin). Anything but "placeholder" reads as normal.
 */
export async function loadRectification(opts: { fresh?: boolean } = {}): Promise<Rectification> {
  if (!opts.fresh && rectificationCache && Date.now() - rectificationCache.at < RECTIFICATION_TTL_MS) return rectificationCache.value;
  const [row] = await sql<{ value: Partial<Rectification> }[]>`SELECT value FROM settings WHERE key = ${RECTIFICATION_KEY}`;
  const v = row?.value ?? {};
  const value: Rectification = {
    status: v.status === "placeholder" ? "placeholder" : "normal", reason: v.reason ?? null, changedBy: v.changedBy ?? null, changedAt: v.changedAt ?? null,
  };
  rectificationCache = { at: Date.now(), value };
  return value;
}

/** Drops this process's copy, so the switch that was just written applies to the next request here. */
export function forgetRectification() {
  rectificationCache = null;
}

/** Under the placeholder switch meta still answers, with the status and the industry pack's placeholder text. */
export async function loadMiniprogramMeta(now = new Date()): Promise<MiniprogramMeta> {
  const [rectification, readings] = await Promise.all([loadRectification(), loadReadings(now)]);
  return {
    schemaVersion: 1,
    board: { key: BOARD.key, name: BOARD.name, siteName: SITE.name, description: BOARD.description },
    status: rectification.status,
    placeholder: BOARD.placeholder,
    columns: { feed: true, stories: true, daily: FEATURES.reports },
    categories: CATEGORIES.map(({ key, label }) => ({ key, label })),
    notice: BOARD.notice,
    readings,
    generatedAt: now.toISOString(),
  };
}

/**
 * The header's figures for the Beijing calendar day (the site stats count a rolling 24 hours instead).
 * Cards are the home timeline's reading groups: a group's anchor is its members' latest sort_at, and
 * it counts when that anchor falls between midnight and now. Members before midnight cannot be a
 * counted group's latest, so the scan starts there.
 */
async function loadReadings(now: Date): Promise<MiniprogramReadings> {
  const date = beijingDate(now);
  const [groups, [released], [sources]] = await Promise.all([
    todayGroups(now),
    sql<{ t: Date | null }[]>`SELECT max(p.visible_after) AS t FROM publications p WHERE ${selectedCondition(now)}`,
    sql<{ n: number }[]>`SELECT count(*)::int AS n FROM sources WHERE enabled AND participation_mode = 'editorial'`,
  ]);
  return {
    date,
    cards: groups.length,
    stories: groups.filter((g) => g.gk.startsWith("s")).length,
    sources: sources!.n,
    times: groups.map((g) => g.anchor_at.toISOString()),
    updatedAt: released?.t ? released.t.toISOString() : null,
  };
}

/** Today's cards (Beijing day): the reading groups whose anchor falls between midnight and now, earliest first. */
function todayGroups(now: Date): Promise<GroupRow[]> {
  return sql<GroupRow[]>`
    SELECT ${READING_GROUP_KEY} AS gk, max(p.sort_at) AS anchor_at FROM publications p
    WHERE ${selectedCondition(now)} AND p.sort_at >= ${beijingMidnight(beijingDate(now))}
    GROUP BY gk HAVING max(p.sort_at) <= ${now} ORDER BY anchor_at, gk`;
}

/** The item page's source count: distinct sources in the item's fact over the public pool, unfiltered; 0 outside a fact. */
function factSourceCount(now: Date) {
  return sql`(SELECT count(DISTINCT o.source_id)::int FROM publications o
    WHERE o.fact_id = p.fact_id AND o.visibility = 'public' AND o.eligible AND (NOT o.selected OR o.visible_after <= ${now}))`;
}

/**
 * The sources of the reports a story page lists (public, in the pool, released) under the given facts,
 * earliest first report first, with each source's first and latest report.
 */
function reportSources(facts: ReturnType<typeof sql>, now: Date) {
  return sql<{ id: string; name: string; first_at: Date; latest_at: Date }[]>`
    SELECT s.id, s.name, min(coalesce(p.published_at, p.discovered_at)) AS first_at, max(coalesce(p.published_at, p.discovered_at)) AS latest_at
    FROM publications p JOIN sources s ON s.id = p.source_id
    WHERE p.article_id IN (SELECT fa.article_id FROM fact_articles fa JOIN facts f ON f.id = fa.fact_id WHERE ${facts})
      AND p.visibility = 'public' AND p.eligible AND (NOT p.selected OR p.visible_after <= ${now})
    GROUP BY s.id, s.name ORDER BY first_at, s.id`;
}

/** Timeline cards in the fields a mini program card shows. */
async function toCards(timelineCards: TimelineCard[], now: Date): Promise<MiniprogramCard[]> {
  const ids = timelineCards.map((c) => c.item.id);
  const facts = new Map(ids.length ? (await sql<{ id: string; discovered_at: Date; story_id: string | null; analysis_origin: string | null; sources: number }[]>`
    SELECT p.article_id AS id, p.discovered_at, st.public_id::text AS story_id, an.origin AS analysis_origin, ${factSourceCount(now)} AS sources
    FROM publications p
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    LEFT JOIN analyses an ON an.id = p.analysis_id
    WHERE p.article_id IN ${sql(ids)}`).map((r) => [r.id, r]) : []);
  return timelineCards.flatMap(({ anchorAt, item }) => {
    const f = facts.get(item.id);
    if (!f) return [];
    // A model-written draft stays marked after an editor corrects it: the analysis behind the publication decides (rules.ts).
    const ai = writtenByModel(f.analysis_origin);
    return [{
      id: item.id,
      title: item.title,
      summary: item.summary ?? "",
      category: item.category,
      source: { name: item.source.name },
      anchorAt,
      publishedAt: item.publishedAt ?? f.discovered_at.toISOString(),
      sourceCount: Math.max(1, f.sources),
      storyId: f.story_id,
      ai: { title: ai, summary: ai },
    }];
  });
}

/**
 * Today's focus card (D16, as recommended until the owner decides): the card of the latest hot
 * ranking's first story when that story has a card today, else today's card with the highest score (a
 * tie goes to the newer card); none on a day without cards. The ranking only picks the card: no rank or
 * heat value leaves this function. The card stays in the timeline too; the mini program drops it there.
 */
async function loadFocus(now: Date): Promise<MiniprogramFocus | null> {
  const [today, ranking] = await Promise.all([todayGroups(now), latestHotRanking()]);
  if (today.length === 0) return null;
  const scope = { channel: "all", category: null, tag: null, topic: null } as const;
  const first = ranking?.entries.length ? ranking.entries.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
  const hot = first ? today.find((g) => g.gk === `s${first.storyId}`) : undefined;
  let chosen = hot ? (await groupCards(scope, now, [hot]))[0] : undefined;
  if (!chosen) {
    const cards = await groupCards(scope, now, today);
    chosen = cards.sort((a, b) => (b.item.score ?? -1) - (a.item.score ?? -1) || Date.parse(b.anchorAt) - Date.parse(a.anchorAt))[0];
  }
  if (!chosen) return null;
  const [card] = await toCards([chosen], now);
  if (!card) return null;
  // Who reports it: the story's sources, else the fact's, else the item's own.
  const gk = chosen.key;
  const sources = gk.startsWith("s") ? await reportSources(sql`f.story_id = ${Number(gk.slice(1))}`, now)
    : gk.startsWith("f") ? await reportSources(sql`f.id = ${Number(gk.slice(1))}`, now)
    : [];
  return {
    ...card,
    sourceNames: sources.length ? sources.map((s) => s.name) : [card.source.name],
    latestAt: sources.length ? new Date(Math.max(...sources.map((s) => s.latest_at.getTime()))).toISOString() : card.publishedAt,
  };
}

export interface MiniprogramFeedQuery {
  category: CategoryKey | null;
  cursor: string | null;
  limit: number;
}

/**
 * The feed is the site's home timeline (its reading groups, representatives, cursor and release gate)
 * with the fields a card shows. It reads at an explicit `now`, which skips the timeline's five-second
 * grouping cache: a cache that ends at refreshAt refetches an answer that already holds the released card.
 */
export async function loadMiniprogramFeed(q: MiniprogramFeedQuery, now = new Date()): Promise<MiniprogramFeed> {
  const [timeline, focus] = await Promise.all([
    loadTimeline({ channel: "all", category: q.category, tag: null, topic: null, cursor: q.cursor, limit: q.limit, now }),
    // The focus card belongs to the top of the unfiltered feed only.
    q.cursor === null && q.category === null ? loadFocus(now) : null,
  ]);
  return {
    schemaVersion: 1,
    query: { category: q.category },
    focus,
    cards: await toCards(timeline.cards, now),
    page: { nextCursor: timeline.nextCursor, hasMore: timeline.nextCursor !== null },
    refreshAt: timeline.refreshAt,
    generatedAt: now.toISOString(),
  };
}

/**
 * An item page: the site's item detail (its page rule and reading mode) with the fields the mini
 * program shows. Null when the item has no page. Under summary-only there is no reason, no source
 * count and no story, as on the site. The body is the one the site shows first (the Chinese
 * translation over a foreign original), in rich-text tags with absolute image addresses.
 */
export async function loadMiniprogramItem(id: string, now = new Date()): Promise<MiniprogramItem | null> {
  const result = await loadItemDetail(id, now);
  if (result.kind === "not_found") return null;
  const { detail, row } = result;
  const [marks] = await sql<{ analysis_origin: string | null; translation_origin: string | null; story_origin: string | null; sources: number }[]>`
    SELECT an.origin AS analysis_origin, tr.origin AS translation_origin, st.origin AS story_origin, ${factSourceCount(now)} AS sources
    FROM publications p
    JOIN articles a ON a.id = p.article_id
    LEFT JOIN analyses an ON an.id = p.analysis_id
    LEFT JOIN translations tr ON tr.article_id = p.article_id AND tr.lang = 'zh' AND tr.revision >= a.revision
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    WHERE p.article_id = ${id}`;
  if (!marks) return null;
  const summaryOnly = detail.readingMode === "summary-only";
  // The reading mode: a licensed, confirmed body (body_mode) that no editor reduced to its summary.
  const body = !summaryOnly && row.body_mode === "full" ? detail.body : null;
  const shown = body ? body.zh ?? body.original : null;
  const translated = body?.zhKind === "translation";
  let story: MiniprogramItem["story"] = null;
  if (!summaryOnly && row.story_id !== null && row.story_public_id) {
    const sources = await reportSources(sql`f.story_id = ${row.story_id}`, now);
    story = {
      id: row.story_public_id,
      title: row.story_title ?? "",
      sourceCount: Math.max(1, sources.length),
      otherSourceNames: sources.filter((s) => s.id !== row.source_id).slice(0, 3).map((s) => s.name),
      ai: { title: storyTitleByModel(marks.story_origin) },
    };
  }
  // A model-written draft stays marked after an editor corrects it: the analysis behind the publication decides.
  const ai = writtenByModel(marks.analysis_origin);
  return {
    schemaVersion: 1,
    id: detail.id,
    title: detail.title,
    summary: detail.summary ?? "",
    category: detail.category,
    source: { name: detail.source.name },
    publishedAt: detail.publishedAt ?? detail.discoveredAt,
    reason: detail.reason,
    sourceCount: summaryOnly ? null : Math.max(1, marks.sources),
    originalUrl: detail.links.original,
    fullText: { allowed: body !== null, html: shown ? toRichText(shown, config.siteUrl) : null, translated, complete: body?.complete ?? false },
    story,
    ai: { title: ai, summary: ai, reason: ai && detail.reason !== null, body: translated && writtenByModel(marks.translation_origin) },
    share: { title: detail.title, imageUrl: siteUrl(`/og/mp/items/${detail.id}.png`) },
    generatedAt: now.toISOString(),
  };
}

/** What an item's 5:4 share image shows. */
export interface MiniprogramItemShare {
  id: string;
  title: string;
  category: CategoryKey | null;
  source: { name: string };
  publishedAt: string;
  /** The item page's: null under summary-only. */
  sourceCount: number | null;
  /** The item page's title mark. */
  ai: boolean;
}

/**
 * An item page's title, category, source, publication time, source count and title mark, for its 5:4
 * share image: the same page rule (rules.hasItemPage) and values as loadMiniprogramItem, without loading
 * the body. Null when the item has no page.
 */
export async function loadMiniprogramItemShare(id: string, now = new Date()): Promise<MiniprogramItemShare | null> {
  const [row] = await sql<{
    id: string; title: string; category: CategoryKey | null; visibility: string; eligible: boolean; published_at: Date | null; discovered_at: Date;
    source_name: string; analysis_origin: string | null; sources: number;
  }[]>`
    SELECT p.article_id AS id, p.title, p.category, p.visibility, p.eligible, p.published_at, p.discovered_at, s.name AS source_name,
      an.origin AS analysis_origin, ${factSourceCount(now)} AS sources
    FROM publications p
    JOIN sources s ON s.id = p.source_id
    LEFT JOIN analyses an ON an.id = p.analysis_id
    WHERE p.article_id = ${id}`;
  if (!row || !hasItemPage(row)) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    source: { name: row.source_name },
    publishedAt: (row.published_at ?? row.discovered_at).toISOString(),
    sourceCount: row.visibility === "summary-only" ? null : Math.max(1, row.sources),
    ai: writtenByModel(row.analysis_origin),
  };
}

/** Each item's title mark: its analysis is a model's draft (an editor's later correction included). */
async function titleMarks(ids: string[]): Promise<Map<string, boolean>> {
  if (ids.length === 0) return new Map();
  const rows = await sql<{ id: string; analysis_origin: string | null }[]>`
    SELECT p.article_id AS id, an.origin AS analysis_origin FROM publications p LEFT JOIN analyses an ON an.id = p.analysis_id
    WHERE p.article_id IN ${sql(ids)}`;
  return new Map(rows.map((r) => [r.id, writtenByModel(r.analysis_origin)]));
}

/** The story page lists at most this many reports: the earliest one and the latest 99. */
const STORY_REPORTS = 100;

/**
 * A story page: the site's story content (the same digest, counts, times and listed reports: public,
 * in the pool, released) with the fields the mini program shows. A merged story answers as the story it
 * was merged into, under that story's id, never as a redirect. Null for a malformed or unknown id and
 * for a story with no report to list.
 */
export async function loadMiniprogramStory(publicId: string, now = new Date()): Promise<MiniprogramStory | null> {
  const found = await resolveStory(publicId);
  const live = found.kind === "merged" ? await resolveStory(found.target) : found;
  if (live.kind !== "found") return null;
  const content = await storyContent(live.storyId, now);
  if (!content) return null;
  const { s, reports } = content;
  // The site lists newest first; the mini program reads the story from its first report on.
  const earliestFirst = [...reports].reverse();
  const listed = earliestFirst.length > STORY_REPORTS ? [earliestFirst[0]!, ...earliestFirst.slice(1 - STORY_REPORTS)] : earliestFirst;
  const marks = await titleMarks(listed.map((r) => r.id));
  const digest = s.digest || s.summary || null;
  return {
    schemaVersion: 1,
    id: s.public_id,
    title: s.title,
    digest,
    sourceCount: new Set(reports.map((r) => r.source_id)).size,
    reportCount: reports.length,
    firstReportAt: (s.first_report_at ?? earliestFirst[0]!.at).toISOString(),
    latestAt: (s.latest_at ?? reports[0]!.at).toISOString(),
    // A listed report is public and in the pool, which is the item page rule: none is without a page today.
    reports: listed.map((r) => ({ itemId: r.id, title: r.title, source: { name: r.source_name }, publishedAt: r.at.toISOString(), ai: { title: marks.get(r.id) === true } })),
    // An editor's correction (manual) of a model's story title stays marked; a digest or summary is always a model's.
    ai: { title: ["model", "replay", "manual"].includes(s.origin), digest: digest !== null },
    generatedAt: now.toISOString(),
  };
}

const DAILY_HIGHLIGHTS = 6;
const SECTION_ITEMS = 8;
const DAILY_FLASHES = 12;

/**
 * An issue of the daily, the latest or a Beijing date's; null when there is none. Only items that
 * still have a public page are listed (a withdrawn, reduced or since-removed item leaves every field:
 * title, source and all), so a section left empty goes too. The lead stays as written (D31). Section
 * names come from the industry pack and its categories say which keys each one stands for.
 */
export async function loadMiniprogramDaily(date: string, now = new Date()): Promise<MiniprogramDaily | null> {
  type Row = { key: string; window_start: Date; window_end: Date; content: Record<string, any>; generated_at: Date };
  const [r] = date === "latest"
    ? await sql<Row[]>`SELECT key, window_start, window_end, content, generated_at FROM reports WHERE kind = 'daily' ORDER BY key DESC LIMIT 1`
    : await sql<Row[]>`SELECT key, window_start, window_end, content, generated_at FROM reports WHERE kind = 'daily' AND key = ${date}`;
  if (!r) return null;
  const c = r.content;
  const rawSections: Array<{ label: string; items: Array<Record<string, any>> }> = (c.sections ?? []).map((s: any) => ({ label: String(s.label), items: s.items ?? [] }));
  const rawFlashes: Array<Record<string, any>> = c.flashes ?? [];
  const ids = [...new Set([...rawSections.flatMap((s) => s.items), ...rawFlashes].map((i) => i.itemId).filter((id): id is string => typeof id === "string" && id !== ""))];
  // Readable: the reports' own rule (public and in the pool); its title mark is the item's own.
  const readable = new Map(ids.length ? (await sql<{ id: string; analysis_origin: string | null }[]>`
    SELECT p.article_id AS id, an.origin AS analysis_origin FROM publications p LEFT JOIN analyses an ON an.id = p.analysis_id
    WHERE p.article_id IN ${sql(ids)} AND p.visibility = 'public' AND p.eligible`).map((x) => [x.id, writtenByModel(x.analysis_origin)]) : []);
  const entries = (raw: Array<Record<string, any>>): MiniprogramDailyEntry[] => raw.flatMap((i) => readable.has(i.itemId)
    ? [{ itemId: String(i.itemId), title: String(i.title ?? ""), source: { name: String(i.sourceName ?? i.source?.name ?? "") }, ai: { title: readable.get(i.itemId)! } }]
    : []);

  const sections = rawSections
    .map((s) => ({ label: s.label, categories: CATEGORIES.filter((x) => x.section === s.label).map((x) => x.key), items: entries(s.items).slice(0, SECTION_ITEMS) }))
    .filter((s) => s.items.length > 0);
  const listed = sections.flatMap((s) => s.items);
  // The editors' picks among the sections; without any, the first items (as the site's daily page has it).
  const picks: string[] = Array.isArray(c.highlights) ? c.highlights : [];
  const highlights = (picks.length ? picks.map((id) => listed.find((e) => e.itemId === id)).filter((e): e is MiniprogramDailyEntry => !!e) : listed.slice(0, 3))
    .slice(0, DAILY_HIGHLIGHTS);
  const lead = c.lead?.title ? { title: String(c.lead.title), paragraph: String(c.lead.leadParagraph ?? "") } : null;
  const { prev, next } = await neighbors("daily", r.key);
  const title = siteDaily();
  const [, month, day] = r.key.split("-");
  const headline = lead?.title ?? listed[0]?.title ?? null;
  return {
    schemaVersion: 1,
    date: r.key,
    title,
    publishedAt: r.generated_at.toISOString(),
    window: { start: r.window_start.toISOString(), end: r.window_end.toISOString() },
    lead,
    highlights,
    sections,
    flashes: entries(rawFlashes).slice(0, DAILY_FLASHES),
    prev,
    next,
    // A lead is a model's draft whoever saved it last (imported, manual); the section names are the pack's.
    ai: { leadTitle: lead !== null, leadParagraph: !!lead?.paragraph },
    share: { title: `${title} ${Number(month)} 月 ${Number(day)} 日${headline ? `：${headline}` : ""}`, imageUrl: siteUrl(`/og/mp/dailies/${r.key}.png`) },
    generatedAt: now.toISOString(),
  };
}
