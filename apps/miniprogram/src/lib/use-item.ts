// 条目页的 React hook：按板块请求 items/{id}，核对形状，重试时重新请求。不写本机快照。
// 拿到条目时记为已读（精选流里标题变正文灰），收藏过的顺手用新内容更新收藏快照（票 17）。
import { useEffect, useState } from "react";
import { malformedResponse } from "./errors";
import { checkItem, itemPath, type ItemLoad } from "./item";
import type { DrillTarget } from "./page-stack";
import { getJson } from "./request";
import { markItemRead } from "./use-read";
import { refreshSavedItem } from "./use-saved";

/** target 为 null（参数不对）时不请求，页面按 itemScreen 直接显示“已下线或不存在”。 */
export function useItem(target: DrillTarget | null): { load: ItemLoad; retry: () => void } {
  const [load, setLoad] = useState<ItemLoad>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);
  const board = target?.board ?? null;
  const id = target?.id ?? null;

  useEffect(() => {
    if (board === null || id === null) return;
    // 页面卸载或换了条目以后，迟到的响应不再写进状态。
    let active = true;
    setLoad({ phase: "loading" });
    void getJson<unknown>(board, itemPath(id)).then((result) => {
      if (!active) return;
      if (!result.ok) return setLoad({ phase: "failed", failure: result.failure });
      const item = checkItem(result.data);
      setLoad(item ? { phase: "ready", item } : { phase: "failed", failure: malformedResponse(result.status) });
      if (!item) return;
      markItemRead(board, id);
      refreshSavedItem(board, item);
    });
    return () => {
      active = false;
    };
  }, [board, id, attempt]);

  return { load, retry: () => setAttempt((n) => n + 1) };
}
