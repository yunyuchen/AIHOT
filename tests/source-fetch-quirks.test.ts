// Three things real listings do that a fetch must survive: a charset header no decoder knows (OFweek
// sends "gb1323" over GBK pages), a site routed by its query string (PbootCMS: /?news/ lists
// /?news/12.html), and a JSON API whose timestamps carry no zone ("2026-09-28 09:03:29", Beijing time).
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchJsonList } from "@aihot/backend/sources/json-list";
import { fetchWebList } from "@aihot/backend/sources/web-list";

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
