// 小程序出口的请求封装：按板块取 api 基址，超时 10 秒，不加自定义请求头，不开 enableCache，
// 同时最多 3 个请求；失败按错误码表映射成 Failure。读接口用 GET，提醒接口用 POST；另有分享图的预检（HEAD 一个绝对地址）。
import Taro from "@tarojs/taro";
import type { BoardKey } from "../../config/boards";
import { boardConfig } from "./build-config";
import { failureFromResponse, failureFromTransport, type Failure } from "./errors";
import { createGate } from "./gate";

export type Result<T> = { ok: true; data: T; status: number } | { ok: false; failure: Failure };

/** 和 app.config 的 networkTimeout.request 一致。 */
export const REQUEST_TIMEOUT_MS = 10_000;

const gate = createGate(3);

/** GET {apiBase}/api/mp/v1/{path}。data 按契约类型给出，形状由调用方再核对。 */
export function getJson<T>(board: BoardKey, path: string): Promise<Result<T>> {
  return send<T>(board, path, "GET");
}

/**
 * POST {apiBase}/api/mp/v1/{path}，body 按 JSON 发：wx.request 的 data 是对象时默认就是 application/json，不另加请求头。
 * 只有提醒接口用。
 */
export function postJson<T>(board: BoardKey, path: string, body: object): Promise<Result<T>> {
  return send<T>(board, path, "POST", body);
}

function send<T>(board: BoardKey, path: string, method: "GET" | "POST", body?: object): Promise<Result<T>> {
  const url = `${boardConfig(board).apiBase}/api/mp/v1/${path}`;
  return gate(async (): Promise<Result<T>> => {
    try {
      // wx.request 拿到任何 HTTP 响应都算成功，只有连不上和超时才走失败。
      const res = await Taro.request({ url, method, data: body, dataType: "json", timeout: REQUEST_TIMEOUT_MS, enableCache: false });
      if (res.statusCode >= 200 && res.statusCode < 300) return { ok: true, data: res.data as T, status: res.statusCode };
      return { ok: false, failure: failureFromResponse(res.statusCode, res.data) };
    } catch (err) {
      return { ok: false, failure: failureFromTransport((err as { errMsg?: string } | null)?.errMsg) };
    }
  });
}

/**
 * 分享图的预检：HEAD 一次绝对地址，回 HTTP 状态码；连不上、超时、域名不在 request 合法域名里都回 null。
 * 和其他请求一样排队（同时最多 3 个），不阻塞页面。
 */
export function headStatus(url: string): Promise<number | null> {
  return gate(async () => {
    try {
      const res = await Taro.request({ url, method: "HEAD", dataType: "text", timeout: REQUEST_TIMEOUT_MS, enableCache: false });
      return res.statusCode;
    } catch {
      return null;
    }
  });
}
