// 生成小程序的小图，写进 src/assets/：tabBar 图标（10 张 81×81 PNG）、页面上的八个线框图标、头部的 logo、锐奇页的大 logo、
// 钴蓝单色配图（3 张 JPEG，原图在 brand/photos/）；另有微信后台头像（brand/app-icon.png）和分享卡片的本地兜底图（5:4，见文件末尾）。
// 主品牌是“折页 R”（深墨底、青色 R、白色折角），图形和配色不随改版变。页面图标按双色套印版（docs/design/miniprogram-duotone.md）：
// 墨色线框、直角端点、尖角拐角；选中的 tab 外形填墨，里面的线和块留纸色。
// ImageMagick 自带的 SVG 渲染器画不出 fill="none" 的描边，所以把同样的 SVG 图元交给它的 MVG 绘图指令来画，
// 8 倍尺寸画好再缩小，边缘抗锯齿更干净。
// 改了图形再跑一次：npm run icons（本机要有 magick，或用 MAGICK=/path/to/magick 指定）。生成的文件提交进仓库，CI 不跑这个脚本。
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// 品牌色：只给 logo、后台头像和分享兜底图，不改。
const INK = "#13191c";
const STAR = "#2ce2e8";
const WHITE = "#ffffff";
// 页面色，和 src/styles/tokens.scss 一致。
const PRINT = "#1b1b19"; // $ink：页面上的线框图标、选中的 tab
const MUTE = "#5c5c55"; // $mute：未选中的 tab
const PAPER = "#e9e9e3"; // $paper：选中 tab 里反白的线和块、配图的亮部
const COBALT = "#1b3f8b"; // $cobalt：配图的暗部
const MAX_BYTES = 40 * 1024; // 微信对 tabBar 图标的上限
const MAX_FIGURE_BYTES = 100 * 1024; // 锐奇页每张图 100KB 以内（src/content/README.md）
const SUPERSAMPLE = 8;

/** SVG 图元：path 的 d、circle 的 cx/cy/r、rect 的 x/y/width/height/rx。 */
type Shape = { d: string } | { circle: [number, number, number] } | { rect: [number, number, number, number, number] };
interface Part {
  shape: Shape;
  stroke?: string;
  fill?: string;
}

const BOOKMARK = "M6.5 3.5h11v17l-5.5-4.2-5.5 4.2z";
const CHEVRON = "M9 5l7 7-7 7";

/** tab 图标的外形：未选中只描边，选中描边加填墨。 */
const shell = (on: boolean): Pick<Part, "stroke" | "fill"> => (on ? { stroke: PRINT, fill: PRINT } : { stroke: MUTE });
/** 外形里面的线和块：未选中次要色，选中留纸色。 */
const inner = (on: boolean) => (on ? PAPER : MUTE);

/** 24×24、线宽 1.6 的 tab 图标（原型 docs/design/miniprogram-prototype/industrial/duotone/app.js 的 ICON）。 */
const TABS: Record<string, (on: boolean) => Part[]> = {
  // 精选：版面缩略，左上一块方形配图、右边两行短字、下面一行通栏字。不用星形：四角星是 AI 产品的惯用图形，
  // 和满屏的“AI 摘要”放在一起会读成“AI 功能”入口。
  feed: (on) => [
    { shape: { d: "M3.5 4.5h17v15h-17z" }, ...shell(on) },
    { shape: { rect: [6.5, 7.5, 5, 5, 0] }, fill: inner(on) },
    { shape: { d: "M14 8.25h3.5M14 11.75h3.5M6.5 16h11" }, stroke: inner(on) },
  ],
  // 日报：折角的一页纸，两行字。
  daily: (on) => [
    { shape: { d: "M5.5 3.5h9l4 4v13h-13z" }, ...shell(on) },
    { shape: { d: "M14.5 3.5v4h4M8.5 12h7M8.5 15.5h7" }, stroke: inner(on) },
  ],
  // 运动健康：心形。
  sports: (on) => [{ shape: { d: "M12 20.2l-7.3-7.1a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8a4.6 4.6 0 0 1 6.5 6.5z" }, ...shell(on) }],
  // 收藏：书签。
  saved: (on) => [{ shape: { d: BOOKMARK }, ...shell(on) }],
  // 锐奇：表盘。
  reechi: (on) => [
    { shape: { circle: [12, 12.5, 8.3] }, ...shell(on) },
    { shape: { d: "M12 12.5l4-4M12 6.4v1.8M6 12.5h1.8M16.2 12.5H18" }, stroke: inner(on) },
  ],
};

