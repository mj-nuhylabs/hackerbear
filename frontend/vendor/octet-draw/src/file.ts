// Octet's own file format: versioned, human-readable JSON. Treat every file as hostile: check it fully on read.
import { fontName, readGuides, readStyle } from "./docstyle.ts";
import { normalise, plainOf, type TextRun } from "./richtext.ts";
import { rings } from "./rings.ts";
import { MAX_ANNOTATIONS, MAX_CONTENT, MAX_KEYWORD, OWN_BOND_ATTRS, PROPERTY_ATTRS, readPictureData } from "./cdxml.ts";
import { oldLigands, tidyGroups } from "./edit.ts";
import { migrateCycles, readBranches, readSteps, type Cycle, type CycleSide, type CycleText } from "./cycle.ts";
import { readAtomQuery, readBondQuery, readPolymer, readRgroup } from "./query.ts";
import { ALL_ARROW_KINDS, HBOND, isBracket, ORBITAL_SHAPES, QUADRUPLE, PHASES, SHAPE_KINDS, type Annotation, type CurveFill, type Head, type HeadShape, type Arrow, type ArrowKind, type LineStyle, type OrbitalShape, type Phase, type Shape, type ShapeKind, type Shade, type Curve, type Table, type TableLine, type CellAlign, type Tlc, type Atom, type Bond, type Caption, type Display, type Kept, type Mol, type HeadSize } from "./render.ts";
import { readGrid } from "./stoich.ts";
import { keyOf, readMeasured, writeMeasured } from "./measured.ts";
import { readPart, readPlot, type PlotPart } from "./pageplot.ts";
import pkg from "../package.json" with { type: "json" };

export const FORMAT = "octet";
export const VERSION = 1;
// app: the Octet that wrote the file (from 1.1.0; files from 1.0.x have none).
const MAX_ATOMS = 100_000;
const DISPLAYS: Display[] = ["bold", "dashed", "hashed", "wavy", "dative", "hollow", "either", "aromatic"];
const MAX_CAPTIONS = 10_000, MAX_TEXT = 2_000;
const HEADS: Head[] = ["none", "full", "left", "right"];

// A label's kept group (Contract Label's, or a residue label's): its atoms (element, place, charge) and bonds (order,
// wedge or hash). At most 256 atoms and 512 bonds, as a ChemDraw file's.
const innerOut = (m: Mol) => ({ atoms: m.atoms.map((x) => ({ label: x.label, x: round(x.location[0]), y: round(x.location[1]), ...(x.charge ? { charge: x.charge } : {}) })),
  bonds: m.bonds.map((b) => ({ atoms: b.atoms, type: b.type, ...(b.stereo ? { stereo: b.stereo } : {}) })) });
function innerIn(v: unknown): Mol | undefined {
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e6, int = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
  const o = v as { atoms?: unknown; bonds?: unknown } | undefined;
  if (!o || !Array.isArray(o.atoms) || !Array.isArray(o.bonds) || !o.atoms.length || o.atoms.length > 256 || o.bonds.length > 512) return undefined;
  const atoms = (o.atoms as Record<string, unknown>[]).map((x) => (typeof x?.label === "string" && /^[A-Z][a-z]{0,2}$/.test(x.label) && num(x.x) && num(x.y) && (x.charge === undefined || int(x.charge, -9, 9))
    ? { label: x.label, location: [x.x as number, x.y as number, 0] as [number, number, number], ...(x.charge ? { charge: x.charge as number } : {}) } : undefined));
  const n = atoms.length, bonds = (o.bonds as Record<string, unknown>[]).map((b) => {
    const e = b?.atoms as unknown[];
    return Array.isArray(e) && e.length === 2 && e.every((i) => int(i, 0, n - 1)) && e[0] !== e[1] && int(b.type, 1, 3) && (b.stereo === undefined || b.stereo === 1 || b.stereo === 6)
      ? { atoms: [e[0], e[1]] as [number, number], type: b.type as number, ...(b.stereo ? { stereo: b.stereo as number } : {}) } : undefined;
  });
  return atoms.every(Boolean) && bonds.every(Boolean) ? { atoms: atoms as Mol["atoms"], bonds: bonds as Mol["bonds"] } : undefined;
}

