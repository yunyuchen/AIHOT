# 锐奇微报 小程序

微信小程序“锐奇微报”，Taro 4（React、TypeScript、webpack5）。两个板块：制造（精选、日报 tab）和运动健康（运动健康 tab），
分别请求两个行业实例的公开出口 `/api/mp/v1`。规格见 `docs/specs/reechi-hot-v1-spec.md` 的“小程序工程”，视觉基准是
`docs/design/miniprogram-prototype/editorial-r/`（2026-10-29 确认的编辑式阅读版）；`a/` 保留为历史原型。

2026-10-29：小程序名称改为“锐奇微报”，同步应用内文案、分享标题和分享图品牌；网站“锐奇制造日报”名称不变。历史原型和 ADR 保留当时名称。微信公众平台的账号名称需要管理员另行修改，代码改名不会自动同步平台名称。

同日落地编辑式 UI：精选深墨头条、日报日期刊头、运动健康暖纸阅读区、收藏板块筛选、锐奇产品展示和详情阅读页；五个 tab 使用自定义悬浮导航。接口、分享路径、本机存储和订阅提醒流程沿用现有实现，不导入原型示例资讯或浏览器 GSAP 动画。

这是一个**独立的 npm 包**：自己的 `package.json` 和 `package-lock.json`，不在根 workspaces 里，后端镜像和根目录的 CI 不装它的依赖。

## 安装

Node.js 24。在这个目录里：

```bash
npm ci --no-workspaces
```

`--no-workspaces` 让 npm 把这个目录当独立的包，不往上找根项目的工作区（根 `package.json` 的 `apps/*` 会匹配到这里）。
加依赖同样带上它：`npm install --no-workspaces <包名>`。

## 构建与检查

| 命令 | 作用 |
|---|---|
| `npm run dev:weapp` | 开发配置，监听改动持续编译到 `dist/` |
| `npm run build:weapp` | 正式配置构建（上传正式版用这个） |
| `npm run build:weapp:trial` | 体验配置构建 |
| `npm run build:weapp:dev` | 开发配置构建一次（压缩，不监听） |
| `npm run build:weapp:no-sports` | 备用构建：正式配置去掉运动健康 tab，产物在 `dist-no-sports/`，见“备用构建” |
| `npm run typecheck` | 类型检查 |
| `npm test` | 纯函数单测（`tests/`，node:test，不依赖微信运行时；纯逻辑文件之间的 import 写 `.ts` 后缀，node 才找得到） |
| `npm run icons` | 重新生成 tabBar 图标、logo 等小图和分享的本地兜底图（要本机有 ImageMagick 的 `magick`） |

CI 见 `.github/workflows/miniprogram.yml`：只在这个目录、`packages/contracts/` 或行业包的分类表（`industry-packs/*/taxonomy.ts`，
单测拿它核对分类配色表的 key）变了时跑，按正式配置构建完整版和备用版，确认完整版五个 tab、备用版四个 tab，产物里没有
`127.0.0.1`、`localhost` 这类开发地址、没有 source map，主包不超过 2MB（超过 1.5MB 的目标只打警告），最后把备用版上传成
artifact `miniprogram-no-sports`。主包的口径是 `dist/`（备用版 `dist-no-sports/`）下所有文件的字节数之和：所有页面都放主包、
不分包，整份目录就是上传的代码包。

## 在微信开发者工具里打开

1. 先构建（`npm run dev:weapp` 或 `npm run build:weapp`）。
2. 开发者工具里“导入项目”，目录选 `apps/miniprogram/dist`（Taro 会把 `project.config.json` 复制进去）。
3. AppID 先是 `touristappid`（游客模式）；有了正式 AppID 改 `project.config.json` 的 `appid` 再构建。
4. 开发配置请求本机的 `http://127.0.0.1:3001`（制造）和 `http://127.0.0.1:3002`（运动健康），要在“详情 › 本地设置”里勾上
   “不校验合法域名”。本机先按 `docs/deploy.md` 把制造行业实例的 api 跑起来；运动健康是第二套行业实例（自己的数据库，选
   `sports` 行业包），api 用 `API_PORT=3002` 起。只起制造时，运动健康 tab 是“加载失败”，别的 tab 照常。
5. 备用构建的产物在 `dist-no-sports/`，另导入一个项目打开（同一个 AppID 可以导入两个目录）。

## 三份构建期配置

`config/boards.dev.ts`（开发）、`config/boards.trial.ts`（体验）、`config/boards.prod.ts`（正式），形状在 `config/boards.ts`。
`--mode dev|trial|prod` 选一份（`config/modes.ts`，后面加 `-no-sports` 是备用构建），经 `defineConstants` 注入成全局常量
`BUILD_CONFIG`，代码里用 `src/lib/build-config.ts` 读；`src/app.config.ts` 也读它，tabBar 和页面表按板块列表推出来
（`src/lib/tabs.ts`），不另写一份。

每份写明板块列表（顺序固定）。两个板块除了 `apiBase` 三份都一样，写在 `config/boards.ts` 的 `MANUFACTURING_BOARD`、`SPORTS_BOARD`，
三份各自只填 `apiBase`：

- `key`：`manufacturing`、`sports`，写进分享路径和收藏记录，上线后不改。启动后元信息的 `board.key` 对不上时页面显示错误态（说明 api 地址配错了）。
- `apiBase`：该行业实例的地址，请求拼成 `{apiBase}/api/mp/v1/…`。体验和正式必须是 https，否则构建直接报错。
- `name`：板块名兜底值，运行时以元信息的 `board.name` 为准。
- `tabs`：所在 tab。
- `focusCard`：精选流是否渲染焦点卡（制造是、运动健康否）。
- `filterBar`：精选流有没有分类筛选条（制造和运动健康都开启）。
- `byDay`：按天看的精选流（运动健康）：列表按天分段、卡片不显示时刻，头部写板块名和板块说明。
- `categoryColors`：分类 key → 色值；不认识的 key 用兜底灰 `#8a959e`。运动健康的表 key 照行业包的草案分类，值在待定 D3
  （老板确认分类）定下前一律是兜底灰；单测核对两张表的 key 和各自行业包 `industry-packs/*/taxonomy.ts` 的分类一致。
- `reminderTemplateId`：“提醒我明天的日报”的一次性订阅模板 id，只有制造配，必须和该行业实例的 `WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID`
  一字不差。三份现在都留空（客户还没申请到模板），空着时不画提醒按钮，见“提醒”。

**两个域名**（2026-10-18 定）：体验和正式的制造 `apiBase` 是 `https://hot.yunyuchen.fun`，运动健康是 `https://sports.yunyuchen.fun`，都在大陆机上、已备案过白，要加进小程序后台的 request 合法域名和 downloadFile 合法域名。制造从香港搬到大陆机（票 29）之前，`hot.yunyuchen.fun` 上还没有制造的内容，体验版的精选和日报 tab 会是“加载失败”。

2026-10-29 真机连接问题排查：两个公开接口均返回 200，证书校验正常；开发工具开启域名校验后，两个域名均返回 `request:fail url not in domain list`。本地 `project.private.config.json` 的 `urlCheck: false` 会掩盖此问题，不代表手机可访问。管理员须在同一 AppID 的微信后台「开发管理 → 开发设置 → 服务器域名」配置上述 request 合法域名；图片下载所需的 downloadFile 域名也应同步核对。配置后刷新开发工具域名信息，并在开启校验的情况下及手机端验证，不能靠关闭校验交付。

## 备用构建

规格风险 R11：整改开关的占位只用来争取时间，长期挂着可能被审核认定为“页面没有实际内容”。所以平时就维护一个去掉运动健康 tab 的构建，
运动健康一时整改不完时，一天内能换成它提审。

