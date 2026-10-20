// Things real listings do that a fetch must survive: a charset header no decoder knows (OFweek
// sends "gb1323" over GBK pages), a site routed by its query string (PbootCMS: /?news/ lists
// /?news/12.html), and a JSON API whose timestamps carry no zone ("2026-09-28 09:03:29", Beijing time).
// And the sports pack's sources (tests/fixtures/, cut down from the pages as served): a list that prints
// month and day without the year (sport.gov.cn) or today's time alone (kepuchina.cn), dates only in the
// addresses (chinacdc.cn), a site that answers only a browser's User-Agent (kepuchina.cn), a gb2312
// header (biketo.com) and tags in capitals (olympic.cn).
import "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { fetchDetail, fetchWebList } from "@aihot/backend/sources/web-list";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import { FetchError } from "@aihot/backend/sources/types";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
// "骑行入门" in GBK, the bytes a gb2312 page sends.
const gb2312Page = Buffer.concat([
  Buffer.from(`<html><body><ul><li><a href="/racingnews/202610/1.html">`, "latin1"),
  Buffer.from("c6efd0d0c8ebc3c5", "hex"),
  Buffer.from(`</a><span>2026-10-16</span></li></ul></body></html>`, "latin1"),
]);

// "锂电极片涂布测厚" in GBK.
const gbkTitle = Buffer.from("efaeb5e7bcabc6accdbfb2bcb2e2baf1", "hex");
const gbkPage = Buffer.concat([
  Buffer.from(`<html><head><meta charset="gbk"></head><body><ul><li><a href="/2026-09/ART-1.html">`, "latin1"),
  gbkTitle,
  Buffer.from(`</a><span>2026-09-29</span></li></ul></body></html>`, "latin1"),
]);
const queryRouted = `<html><body><a href="/?listnew/">新闻中心</a><ul class="news">
  <li><a href="/?listnew/gongsixinwen/370.html">半导体精密陶瓷量检测解决方案</a><span>2026-08-20</span></li>
  <li><a href="/?listnew/gongsixinwen/369.html">第十四届半导体设备材料及核心部件展</a><span>2026-09-08</span></li>
</ul><a href="/?listnew/gongsixinwen/">公司资讯</a></body></html>`;
const notices = JSON.stringify({ list: [
  { id: 1, title: "不带时区的时间", time: "2026-09-28 09:03:29" },
  { id: 2, title: "带时区的时间", time: "2026-09-28T09:03:29Z" },
] });

