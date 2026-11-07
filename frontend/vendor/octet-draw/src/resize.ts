// The selection's resize handles (IDEA-SCALE-3): eight handles on the frame round the selection. A corner scales in
// proportion about the opposite corner; a side stretches across or up from the opposite side and moves geometry only.
// Shift turns proportion over (a corner stretches freely, as ChemDraw's Shift distorts; a side scales in proportion).
// Option scales about the frame's middle; a centre mark that was moved is the point it scales about otherwise, as
// ChemDraw's moved rotation centre is. A proportional scale stops softly at its stops (100%, and the scale that gives
// the median bond the document's bond length).
export type P = [number, number];
// A box in drawing units, y up: [left, bottom, right, top].
export type Box = [number, number, number, number];
export type Side = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const SIDES: Side[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const isCorner = (h: Side) => h.length === 2;
const OPPOSITE: Record<Side, Side> = { nw: "se", n: "s", ne: "sw", e: "w", se: "nw", s: "n", sw: "ne", w: "e" };
// The resize cursor for each handle.
export const CURSORS: Record<Side, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

// A handle's place on a box.
export function handlePoint(b: Box, h: Side): P {
  return [h.includes("w") ? b[0] : h.includes("e") ? b[2] : (b[0] + b[2]) / 2, h.includes("s") ? b[1] : h.includes("n") ? b[3] : (b[1] + b[3]) / 2];
}

// The handle at p: within r of it, and outside what the frame holds (inner), so a press on an atom at the frame's edge
// (the top atom of a ring) moves the selection.
export function sideAt(b: Box, sides: Side[], p: P, r: number, inner?: Box): Side | undefined {
  if (inner && p[0] > inner[0] && p[0] < inner[2] && p[1] > inner[1] && p[1] < inner[3]) return undefined;
  return sides.find((h) => { const q = handlePoint(b, h); return Math.hypot(p[0] - q[0], p[1] - q[1]) < r; });
}

// The factors across and up for the pointer at p, and the point they scale about (about: the moved centre mark).
// near: how far (drawing units) the handle may be from where a stop puts it and still stop there. Factors stay 5% to
// 5000%, to 4 decimals, and never flip.
export function resizeBy(b: Box, h: Side, p: P, mods: { shift?: boolean; alt?: boolean; about?: P }, stops: number[] = [1], near = 0): { size: P; anchor: P } {
  const anchor: P = mods.alt ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : mods.about ?? handlePoint(b, OPPOSITE[h]);
  const at = handlePoint(b, h), d: P = [at[0] - anchor[0], at[1] - anchor[1]];
  const clamp = (k: number) => Math.round(Math.min(50, Math.max(0.05, k)) * 1e4) / 1e4;
  const across = h.includes("e") || h.includes("w"), up = h.includes("n") || h.includes("s");
  const axis = (k: 0 | 1) => (Math.abs(d[k]) > 1e-9 ? clamp((p[k] - anchor[k]) / d[k]) : 1);
  // A soft stop: the factor that puts the handle within `near` of where the stop would put it.
  const stop = (k: number, reach: number, list: number[]) => list.find((s) => Math.abs(k - s) * reach < near) ?? k;
  if (isCorner(h) !== !!mods.shift) {
    // In proportion: a corner by how far the pointer goes along the diagonal; a side by its own axis.
    const reach = isCorner(h) ? Math.hypot(d[0], d[1]) : Math.abs(d[across ? 0 : 1]);
    const raw = isCorner(h) ? clamp(((p[0] - anchor[0]) * d[0] + (p[1] - anchor[1]) * d[1]) / (reach * reach || 1)) : axis(across ? 0 : 1);
    const k = stop(raw, reach, stops);
    return { size: [k, k], anchor };
  }
  return { size: [across ? stop(axis(0), Math.abs(d[0]), [1]) : 1, up ? stop(axis(1), Math.abs(d[1]), [1]) : 1], anchor };
}

// The scale as read while dragging: one percent, or across × up when they differ.
export function percentOf([sx, sy]: P): string {
  const pc = (k: number) => `${Math.round(k * 1000) / 10}%`;
  return Math.abs(sx - sy) < 1e-9 ? pc(sx) : `${pc(sx)} × ${pc(sy)}`;
}
