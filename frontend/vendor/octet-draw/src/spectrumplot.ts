// A predicted spectrum as the Spectrum panel draws it, and as a figure for the page (Add to drawing): the lines of each
// ¹H multiplet, the solvent's peaks, the axis ticks and the peak labels. The figure is in bond lengths, y up, with the
// axis along y = 0 from x = 0 (the high-shift end) to its width.
import { multiplicity, type Nucleus, type Prediction, type Signal } from "./nmr.ts";
import type { CurvePoint, Mol } from "./render.ts";
import { widthOf } from "./arial.ts";
import { addArrow, addCaption, groupSelection } from "./edit.ts";

export const SOLVENTS = ["CDCl₃", "DMSO-d₆", "CD₃OD", "D₂O", "C₆D₆", "Acetone-d₆", "CD₃CN"];

// Residual solvent and water peaks (Fulmer et al., Organometallics 2010, 29, 2176): each peak's shift with the number
// of deuteriums the nucleus couples to and J to deuterium (Hz). CHD₂ residual protons are quintets; CDCl₃ is a 1:1:1
// triplet in ¹³C and CD₃ a septet.
const SOLVENT_PEAKS: Record<string, { h: [number, number, number][]; water?: number; c: [number, number, number][] }> = {
  "CDCl₃": { h: [[7.26, 0, 0]], water: 1.56, c: [[77.16, 1, 32]] },
  "DMSO-d₆": { h: [[2.5, 2, 1.9]], water: 3.33, c: [[39.52, 3, 21]] },
  "CD₃OD": { h: [[3.31, 2, 1.7]], water: 4.87, c: [[49.0, 3, 21.4]] },
  "D₂O": { h: [[4.79, 0, 0]], c: [] },
  "C₆D₆": { h: [[7.16, 0, 0]], water: 0.4, c: [[128.06, 1, 24]] },
  "Acetone-d₆": { h: [[2.05, 2, 2.2]], water: 2.84, c: [[29.84, 3, 19.4], [206.26, 0, 0]] },
  "CD₃CN": { h: [[1.94, 2, 2.5]], water: 2.13, c: [[1.32, 3, 21], [118.26, 0, 0]] },
};
// A peak split by n deuteriums (spin 1): 2n + 1 lines, heights from repeated 1:1:1, adding up to `total`.
function deuterated(ppm: number, n: number, j: number, mhz: number, total: number) {
  let row = [1];
  for (let k = 0; k < n; k++) row = Array.from({ length: row.length + 2 }, (_, i) => (row[i - 2] ?? 0) + (row[i - 1] ?? 0) + (row[i] ?? 0));
  const sum = row.reduce((a, b) => a + b, 0);
  return row.map((h, i) => ({ ppm: ppm + ((i - n) * j) / mhz, h: (h / sum) * total }));
}
export type SolventPeak = { name: string; ppm: number; lines: { ppm: number; h: number }[]; broad: boolean };
// The solvent's own peaks: the residual peak (and water) in ¹H, the deuterated carbons in ¹³C. mhz: the ¹H frequency.
export function solventPeaks(solvent: string, nucleus: Nucleus, mhz: number): SolventPeak[] {
  const s = SOLVENT_PEAKS[solvent];
  if (!s) return [];
  const f = nucleus === "1H" ? mhz : mhz * 0.25145;
  return nucleus === "1H"
    ? [...s.h.map(([ppm, n, j]) => ({ name: solvent, ppm, lines: deuterated(ppm, n, j, f, 1), broad: false })), ...(s.water !== undefined ? [{ name: "H₂O", ppm: s.water, lines: deuterated(s.water, 0, 0, f, 0.8), broad: true }] : [])]
    : s.c.map(([ppm, n, j]) => ({ name: solvent, ppm, lines: deuterated(ppm, n, j, f, 1.5), broad: false }));
}

