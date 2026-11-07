// Hit testing against arrows, orbitals and shapes. An edit replaces an arrow or shape and never changes it, so its
// paths are kept with it: a pointer move does not make every path again, and a path whose box is not near the
// pointer is passed over without a distance check.
import { arrowPath, orbitalPaths, shapePaths, type Arrow, type Box, type Shape } from "./render.ts";
import type { P } from "./edit.ts";

// A value kept with the object it is made from, for one `by` (a scale or a document style). Made again for another.
export function kept<K extends object, V>(cache: WeakMap<K, [unknown, V]>, x: K, by: unknown, make: () => V): V {
  const hit = cache.get(x);
  if (hit && hit[0] === by) return hit[1];
  const v = make();
  cache.set(x, [by, v]);
  return v;
}

// Distance from a point to a polyline, in the polyline's units.
export const distToPath = (q: P, path: P[]) => Math.min(...path.slice(1).map((b, i) => {
  const a = path[i], ab: P = [b[0] - a[0], b[1] - a[1]], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * ab[0] + (q[1] - a[1]) * ab[1]) / (ab[0] ** 2 + ab[1] ** 2 || 1)));
  return Math.hypot(q[0] - a[0] - ab[0] * t, q[1] - a[1] - ab[1] * t);
}));

// Polylines in px (y down) with the box round all of them.
export type Traced = { paths: P[][]; box: Box };
function traced(paths: P[][]): Traced {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const path of paths) for (const [x, y] of path) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { paths, box: [x0, y0, x1, y1] };
}
const arrowTraces = new WeakMap<Arrow, [unknown, Traced]>(), shapeTraces = new WeakMap<Shape, [unknown, Traced]>();
const lobeTraces = new WeakMap<Arrow, [unknown, { path: P[]; second: boolean }[]]>();
// An arrow's path (arrowPath) at k px per bond length.
export const arrowTrace = (a: Arrow, k: number) => kept(arrowTraces, a, k, () => traced([arrowPath(a, k)]));
// A shape's outline (shapePaths) at k px per bond length.
export const shapeTrace = (sh: Shape, k: number, bond: number) => kept(shapeTraces, sh, `${k} ${bond}`, () => traced(shapePaths(sh, k, bond)));
// An orbital's lobes (orbitalPaths) at k px per bond length.
export const lobesOf = (a: Arrow, k: number) => kept(lobeTraces, a, k, () => orbitalPaths(a, k));

// True when a point is closer than r to one of the polylines. A point further than r from their box cannot be.
export function nearTrace(q: P, t: Traced, r: number): boolean {
  const b = t.box;
  if (q[0] < b[0] - r || q[0] > b[2] + r || q[1] < b[1] - r || q[1] > b[3] + r) return false;
  return t.paths.some((path) => distToPath(q, path) < r);
}
