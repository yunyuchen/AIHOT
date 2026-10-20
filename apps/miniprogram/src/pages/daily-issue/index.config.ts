// 某期日报页：下钻页，原生导航栏（D33）放返回和“日报”；从分享卡片或服务通知直接进来（栈底不是首页）时，微信自己把左上角换成
// 回首页按钮，回到精选。不开下拉刷新（规格）。顶部回弹露出墨色，和导航栏、下面的墨色头部接上。
// 能转发给好友和群（“分享日报”和右上角菜单，lib/use-share.ts）；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "日报",
  enableShareAppMessage: true,
  backgroundColorTop: "#13191c",
  backgroundColorBottom: "#f2f3f5",
});
