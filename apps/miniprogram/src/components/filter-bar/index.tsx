// 两个板块共用的分类筛选：“全部”固定在左侧，其余分类横向滚动。
// 分类和顺序来自元信息，圆点颜色来自构建配置（lib/board-feed.ts 的 filterChips）。
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
