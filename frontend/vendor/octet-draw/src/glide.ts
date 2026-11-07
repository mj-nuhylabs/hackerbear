// Glides (FEEL-38): Clean up, Rotate 180°, Flip, Align and Distribute set the drawing at once (one undo step), and the
// editor shows the way there for a moment. These give the drawing part of the way from one to the other.
import type { Mol } from "./render";

type P = [number, number];
// At most this many atoms (and objects) glide. With more, the drawing changes at once, so a big drawing stays quick.
export const MOST_GLIDE = 300;

const near = (p: readonly number[], q: readonly number[]) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9;
// How many atoms b moves from where a has them, and how many arrows, shapes, captions and cycles it changes; undefined
// when b has atoms added or taken away.
export function moving(a: Mol, b: Mol): number | undefined {
  if (a.atoms.length !== b.atoms.length) return undefined;
  const changed = <T,>(xs: T[] = [], ys: T[] = []) => { const was = new Set(xs); return ys.filter((y) => !was.has(y)).length; };
  return b.atoms.filter((y, i) => !near(a.atoms[i].location, y.location)).length
    + changed(a.arrows, b.arrows) + changed(a.shapes, b.shapes) + changed(a.captions, b.captions) + changed(a.cycles, b.cycles);
}

const mix = (p: P, q: P, t: number): P => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const num = (p: number | undefined, q: number | undefined, t: number) => (p === undefined || q === undefined ? q : p + (q - p) * t);
const length = (p: readonly number[], q: readonly number[]) => Math.hypot(q[0] - p[0], q[1] - p[1]);

// b with each atom, arrow, shape, caption and cycle t (0 to 1) of the way along a straight line from where a has it
// (a cycle's radius and breaks too).
// Anything that did not change, or that a does not have, is b's own, so its drawing is kept. Undefined when a bond or
// an arrow is squeezed to under a quarter of its length (the middle of Rotate 180°), as that does not draw well.
export function between(a: Mol, b: Mol, t: number): Mol | undefined {
  const was = <T extends { id: number }>(xs?: T[]) => new Map((xs ?? []).map((x) => [x.id, x]));
  const arrows = was(a.arrows), shapes = was(a.shapes), captions = was(a.captions), cycles = was(a.cycles);
  const atoms = b.atoms.map((y, i) => {
    const x = a.atoms[i];
    return !x || x === y || near(x.location, y.location) ? y : { ...y, location: [...mix([x.location[0], x.location[1]], [y.location[0], y.location[1]], t), y.location[2]] as [number, number, number] };
  });
  if (b.bonds.some((bd) => length(atoms[bd.atoms[0]].location, atoms[bd.atoms[1]].location) < 0.25 * length(b.atoms[bd.atoms[0]].location, b.atoms[bd.atoms[1]].location))) return undefined;
  const out: Mol = {
    ...b, atoms,
    arrows: b.arrows?.map((y) => {
      const x = arrows.get(y.id), points = y.curve?.points, from = x?.curve?.points;
      if (!x || x === y) return y;
      return {
        ...y, from: mix(x.from, y.from, t), to: mix(x.to, y.to, t), bend: num(x.bend, y.bend, t),
        ...(y.curve && points && from?.length === points.length ? { curve: { ...y.curve, points: points.map((q, k) => ({
          at: mix(from[k].at, q.at, t), ...(q.c1 ? { c1: from[k].c1 ? mix(from[k].c1!, q.c1, t) : q.c1 } : {}), ...(q.c2 ? { c2: from[k].c2 ? mix(from[k].c2!, q.c2, t) : q.c2 } : {}),
        })) } } : {}),
      };
    }),
    shapes: b.shapes?.map((y) => { const x = shapes.get(y.id); return !x || x === y ? y : { ...y, from: mix(x.from, y.from, t), to: mix(x.to, y.to, t), angle: num(x.angle, y.angle, t) }; }),
    captions: b.captions?.map((y) => { const x = captions.get(y.id); return !x || x === y ? y : { ...y, x: x.x + (y.x - x.x) * t, y: x.y + (y.y - x.y) * t }; }),
    cycles: b.cycles?.map((y) => {
      const x = cycles.get(y.id);
      if (!x || x === y) return y;
      // A break's angle turns the short way round.
      const turn = (p: number, q: number) => p + Math.atan2(Math.sin(q - p), Math.cos(q - p)) * t;
      return { ...y, centre: mix(x.centre, y.centre, t), radius: x.radius + (y.radius - x.radius) * t, ...(x.at.length === y.at.length ? { at: y.at.map((q, k) => turn(x.at[k], q)) } : {}) };
    }),
  };
  if (out.arrows?.some((y, k) => length(y.from, y.to) < 0.25 * length(b.arrows![k].from, b.arrows![k].to))) return undefined;
  return out;
}
