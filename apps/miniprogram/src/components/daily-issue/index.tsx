// 日报 tab 和某期日报共用：日期刊头、深墨头条、暖纸分节。内容和翻期均由真实接口驱动。
// 整屏状态（配置有误、占位、没有日报、404、加载失败、加载中、内容）由页面按 lib/daily.ts 的 dailyScreen 算好传进来。
import { Image, Text, View } from "@tarojs/components";
import type { BoardKey } from "../../../config/boards";
import nextIcon from "../../assets/daily/next.png";
import prevIcon from "../../assets/daily/prev.png";
import { boardConfig } from "../../lib/build-config";
import { DAILY_COPY, dailyView, type DailyScreen, type DailySectionView, type DailyView } from "../../lib/daily";
import { headerDate } from "../../lib/beijing";
import { openPage } from "../../lib/open-page";
import { itemPage } from "../../lib/page-stack";
import { REMINDER_COPY, reminderTemplate } from "../../lib/reminder";
import { dailyDraft, type SavedDraft } from "../../lib/saved";
import { snapshotStamp, staleNotice } from "../../lib/screen";
import { AiBadge } from "../ai-badge";
import { failureText, PageState, StaleNotice } from "../page-state";
import { RemindButton } from "../remind-button";
import { SaveButton } from "../save-button";
import { ShareButton } from "../share-button";
import "./index.scss";

interface Props {
  screen: DailyScreen;
  board: BoardKey;
  /** 内容还没到时头部的日报名：元信息的 board.siteName，还没有元信息时由页面给兜底。 */
  fallbackTitle: string;
  /**
   * 正在看的那一期（null 是最新一期）：内容还没到时头部写这个日期，最新一期写“最新一期”。某期日报页的日期参数不对时传原样的参数，
   * 头部照写。
   */
  date: string | null;
  /**
   * 头条卡里画不画“提醒我明天的日报”：只有日报 tab 有，某期日报页没有（规格）。日报 tab 传了也要构建配置里这个板块配了
   * 订阅模板 id 才画（lib/reminder.ts 的 reminderTemplate）。
   */
  remind: boolean;
  /** 前一天、后一天：页内切换。 */
  onGo: (date: string) => void;
  onRetry: () => void;
  /** “这一天没有日报”下面的“看最新一期”。 */
  onLatest: () => void;
}

