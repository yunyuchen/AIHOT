// Run after `npm run build -w @aihot/web`. Real production server/router, synthetic HTTP API only:
// the "AI 摘要" mark shows where the api marks a field and nowhere else.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import type { ReportCitation, ReportDetail, SiteItemDetail, StoryDetail, StoryReportView, TimelineCard, TimelineResponse } from "@aihot/contracts/site";

const MARK = "AI 摘要";
const AT = "2026-10-16T08:00:00.000Z";
const MARKED = { title: true, summary: true, reason: true };
const UNMARKED = { title: false, summary: false, reason: false };
const MARKED_STORY = "11111111-1111-4111-8111-111111111111";
const UNMARKED_STORY = "22222222-2222-4222-8222-222222222222";

function card(id: string, ai: typeof MARKED): TimelineCard {
  return {
    key: id,
    anchorAt: AT,
    group: null,
    item: {
      id, title: `标题-${id}`, summary: `摘要-${id}`, reason: ai.reason ? `理由-${id}` : null, source: { name: "来源" }, publishedAt: AT, timelineAt: AT,
      category: null, tags: [], score: 80, selected: true, channel: "news", x: null, ai,
    },
  };
}

/** A foreign article read in its Chinese translation, with a reason. */
function item(id: string, ai: SiteItemDetail["ai"]): SiteItemDetail {
  return {
    id, revision: 1, title: `标题-${id}`, originalTitle: "Original title", summary: `摘要-${id}`, reason: `理由-${id}`,
    source: { id: "src", name: "来源", kind: "rss", firstParty: false, iconUrl: null },
    links: { site: `/items/${id}`, original: "https://example.com/original" },
    publishedAt: AT, discoveredAt: AT, timelineAt: AT, category: null, tags: [], score: 80, selected: true, channel: "news", story: null, x: null,
    readingMode: "full", author: null, language: "en",
    body: { zh: "<p>中文译文正文</p>", original: null, zhKind: "translation", complete: true },
    outline: [], relatedStories: [], indexable: false, markdownAvailable: false, group: null, hasTranslation: true, bodyLanguage: "zh", ai,
  };
}

function story(publicId: string, marked: boolean): StoryDetail {
  const report: StoryReportView = {
    id: `report-${publicId.slice(0, 4)}`, title: "报道标题", summary: "报道摘要", source: { id: "src", name: "来源", kind: "rss", firstParty: true, iconUrl: null },
    publishedAt: AT, originalUrl: "https://example.com/report", selected: false, factId: "fact", ai: { title: marked, summary: marked },
  };
  return {
    publicId, title: "事件标题", status: "settled", reportCount: 1, sourceCount: 1, firstReportAt: AT, latestAt: AT,
    digest: "事件综述", digestUpdatedAt: AT, summary: null, excerpt: null, latest: null,
    whyHot: { participants48h: 0, newParticipants6h: 0, recentReports24h: 0, observationComplete: true, rank: null, heat: null },
    developments: [], officialReports: [report], timeline: [report], heat: [], related: [], ai: { title: marked, digest: marked },
  };
}

function daily(key: string, marked: boolean): ReportDetail {
  const cite = (n: number): ReportCitation => ({
    itemId: `cited-${n}`, title: `条目标题-${n}`, summary: `条目摘要-${n}`, sourceName: "来源", sourceUrl: "https://example.com/cited", sourceId: null,
    sourceIconUrl: null, firstParty: false, role: null, storyPublicId: null, publishedAt: AT, available: true, ai: { title: marked, summary: marked },
  });
  const items = [cite(1), cite(2)];
  return {
    kind: "daily", key, title: `日报 · ${key}`, windowStart: AT, windowEnd: AT, generatedAt: AT, revision: 1,
    lead: { title: "今日头条", leadParagraph: "头条导语" }, overview: null, highlights: [], sections: [{ label: "分节", summary: null, items }],
    stories: items.map((c) => ({ ...c, label: "分节" })), flashes: [cite(3)], cover: null, metrics: {}, readingMinutes: 1, prev: null, next: null,
    ai: { leadTitle: marked, leadParagraph: marked },
  };
}

const ITEMS: Record<string, SiteItemDetail> = {
  model: item("model", { ...MARKED, body: true }),
  // The source supplied the translation: everything but the body is marked.
  "source-translated": item("source-translated", { ...MARKED, body: false }),
  rule: item("rule", { ...UNMARKED, body: false }),
};

