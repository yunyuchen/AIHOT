// WeChat mini program server APIs for the daily reminder: a login code exchanged for the reader's openid,
// the access token (stable_token, normal mode) and one-time subscribe messages. They cost nothing, so no
// receipt and no budget. WECHAT_SUBSCRIBE_PUSH_ENABLED is the safety valve for every request to WeChat,
// read at call time: off, nothing here is called. The app's id, secret, reminder template and
// miniprogram_state are WECHAT_MINIPROGRAM_* in the integrations group. Nothing here logs a login code or
// an openid, and no error message carries one.
import { credential } from "../config.ts";

const API = "https://api.weixin.qq.com";

export const wechatSubscribePushEnabled = () => process.env.WECHAT_SUBSCRIBE_PUSH_ENABLED === "true";

export type MiniprogramState = "developer" | "trial" | "formal";

export interface MiniprogramApp {
  appId: string;
  secret: string;
  /** The one-time subscribe template the mini program asks the reader for. */
  templateId: string;
  /** Which build a subscribe message opens: trial for the test build, formal (the default) once released. */
  state: MiniprogramState;
}

/** The app's credentials; null while any of id, secret and template is missing. */
export function miniprogramApp(): MiniprogramApp | null {
  const appId = credential("integrations", "WECHAT_MINIPROGRAM_APPID");
  const secret = credential("integrations", "WECHAT_MINIPROGRAM_SECRET");
  const templateId = credential("integrations", "WECHAT_MINIPROGRAM_REMINDER_TEMPLATE_ID");
  if (!appId || !secret || !templateId) return null;
  const state = credential("integrations", "WECHAT_MINIPROGRAM_STATE");
  return { appId, secret, templateId, state: state === "developer" || state === "trial" ? state : "formal" };
}

/** WeChat could not answer (5xx, timeout, connection loss, busy, an unexpected answer): try again later. */
export class WechatUnavailable extends Error {}

// A code that is wrong, already used or expired, or a reader WeChat blocks: asking again will not help.
const CODE_REFUSED = new Set([40029, 40163, 40226]);

/** jscode2session: the reader's openid, or "invalid" for a code WeChat refuses. session_key and unionid are dropped. */
export async function openidForCode(app: MiniprogramApp, code: string): Promise<{ openid: string } | "invalid"> {
  const url = new URL(`${API}/sns/jscode2session`);
  url.search = new URLSearchParams({ appid: app.appId, secret: app.secret, js_code: code, grant_type: "authorization_code" }).toString();
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  } catch (error) {
    throw new WechatUnavailable(`jscode2session: ${error instanceof Error && error.name === "TimeoutError" ? "timeout" : "connection failed"}`);
  }
  if (!res.ok) throw new WechatUnavailable(`jscode2session: HTTP ${res.status}`);
  const json = (await res.json().catch(() => null)) as { openid?: string; errcode?: number } | null;
  if (json?.errcode && CODE_REFUSED.has(json.errcode)) return "invalid";
  if (!json?.openid) throw new WechatUnavailable(`jscode2session: errcode ${json?.errcode ?? "none"}`);
  return { openid: json.openid };
}

// Per app id, so a changed app never reuses another's token. Shared by every send in the process.
const tokens = new Map<string, { token: string; expires: number }>();

/**
 * The access token from stable_token (normal mode), kept until five minutes before it expires. `force`
 * asks WeChat for a new one (limited to 20 a day): only after a send was refused for an invalid token.
 */
export async function accessToken(app: MiniprogramApp, force = false): Promise<string> {
  const cached = tokens.get(app.appId);
  if (!force && cached && cached.expires - 5 * 60_000 > Date.now()) return cached.token;
  let res: Response;
  try {
    res = await fetch(`${API}/cgi-bin/stable_token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credential", appid: app.appId, secret: app.secret, force_refresh: force }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new WechatUnavailable(`stable_token: ${error instanceof Error && error.name === "TimeoutError" ? "timeout" : "connection failed"}`);
  }
  const json = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; errcode?: number; errmsg?: string } | null;
  if (!res.ok || !json?.access_token) throw new WechatUnavailable(`stable_token: ${res.ok ? `errcode ${json?.errcode ?? "none"} ${String(json?.errmsg ?? "").slice(0, 80)}` : `HTTP ${res.status}`}`);
  tokens.set(app.appId, { token: json.access_token, expires: Date.now() + (json.expires_in ?? 7200) * 1000 });
  return json.access_token;
}

export interface SubscribeMessage {
  touser: string;
  template_id: string;
  page: string;
  data: Record<string, { value: string }>;
}

/**
 * sent; failed (refused for sure: 43101, any other error code, an HTTP 4xx); unknown (it may have gone out:
 * 5xx, timeout, connection loss, WeChat busy); token (the token was refused, so nothing went out).
 */
export type SendOutcome = { status: "sent" } | { status: "failed" | "unknown" | "token"; reason: string };

const TOKEN_REFUSED = new Set([40001, 42001]);

export async function sendSubscribeMessage(app: MiniprogramApp, token: string, message: SubscribeMessage): Promise<SendOutcome> {
  let res: Response;
  try {
    res = await fetch(`${API}/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...message, miniprogram_state: app.state, lang: "zh_CN" }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { status: "unknown", reason: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "connection lost" };
  }
  if (res.status >= 500) return { status: "unknown", reason: `HTTP ${res.status}` };
  if (!res.ok) return { status: "failed", reason: `HTTP ${res.status}` };
  const json = (await res.json().catch(() => null)) as { errcode?: number } | null;
  if (!json) return { status: "unknown", reason: "unreadable answer" };
  if (!json.errcode) return { status: "sent" };
  if (TOKEN_REFUSED.has(json.errcode)) return { status: "token", reason: String(json.errcode) };
  if (json.errcode === -1) return { status: "unknown", reason: "-1" };
  return { status: "failed", reason: String(json.errcode) };
}
