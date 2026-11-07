# 锐奇微报小程序 · 双色套印（技术期刊）实施规格

> 2026-11-07。适用 `apps/miniprogram`（Taro 4 + React + TS + SCSS，designWidth 390，WebView 渲染，没开 Skyline）。
> 视觉基准：`docs/design/miniprogram-prototype/industrial/duotone/`（`index.html`、`style.css`、`app.js`、`notes.md`、`shot.png`、`shot-full.png`）。原型只画了精选、日报、条目详情、锐奇四屏，其余页面和状态按第 9 节推导。
> 起点：HEAD（10-29 编辑式版，`976ddf7`）。2026-11-07 已核对 `apps/miniprogram` 工作树和 HEAD 一致（上一轮“国际主义技术期刊”的改动已撤回，存档在 `.scratch/miniprogram-swiss-2026-11-06.patch`，作废规格在 `docs/design/miniprogram-industrial-magazine.md`；两者视觉上全部不要，只借来核对覆盖面和坑）。
> 单位：文中尺寸都是 390 设计稿的 px，Taro 把小写 `px` 换算成 rpx；≤ 4px 的值一律写大写 `PX`（不换算）。
> 本规格交给五组并行实施。第 0 节是分组和写法，第 3 节是跨组接口（写死，照抄即可，不用等 foundation），第 4–8 节逐文件。

---

## 0. 给实施者的总则

### 0.1 分组、依赖、合并顺序

| 组 | 改哪些文件 | 依赖 |
|---|---|---|
| foundation | `src/styles/tokens.scss`、`src/app.scss`、`src/app.config.ts`、`src/pages/feed/index.config.ts`（只删两行颜色）、`src/custom-tab-bar/*`、`scripts/tab-icons.ts` 和重新生成的 PNG/JPEG、`brand/photos/`（原图搬家）、删掉不再引用的图；共用组件 `components/category-tag`、`ai-badge`、`page-state`、`save-button`、`share-button`、`remind-button`、`hotline`、`filter-bar`、`drill-state`（只改头注释）；**新增** `components/head-tab/`、`components/reading/`（含 `derive.ts`）、`components/figure/`、`tests/reading-derive.test.ts`；`apps/miniprogram/README.md` 同步 | 无，先做 |
| feed | `components/dashboard`、`focus-card`、`feed-list`、`board-feed`（各自 `index.tsx`、`index.scss`），`pages/sports/index.tsx`（换配图 import）、`pages/feed/index.tsx`（只改注释） | 第 3 节接口 |
| daily | `components/daily-issue`（`index.tsx`、`index.scss`）；`pages/daily`、`pages/daily-issue` 的 tsx 不用改 | 第 3 节接口 |
| article | `pages/item`、`pages/story`（`index.tsx`、`index.scss`） | 第 3 节接口 |
| library | `pages/saved`、`pages/reechi`、`pages/doc`（`index.tsx`、`index.scss`） | 第 3 节接口 |

- tokens 删掉了旧变量名、不留别名（2.6）；foundation 还搬走了 `src/assets/editorial/`、删掉了几张图标。所以 foundation 合并以后、其他四组改完以前，构建会在旧引用处报错，这是预期的。每组**整份替换**自己负责的 scss，不留旧变量。全部合并以后统一跑第 16 节。
- 每组只改本组列出的文件。不改 `src/lib/`、`src/content/`、`config/`、现有 `tests/`，不改页面配置里的分享开关（`enableShareAppMessage`）和下拉刷新开关（`enablePullDownRefresh`），不改分类色值（`config/boards.ts`），不改 logo 图形和配色（`src/assets/logo.png`、`src/assets/reechi/logo.png`、`brand/app-icon.png`），不改五个 tab 的顺序和名字。
- **和任务分工有意不同的一处**：任务给 foundation 的是“替换原来的彩色图，删掉不再引用的旧图”。规格没有删三张彩色原图，而是 `git mv` 到 `apps/miniprogram/brand/photos/`。`brand/` 在 `src/` 外，miniprogramRoot 是 `dist/`，所以和 `brand/app-icon.png` 一样不进代码包。留着原图有两个用处：`npm run icons` 能重出配图，Unsplash 和锐奇官网的来源也有据可查。原型的 `industrial/assets/` 里也有这三张，但那个目录没入库，不能指望它当底片。这一处请编排方或使用者确认（第 15 节第 7 条）。确认之前照规格做：不同意时改成 `git rm`，随时可以改。

### 0.2 所有组都要遵守的写法

1. 每个 scss 开头 `@use "../../styles/tokens" as *;`（`custom-tab-bar` 写 `@use "../styles/tokens" as *;`）。颜色、字体、字号角色、按钮、栏头只从 tokens 取。除了 `tokens.scss`，任何 scss 里都不写 hex、`rgb()`、`rgba()`。
2. **钴蓝只走 mixin**：`num`、`cond`、`head-tab`、`type-kicker`。除了 `components/dashboard/index.scss` 的 `.mast__band` 和 `app.scss` 挂的 `--cobalt` 变量，scss 里不直接写 `$cobalt`。
3. **≤ 4px 的值写大写 `PX`**（线宽、边框、2–4px 的外边距和内边距、字距），或者用 `$hair`（1PX）、`$mark`（2PX）。不写的话 360dp 安卓上 1px 线会时有时无（坑 1）。
4. **不用 flex `gap`、`row-gap`、`column-gap`**，一律相邻元素 margin（坑 2，老安卓 WebView 不认）。
5. **只用类选择器**：`.a`、`.a .b`、`.a.b`、`.a + .a`。不用标签选择器（`image`、`view`、`text`、`button`）、`*`、`:has()`、容器查询、`backdrop-filter`。伪元素只写在 `View` 上（坑 3）。唯一的例外是 `.share-button::after`：原生 `<Button>` 的细边框画在它的 `::after` 上，只能在这里清掉（4.10）。
6. **页面里不画分隔线**：`border-top/bottom/left/right` 只出现在 `custom-tab-bar`（上沿）和条目页 `.item-acts`（上沿）。描边按钮、AI 摘要标记、心理援助热线的 1PX 框、分类方块的 1PX 墨边、选中项的 2PX 墨线是控件自己的轮廓，不算分隔线。
7. **按钮只有两种**：墨底实心（`btn-ink`）和墨线描边（`btn-line`），44 高、直角、15/500。禁用是 `btn-off`。没有第三种按钮，钴蓝不做按钮。
8. **按下态改底色，不降透明度**：纸面元素 `$press`，墨底按钮 `$ink-press`，`$press` 底上的元素 `$press-deep`。透明度只剩三处：日报翻页禁用箭头 `.5`、正在订阅整颗 `.6`、已订阅铃铛 `.5`。整行可点的元素（卡片、日报条目、报道、联系方式、文档入口）内边距从 x=0 铺到 x=390，按下时整条变色（出血）。
9. 全站零圆角、零阴影、零渐变、零 `filter`。墨底按钮上不放图标：“分享给同事”“分享日报”照原型只写字（4.10）。调用方原来的 `filter: brightness(0)` 跟着 scss 整份替换一起删掉（坑 7）。
10. 中文字重只用 400、500、600；数字用 DIN 700（`num`、`cond` mixin）。中文不加负字距。五类标题加 `text-wrap: pretty`（已包在 `type-*` mixin 里）。
11. 原生 `<Button>`（`components/share-button`）：调用方的样子写成**两个类**（`.item-btn.item-btn--ink`），按下态写**三个类**（再加 `.share-button--down`），压过 share-button 自己的重置，不靠样式表先后（坑 5）。
12. `custom-tab-bar` 是样式隔离的组件：字体、颜色、`box-sizing` 都在它自己的 scss 里写全，不依赖 app.scss（坑 4）。
13. **组件 import 的先后**（防 mini-css-extract 的 “Conflicting order”）：`head-tab`、`reading`、`figure`、`ai-badge`、`category-tag`、`hotline`、`drill-state`、`page-state`、`remind-button`、`save-button`、`share-button`，再是本文件自己的 scss。`reading/derive` 是纯 TS，不带样式，位置随意。
14. 页面里没有绝对定位的线段了（事件页的时间轴取消，见 7.2），坑 9 不再出现；以后谁加绝对定位的装饰，要给它 `z-index`，免得被按下态的不透明底色盖住。
15. `calc()` 里写 px 会被换成 rpx，Css Minimizer 的 postcss-calc 报 “Lexical error … rpx” 警告，不影响输出（坑 8），不用处理。
16. 文件头注释里写着“深墨”“暖纸”“青色”“编辑式”“悬浮”的，改成和新样子一致的说法。

---

## 1. 方向、改了什么、不改什么

### 1.1 方向

像《无线电》《电子技术》那类老技术期刊：新闻纸上只印两色，墨印正文，钴蓝专色印刊头、栏头、读数和配图，靠色块和留白分区、不靠线；全站唯一的记忆点是精选页左上角从屏幕边缘印进来的钴蓝竖排刊名“锐奇微报”。

### 1.2 和 HEAD（10-29 编辑式版）对照

| 方面 | HEAD | 双色套印 |
|---|---|---|
| 底色 | 暖纸 `#f7f6f2`，制造精选头部和日报头条、锐奇页头部是深墨块 | 全站一种底：新闻纸 `#e9e9e3`，没有深色块 |
| 原生导航栏 | 深墨 `#151f21` 白字 | 新闻纸底黑字，胶囊变深色版 |
| 重点色 | 星青 `#62f2e5` / `#2ce2e8` 做按钮底、选中态、图形 | 钴蓝 `#1b3f8b` 只印四类地方：刊头和栏头色块、读数、配图、“今日焦点”；选中态和按钮一律墨色 |
| 精选头部 | logo 行 + 深墨焦点区（居中 29px 标题、青色“读摘要”）+ 圆角暖纸“行业精选” | 钴蓝竖排刊头：左 72 宽色块竖排刊名，右栏 logo、日期、周次、今日焦点标题；色块下通栏摘要、来源、读数、墨底“读摘要” |
| 列表 | “凌晨 0–6 时 · N 条”段头，卡片之间细线 | 钴蓝栏头色块（今天只写时段，往日带日期和星期），左边索引栏印钴蓝时刻，卡片之间只留 30 的空 |
| 运动健康头部 | logo 行 + 圆角彩色照片 + 38px 板块名 + “生活精选” | 钴蓝栏头“运动健康”加日期、周次，下面钴蓝单色栏目配图 |
| 日报 | 圆形翻页钮、REECHI DAILY、68px 日数、深墨头条卡、圆点分节 | 文字翻页条、钴蓝 64px 日数 + 刊名 + 时间窗、钴蓝读数、“今日头条”栏头、分节栏头带条数 |
| 条目页 | 29px 标题、青线分区、悬浮深色操作条 | 23px 标题，“为什么值得看”“来源”“同一事件”三个钴蓝栏头，贴底新闻纸操作条；“同一事件”下面只有来源数和其他来源，不显示事件标题（第 15 节第 2 条） |
| 事件页 | 竖直时间轴（圆点、轴线、虚线） | 读数行 + 标题，“事件综述”“谁在报，怎么说”栏头，报道按时间排成列表，不画轴 |
| 收藏页 | “收藏内容 / 随时查阅”大标题 | 钴蓝栏头“我的收藏”加条数 |
| 锐奇页 | 深墨头图、标语、英文眉题、圆角卡片、线框图标 | 页首钴蓝单色通栏版图，logo + “锐奇”，三个钴蓝内容栏头 + 三个纸底功能栏头，不用图标 |
| 按钮 | 青底、浅灰底、深底，圆角 6–10；分享按钮带图标 | 墨底实心、墨线描边两种，直角，44 高；“分享给同事”“分享日报”照原型只写字，收藏、提醒保留墨色图标 |
| tabBar | 悬浮深色胶囊，选中青底 | 贴底新闻纸通栏，上沿一根 `#c8c8c0`，选中墨色 600、图标填墨 |
| 配图 | 彩色（锐奇官网图、Unsplash） | 钴蓝单色（暗部钴蓝、亮部纸色），原图搬到 `brand/photos/` |
| 数字 | 系统字体等宽数字 | DIN Alternate / DIN Condensed 700，读数印钴蓝 |
| 截断 | 只有精选卡摘要截 3 行；焦点标题、焦点摘要、收藏卡都不截断 | 精选卡摘要照旧 3 行；**新增**焦点标题、焦点摘要照原型各截 4 行，全文在条目页（第 15 节第 6 条）；收藏卡照旧不截断 |

### 1.3 不改什么

- `src/lib/`、`src/content/`、`config/`、现有 `tests/`（新增一个测试文件，见 4.6）。
- 接口、分享路径和回调、本机存储、快照、订阅提醒流程、整屏状态的判定（都在 lib 里）。
- 页面配置里的分享开关、下拉刷新开关、导航栏标题文字。
- 分类色值（`config/boards.ts`，被 `tests/boards.test.ts` 锁定）；页面上只换画法（8×8 方块加墨边）。
- logo 图形和配色（`src/assets/logo.png`、`src/assets/reechi/logo.png`、`brand/app-icon.png`），分享兜底图 `src/assets/share/fallback.png`（`tests/share.test.ts` 核对尺寸和体积）。
- 五个 tab 的顺序和名字；备用构建四个 tab。
- “AI 摘要”四个字和源码里每一处 `AiBadge`（共 12 处，位置和显示条件都照旧，这次不加不减，见 16.1）。
- 所有 `DAILY_COPY`、`SAVED_COPY`、`REMINDER_COPY`、`SOURCE_NOTE`、占位文案、`failureText`、按钮文字。
- 不加期号、卷号、页码、统计读数、客户案例；不恢复 10-29 删掉的板块介绍（`board.description`）、三个统计读数、扫描条、列表底部健康说明（`notice.footer`）。

---

## 2. Tokens

### 2.1 色板和对比度

对比度按 WCAG 2.x 相对亮度公式算（`L = 0.2126R + 0.7152G + 0.0722B`，sRGB 线性化；比值 `(L1+0.05)/(L2+0.05)`），2026-11-07 用脚本逐对算过。

| 变量 | hex | 用途 | 关键组合 |
|---|---|---|---|
| `$paper` 新闻纸 | `#e9e9e3` | 全站唯一底色；导航栏、tabBar、操作条的底；钴蓝和墨底上的反白字 | — |
| `$ink` 墨 | `#1b1b19` | 标题、选中态、实心按钮底、描边按钮的线和字、分类方块的 1PX 边、页面图标 | 纸上 14.15；纸色字在墨上 14.15 |
| `$body` 正文 | `#3f3f3a` | 摘要、正文、分类名、AI 摘要标记的字、已读标题 | 纸上 8.69 |
| `$mute` 次要 | `#5c5c55` | 来源名、日期、说明、读数单位、未选中 tab、AI 摘要标记的边、热线小框的边 | 纸上 5.53 |
| `$cobalt` 钴蓝 | `#1b3f8b` | 刊头竖排色块、栏头色块、读数数字、“今日焦点”（配图的钴蓝在 JPEG 里） | 纸上 8.09；纸色字在钴蓝上 8.09 |
| `$off` 禁用字 | `#8a8a83` | “后一天”不能点、占位联系方式、已订阅 | 纸上 2.85（禁用态不要求 4.5） |
| `$off-line` 禁用边 | `#b4b4ad` | 禁用的描边按钮 | 纸上 1.71 |
| `$rule` | `#c8c8c0` | 只给 tabBar 和条目页操作条的上沿 | 非文字 |
| `$press` 下沉的纸 | `#dcdcd5` | 纸面元素按下；“网络不好”提示条、译文不完整提示、文档事实表和引用块、链接框的底 | `$ink` 12.52、`$body` 7.68、`$mute` 4.89、`$cobalt` 7.15 |
| `$press-deep` | `#cfcfc7` | `$press` 底上的元素按下（提示条） | `$ink` 11.01、`$body` 6.76 |
| `$ink-press` | `#3a3a36` | 墨底按钮按下 | 纸色字 9.37 |
| `$overlay` | `rgba(27, 27, 25, 0.55)` | 复制失败弹层的遮罩 | 叠在纸上约 `#787874`，纸色卡片 3.64（非文字） |
| `$c-*` 分类色 | 不变 | 只画 8×8 方块加 1PX 墨边，字一律 `$body` | 方块靠墨边看得见：检测 `#2ce2e8` 在纸上只有 1.31，墨边上 10.80 |

其他：logo 的深墨方块 `#13191c` 在纸上 14.56、在钴蓝上 1.80（所以 logo 不压在钴蓝色块里）；墨在钴蓝上 1.75（所以钴蓝块里只放纸色字）。

### 2.2 字体

- 中文：`-apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif`，字重 400/500/600。
- 读数（周次、条数、来源数、出刊时刻、首报/最新、号码）：`"DIN Alternate", "Helvetica Neue", Roboto, sans-serif`，700。
- 窄体（精选卡时刻、日报日数）：`"DIN Condensed", "DIN Alternate", "sans-serif-condensed", "Roboto Condensed", "Helvetica Neue", sans-serif`，700。
- 只作用于数字，DIN 不放中文。不用 `loadFontFace`、不加网络字体。

### 2.3 字号角色（mixin 名 → 用在哪）

| mixin | 字号/行高 | 字重 | 颜色 | 用在 |
|---|---|---|---|---|
| `type-mast` | 34/42 | 600 | 纸色 | 竖排刊名的每个字 |
| `type-article` | 23/33 | 600 | 墨 | 条目页标题、事件页标题、文档标题 |
| `type-issue` | 26/34 | 600 | 墨 | 日报刊名 |
| `type-headline` | 22/31 | 600 | 墨 | 焦点标题 |
| `type-lead` | 21/30 | 600 | 墨 | 今日头条标题 |
| `type-card` | 17/26 | 600 | 墨 | 精选卡、收藏卡、产品名 |
| `type-line` | 16/25 | 500 | 墨 | 日报条目标题、事件页报道标题 |
| `type-body` | 16/28 | 400 | 正文 | 焦点摘要、条目摘要、为什么值得看、头条段落、事件综述、关于锐奇、文档段落 |
| `type-summary` | 15/24 | 400 | 正文 | 精选卡摘要（3 行截断）、产品说明、收藏页日报头条 |
| `type-legal` | 14/24 | 400 | 正文 | 锐奇页声明 |
| `type-kicker` | 15/22，字距 2PX | 600 | 钴蓝 | “今日焦点” |
| `head-tab` | 15，高 30，字距 1PX | 600 | 纸色，钴蓝底 | 栏头色块 |
| `head-plain` | 15/22，字距 1PX | 600 | 墨 | 功能栏头（文档、反馈与侵权投诉、声明） |
| `btn` | 15/20 | 500 | — | 按钮 |
| `type-meta` | 13/20 | 400 | 次要 | 来源名、日期、说明、读数单位 |
| `type-label` | 13/20 | 400 | 正文 | 分类名、“日报”类别名 |
| `num(size, line, color)` | 16–20 | 700 | 钴蓝 | 读数 |
| `cond(size, line, color)` | 22 / 64 | 700 | 钴蓝 | 卡片时刻、日报日数 |
| — | 12 | 500 / 400（选中 600） | 正文 / 次要 | AI 摘要标记、tab 名（最小字号） |

### 2.4 栅格

页边 20；索引栏 52（时刻、日数）；栏距 16；内容栏从 x=88 起。刊头色块宽 72 =“页边 + 索引栏”，栏头色块最短也是 72，短栏头（凌晨、昨天、锂电、来源）右边和刊头色块右边对齐。所有钴蓝色块从屏幕左缘印进来，字从 x=20 起。节与节（栏头之上）34，卡与卡之间 30。

### 2.5 `src/styles/tokens.scss` 完整新内容

```scss
// 双色套印 · 技术期刊（2026-11-07 选定，规格见 docs/design/miniprogram-duotone.md）。
// 新闻纸上只印两色：墨印正文；钴蓝（专色）只印四类地方：刊头和栏头的色块、读数类数字（时刻、日数、周次、条数、来源数）、
// 配图（钴蓝印在图片文件里）、刊头里的“今日焦点”四个字。链接、按钮、选中态、电话号码都不用钴蓝。
// 靠色块和留白分区，页面里不画分隔线：只有 tabBar 和条目页操作条的上沿各一根 $rule。按钮只有墨底实心和墨线描边两种，直角。
// 钴蓝色块都从屏幕左缘印进来（出血），字从 x=20 起。
// 页面样式 @use 这个文件用 $变量和 mixin；除了这个文件，任何 scss 里都不写色值。钴蓝只经 num、cond、head-tab、type-kicker 取用。
// 单位是 390 设计稿的 px，Taro 换算成 rpx；不超过 4 的值一律写大写 PX（不换算），不然 360dp 安卓上 1 像素的线会时有时无。
//
// 对比度（WCAG 2.x 相对亮度公式；正文对比度要求 ≥ 4.5）：
//   新闻纸上：$ink 14.15、$body 8.69、$mute 5.53、$cobalt 8.09、$off 2.85（只给禁用态）
//   纸色字：在 $cobalt 上 8.09、在 $ink 上 14.15、在 $ink-press 上 9.37
//   $press 上：$ink 12.52、$body 7.68、$mute 4.89、$cobalt 7.15；$press-deep 上：$ink 11.01、$body 6.76
//   logo 的深墨方块 #13191c：在新闻纸上 14.56，在钴蓝上只有 1.80，所以 logo 不压在钴蓝色块里。

// ---------- 颜色 ----------
$paper: #e9e9e3;      // 新闻纸：全站唯一底色，也是导航栏、tabBar、操作条的底；钴蓝和墨底上的反白字
$ink: #1b1b19;        // 墨：标题、选中态、实心按钮底、描边按钮的线和字、分类方块的边、页面图标
$body: #3f3f3a;       // 正文：摘要、正文、分类名、AI 摘要标记的字、已读的标题
$mute: #5c5c55;       // 次要：来源名、日期、说明、读数单位、未选中的 tab、AI 摘要标记的边
$cobalt: #1b3f8b;     // 专色钴蓝：刊头和栏头色块、读数数字、“今日焦点”
$off: #8a8a83;        // 禁用的字：日报“后一天”、占位的联系方式、已订阅
$off-line: #b4b4ad;   // 禁用按钮的边
$rule: #c8c8c0;       // 只给 tabBar 和条目页操作条的上沿
$press: #dcdcd5;      // 下沉的纸：纸面元素按下；提示条、译文不完整、文档事实表和引用块、链接框的底
$press-deep: #cfcfc7; // $press 底上的元素按下
$ink-press: #3a3a36;  // 墨底按钮按下
$overlay: rgba(27, 27, 25, 0.55); // 复制失败弹层的遮罩

// 分类色：值不改（运行时按分类 key 取色走构建配置 config/boards.ts，被测试锁定）。页面上只画 8×8 方块，带 1PX 墨边，字一律 $body。
$c-battery: #ff7a45;
$c-storage: #1fb57a;
$c-semi: #3b7bf6;
$c-film: #8f6cf6;
$c-inspect: #2ce2e8;
$c-policy: #131416;
$c-general: #8a959e;

// ---------- 字体 ----------
// 中文一律系统字体，字重只用 400/500/600。DIN 只放数字（700）：DIN Condensed 只有粗体，安卓回落到 Roboto（Condensed）。
$font: -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
$font-num: "DIN Alternate", "Helvetica Neue", Roboto, sans-serif;
$font-cond: "DIN Condensed", "DIN Alternate", "sans-serif-condensed", "Roboto Condensed", "Helvetica Neue", sans-serif;

// ---------- 栅格 ----------
$page: 20px;      // 页边
$index: 52px;     // 索引栏：精选卡的时刻、日报的日数
$gutter: 16px;    // 索引栏和内容栏之间
$indent: 68px;    // $index + $gutter
$content-x: 88px; // 内容栏左缘 = $page + $indent
$band: 72px;      // 刊头色块宽 = $page + $index；栏头色块最短也是它
$section: 34px;   // 节与节之间（栏头上方）
$entry: 30px;     // 卡与卡之间
$touch: 44px;     // 最小触控高度、按钮高度
$tabbar-h: 52px;  // tabBar 不含安全区的高度
$hair: 1PX;       // 细线：描边按钮、AI 摘要标记、热线框、分类方块的边、tabBar 和操作条的上沿
$mark: 2PX;       // 选中项下面的墨线

// ---------- 文字 ----------
@mixin pretty { text-wrap: pretty; }
@mixin clamp($lines) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: $lines; overflow: hidden; }
@mixin type($size, $line, $weight: 400, $color: $ink) { font-size: $size; line-height: $line; font-weight: $weight; color: $color; }

@mixin type-mast { @include type(34px, 42px, 600, $paper); }
@mixin type-article { @include type(23px, 33px, 600); @include pretty; overflow-wrap: break-word; }
@mixin type-issue { @include type(26px, 34px, 600); overflow-wrap: break-word; }
@mixin type-headline { @include type(22px, 31px, 600); @include pretty; overflow-wrap: break-word; }
@mixin type-lead { @include type(21px, 30px, 600); @include pretty; overflow-wrap: break-word; }
@mixin type-card { @include type(17px, 26px, 600); @include pretty; overflow-wrap: break-word; }
@mixin type-line { @include type(16px, 25px, 500); @include pretty; overflow-wrap: break-word; }
@mixin type-body { @include type(16px, 28px, 400, $body); overflow-wrap: break-word; }
@mixin type-summary { @include type(15px, 24px, 400, $body); overflow-wrap: break-word; }
@mixin type-legal { @include type(14px, 24px, 400, $body); overflow-wrap: break-word; }
@mixin type-kicker { @include type(15px, 22px, 600, $cobalt); letter-spacing: 2PX; }
@mixin type-meta { @include type(13px, 20px, 400, $mute); }
@mixin type-label { @include type(13px, 20px, 400, $body); }

// 读数：DIN 700、等宽数字，默认钴蓝。电话号码也用它，但传 $ink（号码不是读数）。
@mixin num($size, $line: $size, $color: $cobalt) {
  font-family: $font-num; font-size: $size; line-height: $line; font-weight: 700; color: $color; font-variant-numeric: tabular-nums;
}
@mixin cond($size, $line: $size, $color: $cobalt) {
  font-family: $font-cond; font-size: $size; line-height: $line; font-weight: 700; color: $color; font-variant-numeric: tabular-nums;
}

// ---------- 栏头 ----------
// 内容栏头：钴蓝实心色块，纸色 15/600，高 30，最短 72（和刊头色块同宽），左内边 20，从屏幕左缘印进来（放在没有左内边距的容器里）。
@mixin head-tab {
  flex: none; box-sizing: border-box; display: inline-flex; align-items: center;
  min-width: $band; height: 30px; margin: 0; padding: 0 14px 0 $page;
  background-color: $cobalt; color: $paper; font-size: 15px; line-height: 30px; font-weight: 600; letter-spacing: 1PX; white-space: nowrap;
}
// 功能栏头（锐奇页的文档、反馈与侵权投诉、声明）：纸底墨字，不加色块、不加线。
@mixin head-plain { display: block; padding: 0 $page; font-size: 15px; line-height: 22px; font-weight: 600; letter-spacing: 1PX; color: $ink; }

// ---------- 按钮：墨底实心、墨线描边两种，44 高，直角 ----------
@mixin btn {
  box-sizing: border-box; display: flex; align-items: center; justify-content: center;
  height: $touch; margin: 0; padding: 0 18px; border-radius: 0;
  font-size: 15px; line-height: 20px; font-weight: 500; white-space: nowrap;
}
@mixin btn-ink { @include btn; background-color: $ink; color: $paper; }
@mixin btn-line { @include btn; border: $hair solid $ink; background-color: $paper; color: $ink; }
@mixin btn-off { border-color: $off-line; color: $off; }
@mixin btn-sm { min-width: 64px; padding: 0 14px; }

// ---------- 小件 ----------
// 分类方块：8×8，1PX 墨边，底色由调用处的内联样式给（分类色）。
@mixin swatch { flex: none; display: block; box-sizing: border-box; width: 8px; height: 8px; border: $hair solid $ink; }
// 筛选项（分类筛选条、收藏页板块筛选）：44 高，左右 10；选中墨色 600，下面一根 2PX 墨线（左右各缩 10）。
@mixin chip {
  position: relative; flex: none; box-sizing: border-box; display: inline-flex; align-items: center;
  height: $touch; padding: 0 10px; font-size: 15px; line-height: 20px; font-weight: 400; color: $body; white-space: nowrap; vertical-align: top;
}
@mixin chip-on {
  color: $ink; font-weight: 600;
  &::after { content: ""; position: absolute; left: 10px; right: 10px; bottom: 5px; height: $mark; background-color: $ink; }
}

// ---------- 旧变量名 → 新变量名（10-29 编辑式版的名字全部删掉，不留别名；构建报 “Undefined variable” 就是还有没改完的地方）----------
// 左边的旧名不带 $，免得验收时查旧变量的 grep 命中这段注释。
// ink    #151f21 → $ink #1b1b19（同名，值变了）         body  #394643 → $body #3f3f3a（同名，值变了）
// work   → $paper                                       card  → $paper（不再有卡片底）
// iron   → $mute                                        tab   → $mute（未选中的 tab）
// fog    → 深底上的次要字，新版没有深底：禁用的字 $off，其余 $mute
// rail   → 事件页时间轴，新版不画线：删掉；禁用按钮的边用 $off-line
// star   → 深底上的亮青，新版不用：删掉（不是换成 $cobalt，钴蓝只给四类地方）
// accent → 按用途换：分类名 $body；AI 摘要的字 $body、边 $mute；选中态、链接、动作词 $ink
// rule   #dcded8 → $rule #c8c8c0（同名，只给 tabBar 和条目页操作条的上沿）
// font   → $font（同名）；新增 $font-num、$font-cond。$c-* 不变。
```

