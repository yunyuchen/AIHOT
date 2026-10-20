// 整屏状态里各页共用的部分：板块这一关（配置有误、占位），和有内容时失败的提示、快照的时间标记。纯函数，tests/ 里直接跑。
// 精选 tab（feed-screen.ts）和日报（daily.ts 的 dailyScreen）先过 boardGate，再按各自的内容推出加载失败、加载中、空态、内容。
import type { Failure } from "./errors";
import { displayTime } from "./beijing.ts";
import { placeholderText, type MetaState } from "./meta.ts";

export type GateScreen =
  /** 接口回的板块对不上：说明连到了别的行业实例，它说的占位、它给的内容都不作数。 */
  | { kind: "mismatch"; actual: string }
  /** 整改开关为占位：只留头部的 logo 行和占位文案。 */
  | { kind: "placeholder"; title: string; body: string | null };

const paused = (failure: Failure | null | undefined) => failure?.kind === "paused";

/**
 * 板块这一关，优先级从高到低：
 * 1. 配置有误：元信息的 board.key 和构建配置对不上，别的都不作数。
 * 2. 占位：这次会话里拿到的元信息是 placeholder，或者传进来的任一请求失败是 section_paused。占位只认真拿到的响应，连不上、
 *    超时、503 都不会变成占位；本机快照里的占位元信息也不拿来显示（见 meta.ts 的 snapshotMeta）。占位时不显示读数和内容，
 *    哪怕手上有快照或上次的内容。
 * 都不是时回 null，由页面接着按内容推。
 */
export function boardGate(meta: MetaState, ...failures: Array<Failure | null | undefined>): GateScreen | null {
  if (meta.status === "mismatch") return { kind: "mismatch", actual: meta.actual };
  const current = meta.status === "ready" ? meta.meta : null;
  if (current?.status === "placeholder" || failures.some(paused) || (meta.status === "failed" && paused(meta.failure))) {
    return { kind: "placeholder", ...placeholderText(current?.placeholder) };
  }
  return null;
}

/** 有内容时请求失败的顶部提示。generatedAt 按统一的时间显示写（今天 HH:mm，昨天“昨天 HH:mm”）。 */
export function staleNotice(generatedAt: string | null, now: number): string {
  const at = generatedAt ? displayTime(generatedAt, now) : "";
  return at ? `网络不好，显示的是 ${at} 的内容` : "网络不好，显示的是之前的内容";
}

/** 头部的快照时间标记。 */
export function snapshotStamp(generatedAt: string, now: number): string {
  const at = displayTime(generatedAt, now);
  return at ? `${at} 的内容` : "";
}
