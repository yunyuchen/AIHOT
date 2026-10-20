// 精选流的卡片列表：一根竖轴，按时段分段（今天凌晨、上午、下午、晚间，往日按天），最新的在上；按天看的板块（运动健康，byDay）
// 一律按天分段、卡片不显示时刻。每段一个段头（圆形节点、时段名、范围、条数），段里的卡左侧一个圆形节点挂在轴上；当前时段的节点是
// logo 星，轴线青色。底部是续页的状态。空态、加载失败和占位由页面按 lib/feed-screen.ts 显示，这里只画卡片。
// 焦点卡由页面画在头部下沿，时间轴按 id 去掉焦点那张（lib/feed.ts 的 withoutFocus），分段和段头条数都按去掉以后的算。点卡片进条目页。
// 已读（打开过条目页，use-feed.ts 带上的 state.read）的卡片标题改用正文灰，其余不变（D25）。
// 元信息 notice.hotline 指定的分类，卡片上多一行心理援助热线（components/hotline）。
import { Image, Text, View } from "@tarojs/components";
import star from "../../assets/star.png";
import { displayTime } from "../../lib/beijing";
import { hotlineFor } from "../../lib/board-feed";
import { categoryChip, showAiBadge, sourceCountChip } from "../../lib/card";
import type { MiniprogramCard, MiniprogramHotline } from "@aihot/contracts/miniprogram";
import { withoutFocus, type FeedState } from "../../lib/feed";
import { timelineSections, type TimelineSection } from "../../lib/timeline";
import { AiBadge } from "../ai-badge";
import { CategoryTag } from "../category-tag";
import { Hotline } from "../hotline";
import "./index.scss";

interface Props {
  /** read：这个板块已读的条目 id（use-feed.ts 带上）；没带时都当没读。 */
  state: FeedState & { read?: ReadonlySet<string> };
  /** 分类 key → 分类名，来自元信息；还没拿到时为空表。 */
  labels: Readonly<Record<string, string>>;
  /** 分类 key → 色标颜色，来自构建配置。 */
  colors: Readonly<Record<string, string>>;
  /** 正在显示的焦点卡的 id：时间轴里去掉这张。没画焦点卡时为 null。 */
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
  // 已加载的卡只有焦点那一张：不画轴，只留底部状态。
  if (cards.length === 0) return <Footer state={state} onRetry={onRetry} bare />;
  return (
    <View className="feed-list">
      <View className="feed-list__axis">
        {timelineSections(cards, now, byDay).map((section, i) => (
          <Period
            key={section.key}
            section={section}
            first={i === 0}
            labels={labels}
            colors={colors}
            now={now}
            onOpen={onOpen}
            showTime={!byDay}
            hotline={hotline}
            read={state.read}
          />
        ))}
      </View>
      <Footer state={state} onRetry={onRetry} />
    </View>
  );
}

interface PeriodProps {
  section: TimelineSection;
  first: boolean;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  now: number;
  read: ReadonlySet<string> | undefined;
  onOpen: (id: string) => void;
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Period({ section, first, labels, colors, now, read, onOpen, showTime, hotline }: PeriodProps) {
  return (
    <View className={`feed-period${section.live ? " feed-period--live" : ""}`}>
      <View className={`feed-period__head${first ? "" : " feed-period__head--gap"}`}>
        <View className="feed-period__node">{section.live && <Image className="feed-period__star" src={star} />}</View>
        <Text className="feed-period__name">{section.title}</Text>
        {section.range && <Text className="feed-period__range num">{section.range}</Text>}
        <Text className="feed-period__count num">{section.count} 条</Text>
      </View>
      {section.cards.map((card, i) => (
        <Card
          key={card.id}
          card={card}
          first={i === 0}
          labels={labels}
          colors={colors}
          now={now}
          onOpen={onOpen}
          showTime={showTime}
          hotline={hotline}
          read={read?.has(card.id) ?? false}
        />
      ))}
    </View>
  );
}

/** bare：上面没有轴（轴会往下多伸 24），要自己留上边距。 */
function Footer({ state, onRetry, bare = false }: { state: FeedState; onRetry: () => void; bare?: boolean }) {
  const className = bare ? "feed-list__status" : "feed-list__status feed-list__status--foot";
  if (state.phase === "loading" || state.more === "loading") return <Text className={className}>加载中…</Text>;
  if (state.phase === "failed" || state.more === "failed") {
    return (
      <View className={`${className} feed-list__status--retry`} hoverClass="feed-list__status--down" onClick={onRetry}>
        加载失败，点这里重试
      </View>
    );
  }
  if (!state.hasMore) return <Text className={className}>没有更早的了</Text>;
  return null;
}

interface CardProps {
  card: MiniprogramCard;
  /** 段里的第一张：和段头隔得近一些。 */
  first: boolean;
  labels: Readonly<Record<string, string>>;
  colors: Readonly<Record<string, string>>;
  now: number;
  /** 打开过条目页：标题改用正文灰。 */
  read: boolean;
  onOpen: (id: string) => void;
  /** 卡片左上角的时刻（anchorAt）；按天看的板块不显示。 */
  showTime: boolean;
  hotline: MiniprogramHotline | null;
}

function Card({ card, first, labels, colors, now, read, onOpen, showTime, hotline }: CardProps) {
  const chip = categoryChip(card.category, labels, colors);
  const echo = sourceCountChip(card.sourceCount);
  const help = hotlineFor(card.category, hotline);
  return (
    <View className={`feed-card${first ? " feed-card--first" : ""}`}>
      <View className="feed-card__node" />
      <View className="feed-card__hang" />
      <View className="feed-card__body" hoverClass="feed-card__body--down" onClick={() => onOpen(card.id)}>
        <View className="feed-card__row">
          {showTime && <Text className="feed-card__time num">{displayTime(card.anchorAt, now)}</Text>}
          {chip && <CategoryTag chip={chip} />}
          <View className="feed-card__gap" />
          {showAiBadge(card.ai) && <AiBadge />}
        </View>
        <View className={read ? "feed-card__title feed-card__title--read" : "feed-card__title"}>{card.title}</View>
        {card.summary && <View className="feed-card__summary">{card.summary}</View>}
        <View className="feed-card__foot">
          <Text className="feed-card__src">{card.source.name}</Text>
          {echo && (
            <View className="feed-card__echo num">
              <View className="feed-card__bars">
                {Array.from({ length: echo.dots }, (_, i) => (
                  <View key={i} className="feed-card__bar" />
                ))}
              </View>
              {echo.label}
            </View>
          )}
        </View>
        {help && <Hotline hotline={help} />}
      </View>
    </View>
  );
}
