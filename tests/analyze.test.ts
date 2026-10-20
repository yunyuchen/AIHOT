// The judging and writing steps (editorial/analyze.ts): the prefilter decides relevance, two scores
// against the tier threshold decide 精选, selected and near-selected items are written by the content
// understanding and the rest by the title/summary prompts, a structure step gives the category, subjects
// and fact. Material with only a feed summary has its page fetched first. A pack with a strict prefilter
// keeps every BLOCK, and copy using a word the pack bans is not published, nor a bare title's summary that
// repeats the context's note on the material. The steps run on the models
// AIHOT assigns them (set through the environment here); every prompt in the pack renders.
import { Reply, stub, tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { analyzeArticle, SCORE_SYSTEM, tierThreshold } from "@aihot/backend/editorial/analyze";
import { queueProcessing } from "@aihot/backend/jobs/content";
import { QUEUES, stopBoss } from "@aihot/backend/jobs/queue";
import { loadItemDetail } from "@aihot/backend/publication/detail";
import { publishArticle } from "@aihot/backend/publication/publish";
import { compactAnswerFirstSummary, enforceIdentity, materialNoteIn, parseTranslateOutput, PREFILTER_SYSTEM, UNDERSTAND_SYSTEM } from "@aihot/backend/editorial/writing";
import { promptText } from "@aihot/backend/editorial/prompts";
import { SITE } from "@aihot/industry/site";
import { SELECTION } from "@aihot/industry/selection";
import { CATEGORIES, CATEGORY_BY_ITEM_TYPE, ENTITIES, IDENTITY_LEXICON, ITEM_TYPES, TAG_SYNONYMS, TOPIC_TAGS } from "@aihot/industry/taxonomy";

const T = tag();
const SOURCE = `test-analyze-${T}`;
const X_SOURCE = `test-analyze-x-${T}`;

type Step = "prefilter" | "score" | "understand" | "summarize" | "structure";
interface Req { step: Step; marker: string; system: string; user: string; body: Record<string, any> }
const requests: Req[] = [];
const MARKERS = ["CLEAR", "RESCUE", "LOW", "OFFTOPIC", "BARE", "TITLED", "VAGUE", "THIN", "SENSITIVE", "BANNED", "REASONED", "LEAKED", "NOTED", "HEDGED", "推文"];
// Scores around the T1 threshold (every test source is T1) and the floor for the selected-style writing.
const T1 = SELECTION.thresholds.T1!;
const FLOOR = SELECTION.understandFloor;
const scoreAnswers: Record<string, number[]> = {
  CLEAR: [T1 + 8, T1 + 2], RESCUE: [FLOOR + 3, FLOOR + 1], LOW: [FLOOR - 5, FLOOR - 10], THIN: [T1 + 5, T1 + 5], SENSITIVE: [T1 + 5, T1 + 5],
  推文: [FLOOR - 10, FLOOR - 10], BARE: [FLOOR - 20, FLOOR - 16], VAGUE: [T1, T1 + 2], TITLED: [T1 + 5, T1 + 5],
  BANNED: [T1 + 5, T1 + 5], REASONED: [T1 + 5, T1 + 5], LEAKED: [T1 + 5, T1 + 5], NOTED: [T1 + 5, T1 + 5], HEDGED: [T1 + 5, T1 + 5],
};
// The context's note on a bare title's material, as a model wrote it into a summary on the site.
const LEAK = "原文正文抓取失败，仅标题可用。";
// Whether the pack's prefilter is strict, and a word it bans in written copy if it bans any (industry/selection.ts).
const STRICT = SELECTION.strictPrefilter;
const BANNED_WORD = SELECTION.bannedWords[0];

// Each step is told by its system prompt as the pack renders it today; structure is the one other step
// with a system prompt, and the title/summary prompt is a single user message.
const stepOf = (system: string, user: string): Step =>
  system === PREFILTER_SYSTEM ? "prefilter" : system === SCORE_SYSTEM ? "score"
  : system === UNDERSTAND_SYSTEM ? "understand" : system ? "structure"
  : user.includes("title_zh") ? "summarize" : (() => { throw new Error("unknown request"); })();

// Examples from the industry pack's vocabulary: a content type and its category tag, a synonym the
// vocabulary maps onto a topic tag, another topic tag, and a company with a tag of its own.
const ITEM_TYPE = ITEM_TYPES[0];
const CATEGORY_TAG = CATEGORY_BY_ITEM_TYPE[ITEM_TYPE]!;
const CATEGORY = CATEGORIES[0].key;
const [SYNONYM, SYNONYM_TAG] = Object.entries(TAG_SYNONYMS).find(([word, t]) => word !== t && (TOPIC_TAGS as readonly string[]).includes(t))!;
const TOPIC = TOPIC_TAGS.find((t) => t !== SYNONYM_TAG)!;
const [SUBJECT, { displayTag: SUBJECT_TAG }] = Object.entries(ENTITIES).find(([, e]) => e.displayTag)!;
// A company of the identity lexicon and another way the input may name it (宁德时代 and CATL); a pack
// without a lexicon has no identity guard to check.
const LEXICON_COMPANY = IDENTITY_LEXICON.flatMap((e) => {
  const names = (text: string) => e.patterns.some((p) => p.test(text));
  const alias = ENTITIES[e.id]?.aliases.find((a) => a !== e.name && names(a));
  return alias && names(e.name) ? [{ name: e.name, alias }] : [];
})[0];

// One stub stands in for DashScope (prefilter, structure), Zhipu (score, understand) and DeepSeek (summarize).
const provider = await stub((_hit, req) => {
  const body = JSON.parse(req.body) as { messages: Array<{ role: string; content: unknown }> } & Record<string, any>;
  const system = body.messages[0]!.role === "system" ? String(body.messages[0]!.content) : "";
  const last = body.messages[body.messages.length - 1]!.content;
  const user = typeof last === "string" ? last : JSON.stringify(last);
  const step = stepOf(system, user);
  const marker = MARKERS.find((m) => user.includes(m)) ?? "";
  requests.push({ step, marker, system, user, body });
  const answer = (content: unknown) => ({ id: `stub-${requests.length}`, model: "stub", choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
  if (step === "prefilter") return answer({ label: ["OFFTOPIC", "BARE", "TITLED"].includes(marker) ? "BLOCK" : marker === "VAGUE" ? "UNKNOWN" : "PASS", reason: "测试" });
  if (step === "score") return answer({ attentionScore: scoreAnswers[marker]!.shift() });
  if (step === "understand") {
    if (marker === "SENSITIVE") return new Reply(400, { contentFilter: [{ level: 1, role: "user" }], error: { code: "1301", message: "系统检测到输入或生成内容可能包含不安全或敏感内容" } });
    const word = (m: string) => (marker === m ? ` ${BANNED_WORD}` : "");
    const second = marker === "LEAKED" || marker === "NOTED" ? LEAK : "第二句补充一个关键数字。";
    const hedge = marker === "HEDGED" ? `，${LEAK}` : "";
    return answer({ itemType: ITEM_TYPE, authorRole: "principal", tags: [CATEGORY_TAG, SYNONYM, TOPIC, "不存在的标签"], editorialJudgment: `理由 ${marker}${word("REASONED")}${hedge}`, titleZh: `理解标题 ${marker}${word("BANNED")}`, summaryZh: `理解摘要 ${marker}。${second}` });
  }
  if (step === "structure") return answer({ category: CATEGORY, tags: [CATEGORY_TAG, TOPIC], subjects: [SUBJECT, "unknown-co"], fact: { title: `事实 ${marker}`, subject: "某公司", action: "发布", object: "模型", occurredAt: null } });
  return answer(`title_zh: 翻译标题 ${marker}\nsummary_zh: 翻译摘要 ${marker}。第二句补充影响。`);
});
for (const env of ["DASHSCOPE_BASE_URL", "ZHIPU_BASE_URL", "DEEPSEEK_BASE_URL"]) process.env[env] = `${provider.url}/v1`;
for (const env of ["DASHSCOPE_API_KEY", "ZHIPU_API_KEY", "DEEPSEEK_API_KEY"]) process.env[env] = "test-key";
// AIHOT's own assignment of models to steps (the open-source default is one model for all of them).
Object.assign(process.env, { PREFILTER_MODEL: "qwen3.7-flash", SCORE_MODEL: "glm-5.3-flash-selection", UNDERSTAND_MODEL: "glm-5.3-flash", SUMMARIZE_MODEL: "deepseek-flash", STRUCTURE_MODEL: "qwen3.8-flash" });

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${SOURCE}, 'Test analyze source', 'rss', 'T1', 'editorial', '2100-01-01'),
    (${X_SOURCE}, 'Test X account', 'x_search', 'T1', 'editorial', '2100-01-01')`;
});
after(async () => {
  await provider.close();
  await stopBoss();
  await closeDb();
});

// The tag keeps each material unique: identical input would reuse an earlier run's paid answers.
const LONG = "a lab released a model with a benchmark table and pricing details. ".repeat(8);
const article = async (marker: string, extra: Record<string, unknown> = {}) =>
  (await upsertMaterial({
    sourceId: SOURCE, url: `https://example.com/${marker}-${T}`, title: `${marker} model release ${T}`, bodyText: `${marker}: ${LONG} (${T})`,
    bodyStatus: "ok", via: "fetch", publishedAt: new Date("2026-09-28T01:02:03Z"), ...extra,
  } as never)).articleId;
