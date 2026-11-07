// Editing operations on a drawing. Each returns a new Mol and leaves the old one alone, so undo is a list of Mols.
// Coordinates are in bond lengths with y up, the same as KET.
import { AROMATIC, HBOND, H_FIRST, hydrogens, lonePairs, orderOf, placedAt, QUADRUPLE, settleShape, tableLayout, tableRow, type Arrow, type Head, type Atom, type Bond, type Box, type Caption, type Curve, type Kept, type CurvePoint, type Mol, type Shape, type Spot, type Table } from "./render.ts";
import { keepAngles, mapBranches, type Cycle } from "./cycle.ts";
import { anchorElement, chemicalText, isElement, labelSmiles } from "./labels.ts";
import type { DocStyle } from "./docstyle.ts";
import { aromaticAtoms, rings as ringsOf } from "./rings.ts";
import { plainOf, styled, whole, without, type TextRun } from "./richtext.ts";
import { OCENES } from "./metals.ts";

export type P = [number, number];
export const EMPTY: Mol = { atoms: [], bonds: [] };

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const unit = (a: P): P => mul(a, 1 / (len(a) || 1));
const rot = (a: P, t: number): P => [a[0] * Math.cos(t) - a[1] * Math.sin(t), a[0] * Math.sin(t) + a[1] * Math.cos(t)];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const deg = Math.PI / 180;

export const pos = (m: Mol, i: number): P => [m.atoms[i].location[0], m.atoms[i].location[1]];
export const neighbours = (m: Mol, i: number) =>
  m.bonds.flatMap((b) => (b.atoms[0] === i ? [b.atoms[1]] : b.atoms[1] === i ? [b.atoms[0]] : []));
// Each atom's neighbours, in bond order (as neighbours() gives them), made in one pass over the bonds.
export function bondedTo(m: Mol): number[][] {
  const near: number[][] = m.atoms.map(() => []);
  for (const b of m.bonds) { near[b.atoms[0]]?.push(b.atoms[1]); near[b.atoms[1]]?.push(b.atoms[0]); }
  return near;
}
// A drawing with more atoms than this is large. Checks that look at each atom's neighbours, or at atoms and bonds in
// pairs, then use a list or a grid made once, not the plain loops. Measured in node on rings of 6 atoms: at 100 atoms
// the plain loops take about 0.4 ms, at 200 atoms 1.5 ms and at 1000 atoms 45 ms (they grow with the square of the
// size); the list and the grid take 0.06, 0.12 and 1.2 ms.
export const LARGE = 100;
const bondIndex = (m: Mol, i: number, j: number) =>
  m.bonds.findIndex((b) => (b.atoms[0] === i && b.atoms[1] === j) || (b.atoms[0] === j && b.atoms[1] === i));

// Hit testing, in bond lengths.
// Hidden H atoms (Toggle Hydrogen Display) and their bonds are not hit. Of things about as near the pointer as the
// nearest (within TIE), the one in front is hit: in a structure turned in 3D, the atom or bond nearer the viewer, as
// it is drawn over the one behind; where flat bonds cross, the bond drawn later (in front).
const TIE = 0.05;
function nearest(ds: (number | undefined)[], front: (i: number) => number): number | undefined {
  let best: number | undefined;
  ds.forEach((d, i) => { if (d !== undefined && (best === undefined || d < ds[best]!)) best = i; });
  if (best === undefined) return undefined;
  const lo = ds[best]!;
  ds.forEach((d, i) => { if (d !== undefined && d <= lo + TIE && front(i) > front(best!) + 1e-9) best = i; });
  return best;
}
export function atomAt(m: Mol, p: P, r = 0.3): number | undefined {
  return nearest(m.atoms.map((x, i) => { const d = len(sub(pos(m, i), p)); return d < r && !x.hidden ? d : undefined; }), (i) => m.atoms[i].location[2] ?? 0);
}
export function bondAt(m: Mol, p: P, r = 0.2): number | undefined {
  const z = (i: number) => m.atoms[i].location[2] ?? 0;
  return nearest(m.bonds.map((b) => {
    if (m.atoms[b.atoms[0]].hidden || m.atoms[b.atoms[1]].hidden) return undefined;
    const a = pos(m, b.atoms[0]), ab = sub(pos(m, b.atoms[1]), a);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
    const d = len(sub(p, add(a, mul(ab, t))));
    return d < r ? d : undefined;
  }), (k) => z(m.bonds[k].atoms[0]) + z(m.bonds[k].atoms[1]) + k * 1e-6);
}

// An atom's scale (decision 0007). Bonds, chains, rings and templates drawn from an atom take it, so they match the
// bonds already there (ChemDraw's sprouted bonds take the structure's own bond length too).
export const scaleAt = (m: Mol, i: number) => m.atoms[i]?.scale ?? 1;
const withAtom = (m: Mol, p: P, label = "C", scale = 1): [Mol, number] => [{ ...m, atoms: [...m.atoms, { label, location: [p[0], p[1], 0], ...(scale !== 1 ? { scale } : {}) }] }, m.atoms.length];
// The atom at p, or a new carbon there at this scale.
function atomOrNew(m: Mol, p: P, scale = 1): [Mol, number] {
  const i = atomAt(m, p, 0.1 * Math.min(1, scale));
  return i === undefined ? withAtom(m, p, "C", scale) : [m, i];
}
// What a new bond is: its order, and its stereo (1 wedge, 6 hashed wedge) or display style.
export type BondSpec = Pick<Bond, "type" | "stereo" | "display">;
const SINGLE: BondSpec = { type: 1 };
// A bond with only the fields it needs (no empty stereo or display).
function makeBond(atoms: [number, number], spec: BondSpec): Bond {
  const bond: Bond = { type: spec.type, atoms };
  if (spec.stereo) bond.stereo = spec.stereo;
  if (spec.display) bond.display = spec.display;
  return bond;
}
function withBond(m: Mol, i: number, j: number, spec: BondSpec = SINGLE): Mol {
  if (i === j || bondIndex(m, i, j) >= 0) return m;
  return { ...m, bonds: [...m.bonds, makeBond([i, j], spec)] };
}

// Direction for a new bond from atom i: 30° on a lone atom, a zig-zag off a chain end,
// away from both bonds at a degree-2 atom, otherwise into the widest gap.
export function nextDirection(m: Mol, i: number): P {
  const chair = chairWay(m, i);
  if (chair) return chair.d;
  const here = pos(m, i), ns = neighbours(m, i), dirs = ns.map((j) => unit(sub(pos(m, j), here)));
  if (!dirs.length) return [Math.cos(30 * deg), Math.sin(30 * deg)];
  // sp atoms (a triple bond, or two double bonds) carry straight on.
  const orders = ns.map((j) => m.bonds[bondIndex(m, i, j)].type);
  if (dirs.length === 1 && orders[0] === 3) return mul(dirs[0], -1);
  if (dirs.length === 1) {
    const [a, b] = [rot(dirs[0], 120 * deg), rot(dirs[0], -120 * deg)];
    // Zig-zag: put the new bond on the other side of this bond from the previous one (as ChemDraw, only when the
    // neighbour is in a chain, with one other bond).
    const prev = neighbours(m, ns[0]).filter((j) => j !== i);
    if (prev.length === 1) {
      const axis = sub(here, pos(m, ns[0])), side = Math.sign(cross(axis, sub(pos(m, prev[0]), pos(m, ns[0]))));
      return Math.sign(cross(axis, a)) === side ? b : a;
    }
    // Otherwise ChemDraw's rule: the turn depends on which 45° sector the bond points into (its angle measured with
    // y down, as ChemDraw measures it).
    return Math.floor((Math.atan2(-dirs[0][1], dirs[0][0]) / Math.PI + 1) * 4) % 2 ? a : b;
  }
  if (dirs.length === 2) {
    const s = add(dirs[0], dirs[1]);
    return len(s) < 1e-6 ? [-dirs[0][1], dirs[0][0]] : unit(mul(s, -1));
  }
  const angles = dirs.map((d) => Math.atan2(d[1], d[0])).sort((a, b) => a - b);
  let gap = -1, mid = 0;
  angles.forEach((a, k) => {
    const next = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI;
    if (next - a > gap) { gap = next - a; mid = a + gap / 2; }
  });
  return [Math.cos(mid), Math.sin(mid)];
}

// A new bond off a ring atom of a chair cyclohexane, as chemists draw one (issue 35): the first axial, parallel to the
// chair's upright axis and away from the atom's ring neighbours (so up and down in turn round the ring), the second
// equatorial, parallel to the ring bonds once removed and pointing out of the ring. A chair is a six-membered ring
// with three pairs of parallel bonds that turns both ways round (a flat hexagon turns one way); its upright axis is
// square to the middle of its two shallowest pairs. Undefined for an atom of no chair, one with other bonds, or one
// whose third bond is neither axial nor equatorial. z: in a chair drawn with depth (the Conformers templates), the new
// atom's depth, so it is axial or equatorial in 3D too.
export function chairWay(m: Mol, i: number): { d: P; z?: number } | undefined {
  const ns = neighbours(m, i);
  if (ns.length < 2 || ns.length > 3) return undefined;
  for (const a of ns) for (const b of ns) {
    if (a >= b) continue;
    for (const p of neighbours(m, a)) for (const q of neighbours(m, p)) for (const r of neighbours(m, q)) {
      const ring = [i, a, p, q, r, b];
      if (new Set(ring).size < 6 || bondIndex(m, r, b) < 0) continue;
      const way = chairAt6(m, ring, ns.find((x) => x !== a && x !== b));
      if (way) return way;
    }
  }
  return undefined;
}
function chairAt6(m: Mol, ring: number[], other: number | undefined): { d: P; z?: number } | undefined {
  const pts = ring.map((x) => pos(m, x)), e = pts.map((p, k) => sub(pts[(k + 1) % 6], p)), u = e.map(unit), mean = e.reduce((s, v) => s + len(v), 0) / 6;
  if (e.some((v) => Math.abs(len(v) - mean) > 0.25 * mean)) return undefined;
  for (let k = 0; k < 3; k++) if (Math.abs(cross(u[k], u[k + 3])) > Math.sin(10 * deg) || dot(u[k], u[k + 3]) > 0) return undefined;
  const turns = u.map((v, k) => cross(v, u[(k + 1) % 6]));
  if (turns.some((t) => Math.abs(t) < 0.05) || turns.every((t) => t > 0) || turns.every((t) => t < 0)) return undefined;
  // The two pairs nearest parallel to each other are the shallow ones; the upright axis is square to their middle.
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]], [j, k] = pairs.reduce((x, y) => (Math.abs(dot(u[y[0]], u[y[1]])) > Math.abs(dot(u[x[0]], u[x[1]])) ? y : x));
  const mid = unit(add(u[j], mul(u[k], Math.sign(dot(u[j], u[k])) || 1))), axis: P = [-mid[1], mid[0]];
  const s1 = dot(sub(pts[1], pts[0]), axis), s5 = dot(sub(pts[5], pts[0]), axis);
  if (Math.sign(s1) !== Math.sign(s5) || Math.abs(s1) < 0.05 * mean) return undefined;
  const axial = mul(axis, s1 > 0 ? -1 : 1), c = mul(pts.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6);
  let equatorial = u[1];
  if (dot(equatorial, sub(pts[0], c)) < 0) equatorial = mul(equatorial, -1);
  let d = axial;
  if (other !== undefined) {
    const o = unit(sub(pos(m, other), pts[0]));
    if (dot(o, axial) > Math.cos(35 * deg)) d = equatorial;
    else if (dot(o, equatorial) <= Math.cos(35 * deg)) return undefined;
  }
  // Depth: the axial bond square to the plane of alternate ring atoms, the equatorial one parallel to the ring bond
  // once removed, each in 3D, taken one bond length across the page.
  const z3 = ring.map((x) => m.atoms[x].location[2] ?? 0);
  if (z3.every((z) => !z)) return { d };
  const v3 = (x: number, y: number) => [pts[y][0] - pts[x][0], pts[y][1] - pts[x][1], z3[y] - z3[x]];
  const [f, g] = [v3(0, 2), v3(0, 4)], n = [f[1] * g[2] - f[2] * g[1], f[2] * g[0] - f[0] * g[2], f[0] * g[1] - f[1] * g[0]];
  const w = d === axial ? n : v3(1, 2), across = w[0] * d[0] + w[1] * d[1];
  return Math.abs(across) < 0.2 * Math.hypot(...w) ? { d } : { d, z: z3[0] + w[2] / across };
}

// A bond from atom i (or from a new atom at a point) to point q. Joins an existing atom at q. A new atom takes the
// scale of the atom the bond starts from. A wedge's narrow end is at the start.
export function bondTo(m: Mol, from: number | P, q: P, spec: BondSpec = SINGLE): Mol {
  let i: number, j: number;
  if (typeof from === "number") i = from; else [m, i] = atomOrNew(m, from);
  [m, j] = atomOrNew(m, q, scaleAt(m, i));
  return withBond(m, i, j, spec);
}

// A click with the bond tool: on an atom, add a bond in the next direction (at the atom's scale); on empty canvas,
// add a bond at 30°.
// text: the atom's label runs to the right (1) or left (-1) of it; a bond within 60° of that way would be hidden
// under the label, so the other zig-zag direction is taken when it is clear.
export function sprout(m: Mol, from: number | P, spec: BondSpec = SINGLE, text = 0): Mol {
  if (typeof from !== "number") return bondTo(m, from, add(from, [Math.cos(30 * deg), Math.sin(30 * deg)]), spec);
  // Off a chair drawn with depth, the new atom takes its axial or equatorial depth.
  const chair = chairWay(m, from);
  if (chair?.z !== undefined) {
    const out = bondTo(m, from, add(pos(m, from), mul(chair.d, scaleAt(m, from))), spec), n = out.atoms.length - 1;
    return n < m.atoms.length ? out : { ...out, atoms: out.atoms.map((a, k) => (k === n ? { ...a, location: [a.location[0], a.location[1], chair.z!] } : a)) };
  }
  let d = nextDirection(m, from);
  const ns = neighbours(m, from), into = (v: P) => v[0] * text > Math.cos(60 * deg);
  if (text && into(d) && ns.length <= 1) {
    const e = ns.length ? unit(sub(pos(m, ns[0]), pos(m, from))) : ([0, 1] as P), k = 2 * dot(d, e), other: P = [k * e[0] - d[0], k * e[1] - d[1]];
    if (!into(other)) d = other;
  }
  return bondTo(m, from, add(pos(m, from), mul(d, scaleAt(m, from))), spec);
}

// A zig-zag chain from atom i (or a point) toward q: the points after the start, one bond per 0.866 bond lengths (at
// the atom's scale) of the drag, each bond at ±30° to the chain's axis so every angle is 120°. From empty canvas or a lone atom the axis is
// the drag, and the first bond goes to side (1 left of the drag, -1 right: the side the pointer is on, so a drag
// back across the axis flips it, as in ChemDraw). From an atom with bonds the first bond is at 120° to them (as
// nextDirection gives it, or either way off a chain end) and the axis is the one of those chains nearest the drag.
// angle: the document's chain angle (ChemDraw's Chain Angle, 120° by default) instead of 120°.
export function chainPoints(m: Mol, from: number | P, q: P, side = 1, angle = 120): P[] {
  const start = typeof from === "number" ? pos(m, from) : from, drag = sub(q, start), along = len(drag);
  const s = typeof from === "number" ? scaleAt(m, from) : 1, tilt = (180 - angle) / 2, step = Math.cos(tilt * deg) * s, rise = Math.sin(tilt * deg) * s;
  const count = Math.max(1, Math.round(along / step));
  const u = along > 1e-9 ? unit(drag) : ([1, 0] as P);
  const ns = typeof from === "number" ? neighbours(m, from) : [];
  // The axis and the first bond's side of it (the unit vector across the axis toward the first bond).
  let axis = u, across: P = mul([-u[1], u[0]], side < 0 ? -1 : 1);
  if (ns.length) {
    const e = unit(sub(pos(m, ns[0]), start)), next = nextDirection(m, from as number);
    const firsts = ns.length === 1 && orderBetween(m, from as number, ns[0]) !== 3 ? [...(angle === 120 ? [next] : []), rot(e, angle * deg), rot(e, -angle * deg)] : [next];
    let best = -Infinity;
    for (const f of firsts) for (const t of [tilt, -tilt]) {
      const a = rot(f, t * deg), score = dot(a, u);
      if (score > best + 1e-9) { best = score; axis = a; across = unit(sub(f, mul(a, step / s))); }
    }
  }
  return Array.from({ length: count }, (_, k) => add(add(start, mul(axis, (k + 1) * step)), mul(across, k % 2 ? 0 : rise)));
}
// The order of the bond between two atoms (1 when there is none).
const orderBetween = (m: Mol, i: number, j: number) => m.bonds[bondIndex(m, i, j)]?.type ?? 1;
// Bonds from atom i (or a new atom at a point) through each point in turn, joining atoms already there. Returns the
// drawing and the last atom.
export function chainThrough(m: Mol, from: number | P, points: P[]): { mol: Mol; last: number } {
  let last: number;
  if (typeof from === "number") last = from; else [m, last] = atomOrNew(m, from);
  const s = scaleAt(m, last);
  for (const p of points) {
    const before = m.atoms.length;
    m = bondTo(m, last, p);
    last = atomAt(m, p, 0.1 * Math.min(1, s)) ?? before;
  }
  return { mol: m, last };
}
// A chain dragged toward q (see chainPoints). Returns the drawing, the number of bonds added and the last atom.
export function chainTo(m: Mol, from: number | P, q: P, side = 1): { mol: Mol; bonds: number; last: number } {
  const points = chainPoints(m, from, q, side);
  return { ...chainThrough(m, from, points), bonds: points.length };
}
// The Snaking Chain (the Chain tool with Command held, as in ChemDraw): the chain's points follow the pointer p. Each
// new bond turns 60° from the one before (so every angle is 120°), to the side nearer the pointer, while that brings
// the chain nearer it; when the pointer goes back past the last atom, that atom goes. path: the points so far after
// the start; at least one stays. angle: the chain angle (each bond then turns 180° less it).
export function snake(start: P, path: P[], p: P, angle = 120): P[] {
  const out = [...path], d = (q: P) => len(sub(p, q));
  for (let guard = 0; guard < 200; guard++) {
    const n = out.length, last = out[n - 1], prev = n > 1 ? out[n - 2] : start;
    if (n > 1 && d(prev) < d(last) - 0.25) { out.pop(); continue; }
    const way = unit(sub(last, prev)), next = [rot(way, (180 - angle) * deg), rot(way, (angle - 180) * deg)].map((w) => add(last, w)).sort((a, b) => d(a) - d(b))[0];
    if (d(last) > 0.75 && d(next) < d(last) - 0.25) { out.push(next); continue; }
    return out;
  }
  return out;
}
// Add Chain (a Chain tool click): a chain of n new atoms from atom i, or of n atoms from a point, each bond going the
// way the next click with the bond tool would (so it zig-zags), at the atom's scale. Returns the drawing and the last
// atom.
export function addChain(m: Mol, from: number | P, n: number): { mol: Mol; last: number } {
  let last: number;
  if (typeof from === "number") last = from; else [m, last] = atomOrNew(m, from);
  const s = scaleAt(m, last);
  for (let k = typeof from === "number" ? 0 : 1; k < n; k++) {
    const q = add(pos(m, last), mul(nextDirection(m, last), s)), before = m.atoms.length;
    m = bondTo(m, last, q);
    last = atomAt(m, q, 0.1 * Math.min(1, s)) ?? before;
  }
  return { mol: m, last };
}

const setAtom = (m: Mol, i: number, change: Partial<Atom>): Mol => ({ ...m, atoms: m.atoms.map((a, k) => (k === i ? { ...a, ...change } : a)) });
// Marks drawn on an atom that do not change what it is: H dot or hash, attachment squiggle, polymer bead.
export const setAtomMarks = (m: Mol, i: number, change: Pick<Partial<Atom>, "hmark" | "attach" | "bead">) => setAtom(m, i, change);
const setBondAt = (m: Mol, i: number, change: Partial<Bond>): Mol => ({ ...m, bonds: m.bonds.map((b, k) => (k === i ? { ...b, ...change } : b)) });

export const setElement = (m: Mol, i: number, label: string) => setAtom(m, i, { label, text: undefined, runs: undefined, shown: undefined });
// ChemDraw's c key, or C typed as a label: a carbon whose label shows with its hydrogens (CH3, CH2, CH).
export const showCarbon = (m: Mol, i: number) => setAtom(m, i, { label: "C", text: undefined, runs: undefined, shown: true });
// An element key (or an element picked from a menu) on an atom: that element. C shows the carbon's label.
export const keyElement = (m: Mol, i: number, label: string) => (label === "C" ? showCarbon(m, i) : setElement(m, i, label));
// Sets what an atom reads as. One element symbol makes it that element; anything else (OMe, CO2Et, Ph) is a
// written label attached through its first element, or through carbon for a group. Empty text clears it to carbon.
// A residue label (its bonds say which kept atom each joins) given another name: the new residue's atoms when the
// name is one (sequence.ts relabel, set up by the editor, which has the chemistry); else its kept atoms and the bonds'
// links go, and the label is read from its text as any other.
export const labelHooks: { relabel?: (m: Mol, i: number, text: string) => Mol | undefined } = {};
const portedAt = (m: Mol, i: number) => !!m.atoms[i]?.inner?.atoms.length && m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === i && b.ports![e] >= 0));
export function setLabel(m: Mol, i: number, text: string): Mol {
  // A label of more than one line (Option-Return as it is typed) keeps its lines, each trimmed, empty ones left out.
  const t = text.split("\n").map((s) => s.trim()).filter(Boolean).join("\n");
  if (portedAt(m, i) && t !== m.atoms[i].text) {
    const r = labelHooks.relabel?.(m, i, t);
    if (r) return r;
    m = { ...setAtom(m, i, { inner: undefined, align: undefined }), bonds: m.bonds.map((b) => {
      if (!b.ports || !b.atoms.includes(i)) return b;
      const ports = b.atoms.map((k, e) => (k === i ? -1 : b.ports![e])) as [number, number], { ports: _, ...plain } = b;
      return ports.some((p) => p >= 0) ? { ...plain, ports } : plain;
    }) };
  }
  // A label that becomes an element leaves its contracted group behind.
  if (m.atoms[i].inner && (!t || t === "C" || isElement(t))) m = setAtom(m, i, { inner: undefined });
  if (!t) return setElement(m, i, "C");
  if (t === "C") return showCarbon(m, i);
  if (isElement(t)) return setElement(m, i, t);
  return setAtom(m, i, { label: anchorElement(t) ?? "C", text: t, runs: undefined });
}
// A written label's runs (issue 44): set on the label, and the label attaches through the part chemistry reads
// (the Fe of Fe with III raised). Runs that do not join to the label's text, or carry no style, are left off.
export function setLabelRuns(m: Mol, i: number, runs: TextRun[] | undefined): Mol {
  const a = m.atoms[i], ok = !!a.text && !!runs && styled(runs) && plainOf(runs) === a.text;
  return setAtom(m, i, { runs: ok ? runs : undefined, ...(ok && runs!.some((r) => r.script) ? { label: anchorElement(chemicalText(a.text, runs)!) ?? a.label } : {}) });
}
// Superscript or subscript on whole labels (Text > Superscript with atoms selected, issue 44): each label (an
// element's as it shows, OH) all in that script; or, when every one is already, all back to plain. A label back to
// plain that reads as its element with its usual H is the element again.
export function scriptLabels(m: Mol, ids: number[], to: "sub" | "super", hideH = false): Mol {
  const has = (a: Atom) => !!a.text && !!a.runs?.length && plainOf(a.runs) === a.text && a.runs.every((r) => r.script === to);
  const off = ids.every((i) => has(m.atoms[i])), used = bondOrders(m);
  return ids.reduce((out, i) => {
    const a = out.atoms[i];
    if (off) {
      const back = setLabelRuns(out, i, without(a.runs!, ["script"]));
      return a.chemical === false ? back : interpretLabels(back, [i], true, hideH);
    }
    const text = a.text ?? labelWords(out, i, hideH, used[i]), runs = a.text && a.runs && plainOf(a.runs) === a.text ? a.runs : [{ text }];
    return setLabelRuns(setAtom(out, i, { text }), i, runs.map((r) => ({ ...r, script: to })));
  }, m);
}
// What an atom's label shows, with its H (NH2; a lone O as H2O), as Octet draws it. hideH: the document leaves off H.
export function labelWords(m: Mol, i: number, hideH = false, used = bondOrders(m)[i]): string {
  const a = m.atoms[i], h = hideH ? 0 : a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used, a.radical === 3 ? 2 : a.radical), hs = h ? `H${h > 1 ? h : ""}` : "";
  return a.text ?? (!neighbours(m, i).length && H_FIRST.has(a.label) ? hs + a.label : a.label + hs);
}
// Interpret Chemically (ChemDraw's command on labels). Off, each label is its text, not chemistry: it keeps what it
// shows (an N with two H stays NH2 whatever its bonds). On, it is chemistry again, and a label that reads as its
// element with its usual H goes back to the element.
export function interpretLabels(m: Mol, ids: Iterable<number>, on: boolean, hideH = false): Mol {
  const pick = new Set(ids), used = bondOrders(m);
  return { ...m, atoms: m.atoms.map((a, i) => {
    if (!pick.has(i)) return a;
    if (!on) return { ...a, text: labelWords(m, i, hideH, used[i]), chemical: false };
    const { chemical: _, text, ...rest } = a;
    return text === labelWords({ ...m, atoms: m.atoms.map((x, k) => (k === i ? rest : x)) }, i, hideH, used[i]) ? rest : { ...rest, text };
  }) };
}
// A caption Octet can read as an atom label (Rh, NH2, OMe, CH3OH): one word, not tied to a structure, an arrow or a
// cycle. Make element makes it an atom.
export function labelable(c: Caption): boolean {
  const t = c.text.trim();
  return !c.on && !c.under && !c.cycle && !!t && !/\s/.test(t) && (isElement(t) || !!labelSmiles(t));
}
// A caption that counts as chemistry (ChemDraw's Interpret Chemically, Sam, 21 October 2026): the document's
// Interpret chemically is on (on), the caption's own is not off, and the caption reads as a label. It stays a caption,
// but it counts in the formula, the mass, the names and the warnings, and bonds join it.
export const chemicalCaption = (c: Caption, on: boolean) => on && c.chemical !== false && labelable(c);
// The drawing as chemistry reads it: each chemical caption as a lone atom after the drawing's atoms, at the caption's
// place. One element symbol is that element with no hydrogens (Rh, Bi, K), as a written label has only the hydrogens
// it shows; other text is a label (CH3OH, NaOCl). captions: the caption each of those atoms is, by id.
export function withCaptionAtoms(m: Mol, on: boolean): { mol: Mol; captions: number[] } {
  const caps = (m.captions ?? []).filter((c) => chemicalCaption(c, on));
  if (!caps.length) return { mol: m, captions: [] };
  const atoms = caps.map((c): Atom => {
    const t = c.text.trim(), at: [number, number, number] = [c.x, c.y, 0];
    return isElement(t) ? { label: t, location: at, implicitHCount: 0 } : { label: anchorElement(t) ?? "C", location: at, text: t };
  });
  return { mol: { ...m, atoms: [...m.atoms, ...atoms] }, captions: caps.map((c) => c.id) };
}
// The atom a caption makes, at a point: labelled with its text, in the caption's size, font, style and colour (or its
// runs', when all of its text shares them). A size or font the same as the document's labels' is left unset.
export function captionAtom(c: Caption, at: [number, number, number], s: Pick<DocStyle, "labelFont" | "labelSize" | "captionFont" | "captionSize">): Atom {
  const w = whole(c), size = w.size ?? s.captionSize, font = w.font ?? s.captionFont;
  return setLabel({ atoms: [{ label: "C", location: at, ...(size !== s.labelSize ? { size } : {}), ...(font !== s.labelFont ? { font } : {}),
    ...(w.bold ? { bold: true as const } : {}), ...(w.italic ? { italic: true as const } : {}), ...(w.underline ? { underline: true as const } : {}), ...(w.colour ? { colour: w.colour } : {}) }], bonds: [] }, 0, c.text).atoms[0];
}
// Captions made into atoms (Make element, Interpret Chemically): each new atom goes into the groups its caption was
// in, and the captions go.
export function captionsToAtoms(m: Mol, made: { id: number; atom: Atom }[]): Mol {
  const at = new Map(made.map(({ id }, k) => [id, m.atoms.length + k]));
  const groups = m.groups?.map((g) => {
    const add = g.items.filter((id) => at.has(id)).map((id) => at.get(id)!);
    return add.length ? { ...g, atoms: [...g.atoms, ...add] } : g;
  });
  return deleteGraphics({ ...m, atoms: [...m.atoms, ...made.map((x) => x.atom)], ...(groups ? { groups } : {}) }, new Set(at.keys()));
}
export const addCharge = (m: Mol, i: number, delta: number) => trimPairs(setAtom(m, i, { charge: (m.atoms[i].charge ?? 0) + delta || undefined }), i);