const server = http.createServer((req, res) => {
  const url = req.url ?? "";
  if (url.startsWith("/gbk")) {
    res.writeHead(200, { "content-type": "text/html; charset=gb1323" });
    res.end(gbkPage);
  } else if (url.startsWith("/notices")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(notices);
  } else if (url.startsWith("/kepuchina/") && !/Chrome\//.test(req.headers["user-agent"] ?? "")) {
    // What kepuchina.cn answers a crawler.
    res.writeHead(502, { "content-type": "text/html" });
    res.end("<html><body>502 Bad Gateway</body></html>");
  } else if (url.startsWith("/kepuchina/list")) {
    res.writeHead(200, { "content-type": "text/html; charset=UTF-8" });
    res.end(fixture("kepuchina-list.html"));
  } else if (url.startsWith("/kepuchina/article")) {
    res.writeHead(200, { "content-type": "text/html; charset=UTF-8" });
    res.end(`<html><body><h1 class="act_title">为什么肩颈痛与呼吸有关？</h1><time pubdate="09:49">上传时间：09:49</time></body></html>`);
  } else if (url.startsWith("/sport-gov/")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(fixture("sport-gov-newslist.html"));
  } else if (url.startsWith("/jkts/")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixture("chinacdc-jkts.html"));
  } else if (url.startsWith("/olympic/")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(fixture("olympic-focus.html"));
  } else if (url.startsWith("/racingnews/")) {
    res.writeHead(200, { "content-type": "text/html; charset=gb2312" });
    res.end(gb2312Page);
  } else {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(queryRouted);
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const site = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("a charset header no decoder knows gives way to the page's own charset", async () => {
  const out = await fetchWebList({ id: "web-gbk-test", kind: "web_list", config: { url: `${site}/gbk`, itemSelector: "li", linkSelector: "a", publishedAtSelector: "span" } } as never);
  assert.deepEqual(out.map((c) => c.title), ["锂电极片涂布测厚"]);
});

test("on a site routed by its query string, items sharing the listing's path are not the listing itself", async () => {
  const out = await fetchWebList({ id: "web-query-test", kind: "web_list", config: { url: `${site}/?listnew/gongsixinwen/`, itemSelector: "ul.news li", linkSelector: "a", publishedAtSelector: "span" } } as never);
  assert.deepEqual(out.map((c) => c.url), [`${site}/?listnew/gongsixinwen/370.html`, `${site}/?listnew/gongsixinwen/369.html`]);
});

test("a JSON API's timestamp without a zone is Beijing time, whatever the host's zone", async () => {
  const previousTz = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Shanghai", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      const out = await fetchJsonList({ id: "json-zone-test", kind: "json_list", config: { url: `${site}/notices`, itemsPath: "list", titlePaths: ["title"], urlTemplate: "https://example.org/notice/{id}", publishedAtPath: "time" } } as never);
      assert.deepEqual(out.map((c) => c.publishedAt?.toISOString()), ["2026-09-28T01:03:29.000Z", "2026-09-28T09:03:29.000Z"], tz);
    }
  } finally {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  }
});

