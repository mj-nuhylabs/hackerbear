// The selection's colour (Settings > General > Selection): Octet's blue (--brand-bright in brand/tokens.css) unless the
// user picks another. Its tints take --selection's opacities, on a light page and on a dark one, so a colour of the
// user's own looks as the blue does (editor.css, --select and --select-tint).
export const SELECT_DEFAULT = "#3F6BFF";
export const SELECT_TINTS = [0.14, 0.3];
export function selectTints(hex: string): [string, string] {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return SELECT_TINTS.map((a) => `rgba(${r}, ${g}, ${b}, ${a})`) as [string, string];
}
// A stored selection colour: a #RRGGBB, or a choice 1.1.0 gave (Slate and Grey as they were on a light page); anything
// else is the default.
export function readSelectColour(v: unknown): string {
  if (v === "slate") return "#7B89A8";
  if (v === "grey") return "#898989";
  return typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : SELECT_DEFAULT;
}
