// CDXML, ChemDraw's XML format: a drawing written as a file ChemDraw opens, and ChemDraw's files read back. Octet's
// .oct files are CDXML inside (decision 0004). Format facts come from Octet's clean-room spec of the document layer;
// "spec 9.2" below means its section 9.2.
// Units: Octet stores bond lengths with y up and its page centred on 0,0. CDXML stores points with y down from the
// top left of the page's printable area. The style's bond length (pt) converts between them.
// Octet-only data that CDXML cannot hold goes in an "Octet" attribute holding JSON, a name ChemDraw drops (spec 22).
// Objects written only so ChemDraw can show something Octet draws itself (a table's lines, a cycle's arrows) carry
// Octet='{"d":1}', and Octet skips them when it reads its own file back.

import { charsetCode, isSymbolFont, symbolText } from "./charset.ts";
import { FONTS, PAGES, fontName, pageSize, readGuides, readStyle, type DocStyle } from "./docstyle.ts";
import {
  HBOND, HIGHLIGHT, orderOf, QUADRUPLE, ringCircleRadius, SHADE, TLC_FRONT, TLC_ORIGIN, bendPoint, circledRings, curved, headsOf, hydrogens, isBracket, linesOf, markAt, scaleOf, settleShape, shapeBounds, straightArrow, tableLayout, takesHeads, shapesHeads, tlcLayout, turnPoint, TABLE_PAD,
  ORBITAL_SHAPES, PHASES, ALL_ARROW_KINDS, placedAt, headSize, headOfLength, ellipsePoints, sizedHead, turns, ASCENT, DESCENT, GAP_ARROW_PT, LINE, isNumber, lineOffsets, signBonds, signSpot, type HeadSize,
  type Annotation, type Arrow, type ArrowKind, type Kept, type Atom, type AtomQuery, type Bond, type Polymer, type Box, type Caption, type CurveFill, type CurvePoint, type Display, type Grid, type Group, type Head, type HeadShape, type RingFill,
  type Ink, type LineStyle, type Mol, type OrbitalShape, type Phase, type Shape, type ShapeKind, type Spot, type Table, type TableLine, type Tlc,
} from "./render.ts";
import { ELEMENTS, anchorElement, chemicalText, formulaCaption, formulaRuns, formulaTextRuns, isElement, pieces, units } from "./labels.ts";
import { labelStyle, normalise, plainOf, runsOf, styleOf, styled, type RunStyle, type TextRun } from "./richtext.ts";
import { findReaction } from "./reaction.ts";
import { readGrid } from "./stoich.ts";
import { fragments, groupParents, oldLigands, renumberCentre, tidyGroups } from "./edit.ts";
import { altGroup, elementList, enclosed, linkNode, polymerLabel, queryLabel, readPolymer, readRgroup, rgroupMembers, rNumber, USAGES, USAGE_KINDS } from "./query.ts";
import { ligandEllipse } from "./render.ts";
import { kekulise, rings } from "./rings.ts";
import { keptHolds, stereoMarks } from "./cip.ts";
import { keepAngles, mapBranches, migrateCycles, readBranches, readSteps as readCycleSteps, type Cycle, type CycleText } from "./cycle.ts";
import { readPart, readPlot, type Plot } from "./pageplot.ts";
import { ASSIGN, OWN_TAG, assignGroups, assignRanges, assignValue, fromSpectrumObject, keyOf, nextGroupId, spectrumObject, type Measured } from "./measured.ts";
import pkg from "../package.json" with { type: "json" };
import { advance, widthOf } from "./arial.ts";

export const TOO_BIG = "This file is too large to open.";
export const NOT_CDXML = "This file is not a ChemDraw drawing.";
export const DAMAGED = "This ChemDraw file is damaged.";

// ---------------------------------------------------------------------------------------------------------------
// XML. A small strict reader: elements, attributes, text, comments, CDATA, the declaration and a DOCTYPE (skipped).
// No entity is defined or expanded; an unknown named entity is dropped, as ChemDraw drops it (spec 1.1).

export type Xml = { name: string; attrs: Record<string, string>; kids: Xml[]; text: string };
const MAX_CHARS = 64 * 1024 * 1024, MAX_DEPTH = 64, MAX_ELEMENTS = 1_000_000, MAX_ATTRS = 512;
const ENTITY: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const NAME = /[A-Za-z_:][\w.:-]*/y, SPACE = /\s*/y;

// Character and entity references in text or an attribute value. A bare & or a bad character number fails.
function decode(s: string): string {
  if (s.indexOf("&") < 0) return s;
  const out = s.replace(/&(?:#x([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z_][\w.-]{0,63}));/g, (_, hex, dec, name) => {
    if (name) return ENTITY[name] ?? "";
    const c = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    const ok = c === 9 || c === 10 || c === 13 || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || (c >= 0x10000 && c <= 0x10ffff);
    if (!ok) throw new Error(DAMAGED);
    return String.fromCodePoint(c);
  });
  // An & that started no reference is not XML.
  if (/&(?!(?:#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z_][\w.-]{0,63});)/.test(s)) throw new Error(DAMAGED);
  return out;
}

// The document's root element. Throws DAMAGED (or TOO_BIG) on anything that is not well-formed or is too big.
export function parseXml(src: string): Xml {
  if (src.length > MAX_CHARS) throw new Error(TOO_BIG);
  const fail = (): never => { throw new Error(DAMAGED); };
  const top: Xml = { name: "", attrs: Object.create(null), kids: [], text: "" }, stack = [top];
  let i = src.charCodeAt(0) === 0xfeff ? 1 : 0, elements = 0;
  const text = (t: string) => {
    if (stack.length === 1) { if (/\S/.test(t)) fail(); return; }
    stack[stack.length - 1].text += t;
  };
  const name = () => { NAME.lastIndex = i; const m = NAME.exec(src); if (!m) fail(); i += m![0].length; return m![0]; };
  const space = () => { SPACE.lastIndex = i; SPACE.exec(src); i = SPACE.lastIndex; };
  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) { text(decode(src.slice(i).replace(/\r\n?/g, "\n"))); break; }
    if (lt > i) text(decode(src.slice(i, lt).replace(/\r\n?/g, "\n")));
    i = lt;
    const skip = (open: string, close: string) => { const e = src.indexOf(close, i + open.length); if (e < 0) fail(); const inner = src.slice(i + open.length, e); i = e + close.length; return inner; };
    if (src.startsWith("<!--", i)) { skip("<!--", "-->"); continue; }
    if (src.startsWith("<![CDATA[", i)) { text(skip("<![CDATA[", "]]>").replace(/\r\n?/g, "\n")); continue; }
    if (src.startsWith("<?", i)) { skip("<?", "?>"); continue; }
    if (src.startsWith("<!DOCTYPE", i)) {
      // Skipped whole, internal subset included; its declarations are never used.
      if (stack.length > 1 || top.kids.length) fail();
      const sub = src.indexOf("[", i), end = src.indexOf(">", i);
      if (end < 0) fail();
      if (sub >= 0 && sub < end) { const close = /\]\s*>/g; close.lastIndex = sub; if (!close.exec(src)) fail(); i = close.lastIndex; } else i = end + 1;
      continue;
    }
    if (src[i + 1] === "/") {
      i += 2;
      const n = name();
      space();
      if (src[i] !== ">" || stack.length < 2 || stack[stack.length - 1].name !== n) fail();
      i++;
      stack.pop();
      continue;
    }
    i++;
    const el: Xml = { name: name(), attrs: Object.create(null), kids: [], text: "" };
    if (++elements > MAX_ELEMENTS || stack.length > MAX_DEPTH || (stack.length === 1 && top.kids.length)) fail();
    let count = 0;
    for (;;) {
      const at = i;
      space();
      if (src.startsWith("/>", i)) { i += 2; stack[stack.length - 1].kids.push(el); break; }
      if (src[i] === ">") { i++; stack[stack.length - 1].kids.push(el); stack.push(el); break; }
      if (i === at || ++count > MAX_ATTRS) fail();
      const key = name();
      space();
      if (src[i] !== "=") fail();
      i++;
      space();
      const q = src[i];
      if (q !== '"' && q !== "'") fail();
      const e = src.indexOf(q, i + 1);
      if (e < 0) fail();
      const raw = src.slice(i + 1, e);
      if (raw.includes("<") || key in el.attrs) fail();
      el.attrs[key] = decode(raw.replace(/\r\n|[\r\n\t]/g, " "));
      i = e + 1;
    }
  }
  if (stack.length !== 1 || top.kids.length !== 1) fail();
  return top.kids[0];
}

