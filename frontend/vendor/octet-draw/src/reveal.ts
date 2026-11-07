// How far the view pans so a box on screen comes into the room left for it (px, x right, y down): as little as it
// takes on each axis, and a box bigger than the room is centred on it. [0, 0] when it is in view already.
export type Span = [number, number, number, number]; // left, top, right, bottom
const along = (lo: number, hi: number, a: number, z: number) => (z - a > hi - lo ? (lo + hi) / 2 - (a + z) / 2 : a < lo ? lo - a : z > hi ? hi - z : 0);
export const panInto = (box: Span, room: Span): [number, number] => [along(room[0], room[2], box[0], box[2]), along(room[1], room[3], box[1], box[3])];
// How far the view pans so a box on screen sits in the middle of the room (View > Centre in Window).
export const centreIn = (box: Span, room: Span): [number, number] => [(room[0] + room[2] - box[0] - box[2]) / 2, (room[1] + room[3] - box[1] - box[3]) / 2];
// The room on the canvas that the panels over it leave, `gap` clear of them and of the canvas's edges. A panel up a
// side (the tools, Actions) takes that side; a wide one along the bottom (Spectrum, Mass spec, Properties) takes the
// bottom, unless it fills the canvas (a full-window Spectrum).
export function roomOf(canvas: Span, panels: Span[], gap = 48): Span {
  let [l, t, r, b] = canvas;
  const mid = (canvas[0] + canvas[2]) / 2;
  for (const p of panels) {
    if (p[2] - p[0] < (canvas[2] - canvas[0]) / 2) { if ((p[0] + p[2]) / 2 < mid) l = Math.max(l, p[2]); else r = Math.min(r, p[0]); }
    else if (p[1] > canvas[1] + 96) b = Math.min(b, p[1]);
  }
  return [l + gap, t + gap, r - gap, b - gap];
}
// Where Add to drawing puts what it adds (px, y down): at the box given (under its structure, as the panel puts it)
// when that is clear of every object there (`taken`, kept `margin` clear), else straight down, `gap` under whatever is
// in the way, until it is clear. How far down it goes; 0 when the box is clear already.
const meets = (a: Span, b: Span, d: number) => a[0] < b[2] + d && a[2] > b[0] - d && a[1] < b[3] + d && a[3] > b[1] - d;
export function dropClear(box: Span, taken: Span[], margin: number, gap: number): number {
  let dy = 0;
  for (let n = 0; n <= taken.length; n++) {
    const at: Span = [box[0], box[1] + dy, box[2], box[3] + dy], hit = taken.filter((t) => meets(at, t, margin));
    if (!hit.length) return dy;
    dy = Math.max(dy, Math.max(...hit.map((t) => t[3])) + gap - box[1]);
  }
  return dy;
}
