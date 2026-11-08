// Home (decision 0003): where Octet opens. The lockup, a greeting by name and time of day, then four sections, each
// under its own heading and hairline: New (Quick start: a seamless canvas with no page, focused when Home opens, so
// Return starts it), Templates (purposes, IDEA-SIZE-1: Paper, Thesis, Slides, Poster and Experiment, then the user's own, then
// Custom template), Recent (the recent drawings as pictures, or three example drawings before there are any, with
// Open), and Projects. One click starts or opens a drawing. On first launch Home asks the user's name first, in the
// dotted frame a selected group gets. Nothing here needs an account.
// In the app Home is a window of its own (decision 0020): what opens from it opens in a new window, and the drawings
// open in windows show first, under Open windows.
// The sections are modules: a drag by the heading moves one up or down, a click on the heading folds it to the heading
// and back, and the heading's menu has Move up, Move down and Collapse or Expand. New and Templates sit side by side
// when they are next to each other. Settings keeps the order and the folded sections (src/homeLayout.ts).
// A project is a folder: a list in Octet that points at drawings (src/projects.ts), drawn as a folder in its colour. A
// drawing is in one folder at most. It goes in by Add to folder under its tile, by a drag onto the folder, by Move to
// folder in its menu, or by a drop of files from Finder; going in takes it out of the folder it was in. Under each
// drawing are Add to folder (or the folder it is in) and Change thumbnail; under each folder, Thumbnail, Colour and
// Rename. Each tile also has a right-click menu (the Menu key and Shift+F10 open it too) with the same options and more.
// A folder opens in Home's place, with Home to go back. A picture dropped on a tile becomes its thumbnail.
// Experiments, beside Open… when there are any, opens the experiment pages Octet has opened or saved (discussion #15) in
// Home's place too: a table with each one's picture, Title, Date, Project, Notebook and Yield, sorted by Date or Title
// (a click on the column's name), a search over their details, and Export CSV….
// Several drawings at once, as in Finder: ⌘-click (Ctrl-click on Windows and Linux) adds a drawing's tile to the
// selection or takes it out, Shift-click and Shift with an arrow key select the run from the last one, ⌘A selects every
// drawing on the page (Recent, or the open folder) and Escape or a click on the page clears it. A plain click still
// opens a drawing. The right-click menu on a selected tile, Delete and a drag to a folder act on all of them.
// Keys: the arrow keys move between tiles, across sections. Tab goes from section to section (its heading, then one
// stop for its tiles, the tile last focused there, then that tile's buttons), and each section is a region named by
// its heading, for screen readers.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "./listen";
import {
  ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowUp, ArrowsInLineVertical, ArrowsOutLineVertical, CaretDown, CaretUp, DotsThree, Export, FilePlus, Flask, FolderOpen, FolderPlus,
  FolderSimpleMinus, FolderSimplePlus, ImageSquare, MagnifyingGlass, MinusCircle, Palette, PencilSimple, Plus, Trash, X,
} from "@phosphor-icons/react";
import { COLOURS, QUICK, outlines, type DocStyle, type PurposeKind } from "./docstyle";
import mark from "../brand/logos/octet-mark.svg";
import markSmall from "../brand/logos/octet-mark-small.svg";
import markWhite from "../brand/logos/octet-mark-white.svg";
import lockup from "../brand/logos/octet-lockup.svg";
import lockupWhite from "../brand/logos/octet-lockup-white.svg";
import { ColourPop } from "./ColourPicker";
import { Dialog, useModal } from "./Dialog";
import { tileTo } from "./keys";
import { ContextMenu, menuAt, menuKey, type MenuItem } from "./Menu";
import { Exit, reduced, timing } from "./motion";
import { colourOf, folderOf, folderTones, projectOf, PROJECT_COLOUR, tilde, UNTITLED, type Project } from "./projects";
import { moveSection, rowsOf, type HomeLayout, type SectionId } from "./homeLayout";
import { MAX_INPUT } from "./thumbs";
import type { HomeLibrary, ThumbTarget, TilePicture } from "./homeLibrary";
import { STARTERS } from "./starters";
import { experimentRows, type ExperimentEntry, type ExperimentSort } from "./experiment";
import { formatAmount } from "./stoich";
import { host } from "./synpath"; // SynPath: portals go in the editor's own element

export type RecentEntry = { path: string; name: string; at: number; thumb?: string; found: boolean };
// A drawing open in a window of its own (src-tauri/src/windows.rs), with its picture as an SVG when it has one.
export type OpenWindow = { label: string; name: string; path: string | null; edited: boolean; picture: string | null };
// A drawing a crash took, kept with its unsaved changes (src-tauri/src/recovery.rs).
export type RecoveredEntry = { id: string; name: string; at: number };

// The greeting: welcome on the first visit, welcome back after a week away, else by the time of day.
export function greeting(name: string, now: Date, first: boolean, away: number): string {
  const n = name ? `, ${name}` : "";
  if (first) return `Welcome to Octet${n}.`;
  if (away > 7 * 24 * 3600 * 1000) return `Welcome back${n}.`;
  const h = now.getHours(), friday = now.getDay() === 5;
  if (h >= 5 && h < 12) return `Good morning${n}.`;
  if (h >= 12 && h < 17) return friday ? `Happy Friday${n}.` : `Good afternoon${n}.`;
  if (h >= 17 && h < 22) return `Good evening${n}.`;
  return name ? `Working late, ${name}?` : "Working late?";
}

