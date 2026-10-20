// 精选流列表的 React hook：把 feed.ts 的分页状态接到 getJson 和本机快照上。精选 tab 和运动健康 tab 共用。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardKey } from "../../config/boards";
import type { MiniprogramFeed } from "@aihot/contracts/miniprogram";
import { malformedResponse } from "./errors";
import { checkFeed, createFeedStore, feedPath, seedFeed, type FeedQuery, type FeedSnapshot, type FeedState, type FeedStore } from "./feed";
import { getJson, type Result } from "./request";
import { readSnapshot, removeSnapshot, writeSnapshot } from "./storage";
import { useReadIds } from "./use-read";
import { storage } from "./wx-storage";

async function fetchFeed(board: BoardKey, query: FeedQuery): Promise<Result<MiniprogramFeed>> {
  const result = await getJson<unknown>(board, feedPath(query));
  if (!result.ok) return result;
  const feed = checkFeed(result.data);
  return feed ? { ok: true, data: feed, status: result.status } : { ok: false, failure: malformedResponse(result.status) };
}

/** 本机快照只存不带分类筛选的第一页（snap.v1.{board}.feed）；筛了分类的列表不读不写。 */
function feedSnapshot(board: BoardKey, category: string | null): FeedSnapshot | null {
  if (category !== null) return null;
  return {
    initial: readSnapshot(storage, board, "feed", checkFeed)?.data ?? null,
    save: (feed) => void writeSnapshot(storage, board, "feed", feed, Date.now()),
    drop: () => void removeSnapshot(storage, board, "feed"),
  };
}

/**
 * 某个板块、某个分类筛选（null 为全部）的精选流。挂载和筛选变化时先放快照，再从第一页加载。
 * refresh 强制从第一页重拉（下拉刷新），完成后 resolve；revalidate 是切回页面时不强制的重拉，规则见 FeedStore。
 * state 另带 read：这个板块已读的条目 id（本机 read.v1），条目页记了已读就跟着变，列表据此把已读卡片的标题画成正文灰（D25）。
 */
export function useFeed(board: BoardKey, category: string | null = null) {
  // 第一次渲染就带上快照，不先闪一下“加载中”。
  const [state, setState] = useState<FeedState>(() => seedFeed(feedSnapshot(board, category)?.initial ?? null));
  const store = useRef<FeedStore | null>(null);

  useEffect(() => {
    // 换了板块或筛选时，旧列表迟到的响应不再写进状态。
    let active = true;
    const onChange = (next: FeedState) => {
      if (active) setState(next);
    };
    const current = createFeedStore((query) => fetchFeed(board, query), category, onChange, Date.now, feedSnapshot(board, category));
    store.current = current;
    void current.refresh();
    return () => {
      active = false;
    };
  }, [board, category]);

  const loadMore = useCallback(() => void store.current?.loadMore(), []);
  const retry = useCallback(() => void store.current?.retry(), []);
  const refresh = useCallback(() => store.current?.refresh() ?? Promise.resolve(), []);
  const revalidate = useCallback(() => void store.current?.revalidate(), []);
  const read = useReadIds(board);
  const view = useMemo(() => ({ ...state, read }), [state, read]);
  return { state: view, loadMore, retry, refresh, revalidate };
}
