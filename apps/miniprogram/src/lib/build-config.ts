// 构建期配置（config/boards.*.ts 之一）在运行时的入口。
import type { BoardConfig, BoardKey, BuildConfig } from "../../config/boards";

export const buildConfig: BuildConfig = BUILD_CONFIG;

export function boardConfig(key: BoardKey): BoardConfig {
  const board = buildConfig.boards.find((b) => b.key === key);
  if (!board) throw new Error(`构建配置里没有板块 ${key}`);
  return board;
}
