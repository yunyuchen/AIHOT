// “提醒我明天的日报”（只在日报 tab）：订阅授权、wx.login、写提醒接口这一串，以及各种结果给读者看什么。
// 纯逻辑，不依赖微信运行时：三个微信和网络接口由调用方注入（remind-button 组件接上 Taro），tests/ 里用假的直接跑。
// 点一次只登记明天那一期（目标日期由服务端按北京时间算），成功的状态只记在本次会话的内存里，不落本机存储。
import type { MiniprogramReminder, MiniprogramReminderRequest } from "@aihot/contracts/miniprogram";
import type { BoardConfig } from "../../config/boards";
import { beijingDate, headerDate } from "./beijing.ts";
import type { Result } from "./request";

/** 按钮和提示的文案（规格“提醒与订阅消息”）。 */
export const REMINDER_COPY = {
  button: "提醒我明天的日报",
  busy: "正在订阅…",
  done: "已订阅明天的日报",
  /** 按钮旁的一句，一直显示。 */
  hint: "点一次只提醒一次，明天想再收就再点一次",
  cancelled: "已取消",
  /** errCode 20004：读者关了订阅消息的总开关。 */
  switchedOffTitle: "订阅消息已关闭",
  switchedOff: "到设置里打开“订阅消息”，再点一次“提醒我明天的日报”",
  openSettings: "去设置",
  /** 打不开设置页时退一步，告诉读者从哪里进。 */
  settingsPath: "可在右上角“···”›“设置”里打开",
  unavailable: "暂时无法订阅，请稍后再试",
} as const;

/** 读者关了订阅消息总开关时 requestSubscribeMessage 的错误码。 */
export const SWITCHED_OFF_ERRCODE = 20004;

/**
 * 头条卡里的提醒按钮订哪个模板：只有日报 tab（remind 为真）画，并且构建配置里这个板块配了模板 id（去掉首尾空白不是空的）；
 * 某期日报页、模板 id 没配（客户还没申请到模板）时回 null，不画按钮和下面那句提示。
 */
export function reminderTemplate(remind: boolean, board: Pick<BoardConfig, "reminderTemplateId">): string | null {
  const id = board.reminderTemplateId?.trim() ?? "";
  return remind && id !== "" ? id : null;
}

/** requestSubscribeMessage 的结果：success 带每个模板 id 的选择，fail 带 errCode。 */
export type SubscribeAnswer = { ok: true; result: Readonly<Record<string, unknown>> } | { ok: false; errCode: number | null };

export interface ReminderDeps {
  /** 发起订阅授权（Taro.requestSubscribeMessage，传 1 个模板 id）。不抛错，失败回 { ok: false }。 */
  subscribe(templateId: string): Promise<SubscribeAnswer>;
  /** wx.login 拿 code；拿不到回 null。 */
  login(): Promise<string | null>;
  /** POST reminders。 */
  save(body: MiniprogramReminderRequest): Promise<Result<MiniprogramReminder>>;
  /** 本机时钟，只在响应里的 targetDate 不能用时兜底算“明天”。 */
  now(): number;
}

export type ReminderOutcome =
  /** 登记好了明天那一期：按钮改成“已订阅明天的日报”。 */
  | { kind: "subscribed"; targetDate: string }
  /** 读者在授权弹窗里拒绝：“已取消”。 */
  | { kind: "cancelled" }
  /** 20004：提示到设置里打开，给打开设置的入口。 */
  | { kind: "switched_off" }
  /** 提醒接口回 403 section_paused：按占位处理（重拉元信息，整页换成占位）。 */
  | { kind: "paused" }
  /** ban、filter、别的授权错误、拿不到 code、接口失败（503 reminders_disabled、429、400、网络）：“暂时无法订阅，请稍后再试”。 */
  | { kind: "unavailable" };

