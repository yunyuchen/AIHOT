// Outward HTTP behaviour, defined once: CORS, cache lifetimes, redirects and which process owns a path.
// The API server and the web server both read this module.

/** CORS for /api/v1/* and /openapi-v1.json. */
export const PUBLIC_API_CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, If-None-Match, If-Modified-Since",
  "Access-Control-Expose-Headers": "ETag, Last-Modified, Retry-After, X-Request-Id, Link",
  "Access-Control-Max-Age": "86400",
};

/** Cache-Control per v1 operation. */
export const V1_CACHE_CONTROL = {
  items: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  codexResets: "public, max-age=60, s-maxage=60, stale-while-revalidate=60",
  hotTopics: "public, max-age=60, s-maxage=60, stale-while-revalidate=60",
  storyByPublicId: "public, max-age=60, s-maxage=60, stale-while-revalidate=60",
  dailies: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  latestDaily: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  dailyByDate: "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
  selectedSnapshot: "public, max-age=300, s-maxage=300, stale-while-revalidate=900",
  selectedChanges: "public, max-age=60, s-maxage=60, stale-while-revalidate=60",
} as const;

/**
 * Cache-Control per mini program operation (/api/mp). No stale-while-revalidate, so the placeholder
 * switch reaches readers within about two minutes (a proxy's minute plus the mini program's own).
 */
export const MINIPROGRAM_CACHE_CONTROL = {
  meta: "public, max-age=60, s-maxage=60",
  /** The longest; a pending release in scope cuts it short (as the site timeline does). */
  feed: "public, max-age=60, s-maxage=60",
  item: "public, max-age=60, s-maxage=60",
  story: "public, max-age=60, s-maxage=60",
  latestDaily: "public, max-age=60, s-maxage=60",
  /** A past issue changes only when regenerated or when an item it cites is withdrawn. */
  dailyByDate: "public, max-age=300, s-maxage=300",
  /**
   * The 5:4 share images (/og/mp/): shorter than the site's share images' hour, so a withdrawal or the
   * placeholder switch takes them down within ten minutes.
   */
  shareImage: "public, max-age=600, s-maxage=600",
  notFound: "public, max-age=60, s-maxage=60",
  /** 403 section_paused: every operation but meta while the placeholder switch is on. */
  paused: "public, max-age=60, s-maxage=60",
} as const;

export const RSS_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=900";
export const NO_STORE = "no-store";

export interface RedirectRule {
  match: "exact" | "regex" | "prefix";
  path: string;
  status: 301 | 302 | 307 | 308 | 404 | 410;
  /** Relative Location. `$1`… refer to regex groups; `*` appends the remainder for prefix rules. */
  location?: string;
  keepQuery?: boolean;
  headers?: Record<string, string>;
  why?: string;
}

/** Redirects. Locations are always relative, so they stay right behind any proxy. */
export const REDIRECTS: RedirectRule[] = [
  {
    match: "regex",
    path: "^/(all|about|agent|changelog|codex-reset|feedback|starred|more|privacy|terms)/+$",
    status: 301,
    location: "/$1",
    keepQuery: true,
  },
  {
    match: "regex",
    path: "^/(feed|rss|rss\\.xml|atom\\.xml)$",
    status: 301,
    location: "/feed.xml",
    keepQuery: true,
    why: "RSS reader aliases",
  },
  { match: "exact", path: "/leaderboard/methodology", status: 308, location: "/leaderboard/sources" },
  { match: "regex", path: "^/leaderboard/category/(aesthetics|writing)$", status: 307, location: "/leaderboard", why: "data-layer categories not yet public" },
  { match: "exact", path: "/leaderboard/category/overall", status: 404, why: "the overall board lives at /leaderboard" },
  { match: "prefix", path: "/sources", status: 302, location: "/admin/sources*", why: "admin bookmarks" },
];

export interface RedirectDecision {
  status: number;
  location: string | null;
  headers: Record<string, string>;
}

export function resolveRedirect(pathname: string, search: string): RedirectDecision | null {
  for (const rule of REDIRECTS) {
    let location: string | null = null;
    if (rule.match === "exact") {
      if (pathname !== rule.path) continue;
      location = rule.location ?? null;
    } else if (rule.match === "prefix") {
      const inTree = rule.path.endsWith("/")
        ? pathname.startsWith(rule.path)
        : pathname === rule.path || pathname.startsWith(`${rule.path}/`);
      if (!inTree) continue;
      location = rule.location ? rule.location.replace("*", pathname.slice(rule.path.length)) : null;
    } else {
      const m = new RegExp(rule.path).exec(pathname);
      if (!m) continue;
      location = rule.location ? rule.location.replace(/\$(\d)/g, (_s, i: string) => m[Number(i)] ?? "") : null;
    }
    if (location && rule.keepQuery && search) location += search;
    return { status: rule.status, location, headers: rule.headers ?? {} };
  }
  return null;
}

/** OAuth discovery probes from MCP clients: a cheap 404, never a rendered page. */
export const OAUTH_PROBE_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/api/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/api/mcp",
  "/.well-known/openid-configuration",
  "/.well-known/openid-configuration/api/mcp",
  "/api/mcp/.well-known/oauth-protected-resource",
  "/api/mcp/.well-known/oauth-authorization-server",
  "/api/mcp/.well-known/openid-configuration",
];

/**
 * Paths served by the api process; everything else is the web process. The web server proxies these to
 * the api (a reverse proxy in front may also route them straight to it). Patterns are anchored so page
 * paths such as /feedback never fall into /feed.
 */
export const API_OWNED_PATTERNS: RegExp[] = [
  /^\/api\//,
  /^\/feed(\.xml|\/.*)?$/,
  /^\/(rss|rss\.xml|atom\.xml)$/,
  /^\/openapi-v1\.json$/,
  /^\/(llms\.txt|robots\.txt|sitemap\.xml|manifest\.webmanifest)$/,
  /^\/sitemaps\//,
  /^\/\.well-known\//,
  /^\/(favicon\.ico|icon\.png|icon-192\.png|apple-icon\.png|logo\.svg)$/,
  /^\/(model-providers|leaderboard-sources|og|contact)\//,
  /^\/[0-9a-f]{32}\.txt$/,
  /^\/items\/[^/]+\/markdown$/,
];

export function isApiOwned(pathname: string): boolean {
  return API_OWNED_PATTERNS.some((re) => re.test(pathname));
}