const calls = (marker: string) => requests.filter((r) => r.marker === marker).map((r) => r.step);
const row = async (id: string) =>
  (await sql<{ selected: boolean; relevance: string; score: string | null; title_zh: string; reason_zh: string | null; category: string | null; tags: string[]; subjects: string[]; receipt_ids: string[]; output: Record<string, any> }[]>`
    SELECT selected, relevance, score, title_zh, reason_zh, category, tags, subjects, receipt_ids, output FROM analyses WHERE article_id = ${id} ORDER BY id DESC LIMIT 1`)[0]!;

test("every prompt in the pack renders, and the site's name fills {{siteName}}", () => {
  const dir = new URL("../industry/prompts/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  // Every value any prompt asks for, so each renders on its own.
  const names = new Set(files.flatMap((f) => [...readFileSync(new URL(f, dir), "utf8").matchAll(/\{\{\s*([A-Za-z][\w.-]*)\s*\}\}/g)].map((m) => m[1]!)));
  const values = Object.fromEntries([...names].map((n) => [n, "x"]));
  for (const file of files) {
    const text = promptText(file.slice(0, -3), values);
    assert.ok(text.length > 20 && !/\{\{/.test(text), file);
  }
  // prefilter.md includes no other file, so filling {{siteName}} by hand gives the whole system prompt.
  const prefilter = readFileSync(new URL("prefilter.md", dir), "utf8");
  assert.ok(prefilter.includes("{{siteName}}") && PREFILTER_SYSTEM.includes(SITE.name));
  assert.equal(PREFILTER_SYSTEM, prefilter.replaceAll("{{siteName}}", SITE.name));
});

test("a selected item: prefilter, two scores, the content understanding and the structure", async () => {
  assert.equal(tierThreshold("T1"), T1);
  const id = await article("CLEAR");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.selected, res!.output!.score], [true, T1 + 5], "(T1 + 8) + (T1 + 2) >= 2 × T1");
  assert.deepEqual(calls("CLEAR").sort(), ["prefilter", "score", "score", "structure", "understand"]);
  const r = await row(id);
  assert.deepEqual([r.title_zh, r.reason_zh, r.category, r.receipt_ids.length], ["理解标题 CLEAR", "理由 CLEAR", CATEGORY, 5]);
  assert.deepEqual(r.tags, [CATEGORY_TAG, SYNONYM_TAG, TOPIC, SUBJECT_TAG], "vocabulary tags (synonyms mapped, unknown dropped) and the subject's tag");
  assert.deepEqual(r.subjects, [SUBJECT]);
  assert.deepEqual([r.output.writer, r.output.itemType, r.output.prefilter.label, r.output.fact.title], ["understand", ITEM_TYPE, "PASS", "事实 CLEAR"]);
  const score = requests.find((q) => q.marker === "CLEAR" && q.step === "score")!;
  assert.match(score.user, /【标题】\nCLEAR model release/, "the score reads the original title, before any writing");
  assert.deepEqual([score.body.temperature, score.body.reasoning_effort, score.body.max_tokens], [1, "high", 65536]);
  const understand = requests.find((q) => q.marker === "CLEAR" && q.step === "understand")!;
  assert.ok(understand.user.startsWith("请按系统规则理解以下单篇材料，一次返回全部六个字段。"));
  assert.ok(understand.system.includes("【摘要答案前置规则") && understand.system.includes("【标题自洽规则"));
  const prefilter = requests.find((q) => q.marker === "CLEAR" && q.step === "prefilter")!;
  assert.ok(JSON.parse(prefilter.user).includes("【材料质量】"), "the material context, sent as a JSON string");
});

test("a near-selected item is written like a selected one; below the floor it is translated", async () => {
  const near = await analyzeArticle(await article("RESCUE"));
  assert.deepEqual([near!.output!.selected, near!.output!.reasonZh], [false, "理由 RESCUE"], "(FLOOR + 3) + (FLOOR + 1) > 2 × FLOOR");
  const lowId = await article("LOW");
  const low = await analyzeArticle(lowId);
  assert.deepEqual([low!.output!.selected, low!.output!.titleZh, low!.output!.reasonZh], [false, "翻译标题 LOW", null]);
  assert.deepEqual(calls("LOW").sort(), ["prefilter", "score", "score", "structure", "summarize"]);
  const summarize = requests.find((q) => q.marker === "LOW" && q.step === "summarize")!;
  assert.equal(summarize.body.messages.length, 1, "the title/summary prompt is one user message");
  assert.equal(summarize.body.response_format, undefined, "answered in its own text format");
  assert.deepEqual((await row(lowId)).tags, [CATEGORY_TAG, TOPIC, SUBJECT_TAG], "structure tags");
});

test("the prefilter's BLOCK stops everything; UNKNOWN goes on like PASS, unless the pack's prefilter is strict", async () => {
  const off = await analyzeArticle(await article("OFFTOPIC"));
  assert.deepEqual([off!.output!.relevance, off!.output!.selected], ["block", false]);
  assert.deepEqual(calls("OFFTOPIC"), ["prefilter"]);
  const vagueId = await article("VAGUE");
  const vague = await analyzeArticle(vagueId);
  const bare = await analyzeArticle(await article("BARE", { bodyText: null, excerpt: null, bodyStatus: "none" }));
  if (STRICT) {
    // A strict prefilter: an UNKNOWN is a BLOCK, and a BLOCK stands without material too.
    assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, (await row(vagueId)).output.prefilter.label], ["block", false, "BLOCK"]);
    assert.deepEqual([bare!.output!.relevance, bare!.output!.selected], ["block", false]);
    assert.deepEqual([...calls("VAGUE"), ...calls("BARE")], ["prefilter", "prefilter"]);
    return;
  }
  // An UNKNOWN with material is judged and written like a PASS, up to 精选 (T1 + (T1 + 2) ≥ 2 × T1).
  assert.deepEqual([vague!.output!.relevance, vague!.output!.selected, vague!.output!.titleZh], ["pass", true, "理解标题 VAGUE"]);
  assert.equal((await row(vagueId)).output.prefilter.label, "UNKNOWN", "the prefilter's own answer stays on record");
  // Nothing but a title and no page to fetch: the BLOCK counts as UNKNOWN and is scored, but the
  // translation writes nothing from a bare title, so it waits for material instead of being published.
  assert.deepEqual([bare!.output!.relevance, bare!.output!.selected, bare!.output!.score], ["unknown", false, FLOOR - 18]);
  assert.deepEqual(calls("BARE").sort(), ["prefilter", "score", "score", "structure"]);
});