// Text for XML: control characters and lone surrogates dropped, the five special characters escaped. In an
// attribute, line breaks and tabs are escaped too so they survive the reader's whitespace rule.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");
const SPECIAL: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;", "\n": "&#10;", "\t": "&#9;", "\r": "&#13;" };
const escText = (s: string) => clean(s).replace(/\r/g, "").replace(/[&<>"']/g, (c) => SPECIAL[c]);
const escAttr = (s: string) => clean(s).replace(/[&<>"'\n\t\r]/g, (c) => SPECIAL[c]);

// An element as ChemDraw writes it: one attribute per line, children straight after the start tag. Attributes
// with undefined values are left out.
function el(name: string, attrs: Record<string, string | number | undefined>, inner = ""): string {
  let s = `<${name}`;
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) s += `\n ${k}="${escAttr(String(v))}"`;
  return inner ? `${s}\n>${inner}</${name}>` : `${s}\n/>`;
}
// Annotations as ChemDraw writes them, after everything else in their page or group.
const notes = (list?: Annotation[]) => (list ?? []).map((a) => el("annotation", { Keyword: a.keyword, Content: a.content })).join("");
// The limits on annotations, in reading CDXML and Octet's own files.
export const MAX_ANNOTATIONS = 1000, MAX_KEYWORD = 200, MAX_CONTENT = 10_000;

// ---------------------------------------------------------------------------------------------------------------
// Numbers, written the way ChemDraw writes them so files diff cleanly against its own (spec 1.2).

// Lengths and coordinates: 2 decimals, both dropped only when both are zero ("30", "14.40", "0.60").
export function fmt(n: number): string {
  const s = n.toFixed(2);
  return s === "-0.00" ? "0" : s.endsWith(".00") ? s.slice(0, -3) : s;
}
// Colour components: 4 decimals, but 0 and 1 bare.
export const fmtColour = (v: number) => (v <= 0 ? "0" : v >= 1 ? "1" : v.toFixed(4));
// Angles: 1 decimal, dropped when zero ("-120", "44.6").
export function fmtAngle(n: number): string {
  const s = n.toFixed(1);
  return s === "-0.0" ? "0" : s.endsWith(".0") ? s.slice(0, -2) : s;
}
// Text sizes: the shortest form ("7.5", "9.65", "10").
export const fmtSize = (n: number) => String(+n.toFixed(2));

// ---------------------------------------------------------------------------------------------------------------
// Names and tables shared by the writer and the reader.


type P = [number, number];
const SYMBOLS = [...ELEMENTS]; // in atomic-number order, then D and T
// Colour index 0 is black and 1 white; the table's first row is index 2. ChemDraw starts every table with these.
const BASE_COLOURS = ["#FFFFFF", "#000000", "#FF0000", "#FFFF00", "#00FF00", "#00FFFF", "#0000FF", "#FF00FF"];
const RADICALS = ["None", "Singlet", "Doublet", "Triplet"];
const HEADS: Record<Head, string | undefined> = { none: undefined, full: "Full", left: "HalfLeft", right: "HalfRight" };
const HEAD_SHAPES: Record<HeadShape, string> = { solid: "Solid", hollow: "Hollow", angled: "Angle" };
const H_FIRST = new Set(["O", "F", "S", "Cl", "Se", "Br", "Te", "I"]); // H2O, HCl drawn with the H first (as render.ts)
// Orbitals: ChemDraw's OrbitalType names and the Octet shape and phase each reads as (spec 9.8).
const ORBITALS: [string, OrbitalShape, Phase][] = [
  ["s", "s", "plain"], ["oval", "oval", "plain"], ["lobe", "lobe", "plain"], ["p", "p", "plain"],
  ["sShaded", "s", "shaded"], ["ovalShaded", "oval", "shaded"], ["lobeShaded", "lobe", "shaded"], ["pShaded", "p", "shaded"],
  ["sFilled", "s", "filled"], ["ovalFilled", "oval", "filled"], ["lobeFilled", "lobe", "filled"], ["pFilled", "p", "filled"],
  ["hybridPlus", "hybrid", "phased"], ["hybridMinus", "hybrid", "phased"], ["hybridPlusFilled", "hybrid", "filled"], ["hybridMinusFilled", "hybrid", "filled"],
  ["dz2Plus", "dz2", "phased"], ["dz2Minus", "dz2", "phased"], ["dz2PlusFilled", "dz2", "filled"], ["dz2MinusFilled", "dz2", "filled"],
  ["dxy", "d", "phased"], ["dxyFilled", "d", "filled"],
];
const BRACKETS: Record<string, ShapeKind> = { Square: "brackets", Round: "parens", Curly: "braces", SquarePair: "brackets", RoundPair: "parens", CurlyPair: "braces" };
// Query properties' CDXML names (spec 13.10 and the tag table), by Octet's value.
const RING_COUNTS: Record<string, string> = { none: "NoRingBonds", drawn: "AsDrawn", simple: "SimpleRing", fusion: "Fusion", spiro: "SpiroOrHigher" };
const ABUNDANCES: Record<string, string> = { any: "Any", natural: "Natural", enriched: "Enriched", deficient: "Deficient", nonnatural: "Nonnatural" };
const RXN: Record<string, string> = { centre: "ReactionCenter", makebreak: "MakeOrBreak", change: "ChangeType", makechange: "MakeAndChange", not: "NotReactionCenter", nochange: "NoChange", unmapped: "Unmapped" };
const BOND_QUERY: Record<string, string> = { any: "any", sd: "1 2", sa: "1 1.5", da: "2 1.5" };
const TOPOLOGY: Record<string, string> = { ring: "Ring", chain: "Chain", either: "RingOrChain" };
const back = (table: Record<string, string>, v?: string) => Object.keys(table).find((k) => table[k] === v);
// An element symbol's atomic number (D and T are hydrogen).
const atomicNumber = (el: string) => (el === "D" || el === "T" ? 1 : SYMBOLS.indexOf(el) + 1);
const SYMBOL_TEXT: Record<string, string> = { Plus: "+", Minus: "−", CirclePlus: "⊕", CircleMinus: "⊖", Dagger: "†", DoubleDagger: "‡", Racemic: "Rac", Absolute: "Abs", Relative: "Rel" };

// Arial's ink, left and right (1/1000 em from the start of the advance), from the font's glyph boxes.
const INK: Record<string, [number, number]> = {
  A: [-1, 668], B: [73, 614], C: [50, 683], D: [77, 669], E: [79, 613], F: [82, 565], G: [53, 715], H: [80, 642], I: [93, 188], J: [27, 422], K: [73, 665], L: [73, 521], M: [74, 757],
  N: [76, 640], O: [48, 733], P: [77, 624], Q: [43, 741], R: [79, 709], S: [45, 615], T: [23, 591], U: [79, 642], V: [4, 659], W: [12, 933], X: [4, 661], Y: [3, 659], Z: [20, 586],
  a: [36, 514], b: [65, 515], c: [39, 491], d: [34, 484], e: [37, 515], f: [9, 313], g: [32, 489], h: [66, 488], i: [66, 154], j: [-46, 153], k: [66, 496], l: [64, 152], m: [66, 769],
  n: [66, 487], o: [33, 519], p: [66, 516], q: [35, 484], r: [65, 347], s: [31, 461], t: [18, 271], u: [64, 484], v: [13, 488], w: [3, 714], x: [7, 493], y: [16, 491], z: [20, 479],
  "0": [42, 508], "1": [109, 373], "2": [29, 503], "3": [42, 511], "4": [13, 508], "5": [42, 516], "6": [38, 510], "7": [47, 511], "8": [41, 512], "9": [42, 512],
  "+": [56, 528], "-": [32, 302], "−": [56, 528], "–": [-2, 554], "(": [61, 297], ")": [61, 297], "[": [68, 262], "]": [19, 213], ".": [91, 191], ",": [83, 189], "'": [44, 144], "*": [31, 354],
};
// A glyph's advance and ink left and right in Arial (1/1000 em). Checks build Arial-like glyphs from it.
export const arialGlyph = (ch: string): [number, number, number] => [advance(ch, 1000), ...(INK[ch] ?? [0, advance(ch, 1000)])];
// Text in Arial at size px, measured from these tables as render() takes it: its advance, and each glyph's ink as a box
// (capitals at the cap height, short letters at the x-height, a tail below the baseline). The same on any computer.
// Each text is measured once.
export const arialInk = (size: number) => {
  const known = new Map<string, Ink>();
  return (text: string): Ink => known.get(text) ?? known.set(text, arialText(text, size)).get(text)!;
};
function arialText(text: string, size: number): Ink {
  const outline: [number, number][] = [];
  let x = 0, top = 0;
  for (const ch of text) {
    const [w, l, r] = arialGlyph(ch).map((v) => (v * size) / 1000), hi = (/[acemnorsuvwxz]/.test(ch) ? 0.519 : 0.716) * size, lo = /[gjpqy]/.test(ch) ? -0.21 * size : 0;
    outline.push([x + l, -lo], [x + r, -lo], [x + r, -hi], [x + l, -hi]);
    x += w; top = Math.max(top, hi);
  }
  return { width: x, ascent: top, outline };
}

// The kind an arrow reads as from what CDXML stores: its heads, head shape, shaft spacing, no-go mark and whether it
// is an arc. The writer keeps a kind this does not give back in Octet's own data.
type Stored = { arc: boolean; head?: string; tail?: string; type?: string; spacing: boolean; nogo?: string; dipole?: boolean };
function kindOf(s: Stored): ArrowKind {
  if (s.nogo === "Hash") return "hash";
  if (s.nogo) return "nogo";
  if (s.dipole && !s.arc) return "dipole";
  // An equilibrium's half heads may be hollow or open, so it goes before the block and retrosynthetic arrows.
  if (s.head === "HalfLeft" && s.tail === "HalfLeft" && s.spacing) return "equilibrium"; // straight, or ChemDraw's curved one
  if (s.type === "Hollow" && s.spacing && !s.arc) return "block";
  if (s.arc) return s.head?.startsWith("Half") && !s.tail ? "fishhook" : s.head === "Full" && s.tail === "Full" ? "double" : !s.head && !s.tail ? "arc" : "curved";
  if (s.type === "Angle" && s.spacing) return "retro";
  return s.head === "Full" && s.tail === "Full" ? "resonance" : !s.head && !s.tail ? "line" : "reaction";
}
const headOf = (name?: string): Head => (name === "Full" ? "full" : name === "HalfLeft" ? "left" : name === "HalfRight" ? "right" : "none");
// A head read from a file, as the palette size it is to within CDXML's hundredths (19.69 is Large's 19.6875).
function paletteHead(a: Pick<Arrow, "kind" | "style">, h: HeadSize): HeadSize {
  const near = (["large", "medium", "small"] as const).map((k) => sizedHead(a, k)).find((o) => Math.abs(o.length - h.length) < 0.006 && Math.abs(o.centre - h.centre) < 0.006 && Math.abs(o.width - h.width) < 0.006);
  return near ?? h;
}

// Octet's page centred on 0,0, as CDXML's printable area: the paper less 36 pt margins all round (spec 6).
function printable(style: Pick<DocStyle, "page" | "custom" | "landscape">): [number, number] {
  const [w, h] = pageSize(style);
  return [(w * 72) / 25.4 - 72, (h * 72) / 25.4 - 72];
}
// The middle of a page side, on the 0.01 pt grid so Octet's 0,0 is written exactly.
const middle = (side: number) => Math.round(side * 50) / 100;
const hex = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();

// ---------------------------------------------------------------------------------------------------------------
// Writing.

export type CdxmlOptions = {
  selection?: { atoms: Iterable<number>; items: Iterable<number> }; // only these atoms (and the bonds between them) and objects
  derived?: Arrow[]; // arrows Octet draws from other objects (a catalytic cycle's), written so ChemDraw shows them too
  expand?: (text: string) => Mol | undefined; // a written label's atoms (atom 0 attaches), for ChemDraw's abbreviation
  name?: string; // the document's name
  // Several drawings written into one document, one after another (a template file's panes): ids from firstId up, and
  // one colour and font table that each drawing adds its own to (the last one written has them all).
  firstId?: number;
  tables?: { colours: string[]; fonts: string[] };
};
// The one version is package.json's (REL-9).
const PROGRAM = `Octet ${pkg.version}`;
// The font table's charset, as ChemDraw writes it on each system: iso-8859-1 on Windows, x-mac-roman on the Mac.
// Linux has no ChemDraw and writes Windows's. CDXML's text is Unicode either way. The CDX's legacy copy of the text
// is in its font's charset (cdx.ts), so a CDX made here is as ChemDraw makes one on the same system.
export const fontCharset = (platform: string) => (/^(Win|Linux)/.test(platform) ? "iso-8859-1" : "x-mac-roman");
const CHARSET = fontCharset(typeof navigator === "undefined" ? "" : navigator.platform ?? "");
const DERIVED = '{"d":1}';
const num6 = (v: number) => String(+v.toFixed(6));
// A TLC spot's CurveType, as ChemDraw writes it: Filled 128 (a shaded spot is filled for ChemDraw, and 256 for Octet),
// Dashed 2, Bold 4, Doubled 512. A hollow or dashed spot has no fill.
export const spotType = (x: Spot) => (x.style === "hollow" || x.dashed ? 0 : 128) | (x.style === "shaded" ? 256 : 0) | (x.dashed ? 2 : 0) | (x.bold ? 4 : 0) | (x.doubled ? 512 : 0);
const union = (boxes: Box[]): Box | undefined => (boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined);
const boxOf = (qs: P[], pad = 0): Box => [Math.min(...qs.map((q) => q[0])) - pad, Math.min(...qs.map((q) => q[1])) - pad, Math.max(...qs.map((q) => q[0])) + pad, Math.max(...qs.map((q) => q[1])) + pad];
// A text's box turned anticlockwise by degrees about its p (page points, y down): the box round it.
function turnedBox(b: Box, p: P, degrees = 0): Box {
  const r = (degrees * Math.PI) / 180;
  return r ? boxOf(([[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]] as P[]).map(([qx, qy]) => [p[0] + (qx - p[0]) * Math.cos(r) + (qy - p[1]) * Math.sin(r), p[1] - (qx - p[0]) * Math.sin(r) + (qy - p[1]) * Math.cos(r)] as P)) : b;
}
// A text's RotationAngle: degrees clockwise on the page, times 65536; Octet's turns are anticlockwise.
const rotationAngle = (degrees?: number) => (degrees ? Math.round((((-degrees % 360) + 360) % 360) * 65536) || undefined : undefined);
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (a: P) => Math.hypot(a[0], a[1]);
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
// The circle through three points, or undefined when they are in a line.
function circle(S: P, M: P, T: P): { O: P; r: number } | undefined {
  const d = 2 * (S[0] * (M[1] - T[1]) + M[0] * (T[1] - S[1]) + T[0] * (S[1] - M[1]));
  if (Math.abs(d) < 1e-9) return undefined;
  const sq = (q: P) => q[0] * q[0] + q[1] * q[1];
  const O: P = [(sq(S) * (M[1] - T[1]) + sq(M) * (T[1] - S[1]) + sq(T) * (S[1] - M[1])) / d, (sq(S) * (T[0] - M[0]) + sq(M) * (S[0] - T[0]) + sq(T) * (M[0] - S[0])) / d];
  return { O, r: len(sub(S, O)) };
}
const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

// The drawing (or the part selected) as a CDXML document ChemDraw 22 to 26 opens.
export function toCdxml(input: Mol, style: DocStyle, opts: CdxmlOptions = {}): string {
  const mol = opts.selection ? pick(input, opts.selection) : input;
  // The page's size as written, so the reader finds the same centre.
  const B = style.bond, line = style.line, [W, H] = printable(style).map((v) => Number(fmt(v))), [cx, cy] = [middle(W), middle(H)];
  const at = (q: readonly number[]): P => [cx + q[0] * B, cy - q[1] * B];
  const pt = (q: P) => `${fmt(q[0])} ${fmt(q[1])}`, pt3 = (q: P, z = 0) => `${pt(q)} ${fmt(z)}`;
  const boxText = (b: Box) => `${fmt(b[0])} ${fmt(b[1])} ${fmt(b[2])} ${fmt(b[3])}`;
  const colours = opts.tables?.colours ?? [...BASE_COLOURS];
  if (!colours.length) colours.push(...BASE_COLOURS);
  const colour = (c?: string) => {
    if (!c) return undefined;
    const u = c.toUpperCase();
    return u === "#000000" ? 0 : u === "#FFFFFF" ? 1 : (colours.includes(u) ? colours.indexOf(u) : colours.push(u) - 1) + 2;
  };
  const fonts = opts.tables?.fonts ?? [];
  const font = (name: string) => (fonts.includes(name) ? fonts.indexOf(name) : fonts.push(name) - 1) + 1;
  font(style.labelFont);
  font(style.captionFont);
  const priv = (o: Record<string, unknown>) => {
    const kept = Object.entries(o).filter(([, v]) => v !== undefined);
    return kept.length ? JSON.stringify(Object.fromEntries(kept)) : undefined;
  };
  // An object at a scale other than 1 carries its own drawing settings, so ChemDraw draws it as Octet does
  // (decision 0007): a graphic its line and bold widths, a bond also its length, hash spacing and margin.
  // An object's own lines: its line width (its own, or the document's) and bold width times its scale, when either is
  // its own.
  const ownLines = (f: number, w?: number) => (f === 1 && w === undefined ? {} : { LineWidth: fmt((w ?? line) * f), ...(f === 1 ? {} : { BoldWidth: fmt(style.bold * f) }) });
  const ownBond = (f: number) => (f === 1 ? {} : { BondLength: fmt(B * f), ...ownLines(f), HashSpacing: fmt(style.hash * f), MarginWidth: fmt(style.margin * f) });
  const ownScale = (x: { scale?: number }) => (x.scale && x.scale !== 1 ? x.scale : undefined);
  // A reaction arrow's stoichiometry grid, kept in Octet's own data on the arrow (ChemDraw's grid is not in CDXML).
  const gridOf = (arrow: number) => { const g = mol.grids?.find((x) => x.arrow === arrow); return g && { typed: g.typed, limiting: g.limiting, hidden: g.hidden, colour: g.colour, layout: g.layout }; };

  // Ids: Octet's own object ids where they are sound, everything else from one counter above them (spec 2).
  const own = [...(mol.captions ?? []), ...(mol.arrows ?? []), ...(mol.shapes ?? []), ...(mol.cycles ?? []), ...(mol.groups ?? [])].map((x) => x.id);
  const sound = own.every((id) => Number.isInteger(id) && id > 0 && id < 2 ** 30) && new Set(own).size === own.length;
  const base = Math.max(0, (opts.firstId ?? 1) - 1);
  let next = base + (sound ? own.reduce((m, id) => Math.max(m, id), 0) + 1 : 1);
  const fresh = () => next++;
  const idOf = new Map<number, number>(own.map((id) => [id, sound ? base + id : fresh()]));
  // Measured spectra, as ChemDraw's spectrum objects, and each multiplet an atom or bond is linked to as an assignment
  // tag on it and on the spectrum (decision 0016). A selection copied takes no spectrum (pick leaves them out).
  const spectra = mol.spectra ?? [], rangeOf = new Map(spectra.flatMap((s) => s.groups.map((g) => [g.id, assignValue(s, g)] as const)));
  const assignTag = (id: number) => el("objecttag", { id: fresh(), TagType: "String", Name: ASSIGN, Value: rangeOf.get(id) });
  const assignTags = (peaks?: number[]) => [...new Set(peaks ?? [])].filter((k) => rangeOf.has(k)).map(assignTag).join("");
  // R-group definitions (ChemDraw's alternative groups): the id an R label names its definition by.
  const altIds = new Map((mol.shapes ?? []).filter((sh) => sh.rgroup).map((sh) => [sh.rgroup!.name, idOf.get(sh.id)!]));
  // Polymer brackets: each pair's bracket graphics (left, right), for its bracketed group.
  const polymerIds: { sh: Shape; ids: number[] }[] = [], altZ = new Map<number, number>();
  // Z: one drawing order for the page (spec 7.1), back to front as Octet draws: fills, orbitals, structures, arrows, text.
  // Things with a draw order (order.ts) each take a band of their own, under or over all of that, in their order.
  const orders = [...new Set([...mol.atoms, ...(mol.captions ?? []), ...(mol.arrows ?? []), ...(mol.shapes ?? []), ...(mol.cycles ?? [])].flatMap((x) => (x.order ? [x.order] : [])))].sort((p, q) => p - q);
  const band = Math.floor(16000 / Math.max(1, orders.length)), back = orders.filter((o) => o < 0).length, filled = new Map<number, number>();
  const starts = new Map(orders.map((o, k) => [o, 1 + k * band + (o > 0 ? 16384 : 0)]));
  let z = back * band, zOrder: number | undefined; // zOrder: the order of the thing being written
  const Z = () => {
    if (!zOrder) return z < back * band + 16384 ? ++z : z;
    const n = filled.get(zOrder) ?? 0;
    filled.set(zOrder, Math.min(n + 1, band - 1));
    return starts.get(zOrder)! + n;
  };

  // Everything on the page, with its type rank (ChemDraw writes children grouped by type, spec 7.2) and its group.
  type Out = { xml: string; rank: number; group?: number; box: Box };
  const outs: Out[] = [];
  // Groups nest: each object goes in the smallest group that holds it, inner groups first. Text that belongs to a
  // structure, arrow or cycle goes in the group of what it belongs to, so ChemDraw moves them together.
  const groups = mol.groups ?? [], parentOf = groupParents(groups);
  const innerFirst = groups.map((_, k) => k).sort((p, q) => groups[p].atoms.length + groups[p].items.length - groups[q].atoms.length - groups[q].items.length || q - p);
  const groupOfItem = new Map<number, number>(), groupOfAtom = new Map<number, number>();
  for (const g of innerFirst.map((k) => groups[k])) {
    for (const id of g.items) if (!groupOfItem.has(id)) groupOfItem.set(id, g.id);
    for (const i of g.atoms) if (!groupOfAtom.has(i)) groupOfAtom.set(i, g.id);
  }
  for (const c of mol.captions ?? []) {
    const host = groupOfItem.get(c.id) ?? (c.under?.length ? groupOfAtom.get(c.under[0]) : c.on ? groupOfItem.get(c.on.arrow) : c.cycle && groupOfItem.get(c.cycle.cycle));
    if (host !== undefined) groupOfItem.set(c.id, host);
  }
  const put = (xml: string, rank: number, box: Box, item?: number) => outs.push({ xml, rank, box, group: item === undefined ? undefined : groupOfItem.get(item) });
  const run = (text: string, s: { font: string; size: number; colour?: string; face: number }) => {
    const c = colour(s.colour);
    return `<s font="${font(s.font)}" size="${fmtSize(s.size)}"${c !== undefined ? ` color="${c}"` : ""}${s.face ? ` face="${s.face}"` : ""}>${escText(text)}</s>`;
  };
  const face = (s: RunStyle) => (s.bold ? 1 : 0) | (s.italic ? 2 : 0) | (s.underline ? 4 : 0) | (s.script === "sub" ? 0x20 : s.script === "super" ? 0x40 : 0);
  // A written label's text from place at, split where its characters' own bold, italic and underline change (its runs,
  // as ChemDraw's label <s> runs), each run with the label's face besides.
  const labelText = (a: Atom, text: string, at: number, s: { font: string; size: number; colour?: string; face: number }) => {
    const per = a.text && a.runs && plainOf(a.runs) === a.text ? a.runs.flatMap((r) => r.text.split("").map(() => r)) : undefined;
    if (!per) return run(text, s);
    let out = "";
    for (let k = 0, e = 1; k < text.length; k = e, e = k + 1) {
      while (e < text.length && per[at + e] === per[at + k]) e++;
      // A character in superscript or subscript (issue 44) is that, in place of Formula.
      const own = per[at + k] ?? {};
      out += run(text.slice(k, e), { ...s, face: (own.script ? s.face & ~0x60 : s.face) | face(own) });
    }
    return out;
  };
  // A caption-styled text object written for ChemDraw only (a bracket's mark, a partial charge, a table cell).
  const note = (text: string, p: P, size: number, align: "left" | "centre" | "right", c?: string, item?: number) => {
    const w = widthOf(text, size), left = align === "left" ? p[0] : align === "right" ? p[0] - w : p[0] - w / 2, just = align === "centre" ? "Center" : align === "right" ? "Right" : undefined;
    put(el("t", { id: fresh(), p: pt(p), BoundingBox: boxText([left, p[1] - 0.716 * size, left + w, p[1]]), Z: Z(), color: colour(c), CaptionJustification: just, Justification: just, LineHeight: "auto", Octet: DERIVED },
      run(text, { font: style.captionFont, size, colour: c, face: 0 })), 2, [left, p[1] - size, left + w, p[1]], item);
  };

  // Shapes: boxes and ovals as graphics with their 3D frame (spec 9.2), turned as drawn, brackets as one graphic a
  // side, TLC plates, and tables as a group of lines and text that ChemDraw shows, with the table itself in Octet's
  // data. A line width set on the shape is its LineWidth. Faded, which CDXML cannot name, goes as Shaded and in Octet's
  // data; a bold outline is the Bold line type.
  for (const sh of mol.shapes ?? []) {
    zOrder = sh.order;
    if (sh.rgroup) { altZ.set(sh.id, Z()); continue; } // written round its structures, after them, in its place in the drawing order
    const id = idOf.get(sh.id)!, [x0, y0] = at([Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[1], sh.to[1])]), [x1, y1] = at([Math.max(sh.from[0], sh.to[0]), Math.min(sh.from[1], sh.to[1])]);
    const up: Box = [x0, y0, x1, y1], c: P = [(x0 + x1) / 2, (y0 + y1) / 2], hw = (x1 - x0) / 2, hh = (y1 - y0) / 2;
    // Points of the upright shape (page coordinates) where the turned shape has them, and the box round it as drawn.
    const middle: P = [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2], turned = (q: P): P => (sh.angle ? at(turnPoint(q, middle, sh.angle)) : at(q));
    const drawn = shapeBounds(sh), box: Box = sh.angle ? [...at([drawn[0], drawn[3]]), ...at([drawn[2], drawn[1]])] as Box : up;
    const page = (q: P): P => [middle[0] + (q[0] - c[0]) / B, middle[1] - (q[1] - c[1]) / B];
    const frame = { Center3D: pt3(c), MajorAxisEnd3D: pt3(turned(page([c[0] + hw, c[1]]))), MinorAxisEnd3D: pt3(turned(page([c[0], c[1] + hh]))) };
    const ink = colour(sh.kind === "highlight" ? sh.colour ?? HIGHLIGHT : sh.colour), f = scaleOf(sh), mine = ownLines(f, sh.width), faded = sh.fill === "faded" ? "faded" : undefined;
    // ChemDraw keeps a corner's radius and a shadow's depth in hundredths of the shape's line width.
    const lw = "LineWidth" in mine ? Number(mine.LineWidth) : line, per = (v: number) => Math.round((v * B * f * 100) / lw), shadow = sh.shadow ? per((sh.shade ?? SHADE).depth) : undefined;
    if (sh.kind === "box" || sh.kind === "rounded" || sh.kind === "highlight") {
      const bits = [sh.kind === "rounded" && "RoundEdge", sh.shadow && "Shadow", (sh.fill === "shaded" || sh.fill === "faded") && "Shaded", (sh.fill === "solid" || sh.kind === "highlight") && "Filled", sh.dashed && "Dashed", sh.boldLine && "Bold"].filter(Boolean);
      put(el("graphic", { id, BoundingBox: `${fmt(box[2])} ${fmt(box[3])} ${fmt(box[0])} ${fmt(box[1])}`, Z: Z(), color: ink, GraphicType: "Rectangle", RectangleType: bits.join(" ") || "Plain",
        CornerRadius: sh.kind === "rounded" ? per(sh.radius ?? 0.3) : undefined, ShadowSize: shadow, ...frame, ...mine, Octet: priv({ kind: sh.kind === "highlight" ? "highlight" : undefined, shade: sh.shade, angle: sh.angle, scale: ownScale(sh), fill: faded }) }), 3, box, sh.id);
    } else if (sh.kind === "oval") {
      const bits = [Math.abs(hw - hh) < 0.01 && "Circle", (sh.fill === "shaded" || sh.fill === "faded") && "Shaded", sh.fill === "solid" && "Filled", sh.dashed && "Dashed", sh.boldLine && "Bold", sh.shadow && "Shadowed"].filter(Boolean);
      put(el("graphic", { id, BoundingBox: `${pt(turned(page([c[0] + hw, c[1]])))} ${pt(c)}`, Z: Z(), color: ink, GraphicType: "Oval", OvalType: bits.join(" "), ShadowSize: shadow, ...frame, ...mine, Octet: priv({ shade: sh.shade, angle: sh.angle, scale: ownScale(sh), fill: faded }) }), 3, box, sh.id);
    } else if (isBracket(sh)) {
      // Each bracket runs so its lips point inward: the left one upward, the right one downward (spec 9.9), turned
      // with the shape.
      const sides = sh.side ? [sh.side] : ["left", "right"], ids: number[] = [];
      // A polymer bracket pair's meaning goes on its right bracket (ChemDraw reads it from the bracket graphic): the
      // usage, repeat pattern and flip type, and its labels as object tags, which ChemDraw places itself.
      const p = sh.side ? undefined : sh.polymer;
      const tag = (name: string, text: string) => el("objecttag", { id: fresh(), TagType: "Unknown", Name: name },
        el("t", { p: "0 0", BoundingBox: `0 ${fmt(-0.716 * 0.75 * style.captionSize * f)} ${fmt(widthOf(text, 0.75 * style.captionSize * f))} 0`, CaptionLineHeight: "variable" }, run(text, { font: style.captionFont, size: 0.75 * style.captionSize * f, colour: sh.colour, face: 0 })));
      const tags = p ? [polymerLabel(p) && (p.usage !== "param" || p.label) ? tag(p.usage === "param" ? "parameterizedBracketLabel" : "bracketusage", polymerLabel(p)) : "", p.usage === "param" && p.mw ? tag("molecularWeightOverride", String(p.mw)) : "",
        p.pattern ? tag("polymerrepeat", p.pattern) : "", p.flip === "flip" ? tag("polymerflip", "flip") : ""].join("") : "";
      sides.forEach((side, k) => {
        const ends = side === "left" ? [[x0, y1], [x0, y0]] : [[x1, y0], [x1, y1]], last = p && side === "right";
        ids.push(k ? fresh() : id);
        put(el("graphic", { id: ids[k], BoundingBox: ends.map((q) => pt(turned(page(q as P)))).join(" "), Z: Z(), color: ink, LineType: sh.dashed ? "Dashed" : undefined, GraphicType: "Bracket", BracketType: { brackets: "Square", parens: "Round", braces: "Curly" }[sh.kind as "brackets"], IgnoreWarnings: sh.ignoreWarnings ? "yes" : undefined, ...mine,
          BracketUsage: last ? USAGES[p.usage].cdxml : undefined, PolymerRepeatPattern: last && p.pattern ? { hh: "HeadToHead", eu: "EitherUnknown" }[p.pattern] : undefined, PolymerFlipType: last && p.flip ? { noflip: "NoFlip", flip: "Flip" }[p.flip] : undefined,
          Octet: priv(k ? { pair: id } : { mark: sh.mark, span: sh.side ? [Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[0], sh.to[0])] : undefined, angle: sh.angle, scale: ownScale(sh), polymer: p }) }, last ? tags : ""), 3, box, sh.id);
      });
      if (p || (sh.bracketed && !sh.side)) polymerIds.push({ sh, ids });
      if (sh.mark) { const m = markAt(sh, 1); note(sh.mark, at([m.x, -m.y]), style.captionSize * f, m.anchor === "end" ? "right" : "left", sh.colour, sh.id); }
    } else if (sh.kind === "picture" && sh.picture) {
      // A picture as ChemDraw holds it, its bytes as they came (REL-15), in uppercase hex.
      put(el("embeddedobject", { id, BoundingBox: boxText(box), Z: Z(), ...Object.fromEntries(PICTURE_KEYS.filter((k) => sh.picture![k] !== undefined).map((k) => [k, sh.picture![k]])) }), 4.5, box, sh.id);
    } else if (sh.kind === "tlc") {
      const t = tlcLayout(sh), tlc: Tlc = sh.tlc ?? { lanes: 1, spots: [] }, hide = new Set(tlc.hide ?? []);
      // Spots go in their lanes; Octet's own order comes back from its data when it differs.
      const order = tlc.spots.map((_, k) => k).sort((p, q) => tlc.spots[p].lane - tlc.spots[q].lane || p - q);
      const spot = (x: Spot) => {
        const { rx, ry } = t.size(x);
        return el("tlcspot", { id: fresh(), color: colour(x.colour), Rf: num6(x.rf), Width: Math.round(2 * rx * B * 65536), Height: Math.round(2 * ry * B * 65536), Tail: Math.round((x.tail ?? 0) * f * B * 65536),
          CurveType: spotType(x) || undefined, ShowRf: tlc.rf || x.showRf ? "yes" : undefined });
      };
      const lanes = Array.from({ length: tlc.lanes }, (_, k) => el("tlclane", { id: fresh() }, order.filter((j) => tlc.spots[j].lane === k).map((j) => spot(tlc.spots[j])).join(""))).join("");
      const face = (sh.bold ? 1 : 0) | (sh.italic ? 2 : 0) | (sh.underline ? 4 : 0);
      put(el("tlcplate", { id, BoundingBox: boxText(box), Z: Z(), color: ink, LabelFont: sh.font ? font(sh.font) : undefined, LabelSize: sh.size ? fmtSize(sh.size * f) : undefined, LabelFace: face || undefined, TopLeft: pt([x0, y0]), TopRight: pt([x1, y0]), BottomRight: pt([x1, y1]), BottomLeft: pt([x0, y1]), ...mine,
        OriginFraction: num6(tlc.origin ?? TLC_ORIGIN), SolventFrontFraction: num6(tlc.front ?? TLC_FRONT), ShowOrigin: hide.has("origin") ? undefined : "yes", ShowSolventFront: hide.has("front") ? undefined : "yes", ShowBorders: hide.has("border") ? undefined : "yes",
        ShowSideTicks: tlc.ticks ? "yes" : undefined, Transparent: tlc.transparent ? "yes" : undefined,
        Octet: priv({ rf: tlc.rf, hollow: tlc.spots.flatMap((x, k) => (x.style === "hollow" ? [k] : [])).join(" ") || undefined, own: tlc.rf ? tlc.spots.flatMap((x, k) => (x.showRf ? [k] : [])).join(" ") || undefined : undefined,
          order: order.some((j, k) => j !== k) ? order.join(" ") : undefined, scale: ownScale(sh) }) }, lanes), 5, box, sh.id);
    } else if (sh.kind === "table") {
      // The table's rules and cells, laid out as Octet lays them out (text measured with Arial's widths).
      // The text at its own size (or the document's) times the table's scale.
      const own = sh.size ?? style.captionSize, size = own * f, face = (sh.bold ? 1 : 0) | (sh.italic ? 2 : 0) | (sh.underline ? 4 : 0);
      const t = tableLayout(sh, (s) => widthOf(s, own) / B, style.captionSize), lines = new Set(linesOf(sh.table)), inner = (n: number) => Array.from({ length: Math.max(0, n - 1) }, (_, k) => k + 1);
      const across = [...(lines.has("top") ? [t.y1] : []), ...inner(t.rows).filter((r) => lines.has("rows") || (r === 1 && lines.has("header"))).map((r) => t.row(r)), ...(lines.has("bottom") ? [t.y0] : [])];
      const down = [...(lines.has("left") ? [t.x0] : []), ...(lines.has("cols") ? inner(t.cols).map((k) => t.col(k)) : []), ...(lines.has("right") ? [t.x1] : [])];
      const rules = [...across.map((v): [P, P] => [at([t.x0, v]), at([t.x1, v])]), ...down.map((v): [P, P] => [at([v, t.y1]), at([v, t.y0])])];
      const kids = rules.map(([p, q]) => el("graphic", { id: fresh(), BoundingBox: `${pt(p)} ${pt(q)}`, Z: Z(), color: colour(sh.colour), LineType: sh.dashed ? "Dashed" : undefined, GraphicType: "Line", ...(sh.table?.weight || f !== 1 ? { LineWidth: fmt((sh.table?.weight ?? line) * f) } : {}), Octet: DERIVED }));
      (sh.table?.cells ?? []).forEach((row, r) => row.forEach((text, k) => {
        if (!text) return;
        const align = sh.table?.align?.[k] ?? "centre", x = align === "left" ? t.col(k) + TABLE_PAD * f : align === "right" ? t.col(k + 1) - TABLE_PAD * f : t.col(k) + t.widths[k] / 2;
        const p = at([x, t.row(r) - t.heights[r] / 2]), q: P = [p[0], p[1] + 0.35 * size], just = align === "centre" ? "Center" : align === "right" ? "Right" : undefined;
        kids.push(el("t", { id: fresh(), p: pt(q), Z: Z(), color: colour(sh.colour), CaptionJustification: just, Justification: just, LineHeight: "auto", Octet: DERIVED }, run(text, { font: sh.font ?? style.captionFont, size, colour: sh.colour, face })));
      }));
      put(el("group", { id, BoundingBox: boxText(box), Z: Z(), color: colour(sh.colour), Octet: priv({ kind: "table", table: sh.table ?? { cells: [[""]] }, dashed: sh.dashed, font: sh.font, size: sh.size, face: face || undefined, scale: ownScale(sh) }) }, kids.join("")), 0, box, sh.id);
    }
  }

  // Orbitals and filled pen curves sit behind the structures.
  const curveOut = (a: Arrow) => {
    const c = a.curve!, { start, end } = headsOf(a), half = (h: Head) => h === "left" || h === "right";
    const bits = (c.closed ? 1 : 0) | (a.style === "dashed" ? 2 : 0) | (a.style === "bold" ? 4 : 0) | (end === "full" ? 8 : 0) | (start === "full" ? 16 : 0) | (half(end) ? 32 : 0) | (half(start) ? 64 : 0)
      | (a.fill === "solid" ? 128 : 0) | (a.fill === "shaded" || a.fill === "faded" ? 256 : 0) | (a.style === "doubled" ? 512 : 0);
    const qs = c.points.flatMap((q) => [q.c1 ?? q.at, q.at, q.c2 ?? q.at]).map(at), heads = start !== "none" || end !== "none";
    put(el("curve", { id: idOf.get(a.id)!, Z: Z(), color: colour(a.colour), FillType: a.fill === "solid" ? "Solid" : a.fill ? "Shaded" : undefined, CurveType: bits || undefined, ...ownLines(scaleOf(a), a.width),
      ArrowheadHead: HEADS[end], ArrowheadTail: HEADS[start], ArrowheadType: HEAD_SHAPES[a.head ?? "solid"], HeadSize: heads ? Math.round(headSize(a).length * 100) : undefined, ArrowheadCenterSize: heads ? Math.round(headSize(a).centre * 100) : undefined, ArrowheadWidth: heads ? Math.round(headSize(a).width * 100) : undefined,
      Closed: c.closed ? "yes" : undefined, CurvePoints: qs.map(pt).join(" "), Octet: priv({ kind: a.kind === "cut" ? "cut" : undefined, fill: a.fill === "faded" ? "faded" : undefined, style: a.style === "wavy" ? "wavy" : undefined, scale: ownScale(a), role: a.role }) }), 4, boxOf(qs), a.id);
  };
  for (const a of mol.arrows ?? []) {
    zOrder = a.order;
    if (a.kind === "orbital" && a.orbital) {
      const { shape, phase } = a.orbital;
      const name = (ORBITALS.find(([, s, p]) => s === shape && p === phase) ?? ORBITALS.find(([n, s]) => s === shape && n.endsWith("Filled") === (phase === "filled")) ?? ORBITALS.find(([, s]) => s === shape)!)[0];
      const back = ORBITALS.find(([n]) => n === name)!, tip = at(a.to), nucleus = at(a.from);
      put(el("graphic", { id: idOf.get(a.id)!, BoundingBox: `${pt(tip)} ${pt(nucleus)}`, Z: Z(), color: colour(a.colour), LineType: a.style === "dashed" ? "Dashed" : a.style === "bold" ? "Bold" : undefined, GraphicType: "Orbital", OrbitalType: name, ...ownLines(scaleOf(a), a.width),
        Octet: back[1] === shape && back[2] === phase && !ownScale(a) ? undefined : priv({ orbital: back[1] === shape && back[2] === phase ? undefined : a.orbital, scale: ownScale(a) }) }), 3, boxOf([nucleus], len(sub(tip, nucleus))), a.id);
    } else if (a.kind === "curve" && a.curve?.closed && a.fill) curveOut(a);
  }

  // Structures: one fragment per connected set of atoms, its nodes, bonds and the symbols drawn on its atoms.
  const nodeId = new Map<number, number>(), bondId = mol.bonds.map(() => 0), fragId = new Map<number, number>();
  const nbrs: number[][] = mol.atoms.map(() => []), bondsAt: number[][] = mol.atoms.map(() => []);
  // Labels whose bonds say which of their kept atoms each joins (a residue label, sequence.ts): written as ChemDraw
  // writes a monomer, a connection point inside for each bond (ExternalConnectionNum) and that number on the bond.
  const ported = new Set<number>();
  for (const b of mol.bonds) if (b.ports) b.atoms.forEach((k, e) => { if (b.ports![e] >= 0 && mol.atoms[k]?.inner?.atoms.length) ported.add(k); });
  mol.bonds.forEach((b, k) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); bondsAt[b.atoms[0]].push(k); bondsAt[b.atoms[1]].push(k); });
  const used = (i: number) => bondsAt[i].reduce((n, k) => n + orderOf(mol.bonds[k].type), 0);
  // Node and bond ids rise in Octet's atom and bond order, which is how the reader puts that order back.
  const frags = fragments(mol).map((f) => f.sort((p, q) => p - q)).sort((p, q) => p[0] - q[0]);
  mol.atoms.forEach((_, i) => nodeId.set(i, fresh()));
  mol.bonds.forEach((_, k) => { bondId[k] = fresh(); });
  for (const atoms of frags) { const f = fresh(); for (const i of atoms) fragId.set(i, f); }
  const page = (i: number) => at(mol.atoms[i].location);
  // Labels' charge signs that go to the file as symbols (labelOf), by atom: the middle of each sign's ink. The atoms
  // bonded to each as the renderer sees them (seen: no hidden H; covalent: no hydrogen bonds), for placing a sign.
  const signs = new Map<number, P>();
  const bondOf = (x: number, j: number) => mol.bonds[bondsAt[x].find((k) => mol.bonds[k].atoms.includes(j))!];
  const seen = nbrs.map((ns, x) => (mol.atoms[x].hidden ? [] : ns.filter((j) => !mol.atoms[j].hidden)));
  const covalent = seen.map((ns, x) => ns.filter((j) => bondOf(x, j).type !== HBOND));
  // Aromatic rings drawn with a circle: ChemDraw stores their bonds as order 1.5 and the circle as an oval inside the
  // ring's fragment (its own files). Octet keeps each bond's Kekulé order in its own data, to read back exactly.
  const circled = circledRings(mol), ringBond = new Set<number>();
  for (const r of circled) r.forEach((x, k) => { const y = r[(k + 1) % r.length]; ringBond.add(mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))); });
  const circles = (atoms: number[]) => circled.filter((r) => atoms.includes(r[0])).map((r) => {
    const c: P = [r.reduce((s, i) => s + page(i)[0], 0) / r.length, r.reduce((s, i) => s + page(i)[1], 0) / r.length];
    const edge = Math.min(...r.map((x, k) => len(sub(page(r[(k + 1) % r.length]), page(x)))));
    const radius = ringCircleRadius(r.length, edge, style.spacing / 100), major: P = [c[0] + radius, c[1]], minor: P = [c[0], c[1] + radius];
    return el("graphic", { id: fresh(), BoundingBox: `${pt(major)} ${pt(c)}`, Z: Z(), color: colour(mol.atoms[r[0]].colour), GraphicType: "Oval", OvalType: "Circle",
      Center3D: pt3(c), MajorAxisEnd3D: pt3(major), MinorAxisEnd3D: pt3(minor), Octet: DERIVED });
  }).join("");
  // R-group definitions: the structures inside each one's box go in its alternative group.
  const rgroups = rgroupMembers(mol, frags), hostOf = new Map<number[], number>(), members: string[][] = rgroups.map(() => []), memberBoxes: Box[][] = rgroups.map(() => []);
  rgroups.forEach((r, k) => r.members.forEach((f) => hostOf.set(f, k)));
  // A π ligand's ellipse, which Octet draws itself: written for ChemDraw as an oval inside the ring (its own ligands
  // have one).
  const ellipses = (atoms: number[]) => atoms.filter((i) => !mol.atoms[i].centre?.variable && (mol.atoms[i].centre?.atoms.length ?? 0) >= 3).map((i) => {
    const c = page(i), nb = nbrs[i][0], { across, along, ra, rb } = ligandEllipse(mol.atoms[i].centre!.atoms.map(page), c, nb === undefined ? undefined : page(nb), style.spacing / 100);
    const major: P = [c[0] + across[0] * ra, c[1] + across[1] * ra], minor: P = [c[0] + along[0] * rb, c[1] + along[1] * rb];
    return el("graphic", { id: fresh(), BoundingBox: `${pt(major)} ${pt(c)}`, Z: Z(), color: colour(mol.atoms[mol.atoms[i].centre!.atoms[0]].colour), GraphicType: "Oval",
      Center3D: pt3(c), MajorAxisEnd3D: pt3(major), MinorAxisEnd3D: pt3(minor), Octet: DERIVED });
  }).join("");
  for (const atoms of frags) {
    zOrder = mol.atoms[atoms[0]].order;
    let xml = "";
    const boxes: Box[] = [];
    for (const i of atoms) {
      const n = node(i);
      xml += n.xml;
      boxes.push(n.box);
    }
    for (const k of [...new Set(atoms.flatMap((i) => bondsAt[i]))].sort((p, q) => p - q)) xml += bond(k);
    for (const i of atoms) xml += marks(i);
    xml += circles(atoms) + ellipses(atoms);
    // Ring fills, as ChemDraw keeps them: a ColoredMolecularArea in the fragment, its colour and its ring's bonds.
    const inFrag = new Set(atoms);
    for (const f of mol.fills ?? []) {
      if (!f.atoms.every((i) => inFrag.has(i))) continue;
      const ring = f.atoms.map((i, k) => bondsAt[i].find((n) => mol.bonds[n].atoms.includes(f.atoms[(k + 1) % f.atoms.length])));
      if (ring.every((k) => k !== undefined)) xml += el("ColoredMolecularArea", { id: fresh(), bgcolor: colour(f.colour), BasisObjects: ring.map((k) => bondId[k!]).join(" ") });
    }
    const box = union(boxes)!, host = hostOf.get(atoms);
    if (host !== undefined) {
      // An R-group's fragment attaches through a connection point; one Octet draws none for (Cl, OMe) attaches
      // through its first atom, by a point written for ChemDraw one bond length to the left.
      if (!atoms.some((i) => mol.atoms[i].attach)) {
        const point = fresh(), X = page(atoms[0]);
        xml += el("n", { id: point, p: pt([X[0] - B, X[1]]), NodeType: "ExternalConnectionPoint", Octet: DERIVED }) + el("b", { id: fresh(), B: point, E: nodeId.get(atoms[0])!, Octet: DERIVED });
      }
      members[host].push(el("fragment", { id: fragId.get(atoms[0])!, BoundingBox: boxText(box), Z: Z() }, xml));
      memberBoxes[host].push(box);
      continue;
    }
    outs.push({ xml: el("fragment", { id: fragId.get(atoms[0])!, BoundingBox: boxText(box), Z: Z() }, xml), rank: 1, box, group: atoms.map((i) => groupOfAtom.get(i)).find((g) => g !== undefined) });
  }
  // Each R-group definition: its name in a title frame above its group frame (the box), and its fragments.
  rgroups.forEach(({ sh }, k) => {
    zOrder = sh.order;
    const [x0, y0] = at([Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[1], sh.to[1])]), [x1, y1] = at([Math.max(sh.from[0], sh.to[0]), Math.min(sh.from[1], sh.to[1])]);
    const name = sh.rgroup!.name, size = style.captionSize * scaleOf(sh), w = widthOf(name, size), frame: Box = [x0, y0 - 1.5 * size, x0 + w + 0.8 * size, y0];
    const title = el("t", { id: fresh(), p: pt([x0 + 0.4 * size, y0 - 0.4 * size]), BoundingBox: boxText([x0 + 0.4 * size, y0 - 1.1 * size, x0 + 0.4 * size + w, y0 - 0.4 * size]), Z: Z(), LineHeight: "auto" },
      run(name, { font: style.captionFont, size, colour: sh.colour, face: 0 }));
    const box = union([[x0, frame[1], x1, y1], ...memberBoxes[k]])!;
    put(el("altgroup", { id: idOf.get(sh.id)!, BoundingBox: boxText(box), Z: altZ.get(sh.id) ?? Z(), color: colour(sh.colour), TextFrame: boxText(frame), GroupFrame: boxText([x0, y0, x1, y1]), Valence: 1,
      ...ownLines(scaleOf(sh), sh.width), Octet: priv({ scale: ownScale(sh), dashed: sh.dashed }) }, title + members[k].join("")), 1, box, sh.id);
  });
  // R-Logic: one row for each R-group that has any (ChemDraw writes every field of a row, empty or not).
  const logic = rgroups.filter(({ sh }) => sh.rgroup!.occur || sh.rgroup!.restH || sh.rgroup!.then);
  if (logic.length) {
    const first = logic[0].sh, [lx, ly] = at([Math.min(first.from[0], first.to[0]), Math.min(first.from[1], first.to[1]) - 0.8]);
    put(el("rlogic", { id: fresh(), p: pt([lx, ly]), BoundingBox: boxText([lx, ly - style.captionSize, lx, ly]), Z: Z() }, logic.map(({ sh }) => el("rlogicitem", {
      id: fresh(), RLogicGroup: sh.rgroup!.name, RLogicOccurrence: sh.rgroup!.occur ?? "", RLogicIfThenGroup: sh.rgroup!.then ?? "", RLogicRestH: sh.rgroup!.restH ? "yes" : undefined }) ).join("")), 2, [lx, ly, lx, ly]);
  }
  // Polymer brackets' bracketed groups: the atoms inside, each bracket and the bonds that cross it (spec 15.1, 15.2).
  // A pair with no usage (bracketed) has its group with no usage, as ChemDraw keeps it.
  for (const { sh, ids } of polymerIds) {
    const p = sh.polymer, e = enclosed(mol, sh);
    if (!e.atoms.length) continue;
    const mid: P = [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2], inside = new Set(e.atoms);
    // A crossing bond goes with the bracket on the side of its outer atom (the box turned upright).
    const sideOf = (k: number) => { const b = mol.bonds[k], out = inside.has(b.atoms[0]) ? b.atoms[1] : b.atoms[0], q = mol.atoms[out].location; return turnPoint([q[0], q[1]], mid, -(sh.angle ?? 0))[0] < mid[0] ? 0 : 1; };
    const attachments = ids.map((g, side) => el("bracketattachment", { id: fresh(), GraphicID: g }, e.crossing.filter((k) => sideOf(k) === side).map((k) => {
      const b = mol.bonds[k];
      return el("crossingbond", { id: fresh(), BondID: bondId[k], InnerAtomID: nodeId.get(inside.has(b.atoms[0]) ? b.atoms[0] : b.atoms[1])! });
    }).join(""))).join("");
    const count = p?.usage === "mult" ? Number(p.label ?? 2) : undefined;
    put(el("bracketedgroup", { id: fresh(), BracketedObjectIDs: [...e.atoms].sort((x, y) => x - y).map((i) => nodeId.get(i)).join(" "), BracketUsage: p && USAGES[p.usage].cdxml,
      PolymerRepeatPattern: p?.pattern && { hh: "HeadToHead", eu: "EitherUnknown" }[p.pattern], PolymerFlipType: p?.flip && { noflip: "NoFlip", flip: "Flip" }[p.flip],
      RepeatCount: count !== undefined && Number.isFinite(count) ? count : p?.usage === "mult" ? 2 : undefined, ComponentOrder: p?.usage === "c" && p.order ? p.order : undefined,
      SRULabel: p?.usage === "sru" && p.label ? p.label : undefined }, attachments), 7, union(e.atoms.map((i) => { const X = page(i); return [X[0], X[1], X[0], X[1]] as Box; }))!);
  }

  // A node, with its label and, for an abbreviation Octet can expand, the abbreviation's atoms (spec 13.3).
  function node(i: number): { xml: string; box: Box } {
    const a = mol.atoms[i], X = page(i), deg = nbrs[i].length, charge = a.charge ?? 0;
    const shown = !a.attach && !a.bead && !a.centre && (a.label !== "C" || !deg || !!a.text || !!a.isotope || !!a.shown || (deg === 1 ? style.terminalLabels : style.carbonLabels));
    // Query labels: a generic label (an R-group's, when the drawing defines it), an element or NOT list, a link node
    // and an anonymous alternative group (each alternative's atoms inside it, as an abbreviation's). A label with
    // Interpret Chemically off is a node of no known kind (Unspecified), its text marked as not chemistry.
    const plain = a.chemical === false, q = plain ? undefined : queryLabel(a.text), named = q === "generic" ? altIds.get(a.text!) : undefined;
    const list = q === "list" ? elementList(a.text!) : undefined, link = q === "link" ? linkNode(a.text!) : undefined, alts = q === "alt" ? altGroup(a.text!) : undefined;
    const known = a.text && !q && !plain && !ported.has(i) ? opts.expand?.(a.text) : undefined, inner = known ?? (a.text && !q && !plain ? a.inner : undefined);
    const type = a.centre ? (a.centre.variable ? "VariableAttachment" : "MultiAttachment") : a.attach || a.bead ? "ExternalConnectionPoint" : named !== undefined ? "NamedAlternativeGroup"
      : q === "generic" ? "GenericNickname" : list ? "ElementList" : link ? "LinkNode" : alts ? "AnonymousAlternativeGroup" : a.text ? (inner?.atoms.length ? "Fragment" : "Unspecified") : undefined;
    const element = link ? (link.generic ? undefined : atomicNumber(link.element)) : type ? undefined : atomicNumber(a.label);
    const h = shown && !a.text ? a.implicitHCount ?? hydrogens(a.label, charge, used(i), a.radical === 3 ? 2 : a.radical) : link ? link.h : undefined;
    const enhanced = /^(abs|&|or)(\d*)$/.exec(a.enhanced ?? "");
    const label = shown ? labelOf(i, style.hideH ? 0 : h ?? 0) : undefined;
    const z = a.location[2] ?? 0, aq = a.query, kept = a.kept && keptHolds(mol, i, a.kept) ? a.kept.atoms : undefined;
    const alternatives = alts?.map((t) => opts.expand?.(t) ?? (isElement(t) ? { atoms: [{ label: t, location: [0, 0, 0] as [number, number, number] }], bonds: [] } : undefined)).filter((m): m is Mol => !!m?.atoms.length) ?? [];
    const xml = el("n", {
      id: nodeId.get(i)!, p: pt(X), Z: Z(), Visible: a.hidden ? "no" : undefined, NodeType: type, Element: element && element !== 6 ? element : undefined, Isotope: type ? undefined : a.isotope ?? (a.label === "D" ? 2 : a.label === "T" ? 3 : undefined), Charge: charge || undefined,
      Radical: a.radical ? RADICALS[a.radical === 3 ? 1 : Math.min(2, a.radical) + 1] : undefined, NumHydrogens: h, ExternalConnectionType: a.attach ? (a.attach === "diamond" ? "Diamond" : a.attach === "star" ? "Star" : "Wavy") : a.bead ? "PolymerBead" : undefined,
      NeedsClean: shown ? "yes" : undefined, GenericNickname: q === "generic" && named === undefined ? a.text : link?.generic, AltGroupID: named,
      LabelDisplay: shown && a.align ? { left: "Left", centre: "Center", right: "Right", above: "Above", below: "Below" }[a.align] : undefined,
      ElementList: list ? `${list.not ? "NOT " : ""}${list.elements.map(atomicNumber).join(" ")}` : undefined, LinkCountLow: link?.low, LinkCountHigh: link?.high,
      Attachments: a.centre ? a.centre.atoms.map((j) => nodeId.get(j)).filter((v) => v !== undefined).join(" ") || undefined : undefined,
      FreeSites: aq?.subst?.kind === "free" ? aq.subst.n : undefined, SubstituentsUpTo: aq?.subst?.kind === "upto" ? aq.subst.n : undefined, SubstituentsExactly: aq?.subst?.kind === "exactly" ? aq.subst.n : undefined,
      ImplicitHydrogens: aq?.noH ? "yes" : undefined, RingBondCount: aq?.rings && RING_COUNTS[aq.rings], UnsaturatedBonds: aq?.unsat && { absent: "MustBeAbsent", present: "MustBePresent" }[aq.unsat],
      RxnChange: aq?.change ? "yes" : undefined, RxnStereo: aq?.stereo && { inversion: "Inversion", retention: "Retention" }[aq.stereo], Translation: aq?.translation && { broad: "Broad", narrow: "Narrow", any: "Any" }[aq.translation],
      IsotopicAbundance: aq?.abundance && ABUNDANCES[aq.abundance], AbnormalValence: aq?.valence ? "yes" : undefined,
      EnhancedStereoType: enhanced ? { abs: "Absolute", "&": "And", or: "Or" }[enhanced[1]] : undefined, EnhancedStereoGroupNum: enhanced?.[2] || undefined,
      color: colour(a.colour), highlightColor: colour(a.halo), ShowAtomStereo: a.cip ? "yes" : undefined, ShowAtomNumber: a.number ? "yes" : undefined, AtomNumber: a.number ?? a.hiddenNumber, IgnoreWarnings: a.ignoreWarnings ? "yes" : undefined, xyz: z ? `${pt(X)} ${fmt(-z * B)}` : undefined, ShowPerspective: a.shade ? "yes" : undefined,
      // A fragment's or alternative group's bonds in order; or a stereocentre's kept configuration, as ChemDraw stores it.
      BondOrdering: (inner || alternatives.length) && deg > 1 ? bondsAt[i].map((k) => bondId[k]).join(" ") : kept ? kept.map((j) => (j < 0 ? 0 : bondId[bondsAt[i].find((k) => mol.bonds[k].atoms.includes(j))!])).join(" ") : undefined,
      Geometry: !(inner || alternatives.length) && kept ? "Tetrahedral" : undefined,
      // A scaled atom's label size, as drawn (its own size, or the document's, times its scale), and its line width
      // (an atom with no bonds takes its scale back from it).
      LabelSize: shown && scaleOf(a) !== 1 ? fmtSize((a.size ?? style.labelSize) * scaleOf(a)) : undefined, LineWidth: scaleOf(a) !== 1 ? fmt(line * scaleOf(a)) : undefined,
      Octet: priv({ hmark: a.hmark, partial: a.partial, map: a.map, circle: a.circle, angles: a.angles, scale: ownScale(a) }),
    }, (inner ? nested(i, inner, !!known) : "") + alternatives.map((m) => nested(i, m)).join("") + (label?.xml ?? "") + assignTags(a.peaks));
    if (a.partial) note(a.partial === "+" ? "δ+" : "δ−", [X[0] + 0.45 * B * scaleOf(a), X[1] - 0.45 * B * scaleOf(a)] as P, (a.size ?? style.labelSize) * scaleOf(a) * 0.75, "left", a.colour);
    return { xml, box: label?.box ?? [X[0], X[1], X[0], X[1]] };
  }

  // Where Octet draws a labelled atom's charge sign (render.ts signSpot), worked out from Arial's metrics as the label
  // anchors are: undefined when it is after the label, where ChemDraw puts a label's sign; else the middle of its ink.
  // The label's attaching line (text, after a mass number isoW wide) starts left of the atom by half its first glyph,
  // or read right to left ends at end.
  function signAt(i: number, X: P, size: number, text: string, isoW: number, textW: number, rtl: boolean, end: number): P | undefined {
    const a = mol.atoms[i], f = scaleOf(a), s = 0.75 * size, t = (a.charge ?? 0) > 0 ? "+" : "–", [w, l, r] = arialGlyph(t).map((n) => (n * s) / 1000);
    const y = X[1] + (/[OSCGQ]/.test(text) ? 0.364 : 0.358) * size, left = rtl ? X[0] + end - isoW - textW : X[0] - advance(text[0], size) / 2 - isoW;
    const edge = (b: Box): P[] => Array.from({ length: 9 }, (_, k): P[] => { const g = k / 8, x = b[0] + (b[2] - b[0]) * g, yy = b[1] + (b[3] - b[1]) * g; return [[x, b[1]], [x, b[3]], [b[0], yy], [b[2], yy]]; }).flat();
    // The sign's ink: Arial's + is two bars 0.08 em thick, from 0.116 to 0.589 em up; its en dash one bar.
    const c: P = [(l + r) / 2, t === "+" ? -0.3525 * s : -0.259 * s], bar = 0.04 * s;
    const ink = t === "+" ? [...edge([l, c[1] - bar, r, c[1] + bar]), ...edge([c[0] - bar, -0.589 * s, c[0] + bar, -0.116 * s])] : edge([l, -0.294 * s, r, -0.224 * s]);
    const z = { spacing: (style.spacing / 100) * B * f, margin: ((style.margin * 1.69) / 1.6) * f, hw: (line / 2) * f, wide: style.bold * 0.75 * f };
    const shownAt = (j: number) => { const b = mol.atoms[j], d = seen[j].length; return !b.attach && !b.bead && !b.centre && (b.label !== "C" || !d || !!b.text || !!b.isotope || !!b.shown || (d === 1 ? style.terminalLabels : style.carbonLabels)); };
    const { bonds, rings } = signBonds(i, seen, covalent, bondOf, shownAt, page, z);
    const { at, after } = signSpot(X, bonds, rings, left, left + isoW + textW, y - 0.33 * size, w, ink, rtl, edge([left, y - 0.716 * size, left + isoW + textW, y]), size);
    return after ? undefined : [at[0] + c[0], at[1] + c[1]];
  }

  // An atom's label as ChemDraw stores it: the text in formula face, any charge as a superscript run after it, and
  // its anchor where Octet draws the text (spec 13.1). H goes where Octet draws it. A label that reads right to left
  // and has more than one glyph is right-justified, as ChemDraw writes it, with p at the right end of the text as drawn
  // plus the charge sign: the glyph a bond meets centred on the atom if the label ends with it (MeO), else the text's
  // ink ending as far right of the atom as it starts left of it read left to right (Br). A sign Octet draws anywhere
  // but after the label (before one read right to left, ⁻O, or moved off a bond) is not in the text: it goes to the
  // file as a Plus or Minus symbol linked to the atom (marks), as ChemDraw keeps a sign moved off its label. A sign of
  // 2+ or more stays after the text, as a symbol holds one charge.
  function labelOf(i: number, h: number): { xml: string; box: Box } {
    const a = mol.atoms[i], X = page(i), size = (a.size ?? style.labelSize) * scaleOf(a), charge = a.charge ?? 0, deg = nbrs[i].length;
    const v = nbrs[i].reduce<P>((acc, j) => { const d = sub(page(j), X), l = len(d) || 1; return [acc[0] + d[0] / l, acc[1] + d[1] / l]; }, [0, 0]);
    const steep = len(v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180), right = deg > 0 && !steep && v[0] > 1e-6;
    let sign = charge && !a.circled ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ""}${charge > 0 ? "+" : "-"}` : "";
    if (a.text?.includes("\n")) return labelLines(i, size, right, sign);
    let text = a.text ?? a.label, just = right && (text + sign).length > 1 ? "Right" : "Left", stack: string | undefined;
    if (!a.text && h) {
      text += `H${h > 1 ? h : ""}`;
      if (deg ? right : H_FIRST.has(a.label)) just = "Right";
      else if (steep && deg >= 2) stack = v[1] > 0 ? "Above" : "Below";
    }
    // An alignment set by hand (the node's LabelDisplay says it is).
    if (a.align) { just = a.align === "right" ? "Right" : a.align === "centre" ? "Center" : "Left"; stack = a.align === "above" ? "Above" : a.align === "below" ? "Below" : undefined; }
    // An isotope's mass number, a superscript run before the element; the element stays on the atom.
    const iso = !a.text && a.isotope && a.label !== "D" && a.label !== "T" ? String(a.isotope) : "", isoW = widthOf(iso, 0.75 * size);
    const wide = (s: string) => [...s].reduce((w, ch, k) => w + advance(ch, /\d/.test(ch) && k ? 0.75 * size : size), 0);
    // The glyph that ends the label read right to left: the attaching unit's last (r of Br, O of OMe shown as MeO, the
    // 1 of R1), or a query label's last.
    const q = queryLabel(a.text), u = q === "list" || q === "alt" || q === "link" ? undefined : units(text)[0], tail = (u ? u.count ?? u.text : text).slice(-1);
    const ink = (ch: string, k: number): [number, number] => { const [w, l, r] = arialGlyph(ch); return [(l * k) / 1000, ((w - r) * k) / 1000]; };
    const end = u && !u.count && [...u.text].length === 1 ? advance(text[0], size) / 2 : advance(text[0], size) / 2 - ink(text[0], size)[0] + ink(tail, /\d/.test(tail) && (!u || u.count) ? 0.75 * size : size)[1];
    if (Math.abs(charge) === 1 && sign) {
      // The label's attaching line: a stacked label's first unit.
      const at = signAt(i, X, size, text, isoW, wide(stack && u ? u.text + (u.count ?? "") : text), a.align ? a.align === "right" : right, end);
      if (at) { signs.set(i, at); sign = ""; if (!a.align && (a.text || !h)) just = right && text.length > 1 ? "Right" : "Left"; }
    }
    const width = isoW + wide(text) + widthOf(sign, 0.75 * size);
    const x = just === "Right" ? X[0] + end + widthOf(sign, 0.75 * size) : just === "Center" ? X[0] : X[0] - advance(text[0], size) / 2 - isoW;
    const y = X[1] + (/[OSCGQ]/.test(text) ? 0.364 : 0.358) * size, left = just === "Right" ? x - width : just === "Center" ? x - width / 2 : x;
    // A turned label turns about p, as a caption does.
    const box = turnedBox([left, y - 0.716 * size, left + width, y + (/\d/.test(text) ? 0.15 * size : 0)], [x, y], a.labelAngle);
    const style2 = { font: a.font ?? style.labelFont, size, colour: a.colour }, look = (a.bold ? 1 : 0) | (a.italic ? 2 : 0) | (a.underline ? 4 : 0);
    // A link node's repeat range ([CH2]3-7) is subscript, apart from the formula before it.
    const range = linkNode(text) ? /\d{1,2}-\d{1,2}$/.exec(text)![0] : "";
    return {
      xml: el("t", { p: pt([x, y]), BoundingBox: boxText(box), color: colour(a.colour), LabelJustification: just, Justification: just === "Left" ? undefined : just, LabelAlignment: stack, InterpretChemically: a.chemical === false ? "no" : undefined,
        RotationAngle: rotationAngle(a.labelAngle) },
        (iso ? run(iso, { ...style2, face: 0x40 | look }) : "") + labelText(a, text.slice(0, text.length - range.length), 0, { ...style2, face: 0x60 | look }) + (range ? run(range, { ...style2, face: 0x20 | look }) : "")
        + (sign ? run(sign, { ...style2, face: 0x40 | look }) : "")),
      box,
    };
  }

  // A label of more than one line, where render.ts draws it: one text with a line break after each line but the last
  // and LineStarts (where each line ends, as ChemDraw writes it), justified as its lines line up (centred when
  // centred or stacked; Right when it reads right to left), and p at the first line's baseline: its start, middle or
  // end. The attaching line (the first, or the last stacked above) sits on the atom. A charge sign Octet draws after
  // the attaching line goes there in the text; drawn anywhere else, it is a symbol (as labelOf's).
  function labelLines(i: number, size: number, right: boolean, sign: string): { xml: string; box: Box } {
    const a = mol.atoms[i], X = page(i), rows = a.text!.split("\n"), k0 = a.align === "above" ? rows.length - 1 : 0, own = rows[k0] || "H", pitch = LINE * size;
    const just = a.align === "centre" || a.align === "above" || a.align === "below" ? "Center" : a.align === "right" || (!a.align && right) ? "Right" : "Left";
    const wide = (t: string) => units(t).flatMap(pieces).reduce((w, u) => w + widthOf(u.text, size) + (u.count ? widthOf(u.count, 0.75 * size) : 0), 0), ws = rows.map(wide);
    const tail = units(own)[units(own).length - 1], start = X[0] - advance(own[0], size) / 2, end = X[0] + (tail?.count ? advance(tail.count.slice(-1), 0.75 * size) : advance(own[own.length - 1], size)) / 2;
    const from = (j: number) => (just === "Center" ? X[0] - ws[j] / 2 : just === "Right" ? end - ws[j] : start);
    const base = X[1] + (/[OSCGQ]/.test(own[0]) ? 0.364 : 0.358) * size, y0 = base - k0 * pitch;
    if (sign && Math.abs(a.charge ?? 0) === 1) {
      const at = signAt(i, X, size, own, 0, ws[k0], just === "Right", end - X[0]);
      if (at) { signs.set(i, at); sign = ""; }
    }
    const x = just === "Center" ? X[0] : just === "Right" ? end : start, last = rows[rows.length - 1];
    const box = turnedBox([Math.min(...rows.map((_, j) => from(j))), y0 - 0.716 * size, Math.max(...rows.map((_, j) => from(j) + ws[j] + (j === k0 ? widthOf(sign, 0.75 * size) : 0))),
      y0 + (rows.length - 1) * pitch + (/\d/.test(last) ? 0.15 * size : 0)], [x, y0], a.labelAngle);
    const style2 = { font: a.font ?? style.labelFont, size, colour: a.colour }, look = (a.bold ? 1 : 0) | (a.italic ? 2 : 0) | (a.underline ? 4 : 0);
    // Each part: its text, face, and place in the label's text (none for the sign).
    const parts: [string, number, number?][] = [];
    let place = 0;
    rows.forEach((t, j) => {
      parts.push([t, 0x60 | look, place]);
      place += t.length + 1;
      if (j === k0 && sign) parts.push([sign, 0x40 | look]);
      if (j < rows.length - 1) parts[parts.length - 1][0] += "\n";
    });
    const text = parts.map(([t]) => t).join(""), ends = [...[...text.matchAll(/\n/g)].map((m) => m.index! + 1), text.length];
    return {
      xml: el("t", { p: pt([x, y0]), BoundingBox: boxText(box), color: colour(a.colour), LabelJustification: just, Justification: just === "Left" ? undefined : just, LabelAlignment: a.align === "above" ? "Above" : a.align === "below" ? "Below" : undefined,
        InterpretChemically: a.chemical === false ? "no" : undefined, RotationAngle: rotationAngle(a.labelAngle), LineStarts: ends.join(" ") },
        parts.filter(([t]) => t).map(([t, face, at]) => (at === undefined ? run(t, { ...style2, face }) : labelText(a, t, at, { ...style2, face }))).join("")),
      box,
    };
  }

  // An abbreviation's own atoms, turned to point away from the host's bonds, with a connection point towards each
  // outer neighbour in the host's bond order (spec 13.3).
  // derived: an abbreviation's atoms, written for ChemDraw only (Octet reads the label again); otherwise a contracted
  // group Octet keeps with the label.
  function nested(i: number, inner: Mol, derived = false): string {
    const X = page(i), out = nbrs[i].map((j) => { const d = sub(page(j), X), l = len(d) || 1; return [d[0] / l, d[1] / l] as P; });
    const away: P = out.length ? out.reduce<P>((s, d) => [s[0] - d[0], s[1] - d[1]], [0, 0]) : [1, 0];
    const o = inner.atoms[0].location, rel = (q: readonly number[]): P => [(q[0] - o[0]) * B, -(q[1] - o[1]) * B];
    const mid = inner.atoms.reduce<P>((s, q) => { const r = rel(q.location); return [s[0] + r[0], s[1] + r[1]]; }, [0, 0]);
    const t = len(mid) > 1e-6 && len(away) > 1e-6 ? Math.atan2(away[1], away[0]) - Math.atan2(mid[1], mid[0]) : 0;
    const place = (r: P): P => [X[0] + r[0] * Math.cos(t) - r[1] * Math.sin(t), X[1] + r[0] * Math.sin(t) + r[1] * Math.cos(t)];
    const ids = inner.atoms.map(() => fresh());
    let xml = inner.atoms.map((q, k) => {
      const e = atomicNumber(q.label);
      return el("n", { id: ids[k], p: pt(place(rel(q.location))), Element: e > 0 && e !== 6 ? e : undefined, Isotope: q.label === "D" ? 2 : q.label === "T" ? 3 : undefined, Charge: q.charge || undefined });
    }).join("");
    // A residue's wedges and hashes go with it, so its stereocentres stay.
    const own = ported.has(i) && !derived, wedge = (b: Bond) => (own && b.stereo === 1 ? "WedgeBegin" : own && b.stereo === 6 ? "WedgedHashBegin" : undefined);
    xml += inner.bonds.map((b) => el("b", { id: fresh(), B: ids[b.atoms[0]], E: ids[b.atoms[1]], Order: b.type === 2 ? "2" : b.type === 3 ? "3" : undefined, Display: wedge(b) })).join("");
    if (own) {
      bondsAt[i].forEach((k, n) => {
        const b = mol.bonds[k], e = b.atoms[0] === i ? 0 : 1, at = b.ports && b.ports[e] >= 0 && b.ports[e] < ids.length ? b.ports[e] : 0, d = out[nbrs[i].indexOf(b.atoms[1 - e])] ?? [1, 0];
        const point = fresh();
        xml += el("n", { id: point, p: pt([X[0] + d[0] * B, X[1] + d[1] * B]), NodeType: "ExternalConnectionPoint", ExternalConnectionNum: n + 1 }) + el("b", { id: fresh(), B: point, E: ids[at] });
      });
      return el("fragment", { id: fresh() }, xml);
    }
    for (const d of out) {
      const point = fresh();
      xml += el("n", { id: point, p: pt([X[0] + d[0] * B, X[1] + d[1] * B]), NodeType: "ExternalConnectionPoint" }) + el("b", { id: fresh(), B: point, E: ids[0] });
    }
    return el("fragment", { id: fresh(), Octet: derived ? DERIVED : undefined }, xml);
  }

  // A bond: order, display, forced double-bond side, colour, and its neighbours' order round a double bond (spec 13.4).
  function bond(k: number): string {
    const b = mol.bonds[k], d = b.display, [i, j] = b.atoms;
    const display = b.type === 1 || b.type === 4 ? (b.stereo === 1 ? "WedgeBegin" : b.stereo === 6 ? "WedgedHashBegin" : d ? ({ bold: "Bold", dashed: "Dash", hashed: "Hash", wavy: "Wavy", hollow: "HollowWedgeBegin" } as Record<string, string>)[d] : undefined)
      : b.type === 2 ? ({ bold: "Bold", either: "Wavy" } as Record<string, string>)[d ?? ""] : undefined;
    let circular: string | undefined;
    if (b.type === 2 && nbrs[i].length > 1 && nbrs[j].length > 1) {
      // [Begin-left, Begin-right, End-right, End-left], looking from Begin to End on the page (y down).
      const axis = sub(page(j), page(i)), slots = [0, 0, 0, 0];
      const fill = (x: number, left: number, right: number) => {
        for (const kk of bondsAt[x]) {
          if (kk === k) continue;
          const y = mol.bonds[kk].atoms[0] === x ? mol.bonds[kk].atoms[1] : mol.bonds[kk].atoms[0], s = cross(axis, sub(page(y), page(x))) < 0 ? left : right;
          const slot = slots[s] ? (s === left ? right : left) : s;
          if (!slots[slot]) slots[slot] = bondId[kk];
        }
      };
      fill(i, 0, 1);
      fill(j, 3, 2);
      circular = slots.join(" ");
    }
    // A dashed double bond is ChemDraw's Tautomeric (its ⇧D): order 1.5, the second line dashed. Its Aromatic double
    // has both lines dashed.
    const ring = ringBond.has(k), dashed = !ring && b.type === 2 && (d === "dashed" || d === "aromatic"), f = (scaleOf(mol.atoms[i]) + scaleOf(mol.atoms[j])) / 2;
    // A hydrogen bond is ChemDraw 26's DottedHydrogen display on a single bond; a quadruple bond is order 4.
    return el("b", {
      id: bondId[k], Z: Z(), Visible: mol.atoms[i].hidden || mol.atoms[j].hidden ? "no" : undefined, B: nodeId.get(i)!, E: nodeId.get(j)!,
      Order: b.query ? BOND_QUERY[b.query] : ring || dashed || b.type === 4 ? "1.5" : d === "dative" ? "dative" : b.type === 2 ? "2" : b.type === 3 ? "3" : b.type === QUADRUPLE ? "4" : undefined,
      Topology: b.topology && TOPOLOGY[b.topology], RxnParticipation: b.rxn && RXN[b.rxn],
      Display: ring ? undefined : dashed && d === "aromatic" ? "Dash" : b.type === HBOND ? "DottedHydrogen" : display, Display2: dashed ? "Dash" : undefined, Octet: ring ? priv({ order: b.type }) : b.query ? priv({ type: b.type }) : undefined, DoublePosition: b.type === 2 && b.position ? { left: "Left", right: "Right", centre: "Center" }[b.position] : undefined,
      color: colour(b.colour), highlightColor: colour(b.halo), ShowPerspective: mol.atoms[i].shade || mol.atoms[j].shade ? "yes" : undefined, ShowBondStereo: mol.atoms[i].cip && mol.atoms[j].cip ? "yes" : undefined, BondCircularOrdering: circular, IgnoreWarnings: b.ignoreWarnings ? "yes" : undefined,
      // Its own settings: from its scale, else as they came from ChemDraw; and its own double-bond spacing.
      ...(f === 1 ? b.own : undefined), ...ownBond(f), BondSpacing: b.spacing !== undefined ? num6(b.spacing) : undefined,
      ...(ported.size && (ported.has(i) || ported.has(j)) ? { BeginExternalNum: ported.has(i) ? bondsAt[i].indexOf(k) + 1 : undefined, EndExternalNum: ported.has(j) ? bondsAt[j].indexOf(k) + 1 : undefined } : {}),
    }, assignTags(b.peaks));
  }

  // The symbols ChemDraw draws round an atom (spec 9.10): a label's sign where Octet draws it off the label (signAt), a
  // circled charge or a skeletal carbon's charge, radical electrons and lone pairs, each in the widest gap between the
  // atom's bonds and label.
  function marks(i: number): string {
    const a = mol.atoms[i], X = page(i), charge = a.charge ?? 0, deg = nbrs[i].length, moved = signs.get(i);
    const shown = !a.attach && !a.bead && (a.label !== "C" || !deg || !!a.text || !!a.isotope || !!a.shown || (deg === 1 ? style.terminalLabels : style.carbonLabels));
    const size = (7.5 * (a.size ?? style.labelSize) * scaleOf(a)) / 10;
    const symbol = (c: P, type: string, represent: string[]) => el("graphic", { id: fresh(), BoundingBox: `${pt(c)} ${pt([c[0] - size, c[1]])}`, Z: Z(), color: colour(a.colour), GraphicType: "Symbol", SymbolType: type },
      represent.map((what) => `<represent attribute="${what}" object="${nodeId.get(i)}"/>`).join(""));
    const sign = moved ? symbol(moved, charge > 0 ? "Plus" : "Minus", ["Charge"]) : "";
    const list: [string, string[]][] = [];
    if (charge && (a.circled || !shown)) list.push([a.circled ? (charge > 0 ? "CirclePlus" : "CircleMinus") : charge > 0 ? "Plus" : "Minus", ["Charge"]]);
    // A singlet radical (carbene) is a pair of electrons that stands for the radical.
    if (a.radical === 3) list.push([a.bars ? "LonePairBar" : "LonePair", ["Radical"]]);
    else for (let r = 0; r < Math.min(2, a.radical ?? 0); r++) list.push(["Electron", ["Radical"]]);
    for (let r = 0; r < Math.min(4, a.pairs ?? 0); r++) list.push([a.bars ? "LonePairBar" : "LonePair", []]);
    if (!list.length) return sign;
    const taken = nbrs[i].map((j) => { const d = sub(page(j), X); return Math.atan2(d[1], d[0]); });
    if (shown && (a.text || a.label !== "C")) taken.push(a.text && nbrs[i].length && taken.every((t) => Math.cos(t) > 0) ? Math.PI : 0);
    if (moved) taken.push(Math.atan2(moved[1] - X[1], moved[0] - X[0]));
    // Marks moved by hand (Atom.angles, by the renderer's keys) keep their angle; the page's y is down.
    // A singlet's pair is pair0, as the renderer counts it; a charge is charge, circled or a skeletal carbon's sign.
    const keys = list.map(([type], k) => (type === "Electron" ? `radical${list.slice(0, k).filter(([x]) => x === "Electron").length}` : type.startsWith("LonePair") ? `pair${list.slice(0, k).filter(([x]) => x.startsWith("LonePair")).length}` : "charge"));
    const angles: (number | undefined)[] = keys.map((key) => (key && a.angles?.[key] !== undefined ? (-a.angles[key] * Math.PI) / 180 : undefined));
    for (const t of angles) if (t !== undefined) taken.push(t);
    if (angles[0] === undefined && list[0][1][0] === "Charge" && taken.every((t) => Math.abs(Math.atan2(Math.sin(t + Math.PI / 4), Math.cos(t + Math.PI / 4))) >= Math.PI / 5)) { angles[0] = -Math.PI / 4; taken.push(-Math.PI / 4); }
    const sorted = taken.map(turn).sort((p, q) => p - q), free = angles.flatMap((t, k) => (t === undefined ? [k] : []));
    const gaps = sorted.length ? sorted.map((t, k) => ({ start: t, size: k + 1 < sorted.length ? sorted[k + 1] - t : sorted[0] + 2 * Math.PI - t, n: 0 })) : [{ start: -Math.PI / 2, size: 2 * Math.PI, n: 0 }];
    for (const _ of free) gaps.reduce((best, g) => (g.size / (g.n + 1) > best.size / (best.n + 1) + 1e-6 ? g : best)).n++;
    let next = 0;
    for (const g of gaps) for (let k = 0; k < g.n; k++) angles[free[next++]] = g.start + (g.size * (k + 1)) / (g.n + 1);
    const r = 0.5 * B * scaleOf(a);
    return sign + list.map(([type, represent], k) => symbol([X[0] + r * Math.cos(angles[k]!), X[1] + r * Math.sin(angles[k]!)], type, represent)).join("");
  }

  // Arrows: each written twice, as ChemDraw 22 does (spec 11): the arrow, and a legacy line or arc graphic that
  // points at it with SupersededBy. Curved arrows store their circle as a frame and a signed sweep (spec 10.2).
  const legacyOf = new Map<number, number>();
  const arrowOut = (a: Arrow, derived: boolean) => {
    const id = derived ? fresh() : idOf.get(a.id)!, S = at(a.from), T = at(a.to);
    // Head sizes in hundredths of the line width (HeadSize, ArrowheadCenterSize, ArrowheadWidth).
    const hs = headSize(a), h100 = (x: HeadSize) => [x.length, x.centre, x.width].map((v) => Math.round(v * 100));
    let head: string | undefined, tail: string | undefined, type = "Solid", spacing: number | undefined, nogo: string | undefined, sizes = h100(hs);
    if (takesHeads(a)) {
      const h = headsOf(a);
      [head, tail, type, nogo] = [HEADS[h.end], HEADS[h.start], HEAD_SHAPES[a.head ?? "solid"], a.kind === "nogo" ? "Cross" : a.kind === "hash" ? "Hash" : undefined];
    } else if (a.kind === "equilibrium") [head, tail, type, spacing] = ["HalfLeft", "HalfLeft", HEAD_SHAPES[a.head ?? "solid"], Math.round((0.22 * B * 100) / line)];
    else if (a.kind === "retro") [head, type, spacing, sizes] = ["Full", "Angle", Math.round((0.18 * B * 100) / line), [1000, 1000, 250 + (18 * B) / line].map((v) => Math.round((v * hs.length) / 10))];
    else if (a.kind === "block") [head, type, spacing] = ["Full", "Hollow", Math.round((a.shaft ?? hs.length) * 100)];
    const arc = (curved(a) || a.point) && a.bend ? circle(S, at(bendPoint(a)), T) : undefined;
    let frame: Record<string, string>, angular: number | undefined, path: P[];
    if (arc) {
      // The sweep from tail to head that passes the arc's middle, in the page's angles; AngularSize is minus it.
      const { O, r } = arc, ang = (q: P) => Math.atan2(q[1] - O[1], q[0] - O[0]), M = at(bendPoint(a));
      let sweep = turn(ang(T) - ang(S));
      if (turn(ang(M) - ang(S)) > sweep) sweep -= 2 * Math.PI;
      angular = (-sweep * 180) / Math.PI;
      frame = { Center3D: pt3(O), MajorAxisEnd3D: pt3([O[0] + r, O[1]]), MinorAxisEnd3D: pt3([O[0], O[1] + r]) };
      path = Array.from({ length: 33 }, (_, k) => { const t = ang(S) + (sweep * k) / 32; return [O[0] + r * Math.cos(t), O[1] + r * Math.sin(t)] as P; });
    } else {
      const d = sub(T, S);
      frame = { Center3D: pt3(S), MajorAxisEnd3D: pt3([S[0] + d[0], S[1] + d[1]]), MinorAxisEnd3D: pt3([S[0] - d[1], S[1] + d[0]]) };
      path = [S, T];
    }
    const kind = kindOf({ arc: !!arc, head, tail, type, spacing: !!spacing, nogo, dipole: a.kind === "dipole" });
    const lineType = a.style === "dashed" ? "Dashed" : a.style === "bold" ? "Bold" : a.style === "wavy" ? "Wavy" : undefined;
    const f = scaleOf(a), lines = ownLines(f, a.width), box = boxOf(path, head || tail ? (sizes[a.kind === "block" ? 1 : 2] * line * f) / 100 : (line * f) / 2), z = Z(), legacy = fresh(), c = colour(a.colour);
    // A catalytic cycle's arrow goes in the cycle's group, and names its cycle so Octet reads the group back.
    const cycle = derived ? (a as Arrow & { cycle?: number }).cycle : undefined, item = derived ? cycle : a.id;
    const tag = cycle !== undefined && idOf.has(cycle) ? priv({ d: 1, cycle: idOf.get(cycle), branch: (a as Arrow & { branch?: number }).branch }) : DERIVED;
    legacyOf.set(a.id, legacy);
    // The legacy copy: a line from head to tail, or an arc from the head round its centre, with the old arrow type.
    const legacyType = a.kind === "equilibrium" ? "Equilibrium" : a.kind === "retro" ? "RetroSynthetic" : a.kind === "block" ? "Hollow" : head === "Full" && tail === "Full" ? "Resonance"
      : head === "Full" || (!head && tail === "Full") ? "FullHead" : head || tail ? "HalfHead" : undefined;
    const flip = !arc && !head && !!tail, snapped = arc ? [90, 120, 180, 270].reduce((best, s) => (Math.abs(Math.abs(angular!) - s) < Math.abs(Math.abs(angular!) - best) ? s : best)) * (head && angular! < 0 ? -1 : 1) : undefined;
    put(el("graphic", { id: legacy, SupersededBy: id, BoundingBox: arc ? `${pt(T)} ${pt(arc.O)}` : flip ? `${pt(S)} ${pt(T)}` : `${pt(T)} ${pt(S)}`, Z: z, color: c, LineType: lineType, ...lines,
      GraphicType: arc ? "Arc" : "Line", ArrowType: legacyType, HeadSize: sizes[0], AngularSize: snapped, Octet: derived ? tag : undefined }), 3, box, item);
    // A block arrow's fill: ChemDraw's FillType (faded, which CDXML cannot name, as shaded and in Octet's data).
    const fill = a.kind === "block" && a.fill ? a.fill : undefined;
    put(el("arrow", {
      id, BoundingBox: boxText(box), Z: z, color: c, LineType: lineType, FillType: fill === "solid" ? "Solid" : fill ? "Shaded" : "None", ArrowheadHead: head, ArrowheadTail: tail, ArrowheadType: type, ...lines,
      HeadSize: sizes[0], ArrowheadCenterSize: sizes[1], ArrowheadWidth: sizes[2], ArrowShaftSpacing: spacing, ArrowEquilibriumRatio: a.kind === "equilibrium" && a.ratio && a.ratio !== 1 ? Math.round(a.ratio * 100) : undefined,
      NoGo: nogo, Dipole: a.kind === "dipole" ? "yes" : undefined, AngularSize: angular === undefined ? undefined : fmtAngle(angular),
      Head3D: pt3(T), Tail3D: pt3(S), ...frame, Octet: derived ? tag : priv({ kind: kind === a.kind ? undefined : a.kind, style: a.style === "doubled" ? "doubled" : undefined, bend: arc ? a.bend : undefined, point: a.point, fill: fill === "faded" ? "faded" : undefined, grid: gridOf(a.id), scale: ownScale(a), role: a.role }),
    }), 6, box, item);
  };
  for (const a of mol.arrows ?? []) {
    zOrder = a.order;
    // A pen curve, or a fragmentation line with corners (a curve of straight runs, with Octet's kind).
    if ((a.kind === "curve" || a.kind === "cut") && a.curve) { if (!(a.curve.closed && a.fill)) curveOut(a); }
    else if (a.kind !== "orbital") arrowOut(a, false);
  }
  // The editor gives every cycle's arrows; only those of the cycles written here go out (issue 30).
  const written = new Set((mol.cycles ?? []).map((c) => c.id));
  for (const a of opts.derived ?? []) {
    const cycle = (a as Arrow & { cycle?: number }).cycle;
    if (cycle !== undefined && !written.has(cycle)) continue;
    zOrder = a.order; if (a.kind !== "orbital" && a.kind !== "curve") arrowOut(a, true);
  }

  // Captions: style runs (spec 8.1), the caption's own style as the text's caption style, and the anchor by its
  // alignment. Captions Octet places itself (under a structure, on an arrow) are written where Octet would put them;
  // conditions placed by hand where they are, marked so Octet keeps them there.
  const captions = [...(mol.captions ?? [])].sort((p, q) => p.id - q.id);
  const stacked = new Map<string, number>(), kept: string[] = [];
  // A live property's basis: its atoms' nodes and the bonds between them.
  const basis = (atoms: Set<number>) => [...[...atoms].sort((p, q) => p - q).map((i) => nodeId.get(i)), ...mol.bonds.flatMap((b, n) => (atoms.has(b.atoms[0]) && atoms.has(b.atoms[1]) ? [bondId[n]] : []))].join(" ");
  // Conditions placed by hand stay where they are (placedAt), and the others on their side stack out past them. Those
  // stack away from their arrow in the order Octet draws them (placeCaptions): compound numbers first, then by id.
  // Each one's distance (pt) past the gap.
  const besides = new Map<string, number>(), further = new Map<number, number>();
  for (const c of captions) {
    const arrow = c.on && mol.arrows?.find((a) => a.id === c.on!.arrow), hand = placedAt(c, mol.arrows);
    if (!arrow || !hand) continue;
    // How far it reaches from the arrow on its side, as placeCaptions measures it.
    const size = c.size ?? style.captionSize, q = at(hand), S = at(arrow.from), T = at(arrow.to), mid: P = [(S[0] + T[0]) / 2, (S[1] + T[1]) / 2], d = sub(T, S), above = c.on!.side === "above";
    const w = Math.max(...c.text.split("\n").map((l) => widthOf(l, size))), offs = lineOffsets(c, size, 1), own = c.align === "justify" ? "left" : c.align ?? "centre";
    const left = own === "left" ? q[0] : own === "right" ? q[0] - w : q[0] - w / 2, key = `${arrow.id} ${c.on!.side}`;
    const reach = Math.abs(d[0]) >= 0.5 * len(d) ? (above ? mid[1] - (q[1] - ASCENT * size) : q[1] + offs[offs.length - 1] + DESCENT * size - mid[1]) : above ? mid[0] - left : left + w - mid[0];
    besides.set(key, Math.max(besides.get(key) ?? 0, reach + 0.2 * size - GAP_ARROW_PT * scaleOf(arrow)));
  }
  for (const c of [...captions].sort((p, q) => Number(isNumber(q)) - Number(isNumber(p)) || p.id - q.id)) {
    if (!c.on || !mol.arrows?.some((a) => a.id === c.on!.arrow) || placedAt(c, mol.arrows)) continue;
    const size = c.size ?? style.captionSize, key = `${c.on.arrow} ${c.on.side}`, used = besides.get(key) ?? 0;
    further.set(c.id, used);
    const offs = lineOffsets(c, size, 1);
    besides.set(key, used + offs[offs.length - 1] + (LINE + 0.2) * size);
  }
  for (const c of captions) {
    zOrder = c.order;
    const size = c.size ?? style.captionSize, own = c.align === "justify" ? "left" : c.align ?? "centre", lines = c.text.split("\n").length;
    let [x, y] = [c.x, c.y], align = own;
    const arrow = c.on && mol.arrows?.find((a) => a.id === c.on!.arrow), hand = arrow && placedAt(c, mol.arrows);
    const atoms = (c.under ?? []).filter((i) => i < mol.atoms.length);
    if (hand) [x, y] = hand;
    else if (atoms.length) {
      const xs = atoms.map((i) => mol.atoms[i].location[0]), key = [...atoms].sort((p, q) => p - q).join(" "), k = stacked.get(key) ?? 0;
      stacked.set(key, k + lines);
      x = align === "left" ? Math.min(...xs) - 0.3 : align === "right" ? Math.max(...xs) + 0.3 : (Math.min(...xs) + Math.max(...xs)) / 2;
      y = Math.min(...atoms.map((i) => mol.atoms[i].location[1])) - 0.3 - (15 + 0.905 * size + k * 1.2 * size) / B;
    } else if (arrow) {
      // As Octet draws conditions: centred over an arrow within 60° of level, else ending left of it (above) or starting
      // right of it (below), GAP_ARROW_PT clear, each further out than the last on its side (REL-15).
      const mid: P = [(arrow.from[0] + arrow.to[0]) / 2, (arrow.from[1] + arrow.to[1]) / 2], d = sub(arrow.to, arrow.from), flat = Math.abs(d[0]) >= 0.5 * len(d);
      const above = c.on!.side === "above", gap = GAP_ARROW_PT * scaleOf(arrow) + (further.get(c.id) ?? 0), offs = lineOffsets(c, size, 1), block = offs[offs.length - 1];
      align = flat ? "centre" : above ? "right" : "left";
      x = flat ? mid[0] : mid[0] + ((above ? -1 : 1) * gap) / B;
      y = mid[1] + (flat ? (above ? gap + DESCENT * size + block : -(gap + ASCENT * size)) : (DESCENT * size) / 2 - (ASCENT * size - block) / 2) / B;
    }
    // Text Octet draws as a formula is written as the runs it is drawn with, so ChemDraw shows Pd(PPh₃)₄ as the page
    // does (issue 31, decision 0022). formula marks them as Octet's own, so Octet reads the caption back as plain text.
    const auto = !c.runs?.length && formulaCaption(c) ? formulaTextRuns(c.text) : undefined, formula = auto && styled(auto) ? 1 : undefined;
    const p = at([x, y]), runs: TextRun[] = formula ? auto! : runsOf(c), whole: RunStyle = { bold: c.bold || undefined, italic: c.italic || undefined, underline: c.underline || undefined };
    const width = Math.max(...c.text.split("\n").map((l) => widthOf(l, size))), left = align === "left" ? p[0] : align === "right" ? p[0] - width : p[0] - width / 2;
    const level: Box = [left, p[1] - 0.716 * size, left + width, p[1] + (lines - 1) * 1.15 * size + 0.212 * size];
    // A turned caption turns about p; its box goes round it.
    const box = turnedBox(level, p, c.angle);
    const just = c.align === "justify" && align === own ? "Full" : align === "centre" ? "Center" : align === "right" ? "Right" : undefined, cf = face(whole);
    put(el("t", {
      id: idOf.get(c.id)!, p: pt(p), BoundingBox: boxText(box), Z: Z(), color: colour(c.colour), CaptionFont: c.font ? font(c.font) : undefined, CaptionSize: c.size, CaptionFace: cf || undefined,
      WordWrapWidth: c.width ? Math.round(c.width * B) : undefined,
      // Line spacing as ChemDraw writes it: a text's LineHeight is auto or pt, and Variable is its caption style's.
      CaptionJustification: just, Justification: just, LineHeight: c.lineHeight === "variable" ? undefined : typeof c.lineHeight === "number" ? fmtSize(c.lineHeight) : "auto",
      CaptionLineHeight: c.lineHeight === "variable" ? "variable" : undefined, InterpretChemically: c.chemical === false ? "no" : undefined, RotationAngle: rotationAngle(c.angle),
      Octet: priv({ under: c.under?.map((i) => nodeId.get(i)).filter((n) => n !== undefined), cycle: c.cycle && { ...c.cycle, cycle: idOf.get(c.cycle.cycle) }, xy: x !== c.x || y !== c.y ? [c.x, c.y] : undefined, placed: hand ? 1 : undefined,
        align: align !== own ? c.align ?? "centre" : undefined, width: c.width && Math.round(c.width * B) / B !== c.width ? c.width : undefined, role: c.role, formula, auto: c.auto ? 1 : undefined }),
    }, runs.map((r) => run(r.text, { font: r.font ?? c.font ?? style.captionFont, size: r.size ?? size, colour: r.colour ?? c.colour, face: face({ ...whole, ...r }) })).join("")), 2, box, c.id);
    if (c.property) {
      const atoms = new Set(c.property.atoms.filter((i) => i < mol.atoms.length));
      if (atoms.size) kept.push(el("chemicalproperty", { id: fresh(), ChemicalPropertyDisplayID: idOf.get(c.id), ...c.property.attrs, PositioningType: "absolute", PositioningOffset: pt(p), BasisObjects: basis(atoms) }));
    }
  }
  // Reaction schemes: each reaction Octet finds (structures, plus signs and arrows in a row) as a scheme with a step
  // per arrow, listing fragments, the legacy arrow graphic, conditions above and below, and atom maps (spec 14).
  const schemes: string[] = [], done = new Set<number>(), arrows = mol.arrows ?? [];
  const ink = (atoms: number[]): Box => { const xs = atoms.map((i) => mol.atoms[i].location[0]), ys = atoms.map((i) => mol.atoms[i].location[1]); return [Math.min(...xs) - 0.3, Math.min(...ys) - 0.3, Math.max(...xs) + 0.3, Math.max(...ys) + 0.3]; };
  const captionBox = (id: number): Box | undefined => {
    const c = captions.find((x) => x.id === id), size = (c?.size ?? style.captionSize) / B;
    if (!c || c.under || c.on || c.cycle) return undefined;
    const w = widthOf(c.text, c.size ?? style.captionSize) / B, x0 = c.align === "left" ? c.x : c.align === "right" ? c.x - w : c.x - w / 2;
    return [x0, c.y - 0.2 * size, x0 + w, c.y + 0.7 * size];
  };
  type RowStep = NonNullable<ReturnType<typeof findReaction>>["steps"][number];
  // Conditions: the text kept on the arrow, and the structures drawn above and below it (findReaction's conditions).
  const step = (arrowId: number, before: RowStep[], after: RowStep[], drawn?: { above: RowStep[]; below: RowStep[] }) => {
    const frag = (s: RowStep[]) => s.flatMap((x) => (x.kind === "structure" ? [fragId.get(x.atoms[0])!] : []));
    const list = (ids: number[]) => (ids.length ? ids.join(" ") : undefined);
    const on = (side: "above" | "below") => [...captions.filter((c) => c.on?.arrow === arrowId && c.on.side === side).map((c) => idOf.get(c.id)!), ...frag(drawn?.[side] ?? [])];
    const mapped = (s: RowStep[]) => s.flatMap((x) => (x.kind === "structure" ? x.atoms.filter((i) => mol.atoms[i].map) : []));
    const pairs = mapped(before).flatMap((i) => { const j = mapped(after).find((k) => mol.atoms[k].map === mol.atoms[i].map); return j === undefined ? [] : [nodeId.get(i)!, nodeId.get(j)!]; });
    return el("step", {
      id: fresh(), ReactionStepReactants: list(frag(before)), ReactionStepProducts: list(frag(after)), ReactionStepPlusses: list([...before, ...after].flatMap((x) => (x.kind === "plus" ? [idOf.get(x.id)!] : []))),
      ReactionStepArrows: legacyOf.get(arrowId), ReactionStepObjectsAboveArrow: list(on("above")), ReactionStepObjectsBelowArrow: list(on("below")), ReactionStepAtomMapManual: list(pairs),
    });
  };
  for (const a of arrows) {
    if (!straightArrow(a) || done.has(a.id)) continue;
    const r = findReaction(mol, a.id, arrows, ink, captionBox);
    if (!r) continue;
    const at = r.steps.flatMap((s, k) => (s.kind === "arrow" ? [k] : []));
    schemes.push(el("scheme", { id: fresh() }, at.map((k, n) => {
      const id = (r.steps[k] as { id: number }).id;
      done.add(id);
      return step(id, r.steps.slice(n ? at[n - 1] + 1 : 0, k), r.steps.slice(k + 1, n + 1 < at.length ? at[n + 1] : r.steps.length), r.conditions.get(id));
    }).join("")));
  }
  for (const a of arrows) if (!done.has(a.id) && legacyOf.has(a.id) && captions.some((c) => c.on?.arrow === a.id)) schemes.push(el("scheme", { id: fresh() }, step(a.id, [], [])));

  // Each spectrum where ChemDraw had it, or else under everything on the page, as wide as that (3 inches at least),
  // one under another.
  let below = union(outs.map((o) => o.box));
  for (const s of spectra) {
    const o = spectrumObject(s), w = below ? Math.max(216, below[2] - below[0]) : 360, x0 = below ? below[0] : cx - w / 2, y0 = below ? below[3] + 2 * B : cy - 0.2 * w;
    const box: Box = s.box ? [...at([s.box[0], s.box[3]]), ...at([s.box[2], s.box[1]])] as Box : [x0, y0, x0 + w, y0 + 0.4 * w];
    if (!s.box) below = box;
    const linked = s.groups.filter((g) => [...mol.atoms, ...mol.bonds].some((a) => a.peaks?.includes(g.id))).map((g) => assignTag(g.id)).join("");
    put(el("spectrum", { id: fresh(), BoundingBox: boxText(box), Z: Z(), ...o.attrs }, o.text + el("objecttag", { id: fresh(), TagType: "String", Name: OWN_TAG, Value: o.own }) + linked), 4.6, box);
  }

  zOrder = undefined;
  // Groups hold their structures and objects, inner groups first, each in the group round it (with its own Integral).
  const RANKED = (list: Out[]) => [...list].sort((p, q) => p.rank - q.rank);
  for (const k of innerFirst) {
    const g = groups[k], kids = outs.filter((o) => o.group === g.id), box = union(kids.map((o) => o.box));
    if (!kids.length || !box) continue;
    for (const o of kids) o.group = -1;
    const parent = parentOf[k];
    outs.push({ xml: el("group", { id: idOf.get(g.id)!, BoundingBox: boxText(box), Z: Z(), Integral: g.integral ? "yes" : undefined, Octet: g.plot ? priv({ plot: g.plot }) : undefined }, RANKED(kids).map((o) => o.xml).join("") + notes(g.annotations)), rank: 0, box, group: parent === undefined ? undefined : groups[parent].id });
  }
  const top = outs.filter((o) => o.group !== -1), all = union(top.map((o) => o.box)) ?? [0, 0, 0, 0];
  // A cycle's side arrows name their structures' atoms by node id; those are also saved as sides, for Octet 1.0.29.
  const ids = (atoms?: number[]) => atoms?.map((i) => nodeId.get(i)).filter((v) => v !== undefined);
  const cycles = (mol.cycles ?? []).map((c: Cycle) => ({ id: idOf.get(c.id), centre: c.centre, radius: c.radius, clockwise: c.clockwise, nodes: c.nodes.map(ids), at: c.at, colour: c.colour, width: c.width, gap: c.gap, scale: c.scale, order: c.order, head: c.head, arrowSize: c.arrowSize,
    steps: c.steps?.some(Boolean) ? c.steps : undefined, branches: c.branches?.map((b) => ({ ...b, ...(b.in ? { in: { ...b.in, atoms: ids(b.in.atoms) } } : {}), ...(b.out ? { out: { ...b.out, atoms: ids(b.out.atoms) } } : {}) })),
    sides: c.branches?.flatMap((b) => (["in", "out"] as const).flatMap((side) => (b[side]?.atoms?.length ? [{ side, atoms: ids(b[side]!.atoms) }] : []))).slice(0, 32) }));
  const pageXml = el("page", { id: fresh(), BoundingBox: `0 0 ${fmt(W)} ${fmt(H)}`, HeaderPosition: 36, FooterPosition: 36, PrintTrimMarks: "yes", HeightPages: 1, WidthPages: 1 }, RANKED(top).map((o) => o.xml).join("") + schemes.join("") + kept.join("") + notes(mol.annotations));
  const doc = colour(style.colour) ?? 0, bg = style.background.startsWith("#") ? colour(style.background)! : 1;
  // The document's palette goes in its colour table, as ChemDraw keeps a document's colours there.
  for (const c of style.palette ?? []) colour(c.hex);
  const rgb = (c: string) => [1, 3, 5].map((k) => fmtColour(parseInt(c.slice(k, k + 2), 16) / 255));
  const tables = `<colortable>\n${colours.map((c) => { const [r, g, b] = rgb(c); return `<color r="${r}" g="${g}" b="${b}"/>`; }).join("\n")}\n</colortable><fonttable>\n${fonts.map((f, k) => `<font id="${k + 1}" charset="${CHARSET}" name="${escAttr(f)}"/>`).join("\n")}\n</fonttable>`;
  const root = el("CDXML", {
    CreationProgram: PROGRAM, Name: opts.name ?? "Untitled Document", BoundingBox: boxText(all), WindowPosition: "0 0", WindowSize: "0 0", FractionalWidths: "yes", InterpretChemically: style.interpret === false ? "no" : "yes",
    ShowAtomQuery: "yes", ShowAtomStereo: "no", ShowAtomEnhancedStereo: "yes", ShowAtomNumber: "no", ShowResidueID: "no", ShowBondQuery: "yes", ShowBondRxn: "yes", ShowBondStereo: "no",
    ShowTerminalCarbonLabels: style.terminalLabels ? "yes" : "no", ShowNonTerminalCarbonLabels: style.carbonLabels ? "yes" : "no", HideImplicitHydrogens: style.hideH ? "yes" : "no", LabelFont: font(style.labelFont), LabelSize: fmtSize(style.labelSize), LabelFace: 96,
    CaptionFont: font(style.captionFont), CaptionSize: fmtSize(style.captionSize), HashSpacing: fmt(style.hash), MarginWidth: fmt(style.margin), LineWidth: fmt(style.line), BoldWidth: fmt(style.bold),
    BondLength: fmt(style.bond), BondSpacing: fmtSize(style.spacing), ChainAngle: fmt(style.chainAngle), LabelJustification: "Auto", CaptionJustification: "Left", AminoAcidTermini: "HOH", ShowSequenceTermini: "yes",
    ShowSequenceBonds: "yes", ShowSequenceUnlinkedBranches: "no", ResidueWrapCount: 40, ResidueBlockCount: 10, PrintMargins: "36 36 36 36",
    ChemPropName: "", ChemPropFormula: "Chemical Formula: ", ChemPropExactMass: "Exact Mass: ", ChemPropMolWt: "Molecular Weight: ", ChemPropMOverZ: "m/z: ", ChemPropAnalysis: "Elemental Analysis: ",
    ChemPropBoilingPt: "Boiling Point: ", ChemPropMeltingPt: "Melting Point: ", ChemPropCritTemp: "Critical Temp: ", ChemPropCritPres: "Critical Pres: ", ChemPropCritVol: "Critical Vol: ",
    ChemPropGibbs: "Gibbs Energy: ", ChemPropLogP: "Log P: ", ChemPropMR: "MR: ", ChemPropHenry: "Henry's Law: ", ChemPropEForm: "Heat of Form: ", ChemProptPSA: "tPSA: ", ChemPropID: "", ChemPropFragmentLabel: "",
    color: doc, bgcolor: bg, RxnAutonumberStart: 1, RxnAutonumberConditions: "no", RxnAutonumberStyle: "Roman", RxnAutonumberFormat: "(#)",
    Octet: priv({ v: 1, app: pkg.version, xyz: 1, page: style.page, custom: style.custom, landscape: style.landscape || undefined, edges: style.edges ? undefined : false, grid: style.grid === "bond" ? undefined : style.grid, scale: style.scale !== 1 ? style.scale : undefined, purpose: style.purpose,
      background: style.background === "white" ? undefined : style.background, cycles: cycles.length ? cycles : undefined, palette: style.palette, guides: mol.guides }),
  }, tables + pageXml);
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "http://www.cambridgesoft.com/xml/cdxml.dtd" >\n${root}\n`;
}

