// Export and the Office clipboard (src-tauri/src/export.rs and clipboard.rs). standaloneSvg turns the drawing on a
// canvas into a standalone SVG at true size; the app makes a PDF or PNG of it, puts it on the clipboard with the
// structure, and reads structures back on paste.

import { invoke } from "@tauri-apps/api/core";

// Octet's own layers, not part of the drawing: page marks and grid, selection (its frame and resize handles too),
// hover, reaction interpretation, NMR shifts, problems, handles, guides, the rubber band, the eraser and the rest.
export const UI = [
  "pages", "grid", "selection-marks", "frame-marks", "nmr-marks", "nmr-shift", "problem-mark", "mark", "arrow-mark", "suggested",
  "ghost", "pen-points", "mapping", "handle", "turn-handle", "turn-centre", "turn-angle", "box", "trail", "erase-marks", "brush",
  "count", "guide", "snap-point", "spot-picked", "lane-picked", "group-frame", "grid-pick", "interpretation",
].map((c) => `.${c}`).join(",");

// Inherited properties: written where an element's value differs from its parent's.
const INHERITED = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset",
  "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "paint-order", "font-family", "font-size", "font-style",
  "font-weight", "text-anchor", "letter-spacing", "word-spacing", "visibility",
];
// The rest: written where they differ from the default (as WebKit or Chromium reports it).
const OWN: [string, string[]][] = [
  ["opacity", ["1"]], ["stop-color", ["rgb(0, 0, 0)"]], ["stop-opacity", ["1"]], ["dominant-baseline", ["auto"]],
  ["baseline-shift", ["baseline", "0px"]], ["text-decoration-line", ["none"]], ["filter", ["none"]], ["clip-path", ["none"]], ["mask", ["none"]],
];

// url("http://localhost/#shade3") as a standalone SVG needs it: url(#shade3).
const local = (v: string) => v.replace(/url\(\s*(["']?)[^#"')]*#([^"')]+)\1\s*\)/g, "url(#$2)");

// The drawing on `canvas` (an <svg> whose first <g> holds the drawing in px at 100%, as the editor's canvas does)
// as a standalone SVG: only what is inside `bounds` (px, in that <g>'s frame), at true size with 1 user unit = 1 pt
// (`ptPerPx` points per px), its edges rounded outward to hundredths of a point (frameOf). Octet's own layers are left out. Colours
// are written out as on white paper (the light theme's ink and paper), so CSS variables and classes are no longer
// needed. Everything in the canvas inside the bounds is drawn: for a part of the drawing, pass a canvas showing
// only that part.
export function standaloneSvg(canvas: SVGSVGElement, bounds: [number, number, number, number], ptPerPx: number): string {
  const [x0, y0, w, h] = frameOf(bounds, ptPerPx);
  // The light theme for a moment: nothing is painted before the attributes go back. The colours go back through
  // element.style, as the CSP allows no style attribute.
  const saved = ["data-theme", "class"].map((a) => [a, canvas.getAttribute(a)] as const);
  const colours = ["--ink", "--canvas"].map((k) => [k, canvas.style.getPropertyValue(k)] as const);
  canvas.setAttribute("data-theme", "light");
  canvas.setAttribute("class", "canvas");
  canvas.style.removeProperty("--ink");
  canvas.style.removeProperty("--canvas");
  try {
    const copy = canvas.cloneNode(true) as SVGSVGElement;
    const live = [canvas, ...canvas.querySelectorAll("*")], out = [copy, ...copy.querySelectorAll("*")];
    const styles = new Map<Element, CSSStyleDeclaration>();
    const css = (el: Element) => styles.get(el) ?? styles.set(el, getComputedStyle(el)).get(el)!;
    const drop: Element[] = [];
    live.forEach((el, i) => {
      const to = out[i], ui = el === canvas ? null : el.closest(UI);
      if ((ui && canvas.contains(ui)) || /^(script|foreignObject)$/i.test(el.localName)) return void drop.push(to);
      const s = css(el), parent = el === canvas ? undefined : css(el.parentElement!);
      for (const k of INHERITED) {
        const v = s.getPropertyValue(k);
        if (v && v !== parent?.getPropertyValue(k)) to.setAttribute(k, local(v));
      }
      for (const [k, initial] of OWN) {
        const v = s.getPropertyValue(k);
        if (v && !initial.includes(v)) to.setAttribute(k === "text-decoration-line" ? "text-decoration" : k, local(v));
      }
      if (s.whiteSpace.startsWith("pre")) to.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
      for (const a of [...to.attributes]) if (/^(style|class|role|tabindex|aria-|data-|on)/i.test(a.name)) to.removeAttribute(a.name);
    });
    for (const el of drop) el.remove();
    // Groups that held only Octet's own layers (a hover mark's, for one) go too, innermost first.
    for (const g of [...copy.querySelectorAll("g")].reverse()) if (!g.firstElementChild) g.remove();
    // The view's pan and zoom give way to px → pt.
    copy.querySelector(":scope > g")?.setAttribute("transform", `scale(${+ptPerPx.toFixed(6)})`);
    copy.setAttribute("width", `${w}pt`);
    copy.setAttribute("height", `${h}pt`);
    copy.setAttribute("viewBox", `${x0} ${y0} ${w} ${h}`);
    return new XMLSerializer().serializeToString(copy);
  } finally {
    for (const [a, v] of saved) if (v === null) canvas.removeAttribute(a); else canvas.setAttribute(a, v);
    for (const [k, v] of colours) if (v) canvas.style.setProperty(k, v);
  }
}

