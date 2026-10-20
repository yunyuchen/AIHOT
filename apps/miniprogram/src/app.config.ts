// 颜色和 src/styles/tokens.scss 一致：原生导航栏墨色底白字（D33）；不开 darkmode，微信切深色时保持浅色（D29）。
// 页面和 tabBar 都按构建期配置的板块列表推出来（lib/tabs.ts 的 appPages、appTabs），不在这里手写：
// 备用构建（--mode prod-no-sports）去掉运动健康板块时，运动健康 tab 和它的页面一起少掉，只剩四个 tab。
// 这个文件只在构建时求值，BUILD_CONFIG 由 config/index.ts 的 defineConstants 注入。
import { appPages, appTabs } from "./lib/tabs";

export default defineAppConfig({
  pages: appPages(BUILD_CONFIG.boards),
  window: {
    navigationBarBackgroundColor: "#13191c",
    navigationBarTextStyle: "white",
    navigationBarTitleText: "锐奇热点",
    backgroundColor: "#f2f3f5",
    backgroundColorTop: "#13191c",
    backgroundColorBottom: "#f2f3f5",
    backgroundTextStyle: "light",
  },
  tabBar: {
    color: "#6b757e",
    selectedColor: "#13191c",
    backgroundColor: "#ffffff",
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
