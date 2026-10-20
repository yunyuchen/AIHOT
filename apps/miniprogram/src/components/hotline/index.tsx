// 心理援助热线（运动健康）：元信息 notice.hotline 指定的分类，在精选卡片和条目页上显示。文案和号码都来自元信息（行业包配置，
// 号码由人核对后写入，不由模型写），改了不用发版；显示规则见 lib/board-feed.ts 的 hotlineFor。
// 卡片上是摘要下面一行小字，点了照样进条目页；条目页上是一张卡，点了拨号（读者在系统弹窗里取消也走 fail，不提示）。
import Taro from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import "./index.scss";

interface Props {
  hotline: { label: string; number: string };
  /** 条目页的样子：单独一张卡，点了拨号。 */
  panel?: boolean;
}

export function Hotline({ hotline, panel = false }: Props) {
  if (!panel) {
    return (
      <View className="hotline">
        <Text className="hotline__label">{hotline.label}</Text>
        <Text className="hotline__number num">{hotline.number}</Text>
      </View>
    );
  }
  const dial = () => {
    Taro.makePhoneCall({ phoneNumber: hotline.number.replace(/[\s-]/g, "") }).catch(() => undefined);
  };
  return (
    <View className="hotline-panel" hoverClass="hotline-panel--down" onClick={dial}>
      <View className="hotline-panel__text">
        <Text className="hotline-panel__label">{hotline.label}</Text>
        <Text className="hotline-panel__number num">{hotline.number}</Text>
      </View>
      <Text className="hotline-panel__call">拨打</Text>
    </View>
  );
}
