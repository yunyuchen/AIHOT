// 精选 tab 和运动健康 tab 整屏显示哪种状态：由元信息和精选流两份状态推出来。纯函数，tests/ 里直接跑。
//
// 优先级从高到低：
// 1–2. 配置有误、占位：板块这一关，见 screen.ts 的 boardGate（精选流的第一页、续页回 section_paused 都算占位）。
// 3. 加载失败：没有任何卡片可显示时，元信息或第一页失败了，显示“加载失败”和重试。
// 4. 加载中：还没有卡片，第一页还没回来。
// 5. 空态：第一页成功回来、一张卡都没有（今天和往日都没有）。今天没有、往日有不算空态，时间轴从往日开始。
//    筛了分类时是“这个分类最近没有内容”加“看全部”，和整个板块没有精选分开。
// 6. 内容：有卡片就显示，哪怕是快照。这时的失败不清空列表，降成顶部一条“网络不好，显示的是 HH:mm 的内容”。
// 焦点卡只跟着“内容”出现，占位、加载失败、加载中、空态都不画（visibleFocus）。
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
import type { Failure } from "./errors";
import type { FeedState } from "./feed";
import type { MetaState } from "./meta.ts";
import { boardGate, type GateScreen } from "./screen.ts";

export type FeedScreen =
  | GateScreen
  | { kind: "failed"; failure: Failure }
  | { kind: "loading" }
  /** filtered：筛了分类（“这个分类最近没有内容”加“看全部”），否则是整个板块“最近还没有精选”。 */
  | { kind: "empty"; filtered: boolean }
  | {
      kind: "content";
      /** 元信息或第一页刚失败了：顶部提示“网络不好”，点一下重试。 */
      stale: Failure | null;
      /** 列表还是冷启动放上来的快照、刷新还没回来：头部标上这份快照的 generatedAt。有 stale 时不标（提示里已经有时间）。 */
      snapshotAt: string | null;
    };

/** category 是正在看的分类筛选，null 为全部。 */
export function feedScreen(meta: MetaState, feed: FeedState, category: string | null = null): FeedScreen {
  const gate = boardGate(meta, feed.failure);
  if (gate) return gate;
  const feedFailure = feed.phase === "failed" ? feed.failure : null;
  const metaFailure = meta.status === "failed" ? meta.failure : null;
  if (feed.cards.length === 0) {
    const failure = feedFailure ?? metaFailure;
    if (failure) return { kind: "failed", failure };
    return feed.phase === "ready" ? { kind: "empty", filtered: category !== null } : { kind: "loading" };
  }
  const stale = feedFailure ?? metaFailure;
  return { kind: "content", stale, snapshotAt: feed.fromSnapshot && !stale ? feed.generatedAt : null };
}

/**
 * 这一屏画不画焦点卡：构建配置里这个板块渲染焦点卡（制造是、运动健康否），整屏是“内容”，并且正在显示的第一页带了焦点卡。
 * 回 null 时不画，时间轴也不去掉任何卡。
 */
export function visibleFocus(screen: FeedScreen, feed: FeedState, focusCard: boolean): MiniprogramFocus | null {
  return focusCard && screen.kind === "content" ? feed.focus : null;
}