test("a BLOCK on a bare title is public nowhere under a strict prefilter; otherwise the title alone can make 精选", async () => {
  // Scored high enough, a bare title is written by the content understanding: past the prefilter it would be public.
  const id = await article("TITLED", { bodyText: null, excerpt: null, bodyStatus: "none" });
  const res = await analyzeArticle(id);
  if (!STRICT) {
    assert.deepEqual([res!.output!.relevance, res!.output!.selected, (await row(id)).output.prefilter.label], ["pass", true, "UNKNOWN"]);
    return;
  }
  assert.deepEqual([res!.output!.relevance, res!.output!.selected, calls("TITLED")], ["block", false, ["prefilter"]]);
  await publishArticle(id);
  const [publication] = await sql<{ eligible: boolean; selected: boolean }[]>`SELECT eligible, selected FROM publications WHERE article_id = ${id}`;
  assert.deepEqual([publication!.eligible, publication!.selected], [false, false], "not in the pool, the lists or any exit");
  assert.equal((await loadItemDetail(id)).kind, "not_found", "no page by id");
});

test("copy using a word the pack bans is not published, without falling back to the original title", { skip: !BANNED_WORD && "the pack bans no words" }, async () => {
  const id = await article("BANNED");
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.relevance, res!.output!.selected, res!.output!.titleZh, res!.output!.summaryZh], ["unknown", false, "", ""]);
  assert.deepEqual((await row(id)).output.bannedWords, [BANNED_WORD], "the word stays on record");
  await publishArticle(id);
  const [publication] = await sql<{ eligible: boolean }[]>`SELECT eligible FROM publications WHERE article_id = ${id}`;
  assert.equal(publication!.eligible, false);
  assert.equal((await loadItemDetail(id)).kind, "not_found");
  // In the reason alone it costs only the reason.
  const reasoned = await analyzeArticle(await article("REASONED"));
  assert.deepEqual([reasoned!.output!.selected, reasoned!.output!.titleZh, reasoned!.output!.reasonZh], [true, "理解标题 REASONED", null]);
  // The writing prompts forbid every word the check drops on.
  for (const word of SELECTION.bannedWords) assert.ok(UNDERSTAND_SYSTEM.includes(word), `the writing prompts allow ${word}`);
});