// The Symbols tool's marks. A charge adds to the atom's charge, drawn as a superscript sign or circled beside the
// atom. A partial charge toggles. A radical adds a second unpaired electron (a triplet) where the atom has a hydrogen
// to give, and the click after clears it. A lone pair adds one more each click, up to the atom's free pairs (at least
// one), and the click after that clears them. Past its free pairs, a lone pair on C, Si, N, P or As with two
// hydrogens to give takes them: a singlet carbene (ChemDraw reads a lone pair on a carbon as one), silylene or nitrene.
export type SymbolKind = "plus" | "minus" | "circledPlus" | "circledMinus" | "radical" | "pair" | "partialPlus" | "partialMinus"
  | "radicalCation" | "radicalAnion" | "hDot" | "hDash" | "attach" | "attachDiamond" | "attachStar" | "bead";
// bar (Option-click with the lone pair, as in ChemDraw): the atom's lone pairs drawn as bars, or as dots again; an
// atom with none gets one bar, as a click would add a pair. bars: Settings > Drawing > Lone pairs as bars, the style an atom's first pair takes.
export function addSymbol(m: Mol, i: number, kind: SymbolKind, bar = false, bars = false): Mol {
  const a = m.atoms[i];
  if (kind === "pair" && bar && (a.pairs || a.radical === 3)) return setAtom(m, i, { bars: a.bars ? undefined : true });
  switch (kind) {
    case "plus": case "minus": case "circledPlus": case "circledMinus": {
      const charge = (a.charge ?? 0) + (kind === "plus" || kind === "circledPlus" ? 1 : -1);
      return trimPairs(setAtom(m, i, { charge: charge || undefined, circled: charge && kind.startsWith("circled") ? true : undefined }), i);
    }
    case "radical": {
      const triplet = a.radical === 1 && !a.text && a.implicitHCount === undefined && hydrogens(a.label, a.charge ?? 0, bondOrders(m)[i], 1) > 0;
      return trimPairs(setAtom(m, i, { radical: triplet ? 2 : a.radical ? undefined : 1 }), i);
    }
    case "partialPlus": case "partialMinus": { const p = kind === "partialPlus" ? "+" : "-"; return setAtom(m, i, { partial: a.partial === p ? undefined : p }); }
    case "pair": {
      const n = (a.pairs ?? 0) + 1, used = bondOrders(m)[i], free = freePairs(m, i, used);
      const style = a.pairs ? {} : { bars: bar || bars || undefined };
      if (n > free && !a.radical && !a.text && a.implicitHCount === undefined && SINGLETS.has(a.label) && hydrogens(a.label, a.charge ?? 0, used) >= 2) return trimPairs(setAtom(m, i, { radical: 3, ...style }), i);
      const off = n > (a.radical === 3 ? free : Math.max(1, free));
      return setAtom(m, i, { pairs: off ? undefined : n, ...(off && a.radical === 3 ? { radical: undefined } : {}), ...style });
    }
    // A radical ion: one unpaired electron and a charge, together. Clicking one again takes both off.
    case "radicalCation": case "radicalAnion": {
      const charge = kind === "radicalCation" ? 1 : -1, on = a.radical === 1 && a.charge === charge;
      return trimPairs(setAtom(m, i, { radical: on ? undefined : 1, charge: on ? undefined : charge, circled: undefined }), i);
    }
    case "hDot": case "hDash": { const h = kind === "hDot" ? "dot" : "dash"; return setAtom(m, i, { hmark: a.hmark === h ? undefined : h }); }
    // An attachment point in ChemDraw's three styles: wavy (true), diamond and star. Its own style again takes it off.
    case "attach": return setAtom(m, i, { attach: a.attach === true ? undefined : true });
    case "attachDiamond": case "attachStar": { const st = kind === "attachDiamond" ? "diamond" : "star"; return setAtom(m, i, { attach: a.attach === st ? undefined : st }); }
    case "bead": return setAtom(m, i, { bead: !a.bead || undefined });
  }
}
const SINGLETS = new Set(["C", "Si", "N", "P", "As"]);
// The mark (a charge, radical or lone pair, by its Atom.angles key) at p: within r bond lengths of where it is drawn
// (electrons, px at L px per bond length) and nearer it than its atom, so a press on the atom still takes the atom. A
// query indicator stays where Octet puts it.
export function markNear(electrons: { atom: number; at: P; key?: string }[], m: Mol, p: P, L: number, r = 0.2): { atom: number; mark: string } | undefined {
  let best: { atom: number; mark: string } | undefined, near = r;
  for (const e of electrons) {
    const d = Math.hypot(e.at[0] / L - p[0], -e.at[1] / L - p[1]), a = m.atoms[e.atom]?.location;
    if (e.key && /^(charge|partial|radical[01]|pair[0-3])$/.test(e.key) && a && d < near && d < Math.hypot(a[0] - p[0], a[1] - p[1])) { near = d; best = { atom: e.atom, mark: e.key }; }
  }
  return best;
}
// A mark dragged round atom i towards p: its angle, in 15° steps with snap (Fixed Angles), else whole degrees.
export function moveMark(m: Mol, i: number, key: string, p: P, snap: boolean): Mol {
  const a = m.atoms[i], raw = (Math.atan2(p[1] - a.location[1], p[0] - a.location[0]) * 180) / Math.PI;
  return setAtom(m, i, { angles: { ...a.angles, [key]: snap ? Math.round(raw / 15) * 15 : Math.round(raw) } });
}
// Lone pairs shown never outnumber the ones the atom has (after a charge or radical changes them).
const trimPairs = (m: Mol, i: number) => (m.atoms[i].pairs ? setAtom(m, i, { pairs: Math.min(m.atoms[i].pairs!, freePairs(m, i)) || undefined }) : m);
// Each atom's bond orders added up, in one pass over the bonds (orderOf: an aromatic bond counts 1.5, a hydrogen bond 0).
export function bondOrders(m: Mol, order = orderOf): number[] {
  const used = m.atoms.map(() => 0);
  for (const { type, atoms: [p, q] } of m.bonds) {
    used[p] += order(type);
    if (q !== p) used[q] += order(type);
  }
  return used;
}
// How many lone pairs an atom has, from its element, bonds, hydrogens, charge and radical. used: its bond orders
// added up (from bondOrders), when they are known.
export function freePairs(m: Mol, i: number, used = bondOrders(m)[i]): number {
  const a = m.atoms[i];
  const h = a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used, a.radical);
  return lonePairs(a.label, a.charge ?? 0, Math.ceil(used), h, a.radical);
}
// Shows the lone pairs on every heteroatom among these atoms (as bars with `bars`, on an atom that showed none);
// when they all show already, hides them.
export function toggleLonePairs(m: Mol, atoms: number[], bars = false): Mol {
  const used = bondOrders(m), hetero = atoms.filter((i) => m.atoms[i].label !== "C" && freePairs(m, i, used[i]) > 0);
  const shown = hetero.every((i) => (m.atoms[i].pairs ?? 0) >= freePairs(m, i, used[i]));
  return hetero.reduce((acc, i) => setAtom(acc, i, shown ? { pairs: undefined } : { pairs: freePairs(m, i, used[i]), ...(m.atoms[i].pairs ? {} : { bars: bars || undefined }) }), m);
}
// Single, then double, then triple, then single again. A wedge or hash becomes a plain double, and a quadruple bond
// single. A hydrogen bond stays one, as in ChemDraw. A bond keeps its place where bonds cross, and its colour and
// highlight. A new bond style replaces a query bond type (Any, S/D); the bond's topology and reaction centre stay.
const respec = (m: Mol, i: number, spec: BondSpec): Mol => {
  const was = m.bonds[i].type;
  m = { ...m, bonds: m.bonds.map((b, k) => (k === i ? { ...makeBond(b.atoms, spec), ...(b.colour ? { colour: b.colour } : {}), ...(b.halo ? { halo: b.halo } : {}), ...(b.topology ? { topology: b.topology } : {}), ...(b.rxn ? { rxn: b.rxn } : {}) } : b)) };
  return spec.type === 3 && was !== 3 ? straighten(m, i) : m;
};
// A triple bond's atoms are sp, so linear (Sam, 2 November 2026). When bond k becomes triple, an atom of it with one
// other bond has that bond swung into line, opposite the triple bond, and everything beyond it with it. The smaller
// side moves. An atom in a ring, or with more bonds, is left as it is.
function straighten(m: Mol, k: number): Mol {
  for (const end of [0, 1]) {
    const a = m.bonds[k].atoms[end], b = m.bonds[k].atoms[1 - end], others = neighbours(m, a).filter((j) => j !== b);
    if (others.length !== 1) continue;
    const n = others[0], beyond = reach(m, n, a), near = reach(m, b, a);
    if (beyond.has(b)) continue; // a ring
    const here = pos(m, a), want = sub(here, pos(m, b)), now = sub(pos(m, n), here);
    let turn = Math.atan2(cross(now, want), dot(now, want));
    if (Math.abs(turn) < 1e-6) continue;
    const move = beyond.size <= near.size ? beyond : near;
    if (move === near) turn = -turn;
    m = { ...m, atoms: m.atoms.map((x, i) => {
      if (!move.has(i)) return x;
      const r = add(here, rot(sub(pos(m, i), here), turn));
      return { ...x, location: [r[0], r[1], x.location[2] ?? 0], ...turnMarks(x, (t) => t + turn / deg) };
    }) };
  }
  return m;
}
// The atoms bonded, step by step, to atom i without passing through atom not.
function reach(m: Mol, i: number, not: number): Set<number> {
  const seen = new Set([i]), todo = [i];
  while (todo.length) for (const j of neighbours(m, todo.pop()!)) if (j !== not && !seen.has(j)) { seen.add(j); todo.push(j); }
  return seen;
}
export const cycleBond = (m: Mol, i: number) => {
  const b = m.bonds[i];
  return b.type === HBOND ? m : respec(m, i, { type: b.type === QUADRUPLE ? 1 : b.stereo || b.display ? 2 : (b.type % 3) + 1 });
};
export const setBond = (m: Mol, i: number, type: number, stereo?: number) => respec(m, i, { type, stereo });
// Delete or Backspace over a bond of more than one line (Sam, 31 October 2026): one line fewer, so a double becomes a
// single and a triple a double. An aromatic or delocalised bond becomes a single. Undefined for a single bond (or a
// hydrogen bond), which Delete takes away.
export function lowerBond(m: Mol, i: number): Mol | undefined {
  const t = m.bonds[i].type, to = t === QUADRUPLE ? 3 : t === 2 || t === 3 ? t - 1 : t === AROMATIC ? 1 : undefined;
  return to === undefined ? undefined : respec(m, i, { type: to });
}
// No bond becomes a hydrogen bond, as in ChemDraw: the hydrogen bond tool only joins two atoms.
export const setBondSpec = (m: Mol, i: number, spec: BondSpec) => (spec.type === HBOND && m.bonds[i].type !== HBOND ? m : respec(m, i, spec));
// A double bond's second line on one side, centred, or (unset) placed automatically.
export const setPosition = (m: Mol, i: number, position?: "left" | "centre" | "right") => setBondAt(m, i, { position });
// Swaps a bond's ends, so a wedge points the other way.
// The links to kept atoms (a residue label's) go with their ends.
export const flipBond = (m: Mol, i: number) => setBondAt(m, i, { atoms: [m.bonds[i].atoms[1], m.bonds[i].atoms[0]], ...(m.bonds[i].ports ? { ports: [m.bonds[i].ports![1], m.bonds[i].ports![0]] as [number, number] } : {}) });

// The bond tools on an existing bond, as ChemDraw 26.1 changes it (its ChangeBondType and bond tracker).
// A bond style with a narrow and a wide end (a wedge, a hashed or hollow wedge, a dative arrow).
const pointed = (s: BondSpec) => !!s.stereo || s.display === "hollow" || s.display === "dative";
const sameStyle = (b: Bond, s: BondSpec) => b.type === s.type && (b.stereo ?? 0) === (s.stereo ?? 0) && b.display === s.display;
// Bond k with spec, its ends put so the narrow end is on the atom with more bonds; on a tie the wide end is on the
// atom nearer the point clicked, or (no point) the bond keeps its order.
function pointedAt(m: Mol, k: number, spec: BondSpec, at?: P): Mol {
  const [i, j] = m.bonds[k].atoms, di = neighbours(m, i).length, dj = neighbours(m, j).length;
  const wideAtI = di !== dj ? di < dj : !!at && len(sub(at, pos(m, i))) < len(sub(at, pos(m, j)));
  const r = respec(m, k, spec); // keeps the bond's colour, highlight, topology and reaction centre
  return wideAtI ? flipBond(r, k) : r;
}
// A double bond's second line with a new style, on the side it was.
const restyle = (m: Mol, k: number, display?: Bond["display"]) => ({ ...m, bonds: m.bonds.map((b, n) => {
  if (n !== k) return b;
  const { display: _, ...rest } = b;
  return display ? { ...rest, display } : rest;
}) });
// The side a click puts a double bond's second line on next, from the side it is drawn on now (side: -1 left, 0
// centred, 1 right of the bond from its first atom, on screen): round centre, one side and the other, in the order
// ChemDraw uses, which looks the same on screen whichever way the bond was drawn.
export function nextSide(m: Mol, k: number, side: number): "left" | "centre" | "right" {
  const [a, b] = m.bonds[k].atoms.map((i) => pos(m, i)), c = a[1] - b[1] <= a[0] - b[0];
  if (side === 0) return c ? "right" : "left";
  if (side > 0) return c ? "left" : "centre";
  return c ? "centre" : "right";
}
// A bond key (w, h) on bond k sets its style. A wedge key on a bond that is already that wedge turns it round, and on
// another bond points it as a click with the tool does (pointedAt; at: the pointer, if any). clickBond uses this for
// every bond but a double one.
export function keyBond(m: Mol, k: number, spec: BondSpec, at?: P): Mol {
  if (!pointed(spec)) return setBondSpec(m, k, spec);
  return sameStyle(m.bonds[k], spec) ? flipBond(m, k) : pointedAt(m, k, spec, at);
}
// A click with a bond tool (spec) on bond k, at a point. side: where the double bond's second line is drawn now.
// - A double or triple tool sets its bond; on a double bond of its own style it moves the second line instead.
// - A single bond tool on a single bond of its own style makes it double (bold and dashed keep their style), or turns
//   a wedge or dative round. On another single bond it sets its style, a wedge pointing as pointedAt says.
// - On a double bond the Solid, Bold, Dashed and Wavy tools restyle one line, or move the second line when it already
//   has that style: Solid gives a plain double, Bold a bold double, Dashed a dashed double and then an aromatic one,
//   Wavy a double either. The Dative tool makes a single dative bond. The wedge tools leave it as it is.
// - On a triple bond a single bond tool sets its single bond.
// - With triple (Settings > Drawing > Clicks make triple bonds), the Solid tool on a plain double bond makes it triple.
export function clickBond(m: Mol, k: number, spec: BondSpec, at: P, side = 0, triple = false): Mol {
  const b = m.bonds[k], cycle = () => setPosition(m, k, nextSide(m, k, side));
  if (triple && b.type === 2 && !b.display && !b.stereo && spec.type === 1 && !spec.display && !spec.stereo) return setBondSpec(m, k, { type: 3 });
  if (b.type === 10) return m; // a hydrogen bond (KET's type 10) stays as it is, as in ChemDraw
  // A bond to a multi-centre point (an η ring's) has no order to raise (issue 26); its style still changes.
  if (b.atoms.some((x) => m.atoms[x].centre) && (spec.type > 1 || (b.type === 1 && sameStyle(b, spec) && !pointed(spec)))) return m;
  if (spec.type > 1) return spec.type === 2 && sameStyle(b, spec) ? cycle() : sameStyle(b, spec) ? m : setBondSpec(m, k, spec);
  if (b.type === 1 && sameStyle(b, spec) && !pointed(spec)) return setBondSpec(m, k, { type: 2, ...(spec.display === "bold" || spec.display === "dashed" ? { display: spec.display } : {}) });
  if (b.type !== 2) return keyBond(m, k, spec, at); // the bond keys' rule, so a click and a key cannot differ here
  if (spec.stereo) return m;
  const d = b.display;
  switch (spec.display) {
    case undefined: return d === "bold" || d === "dashed" || d === "aromatic" ? restyle(m, k) : cycle();
    case "bold": return d === "bold" ? cycle() : restyle(m, k, "bold");
    case "dashed": return d === "dashed" ? restyle(m, k, "aromatic") : d === "aromatic" ? cycle() : restyle(m, k, "dashed");
    case "wavy": return d === "either" ? cycle() : restyle(m, k, "either");
    case "dative": return pointedAt(m, k, spec, at);
  }
  return m;
}
// Drawing a bond over an existing one (a bond tool dragged from one of its atoms to the other) raises its order, as
// ChemDraw's does: single to double, double to triple, triple to quadruple, and quadruple back to the tool's single
// bond, a wedge narrow at the atom dragged from. A single bond becomes a double of the tool's style: Bold a bold
// double, Dashed a dashed double (an aromatic double over a dashed bond), and Solid over a dashed bond a dashed double.
export function overBond(m: Mol, k: number, spec: BondSpec, from = m.bonds[k].atoms[0]): Mol {
  const b = m.bonds[k];
  if (b.type === 2) return setBondSpec(m, k, { type: 3 });
  if (b.type === 3) return setBondSpec(m, k, { type: QUADRUPLE });
  if (b.type !== 1) {
    const single = spec.type === 1 ? spec : SINGLE, to = b.atoms[0] === from ? b.atoms[1] : b.atoms[0];
    return { ...m, bonds: m.bonds.map((x, n) => (n === k ? makeBond([from, to], single) : x)) };
  }
  const d = spec.type === 1 && spec.display === "dashed" ? (b.display === "dashed" ? "aromatic" : "dashed") : spec.type === 1 && spec.display === "bold" ? "bold"
    : spec.type === 1 && !spec.display && !spec.stereo && b.display === "dashed" ? "dashed" : undefined;
  return setBondSpec(m, k, { type: 2, ...(d ? { display: d } : {}) });
}
// A bond dragged from atom i (or a point) to q: on to i's neighbour it is drawn over their bond; otherwise as bondTo.
// A bond between a metal and the middle of a ring (either way round) joins the ring through a new multi-centre point,
// as ChemDraw's Add Multi-Center Attachment and a bond from it do in two steps (issue 26). A bond from the metal to
// one of the ring's atoms (or to several) goes: the ring is η bonded now. A drag along a bond to a multi-centre point
// changes nothing: such a bond has no order to raise.
export function dragBond(m: Mol, from: number | P, q: P, spec: BondSpec = SINGLE): Mol {
  const j = typeof from === "number" ? atomAt(m, q, 0.1) : undefined, k = j === undefined ? -1 : bondIndex(m, from as number, j);
  if (k >= 0) return m.bonds[k].atoms.some((x) => m.atoms[x].centre) ? m : overBond(m, k, spec, from as number);
  const metal = typeof from === "number" ? from : atomAt(m, q, 0.1), ring = metal === undefined ? undefined : etaRing(m, metal, typeof from === "number" ? q : from);
  if (metal !== undefined && ring) {
    // The point is the ring's middle, in depth too (a ring turned in 3D).
    const c = ring.reduce((s, i) => add(s, pos(m, i)), [0, 0] as P), z = ring.reduce((s, i) => s + (m.atoms[i].location[2] ?? 0), 0), at = m.atoms.length;
    const own = new Set(ring), direct = (b: Bond) => b.atoms.includes(metal) && own.has(b.atoms[0] === metal ? b.atoms[1] : b.atoms[0]);
    m = { ...m, atoms: [...m.atoms, { label: "C", location: [c[0] / ring.length, c[1] / ring.length, z / ring.length], centre: { atoms: ring } }], bonds: m.bonds.filter((b) => !direct(b)) };
    return withBond(m, metal, at, spec);
  }
  return bondTo(m, from, q, spec);
}
// The ring a bond from metal atom i let go at p joins as an η ligand: a ring of three to eight atoms with a double or
// delocalised bond, its middle within a third of a bond length of p, and no atom there (a multi-centre point already
// there takes the bond as any atom does). Undefined for any other atom or place, so an ordinary bond is never taken.
const ringLists = new WeakMap<Mol["bonds"], number[][]>();
export function etaRing(m: Mol, i: number, p: P): number[] | undefined {
  const a = m.atoms[i];
  if (!a || !isMetal(a) || a.centre || atomAt(m, p, 0.1) !== undefined) return undefined;
  const s = scaleAt(m, i);
  return ringsIn(m).find((r) => {
    if (r.length < 3 || r.length > 8 || r.includes(i) || r.some((x) => m.atoms[x].centre)) return false;
    const c = mul(r.reduce((t, x) => add(t, pos(m, x)), [0, 0] as P), 1 / r.length);
    return len(sub(c, p)) < 0.34 * s && r.some((x, n) => [2, 4].includes(m.bonds[bondIndex(m, x, r[(n + 1) % r.length])]?.type));
  });
}

