// Octet's one dialog: a small card over the window with a title, its fields, and Cancel and the action. Return
// does the action, Escape cancels, and the first field has the focus (with no field, the action has it, never Don't
// Save). Every dialog uses it (brand/CLAUDE.md). With no action it only shows something (About Octet): one Close
// button, which Return presses too. plain: the body carries its own heading, so the title is only read out.
import { useEffect, useLayoutEffect, useRef } from "react";
import { listOpen } from "./Menu";
import { useLeaving } from "./motion";

// The modals open now (dialogs, Settings, the command palette, Home), the top one last. Only the top one takes keys.
const open: React.RefObject<HTMLElement | null>[] = [];
const FOCUSABLE = "button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])";
// Each modal stacks over the ones opened before it, at its own z-index or higher, so the top one shows over the
// others: Quit's "Save changes" question shows over Export, not under it.
const restack = () => {
  let z = 0;
  for (const m of open) {
    const el = m.current;
    if (!el) continue;
    el.style.zIndex = "";
    z = Math.max(z + 1, Number(getComputedStyle(el).zIndex) || 0);
    el.style.zIndex = String(z);
  }
};

// While a modal (a dialog, Settings, the command palette or Home) is open, everything beside it in the window is
// inert: Tab, clicks and screen readers stay in it, and a modal over Home blocks Home too. A neighbour that starts to
// leave as the modal closes (Home, after Don't Save) stays inert, as everything leaving is (motion.tsx, Exit).
// inert does nothing on SVG (the canvas), so screen readers skip that with aria-hidden. Tab and Shift+Tab go round
// the top modal's controls only (REL-27).
// When the modal closes (or starts to leave), the focus goes back to the control that had it when the modal opened
// (REL-27), unless the focus has moved on to something else already. Returns whether the modal is the top one.
export function useModal(ref: React.RefObject<HTMLElement | null>, on = true): () => boolean {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!on || !el?.parentElement) return;
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const blocked = [...el.parentElement.children].filter((x) => x !== el && (x instanceof HTMLElement ? !x.inert : !x.hasAttribute("aria-hidden")));
    const block = (x: Element, on: boolean) => { if (x instanceof HTMLElement) x.inert = on; else if (on) x.setAttribute("aria-hidden", "true"); else x.removeAttribute("aria-hidden"); };
    for (const x of blocked) block(x, true);
    open.push(ref);
    restack();
    const tab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || open[open.length - 1] !== ref) return;
      // Tab stops only: a button that takes the focus by the arrow keys alone (tabindex -1, Home's tiles) is not one.
      const all = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => !x.matches(":disabled") && x.tabIndex >= 0 && !x.closest("[inert]") && x.getClientRects().length);
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (!all.length || (e.shiftKey ? at <= 0 : at < 0 || at === all.length - 1)) {
        e.preventDefault();
        all[e.shiftKey ? all.length - 1 : 0]?.focus();
      }
    };
    addEventListener("keydown", tab, true);
    return () => {
      removeEventListener("keydown", tab, true);
      open.splice(open.indexOf(ref), 1);
      restack();
      for (const x of blocked) block(x, x.classList.contains("leaving"));
      const at = document.activeElement;
      if (opener?.isConnected && (!at || at === document.body || el.contains(at))) opener.focus({ preventScroll: true });
    };
  }, [ref, on]);
  return () => open[open.length - 1] === ref;
}

// alt: a third choice, before Cancel (Don't Save). cancel: Cancel's name, when the dialog's own word is better (Stop).
// disabled: the action has nothing to do yet (Return does nothing).
type Props = { title: string; action?: string; onAction?: () => void; onClose: () => void; plain?: boolean; disabled?: boolean; alt?: { label: string; onClick: () => void }; cancel?: string; children: React.ReactNode };

export function Dialog({ title, action, onClose, onAction = onClose, plain, disabled, alt, cancel = "Cancel", children }: Props) {
  // Leaving (motion.tsx, Exit), it gives the window back at once and takes no keys.
  const card = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null), leaving = useLeaving();
  const top = useModal(backdrop, !leaving);
  // The first field (a text box, a list or a choice) takes the focus when the dialog opens, and only then: a dialog
  // draws again as its fields change, and the focus stays in the field being typed in. With no field, the action has
  // it, never the third choice (Don't Save, Replace): Space on it would lose work. What's new's section names are not
  // fields: Close has the focus there.
  useEffect(() => {
    const c = card.current;
    (c?.querySelector<HTMLElement>("textarea, input, select, .dialog-body button:not([tabindex='-1']):not(.notes-tab)") ?? c?.querySelector<HTMLElement>(".dialog-button.primary"))?.focus();
  }, []);
  useEffect(() => {
    if (leaving) return;
    const key = (e: KeyboardEvent) => {
      if (!top() || listOpen()) return; // only the top modal; an open list takes its own keys
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      // Return in a text area makes a new line; ⌘Return (Ctrl+Enter) sends.
      if (e.key === "Enter" && (!(e.target instanceof HTMLTextAreaElement) || e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); if (!disabled) onAction(); }
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [onAction, onClose, disabled, leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={backdrop} className={leaving ? "modal-backdrop leaving" : "modal-backdrop"} inert={leaving} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="dialog" role="dialog" aria-modal={!leaving} aria-label={title}>
        {!plain && <h2>{title}</h2>}
        <div className="dialog-body">{children}</div>
        <div className="dialog-buttons">
          {alt && <button className="dialog-button alt" onClick={alt.onClick}>{alt.label}</button>}
          {action && <button className="dialog-button" onClick={onClose}>{cancel}</button>}
          <button className="dialog-button primary" onClick={onAction} disabled={disabled}>{action ?? "Close"}</button>
        </div>
      </div>
    </div>
  );
}
