// Checks the selection against your own labelled samples (a "gold set"): each case runs the site's
// selection steps (editorial/analyze.ts) — the prefilter, then the score prompt twice with every model in
// --models, the two scores deciding against the source tier's threshold — and is compared with your
// decision. A threshold sweep shows what another threshold would have done. The format of the gold file
// is in docs/selection.md (industry/gold.example.jsonl has two made-up cases).
// Usage: node --env-file=.env scripts/eval-selection.ts --gold .data/gold.jsonl [--models default,deepseek-flash] [--n 200] [--label "..."]
// Receipts make re-runs free; "either" cases are excluded from decisive metrics. The report goes to
// .data/eval/<industry pack>/, and each run is also imported into SelectBench (admin → SelectBench) with
// every case, unless --no-import is given. --gold takes several files separated by commas.
// The prefilter's own check: cases whose stratum starts with "compliance-" must be blocked, those starting
// with "normal-" must not be; every report gives the block rate and the false-block rate on them, against
// --min-block-rate and --max-false-block-rate. --compliance runs the prefilter alone, on the selected pack's
// samples (industry/eval/compliance-samples.jsonl and normal-samples.jsonl unless --gold names others),
// writes compliance-….json, imports nothing into SelectBench and exits 1 when either rate misses its line.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { ANALYZE_PROMPT_VERSION, normalizeAnalysis, runAnalysis, type AnalyzeInputArticle } from "@aihot/backend/editorial/analyze";
import { importSelectBenchRun } from "@aihot/backend/admin/selectbench";
import { selectedPack } from "./select-industry.ts";

const { values } = parseArgs({
  options: {
    gold: { type: "string" },
    models: { type: "string", default: "default" },
    n: { type: "string", default: "200" },
    split: { type: "string", default: "all" },
    concurrency: { type: "string", default: "6" },
    seed: { type: "string", default: "7" },
    label: { type: "string" },
    "no-import": { type: "boolean", default: false },
    compliance: { type: "boolean", default: false },
    "min-block-rate": { type: "string", default: "1" },
    "max-false-block-rate": { type: "string", default: "0.05" },
  },
});
const compliance = values.compliance!;
const gate = { minBlockRate: Number(values["min-block-rate"]), maxFalseBlockRate: Number(values["max-false-block-rate"]) };

// Before any paid call: the pack whose prompts are judged (it names the report's folder).
const pack = selectedPack();

interface GoldRow {
  caseId: string;
  material: { title: string; originalTitle: string | null; publishedAt: string | null; sourceName: string; bodyZh: string | null; bodyOriginal: string | null };
  sourceFacts: { sourceKind: string; sourceTier?: string; firstParty?: boolean; language?: string | null };
  /** Optional: a split (e.g. development / holdout) and a stratum for reading the mistakes. */
  samplingContext?: { benchmarkSplit?: string; samplingStratum?: string };
  gold: { decision: "select" | "reject" | "either" };
}

const goldFiles = (values.gold ?? (compliance ? "industry/eval/compliance-samples.jsonl,industry/eval/normal-samples.jsonl" : ".data/gold.jsonl")).split(",");
if (compliance && !values.gold && !existsSync(path.join(REPO_ROOT, "industry/eval"))) {
  throw new Error(`行业包 ${pack} 没有合规样本（industry-packs/${pack}/eval/），用 --gold 指定样本文件`);
}
const rows: GoldRow[] = goldFiles.flatMap((f) => readFileSync(path.resolve(REPO_ROOT, f.trim()), "utf8")
  .split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).map((l) => JSON.parse(l)));

// Deterministic stratified sample.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const rand = rng(Number(values.seed));
const pool = values.split === "all" ? rows : rows.filter((r) => r.samplingContext?.benchmarkSplit === values.split);
const shuffled = pool.map((r) => ({ r, k: rand() })).sort((a, b) => a.k - b.k).map((x) => x.r);
const sample = shuffled.slice(0, Number(values.n));

function toInput(r: GoldRow): AnalyzeInputArticle {
  const m = r.material;
  const isX = r.sourceFacts.sourceKind === "x_search";
  const body = m.bodyOriginal || m.bodyZh || null;
  return {
    id: `gold-${r.caseId}`,
    revision: 1,
    bodyStatus: "ok",
    title: m.originalTitle || m.title,
    url: "https://example.invalid/" + r.caseId,
    author: null,
    publishedAt: m.publishedAt ? new Date(m.publishedAt) : null,
    bodyText: isX ? null : body,
    excerpt: null,
    xPost: isX ? { authorName: m.sourceName, handle: "", text: body ?? m.title } : null,
    media: [],
    source: { name: m.sourceName, kind: r.sourceFacts.sourceKind, tier: r.sourceFacts.sourceTier ?? "T2", firstParty: r.sourceFacts.firstParty ?? false },
  };
}

