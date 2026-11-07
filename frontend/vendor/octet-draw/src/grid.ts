// The grid: where its lines fall in the window, which of them show at this zoom, and snapping to them. Drawing
// coordinates (bond lengths, y up) throughout. Pure, so grid.check.ts tests it.
import { GRID_IN, type GridStep } from "./docstyle.ts";

type P = [number, number];
// A grid: a line every `minor` from `origin`, and a heavier one every `every` lines.
export type GridSpec = { origin: P; minor: number; every: number };
// Lines closer than this on screen are not drawn, and are not snapped to (px).
export const MIN_GAP = 8;
// At most this many lines, whatever the window or the file asks for.
export const MAX_LINES = 2000;

// The document's grid. mm: bond lengths per mm. A bond-length grid has a line each bond length and a lighter one at
// each half; a grid in mm has a heavier line every 5 steps, and a grid in inches one at each inch, where the rulers
// show their numbers.
export function gridOf(step: GridStep, mm: number, origin: P): GridSpec {
  return step === "bond" ? { origin, minor: 0.5, every: 2 } : { origin, minor: step * mm, every: GRID_IN.includes(step) ? Math.round(25.4 / step) : 5 };
}

// The step of the finest lines that show at this scale (px per bond length), or undefined when none do.
export function shownStep(g: GridSpec, scale: number): number | undefined {
  if (!(g.minor > 0) || !(scale > 0) || !Number.isFinite(g.minor * scale)) return undefined;
  return g.minor * scale >= MIN_GAP ? g.minor : g.minor * g.every * scale >= MIN_GAP ? g.minor * g.every : undefined;
}

// The grid lines across a box [x0, y0, x1, y1] at this scale: their x and y positions, each marked major or not.
export function gridLines(g: GridSpec, box: [number, number, number, number], scale: number): { x: [number, boolean][]; y: [number, boolean][] } {
  const step = shownStep(g, scale), none = { x: [], y: [] };
  if (step === undefined) return none;
  const k = Math.round(step / g.minor), along = (o: number, lo: number, hi: number): [number, boolean][] | undefined => {
    const first = Math.ceil((lo - o) / step), last = Math.floor((hi - o) / step);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last - first + 1 > MAX_LINES) return undefined;
    const out: [number, boolean][] = [];
    for (let n = first; n <= last; n++) out.push([o + n * step, ((n * k) % g.every + g.every) % g.every === 0]);
    return out;
  };
  const x = along(g.origin[0], box[0], box[2]), y = along(g.origin[1], box[1], box[3]);
  return x && y && x.length + y.length <= MAX_LINES ? { x, y } : none;
}

// The nearest shown grid line to a value on each axis, when it is within tol px (else that axis is undefined).
export function snapToGrid(g: GridSpec, p: P, scale: number, tol: number): [number | undefined, number | undefined] {
  const step = shownStep(g, scale);
  if (step === undefined) return [undefined, undefined];
  const near = (v: number, o: number) => { const s = o + Math.round((v - o) / step) * step; return Math.abs(s - v) * scale <= tol ? s : undefined; };
  return [near(p[0], g.origin[0]), near(p[1], g.origin[1])];
}

// How far to move so the nearest of these points lands on a shown grid line, on each axis (undefined on an axis
// where none is within tol px).
export function gridNudge(g: GridSpec, points: P[], scale: number, tol: number): [number | undefined, number | undefined] {
  const best: [number | undefined, number | undefined] = [undefined, undefined];
  for (const p of points) {
    const s = snapToGrid(g, p, scale, tol);
    for (const k of [0, 1] as const) {
      const d = s[k] === undefined ? undefined : s[k]! - p[k];
      if (d !== undefined && (best[k] === undefined || Math.abs(d) < Math.abs(best[k]!))) best[k] = d;
    }
  }
  return best;
}

// A ruler's marks from lo to hi (in its unit), at px screen px per unit. A number at least 48 px apart (1, 2 or 5
// times a power of ten; a power of two for inches), and smaller marks down to 6 px apart: size 2 at a number, 1
// halfway, 0 between.
export type Tick = { at: number; size: 0 | 1 | 2; label?: string };
export function rulerTicks(lo: number, hi: number, px: number, binary: boolean): Tick[] {
  if (!(px > 0) || !Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const steps = binary ? Array.from({ length: 24 }, (_, k) => 2 ** (k - 10)) : Array.from({ length: 14 }, (_, k) => [1, 2, 5].map((m) => m * 10 ** (k - 5))).flat();
  const step = steps.find((s) => s * px >= 48);
  if (step === undefined) return [];
  const parts = (binary ? [16, 8, 4, 2] : /^2/.test(step.toExponential()) ? [10, 4, 2] : [10, 5, 2]).find((n) => (step / n) * px >= 6) ?? 1;
  const first = Math.ceil(lo / (step / parts)), last = Math.floor(hi / (step / parts));
  if (last - first > MAX_LINES) return [];
  const out: Tick[] = [];
  for (let n = first; n <= last; n++) {
    const at = (n * step) / parts, k = ((n % parts) + parts) % parts;
    out.push(k === 0 ? { at, size: 2, label: String(+at.toFixed(4)).replace("-", "−") } : { at, size: parts % 2 === 0 && k === parts / 2 ? 1 : 0 });
  }
  return out;
}
