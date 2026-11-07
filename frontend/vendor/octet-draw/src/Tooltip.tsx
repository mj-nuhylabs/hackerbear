// Octet's one tooltip, for the whole window: every control uses it, so they all wait, look and move the same way.
// A control with data-tip shows that text, and data-key its shortcut (data-tip="" shows none; data-tip-cut shows it
// only while the control's name is cut short). An icon-only button with no data-tip shows its aria-label. Inside
// data-tips="right" (the toolbar down the left) tips sit beside the control, elsewhere above it (tip.ts).
// The first tip waits 500 ms. While one shows, or just after, the next shows at once, so the pointer can run along
// a row. Keyboard focus shows a tip at once. A press, a key, a scroll or a dialog over the control hides it. A tip
// fades out as it goes (Exit), unless the next one takes its place.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Exit } from "./motion";
import { placeTip, showsWords } from "./tip";

type Tip = { text: string; key?: string; at: DOMRect; side: "above" | "right"; instant: boolean };
const DELAY = 500, CARRY = 300; // ms: before the first tip; after a tip goes, how long the next still shows at once

// The control under an element that has a tip, and what the tip says.
function tipOf(target: EventTarget | null): { el: HTMLElement; text: string; key?: string } | undefined {
  const el = target instanceof Element ? target.closest<HTMLElement>("[data-tip], button[aria-label]") : null;
  if (!el) return undefined;
  const key = el.dataset.key || undefined;
  if (el.dataset.tip === undefined) return showsWords(el) ? undefined : { el, text: el.getAttribute("aria-label")!, key };
  if (!el.dataset.tip) return undefined;
  if (el.hasAttribute("data-tip-cut") && ![...el.querySelectorAll("span")].some((s) => s.scrollWidth > s.clientWidth + 1)) return undefined;
  return { el, text: el.dataset.tip, key };
}

export function Tooltips() {
  const [tip, setTip] = useState<Tip>();
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let timer = 0, check = 0, current: HTMLElement | undefined, shown = false, goneAt = -Infinity;
    const show = (t: NonNullable<ReturnType<typeof tipOf>>, instant: boolean) => {
      clearTimeout(timer);
      shown = true;
      const at = t.el.getBoundingClientRect();
      setTip({ text: t.text, key: t.key, at, side: t.el.closest("[data-tips='right']") ? "right" : "above", instant });
      // A control that moves, leaves the page (a panel that changed) or goes behind a dialog takes its tip with it.
      clearInterval(check);
      check = window.setInterval(() => {
        const r = t.el.getBoundingClientRect();
        if (!t.el.isConnected || r.left !== at.left || r.top !== at.top || t.el.closest("[inert]")) hide();
      }, 200);
    };
    const hide = (keep = false) => {
      clearTimeout(timer);
      clearInterval(check);
      if (shown) goneAt = performance.now();
      shown = false;
      if (!keep) current = undefined;
      setTip(undefined);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = tipOf(e.target);
      if (t?.el === current) return;
      if (!t || e.buttons) return hide();
      hide();
      current = t.el;
      if (performance.now() - goneAt < CARRY) show(t, true);
      else timer = window.setTimeout(() => show(t, false), DELAY);
    };
    const out = (e: PointerEvent) => { if (!e.relatedTarget) hide(); };
    // After a press the tip stays away until the pointer moves to another control.
    const press = () => hide(true);
    const focus = (e: FocusEvent) => {
      const t = tipOf(e.target);
      if (t && t.el === e.target && t.el.matches(":focus-visible")) { current = t.el; show(t, true); }
    };
    const blur = (e: FocusEvent) => { if (e.target === current) hide(); };
    // A key hides the tip, as a shortcut may change what is on screen. Tab moves the focus, which shows the next one.
    const key = (e: KeyboardEvent) => { if (e.key !== "Tab") hide(true); };
    const away = () => hide();
    addEventListener("pointerover", over, true);
    addEventListener("pointerout", out, true);
    addEventListener("pointerdown", press, true);
    addEventListener("focusin", focus, true);
    addEventListener("focusout", blur, true);
    addEventListener("keydown", key, true);
    addEventListener("wheel", away, { capture: true, passive: true });
    addEventListener("scroll", away, { capture: true, passive: true });
    return () => {
      clearTimeout(timer);
      clearInterval(check);
      removeEventListener("pointerover", over, true);
      removeEventListener("pointerout", out, true);
      removeEventListener("pointerdown", press, true);
      removeEventListener("focusin", focus, true);
      removeEventListener("focusout", blur, true);
      removeEventListener("keydown", key, true);
      removeEventListener("wheel", away, true);
      removeEventListener("scroll", away, true);
    };
  }, []);
  // Placed by its own size before it is painted.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !tip) return;
    const p = placeTip(tip.at, el.offsetWidth, el.offsetHeight, { width: innerWidth, height: innerHeight }, tip.side);
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  }, [tip]);
  return (
    <Exit>{tip && (
      <span ref={box} className={tip.instant ? "tip instant" : "tip"} role="tooltip">
        {/* A long place (a drawing's file) breaks after a slash before it breaks inside a name. */}
        <span className="tip-text">{tip.text.split("/").flatMap((part, k) => (k ? ["/", <wbr key={k} />, part] : [part]))}</span>
        {tip.key && <kbd>{tip.key}</kbd>}
      </span>
    )}</Exit>
  );
}
