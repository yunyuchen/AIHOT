// 分类名与色点由接口分类及构建配置给出，保持同一阅读层级。
import { View } from "@tarojs/components";
import type { CategoryChip } from "../../lib/card";
import "./index.scss";

export function CategoryTag({ chip }: { chip: CategoryChip }) {
  return (
    <View className="category-tag">
      <View className="category-tag__dot" style={{ background: chip.color }} />
      {chip.label}
    </View>
  );
}
