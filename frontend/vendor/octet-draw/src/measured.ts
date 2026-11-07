// A measured spectrum in a drawing (audit item CH-29): the trace from a JCAMP-DX or Bruker file, its peaks, and its
// multiplets (groups of peaks), which the user links to atoms. Each atom keeps the ids of the multiplets it is
// assigned to (Atom.peaks), so assignments move, copy and undo with the atoms. The drawing keeps the trace, quantised
// to 16 bits, so a saved drawing opens with the spectrum, its multiplets and its assignments as they were.
import { MAX_POINTS, type JcampSpectrum, type Kind } from "./jcamp.ts";
import { multiplicity } from "./nmr.ts";
import { FIT, fitCurve, inkOf, pageLabels, piecesOf, solventPeaks, ticks, traceColumns, type Figure, type LabelTurn, type PageLabel } from "./spectrumplot.ts";

// A multiplet (for ¹H) or a peak: its range in x units, lo to hi. manual: the user drew its range (Shift-drag), so new
// peak picking keeps it.
export type Group = { id: number; lo: number; hi: number; manual?: true };
// y: the trace, as its 16-bit levels stand for values from lo to hi (so it saves and opens again unchanged).
// per: the integral of one nucleus (¹H), when the user set a multiplet's count.
// box: where ChemDraw had the spectrum on its page (bond lengths, y up, x0 y0 x1 y1), written back there.
export type Measured = {
  title: string; kind: Kind; nucleus?: string; mhz?: number; solvent?: string; xUnit: string; yUnit: string;
  first: number; last: number; y: Float32Array; lo: number; hi: number; xs?: Float64Array; sticks?: true;
  threshold: number; groups: Group[]; per?: number; box?: [number, number, number, number];
};

export const MAX_KEEP = 1 << 18; // points a drawing keeps of a spectrum (262,144); more are reduced, peaks kept
export const MAX_GROUPS = 2000;
export const THRESHOLD = 0.02; // the default: peaks from 2% of the tallest
const MAX_J = 18; // Hz: peaks further apart than this are in different multiplets

// The Spectrum panel's key for a spectrum: its nucleus for NMR ("1H", "13C"), otherwise its kind.
export const keyOf = (m: { kind: Kind; nucleus?: string }) => (m.kind === "nmr" ? m.nucleus ?? "1H" : m.kind);
// Its name, as the panel's title and the text line give it: ¹H NMR, ¹³C NMR, IR, UV-Vis, MS.
const SUP: Record<string, string> = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const nucleusText = (n: string) => n.replace(/^\d+/, (d) => [...d].map((c) => SUP[c]).join(""));
export function nameOf(key: string): string {
  if (key === "ir") return "IR";
  if (key === "uv") return "UV-Vis";
  if (key === "ms") return "MS";
  if (key === "other") return "Spectrum";
  return `${nucleusText(key)} NMR`;
}
// NMR and IR run from high to low, left to right.
export const reversed = (m: { kind: Kind }) => m.kind === "nmr" || m.kind === "ir";

// --- From a file ------------------------------------------------------------------------------------------------

// A spectrum read from a file, as a drawing keeps it: at most MAX_KEEP points (each kept point the largest of the
// ones it stands for, so no peak is lost), quantised to 16 bits, with its peaks picked and grouped. `id`: the first
// free group id in the drawing.
export function fromJcamp(s: JcampSpectrum, id: number): Measured {
  let y = s.y, xs = s.xs, first = s.first, last = s.last;
  if (y.length > MAX_KEEP && !xs) {
    const k = Math.ceil(y.length / MAX_KEEP), n = Math.ceil(y.length / k), base = median(y), out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let best = y[i * k];
      for (let j = i * k; j < Math.min(y.length, (i + 1) * k); j++) if (Math.abs(y[j] - base) > Math.abs(best - base)) best = y[j];
      out[i] = best;
    }
    last = first + ((last - first) * (n - 1) * k) / (y.length - 1);
    y = out;
  } else if (y.length > MAX_KEEP) { y = y.slice(0, MAX_KEEP); xs = xs!.slice(0, MAX_KEEP); last = xs[xs.length - 1]; }
  const q = quantise(y);
  const m: Measured = {
    title: s.title, kind: s.kind, xUnit: s.xUnit, yUnit: s.yUnit, first, last, y: dequantise(q), lo: q.lo, hi: q.hi, threshold: THRESHOLD, groups: [],
    ...(s.nucleus ? { nucleus: s.nucleus } : {}), ...(s.mhz ? { mhz: s.mhz } : {}), ...(s.solvent ? { solvent: s.solvent } : {}),
    ...(xs ? { xs: Float64Array.from(xs) } : {}), ...(s.sticks ? { sticks: true as const } : {}),
  };
  return { ...m, groups: autoGroups(m, pickPeaks(m)).map((g, k) => ({ ...g, id: id + k })) };
}

// 16-bit levels from the lowest value to the highest, and back.
type Quantised = { q: Int16Array; lo: number; hi: number };
function quantise(y: ArrayLike<number>, lo = Infinity, hi = -Infinity): Quantised {
  if (!(hi > lo)) for (let i = 0; i < y.length; i++) { lo = Math.min(lo, y[i]); hi = Math.max(hi, y[i]); }
  if (!(hi > lo)) hi = lo + 1;
  const q = new Int16Array(y.length), f = 65535 / (hi - lo);
  for (let i = 0; i < y.length; i++) q[i] = Math.max(0, Math.min(65535, Math.round((y[i] - lo) * f))) - 32768;
  return { q, lo, hi };
}
const dequantise = ({ q, lo, hi }: Quantised) => { const out = new Float32Array(q.length), f = (hi - lo) / 65535; for (let i = 0; i < q.length; i++) out[i] = lo + (q[i] + 32768) * f; return out; };

// --- Peaks ------------------------------------------------------------------------------------------------------

export type Peak = { x: number; h: number; i: number }; // a peak's position (x units), its height above the baseline and its point
function median(y: ArrayLike<number>): number {
  const step = Math.max(1, Math.floor(y.length / 65536)), s: number[] = [];
  for (let i = 0; i < y.length; i += step) s.push(y[i]);
  s.sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}
