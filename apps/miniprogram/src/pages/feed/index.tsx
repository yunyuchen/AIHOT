// 制造板块的编辑式精选流；请求、快照、分页与运动健康共用。
import { BoardFeed } from "../../components/board-feed";
import { useTabShare } from "../../lib/use-share";
import { useActiveTab } from "../../lib/use-active-tab";

export default function FeedPage() {
  useActiveTab();
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  return <BoardFeed board="manufacturing" />;
}
