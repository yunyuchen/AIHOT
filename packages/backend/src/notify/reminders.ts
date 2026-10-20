// "提醒我明天的日报": a reader's one-time WeChat subscribe message for the next day's daily. The mini
// program posts a login code (apps/api/src/routes/miniprogram-reminders.ts); the openid it stands for is
// kept for that one message only (miniprogram_reminders), with the daily's date, the template and when it
// was asked for. Once that daily is saved (08:00 onwards) and has items, each row is sent once and deleted
// as soon as the send has an outcome: pending → sending → gone, the content pushes' state machine without
// the record. A failed send is not retried; one whose outcome is unknown is never resent. A row left
// sending for 15 minutes is dropped as unknown by the recovery (ops.recover), and any row 48 hours after it
// was asked for is dropped by the sender and the daily housekeeping (ops.retention), unsent. Every run's
// counts go into job_runs (the admin's runs page reads them back, and the alerts). Free of charge, so no
// receipt and no budget. The safety valve is WECHAT_SUBSCRIBE_PUSH_ENABLED (notify/wechat.ts).
import { addDays, beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { BOARD, siteDaily } from "@aihot/industry/site";
import { sql } from "../db.ts";
import { enqueue, QUEUES, shutdownSignal } from "../jobs/queue.ts";
import { accessToken, miniprogramApp, openidForCode, sendSubscribeMessage, wechatSubscribePushEnabled, WechatUnavailable, type MiniprogramApp, type SendOutcome } from "./wechat.ts";

const TTL_MS = 48 * 3600_000;
const STALE_SENDING_MS = 15 * 60_000;

export class ReminderRejected extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfter?: number;
  /** For the log: why WeChat could not be used (never a login code or an openid). */
  readonly reason?: string;
  constructor(status: number, code: string, message: string, opts: { retryAfter?: number; reason?: string } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = opts.retryAfter;
    this.reason = opts.reason;
  }
}

/** Always the day after the request, in Beijing: the mini program's own date is not trusted. */
export function reminderTargetDate(now: Date): string {
  return addDays(beijingDate(now), 1);
}

function readBody(input: unknown): { code: string; templateId: string } {
  const body = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : null;
  const bad = (detail: string) => new ReminderRejected(400, "invalid_request", detail);
  if (!body) throw bad("The body must be a JSON object with code and templateId.");
  const unknown = Object.keys(body).filter((k) => k !== "code" && k !== "templateId");
  if (unknown.length) throw bad(`Unknown field: ${unknown[0]}.`);
  const { code, templateId } = body;
  if (typeof code !== "string" || code.length < 1 || code.length > 128) throw bad("code must be the login code from wx.login.");
  if (typeof templateId !== "string" || templateId.length < 1 || templateId.length > 128) throw bad("templateId must be the subscribe template the reader accepted.");
  return { code, templateId };
}

/**
 * Stores one reminder for tomorrow's daily; asking again on the same day keeps the one row. Off or not
 * configured: 503 reminders_disabled before anything else, and WeChat is never asked. A template other
 * than this instance's is refused before WeChat is asked. Nothing is stored unless WeChat gave an openid.
 */
export async function createReminder(input: unknown, now = new Date()): Promise<{ targetDate: string }> {
  const app = wechatSubscribePushEnabled() ? miniprogramApp() : null;
  if (!app) throw new ReminderRejected(503, "reminders_disabled", "Reminders are not available here.");
  const { code, templateId } = readBody(input);
  if (templateId !== app.templateId) throw new ReminderRejected(400, "invalid_request", "templateId is not this board's reminder template.");
  let reader: { openid: string } | "invalid";
  try {
    reader = await openidForCode(app, code);
  } catch (error) {
    if (!(error instanceof WechatUnavailable)) throw error;
    throw new ReminderRejected(503, "temporarily_unavailable", "WeChat did not answer; retry later.", { retryAfter: 30, reason: error.message });
  }
  if (reader === "invalid") throw new ReminderRejected(400, "invalid_request", "The login code is invalid or expired; call wx.login again.");
  const targetDate = reminderTargetDate(now);
  // created_at is the database's clock: the 48 hours run from when the openid was actually stored.
  await sql`INSERT INTO miniprogram_reminders (openid, target_date, template_id)
            VALUES (${reader.openid}, ${targetDate}, ${app.templateId})
            ON CONFLICT (openid, target_date) DO NOTHING`;
  return { targetDate };
}

/** The daily is saved: send its reminders now (the worker's notify.reminders queue; the 10-minute schedule is the fallback). */
export async function enqueueReminderSend(date: string): Promise<void> {
  await enqueue(QUEUES.reminders, { date }, { singletonKey: `reminders:${date}` });
}

/** The mini program's page for one issue; the route and its parameters never change once released. */
export const dailyIssuePage = (date: string) => `pages/daily-issue/index?board=${BOARD.key}&date=${date}`;

