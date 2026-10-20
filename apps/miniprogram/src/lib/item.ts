// 条目页：响应的核对、请求路径、整屏状态和显示规则。纯函数，tests/ 里直接跑；接上 getJson 和 React 状态的是 use-item.ts。
// 条目不存本机快照（规格：条目、事件、某期日报不存快照）。
import type { MiniprogramItem } from "@aihot/contracts/miniprogram";
import { displayDate } from "./beijing.ts";
import { categoryChip, showAiBadge, sourceCountChip, type CategoryChip } from "./card.ts";
import type { Failure } from "./errors";
import type { DrillTarget } from "./page-stack.ts";

/** items/{id}：id 原样编码。 */
export function itemPath(id: string): string {
  return `items/${encodeURIComponent(id)}`;
}

/** 形状大体对、schemaVersion 是 1 才收下，否则回 null（按响应形状不对处理）。 */
export function checkItem(data: unknown): MiniprogramItem | null {
  const item = data as Partial<MiniprogramItem> | null;
  if (!item || typeof item !== "object" || item.schemaVersion !== 1) return null;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.summary !== "string") return null;
  if (!item.source || typeof item.source !== "object" || typeof item.source.name !== "string") return null;
  if (typeof item.publishedAt !== "string" || typeof item.originalUrl !== "string") return null;
  if (!item.fullText || typeof item.fullText !== "object" || typeof item.fullText.allowed !== "boolean") return null;
  if (!item.ai || typeof item.ai !== "object") return null;
  if (item.story !== null && (typeof item.story !== "object" || typeof item.story.id !== "string")) return null;
  return item as MiniprogramItem;
}

/** 一次请求的结果：加载中（含重试）、拿到了、失败。 */
export type ItemLoad = { phase: "loading" } | { phase: "ready"; item: MiniprogramItem } | { phase: "failed"; failure: Failure };

export type ItemScreen =
  /** “已下线或不存在”：接口回 404，或者页面参数不对（没有 id、板块认不出来）。 */
  | { kind: "missing" }
  /** 整改开关为占位（403 section_paused）：显示和精选 tab 一样的占位文案，不算错误。 */
  | { kind: "placeholder" }
  /** 连不上、超时、503、响应形状不对：加载失败加重试。 */
  | { kind: "failed"; failure: Failure }
  | { kind: "loading" }
  | { kind: "content"; item: MiniprogramItem };

/** 条目页整屏显示哪种状态。target 为 null 时不发请求，直接“已下线或不存在”。 */
export function itemScreen(target: DrillTarget | null, load: ItemLoad): ItemScreen {
  if (!target) return { kind: "missing" };
  if (load.phase === "loading") return { kind: "loading" };
  if (load.phase === "ready") return { kind: "content", item: load.item };
  if (load.failure.kind === "not_found") return { kind: "missing" };
  if (load.failure.kind === "paused") return { kind: "placeholder" };
  return { kind: "failed", failure: load.failure };
}

/**
 * 来源卡的说明，按 fullText.allowed 切换（规格“复制来源链接”）。允许但接口没给正文时页面上只有摘要，按只展示摘要说。
 * 正文是模型译文（ai.body）时说明译文是模型翻的；来源自带的译文和中文原文都算“由来源提供”。
 */
export const SOURCE_NOTE = {
  /** 只展示摘要（不允许站内全文，或编辑设了“只显示摘要”）。 */
  summaryOnly: "这里只展示摘要，原文版权归来源所有。复制链接后可在浏览器里打开原文。",
  /** 允许并且给了正文。 */
  fullText: "来源允许站内阅读全文，以上正文由来源提供，原文版权归来源所有。",
  /** 允许并且给了正文，正文是模型从外文原文翻的。 */
  translated: "来源允许站内阅读全文，以上正文由模型从来源原文译成中文，原文版权归来源所有。",
} as const;

/** 正文末尾接口固定加的那一段（后端 rich-text.ts 的 RICH_TEXT_NOTE），画成小字。 */
export const BODY_NOTE = "完整排版请复制来源链接查看";

/** 事件入口卡“同一件事，N 家在报”后面的圆点最多几个（同卡片上的“N 家在报”）。 */
const MAX_STORY_DOTS = 5;

export interface ItemView {
  chip: CategoryChip | null;
  /** 标题上方一行的“AI 摘要”：覆盖标题和摘要，任一是模型写的就标。 */
  aiBadge: boolean;
  /** “为什么值得看”：reason 有内容才显示；ai 为真时块标题旁标“AI 摘要”（按 ai.reason 单独标）。 */
  reason: { text: string; ai: boolean } | null;
  /**
   * 站内全文：来源允许（fullText.allowed）并且接口给了正文才有，画在主卡下面。label 是块标题（外文译成的写“译文”）；
   * ai 为真（ai.body：正文是模型译文）时块标题旁再标一次“AI 摘要”，来源自带的译文和中文原文不标；incomplete 是译文没译完。
   */
  body: { nodes: string; label: string; ai: boolean; incomplete: boolean } | null;
  /** 来源卡的“MM-DD 发布”：只取 publishedAt 的北京日期（跨年带年份），不用 anchorAt。 */
  published: string;
  /**
   * 同一事实的“N 家在报”（和卡片上同一个数，≥ 2 才有）：只在没归进事件时跟在发布日期后面；归进事件时由事件入口卡说，
   * 免得同一页上出现两个不同的数。“只显示摘要”时接口给 null，不显示。
   */
  echo: string | null;
  sourceNote: string;
  /** 事件入口卡：N 用事件层级的 story.sourceCount（条目自己的 sourceCount 为 1 时照样显示）；没归进事件或“只显示摘要”时为 null。 */
  story: { id: string; title: string; dots: number; line: string } | null;
}

