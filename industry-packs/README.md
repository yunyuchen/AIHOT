# 行业包

每个子目录是一个行业包：一个行业站和“行业”有关的一切。行业包只在这里改，这里是唯一真相；`industry/` 是选择步骤从选中的行业包复制出来的，代码从那里读，不要手改。换一个行业的步骤见 [把它改成你的行业](../docs/customize.md)。

现在有两个行业包，各自构建、各自部署成一个行业实例（共用同一套代码，部署见 [部署](../docs/deploy.md)），在小程序里各供一个板块：

- `manufacturing`：锐奇制造日报，小程序的“制造”板块。入库的 `industry/` 就是它。
- `sports`：锐奇运动健康，小程序的“运动健康”板块。还是骨架：分类、提示词和信源都等老板确认草案（待定 D3），门槛是照抄制造的临时值、待用标注样本校准，日报栏目关着；`brand/nameplates/` 是从制造复制来的报头字，写的还是制造，开日报前要重新生成。

| 文件 | 内容 |
|---|---|
| `site.ts` | 站名、行业词、首页文案、关于页、备案号 |
| `taxonomy.ts` | 分类、标签、公司与机构、防止模型写错公司的词表 |
| `topics.json` | 主题目录（`/topics`） |
| `sources.json` | 首次启动时导入的示范信源 |
| `prompts/` | 每一步的提示词：预筛、评分、写作、结构化、归组、综述、日报、翻译 |
| `selection.ts` | 入选门槛；预筛从严（`strictPrefilter`）和写后禁词（`bannedWords`） |
| `features.ts` | 模型榜、Codex 重置监控、日报栏目的开关 |
| `brand/` | 图标、Logo、日报周报月报的报头字 |
| `pages/` | 使用规则、隐私说明（模板，上线前按实际情况改写） |
| `changelog.json` | 更新日志 |
| `gold.example.jsonl` | 精选评测样本的格式示例 |
| `eval/` | 合规评测的样本（选填，现在只有 `sports` 有；见 [精选与校准](../docs/selection.md) 的“合规评测”） |

## 选哪一个

```bash
npm run industry                                       # 按 INDUSTRY_PACK（环境变量或 .env）选，不设就是 manufacturing
node scripts/select-industry.ts <名字>                 # 直接点名
node scripts/select-industry.ts --check manufacturing  # 核对 industry/ 和这个行业包是否逐字节一致
```

名字写错或给了空名字，会直接报错并列出可选的行业包。`npm run dev:*`、`npm run typecheck`、`npm test` 会先自动选一次。镜像用构建参数 `INDUSTRY_PACK`（`docker compose` 从 `.env` 或环境变量里读），镜像里只留选中的那一份。

在本机跑运动健康行业包，在命令前加 `INDUSTRY_PACK=sports`（或者写进 `.env`），用一个它自己的数据库；网页构建读的是当时 `industry/` 里那一份，所以先选好再构建。试完切回制造：

```bash
INDUSTRY_PACK=sports npm run typecheck
DATABASE_URL=postgres://127.0.0.1:5432/sports_test INDUSTRY_PACK=sports npm test
INDUSTRY_PACK=sports npm run dev:api                   # dev:worker、dev:web 同样
node scripts/select-industry.ts manufacturing && node scripts/select-industry.ts --check manufacturing
```

## 加一个行业包

复制一份现有的行业包目录，改名，再按 [把它改成你的行业](../docs/customize.md) 改里面的文件。然后在 `.github/workflows/check.yml` 两个任务的 `matrix.pack` 里加上它的名字，CI 就会对它也跑一遍检查和镜像构建。行业包里不能有 `package.json`、`tsconfig.json`、`README.md`，这三个是 `industry/` 自己的框架文件。