- **怎么构建**：`npm run build:weapp:no-sports`，即 `--mode prod-no-sports`。`config/modes.ts` 的 `buildTarget` 取正式配置，用
  `dropBoard` 去掉 `sports` 板块，产物放 `dist-no-sports/`，不覆盖完整版的 `dist/`。体验和开发配置也认 `-no-sports` 后缀
  （`trial-no-sports`、`dev-no-sports`，没写 npm 脚本，用 `npx taro build --type weapp --mode trial-no-sports`）；别的模式名构建时直接报错。
- **少了什么**：tabBar 和页面表都由板块列表推出来（`src/lib/tabs.ts`），所以只剩精选、日报、收藏、锐奇四个 tab，`pages/sports/index`
  不编译、不进包，运动健康的 tab 图标也不复制。制造的配置原样不动。条目页、事件页还在：会话里旧的分享卡片带 `board=sports` 点进来时，
  `drillTarget` 不认这个板块，不发请求，直接“已下线或不存在”加“回到精选”。元信息只读构建配置里有的板块，运动健康的本机快照不读也不删，
  换回完整版后照常用。
- **CI**：`.github/workflows/miniprogram.yml` 每次都构建完整版和备用版，核对完整版五个 tab、备用版四个 tab 且没有运动健康页，两份都查
  开发地址、source map 和 2MB，再把 `dist-no-sports/` 上传成 artifact `miniprogram-no-sports`。备用版跟着每次改动一起构建、一起检查，
  不会在要用的那天才发现坏了。
- **一天内提审**：
  1. 拿产物：本机在要提审的提交上 `npm run build:weapp:no-sports`；或者到 GitHub Actions 里这个提交的 Miniprogram 运行页下载 artifact
     `miniprogram-no-sports` 解压（里面就是 `dist-no-sports/` 的内容，CI 用的是当时提交里的正式配置）。
  2. 开发者工具“导入项目”选这个目录（AppID 读里面的 `project.config.json`，提审前要是正式 AppID），预览确认只有四个 tab，精选、日报、
     条目页、事件页正常。
  3. 上传，在公众平台提交审核；版本描述和审核备注里不再写运动健康。
  4. 运动健康整改好以后，下一版回到 `npm run build:weapp`，恢复五个 tab。

## 契约类型

接口的响应类型在契约包 `packages/contracts/src/miniprogram.ts`。小程序用 `tsconfig.json` 的 `paths` 把
`@aihot/contracts/miniprogram` 指到这个源文件，只用 `import type` 导入：类型检查时读它，构建时被擦掉，打包不会去解析它。
没有用 `file:../../packages/contracts` 做 npm 依赖，因为契约包的 `package.json` 依赖 `@aihot/industry`，这个包不在 npm 上，
独立的 `npm ci` 解析不了。契约的小程序部分不能依赖行业包，如果它 import 了行业包，这里的类型检查会失败。

## 目录

- `config/`：Taro 构建配置、三份构建期配置和 `--mode` 的解析（`modes.ts`）。
- `src/app.config.ts`：页面与 tab 列表（五个 tab，备用构建四个；都由 `src/lib/tabs.ts` 按板块列表推出来）、原生导航栏、
  `networkTimeout`、`darkmode: false`。所有页面的原生标题栏统一为深墨底（`#151f21`）、白字，沿用全局配置，不按页面切换深浅；正文配色不变。
- `src/custom-tab-bar/`、`src/lib/use-active-tab.ts`：自定义悬浮 tabBar；各 tab 在 `useDidShow` 同步选中路由，点击通过 `switchTab` 跳转。
  导航底边贴 `safe-area-inset-bottom`，不再额外悬空 10px；页面预留为 94px 加安全区，避免最后一条内容被导航遮挡。
- `src/styles/tokens.scss`：编辑式阅读版颜色变量；`src/app.scss` 挂载 CSS 变量，并预留悬浮导航与底部安全区。
- `src/lib/request.ts`：请求封装。按板块取 api 基址，超时 10 秒，不加自定义请求头，不开 `enableCache`，同时最多 3 个请求；失败按错误码表映射（`src/lib/errors.ts`）。
  读接口 `getJson`，提醒接口 `postJson`，分享图的预检 `headStatus`（HEAD 一个绝对地址）。
- `src/lib/meta-context.tsx`、`src/lib/meta-store.ts`：两个板块的元信息放在一个 React context 里；状态和请求规则在 `meta-store.ts`
  （纯逻辑，按板块分开，见“运动健康”），节流规则见下面的“下拉刷新与请求节流”，快照见“状态与快照”。
- `src/lib/storage.ts`、`src/lib/wx-storage.ts`：本机存储的封装（带版本号的 key、try/catch、快照读写）和它接上微信存储的那一层，见“状态与快照”。
- `src/lib/feed.ts`、`src/lib/use-feed.ts`：精选流的分页状态和接它的 hook，见下面的“精选流：列表与分页”。
- `src/lib/card.ts`：卡片的显示规则（分类色标、“N 家在报”、“AI 摘要”角标）；`src/lib/beijing.ts` 的 `displayTime` 是统一的时间显示。
- `src/lib/timeline.ts`、`src/lib/fresh.ts`：列表分段、请求节流（含离开 30 分钟重拉），都是纯函数，见下面的“精选流：时间分段与刷新”。
- `src/lib/screen.ts`：各页整屏状态共用的部分：板块这一关（配置有误、占位，`boardGate`）、“网络不好”的提示和快照时间标记，纯函数。
- `src/lib/feed-screen.ts`：精选 tab 和运动健康 tab 整屏显示哪种状态（配置有误、占位、加载失败、加载中、空态、内容）和画不画焦点卡，纯函数，见“状态与快照”“今日焦点卡”。
- `src/lib/board-feed.ts`：精选流里按板块不同的显示规则（分类筛选条、心理援助热线），纯函数，见“运动健康”。
- `src/lib/item.ts`、`src/lib/use-item.ts`：条目页的响应核对、整屏状态、显示规则（含站内全文）（纯函数）和接 `getJson` 的 hook，见“条目页”。
- `src/lib/story.ts`、`src/lib/use-story.ts`：事件页的响应核对、整屏状态、显示规则（报道时间轴）和 hook，见“事件页”。
- `src/lib/daily.ts`、`src/lib/use-daily.ts`：日报的响应核对、翻期和刷新的状态（含快照）、整屏状态、显示规则和 hook，日报 tab 和某期日报页共用，见“日报”。
- `src/lib/share.ts`、`src/lib/use-share.ts`：分享卡片的标题、路径和图（纯函数）和接上 `useShareAppMessage`、本地兜底图、分享图预检的 hook，见“分享”。
- `src/lib/reminder.ts`：“提醒我明天的日报”的整串（订阅授权、登录、写接口）和各种结果给读者看什么，纯函数，微信和网络接口注入，见“提醒”。
- `src/lib/page-stack.ts`、`src/lib/open-page.ts`：下钻页的地址、参数解析、页面栈到 9 层改用 `redirectTo` 的规则（纯函数）和接上 Taro 跳转的那一层。
- `src/lib/saved.ts`、`src/lib/use-saved.ts`：收藏的记录、300 条上限、快照更新、占位时隐藏板块（纯函数，存储注入）和接上微信存储、React、
  提示的那一层；`src/lib/read.ts`、`src/lib/use-read.ts`：已读的记录、每板块 1000 条和 30 天淘汰，和接上的那一层。见“收藏与已读”。
- `src/components/board-feed/`：一个板块的精选流整屏（头部、焦点卡、筛选条、分段列表，以及刷新和节流），精选 tab 和运动健康
  tab 的页面只是 `<BoardFeed board=… />`。
