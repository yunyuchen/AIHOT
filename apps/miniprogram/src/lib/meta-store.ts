// 各板块元信息的状态和请求规则（meta-context.tsx 的核心）。纯逻辑：请求、本机存储和时钟由调用方注入，tests/ 里直接跑；
// 接上 getJson、微信存储和 React 状态的是 meta-context.tsx。
//
// 板块之间互不牵连：状态、进行中的请求、本机快照都按板块分开。一个行业实例挂了（连不上、超时、503、形状不对、板块对不上），
// 只有它自己的板块变成失败或配置有误，别的板块的元信息照常；拿到占位也只删这个板块自己的内容快照。
// 本次会话内 60 秒内不重复请求，过了精选流响应给的 refreshAt 提前重拉（规则见 fresh.ts）；重试和下拉刷新传 force 强制重拉。
// 冷启动先放本机快照里的元信息（不是占位的才放），每次成功整份覆盖快照；拿到占位时删掉精选第一页和日报的快照，占位期间不留内容。
import type { BoardKey } from "../../config/boards";
import { malformedResponse } from "./errors.ts";
import { isFresh } from "./fresh.ts";
import { checkMeta, snapshotMeta, type MetaState } from "./meta.ts";
import type { Result } from "./request";
import { readSnapshot, removeSnapshot, writeSnapshot, type Storage } from "./storage.ts";

export type MetaStates = Partial<Record<BoardKey, MetaState>>;

export interface LoadOptions {
  /** 不管新不新鲜都重拉。 */
  force?: boolean;
  /** 同一板块精选流上次响应的 refreshAt：过了它就算过期。 */
  refreshAt?: string | null;
}

/** 请求某个板块的元信息（GET {apiBase}/api/mp/v1/meta，api 基址按板块取）。 */
export type FetchMeta = (board: BoardKey) => Promise<Result<unknown>>;

export interface MetaStore {
  /** 现在各板块的状态；每次变化都换一个新对象。 */
  states(): MetaStates;
  /** 状态变化时通知，回传取消订阅的函数。 */
  subscribe(listener: (states: MetaStates) => void): () => void;
  /** 请求某个板块的元信息，完成后 resolve；还新鲜时不请求，同一板块正在请求时等同一个请求。 */
  load(board: BoardKey, options?: LoadOptions): Promise<void>;
}

/** boards 是构建配置里的板块：只读这些板块的快照（备用构建没有运动健康，就不碰它的快照）。 */
export function createMetaStore(boards: readonly BoardKey[], fetchMeta: FetchMeta, storage: Storage, now: () => number = Date.now): MetaStore {
  // 本机快照里的元信息，fetchedAt 为 null：还没刷新过，第一次 load 一定请求。
  let states: MetaStates = {};
  for (const board of boards) {
    const snapshot = readSnapshot(storage, board, "meta", (data) => snapshotMeta(data, board));
    if (snapshot) states[board] = { status: "ready", meta: snapshot.data, fetchedAt: null };
  }
  const listeners = new Set<(states: MetaStates) => void>();
  // 正在进行的请求：同一板块不并发，后来的调用等同一个请求（下拉刷新要等它回来才收起）；不同板块各发各的，谁也不等谁。
  const inflight: Partial<Record<BoardKey, Promise<void>>> = {};

  const set = (board: BoardKey, state: MetaState) => {
    states = { ...states, [board]: state };
    for (const listener of listeners) listener(states);
  };

  function load(board: BoardKey, { force = false, refreshAt = null }: LoadOptions = {}): Promise<void> {
    const pending = inflight[board];
    if (pending) return pending;
    const current = states[board];
    if (!force && current?.status === "ready" && current.fetchedAt !== null && isFresh(current.fetchedAt, refreshAt, now())) {
      return Promise.resolve();
    }
    // 已经有元信息（含快照）时重拉期间照旧显示；重拉失败也留着旧的（fetchedAt 不变，下次还会重拉），不把头部读数清掉。
    const hadMeta = current?.status === "ready";
    if (!hadMeta) set(board, { status: "loading" });
    const request = fetchMeta(board).then((result) => {
      delete inflight[board];
      if (!result.ok) {
        if (!hadMeta) set(board, { status: "failed", failure: result.failure });
        return;
      }
      const checked = checkMeta(result.data, board);
      if (checked.ok) {
        const fetchedAt = now();
        set(board, { status: "ready", meta: checked.meta, fetchedAt });
        writeSnapshot(storage, board, "meta", checked.meta, fetchedAt);
        if (checked.meta.status === "placeholder") {
          removeSnapshot(storage, board, "feed");
          removeSnapshot(storage, board, "daily");
        }
      } else if (checked.reason === "board_mismatch") set(board, { status: "mismatch", actual: checked.actual });
      else if (!hadMeta) set(board, { status: "failed", failure: malformedResponse(result.status) });
    });
    inflight[board] = request;
    return request;
  }

  return {
    states: () => states,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    load,
  };
}
