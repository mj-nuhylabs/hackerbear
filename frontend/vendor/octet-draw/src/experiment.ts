// Experiment pages (discussion #15): a page for one experiment in a lab notebook. Its details (title, date, notebook
// reference and the rest) are the document's annotations, keyword and content pairs, as ChemDraw keeps File >
// Document Annotations: ChemDraw shows and keeps them, and the CDXML and .oct readers already check them as hostile
// input. The page draws them as a block at its top (detailsLayout), each reaction drawn on it gets its stoichiometry
// grid at once (newGrids), and text typed on it turns its markup into rich text (markupRuns).
import { straightArrow, type Annotation, type Caption, type Grid, type Mol, type Shape } from "./render.ts";
import { normalise, plainOf, runsOf, styled, styleOf, type RunStyle, type TextRun } from "./richtext.ts";
import { ESCAPES } from "./escapes.ts";

// The details, each kept as an annotation whose keyword is its name here.
export const FIELDS = [
  ["title", "Title"], ["date", "Date"], ["notebook", "Notebook"], ["project", "Project"], ["author", "Author"],
  ["temperature", "Temperature"], ["time", "Time"], ["pressure", "Pressure"], ["solvent", "Solvent"],
] as const;
export type Field = (typeof FIELDS)[number][0];
export type Details = Partial<Record<Field, string>>;
export const MAX_VALUE = 200;
// A value as the page keeps it: one line, no control characters, MAX_VALUE characters at most.
const clean = (v: string) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, MAX_VALUE).trim();