### 2.6 旧变量名 → 新变量名

见上面 tokens 末尾的注释，不留别名。各组替换时按“用途”换，不按名字机械替换：比如 `$accent` 在 filter-bar 里是选中态（换 `$ink`），在 category-tag 里是分类名（换 `$body`）。

### 2.7 `src/app.scss` 完整新内容

```scss
@use "./styles/tokens" as *;

// 新闻纸是全站唯一底色。page 上挂几种颜色的 CSS 变量，留给运行时的内联样式（现在没有用到）。
page {
  --paper: #{$paper};
  --ink: #{$ink};
  --body: #{$body};
  --mute: #{$mute};
  --cobalt: #{$cobalt};
  --c-battery: #{$c-battery};
  --c-storage: #{$c-storage};
  --c-semi: #{$c-semi};
  --c-film: #{$c-film};
  --c-inspect: #{$c-inspect};
  --c-policy: #{$c-policy};
  --c-general: #{$c-general};
  min-height: 100%;
  background-color: $paper;
  color: $ink;
  font-family: $font;
  -webkit-font-smoothing: antialiased;
  box-sizing: border-box;
  // 贴底 tabBar 52 + 1PX 上沿 + 约 24 的余量；条目页贴底操作条 64 + 1PX 也在这个范围内。
  --tab-clearance: 76px;
  padding-bottom: calc(var(--tab-clearance) + env(safe-area-inset-bottom));
}

// 读数用等宽数字；字体、字重、颜色由 num、cond mixin 给。
.num {
  font-variant-numeric: tabular-nums;
}

button, view, text, image { box-sizing: border-box; }
```

---

## 3. 跨组接口（写死，四组照着写，不用等 foundation）

| 名字 | 在哪 | 谁用 |
|---|---|---|
| mixin `type-*`、`num`、`cond`、`head-tab`、`head-plain`、`btn`、`btn-ink`、`btn-line`、`btn-off`、`btn-sm`、`swatch`、`chip`、`chip-on`、`clamp`、`pretty`、`type` | `src/styles/tokens.scss`（2.5） | 全部 |
| 变量 `$paper $ink $body $mute $off $off-line $rule $press $press-deep $ink-press $overlay`、栅格变量 | 同上 | 全部 |
| 组件 `HeadTab` | `src/components/head-tab/` | feed、daily、article、library |
| 组件 `Reading` | `src/components/reading/` | feed、daily、article、library |
| 纯函数 `isoWeek`、`dayWeek`、`clockOf`、`sectionDate`、`stampParts`、`windowText`、`sourceTotal` | `src/components/reading/derive.ts` | feed、daily、article |
| 组件 `Figure` | `src/components/figure/` | feed（运动健康配图）、library（锐奇页） |
| `PageState`、`StaleNotice`、`failureText` | `components/page-state` | **props 不变，不加参数**；只换样子（4.11） |
| `SaveButton` 的 `variant: "item" \| "daily"` | `components/save-button` | 不变；两种都是描边按钮，`flex: 1` |
| `ShareButton` 的 `label`、`className`、`iconClassName` | `components/share-button` | `label`、`className` 不变。照原型不再画图标：`iconClassName` 改成可选、不再使用，并行期间还在传它的调用方照样编译得过；daily 和 article 都不再传它（4.10）。调用方用两个类给样子（0.2 第 11 条） |
| `RemindButton` 的 `className`、`iconClassName` | `components/remind-button` | 不变；daily 传 `className="daily-btn--line"`、`iconClassName="daily-btn__icon"` |
| 图片路径 | 4.4、4.5 | `assets/tab/*`、`assets/item/{bookmark,bookmark-on,chevron}.png`、`assets/daily/{prev,next,bell}.png`、`assets/saved/daily.png`、`assets/reechi/{logo,chevron}.png`、`assets/reechi/plate-gauge.jpg`、`assets/reechi/fig-line.jpg`、`assets/sports/cover.jpg`、`assets/logo.png` |

### 3.1 `HeadTab`（`src/components/head-tab/index.tsx`）

```tsx
// 栏头：钴蓝反白的小色块，从屏幕左缘印进来（出血），最短 72，和精选页刊头色块同宽；右边可以跟纸底的说明（日期、条数、“AI 摘要”）。
// plain：功能栏头（锐奇页的文档、反馈与侵权投诉、声明），纸底墨字，不用色块。钴蓝色块只给内容栏目。
// 放在没有左内边距的容器里（页面根或通栏的块），色块才能贴住屏幕左缘。
import type { ReactNode } from "react";
import { View } from "@tarojs/components";
import "./index.scss";

interface Props {
  label: string;
  /** 色块右边的内容；数组时依次排开、间隔 12。null、undefined、false、空字符串跳过；都没有时不画。 */
  aside?: ReactNode | ReactNode[];
  plain?: boolean;
}

export function HeadTab({ label, aside, plain = false }: Props) {
  if (plain) return <View className="head-tab head-tab--plain">{label}</View>;
  const items = (Array.isArray(aside) ? aside : [aside]).filter(
    (node) => node !== null && node !== undefined && node !== false && node !== "",
  );
  return (
    <View className="head-tab">
      <View className="head-tab__block">{label}</View>
      {items.length > 0 && (
        <View className="head-tab__aside">
          {items.map((node, i) => (
            <View key={i} className={i === 0 ? "head-tab__item" : "head-tab__item head-tab__item--next"}>
              {node}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
```

`src/components/head-tab/index.scss`：

```scss
@use "../../styles/tokens" as *;

.head-tab { display: flex; align-items: center; min-height: 30px; padding-right: $page; }
.head-tab__block { @include head-tab; }
.head-tab__aside { display: flex; align-items: center; flex-wrap: wrap; min-width: 0; margin-left: 12px; @include type-meta; }
.head-tab__item { display: flex; align-items: center; }
.head-tab__item--next { margin-left: 12px; }
// plain 也带 .head-tab 类：清掉 .head-tab 的 30 最小高，功能栏头就是一行 22 高（和原型 .head--plain 一样）。
.head-tab--plain { display: block; min-height: 0; @include head-plain; }
```

### 3.2 `Reading`（`src/components/reading/index.tsx`）

```tsx
// 读数：钴蓝 DIN 数字，前后跟次要色的字（“第 45 周”“24 条”“最新 01:53”“3 家来源”）。只给能由真实字段推出来的数：
// 时刻、日数、周次、条数、来源数（推导见 components/reading/derive.ts）。电话号码不是读数，不用它。
import { Text, View } from "@tarojs/components";
import "./index.scss";

interface Props {
  value: string | number;
  /** 数字前的字（“第”“最新”“首报”）。 */
  before?: string;
  /** 数字后的字（“周”“条”“家来源”“出刊”）。 */
  after?: string;
  /** 数字字号：s 16、m 18、l 20。 */
  size?: "s" | "m" | "l";
  /** 前后的字用正文色（精选卡、收藏卡底部的“2 家来源”）；默认次要色。 */
  body?: boolean;
}

export function Reading({ value, before, after, size = "m", body = false }: Props) {
  const unit = body ? "reading__unit reading__unit--body" : "reading__unit";
  return (
    <View className={`reading reading--${size}`}>
      {before ? <Text className={`${unit} reading__unit--before`}>{before}</Text> : null}
      <Text className="reading__num num">{value}</Text>
      {after ? <Text className={`${unit} reading__unit--after`}>{after}</Text> : null}
    </View>
  );
}
```

`src/components/reading/index.scss`：

```scss
@use "../../styles/tokens" as *;

.reading { display: inline-flex; align-items: baseline; flex: none; white-space: nowrap; }
.reading__num { @include num(18px, 22px); }
.reading--s .reading__num { font-size: 16px; line-height: 20px; }
.reading--l .reading__num { font-size: 20px; line-height: 24px; }
.reading__unit { @include type-meta; }
.reading__unit--body { color: $body; }
.reading__unit--before { margin-right: 4PX; }
.reading__unit--after { margin-left: 3PX; }
```

### 3.3 派生值的纯函数（`src/components/reading/derive.ts`，完整内容）

```ts
// 页面上能显示的派生值，只由真实字段和“现在”推出来：ISO 周次、日期加星期、北京时刻、精选流段头的日期、焦点卡“最新”的读数、
// 日报的时间窗、来源数。不编期号、卷号、页码、统计读数。纯函数，tests/reading-derive.test.ts 直接跑。
// src/lib/ 不改，所以放在组件目录里；引 lib 的纯逻辑写 .ts 后缀，node 才找得到。
import { beijingClock, beijingDate, headerDate } from "../../lib/beijing.ts";

const DAY_MS = 24 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 北京日期 YYYY-MM-DD 的 ISO 8601 周序号（周一起算，含当年第一个周四的那一周是第 1 周）。不是日历上的日子回 null。 */
export function isoWeek(date: string): number | null {
  if (!headerDate(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // 这一周的周四
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3); // 第 1 周的周四
  return 1 + Math.round((d.getTime() - first.getTime()) / (7 * DAY_MS));
}

/** “11月7日 周六”。不是日历上的日子回 null。 */
export function dayWeek(date: string): string | null {
  const h = headerDate(date);
  return h ? `${h.day} ${h.weekday}` : null;
}

/** 某一时刻的北京时刻“HH:mm”；解析不了回空字符串。精选卡索引栏用（日期已经在段头里）。 */
export function clockOf(instant: string | number | Date): string {
  const c = beijingClock(instant);
  return c ? `${pad(Math.floor(c.minute / 60))}:${pad(c.minute % 60)}` : "";
}

/**
 * 精选流段头右边的日期（lib/timeline.ts 的段：key 是“日期/时段序号”或日期，title 是段名）。今天的段（时段，或按天看的“今天”）
 * 回 null，日期已经在刊头里；“昨天”回“11月6日 周五”；更早的段名已经是日期，回星期“周四”。日期由段的 key 推出来（卡片 anchorAt
 * 的北京日期，和“现在”减天数是同一天），不读日报。
 */
export function sectionDate(key: string, title: string, now: number | string | Date): string | null {
  const date = key.slice(0, 10);
  if (date >= beijingDate(now)) return null;
  const h = headerDate(date);
  if (!h) return null;
  return title === "昨天" ? `${h.day} ${h.weekday}` : h.weekday;
}

/** 焦点卡“最新”：clock 是“HH:mm”，day 是“”（今天）、“昨天”、“11-05”（今年更早）或“2025-12-31”（跨年）。解析不了回 null。 */
export function stampParts(instant: string, now: number | string | Date): { day: string; clock: string } | null {
  const c = beijingClock(instant);
  if (!c) return null;
  const today = beijingDate(now);
  const yesterday = beijingDate(new Date(now).getTime() - DAY_MS);
  const day = c.date === today ? "" : c.date === yesterday ? "昨天" : c.date.slice(0, 4) === today.slice(0, 4) ? c.date.slice(5) : c.date;
  return { day, clock: clockOf(instant) };
}

/** 日报时间窗“11月5日 08:00 至 11月6日 08:00”（接口的 window，按北京时间）。缺了或任一端解析不了回 null，不显示。 */
export function windowText(window: { start: string; end: string } | null | undefined): string | null {
  if (!window || typeof window !== "object") return null;
  const end = (instant: string) => {
    const c = beijingClock(instant);
    const h = c && headerDate(c.date);
    return h ? `${h.day} ${clockOf(instant)}` : null;
  };
  const from = end(window.start);
  const to = end(window.end);
  return from && to ? `${from} 至 ${to}` : null;
}

/** 来源数的显示值：取整、至少 1（和 lib/item.ts、lib/story.ts 的写法一致）。 */
export function sourceTotal(count: number): number {
  return Math.max(1, Math.floor(count) || 1);
}
```

新测试 `tests/reading-derive.test.ts`（完整内容；2026-11-07 在临时目录对上面的实现跑过，7 项全过）：

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { clockOf, dayWeek, isoWeek, sectionDate, sourceTotal, stampParts, windowText } from "../src/components/reading/derive.ts";

const NOW = Date.parse("2026-11-07T06:40:00+08:00");

test("ISO 周序号：周一起算，含当年第一个周四的那一周是第 1 周", () => {
  assert.equal(isoWeek("2026-11-07"), 45);
  assert.equal(isoWeek("2026-11-02"), 45);
  assert.equal(isoWeek("2026-11-08"), 45);
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek("2025-12-29"), 1);
  assert.equal(isoWeek("2026-12-31"), 53);
  assert.equal(isoWeek("2027-01-01"), 53);
  assert.equal(isoWeek("2027-01-04"), 1);
  assert.equal(isoWeek("2026-02-30"), null);
  assert.equal(isoWeek("x"), null);
});
test("日期加星期", () => {
  assert.equal(dayWeek("2026-11-07"), "11月7日 周六");
  assert.equal(dayWeek("2026-13-01"), null);
});
test("北京时刻", () => {
  assert.equal(clockOf("2026-11-06T10:27:00Z"), "18:27");
  assert.equal(clockOf("2026-11-06T16:05:00Z"), "00:05");
  assert.equal(clockOf("坏的"), "");
});
test("段头日期：今天不写，昨天写日期和星期，更早只写星期", () => {
  assert.equal(sectionDate("2026-11-07/0", "凌晨", NOW), null);
  assert.equal(sectionDate("2026-11-07", "今天", NOW), null);
  assert.equal(sectionDate("2026-11-06", "昨天", NOW), "11月6日 周五");
  assert.equal(sectionDate("2026-11-05", "11月5日", NOW), "周四");
  assert.equal(sectionDate("2025-12-31", "2025年12月31日", NOW), "周三");
});
test("焦点“最新”的读数", () => {
  assert.deepEqual(stampParts("2026-11-06T17:53:00Z", NOW), { day: "", clock: "01:53" });
  assert.deepEqual(stampParts("2026-11-06T09:28:00Z", NOW), { day: "昨天", clock: "17:28" });
  assert.deepEqual(stampParts("2026-11-05T01:00:00Z", NOW), { day: "11-05", clock: "09:00" });
  assert.deepEqual(stampParts("2025-12-31T02:00:00Z", NOW), { day: "2025-12-31", clock: "10:00" });
  assert.equal(stampParts("坏的", NOW), null);
});
test("日报时间窗", () => {
  assert.equal(windowText({ start: "2026-11-05T08:00:00+08:00", end: "2026-11-06T08:00:00+08:00" }), "11月5日 08:00 至 11月6日 08:00");
  assert.equal(windowText(null), null);
  assert.equal(windowText({ start: "坏的", end: "2026-11-06T08:00:00+08:00" }), null);
});
test("来源数：取整、至少 1", () => {
  assert.equal(sourceTotal(3), 3);
  assert.equal(sourceTotal(2.7), 2);
  assert.equal(sourceTotal(0), 1);
  assert.equal(sourceTotal(Number.NaN), 1);
});
```

组件里 import 写 `from "../reading/derive"`（页面里 `from "../../components/reading/derive"`），不带 `.ts` 也行，webpack 和 tsc 都认。

### 3.4 `Figure`（`src/components/figure/index.tsx`）

```tsx
// 钴蓝单色配图：图下一行图注，左边图名（墨），右边“图：来源”（次要色）。图片文件已经印成钴蓝单色、按显示比例裁好（scripts/tab-icons.ts），
// 这里不做任何滤镜。kind 决定尺寸：plate 页首通栏 390×258（没有页边，图注从 x=20 起）；line 页边内 350×246；cover 页边内 350×176。
// 定高加 aspectFill：图还没解码时不跳版面；文件比例和显示比例一致，aspectFill 不会裁掉内容（plate 只差半个像素）。
// 只给公司产品图和栏目配图用，不配到新闻上（公开条目契约没有配图字段）。
import { Image, Text, View } from "@tarojs/components";
import "./index.scss";

interface Props {
  src: string;
  name: string;
  source: string;
  kind: "plate" | "line" | "cover";
  /** 读屏用的说明，默认是图名。 */
  label?: string;
}

export function Figure({ src, name, source, kind, label }: Props) {
  return (
    <View className={`figure figure--${kind}`}>
      <Image className="figure__img" src={src} mode="aspectFill" ariaLabel={label ?? name} />
      <View className="figure__cap">
        <Text className="figure__name">{name}</Text>
        <Text className="figure__src">图：{source}</Text>
      </View>
    </View>
  );
}
```

`src/components/figure/index.scss`：

```scss
@use "../../styles/tokens" as *;

// 外边距由调用方给。图还没出来时先是一块下沉的纸。
.figure__img { display: block; width: 100%; height: 246px; background-color: $press; }
.figure--plate .figure__img { height: 258px; }
.figure--cover .figure__img { height: 176px; }
.figure__cap { display: flex; justify-content: space-between; margin-top: 8px; @include type-meta; }
.figure--plate .figure__cap { padding: 0 $page; }
.figure__name { flex: 1; min-width: 0; color: $ink; }
.figure__src { flex: none; margin-left: 12px; color: $mute; }
```

### 3.5 feed 组内部的两个接口（只给 feed 组自己用，写在这里方便对照）

- `Dashboard` 的 props 见 5.1：`title`、`date`、`stamp?`、`brandOnly?`、`board?`、`cover?`，新增 `focus?: ReactNode`（刊头右栏底部放焦点的上半截）。
- `focus-card` 导出两个组件：`FocusHead({ focus, labels, colors })`（刊头右栏里）和 `FocusCard({ focus, onOpen })`（色块下面通栏），见 5.2。原来的 `FocusCard({ focus, labels, colors, onOpen })` 不再存在。两个组件必须成对出现：FocusCard 里的摘要是模型写的，它自己不带“AI 摘要”，标识在 FocusHead 里，所以 FocusCard 不能脱离 FocusHead 单独出现。board-feed 用同一个 `headed` 决定两个都画还是都不画（5.3）。

---

## 4. foundation 组

### 4.1 `src/styles/tokens.scss`、`src/app.scss`

整份替换成 2.5、2.7 的内容。

### 4.2 原生导航栏：`src/app.config.ts`、`src/pages/feed/index.config.ts`

导航栏用新闻纸底、黑字，和页面同一张纸（不用钴蓝：两块蓝连成一片会稀释竖排刊头，也违反“只有刊头和栏头有蓝色块”）。`src/app.config.ts` 改成：

```ts
// 所有页面统一用新闻纸底（#e9e9e3，tokens 的 $paper）、黑字的原生导航栏，和页面同一张纸；右上角胶囊和“回首页”按钮跟着 black 自动变成深色。
// 不开 darkmode，微信深色模式下仍保持设计配色。
// 页面和 tabBar 都按构建期配置的板块列表推出来（lib/tabs.ts 的 appPages、appTabs），不在这里手写：
// 备用构建（--mode prod-no-sports）去掉运动健康板块时，运动健康 tab 和它的页面一起少掉，只剩四个 tab。
// 这个文件只在构建时求值，BUILD_CONFIG 由 config/index.ts 的 defineConstants 注入。
import { appPages, appTabs } from "./lib/tabs";

export default defineAppConfig({
  pages: appPages(BUILD_CONFIG.boards),
  window: {
    navigationBarBackgroundColor: "#e9e9e3",
    navigationBarTextStyle: "black",
    navigationBarTitleText: "锐奇微报",
    backgroundColor: "#e9e9e3",
    backgroundColorTop: "#e9e9e3",
    backgroundColorBottom: "#e9e9e3",
    backgroundTextStyle: "dark",
  },
  tabBar: {
    custom: true,
    color: "#5c5c55",
    selectedColor: "#1b1b19",
    backgroundColor: "#e9e9e3",
    borderStyle: "black",
    list: appTabs(BUILD_CONFIG.boards).map((tab) => ({
      pagePath: tab.pagePath,
      text: tab.text,
      iconPath: `assets/tab/${tab.key}.png`,
      selectedIconPath: `assets/tab/${tab.key}-on.png`,
    })),
  },
  // 和 src/lib/request.ts 的 REQUEST_TIMEOUT_MS 一致。
  networkTimeout: { request: 10000 },
  darkmode: false,
});
```

`src/pages/feed/index.config.ts`：删掉 `backgroundColorTop: "#151f21",` 和 `backgroundTextStyle: "light",` 两行（回弹背景和加载点继承全局的新闻纸、深色点）。`navigationBarTitleText`、`enableShareAppMessage`、`enablePullDownRefresh` 不动（`tests/share.test.ts` 核对）。其他页面配置里没有颜色，一律不动。

### 4.3 自定义 tabBar：`src/custom-tab-bar/`

从悬浮深色胶囊改成**贴底的新闻纸通栏**：上沿一根 1PX `$rule`；未选中图标线框、字次要色；选中图标外形填墨、字墨色 600；按下整格变 `$press`。类名从 `floating-tabs` 改成 `tabbar`（它已经不悬浮了）。`index.config.ts` 不动。

`index.tsx` 只改类名和注释，逻辑不动：

```tsx
// 贴底的 tabBar（新闻纸底，上沿一根细线）。微信给每个 tab 页保留独立实例；页面 onShow 同步选中项，冷启动则从当前页面栈读取。
// （import 和 tabs 常量不变）
export default class TabBar extends Component {
  state = { selected: "" };

