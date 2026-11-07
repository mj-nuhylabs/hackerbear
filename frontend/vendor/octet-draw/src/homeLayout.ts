// Home's sections as modules (decision 0003): the user moves them up and down (a drag by the heading, or Move up and
// Move down in the heading's menu) and folds each to its heading. Settings keeps the order and the folded sections
// (src/settings.ts); what it reads back is checked here, so a damaged or older setting still gives all four sections
// once each.
export const SECTIONS = ["new", "templates", "recent", "projects"] as const;
export type SectionId = (typeof SECTIONS)[number];
export type HomeLayout = { order: SectionId[]; folded: SectionId[] };

const isSection = (v: unknown): v is SectionId => SECTIONS.includes(v as SectionId);

// The layout from saved values: each known section once, in the saved order, then any the save did not name in
// Octet's order. Unknown names go.
export function readLayout(order: unknown, folded: unknown): HomeLayout {
  const known = (v: unknown) => [...new Set(Array.isArray(v) ? v.filter(isSection) : [])];
  const saved = known(order);
  return { order: [...saved, ...SECTIONS.filter((s) => !saved.includes(s))], folded: known(folded) };
}

// A section one place up (by -1) or down (by 1), or to place `to` in the order. The same order when it cannot move.
export function moveSection(order: SectionId[], id: SectionId, to: number, by = false): SectionId[] {
  const at = order.indexOf(id), place = by ? at + to : to;
  if (at < 0 || place < 0 || place >= order.length || place === at) return order;
  const next = order.filter((s) => s !== id);
  next.splice(place, 0, id);
  return next;
}

// The rows Home draws: New and Templates side by side when they are next to each other (in either order), each other
// section on its own row.
export function rowsOf(order: SectionId[], folded: SectionId[]): SectionId[][] {
  const rows: SectionId[][] = [];
  for (const id of order) {
    const last = rows[rows.length - 1], pair = (a: SectionId, b: SectionId) => (a === "new" && b === "templates") || (a === "templates" && b === "new");
    if (last?.length === 1 && pair(last[0], id) && !folded.includes(last[0]) && !folded.includes(id)) last.push(id);
    else rows.push([id]);
  }
  return rows;
}
