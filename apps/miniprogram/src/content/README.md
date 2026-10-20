# 锐奇 tab 和文档页的文案

锐奇 tab 和三篇文档页（关于锐奇热点、用户协议、隐私说明）都是打包进小程序的静态内容，改文案要发版。文本全部来自
`docs/drafts/compliance/` 的合规草稿（v0.1，草稿，待客户确认），这里是抄成 TS 常量的版本，不在运行时解析 markdown。

| 文件 | 内容 | 来源 |
|---|---|---|
| `fixed-copy.ts` | 固定文案 A（提醒例外）、B（访问日志）、C（锐奇 tab 声明） | 草稿 `README.md` 第 2 节；C 在 `reechi-tab-copy.md`，A、B 在 `privacy-notice.md` |
| `reechi-tab.ts` | 锐奇 tab：一句话介绍、关于锐奇、产品与案例、联系我们、反馈与侵权投诉 | `reechi-tab-copy.md` 第 1–4、6 节 |
| `docs.ts` | 三篇文档页，`about`、`agreement`、`privacy` 三个 name | `about-reechi-hot.md`、`user-agreement.md`、`privacy-notice.md` |

## 怎么抄

- 草稿开头给开发看的引用行（“v0.1 · 草稿……”“用在：……”）、`【固定文案】` 标记行和 `<!-- -->` 注释都不抄，只留正文（草稿 `README.md` 的要求）。
- 方括号占位原样保留。联系方式的值里还有方括号时，复制、拨打按钮自动禁用。
- 开头的表格抄成 `facts`；`## 小标题` 是 `h`；段落是 `p`，段内换行写成 `\n`；列表是 `ul` / `ol`，开头加粗的词放 `term`，后面的原文（含冒号）放 `text`。
- 隐私说明里的 A 是 `quote`（突出显示），B 跟在后面是普通段落，不显示成第二个例外。两段都引用 `fixed-copy.ts` 的常量，不另抄。

## 定稿后怎么替换

1. 客户按草稿 `README.md` 第 6 节逐份签收后，先改 `docs/drafts/compliance/` 里的草稿（和规格“合规文案”一节），再改这里。
2. 逐段替换 `reechi-tab.ts`、`docs.ts`。文档的 `version` 改成定稿的版本号，`draft` 改成 `false`，页面上的“草稿，待客户确认”就不再显示；`facts` 里“版本”“生效日期”一行同步改。
3. 页面上不能留占位：替换完在这个目录跑 `grep -n '\[' *.ts`，除注释外不应再有命中。电话写成能直接拨的号码（空格和短横线会被去掉），接听时间放 `note`。
4. 客户的品牌图、产品图放 `src/assets/reechi/`，每张 100KB 以内，锐奇 tab 合计 600KB 以内。现有的线框图标和大 logo 由 `scripts/tab-icons.ts` 生成。
5. 跑 `npm test`、`npm run typecheck`、`npm run build:weapp`，发版。

## 必须一字不差的段落

包括全角括号、弯引号和“、；。”。`tests/compliance-copy.test.ts` 读草稿逐字比对，草稿和这里对不上测试就失败。
CI 只在 `apps/miniprogram/` 或契约包变了时跑，**只改了草稿时要在这里手动跑一次 `npm test`**。

| 常量 | 必须和哪里一致 | 用在 |
|---|---|---|
| `FIXED_C_STATEMENT` | `reechi-tab-copy.md` 的固定文案 C；规格“合规文案”一节“锐奇 tab 的声明” | 锐奇 tab 底部集中声明 |
| `FIXED_B_ACCESS_LOG` | `privacy-notice.md`、`privacy-guidelines-form.md` 的固定文案 B | 锐奇 tab 声明下另起一行；隐私说明“一句话说明” |
| `FIXED_A_REMINDER` | `privacy-notice.md`、`privacy-guidelines-form.md` 的固定文案 A | 隐私说明“一句话说明” |

另外，C 里的短句“不收集个人信息，唯一例外是点“提醒我明天的日报”时临时保存的微信标识”原样出现在“关于锐奇热点”的“匿名”一节（`docs.ts` 的 `about`），改 C 时一起改。
