// 分类筛选条（运动健康）：钉在深色头部下沿的一条白卡，“全部”固定在最左，分类跟在后面，放不下时横着滑（原型 sports.html 的 .filter，
// 原型只画了四个分类、等分一行）。分类和顺序来自元信息的 categories，圆点颜色来自构建配置的分类配色（lib/board-feed.ts 的 filterChips）。
import { ScrollView, View } from "@tarojs/components";
import type { FilterChip } from "../../lib/board-feed";
import "./index.scss";

interface Props {
  /** 第一个是“全部”。 */
  chips: FilterChip[];
  /** 正在看的分类，null 为全部。 */
  active: string | null;
  onPick: (key: string | null) => void;
}

export function FilterBar({ chips, active, onPick }: Props) {
  const [all, ...categories] = chips;
  return (
    <View className="filter-bar">
      <Segment chip={all} on={active === null} onPick={onPick} />
      <ScrollView className="filter-bar__scroll" scrollX enhanced showScrollbar={false}>
        {categories.map((chip) => (
          <Segment key={chip.key} chip={chip} on={chip.key === active} onPick={onPick} />
        ))}
      </ScrollView>
    </View>
  );
}

function Segment({ chip, on, onPick }: { chip: FilterChip; on: boolean; onPick: (key: string | null) => void }) {
  const className = `filter-seg${chip.key === null ? " filter-seg--all" : ""}${on ? " filter-seg--on" : ""}`;
  return (
    <View className={className} hoverClass={on ? "none" : "filter-seg--down"} onClick={on ? undefined : () => onPick(chip.key)}>
      {chip.color && <View className="filter-seg__dot" style={{ background: chip.color }} />}
      {chip.label}
    </View>
  );
}