let web: ChildProcess;
let origin: string;
let logs = "";
const api = createServer((req, res) => {
  const url = new URL(req.url!, "http://api.local");
  res.setHeader("Content-Type", "application/json");
  const send = (body: unknown) => res.end(JSON.stringify(body));
  if (url.pathname === "/api/site/meta") return send({ changelogVersion: "2026-10-16T12:00" });
  if (url.pathname === "/api/site/timeline") {
    const body: TimelineResponse = {
      filters: { channel: "all", category: null, tag: null, topic: null }, cards: [card("marked-card", MARKED), card("plain-card", UNMARKED)],
      nextCursor: null, refreshAt: null, hot: null, dayCounts: {}, generatedAt: AT,
    };
    return send(body);
  }
  const itemId = url.pathname.match(/^\/api\/site\/items\/([\w-]+)$/)?.[1];
  if (itemId && ITEMS[itemId]) return send(ITEMS[itemId]);
  const storyId = url.pathname.match(/^\/api\/site\/stories\/([\w-]+)$/)?.[1];
  if (storyId === MARKED_STORY || storyId === UNMARKED_STORY) return send(story(storyId, storyId === MARKED_STORY));
  if (url.pathname.startsWith("/api/site/reports/daily/navigation/")) return send({ items: [] });
  const reportKey = url.pathname.match(/^\/api\/site\/reports\/daily\/(\d{4}-\d{2}-\d{2})$/)?.[1];
  if (reportKey === "2099-11-01" || reportKey === "2099-11-02") return send(daily(reportKey, reportKey === "2099-11-01"));
  res.statusCode = 404;
  send({ code: "not_found" });
});

before(async () => {
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  web = spawn(process.execPath, [fileURLToPath(new URL("../server.ts", import.meta.url))], {
    env: { ...process.env, WEB_PORT: "0", TRUST_PROXY: "false", API_BASE_URL: `http://127.0.0.1:${(api.address() as AddressInfo).port}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`web did not start: ${logs}`)), 15_000);
    web.on("exit", () => { clearTimeout(timeout); reject(new Error(`web exited: ${logs}`)); });
    web.stderr!.on("data", (chunk) => { logs += String(chunk); });
    web.stdout!.on("data", (chunk) => {
      logs += String(chunk);
      const match = logs.match(/"msg":"web started","port":(\d+)/);
      if (match) {
        origin = `http://127.0.0.1:${match[1]}`;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
});

after(async () => {
  if (web && web.exitCode === null) {
    web.kill("SIGTERM");
    await once(web, "exit");
  }
  api.closeAllConnections();
  await new Promise<void>((resolve) => api.close(() => resolve()));
});

async function page(path: string): Promise<string> {
  const res = await fetch(origin + path);
  const html = await res.text();
  assert.equal(res.status, 200, `${path}: ${logs.slice(-2000)}`);
  return html;
}

const marks = (html: string) => html.split(MARK).length - 1;

test("a feed card shows the mark when the api marks its title or summary, and not otherwise", async () => {
  const html = await page("/");
  const cardHtml = (id: string) => {
    const start = html.indexOf(`data-item-id="${id}"`);
    assert.ok(start >= 0, `${id} is rendered`);
    return html.slice(start, html.indexOf("</article>", start));
  };
  assert.equal(marks(cardHtml("marked-card")), 1, "a model's card is marked once");
  assert.equal(marks(cardHtml("plain-card")), 0, "a rule's card is not marked");
});

test("an item page marks each field the api marks: title and summary, the reason, a model's translation", async () => {
  const model = await page("/items/model");
  const sourceTranslated = await page("/items/source-translated");
  const rule = await page("/items/rule");
  assert.ok(marks(model) >= 3, "title line, reason and translation");
  assert.equal(marks(sourceTranslated), marks(model) - 1, "the source's own translation is not marked; the other fields still are");
  assert.match(model, /中文标题、摘要由 AI 生成，以原文为准/);
  assert.equal(marks(rule), 0, "nothing a rule wrote is marked");
  assert.doesNotMatch(rule, /由 AI 生成，以原文为准/);
});

test("a story page and a daily issue mark the blocks the api marks", async () => {
  assert.ok(marks(await page(`/story/${MARKED_STORY}`)) >= 3, "story title, digest and the reports' titles");
  assert.equal(marks(await page(`/story/${UNMARKED_STORY}`)), 0);
  assert.ok(marks(await page("/daily/2099-11-01")) >= 3, "the lead, the section and the flashes");
  assert.equal(marks(await page("/daily/2099-11-02")), 0);
});
