// Shift numbers beside their atoms: where the Spectrum panel shows each atom's shifts and where Add to drawing > Shifts
// beside atoms puts them, so both use one placement. A number's box is tried every 10° round its atom (the middles of
// the gaps between its bonds first, out of its rings) and from close in out to 1.5 bond lengths. It must clear the bond
// ink, every atom label and every mark already placed (atom numbers, (R) and (S), text, other
// numbers): bonds by a little air, and labels, marks and the other numbers by about a word space, so two numbers never
// read as one. Failing that, it takes the place with the least overlap. The atoms with the least room go first.
// Everything is in px, y down.
import type { Box } from "./render.ts";

type P = [number, number];
// A number to place: its atom, its width, its ink above and below the baseline, and the atom's bond length (px).
export type Beside = { atom: number; w: number; up: number; down: number; L: number };
// Where it goes: its anchor (on the baseline, at the start, middle or end of the text) and its ink box.
export type Spot = { atom: number; x: number; y: number; align: "left" | "centre" | "right"; box: Box };
// What is round the atoms: each atom's place, its bonded atoms, the rings, the bond ink (polygons), each atom's label
// box, and the marks already placed.
export type Room = { at: (P | undefined)[]; bonded: number[][]; rings: number[][]; ink: P[][]; labels: (Box | undefined)[]; taken: Box[] };

// In bond lengths: the nearest and furthest the box's near edge sits from its atom, the step out, the air kept round
// the ink (against bonds), the clear gap kept to atom labels, marks and other numbers (about a word space at the
// numbers' 8 pt, never less than the air against bonds), and how far round the atom other atoms count.
const NEAR = 0.3, FAR = 1.5, OUT = 0.125, PAD = 0.06, GAP = 0.15, REACH = 3;