// The drawing's rings (the smallest through each bond), kept for its bonds. Bonds in no ring (ringBonds) are left out
// first, so each search stays in its own ring system and a long chain (a peptide) costs little.
function ringsIn(m: Mol): number[][] {
  let found = ringLists.get(m.bonds);
  if (!found) {
    const keep = ringBonds(m);
    ringLists.set(m.bonds, (found = ringsOf({ atoms: m.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: m.bonds.flatMap((b, k) => (keep[k] ? [{ a: b.atoms[0], b: b.atoms[1], order: 1 as const }] : [])) })));
  }
  return found;
}
// Whether the drawing may have a chair (chairOf): a cheap test, run before any ring search, so a drawing with none
// (nearly every drawing) costs one pass over its bonds. Each ring chairAt6 passes has a corner where its two ring bonds
// meet at under 94°: its opposite bonds are parallel to 10°, so any three turns in a row round it add up to 180° ± 10°,
// and it turns both ways (each turn at least 2.9°), so some three in a row mix the two ways and one of them turns at
// least 86.4°. Only six-membered cycles through a corner under 95° are tested, by chairAt6's tests of parallel bonds
// and turns.
// Kept for the last drawing, so perspectiveBonds and chairHydrogens on one drawing test it once.
let chairTest: [Mol["bonds"], Mol["atoms"], boolean] | undefined;
const SHARP = Math.cos(95 * deg), SIN10 = Math.sin(10 * deg);
// The most bonds neighbourSlots keeps for an atom.
export const WIDE = 6;
export function mayHaveChair(m: Mol): boolean {
  if (chairTest?.[0] !== m.bonds || chairTest[1] !== m.atoms) chairTest = [m.bonds, m.atoms, findChair(m)];
  return chairTest[2];
}
// Each atom's neighbours, at most WIDE of them (undefined when an atom has more), in one pass over the bonds: atom i's
// are near[WIDE * i] to near[WIDE * i + deg[i] - 1]. A bond from an atom to itself or to no atom is left out.
export type Slots = { deg: Uint8Array; near: Int32Array };
export function neighbourSlots(m: Mol): Slots | undefined {
  const n = m.atoms.length, bonds = m.bonds, deg = new Uint8Array(n), near = new Int32Array(WIDE * n);
  for (let k = 0; k < bonds.length; k++) {
    const ends = bonds[k].atoms, i = ends[0], j = ends[1];
    if (i === j || !(i >= 0 && i < n && j >= 0 && j < n)) continue;
    if (deg[i] === WIDE || deg[j] === WIDE) return undefined;
    near[WIDE * i + deg[i]++] = j;
    near[WIDE * j + deg[j]++] = i;
  }
  return { deg, near };
}
// Whether any of bonds ks may be a bond of a chair: a six-membered cycle through it that passes chairAt6's tests of
// parallel bonds and turns. Reads the positions of only the atoms near those bonds, so a few bonds in a large drawing
// cost little. An atom with more than WIDE bonds (a metal's) is left to the full test (true).
export function mayBeChairBond(m: Mol, ks: number[], slots = neighbourSlots(m)): boolean {
  if (!slots) return true;
  const n = m.atoms.length, bonds = m.bonds, { deg, near } = slots, xy = new Float64Array(2 * n).fill(NaN);
  const at = (i: number) => { if (xy[2 * i] !== xy[2 * i]) { const p = m.atoms[i].location; xy[2 * i] = p[0]; xy[2 * i + 1] = p[1]; } };
  // Bonds p-q and r-t point opposite ways, parallel to 10° (as chairAt6 has a chair's opposite bonds).
  const opposite = (p: number, q: number, r: number, t: number) => {
    at(p); at(q); at(r); at(t);
    const ux = xy[2 * q] - xy[2 * p], uy = xy[2 * q + 1] - xy[2 * p + 1], wx = xy[2 * t] - xy[2 * r], wy = xy[2 * t + 1] - xy[2 * r + 1], c = ux * wy - uy * wx;
    return ux * wx + uy * wy <= 0 && c * c <= SIN10 * SIN10 * (ux * ux + uy * uy) * (wx * wx + wy * wy);
  };
  // Each cycle i j x y z w through each bond i-j.
  for (const k of ks) {
    const i = bonds[k].atoms[0], j = bonds[k].atoms[1];
    if (i === j || !(i >= 0 && i < n && j >= 0 && j < n)) continue;
    for (let p = WIDE * j; p < WIDE * j + deg[j]; p++) {
      const x = near[p];
      if (x === i) continue;
      for (let q = WIDE * x; q < WIDE * x + deg[x]; q++) {
        const y = near[q];
        if (y === i || y === j) continue;
        for (let r = WIDE * i; r < WIDE * i + deg[i]; r++) {
          const w = near[r];
          if (w === j || w === x || w === y || !opposite(x, y, w, i)) continue;
          for (let t = WIDE * w; t < WIDE * w + deg[w]; t++) {
            const z = near[t];
            if (z === i || z === j || z === x || z === y || !opposite(i, j, y, z) || !opposite(j, x, z, w)) continue;
            let joined = false;
            for (let u = WIDE * y; u < WIDE * y + deg[y]; u++) if (near[u] === z) joined = true;
            if (!joined) continue;
            if (turnsBothWays(xy, [i, j, x, y, z, w])) return true;
          }
        }
      }
    }
  }
  return false;
}
// The last of chairAt6's tests of a ring whose opposite bonds are parallel (xy: the atoms' places, x then y): it turns
// both ways, at least a little at each atom. Passing it, the ring may be a chair.
function turnsBothWays(xy: Float64Array, ring: number[]): boolean {
  let allLeft = true, allRight = true;
  for (let k = 0; k < 6; k++) {
    const p = ring[k], q = ring[(k + 1) % 6], r = ring[(k + 2) % 6];
    const ux = xy[2 * q] - xy[2 * p], uy = xy[2 * q + 1] - xy[2 * p + 1], wx = xy[2 * r] - xy[2 * q], wy = xy[2 * r + 1] - xy[2 * q + 1];
    const t = (ux * wy - uy * wx) / Math.sqrt((ux * ux + uy * uy) * (wx * wx + wy * wy));
    if (Math.abs(t) < 0.05) return false;
    if (!(t > 0)) allLeft = false;
    if (!(t < 0)) allRight = false;
  }
  return !allLeft && !allRight;
}
// The lists findChair fills, kept from one drawing to the next.
let scratch = { deg: new Uint8Array(0), near: new Int32Array(0), way: new Float64Array(0), xy: new Float64Array(0) };
function findChair(m: Mol): boolean {
  const n = m.atoms.length, bonds = m.bonds, at = m.atoms;
  if (n < 6 || bonds.length < 6) return false;
  // One pass over the bonds: each atom's first WIDE bonds (the atom at the other end, and the way to it), and the
  // sharp corners (a, v, b) between them.
  if (scratch.deg.length < n) scratch = { deg: new Uint8Array(2 * n), near: new Int32Array(2 * WIDE * n), way: new Float64Array(4 * WIDE * n), xy: new Float64Array(4 * n) };
  const { deg, near, way, xy } = scratch, sharp: number[] = [];
  deg.fill(0, 0, n);
  for (let i = 0; i < n; i++) { const p = at[i].location; xy[2 * i] = p[0]; xy[2 * i + 1] = p[1]; }
  for (let k = 0; k < bonds.length; k++) {
    const ends = bonds[k].atoms, i = ends[0], j = ends[1], dx = xy[2 * j] - xy[2 * i], dy = xy[2 * j + 1] - xy[2 * i + 1], l = Math.sqrt(dx * dx + dy * dy);
    if (!l) continue;
    const x = dx / l, y = dy / l;
    // An atom with more bonds (a metal's) is left to the full test.
    if (deg[i] === WIDE || deg[j] === WIDE) return true;
    for (let s = WIDE * i, e = s + deg[i]; s < e; s++) if (way[2 * s] * x + way[2 * s + 1] * y > SHARP) sharp.push(near[s] - 1, i, j);
    for (let s = WIDE * j, e = s + deg[j]; s < e; s++) if (-way[2 * s] * x - way[2 * s + 1] * y > SHARP) sharp.push(near[s] - 1, j, i);
    let s = WIDE * i + deg[i]++;
    near[s] = j + 1; way[2 * s] = x; way[2 * s + 1] = y;
    s = WIDE * j + deg[j]++;
    near[s] = i + 1; way[2 * s] = -x; way[2 * s + 1] = -y;
  }
  // Each cycle v a x y z b through a sharp corner whose opposite bonds are parallel (to 10°, as chairAt6 has them),
  // tested for turns as chairAt6 tests them.
  const parallel = (p: number, q: number, r: number, t: number) => {
    const ux = xy[2 * q] - xy[2 * p], uy = xy[2 * q + 1] - xy[2 * p + 1], wx = xy[2 * t] - xy[2 * r], wy = xy[2 * t + 1] - xy[2 * r + 1], c = ux * wy - uy * wx;
    return ux * wx + uy * wy <= 0 && c * c <= SIN10 * SIN10 * (ux * ux + uy * uy) * (wx * wx + wy * wy);
  };
  for (let c = 0; c < sharp.length; c += 3) {
    const a = sharp[c], v = sharp[c + 1], b = sharp[c + 2];
    for (let i = WIDE * a; i < WIDE * a + deg[a]; i++) {
      const x = near[i] - 1;
      if (x === v || x === b) continue;
      for (let j = WIDE * b; j < WIDE * b + deg[b]; j++) {
        const z = near[j] - 1;
        if (z === v || z === a || z === x || !parallel(a, x, z, b)) continue;
        for (let k = WIDE * x; k < WIDE * x + deg[x]; k++) {
          const y = near[k] - 1;
          if (y === v || y === a || y === b || y === z || !parallel(v, a, y, z) || !parallel(x, y, b, v)) continue;
          let joined = false;
          for (let l = WIDE * y; l < WIDE * y + deg[y]; l++) if (near[l] - 1 === z) joined = true;
          if (!joined) continue;
          if (turnsBothWays(xy, [v, a, x, y, z, b])) return true;
        }
      }
    }
  }
  return false;
}
// A six-membered ring drawn as a chair (issue 46): chairAt6's test passes at every atom, and its upright axis is
// within 45° of up the page. up: that axis, pointing up the page; axial: each ring atom's axial direction (up or down
// in turn round the ring). Undefined for any other ring, so a flat ring is never read as a chair.
export function chairOf(m: Mol, ring: number[]): { up: P; axial: P[] } | undefined {
  // A bridged ring (tropane's, a bicyclo[2.2.2]octane's) is drawn flat whatever it looks like: another ring may share
  // one atom with it, or one bond (a fused chair, decalin's), but no more.
  if (ring.length !== 6) return undefined;
  const axial: P[] = [];
  for (let k = 0; k < 6; k++) {
    const way = chairAt6(m, [0, 1, 2, 3, 4, 5].map((n) => ring[(k + n) % 6]), undefined);
    if (!way) return undefined;
    axial.push(unit(way.d));
  }
  const own = new Set(ring);
  if (ringsIn(m).some((r) => { const n = r.filter((x) => own.has(x)).length; return n < r.length && n > 1 && (n > 2 || bondIndex(m, ...(r.filter((x) => own.has(x)) as [number, number])) < 0); })) return undefined;
  const up = mul(axial[0], Math.sign(axial[0][1]) || 1);
  if (up[1] < Math.cos(45 * deg) || axial.some((d, k) => dot(d, up) * (k % 2 ? -1 : 1) * Math.sign(dot(axial[0], up)) < Math.cos(10 * deg))) return undefined;
  return { up, axial };
}
// Ring bonds that draw a ring in perspective, not stereochemistry (issue 46): the wedges, hashes and bold bonds of a
// chair, and of a ring with a bold bond and a wedge or hash beside it (a Haworth projection's front edge). A wedge on
// any other ring bond still sets a stereocentre.
export function perspectiveBonds(m: Mol): Set<number> {
  const out = new Set<number>(), edge = (b: Bond) => b.stereo === 1 || b.stereo === 6 || b.display === "bold";
  // Only a ring with a wedge or hash on one of its own bonds is looked at, and only in a drawing with a possible chair
  // or a bold bond.
  if (!m.bonds.some((b) => b.stereo === 1 || b.stereo === 6) || (!mayHaveChair(m) && !m.bonds.some((b) => b.display === "bold"))) return out;
  const pair = (i: number, j: number) => `${Math.min(i, j)} ${Math.max(i, j)}`, wedged = new Set(m.bonds.flatMap((b) => (b.stereo === 1 || b.stereo === 6 ? [pair(...b.atoms)] : [])));
  if (!wedged.size) return out;
  for (const ring of ringsIn(m)) {
    if (!ring.some((x, n) => wedged.has(pair(x, ring[(n + 1) % ring.length])))) continue;
    const own = ring.map((x, n) => bondIndex(m, x, ring[(n + 1) % ring.length])), front = own.filter((k) => k >= 0 && edge(m.bonds[k]));
    if (!front.some((k) => m.bonds[k].stereo)) continue;
    const bold = front.filter((k) => m.bonds[k].display === "bold" && !m.bonds[k].stereo);
    const haworth = bold.some((k) => front.some((j) => j !== k && m.bonds[j].stereo && m.bonds[j].atoms.some((x) => m.bonds[k].atoms.includes(x))));
    if (haworth || chairOf(m, ring)) for (const k of front) out.add(k);
  }
  return out;
}
// Stereochemistry read from a chair drawn flat (issue 46), as an H on each ring carbon with a wedge or hash: what
// Indigo and the CIP labeller read. Each ring carbon with one other bond (to a substituent) and one H: the substituent
// is axial (along the atom's axial direction) or equatorial (as chairAt6 places the bond after an axial one), and so
// up or down: an axial one the way it points, an equatorial one the other way from its atom's axial bond. The chair
// is seen from a little above it, as chemists draw one: its lower edge is nearest (its bold edge says which, when it
// has one). Only chairs drawn flat with no wedge, hash or wavy bond off the ring; any substituent neither axial nor
// equatorial sets nothing. Each H: its carbon, its place (in the widest gap at the carbon) and its bond's stereo.
export function chairHydrogens(m: Mol): { centre: number; at: P; stereo: 1 | 6 }[] {
  const out: { centre: number; at: P; stereo: 1 | 6 }[] = [];
  if (m.atoms.length < 6 || m.bonds.length < 6 || !mayHaveChair(m)) return out;
  const near = bondedTo(m), perspective = perspectiveBonds(m);
  for (const ring of ringsIn(m)) {
    // A chair with depth (the Conformers templates, Structure Perspective) is read in 3D as it is.
    if (ring.length !== 6 || ring.some((i) => m.atoms[i].text || m.atoms[i].centre || m.atoms[i].location[2])) continue;
    const chair = chairOf(m, ring);
    if (!chair) continue;
    const own = new Set(ring), off = ring.flatMap((i) => near[i].filter((j) => !own.has(j)).map((j) => m.bonds[bondIndex(m, i, j)]));
    if (off.some((b) => b.stereo || b.display === "wavy" || b.type !== 1)) continue;
    const { up, axial } = chair, mean = ring.reduce((t, i, n) => t + len(sub(pos(m, ring[(n + 1) % 6]), pos(m, i))), 0) / 6;
    const pucker = axial.map((d) => Math.sign(dot(d, up)));
    // The ring's turn seen from above it: the turn of the triangle of its up atoms (and of its down atoms), in ring order.
    const turn = (k: number) => { const [p, q, r] = [k, k + 2, k + 4].map((n) => pos(m, ring[n % 6])); return cross(sub(q, p), sub(r, p)); };
    const upFirst = pucker[0] > 0 ? 0 : 1, t1 = turn(upFirst), t2 = turn(1 - upFirst);
    if (Math.sign(t1) !== Math.sign(t2) || Math.abs(t1) < 0.1 * mean * mean || Math.abs(t2) < 0.1 * mean * mean) continue;
    // Seen from below when the bold or wedged edge is drawn above the middle of the ring.
    const middle = mul(ring.reduce((t, i) => add(t, pos(m, i)), [0, 0] as P), 1 / 6);
    const front = ring.flatMap((i, n) => { const k = bondIndex(m, i, ring[(n + 1) % 6]); return perspective.has(k) ? [dot(sub(mul(add(pos(m, i), pos(m, ring[(n + 1) % 6])), 0.5), middle), up)] : []; });
    const o = Math.sign(t1) * (front.length && front.reduce((a, b) => a + b, 0) > 0 ? -1 : 1);
    ring.forEach((c, k) => {
      const subs = near[c].filter((j) => !own.has(j));
      if (m.atoms[c].label !== "C" || m.atoms[c].charge || m.atoms[c].radical || subs.length !== 1 || m.atoms[c].implicitHCount !== undefined) return;
      const s = subs[0], here = pos(m, c), d = unit(sub(pos(m, s), here)), rot = [0, 1, 2, 3, 4, 5].map((n) => ring[(k + n) % 6]);
      const eq = chairAt6(m, rot, s);
      const face = dot(d, axial[k]) > Math.cos(35 * deg) ? pucker[k] : eq && dot(unit(eq.d), axial[k]) > 0.99 ? -pucker[k] : 0;
      if (!face) return;
      // Up (face 1) is towards the viewer of the ring seen from above. With the H wedged (towards the viewer of the
      // page) the centre's hand is the turn of its ring neighbours and the substituent on the page, negated.
      const a = pos(m, ring[(k + 5) % 6]), b = pos(m, ring[(k + 1) % 6]), area = cross(sub(b, a), sub(pos(m, s), a));
      if (Math.abs(area) < 0.05 * mean * mean) return;
      const dirs = [a, b, pos(m, s)].map((p) => Math.atan2(p[1] - here[1], p[0] - here[0])).sort((x, y) => x - y);
      const gaps = dirs.map((t, n) => (n + 1 < 3 ? dirs[n + 1] : dirs[0] + 2 * Math.PI) - t), g = gaps.indexOf(Math.max(...gaps)), mid = dirs[g] + gaps[g] / 2;
      out.push({ centre: c, at: add(here, mul([Math.cos(mid), Math.sin(mid)], 0.7 * mean)), stereo: Math.sign(area) === face * o ? 1 : 6 });
    });
  }
  // A carbon where two chairs join (decalin's, a steroid's) is read from each ring: it takes one H, and none when the
  // two rings read it differently.
  return out.filter((h, n) => out.every((x, k) => x.centre !== h.centre || (k >= n ? k === n || x.stereo === h.stereo : false)));
}

// Kept ChemDraw data on a caption (a live property) with its atoms renumbered by `to`; atoms `to` leaves out drop out,
// and the data goes when none are left.
export function remapKept<T extends Caption | Shape>(x: T, to: (i: number) => number | undefined): T {
  if (!("property" in x) || !x.property) return x;
  const atoms = x.property.atoms.flatMap((i) => { const j = to(i); return j === undefined ? [] : [j]; });
  const out = { ...x } as T & { property?: Kept };
  if (atoms.length) out.property = { ...x.property, atoms }; else delete out.property;
  return out;
}
// Removes atoms (and their bonds), then any bare carbons this edit leaves with no bonds, any multi-centre or variable
// attachment left with fewer than two of its atoms, and hidden H atoms (Toggle Hydrogen Display) whose atom went: they
// cannot be seen or picked alone. `before` is the bonds before the edit: an atom that had none (a label such as hν or
// RA1•+ from ChemDraw, a lone methane) is not this edit's, and stays.
function removeAtoms(m: Mol, gone: Set<number>, before = m.bonds): Mol {
  const had = new Set(before.flatMap((b) => b.atoms));
  let bonds = m.bonds;
  for (let size = -1; size !== gone.size;) {
    size = gone.size;
    bonds = m.bonds.filter((b) => !gone.has(b.atoms[0]) && !gone.has(b.atoms[1]));
    const used = new Set(bonds.flatMap((b) => b.atoms));
    m.atoms.forEach((a, i) => {
      if (a.centre ? a.centre.atoms.filter((j) => !gone.has(j)).length < 2 : !used.has(i) && had.has(i) && ((a.label === "C" && !a.charge && !a.text && !a.shown) || a.hidden)) gone.add(i);
    });
  }
  const map = new Map<number, number>();
  m.atoms.forEach((_, i) => { if (!gone.has(i)) map.set(i, map.size); });
  const atoms = m.atoms.filter((_, i) => !gone.has(i)).map((a) => renumberCentre(a, map));
  // Captions under a structure follow its atoms' new numbers, and go when all of its atoms go. Kept ChemDraw data (a
  // live property) follows its atoms too, and goes when they all go.
  const kept = <T extends Caption | Shape>(x: T): T => remapKept(x, (i) => map.get(i));
  const captions = m.captions?.flatMap((c) => {
    if (!c.under) return [kept(c)];
    const under = c.under.filter((i) => map.has(i)).map((i) => map.get(i)!);
    return under.length ? [kept({ ...c, under })] : [];
  });
  // A cycle keeps every node: one whose atoms all went is a break where it was.
  const cycles = m.cycles?.map((c) => ({ ...keepAngles(m, mapBranches(c, (i) => map.get(i))), nodes: c.nodes.map((n) => n.filter((i) => map.has(i)).map((i) => map.get(i)!)) }));
  const keptCycles = new Set(cycles?.map((c) => c.id));
  return tidyGroups({ ...m, atoms, bonds: bonds.map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] })), captions: captions?.filter((c) => !c.cycle || keptCycles.has(c.cycle.cycle)), cycles,
    shapes: m.shapes?.map(kept),
    groups: m.groups?.map((g) => ({ ...g, atoms: g.atoms.filter((i) => map.has(i)).map((i) => map.get(i)!) })), fills: refill(m.fills, map) });
}
// Ring fills follow their atoms' new numbers; a fill goes when one of its atoms goes.
const refill = (fills: Mol["fills"], map: Map<number, number>) => {
  const out = fills?.filter((f) => f.atoms.every((i) => map.has(i))).map((f) => ({ ...f, atoms: f.atoms.map((i) => map.get(i)!) }));
  return out?.length ? out : undefined;
};

// An atom with its multi-centre or variable attachment's atoms renumbered by map (those not in it left out), and its
// kept stereo configuration's neighbours (dropped when one is left out).
export function renumberCentre(a: Atom, map: Map<number, number> | ((i: number) => number | undefined)): Atom {
  if (!a.centre && !a.kept) return a;
  const to = typeof map === "function" ? map : (i: number) => map.get(i);
  const out = { ...a };
  if (a.centre) out.centre = { ...a.centre, atoms: a.centre.atoms.map(to).filter((i): i is number => i !== undefined) };
  if (a.kept) {
    const atoms = a.kept.atoms.map((i) => (i < 0 ? -1 : to(i)));
    if (atoms.every((i) => i !== undefined)) out.kept = { ...a.kept, atoms: atoms as number[] }; else delete out.kept;
  }
  return out;
}

// Groups nest, as ChemDraw's do. A group lists every atom and object in it (those of the groups in it too), so two
// groups are apart or one holds the other. Text that belongs to a structure, arrow or cycle (a compound number,
// conditions, a cycle's labels) is in the groups that hold what it belongs to, unless a ChemDraw file put it in
// another group.
type Grouped = NonNullable<Mol["groups"]>[number];
type Members = { atoms: Set<number>; items: Set<number> };
const membersOf = (g: { atoms: number[]; items: number[] }): Members => ({ atoms: new Set(g.atoms), items: new Set(g.items) });
const sizeOf = (g: Grouped) => g.atoms.length + g.items.length;
const inside = (g: { atoms: number[]; items: number[] }, s: Members) => g.atoms.every((i) => s.atoms.has(i)) && g.items.every((id) => s.items.has(id));
const meets = (g: { atoms: number[]; items: number[] }, s: Members) => g.atoms.some((i) => s.atoms.has(i)) || g.items.some((id) => s.items.has(id));
// Whether a caption belongs to a structure, arrow or cycle among these members.
const attached = (c: Caption, s: Members) => (c.under?.length ? c.under.every((i) => s.atoms.has(i)) : c.on ? s.items.has(c.on.arrow) : !!c.cycle && s.items.has(c.cycle.cycle));
// Groups by size, the largest first (of two the same size, the first first).
const bySize = (gs: Grouped[]) => gs.map((_, k) => k).sort((p, q) => sizeOf(gs[q]) - sizeOf(gs[p]) || p - q);
// One key for each atom (its index) and each object (-1 - its id).
const keysOf = (g: Grouped) => [...g.atoms, ...g.items.map((id) => -1 - id)];
// Each group's parent, by its place in the list: the smallest other group that holds it. Of two groups with the
// same members, the first holds the second. The largest groups come first, and each atom and object keeps the last
// group that had it, so the parent is the first group up from that of the first member that holds all of it. The
// time grows with the number of members, not with the number of groups squared.
export function groupParents(gs: Grouped[]): (number | undefined)[] {
  const sets = gs.map(membersOf), parents: (number | undefined)[] = gs.map(() => undefined), last = new Map<number, number>();
  for (const k of bySize(gs)) {
    const keys = keysOf(gs[k]);
    if (!keys.length) continue;
    let p = last.get(keys[0]);
    while (p !== undefined && !inside(gs[k], sets[p])) p = parents[p];
    parents[k] = p;
    for (const x of keys) last.set(x, k);
  }
  return parents;
}
// Groups that share something, neither holding the other, become one (Integral if either was). The largest groups
// come first, so a group that crosses larger ones joins them, and the groups inside those stay inside. Each atom and
// object keeps the smallest group so far that has it. The time grows with the number of members (a damaged or
// hostile file can have thousands of groups that cross). The joined groups are put right after (clean).
function uncross(gs: Grouped[], clean: (g: Grouped) => Grouped): Grouped[] {
  const out: (Grouped | undefined)[] = [...gs], up = new Map<number, number | undefined>(), into = new Map<number, number>(), last = new Map<number, number>(), joined = new Set<number>();
  const find = (k: number | undefined) => { while (k !== undefined && into.has(k)) k = into.get(k)!; return k; };
  for (const k of bySize(gs)) {
    const keys = keysOf(out[k]!), holders = [...new Set(keys.map((x) => find(last.get(x))))];
    let home = holders[0], at = k;
    if (holders.length > 1) {
      // The smallest group that holds all of it (or none), and the groups just below that which have part of it.
      // It joins them (the largest keeps its place), so the groups inside those stay groups inside.
      const line = new Map<number | undefined, number>();
      for (let x = home, n = 0; ; x = find(up.get(x!)), n++) { line.set(x, n); if (x === undefined) break; }
      let top = 0;
      for (const h of holders.slice(1)) { let x = h; while (!line.has(x)) x = find(up.get(x!)); top = Math.max(top, line.get(x)!); }
      home = [...line.keys()][top];
      const crossed = new Set<number>();
      for (const h of holders) { let x = h; if (x === home) continue; while (find(up.get(x!)) !== home) x = find(up.get(x!)); crossed.add(x!); }
      [at] = [...crossed].sort((p, q) => sizeOf(out[q]!) - sizeOf(out[p]!) || p - q);
      const g = out[at]!;
      for (const j of [...crossed, k]) if (j !== at) {
        const o = out[j]!;
        for (const i of o.atoms) g.atoms.push(i);
        for (const id of o.items) g.items.push(id);
        if (o.integral) g.integral = true;
        if (o.annotations) g.annotations = [...(g.annotations ?? []), ...o.annotations];
        into.set(j, at);
        out[j] = undefined;
      }
      joined.add(at);
    }
    up.set(at, home);
    for (const x of keys) if (find(last.get(x)) === home) last.set(x, at);
  }
  return out.flatMap((g, k) => (!g ? [] : joined.has(k) ? [clean(g)] : [g]));
}
// The groups in a list that no other group in it holds.
export const outerGroups = (gs: Grouped[]) => { const parents = groupParents(gs); return gs.filter((_, k) => parents[k] === undefined); };
// Groups after an edit or a read: each lists an atom or object once, only those that are there, and the text that
// belongs to its members unless another group has that text. Two groups that share something without one holding
// the other become one (Integral if either was). A group holds two or more things (structures, objects or groups);
// one with fewer goes, and gives its Integral to a group it held alone. A group of one text that belongs to something
// in another group stays: a ChemDraw file keeps conditions out of the arrow's group that way, and without it the
// text would join that group on the next edit or save. Returns the same drawing when nothing changes.
export function tidyGroups(m: Mol, frags = m.groups?.length ? fragments(m) : []): Mol {
  if (!m.groups?.length) return m;
  const ids = new Set([...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? [])].map((x) => x.id));
  // Text that belongs to a member and is in no group joins the group (as atoms drawn onto a grouped structure do).
  // Each such text is found by the first atom or object it belongs to.
  const listed = new Set(m.groups.flatMap((g) => g.items)), free = new Map<number, Caption[]>();
  for (const c of m.captions ?? []) {
    const key = listed.has(c.id) ? undefined : c.under?.length ? c.under[0] : c.on ? -1 - c.on.arrow : c.cycle ? -1 - c.cycle.cycle : undefined;
    const list = key === undefined ? undefined : free.get(key);
    if (list) list.push(c); else if (key !== undefined) free.set(key, [c]);
  }
  const clean = (g: Grouped): Grouped => {
    const atoms = [...new Set(g.atoms.filter((i) => Number.isInteger(i) && i >= 0 && i < m.atoms.length))].sort((p, q) => p - q), items = g.items.filter((id) => ids.has(id));
    const s = { atoms: new Set(atoms), items: new Set(items) }, text = [...atoms, ...items.map((id) => -1 - id)].flatMap((x) => free.get(x) ?? []).filter((c) => attached(c, s));
    return { ...g, atoms, items: [...new Set([...items, ...text.map((c) => c.id)])] };
  };
  const gs = uncross(m.groups.map(clean), clean);
  const of = new Map<number, number>();
  frags.forEach((f, k) => f.forEach((i) => of.set(i, k)));
  const parents = groupParents(gs), kids = gs.map((): number[] => []);
  parents.forEach((p, j) => { if (p !== undefined) kids[p].push(j); });
  const things = (k: number) => {
    const held = membersOf({ atoms: kids[k].flatMap((j) => gs[j].atoms), items: kids[k].flatMap((j) => gs[j].items) });
    return kids[k].length + new Set(gs[k].atoms.filter((i) => !held.atoms.has(i)).map((i) => of.get(i) ?? -1 - i)).size + gs[k].items.filter((id) => !held.items.has(id)).length;
  };
  const captions = new Map((m.captions ?? []).map((c) => [c.id, c])), inGroups = membersOf({ atoms: gs.flatMap((g) => g.atoms), items: gs.flatMap((g) => g.items) });
  const ownText = (g: Grouped) => { const c = !g.atoms.length && g.items.length === 1 ? captions.get(g.items[0]) : undefined; return !!c && (c.under?.length ? inGroups.atoms.has(c.under[0]) : c.on ? inGroups.items.has(c.on.arrow) : !!c.cycle && inGroups.items.has(c.cycle.cycle)); };
  const integral = gs.map((g) => !!g.integral), gone = new Set<number>();
  for (const k of gs.map((_, k) => k).sort((p, q) => sizeOf(gs[q]) - sizeOf(gs[p]) || p - q)) {
    const n = things(k);
    if (n >= 2 || (!kids[k].length && ownText(gs[k]))) continue;
    gone.add(k);
    if (integral[k] && n === 1 && kids[k].length === 1) integral[kids[k][0]] = true;
  }
  const out = gs.flatMap((g, k) => (gone.has(k) ? [] : [{ id: g.id, atoms: g.atoms, items: g.items, ...(integral[k] ? { integral: true as const } : {}), ...(g.annotations ? { annotations: g.annotations } : {}), ...(g.plot ? { plot: g.plot } : {}) }]));
  const same = out.length === m.groups.length && out.every((g, k) => {
    const o = m.groups![k];
    return g.id === o.id && !!g.integral === !!o.integral && g.atoms.length === o.atoms.length && g.atoms.every((i, n) => i === o.atoms[n]) && g.items.length === o.items.length && g.items.every((id, n) => id === o.items[n]);
  });
  return same ? m : { ...m, groups: out };
}
// Groups: every group a selection touches (by its atoms or its other objects).
export const groupsOf = (m: Mol, atoms: Set<number>, items: Set<number>) =>
  (m.groups ?? []).filter((g) => g.atoms.some((i) => atoms.has(i)) || g.items.some((id) => items.has(id)));