// x at point i (fractional for uniform data).
export const xAt = (m: Pick<Measured, "first" | "last" | "y" | "xs">, i: number) => (m.xs ? m.xs[Math.max(0, Math.min(m.xs.length - 1, Math.round(i)))] : m.first + (i * (m.last - m.first)) / Math.max(1, m.y.length - 1));
// The point nearest x (uniform data), clamped to the spectrum.
const indexAt = (m: Measured, x: number) => Math.max(0, Math.min(m.y.length - 1, Math.round(((x - m.first) / (m.last - m.first || 1)) * (m.y.length - 1))));
// Transmittance dips: an IR spectrum in %T (or T, from ChemDraw) is read upside down.
const sign = (m: Measured) => (/%T|TRANSMIT|^T$/i.test(m.yUnit) ? -1 : 1);

// The baseline (the median), the noise (from the median distance from it) and the tallest point above it.
export function levels(m: Measured) {
  const s = sign(m), v = m.y.map((x) => x * s);
  const base = m.sticks ? 0 : median(v), dev = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) dev[i] = Math.abs(v[i] - base);
  let top = 0;
  for (let i = 0; i < v.length; i++) top = Math.max(top, v[i] - base);
  return { v, base, noise: m.sticks ? 0 : 1.4826 * median(dev), top };
}

// Peaks: local highs above `threshold` of the tallest (and four times the noise), each standing out from its
// surroundings by half that much, at the top of a parabola through it and its neighbours. A peak table's sticks are
// its peaks.
export function pickPeaks(m: Measured, threshold = m.threshold): Peak[] {
  const { v, base, noise, top } = levels(m), out: Peak[] = [];
  if (!(top > 0)) return out;
  if (m.sticks) {
    v.forEach((h, i) => { if (h >= threshold * top) out.push({ x: xAt(m, i), h, i }); });
    return out;
  }
  const level = base + Math.max(threshold * top, 4 * noise), stand = Math.max(3 * noise, 0.5 * threshold * top), n = v.length, W = 4096;
  for (let i = 1; i < n - 1; i++) {
    if (!(v[i] > level && v[i] >= v[i - 1] && v[i] > v[i + 1])) continue;
    let left = v[i], right = v[i];
    for (let j = i - 1; j >= Math.max(0, i - W) && v[j] <= v[i]; j--) left = Math.min(left, v[j]);
    for (let j = i + 1; j < Math.min(n, i + W) && v[j] <= v[i]; j++) right = Math.min(right, v[j]);
    if (v[i] - Math.max(left, right) < stand) continue;
    const a = v[i - 1], b = v[i], c = v[i + 1], d = a - 2 * b + c, off = d < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / d)) : 0;
    out.push({ x: m.xs ? xAt(m, i) : xAt(m, i + off), h: b - 0.25 * (a - c) * off - base, i });
  }
  return out;
}

// Groups from peaks: for ¹H, peaks no more than MAX_J Hz apart make one multiplet; otherwise each peak is its own.
// Each group's range reaches out from its outer peaks to where the trace meets the baseline, and twice that far
// again for the tails, but no further than halfway to the next group.
// The solvent's, water's and TMS's peaks where a spectrum in this solvent has them: each one's name, its lines (ppm)
// and how near a peak must be to be one of them.
export function marksOf(m: Measured, solvent = m.solvent ?? ""): { name: string; at: number[]; near: number }[] {
  if (m.kind !== "nmr" || (m.nucleus !== "1H" && m.nucleus !== "13C")) return [];
  const h1 = m.nucleus === "1H", mhz = m.mhz ? (h1 ? m.mhz : m.mhz / 0.25145) : 400;
  return [...solventPeaks(solvent, m.nucleus, mhz).map((s) => ({ name: s.name, at: s.lines.map((x) => x.ppm), near: h1 ? (s.broad ? 0.03 : 0.004) : 0.2 })), { name: "TMS", at: [0], near: h1 ? 0.01 : 0.2 }];
}

// Groups from peaks: for ¹H, peaks no more than MAX_J Hz apart make one multiplet; otherwise each peak is its own.
// In NMR the solvent's, water's and TMS's lines are apart, each set one group (CDCl₃'s ¹³C triplet is one).
export function autoGroups(m: Measured, peaks: Peak[]): Omit<Group, "id">[] {
  if (!peaks.length) return [];
  const sorted = [...peaks].sort((a, b) => a.x - b.x), runs: Peak[][] = [];
  const hz = m.kind === "nmr" && m.nucleus === "1H" && m.mhz ? m.mhz : 0;
  const marks = m.kind === "nmr" ? marksOf(m) : [], markOf = (p: Peak) => marks.findIndex((k) => k.at.some((x) => Math.abs(x - p.x) <= k.near));
  const own = new Map<number, Peak[]>();
  for (const p of sorted) {
    const k = markOf(p);
    if (k >= 0) { own.set(k, [...(own.get(k) ?? []), p]); continue; }
    const run = runs[runs.length - 1];
    if (run && hz && (p.x - run[run.length - 1].x) * hz <= MAX_J) run.push(p); else runs.push([p]);
  }
  runs.push(...own.values());
  runs.sort((a, b) => a[0].x - b[0].x);
  if (m.sticks) return runs.map((r) => ({ lo: r[0].x, hi: r[r.length - 1].x }));
  const { v, base, noise } = levels(m), n = v.length;
  // How far the trace goes on from point i in direction d before it meets the baseline (x units).
  const reach = (p: Peak, d: number) => {
    const floor = base + Math.max(2 * noise, 0.01 * p.h);
    let j = p.i;
    while (j + d >= 0 && j + d < n && Math.abs(j - p.i) < 4096 && v[j] > floor) j += d;
    return Math.abs(xAt(m, j) - xAt(m, p.i)) + Math.abs(xAt(m, 1) - xAt(m, 0));
  };
  return runs.map((r, k) => {
    const lo = r[0], hi = r[r.length - 1];
    const roomLo = k ? (lo.x - runs[k - 1][runs[k - 1].length - 1].x) / 2 : Infinity, roomHi = k < runs.length - 1 ? (runs[k + 1][0].x - hi.x) / 2 : Infinity;
    // Points run high to low or low to high: reach out the way x goes down, and up.
    const down = m.last < m.first ? 1 : -1;
    return { lo: lo.x - Math.min(2 * reach(lo, down), roomLo), hi: hi.x + Math.min(2 * reach(hi, -down), roomHi) };
  });
}

