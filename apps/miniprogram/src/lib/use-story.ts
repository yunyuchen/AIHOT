// 事件页的 React hook：按板块请求 stories/{id}，核对形状；重试和下拉刷新重新请求，刷新期间和失败时已有的事件留着。不写本机快照。
import { useCallback, useEffect, useRef, useState } from "react";
import { malformedResponse } from "./errors";
import type { DrillTarget } from "./page-stack";
import { getJson } from "./request";
import { checkStory, storyPath, type StoryLoad } from "./story";

/** target 为 null（参数不对）时不请求，页面按 storyScreen 直接显示“已下线或不存在”。refresh 完成后 resolve（下拉刷新据此收起）。 */
export function useStory(target: DrillTarget | null): { load: StoryLoad; retry: () => void; refresh: () => Promise<void> } {
  const [load, setLoad] = useState<StoryLoad>({ phase: "loading", story: null, failure: null });
  const board = target?.board ?? null;
  const id = target?.id ?? null;
  // 每次请求加一；页面卸载、换了事件、被新一次请求顶掉以后，迟到的响应不再写进状态。
  const generation = useRef(0);

  const fetchStory = useCallback(async () => {
    if (board === null || id === null) return;
    const gen = ++generation.current;
    setLoad((current) => ({ ...current, phase: "loading", failure: null }));
    const result = await getJson<unknown>(board, storyPath(id));
    if (gen !== generation.current) return;
    if (!result.ok) return setLoad((current) => ({ ...current, phase: "failed", failure: result.failure }));
    const story = checkStory(result.data);
    setLoad((current) =>
      story ? { phase: "ready", story, failure: null } : { ...current, phase: "failed", failure: malformedResponse(result.status) },
    );
  }, [board, id]);

  useEffect(() => {
    setLoad({ phase: "loading", story: null, failure: null });
    void fetchStory();
    return () => {
      generation.current++;
    };
  }, [fetchStory]);

  return { load, retry: () => void fetchStory(), refresh: fetchStory };
}
