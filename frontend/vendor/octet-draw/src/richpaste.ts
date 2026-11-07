// Pasting formatted text into a caption (Sam, 29 October 2026). Text goes in plain; when it looks like a citation and
// its formatted copy (the clipboard's HTML, as PowerPoint, Word and browsers put it) has bold, italic, underline,
// subscript or superscript in it, the caption offers to keep that formatting. Font, size and colour stay the
// document's. Security: the HTML is parsed into an inert document (DOMParser runs no script and loads nothing), only
// its text and those five styles are read, and nothing from it goes into the page.
import { normalise, styled, type RunStyle, type TextRun } from "./richtext.ts";

const MAX_HTML = 512 * 1024, MAX_TEXT = 20000; // characters: a citation is far shorter
const BLOCKS = new Set(["P", "DIV", "LI", "TR", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TABLE", "UL", "OL"]);
const SKIP = new Set(["HEAD", "STYLE", "SCRIPT", "TITLE", "META", "TEMPLATE", "NOSCRIPT"]);

// The text of the clipboard's HTML in runs, with only bold, italic, underline and sub- or superscript; undefined when
// there is none or it is too long.
export function htmlRuns(html: string): TextRun[] | undefined {
  if (!html || html.length > MAX_HTML) return undefined;
  const body = new DOMParser().parseFromString(html, "text/html").body, out: TextRun[] = [];
  let length = 0;
  const push = (text: string, s: RunStyle) => { if (text && length < MAX_TEXT) { out.push({ ...s, text }); length += text.length; } };
  const newLine = (s: RunStyle) => { if (out.length && !out[out.length - 1].text.endsWith("\n")) push("\n", s); };
  const walk = (n: Node, s: RunStyle) => {
    if (n.nodeType === Node.TEXT_NODE) return push((n.textContent ?? "").replace(/[\s ]+/g, " "), s);
    if (!(n instanceof HTMLElement) || SKIP.has(n.tagName)) return;
    if (n.tagName === "BR") return push("\n", s);
    const css = n.style, next: RunStyle = { ...s }, weight = css.fontWeight;
    if (n.tagName === "B" || n.tagName === "STRONG" || weight === "bold" || weight === "bolder" || Number(weight) >= 600) next.bold = true;
    if (weight === "normal" || (Number(weight) > 0 && Number(weight) < 600)) delete next.bold;
    if (n.tagName === "I" || n.tagName === "EM" || css.fontStyle === "italic" || css.fontStyle === "oblique") next.italic = true;
    if (css.fontStyle === "normal") delete next.italic;
    if (n.tagName === "U" || /underline/.test(css.textDecoration || css.textDecorationLine)) next.underline = true;
    if (n.tagName === "SUB" || css.verticalAlign === "sub") next.script = "sub";
    if (n.tagName === "SUP" || css.verticalAlign === "super") next.script = "super";
    const block = BLOCKS.has(n.tagName);
    if (block) newLine(s);
    n.childNodes.forEach((c) => walk(c, next));
    if (block) newLine(s);
  };
  walk(body, {});
  // Spaces at the ends of lines, and empty lines at the start and end, go.
  const text = out.map((r) => r.text).join("");
  if (!text.trim()) return undefined;
  const runs = normalise(out.map((r) => ({ ...r, text: r.text.replace(/ *\n */g, "\n") })));
  while (runs.length && !runs[0].text.trimStart()) runs.shift();
  while (runs.length && !runs[runs.length - 1].text.trimEnd()) runs.pop();
  if (runs.length) { runs[0] = { ...runs[0], text: runs[0].text.trimStart() }; const z = runs.length - 1; runs[z] = { ...runs[z], text: runs[z].text.trimEnd() }; }
  return runs.length ? runs : undefined;
}

// Whether text reads as a reference: a DOI, "et al.", or a journal's year, volume and pages (2021, 143, 1234).
export const citation = (text: string) =>
  /\b10\.\d{4,9}\/\S+/.test(text) || /\bet al\b\.?/i.test(text) || /\b(1[89]|20)\d{2}\b\s*[,;]\s*\d+\s*(\(\d+\))?\s*[,:]\s*[A-Za-z]?\d+(\s*[–-]\s*[A-Za-z]?\d+)?/.test(text);

// The runs to offer for a paste, or undefined when the paste goes in plain with no question.
export const offerFor = (plain: string, html: string): TextRun[] | undefined => {
  if (!plain.trim() || !citation(plain)) return undefined;
  const runs = htmlRuns(html);
  return runs && styled(runs) ? runs : undefined;
};
