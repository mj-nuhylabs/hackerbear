// Catalytic cycles. A cycle holds its intermediates (sets of atoms) in order around a circle. Its arc arrows,
// and the side arrows for reagents coming in and products going out, are worked out afresh from where the
// intermediates are, so editing an intermediate keeps every arrow fitted to it.
import { arrowPath, sizedHead, type Arrow, type ArrowKind, type Box, type Caption, type Head, type HeadShape, type Mol } from "./render.ts";

// A step's own settings (step s runs from node s to node s + 1). Unset is the default.
// kind: "equilibrium" draws the step as a reversible pair; ratio: as Arrow.ratio. lead and trail: extra clear space in
// points after node s and before node s + 1. bow: how far the arc's middle sits off the circle, in bond lengths (out
// is more than 0). hidden: the arc is erased, but the step keeps its side arrows and name.
export type CycleStep = { kind?: "equilibrium"; ratio?: number; lead?: number; trail?: number; bow?: number; hidden?: true };
// One end of a side arrow. along: how far round from where it meets the arc, in bond lengths (less than 0 is before
// it, for a reagent); reach: how far from the circle (less than 0 is inside it). atoms: a structure as its label. A
// text label names its branch from its caption. Neither is a bare end.
export type CycleEnd = { along?: number; reach?: number; atoms?: number[] };
// A side arrow: one swoop that meets step `step` at `meet` (a fraction along it), with a reagent coming in, a product
// going out, or both. heads: at its first and last point; unset has a head only on the way out.
export type CycleBranch = { id: number; step: number; meet?: number; in?: CycleEnd; out?: CycleEnd; heads?: [Head, Head]; colour?: string };
// sides: structures as reagents and products, as Octet 1.0.29 saved them. Read only: they become branches on load.
export type CycleSide = { atoms: number[]; side: "in" | "out" };

// scale: the cycle's size against the document style (decision 0007): its arrows, gaps and side arrows follow it.
// width: its arrows' line width in points; unset uses the document's. The scale multiplies it.
// at: each node's angle about the centre (radians, drawing units, y up). A node with no atoms is a break the user
// clicked on the circle, or a piece of text (a caption on that node); a node whose atoms all go becomes a break. A
// cycle can have any number of nodes (none is a whole circle).
// gap: the clear space between an arc's ends and an intermediate, in points; unset is GAP_PT.
// head and arrowSize: the heads of all its arrows (arcs and side arrows), as an arrow's: their shape (unset is solid) and
// palette size (unset is small, each arrow kind's own).
export type Cycle = { id: number; centre: [number, number]; radius: number; clockwise: boolean; nodes: number[][]; at: number[]; colour?: string; order?: number; scale?: number; width?: number; gap?: number;
  head?: HeadShape; arrowSize?: "large" | "medium"; steps?: (CycleStep | null)[]; branches?: CycleBranch[]; sides?: CycleSide[] };
// A cycle with its structures' atoms renumbered by `to` (undefined: the atom went). An end whose structure has gone is
// a bare end.
export function mapBranches(c: Cycle, to: (i: number) => number | undefined): Cycle {
  if (!c.branches) return c;
  const end = (e?: CycleEnd) => { if (!e?.atoms) return e; const atoms = e.atoms.map(to).filter((i): i is number => i !== undefined), { atoms: _, ...rest } = e; return atoms.length ? { ...rest, atoms } : rest; };
  return { ...c, branches: c.branches.map((b) => ({ ...b, ...(b.in ? { in: end(b.in) } : {}), ...(b.out ? { out: end(b.out) } : {}) })) };
}
// A cycle's caption: its centre label; the text label of a side arrow's end (branch) coming in or going out; the name
// of a step (node k to k + 1); or an intermediate written as text (side "node": step is the node).
// at and reach, for a step's name: how far along its step it is (0 at the start, 1 at the end) and how far from the
// circle, in bond lengths (less than 0 is inside). off: the centre label's offset from the centre, in bond lengths.
export type CycleText = { cycle: number; step: number; side: "in" | "out" | "centre" | "node" | "name"; branch?: number; at?: number; reach?: number; off?: [number, number] };
// A reagent's or product's text as Octet 1.0.29 saved it (read only: migrateCycles turns it into a branch). at and
// reach placed its end; through, meet and tail shaped its arrow.
export type OldText = CycleText & { through?: boolean; meet?: number; tail?: [number, number] };
export const sideAt = (t: CycleText) => t.at ?? 0.5;
// A reagent or product (with an arrow); one of those or a step's name (placed along a step).
export const isSide = (t?: CycleText) => t?.side === "in" || t?.side === "out";
export const onStep = (t?: CycleText) => isSide(t) || t?.side === "name";
// Where a branch meets its step, unset: half way with both ends, before the middle for a reagent alone, after it for a
// product alone.
export const meetOf = (b: CycleBranch) => b.meet ?? (b.in && b.out ? 0.5 : b.in ? 0.4 : 0.6);
export const branchHeads = (b: CycleBranch): [Head, Head] => b.heads ?? ["none", b.out ? "full" : "none"];
// A side arrow's text or bare ends, unset, are THROUGH bond lengths round from where it meets the arc, 1.1 out.
const THROUGH = 1.3;
// How far inside the arc's middle its bow handle is, in bond lengths.
const BOW_IN = 0.35;
// The most side arrows a cycle has (as the readers allow), and the furthest an end goes (bond lengths).
const MAX_BRANCHES = 64, FAR = 50;
const full = (c: Cycle) => (c.branches?.length ?? 0) >= MAX_BRANCHES;

type P = [number, number];
const GAP_PT = 6; // clear space between an arc's ends and an intermediate's ink, in pt

// Derived arrows get ids from here down, so they never meet the drawing's own ids.
const DERIVED = -1_000_000;

export type CycleLayout = {
  // branch and part: a side arrow's half, coming in or going out. caption and captionEnd: its text at its start (a
  // reagent's) and at its end (a product's).
  arrows: (Arrow & { cycle: number; step: number; branch?: number; part?: "in" | "out"; caption?: number; captionEnd?: number })[];
  // Each side arrow's handles (drawing units): where it meets the arc (T), the arc's way on there (t, a unit), and its
  // ends.
  branches: { cycle: number; branch: number; step: number; T: P; t: P; in?: P; out?: P }[];
  // Each step's arc as drawn: px, y down. It runs from angle a0 + dir * from to a0 + dir * to about centre; from0 and to0
  // are where it would run with no lead or trail. Its own circle (O, Rs: the main one unless it bows) runs from angle
  // p0 through sw (with the flow), and o is 1 where its outside is the cycle's outside, else -1. lead, trail and bow:
  // its handles (drawing units), at its start, its end and its middle.
  spans: { cycle: number; step: number; centre: P; R: number; a0: number; dir: number; from: number; to: number; from0: number; to0: number; O: P; Rs: number; p0: number; sw: number; o: number; lead: P; trail: P; bow: P }[];
  anchors: Map<number, { x: number; y: number; anchor: "start" | "middle" | "end"; wrap?: number }>; // caption id → anchor (px), and the width (px) it wraps to
};