/**
 * The prefilter's check on the cases that say what it should do: "compliance-…" strata blocked (all of them,
 * by default), "normal-…" strata let through (at most 5 % blocked, by default). A case that failed to run
 * fails the check: it was not shown to be blocked or let through.
 */
function prefilterCheck(results: Array<{ r: GoldRow; out: { relevance: string } | null }>) {
  const expected = (r: GoldRow) => {
    const stratum = r.samplingContext?.samplingStratum ?? "";
    return stratum.startsWith("compliance-") ? "block" : stratum.startsWith("normal-") ? "pass" : null;
  };
  const failed = results.filter((x) => !x.out && expected(x.r)).length;
  const judged = results.filter((x) => x.out && expected(x.r));
  const shouldBlock = judged.filter((x) => expected(x.r) === "block");
  const shouldPass = judged.filter((x) => expected(x.r) === "pass");
  const missed = shouldBlock.filter((x) => x.out!.relevance !== "block");
  const falselyBlocked = shouldPass.filter((x) => x.out!.relevance === "block");
  const blockRate = shouldBlock.length ? +((shouldBlock.length - missed.length) / shouldBlock.length).toFixed(3) : null;
  const falseBlockRate = shouldPass.length ? +(falselyBlocked.length / shouldPass.length).toFixed(3) : null;
  const ok = failed === 0 && judged.length > 0
    && (blockRate === null || blockRate >= gate.minBlockRate) && (falseBlockRate === null || falseBlockRate <= gate.maxFalseBlockRate);
  const brief = (x: (typeof judged)[number]) => ({ caseId: x.r.caseId, title: x.r.material.title, stratum: x.r.samplingContext?.samplingStratum ?? null });
  return {
    failed, shouldBlock: shouldBlock.length, blocked: shouldBlock.length - missed.length, blockRate,
    shouldPass: shouldPass.length, falselyBlocked: falselyBlocked.length, falseBlockRate,
    ...gate, ok, missed: missed.map(brief), falselyBlockedCases: falselyBlocked.map(brief),
  };
}

const describeCheck = (c: ReturnType<typeof prefilterCheck>) =>
  `  prefilter: compliance blocked ${c.blocked}/${c.shouldBlock} = ${c.blockRate ?? "-"} (≥ ${c.minBlockRate})` +
  ` · normal blocked ${c.falselyBlocked}/${c.shouldPass} = ${c.falseBlockRate ?? "-"} (≤ ${c.maxFalseBlockRate})` +
  `${c.failed ? ` · ${c.failed} failed to run` : ""} · ${c.ok ? "PASS" : "FAIL"}`;

async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }));
  return out;
}

