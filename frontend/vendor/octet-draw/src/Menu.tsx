// Octet's one options menu. Every tool's strip, the specialist tools and every sub-menu (such as all the curved
// arrows) use it, so they all look and work the same (brand/CLAUDE.md, Menus). Each option is its icon and its full
// name, in a grid two across by default; the corner grip drags it wider or narrower in whole columns. Groups (a
// shape across its styles, say) start on a new row under a hairline. A menu taller than the window scrolls.
// Do not build another menu: extend this one. Pick (below) is the menu as a list of choices from a button.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { holdCursor } from "./cursor";
import { Exit, useLeaving } from "./motion";
import { CaretRight } from "@phosphor-icons/react";
import { host } from "./synpath"; // SynPath: portals go in the editor's own element

export type MenuItem = {
  key: string;
  name: string;
  icon: React.ReactNode;
  checked?: boolean;
  // A small button on the option's right, shown on hover: remove it, or keep it in a list.
  action?: { icon: React.ReactNode; label: string; pressed?: boolean; onClick: () => void };
  arrived?: boolean; // it just came into the menu, so it settles in
  style?: React.CSSProperties; // the name's own look (a font's name in that font)
  more?: boolean; // it opens a sub-menu beside the menu (a caret on its right)
  hint?: string; // its key, named with its name when the pointer rests on it
};

export const CELL = 192, GAP = 2, PAD = 4; // px: an option's width and height, the gap and the padding
export const menuWidth = (columns: number) => columns * CELL + (columns - 1) * GAP + 2 * PAD + 2;
export const columnsFor = (width: number) => Math.max(1, Math.round((width - 2 * PAD - 2 + GAP) / (CELL + GAP)));

export const DEFAULT_COLUMNS = 2;

type Props = {
  label: string;
  groups: MenuItem[][];
  columns: number; // the columns the user chose, or defaultColumns
  onColumns?: (columns: number) => void; // the grip: saves a new column count
  onChoose: (key: string) => void;
  onPress?: (e: React.PointerEvent, key: string) => void; // a press that may become a drag onto the toolbar
  onRelease?: (key: string) => void; // the press that opened the menu let go over an option
  extra?: React.ReactNode; // whole-width rows after the options (an option's own sub-menu, a field)
  head?: React.ReactNode; // a whole-width row before the options (a field to find one)
  children?: React.ReactNode; // a sub-menu open beside this one
  className?: string;
  tool?: string;
  style?: React.CSSProperties;
  placed?: boolean; // its owner places it in the window (Pick), so it does not move itself to fit
};

