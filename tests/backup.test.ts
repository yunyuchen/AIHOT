// The daily backup names its files for the industry pack's board, so instances of different packs sharing
// one bucket do not overwrite each other, and keeps the newest few local copies of each kind by time: copies
// named before the board was in the name count with this pack's own and age out, another pack's are left alone. pg_dump is
// the real one (skipped where it is not installed); the object store is answered here (global fetch).
import "./setup.ts";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { runBackup } from "@aihot/backend/operations/backup";
import { BOARD } from "@aihot/industry/site";

const STORE = { DB_BACKUP_STORE_SECRET_ID: "test-id", DB_BACKUP_STORE_SECRET_KEY: "test-key", DB_BACKUP_STORE_BUCKET: "backup-test", DB_BACKUP_STORE_REGION: "ap-test" };
const uploaded: Array<{ key: string; bytes: number }> = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.host !== "backup-test.cos.ap-test.myqcloud.com" || init?.method !== "PUT") throw new Error(`unexpected request ${url}`);
  let bytes = 0;
  for await (const chunk of init.body as AsyncIterable<Buffer>) bytes += chunk.length;
  uploaded.push({ key: url.pathname.slice(1), bytes });
  return new Response(null, { status: 200 });
}) as typeof fetch;

after(async () => {
  globalThis.fetch = realFetch;
  await closeDb();
});

const pgDump = await promisify(execFile)("which", ["pg_dump"]).then((r) => r.stdout.trim(), () => "");

test("backups are named for the board, and the oldest local copies go, older names included", { skip: !pgDump && "pg_dump is not installed" }, async () => {
  const [last] = await sql<{ value: unknown }[]>`SELECT value FROM settings WHERE key = 'backup.last'`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "aihot-backup-"));
  const dir = path.join(config.dataDir, "backups");
  const other = "otherboard";
  const own = (stamp: string) => [`${BOARD.key}-${stamp}.dump`, `${BOARD.key}-files-${stamp}.tar.gz`];
  const legacy = (stamp: string) => [`aihot-${stamp}.dump`, `aihot-files-${stamp}.tar.gz`];
  // Left by earlier runs: two under the old names, one older than both under this pack's own name (so the
  // time decides which go, not the name: a name order would keep the own copy and drop an old-named one),
  // and one of another pack's.
  await mkdir(dir, { recursive: true });
  for (const f of [...legacy("202610152010"), ...legacy("202610162010"), ...own("202610142010"), `${other}-202610162010.dump`]) {
    await writeFile(path.join(dir, f), "");
  }
  Object.assign(process.env, STORE);
  try {
    // 04:10 on a Tuesday in Beijing: daily/ only; the stamp is UTC.
    await runBackup(new Date("2026-10-20T04:10:00+08:00"));
    assert.deepEqual(uploaded.map((u) => u.key).sort(), own("202610192010").map((f) => `daily/${f}`).sort());
    assert.ok(uploaded.every((u) => u.bytes > 0), "each with its file's contents");
    assert.deepEqual(
      (await readdir(dir)).sort(),
      [...own("202610192010"), ...legacy("202610162010"), ...legacy("202610152010"), `${other}-202610162010.dump`].sort(),
      "the newest three of each kind by time are kept, across old and new names; the older own-named copy goes",
    );
  } finally {
    for (const k of Object.keys(STORE)) delete process.env[k];
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
    if (last) await sql`UPDATE settings SET value = ${sql.json(last.value as never)} WHERE key = 'backup.last'`;
    else await sql`DELETE FROM settings WHERE key = 'backup.last'`;
  }
});