export function serialize(mol: Mol): string {
  const atoms = mol.atoms.map((a) => ({ label: a.label, x: round(a.location[0]), y: round(a.location[1]), ...(round(a.location[2] ?? 0) ? { z: round(a.location[2]) } : {}), ...(a.shade ? { shade: true } : {}), ...(a.charge ? { charge: a.charge } : {}), ...(a.text ? { text: a.text } : {}),
    ...(a.text && a.runs && plainOf(a.runs) === a.text ? { runs: a.runs } : {}), ...(a.centre ? { centre: a.centre } : {}),
    ...(a.radical ? { radical: a.radical } : {}), ...(a.isotope ? { isotope: a.isotope } : {}), ...(a.pairs ? { pairs: a.pairs } : {}), ...(a.circled ? { circled: true } : {}), ...(a.partial ? { partial: a.partial } : {}),
    ...(a.hmark ? { hmark: a.hmark } : {}), ...(a.attach ? { attach: a.attach } : {}), ...(a.bead ? { bead: true } : {}), ...(a.map ? { map: a.map } : {}), ...(a.enhanced ? { enhanced: a.enhanced } : {}), ...(a.colour ? { colour: a.colour } : {}), ...(a.cip ? { cip: true } : {}), ...(a.halo ? { halo: a.halo } : {}), ...(a.circle ? { circle: true } : {}), ...(a.number ? { number: a.number } : {}), ...(a.hiddenNumber ? { hiddenNumber: a.hiddenNumber } : {}), ...(a.shown ? { shown: true } : {}), ...(a.ignoreWarnings ? { ignoreWarnings: true } : {}), ...(a.align ? { align: a.align } : {}), ...(a.labelAngle ? { labelAngle: round(a.labelAngle) } : {}), ...(a.hidden ? { hidden: true } : {}), ...(a.bars ? { bars: true } : {}), ...(a.angles ? { angles: a.angles } : {}), ...(a.chemical === false ? { chemical: false } : {}),
    ...(a.font ? { font: a.font } : {}), ...(a.size ? { size: a.size } : {}), ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}), ...(a.order ? { order: a.order } : {}),
    ...(a.query ? { query: a.query } : {}), ...(a.peaks?.length ? { peaks: a.peaks } : {}), ...(a.inner?.atoms.length ? { inner: innerOut(a.inner) } : {}), ...scaled(a) }));
  const bonds = mol.bonds.map((b) => ({ atoms: b.atoms, type: b.type, ...(b.stereo ? { stereo: b.stereo } : {}), ...(b.display ? { display: b.display } : {}), ...(b.position ? { position: b.position } : {}), ...(b.colour ? { colour: b.colour } : {}), ...(b.halo ? { halo: b.halo } : {}), ...(b.ignoreWarnings ? { ignoreWarnings: true } : {}),
    ...(b.query ? { query: b.query } : {}), ...(b.topology ? { topology: b.topology } : {}), ...(b.rxn ? { rxn: b.rxn } : {}),
    ...(b.spacing !== undefined ? { spacing: b.spacing } : {}), ...(b.own ? { own: b.own } : {}), ...(b.peaks?.length ? { peaks: b.peaks } : {}), ...(b.ports ? { ports: b.ports } : {}) }));
  // Captions are saved in id order and arrows in their drawing order; ids are not saved. Conditions name their arrow
  // by its place in the list.
  const arrowList = [...(mol.arrows ?? [])];
  const cycleList = [...(mol.cycles ?? [])].sort((a, b) => a.id - b.id);
  // Structure ends are also saved as sides, so Octet 1.0.29 still draws them.
  const sidesOf = (c: Cycle) => (c.branches ?? []).flatMap((b) => (["in", "out"] as const).flatMap((side) => (b[side]?.atoms?.length ? [{ atoms: b[side]!.atoms!, side }] : []))).slice(0, 32);
  const cycles = cycleList.map((c) => ({ x: round(c.centre[0]), y: round(c.centre[1]), radius: round(c.radius), ...(c.clockwise ? {} : { anticlockwise: true }), nodes: c.nodes, ...(c.at ? { at: c.at.map(round) } : {}), ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...(c.width ? { width: c.width } : {}), ...(c.gap !== undefined ? { gap: c.gap } : {}),
    ...(c.head ? { head: c.head } : {}), ...(c.arrowSize ? { arrowSize: c.arrowSize } : {}), ...(c.steps?.some(Boolean) ? { steps: c.steps } : {}), ...(c.branches?.length ? { branches: c.branches, ...(sidesOf(c).length ? { sides: sidesOf(c) } : {}) } : {}), ...scaled(c) }));
  const arrows = arrowList.map((a) => ({ kind: a.kind, x1: round(a.from[0]), y1: round(a.from[1]), x2: round(a.to[0]), y2: round(a.to[1]), ...(a.bend ? { bend: round(a.bend) } : {}),
    ...(a.style ? { style: a.style } : {}), ...(a.orbital ? { orbital: a.orbital } : {}), ...(a.colour ? { colour: a.colour } : {}),
    ...(a.start ? { start: a.start } : {}), ...(a.end ? { end: a.end } : {}), ...(a.head ? { head: a.head } : {}), ...(a.curve ? { curve: a.curve } : {}), ...(a.fill ? { fill: a.fill } : {}), ...(a.order ? { order: a.order } : {}), ...(a.width ? { width: a.width } : {}),
    ...(a.headSize ? { headSize: { length: round(a.headSize.length), centre: round(a.headSize.centre), width: round(a.headSize.width) } } : {}), ...(a.ratio ? { ratio: round(a.ratio) } : {}), ...(a.shaft ? { shaft: round(a.shaft) } : {}), ...(a.point ? { point: true } : {}), ...scaled(a), ...partOf(a) }));
  // Shapes keep their order in the list, which is the order they are drawn in within their layer (order.ts).
  const shapes = (mol.shapes ?? []).map((x) => ({ kind: x.kind, x1: round(x.from[0]), y1: round(x.from[1]), x2: round(x.to[0]), y2: round(x.to[1]), ...(x.dashed ? { dashed: true } : {}), ...(x.colour ? { colour: x.colour } : {}),
    ...(x.fill ? { fill: x.fill } : {}), ...(x.shadow ? { shadow: true } : {}), ...(x.side ? { side: x.side } : {}), ...(x.mark ? { mark: x.mark } : {}), ...(x.tlc ? { tlc: x.tlc } : {}), ...(x.table ? { table: x.table } : {}), ...(x.shade ? { shade: x.shade } : {}), ...(x.order ? { order: x.order } : {}),
    ...(x.boldLine ? { boldLine: true } : {}), ...(x.angle ? { angle: round(x.angle) } : {}), ...(x.width ? { width: x.width } : {}), ...(x.radius !== undefined ? { radius: x.radius } : {}),
    ...(x.font ? { font: x.font } : {}), ...(x.size ? { size: x.size } : {}), ...(x.bold ? { bold: true } : {}), ...(x.italic ? { italic: true } : {}), ...(x.underline ? { underline: true } : {}), ...(x.ignoreWarnings ? { ignoreWarnings: true } : {}), ...scaled(x),
    ...(x.picture ? { picture: x.picture } : {}), ...(x.polymer ? { polymer: x.polymer } : {}), ...(x.bracketed ? { bracketed: true } : {}), ...(x.rgroup ? { rgroup: x.rgroup } : {}) }));
  const captions = [...(mol.captions ?? [])].sort((a, b) => a.id - b.id).map((c) => ({
    text: c.text, x: round(c.x), y: round(c.y), ...(c.bold ? { bold: true } : {}), ...(c.italic ? { italic: true } : {}), ...(c.underline ? { underline: true } : {}),
    ...(c.size ? { size: c.size } : {}), ...(c.align ? { align: c.align } : {}), ...(c.under ? { under: c.under } : {}), ...(c.colour ? { colour: c.colour } : {}),
    ...(c.font ? { font: c.font } : {}), ...(c.runs ? { runs: c.runs } : {}), ...(c.property ? { property: c.property } : {}), ...(c.angle ? { angle: round(c.angle) } : {}), ...(c.order ? { order: c.order } : {}), ...(c.lineHeight ? { lineHeight: c.lineHeight } : {}), ...(c.width ? { width: round(c.width) } : {}), ...(c.chemical === false ? { chemical: false } : {}), ...(c.auto ? { auto: true } : {}),
    ...(c.on ? { on: { arrow: arrowList.findIndex((a) => a.id === c.on!.arrow), side: c.on.side } } : {}),
    ...(c.on && c.placed ? { placed: { at: c.placed.at.map(round), arrow: c.placed.arrow.map(round) } } : {}),
    ...(c.cycle ? { cycle: { cycle: cycleList.findIndex((x) => x.id === c.cycle!.cycle), step: c.cycle.step, side: c.cycle.side, ...(c.cycle.branch !== undefined ? { branch: c.cycle.branch } : {}), ...(c.cycle.at !== undefined ? { at: c.cycle.at } : {}), ...(c.cycle.reach !== undefined ? { reach: c.cycle.reach } : {}), ...(c.cycle.off ? { off: c.cycle.off } : {}) } } : {}),
    ...partOf(c),
  }));
  // Groups name their objects by kind and place in the lists above: c caption, a arrow, s shape, y cycle.
  const captionList = [...(mol.captions ?? [])].sort((a, b) => a.id - b.id), shapeList = mol.shapes ?? [];
  const ref = (id: number): [string, number] | undefined => {
    for (const [kind, list] of [["c", captionList], ["a", arrowList], ["s", shapeList], ["y", cycleList]] as const) { const k = (list as { id: number }[]).findIndex((x) => x.id === id); if (k >= 0) return [kind, k]; }
    return undefined;
  };
  const groups = (mol.groups ?? []).map((g) => ({ atoms: g.atoms, items: g.items.map(ref).filter(Boolean), ...(g.integral ? { integral: true } : {}), ...(g.annotations?.length ? { annotations: g.annotations } : {}), ...(g.plot ? { plot: g.plot } : {}) }));
  // Stoichiometry grids name their arrow by its place in the list above.
  const grids = (mol.grids ?? []).map((g) => ({ ...g, arrow: arrowList.findIndex((a) => a.id === g.arrow) })).filter((g) => g.arrow >= 0);
  return JSON.stringify({ format: FORMAT, version: VERSION, app: pkg.version, structure: { atoms, bonds }, ...(arrows.length ? { arrows } : {}), ...(cycles.length ? { cycles } : {}), ...(shapes.length ? { shapes } : {}), ...(captions.length ? { captions } : {}), ...(groups.length ? { groups } : {}), ...(grids.length ? { grids } : {}), ...(mol.fills?.length ? { fills: mol.fills } : {}), ...(mol.annotations?.length ? { annotations: mol.annotations } : {}), ...(mol.style ? { style: mol.style } : {}), ...(mol.guides ? { guides: mol.guides } : {}), ...(mol.spectra?.length ? { spectra: mol.spectra.map(writeMeasured) } : {}) }, null, 1) + "\n";
}
const round = (n: number) => Math.round(n * 1e4) / 1e4;
// A page spectrum's part (pageplot.ts): its role and where Octet put it. Octet 1.1.0 leaves both out.
const partOf = (x: { role?: PlotPart }) => (x.role ? { role: { role: x.role.role, at: x.role.at.map(round) } } : {});
// A thing's draw order (order.ts): a whole number other than zero; anything else is left out.
const orderOf = (v: unknown) => (Number.isInteger(v) && v !== 0 && Math.abs(v as number) <= 1e6 ? { order: v as number } : {});
// An object's scale against the document style (decision 0007), saved when it is not 1; read back when it is 0.01 to 100.
const scaled = (x: { scale?: number }) => (x.scale && x.scale !== 1 ? { scale: x.scale } : {});
const isScale = (v: unknown) => v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0.01 && v <= 100);
// Sizes in points: 0.1 to 999, so a scaled document's text keeps its size.
const isSize = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0.1 && v <= 999;
// A caption's runs, if they are sound: up to 2000, each with text and only known styles, joining to the caption's text.
function readRuns(v: unknown, text: string): TextRun[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > 2000) return undefined;
  const ok = (r: Record<string, unknown>) => typeof r === "object" && r && typeof r.text === "string" && r.text.length <= MAX_TEXT
    && (r.bold === undefined || r.bold === true) && (r.italic === undefined || r.italic === true) && (r.underline === undefined || r.underline === true)
    && (r.script === undefined || r.script === "sub" || r.script === "super") && (r.font === undefined || fontName(r.font))
    && (r.size === undefined || isSize(r.size)) && (r.colour === undefined || (typeof r.colour === "string" && /^#[0-9a-f]{6}$/i.test(r.colour)))
    && Object.keys(r).every((k) => ["text", "bold", "italic", "underline", "script", "font", "size", "colour"].includes(k));
  if (!(v as Record<string, unknown>[]).every(ok)) return undefined;
  const runs = normalise(v as TextRun[]);
  return plainOf(runs) === text ? runs : undefined;
}
// Data kept from a ChemDraw object, if it is sound: known attributes with short plain values, and atoms in the drawing.
function readKept(v: unknown, names: string[], atoms: number): Kept | undefined {
  const k = v as { attrs?: unknown; atoms?: unknown };
  if (typeof k !== "object" || !k || typeof k.attrs !== "object" || !k.attrs || Array.isArray(k.attrs) || !Array.isArray(k.atoms) || !k.atoms.length || k.atoms.length > atoms) return undefined;
  if (!k.atoms.every((i) => Number.isInteger(i) && i >= 0 && i < atoms)) return undefined;
  if (!Object.entries(k.attrs).every(([n, x]) => names.includes(n) && typeof x === "string" && x.length <= 200 && !/[\u0000-\u001f]/.test(x))) return undefined;
  return { attrs: { ...(k.attrs as Record<string, string>) }, atoms: [...(k.atoms as number[])] };
}
// A bond's own ChemDraw settings, if they are sound: known settings, each a number of up to 12 characters.
const ownSettings = (v: unknown) => typeof v === "object" && !!v && !Array.isArray(v) && Object.keys(v).length > 0
  && Object.entries(v).every(([n, x]) => OWN_BOND_ATTRS.includes(n) && typeof x === "string" && /^[+-]?(\d+\.?\d*|\.\d+)$/.test(x) && x.length <= 12);
// A shadow's look, if it is sound: depth and softness up to a bond length, opacity 0 to 1.
function readShade(v: unknown): Shade | undefined {
  const s = v as Record<string, unknown>, ok = (n: unknown, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= hi;
  return typeof s === "object" && s && ok(s.depth, 1) && ok(s.blur, 1) && ok(s.opacity, 1) ? { depth: s.depth as number, blur: s.blur as number, opacity: s.opacity as number } : undefined;
}
// A pen curve's points, if they are sound: 1 to 1000 anchors (ChemDraw's clip art has curves of one), each with
// optional handles.
function readCurve(v: unknown): Curve | undefined {
  const c = v as { points?: unknown; closed?: unknown };
  const pt = (q: unknown) => Array.isArray(q) && q.length === 2 && q.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) < 1e6);
  if (typeof c !== "object" || !c || !Array.isArray(c.points) || !c.points.length || c.points.length > 1000) return undefined;
  const points = c.points as { at?: unknown; c1?: unknown; c2?: unknown }[];
  if (!points.every((p) => typeof p === "object" && p && pt(p.at) && (p.c1 === undefined || pt(p.c1)) && (p.c2 === undefined || pt(p.c2)))) return undefined;
  return { points: points.map((p) => ({ at: p.at as [number, number], ...(p.c1 ? { c1: p.c1 as [number, number] } : {}), ...(p.c2 ? { c2: p.c2 as [number, number] } : {}) })), ...(c.closed === true ? { closed: true } : {}) };
}
// An arrowhead's size, if it is sound: length, notch and width each above 0 and up to 500 line widths.
function readHead(v: unknown): HeadSize | undefined {
  const h = v as Record<string, unknown>, ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= 500;
  return typeof h === "object" && h && ok(h.length) && ok(h.centre) && ok(h.width) ? { length: h.length as number, centre: h.centre as number, width: h.width as number } : undefined;
}
// A table's cells, if they are sound: up to 100 rows and 20 columns of short plain text.
function readTable(v: unknown): Table | undefined {
  const t = v as { cells?: unknown; grid?: unknown; widths?: unknown; heights?: unknown; lines?: unknown; align?: unknown; weight?: unknown };
  const list = (x: unknown, most: number, ok: (y: unknown) => boolean) => x === undefined || (Array.isArray(x) && x.length <= most && x.every(ok));
  // Column and row sizes (bond lengths) and the line weight (pt) wide enough for a table scaled 1% to 10000%.
  const size = (n: unknown) => typeof n === "number" && n >= 0.002 && n <= 5000;
  if (!list(t?.widths, 20, size) || !list(t?.heights, 100, size) || !list(t?.lines, 7, (x) => ["top", "bottom", "left", "right", "header", "rows", "cols"].includes(x as string))
    || !list(t?.align, 20, (x) => ["left", "centre", "right"].includes(x as string)) || (t?.weight !== undefined && !(typeof t.weight === "number" && t.weight >= 0.001 && t.weight <= 1000))) return undefined;
  if (typeof t !== "object" || !t || !Array.isArray(t.cells) || !t.cells.length || t.cells.length > 100) return undefined;
  const cells = t.cells as unknown[];
  if (!cells.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 20 && r.every((c) => typeof c === "string" && c.length <= 500 && !/[\u0000-\u0009\u000b-\u001f]/.test(c)))) return undefined;
  return {
    cells: cells as string[][], ...(t.grid === true ? { grid: true } : {}),
    ...(t.widths ? { widths: t.widths as number[] } : {}), ...(t.heights ? { heights: t.heights as number[] } : {}),
    ...(t.lines ? { lines: [...new Set(t.lines as TableLine[])] } : {}), ...(t.align ? { align: t.align as CellAlign[] } : {}), ...(t.weight !== undefined ? { weight: t.weight as number } : {}),
  };
}
// A TLC plate's lanes and spots, if they are sound.
function readTlc(v: unknown): Tlc | undefined {
  const t = v as { lanes?: unknown; spots?: unknown; rf?: unknown; origin?: unknown; front?: unknown; hide?: unknown; ticks?: unknown; transparent?: unknown };
  const frac = (n: unknown) => n === undefined || (typeof n === "number" && n >= 0 && n <= 0.9), len = (n: unknown) => n === undefined || (typeof n === "number" && n >= 0 && n <= 5);
  if (typeof t !== "object" || !t || !Number.isInteger(t.lanes) || (t.lanes as number) < 1 || (t.lanes as number) > 40 || !Array.isArray(t.spots) || t.spots.length > 400
    || !frac(t.origin) || !frac(t.front) || (t.hide !== undefined && !(Array.isArray(t.hide) && t.hide.every((h) => ["origin", "front", "border"].includes(h))))) return undefined;
  const spots = (t.spots as Record<string, unknown>[]).filter((x) => Number.isInteger(x?.lane) && (x.lane as number) >= 0 && (x.lane as number) < (t.lanes as number) && typeof x.rf === "number" && x.rf >= 0 && x.rf <= 1
    && (x.colour === undefined || (typeof x.colour === "string" && /^#[0-9a-f]{6}$/i.test(x.colour))) && (x.style === undefined || x.style === "hollow" || x.style === "shaded")
    && len(x.w) && len(x.h) && len(x.tail) && [x.showRf, x.dashed, x.bold, x.doubled].every((f) => f === undefined || f === true));
  if (spots.length !== t.spots.length) return undefined;
  return {
    lanes: t.lanes as number,
    spots: spots.map((x) => ({ lane: x.lane as number, rf: x.rf as number, ...Object.fromEntries(["colour", "style", "dashed", "bold", "doubled", "w", "h", "tail", "showRf"].filter((k) => x[k] !== undefined).map((k) => [k, x[k]])) }) as Tlc["spots"][number]),
    ...(t.rf === true ? { rf: true } : {}), ...(t.origin !== undefined ? { origin: t.origin as number } : {}), ...(t.front !== undefined ? { front: t.front as number } : {}),
    ...(t.hide ? { hide: t.hide as Tlc["hide"] } : {}), ...(t.ticks === true ? { ticks: true } : {}), ...(t.transparent === true ? { transparent: true } : {}),
  };
}

// Throws an Error with a message for the user if the file is not a drawing this version can read.
export function parse(text: string): Mol {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error("This file is not an Octet drawing."); }
  const d = data as { format?: unknown; version?: unknown; app?: unknown; structure?: { atoms?: unknown; bonds?: unknown }; captions?: unknown; arrows?: unknown; style?: unknown; cycles?: unknown; shapes?: unknown; groups?: unknown; grids?: unknown; fills?: unknown; annotations?: unknown; guides?: unknown; spectra?: unknown };
  if (d?.format !== FORMAT) throw new Error("This file is not an Octet drawing.");
  if (typeof d.version !== "number" || d.version > VERSION) throw new Error("This drawing comes from a newer version of Octet. Update Octet to open it.");
  const atoms = d.structure?.atoms, bonds = d.structure?.bonds;
  if (!Array.isArray(atoms) || !Array.isArray(bonds) || atoms.length > MAX_ATOMS || bonds.length > MAX_ATOMS * 4) throw new Error("This drawing is damaged.");
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6;
  const badColour = (v: unknown) => v !== undefined && !(typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
  // A line width, in points: 0.05 to 20, at document scales from 10% to 1000% (decision 0007).
  const badWidth = (v: unknown) => v !== undefined && !(typeof v === "number" && v >= 0.005 && v <= 200);
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
  const out: Mol = { atoms: [], bonds: [] };
  const legacy = new Map<number, string>(); // older files: a fill on each atom of a ring
  for (const a of atoms as Record<string, unknown>[]) {
    if (typeof a?.label !== "string" || !/^[A-Z][a-z]{0,2}$/.test(a.label) || !num(a.x) || !num(a.y) || (a.charge !== undefined && !int(a.charge, -9, 9)) || (a.text !== undefined && (typeof a.text !== "string" || a.text.length > 40 || /[\u0000-\u0009\u000b-\u001f<>]/.test(a.text) || /^\n|\n$|\n\n/.test(a.text)))
      || (a.radical !== undefined && !int(a.radical, 0, 3)) || (a.isotope !== undefined && !int(a.isotope, 1, 300)) || (a.pairs !== undefined && !int(a.pairs, 0, 4)) || (a.circled !== undefined && typeof a.circled !== "boolean")
      || (a.partial !== undefined && a.partial !== "+" && a.partial !== "-") || (a.hmark !== undefined && a.hmark !== "dot" && a.hmark !== "dash")
      || (a.attach !== undefined && typeof a.attach !== "boolean" && a.attach !== "diamond" && a.attach !== "star") || (a.bead !== undefined && typeof a.bead !== "boolean") || (a.map !== undefined && !int(a.map, 1, 9999))
      || (a.enhanced !== undefined && !(typeof a.enhanced === "string" && /^(abs|&[1-9]\d?|or[1-9]\d?)$/.test(a.enhanced))) || badColour(a.colour) || (a.z !== undefined && !num(a.z)) || (a.depth !== undefined && a.depth !== false) || (a.shade !== undefined && a.shade !== true) || (a.cip !== undefined && a.cip !== true) || badColour(a.halo) || badColour(a.fill) || (a.circle !== undefined && a.circle !== true) || (a.shown !== undefined && a.shown !== true)
      || [a.number, a.hiddenNumber].some((x) => x !== undefined && !(typeof x === "string" && /^[\w'′*-]{1,8}$/.test(x))) || !isScale(a.scale)
      // A written label's runs: its text, with only bold, italic, underline and superscript or subscript.
      || (a.runs !== undefined && (typeof a.text !== "string" || !readRuns(a.runs, a.text)?.every((r) => Object.keys(r).every((k) => ["text", "bold", "italic", "underline", "script"].includes(k)))))) throw new Error("This drawing is damaged.");
    const atom: Atom = { label: a.label, location: [a.x as number, a.y as number, (a.z as number | undefined) ?? 0] };
    // depth: false (older files: a 3D structure drawn flat) is how such a structure is drawn now.
    if (a.shade) atom.shade = true;
    if (a.charge) atom.charge = a.charge as number;
    if (a.text) atom.text = a.text as string;
    if (a.runs) atom.runs = readRuns(a.runs, a.text as string);
    if (a.radical) atom.radical = a.radical as number;
    if (a.isotope) atom.isotope = a.isotope as number;
    if (a.pairs) atom.pairs = a.pairs as number;
    if (a.circled) atom.circled = true;
    if (a.partial) atom.partial = a.partial as "+" | "-";
    if (a.hmark) atom.hmark = a.hmark as "dot" | "dash";
    if (a.attach) atom.attach = a.attach === "diamond" || a.attach === "star" ? a.attach : true;
    if (a.bead) atom.bead = true;
    if (a.map) atom.map = a.map as number;
    if (a.enhanced) atom.enhanced = a.enhanced as string;
    if (a.colour) atom.colour = a.colour as string;
    if (a.cip) atom.cip = true;
    if (a.halo) atom.halo = a.halo as string;
    if (a.fill) legacy.set(out.atoms.length, a.fill as string);
    if (a.circle) atom.circle = true;
    if (a.shown) atom.shown = true;
    if (a.number) atom.number = a.number as string;
    if (a.hiddenNumber) atom.hiddenNumber = a.hiddenNumber as string;
    // Measured multiplets by id: kept when the drawing's spectra have them (below).
    if (Array.isArray(a.peaks) && a.peaks.length <= 64 && a.peaks.every((k) => int(k, 1, 1e9))) atom.peaks = [...new Set(a.peaks as number[])];
    if (a.ignoreWarnings === true) atom.ignoreWarnings = true;
    // The label's own text style; anything out of range is left out.
    if (fontName(a.font)) atom.font = a.font;
    if (isSize(a.size)) atom.size = a.size as number;
    if (a.scale !== undefined && a.scale !== 1) atom.scale = a.scale as number;
    if (a.bold === true) atom.bold = true;
    if (a.italic === true) atom.italic = true;
    if (a.underline === true) atom.underline = true;
    if (["left", "centre", "right", "above", "below"].includes(a.align as string)) atom.align = a.align as Atom["align"];
    if (num(a.labelAngle) && Math.abs(a.labelAngle as number) <= 360 && a.labelAngle) atom.labelAngle = a.labelAngle as number;
    if (a.hidden === true && a.label === "H") atom.hidden = true;
    if (a.bars === true) atom.bars = true;
    if (a.chemical === false && atom.text) atom.chemical = false;
    const angles = a.angles && typeof a.angles === "object" ? Object.entries(a.angles).filter(([k, v]) => /^(charge|partial|radical[01]|pair[0-3])$/.test(k) && num(v)) : [];
    if (angles.length) atom.angles = Object.fromEntries(angles) as Record<string, number>;
    Object.assign(atom, orderOf(a.order));
    // Query properties, and a multi-centre or variable attachment's atoms (other atoms of the drawing).
    const query = readAtomQuery(a.query);
    if (query) atom.query = query;
    // (A drawing saved while a multi-centre point was a plain list of its atoms has the list alone.)
    const centre = a.centre as { atoms?: unknown; variable?: unknown } | unknown[] | undefined, list = Array.isArray(centre) ? centre : centre?.atoms;
    if (centre !== undefined) {
      // Two or more other atoms, none of them an attachment itself.
      if (!Array.isArray(list) || list.length < 2 || list.length > 64 || new Set(list).size !== list.length
        || !list.every((i) => int(i, 0, atoms.length - 1) && i !== out.atoms.length && (atoms as Record<string, unknown>[])[i as number]?.centre === undefined)) throw new Error("This drawing is damaged.");
      atom.centre = { atoms: [...new Set(list as number[])], ...(!Array.isArray(centre) && centre?.variable === true ? { variable: true as const } : {}) };
    }
    if (a.inner !== undefined) { const inner = innerIn(a.inner); if (!inner) throw new Error("This drawing is damaged."); atom.inner = inner; }
    out.atoms.push(atom);
  }
  for (const b of bonds as Record<string, unknown>[]) {
    const ends = b?.atoms as unknown[];
    if (!Array.isArray(ends) || ends.length !== 2 || !ends.every((i) => int(i, 0, out.atoms.length - 1)) || ends[0] === ends[1] || !(int(b.type, 1, 4) || b.type === HBOND || b.type === QUADRUPLE) || (b.stereo !== undefined && b.stereo !== 1 && b.stereo !== 6) || (b.display !== undefined && !DISPLAYS.includes(b.display as Display)) || (b.position !== undefined && !["left", "centre", "right"].includes(b.position as string)) || badColour(b.colour) || badColour(b.halo)
      || (b.spacing !== undefined && !(num(b.spacing) && (b.spacing as number) >= 0 && (b.spacing as number) <= 100)) || (b.own !== undefined && !ownSettings(b.own))) throw new Error("This drawing is damaged.");
    const bond: Bond = { type: b.type as number, atoms: [ends[0] as number, ends[1] as number] };
    if (b.halo) bond.halo = b.halo as string;
    if (b.spacing !== undefined) bond.spacing = b.spacing as number;
    if (b.own) bond.own = b.own as Record<string, string>;
    if (b.stereo) bond.stereo = b.stereo as number;
    if (b.display) bond.display = b.display as Display;
    if (b.position) bond.position = b.position as Bond["position"];
    if (b.colour) bond.colour = b.colour as string;
    if (b.ignoreWarnings === true) bond.ignoreWarnings = true;
    if (Array.isArray(b.peaks) && b.peaks.length <= 64 && b.peaks.every((k) => int(k, 1, 1e9))) bond.peaks = [...new Set(b.peaks as number[])];
    // The kept atom each end joins, at a label that keeps its atoms (-1: none).
    if (b.ports !== undefined) {
      const p = b.ports as unknown[];
      if (!Array.isArray(p) || p.length !== 2 || !p.every((x, e) => x === -1 || int(x, 0, (out.atoms[bond.atoms[e]].inner?.atoms.length ?? 0) - 1))) throw new Error("This drawing is damaged.");
      if (p.some((x) => x !== -1)) bond.ports = [p[0] as number, p[1] as number];
    }
    // A query bond's type; an earlier Octet file held ChemDraw's orders for it ("1 2").
    Object.assign(bond, readBondQuery({ ...b, query: ({ "1 2": "sd", "1 1.5": "sa", "2 1.5": "da" } as Record<string, string>)[b.query as string] ?? b.query }));
    out.bonds.push(bond);
  }
  // Ring fills: each ring by its atoms in order (3 to 40, each once). An older file's atom fills become a fill for
  // every ring whose atoms all had the same one.
  if (d.fills !== undefined) {
    if (!Array.isArray(d.fills) || d.fills.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    out.fills = (d.fills as Record<string, unknown>[]).map((f) => {
      const ring = f?.atoms as unknown[];
      if (!Array.isArray(ring) || ring.length < 3 || ring.length > 40 || !ring.every((i) => int(i, 0, out.atoms.length - 1)) || new Set(ring).size !== ring.length
        || typeof f.colour !== "string" || badColour(f.colour)) throw new Error("This drawing is damaged.");
      return { atoms: ring as number[], colour: f.colour as string };
    });
  } else if (legacy.size) {
    const found = rings({ atoms: out.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: out.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) });
    const fills = found.filter((r) => legacy.has(r[0]) && r.every((i) => legacy.get(i) === legacy.get(r[0]))).map((r) => ({ atoms: r, colour: legacy.get(r[0])! }));
    if (fills.length) out.fills = fills;
  }
  if (d.style !== undefined) out.style = readStyle(d.style);
  if (d.guides !== undefined) out.guides = readGuides(d.guides);
  // Arrows take ids after the captions'.
  const captionCount = Array.isArray(d.captions) ? d.captions.length : 0;
  if (d.arrows !== undefined) {
    if (!Array.isArray(d.arrows) || d.arrows.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    out.arrows = (d.arrows as Record<string, unknown>[]).map((a, k): Arrow => {
      const orb = a?.orbital as { shape?: unknown; phase?: unknown } | undefined;
      if (!ALL_ARROW_KINDS.includes(a?.kind as ArrowKind) || ![a.x1, a.y1, a.x2, a.y2].every(num) || (a.bend !== undefined && !(num(a.bend) && Math.abs(a.bend as number) <= 5))
        || (a.style !== undefined && !["dashed", "bold", "wavy", "doubled"].includes(a.style as string))
        || (a.start !== undefined && !HEADS.includes(a.start as Head)) || (a.end !== undefined && !HEADS.includes(a.end as Head))
        || (a.head !== undefined && !["solid", "hollow", "angled"].includes(a.head as string)) || (a.fill !== undefined && !["solid", "shaded", "faded"].includes(a.fill as string))
        // A pen curve has points; so may a fragmentation line (its corners), and nothing else.
        || (a.kind === "curve" && a.curve === undefined) || (a.curve !== undefined && a.kind !== "curve" && a.kind !== "cut") || (a.curve !== undefined && !readCurve(a.curve))
        || (orb !== undefined && (!ORBITAL_SHAPES.includes(orb?.shape as OrbitalShape) || !PHASES.includes(orb?.phase as Phase))) || ((a.kind === "orbital") !== (orb !== undefined)) || badColour(a.colour) || badWidth(a.width)
        || (a.headSize !== undefined && !readHead(a.headSize)) || (a.ratio !== undefined && !(num(a.ratio) && (a.ratio as number) > 0 && (a.ratio as number) <= 100))
        || (a.shaft !== undefined && !(num(a.shaft) && (a.shaft as number) > 0 && (a.shaft as number) <= 500)) || (a.point !== undefined && a.point !== true) || !isScale(a.scale)) throw new Error("This drawing is damaged.");
      return { id: captionCount + k + 1, kind: a.kind as ArrowKind, from: [a.x1 as number, a.y1 as number], to: [a.x2 as number, a.y2 as number], ...(a.bend ? { bend: a.bend as number } : {}),
        ...(a.style ? { style: a.style as LineStyle } : {}), ...(orb ? { orbital: { shape: orb.shape as OrbitalShape, phase: orb.phase as Phase } } : {}), ...(a.colour ? { colour: a.colour as string } : {}),
        ...(a.start ? { start: a.start as Head } : {}), ...(a.end ? { end: a.end as Head } : {}), ...(a.head ? { head: a.head as HeadShape } : {}),
        ...(a.curve ? { curve: readCurve(a.curve)! } : {}), ...(a.fill ? { fill: a.fill as CurveFill } : {}), ...orderOf(a.order), ...(a.width ? { width: a.width as number } : {}),
        ...(a.headSize ? { headSize: readHead(a.headSize)! } : {}), ...(a.ratio ? { ratio: a.ratio as number } : {}), ...(a.shaft ? { shaft: a.shaft as number } : {}), ...(a.point ? { point: true as const } : {}), ...scaled(a as { scale?: number }),
        ...(readPart(a.role) ? { role: readPart(a.role)! } : {}) };
    });
  }
  // Cycles take ids after the arrows'.
  if (d.cycles !== undefined) {
    if (!Array.isArray(d.cycles) || d.cycles.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    out.cycles = (d.cycles as Record<string, unknown>[]).map((c, k) => {
      // A cycle drawn with the Cycle tool saves each node's angle, and can have breaks (empty nodes) and fewer than two.
      const nodes = c?.nodes as unknown[], at = Array.isArray(c?.at) && c.at.length === nodes?.length && c.at.every(num) ? (c.at as number[]) : undefined;
      if (!num(c?.x) || !num(c.y) || !num(c.radius) || (c.radius as number) <= 0 || !Array.isArray(nodes) || (!at && nodes.length < 2) || nodes.length > 64
        || !nodes.every((n) => Array.isArray(n) && (at || n.length > 0) && n.every((i) => int(i, 0, out.atoms.length - 1))) || badColour(c.colour) || badWidth(c.width) || !isScale(c.scale)) throw new Error("This drawing is damaged.");
      const sides = c.sides as { atoms?: unknown; side?: unknown }[] | undefined;
      if (sides !== undefined && (!Array.isArray(sides) || sides.length > 32 || !sides.every((s) => (s?.side === "in" || s?.side === "out") && Array.isArray(s.atoms) && s.atoms.length > 0 && s.atoms.every((i) => int(i, 0, out.atoms.length - 1))))) throw new Error("This drawing is damaged.");
      // Each step's settings, and the side arrows (their structures by atom index).
      const steps = c.steps === undefined ? undefined : readSteps(c.steps), branches = c.branches === undefined ? undefined : readBranches(c.branches, nodes.length, (i) => (int(i, 0, out.atoms.length - 1) ? (i as number) : undefined));
      if ((c.steps !== undefined && !steps) || (c.branches !== undefined && !branches)) throw new Error("This drawing is damaged.");
      return { id: captionCount + (out.arrows?.length ?? 0) + k + 1, centre: [c.x as number, c.y as number], radius: c.radius as number, clockwise: c.anticlockwise !== true, nodes: nodes as number[][], ...(at ? { at } : {}), ...(c.colour ? { colour: c.colour as string } : {}), ...orderOf(c.order), ...(c.width ? { width: c.width as number } : {}), ...(typeof c.gap === "number" && c.gap >= 0 && c.gap <= 100 ? { gap: c.gap } : {}),
        ...(c.head === "hollow" || c.head === "angled" ? { head: c.head } : {}), ...(c.arrowSize === "large" || c.arrowSize === "medium" ? { arrowSize: c.arrowSize } : {}), ...(steps?.some(Boolean) ? { steps } : {}), ...(branches?.length ? { branches } : {}), ...(sides?.length ? { sides: sides as CycleSide[] } : {}), ...scaled(c as { scale?: number }) } as Cycle;
    });
  }
  // Shapes take ids after the cycles'.
  if (d.shapes !== undefined) {
    if (!Array.isArray(d.shapes) || d.shapes.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    const first = captionCount + (out.arrows?.length ?? 0) + (out.cycles?.length ?? 0) + 1;
    // Pen curves were shapes before they became lines: a file with one opens with it as a line.
    const all = d.shapes as Record<string, unknown>[], pens = all.filter((x) => x?.kind === "curve");
    pens.forEach((x, j) => {
      const curve = readCurve(x.curve);
      if (!curve || badColour(x.colour)) throw new Error("This drawing is damaged.");
      out.arrows = [...(out.arrows ?? []), { id: first + all.length + j, kind: "curve", from: curve.points[0].at, to: curve.points[curve.points.length - 1].at, curve,
        ...(x.dashed ? { style: "dashed" as const } : {}), ...(x.colour ? { colour: x.colour as string } : {}), ...(x.fill === "solid" ? { fill: "solid" as const } : {}) }];
    });
    out.shapes = all.filter((x) => x?.kind !== "curve").map((x, k): Shape => {
      if (!SHAPE_KINDS.includes(x?.kind as ShapeKind) || ![x.x1, x.y1, x.x2, x.y2].every(num) || (x.dashed !== undefined && typeof x.dashed !== "boolean")
        || (x.colour !== undefined && !(typeof x.colour === "string" && /^#[0-9a-f]{6}$/i.test(x.colour)))
        || (x.fill !== undefined && x.fill !== "shaded" && x.fill !== "solid" && x.fill !== "faded") || (x.shadow !== undefined && typeof x.shadow !== "boolean")
        || (x.boldLine !== undefined && x.boldLine !== true)
        || (x.side !== undefined && x.side !== "left" && x.side !== "right") || (x.mark !== undefined && !(typeof x.mark === "string" && x.mark.length <= 8))
        || (x.tlc !== undefined && !readTlc(x.tlc)) || (x.table !== undefined && !readTable(x.table)) || (x.shade !== undefined && !readShade(x.shade))
        || (x.picture !== undefined && !readPictureData(x.picture)) || ((x.kind === "picture") !== (x.picture !== undefined))
        || (x.angle !== undefined && !(num(x.angle) && Math.abs(x.angle as number) <= 360)) || badWidth(x.width) || (x.radius !== undefined && !(num(x.radius) && (x.radius as number) >= 0 && (x.radius as number) <= 10))
        || (x.font !== undefined && !fontName(x.font)) || (x.size !== undefined && !isSize(x.size))
        || [x.bold, x.italic, x.underline].some((v) => v !== undefined && typeof v !== "boolean") || !isScale(x.scale)) throw new Error("This drawing is damaged.");
      return { id: first + k, kind: x.kind as ShapeKind, from: [x.x1 as number, x.y1 as number], to: [x.x2 as number, x.y2 as number], ...(x.dashed ? { dashed: true } : {}), ...(x.colour ? { colour: x.colour as string } : {}),
        ...(x.fill ? { fill: x.fill as "shaded" | "solid" | "faded" } : {}), ...(x.shadow ? { shadow: true } : {}), ...(x.side ? { side: x.side as "left" | "right" } : {}), ...(x.mark ? { mark: x.mark as string } : {}),
        ...(x.tlc ? { tlc: readTlc(x.tlc)! } : {}), ...(x.table ? { table: readTable(x.table)! } : {}), ...(x.shade ? { shade: readShade(x.shade)! } : {}), ...orderOf(x.order),
        ...(x.boldLine ? { boldLine: true as const } : {}), ...(x.angle ? { angle: x.angle as number } : {}), ...(x.width ? { width: x.width as number } : {}), ...(x.radius !== undefined ? { radius: x.radius as number } : {}),
        ...(x.font ? { font: x.font as string } : {}), ...(x.size ? { size: x.size as number } : {}), ...(x.bold ? { bold: true as const } : {}), ...(x.italic ? { italic: true as const } : {}), ...(x.underline ? { underline: true as const } : {}),
        ...(x.ignoreWarnings === true ? { ignoreWarnings: true as const } : {}),
        ...(x.picture ? { picture: readPictureData(x.picture)! } : {}),
        ...(readPolymer(x.polymer) && isBracket({ kind: x.kind as ShapeKind }) ? { polymer: readPolymer(x.polymer) } : {}), ...(x.bracketed === true && isBracket({ kind: x.kind as ShapeKind }) ? { bracketed: true as const } : {}), ...(readRgroup(x.rgroup) ? { rgroup: readRgroup(x.rgroup) } : {}), ...scaled(x as { scale?: number }) };
    });
  }
  if (d.captions !== undefined) readCaptions(d.captions, out, num, int);
  if (d.grids !== undefined) {
    // Each grid's arrow by its place among the file's arrows; what it holds read by readGrid (stoich.ts).
    const saved = (out.arrows ?? []).slice(0, Array.isArray(d.arrows) ? d.arrows.length : 0);
    if (!Array.isArray(d.grids) || d.grids.length > 100) throw new Error("This drawing is damaged.");
    out.grids = (d.grids as Record<string, unknown>[]).map((g) => {
      const grid = int(g?.arrow, 0, saved.length - 1) ? readGrid(g, saved[g.arrow as number].id) : undefined;
      if (!grid) throw new Error("This drawing is damaged.");
      return grid;
    });
  }
  if (d.groups !== undefined) {
    // Each group's objects by kind and place, as saved (see serialize), turned back into ids.
    if (!Array.isArray(d.groups) || d.groups.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
    const lists: Record<string, { id: number }[]> = { c: out.captions ?? [], a: (out.arrows ?? []).slice(0, Array.isArray(d.arrows) ? d.arrows.length : 0), s: out.shapes ?? [], y: out.cycles ?? [] };
    let next = Math.max(0, ...[...(out.captions ?? []), ...(out.arrows ?? []), ...(out.shapes ?? []), ...(out.cycles ?? [])].map((x) => x.id)) + 1;
    out.groups = (d.groups as Record<string, unknown>[]).map((g) => {
      const atoms = g?.atoms as unknown[], items = g?.items as unknown[];
      if (!Array.isArray(atoms) || !Array.isArray(items) || !atoms.every((i) => int(i, 0, out.atoms.length - 1)) || (g.integral !== undefined && g.integral !== true)
        || !items.every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && lists[r[0]] && int(r[1], 0, lists[r[0]].length - 1))) throw new Error("This drawing is damaged.");
      const annotations = g.annotations === undefined ? undefined : readAnnotations(g.annotations);
      const plot = g.plot === undefined ? undefined : readPlot(g.plot);
      return { id: next++, atoms: atoms as number[], items: (items as [string, number][]).map(([kind, k]) => lists[kind][k].id), ...(g.integral ? { integral: true as const } : {}), ...(annotations ? { annotations } : {}), ...(plot ? { plot } : {}) };
    });
  }
  if (d.annotations !== undefined) out.annotations = readAnnotations(d.annotations);
  // Measured spectra: up to 16, one for each key, their multiplet ids unique in the drawing. An atom's or bond's links
  // to multiplets the drawing does not have are dropped (a copy pasted without its spectrum).
  if (d.spectra !== undefined) {
    if (!Array.isArray(d.spectra) || d.spectra.length > 16) throw new Error("This drawing is damaged.");
    out.spectra = d.spectra.map(readMeasured);
    const ids = out.spectra.flatMap((s) => s.groups.map((g) => g.id));
    if (new Set(ids).size !== ids.length || new Set(out.spectra.map(keyOf)).size !== out.spectra.length) throw new Error("This drawing is damaged.");
  }
  const known = new Set((out.spectra ?? []).flatMap((s) => s.groups.map((g) => g.id)));
  for (const a of [...out.atoms, ...out.bonds]) if (a.peaks) { const kept = a.peaks.filter((k) => known.has(k)); if (kept.length) a.peaks = kept; else delete a.peaks; }
  // Groups as an edit leaves them: each atom and object once, nested or apart, and two or more things in each. Cycles
  // as this version keeps them, and π rings from 1.0.x as ligand() orders them.
  return tidyGroups(migrateCycles(d.app === undefined ? oldLigands(out) : out));
}

// Annotations (keyword and content pairs from ChemDraw), checked as the CDXML reader checks them.
function readAnnotations(v: unknown): Annotation[] {
  const ok = (s: unknown, most: number) => typeof s === "string" && s.length <= most && !/[\u0000-\u0009\u000b-\u001f\u007f]/.test(s);
  if (!Array.isArray(v) || v.length > MAX_ANNOTATIONS || !v.every((a) => ok(a?.keyword, MAX_KEYWORD) && ok(a?.content, MAX_CONTENT))) throw new Error("This drawing is damaged.");
  return v.map((a) => ({ keyword: a.keyword, content: a.content }));
}

// Captions, checked and read into the drawing (their ids come first, from 1).
function readCaptions(raw: unknown, out: Mol, num: (v: unknown) => boolean, int: (v: unknown, lo: number, hi: number) => boolean) {
  const d = { captions: raw };
  if (!Array.isArray(d.captions) || d.captions.length > MAX_CAPTIONS) throw new Error("This drawing is damaged.");
  out.captions = (d.captions as Record<string, unknown>[]).map((c, k) => {
    const under = c?.under as unknown[] | undefined, on = c?.on as { arrow?: unknown; side?: unknown } | undefined;
    const cyc = c?.cycle as { cycle?: unknown; step?: unknown; side?: unknown; branch?: unknown; at?: unknown; reach?: unknown; off?: unknown; through?: unknown; meet?: unknown; tail?: unknown } | undefined, placed = c?.placed as { at?: unknown; arrow?: unknown } | undefined;
    const pair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(num);
    if (typeof c?.text !== "string" || c.text.length > MAX_TEXT || /[\u0000-\u0009\u000b-\u001f]/.test(c.text) || !num(c.x) || !num(c.y)
      || (c.bold !== undefined && typeof c.bold !== "boolean") || (c.italic !== undefined && typeof c.italic !== "boolean") || (c.underline !== undefined && typeof c.underline !== "boolean")
      || (c.size !== undefined && !isSize(c.size))
      || (c.align !== undefined && !["left", "centre", "right", "justify"].includes(c.align as string))
      || (c.colour !== undefined && !(typeof c.colour === "string" && /^#[0-9a-f]{6}$/i.test(c.colour)))
      || (under !== undefined && (!Array.isArray(under) || !under.length || under.length > out.atoms.length || !under.every((i) => int(i, 0, out.atoms.length - 1))))
      || (on !== undefined && (!int(on?.arrow, 0, (out.arrows?.length ?? 0) - 1) || (on.side !== "above" && on.side !== "below")))
      || (cyc !== undefined && (!int(cyc?.cycle, 0, (out.cycles?.length ?? 0) - 1) || !int(cyc.step, 0, 63) || !["in", "out", "centre", "node", "name"].includes(cyc.side as string)))
      // A side arrow's text names a branch of its cycle on its step.
      || (cyc?.branch !== undefined && !((cyc.side === "in" || cyc.side === "out") && out.cycles![cyc.cycle as number].branches?.some((b) => b.id === cyc.branch && b.step === cyc.step)))
      || (cyc?.off !== undefined && !(pair(cyc.off) && (cyc.off as number[]).every((v) => Math.abs(v) <= 50)))
      || (placed !== undefined && (on === undefined || !pair(placed?.at) || !pair(placed.arrow)))
      || (c.font !== undefined && !fontName(c.font)) || (c.runs !== undefined && readRuns(c.runs, c.text) === undefined)
      || (c.angle !== undefined && !(num(c.angle) && Math.abs(c.angle as number) <= 360))
      || (c.property !== undefined && !readKept(c.property, PROPERTY_ATTRS, out.atoms.length))) throw new Error("This drawing is damaged.");
    const caption: Caption = { id: k + 1, text: c.text, x: c.x as number, y: c.y as number };
    if (c.bold) caption.bold = true;
    if (c.italic) caption.italic = true;
    if (c.underline) caption.underline = true;
    if (c.size !== undefined) caption.size = c.size as number;
    if (c.align) caption.align = c.align as Caption["align"];
    if (c.colour) caption.colour = c.colour as string;
    if (c.font) caption.font = c.font as string;
    if (c.runs) caption.runs = readRuns(c.runs, c.text);
    if (c.angle) caption.angle = c.angle as number;
    if (c.property) caption.property = readKept(c.property, PROPERTY_ATTRS, out.atoms.length);
    Object.assign(caption, orderOf(c.order));
    // Line spacing: variable, or fixed from 1 to 400 pt; anything else is Automatic.
    if (c.lineHeight === "variable" || isSize(c.lineHeight)) caption.lineHeight = c.lineHeight as number | "variable";
    // A width from half a bond length to 1000 bond lengths; anything else leaves the caption unwrapped.
    if (typeof c.width === "number" && c.width >= 0.5 && c.width <= 1000) caption.width = c.width;
    if (c.chemical === false) caption.chemical = false;
    if (c.auto === true) caption.auto = true;
    const role = readPart(c.role);
    if (role) caption.role = role;
    if (under) caption.under = under as number[];
    if (on) caption.on = { arrow: out.arrows![on.arrow as number].id, side: on.side as "above" | "below" };
    if (placed) caption.placed = { at: placed.at as [number, number], arrow: placed.arrow as [number, number] };
    if (cyc) caption.cycle = { cycle: out.cycles![cyc.cycle as number].id, step: cyc.step as number, side: cyc.side as "in" | "out" | "centre" | "node" | "name", ...(cyc.branch !== undefined ? { branch: cyc.branch as number } : {}), ...(cyc.off !== undefined && cyc.side === "centre" ? { off: cyc.off as [number, number] } : {}), ...(num(cyc.at) && (cyc.at as number) >= 0 && (cyc.at as number) <= 1 ? { at: cyc.at as number } : {}), ...(num(cyc.reach) && Math.abs(cyc.reach as number) <= 1000 ? { reach: cyc.reach as number } : {}), ...(typeof cyc.through === "boolean" ? { through: cyc.through } : {}),
      ...(num(cyc.meet) && (cyc.meet as number) >= 0 && (cyc.meet as number) <= 1 ? { meet: cyc.meet as number } : {}), ...(pair(cyc.tail) && (cyc.tail as number[])[0] >= 0 && (cyc.tail as number[])[0] <= 1 && Math.abs((cyc.tail as number[])[1]) <= 1000 ? { tail: cyc.tail as [number, number] } : {}) } as CycleText;
    return caption;
  });
  return out;
}