// A mass spectrum's peaks as Mass Spec Analysis takes a peak list: each peak above the threshold (each stick of a peak
// table), its m/z and its height against the tallest as 100. At most 20,000, the tallest.
export function msPeaks(m: Measured): { mz: number; i: number }[] {
  const peaks = pickPeaks(m), top = peaks.reduce((t, p) => Math.max(t, p.h), 0);
  return [...peaks].sort((p, q) => q.h - p.h).slice(0, 20000).filter((p) => p.x > 0).map((p) => ({ mz: p.x, i: top > 0 ? (p.h / top) * 100 : 100 })).sort((p, q) => p.mz - q.mz);
}

// --- Multiplets ---------------------------------------------------------------------------------------------------

// A first-order multiplet's couplings from its lines (Hz and heights), by Hoye's method (J. Org. Chem. 1994, 59,
// 4096; 2002, 67, 4014): the lines as components, each counted in units of the outer lines, the first J from the
// first line to the next, each further J from the first line to the first component the Js so far do not explain.
// Undefined when the lines are not a first-order pattern (not symmetrical, not 2ⁿ components, or left unexplained).
export function firstOrder(lines: { hz: number; h: number }[], tol: number): { j: number; n: number }[] | undefined {
  const l = [...lines].sort((a, b) => a.hz - b.hz), n = l.length;
  if (n === 1) return [];
  const mid = (l[0].hz + l[n - 1].hz) / 2;
  if (l.some((x, i) => Math.abs(x.hz + l[n - 1 - i].hz - 2 * mid) > 2 * tol)) return undefined;
  // Heights averaged with their mirror lines (cancelling the roof effect), in units of the outer lines.
  const hs = l.map((x, i) => (x.h + l[n - 1 - i].h) / 2), counts = hs.map((h) => Math.round(h / hs[0]));
  if (counts.some((c, i) => c < 1 || Math.abs(hs[i] / hs[0] - c) > 0.35 * c + 0.15)) return undefined;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total > 64 || total & (total - 1)) return undefined;
  const comps = l.flatMap((x, i) => Array<number>(counts[i]).fill(x.hz - l[0].hz));
  const js: number[] = [];
  let sums = [0];
  while (sums.length < total) {
    // The first component the sums so far do not explain; a sum with no component means it is not first order.
    let i = 0, k = 0, free: number | undefined;
    while (i < comps.length && free === undefined) {
      if (k < sums.length && Math.abs(sums[k] - comps[i]) <= 2 * tol) { i++; k++; }
      else if (k < sums.length && sums[k] < comps[i]) return undefined;
      else free = comps[i];
    }
    if (free === undefined || free <= tol) return undefined;
    js.push(free);
    sums = [...sums, ...sums.map((s) => s + free!)].sort((a, b) => a - b);
  }
  if (sums.some((s, i) => Math.abs(s - comps[i]) > 3 * tol)) return undefined;
  // Equal Js are one coupling to that many nuclei; one coupling alone takes its J from the whole width.
  const out: { j: number; n: number }[] = [];
  for (const j of js.sort((a, b) => b - a)) {
    const same = out.find((c) => Math.abs(c.j - j) <= 2 * tol);
    if (same) { same.j = (same.j * same.n + j) / (same.n + 1); same.n++; } else out.push({ j, n: 1 });
  }
  if (out.length === 1) out[0].j = (l[n - 1].hz - l[0].hz) / out[0].n;
  return out;
}

// A group as analysed: its peaks, its shift (the middle of a first-order multiplet, or the weighted middle), its
// multiplicity and Js (¹H), its area and number of nuclei, and what it is when it is not the compound (the solvent,
// water or TMS), which leaves it out of the text line.
export type Analysed = Group & { peaks: Peak[]; shift: number; name: string; js: number[]; area: number; n: number; other?: string };
export type Analysis = { peaks: Peak[]; groups: Analysed[]; per: number; base: number; noise: number };

export function analyse(m: Measured, solvent = m.solvent ?? ""): Analysis {
  const peaks = pickPeaks(m), { v, base, noise } = levels(m), h1 = m.kind === "nmr" && m.nucleus === "1H", mhz = m.mhz ?? 0;
  const step = m.y.length > 1 ? Math.abs(m.last - m.first) / (m.y.length - 1) : 0, tol = Math.max(0.3, 0.75 * step * mhz);
  const marks = marksOf(m, solvent);
  const groups = m.groups.map((g): Analysed => {
    let own = peaks.filter((p) => p.x >= g.lo && p.x <= g.hi);
    let area = 0;
    if (m.sticks) area = own.reduce((s, p) => s + p.h, 0);
    else {
      const a = indexAt(m, g.lo), b = indexAt(m, g.hi), dx = step;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) area += (v[i] - base) * dx;
      if (!own.length) {
        // No peak above the threshold in a range the user drew: its highest point stands for it.
        let best = Math.min(a, b);
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (v[i] > v[best]) best = i;
        own = [{ x: xAt(m, best), h: v[best] - base, i: best }];
      }
    }
    own.sort((p, q) => q.x - p.x);
    // The weighted middle of its peaks; a flat range (a link read from a file over no peak) by its points' or its own.
    const weight = own.reduce((s, p) => s + p.h, 0);
    let name = "", js: number[] = [], shift = weight ? own.reduce((s, p) => s + p.x * p.h, 0) / weight : own.length ? own.reduce((s, p) => s + p.x, 0) / own.length : (g.lo + g.hi) / 2;
    if (h1) {
      const fit = firstOrder(own.map((p) => ({ hz: p.x * mhz, h: p.h })), tol);
      if (fit) {
        shift = (own[0].x + own[own.length - 1].x) / 2;
        js = fit.map((c) => c.j);
        name = multiplicity({ couplings: fit, broad: own.length === 1 && width(m, v, base, own[0]) * mhz > 4 } as Parameters<typeof multiplicity>[0]);
        if (name === "m") js = [];
      } else name = "m";
    }
    // The solvent, water or TMS: a small group (a peak, or the solvent's own few lines) where one of theirs is.
    const other = !h1 || own.length <= 5 ? marks.find((s) => own.every((p) => s.at.some((x) => Math.abs(x - p.x) <= Math.max(s.near, 1.5 / (mhz || 400)))))?.name : undefined;
    return { ...g, peaks: own, shift, name, js, area, n: 0, ...(other ? { other } : {}) };
  });
  const counted = groups.filter((g) => !g.other && g.area > 0);
  const per = m.per ?? (h1 ? autoPer(counted.map((g) => g.area)) : Math.max(1e-30, ...counted.map((g) => g.area)));
  for (const g of groups) g.n = per > 0 ? g.area / per : 0;
  return { peaks, groups, per, base, noise };
}
// A peak's width at half its height (x units).
function width(m: Measured, v: ArrayLike<number>, base: number, p: Peak): number {
  const half = base + p.h / 2;
  let a = p.i, b = p.i;
  while (a > 0 && v[a] > half) a--;
  while (b < v.length - 1 && v[b] > half) b++;
  return Math.abs(xAt(m, b) - xAt(m, a));
}
// The integral of one hydrogen when the user has set none: the one that makes the multiplets' counts closest to whole
// numbers, each multiplet in turn taken as one, two or three hydrogens, fewer hydrogens in all winning a tie.
function autoPer(areas: number[]): number {
  let best = 0, score = Infinity;
  for (const a of areas) for (const k of [1, 2, 3]) {
    const per = a / k;
    const s = areas.reduce((sum, x) => { const n = x / per; return sum + (n < 0.5 ? n : Math.abs(n - Math.round(n))) + 0.02 * Math.round(n); }, 0);
    if (s < score - 1e-9) { score = s; best = per; }
  }
  return best || 1;
}

