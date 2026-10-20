import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { MiniprogramReminder, MiniprogramReminderRequest } from "@aihot/contracts/miniprogram";
import type { Failure, FailureKind } from "../src/lib/errors.ts";
import {
  beijingTomorrow,
  REMINDER_COPY,
  reminderButton,
  reminderNotice,
  reminderTemplate,
  requestReminder,
  type ReminderDeps,
  type ReminderOutcome,
  type SubscribeAnswer,
} from "../src/lib/reminder.ts";
import type { Result } from "../src/lib/request.ts";

const TEMPLATE = "zun-LzcQyW-edafCVvzPkK4de2Rllr1fFpw2A_x0oXE";
const NOW = Date.parse("2026-10-17T21:30:00+08:00");

const failure = (kind: FailureKind, status: number | null = null, code: string | null = null): Failure => ({ kind, status, code, requestId: null });

/** 假的微信和网络接口：记下调用顺序，按给的结果回。 */
function fake(answer: SubscribeAnswer, code: string | null = "code-1", saved: Result<MiniprogramReminder> = { ok: true, data: { schemaVersion: 1, targetDate: "2026-10-18" }, status: 200 }) {
  const calls: string[] = [];
  const bodies: MiniprogramReminderRequest[] = [];
  const deps: ReminderDeps = {
    subscribe: (id) => {
      calls.push(`subscribe:${id}`);
      return Promise.resolve(answer);
    },
    login: () => {
      calls.push("login");
      return Promise.resolve(code);
    },
    save: (body) => {
      calls.push("save");
      bodies.push(body);
      return Promise.resolve(saved);
    },
    now: () => NOW,
  };
  return { deps, calls, bodies };
}

const accept: SubscribeAnswer = { ok: true, result: { errMsg: "requestSubscribeMessage:ok", [TEMPLATE]: "accept" } };
const choose = (choice: string): SubscribeAnswer => ({ ok: true, result: { errMsg: "requestSubscribeMessage:ok", [TEMPLATE]: choice } });

test("模板 id：只有日报 tab 画按钮，并且构建配置配了模板 id；没配（客户还没申请到）、某期日报页都不画", () => {
  assert.equal(reminderTemplate(true, { reminderTemplateId: TEMPLATE }), TEMPLATE);
  assert.equal(reminderTemplate(true, { reminderTemplateId: `  ${TEMPLATE} ` }), TEMPLATE);
  assert.equal(reminderTemplate(true, { reminderTemplateId: "" }), null);
  assert.equal(reminderTemplate(true, { reminderTemplateId: "   " }), null);
  assert.equal(reminderTemplate(true, {}), null);
  assert.equal(reminderTemplate(false, { reminderTemplateId: TEMPLATE }), null);
});

test("点按钮第一件事是同步发起订阅授权（传 1 个模板 id），登录和请求都在授权结果回来以后", async () => {
  const { deps, calls, bodies } = fake(accept);
  const pending = requestReminder(TEMPLATE, deps);
  // requestReminder 一返回，订阅授权已经发出，别的什么都还没做。
  assert.deepEqual(calls, [`subscribe:${TEMPLATE}`]);
  assert.deepEqual(await pending, { kind: "subscribed", targetDate: "2026-10-18" });
  assert.deepEqual(calls, [`subscribe:${TEMPLATE}`, "login", "save"]);
  assert.deepEqual(bodies, [{ code: "code-1", templateId: TEMPLATE }]);
});

test("同意：新版本微信带提醒方式的同意（acceptWithAudio 之类）也算同意", async () => {
  const { deps, calls } = fake(choose("acceptWithAudio"));
  assert.equal((await requestReminder(TEMPLATE, deps)).kind, "subscribed");
  assert.deepEqual(calls.slice(1), ["login", "save"]);
});

test("拒绝：“已取消”，不登录、不请求", async () => {
  const { deps, calls } = fake(choose("reject"));
  assert.deepEqual(await requestReminder(TEMPLATE, deps), { kind: "cancelled" });
  assert.deepEqual(calls, [`subscribe:${TEMPLATE}`]);
});

test("ban、filter、结果里没有这个模板：暂时无法订阅，不登录、不请求", async () => {
  for (const answer of [choose("ban"), choose("filter"), { ok: true, result: { errMsg: "requestSubscribeMessage:ok" } } as SubscribeAnswer]) {
    const { deps, calls } = fake(answer);
    assert.deepEqual(await requestReminder(TEMPLATE, deps), { kind: "unavailable" });
    assert.deepEqual(calls, [`subscribe:${TEMPLATE}`]);
  }
});

test("授权失败：20004（总开关关了）提示去设置；其他错误码和没有错误码都是暂时无法订阅", async () => {
  assert.deepEqual(await requestReminder(TEMPLATE, fake({ ok: false, errCode: 20004 }).deps), { kind: "switched_off" });
  for (const errCode of [10005, 20001, 20003, null]) {
    const { deps, calls } = fake({ ok: false, errCode });
    assert.deepEqual(await requestReminder(TEMPLATE, deps), { kind: "unavailable" });
    assert.deepEqual(calls, [`subscribe:${TEMPLATE}`]);
  }
});

