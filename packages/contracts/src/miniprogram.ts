// Mini program exit (/api/mp/v1/*). A versioned contract of its own, apart from /api/v1: within v1 it only
// grows (new fields, endpoints, enum values) and a breaking change opens /api/mp/v2. Nothing here reads
// the industry pack, so the mini program build resolves these types without it. Instants are ISO 8601
// strings, dates are Beijing YYYY-MM-DD.

/** A board: the vertical one industry instance supplies (manufacturing, sports). */
export interface MiniprogramBoard {
  key: string;
  name: string;
  /** The industry instance's site name (the daily's masthead and share title). */
  siteName: string;
  description: string;
}

export interface MiniprogramPlaceholder {
  title: string;
  body: string;
}

export interface MiniprogramHotline {
  label: string;
  number: string;
  /** Category keys whose cards and item pages show the hotline. */
  categories: string[];
}

export interface MiniprogramReadings {
  /** Today in Beijing. */
  date: string;
  /** Reading-group cards whose anchor falls between today's Beijing midnight and now. */
  cards: number;
  /** Distinct stories among those cards; a card outside a story counts none. */
  stories: number;
  /** Enabled editorial sources. */
  sources: number;
  /** Each of those cards' anchor, earliest first. */
  times: string[];
  /** The latest release of a selected item; null before the first one. */
  updatedAt: string | null;
}

/** GET /api/mp/v1/meta */
export interface MiniprogramMeta {
  schemaVersion: 1;
  board: MiniprogramBoard;
  /** The placeholder switch: under "placeholder" the other operations answer 403 section_paused. */
  status: "normal" | "placeholder";
  /** The industry pack's placeholder text; null means the mini program's built-in text. */
  placeholder: MiniprogramPlaceholder | null;
  columns: { feed: boolean; stories: boolean; daily: boolean };
  /** The industry pack's categories, in filter-bar order; colours are the mini program's, by key. */
  categories: Array<{ key: string; label: string }>;
  notice: { footer: string | null; hotline: MiniprogramHotline | null };
  readings: MiniprogramReadings;
  generatedAt: string;
}

/** Per-field AI marks: true where a model wrote the field's draft, an editor's later correction included. */
export interface MiniprogramCardAi {
  title: boolean;
  summary: boolean;
}

/** A reading group on the feed (one per story, per fact outside a story, or per lone item), shown by its representative item. */
export interface MiniprogramCard {
  /** The representative item's id. */
  id: string;
  title: string;
  summary: string;
  /** A category key of the board; null draws no category mark. */
  category: string | null;
  source: { name: string };
  /** The reading group's anchor, as on the site's home timeline: the card's time and its place in the list. */
  anchorAt: string;
  /** When the source published the item; its discovery time when the source gave none. */
  publishedAt: string;
  /** Distinct sources reporting the same fact, this item's own included; at least 1. "N 家在报" shows from 2. */
  sourceCount: number;
  /** The story's id when the item belongs to one. */
  storyId: string | null;
  ai: MiniprogramCardAi;
}

/**
 * Today's focus card: the card of the hot ranking's first story when that story has a card today, else
 * today's card with the highest score; none before today's first selected card. No rank or heat values.
 */
export interface MiniprogramFocus extends MiniprogramCard {
  /** Every source reporting the story (the fact, for a card outside a story), earliest first report first. */
  sourceNames: string[];
  /** The latest of those reports. */
  latestAt: string;
}

export interface MiniprogramPage {
  /** Opaque, bound to the query's filters; null on the last page. */
  nextCursor: string | null;
  hasMore: boolean;
}

/** GET /api/mp/v1/feed?category=&cursor=&limit= */
export interface MiniprogramFeed {
  schemaVersion: 1;
  query: { category: string | null };
  /** Today's focus card, on the first page without a category only; null elsewhere and on a day without cards. */
  focus: MiniprogramFocus | null;
  /** Newest first. No rank or heat values. */
  cards: MiniprogramCard[];
  page: MiniprogramPage;
  /** The next release of a selected item in this scope (the release gate); caches end by then. */
  refreshAt: string | null;
  generatedAt: string;
}

export interface MiniprogramFullText {
  /** The reading mode: the source allows full text on the site, the body is confirmed and no editor set summary-only. */
  allowed: boolean;
  /** The body in rich-text tags when allowed; null otherwise. */
  html: string | null;
  /** The body is a Chinese translation of a foreign original. */
  translated: boolean;
  /** The translation covers the whole original (always true for a Chinese original). */
  complete: boolean;
}

