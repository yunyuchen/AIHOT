// 所有页面统一用新闻纸底（#e9e9e3，tokens 的 $paper）、黑字的原生导航栏，和页面同一张纸；右上角胶囊和“回首页”按钮跟着 black 自动变成深色。
// 不开 darkmode，微信深色模式下仍保持设计配色。
// 页面和 tabBar 都按构建期配置的板块列表推出来（lib/tabs.ts 的 appPages、appTabs），不在这里手写：
// 备用构建（--mode prod-no-sports）去掉运动健康板块时，运动健康 tab 和它的页面一起少掉，只剩四个 tab。
// 这个文件只在构建时求值，BUILD_CONFIG 由 config/index.ts 的 defineConstants 注入。
import { appPages, appTabs } from "./lib/tabs";

export default defineAppConfig({
  pages: appPages(BUILD_CONFIG.boards),
  window: {
    navigationBarBackgroundColor: "#e9e9e3",
    navigationBarTextStyle: "black",
    navigationBarTitleText: "锐奇微报",
    backgroundColor: "#e9e9e3",
    backgroundColorTop: "#e9e9e3",
    backgroundColorBottom: "#e9e9e3",
    backgroundTextStyle: "dark",
  },
  tabBar: {
    custom: true,
    color: "#5c5c55",
    selectedColor: "#1b1b19",
    backgroundColor: "#e9e9e3",
    borderStyle: "black",
    list: appTabs(BUILD_CONFIG.boards).map((tab) => ({
      pagePath: tab.pagePath,
      text: tab.text,
      iconPath: `assets/tab/${tab.key}.png`,
      selectedIconPath: `assets/tab/${tab.key}-on.png`,
    })),
  },
  // 和 src/lib/request.ts 的 REQUEST_TIMEOUT_MS 一致。
  networkTimeout: { request: 10000 },
  darkmode: false,
});
