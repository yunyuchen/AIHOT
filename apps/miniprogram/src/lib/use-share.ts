// 分享的 React hook：把 share.ts 的载荷接到 useShareAppMessage 上，带上包里的兜底图，并预检分享图。
// 页面配置里要写 enableShareAppMessage: true，Taro 才给页面注册 onShareAppMessage（不写时右上角转发是灰的）；
// 每个页面只调一次这里的 hook（Taro 会把同一页的多个回调都跑一遍，只取第一个的返回值）。
import { useEffect } from "react";
import { useShareAppMessage } from "@tarojs/taro";
import fallbackImage from "../assets/share/fallback.png";
import { buildConfig } from "./build-config";
import { headStatus } from "./request";
import { probeFailed, shareFields, tabShare, type ShareBasis, type SharePayload } from "./share";

/** 本次会话里预检过的分享图：地址 → 结果。不落本机存储。 */
const probes = new Map<string, "pending" | "ok" | "failed">();

export const SHARE_BASIS: ShareBasis = {
  appName: buildConfig.appName,
  // 大于 2KB，Taro 输出成代码包里的文件（/assets/share/fallback.png），不会内联成 base64（分享接口不认 data URI）。
  fallbackImage,
  imageFailed: (url) => probes.get(url) === "failed",
};

/**
 * 页面拿到 share 字段以后预检一次分享图（每个地址每次会话一次）：HEAD 回了 4xx、5xx 就记下，之后分享用兜底图。
 * 不阻塞页面，结果回来也不用重绘：分享回调在分享那一刻才读结果。顺带让服务端先把图画好放进缓存，微信拉图时更快。
 */
export function useShareImageProbe(share: unknown): void {
  const url = shareFields(share).imageUrl;
  useEffect(() => {
    if (url === null || probes.has(url)) return;
    probes.set(url, "pending");
    void headStatus(url).then((status) => probes.set(url, probeFailed(status) ? "failed" : "ok"));
  }, [url]);
}

/** 条目页、某期日报页：页内的分享按钮和右上角菜单走这一个回调，build 在分享那一刻只读页面已有的数据，不请求。 */
export function usePageShare(build: () => SharePayload): void {
  useShareAppMessage(() => build());
}

/**
 * 五个 tab 页（精选、日报、运动健康、收藏、锐奇）：右上角菜单转发小程序本身（D27：指向精选，标题“锐奇热点”，包里的兜底图）。
 * 日报 tab 另传 issue：头条卡的“分享日报”按钮（from 为 button）分享正在看的那一期。
 */
export function useTabShare(issue?: () => SharePayload): void {
  useShareAppMessage((res) => tabShare(res.from, res.from === "button" && issue ? issue() : null, SHARE_BASIS));
}