test("a bare title's summary that repeats the note on its material is not published; over a body the same words stand", async () => {
  // The prefilter passes it (a strict pack writes it too), and scored high it reaches the content understanding.
  const id = await article("LEAKED", { bodyText: null, excerpt: null, bodyStatus: "none" });
  const res = await analyzeArticle(id);
  assert.deepEqual([res!.output!.relevance, res!.output!.selected, res!.output!.titleZh, res!.output!.summaryZh], ["unknown", false, "理解标题 LEAKED", ""]);
  assert.equal((await row(id)).output.materialNote, "正文抓取失败", "the words stay on record");
  await publishArticle(id);
  const [publication] = await sql<{ eligible: boolean }[]>`SELECT eligible FROM publications WHERE article_id = ${id}`;
  assert.equal(publication!.eligible, false);
  assert.equal((await loadItemDetail(id)).kind, "not_found");
  // In the reason alone the note costs only the reason.
  const hedgedId = await article("HEDGED", { bodyText: null, excerpt: null, bodyStatus: "none" });
  const hedged = await analyzeArticle(hedgedId);
  assert.deepEqual([hedged!.output!.selected, hedged!.output!.summaryZh, hedged!.output!.reasonZh], [true, "理解摘要 HEDGED。第二句补充一个关键数字。", null]);
  assert.equal((await row(hedgedId)).output.materialNote, "正文抓取失败");
  // With a body the words could be the material's own: the guard is not used.
  const notedId = await article("NOTED");
  const noted = await analyzeArticle(notedId);
  assert.deepEqual([noted!.output!.selected, noted!.output!.summaryZh], [true, `理解摘要 NOTED。${LEAK}`]);
  assert.equal((await row(notedId)).output.materialNote, undefined);
  // The writing prompt says the bracketed fields are the system's notes, and names the phrasing it forbids.
  assert.ok(UNDERSTAND_SYSTEM.includes("【材料质量】等方括号标记") && UNDERSTAND_SYSTEM.includes("是系统给你的说明，不是材料本身"));
  for (const phrase of ["原文正文抓取失败", "仅标题可用", "正文未抓取到", "原文仅提供标题"]) assert.ok(UNDERSTAND_SYSTEM.includes(phrase), phrase);
});

