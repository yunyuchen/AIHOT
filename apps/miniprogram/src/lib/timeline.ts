// 精选流的时间轴分段：今天按凌晨、上午、下午、晚间四个时段，往日按天，最新的在上；按天看的板块（运动健康）今天也是一段。
// 按卡片的 anchorAt 换算成北京时间。对已加载的卡片做，触底追加以后整份重算，所以段里的条数是已加载的条数。纯函数，tests/ 里直接跑。
import type { MiniprogramCard } from "@aihot/contracts/miniprogram";
import { beijingClock, beijingDate, headerDate } from "./beijing.ts";

const DAY_MS = 24 * 3600 * 1000;

/** 今天的四个时段，每段 6 小时。范围照原型写，最后一段写“18 时以后”。 */
const PERIODS = [
  { name: "凌晨", range: "0–6 时" },
  { name: "上午", range: "6–12 时" },
  { name: "下午", range: "12–18 时" },
  { name: "晚间", range: "18 时以后" },
] as const;

export interface TimelineSection {
  /** 今天的时段是“日期/时段序号”（2026-10-17/3），往日（和按天分段的今天）是日期（2026-10-16）；按它倒序排，也做 React key。 */
  key: string;
  /** 时段名（“晚间”），往日是“昨天”或日期（“10月15日”，跨年的带年份）；按天分段时今天是“今天”。 */
  title: string;
  /** 段头标题后面的小字：今天是时间范围（“18 时以后”），按天分段的今天和昨天是日期（“10月16日”），更早的没有。 */
  range: string | null;
  count: number;
  /** 当前时段：今天、并且是现在所在的时段（按天分段时就是今天）。段头节点画 logo 星，这一段的轴线是青色。 */
  live: boolean;
  /** 段内保持列表原来的顺序（新的在上）。 */
  cards: MiniprogramCard[];
}

/**
 * 把卡片分段。今天没有卡片时直接从往日开始（不算空态）；卡片为空时回空数组。
 * 日期比本机的今天还晚的卡片（本机时钟慢了）算进今天的晚间（“18 时以后”，按天分段时算进今天）；anchorAt 解析不了的卡片不进时间轴
 * （契约保证是 ISO 时刻）。byDay 为真时一律按天分段：今天、昨天、日期（运动健康，构建配置的 byDay）。
 */
export function timelineSections(cards: readonly MiniprogramCard[], now: number | string | Date, byDay = false): TimelineSection[] {
  const nowClock = beijingClock(now);
  if (!nowClock) return [];
  const today = nowClock.date;
  const yesterday = beijingDate(new Date(now).getTime() - DAY_MS);
  const livePeriod = periodOf(nowClock.minute);
  const sections = new Map<string, TimelineSection>();
  for (const card of cards) {
    const clock = beijingClock(card.anchorAt);
    if (!clock) continue;
    const period = clock.date > today ? 3 : periodOf(clock.minute);
    const key = clock.date >= today ? (byDay ? today : `${today}/${period}`) : clock.date;
    let section = sections.get(key);
    if (!section) {
      section = byDay && clock.date >= today ? todaySection(today) : newSection(key, clock.date, period, today, yesterday, livePeriod);
      sections.set(key, section);
    }
    section.cards.push(card);
    section.count++;
  }
  return [...sections.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

function periodOf(minute: number): number {
  return Math.min(3, Math.floor(minute / 360));
}

/** 按天分段的今天：“今天”加小字日期，一直是当前时段。 */
function todaySection(today: string): TimelineSection {
  return { key: today, title: "今天", range: headerDate(today)!.day, count: 0, live: true, cards: [] };
}

function newSection(key: string, date: string, period: number, today: string, yesterday: string, livePeriod: number): TimelineSection {
  const base = { key, count: 0, cards: [] };
  if (date >= today) return { ...base, title: PERIODS[period]!.name, range: PERIODS[period]!.range, live: period === livePeriod };
  const day = headerDate(date)!.day;
  if (date === yesterday) return { ...base, title: "昨天", range: day, live: false };
  const title = date.slice(0, 4) === today.slice(0, 4) ? day : `${date.slice(0, 4)}年${day}`;
  return { ...base, title, range: null, live: false };
}
