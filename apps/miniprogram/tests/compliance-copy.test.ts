import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FIXED_A_REMINDER, FIXED_B_ACCESS_LOG, FIXED_C_STATEMENT } from "../src/content/fixed-copy.ts";

// 仓库根：tests/ 往上三层（apps/miniprogram/tests）。
const root = new URL("../../../", import.meta.url);

function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

/** 取草稿里某段固定文案：两行注释标记之间唯一的一行引用块，去掉“> ”。草稿改了格式就让测试失败，不悄悄通过。 */
function fixedCopy(file: string, mark: "A" | "B" | "C"): string {
  const text = read(`docs/drafts/compliance/${file}`);
  const open = `<!-- 固定文案${mark} 开始`;
  const close = `<!-- 固定文案${mark} 结束 -->`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  assert.ok(start >= 0 && end > start, `${file} 里找不到固定文案 ${mark} 的开始和结束标记`);
  assert.equal(text.indexOf(open, start + 1), -1, `${file} 里固定文案 ${mark} 的开始标记不止一处`);
  const quotes = text
    .slice(start, end)
    .split("\n")
    .filter((line) => line.startsWith("> "));
  assert.equal(quotes.length, 1, `${file} 里固定文案 ${mark} 应该正好一行引用块`);
  return quotes[0]!.slice(2);
}

test("锐奇 tab 的集中声明和草稿的固定文案 C 一字不差，规格“合规文案”一节里也是这句", () => {
  assert.equal(FIXED_C_STATEMENT, fixedCopy("reechi-tab-copy.md", "C"));
  assert.ok(read("docs/specs/reechi-hot-v1-spec.md").includes(`**锐奇 tab 的声明**：${FIXED_C_STATEMENT}`));
});

test("声明下面那句访问日志和隐私说明的固定文案 B 一字不差", () => {
  assert.equal(FIXED_B_ACCESS_LOG, fixedCopy("privacy-notice.md", "B"));
  assert.equal(FIXED_B_ACCESS_LOG, fixedCopy("privacy-guidelines-form.md", "B"));
});

test("隐私说明文档页里的提醒例外和固定文案 A 一字不差", () => {
  assert.equal(FIXED_A_REMINDER, fixedCopy("privacy-notice.md", "A"));
  assert.equal(FIXED_A_REMINDER, fixedCopy("privacy-guidelines-form.md", "A"));
});
