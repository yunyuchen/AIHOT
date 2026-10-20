// 条目页：下钻页，原生导航栏（D33）放返回和短标题；从分享卡片直接进来（栈底不是首页）时，微信自己把左上角换成回首页按钮，回到精选。
// 不开下拉刷新。顶部回弹露出墨色，和导航栏、下面的墨色条接上。
// 能转发给好友和群（“分享给同事”和右上角菜单，lib/use-share.ts）；不开朋友圈分享。
export default definePageConfig({
  navigationBarTitleText: "条目详情",
  enableShareAppMessage: true,
  backgroundColorTop: "#13191c",
  backgroundColorBottom: "#f2f3f5",
});