// --- Editing ----------------------------------------------------------------------------------------------------

// New groups for a new threshold. A new group keeps the id of an old one inside it, so its atoms stay linked; ranges
// the user drew stay as they were. `next`: the first free id.
export function regroup(m: Measured, threshold: number, next: number): Measured {
  const manual = m.groups.filter((g) => g.manual), olds = m.groups.filter((g) => !g.manual), used = new Set<number>();
  const fresh = autoGroups({ ...m, threshold }, pickPeaks(m, threshold)).filter((g) => !manual.some((x) => x.lo <= g.hi && g.lo <= x.hi));
  const groups = fresh.map((g) => {
    const old = olds.find((o) => !used.has(o.id) && (o.lo + o.hi) / 2 >= g.lo && (o.lo + o.hi) / 2 <= g.hi);
    if (old) used.add(old.id);
    return { ...g, id: old ? old.id : next++ };
  });
  return { ...m, threshold, groups: [...manual, ...groups].sort((a, b) => b.lo - a.lo) };
}
// A spectrum opened over one of its kind keeps the old one's ids for the multiplets it still has (an old multiplet's
// middle inside a new one's range), so its atoms stay linked. `next`: the first free id.
export function keepIds(fresh: Measured, old: Measured | undefined, next: number): Measured {
  if (!old) return fresh;
  const used = new Set<number>();
  const groups = fresh.groups.map((g) => {
    const o = old.groups.find((x) => !used.has(x.id) && (x.lo + x.hi) / 2 >= g.lo && (x.lo + x.hi) / 2 <= g.hi);
    if (o) used.add(o.id);
    return { ...g, id: o ? o.id : next++ };
  });
  return { ...fresh, groups };
}
// A group the user drew from lo to hi: it takes the place of the groups it overlaps, and the id of the first of them.
export function defineGroup(m: Measured, lo: number, hi: number, next: number): Measured {
  const over = m.groups.filter((g) => g.lo <= hi && lo <= g.hi);
  const g: Group = { id: over[0]?.id ?? next, lo, hi, manual: true };
  return { ...m, groups: [...m.groups.filter((x) => !over.includes(x)), g].sort((a, b) => b.lo - a.lo) };
}
// The first group id free in a drawing's spectra.
export const nextGroupId = (spectra: Measured[] | undefined) => Math.max(0, ...(spectra ?? []).flatMap((s) => s.groups.map((g) => g.id))) + 1;

// --- The text line ----------------------------------------------------------------------------------------------

// The spectrum as a journal's characterisation line (ACS style), from its multiplets high to low: "¹H NMR (400 MHz,
// CDCl₃) δ 7.26 (d, J = 8.0 Hz, 2H), 7.35–7.20 (m, 5H)", a multiplet m by the range of its peaks. ¹³C and other
// nuclei list their shifts; IR its wavenumbers, UV-Vis its wavelengths, and MS each m/z with its height against the
// tallest. The solvent, water and TMS are left out.
export function measuredText(m: Measured, a: Analysis, solvent = m.solvent ?? ""): string {
  const gs = a.groups.filter((g) => !g.other).sort((p, q) => q.shift - p.shift);
  if (!gs.length) return "";
  if (m.kind === "nmr") return `${measuredHead(m, solvent)} δ ${gs.map((g) => groupText(m, g)).join(", ")}.`;
  if (m.kind === "ir") return `IR ν̃ ${gs.map((g) => Math.round(g.shift)).join(", ")} cm⁻¹.`;
  if (m.kind === "uv") return `UV-Vis λmax ${gs.sort((p, q) => p.shift - q.shift).map((g) => Math.round(g.shift)).join(", ")} nm.`;
  if (m.kind === "ms") {
    const top = Math.max(...gs.map((g) => g.peaks[0]?.h ?? 0)), whole = gs.every((g) => Math.abs(g.shift - Math.round(g.shift)) < 0.05);
    const shown = [...gs].sort((p, q) => (q.peaks[0]?.h ?? 0) - (p.peaks[0]?.h ?? 0)).slice(0, 12).sort((p, q) => q.shift - p.shift);
    return `MS m/z ${shown.map((g) => `${whole ? Math.round(g.shift) : g.shift.toFixed(4)} (${Math.round((100 * (g.peaks[0]?.h ?? 0)) / (top || 1))})`).join(", ")}.`;
  }
  return "";
}

