// 卡片上的显示规则：分类色标、来源数量、“AI 摘要”角标，和焦点卡的底栏。精选流、焦点卡、收藏卡共用。纯函数，tests/ 里直接跑。
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
import { beijingClock } from "./beijing.ts";

/**
 * 不认识的分类 key 用的兜底灰，和 config/boards.ts 的 FALLBACK_CATEGORY_COLOR 一致（tests/card.test.ts 核对）。
 * 小程序代码对 config/boards.ts 只 import type，所以这里另写一份。
 */
export const FALLBACK_CATEGORY_COLOR = "#8a959e";

/** 色标的浅底：分类色 15% 透明度（原型 A 版 .cat 的底色）。 */
const TINT_ALPHA = 0.15;

/** 来源数量后的圆点最多画几个。 */
const MAX_ECHO_DOTS = 5;

export interface CategoryChip {
  label: string;
  /** 小圆点的颜色。 */
  color: string;
  /** 色标的浅底。 */
  tint: string;
}

/**
 * 分类色标。category 为 null 不画（回 null）。分类名从元信息的 categories 取，元信息还没到或表里没有这个 key 时先显示 key；
 * 颜色从构建配置的分类配色表取，不认识的 key 用兜底灰。
 */
export function categoryChip(
  category: string | null,
  labels: Readonly<Record<string, string>>,
  colors: Readonly<Record<string, string>>,
): CategoryChip | null {
  if (category === null) return null;
  const label = own(labels, category) ?? category;
  const color = own(colors, category) ?? FALLBACK_CATEGORY_COLOR;
  return { label, color, tint: tint(color, TINT_ALPHA) };
}

/** 同一事实中不同来源的数量，含代表条目来源；≥ 2 才显示（回 null 不显示）。dots 是后面小圆点的个数。 */
export function sourceCountChip(sourceCount: number): { label: string; dots: number } | null {
  if (!Number.isInteger(sourceCount) || sourceCount < 2) return null;
  return { label: `${sourceCount} 家来源`, dots: Math.min(sourceCount, MAX_ECHO_DOTS) };
}

/** 卡片右上角的“AI 摘要”角标：标题或摘要任一是模型写的就标，只看接口的 ai 字段。 */
export function showAiBadge(ai: { title: boolean; summary: boolean }): boolean {
  return ai.title || ai.summary;
}

export interface FocusFoot {
  /** 大号的来源数量：N 是 sourceNames 的个数（事件层级的全部来源），≥ 2 才显示（为 null 不显示）。 */
  echo: { count: number; dots: number } | null;
  /** 来源名，按首报先后用顿号连起来；sourceNames 是空的时候用代表条目自己的来源名。 */
  sources: string;
  /** 右侧：latestAt（最新一篇报道）的北京时刻“HH:mm”，下面小字“MM-DD 最新”；解析不了时为 null，不显示。 */
  latest: { clock: string; day: string } | null;
}

/** 焦点卡底栏。 */
export function focusFoot(focus: Pick<MiniprogramFocus, "sourceNames" | "latestAt" | "source">): FocusFoot {
  const names = focus.sourceNames.filter((name) => typeof name === "string" && name.trim() !== "");
  const shown = names.length > 0 ? names : [focus.source.name];
  const chip = sourceCountChip(names.length);
  const at = beijingClock(focus.latestAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    echo: chip && { count: names.length, dots: chip.dots },
    sources: shown.join("、"),
    latest: at && { clock: `${pad(Math.floor(at.minute / 60))}:${pad(at.minute % 60)}`, day: `${at.date.slice(5)} 最新` },
  };
}

/** #rrggbb → rgba(r, g, b, alpha)。不是 #rrggbb 时原样返回。 */
export function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1]!, 16)}, ${parseInt(m[2]!, 16)}, ${parseInt(m[3]!, 16)}, ${alpha})`;
}

// 只认对象自己的键，免得 "constructor" 这类 key 取到原型上的东西。
function own(table: Readonly<Record<string, string>>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}
