// 生成 tabBar 图标（10 张 81×81 PNG）、头部的 logo 小标和小星（“AI 摘要”角标、扫描条游标、时间轴当前时段），写进 src/assets/；
// 另有分享卡片的本地兜底图（5:4，见文件末尾）。
// 图形照原型 A 版（docs/design/miniprogram-prototype/a/feed.html 的 tabBar 和 logo），路径数据原样抄自原型的 SVG。
// ImageMagick 自带的 SVG 渲染器画不出 fill="none" 的描边，所以把同样的 SVG 图元交给它的 MVG 绘图指令来画，
// 8 倍尺寸画好再缩小，边缘抗锯齿更干净。
// 改了图形再跑一次：npm run icons（本机要有 magick，或用 MAGICK=/path/to/magick 指定）。生成的 PNG 提交进仓库，CI 不跑这个脚本。
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INK = "#13191c";
const STAR = "#2ce2e8";
const OFF = "#6b757e"; // tabBar 未选中：墨灰，和 app.config 的 tabBar.color 一致
const WHITE = "#ffffff";
const MAX_BYTES = 40 * 1024; // 微信对 tabBar 图标的上限
const SUPERSAMPLE = 8;

/** SVG 图元：path 的 d、circle 的 cx/cy/r、rect 的 x/y/width/height/rx。 */
type Shape = { d: string } | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };
interface Part {
  shape: Shape;
  stroke?: string;
  fill?: string;
}

/** 原型里 24×24、线宽 1.6 的线框图标；color 是线条色，on 表示选中态。 */
const TABS: Record<string, (color: string, on: boolean) => Part[]> = {
  // 精选：时间轴。选中时上面的节点填星青（原型），未选中时整张墨灰、节点留白。
  feed: (c, on) => [
    { shape: { d: "M7 3v18" }, stroke: c },
    { shape: { circle: [7, 7.5, 2.6] }, stroke: c, fill: on ? STAR : WHITE },
    { shape: { circle: [7, 16.5, 2.6] }, stroke: c, fill: WHITE },
    { shape: { d: "M13 7.5h8M13 16.5h6" }, stroke: c },
  ],
  daily: (c) => [
    { shape: { rect: [4.5, 3, 15, 18, 2] }, stroke: c },
    { shape: { d: "M8.5 8h7M8.5 12h7M8.5 16h4" }, stroke: c },
  ],
  sports: (c) => [
    { shape: { d: "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" }, stroke: c },
    { shape: { d: "M7.5 12.5h2.3l1.2-2.2 2 4 1.2-1.8h2.3" }, stroke: c },
  ],
  saved: (c) => [{ shape: { d: "M6.5 3.5h11v17L12 16.8l-5.5 3.7z" }, stroke: c }],
  reechi: (c) => [
    { shape: { rect: [3.5, 3.5, 17, 17, 4.5] }, stroke: c },
    { shape: { d: "M12 7.5c.4 2.9 1.6 4.1 4.5 4.5-2.9.4-4.1 1.6-4.5 4.5-.4-2.9-1.6-4.1-4.5-4.5 2.9-.4 4.1-1.6 4.5-4.5z" }, stroke: c },
  ],
};

const STAR_PATH = "M256 92C271 199 313 241 420 256C313 271 271 313 256 420C241 313 199 271 92 256C199 241 241 199 256 92Z";

// logo：墨色圆角方块（512 见方、圆角 116）上一颗星青四角星。
const LOGO: Part[] = [
  { shape: { rect: [0, 0, 512, 512, 116] }, fill: INK },
  { shape: { d: STAR_PATH }, fill: STAR },
];

// “AI 摘要”角标里的星青小星（原型的 #star symbol，viewBox 92 92 328 328）。
const STAR_MARK: Part[] = [{ shape: { d: STAR_PATH }, fill: STAR }];
// 焦点卡“今日焦点”星青底标里的墨色小星。
const STAR_INK: Part[] = [{ shape: { d: STAR_PATH }, fill: INK }];

function mvgShape(shape: Shape): string {
  if ("d" in shape) return `path '${shape.d}'`;
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    return `circle ${cx},${cy} ${cx + r},${cy}`;
  }
  const [x, y, w, h, rx] = shape.rect;
  return `roundrectangle ${x},${y} ${x + w},${y + h} ${rx},${rx}`;
}

