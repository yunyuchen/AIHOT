// 整屏的状态块（加载失败、空态、占位、配置有误、文档不存在、条目已下线）：标题、可选的一句说明、可选的重试或别的按钮。
// 另有已有内容时请求失败的顶部提示条。
import { Text, View } from "@tarojs/components";
import type { Failure } from "../../lib/errors";
import "./index.scss";

interface Props {
  title: string;
  detail?: string | null;
  onRetry?: () => void;
  /** 重试以外的按钮（条目已下线时“回到精选”），样子和重试一样。 */
  action?: { text: string; onClick: () => void };
  /** 第二个按钮，浅灰底，排在后面（收藏过的条目已下线时，“从收藏移除”后面的“回到精选”）。 */
  secondary?: { text: string; onClick: () => void };
}

export function PageState({ title, detail, onRetry, action, secondary }: Props) {
  const button = onRetry ? { text: "重试", onClick: onRetry } : action;
  return (
    <View className="page-state">
      <Text className="page-state__title">{title}</Text>
      {detail && <Text className="page-state__detail">{detail}</Text>}
      {button && (
        <View className="page-state__retry" hoverClass="page-state__retry--down" onClick={button.onClick}>
          {button.text}
        </View>
      )}
      {secondary && (
        <View className="page-state__retry page-state__retry--ghost" hoverClass="page-state__retry--down" onClick={secondary.onClick}>
          {secondary.text}
        </View>
      )}
    </View>
  );
}

/** 已有内容（含快照）时请求失败：列表不清空，顶部一条提示，整条可点重试。 */
export function StaleNotice({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View className="stale-notice" hoverClass="stale-notice--down" onClick={onRetry}>
      <Text className="stale-notice__text">{text}</Text>
      <Text className="stale-notice__retry">重试</Text>
    </View>
  );
}

/** 请求失败时给读者看的一句话。 */
export function failureText(failure: Failure): string {
  switch (failure.kind) {
    case "network":
      return "网络连不上，检查网络后重试";
    case "timeout":
      return "等了 10 秒还没有回应，稍后重试";
    case "unavailable":
      return "服务暂时不可用，稍后重试";
    default:
      return "出了点问题，稍后重试";
  }
}