/** The story an item belongs to, for the item page's "同一件事，N 家在报" panel. */
export interface MiniprogramItemStory {
  id: string;
  title: string;
  /** Distinct sources across the story's reports, this item's own included. */
  sourceCount: number;
  /** Up to three other sources, earliest first report first; never this item's own. */
  otherSourceNames: string[];
  ai: { title: boolean };
}

/** Per-field AI marks; `body` only when the body shown is a model's translation. */
export interface MiniprogramItemAi {
  title: boolean;
  summary: boolean;
  reason: boolean;
  body: boolean;
}

export interface MiniprogramShare {
  title: string;
  /** Absolute address of the 5:4 share image (1000×800 PNG, under /og/mp/); a 503 there means use the bundled fallback. */
  imageUrl: string;
}

/** GET /api/mp/v1/items/{id} */
export interface MiniprogramItem {
  schemaVersion: 1;
  id: string;
  title: string;
  summary: string;
  category: string | null;
  source: { name: string };
  /** When the source published the item; its discovery time when the source gave none. */
  publishedAt: string;
  /** "为什么值得看": selected items only. */
  reason: string | null;
  /** Distinct sources reporting the same fact, at least 1 (the card's value); null under summary-only. */
  sourceCount: number | null;
  /** For "复制来源链接" only: the mini program opens no web page. */
  originalUrl: string;
  fullText: MiniprogramFullText;
  /** Null outside a story and under summary-only. */
  story: MiniprogramItemStory | null;
  ai: MiniprogramItemAi;
  share: MiniprogramShare;
  generatedAt: string;
}

/** A report on the story page ("谁在报，怎么说"). */
export interface MiniprogramStoryReport {
  /** The report's item page; null when it has none (the mini program does not open it). */
  itemId: string | null;
  title: string;
  source: { name: string };
  /** When the source published it; its discovery time when the source gave none. */
  publishedAt: string;
  /** The item's own title mark. */
  ai: { title: boolean };
}

/** GET /api/mp/v1/stories/{id} — no share fields: the story page is not shared on its own. */
export interface MiniprogramStory {
  schemaVersion: 1;
  /** The story's public id; a merged story answers as the story it was merged into, under that id. */
  id: string;
  title: string;
  /** The story's digest, else its summary; null with neither. */
  digest: string | null;
  /** Distinct sources across the story's reports. */
  sourceCount: number;
  reportCount: number;
  firstReportAt: string;
  latestAt: string;
  /**
   * Reports with a Chinese title, earliest first; at most 100 (beyond that the earliest one and the
   * latest 99).
   */
  reports: MiniprogramStoryReport[];
  /** `title`: a model's draft, an editor's correction included; `digest`: whenever there is one. */
  ai: { title: boolean; digest: boolean };
  generatedAt: string;
}

/** An item a daily cites, as its highlights, sections and flashes list it. */
export interface MiniprogramDailyEntry {
  itemId: string;
  title: string;
  source: { name: string };
  /** The item's own title mark. */
  ai: { title: boolean };
}

export interface MiniprogramDailySection {
  /** The section's name, from the industry pack (not a model's): never marked. */
  label: string;
  /** The category keys the section stands for (several may share one); the first gives its colour. */
  categories: string[];
  /** At most 8. */
  items: MiniprogramDailyEntry[];
}

/** GET /api/mp/v1/dailies/latest and /api/mp/v1/dailies/{date} (only where the board has a daily). */
export interface MiniprogramDaily {
  schemaVersion: 1;
  /** The issue's Beijing date. */
  date: string;
  /** The daily's name. */
  title: string;
  /** When the issue was composed. */
  publishedAt: string;
  /** Beijing D-1 08:00 to D 08:00. */
  window: { start: string; end: string };
  /** Today's headline and lead paragraph, written about the issue's items as a whole (no item id); null without one. */
  lead: { title: string; paragraph: string } | null;
  /** The issue's top items, at most 6. */
  highlights: MiniprogramDailyEntry[];
  sections: MiniprogramDailySection[];
  /** Items past a section's 8, at most 12; the mini program draws them as a last "快讯" section. */
  flashes: MiniprogramDailyEntry[];
  /** The issues before and after; null at either end. */
  prev: string | null;
  next: string | null;
  ai: { leadTitle: boolean; leadParagraph: boolean };
  share: MiniprogramShare;
  generatedAt: string;
}

/**
 * POST /api/mp/v1/reminders (only where the board has a daily), after the reader accepted the subscribe
 * prompt: the wx.login code and the one template id the mini program asked for. Nothing else is accepted.
 */
export interface MiniprogramReminderRequest {
  code: string;
  templateId: string;
}

/** Its answer (no-store): the Beijing date whose daily the reminder is for, always the day after the request. */
export interface MiniprogramReminder {
  schemaVersion: 1;
  targetDate: string;
}
