// 请求失败到页面状态的映射，按规格的错误码表。纯函数，tests/ 里直接跑。
// 不认识的错误码按通用错误处理（契约 v1 内会加新错误码）。

export type FailureKind =
  /** 400 参数不对：通用错误。 */
  | "invalid_request"
  /** 400 游标失效：从第一页重新加载。 */
  | "invalid_cursor"
  /** 404：显示对应的空态。 */
  | "not_found"
  /** 403 section_paused：整改开关为占位，显示占位，不算错误。 */
  | "paused"
  /** 429：提示稍后再试。 */
  | "rate_limited"
  /** 503：错误态加重试（提醒接口的 reminders_disabled 也归这里，看 code 区分）。 */
  | "unavailable"
  /** 连不上：错误态加重试。 */
  | "network"
  /** 超过 10 秒没回：错误态加重试。 */
  | "timeout"
  /** 不认识的错误码、响应形状不对：通用错误。 */
  | "error";

export interface Failure {
  kind: FailureKind;
  /** HTTP 状态码；没拿到响应时为 null。 */
  status: number | null;
  /** 问题体里的错误码。 */
  code: string | null;
  requestId: string | null;
}

const KIND_BY_CODE = new Map<string, FailureKind>([
  ["invalid_request", "invalid_request"],
  ["invalid_cursor", "invalid_cursor"],
  ["not_found", "not_found"],
  ["section_paused", "paused"],
  ["rate_limited", "rate_limited"],
  ["reminders_disabled", "unavailable"],
  ["temporarily_unavailable", "unavailable"],
]);

/** 拿到了非 2xx 响应：按问题体的 code 映射；没有可认的 code 时 5xx 当暂时不可用，其余当通用错误。 */
export function failureFromResponse(status: number, body: unknown): Failure {
  const problem = asRecord(typeof body === "string" ? safeParse(body) : body);
  const code = typeof problem?.code === "string" ? problem.code : null;
  const requestId = typeof problem?.requestId === "string" ? problem.requestId : null;
  const kind = (code ? KIND_BY_CODE.get(code) : undefined) ?? (status >= 500 ? "unavailable" : "error");
  return { kind, status, code, requestId };
}

/** 没拿到响应（wx.request 走了 fail）：errMsg 里带 timeout 的算超时，其余算网络错误。 */
export function failureFromTransport(errMsg: string | undefined): Failure {
  const kind = /time\s?out/i.test(errMsg ?? "") ? "timeout" : "network";
  return { kind, status: null, code: null, requestId: null };
}

/** 2xx 但响应不是期望的形状。 */
export function malformedResponse(status: number): Failure {
  return { kind: "error", status, code: null, requestId: null };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
