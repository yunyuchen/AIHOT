// “收藏”按钮：条目页的按钮行和日报头条卡的按钮行（日报 tab、某期日报页）共用，点一下收藏、再点取消（D28）。
// 收藏以后书签变实心，条目页的字变“已收藏”；日报 tab 一行三个按钮放不下多出来的字，日报的字一直是“收藏”，只换实心书签。
// 结果（已收藏、已取消、满 300 条、存储不可用）用提示说，见 lib/use-saved.ts。
// 自己管样子：item 照条目页的白底描边按钮，和“分享给同事”平分一行；daily 照日报头条卡的浅灰按钮，按字宽收窄，排在按钮行最前面。
import { Image, View } from "@tarojs/components";
import bookmarkIcon from "../../assets/item/bookmark.png";
import bookmarkOnIcon from "../../assets/item/bookmark-on.png";
import type { SavedDraft } from "../../lib/saved";
import { toggleSaved, useIsSaved } from "../../lib/use-saved";
import "./index.scss";

export function SaveButton({ draft, variant }: { draft: SavedDraft; variant: "item" | "daily" }) {
  const saved = useIsSaved(draft.kind, draft.board, draft.id);
  return (
    <View
      className={`save-btn save-btn--${variant}`}
      hoverClass="save-btn--down"
      ariaRole="button"
      ariaLabel={saved ? "取消收藏" : "收藏"}
      onClick={() => toggleSaved(draft)}
    >
      <Image className="save-btn__icon" src={saved ? bookmarkOnIcon : bookmarkIcon} />
      {saved && variant === "item" ? "已收藏" : "收藏"}
    </View>
  );
}