// When a drawing was last opened or saved: today and yesterday with the time, this week by day, else the date.
function when(at: number, now: Date): string {
  const d = new Date(at * 1000), day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000), time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Yesterday, ${time}`;
  if (days > 1 && days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
}

// The mark (brand/logos/README.md): the small-size file under 20 px, the exact mark above; white on the dark navy.
function Mark({ size }: { size: number }) {
  return (
    <picture>
      <source srcSet={markWhite} media="(prefers-color-scheme: dark)" />
      <img src={size < 20 ? markSmall : mark} alt="" width={size} height={size} draggable={false} />
    </picture>
  );
}

// A purpose's page as a picture: the page and its outlines, with a small scheme (two rings and an arrow) at its true
// size on that page, so each tile shows how big a structure is on it. Experiment shows its details as lines at the top.
export function PurposePicture({ style, kind }: { style: DocStyle; kind: PurposeKind }) {
  const all = outlines(style, kind), w = Math.max(...all.map((o) => o[1])), h = Math.max(...all.map((o) => o[2]));
  const b = (style.bond * 25.4) / 72, r = (Math.sqrt(3) / 2) * b; // bond length (mm); a ring's half width
  const ring = (cx: number) => `M${[0, 1, 2, 3, 4, 5].map((k) => `${cx + b * Math.sin((k * Math.PI) / 3)} ${-b * Math.cos((k * Math.PI) / 3)}`).join("L")}Z`;
  const gap = 0.6 * b, arrow = 2.4 * b, half = r + gap + arrow / 2;
  return (
    <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} aria-hidden>
      {all.map(([name, ow, oh], k) => <rect key={name} className={k ? "guide" : "sheet"} x={-ow / 2} y={-oh / 2} width={ow} height={oh} vectorEffect="non-scaling-stroke" />)}
      <path className="scheme" d={`${ring(-half - r)}${ring(half + r)}M${-arrow / 2} 0H${arrow / 2}M${arrow / 2 - 0.35 * b} ${-0.2 * b}L${arrow / 2} 0L${arrow / 2 - 0.35 * b} ${0.2 * b}`} vectorEffect="non-scaling-stroke" />
      {kind === "experiment" && <path className="scheme" d={[0.45, 0.8, 0.8, 1].map((k, i) => `M${15 - w / 2} ${20 - h / 2 + 9 * i}h${k * (w - 30)}`).join("")} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

// Quick start's picture: an open canvas. The canvas fills the tile to its edges, with faint dots that go past them, and
// the scheme the templates show sits in the middle, clear of the dots. No page, so no edge.
function QuickPicture() {
  const b = 9, r = (Math.sqrt(3) / 2) * b, ring = (cx: number) => `M${[0, 1, 2, 3, 4, 5].map((k) => `${cx + b * Math.sin((k * Math.PI) / 3)} ${60 - b * Math.cos((k * Math.PI) / 3)}`).join("L")}Z`;
  const gap = 0.6 * b, arrow = 2.4 * b, half = r + gap + arrow / 2, w = half + 2 * r + 8;
  return (
    <svg className="quick-picture" viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <pattern id="quick-dots" width="12" height="12" patternUnits="userSpaceOnUse" x="2"><circle cx="6" cy="6" r="0.8" /></pattern>
        <mask id="quick-clear"><rect width="160" height="120" fill="#fff" /><rect x={80 - w} y={60 - b - 8} width={2 * w} height={2 * b + 16} rx="8" fill="#000" /></mask>
      </defs>
      <rect width="160" height="120" fill="url(#quick-dots)" mask="url(#quick-clear)" />
      <path className="scheme" d={`${ring(80 - half - r)}${ring(80 + half + r)}M${80 - arrow / 2} 60H${80 + arrow / 2}M${80 + arrow / 2 - 0.35 * b} ${60 - 0.2 * b}L${80 + arrow / 2} 60L${80 + arrow / 2 - 0.35 * b} ${60 + 0.2 * b}`} />
    </svg>
  );
}

// A drawing's picture in its tile: the white page with the drawing on it (export.ts draws it in the light theme), a
// photo of the user's own across the whole tile, or, with no picture, the drawing's first letter in the theme's colours.
function DrawingPicture({ name, picture }: { name: string; picture?: TilePicture }) {
  return (
    <span className="home-thumb" data-theme={picture ? "light" : undefined}>
      {picture ? <img className={picture.fill ? "fill" : undefined} src={picture.src} alt="" draggable={false} /> : <span className="home-initial" aria-hidden>{name.slice(0, 1).toUpperCase()}</span>}
    </span>
  );
}

// A project's folder, in Phosphor's folder shape (a back with a tab, and a front), in the project's colour. Its first
// three drawings peek out of the top as pages, the first in front. The project's own thumbnail sits on the front,
// faint and in the folder's colour, as a symbol on a macOS folder does. On hover the front tips open and the pages
// lift; with a drawing carried over it, it opens wider (editor.css).
const FOLDER_BACK = "M0 8a8 8 0 0 1 8-8h40c6 0 6 10 14 10h90a8 8 0 0 1 8 8v94a8 8 0 0 1-8 8H8a8 8 0 0 1-8-8z";
const FAN = [{ x: "0%", r: "-2deg", lift: "-12%" }, { x: "8%", r: "4deg", lift: "-17%" }, { x: "-8%", r: "-6deg", lift: "-14%" }];
function Folder({ colour, papers, emboss }: { colour: string; papers: (TilePicture | undefined)[]; emboss?: string }) {
  const t = folderTones(colour);
  return (
    <span className="folder" data-dark={t.dark || undefined} style={{ "--folder": t.front, "--folder-back": t.back, "--folder-lip": t.lip } as React.CSSProperties} aria-hidden>
      <svg className="folder-back" viewBox="0 0 160 120" preserveAspectRatio="none"><path d={FOLDER_BACK} vectorEffect="non-scaling-stroke" /></svg>
      {papers.slice(0, 3).map((picture, k) => (
        <span key={k} className="paper" data-theme="light" style={{ "--x": FAN[k].x, "--r": FAN[k].r, "--lift": FAN[k].lift, "--k": k, zIndex: 3 - k } as React.CSSProperties}>
          {picture && <img className={picture.fill ? "fill" : undefined} src={picture.src} alt="" draggable={false} />}
        </span>
      ))}
      <span className="folder-front">{emboss && <img src={emboss} alt="" draggable={false} />}</span>
    </span>
  );
}
// New project: an empty folder in outline, dashed, with a plus.
function EmptyFolder() {
  return (
    <span className="folder outline" aria-hidden>
      <svg className="folder-lines" viewBox="0 0 160 120" preserveAspectRatio="none">
        <path d="M0.5 36V8.5a8 8 0 0 1 8-8h39.5c6 0 6 10 14 10h89.5a8 8 0 0 1 8 8V36" vectorEffect="non-scaling-stroke" />
        <rect x="0.5" y="36" width="159" height="83.5" rx="8" vectorEffect="non-scaling-stroke" />
      </svg>
      <Plus size={20} />
    </span>
  );
}

// A section of Home: its heading (a button that folds it, which a drag moves; its menu moves it too), an action beside
// it, then its tiles. The open project's section has a plain heading.
type Heading = { folded: boolean; lifted: boolean; unfolding: boolean; props: React.ButtonHTMLAttributes<HTMLButtonElement> };
function Section({ id, title, action, className, heading, children }: { id: string; title: string; action?: React.ReactNode; className?: string; heading?: Heading; children: React.ReactNode }) {
  const cls = ["home-section", className, heading?.folded && "folded", heading?.lifted && "lifted", heading?.unfolding && "unfolding"].filter(Boolean).join(" ");
  return (
    <section className={cls} data-section={id} aria-labelledby={`${id}-title`}>
      <div className="home-row">
        <h2 id={`${id}-title`}>
          {heading ? <button className="home-heading" data-heading={id} aria-expanded={!heading.folded} {...heading.props}>{title}<CaretDown size={12} aria-hidden /></button> : title}
        </h2>
        {action}
      </div>
      {!heading?.folded && <div className="home-body">{children}</div>}
    </section>
  );
}

export type PurposeTile = { id: string; name: string; kind: PurposeKind; style: DocStyle; own?: boolean };
type Props = {
  leaving?: boolean; // fading out as a drawing opens
  name: string; first: boolean; away: number; recents: RecentEntry[]; newKey: string; openKey?: string;
  back?: { name: string; key: string; go: () => void }; // the drawing Home was opened over, to go back to
  windows?: OpenWindow[]; onWindow: (w: OpenWindow) => void; // the drawings open in windows of their own (the app)
  recovered: RecoveredEntry[]; onRecovered: (r: RecoveredEntry) => void; onDiscard: (r: RecoveredEntry[], recents?: RecentEntry[]) => void;
  purposes: PurposeTile[]; // the templates: Octet's, then the user's own
  onNew: (purpose: string) => void; onOpen: () => void; onRecent: (r: { path: string }) => void; onRemove: (r: RecentEntry[]) => void;
  onRemovePurpose: (purpose: string) => void;
  onCustom?: () => void; // makes a template of the user's own; unset when they have as many as Octet keeps
  onStarter: (text: string) => void; // opens an example drawing as a new drawing
  lib: HomeLibrary; // the projects and thumbnails
  drops?: boolean; // files from Finder can be dropped on a tile (the app; the UI-only preview takes pictures by the browser's drop)
  palette?: { name: string; hex: string }[]; // the user's own colours, after Octet's, as in every colour row
  layout: HomeLayout; onLayout: (layout: HomeLayout) => void; // the sections' order and the folded ones (settings)
  experiments: ExperimentEntry[]; onRemoveExperiment: (path: string) => void; onExportExperiments: (list: ExperimentEntry[]) => void;
  selectAll: { current?: () => void }; // Edit > Select All (⌘A) over Home
};

// What a right-click menu is for. only: the part a button under the tile opens.
type MenuFor = { at: { x: number; y: number }; keyboard?: boolean } & (
  | { kind: "drawing"; path: string; name: string; found: boolean; recent?: RecentEntry; project?: string; only?: "folder" | "thumb" }
  | { kind: "project"; id: string; only?: "colour" | "thumb" }
  | { kind: "purpose"; id: string; name: string; own?: boolean }
  | { kind: "recovered"; entry: RecoveredEntry }
  | { kind: "starter"; text: string; name: string }
  | { kind: "section"; id: SectionId; name: string }
  | { kind: "experiment"; path: string; name: string }
  | { kind: "many" } // the selected drawings
);

// The first time Home shows (not when a drawing closes back to it), its tiles arrive one after another (FEEL-44): the
// first eight a step apart, the rest with the eighth.
let arrived = false;
const arrive = (k: number) => ({ "--i": Math.min(k, 7) }) as React.CSSProperties;
const drawings = (n: number) => `${n} ${n === 1 ? "drawing" : "drawings"}`;
const experimentCount = (n: number) => `${n} ${n === 1 ? "experiment" : "experiments"}`;
const TITLES: Record<SectionId, string> = { new: "New", templates: "Templates", recent: "Recent", projects: "Folders" };
const PICTURE = /\.(png|jpe?g|gif|bmp|tiff?|webp)$/i;
const MAC = navigator.platform.startsWith("Mac");
const toggles = (e: { metaKey: boolean; ctrlKey: boolean }) => (MAC ? e.metaKey : e.ctrlKey); // ⌘-click, or Ctrl-click

export function Home(p: Props) {
  const grid = useRef<HTMLDivElement>(null), page = useRef<HTMLElement>(null), now = new Date(), lib = p.lib;
  const [first] = useState(() => !arrived);
  useEffect(() => { arrived = true; }, []);
  const [menu, setMenu] = useState<MenuFor>();
  // A project being named: a new one (with the drawings it takes when it is made), or one being renamed.
  const [naming, setNaming] = useState<{ id?: string; value: string; then?: { path: string; name?: string }[] }>();
  const [deleting, setDeleting] = useState<Project>();
  // A project's colour being picked freely (Custom colour…): shown on its folder as it changes, kept when it closes.
  const [picking, setPicking] = useState<{ id: string; hex: string; anchor: DOMRect; keep: HTMLElement | null }>();
  const open = projectOf(lib.store, lib.open);
  // The Experiments list, open in Home's place, with its search and sort.
  const [lab, setLab] = useState(false), [search, setSearch] = useState(""), [sort, setSort] = useState<ExperimentSort>({ by: "date", down: true });
  const n = 1 + p.purposes.length + (p.onCustom ? 1 : 0); // the New tiles: Quick start, the templates, Custom template
  // The selected drawings, by tile key (recovered:<id>, drawing:<path>), and the tile a Shift-click runs from.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set()), anchor = useRef<string>(undefined);
  const recentDrawings = open ? open.drawings.map((d) => ({ path: d.path, name: d.name, recent: undefined as RecentEntry | undefined })) : p.recents.map((r) => ({ path: r.path, name: r.name, recent: r as RecentEntry | undefined }));
  const recoveredHere = open ? [] : p.recovered;
  const pickable = lab ? [] : [...recoveredHere.map((r) => `recovered:${r.id}`), ...recentDrawings.map((d) => `drawing:${d.path}`)];
  const picked = { recovered: recoveredHere.filter((r) => chosen.has(`recovered:${r.id}`)), drawings: recentDrawings.filter((d) => chosen.has(`drawing:${d.path}`)) };
  const pickedCount = picked.recovered.length + picked.drawings.length;
  const clearPicks = () => { if (chosen.size) setChosen(new Set()); };
  useEffect(() => setChosen(new Set()), [lib.open, lab]);
  const run = (from: string | undefined, to: string) => {
    const b = pickable.indexOf(to), a = from && pickable.includes(from) ? pickable.indexOf(from) : b;
    if (b >= 0) setChosen(new Set(pickable.slice(Math.min(a, b), Math.max(a, b) + 1)));
  };
  const selectAll = () => { if (!pickable.length) return; anchor.current = pickable[0]; setChosen(new Set(pickable)); };
  p.selectAll.current = selectAll;
  // A click on a drawing's tile: ⌘ or Shift picks (true); a plain click clears the selection and goes on to open it.
  const pickClick = (e: React.MouseEvent, key: string) => {
    if (e.shiftKey) { run(anchor.current, key); return true; }
    if (toggles(e)) {
      anchor.current = key;
      setChosen((x) => { const next = new Set(x); if (!next.delete(key)) next.add(key); return next; });
      return true;
    }
    anchor.current = key;
    clearPicks();
    return false;
  };
  // Delete, or Discard and Remove from Home in the menu: recovered drawings are discarded (Octet asks first), the rest
  // leave Home, or the open folder.
  const removePicked = (only?: "recovered" | "drawings") => {
    const recovered = only === "drawings" ? [] : picked.recovered, drawings = only === "recovered" ? [] : picked.drawings;
    if (!recovered.length && !drawings.length) return;
    const recents = drawings.flatMap((d) => (d.recent ? [d.recent] : []));
    if (!open && recovered.length) return p.onDiscard(recovered, recents); // the selection stays if the user cancels
    setChosen(new Set());
    if (open) return void lib.removeDrawing(open.id, drawings.map((d) => d.path));
    p.onRemove(recents);
  };
  // Home covers the editor, which takes no keys or clicks until Home goes.
  useModal(page, !p.leaving);
  // Quick start has the focus when Home opens, wherever its section is, without a scroll to it.
  useEffect(() => { page.current?.querySelector<HTMLElement>('[data-tile="new"]')?.focus({ preventScroll: true }); }, []);

  // One Tab stop for each section's tiles (roving): the tile last focused there, else its first. The arrow keys go to
  // the rest. The buttons under that tile follow it in the Tab order; the other tiles' buttons are not Tab stops (the
  // arrow keys reach their tiles, and a screen reader reaches them all).
  const roving = useRef<Record<string, string>>({});
  const rove = () => {
    for (const section of page.current?.querySelectorAll<HTMLElement>("[data-section]") ?? []) {
      const tiles = [...section.querySelectorAll<HTMLElement>("button.home-tile")], stop = tiles.find((t) => t.dataset.tile === roving.current[section.dataset.section!]) ?? tiles[0];
      for (const t of tiles) t.tabIndex = t === stop ? 0 : -1;
      for (const b of section.querySelectorAll<HTMLElement>(".home-act")) b.tabIndex = stop && b.closest(".home-slot") === stop.closest(".home-slot") ? 0 : -1;
    }
  };
  useLayoutEffect(rove);
  const focused = (e: React.FocusEvent) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".home-tile"), section = tile?.closest<HTMLElement>("[data-section]");
    if (!tile || !section) return;
    roving.current[section.dataset.section!] = tile.dataset.tile!;
    rove();
  };

  // Return starts Quick start (as decision 0003 asks) unless a tile or a button has the focus; arrow keys move between
  // tiles, up and down to the nearest tile in the row there (tileTo); down from a heading goes into its section.
  // Escape goes back from a project. A dialog over Home (Save changes) makes Home inert and keeps the keys.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (p.leaving || page.current?.inert || e.defaultPrevented || menu || deleting || picking) return;
      if (e.target instanceof HTMLInputElement) return;
      if (toggles(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") { e.preventDefault(); selectAll(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape" && chosen.size) { e.preventDefault(); setChosen(new Set()); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && pickedCount) { e.preventDefault(); removePicked(); return; }
      const tiles = [...(grid.current?.querySelectorAll<HTMLElement>("button.home-tile") ?? [])], at = tiles.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Enter" && at < 0 && !(document.activeElement instanceof HTMLButtonElement)) { e.preventDefault(); p.onNew(QUICK); return; }
      if (e.key === "Escape" && open) { e.preventDefault(); back(); return; }
      if (e.key === "Escape" && lab) { e.preventDefault(); closeLab(); return; }
      if (e.key === "Escape" && p.back) { e.preventDefault(); p.back.go(); return; }
      // In a tile's buttons: left and right go along them, up goes back to the tile.
      const act = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".home-act");
      if (act) {
        const row = [...act.parentElement!.querySelectorAll<HTMLElement>(".home-act")], k = row.indexOf(act);
        const to = e.key === "ArrowRight" ? row[k + 1] : e.key === "ArrowLeft" ? row[k - 1] : e.key === "ArrowUp" ? act.closest(".home-slot")?.querySelector<HTMLElement>(".home-tile") : undefined;
        if (e.key.startsWith("Arrow")) e.preventDefault();
        to?.focus();
        return;
      }
      const heading = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-heading]");
      if (heading) {
        if (e.key !== "ArrowDown") return;
        e.preventDefault();
        heading.closest("[data-section]")?.querySelector<HTMLElement>('button.home-tile[tabindex="0"]')?.focus();
        return;
      }
      const to = tileTo(e.key, at, tiles.map((t) => t.getBoundingClientRect()));
      if (to === undefined) return;
      e.preventDefault();
      tiles[to].focus();
      // Shift with an arrow key selects the run from the tile it started on.
      const from = tiles[at]?.dataset.tile, next = tiles[to].dataset.tile!;
      if (!e.shiftKey || !from || !pickable.includes(from) || !pickable.includes(next)) return;
      if (!chosen.has(anchor.current ?? "")) anchor.current = from;
      run(anchor.current, next);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  // Going back from a project focuses its tile, so the keyboard carries on from there.
  const back = () => {
    const id = lib.open;
    lib.setOpen(undefined);
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(`.home-tile[data-tile="project:${CSS.escape(id ?? "")}"]`)?.focus());
  };
  const openLab = () => {
    lib.setOpen(undefined);
    setLab(true);
    page.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(".home-search input")?.focus());
  };
  const closeLab = () => {
    setLab(false);
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>("[data-experiments]")?.focus());
  };
  const openProject = (id: string) => {
    lib.setOpen(id);
    page.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => page.current?.querySelector<HTMLElement>("[data-section='project'] .home-tile")?.focus());
  };

  // The tile under a point, tinted (or a folder opened) where a drop goes, as the template library tints a set
  // (data-over).
  const over = useRef<HTMLElement | null>(null);
  const mark = (el: HTMLElement | null) => {
    if (el === over.current) return;
    over.current?.removeAttribute("data-over");
    el?.setAttribute("data-over", "");
    over.current = el;
  };
  const projectAt = (x: number, y: number) => document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-project]") ?? null;
  // A drop taken: the folder (or the drawing's picture) gives a small settle.
  const settle = (tile: HTMLElement | null | undefined) => {
    const el = tile?.querySelector<HTMLElement>(".folder, .home-thumb");
    if (el && !reduced()) el.animate([{ transform: "none" }, { transform: "translateY(2px) scale(0.98)", offset: 0.35 }, { transform: "none" }], timing("--motion-slow"));
  };
  const targetOf = (el: HTMLElement | null | undefined): ThumbTarget | undefined => (el?.dataset.project ? { project: el.dataset.project } : el?.dataset.drawing ? { path: el.dataset.drawing } : undefined);
  // Files from Finder over the window (the app sends where the pointer is): the tile under them is marked, and the one
  // they are let go on is where they go (Editor's takeOpened reads it). Drawings go in a project; pictures alone can
  // go on any drawing or project, as its thumbnail.
  useEffect(() => {
    if (!p.drops) return;
    const scale = /Windows/.test(navigator.userAgent) ? devicePixelRatio : 1; // WebView2 gives device pixels
    type At = { payload: { position: { x: number; y: number }; paths?: string[] } };
    let pictures = false;
    const at = (e: At) => {
      const el = document.elementFromPoint(e.payload.position.x / scale, e.payload.position.y / scale);
      return el?.closest<HTMLElement>(pictures ? "[data-project], [data-drawing]" : "[data-project]") ?? null;
    };
    const offs = [
      listen("tauri://drag-enter", (e: At) => { pictures = !!e.payload.paths?.length && e.payload.paths.every((x) => PICTURE.test(x)); mark(at(e)); }),
      listen("tauri://drag-over", (e: At) => mark(at(e))),
      listen("tauri://drag-leave", () => mark(null)),
      listen("tauri://drag-drop", (e: At) => { const el = at(e); lib.dropTarget.current = targetOf(el); mark(null); settle(el); }),
    ];
    return () => { for (const off of offs) void off.then((f) => f()); };
  }, [p.drops]); // eslint-disable-line react-hooks/exhaustive-deps
  // A picture dropped on a tile in the UI-only preview (the browser's own drop; the app takes files as above): it
  // becomes the tile's thumbnail. Only the first 32 MB and a byte are read, so a larger file is refused unread.
  const pictureDrop = (target: ThumbTarget) => (p.drops ? {} : {
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (![...e.dataTransfer.items].some((i) => i.kind === "file" && i.type.startsWith("image/"))) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      mark(e.currentTarget.querySelector<HTMLElement>(".home-tile"));
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) mark(null); },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      const file = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/") || PICTURE.test(f.name)), tile = over.current;
      mark(null);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation(); // the tile takes it; the window's drop (Editor) would open it as a drawing
      settle(tile);
      void file.slice(0, MAX_INPUT + 1).arrayBuffer().then((b) => lib.pictureThumb(target, new Uint8Array(b)));
    },
  });

  // Home scrolls while a drag is near the window's top or bottom edge. Gives the function that stops it.
  const edgeScroll = (y: () => number, then?: () => void) => {
    let frame = 0;
    const step = () => {
      const el = page.current, edge = 56, at = y();
      if (el) el.scrollTop += at < edge ? -(edge - at) / 4 : at > innerHeight - edge ? (at - innerHeight + edge) / 4 : 0;
      then?.();
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  };

  // A drawing carried onto a project: press a tile and move; the folder under the pointer opens, and the drawing goes
  // in when it is let go there. Escape puts it back.
  const ghost = useRef<HTMLDivElement>(null), stray = useRef(false), pointer = useRef({ x: 0, y: 0 });
  const [carried, setCarried] = useState<{ name: string; picture?: TilePicture; count: number }>();
  const place = () => { if (ghost.current) ghost.current.style.transform = `translate(${pointer.current.x + 12}px, ${pointer.current.y + 12}px)`; };
  useLayoutEffect(place, [carried]); // the carried picture starts at the pointer
  const press = (e: React.PointerEvent, d: { path: string; name: string; picture?: TilePicture }) => {
    if (e.button !== 0 || open || !lib.store.projects.length) return;
    const x0 = e.clientX, y0 = e.clientY;
    let on = false, stop = () => {};
    const move = (ev: PointerEvent) => {
      pointer.current = { x: ev.clientX, y: ev.clientY };
      if (!on && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!on) { on = true; setCarried({ name: d.name, picture: d.picture, count: chosen.has(`drawing:${d.path}`) ? picked.drawings.length : 1 }); stop = edgeScroll(() => pointer.current.y); }
      place();
      mark(projectAt(ev.clientX, ev.clientY));
    };
    const end = (drop: boolean) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("keydown", escape, true);
      removeEventListener("blur", away);
      stop();
      const tile = over.current, target = tile?.dataset.project;
      mark(null);
      if (!on) return;
      stray.current = true; // the click that ends the drag does not open the drawing
      setTimeout(() => (stray.current = false));
      setCarried(undefined);
      const carry = chosen.has(`drawing:${d.path}`) ? picked.drawings : [d];
      if (drop && target) { settle(tile); setChosen(new Set()); void lib.add(target, carry.map((x) => ({ path: x.path, name: x.name }))); }
    };
    const up = () => end(true), away = () => end(false); // the window losing the focus puts it back too
    const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape" && on) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("keydown", escape, true);
    addEventListener("blur", away);
  };

  // ——— The sections as modules ———
  // While a section is dragged, the order it would drop in; the sections it passes slide out of its way.
  const [drag, setDrag] = useState<{ id: SectionId; order: SectionId[] }>();
  const [unfolded, setUnfolded] = useState<SectionId>(); // the section just opened, whose tiles fade in
  const layout: HomeLayout = { ...p.layout, order: drag?.order ?? p.layout.order };
  const isFolded = (id: SectionId) => layout.folded.includes(id);
  const sectionEls = () => [...(grid.current?.querySelectorAll<HTMLElement>("[data-section]") ?? [])];
  const sectionEl = (id: string) => grid.current?.querySelector<HTMLElement>(`[data-section="${id}"]`) ?? null;
  // The sections slide from where they were to where they are (FLIP): remember() before a change, then each moves from
  // its old place after the change. The section being dragged follows the pointer instead.
  const flip = useRef<Map<string, DOMRect>>(undefined), dragging = useRef<{ id: SectionId; grab: number; y: number; shift: number }>(undefined);
  const remember = () => { flip.current = new Map(sectionEls().map((el) => [el.dataset.section!, el.getBoundingClientRect()])); };
  const follow = () => {
    const d = dragging.current, el = d && sectionEl(d.id);
    if (!d || !el) return;
    d.shift = d.y - d.grab - (el.getBoundingClientRect().top - d.shift);
    el.style.transform = `translateY(${d.shift}px)`;
  };
  useLayoutEffect(() => {
    const before = flip.current;
    flip.current = undefined;
    follow();
    if (!before || reduced()) return;
    for (const el of sectionEls()) {
      const id = el.dataset.section!, was = before.get(id);
      if (!was || id === dragging.current?.id) continue;
      for (const a of el.getAnimations()) a.cancel();
      const now = el.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], timing("--motion"));
    }
  });
  const relayout = (next: Partial<HomeLayout>, focus?: SectionId) => {
    remember();
    p.onLayout({ ...p.layout, ...next });
    if (focus) requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-heading="${focus}"]`)?.focus({ preventScroll: true }));
  };
  const fold = (id: SectionId) => {
    const was = p.layout.folded.includes(id);
    setUnfolded(was ? id : undefined);
    relayout({ folded: was ? p.layout.folded.filter((s) => s !== id) : [...p.layout.folded, id] }, id);
  };
  // A press on a heading that moves 5 px becomes a drag of its section: it lifts and follows the pointer, and drops in
  // the place it is over when let go. Escape, or the window losing the focus, puts it back.
  const headingPress = (e: React.PointerEvent, id: SectionId) => {
    const el = sectionEl(id);
    if (e.button !== 0 || !el) return;
    const x0 = e.clientX, y0 = e.clientY, grab = y0 - el.getBoundingClientRect().top;
    let on = false, order = p.layout.order, stop = () => {};
    const step = () => {
      const d = dragging.current, view = grid.current;
      if (!d || !view) return;
      follow();
      const y = d.y - view.getBoundingClientRect().top, others = order.filter((s) => s !== id);
      const at = others.filter((s) => { const o = sectionEl(s); return !!o && o.offsetTop + o.offsetHeight / 2 < y; }).length;
      const next = [...others.slice(0, at), id, ...others.slice(at)];
      if (next.join() !== order.join()) { order = next; remember(); setDrag({ id, order }); }
    };
    const move = (ev: PointerEvent) => {
      if (!on && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      if (!on) { on = true; dragging.current = { id, grab, y: ev.clientY, shift: 0 }; setDrag({ id, order }); stop = edgeScroll(() => dragging.current?.y ?? 0, step); }
      dragging.current!.y = ev.clientY;
      step();
    };
    const end = (drop: boolean) => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("keydown", escape, true);
      removeEventListener("blur", away);
      stop();
      if (!on) return;
      stray.current = true; // the click that ends the drag does not fold the section
      setTimeout(() => (stray.current = false));
      remember(); // where the dragged section is now, so it settles into its place from there
      const s = sectionEl(id);
      if (s) s.style.transform = "";
      dragging.current = undefined;
      setDrag(undefined);
      if (drop && order.join() !== p.layout.order.join()) p.onLayout({ ...p.layout, order });
    };
    const up = () => end(true), away = () => end(false);
    const escape = (ev: KeyboardEvent) => { if (ev.key === "Escape" && on) { ev.preventDefault(); ev.stopPropagation(); end(false); } };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("keydown", escape, true);
    addEventListener("blur", away);
  };

  // Right-click menus: on the tile, or with the Menu key or Shift+F10 on a focused tile. The buttons under a tile open
  // a part of the same menu (only) under the button, so every option is on the page as well as in the menu.
  const menuProps = (f: () => Omit<MenuFor, "at" | "keyboard">) => ({
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ ...f(), ...menuAt(e) } as MenuFor); },
    onKeyDown: (e: React.KeyboardEvent) => { if (!menuKey(e)) return; e.preventDefault(); e.stopPropagation(); setMenu({ ...f(), ...menuAt(e) } as MenuFor); },
  });
  // A selected tile's menu is for every selected drawing; another tile's clears the selection.
  const tileMenu = (key: string, f: () => Omit<MenuFor, "at" | "keyboard">) => menuProps(() => {
    if (chosen.has(key) && pickedCount > 1) return { kind: "many" };
    if (!chosen.has(key)) clearPicks();
    return f();
  });
  const under = (e: React.MouseEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { at: { x: r.left, y: r.bottom + 4 }, keyboard: e.detail === 0 }; };
  const item = (key: string, name: string, icon: React.ReactNode, more?: boolean, checked?: boolean): MenuItem => ({ key, name, icon, more, checked });
  const swatch = (hex: string) => <span className="pick-swatch" style={{ background: hex }} />;
  // A drawing's folders: every folder in its colour (the one it is in ticked), then New folder…, and Remove from folder
  // when it is in one.
  const folderGroups = (path: string): MenuItem[][] => {
    const now = folderOf(lib.store, path);
    return [lib.store.projects.map((x) => item(`folder:${x.id}`, x.name, swatch(colourOf(x)), false, x.id === now?.id)),
      [item("folder:new", "New folder…", <FolderSimplePlus size={18} />), ...(now ? [item("out", "Remove from folder", <FolderSimpleMinus size={18} />)] : [])]].filter((g) => g.length);
  };
  const thumbGroups = (own: boolean): MenuItem[][] => [[item("thumb", "Choose picture…", <ImageSquare size={18} />), ...(own ? [item("auto", "Use automatic thumbnail", <ArrowCounterClockwise size={18} />)] : [])]];
  // A folder's colours: the document's colours, then the user's own, then Custom colour… (as the Actions panel's colour
  // row has them).
  const colourGroups = (id: string): MenuItem[][] => {
    const x = projectOf(lib.store, id), now = x ? colourOf(x) : PROJECT_COLOUR;
    const list = [...COLOURS, ...(p.palette ?? []).map((c): [string, string] => [c.name, c.hex])], known = list.some(([, hex]) => hex.toUpperCase() === now);
    return [
      [...list.map(([name, hex]) => item(`colour:${hex}`, name, swatch(hex), false, hex.toUpperCase() === now)), ...(known ? [] : [item(`colour:${now}`, "Custom", swatch(now), false, true)])],
      [item("colour:custom", "Custom colour…", <Palette size={18} />)],
    ];
  };
  const menuGroups = (m: MenuFor): MenuItem[][] => {
    if (m.kind === "drawing") {
      const own = !!lib.pictureFor(m.path)?.own, folder = folderOf(lib.store, m.path);
      if (m.only === "folder") return folderGroups(m.path);
      if (m.only === "thumb") return thumbGroups(own);
      return [
        [m.found ? item("open", "Open", <FolderOpen size={18} />) : item("locate", "Locate…", <MagnifyingGlass size={18} />)],
        [item("folder", folder ? "Move to folder" : "Add to folder", <FolderPlus size={18} />, true), item("thumb", "Change thumbnail…", <ImageSquare size={18} />),
          ...(own ? [item("auto", "Use automatic thumbnail", <ArrowCounterClockwise size={18} />)] : [])],
        [...(folder ? [item("out", "Remove from folder", <FolderSimpleMinus size={18} />)] : []), ...(m.recent ? [item("remove", "Remove from Home", <MinusCircle size={18} />)] : [])],
      ];
    }
    if (m.kind === "project") {
      const own = !!projectOf(lib.store, m.id)?.thumb;
      if (m.only === "colour") return colourGroups(m.id);
      if (m.only === "thumb") return thumbGroups(own);
      return [
        [item("open", "Open", <FolderOpen size={18} />), item("add-files", "Add drawings…", <FilePlus size={18} />)],
        [item("rename", "Rename", <PencilSimple size={18} />), item("colour", "Colour", <Palette size={18} />, true), item("thumb", "Change thumbnail…", <ImageSquare size={18} />),
          ...(own ? [item("auto", "Use automatic thumbnail", <ArrowCounterClockwise size={18} />)] : [])],
        [item("delete", "Delete folder…", <Trash size={18} />)],
      ];
    }
    if (m.kind === "section") {
      const at = layout.order.indexOf(m.id);
      return [
        [...(at > 0 ? [item("up", "Move up", <ArrowUp size={18} />)] : []), ...(at < layout.order.length - 1 ? [item("down", "Move down", <ArrowDown size={18} />)] : [])],
        [isFolded(m.id) ? item("fold", "Expand", <ArrowsOutLineVertical size={18} />) : item("fold", "Collapse", <ArrowsInLineVertical size={18} />)],
      ];
    }
    if (m.kind === "purpose") return [[item("new", "New drawing", <FilePlus size={18} />)], m.own ? [item("remove", "Remove template", <MinusCircle size={18} />)] : []];
    if (m.kind === "recovered") return [[item("open", "Open", <FolderOpen size={18} />)], [item("discard", "Discard", <Trash size={18} />)]];
    if (m.kind === "experiment") return [[item("open", "Open", <FolderOpen size={18} />)], [item("remove", "Remove from Experiments", <MinusCircle size={18} />)]];
    if (m.kind === "many") {
      const recents = picked.drawings.some((d) => d.recent);
      return [
        picked.drawings.length ? [item("folder", open ? "Move to folder" : "Add to folder", <FolderPlus size={18} />, true)] : [],
        [...(open ? [item("out", "Remove from folder", <FolderSimpleMinus size={18} />)] : []), ...(recents ? [item("remove", "Remove from Home", <MinusCircle size={18} />)] : []),
          ...(picked.recovered.length ? [item("discard", "Discard", <Trash size={18} />)] : [])],
      ];
    }
    return [[item("open", "Open", <FolderOpen size={18} />)]];
  };
  // The options an option with more opens: a drawing's folders, and a folder's colours.
  const sub = (key: string) => {
    if (key === "folder" && menu?.kind === "many") return { label: open ? "Move to folder" : "Add to folder", groups: [lib.store.projects.filter((x) => x.id !== open?.id).map((x) => item(`folder:${x.id}`, x.name, swatch(colourOf(x)))),
      [item("folder:new", "New folder…", <FolderSimplePlus size={18} />)]].filter((g) => g.length) };
    if (key === "folder" && menu?.kind === "drawing") return { label: folderOf(lib.store, menu.path) ? "Move to folder" : "Add to folder", groups: folderGroups(menu.path) };
    if (key === "colour" && menu?.kind === "project") return { label: "Colour", groups: colourGroups(menu.id) };
    return undefined;
  };
  const tileOf = (id: string) => page.current?.querySelector<HTMLElement>(`.home-tile[data-tile="project:${CSS.escape(id)}"]`) ?? page.current?.querySelector<HTMLElement>(".home-title-row") ?? null;
  // A drawing put in a folder from its tile: a small copy of its picture flies from the tile into the folder, which
  // settles as it takes it. A folder off screen, or reduced motion, takes it with no flight.
  const fly = (path: string, id: string) => {
    const from = page.current?.querySelector<HTMLElement>(`.home-tile[data-tile="drawing:${CSS.escape(path)}"] .home-thumb`);
    const tile = page.current?.querySelector<HTMLElement>(`.home-tile[data-tile="project:${CSS.escape(id)}"]`), to = tile?.querySelector<HTMLElement>(".folder");
    if (!to) return;
    const a = from?.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (!from || !a || reduced() || b.bottom < 0 || b.top > innerHeight) return settle(tile);
    const copy = from.cloneNode(true) as HTMLElement;
    copy.classList.add("home-fly");
    Object.assign(copy.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px` });
    document.body.append(copy);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height * 0.4 - (a.top + a.height / 2), s = (0.45 * b.width) / a.width;
    copy.animate([{ transform: "none", opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.4 }], { ...timing("--motion-slow"), fill: "forwards" })
      .finished.then(() => { copy.remove(); settle(tile); }, () => copy.remove());
  };
  const putIn = (id: string, d: { path: string; name: string }) => { const from = folderOf(lib.store, d.path)?.id; void lib.add(id, [d]).then((n) => { if (n && from !== id) fly(d.path, id); }); };
  const choose = (key: string) => {
    const m = menu;
    if (!m) return;
    if (m.kind === "drawing") {
      if (key === "open") return p.onRecent({ path: m.path });
      if (key === "locate") return lib.locate(m.path);
      if (key === "thumb") return void lib.chooseThumb({ path: m.path });
      if (key === "auto") return void lib.resetThumb({ path: m.path });
      if (key === "out") { const f = folderOf(lib.store, m.path); return void (f && lib.removeDrawing(f.id, [m.path])); }
      if (key === "remove" && m.recent) return p.onRemove([m.recent]);
      if (key === "folder:new") return startNaming([{ path: m.path, name: m.name }]);
      if (key.startsWith("folder:")) return putIn(key.slice(7), { path: m.path, name: m.name });
    }
    if (m.kind === "project") {
      if (key === "open") return openProject(m.id);
      if (key === "add-files") return lib.addPicked(m.id);
      if (key === "rename") return setNaming({ id: m.id, value: projectOf(lib.store, m.id)?.name ?? "" });
      if (key === "thumb") return void lib.chooseThumb({ project: m.id });
      if (key === "auto") return void lib.resetThumb({ project: m.id });
      if (key === "delete") return setDeleting(projectOf(lib.store, m.id));
      if (key === "colour:custom") {
        const x = projectOf(lib.store, m.id), tile = tileOf(m.id);
        if (x && tile) setPicking({ id: x.id, hex: colourOf(x), anchor: tile.getBoundingClientRect(), keep: tile });
        return;
      }
      if (key.startsWith("colour:")) return void lib.colour(m.id, key.slice(7));
    }
    if (m.kind === "section") {
      if (key === "fold") return fold(m.id);
      return relayout({ order: moveSection(p.layout.order, m.id, key === "up" ? -1 : 1, true) }, m.id);
    }
    if (m.kind === "purpose") return key === "new" ? p.onNew(m.id) : p.onRemovePurpose(m.id);
    if (m.kind === "recovered") return key === "open" ? p.onRecovered(m.entry) : p.onDiscard([m.entry]);
    if (m.kind === "many") {
      const list = picked.drawings.map((d) => ({ path: d.path, name: d.name }));
      if (key === "out" || key === "remove") return removePicked("drawings");
      if (key === "discard") return removePicked("recovered");
      setChosen(new Set());
      if (key === "folder:new") return startNaming(list);
      if (key.startsWith("folder:")) {
        const id = key.slice(7);
        return void lib.add(id, list).then((n) => { if (n) for (const d of list.slice(0, 8)) fly(d.path, id); });
      }
    }
    if (m.kind === "experiment") return key === "open" ? p.onRecent({ path: m.path }) : p.onRemoveExperiment(m.path);
    if (m.kind === "starter") return p.onStarter(m.text);
  };

  // A new folder's name, typed in its tile; Return or a click away makes it (Untitled folder when empty), Escape does
  // not. A folder being renamed takes the name the same way, in a field that grows from its name.
  const startNaming = (then?: { path: string; name?: string }[]) => {
    if (open) lib.setOpen(undefined);
    if (isFolded("projects")) relayout({ folded: p.layout.folded.filter((s) => s !== "projects") });
    setNaming({ value: "", then });
    requestAnimationFrame(() => page.current?.querySelector("[data-section='projects']")?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }));
  };
  const named = (keep: boolean) => {
    const it = naming;
    setNaming(undefined);
    const back = (id: string) => requestAnimationFrame(() => page.current?.querySelector<HTMLElement>(`.home-tile[data-tile="project:${CSS.escape(id)}"]`)?.focus());
    if (!it) return;
    if (it.id) { back(it.id); if (keep) void lib.rename(it.id, it.value); return; }
    if (keep) void lib.create(it.value || UNTITLED, it.then).then(back);
  };
  const nameField = (
    <input className="home-name-field" autoFocus aria-label="Folder name" placeholder={UNTITLED} spellCheck={false} maxLength={60} value={naming?.value ?? ""}
      onFocus={(e) => e.target.select()} onChange={(e) => setNaming((x) => x && { ...x, value: e.target.value })} onBlur={() => named(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); named(e.key === "Enter"); } }} />
  );

  // The buttons under a tile, always on show: a drawing's folder (Add to folder, or the folder it is in, in its colour)
  // and Change thumbnail; a folder's Thumbnail, Colour and Rename. Only the tile with its section's Tab stop has them in
  // the Tab order (rove), so Tab goes tile, its buttons, next section.
  const acts = (label: string, children: React.ReactNode) => <div className="home-acts" role="group" aria-label={label}>{children}</div>;
  const drawingActs = (d: { path: string; name: string; found: boolean; recent?: RecentEntry; project?: string }) => {
    const folder = folderOf(lib.store, d.path), own = !!lib.pictureFor(d.path)?.own;
    const pick = (only: "folder" | "thumb") => (e: React.MouseEvent<HTMLButtonElement>) => setMenu({ kind: "drawing", ...d, only, ...under(e) });
    return acts(`${d.name}: folder and thumbnail`, <>
      {folder ? (
        <button className="home-act in" aria-haspopup="menu" aria-label={`Move to folder. In ${folder.name}`} data-tip={`In ${folder.name}`} onClick={pick("folder")}
          style={{ "--dot": picking?.id === folder.id ? picking.hex : colourOf(folder) } as React.CSSProperties}>
          <span className="home-act-dot" aria-hidden /><span className="home-act-name">{folder.name}</span>
        </button>
      ) : <button className="home-act" aria-haspopup="menu" onClick={pick("folder")}>Add to folder</button>}
      <button className="home-act" aria-haspopup={own ? "menu" : undefined} onClick={own ? pick("thumb") : () => void lib.chooseThumb({ path: d.path })}>Change thumbnail</button>
    </>);
  };
  const folderActs = (x: Project) => {
    const pick = (only: "colour" | "thumb") => (e: React.MouseEvent<HTMLButtonElement>) => setMenu({ kind: "project", id: x.id, only, ...under(e) });
    return acts(`${x.name}: thumbnail, colour and name`, <>
      <button className="home-act" aria-haspopup={x.thumb ? "menu" : undefined} onClick={x.thumb ? pick("thumb") : () => void lib.chooseThumb({ project: x.id })}>Thumbnail</button>
      <button className="home-act" aria-haspopup="menu" onClick={pick("colour")} style={{ "--dot": picking?.id === x.id ? picking.hex : colourOf(x) } as React.CSSProperties}>
        <span className="home-act-dot" aria-hidden />Colour
      </button>
      <button className="home-act" onClick={() => setNaming({ id: x.id, value: x.name })}>Rename</button>
    </>);
  };

  // A drawing's tile, in Recent or in a folder. A drawing that was moved or deleted shows so, and Locate… finds it.
  const drawingTile = (d: { path: string; name: string; found: boolean; recent?: RecentEntry; project?: string; when: string }, k: number) => {
    const picture = lib.pictureFor(d.path), key = `drawing:${d.path}`;
    return (
      <div key={key} className={[d.found ? "home-slot" : "home-slot missing", chosen.has(key) && "chosen"].filter(Boolean).join(" ")} style={arrive(k)} {...pictureDrop({ path: d.path })}>
        <button className="home-tile" data-tile={key} data-drawing={d.path} data-tip={tilde(d.path, lib.home)} aria-describedby={chosen.has(key) ? "home-chosen" : undefined}
          onClick={(e) => { if (pickClick(e, key)) return; if (d.found) p.onRecent({ path: d.path }); else lib.locate(d.path); }}
          onPointerDown={(e) => press(e, { path: d.path, name: d.name, picture })} {...tileMenu(key, () => ({ kind: "drawing", path: d.path, name: d.name, found: d.found, recent: d.recent, project: d.project }))}>
          <DrawingPicture name={d.name} picture={picture} />
          <span className="home-caption">
            <span className="home-name">{d.name}</span>
            <span className="home-when">{d.found ? d.when : "Moved or deleted"}</span>
          </span>
        </button>
        {drawingActs(d)}
        {d.recent && <button className="home-remove" tabIndex={-1} onClick={() => p.onRemove([d.recent!])} aria-label={`Remove ${d.name} from Home`} data-tip="Remove from Home"><X size={12} /></button>}
      </div>
    );
  };
  const projectTile = (x: Project, k: number) => {
    const key = `project:${x.id}`, lost = x.drawings.filter((d) => lib.missing.has(d.path)).length;
    return (
      <div key={key} className="home-slot" style={arrive(k)} {...pictureDrop({ project: x.id })}>
        <button className="home-tile project" data-tile={key} data-project={x.id} onClick={() => openProject(x.id)} {...menuProps(() => ({ kind: "project", id: x.id }))}
          aria-label={`${x.name}, ${drawings(x.drawings.length)}`}>
          <Folder colour={picking?.id === x.id ? picking.hex : colourOf(x)} papers={x.drawings.slice(0, 3).map((d) => lib.pictureFor(d.path))} emboss={x.thumb && lib.urls[x.thumb]} />
          <span className="home-caption">
            {naming?.id === x.id ? <span className="home-name" /> : <span className="home-name">{x.name}</span>}
            <span className="home-when">{x.drawings.length ? drawings(x.drawings.length) : "No drawings"}{lost ? `, ${lost} missing` : ""}</span>
          </span>
        </button>
        {folderActs(x)}
        {naming?.id === x.id && <div className="home-naming">{nameField}</div>}
      </div>
    );
  };

  const recentTiles = !p.recents.length && !p.recovered.length ? STARTERS.map((s, k) => (
    <div key={s.name} className="home-slot" style={arrive(n + k)}>
      <button className="home-tile" data-tile={`starter:${s.name}`} onClick={() => p.onStarter(s.text)} {...menuProps(() => ({ kind: "starter", text: s.text, name: s.name }))}>
        <span className="home-thumb" data-theme="light"><img src={s.picture} alt="" draggable={false} /></span>
        <span className="home-caption">
          <span className="home-name">{s.name}</span>
          <span className="home-when">{s.kind}</span>
        </span>
      </button>
    </div>
  )) : [
    // Recovered drawings first, with a dashed frame as New's tiles have: their changes are not saved yet.
    ...p.recovered.map((r, k) => (
      <div key={r.id} className={chosen.has(`recovered:${r.id}`) ? "home-slot chosen" : "home-slot"} style={arrive(n + k)}>
        <button className="home-tile recovered" data-tile={`recovered:${r.id}`} aria-describedby={chosen.has(`recovered:${r.id}`) ? "home-chosen" : undefined}
          onClick={(e) => { if (!pickClick(e, `recovered:${r.id}`)) p.onRecovered(r); }} {...tileMenu(`recovered:${r.id}`, () => ({ kind: "recovered", entry: r }))}>
          <span className="home-thumb"><span className="home-initial" aria-hidden>{r.name.slice(0, 1).toUpperCase()}</span></span>
          <span className="home-caption">
            <span className="home-name">{r.name}</span>
            <span className="home-when">Recovered · {when(r.at, now)}</span>
          </span>
        </button>
        <button className="home-remove" tabIndex={-1} onClick={() => p.onDiscard([r])} aria-label={`Discard ${r.name}`} data-tip="Discard"><X size={12} /></button>
      </div>
    )),
    ...p.recents.map((r, k) => drawingTile({ path: r.path, name: r.name, found: r.found, recent: r, when: when(r.at, now) }, n + p.recovered.length + k)),
  ];

  // Each section's tiles.
  const bodies: Record<SectionId, () => React.ReactNode> = {
    new: () => (
      <div className="home-slot home-quick" style={arrive(0)}>
        <button className="home-tile new" data-tile="new" onClick={() => p.onNew(QUICK)} {...menuProps(() => ({ kind: "purpose", id: QUICK, name: "Quick start" }))}>
          <span className="home-thumb"><QuickPicture /></span>
          <span className="home-caption">
            <span className="home-name">Quick start</span>
            <kbd>{p.newKey}</kbd>
          </span>
        </button>
      </div>
    ),
    templates: () => (
      <div className="home-grid purposes">
        {p.purposes.map((t, k) => (
          <div key={t.id} className="home-slot" style={arrive(1 + k)}>
            <button className="home-tile new" data-tile={`purpose:${t.id}`} onClick={() => p.onNew(t.id)} {...menuProps(() => ({ kind: "purpose", id: t.id, name: t.name, own: t.own }))}>
              <span className="home-thumb"><PurposePicture style={t.style} kind={t.kind} /></span>
              <span className="home-caption"><span className="home-name">{t.name}</span></span>
            </button>
            {t.own && <button className="home-remove" tabIndex={-1} onClick={() => p.onRemovePurpose(t.id)} aria-label={`Remove ${t.name}`} data-tip="Remove template"><X size={12} /></button>}
          </div>
        ))}
        {p.onCustom && (
          <div className="home-slot" style={arrive(n - 1)}>
            <button className="home-tile new custom" data-tile="custom" onClick={p.onCustom}>
              <span className="home-thumb"><span className="custom-sheet" aria-hidden><Plus size={20} /></span></span>
              <span className="home-caption"><span className="home-name">Custom template</span></span>
            </button>
          </div>
        )}
      </div>
    ),
    recent: () => <div className="home-grid">{recentTiles}</div>,
    projects: () => (
      <div className="home-grid">
        {lib.store.projects.map((x, k) => projectTile(x, n + p.recents.length + k))}
        {naming && !naming.id ? (
          <div className="home-slot">
            <div className="home-tile project naming" aria-hidden>
              <Folder colour={PROJECT_COLOUR} papers={[]} />
              <span className="home-caption"><span className="home-name" /><span className="home-when">No drawings</span></span>
            </div>
            <div className="home-naming">{nameField}</div>
          </div>
        ) : (
          <div className="home-slot" style={arrive(n + p.recents.length + lib.store.projects.length)}>
            <button className="home-tile project new-project" data-tile="new-project" onClick={() => startNaming()}>
              <EmptyFolder />
              <span className="home-caption"><span className="home-name">New folder</span></span>
            </button>
          </div>
        )}
      </div>
    ),
  };
  const titleOf = (id: SectionId) => (id === "recent" && !p.recents.length && !p.recovered.length ? "Examples" : TITLES[id]);
  const section = (id: SectionId) => (
    <Section key={id} id={id} title={titleOf(id)}
      action={id === "recent" && (
        <span className="home-actions">
          {p.experiments.length > 0 && <button className="home-open" data-experiments onClick={openLab}><Flask size={16} aria-hidden />Experiments</button>}
          <button className="home-open" onClick={p.onOpen}><FolderOpen size={16} aria-hidden />Open…{p.openKey && <kbd>{p.openKey}</kbd>}</button>
        </span>
      )}
      heading={{ folded: isFolded(id), lifted: drag?.id === id, unfolding: unfolded === id,
        props: { onClick: () => fold(id), onPointerDown: (e) => headingPress(e, id), ...menuProps(() => ({ kind: "section", id, name: titleOf(id) })) } }}>
      {bodies[id]()}
    </Section>
  );
  // The drawings open in windows, first: a click brings the window to the front.
  const openWindows = !!p.windows?.length && (
    <Section id="windows" title="Open windows">
      <div className="home-grid">
        {p.windows.map((w, k) => (
          <div key={w.label} className="home-slot" style={arrive(k)}>
            <button className="home-tile" data-tile={`window:${w.label}`} data-tip={w.path ? tilde(w.path, lib.home) : undefined} onClick={() => p.onWindow(w)}>
              <DrawingPicture name={w.name} picture={w.picture ? { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(w.picture)}`, fill: false, own: false } : undefined} />
              <span className="home-caption">
                <span className="home-name">{w.name}</span>
                <span className="home-when">{w.edited ? "Edited" : w.path ? "Saved" : "New"}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
  const main = (
    <>
      <h1 className="home-greeting">{greeting(p.name, now, p.first, p.away)}</h1>
      {openWindows}
      {/* New and Templates side by side when they are next to each other, each its own section. */}
      {rowsOf(layout.order, layout.folded).map((row) => (row.length === 2
        ? <div key="band" className={row[0] === "new" ? "home-band" : "home-band flip"}>{row.map(section)}</div>
        : section(row[0])))}
    </>
  );

  // A project, open in Home's place: Home to go back, its name (its menu beside it), and its drawings. A drawing on the
  // recent list shows when it was last opened or saved; another, when it went in the project.
  const opened = (path: string, added: number) => {
    const recent = p.recents.find((r) => r.path === path);
    if (recent) return when(recent.at, now);
    const w = when(added, now);
    return `Added ${/^(Today|Yesterday)/.test(w) ? w[0].toLowerCase() + w.slice(1) : w}`;
  };
  const project = open && (
    <>
      <button className="home-back" onClick={back}><ArrowLeft size={16} aria-hidden />Home</button>
      <div className="home-title-row" {...menuProps(() => ({ kind: "project", id: open.id }))}>
        <h1 className="home-greeting home-project-name">{open.name}</h1>
        <button className="home-more" aria-label={`${open.name} options`} data-tip="Options" aria-haspopup="menu"
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ kind: "project", id: open.id, at: { x: r.left, y: r.bottom + 4 }, keyboard: e.detail === 0 }); }}><DotsThree size={20} /></button>
      </div>
      <Section id="project" title={open.drawings.length ? drawings(open.drawings.length) : "No drawings"} className="home-project">
        <div className="home-grid" data-project={open.id}>
          {open.drawings.map((d, k) => drawingTile({ path: d.path, name: d.name, found: !lib.missing.has(d.path), project: open.id, when: opened(d.path, d.added) }, k))}
          <div className="home-slot">
            <button className="home-tile new custom" data-tile="add-files" onClick={() => lib.addPicked(open.id)}>
              <span className="home-thumb"><span className="custom-sheet" aria-hidden><Plus size={20} /></span></span>
              <span className="home-caption"><span className="home-name">Add drawings…</span></span>
            </button>
          </div>
        </div>
      </Section>
    </>
  );

  // The Experiments list: a row for each experiment page, its title opening it. A click on Title or Date sorts by it,
  // and again turns the order round.
  const rows = lab ? experimentRows(p.experiments, search, sort) : [];
  const sortBy = (by: ExperimentSort["by"], name: string) => {
    const on = sort.by === by;
    return (
      <th aria-sort={on ? (sort.down ? "descending" : "ascending") : "none"}>
        <button className="home-sort" onClick={() => setSort({ by, down: on ? !sort.down : by === "date" })}>{name}{on && (sort.down ? <CaretDown size={12} aria-hidden /> : <CaretUp size={12} aria-hidden />)}</button>
      </th>
    );
  };
  const experimentList = lab && (
    <>
      <button className="home-back" onClick={closeLab}><ArrowLeft size={16} aria-hidden />Home</button>
      <div className="home-title-row"><h1 className="home-greeting home-project-name">Experiments</h1></div>
      <Section id="experiments" title={experimentCount(rows.length)} className="home-project" action={
        <span className="home-actions">
          <label className="library-search home-search">
            <MagnifyingGlass size={16} aria-hidden />
            <input type="search" aria-label="Search experiments" placeholder="Search" spellCheck={false} maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (search) setSearch(""); else closeLab(); } }} />
          </label>
          {rows.length > 0 && <button className="home-open" onClick={() => p.onExportExperiments(rows)}><Export size={16} aria-hidden />Export CSV…</button>}
        </span>
      }>
        {rows.length ? (
          <table className="home-table">
            <thead>
              <tr><th><span className="visually-hidden">Picture</span></th>{sortBy("title", "Title")}{sortBy("date", "Date")}<th>Project</th><th>Notebook</th><th className="num">Yield</th><th><span className="visually-hidden">Remove</span></th></tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const title = x.details.title ?? x.name, go = () => p.onRecent({ path: x.path });
                return (
                  <tr key={x.path} className={x.found ? undefined : "missing"} onClick={go} {...menuProps(() => ({ kind: "experiment", path: x.path, name: title }))}>
                    <td className="home-cell-picture"><DrawingPicture name={title} picture={lib.pictureFor(x.path)} /></td>
                    <td>
                      <button className="home-cell-open" data-tip={tilde(x.path, lib.home)} onClick={(e) => { e.stopPropagation(); go(); }}>{title}</button>
                      <span className="home-when">{x.found ? x.name : "Moved or deleted"}</span>
                    </td>
                    <td>{x.details.date}</td>
                    <td>{x.details.project}</td>
                    <td>{x.details.notebook}</td>
                    <td className="num">{formatAmount(x.yield, "yield")}</td>
                    <td><button className="home-remove home-cell-remove" aria-label={`Remove ${title} from Experiments`} data-tip="Remove from Experiments" onClick={(e) => { e.stopPropagation(); p.onRemoveExperiment(x.path); }}><X size={12} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="home-none">{p.experiments.length ? "Nothing matches" : "No experiments"}</p>}
      </Section>
    </>
  );

  const deleteName = deleting?.name;
  const menuLabel = (m: MenuFor) => (m.kind === "many" ? drawings(pickedCount) : m.kind === "project" ? (m.only === "colour" ? "Colour" : m.only === "thumb" ? "Thumbnail" : projectOf(lib.store, m.id)?.name ?? "Folder") : m.kind === "drawing" && m.only ? (m.only === "thumb" ? "Thumbnail" : "Folder") : "name" in m ? m.name : "entry" in m ? m.entry.name : "Drawing");
  return (
    <main ref={page} className={[p.leaving ? "home leaving" : "home", carried && "carrying", drag && "sorting"].filter(Boolean).join(" ")} aria-label="Home" inert={p.leaving}
      onFocus={focused} onClickCapture={(e) => { if (stray.current) { e.preventDefault(); e.stopPropagation(); } }}
      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, input, a, .home-slot")) clearPicks(); }}>
      <span id="home-chosen" className="visually-hidden">Selected</span>
      <div className="home-inner">
        {/* The lockup file as it is (brand/logos/README.md), so the wordmark's weight, size and gap match the logo. */}
        <header className="home-head">
          <picture>
            <source srcSet={lockupWhite} media="(prefers-color-scheme: dark)" />
            <img src={lockup} alt="Octet" height={96} draggable={false} />
          </picture>
          {p.back && <button className="home-back home-resume" data-tip={`Back to ${p.back.name}`} data-key={p.back.key} onClick={p.back.go}><ArrowLeft size={16} aria-hidden /><span>{p.back.name}</span></button>}
        </header>
        <div ref={grid} key={open ? `project:${open.id}` : lab ? "experiments" : "home"} className={["home-view", first && !open && !lab && "home-arrive"].filter(Boolean).join(" ")}>
          {project || experimentList || main}
        </div>
      </div>
      {carried && createPortal(
        <div ref={ghost} className="home-carry" aria-hidden>
          <DrawingPicture name={carried.name} picture={carried.picture} />
          {carried.count > 1 && <span className="home-carry-count">{carried.count}</span>}
        </div>, host())}
      {menu && <ContextMenu label={menuLabel(menu)} at={menu.at} keyboard={menu.keyboard} groups={menuGroups(menu).filter((g) => g.length)} sub={sub} onChoose={choose} onClose={() => setMenu(undefined)} />}
      <Exit>{picking && (
        <ColourPop anchor={picking.anchor} keep={picking.keep} label="Folder colour" value={picking.hex} onChange={(hex) => setPicking((x) => x && { ...x, hex })}
          onClose={() => { void lib.colour(picking.id, picking.hex); setPicking(undefined); }} />
      )}</Exit>
      <Exit>{deleting && (
        <Dialog title={`Delete “${deleteName}”?`} action="Delete" onClose={() => setDeleting(undefined)} onAction={() => { const id = deleting.id; setDeleting(undefined); void lib.remove(id); }}>
          <p className="dialog-note">The drawings stay where they are. Octet removes only the folder.</p>
        </Dialog>
      )}</Exit>
    </main>
  );
}

// First launch: the user's name, in the dotted frame Octet draws round a selected group. Return goes on; Skip or
// Escape goes on without a name.
export function NameBox({ onDone, leaving }: { onDone: (name: string) => void; leaving?: boolean }) {
  const [name, setName] = useState(""), page = useRef<HTMLElement>(null);
  useModal(page, !leaving);
  return (
    <main ref={page} className={leaving ? "home name-box leaving" : "home name-box"} aria-label="Welcome" inert={leaving}>
      <div className="name-box-inner">
        <Mark size={56} />
        <h1 className="name-title">Hey, what shall we call you?</h1>
        <label className="name-frame">
          <svg className="name-dots" aria-hidden><rect x="0.5" y="0.5" rx="10" /></svg>
          <input value={name} autoFocus maxLength={40} aria-label="Your name" placeholder="Your name" spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onDone(name.trim()); }
              if (e.key === "Escape") { e.preventDefault(); onDone(""); }
            }} />
        </label>
        <div className="name-actions">
          <button className="dialog-button primary" onClick={() => onDone(name.trim())} disabled={!name.trim()}>Continue</button>
          <button className="text-button" onClick={() => onDone("")}>Skip</button>
        </div>
      </div>
    </main>
  );
}
