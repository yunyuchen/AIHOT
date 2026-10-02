// Verifies MCP with the official SDK client: handshake, list the five tools, call each once.
// node scripts/mcp-check.ts [url] [search words]; exits 1 when a tool is missing or a call fails.
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { MCP_TOOL_NAMES as T } from "@aihot/contracts/mcp";
import { SITE } from "@aihot/industry/site";
const url = new URL(process.argv[2] ?? "http://127.0.0.1:3001/api/mcp");
const query = process.argv[3] ?? SITE.subject;
const client = new Client({ name: `${SITE.mcpPrefix}-mcp-check`, version: "1.0.0" });
await client.connect(new StreamableHTTPClientTransport(url));
const info = client.getServerVersion?.();
console.log("server:", JSON.stringify(info));
const tools = await client.listTools();
const listed = tools.tools.map((t) => t.name);
console.log("tools:", listed.join(", "));
const missing = Object.values(T).filter((name) => !listed.includes(name));
if (missing.length) console.log("missing tools:", missing.join(", "));
let failed = missing.length;
// The last call is out of range on purpose: the server must answer it with an error.
const calls: Array<[string, Record<string, unknown>, expectError?: boolean]> = [
  [T.latest, { limit: 2 }],
  [T.search, { q: query, limit: 2 }],
  [T.hot, { limit: 3 }],
  [T.daily, {}],
  [T.latest, { limit: 99 }, true],
];
const hot = await client.callTool({ name: T.hot, arguments: { limit: 1 } });
const storyId = ((hot.structuredContent as any)?.items?.[0]?.links?.story ?? "").split("/").pop();
if (storyId) calls.push([T.story, { public_id: storyId, report_limit: 3 }]);
for (const [name, args, expectError = false] of calls) {
  // A protocol error (thrown) counts as an error answer, like a tool result marked isError.
  const r = await client.callTool({ name, arguments: args }).catch((e) => ({ isError: true, content: [{ type: "text", text: String(e) }] }));
  const text = (r.content as Array<{ type: string; text?: string }>)[0]?.text ?? "";
  console.log(`${name} ${JSON.stringify(args)} → ${r.isError ? "ERROR" : "ok"}${Boolean(r.isError) === expectError ? "" : " (unexpected)"} | ${text.replace(/\n/g, " ").slice(0, 140)}`);
  if (Boolean(r.isError) !== expectError) failed += 1;
}
await client.close();
if (failed) console.log(`\n${failed} check(s) failed`);
process.exit(failed ? 1 : 0);
