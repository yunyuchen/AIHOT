// 两个板块共用真实精选流、分类、分页和快照；制造焦点使用深墨封面，列表与运动健康使用暖纸阅读面。
// 占位或失败时保留状态与重试；热线仍从板块元信息读取。
// 只请求这个板块自己的行业实例：状态、请求、快照都按板块分开（lib/meta-store.ts、lib/use-feed.ts），另一个板块挂了不影响这里。
import { useEffect, useRef, useState } from "react";
import Taro, { useDidHide, useDidShow, usePullDownRefresh, useReachBottom } from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import { Dashboard } from "../dashboard";
import { FeedList } from "../feed-list";
import { FilterBar } from "../filter-bar";
import { FocusCard } from "../focus-card";
import { failureText, PageState, StaleNotice } from "../page-state";
import { activeCategory, filterChips } from "../../lib/board-feed";
import { boardConfig, buildConfig } from "../../lib/build-config";
import { feedScreen, visibleFocus } from "../../lib/feed-screen";
import { awayTooLong } from "../../lib/fresh";
import { useBoardMeta } from "../../lib/meta-context";
import { openPage } from "../../lib/open-page";
import { itemPage } from "../../lib/page-stack";
import { snapshotStamp, staleNotice } from "../../lib/screen";
import { useFeed } from "../../lib/use-feed";
import "./index.scss";

export function BoardFeed({ board, cover }: { board: BoardKey; cover?: string }) {
  const config = boardConfig(board);
  const { state, reload, revalidate } = useBoardMeta(board);
  const meta = state.status === "ready" ? state.meta : null;
  // 读者在筛选条上选的分类；不在元信息的分类表里了就回到全部（activeCategory）。没有筛选条的板块一直是全部。
  const [picked, setPicked] = useState<string | null>(null);
  const category = config.filterBar ? activeCategory(picked, meta) : null;
  const feed = useFeed(board, category);
  const screen = feedScreen(state, feed.state, category);
  // 这次会话里拿到的元信息是占位（快照里的占位不会放进来）。占位期间切回只查元信息，不去请求精选流。
  const metaPlaceholder = meta?.status === "placeholder";

  useReachBottom(() => {
    if (screen.kind === "content") feed.loadMore();
  });

  // 切回这个 tab（含从微信后台切回）：离开超过 30 分钟强制重拉元信息和第一页，已经加载的续页收回（D26）；
  // 否则元信息和第一页上次的响应还新鲜（60 秒内、没过精选流给的 refreshAt）就不请求。
  const hiddenAt = useRef<number | null>(null);
  useDidHide(() => {
    hiddenAt.current = Date.now();
  });
  useDidShow(() => {
    const away = awayTooLong(hiddenAt.current, Date.now());
    hiddenAt.current = null;
    if (away) {
      void reload();
      if (!metaPlaceholder) void feed.refresh();
      // 列表要收回成第一页，回到顶部查看新内容（更新失败提示也在顶部）。
      void Taro.pageScrollTo({ scrollTop: 0, duration: 0 }).catch(() => {});
      return;
    }
    revalidate(feed.state.refreshAt);
    if (!metaPlaceholder) feed.revalidate();
  });

  // 元信息从占位变回正常：精选流重新从第一页加载（占位期间它没请求过，或者停在 section_paused）。
  const metaStatus = meta?.status ?? null;
  const lastMetaStatus = useRef(metaStatus);
  useEffect(() => {
    if (lastMetaStatus.current === "placeholder" && metaStatus === "normal") void feed.refresh();
    lastMetaStatus.current = metaStatus;
  }, [metaStatus, feed.refresh]);

  // 下拉刷新：强制重拉元信息和第一页，两个都回来再收起。失败时已有内容不清空，显示更新失败提示。
  usePullDownRefresh(() => {
    void Promise.all([reload(), feed.refresh()]).finally(() => Taro.stopPullDownRefresh());
  });

  // 重试（加载失败的按钮、顶部提示条）：失败了的、或者还只是快照的元信息强制重拉；第一页失败重拉第一页。
  const retry = () => {
    if (state.status !== "ready" || state.fetchedAt === null) void reload();
    feed.retry();
  };

  const title = buildConfig.appName;
  // 按天看的板块：头部只写板块名，元信息没到时用构建配置的兜底值。
  const boardHeader = config.byDay ? { name: meta?.board.name || config.name } : null;
  if (screen.kind === "mismatch") {
    return (
      <View>
        <Dashboard title={title} date={null} board={boardHeader} />
        <PageState
          title="配置有误"
          detail={`接口回的板块是 ${screen.actual}，这里要的是 ${board}（${config.name}），请检查构建配置里的 api 地址`}
        />
      </View>
    );
  }
  if (screen.kind === "placeholder") {
    return (
      <View>
        <Dashboard title={title} date={null} board={boardHeader} brandOnly />
        <PageState title={screen.title} detail={screen.body} />
      </View>
    );
  }

  const now = Date.now();
  const labels: Record<string, string> = {};
  for (const c of meta?.categories ?? []) labels[c.key] = c.label;
  const colors = config.categoryColors;
  const stamp = screen.kind === "content" && screen.snapshotAt ? snapshotStamp(screen.snapshotAt, now) : null;
  const focus = visibleFocus(screen, feed.state, config.focusCard);
  const filter = config.filterBar && meta && meta.categories.length > 0 ? filterChips(meta.categories, colors) : null;
  const open = (id: string) => openPage(itemPage(board, id));
  return (
    <View className={focus ? "board-feed board-feed--focus" : "board-feed"}>
      <Dashboard
        title={title}
        date={meta?.readings.date ?? null}
        stamp={stamp}
        board={boardHeader}
        cover={cover}
      />
      {focus && <FocusCard focus={focus} labels={labels} colors={colors} onOpen={open} />}
      <View className="board-reading">
      <Text className="board-reading__heading">{config.byDay ? "生活精选" : "行业精选"}</Text>
      {filter && <FilterBar chips={filter} active={category} onPick={setPicked} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
      {screen.kind === "empty" &&
        (screen.filtered ? (
          <PageState title="该分类暂无内容" action={{ text: "查看全部", onClick: () => setPicked(null) }} />
        ) : (
          <PageState title="暂无精选内容" />
        ))}
      {screen.kind === "content" && screen.stale && <StaleNotice text={staleNotice(feed.state.generatedAt, now)} onRetry={retry} />}
      {(screen.kind === "loading" || screen.kind === "content") && (
        <FeedList
          state={feed.state}
          labels={labels}
          colors={colors}
          focusId={focus?.id ?? null}
          onOpen={open}
          onRetry={feed.retry}
          byDay={config.byDay}
          hotline={meta?.notice.hotline ?? null}
        />
      )}
      </View>
    </View>
  );
}