// 折页 R：青色字干与斜腿、负形阅读窗口、白色折角。512 网格，留白兼容圆形头像裁切。
const LOGO_MARK: Part[] = [
  { shape: { d: "M128 400V112H300L384 196V272L300 316L392 400H300L204 312V400Z M204 184V248H276L308 232V208L284 184Z" }, fill: STAR },
  { shape: { d: "M300 112L384 196H300Z" }, fill: WHITE },
];
const LOGO: Part[] = [
  { shape: { rect: [0, 0, 512, 512, 116] }, fill: INK },
  ...LOGO_MARK,
];

/**
 * ImageMagick 画一个 d 里有几段（几个 M）的路径时不认 butt 和 miter，一律画成圆头圆角，所以只描边的路径按 M 拆开一段段画。
 * 有填充的不拆（logo 的 R 靠第二段挖出窗口）。拆开的每段都从绝对坐标的 M 开始，图形不变。
 */
function mvgShape(shape: Shape, split: boolean): string {
  if ("d" in shape) {
    const pieces = split ? shape.d.split(/(?=M)/) : [shape.d];
    return pieces.map((d) => `path '${d.trim()}'`).join(" ");
  }
  if ("circle" in shape) {
    const [cx, cy, r] = shape.circle;
    return `circle ${cx},${cy} ${cx + r},${cy}`;
  }
  const [x, y, w, h, rx] = shape.rect;
  if (rx === 0) return `rectangle ${x},${y} ${x + w},${y + h}`;
  return `roundrectangle ${x},${y} ${x + w},${y + h} ${rx},${rx}`;
}

/**
 * 把图元拼成 MVG：viewBox 边长 box 的图形画到 size×SUPERSAMPLE 的画布中央，四周各留 pad 像素（按成品尺寸算）。
 * 线框图标都传 "butt", "miter"（直角端点、尖角拐角）；只有填充的图形（logo、头像）不传，保持默认。
 */
function mvg(
  parts: Part[],
  box: number,
  size: number,
  pad: number,
  strokeWidth: number,
  cap: "round" | "butt" = "round",
  join: "round" | "miter" = "round",
): string {
  const offset = pad * SUPERSAMPLE;
  const scale = ((size - 2 * pad) * SUPERSAMPLE) / box;
  const body = parts.map(
    (p) => `push graphic-context fill '${p.fill ?? "none"}' stroke '${p.stroke ?? "none"}' ${mvgShape(p.shape, !p.fill)} pop graphic-context`,
  );
  return [`translate ${offset},${offset}`, `scale ${scale},${scale}`, `stroke-width ${strokeWidth}`, `stroke-linecap ${cap}`, `stroke-linejoin ${join}`, "stroke-miterlimit 4", ...body].join(" ");
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
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(magick, [
    "-size", `${canvas}x${canvas}`, "xc:none", "-draw", draw,
    "-resize", `${size}x${size}`, "-strip", "-define", "png:compression-level=9", out,
  ]);
  const bytes = statSync(out).size;
  if (bytes > MAX_BYTES) throw new Error(`${out} 有 ${bytes} 字节，超过 40KB`);
  console.log(`${out.slice(root.length + 1)}  ${bytes} B`);
}

