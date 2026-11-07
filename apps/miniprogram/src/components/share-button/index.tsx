// “分享给同事”（条目页）、“分享日报”（日报 tab、某期日报页）：open-type 为 share 的按钮。点了由微信调页面的 onShareAppMessage
// （from 为 button），和右上角菜单是同一个回调（lib/use-share.ts），这里不管分享什么。样子由调用方的类名给，这里只去掉原生按钮的默认样式。
// 只写字、不带图标（墨底实心按钮，和收藏、提醒这两个描边按钮不同）。
import { Button } from "@tarojs/components";
import "./index.scss";

interface Props {
  label: string;
  /** 按钮的样子（条目页 item-btn、日报 daily-btn）。 */
  className: string;
  /** 不再使用（分享按钮不带图标了）。留成可选，还在传它的调用方照样编译得过。 */
  iconClassName?: string;
}

export function ShareButton({ label, className }: Props) {
  return (
    <Button className={`share-button ${className}`} hoverClass="share-button--down" openType="share">
      {label}
    </Button>
  );
}
