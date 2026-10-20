// 收藏接上微信存储、React 和提示：整个小程序一份收藏（saved.ts 的 createSavedStore），收藏按钮、收藏页、条目页都从这里读写，
// 一处改了别处跟着重画。存储不可用时只提示收藏失败，不往外抛，阅读不受影响。
import { useEffect, useState } from "react";
import Taro from "@tarojs/taro";
import type { MiniprogramItem } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../../config/boards";
import { createSavedStore, itemFresh, SAVED_COPY, type SavedDraft, type SavedEntry, type SavedKind } from "./saved";
import { storage } from "./wx-storage";

const store = createSavedStore(storage);

const toast = (title: string) => void Taro.showToast({ title, icon: "none", duration: 2000 }).catch(() => {});

/** 收藏一改就重画。 */
function useSavedChanges(): void {
  const [, setVersion] = useState(0);
  useEffect(() => store.subscribe(() => setVersion((n) => n + 1)), []);
}

/** 全部收藏（新的在前，含被隐藏板块的）；本机存储读不出来时为 null。 */
export function useSavedEntries(): readonly SavedEntry[] | null {
  useSavedChanges();
  return store.entries();
}

export function useIsSaved(kind: SavedKind, board: string, id: string): boolean {
  useSavedChanges();
  return store.has(kind, board, id);
}

/** 收藏按钮：收藏或取消，结果用提示告诉读者（满 300 条、存储不可用都在这里说）。 */
export function toggleSaved(draft: SavedDraft): void {
  const outcome = store.toggle(draft);
  if (outcome === "saved") toast(SAVED_COPY.saved);
  else if (outcome === "removed") toast(SAVED_COPY.removed);
  else if (outcome === "full") toast(SAVED_COPY.full);
  else toast(store.has(draft.kind, draft.board, draft.id) ? SAVED_COPY.removeFailed : SAVED_COPY.saveFailed);
}

/** 条目已下线时的“从收藏移除”。 */
export function removeSaved(kind: SavedKind, board: BoardKey, id: string): void {
  toast(store.remove(kind, board, id) ? SAVED_COPY.missingRemoved : SAVED_COPY.removeFailed);
}

/** 打开收藏过的条目、拿到新内容：更新收藏里的标题、分类、来源数和 ai。没收藏时什么都不做。 */
export function refreshSavedItem(board: BoardKey, item: MiniprogramItem): void {
  store.refresh(board, item.id, itemFresh(item));
}