// The details in a document's annotations (the first annotation with each keyword).
export function detailsOf(annotations?: Annotation[]): Details {
  const out: Details = {};
  for (const [k, name] of FIELDS) {
    const a = annotations?.find((x) => x.keyword === name), v = a && clean(a.content);
    if (v) out[k] = v;
  }
  return out;
}
// The annotations with these details: every annotation with a detail's keyword is replaced, the others stay first in
// their order. An empty value leaves its keyword out. Undefined when there are none.
export function withDetails(annotations: Annotation[] | undefined, details: Details): Annotation[] | undefined {
  const names = new Set<string>(FIELDS.map(([, name]) => name));
  const out = [...(annotations ?? []).filter((a) => !names.has(a.keyword)), ...FIELDS.flatMap(([k, keyword]) => { const v = clean(details[k] ?? ""); return v ? [{ keyword, content: v }] : []; })];
  return out.length ? out : undefined;
}
// Today as the Date field takes it: 4 November 2026.
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const today = (d = new Date()) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
// A Date as it sorts: 4 November 2026 (or 4 Nov 2026) as 2026-11-04. Any other text stays as it is.
export function dateKey(date: string): string {
  const m = /^\s*(\d{1,2}) ([A-Za-z]+)\.? (\d{4})\s*$/.exec(date), month = m ? MONTHS.findIndex((n) => n.toLowerCase().startsWith(m[2].toLowerCase()) && m[2].length >= 3) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}` : date;
}

// Whether a drawing is an experiment page: its purpose is Experiment or a template made from it, or it names a
// template this computer does not have (a colleague's) and has experiment details.
export const experimentPage = (kind: string | undefined, purpose: string | undefined, annotations?: Annotation[]) =>
  kind === "experiment" || (kind === undefined && !!purpose && Object.keys(detailsOf(annotations)).length > 0);

// A new experiment page: its details from the template (Date today), and the template's text and boxes (an own
// template's, else HEADINGS: each a bold heading at the left margin with an outlined box under it, both ordinary text
// and an ordinary box the user can edit, move or delete; issue 34). The reaction's table of reagents and products is
// drawn under the reaction, so the scheme's box has room for both. page: the page in mm; bond: the bond length in pt.
export const MARGIN = 15; // mm
// Each heading and how far down the page its box starts and ends, in mm.
export const HEADINGS: [string, number, number][] = [["Reaction scheme", 60, 200], ["Procedure", 212, 282]];
const perMm = (bond: number) => 72 / 25.4 / bond; // drawing units (bond lengths) in a mm
export function newExperiment(page: [number, number], bond: number, template?: Mol, date = today()): Pick<Mol, "annotations" | "captions" | "shapes"> {
  const k = perMm(bond), details = { ...detailsOf(template?.annotations), date }, left = (MARGIN - page[0] / 2) * k, right = (page[0] / 2 - MARGIN) * k, down = (mm: number) => (page[1] / 2 - mm) * k;
  const captions = template ? template.captions : HEADINGS.map(([text, top], j) => ({ id: 2 * j, text, bold: true, align: "left" as const, x: left, y: down(top - 2) }));
  const shapes: Shape[] | undefined = template ? template.shapes : HEADINGS.map(([, top, bottom], j) => ({ id: 2 * j + 1, kind: "box" as const, from: [left, down(top)], to: [right, down(bottom)] }));
  return { annotations: withDetails(template?.annotations, details), ...(captions?.length ? { captions } : {}), ...(shapes?.length ? { shapes } : {}) };
}
// The Reaction scheme box: the box (or rounded box) under the Reaction scheme heading, the nearest below it that spans
// the heading's start. As [left, bottom, right, top] in drawing units; undefined with no such heading or box (any
// other page, or a template without them).
const spanOf = (x: Shape): [number, number, number, number] => [Math.min(x.from[0], x.to[0]), Math.min(x.from[1], x.to[1]), Math.max(x.from[0], x.to[0]), Math.max(x.from[1], x.to[1])];
function schemeShape(m: Mol): Shape | undefined {
  const h = (m.captions ?? []).find((c) => !c.under && !c.on && !c.cycle && /^reaction scheme$/i.test(c.text.trim()));
  if (!h) return undefined;
  const near = (m.shapes ?? []).filter((x) => (x.kind === "box" || x.kind === "rounded") && !x.angle).filter((x) => { const b = spanOf(x); return b[3] <= h.y + 1e-6 && b[0] <= h.x + 1e-6 && b[2] > h.x; });
  return near.sort((p, q) => spanOf(q)[3] - spanOf(p)[3])[0];
}
export const schemeSpan = (m: Mol) => { const x = schemeShape(m); return x && spanOf(x); };
export const inSpan = (b: number[] | undefined, p: [number, number]) => !!b && p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
// Where a structure or reaction inserted on an experiment page goes (issue 34): inside the Reaction scheme box, a bond
// length (pad) under its top, or under whatever is in the box already (taken: its ink and tables), centred across the
// box (from its left when wider than the box). The offset to move `ink` by; undefined with no box.
export function schemeLanding(m: Mol, ink: number[], taken: number[][], pad = 1): [number, number] | undefined {
  const b = schemeSpan(m);
  if (!b) return undefined;
  const there = taken.filter((t) => t[0] < b[2] && t[2] > b[0] && t[1] < b[3] && t[3] > b[1]);
  const top = Math.min(b[3], ...there.map((t) => t[1])) - pad, w = ink[2] - ink[0];
  const x = w > b[2] - b[0] - 2 * pad ? b[0] + pad - ink[0] : (b[0] + b[2]) / 2 - (ink[0] + ink[2]) / 2;
  return [x, top - ink[3]];
}
// The Reaction scheme box grown down to hold what reaches `bottom` (a reagent table, a scheme), a bond length (pad)
// clear. Free text and boxes under it (the Procedure heading and box) move down as far, so nothing overlaps. The same
// drawing when it fits already, or with no box.
export function growScheme(m: Mol, bottom: number, pad = 1): Mol {
  const s = schemeShape(m), b = s && spanOf(s);
  if (!s || !b) return m;
  const d = b[1] - (bottom - pad);
  if (d <= 1e-6) return m;
  const down = (p: [number, number]): [number, number] => [p[0], p[1] - d];
  const shapes = m.shapes!.map((x) => (x === s ? { ...x, ...(x.from[1] < x.to[1] ? { from: down(x.from) } : { to: down(x.to) }) } : spanOf(x)[3] < b[1] + 1e-6 ? { ...x, from: down(x.from), to: down(x.to) } : x));
  const captions = m.captions?.map((c) => (!c.under && !c.on && !c.cycle && c.y < b[1] ? { ...c, y: c.y - d } : c));
  return { ...m, shapes, ...(captions ? { captions } : {}) };
}

// What an own template made from an experiment page keeps: its details but the date, its free text (headings, a
// procedure to start from) and its plain boxes and tables. Structures, arrows and text tied to them stay with the drawing.
export const templateOf = (m: Mol): Mol => {
  const { date: _, ...kept } = detailsOf(m.annotations), annotations = withDetails(undefined, kept);
  const captions = (m.captions ?? []).filter((c) => !c.under && !c.on && !c.cycle && !c.property);
  const shapes = (m.shapes ?? []).filter((x) => x.kind === "box" || x.kind === "rounded" || x.kind === "table");
  return { atoms: [], bonds: [], ...(captions.length ? { captions } : {}), ...(shapes.length ? { shapes } : {}), ...(annotations ? { annotations } : {}) };
};

// The details block at the top of the page: the title in bold, larger, then the other details two to a row, each
// name in bold with its value after it, and a rule under them. Positions in drawing units (y up), sizes in pt. A
// value too wide for its column is cut short with an ellipsis. measure: a text's width in pt at a size, bold or not.
export type BlockText = { text: string; x: number; y: number; size: number; bold?: true };
export function detailsLayout(details: Details, page: [number, number], bond: number, size: number, measure: (text: string, size: number, bold: boolean) => number):
  { texts: BlockText[]; rule: [number, number, number]; box: [number, number, number, number] } {
  const k = perMm(bond), u = (pt: number) => pt / bond, left = (MARGIN - page[0] / 2) * k, right = (page[0] / 2 - MARGIN) * k, top = (page[1] / 2 - MARGIN) * k;
  const texts: BlockText[] = [], big = 1.4 * size, cell = (right - left) / 2;
  let y = top;
  if (details.title) { y -= u(big); texts.push({ text: fit(details.title, (right - left) / u(1), big, true, measure), x: left, y, size: big, bold: true }); y -= u(0.5 * size); }
  const rest = FIELDS.slice(1), label = Math.max(...rest.map(([, name]) => measure(name, size, true))) + 0.8 * size;
  for (let r = 0; r < rest.length; r += 2) {
    y -= u(1.5 * size);
    rest.slice(r, r + 2).forEach(([key, name], c) => {
      const x = left + c * cell, v = details[key];
      texts.push({ text: name, x, y, size, bold: true });
      if (v) texts.push({ text: fit(v, cell / u(1) - label - size, size, false, measure), x: x + u(label), y, size });
    });
  }
  y -= u(0.8 * size);
  return { texts, rule: [left, right, y], box: [left, y, right, top] };
}
function fit(text: string, room: number, size: number, bold: boolean, measure: (text: string, size: number, bold: boolean) => number) {
  if (measure(text, size, bold) <= room) return text;
  let n = text.length;
  while (n > 1 && measure(`${text.slice(0, n).trimEnd()}…`, size, bold) > room) n--;
  return `${text.slice(0, n).trimEnd()}…`;
}

// Each new reaction arrow an edit draws (one whose id was not in the drawing before) gets a stoichiometry grid, as
// Analyse Stoichiometry gives it, unless its reaction has one already. A grid on an arrow of the same reaction shows
// once (the editor draws one grid for each reaction). No more than MAX_GRIDS on the drawing's arrows, as a file holds.
export const MAX_GRIDS = 100; // file.ts
export function newGrids(before: Mol, after: Mol): Mol {
  const had = new Set((before.arrows ?? []).map((a) => a.id)), gridded = new Set((after.grids ?? []).map((g) => g.arrow));
  const live = (after.arrows ?? []).filter((a) => gridded.has(a.id)).length;
  const add: Grid[] = (after.arrows ?? []).filter((a) => straightArrow(a) && !had.has(a.id) && !gridded.has(a.id)).slice(0, Math.max(0, MAX_GRIDS - live)).map((a) => ({ arrow: a.id, typed: {} }));
  return add.length ? { ...after, grids: [...(after.grids ?? []), ...add] } : after;
}

// Markup typed as text, turned into rich text: *italic*, **bold**, LaTeX's \textit{…}, \emph{…}, \textbf{…},
// \underline{…}, \textsuperscript{…}, \textsubscript{…}, and math between dollars: $^{13}$C or $^2$ a superscript,
// $_3$ or $_{2}$ a subscript, letters in italic ($J$, $R_f$) unless in \mathrm{…} or \text{…}, and \alpha, \delta,
// \circ, \pm, \times and the like as their symbols (in text too). \$, \*, \_, \%, \&, \#, \{ and \} are the
// characters themselves. Stars and dollars pair within a line. A star that opens has a letter or digit after it and
// none before it, and one that closes has no space before it and no letter or digit after it, so (1R*,2S*) stays as it
// is; dollars hold no space at either end, so "$5 and $10" stays as it is. Anything
// unpaired stays as it is. Each character keeps its own style, with the markup's over it. Text over MAX_MARKUP
// characters comes back unchanged.
const COMMANDS: Record<string, RunStyle> = {
  textit: { italic: true }, emph: { italic: true }, textbf: { bold: true }, underline: { underline: true }, textsuperscript: { script: "super" }, textsubscript: { script: "sub" },
  mathit: { italic: true }, mathbf: { bold: true }, mathrm: {}, text: {}, textrm: {}, textup: {}, mbox: {},
};
const ROMAN = new Set(["mathrm", "mathbf", "text", "textrm", "textup", "mbox"]);
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const SYMBOLS = ESCAPES; // escapes.ts: the names typed anywhere in Octet
const ESCAPED = "$*_%&#{}";
export const MAX_MARKUP = 20_000;
type Ch = { ch: string; s: RunStyle };
export function markupRuns(runs: TextRun[]): TextRun[] {
  const chars: Ch[] = runs.flatMap((r) => Array.from(r.text, (ch) => ({ ch, s: styleOf(r) })));
  if (chars.length > MAX_MARKUP) return runs;
  return normalise(walk(chars, false, false, 0).map((c) => ({ ...c.s, text: c.ch })));
}
const over = (cs: Ch[], s: RunStyle) => cs.map((c) => ({ ch: c.ch, s: { ...c.s, ...s } }));
const word = (cs: Ch[], i: number) => /^[A-Za-z]+/.exec(cs.slice(i, i + 40).map((x) => x.ch).join(""))?.[0];
// A scan from place j steps over a backslash and the character after it, so it goes from j to step(j). A scan that
// goes on for more than LOOK places finishes with a table of where a scan from each place stops, worked out once for the
// whole text from its end back, so markup stays quick however many marks are left unpaired. Kept with each text, as
// walk takes slices of it.
const LOOK = 64;
const step = (cs: Ch[], j: number) => j + (cs[j].ch === "\\" ? 2 : 1);
const tables = new WeakMap<Ch[], Map<string, Int32Array>>();
function table(cs: Ch[], key: string, stop: (j: number, after: Int32Array) => number) {
  let m = tables.get(cs);
  if (!m) tables.set(cs, (m = new Map()));
  let at = m.get(key);
  if (!at) {
    m.set(key, (at = new Int32Array(cs.length + 2).fill(-1)));
    for (let j = cs.length - 1; j >= 0; j--) at[j] = stop(j, at);
  }
  return at;
}
// The place of the brace that closes the one at i, or -1. In the table: the first unmatched "}" from each place.
function closing(cs: Ch[], i: number): number {
  let depth = 0, j = i + 1;
  for (let k = 0; j < cs.length; k++, j = step(cs, j)) {
    if (k === LOOK) {
      const braces = table(cs, "}", (q, at) => { const c = cs[q].ch, r = step(cs, q); return c === "}" ? q : c !== "{" ? at[r] : at[r] < 0 ? -1 : at[at[r] + 1]; });
      let at = braces[j];
      for (; at >= 0 && depth > 0; depth--) at = braces[at + 1];
      return at;
    }
    if (cs[j].ch === "{") depth++;
    else if (cs[j].ch === "}" && depth-- === 0) return j;
  }
  return -1;
}
// The place where the mark (*, ** or $) that opens at i closes on the same line, or -1. In the table: the first line
// break or place that could close the mark, from each place.
function pair(cs: Ch[], i: number, mark: string): number {
  const n = mark.length, star = mark[0] === "*", space = (j: number) => !cs[j] || /\s/.test(cs[j].ch);
  const alnum = (j: number) => !!cs[j] && /[\p{L}\p{N}]/u.test(cs[j].ch);
  // A star pair inside one word on both sides (a*b*c) stays as typed; one side is fine (*t*BuOK, 1*H*-indole).
  const inWord = star && alnum(i - 1);
  if (space(i + n) || (star && (cs[i + n].ch === "*" || !alnum(i + n)))) return -1;
  const closes = (j: number) => cs[j].ch === mark[0] && !(n === 2 && cs[j + 1].ch !== mark[1]) && !space(j - 1) && !(inWord && alnum(j + n)) &&
    !(n === 1 && star && (cs[j + 1]?.ch === "*" || cs[j - 1].ch === "*"));
  for (let j = i + n + 1, k = 0; j <= cs.length - n; k++, j = step(cs, j)) {
    if (k === LOOK) {
      const end = table(cs, mark + inWord, (q, at) => (q > cs.length - n ? -1 : cs[q].ch === "\n" || closes(q) ? q : at[step(cs, q)]))[j];
      return end >= 0 && cs[end].ch !== "\n" ? end : -1;
    }
    if (cs[j].ch === "\n") return -1;
    if (closes(j)) return j;
  }
  return -1;
}
// roman: math letters stay upright (\mathrm{…}).
function walk(cs: Ch[], math: boolean, roman: boolean, depth: number): Ch[] {
  if (depth > 16) return cs;
  const out: Ch[] = [];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i].ch;
    if (c === "\\") {
      const next = cs[i + 1]?.ch, name = word(cs, i + 1);
      if (next !== undefined && ESCAPED.includes(next)) { out.push(cs[i + 1]); i++; continue; }
      if (next === ",") { out.push({ ch: "\u2009", s: cs[i].s }); i++; continue; }
      if (name && has(COMMANDS, name) && cs[i + 1 + name.length]?.ch === "{") {
        const open = i + 1 + name.length, end = closing(cs, open);
        if (end > 0) { out.push(...over(walk(cs.slice(open + 1, end), math, roman || ROMAN.has(name), depth + 1), COMMANDS[name])); i = end; continue; }
      }
      if (name && has(SYMBOLS, name)) {
        out.push({ ch: SYMBOLS[name], s: cs[i].s });
        i += name.length;
        if (cs[i + 1]?.ch === "{" && cs[i + 2]?.ch === "}") i += 2; // \circ{} and \AA{}
        continue;
      }
    }
    if (!math && c === "*") {
      const n = cs[i + 1]?.ch === "*" ? 2 : 1, end = pair(cs, i, "*".repeat(n));
      if (end > 0) { out.push(...over(walk(cs.slice(i + n, end), false, false, depth + 1), n === 2 ? { bold: true } : { italic: true })); i = end + n - 1; continue; }
    }
    if (!math && c === "$" && cs[i + 1]?.ch !== "$") {
      const end = pair(cs, i, "$");
      if (end > 0) { out.push(...walk(cs.slice(i + 1, end), true, false, depth + 1)); i = end; continue; }
    }
    if (math && (c === "^" || c === "_") && i + 1 < cs.length) {
      const script: RunStyle = { script: c === "^" ? "super" : "sub" }, end = cs[i + 1].ch === "{" ? closing(cs, i + 1) : -1;
      if (end > 0) { out.push(...over(walk(cs.slice(i + 2, end), true, roman, depth + 1), script)); i = end; continue; }
      if (cs[i + 1].ch !== "{") {
        // One character, or one symbol (\circ).
        const name = cs[i + 1].ch === "\\" ? word(cs, i + 2) : undefined, one = cs.slice(i + 1, i + 2 + (name && has(SYMBOLS, name) ? name.length : 0));
        out.push(...over(walk(one, true, roman, depth + 1), script));
        i += one.length;
        continue;
      }
    }
    if (math && c === "{") {
      const end = closing(cs, i);
      if (end > 0) { out.push(...walk(cs.slice(i + 1, end), true, roman, depth + 1)); i = end; continue; }
    }
    out.push(math && !roman && /[A-Za-z]/.test(c) ? { ch: c, s: { ...cs[i].s, italic: true } } : cs[i]);
  }
  return out;
}
// A caption with its markup turned into rich text; undefined when it has none (or is a live property text).
export function markupCaption(c: Caption): Caption | undefined {
  if (c.property) return undefined;
  const runs = runsOf(c), next = markupRuns(runs);
  if (plainOf(next) === c.text && JSON.stringify(next) === JSON.stringify(normalise(runs))) return undefined;
  return { ...c, text: plainOf(next), runs: styled(next) ? next : undefined };
}

// Home's Experiments list (src-tauri/src/recent.rs keeps it): each drawing with experiment details, as it was last
// opened or saved, with the yield of its first reaction's first product (a fraction: 0.85 is 85%).
export type ExperimentEntry = { path: string; name: string; at: number; found: boolean; details: Details; yield?: number };
export type ExperimentSort = { by: "date" | "title"; down: boolean };
// The entries with every word of the search in their details or file name, sorted by Date (else by when the drawing
// was last saved) or by Title (else the file name).
export function experimentRows(list: ExperimentEntry[], search: string, sort: ExperimentSort): ExperimentEntry[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const text = (e: ExperimentEntry) => [e.name, ...FIELDS.map(([k]) => e.details[k] ?? "")].join("\n").toLowerCase();
  const key = (e: ExperimentEntry) => (sort.by === "title" ? e.details.title ?? e.name : dateKey(e.details.date ?? ""));
  const order = (a: ExperimentEntry, b: ExperimentEntry) => key(a).localeCompare(key(b), "en-GB", { numeric: true, sensitivity: "base" }) || a.at - b.at;
  return list.filter((e) => words.every((w) => text(e).includes(w))).sort((a, b) => (sort.down ? order(b, a) : order(a, b)));
}
// The list as CSV: a row of names, then a row for each experiment (its details, Yield in %, and the file). A value a
// spreadsheet would run as a formula starts with an apostrophe, as these come from files anyone can make; a minus with
// a number ("-78 °C") stays as it is.
export function experimentsCsv(list: ExperimentEntry[]): string {
  const cell = (v: string) => {
    const s = /^[=+@\t\r]/.test(v) || (v.startsWith("-") && !/^-[\d.]+[\s°%A-Za-zµ]*$/.test(v)) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [[...FIELDS.map(([, name]) => name), "Yield (%)", "File"], ...list.map((e) => [...FIELDS.map(([k]) => e.details[k] ?? ""), e.yield == null ? "" : (e.yield * 100).toFixed(1), e.path])];
  // A byte-order mark, so Excel reads it as UTF-8 (°C, µL, accents).
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
