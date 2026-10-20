// 可选模块。关掉以后：导航里不再出现入口，对应的定时任务不再运行，页面与接口返回 404。
// 模型榜和 Codex 重置监控只对 AI 行业有意义：做别的行业时这两项设为 false，或者按 docs/customize.md 整块删掉。

export const FEATURES = {
  /** 模型榜：汇总公开评测，按公开方法 v15 计算共识排名（/leaderboard）。每天抓 4 次评测来源。 */
  leaderboard: false,
  /** Codex 重置监控：盯 OpenAI Codex 负责人在 X 上的额度重置公告（/codex-reset）。需要 SocialData。 */
  codexResetMonitor: false,
  /**
   * 日报栏目：管日报、周报、月报和补做四个定时任务（reports.daily、reports.weekly、reports.monthly、reports.catch-up），
   * 小程序出口的日报（dailies）和提醒（reminders）接口，以及元信息里的 columns.daily。没有日报的板块设为 false。
   * 元信息的 columns.daily、worker 的四个报告任务和提醒发送、小程序出口的 dailies 和 reminders 接口都跟着它走。
   */
  reports: true,
} as const;
