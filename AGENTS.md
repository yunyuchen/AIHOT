# 给 Agent 的说明

这是一个行业热点网站的框架：采集信源、用模型筛选和写作、归组事件、出日报，并通过网站、RSS、公开 API 和 MCP 对外提供。默认配置是一个 AI 行业的示例站。先读 README，再按任务读 `docs/` 里对应的文档。

## 最常见的任务：改成另一个行业

按 `docs/customize.md` 的顺序做。行业相关的一切都在行业包目录 `industry-packs/<名字>/`（`manufacturing` 是锐奇制造日报，`sports` 是运动健康板块的行业实例）：站名文案（`site.ts`）、分类标签（`taxonomy.ts`）、主题（`topics.json`）、示范信源（`sources.json`）、提示词（`prompts/`）、门槛（`selection.ts`）、模块开关（`features.ts`）、品牌（`brand/`）、条款页（`pages/`）。通常不需要改 `apps/` 和 `packages/`。

## 行业包目录和 `industry/`

- `industry-packs/` 是行业包唯一的真相，每个子目录一个行业包。
- `industry/` 是选择步骤（`scripts/select-industry.ts`）从选中的行业包复制出来的，代码只从这里读（npm workspace `@aihot/industry`）。**不要手改 `industry/`**：改行业包目录，再运行 `npm run industry`。`industry/` 里只有 `package.json`、`tsconfig.json`、`README.md` 是框架自己的文件，不随行业包走。
- 选哪一个由 `INDUSTRY_PACK` 决定（环境变量或 `.env`，不设就是 `manufacturing`）。`npm run dev:*`、`npm run typecheck`、`npm test` 会先自动选；`node scripts/select-industry.ts <名字>` 直接点名；镜像用同名的构建参数（`docker-compose.yml` 传进去）。名字写错会直接报错并列出可选项。
- 入库的 `industry/` 是制造行业包，CI 用 `node scripts/select-industry.ts --check manufacturing` 核对。切到别的行业包试过以后，提交前先 `node scripts/select-industry.ts manufacturing` 切回来。
- 新加行业包时，在 `.github/workflows/check.yml` 两个任务的 `matrix.pack` 里加上它的名字。上游改了 `industry/` 时怎么同步进行业包目录，见 `docs/customize.md` 的“上游改了行业包时”。

这些事要问使用者本人，不要替他决定：站名；要盯哪些信源；什么消息重要、什么是噪声；分类怎么分；条款和隐私说明的内容（行业包里的 `pages/` 是模板，上线前需要他本人确认）。

改评分标准时保留原有结构（内容类型、五个维度加权、噪声压制、安全边界），替换的是“什么算重要”“什么算噪声”的例子。门槛要用使用者标注的样本重新校准（`docs/selection.md`），不要凭感觉改数字。

## 运行与检查

- Node.js 24 直接运行 TypeScript，后端没有构建步骤。npm workspaces：`apps/*`、`packages/*`、`industry`（选中的行业包）。
- 本机运行和 Docker 见 `docs/deploy.md`。
- 改完至少跑（改了哪个行业包，就在前面加 `INDUSTRY_PACK=<名字>`；`typecheck` 和 `test` 会先选好行业包，网页构建和网页测试用的是当时 `industry/` 里那一份）：
  ```bash
  npm run typecheck
  DATABASE_URL=postgres://127.0.0.1:5432/<名字>_test npm test   # 空库，名字必须以 _test 或 _ci 结尾，先 node scripts/migrate.ts
  npm run build -w @aihot/web && node --test apps/web/tests/*.test.ts
  node scripts/smoke.ts --base http://localhost:3000             # 站点跑起来以后
  ```
- `tests/` 里的测试从选中的行业包取分类、标签和公司的例子；改了行业包的 `taxonomy.ts` 后仍有测试失败，就把写死的例子换成从 `@aihot/industry/*` 取值。
- 评测脚本（`scripts/eval-selection.ts`、`scripts/eval-relations.ts`）评的是 `industry/` 里那一份，记录写到 `.data/eval/<行业包>/`；`industry/` 和哪个行业包都对不上时（手改过，或改了行业包没重新选），脚本在花钱之前就停下。

## 要守住的规则

- 前端（`apps/web`）只通过 HTTP 读 `apps/api`，数据库、模型调用和密钥只在后端。
- 所有公开出口都从 `packages/backend/src/publication/` 这一个读取层读，新增公开出口也一样。
- 读者打开页面不触发模型调用；模型只在 worker 的任务里调用。
- 付费请求都经过回执（`providers/receipts.ts`）和预算熔断，不要绕开。
- 开发和测试时保持安全阀关闭：`COLLECT_ENABLED`、`MODEL_CALLS_ENABLED`、`FEISHU_*_ENABLED`、`INDEXNOW_SUBMIT_ENABLED`、`WECHAT_SUBSCRIBE_PUSH_ENABLED`。测试不访问任何外部服务。
- 信源默认只展示摘要和原文链接（`site_fulltext` 关）；只有来源明确允许时才打开全文。
- 公开内容匿名，管理员和访客看到的一样；后台只允许管理员。
- 数据库迁移只做向后兼容的增量，新迁移按编号加在 `database/migrations/` 末尾。
- 不要提交 `.env`、密钥和 `.data/`。
- 不要使用 AIHOT 的名字和 Logo。

## 写代码

匹配周围代码的写法、命名和注释密度。选能清楚解决问题的简单方案，只定义正在使用的抽象。验证改动涉及的重要行为，不为简单的样式改动写测试。

## Agent skills

### Issue tracker

Issue 放在 GitHub Issues，仓库是 fork `yunyuchen/AIHOT`（`origin`），不是 `upstream`；用 `gh` CLI 操作。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个默认分诊标签，标签名与角色名相同：`needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录一个 `GLOSSARY.md`，ADR 放在 `docs/adr/`，两者按需创建。见 `docs/agents/domain.md`。