const report: Record<string, unknown> = {};
let checksOk = true;
for (const model of values.models!.split(",")) {
  const started = Date.now();
  const results = await pmap(sample, Number(values.concurrency), async (r) => {
    try {
      const res = await runAnalysis(toInput(r), { scoreModel: model, stages: compliance ? "prefilter" : "selection" });
      const out = normalizeAnalysis(res);
      return { r, out, prefilter: { label: res.prefilter.label, reason: res.prefilter.reason }, receiptIds: [res.prefilter.receiptId, ...(res.scores?.receiptIds ?? [])], error: null as string | null };
    } catch (error) {
      return { r, out: null, prefilter: null, receiptIds: [] as number[], error: String(error).slice(0, 200) };
    }
  });
  const check = prefilterCheck(results);
  checksOk &&= check.ok;
  if (compliance) {
    // The prefilter alone: nothing is scored, so only its check and the cases mean anything.
    console.log(JSON.stringify({ model, n: sample.length, errors: results.filter((x) => !x.out).length }));
    console.log(describeCheck(check));
    for (const c of check.missed) console.log(`  not blocked: [${c.stratum}] ${c.title}`);
    for (const c of check.falselyBlockedCases) console.log(`  blocked: [${c.stratum}] ${c.title}`);
    const cases = results.map((x) => ({
      caseId: x.r.caseId, title: x.r.material.title, stratum: x.r.samplingContext?.samplingStratum ?? null, gold: x.r.gold.decision,
      relevance: x.out?.relevance ?? null, prefilter: x.prefilter, receiptId: x.receiptIds[0] ?? null, error: x.error,
    }));
    report[model] = { prefilter: check, cases };
    continue;
  }
  let tp = 0, fp = 0, fn = 0, tn = 0, either = 0, errors = 0;
  const mistakes: Array<Record<string, unknown>> = [];
  for (const x of results) {
    if (!x.out) { errors++; continue; }
    const pred = x.out.selected ? "select" : "reject";
    const gold = x.r.gold.decision;
    if (gold === "either") { either++; continue; }
    if (pred === "select" && gold === "select") tp++;
    else if (pred === "select" && gold === "reject") { fp++; mistakes.push({ kind: "FP", title: x.r.material.title, score: x.out.score, reason: x.out.reasonZh, stratum: x.r.samplingContext?.samplingStratum ?? null }); }
    else if (pred === "reject" && gold === "select") { fn++; mistakes.push({ kind: "FN", title: x.r.material.title, score: x.out.score, relevance: x.out.relevance, stratum: x.r.samplingContext?.samplingStratum ?? null }); }
    else tn++;
  }
  const receiptIds = results.flatMap((x) => x.receiptIds);
  const [usage] = receiptIds.length
    ? await sql<{ tin: number; tout: number; latency: number }[]>`
        SELECT sum((usage->>'prompt_tokens')::int) AS tin, sum((usage->>'completion_tokens')::int) AS tout,
               avg((response->>'_latencyMs')::int) AS latency
        FROM receipts WHERE id IN ${sql(receiptIds)}`
    : [{ tin: 0, tout: 0, latency: 0 }];
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-9, precision + recall);
  const summary = {
    model, n: sample.length, decisive: tp + fp + fn + tn, either, errors, tp, fp, fn, tn,
    accuracy: +((tp + tn) / Math.max(1, tp + fp + fn + tn)).toFixed(3),
    precision: +precision.toFixed(3), recall: +recall.toFixed(3), f1: +f1.toFixed(3),
    selectedRate: +((tp + fp) / Math.max(1, tp + fp + fn + tn)).toFixed(3),
    goldSelectRate: +((tp + fn) / Math.max(1, tp + fp + fn + tn)).toFixed(3),
    tokensIn: Number(usage?.tin ?? 0), tokensOut: Number(usage?.tout ?? 0), avgLatencyMs: Math.round(Number(usage?.latency ?? 0)),
    wallSeconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(JSON.stringify(summary));
  if (check.shouldBlock || check.shouldPass) console.log(describeCheck(check));
  // Threshold sweep on the raw attention score (selection rule = relevance pass && score >= t).
  const sweep: Array<Record<string, number>> = [];
  for (let t = 40; t <= 90; t += 2) {
    let a = 0, b = 0, c = 0, d = 0;
    for (const x of results) {
      if (!x.out || x.r.gold.decision === "either") continue;
      const pred = x.out.relevance === "pass" && x.out.score !== null && x.out.score >= t;
      const g = x.r.gold.decision === "select";
      if (pred && g) a++; else if (pred) b++; else if (g) c++; else d++;
    }
    const P = a / Math.max(1, a + b), R = a / Math.max(1, a + c);
    sweep.push({ t, acc: +((a + d) / Math.max(1, a + b + c + d)).toFixed(3), P: +P.toFixed(3), R: +R.toFixed(3), F1: +((2 * P * R) / Math.max(1e-9, P + R)).toFixed(3), sel: +((a + b) / Math.max(1, a + b + c + d)).toFixed(3) });
  }
  console.log(sweep.map((s) => `  t=${s.t} acc=${s.acc} P=${s.P} R=${s.R} F1=${s.F1} sel=${s.sel}`).join("\n"));
  const cases = results.map((x) => ({
    caseId: x.r.caseId,
    title: x.r.material.title,
    stratum: x.r.samplingContext?.samplingStratum ?? null,
    gold: x.r.gold.decision,
    decision: x.out ? (x.out.selected ? "select" : "reject") : null,
    score: x.out?.score ?? null,
    relevance: x.out?.relevance ?? null,
    category: x.out?.category ?? null,
    reason: x.out?.reasonZh ?? null,
    receiptId: x.receiptIds[0] ?? null,
    error: x.error,
  }));
  report[model] = { summary, ...(check.shouldBlock || check.shouldPass ? { prefilter: check } : {}), sweep, mistakes, cases };
}
const outDir = path.join(REPO_ROOT, ".data/eval", pack);
mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `${compliance ? "compliance" : "selection"}-${values.split}-${values.n}-${Date.now()}.json`);
const meta = {
  pack, gold: goldFiles, split: values.split, n: sample.length, seed: Number(values.seed), promptVersion: ANALYZE_PROMPT_VERSION,
  ...(values.label ? { label: values.label } : {}), createdAt: new Date().toISOString(),
};
writeFileSync(file, JSON.stringify({ meta, models: report }, null, 2));
console.log(`report: ${file}`);
if (compliance) process.exitCode = checksOk ? 0 : 1;
else if (!values["no-import"]) {
  const run = await importSelectBenchRun({ meta, models: report }, values.label ?? `${pack} · ${values.split} ${sample.length} 条 · ${Object.keys(report).join(" / ")}`, "script:eval-selection");
  console.log(`SelectBench run: ${run.id}`);
}
await closeDb();
