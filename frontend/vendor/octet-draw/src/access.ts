// The canvas for screen readers and the keyboard. The drawing is one SVG, which a screen reader can only call an image.
// This gives each object on it a role and a name, in reading order (CanvasAccess.tsx lays them out over the canvas,
// where they are drawn), says what an atom or bond is when the keyboard hotspot is on it, and says what an edit changed.
// What they say follows the image description guidelines for chemistry (the DIAGRAM Center's: name the compound, else
// give its atoms and how they join) and the tools blind chemists use (NavMol): a structure's checked name, else its
// formula and rings; an atom's element, charge, hydrogens and neighbours, each neighbour at its clock direction, so the
// arrow keys that walk the bonds (edit.ts walkHot) can be chosen by ear.
import { ARROWS, BONDS, SHAPES } from "./kinds.ts";
import { atomAt, bondAt, fragments, pos, type BondSpec } from "./edit.ts";
import { HBOND, curved, hydrogens, isBracket, orderOf, straightArrow, type Arrow, type Atom, type Bond, type Box, type Group, type Mol, type Shape } from "./render.ts";
import { plotName } from "./pageplot.ts";
import { ELEMENTS } from "./metals.ts";
import { rings } from "./rings.ts";
import { USAGES, polymerLabel } from "./query.ts";
import type { Reaction, Step } from "./reaction.ts";

type P = [number, number];
// An object on the canvas: its role (what a screen reader says after the name), its name and more about it (read
// after a pause), what a Tab selects (atoms, and captions, arrows, shapes and cycles by id) and its box as drawn
// (drawing units, y up: left, bottom, right, top).
export type Item = { key: string; role: string; name: string; more?: string; atoms: number[]; items: number[]; box?: Box };
// What the editor knows that the drawing alone does not: where each thing is drawn, a structure's checked name and
// formula (undefined while they are not worked out), and the reaction an arrow is in.
export type Sources = {
  box: (atoms: number[], items: number[]) => Box | undefined;
  name?: (atoms: number[]) => string | undefined;
  formula?: (atoms: number[]) => string | undefined;
  reaction?: (arrow: number) => Reaction | undefined;
};

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number, one: string, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const an = (noun: string) => (noun === "text" ? noun : `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`);
// Caption text read as one line.
const plain = (t: string) => t.replace(/\s*\n\s*/g, ", ").trim();
export const elementName = (label: string) => ELEMENTS.get(label) ?? (label === "D" ? "deuterium" : label === "T" ? "tritium" : label);
const chargeText = (c: number) => (c === 1 ? "positive charge" : c === -1 ? "negative charge" : `charge ${c > 0 ? "plus" : "minus"} ${Math.abs(c)}`);

