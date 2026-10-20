# 信源

信源在后台“信源”页管理：新建、试抓一次看看抓到什么、改频率、启停、看失败原因和最近的条目。首次启动时，`industry/sources.json` 里的示范信源会被导入。

## 六种信源

| 类型 | 适合 | 需要 |
|---|---|---|
| `rss` | 有 RSS / Atom 的博客、媒体、Substack、公众号转 RSS 服务 | 无 |
| `web_list` | 没有 RSS 的网页列表（新闻页、博客列表、更新日志） | 写选择器；抓不到时可以经 Jina Reader 渲染（按次计费） |
| `json_list` | 返回 JSON 的接口（GitHub Releases 等） | 写字段路径 |
| `x_search` | X（推特）账号 | SocialData 的 key，按请求计费 |
| `mp_account` | 微信公众号 | 极致了（Dajiala）的 key，按请求计费 |
| `external` | 你自己的脚本推送进来的内容 | `INGEST_TOKEN`，见下文 |

每种信源认哪些配置项写在 `packages/backend/src/sources/config-keys.ts`。填了不认识的配置项，保存会被拒绝、抓取会直接失败并在后台显示原因，不会悄悄退回通用解析。

### rss

```json
{ "feedUrl": "https://example.com/feed.xml" }
```

可选：`summaryIsBody`（订阅里的摘要就是全文）、`allowCategories` / `denyCategories`（按订阅里的分类过滤）。

### web_list

```json
{
  "url": "https://example.com/news",
  "itemSelector": "article",
  "linkSelector": "a",
  "titleSelector": "h2",
  "publishedAtSelector": "time"
}
```

- `parseMode`：`html`（默认，用选择器）、`markdown`（经 Jina 渲染后按 Markdown 读）、`docusaurus_changelog`。
- `detail`：列表缺日期、标题或摘要时抓详情页补齐（`publishedAtSelector`、`titleSelector`、`summarySelector` 等）。
- `allowUrlPrefixes` / `denyUrlPrefixes`：只收某些路径下的文章。
- `bodyUrlPrefixRewrite`：`{"from": "…", "to": "…"}`，只在抽正文时把以 `from` 开头的文章链接换成以 `to` 开头再去抓；条目链接、判重、`allowUrlPrefixes` 判定和读者点开的原文链接都还是列表给的那个。用于文章页被反爬挡住、同一篇在另一个地址能直接打开的站：北极星的 `news.bjx.com.cn/html/` 回阿里云 WAF 的 JS 验证页，同一篇在 `chuneng.bjx.com.cn/news/` 能拿到正文。不要用 `itemUrlPrefixRewrite` 做这件事，它改的是条目链接本身，列表上还挂着的旧条目会按新链接重新入库、再分析一遍。rss、json_list 也认这一项。生产库里已有的信源不会随 `sources.json` 自动更新（导入时已存在的不覆盖），要在后台信源页改配置；改之前已标为抓不到正文的条目，在后台条目页点“重新抽取正文”补回；北极星两分钟内四十几次请求就会把文章页封半小时以上，补抽要分批。
- 列表日期不带时区时按 `publishedAtUtcOffset`（默认 `+08:00`）读。日期写得不全时：
  - `publishedAtPartial: true`：列表只写月日（`10-16`、`10月16日`）时补成最近的那一年，补出来比现在晚一天以上的（一月读到的十二月日期）退回上一年；只写时刻（`09:49`）的是今天，比现在晚一小时以上的算昨天。不开这项时，`10-16` 这样的日期会被读成 2001 年。体育总局、科普中国用这个。
  - `publishedAtFromUrl: true`：列表上没有日期的条目，从链接里取日期：`/20261010/`、`t20261009_…`、`/2026/1016/`、`/2026/10/16/`、`/2026-10/16/`，读成那天零点。疾控中心、人民网、央视网用这个。
- `headers`：请求头，列表页、详情页和抓正文时都带。有的站只认浏览器（科普中国对爬虫的 User-Agent 回 502），就填 `{"user-agent": "Mozilla/5.0 …"}`。
- 不用另外配的：页面是 gb2312 / GBK 时按响应头或页面里声明的字符集转码；HTML 标签写成大写（`<LI><A>`）时选择器照常写小写就能匹配。
- `htmlPath`：接口返回 JSON、列表是其中某个字段里的一段 HTML 时（工信部、市场监管总局等 jpaas 发布系统的站点），填这个字段的路径，取出的 HTML 再按上面的选择器解析。`url` 填接口地址（直接抓取，经 Jina 的地址不支持）；条目链接是相对路径时用 `baseUrl` 补全。链接文字被截断成“…”或“...”而 `title` 属性是完整标题时，自动取 `title` 属性。