  componentDidMount() {
    const pages = Taro.getCurrentPages();
    this.setState({ selected: pages[pages.length - 1]?.route ?? tabs[0].pagePath });
  }

  render() {
    return (
      <View className="tabbar">
        {tabs.map((tab) => {
          const active = this.state.selected === tab.pagePath;
          return (
            <View key={tab.key} className={"tabbar__item" + (active ? " tabbar__item--on" : "")}
              ariaRole="button" ariaLabel={tab.text + (active ? "，当前页面" : "")}
              hoverClass="tabbar__item--down"
              onClick={() => {
                if (!active) void Taro.switchTab({ url: "/" + tab.pagePath }).catch(() => Taro.showToast({ title: "切换失败，请重试", icon: "none" }));
              }}>
              <Image className="tabbar__icon" src={"/assets/tab/" + tab.key + (active ? "-on" : "") + ".png"} />
              <Text className="tabbar__label">{tab.text}</Text>
            </View>
          );
        })}
      </View>
    );
  }
}
```

`index.scss`（整份替换）：

```scss
@use "../styles/tokens" as *;

// 贴底通栏：新闻纸底，上沿一根 $rule（页面里唯二的线之一）。自定义 tabBar 是样式隔离的组件，拿不到 app.scss 的
// page 字体、颜色和 view/text/image 的 box-sizing，这里都写全。
.tabbar { position: fixed; z-index: 50; left: 0; right: 0; bottom: 0; box-sizing: border-box; display: flex; padding: 0 0 env(safe-area-inset-bottom); background-color: $paper; border-top: $hair solid $rule; font-family: $font; -webkit-font-smoothing: antialiased; }
.tabbar__item { box-sizing: border-box; flex: 1; min-width: 0; height: $tabbar-h; display: flex; flex-direction: column; align-items: center; justify-content: center; color: $mute; }
.tabbar__item--on { color: $ink; }
.tabbar__item--down { background-color: $press; }
// 图标 PNG 是 81px（27pt 的 3 倍图），图形画在中间 24 里、四周各留 1.5，按 27 显示，图形正好 24（和原型一样）。
.tabbar__icon { box-sizing: border-box; display: block; width: 27px; height: 27px; }
.tabbar__label { box-sizing: border-box; display: block; margin-top: 2PX; font-size: 12px; line-height: 16px; font-weight: 400; white-space: nowrap; }
.tabbar__item--on .tabbar__label { font-weight: 600; }
```

状态：选中（墨色 600、实心图标）、未选中（次要色、线框）、按下（`$press`）；“切换失败，请重试”的提示照旧。备用构建四个 tab 时 `flex: 1` 自动均分。

### 4.4 图标和配图：`scripts/tab-icons.ts`（改完跑 `npm run icons`，生成的文件提交进仓库）

要点：

1. **颜色**：品牌色 `INK #13191c`、`STAR #2ce2e8`、`WHITE` 只留给 logo、后台头像、分享兜底图，不改。新增页面色 `PRINT #1b1b19`、`MUTE #5c5c55`、`PAPER #e9e9e3`、`COBALT #1b3f8b`，和 tokens 一致。删掉 `OFF`、`IRON`、`FOG`。
2. **端点和拐角**：所有线框图标直角端点（butt）、尖角拐角（miter），和原型 SVG 的默认值一样。`mvg()` 加 `cap`、`join` 两个参数和 `stroke-miterlimit 4`。
3. **坑 6**：ImageMagick 7 画“一个 path 里有多个 M 子路径”的描边时不认 butt 和 miter，一律圆头圆角。所以只描边的 path 按 `M` 拆开一段段画（有填充的不拆，logo 的 R 靠第二段挖窗口）。2026-11-07 用 ImageMagick 7.1.2-31 按下面的写法试画过十个 tab 图标，直角和尖角都对。
4. **tab 图标**（原型 `duotone/app.js` 的 `ICON`）：未选中 `MUTE` 线框（精选左上的方块实心 `MUTE`）；选中外形填 `PRINT`，里面的线和块留 `PAPER`。线宽 1.6。不再靠线宽粗一级区分选中。
5. **页面图标**只留还在用的八张，其余删掉（4.5）。分享按钮照原型只写字，所以 `item/share.png` 也删掉。
6. **配图**：钴蓝单色 JPEG 也由这个脚本出，原图在 `brand/photos/`（不进代码包）。命令和原型 `notes.md` 的“配图”一节一致；2026-11-07 核对过，按下面的参数出的图和原型里的 `fig-gauge.jpg`、`fig-line.jpg`、`fig-sports.jpg` 逐像素相同（RMSE 0），大小 27,694 B、32,230 B、67,717 B。

`scripts/tab-icons.ts` 完整新内容（分享兜底图那一段和 HEAD 一字不差）：

```ts
// 生成小程序的小图，写进 src/assets/：tabBar 图标（10 张 81×81 PNG）、页面上的八个线框图标、头部的 logo、锐奇页的大 logo、
// 钴蓝单色配图（3 张 JPEG，原图在 brand/photos/）；另有微信后台头像（brand/app-icon.png）和分享卡片的本地兜底图（5:4，见文件末尾）。
// 主品牌是“折页 R”（深墨底、青色 R、白色折角），图形和配色不随改版变。页面图标按双色套印版（docs/design/miniprogram-duotone.md）：
// 墨色线框、直角端点、尖角拐角；选中的 tab 外形填墨，里面的线和块留纸色。
// ImageMagick 自带的 SVG 渲染器画不出 fill="none" 的描边，所以把同样的 SVG 图元交给它的 MVG 绘图指令来画，
// 8 倍尺寸画好再缩小，边缘抗锯齿更干净。
// 改了图形再跑一次：npm run icons（本机要有 magick，或用 MAGICK=/path/to/magick 指定）。生成的文件提交进仓库，CI 不跑这个脚本。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 品牌色：只给 logo、后台头像和分享兜底图，不改。
const INK = "#13191c";
const STAR = "#2ce2e8";
const WHITE = "#ffffff";
// 页面色，和 src/styles/tokens.scss 一致。
const PRINT = "#1b1b19"; // $ink：页面上的线框图标、选中的 tab
const MUTE = "#5c5c55"; // $mute：未选中的 tab
const PAPER = "#e9e9e3"; // $paper：选中 tab 里反白的线和块、配图的亮部
const COBALT = "#1b3f8b"; // $cobalt：配图的暗部
const MAX_BYTES = 40 * 1024; // 微信对 tabBar 图标的上限
const MAX_FIGURE_BYTES = 100 * 1024; // 锐奇页每张图 100KB 以内（src/content/README.md）
const SUPERSAMPLE = 8;

/** SVG 图元：path 的 d、circle 的 cx/cy/r、rect 的 x/y/width/height/rx。 */
type Shape = { d: string } | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };
interface Part {
  shape: Shape;
  stroke?: string;
  fill?: string;
}

const BOOKMARK = "M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z";
const CHEVRON = "M9 5l7 7-7 7";

/** tab 图标的外形：未选中只描边，选中描边加填墨。 */
const shell = (on: boolean): Pick<Part, "stroke" | "fill"> => (on ? { stroke: PRINT, fill: PRINT } : { stroke: MUTE });
/** 外形里面的线和块：未选中次要色，选中留纸色。 */
const inner = (on: boolean) => (on ? PAPER : MUTE);

/** 24×24、线宽 1.6 的 tab 图标（原型 docs/design/miniprogram-prototype/industrial/duotone/app.js 的 ICON）。 */
const TABS: Record<string, (on: boolean) => Part[]> = {
  // 精选：版面缩略，左上一块方形配图、右边两行短字、下面一行通栏字。不用星形：四角星是 AI 产品的惯用图形，
  // 和满屏的“AI 摘要”放在一起会读成“AI 功能”入口。
  feed: (on) => [
    { shape: { d: "M3.5 4.5h17v15h-17z" }, ...shell(on) },
    { shape: { rect: [6.5, 7.5, 5, 5, 0] }, fill: inner(on) },
    { shape: { d: "M14 8.25h3.5M14 11.75h3.5M6.5 16h11" }, stroke: inner(on) },
  ],
  // 日报：折角的一页纸，两行字。
  daily: (on) => [
    { shape: { d: "M5.5 3.5h9l4 4v13h-13z" }, ...shell(on) },
    { shape: { d: "M14.5 3.5v4h4M8.5 12h7M8.5 15.5h7" }, stroke: inner(on) },
  ],
  // 运动健康：心形。
  sports: (on) => [{ shape: { d: "M12 20.2l-7.3-7.1a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5z" }, ...shell(on) }],
  // 收藏：书签。
  saved: (on) => [{ shape: { d: BOOKMARK }, ...shell(on) }],
  // 锐奇：表盘。
  reechi: (on) => [
    { shape: { circle: [12, 12.5, 8.3] }, ...shell(on) },
    { shape: { d: "M12 12.5l4-4M12 6.4v1.8M6 12.5h1.8M16.2 12.5H18" }, stroke: inner(on) },
  ],
};

// 折页 R：青色字干与斜腿、负形阅读窗口、白色折角。512 网格，留白兼容圆形头像裁切。
const LOGO_MARK: Part[] = [
  { shape: { d: "M128 400V112H300L384 196V272L300 316L392 400H300L204 312V400Z M204 184V248H276L308 232V208L284 184Z" }, fill: STAR },
  { shape: { d: "M300 112L384 196H300Z" }, fill: WHITE },
];
const LOGO: Part[] = [
  { shape: { rect: [0, 0, 512, 512, 116] }, fill: INK },
  ...LOGO_MARK,
];

/**
 * ImageMagick 画一个 d 里有几段（几个 M）的路径时不认 butt 和 miter，一律画成圆头圆角，所以只描边的路径按 M 拆开一段段画。
 * 有填充的不拆（logo 的 R 靠第二段挖出窗口）。拆开的每段都从绝对坐标的 M 开始，图形不变。
 */
function mvgShape(shape: Shape, split: boolean): string {
  if ("d" in shape) {
    const pieces = split ? shape.d.split(/(?=M)/) : [shape.d];
    return pieces.map((d) => `path '${d.trim()}'`).join(" ");
  }
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    return `circle ${cx},${cy} ${cx + r},${cy}`;
  }
  const [x, y, w, h, rx] = shape.rect;
  if (rx === 0) return `rectangle ${x},${y} ${x + w},${y + h}`;
  return `roundrectangle ${x},${y} ${x + w},${y + h} ${rx},${rx}`;
}

/**
 * 把图元拼成 MVG：viewBox 边长 box 的图形画到 size×SUPERSAMPLE 的画布中央，四周各留 pad 像素（按成品尺寸算）。
 * 线框图标都传 "butt", "miter"（直角端点、尖角拐角）；只有填充的图形（logo、头像）不传，保持默认。
 */
function mvg(
  parts: Part[],
  box: number,
  size: number,
  pad: number,
  strokeWidth: number,
  cap: "round" | "butt" = "round",
  join: "round" | "miter" = "round",
): string {
  const offset = pad * SUPERSAMPLE;
  const scale = ((size - 2 * pad) * SUPERSAMPLE) / box;
  const body = parts.map(
    (p) => `push graphic-context fill '${p.fill ?? "none"}' stroke '${p.stroke ?? "none"}' ${mvgShape(p.shape, !p.fill)} pop graphic-context`,
  );
  return [`translate ${offset},${offset}`, `scale ${scale},${scale}`, `stroke-width ${strokeWidth}`, `stroke-linecap ${cap}`, `stroke-linejoin ${join}`, "stroke-miterlimit 4", ...body].join(" ");
}

function findMagick(): string {
  for (const candidate of [process.env.MAGICK, "/opt/homebrew/bin/magick", "/usr/local/bin/magick", "/Applications/ServBay/bin/magick"]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return "magick";
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const magick = findMagick();

function render(draw: string, out: string, size: number) {
  const canvas = size * SUPERSAMPLE;
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(magick, [
    "-size", `${canvas}x${canvas}`, "xc:none", "-draw", draw,
    "-resize", `${size}x${size}`, "-strip", "-define", "png:compression-level=9", out,
  ]);
  const bytes = statSync(out).size;
  if (bytes > MAX_BYTES) throw new Error(`${out} 有 ${bytes} 字节，超过 40KB`);
  console.log(`${out.slice(root.length + 1)}  ${bytes} B`);
}

// tabBar 图标：81px 是 27pt 的 3 倍图；图形画在 24 里，四周各留 4.5px（1.5pt），页面上按 27 显示，图形正好 24。
for (const [name, draw] of Object.entries(TABS)) {
  render(mvg(draw(false), 24, 81, 4.5, 1.6, "butt", "miter"), join(root, "src/assets/tab", `${name}.png`), 81);
  render(mvg(draw(true), 24, 81, 4.5, 1.6, "butt", "miter"), join(root, "src/assets/tab", `${name}-on.png`), 81);
}
// logo 在精选刊头日期行里显示 24px，按 3 倍图出 72px；锐奇页 48px，出 168px。图形和配色不改。
render(mvg(LOGO, 512, 72, 0, 0), join(root, "src/assets/logo.png"), 72);
render(mvg(LOGO, 512, 168, 0, 0), join(root, "src/assets/reechi/logo.png"), 168);
// 后台头像使用满底正方形，让微信决定裁切；放在 src 外，不增加小程序代码包体积。
mkdirSync(join(root, "brand"), { recursive: true });
render(mvg([{ shape: { rect: [0, 0, 512, 512, 0] }, fill: INK }, ...LOGO_MARK], 512, 512, 0, 0), join(root, "brand/app-icon.png"), 512);

// 页面上的线框图标（24×24），按 3 倍图出、图形铺满，直角端点、尖角拐角。显示尺寸写在每一项前面。
const line = (d: string, stroke = PRINT): Part[] => [{ shape: { d }, stroke }];
const ICONS: { out: string; parts: Part[]; size: number; stroke: number }[] = [
  // 收藏按钮（条目页操作条、日报头条下面），描边按钮里 18px：空心书签，收藏以后换实心。
  { out: "item/bookmark.png", parts: line(BOOKMARK), size: 54, stroke: 1.6 },
  { out: "item/bookmark-on.png", parts: [{ shape: { d: BOOKMARK }, stroke: PRINT, fill: PRINT }], size: 54, stroke: 1.6 },
  // 条目页“同一事件”整块右边的箭头、锐奇页文档入口的箭头，都是 18px。
  { out: "item/chevron.png", parts: line(CHEVRON), size: 54, stroke: 1.8 },
  { out: "reechi/chevron.png", parts: line(CHEVRON), size: 54, stroke: 1.8 },
  // 日报翻页条的箭头 16px（不能点时页面上调淡）。
  { out: "daily/prev.png", parts: line("M15 5l-7 7 7 7"), size: 48, stroke: 1.8 },
  { out: "daily/next.png", parts: line(CHEVRON), size: 48, stroke: 1.8 },
  // “提醒我明天的日报”（描边按钮）的铃铛 18px。
  { out: "daily/bell.png", parts: line("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"), size: 54, stroke: 1.6 },
  // 收藏页日报卡“日报”前的折角纸 13px，和日报 tab 同一个图形。
  { out: "saved/daily.png", parts: TABS.daily(false).map((p) => ({ ...p, stroke: PRINT })), size: 39, stroke: 1.8 },
];
for (const { out, parts, size, stroke } of ICONS) {
  render(mvg(parts, 24, size, 0, stroke, "butt", "miter"), join(root, "src/assets", out), size);
}

// 钴蓝单色配图：原图在 brand/photos/（锐奇官网图、Unsplash 照片，不进代码包），转灰度后暗部印钴蓝、亮部是纸色，中间线性混合，
// 不叠网点和纹理。参数和原型 duotone/notes.md 的“配图”一节一致（出图逐像素相同）。显示尺寸见 components/figure。
const FIGURES: { src: string; out: string; crop: string[]; tone: string[]; quality: number }[] = [
  // 锐奇页页首通栏版图：显示 390 宽，按 2 倍出 780；裁掉原图上下的空背景（1000×1000 → 1000×660）。
  {
    src: "reechi-integrated-gauge.jpg", out: "reechi/plate-gauge.jpg",
    crop: ["-crop", "1000x660+0+170", "+repage", "-resize", "780x"],
    tone: ["-level", "0%,100%,0.78", "-sigmoidal-contrast", "3x50%"], quality: 86,
  },
  // 产线图：原图只有 437 宽，不放大，按原生尺寸出（显示 350 宽，2 倍屏下略软，是原图本身的限制）。
  {
    src: "reechi-gauge-line.jpg", out: "reechi/fig-line.jpg",
    crop: [],
    tone: ["-level", "0%,100%,0.92", "-sigmoidal-contrast", "2x50%"], quality: 86,
  },
  // 运动健康栏目配图：先裁成显示比例 350:176，再按 2 倍出 700×352。只由运动健康页引入，备用构建不带它。
  {
    src: "sports-running.jpg", out: "sports/cover.jpg",
    crop: ["-gravity", "center", "-crop", "900x452+0+0", "+repage", "-resize", "700x"],
    tone: ["-level", "0%,100%,0.92", "-sigmoidal-contrast", "2x50%"], quality: 80,
  },
];
for (const { src, out, crop, tone, quality } of FIGURES) {
  const file = join(root, "src/assets", out);
  mkdirSync(dirname(file), { recursive: true });
  execFileSync(magick, [
    join(root, "brand/photos", src), ...crop, "-colorspace", "gray", "-auto-level", ...tone,
    "+level-colors", `${COBALT},${PAPER}`, "-strip", "-quality", String(quality), file,
  ]);
  const bytes = statSync(file).size;
  if (bytes > MAX_FIGURE_BYTES) throw new Error(`${file} 有 ${bytes} 字节，超过 100KB`);
  console.log(`${file.slice(root.length + 1)}  ${bytes} B`);
}

// （以下“分享卡片的本地兜底图”一段从 HEAD 原样保留：SHARE_W、SHARE_H、SHARE_NAME、shareFont、shareOut、execFileSync、2KB 检查。）
```

### 4.5 搬图、删图

在 `apps/miniprogram` 下：

```bash
mkdir -p brand/photos
git mv src/assets/editorial/reechi-integrated-gauge.jpg brand/photos/
git mv src/assets/editorial/reechi-gauge-line.jpg brand/photos/
git mv src/assets/editorial/sports-running.jpg brand/photos/
npm run icons    # 重画 tab 和页面图标，出 src/assets/reechi/plate-gauge.jpg、src/assets/reechi/fig-line.jpg、src/assets/sports/cover.jpg
git rm src/assets/item/copy.png src/assets/item/share.png \
  src/assets/reechi/chat.png src/assets/reechi/doc.png src/assets/reechi/info.png src/assets/reechi/mail.png \
  src/assets/reechi/phone.png src/assets/reechi/pin.png src/assets/reechi/shield.png src/assets/reechi/product.png \
  src/assets/saved/bookmark.png src/assets/saved/device.png src/assets/saved/info.png \
  src/assets/star.png src/assets/star-ink.png
git add src/assets brand
```

- 彩色原图挪到 `brand/photos/`（`src/` 外，不进代码包，只当重出配图的底片）；`src/assets/editorial/` 整个没了。
- 删掉的图：条目页复制按钮的图标（原型的“复制来源链接”不带图标）、分享按钮的图标（原型的“分享给同事”“分享日报”只写字）、锐奇页联系方式和文档入口的七个图标和没人引用的 `product.png`（原型不用图标）、收藏页的手机、圆圈 i、小书签（收藏页不再用图标）、编辑式版的两颗小星（HEAD 里已经没人引用）。
- 保留并重画的：`tab/*.png`（10 张）、`item/bookmark.png`、`item/bookmark-on.png`、`item/chevron.png`、`reechi/chevron.png`、`daily/prev.png`、`daily/next.png`、`daily/bell.png`、`saved/daily.png`。不动：`logo.png`、`reechi/logo.png`（脚本照样重出，字节应不变）、`share/fallback.png`、`brand/app-icon.png`。
- 包体：去掉 248KB 彩色图，加 128KB 钴蓝图，再删掉十来张小图标。基线以 HEAD 重新构建的大小为准（16.1）。2026-11-07 评审在临时目录分别按 HEAD 和规格构建：`dist` 从 972KB 降到 832KB，少 140KB；`dist-no-sports` 从 792KB 降到 748KB，只少 44KB，因为备用包本来就不带 161KB 的运动配图。

### 4.6 新组件 `components/head-tab`、`components/reading`（含 `derive.ts`）、`components/figure`，新测试 `tests/reading-derive.test.ts`

照第 3 节原样新建。

### 4.7 分类方块：`components/category-tag`

tsx 只改注释（“色点”→“方块”），类名不变。scss 整份替换：

```scss
@use "../../styles/tokens" as *;

// 分类：8×8 方块（分类色，1PX 墨边，靠墨边在新闻纸上看得见）加分类名，字一律正文色，不用分类色写字。
.category-tag { display: inline-flex; align-items: center; flex: none; height: 20px; @include type-label; white-space: nowrap; }
.category-tag__dot { @include swatch; margin-right: 6px; }
```

### 4.8 AI 摘要标记：`components/ai-badge`

“AI 摘要”四个字和组件结构不变，tsx 只改注释（“细竖线”→“1PX 细框”）。scss：

```scss
@use "../../styles/tokens" as *;

// “AI 摘要”：1PX 次要色细框，12/500 正文色字，20 高。文字不能改（用户协议第 3 节）。
.ai-badge { box-sizing: border-box; display: inline-flex; align-items: center; flex: none; height: 20px; padding: 0 6px; border: $hair solid $mute; font-size: 12px; line-height: 18px; font-weight: 500; color: $body; white-space: nowrap; }
```

### 4.9 收藏按钮：`components/save-button`

tsx 只改头注释最后一句：“自己管样子：两种都是描边按钮（墨线、纸底、墨色书签），`flex: 1`；item 在条目页贴底操作条里排在‘分享给同事’左边，daily 在日报头条下的按钮行最前面。”scss：

```scss
@use "../../styles/tokens" as *;

// 描边按钮：墨线、纸底、墨字、墨色书签（PNG 本身是墨色，不用 filter）。收藏以后换实心书签；条目页的字变“已收藏”，日报的字一直是“收藏”。
.save-btn { @include btn-line; flex: 1; min-width: 0; }
.save-btn--down { background-color: $press; }
.save-btn__icon { flex: none; display: block; width: 18px; height: 18px; margin-right: 6px; }
```

`save-btn--item`、`save-btn--daily` 两个类名留在 tsx 里，不写样式。

### 4.10 分享按钮：`components/share-button`

照原型，“分享给同事”“分享日报”是只写字的墨底按钮（原型 `app.js` 的 `btn btn--ink` 不带 svg）。tsx 整份替换：不再渲染 `<Image>`，`item/share.png` 删掉（4.5）。`iconClassName` 改成可选、不再使用：并行实施期间 daily、article 两组谁先合并都编译得过，两组的新代码都不再传它。

```tsx
// “分享给同事”（条目页）、“分享日报”（日报 tab、某期日报页）：open-type 为 share 的按钮。点了由微信调页面的 onShareAppMessage
// （from 为 button），和右上角菜单是同一个回调（lib/use-share.ts），这里不管分享什么。样子由调用方的类名给，这里只去掉原生按钮的默认样式。
// 只写字、不带图标（墨底实心按钮，和收藏、提醒这两个描边按钮不同）。
import { Button } from "@tarojs/components";
import "./index.scss";

interface Props {
  label: string;
  /** 按钮的样子（条目页 item-btn、日报 daily-btn）。 */
  className: string;
  /** 不再使用（分享按钮不带图标了）。留成可选，还在传它的调用方照样编译得过。 */
  iconClassName?: string;
}

export function ShareButton({ label, className }: Props) {
  return (
    <Button className={`share-button ${className}`} hoverClass="share-button--down" openType="share">
      {label}
    </Button>
  );
}
```

scss 整份替换：

```scss
// 原生 button 的默认样式（左右内边距 14、18 号字、2.56 倍行高、5px 圆角、浅灰底、::after 的细边框、自动外边距）。
// 这里只清掉调用方不管的几样；底色、字、内边距、高度、flex 由调用方用两个类的选择器给（.item-btn.item-btn--ink、
// .daily-btn.daily-btn--ink），按下态用三个类（再加 .share-button--down），免得和这里同为一个类、只能靠样式表先后决定谁赢。
// 细边框画在原生 button 的 ::after 上，只能在这里清掉（全站唯一写在 View 以外的伪元素）。
.share-button { margin: 0; padding: 0; line-height: normal; border-radius: 0; }
.share-button::after { display: none; }
```

### 4.11 整屏状态和提示条：`components/page-state`

**tsx 不改，props 不加**（`title`、`detail`、`onRetry`、`action`、`secondary`）。只改 `secondary` 的注释：“第二个按钮，描边，排在后面”。scss 整份替换：