test("同意了但 wx.login 拿不到 code：暂时无法订阅，不请求", async () => {
  const { deps, calls } = fake(accept, null);
  assert.deepEqual(await requestReminder(TEMPLATE, deps), { kind: "unavailable" });
  assert.deepEqual(calls, [`subscribe:${TEMPLATE}`, "login"]);
});

test("接口失败：403 section_paused 按占位；503 reminders_disabled、429、400、404、网络、超时都是暂时无法订阅", async () => {
  const run = (f: Failure) => requestReminder(TEMPLATE, fake(accept, "code-1", { ok: false, failure: f }).deps);
  assert.deepEqual(await run(failure("paused", 403, "section_paused")), { kind: "paused" });
  for (const f of [
    failure("unavailable", 503, "reminders_disabled"),
    failure("unavailable", 503, "temporarily_unavailable"),
    failure("rate_limited", 429, "rate_limited"),
    failure("invalid_request", 400, "invalid_request"),
    failure("not_found", 404, "not_found"),
    failure("network"),
    failure("timeout"),
    failure("error", 500),
  ]) {
    assert.deepEqual(await run(f), { kind: "unavailable" }, `${f.kind} ${f.code}`);
  }
});

test("接口 2xx 但响应形状不对：行已经存下了，按成功算，目标日期用本机时钟的北京明天", async () => {
  const run = (data: unknown) => requestReminder(TEMPLATE, fake(accept, "code-1", { ok: true, data: data as MiniprogramReminder, status: 200 }).deps);
  assert.deepEqual(await run({ schemaVersion: 1 }), { kind: "subscribed", targetDate: "2026-10-18" });
  assert.deepEqual(await run(null), { kind: "subscribed", targetDate: "2026-10-18" });
  assert.deepEqual(await run({ schemaVersion: 1, targetDate: "tomorrow" }), { kind: "subscribed", targetDate: "2026-10-18" });
});

test("北京的明天：按北京时间算，跨零点换天", () => {
  assert.equal(beijingTomorrow(Date.parse("2026-10-17T00:00:00+08:00")), "2026-10-18");
  assert.equal(beijingTomorrow(Date.parse("2026-10-17T23:59:59+08:00")), "2026-10-18");
  assert.equal(beijingTomorrow(Date.parse("2026-10-18T00:00:00+08:00")), "2026-10-19");
  assert.equal(beijingTomorrow(Date.parse("2026-12-31T12:00:00+08:00")), "2027-01-01");
});

test("按钮：登记过的目标日期还是明天就是“已订阅明天的日报”、不能点；会话跨过零点后恢复可点；正在订阅时不能点", () => {
  assert.deepEqual(reminderButton(false, null, NOW), { label: "提醒我明天的日报", enabled: true, done: false });
  assert.deepEqual(reminderButton(true, null, NOW), { label: "正在订阅…", enabled: false, done: false });
  assert.deepEqual(reminderButton(false, "2026-10-18", NOW), { label: "已订阅明天的日报", enabled: false, done: true });
  // 23:59 登记了 10-18，过了零点 10-18 已经是今天。
  assert.deepEqual(reminderButton(false, "2026-10-18", Date.parse("2026-10-18T00:01:00+08:00")), { label: "提醒我明天的日报", enabled: true, done: false });
});

test("结果给读者看什么：已取消、暂时无法订阅是轻提示；总开关关了给去设置；占位换整页；成功只改按钮", () => {
  const notice = (outcome: ReminderOutcome) => reminderNotice(outcome);
  assert.deepEqual(notice({ kind: "subscribed", targetDate: "2026-10-18" }), { kind: "none" });
  assert.deepEqual(notice({ kind: "cancelled" }), { kind: "toast", text: "已取消" });
  assert.deepEqual(notice({ kind: "unavailable" }), { kind: "toast", text: "暂时无法订阅，请稍后再试" });
  assert.deepEqual(notice({ kind: "switched_off" }), { kind: "settings" });
  assert.deepEqual(notice({ kind: "paused" }), { kind: "placeholder" });
  assert.equal(REMINDER_COPY.hint, "点一次只提醒一次，明天想再收就再点一次");
  assert.equal(REMINDER_COPY.done, "已订阅明天的日报");
});

test("模板 id 在构建期配置：开发、体验、正式三份各写一份（客户申请到模板前留空）", () => {
  for (const env of ["dev", "trial", "prod"]) {
    const config = readFileSync(new URL(`../config/boards.${env}.ts`, import.meta.url), "utf8");
    assert.match(config, /reminderTemplateId: "[^"\n]*"/, env);
  }
});
