// Feed dates: Chinese feeds print "2026-09-30 09:08:20" without a zone, which Date.parse reads in the
// server's zone (UTC in Docker, eight hours off). They are read at +08:00, like dates on list pages;
// dates that carry their zone (RFC 822, ISO with Z or an offset) keep it. Same result in every TZ.
import assert from "node:assert/strict";
import http from "node:http";
import { after, test } from "node:test";
import { config } from "@aihot/backend/config";
import { fetchRss, parseDate } from "@aihot/backend/sources/rss";

const originalTz = process.env.TZ;
after(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const ZONES = ["UTC", "Asia/Shanghai", "America/Los_Angeles", "Pacific/Auckland"];

/** The parse of `value` under each zone; they must all agree. */
function acrossZones(value: string): string | null {
  const seen = new Set<string | null>();
  for (const zone of ZONES) {
    process.env.TZ = zone;
    seen.add(parseDate(value)?.toISOString() ?? null);
  }
  assert.equal(seen.size, 1, `"${value}" parses differently across zones: ${[...seen].join(", ")}`);
  return [...seen][0]!;
}

test("changing TZ changes the host's zone (so the checks below compare real zones)", () => {
  process.env.TZ = "UTC";
  const utc = new Date(2026, 8, 30, 9).getTime();
  process.env.TZ = "Asia/Shanghai";
  assert.notEqual(new Date(2026, 8, 30, 9).getTime(), utc);
});

test("a feed date without a zone is read at +08:00", () => {
  assert.equal(acrossZones("2026-09-30 09:08:20"), "2026-09-30T01:08:20.000Z");
  assert.equal(acrossZones("2026-09-30T09:08:20"), "2026-09-30T01:08:20.000Z");
  assert.equal(acrossZones("2026/09/30 09:08"), "2026-09-30T01:08:00.000Z");
});

test("RFC 822 dates keep their zone, also named US zones and a Chinese weekday", () => {
  assert.equal(acrossZones("Wed, 30 Sep 2026 09:08:20 GMT"), "2026-09-30T09:08:20.000Z");
  assert.equal(acrossZones("Wed, 30 Sep 2026 09:08:20 +0800"), "2026-09-30T01:08:20.000Z");
  assert.equal(acrossZones("Wed, 30 Sep 2026 09:08:20 EST"), "2026-09-30T14:08:20.000Z");
  assert.equal(acrossZones("星期三, 30 Sep 2026 09:08:20 +0800"), "2026-09-30T01:08:20.000Z");
});

test("ISO dates with Z or an offset keep it", () => {
  assert.equal(acrossZones("2026-09-30T09:08:20Z"), "2026-09-30T09:08:20.000Z");
  assert.equal(acrossZones("2026-09-30T09:08:20.500Z"), "2026-09-30T09:08:20.500Z");
  assert.equal(acrossZones("2026-09-28T17:31:35-04:00"), "2026-09-28T21:31:35.000Z");
});

test("a date that begins with the year keeps a zone it names, also a US zone name; AM/PM is read", () => {
  assert.equal(acrossZones("2026-09-30 09:08:20 +0800"), "2026-09-30T01:08:20.000Z");
  assert.equal(acrossZones("2026-09-30 09:08:20 -0400"), "2026-09-30T13:08:20.000Z");
  assert.equal(acrossZones("2026-09-30 09:08:20 GMT"), "2026-09-30T09:08:20.000Z");
  assert.equal(acrossZones("2026-09-30 09:08:20 EST"), "2026-09-30T14:08:20.000Z");
  assert.equal(acrossZones("2026-09-30 09:08:20 PDT"), "2026-09-30T16:08:20.000Z");
  assert.equal(acrossZones("2026-09-30 09:08 PM GMT"), "2026-09-30T21:08:00.000Z");
});

test("a date alone: ISO is UTC midnight, other spellings are midnight at +08:00", () => {
  assert.equal(acrossZones("2026-09-30"), "2026-09-30T00:00:00.000Z");
  assert.equal(acrossZones("2026/09/30"), "2026-09-29T16:00:00.000Z");
  assert.equal(acrossZones("2026年9月30日"), "2026-09-29T16:00:00.000Z");
});

test("no date is null", () => {
  assert.equal(acrossZones(""), null);
  assert.equal(acrossZones("not a date"), null);
});

test("an RSS item's zone-less pubDate reaches the candidate at +08:00", async () => {
  const server = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/rss+xml");
    res.end(`<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>电池网</title>` +
      `<item><title>某企业固态电池产线投产</title><link>https://example.org/news/1.html</link><pubDate>2026-09-30 09:08:20</pubDate></item>` +
      `</channel></rss>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const previous = config.allowPrivateNetworkFetch;
  config.allowPrivateNetworkFetch = true;
  try {
    process.env.TZ = "UTC";
    const feedUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/feed`;
    const { candidates } = await fetchRss({ config: { feedUrl }, participation_mode: "editorial" } as never);
    assert.equal(candidates[0]!.publishedAt?.toISOString(), "2026-09-30T01:08:20.000Z");
  } finally {
    config.allowPrivateNetworkFetch = previous;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
