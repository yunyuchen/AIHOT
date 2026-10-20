// 本次会话内的请求节流：元信息和精选第一页 60 秒内不重复请求；过了上次精选流响应给的 refreshAt（下一条精选放出的时刻）
// 就算过期，提前重拉。下拉刷新和重试不看这个，直接强制重拉。离开页面（切到微信后台或别的 tab）超过 30 分钟再回来，
// 也强制重拉（D26）。纯函数，tests/ 里直接跑。

export const FRESH_MS = 60_000;

/** 离开多久算“很久”（D26）。 */
export const AWAY_MS = 30 * 60_000;

/** fetchedAt 是上次成功响应的本机时刻。本机时钟往回拨过（now 比 fetchedAt 还早）时按过期算，免得一直不重拉。 */
export function isFresh(fetchedAt: number, refreshAt: string | null, now: number): boolean {
  if (now < fetchedAt || now - fetchedAt >= FRESH_MS) return false;
  if (refreshAt === null) return true;
  const due = Date.parse(refreshAt);
  return Number.isNaN(due) || now < due;
}

/**
 * hiddenAt 是页面上次隐藏的本机时刻，没隐藏过为 null（冷启动的第一次显示）。离开超过 30 分钟算很久，正好 30 分钟不算；
 * 本机时钟往回拨过时也算很久，和 isFresh 一样宁可多拉一次。
 */
export function awayTooLong(hiddenAt: number | null, now: number): boolean {
  if (hiddenAt === null) return false;
  return now < hiddenAt || now - hiddenAt > AWAY_MS;
}
