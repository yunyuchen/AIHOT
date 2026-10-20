// 分类色标：浅底、小圆点、墨色字（原型 A 版 .cat）。精选卡片、焦点卡、条目页共用；名字和颜色由 lib/card.ts 的 categoryChip 算好。
import { View } from "@tarojs/components";
import type { CategoryChip } from "../../lib/card";
import "./index.scss";

export function CategoryTag({ chip }: { chip: CategoryChip }) {
  return (
    <View className="category-tag" style={{ background: chip.tint }}>
      <View className="category-tag__dot" style={{ background: chip.color }} />
      {chip.label}
    </View>
  );
}
