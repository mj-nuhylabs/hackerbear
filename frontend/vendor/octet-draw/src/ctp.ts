// ChemDraw template files: a template document (.ctp) and template stationery (.cts, the blank sheet ChemDraw's File >
// Open Templates > New Templates opens). Both are a ChemDraw document (CDX, or CDXML) with a TemplateGrid object
// (0x800B: NumRows, NumColumns, the pane size) and NumRows × NumColumns pages, one for each pane, row by row. A pane's
// name is its page's Name annotation (ChemDraw's Document Annotations > Name), which ChemDraw shows as its tooltip.
// Format facts: decision 0018.
// Each pane with something in it becomes a template of the user's, in a new set named after the file, in the panes'
// order, named by its annotation or else by its place in the set ("Template 7"; the library's search finds a set by
// its name). Empty panes are left out (Octet's sets have no gaps). The file is hostile until read: cdx.ts and cdxml.ts
// cap its size, depth and objects; here the number of panes and the size of each template and of the set are capped too.
import { cdxToXml, BASE64_MAGIC, fromBase64, xmlToCdx } from "./cdx.ts";
import { fromCdxml, parseXml, toCdxml, type Xml } from "./cdxml.ts";
import { DEFAULT_STYLE } from "./docstyle.ts";
import { serialize } from "./file.ts";
import type { Mol } from "./render.ts";
import { hasContent, type TemplateSize } from "./templates.ts";

export const MOST_PANES = 500; // panes read from one file
export const MOST_TEMPLATE = 256 * 1024; // characters in one template's file (a pane with a large picture is left out)
export const MOST_SET = 2 * 1024 * 1024; // characters in all the templates of one file
export const NOT_TEMPLATES = "This file is not a ChemDraw template file.";

// A file's name is a template file's: .ctp or .cts.
export const isTemplateFile = (name: string) => /\.ct[ps]$/i.test(name.trim());

// What a template file gives: its templates in order (each with its name), the name of the set (the file's name
// without .ctp), and how many panes had something in them but were left out (too big, or not readable).
export type TemplateFile = { set: string; templates: { name: string; mol: Mol }[]; left: number };

const isName = (x: Xml) => x.name === "annotation" && x.attrs.Keyword === "Name";
// One pane: its name (its Name annotation, "" when it has none) and its drawing, read as a document of its own with the
// file's colours and fonts (shared); undefined when it has nothing in it. Throws when it is damaged.
function readPane(root: Xml, shared: Xml[], page: Xml): { name: string; mol: Mol } | undefined {
  const pane: Xml = { ...page, kids: page.kids.filter((x) => !isName(x)) };
  if (!pane.kids.length) return undefined;
  const mol = fromCdxml({ ...root, kids: [...shared, pane] }).mol;
  return hasContent(mol) ? { name: cleanName(page.kids.find(isName)?.attrs.Content ?? ""), mol } : undefined;
}
const tablesOf = (root: Xml) => root.kids.filter((k) => k.name === "colortable" || k.name === "fonttable");

// The file as the app reads it (a CDX file's bytes in base64, or CDXML text), or its bytes.
export function readTemplateFile(contents: string | Uint8Array, fileName: string): TemplateFile {
  const root: Xml = typeof contents !== "string" ? cdxToXml(contents) : contents.startsWith(BASE64_MAGIC) ? cdxToXml(fromBase64(contents)) : parseXml(contents);
  if (root.name !== "CDXML" || !root.kids.some((k) => k.name === "templategrid")) throw new Error(NOT_TEMPLATES);
  // The document's colours and fonts go with each pane, as its own document.
  const shared = tablesOf(root), pages = root.kids.filter((k) => k.name === "page");
  const templates: TemplateFile["templates"] = [], set = cleanName(fileName.replace(/\.ct[ps]$/i, "")).slice(0, 40) || "Templates";
  let left = Math.max(0, pages.length - MOST_PANES), size = 0;
  pages.slice(0, MOST_PANES).forEach((page) => {
    try {
      const pane = readPane(root, shared, page);
      if (!pane) return;
      const n = serialize(pane.mol).length;
      if (n > MOST_TEMPLATE || size + n > MOST_SET) { left++; return; }
      size += n;
      templates.push({ name: pane.name || `Template ${templates.length + 1}`, mol: pane.mol });
    } catch {
      left++;
    }
  });
  return { set, templates, left };
}