// A picture's view box in pt (x, y, width, height) for `bounds` in px: rounded outward to hundredths of a point, at
// least one hundredth across. Issue 20: whole points made the frame up to 2 pt larger than the ink; ChemDraw's is
// within 0.2 pt of it.
export function frameOf(bounds: [number, number, number, number], ptPerPx: number): [number, number, number, number] {
  const [x0, y0] = [Math.floor(bounds[0] * ptPerPx * 100 + 1e-6), Math.floor(bounds[1] * ptPerPx * 100 + 1e-6)];
  const [x1, y1] = [Math.ceil(bounds[2] * ptPerPx * 100 - 1e-6), Math.ceil(bounds[3] * ptPerPx * 100 - 1e-6)];
  return [x0 / 100, y0 / 100, Math.max(1, x1 - x0) / 100, Math.max(1, y1 - y0) / 100];
}

// The ink of a <text>'s glyphs in its own frame (x0, y0, x1, y1). getBBox gives the line box instead, the font's
// ascent to its descent: some 2 pt above a capital and 2 pt below the baseline at 10 pt (issue 20: a pasted picture
// was 4.6 pt taller than its drawing). Each character is measured (`ink`: its glyph's box about its origin, in the
// font of the element that holds it) where the browser placed it. Undefined if it cannot be done (characters the
// browser collapsed or turned, text with a line through or under it, or nothing to measure): use getBBox.
export type GlyphInk = (ch: string, el: Element) => [number, number, number, number] | undefined;
export function inkOfText(text: SVGTextElement, ink: GlyphInk): [number, number, number, number] | undefined {
  const chars: [string, Element][] = [];
  const walk = (n: Node) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) for (const ch of c.nodeValue ?? "") chars.push([ch, n as Element]);
    else if (c.nodeType === 1) walk(c);
  });
  walk(text);
  if (!chars.length || chars.length !== text.getNumberOfChars()) return undefined;
  let box: [number, number, number, number] | undefined;
  for (let i = 0; i < chars.length; i++) {
    const [ch, el] = chars[i];
    if (/\s/.test(ch)) continue;
    if (text.getRotationOfChar(i)) return undefined;
    const g = ink(ch, el), at = text.getStartPositionOfChar(i);
    if (!g) return undefined;
    const b: [number, number, number, number] = [at.x + g[0], at.y + g[1], at.x + g[2], at.y + g[3]];
    box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b;
  }
  return box;
}
// A glyph's ink about its origin, as the browser draws it in `el`'s font (canvas measureText); undefined for text with
// a decoration line, whose ink measureText leaves out, and for text on a baseline other than the alphabetic one (an
// atom's number and R or S sit on the middle one), which Chromium leaves out of getStartPositionOfChar.
let measurer: CanvasRenderingContext2D | null | undefined;
export const glyphInk: GlyphInk = (ch, el) => {
  measurer ??= document.createElement("canvas").getContext("2d");
  const s = getComputedStyle(el), text = el.closest("text");
  if (!measurer || s.textDecorationLine !== "none" || (text && getComputedStyle(text).textDecorationLine !== "none")) return undefined;
  if (!/^(auto|alphabetic)$/.test(s.dominantBaseline || "auto") || !/^(auto|baseline|alphabetic)$/.test(s.alignmentBaseline || "auto")) return undefined;
  measurer.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  const m = measurer.measureText(ch);
  return [-m.actualBoundingBoxLeft, -m.actualBoundingBoxAscent, m.actualBoundingBoxRight, m.actualBoundingBoxDescent];
};

