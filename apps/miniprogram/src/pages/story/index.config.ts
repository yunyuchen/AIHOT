// 事件页：下钻页，原生导航栏（D33）放返回和“事件”。开下拉刷新（规格），下拉露出墨色、浅色加载圆点，和导航栏、下面的墨色条接上。
// 事件页不单独分享：不定义 onShareAppMessage，右上角菜单里的转发是灰的。
export default definePageConfig({
  navigationBarTitleText: "事件",
  enablePullDownRefresh: true,
  backgroundColor: "#13191c",
  backgroundColorTop: "#13191c",
  backgroundColorBottom: "#f2f3f5",
  backgroundTextStyle: "light",
});
