// 事件页：下钻页，参数 board（请求哪个行业实例）和 id，从条目页的事件入口进入。两个板块共用。
// 原生导航栏放返回和“事件”，下面一条墨色，事件卡压在它下沿：来源数量、首报和最新时间、标题（按 ai.title 标）、
// “事件综述”（按 ai.digest 标，没有综述整块不显示）；下面按时间展示报道，首报、最新各有标记，
// 有条目页的报道点进条目页。事件更新后，这一页会接着显示新内容。不分享。
// 合并过的事件接口直接回存活的那个（id 和请求的不同），照常显示，不跳转。整屏状态见 lib/story.ts。不写本机快照。
import { useMemo } from "react";
import Taro, { usePullDownRefresh, useRouter } from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import { AiBadge } from "../../components/ai-badge";
import { MissingState, PausedState } from "../../components/drill-state";
import { failureText, PageState, StaleNotice } from "../../components/page-state";
import { buildConfig } from "../../lib/build-config";
import { openPage } from "../../lib/open-page";
import { drillTarget, itemPage } from "../../lib/page-stack";
import { staleNotice } from "../../lib/screen";
import { storyScreen, storyView } from "../../lib/story";
import { useStory } from "../../lib/use-story";
import type { MiniprogramStory } from "@aihot/contracts/miniprogram";
import "./index.scss";

export default function StoryPage() {
  const { params } = useRouter();
  const target = useMemo(
    () => drillTarget(params, buildConfig.boards.map((b) => b.key)),
    [params.board, params.id],
  );
  const { load, retry, refresh } = useStory(target);
  const screen = storyScreen(target, load);

  // 下拉刷新：重拉这个事件，回来再收起。失败时已有内容不清空，显示更新失败提示。
  usePullDownRefresh(() => {
    void refresh().finally(() => Taro.stopPullDownRefresh());
  });

  if (screen.kind === "content") return <StoryContent board={target!.board} story={screen.story} stale={screen.stale !== null} onRetry={retry} />;
  return (
    <View className="story">
      <View className="story-top" />
      {screen.kind === "loading" && (
        <View className="story-card">
          <Text className="story-card__status">加载中…</Text>
        </View>
      )}
      {screen.kind !== "loading" && (
        <View className="story-state">
          {screen.kind === "missing" && <MissingState board={target?.board ?? null} />}
          {screen.kind === "placeholder" && <PausedState board={target!.board} />}
          {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
        </View>
      )}
    </View>
  );
}

interface ContentProps {
  board: BoardKey;
  story: MiniprogramStory;
  /** 下拉刷新失败：顶部显示更新失败提示，可点击重试。 */
  stale: boolean;
  onRetry: () => void;
}

function StoryContent({ board, story, stale, onRetry }: ContentProps) {
  const now = Date.now();
  const view = storyView(story, now);
  return (
    <View className="story">
      <View className="story-top" />
      <View className="story-card">
        <View className="story-card__span num">
          <View className="story-echo">
            <View className="story-echo__bars">
              {Array.from({ length: view.echo.dots }, (_, i) => (
                <View key={i} className="story-echo__bar" />
              ))}
            </View>
            {view.echo.label}
          </View>
          {view.first && <Fact label="首报" value={view.first} lead />}
          {view.latest && <Fact label="最新" value={view.latest} lead={!view.first} />}
        </View>
        <View className="story-card__title">
          <Text userSelect>{story.title}</Text>
          {view.titleAi && (
            <View className="story-card__ai">
              <AiBadge />
            </View>
          )}
        </View>
        {view.digest && (
          <View className="story-brief">
            <View className="story-row">
              <Text className="story-brief__title">事件综述</Text>
              {view.digest.ai && (
                <View className="story-row__badge">
                  <AiBadge />
                </View>
              )}
            </View>
            <Text className="story-brief__text" userSelect>
              {view.digest.text}
            </Text>
          </View>
        )}
      </View>

      {stale && <StaleNotice text={staleNotice(story.generatedAt, now)} onRetry={onRetry} />}

      <View className="story-reports">
        <View className="story-row">
          <Text className="story-reports__title">谁在报，怎么说</Text>
          {view.reportsAi && (
            <View className="story-row__badge">
              <AiBadge />
            </View>
          )}
          <View className="story-row__gap" />
          <Text className="story-reports__order">按发布时间</Text>
        </View>
        <View className="story-tl">
          {view.reports.map((report) => {
            const itemId = report.itemId;
            return (
              <View
                key={report.key}
                className={report.latest ? "story-rp story-rp--latest" : "story-rp"}
                hoverClass={itemId ? "story-rp--down" : "none"}
                onClick={itemId ? () => openPage(itemPage(board, itemId)) : undefined}
              >
                <View className="story-rp__dot" />
                <View className="story-rp__meta">
                  <Text className="story-rp__source">{report.source}</Text>
                  {report.tag && <Text className="story-rp__tag">{report.tag}</Text>}
                  <View className="story-row__gap" />
                  <Text className="story-rp__date num">{report.date}</Text>
                </View>
                <Text className={itemId ? "story-rp__title" : "story-rp__title story-rp__title--plain"}>{report.title}</Text>
              </View>
            );
          })}
          <View className="story-grow">
            <View className="story-grow__ring" />
            <Text className="story-grow__text">有后续进展时，这一页会接着往下长</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** 头部一格（首报、最新）。lead：紧跟来源数量的第一格，不画竖线。 */
function Fact({ label, value, lead }: { label: string; value: string; lead?: boolean }) {
  return (
    <View className={lead ? "story-fact story-fact--lead" : "story-fact"}>
      <Text className="story-fact__k">{label}</Text>
      <Text className="story-fact__v">{value}</Text>
    </View>
  );
}