/** The month, day, hour and minute a date reads at +08:00, e.g. "10-14 00:00". */
const beijing = (d: Date | null | undefined) => (d ? new Date(d.getTime() + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ") : null);
const DAY = 86_400_000;

test("a list that prints month and day without the year gets the most recent such day (sport.gov.cn)", async () => {
  const listing = { url: `${site}/sport-gov/n20001280/n20001265/n20066978/index.html`, itemSelector: "ul.newslist li", linkSelector: "a", publishedAtSelector: "span" };
  const out = await fetchWebList({ id: "web-partial-test", kind: "web_list", config: { ...listing, publishedAtPartial: true } } as never);
  assert.deepEqual(out.map((c) => c.title), ["科学把控运动尺度 银发健身避开误区量力而行", "全国科学健身指导走基层活动四川遂宁举办", "冬季健身走起来 科学健身指导进社区"]);
  assert.deepEqual(out.map((c) => beijing(c.publishedAt)), ["10-14 00:00", "09-30 00:00", "12-28 00:00"]);
  for (const c of out) {
    const at = c.publishedAt!.getTime();
    assert.ok(at <= Date.now() + DAY && at > Date.now() - 366 * DAY, `${beijing(c.publishedAt)} is the latest such day, not one ahead or a year too far back`);
  }
  // Left to Date.parse, "10-14" would be a day in 2001: without the option such a list has no usable date.
  const plain = await fetchWebList({ id: "web-partial-test", kind: "web_list", config: listing } as never);
  assert.ok(plain.every((c) => !c.publishedAt || c.publishedAt.getUTCFullYear() < 2002));
});

test("a site that answers only a browser gets the configured User-Agent, on its list and its detail pages; today's time alone is today (kepuchina.cn)", async () => {
  const listing = { url: `${site}/kepuchina/list?at_id=AT202111191005438501`, itemSelector: ".tuwen_item", linkSelector: ".tuwen_title a", publishedAtSelector: ".tuwen_info span", publishedAtPartial: true };
  await assert.rejects(fetchWebList({ id: "web-ua-test", kind: "web_list", config: listing } as never), (e) => e instanceof FetchError && e.status === 502);
  const source = { id: "web-ua-test", kind: "web_list", config: { ...listing, headers: { "user-agent": BROWSER }, detail: { titleSelector: "h1.act_title" } } } as never;
  const out = await fetchWebList(source);
  assert.deepEqual(out.map((c) => c.title), ["【科普天天见】健康科普｜秋季流感高发，洗手不是冲冲就好！", "为什么肩颈痛与呼吸有关？"]);
  assert.equal(beijing(out[0]!.publishedAt)!.slice(6), "09:49");
  const at = out[0]!.publishedAt!.getTime();
  assert.ok(at <= Date.now() + 3_600_000 && at > Date.now() - DAY - 3_600_000, "a time alone is today's, or yesterday's while today's is still ahead");
  assert.equal(out[1]!.publishedAt?.toISOString(), "2026-10-16T00:00:00.000Z", "a whole date is read as before");
  const detail = await fetchDetail(`${site}/kepuchina/article?ar_id=746733`, source, { date: false, title: true, summary: false });
  assert.equal(detail.title, "为什么肩颈痛与呼吸有关？");
});

test("a list without dates takes the day from each address, and only its articles (chinacdc.cn)", async () => {
  const config = { url: `${site}/jkts/`, itemSelector: ".piclistCon dl", linkSelector: "h6 a", allowUrlPrefixes: [`${site}/jkts/2`, `${site}/jkyj/tfggws/`] };
  const out = await fetchWebList({ id: "web-url-date-test", kind: "web_list", config: { ...config, publishedAtFromUrl: true } } as never);
  assert.deepEqual(out.map((c) => [c.title, c.publishedAt?.toISOString()]), [
    ["2026年10月健康风险提示", "2026-10-08T16:00:00.000Z"],
    ["2026年中秋国庆健康风险提示", "2026-09-20T16:00:00.000Z"],
  ]);
  const without = await fetchWebList({ id: "web-url-date-test", kind: "web_list", config } as never);
  assert.ok(without.every((c) => !c.publishedAt), "the address is read only where the source says so");
});

test("tags in capitals are matched by lower-case selectors; a day of the month alone gives way to the address (olympic.cn)", async () => {
  const out = await fetchWebList({ id: "web-caps-test", kind: "web_list", config: {
    url: `${site}/olympic/news/focus/`, itemSelector: "div.lb_list li", linkSelector: "a", publishedAtSelector: "span.ndate", publishedAtFromUrl: true,
    allowUrlPrefixes: ["https://www.olympic.cn/news/focus/20"],
  } } as never);
  assert.deepEqual(out.map((c) => [c.title, beijing(c.publishedAt)]), [
    ["2026年全国帆船锦标赛在宁波象山亚帆中心开幕", "10-16 00:00"],
    ["2027年苏迪曼杯将在京举办", "10-15 00:00"],
    ["百天逐梦冰雪 青春相约长春 ——第33届世界大学生冬季运动会倒计时100天", "10-08 00:00"],
  ]);
});

test("a page whose header says gb2312 is read as GBK (biketo.com)", async () => {
  const out = await fetchWebList({ id: "web-gb2312-test", kind: "web_list", config: { url: `${site}/racingnews/`, itemSelector: "li", linkSelector: "a", publishedAtSelector: "span" } } as never);
  assert.deepEqual(out.map((c) => c.title), ["骑行入门"]);
});

test("the new list and schedule keys are web_list keys, and a fetch minute or interval floor out of range is refused", () => {
  const ok = { url: "https://www.sport.gov.cn/", headers: { "user-agent": BROWSER }, publishedAtPartial: true, publishedAtFromUrl: true, _aihot: { initialBackfillLimit: 3, minIntervalMinutes: 60, fetchMinute: 45 } };
  assert.deepEqual(unsupportedConfig("web_list", ok), []);
  assert.deepEqual(unsupportedConfig("web_list", { ...ok, _aihot: { fetchMinute: 60, minIntervalMinutes: "60" } }), ["_aihot.fetchMinute=60", "_aihot.minIntervalMinutes=60"]);
  assert.deepEqual(unsupportedConfig("rss", { feedUrl: "https://example.org/feed", publishedAtFromUrl: true, _aihot: { fetchMinute: 5 } }), ["publishedAtFromUrl"]);
});