```scss
@use "../../styles/tokens" as *;

// 整屏状态：左对齐的标题、一句说明、按钮行（实心在前，描边在后）。不画线、不加色块、不用钴蓝；失败和空态长得一样，靠文字区分。
.page-state { margin: 24px $page 0; }
.page-state__title { display: block; @include type(17px, 24px, 600); }
.page-state__detail { display: block; margin-top: 6px; @include type(14px, 22px, 400, $body); overflow-wrap: break-word; }
.page-state__retry { @include btn-ink; display: inline-flex; min-width: 96px; margin-top: 16px; vertical-align: top; }
.page-state__retry--down { background-color: $ink-press; }
.page-state__retry--ghost { margin-left: 12px; border: $hair solid $ink; background-color: $paper; color: $ink; }
.page-state__retry--ghost.page-state__retry--down { background-color: $press; }

// 有内容（含快照）时刷新失败：通栏一块下沉的纸，整条可点重试。不用钴蓝、不画线。
.stale-notice { display: flex; align-items: center; min-height: $touch; margin-top: 16px; padding: 10px $page; background-color: $press; }
.stale-notice--down { background-color: $press-deep; }
.stale-notice__text { flex: 1; min-width: 0; @include type(13px, 19px, 400, $body); }
.stale-notice__retry { flex: none; margin-left: 12px; @include type(13px, 19px, 600); }
```

`components/drill-state` 只改头注释第一行最后一句：“样子是 page-state 的白卡。”改成“样子是 page-state 的左对齐状态块。”代码不动：“已下线或不存在”是实心“回到精选/日报/运动健康”；收藏过的条目是实心“从收藏移除”加描边“回到精选”，移除后只剩实心的回 tab。

### 4.12 提醒按钮：`components/remind-button`

tsx 不改。scss 整份替换（坑 3：`.remind-button--done image` 换成类名）：

```scss
@use "../../styles/tokens" as *;

// 样子由调用方的类名给（日报 daily-btn--line：通栏的描边按钮，单个类）。这里两个类的选择器压过它的边框和字色。
// 正在订阅：整颗调淡，不能点；已订阅：禁用色的边和字、铃铛调淡，不能点。图标用调用方给的类名 daily-btn__icon，不用标签选择器。
.remind-button.remind-button--busy { opacity: 0.6; }
.remind-button.remind-button--done { border-color: $off-line; color: $off; }
.remind-button--done .daily-btn__icon { opacity: 0.5; }
.remind-button.remind-button--down { background-color: $press; }
```

文字都来自 `lib/reminder.ts`（“提醒我明天的日报”“正在订阅…”“已订阅明天的日报”）。三份构建配置的模板 id 现在都空着，按钮不会出现；截图核对时临时填一个假 id 看样子，别提交。

### 4.13 心理援助热线：`components/hotline`

tsx、文案、号码都不改（只从元信息取）。scss 整份替换：

```scss
@use "../../styles/tokens" as *;

// 精选卡上（运动健康）：1PX 次要色细框里一行小字，标签正文色、号码墨色 DIN（电话号码不是读数，不印钴蓝）。点了照样进条目页。
.hotline { display: inline-flex; align-items: center; max-width: 100%; margin-top: 10px; padding: 4PX 8px; border: $hair solid $mute; }
.hotline__label { flex: none; @include type-label; }
.hotline__number { margin-left: 8px; @include num(13px, 20px, $ink); }

// 条目页上：1PX 墨线框的长条，不填色、不用钴蓝；左边标签（次要色）和号码（17 DIN 墨色），右边墨色“拨打”，整块可点拨号，高 ≥ 64。
.hotline-panel { display: flex; align-items: center; min-height: 64px; margin: 24px $page 0; padding: 10px 16px; border: $hair solid $ink; }
.hotline-panel--down { background-color: $press; }
.hotline-panel__text { flex: 1; min-width: 0; }
.hotline-panel__label { display: block; @include type-meta; }
.hotline-panel__number { display: block; margin-top: 2PX; @include num(17px, 24px, $ink); }
.hotline-panel__call { flex: none; margin-left: 12px; @include type(15px, 20px, 500); }
```

### 4.14 分类筛选：`components/filter-bar`

tsx 不改（注释“圆点颜色”改“方块颜色”）。scss 整份替换：

```scss
@use "../../styles/tokens" as *;

// “全部”固定在左，后面的分类横着滑。选中项墨色 600 加一根 2PX 墨线；分类名前 8px 方块。不画底线、不加底色。
// 左右内边距 10 + 每项内边距 10：第一个字从 x=20 起。
.filter-bar { display: flex; margin-top: 16px; padding: 0 10px; }
.filter-bar__scroll { flex: 1; min-width: 0; white-space: nowrap; }
.filter-seg { @include chip; }
.filter-seg--all { flex: none; }
.filter-seg--on { @include chip-on; }
.filter-seg--down { background-color: $press; }
.filter-seg__dot { @include swatch; margin-right: 6px; }
```

元信息没到或者没有分类时不画（逻辑不变）。运动健康的分类色现在都是兜底灰，方块都是灰底墨边。

### 4.15 文档同步：`apps/miniprogram/README.md`

只改描述视觉和资源的句子，行为描述一律不动：

| 位置 | 改成 |
|---|---|
| 开头“视觉基准是 editorial-r” | 视觉基准是 `docs/design/miniprogram-prototype/industrial/duotone/`（2026-11-07 选定的双色套印 · 技术期刊），实施规格 `docs/design/miniprogram-duotone.md`；`editorial-r/`、`a/` 保留为历史原型 |
| 10-29“同日落地编辑式 UI”那段后面 | 加一段（日期写合并当天的真实日期）：YYYY-MM-DD 落地双色套印版：新闻纸底、墨印正文、钴蓝专色只印刊头和栏头色块、读数、配图和“今日焦点”；精选页钴蓝竖排刊头；tabBar 改贴底通栏；配图改钴蓝单色。接口、分享、存储、提醒流程不变 |
| 目录 `src/app.config.ts` | 原生导航栏统一新闻纸底（`#e9e9e3`）、黑字 |
| 目录 `src/custom-tab-bar/` | 贴底通栏，新闻纸底、上沿一根细线；页面预留 76px 加安全区 |
| 目录 `src/styles/tokens.scss` | 双色套印的颜色、字体、字号角色、栅格、栏头和按钮 mixin |
| 目录 `components/dashboard`、`focus-card` | 制造是钴蓝竖排刊头（logo、日期、周次、今日焦点标题），运动健康是钴蓝栏头加日期和栏目配图；focus-card 导出刊头里的上半截和色块下的摘要、读数、“读摘要” |
| 目录（新增） | `components/head-tab`（钴蓝栏头）、`components/reading`（钴蓝读数；`derive.ts` 是周次、时刻、时间窗这些派生值的纯函数，`tests/reading-derive.test.ts`）、`components/figure`（钴蓝单色配图和图注） |
| 目录 `components/page-state` | “白卡”改“左对齐的状态块”；提示条是通栏下沉的纸 |
| 目录 `src/components/feed-list/`（第 139 行）“精选流的时间轴和卡片” | “精选流（钴蓝栏头分段、索引栏时刻）和卡片” |
| 目录 `src/assets/tab/` 那段 | 列 4.5 保留的图；删掉“焦点卡标识 star-ink.png”、收藏页手机、圆圈 i、书签和“‘分享日报’用 `item/share.png`”这几处说法 |
| “AI 摘要改用竖线文字标识” | “AI 摘要”是 1px 细框里的字 |
| `src/assets/editorial/` 两条 | 改成：原图在 `brand/photos/`（锐奇官网两张、Unsplash 一张，来源链接照抄原文），`npm run icons` 出钴蓝单色版：`src/assets/reechi/plate-gauge.jpg`、`fig-line.jpg`（锐奇页，注明“图：锐奇官网产品图 / 配图”），`src/assets/sports/cover.jpg`（运动健康栏目配图，“图：Unsplash”，只由运动健康页引入，备用包不带） |
| “精选流：列表与分页”第一句“每张卡挂在左侧的竖轴上” | 卡片左边是索引栏（北京时刻），卡与卡之间只留空 |
| “精选流：列表与分页”的“卡片”一条（第 171–173 行） | 时刻改成“索引栏只写北京时刻 `HH:mm`，日期在段头里”；“标题两行、摘要三行截断”改成“摘要三行截断”（标题在 HEAD 和这一版都不截断） |
| “时间轴分段”里“段头显示名称、日期和已加载条数” | 段头是钴蓝栏头：今天的段只写时段，往日写“昨天”或日期，右边带日期和星期；不显示条数 |
| “整屏状态”第 2 条“占位”（第 215 行）“整屏只留刊头 logo 行” | “整屏只留刊头（精选是钴蓝色块和 logo，运动健康是栏头）” |
| “今日焦点卡 · 去重”（第 238–239 行） | 删掉“段头条数按去掉以后的算”；“不画轴”改成“不画段” |
| “快照”里“在头部 logo 行右边标” | 精选在刊头日期行下面标，运动健康在栏头下面标 |
| “今日焦点卡 · 样子” | 刊头右栏：钴蓝“今日焦点”、分类和“AI 摘要”、22px 标题（最多 4 行）；色块下：摘要 4 行、来源名、“N 家来源”（≥ 2）和“最新 HH:mm”读数、墨底“读摘要” |
| “事件页 · 事件卡”“谁在报，怎么说” | 去掉圆点、轴线、虚线、星青节点的说法：读数行（来源数、首报、最新）、标题，“事件综述”“谁在报，怎么说”是钴蓝栏头，报道按时间列成一列，“首报”“最新”写在来源名后面 |
| “日报 · 头部”“头条区”“分节” | 翻页条“前一天 / 后一天”文字按钮；钴蓝日数 + 刊名 + 时间窗；读数行；“今日头条”栏头；收藏和分享日报一行、提醒单独一行；分节是钴蓝栏头加“N 条”和“AI 摘要”，不再画圆点 |
| “运动健康 · 头部”“筛选条” | 钴蓝栏头写板块名，右边日期和周次，下面钴蓝单色栏目配图；筛选条在配图下（制造在焦点摘要下），不再有“生活精选”“行业精选”标题 |
| “占位”里“暖纸刊头的 logo 行” | 精选只剩钴蓝刊头和 logo，运动健康只剩栏头 |
| “收藏 tab” | 顶上钴蓝栏头“我的收藏”和条数，一行本机说明和“按收藏时间排序”，板块筛选，卡片之间留空不画线；删掉“标题（两行）”“头条（两行）”（代码从来没有截断，这一版也不截） |
| “打开收藏过的条目”（第 445 行）“已下线或不存在”的“白卡”“回 tab 的按钮挪到后面成浅灰” | “状态块”；“回 tab 的按钮挪到后面成描边” |
| “原型与正式实现的边界” | 视觉基准改为 duotone；“自定义浮动 tabBar”改“贴底 tabBar”；“独立的收藏/分享操作条”改“贴底的新闻纸操作条” |

---

## 5. feed 组（精选 tab 与运动健康 tab）

### 5.1 刊头：`components/dashboard`

**竖排刊头只在制造板块**（`board` 为空）。左边钴蓝色块宽 72，从屏幕左缘和导航栏下沿同时出血，里面只有竖排反白的刊名：按 notes 的建议**用一个字一个 `Text` 竖着堆**（每字 `display: block`，34/42），不用 `writing-mode`（Skyline 不支持）。四个字 168 + 上下内边距 38 = 206，色块 `min-height: 208`。色块里只有钴蓝和纸色。右栏：日期行（logo 24×24、右边距 8、“11月7日 周六”，右端“第 45 周”）；有快照时日期行下面一行“08:05 的内容”；底部是焦点的上半截（`focus`，见 5.2），靠 `justify-content: space-between` 压到色块底边。原来的“每日精选”字样、logo 旁的横排“锐奇微报”去掉。竖排的四个字各是一个 `Text`，读屏会一个字一个字地读，所以色块加 `ariaRole="heading"`、`ariaLabel={title}`，每个字加 `ariaHidden`，刊名一次读完。

**运动健康**（`board` 有值）：不出竖排刊头。顶上一个钴蓝栏头写板块名（元信息 `board.name`，没到时用构建配置），栏头右边“11月7日 周六”和“第 45 周”；有快照时下面一行“08:05 的内容”；再下面钴蓝单色栏目配图（350×176，图注“栏目配图”“图：Unsplash”）。不放 logo，不放大号板块名。

`index.tsx` 整份替换：

```tsx
// 精选页顶部。制造：钴蓝竖排刊头。左边一块钴蓝色块（宽 72，从屏幕左缘和导航栏下沿出血），里面只有竖排反白的刊名，一个字一个 Text
// 竖着堆（不用 writing-mode）；右栏上面是 logo、日期和周次，下面是今日焦点的上半截（focus，由 board-feed 传 FocusHead），
// 焦点标题的最后一行落在色块底边。运动健康：不出竖排刊头，顶上一个钴蓝栏头写板块名，右边日期和周次，下面是钴蓝单色的栏目配图。
// 全站只有这一处竖排刊名。日期和周次只由北京“今天”推出来（元信息 readings.date，没有时用本机时钟），不编期号。
import type { ReactNode } from "react";
import { Image, Text, View } from "@tarojs/components";
import logo from "../../assets/logo.png";
import { HeadTab } from "../head-tab";
import { Reading } from "../reading";
import { Figure } from "../figure";
import { dayWeek, isoWeek } from "../reading/derive";
import { beijingDate } from "../../lib/beijing";
import "./index.scss";

interface Props {
  /** 刊名（构建配置 appName，“锐奇微报”），制造板块竖排在色块里。 */
  title: string;
  /** 元信息 readings.date（北京今天）；没有或不对时用本机时钟的北京日期。 */
  date: string | null;
  /** 快照时间“08:05 的内容”（lib/screen.ts 的 snapshotStamp）；没有时不画。 */
  stamp?: string | null;
  /** 占位：制造只留色块和 logo，运动健康只留栏头；不写日期、周次。 */
  brandOnly?: boolean;
  /** 运动健康（按天看的板块）：栏头写板块名。 */
  board?: { name: string } | null;
  /** 运动健康栏目配图（钴蓝单色），由页面引入，备用构建不带。 */
  cover?: string;
  /** 制造板块今日焦点的上半截（FocusHead），放在刊头右栏底部；没有焦点时不传。 */
  focus?: ReactNode;
}

export function Dashboard({ title, date, stamp = null, brandOnly = false, board = null, cover, focus = null }: Props) {
  const today = date && dayWeek(date) ? date : beijingDate(Date.now());
  const day = brandOnly ? null : dayWeek(today);
  const week = brandOnly ? null : isoWeek(today);
  if (board) {
    return (
      <View className="dash-sports">
        <HeadTab label={board.name} aside={[day, week !== null && <Reading value={week} before="第" after="周" size="s" />]} />
        {stamp && <Text className="dash-sports__stamp">{stamp}</Text>}
        {cover && !brandOnly && (
          <View className="dash-sports__cover">
            <Figure kind="cover" src={cover} name="栏目配图" source="Unsplash" label="户外登阶运动，栏目配图" />
          </View>
        )}
      </View>
    );
  }
  return (
    <View className="mast">
      {/* 读屏把竖排刊名当一个标题读一次，不一个字一个字地读。 */}
      <View className="mast__band" ariaRole="heading" ariaLabel={title}>
        {Array.from(title).map((char, i) => (
          <Text key={i} className="mast__char" ariaHidden>
            {char}
          </Text>
        ))}
      </View>
      <View className="mast__main">
        <View>
          <View className="mast__date">
            <View className="mast__dayline">
              <Image className="mast__logo" src={logo} />
              {day && <Text className="mast__day">{day}</Text>}
            </View>
            {week !== null && <Reading value={week} before="第" after="周" size="m" />}
          </View>
          {stamp && <Text className="mast__stamp">{stamp}</Text>}
        </View>
        {focus}
      </View>
    </View>
  );
}
```

`index.scss` 整份替换：

```scss
@use "../../styles/tokens" as *;

// ---------- 制造：钴蓝竖排刊头 ----------
// 色块里只有钴蓝和纸色；logo 不压在色块里（深墨方块在钴蓝上只有 1.80:1，边缘发糊），放在右栏日期行最前面。
.mast { display: flex; align-items: stretch; }
// 竖排：每字一个块，34/42，靠顶排。四个字 168 + 上下内边距 38 = 206，min-height 留 208。
.mast__band { flex: none; display: flex; flex-direction: column; align-items: center; width: $band; min-height: 208px; padding: 20px 0 18px; background-color: $cobalt; }
.mast__char { display: block; @include type-mast; text-align: center; }
// 右栏上下撑开：日期贴顶，焦点标题压到色块底边。
.mast__main { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 18px $page 14px $gutter; }
.mast__date { display: flex; align-items: center; justify-content: space-between; }
.mast__dayline { display: flex; align-items: center; min-width: 0; margin-right: 12px; }
.mast__logo { flex: none; display: block; width: 24px; height: 24px; margin-right: 8px; }
.mast__day { @include type(16px, 24px, 600); white-space: nowrap; }
.mast__stamp { display: block; margin-top: 4PX; @include type-meta; }

// ---------- 运动健康：栏头 + 栏目配图 ----------
.dash-sports { padding-top: 16px; }
.dash-sports__stamp { display: block; margin-top: 8px; padding: 0 $page; @include type-meta; }
.dash-sports__cover { margin: 16px $page 0; }
```

### 5.2 今日焦点：`components/focus-card`

拆成两个导出：`FocusHead` 在刊头右栏（钴蓝“今日焦点”、分类和“AI 摘要”、焦点标题），`FocusCard` 在色块下面通栏（摘要、来源名、读数、“读摘要”）。“AI 摘要”放在分类那一行的**右端**（用户协议写的是“卡片右上角标”）。只有“读摘要”能点开条目页（和 HEAD 一样）。

**截断是新增的**：HEAD 的 `.focus-card__title`、`.focus-card__summary` 都不截断（原型 notes 说“和现在的 focus-card__summary 一样”，这句不对）。这次照原型，焦点标题截 4 行，焦点摘要也截 4 行，全文都在条目页。这是一处新增的截断，已列进 1.2 对照表和第 15 节第 6 条请使用者确认。确认前照此实施；不要的话，删掉下面 scss 里两处 `@include clamp(4)`。

`index.tsx` 整份替换：

```tsx
// 今日焦点（只在制造板块，只由接口给出）。上半截 FocusHead 放在刊头右栏底部：钴蓝“今日焦点”、分类和“AI 摘要”（行尾，即右上角）、
// 焦点标题（最多 4 行，色块跟着标题长高）。下半截 FocusCard 在色块下面通栏：摘要（截 4 行，全文在条目页）、来源名（按首报先后）、
// 来源数（≥ 2 才有）和最新报道时刻两个读数、墨底“读摘要”（打开真实条目）。不出名次和热度，不硬配产品图。
import { Text, View } from "@tarojs/components";
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
import { Reading } from "../reading";
import { stampParts } from "../reading/derive";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import { categoryChip, focusFoot, showAiBadge } from "../../lib/card";
import "./index.scss";

interface HeadProps {
  focus: MiniprogramFocus;
  /** 分类 key → 分类名，来自元信息。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 方块颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
}

export function FocusHead({ focus, labels, colors }: HeadProps) {
  const chip = categoryChip(focus.category, labels, colors);
  const ai = showAiBadge(focus.ai);
  return (
    <View className="focus-head">
      <Text className="focus-head__kicker">今日焦点</Text>
      {(chip || ai) && (
        <View className="focus-head__meta">
          {chip && <CategoryTag chip={chip} />}
          <View className="focus-head__gap" />
          {ai && <AiBadge />}
        </View>
      )}
      <View className="focus-head__title">{focus.title}</View>
    </View>
  );
}

export function FocusCard({ focus, onOpen }: { focus: MiniprogramFocus; onOpen: (id: string) => void }) {
  const foot = focusFoot(focus);
  const latest = stampParts(focus.latestAt, Date.now());
  return (
    <View className="focus-card">
      {focus.summary && <View className="focus-card__summary">{focus.summary}</View>}
      <View className="focus-card__sources">{foot.sources}</View>
      <View className="focus-card__bar">
        {foot.echo && (
          <View className="focus-card__reading">
            <Reading value={foot.echo.count} after="家来源" size="l" />
          </View>
        )}
        {latest && (
          <View className="focus-card__reading">
            <Reading value={latest.clock} before={latest.day ? `最新 ${latest.day}` : "最新"} size="l" />
          </View>
        )}
        <View className="focus-card__read" hoverClass="focus-card__read--down" onClick={() => onOpen(focus.id)} ariaRole="button" ariaLabel={`阅读摘要：${focus.title}`}>
          读摘要
        </View>
      </View>
    </View>
  );
}
```

`index.scss` 整份替换：

```scss
@use "../../styles/tokens" as *;

// 刊头右栏里的上半截。
.focus-head__kicker { display: block; margin-top: 22px; @include type-kicker; }
.focus-head__meta { display: flex; align-items: center; min-height: 20px; margin-top: 10px; }
.focus-head__gap { flex: 1; min-width: 8px; }
.focus-head__title { margin-top: 8px; @include type-headline; @include clamp(4); }

// 色块下面通栏的下半截。
.focus-card { padding: 20px $page 0; }
.focus-card__summary { @include type-body; @include clamp(4); }
.focus-card__sources { margin-top: 10px; @include type-meta; overflow-wrap: anywhere; }
.focus-card__bar { display: flex; align-items: center; margin-top: 12px; }
.focus-card__reading { flex: none; margin-right: 20px; }
.focus-card__read { @include btn-ink; flex: none; margin-left: auto; }
.focus-card__read--down { background-color: $ink-press; }
```

### 5.3 板块整屏：`components/board-feed`

hook 和状态逻辑（`useBoardMeta`、`useFeed`、`feedScreen`、`visibleFocus`、下拉刷新、切回、30 分钟、重试）一字不动。只改渲染：去掉“行业精选”“生活精选”标题和 `board-reading` 包裹，焦点拆成两段。`index.scss` **删掉**，tsx 去掉 `import "./index.scss"`。import 里 `FocusCard` 改成 `{ FocusCard, FocusHead }`。头注释改成：“两个板块共用：真实精选流、分类、分页和快照；制造顶上是钴蓝竖排刊头和今日焦点，运动健康顶上是钴蓝栏头和栏目配图。”

从 `const title = buildConfig.appName;` 往下替换成：

```tsx
  const title = buildConfig.appName;
  // 按天看的板块：头部只写板块名，元信息没到时用构建配置的兜底值。
  const boardHeader = config.byDay ? { name: meta?.board.name || config.name } : null;
  if (screen.kind === "mismatch") {
    return (
      <View>
        <Dashboard title={title} date={null} board={boardHeader} />
        <PageState
          title="配置有误"
          detail={`接口回的板块是 ${screen.actual}，这里要的是 ${board}（${config.name}），请检查构建配置里的 api 地址`}
        />
      </View>
    );
  }
  if (screen.kind === "placeholder") {
    return (
      <View>
        <Dashboard title={title} date={null} board={boardHeader} brandOnly />
        <PageState title={screen.title} detail={screen.body} />
      </View>
    );
  }

  const now = Date.now();
  const labels: Record<string, string> = {};
  for (const c of meta?.categories ?? []) labels[c.key] = c.label;
  const colors = config.categoryColors;
  const stamp = screen.kind === "content" && screen.snapshotAt ? snapshotStamp(screen.snapshotAt, now) : null;
  const focus = visibleFocus(screen, feed.state, config.focusCard);
  // 焦点只画在制造的竖排刊头里。FocusCard 里是模型写的摘要，它自己不带“AI 摘要”，标识在 FocusHead 里，两个必须成对出现。
  // 按天看的板块没有竖排刊头，以后就算在 config/boards.ts 打开 focusCard，也不画焦点，列表里也不去掉那张卡。
  const headed = focus && !boardHeader ? focus : null;
  const filter = config.filterBar && meta && meta.categories.length > 0 ? filterChips(meta.categories, colors) : null;
  const open = (id: string) => openPage(itemPage(board, id));
  return (
    <View>
      <Dashboard
        title={title}
        date={meta?.readings.date ?? null}
        stamp={stamp}
        board={boardHeader}
        cover={cover}
        focus={headed ? <FocusHead focus={headed} labels={labels} colors={colors} /> : null}
      />
      {headed && <FocusCard focus={headed} onOpen={open} />}
      {filter && <FilterBar chips={filter} active={category} onPick={setPicked} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
      {screen.kind === "empty" &&
        (screen.filtered ? (
          <PageState title="该分类暂无内容" action={{ text: "查看全部", onClick: () => setPicked(null) }} />
        ) : (
          <PageState title="暂无精选内容" />
        ))}
      {screen.kind === "content" && screen.stale && <StaleNotice text={staleNotice(feed.state.generatedAt, now)} onRetry={retry} />}
      {(screen.kind === "loading" || screen.kind === "content") && (
        <FeedList
          state={feed.state}
          labels={labels}
          colors={colors}
          focusId={headed?.id ?? null}
          onOpen={open}
          onRetry={feed.retry}
          byDay={config.byDay}
          hotline={meta?.notice.hotline ?? null}
        />
      )}
    </View>
  );
}
```

（`Text` 不再用到，从 import 里去掉，否则 `noUnusedLocals` 报错。）

**FocusCard 不能脱离 FocusHead 单独出现**：两个都由同一个 `headed` 决定，FeedList 的 `focusId` 也用它。现在运动健康的 `focusCard` 是 false，`headed` 和 `focus` 结果一样；这样写是防止以后有人给按天看的板块打开 `focusCard`，页面上就会出现一段没有标题、也没有“AI 摘要”的模型摘要。