// k: px per bond length; pt: px per point. ink: an intermediate's ink box in px (y down); text: a caption's. frame: a
// caption's box as drawn with its anchor at 0, 0, wrapped to wrap px. Without it, step names keep a fixed place.
export function layoutCycles(m: Mol, k: number, pt: number, ink: (atoms: number[]) => Box | undefined, text: (id: number) => Box | undefined = () => undefined,
  frame?: (id: number, anchor: "start" | "middle" | "end", wrap?: number) => Box | undefined): CycleLayout {
  const out: CycleLayout = { arrows: [], anchors: new Map(), spans: [], branches: [] };
  let next = DERIVED;
  for (const c of m.cycles ?? []) {
    const f = c.scale ?? 1, own = f !== 1 ? { scale: f } : {}, centre: P = [c.centre[0] * k, -c.centre[1] * k], R = c.radius * k, dir = c.clockwise ? 1 : -1;
    // A break (a node with no ink) is a point on the circle; a cycle with no nodes is one whole circle, broken at the top.
    const point = (a: number): Box => { const q: P = [centre[0] + R * Math.cos(-a), centre[1] + R * Math.sin(-a)]; return [q[0], q[1], q[0], q[1]]; };
    const said = (i: number) => { const t = textOn(m, c, i); return t ? text(t.id) : undefined; };
    const nodes = c.nodes.length ? c.nodes : [[]], boxes = nodes.map((n, i) => (n.length ? ink(n) : said(i)) ?? (c.at?.[i] !== undefined ? point(c.at[i]) : !c.nodes.length ? point(Math.PI / 2) : undefined));
    const angle = (b: Box | undefined, i: number) => (b ? Math.atan2((b[1] + b[3]) / 2 - centre[1], (b[0] + b[2]) / 2 - centre[0]) : -Math.PI / 2 + (dir * 2 * Math.PI * i) / nodes.length);
    const angles = boxes.map(angle);
    // What a step's name keeps clear of (px), and the names still to place: side, 1 outside and -1 inside; at, a place
    // g along the step r bond lengths out from the arc, and the way it faces there.
    const taken: Box[] = boxes.filter((x): x is Box => !!x), names: { id: number; g0: number; side: number; at: (g: number, r: number) => [P, number] }[] = [];
    const at = (a: number, r = R): P => [centre[0] + r * Math.cos(a), centre[1] + r * Math.sin(a)];
    const clear = (c.gap ?? GAP_PT) * f * pt;
    const inside = (p: P, b: Box | undefined) => !!b && p[0] > b[0] - clear && p[0] < b[2] + clear && p[1] > b[1] - clear && p[1] < b[3] + clear;
    const toDoc = (p: P): [number, number] => [p[0] / k, -p[1] / k];
    // A label's anchor at q (px), set by the way it faces: its start, middle or end towards q.
    const place = (id: number, q: P, facing: number) => { const cx = Math.cos(facing), sy = Math.sin(facing); out.anchors.set(id, { x: q[0], y: q[1] + (sy > 0.35 ? 10 : sy < -0.35 ? -2 : 3.5) * f * pt, anchor: cx > 0.35 ? "start" : cx < -0.35 ? "end" : "middle" }); };
    for (let s = 0; s < nodes.length; s++) {
      const t = (s + 1) % nodes.length;
      let a0 = angles[s], a1 = angles[t];
      // Travel the way the cycle turns; a two-node cycle goes half way round each time.
      let span = dir * (a1 - a0);
      while (span <= 0) span += 2 * Math.PI;
      // Leave each intermediate's ink, then stop short of the next one's.
      const step = 0.01;
      let from = 0, to = span;
      while (from < span / 2 && inside(at(a0 + dir * from), boxes[s])) from += step;
      while (to > span / 2 && inside(at(a0 + dir * to), boxes[t])) to -= step;
      const st = c.steps?.[s] ?? {}, b = f * k, from0 = from, to0 = to;
      // Too short for an arc: none is drawn, but the step keeps its place for its side arrows and name.
      if (to - from < 0.05) from = to = (from + to) / 2;
      else {
        // Extra space after the first intermediate (lead) and before the next (trail). Never into the ink, and the arc
        // keeps 0.8 b where the step has room for it.
        const g = c.gap ?? GAP_PT, room = to - from - Math.min((0.8 * b) / R, to - from);
        let l = (Math.max(-g, st.lead ?? 0) * f * pt) / R, r = (Math.max(-g, st.trail ?? 0) * f * pt) / R;
        if (l + r > room) { const x = room / (l + r); l *= x; r *= x; }
        from += l; to -= r;
      }
      // A bowed arc's middle sits bow b off the circle (no more than 0.9 R), on a circle of its own through its ends.
      const aM = a0 + dir * (from + to) / 2, bow = to > from ? Math.max(-0.9 * R, Math.min(0.9 * R, (st.bow ?? 0) * b)) : 0, A = at(a0 + dir * from), B = at(a0 + dir * to), mid = at(aM, R + bow);
      const bent = bow ? circleThrough(A, mid, B) : undefined, O = bent?.O ?? centre, Rs = bent?.R ?? R, pA = Math.atan2(A[1] - O[1], A[0] - O[0]);
      const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), pB = turn(Math.atan2(B[1] - O[1], B[0] - O[0]) - pA);
      const sw = bent ? (turn(Math.atan2(mid[1] - O[1], mid[0] - O[0]) - pA) < pB ? pB : pB - 2 * Math.PI) : dir * (to - from);
      const o = bent && (mid[0] - O[0]) * Math.cos(aM) + (mid[1] - O[1]) * Math.sin(aM) < 0 ? -1 : 1, sd = Math.sign(sw) || dir;
      // The bow handle sits a little inside the arc's middle, so the arc there is free to pull a side arrow from.
      out.spans.push({ cycle: c.id, step: s, centre, R, a0, dir, from, to, from0, to0, O, Rs, p0: pA, sw, o, lead: toDoc(A), trail: toDoc(B), bow: toDoc(at(aM, Math.max(0, R + bow - BOW_IN * b))) });
      // A place on the arc's own circle at angle ph, or g along the arc, dr out from it (out of the cycle).
      const ring = (ph: number, dr = 0): P => [O[0] + (Rs + o * dr) * Math.cos(ph), O[1] + (Rs + o * dr) * Math.sin(ph)], on = (g: number, dr = 0) => ring(pA + sw * g, dr);
      const style = { cycle: c.id, step: s, ...(c.colour ? { colour: c.colour } : {}), ...(c.order ? { order: c.order } : {}), ...own, ...(c.width ? { width: c.width } : {}), ...(c.head ? { head: c.head } : {}) };
      // The cycle's head size, for an arrow of this kind (an arc's small head is smaller than a straight arrow's).
      const sized = (kind: ArrowKind) => (c.arrowSize ? { headSize: sizedHead({ kind }, c.arrowSize) } : {});
      // A reversible step is a pair of half-headed arcs either side of the circle (render.ts); a hidden one has none.
      const pair = st.kind === "equilibrium", ratio = pair && st.ratio && st.ratio !== 1 ? { ratio: st.ratio } : {};
      if (to > from && !st.hidden) out.arrows.push({ id: next--, kind: pair ? "equilibrium" : "curved", from: toDoc(A), to: toDoc(B), bend: bendFor(A, B, mid), ...(pair ? { point: true as const, ...ratio } : {}), ...style, ...sized(pair ? "equilibrium" : "curved") });
      // Side arrows: each meets its step at T, along the arc there (flow t), and swoops out to each end E on a circle
      // through E that touches the arc at T. A reagent's half runs in to T; a product's leaves it.
      const mine = (c.branches ?? []).filter((x) => x.step === s), label = (br: CycleBranch, part: "in" | "out") => (m.captions ?? []).find((x) => x.cycle?.cycle === c.id && x.cycle.branch === br.id && x.cycle.side === part);
      // How far out of the cycle an end is (less than 0 inside): a structure's middle, else its reach.
      const facing = (e: CycleEnd) => { const bx = e.atoms?.length ? ink(e.atoms) : undefined; return bx ? o * (Math.hypot((bx[0] + bx[2]) / 2 - O[0], (bx[1] + bx[3]) / 2 - O[1]) - Rs) : e.reach ?? 1.1; };
      // An unbalanced reversible step draws one half shorter (render.ts): the forward half on the side sd points to,
      // the back half shorter above 1. A side arrow facing the shorter half meets it only where it is drawn.
      const r = pair ? st.ratio ?? 1 : 1, q = r > 1 ? 1 / r : r;
      for (const br of mine) {
        const e0 = br.in ?? br.out, short = q < 1 && !!e0 && ((Math.sign(facing(e0)) || 1) * o * sd > 0) === r < 1, g = short ? Math.min((1 + q) / 2, Math.max((1 - q) / 2, meetOf(br))) : meetOf(br);
        const pT = pA + sw * g, up: P = [o * Math.cos(pT), o * Math.sin(pT)], t: P = [-sd * Math.sin(pT), sd * Math.cos(pT)];
        let T = on(g);
        const endAt = (part: "in" | "out"): P | undefined => {
          const e = br[part], bx = e?.atoms?.length ? ink(e.atoms) : undefined;
          if (!e) return undefined;
          if (bx) {
            // From the structure's middle towards T, just clear of its ink. One touching the arc still gets an arrow,
            // at least 0.3 b long, back towards the structure.
            const mid: P = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], len = Math.hypot(T[0] - mid[0], T[1] - mid[1]), u: P = len ? [(T[0] - mid[0]) / len, (T[1] - mid[1]) / len] : [-up[0], -up[1]];
            let d = 0;
            while (d < len && mid[0] + u[0] * d > bx[0] - clear && mid[0] + u[0] * d < bx[2] + clear && mid[1] + u[1] * d > bx[1] - clear && mid[1] + u[1] * d < bx[3] + clear) d += 0.5;
            return len - d < 0.3 * b ? [T[0] - u[0] * 0.3 * b, T[1] - u[1] * 0.3 * b] : [mid[0] + u[0] * d, mid[1] + u[1] * d];
          }
          // Inside, an end is no nearer the middle than a fifth of the radius.
          const al = part === "in" ? Math.min(-0.25, e.along ?? -THROUGH) : Math.max(0.25, e.along ?? THROUGH), re = e.reach ?? 1.1;
          const E = ring(pT + (sd * al * b) / Rs, (Math.abs(re) < 0.4 ? Math.sign(re || 1) * 0.4 : re) * b), d = Math.hypot(E[0] - centre[0], E[1] - centre[1]);
          return d < 0.2 * R ? [centre[0] + ((E[0] - centre[0]) * 0.2 * R) / (d || 1), centre[1] + ((E[1] - centre[1]) * 0.2 * R) / (d || 1)] : E;
        };
        // The circle through E touching the arc at T: its middle M and its way on at E, away from T. An E too near the
        // arc goes out to 0.15 b; one on the wrong side of T (before it for a product, after it for a reagent) turns
        // to level with T, as far from it, so the swoop goes no more than half way round.
        const swoop = (E: P, part: "in" | "out") => {
          const sgn = Math.sign((E[0] - T[0]) * up[0] + (E[1] - T[1]) * up[1]) || 1, n: P = [up[0] * sgn, up[1] * sgn], w = (E[0] - T[0]) * t[0] + (E[1] - T[1]) * t[1], wrong = part === "in" ? w > 0 : w < 0;
          if (wrong) { const l = Math.hypot(E[0] - T[0], E[1] - T[1]); E = [T[0] + n[0] * l, T[1] + n[1] * l]; }
          let d = (E[0] - T[0]) * n[0] + (E[1] - T[1]) * n[1];
          if (d < 0.15 * b) { E = [E[0] + n[0] * (0.15 * b - d), E[1] + n[1] * (0.15 * b - d)]; d = 0.15 * b; }
          const rho = ((E[0] - T[0]) ** 2 + (E[1] - T[1]) ** 2) / (2 * d), C: P = [T[0] + n[0] * rho, T[1] + n[1] * rho], v: P = [(E[0] + T[0]) / 2 - C[0], (E[1] + T[1]) / 2 - C[1]], lv = Math.hypot(...v);
          // Level with T, it is a half circle: on round the way the arc runs for a product, back from it for a reagent.
          const half = wrong || lv < 1e-6 * rho, way = part === "out" ? rho : -rho;
          const M: P = half ? [C[0] + way * t[0], C[1] + way * t[1]] : [C[0] + (rho * v[0]) / lv, C[1] + (rho * v[1]) / lv], r: P = [E[1] - C[1], C[0] - E[0]], lr = Math.hypot(...r) || 1, on = Math.sign(r[0] * (E[0] - M[0]) + r[1] * (E[1] - M[1])) || 1;
          return { E, M, away: [(on * r[0]) / lr, (on * r[1]) / lr] as P };
        };
        const [h0, h1] = branchHeads(br), heads = (h: Head, e: Head) => ({ ...(h !== "none" ? { start: h } : {}), ...(e !== "full" ? { end: e } : {}) });
        const drawn = { ...style, ...sized("curved"), ...(br.colour ? { colour: br.colour } : {}), branch: br.id }, ei = endAt("in"), eo = endAt("out"), li = label(br, "in"), lo = label(br, "out");
        // On a reversible step, T moves onto the half of the pair facing the ends.
        const E0 = ei ?? eo;
        if (pair && E0) { const g = (Math.sign((E0[0] - T[0]) * up[0] + (E0[1] - T[1]) * up[1]) || 1) * 0.11 * b; T = [T[0] + up[0] * g, T[1] + up[1] * g]; }
        const ends: Partial<Record<"in" | "out", P>> = {}, away: Partial<Record<"in" | "out", P>> = {};
        if (ei) { const { E, M, away: w } = swoop(ei, "in"); ends.in = E; away.in = w; out.arrows.push({ id: next--, kind: "curved", from: toDoc(E), to: toDoc(T), bend: bendFor(E, T, M), ...drawn, part: "in", ...heads(h0, eo ? "none" : h1), ...(li ? { caption: li.id } : {}) }); }
        if (eo) { const { E, M, away: w } = swoop(eo, "out"); ends.out = E; away.out = w; out.arrows.push({ id: next--, kind: "curved", from: toDoc(T), to: toDoc(E), bend: bendFor(T, E, M), ...drawn, part: "out", ...heads(ei ? "none" : h0, h1), ...(lo ? { captionEnd: lo.id } : {}) }); }
        out.branches.push({ cycle: c.id, branch: br.id, step: s, T: toDoc(T), t: [t[0], -t[1]], ...(ends.in ? { in: toDoc(ends.in) } : {}), ...(ends.out ? { out: toDoc(ends.out) } : {}) });
        // Text goes just beyond its end, the way its swoop runs on from there.
        for (const [part, cap] of [["in", li], ["out", lo]] as const) {
          const E = ends[part], w = away[part];
          if (E && w && cap) place(cap.id, [E[0] + w[0] * clear, E[1] + w[1] * clear], Math.atan2(w[1], w[0]));
        }
      }
      // A step's name: half way along it, outside, or inside where a side arrow is outside. One placed by hand (reach
      // set) goes where it was put; the others go once everything else on the cycle is placed.
      for (const cap of m.captions ?? []) {
        if (cap.cycle?.cycle !== c.id || cap.cycle.step !== s || cap.cycle.side !== "name") continue;
        const reach = cap.cycle.reach ?? (mine.some((x) => [x.in, x.out].some((e) => e && facing(e) > 0)) ? -0.6 : 0.6), g0 = sideAt(cap.cycle);
        const way = (g: number, r: number) => { const pN = pA + sw * g, aN = Math.atan2(o * Math.sin(pN), o * Math.cos(pN)); return r < 0 ? aN + Math.PI : aN; };
        if (cap.cycle.reach === undefined && frame) names.push({ id: cap.id, g0, side: Math.sign(reach), at: (g, r) => [on(g, r * b), way(g, r)] });
        else place(cap.id, on(g0, reach * b), way(g0, reach));
      }
      for (const br of mine) for (const e of [br.in, br.out]) { const bx = e?.atoms?.length ? ink(e.atoms) : undefined; if (bx) taken.push(bx); }
    }
    for (const cap of m.captions ?? []) if (cap.cycle?.cycle === c.id && cap.cycle.side === "centre") { const o = cap.cycle.off ?? [0, 0]; out.anchors.set(cap.id, { x: centre[0] + o[0] * f * k, y: centre[1] - o[1] * f * k + 3.5 * f * pt, anchor: "middle" }); }
    // The names left: each clear of the intermediates, the side arrows and their structures and text, the centre
    // label, the names placed before it and the circle. A name tries its own side of the arc, then the other, on one
    // line or wrapped onto two or three, along its step and out from the arc. Of the places that are clear it takes the
    // one nearest half way along its own side, on the fewest lines; where none is, the one that overlaps least.
    if (!names.length) continue;
    for (const cap of m.captions ?? []) { const a = cap.cycle?.cycle === c.id ? out.anchors.get(cap.id) : undefined, fb = a && frame!(cap.id, a.anchor, a.wrap); if (fb) taken.push([fb[0] + a.x, fb[1] + a.y, fb[2] + a.x, fb[3] + a.y]); }
    const pad = clear / 2, area = (p: Box, q: Box) => Math.max(0, Math.min(p[2], q[2]) - Math.max(p[0], q[0]) + pad) * Math.max(0, Math.min(p[3], q[3]) - Math.max(p[1], q[1]) + pad);
    // The side arrows' points, all but where they run along the circle (keeping clear of that is the circle's job).
    const swoops = out.arrows.filter((a) => a.cycle === c.id && a.branch !== undefined).flatMap((a) => arrowPath(a, k)).filter((p) => Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - R) > pad);
    for (const n of names) {
      const one = frame!(n.id, "middle");
      if (!one) continue;
      const w0 = one[2] - one[0], words = (m.captions!.find((x) => x.id === n.id)!.text.trim().match(/ /g) ?? []).length;
      const wraps = [undefined, ...(words ? [0.6 * w0] : []), ...(words > 1 ? [0.4 * w0] : [])];
      let best: { a: { x: number; y: number; anchor: "middle"; wrap?: number }; box: Box; cost: number } | undefined;
      wraps.forEach((wrap, wi) => {
        const fb = wrap ? frame!(n.id, "middle", wrap) : one;
        if (!fb) return;
        const hw = (fb[2] - fb[0]) / 2, hh = (fb[3] - fb[1]) / 2;
        for (const side of [n.side, -n.side]) for (const dg of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3]) {
          const g = Math.min(0.9, Math.max(0.1, n.g0 + dg)), [q, a] = n.at(g, 0.6 * side), u: P = [Math.cos(a), Math.sin(a)];
          const boxAt = (d: number): Box => [q[0] + u[0] * d - hw, q[1] + u[1] * d - hh, q[0] + u[0] * d + hw, q[1] + u[1] * d + hh];
          // Wholly on its side of the circle: inside, every corner within it; outside, its nearest point beyond it.
          const across = (x: Box) => side < 0 ? Math.max(...[[x[0], x[1]], [x[2], x[1]], [x[0], x[3]], [x[2], x[3]]].map(([p, q]) => Math.hypot(p - centre[0], q - centre[1]))) > R - pad
            : Math.hypot(Math.max(x[0] - centre[0], 0, centre[0] - x[2]), Math.max(x[1] - centre[1], 0, centre[1] - x[3])) < R + pad;
          // Its middle steps away from the arc from q until it is wholly on its side, then tries further out, up to 2 bond
          // lengths (past a side arrow's text, where that is all that is clear).
          let d0 = 0;
          while (d0 < 2 * R && across(boxAt(d0))) d0 += 2;
          for (const deep of [0, 0.4, 0.8, 1.2, 1.6, 2]) {
            const d = d0 + deep * f * k, box = boxAt(d), C: P = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
            const hit = taken.reduce((sum, t) => sum + area(box, t), 0) + swoops.filter((p) => p[0] > box[0] - pad && p[0] < box[2] + pad && p[1] > box[1] - pad && p[1] < box[3] + pad).length * pad * pad + (across(box) ? hw * hh : 0);
            const cost = hit * 1e3 + wi + Math.abs(dg) * 10 + (d / (f * k)) * 3 + (side === n.side ? 0 : 5);
            if (!best || cost < best.cost) best = { a: { x: C[0] - (fb[0] + fb[2]) / 2, y: C[1] - (fb[1] + fb[3]) / 2, anchor: "middle", ...(wrap ? { wrap } : {}) }, box, cost };
          }
        }
      });
      if (best) { out.anchors.set(n.id, best.a); taken.push(best.box); }
    }
  }
  return out;
}

