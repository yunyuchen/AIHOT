// 精选流的深色头部：logo 小标和小程序名，今天的北京日期和星期，三个读数，24 小时“发布时刻”扫描条。
// 按天看的板块（运动健康，board）照原型 sports.html：左边小字日期、大字板块名，读数下面是板块说明（一句一行），不画扫描条。
// 列表还是本机快照时，logo 行右边标上快照的时间；占位时只留 logo 行（brandOnly），不显示日期、读数、说明和扫描条。
// 有焦点卡时（focusAt）下沿留 60 给焦点卡压上来（原型），扫描条上焦点那条的点画成星青、稍大；有分类筛选条时（filterBar）下沿留 44。
import { Image, Text, View } from "@tarojs/components";
import type { MiniprogramReadings } from "@aihot/contracts/miniprogram";
import logo from "../../assets/logo.png";
import { beijingDate, headerDate } from "../../lib/beijing";
import { ScanBar } from "../scan-bar";
import "./index.scss";

interface Props {
  title: string;
  /** 元信息 readings.date；还没拿到时用本机时钟换算的北京日期。 */
  date: string | null;
  /** 还没拿到时读数显示占位横线，扫描条只有刻度和游标。 */
  readings: MiniprogramReadings | null;
  /** 快照的时间标记（“10:32 的内容”），不是快照时不传。 */
  stamp?: string | null;
  /** 只留 logo 行（占位）。 */
  brandOnly?: boolean;
  /** 正在显示的焦点卡的 anchorAt；没画焦点卡时不传。 */
  focusAt?: string | null;
  /** 按天看的板块：板块名（元信息的 board.name，没到时用构建配置的兜底值）和板块说明的各行。不传是精选 tab 的样子。 */
  board?: { name: string; lede: string[] } | null;
  /** 头部下沿钉着分类筛选条。 */
  filterBar?: boolean;
}

export function Dashboard({ title, date, readings, stamp, brandOnly, focusAt = null, board = null, filterBar = false }: Props) {
  const brand = (
    <View className="dash__brand">
      <Image className="dash__logo" src={logo} />
      <Text className="dash__title">{title}</Text>
      {stamp && <Text className="dash__stamp num">{stamp}</Text>}
    </View>
  );
  if (brandOnly) return <View className="dash">{brand}</View>;
  const now = Date.now();
  const today = headerDate(date ?? "") ?? headerDate(beijingDate(now));
  const className = focusAt ? "dash dash--focus" : filterBar ? "dash dash--filter" : "dash";
  return (
    <View className={className}>
      {brand}
      <View className="dash__reading">
        {board ? (
          <View className="dash__today">
            <Text className="dash__k num">{today ? `${today.day} ${today.weekday}` : ""}</Text>
            <Text className="dash__board">{board.name}</Text>
          </View>
        ) : (
          <View className="dash__today">
            <Text className="dash__k">今日精选</Text>
            <View className="dash__date num">
              <Text>{today?.day}</Text>
              <Text className="dash__weekday">{today?.weekday}</Text>
            </View>
          </View>
        )}
        <View className="dash__meters num">
          <Meter value={readings?.cards} unit="条精选" />
          <Meter value={readings?.stories} unit="个事件" />
          <Meter value={readings?.sources} unit="个信源" />
        </View>
      </View>
      {board ? (
        board.lede.length > 0 && (
          <View className="dash__lede">
            {board.lede.map((line, i) => (
              <Text key={i} className="dash__lede-line">
                {line}
              </Text>
            ))}
          </View>
        )
      ) : (
        <ScanBar times={readings?.times ?? []} updatedAt={readings?.updatedAt ?? null} now={now} focusAt={focusAt} />
      )}
    </View>
  );
}

function Meter({ value, unit }: { value: number | undefined; unit: string }) {
  return (
    <View className="dash__meter">
      <Text className="dash__value">{value ?? "—"}</Text>
      <Text className="dash__unit">{unit}</Text>
    </View>
  );
}