- `src/components/dashboard/`：刊头（logo 小标、制造页的日期，或运动健康的板块名）；不再展示板块介绍、三个统计读数或扫描条。
- `src/components/feed-list/`：精选流的时间轴和卡片；`src/components/focus-card/`：今日焦点卡；`src/components/ai-badge/`：“AI 摘要”角标；
  `src/components/category-tag/`：分类色标（精选卡片、焦点卡、条目页共用）；`src/components/filter-bar/`：分类筛选条；
  `src/components/hotline/`：心理援助热线（卡片上一行、条目页一张卡）。
- `src/components/page-state/`：整屏的状态块（加载失败、空态、占位、配置有误，文档页的“没有这篇文档”也用它）和有内容时失败的顶部提示条；
  `src/components/drill-state/`：下钻页共用的“已下线或不存在”和占位（收到 `section_paused` 时强制重拉一次元信息取占位文案）。
- `src/components/share-button/`：`open-type="share"` 的按钮（条目页“分享给同事”、日报头条卡“分享日报”）；`src/components/remind-button/`：
  “提醒我明天的日报”按钮，接上 Taro 的订阅授权、登录、提示和“去设置”弹窗。分享的本地兜底图 `src/assets/share/fallback.png` 也由
  `scripts/tab-icons.ts` 生成。见“分享”“提醒”。
- `src/components/daily-issue/`：一期日报的整屏（头部、头条卡、分节、页尾和各种状态），日报 tab 和某期日报页共用。
- `src/components/save-button/`：“收藏”按钮，条目页和日报头条卡的按钮行共用，自己管收藏、取消和提示。
- `src/assets/tab/`：tabBar 图标，10 张 81×81 PNG，由 `scripts/tab-icons.ts` 生成；同一个脚本还生成 `logo.png` 和焦点卡标识 `star-ink.png`。
  条目页的收藏、分享、复制、箭头图标在 `src/assets/item/`，日报头部的前一天、后一天箭头和提醒铃铛在
  `src/assets/daily/`，收藏以后的实心书签 `item/bookmark-on.png` 和收藏页的手机、文档、书签、圆圈 i 在 `src/assets/saved/`，
  也由它生成（“分享日报”用 `item/share.png`）。
- 主品牌图标采用“折页 R”（2026-10-29 确认）：深墨底 `#13191c`、青色 R `#2ce2e8`、白色折角。`src/assets/logo.png` 为头部 72×72 图，
  `src/assets/reechi/logo.png` 为锐奇页 168×168 图；AI 摘要改用竖线文字标识。路径定义在 `scripts/tab-icons.ts` 的 `LOGO_MARK`，`npm run icons` 统一生成。