const binomial = (n: number) => { const row = [1]; for (let k = 1; k <= n; k++) row.push((row[k - 1] * (n - k + 1)) / k); return row; };
// A ¹H signal's lines: first-order splitting by each coupling (n + 1 lines with binomial heights, J apart), the
// heights adding up to the signal's number of hydrogens.
export function lines(s: Signal, mhz: number): { ppm: number; h: number }[] {
  let out = [{ ppm: s.shift, h: s.nuclei }];
  for (const c of s.couplings) {
    const w = binomial(c.n), step = c.j / mhz, total = 2 ** c.n;
    out = out.flatMap((l) => w.map((k, i) => ({ ppm: l.ppm + (i - c.n / 2) * step, h: (l.h * k) / total })));
  }
  return out;
}
// The shift range to show all of a spectrum: 0 to 10 ppm for ¹H and 0 to 200 for ¹³C, wider if a shift is outside.
export function fullRange(p: Prediction | undefined, nucleus: Nucleus): [number, number] {
  const shifts = p?.signals.map((s) => s.shift) ?? [], [lo, hi] = nucleus === "1H" ? [0, 10] : [0, 200], pad = nucleus === "1H" ? 0.5 : 10;
  return [Math.min(lo, ...shifts.map((x) => x - pad)), Math.max(hi, ...shifts.map((x) => x + pad))];
}
// Axis ticks: the first step that gives at most one label per `room` (64 px in the panel), up to an IR range's.
export function ticks(lo: number, hi: number, width: number, room = 64) {
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((s) => (hi - lo) / s <= width / room) ?? 10000;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return { out, places: step < 0.1 ? 2 : step < 1 ? 1 : 0 };
}
// --- Peak labels -------------------------------------------------------------------------------------------------
// One layout for every row of peak labels: the page's (predicted, measured and mass spectra) and the panels'. The
// labels keep the peaks' order, never overlap, and each sits as near its peak as the widths allow. Each leader is a
// short stub under its label, a slant inside one band shared by every leader, and a straight drop to the top of its
// whole multiplet. The drops are at different x in the labels' order and the slants run between the same two heights,
// so no two leaders can cross. Close peaks (and one wide multiplet) share a bracket, and their leaders end on it.