test("guards: a note on the material is told apart from what a material states", () => {
  // Sentences the site showed for bare titles.
  for (const s of ["原文正文抓取失败，仅标题可用。", "原文正文缺失，仅标题可用。", "原文正文未抓取到，暂无更多细节。", "原文仅提供标题，未披露投资额。", "暂时无法获取原文正文。", "【材料质量】仅摘要"]) {
    assert.ok(materialNoteIn(s), s);
  }
  // Facts a material states, and the trade's own words.
  for (const s of ["公司未披露交易金额和产能。", "原文未披露具体产能。", "新一代机器人抓取精度提升到 0.02 毫米。", "电池材料质量检测设备完成交付。", "标题党式宣传被监管点名。", "【媒体聚焦】多地发布高温作业防护提示"]) {
    assert.equal(materialNoteIn(s), null, s);
  }
});

test("a feed summary alone: the article page is fetched first, then the whole article is judged", async () => {
  const id = await article("THIN", { bodyText: null, bodyStatus: "pending", excerpt: `THIN: a short feed summary (${T}).` });
  // The queue sends it to extraction although its source does not ask for full text (the safety net
  // does the same after a failed fetch, so extraction failures add up to "unconfirmed" and end).
  await queueProcessing(id);
  const [job] = await sql<{ name: string }[]>`SELECT name FROM pgboss.job WHERE data->>'articleId' = ${id}`;
  assert.equal(job?.name, QUEUES.extractBody);
  const first = await analyzeArticle(id);
  assert.deepEqual([first!.needsBody, first!.output], [true, null]);
  assert.deepEqual(calls("THIN"), [], "no model call before the page");
  assert.equal((await sql`SELECT 1 FROM analyses WHERE article_id = ${id}`).length, 0, "nothing committed");
  // What extraction does: the body lands as a new revision.
  await sql`UPDATE articles SET body_text = ${`THIN: ${LONG} (${T}) full page`}, body_status = 'ok', revision = revision + 1 WHERE id = ${id}`;
  const second = await analyzeArticle(id);
  assert.deepEqual([second!.needsBody ?? false, second!.output!.selected], [false, true]);
});

