// 运动健康 tab：钴蓝栏头、钴蓝单色栏目配图、分类与按天分段的精选流，只请求运动健康行业实例。
// 配图只作栏目配图，不作为新闻现场。列表行为和精选 tab 共用。
// 备用构建（--mode prod-no-sports）里没有这一页，也就不带这张图。
import { BoardFeed } from "../../components/board-feed";
import { useTabShare } from "../../lib/use-share";
import { useActiveTab } from "../../lib/use-active-tab";
import sportsCover from "../../assets/sports/cover.jpg";

export default function SportsPage() {
  useActiveTab();
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  return <BoardFeed board="sports" cover={sportsCover} />;
}