/** 条目页的显示规则。labels 是元信息的分类名（还没到时为空表，先显示 key），colors 是构建配置的分类配色。 */
export function itemView(
  item: MiniprogramItem,
  labels: Readonly<Record<string, string>>,
  colors: Readonly<Record<string, string>>,
  now: number | string | Date,
): ItemView {
  const reason = item.reason?.trim() ?? "";
  const shown = displayDate(item.publishedAt, now);
  const body = fullTextBody(item);
  return {
    chip: categoryChip(item.category, labels, colors),
    aiBadge: showAiBadge(item.ai),
    reason: reason ? { text: reason, ai: item.ai.reason === true } : null,
    body,
    published: shown ? `${shown} 发布` : "",
    echo: !item.story && item.sourceCount !== null ? (sourceCountChip(item.sourceCount)?.label ?? null) : null,
    sourceNote: !body ? SOURCE_NOTE.summaryOnly : body.ai ? SOURCE_NOTE.translated : SOURCE_NOTE.fullText,
    story: item.story && storyEntry(item.story),
  };
}

function fullTextBody(item: MiniprogramItem): ItemView["body"] {
  const { allowed, html, translated, complete } = item.fullText;
  if (!allowed || typeof html !== "string" || html.trim() === "") return null;
  return {
    nodes: bodyNodes(html),
    label: translated ? "译文" : "正文",
    ai: item.ai.body === true,
    incomplete: translated && complete === false,
  };
}

/** rich-text 里各标签的样式。页面的 wxss 管不到 rich-text 里的节点，只能写成行内样式；字号和行高由外面的容器给，这里只管段间距和块的样子。 */
const BODY_STYLES: Readonly<Record<string, string>> = {
  p: "margin:0 0 12px",
  h2: "margin:20px 0 10px;font-size:18px;line-height:1.5;font-weight:700",
  h3: "margin:18px 0 8px;font-size:17px;line-height:1.5;font-weight:700",
  h4: "margin:16px 0 8px;font-size:16px;line-height:1.5;font-weight:700",
  ul: "margin:0 0 12px;padding-left:20px",
  ol: "margin:0 0 12px;padding-left:20px",
  li: "margin:0 0 4px",
  blockquote: "margin:0 0 12px;padding:2px 0 2px 12px;border-left:3px solid #c5cbd0;color:#5d6872",
  table: "width:100%;margin:0 0 12px;border-collapse:collapse;font-size:13px;line-height:1.5",
  th: "padding:6px 8px;border:1px solid #dfe2e5;background:#f2f3f5;font-weight:600;text-align:left",
  td: "padding:6px 8px;border:1px solid #dfe2e5",
};
const BODY_NOTE_STYLE = "margin:16px 0 0;font-size:13px;line-height:1.5;color:#5d6872";

/**
 * 给接口的正文（已经压成 rich-text 白名单标签，只有 img 带 style、单元格可能带 colspan/rowspan）的块标签加上行内样式；
 * 已经带 style 的标签不动。末尾固定的“完整排版请复制来源链接查看”画成小字。
 */
export function bodyNodes(html: string): string {
  const styled = html.replace(/<(p|h2|h3|h4|ul|ol|li|blockquote|table|th|td)(\s[^>]*)?>/g, (tag, name: string, attrs: string | undefined) =>
    attrs && /\sstyle=/.test(attrs) ? tag : `<${name}${attrs ?? ""} style="${BODY_STYLES[name]}">`,
  );
  const note = `<p style="${BODY_STYLES.p}">${BODY_NOTE}</p>`;
  return styled.endsWith(note) ? `${styled.slice(0, -note.length)}<p style="${BODY_NOTE_STYLE}">${BODY_NOTE}</p>` : styled;
}

function storyEntry(story: NonNullable<MiniprogramItem["story"]>): NonNullable<ItemView["story"]> {
  const count = Math.max(1, Math.floor(story.sourceCount) || 1);
  const others = story.otherSourceNames.filter((name) => typeof name === "string" && name.trim() !== "");
  // 其他来源名最多给 3 个；还有没列出来的就加“等”。
  const more = count - 1 > others.length ? "等" : "";
  return {
    id: story.id,
    title: `同一件事，${count} 家在报`,
    dots: Math.min(count, MAX_STORY_DOTS),
    line: others.length > 0 ? `${others.join("、")}${more}也报道了，看事件脉络` : "看事件脉络",
  };
}