test("a short post in Chinese is its own copy; a content-filter refusal is translated instead", async () => {
  // The tag rides as a hashtag, which the language check strips.
  const text = `推文：今天把智能体接进了工作流，效果不错。#t${T}`;
  const { articleId } = await upsertMaterial({
    sourceId: X_SOURCE, url: `https://x.com/test/status/1${Date.now()}`, title: text, via: "fetch", publishedAt: new Date(),
    xPost: { tweetId: `1${Date.now()}`, authorName: "测试", handle: "test", text },
  });
  const post = await analyzeArticle(articleId);
  assert.deepEqual([post!.output!.titleZh, post!.output!.summaryZh], [text, text]);
  assert.ok(!calls("推文").includes("summarize"), "no translation call");
  const sensitive = await analyzeArticle(await article("SENSITIVE"));
  assert.deepEqual([sensitive!.output!.selected, sensitive!.output!.titleZh], [true, "翻译标题 SENSITIVE"]);
  assert.deepEqual(calls("SENSITIVE").filter((s) => s === "understand" || s === "summarize"), ["understand", "summarize"]);
});

test("guards: a company the input does not name is not written in", { skip: !LEXICON_COMPANY && "the pack has no identity lexicon" }, () => {
  const { name, alias } = LEXICON_COMPANY!;
  const input = { title: "某企业新基地投产", text: "某企业的新基地投产，产能和投资额都有说明。", sourceKind: "rss" };
  const guarded = enforceIdentity(input, { titleZh: `${name}新基地投产`, summaryZh: "某企业新基地投产。" });
  assert.deepEqual([guarded.titleZh, guarded.summaryZh, guarded.identityGuard.outcome], ["某企业新基地投产", "某企业新基地投产。", "fallback"]);
  // The identity lexicon: another rendering of a company the input names (宁德时代 for CATL) is no invention.
  const named = { title: `${alias} starts production at a new plant`, text: `${alias} started production at a new plant, with capacity and investment details.`, sourceKind: "rss" };
  assert.equal(enforceIdentity(named, { titleZh: `${name}新工厂投产`, summaryZh: `${name}新工厂投产并公布产能。` }).identityGuard.outcome, "pass");
});

