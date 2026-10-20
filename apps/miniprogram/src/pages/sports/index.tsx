// 运动健康 tab：运动健康板块的精选流，只请求运动健康行业实例。头部写板块说明和三个读数，下沿钉分类筛选条，没有焦点卡，
// 一律按天分段，页脚固定板块声明。整屏和精选 tab 共用 components/board-feed，按板块参数化。
// 备用构建（--mode prod-no-sports）里没有这一页。
import { BoardFeed } from "../../components/board-feed";
import { useTabShare } from "../../lib/use-share";

export default function SportsPage() {
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  return <BoardFeed board="sports" />;
}