// The outermost of the groups a selection touches: for one atom or object, the group a double-click picks (as in
// ChemDraw).
export const outermost = (gs: Grouped[]) => outerGroups(gs)[0];
// The groups a selection holds whole, without those inside them: each reads as one thing. Text that belongs to a
// selected structure, arrow or cycle counts as selected.
export function selectedGroups(m: Mol, atoms: Set<number>, items: Set<number>): Grouped[] {
  const captions = new Map((m.captions ?? []).map((c) => [c.id, c])), sel = { atoms, items };
  return outerGroups((m.groups ?? []).filter((g) => g.atoms.every((i) => atoms.has(i)) && g.items.every((id) => items.has(id) || (captions.has(id) && attached(captions.get(id)!, sel)))));
}
// The groups Ungroup and Pick as One work on: those the selection holds whole, or else the outermost group of what it
// touches.
export function groupTargets(m: Mol, atoms: Set<number>, items: Set<number>): Grouped[] {
  const whole = selectedGroups(m, atoms, items);
  return whole.length ? whole : outerGroups(groupsOf(m, atoms, items));
}
// An integral group cannot be split (as in ChemDraw): a selection that touches one takes in all of it. Groups nest, so
// this takes in the outermost integral group.
export function wholeIntegral(m: Mol, atoms: Set<number>, items: Set<number>): [Set<number>, Set<number>] {
  const gs = groupsOf(m, atoms, items).filter((g) => g.integral);
  return gs.length ? [new Set([...atoms, ...gs.flatMap((g) => g.atoms)]), new Set([...items, ...gs.flatMap((g) => g.items)])] : [atoms, items];
}
// A group holds whole structures (as in ChemDraw): it takes in every atom of each structure it has an atom of, so
// atoms added to a grouped structure join its group. Groups that come to share a structure without one holding the
// other become one group (tidyGroups). Returns the same drawing when nothing changes.
export function wholeGroups(m: Mol): Mol {
  if (!m.groups?.length) return m;
  const frags = fragments(m), of = new Map<number, number>();
  frags.forEach((f, k) => f.forEach((i) => of.set(i, k)));
  let changed = false;
  const groups = m.groups.map((g) => {
    const atoms = [...new Set(g.atoms.filter((i) => of.has(i)).map((i) => of.get(i)!))].flatMap((k) => frags[k]).sort((p, q) => p - q);
    if (atoms.length === g.atoms.length && atoms.every((i, n) => i === g.atoms[n])) return g;
    changed = true;
    return { ...g, atoms };
  });
  return tidyGroups(changed ? { ...m, groups } : m, frags);
}
// Object > Group: the selected things as one new group. A thing is a structure (whole), an object, or a group the
// selection reaches into (whole), so Group adds one level. The new group goes in the smallest group that holds the
// selection and more (a group in a group), or at the top. Undefined for fewer than two things.
export function groupSelection(m: Mol, atoms: Set<number>, items: Set<number>): [Mol, number] | undefined {
  const frags = fragments(m), of = new Map<number, number>();
  frags.forEach((f, k) => f.forEach((i) => of.set(i, k)));
  const ids = new Set([...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.captions ?? [])].map((x) => x.id));
  const sel = { atoms: new Set([...atoms].filter((i) => of.has(i)).flatMap((i) => frags[of.get(i)!])), items: new Set([...items].filter((id) => ids.has(id))) };
  // Text that belongs to a selected structure, arrow or cycle goes with it (as in selectedGroups), but is not a thing
  // of its own: a group that differs from the selection only by such text is the selection.
  const withText = { atoms: sel.atoms, items: new Set([...sel.items, ...(m.captions ?? []).filter((c) => attached(c, sel)).map((c) => c.id)]) };
  const gs = m.groups ?? [], parents = groupParents(gs), all = { atoms: [...sel.atoms], items: [...sel.items] };
  let home: number | undefined;
  gs.forEach((g, k) => { if (inside(all, membersOf(g)) && !inside(g, withText) && (home === undefined || sizeOf(g) < sizeOf(gs[home]))) home = k; });
  // The things at that level: its groups the selection reaches into, and the selected structures and objects in none.
  const reached = gs.filter((g, k) => parents[k] === home && meets(g, sel)), held = membersOf({ atoms: reached.flatMap((g) => g.atoms), items: reached.flatMap((g) => g.items) });
  const loose = { atoms: all.atoms.filter((i) => !held.atoms.has(i)), items: all.items.filter((id) => !held.items.has(id)) };
  if (reached.length + new Set(loose.atoms.map((i) => of.get(i))).size + loose.items.length < 2) return undefined;
  // That text, where the group round the new one has it, goes in the new one too.
  const text = home === undefined ? [] : gs[home].items.filter((id) => withText.items.has(id) && !sel.items.has(id) && !held.items.has(id));
  const group = { atoms: [...new Set([...held.atoms, ...loose.atoms])].sort((p, q) => p - q), items: [...new Set([...held.items, ...loose.items, ...text])] };
  if (home !== undefined && group.atoms.length + group.items.length === sizeOf(gs[home])) return undefined; // the same as the group it would go in
  const id = nextId(m);
  return [tidyGroups({ ...m, groups: [...gs, { id, ...group }] }, frags), id];
}
// Object > Ungroup: one level of grouping goes (groupTargets). The members stay, and so do the groups inside.
export const ungroupSelection = (m: Mol, atoms: Set<number>, items: Set<number>): Mol => {
  const old = new Set(groupTargets(m, atoms, items));
  return { ...m, groups: (m.groups ?? []).filter((g) => !old.has(g)) };
}
// Bring to Front and Send to Back for bonds (ChemDraw's; its f key brings the bond under the pointer to the front): the
// bonds between the given atoms go to the end (or the start) of the list. Where two bonds cross, the one later in the
// list is in front and the other has a gap. The drawing as it was when no bond is among the atoms.
export function toFront(m: Mol, atoms: Set<number>, back = false): Mol {
  const mine = (b: Bond) => atoms.has(b.atoms[0]) && atoms.has(b.atoms[1]), a = m.bonds.filter(mine);
  if (!a.length) return m;
  const rest = m.bonds.filter((b) => !mine(b));
  return { ...m, bonds: back ? [...a, ...rest] : [...rest, ...a] };
}
export const deleteAtom = (m: Mol, i: number) => removeAtoms(m, new Set([i]));
export const deleteBond = (m: Mol, i: number) => removeAtoms({ ...m, bonds: m.bonds.filter((_, k) => k !== i) }, new Set(), m.bonds);

// A ring of n atoms. On a bond: fused on the side with fewer neighbours, its bonds as long as that bond. On an atom:
// sharing that atom, pointing the way a new bond would go (in line with the bond to a chain end, so the bonds there
// meet at 120°), at the atom's scale, with all its other atoms new. On empty canvas: centred on the point, with a
// vertex at the top. New atoms take the scale of the atoms the ring is drawn on.
// along: the ring's first bond, from a point (or from target.atom, which the ring then shares) to another, as a ring
// dragged with ChemDraw's ring tools: the ring lies on the bond's left (above a bond drawn to the right), its bonds as
// long as that one, and it takes atoms already where its atoms go.
// Benzene (aromatic) gets alternating double bonds that avoid atoms that already have one, the first bond double.
// Options, as ChemDraw's ring tools: sprout, on an atom, puts the ring on a new bond from it (Option-click);
// firstSingle makes the first bond single (Shift); circle draws the ring delocalised, with a circle (Command).
export type RingOptions = { sprout?: boolean; firstSingle?: boolean; circle?: boolean };
export function addRing(m: Mol, n: number, aromatic: boolean, target: { bond?: number; atom?: number; point?: P; along?: [P, P]; toward?: P }, o: RingOptions = {}): Mol {
  if (o.sprout && target.atom !== undefined && !target.along) {
    let end: number;
    [m, end] = atomOrNew(m, add(pos(m, target.atom), mul(nextDirection(m, target.atom), scaleAt(m, target.atom))), scaleAt(m, target.atom));
    return addRing(withBond(m, target.atom, end), n, aromatic, { atom: end }, { ...o, sprout: false });
  }
  const r = 1 / (2 * Math.sin(Math.PI / n)), on = target.atom, along = target.along;
  let centre: P, start: P, scale = on !== undefined ? scaleAt(m, on) : 1;
  if (along) {
    const d = sub(along[1], along[0]), l = len(d) || 1;
    start = on !== undefined ? pos(m, on) : along[0];
    centre = add(mul(add(start, along[1]), 0.5), mul([-d[1] / l, d[0] / l], l / (2 * Math.tan(Math.PI / n))));
  } else if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j), mid = mul(add(a, b), 0.5), side = len(sub(b, a)) || 1;
    const normal: P = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((k) => k !== i && k !== j);
    const pull = others.reduce((s, k) => s + Math.sign((pos(m, k)[0] - mid[0]) * normal[0] + (pos(m, k)[1] - mid[1]) * normal[1]), 0);
    // The side away from the bond's other neighbours, or the side a drag from the bond went to unless a ring there
    // would sit on the drawing.
    const at = (sgn: number) => add(mid, mul(normal, (sgn * side) / (2 * Math.tan(Math.PI / n))));
    const open = (c: P) => m.atoms.every((_, k) => k === i || k === j || len(sub(pos(m, k), c)) > 1.05 * r * side);
    const drag = target.toward && (Math.sign(dot(sub(target.toward, mid), normal)) || 1);
    centre = at(drag && open(at(drag)) ? drag : pull > 0 ? -1 : 1);
    start = a;
    scale = (scaleAt(m, i) + scaleAt(m, j)) / 2;
  } else if (on !== undefined) {
    start = pos(m, on);
    const ns = neighbours(m, on);
    centre = add(start, mul(ns.length === 1 ? unit(sub(start, pos(m, ns[0]))) : nextDirection(m, on), r * scale));
  } else {
    centre = target.point!;
    start = add(centre, [0, r]);
  }
  // Walk the ring from start around the centre, adding atoms where none exist (a ring on an atom never takes
  // another atom that is in the way).
  const ids: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = add(centre, rot(sub(start, centre), (2 * Math.PI * k) / n));
    let id: number;
    [m, id] = on !== undefined && !k ? [m, on] : on === undefined || along ? atomOrNew(m, p, scale) : withAtom(m, p, "C", scale);
    ids.push(id);
  }
  const hasDouble = (i: number) => m.bonds.some((b) => b.type === 2 && b.atoms.includes(i));
  for (let k = 0; k < n; k++) {
    const i = ids[k], j = ids[(k + 1) % n];
    if (bondIndex(m, i, j) >= 0) continue;
    m = withBond(m, i, j, { type: aromatic && !hasDouble(i) && !hasDouble(j) && !(o.firstSingle && !k) ? 2 : 1 });
  }
  return o.circle ? { ...m, atoms: m.atoms.map((a, i) => (ids.includes(i) ? { ...a, circle: true } : a)) } : m;
}

// Adds a fragment (from a paste) shifted by offset.
export function merge(m: Mol, frag: Mol, offset: P): Mol {
  const base = m.atoms.length;
  return {
    ...m,
    atoms: [...m.atoms, ...frag.atoms.map((a) => renumberCentre({ ...a, location: [a.location[0] + offset[0], a.location[1] + offset[1], a.location[2] ?? 0] as [number, number, number] }, (i) => i + base))],
    bonds: [...m.bonds, ...frag.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] }))],
    ...(frag.fills?.length ? { fills: [...(m.fills ?? []), ...frag.fills.map((f) => ({ ...f, atoms: f.atoms.map((i) => i + base) }))] } : {}),
  };
}

export function bounds(m: Mol): [number, number, number, number] | undefined {
  if (!m.atoms.length) return undefined;
  const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// The box round everything in a drawing: atoms, arrows and shapes by their ends, captions by where they start.
export function extent(m: Mol): [number, number, number, number] | undefined {
  const qs: P[] = [...m.atoms.map((a): P => [a.location[0], a.location[1]]), ...[...(m.arrows ?? []), ...(m.shapes ?? [])].flatMap((x) => [x.from, x.to]), ...(m.captions ?? []).map((c): P => [c.x, c.y])];
  if (!qs.length) return undefined;
  return [Math.min(...qs.map((q) => q[0])), Math.min(...qs.map((q) => q[1])), Math.max(...qs.map((q) => q[0])), Math.max(...qs.map((q) => q[1]))];
}

// Several drawings as one (files dropped together), each under the one before with a gap of two bond lengths,
// lined up on the left.
export function stack(list: Mol[]): Mol {
  let out: Mol = EMPTY;
  for (const add of list) {
    const b = extent(add), o = extent(out);
    if (!b) continue;
    out = insertMol(out, add, o ? [o[0] - b[0], o[1] - 2 - b[3]] : [0, 0]).mol;
  }
  return out;
}

// Selection helpers. A selection is a set of atom indices; a bond is selected when both its atoms are.
export const deleteAtoms = (m: Mol, ids: Set<number>) => removeAtoms(m, new Set(ids));
// Expand Label: the labelled atom i becomes the group its label names. frag is that group laid out (bond length 1),
// its first atom the attachment point: it is turned to point away from i's neighbour and joined where the label was.
// way: the direction from the group's first atom to the rest of the structure, when the group says it (an R-group
// fragment's attachment mark).
// A residue label (sequence.ts) draws out its kept atoms as they were, moved onto the label, and each bond goes to the
// atom it joins (its port): a residue's N on one side, its C=O on the other.
export function expandLabel(m: Mol, i: number, frag: Mol, way?: P): Mol {
  if (!frag.atoms.length) return m;
  const ported = m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === i && b.ports![e] >= 0));
  const at0 = frag.atoms[0].location, here = m.atoms[i].location;
  const rest = frag.atoms.slice(1), place = ported ? (q: [number, number, number]): [number, number, number] => [q[0] - at0[0] + here[0], q[1] - at0[1] + here[1], 0] : labelPlacer(m, i, frag, way);
  const base = m.atoms.length, to = (k: number) => (k === 0 ? i : base + k - 1);
  const atoms = m.atoms.map((a, k) => (k === i ? { ...a, label: frag.atoms[0].label, text: undefined, charge: frag.atoms[0].charge, inner: undefined } : a));
  for (const a of rest) atoms.push({ ...a, location: place(a.location) });
  const bonds = !ported ? m.bonds : m.bonds.map((b) => {
    if (!b.ports || !b.atoms.includes(i)) return b;
    const e = b.atoms[0] === i ? 0 : 1, p = b.ports[e] >= 0 && b.ports[e] < frag.atoms.length ? b.ports[e] : 0;
    const ends = [...b.atoms] as [number, number], ports = [...b.ports] as [number, number];
    ends[e] = to(p);
    ports[e] = -1;
    const { ports: _, ...plain } = b;
    return { ...plain, atoms: ends, ...(ports[1 - e] >= 0 ? { ports } : {}) };
  });
  return { ...m, atoms, bonds: [...bonds, ...frag.bonds.map((b) => ({ ...b, atoms: [to(b.atoms[0]), to(b.atoms[1])] as [number, number] }))] };
}
// Where a label's group goes when it is drawn out: its first atom on the label atom i, the rest turned to point away
// from i's neighbour, along the bisector of the first atom's own bonds (C(=O)OEt: between =O and OEt).
export function labelPlacer(m: Mol, i: number, frag: Mol, way?: P): (q: [number, number, number]) => [number, number, number] {
  const at = pos(m, i), nb = neighbours(m, i)[0], a0 = frag.atoms[0].location;
  const want = nb === undefined ? 0 : Math.atan2(at[1] - pos(m, nb)[1], at[0] - pos(m, nb)[0]);
  const near = frag.bonds.filter((b) => b.atoms.includes(0)).map((b) => frag.atoms[b.atoms[0] === 0 ? b.atoms[1] : b.atoms[0]].location);
  const mid = near.length ? [near.reduce((s, q) => s + q[0], 0) / near.length, near.reduce((s, q) => s + q[1], 0) / near.length] : [a0[0] + 1, a0[1]];
  const turn = want - (way ? Math.atan2(-way[1], -way[0]) : Math.atan2(mid[1] - a0[1], mid[0] - a0[0])), c = Math.cos(turn), s = Math.sin(turn);
  return (q) => { const dx = q[0] - a0[0], dy = q[1] - a0[1]; return [at[0] + dx * c - dy * s, at[1] + dx * s + dy * c, 0]; };
}
// Contract Label: the atoms in `group` other than `keep` go, and `keep` (the one bonded to the rest) carries the label.
// The group stays with the label (inner), so Expand Label gives it back whatever the label says. A group bonded to the
// rest more than once (a residue in a chain: its N on one side, its C=O on the other) keeps each bond, moved onto the
// label with the kept atom it joins (its port), as a residue label is drawn (sequence.ts).
export function contractLabel(m: Mol, keep: number, group: Set<number>, text: string): Mol {
  const order = [keep, ...[...group].filter((k) => k !== keep)], at = new Map(order.map((k, n) => [k, n]));
  const inner: Mol = {
    atoms: order.map((k) => { const { inner: _, text: __, ...a } = m.atoms[k]; return a; }),
    bonds: m.bonds.filter((b) => at.has(b.atoms[0]) && at.has(b.atoms[1])).map((b) => ({ ...b, atoms: [at.get(b.atoms[0])!, at.get(b.atoms[1])!] as [number, number] })),
  };
  const out = (b: Mol["bonds"][number]) => group.has(b.atoms[0]) !== group.has(b.atoms[1]), many = m.bonds.filter(out).length > 1;
  const bonds = !many ? m.bonds : m.bonds.map((b) => {
    if (!out(b)) return b;
    const e = group.has(b.atoms[0]) ? 0 : 1, ends = [...b.atoms] as [number, number], ports = (b.ports ? [...b.ports] : [-1, -1]) as [number, number];
    ports[e] = at.get(b.atoms[e])!;
    ends[e] = keep;
    return { ...b, atoms: ends, ports };
  });
  // Bonded on more than one side, the label is centred, so it reads as written whichever side its bonds are on.
  const labelled = { ...m, bonds, atoms: m.atoms.map((a, k) => (k === keep ? { ...a, text, label: many ? a.label : anchorElement(text) ?? a.label, charge: undefined, inner, ...(many ? { align: "centre" as const } : {}) } : a)) };
  return removeAtoms(labelled, new Set([...group].filter((k) => k !== keep)));
}
export function moveAtoms(m: Mol, ids: Set<number>, d: P): Mol {
  return { ...m, atoms: m.atoms.map((a, i) => (ids.has(i) ? { ...a, location: [a.location[0] + d[0], a.location[1] + d[1], a.location[2] ?? 0] } : a)) };
}
export function atomsIn(m: Mol, a: P, b: P): number[] {
  const [x0, x1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])], [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  return m.atoms.flatMap((_, i) => { const [x, y] = pos(m, i); return x >= x0 && x <= x1 && y >= y0 && y <= y1 ? [i] : []; });
}
// Some atoms (in drawing order) and the bonds between them, as their own drawing; unlike subset, a carbon cut from its
// bonds stays.
export function pickAtoms(m: Mol, ids: number[]): Mol {
  const sorted = [...ids].sort((p, q) => p - q), at = new Map(sorted.map((i, k) => [i, k]));
  return { atoms: sorted.map((i) => renumberCentre({ ...m.atoms[i] }, at)), bonds: m.bonds.filter((b) => at.has(b.atoms[0]) && at.has(b.atoms[1])).map((b) => ({ ...b, atoms: [at.get(b.atoms[0])!, at.get(b.atoms[1])!] as [number, number] })) };
}
// The selected atoms and the bonds between them, as their own drawing (for Copy).
export function subset(m: Mol, ids: Set<number>): Mol {
  const keep = new Set([...ids].filter((i) => i < m.atoms.length));
  return removeAtoms({ ...m }, new Set(m.atoms.map((_, i) => i).filter((i) => !keep.has(i))));
}

// Removes the given bonds and atoms at once (one eraser stroke), then any bare carbons left with no bonds.
export function erase(m: Mol, bonds: Set<number>, atoms: Set<number>): Mol {
  return removeAtoms({ ...m, bonds: m.bonds.filter((_, i) => !bonds.has(i)) }, new Set(atoms), m.bonds);
}

// Atoms a selection box missed but that obviously belong: every neighbour is selected (a terminal O, an H,
// an atom bridging two selected ones).
export function complete(m: Mol, ids: Set<number>): Set<number> {
  const out = new Set(ids), near = m.atoms.length > LARGE ? bondedTo(m) : undefined;
  m.atoms.forEach((_, i) => {
    const ns = near ? near[i] : neighbours(m, i);
    if (!out.has(i) && ns.length && ns.every((j) => ids.has(j))) out.add(i);
  });
  return out;
}

// Convex hull (monotone chain), counter-clockwise.
function hull(ps: P[]): P[] {
  const s = [...ps].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (s.length < 3) return s;
  const half = (pts: P[]) => {
    const out: P[] = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(sub(out[out.length - 1], out[out.length - 2]), sub(p, out[out.length - 2])) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(s), ...half([...s].reverse())];
}
const segDist = (p: P, a: P, b: P) => {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  return len(sub(p, add(a, mul(ab, t))));
};

// The hull of each selection, kept with the selection's set for its drawing (a new selection is a new set): the
// pointer tests the selection on every move.
const hulls = new WeakMap<Set<number>, [Mol, P[]]>();
// Is p on the selection: inside the outline around its atoms, or within r of it (bond lengths)?
export function onSelection(m: Mol, ids: Set<number>, p: P, r = 0.45): boolean {
  let kept = hulls.get(ids);
  if (kept?.[0] !== m) {
    const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
    kept = [m, ps.length ? hull(ps) : []];
    hulls.set(ids, kept);
  }
  const h = kept[1];
  if (!h.length) return false;
  if (h.length >= 3 && h.every((a, k) => cross(sub(h[(k + 1) % h.length], a), sub(p, a)) >= 0)) return true;
  if (h.length === 1) return len(sub(p, h[0])) <= r;
  return h.some((a, k) => segDist(p, a, h[(k + 1) % h.length]) <= r);
}

// Groups of connected atoms. A multi-centre or variable attachment joins its atoms' structure (ferrocene is one
// structure), unless attached is false.
export function fragments(m: Mol, attached = true): number[][] {
  const near = bondedTo(m), seen = new Set<number>(), out: number[][] = [];
  if (attached) m.atoms.forEach((a, i) => { for (const j of a.centre?.atoms ?? []) if (near[j]) { near[i].push(j); near[j].push(i); } });
  m.atoms.forEach((_, start) => {
    if (seen.has(start)) return;
    const group: number[] = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const i = stack.pop()!;
      group.push(i);
      for (const j of near[i]) if (!seen.has(j)) { seen.add(j); stack.push(j); }
    }
    out.push(group);
  });
  return out;
}

