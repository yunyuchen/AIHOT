// 深色头部的 24 小时“发布时刻”扫描条：每张今日精选在它的锚点时刻（元信息 readings.times）落一个圆点，同一个半小时里的往上堆；
// 游标在当前时刻，顶一颗四角星，旁边标“HH:mm 更新”（readings.updatedAt）。焦点卡那条的圆点是星青色、稍大。纯函数，tests/ 里直接跑。
// 坐标是原型 A 版的设计稿像素：条宽 358（390 减去两边各 16）、高 38，组件再换成百分比，跟着屏宽缩放。
import { beijingClock, displayTime } from "./beijing.ts";

export const SCAN_WIDTH = 358;
export const SCAN_HEIGHT = 38;

/** 一天 48 个半小时格，每格 7.46。 */
const SLOTS = 48;
const SLOT_WIDTH = SCAN_WIDTH / SLOTS;
/** 圆点直径，和样式里的 .scan-bar__pip 一致。 */
const PIP_SIZE = 4;
/** 焦点卡那条的圆点直径，和 .scan-bar__pip--hot 一致（原型 .pip.hot）；底边和别的圆点一样贴着底线。 */
const HOT_SIZE = 5;
/** 最下面一颗圆点的 top（底线在 22，圆点底边贴着它的上方）。 */
const PIP_BOTTOM = 17;
/** 往上堆的间距。 */
const PIP_STEP = 5.5;
/** 堆到这里为止；一格里点多到超出时压缩间距，全部挤在这个高度里。 */
const PIP_CEILING = 0.5;

/** 游标上的星：从游标线往左伸 4。 */
const STAR_LEFT = 4;
/** 标签和游标线的距离。 */
const LABEL_GAP = 7.5;
/** “发布时刻”四个 11px 的字，再留一点空。 */
const CAP_WIDTH = 4 * 11 + 6;

export interface ScanPip {
  left: number;
  top: number;
  /** 焦点卡那条：星青色、稍大。 */
  hot: boolean;
}

export interface ScanBar {
  pips: ScanPip[];
  /** 游标（当前时刻）的横坐标；底线画到这里，后面是虚线。 */
  cursor: number;
  /** “HH:mm 更新”；readings.updatedAt 为 null（今天还没有过精选放出）或解析不了时为 null，不显示。 */
  label: string | null;
  /** 标签放在游标右边；靠近右端放不下时放到左边。 */
  labelSide: "left" | "right";
  /** “发布时刻”小字放在左上角；游标走到左端会压住它时挪到右上角。 */
  capSide: "left" | "right";
}

/**
 * times 是元信息的 readings.times（今天每张精选的锚点时刻）。只画北京时间今天的时刻，别的日期和解析不了的跳过。
 * updatedAt 按统一的时间显示规则写：今天“HH:mm”，昨天“昨天 HH:mm”，更早的带日期。
 * focusAt 是正在显示的焦点卡的 anchorAt（没画焦点卡时为 null）：times 里和它同一时刻的第一个点画成焦点那颗，在堆里的位置不变。
 */
export function scanBar(
  times: readonly string[],
  updatedAt: string | null,
  now: number | string | Date,
  focusAt: string | null = null,
): ScanBar {
  const nowClock = beijingClock(now);
  const today = nowClock?.date ?? null;
  const focusMs = focusAt ? new Date(focusAt).getTime() : Number.NaN;
  let focusPending = !Number.isNaN(focusMs);
  // 每个半小时格里的点，按 times 的顺序；值是这颗是不是焦点那颗。
  const buckets = new Map<number, boolean[]>();
  for (const time of times) {
    const clock = beijingClock(time);
    if (!clock || clock.date !== today) continue;
    const hot = focusPending && new Date(time).getTime() === focusMs;
    if (hot) focusPending = false;
    const slot = Math.floor(clock.minute / 30);
    const bucket = buckets.get(slot) ?? [];
    bucket.push(hot);
    buckets.set(slot, bucket);
  }
  const pips: ScanPip[] = [];
  for (const [slot, bucket] of [...buckets].sort((a, b) => a[0] - b[0])) {
    const count = bucket.length;
    const step = count > 1 ? Math.min(PIP_STEP, (PIP_BOTTOM - PIP_CEILING) / (count - 1)) : 0;
    bucket.forEach((hot, i) => {
      const size = hot ? HOT_SIZE : PIP_SIZE;
      pips.push({ left: slot * SLOT_WIDTH + (SLOT_WIDTH - size) / 2, top: PIP_BOTTOM - i * step - (size - PIP_SIZE), hot });
    });
  }

  const cursor = ((nowClock?.minute ?? 0) / 1440) * SCAN_WIDTH;
  const shown = updatedAt ? displayTime(updatedAt, now) : "";
  const label = shown ? `${shown} 更新` : null;
  const labelSide = label && cursor + LABEL_GAP + textWidth(label) > SCAN_WIDTH ? "left" : "right";
  const capSide = cursor - STAR_LEFT < CAP_WIDTH ? "right" : "left";
  return { pips, cursor, label, labelSide, capSide };
}

/** 11px 字的大致宽度：汉字 11，数字、冒号、空格这些按 6.5 估。 */
function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += ch.charCodeAt(0) < 0x2e80 ? 6.5 : 11;
  return width;
}
