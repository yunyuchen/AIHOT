// 制造板块为深墨刊头，运动健康为暖纸刊头；板块标题从元信息读取。
import { Image, Text, View } from "@tarojs/components";
import logo from "../../assets/logo.png";
import { beijingDate, headerDate } from "../../lib/beijing";
import "./index.scss";

interface Props {
  title: string;
  date: string | null;
  stamp?: string | null;
  brandOnly?: boolean;
  board?: { name: string } | null;
  /** 栏目主题图，不是新闻配图。由页面引入，备用构建不携带未启用板块的素材。 */
  cover?: string;
}

export function Dashboard({ title, date, stamp, brandOnly, board = null, cover }: Props) {
  const brand = (
    <View className="dash__brand">
      <Image className="dash__logo" src={logo} />
      <Text className="dash__title">{title}</Text>
      {stamp && <Text className="dash__stamp num">{stamp}</Text>}
    </View>
  );
  if (brandOnly) return <View className={`dash ${board ? "dash--sports" : "dash--manufacturing"}`}>{brand}</View>;
  const today = headerDate(date ?? "") ?? headerDate(beijingDate(Date.now()));
  return (
    <View className={`dash ${board ? "dash--sports" : "dash--manufacturing"}`}>
      {brand}
      {board ? (
        <>
          {cover && (
            <View className="dash__cover">
              <Image className="dash__cover-image" src={cover} mode="aspectFill" ariaLabel="户外登阶运动，栏目配图" />
              <Text className="dash__cover-caption">栏目配图 · Unsplash</Text>
            </View>
          )}
          <View className="dash__reading"><Text className="dash__board">{board.name}</Text></View>
        </>
      ) : (
        <View className="dash__meta">
          <Text className="dash__k">每日精选</Text>
          <Text className="dash__date num">{today ? `${today.day} / ${today.weekday}` : ""}</Text>
        </View>
      )}
    </View>
  );
}
