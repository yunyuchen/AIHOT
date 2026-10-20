// 精选 tab：制造板块的精选流。深色头部（读数、扫描条），头部下沿压一张今日焦点卡，下面是按时段分段的精选时间轴，触底加载下一页，
// 下拉刷新。整屏和运动健康 tab 共用 components/board-feed，按板块参数化。
import { BoardFeed } from "../../components/board-feed";
import { useTabShare } from "../../lib/use-share";

export default function FeedPage() {
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  return <BoardFeed board="manufacturing" />;
}
