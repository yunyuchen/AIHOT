// “AI 摘要”角标：墨底白字，前面一颗星青小星（原型 A 版 .ai）。显示与否由调用方按接口的 ai 字段决定。
import { Image, View } from "@tarojs/components";
import star from "../../assets/star.png";
import "./index.scss";

export function AiBadge() {
  return (
    <View className="ai-badge">
      <Image className="ai-badge__star" src={star} />
      AI 摘要
    </View>
  );
}
