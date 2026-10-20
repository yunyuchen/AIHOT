// Taro 构建配置。--mode 选构建期配置：dev（开发）、trial（体验）、prod（正式），加 -no-sports 是不带运动健康 tab 的备用构建，
// 见 modes.ts 和 package.json 的脚本。
import { defineConfig } from "@tarojs/cli";
import { buildTarget } from "./modes.ts";

export default defineConfig<"webpack5">((_merge, { mode }) => {
  const { config, outputRoot } = buildTarget(mode);
  return {
    projectName: "reechi-miniprogram",
    // 设计稿宽度按原型取 390，样式里直接写原型的 px，由 Taro 换算成 rpx。
    designWidth: 390,
    deviceRatio: { 390: 750 / 390, 375: 2, 640: 2.34 / 2, 750: 1, 828: 1.81 / 2 },
    sourceRoot: "src",
    outputRoot,
    // src/app.config.ts 也读它：tabBar 和页面按板块列表推出来。
    defineConstants: {
      BUILD_CONFIG: JSON.stringify(config),
    },
    framework: "react",
    compiler: "webpack5",
    cache: { enable: false },
    mini: {
      postcss: {
        pxtransform: { enable: true, config: {} },
      },
    },
  };
});