// After a move: each moved atom that sits exactly on another atom joins it, so no atom hides under another.
// The other atom keeps its label unless it is a plain carbon (then it takes the moved atom's label). Returns the
// drawing and whether anything joined.
export function joinOverlaps(m: Mol, moved: Set<number>): { mol: Mol; joined: boolean } {
  const into = new Map<number, number>();
  for (const i of moved) {
    if (i >= m.atoms.length) continue;
    const j = m.atoms.findIndex((_, k) => !moved.has(k) && len(sub(pos(m, k), pos(m, i))) < 1e-6);
    if (j >= 0) into.set(i, j);
  }
  if (!into.size) return { mol: m, joined: false };
  let atoms = m.atoms;
  for (const [i, j] of into) if (atoms[j].label === "C" && !atoms[j].text && (atoms[i].label !== "C" || atoms[i].text)) atoms = atoms.map((a, k) => (k === j ? { ...a, label: atoms[i].label, text: atoms[i].text } : a));
  const bonds: Bond[] = [];
  for (const b of m.bonds) {
    const ends = b.atoms.map((k) => into.get(k) ?? k) as [number, number];
    if (ends[0] === ends[1] || bonds.some((c) => (c.atoms[0] === ends[0] && c.atoms[1] === ends[1]) || (c.atoms[0] === ends[1] && c.atoms[1] === ends[0]))) continue;
    bonds.push({ ...b, atoms: ends });
  }
  // A ring fill goes on with its ring: a joined atom's place in it is taken by the atom it joined. One ring filled
  // twice keeps the first fill.
  const seen = new Set<string>(), fills = m.fills?.map((f) => ({ ...f, atoms: f.atoms.map((k) => into.get(k) ?? k) })).filter((f) => {
    const key = [...f.atoms].sort((p, q) => p - q).join(",");
    if (new Set(f.atoms).size !== f.atoms.length || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { mol: removeAtoms({ ...m, atoms, bonds, ...(m.fills ? { fills } : {}) }, new Set(into.keys())), joined: true };
}

// Object > Join (⌘J), as ChemDraw's. One atom in each of two structures:
// the earlier-drawn atom's structure moves onto the other atom, and the two become one. One atom in each of three or
// more structures: each structure moves so its atom is at their centroid, and they become one (the first selected
// atom's, with its label and colour).
// One bond in each of two structures: the earlier-drawn bond's structure turns and moves so the bond lies on the
// other, on its far side, and the two bonds become one shared bond. The atom that stays keeps its label,
// or takes the other's if it has none. Returns undefined when the selection is none of these.
export function joinSelection(m: Mol, ids: Set<number>): Mol | undefined {
  const frags = fragments(m), fragOf: number[] = [];
  frags.forEach((g, k) => g.forEach((i) => (fragOf[i] = k)));
  const picks = [...ids].filter((i) => i < m.atoms.length), sel = [...picks].sort((p, q) => p - q), touched = [...new Set(sel.map((i) => fragOf[i]))];
  if (sel.length < 2 || touched.length < 2) return undefined;
  const moveFrag = (mol: Mol, k: number, f: (q: P) => P): Mol => ({ ...mol, atoms: mol.atoms.map((a, i) => (fragOf[i] === k ? { ...a, location: [...f([a.location[0], a.location[1]]), a.location[2] ?? 0] as [number, number, number] } : a)) });
  const atomsOf = (ks: number[]) => new Set(m.atoms.map((_, i) => i).filter((i) => ks.includes(fragOf[i])));
  // Two bonds: two atoms selected in each of two structures, joined by a bond.
  const bondIn = (k: number) => { const mine = sel.filter((i) => fragOf[i] === k); return mine.length === 2 && m.bonds.some((b) => b.atoms.includes(mine[0]) && b.atoms.includes(mine[1])) ? mine : undefined; };
  if (sel.length === 4 && touched.length === 2 && bondIn(touched[0]) && bondIn(touched[1])) {
    const [back, front] = [bondIn(touched[0])!, bondIn(touched[1])!].sort((p, q) => Math.max(...p) - Math.max(...q));
    const [a0, a1] = front.map((i) => pos(m, i)), ma: P = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
    // The back bond laid on the front one with its ends either way round. ChemDraw puts each end on the nearer end;
    // Octet takes the way that puts the two structures on opposite sides of the bond, so rings fuse wherever they are.
    const middle = (k: number, mol: Mol) => { const g = frags[k]; return [g.reduce((t, i) => t + pos(mol, i)[0], 0) / g.length, g.reduce((t, i) => t + pos(mol, i)[1], 0) / g.length] as P; };
    const lay = (ends: number[]) => {
      const [b0, b1] = ends.map((i) => pos(m, i)), mb: P = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
      const turn = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]) - Math.atan2(b1[1] - b0[1], b1[0] - b0[0]), [c, s] = [Math.cos(turn), Math.sin(turn)];
      const out = moveFrag(m, fragOf[back[0]], (q) => { const d = sub(q, mb); return [ma[0] + d[0] * c - d[1] * s, ma[1] + d[0] * s + d[1] * c]; });
      // The two ends sit exactly on the other bond's, however long the bonds are.
      return { ...out, atoms: out.atoms.map((a, i) => (i === ends[0] ? { ...a, location: [a0[0], a0[1], a.location[2] ?? 0] } : i === ends[1] ? { ...a, location: [a1[0], a1[1], a.location[2] ?? 0] } : a)) } as Mol;
    };
    const [one, two] = [lay(back), lay([back[1], back[0]])], apart = (mol: Mol) => len(sub(middle(fragOf[back[0]], mol), middle(fragOf[front[0]], mol)));
    return joinOverlaps(apart(one) >= apart(two) ? one : two, atomsOf([fragOf[back[0]]])).mol;
  }
  // Atoms: one in each structure.
  if (touched.length !== sel.length) return undefined;
  if (sel.length === 2) {
    const [back, front] = sel, d = sub(pos(m, front), pos(m, back));
    return joinOverlaps(moveFrag(m, fragOf[back], (q) => add(q, d)), atomsOf([fragOf[back]])).mol;
  }
  const centre: P = [sel.reduce((t, i) => t + pos(m, i)[0], 0) / sel.length, sel.reduce((t, i) => t + pos(m, i)[1], 0) / sel.length];
  let out = m;
  for (const i of sel) { const d = sub(centre, pos(m, i)); out = moveFrag(out, fragOf[i], (q) => add(q, d)); }
  out = { ...out, atoms: out.atoms.map((a, i) => (sel.includes(i) ? { ...a, location: [centre[0], centre[1], a.location[2] ?? 0] } : a)) };
  // The selection keeps the order the atoms were picked in: the first one stays.
  return joinOverlaps(out, atomsOf(picks.slice(1).map((i) => fragOf[i]))).mol;
}

// ChemDraw-style group keys on an atom. Each adds a group and keeps the bond rules above.
export type Group = "chain" | "other" | "acetyl" | "phenyl" | "cyclopropyl" | "cyclobutyl" | "cyclopentyl" | "cyclohexyl"
  | "wedgeMe" | "hashMe" | "methylidene" | "dimethyl" | "alkyne" | "sulfonyl" | "tBu" | "cpLigand" | "phenylLigand";
const RING_GROUPS: Partial<Record<Group, [number, boolean]>> = {
  phenyl: [6, true], cyclopropyl: [3, false], cyclobutyl: [4, false], cyclopentyl: [5, false], cyclohexyl: [6, false],
};
export const addGroup = (m: Mol, i: number, g: Group): Mol => addGroupAt(m, i, g)[0];
// The same, with the atom the keyboard hotspot moves on to, so the next key carries on from there. As ChemDraw 26.1
// builds each group: on a chain end the end atom becomes part of the group (the C of C=O, a ring atom, the S of
// SO2Me); a carbon that is branched (three bonds) or unsaturated (a double, triple or aromatic bond) first gets a
// new C–C bond and the group goes on the new carbon, so no key gives a carbon five bonds. S, Se, P and As can take
// more bonds and keep the group on themselves. Bonds are at the atom's scale.
export function addGroupAt(m: Mol, i: number, g: Group): [Mol, number] {
  const degree = (k: number) => neighbours(m, k).length;
  const orders = (k: number) => m.bonds.filter((b) => b.atoms.includes(k)).map((b) => b.type);
  const multiple = (k: number) => orders(k).some((t) => t !== 1);
  const special = (k: number) => !m.atoms[k].text && ["S", "Se", "P", "As"].includes(m.atoms[k].label);
  // A bond from k (the next way by default, length bond lengths at k's scale), to a new atom or one already there.
  // Returns that atom.
  const drop = (k: number, spec: BondSpec = SINGLE, d: P = nextDirection(m, k), length = 1): number => {
    const s = scaleAt(m, k), q = add(pos(m, k), mul(d, length * s));
    m = bondTo(m, k, q, spec);
    return atomAt(m, q, 0.1 * Math.min(1, s))!;
  };
  const done = (j: number): [Mol, number] => [m, j]; // reads m after drop has changed it
  // Of two new atoms on k, the one more straight above or below it first.
  const upright = (k: number, a: number, b: number) => (Math.abs(pos(m, k)[0] - pos(m, a)[0]) <= Math.abs(pos(m, k)[0] - pos(m, b)[0]) ? [a, b] : [b, a]);
  const branched = (k: number) => !special(k) && (degree(k) >= 3 || multiple(k));
  const ring = RING_GROUPS[g];
  if (ring) {
    const [n, aromatic] = ring, d = degree(i);
    // On a CH2 in a chain or ring a saturated ring is spiro; a phenyl, or a ring on a branched or unsaturated
    // carbon or an alkyne end, goes on a new C–C bond.
    if (d >= 3 || (d === 2 && (aromatic || multiple(i))) || (d < 2 && orders(i).includes(3))) i = drop(i);
    const before = m.atoms.length, at = pos(m, i);
    m = addRing(m, n, aromatic, { atom: i });
    // The hotspot moves to the ring atom farthest from the join; of two, the higher, then the one on the right.
    let hot = i, far = -1;
    for (let k = before; k < m.atoms.length; k++) {
      const p = pos(m, k), h = pos(m, hot), dist = Math.trunc(len(sub(p, at)) * 100);
      if (dist > far || (dist === far && (p[1] > h[1] + 1e-6 || (p[1] > h[1] - 1e-6 && p[0] > h[0])))) [far, hot] = [dist, k];
    }
    return [m, hot];
  }
  // Methyls: a wedged (0) or hashed (1) one, two (2), or a hashed and a wedged one (3).
  const methyls = (kind: 0 | 1 | 2 | 3): [Mol, number] => {
    const one = orders(i);
    if (!(((kind < 2 || one.length <= 2) && (special(i) || !multiple(i))) || (one.length === 1 && one[0] === 2))) i = drop(i);
    const spec: BondSpec = kind === 0 ? { type: 1, stereo: 1 } : kind === 1 ? { type: 1, stereo: 6 } : SINGLE, ns = neighbours(m, i), here = pos(m, i);
    if (ns.length === 3) {
      // On a branched atom: opposite the bond that is nearest to straight up, down, left or right.
      const off = (k: number) => Math.min(Math.abs(pos(m, k)[0] - here[0]), Math.abs(pos(m, k)[1] - here[1]));
      const v = sub(here, pos(m, ns.reduce((a, k) => (off(k) < off(a) ? k : a))));
      return done(drop(i, spec, unit(v), len(v) / scaleAt(m, i)));
    }
    if (ns.length === 2 && kind >= 2) {
      // A pair 60° apart, either side of the open direction (the hashed one first, clockwise).
      const open = nextDirection(m, i), before = m.atoms.length;
      const a = drop(i, kind === 3 ? { type: 1, stereo: 6 } : SINGLE, rot(open, -30 * deg));
      const b = drop(i, kind === 3 ? { type: 1, stereo: 1 } : SINGLE, rot(open, 30 * deg));
      return [m, a >= before ? a : b >= before ? b : i];
    }
    if (ns.length === 1) {
      // Off a chain end: the more upright of the two takes the wedge, and the hotspot moves on to the other.
      const [up, other] = upright(i, drop(i), drop(i));
      if (kind < 2) m = setBondSpec(m, bondIndex(m, i, up), spec);
      return [m, other];
    }
    return done(drop(i, spec));
  };
  switch (g) {
    case "chain": return done(drop(i));
    case "other": {
      const d = degree(i);
      // A long bond (1.75 bond lengths) from a carbon that is in a chain or branched, for crowded groups.
      if (!m.atoms[i].text && m.atoms[i].label === "C" && (d === 2 || d === 3)) return done(drop(i, SINGLE, nextDirection(m, i), 1.75));
      if (d !== 1) return done(drop(i));
      // Off a chain end: the other zig-zag direction, the usual one mirrored across the existing bond.
      const e = unit(sub(pos(m, neighbours(m, i)[0]), pos(m, i))), dir = nextDirection(m, i), k = 2 * dot(dir, e);
      return done(drop(i, SINGLE, [k * e[0] - dir[0], k * e[1] - dir[1]]));
    }
    case "acetyl": {
      if (branched(i)) i = drop(i);
      // In a chain the carbon becomes C=O and keeps the hotspot. On a chain end it takes =O (the more upright
      // bond) and a methyl, and the hotspot moves to the methyl.
      if (degree(i) !== 1) { const o = drop(i, { type: 2 }); m = setElement(m, o, "O"); return [m, i]; }
      const [o, me] = upright(i, drop(i), drop(i));
      m = setElement(setBond(m, bondIndex(m, i, o), 2), o, "O");
      return [m, me];
    }
    case "methylidene": {
      const lead = branched(i) ? (i = drop(i)) : undefined;
      const j = drop(i, { type: 2 });
      return [m, lead ?? j];
    }
    case "alkyne": {
      if (degree(i) >= 2 || (!special(i) && multiple(i))) i = drop(i);
      // In line with the bond before it (square to the first on an atom that keeps two bonds).
      const ns = neighbours(m, i), away = ns.length ? unit(sub(pos(m, i), pos(m, ns[0]))) : nextDirection(m, i);
      return done(drop(i, { type: 3 }, ns.length === 2 ? rot(away, 90 * deg) : away));
    }
    case "wedgeMe": return methyls(0);
    case "hashMe": return methyls(1);
    case "dimethyl": return methyls(2);
    case "sulfonyl": {
      // The atom becomes S(=O)2, with a methyl on a chain end. Nothing happens on a branched atom.
      if (degree(i) > 2 || m.atoms[i].text) return [m, i];
      m = setElement(m, i, "S");
      const hot = degree(i) === 1 ? drop(i) : i, open = nextDirection(m, i);
      for (const t of [-30, 30]) { const o = drop(i, { type: 2 }, rot(open, t * deg)); m = setElement(m, o, "O"); }
      return [m, hot];
    }
    case "cpLigand": return ligand(m, i, 5);
    case "phenylLigand": return ligand(m, i, 6);
    case "tBu": {
      const a = m.atoms[i];
      if (a.text) return [m, i];
      const free = hydrogens(a.label, a.charge ?? 0, orders(i).reduce((s, t) => s + (t === 4 ? 1.5 : t), 0), a.radical);
      // A CH2 in a chain takes a wedged and a hashed methyl.
      if (a.label === "C" && free === 2) return methyls(3);
      if (free < 3) i = drop(i);
      // The atom becomes the quaternary carbon: one methyl straight on, then one either side.
      const ns = neighbours(m, i), c = drop(i, SINGLE, ns.length ? unit(sub(pos(m, i), pos(m, ns[0]))) : nextDirection(m, i));
      drop(i);
      drop(i);
      return [m, c];
    }
  }
  return [m, i];
}

// Elements that are not metals; any other element (and the generic M) is a metal.
const NONMETALS = new Set(["H", "D", "T", "He", "B", "C", "N", "O", "F", "Ne", "Si", "P", "S", "Cl", "Ar", "Ge", "As", "Se", "Br", "Kr", "Sb", "Te", "I", "Xe", "At", "Rn"]);
const isMetal = (a: Atom) => (a.text ? a.text === "M" : isElement(a.label) && !NONMETALS.has(a.label));
// ChemDraw's j and Shift+J keys: an η5 cyclopentadienyl (n 5) or η6 phenyl (n 6) π ligand, its ring of delocalised
// bonds drawn in perspective across a bond to its multi-centre point. On a metal with no more than one bond the
// ring goes on a new bond, below the metal or on the far side from its other bond, and the hotspot stays on the
// metal. On an atom with one single bond the atom becomes the point, and the hotspot moves to the other end of the
// bond. Elsewhere nothing happens. The ring is seen from a little above: its near side lowest, drawn with a bold
// edge or a front atom between two wedges; a Cp above its metal is turned a fifth of a turn (staggered).
function ligand(m: Mol, i: number, n: 5 | 6): [Mol, number] {
  const a = m.atoms[i], ns = neighbours(m, i), metal = isMetal(a);
  if (metal ? ns.length > 1 : ns.length !== 1 || orderBetween(m, i, ns[0]) !== 1 || !!a.centre) return [m, i];
  let point = i, anchor = ns[0];
  if (metal) {
    const d: P = ns.length ? unit(sub(pos(m, i), pos(m, ns[0]))) : [0, -1];
    [m, point] = withAtom(m, add(pos(m, i), d));
    m = withBond(m, i, point);
    anchor = i;
  }
  const c = pos(m, point), b = unit(sub(c, pos(m, anchor))), front: P = b[1] <= 1e-9 ? b : mul(b, -1), across: P = [-front[1], front[0]];
  const R = 1 / (2 * Math.sin(Math.PI / n)), turn = n === 6 || (n === 5 && b[1] > 1e-9) ? 180 / n : 0;
  const base = m.atoms.length, ring = Array.from({ length: n }, (_, k) => base + k), t = (k: number) => (90 + turn + (360 / n) * k) * deg;
  for (let k = 0; k < n; k++) m = withAtom(m, add(c, add(mul(across, R * Math.cos(t(k))), mul(front, R * 0.45 * Math.sin(t(k))))))[0];
  // The near atoms: the one, or the two, nearest the viewer.
  const top = Math.max(...ring.map((_, k) => Math.sin(t(k)))), near = (k: number) => Math.sin(t(k)) > top - 1e-6;
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n, [p, q] = [near(k), near(j)];
    const spec: BondSpec = p && q ? { type: 4, display: "bold" } : p || q ? { type: 4, stereo: 1 } : { type: 4 };
    m = { ...m, bonds: [...m.bonds, makeBond(p && !q ? [base + j, base + k] : [base + k, base + j], spec)] };
  }
  // Where two flat bonds cross, the one later in the list is in front, as in ChemDraw. So the ring's far (plain) edges
  // go before the bond to the point and its near (bold or wedged) edges after it: the bond is in front of the far edge
  // and behind the near one, wherever the ring or its metal is moved (issue 6).
  const k = m.bonds.findIndex((b) => b.atoms.includes(point) && b.atoms.includes(anchor)), edges = m.bonds.slice(-n), far = edges.filter((b) => !b.stereo && b.display !== "bold");
  m = { ...m, bonds: [...m.bonds.slice(0, k), ...far, ...m.bonds.slice(k, -n), ...edges.filter((b) => !far.includes(b))] };
  m = setAtom(m, point,{ label: "C", text: undefined, charge: undefined, centre: { atoms: ring } });
  return [m, metal ? i : anchor];
}
// A drawing from Octet 1.0.x, read once as ligand() now orders it: a π ring whose edges all come after the bond to its
// multi-centre point (as 1.0.x drew them) has its far edges moved to just before that bond. A ring in any other order
// (a Bring to Front) is left as it is. Rings of up to six atoms, so a hostile file costs one pass over its bonds.
export function oldLigands(m: Mol): Mol {
  const pair = (i: number, j: number) => (i < j ? `${i} ${j}` : `${j} ${i}`), at = new Map<string, number>(), last = new Map<number, number>(), degree = new Map<number, number>();
  m.bonds.forEach((b, k) => { at.set(pair(b.atoms[0], b.atoms[1]), k); for (const i of b.atoms) { last.set(i, k); degree.set(i, (degree.get(i) ?? 0) + 1); } });
  const key = m.bonds.map((_, k) => k);
  m.atoms.forEach((a, point) => {
    const ring = a.centre?.atoms, k = last.get(point);
    if (!ring || a.centre!.variable || ring.length > 6 || degree.get(point) !== 1 || k === undefined) return;
    const edges = ring.flatMap((i, x) => ring.slice(x + 1).flatMap((j) => at.get(pair(i, j)) ?? [])), far = edges.filter((e) => !m.bonds[e].stereo && m.bonds[e].display !== "bold");
    if (!far.length || edges.some((e) => e < k)) return;
    far.sort((p, q) => p - q).forEach((e, n) => (key[e] = k - 1 + (n + 1) / (far.length + 1)));
  });
  return key.every((v, k) => v === k) ? m : { ...m, bonds: key.map((_, k) => k).sort((p, q) => key[p] - key[q]).map((k) => m.bonds[k]) };
}
// A metallocene as OPSIN and the dictionary give it (a lone M2+ and two C5H5- rings, metals.ts sandwichIons) drawn as
// the j key draws it: the metal between two Cp rings joined through multi-centre points. Each ring's substituents
// keep their shape and turn with their ring atom; the first substituted atom of a ring goes to its right-hand side.
// m unchanged unless there is one such metal and two such rings, no other charged atom, and nothing joining a ring to
// the other or to a metal.
const TILT = 45;
export function sandwich(m: Mol): Mol {
  const near = bondedTo(m), carbon = (i: number) => m.atoms[i].label === "C" && !m.atoms[i].text && !m.atoms[i].centre;
  const metals = m.atoms.flatMap((a, i) => (OCENES[a.label] && !a.text && a.charge === 2 && !near[i].length ? [i] : []));
  // Each C- with a five-carbon cycle through it, in cycle order, its other atoms uncharged.
  const rings = m.atoms.flatMap((a, i) => {
    if (a.charge !== -1 || !carbon(i)) return [];
    const walk = (path: number[]): number[] | undefined => {
      if (path.length === 5) return near[path[4]].includes(i) ? path : undefined;
      for (const j of near[path[path.length - 1]]) if (!path.includes(j) && carbon(j) && !m.atoms[j].charge) { const r = walk([...path, j]); if (r) return r; }
      return undefined;
    };
    const ring = walk([i]);
    return ring ? [ring] : [];
  });
  if (metals.length !== 1 || rings.length !== 2 || rings[0].some((i) => rings[1].includes(i))) return m;
  // Other ions stay as drawn (titanocene dichloride's Cl- would be left loose), so then the whole stays as ions.
  if (m.atoms.filter((a) => a.charge).length !== 3) return m;
  const metal = metals[0];
  // Each substituent: the ring atom, its first atom and the atoms beyond it.
  const subs = rings.map((ring, r) => ring.flatMap((at) => near[at].filter((j) => !ring.includes(j)).map((first) => {
    const part = new Set([first]), todo = [first];
    while (todo.length) for (const j of near[todo.pop()!]) if (j !== at && !part.has(j)) { part.add(j); todo.push(j); }
    return { at, first, part, bad: part.has(metal) || ring.some((i) => part.has(i)) || rings[1 - r].some((i) => part.has(i)) };
  })));
  if (subs.some((s) => s.some((x) => x.bad))) return m;
  let out: Mol = setAtom(m, metal, { charge: undefined });
  for (const ring of rings) for (const i of ring) out = setAtom(out, i, { charge: undefined });
  const made: number[][] = [];
  for (let r = 0; r < 2; r++) {
    const base = out.atoms.length;
    out = addGroupAt(out, metal, "cpLigand")[0];
    made.push(out.atoms[base].centre!.atoms);
  }
  // The new ring atom for each old one: the cycle turned so the first substituted atom lands on the right.
  const map = new Map<number, number>();
  rings.forEach((ring, r) => {
    const ps = made[r].map((i) => pos(out, i)), c = mul(ps.reduce(add), 1 / 5), away = unit(sub(c, pos(out, metal)));
    const score = (k: number) => { const u = unit(sub(ps[k], c)); return u[0] + 0.5 * dot(u, away); };
    const right = [0, 1, 2, 3, 4].reduce((a, b) => (score(b) > score(a) ? b : a));
    const first = subs[r].length ? ring.indexOf(subs[r][0].at) : 0;
    ring.forEach((old, k) => map.set(old, made[r][(right + k - first + 5) % 5]));
  });
  // Substituents move with their ring atom, turned to point out from the ring's middle and TILT degrees away from the
  // metal, so the two rings' groups (dppf's phenyl rings) keep apart.
  const atoms = [...out.atoms];
  subs.forEach((list, r) => {
    const c = mul(made[r].map((i) => pos(out, i)).reduce(add), 1 / 5), away = sub(c, pos(out, metal));
    for (const s of list) {
      const from = pos(out, s.at), to = pos(out, map.get(s.at)!), was = sub(pos(out, s.first), from), out0 = unit(sub(to, c));
      const dir = rot(out0, Math.sign(cross(out0, away)) * TILT * deg);
      const t = Math.atan2(dir[1], dir[0]) - Math.atan2(was[1], was[0]);
      for (const j of s.part) { const q = add(to, rot(sub(pos(out, j), from), t)); atoms[j] = { ...atoms[j], location: [q[0], q[1], 0] }; }
    }
  });
  const bonds = out.bonds.flatMap((b) => {
    const [a, c] = b.atoms.map((i) => map.get(i) ?? i);
    // Old ring bonds go with the old ring; the new ring has its own.
    return map.has(b.atoms[0]) && map.has(b.atoms[1]) ? [] : [{ ...b, atoms: [a, c] as [number, number] }];
  });
  return deleteAtoms({ ...out, atoms, bonds }, new Set(map.keys()));
}

// Each multi-centre or variable attachment where the middle of its atoms is now (after they moved, or turned in 3D).
export function placeCentres(m: Mol): Mol {
  let atoms: Atom[] | undefined;
  m.atoms.forEach((a, i) => {
    const ps = (a.centre?.atoms ?? []).filter((j) => j < m.atoms.length).map((j) => m.atoms[j].location);
    if (!ps.length) return;
    const c = [0, 1, 2].map((k) => ps.reduce((sum, q) => sum + (q[k] ?? 0), 0) / ps.length) as [number, number, number];
    if (Math.hypot(c[0] - a.location[0], c[1] - a.location[1], c[2] - (a.location[2] ?? 0)) > 1e-9) (atoms ??= [...m.atoms])[i] = { ...a, location: c };
  });
  return atoms ? { ...m, atoms } : m;
}

// The keyboard hotspot: the atom or bond the next key acts on, as ChemDraw's.
export type Hot = { atom?: number; bond?: number };
// An arrow key (dir) moves it from an atom to the bond that points most that way, and from a bond to the end that
// lies most that way. Where two are as near, it stays.
export function walkHot(m: Mol, hot: Hot, dir: P): Hot {
  const score = (from: P, to: P) => len(sub(unit(sub(to, from)), dir));
  if (hot.atom !== undefined) {
    const i = hot.atom, here = pos(m, i);
    const ways = m.bonds.flatMap((b, k) => (b.atoms.includes(i) ? [{ k, s: score(here, pos(m, b.atoms[0] === i ? b.atoms[1] : b.atoms[0])) }] : [])).sort((a, b) => a.s - b.s);
    return ways.length && (ways.length === 1 || ways[0].s < ways[1].s - 1e-9) ? { bond: ways[0].k } : hot;
  }
  if (hot.bond === undefined) return hot;
  const [a, b] = m.bonds[hot.bond].atoms, mid = mul(add(pos(m, a), pos(m, b)), 0.5), sa = score(mid, pos(m, a)), sb = score(mid, pos(m, b));
  return sa < sb - 1e-9 ? { atom: a } : sb < sa - 1e-9 ? { atom: b } : hot;
}
// Shift+arrow: to the atom of the same structure nearest a point about three bonds (2.45 bond lengths) that way.
// Past the structure's edge it comes round from the other side. other (Shift+Option+arrow, ChemDraw 22's): to the
// nearest atom of another structure instead, coming round past the edge of the drawing.
export function jumpHot(m: Mol, hot: Hot, dir: P, other = false): Hot {
  const ends = hot.bond !== undefined ? m.bonds[hot.bond].atoms : hot.atom !== undefined ? [hot.atom] : [];
  if (!ends.length) return hot;
  const at = mul(ends.reduce((s, k) => add(s, pos(m, k)), [0, 0] as P), 1 / ends.length), group = fragments(m).find((g) => g.includes(ends[0]))!;
  const inside = new Set(group), bonds = m.bonds.filter((b) => inside.has(b.atoms[0]));
  const step = 2.45 * (bonds.reduce((s, b) => s + len(sub(pos(m, b.atoms[1]), pos(m, b.atoms[0]))), 0) / (bonds.length || 1) || 1), target = add(at, mul(dir, step));
  const pool = other ? m.atoms.flatMap((a, i) => (inside.has(i) || a.centre ? [] : [i])) : group, all = other ? m.atoms.map((_, i) => i) : group;
  const span = [0, 1].map((k) => Math.max(...all.map((i) => pos(m, i)[k])) - Math.min(...all.map((i) => pos(m, i)[k])) + step);
  let best: number | undefined, near = Infinity;
  for (const i of pool) {
    if (i === hot.atom) continue;
    const p = pos(m, i);
    for (const k of [0, 1]) if (dir[k] && Math.sign(p[k] - at[k]) === -Math.sign(dir[k])) p[k] += Math.sign(dir[k]) * span[k];
    const d = len(sub(p, target));
    if (d < near) [best, near] = [i, d];
  }
  return best === undefined ? hot : { atom: best };
}
// The hotspot after an edit that did not move it (was is the drawing before the edit): on the same atom or bond. An
// edit that removes atoms or bonds numbers the rest again, so then it is found again where it was. Undefined when it
// is gone.
export function keepHot(was: Mol, m: Mol, hot: Hot): Hot | undefined {
  if (m.atoms.length >= was.atoms.length && m.bonds.length >= was.bonds.length) return (hot.atom ?? -1) < m.atoms.length && (hot.bond ?? -1) < m.bonds.length ? hot : undefined;
  const find = (i: number) => (i < was.atoms.length ? atomAt(m, pos(was, i), 1e-6) : undefined);
  if (hot.atom !== undefined) { const atom = find(hot.atom); return atom === undefined ? undefined : { atom }; }
  const [a, b] = hot.bond !== undefined ? (was.bonds[hot.bond]?.atoms.map(find) ?? []) : [];
  const bond = m.bonds.findIndex((x) => x.atoms.includes(a ?? -1) && x.atoms.includes(b ?? -1));
  return bond >= 0 ? { bond } : undefined;
}
// After a ring is fused on bond `on` (its new bonds from index `from`), the new bond farthest from it, where
// ChemDraw puts the hotspot; of two, the one of higher order, then the higher, then the one on the right.
export function farBond(m: Mol, on: number, from: number): number | undefined {
  const mid = (k: number) => mul(add(pos(m, m.bonds[k].atoms[0]), pos(m, m.bonds[k].atoms[1])), 0.5), c = mid(on);
  let best: number | undefined, far = -1;
  for (let k = from; k < m.bonds.length; k++) {
    const d = Math.trunc(len(sub(mid(k), c)) * 100);
    if (best === undefined || d > far) { [best, far] = [k, d]; continue; }
    const [p, q, o, ob] = [mid(k), mid(best), m.bonds[k].type, m.bonds[best].type];
    if (d === far && (o > ob || (o === ob && (p[1] > q[1] + 1e-6 || (p[1] > q[1] - 1e-6 && p[0] > q[0]))))) best = k;
  }
  return best;
}

// Moves and turns a selection. Rotation is about the selection's centre, counter-clockwise for positive degrees.
export function rotateAtoms(m: Mol, ids: Set<number>, degrees: number): Mol {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return m;
  const c: P = [(Math.min(...ps.map((p) => p[0])) + Math.max(...ps.map((p) => p[0]))) / 2, (Math.min(...ps.map((p) => p[1])) + Math.max(...ps.map((p) => p[1]))) / 2];
  return { ...m, atoms: m.atoms.map((a, i) => {
    if (!ids.has(i)) return a;
    const r = add(c, rot(sub(pos(m, i), c), degrees * deg));
    return { ...a, location: [r[0], r[1], a.location[2] ?? 0], ...turnMarks(a, (t) => t + degrees) };
  }) };
}
// Marks placed by hand (Atom.angles) turn and flip with their atom, so they keep their place beside it.
const turnMarks = (a: Atom, f: (degrees: number) => number) =>
  a.angles ? { angles: Object.fromEntries(Object.entries(a.angles).map(([k, t]) => [k, ((((f(t) + 180) % 360) + 360) % 360) - 180])) } : {};

