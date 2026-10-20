// “提醒我明天的日报”（只在日报 tab 的头条卡里，模板 id 配了才画）：点一下先同步弹订阅授权，同意后用 wx.login 的 code 登记明天
// 那一期的提醒，成功后按钮改成“已订阅明天的日报”、不能再点（只记本次会话）。流程和各种结果给读者看什么在 lib/reminder.ts，
// 这里接上 Taro 的接口、轻提示、“去设置”弹窗和占位。任何失败都不影响看日报。
import { useState } from "react";
import Taro from "@tarojs/taro";
import { Image, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import type { MiniprogramReminder } from "@aihot/contracts/miniprogram";
import bellIcon from "../../assets/daily/bell.png";
import { useBoardMeta } from "../../lib/meta-context";
import { REMINDER_COPY, reminderButton, reminderNotice, requestReminder, type ReminderDeps } from "../../lib/reminder";
import { postJson } from "../../lib/request";
import "./index.scss";

/** 本次会话里登记好的目标日期（翻期时头条卡会重画，状态不能只放在组件里）。不落本机存储。 */
let subscribedFor: string | null = null;

interface Props {
  board: BoardKey;
  templateId: string;
  /** 按钮的样子（日报 daily-btn），和原来画的 View 一样。 */
  className: string;
  iconClassName: string;
}

export function RemindButton({ board, templateId, className, iconClassName }: Props) {
  const { reload } = useBoardMeta(board);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState(subscribedFor);
  const button = reminderButton(busy, target, Date.now());

  const deps: ReminderDeps = {
    subscribe: (id) =>
      Taro.requestSubscribeMessage({ tmplIds: [id] } as Taro.requestSubscribeMessage.Option).then(
        (result) => ({ ok: true as const, result: result as Readonly<Record<string, unknown>> }),
        (err: { errCode?: unknown } | null) => ({ ok: false as const, errCode: typeof err?.errCode === "number" ? err.errCode : null }),
      ),
    login: () => Taro.login().then((res) => res.code || null, () => null),
    save: (body) => postJson<MiniprogramReminder>(board, "reminders", body),
    now: Date.now,
  };

  const onTap = () => {
    if (!button.enabled) return;
    // 第一件事：同步发起订阅授权（requestReminder 一进来就调 requestSubscribeMessage），前面不能有任何等待。
    const pending = requestReminder(templateId, deps);
    setBusy(true);
    void pending.then((outcome) => {
      setBusy(false);
      if (outcome.kind === "subscribed") {
        subscribedFor = outcome.targetDate;
        setTarget(outcome.targetDate);
      }
      const notice = reminderNotice(outcome);
      if (notice.kind === "toast") void Taro.showToast({ title: notice.text, icon: "none" }).catch(() => {});
      if (notice.kind === "settings") openSettings();
      // 整改开关为占位：强制重拉元信息，日报 tab 跟着换成占位（同日报回 section_paused）。
      if (notice.kind === "placeholder") void reload();
    });
  };

  return (
    <View
      className={`remind-button ${className}${button.done ? " remind-button--done" : ""}${busy ? " remind-button--busy" : ""}`}
      hoverClass={button.enabled ? "remind-button--down" : "none"}
      ariaRole="button"
      onClick={onTap}
    >
      <Image className={iconClassName} src={bellIcon} />
      {button.label}
    </View>
  );
}

/**
 * 20004（订阅消息总开关关了）：弹窗说明，点“去设置”打开小程序的设置页；打不开时告诉读者从哪里进。
 * 微信只认读者点击之后同步调用的 openSetting，所以在弹窗的 success 回调里直接调，不放进 Promise 的 then（晚一拍的微任务）。
 */
function openSettings() {
  Taro.showModal({
    title: REMINDER_COPY.switchedOffTitle,
    content: REMINDER_COPY.switchedOff,
    confirmText: REMINDER_COPY.openSettings,
    success: (res) => {
      if (res.confirm) Taro.openSetting().catch(() => Taro.showToast({ title: REMINDER_COPY.settingsPath, icon: "none" }).catch(() => {}));
    },
  }).catch(() => {});
}