// The circle through three points.
function circleThrough(A: P, M: P, B: P): { O: P; R: number } {
  const d0 = 2 * (A[0] * (M[1] - B[1]) + M[0] * (B[1] - A[1]) + B[0] * (A[1] - M[1])), d = (Math.sign(d0) || 1) * Math.max(Math.abs(d0), 1e-6), q = (p: P) => p[0] * p[0] + p[1] * p[1];
  const O: P = [(q(A) * (M[1] - B[1]) + q(M) * (B[1] - A[1]) + q(B) * (A[1] - M[1])) / d, (q(A) * (B[0] - M[0]) + q(M) * (A[0] - B[0]) + q(B) * (M[0] - A[0])) / d];
  return { O, R: Math.hypot(A[0] - O[0], A[1] - O[1]) };
}
// The bend (see render.ts) of a curve from A to B through M: M's offset to the left of A→B, as a fraction of |AB|.
// Points are in px with y down, where n is the left of A→B as drawn: the same side as in drawing coordinates.
function bendFor(A: P, B: P, M: P): number {
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, n: P = [(B[1] - A[1]) / len, -(B[0] - A[0]) / len];
  // arrowPath draws the arc through M, so the cycle's arrows follow its circle.
  return ((M[0] - (A[0] + B[0]) / 2) * n[0] + (M[1] - (A[1] + B[1]) / 2) * n[1]) / len;
}

// Where each intermediate should go: evenly round a circle, starting at the top and turning the cycle's way, on a
// radius big enough that no two intermediates come closer than about two bonds. Returns each node's shift (drawing
// units) and the radius (bond lengths).
export function spreadCycle(c: Cycle, k: number, ink: (atoms: number[], i: number) => Box | undefined): { shifts: P[]; radius: number } {
  const n = c.nodes.length, boxes = c.nodes.map((x, i) => ink(x, i));
  const size = Math.max(...boxes.map((b) => (b ? Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 : k)));
  const radius = Math.max(2.5 * k, (2 * size + 2 * k) / (2 * Math.sin(Math.PI / Math.max(n, 2)))) / k;
  const centre: P = [c.centre[0] * k, -c.centre[1] * k];
  const shifts = boxes.map((b, i): P => {
    const a = -Math.PI / 2 + ((c.clockwise ? 1 : -1) * 2 * Math.PI * i) / n;
    const target: P = [centre[0] + radius * k * Math.cos(a), centre[1] + radius * k * Math.sin(a)];
    const now: P = b ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : target;
    return [(target[0] - now[0]) / k, -(target[1] - now[1]) / k];
  });
  return { shifts, radius };
}

// Orders intermediates by their angle around their middle, clockwise from the top (as they read on screen).
export function orderAround(centre: P, items: { atoms: number[]; middle: P }[]): number[][] {
  const angle = (p: P) => { const a = Math.atan2(-(p[1] - centre[1]), p[0] - centre[0]); return (a + Math.PI / 2 + 4 * Math.PI) % (2 * Math.PI); };
  return [...items].sort((a, b) => angle(a.middle) - angle(b.middle)).map((x) => x.atoms);
}

export const isCycleText = (c: Caption) => !!c.cycle;

