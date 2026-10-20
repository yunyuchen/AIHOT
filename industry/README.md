# 选中的行业包（生成的，不要手改）

这个文件夹由选择步骤 `scripts/select-industry.ts` 从 [`industry-packs/<名字>/`](../industry-packs/) 复制生成，代码（`@aihot/industry`）从这里读。行业包只在 `industry-packs/` 里改，改完运行 `npm run industry` 重新选一次；在这里改的内容，下次选择就被覆盖。

- 选哪一个：`INDUSTRY_PACK`（环境变量或 `.env`），不设就是 `manufacturing`。`npm run dev:*`、`npm run typecheck`、`npm test` 会先自动选；镜像用同名的构建参数。
- 入库的这一份是 `manufacturing` 行业包，CI 用 `node scripts/select-industry.ts --check manufacturing` 核对，不一致就失败。
- 只有本文件、`package.json`、`tsconfig.json` 是框架自己的文件，不随行业包走：`package.json` 的 `exports` 是代码和行业包之间的约定，镜像构建在 `npm ci` 之前只拷它；`tsconfig.json` 继承仓库根目录的设置。

行业包里有哪些文件，见 [`industry-packs/README.md`](../industry-packs/README.md)。