// The selected part of a drawing: those atoms, the bonds between them, and those objects, with references kept
// only where what they name came too.
function pick(m: Mol, sel: { atoms: Iterable<number>; items: Iterable<number> }): Mol {
  const atoms = new Set([...sel.atoms].filter((i) => i >= 0 && i < m.atoms.length)), items = new Set(sel.items), map = new Map<number, number>();
  m.atoms.forEach((_, i) => { if (atoms.has(i)) map.set(i, map.size); });
  const keep = (ids: number[]) => ids.filter((i) => map.has(i)).map((i) => map.get(i)!);
  const arrows = (m.arrows ?? []).filter((a) => items.has(a.id)), cycles = (m.cycles ?? []).filter((c) => items.has(c.id)).map((c) => ({ ...keepAngles(m, mapBranches(c, (i) => map.get(i))), nodes: c.nodes.map(keep) }));
  // Kept data goes with its object only when its atoms all come too.
  const kept = (k?: Kept) => (k && k.atoms.every((i) => map.has(i)) ? { ...k, atoms: keep(k.atoms) } : undefined);
  const captions = (m.captions ?? []).filter((c) => items.has(c.id) && (!c.cycle || cycles.some((y) => y.id === c.cycle!.cycle))).map((c) => {
    const out: Caption = { ...c, under: c.under && keep(c.under), property: kept(c.property) };
    if (!out.under?.length) delete out.under;
    if (!out.property) delete out.property;
    if (c.on && !arrows.some((a) => a.id === c.on!.arrow)) { delete out.on; delete out.placed; }
    return out;
  });
  const shapes = (m.shapes ?? []).filter((s) => items.has(s.id)), ids = new Set([...arrows, ...cycles, ...captions, ...shapes].map((x) => x.id));
  const groups = (m.groups ?? []).map((g) => ({ ...g, atoms: keep(g.atoms), items: g.items.filter((id) => ids.has(id)) }));
  const fills = (m.fills ?? []).filter((f) => f.atoms.every((i) => map.has(i))).map((f) => ({ ...f, atoms: keep(f.atoms) }));
  return tidyGroups({ atoms: m.atoms.filter((_, i) => map.has(i)).map((a) => renumberCentre(a, map)), bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] })), captions, arrows, shapes, cycles, groups, ...(fills.length ? { fills } : {}) });
}

