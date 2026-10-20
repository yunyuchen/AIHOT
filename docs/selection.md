# 精选与校准

## 一条资料怎么变成精选

1. **收进来**：同一网址、同一内容只留一份。只有标题或订阅摘要的，先抓原文页面再判断。
2. **预筛**（`prefilter.md`）：这是不是本行业的事。宽进，只拦明显无关的：`BLOCK` 的资料不出现在任何公开页面；`PASS` 和拿不准的 `UNKNOWN` 继续往下走。行业包 `selection.ts` 的 `strictPrefilter` 打开时（运动健康），反过来拿不准的也拦：`UNKNOWN` 按 `BLOCK` 算，缺正文时判的 `BLOCK` 也算数。
3. **评分**（`selection-score.md`）：同一份评分标准独立打两次分（0–100）。**两次之和 ≥ 2 × 门槛**就入选，门槛按信源分级不同。页面上显示的分数是两次的平均（向下取整）。
4. **写标题摘要**：入选的和差一点入选的（平均分高于 `understandFloor`），按 `content-understanding.md` 写中文标题、答案先行的摘要、推荐理由和标签；其余的按 `summarize-*.md` 写简短的标题摘要，进“全部动态”。写出的标题或摘要用了行业包 `selection.ts` 里 `bannedWords` 的词，这条不发布（不回退原标题，后台详情里记下命中的词）；只有推荐理由用了，去掉推荐理由。只有标题、没有正文的条目，写出的标题或摘要复述了系统对材料的说明（如“仅标题可用”“原文正文抓取失败”），同样不发布，后台详情里记下命中的句子；只有推荐理由复述了，去掉推荐理由。
5. **结构化**（`structure.md`）：分类、标签、主体公司、事实（谁、做了什么、对什么），和评分同时进行。主题页和事件归组靠它。
6. **归组**（`group-*.md`）：不同来源报道的同一件事归成一个事件，事件页有综述（`story-digest.md`），“热门”按事件排。入选的资料要等归组完成（最多 3 分钟）才出现在精选里，避免同一件事先冒出好几条。
7. **日报、周报、月报**（`report-*.md`）：每天 08:00 出日报（前一天 08:00 到当天 08:00 的精选候选），每周一 10:00 出上周周报，每月 1 日 10:30 出上月月报。资料进入站点后若跨过刊期边界才确定精选公开时间，便归入下一期候选池；截止前已确定公开时间、但仍在提交的发布事务，取稿会等它提交后再读取，避免漏过前后两期。最终刊载仍受同一事实去重和版面容量限制。

每一步的提示词都在行业包的 `prompts/` 里（`industry-packs/<名字>/prompts/`，改完运行 `npm run industry`），改提示词不用改代码。提示词的版本就是它内容的哈希：改了提示词，之后的新资料按新版判断，已经判过的不会重算。

## 门槛：行业包的 `selection.ts`

```ts
export const SELECTION = {
  thresholds: { T1: 60, T1_5: 60, T2: 60 },   // 两次评分的平均至少要到这个数
  understandFloor: 50,                        // 平均分高于它的未入选资料，也按入选的写法写
};
```

官方一手信源（T1）门槛低一些，媒体和个人（T2）门槛高一些：同样一件事，官方原文更值得先看。没有门槛的分级（`EXCLUDE_MP`）不参与精选。

原框架在 AI 资讯上用的是 60 / 65 / 76；本站换了行业后，用自己的标注样本按下面的办法重新校准：千问 qwen3.8-max 下是 54，换成 deepseek-flash 后是 60。改了评分标准或换了模型，要再校准一次。

## 校准

### 1. 准备样本集

从你自己的信源里挑 100–200 条资料，一条一条标“该选 / 不该选”，存成 `.data/gold.jsonl`（`.data/` 不进 Git）。每行一条：

```json
{"caseId":"law-001","material":{"title":"原文标题","originalTitle":null,"publishedAt":"2026-10-01T09:00:00+08:00","sourceName":"信源名称","bodyZh":null,"bodyOriginal":"正文……"},"sourceFacts":{"sourceKind":"rss","sourceTier":"T1","firstParty":true,"language":"zh"},"samplingContext":{"benchmarkSplit":"development","samplingStratum":"regulation"},"gold":{"decision":"select"}}
```

| 字段 | 说明 |
|---|---|
| `caseId` | 唯一编号 |
| `material` | 标题、原标题、发布时间、信源名、正文（中文正文放 `bodyZh`，原文放 `bodyOriginal`，有一个就行） |
| `sourceFacts` | 信源类型、分级、是否一手、语言。分级决定用哪个门槛 |
| `samplingContext` | 可选。`benchmarkSplit` 分开发集和留出集，`samplingStratum` 是你自己的分组（比如“新规”“判决”“营销”），看错在哪一类 |
| `gold.decision` | `select` 该选，`reject` 不该选，`either` 两可（不计入准确率） |

行业包里的 `gold.example.jsonl` 有两条示例。

几条建议：

- 多放**难例**：差一点就该选、差一点就不该选的。一眼就能判断的放太多，准确率会虚高。
- 分出一部分做**留出集**（`benchmarkSplit: "holdout"`），调提示词只看开发集，最后再用留出集检查一遍，免得把提示词调成只会做这几道题。
- 标注的人最好就是以后读这个站的人，或者和他们口味一致的人。

### 2. 跑评测

```bash
node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl --split development --label "第一版评分标准"
```

对每条样本跑一遍预筛和两次评分，输出：