/**
 * 点按钮以后的整串。第一件事是同步发起订阅授权：微信只认点击回调里同步调用的 requestSubscribeMessage，先等任何网络请求都会失败，
 * 所以这个函数一进来就调 subscribe，后面的登录和请求都在授权结果回来以后。不会 reject。
 */
export function requestReminder(templateId: string, deps: ReminderDeps): Promise<ReminderOutcome> {
  const asked = deps.subscribe(templateId);
  return asked.then(async (answer) => {
    const verdict = subscribeVerdict(answer, templateId);
    if (verdict !== "accept") return verdict;
    const code = await deps.login();
    if (!code) return { kind: "unavailable" };
    return saveVerdict(await deps.save({ code, templateId }), deps.now());
  });
}

/**
 * 授权结果：这个模板是 accept 才往下走（新版本微信还有 acceptWithAudio 这类带提醒方式的同意，都按同意算）；reject 是“已取消”；
 * fail 的 20004 是总开关关了；ban（被封禁）、filter（同名模板被过滤）、没有这个模板的结果、其他错误码都是“暂时无法订阅”。
 */
export function subscribeVerdict(answer: SubscribeAnswer, templateId: string): "accept" | ReminderOutcome {
  if (!answer.ok) return answer.errCode === SWITCHED_OFF_ERRCODE ? { kind: "switched_off" } : { kind: "unavailable" };
  const choice = answer.result[templateId];
  if (typeof choice === "string" && choice.startsWith("accept")) return "accept";
  if (choice === "reject") return { kind: "cancelled" };
  return { kind: "unavailable" };
}

/** 提醒接口的结果：2xx 就是登记好了；403 section_paused 按占位；其他失败都是“暂时无法订阅”。 */
export function saveVerdict(result: Result<MiniprogramReminder>, now: number): ReminderOutcome {
  if (result.ok) {
    const target = (result.data as Partial<MiniprogramReminder> | null)?.targetDate;
    // 响应形状不对时行已经存下了，按成功算，目标日期用本机时钟的北京明天。
    return { kind: "subscribed", targetDate: typeof target === "string" && headerDate(target) ? target : beijingTomorrow(now) };
  }
  return result.failure.kind === "paused" ? { kind: "paused" } : { kind: "unavailable" };
}

/** 本机时钟的北京“明天”。 */
export function beijingTomorrow(now: number): string {
  return beijingDate(now + 24 * 3600 * 1000);
}

/**
 * 按钮这会儿是什么样：本次会话里登记过的目标日期还是明天，就是“已订阅明天的日报”（不能点）；正在走授权和请求时是“正在订阅…”
 * （不能点）；否则可以点。会话跨过了零点，昨天登记的那一期已经是今天，按钮恢复可点。
 */
export function reminderButton(busy: boolean, subscribedFor: string | null, now: number): { label: string; enabled: boolean; done: boolean } {
  if (subscribedFor !== null && subscribedFor === beijingTomorrow(now)) return { label: REMINDER_COPY.done, enabled: false, done: true };
  if (busy) return { label: REMINDER_COPY.busy, enabled: false, done: false };
  return { label: REMINDER_COPY.button, enabled: true, done: false };
}

/** 结果给读者看什么：登记好了只改按钮；已取消、暂时无法订阅是一条轻提示；总开关关了弹窗给“去设置”；占位是整页换成占位。 */
export type ReminderNotice = { kind: "none" } | { kind: "toast"; text: string } | { kind: "settings" } | { kind: "placeholder" };

export function reminderNotice(outcome: ReminderOutcome): ReminderNotice {
  switch (outcome.kind) {
    case "subscribed":
      return { kind: "none" };
    case "cancelled":
      return { kind: "toast", text: REMINDER_COPY.cancelled };
    case "switched_off":
      return { kind: "settings" };
    case "paused":
      return { kind: "placeholder" };
    case "unavailable":
      return { kind: "toast", text: REMINDER_COPY.unavailable };
  }
}
