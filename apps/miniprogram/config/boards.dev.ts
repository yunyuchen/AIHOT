// 开发：本机起的行业实例。微信开发者工具里要勾上“不校验合法域名”才能请求 http 地址。
// 制造的 api 在默认的 3001；运动健康是第二套行业实例（自己的数据库和行业包，见 docs/deploy.md“同一台机器跑两套行业实例”），api 用 API_PORT=3002。
import { MANUFACTURING_BOARD, SPORTS_BOARD, type BuildConfig } from "./boards.ts";

export default {
  env: "dev",
  appName: "锐奇微报",
  boards: [
    // 客户还没申请到一次性订阅模板（“资讯 > 信息资讯”类目），先留空：留空时不画“提醒我明天的日报”。
    { ...MANUFACTURING_BOARD, apiBase: "http://127.0.0.1:3001", reminderTemplateId: "" },
    { ...SPORTS_BOARD, apiBase: "http://127.0.0.1:3002" },
  ],
} satisfies BuildConfig;