// tabBar 图标：81px 是 27pt 的 3 倍图；图形画在 24 里，四周各留 4.5px（1.5pt），页面上按 27 显示，图形正好 24。
for (const [name, draw] of Object.entries(TABS)) {
  render(mvg(draw(false), 24, 81, 4.5, 1.6, "butt", "miter"), join(root, "src/assets/tab", `${name}.png`), 81);
  render(mvg(draw(true), 24, 81, 4.5, 1.6, "butt", "miter"), join(root, "src/assets/tab", `${name}-on.png`), 81);
}
// logo 在精选刊头日期行里显示 24px，按 3 倍图出 72px；锐奇页 48px，出 168px。图形和配色不改。
render(mvg(LOGO, 512, 72, 0, 0), join(root, "src/assets/logo.png"), 72);
render(mvg(LOGO, 512, 168, 0, 0), join(root, "src/assets/reechi/logo.png"), 168);
// 后台头像使用满底正方形，让微信决定裁切；放在 src 外，不增加小程序代码包体积。
mkdirSync(join(root, "brand"), { recursive: true });
render(mvg([{ shape: { rect: [0, 0, 512, 512, 0] }, fill: INK }, ...LOGO_MARK], 512, 512, 0, 0), join(root, "brand/app-icon.png"), 512);

// 页面上的线框图标（24×24），按 3 倍图出、图形铺满，直角端点、尖角拐角。显示尺寸写在每一项前面。
const line = (d: string, stroke = PRINT): Part[] => [{ shape: { d }, stroke }];
const ICONS: { out: string; parts: Part[]; size: number; stroke: number }[] = [
  // 收藏按钮（条目页操作条、日报头条下面），描边按钮里 18px：空心书签，收藏以后换实心。
  { out: "item/bookmark.png", parts: line(BOOKMARK), size: 54, stroke: 1.6 },
  { out: "item/bookmark-on.png", parts: [{ shape: { d: BOOKMARK }, stroke: PRINT, fill: PRINT }], size: 54, stroke: 1.6 },
  // 条目页“同一事件”整块右边的箭头、锐奇页文档入口的箭头，都是 18px。
  { out: "item/chevron.png", parts: line(CHEVRON), size: 54, stroke: 1.8 },
  { out: "reechi/chevron.png", parts: line(CHEVRON), size: 54, stroke: 1.8 },
  // 日报翻页条的箭头 16px（不能点时页面上调淡）。
  { out: "daily/prev.png", parts: line("M15 5l-7 7 7 7"), size: 48, stroke: 1.8 },
  { out: "daily/next.png", parts: line(CHEVRON), size: 48, stroke: 1.8 },
  // “提醒我明天的日报”（描边按钮）的铃铛 18px。
  { out: "daily/bell.png", parts: line("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"), size: 54, stroke: 1.6 },
  // 收藏页日报卡“日报”前的折角纸 13px，和日报 tab 同一个图形。
  { out: "saved/daily.png", parts: TABS.daily(false).map((p) => ({ ...p, stroke: PRINT })), size: 39, stroke: 1.8 },
];
for (const { out, parts, size, stroke } of ICONS) {
  render(mvg(parts, 24, size, 0, stroke, "butt", "miter"), join(root, "src/assets", out), size);
}

