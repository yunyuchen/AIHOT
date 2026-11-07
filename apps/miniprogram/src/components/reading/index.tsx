// 读数：钴蓝 DIN 数字，前后跟次要色的字（“第 45 周”“24 条”“最新 01:53”“3 家来源”）。只给能由真实字段推出来的数：
// 时刻、日数、周次、条数、来源数（推导见 components/reading/derive.ts）。电话号码不是读数，不用它。
import { Text, View } from "@tarojs/components";
import "./index.scss";

interface Props {
  value: string | number;
  /** 数字前的字（“第”“最新”“首报”）。 */
  before?: string;
  /** 数字后的字（“周”“条”“家来源”“出刊”）。 */
  after?: string;
  /** 数字字号：s 16、m 18、l 20。 */
  size?: "s" | "m" | "l";
  /** 前后的字用正文色（精选卡、收藏卡底部的“2 家来源”）；默认次要色。 */
  body?: boolean;
}

export function Reading({ value, before, after, size = "m", body = false }: Props) {
  const unit = body ? "reading__unit reading__unit--body" : "reading__unit";
  return (
    <View className={`reading reading--${size}`}>
      {before ? <Text className={`${unit} reading__unit--before`}>{before}</Text> : null}
      <Text className="reading__num num">{value}</Text>
      {after ? <Text className={`${unit} reading__unit--after`}>{after}</Text> : null}
    </View>
  );
}
