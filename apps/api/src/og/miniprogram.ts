// The mini program's 5:4 share images (1000×800 PNG), after the prototype's two cards
// (docs/design/miniprogram-prototype/a/share.html): a selected item on ink, an issue of the daily on star
// cyan. The brand at the top left is the industry pack's mini program name (BOARD.appName). Same font
// pipeline and disk cache as the share cards. What a model wrote is marked twice: the words “AI 摘要” on
// the image, and an implicit label in the file (D15), an iTXt chunk keyed AIGC (tEXt is Latin-1 only).
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import satori from "satori";
import sharp from "sharp";
import { beijingWeekday } from "@aihot/contracts/time";
import { BOARD } from "@aihot/industry/site";
import { config, REPO_ROOT } from "@aihot/backend/config";
import { fonts, h, OG_PNG, type Node } from "./render.ts";

export const MINIPROGRAM_SHARE_TEMPLATE_VERSION = "mp-share-2026-10-17.1";
const WIDTH = 1000;
const HEIGHT = 800;
const CACHE_DIR = path.join(config.dataDir, "ogcache");

const INK = "#13191c";
const STAR = "#2ce2e8";
const FOG = "#a9b4ba";

/** The PNG text chunk's keyword for the implicit AI label. */
export const AI_LABEL_KEYWORD = "AIGC";

export interface ItemShareCard {
  kind: "item";
  /** The category's label; null leaves the chip out. */
  category: string | null;
  title: string;
  source: string;
  /** As shown under the source. */
  date: string;
  /** Distinct sources of the item's fact; “N 家在报” from 2 up, as on the item page. */
  sourceCount: number | null;
  /** A model wrote the title and summary. */
  ai: boolean;
}

export interface DailyShareCard {
  kind: "daily";
  /** The daily's name. */
  name: string;
  /** YYYY-MM-DD. */
  date: string;
  headline: string | null;
  /** Up to three highlights. */
  points: string[];
  sections: number;
  items: number;
  /** HH:mm, Beijing. */
  publishedAt: string;
  /** A model wrote the headline or a listed title. */
  ai: boolean;
}

export type MiniprogramShareCard = ItemShareCard | DailyShareCard;

/** What the file's label says, by what the image shows. */
const AI_LABEL_TEXT: Record<MiniprogramShareCard["kind"], string> = {
  item: "标题与摘要由 AI 生成",
  daily: "头条与条目标题由 AI 生成",
};