// ---------------------------------------------------------------------------------------------------------------
// Reading. The file is hostile until checked: sizes and nesting are capped by the XML reader, every number is
// checked and bounded, and what Octet cannot hold is counted in `lost` (by what it was) instead of half-read.

export type CdxmlRead = { mol: Mol; style: DocStyle; lost: Record<string, number> };
// A picture's data, in the order ChemDraw writes it: each format's bytes in hex, the sizes of compressed ones, its turn.
export const PICTURE_HEX = ["MacPICT", "PDF", "WindowsMetafile", "EnhancedMetafile", "OLEObject", "CompressedMacPICT", "CompressedWindowsMetafile", "CompressedEnhancedMetafile", "CompressedOLEObject", "GIF", "TIFF", "PNG", "JPEG", "BMP"];
const PICTURE_INT = ["UncompressedMacPICTSize", "UncompressedWindowsMetafileSize", "UncompressedEnhancedMetafileSize", "UncompressedOLEObjectSize", "RotationAngle"];
export const PICTURE_KEYS = [...PICTURE_HEX, ...PICTURE_INT];
// What Octet keeps of a live property text.
export const PROPERTY_ATTRS = ["ChemicalPropertyType", "ChemicalPropertyIsActive", "Name"];
// A bond's own settings that Octet keeps as they came when they do not make a scale (decision 0007).
export const OWN_BOND_ATTRS = ["BondLength", "HashSpacing", "LineWidth", "BoldWidth", "MarginWidth"];
// A picture's data, if it is sound: known keys, bytes where bytes belong, whole numbers elsewhere, and some picture.
// Bytes are kept as uppercase hex, as ChemDraw on the Mac refuses a file with base64 picture data.
export function readPictureData(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    const sound = typeof x !== "string" ? undefined : PICTURE_HEX.includes(k) ? pictureHex(x) : PICTURE_INT.includes(k) && /^-?\d{1,10}$/.test(x) ? x : undefined;
    if (sound === undefined) return undefined;
    out[k] = sound;
  }
  return PICTURE_HEX.some((k) => out[k]) ? out : undefined;
}
// Picture bytes as uppercase hex, from hex or from padded base64 (as a ChemDraw 21 file from Windows holds it),
// with spaces, tabs and line breaks ignored. A value that is both is hex. Undefined if it is neither.
export function pictureHex(v: string): string | undefined {
  if (v.length % 2 === 0 && /^[0-9A-F]*$/.test(v)) return v;
  const s = v.replace(/[ \t\r\n]+/g, "");
  if (s.length % 2 === 0 && /^[0-9A-Fa-f]*$/.test(s)) return s.toUpperCase();
  if (s.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return undefined;
  const t = atob(s), out = new Uint8Array(t.length * 2);
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); out[2 * i] = HEX_CODES[c >> 4]; out[2 * i + 1] = HEX_CODES[c & 15]; }
  return new TextDecoder().decode(out);
}
const HEX_CODES = Array.from("0123456789ABCDEF", (c) => c.charCodeAt(0));
const MAX_ATOMS = 100_000, MAX_OBJECTS = 10_000, MAX_TEXT = 2_000, MAX_LABEL = 40;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d{1,3})?$/;
const real = (s?: string) => { const t = s?.trim(); if (!t || !NUMBER.test(t)) return undefined; const v = Number(t); return Math.abs(v) < 1e7 ? v : undefined; };
const reals = (s: string | undefined, n: number) => { const v = (s ?? "").trim().split(/\s+/).slice(0, n).map(real); return v.length === n && v.every((x) => x !== undefined) ? (v as number[]) : undefined; };
// Integers are read up to the first character that is not a digit, as ChemDraw reads them (spec 1.2).
const int = (s?: string) => { const m = /^\s*([+-]?\d{1,10})/.exec(s ?? ""); return m ? Number(m[1]) : undefined; };
const yes = (s?: string) => s === "yes" || s === "true";
const idList = (s?: string) => (s ?? "").trim().split(/\s+/).slice(0, 100_000).map(int).filter((v): v is number => v !== undefined);
const isColour = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
// Text Octet can hold: no control characters but line breaks, tabs as spaces.
const cleanText = (s: string) => s.replace(/\t/g, " ").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "");

