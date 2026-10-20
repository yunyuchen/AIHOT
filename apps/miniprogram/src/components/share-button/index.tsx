// “分享给同事”（条目页）、“分享日报”（日报 tab、某期日报页）：open-type 为 share 的按钮。点了由微信调页面的 onShareAppMessage
// （from 为 button），和右上角菜单是同一个回调（lib/use-share.ts），这里不管分享什么。样子由调用方的类名给，这里只去掉原生按钮的默认样式。
import { Button, Image } from "@tarojs/components";
import shareIcon from "../../assets/item/share.png";
import "./index.scss";

interface Props {
  label: string;
  /** 按钮的样子（条目页 item-btn、日报 daily-btn），和原来画的 View 一样。 */
  className: string;
  iconClassName: string;
}

export function ShareButton({ label, className, iconClassName }: Props) {
  return (
    <Button className={`share-button ${className}`} hoverClass="share-button--down" openType="share">
      <Image className={iconClassName} src={shareIcon} />
      {label}
    </Button>
  );
}
