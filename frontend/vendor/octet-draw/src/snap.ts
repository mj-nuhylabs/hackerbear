// Snapping for anything moved: structures, text, arrows and shapes, alone or together. An atom dropped on an atom
// lands on it; otherwise the moving things' box lines up its edges and middle with every other object's (a box
// round a structure counts, so a structure centres in its box and a box centres round its structure).
// Distances are in bond lengths, y up.
import { fragments, pos, type P } from "./edit.ts";
import type { Mol } from "./render";

// A guide line to draw: at x (axis "x", a vertical line) or y, running from `from` to `to` on the other axis. gap: a
// mark across a space between two things, one of the spaces the move made equal.
export type Guide = { axis: "x" | "y"; at: number; from: number; to: number; gap?: true };
type Line = { at: number; lo: number; hi: number }; // a snap line and the extent of what it belongs to

const box = (ps: P[]) => {
  const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

// What a move of these atoms snaps to, worked out once for the drawing and the atoms (a drag keeps both from its first
// move to its last): where the moving atoms start, the other atoms by structure, and a grid of where those are, so
// the atom-on-atom test looks only near each moving atom. Grid cells are CELL bond lengths square.
const CELL = 0.5;
type Prepared = { ids: Set<number>; moving: P[]; others: number[][]; flat: number[]; cells: Map<number, number[]> };
const prepared = new WeakMap<Mol, Prepared>();
const cellKey = (cx: number, cy: number) => cx * 0x100000 + cy;
function prepare(m: Mol, ids: Set<number>): Prepared {
  const hit = prepared.get(m);
  if (hit?.ids === ids) return hit;
  const moving = [...ids].filter((i) => i < m.atoms.length).map((i) => pos(m, i));
  const others = fragments(m).map((g) => g.filter((i) => !ids.has(i))).filter((g) => g.length), flat = others.flat();
  const cells = new Map<number, number[]>();
  flat.forEach((i, k) => {
    const [x, y] = pos(m, i), key = cellKey(Math.floor(x / CELL), Math.floor(y / CELL));
    const cell = cells.get(key);
    if (cell) cell.push(k); else cells.set(key, [k]);
  });
  const out = { ids, moving, others, flat, cells };
  prepared.set(m, out);
  return out;
}
// Each box's snap lines on each axis, made once for each set of boxes (a drag keeps its set): edges and middles, then
// the points halfway between two boxes side by side (overlapping across the other axis). Also the lines' places in
// order (ats, with their indices in order), so a move looks only at the lines near it.
type Lines = { lines: Line[]; order: number[]; ats: Float64Array };
const lineSets = new WeakMap<number[][], [Lines, Lines]>();
function linesOf(boxes: number[][]): [Lines, Lines] {
  let sets = lineSets.get(boxes);
  if (!sets) {
    const axis = (k: 0 | 1): Lines => {
      const o = 1 - k, lines: Line[] = boxes.flatMap((b) => [b[k], (b[k] + b[k + 2]) / 2, b[k + 2]].map((at) => ({ at, lo: b[o], hi: b[o + 2] })));
      for (const a of boxes) for (const b of boxes) {
        if (a === b || a[k + 2] >= b[k] || a[o] > b[o + 2] || b[o] > a[o + 2]) continue;
        lines.push({ at: (a[k + 2] + b[k]) / 2, lo: Math.min(a[o], b[o]), hi: Math.max(a[o + 2], b[o + 2]) });
      }
      // A line at no number (a broken box) can never snap, so it is left out.
      const order = lines.map((_, i) => i).filter((i) => !Number.isNaN(lines[i].at)).sort((p, q) => lines[p].at - lines[q].at || p - q);
      return { lines, order, ats: Float64Array.from(order, (i) => lines[i].at) };
    };
    sets = [axis(0), axis(1)];
    lineSets.set(boxes, sets);
  }
  return sets;
}
// Each pair of boxes in line on an axis (they overlap across it) with nothing in line between them: the space
// between them, and where across it they overlap. Made once for each set of boxes.
type Gap = { lo: number; hi: number; across: number };
const gapSets = new WeakMap<number[][], [Gap[], Gap[]]>();
const inLine = (a: number[], b: number[], o: number) => a[o] <= b[o + 2] && b[o] <= a[o + 2];
function gapsOf(boxes: number[][]): [Gap[], Gap[]] {
  let sets = gapSets.get(boxes);
  if (!sets) {
    const axis = (k: 0 | 1): Gap[] => {
      const o = 1 - k, out: Gap[] = [];
      for (const a of boxes) {
        // a's nearest neighbour after it, in line.
        let next: number[] | undefined;
        for (const b of boxes) if (b !== a && b[k] > a[k + 2] && inLine(a, b, o) && (!next || b[k] < next[k])) next = b;
        if (next) out.push({ lo: a[k + 2], hi: next[k], across: (Math.max(a[o], next[o]) + Math.min(a[o + 2], next[o + 2])) / 2 });
      }
      return out;
    };
    sets = [axis(0), axis(1)];
    gapSets.set(boxes, sets);
  }
  return sets;
}

// The first place in ats (in order) at or past x, or past x when after is set.
function seek(ats: Float64Array, x: number, after = false): number {
  let lo = 0, hi = ats.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (after ? ats[mid] <= x : ats[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

// Moves `d` by up to `tol` so the selection lands on an atom or lines up with another object. boxes: the moving
// things' drawn box and every other object's, from the caller (labels, text and shapes included); without them,
// the boxes of the atoms.
export function snapMove(m: Mol, ids: Set<number>, d: P, tol: number, boxes?: { moving: number[]; targets: number[][] }): { d: P; guides: Guide[]; point?: P } {
  const { moving, others, flat, cells } = prepare(m, ids);
  if (boxes && !others.length) return snapBoxes(boxes.moving, boxes.targets, d, tol);
  if (!moving.length || !others.length) return { d, guides: [] };

  // An atom landing on an atom wins outright: the nearest, and of those as near, the first moving atom and then the
  // first other atom (by structure). Only the grid cells within tol of where each moving atom is now are looked in.
  let best: { gap: number; shift: P; at: P; a: number; k: number } | undefined;
  const reach = tol + 1e-9;
  moving.forEach((a, n) => {
    const x = a[0] + d[0], y = a[1] + d[1], x0 = Math.floor((x - reach) / CELL), x1 = Math.floor((x + reach) / CELL), y0 = Math.floor((y - reach) / CELL), y1 = Math.floor((y + reach) / CELL);
    // More cells than atoms (a very wide tol), or a point off the grid: every other atom is looked at.
    let near: Iterable<number> = flat.keys();
    if ((x1 - x0 + 1) * (y1 - y0 + 1) <= flat.length) {
      const ks: number[] = [];
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) for (const k of cells.get(cellKey(cx, cy)) ?? []) ks.push(k);
      near = ks;
    }
    for (const k of near) {
      const s = pos(m, flat[k]), shift: P = [s[0] - a[0] - d[0], s[1] - a[1] - d[1]], gap = Math.hypot(...shift);
      if (gap < tol && (!best || gap < best.gap || (gap === best.gap && n === best.a && k < best.k))) best = { gap, shift, at: s, a: n, k };
    }
  });
  if (best) return { d: [d[0] + best.shift[0], d[1] + best.shift[1]], guides: [], point: best.at };
  if (boxes) return snapBoxes(boxes.moving, boxes.targets, d, tol);

  // Otherwise line up outline edges and centres, each axis on its own. (Every atom as well would make
  // almost every position snap.)
  const mb = box(moving).map((v, k) => v + d[k % 2]);
  const axis = (k: 0 | 1) => {
    const lo = mb[k], hi = mb[k + 2], mid = (lo + hi) / 2;
    const refs = [lo, mid, hi];
    const targets: Line[] = others.flatMap((g) => {
      const b = box(g.map((i) => pos(m, i))), o = 1 - k;
      return [b[k], (b[k] + b[k + 2]) / 2, b[k + 2]].map((at) => ({ at, lo: b[o], hi: b[o + 2] }));
    });
    let pick: { diff: number; line: Line } | undefined;
    for (const r of refs) for (const t of targets) {
      const diff = t.at - r;
      if (Math.abs(diff) < tol && (!pick || Math.abs(diff) < Math.abs(pick.diff))) pick = { diff, line: t };
    }
    return pick;
  };
  const sx = axis(0), sy = axis(1);
  const out: P = [d[0] + (sx?.diff ?? 0), d[1] + (sy?.diff ?? 0)];
  const fb = box(moving).map((v, k) => v + out[k % 2]);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.line.at, from: Math.min(fb[1], sx.line.lo) - 0.3, to: Math.max(fb[3], sx.line.hi) + 0.3 });
  if (sy) guides.push({ axis: "y", at: sy.line.at, from: Math.min(fb[0], sy.line.lo) - 0.3, to: Math.max(fb[2], sy.line.hi) + 0.3 });
  return { d: out, guides };
}

// A box moved among others: its edges and middle line up with each other box's edges and middle, and its middle
// with the point halfway between two neighbouring boxes (where a + or a label belongs). Middles count for a little
// more than edges, so things centre when they can. moving and boxes: [left, bottom, right, top]; d: the move so far.
export function snapBoxes(moving: number[], boxes: number[][], d: P, tol: number): { d: P; guides: Guide[] } {
  if (!boxes.length) return { d, guides: [] };
  const mb = moving.map((v, k) => v + d[k % 2]);
  const axis = (k: 0 | 1) => {
    const refs = [mb[k], (mb[k] + mb[k + 2]) / 2, mb[k + 2]], { lines, order, ats } = linesOf(boxes)[k];
    // size and next: a spacing snap's space and the neighbour it is measured from.
    let pick: { diff: number; line: Line; size?: number; next?: number[] } | undefined;
    // Only the lines within tol can snap; they are taken in their own order, as a pass over every line would.
    for (const [n, r] of refs.entries()) for (const i of order.slice(seek(ats, r - tol - 1e-9), seek(ats, r + tol + 1e-9, true)).sort((p, q) => p - q)) {
      const t = lines[i], diff = t.at - r;
      // Middles count for a little more than edges, so text centres when it can.
      const weight = n === 1 ? 0.7 : 1;
      if (Math.abs(diff) < tol && (!pick || Math.abs(diff) * weight < Math.abs(pick.diff))) pick = { diff, line: t };
    }
    // Equal spacing (as Figma's and Photoshop's smart guides): the space between the moving box and its neighbour in
    // line, on either side, the same as a space between two other things in line. It wins over a line as near.
    const o = 1 - k, gaps = gapsOf(boxes)[k];
    for (const t of boxes) {
      if (!inLine(t, mb, o)) continue;
      for (const g of gaps) {
        const size = g.hi - g.lo;
        for (const diff of [t[k + 2] + size - mb[k], t[k] - size - mb[k + 2]]) {
          if (!(Math.abs(diff) < tol) || (pick && Math.abs(diff) > Math.abs(pick.diff))) continue;
          // t must be the moving box's neighbour there: nothing in line between them.
          const [from, to] = diff === t[k + 2] + size - mb[k] ? [t[k + 2], mb[k] + diff] : [mb[k + 2] + diff, t[k]];
          if (boxes.some((x) => x !== t && inLine(x, mb, o) && x[k] < to && x[k + 2] > from)) continue;
          pick = { diff, line: { at: NaN, lo: from, hi: to }, size, next: t };
        }
      }
    }
    return pick;
  };
  const sx = axis(0), sy = axis(1);
  const out: P = [d[0] + (sx?.diff ?? 0), d[1] + (sy?.diff ?? 0)];
  const fb = moving.map((v, k) => v + out[k % 2]), guides: Guide[] = [];
  // A spacing snap marks the new space and every space of the same size in line.
  const spaced = (k: 0 | 1, s: NonNullable<typeof sx>) => {
    const o = 1 - k, size = s.size!, t = s.next!, axisOf = k === 0 ? "y" : "x";
    guides.push({ axis: axisOf, at: (Math.max(fb[o], t[o]) + Math.min(fb[o + 2], t[o + 2])) / 2, from: s.line.lo, to: s.line.hi, gap: true });
    for (const g of gapsOf(boxes)[k]) if (Math.abs(g.hi - g.lo - size) < 1e-6) guides.push({ axis: axisOf, at: g.across, from: g.lo, to: g.hi, gap: true });
  };
  if (sx?.size !== undefined) spaced(0, sx);
  else if (sx) guides.push({ axis: "x", at: sx.line.at, from: Math.min(fb[1], sx.line.lo) - 0.3, to: Math.max(fb[3], sx.line.hi) + 0.3 });
  if (sy?.size !== undefined) spaced(1, sy);
  else if (sy) guides.push({ axis: "y", at: sy.line.at, from: Math.min(fb[0], sy.line.lo) - 0.3, to: Math.max(fb[2], sy.line.hi) + 0.3 });
  return { d: out, guides };
}
