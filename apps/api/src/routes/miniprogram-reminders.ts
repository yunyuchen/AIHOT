// POST /api/mp/v1/reminders: "提醒我明天的日报", the mini program exit's only write (notify/reminders.ts
// keeps the reminder and sends it). Registered only where the industry pack has a daily column; elsewhere
// the path falls through to the exit's 404. The placeholder switch closes it with the rest of /api/mp/
// (routes/miniprogram.ts), before the body is read. Every answer is no-store, and none carries the openid.
// Requests are limited per IP in memory only. Nothing logs the login code or the openid: the body never
// reaches a log, even when it does not parse.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { FEATURES } from "@aihot/industry/features";
import type { MiniprogramReminder } from "@aihot/contracts/miniprogram";
import { NO_STORE } from "@aihot/contracts/http-policy";
import { createReminder, ReminderRejected } from "@aihot/backend/notify/reminders";
import { sendProblem } from "../http/respond.ts";

const PER_MINUTE = 10;
const recent = new Map<string, number[]>();

/** Sliding one-minute window per client address, never stored. */
function allowed(ip: string): boolean {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= PER_MINUTE) return false;
  list.push(now);
  recent.set(ip, list);
  if (recent.size > 5000) for (const [k, v] of recent) if (v.every((t) => now - t >= 60_000)) recent.delete(k);
  return true;
}

/** A body that does not parse (bad JSON, another content type, too large) is a 400, logged without its content. */
function bodyError(error: { statusCode?: number }, req: FastifyRequest, reply: FastifyReply) {
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return sendProblem(req, reply, { status: 400, code: "invalid_request", detail: "The body must be a JSON object with code and templateId." });
  }
  req.log.error({ status: error.statusCode }, "reminder request failed");
  return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "Temporarily unavailable; retry later.", retryAfter: 30 });
}

export function registerMiniprogramReminders(app: FastifyInstance) {
  if (!FEATURES.reports) return;
  app.post("/api/mp/v1/reminders", { bodyLimit: 4096, errorHandler: bodyError }, async (req, reply) => {
    if (!allowed(String(req.headers["x-real-ip"] ?? req.ip ?? ""))) {
      return sendProblem(req, reply, { status: 429, code: "rate_limited", detail: "Too many reminder requests; retry in a minute.", retryAfter: 60 });
    }
    try {
      const { targetDate } = await createReminder(req.body);
      const body: MiniprogramReminder = { schemaVersion: 1, targetDate };
      return reply.header("Cache-Control", NO_STORE).send(body);
    } catch (error) {
      if (error instanceof ReminderRejected) {
        if (error.reason) req.log.warn({ reason: error.reason }, "reminder: WeChat unavailable");
        return sendProblem(req, reply, { status: error.status, code: error.code, detail: error.message, retryAfter: error.retryAfter });
      }
      // The message only: a database error carries the query's parameters, the openid among them.
      req.log.error({ error: String(error instanceof Error ? error.message : error).slice(0, 300) }, "reminder failed");
      return sendProblem(req, reply, { status: 503, code: "temporarily_unavailable", detail: "Temporarily unavailable; retry later.", retryAfter: 30 });
    }
  });
}
