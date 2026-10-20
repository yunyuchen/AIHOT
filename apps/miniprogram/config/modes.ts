// --mode 选哪份构建期配置：dev（开发）、trial（体验）、prod（正式）。后面加 -no-sports 是备用构建（规格风险 R11：平时维护一个
// 去掉运动健康 tab 的构建，保证一天内能提审）：板块列表去掉运动健康，tabBar 和页面由 src/app.config.ts 跟着板块列表少一个，
// 产物放 dist-no-sports/，和完整构建的 dist/ 分开。纯函数，tests/ 里直接跑；config/index.ts 用它。
import { dropBoard, type BuildConfig } from "./boards.ts";
import dev from "./boards.dev.ts";
import trial from "./boards.trial.ts";
import prod from "./boards.prod.ts";

const BUILD_CONFIGS: Record<string, BuildConfig> = { dev, trial, prod };

/** 备用构建的模式后缀：prod-no-sports、trial-no-sports、dev-no-sports。 */
export const NO_SPORTS = "-no-sports";

export interface BuildTarget {
  config: BuildConfig;
  /** Taro 的 outputRoot：完整构建 dist，备用构建 dist-no-sports。 */
  outputRoot: string;
}

export function buildTarget(mode: string): BuildTarget {
  const noSports = mode.endsWith(NO_SPORTS);
  const base = BUILD_CONFIGS[noSports ? mode.slice(0, -NO_SPORTS.length) : mode];
  if (!base) throw new Error(`未知的构建模式 ${mode}：用 --mode dev、trial 或 prod，备用构建（不带运动健康）在后面加 ${NO_SPORTS}`);
  // 体验版和正式版只能请求备案过的 HTTPS 域名，配错了在构建时就停下。
  if (base.env !== "dev") {
    for (const board of base.boards) {
      if (!board.apiBase.startsWith("https://")) throw new Error(`${mode} 配置里 ${board.key} 的 apiBase 必须是 https 地址`);
    }
  }
  return noSports ? { config: dropBoard(base, "sports"), outputRoot: "dist-no-sports" } : { config: base, outputRoot: "dist" };
}
