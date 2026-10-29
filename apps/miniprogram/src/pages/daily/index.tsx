// 日报 tab：制造板块的最新一期，头部的前一天、后一天在页内切换（不开新页），下拉刷新。和某期日报页共用 components/daily-issue。
// 冷启动先显示本机快照（snap.v1.{board}.daily，只存最新一期）再刷新；整屏状态见 lib/daily.ts 的 dailyScreen，
// 失败、占位、快照时间、更新失败提示沿用精选 tab 的做法。头条卡的“提醒我明天的日报”只在这里有（模板 id 配了才画）。
// 右上角菜单按 D27 转发小程序本身（指向精选）；头条卡的“分享日报”分享正在看的这一期（指向某期日报页，最新一期也用它的日期）。
import { useEffect, useRef } from "react";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { DailyIssue } from "../../components/daily-issue";
import { dailyScreen } from "../../lib/daily";
import { useBoardMeta } from "../../lib/meta-context";
import { issueShare } from "../../lib/share";
import { useDaily } from "../../lib/use-daily";
import { SHARE_BASIS, useShareImageProbe, useTabShare } from "../../lib/use-share";
import { useActiveTab } from "../../lib/use-active-tab";

const BOARD = "manufacturing";

export default function DailyPage() {
  useActiveTab();
  const { state, reload, revalidate } = useBoardMeta(BOARD);
  const daily = useDaily(BOARD, null, true);
  const screen = dailyScreen(state, daily.state);
  const meta = state.status === "ready" ? state.meta : null;
  // 这次会话里拿到的元信息是占位（快照里的占位不会放进来）。占位期间切回只查元信息，不去请求日报。
  const metaPlaceholder = meta?.status === "placeholder";
  useShareImageProbe(screen.kind === "content" ? screen.daily.share : null);
  useTabShare(() => issueShare(BOARD, daily.state.date, screen, SHARE_BASIS));

  // 切回这个 tab：元信息按 60 秒规则检查（占位要尽快生效）；看的是最新一期并且上次的响应过了 60 秒就重拉，翻到往期时不动。
  useDidShow(() => {
    revalidate(null);
    if (!metaPlaceholder) daily.revalidate();
  });

  // 元信息从占位变回正常：日报重新加载（占位期间它停在 section_paused 或者没请求过）。
  const metaStatus = meta?.status ?? null;
  const lastMetaStatus = useRef(metaStatus);
  useEffect(() => {
    if (lastMetaStatus.current === "placeholder" && metaStatus === "normal") void daily.refresh();
    lastMetaStatus.current = metaStatus;
  }, [metaStatus, daily.refresh]);

  // 日报回了 section_paused：强制重拉一次元信息，拿到行业包的占位文案（精选 tab 也会跟着变成占位）。
  const paused = daily.state.failure?.kind === "paused";
  useEffect(() => {
    if (paused) void reload();
  }, [paused]);

  // 下拉刷新：强制重拉元信息和正在看的那一期，两个都回来再收起。失败时已有内容不清空，显示更新失败提示。
  usePullDownRefresh(() => {
    void Promise.all([reload(), daily.refresh()]).finally(() => Taro.stopPullDownRefresh());
  });

  // 重试（加载失败的按钮、顶部提示条）：失败了的、或者还只是快照的元信息强制重拉，再重拉正在看的那一期。
  const retry = () => {
    if (state.status !== "ready" || state.fetchedAt === null) void reload();
    void daily.refresh();
  };

  return (
    <DailyIssue
      screen={screen}
      board={BOARD}
      fallbackTitle={meta?.board.siteName ?? "日报"}
      date={daily.state.date}
      remind
      onGo={daily.go}
      onRetry={retry}
      onLatest={daily.latest}
    />
  );
}