// Copy: the picture (standaloneSvg of the selection, with the selection's CDXML hidden in it: on the Mac a PDF, on
// Windows an EMF, on Linux a PNG), then CDX, the CDXML as its own type (cdxmlType), its molfile, SMILES and Octet's
// JSON, on the clipboard under ChemDraw's names on each system (src-tauri/src/clipboard.rs). ChemDraw itself puts no
// CDXML type on; ChemDraw JS does. Each left out is not put on. Call it from the copy event after preventDefault(),
// and set nothing on clipboardData: plain text would make ChemDraw paste a caption. With `text`, only that text goes
// on (Edit > Copy As).
// dpi: the export resolution, which the PNG and bitmap on Windows and Linux take (as ChemDraw's Copy As PNG takes
// its Save As PNG resolution), at most 16 million pixels.
export const copyToClipboard = (c: { dpi?: number; svg?: string; cdxml?: string; cdxmlType?: boolean; cdx?: string; molfile?: string; smiles?: string; octetJson?: string; text?: string }) =>
  invoke<void>("copy_to_clipboard", c);

// What paste can use from the clipboard, each null when absent: Octet's JSON; CDXML (the CDXML type Octet and
// ChemDraw JS write, or hidden in a pasted picture: Octet's, ChemDraw's PDF on the Mac, or either copied back out of
// Word); ChemDraw's CDX as base64; a molfile or RXN file; SMILES. All of it comes from another program: read it as a
// hostile file. filled: the clipboard holds something, usable or not.
export type Clipboard = { octet: string | null; cdxml: string | null; cdx: string | null; molfile: string | null; smiles: string | null; text: string | null; picture: string | null; spectrum?: [string, string] | null; filled?: boolean };
export const readClipboard = () => invoke<Clipboard>("read_clipboard");
// What Paste says when nothing on the clipboard pasted: why the text is not a structure, else that it cannot read
// what is there (a ChemDraw picture copied back out of Word on Windows, issue 23). Nothing for an empty clipboard.
export const pasteRefused = (clip: Pick<Clipboard, "filled">, text: string | undefined, why: string) =>
  text?.trim() ? `Octet cannot read this structure. ${why}` : clip.filled ? "Octet cannot read what is on the clipboard." : undefined;

export type ExportFormat = "oct" | "pdf" | "svg" | "png" | "emf" | "eps" | "tif" | "jpg" | "gif" | "cdxml" | "cdx" | "mol" | "mol2000" | "sdf" | "sdf2000" | "rxn" | "rxn2000" | "rdf" | "rdf2000" | "smi" | "inchi";
// The pictures: vector (PDF, SVG, EMF, EPS) and pixels at a resolution (PNG, TIFF, JPEG, GIF; JPEG is always on white).
export const PICTURES: ExportFormat[] = ["pdf", "png", "svg", "emf", "eps", "tif", "jpg", "gif"];
export const RASTERS: ExportFormat[] = ["png", "tif", "jpg", "gif"];
// The pictures that carry the drawing's CDXML (the PDF as ChemDraw's does, the EMF in a comment, the PNG in a chunk), so
// they open, drop and paste back into Octet as the drawing, from a file or copied back out of Word.
export const CARRY_CDXML: ExportFormat[] = ["pdf", "png", "emf"];
// A picture format's short name, as Quick export's menu item says it.
export const shortName = (f: ExportFormat) => (f === "tif" ? "TIFF" : f === "jpg" ? "JPEG" : f.toUpperCase());
// The MDL formats, each V3000 (as ChemDraw 26.1 saves them) and V2000, as ChemDraw lists them.
export const MDL: ExportFormat[] = ["mol", "mol2000", "sdf", "sdf2000", "rxn", "rxn2000", "rdf", "rdf2000"];
// Every format, with its name in Export and Settings.
export const EXPORT_FORMATS: [ExportFormat, string][] = [["oct", "Octet drawing (.oct)"], ["pdf", "PDF"], ["png", "PNG"], ["svg", "SVG"], ["emf", "EMF (Windows Office)"], ["eps", "EPS"],
  ["tif", "TIFF"], ["jpg", "JPEG"], ["gif", "GIF"], ["cdxml", "CDXML (ChemDraw)"], ["cdx", "CDX (ChemDraw)"], ["mol", "MOL"], ["mol2000", "MOL V2000"],
  ["sdf", "SDF"], ["sdf2000", "SDF V2000"], ["rxn", "RXN"], ["rxn2000", "RXN V2000"], ["rdf", "RDF"], ["rdf2000", "RDF V2000"], ["smi", "SMILES"], ["inchi", "InChI"]];
