// 精选页顶部。制造：钴蓝竖排刊头。左边一块钴蓝色块（宽 72，从屏幕左缘和导航栏下沿出血），里面只有竖排反白的刊名，一个字一个 Text
// 竖着堆（不用 writing-mode）；右栏上面是 logo、日期和周次，下面是今日焦点的上半截（focus，由 board-feed 传 FocusHead），
// 焦点标题的最后一行落在色块底边。运动健康：不出竖排刊头，顶上一个钴蓝栏头写板块名，右边日期和周次，下面是钴蓝单色的栏目配图。
// 全站只有这一处竖排刊名。日期和周次只由北京“今天”推出来（元信息 readings.date，没有时用本机时钟），不编期号。
import type { ReactNode } from "react";
import { Image, Text, View } from "@tarojs/components";
import logo from "../../assets/logo.png";
import { HeadTab } from "../head-tab";
import { Reading } from "../reading";
import { Figure } from "../figure";
import { dayWeek, isoWeek } from "../reading/derive";
import { beijingDate } from "../../lib/beijing";
import "./index.scss";

interface Props {
  /** 刊名（构建配置 appName，“锐奇微报”），制造板块竖排在色块里。 */
  title: string;
  /** 元信息 readings.date（北京今天）；没有或不对时用本机时钟的北京日期。 */
  date: string | null;
  /** 快照时间“08:05 的内容”（lib/screen.ts 的 snapshotStamp）；没有时不画。 */
  stamp?: string | null;
  /** 占位：制造只留色块和 logo，运动健康只留栏头；不写日期、周次。 */
  brandOnly?: boolean;
  /** 运动健康（按天看的板块）：栏头写板块名。 */
  board?: { name: string } | null;
  /** 运动健康栏目配图（钴蓝单色），由页面引入，备用构建不带。 */
  cover?: string;
  /** 制造板块今日焦点的上半截（FocusHead），放在刊头右栏底部；没有焦点时不传。 */
  focus?: ReactNode;
}

export function Dashboard({ title, date, stamp = null, brandOnly = false, board = null, cover, focus = null }: Props) {
  const today = date && dayWeek(date) ? date : beijingDate(Date.now());
  const day = brandOnly ? null : dayWeek(today);
  const week = brandOnly ? null : isoWeek(today);
  if (board) {
    return (
      <View className="dash-sports">
        <HeadTab label={board.name} aside={[day, week !== null && <Reading value={week} before="第" after="周" size="s" />]} />
        {stamp && <Text className="dash-sports__stamp">{stamp}</Text>}
        {cover && !brandOnly && (
          <View className="dash-sports__cover">
            <Figure kind="cover" src={cover} name="栏目配图" source="Unsplash" label="户外登阶运动，栏目配图" />
          </View>
        )}
      </View>
    );
  }
  return (
    <View className="mast">
      {/* 读屏把竖排刊名当一个标题读一次，不一个字一个字地读。 */}
      <View className="mast__band" ariaRole="heading" ariaLabel={title}>
        {Array.from(title).map((char, i) => (
          <Text key={i} className="mast__char" ariaHidden>
            {char}
          </Text>
        ))}
      </View>
      <View className="mast__main">
        <View>
          <View className="mast__date">
            <View className="mast__dayline">
              <Image className="mast__logo" src={logo} />
              {day && <Text className="mast__day">{day}</Text>}
            </View>
            {week !== null && <Reading value={week} before="第" after="周" size="m" />}
          </View>
          {stamp && <Text className="mast__stamp">{stamp}</Text>}
        </View>
        {focus}
      </View>
    </View>
  );
}