// ——— Atoms and bonds, for the keyboard hotspot ———
const fragmentOf = (m: Mol, i: number) => fragments(m).find((f) => f.includes(i)) ?? [i];
const same = (a: Atom, b: Atom) => !a.text && !b.text && !a.centre && !b.centre && a.label === b.label;
// What an atom is called: its element with its number among the same element in its structure (carbon 3), or the
// number it shows; a label by its text (label OMe).
function callAtom(m: Mol, i: number, frag: number[]): string {
  const a = m.atoms[i];
  if (a.centre) return a.centre.variable ? "variable attachment" : "multi-centre attachment";
  if (a.text) return `label ${a.text.replace(/\n/g, " ")}`;
  return `${elementName(a.label)} ${a.number ?? frag.filter((j) => j <= i && same(m.atoms[j], a)).length}`;
}
// The direction from one point to another on a clock face: 12 is up the page, 3 to the right.
export function clock(from: P, to: P): number {
  const deg = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
  return Math.round(((((90 - deg) % 360) + 360) % 360) / 30) % 12 || 12;
}
// A bond's kind by the palette's names (Double bond, Hashed wedge bond).
const ORDERS: Record<number, string> = { 1: "Single", 2: "Double", 3: "Triple", 4: "Aromatic", [HBOND]: "Hydrogen", 14: "Quadruple" };
export function bondKind(b: Bond): string {
  const k = Object.values(BONDS).find(({ spec }: { spec: BondSpec }) => spec.type === b.type && spec.stereo === b.stereo && spec.display === b.display);
  const name = k?.name ?? (b.stereo === 1 ? "Wedge" : b.stereo === 6 ? "Hashed wedge" : b.stereo === 4 ? "Wavy" : ORDERS[b.type] ?? "Query");
  return name.endsWith(" bond") ? name : `${name} bond`;
}
// A wedge starts narrow at its first atom.
const wedged = (b: Bond) => b.stereo === 1 || b.stereo === 6 || b.display === "hollow";
// The smallest rings of a structure (rings.ts, from its bonds alone, by drawing atom numbers), kept with the bond list.
const ringLists = new WeakMap<Mol["bonds"], Map<number, number[][]>>();
function ringsOf(m: Mol, frag: number[]): number[][] {
  const mine = ringLists.get(m.bonds) ?? new Map<number, number[][]>(), key = Math.min(...frag);
  ringLists.set(m.bonds, mine);
  let found = mine.get(key);
  if (!found) {
    const at = new Map(frag.map((i, k) => [i, k]));
    const bonds = m.bonds.filter((b) => b.type !== HBOND && at.has(b.atoms[0]) && at.has(b.atoms[1])).map((b) => ({ a: at.get(b.atoms[0])!, b: at.get(b.atoms[1])!, order: 1 as const }));
    mine.set(key, (found = rings({ atoms: frag.map(() => ({ el: "C", charge: 0, h: 0 })), bonds }).map((r) => r.map((k) => frag[k]))));
  }
  return found;
}
const smallest = (m: Mol, frag: number[], has: (ring: number[]) => boolean) => Math.min(Infinity, ...ringsOf(m, frag).filter(has).map((r) => r.length));
const ringBond = (r: number[], p: number, q: number) => r.some((x, k) => { const y = r[(k + 1) % r.length]; return (x === p && y === q) || (x === q && y === p); });

// What the hotspot says on an atom: "Carbon 3, no hydrogens, in a 6-membered ring. Double bond to oxygen 1 at 12
// o'clock; single bond to oxygen 2 at 4 o'clock; single bond to carbon 2 at 8 o'clock." Neighbours go clockwise from 12.
export function atomText(m: Mol, i: number): string {
  const a = m.atoms[i], frag = fragmentOf(m, i), here = pos(m, i), charge = a.charge ?? 0, out = [upper(callAtom(m, i, frag))];
  if (a.isotope) out.push(`mass number ${a.isotope}`);
  if (charge) out.push(chargeText(charge));
  if (a.radical) out.push(a.radical === 1 ? "radical" : a.radical === 2 ? "triplet diradical" : "singlet diradical");
  const mine = m.bonds.flatMap((b, k) => (b.atoms.includes(i) ? [k] : []));
  if (!a.text && !a.centre) {
    const used = mine.reduce((s, k) => s + orderOf(m.bonds[k].type), 0);
    out.push(count(a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical ?? 0), "hydrogen"));
  }
  const ring = smallest(m, frag, (r) => r.includes(i));
  if (ring < Infinity) out.push(`in a ${ring}-membered ring`);
  const turn = (q: P) => ((((90 - (Math.atan2(q[1] - here[1], q[0] - here[0]) * 180) / Math.PI) % 360) + 360) % 360);
  const ways = mine.map((k) => { const b = m.bonds[k], j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0]; return { b, j, at: pos(m, j) }; }).sort((p, q) => turn(p.at) - turn(q.at));
  const said = ways.map(({ b, j, at }) => `${lower(bondKind(b))} to ${callAtom(m, j, frag)} at ${clock(here, at)} o'clock${wedged(b) && b.atoms[0] === i ? ", narrow end here" : ""}`);
  return `${out.join(", ")}. ${said.length ? upper(said.join("; ")) : "No bonds"}.`;
}
// What the hotspot says on a bond: "Double bond, carbon 1 to oxygen 1, in a 6-membered ring."
export function bondText(m: Mol, k: number): string {
  const b = m.bonds[k], [p, q] = b.atoms, frag = fragmentOf(m, p), out = [`${bondKind(b)}, ${callAtom(m, p, frag)} to ${callAtom(m, q, frag)}`];
  if (wedged(b)) out.push(`narrow end at ${callAtom(m, p, frag)}`);
  const ring = smallest(m, frag, (r) => ringBond(r, p, q));
  if (ring < Infinity) out.push(`in a ${ring}-membered ring`);
  return `${out.join(", ")}.`;
}

