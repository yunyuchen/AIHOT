// 事件页：下钻页，原生导航栏（D33）放返回和“事件”。开下拉刷新（规格），背景和加载圆点沿用全局浅色主题。
// 事件页不单独分享：不定义 onShareAppMessage，右上角菜单里的转发是灰的。
export default definePageConfig({
  navigationBarTitleText: "事件",
  enablePullDownRefresh: true,
});
