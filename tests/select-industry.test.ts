// The industry pack selection (scripts/select-industry.ts): industry-packs/<name>/ is mirrored into
// industry/ around the framework's own files, a wrong name stops with the choices, and the check finds
// any drift. Runs on a scratch copy; the repository's industry/ is only read.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { checkPack, packNames, selectedPack, selectPack } from "../scripts/select-industry.ts";

const root = mkdtempSync(path.join(tmpdir(), "select-industry-"));
after(() => rmSync(root, { recursive: true, force: true }));

function write(file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

write("industry/package.json", "{}");
write("industry/README.md", "generated");
write("industry-packs/alpha/site.ts", "alpha");
write("industry-packs/alpha/prompts/only-alpha.md", "a");
write("industry-packs/beta/site.ts", "beta");
write("industry-packs/beta/brand/nameplates/daily.svg", "<svg/>");

test("selecting mirrors the pack into industry/ and keeps the framework's own files", () => {
  assert.deepEqual(packNames(root), ["alpha", "beta"]);
  assert.deepEqual(selectPack("alpha", root), { changed: 2, removed: 0 });
  assert.equal(read("industry/site.ts"), "alpha");
  assert.equal(selectedPack(root), "alpha");
  assert.deepEqual(selectPack("alpha", root), { changed: 0, removed: 0 }, "the pack already there is a no-op");

  assert.deepEqual(selectPack("beta", root), { changed: 2, removed: 1 });
  assert.equal(read("industry/site.ts"), "beta");
  assert.ok(!existsSync(path.join(root, "industry/prompts")), "another pack's files and emptied folders go");
  assert.deepEqual([read("industry/package.json"), read("industry/README.md")], ["{}", "generated"]);
  assert.deepEqual(checkPack("beta", root), []);
});

test("the check finds a hand edit and a stray file; then no pack is selected", () => {
  selectPack("beta", root);
  write("industry/site.ts", "edited by hand");
  write("industry/extra.md", "x");
  assert.deepEqual(checkPack("beta", root), ["缺少或不同：site.ts", "行业包里没有：extra.md"]);
  assert.throws(() => selectedPack(root), /对不上/);
  selectPack("beta", root);
  assert.equal(selectedPack(root), "beta");
});

test("a wrong or missing name stops with the packs there are", () => {
  assert.throws(() => selectPack("gamma", root), /没有叫“gamma”的行业包。可选：alpha、beta/);
  assert.throws(() => selectPack("", root), /没有给行业包名字。可选：alpha、beta/);
  const script = path.join(import.meta.dirname, "../scripts/select-industry.ts");
  const run = spawnSync(process.execPath, [script, "no-such-pack"], { encoding: "utf8" });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /可选：.*manufacturing/);
});

test("a pack cannot bring the framework's own files", () => {
  write("industry-packs/delta/package.json", "{}");
  assert.throws(() => selectPack("delta", root), /不能有 package\.json/);
});

test("industry/ in the repository is one of the packs, never edited by hand", () => {
  assert.ok(selectedPack());
});
