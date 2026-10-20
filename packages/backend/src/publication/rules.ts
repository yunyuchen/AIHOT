// Publication rules. Each rule is defined once here and used by every exit.

export interface SourceFacts {
  id: string;
  name: string;
  kind: string;
  tier: string;
  participation_mode: string;
  first_party: boolean;
  site_fulltext: boolean;
  syndicate_fulltext: boolean;
}

export function channelOf(sourceKind: string, hasXPost: boolean): "x" | "news" {
  return sourceKind === "x_search" || hasXPost ? "x" : "news";
}

/** Public pool (/all): editorial sources, relevant to the industry, with a Chinese title and summary. */
export function isPoolEligible(input: {
  participationMode: string;
  relevance: string | null;
  title: string | null;
  summary: string | null;
}): boolean {
  return input.participationMode === "editorial" && input.relevance === "pass" && !!input.title && !!input.summary;
}

/**
 * Item detail page, its share images, its Markdown export and its place in a reader's starred list:
 * an item that is not withdrawn and is in the public pool (an editorial source, judged relevant, with a
 * Chinese title and summary; `publications.eligible`). Material the prefilter blocked or the model never
 * summarised has no page, so nothing a reader could not read is reachable by id. hot_signal material is
 * heat evidence only and has none either. A paused source keeps its pages; a summary-only item keeps a
 * page without its body.
 */
export function hasItemPage(p: { visibility: string; eligible: boolean }): boolean {
  return p.visibility !== "withdrawn" && p.eligible;
}

/** Selected: pool eligible, judged selected, and the source tier may enter the selection. */
export function isSelectable(eligible: boolean, judgedSelected: boolean | null, tier: string): boolean {
  return eligible && judgedSelected === true && tier !== "EXCLUDE_MP";
}

/**
 * Site full text: the source licence allows showing it and we have confirmed body text.
 * WeChat and paywalled content never get it just because it was fetchable (source flag false).
 */
export function bodyModeOf(source: SourceFacts, bodyStatus: string, hasBody: boolean): "full" | "summary" {
  return source.site_fulltext && bodyStatus === "ok" && hasBody ? "full" : "summary";
}

/** Full-RSS redistribution whitelist: only sources that explicitly allow it. */
export function mayRedistribute(source: SourceFacts, bodyMode: "full" | "summary"): boolean {
  return source.syndicate_fulltext && bodyMode === "full";
}

/**
 * Detail pages are noindex by default. Selected items are indexed automatically; an editor
 * can mark any other public page for indexing, or exclude a page, which then stays out.
 */
export function isIndexable(p: { visibility: string; hasSummary: boolean; selected: boolean; seoIndexedAt: Date | null; seoExcludedAt: Date | null }): boolean {
  return p.visibility === "public" && p.hasSummary && p.seoExcludedAt === null && (p.selected || p.seoIndexedAt !== null);
}

/**
 * The "AI 摘要" mark (《人工智能生成合成内容标识办法》, in force since 2025-09-01): a field is marked when a
 * model wrote its draft, live (`model`) or played back from a recorded answer (`replay`); a field a rule
 * filled (`rule`), a translation the source supplied (`source`) or no draft at all is not. The draft
 * decides, so an editor's later correction of a model's title or summary stays marked and never flips it.
 * Every exit, the mini program projection included, reads its marks from here.
 */
export function writtenByModel(origin: string | null | undefined): boolean {
  return origin === "model" || origin === "replay";
}

/** A story title is a model's draft, or an editor's correction of one (`manual`): marked either way. */
export function storyTitleByModel(origin: string | null | undefined): boolean {
  return writtenByModel(origin) || origin === "manual";
}

/** An item's title, summary and reason share its current analysis (`publications.analysis_id`); a reason not shown is not marked. */
export function itemAiMarks(analysisOrigin: string | null | undefined, reason: string | null): { title: boolean; summary: boolean; reason: boolean } {
  const ai = writtenByModel(analysisOrigin);
  return { title: ai, summary: ai, reason: ai && reason !== null };
}

/** Display tags exclude internal entity markers. */
export function displayTags(tags: string[]): string[] {
  return tags.filter((t) => !t.startsWith("entity:"));
}
