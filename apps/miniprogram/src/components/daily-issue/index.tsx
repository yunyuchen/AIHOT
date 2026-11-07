// 日报 tab 和某期日报共用：翻页条、钴蓝日数和刊名、时间窗、读数行、“今日头条”栏头、分节栏头和条目、页尾说明。内容和翻期均由真实接口驱动。
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
import { HeadTab } from "../head-tab";
import { Reading } from "../reading";
import { windowText } from "../reading/derive";
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
   * 按钮行下面画不画“提醒我明天的日报”：只有日报 tab 有，某期日报页没有（规格）。日报 tab 传了也要构建配置里这个板块配了
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
      <Head
        title={daily.title}
        heading={view.heading}
        pending={daily.date}
        view={view}
        stamp={stamp}
        span={windowText(daily.window)}
        onGo={onGo}
      />
      {view.lead && (
        <Lead lead={view.lead} board={board} reminder={reminderTemplate(remind, boardConfig(board))} draft={dailyDraft(board, daily)} />
      )}
      {screen.stale && <StaleNotice text={staleNotice(daily.generatedAt, now)} onRetry={onRetry} />}
      {view.empty ? (
        <PageState title={DAILY_COPY.empty} />
      ) : (
        <View>
          {view.sections.map((section) => (
            <Section key={section.key} section={section} onOpen={(id) => openPage(itemPage(board, id))} />
          ))}
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
  /** 时间窗“11月5日 08:00 至 11月6日 08:00”（components/reading/derive.ts 的 windowText）；没有时不画。 */
  span?: string | null;
  /** 日期切换不改变页面栈。 */
  onGo?: (date: string) => void;
}

function Head({ title, heading, pending, view = null, stamp, span = null, onGo }: HeadProps) {
  // 日数（“06”）只在日期合法时画；没有日数时刊名和读数都从页边起，有日数时读数对齐内容栏（x=88）。
  const day = heading && pending ? pending.slice(-2) : null;
  return (
    <View className="daily-head">
      <View className="daily-nav">
        <DayButton icon={prevIcon} label="前一天" target={view?.prev ?? null} onGo={onGo} />
        <Text className="daily-nav__date">{heading ? `${heading.day} ${heading.weekday}` : pending}</Text>
        <DayButton icon={nextIcon} label="后一天" target={view?.next ?? null} onGo={onGo} after />
      </View>
      {stamp && <Text className="daily-head__stamp">{stamp}</Text>}
      <View className="daily-head__issue">
        {day && <Text className="daily-head__day num">{day}</Text>}
        <View className="daily-head__id">
          <Text className="daily-head__title">{title}</Text>
          {span && <Text className="daily-head__span">{span}</Text>}
        </View>
      </View>
      <View className={day ? "daily-head__readings daily-head__readings--indent" : "daily-head__readings"}>
        <View className="daily-head__reading">
          <Reading value={view ? view.sectionCount : "—"} after="个分节" size="l" />
        </View>
        <View className="daily-head__reading">
          <Reading value={view ? view.itemCount : "—"} after="条" size="l" />
        </View>
        <View className="daily-head__reading">
          <Reading value={DAILY_COPY.issueTime} after="出刊" size="l" />
        </View>
      </View>
    </View>
  );
}

/** 翻页按钮：44 高，文字加箭头；没有相邻期（或内容还没到）时禁用。 */
interface DayButtonProps {
  icon: string;
  label: string;
  target: string | null;
  onGo?: (date: string) => void;
  /** “后一天”：箭头在字后面。 */
  after?: boolean;
}

function DayButton({ icon, label, target, onGo, after }: DayButtonProps) {
  const on = target !== null && !!onGo;
  return (
    <View
      className={on ? "daily-nav__btn" : "daily-nav__btn daily-nav__btn--off"}
      hoverClass={on ? "daily-nav__btn--down" : "none"}
      ariaRole="button"
      ariaLabel={label}
      onClick={on ? () => onGo!(target!) : undefined}
    >
      {!after && <Image className="daily-nav__icon daily-nav__icon--prev" src={icon} />}
      <Text>{label}</Text>
      {after && <Image className="daily-nav__icon daily-nav__icon--next" src={icon} />}
    </View>
  );
}

/**
 * 头条：“今日头条”栏头（头条或导语是模型写的就标“AI 摘要”）、头条和导语。按钮行：“收藏”（描边，日报 tab 和某期日报页都有，D28）和
 * “分享日报”（墨底、只写字，open-type 为 share，分享正在看的这一期）；“提醒我明天的日报”只在日报 tab 且配了模板 id，单独一行通栏描边，
 * 下面一句提示。
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
        <View>
          <HeadTab label="今日头条" aside={lead.ai ? <AiBadge /> : null} />
          <View className="daily-lead__body">
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
        </View>
      )}
      <View className="daily-lead__acts">
        <SaveButton draft={draft} variant="daily" />
        <ShareButton label="分享日报" className="daily-btn daily-btn--ink" />
      </View>
      {reminder && <RemindButton board={board} templateId={reminder} className="daily-btn--line" iconClassName="daily-btn__icon" />}
      {reminder && <Text className="daily-lead__hint">{REMINDER_COPY.hint}</Text>}
    </View>
  );
}

function Section({ section, onOpen }: { section: DailySectionView; onOpen: (itemId: string) => void }) {
  return (
    <View className="daily-sec">
      {/* 节名不是模型写的；节里任一条目的标题是模型写的就在栏头旁标一次（用户协议：日报在每个分节标题旁标）。分节不画分类色。 */}
      <HeadTab label={section.label} aside={[section.ai && <AiBadge />, <Reading value={section.count} after="条" size="s" />]} />
      <View className="daily-sec__items">
        {section.lines.map((line) => (
          <View key={line.key} className="daily-line" ariaRole="button" ariaLabel={line.title} hoverClass="daily-line--down" onClick={() => onOpen(line.itemId)}>
            <Text className="daily-line__title">{line.title}</Text>
            <Text className="daily-line__source">{line.source}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