test("guards: long summaries are cut at sentences", () => {
  const long = "第一句交代了谁做了什么以及关键结果，这一句本身已经足够说明核心事件的来龙去脉。".repeat(3) + "第二句补充数字。".repeat(20);
  assert.ok(compactAnswerFirstSummary(long).length <= 190);
  // As many whole sentences as fit: 250 characters in three sentences keep the first two, not one.
  const sentence = (lead: string, n: number) => `${lead}${"补充一项具体细节".repeat(40)}`.slice(0, n - 1) + "。";
  const [first, second] = [sentence("第一句", 80), sentence("第二句", 80)];
  const three = first + second + sentence("第三句", 90);
  assert.equal(three.length, 250);
  assert.equal(compactAnswerFirstSummary(three), first + second);
  // No more than the three sentences the length rule allows.
  const four = ["第一句", "第二句", "第三句", "第四句"].map((lead) => sentence(lead, 55)).join("");
  assert.equal(compactAnswerFirstSummary(four), four.slice(0, 165));
  // A first sentence too long on its own is cut at a clause boundary and closed with 。, within the limit.
  const clause = "这一分句写明了一项具体安排和数字，";
  const cut = compactAnswerFirstSummary(`${clause.repeat(14)}最后一项。第二句补充数字。`);
  assert.equal(cut, `${clause.repeat(11).slice(0, -1)}。`);
  assert.ok(cut.length <= 190);
  assert.deepEqual(parseTranslateOutput("title_zh: 标题\nsummary_zh: 第一句。\n第二句。"), { titleZh: "标题", summaryZh: "第一句。\n第二句。", bodyZh: "" });
  assert.equal(parseTranslateOutput("title_zh: 标题\nbody_zh: 我们懂你。\n\n来源：X：PixVerse (@PixVerse)").bodyZh, "我们懂你。", "a repeated prompt line is dropped");
});

test("analysing the same revision again reuses every paid answer", async () => {
  scoreAnswers.CLEAR = [T1 + 8, T1 + 2];
  const id = await article("CLEAR", { url: `https://example.com/CLEAR-again-${T}`, title: `CLEAR model release again ${T}` });
  const first = await analyzeArticle(id);
  assert.equal(first!.reused, false);
  const hits = provider.hits();
  const again = await analyzeArticle(id);
  assert.equal(provider.hits(), hits, "no new requests");
  assert.deepEqual([again!.reused, again!.receiptIds], [true, first!.receiptIds]);
});
