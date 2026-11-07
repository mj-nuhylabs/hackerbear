// Mass fragmentation (ChemDraw's Mass Fragmentation tool): the bonds a cut crosses, and the pieces it leaves on each
// side of it. As in ChemDraw, all the pieces on one side are counted together, as one formula and one exact mass, and
// a cut through ring bonds alone leaves one piece. The cut is a path (a straight line, or the arc Option draws).
import type { Mol } from "./render.ts";

type P = [number, number];
export type Piece = { atoms: number[]; formula: string; exact: number };
// One side of the cut: its pieces' atoms, their formula added up, and their exact masses added up. side: 1 is to the
// left of the cut looking from its start to its end, -1 to the right.
export type Side = { side: 1 | -1; atoms: number[]; formula: string; exact: number };

const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
// Where segment pq crosses segment ab, as the side of p (1 left of ab, -1 right), or 0 when they do not cross.
function crossing(a: P, b: P, p: P, q: P): 0 | 1 | -1 {
  const sp = cross(a, b, p), sq = cross(a, b, q);
  return sp * sq < 0 && cross(p, q, a) * cross(p, q, b) < 0 ? (sp > 0 ? 1 : -1) : 0;
}

// The bonds the path crosses, each with the side of the cut its first atom is on.
export function crossedBonds(mol: Mol, path: P[]): { bond: number; side: 1 | -1 }[] {
  const at = (i: number): P => [mol.atoms[i].location[0], mol.atoms[i].location[1]];
  const out: { bond: number; side: 1 | -1 }[] = [];
  mol.bonds.forEach((b, k) => {
    for (let s = 0; s + 1 < path.length; s++) {
      const side = crossing(path[s], path[s + 1], at(b.atoms[0]), at(b.atoms[1]));
      if (side) { out.push({ bond: k, side }); return; }
    }
  });
  return out;
}

// A formula's element counts ("C2H5O" as C 2, H 5, O 1).
function counts(formula: string): Map<string, number> {
  const n = new Map<string, number>();
  for (const [, el, d] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) n.set(el, (n.get(el) ?? 0) + (d ? Number(d) : 1));
  return n;
}
// Formulas added together, in Hill order: C, then H, then the rest alphabetically (alphabetically throughout with no C).
export function addFormulas(formulas: string[]): string {
  const n = new Map<string, number>();
  for (const f of formulas) for (const [el, k] of counts(f)) n.set(el, (n.get(el) ?? 0) + k);
  const els = [...n.keys()].sort(), order = n.has("C") ? ["C", ...(n.has("H") ? ["H"] : []), ...els.filter((e) => e !== "C" && e !== "H")] : els;
  return order.map((el) => `${el}${n.get(el)! > 1 ? n.get(el) : ""}`).join("");
}

// The sides of a cut: the pieces left by the crossed bonds (masses: the formula and exact mass of each piece, as
// fragmentMasses gives them), each on the side of the cut where its atom of a crossed bond is, added up side by side.
// The left side first. Undefined when the path crosses no bond or the pieces cannot be worked out.
export function cutSides(mol: Mol, path: P[], masses: (mol: Mol, cut: number[]) => Piece[] | undefined): Side[] | undefined {
  const crossed = crossedBonds(mol, path);
  const pieces = crossed.length ? masses(mol, crossed.map((c) => c.bond)) : undefined;
  if (!pieces?.length) return undefined;
  const pieceOf = new Map<number, number>();
  pieces.forEach((p, k) => p.atoms.forEach((i) => pieceOf.set(i, k)));
  // Each piece takes the side of the first crossed bond that reaches it.
  const sideOf = new Map<number, 1 | -1>();
  for (const c of crossed) {
    const [a, b] = mol.bonds[c.bond].atoms;
    for (const [atom, side] of [[a, c.side], [b, -c.side as 1 | -1]] as const) {
      const k = pieceOf.get(atom);
      if (k !== undefined && !sideOf.has(k)) sideOf.set(k, side);
    }
  }
  return ([1, -1] as const).flatMap((side) => {
    const mine = pieces.filter((_, k) => (sideOf.get(k) ?? 1) === side);
    return mine.length ? [{ side, atoms: mine.flatMap((p) => p.atoms), formula: addFormulas(mine.map((p) => p.formula)), exact: mine.reduce((s, p) => s + p.exact, 0) }] : [];
  });
}

// The bend (as Arrow.bend: the middle's distance off the straight line, as a fraction of its length, to the left
// looking from start to end) of the arc through a pointer's path: through its ends and the point farthest from the
// line between them. Under 4% is a straight line (0). At most 50%: a half circle.
export function bendOf(trail: P[]): number {
  if (trail.length < 3) return 0;
  const a = trail[0], b = trail[trail.length - 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return 0;
  let far = 0;
  for (const p of trail) { const d = cross(a, b, p) / len; if (Math.abs(d) > Math.abs(far)) far = d; }
  const bend = far / len;
  return Math.abs(bend) < 0.04 ? 0 : Math.max(-0.5, Math.min(0.5, bend));
}

// Mass Spec Analysis's fragmentation lines (ChemDraw's): a line has a corner where a key was pressed during the drag,
// and a drag from either end of a line makes it longer. A line with corners keeps them as a curve of straight runs.
type CutLine = { from: P; to: P; curve?: { points: { at: P }[] } };
// The points a line goes through, end to end.
export const cutPoints = (a: CutLine): P[] => (a.curve ? a.curve.points.map((q) => q.at) : [a.from, a.to]);
// A line through these points: its ends, and its corners (a curve) when it has any. A point on the one before it
// (a key pressed before the pointer moved on) is left out.
export function cutThrough(points: P[]): CutLine {
  const ps = points.filter((q, k) => !k || Math.hypot(q[0] - points[k - 1][0], q[1] - points[k - 1][1]) > 1e-9);
  return { from: ps[0], to: ps[ps.length - 1], ...(ps.length > 2 ? { curve: { points: ps.map((at) => ({ at })) } } : {}) };
}
// The line made longer from one end, through the corners added, to the pointer.
export function extendCut(a: CutLine, end: "from" | "to", corners: P[], to: P): CutLine {
  const old = cutPoints(a);
  return cutThrough([...(end === "to" ? old : old.reverse()), ...corners, to]);
}
// The end of a line within reach of p (drawing units): the line, and which end. The line drawn last wins.
export function cutEndAt<T extends CutLine & { kind: string }>(lines: T[], p: P, reach: number): { line: T; end: "from" | "to" } | undefined {
  for (const line of [...lines].reverse()) {
    if (line.kind !== "cut") continue;
    for (const end of ["to", "from"] as const) if (Math.hypot(line[end][0] - p[0], line[end][1] - p[1]) <= reach) return { line, end };
  }
  return undefined;
}
