// 运动健康 tab：栏目运动配图、板块说明、分类与按天分段的精选流，只请求运动健康行业实例。
// 图片只作栏目封面，不作为新闻现场；页脚固定板块声明，列表行为和精选 tab 共用。
// 备用构建（--mode prod-no-sports）里没有这一页。
import { BoardFeed } from "../../components/board-feed";
import { useTabShare } from "../../lib/use-share";
import { useActiveTab } from "../../lib/use-active-tab";
import sportsCover from "../../assets/editorial/sports-running.jpg";

export default function SportsPage() {
  useActiveTab();
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  return <BoardFeed board="sports" cover={sportsCover} />;
}
