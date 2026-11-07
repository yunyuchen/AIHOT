// 事件页：下钻页，参数 board（请求哪个行业实例）和 id，从条目页的事件入口进入。两个板块共用。
// 原生导航栏放返回和“事件”。读数行（来源数、首报、最新）、标题（按 ai.title 标），“事件综述”（按 ai.digest 标，没有综述整块不显示），
// 下面“谁在报，怎么说”按发布时间列出报道，首报、最新写在来源名后面；有条目页的报道点进条目页。不分享。
// 合并过的事件接口直接回存活的那个（id 和请求的不同），照常显示，不跳转。整屏状态见 lib/story.ts。不写本机快照。
import { useMemo } from "react";
import Taro, { usePullDownRefresh, useRouter } from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import { HeadTab } from "../../components/head-tab";
import { Reading } from "../../components/reading";
import { AiBadge } from "../../components/ai-badge";
import { MissingState, PausedState } from "../../components/drill-state";
import { failureText, PageState, StaleNotice } from "../../components/page-state";
import { sourceTotal } from "../../components/reading/derive";
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
      {screen.kind === "loading" && <Text className="story__status">加载中…</Text>}
      {screen.kind === "missing" && <MissingState board={target?.board ?? null} />}
      {screen.kind === "placeholder" && <PausedState board={target!.board} />}
      {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={retry} />}
    </View>
  );
}

interface ContentProps {
  board: BoardKey;
  story: MiniprogramStory;
  /** 下拉刷新失败：事件综述下面显示更新失败提示，可点击重试。 */
  stale: boolean;
  onRetry: () => void;
}

function StoryContent({ board, story, stale, onRetry }: ContentProps) {
  const now = Date.now();
  const view = storyView(story, now);
  return (
    <View className="story">
      <View className="story-head">
        <View className="story-head__readings">
          <View className="story-head__reading">
            <Reading value={sourceTotal(story.sourceCount)} after="家来源" size="m" />
          </View>
          {view.first && (
            <View className="story-head__reading">
              <Reading before="首报" value={view.first} size="s" />
            </View>
          )}
          {view.latest && (
            <View className="story-head__reading">
              <Reading before="最新" value={view.latest} size="s" />
            </View>
          )}
        </View>
        <View className="story-head__title">
          <Text userSelect>{story.title}</Text>
          {view.titleAi && (
            <View className="story-head__ai">
              <AiBadge />
            </View>
          )}
        </View>
      </View>

      {view.digest && (
        <View className="story-block">
          <HeadTab label="事件综述" aside={view.digest.ai ? <AiBadge /> : null} />
          <View className="story-block__body">
            <Text className="story-block__text" userSelect>
              {view.digest.text}
            </Text>
          </View>
        </View>
      )}

      {stale && <StaleNotice text={staleNotice(story.generatedAt, now)} onRetry={onRetry} />}

      <View className="story-block">
        <HeadTab label="谁在报，怎么说" aside={[view.reportsAi && <AiBadge />, "按发布时间"]} />
        <View className="story-reports">
          {view.reports.map((report) => {
            const itemId = report.itemId;
            return (
              <View
                key={report.key}
                className="story-rp"
                hoverClass={itemId ? "story-rp--down" : "none"}
                onClick={itemId ? () => openPage(itemPage(board, itemId)) : undefined}
              >
                <View className="story-rp__meta">
                  <Text className="story-rp__source">{report.source}</Text>
                  {report.tag && <Text className="story-rp__tag">{report.tag}</Text>}
                  <Text className="story-rp__date">{report.date}</Text>
                </View>
                <Text className={itemId ? "story-rp__title" : "story-rp__title story-rp__title--plain"}>{report.title}</Text>
              </View>
            );
          })}
          <Text className="story-grow">有后续进展时，这一页会接着往下长</Text>
        </View>
      </View>
    </View>
  );
}
