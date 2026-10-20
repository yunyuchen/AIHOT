// 体验版：和正式版请求同一套行业实例（同一个小程序，体验版也要走合法域名）。
// 两个域名都在大陆机上、已备案过白（2026-10-18 定），都要加进 request 合法域名和 downloadFile 合法域名。
import { MANUFACTURING_BOARD, SPORTS_BOARD, type BuildConfig } from "./boards.ts";

export default {
  env: "trial",
  appName: "锐奇热点",
  boards: [
    // 制造行业实例；从香港搬到大陆机后用这个域名（票 29），搬之前这个地址还没有制造的内容。
    // 客户还没申请到一次性订阅模板（“资讯 > 信息资讯”类目），先留空：留空时不画“提醒我明天的日报”。
    { ...MANUFACTURING_BOARD, apiBase: "https://hot.yunyuchen.fun", reminderTemplateId: "" },
    // 运动健康行业实例（读者看不到这个名字）；改了要同时改正式版。
    { ...SPORTS_BOARD, apiBase: "https://sports.yunyuchen.fun" },
  ],
} satisfies BuildConfig;
