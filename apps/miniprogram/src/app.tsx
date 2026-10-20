import type { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";
import { MetaProvider } from "./lib/meta-context";
import { pruneReadMarks } from "./lib/use-read";
import "./app.scss";

// 新版本：微信冷启动时自己去查、自己下载，下载完提示读者重启。只加快旧版本退场，服务端照样保留旧契约。
// 读者点“稍后”时下次冷启动自然用上新版本；查不了、下载失败、弹窗失败都不打扰读者。
function checkForUpdate() {
  try {
    if (!Taro.canIUse("getUpdateManager")) return;
    const manager = Taro.getUpdateManager();
    manager.onUpdateReady(() => {
      Taro.showModal({ content: "有新版本，重启后生效", confirmText: "重启", cancelText: "稍后" })
        .then((res) => {
          if (res.confirm) manager.applyUpdate();
        })
        .catch(() => {});
    });
    manager.onUpdateFailed(() => {});
  } catch {
    // 基础库太旧或接口不可用：静默。
  }
}

// children 是当前要渲染的页面。
export default function App({ children }: PropsWithChildren) {
  useLaunch(checkForUpdate);
  // 已读只留 30 天、每个板块最多 1000 条：启动时删一次。
  useLaunch(pruneReadMarks);
  return <MetaProvider>{children}</MetaProvider>;
}