export function DailyIssue({ screen, board, fallbackTitle, date, remind, onGo, onRetry, onLatest }: Props) {
  if (screen.kind === "mismatch" || screen.kind === "placeholder" || screen.kind === "off") {
    return (
      <View>
        {screen.kind === "mismatch" && (
          <PageState
            title="配置有误"
            detail={`接口回的板块是 ${screen.actual}，这里要的是 ${board}（${boardConfig(board).name}），请检查构建配置里的 api 地址`}
          />
        )}
        {screen.kind === "placeholder" && <PageState title={screen.title} detail={screen.body} />}
        {screen.kind === "off" && <PageState title={DAILY_COPY.off} />}
      </View>
    );
  }
  if (screen.kind !== "content") {
    const heading = date === null ? null : headerDate(date);
    return (
      <View>
        <Head title={fallbackTitle} heading={heading} pending={date === null ? "最新一期" : date} view={null} onGo={onGo} />
        {screen.kind === "loading" && <Text className="daily__status">加载中…</Text>}
        {screen.kind === "failed" && <PageState title="加载失败" detail={failureText(screen.failure)} onRetry={onRetry} />}
        {screen.kind === "missing" &&
          (screen.latest ? (
            <PageState title={DAILY_COPY.firstPending} />
          ) : (
            <PageState title={DAILY_COPY.noIssue} action={{ text: DAILY_COPY.latest, onClick: onLatest }} />
          ))}
      </View>
    );
  }

  const now = Date.now();
  const { daily } = screen;
  const view = dailyView(daily, boardConfig(board).categoryColors);
  const stamp = screen.snapshotAt ? snapshotStamp(screen.snapshotAt, now) : null;
  return (
    <View>
      <Head title={daily.title} heading={view.heading} pending={daily.date} view={view} stamp={stamp} onGo={onGo} />
      {view.lead && (
        <Lead lead={view.lead} board={board} reminder={reminderTemplate(remind, boardConfig(board))} draft={dailyDraft(board, daily)} />
      )}
      {screen.stale && <StaleNotice text={staleNotice(daily.generatedAt, now)} onRetry={onRetry} />}
      {view.empty ? (
        <PageState title={DAILY_COPY.empty} />
      ) : (
        <View>
          <View className="daily-secs">
            {view.sections.map((section) => (
              <Section key={section.key} section={section} onOpen={(id) => openPage(itemPage(board, id))} />
            ))}
          </View>
          <View className="daily-note">
            <AiBadge />
            <Text className="daily-note__text">{DAILY_COPY.note}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

interface HeadProps {
  title?: string;
  heading?: { day: string; weekday: string } | null;
  /** heading 为 null 时写的字（最新一期还没到时“最新一期”，日期不对时原样的日期）。 */
  pending?: string;
  /** 内容还没到时为 null：前后两个按钮不能点，读数是“—”。 */
  view?: DailyView | null;
  /** 快照的时间标记（“08:05 的内容”）。 */
  stamp?: string | null;
  /** 日期切换不改变页面栈。 */
  onGo?: (date: string) => void;
}

function Head({ title, heading, pending, view = null, stamp, onGo }: HeadProps) {
  return (
    <View className="daily-head">
      <View className="daily-nav">
        <DayButton icon={prevIcon} label="前一天" target={view?.prev ?? null} onGo={onGo} />
        <Text className="daily-head__date num">{heading ? `${heading.day} · ${heading.weekday}` : pending}</Text>
        <DayButton icon={nextIcon} label="后一天" target={view?.next ?? null} onGo={onGo} after />
      </View>
      {stamp && <Text className="daily-head__stamp num">{stamp}</Text>}
      <View className="daily-head__reading">
        <View className="daily-head__today">
          <Text className="daily-head__k">REECHI DAILY</Text>
          <Text className="daily-head__title">{title}</Text>
        </View>
        {heading && pending && <Text className="daily-head__number num">{pending.slice(-2)}</Text>}
      </View>
      <View className="daily-head__meters num">
        <Meter value={view ? String(view.sectionCount) : "—"} unit="个分节" />
        <Meter value={view ? String(view.itemCount) : "—"} unit="条" />
        <Meter value={DAILY_COPY.issueTime} unit="出刊" />
      </View>
    </View>
  );
}

/** 44px 日期切换触控区；没有相邻期时禁用。 */
interface DayButtonProps {
  icon: string;
  label: string;
  target: string | null;
  onGo?: (date: string) => void;
  /** 第二个按钮，和第一个隔 4。 */
  after?: boolean;
}

function DayButton({ icon, label, target, onGo, after }: DayButtonProps) {
  const on = target !== null && !!onGo;
  return (
    <View
      className={`daily-nav__btn${after ? " daily-nav__btn--after" : ""}${on ? "" : " daily-nav__btn--off"}`}
      hoverClass={on ? "daily-nav__btn--down" : "none"}
      ariaRole="button"
      ariaLabel={label}
      onClick={on ? () => onGo!(target!) : undefined}
    >
      <View className="daily-nav__ring">
        <Image className="daily-nav__icon" src={icon} />
      </View>
    </View>
  );
}

function Meter({ value, unit }: { value: string; unit: string }) {
  return (
    <View className="daily-head__meter">
      <Text className="daily-head__value">{value}</Text>
      <Text className="daily-head__unit">{unit}</Text>
    </View>
  );
}

/**
 * 头条卡。按钮行：“收藏”（components/save-button，日报 tab 和某期日报页都有，D28）；“提醒我明天的日报”（reminder 是订阅模板 id，
 * 为 null 时不画）下面一行写“点一次只提醒一次……”；“分享日报”是 open-type 为 share 的按钮，走页面的分享回调（lib/use-share.ts），
 * 分享的是正在看的这一期。
 */
interface LeadProps {
  lead: NonNullable<DailyView["lead"]>;
  board: BoardKey;
  reminder: string | null;
  draft: SavedDraft;
}

function Lead({ lead, board, reminder, draft }: LeadProps) {
  return (
    <View className="daily-lead">
      {lead.headline && (
        <View className="daily-lead__headline">
          <View className="daily-lead__row">
            <View className="daily-lead__flag">
              今日头条
            </View>
            <View className="daily-lead__gap" />
            {lead.ai && <AiBadge />}
          </View>
          {lead.headline.title && (
            <Text className="daily-lead__title" userSelect>
              {lead.headline.title}
            </Text>
          )}
          {lead.headline.paragraph && (
            <Text className="daily-lead__text" userSelect>
              {lead.headline.paragraph}
            </Text>
          )}
        </View>
      )}
      <View className="daily-lead__acts">
        <SaveButton draft={draft} variant="daily" />
        {reminder && <RemindButton board={board} templateId={reminder} className="daily-btn daily-btn--ghost" iconClassName="daily-btn__icon" />}
        <ShareButton label="分享日报" className={reminder ? "daily-btn daily-btn--solid daily-btn--next" : "daily-btn daily-btn--solid"} iconClassName="daily-btn__icon" />
      </View>
      {reminder && <Text className="daily-lead__hint">{REMINDER_COPY.hint}</Text>}
    </View>
  );
}

function Section({ section, onOpen }: { section: DailySectionView; onOpen: (itemId: string) => void }) {
  return (
    <View className="daily-sec">
      <View className="daily-sec__head">
        {section.color ? (
          <View className="daily-sec__dot" style={{ background: section.color }} />
        ) : (
          <View className="daily-sec__dot daily-sec__dot--flash" />
        )}
        <Text className="daily-sec__label">{section.label}</Text>
        {section.ai && (
          <View className="daily-sec__badge">
            <AiBadge />
          </View>
        )}
        <Text className="daily-sec__count num">{section.count} 条</Text>
      </View>
      {section.lines.map((line) => (
        <View key={line.key} className="daily-line" ariaRole="button" ariaLabel={line.title} hoverClass="daily-line--down" onClick={() => onOpen(line.itemId)}>
          <Text className="daily-line__title">{line.title}</Text>
          <Text className="daily-line__source">{line.source}</Text>
        </View>
      ))}
    </View>
  );
}