// ——— Objects ———
// A structure's name and more: its checked name (or abbreviation) with its formula and rings after it, else its formula
// and rings ("C9H8O4, one ring"). Rings: bonds less atoms plus the pieces they join (an η5 ring is joined by no bond).
// own: the structure's bonds, when the caller has them.
export function structureText(m: Mol, atoms: number[], s: Pick<Sources, "name" | "formula">, own = m.bonds): { name: string; more?: string } {
  const set = new Set(atoms), up = new Map(atoms.map((i) => [i, i]));
  const root = (i: number): number => { let r = i; while (up.get(r) !== r) r = up.get(r)!; return r; };
  let bonds = 0, pieces = atoms.length;
  for (const b of own) {
    if (b.type === HBOND || !set.has(b.atoms[0]) || !set.has(b.atoms[1])) continue;
    bonds++;
    const [x, y] = b.atoms.map(root);
    if (x !== y) { up.set(x, y); pieces--; }
  }
  const shape = `${s.formula?.(atoms) ?? count(atoms.length, "atom")}, ${count(bonds - atoms.length + pieces, "ring")}`, name = s.name?.(atoms);
  return name ? { name, more: shape } : { name: shape };
}
// A part of a reaction as a sentence names it: a structure's name or formula, or text.
function partText(m: Mol, x: Step, s: Sources): string | undefined {
  if (x.kind === "structure") return s.name?.(x.atoms) ?? s.formula?.(x.atoms) ?? "a structure";
  if (x.kind === "text") { const c = m.captions?.find((y) => y.id === x.id); return c && plain(c.text); }
  return undefined;
}
const VERBS: Partial<Record<Arrow["kind"], string>> = { equilibrium: "is in equilibrium with", resonance: "is a resonance form of", retro: "is made from", nogo: "does not give", hash: "does not give" };
// One step of a reaction as a sentence: "2-hydroxybenzoic acid plus acetic anhydride gives 2-acetyloxybenzoic acid,
// conditions: H2SO4, 90 °C". The parts are those between this arrow and the arrows either side; the conditions are the
// text kept on the arrow (above first) and what is drawn above and below it.
export function reactionText(m: Mol, r: Reaction, arrow: number, s: Sources): string | undefined {
  const steps = r.steps, j = steps.findIndex((x) => x.kind === "arrow" && x.id === arrow), a = m.arrows?.find((x) => x.id === arrow);
  if (j < 0 || !a) return undefined;
  let lo = j, hi = j;
  while (lo > 0 && steps[lo - 1].kind !== "arrow") lo--;
  while (hi < steps.length - 1 && steps[hi + 1].kind !== "arrow") hi++;
  const side = (part: Step[]) => part.flatMap((x) => partText(m, x, s) ?? []).join(" plus ");
  const kept = (m.captions ?? []).filter((c) => c.on?.arrow === arrow).sort((p, q) => (p.on!.side === q.on!.side ? q.y - p.y : p.on!.side === "above" ? -1 : 1));
  const drawn = r.conditions.get(arrow), conditions = [...kept.map((c) => plain(c.text)), ...[...(drawn?.above ?? []), ...(drawn?.below ?? [])].flatMap((x) => partText(m, x, s) ?? [])].filter(Boolean);
  const left = side(steps.slice(lo, j)), right = side(steps.slice(j + 1, hi + 1));
  const sentence = left || right ? upper([left, VERBS[a.kind] ?? "gives", right].filter(Boolean).join(" ")) : "";
  if (!sentence) return conditions.length ? `Conditions: ${conditions.join(", ")}` : undefined;
  return conditions.length ? `${sentence}, conditions: ${conditions.join(", ")}` : sentence;
}
// What is at a curved arrow's end: an atom, a bond, or an atom a little way off (where a lone pair is drawn).
function placeAt(m: Mol, p: P): string | undefined {
  const i = atomAt(m, p, 0.35) ?? (bondAt(m, p, 0.3) === undefined ? atomAt(m, p, 0.75) : undefined);
  if (i !== undefined) return callAtom(m, i, fragmentOf(m, i));
  const k = bondAt(m, p, 0.3);
  if (k === undefined) return undefined;
  const [x, y] = m.bonds[k].atoms, f = fragmentOf(m, x);
  return `the bond between ${callAtom(m, x, f)} and ${callAtom(m, y, f)}`;
}
function arrowText(m: Mol, a: Arrow, s: Sources): { role: string; name: string } {
  const kind = ARROWS[a.kind];
  if (a.kind === "line" || a.kind === "arc" || a.kind === "curve" || a.kind === "cut" || a.kind === "orbital") {
    if (a.orbital) return { role: "shape", name: `${a.orbital.shape} orbital${a.orbital.phase === "plain" ? "" : `, ${a.orbital.phase}`}` };
    const noun = a.kind === "curve" && a.curve?.closed ? "closed curve" : lower(kind);
    return { role: "shape", name: upper(a.style ? `${a.style} ${noun}` : noun) };
  }
  if (curved(a)) {
    const from = placeAt(m, a.from), to = placeAt(m, a.to);
    return { role: `${lower(kind)} arrow`, name: from || to ? upper([from && `from ${from}`, to && `to ${to}`].filter(Boolean).join(" ")) : kind };
  }
  const r = straightArrow(a) ? s.reaction?.(a.id) : undefined, said = r && reactionText(m, r, a.id, s);
  return said ? { role: `${lower(kind)} arrow`, name: said } : { role: "arrow", name: kind };
}
function shapeText(sh: Shape): { name: string; more?: string } {
  const base = SHAPES[sh.kind], dashed = sh.dashed ? ", dashed" : "";
  if (sh.rgroup) return { name: `R-group definition ${sh.rgroup.name}` };
  if (sh.tlc) {
    const t = sh.tlc, lanes = Array.from({ length: t.lanes }, (_, k) => t.spots.filter((x) => x.lane === k).map((x) => x.rf).sort((p, q) => p - q));
    return { name: `${base}, ${count(t.lanes, "lane")}, ${count(t.spots.length, "spot")}`, more: lanes.map((rf, k) => `Lane ${k + 1}: ${rf.length ? `Rf ${rf.join(", ")}` : "no spots"}`).join(". ") };
  }
  if (sh.table) {
    const cells = sh.table.cells;
    return { name: `${base}, ${count(cells.length, "row")}, ${count(cells[0]?.length ?? 0, "column")}`, more: cells.map((row) => row.map((c) => plain(c) || "empty").join(", ")).join("; ").slice(0, 400) };
  }
  if (isBracket(sh) && sh.polymer) {
    const label = polymerLabel(sh.polymer);
    return { name: `${base}, ${USAGES[sh.polymer.usage].name.replace(/ \(.*\)$/, "")}${label ? ` ${label}` : ""}` };
  }
  return { name: `${base}${dashed}` };
}

