// 条目页：下钻页，参数 board（请求哪个行业实例）和 id。两个板块共用；路由和参数名上线后不改（分享出去的卡片一直留在会话里）。
// 新闻纸上的正文、钴蓝栏头分出的“为什么值得看”“来源”“同一事件”，贴底的收藏和分享条；只在来源允许时展示站内全文。
// 这个板块元信息的 notice.hotline 指定的分类（运动健康的睡眠与心理），“为什么值得看”下面一条心理援助热线，点了拨号。
// 整屏状态（已下线或不存在、占位、加载失败、加载中、内容）见 lib/item.ts。不写本机快照。
// 从分享卡片直接进来（栈里没有上一页）时，原生导航栏左上角是微信自带的回首页按钮（回到 app.config 的第一个页面，即精选），
// 有上一页时是返回，不用自己画。“分享给同事”和右上角菜单走同一个分享回调（lib/share.ts 的 itemShare），拿到内容后预检一次分享图。
import { useMemo, useState } from "react";
import Taro, { useRouter } from "@tarojs/taro";
import { Image, RichText, Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import chevronIcon from "../../assets/item/chevron.png";
import { HeadTab } from "../../components/head-tab";
import { Reading } from "../../components/reading";
import { AiBadge } from "../../components/ai-badge";
import { CategoryTag } from "../../components/category-tag";
// hotline 排在 drill-state（它带进 page-state）前面：样式在公共 chunk 里的先后要和精选流（feed-list 带进 hotline，再 page-state）一致，
// 不然构建报 CSS 顺序冲突。
import { Hotline } from "../../components/hotline";
import { MissingState, PausedState } from "../../components/drill-state";
import { failureText, PageState } from "../../components/page-state";
import { SaveButton } from "../../components/save-button";
import { ShareButton } from "../../components/share-button";
import { sourceTotal } from "../../components/reading/derive";
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
      {screen.kind === "loading" && <Text className="item__status">加载中…</Text>}
      {screen.kind === "missing" && <MissingState board={target?.board ?? null} saved={target} />}
      {screen.kind === "placeholder" && <PausedState board={target!.board} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
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

  // 没归进事件、同一事实 ≥ 2 家时，来源栏的发布日期后面跟来源数（view.echo 只在这时有值）。
  const echoCount = view.echo !== null ? item.sourceCount : null;
  return (
    <View className="item">
      <View className="item-art">
        {(view.chip || view.aiBadge) && (
          <View className="item-art__meta">
            {view.chip && <CategoryTag chip={view.chip} />}
            <View className="item-art__gap" />
            {view.aiBadge && <AiBadge />}
          </View>
        )}
        <Text className="item-art__title" userSelect>
          {item.title}
        </Text>
        <View className="item-art__by">
          <Text className="item-art__src">{item.source.name}</Text>
          {view.published && <Text>{view.published}</Text>}
        </View>
        {item.summary && (
          <Text className="item-art__summary" userSelect>
            {item.summary}
          </Text>
        )}
      </View>

      {view.reason && (
        <View className="item-block">
          <HeadTab label="为什么值得看" aside={view.reason.ai ? <AiBadge /> : null} />
          <View className="item-block__body">
            <Text className="item-block__text" userSelect>
              {view.reason.text}
            </Text>
          </View>
        </View>
      )}

      {help && <Hotline hotline={help} panel />}

      {view.body && (
        <View className="item-block">
          <HeadTab label={view.body.label} aside={view.body.ai ? <AiBadge /> : null} />
          <View className="item-block__body">
            {view.body.incomplete && <Text className="item-body__hint">译文还不完整，完整内容请复制来源链接查看原文</Text>}
            <RichText className="item-body__text" nodes={view.body.nodes} userSelect />
          </View>
        </View>
      )}

      <View className="item-block">
        <HeadTab label="来源" />
        <View className="item-block__body">
          <View className="item-source">
            <View className="item-source__who">
              <Text className="item-source__name">{item.source.name}</Text>
              <View className="item-source__date">
                <Text>{view.published}</Text>
                {echoCount !== null && (
                  <View className="item-source__echo">
                    <Reading value={echoCount} after="家来源" size="s" />
                  </View>
                )}
              </View>
            </View>
            <View className="item-copy" ariaRole="button" ariaLabel="复制来源链接" hoverClass="item-copy--down" onClick={copyLink}>
              复制来源链接
            </View>
          </View>
          <Text className="item-source__note">{view.sourceNote}</Text>
        </View>
      </View>

      {item.story && view.story && (
        <View className="item-block">
          <HeadTab label="同一事件" />
          {/* 只写事件层级的来源数和其他来源，不显示事件标题：标题是模型写的，用户协议第 3 节没列这个位置。读屏读 lib 给的“同一事件，N 家来源”。 */}
          <View className="item-story" ariaRole="button" ariaLabel={view.story.title} hoverClass="item-story--down" onClick={() => openPage(storyPage(board, view.story!.id))}>
            <View className="item-story__main">
              <Reading value={sourceTotal(item.story.sourceCount)} after="家来源" size="m" body />
              <Text className="item-story__line">{view.story.line}</Text>
            </View>
            <Image className="item-story__go" src={chevronIcon} />
          </View>
        </View>
      )}

      {/* 收藏按钮自己管收藏和取消（components/save-button）；“分享给同事”走页面的分享回调（lib/use-share.ts）。 */}
      <View className="item-acts">
        <SaveButton draft={itemDraft(board, item)} variant="item" />
        <ShareButton label="分享给同事" className="item-btn item-btn--ink" />
      </View>

      {fallbackUrl && <LinkSheet url={fallbackUrl} onClose={() => setFallbackUrl(null)} />}
    </View>
  );
}

/** 剪切板写不进时的兜底：链接文字可以长按选择，读者自己复制到浏览器。 */
function LinkSheet({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <View className="link-sheet" catchMove>
      <View className="link-sheet__card">
        <Text className="link-sheet__title">无法复制来源链接</Text>
        <Text className="link-sheet__hint">请长按下方链接并选择复制，再在浏览器中打开</Text>
        <Text className="link-sheet__url" userSelect>
          {url}
        </Text>
        <View className="link-sheet__close" ariaRole="button" ariaLabel="关闭" hoverClass="link-sheet__close--down" onClick={onClose}>
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