// The text line's start for an NMR spectrum: "¹H NMR (400 MHz, CDCl₃)"; otherwise the spectrum's name.
export function measuredHead(m: Measured, solvent = m.solvent ?? ""): string {
  const head = m.kind === "nmr" ? [m.mhz ? `${Math.round(m.mhz)} MHz` : "", solvent].filter(Boolean).join(", ") : "";
  return `${nameOf(keyOf(m))}${head ? ` (${head})` : ""}`;
}
// One multiplet as the text line gives it: ¹H "7.26 (d, J = 8.0 Hz, 2H)" or "7.35–7.20 (m, 5H)"; otherwise its shift.
export function groupText(m: Measured, g: Analysed): string {
  if (m.kind !== "nmr") return g.shift.toFixed(m.kind === "ms" && Math.abs(g.shift - Math.round(g.shift)) >= 0.05 ? 1 : 0);
  if (m.nucleus !== "1H") return g.shift.toFixed(1);
  const n = `${Math.max(1, Math.round(g.n))}H`;
  if (g.name === "m" && g.peaks.length > 1) return `${g.peaks[0].x.toFixed(2)}–${g.peaks[g.peaks.length - 1].x.toFixed(2)} (m, ${n})`;
  return `${g.shift.toFixed(2)} (${g.name}${g.js.length ? `, J = ${g.js.map((j) => j.toFixed(1)).join(", ")} Hz` : ""}, ${n})`;
}

// The measured spectrum as a figure for the page (Add to drawing > Spectrum), as spectrumFigure draws a predicted one:
// the axis and its ticks, the trace (COLUMNS columns' lowest and highest points, as few as keep every one within FIT
// of the curve, in pieces of at most 1000) or the sticks, the solvent and TMS named in grey, and each multiplet's label
// in its colour, over the range shown.
// Columns across a measured trace on the page: about 1.5 Hz each over 0 to 12 ppm at 500 MHz, so multiplets keep their
// lines, and a noisy trace stays at 8000 points or fewer.
const COLUMNS = 4000;
export function measuredFigure(o: {
  m: Measured; a: Analysis; range: [number, number]; colour: (id: number) => string | undefined; width: number; height: number; em: number;
  pt?: number; labels?: LabelTurn; measure?: (t: string) => number; base?: number;
}): Figure {
  const { m, a, width: W, height: H, em } = o, [lo, hi] = o.range, rev = reversed(m), h1 = m.kind === "nmr" && m.nucleus === "1H";
  const x = (v: number) => ((rev ? hi - v : v - lo) / (hi - lo)) * W, shown = (v: number) => v >= lo && v <= hi;
  const lv = levels(m), v = lv.v, base = o.base ?? lv.base, out: Figure = { lines: [], curves: [], texts: [] };
  // Scaled to the tallest point in range that is not the solvent's; taller ones are cut at the top.
  const others = a.groups.filter((g) => g.other);
  let top = 0;
  for (let i = 0; i < v.length; i++) { const xv = xAt(m, i); if (shown(xv) && !others.some((g) => xv >= g.lo && xv <= g.hi)) top = Math.max(top, v[i] - base); }
  top = top > 0 ? top * 1.05 : 1;
  const y = (val: number) => Math.max(-0.05 * H, Math.min(H, ((val - base) / top) * H));
  out.lines.push({ from: [0, 0], to: [W, 0], role: "axis" });
  const { out: tickAt, places } = ticks(lo, hi, W, 4 * em);
  for (const t of tickAt) { out.lines.push({ from: [x(t), 0], to: [x(t), -0.15], role: `tick:${t}` }); out.texts.push({ text: t.toFixed(places), at: [x(t), -0.15 - 0.85 * em], align: "centre", role: `tick:${t}/n` }); }
  out.texts.push({ text: m.xUnit, at: [W, -0.15 - 1.9 * em], align: "right", role: "unit" });
  // The ink as drawn, [x, height] in x order: the sticks, or the trace's columns. Its top from a to b places the leaders.
  const drawn: [number, number][] = [];
  if (m.sticks) v.forEach((val, i) => { const xv = xAt(m, i); if (shown(xv)) { out.lines.push({ from: [x(xv), 0], to: [x(xv), y(val)], role: "trace" }); drawn.push([x(xv), y(val)]); } });
  else {
    // Each of COLUMNS columns' lowest and highest point (as the panel draws a trace), held inside the plot as y holds
    // it, then fitted as the predicted trace is. The columns keep a noisy trace to a few curves.
    const cols = traceColumns({ first: m.first, last: m.last, y: v, xs: m.xs }, (xv) => (x(xv) / W) * COLUMNS, COLUMNS).filter(([c]) => c >= 0 && c <= COLUMNS);
    const held = (val: number) => Math.max(base - 0.05 * top, Math.min(base + top, val));
    const t = { x: Float64Array.from(cols, (c) => c[0]), y: Float64Array.from(cols, (c) => held(c[1])) };
    for (const ps of piecesOf(fitCurve(t, FIT * top))) out.curves.push({ points: ps.map((q) => ({ at: [(q.at[0] / COLUMNS) * W, y(q.at[1])] })), role: "trace" });
    for (const [c, val] of cols) drawn.push([(c / COLUMNS) * W, y(val)]);
  }
  const ink = inkOf(drawn);
  // Each multiplet's label in a row over the tallest peak, in its colour (¹H across: the shift over the multiplicity
  // and hydrogens; turned: one line in ACS order). The solvent and TMS join the row in grey.
  const dp = h1 ? 2 : m.kind === "nmr" ? 1 : 0, page2 = (g: Analysed) => { const [a, b] = [x(g.lo), x(g.hi)]; return { a: Math.min(a, b), b: Math.max(a, b) }; };
  const labels: PageLabel[] = a.groups.filter((g) => shown(g.shift)).map((g): PageLabel => {
    if (g.other) return { x: x(g.shift), ...page2(g), across: [g.other], turned: g.other, grey: true, plain: true, role: `solvent:${g.other}` };
    const shift = g.shift.toFixed(dp), second = h1 ? `${g.name}, ${Math.max(1, Math.round(g.n))}H` : "";
    return { x: x(g.shift), ...page2(g), across: second ? [second, shift] : [shift], turned: second ? `${shift} (${second})` : shift, colour: o.colour(g.id), role: `peak:${g.id}` };
  });
  pageLabels(out, labels, { width: W, height: H, em, pt: o.pt ?? 1 / 14.4, turn: o.labels ?? "auto", ink, measure: o.measure });
  return out;
}