// 钴蓝单色配图：原图在 brand/photos/（锐奇官网图、Unsplash 照片，不进代码包），转灰度后暗部印钴蓝、亮部是纸色，中间线性混合，
// 不叠网点和纹理。参数和原型 duotone/notes.md 的“配图”一节一致（出图逐像素相同）。显示尺寸见 components/figure。
const FIGURES: { src: string; out: string; crop: string[]; tone: string[]; quality: number }[] = [
  // 锐奇页页首通栏版图：显示 390 宽，按 2 倍出 780；裁掉原图上下的空背景（1000×1000 → 1000×660）。
  {
    src: "reechi-integrated-gauge.jpg", out: "reechi/plate-gauge.jpg",
    crop: ["-crop", "1000x660+0+170", "+repage", "-resize", "780x"],
    tone: ["-level", "0%,100%,0.78", "-sigmoidal-contrast", "3x50%"], quality: 86,
  },
  // 产线图：原图只有 437 宽，不放大，按原生尺寸出（显示 350 宽，2 倍屏下略软，是原图本身的限制）。
  {
    src: "reechi-gauge-line.jpg", out: "reechi/fig-line.jpg",
    crop: [],
    tone: ["-level", "0%,100%,0.92", "-sigmoidal-contrast", "2x50%"], quality: 86,
  },
  // 运动健康栏目配图：先裁成显示比例 350:176，再按 2 倍出 700×352。只由运动健康页引入，备用构建不带它。
  {
    src: "sports-running.jpg", out: "sports/cover.jpg",
    crop: ["-gravity", "center", "-crop", "900x452+0+0", "+repage", "-resize", "700x"],
    tone: ["-level", "0%,100%,0.92", "-sigmoidal-contrast", "2x50%"], quality: 80,
  },
];
for (const { src, out, crop, tone, quality } of FIGURES) {
  const file = join(root, "src/assets", out);
  mkdirSync(dirname(file), { recursive: true });
  execFileSync(magick, [
    join(root, "brand/photos", src), ...crop, "-colorspace", "gray", "-auto-level", ...tone,
    "+level-colors", `${COBALT},${PAPER}`, "-strip", "-quality", String(quality), file,
  ]);
  const bytes = statSync(file).size;
  if (bytes > MAX_FIGURE_BYTES) throw new Error(`${file} 有 ${bytes} 字节，超过 100KB`);
  console.log(`${file.slice(root.length + 1)}  ${bytes} B`);
}

// 分享卡片的本地兜底图，写进 src/assets/share/fallback.png：5:4（500×400），纯品牌图，墨色底、正中折页 R、下面白字小程序名，
// 不带“AI 摘要”字样。分享图拿不到时（share 缺失、接口占位、预检失败）和五个 tab 页的右上角转发（D27）用它。
// 字用分享图服务同一套字体（仓库里 assets/og-fonts 的 Noto Sans SC 粗体），不依赖本机字体。压成 32 色的调色板 PNG，体积几 KB；
// 不能小于 2KB，否则 Taro 会把它内联成 base64，分享接口不认（tests/share.test.ts 检查尺寸和体积）。
const SHARE_W = 500;
const SHARE_H = 400;
const SHARE_NAME = "锐奇微报"; // 和构建配置的 appName 一致
const shareFont = join(root, "../../assets/og-fonts/noto-sans-sc-700.ttf");
const shareOut = join(root, "src/assets/share/fallback.png");
execFileSync(magick, [
  "-size", `${SHARE_W * SUPERSAMPLE}x${SHARE_H * SUPERSAMPLE}`, `xc:${INK}`,
  "-draw", `translate ${122 * SUPERSAMPLE},${22 * SUPERSAMPLE} ${mvg(LOGO_MARK, 512, 256, 0, 0)}`,
  "-resize", `${SHARE_W}x${SHARE_H}`,
  "(", "-size", `${SHARE_W}x${SHARE_H}`, "xc:none", "-font", shareFont, "-fill", WHITE, "-pointsize", "60", "-kerning", "6",
  "-gravity", "center", "-annotate", "+3+100", SHARE_NAME, ")", "-composite",
  "-strip", "-colors", "32", "-define", "png:compression-level=9", `PNG8:${shareOut}`,
]);
const shareBytes = statSync(shareOut).size;
if (shareBytes <= 2048) throw new Error(`${shareOut} 只有 ${shareBytes} 字节，Taro 会把 2KB 以下的图内联成 base64，分享接口不认`);
console.log(`${shareOut.slice(root.length + 1)}  ${shareBytes} B`);