- 准确率、查准率（选出来的有多少是对的）、查全率（该选的有多少选上了）；
- 门槛从 40 到 90 每隔 2 分，各自会得到什么结果；
- 判错的条目，完整报告写到 `.data/eval/<行业包>/`（评的是当前选中的行业包），同时导入后台 SelectBench。

常用参数：`--models default,deepseek-flash` 同批比较几个模型，`--n 200` 最多抽多少条，`--split holdout` 只跑留出集。同样的输入和提示词再跑不会重复调用模型（有回执复用），只有改过的部分才会产生新调用。

### 3. 看错例，改标准，再跑

在后台 SelectBench 里逐条看判错的资料和模型给的理由：

- 该选没选上，多半是评分标准里没说清它为什么重要：在 `selection-score.md` 里把这类价值写进“必须正常评价”的部分，给出例子。
- 不该选却选上了，多半是噪声没压住：写进“必须压住”的部分。
- 整体偏松或偏紧，而判错的条目分数都贴着门槛，再调行业包 `selection.ts` 的门槛。

先改标准，再动门槛：门槛只能整体移动，解决不了“哪一类判错了”。每改一次跑一遍，SelectBench 里能看到每一版的对比。

## 换模型

后台“模型与评测”页能看到每一步当前用哪个模型、近期的成功率、耗时和 token 用量，也能直接切换（只影响之后的新任务）。换评分模型之前，先用 `--models` 在同一批样本上比一比。

## 改了预筛之后

预筛（`prefilter.md`）决定哪些资料根本不进评分，评测汇总的查准、查全看不出它拦得对不对。改预筛时：

1. 给新规则单独准备一组样本（格式同上）：要拦的和不能误拦的各十几条，`samplingStratum` 用前缀分开（例如要拦的都以 `politics-` 开头）。每条都要有正文：`strictPrefilter` 关着时，只有标题的资料预筛判 BLOCK 也会按 UNKNOWN 继续往下走，测不出拦截。
2. 分两次跑：新样本单独跑一次，看拦截；原来的 `.data/gold.jsonl` 再跑一次，看门槛那一行的查准、查全和选中率（`sel`）有没有比改前差。预筛提示词变了，预筛会全部重新调用；评分提示词没变，评分照旧复用回执。
3. 拦截率从报告的 `cases` 里按 `stratum` 数 `relevance` 为 `block` 的条数（汇总里没有这个数）：

```bash
node -e 'const g={};for(const c of require(process.argv[1]).models.default.cases){const k=c.stratum.split("-")[0];(g[k]??={block:0,pass:0})[c.relevance==="block"?"block":"pass"]++}console.log(g)' "$PWD/.data/eval/<行业包>/selection-….json"
```

镜像里只有选中的那份行业包（构建时删掉了 `industry-packs/`），评测脚本按镜像记下的 `INDUSTRY_PACK` 认行业包，不用挂行业包目录；只把 `.data/` 挂进去（宿主机的 `.data/` 要让容器里的 node 用户，即 uid 1000，可写）：

```bash
docker compose run --rm --no-deps -v "$PWD/.data:/app/.data" api \
  node scripts/eval-selection.ts --gold .data/eval/<行业包>/<样本>.jsonl --label "…"
```

提示词的版本是内容的哈希，改了预筛只影响之后的新资料；已经公开的条目要在后台内容详情页“公开范围”里改成“已下架”。

## 合规评测

有些行业有“不能转的内容”：运动健康板块的疾病诊疗、用药、保健品功效、减肥偏方、浮夸养生、博彩竞猜、直播导流等，预筛必须全部拦下，又不能把正常的健康生活资讯误拦。这类行业包在 `eval/` 里放两份样本（格式同上）：

- `compliance-samples.jsonl`：每类不能转的内容若干条，`samplingStratum` 以 `compliance-` 开头（`compliance-medication`、`compliance-gambling`……），标“不该选”；
- `normal-samples.jsonl`：正常的健康生活与运动资讯，特别是贴着边界、不该拦的（官方的疾病防护提示、提到伤病的赛事报道、官方的体重管理指导……），`samplingStratum` 以 `normal-` 开头，标“该选”或“两可”。

```bash
INDUSTRY_PACK=sports npm run industry
node --env-file=.env scripts/eval-selection.ts --compliance
```

- 只跑预筛，不评分、不导入 SelectBench。读的是选中行业包的提示词和它自己的两份样本（选好以后在 `industry/eval/` 里）；`--gold` 可以换成别的文件，几份用逗号隔开。
- 输出合规样本的拦截率和正常样本的误拦率，各对一条线：`--min-block-rate`（默认 1，即 100%）和 `--max-false-block-rate`（默认 0.05）。没过线，或者有样本没跑成（预算熔断、模型报错），打印 FAIL、退出码为 1，漏拦和误拦的条目逐条列出。
- 报告写到 `.data/eval/<行业包>/compliance-….json`，每条样本的预筛结论和理由都在里面，不覆盖别的行业包的记录。样本和预筛提示词没变，再跑复用回执，不再花钱；改了 `prefilter.md` 才会重新调用。它要调模型，不在 `npm test` 里。
- `--split development` 或 `--split holdout` 只跑开发集或留出集（每类留一条做留出）：改预筛只看开发集，最后再用留出集验一次。
- 不加 `--compliance` 的平常评测，只要样本里有 `compliance-`、`normal-` 开头的分组，也会多打一行这两个比率。

漏拦一条就改 `prefilter.md`（在对应那一类下补正反例），不要靠调门槛补：门槛只管精选，挡不住资料进“全部动态”。行业包里现成的样本是按草案草拟的，上线前由负责合规的人逐条确认或换成真实标注的样本。