// --- ChemDraw's spectrum object -----------------------------------------------------------------------------------

// ChemDraw keeps a spectrum on its page as a spectrum object (CDXML <spectrum>, CDX 0x8010): Y values on an even grid
// from XLow in steps of XSpacing, its Class (the kind) and each axis's units (XType, YType). CDXML holds the values as
// text, ChemDraw's as whole numbers of YScale above YLow, 16 to a line. A spectrum-structure assignment is an object
// tag named /CS/CD/assign, with the same value on the spectrum and on each atom and bond assigned: the peaks' ranges,
// each "lo-hi,". Octet's own details, which ChemDraw's object has no place for (the title, nucleus, frequency, solvent,
// threshold and multiplets), go in an object tag of Octet's on the spectrum, as ASCII JSON.
export const ASSIGN = "/CS/CD/assign", OWN_TAG = "Octet spectrum";
const CLASS: Record<Kind, string | undefined> = { nmr: "NMR", ir: "Infrared", uv: "UVVis", ms: "MassSpectrum", other: undefined };
const KIND_OF: Record<string, Kind> = { NMR: "nmr", Infrared: "ir", Raman: "ir", UVVis: "uv", MassSpectrum: "ms" };
const X_TYPE: Record<string, string> = { ppm: "PartsPerMillion", Hz: "Hertz", "cm⁻¹": "Wavenumbers", "µm": "Microns", "m/z": "MassUnits" };
const Y_TYPE: Record<string, string> = { "%T": "PercentTransmittance", T: "Transmittance", A: "Absorbance" };
const flip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [v, k]));
const X_UNIT = flip(X_TYPE), Y_UNIT = flip(Y_TYPE), DEFAULT_X: Record<Kind, string> = { nmr: "ppm", ir: "cm⁻¹", uv: "nm", ms: "m/z", other: "" };
// A number short and exact enough for an attribute or a tag.
const short = (v: number) => String(+v.toPrecision(12));
// The step a peak table's sticks go on: 0.1, as ChemDraw's own mass spectra, or wider for a very wide range.
const stickStep = (m: Pick<Measured, "xs">) => { let lo = Infinity, hi = -Infinity; for (const x of m.xs ?? []) { lo = Math.min(lo, x); hi = Math.max(hi, x); } return Math.max(0.1, (hi - lo) / 65535 || 0); };

// The trace on an even grid, low x to high: the points as they are (reversed when they run high to low); a peak
// table's sticks in bins (the tallest in each); uneven points at as many even ones, by straight lines between them.
function grid(m: Measured): { low: number; step: number; y: ArrayLike<number> } {
  const n = m.y.length;
  if (!m.xs) {
    const step = n > 1 ? (m.last - m.first) / (n - 1) : 0;
    return step < 0 ? { low: m.last, step: -step, y: Float32Array.from(m.y).reverse() } : { low: m.first, step: step || 1, y: m.y };
  }
  const xs = m.xs, order = Array.from(xs.keys()).sort((a, b) => xs[a] - xs[b]), lo = xs[order[0]], hi = xs[order[n - 1]];
  if (m.sticks) {
    const step = stickStep(m), y = new Float64Array(Math.round((hi - lo) / step) + 1);
    for (const i of order) { const b = Math.round((xs[i] - lo) / step); y[b] = Math.max(y[b], m.y[i]); }
    return { low: lo, step, y };
  }
  const step = n > 1 ? (hi - lo) / (n - 1) || 1 : 1, y = new Float64Array(n);
  for (let j = 0, k = 0; j < n; j++) {
    const x = lo + j * step;
    while (k < n - 2 && xs[order[k + 1]] < x) k++;
    const a = order[k], b = order[Math.min(n - 1, k + 1)], f = xs[b] > xs[a] ? Math.min(1, Math.max(0, (x - xs[a]) / (xs[b] - xs[a]))) : 0;
    y[j] = m.y[a] + f * (m.y[b] - m.y[a]);
  }
  return { low: lo, step, y };
}

// JSON in ASCII: every other character as a \u escape, so it reads the same in any charset ChemDraw decodes it in.
const ascii = (s: string) => s.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

// The spectrum as ChemDraw's object: its attributes, its values as CDXML's text (16-bit levels of YScale above YLow,
// 16 to a line) and the value of Octet's own tag.
export function spectrumObject(m: Measured): { attrs: Record<string, string | undefined>; text: string; own: string } {
  const g = grid(m);
  let lo = m.lo, hi = m.hi;
  if (m.xs) { lo = Infinity; hi = -Infinity; for (let i = 0; i < g.y.length; i++) { lo = Math.min(lo, g.y[i]); hi = Math.max(hi, g.y[i]); } }
  const scale = hi > lo ? (hi - lo) / 65535 : 1, lines: string[] = [];
  let line: number[] = [];
  for (let i = 0; i < g.y.length; i++) {
    line.push(Math.max(0, Math.min(65535, Math.round((g.y[i] - lo) / scale))));
    if (line.length === 16) { lines.push(line.join(" ")); line = []; }
  }
  if (line.length) lines.push(line.join(" "));
  const own = { title: m.title || undefined, nucleus: m.nucleus, mhz: m.mhz, solvent: m.solvent, threshold: m.threshold, per: m.per, groups: m.groups.map((x) => (x.manual ? [x.lo, x.hi, 1] : [x.lo, x.hi])) };
  return {
    attrs: {
      XSpacing: short(g.step), XLow: short(g.low), XType: X_TYPE[m.xUnit] ?? (m.xUnit ? "Other" : undefined), YType: Y_TYPE[m.yUnit] ?? (m.kind === "nmr" || m.kind === "ms" ? "ArbitraryUnits" : m.yUnit ? "Other" : undefined),
      Class: CLASS[m.kind], YLow: lo ? short(lo) : undefined, YScale: short(scale),
    },
    text: lines.join("\n"),
    own: ascii(JSON.stringify(own)),
  };
}