### 5.4 精选列表：`components/feed-list`

段头是钴蓝栏头（`HeadTab`，label 就是 `lib/timeline.ts` 的段名）：今天的段（凌晨、上午、下午、晚间，或运动健康的“今天”）只写段名；往日的段右边写 `sectionDate()`（“昨天”旁“11月6日 周五”，更早的段名是日期，旁边写“周四”）。不再显示时段范围（“0–6 时”）和条数。**当前时段不做标记**（HEAD 的 `feed-period--live` 本来就没有样式；钴蓝只给四类地方），tsx 里不再输出这个类。

卡片：制造左边索引栏 52 宽印北京时刻（`clockOf(card.anchorAt)`，钴蓝 DIN Condensed 22，日期已经在段头里，所以“昨天 18:27”“10-15 17:28”都只写“18:27”“17:28”），栏距 16，内容栏从 x=88 起；运动健康不显示时刻，内容从 x=20 占满。分类一行：方块+分类名在左，“AI 摘要”在行尾（右上角）。标题 17/26 600（已读改 `$body`），摘要 15/24 截 3 行，底部来源名（次要色、单行省略）和右端“2 家来源”（≥ 2 才有；数字钴蓝，字正文色），热线在最下面。整张卡可点、按下通栏变 `$press`；卡与卡之间只留空。

`index.tsx` 整份替换：

```tsx
// 精选流：今天按凌晨、上午、下午、晚间分段，往日按天（运动健康一律按天，lib/timeline.ts）。段头是钴蓝栏头：今天的段只写段名
// （日期在刊头里），往日的段右边带日期和星期（由段的日期推出来，不读日报）。制造的卡片左边是索引栏（北京时刻，钴蓝 DIN Condensed），
// 运动健康不显示时刻、内容占满页宽。卡与卡之间只留空，不要底色、阴影和分隔线。同一事件只显示一张卡，来源数在卡片底部。
import { Text, View } from "@tarojs/components";
import type { MiniprogramCard, MiniprogramHotline } from "@aihot/contracts/miniprogram";
import { HeadTab } from "../head-tab";
import { Reading } from "../reading";
import { clockOf, sectionDate } from "../reading/derive";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import { Hotline } from "../hotline";
import { hotlineFor } from "../../lib/board-feed";
import { categoryChip, showAiBadge, sourceCountChip } from "../../lib/card";
import { withoutFocus, type FeedState } from "../../lib/feed";
import { timelineSections, type TimelineSection } from "../../lib/timeline";
import "./index.scss";

interface Props {
  /** read：这个板块已读的条目 id（use-feed.ts 带上）；没带时都当没读。 */
  state: FeedState & { read?: ReadonlySet<string> };
  /** 分类 key → 分类名，来自元信息；还没拿到时为空表。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 方块颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
  /** 正在显示的焦点的 id：列表里去掉这张。没画焦点时为 null。 */
  focusId: string | null;
  onOpen: (id: string) => void;
  /** 续页失败时点“重试”。 */
  onRetry: () => void;
  /** 按天看的板块（构建配置的 byDay）：一律按天分段，卡片不显示时刻。 */
  byDay?: boolean;
  /** 元信息的 notice.hotline：它指定的分类，卡片上显示热线。 */
  hotline?: MiniprogramHotline | null;
}

export function FeedList({ state, labels, colors, focusId, onOpen, onRetry, byDay = false, hotline = null }: Props) {
  const now = Date.now();
  // 还没有卡片：页面在加载中时才渲染这里，空态和失败页面自己显示。
  if (state.cards.length === 0) return <Text className="feed-list__status">加载中…</Text>;
  const cards = withoutFocus(state.cards, focusId);
  // 已加载的卡只有焦点那一张：不画段，只留底部状态。
  if (cards.length === 0) return <Footer state={state} onRetry={onRetry} byDay={byDay} />;
  return (
    <View className="feed-list">
      {timelineSections(cards, now, byDay).map((section) => (
        <Period
          key={section.key}
          section={section}
          now={now}
          labels={labels}
          colors={colors}
          read={state.read}
          onOpen={onOpen}
          showTime={!byDay}
          hotline={hotline}
        />
      ))}
      <Footer state={state} onRetry={onRetry} byDay={byDay} />
    </View>
  );
}

interface PeriodProps {
  section: TimelineSection;
  now: number;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  read: ReadonlySet<string> | undefined;
  onOpen: (id: string) => void;
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Period({ section, now, labels, colors, read, onOpen, showTime, hotline }: PeriodProps) {
  const date = sectionDate(section.key, section.title, now);
  return (
    <View className="feed-period">
      <HeadTab label={section.title} aside={date} />
      <View className="feed-period__cards">
        {section.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            labels={labels}
            colors={colors}
            read={read?.has(card.id) ?? false}
            onOpen={onOpen}
            showTime={showTime}
            hotline={hotline}
          />
        ))}
      </View>
    </View>
  );
}

/** 列表底部：加载中、续页失败重试、没有更早的了。制造对齐内容栏（x=88），运动健康对齐页边。 */
function Footer({ state, onRetry, byDay }: { state: FeedState; onRetry: () => void; byDay: boolean }) {
  const className = byDay ? "feed-list__status" : "feed-list__status feed-list__status--indent";
  if (state.phase === "loading" || state.more === "loading") return <Text className={className}>加载中…</Text>;
  if (state.phase === "failed" || state.more === "failed") {
    return (
      <View className={`${className} feed-list__status--retry`} hoverClass="feed-list__status--down" ariaRole="button" onClick={onRetry}>
        加载失败，点击重试
      </View>
    );
  }
  if (!state.hasMore) return <Text className={className}>没有更早的了</Text>;
  return null;
}

interface CardProps {
  card: MiniprogramCard;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  /** 打开过条目页：标题改用正文色（D25）。 */
  read: boolean;
  onOpen: (id: string) => void;
  /** 索引栏的时刻（anchorAt 的北京时刻）；按天看的板块不显示。 */
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Card({ card, labels, colors, read, onOpen, showTime, hotline }: CardProps) {
  const chip = categoryChip(card.category, labels, colors);
  const echo = sourceCountChip(card.sourceCount);
  const help = hotlineFor(card.category, hotline);
  const ai = showAiBadge(card.ai);
  return (
    <View className="feed-entry" hoverClass="feed-entry--down" onClick={() => onOpen(card.id)}>
      {showTime && <Text className="feed-entry__time num">{clockOf(card.anchorAt)}</Text>}
      <View className="feed-entry__main">
        {(chip || ai) && (
          <View className="feed-entry__meta">
            {chip && <CategoryTag chip={chip} />}
            <View className="feed-entry__gap" />
            {ai && <AiBadge />}
          </View>
        )}
        <View className={read ? "feed-entry__title feed-entry__title--read" : "feed-entry__title"}>{card.title}</View>
        {card.summary && <View className="feed-entry__summary">{card.summary}</View>}
        <View className="feed-entry__foot">
          <Text className="feed-entry__src">{card.source.name}</Text>
          {echo && (
            <View className="feed-entry__echo">
              <Reading value={card.sourceCount} after="家来源" size="s" body />
            </View>
          )}
        </View>
        {help && <Hotline hotline={help} />}
      </View>
    </View>
  );
}
```

`index.scss` 整份替换：

```scss
@use "../../styles/tokens" as *;

// 段：钴蓝栏头（components/head-tab）下面是卡片。第一段离筛选条 16（和原型 .period 一样）；
// 段与段之间：上一段最后一张卡的下内边距 8 + 外边距 14 + 24 = 46。
.feed-period { margin-top: 16px; }
.feed-period + .feed-period { margin-top: 24px; }
.feed-period__cards { padding-top: 12px; }
// 整张卡可点：按下时通栏变 $press（从屏幕左缘到右缘）。卡与卡之间只留空：上下内边距 8 + 外边距 14，内容之间 30。
.feed-entry { display: flex; padding: 8px $page; margin-bottom: 14px; }
.feed-entry--down { background-color: $press; }
// 索引栏：北京时刻，钴蓝 DIN Condensed 22。安卓回落到 Roboto Condensed 时“18:27”约 49 宽，放得进 52。
.feed-entry__time { flex: none; width: $index; margin-right: $gutter; @include cond(22px, 22px); white-space: nowrap; }
.feed-entry__main { flex: 1; min-width: 0; }
.feed-entry__meta { display: flex; align-items: center; min-height: 20px; margin-bottom: 6px; }
.feed-entry__gap { flex: 1; min-width: 8px; }
.feed-entry__title { @include type-card; }
.feed-entry__title--read { color: $body; }
.feed-entry__summary { margin-top: 6px; @include type-summary; @include clamp(3); }
.feed-entry__foot { display: flex; align-items: baseline; margin-top: 8px; }
.feed-entry__src { flex: 1; min-width: 0; @include type-meta; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feed-entry__echo { flex: none; margin-left: 12px; }

// 底部状态：加载中、没有更早的了（次要色）；续页失败（墨色 600，整行可点、按下变 $press）。
.feed-list__status { display: block; padding: 16px $page 24px; @include type-meta; }
.feed-list__status--indent { padding-left: $content-x; }
.feed-list__status--retry { display: flex; align-items: center; min-height: $touch; margin-bottom: 16px; padding-top: 0; padding-bottom: 0; @include type(13px, 20px, 600); }
.feed-list__status--down { background-color: $press; }
```

### 5.5 `pages/feed/index.tsx`、`pages/sports/index.tsx`

- `pages/feed/index.tsx`：只改头注释，“编辑式精选流”改成“精选流（钴蓝竖排刊头）”。
- `pages/sports/index.tsx`：配图 import 改成 `import sportsCover from "../../assets/sports/cover.jpg";`；头注释改成：“运动健康 tab：钴蓝栏头、钴蓝单色栏目配图、分类与按天分段的精选流，只请求运动健康行业实例。配图只作栏目配图，不作为新闻现场。列表行为和精选 tab 共用。备用构建（--mode prod-no-sports）里没有这一页，也就不带这张图。”其余不动。

### 5.6 feed 组的状态

| 状态 | 制造（精选 tab） | 运动健康 |
|---|---|---|
| 内容 | 钴蓝刊头（日期、周次、焦点上半截）+ 焦点摘要和读数 + 筛选条 + 段和卡 + 底部状态 | 栏头（日期、周次）+ 配图 + 筛选条 + 段和卡 |
| 快照（刷新还没回来） | 刊头日期行下面“08:05 的内容” | 栏头下面一行“08:05 的内容” |
| 网络不好（有内容时失败） | 筛选条下面通栏 `$press` 提示条“内容更新失败，当前显示 08:05 的内容 / 重试”，有它时不标快照时间 | 同左 |
| 加载中 | 刊头（色块 + 日期行，右栏下面空着）+ 筛选条（有元信息时）+“加载中…” | 栏头 + 配图 + “加载中…” |
| 加载失败 | 刊头 + PageState“加载失败 / 原因 / 重试” | 栏头 + 配图 + 同左 |
| 空 | 刊头 + PageState“暂无精选内容”；筛了分类是“该分类暂无内容”+ 实心“查看全部” | 同左 |
| 有筛选（焦点不收） | 刊头只有日期行，色块旁空着；没有焦点摘要；筛选条和列表。点分类、点回“全部”时整页会上下跳（14.3） | 不受影响 |
| 占位 | 色块 + logo（不写日期周次）+ 占位文案 | 栏头（只有板块名）+ 占位文案，不画配图 |
| 配置有误 | 刊头（有日期周次、没有焦点）+ PageState“配置有误 / 说明” | 栏头（有日期周次）+ 同左，不画配图 |
| 已读 | 卡片标题变正文色 | 同左 |
| 续页加载中 / 失败 / 到底 | 底部“加载中…”/“加载失败，点击重试”（墨色 600，可点）/“没有更早的了”，左对齐 x=88 | 同左，左对齐 x=20 |
| 热线 | — | 卡片底部 1PX 细框“文案 号码” |
| 下拉刷新 | 原生：新闻纸底、深色加载点 | 同左 |

---

## 6. daily 组：`components/daily-issue`

`pages/daily`、`pages/daily-issue` 的 tsx 不改（`DailyIssue` 的 props 不变）。`lib/daily.ts` 的整屏状态、`dailyView` 的字段照用；`section.color` 不再画（分节不画圆点，钴蓝栏头里不放分类色）。

页面从上到下（x 是 390 设计稿里的位置）：

```
 ‹ 前一天            11月6日 周五            后一天 ›     翻页条，44 高；日期 14 次要色；不能点的那边 $off、箭头调淡
                     08:05 的内容                         快照时才有，13 次要色，居中
 06   锐奇制造日报                                          日数：钴蓝 DIN Condensed 64/50，最小宽 52；刊名 26/34 600
      11月5日 08:00 至 11月6日 08:00                        时间窗 13/18 次要色（daily.window 推出来）
      5 个分节   24 条   08:00 出刊                         读数从 x=88 起；数字钴蓝 DIN 20，单位 13 次要色
[今日头条] [AI 摘要]                                        钴蓝栏头，上方 34；头条或导语是模型写的才标
 我国已制定实施新型储能国标及行标150项                       21/30 600，可长按选择
 我国已制定实施新型储能……                                    16/28 正文色，不截断，可长按选择
 [ 收藏 ]          [ 分享日报 ]                              描边 / 墨底，各 flex 1，间隔 12，上方 20
 [ 提醒我明天的日报                         ]                只在日报 tab 且配了模板 id：单独一行、通栏描边，上方 12
 点一次只提醒一次，明天想再收就再点一次                       13 次要色
 （网络不好提示条）
[锂电] [AI 摘要] 7 条                                       分节栏头：节里任一条标题是模型写的才标；条数钴蓝 16
 科达年产50万吨锂电负极材料一体化项目在包头开工               16/25 500；下面来源 13 次要色；整行可点，按下通栏 $press
 ……
[快讯] 3 条                                                 flashes 非空时最后一节
[AI 摘要] 日报由模型根据前一日 08:00 至当日 08:00 的精选内容整理，每日 08:00 出刊
```

### 6.1 tsx 改动

- import：去掉 `headerDate` 以外不再用的东西照常清理；加 `import { HeadTab } from "../head-tab";`、`import { Reading } from "../reading";`、`import { windowText } from "../reading/derive";`，按 0.2 第 13 条的先后放在 `AiBadge` 前面。
- 头注释改成：“日报 tab 和某期日报共用：翻页条、钴蓝日数和刊名、时间窗、读数行、‘今日头条’栏头、分节栏头和条目、页尾说明。内容和翻期均由真实接口驱动。”
- `DailyIssue` 的结构不变（配置有误、占位、没有日报栏目只画 PageState；非内容态画 `Head` + 状态；内容态 `Head` + `Lead` + 提示条 + 分节 + 页尾）。内容态给 `Head` 多传 `span={windowText(daily.window)}`；外层的 `daily-secs` 包裹去掉，分节直接排。
- `Head`、`DayButton`、`Lead`、`Section` 换成下面的写法，`Meter` 删掉（换成 `Reading`）：

```tsx
interface HeadProps {
  title?: string;
  heading?: { day: string; weekday: string } | null;
  /** heading 为 null 时写的字（最新一期还没到时“最新一期”，日期不对时原样的日期）。 */
  pending?: string;
  /** 内容还没到时为 null：前后两个按钮不能点，读数是“—”。 */
  view?: DailyView | null;
  /** 快照的时间标记（“08:05 的内容”）。 */
  stamp?: string | null;
  /** 时间窗“11月5日 08:00 至 11月6日 08:00”（components/reading/derive.ts 的 windowText）；没有时不画。 */
  span?: string | null;
  onGo?: (date: string) => void;
}

function Head({ title, heading, pending, view = null, stamp, span = null, onGo }: HeadProps) {
  const day = heading && pending ? pending.slice(-2) : null;
  return (
    <View className="daily-head">
      <View className="daily-nav">
        <DayButton icon={prevIcon} label="前一天" target={view?.prev ?? null} onGo={onGo} />
        <Text className="daily-nav__date">{heading ? `${heading.day} ${heading.weekday}` : pending}</Text>
        <DayButton icon={nextIcon} label="后一天" target={view?.next ?? null} onGo={onGo} after />
      </View>
      {stamp && <Text className="daily-head__stamp">{stamp}</Text>}
      <View className="daily-head__issue">
        {day && <Text className="daily-head__day num">{day}</Text>}
        <View className="daily-head__id">
          <Text className="daily-head__title">{title}</Text>
          {span && <Text className="daily-head__span">{span}</Text>}
        </View>
      </View>
      <View className={day ? "daily-head__readings daily-head__readings--indent" : "daily-head__readings"}>
        <View className="daily-head__reading"><Reading value={view ? view.sectionCount : "—"} after="个分节" size="l" /></View>
        <View className="daily-head__reading"><Reading value={view ? view.itemCount : "—"} after="条" size="l" /></View>
        <View className="daily-head__reading"><Reading value={DAILY_COPY.issueTime} after="出刊" size="l" /></View>
      </View>
    </View>
  );
}

/** 翻页按钮：44 高，文字加箭头；没有相邻期（或内容还没到）时禁用。 */
interface DayButtonProps {
  icon: string;
  label: string;
  target: string | null;
  onGo?: (date: string) => void;
  /** “后一天”：箭头在字后面。 */
  after?: boolean;
}

function DayButton({ icon, label, target, onGo, after }: DayButtonProps) {
  const on = target !== null && !!onGo;
  return (
    <View
      className={on ? "daily-nav__btn" : "daily-nav__btn daily-nav__btn--off"}
      hoverClass={on ? "daily-nav__btn--down" : "none"}
      ariaRole="button"
      ariaLabel={label}
      onClick={on ? () => onGo!(target!) : undefined}
    >
      {!after && <Image className="daily-nav__icon daily-nav__icon--prev" src={icon} />}
      <Text>{label}</Text>
      {after && <Image className="daily-nav__icon daily-nav__icon--next" src={icon} />}
    </View>
  );
}

function Lead({ lead, board, reminder, draft }: LeadProps) {
  return (
    <View className="daily-lead">
      {lead.headline && (
        <View>
          <HeadTab label="今日头条" aside={lead.ai ? <AiBadge /> : null} />
          <View className="daily-lead__body">
            {lead.headline.title && (
              <Text className="daily-lead__title" userSelect>
                {lead.headline.title}
              </Text>
            )}
            {lead.headline.paragraph && (
              <Text className="daily-lead__text" userSelect>
                {lead.headline.paragraph}
              </Text>
            )}
          </View>
        </View>
      )}
      <View className="daily-lead__acts">
        <SaveButton draft={draft} variant="daily" />
        <ShareButton label="分享日报" className="daily-btn daily-btn--ink" />
      </View>
      {reminder && <RemindButton board={board} templateId={reminder} className="daily-btn--line" iconClassName="daily-btn__icon" />}
      {reminder && <Text className="daily-lead__hint">{REMINDER_COPY.hint}</Text>}
    </View>
  );
}

function Section({ section, onOpen }: { section: DailySectionView; onOpen: (itemId: string) => void }) {
  return (
    <View className="daily-sec">
      {/* 节名不是模型写的；节里任一条目的标题是模型写的就在栏头旁标一次（用户协议：日报在每个分节标题旁标）。 */}
      <HeadTab label={section.label} aside={[section.ai && <AiBadge />, <Reading value={section.count} after="条" size="s" />]} />
      <View className="daily-sec__items">
        {section.lines.map((line) => (
          <View key={line.key} className="daily-line" ariaRole="button" ariaLabel={line.title} hoverClass="daily-line--down" onClick={() => onOpen(line.itemId)}>
            <Text className="daily-line__title">{line.title}</Text>
            <Text className="daily-line__source">{line.source}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
```

`Lead` 的头注释改成：“头条：‘今日头条’栏头（头条或导语是模型写的就标‘AI 摘要’）、头条和导语。按钮行：‘收藏’（描边，日报 tab 和某期日报页都有，D28）和‘分享日报’（墨底、只写字，open-type 为 share，分享正在看的这一期）；‘提醒我明天的日报’只在日报 tab 且配了模板 id，单独一行通栏描边，下面一句提示。”

### 6.2 `index.scss`（整份替换）

```scss
@use "../../styles/tokens" as *;

// ---------- 翻页条、刊头、读数 ----------
.daily-nav { display: flex; align-items: center; justify-content: space-between; padding: 4PX 10px 0; }
.daily-nav__btn { flex: none; display: flex; align-items: center; height: $touch; padding: 0 10px; @include type(15px, 20px, 400); }
.daily-nav__btn--down { background-color: $press; }
.daily-nav__btn--off { color: $off; }
.daily-nav__icon { flex: none; display: block; width: 16px; height: 16px; }
.daily-nav__icon--prev { margin-right: 2PX; }
.daily-nav__icon--next { margin-left: 2PX; }
// 箭头 PNG 是墨色，不能点时调淡一半，叠在新闻纸上接近 $off。
.daily-nav__btn--off .daily-nav__icon { opacity: 0.5; }
.daily-nav__date { flex: 1; min-width: 0; text-align: center; @include type(14px, 20px, 400, $mute); }
.daily-head__stamp { display: block; padding: 0 $page; text-align: center; @include type-meta; }
.daily-head__issue { display: flex; align-items: flex-end; padding: 18px $page 0; }
// 日数“06”：钴蓝 DIN Condensed 64，行高 50（iOS 上 DIN Condensed 字面偏低，真机核对基线，要调只调行高）。
.daily-head__day { flex: none; min-width: $index; margin-right: $gutter; @include cond(64px, 50px); }
.daily-head__id { flex: 1; min-width: 0; }
.daily-head__title { display: block; @include type-issue; }
.daily-head__span { display: block; margin-top: 2PX; @include type(13px, 18px, 400, $mute); }
.daily-head__readings { display: flex; flex-wrap: wrap; padding: 16px $page 0; }
.daily-head__readings--indent { padding-left: $content-x; }
.daily-head__reading { margin: 0 22px 6px 0; }

// ---------- 今日头条 ----------
.daily-lead { margin-top: $section; }
.daily-lead__body { padding: 16px $page 0; }
.daily-lead__title { display: block; @include type-lead; }
.daily-lead__text { display: block; margin-top: 10px; @include type-body; }
.daily-lead__acts { display: flex; margin-top: 20px; padding: 0 $page; }
// “分享日报”是原生 button（components/share-button）：样子写成两个类，压过 share-button 的重置；按下态三个类。
.daily-btn.daily-btn--ink { @include btn-ink; flex: 1; min-width: 0; margin-left: 12px; }
.daily-btn.daily-btn--ink.share-button--down { background-color: $ink-press; }
// “提醒我明天的日报”（View）：单独一行、通栏的描边按钮。已订阅、正在订阅的样子在 components/remind-button。
.daily-btn--line { @include btn-line; margin: 12px $page 0; }
// 提醒按钮的铃铛（分享日报不带图标）。
.daily-btn__icon { flex: none; display: block; width: 18px; height: 18px; margin-right: 6px; }
.daily-lead__hint { display: block; margin-top: 8px; padding: 0 $page; @include type-meta; }

// ---------- 分节 ----------
.daily-sec { margin-top: $section; }
.daily-sec__items { padding-top: 8px; }
.daily-line { display: block; padding: 10px $page; }
.daily-line--down { background-color: $press; }
.daily-line__title { display: block; @include type-line; }
.daily-line__source { display: block; margin-top: 2PX; @include type-meta; }

// ---------- 页尾、加载中 ----------
.daily-note { display: flex; align-items: flex-start; margin: $section $page 0; }
.daily-note__text { flex: 1; min-width: 0; margin-left: 8px; @include type(13px, 21px, 400, $mute); }
.daily__status { display: block; padding: 24px $page; @include type-meta; }
```

### 6.3 日报的状态

| 状态 | 样子 |
|---|---|
| 内容 | 如上 |
| 快照 | 翻页条下面居中一行“08:05 的内容” |
| 网络不好 | 头条按钮下面通栏 `$press` 提示条，可点重试；有它时不标快照时间 |
| 加载中（最新一期还没到） | 翻页条两边都禁用，日期处写“最新一期”；没有日数，刊名（`board.siteName` 或“日报”）从 x=20 起；读数三个“—”（“08:00 出刊”照写）；下面“加载中…” |
| 加载中（翻到某期） | 日期写那一天，日数照出；其余同上 |
| 加载失败 | 头部同“加载中”，下面 PageState“加载失败 / 原因 / 重试” |
| 最新一期 404 | 头部 + PageState“首期日报尚未发布，每日 08:00 出刊” |
| 某期 404 / 日期不对 | 头部 + PageState“该日期暂无日报”+ 实心“查看最新一期” |
| 零条的一期 | 头部（读数 0）+ PageState“本期暂无条目”；不画头条、分节、页尾 |
| 有条目但没有头条 | 不画“今日头条”栏头，只剩按钮行 |
| 禁用翻页 | 那一边字 `$off`、箭头 `.5`，不能点、没有按下态 |
| 收藏 / 已收藏 | 描边“收藏”，空心 / 实心墨书签，字一直是“收藏” |
| 提醒 / 正在订阅 / 已订阅 | 描边“提醒我明天的日报”/ 整颗 0.6“正在订阅…”/ `$off-line` 边、`$off` 字、铃铛 0.5“已订阅明天的日报”，后两种不能点 |
| 配置有误 / 占位 / 本板块不提供日报 | 只有 PageState（和 HEAD 一样不画头部） |
| 下拉刷新（日报 tab） | 原生：新闻纸底、深色加载点 |