// Reading order, as a page is read: rows from the top, each row from the left. A thing joins a row when at least half
// of its height (or the row's, if less) is level with the row. Things with no box come last.
export function readingOrder(boxes: (Box | undefined)[]): number[] {
  const ids = boxes.flatMap((b, k) => (b ? [k] : [])).sort((p, q) => boxes[q]![3] - boxes[p]![3]);
  const rows: { lo: number; hi: number; ids: number[] }[] = [];
  for (const k of ids) {
    const [, lo, , hi] = boxes[k]!;
    const row = rows.find((r) => Math.min(hi, r.hi) - Math.max(lo, r.lo) >= 0.5 * Math.min(hi - lo, r.hi - r.lo) - 1e-9);
    if (row) { row.ids.push(k); row.lo = Math.min(row.lo, lo); row.hi = Math.max(row.hi, hi); }
    else rows.push({ lo, hi, ids: [k] });
  }
  return [...rows.flatMap((r) => r.ids.sort((p, q) => boxes[p]![0] - boxes[q]![0])), ...boxes.flatMap((b, k) => (b ? [] : [k]))];
}

// Every object on the canvas, in reading order. A group (a spectrum) is one object, as a click picks the whole
// outermost group. Text that belongs to something (a compound number under its structure, conditions kept on an arrow, a cycle's
// labels) comes straight after it.
export function describe(m: Mol, s: Sources): Item[] {
  const atomsTaken = new Set<number>(), itemsTaken = new Set<number>(), primary: Item[] = [];
  const add = (x: Omit<Item, "box">) => { const it = { ...x, box: s.box(x.atoms, x.items) }; primary.push(it); return it; };
  const groups = [...(m.groups ?? [])].sort((p, q) => q.atoms.length + q.items.length - p.atoms.length - p.items.length);
  for (const g of groups) {
    if (g.atoms.some((i) => atomsTaken.has(i)) || g.items.some((i) => itemsTaken.has(i))) continue;
    g.atoms.forEach((i) => atomsTaken.add(i));
    g.items.forEach((i) => itemsTaken.add(i));
    add({ key: `g${g.id}`, ...(g.plot ? { role: "spectrum", name: g.plot.title } : groupText(m, g.atoms, g.items, s)), atoms: g.atoms, items: g.items });
  }
  const owner = new Map<number, string>(), frags = fragments(m), piece = new Map<number, number>(), bonds: Mol["bonds"][] = frags.map(() => []);
  frags.forEach((f, k) => f.forEach((i) => piece.set(i, k)));
  for (const b of m.bonds) bonds[piece.get(b.atoms[0])!]?.push(b);
  frags.forEach((f, k) => {
    if (f.some((i) => atomsTaken.has(i)) || f.every((i) => m.atoms[i].hidden)) return;
    const key = `s${Math.min(...f)}`;
    f.forEach((i) => owner.set(i, key));
    add({ key, role: "structure", ...structureText(m, f, s, bonds[k]), atoms: f, items: [] });
  });
  for (const c of m.cycles ?? []) if (!itemsTaken.has(c.id)) add({ key: `o${c.id}`, role: "catalytic cycle", name: count(c.nodes.length, "intermediate"), more: c.clockwise ? "Clockwise" : "Anticlockwise", atoms: [], items: [c.id] });
  for (const a of m.arrows ?? []) if (!itemsTaken.has(a.id)) add({ key: `o${a.id}`, ...arrowText(m, a, s), atoms: [], items: [a.id] });
  for (const sh of m.shapes ?? []) if (!itemsTaken.has(sh.id)) add({ key: `o${sh.id}`, role: "shape", ...shapeText(sh), atoms: [], items: [sh.id] });
  const keys = new Set(primary.map((x) => x.key)), attached = new Map<string, Item[]>();
  for (const c of m.captions ?? []) {
    if (itemsTaken.has(c.id)) continue;
    const it: Item = { key: `o${c.id}`, role: "text", name: plain(c.text) === "+" ? "Plus sign" : plain(c.text) || "Empty", atoms: [], items: [c.id], box: s.box([], [c.id]) };
    const to = c.under?.length ? owner.get(c.under[0]) : c.on ? `o${c.on.arrow}` : c.cycle ? `o${c.cycle.cycle}` : undefined;
    if (to && keys.has(to)) attached.set(to, [...(attached.get(to) ?? []), it]);
    else primary.push(it);
  }
  return readingOrder(primary.map((x) => x.box)).flatMap((k) => {
    const x = primary[k], more = attached.get(x.key) ?? [];
    return [x, ...readingOrder(more.map((y) => y.box)).map((j) => more[j])];
  });
}
// A spectrum's title caption, when a group's items are a spectrum (a title and a trace).
function spectrumTitle(m: Mol, items: number[]) {
  const ids = new Set(items), title = (m.captions ?? []).find((c) => ids.has(c.id) && /\b(NMR|IR|MS|HRMS|UV)\b/.test(c.text));
  return title && m.arrows?.some((a) => ids.has(a.id) && a.kind === "curve") ? title : undefined;
}
// A figure's axis unit, when a group is a figure Octet placed (a mass spectrum has no title or record).
const unitOf = (m: Mol, items: number[]) => { const ids = new Set(items); return (m.captions ?? []).find((c) => ids.has(c.id) && c.role?.role === "unit"); };
// A whole group's name as one object, for the Actions panel's title: a page spectrum by what it plots, a mass
// spectrum by its m/z axis, another spectrum as a spectrum, any other group as a group.
export function groupTitle(m: Mol, g: Group): string {
  if (g.plot) return plotName(g.plot);
  const unit = unitOf(m, g.items);
  return unit?.text === "m/z" ? "Mass spectrum" : unit || spectrumTitle(m, g.items) ? "Spectrum" : "Group";
}
// A group's name: a spectrum by its title, else its parts.
function groupText(m: Mol, atoms: number[], items: number[], s: Sources): { role: string; name: string } {
  const ids = new Set(items), caps = (m.captions ?? []).filter((c) => ids.has(c.id)), title = spectrumTitle(m, items);
  if (title) return { role: "spectrum", name: plain(title.text) };
  if (unitOf(m, items)) return { role: "spectrum", name: groupTitle(m, { id: 0, atoms, items }) };
  const inside = new Set(atoms), parts = [...fragments(m).filter((f) => f.every((i) => inside.has(i))).map((f) => structureText(m, f, s).name), ...caps.map((c) => plain(c.text))];
  const rest = items.length - caps.length;
  if (rest > 0) parts.push(count(rest, "other object"));
  return { role: "group", name: parts.length > 5 ? `${parts.slice(0, 4).join(", ")}, and ${parts.length - 4} more` : parts.join(", ") || "Empty" };
}