// A ChemDraw spectrum object as a measured spectrum, its multiplets numbered from `id`: its values (each times YScale
// and plus YLow), kind and units, with Octet's own details from `own` (its tag's value) when they are there and sound.
// A mass spectrum mostly at its lowest value is a line spectrum: its other points are sticks. Throws when the object
// is not sound: no grid, a value that is not a number, or more points than Octet opens.
export function fromSpectrumObject(attrs: Record<string, string | undefined>, text: string, own: string | undefined, id: number): Measured {
  const bad = (): never => { throw new Error("This spectrum is damaged."); };
  const real = (s?: string) => { if (s === undefined || !s.trim()) return undefined; const v = Number(s); return Number.isFinite(v) && Math.abs(v) < 1e15 ? v : bad(); };
  const low = real(attrs.XLow), step = real(attrs.XSpacing), yLow = real(attrs.YLow) ?? 0, yScale = real(attrs.YScale) ?? 0;
  if (low === undefined || !step || text.length > 32 * MAX_POINTS) bad();
  const words = text.trim() ? text.trim().split(/\s+/) : [];
  if (!words.length || words.length > MAX_POINTS) bad();
  const f = yScale && yScale !== 1 ? yScale : 1, y = new Float64Array(words.length);
  for (let i = 0; i < words.length; i++) { const v = Number(words[i]); if (!Number.isFinite(v)) bad(); y[i] = v * f + yLow; }
  const kind = KIND_OF[attrs.Class ?? ""] ?? "other", n = y.length, first = low!, last = low! + step! * (n - 1);
  let o: Record<string, unknown> = {};
  try { const v = own === undefined ? undefined : JSON.parse(own); if (v && typeof v === "object" && !Array.isArray(v)) o = v; } catch { /* ChemDraw's object alone */ }
  const fine = (x: unknown, most: number): x is string => typeof x === "string" && x.length <= most && !/[\u0000-\u001f]/.test(x);
  const nucleus = kind !== "nmr" ? undefined : typeof o.nucleus === "string" && /^\d{1,3}[A-Z][a-z]?$/.test(o.nucleus) ? o.nucleus : Math.abs(last - first) > 40 ? "13C" : "1H";
  let s: JcampSpectrum = {
    title: fine(o.title, 200) ? o.title : "", kind, xUnit: X_UNIT[attrs.XType ?? ""] ?? DEFAULT_X[kind], yUnit: Y_UNIT[attrs.YType ?? ""] ?? "", first, last, y,
    ...(nucleus ? { nucleus } : {}), ...(typeof o.mhz === "number" && o.mhz > 0 && o.mhz < 3000 ? { mhz: o.mhz } : {}), ...(fine(o.solvent, 40) && o.solvent ? { solvent: o.solvent } : {}),
  };
  if (kind === "ms") {
    let min = Infinity;
    for (const v of y) min = Math.min(min, v);
    const at: number[] = [];
    y.forEach((v, i) => { if (v > min) at.push(i); });
    if (at.length && at.length <= n / 2) {
      const xs = Float64Array.from(at, (i) => first + i * step!);
      s = { ...s, xs, y: Float64Array.from(at, (i) => y[i] - min), first: xs[0], last: xs[xs.length - 1], sticks: true };
    }
  }
  let m = fromJcamp(s, id);
  const threshold = typeof o.threshold === "number" && o.threshold >= 0 && o.threshold <= 1 ? o.threshold : undefined;
  const groups = Array.isArray(o.groups) && o.groups.length <= MAX_GROUPS ? (o.groups as unknown[]) : undefined;
  const sound = groups?.every((g) => Array.isArray(g) && (g.length === 2 || (g.length === 3 && g[2] === 1)) && g.slice(0, 2).every((v) => typeof v === "number" && Number.isFinite(v)) && g[0] <= g[1]);
  // Octet's multiplets as they were; a line spectrum's sticks moved onto the grid, so it picks its own.
  if (groups && sound && !m.sticks) m = { ...m, threshold: threshold ?? m.threshold, groups: (groups as number[][]).map((g, k) => ({ id: id + k, lo: g[0], hi: g[1], ...(g[2] ? { manual: true as const } : {}) })) };
  else if (threshold !== undefined && threshold !== m.threshold) m = regroup(m, threshold, nextGroupId([m]));
  if (typeof o.per === "number" && Number.isFinite(o.per) && o.per > 0) m = { ...m, per: o.per };
  return m;
}

// A multiplet's range as an assignment tag's value, "lo-hi,"; a stick's widened to its bin, as ChemDraw holds it.
export function assignValue(m: Measured, g: Group): string {
  const w = m.sticks ? stickStep(m) / 2 : 0;
  return `${short(g.lo - w)}-${short(g.hi + w)},`;
}
// An assignment tag's value as ranges: each "lo-hi," pair, lo and hi either way round; at most 1000.
const NUM = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?", PAIR = new RegExp(`^\\s*(${NUM})\\s*-\\s*(${NUM})\\s*$`);
export function assignRanges(value: string): [number, number][] {
  const out: [number, number][] = [];
  for (const part of value.slice(0, 64_000).split(",").slice(0, 1000)) {
    const p = PAIR.exec(part), a = Number(p?.[1]), b = Number(p?.[2]);
    if (p && Number.isFinite(a) && Number.isFinite(b)) out.push([Math.min(a, b), Math.max(a, b)]);
  }
  return out;
}
// The multiplets an assignment's ranges name in a spectrum: for each range, the one its middle is in, else those it
// overlaps (a line spectrum's within half a bin), else a new one of that range, drawn by hand so peak picking keeps it.
// `next`: the first free id.
export function assignGroups(m: Measured, ranges: [number, number][], next: number): { m: Measured; ids: number[] } {
  const near = m.sticks ? stickStep(m) / 2 : 0, ids = new Set<number>();
  let groups = m.groups;
  for (const [lo, hi] of ranges) {
    const mid = (lo + hi) / 2, inside = groups.find((g) => g.lo <= mid && mid <= g.hi), over = inside ? [inside] : groups.filter((g) => g.lo - near <= hi && lo <= g.hi + near);
    if (over.length) { for (const g of over) ids.add(g.id); continue; }
    if (groups.length >= MAX_GROUPS) continue;
    ids.add(next);
    groups = [...groups, { id: next++, lo, hi, manual: true as const }].sort((a, b) => b.lo - a.lo);
  }
  return { m: groups === m.groups ? m : { ...m, groups }, ids: [...ids] };
}

