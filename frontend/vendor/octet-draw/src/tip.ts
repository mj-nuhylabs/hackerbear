// Where a tooltip sits: centred above its control (beside it, for the toolbar down the left), moved in so it never
// goes past the window's edge, and below the control when there is no room above.

export type Rect = { left: number; top: number; right: number; bottom: number };
export const TIP_GAP = 6, TIP_EDGE = 8; // px: from the control, and the least from the window's edge

export function placeTip(at: Rect, w: number, h: number, view: { width: number; height: number }, side: "above" | "right" = "above"): { left: number; top: number } {
  const clampX = (x: number) => Math.max(TIP_EDGE, Math.min(x, view.width - TIP_EDGE - w));
  const clampY = (y: number) => Math.max(TIP_EDGE, Math.min(y, view.height - TIP_EDGE - h));
  if (side === "right" && at.right + TIP_GAP + w <= view.width - TIP_EDGE)
    return { left: at.right + TIP_GAP, top: clampY((at.top + at.bottom) / 2 - h / 2) };
  const left = clampX((at.left + at.right) / 2 - w / 2);
  return at.top - TIP_GAP - h >= TIP_EDGE ? { left, top: at.top - TIP_GAP - h } : { left, top: clampY(at.bottom + TIP_GAP) };
}

// True when a control shows words of its own, so it needs no tip of its name. Text drawn in an icon (a structure's
// atom labels, inside an svg) does not count.
export type Shown = { nodeType: number; nodeName: string; textContent: string | null; childNodes: ArrayLike<Shown> };
export const showsWords = (n: Shown): boolean =>
  n.nodeType === 3 ? !!n.textContent?.trim() : n.nodeName !== "svg" && Array.from(n.childNodes).some(showsWords);
