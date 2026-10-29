// 元信息的核对：形状大体对、schemaVersion 是 1、board.key 和构建配置对得上。纯函数，tests/ 里直接跑。
import type { MiniprogramMeta, MiniprogramPlaceholder } from "@aihot/contracts/miniprogram";
import type { Failure } from "./errors";

export type MetaCheck =
  | { ok: true; meta: MiniprogramMeta }
  /** 接口回的板块和构建配置不一致：说明这个板块的 apiBase 配错了。 */
  | { ok: false; reason: "board_mismatch"; actual: string }
  /** 不是 v1 的元信息。 */
  | { ok: false; reason: "malformed" };

export function checkMeta(data: unknown, expectedBoard: string): MetaCheck {
  const meta = data as Partial<MiniprogramMeta> | null;
  if (!meta || typeof meta !== "object" || meta.schemaVersion !== 1) return { ok: false, reason: "malformed" };
  if (!meta.board || typeof meta.board.key !== "string" || !meta.readings || typeof meta.readings !== "object") {
    return { ok: false, reason: "malformed" };
  }
  if (meta.board.key !== expectedBoard) return { ok: false, reason: "board_mismatch", actual: meta.board.key };
  return { ok: true, meta: meta as MiniprogramMeta };
}

export type MetaState =
  | { status: "loading" }
  /** fetchedAt 是这次会话里成功响应的本机时刻；冷启动从本机快照来、还没刷新成功时为 null。 */
  | { status: "ready"; meta: MiniprogramMeta; fetchedAt: number | null }
  | { status: "failed"; failure: Failure }
  /** 接口回的 board.key 和构建配置对不上：api 基址配错了。 */
  | { status: "mismatch"; actual: string };

/**
 * 冷启动时能不能先显示本机快照里的元信息：核对得过、板块对得上、而且不是占位。
 * 占位的快照照样写（收藏 tab 据此先隐藏这个板块，票 17），但不拿来显示：占位只认这次会话里的响应，
 * 免得 api 连不上时显示成占位。
 */
export function snapshotMeta(data: unknown, board: string): MiniprogramMeta | null {
  const checked = checkMeta(data, board);
  return checked.ok && checked.meta.status === "normal" ? checked.meta : null;
}

/** 内置占位文案（D30），不提整改、不提类目。 */
export const BUILT_IN_PLACEHOLDER = "本板块调整中，暂不提供内容";

/** 占位时显示的文案：优先行业包给的（元信息 placeholder），没给或标题是空的用内置文案。 */
export function placeholderText(placeholder: MiniprogramPlaceholder | null | undefined): { title: string; body: string | null } {
  const title = typeof placeholder?.title === "string" ? placeholder.title.trim() : "";
  if (!title) return { title: BUILT_IN_PLACEHOLDER, body: null };
  const body = typeof placeholder?.body === "string" ? placeholder.body.trim() : "";
  return { title, body: body || null };
}