type Role = "name" | "date" | "note";

/**
 * Which keyword of the reminder template takes which fixed text, "role:keyword" pairs (the keywords are the
 * ones WeChat shows for the template the owner applied for). Default name:thing1,date:date2,note:thing3.
 */
function templateKeys(): Array<[Role, string]> {
  const raw = process.env.WECHAT_MINIPROGRAM_REMINDER_FIELDS || "name:thing1,date:date2,note:thing3";
  return raw.split(",").map((pair) => pair.trim().split(":") as [string, string])
    .filter((p): p is [Role, string] => (p[0] === "name" || p[0] === "date" || p[0] === "note") && /^[a-z_]+\d+$/.test(p[1] ?? ""));
}

/** Fixed text only, never a model's title: the daily's name, the issue's date and one line. */
export function reminderData(date: string): Record<string, { value: string }> {
  const [y, m, d] = date.split("-").map(Number);
  const text: Record<Role, string> = { name: siteDaily().slice(0, 20), date: `${y}年${m}月${d}日`, note: "今天的日报已出刊，点开查看" };
  return Object.fromEntries(templateKeys().map(([role, key]) => [key, { value: text[role] }]));
}

/** An issue without items (no section has one, no flashes): its reminders are not sent and expire. */
function isEmptyIssue(content: unknown): boolean {
  const c = (content ?? {}) as { sections?: Array<{ items?: unknown[] }>; flashes?: unknown[] };
  return !(c.sections ?? []).some((s) => (s.items?.length ?? 0) > 0) && !(c.flashes?.length ?? 0);
}

export interface ReminderRun {
  sent: number;
  failed: number;
  unknown: number;
  skipped: number;
  expired: number;
  /** Rows left for later: the issue is not out yet, or it has no items. */
  waiting: number;
  /** Why sends failed or are in doubt (WeChat's error code, an HTTP status), with counts. */
  reasons?: Record<string, number>;
  /** Why the run stopped before the rest (no access token); those rows wait for the next run. */
  stopped?: string;
}

/** Rows asked for 48 hours ago or more, whatever their state, unsent. */
export async function expireReminders(now = new Date()): Promise<{ expired: number }> {
  const gone = await sql`DELETE FROM miniprogram_reminders WHERE created_at < ${new Date(now.getTime() - TTL_MS)}`;
  return { expired: gone.count };
}

/** Rows a stopped process left sending: the message may have gone out, so they count as unknown. */
export async function recoverStaleReminders(now = new Date()): Promise<{ unknown: number }> {
  const gone = await sql`DELETE FROM miniprogram_reminders WHERE status = 'sending' AND locked_at < ${new Date(now.getTime() - STALE_SENDING_MS)}`;
  return { unknown: gone.count };
}

/**
 * Sends the reminders that are due: target date's 08:00 has passed and its daily is saved with items. With
 * `date`, only that issue's (the job queued when it was saved). Rows of an issue not out yet stay; with the
 * valve off they are dropped as skipped and WeChat is not called. One access token serves the whole run,
 * forced to refresh at most once, when WeChat refuses it.
 */
