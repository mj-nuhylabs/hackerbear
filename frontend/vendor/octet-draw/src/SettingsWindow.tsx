// Settings: one window, in the middle of the screen, laid out like the Mac's own settings. A sidebar lists the
// modules (General, Document, Keyboard shortcuts, Import and export) under a search field that is always there. With text
// in it, every matching setting from every module shows on the right, grouped by module and ready to use.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, BookOpenText, CaretDown, Check, FileText, Files, GearSix, Keyboard, MagnifyingGlass, PencilSimpleLine, Plus, Swatches, Warning, X } from "@phosphor-icons/react";
import { ColourPicker, ColourPop } from "./ColourPicker";
import { Dialog, useModal } from "./Dialog";
import { CURSOR_INKS, holdCursor, type CursorInk } from "./cursor";
import { Exit, useLeaving } from "./motion";
import { Select } from "./Select";
import { FontPick } from "./Actions";
import { listOpen } from "./Menu";
import { NumberField, Segmented, Switch } from "./Fields";
import { RULER_UNITS, type RulerUnit, type Swatch } from "./settings";
import { SELECT_DEFAULT } from "./selectcolour";
import { EXPORT_FORMATS, PICTURES, type ExportFormat } from "./export";
import { BACKDROPS, DpiField } from "./ExportDialog";
import { BACKGROUNDS, COLOURS, elementColours, FONTS, GRID_IN, GRID_MM, PAGE_NAMES, PAGES, PRESETS, PURPOSES, pageSize, pickPage, presetAt, presetOf, withScale, type DocStyle, type PageName } from "./docstyle";
import { ACTIONS, clashes, keyOf, keymap, label as keyLabel, type Keymap } from "./keys";
import { WARNING_TYPES, type WarningType } from "./check";

export type ModuleId = "general" | "document" | "drawing" | "keys" | "appearance" | "files" | "warnings" | "dictionary";
// How the drawing tools draw (ChemDraw's Object > Fixed Lengths and Fixed Angles, and its Building/Display setting),
// and ChemDraw's other preferences that change the drawing or what opening a file gives (settings.ts, CH-34).
export type DrawingPrefs = {
  fixedLengths: boolean; fixedAngles: boolean; sproutRings: boolean; clickTriple: boolean; pairBars: boolean;
  autoMap: boolean; stereoParens: boolean; hideAbs: boolean; mdlFlags: boolean; aromaticOnOpen: "" | "kekule" | "circles";
};
export type FilePrefs = {
  format: ExportFormat; dpi: number; background: "white" | "transparent" | "page"; margin: number; quality: number; // JPEG, 1 to 100
  clipboard: { pdf: boolean; cdx: boolean; cdxml: boolean; mol: boolean; smiles: boolean }; keepStyle: boolean;
  saveAs: "oct" | "cdxml" | "cdx"; // the format Save offers first for a new drawing (ChemDraw's Use Default File Format)
  quick: ExportFormat; // Quick export's picture format: PNG, or SVG for Office, PDF for LaTeX, and the others
};
const MAC = navigator.platform.startsWith("Mac");
// The picture Copy puts on the clipboard (Settings > Import and export > Copy).
const PICTURE = MAC ? "PDF, with the structure inside" : navigator.platform.startsWith("Linux") ? "PNG and SVG" : "EMF, with the structure inside";
// 600 dpi by default (Sam, 21 October 2026: PNGs at 350 dpi looked soft on slides).
export const DEFAULT_FILES: FilePrefs = { format: "pdf", dpi: 600, background: "transparent", margin: 4, quality: 95, clipboard: { pdf: true, cdx: true, cdxml: true, mol: true, smiles: true }, keepStyle: true, saveAs: "oct", quick: "png" };

type Props = {
  module: ModuleId;
  onModule: (m: ModuleId) => void;
  style: DocStyle;
  isDefault: boolean; // the style is already the default for new documents
  preview: React.ReactNode; // a sample structure drawn in the style, on the page's background (.style-preview)
  onStyle: (style: DocStyle) => void;
  onDefault: () => void;
  purposes: { id: string; name: string }[]; // the templates: Octet's purposes, then the user's own
  onPurpose: (id: string) => void; // the open drawing takes a template's sizes and page
  onSavePurpose?: (name: string) => void; // the style as a template of the user's own; unset when they have as many as Octet keeps
  template?: string; // the name of a template being made (Custom template on Home): the window shows its Document settings alone
  ownTemplates: { id: string; name: string }[]; // the user's own templates, to rename and remove here
  onRenameTemplate: (id: string, name: string) => void;
  onRemoveTemplate: (id: string) => void;
  onApplyFile?: () => void; // the open drawing takes another drawing's style (File > Apply Settings From File…)
  keys: Keymap; // the user's changes to the shortcuts
  onKeys: (keys: Keymap) => void;
  files: FilePrefs;
  onFiles: (files: FilePrefs) => void;
  drawing: DrawingPrefs;
  onDrawing: (patch: Partial<DrawingPrefs>) => void;
  captionOptionReturn: boolean; // captions: Option-Return for a new line, Return closes the box
  onCaptionOptionReturn: (on: boolean) => void;
  labelReturnNewLine: boolean; // atom labels: Return makes a new line (else Option-Return does, and Return closes the box)
  onLabelReturnNewLine: (on: boolean) => void;
  panelMenus: boolean; // the Actions panel's sets as menus, not sections
  onPanelMenus: (menus: boolean) => void;
  onlineSearch: boolean; // Search Reaxys and Search PubChem are offered (decision 0008)
  onOnlineSearch: (on: boolean) => void;
  rulerUnit: RulerUnit; // View > Show Rulers: the rulers' unit, for every drawing
  onRulerUnit: (unit: RulerUnit) => void;
  selectColour: string; // the selection's colour, #RRGGBB, in every window
  onSelectColour: (colour: string) => void;
  outlines: boolean; // Page edges: the other sizes' outlines show with the page's edge, for every drawing
  onOutlines: (on: boolean) => void;
  menuKeys: [string, string][]; // the menu commands that have a shortcut: name, shortcut as this platform shows it
  palette: Swatch[]; // the user's own colours
  onPalette: (palette: Swatch[]) => void;
  elementColours: Record<string, string>; // Colour by Element: the user's colour for an element, where it is not Octet's
  onElementColours: (colours: Record<string, string>) => void;
  // Chemical warnings: shown at all (View > Show Chemical Warnings), each kind on or off, and Check Structure on copy
  // and export.
  warnings: boolean;
  onWarnings: (on: boolean) => void;
  warningTypes: Partial<Record<WarningType, boolean>>;
  onWarningTypes: (types: Partial<Record<WarningType, boolean>>) => void;
  checkCopy: boolean;
  windows: boolean; onWindows: (on: boolean) => void;
  cursor: CursorInk; onCursor: (cursor: CursorInk) => void;
  onCheckCopy: (on: boolean) => void;
  adding?: boolean; // opened to add a colour: a new one is made, ready to set
  updates: boolean; // check for updates when Octet opens (decision 0010)
  onUpdates: (on: boolean) => void;
  onCheckUpdates: () => void;
  // The user's own dictionary (Add to dictionary): each name to change or remove here, and the whole list exported or
  // imported as a SMILES file.
  dictionary: { name: string; smiles: string }[];
  onRenameName: (from: string, to: string) => void;
  onRemoveName: (name: string) => void;
  onExportNames: () => void;
  onImportNames: () => void;
  onClose: () => void;
};

