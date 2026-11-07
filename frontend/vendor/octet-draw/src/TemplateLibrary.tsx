// The template library beside the Ring strip (and the Template tool's): categories down the side, a search that looks
// in all of them and also finds structures by name or abbreviation (TREN, dppf, a name OPSIN reads), each one a
// template like the library's own, and each template drawn as it will look on the page. Click one to use it; pin it (or drag it onto
// the Ring strip) to keep it there; drag it onto the toolbar for a shortcut, or onto the canvas to place it. The
// user's own templates come first, in named sets (CD-33, as ChemDraw's template documents): New set adds one, a
// double-click on a set's name renames it, its × removes it (its templates go to My templates). In My templates and
// each set of the user's, Add (always the first tile) adds the selection, or the structure clicked next. A template
// of the user's is renamed by a double-click on its name or from its menu (right-click), which also edits, duplicates,
// moves, orders and removes it; a built-in template's menu copies it into the user's sets or edits a copy. A template
// dragged onto a set's name moves there (a built-in one is copied), dragged within a set of the user's it takes that
// place, and a selection dragged from the canvas onto the open set or a set's name goes in it. Keep open (the open
// set's button, or a set's menu) tears a set off into a floating palette (FloatingTemplates, below). The library and
// each palette have a template size (SizeChoice), and a set's menu saves it as a ChemDraw template file.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLineDownRight, ArrowLineUpLeft, ArrowSquareOut, BookmarkSimple, Copy, FileArrowUp, Folders, FolderSimple, FolderSimplePlus, FolderSimpleUser, MagnifyingGlass, NotePencil, PencilSimple, Plus, PushPin, Trash, X } from "@phosphor-icons/react";
import { ContextMenu, menuAt, menuKey, type MenuItem } from "./Menu";
import { commonKey } from "./common";
import { measure, STYLE } from "./chem";
import { fontStack } from "./docstyle";
import { LIBRARY, type LibraryItem } from "./library";
import { arrowShapes, curvePath, isOrbital, labelTurn, render, shapeInk, shapePaths, spotPath, tlcLayout, type Arrow, type Label, type Mol } from "./render";
import { reduced, timing, useLeaving } from "./motion";
import { holdCursor } from "./cursor";
import { MY_SET, ownId, TEMPLATE_SIZES, templateKind, type FloatingPalette, type TemplateSize, type TemplateTool } from "./templates";

// The tool a library is beside (the Ring tool's Templates row, or the Template tool): a template chosen or added there
// is that tool's.
export type { TemplateTool };
// What the library does with the user's sets (Editor.tsx keeps them in Settings).
export type TemplateSetActions = { add: (name: string) => void; rename: (from: string, to: string) => void; remove: (name: string) => void; move: (id: string, set: string) => void };
// What a template's menu (right-click, in the library or a floating palette) does. onEdit: Edit for one of the user's
// templates, Edit a copy for a built-in one. onPlace: a template of the user's put before another of its set (before
// unset: at the end). onKeepOpen: a set torn off into a floating palette.
export type TemplateActions = {
  sets?: string[]; onSets?: TemplateSetActions; kept?: string[];
  onRemove?: (kind: string) => void; onCopy?: (kind: string, set: string) => void; onNewSet?: (then: (set: string) => void) => void;
  onKeep?: (kind: string, keep: boolean) => void; onEdit?: (kind: string) => void; onDuplicate?: (id: string) => void;
  onPlace?: (id: string, before?: string) => void; onToStart?: (id: string) => void; onToEnd?: (id: string) => void;
  onKeepOpen?: (set: string) => void; onSaveSet?: (set: string) => void;
};
// A set's menu item that saves it as a ChemDraw template file (.ctp), in the library's set menu and a palette's bar.
const SAVE_SET: MenuItem = { key: "saveset", name: "Save for ChemDraw…", icon: <FileArrowUp size={18} /> };

// The template sizes, as a thumbnail's side (px): in the library, and in a floating palette (whose squares are 8 px
// more). Medium is the size each had before there was a choice.
export const LIBRARY_THUMB: Record<TemplateSize, number> = { small: 52, medium: 72, large: 100 };
export const PALETTE_THUMB: Record<TemplateSize, number> = { small: 40, medium: 52, large: 76 };
const SIZE_NAMES: Record<TemplateSize, string> = { small: "Small", medium: "Medium", large: "Large" };
// A template size's glyph, in Phosphor's style: a square as large as the size.
function SizeGlyph({ size, px = 18 }: { size: TemplateSize; px?: number }) {
  const s = { small: 96, medium: 144, large: 192 }[size], o = (256 - s) / 2;
  return <svg width={px} height={px} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinejoin="round" aria-hidden><rect x={o} y={o} width={s} height={s} rx={16} /></svg>;
}
// The template size: a button whose glyph is the size chosen, which opens a menu of the three sizes.
function SizeChoice({ size, onSize, className, px }: { size: TemplateSize; onSize: (size: TemplateSize) => void; className: string; px: number }) {
  const [menu, setMenu] = useState<{ x: number; y: number; keyboard: boolean }>(), button = useRef<HTMLButtonElement>(null), wasOpen = useRef(false);
  return (
    <>
      <button ref={button} className={className} aria-label={`Template size: ${SIZE_NAMES[size]}`} aria-haspopup="menu" aria-expanded={!!menu} data-tip="Template size"
        // A press on the button while its menu is open closes the menu, and the click does not open it again.
        onPointerDown={() => { wasOpen.current = !!menu; }}
        onClick={(e) => {
          if (wasOpen.current) { wasOpen.current = false; return; }
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4, keyboard: e.detail === 0 });
        }}>
        <SizeGlyph size={size} px={px} />
      </button>
      {menu && (
        <ContextMenu label="Template size" at={menu} keyboard={menu.keyboard} groups={[TEMPLATE_SIZES.map((s) => ({ key: s, name: SIZE_NAMES[s], icon: <SizeGlyph size={s} />, checked: s === size }))]}
          sub={() => undefined} onChoose={(key) => onSize(key as TemplateSize)} onClose={() => { setMenu(undefined); if (menu.keyboard) button.current?.focus(); }} />
      )}
    </>
  );
}