// Chair cyclohexane, drawn the textbook way and at ChemDraw 22.2's angles: three pairs of parallel bonds, all one
// bond long, a steep pair at the ends at 60° (the first bond, 0-1) and two pairs sloping 15° up and 15° down (issue 3).
// Chair 2 is chair 1 turned upside down.
export function chairPoints(which: 1 | 2): P[] {
  const pts: P[] = [[0, 0]];
  for (const t of [-60, 15, -15, 120, 195]) pts.push(add(pts[pts.length - 1], [Math.cos(t * deg), (which === 1 ? 1 : -1) * Math.sin(t * deg)]));
  const c = mul(pts.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6);
  return pts.map((p) => sub(p, c));
}

// Places a chair on empty canvas (centred on the point), or fuses it onto a bond on the side away from the
// bond's other neighbours. The two chairs on one bond are mirror images, on the same side.
// turn: on empty canvas, the chair turned that far (radians) from across the page, as a dragged chair faces the drag.
// toward: on a bond, the chair dragged from it: of the twelve ways the chair fits the bond, the one whose middle is
// nearest the pointer, leaving out any that runs into the drawing (issue 3).
export function addChair(m: Mol, which: 1 | 2, target: { bond?: number; point?: P; turn?: number; toward?: P }): Mol {
  let pts = chairPoints(which), scale = 1;
  if (target.bond !== undefined) {
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j);
    scale = (scaleAt(m, i) + scaleAt(m, j)) / 2;
    // Map chair bond e0-e1 onto a-b (rotate, scale, move).
    const be = sub(b, a), onto = (e0: P, e1: P) => {
      const te = sub(e1, e0), k = len(be) / len(te), turn = Math.atan2(be[1], be[0]) - Math.atan2(te[1], te[0]);
      return pts.map((p) => add(a, mul(rot(sub(p, e0), turn), k)));
    };
    // A bond of a chair of the same kind: the new chair is that chair moved along, its opposite bond on a-b, so
    // all its bonds stay parallel to the first chair's (trans-decalin as textbooks draw it, with no straight corner).
    const near = (p: P) => m.atoms.some((_, x) => len(sub(pos(m, x), p)) < 1e-3 * len(be));
    if (target.toward) {
      const middle = (q: P[]) => mul(q.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6), toward = target.toward;
      const fits = pts.flatMap((_, q) => [onto(pts[q], pts[(q + 1) % 6]), onto(pts[(q + 1) % 6], pts[q])]);
      const clear = fits.filter((f) => f.every((p) => len(sub(p, a)) < 1e-6 || len(sub(p, b)) < 1e-6 || m.atoms.every((_, x) => len(sub(pos(m, x), p)) > 0.6 * len(be))));
      const best = (clear.length ? clear : fits).reduce((x, y) => (len(sub(middle(y), toward)) < len(sub(middle(x), toward)) ? y : x));
      return chairAt(m, best, scale);
    }
    for (let q = 0; q < 6; q++) {
      const [p0, p1, p3, p4] = [q, q + 1, q + 3, q + 4].map((n) => pts[n % 6]);
      if (onto(p0, p1).every(near)) return chairAt(m, onto(p4, p3), scale);
      if (onto(p1, p0).every(near)) return chairAt(m, onto(p3, p4), scale);
    }
    // Else a steep chair bond onto a-b: 0-1 for chair 1 and 1-0 for chair 2. Then mirror across the bond if it
    // lands on the crowded side.
    pts = which === 1 ? onto(pts[0], pts[1]) : onto(pts[1], pts[0]);
    const normal: P = unit([-(b[1] - a[1]), b[0] - a[0]]);
    const sideOf = (p: P) => Math.sign((p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]);
    const centre = mul(pts.reduce((s, p) => add(s, p), [0, 0] as P), 1 / 6);
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((x) => x !== i && x !== j);
    if (others.reduce((s, x) => s + sideOf(pos(m, x)), 0) * sideOf(centre) > 0) {
      pts = pts.map((p) => { const d = (p[0] - a[0]) * normal[0] + (p[1] - a[1]) * normal[1]; return sub(p, mul(normal, 2 * d)); });
    }
  } else {
    const c = target.point!, turn = target.turn ?? 0;
    pts = pts.map((p) => add(rot(p, turn), c));
  }
  return chairAt(m, pts, scale);
}
function chairAt(m: Mol, pts: P[], scale: number): Mol {
  const ids: number[] = [];
  for (const p of pts) { let id: number; [m, id] = atomOrNew(m, p, scale); ids.push(id); }
  for (let k = 0; k < 6; k++) m = withBond(m, ids[k], ids[(k + 1) % 6]);
  return m;
}

// Atoms inside a closed lasso path (even-odd rule).
export function inPolygon([x, y]: P, poly: P[]): boolean {
  let inside = false;
  for (let k = 0, l = poly.length - 1; k < poly.length; l = k++) {
    const [xi, yi] = poly[k], [xj, yj] = poly[l];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const atomsInPolygon = (m: Mol, poly: P[]): number[] => m.atoms.flatMap((_, i) => (inPolygon(pos(m, i), poly) ? [i] : []));

// Flip Horizontal and Flip Vertical: a 180° turn in 3D about the vertical or horizontal axis, so wedges become
// hashed wedges and the stereochemistry is kept (as ChemDraw's "Rotate 180°"). Double-bond sides swap too.
// Turns atoms over about the middle of their box. As ChemDraw's Rotate 180° (the default) the turn is in 3D, so
// wedges become hashes and each stereocentre keeps its configuration; as its Flip (mirror) wedges stay wedges and
// the configuration inverts. about: the line to turn over on (x for horizontal, y for vertical), when it is not the
// middle of the atoms (a selection with text, arrows or shapes turns over on the middle of all of it).
export function flipAtoms(m: Mol, ids: Set<number>, axis: "horizontal" | "vertical", mirror = false, about?: number): Mol {
  const ps = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  if (!ps.length) return m;
  const k = axis === "horizontal" ? 0 : 1;
  const mid = about ?? (Math.min(...ps.map((p) => p[k])) + Math.max(...ps.map((p) => p[k]))) / 2;
  const swap = { left: "right", right: "left", centre: "centre" } as const;
  return {
    ...m,
    // A Rotate 180° is a turn through 3D, so a 3D structure's depth turns over too; a mirror keeps it.
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const loc: [number, number, number] = [a.location[0], a.location[1], mirror ? a.location[2] ?? 0 : -(a.location[2] ?? 0)];
      loc[k] = 2 * mid - loc[k];
      // A mirror inverts a configuration kept from ChemDraw too (two of its neighbours change places).
      const kept = mirror && a.kept ? { kept: { ...a.kept, atoms: [a.kept.atoms[1], a.kept.atoms[0], ...a.kept.atoms.slice(2)] } } : {};
      return { ...a, location: loc, ...turnMarks(a, (t) => (k ? -t : 180 - t)), ...kept };
    }),
    bonds: m.bonds.map((b) => {
      if (!ids.has(b.atoms[0]) || !ids.has(b.atoms[1])) return b;
      const out = { ...b };
      if (!mirror && b.stereo === 1) out.stereo = 6;
      else if (!mirror && b.stereo === 6) out.stereo = 1;
      if (b.position) out.position = swap[b.position];
      return out;
    }),
  };
}

// The box Align and Distribute line a structure up by (drawing units, y up: [left, bottom, right, top]) when only part
// of it is selected: the box of the selected atoms' centres, a point for one atom. As ChemDraw's Object > Align, the
// part sets where the structure goes and the whole structure moves. Undefined when all of it or none is selected.
export function partBox(m: Mol, g: number[], ids: Set<number>): Box | undefined {
  const sel = g.filter((i) => ids.has(i));
  if (!sel.length || sel.length === g.length) return undefined;
  const xs = sel.map((i) => pos(m, i)[0]), ys = sel.map((i) => pos(m, i)[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// How far each thing moves for Object > Align and Distribute, from its box (y up: [left, bottom, right, top]). Align
// lines each thing up with the highest one, as ChemDraw. Distribute keeps the first and last in place and makes the
// gaps between neighbours equal.
export type Arrange = "left" | "centre" | "right" | "top" | "middle" | "bottom" | "across" | "down";
export function arrangeShifts(boxes: Box[], how: Arrange): P[] {
  const shifts = boxes.map((): P => [0, 0]);
  if (how === "across" || how === "down") {
    const k = how === "across" ? 0 : 1, order = boxes.map((_, n) => n).sort((p, q) => (boxes[p][k] + boxes[p][k + 2]) - (boxes[q][k] + boxes[q][k + 2]));
    const span = boxes[order[order.length - 1]][k + 2] - boxes[order[0]][k], sizes = order.reduce((s, n) => s + boxes[n][k + 2] - boxes[n][k], 0), gap = (span - sizes) / (order.length - 1);
    let at = boxes[order[0]][k + 2] + gap;
    for (const n of order.slice(1, -1)) { shifts[n][k] = at - boxes[n][k]; at += boxes[n][k + 2] - boxes[n][k] + gap; }
    return shifts;
  }
  const top = boxes.reduce((p, b, n) => (b[3] > boxes[p][3] ? n : p), 0), t = boxes[top], mid = (b: Box, k: number) => (b[k] + b[k + 2]) / 2;
  boxes.forEach((b, n) => {
    if (n === top) return;
    if (how === "left") shifts[n][0] = t[0] - b[0];
    else if (how === "right") shifts[n][0] = t[2] - b[2];
    else if (how === "centre") shifts[n][0] = mid(t, 0) - mid(b, 0);
    else if (how === "top") shifts[n][1] = t[3] - b[3];
    else if (how === "bottom") shifts[n][1] = t[1] - b[1];
    else shifts[n][1] = mid(t, 1) - mid(b, 1);
  });
  return shifts;
}

// Lines up whole structures in a selection: their centres on one line, or evenly spaced along it. A structure
// selected only in part lines up by that part (partBox) and moves whole.
export function alignFragments(m: Mol, ids: Set<number>, how: "row" | "column" | "spread-row" | "spread-column"): Mol {
  const groups = fragments(m).filter((g) => g.some((i) => ids.has(i)));
  if (groups.length < 2) return m;
  const boxes = groups.map((g): Box => {
    const part = partBox(m, g, ids);
    if (part) return part;
    const xs = g.map((i) => pos(m, i)[0]), ys = g.map((i) => pos(m, i)[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  });
  const centre = (b: number[], k: 0 | 1) => (b[k] + b[k + 2]) / 2;
  const axis: 0 | 1 = how === "row" || how === "spread-row" ? 1 : 0; // a row shares one y
  const shifts: P[] = groups.map(() => [0, 0]);
  if (how === "row" || how === "column") {
    const target = boxes.reduce((s, b) => s + centre(b, axis), 0) / boxes.length;
    boxes.forEach((b, k) => { shifts[k][axis] = target - centre(b, axis); });
  } else {
    // Equal gaps between neighbouring structures, keeping the first and last in place.
    const along: 0 | 1 = axis === 1 ? 0 : 1, order = boxes.map((_, k) => k).sort((a, b) => boxes[a][along] - boxes[b][along]);
    const total = boxes[order[order.length - 1]][along + 2] - boxes[order[0]][along];
    const sizes = order.map((k) => boxes[k][along + 2] - boxes[k][along]), gap = (total - sizes.reduce((s, x) => s + x, 0)) / (order.length - 1);
    let at = boxes[order[0]][along];
    order.forEach((k, n) => { shifts[k][along] = at - boxes[k][along]; at += sizes[n] + gap; });
  }
  let out = m;
  groups.forEach((g, k) => { out = moveAtoms(out, new Set(g), shifts[k]); });
  return out;
}

// Captions and arrows share one set of ids, unique within a drawing.
const nextId = (m: Mol) => Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;
export function addCycle(m: Mol, c: Omit<Cycle, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, cycles: [...(m.cycles ?? []), { ...c, id }] }, id];
}
export function addCaption(m: Mol, c: Omit<Caption, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, captions: [...(m.captions ?? []), { ...c, id }] }, id];
}
export function addArrow(m: Mol, a: Omit<Arrow, "id">): [Mol, number] {
  const id = nextId(m);
  return [{ ...m, arrows: [...(m.arrows ?? []), { ...a, id }] }, id];
}
export const updateArrow = (m: Mol, id: number, change: Partial<Arrow>): Mol =>
  ({ ...m, arrows: m.arrows?.map((a) => (a.id === id ? { ...a, ...change } : a)) });
// Editing a pen curve (ChemDraw's Edit Curve tool). Segment i runs from point i to the next (a closed curve's last
// segment back to its first point). A segment with no handles at either end is straight.
type Q = [number, number];
const lerp = (a: Q, b: Q, t: number): Q => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const segments = (c: Curve) => (c.closed && c.points.length > 2 ? c.points.length : c.points.length - 1);
function segment(c: Curve, i: number): [Q, Q, Q, Q] {
  const a = c.points[i], b = c.points[(i + 1) % c.points.length];
  return [a.at, a.c2 ?? a.at, b.c1 ?? b.at, b.at];
}
const bezier = ([p0, p1, p2, p3]: [Q, Q, Q, Q], t: number): Q => lerp(lerp(lerp(p0, p1, t), lerp(p1, p2, t), t), lerp(lerp(p1, p2, t), lerp(p2, p3, t), t), t);
// The place on a curve nearest a point: its segment, how far along it (0 to 1) and the distance (drawing units).
export function nearestOnCurve(c: Curve, p: Q): { seg: number; t: number; d: number } {
  let best = { seg: 0, t: 0, d: Infinity };
  for (let i = 0; i < segments(c); i++) {
    const s = segment(c, i);
    for (let j = 0; j <= 48; j++) { const q = bezier(s, j / 48), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best.d) best = { seg: i, t: j / 48, d }; }
  }
  // Closer still about the best sample.
  for (let k = 0; k < 20; k++) {
    const s = segment(c, best.seg), step = 1 / 48 / 2 ** (k + 1);
    for (const t of [best.t - step, best.t + step]) if (t >= 0 && t <= 1) { const q = bezier(s, t), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < best.d) best = { ...best, t, d }; }
  }
  return best;
}
// A point added on segment seg at t, splitting it (de Casteljau) so the curve keeps its shape. A straight segment
// gets a corner point and stays straight.
export function splitCurve(c: Curve, seg: number, t: number): Curve {
  const n = c.points.length, a = c.points[seg], b = c.points[(seg + 1) % n], [p0, p1, p2, p3] = segment(c, seg);
  const pts = c.points.map((q) => ({ ...q }));
  let mid: CurvePoint;
  if (!a.c2 && !b.c1) mid = { at: lerp(p0, p3, t) };
  else {
    const q0 = lerp(p0, p1, t), q1 = lerp(p1, p2, t), q2 = lerp(p2, p3, t), r0 = lerp(q0, q1, t), r1 = lerp(q1, q2, t);
    mid = { at: lerp(r0, r1, t), c1: r0, c2: r1 };
    pts[seg] = { ...pts[seg], c2: q0 };
    pts[(seg + 1) % n] = { ...pts[(seg + 1) % n], c1: q2 };
  }
  pts.splice(seg + 1, 0, mid);
  return { ...c, points: pts };
}
// A point moved: its anchor (its handles move with it), or one handle. A smooth point's other handle turns to stay
// opposite, keeping its own length, unless free (Option) breaks the point into a corner.
export function moveCurvePoint(c: Curve, i: number, part: "at" | "c1" | "c2", p: Q, free = false): Curve {
  const q = c.points[i], d: Q = [p[0] - q.at[0], p[1] - q.at[1]], shift = (h?: Q): Q | undefined => h && [h[0] + d[0], h[1] + d[1]];
  let next: CurvePoint;
  if (part === "at") next = { at: p, ...(q.c1 ? { c1: shift(q.c1) } : {}), ...(q.c2 ? { c2: shift(q.c2) } : {}) };
  else {
    const other = part === "c1" ? "c2" : "c1", o = q[other], h = q[part];
    next = { ...q, [part]: p };
    const len = o && Math.hypot(o[0] - q.at[0], o[1] - q.at[1]), out = Math.hypot(p[0] - q.at[0], p[1] - q.at[1]);
    // Smooth: its handles point opposite ways (to within about 2°). A corner stays a corner.
    const a = h && [h[0] - q.at[0], h[1] - q.at[1]], b = o && [o[0] - q.at[0], o[1] - q.at[1]];
    const smooth = !!a && !!b && a[0] * b[0] + a[1] * b[1] < 0 && Math.abs(a[0] * b[1] - a[1] * b[0]) <= 0.035 * Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]);
    if (o && smooth && !free && len && out > 1e-9) next[other] = [q.at[0] - ((p[0] - q.at[0]) * len) / out, q.at[1] - ((p[1] - q.at[1]) * len) / out];
  }
  return { ...c, points: c.points.map((x, k) => (k === i ? next : x)) };
}
// A point taken out (a curve keeps at least two), or one added at the end (a straight segment to it).
export const removeCurvePoint = (c: Curve, i: number): Curve => (c.points.length <= 2 ? c : { ...c, points: c.points.filter((_, k) => k !== i), ...(c.points.length <= 3 ? { closed: undefined } : {}) });
export const appendCurvePoint = (c: Curve, p: Q): Curve => ({ ...c, points: [...c.points, { at: p }] });
// A curve arrow with new points: its ends follow its first and last points.
export const withCurve = (c: Curve): Partial<Arrow> => ({ curve: c, from: c.points[0].at, to: c.points[c.points.length - 1].at });
export function addShape(m: Mol, sh: Omit<Shape, "id">): [Mol, number] {
  const id = nextId(m);
  // A highlight goes behind the shapes already there; anything else on top.
  return [{ ...m, shapes: sh.kind === "highlight" ? [{ ...sh, id }, ...(m.shapes ?? [])] : [...(m.shapes ?? []), { ...sh, id }] }, id];
}
export const updateShape = (m: Mol, id: number, change: Partial<Shape>): Mol =>
  ({ ...m, shapes: m.shapes?.map((x) => (x.id === id ? { ...x, ...change } : x)) });

// Sizes (decision 0007). A scale is kept to 4 decimals and left unset at 1; a size in points stays 0.1 to 999.
const times = (v: number, k: number) => Math.round(v * k * 1e4) / 1e4;
const scaled = <T extends { scale?: number }>(x: T, k: number): T => {
  const f = Math.min(100, Math.max(0.01, times(x.scale ?? 1, k))), { scale: _, ...rest } = x;
  return (f === 1 ? rest : { ...rest, scale: f }) as T;
};
const points = (pt: number) => Math.min(999, Math.max(0.1, Math.round(pt * 100) / 100));
// A caption's size (its own, or `size` when it has none and size is given), its runs' sizes and a fixed line spacing
// times k.
const caption = (c: Caption, k: number, size?: number): Caption => {
  const own = c.size ?? size;
  return { ...c, ...(own ? { size: points(own * k) } : {}), ...(c.runs ? { runs: c.runs.map((r) => (r.size ? { ...r, size: points(r.size * k) } : r)) } : {}),
    ...(typeof c.lineHeight === "number" ? { lineHeight: points(c.lineHeight * k) } : {}) };
};
// An arrow's, shape's or cycle's sizes in points times k: its own line width, a table's or TLC plate's text size and a table's
// line weight.
const pointsOf = <T extends Arrow | Shape | Cycle>(x: T, k: number): T => ({
  ...x, ...(x.width ? { width: Math.round(x.width * k * 1e4) / 1e4 } : {}), ...("size" in x && x.size ? { size: points(x.size * k) } : {}),
  ...("table" in x && x.table?.weight ? { table: { ...x.table, weight: Math.round(x.table.weight * k * 1e4) / 1e4 } } : {}),
});
// Scale… with Labels and lines on: the chosen atoms', arrows', shapes' and cycles' scales times k, and the sizes of
// the chosen captions and of the captions that go with them (under those atoms, on those arrows, in those cycles).
// captionSize: the document's caption size, for captions that have none of their own. Positions move elsewhere.
export function scaleSettings(m: Mol, atoms: Set<number>, items: Set<number>, k: number, captionSize: number): Mol {
  const goes = (c: Caption) => items.has(c.id) || (!!c.under?.length && c.under.every((i) => atoms.has(i))) || (!!c.on && items.has(c.on.arrow)) || (!!c.cycle && items.has(c.cycle.cycle));
  return {
    ...m,
    atoms: m.atoms.map((a, i) => (atoms.has(i) ? scaled(a, k) : a)),
    arrows: m.arrows?.map((a) => (items.has(a.id) ? scaled(a, k) : a)),
    shapes: m.shapes?.map((x) => (items.has(x.id) ? scaled(x, k) : x)),
    cycles: m.cycles?.map((c) => (items.has(c.id) ? scaled(c, k) : c)),
    // A caption's width (bond lengths) grows with its text, so it wraps where it did.
    captions: m.captions?.map((c) => (goes(c) ? { ...caption(c, k, captionSize), ...(c.width ? { width: c.width * k } : {}) } : c)),
  };
}
// A new document scale: every size the drawing holds in points (an atom's own label size, caption and run sizes and
// line spacing, an object's own line width, a table's or TLC plate's text size, a table's line weight) times r, so
// text and lines stay in proportion to the bonds.
export function scaleSizes(m: Mol, r: number): Mol {
  if (r === 1) return m;
  return {
    ...m,
    atoms: m.atoms.map((a) => (a.size ? { ...a, size: points(a.size * r) } : a)),
    captions: m.captions?.map((c) => (c.size || c.runs?.some((x) => x.size) || typeof c.lineHeight === "number" ? caption(c, r) : c)),
    arrows: m.arrows?.map((a) => pointsOf(a, r)),
    shapes: m.shapes?.map((x) => pointsOf(x, r)),
    cycles: m.cycles?.map((c) => pointsOf(c, r)),
  };
}
// Rotate…, Scale…, the selection's handles, the Turn keys and the flips: the chosen atoms and objects moved point by
// point by f, as one thing, so a group's objects keep their places relative to each other (as ChemDraw's). size: how
// much shapes, tables and cycles grow across and up (they turn about their middles and keep their own shape).
// centres: each free caption's middle (from its laid-out box). A caption's middle moves by f, and its anchor keeps its
// place from the middle, times text (how much its text grows), so text reads the same way after a turn or a flip, and
// grows about its middle or keeps its size. mirror: f turns the drawing over, so curved arrows bend, half heads point,
// a single bracket faces and a cycle goes the other way. A flip turns the atoms over first (flipAtoms) and gives none.
export function transformParts(m: Mol, atoms: Set<number>, items: Set<number>, f: (q: P) => P, size: P = [1, 1], centres?: Map<number, P>, text = 1, mirror?: "across" | "down"): Mol {
  const mean = (size[0] + size[1]) / 2, both = Math.sqrt(Math.abs(size[0] * size[1]));
  // Free text turns as f turns the page (CD-19, ChemDraw's RotationAngle): its anchor goes round its middle. A flip
  // leaves it reading the same way, its turn the other way, so its anchor goes round its middle by twice its turn,
  // back: the text keeps its middle where the flip puts it.
  const o = f([0, 0]), e1 = f([1, 0]), turn = mirror ? 0 : (Math.atan2(e1[1] - o[1], e1[0] - o[0]) * 180) / Math.PI;
  const caption = (c: Caption): Caption => {
    const middle = centres?.get(c.id), d = middle ? mul(sub([c.x, c.y], middle), text) : undefined;
    const by = ((mirror ? -2 * (c.angle ?? 0) : turn) * Math.PI) / 180, cs = Math.cos(by), sn = Math.sin(by);
    const [x, y] = middle && d ? add(f(middle), [d[0] * cs - d[1] * sn, d[0] * sn + d[1] * cs]) : f([c.x, c.y]);
    const a = ((((mirror ? -(c.angle ?? 0) : (c.angle ?? 0) + turn) + 180) % 360) + 360) % 360 - 180;
    return { ...c, x, y, angle: Math.abs(a) > 1e-9 ? a : undefined };
  };
  const over = (h?: Arrow["start"]) => (h === "left" ? "right" : h === "right" ? "left" : h);
  return {
    ...m,
    atoms: m.atoms.map((a, i) => (atoms.has(i) ? { ...a, location: [...f([a.location[0], a.location[1]]), (a.location[2] ?? 0) * mean] as [number, number, number] } : a)),
    captions: m.captions?.map((c) => (items.has(c.id) && !c.under && !c.on && !c.cycle ? caption(c) : c)),
    arrows: m.arrows?.map((a) => (items.has(a.id) ? { ...a, from: f(a.from), to: f(a.to), ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: f(q.at), ...(q.c1 ? { c1: f(q.c1) } : {}), ...(q.c2 ? { c2: f(q.c2) } : {}) })) } } : {}),
      ...(mirror && a.bend ? { bend: -a.bend } : {}), ...(mirror && a.start ? { start: over(a.start) } : {}), ...(mirror && a.end ? { end: over(a.end) } : {}) } : a)),
    shapes: m.shapes?.map((x) => {
      if (!items.has(x.id)) return x;
      // The middle moves by f, and the shape turns as f turns the page: a turn turns it, a scale keeps its angle and
      // grows it along its own sides (turned by its angle), and a flip turns its angle the other way.
      const c = mul(add(x.from, x.to), 0.5), to = f(c), r = ((x.angle ?? 0) * Math.PI) / 180, e = sub(f(add(c, [1, 0])), to);
      const u = sub(f(add(c, [Math.cos(r), Math.sin(r)])), to), v = sub(f(add(c, [-Math.sin(r), Math.cos(r)])), to);
      const half: P = [((x.to[0] - x.from[0]) / 2) * len(u), ((x.to[1] - x.from[1]) / 2) * len(v)], angle = mirror ? -(x.angle ?? 0) : (x.angle ?? 0) + (Math.atan2(e[1], e[0]) * 180) / Math.PI;
      const grows = size[0] !== 1 || size[1] !== 1;
      const table = x.table && grows ? { ...x.table, ...(x.table.widths ? { widths: x.table.widths.map((w) => w * size[0]) } : {}), ...(x.table.heights ? { heights: x.table.heights.map((h) => h * size[1]) } : {}) } : x.table;
      return settleShape({ ...x, from: sub(to, half), to: add(to, half), ...(table ? { table } : {}), ...(mirror === "across" && x.side ? { side: x.side === "left" ? "right" as const : "left" as const } : {}), angle });
    }),
    // A flipped cycle's side arrows swap their half heads, as an arrow's do.
    cycles: m.cycles?.map((c) => (items.has(c.id) ? { ...c, centre: f(c.centre), radius: c.radius * both, ...(mirror ? { clockwise: !c.clockwise } : {}), ...(mirror && c.branches ? { branches: c.branches.map((b) => (b.heads ? { ...b, heads: b.heads.map(over) as [Head, Head] } : b)) } : {}), ...(c.at ? { at: c.at.map((x) => { const o = f(c.centre), q = f([c.centre[0] + Math.cos(x), c.centre[1] + Math.sin(x)]); return Math.atan2(q[1] - o[1], q[0] - o[0]); }) } : {}) } : c)),
  };
}
// The median bond length (bond lengths) among bonds whose two atoms are both chosen; undefined when there is none.
export function medianBond(m: Mol, atoms: Set<number>): number | undefined {
  const ls = m.bonds.filter((b) => atoms.has(b.atoms[0]) && atoms.has(b.atoms[1])).map((b) => len(sub(pos(m, b.atoms[0]), pos(m, b.atoms[1])))).sort((p, q) => p - q);
  return ls.length ? ls[Math.floor(ls.length / 2)] : undefined;
}
// A paste or import from a drawing with other sizes, as ChemDraw scales it: positions are in bond lengths, so
// structures, arrows and shapes take this drawing's bond length and keep their own scale. An atom's own label size
// goes by the ratio of the label sizes; a caption's size, its own or the source's, by the ratio of the bond lengths
// (24 pt beside 30 pt bonds becomes 11.5 pt beside 14.4 pt bonds), and so do a caption's line spacing, an object's
// own line width, a table's or TLC plate's text size and a table's line weight. A caption that comes out at this
// drawing's caption size is left without a size of its own.
export function fitSizes(m: Mol, from: Pick<DocStyle, "bond" | "labelSize" | "captionSize">, to: Pick<DocStyle, "bond" | "labelSize" | "captionSize">): Mol {
  const label = to.labelSize / from.labelSize, k = to.bond / from.bond;
  if (Math.abs(label - 1) < 1e-9 && Math.abs(k - 1) < 1e-9) return m;
  const fitted = (c: Caption): Caption => {
    const own = points((c.size ?? from.captionSize) * k), { size: _, ...rest } = c;
    return { ...(Math.abs(own - to.captionSize) < 0.01 ? rest : { ...rest, size: own }), ...(c.runs ? { runs: c.runs.map((r) => (r.size ? { ...r, size: points(r.size * k) } : r)) } : {}),
      ...(typeof c.lineHeight === "number" ? { lineHeight: points(c.lineHeight * k) } : {}) };
  };
  return {
    ...m,
    atoms: m.atoms.map((a) => (a.size ? { ...a, size: points(a.size * label) } : a)),
    captions: m.captions?.map(fitted),
    arrows: m.arrows?.map((a) => pointsOf(a, k)),
    shapes: m.shapes?.map((x) => pointsOf(x, k)),
    cycles: m.cycles?.map((c) => pointsOf(c, k)),
  };
}
// Atom maps. Pairing two atoms gives both the first one's number, or the second's, or the next free number; the
// number leaves any other atom that had it. Clearing takes an atom's number off.
export function pairMap(m: Mol, a: number, b: number): Mol {
  const n = m.atoms[a].map ?? m.atoms[b].map ?? Math.max(0, ...m.atoms.map((x) => x.map ?? 0)) + 1;
  return { ...m, atoms: m.atoms.map((x, i) => (i === a || i === b ? { ...x, map: n } : x.map === n ? { ...x, map: undefined } : x)) };
}
export const clearMap = (m: Mol, i: number): Mol => ({ ...m, atoms: m.atoms.map((x, j) => (j === i ? { ...x, map: undefined } : x)) });

