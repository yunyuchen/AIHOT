// 收藏 tab：只读本机（saved.v1），断网也能列出；板块筛选不改变收藏顺序。
// 顶上钴蓝栏头“我的收藏”和条数、一行本机说明、板块筛选，下面是卡片（点条目进条目页，点日报进某期日报页），页面底部说明收藏只存本机、清理缓存或换手机会清空。
// 某个板块的元信息（这次会话内存里的，或本机快照里的）是占位时先隐藏这个板块的收藏（不删），恢复正常后重新出现，见 lib/saved.ts 的 boardHidden。
// 不开下拉刷新。
import { useState } from "react";
import { useDidShow } from "@tarojs/taro";
import { Image, Text, View } from "@tarojs/components";
import type { MiniprogramMeta } from "@aihot/contracts/miniprogram";
import type { BoardKey } from "../../../config/boards";
import dailyIcon from "../../assets/saved/daily.png";
import { HeadTab } from "../../components/head-tab";
import { Reading } from "../../components/reading";
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
import { useActiveTab } from "../../lib/use-active-tab";
import { storage } from "../../lib/wx-storage";
import "./index.scss";

type MetaSnapshots = Partial<Record<BoardKey, MiniprogramMeta | null>>;

function readMetaSnapshots(): MetaSnapshots {
  const snapshots: MetaSnapshots = {};
  for (const { key } of buildConfig.boards) snapshots[key] = readMetaSnapshot(storage, key);
  return snapshots;
}

export default function SavedPage() {
  useActiveTab();
  useTabShare();
  const entries = useSavedEntries();
  const states = useMetaStates();
  const [snapshots, setSnapshots] = useState(readMetaSnapshots);
  const [board, setBoard] = useState<BoardKey | "all">("all");
  const [, setAttempt] = useState(0);
  useDidShow(() => setSnapshots(readMetaSnapshots()));
  const shownBoards = buildConfig.boards.filter((b) => !boardHidden(states[b.key], snapshots[b.key] ?? null));
  const shown = entries ? visibleEntries(entries, shownBoards.map((b) => b.key)) : [];
  const activeBoard = board === "all" || shownBoards.some((item) => item.key === board) ? board : "all";
  const filtered = activeBoard === "all" ? shown : shown.filter((entry) => entry.board === activeBoard);
  const labels: Partial<Record<BoardKey, Record<string, string>>> = {};
  for (const { key } of shownBoards) labels[key] = savedLabels(states[key], snapshots[key] ?? null);
  const now = Date.now();
  return (
    <View className="saved">
      <View className="saved-head">
        <HeadTab label="我的收藏" aside={<Reading value={entries ? shown.length : "—"} after="条" size="m" />} />
        <View className="saved-head__sub">
          <Text className="saved-head__local">{SAVED_COPY.local}</Text>
          <Text>按收藏时间排序</Text>
        </View>
      </View>
      <View className="saved-filters">
        {(["all", ...shownBoards.map((item) => item.key)] as const).map((key) => {
          const selected = activeBoard === key;
          const label = key === "all" ? "全部" : buildConfig.boards.find((item) => item.key === key)?.name;
          return (
            <View
              key={key}
              className={selected ? "saved-filter saved-filter--on" : "saved-filter"}
              hoverClass={selected ? "none" : "saved-filter--down"}
              ariaRole="button"
              ariaLabel={label}
              onClick={() => setBoard(key)}
            >
              {label}
            </View>
          );
        })}
      </View>
      {entries === null && <PageState title={SAVED_COPY.unreadable} detail={SAVED_COPY.unreadableDetail} onRetry={() => setAttempt((n) => n + 1)} />}
      {entries !== null && filtered.length === 0 && (
        <PageState title={SAVED_COPY.emptyTitle} detail={activeBoard === "all" ? SAVED_COPY.emptyDetail : "该板块暂无收藏"} />
      )}
      {filtered.length > 0 && (
        <View className="saved-list">
          {filtered.map((entry) => (
            <SavedCard key={`${entry.kind}:${entry.board}:${entry.id}`} entry={entry} labels={labels[entry.board] ?? {}} now={now} />
          ))}
        </View>
      )}
      <View className="saved-note">
        <Text className="saved-note__text">
          {SAVED_COPY.note[0]}
          <Text className="saved-note__em">{SAVED_COPY.note[1]}</Text>
          {SAVED_COPY.note[2]}
        </Text>
      </View>
    </View>
  );
}

function SavedCard({ entry, labels, now }: { entry: SavedEntry; labels: Readonly<Record<string, string>>; now: number }) {
  const daily = entry.kind === "daily";
  const chip = daily ? null : categoryChip(entry.category, labels, boardConfig(entry.board).categoryColors);
  // 同一事实的来源数，≥ 2 才显示；日报和“只显示摘要”（null）不显示。
  const count = !daily && entry.sourceCount !== null && sourceCountChip(entry.sourceCount) ? entry.sourceCount : null;
  const savedOn = displayDate(entry.savedAt, now);
  const open = () => openPage(daily ? dailyIssuePage(entry.board, entry.id) : itemPage(entry.board, entry.id));
  return (
    <View className="saved-card" ariaRole="button" ariaLabel={entry.title || (daily ? entry.siteName : "查看收藏")} hoverClass="saved-card--down" onClick={open}>
      {(daily || chip || entry.ai) && (
        <View className="saved-card__meta">
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
          <Text className="saved-card__day">{headerDate(entry.id)?.day ?? entry.id}</Text>
        </View>
      ) : (
        <View className="saved-card__title">{entry.title}</View>
      )}
      {daily && entry.title && <View className="saved-card__lead">{entry.title}</View>}
      <View className="saved-card__foot">
        <Text className="saved-card__src">{daily ? "" : entry.sourceName}</Text>
        {count !== null && (
          <View className="saved-card__echo">
            <Reading value={count} after="家来源" size="s" body />
          </View>
        )}
        {savedOn && <Text className="saved-card__on">{savedOn} 收藏</Text>}
      </View>
    </View>
  );
}