// The sets a template can go in, as a sub-menu: My templates, then the user's own sets, then New set… (which names one
// first). key: each set's option; but: a set left out (the one the template is in).
export const setItems = (sets: string[], key: (set: string) => string, fresh: string, but?: string): MenuItem[][] => [
  [MY_SET, ...sets].filter((set) => set !== but).map((set) => ({ key: key(set), name: set, icon: set === MY_SET ? <FolderSimpleUser size={18} /> : <FolderSimple size={18} /> })),
  [{ key: fresh, name: "New set…", icon: <FolderSimplePlus size={18} /> }],
];

const toPath = (polys: [number, number][][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L") + "Z").join("");
// Thumbnails are drawn once for each structure and size (a template edited is a new structure, and is drawn again).
// Small structures keep their size (the view is at least five bonds across); big ones shrink to fit.
type Drawn = { mol: Mol; d: string; fills: { d: string; colour?: string }[]; labels: Label[]; view: string; side: number; line: number };
const thumbs = new Map<string, Drawn>();
const Thumb = ({ item, px }: { item: LibraryItem; px?: number }) => <StructureThumb id={item.kind} mol={item.mol} px={px} />;
// A structure drawn as a thumbnail in a style (STYLE, or STYLE with heavier lines).
// A template's arrows, pen curves and shapes show as they draw on the page (a closed curve's fill behind the lines),
// a highlight as its edge, an orbital as its axis, and its text as its words.
function drawThumb(mol: Mol, style: typeof STYLE): Drawn {
  const L = style.bond, drawing = render(mol, style, measure, L), at = (q: [number, number]) => [q[0] * L, -q[1] * L];
  const filled = (a: Arrow) => !!(a.curve?.closed && a.fill), arrows = mol.arrows ?? [];
  // A TLC plate's origin and solvent front (unless hidden) and its spots, as the canvas draws them.
  const plates = (mol.shapes ?? []).filter((x) => x.kind === "tlc").map(tlcLayout), w = style.line / 2;
  const level = (x0: number, x1: number, y: number): [number, number][] => [at([x0, y]), at([x1, y])].flatMap(([x, y]) => [[x, y - w], [x, y + w]] as [number, number][]);
  const across = (mol.shapes ?? []).filter((x) => x.kind === "tlc").flatMap((x, k) => (["origin", "front"] as const).filter((h) => !x.tlc?.hide?.includes(h)).map((h) => { const t = plates[k], q = level(t.x0, t.x1, t[h]); return [q[0], q[2], q[3], q[1]]; }));
  const spots = (mol.shapes ?? []).filter((x) => x.kind === "tlc").flatMap((x, k) => (x.tlc?.spots ?? []).map((s) => spotPath(plates[k], s).map(at) as [number, number][]));
  const ink = [...arrows.filter((a) => !filled(a)).flatMap((a) => (isOrbital(a) ? [[at(a.from), at(a.to)] as [number, number][]] : arrowShapes(a, style, L))), ...(mol.shapes ?? []).flatMap((x) => (x.kind === "highlight" ? shapePaths(x, L) : shapeInk(x, style, L))), ...across, ...spots];
  const fills = arrows.filter(filled).map((a) => curvePath(a.curve!, L));
  const words: Label[] = (mol.captions ?? []).filter((c) => !c.under && !c.on).map((c) => { const [x, y] = at([c.x, c.y]); return { text: c.text, x, y, size: (c.size ?? 10) * (4 / 3) }; });
  const points = [...ink, ...fills].flat(), xs = [...points.map((q) => q[0]), ...words.map((w) => w.x)], ys = [...points.map((q) => q[1]), ...words.map((w) => w.y)];
  const [x0, y0, x1, y1] = mol.atoms.length || !xs.length ? [Math.min(drawing.box[0], ...xs), Math.min(drawing.box[1], ...ys), Math.max(drawing.box[2], ...xs), Math.max(drawing.box[3], ...ys)] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const side = Math.max(x1 - x0, y1 - y0, 5 * L), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { mol, d: toPath([...drawing.polygons, ...ink]), fills: arrows.filter(filled).map((a, k) => ({ d: toPath([fills[k]]), colour: a.colour })), labels: [...drawing.labels, ...words], view: `${cx - side / 2} ${cy - side / 2} ${side} ${side}`, side, line: style.line };
}
// Any structure as a thumbnail, drawn once per id, structure and size. px: the side it is shown at. A line is its fill
// and its outline, so it shows twice its width; at a size where that is under a pixel (a small size, or a big structure
// shrunk to fit), it is drawn again with lines a pixel wide, so it stays sharp and dark at every size.
export function StructureThumb({ id, mol, px }: { id: string; mol: Mol; px?: number }) {
  const key = px ? `${id}\n${px}` : id;
  let t = thumbs.get(key);
  if (!t || t.mol !== mol) {
    t = drawThumb(mol, STYLE);
    const line = px ? t.side / (2 * px) : 0;
    if (line > STYLE.line) t = drawThumb(mol, { ...STYLE, line });
    if (thumbs.size >= 3000) thumbs.clear();
    thumbs.set(key, t);
  }
  return (
    <svg className="thumb" viewBox={t.view} aria-hidden>
      {t.fills.map((f, i) => <path key={i} d={f.d} fill={f.colour ?? "currentColor"} />)}
      <path d={t.d} fill="currentColor" stroke="currentColor" strokeWidth={t.line} />
      {t.labels.map((l, i) => <text key={i} x={l.x} y={l.y} transform={labelTurn(l)} fill="currentColor" style={{ font: `${l.size}px ${fontStack("Arial")}` }}>{l.text}</text>)}
    </svg>
  );
}

// A template's menu, the same in the library and in a floating palette: Edit, Rename, Duplicate, Move to, Move to
// start, Move to end and Remove for one of the user's own; Add to templates (a copy), Edit a copy and the Ring menu pin
// for a built-in one. onRename: Rename was chosen (the library shows the name field).
export function TemplateMenu({ item, at, keyboard, actions: a, onRename, onClose }: {
  item: LibraryItem; at: { x: number; y: number }; keyboard?: boolean; actions: TemplateActions; onRename?: () => void; onClose: () => void;
}) {
  const id = ownId(item.kind), kept = !!a.kept?.includes(item.kind);
  const groups: MenuItem[][] = id ? [
    [...(a.onEdit ? [{ key: "edit", name: "Edit", icon: <NotePencil size={18} /> }] : []), ...(onRename ? [{ key: "rename", name: "Rename", icon: <PencilSimple size={18} /> }] : []),
      ...(a.onDuplicate ? [{ key: "duplicate", name: "Duplicate", icon: <Copy size={18} /> }] : [])],
    [...(a.onSets ? [{ key: "move", name: "Move to", icon: <Folders size={18} />, more: true }] : []), ...(a.onToStart ? [{ key: "start", name: "Move to start", icon: <ArrowLineUpLeft size={18} /> }] : []),
      ...(a.onToEnd ? [{ key: "end", name: "Move to end", icon: <ArrowLineDownRight size={18} /> }] : [])],
    a.onRemove ? [{ key: "remove", name: "Remove", icon: <Trash size={18} /> }] : [],
  ] : [[
    ...(a.onCopy && a.onSets ? [{ key: "copy", name: "Add to templates", icon: <BookmarkSimple size={18} />, more: true }] : []),
    ...(a.onEdit ? [{ key: "edit", name: "Edit a copy", icon: <NotePencil size={18} /> }] : []),
    ...(a.onKeep ? [{ key: "keep", name: "Keep in the Ring menu", icon: <PushPin size={18} />, checked: kept }] : []),
  ]];
  const sub = (key: string) => (key === "move" ? { label: "Move to", groups: setItems(a.sets ?? [], (s) => `move:${s}`, "move.new", item.category) }
    : key === "copy" ? { label: "Add to templates", groups: setItems(a.sets ?? [], (s) => `copy:${s}`, "copy.new") } : undefined);
  const choose = (key: string) => {
    if (key === "edit") return a.onEdit?.(item.kind);
    if (key === "rename") return onRename?.();
    if (key === "remove") return a.onRemove?.(item.kind);
    if (key === "keep") return a.onKeep?.(item.kind, !kept);
    if (key.startsWith("copy:")) return a.onCopy?.(item.kind, key.slice(5));
    if (key === "copy.new") return a.onNewSet?.((set) => a.onCopy?.(item.kind, set));
    if (!id) return;
    if (key === "duplicate") return a.onDuplicate?.(id);
    if (key === "start") return a.onToStart?.(id);
    if (key === "end") return a.onToEnd?.(id);
    if (key.startsWith("move:")) return a.onSets?.move(id, key.slice(5));
    if (key === "move.new") return a.onNewSet?.((set) => a.onSets?.move(id, set));
  };
  return <ContextMenu label={item.name} at={at} keyboard={keyboard} groups={groups.filter((g) => g.length)} sub={sub} onChoose={choose} onClose={onClose} />;
}

// The order of a set of the user's, by drag: while one of its templates is carried over the grid, a bar shows where it
// will go (before the template under the pointer, or after it past its middle); let go on the grid, it goes there.
// The other templates glide to their new places (none with reduced motion). glide: called with the grid just before
// any change of order, so a move from the menu glides too.
const DRAG_PX = 6;
function useOrder(grid: React.RefObject<HTMLElement | null>, onPlace: ((id: string, before?: string) => void) | undefined, order: string) {
  const [mark, setMark] = useState<{ before?: string }>(), from = useRef<Map<string, DOMRect>>(undefined);
  const glide = () => { from.current = new Map([...grid.current?.querySelectorAll<HTMLElement>("[data-kind]") ?? []].map((el) => [el.dataset.kind!, el.getBoundingClientRect()])); };
  useLayoutEffect(() => {
    const was = from.current;
    from.current = undefined;
    if (!was || reduced()) return;
    const how = timing();
    for (const el of grid.current?.querySelectorAll<HTMLElement>("[data-kind]") ?? []) {
      const a = was.get(el.dataset.kind!), b = el.getBoundingClientRect();
      if (a && Math.abs(a.left - b.left) + Math.abs(a.top - b.top) > 0.5) el.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: "none" }], how);
    }
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = (e: React.PointerEvent, kind: string) => {
    const id = ownId(kind);
    if (!id || !onPlace || e.button !== 0) return;
    const [sx, sy] = [e.clientX, e.clientY];
    let moved = false;
    // Where it goes for a point: undefined off the grid; before: the template it goes before (unset: the end).
    const at = (x: number, y: number): { before?: string } | undefined => {
      const el = document.elementFromPoint(x, y), box = grid.current;
      if (!el || !box?.contains(el)) return undefined;
      const kinds = [...box.querySelectorAll<HTMLElement>("[data-kind]")].map((c) => c.dataset.kind!);
      if (el.closest(".library-add")) return { before: kinds[0] };
      const cell = el.closest<HTMLElement>("[data-kind]");
      if (!cell) return {};
      const r = cell.getBoundingClientRect(), k = kinds.indexOf(cell.dataset.kind!);
      return { before: x < r.left + r.width / 2 ? kinds[k] : kinds[k + 1] };
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_PX) return;
      moved = true;
      setMark(at(ev.clientX, ev.clientY));
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setMark(undefined);
      const to = moved ? at(ev.clientX, ev.clientY) : undefined;
      if (!to || to.before === kind) return;
      glide();
      onPlace(id, to.before && ownId(to.before));
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  // The cell the bar is drawn by: before the one it goes before, or after the last.
  const markOf = (kind: string, last: boolean) => (!mark ? undefined : mark.before === kind ? "insert-before" : last && !mark.before ? "insert-after" : undefined);
  return { start, markOf, glide };
}

// The last library change shown (reveal's n): a library opened again later shows no name field.
let revealed = 0;
// A click on the name of a template of the user's waits this long for a second click, which renames it (ms).
const NAME_CLICK = 250;

// kept and onKeep: the pins that keep a template in the Ring strip (the panel beside that strip has them).
// mine: the user's own templates, each in its set (category). sets and onSets: the user's named sets.
// tool: the tool the library is beside; a template added here, or dropped here from the canvas, is that tool's.
// onAdd: Add in My templates or a set of the user's (the selection goes in, or a structure is picked next).
// reveal: a set to open on, and a template just added whose name is ready to type. onRename, onRemove: one of the
// user's templates. onCopy: a built-in template copied into a set of the user's. onNewSet: New set…, then what goes in.
// find: structures for what is searched, by name or abbreviation (TREN), each as a built-in template: Octet's own names
// that begin as typed and are drawn already (read false, at once), or all of them with the name as typed or its
// suggestion (read true, once typing pauses). size and onSize: the template size (the settings keep it).
export function LibraryPanel(p: TemplateActions & {
  current: string; dimmed?: boolean; mine?: LibraryItem[]; size?: TemplateSize; onSize?: (size: TemplateSize) => void;
  tool?: TemplateTool; reveal?: { set: string; id?: string; n: number }; find?: (query: string, read: boolean) => LibraryItem[];
  onAdd?: (set: string) => void; onRename?: (id: string, name: string) => void;
  onChoose: (kind: string) => void; onPress: (e: React.PointerEvent, kind: string) => void;
}) {
  const own = useMemo(() => [MY_SET, ...(p.sets ?? [])].map((name) => ({ name, items: (p.mine ?? []).filter((t) => t.category === name), own: true })), [p.mine, p.sets]);
  const categories = useMemo(() => [...own.filter((c) => c.items.length || p.onSets), ...LIBRARY.map((c) => ({ ...c, own: false }))], [own, p.onSets]);
  const fresh = p.reveal && p.reveal.n !== revealed ? p.reveal : undefined;
  // It opens on the set a template was just added to, or on the category of the template in hand.
  const [category, setCategory] = useState(() => fresh?.set ?? categories.find((c) => c.items.some((t) => t.kind === p.current))?.name ?? categories[0].name);
  const [query, setQuery] = useState(""), leaving = useLeaving();
  // A set's name being typed: a new set ("" until it has one), or one being renamed.
  const [naming, setNaming] = useState<{ from?: string; value: string }>();
  // The template whose name is being typed, the template whose menu is open (at the pointer, or under the template
  // when a key opened it), and the set whose menu is open.
  const [editing, setEditing] = useState(() => (fresh?.id ? templateKind(fresh.id) : undefined));
  const [menu, setMenu] = useState<{ kind: string; at: { x: number; y: number }; keyboard?: boolean }>();
  const [setChoice, setSetChoice] = useState<{ set: string; own: boolean; at: { x: number; y: number }; keyboard?: boolean }>();
  useEffect(() => {
    if (!fresh) return;
    revealed = fresh.n;
    setCategory(fresh.set);
    setQuery("");
    setEditing(fresh.id ? templateKind(fresh.id) : undefined);
  }, [fresh?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  // A template being dragged, to drop on a set's name: one of the user's moves there, a built-in one is copied there.
  const carried = useRef<string>(undefined), [dragging, setDragging] = useState(false);
  useEffect(() => {
    const up = () => { setDragging(false); setTimeout(() => (carried.current = undefined)); };
    addEventListener("pointerup", up);
    return () => removeEventListener("pointerup", up);
  }, []);
  const grid = useRef<HTMLDivElement>(null), timer = useRef<number>(undefined), refocus = useRef<string>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A name typed with the keyboard gives the focus back to its template.
  useEffect(() => {
    if (editing || !refocus.current) return;
    grid.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(refocus.current)}"]`)?.focus();
    refocus.current = undefined;
  }, [editing]);
  const open = categories.find((c) => c.name === category) ?? categories[0];
  // Structures found by name: the ones already drawn at once, all of them once typing pauses (drawing takes a moment).
  const typed = query.trim();
  const quick = useMemo(() => (typed && p.find ? p.find(typed, false) : []), [typed, p.find]);
  const [read, setRead] = useState<{ typed: string; items: LibraryItem[] }>();
  useEffect(() => {
    if (!typed || !p.find) return;
    const t = setTimeout(() => setRead({ typed, items: p.find!(typed, true) }), 150);
    return () => clearTimeout(t);
  }, [typed, p.find]);
  const named = read?.typed === typed ? read.items : quick;
  // The library's templates whose name, category or other words have what is typed in them, then the structures found by
  // name (the library's own template where it has one by that name, as P(t-Bu)3 for P(tBu)3); the one named exactly as
  // typed first.
  const shown = useMemo(() => {
    const q = typed.toLowerCase();
    if (!q) return open.items;
    const all = categories.flatMap((c) => c.items);
    const found = all.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || !!t.also?.toLowerCase().includes(q));
    for (const t of named) {
      const item = all.find((x) => commonKey(x.name) === commonKey(t.name)) ?? t;
      if (!found.some((x) => x.kind === item.kind || commonKey(x.name) === commonKey(item.name))) found.push(item);
    }
    const exact = (t: LibraryItem) => commonKey(t.name) === commonKey(typed);
    return [...found.filter(exact), ...found.filter((t) => !exact(t))];
  }, [open, typed, categories, named]);
  // A set of the user's is in the order the user gives it: by drag, or Move to start and Move to end.
  const ordering = !query && open.own;
  const order = useOrder(grid, ordering ? p.onPlace : undefined, shown.map((t) => t.kind).join("\n"));
  const actions: TemplateActions = { ...p, onToStart: p.onToStart && ((id) => { order.glide(); p.onToStart!(id); }), onToEnd: p.onToEnd && ((id) => { order.glide(); p.onToEnd!(id); }) };
  const done = (keep: boolean) => {
    const n = naming;
    setNaming(undefined);
    if (!keep || !n || !n.value.trim()) return;
    if (n.from) p.onSets?.rename(n.from, n.value); else p.onSets?.add(n.value);
    setCategory(n.value.trim().slice(0, 40));
  };
  const nameField = (
    <input className="library-set-name" autoFocus aria-label="Set name" placeholder="Set name" spellCheck={false} value={naming?.value ?? ""} maxLength={40}
      onChange={(e) => setNaming({ ...naming, value: e.target.value })} onBlur={() => done(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(e.key === "Enter"); } }} />
  );
  // Where a canvas selection dragged here goes (the Editor reads these as it is let go): the open set of the user's,
  // or one of their sets' names.
  const drop = (set: string) => (p.onSets && p.tool ? { "data-drop-set": set, "data-drop-tool": p.tool } : {});
  const item = menu && [...categories.flatMap((c) => c.items), ...named].find((t) => t.kind === menu.kind);
  // A click on a name of the user's waits for a second one (a double-click renames it); a click elsewhere chooses at once.
  const onName = (e: React.MouseEvent) => !!(e.target as Element).closest(".library-name");
  const size = p.size ?? "medium", px = LIBRARY_THUMB[size];
  // A set's menu: Keep open for every set, and Save for ChemDraw… for one with templates; Rename and Remove for
  // the user's own (not My templates).
  const setGroups = (s: { set: string; own: boolean }): MenuItem[][] => [
    [...(p.onKeepOpen ? [{ key: "keepopen", name: "Keep open", icon: <ArrowSquareOut size={18} /> }] : []), ...(p.onSaveSet && categories.find((c) => c.name === s.set)?.items.length ? [SAVE_SET] : [])],
    s.own && s.set !== MY_SET && p.onSets ? [{ key: "rename", name: "Rename", icon: <PencilSimple size={18} /> }, { key: "remove", name: "Remove", icon: <Trash size={18} /> }] : [],
  ].filter((g) => g.length);
  const chooseSet = (s: { set: string }, key: string) => {
    if (key === "keepopen") return p.onKeepOpen?.(s.set);
    if (key === SAVE_SET.key) return p.onSaveSet?.(s.set);
    if (key === "rename") return setNaming({ from: s.set, value: s.set });
    if (key === "remove") { p.onSets?.remove(s.set); if (category === s.set) setCategory(MY_SET); }
  };
  return (
    <div className={["library", p.dimmed && "carrying", dragging && "dragging", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label="Templates" inert={leaving}
      style={{ "--thumb": `${px}px` } as React.CSSProperties}>
      <div className="library-side">
        <label className="library-search">
          <MagnifyingGlass size={16} aria-hidden />
          <input placeholder="Search" aria-label="Search templates" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }} />
        </label>
        <div className="library-sets">
          {categories.map((c, k) => (
            <div key={c.name} className={c.own && !categories[k + 1]?.own && p.onSets ? "library-set last" : "library-set"}>
              {naming?.from === c.name ? nameField : (
                <button className="library-category" aria-pressed={!query && category === c.name} onClick={() => { setCategory(c.name); setQuery(""); }} {...(c.own ? drop(c.name) : {})}
                  onDoubleClick={() => { if (c.own && c.name !== MY_SET && p.onSets) setNaming({ from: c.name, value: c.name }); }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setSetChoice({ set: c.name, own: c.own, ...menuAt(e) }); }}
                  onKeyDown={(e) => { if (!menuKey(e)) return; e.preventDefault(); e.stopPropagation(); setSetChoice({ set: c.name, own: c.own, ...menuAt(e) }); }}
                  onPointerUp={() => {
                    const kind = carried.current, id = kind && ownId(kind);
                    if (!kind || !c.own || !p.onSets) return;
                    if (id) p.onSets.move(id, c.name); else p.onCopy?.(kind, c.name);
                  }}>
                  {c.name}<span>{c.items.length}</span>
                </button>
              )}
              {c.own && c.name !== MY_SET && p.onSets && naming?.from !== c.name && (
                <button className="variant-action" aria-label={`Remove the set ${c.name}`} data-tip="Remove the set" onClick={() => { p.onSets!.remove(c.name); if (category === c.name) setCategory(MY_SET); }}>
                  <X size={12} />
                </button>
              )}
              {c.own && !categories[k + 1]?.own && p.onSets && (naming && !naming.from ? nameField : (
                <button className="library-category library-new" onClick={() => setNaming({ value: "" })}><Plus size={12} aria-hidden />New set</button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="library-main">
        <div className="library-head">
          <h3 className="library-title">{query ? "Results" : open.name}</h3>
          {p.onSize && <SizeChoice className="library-keep" px={16} size={size} onSize={p.onSize} />}
          {!query && p.onKeepOpen && (
            <button className="library-keep" aria-label={`Keep ${open.name} open`} data-tip="Keep open" onClick={() => p.onKeepOpen!(open.name)}>
              <ArrowSquareOut size={16} />
            </button>
          )}
        </div>
        <div ref={grid} className="library-grid" role="menu" aria-label={query ? "Results" : category} {...(!query && open.own ? drop(open.name) : {})}>
          {!query && open.own && p.onAdd && (
            <div className="library-cell">
              <button role="menuitem" className="library-item library-add" aria-label={`Add a structure to ${open.name}`} onClick={() => p.onAdd!(open.name)}>
                <span className="library-add-mark" aria-hidden><Plus size={20} /></span>
                <span className="library-name">Add</span>
              </button>
            </div>
          )}
          {shown.map((t, k) => {
            const kept = !!p.kept?.includes(t.kind), mine = !!ownId(t.kind), mark = ordering ? order.markOf(t.kind, k === shown.length - 1) : undefined;
            if (editing === t.kind) return (
              <div key={t.kind} className="library-cell">
                <div className="library-item editing">
                  <Thumb item={t} px={px} />
                  <input className="library-rename" aria-label="Template name" autoFocus defaultValue={t.name} maxLength={80} spellCheck={false} onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter" && e.key !== "Escape") return;
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.key === "Escape") e.currentTarget.value = t.name;
                      refocus.current = t.kind;
                      e.currentTarget.blur();
                    }}
                    onBlur={(e) => { setEditing(undefined); p.onRename?.(ownId(t.kind)!, e.target.value); }} />
                </div>
              </div>
            );
            return (
              <div key={t.kind} className={mark ? `library-cell ${mark}` : "library-cell"}>
                <button role="menuitemradio" aria-checked={p.current === t.kind} className="library-item" data-tip={t.name} data-tip-cut data-kind={t.kind}
                  onPointerDown={(e) => { if (e.button === 0) { carried.current = t.kind; setDragging(true); if (ordering) order.start(e, t.kind); } p.onPress(e, t.kind); }}
                  onClick={(e) => {
                    clearTimeout(timer.current);
                    if (mine && p.onRename && onName(e)) timer.current = window.setTimeout(() => p.onChoose(t.kind), NAME_CLICK);
                    else p.onChoose(t.kind);
                  }}
                  onDoubleClick={(e) => { if (mine && p.onRename && onName(e)) { clearTimeout(timer.current); setEditing(t.kind); } }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: t.kind, ...menuAt(e) }); }}
                  onKeyDown={(e) => { if (!menuKey(e)) return; e.preventDefault(); e.stopPropagation(); setMenu({ kind: t.kind, ...menuAt(e) }); }}>
                  <Thumb item={t} px={px} />
                  <span className="library-name">{t.name}</span>
                </button>
                {mine && p.onRemove ? (
                  <button className="variant-action" aria-label={`Remove ${t.name}`} data-tip="Remove" onClick={() => p.onRemove!(t.kind)}>
                    <X size={12} />
                  </button>
                ) : p.onKeep && !mine && (
                  <button className="variant-action" aria-pressed={kept} aria-label={`Keep ${t.name} in the Ring menu`} data-tip={kept ? "In the Ring menu" : "Keep in the Ring menu"} onClick={() => p.onKeep!(t.kind, !kept)}>
                    <PushPin size={12} />
                  </button>
                )}
              </div>
            );
          })}
          {!shown.length && query && <p className="library-none">No template called “{query.trim()}”. Type its name in the Ring list to add it.</p>}
        </div>
      </div>
      {menu && item && (
        <TemplateMenu item={item} at={menu.at} keyboard={menu.keyboard} actions={{ ...actions, onPlace: undefined, ...(ordering && ownId(item.kind) ? {} : { onToStart: undefined, onToEnd: undefined }) }}
          onRename={p.onRename ? () => setEditing(item.kind) : undefined}
          onClose={() => { const k = menu.kind; setMenu(undefined); if (menu.keyboard) grid.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(k)}"]`)?.focus(); }} />
      )}
      {setChoice && setGroups(setChoice).length > 0 && (
        <ContextMenu label={setChoice.set} at={setChoice.at} keyboard={setChoice.keyboard} groups={setGroups(setChoice)} sub={() => undefined} onChoose={(key) => chooseSet(setChoice, key)} onClose={() => setSetChoice(undefined)} />
      )}
    </div>
  );
}

// A set kept open beside the canvas (ChemDraw's floating template palettes): its name on a bar that drags it, its
// close button, and its templates as thumbnails, each named by its tooltip. A click uses one (with the tool the palette
// was opened for); a drag puts one on the canvas or the toolbar; right-click gives the template's menu, as in the
// library; a set of the user's is ordered by drag here too. The corner grip makes it wider or narrower in whole
// columns, and the size button sets its template size (the columns stay, so it grows or shrinks). Right-click on its
// bar gives the set's menu (Save for ChemDraw…). Thumbnails are drawn once for each size (StructureThumb).
// onFront: it was pressed, so it comes in front of the others.
export const PALETTE_GAP = 2, PALETTE_PAD = 4; // px: the gap between templates, the padding round them
const paletteWidth = (columns: number, cell: number) => columns * cell + (columns - 1) * PALETTE_GAP + 2 * PALETTE_PAD + 2;
export function FloatingTemplates({ palette, items, current, actions, z, onChoose, onPress, onMove, onColumns, onSize, onClose, onFront, onRename }: {
  palette: FloatingPalette; items: LibraryItem[]; current?: string; actions: TemplateActions; z: number;
  onChoose: (kind: string) => void; onPress: (e: React.PointerEvent, kind: string) => void;
  onMove: (x: number, y: number) => void; onColumns: (columns: number) => void; onSize: (size: TemplateSize) => void; onClose: () => void; onFront: () => void; onRename?: (kind: string) => void;
}) {
  const box = useRef<HTMLElement>(null), grid = useRef<HTMLDivElement>(null), leaving = useLeaving();
  const [menu, setMenu] = useState<{ kind: string; at: { x: number; y: number }; keyboard?: boolean }>();
  const [setMenuAt, setSetMenuAt] = useState<{ x: number; y: number }>();
  const thumb = PALETTE_THUMB[palette.size], cell = thumb + 8;
  // While it is dragged or resized, it follows the pointer here; the settings get the place when it is let go.
  const [live, setLive] = useState<{ x: number; y: number; columns: number }>();
  const ordering = items.some((t) => ownId(t.kind));
  const order = useOrder(grid, ordering ? actions.onPlace : undefined, items.map((t) => t.kind).join("\n"));
  const columns = live?.columns ?? palette.columns, width = paletteWidth(columns, cell);
  // It stays on the screen: a window made smaller brings it back in, and a tall set scrolls inside the room below it.
  const [, resized] = useState(0);
  useEffect(() => { const r = () => resized((n) => n + 1); addEventListener("resize", r); return () => removeEventListener("resize", r); }, []);
  const x = Math.max(0, Math.min(live?.x ?? palette.x, innerWidth - width)), y = Math.max(0, Math.min(live?.y ?? palette.y, innerHeight - 40));
  const drag = (e: React.PointerEvent, how: "move" | "size") => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    holdCursor(e.currentTarget);
    const [sx, sy, x0, y0, c0] = [e.clientX, e.clientY, x, y, columns];
    let now = { x: x0, y: y0, columns: c0 };
    const move = (ev: PointerEvent) => {
      now = how === "move" ? { x: x0 + ev.clientX - sx, y: y0 + ev.clientY - sy, columns: c0 }
        : { x: x0, y: y0, columns: Math.max(1, Math.min(8, Math.round((paletteWidth(c0, cell) + ev.clientX - sx - 2 * PALETTE_PAD - 2 + PALETTE_GAP) / (cell + PALETTE_GAP)))) };
      setLive(now);
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setLive(undefined);
      if (how === "move" && (now.x !== x0 || now.y !== y0)) onMove(Math.max(0, Math.min(now.x, innerWidth - width)), Math.max(0, Math.min(now.y, innerHeight - 40)));
      if (how === "size" && now.columns !== c0) onColumns(now.columns);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const item = menu && items.find((t) => t.kind === menu.kind);
  return (
    <section ref={box} className={leaving ? "floating-templates leaving" : "floating-templates"} role="dialog" aria-label={palette.set} inert={leaving}
      style={{ left: x, top: y, width, zIndex: z, maxHeight: Math.max(120, innerHeight - y - 8), "--thumb": `${thumb}px` } as React.CSSProperties} onPointerDownCapture={onFront}>
      <header className="floating-head" onPointerDown={(e) => drag(e, "move")}
        onContextMenu={(e) => { e.preventDefault(); if (actions.onSaveSet && items.length) setSetMenuAt({ x: e.clientX, y: e.clientY }); }}>
        <h3 className="floating-title">{palette.set}</h3>
        <SizeChoice className="floating-size" px={12} size={palette.size} onSize={onSize} />
        <button className="floating-close" aria-label={`Close ${palette.set}`} data-tip="Close" onClick={onClose}><X size={12} /></button>
      </header>
      <div ref={grid} className="floating-grid" role="menu" aria-label={palette.set} style={{ gridTemplateColumns: `repeat(${columns}, ${cell}px)` }}>
        {items.map((t, k) => {
          const mark = order.markOf(t.kind, k === items.length - 1);
          return (
            <div key={t.kind} className={mark ? `library-cell ${mark}` : "library-cell"}>
              <button role="menuitemradio" aria-checked={current === t.kind} aria-label={t.name} className="floating-item" data-tip={t.name} data-kind={t.kind}
                onPointerDown={(e) => { if (ordering) order.start(e, t.kind); onPress(e, t.kind); }}
                onClick={() => onChoose(t.kind)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ kind: t.kind, ...menuAt(e) }); }}
                onKeyDown={(e) => { if (!menuKey(e)) return; e.preventDefault(); e.stopPropagation(); setMenu({ kind: t.kind, ...menuAt(e) }); }}>
                <StructureThumb id={t.kind} mol={t.mol} px={thumb} />
              </button>
            </div>
          );
        })}
        {!items.length && <p className="floating-none">This set is empty.</p>}
      </div>
      <span className="grip" role="separator" aria-label="Drag to resize" data-tip="Drag to resize" onPointerDown={(e) => drag(e, "size")} />
      {menu && item && (
        <TemplateMenu item={item} at={menu.at} keyboard={menu.keyboard}
          actions={{ ...actions, onPlace: undefined, onToStart: actions.onToStart && ((id) => { order.glide(); actions.onToStart!(id); }), onToEnd: actions.onToEnd && ((id) => { order.glide(); actions.onToEnd!(id); }) }}
          onRename={onRename && (() => onRename(item.kind))}
          onClose={() => { const k = menu.kind; setMenu(undefined); if (menu.keyboard) grid.current?.querySelector<HTMLElement>(`[data-kind="${CSS.escape(k)}"]`)?.focus(); }} />
      )}
      {setMenuAt && (
        <ContextMenu label={palette.set} at={setMenuAt} groups={[[SAVE_SET]]} sub={() => undefined} onChoose={() => actions.onSaveSet?.(palette.set)} onClose={() => setSetMenuAt(undefined)} />
      )}
    </section>
  );
}
