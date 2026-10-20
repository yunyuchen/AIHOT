// 一个板块的精选流整屏，精选 tab（制造）和运动健康 tab 共用，按板块参数化；板块之间不同的地方看构建配置：
// - 制造：深色头部（日期、读数、扫描条），头部下沿压一张今日焦点卡，今天按时段分段，卡片显示时刻。
// - 运动健康（focusCard 否、filterBar、byDay）：头部写板块名、三个读数和板块说明（元信息 board.description），下沿钉分类筛选条，
//   一律按天分段，卡片不显示时刻；筛到没有内容的分类时是“这个分类最近没有内容”加“看全部”。
// 元信息给了页脚声明（notice.footer）就固定在屏幕底部；notice.hotline 指定的分类，卡片上显示心理援助热线。
// 触底加载下一页，下拉刷新（页面配置要开 enablePullDownRefresh）。冷启动先显示本机快照再刷新；整屏显示哪种状态（配置有误、占位、
// 加载失败、加载中、空态、内容）见 lib/feed-screen.ts，焦点卡只跟着“内容”出现。每次显示都按 60 秒规则检查元信息，占位时只留
// 深色头部的 logo 行和占位文案。点卡片进条目页（带上这个板块）。
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
import { activeCategory, filterChips, footerText, ledeLines } from "../../lib/board-feed";
import { boardConfig, buildConfig } from "../../lib/build-config";
import { feedScreen, visibleFocus } from "../../lib/feed-screen";
import { awayTooLong } from "../../lib/fresh";
import { useBoardMeta } from "../../lib/meta-context";
import { openPage } from "../../lib/open-page";
import { itemPage } from "../../lib/page-stack";
import { snapshotStamp, staleNotice } from "../../lib/screen";
import { useFeed } from "../../lib/use-feed";
import "./index.scss";

export function BoardFeed({ board }: { board: BoardKey }) {
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
      // 列表要收回成第一页，回到顶上看新的（失败时“网络不好”的提示也在顶上）。
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

  // 下拉刷新：强制重拉元信息和第一页，两个都回来再收起。失败时已有的内容不清空，顶部提示“网络不好”。
  usePullDownRefresh(() => {
    void Promise.all([reload(), feed.refresh()]).finally(() => Taro.stopPullDownRefresh());
  });

  // 重试（加载失败的按钮、顶部提示条）：失败了的、或者还只是快照的元信息强制重拉；第一页失败重拉第一页。
  const retry = () => {
    if (state.status !== "ready" || state.fetchedAt === null) void reload();
    feed.retry();
  };

  const title = buildConfig.appName;
  // 按天看的板块：头部写板块名（元信息没到时用构建配置的兜底值）和板块说明。
  const boardHeader = config.byDay ? { name: meta?.board.name || config.name, lede: ledeLines(meta?.board.description) } : null;
  if (screen.kind === "mismatch") {
    return (
      <View>
        <Dashboard title={title} date={null} readings={null} board={boardHeader} />
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
        <Dashboard title={title} date={null} readings={null} brandOnly />
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
  const footer = footerText(meta);
  const open = (id: string) => openPage(itemPage(board, id));
  return (
    <View>
      <Dashboard
        title={title}
        date={meta?.readings.date ?? null}
        readings={meta?.readings ?? null}
        stamp={stamp}
        focusAt={focus?.anchorAt ?? null}
        board={boardHeader}
        filterBar={filter !== null}
      />
      {focus && <FocusCard focus={focus} labels={labels} colors={colors} onOpen={open} />}
      {filter && <FilterBar chips={filter} active={category} onPick={setPicked} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
      {screen.kind === "empty" &&
        (screen.filtered ? (
          <PageState title="这个分类最近没有内容" action={{ text: "看全部", onClick: () => setPicked(null) }} />
        ) : (
          <PageState title="最近还没有精选" />
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
      {footer && <BoardFooter text={footer} />}
    </View>
  );
}

/**
 * 页脚的板块声明：固定在屏幕底部（tab 页里就是 tabBar 上面），随时看得到。列表最后放一份同样文字的隐形占位，
 * 撑出同样的高度，免得固定的那条盖住最后一张卡和“没有更早的了”。
 */
function BoardFooter({ text }: { text: string }) {
  return (
    <>
      <View className="board-footer board-footer--spacer">
        <Text>{text}</Text>
      </View>
      <View className="board-footer board-footer--fixed">
        <Text>{text}</Text>
      </View>
    </>
  );
}
