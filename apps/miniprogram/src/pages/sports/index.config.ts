// 右上角转发小程序本身（D27：指向精选，lib/use-share.ts 的 useTabShare）；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "运动健康",
  enablePullDownRefresh: true,
  enableShareAppMessage: true,
});
