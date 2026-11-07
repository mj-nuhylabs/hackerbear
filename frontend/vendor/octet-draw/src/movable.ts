// A floating panel (Properties, the Spectrum) the user moves by its header: a press on the header's empty part drags
// it, kept inside the window. Where each panel was moved to is kept while the app is open, so it reopens there.
import { useState } from "react";
import { dragCursor } from "./cursor";

const kept = new Map<string, [number, number]>();

export function useMovable(key: string, off = false) {
  const [at, setAt] = useState<[number, number]>(() => kept.get(key) ?? [0, 0]);
  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (off || e.button !== 0 || (e.target as Element).closest("button, select, input, label, a, [role=radiogroup]")) return;
    const panel = e.currentTarget.closest("section") as HTMLElement | null;
    if (!panel) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect(), start = [e.clientX, e.clientY], from = at, el = e.currentTarget;
    try { el.setPointerCapture(e.pointerId); } catch { /* a pointer the page cannot capture: the drag still follows it */ }
    dragCursor("grabbing");
    const move = (ev: PointerEvent) => {
      // The whole panel stays in the window.
      const dx = Math.min(innerWidth - r.right, Math.max(-r.left, ev.clientX - start[0])), dy = Math.min(innerHeight - r.bottom, Math.max(-r.top, ev.clientY - start[1]));
      const next: [number, number] = [from[0] + dx, from[1] + dy];
      kept.set(key, next);
      setAt(next);
    };
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); dragCursor(); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  return { style: off ? {} : { translate: `${at[0]}px ${at[1]}px` }, onPointerDown };
}