---

## 7. article 组：`pages/item`、`pages/story`

### 7.1 条目页：`pages/item`

从上到下：分类一行（方块+分类名在左，“AI 摘要”在行尾，覆盖标题和摘要）、23/33 标题、署名（来源名和“11-06 发布”两段，间隔 16，不用“ · ”）、16/28 摘要；“为什么值得看”栏头（`ai.reason` 单独标）和正文；心理援助热线长条（运动健康的指定分类）；站内全文时“正文”或“译文”栏头（`ai.body` 才标）、译文不完整提示、rich-text；“来源”栏头：来源名、“11-06 发布”（没归进事件且 ≥ 2 时后面跟“2 家来源”读数）、右边描边小按钮“复制来源链接”、版权说明；归进事件时“同一事件”栏头，整块可点进事件页：“3 家来源”读数（事件层级，单位正文色）、`view.story.line`（“A、B等的相关报道，查看事件进展”）、右边墨色箭头。**不显示事件标题**：标题是模型写的，用户协议第 3 节列的标识位置里没有“条目页的事件入口”，要不要显示等第 15 节第 2 条拍板，拍板前照这里的写法，`AiBadge` 维持 12 处。最下面贴底操作条：新闻纸底、上沿 1PX `$rule`，描边“收藏 / 已收藏”（flex 1）和墨底“分享给同事”（flex 1.6，只写字）。

**tsx 改动**（`ItemPage` 的 hook、分享、`useCategoryLabels`、`useHotline`、`LinkSheet` 的逻辑不变）：

- import：去掉 `copyIcon`；加 `HeadTab`、`Reading`（放在 `AiBadge` 前面）和 `import { sourceTotal } from "../../components/reading/derive";`。保留 “hotline 排在 drill-state 前面” 那条注释和顺序。
- 头注释第二行改成：“新闻纸上的正文、钴蓝栏头分出的‘为什么值得看’‘来源’‘同一事件’，贴底的收藏和分享条；只在来源允许时展示站内全文。”
- 非内容态：

```tsx
  if (screen.kind === "content") return <ItemContent board={target!.board} item={screen.item} />;
  return (
    <View className="item">
      {screen.kind === "loading" && <Text className="item__status">加载中…</Text>}
      {screen.kind === "missing" && <MissingState board={target?.board ?? null} saved={target} />}
      {screen.kind === "placeholder" && <PausedState board={target!.board} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
    </View>
  );
```

- `ItemContent` 的 return 换成：

```tsx
  // 没归进事件、同一事实 ≥ 2 家时，来源栏的发布日期后面跟来源数（view.echo 只在这时有值）。
  const echoCount = view.echo !== null ? item.sourceCount : null;
  return (
    <View className="item">
      <View className="item-art">
        {(view.chip || view.aiBadge) && (
          <View className="item-art__meta">
            {view.chip && <CategoryTag chip={view.chip} />}
            <View className="item-art__gap" />
            {view.aiBadge && <AiBadge />}
          </View>
        )}
        <Text className="item-art__title" userSelect>
          {item.title}
        </Text>
        <View className="item-art__by">
          <Text className="item-art__src">{item.source.name}</Text>
          {view.published && <Text>{view.published}</Text>}
        </View>
        {item.summary && (
          <Text className="item-art__summary" userSelect>
            {item.summary}
          </Text>
        )}
      </View>

      {view.reason && (
        <View className="item-block">
          <HeadTab label="为什么值得看" aside={view.reason.ai ? <AiBadge /> : null} />
          <View className="item-block__body">
            <Text className="item-block__text" userSelect>
              {view.reason.text}
            </Text>
          </View>
        </View>
      )}

      {help && <Hotline hotline={help} panel />}

      {view.body && (
        <View className="item-block">
          <HeadTab label={view.body.label} aside={view.body.ai ? <AiBadge /> : null} />
          <View className="item-block__body">
            {view.body.incomplete && <Text className="item-body__hint">译文还不完整，完整内容请复制来源链接查看原文</Text>}
            <RichText className="item-body__text" nodes={view.body.nodes} userSelect />
          </View>
        </View>
      )}

      <View className="item-block">
        <HeadTab label="来源" />
        <View className="item-block__body">
          <View className="item-source">
            <View className="item-source__who">
              <Text className="item-source__name">{item.source.name}</Text>
              <View className="item-source__date">
                <Text>{view.published}</Text>
                {echoCount !== null && (
                  <View className="item-source__echo">
                    <Reading value={echoCount} after="家来源" size="s" />
                  </View>
                )}
              </View>
            </View>
            <View className="item-copy" ariaRole="button" ariaLabel="复制来源链接" hoverClass="item-copy--down" onClick={copyLink}>
              复制来源链接
            </View>
          </View>
          <Text className="item-source__note">{view.sourceNote}</Text>
        </View>
      </View>

      {item.story && view.story && (
        <View className="item-block">
          <HeadTab label="同一事件" />
          {/* 只写事件层级的来源数和其他来源，不显示事件标题：标题是模型写的，用户协议第 3 节没列这个位置。读屏读 lib 给的“同一事件，N 家来源”。 */}
          <View className="item-story" ariaRole="button" ariaLabel={view.story.title} hoverClass="item-story--down" onClick={() => openPage(storyPage(board, view.story!.id))}>
            <View className="item-story__main">
              <Reading value={sourceTotal(item.story.sourceCount)} after="家来源" size="m" body />
              <Text className="item-story__line">{view.story.line}</Text>
            </View>
            <Image className="item-story__go" src={chevronIcon} />
          </View>
        </View>
      )}

      {/* 收藏按钮自己管收藏和取消（components/save-button）；“分享给同事”走页面的分享回调（lib/use-share.ts）。 */}
      <View className="item-acts">
        <SaveButton draft={itemDraft(board, item)} variant="item" />
        <ShareButton label="分享给同事" className="item-btn item-btn--ink" />
      </View>

      {fallbackUrl && <LinkSheet url={fallbackUrl} onClose={() => setFallbackUrl(null)} />}
    </View>
  );
```

`LinkSheet` 的 JSX 和文字不变（“无法复制来源链接”“请长按下方链接并选择复制，再在浏览器中打开”“关闭”），只换样子。

**`index.scss`（整份替换）**：

```scss
@use "../../styles/tokens" as *;

.item { padding-bottom: 24px; }
.item__status { display: block; padding: 24px $page; @include type-meta; }

// ---------- 正文 ----------
.item-art { padding: 22px $page 0; }
.item-art__meta { display: flex; align-items: center; min-height: 20px; }
.item-art__gap { flex: 1; min-width: 8px; }
.item-art__title { display: block; margin-top: 12px; @include type-article; }
.item-art__by { display: flex; flex-wrap: wrap; margin-top: 10px; @include type-meta; }
.item-art__src { margin-right: 16px; }
.item-art__summary { display: block; margin-top: 18px; @include type-body; }

// ---------- 栏目：为什么值得看、正文/译文、来源、同一事件（钴蓝栏头贴屏幕左缘，正文在页边内）----------
.item-block { margin-top: $section; }
.item-block__body { padding: 14px $page 0; }
.item-block__text { display: block; @include type-body; }
// 译文不完整：通栏一块下沉的纸（左右各伸出页边 20）。
.item-body__hint { display: block; margin: 0 (-$page) 12px; padding: 8px $page; background-color: $press; @include type(13px, 20px, 400, $body); }
// 站内全文：字号和行高由这里给，段间距和标题、列表、引用、表格的样子在 lib/item.ts 的 bodyNodes 行内样式里（不改）。
.item-body__text { display: block; font-size: 16px; line-height: 1.75; color: $body; overflow-wrap: break-word; }

.item-source { display: flex; align-items: center; }
.item-source__who { flex: 1; min-width: 0; margin-right: 12px; }
.item-source__name { display: block; @include type(16px, 24px, 500); overflow-wrap: break-word; }
.item-source__date { display: flex; align-items: baseline; flex-wrap: wrap; @include type-meta; }
.item-source__echo { margin-left: 12px; }
.item-copy { @include btn-line; @include btn-sm; flex: none; }
.item-copy--down { background-color: $press; }
.item-source__note { display: block; margin-top: 12px; @include type(13px, 21px, 400, $mute); }

// 同一事件：整块可点，按下通栏变 $press。来源数读数（单位正文色，和原型 .story__count 一样）下面是其他来源一行，不显示事件标题。
.item-story { display: flex; align-items: center; min-height: $touch; padding: 14px $page 4PX; }
.item-story--down { background-color: $press; }
.item-story__main { flex: 1; min-width: 0; margin-right: 12px; }
.item-story__line { display: block; margin-top: 8px; @include type(14px, 22px, 400, $body); overflow-wrap: break-word; }
.item-story__go { flex: none; display: block; width: 18px; height: 18px; }

// ---------- 贴底操作条：新闻纸底，上沿一根 $rule（页面里唯二的线之一）----------
.item-acts { position: fixed; z-index: 50; left: 0; right: 0; bottom: 0; display: flex; padding: 10px $page calc(10px + env(safe-area-inset-bottom)); background-color: $paper; border-top: $hair solid $rule; }
// “分享给同事”是原生 button，只写字：两个类压过 share-button 的重置，按下态三个类。
.item-btn.item-btn--ink { @include btn-ink; flex: 1.6; min-width: 0; margin-left: 12px; }
.item-btn.item-btn--ink.share-button--down { background-color: $ink-press; }

// ---------- 复制失败弹层 ----------
.link-sheet { position: fixed; z-index: 100; left: 0; top: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; padding: 0 $page; background-color: $overlay; }
.link-sheet__card { width: 100%; padding: 20px; background-color: $paper; }
.link-sheet__title { display: block; @include type(17px, 24px, 600); }
.link-sheet__hint { display: block; margin-top: 6px; @include type-meta; }
.link-sheet__url { display: block; margin-top: 12px; padding: 10px 12px; background-color: $press; @include type(13px, 20px, 400); word-break: break-all; }
.link-sheet__close { @include btn-ink; margin-top: 16px; }
.link-sheet__close--down { background-color: $ink-press; }
```

条目页的状态：加载中（“加载中…”13 次要色，x=20）；已下线或不存在（PageState + 实心“回到精选”或“回到运动健康”；收藏过的条目是实心“从收藏移除”+ 描边回 tab，移除后提示“已从收藏移除”、只剩实心回 tab）；占位（PageState，行业包文案或内置文案）；加载失败（PageState + 重试）；收藏 / 已收藏（描边，空心书签“收藏”/ 实心书签“已收藏”）；译文不完整（通栏 `$press` 提示）；复制成功（toast“已复制，可到浏览器打开”）；复制失败（弹层：遮罩、新闻纸卡片、链接放在 `$press` 框里可长按、墨底“关闭”）；热线（1PX 墨框长条，号码墨色 DIN 17，“拨打”，整块可点）。

### 7.2 事件页：`pages/story`（原型没画，按规则推）

从上到下：读数行（“3 家来源”钴蓝 18、“首报 11-06 08:00”“最新 11-06 17:28” 钴蓝 16，间隔 20，可折行）、23/33 标题（`ai.title` 为真时标题最后一个字后面跟“AI 摘要”）；“事件综述”栏头（`ai.digest` 才标）和 16/28 正文（为 null 或空白整块不画）；网络不好提示条；“谁在报，怎么说”栏头，栏头右边任一报道 `ai.title` 为真时“AI 摘要”，再右边“按发布时间”；报道从早到晚列成一列：每条一行“来源名（13/600 墨，单行省略）＋首报/最新（12/600 墨）……日期（13 次要色，靠右）”，下面 16/25 500 标题；有条目页的整行可点、按下通栏 `$press`，没有的不能点、标题用正文色；最后一行“有后续进展时，这一页会接着往下长”（13 次要色）。**不画时间轴**（圆点、轴线、虚线、空心圈都去掉）：页面里不画线，先后靠“首报”“最新”和日期说明。

**tsx 改动**（hook、下拉刷新、`storyScreen`、`storyView` 不变）：

- import：加 `HeadTab`、`Reading`（放在 `AiBadge` 前面）和 `import { sourceTotal } from "../../components/reading/derive";`。`Fact` 组件删掉。
- 头注释改成：“事件页：下钻页……原生导航栏放返回和‘事件’。读数行（来源数、首报、最新）、标题（按 ai.title 标），‘事件综述’（按 ai.digest 标，没有综述整块不显示），下面‘谁在报，怎么说’按发布时间列出报道，首报、最新写在来源名后面；有条目页的报道点进条目页。不分享。”
- 非内容态：

```tsx
  if (screen.kind === "content") return <StoryContent board={target!.board} story={screen.story} stale={screen.stale !== null} onRetry={retry} />;
  return (
    <View className="story">
      {screen.kind === "loading" && <Text className="story__status">加载中…</Text>}
      {screen.kind === "missing" && <MissingState board={target?.board ?? null} />}
      {screen.kind === "placeholder" && <PausedState board={target!.board} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
    </View>
  );
```

- `StoryContent`：

```tsx
function StoryContent({ board, story, stale, onRetry }: ContentProps) {
  const now = Date.now();
  const view = storyView(story, now);
  return (
    <View className="story">
      <View className="story-head">
        <View className="story-head__readings">
          <View className="story-head__reading">
            <Reading value={sourceTotal(story.sourceCount)} after="家来源" size="m" />
          </View>
          {view.first && (
            <View className="story-head__reading">
              <Reading before="首报" value={view.first} size="s" />
            </View>
          )}
          {view.latest && (
            <View className="story-head__reading">
              <Reading before="最新" value={view.latest} size="s" />
            </View>
          )}
        </View>
        <View className="story-head__title">
          <Text userSelect>{story.title}</Text>
          {view.titleAi && (
            <View className="story-head__ai">
              <AiBadge />
            </View>
          )}
        </View>
      </View>

      {view.digest && (
        <View className="story-block">
          <HeadTab label="事件综述" aside={view.digest.ai ? <AiBadge /> : null} />
          <View className="story-block__body">
            <Text className="story-block__text" userSelect>
              {view.digest.text}
            </Text>
          </View>
        </View>
      )}

      {stale && <StaleNotice text={staleNotice(story.generatedAt, now)} onRetry={onRetry} />}

      <View className="story-block">
        <HeadTab label="谁在报，怎么说" aside={[view.reportsAi && <AiBadge />, "按发布时间"]} />
        <View className="story-reports">
          {view.reports.map((report) => {
            const itemId = report.itemId;
            return (
              <View
                key={report.key}
                className="story-rp"
                hoverClass={itemId ? "story-rp--down" : "none"}
                onClick={itemId ? () => openPage(itemPage(board, itemId)) : undefined}
              >
                <View className="story-rp__meta">
                  <Text className="story-rp__source">{report.source}</Text>
                  {report.tag && <Text className="story-rp__tag">{report.tag}</Text>}
                  <Text className="story-rp__date">{report.date}</Text>
                </View>
                <Text className={itemId ? "story-rp__title" : "story-rp__title story-rp__title--plain"}>{report.title}</Text>
              </View>
            );
          })}
          <Text className="story-grow">有后续进展时，这一页会接着往下长</Text>
        </View>
      </View>
    </View>
  );
}
```

**`index.scss`（整份替换）**：

```scss
@use "../../styles/tokens" as *;

.story { padding-bottom: 24px; }
.story__status { display: block; padding: 24px $page; @include type-meta; }

// ---------- 读数行和标题 ----------
.story-head { padding: 22px $page 0; }
.story-head__readings { display: flex; flex-wrap: wrap; align-items: baseline; }
.story-head__reading { margin: 0 20px 6px 0; }
.story-head__title { margin-top: 8px; @include type-article; }
// “AI 摘要”跟在标题最后一个字后面。
.story-head__ai { display: inline-block; margin-left: 6px; vertical-align: 3PX; line-height: 0; }

// ---------- 事件综述、谁在报 ----------
.story-block { margin-top: $section; }
.story-block__body { padding: 14px $page 0; }
.story-block__text { display: block; @include type-body; }
.story-reports { padding-top: 8px; }
// 每条报道整行可点（有条目页时），按下通栏变 $press。不画轴线、圆点和虚线。
.story-rp { padding: 10px $page; }
.story-rp--down { background-color: $press; }
.story-rp__meta { display: flex; align-items: center; min-height: 20px; }
.story-rp__source { flex: 0 1 auto; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; @include type(13px, 20px, 600); }
.story-rp__tag { flex: none; margin-left: 8px; @include type(12px, 20px, 600); }
.story-rp__date { flex: none; margin-left: auto; padding-left: 12px; @include type-meta; }
.story-rp__title { display: block; margin-top: 4PX; @include type-line; }
// 没有条目页的报道不能点，标题用正文色，和能点的分开。
.story-rp__title--plain { color: $body; }
.story-grow { display: block; padding: 10px $page 0; @include type(13px, 21px, 400, $mute); }
```

事件页的状态：加载中、已下线或不存在（实心回 tab）、占位、加载失败（同条目页）；有内容时下拉刷新失败（事件综述下面通栏提示条，可点重试）；只有一条报道（它带“首报”，没有“最新”）；没有综述（“谁在报”直接接在标题下）；报道不能点（没有按下态、标题正文色）；下拉刷新（原生新闻纸底、深色点）。

---

## 8. library 组：`pages/saved`、`pages/reechi`、`pages/doc`

### 8.1 收藏页：`pages/saved`（原型没画，按规则推）

从上到下：上方 16，钴蓝栏头“我的收藏”，右边读数“N 条”（钴蓝 18；收藏读不出来时“—”）；一行 13 次要色：左“仅保存在本机，设备间不同步”（`SAVED_COPY.local`），右“按收藏时间排序”；板块筛选（全部 / 制造 / 运动健康，样子同分类筛选，选中墨色 600 加 2PX 墨线，不画底线）；卡片（不画分隔线，卡与卡之间留空，整张可点、按下通栏 `$press`）；底部说明。“收藏内容 / 随时查阅”大标题、手机图标、圆圈 i、小书签图标都去掉。

卡片：
- 条目：分类方块+分类名（左）、“AI 摘要”（行尾，即右上角）；17/26 600 标题（不截断，和 HEAD 一样；原型没画这一页，不新增截断）；底部来源名（次要色、单行省略）、“2 家来源”（≥ 2 才有，数字钴蓝、字正文色）、“10-29 收藏”（13 次要色）。
- 日报：折角纸图标 13px +“日报”（13 正文色）、“AI 摘要”（行尾）；标题“锐奇制造日报”（17/600 墨）后面跟“10月28日”（17/400 次要色）；头条 15/24 正文色（不截断，和 HEAD 一样）；底部“10-29 收藏”。

**tsx 改动**（存储、筛选、隐藏板块、点击跳转的逻辑不动）：

- import：去掉 `bookmarkIcon`、`deviceIcon`、`infoIcon`；保留 `dailyIcon`、`Image`；加 `HeadTab`、`Reading`（放在 `AiBadge` 前面）。
- 头注释第二行改成：“顶上钴蓝栏头‘我的收藏’和条数、一行本机说明、板块筛选，下面是卡片，页面底部说明收藏只存本机、清理缓存或换手机会清空。”
- `SavedPage` 的 return：

```tsx
  return (
    <View className="saved">
      <View className="saved-head">
        <HeadTab label="我的收藏" aside={<Reading value={entries ? shown.length : "—"} after="条" size="m" />} />
        <View className="saved-head__sub">
          <Text className="saved-head__local">{SAVED_COPY.local}</Text>
          <Text>按收藏时间排序</Text>
        </View>
      </View>
      <View className="saved-filters">
        {(["all", ...shownBoards.map((item) => item.key)] as const).map((key) => {
          const selected = activeBoard === key;
          const label = key === "all" ? "全部" : buildConfig.boards.find((item) => item.key === key)?.name;
          return (
            <View
              key={key}
              className={selected ? "saved-filter saved-filter--on" : "saved-filter"}
              hoverClass={selected ? "none" : "saved-filter--down"}
              ariaRole="button"
              ariaLabel={label}
              onClick={() => setBoard(key)}
            >
              {label}
            </View>
          );
        })}
      </View>
      {entries === null && <PageState title={SAVED_COPY.unreadable} detail={SAVED_COPY.unreadableDetail} onRetry={() => setAttempt((n) => n + 1)} />}
      {entries !== null && filtered.length === 0 && (
        <PageState title={SAVED_COPY.emptyTitle} detail={activeBoard === "all" ? SAVED_COPY.emptyDetail : "该板块暂无收藏"} />
      )}
      {filtered.length > 0 && (
        <View className="saved-list">
          {filtered.map((entry) => (
            <SavedCard key={`${entry.kind}:${entry.board}:${entry.id}`} entry={entry} labels={labels[entry.board] ?? {}} now={now} />
          ))}
        </View>
      )}
      <View className="saved-note">
        <Text className="saved-note__text">
          {SAVED_COPY.note[0]}
          <Text className="saved-note__em">{SAVED_COPY.note[1]}</Text>
          {SAVED_COPY.note[2]}
        </Text>
      </View>
    </View>
  );
```

- `Head` 组件删掉（并进上面）。`SavedCard`：

```tsx
function SavedCard({ entry, labels, now }: { entry: SavedEntry; labels: Readonly<Record<string, string>>; now: number }) {
  const daily = entry.kind === "daily";
  const chip = daily ? null : categoryChip(entry.category, labels, boardConfig(entry.board).categoryColors);
  // 同一事实的来源数，≥ 2 才显示；日报和“只显示摘要”（null）不显示。
  const count = !daily && entry.sourceCount !== null && sourceCountChip(entry.sourceCount) ? entry.sourceCount : null;
  const savedOn = displayDate(entry.savedAt, now);
  const open = () => openPage(daily ? dailyIssuePage(entry.board, entry.id) : itemPage(entry.board, entry.id));
  return (
    <View className="saved-card" ariaRole="button" ariaLabel={entry.title || (daily ? entry.siteName : "查看收藏")} hoverClass="saved-card--down" onClick={open}>
      {(daily || chip || entry.ai) && (
        <View className="saved-card__meta">
          {daily ? (
            <View className="saved-card__kind">
              <Image className="saved-card__kind-icon" src={dailyIcon} />
              日报
            </View>
          ) : (
            chip && <CategoryTag chip={chip} />
          )}
          <View className="saved-card__gap" />
          {entry.ai && <AiBadge />}
        </View>
      )}
      {daily ? (
        <View className="saved-card__title">
          {entry.siteName}
          <Text className="saved-card__day">{headerDate(entry.id)?.day ?? entry.id}</Text>
        </View>
      ) : (
        <View className="saved-card__title">{entry.title}</View>
      )}
      {daily && entry.title && <View className="saved-card__lead">{entry.title}</View>}
      <View className="saved-card__foot">
        <Text className="saved-card__src">{daily ? "" : entry.sourceName}</Text>
        {count !== null && (
          <View className="saved-card__echo">
            <Reading value={count} after="家来源" size="s" body />
          </View>
        )}
        {savedOn && <Text className="saved-card__on">{savedOn} 收藏</Text>}
      </View>
    </View>
  );
}
```

**`index.scss`（整份替换）**：

```scss
@use "../../styles/tokens" as *;

.saved { padding-bottom: 8px; }
.saved-head { padding-top: 16px; }
.saved-head__sub { display: flex; flex-wrap: wrap; justify-content: space-between; margin-top: 10px; padding: 0 $page; @include type-meta; }
.saved-head__local { margin-right: 12px; }
// 板块筛选：样子同分类筛选（chip），第一个字从 x=20 起。原来的 flex gap 去掉（老安卓不认）。
.saved-filters { display: flex; margin-top: 8px; padding: 0 10px; }
.saved-filter { @include chip; }
.saved-filter--on { @include chip-on; }
.saved-filter--down { background-color: $press; }
// 卡片：整张可点，按下通栏变 $press；卡与卡之间只留空（8 + 14 + 8 = 30），不画分隔线。
.saved-list { padding-top: 12px; }
.saved-card { display: block; padding: 8px $page; margin-bottom: 14px; }
.saved-card--down { background-color: $press; }
.saved-card__meta { display: flex; align-items: center; min-height: 20px; margin-bottom: 6px; }
.saved-card__gap { flex: 1; min-width: 8px; }
.saved-card__kind { display: inline-flex; align-items: center; @include type-label; }
.saved-card__kind-icon { flex: none; display: block; width: 13px; height: 13px; margin-right: 6px; }
// 标题和日报头条都不截断（HEAD 也不截；原型没画这一页，不新增截断）。
.saved-card__title { @include type-card; }
.saved-card__day { margin-left: 6px; font-weight: 400; color: $mute; }
.saved-card__lead { margin-top: 6px; @include type-summary; }
.saved-card__foot { display: flex; align-items: baseline; margin-top: 8px; }
.saved-card__src { flex: 1; min-width: 0; @include type-meta; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.saved-card__echo { flex: none; margin-left: 12px; }
.saved-card__on { flex: none; margin-left: 12px; @include type-meta; }
.saved-note { margin: $section $page 0; }
.saved-note__text { display: block; @include type(13px, 21px, 400, $mute); }
.saved-note__em { color: $ink; font-weight: 600; }
```

