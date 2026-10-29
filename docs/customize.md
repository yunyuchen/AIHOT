# 把它改成你的行业

这份仓库默认是一个“AI 行业”的示例站：示范信源是一批公开的 AI 资讯源，精选口味是 AIHOT 在 AI 领域调了很久的那一套。要把它变成“法律热点”“HR 热点”“黄金热点”，要改的东西几乎都在一个行业包目录（[`industry-packs/<名字>/`](../industry-packs/)）里，代码基本不用动。

如果你用 Claude Code、Codex 这类 Agent，可以把下面这段直接发给它，然后回答它的问题：

```text
请读 AGENTS.md 和 docs/customize.md，把这个站改成「XX 行业」的热点站。
我关心的是：……（写你想盯的信源、你觉得什么消息重要、什么不重要，越具体越好）。
改完帮我跑 npm run typecheck、npm test 和 node scripts/smoke.ts，并告诉我还需要我自己决定哪些事。
```

下面是它（或者你）要做的事，按顺序。

## 0. 行业包放在哪、怎么选

一个行业包就是 `industry-packs/` 下的一个目录，这个仓库现在有两个：`manufacturing`（锐奇制造日报）和 `sports`（锐奇运动健康，还是骨架），各自部署成一个行业实例；用 `INDUSTRY_PACK=sports` 选运动健康，怎么在本机跑见 [行业包](../industry-packs/README.md)。下面第 1 到第 8 步说的文件，都在你的行业包目录里。做新行业可以复制一份现有的行业包改名再改，也可以直接改现有的那份。

- **行业包目录是唯一真相。** 代码从 `industry/` 读，那是选择步骤（`scripts/select-industry.ts`）从选中的行业包复制出来的。**不要手改 `industry/`**，手改的内容下次选择就被覆盖。`industry/` 里只有 `package.json`、`tsconfig.json`、`README.md` 是框架自己的文件，不随行业包走：`package.json` 的 `exports` 是代码和行业包之间的约定，镜像构建在 `npm ci` 之前只拷它。
- **选哪一个**：`INDUSTRY_PACK`（环境变量，或者写进 `.env`），不设就是 `manufacturing`。`npm run industry` 按它选一次；`npm run dev:*`、`npm run typecheck`、`npm test` 会先自动选；`node scripts/select-industry.ts <名字>` 直接点名。名字写错会直接报错并列出可选项。
- **Docker**：`docker compose` 把 `INDUSTRY_PACK`（从 `.env` 或环境变量读）作为构建参数传给 `Dockerfile`，镜像里只留选中的那一份。
- **入库的 `industry/` 是制造行业包**，clone 下来不用先选就能跑。CI 用 `node scripts/select-industry.ts --check manufacturing` 核对它和 `industry-packs/manufacturing/` 逐字节一致。切到别的行业包试过以后，提交前先 `node scripts/select-industry.ts manufacturing` 切回来。
- **加一个行业包**：在 `.github/workflows/check.yml` 两个任务的 `matrix.pack` 里加上它的名字，CI 就会对它也跑一遍检查和镜像构建。

## 1. 站名和文案：`site.ts`

- `name`：站名。导航、标题、分享图、RSS、MCP、后台都用它。
- `subject`：行业词。页面上“AI 日报”“全部 AI 动态”会变成“法律日报”“全部法律动态”。
- `homeTitle`、`description`、`tagline`：首页标题、一句话介绍、侧边栏小字。
- `mcpPrefix`：MCP 工具名前缀，比如 `lawhot` 会得到 `lawhot_get_latest`。有人接入以后不要再改。
- `crawlerName`：抓取信源时报的名字，别用别人的站名。
- `ABOUT`：关于页的大标题、四个环节的说明、作者块（可选）、版权说明。
- `icp`：中国大陆网站的备案号，填了就显示在页脚。

站点地址不写在这里，部署时用环境变量 `SITE_URL` 设置。

## 2. 分类、标签和主题：`taxonomy.ts`、`topics.json`

- `CATEGORIES`：首页和“全部动态”的筛选类别。`key` 会出现在网址和接口里（`/all?category=`、`/feed/category/<key>.xml`），上线后不要改；`label` 是显示名；`section` 是日报里的分节；`guide` 告诉模型怎么归类。
- `CATEGORY_TAGS`、`TOPIC_TAGS`、`ENTITY_TAGS`：模型打标签时只能从这里选。第一个标签必须是“分类标签”。
- `ENTITIES`：行业里的主要公司或机构，用于“公司”类主题页。`IDENTITY_LEXICON`、`PUBLISHER_DOMAINS` 用来防止模型在标题摘要里写进原文没提到的公司，别的行业没有这个需要可以清空。
- `ITEM_TYPES`：内容类型。`prompts/content-understanding.md` 里“内容类型”一节列出的类型要和它逐字一致：模型输出的类型不在 `ITEM_TYPES` 里会被代码直接判为无效。`prompts/selection-score.md` 里的类型说明和权重表也要按同样的类型一行一行对应。改了类型就一起改这两份提示词。
- `topics.json`：主题目录（`/topics`）。每个主题的 `group` 只能是 `company`、`field`、`genre` 三者之一（数据库里有约束）；三组在页面上叫什么、简介写什么，在 `site.ts` 的 `TOPIC_GROUPS` 里改，没有主题的组不显示。每个主题用 `tags` 或 `entityId` 决定收哪些内容。`slug` 上线后不要改。