// Labels in a row, as near their peaks (xs) as their widths allow: the least squares fit, solved exactly by pooling
// adjacent violators. Inside lo to hi when they fit there, packed and centred on the row when not. Peaks at the same x
// keep their order. Gives each label's centre.
export function layoutLabels(xs: number[], widths: number[], lo: number, hi: number): number[] {
  const n = xs.length, order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || a - b), out = new Array<number>(n);
  if (!n) return out;
  // Each label's offset from the first when packed (o): "no overlap" is then "c - o never goes down", an isotonic fit.
  const o = new Float64Array(n), mean: number[] = [], size: number[] = [];
  for (let k = 0; k < n; k++) {
    if (k) o[k] = o[k - 1] + (widths[order[k - 1]] + widths[order[k]]) / 2;
    let m = xs[order[k]] - o[k], c = 1;
    while (mean.length && mean[mean.length - 1] >= m) { const pc = size.pop()!; m = (mean.pop()! * pc + m * c) / (pc + c); c += pc; }
    mean.push(m); size.push(c);
  }
  const first = lo + widths[order[0]] / 2, last = hi - widths[order[n - 1]] / 2 - o[n - 1];
  for (let b = 0, k = 0; b < mean.length; b++) {
    const d = first > last ? (first + last) / 2 : Math.min(last, Math.max(first, mean[b]));
    for (let j = 0; j < size[b]; j++, k++) out[order[k]] = d + o[k];
  }
  return out;
}
// Whether the labels turn: Vertical, or Auto when a peak's label across would have its near edge further than its own
// width from its peak. plain: the names (the solvent's, TMS's), which take their place in the row but do not turn it.
export type LabelTurn = "auto" | "horizontal" | "vertical";
export function turned(turn: LabelTurn, xs: number[], across: number[], lo: number, hi: number, plain: (boolean | undefined)[] = []): boolean {
  if (turn !== "auto") return turn === "vertical";
  const at = layoutLabels(xs, across, lo, hi);
  return xs.some((x, i) => !plain[i] && Math.abs(at[i] - x) > 1.5 * across[i] + 1e-9);
}
// A peak to label: its x, the x its lines run from and to, its label's width across the row, and plain (the solvent's
// and TMS's names): no leader while the label is over the peak.
export type LabelPeak = { x: number; a: number; b: number; width: number; plain?: boolean };
// The row's room, with heights up from the axis: the frame (lo to hi), the tallest ink, the ink's top from a to b, one
// point, the gap left over the ink, the slants' band and the stubs' length.
export type LabelRoom = { lo: number; hi: number; ceiling: number; ink: (a: number, b: number) => number; pt: number; gap: number; band: number; stub: number };
// Each label's centre, the row's base (the labels' bottom), each label's leader (from the label down; none for a plain
// label over its peak), and each bracket (its peaks and its points: an end tick, across, the other end tick).
export type LabelRow = { at: number[]; base: number; leaders: P[][]; brackets: { peaks: number[]; points: P[] }[] };
export function labelRow(peaks: LabelPeak[], r: LabelRoom): LabelRow {
  const n = peaks.length, at = layoutLabels(peaks.map((p) => p.x), peaks.map((p) => p.width), r.lo, r.hi);
  const order = peaks.map((_, i) => i).sort((a, b) => peaks[a].x - peaks[b].x || a - b);
  const lo = (p: LabelPeak) => Math.min(p.a, p.b, p.x), hi = (p: LabelPeak) => Math.max(p.a, p.b, p.x), near = r.pt / 4;
  // Clusters: peaks whose lines overlap or come within 1.5 pt, in x order.
  const clusters: { ids: number[]; a: number; b: number }[] = [];
  for (const i of order) {
    const c = clusters[clusters.length - 1], p = peaks[i];
    if (c && lo(p) - c.b < 1.5 * r.pt) { c.ids.push(i); c.b = Math.max(c.b, hi(p)); } else clusters.push({ ids: [i], a: lo(p), b: hi(p) });
  }
  const drop = new Array<number>(n), end = new Array<number>(n), brackets: LabelRow["brackets"] = [];
  clusters.forEach((c, k) => {
    if (c.ids.length === 1 && c.b - c.a <= 3 * r.pt) { const i = c.ids[0]; drop[i] = peaks[i].x; end[i] = r.ink(c.a - near, c.b + near) + r.gap; return; }
    // A bracket over the cluster, wide enough for a point between its drops, but no nearer a neighbour than halfway.
    const room = c.ids.length * r.pt, grow = Math.max(0, (room - (c.b - c.a)) / 2);
    const a = Math.max(k ? (clusters[k - 1].b + c.a) / 2 : -Infinity, c.a - grow), b = Math.min(k < clusters.length - 1 ? (c.b + clusters[k + 1].a) / 2 : Infinity, c.b + grow);
    const step = Math.min(r.pt, (b - a) / c.ids.length), at2 = layoutLabels(c.ids.map((i) => peaks[i].x), c.ids.map(() => step), a, b), y = r.ink(a - near, b + near) + r.gap;
    c.ids.forEach((i, j) => { drop[i] = at2[j]; end[i] = y; });
    brackets.push({ peaks: c.ids, points: [[a, y - 0.6 * r.gap], [a, y], [b, y], [b, y - 0.6 * r.gap]] });
  });
  const bottom = end.reduce((v, e) => Math.max(v, e), r.ceiling + r.gap) + r.gap, top = bottom + r.band, base = top + r.stub;
  const bracketed = new Set(brackets.flatMap((b) => b.peaks));
  const leaders = peaks.map((p, i): P[] => {
    if (p.plain && !bracketed.has(i) && Math.abs(at[i] - p.x) <= p.width / 2) return [];
    return Math.abs(at[i] - drop[i]) < 1e-9 ? [[at[i], base], [drop[i], end[i]]] : [[at[i], base], [at[i], top], [drop[i], bottom], [drop[i], end[i]]];
  });
  return { at, base, leaders, brackets };
}
// The top of some ink ([x, height] points in any order) from a to b: what a leader drops to.
export function inkOf(points: [number, number][]): (a: number, b: number) => number {
  const xs = Float64Array.from(points.map((q) => q[0]).sort((u, v) => u - v)), at = new Map<number, number>();
  for (const [u, h] of points) at.set(u, Math.max(at.get(u) ?? -Infinity, h));
  const hs = Float64Array.from(xs, (u) => at.get(u)!);
  return (a, b) => { let best = 0; for (let i = firstAt(xs, a); i < xs.length && xs[i] <= b; i++) best = Math.max(best, hs[i]); return best; };
}
// The em widths of Arial (spectrumFigure's default for its labels).
const arial = (t: string) => widthOf(t, 1);
// A measured trace as a plot draws it, `width` pixels wide: each point as [pixel, value] when the points are further
// apart than half a pixel; otherwise, for each pixel, the lowest and highest of the points in it (in the order they
// come), so no peak is lost between pixels. px: a point's pixel from its x. Points well outside the plot are left out.
export function traceColumns(s: { first: number; last: number; y: ArrayLike<number>; xs?: ArrayLike<number> }, px: (x: number) => number, width: number): [number, number][] {
  const n = s.y.length, xAt = (i: number) => (s.xs ? s.xs[i] : s.first + (i * (s.last - s.first)) / Math.max(1, n - 1));
  let i0 = 0, i1 = n - 1;
  if (!s.xs && n > 1) {
    // The pixel is a straight line in the point's index: the points from 2 px left of the plot to 2 px right of it.
    const a = px(xAt(0)), b = px(xAt(1)) - a, at = (p: number) => (b ? (p - a) / b : 0);
    i0 = Math.max(0, Math.floor(Math.min(at(-2), at(width + 2))));
    i1 = Math.min(n - 1, Math.ceil(Math.max(at(-2), at(width + 2))));
  }
  const out: [number, number][] = [];
  if (i1 - i0 <= 2 * width) {
    for (let i = i0; i <= i1; i++) { const p = px(xAt(i)); if (p >= -2 && p <= width + 2) out.push([p, s.y[i]]); }
    return out;
  }
  let col = NaN, lo = 0, hi = 0, loAt = 0, hiAt = 0;
  const flush = () => { if (!Number.isNaN(col)) out.push(...((loAt <= hiAt ? [[col, lo], [col, hi]] : [[col, hi], [col, lo]]) as [number, number][])); };
  for (let i = i0; i <= i1; i++) {
    const p = Math.round(px(xAt(i))), v = s.y[i];
    if (p < -2 || p > width + 2) continue;
    if (p !== col) { flush(); col = p; lo = hi = v; loAt = hiAt = i; continue; }
    if (v < lo) { lo = v; loAt = i; }
    if (v > hi) { hi = v; hiAt = i; }
  }
  flush();
  return out;
}

