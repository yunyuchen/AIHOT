// storage.ts 接上微信的本机存储（单个 key 上限 1MB，总共 10MB）。抛错由 storage.ts 兜住。
import Taro from "@tarojs/taro";
import { createStorage } from "./storage";

export const storage = createStorage({
  get: (key) => Taro.getStorageSync(key),
  set: (key, value) => Taro.setStorageSync(key, value),
  remove: (key) => Taro.removeStorageSync(key),
});