// The Cycle tool. A structure's atoms' box and its middle (drawing units).
const boxOf = (m: Mol, atoms: number[]): Box | undefined => {
  const ps = atoms.flatMap((i) => (m.atoms[i] ? [m.atoms[i].location] : []));
  if (!ps.length) return undefined;
  const xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const middleOf = (m: Mol, atoms: number[]): P | undefined => { const b = boxOf(m, atoms); return b && [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };
// The text written as node i of a cycle.
export const textOn = (m: Mol, c: Cycle, i: number) => m.captions?.find((t) => t.cycle?.cycle === c.id && t.cycle.side === "node" && t.cycle.step === i);
export const angleAbout = (c: Cycle, p: P) => Math.atan2(p[1] - c.centre[1], p[0] - c.centre[0]);
// Each node's angle: where its structure is, or its saved angle.
const anglesOf = (m: Mol, c: Cycle) => c.nodes.map((n, i) => { const t = n.length ? undefined : textOn(m, c, i), q = t ? [t.x, t.y] as P : middleOf(m, n); return q ? angleAbout(c, q) : (c.at?.[i] ?? Math.PI / 2); });
// A cycle with every node's angle saved as it is now (before its atoms go).
export const keepAngles = (m: Mol, c: Cycle): Cycle => ({ ...c, at: anglesOf(m, c) });
// How far round from node 0 an angle is, going the way the cycle turns (clockwise on screen is down in angle).
const round = (c: Cycle, from: number, a: number) => { const d = (c.clockwise ? from - a : a - from) % (2 * Math.PI); return d < 0 ? d + 2 * Math.PI : d; };
// The step an angle is on: node k to k + 1. A cycle with no nodes has one step.
export function stepAt(m: Mol, c: Cycle, a: number): number {
  const angles = anglesOf(m, c);
  if (angles.length < 2) return 0;
  const t = round(c, angles[0], a), next = angles.findIndex((x, k) => k > 0 && round(c, angles[0], x) > t);
  return next < 0 ? angles.length - 1 : next - 1;
}
// The break nearest an angle, within tol radians.
export function breakAt(m: Mol, c: Cycle, a: number, tol: number): number | undefined {
  const angles = anglesOf(m, c);
  let best: number | undefined, d = tol;
  c.nodes.forEach((n, k) => { if (n.length || textOn(m, c, k)) return; const e = Math.abs(((angles[k] - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (e <= d) { d = e; best = k; } });
  return best;
}
// Each step's start (an angle) and length (radians, the way the cycle turns), from node to node. A cycle with no
// nodes is one step from the top all the way round.
const stepsOf = (m: Mol, c: Cycle) => { const a = anglesOf(m, c), n = a.length; return n ? a.map((x, s) => ({ start: x, len: n < 2 ? 2 * Math.PI : round(c, x, a[(s + 1) % n]) || 2 * Math.PI })) : [{ start: Math.PI / 2, len: 2 * Math.PI }]; };
// A step's settings with no defaults left in, or null.
const tidyStep = (x: CycleStep): CycleStep | null => { const y = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as CycleStep; return Object.keys(y).length ? y : null; };
// Adds a node (a structure, or a break when atoms is empty) at an angle, or takes node j out. A node added splits the
// step it lands on; one taken out joins its two steps into one. Everything on a step (side arrows, names) stays where
// it is round the circle, on whichever step is there now, and the steps after move on or back by one. lay: the cycles
// laid out, so a place on a step split or joined keeps its place along the arc as drawn (its fractions are of the arc
// between the ink, not from node to node).
export function resplice(m: Mol, id: number, op: { add: number; atoms: number[] } | { remove: number }, lay?: (m: Mol) => CycleLayout): Mol {
  const c = m.cycles?.find((x) => x.id === id);
  if (!c) return m;
  const old = stepsOf(m, c), angles = anglesOf(m, c), n = c.nodes.length, steps: (CycleStep | null)[] = [];
  // Where a place on old step s, g along it (node to node), is now: [step, fraction]. split: the steps it changes.
  let to: (s: number, g: number) => [number, number], node: (k: number) => number | undefined, cycle: Cycle, split: (s: number) => boolean;
  if ("remove" in op) {
    const j = op.remove, a = (j - 1 + n) % n, sum = old[a].len + old[j].len, joined = n <= 2 ? 0 : j === 0 ? n - 2 : j - 1;
    split = (s) => n < 2 || s === a || s === j;
    // Down to no nodes: one step from the top all the way round.
    to = n < 2 ? (_, g) => [0, round(c, Math.PI / 2, c.clockwise ? old[0].start - g * old[0].len : old[0].start + g * old[0].len) / (2 * Math.PI)]
      : (s, g) => (s === a ? [joined, (g * old[a].len) / sum] : s === j ? [joined, (old[a].len + g * old[j].len) / sum] : [s > j ? s - 1 : s, g]);
    node = (k) => (k === j ? undefined : k > j ? k - 1 : k);
    old.forEach((_, s) => { if (s !== a && s !== j) steps[to(s, 0)[0]] = c.steps?.[s] ?? null; });
    // The joined step is reversible only if both were, and hidden only if both were.
    const p = c.steps?.[a] ?? {}, q = c.steps?.[j] ?? {}, both = p.kind === "equilibrium" && q.kind === "equilibrium";
    if (n > 1) steps[joined] = tidyStep({ kind: both ? "equilibrium" : undefined, ratio: both ? p.ratio : undefined, lead: p.lead, trail: q.trail, hidden: p.hidden && q.hidden ? true : undefined });
    cycle = { ...c, nodes: c.nodes.filter((_, k) => k !== j), at: angles.filter((_, k) => k !== j) };
  } else {
    const s0 = n ? stepAt(m, c, op.add) : 0, ts = round(c, old[s0].start, op.add), j = n ? s0 + 1 : 0;
    split = (s) => s === s0;
    to = (s, g) => {
      if (s !== s0) return [s > s0 ? s + 1 : s, g];
      const t = g * old[s].len;
      if (!n) return [0, (((t - ts) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI)];
      return t < ts ? [s0, t / ts] : [s0 + 1, (t - ts) / (old[s].len - ts || 1)];
    };
    node = (k) => (k >= j ? k + 1 : k);
    old.forEach((_, s) => { if (s !== s0) steps[to(s, 0)[0]] = c.steps?.[s] ?? null; });
    // Both halves keep the step's kind, ratio, bow and hidden; the first its lead, the second its trail.
    const { lead, trail, ...rest } = c.steps?.[s0] ?? {};
    steps[s0] = tidyStep({ ...rest, lead });
    if (n) steps[s0 + 1] = tidyStep({ ...rest, trail });
    cycle = { ...c, nodes: [...c.nodes.slice(0, j), op.atoms, ...c.nodes.slice(j)], at: [...angles.slice(0, j), op.add, ...angles.slice(j)] };
  }
  const { steps: _s, branches: _b, ...base } = cycle, kept = Array.from({ length: Math.max(cycle.nodes.length, 1) }, (_, s) => steps[s] ?? null);
  // Laid out, a place on a step it changes goes from its fraction of the arc as drawn to node to node, and back after.
  const span = (x: CycleLayout | undefined, s: number) => x?.spans.find((y) => y.cycle === id && y.step === s), before = lay?.(m), moved = new Set<number>();
  const place = (s: number, g: number, key: number): [number, number] => {
    const x = span(before, s);
    if (!split(s) || !x || !old[s].len) return to(s, g);
    moved.add(key);
    return to(s, (x.from + g * (x.to - x.from)) / old[s].len);
  };
  const branches = c.branches?.map((b) => { const [step, g] = place(b.step, meetOf(b), b.id); return { ...b, step, ...(g !== meetOf(b) ? { meet: g } : {}) }; });
  cycle = { ...base, ...(kept.some(Boolean) ? { steps: kept } : {}), ...(branches?.length ? { branches } : {}) };
  const out: Mol = {
    ...m,
    cycles: m.cycles?.map((x) => (x.id === id ? cycle : x)),
    captions: m.captions?.map((t) => {
      const y = t.cycle;
      if (y?.cycle !== id || y.side === "centre") return t;
      if (y.side === "node") { const k = node(y.step); return k === undefined ? (({ cycle: _, ...rest }) => rest)(t) : k === y.step ? t : { ...t, cycle: { ...y, step: k } }; }
      // A side arrow's text is on its branch's step; a name keeps its place round the circle.
      const b = y.branch !== undefined ? branches?.find((x) => x.id === y.branch) : undefined, [step, g] = b ? [b.step, 0] : place(y.step, sideAt(y), -1 - t.id);
      return step === y.step && (b || y.side !== "name" || g === sideAt(y)) ? t : { ...t, cycle: { ...y, step, ...(!b && y.side === "name" ? { at: g } : {}) } };
    }),
  };
  if (!lay || !moved.size) return out;
  const after = lay(out), now = stepsOf(out, cycle), back = (s: number, u: number) => { const x = span(after, s); return x && x.to > x.from && now[s] ? Math.min(1, Math.max(0, (u * now[s].len - x.from) / (x.to - x.from))) : u; };
  return {
    ...out,
    cycles: out.cycles?.map((x) => (x.id !== id || !x.branches ? x : { ...x, branches: x.branches.map((b) => (moved.has(b.id) ? reEnd({ ...b, meet: back(b.step, meetOf(b)) }, b) : b)) })),
    captions: out.captions?.map((t) => (t.cycle && moved.has(-1 - t.id) ? { ...t, cycle: { ...t.cycle, at: back(t.cycle.step, sideAt(t.cycle)) } } : t)),
  };
}
// A step's settings changed: undefined in the change clears that setting. A forward step keeps no ratio.
export function setStep(m: Mol, id: number, s: number, change: Partial<CycleStep>): Mol {
  return { ...m, cycles: m.cycles?.map((c) => {
    const n = Math.max(c.nodes.length, 1);
    if (c.id !== id || s < 0 || s >= n) return c;
    const steps = Array.from({ length: n }, (_, k) => c.steps?.[k] ?? null), x = { ...steps[s], ...change }, { steps: _, ...rest } = c;
    steps[s] = tidyStep(x.kind === "equilibrium" && x.ratio !== 1 ? x : { ...x, ratio: undefined });
    return steps.some(Boolean) ? { ...rest, steps } : rest;
  }) };
}
// A cycle's structures: its intermediates' atoms and its side arrows' structures.
export const cycleAtoms = (c: Cycle) => [...c.nodes.flat(), ...(c.branches ?? []).flatMap((b) => [...(b.in?.atoms ?? []), ...(b.out?.atoms ?? [])])];
// Whether a break can go on a cycle's circle at angle a (drawing units, y up): only where an arc can run, never in an
// intermediate's ink or the gap round it.
export const clearAt = (layout: CycleLayout, id: number, a: number) => layout.spans.some((s) => { const t = (((s.dir * (-a - s.a0)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return s.cycle === id && t >= s.from0 && t <= s.to0; });
// A cycle with a new radius (bond lengths) about the same centre. Its intermediates and its side arrows' structures move
// straight out (or in) with the circle; text on its side arrows keeps its place against them.
export function resizeCycle(m: Mol, id: number, radius: number): Mol {
  const c = m.cycles?.find((x) => x.id === id);
  if (!c || radius === c.radius) return m;
  const d = radius - c.radius, by = new Map<number, P>(), out = (a: number): P => [d * Math.cos(a), d * Math.sin(a)];
  for (const atoms of [...c.nodes, ...(c.branches ?? []).flatMap((b) => [b.in?.atoms ?? [], b.out?.atoms ?? []])]) { const q = middleOf(m, atoms); if (q) for (const i of atoms) by.set(i, out(angleAbout(c, q))); }
  return {
    ...m,
    atoms: m.atoms.map((x, i) => { const s = by.get(i); return s ? { ...x, location: [x.location[0] + s[0], x.location[1] + s[1], x.location[2] ?? 0] } : x; }),
    cycles: m.cycles!.map((x) => (x.id === id ? { ...x, radius } : x)),
    captions: m.captions?.map((t) => { if (t.cycle?.cycle !== id || t.cycle.side !== "node") return t; const s = out(angleAbout(c, [t.x, t.y])); return { ...t, x: t.x + s[0], y: t.y + s[1] }; }),
  };
}
// A cycle's side arrows' structures moved with the middle of their step's arc, as its nodes go round to angles `at` on
// a circle of `radius` (bond lengths) about the same centre (Tidy the cycle): a reagent or product keeps its place by
// its arc.
export function followArcs(m: Mol, c: Cycle, at: number[], radius: number): Mol {
  const was = anglesOf(m, c), n = c.nodes.length, by = new Map<number, P>();
  const mid = (as: number[], r: number, k: number): P => { const a = as[k] + ((c.clockwise ? -1 : 1) * (n < 2 ? 2 * Math.PI : round(c, as[k], as[(k + 1) % n]))) / 2; return [c.centre[0] + r * Math.cos(a), c.centre[1] + r * Math.sin(a)]; };
  for (const b of c.branches ?? []) {
    if (b.step >= n) continue;
    const p = mid(was, c.radius, b.step), q = mid(at, radius, b.step);
    for (const i of [...(b.in?.atoms ?? []), ...(b.out?.atoms ?? [])]) by.set(i, [q[0] - p[0], q[1] - p[1]]);
  }
  return by.size ? { ...m, atoms: m.atoms.map((x, i) => { const s = by.get(i); return s ? { ...x, location: [x.location[0] + s[0], x.location[1] + s[1], x.location[2] ?? 0] } : x; }) } : m;
}
// A node at an angle, in its place going round; node j taken out (resplice).
export const addStop = (m: Mol, id: number, a: number, atoms: number[], lay?: (m: Mol) => CycleLayout): Mol => resplice(m, id, { add: a, atoms }, lay);
export const removeStop = (m: Mol, id: number, j: number, lay?: (m: Mol) => CycleLayout): Mol => resplice(m, id, { remove: j }, lay);
// What structures and text an edit moved or added do on a cycle: the same while they are dragged as when they are let
// go. was: the drawing before the edit. Only a structure added, or moved in one piece (not turned or cleaned up), counts,
// and text moved or added; one added (drawn, written or pasted) only joins a circle it is on. Unset (a new cycle),
// everything on no cycle counts, and only joins a circle it is on. box: a
// caption's box (drawing units), unset its anchor; bond: the bond length in points; skip (⌘ held): nothing joins.
// placed: what the edit added was put where the pointer aimed (a template or ring stamped, a file dropped, a structure
// named at the pointer), so it joins as a structure dragged there does.
// Each is measured from its box's middle, against the circle it is nearest. Near a bare end, it labels that end. On the
// circle, it is an intermediate: it takes a break's place, or goes in between the two it lies between (an intermediate
// moved round past another goes in where it is now), and stops being a reagent or product. An intermediate taken well
// off its circle leaves a break. Beside a step's arc, it is a reagent (on the arc's first half) or a product (on its
// second): the end a side arrow there is missing, or a side arrow of its own. Atoms drawn on to an intermediate or a
// reagent become part of it.
export type DropOpts = { skip?: boolean; placed?: boolean; box?: (c: Caption) => Box | undefined; bond?: number };
export function dropOnCycle(m: Mol, frags: number[][], was?: Mol, opts: DropOpts = {}): Mol {
  if (opts.skip || !m.cycles?.length) return m;
  const kept = new Set(was?.atoms.map((a) => a.location.join()) ?? []), same = was?.atoms.length === m.atoms.length;
  const shift = (i: number) => { const a = was?.atoms[i]?.location, b = m.atoms[i].location; return a ? [b[0] - a[0], b[1] - a[1]] : undefined; };
  // With the same atoms as before, each is moved if it went anywhere (on to where another was, too); else if no atom
  // was where it is.
  const moved = (i: number) => { const d = same ? shift(i) : undefined; return d ? d[0] !== 0 || d[1] !== 0 : !kept.has(m.atoms[i]?.location.join()); };
  const whole = (fr: number[]) => { const d = shift(fr[0]); return fr.every((i) => { const x = shift(i); return x && d ? Math.abs(x[0] - d[0]) < 1e-9 && Math.abs(x[1] - d[1]) < 1e-9 : !x && !d; }); };
  const textMoved = (t: Caption) => { const w = was?.captions?.find((x) => x.id === t.id); return !w || w.x !== t.x || w.y !== t.y; };
  const cyc = (id: number) => m.cycles!.find((x) => x.id === id)!, f = (c: Cycle) => c.scale ?? 1;
  // The intermediates and side arrow ends some atoms (or a caption) are.
  const owners = (atoms?: number[], cap?: Caption) => {
    const has = (xs?: number[]) => !!atoms && !!xs?.some((i) => atoms.includes(i)), y = cap?.cycle;
    return { nodes: m.cycles!.flatMap((c) => c.nodes.flatMap((n, j) => (has(n) || (y?.cycle === c.id && y.side === "node" && y.step === j) ? [{ c, j }] : []))),
      ends: m.cycles!.flatMap((c) => (c.branches ?? []).flatMap((b) => (["in", "out"] as const).flatMap((part) => (has(b[part]?.atoms) || (y?.cycle === c.id && y.branch === b.id && y.side === part) ? [{ c, b, part }] : [])))) };
  };
  if (was) for (const fr of frags) {
    const { nodes: [node, ...n2], ends: [end, ...e2] } = owners(fr), grow = (xs: number[]) => [...xs, ...fr.filter((i) => !xs.includes(i))];
    if (n2.length || e2.length || (node && end) || !fr.some(moved)) continue;
    if (node && fr.some((i) => !node.c.nodes[node.j].includes(i))) m = { ...m, cycles: m.cycles!.map((x) => (x.id === node.c.id ? { ...x, nodes: x.nodes.map((n, k) => (k === node.j ? grow(n) : n)) } : x)) };
    if (end && fr.some((i) => !end.b[end.part]!.atoms!.includes(i))) m = setEnd(m, end.c.id, end.b.id, end.part, { atoms: grow(end.b[end.part]!.atoms!) });
  }
  // fresh: added by this edit. A cycle's text counts only when it was there before.
  const had = (t: Caption) => !!was?.captions?.some((x) => x.id === t.id);
  const items: { atoms?: number[]; text?: number; fresh: boolean }[] = [...frags.filter((fr) => fr.every(moved) && whole(fr)).map((atoms) => ({ atoms, fresh: !opts.placed && !!was && atoms.every((i) => i >= was.atoms.length) })),
    ...(m.captions ?? []).filter((t) => !t.under && !t.on && (!t.cycle || (had(t) && (t.cycle.side === "node" || isSide(t.cycle)))) && textMoved(t)).map((t) => ({ text: t.id, fresh: !opts.placed && !!was && !had(t) }))];
  // The cycles laid out with a bond length as 1 (px, y down), for the arcs' spans and the side arrows' ends. Kept until
  // the drawing changes.
  let laid: [Mol, CycleLayout] | undefined;
  const layout = (x: Mol = m) => (laid?.[0] === x ? laid[1] : (laid = [x, layoutCycles(x, 1, 1 / (opts.bond ?? 14.4), (atoms) => { const b = boxOf(x, atoms); return b && [b[0] - 0.2, -b[3] - 0.2, b[2] + 0.2, -b[1] + 0.2]; }, (id) => { const t = x.captions?.find((y) => y.id === id), b = t && opts.box?.(t); return b && [b[0], -b[3], b[2], -b[1]]; })])[1]);
  const relabel = (id: number, cycle?: CycleText) => { m = { ...m, captions: m.captions?.map((x) => (x.id !== id ? x : cycle ? { ...x, cycle } : (({ cycle: _, ...rest }) => rest)(x))) }; };
  // Onto the circle at angle a: in a break's place within 0.35 rad, else a node of its own.
  const join = (id: number, a: number, atoms: number[], text?: number) => {
    const c = cyc(id), spot = breakAt(m, c, a, 0.35), j = spot ?? (c.nodes.length ? stepAt(m, c, a) + 1 : 0);
    m = spot !== undefined ? { ...m, cycles: m.cycles!.map((x) => (x.id === id ? { ...x, nodes: x.nodes.map((n, k) => (k === spot ? atoms : n)), at: anglesOf(m, x).map((y, k) => (k === spot ? a : y)) } : x)) } : resplice(m, id, { add: a, atoms }, layout);
    if (text !== undefined) relabel(text, { cycle: id, step: j, side: "node" });
  };
  for (const it of items) {
    const cap = it.text !== undefined ? m.captions?.find((x) => x.id === it.text) : undefined, { nodes: [node, ...n2], ends: [end, ...e2] } = owners(it.atoms, cap);
    if (n2.length || e2.length || (node && end) || (!was && (node || end))) continue;
    // An intermediate is measured whole (it can be more than one structure).
    const atoms = node ? node.c.nodes[node.j] : end ? end.b[end.part]!.atoms : it.atoms, b = atoms?.length ? boxOf(m, atoms) : cap && (opts.box?.(cap) ?? [cap.x, cap.y, cap.x, cap.y]);
    if (!b) continue;
    const q: P = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], h = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2, off = (c: Cycle) => Math.hypot(q[0] - c.centre[0], q[1] - c.centre[1]) - c.radius;
    const band = (c: Cycle) => Math.max(0.6, 0.6 * h) * f(c), onBand = (c: Cycle) => off(c) > -0.65 * c.radius && Math.abs(off(c)) <= band(c), a = (c: Cycle) => angleAbout(c, q);
    const near = m.cycles!.reduce((x, c) => (Math.abs(off(c)) < Math.abs(off(x)) ? c : x)), own = it.atoms ?? [];
    if (node) {
      const c = cyc(node.c.id), n = c.nodes.length;
      if (onBand(c)) {
        // Moved round past the one before or after it: it goes in where it is now.
        const as = anglesOf(m, c), prev = as[(node.j - 1 + n) % n], next = as[(node.j + 1) % n];
        if (n > 2 && round(c, prev, a(c)) > round(c, prev, next)) { const whole = c.nodes[node.j]; m = resplice(m, c.id, { remove: node.j }, layout); join(c.id, a(c), whole, it.text); }
        continue;
      }
      if (Math.abs(off(c)) <= band(c) + f(c)) continue;
      // Taken off its circle: a break where it was.
      const w = was?.cycles?.find((x) => x.id === c.id), from = w && w.nodes.length === n ? anglesOf(was!, w)[node.j] : c.at[node.j];
      m = { ...m, cycles: m.cycles!.map((x) => (x.id === c.id ? { ...x, nodes: x.nodes.map((y, k) => (k === node.j ? [] : y)), at: anglesOf(m, x).map((y, k) => (k === node.j ? from : y)) } : x)) };
      if (it.text !== undefined) relabel(it.text);
    } else if (end) {
      // A reagent or product put on a circle is an intermediate; anywhere else it is still its side arrow's.
      if (!onBand(near)) continue;
      if (it.text !== undefined) relabel(it.text);
      m = removeEnd(m, end.c.id, end.b.id, end.part);
      join(near.id, a(near), own, it.text);
      continue;
    }
    // Something new joins only the circle it is on.
    if (it.fresh) { if (onBand(near)) join(near.id, a(near), own, it.text); continue; }
    const lay = was ? layout() : undefined;
    // A bare end near it: it labels that end.
    let bare: { c: Cycle; b: CycleBranch; part: "in" | "out"; d: number } | undefined;
    for (const x of lay?.branches ?? []) for (const part of ["in", "out"] as const) {
      const c = cyc(x.cycle), br = c.branches?.find((y) => y.id === x.branch), E = x[part];
      if (!br?.[part] || br[part]!.atoms?.length || !E || m.captions?.some((t) => t.cycle?.cycle === c.id && t.cycle.branch === br.id && t.cycle.side === part)) continue;
      const d = Math.hypot(q[0] - E[0], q[1] - E[1]);
      if (d <= 0.8 * f(c) && (!bare || d < bare.d)) bare = { c, b: br, part, d };
    }
    if (bare) {
      if (it.text !== undefined) relabel(it.text, { cycle: bare.c.id, step: bare.b.step, side: bare.part, branch: bare.b.id });
      else m = setEnd(m, bare.c.id, bare.b.id, bare.part, { atoms: own });
      continue;
    }
    if (onBand(near)) { join(near.id, a(near), own, it.text); continue; }
    // Beside a step's arc: no more than 3 bond lengths outside it, or 0.8 of the radius inside. Something placed (a ring
    // stamped) goes no more than half the radius, and 3 bond lengths, inside: the middle stays free for a catalyst.
    const o = off(near), p: P = [q[0], -q[1]], travel = (s: CycleLayout["spans"][number]) => (((s.dir * (Math.atan2(p[1] - s.centre[1], p[0] - s.centre[0]) - s.a0)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const s = lay && o <= 3 * f(near) && o >= -(opts.placed ? Math.min(0.5 * near.radius, 3 * f(near)) : 0.8 * near.radius) ?lay.spans.find((x) => x.cycle === near.id && x.to > x.from && travel(x) >= x.from && travel(x) <= x.to) : undefined;
    if (!s) continue;
    const g = (travel(s) - s.from) / (s.to - s.from), part = g < 0.5 ? "in" : "out", c = cyc(near.id), one = c.branches?.find((x) => x.step === s.step && !x[part]);
    if (!one && full(c)) continue;
    // A new side arrow for a structure meets the arc a little on from it (back from it for a product), so its arrow
    // swoops in along the arc; one for text, where its swoop turns no more than a quarter of the way round.
    const fresh = { id: nextBranch(c), step: s.step }, len = Math.abs(s.sw) * s.Rs;
    const br: CycleBranch = one ?? (it.text === undefined ? { ...fresh, meet: slide(g, part, Math.max(0, Math.abs(o) - h) + 0.5 * f(c), len) } : eased(lay!, c.id, { ...fresh, meet: Math.round(Math.min(0.85, Math.max(0.15, g)) * 1e4) / 1e4 }, part, p, 1, f(c)));
    const e: CycleEnd = it.text === undefined ? { atoms: own } : endFor(lay!, c.id, br, part, p, 1, f(c)) ?? {};
    m = one ? withEnd(m, c.id, one.id, part, e) : withBranches(m, c.id, (bs) => [...bs, { ...br, [part]: e }]);
    if (it.text !== undefined) relabel(it.text, { cycle: c.id, step: s.step, side: part, branch: br.id });
  }
  return m;
}

// Where a step's name dragged to p (px, y down) goes: how far along its step and how far from the circle (CycleText
// at and reach). Its at is also where a side arrow meeting the step there meets it. Undefined when the step is not
// drawn.
export function sideFor(layout: CycleLayout, t: { cycle: number; step: number }, p: P, k: number, f = 1): { at: number; reach: number } | undefined {
  const s = layout.spans.find((x) => x.cycle === t.cycle && x.step === t.step);
  if (!s) return undefined;
  const len = Math.abs(s.sw);
  let travel = ((Math.sign(s.sw) || s.dir) * (Math.atan2(p[1] - s.O[1], p[0] - s.O[0]) - s.p0)) % (2 * Math.PI);
  if (travel < 0) travel += 2 * Math.PI;
  // Past the end of the step is its end; before its start (the rest of the way round) is its start.
  const past = travel > len + (2 * Math.PI - len) / 2 ? 0 : s.to <= s.from ? 0.5 : Math.min(1, travel / len);
  const reach = (s.o * (Math.hypot(p[0] - s.O[0], p[1] - s.O[1]) - s.Rs)) / (f * k);
  // The end stays a little away from the circle, and inside it no nearer the middle than a fifth of the radius.
  return { at: Math.round(past * 100) / 100, reach: Math.round(Math.max(-0.8 * s.R / (f * k), Math.abs(reach) < 0.4 ? Math.sign(reach || 1) * 0.4 : reach) * 100) / 100 };
}

// Where a side arrow's end dragged to p (px, y down) puts it: how far round from where its branch meets the arc and how
// far from the circle (CycleEnd along and reach). A reagent's end stays before that point, a product's after it.
export function endFor(layout: CycleLayout, cycle: number, br: CycleBranch, part: "in" | "out", p: P, k: number, f = 1): { along: number; reach: number } | undefined {
  const s = layout.spans.find((x) => x.cycle === cycle && x.step === br.step);
  if (!s) return undefined;
  const b = f * k, d = arcOff(s, meetOf(br), p);
  const along = part === "in" ? Math.max(-FAR, Math.min(-0.25, (d * s.Rs) / b)) : Math.min(FAR, Math.max(0.25, (d * s.Rs) / b)), reach = (s.o * (Math.hypot(p[0] - s.O[0], p[1] - s.O[1]) - s.Rs)) / b;
  return { along: Math.round(along * 100) / 100, reach: Math.round(Math.min(FAR, Math.max(-FAR, (-0.8 * s.R) / b, Math.abs(reach) < 0.4 ? Math.sign(reach || 1) * 0.4 : reach)) * 100) / 100 };
}

// How far round its arc's own circle p (px, y down) is from g along a step, the way the arc runs (radians, -π to π).
const arcOff = (s: CycleLayout["spans"][number], g: number, p: P) => {
  const d = ((Math.sign(s.sw) || s.dir) * (Math.atan2(p[1] - s.O[1], p[0] - s.O[0]) - s.p0 - s.sw * g)) % (2 * Math.PI);
  return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d;
};
// A side arrow with one end, that end going to p (px, y down): where it meets the arc moves away from p (on from it for
// a reagent, back from it for a product) while p is nearer it along the arc than out from it, so its swoop turns no more
// than a quarter of the way round.
function eased(layout: CycleLayout, cycle: number, br: CycleBranch, part: "in" | "out", p: P, k: number, f: number): CycleBranch {
  const s = layout.spans.find((x) => x.cycle === cycle && x.step === br.step), e = endFor(layout, cycle, br, part, p, k, f);
  if (!s || !e) return br;
  const b = f * k, len = Math.abs(s.sw) * s.Rs, d = (arcOff(s, meetOf(br), p) * s.Rs) / b, want = Math.abs(e.reach);
  if (Math.abs(d) >= want || !len) return br;
  return { ...br, meet: Math.round(Math.max(0, Math.min(1, meetOf(br) + ((part === "out" ? d - want : d + want) * b) / len)) * 1e4) / 1e4 };
}
// A structure's side arrow meets its step g along it, moved on (a reagent) or back (a product) by clear (how far the
// structure is clear of the arc, and half a bond length more; len: the arc's length, the same units).
const slide = (g: number, part: "in" | "out", clear: number, len: number) => Math.round(Math.min(0.9, Math.max(0.1, g + ((part === "in" ? 1 : -1) * clear) / (len || 1))) * 1e4) / 1e4;

// What a step's lead, trail or bow handle dragged to p (px, y down) sets: the space in points for lead and trail
// (whole points), the bow in bond lengths. Within snap px of none, it is none. With ratio, a reversible step's lead or
// trail shortens one half instead, as an equilibrium arrow's ends do: the trail the forward half, the lead the back.
export function stepFor(layout: CycleLayout, c: Cycle, step: number, which: "lead" | "trail" | "bow", p: P, k: number, pt: number, snap: number, ratio = false): Partial<CycleStep> | undefined {
  const s = layout.spans.find((x) => x.cycle === c.id && x.step === step), f = c.scale ?? 1;
  if (!s) return undefined;
  const a = Math.atan2(p[1] - s.centre[1], p[0] - s.centre[0]), off = (x: number) => { const d = (s.dir * (a - s.a0 - s.dir * x)) % (2 * Math.PI); return d > Math.PI ? d - 2 * Math.PI : d < -Math.PI ? d + 2 * Math.PI : d; };
  if (which === "bow") { const d = Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]) - s.R + BOW_IN * f * k, most = Math.min(20, (0.9 * s.R) / (f * k)); return { bow: Math.abs(d) < snap ? undefined : Math.round(Math.max(-most, Math.min(most, d / (f * k))) * 100) / 100 }; }
  if (ratio) {
    const r = (2 * Math.abs(off((s.from + s.to) / 2))) / Math.max(1e-3, s.to - s.from), x = which === "trail" ? Math.max(0.05, Math.min(1, r)) : Math.max(1, Math.min(20, 1 / Math.max(1e-3, r)));
    return { ratio: Math.abs(x - 1) < 0.02 ? undefined : Math.round(x * 100) / 100 };
  }
  const d = which === "lead" ? off(s.from0) : -off(s.to0);
  return { [which]: Math.abs(d * s.R) < snap ? undefined : Math.max(-(c.gap ?? GAP_PT), -72, Math.min(72, Math.round((d * s.R) / (f * pt)))) };
}

// The cycle and branch a side arrow's text labels.
export function branchOf(m: Mol, t: CycleText): { c: Cycle; b: CycleBranch } | undefined {
  const c = m.cycles?.find((x) => x.id === t.cycle), b = t.branch === undefined ? undefined : c?.branches?.find((x) => x.id === t.branch);
  return c && b ? { c, b } : undefined;
}
const nextBranch = (c: Cycle) => Math.max(0, ...(c.branches ?? []).map((b) => b.id)) + 1;
const withBranches = (m: Mol, id: number, f: (bs: CycleBranch[]) => CycleBranch[]): Mol => ({ ...m, cycles: m.cycles?.map((c) => { if (c.id !== id) return c; const branches = f(c.branches ?? []), { branches: _, ...rest } = c; return branches.length ? { ...rest, branches } : rest; }) });
// A branch with its ends changed (x), still meeting the arc where b did.
const reEnd = (b: CycleBranch, x: CycleBranch): CycleBranch => { const g = meetOf(b), { meet: _, ...rest } = x; return meetOf(rest) === g ? rest : { ...rest, meet: g }; };
// A branch changed: undefined in the change clears that setting. One moved to another step takes its text with it.
export function setBranch(m: Mol, id: number, branch: number, change: Partial<CycleBranch>): Mol {
  m = withBranches(m, id, (bs) => bs.map((b) => (b.id === branch ? (Object.fromEntries(Object.entries({ ...b, ...change }).filter(([, v]) => v !== undefined)) as CycleBranch) : b)));
  return change.step === undefined ? m : { ...m, captions: m.captions?.map((t) => (t.cycle?.cycle === id && t.cycle.branch === branch && t.cycle.step !== change.step ? { ...t, cycle: { ...t.cycle, step: change.step! } } : t)) };
}
export const setEnd = (m: Mol, id: number, branch: number, part: "in" | "out", change: Partial<CycleEnd>): Mol =>
  withBranches(m, id, (bs) => bs.map((b) => (b.id === branch && b[part] ? { ...b, [part]: Object.fromEntries(Object.entries({ ...b[part], ...change }).filter(([, v]) => v !== undefined)) } : b)));
// A new side arrow on a step, with a reagent coming in and a product going out where Octet puts them, and its id.
// Undefined when the cycle has all the side arrows it can.
export function addBranch(m: Mol, id: number, step: number): [Mol, number | undefined] {
  const c = m.cycles?.find((x) => x.id === id), branch = c ? nextBranch(c) : 1;
  if (!c || full(c)) return [m, undefined];
  return [withBranches(m, id, (bs) => [...bs, { id: branch, step, in: {}, out: {} }]), branch];
}
// The Side arrow tool's click on step `step`, g along it (0 at its start): what it offers, the likely one first. The
// likely one is the end a one-ended side arrow on the step is missing, so the two make one swoop in and out; else a
// reagent on the step's first half and a product on its second.
export function sideChoices(c: Cycle, step: number, g: number): ("in" | "out" | "both")[] {
  const lone = c.branches?.find((b) => b.step === step && !b.in !== !b.out), first = lone ? (lone.in ? "out" : "in") : g < 0.5 ? "in" : "out";
  return [first, ...(["in", "out", "both"] as const).filter((x) => x !== first)];
}
// What the choice adds, and the side arrow it is on. A reagent or product goes on a side arrow of the step missing that
// end (as one dropped there does), else on a new one meeting the step at g; both ends are always a new side arrow.
export function addSide(m: Mol, id: number, step: number, g: number, ends: "in" | "out" | "both"): [Mol, number | undefined] {
  const c = m.cycles?.find((x) => x.id === id), one = ends === "both" ? undefined : c?.branches?.find((b) => b.step === step && !b[ends]);
  if (!c || !Number.isInteger(step) || step < 0 || step > Math.max(c.nodes.length - 1, 0)) return [m, undefined]; // as readBranches reads it
  if (one) return [withEnd(m, id, one.id, ends as "in" | "out"), one.id];
  if (!c || full(c)) return [m, undefined];
  const branch = nextBranch(c), meet = Math.round(Math.min(0.85, Math.max(0.15, g)) * 100) / 100;
  return [withBranches(m, id, (bs) => [...bs, { id: branch, step, meet, ...(ends !== "out" ? { in: {} } : {}), ...(ends !== "in" ? { out: {} } : {}) }]), branch];
}
// The Side arrow tool's click on a structure (atoms) or free text: it is taken as just put there, so it goes on as
// dropOnCycle puts it (beside a step, a reagent on its first half or a product on its second; near a bare end, that
// end's label). As placed: one in the middle of the circle (a catalyst) stays free.
export function attachBeside(m: Mol, it: { atoms?: number[]; text?: number }, opts: DropOpts = {}): Mol {
  const was: Mol = { ...m, atoms: m.atoms.map((a, i) => (it.atoms?.includes(i) ? { ...a, location: [a.location[0] + 1e4, a.location[1], a.location[2]] } : a)), captions: m.captions?.map((t) => (t.id === it.text ? { ...t, x: t.x + 1e4 } : t)) };
  return dropOnCycle(m, it.atoms ? [it.atoms] : [], was, { ...opts, placed: true });
}
// A side arrow given the end it is missing (end: where it goes; unset is the default place).
export const withEnd = (m: Mol, id: number, branch: number, part: "in" | "out", end: CycleEnd = {}): Mol => withBranches(m, id, (bs) => bs.map((b) => (b.id === branch && !b[part] ? reEnd(b, { ...b, [part]: end }) : b)));
// One end of a side arrow taken off, with its text. The last end takes the branch with it.
export function removeEnd(m: Mol, id: number, branch: number, part: "in" | "out"): Mol {
  m = { ...m, captions: m.captions?.filter((t) => !(t.cycle?.cycle === id && t.cycle.branch === branch && t.cycle.side === part)) };
  return withBranches(m, id, (bs) => bs.flatMap((b) => { if (b.id !== branch) return [b]; const rest = { ...b }; delete rest[part]; return rest.in || rest.out ? [reEnd(b, rest)] : []; }));
}
// A side arrow with only the ends asked for: an end taken off goes with its text; one added goes where Octet puts it.
export function setEnds(m: Mol, id: number, branch: number, ends: "both" | "in" | "out"): Mol {
  for (const part of ["in", "out"] as const) if (ends !== (part === "in" ? "out" : "in")) m = withEnd(m, id, branch, part);
  return ends === "both" ? m : removeEnd(m, id, branch, ends === "in" ? "out" : "in");
}
// A side arrow the other way round: its reagent becomes its product and the other way, each end mirrored about where
// it meets the arc, and its heads swapped.
export function swapBranch(m: Mol, id: number, branch: number): Mol {
  const flip = (e?: CycleEnd) => e && (e.along !== undefined ? { ...e, along: -e.along } : e);
  m = withBranches(m, id, (bs) => bs.map((b) => { if (b.id !== branch) return b; const { in: i, out: o, heads, ...rest } = b; return reEnd(b, { ...rest, ...(o ? { in: flip(o) } : {}), ...(i ? { out: flip(i) } : {}), ...(heads ? { heads: [heads[1], heads[0]] as [Head, Head] } : {}) }); }));
  return { ...m, captions: m.captions?.map((t) => (t.cycle?.cycle === id && t.cycle.branch === branch && isSide(t.cycle) ? { ...t, cycle: { ...t.cycle, side: t.cycle.side === "in" ? "out" : "in" } } : t)) };
}
// A new reagent's or product's text on a step labels the end of its branch, or the end its step's one-ended side arrow is
// missing, or a side arrow of its own. An end it labels that is not there yet is added.
export function labelEnd(m: Mol, id: number): Mol {
  const t = m.captions?.find((x) => x.id === id)?.cycle, c = t && m.cycles?.find((x) => x.id === t.cycle);
  if (!t || !c || !isSide(t)) return m;
  const part = t.side as "in" | "out", branch = branchFor(c, t), b = c.branches?.find((x) => x.id === branch);
  if (b?.[part]) return t.branch === branch ? m : { ...m, captions: m.captions?.map((x) => (x.id === id ? { ...x, cycle: { ...t, branch } } : x)) };
  // With all the side arrows a cycle can have, the text has nowhere to go.
  if (!b && full(c)) return { ...m, captions: m.captions?.filter((x) => x.id !== id) };
  m = b ? withEnd(m, c.id, branch, part) : withBranches(m, c.id, (bs) => [...bs, { id: branch, step: t.step, [part]: {} }]);
  return { ...m, captions: m.captions?.map((x) => (x.id === id ? { ...x, cycle: { ...t, branch } } : x)) };
}
// The branch a reagent's or product's text labels: its own, else its step's one-ended side arrow missing that end, else a
// new one.
export function branchFor(c: Cycle, t: CycleText): number {
  if (t.branch !== undefined && c.branches?.some((x) => x.id === t.branch)) return t.branch;
  return c.branches?.find((x) => x.step === t.step && !x[t.side as "in" | "out"])?.id ?? nextBranch(c);
}
// Which end a point (p) makes of a side arrow meeting the arc at T, where the arc runs on along t: one ahead of T goes
// out (a product), one behind it comes in (a reagent).
export const roleFor = (T: P, t: P, p: P): "in" | "out" => ((p[0] - T[0]) * t[0] + (p[1] - T[1]) * t[1] > 0 ? "out" : "in");
// Where a step's arc is at g along it (px, y down), and its way on there.
const onSpan = (s: CycleLayout["spans"][number], g: number): { T: P; t: P } => {
  const a = s.p0 + s.sw * g, sd = Math.sign(s.sw) || s.dir;
  return { T: [s.O[0] + s.Rs * Math.cos(a), s.O[1] + s.Rs * Math.sin(a)], t: [-sd * Math.sin(a), sd * Math.cos(a)] };
};
// A side arrow pulled out of step `step`'s arc at meet (a fraction along it) to p (px, y down): coming in when p is behind
// where it meets the arc, going out when ahead. One that lands near a one-ended side arrow missing that end becomes its
// other end. Undefined while p is still near the arc.
export function pullBranch(m: Mol, layout: CycleLayout, id: number, step: number, meet: number, p: P, k: number): { m: Mol; branch: number; part: "in" | "out" } | undefined {
  const c = m.cycles?.find((x) => x.id === id), s = layout.spans.find((x) => x.cycle === id && x.step === step);
  if (!c || !s) return undefined;
  const f = c.scale ?? 1, b = f * k, { T, t } = onSpan(s, meet);
  if (Math.abs(Math.hypot(p[0] - s.O[0], p[1] - s.O[1]) - s.Rs) < 0.3 * b) return undefined;
  const part = roleFor(T, t, p), len = Math.abs(s.sw) * s.Rs, near = c.branches?.find((x) => x.step === step && !x[part] && Math.abs(meetOf(x) - meet) * len < 0.5 * b);
  if (near) return { m: withEnd(m, id, near.id, part, endFor(layout, id, near, part, p, k, f) ?? {}), branch: near.id, part };
  if (full(c)) return undefined;
  // Pulled straight out, where it meets the arc moves along so its swoop turns no more than a quarter of the way round.
  const br = eased(layout, id, { id: nextBranch(c), step, meet }, part, p, k, f), fresh: CycleBranch = { id: br.id, step, [part]: endFor(layout, id, br, part, p, k, f) ?? {} };
  return { m: withBranches(m, id, (bs) => [...bs, meetOf(fresh) === br.meet ? fresh : { ...fresh, meet: br.meet }]), branch: br.id, part };
}
// A side arrow's end dragged to p (px, y down). Dragged past where the arrow meets the arc, it turns round (a reagent
// becomes a product) when the arrow has no other end; with one, where it meets the arc goes along with it instead. With
// no other end, where it meets the arc keeps its swoop to a quarter turn (eased).
export function dragEnd(m: Mol, layout: CycleLayout, id: number, branch: number, part: "in" | "out", p: P, k: number): { m: Mol; part: "in" | "out" } {
  const c = m.cycles?.find((x) => x.id === id), b = c?.branches?.find((x) => x.id === branch), s = b && layout.spans.find((x) => x.cycle === id && x.step === b.step);
  if (!c || !b || !s) return { m, part };
  const f = c.scale ?? 1, other = part === "in" ? "out" : "in", { T, t } = onSpan(s, meetOf(b)), role = roleFor(T, t, p);
  const alone = (x: Mol, end: "in" | "out") => {
    const was = x.cycles!.find((y) => y.id === id)!.branches!.find((y) => y.id === branch)!, now = eased(layout, id, was, end, p, k, f), e = endFor(layout, id, now, end, p, k, f);
    return e ? setEnd(now.meet !== was.meet ? setBranch(x, id, branch, { meet: now.meet }) : x, id, branch, end, e) : x;
  };
  if (!b[other]) return role !== part ? { m: alone(swapBranch(m, id, branch), other), part: other } : { m: alone(m, part), part };
  const e = endFor(layout, id, b, part, p, k, f);
  if (!e) return { m, part };
  if (role === part) return { m: setEnd(m, id, branch, part, e), part };
  // Kept to its side of where the arrow meets the arc, that point goes along with it, never off its step.
  const g = sideFor(layout, { cycle: id, step: b.step }, p, k, f)?.at ?? meetOf(b), len = Math.abs(s.sw) * s.Rs || 1;
  return { m: setEnd(setBranch(m, id, branch, { meet: Math.round(Math.max(0, Math.min(1, g - (e.along * f * k) / len)) * 1e4) / 1e4 }), id, branch, part, e), part };
}
// Where a side arrow meets its step dragged to p (px, y down): it slides along the arc, on to the next step past an
// intermediate, keeping its ends. Pulled well off the arc, a side arrow with one end gets its other end there instead.
export function dragMeet(m: Mol, layout: CycleLayout, id: number, branch: number, p: P, k: number): Mol {
  const c = m.cycles?.find((x) => x.id === id), b = c?.branches?.find((x) => x.id === branch), s = b && layout.spans.find((x) => x.cycle === id && x.step === b.step);
  if (!c || !b || !s) return m;
  const f = c.scale ?? 1, missing = !b.in ? "in" : !b.out ? "out" : undefined;
  if (missing && Math.abs(Math.hypot(p[0] - s.O[0], p[1] - s.O[1]) - s.Rs) >= 0.4 * f * k) return withEnd(m, id, branch, missing, endFor(layout, id, b, missing, p, k, f));
  const step = stepAt(m, c, angleAbout(c, [p[0] / k, -p[1] / k])), g = sideFor(layout, { cycle: id, step }, p, k, f)?.at;
  return g === undefined ? m : setBranch(m, id, branch, { step, meet: g });
}
// Where a structure's side arrow meets the arc: the step beside the structure, a little on from it for a reagent or
// back from it for a product (slide).
export function structureMeet(m: Mol, c: Cycle, atoms: number[], part: "in" | "out"): { step: number; meet: number } | undefined {
  const bx = boxOf(m, atoms);
  if (!bx) return undefined;
  const q: P = [(bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2], a = angleAbout(c, q), step = stepAt(m, c, a), st = stepsOf(m, c)[step];
  const clear = Math.max(0, Math.abs(Math.hypot(q[0] - c.centre[0], q[1] - c.centre[1]) - c.radius) - Math.hypot(bx[2] - bx[0], bx[3] - bx[1]) / 2);
  return { step, meet: slide(round(c, st.start, a) / st.len, part, clear + 0.5 * (c.scale ?? 1), c.radius * st.len) };
}
// A structure as a reagent or product of a cycle: a side arrow of its own on the step beside it (structureMeet).
export function structureEnd(m: Mol, c: Cycle, atoms: number[], part: "in" | "out"): Cycle {
  const at = full(c) ? undefined : structureMeet(m, c, atoms, part);
  return at ? { ...c, branches: [...(c.branches ?? []), { id: nextBranch(c), ...at, [part]: { atoms } }] } : c;
}

// Cycles as Octet 1.0.29 saved them, as this version keeps them. Every cycle gets each node's angle, so it behaves as
// one drawn with the Cycle tool (a deleted intermediate leaves a break). Each reagent's and product's text becomes a
// branch: on each step, the first reagent and the first product that passed through are one arrow; any other is an
// arrow of its own, and one alone that passed through gets a bare end where its tail was. Each structure saved as a
// reagent or product (sides) becomes an arrow of its own. Running it again changes nothing.
export function migrateCycles(m: Mol): Mol {
  if (!m.cycles?.length) return m;
  const fixed = new Map<number, CycleText | undefined>();
  const cycles = m.cycles.map((c0) => {
    let c: Cycle = c0.at?.length === c0.nodes.length ? c0 : { ...c0, at: anglesOf(m, c0) };
    const st = stepsOf(m, c), f = c.scale ?? 1, old = (m.captions ?? []).filter((t) => t.cycle?.cycle === c.id && isSide(t.cycle) && t.cycle.branch === undefined);
    const branches = [...(c.branches ?? [])], add = (b: Omit<CycleBranch, "id" | "meet">, meet: number) => { if (branches.length >= MAX_BRANCHES) return undefined; const x: CycleBranch = { id: Math.max(0, ...branches.map((y) => y.id)) + 1, ...b }; if (meet !== meetOf(x)) x.meet = meet; branches.push(x); return x.id; };
    for (const s of [...new Set(old.map((t) => Math.min(t.cycle!.step, st.length - 1)))]) {
      // A place along the step (0 to 1) as an arc distance from where the branch meets it, in bond lengths.
      const along = (g: number, meet: number) => Math.max(-FAR, Math.min(FAR, ((g - meet) * c.radius * st[s].len) / f));
      const here = old.filter((t) => Math.min(t.cycle!.step, st.length - 1) === s), o = (t: Caption) => t.cycle as OldText;
      const endOf = (t: Caption, meet: number): CycleEnd => ({ ...(o(t).at !== undefined ? { along: along(o(t).at!, meet) } : {}), ...(o(t).reach !== undefined ? { reach: Math.max(-FAR, Math.min(FAR, o(t).reach!)) } : {}) });
      // Past the most side arrows a cycle has, the text is free.
      const label = (t: Caption, branch?: number) => { const { at: _a, reach: _r, through: _t, meet: _m, tail: _l, ...rest } = o(t); fixed.set(t.id, branch === undefined ? undefined : { ...rest, step: s, branch }); };
      const pin = here.find((t) => o(t).side === "in" && o(t).through !== false), pout = here.find((t) => o(t).side === "out" && o(t).through !== false);
      if (pin && pout) { const meet = o(pin).meet ?? o(pout).meet ?? 0.5, id = add({ step: s, in: endOf(pin, meet), out: endOf(pout, meet) }, meet); label(pin, id); label(pout, id); }
      for (const t of here) {
        if (pin && pout && (t === pin || t === pout)) continue;
        const part = o(t).side as "in" | "out", other = part === "in" ? "out" : "in", meet = o(t).meet ?? (part === "in" ? 0.4 : 0.6), tail = o(t).tail;
        label(t, add({ step: s, [part]: endOf(t, meet), ...(o(t).through ? { [other]: tail ? { along: along(tail[0], meet), reach: Math.max(-FAR, Math.min(FAR, tail[1])) } : {} } : {}) }, meet));
      }
    }
    c = branches.length ? { ...c, branches } : c;
    if (!c0.branches) for (const x of c.sides ?? []) c = structureEnd(m, c, x.atoms, x.side);
    const { sides: _, ...rest } = c;
    return rest;
  });
  return { ...m, cycles, captions: m.captions?.map((t) => { if (!fixed.has(t.id)) return t; const y = fixed.get(t.id), { cycle: _, ...free } = t; return y ? { ...t, cycle: y } : free; }) };
}

// A cycle's steps and branches as saved (.oct, and Octet's data in CDXML), checked: undefined when anything is wrong.
// atom: a saved atom's index in the drawing, or undefined.
const fin = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function readSteps(v: unknown): (CycleStep | null)[] | undefined {
  if (!Array.isArray(v) || v.length > 64) return undefined;
  const out: (CycleStep | null)[] = [];
  for (const s of v) {
    if (s === null) { out.push(null); continue; }
    if (!isObject(s) || (s.kind !== undefined && s.kind !== "equilibrium") || (s.ratio !== undefined && !fin(s.ratio, 0.05, 20)) || (s.lead !== undefined && !fin(s.lead, -72, 72))
      || (s.trail !== undefined && !fin(s.trail, -72, 72)) || (s.bow !== undefined && !fin(s.bow, -20, 20)) || (s.hidden !== undefined && typeof s.hidden !== "boolean")) return undefined;
    out.push(tidyStep({ kind: s.kind as "equilibrium" | undefined, ratio: s.ratio as number | undefined, lead: s.lead as number | undefined, trail: s.trail as number | undefined, bow: s.bow as number | undefined, hidden: s.hidden === true ? true : undefined }));
  }
  return out;
}
const HEADS: Head[] = ["none", "full", "left", "right"];
export function readBranches(v: unknown, nodes: number, atom: (i: unknown) => number | undefined): CycleBranch[] | undefined {
  if (!Array.isArray(v) || v.length > 64) return undefined;
  const out: CycleBranch[] = [];
  const end = (e: unknown): CycleEnd | undefined => {
    if (!isObject(e) || (e.along !== undefined && !fin(e.along, -50, 50)) || (e.reach !== undefined && !fin(e.reach, -50, 50)) || (e.atoms !== undefined && !(Array.isArray(e.atoms) && e.atoms.length <= 512))) return undefined;
    const atoms = (e.atoms as unknown[] | undefined)?.map(atom);
    if (atoms?.some((i) => i === undefined)) return undefined;
    return { ...(e.along !== undefined ? { along: e.along as number } : {}), ...(e.reach !== undefined ? { reach: e.reach as number } : {}), ...(atoms?.length ? { atoms: atoms as number[] } : {}) };
  };
  for (const b of v) {
    if (!isObject(b) || !Number.isInteger(b.id) || !fin(b.id, 0, 1e6) || out.some((x) => x.id === b.id) || !Number.isInteger(b.step) || !fin(b.step, 0, Math.max(nodes - 1, 0)) || (b.meet !== undefined && !fin(b.meet, 0, 1))
      || (b.heads !== undefined && !(Array.isArray(b.heads) && b.heads.length === 2 && b.heads.every((h) => HEADS.includes(h)))) || (b.colour !== undefined && !(typeof b.colour === "string" && /^#[0-9a-f]{6}$/i.test(b.colour)))
      || (b.in === undefined && b.out === undefined)) return undefined;
    const i = b.in === undefined ? undefined : end(b.in), o = b.out === undefined ? undefined : end(b.out);
    if ((b.in !== undefined && !i) || (b.out !== undefined && !o)) return undefined;
    out.push({ id: b.id as number, step: b.step as number, ...(b.meet !== undefined ? { meet: b.meet as number } : {}), ...(i ? { in: i } : {}), ...(o ? { out: o } : {}), ...(b.heads ? { heads: b.heads as [Head, Head] } : {}), ...(b.colour ? { colour: b.colour as string } : {}) });
  }
  return out;
}