// A font name as one of Octet's fonts, or as the family named, with the bold or italic its name carries ("Arial Bold
// Italic"). The Symbol font is left out: its runs are read as the characters it draws (symbolRuns).
function fontOf(name?: string): { font?: string; bold?: true; italic?: true } {
  if (!name) return {};
  const family = name.replace(/\b(Bold|Black|Heavy|Italic|Oblique|Regular|MT|PSMT)\b/gi, "").replace(/[-,]/g, " ").trim().replace(/\s+/g, " "), base = family.toLowerCase();
  const font = FONTS.find((f) => f.toLowerCase() === base) ?? (base === "times" ? "Times New Roman" : base.startsWith("helvetica") ? "Helvetica" : base.startsWith("arial") ? "Arial" : !isSymbolFont(family) && fontName(family) ? family : undefined);
  return { font, ...(/\b(Bold|Black|Heavy)\b/i.test(name) ? { bold: true as const } : {}), ...(/\b(Italic|Oblique)\b/i.test(name) ? { italic: true as const } : {}) };
}

// A table from Octet's own data, if it is sound (the same limits as Octet's file format).
function readTable(v: unknown): Table | undefined {
  const t = v as Record<string, unknown>, list = (x: unknown, most: number, ok: (y: unknown) => boolean) => x === undefined || (Array.isArray(x) && x.length <= most && x.every(ok));
  if (!t || typeof t !== "object" || !Array.isArray(t.cells) || !t.cells.length || t.cells.length > 100) return undefined;
  if (!t.cells.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 20 && r.every((c) => typeof c === "string" && c.length <= 500 && !/[\u0000-\u0009\u000b-\u001f]/.test(c)))) return undefined;
  const size = (n: unknown) => isNum(n, 0.002, 5000);
  if (!list(t.widths, 20, size) || !list(t.heights, 100, size) || !list(t.lines, 7, (x) => ["top", "bottom", "left", "right", "header", "rows", "cols"].includes(x as string))
    || !list(t.align, 20, (x) => ["left", "centre", "right"].includes(x as string)) || (t.weight !== undefined && !isNum(t.weight, 0.001, 1000)) || (t.grid !== undefined && t.grid !== true)) return undefined;
  return {
    cells: t.cells as string[][], ...(t.grid ? { grid: true } : {}), ...(t.widths ? { widths: t.widths as number[] } : {}), ...(t.heights ? { heights: t.heights as number[] } : {}),
    ...(t.lines ? { lines: [...new Set(t.lines as TableLine[])] } : {}), ...(t.align ? { align: t.align as Table["align"] } : {}), ...(t.weight !== undefined ? { weight: t.weight as number } : {}),
  };
}

// Symbol runs (ChemDraw's Greek, arrows and maths as Latin bytes in the Symbol font, issue 21) as the characters
// ChemDraw draws, in the tree, so every reader of text runs gets them. A mapped run takes the font of the run before it
// that is not Symbol, else of the run after it, else its text's own caption or label font, else the document's. Its
// face, size and colour stay. A text with a byte the font has no glyph for counts one lost character.
function symbolRuns(root: Xml, fonts: Map<number, string>, lose: (what: string) => void) {
  const charset = new Map<number, number>();
  for (const f of root.kids.find((k) => k.name === "fonttable")?.kids.slice(0, 4096) ?? []) {
    const id = int(f.attrs.id);
    if (id !== undefined && isSymbolFont(fonts.get(id))) charset.set(id, charsetCode.get(f.attrs.charset ?? "") ?? 10000);
  }
  if (!charset.size) return;
  const symbolic = (x: Xml) => x.name === "s" && charset.has(int(x.attrs.font) ?? -1);
  const stack = [root];
  while (stack.length) {
    const x = stack.pop()!;
    for (const k of x.kids) stack.push(k);
    if (!x.kids.some(symbolic)) continue;
    const runs = x.kids.filter((k) => k.name === "s"), sym = runs.map(symbolic);
    // The font each run takes: the last plain run's before it, then the first plain run's after it.
    const take: (string | undefined | null)[] = runs.map(() => null);
    let last: string | undefined | null = null;
    runs.forEach((s, k) => { if (sym[k]) take[k] = last; else last = s.attrs.font; });
    last = null;
    for (let k = runs.length - 1; k >= 0; k--) { if (!sym[k]) last = runs[k].attrs.font; else if (take[k] === null) take[k] = last; }
    const own = [x.attrs.CaptionFont, x.attrs.LabelFont].find((f) => f !== undefined && !charset.has(int(f) ?? -1));
    let missing = 0;
    runs.forEach((s, k) => {
      if (!sym[k]) return;
      const r = symbolText(s.text, charset.get(int(s.attrs.font)!)!), font = take[k] === null ? own : take[k];
      s.text = r.text;
      missing += r.missing;
      if (font === undefined) delete s.attrs.font; else s.attrs.font = font;
    });
    if (missing) lose("character");
  }
}

