// 并发闸：同时最多 limit 个任务在跑，多出来的排队，先来先跑。纯函数，tests/ 里直接跑。

export function createGate(limit: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active < limit) active++;
    // 满了就排队；前一个任务结束时把名额直接交过来，所以醒来后不再加计数。
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