/** 把图元拼成 MVG：viewBox 边长 box 的图形画到 size×SUPERSAMPLE 的画布中央，四周各留 pad 像素（按成品尺寸算）。 */
function mvg(parts: Part[], box: number, size: number, pad: number, strokeWidth: number): string {
  const offset = pad * SUPERSAMPLE;
  const scale = ((size - 2 * pad) * SUPERSAMPLE) / box;
  const body = parts.map(
    (p) => `push graphic-context fill '${p.fill ?? "none"}' stroke '${p.stroke ?? "none"}' ${mvgShape(p.shape)} pop graphic-context`,
  );
  return [`translate ${offset},${offset}`, `scale ${scale},${scale}`, `stroke-width ${strokeWidth}`, "stroke-linecap round", "stroke-linejoin round", ...body].join(" ");
}

function findMagick(): string {
  for (const candidate of [process.env.MAGICK, "/opt/homebrew/bin/magick", "/usr/local/bin/magick", "/Applications/ServBay/bin/magick"]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return "magick";
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const magick = findMagick();

function render(draw: string, out: string, size: number) {
  const canvas = size * SUPERSAMPLE;
  execFileSync(magick, [
    "-size", `${canvas}x${canvas}`, "xc:none", "-draw", draw,
    "-resize", `${size}x${size}`, "-strip", "-define", "png:compression-level=9", out,
  ]);
  const bytes = statSync(out).size;
  if (bytes > MAX_BYTES) throw new Error(`${out} 有 ${bytes} 字节，超过 40KB`);
  console.log(`${out.slice(root.length + 1)}  ${bytes} B`);
}

// tabBar 图标显示成 27pt 见方（81px 是 3 倍图）；原型里图标画在 24px 里，所以四周各留 4.5px（1.5pt）。
for (const [name, draw] of Object.entries(TABS)) {
  render(mvg(draw(OFF, false), 24, 81, 4.5, 1.6), join(root, "src/assets/tab", `${name}.png`), 81);
  render(mvg(draw(INK, true), 24, 81, 4.5, 1.6), join(root, "src/assets/tab", `${name}-on.png`), 81);
}
// logo 在头部显示成 24px，按 3 倍图出 72px。
render(mvg(LOGO, 512, 72, 0, 0), join(root, "src/assets/logo.png"), 72);
// 小星在角标里显示 8px、扫描条游标上 9px、时间轴当前时段的节点里 11px，按最大的 11px 的 3 倍图出 33px。
// 星形只占 512 见方里的 92–420，pad 取负值把四周的空白裁掉（同原型的 viewBox）。
render(mvg(STAR_MARK, 512, 33, (-92 * 33) / 328, 0), join(root, "src/assets/star.png"), 33);
// 墨色小星在“今日焦点”底标里显示 10px，出 30px。
render(mvg(STAR_INK, 512, 30, (-92 * 30) / 328, 0), join(root, "src/assets/star-ink.png"), 30);

// 锐奇 tab 的图标，写进 src/assets/reechi/。线框图标照原型 reechi.html（24×24、线宽 1.6），邮箱和地址原型里没有，按同样的风格补画。
// 都按 3 倍图出、图形铺满：列表和联系方式的图标显示 20px，产品卡图标 22px，箭头 16px，头部的大 logo 56px。
const IRON = "#5d6872"; // 铁灰：箭头和产品卡上的图标
const REECHI_ICONS: Record<string, Part[]> = {
  phone: [{ shape: { d: "M6.6 3.5h3l1.6 4.2-2 1.3a10.5 10.5 0 0 0 5.8 5.8l1.3-2 4.2 1.6v3a2 2 0 0 1-2.1 2A16.6 16.6 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z" }, stroke: INK }],
  mail: [
    { shape: { rect: [3.5, 5.5, 17, 13, 2.5] }, stroke: INK },
    { shape: { d: "M4.5 7.5l7.5 5.5 7.5-5.5" }, stroke: INK },
  ],
  pin: [
    { shape: { d: "M12 20.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0c0 4.9-6.5 10.5-6.5 10.5z" }, stroke: INK },
    { shape: { circle: [12, 10, 2.3] }, stroke: INK },
  ],
  chat: [
    { shape: { d: "M4.5 5.5h15v10.5h-9l-4 3.5v-3.5h-2z" }, stroke: INK },
    { shape: { d: "M8.5 9.5h7M8.5 12.5h4.5" }, stroke: INK },
  ],
  info: [
    { shape: { circle: [12, 12, 8.5] }, stroke: INK },
    { shape: { d: "M12 11v5.5" }, stroke: INK },
    { shape: { circle: [12, 7.8, 0.4] }, stroke: INK },
  ],
  doc: [
    { shape: { d: "M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10z" }, stroke: INK },
    { shape: { d: "M14 3.5v5h5M8.8 13h6.4M8.8 16.5h4" }, stroke: INK },
  ],
  shield: [
    { shape: { d: "M12 3.2l7 2.8v5.2c0 4.4-2.9 8-7 9.6-4.1-1.6-7-5.2-7-9.6V6z" }, stroke: INK },
    { shape: { d: "M9.2 12l2 2 3.6-3.8" }, stroke: INK },
  ],
};
const PRODUCT: Part[] = [
  { shape: { rect: [3.5, 5, 17, 14, 2.5] }, stroke: IRON },
  { shape: { circle: [9, 10, 1.6] }, stroke: IRON },
  { shape: { d: "M4 17l5-4.5 3.5 3 3-2.5 4.5 4" }, stroke: IRON },
];
const CHEVRON: Part[] = [{ shape: { d: "M9 5l7 7-7 7" }, stroke: IRON }];
for (const [name, parts] of Object.entries(REECHI_ICONS)) render(mvg(parts, 24, 60, 0, 1.6), join(root, "src/assets/reechi", `${name}.png`), 60);
render(mvg(PRODUCT, 24, 66, 0, 1.6), join(root, "src/assets/reechi/product.png"), 66);
render(mvg(CHEVRON, 24, 48, 0, 2), join(root, "src/assets/reechi/chevron.png"), 48);
render(mvg(LOGO, 512, 168, 0, 0), join(root, "src/assets/reechi/logo.png"), 168);

// 条目页的图标，写进 src/assets/item/。线框照原型 item.html（24×24、线宽 1.8，箭头线宽 2），按 3 倍图出、图形铺满：
// 收藏、分享按钮里显示 18px，复制按钮里 16px，事件入口的箭头 20px。分享按钮是墨底，图标线条用星青（原型 .btn.solid svg）。
const ITEM_ICONS: Record<string, { parts: Part[]; size: number; stroke: number }> = {
  bookmark: { parts: [{ shape: { d: "M6.5 3.5h11v17L12 16.8l-5.5 3.7z" }, stroke: INK }], size: 54, stroke: 1.8 },
  share: { parts: [{ shape: { d: "M4.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-6M12 15V4M8 8l4-4 4 4" }, stroke: STAR }], size: 54, stroke: 1.8 },
  copy: {
    parts: [
      { shape: { rect: [9, 9, 11, 11, 2] }, stroke: INK },
      { shape: { d: "M5 15V5a1 1 0 0 1 1-1h10" }, stroke: INK },
    ],
    size: 48,
    stroke: 1.8,
  },
  chevron: { parts: [{ shape: { d: "M9 5l7 7-7 7" }, stroke: IRON }], size: 60, stroke: 2 },
};
for (const [name, { parts, size, stroke }] of Object.entries(ITEM_ICONS)) {
  render(mvg(parts, 24, size, 0, stroke), join(root, "src/assets/item", `${name}.png`), size);
}

// 收藏（票 17）。条目页和日报头条卡的收藏按钮收藏以后换成实心书签 bookmark-on.png（墨色，和 bookmark.png 一样 54px）。
// 收藏页的图标写进 src/assets/saved/，线框照原型 saved.html（24×24），按 3 倍图出、图形铺满：头部“保存在这台手机上”前的手机 14px
// （雾灰，线宽 1.6），日报卡“日报”标签的文档 13px（墨色，线宽 1.8），“MM-DD 收藏”前的书签 12px（铁灰，线宽 1.8），
// 底部说明前的圆圈 i 16px（铁灰，线宽 1.6）。
const BOOKMARK = "M6.5 3.5h11v17L12 16.8l-5.5 3.7z";
const FOG = "#a9b4ba"; // 雾灰：深色头部上的次要字和图标
render(mvg([{ shape: { d: BOOKMARK }, stroke: INK, fill: INK }], 24, 54, 0, 1.8), join(root, "src/assets/item/bookmark-on.png"), 54);
const SAVED_ICONS: Record<string, { parts: Part[]; size: number; stroke: number }> = {
  device: {
    parts: [
      { shape: { rect: [6.5, 2.5, 11, 19, 2.5] }, stroke: FOG },
      { shape: { d: "M10.5 18.5h3" }, stroke: FOG },
    ],
    size: 42,
    stroke: 1.6,
  },
  daily: {
    parts: [
      { shape: { rect: [4.5, 3, 15, 18, 2] }, stroke: INK },
      { shape: { d: "M8.5 8h7M8.5 12h7M8.5 16h4" }, stroke: INK },
    ],
    size: 39,
    stroke: 1.8,
  },
  bookmark: { parts: [{ shape: { d: BOOKMARK }, stroke: IRON }], size: 36, stroke: 1.8 },
  info: {
    parts: [
      { shape: { circle: [12, 12, 9] }, stroke: IRON },
      { shape: { d: "M12 11v5.5" }, stroke: IRON },
      { shape: { circle: [12, 7.8, 0.4] }, stroke: IRON },
    ],
    size: 48,
    stroke: 1.6,
  },
};
for (const [name, { parts, size, stroke }] of Object.entries(SAVED_ICONS)) {
  render(mvg(parts, 24, size, 0, stroke), join(root, "src/assets/saved", `${name}.png`), size);
}

// 日报的图标，写进 src/assets/daily/。线框照原型 daily.html（24×24），按 3 倍图出、图形铺满，都显示 16px：
// 头部前一天、后一天的箭头（墨底上的白线，线宽 2；不能点时页面上调淡），头条卡“提醒我明天的日报”的铃铛（线宽 1.8）。
// “分享日报”按钮和条目页的“分享给同事”一样是墨底，直接用 src/assets/item/share.png。
const DAILY_ICONS: Record<string, { parts: Part[]; stroke: number }> = {
  prev: { parts: [{ shape: { d: "M15 5l-7 7 7 7" }, stroke: WHITE }], stroke: 2 },
  next: { parts: [{ shape: { d: "M9 5l7 7-7 7" }, stroke: WHITE }], stroke: 2 },
  bell: {
    parts: [
      { shape: { d: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" }, stroke: INK },
      { shape: { d: "M10 21h4" }, stroke: INK },
    ],
    stroke: 1.8,
  },
};
for (const [name, { parts, stroke }] of Object.entries(DAILY_ICONS)) {
  render(mvg(parts, 24, 48, 0, stroke), join(root, "src/assets/daily", `${name}.png`), 48);
}

// 分享卡片的本地兜底图，写进 src/assets/share/fallback.png：5:4（500×400），纯品牌图，墨色底、正中一颗星青四角星、下面白字小程序名，
// 不带“AI 摘要”字样。分享图拿不到时（share 缺失、接口占位、预检失败）和五个 tab 页的右上角转发（D27）用它。
// 字用分享图服务同一套字体（仓库里 assets/og-fonts 的 Noto Sans SC 粗体），不依赖本机字体。压成 32 色的调色板 PNG，体积几 KB；
// 不能小于 2KB，否则 Taro 会把它内联成 base64，分享接口不认（tests/share.test.ts 检查尺寸和体积）。
const SHARE_W = 500;
const SHARE_H = 400;
const SHARE_STAR = 150; // 星形外接正方形的边长，中心在 (250, 150)
const SHARE_NAME = "锐奇热点"; // 和构建配置的 appName 一致
const shareFont = join(root, "../../assets/og-fonts/noto-sans-sc-700.ttf");
const shareOut = join(root, "src/assets/share/fallback.png");
const starScale = (SHARE_STAR * SUPERSAMPLE) / 328;
const starAt = (SHARE_W / 2 - SHARE_STAR / 2) * SUPERSAMPLE;
const starTop = (150 - SHARE_STAR / 2) * SUPERSAMPLE;
execFileSync(magick, [
  "-size", `${SHARE_W * SUPERSAMPLE}x${SHARE_H * SUPERSAMPLE}`, `xc:${INK}`,
  "-draw", `translate ${starAt},${starTop} scale ${starScale},${starScale} translate -92,-92 fill '${STAR}' path '${STAR_PATH}'`,
  "-resize", `${SHARE_W}x${SHARE_H}`,
  "(", "-size", `${SHARE_W}x${SHARE_H}`, "xc:none", "-font", shareFont, "-fill", WHITE, "-pointsize", "60", "-kerning", "6",
  "-gravity", "center", "-annotate", "+3+100", SHARE_NAME, ")", "-composite",
  "-strip", "-colors", "32", "-define", "png:compression-level=9", `PNG8:${shareOut}`,
]);
const shareBytes = statSync(shareOut).size;
if (shareBytes <= 2048) throw new Error(`${shareOut} 只有 ${shareBytes} 字节，Taro 会把 2KB 以下的图内联成 base64，分享接口不认`);
console.log(`${shareOut.slice(root.length + 1)}  ${shareBytes} B`);
