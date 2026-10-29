// 今日焦点只由接口给出，摘要入口打开真实条目。
import { Text, View } from "@tarojs/components";
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
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
    <View className="focus-card">
      <View className="focus-card__row">
        <View className="focus-card__flag">
          今日焦点
        </View>
        {chip && <CategoryTag chip={chip} />}
        <View className="focus-card__gap" />
        {showAiBadge(focus.ai) && <AiBadge />}
      </View>
      <View className="focus-card__title">{focus.title}</View>
      {focus.summary && <View className="focus-card__summary">{focus.summary}</View>}
      <View className="focus-card__actions">
        <View className="focus-card__read" hoverClass="focus-card__read--down" onClick={() => onOpen(focus.id)} ariaRole="button" ariaLabel={`阅读摘要：${focus.title}`}>
          <Text>读摘要</Text><Text className="focus-card__arrow">↗</Text>
        </View>
        {foot.echo && <View className="focus-card__echo"><Text className="focus-card__count num">{foot.echo.count}</Text><Text className="focus-card__label-text">家来源</Text></View>}
      </View>
      <View className="focus-card__sources">{foot.sources}{foot.latest && ` · ${foot.latest.clock} ${foot.latest.day}`}</View>
    </View>
  );
}