export function Menu(p: Props) {
  // While the grip is dragged the menu's width follows the pointer and its options reflow as whole columns fit;
  // on release it eases to the nearest whole column.
  const [live, setLive] = useState<number>(); // width (px) while the grip is dragged
  const most = Math.max(...p.groups.map((g) => g.length), 1);
  const columns = live === undefined ? p.columns : Math.max(1, Math.min(most, Math.floor((live - 2 * PAD - 2 + GAP) / (CELL + GAP))));
  // A menu that would run off the bottom of the window moves up until it fits (never above the top).
  const box = useRef<HTMLDivElement>(null), [shift, setShift] = useState(0), leaving = useLeaving();
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r || p.placed) return;
    const top = r.top - shift, next = Math.max(8 - top, Math.min(0, innerHeight - 8 - (top + r.height)));
    if (Math.abs(next - shift) > 0.5) setShift(next);
  });
  // A menu that closes with the focus on one of its options gives the focus back to what had it before (the menu's
  // button), so a dialog the option opens gives it back there too when it closes (REL-27).
  useLayoutEffect(() => {
    const before = document.activeElement, menu = box.current;
    return () => { if (menu?.contains(document.activeElement) && before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  return (
    <div ref={box} className={["strip", live !== undefined && "resizing", p.className, leaving && "leaving"].filter(Boolean).join(" ")} data-tool={p.tool} role="menu" aria-label={p.label} inert={leaving}
      style={{ ...p.style, width: live ?? menuWidth(columns), marginTop: shift, "--columns": columns } as React.CSSProperties}>
      <div className="menu-body">
      {p.head && <div className="menu-head">{p.head}</div>}
      {p.groups.filter((g) => g.length).map((g, i) => (
        <div key={i} className="menu-group" role="group">
          {g.map((item) => (
            <div key={item.key} className={item.arrived ? "variant-cell arrived" : "variant-cell"}>
              <button role="menuitemradio" aria-checked={!!item.checked} aria-haspopup={item.more ? "menu" : undefined} className="variant" data-tip={item.name} data-tip-cut={!item.hint || undefined} data-key={item.hint} data-item={item.key}
                onPointerDown={(e) => p.onPress?.(e, item.key)} onClick={() => p.onChoose(item.key)} onPointerUp={() => p.onRelease?.(item.key)}>
                {item.icon}
                <span className="variant-name" style={item.style}>{item.name}</span>
                {item.more && <CaretRight size={12} className="submenu-caret" aria-hidden />}
              </button>
              {item.action && (
                <button className="variant-action" aria-label={item.action.label} data-tip={item.action.label} aria-pressed={item.action.pressed} onClick={item.action.onClick}>
                  {item.action.icon}
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
      {p.extra && <div className="menu-group menu-extra" role="group">{p.extra}</div>}
      </div>
      {p.onColumns && (
        <span className="grip" role="separator" aria-label="Drag to resize" data-tip="Drag to resize"
          onPointerDown={(e) => {
            // Drag the corner: the menu snaps to whole columns, from one to as many as its longest group.
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            holdCursor(e.currentTarget);
            const startX = e.clientX, start = menuWidth(p.columns);
            let width = start;
            const move = (ev: PointerEvent) => { width = Math.max(menuWidth(1), Math.min(menuWidth(most), start + ev.clientX - startX)); setLive(width); };
            const up = () => {
              removeEventListener("pointermove", move);
              removeEventListener("pointerup", up);
              p.onColumns!(Math.min(most, columnsFor(width)));
              setLive(undefined);
            };
            addEventListener("pointermove", move);
            addEventListener("pointerup", up);
          }} />
      )}
      {p.children}
    </div>
  );
}

// A list of choices from a button: a font, a size, a line, a setting. It is the menu above as one column, so every
// list looks and works the same: the Actions panel's, Settings' and the dialogs'. It opens over its button (Sam,
// 17 October 2026), right edges lined up, and scrolls when it is taller than the room there; it opens under the
// button only when not even six options fit above and there is more room below. more: a last option that opens a
// longer list (every font on the computer) with a field to find one. Arrow keys move along the list, a letter goes to
// the next option that starts with it, Return picks, Escape closes. A list opened by the keyboard takes the focus; one
// opened by a click leaves it where it was (in text being typed, say).
const ROW = 32; // px: a list option's height and the gap under it
export const listOpen = () => !!document.querySelector(".strip.list:not(.leaving), .colour-pop:not(.leaving)"); // a list or a colour picker is open: its keys come first
type PickProps = {
  label: string; // what the list chooses, read out and named on the button
  value: string; // the key chosen now
  groups: MenuItem[][];
  onPick: (key: string) => void;
  more?: { name: string; icon?: React.ReactNode; find: string; load: () => Promise<MenuItem[]> };
  className?: string; // the button's look
  title?: string;
  style?: React.CSSProperties;
  children: React.ReactNode; // what the button shows
  onDoubleClick?: () => void;
  onKey?: (e: React.KeyboardEvent<HTMLButtonElement>) => boolean | void; // a key on the closed button; true when it used it
  start?: boolean; // open as it comes on screen, with the longer list (Text > Font > Other Font…)
  disabled?: boolean; // nothing to choose yet: the button shows, greyed, as a disabled button does
};

// A list's keys (Pick's, the Actions menu's): up and down move along its options, Home and End go to the ends, a
// letter to the next option that starts with it. True when it used the key.
export function listKeys(e: React.KeyboardEvent, list: HTMLElement): boolean {
  const options = [...list.querySelectorAll<HTMLElement>(".variant")], at = options.indexOf(document.activeElement as HTMLElement);
  const go = (k: number) => { e.preventDefault(); e.stopPropagation(); options[Math.max(0, Math.min(options.length - 1, k))]?.focus(); return true; };
  if (e.key === "ArrowDown") return go(at + 1);
  if (e.key === "ArrowUp") return go(at < 0 ? options.length - 1 : at - 1);
  if (e.key === "Home" || e.key === "End") return go(e.key === "Home" ? 0 : options.length - 1);
  if (e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !(e.target instanceof HTMLInputElement)) {
    const k = options.findIndex((o, j) => j > at && o.textContent?.toLowerCase().startsWith(e.key.toLowerCase())), first = options.findIndex((o) => o.textContent?.toLowerCase().startsWith(e.key.toLowerCase()));
    return go(k >= 0 ? k : first >= 0 ? first : at);
  }
  return false;
}

export function Pick(p: PickProps) {
  const [open, setOpen] = useState<{ focus: boolean }>(), [all, setAll] = useState<MenuItem[]>(), [query, setQuery] = useState("");
  const button = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const close = (refocus = false) => { setOpen(undefined); setAll(undefined); setQuery(""); if (refocus) button.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => t instanceof Node && (!!list.current?.contains(t) || !!button.current?.contains(t));
    const away = (e: PointerEvent) => { if (!inside(e.target)) close(); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(true); } };
    // It closes when its button scrolls away under it, as when the panel scrolls.
    const scrolled = (e: Event) => { if (!inside(e.target)) close(); };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    addEventListener("scroll", scrolled, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); removeEventListener("scroll", scrolled, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.start) return;
    if (p.more) void p.more.load().then((items) => { setAll(items); setOpen({ focus: true }); });
    else setOpen({ focus: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened by the keyboard: the focus goes to the option chosen (or the field to find one).
  useLayoutEffect(() => {
    if (!open?.focus || !list.current) return;
    (list.current.querySelector<HTMLElement>(".menu-head input") ?? list.current.querySelector<HTMLElement>('.variant[aria-checked="true"]') ?? list.current.querySelector<HTMLElement>(".variant"))?.focus();
  }, [open, all]);
  const found = all?.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()));
  const groups = found ? [found.slice(0, 300)] : [...p.groups, ...(p.more ? [[{ key: "\u0000more", name: p.more.name, icon: p.more.icon ?? null }]] : [])];
  const choose = (key: string) => {
    if (key === "\u0000more") return void p.more!.load().then((items) => { setAll(items); setOpen({ focus: true }); });
    close(!!open?.focus);
    if (key !== p.value) p.onPick(key);
  };
  const place = (): React.CSSProperties => {
    const r = button.current!.getBoundingClientRect(), rows = all ? 12 : groups.reduce((n, g) => n + g.length, 0), want = rows * ROW + 2 * PAD + 2 + 8 * (groups.length - 1);
    const below = innerHeight - r.bottom - 12, above = r.top - 12, down = above < Math.min(want, 6 * ROW + 2 * PAD + 2) && below > above;
    const across = r.right - menuWidth(1) < 8 ? { left: Math.max(8, r.left), right: "auto" } : { left: "auto", right: innerWidth - r.right };
    // Always inside the window, even for a button partly out of view.
    return { position: "fixed", ...across, maxHeight: Math.min(innerHeight - 16, Math.max(80, (down ? below : above) - 4)), zIndex: 20,
      ...(down ? { top: Math.min(Math.max(8, r.bottom + 4), innerHeight - 88), bottom: "auto", transformOrigin: "top right" } : { top: "auto", bottom: Math.min(Math.max(8, innerHeight - r.top + 4), innerHeight - 88), transformOrigin: "bottom right" }) };
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") return close();
    if (listKeys(e, list.current!)) return;
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) e.stopPropagation(); // the list's keys are its own
  };
  return (
    <>
      <button ref={button} className={p.className} aria-haspopup="menu" aria-expanded={!!open} aria-label={[p.label, [...p.groups.flat(), ...(all ?? [])].find((i) => i.key === p.value)?.name ?? p.value].filter(Boolean).join(": ")} data-tip={p.title}
        style={p.style} disabled={p.disabled} onClick={() => (open ? close() : setOpen({ focus: false }))} onDoubleClick={p.onDoubleClick}
        onKeyDown={(e) => {
          if (p.onKey?.(e)) return;
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === " " || e.key === "Enter")) { e.preventDefault(); e.stopPropagation(); setOpen({ focus: true }); }
        }}>
        {p.children}
      </button>
      <Exit>{open && createPortal(
        <div ref={list} onKeyDown={keys}>
          <Menu label={p.label} className="list" placed columns={1} groups={groups.map((g) => g.map((i) => ({ ...i, checked: i.key === p.value })))} onChoose={choose} style={place()}
            head={all && (
              <input className="list-find" autoFocus placeholder={p.more!.find} aria-label={p.more!.find} value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && found?.[0]) { e.preventDefault(); e.stopPropagation(); choose(found[0].key); }
                  if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); list.current?.querySelector<HTMLElement>(".variant")?.focus(); }
                }} />
            )}
            extra={found && !found.length ? <p className="list-none">Nothing matches</p> : undefined} />
        </div>, host())}</Exit>
    </>
  );
}

// Where a right-click menu opens: at the pointer for a right-click, or under the middle of the thing for the Menu key
// or Shift+F10 (menuKey), with its first option focused.
export const menuAt = (e: React.MouseEvent | React.KeyboardEvent) => {
  if ("clientX" in e) return { at: { x: e.clientX, y: e.clientY } };
  const r = e.currentTarget.getBoundingClientRect();
  return { at: { x: r.left + r.width / 2, y: r.bottom - 8 }, keyboard: true };
};
export const menuKey = (e: React.KeyboardEvent) => e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey);

// A right-click menu (and the Menu key's, and Shift+F10's): the menu above as one column at the pointer. An option
// with more (a caret) opens its own options beside it as the pointer comes onto it, or with the right arrow key; left
// closes them. Up and down move along it, Return chooses and Escape closes. A click away, a scroll or the window losing
// the focus closes it. Opened from the keyboard, the first option takes the focus; from the pointer, the menu does (so
// the arrow keys work at once). sub: the options an option with more opens, under its title.
export function ContextMenu({ label, at, keyboard, groups, sub, onChoose, onClose }: {
  label: string; at: { x: number; y: number }; keyboard?: boolean; groups: MenuItem[][];
  sub: (key: string) => { label: string; groups: MenuItem[][] } | undefined; onChoose: (key: string) => void; onClose: () => void;
}) {
  const [open, setOpen] = useState<{ key: string; top: number; focus: boolean }>();
  const main = useRef<HTMLDivElement>(null), side = useRef<HTMLDivElement>(null);
  const opens = (key?: string) => !!key && groups.some((g) => g.some((i) => i.key === key && i.more));
  const width = menuWidth(1), left = Math.max(8, Math.min(at.x, innerWidth - width - 8)), subLeft = left + width + 4 + width > innerWidth - 8 ? left - width - 4 : left + width + 4;
  const show = (key: string, focus: boolean) => {
    const row = main.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`);
    if (row) setOpen({ key, top: row.getBoundingClientRect().top - 5, focus });
  };
  const choose = (key: string) => {
    if (opens(key)) return show(key, true);
    onClose();
    onChoose(key);
  };
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!main.current?.contains(e.target as Node) && !side.current?.contains(e.target as Node)) onClose(); };
    const gone = () => onClose();
    addEventListener("pointerdown", away, true);
    addEventListener("wheel", gone, true);
    addEventListener("blur", gone);
    addEventListener("resize", gone);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("wheel", gone, true); removeEventListener("blur", gone); removeEventListener("resize", gone); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { (keyboard ? main.current?.querySelector<HTMLElement>(".variant") : main.current)?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The focus goes in a frame later, after the options' own menu has settled (it gives the focus back as it closes).
  useLayoutEffect(() => {
    if (!open?.focus) return;
    const f = requestAnimationFrame(() => side.current?.querySelector<HTMLElement>(".variant")?.focus());
    return () => cancelAnimationFrame(f);
  }, [open]);
  const keys = (e: React.KeyboardEvent, inSide: boolean) => {
    const focused = (document.activeElement as HTMLElement | null)?.dataset.item;
    if (e.key === "Escape" || e.key === "ArrowLeft") {
      e.preventDefault(); e.stopPropagation();
      if (!inSide && e.key === "Escape") return onClose();
      if (!inSide) return;
      const key = open?.key;
      setOpen(undefined);
      if (key) main.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(key)}"]`)?.focus();
      return;
    }
    if (e.key === "ArrowRight" && !inSide && opens(focused)) { e.preventDefault(); e.stopPropagation(); return show(focused!, true); }
    if (e.key === "Tab") { e.preventDefault(); return onClose(); }
    if (listKeys(e, (inSide ? side : main).current!)) return;
    e.stopPropagation(); // the menu's keys are its own
  };
  const inner = open && sub(open.key), rows = (list: MenuItem[][]) => list.flat().length * 32 + 24;
  return createPortal(
    <>
      <div ref={main} tabIndex={-1} className="context-menu" onKeyDown={(e) => keys(e, false)} onContextMenu={(e) => e.preventDefault()}
        onPointerOver={(e) => { const key = (e.target as HTMLElement).closest<HTMLElement>("[data-item]")?.dataset.item; if (key && key !== open?.key) { if (opens(key)) show(key, false); else setOpen(undefined); } }}>
        <Menu label={label} className="list" placed columns={1} groups={groups.map((g) => g.map((i) => (i.more ? { ...i, checked: open?.key === i.key } : i)))} onChoose={choose}
          style={{ position: "fixed", left, top: Math.max(8, Math.min(at.y, innerHeight - 8 - Math.min(innerHeight - 16, rows(groups)))), maxHeight: innerHeight - 16, zIndex: 30, transformOrigin: "top left" }} />
      </div>
      <Exit>{open && inner && (
        <div ref={side} className="context-menu" onKeyDown={(e) => keys(e, true)} onContextMenu={(e) => e.preventDefault()}>
          <Menu label={inner.label} className="list" placed columns={1} groups={inner.groups} onChoose={choose}
            style={{ position: "fixed", left: subLeft, top: Math.max(8, Math.min(open.top, innerHeight - 8 - rows(inner.groups))), maxHeight: innerHeight - 16, zIndex: 31, transformOrigin: subLeft < left ? "top right" : "top left" }} />
        </div>
      )}</Exit>
    </>, host());
}