```json
{
  "url": "https://www.miit.gov.cn/api-gateway/jpaas-publish-server/front/page/build/unit?…&pageId=…",
  "htmlPath": "data.html",
  "baseUrl": "https://www.miit.gov.cn/",
  "itemSelector": "li.cf",
  "linkSelector": "a.fl",
  "publishedAtRegex": "<span class=\"fr\">(?:<font[^>]*>[^<]*</font>)*(\\d{4}-\\d{2}-\\d{2})"
}
```

### x_search

```json
{ "query": "from:SomeAccount -filter:replies" }
```

普通账号会被自动合并成一次搜索（每次最多二十几个账号），省请求数。

### mp_account

```json
{ "ghid": "gh_xxxxxxxx", "nickname": "公众号名称" }
```

每个公众号按它的抓取间隔检查一次（查列表按次计费），新文章的正文一并取回。

## 分级、参与方式与全文

- **分级** `tier`：`T1` 官方一手（官网、官方博客、机构）、`T1_5` 官方账号与准官方创作者、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。入选门槛按分级不同（行业包的 `selection.ts`）。
- **参与方式** `participation_mode`：`editorial` 进精选和全部动态；`hot_signal` 不单独展示，只作为“大家在讨论什么”的热度证据；`isolated` 不进任何公开页面。
- **一手** `first_party`：来源是当事方自己。事件页会优先展示一手报道。
- **并成一个来源计数** `signal_group_id`：填了同一个值的几个信源，在事件热度里只算一个参与方。适合同一家出版方的多个频道（同一媒体的几个栏目、几个订阅），以及互相转载同一份通稿的聚合站，免得一份通稿被几处转发就显得很热。不填时每个信源各算一个。在后台信源页填（最长 120 字符），或写在行业包 `sources.json` 的信源里。
- **全文**：`site_fulltext` 决定站内能不能显示全文，`syndicate_fulltext` 决定全文 RSS 能不能带正文。两者**默认都关**，只显示摘要和原文链接；来源明确允许时再打开。公众号、付费墙内容不会因为技术上抓得到就获得全文展示。

## 抓取频率

每个信源有自己的抓取间隔。每天 04:20 会按近 7 天的产出自动调整：产出多的抓得勤，最短 15 分钟；免费信源最长 60 分钟，按次计费的信源最长 120–180 分钟。

不许频繁访问的站（国家体育总局连续五六次请求就回 403）在 `_aihot` 里配：

- `minIntervalMinutes`：间隔下限，自动调整不会把间隔改得比它短。
- `fetchMinute`（0–59）：只在每小时这一分钟起的 10 分钟里抓。同一个站的几个栏目各取相隔较远的分钟（比如 5、25、45），新导入、失败重试、运行拖延都不会让它们挤到一起。

```json
{ "_aihot": { "minIntervalMinutes": 60, "fetchMinute": 25 } }
```

抓取失败不推进位置，下次从同一处继续；连续失败的信源在后台标红，每周一会在运营群发一份信源周报（配置了飞书内部群时）。

## 规则：旧文不刷屏

首次发现时原文已经发布超过 48 小时的资料、新信源第一次导入的存量条目、标记为回灌的推送，都按原文时间归档：不进入“今天”，也不推送。这条规则所有入口共用，防止一次性导入历史内容刷屏。

新信源第一次导入时最多取 `_aihot.initialBackfillLimit` 条（默认 30），只取 `_aihot.initialBackfillMonths` 个月内的（默认 12）；列表能按时间排时加 `sortByPublishedAt`，取的就是最新的。之后的抓取里，列表上仍然挂着的存量照样受这个上限约束：首次导入被上限挡掉的条目里最新的那条记下来（信源 `cursor.backlogBefore`），之后列表上不比它新、又早于首次导入一天以上的不再收；首次导入前一天之内的照收，按存量归档（按原文时间，昨天的不进“今天”，也不推送）。所以一次返回几百条的接口（新华网体育一次 400 条）不会在第二次抓取时把剩下的都带进来。没有日期的条目无从判断，按新内容处理，所以列表日期要配对。

## 外部推送接口

自己写脚本抓的内容，可以推进站里，走和普通采集一样的判重、精选和归组。

```
POST /api/ingest/items
Authorization: Bearer <INGEST_TOKEN>
Content-Type: application/json

{
  "sourceId": "my-crawler",
  "sourceName": "我的抓取脚本",
  "items": [
    { "title": "必填", "url": "必填", "publishedAt": "2026-10-01T08:00:00+08:00", "author": "可选" }
  ]
}
```

- `INGEST_TOKEN` 在 `.env` 里设置，至少 16 位；不设置时接口一律返回 401。
- 每次最多 50 条；每个客户端每分钟最多 10 次。
- 返回 `{"ok": true, "created": <新建条数>}`。缺标题或网址的条目会被跳过，同一请求里重复的网址只取第一条。
- `sourceId` 不存在时会自动建一个 `external` 信源，默认不进公开页面：到后台把它的参与方式改成 `editorial` 才会出现在站上。
- 条目的 `raw._aihot.backfill` 为 `true` 时按历史回灌处理（不进入“今天”、不推送）。