// --- The saved form ---------------------------------------------------------------------------------------------

// Base64 of bytes, in chunks, and back.
function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(s: string): Uint8Array {
  const t = atob(s), out = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) out[i] = t.charCodeAt(i);
  return out;
}
// Numbers as little-endian bytes.
const bytesOf = (a: Int16Array | Float64Array) => {
  const out = new Uint8Array(a.byteLength), d = new DataView(out.buffer);
  a.forEach((x, i) => (a instanceof Int16Array ? d.setInt16(2 * i, x, true) : d.setFloat64(8 * i, x, true)));
  return out;
};

// A spectrum as the drawing's JSON holds it: its trace as 16-bit levels (little endian, base64), with the lowest and
// highest value they stand for.
export function writeMeasured(m: Measured) {
  const q = quantise(m.y, m.lo, m.hi);
  return {
    title: m.title, kind: m.kind, ...(m.nucleus ? { nucleus: m.nucleus } : {}), ...(m.mhz ? { mhz: m.mhz } : {}), ...(m.solvent ? { solvent: m.solvent } : {}),
    xUnit: m.xUnit, yUnit: m.yUnit, first: m.first, last: m.last, n: m.y.length, lo: q.lo, hi: q.hi, y: toBase64(bytesOf(q.q)),
    ...(m.xs ? { xs: toBase64(bytesOf(m.xs)) } : {}), ...(m.sticks ? { sticks: true } : {}),
    threshold: m.threshold, groups: m.groups.map((g) => ({ id: g.id, lo: g.lo, hi: g.hi, ...(g.manual ? { manual: true } : {}) })), ...(m.per ? { per: m.per } : {}), ...(m.box ? { box: m.box } : {}),
  };
}
const KINDS: Kind[] = ["nmr", "ir", "uv", "ms", "other"];
// A spectrum from the drawing's JSON, checked as every file is. Throws when it is not sound.
export function readMeasured(v: unknown): Measured {
  const d = v as Record<string, unknown>, bad = (): never => { throw new Error("This drawing is damaged."); };
  const text = (x: unknown, most: number) => typeof x === "string" && x.length <= most && !/[\u0000-\u001f]/.test(x);
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e300;
  if (typeof d !== "object" || !d || !text(d.title, 200) || !KINDS.includes(d.kind as Kind) || !text(d.xUnit, 20) || !text(d.yUnit, 20) || ![d.first, d.last, d.lo, d.hi, d.threshold].every(num)
    || (d.lo as number) >= (d.hi as number) || !Number.isInteger(d.n) || (d.n as number) < 1 || (d.n as number) > MAX_KEEP || typeof d.y !== "string" || (d.y as string).length > ((d.n as number) * 8) / 3 + 8
    || (d.nucleus !== undefined && !(typeof d.nucleus === "string" && /^\d{1,3}[A-Z][a-z]?$/.test(d.nucleus))) || (d.mhz !== undefined && !(num(d.mhz) && (d.mhz as number) > 0 && (d.mhz as number) < 3000))
    || (d.solvent !== undefined && !text(d.solvent, 40)) || (d.sticks !== undefined && d.sticks !== true) || (d.per !== undefined && !(num(d.per) && (d.per as number) > 0))
    || (d.threshold as number) < 0 || (d.threshold as number) > 1 || !Array.isArray(d.groups) || d.groups.length > MAX_GROUPS
    || (d.box !== undefined && !(Array.isArray(d.box) && d.box.length === 4 && d.box.every((v) => num(v) && Math.abs(v as number) < 1e6)))) bad();
  const n = d.n as number;
  let raw: Uint8Array;
  try { raw = fromBase64(d.y as string); } catch { return bad(); }
  if (raw.length !== 2 * n) bad();
  const q = new Int16Array(n), view = new DataView(raw.buffer);
  for (let i = 0; i < n; i++) q[i] = view.getInt16(2 * i, true);
  let xs: Float64Array | undefined;
  if (d.xs !== undefined) {
    let b: Uint8Array;
    try { b = typeof d.xs === "string" && d.xs.length <= (n * 32) / 3 + 8 ? fromBase64(d.xs) : bad(); } catch { return bad(); }
    if (b.length !== 8 * n) bad();
    const dv = new DataView(b.buffer);
    xs = new Float64Array(n);
    for (let i = 0; i < n; i++) xs[i] = dv.getFloat64(8 * i, true);
    if (!xs.every(Number.isFinite)) bad();
  }
  const ids = new Set<number>();
  const groups = (d.groups as Record<string, unknown>[]).map((g): Group => {
    if (typeof g !== "object" || !g || !Number.isInteger(g.id) || (g.id as number) < 1 || (g.id as number) > 1e9 || ids.has(g.id as number) || !num(g.lo) || !num(g.hi) || (g.lo as number) > (g.hi as number) || (g.manual !== undefined && g.manual !== true)) bad();
    ids.add(g.id as number);
    return { id: g.id as number, lo: g.lo as number, hi: g.hi as number, ...(g.manual ? { manual: true as const } : {}) };
  });
  return {
    title: d.title as string, kind: d.kind as Kind, xUnit: d.xUnit as string, yUnit: d.yUnit as string, first: d.first as number, last: d.last as number,
    y: dequantise({ q, lo: d.lo as number, hi: d.hi as number }), lo: d.lo as number, hi: d.hi as number, threshold: d.threshold as number, groups,
    ...(d.nucleus ? { nucleus: d.nucleus as string } : {}), ...(d.mhz ? { mhz: d.mhz as number } : {}), ...(d.solvent ? { solvent: d.solvent as string } : {}),
    ...(xs ? { xs } : {}), ...(d.sticks ? { sticks: true as const } : {}), ...(d.per ? { per: d.per as number } : {}), ...(d.box ? { box: [...(d.box as number[])] as Measured["box"] } : {}),
  };
}