const meets = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const grow = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const boxOf = (ps: P[]): Box => ps.reduce<Box>((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
// How far a segment runs inside a box (Liang and Barsky's clipping).
function within(a: P, b: P, x: Box): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.max(a[0], b[0]) <= x[0] || Math.min(a[0], b[0]) >= x[2] || Math.max(a[1], b[1]) <= x[1] || Math.min(a[1], b[1]) >= x[3]) return 0;
  let t0 = 0, t1 = 1;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    return t0 < t1;
  };
  if (!clip(-dx, a[0] - x[0]) || !clip(dx, x[2] - a[0]) || !clip(-dy, a[1] - x[1]) || !clip(dy, x[3] - a[1])) return 0;
  return (t1 - t0) * Math.sqrt(dx * dx + dy * dy);
}
// How much a box overlaps polygons (the length of their edges inside it) and boxes (the area shared, over the box's
// height, as a length too).
function overlap(x: Box, polys: { ps: P[]; box: Box }[], boxes: Box[]): number {
  let sum = 0;
  for (const g of polys) if (meets(x, g.box)) for (let k = 0; k < g.ps.length; k++) sum += within(g.ps[k], g.ps[(k + 1) % g.ps.length], x);
  for (const b of boxes) if (meets(x, b)) sum += ((Math.min(x[2], b[2]) - Math.max(x[0], b[0])) * (Math.min(x[3], b[3]) - Math.max(x[1], b[1]))) / Math.max(1e-9, x[3] - x[1]);
  return sum;
}
// Whether a box overlaps any of the polygons or boxes at all.
function hits(x: Box, polys: { ps: P[]; box: Box }[], boxes: Box[]): boolean {
  for (const b of boxes) if (meets(x, b)) return true;
  for (const g of polys) if (meets(x, g.box)) for (let k = 0; k < g.ps.length; k++) if (within(g.ps[k], g.ps[(k + 1) % g.ps.length], x) > 0) return true;
  return false;
}
const turn = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// How much a direction from an atom is disliked (0 is best): far from the middle of its gap between bonds, in a narrow
// gap, into a ring of the atom, or towards the atoms round it. Also the gap middles, best first.
function liking(i: number, room: Room): { like: (a: number) => number; middles: number[] } {
  const at = room.at[i]!, bonded = room.bonded[i].filter((k) => room.at[k]), dir = (q: P) => Math.atan2(q[1] - at[1], q[0] - at[0]);
  const mine = room.rings.filter((r) => r.includes(i)), centre = (r: number[]) => { const ps = r.map((k) => room.at[k]).filter((q): q is P => !!q); return [ps.reduce((s, q) => s + q[0], 0) / ps.length, ps.reduce((s, q) => s + q[1], 0) / ps.length] as P; };
  const two = new Set([...bonded, ...bonded.flatMap((k) => room.bonded[k])]);
  two.delete(i);
  // Away from the middle of the ring's atoms (or of the atoms within two bonds); up when that middle is the atom.
  const around = (mine.length ? mine.flat() : [...two]).map((k) => room.at[k]).filter((q): q is P => !!q);
  const mid: P = around.length ? [around.reduce((s, q) => s + q[0], 0) / around.length, around.reduce((s, q) => s + q[1], 0) / around.length] : at;
  const away = Math.hypot(at[0] - mid[0], at[1] - mid[1]) > 1e-3 * (Math.abs(at[0]) + Math.abs(at[1]) + 1) ? dir([2 * at[0] - mid[0], 2 * at[1] - mid[1]]) : -Math.PI / 2;
  const angles = bonded.map((k) => dir(room.at[k]!)).sort((p, q) => p - q), inner = mine.map((r) => dir(centre(r)));
  if (angles.length === 0) return { like: (a) => (1 - Math.cos(a - away)) / 4, middles: [away] };
  if (angles.length === 1) return { like: (a) => (0.6 * (1 - Math.cos(a - angles[0] - Math.PI))) / 2, middles: [angles[0] + Math.PI] };
  const gaps = angles.map((a, k) => {
    const w = (k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI) - a, ring = inner.some((c) => ((c - a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < w);
    return { a, w, m: a + w / 2, ring };
  });
  const like = (a: number) => {
    const g = gaps.find((x) => ((a - x.a) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < x.w) ?? gaps[0];
    return (0.6 * Math.abs(turn(a - g.m))) / (g.w / 2) + 0.4 * (1 - g.w / (2 * Math.PI)) + (g.ring ? 6 : 0) - 0.15 * Math.cos(a - away);
  };
  return { like, middles: gaps.map((g) => g.m).sort((p, q) => like(p) - like(q)) };
}

export function placeBeside(texts: Beside[], room: Room): Spot[] {
  const polys = room.ink.map((ps) => ({ ps, box: boxOf(ps) })), labels = room.labels.filter((b): b is Box => !!b);
  // Each number's places, in the order they are liked, and which of them clear what is already there.
  const tries = texts.filter((t) => room.at[t.atom]).map((t) => {
    const at = room.at[t.atom]!, L = t.L, pad = PAD * L, h = t.up + t.down, { like, middles } = liking(t.atom, room);
    const others = room.at.filter((q, k): q is P => !!q && k !== t.atom && Math.abs(q[0] - at[0]) < REACH * L && Math.abs(q[1] - at[1]) < REACH * L);
    const dirs = [...middles, ...Array.from({ length: 36 }, (_, k) => (k * Math.PI) / 18 - Math.PI)], opts: { box: Box; cost: number; ux: number; clear: boolean; k: number }[] = [];
    dirs.forEach((a, d) => { for (let r = NEAR, n = 0, ux = Math.cos(a), uy = Math.sin(a), liked = like(a); r <= FAR + 1e-9; r += OUT, n++) {
      const e = r * L + Math.abs(ux) * (t.w / 2) + Math.abs(uy) * (h / 2), cx = at[0] + ux * e, cy = at[1] + uy * e;
      const box: Box = [cx - t.w / 2 - pad, cy - h / 2 - pad, cx + t.w / 2 + pad, cy + h / 2 + pad];
      // A number nearer another atom than its own reads as that atom's: it goes there only when nothing else is clear.
      const own = Math.sqrt((cx - at[0]) ** 2 + (cy - at[1]) ** 2) + 0.05 * L, theirs = others.some((q) => (cx - q[0]) ** 2 + (cy - q[1]) ** 2 < own * own);
      opts.push({ box, cost: 1.5 * (r - NEAR) + liked + (theirs ? 3 : 0), ux, clear: true, k: n * dirs.length + d });
    } });
    // What any of its places could meet: bond ink, atom labels and marks.
    const span = boxOf(opts.flatMap((o) => [[o.box[0], o.box[1]], [o.box[2], o.box[3]]] as P[]));
    // Labels and marks are grown so that with the box's own air they keep GAP clear of it.
    const near = polys.filter((g) => meets(g.box, span)), boxes = [...labels, ...room.taken].map((b) => grow(b, (GAP - PAD) * L)).filter((b) => meets(b, span));
    for (const o of opts) o.clear = !hits(o.box, near, boxes);
    opts.sort((p, q) => p.cost - q.cost || p.k - q.k);
    return { t, opts, near, boxes, span, room: opts.filter((o) => o.clear).length };
  });
  const placed: Box[] = [], out = new Map<number, Spot>();
  for (const { t, opts, near, boxes, span, room } of [...tries].sort((p, q) => p.room - q.room || p.t.atom - q.t.atom)) {
    // The best clear place; failing that, the place with the least overlap.
    const mine = placed.map((b) => grow(b, (GAP - PAD) * t.L)).filter((b) => meets(b, span));
    let best = room ? opts.find((o) => o.clear && !hits(o.box, [], mine)) : undefined;
    if (!best) {
      let least = Infinity;
      best = opts[0];
      for (const o of opts) {
        const fixed = overlap(o.box, near, boxes);
        if (fixed >= least) continue;
        const over = fixed + overlap(o.box, [], mine);
        if (over < least) { best = o; least = over; }
      }
    }
    const pad = PAD * t.L, b: Box = [best.box[0] + pad, best.box[1] + pad, best.box[2] - pad, best.box[3] - pad];
    placed.push(b);
    const align = best.ux > 0.4 ? "left" : best.ux < -0.4 ? "right" : "centre";
    out.set(t.atom, { atom: t.atom, x: align === "left" ? b[0] : align === "right" ? b[2] : (b[0] + b[2]) / 2, y: b[1] + t.up, align, box: b });
  }
  return texts.flatMap((t) => out.get(t.atom) ?? []);
}

// The atoms that already have a number beside them: text of numbers only (a shift, or shifts with commas) within 1.5
// bond lengths of the atom, its middle nearer the atom than any other atom's (nearest an atom whose own shifts read the
// same, if one is that close). With `want`, a number counts only for an atom whose shifts have as many decimals, so
// ¹³C numbers on the page (205.2) do not hide the ¹H ones (2.42).
// L: each atom's bond length (px). want: each atom's shifts as they would read.
const NUMBERS = /^[-−]?\d+(\.\d+)?(, ?[-−]?\d+(\.\d+)?)*$/;
const decimals = (text: string) => text.match(/\.(\d+)/)?.[1].length ?? 0;
export function numbered(at: (P | undefined)[], L: number[], texts: { text: string; box: Box }[], want?: Map<number, string>): Set<number> {
  const out = new Set<number>();
  for (const c of texts) {
    const text = c.text.trim(), b = c.box;
    if (!NUMBERS.test(text)) continue;
    const near = at.flatMap((p, i) => (p && Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[2]), Math.max(b[1] - p[1], 0, p[1] - b[3])) <= FAR * L[i] ? [{ i, d: Math.hypot((b[0] + b[2]) / 2 - p[0], (b[1] + b[3]) / 2 - p[1]) }] : [])).sort((p, q) => p.d - q.d);
    const same = (i: number) => !want || (want.has(i) && decimals(want.get(i)!) === decimals(text));
    const pick = near.find((x) => want?.get(x.i) === text) ?? (near[0] && same(near[0].i) ? near[0] : undefined);
    if (pick) out.add(pick.i);
  }
  return out;
}
