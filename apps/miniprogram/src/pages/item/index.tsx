// 条目页：下钻页，参数 board（请求哪个行业实例）和 id。两个板块共用；路由和参数名上线后不改（分享出去的卡片一直留在会话里）。
// 原生导航栏放返回和“条目详情”，下面一条墨色，正文主卡压在它下沿：分类、“AI 摘要”、标题、完整摘要、“为什么值得看”、收藏和分享按钮；
// 来源允许站内全文并且给了正文时，主卡下面一张正文卡（rich-text，模型译文前再标一次“AI 摘要”）；
// 来源卡：来源名、“MM-DD 发布”、“复制来源链接”和一句说明；归进事件时再加事件入口卡“同一件事，N 家在报”，点进事件页。
// 这个板块元信息的 notice.hotline 指定的分类（运动健康的睡眠与心理），主卡下面一张心理援助热线卡，点了拨号。
// 整屏状态（已下线或不存在、占位、加载失败、加载中、内容）见 lib/item.ts。不写本机快照。
// 从分享卡片直接进来（栈里没有上一页）时，原生导航栏左上角是微信自带的回首页按钮（回到 app.config 的第一个页面，即精选），
// 有上一页时是返回，不用自己画。“分享给同事”和右上角菜单走同一个分享回调（lib/share.ts 的 itemShare），拿到内容后预检一次分享图。
import { useMemo, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { Image, RichText, Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import starMark from "../../assets/star.png";
import chevronIcon from "../../assets/item/chevron.png";
import copyIcon from "../../assets/item/copy.png";
import { AiBadge } from "../../components/ai-badge";
import { CategoryTag } from "../../components/category-tag";
// hotline 排在 drill-state（它带进 page-state）前面：样式在公共 chunk 里的先后要和精选流（feed-list 带进 hotline，再 page-state）一致，
// 不然构建报 CSS 顺序冲突。
import { Hotline } from "../../components/hotline";
import { MissingState, PausedState } from "../../components/drill-state";
import { failureText, PageState } from "../../components/page-state";
import { SaveButton } from "../../components/save-button";
import { ShareButton } from "../../components/share-button";
import { hotlineFor } from "../../lib/board-feed";
import { boardConfig, buildConfig } from "../../lib/build-config";
import { itemScreen, itemView } from "../../lib/item";
import { useBoardMeta } from "../../lib/meta-context";
import { openPage } from "../../lib/open-page";
import { drillTarget, storyPage } from "../../lib/page-stack";
import { itemDraft } from "../../lib/saved";
import { itemShare } from "../../lib/share";
import { useItem } from "../../lib/use-item";
import { SHARE_BASIS, usePageShare, useShareImageProbe } from "../../lib/use-share";
import type { MiniprogramItem } from "@aihot/contracts/miniprogram";
import "./index.scss";

export default function ItemPage() {
  const { params } = useRouter();
  const target = useMemo(
    () => drillTarget(params, buildConfig.boards.map((b) => b.key)),
    [params.board, params.id],
  );
  const { load, retry } = useItem(target);
  const screen = itemScreen(target, load);
  useShareImageProbe(screen.kind === "content" ? screen.item.share : null);
  usePageShare(() => itemShare(target, screen, SHARE_BASIS));

  if (screen.kind === "content") return <ItemContent board={target!.board} item={screen.item} />;
  return (
    <View className="item">
      <View className="item-top" />
      {screen.kind === "loading" && (
        <View className="item-main">
          <Text className="item-main__status">加载中…</Text>
        </View>
      )}
      {screen.kind !== "loading" && (
        <View className="item-state">
          {screen.kind === "missing" && <MissingState board={target?.board ?? null} saved={target} />}
          {screen.kind === "placeholder" && <PausedState board={target!.board} />}
          {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
        </View>
      )}
    </View>
  );
}

function ItemContent({ board, item }: { board: BoardKey; item: MiniprogramItem }) {
  // 分类名从元信息读，还没到时先显示 key（同精选卡片）。
  const labels = useCategoryLabels(board);
  const view = itemView(item, labels, boardConfig(board).categoryColors, Date.now());
  const help = useHotline(board, item.category);
  // 写剪切板失败或读者拒绝了剪切板授权：弹出可长按选择的链接文字。
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const copyLink = () => {
    Taro.setClipboardData({ data: item.originalUrl })
      .then(() => Taro.showToast({ title: "已复制，可到浏览器打开", icon: "none" }))
      .catch(() => setFallbackUrl(item.originalUrl));
  };

  return (
    <View className="item">
      <View className="item-top" />
      <View className="item-main">
        {(view.chip || view.aiBadge) && (
          <View className="item-main__row">
            {view.chip && <CategoryTag chip={view.chip} />}
            <View className="item-main__gap" />
            {view.aiBadge && <AiBadge />}
          </View>
        )}
        <Text className="item-main__title" userSelect>
          {item.title}
        </Text>
        {item.summary && (
          <Text className="item-main__summary" userSelect>
            {item.summary}
          </Text>
        )}
        {view.reason && (
          <View className="item-why">
            <View className="item-why__head">
              <View className="item-why__mark">
                <Image className="item-why__star" src={starMark} />
              </View>
              <Text className="item-why__title">为什么值得看</Text>
              <View className="item-main__gap" />
              {view.reason.ai && <AiBadge />}
            </View>
            <Text className="item-why__text" userSelect>
              {view.reason.text}
            </Text>
          </View>
        )}
        {/* 收藏按钮自己管收藏和取消（components/save-button）；“分享给同事”走页面的分享回调（lib/use-share.ts）。 */}
        <View className="item-acts">
          <SaveButton draft={itemDraft(board, item)} variant="item" />
          <ShareButton label="分享给同事" className="item-btn item-btn--solid" iconClassName="item-btn__icon" />
        </View>
      </View>

      {help && <Hotline hotline={help} panel />}

      {view.body && (
        <View className="item-panel item-body">
          <View className="item-body__head">
            <Text className="item-body__title">{view.body.label}</Text>
            <View className="item-main__gap" />
            {view.body.ai && <AiBadge />}
          </View>
          {view.body.incomplete && <Text className="item-body__hint">译文还不完整，完整内容请复制来源链接查看原文</Text>}
          <RichText className="item-body__text" nodes={view.body.nodes} userSelect />
        </View>
      )}

      <View className="item-panel">
        <View className="item-source">
          <View className="item-source__who">
            <Text className="item-source__name">{item.source.name}</Text>
            <Text className="item-source__date num">{view.echo ? `${view.published} · ${view.echo}` : view.published}</Text>
          </View>
          <View className="item-copy" hoverClass="item-copy--down" onClick={copyLink}>
            <Image className="item-copy__icon" src={copyIcon} />
            复制来源链接
          </View>
        </View>
        <Text className="item-source__note">{view.sourceNote}</Text>
      </View>

      {view.story && (
        <View className="item-panel item-story" hoverClass="item-story--down" onClick={() => openPage(storyPage(board, view.story!.id))}>
          <View className="item-story__text">
            <View className="item-story__head">
              <Text className="item-story__title">{view.story.title}</Text>
              <View className="item-story__bars">
                {Array.from({ length: view.story.dots }, (_, i) => (
                  <View key={i} className="item-story__bar" />
                ))}
              </View>
            </View>
            <Text className="item-story__line">{view.story.line}</Text>
          </View>
          <Image className="item-story__go" src={chevronIcon} />
        </View>
      )}

      {fallbackUrl && <LinkSheet url={fallbackUrl} onClose={() => setFallbackUrl(null)} />}
    </View>
  );
}

/** 剪切板写不进时的兜底：链接文字可以长按选择，读者自己复制到浏览器。 */
function LinkSheet({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <View className="link-sheet" catchMove>
      <View className="link-sheet__card">
        <Text className="link-sheet__title">没能复制到剪切板</Text>
        <Text className="link-sheet__hint">长按下面的链接选择复制，再到浏览器里打开</Text>
        <Text className="link-sheet__url" userSelect>
          {url}
        </Text>
        <View className="link-sheet__close" hoverClass="link-sheet__close--down" onClick={onClose}>
          关闭
        </View>
      </View>
    </View>
  );
}

/**
 * 这个板块元信息里的分类名。context 里的元信息还新鲜（60 秒内）就不请求；从分享直接进来、还没有元信息时请求一次，
 * 回来之前是空表。
 */
function useCategoryLabels(board: BoardKey): Record<string, string> {
  const { state } = useBoardMeta(board);
  const labels: Record<string, string> = {};
  if (state.status === "ready") for (const c of state.meta.categories) labels[c.key] = c.label;
  return labels;
}

/** 这个分类要不要显示心理援助热线：看这个板块元信息的 notice.hotline（同上，元信息还没到时不显示）。号码只从元信息取。 */
function useHotline(board: BoardKey, category: string | null): { label: string; number: string } | null {
  const { state } = useBoardMeta(board);
  return hotlineFor(category, state.status === "ready" ? state.meta.notice.hotline : null);
}
