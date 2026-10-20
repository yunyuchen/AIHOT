// 打开下钻页和回 tab：接上 Taro 的跳转。跳转方式的规则（页面栈到 9 层以后用 redirectTo）在 page-stack.ts。
import Taro from "@tarojs/taro";
import { navigation } from "./page-stack";

/** 连点两下（第一次跳转还没完成）只开一次。 */
const TAP_GUARD_MS = 600;
let lastOpenAt = 0;

/** 打开下钻页：栈里不到 9 层用 navigateTo，到了用 redirectTo 替换当前页。跳转失败静默。 */
export function openPage(url: string): void {
  const now = Date.now();
  if (now - lastOpenAt < TAP_GUARD_MS) return;
  lastOpenAt = now;
  const go = navigation(Taro.getCurrentPages().length) === "redirectTo" ? Taro.redirectTo : Taro.navigateTo;
  void go({ url }).catch(() => {});
}

/** 回到某个 tab（关掉上面所有下钻页）。 */
export function switchToTab(url: string): void {
  void Taro.switchTab({ url }).catch(() => {});
}
