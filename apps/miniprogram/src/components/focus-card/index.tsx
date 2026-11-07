// 今日焦点（只在制造板块，只由接口给出）。上半截 FocusHead 放在刊头右栏底部：钴蓝“今日焦点”、分类和“AI 摘要”（行尾，即右上角）、
// 焦点标题（最多 4 行，色块跟着标题长高）。下半截 FocusCard 在色块下面通栏：摘要（截 4 行，全文在条目页）、来源名（按首报先后）、
// 来源数（≥ 2 才有）和最新报道时刻两个读数、墨底“读摘要”（打开真实条目）。不出名次和热度，不硬配产品图。
import { Text, View } from "@tarojs/components";
import type { MiniprogramFocus } from "@aihot/contracts/miniprogram";
import { Reading } from "../reading";
import { stampParts } from "../reading/derive";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import { categoryChip, focusFoot, showAiBadge } from "../../lib/card";
import "./index.scss";

interface HeadProps {
  focus: MiniprogramFocus;
  /** 分类 key → 分类名，来自元信息。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 方块颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
}

export function FocusHead({ focus, labels, colors }: HeadProps) {
  const chip = categoryChip(focus.category, labels, colors);
  const ai = showAiBadge(focus.ai);
  return (
    <View className="focus-head">
      <Text className="focus-head__kicker">今日焦点</Text>
      {(chip || ai) && (
        <View className="focus-head__meta">
          {chip && <CategoryTag chip={chip} />}
          <View className="focus-head__gap" />
          {ai && <AiBadge />}
        </View>
      )}
      <View className="focus-head__title">{focus.title}</View>
    </View>
  );
}

export function FocusCard({ focus, onOpen }: { focus: MiniprogramFocus; onOpen: (id: string) => void }) {
  const foot = focusFoot(focus);
  const latest = stampParts(focus.latestAt, Date.now());
  return (
    <View className="focus-card">
      {focus.summary && <View className="focus-card__summary">{focus.summary}</View>}
      <View className="focus-card__sources">{foot.sources}</View>
      <View className="focus-card__bar">
        {foot.echo && (
          <View className="focus-card__reading">
            <Reading value={foot.echo.count} after="家来源" size="l" />
          </View>
        )}
        {latest && (
          <View className="focus-card__reading">
            <Reading value={latest.clock} before={latest.day ? `最新 ${latest.day}` : "最新"} size="l" />
          </View>
        )}
        <View className="focus-card__read" hoverClass="focus-card__read--down" onClick={() => onOpen(focus.id)} ariaRole="button" ariaLabel={`阅读摘要：${focus.title}`}>
          读摘要
        </View>
      </View>
    </View>
  );
}
