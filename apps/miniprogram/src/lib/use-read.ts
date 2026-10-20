// 已读接上微信存储和 React：整个小程序一份已读记录（read.ts 的 createReadStore）。条目页记已读，精选流（use-feed.ts）读它画已读样式，
// 记了以后下面的精选 tab、运动健康 tab 跟着重画。存储不可用时只记在内存里，阅读不受影响。
import { useEffect, useState } from "react";
import type { BoardKey } from "../../config/boards";
import { createReadStore } from "./read";
import { storage } from "./wx-storage";

const store = createReadStore(storage);

/** 启动时（app.tsx 的 useLaunch）调一次：删 30 天以前的已读，每个板块超过 1000 条先删最旧的。 */
export function pruneReadMarks(): void {
  store.prune();
}

/** 打开条目页、拿到条目时记为已读。 */
export function markItemRead(board: BoardKey, id: string): void {
  store.mark(board, id);
}

/** 这个板块已读的条目 id，记了新的已读就重画。 */
export function useReadIds(board: BoardKey): ReadonlySet<string> {
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((n) => n + 1)), []);
  return store.ids(board);
}
