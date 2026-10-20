// 北京时间（UTC+8，没有夏令时）的日期换算。纯函数，不依赖微信运行时，tests/ 里直接跑。

const OFFSET_MS = 8 * 3600 * 1000;
const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const DAY_MS = 24 * 3600 * 1000;

/** 某一时刻的北京日期 YYYY-MM-DD。 */
export function beijingDate(instant: number | string | Date): string {
  return new Date(new Date(instant).getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** 某一时刻的北京日期 YYYY-MM-DD 和当天的第几分钟（0–1439）。时刻解析不了时回 null。 */
export function beijingClock(instant: number | string | Date): { date: string; minute: number } | null {
  const ms = new Date(instant).getTime();
  if (Number.isNaN(ms)) return null;
  const shifted = new Date(ms + OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), minute: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

/**
 * 规格“通用约定”的时间显示，按北京时间：当天 HH:mm，昨天“昨天 HH:mm”，今年更早 MM-DD HH:mm，跨年 YYYY-MM-DD。
 * 卡片时刻传 anchorAt。时刻解析不了时回空字符串。
 */
export function displayTime(instant: number | string | Date, now: number | string | Date = Date.now()): string {
  const ms = new Date(instant).getTime();
  if (Number.isNaN(ms)) return "";
  const shifted = new Date(ms + OFFSET_MS).toISOString();
  const date = shifted.slice(0, 10);
  const clock = shifted.slice(11, 16);
  const today = beijingDate(now);
  if (date === today) return clock;
  // 北京时间没有夏令时，往前推 24 小时就是昨天。
  if (date === beijingDate(new Date(now).getTime() - DAY_MS)) return `昨天 ${clock}`;
  if (date.slice(0, 4) === today.slice(0, 4)) return `${date.slice(5)} ${clock}`;
  return date;
}

/**
 * 只要日期的地方（条目页“MM-DD 发布”、事件页报道行、收藏日期）：取统一时间显示的日期部分，按北京时间。
 * 今年的写 MM-DD（当天、昨天也写日期，不写“昨天”），跨年写 YYYY-MM-DD。时刻解析不了时回空字符串。
 */
export function displayDate(instant: number | string | Date, now: number | string | Date = Date.now()): string {
  const ms = new Date(instant).getTime();
  if (Number.isNaN(ms)) return "";
  const date = beijingDate(ms);
  return date.slice(0, 4) === beijingDate(now).slice(0, 4) ? date.slice(5) : date;
}

/** 头部的日期和星期：“10月16日”“周五”。不是 YYYY-MM-DD 的输入回 null。 */
export function headerDate(date: string): { day: string; weekday: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  return { day: `${Number(m[2])}月${Number(m[3])}日`, weekday: WEEKDAYS[d.getUTCDay()]! };
}

/**
 * 事件页头部的“首报”“最新”：今年的固定写 MM-DD HH:mm（当天、昨天也写日期，和原型一样），跨年按统一的时间显示写 YYYY-MM-DD。
 * 时刻解析不了时回空字符串。
 */
export function dayClock(instant: number | string | Date, now: number | string | Date = Date.now()): string {
  const ms = new Date(instant).getTime();
  if (Number.isNaN(ms)) return "";
  const shifted = new Date(ms + OFFSET_MS).toISOString();
  const date = shifted.slice(0, 10);
  return date.slice(0, 4) === beijingDate(now).slice(0, 4) ? `${date.slice(5)} ${shifted.slice(11, 16)}` : date;
}