// A picture from standaloneSvg with a margin of `pt` all round: its size and view box grow by that much.
export function withMargin(svg: string, pt: number): string {
  const m = Math.max(0, Math.min(72, pt)), n = (v: number) => +v.toFixed(4);
  return svg.replace(/^(<svg[^>]*?)\swidth="([\d.]+)pt"\sheight="([\d.]+)pt"\sviewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_, head, w, h, x, y, vw, vh) =>
    `${head} width="${n(+w + 2 * m)}pt" height="${n(+h + 2 * m)}pt" viewBox="${n(+x - m)} ${n(+y - m)} ${n(+vw + 2 * m)} ${n(+vh + 2 * m)}"`);
}
// Raster resolution: any dpi from 36 to 2400 (Rust clamps to the same), with these as quick picks (1440 is ChemDraw's
// highest). A picture has at most 100 million pixels and 20,000 on a side (draw in src-tauri/src/export.rs).
export const DPI_MIN = 36, DPI_MAX = 2400, MAX_PIXELS = 100e6, MAX_SIDE = 20000;
export const DPIS = [72, 150, 300, 350, 600, 1200, 1440];
// Pixels across `pt` points at `dpi`, as export.rs counts them (a part pixel counts, a rounding error does not).
export const pixelsAt = (pt: number, dpi: number) => Math.max(1, Math.ceil((pt * dpi) / 72 - 0.01));
// The dpi that makes `pt` points `px` pixels across, kept in range.
export const dpiFor = (px: number, pt: number) => Math.max(DPI_MIN, Math.min(DPI_MAX, (px * 72) / pt));
export const tooLarge = (w: number, h: number) => w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS;
// A picture from withMargin on a background colour (#rrggbb), the whole view box filled behind the drawing.
export function withBackground(svg: string, hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return svg;
  const box = /^<svg[^>]*?\sviewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"[^>]*>/.exec(svg);
  return box ? `${box[0]}<rect x="${box[1]}" y="${box[2]}" width="${box[3]}" height="${box[4]}" fill="${hex}"/>${svg.slice(box[0].length)}` : svg;
}
// A picture as a format saves it: with the margin, and for a raster format its background. Transparent only where the
// format has it (JPEG has none); "page" is the drawing's own page colour (`page`), and white when it has none.
export function pictureAs(svg: string, f: { format: ExportFormat; margin: number; background: "white" | "transparent" | "page" }, page?: string): { svg: string; transparent: boolean } {
  const m = withMargin(svg, f.margin), raster = RASTERS.includes(f.format);
  if (raster && f.background === "page" && page) return { svg: withBackground(m, page), transparent: false };
  return { svg: m, transparent: raster && f.format !== "jpg" && f.background === "transparent" };
}
// File > Export…: the drawing in every form the page has (svg from standaloneSvg). The app asks where to save,
// offering those formats (or only `format`), and writes the one the file name's extension asks for. The PDF, PNG
// and EMF carry the CDXML (CARRY_CDXML), as on the clipboard. PNG at `dpi` of true size (300 if not given), white unless
// `transparent`; JPEG at `quality` (1 to 100, 95 if not given). mdl: the text of the MDL format asked for; csv: Home's
// Experiments list. Resolves to the path written, or null if cancelled.
export type ExportRequest = {
  name: string; format?: ExportFormat | "csv"; csv?: string; oct?: string; svg?: string; cdxml?: string; cdx?: string; mdl?: string; smiles?: string; inchi?: string;
  dpi?: number; transparent?: boolean; quality?: number;
};
export const exportFile = (request: ExportRequest) => invoke<string | null>("export_file", { export: request });