收藏页的状态：有收藏；全部为空（PageState“暂无收藏 / 在条目页或日报头条卡片上选择‘收藏’……”）；所选板块为空（“暂无收藏 / 该板块暂无收藏”）；收藏读不出来（PageState“无法读取收藏 / 本机存储暂不可用……”+ 重试，栏头读数“—”）；某板块占位时它的筛选项和卡片先不列（逻辑不变）；不可用的筛选回退到“全部”。

### 8.2 锐奇页：`pages/reechi`

照原型：页首一张钴蓝单色通栏版图（射线激光一体机，390×258，没有页边，图注“射线激光一体机”“图：锐奇官网产品图”从 x=20 起）；下面一行 48px 大 logo 和“锐奇”（28/36 600），一句话介绍（16/28），墨底“联系我们”（点了滚到联系我们）。内容栏目用钴蓝栏头：“产品与应用”（四个产品连着排，每个是 17/600 名称、13 次要色用途、15/24 说明；产线图放在四个产品后面，350×246，图注“在线测量应用”“图：锐奇官网配图”）、“关于锐奇”（三段 16/28，段间 14）、“联系我们”。功能栏目用纸底墨字栏头：“文档”（三个入口，52 高，墨字 16，右边墨色箭头）、“反馈与侵权投诉”（引言、三个联系方式、处理说明）、“声明”（固定文案 C 和 B，14/24）。联系方式一行：13 次要色标签、16 墨色值（可长按选择）、有接听时间时下面 13 次要色一行；右边描边小按钮“拨打/复制”；整行可点，按下通栏 `$press`；值是占位（带方括号）时值次要色、按钮 `$off-line` 边 `$off` 字、不能点。不用任何线框图标，不画分隔线，不要深墨头图、标语、英文眉题和水印 logo。

**`index.tsx`（整份替换；`ContactRow` 的点击逻辑和 HEAD 一样）**：

```tsx
// 锐奇 tab：一页打包进小程序的静态内容，文案在 src/content/，不请求任何接口，打开时不弹授权。
// 页首一张钴蓝单色的通栏版图（一体机），下面 logo、“锐奇”和一句话介绍；内容栏目“产品与应用”“关于锐奇”“联系我们”用钴蓝栏头，
// 功能栏目“文档”“反馈与侵权投诉”“声明”用纸底墨字的栏头。产线图放在四个产品后面，不插在产品之间（免得读者以为图里就是相邻那台设备）。
// 只有点了联系方式才复制（剪切板）或拨号，值还是占位时按钮禁用。
import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import chevron from "../../assets/reechi/chevron.png";
import logo from "../../assets/reechi/logo.png";
import plateGauge from "../../assets/reechi/plate-gauge.jpg";
import figLine from "../../assets/reechi/fig-line.jpg";
import { HeadTab } from "../../components/head-tab";
import { Figure } from "../../components/figure";
import type { DocName } from "../../content/docs";
import { FIXED_B_ACCESS_LOG, FIXED_C_STATEMENT } from "../../content/fixed-copy";
import { FEEDBACK_CONTACTS, FEEDBACK_HANDLING, FEEDBACK_INTRO, REECHI_ABOUT, REECHI_CONTACTS, REECHI_LEAD, REECHI_NAME, REECHI_PRODUCTS, type ContactLine } from "../../content/reechi-tab";
import { useActiveTab } from "../../lib/use-active-tab";
import { useTabShare } from "../../lib/use-share";
import "./index.scss";

const DOC_ENTRIES: { name: DocName; label: string }[] = [
  { name: "about", label: "关于锐奇微报" },
  { name: "agreement", label: "用户协议" },
  { name: "privacy", label: "隐私说明" },
];

function isPlaceholder(value: string): boolean {
  return /\[[^\]]*\]/.test(value);
}

/** 产品说明“锂电涂布：全幅宽……”拆成用途和说明两行；没有“：”时整段是说明。只拆显示，不改文案。 */
function splitUse(text: string): { use: string; text: string } {
  const i = text.indexOf("：");
  return i > 0 ? { use: text.slice(0, i), text: text.slice(i + 1) } : { use: "", text };
}

export default function ReechiPage() {
  useTabShare();
  useActiveTab();
  return (
    <View className="reechi">
      <Figure kind="plate" src={plateGauge} name="射线激光一体机" source="锐奇官网产品图" />
      <View className="org">
        <View className="org__top">
          <Image className="org__logo" src={logo} />
          <Text className="org__name">{REECHI_NAME}</Text>
        </View>
        <Text className="org__lead">{REECHI_LEAD}</Text>
        <View className="org__contact" ariaRole="button" hoverClass="org__contact--down" onClick={() => void Taro.pageScrollTo({ selector: "#reechi-contacts", duration: 250 })}>
          联系我们
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="产品与应用" />
        <View className="reechi-block__body">
          {REECHI_PRODUCTS.map((item, i) => {
            const product = splitUse(item.text);
            return (
              <View key={i} className="product">
                <Text className="product__name">{item.name}</Text>
                {product.use && <Text className="product__use">{product.use}</Text>}
                <Text className="product__text">{product.text}</Text>
              </View>
            );
          })}
          <View className="reechi-figure">
            <Figure kind="line" src={figLine} name="在线测量应用" source="锐奇官网配图" />
          </View>
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="关于锐奇" />
        <View className="reechi-block__body">
          {REECHI_ABOUT.map((text, i) => (
            <Text key={i} className="reechi-para">{text}</Text>
          ))}
        </View>
      </View>

      <View id="reechi-contacts" className="reechi-block">
        <HeadTab label="联系我们" />
        <View className="reechi-rows">
          {REECHI_CONTACTS.map((line) => <ContactRow key={line.label} line={line} />)}
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="文档" plain />
        <View className="reechi-rows">
          {DOC_ENTRIES.map((entry) => (
            <View key={entry.name} className="reechi-doc" hoverClass="reechi-doc--down" ariaRole="link" onClick={() => void Taro.navigateTo({ url: `/pages/doc/index?name=${entry.name}` })}>
              <Text className="reechi-doc__label">{entry.label}</Text>
              <Image className="reechi-doc__chev" src={chevron} />
            </View>
          ))}
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="反馈与侵权投诉" plain />
        <View className="reechi-block__body">
          <Text className="reechi-para">{FEEDBACK_INTRO}</Text>
        </View>
        <View className="reechi-rows">
          {FEEDBACK_CONTACTS.map((line) => <ContactRow key={line.label} line={line} />)}
        </View>
        <View className="reechi-block__body">
          <Text className="reechi-para">{FEEDBACK_HANDLING}</Text>
        </View>
      </View>

      <View className="reechi-block">
        <HeadTab label="声明" plain />
        <View className="reechi-block__body">
          <Text className="reechi-legal">{FIXED_C_STATEMENT}</Text>
          <Text className="reechi-legal">{FIXED_B_ACCESS_LOG}</Text>
        </View>
      </View>
    </View>
  );
}

/** 联系方式的一行：整行可点（≥ 64），电话拨号，其余复制；值是占位时禁用。值可以长按选中。 */
function ContactRow({ line }: { line: ContactLine }) {
  const off = isPlaceholder(line.value);
  const verb = line.action === "call" ? "拨打" : "复制";
  const onTap = () => {
    if (off) return;
    if (line.action === "call") {
      // 读者在系统弹窗里取消也走 fail，不用提示。
      Taro.makePhoneCall({ phoneNumber: line.value.replace(/[\s-]/g, "") }).catch(() => undefined);
    } else {
      // 成功时微信自带“内容已复制”提示；读者拒绝剪切板授权或写入失败时，告诉他可以长按文字自己复制。
      Taro.setClipboardData({ data: line.value }).catch(() =>
        Taro.showModal({ title: "复制失败", content: "请长按页面文字并选择复制", showCancel: false }),
      );
    }
  };
  return (
    <View
      className={off ? "contact contact--off" : "contact"}
      hoverClass={off ? "none" : "contact--down"}
      ariaRole="button"
      ariaLabel={off ? `${line.label}，待提供` : `${verb}${line.label}`}
      onClick={onTap}
    >
      <View className="contact__main">
        <Text className="contact__label">{line.label}</Text>
        <Text className="contact__value" userSelect>
          {line.value}
        </Text>
        {line.note && <Text className="contact__note">{line.note}</Text>}
      </View>
      <View className="contact__verb">{verb}</View>
    </View>
  );
}
```

**`index.scss`（整份替换）**：

```scss
@use "../../styles/tokens" as *;

.reechi { padding-bottom: 8px; }
// 页首版图下面：logo 和“锐奇”一行，介绍，墨底“联系我们”。
.org { padding: 22px $page 0; }
.org__top { display: flex; align-items: center; }
.org__logo { flex: none; display: block; width: 48px; height: 48px; margin-right: 12px; }
.org__name { @include type(28px, 36px, 600); }
.org__lead { display: block; margin-top: 16px; @include type-body; }
.org__contact { @include btn-ink; display: inline-flex; margin-top: 18px; }
.org__contact--down { background-color: $ink-press; }

// 栏目：钴蓝栏头或纸底功能栏头，正文在页边内，可点的行通栏。
.reechi-block { margin-top: $section; }
.reechi-block__body { padding: 14px $page 0; }
.reechi-rows { padding-top: 6px; }
.product { padding: 12px 0 14px; }
.product__name { display: block; @include type-card; }
.product__use { display: block; margin-top: 2PX; @include type-meta; }
.product__text { display: block; margin-top: 4PX; @include type-summary; }
.reechi-figure { margin-top: 10px; }
.reechi-para { display: block; @include type-body; }
.reechi-para + .reechi-para { margin-top: 14px; }
.reechi-legal { display: block; @include type-legal; }
.reechi-legal + .reechi-legal { margin-top: 12px; }

// 联系方式：整行可点，按下通栏变 $press；右边是描边小按钮的样子（点哪儿都一样）。值是占位时禁用。
.contact { display: flex; align-items: center; min-height: 64px; padding: 10px $page; }
.contact--down { background-color: $press; }
.contact__main { flex: 1; min-width: 0; margin-right: 16px; }
.contact__label { display: block; @include type-meta; }
.contact__value { display: block; margin-top: 2PX; @include type(16px, 24px, 400); overflow-wrap: break-word; }
.contact__note { display: block; margin-top: 2PX; @include type-meta; }
.contact__verb { @include btn-line; @include btn-sm; flex: none; }
.contact--off .contact__value { color: $mute; }
.contact--off .contact__verb { @include btn-off; }

// 文档入口：52 高，整行可点。
.reechi-doc { display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 $page; }
.reechi-doc--down { background-color: $press; }
.reechi-doc__label { @include type(16px, 22px, 400); }
.reechi-doc__chev { flex: none; display: block; width: 18px; height: 18px; }
```

锐奇页的状态：联系方式可点 / 占位禁用；复制成功（微信自带提示）/ 复制失败（原生弹窗“复制失败 / 请长按页面文字并选择复制”，不改）；拨号取消不提示；“联系我们”滚到联系我们栏。

### 8.3 文档页：`pages/doc`（原型没画，按规则推）

tsx 不改（`PageState` 的“没有这篇文档 / 返回‘锐奇’页重新打开”照旧）。新闻纸长文：标题 23/33 600，版本行 13 次要色；事实表和固定文案 A 这类引用块是通栏的下沉纸块（`$press`，左右伸出页边），不画线；小标题 17/26 600 不编号；段落 16/28 正文色；列表 15/26，标记“•”次要色。文字一字不改。`index.scss` 整份替换：

```scss
@use "../../styles/tokens" as *;

// 长文：法规和合规原文一字不改，只调阅读层级。新闻纸底，不画线；事实表和要突出的整段（固定文案 A）用通栏的下沉纸块。
.doc { padding: 22px $page 8px; }
.doc__title { display: block; @include type-article; }
.doc__version { display: block; margin-top: 8px; @include type-meta; }
.doc__facts { margin: 20px (-$page) 0; padding: 12px $page; background-color: $press; }
.doc__fact { display: flex; padding: 4PX 0; }
.doc__fact-key { flex: none; width: 92px; padding-right: 8px; @include type-meta; }
.doc__fact-value { flex: 1; min-width: 0; @include type(13px, 20px, 400); overflow-wrap: break-word; }
.doc__h { display: block; margin-top: 30px; @include type(17px, 26px, 600); }
.doc__p { display: block; margin-top: 10px; @include type-body; }
.doc__quote { margin: 12px (-$page) 0; padding: 12px $page; background-color: $press; @include type(15px, 26px, 400); overflow-wrap: break-word; }
.doc__list { margin-top: 8px; }
.doc__item { display: flex; margin-top: 4PX; }
.doc__marker { flex: none; width: 20px; @include type(15px, 26px, 400, $mute); }
.doc__item-text { flex: 1; min-width: 0; @include type(15px, 26px, 400, $body); overflow-wrap: break-word; }
.doc__term { font-weight: 600; color: $ink; }
```

---

## 9. 原型没画的页面和状态：推导结果

推导只用原型定下的规则：新闻纸底；墨印正文；钴蓝只在刊头和栏头色块、读数、配图、“今日焦点”；靠色块和留白分区，页面里不画线；按钮只有墨底实心和墨线描边；色块从屏幕左缘出血。原型漏画的内容一律以源码为准。

| 页面或状态 | 推导结果 | 规格 |
|---|---|---|
| 运动健康 tab | 不出竖排刊头；钴蓝栏头“运动健康”（元信息板块名）+ 右边“11月7日 周六”“第 45 周”；钴蓝单色栏目配图 350×176，图注“栏目配图 / 图：Unsplash”；筛选条；按天分段（今天只写“今天”，昨天旁“11月6日 周五”）；卡片不显示时刻、内容占满页宽；热线小框 | 5.1、5.4 |
| 收藏页 | 钴蓝栏头“我的收藏”+“N 条”；本机说明和“按收藏时间排序”一行；板块筛选同分类筛选；卡片留空不画线，“AI 摘要”在右上角；底部说明 | 8.1 |
| 事件页 | 读数行（来源数、首报、最新）+ 23px 标题（AI 跟在标题后）；“事件综述”“谁在报，怎么说”钴蓝栏头；报道列成一列，首报/最新写在来源名后面，不画时间轴 | 7.2 |
| 文档页 | 23px 标题、版本行；事实表和引用块是通栏下沉纸块；小标题不编号，不画线 | 8.3 |
| 某期日报页 | 和日报 tab 同一个组件，同样子；没有提醒按钮 | 6 |
| 加载中 | 左对齐“加载中…”13 次要色：精选在刊头和筛选条下（制造对齐 x=20，列表底部的续页对齐 x=88）、日报在头部下、条目页和事件页在页面顶上 | 5.6、6.3、7 |
| 加载失败 | 左对齐 PageState：17/600 标题、14 正文色原因、墨底“重试” | 4.11 |
| 空 | 同 PageState、没有按钮；精选分类空态加墨底“查看全部”；收藏全部空和板块空分开说 | 4.11、8.1 |
| 占位 | 精选：色块 + logo（不写日期周次）+ 占位文案；运动健康：只有栏头 + 文案，不画配图；日报、条目、事件：只有 PageState | 5.6 |
| 配置有误 | 精选、运动健康：刊头或栏头（有日期周次，没有焦点和配图）+ PageState；日报：只有 PageState | 5.3、6.3 |
| 已下线或不存在 | PageState + 墨底回 tab；收藏过的条目：墨底“从收藏移除”+ 描边回 tab，移除后只剩墨底回 tab | 4.11 |
| 网络不好提示条 | 通栏 `$press` 下沉纸块，13 正文色说明 + 13/600 墨色“重试”，整条可点，按下 `$press-deep`；位置照 HEAD（精选在筛选条下、日报在头条按钮下、事件页在综述下） | 4.11 |
| 快照时间 | 精选：刊头日期行下“08:05 的内容”；运动健康：栏头下一行；日报：翻页条下居中；都是 13 次要色（状态说明，不是读数，不印钴蓝） | 5.1、6.2 |
| 已读 | 精选卡标题从墨色变正文色 `$body`（D25“正文灰”），其余不变 | 5.4 |
| 续页失败重试 | 列表底部“加载失败，点击重试”13/600 墨色，整行 44 高可点，按下 `$press` | 5.4 |
| 没有更早的 | 列表底部“没有更早的了”13 次要色 | 5.4 |
| 当前时段 | 不做标记（HEAD 也没有样式；钴蓝不能多用一处） | 5.4 |
| 禁用翻页 | 日报“前一天/后一天”那一边字 `$off`、箭头 0.5、不能点、没有按下态 | 6.2 |
| 收藏 / 已收藏 | 描边按钮，空心 / 实心墨书签；条目页“收藏/已收藏”，日报一直“收藏” | 4.9 |
| 提醒中 / 已订阅 | 正在订阅整颗 0.6；已订阅 `$off-line` 边、`$off` 字、铃铛 0.5；都不能点 | 4.12 |
| 译文不完整 | 正文栏头下通栏 `$press` 提示 | 7.1 |
| 复制失败弹层 | 55% 墨色遮罩，新闻纸卡片（直角），链接在 `$press` 框里可长按，墨底“关闭” | 7.1 |
| 没有这篇文档 | PageState“没有这篇文档 / 返回‘锐奇’页重新打开” | 8.3 |
| 收藏读不出来 | PageState + 重试，栏头读数“—” | 8.1 |
| 心理援助热线（卡片） | 卡片底部 1PX 次要色细框，标签 13 正文色、号码 13 墨色 DIN | 4.13 |
| 心理援助热线（条目页） | “为什么值得看”下面一条 1PX 墨框长条，标签 13 次要色、号码 17 墨色 DIN、右边墨色“拨打”，整块可点拨号，高 ≥ 64 | 4.13 |

---

## 10. 派生值的推导规则

页面上能显示的派生值只有下面这些，全部由真实字段推出来（函数在 `components/reading/derive.ts`，测试在 `tests/reading-derive.test.ts`）。期号、卷号、页码、统计读数（今日入选、更新时刻等）、客户案例一律不加。

| 显示 | 推法 | 用在 |
|---|---|---|
| 日期“11月7日 周六” | `dayWeek(meta.readings.date)`；元信息没到或日期不对时用 `beijingDate(Date.now())` | 精选刊头、运动健康栏头 |
| 周次“第 45 周” | `isoWeek(同一个日期)`：ISO 8601，周一起算，含当年第一个周四的那一周是第 1 周；只显示周序号、不显示周年（元旦前后 ISO 周年和日历年不一致时也不会写出矛盾） | 同上 |
| 段头日期“11月6日 周五”/“周四” | `sectionDate(section.key, section.title, now)`：段的 key 是卡片 `anchorAt` 的北京日期，“昨天”就是“现在”的北京日期减一天；不读日报的日期 | 精选流、运动健康 |
| 卡片时刻“18:27” | `clockOf(card.anchorAt)`，北京时间 | 精选卡索引栏 |
| 焦点“最新 01:53”/“最新 昨天 17:28” | `stampParts(focus.latestAt, now)` | 焦点读数 |
| 来源数“3 家来源” | 焦点：`focusFoot(focus).echo.count`（`sourceNames` 个数，≥ 2 才有）；卡片、收藏卡：`sourceCount`（≥ 2 才有，`sourceCountChip` 判断）；条目页来源栏：`item.sourceCount`（只在没归进事件且 ≥ 2）；条目页同一事件、事件页：`sourceTotal(story.sourceCount)` | 各处 |
| 日报日数“06” | `daily.date` 的后两位（日期合法时） | 日报头部 |
| 时间窗“11月5日 08:00 至 11月6日 08:00” | `windowText(daily.window)` | 日报头部 |
| 分节数、条数 | `dailyView` 的 `sectionCount`、`itemCount`（含快讯）；每节 `section.count` | 日报 |
| 出刊“08:00” | `DAILY_COPY.issueTime`（固定的出刊时刻，和 HEAD 一样） | 日报读数 |
| 首报、最新“11-06 08:00” | `storyView` 的 `first`、`latest` | 事件页 |
| 收藏条数 | 当前可见的收藏数（`shown.length`）；读不出来时“—” | 收藏页 |
| 快照时间“08:05 的内容” | `snapshotStamp(generatedAt, now)`（lib，不改） | 精选、运动健康、日报 |

---

## 11. 界面文字改动清单（逐条）

已核对：`tests/` 里没有测试读组件或页面里的文字（`share.test.ts` 读页面配置的开关和接的 hook，`compliance-copy.test.ts` 读 `src/content/` 和合规草稿）。下面每一条只改组件或页面的 tsx。

| # | 文件 | 原文 | 改成 |
|---|---|---|---|
| 1 | components/dashboard（制造） | logo 旁横排“锐奇微报” | 去掉；刊名竖排在钴蓝色块里（同一个 `appName`） |
| 2 | components/dashboard（制造） | “每日精选” | 去掉 |
| 3 | components/dashboard（制造） | “11月6日 / 周五” | “11月7日 周六”（不用斜杠），右端新增“第 45 周” |
| 4 | components/dashboard（运动健康） | logo 旁“锐奇微报”、38px 板块名 | 去掉；板块名进钴蓝栏头（同一个 `board.name`），栏头右边新增“11月7日 周六 第 45 周” |
| 5 | components/dashboard（运动健康） | 图上叠层“栏目配图 · Unsplash” | 图下两段：“栏目配图”“图：Unsplash” |
| 6 | components/board-feed | “行业精选”“生活精选”两个标题 | 去掉 |
| 7 | components/focus-card | “读摘要 ↗” | “读摘要”（去掉箭头） |
| 8 | components/focus-card | 大号数字 +“家来源” | 读数“N 家来源”（规则不变，≥ 2 才有） |
| 9 | components/focus-card | 来源行末尾“ · 17:28 11-06 最新” | 去掉；新增读数“最新 01:53”（不是今天时“最新 昨天 17:28”“最新 11-05 09:00”） |
| 10 | components/feed-list | 今天段头的范围“0–6 时”“6–12 时”“12–18 时”“18 时以后”和段头的“N 条” | 去掉 |
| 11 | components/feed-list | “昨天”旁“11月6日”；运动健康“今天”旁“11月6日” | “昨天”旁“11月6日 周五”；“今天”旁不写；更早的段旁新增星期“周四” |
| 12 | components/feed-list | 卡片时刻“昨天 18:27”“10-15 17:28” | “18:27”“17:28”（日期在段头） |
| 13 | components/daily-issue | “REECHI DAILY” | 去掉 |
| 14 | components/daily-issue | 翻页日期“11月6日 · 周五” | “11月6日 周五” |
| 15 | components/daily-issue | 翻页按钮只有图标（字在 ariaLabel） | 显示“前一天”“后一天” |
| 16 | components/daily-issue | — | 新增时间窗“11月5日 08:00 至 11月6日 08:00” |
| 17 | pages/item | 署名“来源名 · 11-06 发布” | 两段“来源名”“11-06 发布”，去掉“ · ” |
| 18 | pages/item | 来源卡“11-06 发布 · 2 家来源” | 栏头“来源”（新增），“11-06 发布”后面跟读数“2 家来源”，去掉“ · ” |
| 19 | pages/item | “复制来源链接”前的图标 | 去掉图标，字不变 |
| 20 | pages/item | 事件入口“同一事件，3 家来源”+“A、B等的相关报道，查看事件进展” | 拆成栏头“同一事件”和读数“3 家来源”；“A、B等的相关报道，查看事件进展”不变；读屏照旧读“同一事件，3 家来源”。不显示事件标题（第 15 节第 2 条） |
| 21 | pages/item | 块标题“为什么值得看”“正文”/“译文” | 变成钴蓝栏头，字不变 |
| 22 | pages/story | “3 家来源”前的圆点 | 去掉圆点，字不变 |
| 23 | pages/saved | “收藏内容\n随时查阅” | 去掉 |
| 24 | pages/saved | “我的收藏 · N 条内容” | 栏头“我的收藏”+ 读数“N 条” |
| 25 | pages/saved | 手机、书签、圆圈 i 图标 | 去掉，字不变 |
| 26 | pages/reechi | “锐奇 / REECHI”“精密测量，\n看见更细微。”“MEASUREMENT SYSTEMS”“ABOUT” | 去掉；logo 旁新增“锐奇”（`REECHI_NAME`） |
| 27 | pages/reechi | 图上叠层“射线激光一体机 · 锐奇官网产品图”“在线测量应用 · 锐奇官网配图”和“来源：锐奇官网” | 图下两段“射线激光一体机”“图：锐奇官网产品图”、“在线测量应用”“图：锐奇官网配图”；“来源：锐奇官网”去掉（图注已经写了来源） |
| 28 | pages/reechi | 产品说明一段“锂电涂布：全幅宽……” | 按第一个“：”拆成用途“锂电涂布”和说明两行（文案不改，只拆显示） |
| 29 | pages/reechi | — | 新增功能栏头“文档” |
| 30 | pages/reechi | 联系方式“值（接听时间）” | 值一行、接听时间另起一行（去掉括号，内容不变） |

