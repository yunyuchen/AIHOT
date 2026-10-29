/// <reference types="@tarojs/taro" />

declare module "*.png";
declare module "*.jpg";
declare module "*.scss";

/** 构建期配置，由 config/index.ts 按 --mode 选一份经 defineConstants 注入。 */
declare const BUILD_CONFIG: import("../config/boards").BuildConfig;

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: "development" | "production";
    TARO_ENV: "weapp" | "swan" | "alipay" | "h5" | "rn" | "tt" | "qq" | "jd" | "harmony" | "jdrn";
    TARO_APP_ID: string;
  }
}