// ——— What an edit changed ———
const PT = 14.4; // points per bond length (ACS Document 1996), as the arrow keys nudge
const what = (a: Atom) => (a.centre ? "attachment" : a.text ? `label ${a.text.replace(/\n/g, " ")}` : elementName(a.label));
const nounOf = (m: Mol, id: number): string | undefined => {
  if (m.captions?.some((c) => c.id === id)) return "text";
  const a = m.arrows?.find((x) => x.id === id);
  if (a) return a.kind === "line" || a.kind === "arc" || a.kind === "curve" || a.kind === "cut" || a.kind === "orbital" ? lower(ARROWS[a.kind]) : `${lower(ARROWS[a.kind])} arrow`;
  const sh = m.shapes?.find((x) => x.id === id);
  if (sh) return lower(SHAPES[sh.kind]);
  return m.cycles?.some((c) => c.id === id) ? "catalytic cycle" : undefined;
};
const graphics = (m: Mol) => new Map<number, object>([...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? [])].map((x) => [x.id, x]));
const at = (x: object): P | undefined => { const o = x as { from?: P; x?: number; y?: number; centre?: P }; return o.from ?? (o.x !== undefined ? [o.x, o.y ?? 0] : o.centre); };
const without = (x: object, drop: string[]) => JSON.stringify(Object.fromEntries(Object.entries(x).filter(([k]) => !drop.includes(k))));
const fmt = (v: number) => String(Math.round(v * 10) / 10);
// A move as words: "1 pt right", "10 pt left and 10 pt up".
const moveText = ([dx, dy]: P) => [Math.abs(dx) > 1e-6 && `${fmt(Math.abs(dx) * PT)} pt ${dx > 0 ? "right" : "left"}`, Math.abs(dy) > 1e-6 && `${fmt(Math.abs(dy) * PT)} pt ${dy > 0 ? "up" : "down"}`].filter(Boolean).join(" and ");
// What an edit changed, said once in the live region: what was added or deleted, the one atom or bond that changed, or
// how far things moved. Empty when nothing changed.
export function changeText(was: Mol, now: Mol): string {
  if (was === now) return "";
  const out: string[] = [], moves: P[] = [];
  let moved = 0, objects = 0;
  let turned = "";
  if (was.atoms.length === now.atoms.length && was.bonds.length === now.bonds.length) {
    const changed: number[] = [], shifted: number[] = [];
    now.atoms.forEach((a, i) => {
      const b = was.atoms[i];
      if (a === b) return;
      const d: P = [a.location[0] - b.location[0], a.location[1] - b.location[1]];
      if (Math.hypot(...d) > 1e-6) { moves.push(d); moved++; shifted.push(i); }
      if (without(a, ["location"]) !== without(b, ["location"])) changed.push(i);
    });
    turned = turnText(was, now, shifted);
    if (changed.length === 1) {
      const i = changed[0], a = now.atoms[i], b = was.atoms[i];
      if (what(a) !== what(b)) out.push(`${upper(what(b))} changed to ${what(a)}`);
      else if ((a.charge ?? 0) !== (b.charge ?? 0)) out.push(`${upper(what(a))} now has ${!a.charge ? "no charge" : Math.abs(a.charge) === 1 ? `a ${chargeText(a.charge)}` : `a ${chargeText(a.charge).replace("charge", "charge of")}`}`);
      else if (a.isotope !== b.isotope) out.push(`${upper(what(a))} now has ${a.isotope ? `mass number ${a.isotope}` : "no mass number"}`);
      else if (a.radical !== b.radical) out.push(`${upper(what(a))} is ${a.radical ? "now a radical" : "no longer a radical"}`);
      else out.push(`Changed ${what(a)}`);
    } else if (changed.length) out.push(`Changed ${count(changed.length, "atom")}`);
    const bonds = now.bonds.flatMap((b, k) => (b === was.bonds[k] || JSON.stringify(b) === JSON.stringify(was.bonds[k]) ? [] : [k]));
    if (bonds.length === 1) {
      const b = now.bonds[bonds[0]], o = was.bonds[bonds[0]];
      out.push(b.atoms[0] === o.atoms[1] && b.atoms[1] === o.atoms[0] ? "The bond now points the other way" : bondKind(b) !== bondKind(o) ? `Changed to ${an(lower(bondKind(b)))}` : "Changed a bond");
    } else if (bonds.length) out.push(`Changed ${count(bonds.length, "bond")}`);
  } else {
    // Added and deleted bonds, found by where their ends are (an edit can number the atoms again).
    const key = (m: Mol, b: Bond) => b.atoms.map((i) => m.atoms[i].location.slice(0, 2).map((v) => v.toFixed(3)).join(",")).sort().join("|");
    const before = new Set(was.bonds.map((b) => key(was, b))), after = new Set(now.bonds.map((b) => key(now, b)));
    const added = now.bonds.filter((b) => !before.has(key(now, b))), gone = was.bonds.filter((b) => !after.has(key(was, b)));
    const da = now.atoms.length - was.atoms.length;
    if (added.length === 1 && !gone.length && da <= 1 && da >= 0) {
      const b = added[0];
      out.push(`Added ${an(lower(bondKind(b)))}, ${what(now.atoms[b.atoms[0]])} to ${what(now.atoms[b.atoms[1]])}`);
    } else {
      const plus = [da > 0 && count(da, "atom"), added.length && count(added.length, "bond")].filter(Boolean), minus = [da < 0 && count(-da, "atom"), gone.length && count(gone.length, "bond")].filter(Boolean);
      if (plus.length) out.push(`Added ${plus.join(" and ")}`);
      if (minus.length) out.push(`Deleted ${minus.join(" and ")}`);
    }
  }
  // Objects added or deleted: one by what it is ("Added text THF", "Added a plus sign"), more by how many.
  const g0 = graphics(was), g1 = graphics(now), added = [...g1.keys()].filter((id) => !g0.has(id)), gone = [...g0.keys()].filter((id) => !g1.has(id));
  const one = (m: Mol, id: number) => { const x = graphics(m).get(id) as { text?: string }, t = plain(x?.text ?? ""); return t === "+" ? "a plus sign" : `${an(nounOf(m, id) ?? "object")}${t ? ` ${t}` : ""}`; };
  if (added.length) out.push(`Added ${added.length === 1 ? one(now, added[0]) : count(added.length, "object")}`);
  if (gone.length) out.push(`Deleted ${gone.length === 1 ? one(was, gone[0]) : count(gone.length, "object")}`);
  for (const [id, x] of g1) {
    const y = g0.get(id);
    if (!y) continue;
    if (x === y) continue;
    const p = at(x), q = at(y), d: P | undefined = p && q ? [p[0] - q[0], p[1] - q[1]] : undefined;
    if (d && Math.hypot(...d) > 1e-6) { moves.push(d); objects++; }
    if ("text" in x && "text" in y && x.text !== y.text) out.push(`Text now reads ${plain(String(x.text))}`);
    else if (without(x, ["from", "to", "x", "y", "centre", "curve", "placed"]) !== without(y, ["from", "to", "x", "y", "centre", "curve", "placed"])) out.push(`Changed the ${nounOf(now, id) ?? "object"}`);
  }
  // A move that took everything the same way is said as how far ("Moved 1 pt right"); others by what moved.
  if (moves.length && !out.some((t) => /^(Added|Deleted)/.test(t))) {
    const d = moves[0], one = moves.every((e) => Math.hypot(e[0] - d[0], e[1] - d[1]) < 1e-6);
    out.unshift(one ? `Moved ${moveText(d)}` : turned || `Moved ${[moved && count(moved, "atom"), objects && count(objects, "object")].filter(Boolean).join(" and ")}`);
  }
  return out.length ? `${out.slice(0, 3).join(". ")}.` : "";
}
// Structures that moved as rigid pieces, turned in the page or turned over: "Turned 15° anticlockwise", "Turned over".
// The atoms that did not move count too (a flip leaves those on its axis). Empty when they moved otherwise (a clean
// up, a turn in 3D, part of a structure dragged).
function turnText(was: Mol, now: Mol, moved: number[]): string {
  if (moved.length < 2) return "";
  const set = new Set(moved), ids = fragments(now).filter((f) => f.some((i) => set.has(i))).flat();
  const at = (m: Mol, i: number) => m.atoms[i].location, gap = (m: Mol, i: number, j: number) => Math.hypot(at(m, j)[0] - at(m, i)[0], at(m, j)[1] - at(m, i)[1]);
  if (!ids.every((i, k) => Math.abs(gap(was, ids[0], i) - gap(now, ids[0], i)) < 1e-6 && (k === 0 || Math.abs(gap(was, ids[k - 1], i) - gap(now, ids[k - 1], i)) < 1e-6))) return "";
  const area = (m: Mol, i: number, j: number, k: number) => (at(m, j)[0] - at(m, i)[0]) * (at(m, k)[1] - at(m, i)[1]) - (at(m, j)[1] - at(m, i)[1]) * (at(m, k)[0] - at(m, i)[0]);
  const third = ids.find((k) => Math.abs(area(was, ids[0], ids[1], k)) > 1e-6);
  if (third !== undefined && Math.sign(area(was, ids[0], ids[1], third)) !== Math.sign(area(now, ids[0], ids[1], third))) return "Turned over";
  const v = (m: Mol): P => [at(m, ids[1])[0] - at(m, ids[0])[0], at(m, ids[1])[1] - at(m, ids[0])[1]], [p, q] = [v(was), v(now)];
  const deg = Math.round(((Math.atan2(p[0] * q[1] - p[1] * q[0], p[0] * q[0] + p[1] * q[1]) * 180) / Math.PI) * 10) / 10;
  return deg ? `Turned ${Math.abs(deg)}° ${deg > 0 ? "anticlockwise" : "clockwise"}` : "";
}

// ——— The focus ring ———
// The focus ring's colour on a page of the user's own colour: Octet's focus blue where it stands out 3 to 1 (WCAG's
// non-text contrast), else white on a dark page and navy on a light one. Undefined when the blue does.
const luminance = (hex: string) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((s, c, k) => s + c * [0.2126, 0.7152, 0.0722][k], 0);
export const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
export const FOCUS = "#3F6BFF";
export function ringOn(page: string): string | undefined {
  if (!/^#[0-9a-f]{6}$/i.test(page) || contrast(FOCUS, page) >= 3) return undefined;
  return contrast("#FFFFFF", page) >= contrast("#000E2F", page) ? "#FFFFFF" : "#000E2F";
}
