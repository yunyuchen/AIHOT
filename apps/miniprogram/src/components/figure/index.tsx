// 钴蓝单色配图：图下一行图注，左边图名（墨），右边“图：来源”（次要色）。图片文件已经印成钴蓝单色、按显示比例裁好（scripts/tab-icons.ts），
// 这里不做任何滤镜。kind 决定尺寸：plate 页首通栏 390×258（没有页边，图注从 x=20 起）；line 页边内 350×246；cover 页边内 350×176。
// 定高加 aspectFill：图还没解码时不跳版面；文件比例和显示比例一致，aspectFill 不会裁掉内容（plate 只差半个像素）。
// 只给公司产品图和栏目配图用，不配到新闻上（公开条目契约没有配图字段）。
import { Image, Text, View } from "@tarojs/components";
import "./index.scss";

interface Props {
  src: string;
  name: string;
  source: string;
  kind: "plate" | "line" | "cover";
  /** 读屏用的说明，默认是图名。 */
  label?: string;
}

export function Figure({ src, name, source, kind, label }: Props) {
  return (
    <View className={`figure figure--${kind}`}>
      <Image className="figure__img" src={src} mode="aspectFill" ariaLabel={label ?? name} />
      <View className="figure__cap">
        <Text className="figure__name">{name}</Text>
        <Text className="figure__src">图：{source}</Text>
      </View>
    </View>
  );
}
