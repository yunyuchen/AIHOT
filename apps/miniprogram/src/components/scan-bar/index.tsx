// 深色头部的 24 小时“发布时刻”扫描条（原型 A 版 .scan）。落点和游标位置由 lib/scan-bar.ts 按设计稿像素算好，这里换成百分比，
// 跟着屏宽缩放；圆点、刻度、星这些固定尺寸写在样式里，由 Taro 换算成 rpx。焦点卡那条的点星青、稍大（原型 .pip.hot）。
import { Image, Text, View } from "@tarojs/components";
import star from "../../assets/star.png";
import { SCAN_HEIGHT, SCAN_WIDTH, scanBar } from "../../lib/scan-bar";
import "./index.scss";

/** 刻度：0、6、12、18、24 时。 */
const HOURS = [0, 6, 12, 18, 24];

interface Props {
  /** 元信息的 readings.times；元信息还没到时为空。 */
  times: readonly string[];
  /** 元信息的 readings.updatedAt；为 null 时不显示“HH:mm 更新”。 */
  updatedAt: string | null;
  now: number;
  /** 正在显示的焦点卡的 anchorAt；没画焦点卡时为 null。 */
  focusAt: string | null;
}

const x = (px: number) => `${((px / SCAN_WIDTH) * 100).toFixed(3)}%`;
const y = (px: number) => `${((px / SCAN_HEIGHT) * 100).toFixed(3)}%`;

export function ScanBar({ times, updatedAt, now, focusAt }: Props) {
  const bar = scanBar(times, updatedAt, now, focusAt);
  return (
    <View className="scan-bar">
      <Text className={`scan-bar__cap scan-bar__cap--${bar.capSide}`}>发布时刻</Text>
      {bar.pips.map((pip, i) => (
        <View key={i} className={pip.hot ? "scan-bar__pip scan-bar__pip--hot" : "scan-bar__pip"} style={{ left: x(pip.left), top: y(pip.top) }} />
      ))}
      <View className="scan-bar__base" style={{ width: x(bar.cursor) }} />
      <View className="scan-bar__future" style={{ left: x(bar.cursor) }} />
      {HOURS.map((hour) => (
        <View key={hour} className={`scan-bar__tick scan-bar__tick--${hour}`} />
      ))}
      {HOURS.map((hour) => (
        <Text key={hour} className={`scan-bar__hour scan-bar__hour--${hour} num`}>
          {hour}时
        </Text>
      ))}
      <View className="scan-bar__cursor" style={{ left: x(bar.cursor - 0.5) }}>
        <Image className="scan-bar__star" src={star} />
        {bar.label && <Text className={`scan-bar__now scan-bar__now--${bar.labelSide} num`}>{bar.label}</Text>}
      </View>
    </View>
  );
}
