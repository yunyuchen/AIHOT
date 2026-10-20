// Rows the invariant tests plant: a source, materials, analyses, translations, stories with their
// facts and reports, and a saved daily report. `seeds(T, sourceId)` binds a test file's unique tag
// and source, so every row it plants carries that tag and the file's assertions stay "contains mine"
// against the shared, never-emptied test database. Categories come from the industry pack, never
// from a hard-coded key, so the helpers work under any pack.
import "./setup.ts"; // first: the environment the backend modules read at import
import { randomUUID } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { upsertMaterial, type MaterialInput } from "@aihot/backend/content/materials";
import { publishArticle, type PublishOptions } from "@aihot/backend/publication/publish";
import { CATEGORIES } from "@aihot/industry/taxonomy";

/** Who wrote an analysis (the `analyses.origin` check). */
export type AnalysisOrigin = "model" | "replay" | "rule";
/** Who wrote a translation (the `translations.origin` check). */
export type TranslationOrigin = "model" | "replay" | "source";
/** Who created a story (the `stories.origin` check). */
export type StoryOrigin = "model" | "replay" | "manual";
/** Who wrote a report (the `reports.origin` check). */
export type ReportOrigin = "model" | "imported" | "manual";

/** The pack's first category: the default for every planted analysis. */
export const DEFAULT_CATEGORY: string = CATEGORIES[0].key;

/** Publish options that release an item `msAgo` in the past, past the release gate. */
export const released = (msAgo = 60_000): PublishOptions => ({ releasedAt: new Date(Date.now() - msAgo) });

export interface SeedSourceOptions {
  name?: string;
  kind?: string;
  tier?: string;
  participationMode?: "editorial" | "hot_signal" | "isolated";
  siteFulltext?: boolean;
  syndicateFulltext?: boolean;
}

export interface SeedArticleOptions extends Partial<Omit<MaterialInput, "sourceId" | "url" | "title" | "via">> {
  /** Another planted source; defaults to the one the seeds are bound to. */
  sourceId?: string;
  /** Distinguishes the row's URL and title; defaults to a running number. */
  slug?: string;
  title?: string;
  url?: string;
  via?: MaterialInput["via"];
}

export interface SeedAnalysisOptions {
  origin?: AnalysisOrigin;
  relevance?: "pass" | "block" | "unknown" | null;
  category?: string | null;
  titleZh?: string | null;
  summaryZh?: string | null;
  reasonZh?: string | null;
  score?: number | null;
  selected?: boolean | null;
  output?: unknown;
}

export interface SeedTranslationOptions {
  origin?: TranslationOrigin;
  revision?: number;
  lang?: string;
  title?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  complete?: boolean;
}

export interface SeedStoryOptions {
  origin?: StoryOrigin;
  title?: string;
  firstReportAt?: Date | null;
  latestAt?: Date | null;
  digest?: string | null;
}

export interface SeedReportOptions {
  kind?: "daily" | "weekly" | "monthly";
  origin?: ReportOrigin;
  /** Defaults to a random day in December 2099, far from anything a report job would write. */
  key?: string;
  windowStart?: Date;
  windowEnd?: Date;
}