const STAR_PATH = "M256 92C271 199 313 241 420 256C313 271 271 313 256 420C241 313 199 271 92 256C199 241 241 199 256 92Z";
const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
/** The logo's four-pointed star, as a graphic. */
const star = (color: string) => svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="92 92 328 328"><path d="${STAR_PATH}" fill="${color}"/></svg>`);
const img = (src: string, size: number, style: Record<string, unknown> = {}) => h("img", { width: size, height: size, ...style }, undefined, { src, width: size, height: size });

let logoPromise: Promise<string> | null = null;
/** The industry pack's logo (industry/brand/logo.svg). */
function logo() {
  logoPromise ??= readFile(path.join(REPO_ROOT, "industry/brand/logo.svg"), "utf8").then(svgUri);
  return logoPromise;
}

function clamp(text: string, max: number) {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
}

/** At most `lines` lines, cut with an ellipsis where they run out of room. */
const lines = (n: number) => ({ display: "block", lineClamp: n }) as const;

/** The “AI 摘要” mark, styled as the mini program's (A): the star, then the words. */
function aiMark(background: string, border: string | null): Node {
  return h("div", {
    display: "flex", alignItems: "center", height: 64, padding: "0 22px 0 18px", borderRadius: 14, backgroundColor: background,
    ...(border ? { border: `2px solid ${border}` } : {}),
  }, [
    img(star(STAR), 28, { marginRight: 12 }),
    h("div", { display: "flex", fontSize: 34, fontWeight: 700, color: "#ffffff", letterSpacing: 1 }, "AI 摘要"),
  ]);
}

async function itemTree(c: ItemShareCard): Promise<Node> {
  const title = clamp(c.title, 60);
  const len = [...title].length;
  const titleSize = len > 40 ? 58 : len > 26 ? 66 : 76;
  const echo = c.sourceCount !== null && c.sourceCount >= 2 ? c.sourceCount : null;
  return h("div", {
    width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative",
    padding: "58px 58px 54px", fontFamily: "Noto Sans SC", color: "#ffffff", backgroundColor: INK,
  }, [
    img(star(STAR), 150, { position: "absolute", right: 52, top: 40 }),
    h("div", { display: "flex", alignItems: "center", paddingRight: 200 }, [
      img(await logo(), 64, { borderRadius: 18, border: "2px solid rgba(255,255,255,0.14)", marginRight: 24 }),
      h("div", { display: "flex", fontSize: 46, fontWeight: 700, letterSpacing: 2, marginRight: 22 }, BOARD.appName),
      c.category
        ? h("div", { display: "flex", alignItems: "center", height: 70, padding: "0 24px 0 22px", borderRadius: 14, backgroundColor: "rgba(255,255,255,0.1)" }, [
            h("div", { width: 24, height: 24, borderRadius: 999, backgroundColor: STAR, marginRight: 16 }),
            h("div", { display: "flex", fontSize: 40, fontWeight: 700 }, clamp(c.category, 8)),
          ])
        : null,
    ].filter(Boolean)),
    // Four lines at most, starting below the star; a title that fits is balanced, so no line holds one character.
    h("div", { ...lines(4), fontSize: titleSize, fontWeight: 700, lineHeight: 1.36, letterSpacing: 0.5, textWrap: len > 40 ? "wrap" : "balance", margin: "48px 0 36px" }, title),
    h("div", { display: "flex", alignItems: "flex-end", justifyContent: "space-between" }, [
      h("div", { display: "flex", flexDirection: "column", flex: 1, minWidth: 0, marginRight: 40 }, [
        h("div", { ...lines(1), fontSize: 40, lineHeight: 1.4, color: FOG }, c.source),
        h("div", { display: "flex", fontSize: 46, lineHeight: 1.4, fontWeight: 700 }, c.date),
      ]),
      h("div", { display: "flex", flexDirection: "column", alignItems: "flex-end" }, [
        echo
          ? h("div", { display: "flex", alignItems: "center", marginBottom: c.ai ? 22 : 0 }, [
              h("div", { display: "flex", fontSize: 100, lineHeight: 1, fontWeight: 700, color: STAR, marginRight: 20 }, String(echo)),
              h("div", { display: "flex", flexDirection: "column" }, [
                h("div", { display: "flex", fontSize: 42, lineHeight: 1.2, fontWeight: 700 }, "家在报"),
                h("div", { display: "flex", marginTop: 12 }, Array.from({ length: Math.min(echo, 5) }, () =>
                  h("div", { width: 22, height: 22, borderRadius: 999, backgroundColor: STAR, marginRight: 11 }))),
              ]),
            ])
          : null,
        c.ai ? aiMark("rgba(255,255,255,0.1)", null) : null,
      ].filter(Boolean)),
    ]),
  ]);
}

function dailyTree(c: DailyShareCard): Node {
  const [, month, day] = c.date.split("-");
  const weekday = beijingWeekday(c.date).replace("星期", "周");
  const reading = (value: string, label: string, first: boolean) => h("div", {
    display: "flex", alignItems: "center", fontSize: 40,
    ...(first ? {} : { marginLeft: 32, paddingLeft: 32, borderLeft: "3px solid rgba(19,25,28,0.3)" }),
  }, [h("div", { display: "flex", fontWeight: 700, marginRight: 10 }, value), h("div", { display: "flex" }, label)]);
  return h("div", {
    width: WIDTH, height: HEIGHT, display: "flex", flexDirection: "column", padding: "52px 58px 54px",
    fontFamily: "Noto Sans SC", color: INK, backgroundColor: STAR,
  }, [
    h("div", { display: "flex", alignItems: "center", paddingBottom: 30, borderBottom: "3px solid rgba(19,25,28,0.24)" }, [
      img(star(INK), 50, { marginRight: 22 }),
      h("div", { display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: 1.5 }, clamp(c.name, 12)),
      h("div", { display: "flex", alignItems: "baseline", marginLeft: "auto" }, [
        h("div", { display: "flex", fontSize: 46, fontWeight: 700 }, `${Number(month)}月${Number(day)}日`),
        h("div", { display: "flex", fontSize: 40, marginLeft: 14 }, weekday),
      ]),
    ]),
    c.headline
      ? h("div", { display: "flex", alignItems: "flex-start", marginTop: 36 }, [
          h("div", { display: "flex", alignItems: "center", height: 62, padding: "0 16px", marginTop: 6, marginRight: 20, borderRadius: 12, backgroundColor: INK, color: "#ffffff", fontSize: 38, fontWeight: 700, flexShrink: 0 }, "头条"),
          h("div", { ...lines(2), fontSize: 54, lineHeight: 1.4, fontWeight: 700 }, clamp(c.headline, 60)),
        ])
      : h("div", { display: "flex", marginTop: 36, fontSize: 48, fontWeight: 700 }, "这一期没有条目"),
    h("div", { display: "flex", flexDirection: "column", marginTop: 28 }, c.points.map((p) =>
      h("div", { display: "flex", alignItems: "center", marginTop: 14 }, [
        h("div", { width: 18, height: 18, borderRadius: 999, backgroundColor: INK, marginRight: 22, flexShrink: 0 }),
        h("div", { ...lines(1), flex: 1, fontSize: 42, lineHeight: 1.45 }, clamp(p, 60)),
      ]))),
    h("div", { display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: "auto" }, [
      h("div", { display: "flex", alignItems: "center", paddingBottom: 8 }, [
        reading(String(c.sections), "个分节", true),
        reading(String(c.items), "条", false),
        reading(c.publishedAt, "出刊", false),
      ]),
      c.ai ? aiMark(INK, null) : null,
    ].filter(Boolean)),
  ].filter(Boolean));
}

/** Inserts an iTXt chunk (uncompressed UTF-8 text) right after IHDR. */
export function withTextChunk(png: Buffer, keyword: string, text: string): Buffer {
  const data = Buffer.concat([Buffer.from(keyword, "latin1"), Buffer.from([0, 0, 0]), Buffer.from("zh-CN", "latin1"), Buffer.from([0, 0]), Buffer.from(text, "utf8")]);
  const type = Buffer.from("iTXt", "latin1");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  type.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([type, data])), 8 + data.length);
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8); // signature, then IHDR's length, type, data and CRC
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk, png.subarray(ihdrEnd)]);
}

export function miniprogramShareEtag(card: MiniprogramShareCard): string {
  return createHash("sha256").update(MINIPROGRAM_SHARE_TEMPLATE_VERSION).update(BOARD.appName).update(JSON.stringify(card)).digest("hex").slice(0, 24);
}

/** PNG bytes for a 5:4 card, from the disk cache when this exact card was rendered before. */
const inflight = new Map<string, Promise<{ png: Buffer; etag: string }>>();

export function renderMiniprogramShare(card: MiniprogramShareCard): Promise<{ png: Buffer; etag: string }> {
  const etag = miniprogramShareEtag(card);
  let job = inflight.get(etag);
  if (!job) {
    job = render(card, etag).finally(() => inflight.delete(etag));
    inflight.set(etag, job);
  }
  return job;
}

async function render(card: MiniprogramShareCard, etag: string): Promise<{ png: Buffer; etag: string }> {
  const file = path.join(CACHE_DIR, `mp-${etag}.png`);
  try {
    return { png: await readFile(file), etag };
  } catch {
    // not cached yet
  }
  const tree = card.kind === "item" ? await itemTree(card) : dailyTree(card);
  const svg = await satori(tree as never, { width: WIDTH, height: HEIGHT, fonts: await fonts() });
  const plain = await sharp(Buffer.from(svg)).png(OG_PNG).toBuffer();
  const png = card.ai ? withTextChunk(plain, AI_LABEL_KEYWORD, AI_LABEL_TEXT[card.kind]) : plain;
  await mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmp, png);
  await rename(tmp, file);
  return { png, etag };
}
