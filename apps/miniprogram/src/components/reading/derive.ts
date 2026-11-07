// 页面上能显示的派生值，只由真实字段和“现在”推出来：ISO 周次、日期加星期、北京时刻、精选流段头的日期、焦点卡“最新”的读数、
// 日报的时间窗、来源数。不编期号、卷号、页码、统计读数。纯函数，tests/reading-derive.test.ts 直接跑。
// src/lib/ 不改，所以放在组件目录里；引 lib 的纯逻辑写 .ts 后缀，node 才找得到。
import { beijingClock, beijingDate, headerDate } from "../../lib/beijing.ts";

const DAY_MS = 24 * 3600 * 1000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 北京日期 YYYY-MM-DD 的 ISO 8601 周序号（周一起算，含当年第一个周四的那一周是第 1 周）。不是日历上的日子回 null。 */
export function isoWeek(date: string): number | null {
  if (!headerDate(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // 这一周的周四
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  first.setUTCDate(first.getUTCDate() - ((first.getUTCDay() + 6) % 7) + 3); // 第 1 周的周四
  return 1 + Math.round((d.getTime() - first.getTime()) / (7 * DAY_MS));
}

/** “11月7日 周六”。不是日历上的日子回 null。 */
export function dayWeek(date: string): string | null {
  const h = headerDate(date);
  return h ? `${h.day} ${h.weekday}` : null;
}

/** 某一时刻的北京时刻“HH:mm”；解析不了回空字符串。精选卡索引栏用（日期已经在段头里）。 */
export function clockOf(instant: string | number | Date): string {
  const c = beijingClock(instant);
  return c ? `${pad(Math.floor(c.minute / 60))}:${pad(c.minute % 60)}` : "";
}

/**
 * 精选流段头右边的日期（lib/timeline.ts 的段：key 是“日期/时段序号”或日期，title 是段名）。今天的段（时段，或按天看的“今天”）
 * 回 null，日期已经在刊头里；“昨天”回“11月6日 周五”；更早的段名已经是日期，回星期“周四”。日期由段的 key 推出来（卡片 anchorAt
 * 的北京日期，和“现在”减天数是同一天），不读日报。
 */
export function sectionDate(key: string, title: string, now: number | string | Date): string | null {
  const date = key.slice(0, 10);
  if (date >= beijingDate(now)) return null;
  const h = headerDate(date);
  if (!h) return null;
  return title === "昨天" ? `${h.day} ${h.weekday}` : h.weekday;
}

/** 焦点卡“最新”：clock 是“HH:mm”，day 是“”（今天）、“昨天”、“11-05”（今年更早）或“2025-12-31”（跨年）。解析不了回 null。 */
export function stampParts(instant: string, now: number | string | Date): { day: string; clock: string } | null {
  const c = beijingClock(instant);
  if (!c) return null;
  const today = beijingDate(now);
  const yesterday = beijingDate(new Date(now).getTime() - DAY_MS);
  const day = c.date === today ? "" : c.date === yesterday ? "昨天" : c.date.slice(0, 4) === today.slice(0, 4) ? c.date.slice(5) : c.date;
  return { day, clock: clockOf(instant) };
}

/**
 * 日报时间窗“11月5日 08:00 至 11月6日 08:00”（接口的 window，按北京时间）。缺了或任一端解析不了回 null，不显示。
 * lib/daily.ts 的 checkDaily 不查 window，所以两端不是字符串也回 null（null 会被 Date 当成 1970 年，写出编出来的时间窗）。
 */
export function windowText(window: { start: string; end: string } | null | undefined): string | null {
  if (!window || typeof window !== "object") return null;
  const end = (instant: string) => {
    if (typeof instant !== "string") return null;
    const c = beijingClock(instant);
    const h = c && headerDate(c.date);
    return h ? `${h.day} ${clockOf(instant)}` : null;
  };
  const from = end(window.start);
  const to = end(window.end);
  return from && to ? `${from} 至 ${to}` : null;
}

/** 来源数的显示值：取整、至少 1（和 lib/item.ts、lib/story.ts 的写法一致）。 */
export function sourceTotal(count: number): number {
  return Math.max(1, Math.floor(count) || 1);
}