/** Helpers bound to one test file's tag and source. */
export function seeds(T: string, sourceId: string) {
  let n = 0;
  const next = () => {
    n += 1;
    return n;
  };

  /** Inserts a source row; tests that need a second source pass its own id. */
  async function source(id = sourceId, opts: SeedSourceOptions = {}): Promise<string> {
    await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, site_fulltext, syndicate_fulltext, next_fetch_at)
              VALUES (${id}, ${opts.name ?? `Test ${id}`}, ${opts.kind ?? "rss"}, ${opts.tier ?? "T1"}, ${opts.participationMode ?? "editorial"},
                      ${opts.siteFulltext ?? true}, ${opts.syndicateFulltext ?? true}, '2100-01-01')`;
    return id;
  }

  /** A material through the real intake, with a body unless the caller says otherwise. */
  async function article(opts: SeedArticleOptions = {}): Promise<string> {
    const slug = opts.slug ?? String(next());
    const bodyText = opts.bodyText === undefined ? `BODY-${T}-${slug}` : opts.bodyText;
    const { articleId } = await upsertMaterial({
      ...opts,
      sourceId: opts.sourceId ?? sourceId,
      url: opts.url ?? `https://example.com/${T}-${slug}`,
      title: opts.title ?? `Test ${slug} ${T}`,
      bodyText,
      bodyHtml: opts.bodyHtml === undefined ? (bodyText ? `<p>${bodyText}</p>` : null) : opts.bodyHtml,
      bodyStatus: opts.bodyStatus ?? (bodyText ? "ok" : "pending"),
      via: opts.via ?? "fetch",
      publishedAt: opts.publishedAt === undefined ? new Date() : opts.publishedAt,
    });
    return articleId;
  }

  /** An editorial judgement; by default a rule-written, selected pass in the pack's first category. */
  async function analysis(articleId: string, opts: SeedAnalysisOptions = {}): Promise<void> {
    const i = next();
    await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, reason_zh, score, selected, output)
              VALUES (${articleId}, 1, ${opts.origin ?? "rule"}, ${opts.relevance === undefined ? "pass" : opts.relevance},
                      ${opts.category === undefined ? DEFAULT_CATEGORY : opts.category},
                      ${opts.titleZh === undefined ? `标题${i}-${T}` : opts.titleZh}, ${opts.summaryZh === undefined ? `SUMMARY-${i}-${T}` : opts.summaryZh},
                      ${opts.reasonZh === undefined ? "理由" : opts.reasonZh}, ${opts.score === undefined ? 90 : opts.score},
                      ${opts.selected === undefined ? true : opts.selected}, ${opts.output === undefined ? null : sql.json(opts.output as never)})`;
  }

  /** A selected article with full text and a summary: material plus analysis. */
  async function selected(opts: SeedArticleOptions & { analysis?: SeedAnalysisOptions } = {}): Promise<string> {
    const { analysis: a, ...rest } = opts;
    const id = await article(rest);
    await analysis(id, a);
    return id;
  }

  /** A stored translation of the article's body (and title, when given). */
  async function translation(articleId: string, opts: SeedTranslationOptions = {}): Promise<void> {
    await sql`INSERT INTO translations (article_id, lang, revision, title, body_html, body_text, complete, origin)
              VALUES (${articleId}, ${opts.lang ?? "zh"}, ${opts.revision ?? 1}, ${opts.title ?? null}, ${opts.bodyHtml ?? null}, ${opts.bodyText ?? null},
                      ${opts.complete ?? true}, ${opts.origin ?? "model"})`;
  }

  /** Publishes an article released in the past, so it is public at once. */
  const publishReleased = (articleId: string, options: PublishOptions = {}) => publishArticle(articleId, { ...released(), ...options });

  /** A story row; returns its ids. */
  async function story(opts: SeedStoryOptions = {}): Promise<{ id: number; publicId: string }> {
    const publicId = randomUUID();
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO stories (public_id, title, first_report_at, latest_at, digest, origin)
      VALUES (${publicId}, ${opts.title ?? `STORY-${T}`}, ${opts.firstReportAt === undefined ? new Date() : opts.firstReportAt},
              ${opts.latestAt === undefined ? new Date() : opts.latestAt}, ${opts.digest ?? null}, ${opts.origin ?? "model"}) RETURNING id`;
    return { id: row!.id, publicId };
  }

  /** A fact under a story; returns its id. */
  async function fact(storyId: number, opts: { title?: string; publicId?: string } = {}): Promise<number> {
    const [row] = await sql<{ id: number }[]>`
      INSERT INTO facts (public_id, story_id, title) VALUES (${opts.publicId ?? `fact-${T}-${next()}`}, ${storyId}, ${opts.title ?? `FACT-${T}`}) RETURNING id`;
    return row!.id;
  }

  /** Attaches an article to a fact as a report (or a mention). */
  async function link(factId: number, articleId: string, role: "report" | "mention" = "report"): Promise<void> {
    await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${factId}, ${articleId}, ${role})`;
  }

  /** A story with one fact citing the article; returns the story's public id. */
  async function storyFor(articleId: string, role: "report" | "mention" = "report", opts: SeedStoryOptions = {}): Promise<string> {
    const s = await story(opts);
    await link(await fact(s.id, { publicId: `fact-${s.publicId}` }), articleId, role);
    return s.publicId;
  }

  /** A saved report under a far-future key; `remove()` takes it out again when the test is done. */
  async function report(content: unknown, opts: SeedReportOptions = {}): Promise<{ key: string; remove: () => Promise<void> }> {
    const kind = opts.kind ?? "daily";
    const key = opts.key ?? `2099-12-${String(10 + Math.floor(Math.random() * 19))}`;
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
              VALUES (${kind}, ${key}, ${opts.windowStart ?? new Date(Date.now() - 86_400_000)}, ${opts.windowEnd ?? new Date()},
                      ${sql.json(content as never)}, now(), ${opts.origin ?? "manual"})
              ON CONFLICT (kind, key) DO UPDATE SET content = EXCLUDED.content`;
    return { key, remove: async () => { await sql`DELETE FROM reports WHERE kind = ${kind} AND key = ${key}`; } };
  }

  return { source, article, analysis, selected, translation, publishReleased, story, fact, link, storyFor, report };
}

export type Seeds = ReturnType<typeof seeds>;
