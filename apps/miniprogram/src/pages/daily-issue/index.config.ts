// 某期日报页：下钻页，原生导航栏保留返回，标题沿用全局小程序名；从分享卡片或服务通知直接进来（栈底不是首页）时，微信自己把左上角换成
// 回首页按钮，回到精选。不开下拉刷新（规格）。回弹背景沿用全局浅色主题。
// 能转发给好友和群（“分享日报”和右上角菜单，lib/use-share.ts）；不开朋友圈分享。
export default definePageConfig({
  enableShareAppMessage: true,
});