不改的：`DAILY_COPY`、`SAVED_COPY`、`REMINDER_COPY`、`SOURCE_NOTE`、占位文案、`failureText`、`src/content/` 全部、tab 名、导航标题、所有按钮文字（收藏、已收藏、分享给同事、分享日报、复制来源链接、读摘要、联系我们、拨打、复制、重试、查看全部、查看最新一期、从收藏移除、回到精选/日报/运动健康、关闭）、“AI 摘要”、“按发布时间”、“有后续进展时，这一页会接着往下长”、“今日焦点”、“今日头条”、“事件综述”、“谁在报，怎么说”、“首报”、“最新”、“快讯”。不新增英文字。

---

## 12. 状态核对表

| 状态 | 出现在 | 样子 |
|---|---|---|
| 加载中 | 精选、运动健康、日报、条目、事件 | 左对齐“加载中…”13 次要色 |
| 加载失败 | 同上 | PageState：标题、原因、墨底“重试” |
| 空 | 精选（全部 / 分类）、日报零条、收藏（全部 / 板块） | PageState；分类空态加墨底“查看全部” |
| 占位 | 精选（色块 + logo）、运动健康（栏头）、日报、条目、事件 | PageState：行业包文案或内置文案 |
| 配置有误 | 精选、运动健康、日报 | PageState“配置有误 / 说明”（精选和运动健康上面有刊头或栏头） |
| 已下线或不存在 | 条目、事件、某期日报（“该日期暂无日报”） | PageState + 墨底回 tab；收藏过的条目多一个墨底“从收藏移除”，回 tab 变描边 |
| 网络不好提示条 | 精选、运动健康、日报、事件 | 通栏 `$press` 块，可点重试，按下 `$press-deep` |
| 快照时间 | 精选、运动健康、日报 | 13 次要色“08:05 的内容” |
| 已读 | 精选卡、运动健康卡 | 标题 `$body` |
| 续页失败重试 | 列表底部 | 13/600 墨色，44 高可点 |
| 没有更早的 | 列表底部 | 13 次要色 |
| 当前时段 | 精选 | 不做标记 |
| 选中 | tab、分类筛选、收藏板块筛选 | 墨色 600；tab 图标填墨；筛选项下 2PX 墨线 |
| 禁用 | 日报翻页、占位联系方式、已订阅 | `$off` 字，`$off-line` 边，箭头 0.5 |
| 按下 | 所有可点元素 | 纸面 `$press`（整行通栏），墨底 `$ink-press`，`$press` 块上 `$press-deep` |
| 收藏 / 已收藏 | 条目、日报 | 描边；空心 / 实心墨书签；条目页“已收藏” |
| 提醒中 / 已订阅 | 日报 tab（配了模板 id） | 整颗 0.6 / 禁用色边和字、铃铛 0.5 |
| 译文不完整 | 条目页正文 | 通栏 `$press` 提示 |
| 复制失败 | 条目页 | 遮罩 + 新闻纸卡片 + `$press` 链接框 + 墨底“关闭” |
| 没有这篇文档 | 文档页 | PageState |
| 收藏读不出来 | 收藏页 | PageState + 重试，读数“—” |
| 热线 | 运动健康卡、条目页 | 卡片：1PX 次要色细框；条目页：1PX 墨框长条、“拨打” |
| 下拉刷新 | 精选、运动健康、日报、事件 | 原生：新闻纸底、深色加载点 |

---

## 13. 不要做的事

- 不编期号、卷号、页码、统计读数、客户案例；不恢复板块介绍（`board.description`）、三个统计读数、扫描条、列表底部健康说明（`notice.footer`）。
- 钴蓝不做按钮、链接、选中态、错误提示、分类方块、正文、电话号码、快照时间；除 `.mast__band` 外 scss 里不直接写 `$cobalt`。蓝色块只有精选刊头一块大的和各页的栏头小块；功能栏头（文档、反馈与侵权投诉、声明）不用色块。
- 不画分隔线（`border-top/bottom/left/right` 只在 tabBar 和条目页操作条）；不加圆角、阴影、渐变、毛玻璃、卡片底、深色块；不保留悬浮胶囊 tabBar 和悬浮操作条。
- 不做套色错位、网点纹理、纸张颗粒、报纸细线、编号、全大写英文小标题、用中点串的元信息。
- 不用 `writing-mode`（竖排刊名用一个字一个 Text）；不用 flex `gap`；不用标签选择器、`*`、`:has()`、容器查询、`backdrop-filter`；不在 Text 上写伪元素；不用 CSS `filter`（配图的钴蓝已经印在 JPEG 里，墨底按钮上不放图标）。
- 边框、线、≤ 4px 的尺寸不写小写 `px`。
- 不在 `custom-tab-bar` 里依赖 app.scss 的全局类、page 变量或字体。
- 不改 `src/lib/`、`src/content/`、`config/`、现有 `tests/`、页面配置的分享和下拉刷新开关、分类色值、logo、tab 顺序和名字、rich-text 正文的行内样式（`lib/item.ts`）。
- 不删、不改任何一处“AI 摘要”；不把“AI 摘要”挪离卡片右上角（用户协议写的是“卡片右上角标”）。
- 不把锐奇设备图、运动配图配到新闻条目上；不加网络图片、base64 大图、`loadFontFace` 或网络字体。
- 不新增英文字；拉丁字只剩数字、“AI 摘要”的 AI 和 logo。
- 不给“当前时段”加钴蓝或别的标记。

---

## 14. 风险和兼容性

1. **DIN 只在 iOS 有**：安卓回落到 Roboto / Roboto Condensed。22px 的“18:27”在 Roboto Condensed 下约 49 宽，放得进 52 的索引栏；个别机型没有窄体时会挤进栏距 4–5px，不影响内容栏。日数“06”是 `min-width`，变宽只会把刊名往右推。iOS 上 DIN Condensed 字面偏低，64px 日数（行高 50）要真机核对基线，要调只调行高。
2. **竖排刊头**：一个字一个 Text，WebView 和以后的 Skyline 都一样。刊名改长（`appName` 不是 4 个字）时色块跟着变高，`min-height` 只管下限。
3. **没有焦点时刊头右栏空着**：筛了分类（接口不给焦点）、加载中、失败、空、配置有误时，右栏只有日期行，色块旁约 150px 新闻纸。照原型 notes 的做法；要不要换处理见第 15 节第 1 条。同一件事还有另一面：点分类以后接口不给焦点（`lib/feed.ts` 第 177 行），色块退回 208 高，焦点摘要块（约 200 高）也没了，整页上移，刚点的筛选条会跳出手指下方；点回“全部”时又跳回来。HEAD 也有类似的跳动，但这次色块旁多了空白，会更明显。16.2 要量一下跳了多少，截图和第 15 节第 1 条一起给使用者看。
4. **焦点标题长度**：截 4 行；3 行时标题末行正好落在色块底边，1 行时日期和“今日焦点”之间空一块，4 行时色块变高约 30。
5. **新闻纸偏冷灰**：`#e9e9e3` 在部分安卓屏上发灰发暗，`darkmode: false` 时深色模式也不变。这是方向本身的取舍。
6. **半导体分类色 `#3b7bf6` 和钴蓝同属蓝色系**：只出现在 8×8 方块上、带墨边，面积很小；截图时看一下精选卡和筛选条上“半导体”方块会不会被读成钴蓝。
7. **`text-wrap: pretty`**：iOS 26 的 WKWebView 和较新的 XWeb 支持，老 WebView 忽略，回到普通断行；它只防单字孤行。
8. **原生分享按钮**：`<Button>` 自带灰底、5px 圆角、18 号字、`::after` 细边框；样子全靠调用方两个类的选择器盖掉，按下态三个类。实施后在模拟器确认“分享给同事”“分享日报”是直角、墨底、纸色字、没有图标，按下变 `$ink-press`。app.json 没开 `style: "v2"`，原生 button 的默认样式都是标签选择器，单个类就压得过；两个类是为了压过 share-button 自己的重置。
9. **公共 chunk 的 CSS 顺序**：新加的 `head-tab`、`reading`、`figure` 被多个页面引用，按 0.2 第 13 条的先后 import；构建日志里不能有 mini-css-extract 的 “Conflicting order”。
10. **并行实施期间编译不过**：tokens 删了旧变量名、foundation 搬走了 `editorial/` 和几张图标，没改完的组会报错；各组只改自己的文件，全部合并后再构建。
11. **rich-text 正文的颜色**：引用块 `#5d6872`、表格边 `#dfe2e5`、表头底 `#f2f3f5` 写死在 `lib/item.ts`，放在新闻纸上略有色差（表头底比纸亮），对比度够，lib 不能改，接受。
12. **导航栏和页面同色**：滚动时内容从同色导航栏下面穿过，没有分界线；精选页靠刊头色块从导航栏下沿印进来。照原型 notes 的取舍。
13. **底部留白**：`--tab-clearance` 从 94 降到 76。要在没有安全区的机型（iPhone SE）和有 Home 指示条的机型上各看一次：最后一张卡、日报页尾、锐奇声明、条目页最后一块既不被遮住，也不留大片空白。
14. **360dp 安卓**：rpx 按屏宽缩放，12px 的“AI 摘要”和 tab 名在 360dp 上约 11.1px；1PX 的线不缩放。真机看一次可读性。
15. **图片定高**：配图按显示比例出、定高 `aspectFill`，图没解码前是 `$press` 色块，不跳版面；以后换图要按同样的比例出（4.4）。
16. **包体**：彩色图 248KB 换成钴蓝图 128KB，再删掉十来张小图标。基线以 HEAD 重新构建的大小为准，不要用仓库里旧 dist 的大小（16.1）。评审实测 `dist` 少 140KB，`dist-no-sports` 只少 44KB：备用包本来就不带运动配图，运动健康配图只由运动健康页引入。
17. **CSS 里 calc 带 px**：Css Minimizer 的 postcss-calc 不认 rpx，报警告，不影响输出。
18. **Skyline**：现在按 WebView 写（`-webkit-box` 截行、`text-wrap`、伪元素）。以后切 Skyline 要整体复查，竖排刊名已经避开了 `writing-mode`。

---

## 15. 要使用者拍板的事

1. **没有焦点时刊头右栏空着**（第 14 节第 3 条）：筛了分类、加载中、失败、空态时色块旁空约 150px。规格照原型 notes 做；如果嫌空，可选的改法是没有焦点时把“加载中/失败/空态”的状态块放进右栏，或者有筛选时把整块刊头收起来。
2. **条目页“同一事件”要不要显示事件标题**：原型画了事件标题。事件标题是模型写的，用户协议第 3 节列的标识位置里只有“事件页在事件标题旁标”，没有条目页。**默认（7.1 照此实施）**：不显示事件标题，栏头“同一事件”下面只有“3 家来源”读数和“A、B等的相关报道，查看事件进展”，`AiBadge` 维持 12 处。如果使用者和锐奇确认要显示，并约定协议定稿时补一句“条目页的事件入口在事件标题旁标”（`src/content/` 本次不改），article 组再改三处：读数上面加 `<View className="item-story__title"><Text>{item.story.title}</Text>{item.story.ai?.title === true && <View className="item-story__ai"><AiBadge /></View>}</View>`；scss 加 `.item-story__title { margin-bottom: 8px; @include type-card; }` 和 `.item-story__ai { display: inline-block; margin-left: 6px; vertical-align: 2PX; line-height: 0; }`；16.1 的期望改成 13 处（pages/item 4）。
3. **锐奇页删掉标语和英文眉题**：“精密测量，看见更细微。”、“锐奇 / REECHI”、“MEASUREMENT SYSTEMS”、“ABOUT”，原型没有，规格照原型删。标语是 10-29 版放上去的，锐奇方是否在意。
4. **收藏页去掉“收藏内容 / 随时查阅”大标题**，换成钴蓝栏头“我的收藏 N 条”（原型没画，按规则推的）。
5. 改完要拿模拟器截图给使用者和锐奇确认整体观感：导航栏从深墨变新闻纸、tabBar 从悬浮胶囊变贴底通栏、配图从彩色变钴蓝单色，和 10-29 确认过的样子差别很大。
6. **新增的截断**：HEAD 的焦点标题和焦点摘要都不截断。**默认**照原型各截 4 行，全文在条目页（5.2）。不要的话，删掉 5.2 scss 里两处 `@include clamp(4)`。收藏卡没有原型依据，照 HEAD 不截断（8.1）。
7. **彩色原图放到 `apps/miniprogram/brand/photos/`**：任务原话是“替换原来的彩色图并删掉不再引用的旧图”，规格改成挪出 `src/`，不删（0.1）。**默认**照规格挪：原图不进代码包，`npm run icons` 能重出配图，来源也有据可查。不同意的话，先照 4.5 跑一次 `npm run icons` 出好三张钴蓝图，再把三张原图 `git rm` 掉，脚本里配图那一段也删掉；以后要重出配图，得先从锐奇官网和 Unsplash 重新下载原图。

---

## 16. 验收清单

### 16.1 命令（在 `apps/miniprogram` 下，全部组合并以后跑）

```bash
npm run icons                                   # 本机要有 magick；跑完 git status 只应看到 4.5 列的图变化
npm run typecheck
npm test                                        # 现在 254 项，加 tests/reading-derive.test.ts 的 7 项，应 261 项全过
# 包体基线：foundation 动手前，在 HEAD（976ddf7）上跑一次下面两个构建，记下 du -sk dist dist-no-sports。
# 不要拿仓库里现成的旧 dist 当基线，那份比 HEAD 重新构建的大。
npm run build:weapp 2>&1 | tee /tmp/mp-build.log && npm run build:weapp:no-sports
grep -n "Conflicting order" /tmp/mp-build.log   # 应为空
du -sk dist dist-no-sports                      # 比基线：dist 至少小 100KB，dist-no-sports 小 40KB 左右；两个都 ≤ 1.5MB
find dist-no-sports -name 'cover*.jpg'          # 应为空（备用包不带运动健康配图）
find src/assets -name '*.jpg' -size +100k       # 应为空

# 写法规则（zsh 下 --include 的通配要加引号）
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(' src --include='*.scss' | grep -v 'src/styles/tokens.scss'      # 应为空
grep -rnE '\$(star|fog|rail|tab|accent|work|card|iron|signal)\b' src --include='*.scss'                 # 应为空
grep -rn '\$cobalt' src --include='*.scss' | grep -v 'src/styles/tokens.scss'                           # 只剩 app.scss 的 --cobalt 和 dashboard 的 .mast__band
grep -rnE '(^|[ ;{])(row-|column-)?gap:' src --include='*.scss'                                         # 应为空
grep -rnE '\b[1-4]px\b' src --include='*.scss'                                                          # 应为空（≤ 4px 写 PX）
grep -rnE 'border-(top|bottom|left|right)' src --include='*.scss'                                       # 只剩 custom-tab-bar 和 pages/item 的 .item-acts
grep -rnE '(^|[ ,}])(image|view|text|button)\s*[{,.:]' src --include='*.scss' | grep -v 'src/app.scss'  # 应为空
grep -rnE 'border-radius: ?[1-9]|box-shadow|backdrop-filter|writing-mode|:has\(|filter:' src --include='*.scss'  # 应为空
grep -rn 'opacity' src --include='*.scss'       # 只剩：日报翻页禁用箭头 .5、正在订阅 .6、已订阅铃铛 .5
grep -rnE 'editorial/|star(-ink)?\.png|copy\.png|item/share\.png|saved/(bookmark|device|info)\.png|reechi/(chat|doc|info|mail|phone|pin|shield|product)\.png' src scripts  # 应为空
grep -rn '<AiBadge' src | awk -F: '{print $1}' | sort | uniq -c
# 期望 12 处，和 HEAD 每个文件一样：daily-issue 3、feed-list 1、focus-card 1、pages/item 3、pages/saved 1、pages/story 3
# （第 15 节第 2 条如果拍板显示事件标题，pages/item 变 4，共 13 处）
grep -rn 'brightness' src                       # 应为空
```

### 16.2 截图核对（微信开发者工具，开发配置按 README 勾上“不校验合法域名”，真实数据；和 `/tmp/mp-shots/before/` 的 10 张、原型 `shot.png`、`shot-full.png` 对照）

| 页面 | 核对要点 |
|---|---|
| 全局 | 导航栏新闻纸底黑字、胶囊深色版；页面底色一种；tabBar 贴底、上沿一根浅线、五个图标是新图形（版面缩略、折角纸、心、书签、表盘），选中墨色实心加粗字，按下整格变深一点；最后一条内容不被 tabBar 遮住 |
| 精选 | 钴蓝色块从屏幕左缘和导航栏下沿印进来，竖排“锐奇微报”四个字纸色、靠顶，开读屏时刊名一次读完、不逐字读；第一段栏头离筛选条 16；logo 在右栏日期行最前面、不压在色块里；“第 45 周”数字钴蓝 DIN；“今日焦点”钴蓝；“AI 摘要”在分类那一行的右端；焦点标题末行落在色块底边附近；摘要 4 行；读数数字钴蓝；“读摘要”墨底；筛选条选中项墨色加 2PX 墨线、方块都有墨边（“检测”青色看得见）；段头钴蓝块、短段头右边和刊头色块右边对齐；“凌晨”旁不写日期，“昨天”旁“11月6日 周五”；卡片时刻钴蓝窄体在索引栏、内容从 x=88 起；卡片之间没有线；已读标题变浅；按下整条变色 |
| 精选状态 | 断网时筛选条下出现下沉纸色提示条；分类空态有墨底“查看全部”；加载失败、占位（只剩色块和 logo）、有筛选时刊头右栏只剩日期行；点一个分类、再点回“全部”，各截一张图，量出筛选条上下跳了多少（14.3），和第 15 节第 1 条一起给使用者看 |
| 运动健康 | 没有竖排刊头；钴蓝栏头“运动健康”、旁边日期和周次；配图钴蓝单色、直角，图注在图下两段；卡片没有时刻、占满页宽；“今天”旁不写日期；热线小框（行业包填号码后才有） |
| 日报 | “‹ 前一天 / 11月6日 周五 / 后一天 ›”，不能点的那边变灰；钴蓝 64px 日数基线和刊名对齐（核对真机）；时间窗一行；读数从 x=88 起、数字钴蓝；“今日头条”栏头和“AI 摘要”；收藏描边、分享日报墨底只写字、等宽一行；分节栏头带“AI 摘要”和钴蓝条数；条目按下整条变色；页尾“AI 摘要”和说明；往期、零条、404、加载中（读数“—”）各看一次 |
| 条目 | 分类行右端“AI 摘要”；23px 标题；署名两段；“为什么值得看”“来源”“同一事件”钴蓝栏头贴左缘；复制来源链接是描边小按钮；同一事件整块可点，只有“3 家来源”（单位正文色）和其他来源一行，不显示事件标题；贴底操作条新闻纸底、上沿细线、收藏描边带书签、分享墨底只写字（和原型一样）；站内全文和译文不完整提示（找一条有全文的）；复制失败弹层；已下线 + 从收藏移除 |
| 事件 | 读数行三个钴蓝数；标题后“AI 摘要”；“事件综述”“谁在报，怎么说”栏头；报道列表没有轴线圆点，首报/最新跟在来源名后面、日期靠右；不能点的报道标题浅色；没有综述时“谁在报”接在标题下 |
| 收藏 | 钴蓝栏头“我的收藏”和钴蓝条数；本机说明一行；板块筛选样子和分类筛选一致；卡片之间没有线、“AI 摘要”在右上角；日报卡折角纸图标；空态、读不出来（重试、“—”） |
| 锐奇 | 页首钴蓝单色通栏版图、图注两段；logo 和“锐奇”一行；墨底“联系我们”能滚到联系我们；三个钴蓝栏头、三个纸底墨字栏头（一行 22 高，不是 30）；产线图在四个产品后面；联系方式没有图标、描边小按钮；占位联系方式灰掉不能点；没有深墨头图、标语、英文眉题、水印 |
| 文档 | 23px 标题；事实表和固定文案 A 是通栏下沉纸块；小标题不编号；没有线；三篇各看一次；“没有这篇文档”（手动改参数） |
| 真机 | iOS 和安卓各看一次精选、日报、条目：DIN 的基线和宽度、1PX 细线、12px 小字、新闻纸的灰度 |

---

## 17. 评审意见处理

2026-11-07 独立评审的结论是“可以交给五组实施”，提了 10 条，都不是 high，都不阻塞开工。10 条都接受，没有不同意的。评审给了两种改法的，选哪一种和理由如下。

| # | 评审意见（级别） | 处理 |
|---|---|---|
| 1 | 条目页“同一事件”新显示了模型写的事件标题，协议没列这个位置；article 组并行开工会直接落地（medium） | 改了，选改法 (1)。7.1 默认不显示事件标题：栏头“同一事件”下面是“3 家来源”读数和 `view.story.line`，读屏照旧读 lib 给的“同一事件，N 家来源”。`AiBadge` 维持 12 处，16.1 期望改回 12。显示标题的写法留在第 15 节第 2 条，确认以后再加。没选改法 (2)，因为五组并行，等使用者和锐奇确认会卡住 article 组 |
| 2 | 按天看的板块打开 `focusCard` 时，FocusCard 会脱离 FocusHead，摘要没有“AI 摘要”（medium） | 改了。board-feed 加 `headed`，FocusHead、FocusCard、`focusId` 都用它；3.5 和 5.3 注明两者必须成对出现。没选“Dashboard 的 board 分支也渲染 focus”，因为运动健康没有竖排刊头，焦点放在栏头下面没有原型依据 |
| 3 | 焦点标题、焦点摘要截 4 行是新增的，不是“和现在一样”；收藏卡两处截断没有原型依据（low） | 改了。5.2 写明 HEAD 不截断，这次照原型截，列进 1.2 对照表和第 15 节第 6 条；8.1 删掉 `.saved-card__title--clamp` 和 `.saved-card__lead` 的截断，tsx 去掉这个类。4.15 顺带把 README 里“标题（两行）”“头条（两行）”“标题两行”这几处删掉，代码从来没截断过 |
| 4 | 规格自己的代码过不了自己的 grep：两处注释写了 hex，tokens 注释写了旧变量名；`.share-button::after` 和“伪元素只写在 View 上”冲突（low） | 改了。share-button 注释改成“浅灰底”，daily-issue 注释改成“叠在新闻纸上接近 $off”。tokens 末尾注释里的旧名去掉 `$`，旧变量 grep 不用加排除，tokens 也照样受检查。0.2 第 5 条补上 `.share-button::after` 这个例外 |
| 5 | 包体期望用了仓库里旧 dist 的大小；备用包只会少 44KB 左右（low） | 改了。16.1 改成先在 HEAD 构建记基线：dist 至少小 100KB，dist-no-sports 小 40KB 左右，两个都 ≤ 1.5MB。4.5、14.16 同步，删掉 996/812 |
| 6 | 分享按钮保留了图标，原型只写字，规格没说这是有意的（low） | 改了，选“跟原型”。原型画了这两个按钮，按“原型漏画的才以源码为准”，这里应以原型为准。share-button 不再渲染 `<Image>`，`iconClassName` 改成可选、不再使用（接口兼容，并行合并顺序随意）；daily、article 不再传它；`item/share.png` 不再生成，并删掉；`.item-btn__icon` 删掉，`.daily-btn__icon` 只给铃铛用。0.2、1.2、3、4.4、4.5、4.10、13、14.8、16.1、16.2 同步 |
| 7 | 第一段栏头比原型低 8；plain 栏头继承了 30 高；同一事件读数单位不是正文色（low） | 三处都改了：`.feed-period` 16，`.feed-period + .feed-period` 24；`.head-tab--plain` 加 `min-height: 0`，没改 tsx，HeadTab 的结构不动；同一事件的 `Reading` 加 `body` |
| 8 | drill-state 头注释还写着“白卡”；README 还有四处旧说法没进 4.15 的表；日期是占位（low） | 改了。drill-state 归 foundation，只改这句注释（0.1、4.11）。4.15 补上第 139、215、238–239、445 行，再加上第 171–173 行卡片时刻的说法（通读时发现的）；日期写合并当天的真实日期 |
| 9 | 点分类时整页跳动没写进风险；竖排刊名会被逐字读出（low） | 改了。14.3、5.6、16.2 加跳动的核对项，和第 15 节第 1 条一起给使用者看；5.1 色块加 `ariaRole="heading"`、`ariaLabel={title}`，每个字加 `ariaHidden`（Taro 的 StandardProps 有这三个属性） |
| 10 | 彩色原图挪到 `brand/photos/`，超出了任务给的文件范围（low） | 接受。0.1 注明这是有意偏离和理由，第 15 节第 7 条请编排方或使用者确认。确认之前照规格做，不同意就改成 `git rm`，随时可以改 |

改完以后的核对（2026-11-07）：
- 23 个 scss 块抽到 /tmp，逐个用 sass 编译，全部通过。第 16.1 节的写法 grep 结果都和期望一致：hex、旧变量名、gap、小写 ≤ 4px、标签选择器、禁用写法都是空的；`$cobalt` 只剩两处，边线只剩两处，`opacity` 只剩三处。
- 把改过的 tsx（share-button、dashboard、board-feed、daily-issue 的 Lead、条目页、收藏页）和全部 scss 放进评审那份整份副本的拷贝，删掉 `item/share.png`：`tsc` 零错误；`<AiBadge` 是 12 处，每个文件的个数和 HEAD 一样；Taro prod 构建成功，没有 “Conflicting order”，只有已知的 postcss-calc 警告，`dist` 832KB。