export async function sendReminders(opts: { date?: string; now?: Date } = {}): Promise<ReminderRun> {
  const now = opts.now ?? new Date();
  const run: ReminderRun = { sent: 0, failed: 0, unknown: 0, skipped: 0, expired: (await expireReminders(now)).expired, waiting: 0 };
  const reasons: Record<string, number> = {};
  const note = (reason: string, n = 1) => (reasons[reason] = (reasons[reason] ?? 0) + n);
  const token = { refreshed: false };
  const dates = await sql<{ date: string; n: number }[]>`
    SELECT target_date::text AS date, count(*)::int AS n FROM miniprogram_reminders
    WHERE status = 'pending' AND target_date <= ${beijingDate(now)} ${opts.date ? sql`AND target_date = ${opts.date}` : sql``}
    GROUP BY 1 ORDER BY 1`;
  for (const { date, n } of dates) {
    if (shutdownSignal.signal.aborted) break; // the rest stay pending for the next run
    if (now.getTime() < beijingMidnight(date).getTime() + 8 * 3600_000) {
      run.waiting += n;
      continue;
    }
    const [issue] = await sql<{ content: unknown }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${date}`;
    if (!issue || isEmptyIssue(issue.content)) {
      run.waiting += n;
      continue;
    }
    if (!wechatSubscribePushEnabled()) {
      run.skipped += (await sql`DELETE FROM miniprogram_reminders WHERE target_date = ${date} AND status = 'pending'`).count;
      continue;
    }
    const app = miniprogramApp();
    if (!app) {
      const gone = (await sql`DELETE FROM miniprogram_reminders WHERE target_date = ${date} AND status = 'pending'`).count;
      run.failed += gone;
      note("not configured", gone);
      continue;
    }
    const stopped = await sendIssue(app, date, run, note, token);
    if (stopped) {
      run.stopped = stopped;
      break;
    }
  }
  return { ...run, ...(Object.keys(reasons).length ? { reasons } : {}) };
}

/** One issue's rows, one at a time, until none is left or the process stops; returns why WeChat stopped it early, if it did. */
async function sendIssue(app: MiniprogramApp, date: string, run: ReminderRun, note: (reason: string) => void, token: { refreshed: boolean }): Promise<string | null> {
  let current: string;
  try {
    current = await accessToken(app);
  } catch (error) {
    return String(error instanceof Error ? error.message : error);
  }
  const message = { page: dailyIssuePage(date), data: reminderData(date) };
  for (;;) {
    if (shutdownSignal.signal.aborted) return null;
    const [row] = await sql<{ id: number; openid: string; template_id: string }[]>`
      UPDATE miniprogram_reminders SET status = 'sending', locked_at = now()
      WHERE id = (SELECT id FROM miniprogram_reminders WHERE target_date = ${date} AND status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, openid, template_id`;
    if (!row) return null;
    const send = () => sendSubscribeMessage(app, current, { touser: row.openid, template_id: row.template_id, ...message });
    let outcome: SendOutcome = await send();
    if (outcome.status === "token" && !token.refreshed) {
      token.refreshed = true;
      try {
        current = await accessToken(app, true);
      } catch (error) {
        // Nothing went out with the refused token: the row waits for the next run.
        await sql`UPDATE miniprogram_reminders SET status = 'pending', locked_at = NULL WHERE id = ${row.id}`;
        return String(error instanceof Error ? error.message : error);
      }
      outcome = await send();
    }
    await sql`DELETE FROM miniprogram_reminders WHERE id = ${row.id}`;
    if (outcome.status === "sent") run.sent += 1;
    else {
      run[outcome.status === "unknown" ? "unknown" : "failed"] += 1;
      note(outcome.status === "token" ? `token ${outcome.reason}` : outcome.reason);
    }
  }
}

// ---- What the runs page and the alerts read back ------------------------------------------------------

export interface ReminderCounts {
  sent: number;
  failed: number;
  unknown: number;
  skipped: number;
  expired: number;
}

// Each run's reminder counts: the sender's whole detail, the recovery's and the housekeeping's `reminders`.
const counted = (since: Date) => sql`
  SELECT id, job, started_at AS at, CASE WHEN job = 'reminders.send' THEN detail ELSE detail->'reminders' END AS d
  FROM job_runs WHERE job IN ('reminders.send', 'ops.recover', 'ops.retention') AND status = 'ok' AND started_at > ${since}`;
const n = (key: keyof ReminderCounts) => sql`coalesce((d->>${key})::int, 0)`;

/**
 * Since a moment: the totals, the runs that touched any reminder (newest first, at most 20) and the last
 * send run that tried WeChat (sent, failed or unknown, or stopped without a token).
 */
export async function reminderOutcomes(since: Date) {
  const [totals] = await sql<ReminderCounts[]>`
    SELECT sum(${n("sent")})::int AS sent, sum(${n("failed")})::int AS failed, sum(${n("unknown")})::int AS unknown,
           sum(${n("skipped")})::int AS skipped, sum(${n("expired")})::int AS expired
    FROM (${counted(since)}) x`;
  const runs = await sql<Array<ReminderCounts & { id: number; job: string; at: Date }>>`
    SELECT id, job, at, ${n("sent")} AS sent, ${n("failed")} AS failed, ${n("unknown")} AS unknown, ${n("skipped")} AS skipped, ${n("expired")} AS expired
    FROM (${counted(since)}) x
    WHERE ${n("sent")} + ${n("failed")} + ${n("unknown")} + ${n("skipped")} + ${n("expired")} > 0
    ORDER BY at DESC LIMIT 20`;
  const [last] = await sql<Array<{ at: Date; sent: number; failed: number; unknown: number; stopped: string | null; reasons: Record<string, number> | null }>>`
    SELECT at, ${n("sent")} AS sent, ${n("failed")} AS failed, ${n("unknown")} AS unknown, d->>'stopped' AS stopped, d->'reasons' AS reasons
    FROM (${counted(since)}) x
    WHERE job = 'reminders.send' AND (${n("sent")} + ${n("failed")} + ${n("unknown")} > 0 OR d->>'stopped' IS NOT NULL)
    ORDER BY at DESC LIMIT 1`;
  return {
    totals: { sent: totals?.sent ?? 0, failed: totals?.failed ?? 0, unknown: totals?.unknown ?? 0, skipped: totals?.skipped ?? 0, expired: totals?.expired ?? 0 },
    runs,
    lastAttempt: last ?? null,
  };
}
