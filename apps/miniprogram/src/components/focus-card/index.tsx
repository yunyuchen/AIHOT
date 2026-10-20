// 今日焦点卡：压在深色头部下沿的白卡（原型 A 版 .focus）。“今日焦点”星青底标、分类、大标题、两行摘要；
// 底栏是大号“N 家在报”（N 用 sourceNames 的个数）、来源名列表、右侧最新一篇报道的“HH:mm”和“MM-DD 最新”。点击进条目页。
// 只出一张，不显示名次和热度。画不画由页面按 lib/feed-screen.ts 的 visibleFocus 决定。
import { Image, Text, View } from "@tarojs/components";
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
import starInk from "../../assets/star-ink.png";
import { categoryChip, focusFoot, showAiBadge } from "../../lib/card";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import "./index.scss";

interface Props {
  focus: MiniprogramFocus;
  /** 分类 key → 分类名，来自元信息。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 色标颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
  onOpen: (id: string) => void;
}

export function FocusCard({ focus, labels, colors, onOpen }: Props) {
  const chip = categoryChip(focus.category, labels, colors);
  const foot = focusFoot(focus);
  return (
    <View className="focus-card" hoverClass="focus-card--down" onClick={() => onOpen(focus.id)}>
      <View className="focus-card__row">
        <View className="focus-card__flag">
          <Image className="focus-card__flag-star" src={starInk} />
          今日焦点
        </View>
        {chip && <CategoryTag chip={chip} />}
        <View className="focus-card__gap" />
        {showAiBadge(focus.ai) && <AiBadge />}
      </View>
      <View className="focus-card__title">{focus.title}</View>
      {focus.summary && <View className="focus-card__summary">{focus.summary}</View>}
      <View className="focus-card__foot">
        {foot.echo && (
          <View className="focus-card__echo">
            <Text className="focus-card__count num">{foot.echo.count}</Text>
            <View className="focus-card__label">
              <Text className="focus-card__label-text">家在报</Text>
              <View className="focus-card__bars">
                {Array.from({ length: foot.echo.dots }, (_, i) => (
                  <View key={i} className="focus-card__bar" />
                ))}
              </View>
            </View>
          </View>
        )}
        <View className="focus-card__sources">{foot.sources}</View>
        {foot.latest && (
          <View className="focus-card__when num">
            <Text className="focus-card__clock">{foot.latest.clock}</Text>
            <Text className="focus-card__day">{foot.latest.day}</Text>
          </View>
        )}
      </View>
    </View>
  );
}
