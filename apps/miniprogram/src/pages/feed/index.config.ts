// 右上角转发小程序本身（D27：指向精选，lib/use-share.ts 的 useTabShare）；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "精选",
  backgroundColorTop: "#151f21",
  backgroundTextStyle: "light",
  enableShareAppMessage: true,
  enablePullDownRefresh: true,
});