// The user's colours: each one's swatch, name and remove button; the one chosen opens Octet's picker under it.
// Add a colour makes a new one from the last colour picked and opens it. With no colours yet, Add a colour stands
// where the list goes.
function PaletteEditor({ palette, onPalette, adding }: { palette: Swatch[]; onPalette: (p: Swatch[]) => void; adding?: boolean }) {
  const [open, setOpen] = useState<number>();
  const add = () => {
    if (palette.length >= 20) return;
    onPalette([...palette, { name: `Colour ${palette.length + 1}`, hex: palette[palette.length - 1]?.hex ?? "#213C99" }]);
    setOpen(palette.length);
  };
  const started = useRef(false);
  useEffect(() => { if (adding && !started.current) { started.current = true; add(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (k: number, patch: Partial<Swatch>) => onPalette(palette.map((c, i) => (i === k ? { ...c, ...patch } : c)));
  return (
    <div className="palette-editor">
      {palette.map((c, k) => (
        <div key={k} className={open === k ? "palette-row open" : "palette-row"}>
          <div className="palette-line">
            <button className="swatch" style={{ background: c.hex }} aria-label={`Change ${c.name}`} aria-expanded={open === k} onClick={() => setOpen(open === k ? undefined : k)} />
            <input className="palette-name" aria-label="Name" value={c.name} maxLength={40} onChange={(e) => change(k, { name: e.target.value })} onBlur={(e) => { if (!e.target.value.trim()) change(k, { name: `Colour ${k + 1}` }); }} />
            <button className="text-button" aria-label={`Remove ${c.name}`} data-tip="Remove" onClick={() => { onPalette(palette.filter((_, i) => i !== k)); setOpen(undefined); }}><X size={12} /></button>
          </div>
          {open === k && <ColourPicker value={c.hex} onChange={(hex) => change(k, { hex })} />}
        </div>
      ))}
      {palette.length < 20 && <button className="palette-add" onClick={add}><Plus size={12} aria-hidden /> Add a colour</button>}
    </div>
  );
}

// Colour by Element: each element's colour, set with Octet's picker under it; Reset gives Octet's colour back.
// The elements Settings lists, with the colours Colour by Element gives them.
const LISTED = ["N", "O", "S", "P", "F", "Cl", "Br", "I", "B", "Si", "Se"];
function ElementColours({ colours, onColours }: { colours: Record<string, string>; onColours: (c: Record<string, string>) => void }) {
  const [open, setOpen] = useState<string>();
  const [by] = useState(() => elementColours());
  return (
    <div className="palette-editor">
      {LISTED.map((el) => [el, by[el]]).map(([el, base]) => {
        const hex = colours[el] ?? base;
        return (
          <div key={el} className={open === el ? "palette-row open" : "palette-row"}>
            <div className="palette-line">
              <button className="swatch" style={{ background: hex }} aria-label={`Change ${el}`} aria-expanded={open === el} onClick={() => setOpen(open === el ? undefined : el)} />
              <span className="palette-name">{el}</span>
              {colours[el] && <button className="text-button" aria-label={`Reset ${el}`} data-tip="Reset" onClick={() => { const { [el]: _, ...rest } = colours; onColours(rest); }}><ArrowCounterClockwise size={12} /></button>}
            </div>
            {open === el && <ColourPicker value={hex} onChange={(h) => onColours({ ...colours, [el]: h })} />}
          </div>
        );
      })}
    </div>
  );
}

// The user's own templates, by name: each one's name to change, and its remove button (as the user's colours).
function OwnTemplates({ list, onRename, onRemove }: { list: { id: string; name: string }[]; onRename: (id: string, name: string) => void; onRemove: (id: string) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  // A name is kept when it is not empty and not one of Octet's templates; otherwise the old name comes back.
  const keep = (id: string) => {
    const name = names[id]?.trim();
    if (name && !Object.values(PURPOSES).some((x) => x.name.toLowerCase() === name.toLowerCase())) onRename(id, name);
    setNames(({ [id]: _, ...rest }) => rest);
  };
  return (
    <div className="palette-editor">
      {list.map((p) => (
        <div key={p.id} className="palette-line">
          <input className="palette-name" aria-label="Name" value={names[p.id] ?? p.name} maxLength={40} spellCheck={false}
            onChange={(e) => setNames((n) => ({ ...n, [p.id]: e.target.value }))} onBlur={() => keep(p.id)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          <button className="text-button" aria-label={`Remove ${p.name}`} data-tip="Remove" onClick={() => onRemove(p.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

// The user's own dictionary: each name to change (it is kept when the field is left, if no other entry has it), its
// SMILES, and its remove button, as the user's colours and templates. With no names, how to add one.
function OwnDictionary({ list, onRename, onRemove }: { list: { name: string; smiles: string }[]; onRename: (from: string, to: string) => void; onRemove: (name: string) => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  const keep = (from: string) => {
    const to = names[from];
    if (to !== undefined) onRename(from, to);
    setNames(({ [from]: _, ...rest }) => rest);
  };
  if (!list.length) return <p className="dictionary-empty">To add a name, select a structure. Then right-click it and choose Add to dictionary.</p>;
  return (
    <div className="palette-editor dictionary-list">
      {list.map((n) => (
        <div key={n.name} className="palette-line">
          <input className="palette-name" aria-label="Name" value={names[n.name] ?? n.name} maxLength={80} spellCheck={false}
            onChange={(e) => setNames((x) => ({ ...x, [n.name]: e.target.value }))} onBlur={() => keep(n.name)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setNames(({ [n.name]: _, ...rest }) => rest); } }} />
          <span className="dictionary-smiles" data-tip={n.smiles}>{n.smiles}</span>
          <button className="text-button" aria-label={`Remove ${n.name}`} data-tip="Remove" onClick={() => onRemove(n.name)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

// ——— Fields ———

// A page drawn to scale inside a small box.
function PageThumb({ w, h, size = 26 }: { w: number; h: number; size?: number }) {
  const k = size / Math.max(w, h);
  return <span className="page-thumb" style={{ width: w * k, height: h * k }} aria-hidden />;
}
const fmt = (mm: number, unit: string) => (unit === "in" ? +(mm / 25.4).toFixed(2) : unit === "cm" ? +(mm / 10).toFixed(1) : Math.round(mm));

// Page size: a button that opens a panel next to it with every size drawn to scale, and your own size.
// The panel's corner can be dragged to make it bigger.
function PageSize({ style, change }: { style: DocStyle; change: (p: Partial<DocStyle>) => void }) {
  const [open, setOpen] = useState(false);
  const [unit, setUnit] = useState<"mm" | "cm" | "in">("mm");
  const [width, setWidth] = useState(440);
  const [place, setPlace] = useState<{ left: number; top: number; above: boolean }>();
  const button = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Opens below the button, or above it when there is no room below.
    const r = button.current!.getBoundingClientRect(), height = 400;
    const above = r.bottom + height > innerHeight - 8 && r.top - height > 8;
    setPlace({ left: Math.max(8, Math.min(r.left - 140, innerWidth - width - 8)), top: above ? r.top - 6 : r.bottom + 6, above });
    const away = (e: PointerEvent) => { if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); button.current?.focus(); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [w, h] = pageSize(style);
  const names = Object.keys(PAGES) as Exclude<PageName, "Custom">[];
  // Each option shows the page the way round the pick gives it (pickPage).
  const turned = (n: PageName) => pickPage(style, n).landscape;
  const custom = style.page === "Custom";
  const setCustom = (i: 0 | 1, v: number) => {
    const mm = unit === "in" ? v * 25.4 : unit === "cm" ? v * 10 : v, size = [...pageSize({ ...style, landscape: false })] as [number, number];
    size[style.landscape ? 1 - i : i] = Math.min(2000, Math.max(10, mm));
    change({ page: "Custom", custom: size });
  };
  return (
    <>
      <button ref={button} className="page-button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <PageThumb w={w} h={h} size={14} />
        <span>{PAGE_NAMES[style.page]}</span>
        <CaretDown size={12} aria-hidden />
      </button>
      <Exit>{open && place && (
        <div ref={menu} className={place.above ? "page-menu above" : "page-menu"} role="dialog" aria-label="Page size" style={{ left: place.left, top: place.top, width }}>
          <div className="page-options" role="radiogroup" aria-label="Page sizes">
            {names.map((n) => {
              const [pw, ph] = turned(n) ? [PAGES[n][1], PAGES[n][0]] : PAGES[n];
              return (
                <button key={n} role="radio" aria-checked={style.page === n} className="page-option" onClick={() => { change(pickPage(style, n)); setOpen(false); }}>
                  <span className="page-option-thumb"><PageThumb w={pw} h={ph} size={34} /></span>
                  <span className="page-option-name">{PAGE_NAMES[n]}</span>
                  <span className="page-option-size">{fmt(pw, unit)} × {fmt(ph, unit)} {unit}</span>
                </button>
              );
            })}
          </div>
          <div className={custom ? "page-custom chosen" : "page-custom"}>
            <span className="setting-label">Custom</span>
            <NumberField label="Width" unit={unit} value={fmt(w, unit)} onChange={(v) => setCustom(0, v)} />
            <span className="times">×</span>
            <NumberField label="Height" unit={unit} value={fmt(h, unit)} onChange={(v) => setCustom(1, v)} />
            <Segmented className="units" label="Units" value={unit} options={[["mm", "mm"], ["cm", "cm"], ["in", "in"]]} onChange={setUnit} />
          </div>
          <span
            className="grip"
            role="separator"
            aria-label="Drag to resize"
            data-tip="Drag to resize"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              holdCursor(e.currentTarget);
              const x0 = e.clientX, w0 = width;
              const move = (ev: PointerEvent) => setWidth(Math.min(innerWidth - 16, Math.max(360, w0 + ev.clientX - x0)));
              const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
              addEventListener("pointermove", move);
              addEventListener("pointerup", up);
            }}
          />
        </div>
      )}</Exit>
    </>
  );
}

// The page backgrounds, each a small page of itself, then a colour of the user's own (ChemDraw keeps a background
// colour in each document): its button opens the colour picker by it.
function Backgrounds({ value, onChange }: { value: DocStyle["background"]; onChange: (b: DocStyle["background"]) => void }) {
  const [open, setOpen] = useState<DOMRect>();
  const button = useRef<HTMLButtonElement>(null), own = value.startsWith("#") ? value : undefined;
  return (
    <span className="paper-choices" role="radiogroup" aria-label="Background">
      {BACKGROUNDS.map(([b, name]) => (
        <button key={b} role="radio" aria-checked={value === b} aria-label={name} data-tip={name} className={`paper-choice ${b}`} onClick={() => onChange(b)}>
          <span />
        </button>
      ))}
      <button ref={button} role="radio" aria-checked={!!own} aria-label="Custom colour" data-tip="Custom colour" aria-haspopup="dialog" aria-expanded={!!open} className="paper-choice own"
        onClick={() => { if (!own) onChange("#FFFFFF"); setOpen(open ? undefined : button.current!.getBoundingClientRect()); }}>
        <span style={own ? { background: own } : undefined}>{!own && <Plus size={12} aria-hidden />}</span>
      </button>
      <Exit>{open && <ColourPop anchor={open} keep={button.current} label="Background colour" value={own ?? "#FFFFFF"} onChange={(hex) => onChange(hex as DocStyle["background"])} onClose={() => setOpen(undefined)} />}</Exit>
    </span>
  );
}

// The selection's colour: Octet's blue, then a colour of the user's own, as the page backgrounds are chosen. Its button
// opens the colour picker by it; Default gives the blue back.
function SelectionColour({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState<DOMRect>();
  const button = useRef<HTMLButtonElement>(null), own = value !== SELECT_DEFAULT ? value : undefined;
  return (
    <span className="paper-choices" role="radiogroup" aria-label="Selection colour">
      <button role="radio" aria-checked={!own} aria-label="Default" data-tip="Default" className="paper-choice colour default" onClick={() => onChange(SELECT_DEFAULT)}>
        <span />
      </button>
      <button ref={button} role="radio" aria-checked={!!own} aria-label="Custom colour" data-tip="Custom colour" aria-haspopup="dialog" aria-expanded={!!open} className="paper-choice colour own"
        onClick={() => setOpen(open ? undefined : button.current!.getBoundingClientRect())}>
        <span style={own ? { background: own } : undefined}>{!own && <Plus size={12} aria-hidden />}</span>
      </button>
      <Exit>{open && <ColourPop anchor={open} keep={button.current} label="Selection colour" value={value} onChange={onChange} onClose={() => setOpen(undefined)} />}</Exit>
    </span>
  );
}

// ——— Settings as data, so search can find and show any of them ———

// head: the control goes in the section's head, beside its title, not in a row.
type Def = { module: ModuleId; section: string; label: string; keywords: string; control: React.ReactNode; wide?: boolean; head?: boolean };
const MODULES: { id: ModuleId; name: string; icon: React.ReactNode; words: string }[] = [
  { id: "general", name: "General", icon: <GearSix size={16} />, words: "general updates version check structure" },
  { id: "document", name: "Document", icon: <FileText size={16} />, words: "document style page text" },
  { id: "drawing", name: "Drawing", icon: <PencilSimpleLine size={16} />, words: "drawing tools bonds rings draw" },
  { id: "keys", name: "Keyboard shortcuts", icon: <Keyboard size={16} />, words: "keyboard shortcut hotkey keys" },
  // The Actions panel's one setting and the colours share a module, so no module holds a single setting.
  { id: "appearance", name: "Appearance", icon: <Swatches size={16} />, words: "appearance look actions panel side menus sections colour colours palette custom swatch named" },
  { id: "files", name: "Import and export", icon: <Files size={16} />, words: "import export file clipboard" },
  { id: "warnings", name: "Warnings", icon: <Warning size={16} />, words: "warnings chemical check structure errors problems" },
  { id: "dictionary", name: "Dictionary", icon: <BookOpenText size={16} />, words: "dictionary names name to structure own words abbreviations add structure" },
];
// The module saved last time, as a module that is there now (Actions panel and Colours became Appearance).
export const moduleOf = (id: string): ModuleId => (id === "panel" || id === "colours" ? "appearance" : MODULES.find((m) => m.id === id)?.id ?? "document");
// Words people use for the same thing.
const SYNONYMS: Record<string, string> = {
  color: "colour", thickness: "width", thick: "width", weight: "width", stroke: "width", hotkey: "shortcut", hotkeys: "shortcut",
  key: "shortcut", keys: "shortcut", keybinding: "shortcut", paper: "page", sheet: "page", typeface: "font", fonts: "font",
  gridlines: "grid", journal: "preset", template: "preset", image: "png", picture: "png", bitmap: "png", vector: "svg",
  word: "clipboard", powerpoint: "clipboard", keynote: "clipboard", office: "clipboard", paste: "clipboard", copy: "clipboard",
  resolution: "scale", dpi: "scale", transparency: "background", landscape: "orientation", portrait: "orientation",
  chemdraw: "cdxml", length: "length", spacing: "spacing", double: "spacing",
};
function matches(def: Def, query: string): boolean {
  const hay = `${def.label} ${def.section} ${MODULES.find((m) => m.id === def.module)!.words} ${def.keywords}`.toLowerCase();
  const words = hay.split(/[^a-z0-9.+]+/);
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((t) => {
    const w = SYNONYMS[t] ?? t;
    return words.some((h) => h.startsWith(w) || h.startsWith(t));
  });
}

function Row({ def }: { def: Def }) {
  return (
    <div className={def.wide ? "setting wide" : "setting"}>
      <span className="setting-label">{def.label}</span>
      <span className="setting-control">{def.control}</span>
    </div>
  );
}

// A section of rows, two to a line on a wide window.
function Section({ title, defs, aside }: { title: string; defs: Def[]; aside?: React.ReactNode }) {
  if (!defs.length) return null;
  const rows = defs.filter((d) => !d.head);
  return (
    <section className="settings-section">
      <div className="section-head"><h3>{title}</h3>{aside ?? defs.find((d) => d.head)?.control}</div>
      {rows.some((d) => !d.wide) && <div className="settings-grid">{rows.filter((d) => !d.wide).map((d) => <Row key={d.label} def={d} />)}</div>}
      {rows.filter((d) => d.wide).map((d) => <Row key={d.label} def={d} />)}
    </section>
  );
}

// ——— Keyboard shortcuts ———

// A shortcut's keys as chips: click one to record a new key, × to remove it, + to add one.
function KeyChips({ id, map, recording, onRecord, onRemove }: { id: string; map: Keymap; recording?: number; onRecord: (index: number) => void; onRemove: (index: number) => void }) {
  const keys = map[id] ?? [];
  return (
    <span className="key-chips">
      {keys.map((k, i) => (
        <span key={`${k}${i}`} className={recording === i ? "key-chip recording" : "key-chip"}>
          <button onClick={() => onRecord(i)} aria-label={`Change ${keyLabel(k)}`}>{recording === i ? "Press a key" : keyLabel(k)}</button>
          {recording !== i && <button className="key-remove" onClick={() => onRemove(i)} aria-label={`Remove ${keyLabel(k)}`}><X size={12} /></button>}
        </span>
      ))}
      {recording === keys.length
        ? <span className="key-chip recording"><button>Press a key</button></span>
        : <button className="key-add" onClick={() => onRecord(keys.length)} aria-label="Add a key" data-tip="Add a key"><Plus size={12} /></button>}
    </span>
  );
}

// ——— The window ———

export function SettingsWindow(p: Props) {
  const [query, setQuery] = useState("");
  // A modal window: Tab stays in it, and the focus goes back when it closes (Dialog.tsx).
  const search = useRef<HTMLInputElement>(null), backdrop = useRef<HTMLDivElement>(null), leaving = useLeaving();
  const top = useModal(backdrop, !leaving);
  const [recording, setRecording] = useState<{ id: string; index: number }>();
  const [note, setNote] = useState<{ id: string; text: string; undo: Keymap }>();
  const [naming, setNaming] = useState<string>(); // the name typed for a new template, while its dialog is open
  const main = useRef<HTMLDivElement>(null);
  const map = keymap(p.keys);
  const style = p.style;
  const change = (patch: Partial<DocStyle>) => { const next = { ...style, ...patch }; p.onStyle({ ...next, preset: presetOf(next) }); };

  // Escape: stops recording a key, then clears the search, then closes the window. ⌘F goes to the search.
  useEffect(() => {
    if (leaving) return;
    const key = (e: KeyboardEvent) => {
      if (!top()) return;
      if (naming !== undefined) return; // the new template's dialog has the keys
      if (recording) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Escape") return setRecording(undefined);
        const k = keyOf(e);
        if (!k) return;
        const list = [...(map[recording.id] ?? [])];
        list[recording.index] = k;
        const before = p.keys, next: Keymap = { ...p.keys, [recording.id]: [...new Set(list)] };
        // A key another action used in the same place moves to this one; the note can undo it.
        const taken = clashes(map, recording.id, k);
        for (const other of taken) next[other] = (map[other] ?? []).filter((x) => x !== k);
        p.onKeys(next);
        if (taken.length) setNote({ id: recording.id, text: `Taken from ${taken.map((t) => ACTIONS.find((a) => a.id === t)!.name.toLowerCase()).join(", ")}.`, undo: before });
        setRecording(undefined);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") { e.preventDefault(); search.current?.focus(); return; }
      if (e.key !== "Escape" || listOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (query) setQuery("");
      else p.onClose();
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [recording, query, map, p, leaving, naming]);
  // The search takes the focus; making a template, its first setting does (the template, in For).
  useEffect(() => {
    const body = main.current?.querySelector(".settings-body");
    (p.template ? body?.querySelector<HTMLElement>("[aria-checked='true']") ?? body?.querySelector<HTMLElement>("button, input") : search.current)?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const presets: [string, string][] = [...Object.keys(PRESETS).map((x): [string, string] => [x, x]), ...(style.preset === "Custom" ? [["Custom", "Custom"] as [string, string]] : [])];
  const files = p.files, setFiles = (patch: Partial<FilePrefs>) => p.onFiles({ ...files, ...patch });

  const defs: Def[] = useMemo(() => {
    const d = (module: ModuleId, section: string, label: string, keywords: string, control: React.ReactNode, wide?: boolean): Def => ({ module, section, label, keywords, control, wide });
    const num = (k: keyof DocStyle, label: string, unit: string, words: string, section = "Style") =>
      d("document", section, label, words, <NumberField label={label} unit={unit} value={style[k] as number} onChange={(n) => change({ [k]: n })} />);
    return [
      // What the drawing is for (IDEA-SIZE-8): a purpose sets the style, its scale and the page in one step.
      { ...d("document", "For", "For", "template for paper thesis slides poster experiment notebook talk presentation new size page", (
        <Segmented className="purposes" label="For" value={style.purpose ?? ""} options={p.purposes.map((x): [string, string] => [x.id, x.name])} onChange={p.onPurpose} />
      )), head: true },
      // One size for the whole style (decision 0007): every length and text size times it, the preset kept. 10% to 1000%.
      d("document", "Style", "Scale", "scale size bigger smaller poster slides percent proportion", (
        <NumberField label="Scale" unit="%" lazy step={1} value={Math.round(style.scale * 1000) / 10} onChange={(n) => p.onStyle(withScale(style, Math.min(10, Math.max(0.1, n / 100))))} />
      )),
      num("bond", "Bond length", "pt", "bond length fixed size"), num("line", "Line width", "pt", "line width bonds arrows"),
      num("bold", "Bold width", "pt", "bold width wedge"), num("spacing", "Bond spacing", "%", "double bond spacing gap"),
      num("hash", "Hash spacing", "pt", "hash hashed wedge spacing"), num("margin", "Margin", "pt", "label margin clearance"),
      d("document", "Style", "Atom labels", "atom label font typeface", <FontPick label="Atom label font" font={style.labelFont} fonts={FONTS} onPick={(v) => change({ labelFont: v })} className="select-field" />),
      num("labelSize", "Label size", "pt", "atom label font size"),
      d("document", "Style", "Label terminal carbons", "terminal carbon labels ch3 methyl show", <Switch on={style.terminalLabels} label="Label terminal carbons" onChange={(on) => change({ terminalLabels: on })} />),
      d("document", "Style", "Label every carbon", "non-terminal carbon labels all carbons show", <Switch on={style.carbonLabels} label="Label every carbon" onChange={(on) => change({ carbonLabels: on })} />),
      d("document", "Style", "Hide implicit hydrogens", "implicit hydrogens hide labels h", <Switch on={style.hideH} label="Hide implicit hydrogens" onChange={(on) => change({ hideH: on })} />),
      num("chainAngle", "Chain angle", "°", "chain angle zig-zag bond angle 120"),
      d("drawing", "Bonds", "Fixed lengths", "fixed length bond drag one bond length option", <Switch on={p.drawing.fixedLengths} label="Fixed lengths" onChange={(on) => p.onDrawing({ fixedLengths: on })} />),
      d("drawing", "Bonds", "Fixed angles", "fixed angle bond drag 15 degrees steps option", <Switch on={p.drawing.fixedAngles} label="Fixed angles" onChange={(on) => p.onDrawing({ fixedAngles: on })} />),
      d("drawing", "Symbols", "Lone pairs as bars", "lone pair pairs bar bars line lines dash dots electrons lewis structure", <Switch on={p.drawing.pairBars} label="Lone pairs as bars" onChange={(on) => p.onDrawing({ pairBars: on })} />),
      d("drawing", "Bonds", "Clicks make triple bonds", "click bond order triple double single cycle raise", <Switch on={p.drawing.clickTriple} label="Clicks make triple bonds" onChange={(on) => p.onDrawing({ clickTriple: on })} />),
      d("drawing", "Rings", "Sprout rings on a click", "ring tool click atom sprout spiro bond option", <Switch on={p.drawing.sproutRings} label="Sprout rings on a click" onChange={(on) => p.onDrawing({ sproutRings: on })} />),
      d("drawing", "Reactions", "Map the rest of a reaction", "automatic reaction mapping atom map tool auto map pair", <Switch on={p.drawing.autoMap} label="Map the rest of a reaction" onChange={(on) => p.onDrawing({ autoMap: on })} />),
      d("drawing", "Stereochemistry", "Parentheses round R and S", "include parentheses stereochemistry show stereo cip labels r s e z brackets", <Switch on={p.drawing.stereoParens} label="Parentheses round R and S" onChange={(on) => p.onDrawing({ stereoParens: on })} />),
      d("drawing", "Stereochemistry", "Hide abs flags", "hide absolute stereo flags enhanced stereochemistry abs", <Switch on={p.drawing.hideAbs} label="Hide abs flags" onChange={(on) => p.onDrawing({ hideAbs: on })} />),
      d("document", "Text", "Captions", "caption text font typeface", <FontPick label="Caption font" font={style.captionFont} fonts={FONTS} onPick={(v) => change({ captionFont: v })} className="select-field" />),
      num("captionSize", "Caption size", "pt", "caption text font size", "Text"),
      // ChemDraw's Interpret Chemically When Possible (Document Settings > Text Captions): captions that read as
      // chemistry (Rh, CH3OH) count in the formula, names and warnings, and bonds join them.
      d("document", "Text", "Interpret chemically", "interpret chemically when possible captions text chemistry formula mass analysis bonds valence", <Switch on={style.interpret} label="Interpret chemically" onChange={(on) => change({ interpret: on })} />),
      d("document", "Text", "Colour", "text colour caption", (
        <span className="swatches" role="radiogroup" aria-label="Text colour">
          {[...COLOURS, ...p.palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => (
            <button key={`${name}${hex}`} role="radio" aria-checked={style.colour.toLowerCase() === hex.toLowerCase()} aria-label={name} data-tip={name} className="swatch" style={{ background: hex }} onClick={() => change({ colour: hex })} />
          ))}
          {!p.template && <button className="swatch custom" data-tip="Add a colour" aria-label="Add a colour" onClick={() => p.onModule("appearance")}><Plus size={12} aria-hidden /></button>}
        </span>
      ), true),
      ...(p.ownTemplates.length && !p.template ? [d("document", "Your templates", "Your templates", "template templates purpose purposes named style styles stationery saved own rename remove",
        <OwnTemplates list={p.ownTemplates} onRename={p.onRenameTemplate} onRemove={p.onRemoveTemplate} />, true)] : []),
      d("document", "Page", "Size", "page paper size a4 a3 letter custom half column", <PageSize style={style} change={change} />),
      d("document", "Page", "Orientation", "page orientation portrait landscape", (
        <Segmented label="Orientation" value={style.landscape ? "landscape" : "portrait"} onChange={(v) => change({ landscape: v === "landscape" })}
          options={[["portrait", <span className="page-glyph" />, "Portrait"], ["landscape", <span className="page-glyph wide" />, "Landscape"]]} />
      )),
      // View > Show Grid shows the grid; here is its step. A US page offers inches; a step the page does not offer
      // (from another page, or a file) stays listed, so the list always shows what is set.
      d("document", "Page", "Grid spacing", "grid gridlines spacing step snap bond length mm inches", (
        <Select label="Grid spacing" value={String(style.grid)} onChange={(v) => change({ grid: v === "bond" ? "bond" : Number(v) })}
          options={[["bond", "Bond length"], ...[...new Set([...(["Letter", "Legal", "Tabloid", "ACS1", "ACS2"].includes(style.page) ? GRID_IN : GRID_MM), ...(style.grid === "bond" ? [] : [style.grid])])]
            .sort((a, b) => a - b).map((n): [string, string] => [String(n), GRID_IN.includes(n) ? `${["⅛", "¼", "½"][GRID_IN.indexOf(n)]} in` : `${n} mm`])]} />
      )),
      // Ruler units are Octet's, not the document's, so a template being made does not show them.
      ...(p.template ? [] : [d("document", "Page", "Ruler units", "ruler rulers units mm cm inches points picas measure", (
        <Select label="Ruler units" value={p.rulerUnit} options={RULER_UNITS} onChange={(v) => p.onRulerUnit(v as RulerUnit)} />
      ))]),
      // None is the drawing's (its page edges off). Page only hides the other sizes' outlines (journal columns, larger
      // pages) in every drawing, as ChemDraw's slide boundary guides are one setting for every document. A template being
      // made keeps its own switch, as Page only is Octet's.
      d("document", "Page", "Page edges", "page edges outline outlines guides columns sizes frame", p.template ? <Switch on={style.edges} label="Page edges" onChange={(on) => change({ edges: on })} /> : (
        <Select label="Page edges" value={!style.edges ? "none" : p.outlines ? "all" : "page"} options={[["all", "All sizes"], ["page", "Page only"], ["none", "None"]]}
          onChange={(v) => { if (v !== "none") p.onOutlines(v === "all"); if ((v !== "none") !== style.edges) change({ edges: v !== "none" }); }} />
      )),
      d("document", "Page", "Background", "background page colour custom dark mode night white system engineering paper blueprint blue grid", (
        <Backgrounds value={style.background} onChange={(background) => change({ background })} />
      )),
      d("appearance", "Actions panel", "Small actions", "actions panel small actions show as menus sections pop out buttons", (
        <Segmented label="Show small actions as" value={p.panelMenus ? "menus" : "sections"} onChange={(v) => p.onPanelMenus(v === "menus")} options={[["sections", "Sections"], ["menus", "Menus"]]} />
      )),
      // ChemDraw's text preference: in a caption Return makes a new line, unless Option-Return is asked for.
      d("keys", "Typing", "New line in captions", "caption text new line return enter option", (
        <Select label="New line in captions" value={p.captionOptionReturn ? "option" : "return"} options={[["return", "Return"], ["option", "⌥ Return"]]} onChange={(v) => p.onCaptionOptionReturn(v === "option")} />
      )),
      // The same for atom labels, where ChemDraw asks for Option-Return unless told otherwise.
      d("keys", "Typing", "New line in labels", "atom label text new line return enter option", (
        <Select label="New line in labels" value={p.labelReturnNewLine ? "return" : "option"} options={[["option", "⌥ Return"], ["return", "Return"]]} onChange={(v) => p.onLabelReturnNewLine(v === "return")} />
      )),
      // The menu commands' shortcuts, as the menus show them (fixed, as ChemDraw's), so a search finds them here too.
      ...p.menuKeys.map(([name, keys]) => d("keys", "Menu commands", name, `${name} menu command shortcut ${keys}`, <kbd className="menu-key">{keys}</kbd>)),
      ...ACTIONS.map((a) => d("keys", a.group, a.name, `${a.id} ${a.group} shortcut ${(map[a.id] ?? []).join(" ")}`, (
        <>
          <KeyChips id={a.id} map={map} recording={recording?.id === a.id ? recording.index : undefined}
            onRecord={(index) => { setNote(undefined); setRecording({ id: a.id, index }); }}
            onRemove={(index) => p.onKeys({ ...p.keys, [a.id]: (map[a.id] ?? []).filter((_, i) => i !== index) })} />
          {note?.id === a.id && <span className="key-note">{note.text} <button className="text-button" onClick={() => { p.onKeys(note.undo); setNote(undefined); }}>Undo</button></span>}
        </>
      ), true)),
      d("files", "Export", "Format", "export format pdf svg png emf eps tiff tif jpeg jpg gif metafile postscript cdxml cdx mol sdf rxn rdf v2000 v3000 smiles inchi file save", <Select label="Export format" value={files.format} options={EXPORT_FORMATS} onChange={(v) => setFiles({ format: v as FilePrefs["format"] })} />),
      d("files", "Export", "Quick export", "quick export format png svg pdf emf eps tiff jpeg gif latex office one click", <Select label="Quick export" value={files.quick} options={EXPORT_FORMATS.filter(([f]) => PICTURES.includes(f))} onChange={(v) => setFiles({ quick: v as FilePrefs["quick"] })} />),
      d("files", "Export", "Resolution", "png tiff jpeg gif image resolution dpi ppi scale pixels size", <DpiField value={files.dpi} onChange={(dpi) => setFiles({ dpi })} />),
      d("files", "Export", "Background", "background transparent white page colour color png tiff jpeg gif", <Select label="Background" value={files.background} options={BACKDROPS} onChange={(v) => setFiles({ background: v as FilePrefs["background"] })} />),
      d("files", "Export", "JPEG quality", "jpeg jpg quality compression", <NumberField label="JPEG quality" unit="%" min={1} max={100} step={5} value={files.quality} onChange={(n) => setFiles({ quality: Math.round(n) })} />),
      d("files", "Export", "Margin", "export margin padding border", <NumberField label="Margin" unit="pt" min={0} max={72} step={1} value={files.margin} onChange={(n) => setFiles({ margin: n })} />),
      // What Copy puts on the clipboard for other programs (Octet's own form always goes on). The picture is a PDF on
      // the Mac, a PNG on Windows, and a PNG and an SVG on Linux (src-tauri/src/clipboard.rs).
      ...([["pdf", PICTURE, "picture image pdf png svg word powerpoint keynote office"], ["cdx", "CDX", "cdx chemdraw binary"], ["cdxml", "CDXML", "cdxml chemdraw"], ["mol", "MOL", "mol molfile"], ["smiles", "SMILES", "smiles text"]] as const).map(([k, name, words]) =>
        d("files", "Copy", name, `clipboard copy paste ${words}`, <Switch on={files.clipboard[k]} label={name} onChange={(on) => setFiles({ clipboard: { ...files.clipboard, [k]: on } })} />)),
      d("general", "Windows", "Open each drawing in a new window", "windows multiple multi window tabs home new open drawing each own single", <Switch on={p.windows} label="Open each drawing in a new window" onChange={p.onWindows} />),
      d("general", "Cursor", "Colour", "cursor pointer mouse colour black white automatic crosshair i-beam visible contrast", <Segmented label="Cursor colour" value={p.cursor} options={CURSOR_INKS} onChange={p.onCursor} />),
      d("general", "Selection", "Colour", "selection selected highlight colour color tint marquee lasso handles frame blue custom default", (
        <SelectionColour value={p.selectColour} onChange={p.onSelectColour} />
      )),
      d("general", "Updates", "Check automatically", "updates update check automatically new version internet", <Switch on={p.updates} label="Check for updates automatically" onChange={p.onUpdates} />),
      d("appearance", "Colours", "Octet's colours", "colour colours palette swatch built in", (
        <span className="swatches" role="list" aria-label="Octet's colours">
          {COLOURS.map(([name, hex]) => <span key={hex} role="listitem" className="swatch" style={{ background: hex }} data-tip={name} aria-label={name} />)}
        </span>
      ), true),
      d("appearance", "Colours", "Your colours", "colour colours palette custom swatch named add", <PaletteEditor palette={p.palette} onPalette={p.onPalette} adding={p.adding} />, true),
      d("appearance", "Colours", "Colour by element", "colour by element atoms heteroatoms nitrogen oxygen sulfur periodic table", <ElementColours colours={p.elementColours} onColours={p.onElementColours} />, true),
      d("files", "Import", "Keep ChemDraw styles", "import open cdxml chemdraw style keep", <Switch on={files.keepStyle} label="Keep ChemDraw styles" onChange={(on) => setFiles({ keepStyle: on })} />),
      // ChemDraw's Show Stereoflags When Opening MDL Format Files and Normalize Aromatic Display.
      d("files", "Import", "Stereo flags from the chiral flag", "mdl molfile mol sdf rxn chiral flag stereo flags abs and enhanced stereochemistry import open", (
        <Switch on={p.drawing.mdlFlags} label="Stereo flags from the chiral flag" onChange={(on) => p.onDrawing({ mdlFlags: on })} />
      )),
      d("files", "Import", "Aromatic rings", "aromatic rings normalise normalize circles kekule alternating bonds import open", (
        <Select label="Aromatic rings" value={p.drawing.aromaticOnOpen} options={[["", "As in the file"], ["kekule", "Alternating bonds"], ["circles", "Circles"]]} onChange={(v) => p.onDrawing({ aromaticOnOpen: v as DrawingPrefs["aromaticOnOpen"] })} />
      )),
      d("files", "Save", "Save new drawings as", "save format default oct cdxml cdx chemdraw file", (
        <Select label="Save new drawings as" value={files.saveAs} options={[["oct", "Octet (.oct)"], ["cdxml", "ChemDraw XML (.cdxml)"], ["cdx", "ChemDraw (.cdx)"]]} onChange={(v) => setFiles({ saveAs: v as FilePrefs["saveAs"] })} />
      )),
      // ChemDraw's Warnings preferences: one switch for each kind. Its General preference to check on copy is in General.
      d("warnings", "Show", "Show chemical warnings", "chemical warnings marks show hide", <Switch on={p.warnings} label="Show chemical warnings" onChange={p.onWarnings} />),
      ...WARNING_TYPES.map((w) => d("warnings", "Kinds", w.name, `warning ${w.name} ${w.id}`, (
        <Switch on={p.warningTypes[w.id] ?? w.on} label={w.name} onChange={(on) => p.onWarningTypes({ ...p.warningTypes, [w.id]: on })} />
      ))),
      d("general", "Check Structure", "Check when copying or exporting", "check structure copy export clipboard warnings", <Switch on={p.checkCopy} label="Check when copying or exporting" onChange={p.onCheckCopy} />),
      // Off hides Search Reaxys and Search PubChem everywhere (decision 0008).
      d("files", "Online", "Online search", "online search reaxys pubchem internet web browser network privacy offline", <Switch on={p.onlineSearch} label="Online search" onChange={p.onOnlineSearch} />),
      // ChemDraw's Add Structure to Dictionary keeps names; here they are renamed, removed, exported and imported.
      d("dictionary", "Names", "Your names", "dictionary names name to structure own words abbreviations rename remove export import smiles", <OwnDictionary list={p.dictionary} onRename={p.onRenameName} onRemove={p.onRemoveName} />, true),
    ];
  }, [style, map, recording, note, files, p.palette, p.elementColours, p.adding, p.panelMenus, p.captionOptionReturn, p.labelReturnNewLine, p.onlineSearch, p.rulerUnit, p.selectColour, p.outlines, p.menuKeys.length, p.purposes, p.ownTemplates, p.drawing, p.template, p.updates, p.warnings, p.warningTypes, p.checkCopy, p.windows, p.cursor, p.dictionary]); // eslint-disable-line react-hooks/exhaustive-deps

  const found = query.trim() ? defs.filter((def) => matches(def, query) && (!p.template || def.module === "document")) : [];
  const counts = new Map(MODULES.map((m) => [m.id, found.filter((f) => f.module === m.id).length]));
  const sections = (module: ModuleId, list: Def[]) => [...new Set(list.filter((x) => x.module === module).map((x) => x.section))];

  const content = (module: ModuleId, list: Def[]) => {
    if (module === "document") return (
      <>
        {!query && p.preview}
        {sections(module, list).map((s) => (
          <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)}
            aside={s === "Style" ? <Select label="Style preset" value={style.preset} options={presets} onChange={(v) => v in PRESETS && p.onStyle({ ...style, ...presetAt(v, style.scale), preset: v })} /> : undefined} />
        ))}
        {!query && (
          <div className="settings-foot">
            {p.template ? <button className="dialog-button primary" onClick={p.onClose}>Done</button> : <>
              {p.onApplyFile && <button className="text-button" onClick={p.onApplyFile}>Apply settings from file…</button>}
              {p.onSavePurpose && <button className="text-button" onClick={() => setNaming("")}>Save as template…</button>}
              {p.isDefault
                ? <span className="quiet-note"><Check size={16} aria-hidden /> Default for new documents</span>
                : <button className="text-button" onClick={p.onDefault}>Use for new documents</button>}
            </>}
          </div>
        )}
      </>
    );
    if (module === "keys") return (
      <>
        {sections(module, list).map((s, i) => (
          <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)}
            aside={i === 0 && !query && <button className="text-button" onClick={() => p.onKeys({})} disabled={!Object.keys(p.keys).length}>Reset to ChemDraw keys</button>} />
        ))}
      </>
    );
    return <>{sections(module, list).map((s) => <Section key={s} title={s} defs={list.filter((x) => x.module === module && x.section === s)}
      aside={s === "Updates" ? <button className="text-button" onClick={p.onCheckUpdates}>Check Now</button> : s === "Names" && !query ? (
        <span className="section-buttons"><button className="text-button" onClick={p.onImportNames}>Import…</button><button className="text-button" onClick={p.onExportNames} disabled={!p.dictionary.length}>Export…</button></span>
      ) : undefined} />)}</>;
  };

  return (
    <div ref={backdrop} className={leaving ? "modal-backdrop leaving" : "modal-backdrop"} inert={leaving} onPointerDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className={p.template ? "settings-window template" : "settings-window"} role="dialog" aria-modal={!leaving} aria-label={p.template ?? "Settings"}>
        {!p.template && <nav className="settings-sidebar" aria-label="Settings modules">
          <label className="settings-search">
            <MagnifyingGlass size={16} aria-hidden />
            <input ref={search} type="search" placeholder="Search" aria-label="Search settings" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="search-clear" onClick={() => { setQuery(""); search.current?.focus(); }} aria-label="Clear search"><X size={12} /></button>}
          </label>
          {MODULES.map((m) => (
            <button key={m.id} className="module" aria-current={!query && p.module === m.id ? "page" : undefined}
              data-dim={query && !counts.get(m.id) ? "" : undefined}
              onClick={() => { setQuery(""); p.onModule(m.id); }}>
              {m.icon}
              <span>{m.name}</span>
              {query && counts.get(m.id) ? <span className="module-count">{counts.get(m.id)}</span> : null}
            </button>
          ))}
        </nav>}
        <div ref={main} className="settings-main">
          <header>
            <h2>{p.template ?? (query ? "Search" : MODULES.find((m) => m.id === p.module)!.name)}</h2>
            <button className="actions-close" onClick={p.onClose} aria-label="Close settings" data-tip="Close settings"><X size={12} /></button>
          </header>
          <div className="settings-body" key={query ? "search" : p.module}>
            {query
              ? found.length
                ? MODULES.filter((m) => counts.get(m.id)).map((m) => (
                  <div key={m.id} className="search-group">
                    <h4>{m.icon}{m.name}</h4>
                    {content(m.id, found)}
                  </div>
                ))
                : <p className="settings-empty">No settings match “{query}”.</p>
              : content(p.module, defs)}
          </div>
        </div>
      </div>
      <Exit>{naming !== undefined && (() => {
        // A name of the user's own: not empty, and not Quick start's or one of Octet's templates. The same name again
        // saves over it.
        const name = naming.trim(), ok = !!name && !["Quick start", ...Object.values(PURPOSES).map((x) => x.name)].some((t) => t.toLowerCase() === name.toLowerCase());
        return (
          <Dialog title="Save as template" action="Save" onClose={() => setNaming(undefined)} onAction={() => { if (ok) { p.onSavePurpose?.(name); setNaming(undefined); } }}>
            <label className="dialog-row"><span>Name</span><span className="unit-field text"><input aria-label="Name" value={naming} maxLength={40} spellCheck={false} onChange={(e) => setNaming(e.target.value)} /></span></label>
          </Dialog>
        );
      })()}</Exit>
    </div>
  );
}