// --- The line engine ----------------------------------------------------------------------------------------------
// One list of lines and one sampler for every predicted trace: the panel's trace and colour fills, and the page's
// trace and fills (Add to drawing > Spectrum). A measured trace goes through the same curve fit (fitCurve).

// A line's half width at half height (Hz): a sharp line, a broad (exchanging) signal's, and water's.
const SHARP = 0.6, BROAD = 12, WATER = 6;
// A Lorentzian line: its shift and height, its half width (ppm), and its signal (an index into the signals; the
// solvent's peak k is -1 - k).
export type Line = { ppm: number; h: number; w: number; signal: number };
// Every line of a predicted spectrum: ¹H each multiplet's lines, ¹³C one for each signal, then the solvent's.
// mhz: the ¹H frequency.
export function spectrumLines(signals: Signal[], nucleus: Nucleus, mhz: number, solvent: SolventPeak[] = []): Line[] {
  const f = nucleus === "1H" ? mhz : mhz * 0.25145;
  return [
    ...signals.flatMap((s, k) => (nucleus === "1H" ? lines(s, mhz) : [{ ppm: s.shift, h: s.nuclei }]).map((l) => ({ ...l, w: (s.broad ? BROAD : SHARP) / f, signal: k }))),
    ...solvent.flatMap((s, k) => s.lines.map((l) => ({ ...l, w: (s.broad ? WATER : SHARP) / f, signal: -1 - k }))),
  ];
}
// A trace as points in ppm order: each point's shift, value and slope (value per ppm), and which points are a line's
// centre. A measured trace has no slopes.
export type Trace = { x: Float64Array; y: Float64Array; d?: Float64Array; apex?: Uint8Array };
// The lines' tails left out add up to at most this share of the tallest line anywhere: each line's tail is left out
// where it is under this share over the number of lines.
const TAIL = 1e-3;
// The lines summed from lo to hi ppm: on an even grid at most half the narrowest half width apart (or `step`), plus
// each line's centre, so every line's top is a point. Each line counts only out to where its tail is under TAIL over
// the number of lines.
export function sample(ls: Line[], lo: number, hi: number, step = Infinity): Trace {
  const narrow = ls.reduce((v, l) => Math.min(v, l.w / 2), step), n = Math.max(1, Math.ceil((hi - lo) / (Number.isFinite(narrow) ? narrow : hi - lo))), dx = (hi - lo) / n;
  const centres = ls.map((l) => l.ppm).filter((v) => v > lo && v < hi).sort((a, b) => a - b);
  const x = new Float64Array(n + 1 + centres.length), apex = new Uint8Array(x.length);
  let k = 0, c = 0;
  for (let i = 0; i <= n; i++) {
    const g = lo + i * dx;
    for (; c < centres.length && centres[c] <= g; c++) {
      if (centres[c] === g) apex[k] = 1;
      else if (!k || x[k - 1] < centres[c]) { x[k] = centres[c]; apex[k++] = 1; }
    }
    x[k++] = g;
  }
  const xs = x.subarray(0, k), y = new Float64Array(k), d = new Float64Array(k), top = ls.reduce((v, l) => Math.max(v, l.h), 0);
  for (const l of ls) {
    const reach = l.w * Math.sqrt(Math.max(0, (l.h * ls.length) / (TAIL * top) - 1)), w2 = l.w * l.w, hw = l.h * w2;
    for (let i = firstAt(xs, l.ppm - reach); i < k && xs[i] <= l.ppm + reach; i++) {
      const u = xs[i] - l.ppm, q = 1 / (u * u + w2);
      y[i] += hw * q;
      d[i] -= 2 * hw * u * q * q;
    }
  }
  return { x: xs, y, d, apex: apex.subarray(0, k) };
}
// The first index whose x is at least v.
function firstAt(x: ArrayLike<number>, v: number) {
  let a = 0, b = x.length;
  while (a < b) { const m = (a + b) >> 1; if (x[m] < v) a = m + 1; else b = m; }
  return a;
}
// The tallest value of a trace from a to b ppm (0 if no point is there).
export function peakIn(t: Trace, a = -Infinity, b = Infinity): number {
  let best = 0;
  for (let i = firstAt(t.x, Math.min(a, b)); i < t.x.length && t.x[i] <= Math.max(a, b); i++) best = Math.max(best, t.y[i]);
  return best;
}
// A trace as the panel draws it, `width` pixels wide: each column's lowest and highest value (traceColumns).
export const columnsOf = (t: Trace, px: (ppm: number) => number, width: number) => traceColumns({ first: t.x[0], last: t.x[t.x.length - 1], y: t.y, xs: t.x }, px, width);
// A trace as one pen curve in ppm and value, as few points as keep every point within `tol` of the curve: each line's
// centre is a point, and the rest are added where the curve is furthest off. With slopes, a point's handles follow
// the slope a third of the way to its neighbours (so each piece is the cubic through both ends with their slopes);
// without, the points are corners.
export function fitCurve(t: Trace, tol: number): CurvePoint[] {
  const { x, y, d } = t, n = x.length;
  if (!n) return [];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  if (t.apex) for (let i = 0; i < n; i++) if (t.apex[i]) keep[i] = 1;
  // Each span between kept points: the point furthest from the piece across it is kept, until none is over tol.
  const spans: [number, number][] = [];
  for (let i = 0, a = 0; i < n; i++) if (keep[i] && i > a) { spans.push([a, i]); a = i; }
  while (spans.length) {
    const [a, b] = spans.pop()!, h = x[b] - x[a];
    let worst = tol, at = -1;
    for (let i = a + 1; i < b; i++) {
      const s = (x[i] - x[a]) / h, r = 1 - s;
      const v = d ? r * r * (1 + 2 * s) * y[a] + s * s * (3 - 2 * s) * y[b] + s * r * h * (r * d[a] - s * d[b]) : r * y[a] + s * y[b];
      if (Math.abs(v - y[i]) > worst) { worst = Math.abs(v - y[i]); at = i; }
    }
    if (at >= 0) { keep[at] = 1; spans.push([a, at], [at, b]); }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
  return idx.map((i, k) => {
    const p: CurvePoint = { at: [x[i], y[i]] };
    if (!d) return p;
    if (k > 0) { const h = (x[i] - x[idx[k - 1]]) / 3; p.c1 = [x[i] - h, y[i] - d[i] * h]; }
    if (k < idx.length - 1) { const h = (x[idx[k + 1]] - x[i]) / 3; p.c2 = [x[i] + h, y[i] + d[i] * h]; }
    return p;
  });
}
// A curve cut into pieces of at most `most` points (a pen curve's limit in .oct and CDXML), each cut at the lowest
// point it can be, so the pieces meet where the trace is nearest the axis. low: a point's height.
export function piecesOf(points: CurvePoint[], most = 1000, low = (p: CurvePoint) => p.at[1]): CurvePoint[][] {
  const out: CurvePoint[][] = [];
  while (points.length > most) {
    let cut = most >> 1;
    for (let i = cut; i < most; i++) if (low(points[i]) < low(points[cut])) cut = i;
    const p = points[cut];
    out.push([...points.slice(0, cut), { at: p.at, ...(p.c1 ? { c1: p.c1 } : {}) }]);
    points = [{ at: p.at, ...(p.c2 ? { c2: p.c2 } : {}) }, ...points.slice(cut + 1)];
  }
  out.push(points);
  return out;
}

type P = [number, number];
// The figure: lines (the axis, ticks, ¹³C sticks, label leaders and brackets), pen curves (the ¹H trace, in pieces of
// at most 1000 points, and each coloured peak's fill) and texts, each text at its baseline (turned: angle 90, read
// bottom to top) and all at the document's caption size. grey: the solvent's. fill: a closed curve filled in that
// colour. width: a text wraps to it. role: which part it is ("axis", "tick:7", "unit", "trace", "fill:a1b2", "peak:a1b2",
// "leader:peak:a1b2", "bracket:…", "solvent:CDCl₃", "title", "notice"). top: the top of the labels.
export type Figure = {
  lines: { from: P; to: P; colour?: string; grey?: true; role?: string }[];
  curves: { points: CurvePoint[]; grey?: true; fill?: string; role?: string }[];
  texts: { text: string; at: P; align: "left" | "centre" | "right"; colour?: string; grey?: true; angle?: number; width?: number; role?: string }[];
  top?: number;
};
// The notice the nmrshiftdb2 licence asks a published prediction to carry: the licence's own sentence.
export const NOTICE = "Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the nmrshiftdb2 Database License.";
// The grey of a solvent's peaks and of the notice on the page.
export const GREY = "#808080";
// A page spectrum's title, over its labels, and for a prediction the notice, under the axis's unit and wrapped to the
// figure's width. em: the caption size in bond lengths. The title's line, the figure's top.
export function addTitle(fig: Figure, o: { title: string; notice: boolean; width: number; height: number; em: number }): number {
  const top = (fig.top ?? o.height) + 0.6 * o.em;
  fig.texts.push({ text: o.title, at: [0, top + 0.4 * o.em], align: "left", role: "title" });
  if (o.notice) fig.texts.push({ text: NOTICE, at: [0, -0.15 - 3.1 * o.em], align: "left", grey: true, width: o.width, role: "notice" });
  return top;
}
// The notice under a structure (its atoms), wrapped to `width`, when the drawing has none (Add to drawing > Shifts
// beside atoms).
export const withNotice = (m: Mol, atoms: number[], width: number): Mol =>
  !atoms.length || m.captions?.some((c) => c.text.includes("nmrshiftdb2")) ? m : addCaption(m, { text: NOTICE, x: 0, y: 0, under: atoms, width, colour: GREY })[0];
// A figure on the page, its axis's left end at `at` (bond lengths): its lines, pen curves and captions, in one plain
// group (a click picks it whole, a double-click one part). The captions have no font or size of their own, so they
// take the document style's. Each part keeps its role, named as a page spectrum's are (pageplot.ts), so a label's
// leader follows it. The new drawing, and its parts' ids.
export function placeFigure(m: Mol, fig: Figure, at: P): [Mol, number[]] {
  const to = (q: P): P => [at[0] + q[0], at[1] + q[1]], items: number[] = [], seen = new Map<string, number>();
  const keep = ([next, id]: [Mol, number]) => { m = next; items.push(id); };
  const paint = (x: { colour?: string; grey?: true }) => (x.colour || x.grey ? { colour: x.colour ?? GREY } : {});
  const role = (r: string | undefined, q: P) => { if (!r) return {}; const n = seen.get(r) ?? 0; seen.set(r, n + 1); return { role: { role: n ? `${r}~${n}` : r, at: q } }; };
  for (const l of fig.lines) keep(addArrow(m, { kind: "line", from: to(l.from), to: to(l.to), ...paint(l), ...role(l.role, to(l.from)) }));
  for (const c of fig.curves) {
    const pts = c.points.map((q) => ({ at: to(q.at), ...(q.c1 ? { c1: to(q.c1) } : {}), ...(q.c2 ? { c2: to(q.c2) } : {}) }));
    keep(addArrow(m, { kind: "curve", from: pts[0].at, to: pts[pts.length - 1].at, curve: { points: pts, ...(c.fill ? { closed: true } : {}) }, ...(c.fill ? { fill: "solid" as const, colour: c.fill } : paint(c)), ...role(c.role, pts[0].at) }));
  }
  for (const t of fig.texts) keep(addCaption(m, { text: t.text, x: to(t.at)[0], y: to(t.at)[1], align: t.align, ...paint(t), ...(t.angle ? { angle: t.angle } : {}), ...(t.width ? { width: t.width } : {}), ...role(t.role, to(t.at)) }));
  return [groupSelection(m, new Set(), new Set(items))?.[0] ?? m, items];
}
// A peak's label on a page figure: its peak (x, and the x its lines run from and to), its lines across (bottom line
// first) and its one line turned, its colour, and its role. plain: the solvent's or TMS's name.
export type PageLabel = { x: number; a: number; b: number; across: string[]; turned: string; colour?: string; grey?: true; plain?: boolean; role: string };
// The labels in a row over a page figure W wide with its tallest ink H high, with their leaders and brackets. em: the
// label size; pt: a point; ink: the ink's top from a to b; measure: a text's width in em.
export function pageLabels(out: Figure, labels: PageLabel[], o: { width: number; height: number; em: number; pt: number; turn: LabelTurn; ink: (a: number, b: number) => number; measure?: (t: string) => number }) {
  const { em } = o, measure = o.measure ?? arial, xs = labels.map((l) => l.x);
  const across = labels.map((l) => em * (Math.max(...l.across.map(measure)) + 0.4));
  const turn = turned(o.turn, xs, across, 0, o.width, labels.map((l) => l.plain)), widths = turn ? labels.map(() => em * 1.3) : across;
  const row = labelRow(labels.map((l, i) => ({ x: l.x, a: l.a, b: l.b, width: widths[i], plain: l.plain })), { lo: 0, hi: o.width, ceiling: o.height, ink: o.ink, pt: o.pt, gap: 0.25 * em, band: 0.9 * em, stub: 0.25 * em });
  const paint = (l: PageLabel) => ({ ...(l.colour ? { colour: l.colour } : {}), ...(l.grey ? { grey: true as const } : {}) });
  let top = row.base;
  labels.forEach((l, i) => {
    const lx = row.at[i], pts = row.leaders[i];
    for (let k = 1; k < pts.length; k++) out.lines.push({ from: pts[k - 1], to: pts[k], ...paint(l), role: `leader:${l.role}` });
    if (turn) {
      out.texts.push({ text: l.turned, at: [lx + 0.36 * em, row.base + 0.15 * em], align: "left", ...paint(l), angle: 90, role: l.role });
      top = Math.max(top, row.base + 0.15 * em + em * measure(l.turned));
      return;
    }
    let y = row.base + 0.3 * em;
    l.across.forEach((text, k) => {
      if (k) y += 0.95 * em;
      out.texts.push({ text, at: [lx, y], align: "centre", ...paint(l), role: `${l.role}/${k}` });
    });
    top = Math.max(top, y + 0.75 * em);
  });
  for (const b of row.brackets) {
    const ls = b.peaks.map((i) => labels[i]), one = ls.every((l) => l.colour === ls[0].colour && l.grey === ls[0].grey) ? paint(ls[0]) : {};
    for (let k = 1; k < b.points.length; k++) out.lines.push({ from: b.points[k - 1], to: b.points[k], ...one, role: `bracket:${ls.map((l) => l.role).join(",")}` });
  }
  out.top = top;
}
// How far a page curve may be from its trace: this share of the tallest peak.
export const FIT = 0.004;
// A colour mixed with white, `t` of the colour: a coloured peak's fill on the page, as the panel shows it (35%).
export const tint = (hex: string, t = 0.35) => `#${[1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
// The spectrum as the panel shows it (the shifts from `range`, solvent peaks if asked), `width` long and its tallest
// peak `height` high, as a figure. em: the labels' size in bond lengths, to space them.
export function spectrumFigure(o: {
  prediction: Prediction; nucleus: Nucleus; mhz: number; solvent: string; solventPeaks: boolean; range: [number, number];
  colours: (string | undefined)[]; width: number; height: number; em: number; pt?: number; labels?: LabelTurn; measure?: (t: string) => number; keys?: string[];
}): Figure {
  const { prediction: p, nucleus, mhz, width: W, height: H, em } = o, [lo, hi] = o.range, h1 = nucleus === "1H";
  const x = (ppm: number) => ((hi - ppm) / (hi - lo)) * W, shown = (ppm: number) => ppm >= lo && ppm <= hi;
  const out: Figure = { lines: [], curves: [], texts: [] };
  const solvent = o.solventPeaks ? solventPeaks(o.solvent, nucleus, mhz) : [];
  const all = spectrumLines(p.signals, nucleus, mhz, solvent), own = all.filter((l) => l.signal >= 0);
  const trace = h1 ? sample(own, lo, hi) : undefined, solventTrace = h1 && solvent.length ? sample(all.filter((l) => l.signal < 0), lo, hi) : undefined;
  const top = h1 ? Math.max(1e-9, trace ? peakIn(trace) : 0, solventTrace ? peakIn(solventTrace) : 0) : Math.max(1, ...p.signals.map((s) => s.nuclei), ...solvent.flatMap((s) => s.lines.map((l) => l.h)));
  const y = (v: number) => (v / top) * H;
  // A signal's lines, and the shifts they run from and to.
  const linesOf = (k: number) => own.filter((l) => l.signal === k), span = (ls: { ppm: number }[]) => [Math.min(...ls.map((l) => l.ppm)), Math.max(...ls.map((l) => l.ppm))] as const;
  // A point from ppm and value to the page.
  const page = (q: CurvePoint): CurvePoint => ({ at: [x(q.at[0]), y(q.at[1])], ...(q.c1 ? { c1: [x(q.c1[0]), y(q.c1[1])] as P } : {}), ...(q.c2 ? { c2: [x(q.c2[0]), y(q.c2[1])] as P } : {}) });
  // A signal's key in the parts' roles: its own (spectrumKeys), else its place.
  const key = (k: number) => o.keys?.[k] ?? String(k);

  // The axis, its ticks and their shifts, and ppm under its low end.
  out.lines.push({ from: [0, 0], to: [W, 0], role: "axis" });
  const { out: tickAt, places } = ticks(lo, hi, W, 4 * em);
  for (const v of tickAt) {
    out.lines.push({ from: [x(v), 0], to: [x(v), -0.15], role: `tick:${v}` });
    out.texts.push({ text: v.toFixed(places), at: [x(v), -0.15 - 0.85 * em], align: "centre", role: `tick:${v}/n` });
  }
  out.texts.push({ text: "ppm", at: [W, -0.15 - 1.9 * em], align: "right", role: "unit" });
  // The traces: ¹H as curves, the solvent's in grey, under them each coloured peak filled from its own lines out to
  // where they are under 0.1% of the tallest peak; ¹³C as sticks.
  if (solventTrace) for (const ps of piecesOf(fitCurve(solventTrace, FIT * top))) out.curves.push({ points: ps.map(page), grey: true, role: "trace:solvent" });
  if (h1) p.signals.forEach((s, k) => {
    if (!o.colours[k] || !shown(s.shift)) return;
    const ls = linesOf(k), sum = ls.reduce((v, l) => v + l.h, 0), reach = Math.max(...ls.map((l) => l.w * Math.sqrt(sum / (0.001 * top)))), [a, b] = span(ls);
    const t = sample(ls, Math.max(lo, a - reach), Math.min(hi, b + reach));
    let ps = fitCurve(t, FIT * top);
    for (let tol = 2 * FIT * top; ps.length > 998; tol *= 2) ps = fitCurve(t, tol);
    const base = (v: number): CurvePoint => ({ at: [v, 0] });
    out.curves.push({ points: [base(t.x[0]), ...ps, base(t.x[t.x.length - 1])].map(page), fill: tint(o.colours[k]!), role: `fill:${key(k)}` });
  });
  if (trace) for (const ps of piecesOf(fitCurve(trace, FIT * top))) out.curves.push({ points: ps.map(page), role: "trace" });
  if (!h1) {
    for (const s of solvent) for (const l of s.lines) if (shown(l.ppm)) out.lines.push({ from: [x(l.ppm), 0], to: [x(l.ppm), y(l.h)], grey: true, role: `trace:${s.name}` });
    p.signals.forEach((s, k) => { if (shown(s.shift)) out.lines.push({ from: [x(s.shift), 0], to: [x(s.shift), y(s.nuclei)], colour: o.colours[k], role: `trace:${key(k)}` }); });
  }
  // Each peak's label in a row over the tallest peak: the shift, and for ¹H the multiplicity and the number of
  // hydrogens (across, two lines; turned, one in ACS order). The solvent's names join the row in grey.
  const label = (s: Signal) => (h1 ? `${multiplicity(s)}, ${s.nuclei}H` : s.nuclei > 1 ? `${s.nuclei}C` : "");
  const page2 = (ls: { ppm: number }[]) => { const [a, b] = span(ls); return { a: x(b), b: x(a) }; };
  const labels: PageLabel[] = [
    ...p.signals.flatMap((s, k): PageLabel[] => {
      if (!shown(s.shift)) return [];
      const second = label(s), shift = s.shift.toFixed(h1 ? 2 : 1);
      return [{ x: x(s.shift), ...page2(linesOf(k)), across: second ? [second, shift] : [shift], turned: second ? `${shift} (${second})` : shift, colour: o.colours[k], role: `peak:${key(k)}` }];
    }),
    ...solvent.flatMap((s): PageLabel[] => (shown(s.ppm) ? [{ x: x(s.ppm), ...page2(s.lines), across: [s.name], turned: s.name, grey: true, plain: true, role: `solvent:${s.name}` }] : [])),
  ];
  // The ink's top from a to b on the page: the traces' (¹H) or the sticks' (¹³C).
  const ppmOf = (v: number) => hi - (v / W) * (hi - lo);
  const ink = (a: number, b: number) => {
    const [u, v] = [ppmOf(b), ppmOf(a)];
    if (h1) return y(Math.max(trace ? peakIn(trace, u, v) : 0, solventTrace ? peakIn(solventTrace, u, v) : 0));
    return y(Math.max(0, ...p.signals.filter((s) => s.shift >= u && s.shift <= v).map((s) => s.nuclei), ...solvent.flatMap((s) => s.lines).filter((l) => l.ppm >= u && l.ppm <= v).map((l) => l.h)));
  };
  pageLabels(out, labels, { width: W, height: H, em, pt: o.pt ?? 1 / 14.4, turn: o.labels ?? "auto", ink, measure: o.measure });
  return out;
}
