// The page's fixed measurements, shared by the CSS (as custom properties on .app) and by Octet Draw's pane, which
// lays the editor out from them (vendor/octet-draw/src/synthpath.ts).
export const BAR_H = 56 // SynthPath's app bar, across the whole window
export const STRIP = 48 // the drawing pane's status bar, under the editor
export const WIDE_MIN = 1100 // narrower than this, the drawing pane covers the results while open
export const DRAW_MIN = 380
export const drawMax = () => Math.max(DRAW_MIN, Math.min(1100, innerWidth - 520))
