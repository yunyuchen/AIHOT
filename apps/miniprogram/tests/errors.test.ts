import assert from "node:assert/strict";
import { test } from "node:test";
import { failureFromResponse, failureFromTransport } from "../src/lib/errors.ts";

const problem = (status: number, code: string) => ({ status, code, detail: "…", requestId: "req-1" });

test("问题体的错误码映射到页面状态", () => {
  assert.equal(failureFromResponse(400, problem(400, "invalid_request")).kind, "invalid_request");
  assert.equal(failureFromResponse(400, problem(400, "invalid_cursor")).kind, "invalid_cursor");
  assert.equal(failureFromResponse(404, problem(404, "not_found")).kind, "not_found");
  assert.equal(failureFromResponse(403, problem(403, "section_paused")).kind, "paused");
  assert.equal(failureFromResponse(429, problem(429, "rate_limited")).kind, "rate_limited");
  assert.equal(failureFromResponse(503, problem(503, "temporarily_unavailable")).kind, "unavailable");
  assert.deepEqual(failureFromResponse(404, problem(404, "not_found")), { kind: "not_found", status: 404, code: "not_found", requestId: "req-1" });
});

test("问题体是字符串时先解析", () => {
  assert.equal(failureFromResponse(403, JSON.stringify(problem(403, "section_paused"))).kind, "paused");
});

test("不认识的错误码和没有问题体：5xx 当暂时不可用，其余当通用错误", () => {
  assert.equal(failureFromResponse(400, problem(400, "brand_new_code")).kind, "error");
  assert.equal(failureFromResponse(404, "<html>Not Found</html>").kind, "error");
  assert.equal(failureFromResponse(502, "").kind, "unavailable");
  assert.equal(failureFromResponse(500, null).code, null);
});

test("没拿到响应：超时和网络错误分开", () => {
  assert.equal(failureFromTransport("request:fail timeout").kind, "timeout");
  assert.equal(failureFromTransport("request:fail socket time out timeout:10000").kind, "timeout");
  assert.equal(failureFromTransport("request:fail -2:net::ERR_NAME_NOT_RESOLVED").kind, "network");
  assert.equal(failureFromTransport(undefined).kind, "network");
});
