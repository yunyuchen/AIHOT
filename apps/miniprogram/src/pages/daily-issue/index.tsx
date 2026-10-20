// 某期日报页：下钻页，参数 date（北京日期 YYYY-MM-DD）和 board（可以不带，默认有日报的板块）。承接分享出去的日报、服务通知
// 和收藏里的日报；路由和参数名上线后不改。和日报 tab 共用 components/daily-issue，前一天、后一天同样页内切换。
// 不开下拉刷新，不写本机快照，没有“提醒我明天的日报”（规格：只在日报 tab）。日期不对和 404 都是“这一天没有日报”加“看最新一期”
// （切到日报 tab）。“分享日报”和右上角菜单走同一个分享回调，分享正在看的这一期（lib/share.ts 的 issueShare）；日期不对时转发小程序本身。
// 服务通知点开的就是这个页面（pages/daily-issue/index?board=manufacturing&date=…），这时栈里只有它，原生导航栏左上角是微信自带的
// 回首页按钮，一步回到精选（app.config 的第一个页面），不另画入口。
import { useEffect, useMemo } from "react";
import { useRouter } from "@tarojs/taro";
import type { BoardKey } from "../../../config/boards";
import { DailyIssue } from "../../components/daily-issue";
import { buildConfig } from "../../lib/build-config";
import { dailyScreen } from "../../lib/daily";
import { useBoardMeta } from "../../lib/meta-context";
import { switchToTab } from "../../lib/open-page";
import { homeTab, issueTarget } from "../../lib/page-stack";
import { appShare, issueShare } from "../../lib/share";
import { useDaily } from "../../lib/use-daily";
import { SHARE_BASIS, usePageShare, useShareImageProbe } from "../../lib/use-share";

const DAILY_BOARDS = buildConfig.boards.filter((b) => b.tabs.includes("daily")).map((b) => b.key);
const toLatest = () => switchToTab(homeTab("daily").url);

export default function DailyIssuePage() {
  const { params } = useRouter();
  const target = useMemo(() => issueTarget(params, DAILY_BOARDS), [params.board, params.date]);
  if (!target) return <NoIssue date={params.date ?? ""} />;
  return <Issue board={target.board} date={target.date} />;
}

/** 参数不对（日期不是日历上有的 YYYY-MM-DD、板块没有日报）：“这一天没有日报”，转发时转发小程序本身。 */
function NoIssue({ date }: { date: string }) {
  usePageShare(() => appShare(SHARE_BASIS));
  return (
    <DailyIssue
      screen={{ kind: "missing", latest: false }}
      board={DAILY_BOARDS[0] ?? "manufacturing"}
      fallbackTitle="日报"
      date={date}
      remind={false}
      onGo={() => {}}
      onRetry={() => {}}
      onLatest={toLatest}
    />
  );
}

function Issue({ board, date }: { board: BoardKey; date: string }) {
  const { state, reload } = useBoardMeta(board);
  const daily = useDaily(board, date, false);
  const screen = dailyScreen(state, daily.state);
  const meta = state.status === "ready" ? state.meta : null;
  useShareImageProbe(screen.kind === "content" ? screen.daily.share : null);
  usePageShare(() => issueShare(board, daily.state.date, screen, SHARE_BASIS));

  // 回了 section_paused：强制重拉一次元信息，拿到行业包的占位文案。
  const paused = daily.state.failure?.kind === "paused";
  useEffect(() => {
    if (paused) void reload();
  }, [paused]);

  const retry = () => {
    if (state.status !== "ready" || state.fetchedAt === null) void reload();
    void daily.refresh();
  };

  return (
    <DailyIssue
      screen={screen}
      board={board}
      fallbackTitle={meta?.board.siteName ?? "日报"}
      date={daily.state.date}
      remind={false}
      onGo={daily.go}
      onRetry={retry}
      onLatest={toLatest}
    />
  );
}
