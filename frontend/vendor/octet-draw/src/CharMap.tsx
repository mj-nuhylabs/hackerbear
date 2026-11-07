// The Character Map (Text > Character Map, and the text options in the Actions panel), as ChemDraw's Character Map
// window: a click on a character types it where the caret is, in the text being typed (a caption, an atom label, a
// table or grid cell, a cycle's step name, an experiment's details). The eight characters used last come first, as in
// ChemDraw. Octet's characters are Unicode, never letters in the Symbol font (escapes.ts types the same ones by name).
//
// A click keeps the caret where it was (the press does not take the focus). ⇧⌘Space (Ctrl+Shift+Space) in a text box
// opens the map, or goes to it, with the focus on its first character; opened from the menu with the mouse, the caret
// stays in the text. With the keyboard, the arrow keys move through the characters, Return types one, and Escape goes
// back to the text with the caret where it was. Focus moved into the map does not end the text being typed (inMap),
// and the text gets the focus back for each character.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useLeaving } from "./motion";
import { CHAR_GROUPS, charName } from "./chars.ts";

// True when focus goes into the map, so a text box that loses it to the map stays open.
export const inMap = (t: EventTarget | null) => t instanceof Element && !!t.closest(".char-map");

const RECENT = "octet.charmap.recent", MOST = 8;
const recentList = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]"); return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string" && [...c].length === 1).slice(0, MOST) : []; } catch { return []; }
};

// A text field: an input or textarea that takes text, or a box of rich text.
const typable = (e: Element | null): e is HTMLElement =>
  e instanceof HTMLTextAreaElement || (e instanceof HTMLInputElement && ["text", "search", ""].includes(e.type)) || (e instanceof HTMLElement && e.isContentEditable);

export function CharMap({ onClose, focus = true }: { onClose: () => void; focus?: boolean }) {
  const box = useRef<HTMLDivElement>(null), leaving = useLeaving(), [recent, setRecent] = useState(recentList);
  // The text field last typed in, and its selection, so a character goes where the caret was.
  const field = useRef<{ el: HTMLElement; range?: Range; at?: [number, number] }>(undefined);
  const note = (el: Element | null) => {
    if (!typable(el) || inMap(el)) return;
    const sel = getSelection();
    field.current = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ? { el, at: [el.selectionStart ?? el.value.length, el.selectionEnd ?? el.value.length] }
      : { el, range: sel && sel.rangeCount && el.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : undefined };
  };
  // Opened over text being typed with ⇧⌘Space, the map takes the focus, so the keys move through it at once. Opened
  // with the mouse (focus false), the caret stays in the text.
  useLayoutEffect(() => {
    note(document.activeElement);
    if (field.current && focus) box.current?.querySelector<HTMLElement>(".char[tabindex='0']")?.focus({ preventScroll: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (leaving) return;
    const changed = () => note(document.activeElement);
    // Escape in the map goes back to the text (and closes the map when there is none).
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !inMap(document.activeElement)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (field.current?.el.isConnected) back(); else onClose();
    };
    document.addEventListener("selectionchange", changed);
    document.addEventListener("focusin", changed);
    addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("selectionchange", changed); document.removeEventListener("focusin", changed); removeEventListener("keydown", esc, true); };
  }, [leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  // The text field takes the focus again, with its selection as it was.
  const back = () => {
    const f = field.current;
    if (!f?.el.isConnected) return false;
    f.el.focus({ preventScroll: true });
    if (f.at && (f.el instanceof HTMLInputElement || f.el instanceof HTMLTextAreaElement)) f.el.setSelectionRange(...f.at);
    else if (f.range) { const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(f.range); }
    return true;
  };
  const type = (ch: string, keyboard = false) => {
    const from = document.activeElement;
    if (!(typable(from) && !inMap(from)) && !back()) return;
    // The browser types it, so the field reads it as typed text (and Undo in the field takes it back).
    document.execCommand("insertText", false, ch);
    const next = [ch, ...recent.filter((c) => c !== ch)].slice(0, MOST);
    setRecent(next);
    try { localStorage.setItem(RECENT, JSON.stringify(next)); } catch { /* not kept */ }
    // Typed with the keyboard: the focus goes back to the character, so the next one is a key away. A click leaves it in
    // the text, so typing goes on there.
    if (keyboard && inMap(from)) (from as HTMLElement).focus({ preventScroll: true });
  };
  // Focus that leaves the map for somewhere else ends the text that was being typed, as leaving the text would.
  const left = (e: React.FocusEvent) => {
    const to = e.relatedTarget as HTMLElement | null, f = field.current;
    if (inMap(to) || !f?.el.isConnected || to === f.el) return;
    f.el.focus({ preventScroll: true });
    f.el.blur();
    to?.focus({ preventScroll: true });
  };
  // Arrow keys: to the nearest character that way.
  const keys = (e: React.KeyboardEvent) => {
    // The drawing takes no keys from the map (an arrow key would move the selection), but the menu keys go on.
    if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    const all = [...box.current!.querySelectorAll<HTMLButtonElement>(".char")], at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Home" || e.key === "End") { e.preventDefault(); all[e.key === "Home" ? 0 : all.length - 1]?.focus(); return; }
    if (!d) return;
    e.preventDefault();
    if (at < 0) return all[0]?.focus();
    if (d[1] === 0) return all[Math.max(0, Math.min(all.length - 1, at + d[0]))].focus();
    const r = all[at].getBoundingClientRect(), cx = r.left + r.width / 2;
    const best = all.map((b) => b.getBoundingClientRect()).map((q, i) => ({ i, dy: (q.top - r.top) * d[1], dx: Math.abs(q.left + q.width / 2 - cx) }))
      .filter((q) => q.dy > 1).sort((p, q) => p.dy - q.dy || p.dx - q.dx);
    const row = best.filter((q) => q.dy === best[0]?.dy).sort((p, q) => p.dx - q.dx)[0];
    if (row) all[row.i].focus();
  };
  // Recent has its row from the start, so the first character typed does not move the others under the pointer.
  const groups: [string, string[]][] = [["Recent", recent], ...CHAR_GROUPS];
  let first = true;
  return (
    <div ref={box} className={["page-menu char-map", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label="Character map" inert={leaving}
      onMouseDown={(e) => e.preventDefault()} onKeyDown={keys} onBlur={left}>
      <div className="char-map-head">
        <h3>Character map</h3>
        <button className="actions-close" aria-label="Close character map" data-tip="Close character map" onClick={onClose}><X size={12} /></button>
      </div>
      <div className="char-map-body">
        {groups.map(([name, chars]) => (
          <div key={name} className="char-group" role="group" aria-label={name}>
            <h4>{name}</h4>
            <div className="char-row">
              {chars.map((ch) => {
                const tab = first ? 0 : -1;
                first = false;
                return <button key={ch} className="chip char" tabIndex={tab} aria-label={charName(ch)} data-tip={charName(ch)} onClick={(e) => type(ch, e.detail === 0)}>{ch}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
