// 两个板块的元信息放在一个 React context 里，各页面按板块取。状态和请求规则（60 秒节流、快照、占位时删内容快照、板块之间互不牵连）
// 在 meta-store.ts，这里只把它接到 getJson、微信存储和 React 状态上。
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { BoardKey } from "../../config/boards";
import { buildConfig } from "./build-config";
import { createMetaStore, type LoadOptions, type MetaStates } from "./meta-store";
import type { MetaState } from "./meta";
import { getJson } from "./request";
import { storage } from "./wx-storage";

export type { MetaState } from "./meta";

type Load = (board: BoardKey, options?: LoadOptions) => Promise<void>;

const MetaContext = createContext<{ states: MetaStates; load: Load } | null>(null);

export function MetaProvider({ children }: PropsWithChildren) {
  const [store] = useState(() =>
    createMetaStore(
      buildConfig.boards.map((b) => b.key),
      (board) => getJson<unknown>(board, "meta"),
      storage,
    ),
  );
  const [states, setStates] = useState(store.states);
  // React 先跑子组件的 effect：页面挂载时发出的请求可能在这里订阅之前就改了状态，订阅时先补上。
  useEffect(() => {
    setStates(store.states());
    return store.subscribe(setStates);
  }, [store]);

  return <MetaContext.Provider value={{ states, load: store.load }}>{children}</MetaContext.Provider>;
}

/**
 * 取某个板块的元信息，首次挂载时请求。reload 强制重拉（重试、下拉刷新、离开太久切回），完成后 resolve；
 * revalidate 不强制（切回页面时），传同一板块精选流上次响应的 refreshAt。
 */
export function useBoardMeta(board: BoardKey): {
  state: MetaState;
  reload: () => Promise<void>;
  revalidate: (refreshAt: string | null) => void;
} {
  const context = useContext(MetaContext);
  if (!context) throw new Error("useBoardMeta 要在 MetaProvider 里面用");
  const { states, load } = context;
  useEffect(() => void load(board), [board, load]);
  return {
    state: states[board] ?? { status: "loading" },
    reload: () => load(board, { force: true }),
    revalidate: (refreshAt) => void load(board, { refreshAt }),
  };
}

/**
 * 各板块现在内存里的元信息（这次会话拿到的，或冷启动放进来的正常快照），不发请求。
 * 收藏 tab 据此判断要不要先隐藏某个板块的收藏（票 17），规格要求不为此请求。
 */
export function useMetaStates(): MetaStates {
  const context = useContext(MetaContext);
  if (!context) throw new Error("useMetaStates 要在 MetaProvider 里面用");
  return context.states;
}