// A CDXML document (ChemDraw's own, or one Octet wrote) as an Octet drawing and its document style. It takes the
// text, or the tree: a CDX file reads as the same tree (cdx.ts).
// Throws an Error with a message for the user when the file is not CDXML, is damaged or is too large.
export function fromCdxml(input: string | Xml): CdxmlRead {
  if (typeof input === "string" && input.length > MAX_CHARS) throw new Error(TOO_BIG);
  if (typeof input === "string" && !/<CDXML[\s>/]/.test(input.slice(0, 65536))) throw new Error(NOT_CDXML);
  const root = typeof input === "string" ? parseXml(input) : input;
  if (root.name !== "CDXML") throw new Error(NOT_CDXML);
  const lost: Record<string, number> = {};
  const lose = (what: string, n = 1) => { lost[what] = (lost[what] ?? 0) + n; };
  const json = (x: Xml): Record<string, unknown> | undefined => {
    try { const v = x.attrs.Octet === undefined ? undefined : JSON.parse(x.attrs.Octet); return v && typeof v === "object" && !Array.isArray(v) ? v : undefined; } catch { return undefined; }
  };
  const top = json(root), octet = top?.v === 1; // Octet wrote this file and ChemDraw has not saved over it
  const priv = (x: Xml) => (octet ? json(x) : undefined);

  // First pass: arrows that can stand for their legacy graphics, graphics that point at an arrow, the largest id.
  const usable = new Set<number>(), superseded = new Set<number>();
  let maxId = 0, atomCount = 0;
  const scan = (x: Xml) => {
    const id = int(x.attrs.id) ?? 0;
    if (id > maxId && id < 2 ** 31) maxId = id;
    if (x.name === "n" && ++atomCount > MAX_ATOMS) throw new Error(TOO_BIG);
    if (x.name === "arrow" && x.attrs.Head3D && x.attrs.Tail3D && x.attrs.Center3D) usable.add(id);
    if (x.name === "graphic" && x.attrs.SupersededBy) superseded.add(int(x.attrs.SupersededBy) ?? 0);
    x.kids.forEach(scan);
  };
  scan(root);

  // Colours and fonts (spec 4 and 5).
  const table: string[] = [], fonts = new Map<number, string>();
  for (const k of root.kids) {
    if (k.name === "colortable") for (const c of k.kids.slice(0, 4096)) {
      const v = ["r", "g", "b"].map((a) => Math.round(Math.min(1, Math.max(0, real(c.attrs[a]) ?? 0)) * 255));
      table.push(`#${v.map(hex).join("")}`);
    }
    if (k.name === "fonttable") for (const f of k.kids.slice(0, 4096)) { const id = int(f.attrs.id); if (id !== undefined && f.attrs.name) fonts.set(id, f.attrs.name.slice(0, 100)); }
  }
  symbolRuns(root, fonts, lose);
  // A colour index as #RRGGBB; black (the default ink) as undefined.
  const colourOf = (s?: string) => {
    const k = int(s), c = k === undefined ? undefined : k === 0 ? "#000000" : k === 1 ? "#FFFFFF" : table[k - 2];
    return c === "#000000" ? undefined : c;
  };

  // The document style, and the page that sets the coordinate frame: its printable area's centre is Octet's 0,0.
  const pages = root.kids.filter((k) => k.name === "page");
  const pb = reals(pages[0]?.attrs.BoundingBox, 4) ?? [0, 0, 540, 720];
  const W = Math.max(1, pb[2] - pb[0]), H = Math.max(1, pb[3] - pb[1]);
  const r = root.attrs, bondPt = real(r.BondLength), B = bondPt && bondPt >= 1 && bondPt <= 200 ? bondPt : 14.4;
  const mm = [((W + 72) * 25.4) / 72, ((H + 72) * 25.4) / 72];
  const paper = Object.entries(PAGES).find(([, [w, h]]) => (Math.abs(w - mm[0]) < 1 && Math.abs(h - mm[1]) < 1) || (Math.abs(h - mm[0]) < 1 && Math.abs(w - mm[1]) < 1));
  const style = readStyle({
    page: paper?.[0] ?? "Custom", landscape: !!paper && mm[0] > mm[1] + 1, custom: mm.map((v) => Math.round(Math.min(2000, Math.max(10, v)) * 100) / 100),
    ...(octet ? { page: top!.page, custom: top!.custom, landscape: top!.landscape === true, edges: top!.edges !== false, grid: top!.grid, background: top!.background, scale: top!.scale, purpose: top!.purpose, palette: top!.palette } : {}),
    bond: B, line: real(r.LineWidth), bold: real(r.BoldWidth), margin: real(r.MarginWidth), hash: real(r.HashSpacing), spacing: real(r.BondSpacing),
    labelFont: fontOf(fonts.get(int(r.LabelFont) ?? -1)).font, labelSize: real(r.LabelSize), captionFont: fontOf(fonts.get(int(r.CaptionFont) ?? -1)).font, captionSize: real(r.CaptionSize),
    colour: colourOf(r.color) ?? "#000000",
    // ChemDraw's document background colour, when it is not white (Octet's own files say which background they have).
    ...(!octet && r.bgcolor !== undefined && colourOf(r.bgcolor) !== "#FFFFFF" ? { background: colourOf(r.bgcolor) ?? "#000000" } : {}),
    terminalLabels: yes(r.ShowTerminalCarbonLabels), carbonLabels: yes(r.ShowNonTerminalCarbonLabels), hideH: yes(r.HideImplicitHydrogens),
    // Interpret Chemically When Possible: on when the file does not say (the spec's default).
    interpret: r.InterpretChemically === undefined || yes(r.InterpretChemically),
    chainAngle: real(r.ChainAngle),
  });
  // Octet's 0,0 is the middle of the page it writes back (ChemDraw rounds an A4 page to 523 by 770 pt, Octet writes
  // 523.28 by 769.89), so everything keeps its place from the page's top left corner through a save.
  const [ow, oh] = printable(style).map((v) => Number(fmt(v))), ox = pb[0] + middle(ow), oy = pb[1] + middle(oh);
  const toOctet = (x: number, y: number): P => [(x - ox) / B, (oy - y) / B];

  // Octet's own angle for a turned shape, when the shape as ChemDraw holds it agrees (to 0.1°); else the one read.
  const exact = (own: unknown, read: number) => (isNum(own, -360, 360) && Math.abs(((((own as number) - read) % 360) + 540) % 360 - 180) < 0.1 ? (own as number) : read);
  // A turned shape set upright (settleShape), with its corners low and high whichever way ChemDraw ran its axes, so
  // it reads back the same once Octet has written it. The corners' order does not change how a shape draws.
  const settled = (sh: Shape & { z: number }): Shape & { z: number } => {
    const s = settleShape(sh) as Shape & { z: number };
    return { ...s, from: [Math.min(s.from[0], s.to[0]), Math.min(s.from[1], s.to[1])], to: [Math.max(s.from[0], s.to[0]), Math.max(s.from[1], s.to[1])] };
  };
  // A table's or TLC plate's text style: a font named, a size in pt, and face bits (bold 1, italic 2, underline 4).
  const textStyleOf = (name: unknown, size: unknown, face: unknown): Partial<Shape> => ({
    ...(typeof name === "string" && fontName(name) && name !== style.captionFont ? { font: name } : {}), ...(isNum(size, 0.1, 999) ? { size: size as number } : {}),
    ...(isNum(face, 0, 0xffff) && (face as number) & 1 ? { bold: true as const } : {}), ...(isNum(face, 0, 0xffff) && (face as number) & 2 ? { italic: true as const } : {}), ...(isNum(face, 0, 0xffff) && (face as number) & 4 ? { underline: true as const } : {}),
  });
  // An object's own line width: its LineWidth over its scale f, when that is not the document's.
  const lineWidthOf = (x: Xml, f = 1) => { const lw = real(x.attrs.LineWidth), w = lw === undefined ? undefined : Math.round((lw / f) * 1e4) / 1e4; return w !== undefined && w >= 0.05 && w <= 20 && Math.abs(w - style.line) > 1e-3 ? w : undefined; };

  // Octet ids: the file's own when Octet wrote it, otherwise numbered afresh.
  const taken = new Set<number>();
  let nextId = octet ? maxId + 1 : 1;
  const newId = (x?: Xml) => {
    const id = x && octet ? int(x.attrs.id) : undefined;
    if (id !== undefined && id > 0 && id < 2 ** 31 && !taken.has(id)) { taken.add(id); return id; }
    while (taken.has(nextId)) nextId++;
    taken.add(nextId);
    return nextId++;
  };

  const mol: Mol = { atoms: [], bonds: [] };
  const captions: (Caption & { z: number })[] = [], arrows: (Arrow & { z: number })[] = [], shapes: (Shape & { z: number })[] = [], grids: Grid[] = [];
  type G = { id: number; atoms: Set<number>; items: number[]; integral?: true; annotations?: Annotation[]; plot?: Plot; parent?: G };
  const groups: G[] = [];
  const nodeIds: number[] = [], bondIds: number[] = [], areas: Xml[] = [];
  // Each bond's own drawing settings (ChemDraw's per-object settings, pt), and each label's size as written.
  const bondSettings: { line?: number; bold?: number; hash?: number; margin?: number; spacing?: number; attrs: Record<string, string> }[] = [], labelSizes = new Map<number, number>(), nodeLines = new Map<number, number>();
  const atomOf = new Map<number, number>(), objectOf = new Map<number, number>(), arrowOfGraphic = new Map<number, number>();
  // Each label: its node, text, node type and isotope, Interpret Chemically off, and its text's justification, stacking and turn.
  // runs: the label's <s> runs as bold, italic and underline (face bits), for a written label whose characters differ.
  const labels: { i: number; text: string; type: string; isotope?: number; plain?: boolean; just?: string; stack?: string; turn?: string; runs?: TextRun[] }[] = [];
  const numH = new Map<number, number>(), delocalised: { k: number; order?: 1 | 2 }[] = [], ovals: { id: number; c: P; r: number }[] = [];
  const bondsToRead: Xml[] = [], symbols: { x: Xml; atoms: number[]; group?: G }[] = [], steps: Xml[] = [], unders: { c: Caption; nodes: unknown }[] = [], anchors = new Map<number, P>();
  // Formula runs read back as plain text (issue 31), kept in case the text is not drawn as a formula after all.
  const asFormula = new Map<Caption, TextRun[]>();
  const brackets: { x: Xml; id: number; z: number; group?: G; ends: number[] }[] = [], properties: Xml[] = [];
  // Query and Markush objects: attachments' atoms (by node id), bracketed groups, R-Logic rows.
  const centres: { i: number; ids: number[]; variable: boolean }[] = [], bracketed: Xml[] = [], logic: Xml[] = [];
  // Stereocentres whose configuration ChemDraw keeps (Geometry Tetrahedral, with a BondOrdering).
  const tetra: { i: number; order: number[] }[] = [];
  const zOf = (x: Xml) => int(x.attrs.Z) ?? 0;
  let fragmentZ = -Infinity; // the highest Z of a structure read so far
  const count = () => { if (captions.length + arrows.length + shapes.length + groups.length > 4 * MAX_OBJECTS) throw new Error(TOO_BIG); };
  // Groups nest: what is in a group is in each group round it too.
  const member = (g: G | undefined, id: number) => { for (let x = g; x; x = x.parent) x.items.push(id); };

  // Measured spectra (ChemDraw's spectrum objects) with the values of their assignment tags, and each atom's and bond's
  // assignment tags, matched to them once everything is read.
  // A tag that holds text (ChemDraw's predicted shift on an atom) links only to a spectrum with a tag of exactly its
  // value; its text is read as a caption (readFragment).
  const spectraRead: { m: Measured; values: Set<string> }[] = [], assigned: { atom?: number; bond?: number; values: string[]; exact?: Set<string> }[] = [];
  const assignTags = (x: Xml) => x.kids.filter((k) => k.name === "objecttag" && k.attrs.Name === ASSIGN).slice(0, 64);
  const assignTagsOf = (x: Xml) => assignTags(x).map((k) => k.attrs.Value ?? "");
  let nextGroup = 1;
  const visit = (x: Xml, group?: G, atoms?: number[]) => {
    const p = priv(x);
    // Written by Octet for ChemDraw's eyes only. A catalytic cycle's arrows name their cycle, so its group is known.
    if (p?.d === 1) return void (Number.isInteger(p.cycle) && member(group, p.cycle as number));
    if (x.attrs.Visible !== undefined && !yes(x.attrs.Visible)) { lose("hidden object"); return; }
    count();
    switch (x.name) {
      case "group":
        if (p?.kind === "table") return readTableGroup(x, p, group);
        { const g = newGroup(x, group); for (const k of x.kids) visit(k, g); }
        return;
      case "fragment": return readFragment(x, group);
      case "t": return readCaption(x, group);
      case "graphic": return readGraphic(x, group, atoms);
      case "curve": return readCurve(x, group);
      case "arrow": return readArrow(x, group);
      case "tlcplate": return readTlc(x, group);
      case "scheme": steps.push(...x.kids.filter((k) => k.name === "step")); return;
      case "step": steps.push(x); return;
      // Keyword and content pairs on the page or a group: not drawn, kept and written back (REL-28).
      case "annotation": return atoms ? lose("annotation") : keepNote(x, group);
      // A bracketed group's meaning is on its brackets (ChemDraw reads it from there); its counts and labels fill in.
      case "bracketedgroup": bracketed.push(x); return;
      case "altgroup": return readAltGroup(x, group);
      case "rlogic": logic.push(...x.kids.filter((k) => k.name === "rlogicitem")); return;
      // Not drawn: live property text, kept on its caption (CH-12).
      case "chemicalproperty": return void properties.push(x);
      case "objecttag": case "bracketattachment": case "crossingbond": case "represent": case "DocumentProperties": return;
      case "embeddedobject": return readPicture(x, group);
      case "spectrum": return readSpectrum(x);
      default: return lose(x.name);
    }
  };
  // An annotation, kept on its group or on the document. One Octet cannot hold (too long, too many) is counted as lost.
  const annotations: Annotation[] = [];
  const keepNote = (x: Xml, g?: G) => {
    const keyword = cleanText(x.attrs.Keyword ?? ""), content = cleanText(x.attrs.Content ?? ""), list = g ? (g.annotations ??= []) : annotations;
    if (keyword.length > MAX_KEYWORD || content.length > MAX_CONTENT || list.length >= MAX_ANNOTATIONS) return lose("annotation");
    list.push({ keyword, content });
  };
  const newGroup = (x: Xml, parent?: G): G => {
    const plot = readPlot(priv(x)?.plot);
    const g: G = { id: newId(x), atoms: new Set(), items: [], ...(x.attrs.Integral === "yes" ? { integral: true as const } : {}), ...(plot ? { plot } : {}), parent };
    groups.push(g);
    return g;
  };

  // A fragment's nodes (not the atoms inside abbreviations), then its bonds, symbols and anything else in it.
  function readFragment(f: Xml, group?: G) {
    fragmentZ = Math.max(fragmentZ, zOf(f));
    const atoms: number[] = [];
    const read: Xml[] = [];
    for (const k of f.kids) if (k.name === "n") { const i = readNode(k); if (i !== undefined) { atoms.push(i); read.push(k); for (let g = group; g; g = g.parent) g.atoms.add(i); } }
    // ChemDraw's predicted shifts: the text in an atom's assignment tags, each a caption where ChemDraw draws it.
    for (const k of read) for (const tag of assignTags(k)) for (const t of tag.kids) if (t.name === "t" && [tag, t].every((x) => x.attrs.Visible === undefined || yes(x.attrs.Visible))) { count(); readCaption(t, group); }
    if (yes(f.attrs.ShowAtomStereo)) for (const i of atoms) mol.atoms[i].cip = true;
    for (const k of f.kids) {
      if (k.name === "b") bondsToRead.push(k);
      else if (k.name === "ColoredMolecularArea") areas.push(k);
      else if (k.name !== "n") visit(k, group, atoms);
    }
  }

  const innerPorts = new WeakMap<Mol, Map<number, number>>();
  function readInner(f: Xml): Mol | undefined {
    const nodes = f.kids.filter((k) => k.name === "n"), bonds = f.kids.filter((k) => k.name === "b");
    if (nodes.length > 256 || bonds.length > 512) return undefined;
    const points = new Set(nodes.filter((k) => k.attrs.NodeType === "ExternalConnectionPoint").map((k) => k.attrs.id));
    const head = bonds.find((b) => points.has(b.attrs.B) || points.has(b.attrs.E)), first = head && (points.has(head.attrs.B) ? head.attrs.E : head.attrs.B);
    const kept = nodes.filter((k) => !points.has(k.attrs.id) && reals(k.attrs.p, 2)).sort((x, y) => Number(y.attrs.id === first) - Number(x.attrs.id === first));
    if (!kept.length) return undefined;
    const at = new Map(kept.map((k, i) => [k.attrs.id, i]));
    const atoms: Atom[] = kept.map((k) => {
      const e = int(k.attrs.Element) ?? 6, q = reals(k.attrs.p, 2)!, iso = int(k.attrs.Isotope), charge = int(k.attrs.Charge);
      return { label: e === 1 && iso === 2 ? "D" : e === 1 && iso === 3 ? "T" : e >= 1 && e <= 118 ? SYMBOLS[e - 1] : "C", location: [...toOctet(q[0], q[1]), 0], ...(charge && Math.abs(charge) <= 9 ? { charge } : {}) };
    });
    const inner: Bond[] = bonds.flatMap((b) => {
      const p = at.get(b.attrs.B), q = at.get(b.attrs.E), order = b.attrs.Order === "2" ? 2 : b.attrs.Order === "3" ? 3 : 1;
      if (p === undefined || q === undefined || p === q) return [];
      // A wedge or hash (a residue's stereocentre), from the end it starts at.
      const w = /^(Wedge|WedgedHash)(Begin|End)$/.exec(b.attrs.Display ?? ""), stereo = w && order === 1 ? (w[1] === "Wedge" ? 1 : 6) : undefined;
      return [{ atoms: (w?.[2] === "End" ? [q, p] : [p, q]) as [number, number], type: order, ...(stereo ? { stereo } : {}) }];
    });
    const result: Mol = { atoms, bonds: inner };
    // Each numbered connection point, and the kept atom it is bonded to: the bonds outside say which they join.
    const nums = new Map<number, number>();
    for (const k of nodes) {
      const n = int(k.attrs.ExternalConnectionNum);
      if (!points.has(k.attrs.id) || n === undefined) continue;
      const b = bonds.find((x) => x.attrs.B === k.attrs.id || x.attrs.E === k.attrs.id), to = b && at.get(b.attrs.B === k.attrs.id ? b.attrs.E : b.attrs.B);
      if (to !== undefined) nums.set(n, to);
    }
    if (nums.size) innerPorts.set(result, nums);
    return result;
  }

  function readNode(n: Xml): number | undefined {
    const q = reals(n.attrs.p, 2);
    if (priv(n)?.d === 1) return undefined; // a connection point Octet wrote for ChemDraw only
    if (!q) { lose("atom"); return undefined; }
    // A 3D atom's xyz gives its place (ChemDraw reads it over p). ChemDraw's z points away from the viewer (its y points
    // down), Octet's towards: older Octet files (no xyz mark at the top) wrote Octet's own.
    const xyz = reals(n.attrs.xyz, 3), [x, y] = xyz ? toOctet(xyz[0], xyz[1]) : toOctet(q[0], q[1]), depth = (xyz?.[2] ?? 0) * (octet && !top?.xyz ? 1 : -1), type = n.attrs.NodeType ?? "Element";
    const element = int(n.attrs.Element) ?? 6, isotope = int(n.attrs.Isotope);
    const a: Atom = { label: type === "Element" ? (element === 1 && isotope === 2 ? "D" : element === 1 && isotope === 3 ? "T" : element >= 1 && element <= 118 ? SYMBOLS[element - 1] : "C") : "C", location: [x, y, depth / B || 0] };
    const charge = int(n.attrs.Charge) ?? 0;
    if (charge && Math.abs(charge) <= 9) a.charge = charge; else if (charge) lose("charge");
    const radical = RADICALS.indexOf(n.attrs.Radical ?? "");
    if (radical > 0) a.radical = radical === 1 ? 3 : radical === 2 ? 1 : 2;
    if (type === "Element" && isotope && !(element === 1 && (isotope === 2 || isotope === 3)) && isotope >= 1 && isotope <= 300) a.isotope = isotope;
    if (type === "ExternalConnectionPoint") { const ext = n.attrs.ExternalConnectionType; if (ext === "PolymerBead") a.bead = true; else a.attach = ext === "Diamond" ? "diamond" : ext === "Star" ? "star" : true; }
    if (type === "Monomer") lose(type);
    if (n.attrs.GenericList !== undefined) lose("atom query");
    const colour = colourOf(n.attrs.color), halo = colourOf(n.attrs.highlightColor);
    if (colour) a.colour = colour;
    if (halo) a.halo = halo;
    if (yes(n.attrs.ShowAtomStereo)) a.cip = true;
    const group = int(n.attrs.EnhancedStereoGroupNum), g = group && group >= 1 && group <= 99 ? group : 1;
    const enhanced = { Absolute: "abs", And: `&${g}`, Or: `or${g}` }[n.attrs.EnhancedStereoType ?? ""];
    if (enhanced) a.enhanced = enhanced;
    const p = priv(n);
    if (p?.hmark === "dot" || p?.hmark === "dash") a.hmark = p.hmark;
    if (p?.partial === "+" || p?.partial === "-") a.partial = p.partial;
    if (yes(n.attrs.ShowPerspective)) a.shade = true;
    if (Number.isInteger(p?.map) && isNum(p!.map, 1, 9999)) a.map = p!.map as number;
    if (p?.circle === true) a.circle = true;
    // Marks moved round the atom by hand, in Octet's own files (a ChemDraw file's symbols keep their places below).
    const angles = p?.angles && typeof p.angles === "object" ? Object.entries(p.angles as Record<string, unknown>).filter(([k, v]) => /^(charge|partial|radical[01]|pair[0-3])$/.test(k) && isNum(v, -360, 360)) : [];
    if (angles.length) a.angles = Object.fromEntries(angles) as Record<string, number>;
    if (isNum(p?.scale, 0.01, 100) && p!.scale !== 1) a.scale = p!.scale as number;
    // An atom number, shown or kept hidden (Name to Structure and templates number atoms without showing them).
    const number = (n.attrs.AtomNumber ?? "").trim();
    if (number) { if (!/^[\w'′*-]{1,8}$/.test(number)) lose("atom number"); else if (yes(n.attrs.ShowAtomNumber)) a.number = number; else a.hiddenNumber = number; }
    if (yes(n.attrs.IgnoreWarnings)) a.ignoreWarnings = true;
    // An H hidden by Toggle Hydrogen Display.
    if (n.attrs.Visible !== undefined && !yes(n.attrs.Visible) && a.label === "H") a.hidden = true;
    // A label alignment set by hand.
    const align = ({ Left: "left", Center: "centre", Right: "right", Above: "above", Below: "below" } as const)[n.attrs.LabelDisplay as "Left"];
    if (align) a.align = align;
    // Query properties (Atom Properties).
    const aq: AtomQuery = {}, count = (k: string) => { const v = int(n.attrs[k]); return v !== undefined && v >= 0 && v <= 15 ? v : undefined; };
    for (const [k, kind] of [["FreeSites", "free"], ["SubstituentsUpTo", "upto"], ["SubstituentsExactly", "exactly"]] as const) { const v = count(k); if (v !== undefined) aq.subst = { kind, n: v }; }
    if (yes(n.attrs.ImplicitHydrogens)) aq.noH = true;
    const rings = back(RING_COUNTS, n.attrs.RingBondCount), unsat = { MustBeAbsent: "absent", MustBePresent: "present" }[n.attrs.UnsaturatedBonds ?? ""];
    if (rings) aq.rings = rings as AtomQuery["rings"];
    if (unsat) aq.unsat = unsat as AtomQuery["unsat"];
    if (yes(n.attrs.RxnChange)) aq.change = true;
    const rs = { Inversion: "inversion", Retention: "retention" }[n.attrs.RxnStereo ?? ""], tr = { Broad: "broad", Narrow: "narrow", Any: "any" }[n.attrs.Translation ?? ""], ab = back(ABUNDANCES, n.attrs.IsotopicAbundance);
    if (rs) aq.stereo = rs as AtomQuery["stereo"];
    if (tr) aq.translation = tr as AtomQuery["translation"];
    if (ab) aq.abundance = ab as AtomQuery["abundance"];
    if (yes(n.attrs.AbnormalValence)) aq.valence = true;
    if (Object.keys(aq).length) a.query = aq;
    // A contracted label's fragment (ChemDraw's, or Octet's from Contract Label): its atoms, the one joined to the
    // connection point first, kept for Expand Label. 255 atoms at most.
    const nest = type === "Fragment" ? n.kids.find((k) => k.name === "fragment") : undefined;
    if (nest && priv(nest)?.d !== 1) { const inner = readInner(nest); if (inner) a.inner = inner; }
    const i = mol.atoms.push(a) - 1;
    if (type === "MultiAttachment" || type === "VariableAttachment") centres.push({ i, ids: idList(n.attrs.Attachments).slice(0, 64), variable: type === "VariableAttachment" });
    if (n.attrs.Geometry === "Tetrahedral" && n.attrs.BondOrdering) tetra.push({ i, order: idList(n.attrs.BondOrdering).slice(0, 4) });
    nodeIds.push(int(n.attrs.id) ?? 0);
    numH.set(i, int(n.attrs.NumHydrogens) ?? 0);
    const lw = real(n.attrs.LineWidth);
    if (lw !== undefined) nodeLines.set(i, lw);
    atomOf.set(int(n.attrs.id) ?? -1, i);
    const tags = assignTags(n), exact = new Set(tags.filter((k) => k.kids.some((t) => t.name === "t")).map((k) => k.attrs.Value ?? ""));
    if (tags.length) assigned.push({ atom: i, values: tags.map((k) => k.attrs.Value ?? ""), exact });
    const t = n.kids.find((k) => k.name === "t");
    // The label's own text style, where it differs from the document's: bold, italic, underline, font and size.
    const first = t?.kids.find((k) => k.name === "s");
    if (first) {
      const f = int(first.attrs.face) ?? 0, font = fontOf(fonts.get(int(first.attrs.font) ?? -1)).font, size = real(first.attrs.size);
      if (f & 1) a.bold = true;
      if (f & 2) a.italic = true;
      if (f & 4) a.underline = true;
      if (font && font !== style.labelFont) a.font = font;
      if (size && size >= 0.1 && size <= 999) { labelSizes.set(i, size); if (Math.abs(size - style.labelSize) > 0.01) a.size = size; }
    }
    // Each run's bold, italic and underline, and its superscript or subscript (face 0x40 or 0x20; 0x60 is Formula).
    const runs = t?.kids.filter((k) => k.name === "s").map((k): TextRun => { const f = int(k.attrs.face) ?? 0; return { text: k.text, ...(f & 1 ? { bold: true } : {}), ...(f & 2 ? { italic: true } : {}), ...(f & 4 ? { underline: true } : {}),
      ...((f & 0x60) === 0x40 ? { script: "super" as const } : (f & 0x60) === 0x20 ? { script: "sub" as const } : {}) }; });
    if (t) labels.push({ i, text: t.kids.filter((k) => k.name === "s").map((k) => k.text).join(""), type, isotope, plain: t.attrs.InterpretChemically !== undefined && !yes(t.attrs.InterpretChemically),
      just: t.attrs.LabelJustification ?? t.attrs.Justification, stack: t.attrs.LabelAlignment, turn: t.attrs.RotationAngle, runs });
    else if (type === "GenericNickname" && n.attrs.GenericNickname) labels.push({ i, text: n.attrs.GenericNickname, type });
    else if (type === "ElementList" && n.attrs.ElementList) {
      // An element list with no label text: its label from its atomic numbers.
      const not = /^\s*NOT\s/.test(n.attrs.ElementList), zs = idList(n.attrs.ElementList.replace(/^\s*NOT\s/, "")).filter((z) => z >= 1 && z <= 118);
      if (zs.length) labels.push({ i, text: `[${not ? "NOT " : ""}${zs.map((z) => SYMBOLS[z - 1]).join(",")}]`, type });
    }
    return i;
  }

  // A spectrum object: a measured spectrum, one of each kind (the first), with its place on the page. One Octet cannot
  // read (no grid, a value that is not a number, too many points) is lost.
  function readSpectrum(x: Xml) {
    const tag = (name: string) => x.kids.filter((k) => k.name === "objecttag" && k.attrs.Name === name).map((k) => k.attrs.Value ?? "");
    let m: Measured;
    try { m = fromSpectrumObject(x.attrs, x.text, tag(OWN_TAG)[0], nextGroup); } catch { return lose("spectrum"); }
    if (spectraRead.length >= 16 || spectraRead.some((r) => keyOf(r.m) === keyOf(m))) return lose("spectrum");
    const b = reals(x.attrs.BoundingBox, 4);
    if (b) { const [p, q] = [toOctet(b[0], b[3]), toOctet(b[2], b[1])]; m.box = [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]; }
    spectraRead.push({ m, values: new Set(tag(ASSIGN)) });
    nextGroup = nextGroupId(spectraRead.map((r) => r.m));
  }

  // Ring fills (ChemDraw's ColoredMolecularArea): a colour and the bonds of one ring, read as the ring's atoms in
  // order. One whose bonds do not close a ring of 3 to 40 atoms is lost.
  function readFills(): RingFill[] {
    const byId = new Map(bondIds.map((id, k) => [id, k]));
    return areas.flatMap((x) => {
      const colour = colourOf(x.attrs.bgcolor) ?? "#000000", ks = (x.attrs.BasisObjects ?? "").trim().split(/\s+/).slice(0, 41).map((v) => byId.get(int(v) ?? -1));
      if (ks.length < 3 || ks.length > 40 || ks.some((k) => k === undefined)) { lose("ring fill"); return []; }
      const left = ks.map((k) => mol.bonds[k!].atoms), ring = [...left.shift()!];
      while (left.length) {
        const at = left.findIndex((b) => b.includes(ring[ring.length - 1]));
        if (at < 0) break;
        const [b] = left.splice(at, 1), next = b[0] === ring[ring.length - 1] ? b[1] : b[0];
        if (left.length) ring.push(next); else if (next !== ring[0]) ring.length = 0;
      }
      if (left.length || new Set(ring).size !== ks.length) { lose("ring fill"); return []; }
      return [{ atoms: ring, colour }];
    });
  }

  // Bonds join nodes by id, the last node read with an id winning; a bond to a missing node, to its own atom or
  // repeating another is dropped (spec 2).
  function readBonds() {
    // A multi-centre or variable attachment stands for two or more atoms read here, by node id; a multi-centre ring's
    // 1.5 bonds stay delocalised.
    const ligand = new Set<number>();
    for (const c of centres) {
      const atoms = [...new Set(c.ids.map((id) => atomOf.get(id)).filter((j): j is number => j !== undefined && j !== c.i && !mol.atoms[j].centre))];
      if (atoms.length < 2) { lose("attachment"); continue; }
      mol.atoms[c.i].centre = { atoms, ...(c.variable ? { variable: true as const } : {}) };
      if (!c.variable) for (const j of atoms) ligand.add(j);
    }
    const seen = new Set<string>();
    // In the order they are drawn (Z), so a bond ChemDraw brought to the front stays in front where bonds cross.
    for (const b of [...bondsToRead].sort((p, q) => zOf(p) - zOf(q))) {
      if (priv(b)?.d === 1) continue; // to a connection point Octet wrote for ChemDraw only
      const i = atomOf.get(int(b.attrs.B) ?? -1), j = atomOf.get(int(b.attrs.E) ?? -1);
      const key = i === undefined || j === undefined ? "" : i < j ? `${i} ${j}` : `${j} ${i}`;
      if (!key || i === j || seen.has(key)) { lose("bond"); continue; }
      seen.add(key);
      const raw = (b.attrs.Order ?? "1").trim().split(/\s+/).sort().join(" "), query = back(BOND_QUERY, b.attrs.Order?.trim() === "any" ? "any" : Object.values(BOND_QUERY).find((v) => v.split(" ").sort().join(" ") === raw));
      // A query bond with orders ChemDraw's Bond Properties do not offer is drawn single, never as a double bond (CH-11).
      const listed = (b.attrs.Order ?? "1").trim().split(/\s+/), odd = !query && listed.length > 1;
      if (odd) lose("bond query");
      const order = new Set(query ? [query === "da" ? "2" : "1"] : odd ? ["1"] : listed), d = b.attrs.Display ?? "", d2 = b.attrs.Display2 ?? "";
      // Order 1.5: with a dashed line, ChemDraw's DoubleDashed bond; otherwise a delocalised bond, made Kekulé below
      // (Octet's own files say which order each one had).
      // ChemDraw reads order 1.5 with a dashed Display2 as a double bond: Tautomeric, or Aromatic when Display is
      // dashed too. Order 2 with a dashed Display is Aromatic as well.
      const deloc = order.size === 1 && order.has("1.5"), dashed = deloc && !!d2 && d2 !== "Solid";
      // A hydrogen bond: ChemDraw 26's DottedHydrogen display (or an older dotted bond), or the spec's hydrogen order.
      const hbond = d === "DottedHydrogen" || ((d === "Dot" || (order.size === 1 && order.has("hydrogen"))) && !order.has("2") && !order.has("3"));
      const bond: Bond = { type: hbond ? HBOND : order.has("4") ? QUADRUPLE : order.has("3") ? 3 : order.has("2") || dashed ? 2 : 1, atoms: [i!, j!] };
      if (dashed) bond.display = d === "Dash" ? "aromatic" : "dashed";
      // A delocalised bond of a π ligand's ring, or with a single bond style (a ring drawn in perspective), stays
      // delocalised (Octet's order 4).
      else if (deloc && (priv(b)?.order === 4 || (ligand.has(i!) && ligand.has(j!)) || (d && d !== "Solid"))) bond.type = 4;
      else if (deloc) { const kept = priv(b)?.order; delocalised.push({ k: mol.bonds.length, order: kept === 1 || kept === 2 ? kept : undefined }); }
      if (bond.type === 1 && order.size === 1 && order.has("dative")) bond.display = "dative";
      else if (!deloc && !hbond && [...order].some((o) => !["1", "2", "3", "4"].includes(o))) lose("bond order");
      let swap = false;
      if ((bond.type === 1 || bond.type === 4) && !bond.display) {
        const single: Record<string, [Display | undefined, number | undefined, boolean]> = {
          WedgeBegin: [undefined, 1, false], WedgeEnd: [undefined, 1, true], WedgedHashBegin: [undefined, 6, false], WedgedHashEnd: [undefined, 6, true], Bold: ["bold", undefined, false],
          Dash: ["dashed", undefined, false], Dot: ["dashed", undefined, false], DashDot: ["dashed", undefined, false], Hash: ["hashed", undefined, false], Wavy: ["wavy", undefined, false],
          WavyWedgeBegin: ["wavy", undefined, false], WavyWedgeEnd: ["wavy", undefined, false], HollowWedgeBegin: ["hollow", undefined, false], HollowWedgeEnd: ["hollow", undefined, true],
        };
        const s = single[d];
        if (s) { if (s[0]) bond.display = s[0]; if (s[1]) bond.stereo = s[1]; swap = s[2]; }
      } else if (bond.type === 2) {
        if (dashed) { /* above */ } else if (d === "Bold") bond.display = "bold"; else if (d === "Wavy") bond.display = "either"; else if (d === "Dash") bond.display = "aromatic"; else if (d2 === "Dash") bond.display = "dashed"; else if (d && d !== "Solid") lose("bond display");
        const side = { Left: "left", Right: "right", Center: "centre" }[b.attrs.DoublePosition ?? ""] as Bond["position"];
        if (side) bond.position = side;
      } else if (d && d !== "Solid" && !hbond) lose("bond display");
      if (swap) bond.atoms = [j!, i!];
      const colour = colourOf(b.attrs.color);
      if (colour) bond.colour = colour;
      const halo = colourOf(b.attrs.highlightColor);
      if (halo) bond.halo = halo;
      if (yes(b.attrs.IgnoreWarnings)) bond.ignoreWarnings = true;
      // Query properties: its query type (kept with Octet's own drawn order), topology and reaction centre.
      if (query) { bond.query = query as Bond["query"]; const kept = priv(b)?.type; if (kept === 1 || kept === 2 || kept === 3) bond.type = kept; }
      const topology = back(TOPOLOGY, b.attrs.Topology), rxn = back(RXN, b.attrs.RxnParticipation);
      if (topology) bond.topology = topology as Bond["topology"];
      if (rxn) bond.rxn = rxn as Bond["rxn"];
      const tags = assignTagsOf(b);
      if (tags.length) assigned.push({ bond: mol.bonds.length, values: tags });
      // A bond to a residue label: the kept atom it joins at that end (BeginExternalNum, EndExternalNum).
      if (b.attrs.BeginExternalNum !== undefined || b.attrs.EndExternalNum !== undefined) {
        const portOf = (k: number, n: number | undefined) => { const m = n === undefined ? undefined : innerPorts.get(mol.atoms[k].inner!); return m?.get(n!) ?? -1; };
        const ports: [number, number] = [portOf(i!, int(b.attrs.BeginExternalNum)), portOf(j!, int(b.attrs.EndExternalNum))];
        if (ports[0] >= 0 || ports[1] >= 0) bond.ports = ports;
      }
      mol.bonds.push(bond);
      bondIds.push(int(b.attrs.id) ?? 0);
      bondSettings.push({ line: real(b.attrs.LineWidth), bold: real(b.attrs.BoldWidth), hash: real(b.attrs.HashSpacing), margin: real(b.attrs.MarginWidth), spacing: real(b.attrs.BondSpacing), attrs: b.attrs });
    }
  }

  // Structures at their own size (decision 0007). A structure takes a scale when its bonds carry LineWidth and every
  // width, hash spacing and margin they carry agrees with LineWidth's ratio to the document's within 2%. Bond length
  // is not used: ChemDraw keeps a structure's old fixed length on it after a resize. Settings that do not make a
  // scale are kept on each bond as they came, and written back (REL-15). A bond's own double-bond spacing is kept and
  // drawn. An atom with no bonds takes its scale from its own LineWidth. A scaled atom's label keeps its size over
  // the scale.
  function readScales() {
    const fits = (f: number) => Math.round(Math.min(100, Math.max(0.01, f)) * 1e4) / 1e4;
    const has = (x: (typeof bondSettings)[number]) => x.line !== undefined || x.bold !== undefined || x.hash !== undefined || x.margin !== undefined;
    const root = mol.atoms.map((_, i) => i), find = (i: number) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
    for (const b of mol.bonds) root[find(b.atoms[0])] = find(b.atoms[1]);
    const parts = new Map<number, number[]>();
    mol.bonds.forEach((b, k) => { const r = find(b.atoms[0]); let ks = parts.get(r); if (!ks) parts.set(r, (ks = [])); ks.push(k); });
    for (const ks of parts.values()) {
      const atoms = [...new Set(ks.flatMap((k) => mol.bonds[k].atoms))], set = ks.map((k) => bondSettings[k]);
      ks.forEach((k) => { const v = bondSettings[k].spacing; if (v !== undefined && Math.abs(v - style.spacing) > 0.05) mol.bonds[k].spacing = Math.min(100, Math.max(0, v)); });
      const keepOwn = () => ks.forEach((k) => {
        const own = Object.fromEntries(OWN_BOND_ATTRS.flatMap((n) => { const v = bondSettings[k].attrs[n]?.trim(); return v && v.length <= 12 && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(v) ? [[n, v]] : []; }));
        if (Object.keys(own).length) mol.bonds[k].own = own;
      });
      if (atoms.some((i) => mol.atoms[i].scale)) continue;
      if (!set.some(has)) { keepOwn(); continue; }
      const f = set[0].line === undefined ? NaN : set[0].line / style.line;
      const agrees = (v: number | undefined, base: number) => v === undefined || Math.abs(v / base - f) <= 0.02 * f;
      if (!(f > 0) || !set.every((x) => x.line !== undefined && agrees(x.line, style.line) && agrees(x.bold, style.bold) && agrees(x.hash, style.hash) && agrees(x.margin, style.margin))) { keepOwn(); continue; }
      if (Math.abs(f - 1) <= 0.02) continue;
      for (const i of atoms) mol.atoms[i].scale = fits(f);
    }
    const bonded = new Set(mol.bonds.flatMap((b) => b.atoms));
    for (const [i, lw] of nodeLines) {
      const f = lw / style.line;
      if (!bonded.has(i) && !mol.atoms[i].scale && f > 0 && Math.abs(f - 1) > 0.02) mol.atoms[i].scale = fits(f);
    }
    mol.atoms.forEach((a, i) => {
      const raw = labelSizes.get(i);
      if (!a.scale || raw === undefined) return;
      const own = Math.round((raw / a.scale) * 100) / 100;
      if (Math.abs(own - style.labelSize) > 0.01) a.size = own; else delete a.size;
    });
  }
  // A graphic's own size: Octet's own, or (in another program's file) its LineWidth or BoldWidth against the
  // document's when the two agree within 2%. Widths that do not agree are listed as not kept.
  function graphicScale(x: Xml, p?: Record<string, unknown>): number | undefined {
    if (isNum(p?.scale, 0.01, 100)) return p!.scale === 1 ? undefined : (p!.scale as number);
    // A LineWidth alone is the object's own line width (lineWidthOf), as ChemDraw's Line Width sets it; with a
    // BoldWidth it is a scale.
    const lw = real(x.attrs.LineWidth), bw = real(x.attrs.BoldWidth);
    if (octet || bw === undefined) return undefined;
    const f = lw !== undefined ? lw / style.line : bw! / style.bold;
    if (!(f > 0) || (lw !== undefined && bw !== undefined && Math.abs(bw / style.bold - f) > 0.02 * f)) { lose("line settings"); return undefined; }
    return Math.abs(f - 1) <= 0.02 ? undefined : Math.round(Math.min(100, Math.max(0.01, f)) * 1e4) / 1e4;
  }

  // Labels: one element with the hydrogens Octet would draw is a plain atom; anything else is written text (OMe,
  // Delocalised rings: ChemDraw's ring bonds of order 1.5, and any ring with a circle inside it (ChemDraw reads a single
  // bond near a closed circle as aromatic). Octet draws such a ring with its circle, from Kekulé bonds: each atom that
  // can take a double bond gets one where it can, carbons first. A circle Octet takes as a ring's is not kept as a shape.
  // A π ligand's ellipse is Octet's to draw: an unfilled oval or closed curve round the middle of a multi-centre
  // point's ring is not kept as a shape.
  function readLigands() {
    const near = mol.atoms.flatMap((a) => {
      if (!a.centre || a.centre.variable) return [];
      const ring = a.centre.atoms.map((j) => mol.atoms[j].location), c = a.location, r = Math.max(...ring.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
      return [(q: P, reach: number) => Math.hypot(q[0] - c[0], q[1] - c[1]) < 0.3 * r && reach < r];
    });
    if (!near.length) return;
    const inside = (q: P, reach: number) => near.some((f) => f(q, reach));
    const mid = (ps: P[]): P => [ps.reduce((t, q) => t + q[0], 0) / ps.length, ps.reduce((t, q) => t + q[1], 0) / ps.length];
    const kept = shapes.filter((sh) => !(sh.kind === "oval" && !sh.fill && inside(mid([sh.from, sh.to]), Math.hypot(sh.to[0] - sh.from[0], sh.to[1] - sh.from[1]) / 2)));
    if (kept.length < shapes.length) shapes.splice(0, shapes.length, ...kept);
    const curves = arrows.filter((a) => !(a.kind === "curve" && a.curve?.closed && !a.fill && (() => {
      const ps = a.curve!.points.map((q) => q.at), c = mid(ps);
      return inside(c, Math.max(...ps.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]))));
    })()));
    if (curves.length < arrows.length) arrows.splice(0, arrows.length, ...curves);
  }
  function readDelocalised() {
    const ring = new Set<number>(), taken = new Set<number>(), g = { atoms: mol.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: mol.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) };
    const bondOf = (x: number, y: number) => mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x));
    const found = ovals.length ? rings(g).filter((r) => r.length >= 5 && r.length <= 8) : [];
    for (const o of ovals) {
      const r = found.find((rr) => {
        const c: P = [rr.reduce((s, i) => s + mol.atoms[i].location[0], 0) / rr.length, rr.reduce((s, i) => s + mol.atoms[i].location[1], 0) / rr.length];
        const R = rr.reduce((s, i) => s + Math.hypot(mol.atoms[i].location[0] - c[0], mol.atoms[i].location[1] - c[1]), 0) / rr.length;
        return Math.hypot(o.c[0] - c[0], o.c[1] - c[1]) < 0.25 * R && o.r > 0.3 * R && o.r < 0.95 * R;
      });
      if (!r) continue;
      taken.add(o.id);
      for (const i of r) mol.atoms[i].circle = true;
      r.forEach((x, k) => { const kk = bondOf(x, r[(k + 1) % r.length]); if (kk >= 0) ring.add(kk); });
    }
    if (taken.size) shapes.splice(0, shapes.length, ...shapes.filter((s) => !taken.has(s.id)));
    const kept = new Map(delocalised.map((x) => [x.k, x.order]));
    for (const [k, o] of kept) if (o) mol.bonds[k].type = o;
    const loose = [...new Set([...kept.keys()].filter((k) => !kept.get(k)).concat([...ring].filter((k) => !kept.has(k))))].filter((k) => mol.bonds[k].type === 1 && !mol.bonds[k].display && !mol.bonds[k].stereo);
    if (!loose.length) return;
    // An atom can take a double bond when its valence has room after its bonds (a delocalised one counts as single),
    // its hydrogens and its charge.
    const VALENCE: Record<string, number> = { C: 4, Si: 4, N: 3, P: 3, B: 3, O: 2, S: 2, Se: 2 };
    const room = (i: number) => {
      const a = mol.atoms[i], v = VALENCE[a.label], q = a.charge ?? 0;
      if (v === undefined || a.text) return 0;
      const bonds = mol.bonds.reduce((n, b) => n + (b.atoms.includes(i) ? orderOf(b.type) : 0), 0);
      return (a.label === "C" || a.label === "B" || a.label === "Si" ? v - Math.abs(q) : v + q) - bonds - (numH.get(i) ?? 0);
    };
    const atoms = [...new Set(loose.flatMap((k) => mol.bonds[k].atoms))].filter((i) => room(i) >= 1);
    atoms.sort((p, q) => Number(mol.atoms[p].label !== "C" || !!mol.atoms[p].charge) - Number(mol.atoms[q].label !== "C" || !!mol.atoms[q].charge) || p - q);
    kekulise(loose.map((k) => mol.bonds[k].atoms), atoms).forEach((on, n) => { if (on) mol.bonds[loose[n]].type = 2; });
  }

  // Ph, CO2Et), less any charge the node already holds (spec 9.10).
  function readLabels() {
    const used = mol.atoms.map(() => 0), degree = mol.atoms.map(() => 0), towards = mol.atoms.map((): P => [0, 0]);
    for (const b of mol.bonds) for (const i of b.atoms) { used[i] += orderOf(b.type); degree[i]++; }
    // Each atom's bonds as one direction: the sum of their unit vectors (as render.ts reads a label's way).
    for (const { atoms: [i, j] } of mol.bonds) {
      if (mol.atoms[i].hidden || mol.atoms[j].hidden) continue;
      const p = mol.atoms[i].location, q = mol.atoms[j].location, d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, u: P = [(q[0] - p[0]) / d, (q[1] - p[1]) / d];
      towards[i] = [towards[i][0] + u[0], towards[i][1] + u[1]];
      towards[j] = [towards[j][0] - u[0], towards[j][1] - u[1]];
    }
    // The alignment ChemDraw drew a label with (its text's LabelJustification, or LabelAlignment for a stacked one),
    // where Octet's automatic one would draw it another way and nothing is set by hand on the node: it is kept as set
    // by hand (Atom.align), so the label opens as ChemDraw showed it. hFirst: an element's hydrogens come first in the
    // text (H3C); undefined when it has none. A label of one glyph looks the same every way, so it stays automatic.
    // ChemDraw reverses a right-justified label (OH shows as HO), as Octet does.
    // A label's turn (RotationAngle: degrees clockwise on the page, times 65536) is kept too, anticlockwise as Octet turns.
    const keep = (l: (typeof labels)[number], hFirst?: boolean) => {
      const a = mol.atoms[l.i], h = hFirst !== undefined, glyphs = (a.text ?? a.label).length + (h ? 1 : 0) + (a.isotope ? 1 : 0);
      const turn = ((-(int(l.turn) ?? 0) / 65536) % 360 + 540) % 360 - 180;
      if (Number.isFinite(turn) && Math.abs(turn) > 1e-6) a.labelAngle = Math.round(turn * 1e6) / 1e6;
      const file = l.stack === "Above" ? "above" : l.stack === "Below" ? "below" : ({ Center: "centre", Right: "right", Left: "left" } as Record<string, NonNullable<Atom["align"]>>)[l.just ?? ""];
      if (octet || a.align || glyphs < 2 || !file) return;
      const v = towards[l.i], deg = degree[l.i], steep = Math.hypot(v[0], v[1]) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180), right = deg > 0 && !steep && v[0] > 1e-6;
      // As each draws it: an element's H before it (right) or after it (left), or stacked; a text's units reversed or not.
      const stacked = file === "above" || file === "below", single = !h && (!a.text || units(a.text).length < 2);
      const drawn = stacked ? (single ? "left" : file) : h && file !== "centre" ? (hFirst !== (file === "right") ? "right" : "left") : file;
      const auto = h ? (right || (!deg && H_FIRST.has(a.label)) ? "right" : !steep || deg < 2 ? "left" : v[1] < 0 ? "above" : "below") : right ? "right" : "left";
      if (drawn !== auto) a.align = drawn;
    };
    for (const l of labels) {
      const { i, text: raw, type, isotope, plain } = l, a = mol.atoms[i], charge = a.charge ?? 0;
      // A label of more than one line keeps its lines (each trimmed, empty ones left out); an element's label is read
      // without them (ChemDraw's stacked NH can be typed N, Option-Return, H).
      // The node's charge sign after the label (after its first or last line) is not text.
      const rows = cleanText(raw).split("\n").map((t) => t.trim()).filter(Boolean);
      for (const k of new Set([0, rows.length - 1])) {
        const sign = /(\d*)([+\-−–])$/.exec(rows[k] ?? "");
        if (charge && sign && (sign[2] === "+") === charge > 0) { rows[k] = rows[k].slice(0, rows[k].length - (sign[1] === String(Math.abs(charge)) ? sign[0].length : 1)).trim(); break; }
      }
      const lined = rows.filter(Boolean).join("\n");
      let text = lined.replace(/\n/g, "");
      if (!text || text === "\ufffc" || a.attach || a.bead) continue;
      if (type === "Element" && !plain && (!isotope || a.label === "D" || a.label === "T" || a.isotope)) {
        if (a.isotope && text.startsWith(String(a.isotope))) text = text.slice(String(a.isotope).length);
        const m = new RegExp(`^(?:H(\\d*))?${a.label}(?:H(\\d*))?$`).exec(text);
        const h = m ? (m[1] === undefined ? 0 : Number(m[1] || 1)) + (m[2] === undefined ? 0 : Number(m[2] || 1)) : -1, hFirst = h > 0 ? m![1] !== undefined : undefined;
        if (m && (a.label !== "C" || !degree[i] || a.isotope || (degree[i] === 1 ? style.terminalLabels : style.carbonLabels)) && h === hydrogens(a.label, charge, used[i], a.radical === 3 ? 2 : a.radical)) { keep(l, hFirst); continue; }
        // A carbon shown with its own hydrogens (CH3 at a chain end): a shown carbon, which keeps its hydrogens right.
        if (m && a.label === "C" && h === hydrogens("C", charge, used[i], a.radical === 3 ? 2 : a.radical)) { a.shown = true; keep(l, hFirst); continue; }
      } else if (isotope) lose("isotope");
      if (lined.includes("\n")) text = lined;
      if (text.length > MAX_LABEL || /[<>]/.test(text)) { lose("label text"); text = text.replace(/[<>]/g, "").slice(0, MAX_LABEL).trim(); }
      // A fragment's label is an abbreviation even when it spells an element: Ac (acetyl) and Pr (propyl), never actinium
      // or praseodymium.
      if (isElement(text) && !plain && type !== "Fragment") a.label = text;
      else {
        a.text = text;
        a.label = anchorElement(text) ?? "C";
        // Characters bold, italic or underlined where others are not: each character of the text takes the style of
        // its run (the text is the runs' text less what reading left out: spaces, empty lines, a charge sign).
        const per = (l.runs ?? []).flatMap((r) => cleanText(r.text).split("").map((ch) => ({ ch, r })));
        let j = 0;
        const st = labelStyle(normalise(text.split("").map((ch): TextRun => { while (j < per.length && per[j].ch !== ch) j++; const r = per[j++]?.r; return { ...(r ? styleOf(r) : {}), text: ch }; })));
        if (st.runs) { delete a.bold; delete a.italic; delete a.underline; Object.assign(a, st); }
        // A raised or lowered part is not read (chemicalText): the label attaches through what is.
        if (a.runs?.some((r) => r.script)) a.label = anchorElement(chemicalText(a.text, a.runs)!) ?? "C";
      }
      // Interpret Chemically off on the label: its text, not chemistry.
      if (plain) a.chemical = false;
      keep(l);
    }
  }

  // A caption: its style runs, its own style (in Octet's files, the text's caption style; in ChemDraw's, what every
  // run shares), its alignment, and formula-face runs turned into subscripts the way ChemDraw draws them (spec 8.3).
  function readCaption(t: Xml, group?: G) {
    const q = reals(t.attrs.p, 2);
    if (!q) return lose("text");
    // RotationAngle: degrees clockwise on the page, times 65536; Octet turns anticlockwise.
    const turn = ((-(int(t.attrs.RotationAngle) ?? 0) / 65536) % 360 + 540) % 360 - 180;
    const p = priv(t), docFont = style.captionFont, docSize = style.captionSize, runs: (RunStyle & { text: string; font: string; size: number })[] = [];
    let room = MAX_TEXT;
    for (const s of t.kids) {
      if (s.name !== "s" || room <= 0) continue;
      const text = cleanText(s.text).slice(0, room), named = fontOf(fonts.get(int(s.attrs.font) ?? -1)), f = int(s.attrs.face) ?? 0, size = real(s.attrs.size), colour = colourOf(s.attrs.color ?? "3");
      if (s.attrs.font && fonts.has(int(s.attrs.font) ?? -1) && !named.font) lose("font");
      room -= text.length;
      const base = { ...(named.bold || f & 1 ? { bold: true as const } : {}), ...(named.italic || f & 2 ? { italic: true as const } : {}), ...(f & 4 ? { underline: true as const } : {}),
        font: named.font ?? docFont, size: size ? Math.min(999, Math.max(0.1, size)) : docSize, ...(colour ? { colour } : {}) };
      if ((f & 0x60) === 0x60) for (const r of formulaRuns(text)) runs.push({ ...base, ...(r.sub ? { script: "sub" as const } : {}), text: r.text });
      else runs.push({ ...base, ...((f & 0x60) === 0x20 ? { script: "sub" as const } : (f & 0x60) === 0x40 ? { script: "super" as const } : {}), text });
    }
    const text = runs.map((r) => r.text).join("");
    // Text with nothing to show: left out, and not in the notice, as the user cannot see it (REL-28).
    if (!text.replace(/[\s\ufffc]/g, "")) return;
    const shared = <K extends keyof RunStyle>(k: K) => (runs.every((r) => r[k] === runs[0][k]) ? runs[0][k] : undefined);
    const cf = int(t.attrs.CaptionFace) ?? 0, cs = real(t.attrs.CaptionSize);
    const whole: RunStyle = octet
      ? { bold: cf & 1 ? true : undefined, italic: cf & 2 ? true : undefined, underline: cf & 4 ? true : undefined, font: fontOf(fonts.get(int(t.attrs.CaptionFont) ?? -1)).font, size: cs ? Math.min(999, Math.max(0.1, cs)) : undefined, colour: colourOf(t.attrs.color) }
      : { bold: shared("bold"), italic: shared("italic"), underline: shared("underline"), font: shared("font") === docFont ? undefined : shared("font"), size: shared("size") === docSize ? undefined : shared("size"), colour: shared("colour") };
    const own = runs.map((r): TextRun => ({
      text: r.text, ...(r.bold && !whole.bold ? { bold: true } : {}), ...(r.italic && !whole.italic ? { italic: true } : {}), ...(r.underline && !whole.underline ? { underline: true } : {}), ...(r.script ? { script: r.script } : {}),
      ...(r.font !== (whole.font ?? docFont) ? { font: r.font } : {}), ...(r.size !== (whole.size ?? docSize) ? { size: r.size } : {}), ...(r.colour !== whole.colour ? { colour: r.colour ?? "#000000" } : {}),
    }));
    const just = t.attrs.Justification ?? t.attrs.CaptionJustification, xy = p?.xy;
    const [x, y] = Array.isArray(xy) && xy.length === 2 && xy.every((v) => isNum(v, -1e6, 1e6)) ? (xy as P) : toOctet(q[0], q[1]);
    const c: Caption & { z: number } = { id: newId(t), text, x, y, z: zOf(t), ...(Number.isFinite(turn) && Math.abs(turn) > 1e-6 ? { angle: Math.round(turn * 1e6) / 1e6 } : {}) };
    for (const k of ["bold", "italic", "underline", "size", "colour", "font"] as const) if (whole[k] !== undefined) (c as Record<string, unknown>)[k] = whole[k];
    if (just === "Right") c.align = "right"; else if (just === "Full") c.align = "justify"; else if (just !== "Center") c.align = "left";
    // Octet's own alignment for conditions it wrote as it draws them.
    if (p?.align === "centre") delete c.align; else if (p?.align === "left" || p?.align === "right" || p?.align === "justify") c.align = p.align;
    // A width, in pt (spec WordWrapWidth): the caption wraps to it.
    const wrapAt = real(t.attrs.WordWrapWidth);
    if (wrapAt !== undefined && wrapAt >= B / 2 && wrapAt <= 1000 * B) c.width = isNum(p?.width, 0.5, 1000) ? (p!.width as number) : wrapAt / B;
    // Line spacing: auto (Octet's default), variable, or fixed in pt.
    const lh = t.attrs.LineHeight ?? t.attrs.CaptionLineHeight, fixed = real(lh);
    if (lh === "variable") c.lineHeight = "variable"; else if (fixed !== undefined && fixed >= 0.1 && fixed <= 999) c.lineHeight = fixed;
    const normal = normalise(own);
    // Runs Octet wrote for text it draws as a formula (formula in its own data) are plain text again when they are
    // still what the formula gives, so the text stays editable as typed (issue 31). ChemDraw's runs stay as they are.
    if (styled(normal)) {
      if (p?.formula === 1 && JSON.stringify(normal) === JSON.stringify(normalise(formulaTextRuns(text)))) asFormula.set(c, normal);
      else c.runs = normal;
    }
    // Interpret Chemically off on this text: it is text only.
    if (t.attrs.InterpretChemically !== undefined && !yes(t.attrs.InterpretChemically)) c.chemical = false;
    if (p?.auto === 1) c.auto = true;
    const role = readPart(p?.role);
    if (role) c.role = role;
    if (p?.under) unders.push({ c, nodes: p.under });
    // Where the file puts it, for conditions placed by hand (every one in a ChemDraw file; in Octet's, those it marks).
    if (!octet || p?.placed === 1) anchors.set(c.id, toOctet(q[0], q[1]));
    const cyc = p?.cycle as Record<string, unknown> | undefined;
    if (cyc && Number.isInteger(cyc.cycle) && Number.isInteger(cyc.step) && isNum(cyc.step, 0, 63) && ["in", "out", "centre", "node", "name"].includes(cyc.side as string)) c.cycle = { cycle: cyc.cycle as number, step: cyc.step as number, side: cyc.side as "in", ...(isNum(cyc.at, 0, 1) ? { at: cyc.at as number } : {}), ...(isNum(cyc.reach, -1000, 1000) ? { reach: cyc.reach as number } : {}), ...(typeof cyc.through === "boolean" ? { through: cyc.through } : {}),
      ...(isNum(cyc.meet, 0, 1) ? { meet: cyc.meet as number } : {}), ...(Array.isArray(cyc.tail) && cyc.tail.length === 2 && isNum(cyc.tail[0], 0, 1) && isNum(cyc.tail[1], -1000, 1000) ? { tail: cyc.tail as [number, number] } : {}),
      ...((cyc.side === "in" || cyc.side === "out") && Number.isInteger(cyc.branch) && isNum(cyc.branch, 0, 1e6) ? { branch: cyc.branch as number } : {}),
      ...(cyc.side === "centre" && Array.isArray(cyc.off) && cyc.off.length === 2 && cyc.off.every((v) => isNum(v, -50, 50)) ? { off: cyc.off as [number, number] } : {}) } as CycleText;
    captions.push(c);
    // A repeated or missing file id points at the first text only, so a step's arrow never takes another's.
    const fid = int(t.attrs.id);
    if (fid !== undefined && !objectOf.has(fid)) objectOf.set(fid, c.id);
    member(group, c.id);
  }

  // Graphics: legacy arrows (unless their arrow is read), rectangles and ovals, orbitals, brackets and symbols.
  function readGraphic(x: Xml, group?: G, atoms?: number[]) {
    const type = x.attrs.GraphicType, box = reals(x.attrs.BoundingBox, 4), p = priv(x), z = zOf(x), cid = int(x.attrs.id) ?? -1;
    if (type === "Symbol") return void symbols.push({ x, atoms: atoms ?? [], group });
    if (!box) return lose("graphic");
    const [p1, p2] = [toOctet(box[0], box[1]), toOctet(box[2], box[3])], colour = colourOf(x.attrs.color);
    if (type === "Line" || type === "Arc") {
      const sup = int(x.attrs.SupersededBy);
      if (sup !== undefined && usable.has(sup)) return void arrowOfGraphic.set(cid, sup);
      // A legacy graphic on its own (spec 11.2): its old arrow type as heads.
      const t = x.attrs.ArrowType ?? "NoHead", half = (int(x.attrs.HeadSize) ?? 0) < 0 ? "HalfRight" : "HalfLeft";
      const stored: Stored = { arc: type === "Arc", head: ({ HalfHead: half, FullHead: "Full", Resonance: "Full", Equilibrium: "HalfLeft", Hollow: "Full", RetroSynthetic: "Full" } as Record<string, string>)[t],
        tail: ({ Resonance: "Full", Equilibrium: "HalfLeft" } as Record<string, string>)[t], type: t === "Hollow" ? "Hollow" : t === "RetroSynthetic" ? "Angle" : "Solid", spacing: t === "Equilibrium" || t === "RetroSynthetic" };
      if (type === "Line") return addArrow(x, group, stored, p2, p1, undefined, z);
      // An arc: the head, then the circle's centre; the tail is the head turned back by the sweep (spec 11.3).
      const ang = ((real(x.attrs.AngularSize) || 90) * Math.PI) / 180, th = Math.atan2(box[1] - box[3], box[0] - box[2]), rr = Math.hypot(box[0] - box[2], box[1] - box[3]);
      const round = (t: number) => toOctet(box[2] + rr * Math.cos(t), box[3] + rr * Math.sin(t));
      return addArrow(x, group, stored, round(th + ang), p1, round(th + ang / 2), z);
    }
    if (type === "Rectangle" || type === "Oval") {
      const [C, U, V] = [x.attrs.Center3D, x.attrs.MajorAxisEnd3D, x.attrs.MinorAxisEnd3D].map((s) => reals(s, 2) as P | undefined);
      const bits = new Set(((type === "Rectangle" ? x.attrs.RectangleType : x.attrs.OvalType) ?? "").split(/\s+/));
      let b: Box, angle = 0;
      if (C && U && V) {
        // The sides run along the axes; a turned shape takes its angle from the major axis (y runs down the page).
        const u = sub(U, C), v = sub(V, C), hx = len(u), hy = len(v);
        angle = exact(p?.angle, Math.round((Math.atan2(-u[1], u[0]) * 180000) / Math.PI) / 1000);
        b = [C[0] - hx, C[1] - hy, C[0] + hx, C[1] + hy];
      } else if (type === "Rectangle") b = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
      else {
        // Only the end of one axis and the centre: the other axis as ChemDraw's own export guesses it (spec 9.7).
        const a = Math.hypot(box[0] - box[2], box[1] - box[3]), other = bits.has("Circle") ? a : 0.4 * a, wide = Math.abs(box[0] - box[2]) >= Math.abs(box[1] - box[3]);
        b = [box[2] - (wide ? a : other), box[3] - (wide ? other : a), box[2] + (wide ? a : other), box[3] + (wide ? other : a)];
      }
      const kind: ShapeKind = type === "Oval" ? "oval" : p?.kind === "highlight" ? "highlight" : bits.has("RoundEdge") ? "rounded" : "box";
      const sh = settled({ id: newId(x), kind, from: toOctet(b[0], b[3]), to: toOctet(b[2], b[1]), angle, z });
      if (kind !== "highlight" && bits.has("Filled")) sh.fill = "solid"; else if (kind !== "highlight" && bits.has("Shaded")) sh.fill = p?.fill === "faded" ? "faded" : "shaded";
      if (bits.has("Shadow") || bits.has("Shadowed")) sh.shadow = true;
      if (bits.has("Dashed")) sh.dashed = true;
      if (bits.has("Bold")) sh.boldLine = true;
      if (colour && !(kind === "highlight" && colour === HIGHLIGHT)) sh.colour = colour;
      const shade = p?.shade as Record<string, unknown> | undefined;
      if (shade && isNum(shade.depth, 0, 1) && isNum(shade.blur, 0, 1) && isNum(shade.opacity, 0, 1)) sh.shade = { depth: shade.depth, blur: shade.blur, opacity: shade.opacity };
      if (type === "Oval" && bits.has("Circle") && !sh.fill) ovals.push({ id: sh.id, c: toOctet((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), r: (b[2] - b[0]) / 2 / B });
      addShape(sh, x, group);
      // Bold with a bold width of its own: the outline at that width, as the shape's own line width.
      const bw = real(x.attrs.BoldWidth);
      if (sh.boldLine && bw !== undefined && Math.abs(bw - style.bold * (sh.scale ?? 1)) > 0.02 * style.bold * (sh.scale ?? 1)) { delete sh.boldLine; sh.width = Math.round((bw / (sh.scale ?? 1)) * 1e4) / 1e4; }
      // A rounded box's corner and a shadow's depth (ChemDraw's CornerRadius and ShadowSize: hundredths of the shape's
      // line width), in bond lengths, when they are not what Octet writes for its own.
      const f = sh.scale ?? 1, lw = real(x.attrs.LineWidth) ?? style.line;
      const per = (k: string, unset: number) => { const v = int(x.attrs[k]); return v && v > 0 && v !== Math.round((unset * B * f * 100) / lw) ? Math.round(((v * lw) / (100 * B * f)) * 1e6) / 1e6 : undefined; };
      const radius = kind === "rounded" ? per("CornerRadius", 0.3) : undefined, depth = sh.shadow && !sh.shade ? per("ShadowSize", SHADE.depth) : undefined;
      if (radius !== undefined) sh.radius = Math.min(radius, 10);
      if (depth !== undefined) sh.shade = { ...SHADE, depth: Math.min(depth, 1) };
      return;
    }
    if (type === "Orbital") {
      const named = ORBITALS.find(([n]) => n === x.attrs.OrbitalType) ?? ORBITALS[0], o = p?.orbital as Record<string, unknown> | undefined;
      const orbital = o && ORBITAL_SHAPES.includes(o.shape as OrbitalShape) && PHASES.includes(o.phase as Phase) ? { shape: o.shape as OrbitalShape, phase: o.phase as Phase } : { shape: named[1], phase: named[2] };
      const f = graphicScale(x, p), w = lineWidthOf(x, f), a: Arrow & { z: number } = { id: newId(x), kind: "orbital", from: p2, to: p1, orbital, z, ...(colour ? { colour } : {}), ...(w ? { width: w } : {}), ...(x.attrs.LineType?.includes("Dashed") ? { style: "dashed" as const } : x.attrs.LineType?.includes("Bold") ? { style: "bold" as const } : {}) };
      if (f) a.scale = f;
      arrows.push(a);
      objectOf.set(cid, a.id);
      return void member(group, a.id);
    }
    if (type === "Bracket") return void brackets.push({ x, id: cid, z, group, ends: box });
    lose(`graphic ${type ?? ""}`.trim());
  }
  // A picture (an embedded object): its box, and its bytes kept as they came (in uppercase hex), to draw and to write
  // back (REL-15).
  function readPicture(x: Xml, group?: G) {
    const box = reals(x.attrs.BoundingBox, 4), picture = readPictureData(Object.fromEntries(Object.entries(x.attrs).filter(([k]) => PICTURE_KEYS.includes(k))));
    if (!box || !picture) return lose("picture");
    const b = [Math.min(box[0], box[2]), Math.min(box[1], box[3]), Math.max(box[0], box[2]), Math.max(box[1], box[3])];
    addShape({ id: newId(x), kind: "picture", from: toOctet(b[0], b[3]), to: toOctet(b[2], b[1]), picture, z: zOf(x) }, x, group);
  }
  // Live property text: on its caption, with the atoms it is for (CH-12). One whose caption or atoms Octet did not
  // read is counted as lost.
  function readKept() {
    const atomsIn = (ids?: string) => [...new Set(idList(ids).flatMap((id) => { const i = atomOf.get(id); return i === undefined ? [] : [i]; }))].slice(0, MAX_ATOMS);
    const keep = (x: Xml, names: string[]) => Object.fromEntries(names.filter((k) => x.attrs[k] !== undefined).map((k) => [k, cleanText(x.attrs[k]).replace(/\n/g, " ").slice(0, 200)]));
    for (const x of properties) {
      const c = captions.find((y) => y.id === objectOf.get(int(x.attrs.ChemicalPropertyDisplayID) ?? -1)), atoms = atomsIn(x.attrs.BasisObjects);
      if (c && atoms.length) c.property = { attrs: keep(x, PROPERTY_ATTRS), atoms }; else lose("property link");
    }
  }
  function addShape(sh: Shape & { z: number }, x: Xml, group?: G) {
    // A TLC plate's scale is read with its spots, so widths that do not agree are listed once.
    const f = sh.kind === "tlc" ? undefined : sh.scale ?? graphicScale(x, priv(x));
    if (f) sh.scale = f;
    // Its own line width, over its scale (a TLC plate's is read with its spots).
    const w = sh.kind === "tlc" ? undefined : lineWidthOf(x, sh.scale);
    if (w) sh.width = w;
    shapes.push(sh);
    objectOf.set(int(x.attrs.id) ?? -1, sh.id);
    member(group, sh.id);
  }

  // An arrow from what was stored: its kind (Octet's own when it kept one), the arc's middle as a bend, line style,
  // colour, and heads where they differ from the kind's.
  // curve: an arc of an ellipse (ChemDraw's elliptical arrows), which Octet holds as a pen curve with its heads.
  function addArrow(x: Xml, group: G | undefined, s: Stored, from: P, to: P, mid: P | undefined, z: number, curve?: CurvePoint[]) {
    const p = priv(x), named = p?.kind as ArrowKind, colour = colourOf(x.attrs.color);
    const a: Arrow & { z: number } = curve ? { id: newId(x), kind: "curve", from: curve[0].at, to: curve[curve.length - 1].at, curve: { points: curve }, z }
      : { id: newId(x), kind: ALL_ARROW_KINDS.includes(named) && named !== "orbital" && named !== "curve" ? named : kindOf(s), from, to, z };
    // A straight arrow Octet gave a point keeps it, and its bend; so does ChemDraw's curved equilibrium.
    if ((p?.point === true || (a.kind === "equilibrium" && mid)) && !curved(a)) a.point = true;
    const role = readPart(p?.role);
    if (role) a.role = role;
    const bends = curved(a) || a.point;
    // Octet's own bend is exact; ChemDraw's arc gives it to within the file's 0.01 pt.
    if (bends && isNum(p?.bend, -5, 5) && p!.bend) a.bend = p!.bend as number;
    else if (bends && mid) {
      const l = len(sub(to, from)) || 1, bend = ((mid[0] - (from[0] + to[0]) / 2) * -(to[1] - from[1]) + (mid[1] - (from[1] + to[1]) / 2) * (to[0] - from[0])) / (l * l);
      if (Math.abs(bend) > 1e-6) a.bend = Math.max(-5, Math.min(5, bend));
    }
    const lines = new Set((x.attrs.LineType ?? "").split(/\s+/));
    const style = p?.style === "doubled" ? "doubled" : lines.has("Dashed") ? "dashed" : lines.has("Bold") ? "bold" : lines.has("Wavy") ? "wavy" : undefined;
    if (style) a.style = style;
    if (colour) a.colour = colour;
    const f = graphicScale(x, p), w = lineWidthOf(x, f);
    if (f) a.scale = f;
    if (w) a.width = w;
    if (takesHeads(a)) {
      const kind = headsOf(a), start = headOf(s.tail), end = headOf(s.head);
      if (start !== kind.start) a.start = start;
      if (end !== kind.end) a.end = end;
    }
    if (shapesHeads(a)) { if (s.type === "Hollow") a.head = "hollow"; else if (s.type === "Angle") a.head = "angled"; }
    // Head sizes (hundredths of the line width), an equilibrium's ratio, and a block arrow's shaft and fill. ChemDraw
    // reads a missing notch as 7/8 of the length (flat on a block arrow) and a missing width as a quarter of it.
    const size = Math.abs(real(x.attrs.HeadSize) ?? 0) / 100;
    if ((s.head || s.tail) && size > 0 && size <= 500 && a.kind !== "retro") {
      const own = headOfLength(size, a.kind === "block"), centre = Math.abs(real(x.attrs.ArrowheadCenterSize) ?? 0) / 100, width = Math.abs(real(x.attrs.ArrowheadWidth) ?? 0) / 100;
      const hs = paletteHead(a, { length: size, centre: centre > 0 && centre <= 500 ? centre : own.centre, width: width > 0 && width <= 500 ? width : own.width }), kindOwn = headSize(a);
      if (Math.abs(hs.length - kindOwn.length) > 1e-3 || Math.abs(hs.centre - kindOwn.centre) > 1e-3 || Math.abs(hs.width - kindOwn.width) > 1e-3) a.headSize = hs;
    } else if (a.kind === "retro" && size > 0 && size <= 500 && Math.abs(size - headSize(a).length) > 1e-3) a.headSize = paletteHead(a, headOfLength(size)); // its notch and width are the open head's own
    const ratio = Math.abs(real(x.attrs.ArrowEquilibriumRatio) ?? 0) / 100;
    if (a.kind === "equilibrium" && ratio > 0 && Math.abs(ratio - 1) > 1e-3) a.ratio = Math.min(100, ratio);
    const shaft = Math.abs(real(x.attrs.ArrowShaftSpacing) ?? 0) / 100;
    if (a.kind === "block" && shaft > 0 && Math.abs(shaft - headSize(a).length) > 1e-3) a.shaft = Math.min(500, shaft);
    if (a.kind === "block" && (x.attrs.FillType === "Solid" || x.attrs.FillType === "Shaded")) a.fill = p?.fill === "faded" ? "faded" : x.attrs.FillType === "Solid" ? "solid" : "shaded";
    arrows.push(a);
    objectOf.set(int(x.attrs.id) ?? -1, a.id);
    const grid = p?.grid ? readGrid(p.grid, a.id) : undefined;
    if (grid) grids.push(grid);
    member(group, a.id);
  }
  const headName = (v?: string) => (v === "Full" || v === "HalfLeft" || v === "HalfRight" ? v : undefined);

  // An arrow: straight from Tail3D to Head3D, or an arc of the ellipse in its frame (spec 10.2). The middle of the
  // sweep becomes Octet's bend; endpoints off the ellipse scale it, as the spec's reading rule says.
  function readArrow(x: Xml, group?: G) {
    const id = int(x.attrs.id) ?? -1, head = reals(x.attrs.Head3D, 2), tail = reals(x.attrs.Tail3D, 2);
    if (!usable.has(id) && superseded.has(id)) return;
    if (!head || !tail) return lose("arrow");
    const angular = real(x.attrs.AngularSize) ?? 0, [C, U, V] = [x.attrs.Center3D, x.attrs.MajorAxisEnd3D, x.attrs.MinorAxisEnd3D].map((s) => reals(s, 2) as P | undefined);
    let mid: P | undefined, curve: CurvePoint[] | undefined;
    if (angular && C && U && V) {
      const A = sub(U, C), Bv = sub(V, C), det = cross(A, Bv), d = sub(tail as P, C);
      if (Math.abs(det) > 1e-9) {
        const cs = cross(d, Bv) / det, sn = cross(A, d) / det, k = Math.hypot(cs, sn), t = Math.atan2(sn, cs) + ((det > 0 ? -1 : 1) * angular * Math.PI) / 360;
        mid = toOctet(C[0] + k * (Math.cos(t) * A[0] + Math.sin(t) * Bv[0]), C[1] + k * (Math.cos(t) * A[1] + Math.sin(t) * Bv[1]));
        // An ellipse (its axes unequal or not square to each other): the arc as Bézier points, from tail to head.
        if (Math.abs(len(A) - len(Bv)) > 0.02 * Math.max(len(A), len(Bv)) || Math.abs(A[0] * Bv[0] + A[1] * Bv[1]) > 0.02 * len(A) * len(Bv)) {
          const c = toOctet(C[0], C[1]), axis = (v: P): [number, number] => sub(toOctet(C[0] + k * v[0], C[1] + k * v[1]), c), t0 = Math.atan2(sn, cs);
          curve = ellipsePoints(c, axis(A), axis(Bv), t0, t0 + ((det > 0 ? -1 : 1) * angular * Math.PI) / 180);
        }
      }
    }
    const spacing = (int(x.attrs.ArrowShaftSpacing) ?? 0) > 0;
    addArrow(x, group, { arc: !!mid, head: headName(x.attrs.ArrowheadHead), tail: headName(x.attrs.ArrowheadTail), type: x.attrs.ArrowheadType, spacing, nogo: x.attrs.NoGo === "Cross" || x.attrs.NoGo === "Hash" ? x.attrs.NoGo : undefined, dipole: yes(x.attrs.Dipole) },
      toOctet(tail[0], tail[1]), toOctet(head[0], head[1]), mid, zOf(x), curve);
  }

  // A pen curve: points in threes per anchor (in-handle, anchor, out-handle), CurveType bits and the newer
  // Closed, FillType and arrowhead fields together (spec 12).
  function readCurve(x: Xml, group?: G) {
    const raw = (x.attrs.CurvePoints ?? "").trim().split(/\s+/).map(real);
    if (raw.length < 6 || raw.length % 6 || raw.length > 6000 || raw.some((v) => v === undefined)) return lose("curve");
    const v = raw as number[], q = (k: number) => toOctet(v[2 * k], v[2 * k + 1]), same = (j: number, k: number) => v[2 * j] === v[2 * k] && v[2 * j + 1] === v[2 * k + 1];
    const points: CurvePoint[] = Array.from({ length: v.length / 6 }, (_, k) => ({ at: q(3 * k + 1), ...(same(3 * k, 3 * k + 1) ? {} : { c1: q(3 * k) }), ...(same(3 * k + 2, 3 * k + 1) ? {} : { c2: q(3 * k + 2) }) }));
    const bits = int(x.attrs.CurveType) ?? 0, p = priv(x), closed = !!(bits & 1) || yes(x.attrs.Closed), colour = colourOf(x.attrs.color);
    const a: Arrow & { z: number } = { id: newId(x), kind: p?.kind === "cut" ? "cut" : "curve", from: points[0].at, to: points[points.length - 1].at, curve: { points, ...(closed ? { closed: true } : {}) }, z: zOf(x) };
    const fill: CurveFill | undefined = p?.fill === "faded" ? "faded" : bits & 128 || x.attrs.FillType === "Solid" ? "solid" : bits & 256 || x.attrs.FillType === "Shaded" ? "shaded" : undefined;
    if (fill) a.fill = fill;
    const style: LineStyle | undefined = p?.style === "wavy" ? "wavy" : bits & 512 ? "doubled" : bits & 2 ? "dashed" : bits & 4 ? "bold" : undefined;
    if (style) a.style = style;
    const end = headName(x.attrs.ArrowheadHead) ?? (bits & 8 ? "Full" : bits & 32 ? "HalfLeft" : undefined), start = headName(x.attrs.ArrowheadTail) ?? (bits & 16 ? "Full" : bits & 64 ? "HalfLeft" : undefined);
    if (end) a.end = headOf(end);
    if (start) a.start = headOf(start);
    if ((end || start) && x.attrs.ArrowheadType === "Hollow") a.head = "hollow"; else if ((end || start) && x.attrs.ArrowheadType === "Angle") a.head = "angled";
    const size = Math.abs(real(x.attrs.HeadSize) ?? 0) / 100, centre = Math.abs(real(x.attrs.ArrowheadCenterSize) ?? 0) / 100, width = Math.abs(real(x.attrs.ArrowheadWidth) ?? 0) / 100;
    if ((end || start) && size > 0 && size <= 500) {
      const hs = paletteHead(a, { length: size, centre: centre > 0 && centre <= 500 ? centre : size * 0.875, width: width > 0 && width <= 500 ? width : size / 4 }), own = headSize(a);
      if (Math.abs(hs.length - own.length) > 1e-3 || Math.abs(hs.centre - own.centre) > 1e-3 || Math.abs(hs.width - own.width) > 1e-3) a.headSize = hs;
    }
    if (colour) a.colour = colour;
    const f = graphicScale(x, p), w = lineWidthOf(x, f), role = readPart(p?.role);
    if (f) a.scale = f;
    if (w) a.width = w;
    if (role) a.role = role;
    arrows.push(a);
    objectOf.set(int(x.attrs.id) ?? -1, a.id);
    member(group, a.id);
  }

  // A TLC plate (spec 21.1): its corners, lanes and spots. Spot sizes are 1/65536 pt; ones at Octet's own default
  // size are left unset again.
  function readTlc(x: Xml, group?: G) {
    const corners = ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((k) => reals(x.attrs[k], 2)).filter((c): c is number[] => !!c);
    const box = corners.length === 4 ? boxOf(corners as P[]) : reals(x.attrs.BoundingBox, 4);
    if (!box) return lose("TLC plate");
    const lanes = x.kids.filter((k) => k.name === "tlclane").slice(0, 40), spots: Spot[] = [], f = graphicScale(x, priv(x)) ?? 1;
    lanes.forEach((l, lane) => l.kids.forEach((s) => {
      if (s.name !== "tlcspot") return;
      if (spots.length >= 400) return lose("TLC spot");
      // Sizes as drawn, kept over the plate's scale.
      const spot: Spot = { lane, rf: Math.min(1, Math.max(0, real(s.attrs.Rf) ?? 0)) }, size = (k: string, d: number) => Math.min(5, Math.max(0, (int(s.attrs[k]) ?? 0) / 65536 / d / B / f));
      const [w, h, tail] = [size("Width", 2), size("Height", 2), size("Tail", 1)], colour = colourOf(s.attrs.color);
      if (w) spot.w = w;
      if (h) spot.h = h;
      if (tail) spot.tail = tail;
      if (colour) spot.colour = colour;
      // Its style, as ChemDraw keeps a spot's (CurveType: Filled 128, Dashed 2, Bold 4, Doubled 512; Octet's Shaded 256).
      // A ChemDraw spot without Filled is hollow; a file Octet wrote lists its hollow spots itself (below).
      const type = int(s.attrs.CurveType) ?? 0;
      if (type & 256) spot.style = "shaded";
      else if (!octet && !(type & 128)) spot.style = "hollow";
      if (type & 2) spot.dashed = true;
      if (type & 4) spot.bold = true;
      if (type & 512) spot.doubled = true;
      if (yes(s.attrs.ShowRf)) spot.showRf = true;
      spots.push(spot);
    }));
    const tlc: Tlc = { lanes: Math.max(1, lanes.length), spots }, p = priv(x);
    const origin = real(x.attrs.OriginFraction), front = real(x.attrs.SolventFrontFraction);
    if (origin !== undefined && origin >= 0 && Math.abs(origin - TLC_ORIGIN) > 1e-9) tlc.origin = Math.min(0.9, origin);
    if (front !== undefined && front >= 0 && Math.abs(front - TLC_FRONT) > 1e-9) tlc.front = Math.min(0.9, front);
    const hide = (["origin", "front", "border"] as const).filter((_, j) => !yes(x.attrs[["ShowOrigin", "ShowSolventFront", "ShowBorders"][j]]));
    if (hide.length) tlc.hide = [...hide];
    if (yes(x.attrs.ShowSideTicks)) tlc.ticks = true;
    if (yes(x.attrs.Transparent)) tlc.transparent = true;
    // Octet's own: spot order, hollow spots, and Rf shown for all.
    const list = (v: unknown) => (typeof v === "string" ? v.split(" ").map(Number).filter((k) => Number.isInteger(k) && k >= 0 && k < spots.length) : []);
    const order = list(p?.order);
    if (order.length === spots.length && new Set(order).size === spots.length) { const was = [...spots]; order.forEach((k, j) => { spots[k] = was[j]; }); }
    for (const k of list(p?.hollow)) spots[k].style = "hollow";
    if (p?.rf === true) { tlc.rf = true; const own = new Set(list(p.own)); spots.forEach((s, k) => { if (own.has(k)) s.showRf = true; else delete s.showRf; }); }
    const sh: Shape & { z: number } = { id: newId(x), kind: "tlc", from: toOctet(box[0], box[3]), to: toOctet(box[2], box[1]), tlc, z: zOf(x), ...(f !== 1 ? { scale: f } : {}) }, colour = colourOf(x.attrs.color), w = lineWidthOf(x, f);
    if (colour) sh.colour = colour;
    if (w) sh.width = w;
    // The Rf values' size is the plate's own size times its scale.
    const labelSize = real(x.attrs.LabelSize);
    Object.assign(sh, textStyleOf(x.attrs.LabelFont === undefined ? undefined : fontOf(fonts.get(int(x.attrs.LabelFont) ?? -1)).font, labelSize === undefined ? undefined : Math.round((labelSize / f) * 100) / 100, int(x.attrs.LabelFace)));
    const t = tlcLayout(sh);
    for (const s of spots) {
      const d = t.size({ lane: s.lane, rf: s.rf });
      if (s.w !== undefined && Math.abs(s.w * f - d.rx) < 1e-3) delete s.w;
      if (s.h !== undefined && Math.abs(s.h * f - d.ry) < 1e-3) delete s.h;
    }
    addShape(sh, x, group);
  }

  // An R-group definition (ChemDraw's named alternative group): a box at its group frame, titled with its name
  // (R1), and its fragments, read as any others are (they stay in the box).
  function readAltGroup(x: Xml, group?: G) {
    const frame = reals(x.attrs.GroupFrame, 4) ?? reals(x.attrs.BoundingBox, 4), title = x.kids.find((k) => k.name === "t");
    const name = cleanText(title?.kids.filter((k) => k.name === "s").map((k) => k.text).join("") ?? "").replace(/\s+/g, "");
    if (frame && rNumber(name)) {
      const sh: Shape & { z: number } = { id: newId(x), kind: "box", from: toOctet(Math.min(frame[0], frame[2]), Math.max(frame[1], frame[3])), to: toOctet(Math.max(frame[0], frame[2]), Math.min(frame[1], frame[3])), rgroup: { name }, z: zOf(x) };
      const colour = colourOf(x.attrs.color);
      if (colour) sh.colour = colour;
      if (priv(x)?.dashed === true) sh.dashed = true;
      addShape(sh, x, group);
    } else lose("R-group definition");
    for (const k of x.kids) if (k !== title) visit(k, group);
  }

  // A table Octet wrote: the table from Octet's data, its box from the group's.
  function readTableGroup(x: Xml, p: Record<string, unknown>, group?: G) {
    const table = readTable(p.table), box = reals(x.attrs.BoundingBox, 4), colour = colourOf(x.attrs.color);
    if (!table || !box) return lose("table");
    const sh: Shape & { z: number } = { id: newId(x), kind: "table", from: toOctet(box[0], box[3]), to: toOctet(box[2], box[1]), table, z: zOf(x), ...textStyleOf(typeof p.font === "string" ? p.font : undefined, p.size, p.face) };
    if (p.dashed === true) sh.dashed = true;
    if (colour) sh.colour = colour;
    addShape(sh, x, group);
  }

  // Brackets: Octet's pairs from its data; ChemDraw's by facing pairs of the same type that overlap (spec 9.9). A
  // bracket's lips are on the right of the way it runs, so one that runs up the page is a left bracket, and one that
  // runs any other way is a left bracket turned (a right bracket is one turned a half).
  function readBrackets() {
    const done = new Set<number>(), ends = (b: (typeof brackets)[number]): [P, P] => [toOctet(b.ends[0], b.ends[1]), toOctet(b.ends[2], b.ends[3])];
    const way = (b: (typeof brackets)[number]): P => { const [A, Z] = ends(b), d = sub(Z, A), l = len(d) || 1; return [d[0] / l, d[1] / l]; };
    const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1], mid = (b: (typeof brackets)[number]): P => { const [A, Z] = ends(b); return [(A[0] + Z[0]) / 2, (A[1] + Z[1]) / 2]; };
    // o faces b: it runs the other way, on b's lips side, and the two overlap along b by half the shorter.
    const faces = (b: (typeof brackets)[number], o: (typeof brackets)[number]) => {
      const t = way(b), n: P = [t[1], -t[0]], along = (q: P) => dot(q, t), [A, Z] = ends(b), [C, D] = ends(o);
      const lo = Math.max(Math.min(along(A), along(Z)), Math.min(along(C), along(D))), hi = Math.min(Math.max(along(A), along(Z)), Math.max(along(C), along(D)));
      return dot(way(o), t) < -0.99 && dot(sub(mid(o), mid(b)), n) > 0 && hi - lo > 0.5 * Math.min(len(sub(Z, A)), len(sub(D, C)));
    };
    brackets.forEach((b, k) => {
      if (done.has(k) || (octet && priv(b.x)?.pair !== undefined)) return;
      done.add(k);
      const type = b.x.attrs.BracketType ?? "RoundPair", kind = BRACKETS[type] ?? "parens", pair = type.endsWith("Pair"), p = priv(b.x);
      const j = pair ? -1 : brackets.findIndex((o, n) => !done.has(n) && (octet ? priv(o.x)?.pair === b.id : BRACKETS[o.x.attrs.BracketType ?? ""] === kind && (faces(b, o) || faces(o, b))));
      if (j >= 0) done.add(j);
      // The angle from the way the first bracket runs (a pair is the same turned a half); the shape's box is its
      // brackets' ends turned upright about their middle.
      const o = brackets[j], t = way(b), angle = exact(p?.angle, Math.round((Math.atan2(t[1], t[0]) * 180000) / Math.PI) / 1000 - 90);
      const points = [...ends(b), ...(o ? ends(o) : [])], c: P = [points.reduce((v, q) => v + q[0], 0) / points.length, points.reduce((v, q) => v + q[1], 0) / points.length];
      const upright = points.map((q) => turnPoint(q, c, -angle)), xs = upright.map((q) => q[0]), ys = upright.map((q) => q[1]);
      const sh: Shape & { z: number } = { id: newId(b.x), kind, from: [Math.min(...xs), Math.max(...ys)], to: [Math.max(...xs), Math.min(...ys)], angle, z: b.z };
      if (!pair && !o) {
        // One bracket alone: its box reaches its width to the right of it (Octet's width, or a bond length).
        sh.side = "left";
        const span = p?.span, w = Array.isArray(span) && span.length === 2 && span.every((v) => isNum(v, -1e6, 1e6)) ? Math.abs((span[1] as number) - (span[0] as number)) : 1;
        sh.to[0] = sh.from[0] + Math.max(0.05, w);
        // The box was turned upright about the bracket's middle: it goes back about its own.
        const m: P = [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2], d = sub(turnPoint(m, c, angle), m);
        sh.from = [sh.from[0] + d[0], sh.from[1] + d[1]];
        sh.to = [sh.to[0] + d[0], sh.to[1] + d[1]];
      }
      // Turned brackets of Octet's own: their level corners and turn.
      const corners = p?.corners as unknown[] | undefined;
      if (octet && isNum(p?.angle, -360, 360) && Array.isArray(corners) && corners.length === 2 && corners.every((q) => Array.isArray(q) && q.length === 2 && q.every((v) => isNum(v, -1e6, 1e6)))) {
        [sh.from, sh.to] = corners as [P, P];
        sh.angle = p!.angle as number;
        if (p!.side === "left" || p!.side === "right") sh.side = p!.side; else delete sh.side;
      }
      if (typeof p?.mark === "string" && p.mark.length <= 8) sh.mark = p.mark;
      const colour = colourOf(b.x.attrs.color);
      if (colour) sh.colour = colour;
      if (b.x.attrs.LineType?.includes("Dashed")) sh.dashed = true;
      // Display Warnings off when every bracket of the pair has it off.
      if ([b, o].every((x) => !x || yes(x.x.attrs.IgnoreWarnings))) sh.ignoreWarnings = true;
      // A pair's polymer meaning: Octet's own, else from the bracket that carries it (and its bracketed group).
      if (!sh.side) {
        const poly = (octet ? readPolymer(p?.polymer) : undefined) ?? polymerOf([b, o].filter(Boolean).map((x) => x!.x), [b.id, o?.id ?? -1]);
        // A bracketed group with no usage (Unspecified) is kept on the pair, and written back round the atoms inside.
        if (poly) sh.polymer = poly; else if (bracketed.some((g) => g.kids.some((k) => [b.id, o?.id ?? -1].includes(int(k.attrs.GraphicID) ?? -2)))) sh.bracketed = true;
      }
      addShape(settled(sh), b.x, b.group);
      if (o) objectOf.set(o.id, sh.id);
    });
  }

  // A bracket pair's polymer meaning, as ChemDraw keeps it on a bracket graphic: its usage, repeat pattern and flip
  // type, and its labels in object tags (a multiple group's count, an SRU's label, a component's order, a
  // parameterizable bracket's label and Mw). A multiple group with a parameterized label or Mw is parameterizable.
  // The bracketed group fills in what the graphic does not say.
  function polymerOf(xs: Xml[], ids: number[]): Polymer | undefined {
    const carrier = xs.find((x) => x.attrs.BracketUsage && x.attrs.BracketUsage !== "Unspecified"), grp = bracketed.find((g) => g.kids.some((k) => ids.includes(int(k.attrs.GraphicID) ?? -2)));
    const usageName = carrier?.attrs.BracketUsage ?? grp?.attrs.BracketUsage, tags = new Map<string, string>();
    for (const x of xs) for (const k of x.kids) if (k.name === "objecttag" && k.attrs.Name) tags.set(k.attrs.Name, cleanText(k.kids.find((t) => t.name === "t")?.kids.filter((r) => r.name === "s").map((r) => r.text).join("") ?? k.attrs.Value ?? "").trim().slice(0, 20));
    let usage = USAGE_KINDS.find((u) => u !== "param" && USAGES[u].cdxml === usageName);
    if (!usage) return undefined;
    if (usage === "mult" && (tags.has("parameterizedBracketLabel") || tags.has("molecularWeightOverride"))) usage = "param";
    const p: Polymer = { usage }, src = carrier ?? grp, label = tags.get(usage === "param" ? "parameterizedBracketLabel" : "bracketusage");
    const pattern = { HeadToHead: "hh", EitherUnknown: "eu" }[src?.attrs.PolymerRepeatPattern ?? grp?.attrs.PolymerRepeatPattern ?? ""], flip = { NoFlip: "noflip", Flip: "flip" }[src?.attrs.PolymerFlipType ?? grp?.attrs.PolymerFlipType ?? ""];
    if (pattern) p.pattern = pattern as Polymer["pattern"];
    if (flip) p.flip = flip as Polymer["flip"];
    if (usage === "sru") { const l = label || grp?.attrs.SRULabel; if (l && l !== "n") p.label = l.slice(0, 20); }
    if (usage === "mult") { const n = real(label) ?? real(grp?.attrs.RepeatCount); if (n !== undefined && n > 0 && n < 1e6 && n !== 2) p.label = String(n); }
    if (usage === "param" && label) p.label = label;
    if (usage === "param") { const mw = real(tags.get("molecularWeightOverride")?.replace(/^\D*/, "")); if (mw !== undefined && mw > 0) p.mw = mw; }
    if (usage === "c") { const o = int(label?.replace(/^c/, "")) ?? int(grp?.attrs.ComponentOrder); if (o !== undefined && o > 0 && o <= 999) p.order = o; }
    return p;
  }

  // Symbols: a charge or radical they represent belongs to that node; lone pairs and stray electrons to the
  // nearest atom (in their own fragment first); other signs become text.
  function readSymbols() {
    const nearest = (c: P, among: number[]) => among.reduce<number | undefined>((best, i) => {
      const d = len(sub(mol.atoms[i].location as unknown as P, c));
      return d < 1 && (best === undefined || d < len(sub(mol.atoms[best].location as unknown as P, c))) ? i : best;
    }, undefined);
    const everyAtom = mol.atoms.map((_, i) => i), electrons = new Map<number, number>(); // linked electrons read per atom
    for (const { x, atoms, group } of symbols) {
      const type = x.attrs.SymbolType ?? "LonePair", box = reals(x.attrs.BoundingBox, 2);
      if (!box) { lose("symbol"); continue; }
      const c = toOctet(box[0], box[1]), linked = x.kids.filter((k) => k.name === "represent").map((k) => atomOf.get(int(k.attrs.object) ?? -1)).find((i) => i !== undefined);
      const sign = ({ Plus: 1, CirclePlus: 1, RadicalCation: 1, Minus: -1, CircleMinus: -1, RadicalAnion: -1 } as Record<string, number>)[type], unpaired = type === "Electron" || type.startsWith("Radical");
      // Where a ChemDraw file puts a mark round its atom is its angle (Atom.angles), by the renderer's key.
      const place = (a: Atom, key: string) => { if (!octet) a.angles = { ...a.angles, [key]: Math.round((Math.atan2(c[1] - a.location[1], c[0] - a.location[0]) * 1800) / Math.PI) / 10 }; };
      if (linked !== undefined && (sign || unpaired)) {
        const a = mol.atoms[linked];
        if (sign && !a.charge) a.charge = sign;
        if (type.startsWith("Circle")) a.circled = true;
        if (unpaired && !a.radical) a.radical = 1;
        // A radical ion's symbol is its charge and electron together: it keeps no place of its own.
        if (type === "Electron") { const n = electrons.get(linked) ?? 0; electrons.set(linked, n + 1); if (n < 2) place(a, `radical${n}`); }
        else if (sign && !unpaired) place(a, "charge");
        continue;
      }
      if (linked !== undefined && type.startsWith("LonePair") && mol.atoms[linked].radical === 3 && x.kids.some((k) => k.name === "represent" && k.attrs.attribute === "Radical")) {
        if (type === "LonePairBar") mol.atoms[linked].bars = true;
        place(mol.atoms[linked], "pair0");
        continue;
      }
      if (type === "LonePair" || type === "LonePairBar" || type === "Electron") {
        const i = nearest(c, atoms) ?? nearest(c, everyAtom);
        if (i === undefined) { lose("symbol"); continue; }
        const a = mol.atoms[i], key = type === "Electron" ? `radical${a.radical ?? 0}` : `pair${(a.pairs ?? 0) + (a.radical === 3 ? 1 : 0)}`;
        if (type === "Electron") a.radical = Math.min(2, (a.radical ?? 0) + 1); else a.pairs = Math.min(4, (a.pairs ?? 0) + 1);
        if (type === "LonePairBar") a.bars = true;
        // A ChemDraw file's lone pairs and radicals stay where it put them round the atom.
        if (/^(radical[01]|pair[0-3])$/.test(key)) place(a, key);
        continue;
      }
      const text = SYMBOL_TEXT[type];
      if (!text) { lose("symbol"); continue; }
      const id = newId(x);
      captions.push({ id, text, x: c[0], y: c[1] - (0.35 * style.captionSize) / B, z: zOf(x) });
      member(group, id);
    }
  }

  // Steps: conditions above and below an arrow become that arrow's conditions (straight arrows, or any in Octet's
  // own files), and atom-map pairs give both atoms one map number (spec 14). Turned text stays where the file puts
  // it, as Octet lays conditions out level. A ChemDraw file's conditions keep the places ChemDraw gave them, by their
  // arrow (Caption.placed), as do those Octet's own file marks.
  function readSteps() {
    let maps = mol.atoms.reduce((m, a) => Math.max(m, a.map ?? 0), 0);
    for (const s of steps) {
      const id = idList(s.attrs.ReactionStepArrows).map((g) => objectOf.get(arrowOfGraphic.get(g) ?? g)).find((v) => v !== undefined), arrow = arrows.find((a) => a.id === id);
      if (arrow && (octet || straightArrow(arrow))) for (const side of ["above", "below"] as const) {
        for (const cid of idList(s.attrs[side === "above" ? "ReactionStepObjectsAboveArrow" : "ReactionStepObjectsBelowArrow"])) {
          const c = captions.find((x) => x.id === objectOf.get(cid));
          if (!c || c.cycle || c.on || c.angle || unders.some((u) => u.c === c)) continue;
          c.on = { arrow: arrow.id, side };
          const q = anchors.get(c.id), d: P = [arrow.to[0] - arrow.from[0], arrow.to[1] - arrow.from[1]];
          if (q) c.placed = { at: [q[0] - (arrow.from[0] + arrow.to[0]) / 2, q[1] - (arrow.from[1] + arrow.to[1]) / 2], arrow: d };
        }
      }
      for (const key of ["ReactionStepAtomMap", "ReactionStepAtomMapManual", "ReactionStepAtomMapAuto"]) {
        const list = idList(s.attrs[key]);
        for (let k = 0; k + 1 < list.length; k += 2) {
          const i = atomOf.get(list[k]), j = atomOf.get(list[k + 1]);
          if (i === undefined || j === undefined) continue;
          const n = mol.atoms[i].map ?? mol.atoms[j].map ?? (maps < 9999 ? ++maps : undefined);
          if (!n) continue;
          mol.atoms[i].map ??= n;
          mol.atoms[j].map ??= n;
        }
      }
    }
  }

  // Cycles are Octet's own (no CDXML object holds one): their ids are kept first, their atoms found after.
  const cycleData = octet && Array.isArray(top!.cycles) ? (top!.cycles as Record<string, unknown>[]).slice(0, MAX_OBJECTS) : [];
  for (const c of cycleData) if (c && Number.isInteger(c.id) && (c.id as number) > 0 && (c.id as number) < 2 ** 31) taken.add(c.id as number);
  for (const pg of pages) for (const k of pg.kids) visit(k);
  readBonds();
  const fills = readFills();
  readScales();
  readLabels();
  readDelocalised();
  readLigands();
  readSymbols();
  readBrackets();
  readSteps();
  readKept();
  // R-Logic rows, on the R-group definitions they name.
  for (const row of logic) {
    const sh = shapes.find((x) => x.rgroup?.name === row.attrs.RLogicGroup);
    if (!sh) continue;
    const r = readRgroup({ name: sh.rgroup!.name, occur: row.attrs.RLogicOccurrence || undefined, restH: yes(row.attrs.RLogicRestH) ? true : undefined, then: row.attrs.RLogicIfThenGroup || undefined });
    if (r) sh.rgroup = r;
  }
  for (const { c, nodes } of unders) {
    const under = Array.isArray(nodes) ? [...new Set(nodes.map((n) => atomOf.get(Number.isInteger(n) ? (n as number) : -1)).filter((i): i is number => i !== undefined))] : [];
    if (under.length) c.under = under;
  }
  // A cycle id the file repeats is the first cycle's: the others go, so deleting one never deletes two.
  const seenCycle = new Set<number>();
  const cycles: Cycle[] = cycleData.flatMap((c) => {
    // A cycle drawn with the Cycle tool has each node's angle, and keeps its breaks (empty nodes).
    const centre = c?.centre, all = Array.isArray(c?.nodes) ? (c.nodes as unknown[]).slice(0, 64).map((n) => (Array.isArray(n) ? n.map((id) => atomOf.get(Number.isInteger(id) ? id : -1)).filter((i): i is number => i !== undefined) : [])) : [];
    const at = Array.isArray(c?.at) && c.at.length === all.length && c.at.every((v) => isNum(v, -10, 10)) ? (c.at as number[]) : undefined, nodes = at ? all : all.filter((n) => n.length);
    if (!Array.isArray(centre) || centre.length !== 2 || !centre.every((v) => isNum(v, -1e6, 1e6)) || !isNum(c.radius, 1e-6, 1e6) || (!at && nodes.length < 2) || !Number.isInteger(c.id) || seenCycle.has(c.id as number)) return [];
    seenCycle.add(c.id as number);
    // Structures as reagents and products (32 at most), by their atoms' ids.
    const sides = Array.isArray(c.sides) ? (c.sides as Record<string, unknown>[]).slice(0, 32).flatMap((s) => {
      const atoms = Array.isArray(s?.atoms) ? (s.atoms as unknown[]).slice(0, 4096).map((id) => atomOf.get(Number.isInteger(id) ? (id as number) : -1)).filter((i): i is number => i !== undefined) : [];
      return atoms.length && (s.side === "in" || s.side === "out") ? [{ side: s.side as "in" | "out", atoms }] : [];
    }) : [];
    // Each step's settings and the side arrows, checked as in .oct: left out when anything is wrong.
    const steps = c.steps === undefined ? undefined : readCycleSteps(c.steps), branches = c.branches === undefined ? undefined : readBranches(c.branches, nodes.length, (id) => atomOf.get(Number.isInteger(id) ? (id as number) : -1));
    return [{ id: c.id as number, centre: centre as P, radius: c.radius as number, clockwise: c.clockwise !== false, nodes, ...(at ? { at } : {}), ...(isColour(c.colour) ? { colour: c.colour } : {}), ...(isNum(c.width, 0.05, 20) ? { width: c.width as number } : {}), ...(isNum(c.gap, 0, 100) ? { gap: c.gap as number } : {}),
      ...(c.head === "hollow" || c.head === "angled" ? { head: c.head } : {}), ...(c.arrowSize === "large" || c.arrowSize === "medium" ? { arrowSize: c.arrowSize } : {}), ...(isNum(c.scale, 0.01, 100) && c.scale !== 1 ? { scale: c.scale as number } : {}), ...(Number.isInteger(c.order) && c.order !== 0 && isNum(c.order, -1e6, 1e6) ? { order: c.order as number } : {}),
      ...(steps?.some(Boolean) ? { steps } : {}), ...(branches?.length ? { branches } : {}), ...(sides.length ? { sides } : {}) } as Cycle];
  });
  for (const c of captions) if (c.cycle && !cycles.some((y) => y.id === c.cycle!.cycle)) delete c.cycle;
  // A side arrow's text names a branch of its cycle on its step; any other is read as an old one (migrateCycles).
  for (const c of captions) if (c.cycle?.branch !== undefined && !cycles.find((y) => y.id === c.cycle!.cycle)!.branches?.some((b) => b.id === c.cycle!.branch && b.step === c.cycle!.step)) delete c.cycle.branch;
  // Formula runs whose text is no longer drawn as a formula (turned conditions stay free text, a cycle's text whose
  // cycle is gone) keep them, so the page still shows the subscripts the file has.
  for (const [c, runs] of asFormula) if (!formulaCaption(c)) c.runs = runs;
  // ChemDraw's kept configurations: the neighbours along each bond of the order (0 is the hydrogen or lone pair), with
  // the stereo bonds as they are now. Show Stereochemistry labels from these first, as ChemDraw does (cip.ts).
  if (tetra.length) {
    const bondOf = new Map(bondIds.map((id, k) => [id, k]));
    for (const { i, order } of tetra) {
      const atoms = order.map((id) => { if (!id) return -1; const b = mol.bonds[bondOf.get(id) ?? -1]; return b?.atoms.includes(i) ? (b.atoms[0] === i ? b.atoms[1] : b.atoms[0]) : undefined; });
      if (atoms.length === 4 && atoms.every((j) => j !== undefined && j !== i) && new Set(atoms).size === 4) mol.atoms[i].kept = { atoms: atoms as number[], marks: stereoMarks(mol, i, atoms as number[]) };
    }
  }
  // Spectrum-structure assignments: each tag's ranges in the spectrum with a tag of the same value (else the one whose
  // range holds them), as links from the atom or bond to the multiplets they name. A tag with no spectrum is lost.
  for (const { atom, bond, values, exact } of assigned) {
    const ids = new Set<number>();
    for (const v of values) {
      const ranges = assignRanges(v), holds = (m: Measured) => ranges.every(([lo, hi]) => (lo + hi) / 2 >= Math.min(m.first, m.last) && (lo + hi) / 2 <= Math.max(m.first, m.last));
      const r = spectraRead.find((s) => s.values.has(v)) ?? (exact?.has(v) ? undefined : spectraRead.find((s) => holds(s.m)));
      if (exact?.has(v) && !r) continue;
      if (!r || !ranges.length) { lose("spectrum assignment"); continue; }
      const got = assignGroups(r.m, ranges, nextGroup);
      r.m = got.m;
      nextGroup = nextGroupId(spectraRead.map((s) => s.m));
      for (const k of got.ids) ids.add(k);
    }
    const on = atom !== undefined ? mol.atoms[atom] : mol.bonds[bond!];
    if (ids.size && on) on.peaks = [...ids].slice(0, 64);
  }
  if (spectraRead.length) mol.spectra = spectraRead.map((s) => s.m);
  // Octet's own files: atoms and bonds back in Octet's order (their ids rise in it).
  let ix = (i: number) => i;
  if (octet) {
    const order = mol.atoms.map((_, i) => i).sort((p, q) => nodeIds[p] - nodeIds[q]), place = new Map(order.map((i, k) => [i, k]));
    ix = (i) => place.get(i)!;
    mol.bonds = mol.bonds.map((b, k) => [b, bondIds[k]] as const).sort((p, q) => p[1] - q[1]).map(([b]) => ({ ...b, atoms: [ix(b.atoms[0]), ix(b.atoms[1])] }));
    mol.atoms = order.map((i) => renumberCentre(mol.atoms[i], ix));
    for (const c of captions) if (c.under) c.under = c.under.map(ix);
    for (const c of cycles) { c.nodes = c.nodes.map((n) => n.map(ix)); if (c.sides) c.sides = c.sides.map((s) => ({ ...s, atoms: s.atoms.map(ix) })); Object.assign(c, mapBranches(c, ix)); }
    for (const c of captions) if (c.property) c.property.atoms = c.property.atoms.map(ix);
  }
  const byZ = <T extends { z: number }>(list: T[]) => list.map((x, k) => [x, k] as const).sort((p, q) => p[0].z - q[0].z || p[1] - q[1]).map(([x]) => { const out = { ...x } as Partial<T>; delete out.z; return out as Omit<T, "z">; });
  // Captions and arrows in id order (Octet draws them by kind); shapes in drawing order, which Octet keeps.
  if (captions.length) mol.captions = byZ(captions).sort((p, q) => p.id - q.id);
  // Arrows in drawing order (Bring to front and Send to back). Octet draws filled curves and orbitals behind the
  // structures and the other arrows in front, so those come first, as the writer puts them.
  const behind = (a: Arrow) => !a.order && (a.kind === "orbital" || !!(a.curve?.closed && a.fill));
  if (arrows.length) mol.arrows = byZ(arrows).sort((p, q) => Number(behind(q)) - Number(behind(p)));
  // Filled shapes drawn above every structure are in front of them, as Octet's Bring to Front puts them (in Octet's own
  // files too: a shape it wrote there was brought to the front).
  for (const sh of shapes) if ((sh.fill || sh.kind === "highlight") && turns(sh) && sh.z > fragmentZ && fragmentZ > -Infinity && !sh.order) sh.order = 1;
  if (shapes.length) mol.shapes = byZ(shapes);
  if (cycles.length) mol.cycles = cycles;
  if (grids.length) mol.grids = grids;
  const ids = new Set([...captions, ...arrows, ...shapes, ...cycles].map((x) => x.id));
  const kept = groups.map((g): Group => ({ id: g.id, atoms: [...g.atoms].map(ix).sort((p, q) => p - q), items: [...new Set(g.items.filter((id) => ids.has(id)))].sort((p, q) => p - q), ...(g.integral ? { integral: true } : {}), ...(g.annotations ? { annotations: g.annotations } : {}), ...(g.plot ? { plot: g.plot } : {}) }));
  if (annotations.length) mol.annotations = annotations;
  if (kept.length) mol.groups = kept;
  if (fills.length) mol.fills = fills.map((f) => ({ ...f, atoms: f.atoms.map(ix) }));
  if (octet && top!.guides !== undefined) mol.guides = readGuides(top!.guides);
  // π rings from Octet 1.0.x (no app on the root) as ligand() now orders them.
  return { mol: tidyGroups(migrateCycles(octet && top!.app === undefined ? oldLigands(mol) : mol)), style, lost };
}
