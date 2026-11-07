// The canvas's scroll bars (Scrollbars.tsx), one axis at a time, in screen px. The range is the drawing and its pages,
// GAP clear on each side, and what the window shows now: the canvas has no edge, so a view panned away from the
// drawing makes the range longer and the thumb smaller, as in Sketch and Figma. No bar when the window shows the range.
export const GAP = 48; // px clear of the drawing at each end of the range
export const LEAST = 24; // px: the shortest thumb

// content and seen: [start, end] on screen. track: the bar's length.
// at: the thumb's start along the track; size: its length; per: screen px the view moves for each px the thumb moves.
export type Bar = { at: number; size: number; per: number };
export function bar(content: [number, number], seen: [number, number], track: number): Bar | undefined {
  const lo = Math.min(content[0] - GAP, seen[0]), hi = Math.max(content[1] + GAP, seen[1]), range = hi - lo, length = seen[1] - seen[0];
  if (range - length < 1 || track <= LEAST) return undefined;
  const size = Math.max(LEAST, (track * length) / range), per = (range - length) / (track - size);
  return { at: (seen[0] - lo) / per, size, per };
}

// A press on the track before the thumb (-1) or after it (1) moves the view one window, less GAP so a little of what
// was in view stays, and no further than the end of the range. The result is how far the window moves along the axis
// (the drawing moves the other way).
export function pageShift(content: [number, number], seen: [number, number], way: -1 | 1): number {
  const room = way < 0 ? seen[0] - Math.min(content[0] - GAP, seen[0]) : Math.max(content[1] + GAP, seen[1]) - seen[1];
  return way * Math.min(seen[1] - seen[0] - GAP, room);
}

// A thumb dragged d px from where it was pressed (at, on a bar of this track and thumb size) moves the window by this
// much: the thumb stays on its track.
export const dragShift = (b: Bar, track: number, d: number) => (Math.max(0, Math.min(track - b.size, b.at + d)) - b.at) * b.per;
