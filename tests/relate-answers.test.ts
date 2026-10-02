// The judge's answer in JSON mode: a quoted name in a report (《新型电池产业发展“十五五”规划》) made the
// model close its JSON string at the inner quote and drop the rest, the verdict included. The judge
// therefore reads corner quotes, and an answer without its verdict is a failed call, not "unrelated".
import assert from "node:assert/strict";
import { test } from "node:test";
import { BatchSchema, PairSchema, batchUser, pairUser, type CandidateView, type ReportView } from "@aihot/backend/events/relate";

const report: ReportView = {
  title: "七部门印发《新型电池产业发展“十五五”规划》",
  source: "OFweek锂电网", firstParty: false, at: new Date("2026-09-30T03:48:00Z"),
  summary: `规划提出"全固态电池"到2030年初步规模化应用，头部企业缺陷率达到“PPB级”。`,
  frame: { subject: "工信部等七部门", action: "印发", object: "《新型电池产业发展“十五五”规划》", occurredAt: "2026-09-28" },
};
const candidate: CandidateView = { factId: 2, storyId: 2, factTitle: "七部门印发新型电池产业“十五五”规划", members: 1, storyRoot: true, score: 0.6, report };

test("what the judge reads carries no double quote, curly or straight", () => {
  for (const text of [pairUser(report, report), batchUser(report, [candidate])]) {
    assert.doesNotMatch(text, /["“”]/);
    assert.match(text, /《新型电池产业发展「十五五」规划》/);
    assert.match(text, /「全固态电池」/);
  }
});

test("an answer cut off before its verdict is rejected, a complete one is read", () => {
  assert.equal(PairSchema.safeParse({ a: "七部门联合印发《新型电池产业发展" }).success, false);
  assert.equal(BatchSchema.safeParse({ query: "七部门联合印发《新型电池产业发展" }).success, false);
  assert.equal(PairSchema.parse({ a: "印发", b: "印发", relation: "SAME_OCCURRENCE", difference: "", confidence: 0.98 }).relation, "SAME_OCCURRENCE");
  assert.deepEqual(BatchSchema.parse({ query: "印发", decisions: [{ id: "C1", relation: "SAME_STORY", confidence: 0.9 }] }).decisions, [{ id: "C1", relation: "SAME_STORY", confidence: 0.9, note: "" }]);
});
