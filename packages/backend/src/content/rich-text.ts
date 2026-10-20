// The item body for the mini program's rich-text component, which draws only a short list of tags
// and runs nothing. The read layer's body (already whitelisted, its images already signed proxy
// addresses) is reduced to paragraphs, headings h2–h4, lists, quotes, bold and italic, simple tables
// and images. Links keep their text and lose their address (the mini program opens no web page);
// video, embeds and a table nested in a table have no rich-text form and are left out with their
// content; any other tag is unwrapped to its text. An image keeps only an absolute address of this
// instance's image proxy, so no picture is fetched from another host.
import * as cheerio from "cheerio";

/** Every tag the converted body may hold; `br` only breaks a line inside them. */
export const RICH_TEXT_TAGS = ["p", "br", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em", "table", "tr", "th", "td", "img"] as const;

/**
 * The line every converted body ends with. It is always there, not only when something was left out:
 * links, image sizes, captions and styling are lost on every body, and iframes and scripts were already
 * dropped when the body was stored, so the conversion cannot tell a complete copy from an incomplete one.
 */
export const RICH_TEXT_NOTE = "完整排版请复制来源链接查看";

/** Elements left out with everything inside them. */
const DROP = new Set([
  "video", "audio", "iframe", "frame", "object", "embed", "applet", "script", "style", "noscript", "template", "svg", "canvas", "math",
  "form", "input", "button", "select", "option", "textarea", "source", "track", "map", "area", "head", "title", "meta", "link", "hr",
]);
const RENAME: Record<string, string> = { b: "strong", i: "em", h1: "h2", h5: "h4", h6: "h4" };
/** Kept as they are (tables have their own branch). */
const KEEP = new Set(["p", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "strong", "em"]);
/** Containers that read as a paragraph of their own when they hold no block of their own. */
const AS_PARAGRAPH = new Set(["div", "section", "article", "figcaption", "caption", "pre", "dt", "dd", "address", "aside", "header", "footer"]);
const BLOCKS = new Set(["p", "div", "section", "article", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "table", "figure", "pre", "dl"]);

/** The parsed DOM's shape, as far as this walk reads it (htmlparser2 nodes through cheerio). */
interface DomNode {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: DomNode[];
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");
/** Nothing a reader would see: no text, no picture. */
const blank = (html: string) => !html.includes("<img") && !html.replace(/<br>/g, "").replace(/<[^>]+>/g, "").trim();

const childrenOf = (node: DomNode) => node.children ?? [];
const nameOf = (node: DomNode) => node.name?.toLowerCase() ?? "";
const hasDescendant = (node: DomNode, test: (name: string) => boolean): boolean =>
  childrenOf(node).some((c) => (c.name !== undefined && test(nameOf(c))) || hasDescendant(c, test));

/**
 * The body in rich-text tags, ending with {@link RICH_TEXT_NOTE}. `origin` is this instance's address
 * (SITE_URL): the read layer signs body images as relative proxy addresses, and only those are kept,
 * made absolute; any other picture is left out.
 */
export function toRichText(html: string, origin: string): string {
  const proxy = `${origin}/api/img-proxy?`;
  const root = cheerio.load(html, null, false).root()[0] as unknown as DomNode;

  const inner = (node: DomNode, pre: boolean): string => childrenOf(node).map((c) => render(c, pre)).join("");

  function image(attribs: Record<string, string>): string {
    const src = (attribs.src ?? "").trim();
    const absolute = src.startsWith("/api/img-proxy?") ? `${origin}${src}` : src.startsWith(proxy) ? src : null;
    if (!absolute) return "";
    // rich-text honours inline style; without it a wide picture runs past the screen.
    return `<img src="${escapeAttr(absolute)}"${attribs.alt ? ` alt="${escapeAttr(attribs.alt)}"` : ""} style="max-width:100%;height:auto">`;
  }

  function cell(node: DomNode): string {
    const tag = nameOf(node);
    const spans = ["colspan", "rowspan"]
      .filter((a) => /^\d{1,3}$/.test(node.attribs?.[a] ?? ""))
      .map((a) => ` ${a}="${node.attribs![a]}"`)
      .join("");
    return `<${tag}${spans}>${inner(node, false)}</${tag}>`;
  }

  /** A table rich-text can draw: its rows, sections unwrapped, a caption moved out before it. */
  function table(node: DomNode): string {
    // A table inside a table lays a page out; it is no data table and rich-text cannot draw it.
    if (hasDescendant(node, (n) => n === "table")) return "";
    const rows: DomNode[] = [];
    let caption = "";
    for (const c of childrenOf(node)) {
      const name = nameOf(c);
      if (name === "tr") rows.push(c);
      else if (name === "thead" || name === "tbody" || name === "tfoot") rows.push(...childrenOf(c).filter((r) => nameOf(r) === "tr"));
      else if (name === "caption") caption = inner(c, false);
    }
    const body = rows
      .map((r) => childrenOf(r).filter((x) => nameOf(x) === "td" || nameOf(x) === "th").map(cell).join(""))
      .filter((cells) => cells)
      .map((cells) => `<tr>${cells}</tr>`)
      .join("");
    return `${blank(caption) ? "" : `<p>${caption}</p>`}${body ? `<table>${body}</table>` : ""}`;
  }

  function render(node: DomNode, pre: boolean): string {
    if (node.type === "text") {
      const text = escapeText(node.data ?? "");
      return pre ? text.replace(/\r?\n/g, "<br>") : text;
    }
    if (node.name === undefined) return ""; // comments, directives
    const name = RENAME[nameOf(node)] ?? nameOf(node);
    if (DROP.has(name)) return "";
    if (name === "br") return "<br>";
    if (name === "img") return image(node.attribs ?? {});
    if (name === "table") return table(node);
    if (KEEP.has(name)) {
      const content = inner(node, pre);
      return blank(content) ? "" : `<${name}>${content}</${name}>`;
    }
    if (AS_PARAGRAPH.has(name) && !hasDescendant(node, (n) => BLOCKS.has(n))) {
      const content = inner(node, pre || name === "pre");
      return blank(content) ? "" : `<p>${content}</p>`;
    }
    // A link keeps its text; spans, code, figures, definition lists and anything unknown are unwrapped.
    return inner(node, pre);
  }

  return `${inner(root, false).trim()}<p>${RICH_TEXT_NOTE}</p>`;
}