- `brand/app-icon.png`：微信公众平台后台头像，512×512、不透明满底 PNG，管理员手动上传。放在 `src/` 外，不进入小程序代码包；圆角由平台裁切，不预先挖透明圆角。
- `src/assets/editorial/`：锐奇官网射线激光一体机与涂布在线测量场景图片，来源为 `https://www.reechitech.cn/?product_12/296.html`、`https://www.reechitech.cn/?news_71/376.html`。仅在锐奇页作为注明来源的公司产品配图使用，不冒充资讯现场。
- `src/assets/editorial/sports-running.jpg`：运动健康栏目封面，复用已确认原型的户外登阶运动照片（[Unsplash 原图](https://images.unsplash.com/photo-1476480862126-209bfaa8edc8)），900×600 JPEG，约 161 KiB。本地随包加载，标注“栏目配图 · Unsplash”，不作为单条新闻现场图；仅由运动健康页引入，无运动健康备用包不包含它。
- `src/pages/feed/`、`src/pages/sports/`：精选 tab 和运动健康 tab，都是 `components/board-feed`。
- `src/pages/item/`：条目页（下钻页，参数 `board`、`id`），见“条目页”。
- `src/pages/story/`：事件页（下钻页，参数 `board`、`id`），见“事件页”。
- `src/pages/daily/`、`src/pages/daily-issue/`：日报 tab 和某期日报页（下钻页，参数 `date`，另带 `board`），见“日报”。
- `src/pages/saved/`：收藏 tab，只读本机，见“收藏与已读”。
- `src/pages/reechi/`、`src/pages/doc/`：锐奇 tab 和文档页（下钻页，参数 `name` 为 `about`、`agreement`、`privacy`），都是静态内容，不请求接口。
  文案在 `src/content/`，从 `docs/drafts/compliance/` 的草稿抄来，定稿后怎么换、哪几段必须一字不差见 `src/content/README.md`；
  图标和大 logo 在 `src/assets/reechi/`，也由 `scripts/tab-icons.ts` 生成。

## 精选流：列表与分页

精选 tab 请求 `GET {apiBase}/api/mp/v1/feed?limit=20`，一页 20 张卡，按时间倒序画成一列，每张卡挂在左侧的竖轴上。

- **卡片**：时刻用 `anchorAt`，按规格的时间显示规则（北京时间：当天 `HH:mm`，昨天“昨天 HH:mm”，今年更早 `MM-DD HH:mm`，
  跨年 `YYYY-MM-DD`）；分类色标的颜色取构建配置的 `categoryColors`，不认识的 key 用兜底灰，`category` 为 null 不画，
  分类名取元信息的 `categories`（元信息还没到时先显示 key）；标题两行、摘要三行截断；来源名；`sourceCount ≥ 2` 才显示
  “N 家在报”；`ai.title` 或 `ai.summary` 为真时右上角显示“AI 摘要”。
- **分页**：触底用上一页的 `page.nextCursor` 请求下一页追加（按 id 去重）；`hasMore` 为 false（或没给游标）时不再请求，
  底部显示“没有更早的了”。续页失败不清空已加载的卡，底部点一下重试。
- **游标失效**：续页回 400 `invalid_cursor`（游标坏了，或和筛选参数对不上）时，丢掉已加载的续页、只留第一页的卡，
  从第一页重新加载一次。重载之后还没成功拿到续页就又收到 `invalid_cursor`，按普通失败处理，不再重载，免得来回循环。
- **代码分层**：`src/lib/feed.ts` 是纯逻辑（响应核对、请求路径、分页状态），请求由调用方注入，单测直接跑
  （`tests/feed.test.ts`）；`src/lib/use-feed.ts` 把它接到 `getJson` 和 React 状态上，参数是板块和分类筛选，精选 tab 和
  运动健康 tab 共用。每次从第一页加载都会作废还没回来的旧请求。

## 精选流：时间分段与刷新

- **时间轴分段**（`src/lib/timeline.ts`）：按卡片 `anchorAt` 的北京时间分段，对已加载的卡片做，触底追加后整份重算，所以段头的
  条数是已加载的条数。今天分凌晨（0–6 时）、上午（6–12 时）、下午（12–18 时）、晚间（18 时以后）；往日按天，昨天写“昨天”加小字
  日期（“10月16日”），更早的写日期（“10月15日”，跨年带年份“2025年12月31日”）。段按时间倒序，没有卡片的段不画。
  段头显示名称、日期和已加载条数；不再绘制星形节点、连线或扫描条。今天还没有精选、往日有内容时直接从往日开始，不算空态。
- **下拉刷新与请求节流**：精选页和运动健康页开 `enablePullDownRefresh`。下拉强制重拉元信息和第一页，两个都回来
  才收起。切回精选 tab（`useDidShow`）时不强制：元信息和第一页上次的响应在 60 秒内、并且还没过精选流响应给的 `refreshAt` 就不请求
  （`src/lib/fresh.ts` 的 `isFresh`，元信息和第一页共用）；过了 `refreshAt` 不到 60 秒也重拉。另外，读者已经往下加载过续页时，
  切回不重拉第一页，免得把看到一半的列表收回成 20 张，要看新的就下拉（元信息仍按规则刷新）。已经有元信息时
  重拉期间照旧显示旧的，重拉失败也留着旧的。
- **离开超过 30 分钟**（D26，`fresh.ts` 的 `awayTooLong`）：页面隐藏（切到微信后台、切到别的 tab）时记下时刻，再显示时离开超过
  30 分钟（正好 30 分钟不算）就强制重拉元信息和第一页，已经加载的续页也收回、页面滚回顶上，上面“不收回续页”只在 30 分钟以内成立。
  重拉失败时列表不清空，走“状态与快照”里的顶部提示。本机时钟往回拨过也算离开很久。离开按页面隐藏算，切到别的 tab、进下钻页也算。

## 状态与快照

- **本机存储**（`src/lib/storage.ts`）：key 只从 `STORAGE_KEYS` 取，名字照规格的本机存储表，都带版本号：`saved.v1`、`read.v1`、
  `snap.v1.{board}.meta`、`snap.v1.{board}.feed`、`snap.v1.{board}.daily`（只有制造有日报）。形状改了就换版本号，旧 key 自然读不到。读写都包
  try/catch：存储满了、被禁用、底层抛错时读回 null、写回 false，不往外抛，阅读不受影响（收藏以后据写入的 false 提示失败）。读的时候
  一律交给核对函数看形状，旧版本写的、被改坏的当没有。底层读写是注入的（`wx-storage.ts` 接 `Taro.getStorageSync` 那一套），
  单测用内存假存储（`tests/storage.test.ts`）。收藏 300 条、已读每板块 1000 条和 30 天淘汰见“收藏与已读”。
- **快照**：元信息、不带分类筛选的精选第一页和日报的最新一期，每次成功都把整份响应和拉取时刻（`{ data, fetchedAt }`）覆盖写进去，
  不合并；续页、往期日报不存。
  冷启动时元信息 context 和精选流先放快照（第一次渲染就带上，不闪“加载中”），再照常请求；快照不算这次会话的响应，`fetchedAt`
  为 null，第一次检查一定重拉。列表还是快照、刷新还没回来时，精选与运动健康在头部 logo 行右边标“08:05 的内容”，日报在日期切换区下方标注
  （快照的 `generatedAt`，按统一时间显示，不是今天写“昨天 22:40”）。
- **占位和快照**：占位的元信息照样写快照（收藏 tab 要据此先隐藏这个板块，见“收藏与已读”），但冷启动不拿占位的快照显示，占位只认这次会话里
  拿到的响应。拿到占位的元信息时删掉精选第一页和日报的快照，第一页或日报回 `section_paused` 时删掉各自的快照，所以占位期间不写
  内容快照、下次冷启动也不会先放出旧内容。
- **整屏状态**（`src/lib/feed-screen.ts`，优先级从高到低；1、2 是 `screen.ts` 的 `boardGate`，日报共用）：
  1. 配置有误：元信息的 `board.key` 和构建配置对不上，别的都不作数。
  2. 占位：这次会话里的元信息 `status` 是 `placeholder`，或者精选流（第一页、续页）回了 `section_paused`。整屏只留刊头 logo 行
     和占位文案：优先元信息的 `placeholder`（标题加正文），为 null 或标题为空时用内置的“这个板块正在调整，暂不提供内容”（D30）。
     连不上、超时、503 永远不会变成占位。
  3. 加载失败：手上一张卡都没有时元信息或第一页失败了，显示“加载失败”、一句原因和重试。
  4. 加载中：还没有卡片，第一页还没回来。
  5. 空态：第一页成功回来、一张卡都没有，“最近还没有精选”（和加载失败同一个组件）。今天没有、往日有不算空态。
  6. 内容：有卡片就显示，哪怕是快照。这时第一页（下拉、切回、冷启动刷新）或元信息失败，列表不清空，头部下面一条“网络不好，显示的是
     08:05 的内容”（正在显示的第一页的 `generatedAt`），整条可点重试；有这条提示时头部不再标快照时间。续页失败只在底部重试，不出这条。
- **占位的检查**：精选 tab 和运动健康 tab 每次显示都按 60 秒规则检查元信息。占位期间切回只查元信息、不请求精选流，触底也不加载；元信息从占位变回
  正常时，精选流从第一页重新加载。下拉刷新照样两个都拉。
- **重试**：加载失败的按钮和顶部提示条一样：元信息失败了或还只是快照就强制重拉，第一页失败重拉第一页。
- **版本更新**（`src/app.tsx`）：启动时挂上 `Taro.getUpdateManager()`，新版本下载完弹“有新版本，重启后生效”（重启 / 稍后），点重启
  调 `applyUpdate`；点稍后下次冷启动自然用上。接口不可用、下载失败、弹窗失败都静默。开发版和体验版没有“版本”，要在开发者工具里用
  “下次编译模拟更新”看。

## 今日焦点卡

- **画不画**（`feed-screen.ts` 的 `visibleFocus`）：构建配置里板块的 `focusCard` 为真（制造是、运动健康否），整屏是“内容”（含快照、
  含“网络不好”的提示），并且正在显示的第一页带了 `feed.focus` 才画。占位、配置有误、加载失败、加载中、空态都按整屏状态走，不画焦点卡。
  焦点卡跟着第一页走：冷启动从快照放出来，刷新成功换成新的，续页不改它；带分类筛选的列表不收焦点卡。`checkFeed` 收到形状不对的
  `focus` 只当没有焦点卡，不连累整页。
- **样子**：深墨色头条区，“今日焦点”、分类、AI 标识（标题或摘要任一为真）、大标题与摘要；“读摘要”按钮打开真实条目。
  ≥ 2 个来源时显示“N 家在报”；来源名按首报先后用顿号连接，为空时用卡片来源名；保留最新报道的北京时间，不出名次和热度，不硬配产品图。
- **去重**：时间轴画之前按 id 去掉焦点那张（`feed.ts` 的 `withoutFocus`），段头条数按去掉以后的算。不渲染焦点卡的板块不去（不然那张卡就
  看不到了）。已加载的卡只有焦点那一张时不画轴，只留底部状态。
- 点焦点卡进条目页，和时间轴里的卡片一样。

## 条目页

- **路由**：`pages/item/index?board=…&id=…`，两个板块共用，`board` 决定请求哪个行业实例的 `items/{id}`。路由和参数名上线后不改。
  微信交给页面的参数不解码，`page-stack.ts` 的 `drillTarget` 解一次；没有 `id`、`board` 不在构建配置里时不请求，直接“已下线或不存在”。
- **怎么进来**：精选卡片和焦点卡点击 `openPage(itemPage(board, id))`。页面栈不到 9 层用 `navigateTo`，到 9 层及以上改用 `redirectTo`
  替换当前页（`page-stack.ts` 的 `navigation`，微信上限 10 层）；连点两下 600ms 内只开一次。
- **导航栏**：原生导航栏（D33）放返回和“条目详情”。从分享卡片直接进来（栈底不是首页）时，微信 7.0.7 起自己把左上角换成“回首页”按钮，
  回到 `app.config` 的第一个页面，即精选 tab；有上一页时是返回。所以不自己画返回和回首页。
- **内容**（`item.ts` 的 `itemView`）：主卡是分类色标、标题上方一行的“AI 摘要”（标题或摘要任一为真）、标题、完整摘要（标题、摘要、
  “为什么值得看”都可以长按选择）、“为什么值得看”（`reason` 有内容才显示，块标题右边按 `ai.reason` 单独标“AI 摘要”），下面“收藏”和
  “分享给同事”两个按钮（收藏见“收藏与已读”，分享见“分享”）。来源卡是来源名、“MM-DD 发布”（只取 `publishedAt` 的北京日期，今年写
  MM-DD、跨年写 YYYY-MM-DD，`beijing.ts` 的 `displayDate`）、“复制来源链接”和一句说明（见下面的“站内全文”）。没归进事件、同一事实的
  `sourceCount ≥ 2` 时，发布日期后面跟“· N 家在报”（和卡片上同一个数）。归进事件时下面是事件入口卡“同一件事，N 家在报”（N 用事件层级的
  `story.sourceCount`，条目自己为 1 时照样显示），列出 `otherSourceNames`（没列全加“等”）“也报道了，看事件脉络”，点进事件页
  （`openPage(storyPage(board, story.id))`）。
- **站内全文**（票 13，`item.ts` 的 `itemView().body`）：`fullText.allowed` 为真并且 `html` 有内容时，主卡下面、来源卡上面一张正文卡：
  块标题“正文”（`translated` 为真时写“译文”），`ai.body` 为真（正文是模型译文）时块标题右边再标一次“AI 摘要”，来源自带的译文和中文原文
  不标（只看 `ai.body`，不靠 `translated` 推）；译文没译完（`translated` 且 `complete` 为假）时多一行“译文还不完整，完整内容请复制来源链接
  查看原文”。正文用 `<RichText nodes={html} userSelect>` 画，容器给字号 15、行高 1.7；页面的 wxss 管不到 rich-text 里的节点，所以
  段落、h2–h4、列表、引用、表格的间距和样子由 `bodyNodes` 写成行内样式（已经带 style 的标签不动，接口给图片带的 `max-width:100%` 留着），
  接口固定加在末尾的“完整排版请复制来源链接查看”画成小字。来源卡的说明三种：不允许（或允许但没给正文，页面上只有摘要）时
  “这里只展示摘要，原文版权归来源所有。复制链接后可在浏览器里打开原文。”；有正文时“来源允许站内阅读全文，以上正文由来源提供，原文版权
  归来源所有。”；正文是模型译文时“来源允许站内阅读全文，以上正文由模型从来源原文译成中文，原文版权归来源所有。”
- **复制来源链接**：`Taro.setClipboardData(originalUrl)`，成功后提示“已复制，可到浏览器打开”（盖掉微信自带的“内容已复制”）。
  第一次调用按平台默认弹剪切板隐私授权（D34，不自己做弹窗）。写入失败或读者拒绝时弹出一张卡片，链接文字可以长按选择，读者自己复制到浏览器。
  小程序内不打开任何外部网页。
- **整屏状态**（`item.ts` 的 `itemScreen`）：加载中是主卡位置一行“加载中…”；404 或参数不对是“已下线或不存在”加“回到精选”（运动健康
  回运动健康 tab，`switchTab` 关掉上面的下钻页；收藏过的条目前面多一个“从收藏移除”）；403 `section_paused` 是和精选 tab 一样的占位文案
  （收到时强制重拉一次这个板块的元信息，用行业包给的文案，没有用内置文案）；连不上、超时、503、形状不对是“加载失败”加重试。不开下拉刷新，不写本机快照。
- **分类名**从元信息读：context 里的元信息还新鲜就不请求，从分享直接进来时请求一次元信息，回来之前色标先显示 key（同精选卡片）。

## 事件页

- **路由**：`pages/story/index?board=…&id=…`，两个板块共用，参数解析同条目页（`drillTarget`）。从条目页的事件入口卡进来；报道点进条目页。
  条目页和事件页之间来回点，页面栈到 9 层以后改用 `redirectTo`（`page-stack.ts` 的 `navigation`，单测走了 20 次来回）。
- **导航栏**：原生导航栏放返回和“事件”，下面一条 24 的墨色，事件卡往上压 16（原型）。不定义 `onShareAppMessage`，右上角转发是灰的（事件页不分享）。
- **事件卡**（`story.ts` 的 `storyView`）：“N 家在报”（事件层级 `sourceCount`，圆点最多 5 个，只有一家也显示），竖线隔开的“首报 MM-DD HH:mm”
  “最新 MM-DD HH:mm”（`firstReportAt`、`latestAt` 的北京时间，今年固定写日期加时刻，跨年写 YYYY-MM-DD，`beijing.ts` 的 `dayClock`），
  标题（`ai.title` 为真时“AI 摘要”跟在标题最后一个字后面），“事件综述”块（`digest`，块标题右边按 `ai.digest` 标；为 null 或空白整块不显示）。
  标题和综述可以长按选择。
- **谁在报，怎么说**：块标题右边任一报道的 `ai.title` 为真就标一次“AI 摘要”，再右边“按发布时间”。`reports` 按 `publishedAt` 从早到晚画成竖直
  时间轴（接口已排好，这里再排一次：同一时刻保持接口顺序，解析不了的排最后）：墨色圆点节点、轴段连到下一条；第一条带“首报”，最后一条带
  “最新”、节点是星青实心圈描墨边、往下接虚线；只有一条时它带“首报”、节点按最新画。每条是来源名、日期（只取 `publishedAt` 的北京日期，规格
  “事件页报道行只取日期”）、报道标题；`itemId` 非空的点进条目页（按下变淡），为 null 的不能点，标题用正文灰。最后一行空心圈和
  “有后续进展时，这一页会接着往下长”。
- **合并**：接口回的 `id` 和请求的不同（事件被合并过）时照常显示，不跳转、不改地址。
- **整屏状态**（`story.ts` 的 `storyScreen`）：加载中是事件卡位置一行“加载中…”；404 或参数不对是“已下线或不存在”加回 tab 的按钮（同条目页，
  `components/drill-state`）；403 `section_paused` 是占位（同条目页，手上有内容也不显示）；还没有内容时连不上、超时、503、形状不对是“加载失败”加重试。
- **下拉刷新**：开（规格），重拉这个事件，回来再收起；有内容时失败不清空，事件卡下面一条“网络不好，显示的是 HH:mm 的内容”（`generatedAt`），点一下重试。
  不写本机快照。

## 日报

- **两个页面一套组件**：日报 tab（`pages/daily/`，制造板块最新一期）和某期日报页（`pages/daily-issue/`，下钻页）都画 `components/daily-issue`，
  状态都是 `daily.ts` 的 `createDailyStore`（`use-daily.ts` 接上请求和快照）。前一天、后一天在页内切换（不开新页），两个页面都一样。
- **某期日报页的路由**：`pages/daily-issue/index?board=…&date=YYYY-MM-DD`（`page-stack.ts` 的 `dailyIssuePage`），路由和参数名上线后不改。
  规格只定了 `date`，`board` 另带上和条目页、事件页一致；不带 `board` 时用有日报 tab 的第一个板块（制造），带了得是有日报的板块。`date` 不是
  日历上有的 YYYY-MM-DD 时不请求，直接“这一天没有日报”。不开下拉刷新、不写快照、没有“提醒我明天的日报”；从分享卡片或服务通知直接进来时
  左上角是微信自带的回首页按钮（回精选）。
- **头部**（暖纸色）：日报 tab 和某期日报页的原生导航标题统一沿用“锐奇微报”，正文不再重复 logo 和名称（2026-10-29）。内容从日期与星期、前一天和后一天按钮开始（44 触控区），相邻期为 null 或内容未到时禁用；快照时间单独显示在日期切换区下方；
  日报名和大号日数字，下面保留“N 个分节 | N 条 | 08:00 出刊”，分节与条数都含快讯，内容未到时显示“—”。
- **头条区**（深墨色）：“今日头条”、按字段标注的“AI 摘要”、可长按选择的头条与导语（不截断）。
  按钮行最前面是“收藏”（D28，两个页面都有，见“收藏与已读”），后面“提醒我明天的日报”（只在日报 tab，
  并且构建配置里配了模板 id，见“提醒”）和“分享日报”（见“分享”），提醒下面一行“点一次只提醒一次，明天想再收就再点一次”；没有提醒时（某期日报页，
  或模板 id 还空着，现在就是）只有“收藏”和“分享日报”。按钮按字宽分一行的宽度，日报 tab 三个按钮才放得下。有条目但 `lead` 为 null 时卡片只剩按钮。
  零条的一期不画头条卡。
- **分节**：`sections` 每节用暖纸阅读区与细分隔线区分：节名前的圆点用 `categories[0]` 的分类色（不认识或没有时兜底灰），节名，节里任一条目 `ai.title` 为真时节名旁
  标一次“AI 摘要”（节名不是模型写的，不因它标），右边“N 条”；每行标题和来源，点进条目页。没有条目的节不画。`flashes` 非空时画成最后一节
  “快讯”，圆点是空心圈。`highlights` 不单独画（5:4 分享图用）。页尾“AI 摘要”加“日报由模型从前一天 08:00 到当天 08:00 的精选里整理，08:00 出刊”
  （规格的写法）。
- **零条的一期**：保留头部（读数 0），不画头条卡、分节和页尾，显示“这一期没有条目”。
- **翻期**：点前一天、后一天按日期请求 `dailies/{date}`，切换时清掉上一期（显示“加载中…”，不把上一期当成这一期）；连点时先发的请求晚回来丢掉。
  翻回最新一期的日期时按最新一期请求（`dailies/latest`），又能写快照、按 60 秒规则刷新。
- **快照**：只有日报 tab 的最新一期写 `snap.v1.{board}.daily`，冷启动先放快照再刷新；刷新失败时快照留着、顶部提示“网络不好”。回
  `section_paused`、最新一期回 404、元信息变成占位时删掉。
- **整屏状态**（`daily.ts` 的 `dailyScreen`，优先级从高到低）：配置有误、占位（`boardGate`：元信息占位或日报回 `section_paused`，保留原生导航栏和
  占位文案）；元信息 `columns.daily` 为假时“这个板块没有日报”（运动健康不会进这个 tab，保险）；404：最新一期“第一期日报还没出刊，每天 08:00 出刊”，
  某一期“这一天没有日报”加“看最新一期”（tab 里页内回到最新一期，某期日报页切到日报 tab）；还没有内容时失败是“加载失败”加重试，没回来是“加载中…”；
  有内容（含快照）就显示，刷新失败降成头条卡下面一条“网络不好，显示的是 HH:mm 的内容”（这一期的 `generatedAt`）。元信息自己失败不挡日报。
  日报回 `section_paused` 时强制重拉一次元信息取占位文案。
- **刷新**：日报 tab 开下拉刷新，强制重拉元信息和正在看的那一期。切回 tab 时元信息按 60 秒规则检查；看的是最新一期并且上次的响应过了 60 秒
  （或还是快照、上次失败了）就重拉，翻到往期时不动、留在读者看的那一期。占位期间切回只查元信息；元信息从占位变回正常时重新加载日报。

## 运动健康

- **一套组件**：`pages/sports/` 只是 `<BoardFeed board="sports" />`，和精选 tab 共用 `components/board-feed`：整屏状态、快照、分页、下拉刷新、
  切回时的 60 秒节流和离开 30 分钟重拉都同上面几节。只请求运动健康行业实例（构建配置里 `sports` 的 `apiBase`），卡片点进
  `itemPage("sports", id)`，条目页再进 `storyPage("sports", id)`，都按 `board` 取 api 基址。和制造不同的地方只看构建配置的三个开关：
  `focusCard` 否、`filterBar` 是、`byDay` 是。运动健康没有日报 tab（元信息 `columns.daily` 为 false）。
- **头部**：暖纸底，logo 行和板块名（元信息 `board.name`，没到时用构建配置）。2026-10-29 按用户要求移除标题下的板块介绍，不替换为其他文案；不再渲染 `board.description`。不显示统计读数和扫描条。
  标题上方增加运动主题封面，适配横向裁切；栏目图片与资讯列表分开，筛选分类不改变封面。占位或板块配置有误时不显示封面。
- **筛选条**（`components/filter-bar`、`board-feed.ts` 的 `filterChips`）：位于“生活精选”标题下，制造页位于深墨焦点区后的“行业精选”标题下。“全部”固定
  在最左，后面是元信息 `categories` 的分类，顺序照元信息（即行业包的分类表），放不下时横着滑。圆点颜色取构建配置的 `categoryColors`，D3 定下
  前都是兜底灰；分类名只从元信息读。点一个分类就带 `category` 从第一页重新请求（`use-feed.ts` 换一份列表状态，先清成“加载中…”）；带筛选的
  列表不读不写快照，回到“全部”时先放快照。元信息还没到或没有分类时不画筛选条；读者选的分类在新的元信息里没有了就回到全部
  （`activeCategory`），不拿接口不认识的分类去请求。
- **列表按天分段**（`timeline.ts` 的 `timelineSections(cards, now, true)`）：今天、昨天各一段，段头小字是日期，更早的写日期。
  今天没有精选时从昨天开始，本机时钟慢了、卡片日期比今天还晚时算进今天。卡片不显示时刻（规格），别的和制造一样。
- **空态**：整个板块没有精选是“最近还没有精选”；筛了分类、第一页回来一张都没有是“这个分类最近没有内容”加“看全部”（回到全部）。筛了分类时
  加载中、加载失败照常显示，不算空态（`feed-screen.ts` 的 `empty.filtered`）。
- **底部说明**：2026-10-29 按用户要求删除列表底部固定健康说明及其隐形占位，小程序列表不再渲染 `notice.footer`。卡片的“AI 摘要”标识和心理援助热线逻辑保留；公开接口及行业包的说明字段不变。
- **心理援助热线**（`board-feed.ts` 的 `hotlineFor`、`components/hotline`）：卡片或条目的分类在元信息 `notice.hotline.categories` 里（行业包
  现在是 `sleep`“睡眠与心理”，随 D3 定）时，卡片摘要下面一行“文案 号码”，点了照样进条目页；条目页主卡下面一张卡，点了 `makePhoneCall` 拨号
  （号码去掉空格和横线，读者在系统弹窗里取消不提示）。文案、号码、挂在哪些分类都只从元信息取，小程序里不写号码，改了不用发版。文案或号码
  为空时整条不显示：行业包的号码在人工核对前留空（票 27 写入），所以现在还看不到热线。从分享直接进条目页时，热线等这个板块的元信息回来才出现。
- **两个板块互不影响**：元信息的状态、进行中的请求和本机快照都按板块分开（`meta-store.ts`；`tests/meta-store.test.ts` 逐条演示一个行业实例
  连不上、503、形状不对、一直不回、api 地址配到了另一个板块、切到占位时，另一个板块都照常）；精选流各页面各建各的列表状态，快照按板块存。
  请求封装“同时最多 3 个请求”是两个板块共用的（规格），一个行业实例连接超时的时候，另一个板块的请求最多多排一会儿队（超时 10 秒），
  不会因此失败。本机只起制造时，运动健康 tab 是“加载失败”加重试，精选和日报照常。本机同时起两套要两份代码目录（比如
  `git worktree add` 一份，在那里设 `INDUSTRY_PACK=sports`、自己的 `DATABASE_URL` 和 `API_PORT=3002`）：同一份代码的 `industry/` 只能是一个
  行业包，`npm run dev:api` 先选包、再带 `--watch` 跑，在同一个目录切包会把另一套也重启成新的行业包。
- **占位**：运动健康行业实例切到占位时，运动健康 tab 只剩暖纸刊头的 logo 行和占位文案（行业包的 `placeholder`，现在是“这个板块正在调整”
  “暂不提供内容，其他板块照常。”），没有日期、读数、板块说明、筛选条、卡片和页脚。每次显示都按 60 秒规则检查元信息，占位期间不请求精选流，
  变回正常后从第一页重新加载（同“状态与快照”的“占位的检查”）。条目页、事件页收到 `section_paused` 显示同样的占位。api 连不上、超时、503
  是“加载失败”，不是占位。这套对制造同样有效。
- **单测**：`tests/board-feed.test.ts`（筛选条、分类回退、热线）、`tests/boards.test.ts`（两个板块的配置、tab 和页面表、备用构建、配色表
  对行业包的分类）、`tests/meta-store.test.ts`（板块之间互不牵连、60 秒节流）、`tests/timeline.test.ts`（按天分段）、`tests/feed-screen.test.ts`
  （分类的空态）；根目录 `tests/miniprogram.test.ts` 核对元信息的 `board.description`、`notice.footer`、`notice.hotline` 和行业包一致（制造两个
  都是 null），热线挂的分类是行业包自己的分类。

## 分享

- **哪些页面能转发**：条目页、某期日报页和五个 tab 页的页面配置写 `enableShareAppMessage: true`（Taro 才给页面注册 `onShareAppMessage`，
  不写时右上角转发是灰的），每页只调一次 `use-share.ts` 的 hook（同一页有几个回调时 Taro 只取第一个的返回值）。事件页、文档页不开，转发是灰的。
  不定义朋友圈分享。`tests/share.test.ts` 核对各页的配置和页面接的 hook。
- **按钮和右上角菜单走同一个回调**：条目页“分享给同事”、日报头条卡“分享日报”是 `components/share-button`，`open-type="share"` 的原生 button
  （去掉了原生按钮的内边距、行高和细边框，样子由调用方的类名给，和原来画的一样）。点了由微信调页面的 `onShareAppMessage`（`from` 为 `button`），
  和右上角菜单（`from` 为 `menu`）是同一个 `useShareAppMessage` 回调。回调在分享那一刻用页面已经拿到的数据算出标题、路径和图（`share.ts`，
  纯函数），不发请求。
- **条目页**（`itemShare`）：标题用接口的 `share.title`（缺了用条目标题），路径是这一条的条目页 `itemPage(board, id)`，图见下面的“分享图”。
  参数不对、已下线或不存在时转发小程序本身；占位、加载中、加载失败时路径仍是这一条，标题用小程序名、图用兜底图（手上没有标题和分享图，
  也不能把占位期间的内容发出去）。
- **一期日报**（`issueShare`）：日报 tab 的“分享日报”、某期日报页的按钮和右上角菜单都分享正在看的那一期，路径一律是
  `dailyIssuePage(board, date)`；日报 tab 看最新一期时也用那一期的日期，不写 `latest`，卡片什么时候点开都是同一期。标题用 `share.title`
  （缺了按接口的写法拼“锐奇制造日报 10 月 16 日：头条”）。没有这一期、配置有误、没有日报栏目时转发小程序本身；占位、加载中、加载失败时
  知道日期就指向那一期（小程序名、兜底图），还不知道日期（最新一期没回来）转发小程序本身。
- **tab 页的右上角转发**（D27，`useTabShare`）：精选、日报、运动健康、收藏、锐奇五个 tab 页的右上角菜单都转发小程序本身：路径
  `/pages/feed/index`（精选），标题“锐奇微报”（构建配置的 `appName`），图是本地兜底图。日报 tab 的菜单也是这样，只有它的“分享日报”按钮
  分享那一期。D27 等老板确认，现在按推荐做。
- **分享图**：用接口给的 `share.imageUrl`（5:4、1000×800，在本行业实例的 `/og/mp/` 下，小程序不自己拼）。以下情况改用包里的本地兜底图
  `src/assets/share/fallback.png`：`share` 缺了或形状不对（`imageUrl` 不是 http(s) 绝对地址）；预检回了 4xx、5xx（占位 403、撤稿 404、
  出图失败 503）。兜底图是 500×400 的 5:4 PNG，墨色底、折页 R、白字“锐奇微报”，纯品牌图，不带“AI 摘要”字样；`npm run icons` 生成，
  字用仓库里分享图服务同一套字体，压成 32 色调色板，约 3KB。它必须大于 2KB，否则 Taro 会把它内联成 base64，分享接口不认（单测核对尺寸和体积）。
- **分享图预检**（`useShareImageProbe`）：页面拿到 `share` 字段后对 `imageUrl` 发一次 HEAD（`request.ts` 的 `headStatus`，和其他请求一起排队，
  不挡页面），每个地址每次会话一次，结果只记在内存里，分享回调在分享那一刻读。要预检，是因为微信拉不到 `imageUrl` 时不会换成我们的兜底图，
  “出图失败改用兜底图”只能在分享之前知道。没拿到响应（连不上、超时、域名不在 request 合法域名里）时不下结论，照样用远程图；预检还没回来就分享，
  也用远程图。分享图和接口同一个域名（`SITE_URL`），已在 request 合法域名里；预检顺带让服务端先把图画好放进缓存，微信拉图时更快。
- **撤不回的卡片**：已经发到会话里的卡片，标题和图由微信缓存，切到占位（或者撤稿）以后撤不回来，读者点开看到的是占位（或“已下线或不存在”）。
- **从卡片进来**：点开是条目页或某期日报页，栈里只有这一页，导航栏左上角是微信自带的回首页按钮，一步回到精选（见“条目页”的导航栏）。

## 提醒

- **只在日报 tab**：头条卡里的“提醒我明天的日报”（`components/remind-button`），下面一行“点一次只提醒一次，明天想再收就再点一次”。
  某期日报页没有。翻到往期点的也是明天那一期：目标日期由服务端按北京时间算，小程序不传日期。
- **模板 id**：构建期配置里制造板块的 `reminderTemplateId`，开发、体验、正式三份各配一份，必须和该行业实例的
  `WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID` 一字不差（对不上接口回 400）。客户还没在“资讯 > 信息资讯”类目下申请到一次性订阅模板，三份现在都
  留空；空着（或只有空白）时不画按钮和那句提示（`reminder.ts` 的 `reminderTemplate`，有单测）。申请到以后填进三份配置，重新构建发版。
- **点了以后**（`reminder.ts` 的 `requestReminder`，微信和网络接口由组件注入，单测用假的跑）：
  1. 点击回调里第一件事同步调 `Taro.requestSubscribeMessage({ tmplIds: [模板 id] })`，只传这一个模板。微信只认点击回调里同步发起的订阅授权，
     前面不能等任何请求（Taro 的 Promise 封装在同一拍里调 `wx.requestSubscribeMessage`）。按钮这时是“正在订阅…”，不能点。
  2. 这个模板的结果是 `accept`（新版本微信带提醒方式的 `acceptWithAudio` 之类也算）：`Taro.login()` 拿 code，POST `reminders`，
     请求体 `{ code, templateId }`。
  3. 2xx：按钮改成“已订阅明天的日报”，不能点。只记在本次会话的内存里（模块变量，翻期时头条卡重画也还在），不落本机存储；会话跨过北京零点、
     登记的那一期已经是今天时按钮恢复可点。2xx 但响应形状不对时行已经存下了，照样按成功算。
  4. `reject`：提示“已取消”。授权失败的 errCode 20004（读者关了订阅消息总开关）：弹窗“订阅消息已关闭”，点“去设置”在弹窗的 success 回调里
     同步调 `Taro.openSetting()` 打开小程序的设置页，打不开时提示“可在右上角“···”›“设置”里打开”。`ban`、`filter`、结果里没有这个模板、
     其他错误码、拿不到 code、接口失败（503 `reminders_disabled` 或 `temporarily_unavailable`、429、400、网络、超时）：提示“暂时无法订阅，请稍后再试”。
  5. 接口回 403 `section_paused`：强制重拉一次元信息，日报 tab 跟着换成占位（同日报回 `section_paused`）。

  任何失败都只是一条提示，日报照常能看。
- **服务通知点开**：后端发的 `page` 是 `pages/daily-issue/index?board=manufacturing&date=YYYY-MM-DD`，就是某期日报页的路由
  （`tests/page-stack.test.ts` 读后端源码核对这个写法，并解析出那一期）。从服务通知进来时栈里只有这一页，原生导航栏左上角是微信 7.0.7 起自带的
  回首页按钮，一步回到 `app.config` 的第一个页面，即精选 tab，所以不另画“回到精选”（同条目页）。这一期没有时是“这一天没有日报”加“看最新一期”。
- **隐私说明**：`src/content/docs.ts` 引用的固定文案 A（`src/content/fixed-copy.ts` 的 `FIXED_A_REMINDER`）写的保存内容（微信标识、目标日期、
  模板编号、创建时间）和删除时机（发出即删，48 小时内没发出也删，不进备份，不再点就不会再保存）和票 18、19 的后端一致：接口失败时什么都不存；
  每行一有结果（已发、失败、未知、跳过）就删，发送任务每 10 分钟、清理任务每天删创建满 48 小时的行；提醒表的数据不进每日备份。

## 收藏与已读

都只存本机，不上传、不登录（规格“本机存储”）。纯逻辑在 `src/lib/saved.ts`、`src/lib/read.ts`，存储注入，单测用内存假存储直接跑
（`tests/saved.test.ts`、`tests/read.test.ts`）；`src/lib/use-saved.ts`、`src/lib/use-read.ts` 各建一份接上微信存储的实例，整个小程序共用，
改了就通知订阅的组件重画。

- **收藏按钮**（`components/save-button`）：条目页按钮行（和“分享给同事”平分一行）、日报头条卡按钮行的最前面（D28，日报 tab 和某期日报页都有）。
  点一下收藏、再点取消，收藏以后书签变实心；条目页的字变“已收藏”，日报的字一直是“收藏”（日报 tab 一行三个按钮，放不下多出来的字）。
  结果用提示说：“已收藏”“已取消收藏”，满 300 条“收藏已满 300 条，请先取消一些”（不收藏、不自动删旧的），存储读不出来或写不进“收藏失败，请稍后再试”。
- **记录**（`saved.v1`，新的在前）：`{ kind, board, id, title, category, sourceName, sourceCount, ai, siteName, savedAt }`。条目的 `id` 是条目 id，
  `sourceCount` 是同一事实的来源数（卡片上“N 家在报”那个数，“只显示摘要”时接口给 null，收藏页就不显示），`ai` 是标题或摘要任一是模型写的；
  日报的 `id` 是日期，`title` 是那一期的头条（没有头条时空着），`siteName` 是日报名，分类、来源名、来源数都是 null，`ai` 看头条和导语（同头条卡）。
  `savedAt` 是本机毫秒时刻。读的时候形状不对的记录丢掉。
- **只在写成功时改内存**：内存里的收藏和本机始终一致。本机读不出来（存储抛错）时不当成“没有收藏”，什么都不写，免得一次读失败把本机 300 条整份覆盖；
  按钮提示失败，收藏 tab 显示“收藏读不出来”加重试。写不进时同样提示失败，什么都不改。阅读都不受影响。
- **收藏 tab**（`pages/saved/`）：不请求接口，断网也能列。暖纸头部“值得再读的，留在这里”、总条数和本机存储说明；支持“全部 / 制造 / 运动健康”筛选，
  不改变收藏顺序，隐藏板块不显示筛选项。分类栏一条底线，首条收藏无顶线，其余条目之间一条分隔线。卡片按 `savedAt` 倒序（同一时刻保持存的顺序）：条目是分类色标、“AI 摘要”、标题（两行）、来源名、
  “N 家在报”（≥ 2）和“MM-DD 收藏”（北京日期，跨年带年份）；日报是“日报”标签、日报名加“10月16日”、头条（两行）和收藏日期。点条目进条目页，
  点日报进某期日报页。分类名取内存里的元信息，没有时取本机快照里的，都没有先显示 key（同精选卡片）。底部说明“收藏只存在本机，不上传、不登录。
  清理微信缓存或换手机后会清空，重要的条目请用‘分享给同事’发到会话里留存。”全部为空和所选板块为空分别提示；不可用的板块筛选回退到“全部”。
  不开下拉刷新。
- **占位时先隐藏这个板块**（`saved.ts` 的 `boardHidden`）：这次会话内存里有这个板块的元信息就听它的，占位隐藏、正常显示（所以恢复正常后重新出现）；
  内存里还没有（收藏 tab 不调 `useBoardMeta`，不为此请求，用 `meta-context` 的 `useMetaStates` 只读内存）或者请求失败了，就看本机快照
  `snap.v1.{board}.meta` 是不是占位（冷启动不把占位的快照放进内存，所以单独读，切回收藏 tab 时重读）。只是不列，本机的记录不动，也照样算进 300 条。
  小程序还不知道已经切占位时点进这个板块的收藏，条目页收到 `section_paused`，显示的是占位文案（票 12 已有）。
- **打开收藏过的条目**（`use-item.ts`）：拿到条目时用新的标题、分类、来源数和 `ai` 更新那条收藏（收藏时刻和位置不变，都没变时不写）。
  条目回 404 时“已下线或不存在”的白卡里，这条在收藏里就多一个“从收藏移除”（排在前面，回 tab 的按钮挪到后面成浅灰），移除以后提示“已从收藏移除”、
  只剩回 tab 的按钮。不自动删。
- **已读**（`read.v1`：`{ [board]: { [itemId]: readAt } }`）：条目页拿到条目时记为已读（`use-item.ts`，用页面参数里的 id，也就是卡片的 id；
  404、占位、加载失败不记）。精选流的 hook（`use-feed.ts`）把这个板块已读的 id 带在 `state.read` 里，`components/feed-list` 的卡片据此把标题改用
  正文灰，其余不变（D25）；精选 tab 和运动健康 tab 都走这个 hook，页面不用改。记了已读，下面的列表跟着重画。每个板块最多 1000 条，超了先删最旧的；
  启动时（`app.tsx` 的 `useLaunch`）删 30 天以前的（正好 30 天的留着）。本机读不出来时只记在内存里、不覆盖本机，读得出来以后并进去；写不进也只在内存里。

## 原型与正式实现的边界

- 当前视觉基准为 `docs/design/miniprogram-prototype/editorial-r/`；旧版 `a/` 和 `redesign-folder/` 不再作为当前实现依据。
- 保留微信原生导航栏与返回行为，自定义浮动 tabBar 只在 tab 页出现。详情页使用独立的收藏/分享操作条，不增加 tab 导航。
- 原型新闻、示例来源轮播与分享弹层不进入正式数据链路；标题、摘要、日报与来源均取真实公开 API。分享使用微信 `open-type="share"`。
- 公开条目契约没有新闻配图字段，不把锐奇设备图或运动素材硬配到新闻上。真实产品图仅用于锐奇公司页，并标注官网来源。
- 原型的 GSAP 滚动固定与卡片堆叠动画不移植进小程序，不引入浏览器依赖；页面保留轻量按下反馈。
- 2026-10-29 在微信开发者工具实际模拟器检查精选、日报、运动健康、收藏、锐奇与条目详情；走通条目收藏、收藏板块筛选、日报翻期和收藏、联系入口滚动、缺失条目提示；读取条目与日报分享载荷。iOS/Android 真机和微信实际发送仍需发布前核验。
- 合规文本、缺失的反馈/举报联系方式仍按 `src/content/` 的客户确认流程处理，本次视觉迁移不代填、不改条款。
- 2026-10-29 将读者界面的空态、错误提示、收藏说明、日报说明和来源数量改为简洁的现代书面语；不改变请求、缓存、分类或来源计数语义。公司介绍和法律、隐私、安全声明保持原文。已在微信模拟器核对收藏页面，256 项测试、类型检查、完整版及无运动健康版构建通过；尚未上传微信体验版或正式版。
