// Content pushes: selected items after their release gate, and the images they need prepared first; the
// mini program's daily reminders once the daily is saved.
import type { PgBoss } from "pg-boss";
import { pushSelected } from "../notify/selected.ts";
import { sendReminders } from "../notify/reminders.ts";
import { prepareArticleMedia, warmShareImage } from "../media/prepare.ts";
import { enqueue, ensureQueue, QUEUES, recordRun } from "./queue.ts";

const MAX_RETRIES = 6;

export async function registerNotifyJobs(boss: PgBoss) {
  await ensureQueue(QUEUES.notifySelected);
  await boss.work<{ articleId: string; attempt?: number }>(QUEUES.notifySelected, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
    if (!job) return;
    // The push makes chat apps unfurl the link: have its share image ready (first attempt only).
    if (!job.data.attempt) await warmShareImage(job.data.articleId);
    const outcome = await pushSelected(job.data.articleId);
    const attempt = job.data.attempt ?? 0;
    if (outcome.status === "retry" && attempt < MAX_RETRIES) {
      await enqueue(QUEUES.notifySelected, { articleId: job.data.articleId, attempt: attempt + 1 }, { startAfter: outcome.after });
    }
    return outcome;
  });

  // Recorded as the same task as the 10-minute fallback schedule, so the runs page and the alerts see both.
  await ensureQueue(QUEUES.reminders);
  await boss.work<{ date: string }>(QUEUES.reminders, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
    if (!job) return;
    return recordRun("reminders.send", () => sendReminders({ date: job.data.date }));
  });

  await ensureQueue(QUEUES.prepareMedia);
  await boss.work<{ articleId: string }>(QUEUES.prepareMedia, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
    if (!job) return;
    return prepareArticleMedia(job.data.articleId);
  });
}
