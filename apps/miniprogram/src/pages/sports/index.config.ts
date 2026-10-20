// 运动健康 tab。下拉刷新：下拉露出的区域是墨色，和深色头部接上，加载圆点用浅色（同精选 tab）。
// 右上角转发小程序本身（D27：指向精选，lib/use-share.ts 的 useTabShare）；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "运动健康",
  enablePullDownRefresh: true,
  backgroundColor: "#13191c",
  backgroundColorTop: "#13191c",
  backgroundColorBottom: "#f2f3f5",
  backgroundTextStyle: "light",
  enableShareAppMessage: true,
});