改完主题后运行 `node --env-file=.env scripts/seed.ts`（Docker 里会在启动时自动运行），主题会更新进数据库。

## 3. 信源：`sources.json`

这是首次启动时导入的示范信源，已经存在的不会被覆盖。上线后更常用的是后台“信源”页：能新建、试抓、调频率、看失败原因。

每个信源的关键字段：

| 字段 | 含义 |
|---|---|
| `kind` | `rss`、`web_list`（网页列表，配选择器）、`json_list`（JSON 接口）、`x_search`（X 账号，需要 SocialData）、`mp_account`（公众号，需要极致了）、`external`（外部推送） |
| `config` | 每种信源的配置，见 [信源](sources.md) |
| `tier` | 信源分级：`T1` 官方一手、`T1_5` 官方账号与准官方、`T2` 媒体与个人、`EXCLUDE_MP` 不参与精选。不同分级的入选门槛不同 |
| `participation_mode` | `editorial` 进精选和全部动态；`hot_signal` 只作热度证据；`isolated` 不进任何公开页面 |
| `first_party` | 是不是当事方自己发的（官网、官方账号） |
| `site_fulltext` | 站内能不能展示全文。**默认关**：只展示摘要和原文链接。只有来源明确允许时才打开 |

中国大陆的很多行业，一手信息在公众号上。公众号信源需要极致了（Dajiala）的 key，按请求计费，有预算熔断。

## 4. 精选标准：`prompts/`

这是最值得花时间的一步：你的行业 KnowHow 就写在这里。

| 文件 | 作用 |
|---|---|
| `prefilter.md` | 预筛：这条资料是不是这个行业的事。宽召回，只拦明显无关的 |
| `selection-score.md` | **评分标准**：给 0–100 分。里面有内容类型、五个维度、各类型的权重、必须正常评价的价值、必须压住的噪声 |
| `content-understanding.md` | 入选内容的写法：中文标题、答案先行的摘要、推荐理由、标签 |
| `rules-domain.md` | 行业术语的翻译与保留规则（示例是 AI 术语：LLM 译作大语言模型、Token 保留英文……） |
| `summarize-*.md` | 其他内容的标题摘要写法 |
| `structure.md` | 分类、标签、主体公司、事实的结构化抽取 |
| `group-*.md` | 事件归组：两篇报道是不是同一件事 |
| `story-digest.md`、`report-*.md` | 事件综述、日报导语、周报月报 |
| `translate-*.md` | 全文翻译 |

提示词里用 `{{siteName}}` 指代站名，`{{> 文件名}}` 引用另一份提示词。改提示词不用改代码。

制造与运动健康行业包的标题、摘要、推荐理由、事件综述和日报导语采用简洁、准确的现代书面语：不用口语、营销措辞或冗长公文表达，不直接命令读者；保留主体、事实、关键数字及文章类型，并遵守各入口原有的长度限制。短推文仍以忠实翻译为准。2026-10-29 的措辞调整不涉及预筛、评分权重、入选门槛和安全边界，也不重写已发布内容。两个行业包各用一篇真实文章进行了 Astra 非发布试写，回执 26406、6974 均完成；提示词还需随服务部署后才对后续正式生成生效。

**建议的做法**：先保留结构（五个维度加权、噪声压制规则、安全边界），只把“什么算重要”“什么算噪声”的例子换成你的行业。比如法律行业，“新法规正式公布、重要判决、监管处罚”应该正常评价，“律所营销软文、课程广告”要压住。

## 5. 门槛与校准：`selection.ts`

两次评分之和 ≥ 2 × 门槛才入选。默认门槛（T1 60、T1_5 65、T2 76）是 AIHOT 在 AI 领域校准出来的，换了行业和提示词，需要重新校准：

1. 从你的信源里挑 100–200 条资料，自己标“该选 / 不该选”，存成 `.data/gold.jsonl`（格式见 [精选与校准](selection.md)，行业包里的 `gold.example.jsonl` 有两条示例）。
2. 运行 `node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl`，看准确率、查准率、查全率，和不同门槛下的结果。评的是当前选中的行业包，报告写到 `.data/eval/<行业包>/`，几个行业包的记录互不覆盖。改了行业包里的提示词或门槛，先 `npm run industry` 再评，否则脚本会停下提醒你。
3. 在后台 SelectBench 里逐条看判错的资料，回去改评分提示词或门槛，再跑一遍。

这一步决定了你的站“选得准不准”。

`selection.ts` 里还有两项把关，一般行业保持默认（`strictPrefilter: false`、`bannedWords: []`）：有“不能转的内容”的行业（比如健康），打开 `strictPrefilter`，让预筛拿不准的资料也不公开；`bannedWords` 列出写出来就不发布的词。打开以后用合规样本测一遍预筛，见 [精选与校准](selection.md) 的“合规评测”。

