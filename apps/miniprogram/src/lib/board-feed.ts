// 精选流里按板块不同的显示规则（运动健康 tab 用到）：头部的板块说明、分类筛选条、页脚的板块声明和心理援助热线。
// 文案和号码都只从元信息取（行业包配置），改了不用发版。纯函数，tests/ 里直接跑。
import type { MiniprogramHotline, MiniprogramMeta } from "@aihot/contracts/miniprogram";
import { categoryChip } from "./card.ts";

/** 头部导语：元信息的 board.description，一句一行（原型 sports.html：“健康生活与大众运动，每天十来条。”下一行写边界）。 */
export function ledeLines(description: string | null | undefined): string[] {
  if (typeof description !== "string") return [];
  // 不用正则的后行断言：iOS 16.4 以前的 JavaScriptCore 不认，整包会解析失败。
  return description
    .replace(/。/g, "。\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export interface FilterChip {
  /** 分类 key；“全部”为 null。 */
  key: string | null;
  label: string;
  /** 小圆点的颜色（构建配置的分类配色，不认识的 key 用兜底灰）；“全部”没有圆点，为 null。 */
  color: string | null;
}

/** 分类筛选条：“全部”打头，后面是元信息的 categories，顺序照元信息（即行业包的分类表）。 */
export function filterChips(categories: MiniprogramMeta["categories"], colors: Readonly<Record<string, string>>): FilterChip[] {
  const labels: Record<string, string> = {};
  for (const c of categories) labels[c.key] = c.label;
  return [
    { key: null, label: "全部", color: null },
    ...categories.map((c) => ({ key: c.key, label: c.label, color: categoryChip(c.key, labels, colors)!.color })),
  ];
}

/**
 * 正在看的分类：读者选的分类还在元信息的 categories 里才算，不在了（行业包改了分类、换了一份元信息）回到全部，
 * 免得拿接口不认识的分类去请求。还没有元信息时也是全部（筛选条这时不显示）。
 */
export function activeCategory(picked: string | null, meta: MiniprogramMeta | null): string | null {
  if (picked === null || !meta) return null;
  return meta.categories.some((c) => c.key === picked) ? picked : null;
}

/** 页脚的板块声明：元信息 notice.footer，没有或是空白时不画（制造为 null）。 */
export function footerText(meta: MiniprogramMeta | null): string | null {
  const footer = meta?.notice?.footer;
  return typeof footer === "string" && footer.trim() !== "" ? footer.trim() : null;
}

/**
 * 卡片和条目页上的心理援助热线：分类在元信息 notice.hotline.categories 里，并且文案和号码都不是空的才显示（行业包里号码
 * 人工核对前留空，这时整条不显示，不画半截）。号码只从元信息取，不由模型写，也不写死在小程序里。
 */
export function hotlineFor(category: string | null, hotline: MiniprogramHotline | null | undefined): { label: string; number: string } | null {
  if (category === null || !hotline || !Array.isArray(hotline.categories) || !hotline.categories.includes(category)) return null;
  const label = typeof hotline.label === "string" ? hotline.label.trim() : "";
  const number = typeof hotline.number === "string" ? hotline.number.trim() : "";
  return label && number ? { label, number } : null;
}