// Toggle Hydrogen Display, as ChemDraw's: each explicit H on a carbon among these atoms is hidden, or shown again.
// It keeps an H with a charge, an isotope, a radical or a label, an H on a stereo bond or a stereocentre, and an H
// that is not on exactly one carbon (on a heteroatom, bridging, or in a hydrogen bond).
export function toggleHydrogens(m: Mol, atoms: Iterable<number>): Mol {
  const centres = new Set(stereocentres(m)), flip = new Set<number>(), ids = [...atoms];
  // As in ChemDraw, the command works only if a structure in the selection has a bond that stays in view (no H at
  // either end) or H hidden already. Methane alone stays as it is: hiding its H would leave nothing in view.
  const isH = (k: number) => m.atoms[k].label === "H" && !m.atoms[k].text, picked = new Set(ids);
  const keeps = (g: number[]) => { const at = new Set(g); return m.bonds.some((b) => at.has(b.atoms[0]) && (b.atoms.some((k) => m.atoms[k].hidden) || !b.atoms.some(isH))); };
  if (!fragments(m).some((g) => g.some((k) => picked.has(k)) && keeps(g))) return m;
  for (const i of ids) {
    const a = m.atoms[i], bonds = m.bonds.filter((b) => b.atoms.includes(i)), b = bonds[0];
    if (a?.label !== "H" || a.text || a.charge || a.isotope || a.radical || bonds.length !== 1 || b.type !== 1 || b.stereo || b.display) continue;
    const c = b.atoms[0] === i ? b.atoms[1] : b.atoms[0];
    if (m.atoms[c].label === "C" && !m.atoms[c].text && !centres.has(c)) flip.add(i);
  }
  return flip.size ? { ...m, atoms: m.atoms.map((a, i) => (flip.has(i) ? { ...a, hidden: a.hidden ? undefined : true } : a)) } : m;
}
// Stereocentres: the atoms at the narrow end of a wedge or hashed wedge (among some atoms, if given).
export const stereocentres = (m: Mol, among?: Set<number>) =>
  [...new Set(m.bonds.filter((b) => b.stereo === 1 || b.stereo === 6).map((b) => b.atoms[0]))].filter((i) => !among || among.has(i));
// Where a small mark beside an atom goes (a stereo flag): the middle of its widest gap between
// bonds, never inside a ring when the atom has a bond out of it, and lower on a tie. For each of the atoms asked
// for, with the drawing's ring bonds found once for all of them.
export function markDirections(m: Mol, ids: number[]): Map<number, P> {
  const out = new Map<number, P>();
  if (!ids.length) return out;
  const ring = ringBonds(m), near: number[][] = m.atoms.map(() => []);
  m.bonds.forEach((b, k) => { near[b.atoms[0]].push(k); if (b.atoms[1] !== b.atoms[0]) near[b.atoms[1]].push(k); });
  for (const i of ids) {
    const here = pos(m, i);
    // Each bond's direction, and whether the first bond to that neighbour is in a ring.
    const first = new Map<number, number>(), bonds = near[i].map((k) => {
      const b = m.bonds[k], j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0];
      if (!first.has(j)) first.set(j, k);
      return { a: Math.atan2(pos(m, j)[1] - here[1], pos(m, j)[0] - here[0]), ring: ring[first.get(j)!] };
    }).sort((p, q) => p.a - q.a);
    let best: P = [0, -1], score = -Infinity;
    bonds.forEach((b, k) => {
      const next = bonds[(k + 1) % bonds.length];
      let gap = bonds.length === 1 ? 2 * Math.PI : next.a - b.a;
      if (gap <= 0) gap += 2 * Math.PI;
      const mid = b.a + gap / 2, inside = bonds.length > 2 && b.ring && next.ring && bonds.some((x) => !x.ring);
      const s = gap - (inside ? 10 : 0) - 0.01 * Math.sin(mid);
      if (s > score) { score = s; best = [Math.cos(mid), Math.sin(mid)]; }
    });
    out.set(i, best);
  }
  return out;
}
// Enhanced stereo flags on atoms: "abs", "&1" or "or1" (and 2 onwards), or none.
export const setEnhanced = (m: Mol, ids: number[], label?: string): Mol => {
  const on = new Set(ids);
  return { ...m, atoms: m.atoms.map((a, i) => (on.has(i) ? { ...a, enhanced: label } : a)) };
};
// The lowest number of an "&" (and) or "or" group that no atom among `atoms` uses, but those in `moving` (which are
// about to join the new group), as ChemDraw numbers a new group in a structure. At most 99, the most a file keeps.
export function nextGroup(m: Mol, atoms: number[], kind: "&" | "or", moving = new Set<number>()): number {
  const used = new Set<number>();
  for (const i of atoms) {
    const g = /^(&|or)(\d+)$/.exec(m.atoms[i]?.enhanced ?? "");
    if (g && g[1] === kind && !moving.has(i)) used.add(Number(g[2]));
  }
  let n = 1;
  while (used.has(n) && n < 99) n++;
  return n;
}

// TLC plate lanes, as ChemDraw's Add Lane, Duplicate Lane, Delete Lane and a drag of a lane's origin tick. A lane
// added or taken away widens or narrows the plate on its right by one lane, so every lane keeps its width, and spots
// stay in their lanes. at: where the new lane goes (0 is first); copy: the lane whose spots it takes (Duplicate).
const TLC_LANES = 40;
const widen = (sh: Shape, d: number): Shape => (sh.to[0] >= sh.from[0] ? { ...sh, to: [sh.to[0] + d, sh.to[1]] } : { ...sh, from: [sh.from[0] + d, sh.from[1]] });
export function addLane(sh: Shape, at: number, copy?: number): Shape {
  const tlc = sh.tlc ?? { lanes: 1, spots: [] };
  if (tlc.lanes >= TLC_LANES) return sh;
  const k = Math.max(0, Math.min(tlc.lanes, at)), w = Math.abs(sh.to[0] - sh.from[0]) / tlc.lanes;
  const spots = [...tlc.spots.map((x) => (x.lane >= k ? { ...x, lane: x.lane + 1 } : x)), ...(copy === undefined ? [] : tlc.spots.filter((x) => x.lane === copy).map((x) => ({ ...x, lane: k })))];
  return { ...widen(sh, w), tlc: { ...tlc, lanes: tlc.lanes + 1, spots } };
}
// A lane and its spots taken away (a plate keeps one lane).
export function deleteLane(sh: Shape, k: number): Shape {
  const tlc = sh.tlc ?? { lanes: 1, spots: [] };
  if (tlc.lanes <= 1 || k < 0 || k >= tlc.lanes) return sh;
  const w = Math.abs(sh.to[0] - sh.from[0]) / tlc.lanes;
  return { ...widen(sh, -w), tlc: { ...tlc, lanes: tlc.lanes - 1, spots: tlc.spots.filter((x) => x.lane !== k).map((x) => (x.lane > k ? { ...x, lane: x.lane - 1 } : x)) } };
}
// A lane moved to another place among the lanes, with its spots; the others close up behind it.
export function moveLane(sh: Shape, from: number, to: number): Shape {
  const tlc = sh.tlc ?? { lanes: 1, spots: [] };
  if (from === to || from < 0 || to < 0 || from >= tlc.lanes || to >= tlc.lanes) return sh;
  const order = Array.from({ length: tlc.lanes }, (_, k) => k).filter((k) => k !== from);
  order.splice(to, 0, from);
  return { ...sh, tlc: { ...tlc, spots: tlc.spots.map((x) => ({ ...x, lane: order.indexOf(x.lane) })) } };
}

// A TLC spot's style, as ChemDraw's spot styles go together: Filled, Hollow and Octet's Shaded are its fill; Dashed
// (which is hollow), Bold and Doubled (which is not dashed) are set on (on true) or off. A filled spot is not dashed.
export function restyleSpot(x: Spot, what: string, on = true): Spot {
  const out: Spot = { ...x }, off = (k: "style" | "dashed" | "bold" | "doubled") => { delete out[k]; };
  if (what === "filled") { off("style"); off("dashed"); }
  else if (what === "shaded") { out.style = "shaded"; off("dashed"); }
  else if (what === "hollow") out.style = "hollow";
  else if (what === "dashed") { if (on) { out.dashed = true; out.style = "hollow"; off("doubled"); } else off("dashed"); }
  else if (what === "doubled") { if (on) { out.doubled = true; off("dashed"); } else off("doubled"); }
  else if (what === "bold") { if (on) out.bold = true; else off("bold"); }
  return out;
}

// Tables. A new one has an Entry column numbered down its rows, under a header row.
export const newTable = (rows: number, cols: number): Table =>
  ({ cells: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (c === 0 ? (r === 0 ? "Entry" : String(r)) : ""))) });
// True when the first column counts 1, 2, 3 down the rows under the header (the entry numbers a new table has).
const counts = (cells: string[][]) => cells.length > 1 && cells.slice(1).every((r, i) => r[0] === String(i + 1));
// A table with rows or columns taken out and added at a place (at least one of each stays; at most 100 rows and 20
// columns), and its box to match: the other rows keep their heights and the other columns their widths, and a new
// column is as wide as the average one. Entry numbers in the first column are numbered again.
export function spliceTable(sh: Shape, axis: "row" | "col", at: number, remove: number, add: number, measure?: (text: string) => number, caption?: number): Partial<Shape> {
  const t = tableLayout(sh, measure, caption), table: Table = sh.table ?? { cells: [[""]] }, numbered = counts(table.cells);
  const cells = table.cells.map((r) => Array.from({ length: t.cols }, (_, c) => r[c] ?? ""));
  const widths = [...t.widths], heights = [...t.heights], align = table.align ? Array.from({ length: t.cols }, (_, c) => table.align![c] ?? "centre") : undefined;
  if (axis === "row") {
    const out = Math.min(remove, t.rows - 1), into = Math.max(0, Math.min(add, 100 - t.rows + out));
    cells.splice(at, out, ...Array.from({ length: into }, () => Array<string>(t.cols).fill("")));
    heights.splice(at, out, ...Array<number>(into).fill(t.h));
  } else {
    const out = Math.min(remove, t.cols - 1), into = Math.max(0, Math.min(add, 20 - t.cols + out)), average = widths.reduce((a, b) => a + b, 0) / t.cols;
    for (const r of cells) r.splice(at, out, ...Array<string>(into).fill(""));
    widths.splice(at, out, ...Array<number>(into).fill(average));
    align?.splice(at, out, ...Array<"centre">(into).fill("centre"));
  }
  if (numbered) { let n = 0; cells.forEach((r, i) => { if (i && (r[0] === "" || /^\d+$/.test(r[0]))) r[0] = String(++n); }); }
  const next: Table = { ...table, cells, ...(table.widths ? { widths } : {}), ...(table.heights ? { heights } : {}), ...(align ? { align } : {}) };
  const width = widths.reduce((a, b) => a + b, 0), height = heights.reduce((a, b) => a + b, 0);
  return { from: [t.x0, t.y1], to: [t.x0 + width, t.y1 - height], table: next };
}
// A table with rows and columns added or taken off the end (at least one of each).
export function resizeTable(sh: Shape, rows: number, cols: number, measure?: (text: string) => number, caption?: number): Partial<Shape> {
  const R = Math.max(1, Math.min(100, rows)), C = Math.max(1, Math.min(20, cols)), now = tableLayout(sh, measure, caption);
  const tall = { ...sh, ...spliceTable(sh, "row", Math.min(R, now.rows), Math.max(0, now.rows - R), Math.max(0, R - now.rows), measure, caption) };
  const both = { ...tall, ...spliceTable(tall, "col", Math.min(C, now.cols), Math.max(0, now.cols - C), Math.max(0, C - now.cols), measure, caption) };
  return { from: both.from, to: both.to, table: both.table };
}
// A table with its columns' widths or rows' heights set (each is kept from then on, as after dragging a border), and
// its box to match. x0 and y1 move its left and top edges. The limits follow the table's scale.
export function sizeTable(sh: Shape, size: { widths?: number[]; heights?: number[]; x0?: number; y1?: number }, measure?: (text: string) => number, caption?: number): Partial<Shape> {
  const old = tableLayout(sh, measure, caption), x0 = size.x0 ?? old.x0, y1 = size.y1 ?? old.y1, f = old.f;
  const table: Table = {
    ...sh.table!, ...(size.widths ? { widths: size.widths.map((w) => Math.max(0.2 * f, Math.min(50 * f, w))) } : {}),
    ...(size.heights ? { heights: size.heights.map((h) => Math.max(0.5 * f, Math.min(50 * f, h))) } : {}),
  };
  const t = tableLayout({ ...sh, from: [x0, y1], to: [x0 + old.x1 - old.x0, y1 - (old.y1 - old.y0)], table }, measure, caption);
  return { from: [t.x0, t.y1], to: [t.x1, t.y0], table };
}
// Size To Fit Contents: each column as wide as its text and each row the least height.
export function fitTable(sh: Shape, measure?: (text: string) => number, caption?: number): Partial<Shape> {
  const { widths: _w, heights: _h, ...table } = sh.table!, t = tableLayout({ ...sh, table }, measure, caption);
  void _w; void _h;
  return { from: [t.x0, t.y1], to: [t.x0 + t.natural.reduce((a, b) => a + b, 0), t.y1 - t.rows * tableRow(sh, caption)], table };
}
// Clear Contents: every cell empty, except the entry numbers and their header when the first column counts.
export function clearTable(sh: Shape): Partial<Shape> {
  const cells = sh.table?.cells ?? [[""]], keep = counts(cells);
  return { table: { ...sh.table!, cells: cells.map((r) => r.map((x, c) => (keep && c === 0 ? x : ""))) } };
}
// A table with one cell's text set, its box grown to fit the text if it no longer does.
export function setTableCell(sh: Shape, r: number, c: number, text: string, measure?: (text: string) => number, caption?: number): Partial<Shape> {
  const cells = (sh.table?.cells ?? [[""]]).map((row, i) => (i === r ? row.map((x, j) => (j === c ? text : x)) : row));
  const t = tableLayout({ ...sh, table: { ...sh.table, cells } }, measure, caption);
  return { from: [t.x0, t.y1], to: [t.x1, t.y0], table: { ...sh.table, cells } };
}
export const updateCaption = (m: Mol, id: number, change: Partial<Caption>): Mol =>
  ({ ...m, captions: m.captions?.map((c) => (c.id === id ? { ...c, ...change } : c)) });
// Deletes captions, arrows, shapes and cycles by id. Groups lose them too (tidyGroups). An arrow's or a cycle's text
// goes only when its own id is given; the rest stays where it is drawn (`at`, lined up as drawn: `align`), as free text
// (issue 12). An intermediate deleted from a cycle leaves a break.
export const deleteGraphics = (m: Mol, ids: Set<number>, at?: (c: Caption) => P | undefined, align?: (c: Caption) => Caption["align"]): Mol => tidyGroups({
  ...m,
  captions: m.captions?.flatMap((c) => {
    if (ids.has(c.id)) return [];
    if (c.cycle?.side === "node" && ids.has(c.cycle.cycle)) return [(({ cycle: _, ...rest }) => rest)(c)];
    if ((c.on && ids.has(c.on.arrow)) || (c.cycle && ids.has(c.cycle.cycle))) {
      const { on: _o, placed: _p, cycle: _c, ...free } = c, [x, y] = at?.(c) ?? placedAt(c, m.arrows) ?? [c.x, c.y], lined = align?.(c);
      return [{ ...free, x, y, ...(lined ? { align: lined } : {}) }];
    }
    return [c];
  }),
  arrows: m.arrows?.filter((a) => !ids.has(a.id)),
  shapes: m.shapes?.filter((x) => !ids.has(x.id)),
  cycles: m.cycles?.filter((c) => !ids.has(c.id)).map((c) => keepAngles(m, c)),
  ...(m.grids ? { grids: m.grids.filter((g) => !ids.has(g.arrow)) } : {}),
});
// Delete, Clear and the Eraser: the atoms, bonds and objects chosen go, and nothing else that shows. Text that belongs to
// a structure that goes (a compound number), and was not chosen itself, stays as free text where and as it is drawn (at,
// align), as text is its own object in ChemDraw; deleteGraphics does the same for an arrow's or a cycle's text.
export function deleteChosen(m: Mol, atoms: Set<number>, ids: Set<number>, bonds = new Set<number>(), at?: (c: Caption) => P | undefined, align?: (c: Caption) => Caption["align"]): Mol {
  const gone = (x: Mol) => deleteGraphics(erase(x, bonds, atoms), ids, at, align), out = gone(m), left = new Set(out.captions?.map((c) => c.id));
  const free = new Set((m.captions ?? []).filter((c) => !ids.has(c.id) && !left.has(c.id) && c.under).map((c) => c.id));
  if (!free.size) return out;
  return gone({ ...m, captions: m.captions!.map((c) => {
    if (!free.has(c.id)) return c;
    const { under: _u, property: _k, ...rest } = c, [x, y] = at?.(c) ?? [c.x, c.y], lined = align?.(c);
    return { ...rest, x, y, ...(lined ? { align: lined } : {}) };
  }) });
}
// The next compound number in the drawing: one more than the highest bold number already there.
export function nextNumber(m: Mol): string {
  const used = (m.captions ?? []).filter((c) => c.bold && /^\d+$/.test(c.text)).map((c) => Number(c.text));
  return String(Math.max(0, ...used) + 1);
}

// Every bond's ring flag at once (inRing for each bond): a bond is in a ring unless it is a bridge, found in one
// depth-first walk (Tarjan's bridges).
export function ringBonds(m: Mol): boolean[] {
  const near: [number, number][][] = m.atoms.map(() => []);
  m.bonds.forEach((b, k) => { near[b.atoms[0]].push([b.atoms[1], k]); near[b.atoms[1]].push([b.atoms[0], k]); });
  const order = m.atoms.map(() => -1), low = m.atoms.map(() => 0), ring = m.bonds.map(() => true);
  let t = 0;
  m.atoms.forEach((_, start) => {
    if (order[start] >= 0) return;
    order[start] = low[start] = t++;
    // Each step: an atom, the bond it was reached by, and the next of its bonds to look at.
    const stack: [number, number, number][] = [[start, -1, 0]];
    while (stack.length) {
      const top = stack[stack.length - 1], [x, via] = top;
      if (top[2] < near[x].length) {
        const [y, k] = near[x][top[2]++];
        if (k === via) continue;
        if (order[y] < 0) { order[y] = low[y] = t++; stack.push([y, k, 0]); }
        else low[x] = Math.min(low[x], order[y]);
        continue;
      }
      stack.pop();
      if (!stack.length) continue;
      const p = stack[stack.length - 1][0];
      low[p] = Math.min(low[p], low[x]);
      if (low[x] > order[p]) ring[via] = false;
    }
  });
  return ring;
}
// A bond is in a ring when its ends stay connected without it.
export function inRing(m: Mol, k: number): boolean {
  const [from, to] = m.bonds[k].atoms, seen = new Set([from]), queue = [from];
  while (queue.length) {
    const i = queue.pop()!;
    for (const [x, b] of m.bonds.entries()) {
      if (x === k || !b.atoms.includes(i)) continue;
      const j = b.atoms[0] === i ? b.atoms[1] : b.atoms[0];
      if (j === to) return true;
      if (!seen.has(j)) { seen.add(j); queue.push(j); }
    }
  }
  return false;
}

// Places a template (a structure drawn at bond length 1): fused along a clicked bond, on the open side; sharing a
// clicked atom (the template's first atom), pointing away from that atom's bonds; or centred on a point. On a bond
// or atom it takes their scale. Template atoms that land on existing atoms join them, and a template double bond on an
// atom that already had a double bond in the drawing is single (a benzene fused onto a benzene). The template's own
// cumulated double bonds stay (azide, diazo, isocyanate, sulfone). The template's atoms and bonds keep their own look (colour, labels, marks), and its
// other objects (text, arrows, shapes, cycles, groups and ring fills) come with it, moved as its atoms move (CD-33).
export function addTemplate(m: Mol, t: Mol, target: { bond?: number; atom?: number; point?: P }): Mol {
  if (!t.atoms.length) return t.captions?.length || t.arrows?.length || t.shapes?.length ? withObjects(m, t, [], (q) => add(target.point ?? [0, 0], q), 1, false) : m;
  const at0: P[] = t.atoms.map((a) => [a.location[0], a.location[1]]);
  const middle = (ps: P[]) => mul(ps.reduce((s, p) => add(s, p), [0, 0] as P), 1 / ps.length);
  // Where each point of the template goes (f), and whether it is mirrored.
  let f = (q: P): P => q, mirrored = false, scale = 1;
  // Fuse along a ring bond on the template's outside edge (the rest of it on one side), so nothing overlaps.
  const ring = t.bonds.filter((_, k) => inRing(t, k));
  const edge = ring.find((b) => {
    const a = at0[b.atoms[0]], n: P = [-(at0[b.atoms[1]][1] - a[1]), at0[b.atoms[1]][0] - a[0]], sides = at0.map((q) => dot(sub(q, a), n));
    return sides.every((d) => d > -1e-6) || sides.every((d) => d < 1e-6);
  }) ?? ring[0] ?? t.bonds[0];
  if (target.bond !== undefined && edge) {
    // Map the template's first ring bond onto the clicked bond, then mirror it off the crowded side.
    const [i, j] = m.bonds[target.bond].atoms, a = pos(m, i), b = pos(m, j);
    scale = (scaleAt(m, i) + scaleAt(m, j)) / 2;
    const e0 = at0[edge.atoms[0]], te = sub(at0[edge.atoms[1]], e0), be = sub(b, a);
    const k = len(be) / len(te), turn = Math.atan2(be[1], be[0]) - Math.atan2(te[1], te[0]);
    const fused = (q: P) => add(a, mul(rot(sub(q, e0), turn), k));
    const normal = unit([-be[1], be[0]]), side = (p: P) => Math.sign(dot(sub(p, a), normal));
    const others = [...neighbours(m, i), ...neighbours(m, j)].filter((x) => x !== i && x !== j);
    mirrored = others.reduce((s, x) => s + side(pos(m, x)), 0) * side(middle(at0.map(fused))) > 0;
    f = mirrored ? (q) => { const p = fused(q); return sub(p, mul(normal, 2 * dot(sub(p, a), normal))); } : fused;
  } else if (target.atom !== undefined) {
    const a = pos(m, target.atom), dir = nextDirection(m, target.atom), v = sub(middle(at0), at0[0]);
    const turn = len(v) > 1e-6 ? Math.atan2(dir[1], dir[0]) - Math.atan2(v[1], v[0]) : 0, from = at0[0];
    scale = scaleAt(m, target.atom);
    f = (q) => add(a, mul(rot(sub(q, from), turn), scale));
  } else {
    const c = middle(at0), to = target.point ?? [0, 0];
    f = (q) => add(to, sub(q, c));
  }
  const ids: number[] = [];
  // How much f grows the template. One drawn in perspective (a chair, a Newman projection) keeps its depth, grown as
  // much; mirrored, it turns over in 3D, so its depth changes sign and its stereochemistry is kept.
  const kz =(target.bond !== undefined && edge ? len(sub(f([1, 0]), f([0, 0]))) : scale) * (mirrored ? -1 : 1);
  for (const [k, p] of at0.map(f).entries()) {
    const before = m.atoms.length;
    let id: number;
    [m, id] = atomOrNew(m, p, scale);
    if (id >= before) {
      // A new atom takes the template atom's label, marks and look; its place and size are the drawing's.
      const { location: [, , z = 0], scale: __, order: ___, ...own } = t.atoms[k];
      m = { ...m, atoms: m.atoms.map((x, n) => (n === id ? { ...x, ...own, ...(z ? { location: [x.location[0], x.location[1], z * kz] as [number, number, number] } : {}) } : x)) };
    }
    ids.push(id);
  }
  // A multi-centre point names the atoms of its ring by number: they take their numbers in the drawing.
  t.atoms.forEach((a, k) => { if (a.centre) m = { ...m, atoms: m.atoms.map((x, n) => (n === ids[k] && x.centre ? { ...x, centre: { ...a.centre!, atoms: a.centre!.atoms.map((i) => ids[i]) } } : x)) }; });
  const drawnBonds = m.bonds, hasDouble = (i: number) => drawnBonds.some((b) => b.type === 2 && b.atoms.includes(i));
  for (const b of t.bonds) {
    const [i, j] = [ids[b.atoms[0]], ids[b.atoms[1]]];
    const type = b.type === 2 && (hasDouble(i) || hasDouble(j)) ? 1 : b.type;
    // A mirrored template keeps its stereochemistry: wedges and hashes swap.
    const stereo = mirrored && (b.stereo === 1 || b.stereo === 6) ? 7 - b.stereo : b.stereo;
    m = withBond(m, i, j, { type, ...(stereo ? { stereo } : {}), ...(b.display ? { display: b.display } : {}) });
    // The bond keeps its look too (colour, highlight, the side of its second line).
    const k = m.bonds.findIndex((x) => x.atoms.includes(i) && x.atoms.includes(j)), { colour, halo, position } = b;
    if (k >= 0 && (colour || halo || position)) m = { ...m, bonds: m.bonds.map((x, n) => (n === k ? { ...x, ...(colour ? { colour } : {}), ...(halo ? { halo } : {}), ...(position ? { position: mirrored && position !== "centre" ? (position === "left" ? "right" : "left") : position } : {}) } : x)) };
  }
  return withObjects(m, t, ids, f, Math.abs(kz), mirrored);
}
// A template's objects (text, arrows, shapes, cycles, groups) and ring fills added to the drawing with new ids, its
// atoms as ids gives them, moved by f (k: how much f grows them).
function withObjects(m: Mol, t: Mol, ids: number[], f: (q: P) => P, k: number, mirrored: boolean): Mol {
  const objects = [...(t.captions ?? []), ...(t.arrows ?? []), ...(t.shapes ?? []), ...(t.cycles ?? []), ...(t.groups ?? [])];
  if (!objects.length && !t.fills?.length) return m;
  let id = nextId(m);
  const to = new Map<number, number>(), atom = (i: number) => ids[i];
  for (const x of objects) to.set(x.id, id++);
  const out: Mol = {
    ...m,
    ...(t.captions?.length ? { captions: [...(m.captions ?? []), ...t.captions.map((c) => ({ ...c, id: to.get(c.id)!, ...(c.under ? { under: c.under.map(atom) } : {}),
      ...(c.on ? { on: { ...c.on, arrow: to.get(c.on.arrow) ?? c.on.arrow } } : {}), ...(c.cycle ? { cycle: { ...c.cycle, cycle: to.get(c.cycle.cycle) ?? c.cycle.cycle } } : {}) }))] } : {}),
    ...(t.arrows?.length ? { arrows: [...(m.arrows ?? []), ...t.arrows.map((a) => ({ ...a, id: to.get(a.id)! }))] } : {}),
    ...(t.shapes?.length ? { shapes: [...(m.shapes ?? []), ...t.shapes.map((x) => ({ ...x, id: to.get(x.id)! }))] } : {}),
    ...(t.cycles?.length ? { cycles: [...(m.cycles ?? []), ...t.cycles.map((c) => ({ ...mapBranches(c, atom), id: to.get(c.id)!, nodes: c.nodes.map((n) => n.map(atom)) }))] } : {}),
    ...(t.groups?.length ? { groups: [...(m.groups ?? []), ...t.groups.map((g) => ({ ...g, id: to.get(g.id)!, atoms: g.atoms.map(atom), items: g.items.map((x) => to.get(x) ?? x) }))] } : {}),
    ...(t.fills?.length ? { fills: [...(m.fills ?? []), ...t.fills.map((x) => ({ ...x, atoms: x.atoms.map(atom) }))] } : {}),
  };
  return transformParts(out, new Set(), new Set(to.values()), f, [k, k], undefined, 1, mirrored ? "across" : undefined);
}