## 6. 只对 AI 有意义的两个模块：`features.ts`

- `leaderboard`：模型榜（`/leaderboard`）。
- `codexResetMonitor`：Codex 重置监控（`/codex-reset`）。

别的行业把两项都设为 `false`：导航入口、定时任务、接口和站点地图都会跟着关掉。想彻底删掉代码，删这些目录并处理掉编译错误即可：`packages/backend/src/leaderboard/`、`packages/backend/src/monitor/`、`apps/web/app/features/leaderboard/`、`apps/web/app/features/monitor/`、`apps/web/app/routes/leaderboard*.tsx`、`apps/web/app/routes/codex-reset.tsx`、`apps/api/src/routes/leaderboard.ts`。

同一个文件里还有 `reports`（日报栏目）：关掉以后 worker 不再注册日报、周报、月报和补做四个定时任务（原来开着的实例重启后会注销它们），不为没人看的日报花模型费用；热点排名、归组等其他定时任务照常。没有日报的板块（比如 `sports`）设为 `false`。

## 7. 品牌：`brand/`

- `logo.svg`、`icon.png`（512）、`icon-192.png`、`apple-icon.png`（180）、`favicon.ico`：站点图标。
- `nameplates/`：日报、周报、月报页顶部的报头字（比如“AI日报”）。换了行业词以后重新生成：
  ```bash
  npm pack @fontsource/noto-sans-sc@5.3.0 && tar xzf fontsource-noto-sans-sc-5.3.0.tgz
  node scripts/nameplates.ts package
  ```
  它写进当前选中的行业包的 `brand/nameplates/`，再重新选一次。
- 关于页的二维码：在后台“设置”里上传，或者把图片放进行业包的 `brand/contact/`。
- 网页左上角的站名标志在 `apps/web/app/components/Logo.tsx`，默认用站名文字；有自己的 Logo 可以换成图片。

请不要使用 AIHOT 的名字和 Logo。

## 8. 页面文案：`pages/`、`changelog.json`

- `pages/terms.md`、`pages/privacy.md`：使用规则和隐私说明。**现在是模板**，上线前按你的实际情况改写，必要时请专业人士看一下。
- `changelog.json`：更新日志。新条目写在最前面，把 `latestVersion` 改成它的日期和时间。

## 9. 模型和部署

- 模型：`.env` 里的 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`，任何 OpenAI 兼容接口都行，所有步骤默认都用它。想让某一步用别家模型，见 `.env.example`。
- 部署：见 [部署](deploy.md)。

## 上游改了行业包时

这个仓库是从上游框架 fork 出来的，上游的行业包还放在 `industry/`（AI 示例站）。合并上游时，上游对 `industry/` 的改动要搬进这里的行业包目录，而不是留在 `industry/`：

1. **合并之前**先看上游这次改了 `industry/` 的什么（合并以后共同祖先就变了，这条命令看不到了）：
   ```bash
   git fetch upstream
   git diff $(git merge-base HEAD upstream/main) upstream/main --stat -- industry/
   git diff $(git merge-base HEAD upstream/main) upstream/main -- industry/
   ```
2. 合并上游（`git merge upstream/main`）。`industry/` 里的冲突不用一处处解决，第 4 步会整个重新生成。`industry/package.json`、`industry/tsconfig.json` 是框架文件，按上游的改；`industry/README.md` 保留这边的（它说明这个文件夹是生成的）。
3. 把第 1 步里属于框架的改动搬进**每一个**行业包目录，按各自的行业改写：新增、删除或改名的提示词文件，提示词里新的 `{{占位}}` 和 `{{> 引用}}`，`site.ts`、`taxonomy.ts`、`features.ts`、`selection.ts` 新加的导出和字段，新的品牌文件或页面。只属于 AI 示例站的内容（示范信源、AI 行业的例子和词表、品牌图）不搬。
4. 重新生成并检查：
   ```bash
   node scripts/select-industry.ts manufacturing && git add industry/   # industry/ 按制造行业包重新生成，冲突随之解决
   INDUSTRY_PACK=<名字> npm run typecheck                              # 每个行业包都跑一遍类型检查和测试（测试要 DATABASE_URL，见下文）
   INDUSTRY_PACK=<名字> npm test
   node scripts/select-industry.ts manufacturing                        # 切回制造行业包
   node scripts/select-industry.ts --check manufacturing                # 通过再提交
   ```

## 改完以后检查

```bash
npm run typecheck                                    # 先按 INDUSTRY_PACK 选行业包（不设就是 manufacturing）
DATABASE_URL=postgres://…/myhot_test npm test        # 库名必须以 _test 或 _ci 结尾
node scripts/smoke.ts --base http://localhost:3000   # 站点跑起来以后
```

`tests/` 里的测试从选中的行业包取分类、标签和公司的例子。改了 `taxonomy.ts` 以后如果还有测试失败，把写死的例子换成你行业里的对应项（最好从 `@aihot/industry/*` 取值），测的规则本身不用改。

然后打开网站看一眼首页、全部动态、日报和关于页，再去后台“信源”页看信源是不是都抓成功了。
