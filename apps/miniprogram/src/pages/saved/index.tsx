// 收藏 tab：只读本机（saved.v1），不请求接口，断网也能列出。深色头部（“按收藏时间，新的在上”、条数、“保存在这台手机上，换设备不同步”），
// 下面按收藏时间倒序一张张卡：条目是分类、“AI 摘要”、标题、来源、“N 家在报”和收藏日期；日报是“日报”标签、日报名和日期、头条和收藏日期。
// 点条目进条目页，点日报进某期日报页。页面底部说明收藏只存本机、清理缓存或换手机会清空。
// 某个板块的元信息（这次会话内存里的，或本机快照里的）是占位时先隐藏这个板块的收藏（不删），恢复正常后重新出现，见 lib/saved.ts 的 boardHidden。
// 不开下拉刷新。
import { useState } from "react";
import { useDidShow } from "@tarojs/taro";
import { Image, Text, View } from "@tarojs/components";
import type { MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../../../config/boards";
import logo from "../../assets/logo.png";
import bookmarkIcon from "../../assets/saved/bookmark.png";
import dailyIcon from "../../assets/saved/daily.png";
import deviceIcon from "../../assets/saved/device.png";
import infoIcon from "../../assets/saved/info.png";
import { AiBadge } from "../../components/ai-badge";
import { CategoryTag } from "../../components/category-tag";
import { PageState } from "../../components/page-state";
import { displayDate, headerDate } from "../../lib/beijing";
import { boardConfig, buildConfig } from "../../lib/build-config";
import { categoryChip, sourceCountChip } from "../../lib/card";
import { useMetaStates } from "../../lib/meta-context";
import { openPage } from "../../lib/open-page";
import { dailyIssuePage, itemPage } from "../../lib/page-stack";
import { boardHidden, readMetaSnapshot, SAVED_COPY, savedLabels, visibleEntries, type SavedEntry } from "../../lib/saved";
import { useSavedEntries } from "../../lib/use-saved";
import { useTabShare } from "../../lib/use-share";
import { storage } from "../../lib/wx-storage";
import "./index.scss";

/** 头部条数后面的小圆点最多画几个。 */
const MAX_TALLY_DOTS = 5;

type MetaSnapshots = Partial<Record<BoardKey, MiniprogramMeta | null>>;

/** 各板块本机快照里的元信息（占位的也读）：读本机存储，不发请求。 */
function readMetaSnapshots(): MetaSnapshots {
  const snapshots: MetaSnapshots = {};
  for (const { key } of buildConfig.boards) snapshots[key] = readMetaSnapshot(storage, key);
  return snapshots;
}

export default function SavedPage() {
  // 右上角转发小程序本身（D27：指向精选）。
  useTabShare();
  const entries = useSavedEntries();
  const states = useMetaStates();
  const [snapshots, setSnapshots] = useState(readMetaSnapshots);
  // 本机存储读不出来时的重试：重画一次就会再读。
  const [, setAttempt] = useState(0);
  // 切回这个 tab：收藏可能在别的页面改过（收藏按钮直接通知，这里不用管），快照里的元信息可能换过，重读一次。
  useDidShow(() => setSnapshots(readMetaSnapshots()));

  const shownBoards = buildConfig.boards.filter((b) => !boardHidden(states[b.key], snapshots[b.key] ?? null)).map((b) => b.key);
  const shown = entries ? visibleEntries(entries, shownBoards) : [];
  const labels: Partial<Record<BoardKey, Record<string, string>>> = {};
  for (const key of shownBoards) labels[key] = savedLabels(states[key], snapshots[key] ?? null);
  const now = Date.now();

  return (
    <View className="saved">
      <Head count={entries ? shown.length : null} />
      {entries === null && <PageState title={SAVED_COPY.unreadable} detail={SAVED_COPY.unreadableDetail} onRetry={() => setAttempt((n) => n + 1)} />}
      {entries !== null && shown.length === 0 && <PageState title={SAVED_COPY.emptyTitle} detail={SAVED_COPY.emptyDetail} />}
      {shown.length > 0 && (
        <View className="saved-list">
          {shown.map((entry) => (
            <SavedCard key={`${entry.kind}:${entry.board}:${entry.id}`} entry={entry} labels={labels[entry.board] ?? {}} now={now} />
          ))}
        </View>
      )}
      <View className="saved-note">
        <Image className="saved-note__icon" src={infoIcon} />
        <Text className="saved-note__text">
          {SAVED_COPY.note[0]}
          <Text className="saved-note__em">{SAVED_COPY.note[1]}</Text>
          {SAVED_COPY.note[2]}
        </Text>
      </View>
    </View>
  );
}

/** 深色头部。count 为 null（本机存储读不出来）时条数写“—”。 */
function Head({ count }: { count: number | null }) {
  return (
    <View className="saved-head">
      <View className="saved-head__brand">
        <Image className="saved-head__logo" src={logo} />
        <Text className="saved-head__app">{buildConfig.appName}</Text>
      </View>
      <View className="saved-head__reading">
        <View>
          <Text className="saved-head__k">按收藏时间，新的在上</Text>
          <Text className="saved-head__title">收藏</Text>
        </View>
        <View className="saved-head__tally num">
          <Text className="saved-head__count">{count ?? "—"}</Text>
          <View className="saved-head__lbl">
            <Text className="saved-head__unit">条</Text>
            <View className="saved-head__bars">
              {Array.from({ length: Math.min(count ?? 0, MAX_TALLY_DOTS) }, (_, i) => (
                <View key={i} className="saved-head__bar" />
              ))}
            </View>
          </View>
        </View>
      </View>
      <View className="saved-head__local">
        <Image className="saved-head__device" src={deviceIcon} />
        <Text>{SAVED_COPY.local}</Text>
      </View>
    </View>
  );
}

function SavedCard({ entry, labels, now }: { entry: SavedEntry; labels: Readonly<Record<string, string>>; now: number }) {
  const daily = entry.kind === "daily";
  const chip = daily ? null : categoryChip(entry.category, labels, boardConfig(entry.board).categoryColors);
  const echo = daily || entry.sourceCount === null ? null : sourceCountChip(entry.sourceCount);
  const savedOn = displayDate(entry.savedAt, now);
  const open = () => openPage(daily ? dailyIssuePage(entry.board, entry.id) : itemPage(entry.board, entry.id));
  return (
    <View className="saved-card" hoverClass="saved-card--down" onClick={open}>
      {(daily || chip || entry.ai) && (
        <View className="saved-card__row">
          {daily ? (
            <View className="saved-card__kind">
              <Image className="saved-card__kind-icon" src={dailyIcon} />
              日报
            </View>
          ) : (
            chip && <CategoryTag chip={chip} />
          )}
          <View className="saved-card__gap" />
          {entry.ai && <AiBadge />}
        </View>
      )}
      {daily ? (
        <View className="saved-card__title">
          {entry.siteName}
          <Text className="saved-card__day num">{headerDate(entry.id)?.day ?? entry.id}</Text>
        </View>
      ) : (
        <View className="saved-card__title">{entry.title}</View>
      )}
      {daily && entry.title && <View className="saved-card__lead">{entry.title}</View>}
      <View className="saved-card__foot">
        <Text className="saved-card__src">{daily ? "" : entry.sourceName}</Text>
        {echo && (
          <View className="saved-card__echo num">
            <View className="saved-card__bars">
              {Array.from({ length: echo.dots }, (_, i) => (
                <View key={i} className="saved-card__bar" />
              ))}
            </View>
            {echo.label}
          </View>
        )}
        {savedOn && (
          <View className="saved-card__on num">
            <Image className="saved-card__on-icon" src={bookmarkIcon} />
            {savedOn} 收藏
          </View>
        )}
      </View>
    </View>
  );
}
