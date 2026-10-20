// 日报 tab。下拉刷新：下拉露出的区域是墨色，和墨色头部接上，加载圆点用浅色（同精选 tab）。
// 右上角转发（D27）和“分享日报”按钮，见 lib/use-share.ts 的 useTabShare；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "日报",
  enableShareAppMessage: true,
  enablePullDownRefresh: true,
  backgroundColor: "#13191c",
  backgroundColorTop: "#13191c",
  backgroundColorBottom: "#f2f3f5",
  backgroundTextStyle: "light",
});
