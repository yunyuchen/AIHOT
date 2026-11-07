// 栏头：钴蓝反白的小色块，从屏幕左缘印进来（出血），最短 72，和精选页刊头色块同宽；右边可以跟纸底的说明（日期、条数、“AI 摘要”）。
// plain：功能栏头（锐奇页的文档、反馈与侵权投诉、声明），纸底墨字，不用色块。钴蓝色块只给内容栏目。
// 放在没有左内边距的容器里（页面根或通栏的块），色块才能贴住屏幕左缘。
import type { ReactNode } from "react";
import { View } from "@tarojs/components";
import "./index.scss";

interface Props {
  label: string;
  /** 色块右边的内容；数组时依次排开、间隔 12。null、undefined、false、空字符串跳过；都没有时不画。 */
  aside?: ReactNode | ReactNode[];
  plain?: boolean;
}

export function HeadTab({ label, aside, plain = false }: Props) {
  if (plain) return <View className="head-tab head-tab--plain">{label}</View>;
  const items = (Array.isArray(aside) ? aside : [aside]).filter(
    (node) => node !== null && node !== undefined && node !== false && node !== "",
  );
  return (
    <View className="head-tab">
      <View className="head-tab__block">{label}</View>
      {items.length > 0 && (
        <View className="head-tab__aside">
          {items.map((node, i) => (
            <View key={i} className={i === 0 ? "head-tab__item" : "head-tab__item head-tab__item--next"}>
              {node}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
