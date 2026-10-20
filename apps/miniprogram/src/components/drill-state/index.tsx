// 下钻页（条目页、事件页、某期日报页）共用的两种整屏状态：“已下线或不存在”和占位。样子是 page-state 的白卡。
import { useEffect } from "react";
import type { BoardKey } from "../../../config/boards";
import { boardConfig } from "../../lib/build-config";
import { placeholderText } from "../../lib/meta";
import { useBoardMeta } from "../../lib/meta-context";
import { switchToTab } from "../../lib/open-page";
import { homeTab, type DrillTarget } from "../../lib/page-stack";
import { SAVED_COPY } from "../../lib/saved";
import { removeSaved, useIsSaved } from "../../lib/use-saved";
import { PageState } from "../page-state";

/**
 * 404 或参数不对：“已下线或不存在”，按钮回到板块所在的 tab（制造回精选，运动健康回运动健康）。
 * saved：条目页传自己的板块和 id。这一条在收藏里时前面多一个“从收藏移除”（票 17，不自动删），移除以后只剩回 tab 的按钮。
 */
export function MissingState({ board, saved = null }: { board: BoardKey | null; saved?: DrillTarget | null }) {
  const home = homeTab(board ? boardConfig(board).tabs[0] : undefined);
  const back = { text: home.label, onClick: () => switchToTab(home.url) };
  const inSaved = useIsSaved("item", saved?.board ?? "", saved?.id ?? "");
  if (saved && inSaved) {
    const remove = { text: SAVED_COPY.missingRemove, onClick: () => removeSaved("item", saved.board, saved.id) };
    return <PageState title="已下线或不存在" action={remove} secondary={back} />;
  }
  return <PageState title="已下线或不存在" action={back} />;
}

/**
 * 403 section_paused：和精选 tab 一样的占位文案，优先元信息里行业包给的，没有用内置文案。
 * 收到占位时强制重拉一次这个板块的元信息，拿到最新的占位文案（精选 tab 也会跟着变成占位）。
 */
export function PausedState({ board }: { board: BoardKey }) {
  const { state, reload } = useBoardMeta(board);
  useEffect(() => void reload(), [board]);
  const meta = state.status === "ready" ? state.meta : null;
  const text = placeholderText(meta?.status === "placeholder" ? meta.placeholder : null);
  return <PageState title={text.title} detail={text.body} />;
}