// A structure, or any selection, as a template: median bond 1 (1 for no bonds), centred on the origin (its atoms'
// middle, or its objects' when it has no atoms). Everything in it comes too, but the document's style.
export function normalise(m: Mol): Mol {
  const lengths = m.bonds.map((b) => len(sub(pos(m, b.atoms[0]), pos(m, b.atoms[1])))).sort((x, y) => x - y);
  const k = 1 / (lengths[Math.floor(lengths.length / 2)] || 1), points: P[] = [...m.atoms.map((a): P => [a.location[0], a.location[1]]),
    ...(m.atoms.length ? [] : [...(m.arrows ?? []).flatMap((a) => [a.from, a.to]), ...(m.shapes ?? []).flatMap((x) => [x.from, x.to]), ...(m.captions ?? []).map((c): P => [c.x, c.y])])];
  if (!points.length) return m;
  const xs = points.map((q) => q[0]), ys = points.map((q) => q[1]), c: P = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const atoms = m.atoms.map((a) => ({ ...a, location: [(a.location[0] - c[0]) * k, (a.location[1] - c[1]) * k, (a.location[2] ?? 0) * k] as [number, number, number] }));
  const objects = [...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? [])].map((x) => x.id);
  const { style: _, guides: __, ...rest } = objects.length ? transformParts({ ...m, atoms }, new Set(), new Set(objects), (q) => [(q[0] - c[0]) * k, (q[1] - c[1]) * k], [k, k]) : { ...m, atoms };
  return Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && (!Array.isArray(v) || v.length || v === rest.atoms || v === rest.bonds))) as unknown as Mol;
}

// The turn (degrees, anticlockwise) that sets a structure's bottom ring bond level with the page: of the ring bonds
// that would end up lowest, the one needing the smallest turn. Only bonds of six-membered rings count when there are
// any, so a regular hexagon, and every bond at 120° to one, lies at a multiple of 30° (a five-membered ring hanging
// lowest would tilt them 12°). For a structure without rings, the smallest turn that sets the most bonds at a multiple
// of 30° (ChemDraw's clean up turns a structure by a multiple of 30° from its own layout, which has its bonds on that
// grid).
export function levelTurn(m: Mol, atoms: number[]): number {
  const inside = new Set(atoms), inRings = ringBonds(m), rings = m.bonds.filter((b, k) => inside.has(b.atoms[0]) && inside.has(b.atoms[1]) && inRings[k]);
  const near: number[][] = m.atoms.map(() => []);
  for (const b of rings) { near[b.atoms[0]].push(b.atoms[1]); near[b.atoms[1]].push(b.atoms[0]); }
  // In a six-membered ring: the shortest other path between the bond's atoms has 5 bonds.
  const six = (b: Mol["bonds"][number]) => {
    let front = [b.atoms[0]];
    const seen = new Set(front);
    for (let d = 1; d <= 5; d++) {
      const next: number[] = [];
      for (const x of front) for (const y of near[x]) {
        if (d === 1 && y === b.atoms[1]) continue;
        if (y === b.atoms[1]) return d === 5;
        if (!seen.has(y)) { seen.add(y); next.push(y); }
      }
      front = next;
    }
    return false;
  };
  const hexagons = rings.filter(six), ring = hexagons.length ? hexagons : rings;
  if (!ring.length) {
    const dirs = m.bonds.filter((b) => inside.has(b.atoms[0]) && inside.has(b.atoms[1])).map((b) => { const p = pos(m, b.atoms[0]), q = pos(m, b.atoms[1]); return Math.atan2(q[1] - p[1], q[0] - p[0]) / deg; });
    const off = (a: number) => (((a % 30) + 45) % 30) - 15; // degrees past the nearest multiple of 30°, in [-15, 15)
    let best = 0, most = 0;
    for (const a of dirs) {
      const t = -off(a), on = dirs.filter((d) => Math.abs(off(d + t)) < 0.01).length;
      if (on > most || (on === most && Math.abs(t) < Math.abs(best))) [best, most] = [t, on];
    }
    return Math.abs(best) < 1e-9 ? 0 : best;
  }
  const mids = ring.map((b): P => { const p = pos(m, b.atoms[0]), q = pos(m, b.atoms[1]); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  let best = 0, found = false;
  for (const [k, b] of ring.entries()) {
    const p = pos(m, b.atoms[0]), q = pos(m, b.atoms[1]);
    let t = -Math.atan2(q[1] - p[1], q[0] - p[0]) / deg;
    t = ((t % 180) + 270) % 180 - 90; // the smaller way round, in (-90, 90]
    // After this turn, is the bond at the bottom of its structure?
    const c = Math.cos(t * deg), s = Math.sin(t * deg), y = (r: P) => r[0] * s + r[1] * c;
    let lowest = Infinity;
    for (const r of mids) lowest = Math.min(lowest, y(r));
    if (y(mids[k]) > lowest + 0.05) continue;
    if (!found || Math.abs(t) < Math.abs(best)) { best = t; found = true; }
  }
  return Math.abs(best) < 1e-9 ? 0 : best;
}

// Structure Perspective. Tilts atoms through 3D about a centre: yaw turns them about the vertical axis (a drag
// across), pitch about the horizontal one (a drag up or down). Degrees; depth (z) points at the viewer.
export function tiltAtoms(m: Mol, ids: Set<number>, centre: [number, number, number], yaw: number, pitch: number): Mol {
  const [cy, sy, cp, sp] = [Math.cos((yaw * Math.PI) / 180), Math.sin((yaw * Math.PI) / 180), Math.cos((pitch * Math.PI) / 180), Math.sin((pitch * Math.PI) / 180)];
  return {
    ...m,
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const x = a.location[0] - centre[0], y = a.location[1] - centre[1], z = (a.location[2] ?? 0) - centre[2];
      const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; // about the vertical axis
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp; // then about the horizontal axis
      return { ...a, location: [centre[0] + x1, centre[1] + y2, centre[2] + z2] as [number, number, number] };
    }),
  };
}
// Turns atoms about the axis through two atoms (part of a structure about the bond that joins it), in degrees.
export function turnAboutBond(m: Mol, ids: Set<number>, from: number, to: number, degrees: number): Mol {
  const p = m.atoms[from].location, q = m.atoms[to].location, axis = [q[0] - p[0], q[1] - p[1], (q[2] ?? 0) - (p[2] ?? 0)];
  const n = Math.hypot(...axis) || 1, [ux, uy, uz] = axis.map((v) => v / n), c = Math.cos((degrees * Math.PI) / 180), s = Math.sin((degrees * Math.PI) / 180);
  return {
    ...m,
    atoms: m.atoms.map((a, i) => {
      if (!ids.has(i)) return a;
      const v = [a.location[0] - p[0], a.location[1] - p[1], (a.location[2] ?? 0) - (p[2] ?? 0)], d = ux * v[0] + uy * v[1] + uz * v[2];
      const cr = [uy * v[2] - uz * v[1], uz * v[0] - ux * v[2], ux * v[1] - uy * v[0]];
      // Rodrigues' rotation formula.
      const r = [0, 1, 2].map((k) => v[k] * c + cr[k] * s + [ux, uy, uz][k] * d * (1 - c));
      return { ...a, location: [p[0] + r[0], p[1] + r[1], (p[2] ?? 0) + r[2]] as [number, number, number] };
    }),
  };
}
// Object > Flatten: atoms keep where they are drawn and lose their depth. As in ChemDraw, depth shading stays set (it
// shows again if the structure is turned again).
export const flattenAtoms = (m: Mol, ids: Set<number>): Mol =>
  ({ ...m, atoms: m.atoms.map((a, i) => (ids.has(i) ? { ...a, location: [a.location[0], a.location[1], 0] as [number, number, number] } : a)) });
// The axis part of a structure turns about in 3D, as [atom, atom]: the one bond joining the part to the rest of its
// structure ([inside atom, outside atom]), or, when its bonds to the rest all go to the same two atoms (a
// carboxylate bridging a metal–metal bond, a ring fused on a bond), the line through those two. Else none.
export function hingeOf(m: Mol, ids: Set<number>): [number, number] | undefined {
  const joins = m.bonds.filter((b) => ids.has(b.atoms[0]) !== ids.has(b.atoms[1]));
  if (joins.length === 1) { const [a, b] = joins[0].atoms; return ids.has(a) ? [a, b] : [b, a]; }
  const outside = [...new Set(joins.map((b) => (ids.has(b.atoms[0]) ? b.atoms[1] : b.atoms[0])))];
  return outside.length === 2 ? [outside[1], outside[0]] : undefined;
}
// Atoms drawn onto a structure with depth (one turned in 3D) take the depth of the atoms they are drawn from, so a
// new bond lies in the page at its first atom's depth and later turns go on as the structure's own. New atoms are those
// past the end of prev's list that are flat (z 0); each takes the mean depth of its neighbours that have one, nearest
// first. Atoms not joined to the drawing as it was (a paste) keep theirs. Returns the same drawing when nothing changes.
export function carryDepth(prev: Mol, next: Mol): Mol {
  const n = prev.atoms.length;
  if (next.atoms.length <= n || !prev.atoms.some((a) => a.location[2])) return next;
  const nbrs: number[][] = next.atoms.map(() => []);
  for (const b of next.bonds) if (b.atoms[0] < next.atoms.length && b.atoms[1] < next.atoms.length) { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); }
  // Known depths: the atoms that were there, then the new flat atoms layer by layer out from them. A new atom that
  // came with a depth of its own (pasted from a 3D drawing) keeps it and passes none on.
  const z = next.atoms.map((a, i) => (i < n ? a.location[2] ?? 0 : undefined)), own = (i: number) => i >= n && !!next.atoms[i].location[2];
  const open = (i: number) => z[i] === undefined && !own(i) && nbrs[i].some((j) => z[j] !== undefined);
  let layer = next.atoms.map((_, i) => i).filter(open);
  while (layer.length) {
    const found = layer.map((i) => { const known = nbrs[i].filter((j) => z[j] !== undefined); return known.reduce((t, j) => t + z[j]!, 0) / known.length; });
    layer.forEach((i, k) => { z[i] = found[k]; });
    layer = [...new Set(layer.flatMap((i) => nbrs[i]))].filter(open);
  }
  const moved = (i: number) => i >= n && z[i] !== undefined && z[i] !== (next.atoms[i].location[2] ?? 0);
  if (!next.atoms.some((_, i) => moved(i))) return next;
  return { ...next, atoms: next.atoms.map((a, i) => (moved(i) ? { ...a, location: [a.location[0], a.location[1], z[i]!] as [number, number, number] } : a)) };
}
// The atom a turn of some atoms goes about, as ChemDraw's: the one atom every bond out of them leaves from (a
// substituent turns about the atom that joins it to the rest), else the one atom left out that every bond out of them
// goes to (a structure with one atom not selected turns about that atom). None when there is no such atom.
export function pivotOf(m: Mol, ids: Set<number>): number | undefined {
  const out = m.bonds.filter((b) => ids.has(b.atoms[0]) !== ids.has(b.atoms[1]));
  const one = (end: (b: Bond) => number) => { const ends = new Set(out.map(end)); return ends.size === 1 ? [...ends][0] : undefined; };
  return one((b) => (ids.has(b.atoms[0]) ? b.atoms[0] : b.atoms[1])) ?? one((b) => (ids.has(b.atoms[0]) ? b.atoms[1] : b.atoms[0]));
}

// Copy: the selected atoms (with the bonds between them) and picked objects as a drawing of their own, with the
// text that belongs to them (captions under the copied atoms, conditions on copied arrows, labels of copied cycles),
// the groups wholly inside and the stoichiometry grids of copied arrows. A picked caption whose atoms, arrow or cycle
// stay behind comes as free text at `at` (where it is drawn). Ids stay as they were; insertMol gives new ones.
export function extractSelection(m: Mol, atoms: Set<number>, items: Set<number>, at?: (c: Caption) => P | undefined, align?: (c: Caption) => Caption["align"]): Mol {
  const sel = [...atoms].filter((i) => i < m.atoms.length).sort((p, q) => p - q), map = new Map(sel.map((i, k) => [i, k]));
  const arrows = (m.arrows ?? []).filter((a) => items.has(a.id)), cycles = (m.cycles ?? []).filter((c) => items.has(c.id));
  const keep = new Set([...items, ...arrows.map((a) => a.id), ...cycles.map((c) => c.id)]);
  // A caption tied to atoms, an arrow or a cycle comes with them, or on its own when it is picked: then it is free text
  // where it was (lined up as drawn), since what it was tied to stays behind.
  const tied = (c: Caption) => (c.under ? c.under.every((i) => map.has(i)) : c.on ? keep.has(c.on.arrow) : c.cycle ? keep.has(c.cycle.cycle) : false);
  const captions = (m.captions ?? []).filter((c) => tied(c) || keep.has(c.id));
  const ids = new Set([...keep, ...captions.map((c) => c.id)]);
  // Kept ChemDraw data comes with its caption only when all its atoms come too.
  const copied = <T extends Caption | Shape>(x: T): T => {
    const k = "property" in x ? x.property : undefined;
    return remapKept(x, (i) => (k?.atoms.every((j) => map.has(j)) ? map.get(i) : undefined));
  };
  return {
    atoms: sel.map((i) => renumberCentre({ ...m.atoms[i] }, map)),
    bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] as [number, number] })),
    captions: captions.map((c) => {
      if (tied(c)) return copied({ ...c, ...(c.under ? { under: c.under.map((i) => map.get(i)!) } : {}) });
      const { under: _u, on: _o, cycle: _c, placed: _p, ...free } = c, [x, y] = at?.(c) ?? [c.x, c.y], lined = align?.(c);
      return copied({ ...free, x, y, ...(lined ? { align: lined } : {}) });
    }),
    arrows, shapes: (m.shapes ?? []).filter((x) => items.has(x.id)).map(copied),
    // A picked cycle comes as a delete would take it: an intermediate left behind is a break where it was.
    cycles: cycles.map((c) => ({ ...mapBranches(c.nodes.flat().every((i) => map.has(i)) ? c : keepAngles(m, c), (i) => map.get(i)), nodes: c.nodes.map((n) => n.flatMap((i) => (map.has(i) ? [map.get(i)!] : []))) })),
    groups: (m.groups ?? []).filter((g) => g.atoms.every((i) => map.has(i)) && g.items.every((id) => ids.has(id))).map((g) => ({ ...g, atoms: g.atoms.map((i) => map.get(i)!) })),
    fills: refill(m.fills, map),
    grids: (m.grids ?? []).filter((g) => keep.has(g.arrow)),
  };
}
// Paste: another drawing added to this one, moved by offset, with new ids for its objects. Returns the drawing, the
// new atoms and the new objects' ids, and each old id's new one. A drawing that comes with measured spectra of its own
// (a ChemDraw file) brings no spectrum, so its atoms and bonds let go of their links to them. A part of a page spectrum
// keeps its role (pageplot.ts) only when its group comes too: a label copied alone (Option-drag, Copy and Paste) is
// plain text, so the original's role stays its own and the original still takes its leader.
export function insertMol(m: Mol, add: Mol, offset: P = [0, 0]) {
  const base = m.atoms.length, at = (i: number) => base + i;
  const own = !!add.spectra?.length, unlink = <T extends { peaks?: number[] }>(x: T): T => { if (!own || !x.peaks) return x; const { peaks: _, ...rest } = x; return rest as T; };
  const grouped = new Set((add.groups ?? []).flatMap((g) => g.items)), plain = <T extends { id: number; role?: unknown }>(x: T): T => { if (!x.role || grouped.has(x.id)) return x; const { role: _, ...rest } = x; return rest as T; };
  let id = nextId(m);
  const ids = new Map<number, number>();
  for (const x of [...(add.captions ?? []), ...(add.arrows ?? []), ...(add.shapes ?? []), ...(add.cycles ?? []), ...(add.groups ?? [])]) ids.set(x.id, id++);
  const by = (q: [number, number]): [number, number] => [q[0] + offset[0], q[1] + offset[1]];
  const mol: Mol = {
    ...m,
    atoms: [...m.atoms, ...add.atoms.map((a) => renumberCentre(unlink({ ...a, location: [a.location[0] + offset[0], a.location[1] + offset[1], a.location[2] ?? 0] as [number, number, number] }), at))],
    bonds: [...m.bonds, ...add.bonds.map((b) => unlink({ ...b, atoms: [at(b.atoms[0]), at(b.atoms[1])] as [number, number] }))],
    arrows: [...(m.arrows ?? []), ...(add.arrows ?? []).map(plain).map((a) => ({ ...a, id: ids.get(a.id)!, from: by(a.from), to: by(a.to),
      ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) }))],
    shapes: [...(m.shapes ?? []), ...(add.shapes ?? []).map((x) => remapKept({ ...x, id: ids.get(x.id)!, from: by(x.from), to: by(x.to) }, at))],
    cycles: [...(m.cycles ?? []), ...(add.cycles ?? []).map((c) => ({ ...mapBranches(c, at), id: ids.get(c.id)!, centre: by(c.centre), nodes: c.nodes.map((n) => n.map(at)) }))],
    captions: [...(m.captions ?? []), ...(add.captions ?? []).map(plain).map((c) => remapKept({
      ...c, id: ids.get(c.id)!, x: c.x + offset[0], y: c.y + offset[1], ...(c.under ? { under: c.under.map(at) } : {}),
      ...(c.on ? { on: { ...c.on, arrow: ids.get(c.on.arrow) ?? c.on.arrow } } : {}), ...(c.cycle ? { cycle: { ...c.cycle, cycle: ids.get(c.cycle.cycle) ?? c.cycle.cycle } } : {}),
    }, at))],
    groups: [...(m.groups ?? []), ...(add.groups ?? []).map((g) => ({ ...g, id: ids.get(g.id)!, atoms: g.atoms.map(at), items: g.items.map((x) => ids.get(x) ?? x) }))],
    ...(add.grids?.length ? { grids: [...(m.grids ?? []), ...add.grids.flatMap((g) => (ids.has(g.arrow) ? [{ ...g, arrow: ids.get(g.arrow)! }] : []))] } : {}),
    ...(add.fills?.length ? { fills: [...(m.fills ?? []), ...add.fills.map((f) => ({ ...f, atoms: f.atoms.map(at) }))] } : {}),
  };
  return { mol, atoms: new Set(add.atoms.map((_, i) => at(i))), items: new Set([...(add.captions ?? []), ...(add.arrows ?? []), ...(add.shapes ?? []), ...(add.cycles ?? [])].map((x) => ids.get(x.id)!)), ids };
}

// Structures side by side, left to right in the order given, three bond lengths apart, their middles on one line (a list
// of names drawn by Name to Structure).
export function inRow(mols: Mol[]): Mol {
  let out: Mol = { atoms: [], bonds: [] }, x = 0;
  for (const m of mols) {
    if (!m.atoms.length) continue;
    const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]), left = Math.min(...xs);
    out = insertMol(out, m, [x - left, -(Math.min(...ys) + Math.max(...ys)) / 2]).mol;
    x += Math.max(...xs) - left + 3;
  }
  return out;
}

// Option-drag (as ChemDraw's): copies of the selection added with new ids, made as Copy and Paste make them, so the
// copies keep their groups and the text that belongs to them (a compound number, an arrow's conditions). Picked text
// whose structure, arrow or cycle is not copied is copied too, and the drag sets it free. Returns the drawing, the
// copies' atoms and ids, and each original id's copy.
export function duplicateSelection(m: Mol, atoms: Set<number>, items: Set<number>) {
  const part = extractSelection(m, atoms, items), had = new Set(part.captions?.map((c) => c.id));
  const left = (m.captions ?? []).filter((c) => items.has(c.id) && !had.has(c.id)).map(({ under: _, property: _p, ...c }) => c);
  const r = insertMol(m, { ...part, captions: [...(part.captions ?? []), ...left] });
  return { mol: r.mol, atoms: r.atoms, items: r.items, ids: r.ids };
}

// ChemDraw's Synthesis and Retrosynthesis tools: a line dragged through bonds of a
// structure cuts them. The structure, whole, is copied; the bonds the line crossed are taken out of the original, so it
// falls into pieces; and the two are laid out as a reaction on one level line with even gaps: Synthesis as the pieces
// (with plus signs between) and a reaction arrow to the structure, Retrosynthesis as the structure and a
// retrosynthetic arrow to the pieces. Bonds in aromatic rings are not cut, as in ChemDraw. Returns the drawing, the
// bonds cut, the aromatic bonds left whole, and how far the whole structure moved; undefined when the line crosses
// no bond.
export function cutReaction(m: Mol, from: P, to: P, retro: boolean): { mol: Mol; cut: number; aromatic: number; moved: P } | undefined {
  const side = (p: P, q: P, x: P) => cross(sub(q, p), sub(x, p));
  const crossed = m.bonds.flatMap((b, k) => {
    const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])];
    return b.type !== HBOND && side(from, to, p) * side(from, to, q) < 0 && side(p, q, from) * side(p, q, to) < 0 ? [k] : [];
  });
  if (!crossed.length) return undefined;
  // Aromatic atoms (Hückel, rings.ts), and so aromatic ring bonds: both ends aromatic and the bond in a ring.
  const used = m.atoms.map(() => 0);
  for (const b of m.bonds) for (const i of b.atoms) used[i] += orderOf(b.type);
  const kept = m.bonds.flatMap((b, k) => (b.type === HBOND ? [] : [k])), g = { atoms: m.atoms.map((a, i) => ({ el: a.text ? "X" : a.label, charge: a.charge ?? 0, h: a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i]) })),
    bonds: kept.map((k) => ({ a: m.bonds[k].atoms[0], b: m.bonds[k].atoms[1], order: (m.bonds[k].type === 2 || m.bonds[k].type === 3 ? m.bonds[k].type : 1) as 1 | 2 | 3 })) };
  const arom = aromaticAtoms(g), ringPairs = new Set(ringsOf(g).flatMap((r) => r.map((v, i) => [v, r[(i + 1) % r.length]].sort((x, y) => x - y).join(","))));
  const aromatic = (k: number) => m.bonds[k].type === 4 || (arom[m.bonds[k].atoms[0]] && arom[m.bonds[k].atoms[1]] && ringPairs.has([...m.bonds[k].atoms].sort((x, y) => x - y).join(",")));
  const cut = crossed.filter((k) => !aromatic(k));
  if (!cut.length) return { mol: m, cut: 0, aromatic: crossed.length, moved: [0, 0] };
  // The structures cut, copied whole, then the original's bonds taken out.
  const frags = fragments(m).filter((f) => f.some((i) => cut.some((k) => m.bonds[k].atoms.includes(i)))), atoms = new Set(frags.flat());
  const whole = subset(m, atoms), drop = new Set(cut);
  let out: Mol = { ...m, bonds: m.bonds.filter((_, k) => !drop.has(k)) };
  const copy = insertMol(out, whole);
  out = copy.mol;
  const product = [...copy.atoms], pieces = fragments(out).filter((f) => f.some((i) => atoms.has(i)));
  // The row: each part's box (its atoms, with room for a label across, as HO or OEt reads), in reading order, from
  // the original's left edge.
  const box = (ids: number[]): Box => {
    const r = (i: number) => (out.atoms[i].label === "C" && !out.atoms[i].text ? 0.25 : 0.25 + 0.3 * (out.atoms[i].text ?? out.atoms[i].label).length), ps = ids.map((i) => pos(out, i));
    return [Math.min(...ids.map((i, k) => ps[k][0] - r(i))), Math.min(...ps.map((q) => q[1])) - 0.3, Math.max(...ids.map((i, k) => ps[k][0] + r(i))), Math.max(...ps.map((q) => q[1])) + 0.3];
  };
  const start = box(pieces.flat()), level = (start[1] + start[3]) / 2, ARROW = 3, GAP = 0.8, PLUS = 1.6;
  const sorted = [...pieces].sort((p, q) => box(p)[0] + box(p)[2] - box(q)[0] - box(q)[2]);
  let x = start[0];
  const place = (ids: number[]) => { const b = box(ids); out = moveAtoms(out, new Set(ids), [x - b[0], level - (b[1] + b[3]) / 2]); x += b[2] - b[0]; };
  const row = (parts: number[][]) => parts.forEach((ids, k) => {
    if (k) { [out] = addCaption(out, { text: "+", x: x + PLUS / 2, y: level - 0.24, align: "centre" }); x += PLUS; }
    place(ids);
  });
  const arrow = () => { x += GAP; [out] = addArrow(out, { kind: retro ? "retro" : "reaction", from: [x, level], to: [x + ARROW, level] }); x += ARROW + GAP; };
  if (retro) { place(product); arrow(); row(sorted); } else { row(sorted); arrow(); place(product); }
  return { mol: out, cut: cut.length, aromatic: crossed.length - cut.length, moved: sub(pos(out, product[0]), pos(whole, 0)) };
}
