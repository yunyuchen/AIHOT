// 日报的 React hook：把 daily.ts 的翻期和刷新状态接到 getJson 和本机快照上。日报 tab 和某期日报页共用。
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardKey } from "../../config/boards";
import type { MiniprogramDaily } from "@aihot/contracts/miniprogram";
import { checkDaily, createDailyStore, dailyPath, seedDaily, type DailySnapshot, type DailyState, type DailyStore } from "./daily";
import { malformedResponse } from "./errors";
import { getJson, type Result } from "./request";
import { readSnapshot, removeSnapshot, writeSnapshot } from "./storage";
import { storage } from "./wx-storage";

async function fetchDaily(board: BoardKey, date: string | null): Promise<Result<MiniprogramDaily>> {
  const result = await getJson<unknown>(board, dailyPath(date));
  if (!result.ok) return result;
  const daily = checkDaily(result.data);
  return daily ? { ok: true, data: daily, status: result.status } : { ok: false, failure: malformedResponse(result.status) };
}

/** 最新一期的本机快照 snap.v1.{board}.daily。 */
function dailySnapshot(board: BoardKey): DailySnapshot {
  return {
    initial: readSnapshot(storage, board, "daily", checkDaily)?.data ?? null,
    save: (daily) => void writeSnapshot(storage, board, "daily", daily, Date.now()),
    drop: () => void removeSnapshot(storage, board, "daily"),
  };
}

/**
 * 某个板块的日报。date 为 null 是最新一期（日报 tab），否则是那一期（某期日报页）；board 为 null（页面参数不对）时不请求。
 * withSnapshot：最新一期先放本机快照、成功后写回（只有日报 tab 传）。挂载时先放快照，再请求。
 */
export function useDaily(board: BoardKey | null, date: string | null, withSnapshot: boolean) {
  // 第一次渲染就带上快照，不先闪一下“加载中”。
  const [state, setState] = useState<DailyState>(() =>
    seedDaily(date, board && withSnapshot && date === null ? dailySnapshot(board).initial : null),
  );
  const store = useRef<DailyStore | null>(null);

  useEffect(() => {
    if (board === null) return;
    // 换了板块或日期时，旧的迟到响应不再写进状态。
    let active = true;
    const onChange = (next: DailyState) => {
      if (active) setState(next);
    };
    const current = createDailyStore((d) => fetchDaily(board, d), date, onChange, Date.now, withSnapshot ? dailySnapshot(board) : null);
    store.current = current;
    void current.refresh();
    return () => {
      active = false;
    };
  }, [board, date, withSnapshot]);

  const refresh = useCallback(() => store.current?.refresh() ?? Promise.resolve(), []);
  const go = useCallback((target: string) => void store.current?.go(target), []);
  const latest = useCallback(() => void store.current?.latest(), []);
  const revalidate = useCallback(() => void store.current?.revalidate(), []);
  return { state, refresh, go, latest, revalidate };
}
