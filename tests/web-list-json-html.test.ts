// Listings served as HTML inside JSON (config.htmlPath): government sites on the jpaas publishing system
// (miit.gov.cn, samr.gov.cn) load each column from an API answering {"data": {"html": "<ul>…"}}. The
// HTML is read with the usual selectors; relative links resolve against baseUrl, and link text the site
// cuts short ("…新能源汽...") gives way to the full title attribute.
import "./setup.ts";
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchWebList } from "@aihot/backend/sources/web-list";
import { FetchError } from "@aihot/backend/sources/types";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";

// The notices column of miit.gov.cn as served on 2026-10-02, cut down: a plain row, a row whose date
// cell also holds hidden "解读/新闻" labels and whose related links follow, and a row with its title cut short.
const listHtml = `
<div id="右侧内容"><div class="page-content"><ul>
  <li class="cf"><a class="fl" href="/zwgk/zcwj/wjfb/tz/art/2026/art_255ea93df118460fa105c46c2f546d9a.html" target="_blank" title="工业和信息化部等七部门关于印发《新型电池产业发展“十五五”规划》的通知"><i></i>工业和信息化部等七部门关于印发《新型电池产业发展“十五五”规划》的通知</a>
    <span class="fr">2026-09-28</span></li>
  <li class="cf tsjdboxListLi"><a class="fl" href="/zwgk/zcwj/wjfb/tz/art/2026/art_9fb9b35709f941d4805d064092032bd0.html" target="_blank" title="三部门关于印发《轻工纺织产业发展“十五五”规划》的通知"><i></i>三部门关于印发《轻工纺织产业发展“十五五”规划》的通知</a>
    <span class="fr"><font style="display:none;" class="jd">解读</font><font style="display:none;" class="xw">新闻</font>2026-09-22</span>
    <dl class="tslb-list" style="display:none;"><dt>相关解读</dt>
      <dd><a href="/zwgk/zcjd/art/2026/art_ced716be0a094e82937064b815ecba28.html" target="_blank" title="《轻工纺织产业发展“十五五”规划》解读">《轻工纺织产业发展“十五五”规划》解读</a></dd></dl></li>
  <li class="cf"><a class="fl" href="/zwgk/zcwj/wjfb/gg/art/2026/art_6a09b92c25e947e2a0e90b66d608a7be.html" target="_blank" title="《道路机动车辆生产企业及产品》（第410批）、《享受车船税减免优惠的节约能源 使用新能源汽车车型目录》（第八十九批）"><i></i>《道路机动车辆生产企业及产品》（第410批）、《享受车船税减免优惠的节约能源 使用新能源汽...</a>
    <span class="fr">2026-09-18</span></li>
</ul></div>
<div class="pagination" queryData="{'pageId':'3e3ad1a3bec74939890a0d3e54815141'}" rows="24" count="2846" pageNo="1"></div></div>`;

const pages: Record<string, string> = {
  "/unit": JSON.stringify({ success: true, code: "200", data: { html: listHtml }, message: "生成成功" }),
  "/empty": JSON.stringify({ success: false, code: "500", data: null, message: "error" }),
  "/page": "<html><body>not json</body></html>",
};
const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0]!;
  res.writeHead(Object.hasOwn(pages, path) ? 200 : 404, { "content-type": path === "/page" ? "text/html" : "application/json;charset=UTF-8" });
  res.end(pages[path] ?? "");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
const api = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const previousPrivateFetch = config.allowPrivateNetworkFetch;
config.allowPrivateNetworkFetch = true;
after(async () => {
  config.allowPrivateNetworkFetch = previousPrivateFetch;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const miit = (extra: Record<string, unknown> = {}) => ({
  url: `${api}/unit?pageType=column&tagId=%E5%8F%B3%E4%BE%A7%E5%86%85%E5%AE%B9&pageId=3e3ad1a3bec74939890a0d3e54815141`,
  htmlPath: "data.html",
  baseUrl: "https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/index.html",
  itemSelector: "li.cf",
  linkSelector: "a.fl",
  // The date cell, past the hidden labels some rows carry: every row's bare date reads the same way.
  publishedAtRegex: String.raw`<span class="fr">(?:<font[^>]*>[^<]*</font>)*(\d{4}-\d{2}-\d{2})`,
  ...extra,
});
const source = (config: Record<string, unknown>) => ({ id: "web-miit-test", kind: "web_list", config }) as never;

test("the HTML at htmlPath is read with the listing's selectors, links completed from baseUrl", async () => {
  const out = await fetchWebList(source(miit()));
  assert.deepEqual(
    out.map((c) => ({ url: c.url, title: c.title, publishedAt: c.publishedAt?.toISOString() })),
    [
      {
        url: "https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_255ea93df118460fa105c46c2f546d9a.html",
        title: "工业和信息化部等七部门关于印发《新型电池产业发展“十五五”规划》的通知",
        publishedAt: "2026-09-28T00:00:00.000Z",
      },
      {
        url: "https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/2026/art_9fb9b35709f941d4805d064092032bd0.html",
        title: "三部门关于印发《轻工纺织产业发展“十五五”规划》的通知",
        publishedAt: "2026-09-22T00:00:00.000Z",
      },
      {
        url: "https://www.miit.gov.cn/zwgk/zcwj/wjfb/gg/art/2026/art_6a09b92c25e947e2a0e90b66d608a7be.html",
        title: "《道路机动车辆生产企业及产品》（第410批）、《享受车船税减免优惠的节约能源 使用新能源汽车车型目录》（第八十九批）",
        publishedAt: "2026-09-18T00:00:00.000Z",
      },
    ],
  );
});

test("allowUrlPrefixes keeps one column's files", async () => {
  const out = await fetchWebList(source(miit({ allowUrlPrefixes: ["https://www.miit.gov.cn/zwgk/zcwj/wjfb/tz/art/"] })));
  assert.equal(out.length, 2);
  assert.ok(out.every((c) => c.url.includes("/wjfb/tz/art/")));
});

test("a path that holds no HTML string, or a response that is no JSON, fails the fetch", async () => {
  await assert.rejects(fetchWebList(source(miit({ htmlPath: "data.list" }))), (e) => e instanceof FetchError && /htmlPath data\.list/.test(e.message));
  await assert.rejects(fetchWebList(source(miit({ url: `${api}/empty` }))), (e) => e instanceof FetchError && /htmlPath data\.html/.test(e.message));
  await assert.rejects(fetchWebList(source(miit({ url: `${api}/page` }))), (e) => e instanceof FetchError && /not JSON/.test(e.message));
});

test("htmlPath is a web_list key, not one of json_list", () => {
  assert.deepEqual(unsupportedConfig("web_list", miit()), []);
  assert.deepEqual(unsupportedConfig("json_list", { url: api, htmlPath: "data.html" }), ["htmlPath"]);
});