// The pane size each template size writes (the TemplateGrid's extent): three of the sizes ChemDraw's own template
// documents use, 2.75 the most common (New Templates.cts is 2.75 wide).
export const PANE_EXTENT: Record<TemplateSize, number> = { small: 2.25, medium: 2.75, large: 3.5 };
// Columns when the set has no palette open to take them from: New Templates.cts has five.
export const CTP_COLUMNS = 5;

// A set as a ChemDraw template document, in CDX as ChemDraw writes its own: the document's colours and fonts, one page
// for each pane, row by row, then the TemplateGrid (id 0, as the CDX spec asks). Each template is written as Octet
// writes a drawing (the default document style, ACS Document 1996), on a page of its own with its name as the page's
// Name annotation; the panes after the last template are empty pages, as ChemDraw leaves them. Ids run on from page to
// page, so each object's is its own in the document, as in ChemDraw's files. The grid is `columns` wide (no wider than
// the set) and as many rows deep as it needs; its window is as tall as six rows at most, and never less than ChemDraw's
// smallest (8.75).
// The writer keeps to the reader's limits: a template the reader would leave out (too big, or past MOST_PANES and
// MOST_SET) is left out here and counted, so every template written reads back. The same file saved as .cts is
// stationery (ChemDraw opens stationery as a new, untitled document; for template documents that waits for a run of
// ChemDraw, item 24 in the checks pending).
export function writeTemplateFile(list: { name: string; mol: Mol }[], set: string, columns = CTP_COLUMNS, size: TemplateSize = "medium"): { bytes: Uint8Array; written: number; left: number } {
  const tables = { colours: [] as string[], fonts: [] as string[] }, pages: Xml[] = [];
  let root: Xml | undefined, id = 1, total = 0, left = 0;
  for (const t of list) {
    if (pages.length >= MOST_PANES) { left++; continue; }
    try {
      const doc = parseXml(toCdxml(t.mol, DEFAULT_STYLE, { firstId: id, tables, name: `${set}.ctp` })), page = doc.kids.find((k) => k.name === "page")!;
      page.kids = [...page.kids.filter((x) => !isName(x)), { name: "annotation", attrs: { Keyword: "Name", Content: cleanName(t.name) }, kids: [], text: "" }];
      // As the reader will read it, with the reader's limits.
      const back = readPane(doc, tablesOf(doc), page), n = back ? serialize(back.mol).length : Infinity;
      if (n > MOST_TEMPLATE || total + n > MOST_SET) { left++; continue; }
      total += n;
      root = doc;
      pages.push(page);
      id = lastId(page) + 1;
    } catch {
      left++;
    }
  }
  const across = Math.max(1, Math.min(Math.round(columns) || CTP_COLUMNS, pages.length || 1)), rows = Math.max(1, Math.ceil(pages.length / across));
  const blank = (k: number): Xml => ({ name: "page", attrs: { ...(pages[0]?.attrs ?? {}), id: String(id + k) }, kids: [], text: "" });
  const head = root ?? parseXml(toCdxml({ atoms: [], bonds: [] }, DEFAULT_STYLE, { tables, name: `${set}.ctp` }));
  const attrs = { ...head.attrs };
  delete attrs.BoundingBox; // ChemDraw's template documents have none
  const w = PANE_EXTENT[size], grid: Xml = { name: "templategrid", attrs: { PaneHeight: String(Math.round(Math.max(8.75, Math.min(rows, 6) * w) * 65536)), NumRows: String(rows), NumColumns: String(across), extent: `${w} ${w}` }, kids: [], text: "" };
  const doc: Xml = { ...head, attrs, kids: [...tablesOf(head), ...pages, ...Array.from({ length: rows * across - pages.length }, (_, k) => blank(k)), grid] };
  return { bytes: xmlToCdx(doc), written: pages.length, left };
}
// The highest id in a page.
const lastId = (x: Xml): number => x.kids.reduce((m, k) => Math.max(m, lastId(k)), Number.parseInt(x.attrs.id ?? "0", 10) || 0);

// A name as Octet keeps it: no control characters or line breaks, spaces collapsed, at most 80 characters.
const cleanName = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
