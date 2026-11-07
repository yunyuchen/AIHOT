// 精选流：今天按凌晨、上午、下午、晚间分段，往日按天（运动健康一律按天，lib/timeline.ts）。段头是钴蓝栏头：今天的段只写段名
// （日期在刊头里），往日的段右边带日期和星期（由段的日期推出来，不读日报）。制造的卡片左边是索引栏（北京时刻，钴蓝 DIN Condensed），
// 运动健康不显示时刻、内容占满页宽。卡与卡之间只留空，不要底色、阴影和分隔线。同一事件只显示一张卡，来源数在卡片底部。
import { Text, View } from "@tarojs/components";
import type { MiniprogramCard, MiniprogramHotline } from "@aihot/contracts/miniprogram";
import { HeadTab } from "../head-tab";
import { Reading } from "../reading";
import { clockOf, sectionDate } from "../reading/derive";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import { Hotline } from "../hotline";
import { hotlineFor } from "../../lib/board-feed";
import { categoryChip, showAiBadge, sourceCountChip } from "../../lib/card";
import { withoutFocus, type FeedState } from "../../lib/feed";
import { timelineSections, type TimelineSection } from "../../lib/timeline";
import "./index.scss";

interface Props {
  /** read：这个板块已读的条目 id（use-feed.ts 带上）；没带时都当没读。 */
  state: FeedState & { read?: ReadonlySet<string> };
  /** 分类 key → 分类名，来自元信息；还没拿到时为空表。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 方块颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
  /** 正在显示的焦点的 id：列表里去掉这张。没画焦点时为 null。 */
  focusId: string | null;
  /** 点卡片：打开条目页。 */
  onOpen: (id: string) => void;
  /** 续页失败时点“重试”。 */
  onRetry: () => void;
  /** 按天看的板块（构建配置的 byDay）：一律按天分段，卡片不显示时刻。 */
  byDay?: boolean;
  /** 元信息的 notice.hotline：它指定的分类，卡片上显示热线。 */
  hotline?: MiniprogramHotline | null;
}

export function FeedList({ state, labels, colors, focusId, onOpen, onRetry, byDay = false, hotline = null }: Props) {
  const now = Date.now();
  // 还没有卡片：页面在加载中时才渲染这里，空态和失败页面自己显示。
  if (state.cards.length === 0) return <Text className="feed-list__status">加载中…</Text>;
  const cards = withoutFocus(state.cards, focusId);
  // 已加载的卡只有焦点那一张：不画段，只留底部状态。
  if (cards.length === 0) return <Footer state={state} onRetry={onRetry} byDay={byDay} />;
  return (
    <View className="feed-list">
      {timelineSections(cards, now, byDay).map((section) => (
        <Period
          key={section.key}
          section={section}
          now={now}
          labels={labels}
          colors={colors}
          read={state.read}
          onOpen={onOpen}
          showTime={!byDay}
          hotline={hotline}
        />
      ))}
      <Footer state={state} onRetry={onRetry} byDay={byDay} />
    </View>
  );
}

interface PeriodProps {
  section: TimelineSection;
  now: number;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  read: ReadonlySet<string> | undefined;
  onOpen: (id: string) => void;
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Period({ section, now, labels, colors, read, onOpen, showTime, hotline }: PeriodProps) {
  const date = sectionDate(section.key, section.title, now);
  return (
    <View className="feed-period">
      <HeadTab label={section.title} aside={date} />
      <View className="feed-period__cards">
        {section.cards.map((card) => (
          <Card
            key={card.id}
            card={card}
            labels={labels}
            colors={colors}
            read={read?.has(card.id) ?? false}
            onOpen={onOpen}
            showTime={showTime}
            hotline={hotline}
          />
        ))}
      </View>
    </View>
  );
}

/** 列表底部：加载中、续页失败重试、没有更早的了。制造对齐内容栏（x=88），运动健康对齐页边。 */
function Footer({ state, onRetry, byDay }: { state: FeedState; onRetry: () => void; byDay: boolean }) {
  const className = byDay ? "feed-list__status" : "feed-list__status feed-list__status--indent";
  if (state.phase === "loading" || state.more === "loading") return <Text className={className}>加载中…</Text>;
  if (state.phase === "failed" || state.more === "failed") {
    return (
      <View className={`${className} feed-list__status--retry`} hoverClass="feed-list__status--down" ariaRole="button" onClick={onRetry}>
        加载失败，点击重试
      </View>
    );
  }
  if (!state.hasMore) return <Text className={className}>没有更早的了</Text>;
  return null;
}

interface CardProps {
  card: MiniprogramCard;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  /** 打开过条目页：标题改用正文色（D25）。 */
  read: boolean;
  onOpen: (id: string) => void;
  /** 索引栏的时刻（anchorAt 的北京时刻）；按天看的板块不显示。 */
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Card({ card, labels, colors, read, onOpen, showTime, hotline }: CardProps) {
  const chip = categoryChip(card.category, labels, colors);
  const echo = sourceCountChip(card.sourceCount);
  const help = hotlineFor(card.category, hotline);
  const ai = showAiBadge(card.ai);
  return (
    <View className="feed-entry" hoverClass="feed-entry--down" onClick={() => onOpen(card.id)}>
      {showTime && <Text className="feed-entry__time num">{clockOf(card.anchorAt)}</Text>}
      <View className="feed-entry__main">
        {(chip || ai) && (
          <View className="feed-entry__meta">
            {chip && <CategoryTag chip={chip} />}
            <View className="feed-entry__gap" />
            {ai && <AiBadge />}
          </View>
        )}
        <View className={read ? "feed-entry__title feed-entry__title--read" : "feed-entry__title"}>{card.title}</View>
        {card.summary && <View className="feed-entry__summary">{card.summary}</View>}
        <View className="feed-entry__foot">
          <Text className="feed-entry__src">{card.source.name}</Text>
          {echo && (
            <View className="feed-entry__echo">
              <Reading value={card.sourceCount} after="家来源" size="s" body />
            </View>
          )}
        </View>
        {help && <Hotline hotline={help} />}
      </View>
    </View>
  );
}
