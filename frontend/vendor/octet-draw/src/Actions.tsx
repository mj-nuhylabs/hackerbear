// The Actions panel: a small dock in the bottom-right corner whose actions follow what is selected.
// It answers "what would I want to do next, here?" in order of weight: what the selection is (formula, mass),
// what is wrong with it (problems, each with a fix), then its actions, likeliest first. A long list keeps its first
// rows and folds the rest into small buttons that name themselves on hover. Every action also lives where
// ChemDraw users expect it (menus and keys).
import { useEffect, useId, useRef, useState } from "react";
import {
  AlignCenterHorizontal, AlignCenterVertical, Flask, Palette, Table, Repeat, ArrowsInSimple, ArrowsClockwise, ArrowsDownUp, CaretDown, CaretRight, ArrowsLeftRight, ArrowsHorizontal, ArrowsOutSimple, Atom, BookmarkSimple, BookOpenText, CaretUpDown, Graph,
  AlignBottomSimple, AlignTopSimple, ArrowLineDown, ArrowLineUp, CursorText, DotsThree, DotsThreeVertical, Faders, Polygon, Rectangle, ArrowArcLeft, ArrowArcRight, ArrowsCounterClockwise, ArrowUDownLeft, CircleDashed, CornersOut, MagnifyingGlass, Swap,
  ArrowUUpLeft, ClipboardText, CopySimple, IdentificationBadge, Key, Target, LineSegments, Minus, Plus, Stack, StackSimple, Eye, FileArrowDown, FlipHorizontal, FlipVertical, GearSix, House, LinkBreak, LinkSimple, ListNumbers, Hash, MagicWand, MinusCircle,
  PencilSimpleLine, PlusCircle, SelectionAll, SlidersHorizontal, SquareSplitHorizontal, TagSimple, TextAlignCenter, TextAlignLeft,
  TextAlignJustify, TextAlignRight, Tag, TextB, TextItalic, TextUnderline, Trash, Warning, X, Plus as PlusIcon, Rows, RowsPlusBottom, RowsPlusTop, Columns, ColumnsPlusRight, ColumnsPlusLeft, ArrowsInLineHorizontal, Backspace, Broom, CirclesThree, FlowArrow, Subtitles, Textbox, WarningCircle, WaveSine, Circle, TextSubscript, TextSuperscript, Cube, Square, BoundingBox, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom, ArrowsOutLineHorizontal, ArrowsOutLineVertical, BezierCurve, LineSegment, ArrowsMerge, ArrowsInCardinal, Crosshair, FadersHorizontal, Copy, ListDashes, Percent,
  EyeSlash, Angle, Resize, Unite, SelectionPlus, Paragraph, Checkerboard, CubeTransparent, CircleHalf, ClockCounterClockwise, Shuffle, ArrowBendDownRight, Path, Scissors, CircleNotch,
  Question, EyeClosed, BellSlash, ArrowsInLineVertical, BracketsRound, TreeStructure, Asterisk, AsteriskSimple, BracketsSquare, SquaresFour, StarFour, TextTSlash,
} from "@phosphor-icons/react";
import type { Analysis } from "./chem";
import type { Problem } from "./check";
import { GENERICS, massText, queryLabel } from "./query";
import { ContextMenu, Menu, Pick, type MenuItem } from "./Menu";
import { setItems } from "./TemplateLibrary";
import { ColourPop } from "./ColourPicker";
import { Exit, reduced, timing } from "./motion";
import { NumberField } from "./Fields";
import { ARROW_KINDS, arrowKind, arrowPicks, curved, isBracket, isLine, ORBITAL_SHAPES, PHASES, TABLE_LINES, type ArrowPick, type ArrowSize, type CurveFill, type LineStyle, type TableLine, type ArrowKind, type Head, type HeadShape, type OrbitalShape, type Phase, type ShapeKind } from "./render";
import { BracketGlyph, ElementGlyph, OrbitalGlyph, orbitalName, shapeName, FillGlyph, LineGlyph } from "./elements";
import { invoke } from "@tauri-apps/api/core";
import { COLOURS, fontStack, HIGHLIGHT_COLOURS, RING_FILLS, roundPt, TINTS } from "./docstyle";
import { ArrowGlyph, arrowName, ARROWS, BondGlyph, BONDS, RingGlyph, ShapeGlyph, SHAPES, SideGlyph, STRAIGHT, TlcGlyph, withSize, type BondKind } from "./tools";

// Each pick's choices (arrowPicks lists them) drawn as themselves, for the Actions panel and the right-click menu alike.
const choices = (p: ArrowPick, c: Context) => p.options.map(([id, name]) => ({ id, name, glyph: pickGlyph(p, id, c) }));
function pickGlyph(p: ArrowPick, id: string, c: Context): React.ReactNode {
  const arrow = c.kind === "arrow" ? c.arrow : undefined;
  switch (p.command) {
    case "arrow.style": return <LineGlyph style={id as LineStyle} />;
    case "arrow.start": case "cycle.side.start": return <LineGlyph start={id as Head} head={p.head} />;
    case "arrow.end": case "cycle.side.end": return <LineGlyph end={id as Head} head={p.head} />;
    case "arrow.head": case "cycle.head": return <LineGlyph end={arrow === "equilibrium" ? "left" : "full"} head={id as HeadShape} />;
    case "arrow.sweep": return arrow === "arc" ? <ElementGlyph v={`arc-${id}`} /> : <ArrowGlyph kind={`${arrow && curved({ kind: arrow }) ? arrow : "curved"}-${id}`} />;
    case "arrow.size": case "cycle.size": return <ArrowGlyph kind={id === "own" ? "reaction" : withSize(arrow === "block" ? "block" : "reaction", id as ArrowSize)} />;
    case "arrow.fill": return <FillGlyph fill={id as CurveFill} />;
    case "cycle.side.ends": return <SideGlyph ends={id as CycleSide["ends"]} />;
    default: return id === "back" ? <span className="pick-turned"><ArrowGlyph kind="unbalanced" /></span> : <ArrowGlyph kind={id === "equal" ? "equilibrium" : "unbalanced"} />; // a step's balance
  }
}
// The arrow kinds, as the kind chips and the right-click menu's Kind list them.
const kindChoices = (c: Context) => [...STRAIGHT, ...ARROW_KINDS.filter((k) => curved({ kind: k }))].map((id) => ({
  id, name: arrowName(id) ?? ARROWS[id as ArrowKind], glyph: <ArrowGlyph kind={curved({ kind: id as ArrowKind }) ? `${id}-${(c.kind === "arrow" && c.sweep) || 120}` : id} /> }));
// An atom label's alignments, as ChemDraw's Text menu sets them on a label: the Actions panel's label chips and the
// Alignment menu on a label's right-click menu list the same ones.
const labelAligns = (size: number) => [["left", "Flush left", <TextAlignLeft size={size} />], ["centre", "Centred", <TextAlignCenter size={size} />],
  ["right", "Flush right", <TextAlignRight size={size} />], ["above", "Stacked above", <ArrowLineUp size={size} />], ["auto", "Automatic", <span className="glyph-text">A</span>]] as const;
// A selected atom label's text style (the first labelled atom's, for a structure), for the label style buttons.
export type LabelText = { bold: boolean; italic: boolean; underline: boolean; font: string; size: number; align?: string; chemical?: boolean }; // align and chemical: an atom label's
// A cycle's side arrow: the ends it has, inside the circle (undefined: all its ends are structures), moved from where
// Octet puts it, and its heads.
export type CycleSide = { ends: "both" | "in" | "out"; inside?: boolean; moved: boolean; start: Head; end: Head; head: HeadShape; size: string };
export type Context =
  | { kind: "empty" }
  | { kind: "drawing"; nameable: boolean; generic?: boolean }
  // Different kinds of thing picked together: count things; atoms, when structures are among them.
  // A group selected whole counts as one object. name: a lone whole group's name ("¹H NMR spectrum", "Group").
  | { kind: "selection"; count: number; name?: string; atoms: boolean; width?: number; joinable?: boolean } // width: lines picked together (no structures or text); joinable: Join applies (atoms or bonds in two structures)
  | { kind: "structure"; text?: LabelText; atoms: number; structures: number; next: string; nameable: boolean; joinable?: boolean; pairs?: "shown" | "hidden"; stereo?: "absolute" | "racemic" | "relative" | "mixed"; depth?: boolean; cip?: boolean; numbers?: boolean; roman?: boolean; circles?: boolean; halo?: string; fill?: string; hydrogens?: boolean; properties?: boolean; generic?: boolean }
  // mode: picked captions, the text being typed, or the style the next text starts with (Text tool in hand).
  | { kind: "caption"; mode: "picked" | "typing" | "next"; convertible: boolean; count: number; colour: string; bold: boolean; italic: boolean; underline: boolean; size: number; align: "left" | "centre" | "right" | "justify"; attached: boolean; attachable: boolean;
      // labelable: Octet can read a picked caption as an atom label (Make element). chemical: their Interpret chemically,
      // shown when the document's is on and one of them reads as chemistry.
      script?: "sub" | "super"; font?: string; fonts?: string[]; labelable?: boolean; chemical?: boolean;
      // cycleSide: one picked caption that labels a cycle's side arrow (CycleSide). cycleName: one picked caption that is
      // a step's name, moved from where Octet puts it.
      cycleSide?: CycleSide; cycleName?: { moved: boolean } }
  // size: the heads' palette size ("own" for a size set by hand), when the arrows have heads. ratio: an equilibrium's.
  // fillable: closed curves and block arrows, which take a fill.
  | { kind: "arrow"; count: number; arrow: ArrowKind; curved: boolean; sweep?: number; style: string; orbital?: { shape: OrbitalShape; phase: Phase };
      heads: boolean; shaped: boolean; start: Head; end: Head; head: HeadShape; closed?: boolean; fill: string; width: number; size?: string; ratio: number; fillable: boolean;
      point?: "add" | "remove" | "bent" } // one straight arrow or line: it can take a point, or has one (bent: and bends)
  | { kind: "shape"; count: number; shape: ShapeKind; dashed: boolean; boldLine: boolean; colour: string; style: string; side: string; mark: string; rf: boolean; lines: TableLine[]; cellAlign?: string; weight: number; cell: boolean; hide?: string[];
      shade: { depth: number; blur: number; opacity: number; pt: number }; text?: LabelText;
      ticks?: boolean; transparent?: boolean; lane?: boolean; rgroup?: boolean } // a TLC plate's side ticks and transparency, and whether a lane is picked
  // step: one step of the cycle is picked; reversible, balance, shaped and hidden are that step's (shaped: it has a lead,
  // trail, bow or balance to reset; hidden: its arc is not drawn). arcs: some step's arc is hidden. side: one of its side
  // arrows is picked.
  | { kind: "cycle"; clockwise: boolean; steps: number; centre: boolean; width: number; gap: number; step: boolean; reversible: boolean; balance: "equal" | "forward" | "back"; shaped: boolean; hidden: boolean; arcs: boolean; named: boolean; side?: CycleSide; head: HeadShape; size: string }
  | { kind: "reaction"; steps: number; structures: number; clean: boolean; mapped: boolean; grid: boolean; roman?: boolean }
  // A stoichiometry grid's cell picked: its column a product or a reactant (the limiting one or not), and whether any
  // of the grid's rows or columns are hidden.
  | { kind: "grid"; product: boolean; limiting: boolean; hidden: boolean; rows: boolean }
  // groups: the and and or group numbers its structure uses, and the lowest new one of each.
  | { kind: "atom"; text?: LabelText; label: string; charge: number; terminal: boolean; carbon: boolean; centre: boolean; enhanced?: string; groups?: { and: number[]; or: number[] }; halo?: string; fill?: string; numbered?: boolean; repeat?: string }
  | { kind: "bond"; style: BondKind | undefined; double: boolean; flippable: boolean; halo?: string; fill?: string; ring?: boolean }
  | { kind: "spot"; style: "filled" | "hollow" | "shaded"; dashed: boolean; bold: boolean; doubled: boolean; w: number; h: number; tail: number; rf: boolean; pt: number };

type Props = {
  open: boolean;
  context: Context;
  analysis?: Analysis;
  problems: Problem[];
  fonts: string[]; // Octet's fonts, then the other fonts the drawing uses
  hiddenWarnings?: boolean; // a selected atom or bond has its warnings hidden
  warned?: number; // how many warnings are marked on the selection
  messy: boolean;
  hint: (command: string) => string | undefined; // the key for a command, if it has one
  onOpen: (open: boolean) => void;
  run: (command: string) => void;
  // The user's arrangement for each kind of selection: the order of actions and how many show as rows.
  layout: Record<string, { order: string[]; rows: number }>;
  onLayout: (kind: string, layout: { order: string[]; rows: number }) => void;
  colour?: { value: string; tints?: boolean }; // the selection's colour, shown in the one colour row every selection gets
  palette: { name: string; hex: string }[]; // the user's own colours, after Octet's
  grouping?: { grouped: boolean; integral: boolean; group: boolean }; // a group touched (Ungroup), two or more things that can be grouped (Group)
  menus?: boolean; // Settings > Actions panel: each set of small actions as a titled row that opens its menu
  sizes: number[]; // the text sizes on offer: ChemDraw's, times the document scale
  scale?: number | null; // the selection's scale against the document (decision 0007); null when its parts differ
  online?: boolean; // Settings > Online search: Search Reaxys and Search PubChem are offered
  folded: string[]; // the titled sections folded to their title, by set
  onFold: (id: string, folded: boolean) => void;
};

const ELEMENTS = ["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"];
const STYLES: BondKind[] = ["single", "double", "triple", "quadruple", "bolddouble", "dasheddouble", "aromaticdouble", "eitherdouble", "wedge", "hashwedge", "hollow", "bold", "hashed", "dashed", "wavy", "dative", "hydrogen"];
// On a chain end: the groups chemists put there most. Values are what the atom becomes.
const ENDS = [["OH", "O"], ["NH₂", "N"], ["Me", "Me"], ["OMe", "OMe"], ["CO₂H", "CO2H"], ["CF₃", "CF3"], ["CN", "CN"], ["Ph", "Ph"]];

// Digits in a formula as subscripts: C8H9NO2 → C₈H₉NO₂.
const SUBSCRIPT = "₀₁₂₃₄₅₆₇₈₉";
const formula = (f: string) => f.replace(/\d/g, (d) => SUBSCRIPT[Number(d)]);

// A setting with a few choices, as one small button showing the current choice: a click opens its choices (a Pick
// list), each drawn as itself with its name. onCustom adds Custom colour…, which opens the colour picker by the button
// (each change of it is passed on as it is made).
function PickButton({ label, value, options, onPick, onCustom }: { label: string; value: string; options: { id: string; name: string; glyph: React.ReactNode }[]; onPick: (id: string) => void; onCustom?: (hex: string) => void }) {
  const current = options.find((o) => o.id === value) ?? options[0], [custom, setCustom] = useState<DOMRect>(), box = useRef<HTMLDivElement>(null);
  return (
    <div className="pick" ref={box}>
      <Pick label={label} value={value} groups={[options.map((o) => ({ key: o.id, name: o.name, icon: <span className="pick-glyph" aria-hidden>{o.glyph}</span> })), ...(onCustom ? [[{ key: "\u0000custom", name: "Custom colour…", icon: <Palette size={16} /> }]] : [])]}
        onPick={(k) => (k === "\u0000custom" ? setCustom(box.current!.getBoundingClientRect()) : onPick(k))} className="chip pick-button" title={`${label}: ${current.name}`}>
        <span className="pick-label" aria-hidden>{label}</span>
        {current.glyph}
      </Pick>
      <Exit>{custom && onCustom && <ColourPop anchor={custom} label={`${label} colour`} value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#3F6BFF"} onChange={onCustom} onClose={() => setCustom(undefined)} />}</Exit>
    </div>
  );
}

// The computer's fonts, asked for once (the app lists them; a browser cannot).
const TAURI = "__TAURI_INTERNALS__" in window;
let installed: Promise<string[]> | undefined;
const systemFonts = () => (installed ??= invoke<string[]>("system_fonts").catch(() => []));
const fontItem = (f: string): MenuItem => ({ key: f, name: f, icon: null, style: { fontFamily: fontStack(f) } });

// Octet's one font list: Octet's fonts and the drawing's (each shown in itself), then More fonts…, which lists every
// font on the computer with a field to find one, as ChemDraw's Font menu lists every installed font (Sam: the list
// stays short until it is asked for more). The Actions panel, Settings and Text > Other Font… use it.
export function FontPick({ label, font, fonts, onPick, className = "chip size-button", start }: { label: string; font: string; fonts: string[]; onPick: (font: string) => void; className?: string; start?: boolean }) {
  return (
    <Pick label={label} value={font} groups={[(fonts.includes(font) ? fonts : [font, ...fonts]).map(fontItem)]} onPick={onPick} className={className} title={label} style={{ fontFamily: fontStack(font) }} start={start}
      more={TAURI ? { name: "More fonts…", find: "Find a font", load: () => systemFonts().then((all) => all.map(fontItem)) } : undefined}>
      <span className="font-name">{font}</span>
      <CaretUpDown size={12} aria-hidden />
    </Pick>
  );
}

// The text size: a click opens the sizes (ChemDraw's sizes times the document scale), and Other size…, Return or a
// double-click types any size.
function SizeButton({ size, sizes, run }: { size: number; sizes: number[]; run: (command: string) => void }) {
  const [typed, setTyped] = useState<string>();
  const typing = useRef(false); // Enter, Escape and blur all end typing; only the first one counts
  const startTyping = () => { typing.current = true; setTyped(String(size)); };
  const endTyping = (keep: boolean) => {
    if (!typing.current) return;
    typing.current = false;
    const n = Number(typed), pt = roundPt(n);
    setTyped(undefined);
    if (keep && n > 0 && pt <= 999 && pt !== size) run(`caption.size.${pt}`);
  };
  return (
    <div className="size">
      {typed !== undefined ? (
        <input
          className="chip size-input"
          aria-label="Size in points"
          autoFocus
          inputMode="decimal"
          value={typed}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTyped(e.target.value.replace(/[^\d.]/g, ""))}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); endTyping(true); } }}
          onBlur={() => endTyping(true)}
        />
      ) : (
        <Pick label="Size" value={String(size)} groups={[sizes.map((pt) => ({ key: String(pt), name: `${pt} pt`, icon: null })), [{ key: "other", name: "Other size…", icon: null }]]}
          onPick={(k) => (k === "other" ? startTyping() : run(`caption.size.${k}`))} className="chip size-button" title="Size" onDoubleClick={startTyping}
          onKey={(e) => { if (e.key !== "Enter") return false; e.preventDefault(); startTyping(); return true; }}>
          {size} pt
          <CaretUpDown size={12} aria-hidden />
        </Pick>
      )}
    </div>
  );
}

// The selection's scale against the document's style, in percent: blank when its parts differ. A typed value sets it
// (100 matches the document). Enter or leaving the field sets it; Escape leaves it as it was.
function ScaleField({ scale, run }: { scale: number | null; run: (command: string) => void }) {
  return (
    <label className="scale-row">
      <span className="tray-title">Scale</span>
      <NumberField label="Scale" unit="%" lazy step={1} max={10000} placeholder={scale === null ? "Mixed" : undefined}
        value={scale === null ? undefined : Math.round(scale * 1000) / 10} onChange={(n) => run(`scale.${n}`)} />
    </label>
  );
}

// Octet's one slider: a name, the track, and the value as it reads. Use it wherever a value is dragged.
export function Slider({ name, value, min, max, step, show, onChange }: { name: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span className="slider-name">{name}</span>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={name} aria-valuetext={show(value)} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <span className="slider-value">{show(value)}</span>
    </label>
  );
}

// A TLC spot in its style: filled, hollow, or shaded and lit from the top left.
// The outline styles: dashed (and hollow), bold, and doubled (a second outline round it).
const SPOT_STYLES = ["filled", "hollow", "shaded", "dashed", "bold", "doubled"] as const;
const SPOT_NAMES: Record<(typeof SPOT_STYLES)[number], string> = { filled: "Filled", hollow: "Hollow", shaded: "Shaded", dashed: "Dashed", bold: "Bold", doubled: "Doubled" };
function SpotGlyph({ style }: { style: (typeof SPOT_STYLES)[number] }) {
  const fill = style === "filled" ? "currentColor" : style === "shaded" ? "url(#spot-glyph)" : "none", line = style === "bold" ? 28 : style === "filled" || style === "shaded" ? 0 : 14;
  return (
    <svg width={20} height={20} viewBox="0 0 256 256" aria-hidden>
      {style === "shaded" && <defs><radialGradient id="spot-glyph" cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="var(--surface-raised)" /><stop offset="1" stopColor="currentColor" /></radialGradient></defs>}
      <ellipse cx={128} cy={128} rx={style === "doubled" ? 70 : 88} ry={style === "doubled" ? 36 : 52} fill={fill} stroke="currentColor" strokeWidth={line} strokeDasharray={style === "dashed" ? "30 20" : undefined} />
      {style === "doubled" && <ellipse cx={128} cy={128} rx={104} ry={70} fill="none" stroke="currentColor" strokeWidth={14} />}
    </svg>
  );
}

// A table's lines as a chip draws them: the lines given in ink, and (faint) the rest of the grid faintly.
function TableGlyph({ on, faint }: { on: TableLine[]; faint?: boolean }) {
  const has = new Set(on), x = [2, 7.33, 12.67, 18], y = [2, 6, 10, 14];
  const lines: [TableLine, number, number, number, number][] = [
    ["top", 2, 2, 18, 2], ["bottom", 2, 14, 18, 14], ["left", 2, 2, 2, 14], ["right", 18, 2, 18, 14], ["header", 2, y[1], 18, y[1]], ["rows", 2, y[2], 18, y[2]],
    ["cols", x[1], 2, x[1], 14], ["cols", x[2], 2, x[2], 14],
  ];
  const ink = (k: TableLine, i: number) => has.has(k) || (i === 4 && has.has("rows"));
  return (
    <svg width={20} height={16} viewBox="0 0 20 16" aria-hidden>
      {lines.map(([k, x1, y1, x2, y2], i) => (ink(k, i) || faint) && <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={ink(k, i) ? 1.5 : 1} opacity={ink(k, i) ? 1 : 0.25} />)}
    </svg>
  );
}

// small: shown as a small button by default (the user can drag it into the rows, and any row out of them).
// short: the name in a menu's cell, where the full name does not fit (the panel's rows show the full name).
export type Item = { icon: React.ReactNode; name: string; command: string; accent?: boolean; small?: boolean; short?: string };
// The small actions fall into sets, each a section of small buttons under a small title (Sam, 17 October 2026):
// the object's own edits (a table's, a plate's, a cycle's); Analyse; Search (Reaxys and PubChem, when Online search is
// on); Turn and flip (every turn, rotation and flip); Display and copy (what is shown on the structure, the rest, the
// clipboard and library); Arrange, Group (Group, Ungroup and Pick as one, as ChemDraw's right-click Group menu), Add frame,
// File and View when they apply. Delete is the last small button in every panel, with no title.
const SETS = ["table", "plate", "cycle", "analysis", "search", "turn", "more", "arrange", "group", "frame", "file", "view", "delete"] as const;
type SetId = (typeof SETS)[number];
const SET_TITLES: Record<SetId, string> = { table: "Table", plate: "Plate", cycle: "Cycle", analysis: "Analyse", search: "Search", turn: "Turn and flip", more: "Display and copy", arrange: "Arrange", group: "Group", frame: "Add frame", file: "File", view: "View", delete: "Delete" };
// Each set's icon, for its row when the sets show as menus.
const SET_ICONS: Record<SetId, React.ReactNode> = { table: <Table size={18} />, plate: <TlcGlyph />, cycle: <ArrowsClockwise size={18} />, analysis: <Flask size={18} />, search: <MagnifyingGlass size={18} />, turn: <ArrowArcRight size={18} />, more: <Eye size={18} />,
  arrange: <AlignCenterHorizontal size={18} />, group: <BoundingBox size={18} />, frame: <BracketGlyph v="brackets" />, file: <FileArrowDown size={18} />, view: <CornersOut size={18} />, delete: <Trash size={18} /> };
// Each action's kind. Kinds make up the sets; the kinds in Display and copy keep this order within it.
const SET_FOR: Record<string, SetId> = { table: "table", plate: "plate", cycle: "cycle", analysis: "analysis", search: "search", arrange: "arrange", group: "group", frame: "frame", file: "file", view: "view", turn: "turn", marks: "more", other: "more", library: "more", delete: "delete" };
const MORE_GROUPS = ["marks", "other", "library"];
const KIND_OF: Record<string, string> = {
  select_all: "view", zoom_fit: "view", centre_view: "view", import: "file", select_structure: "view",
  "shape.row.before": "table", "shape.col.before": "table", "shape.row.delete": "table", "shape.col.delete": "table", "shape.fit": "table", "shape.clear": "table", "shape.dashed": "table",
  "shape.hide.origin": "plate", "shape.hide.front": "plate", "shape.hide.border": "plate", "shape.ticks": "plate", "shape.transparent": "plate", "cycle.reverse": "cycle", "cycle.remove": "cycle",
  structure_to_name: "analysis", properties: "analysis", show_stereo: "analysis", predict_1h: "analysis", predict_13c: "analysis",
  search_reaxys: "search", search_reaxys_exact: "search", search_pubchem: "search", search_pubchem_sub: "search",
  "rotate.cw15": "turn", "rotate.ccw15": "turn", flip_h: "turn", flip_v: "turn", mirror_h: "turn", mirror_v: "turn", structure_perspective: "turn", flatten: "turn", clean_3d: "turn", clean_reaction_augmented: "turn", rotate_dialog: "turn", scale_dialog: "turn",
  pairs: "marks", number: "marks", "numbers.roman": "marks", atom_numbers: "marks", show_warnings: "marks", hide_warnings: "marks", explain_warning: "marks", "caption.add": "marks", colour_by_element: "marks", aromatic_display: "marks", hydrogen_display: "marks", contract_label: "marks",
  "cycle.make": "arrange", "align.row": "arrange", "align.column": "arrange", "align.spread-row": "arrange", group: "group", ungroup: "group", group_integral: "group",
  arrange_left: "arrange", arrange_centre: "arrange", arrange_right: "arrange", arrange_top: "arrange", arrange_middle: "arrange", arrange_bottom: "arrange",
  arrange_across: "arrange", arrange_down: "arrange", bring_front: "arrange", send_back: "arrange", centre_page: "arrange", join: "arrange",
  frame_brackets: "frame", frame_parens: "frame", frame_braces: "frame", frame_box: "frame", frame_rounded: "frame", frame_box_shadow: "frame", frame_rounded_shadow: "frame",
  copy_smiles: "library", copy_inchi: "library", copy_inchikey: "library", "template.add": "library", "dictionary.add": "library", delete: "delete",
};
const kindOf = (command: string) => KIND_OF[command] ?? "other";
const setOf = (command: string) => SET_FOR[kindOf(command)];

// Search Reaxys and Search PubChem: Phosphor's magnifier and the site's first letter. No logos.
export function SearchGlyph({ letter }: { letter: string }) {
  return <span className="glyph-text search-glyph" aria-hidden><MagnifyingGlass size={16} />{letter}</span>;
}

// The actions for a selection, likeliest first. The panel shows them; the command palette lists them too.
// online: Search Reaxys and Search PubChem are offered (Settings > Online search).
export function actionItems(context: Context, messy: boolean, hiddenWarnings = false, warned = 0, online = false): Item[] {
  const items: Item[] = [];
  const it = (icon: React.ReactNode, name: string, command: string, accent?: boolean, small?: boolean): Item => ({ icon, name, command, accent, small });
  // A cycle's side arrow, picked or labelled by the text picked: the same items for each (its ends and heads are picks).
  const sideItems = (c: CycleSide) => [it(<Shuffle size={18} />, "Swap in and out", "cycle.side.swap"), ...(c.inside !== undefined ? [it(<CircleHalf size={18} />, c.inside ? "Put outside the cycle" : "Put inside the cycle", "cycle.side.inside")] : []),
    ...(c.moved ? [it(<ClockCounterClockwise size={18} />, "Reset position", "cycle.side.reset")] : []), it(<Scissors size={18} />, "Remove the side arrow", "cycle.side.remove")];
  const small = (i: Item): Item => ({ ...i, small: true });
  // The compound numbers in roman or arabic numerals (issue 34), when the drawing has some.
  const numerals = (roman?: boolean) => (roman === undefined ? [] : [small(it(<span className="glyph-text">{roman ? "1" : "I"}</span>, roman ? "Use arabic numbers" : "Use roman numerals", "numbers.roman"))]);
  const clean = it(<MagicWand size={18} />, "Clean up structure", "clean_up", messy);
  const nameIt = { ...it(<TagSimple size={18} />, "Convert structure to name", "structure_to_name"), short: "Structure to name" };
  const toStructure = { ...it(<Atom size={18} />, "Convert name to structure", "name_to_structure"), short: "Name to structure" };
  // A generic (Markush) structure: every structure it stands for, in a new drawing.
  const expandIt = it(<SquaresFour size={18} />, "Expand generic structure", "expand_generic");
  const del = small(it(<Trash size={18} />, "Delete", "delete")); // the last small button in every panel
  // Rotate 180° keeps stereochemistry (arrows round), Flip mirrors it (mirror glyphs).
  const flips = [it(<ArrowsLeftRight size={18} />, "Rotate 180° horizontal", "flip_h", false, true), it(<ArrowsDownUp size={18} />, "Rotate 180° vertical", "flip_v", false, true)];
  const mirrors = [it(<FlipHorizontal size={18} />, "Flip horizontal", "mirror_h", false, true), it(<FlipVertical size={18} />, "Flip vertical", "mirror_v", false, true)];
  // One press each: the selection (or the whole drawing) opens in the browser. The exact and substructure searches
  // that are not the default are in the Search menu, with keys.
  const searches = online ? [it(<SearchGlyph letter="R" />, "Search Reaxys", "search_reaxys", false, true), it(<SearchGlyph letter="P" />, "Search PubChem", "search_pubchem", false, true)] : [];
  // Every turn and flip, for any selection they act on (as ChemDraw's Object menu, for every kind of object).
  const turnings = [small(it(<ArrowArcRight size={18} />, "Turn 15° clockwise", "rotate.cw15")), small(it(<ArrowArcLeft size={18} />, "Turn 15° anticlockwise", "rotate.ccw15"))];
  const turnsAndFlips = [...turnings, ...flips, ...mirrors];
  // The draw order, for every kind of object (Object menu: Bring to Front, Send to Back). On an atom or a bond it moves
  // the whole structure, as the menu command does.
  const order = [it(<StackSimple size={18} />, "Bring to front", "bring_front", false, true), it(<Stack size={18} />, "Send to back", "send_back", false, true)];
  // The rest of ChemDraw's Object menu, for every object it acts on: Rotate…, Scale…, Centre on Page, Add Frame and
  // Join (a main action when the selection can join).
  const rotate = small(it(<Angle size={18} />, "Rotate…", "rotate_dialog")), scale = small(it(<Resize size={18} />, "Scale…", "scale_dialog"));
  const centre = small(it(<ArrowsInCardinal size={18} />, "Centre on page", "centre_page"));
  // View > Centre in Window, for every selection and the whole drawing: the view pans to it, at the same zoom.
  const inWindow = small(it(<Crosshair size={18} />, "Centre in window", "centre_view"));
  const frames = ([["frame_brackets", "Brackets", <BracketGlyph v="brackets" />], ["frame_parens", "Parentheses", <BracketGlyph v="parens" />], ["frame_braces", "Braces", <BracketGlyph v="braces" />],
    ["frame_box", "Rectangle", <ElementGlyph v="box-plain" />], ["frame_rounded", "Rounded rectangle", <ElementGlyph v="rounded-plain" />], ["frame_box_shadow", "Rectangle with shadow", <ElementGlyph v="box-shadow" />],
    ["frame_rounded_shadow", "Rounded with shadow", <ElementGlyph v="rounded-shadow" />]] as const).map(([command, name, icon]) => small(it(icon, name, command)));
  const objects = [rotate, scale, centre, inWindow];
  const join = (context.kind === "structure" || context.kind === "selection") && context.joinable ? [it(<ArrowsMerge size={18} />, "Join", "join")] : [];
  // Any selection as a template, with its text, arrows and shapes (CD-33); on an atom or a bond, its whole structure.
  const keep = small(it(<BookmarkSimple size={18} />, "Add to templates", "template.add"));
  // A structure kept in the user's own dictionary by a name they give (ChemDraw's Add Structure to Dictionary).
  const dict = small(it(<BookOpenText size={18} />, "Add to dictionary…", "dictionary.add"));
  // On an atom or a bond: its whole structure (ChemDraw's Molecule > Select).
  const whole = small(it(<SelectionPlus size={18} />, "Select structure", "select_structure"));
  // ChemDraw's Explain This Warning and Display Warnings, for every selection with a warning marked or hidden on it.
  const warnings = (rows = false) => [...(warned ? [it(<Question size={18} />, warned > 1 ? "Explain these warnings" : "Explain this warning", "explain_warning", false, !rows),
    it(<BellSlash size={18} />, warned > 1 ? "Hide these warnings" : "Hide this warning", "hide_warnings", false, !rows)] : []),
    ...(hiddenWarnings ? [it(<WarningCircle size={18} />, "Show warnings", "show_warnings", false, !rows)] : [])];

  switch (context.kind) {
    case "empty":
      items.push(toStructure, it(<ClipboardText size={18} />, "Paste a SMILES or MOL", "paste_hint"),
        small(it(<FileArrowDown size={18} />, "Import a structure…", "import")));
      break;
    case "drawing":
      items.push(clean, ...(context.nameable ? [nameIt] : []), ...(context.generic ? [expandIt] : []), toStructure, ...flips,
        small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<IdentificationBadge size={18} />, "Copy as InChI", "copy_inchi")), small(it(<Key size={18} />, "Copy as InChIKey", "copy_inchikey")), ...searches, small(it(<FileArrowDown size={18} />, "Import a structure…", "import")),
        small(it(<SelectionAll size={18} />, "Select all", "select_all")), small(it(<CornersOut size={18} />, "Fit to window", "zoom_fit")), inWindow, centre, ...warnings());
      break;
    case "selection":
      items.push(...join, ...(context.atoms ? [clean] : []), it(<CopySimple size={18} />, "Copy", "copy"), ...warnings(), ...turnsAndFlips, ...objects, ...order, ...frames, keep, ...(context.atoms ? [dict] : []), del);
      break;
    case "structure":
      // Sam (17 October 2026): Clean up and Structure to name as rows; every turn, rotation and flip in one sub-menu;
      // what is shown on it, the clipboard and library, and Delete in another.
      items.push(...join, clean, ...(context.nameable ? [nameIt] : []), ...(context.generic ? [expandIt] : []), ...flips, ...order);
      if (context.pairs) items.push(small(it(<span className="glyph-text">N:</span>, context.pairs === "shown" ? "Hide lone pairs" : "Show lone pairs", "pairs")));
      items.push(small({ ...it(<ListNumbers size={18} />, context.structures > 1 ? "Number these compounds" : "Number this compound", "number"), short: context.structures > 1 ? "Number compounds" : undefined }), ...numerals(context.roman),
        small(it(<Hash size={18} />, context.numbers ? "Hide atom numbers" : "Show atom numbers", "atom_numbers")),
        ...warnings(),
        small(it(<Subtitles size={18} />, "Add a caption", "caption.add")),
        ...turnings, small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<IdentificationBadge size={18} />, "Copy as InChI", "copy_inchi")), small(it(<Key size={18} />, "Copy as InChIKey", "copy_inchikey")), ...searches, keep, dict, small(it(<Flask size={18} />, context.properties ? "Hide the Properties panel" : "Show the Properties panel", "properties")), small(it(<span className="glyph-text">R/S</span>, context.cip ? "Hide stereochemistry" : "Show stereochemistry", "show_stereo")), small(it(<Palette size={18} />, "Colour by element", "colour_by_element")), small(it(<Circle size={18} />, context.circles ? "Show Kekulé bonds" : "Show aromatic circles", "aromatic_display")), ...(context.hydrogens ? [small(it(<EyeSlash size={18} />, "Toggle hydrogen display", "hydrogen_display"))] : []), small(it(<ArrowsInSimple size={18} />, "Contract label", "contract_label")), small(it(<span className="glyph-text">¹H</span>, "Predict ¹H-NMR shifts", "predict_1h")), small(it(<span className="glyph-text">¹³C</span>, "Predict ¹³C-NMR shifts", "predict_13c")));
      if (context.structures > 1) items.push(small(it(<ArrowsClockwise size={18} />, "Make a catalytic cycle", "cycle.make")), small(it(<DotsThree size={18} />, "Line up in a row", "align.row")),
        small(it(<DotsThreeVertical size={18} />, "Line up in a column", "align.column")), small(it(<SquareSplitHorizontal size={18} />, "Space evenly", "align.spread-row")));
      if (context.depth !== undefined) items.push(small(it(<Cube size={18} />, context.depth ? "Turn depth shading off" : "Turn depth shading on", "structure_perspective")), small(it(<Square size={18} />, "Flatten", "flatten")));
      items.push(small(it(<CubeTransparent size={18} />, "3D clean up", "clean_3d")));
      // Query and Markush structures (ChemDraw's Structure menu): attachments on the selected atoms, and an R-group
      // definition round the selected structures.
      if (context.atoms > 1) items.push(small(it(<Asterisk size={18} />, "Add multi-centre attachment", "add_multicentre")), small(it(<AsteriskSimple size={18} />, "Add variable attachment", "add_variable")));
      items.push(small(it(<BracketsSquare size={18} />, "Make an R-group definition", "define_rgroup")));
      items.push(...mirrors, ...objects, ...frames, del);
      break;
    case "atom":
      items.push(it(<CursorText size={18} />, "Type a label", "atom.label"), ...(context.repeat ? [it(<Repeat size={18} />, `Repeat ${context.repeat}`, "repeat_label")] : []), it(<PlusCircle size={18} />, "Add a positive charge", "charge.plus"), it(<MinusCircle size={18} />, "Add a negative charge", "charge.minus"),
        ...((context.label.length > 2 || !/^[A-Z][a-z]?$/.test(context.label)) && context.text?.chemical !== false && !queryLabel(context.label) ? [it(<ArrowsOutSimple size={18} />, "Expand label", "expand_label")] : []), it(<Faders size={18} />, "Atom properties…", "atom_properties"), it(<Hash size={18} />, context.numbered ? "Hide atom number" : "Show atom number", "atom_numbers"),
        ...warnings(true), ...order, whole, inWindow, keep, dict, del);
      break;
    case "bond":
      if (context.double) items.push({ ...it(<span className="glyph-text">A</span>, "Second line placed automatically", "bond.auto"), short: "Automatic position" }, it(<span className="glyph-text">L</span>, "Second line on the left", "bond.left"), it(<span className="glyph-text">C</span>, "Centre the double bond", "bond.centre"), it(<span className="glyph-text">R</span>, "Second line on the right", "bond.right"));
      if (context.flippable) items.push(it(<ArrowUDownLeft size={18} />, "Point the other way", "bond.flip"));
      items.push(it(<FadersHorizontal size={18} />, "Bond properties…", "bond_properties"), ...warnings(true), ...order, whole, inWindow, keep, dict, del);
      break;
    case "caption":
      if (context.mode !== "picked") break;
      // Sam (21 October 2026): a caption that reads as an element or a label (Rh, OMe) becomes that atom, so bonds join it.
      if (context.labelable) items.push(it(<TextTSlash size={18} />, "Make element", "make_element"));
      if (context.convertible) items.push(toStructure);
      if (context.count === 1) items.push(it(<PencilSimpleLine size={18} />, "Edit text", "caption.edit"));
      if (context.cycleSide) items.push(...sideItems(context.cycleSide));
      if (context.cycleName?.moved) items.push(it(<ClockCounterClockwise size={18} />, "Reset position", "cycle.side.reset"));
      if (context.attached) items.push(it(<LinkBreak size={18} />, "Un-tie from structure", "caption.detach"));
      else if (context.attachable) items.push(it(<LinkSimple size={18} />, "Tie to structure", "caption.attach"));
      items.push(...warnings(), small(it(<Paragraph size={18} />, "Line spacing…", "line_spacing")), ...turnings, rotate, centre, inWindow, ...order, keep, del);
      break;
    case "reaction":
      items.push(it(<Broom size={18} />, "Clean up reaction", "clean_reaction", !context.clean), small(it(<StarFour size={18} />, "Augmented clean up reaction", "clean_reaction_augmented")),
        { ...it(<ListNumbers size={18} />, "Number these compounds", "number"), short: "Number compounds" }, ...numerals(context.roman), small(it(<CopySimple size={18} />, "Copy as SMILES", "copy_smiles")), small(it(<IdentificationBadge size={18} />, "Copy as InChI", "copy_inchi")), small(it(<Key size={18} />, "Copy as InChIKey", "copy_inchikey")),
        it(<FlowArrow size={18} />, "Map atoms", "map_reaction"), it(<Table size={18} />, context.grid ? "Remove stoichiometry" : "Analyse stoichiometry", "stoichiometry"), ...(context.mapped ? [small(it(<X size={18} />, "Clear atom map", "clear_reaction_map"))] : []), ...warnings(), ...turnsAndFlips, ...objects, ...order, ...frames, keep, del);
      break;
    case "grid":
      // ChemDraw's grid menu: Set Limiting, Hide Row, Hide Column, Show All (and Colors, the colour row).
      items.push(...(!context.product && !context.limiting ? [it(<Target size={18} />, "Set as limiting", "grid.limiting")] : []),
        it(<ArrowsInLineVertical size={18} />, "Hide row", "grid.hide.row"), it(<EyeClosed size={18} />, "Hide column", "grid.hide.col"),
        ...(context.hidden ? [it(<Eye size={18} />, "Show all rows and columns", "grid.show")] : []),
        // A reagent on each row and the products under them, or a column for each (issue 34).
        it(context.rows ? <Columns size={18} /> : <Rows size={18} />, context.rows ? "Show as columns" : "Show as rows", "grid.layout"), inWindow, del);
      break;
    case "cycle":
      if (context.side) {
        items.push(...sideItems(context.side));
        break;
      }
      if (context.step) {
        items.push(it(<ArrowsHorizontal size={18} />, context.reversible ? "Make the step one way" : "Make the step reversible", "cycle.step.reversible"),
          it(<ArrowBendDownRight size={18} />, "Add a side arrow", "cycle.side.add"), it(<Tag size={18} />, context.named ? "Edit the step name" : "Add a step name", "cycle.name"),
          ...(context.shaped ? [it(<ArrowUUpLeft size={18} />, "Reset the step", "cycle.step.reset")] : []), it(<Path size={18} />, context.hidden ? "Show the arc" : "Hide the arc", "cycle.step.hide"));
        break;
      }
      if (!context.centre) items.push(it(<Textbox size={18} />, "Add a centre label", "cycle.centre"));
      items.push(it(<ArrowBendDownRight size={18} />, "Add a side arrow", "cycle.side.add"), it(<Tag size={18} />, "Add a step name", "cycle.name"),
        ...(context.arcs ? [it(<CircleNotch size={18} />, "Show the hidden arcs", "cycle.step.show")] : []), it(<CirclesThree size={18} />, "Tidy the cycle", "cycle.tidy"), small(it(<ArrowsCounterClockwise size={18} />, "Reverse the direction", "cycle.reverse")),
        small(it(<CircleDashed size={18} />, "Remove the cycle", "cycle.remove")), ...turnsAndFlips, ...objects, ...order, keep, del);
      break;
    case "shape":
      if (context.shape === "tlc") {
        const hidden = (k: string) => context.hide?.includes(k);
        // At the lane last pressed or right-clicked (a new lane goes after it), or at the last lane, as ChemDraw's plate
        // menu acts on the lane under the pointer.
        items.push(it(<Plus size={18} />, "Add a lane", "shape.lanes.1"), it(<Copy size={18} />, context.lane ? "Duplicate the lane" : "Duplicate the last lane", "shape.lanes.copy"),
          it(<Minus size={18} />, context.lane ? "Delete the lane" : "Delete the last lane", "shape.lanes.-1"),
          it(<span className="glyph-text">Rf</span>, context.rf ? "Hide Rf values" : "Show Rf values", "shape.rf"),
          small(it(<AlignBottomSimple size={18} />, hidden("origin") ? "Show the origin" : "Hide the origin", "shape.hide.origin")),
          small(it(<AlignTopSimple size={18} />, hidden("front") ? "Show the solvent front" : "Hide the solvent front", "shape.hide.front")),
          small(it(<Rectangle size={18} />, hidden("border") ? "Show the border" : "Hide the border", "shape.hide.border")),
          small(it(<ListDashes size={18} />, context.ticks ? "Hide the side ticks" : "Show the side ticks", "shape.ticks")),
          small(it(<Checkerboard size={18} />, context.transparent ? "Make opaque" : "Make transparent", "shape.transparent")), scale, centre, inWindow, ...order, keep, del);
        break;
      }
      if (context.shape === "table") {
        // At the cell last typed in, or at the end of the table.
        items.push(it(<RowsPlusBottom size={18} />, "Add a row below", "shape.row.after"), it(<ColumnsPlusRight size={18} />, "Add a column after", "shape.col.after"),
          small(it(<RowsPlusTop size={18} />, "Add a row above", "shape.row.before")), small(it(<ColumnsPlusLeft size={18} />, "Add a column before", "shape.col.before")),
          small(it(<Rows size={18} />, context.cell ? "Delete the row" : "Delete the last row", "shape.row.delete")), small(it(<Columns size={18} />, context.cell ? "Delete the column" : "Delete the last column", "shape.col.delete")),
          small(it(<ArrowsInLineHorizontal size={18} />, "Size to fit contents", "shape.fit")), small(it(<Backspace size={18} />, "Clear contents", "shape.clear")),
          small(it(<LineSegments size={18} />, context.dashed ? "Solid lines" : "Dashed lines", "shape.dashed")), scale, centre, inWindow, ...order, keep, del);
        break;
      }
      if (isBracket({ kind: context.shape })) items.push(it(<BracketsRound size={18} />, "Bracket properties…", "bracket_properties"), it(<LineSegments size={18} />, context.dashed ? "Solid lines" : "Dashed lines", "shape.dashed"), ...warnings());
      if (context.rgroup) items.push(it(<TreeStructure size={18} />, "R-Logic…", "rlogic"));
      items.push(...turnsAndFlips, ...objects, ...order, keep, del);
      break;
    case "spot":
      items.push(it(<Percent size={18} />, "Set Rf…", "spot.setrf"), it(<span className="glyph-text">Rf</span>, context.rf ? "Hide its Rf" : "Show its Rf", "spot.rf"), inWindow, del);
      break;
    case "arrow":
      if (context.arrow === "orbital") { items.push(it(<Swap size={18} />, "Swap the phases", "orbital.swap"), ...turnsAndFlips, ...objects, ...order, keep, del); break; }
      if (context.arrow === "curve") { items.push(it(<Polygon size={18} />, context.closed ? "Open the curve" : "Close the curve", "arrow.closed"), it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"), ...turnsAndFlips, ...objects, ...order, keep, del); break; }
      {
        // A straight arrow or line takes a point, which bends it; a bent one flips its curve, as a curved arrow does.
        const point = context.point === "add" ? [it(<BezierCurve size={18} />, "Add a point", "arrow.point")] : context.point ? [it(<LineSegment size={18} />, "Remove the point", "arrow.point")] : [];
        const flip = context.curved || context.point === "bent" ? [it(<WaveSine size={18} />, "Flip the curve", "arrow.flip")] : [];
        if (isLine({ kind: context.arrow })) { items.push(it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"), ...flip, ...point, ...turnsAndFlips, ...objects, ...order, keep, del); break; }
        if (context.count === 1 && !context.curved) items.push(it(<ArrowLineUp size={18} />, "Add conditions above", "arrow.above"), it(<ArrowLineDown size={18} />, "Add conditions below", "arrow.below"));
        items.push(it(<ArrowUDownLeft size={18} />, "Reverse", "arrow.reverse"), ...flip, ...point, ...turnsAndFlips, ...objects, ...order, keep, del);
      }
      break;
  }
  return items;
}


// The panel's actions as the user arranged them: rows first, then the small actions set by set. The Actions panel
// and the right-click menu (ActionsMenu) both show them this way.
export function arrangedActions(context: Context, messy: boolean, hiddenWarnings: boolean | undefined, warned: number | undefined, grouping: Props["grouping"], layout: Props["layout"], online?: boolean) {
  const items = actionItems(context, messy, hiddenWarnings, warned, online);
  // Group and Ungroup, and Align and Distribute, for any selection of two or more things, as small buttons.
  if (grouping) items.push(...([["arrange_left", "Align left edges", <AlignLeft size={18} />], ["arrange_centre", "Align left-right centres", <AlignCenterHorizontal size={18} />], ["arrange_right", "Align right edges", <AlignRight size={18} />],
    ["arrange_top", "Align top edges", <AlignTop size={18} />], ["arrange_middle", "Align top-bottom centres", <AlignCenterVertical size={18} />], ["arrange_bottom", "Align bottom edges", <AlignBottom size={18} />],
    ["arrange_across", "Distribute horizontally", <ArrowsOutLineHorizontal size={18} />], ["arrange_down", "Distribute vertically", <ArrowsOutLineVertical size={18} />]] as const).map(([command, name, icon]) => ({ icon, name, command, small: true })));
  if (grouping?.group) items.push({ icon: <BoundingBox size={18} />, name: "Group", command: "group", small: true });
  if (grouping?.grouped) items.push({ icon: <SelectionSlash size={18} />, name: "Ungroup", command: "ungroup", small: true }, { icon: <Unite size={18} />, name: grouping.integral ? "Let parts be picked" : "Pick as one", command: "group_integral", small: true });
  // The user's order first (actions it does not know keep their place after it), then their split into rows.
  const mine = layout[context.kind];
  if (mine) items.sort((a, b) => {
    const [i, j] = [mine.order.indexOf(a.command), mine.order.indexOf(b.command)];
    return i < 0 || j < 0 ? 0 : i - j;
  });
  // By default the main actions come first as rows, and the ones marked small follow as small buttons, set by set.
  if (!mine) items.sort((a, b) => Number(!!a.small) - Number(!!b.small) || (a.small ? SETS.indexOf(setOf(a.command)) - SETS.indexOf(setOf(b.command)) : 0));
  const split = Math.min(items.length, mine ? mine.rows : items.length - items.filter((i) => i.small).length);
  const rows = items.slice(0, split), tray = items.slice(split);
  // The small actions set by set, whatever order they were arranged in.
  const all = SETS.map((s) => [s, tray.filter((i) => setOf(i.command) === s)
    .sort((a, b) => (s === "more" ? MORE_GROUPS.indexOf(kindOf(a.command)) - MORE_GROUPS.indexOf(kindOf(b.command)) : 0))] as const).filter(([, list]) => list.length);
  // One rule for the whole panel (Sam, 4 November 2026): an action that stands alone is a row with its name, as one
  // icon on its own does not say what it does, and a set of two or more is a titled section of small buttons. So by
  // default a set of one joins the rows. Delete is the only exception: it stays the panel's last small button, with no
  // title, always on show. A panel the user has arranged keeps their split, and a set of one there still has its title.
  const alone = mine ? [] : all.filter(([s, list]) => list.length === 1 && s !== "delete").map(([, list]) => list[0]);
  const sets = all.filter(([, list]) => !alone.includes(list[0]));
  return { items: [...rows, ...alone, ...tray.filter((i) => !alone.includes(i))], rows: [...rows, ...alone], sets };
}

function Row({ icon, name, command, hint, run, accent }: { icon: React.ReactNode; name: string; command: string; hint?: string; run: (c: string) => void; accent?: boolean }) {
  return (
    <button className={accent ? "action accent" : "action"} onClick={() => run(command)}>
      {icon}
      <span className="action-name">{name}</span>
      {hint && <kbd>{hint}</kbd>}
    </button>
  );
}

// A titled section that folds to its title row (Sam, 18 October 2026: every section is open by default and can fold,
// so the panel is cleaner and still hides nothing). A click on the title, or Return or Space on it, folds or opens it,
// and Octet keeps that choice for every kind of selection. A folded section opens while the pointer rests on it, and
// folds again a short time after the pointer leaves it, unless the keyboard focus is in it.
// While the pointer is in the panel, the panel keeps its height and a section opens and closes below its title, so
// nothing above it moves. A section above the pointer stays open until the pointer goes above it or out of the panel,
// so nothing moves under the pointer either. When the pointer leaves, the panel takes its full height again.
// held: the checks of open sections kept open as the pointer is below them, run again as the pointer moves.
type Folds = { y: number | null; peeks: Set<string>; settle: Set<() => void>; held: Set<() => void>; hold: () => void; release: (now?: boolean) => void };
const PEEK_DELAY = 100, PEEK_LINGER = 300; // ms the pointer rests before a folded section opens, and stays open after it leaves
function Fold({ id, title, className, folded, onFold, folds, children }: { id: string; title: string; className: string; folded: boolean; onFold: (id: string, folded: boolean) => void; folds: Folds; children: React.ReactNode }) {
  const [peek, setPeek] = useState(false);
  const box = useRef<HTMLDivElement>(null), body = useId();
  const timer = useRef(0), over = useRef(false), focused = useRef(false), quiet = useRef(false); // quiet: folded by a click, and the pointer has not left it since
  const open = !folded || peek;
  // Folds it again when neither the pointer nor the focus is on it and the pointer is not below it.
  const settle = useRef(() => {
    folds.held.delete(settle);
    if (over.current || focused.current) return;
    const r = box.current?.getBoundingClientRect();
    if (r && folds.y !== null && folds.y > r.bottom && folds.peeks.has(id)) { folds.held.add(settle); return; }
    folds.peeks.delete(id);
    setPeek(false);
    folds.release();
  }).current;
  useEffect(() => {
    folds.settle.add(settle);
    return () => { clearTimeout(timer.current); folds.settle.delete(settle); folds.held.delete(settle); folds.peeks.delete(id); folds.release(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (e: React.MouseEvent) => {
    const pointer = e.detail > 0; // a click, not Return or Space
    if (pointer) folds.hold();
    quiet.current = pointer && !folded;
    folds.peeks.delete(id);
    setPeek(false);
    onFold(id, !folded);
  };
  return (
    <div ref={box} className={`${className} fold`} role="group" aria-label={title} data-folded={folded || undefined}
      onPointerEnter={() => {
        over.current = true;
        clearTimeout(timer.current);
        if (folded && !peek && !quiet.current) timer.current = window.setTimeout(() => { folds.hold(); folds.peeks.add(id); setPeek(true); }, PEEK_DELAY);
      }}
      onPointerLeave={() => { over.current = false; quiet.current = false; clearTimeout(timer.current); timer.current = window.setTimeout(settle, PEEK_LINGER); }}
      onFocus={(e) => { if (e.target.matches(":focus-visible")) focused.current = true; }}
      onBlur={(e) => { if (!box.current?.contains(e.relatedTarget as Node | null)) { focused.current = false; window.setTimeout(settle, PEEK_LINGER); } }}>
      <button className="fold-title" aria-expanded={open} aria-controls={body} onClick={toggle}>
        {title}
        <CaretDown size={12} className="fold-caret" aria-hidden />
      </button>
      <div id={body} className="fold-body" data-open={open || undefined} inert={!open}>
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Actions({ open, context, analysis, problems, fonts, hiddenWarnings, warned, messy, hint, onOpen, run, layout, onLayout, colour, palette, grouping, menus, sizes, scale, online, folded, onFold }: Props) {
  // An action being dragged to a new place: in the rows (index among rows) or the small buttons (index among them).
  const [carry, setCarry] = useState<{ command: string; x: number; y: number; to?: { rows: boolean; index: number } }>();
  const dragged = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const kindNow = arrowKind(context);
  const [settled, setSettled] = useState<string>();
  // Closing plays the panel's exit before it leaves the page; the Actions button then comes in where it was.
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  // The formula and mass keep their last values while the panel leaves, as the editor stops working them out once
  // the panel is closed.
  const facts = useRef(analysis);
  if (open) facts.current = analysis;
  useEffect(() => {
    if (open) { setShown(true); setLeaving(false); return; }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => { setShown(false); setLeaving(false); }, 180); // in case the animation never ends
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // With sets as menus: the one open beside the panel, and where (fixed, so the panel's scrolling never cuts it off).
  // A click outside it or Escape closes it, and so does a new selection.
  const [sub, setSub] = useState<{ set: SetId; top: number; right: number }>();
  const subBox = useRef<HTMLDivElement>(null);
  useEffect(() => setSub(undefined), [context.kind]);
  // The pointer's height while it is in the panel, the folded sections open for now, and the panel's height kept while
  // the pointer is in it (see Fold). When the panel lets go of its height, it waits for a section to finish folding,
  // then slides to its own height, so its top edge does not jump.
  const [folds] = useState(() => {
    let wait = 0, slide: Animation | undefined;
    const f: Folds = { y: null, peeks: new Set(), settle: new Set(), held: new Set(),
      hold: () => {
        const el = panel.current;
        if (!el || f.y === null || el.style.height) return;
        el.style.height = getComputedStyle(el).height; // in a slide, the height the slide has got to
        slide?.cancel();
      },
      release: (now) => {
        clearTimeout(wait);
        if (now) { slide?.cancel(); if (panel.current) panel.current.style.height = ""; return; }
        wait = window.setTimeout(() => {
          const el = panel.current;
          if (!el || f.peeks.size || f.y !== null || !el.style.height) return;
          const from = getComputedStyle(el).height;
          el.style.height = "";
          const to = getComputedStyle(el).height;
          if (from !== to && !reduced()) slide = el.animate({ height: [from, to] }, timing());
        }, reduced() ? 0 : timing().duration);
      } };
    return f;
  });
  // A new kind of selection changes the panel: it takes its own height again.
  useEffect(() => { folds.release(true); }, [context.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!sub) return;
    const away = (e: PointerEvent) => { const t = e.target as Element; if (!subBox.current?.contains(t) && !t.closest?.(".submenu-row")) setSub(undefined); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSub(undefined); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [sub]);
  // The problems list shows two, then all of them once "N more" is clicked.
  const [allProblems, setAllProblems] = useState(false);

  if (!shown) {
    return (
      <button className="actions-reopen" onClick={() => onOpen(true)} data-tip="Show actions">
        <SlidersHorizontal size={16} aria-hidden />
        Actions
        {problems.length > 0 && <span className="badge" aria-label={`${problems.length} problems`}>{problems.length}</span>}
      </button>
    );
  }
  const title = {
    empty: "Actions",
    drawing: "Whole drawing",
    selection: context.kind !== "selection" ? "Objects" : context.name ?? `${context.count} objects`,
    structure: context.kind === "structure" && context.structures > 1 ? `${context.structures} structures` : "Structure",
    atom: "Atom",
    bond: "Bond",
    caption: context.kind !== "caption" || context.mode !== "picked" ? "Text" : context.count > 1 ? `${context.count} captions` : "Caption",
    arrow: context.kind !== "arrow" ? "Arrow" : context.arrow === "orbital" ? (context.count > 1 ? `${context.count} orbitals` : "Orbital")
      : context.count > 1 ? `${context.count} ${context.arrow === "curve" ? "curves" : isLine({ kind: context.arrow }) ? "lines" : "arrows"}`
      : context.arrow === "curve" ? "Curve" : context.arrow === "arc" ? "Arc" : context.arrow === "line" ? "Line" : "Arrow",
    cycle: "Catalytic cycle",
    grid: "Stoichiometry grid",
    reaction: context.kind === "reaction" && context.steps > 1 ? `${context.steps}-step reaction` : "Reaction",
    spot: "TLC spot",
    shape: context.kind === "shape" && context.count > 1 ? `${context.count} shapes` : context.kind === "shape" ? SHAPES[context.shape] : "Shape",
    line: "Line",
  }[context.kind];
  // The formula and mass rows: structures, and captions that count as chemistry (the editor gives none for others).
  const whole = context.kind === "drawing" || context.kind === "structure" || (context.kind === "caption" && context.mode === "picked");

  const { items, rows, sets } = arrangedActions(context, messy, hiddenWarnings, warned, grouping, layout, online);

  // Drag any action to a new place: along the rows, along the small buttons, or from one to the other.
  function startCarry(e: React.PointerEvent, command: string) {
    if (e.button !== 0) return;
    const [sx, sy] = [e.clientX, e.clientY];
    let moving = false, to: { rows: boolean; index: number } | undefined;
    dragged.current = false;
    const target = (x: number, y: number) => {
      const el = panel.current!, list = [...el.querySelectorAll<HTMLElement>(".actions-list .action-slot")], buttons = [...el.querySelectorAll<HTMLElement>(".tray-button")];
      const trayBox = el.querySelector<HTMLElement>(".tray")?.getBoundingClientRect(), box = el.getBoundingClientRect();
      if (x < box.left - 40 || x > box.right + 40 || y < box.top - 40 || y > box.bottom + 40) return undefined;
      if (trayBox && y >= trayBox.top - 4) {
        const others = buttons.filter((b) => b.dataset.command !== command);
        const at = others.findIndex((b) => x < b.getBoundingClientRect().left + b.offsetWidth / 2);
        return { rows: false, index: at < 0 ? others.length : at };
      }
      const others = list.filter((r) => r.dataset.command !== command);
      const at = others.findIndex((r) => y < r.getBoundingClientRect().top + r.offsetHeight / 2);
      return { rows: true, index: at < 0 ? others.length : at };
    };
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      moving = dragged.current = true;
      to = target(ev.clientX, ev.clientY);
      setCarry({ command, x: ev.clientX, y: ev.clientY, to });
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      setCarry(undefined);
      if (!moving || !to) return;
      const rest = items.map((i) => i.command).filter((c) => c !== command);
      const rowsLeft = rows.filter((i) => i.command !== command).length;
      const at = to.rows ? to.index : rowsLeft + to.index;
      onLayout(context.kind, { order: [...rest.slice(0, at), command, ...rest.slice(at)], rows: to.rows ? rowsLeft + 1 : rowsLeft });
      setSettled(command);
      setTimeout(() => setSettled(undefined), 300);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  }

  return (
    <section
      ref={panel}
      className={["actions", leaving && "leaving", carry && "arranging"].filter(Boolean).join(" ")}
      aria-label="Actions"
      inert={leaving}
      onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) { setShown(false); setLeaving(false); } }}
      onPointerEnter={(e) => { folds.y = e.clientY; }}
      onPointerMove={(e) => { folds.y = e.clientY; [...folds.held].forEach((f) => f()); }}
      onPointerLeave={() => { folds.y = null; setTimeout(() => { folds.settle.forEach((f) => f()); folds.release(); }, PEEK_LINGER); }}
      // While text is being typed, the panel's buttons style it without taking the focus away from it.
      onMouseDown={(e) => { if (context.kind === "caption" && context.mode === "typing" && !(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
    >
      <header>
        <h2>{title}</h2>
        <button className="actions-close" onClick={() => onOpen(false)} aria-label="Close actions" data-tip="Close actions">
          <X size={12} />
        </button>
      </header>

      {facts.current && whole && facts.current.slice(0, 3).map((a, k) => (
        <button key={k} className="facts" onClick={() => run(`copy_text:${a.abbreviation ? `${a.abbreviation}, ` : ""}${a.formula}, ${massText(a, "weight", 2)} g/mol`)} data-tip={`${Number.isFinite(a.exact) ? `Exact mass ${massText(a, "exact", 4)}. ` : ""}Click to copy.`}>
          <span className="facts-what">
            {a.abbreviation && <><span className="facts-abbreviation">{a.abbreviation}</span><span aria-hidden> · </span></>}
            <span className="formula">{formula(a.formula)}</span>
          </span>
          <span>{massText(a, "weight", 2)} g/mol</span>
        </button>
      ))}

      {problems.length > 0 && context.kind !== "empty" && (
        <div className="problems" role="status">
          {(allProblems ? problems : problems.slice(0, 2)).map((p) => {
            // What the problem is on: an atom, a bond, a shape or a caption, as the editor's commands name it.
            const on = p.atom !== undefined ? `a${p.atom}` : p.bond !== undefined ? `b${p.bond}` : p.caption !== undefined ? `c${p.caption}` : `s${p.shape}`;
            return (
              <div key={`${on}${p.type}${p.message}`} className="problem">
                <Warning size={16} aria-hidden />
                <p>{p.message}</p>
                <button className="problem-hide" onClick={() => run(`hide_warning:${on}`)} aria-label="Hide this warning" data-tip="Hide this warning"><X size={12} /></button>
                <div className="problem-buttons">
                  {p.fix && <button onClick={() => run(p.fix!.command)} data-tip={p.fix.label}>Fix</button>}
                  <button onClick={() => run(`show:${on}`)}><Eye size={12} aria-hidden /> Show</button>
                </div>
              </div>
            );
          })}
          {problems.length > 2 && <button className="more-problems" aria-expanded={allProblems} onClick={() => setAllProblems((a) => !a)}>{allProblems ? "Show fewer" : `${problems.length - 2} more`}</button>}
        </div>
      )}

      {context.kind === "atom" && (
        <>
          <div className="chips" role="group" aria-label="Element">
            {ELEMENTS.map((el) => (
              <button key={el} className="chip" aria-pressed={context.label === el} onClick={() => run(`element.${el}`)} data-tip={el} data-key={hint(`element.${el}`)}>
                {el}
              </button>
            ))}
          </div>
          {/* ChemDraw's Insert Generic Label: A, M, Q, X and R, then the Reaxys classes, each with what it stands for. */}
          <div className="chips groups" role="group" aria-label="Generic label">
            <Pick label="Generic label" value={context.label} onPick={(g) => run(`label:${g}`)} className="chip" title="Generic label"
              groups={[GENERICS.slice(0, 5), GENERICS.slice(5)].map((list) => list.map(([g, name]) => ({ key: g, name, icon: <span className="glyph-text">{g}</span> })))}>
              Generic
            </Pick>
          </div>
          {context.terminal ? (
            <div className="chips groups" role="group" aria-label="Groups">
              {ENDS.map(([shown, value]) => (
                <button key={value} className="chip" onClick={() => run(`label:${value}`)} data-tip={`Make this ${shown}`}>{shown}</button>
              ))}
            </div>
          ) : context.carbon ? (
            <div className="chips groups" role="group" aria-label="Add">
              {[["+Me", "group.chain"], ["=O", "group.acetyl"], ["+Ph", "group.phenyl"], ["+ wedge", "group.wedgeMe"], ["+ hash", "group.hashMe"]].map(([shown, command]) => (
                <button key={command} className="chip" onClick={() => run(command)} data-tip={shown} data-key={hint(command)}>{shown}</button>
              ))}
            </div>
          ) : null}
          {context.centre && (
            <div className="chips groups" role="group" aria-label="Stereo flag">
              {[["abs", "Absolute"], ...(context.groups?.and ?? [1]).map((n) => [`&${n}`, `And group ${n}`]), ...(context.groups?.or ?? [1]).map((n) => [`or${n}`, `Or group ${n}`])].map(([flag, name]) => (
                <button key={flag} className="chip" aria-pressed={context.enhanced === flag} onClick={() => run(`stereo.atom.${flag}`)} data-tip={name}>{flag}</button>
              ))}
            </div>
          )}
        </>
      )}
      {context.kind === "structure" && context.stereo && (
        <div className="chips groups" role="group" aria-label="Stereochemistry">
          {([["absolute", "abs", "Absolute"], ["racemic", "rac", "Racemic"], ["relative", "rel", "Relative"]] as const).map(([id, text, name]) => (
            <button key={id} className="chip" aria-pressed={context.stereo === id} onClick={() => run(`stereo.${id}`)} data-tip={name}>{text}</button>
          ))}
        </div>
      )}

      {context.kind === "bond" && (
        <>
          <div className="chips styles" role="group" aria-label="Bond style">
            {STYLES.filter((kind) => kind !== "hydrogen" || context.style === kind).map((kind) => (
              <button key={kind} className="chip" aria-pressed={context.style === kind} aria-label={BONDS[kind].name}
                data-tip={BONDS[kind].name} data-key={hint(`bond.${kind}`)} onClick={() => run(`bond.${kind}`)}>
                <BondGlyph kind={kind} />
              </button>
            ))}
          </div>
          <div className="chips rings" role="group" aria-label="Fuse a ring">
            {(["benzene", "6", "5"] as const).map((ring) => {
              const command = ring === "benzene" ? "bond.benzene" : `bond.ring${ring}`;
              const name = ring === "benzene" ? "Fuse a benzene" : `Fuse a ${ring}-membered ring`;
              return (
                <button key={ring} className="chip" onClick={() => run(command)} aria-label={name} data-tip={name} data-key={hint(command)}>
                  <RingGlyph kind={ring} />
                </button>
              );
            })}
          </div>
        </>
      )}

      {context.kind === "caption" && (
        <div className="chips" role="group" aria-label="Style">
          {([["bold", "Bold", <TextB size={16} />, context.bold], ["italic", "Italic", <TextItalic size={16} />, context.italic], ["underline", "Underline", <TextUnderline size={16} />, context.underline],
            ["sub", "Subscript", <TextSubscript size={16} />, context.script === "sub"], ["super", "Superscript", <TextSuperscript size={16} />, context.script === "super"]] as const).map(([id, name, icon, on]) => (
            <button key={id} className="chip" aria-pressed={on} aria-label={name} data-tip={name} data-key={hint(`caption.${id}`)} onClick={() => run(`caption.${id}`)}>{icon}</button>
          ))}
          <button className="chip" aria-label="Formula" data-tip="Formula: counts become subscripts" data-key={hint("caption.formula")} onClick={() => run("caption.formula")}><span className="glyph-text">H<sub>2</sub>O</span></button>
          <button className="chip" aria-label="Character map" data-tip="Character map" onClick={() => run("char_map")}><span className="glyph-text">αβ</span></button>
          {context.fonts && <div className="size font"><FontPick label="Font" font={context.font ?? context.fonts[0]} fonts={context.fonts} onPick={(f) => run(`caption.font.${f}`)} /></div>}
          <SizeButton size={context.size} sizes={sizes} run={run} />
          {([["left", "Flush left", <TextAlignLeft size={16} />], ["centre", "Centre text", <TextAlignCenter size={16} />], ["right", "Flush right", <TextAlignRight size={16} />], ["justify", "Justified", <TextAlignJustify size={16} />]] as const).map(([id, name, icon]) => (
            <button key={id} className="chip" aria-pressed={context.align === id} aria-label={name} data-tip={name} data-key={hint(`caption.align.${id}`)} onClick={() => run(`caption.align.${id}`)}>{icon}</button>
          ))}
          {/* The same control as an atom label's: the caption counts as chemistry, or it is text only. */}
          {context.chemical !== undefined && <button className="chip" aria-pressed={context.chemical} aria-label="Interpret chemically" data-tip="Interpret chemically" onClick={() => run("interpret")}><Graph size={16} /></button>}
        </div>
      )}

      {(context.kind === "atom" || context.kind === "structure" || context.kind === "shape") && context.text && (
        // A label styles as text does, as in ChemDraw: the Text menu's styles, font and size on the selected labels,
        // and on a table's cells or a TLC plate's Rf values.
        <div className="chips label-style" role="group" aria-label="Label style">
          {([["bold", "Bold", <TextB size={16} />, context.text.bold], ["italic", "Italic", <TextItalic size={16} />, context.text.italic], ["underline", "Underline", <TextUnderline size={16} />, context.text.underline]] as const).map(([id, name, icon, on]) => (
            <button key={id} className="chip" aria-pressed={on} aria-label={name} data-tip={name} data-key={hint(`caption.${id}`)} onClick={() => run(`caption.${id}`)}>{icon}</button>
          ))}
          <div className="size font"><FontPick label="Font" font={context.text.font} fonts={fonts} onPick={(f) => run(`caption.font.${f}`)} /></div>
          <SizeButton size={context.text.size} sizes={sizes} run={run} />
          {/* Alignment and Interpret Chemically are a label's own: a table's cells and a plate's Rf values have neither. */}
          {context.kind !== "shape" && labelAligns(16).map(([id, name, icon]) => (
            <button key={id} className="chip" aria-pressed={context.text!.align === id} aria-label={name} data-tip={name} onClick={() => run(`caption.align.${id}`)}>{icon}</button>
          ))}
          {context.kind !== "shape" && <button className="chip" aria-pressed={context.text.chemical} aria-label="Interpret chemically" data-tip="Interpret chemically" onClick={() => run("interpret")}><Graph size={16} /></button>}
          <button className="chip" aria-label="Character map" data-tip="Character map" onClick={() => run("char_map")}><span className="glyph-text">αβ</span></button>
        </div>
      )}

      {context.kind === "shape" && context.shape !== "tlc" && context.shape !== "table" && context.shape !== "picture" && (
        <div className="chips arrows" role="group" aria-label="Shape">
          {(isBracket({ kind: context.shape }) ? ["brackets", "parens", "braces"] as ShapeKind[] : ["box", "rounded", "oval", "highlight"] as ShapeKind[]).map((kind) => (
            <button key={kind} className="chip" aria-pressed={context.shape === kind} aria-label={SHAPES[kind]} data-tip={SHAPES[kind]} onClick={() => run(`shape.kind.${kind}`)}>
              <ShapeGlyph kind={kind} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "shape" && !isBracket({ kind: context.shape }) && context.shape !== "highlight" && context.shape !== "tlc" && context.shape !== "table" && context.shape !== "picture" && (() => {
        // The shape's style, drawn as the shape itself in each style.
        const row = context.shape === "oval" ? "oval" : context.shape === "rounded" ? "rounded" : "box";
        return (
          <div className="chips arrows" role="group" aria-label="Style">
            {["plain", "dashed", "shaded", "solid", "faded", "shadow"].map((st) => (
              <button key={st} className="chip" aria-pressed={context.style === st} aria-label={shapeName(`${row}-${st}`)} data-tip={shapeName(`${row}-${st}`)} onClick={() => run(`shape.style.${st}`)}>
                <ElementGlyph v={`${row}-${st}`} />
              </button>
            ))}
            {/* Bold goes with any of them. */}
            <button className="chip" aria-pressed={context.boldLine} aria-label={shapeName(`${row}-bold`)} data-tip={shapeName(`${row}-bold`)} onClick={() => run("shape.boldline")}>
              <ElementGlyph v={`${row}-bold`} />
            </button>
          </div>
        );
      })()}
      {(context.kind === "spot" || (context.kind === "shape" && context.shape === "tlc")) && (
        // A spot's style (or every spot's, from the plate), each drawn as a spot.
        // Its fill (filled, hollow or shaded), then its outline's dashed, bold and doubled, each on or off.
        <div className="chips styles" role="group" aria-label="Spot">
          {SPOT_STYLES.map((st) => (
            <button key={st} className="chip" aria-pressed={context.kind === "spot" && (st === "dashed" || st === "bold" || st === "doubled" ? context[st] : context.style === st)}
              aria-label={`${SPOT_NAMES[st]} spot${context.kind === "spot" ? "" : "s"}`} data-tip={`${SPOT_NAMES[st]} spot${context.kind === "spot" ? "" : "s"}`}
              onClick={() => run(context.kind === "spot" ? `spot.style.${st}` : `shape.spots.${st}`)}>
              <SpotGlyph style={st} />
            </button>
          ))}
        </div>
      )}
      {context.kind === "spot" && (
        <div className="sliders" role="group" aria-label="Size">
          <Slider name="Width" value={context.w} min={0.04} max={1} step={0.01} show={(v) => `${(v * 2 * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.w.${Math.round(v * 100)}`)} />
          <Slider name="Height" value={context.h} min={0.04} max={1} step={0.01} show={(v) => `${(v * 2 * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.h.${Math.round(v * 100)}`)} />
          <Slider name="Tail" value={context.tail} min={0} max={2} step={0.01} show={(v) => `${(v * context.pt).toFixed(1)} pt`} onChange={(v) => run(`spot.tail.${Math.round(v * 100)}`)} />
        </div>
      )}
      {context.kind === "shape" && context.shape === "table" && (() => {
        // The table's lines (a set, then each line on its own), its cells' alignment (the column last typed in, or
        // every column) and the lines' width.
        const same = (a: TableLine[], b: TableLine[]) => a.length === b.length && a.every((x) => b.includes(x));
        const EACH: [TableLine, string][] = [["top", "Top line"], ["header", "Line under the header"], ["rows", "Lines between rows"], ["bottom", "Bottom line"], ["left", "Left line"], ["cols", "Lines between columns"], ["right", "Right line"]];
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Lines">
              {([["journal", "Journal rules"], ["grid", "All lines"], ["box", "Box"], ["none", "No lines"]] as const).map(([id, name]) => (
                <button key={id} className="chip" aria-pressed={same(context.lines, TABLE_LINES[id])} aria-label={name} data-tip={name} onClick={() => run(`shape.lines.${id}`)}><TableGlyph on={TABLE_LINES[id]} faint={id === "none"} /></button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Each line">
              {EACH.map(([id, name]) => (
                <button key={id} className="chip" aria-pressed={context.lines.includes(id)} aria-label={name} data-tip={name} onClick={() => run(`shape.lines.${id}`)}><TableGlyph on={[id]} faint /></button>
              ))}
            </div>
            <div className="chips" role="group" aria-label="Alignment">
              {([["left", "Flush left", <TextAlignLeft size={16} />], ["centre", "Centre text", <TextAlignCenter size={16} />], ["right", "Flush right", <TextAlignRight size={16} />]] as const).map(([id, name, icon]) => (
                <button key={id} className="chip" aria-pressed={context.cellAlign === id} aria-label={name} data-tip={name} onClick={() => run(`shape.align.${id}`)}>{icon}</button>
              ))}
            </div>
            <div className="sliders" role="group" aria-label="Lines">
              <Slider name="Line width" value={context.weight} min={0.1} max={4} step={0.05} show={(v) => `${v.toFixed(2)} pt`} onChange={(v) => run(`lines.weight.${Math.round(v * 100)}`)} />
            </div>
          </>
        );
      })()}
      {context.kind === "shape" && context.style === "shadow" && (
        // The shadow's depth (how far it falls), softness and opacity, each on a slider.
        <div className="sliders" role="group" aria-label="Shadow">
          <Slider name="Depth" value={context.shade.depth} min={0} max={0.5} step={0.01} show={(v) => `${(v * context.shade.pt).toFixed(1)} pt`} onChange={(v) => run(`shape.depth.${Math.round(v * 100)}`)} />
          <Slider name="Softness" value={context.shade.blur} min={0} max={0.5} step={0.01} show={(v) => `${(v * context.shade.pt).toFixed(1)} pt`} onChange={(v) => run(`shape.blur.${Math.round(v * 100)}`)} />
          <Slider name="Opacity" value={context.shade.opacity} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(v) => run(`shape.opacity.${Math.round(v * 100)}`)} />
        </div>
      )}
      {context.kind === "shape" && isBracket({ kind: context.shape }) && (() => {
        // Both brackets or one, and the sign at the top right: drawn as they read.
        const [l, r] = context.shape === "parens" ? ["(", ")"] : context.shape === "braces" ? ["{", "}"] : ["[", "]"];
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Sides">
              {([["both", `${l} ${r}`, "Both"], ["left", l, "Left only"], ["right", r, "Right only"]] as const).map(([id, text, name]) => (
                <button key={id} className="chip" aria-pressed={context.side === id} aria-label={name} data-tip={name} onClick={() => run(`shape.side.${id}`)}><span className="glyph-text">{text}</span></button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Sign">
              {["‡", "†", "+", "–", "n"].map((m) => (
                <button key={m} className="chip" aria-pressed={context.mark === m} aria-label={m === "n" ? "Repeat count n" : m} data-tip={m === "n" ? "Repeat count n" : m} onClick={() => run(`shape.mark.${m}`)}><span className="glyph-text">{m}</span></button>
              ))}
            </div>
          </>
        );
      })()}

      {context.kind === "arrow" && context.orbital && (() => {
        // The orbital's shape, and its phases, each drawn as itself.
        const o = context.orbital;
        return (
          <>
            <div className="chips arrows" role="group" aria-label="Orbital">
              {ORBITAL_SHAPES.map((shape) => (
                <button key={shape} className="chip" aria-pressed={o.shape === shape} aria-label={orbitalName(`${shape}-plain`)} data-tip={orbitalName(`${shape}-plain`)} onClick={() => run(`orbital.shape.${shape}`)}>
                  <OrbitalGlyph v={`${shape}-${o.phase === "phased" && !["p", "d", "dz2", "hybrid"].includes(shape) ? "filled" : o.phase}`} />
                </button>
              ))}
            </div>
            <div className="chips arrows" role="group" aria-label="Phase">
              {PHASES.filter((ph) => ph !== "phased" || ["p", "d", "dz2", "hybrid"].includes(o.shape)).map((ph) => (
                <button key={ph} className="chip" aria-pressed={o.phase === ph} aria-label={orbitalName(`${o.shape}-${ph}`)} data-tip={orbitalName(`${o.shape}-${ph}`)} onClick={() => run(`orbital.phase.${ph}`)}>
                  <OrbitalGlyph v={`${o.shape}-${ph}`} />
                </button>
              ))}
            </div>
          </>
        );
      })()}
      {kindNow && (
        // The arrow's kind, the choice made most: reaction, equilibrium (and unbalanced), resonance, retrosynthetic,
        // no-go, dipole, block, then the curved ones.
        <div className="chips arrows" role="group" aria-label="Arrow">
          {kindChoices(context).map((o) => (
            <button key={o.id} className="chip" aria-pressed={kindNow === o.id} aria-label={o.name} data-tip={o.name} onClick={() => run(`arrow.kind.${o.id}`)}>{o.glyph}</button>
          ))}
        </div>
      )}
      {arrowPicks(context).map((g) => (
        // The rest of ChemDraw's Curves menu, one small button each (arrowPicks): the line, the head at each end, the
        // heads' shape, the curve's sweep, the size and a closed curve's fill; a cycle's side arrow, its heads and a
        // step's balance. Each shows its choice; a click opens the others.
        <div key={g.label} className="picks" role="group" aria-label={g.label}>
          {g.picks.map((p) => <PickButton key={p.command} label={p.label} value={p.value} onPick={(v) => run(`${p.command}.${v}`)} options={choices(p, context)} />)}
        </div>
      ))}
      {((context.kind === "shape" && context.shape !== "highlight" && context.shape !== "table" && context.style !== "solid" && context.style !== "shaded") || context.kind === "arrow" || context.kind === "cycle" || (context.kind === "selection" && context.width !== undefined)) && (
        // The width of the lines, for every object drawn in lines, and for lines picked together (a table's is with its
        // lines, above).
        <div className="sliders" role="group" aria-label="Lines">
          <Slider name="Line width" value={context.kind === "shape" ? context.weight : context.width!} min={0.05} max={4} step={0.05} show={(v) => `${v.toFixed(2)} pt`} onChange={(v) => run(`lines.weight.${Math.round(v * 100)}`)} />
          {context.kind === "cycle" && <Slider name="Gap" value={context.gap} min={0} max={24} step={0.5} show={(v) => `${v.toFixed(1)} pt`} onChange={(v) => run(`cycle.gap.${Math.round(v * 10)}`)} />}
        </div>
      )}
      {scale !== undefined && <ScaleField scale={scale} run={run} />}
      {colour && (
        // Colour is a section of its own, titled like the sets below, and set off from the main rows.
        <Fold id="colour" title="Colour" className="colour-block" folded={folded.includes("colour")} onFold={onFold} folds={folds}>
        {/* One colour row for every kind of selection. A highlight takes a pale fill; anything else an ink colour. */}
        {/* A swatch pressed keeps the focus where it is, so a caption or label being typed stays open and takes the colour. */}
        <div className="swatches small" role="radiogroup" aria-label="Colour" onMouseDown={(e) => e.preventDefault()}>
          {[...(colour.tints ? TINTS : COLOURS), ...palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => (
            <button key={`${name}${hex}`} role="radio" aria-checked={colour.value.toLowerCase() === hex.toLowerCase()} aria-label={name} data-tip={name} className="swatch" style={{ background: hex }} onClick={() => run(`colour.${hex}`)} />
          ))}
          <button className="swatch custom" data-tip="Add a colour" aria-label="Add a colour" onClick={() => run("colours_add")}><PlusIcon size={12} aria-hidden /></button>
        </div>
        {(context.kind === "structure" || context.kind === "atom" || context.kind === "bond") && (() => {
          // Highlight (the selected atoms and the bonds between them) and ring fill (each ring on its own), each a
          // labelled button with its colours and a custom colour.
          const swatch = (c: string) => <span className="pick-swatch" style={{ background: c }} />;
          const options = (list: [string, string][], value?: string) => [{ id: "none", name: "None", glyph: <span className="pick-swatch none" /> }, ...list.map(([name, hex]) => ({ id: hex, name, glyph: swatch(hex) })),
            ...(value && !list.some(([, hex]) => hex.toLowerCase() === value.toLowerCase()) ? [{ id: value, name: "Custom", glyph: swatch(value) }] : [])];
          return (
            <div className="picks" role="group" aria-label="Highlight and ring fill">
              <PickButton label="Highlight" value={context.halo ?? "none"} options={options(HIGHLIGHT_COLOURS, context.halo)} onPick={(v) => run(`halo.${v}`)} onCustom={(hex) => run(`halo.${hex}.drag`)} />
              {(context.kind !== "bond" || context.ring) && <PickButton label="Ring fill" value={context.fill ?? "none"} options={options(RING_FILLS, context.fill)} onPick={(v) => run(`ringfill.${v}`)} onCustom={(hex) => run(`ringfill.${hex}.drag`)} />}
            </div>
          );
        })()}
        </Fold>
      )}


      {(rows.length > 0 || (menus && sets.length > 0) || carry) && (
        <div className="actions-list">
          {rows.map((i, k) => (
            <div key={i.command} data-command={i.command} className={["action-slot", carry?.command === i.command && "carried", settled === i.command && "settled"].filter(Boolean).join(" ")}
              data-gap={carry?.to?.rows && rows.filter((r) => r.command !== carry.command).indexOf(i) === carry.to.index ? "" : undefined}
              onPointerDown={(e) => startCarry(e, i.command)} onClickCapture={(e) => { if (dragged.current) { e.stopPropagation(); dragged.current = false; } }}>
              <Row icon={i.icon} name={i.name} command={i.command} hint={hint(i.command)} run={run} accent={i.accent} />
              {k === rows.length - 1 && carry?.to?.rows && carry.to.index >= rows.filter((r) => r.command !== carry.command).length && <span className="drop-line end" aria-hidden />}
            </div>
          ))}
          {menus && sets.map(([s, list]) => s === "delete" ? <Row key={s} icon={list[0].icon} name={list[0].name} command={list[0].command} hint={hint(list[0].command)} run={run} /> : (
            <button key={s} className="action submenu-row" aria-haspopup="menu" aria-expanded={sub?.set === s}
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect(), p = panel.current!.getBoundingClientRect();
                setSub(sub?.set === s ? undefined : { set: s, top: r.top - 5, right: innerWidth - p.left + 8 });
              }}>
              {SET_ICONS[s]}
              <span className="action-name">{SET_TITLES[s]}</span>
              <CaretRight size={12} className="submenu-caret" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <Exit>{menus && sub && (() => {
        const list = sets.find(([s]) => s === sub.set)?.[1];
        if (!list) return null;
        const groups = sub.set === "more" ? MORE_GROUPS.map((k) => list.filter((i) => kindOf(i.command) === k)) : [list];
        return (
          <div ref={subBox}>
            <Menu label={SET_TITLES[sub.set]} className="panel-submenu" columns={1} style={{ position: "fixed", top: sub.top, right: sub.right, left: "auto" }}
              groups={groups.map((g) => g.map((i) => ({ key: i.command, name: i.short ?? i.name, icon: i.icon })))}
              onChoose={(command) => { setSub(undefined); run(command); }} />
          </div>
        );
      })()}</Exit>

      {((!menus && sets.length > 0) || carry) && (
        <div className={carry && !carry.to?.rows && carry.to ? "tray receiving" : "tray"} role="toolbar" aria-label="More actions">
          {sets.map(([s, set]) => {
            const buttons = (
            <div className="tray-buttons">
            {set.map((i) => (
            <button
              key={i.command}
              data-command={i.command}
              className={["tray-button", i.command === "delete" && "delete", i.accent && "accent", carry?.command === i.command && "carried", settled === i.command && "settled"].filter(Boolean).join(" ")}
              aria-label={i.name}
              data-tip={i.name}
              data-key={hint(i.command)}
              onPointerDown={(e) => startCarry(e, i.command)}
              onClick={() => { if (dragged.current) { dragged.current = false; return; } run(i.command); }}
            >
              {i.icon}
            </button>
            ))}
            </div>
            );
            // Every section of small buttons has its title and folds, however many buttons it has. Delete is the one
            // exception (Sam, 4 November 2026): the panel's last small button, with no title, always on show.
            return s === "delete" ? <div key={s} className="tray-set delete-set" role="group" aria-label={SET_TITLES[s]}>{buttons}</div>
              : <Fold key={s} id={s} title={SET_TITLES[s]} className="tray-set" folded={folded.includes(s)} onFold={onFold} folds={folds}>{buttons}</Fold>;
          })}
        </div>
      )}
      {/* Settings is always last, with Home beside it. */}
      <div className="actions-foot">
        <button className="actions-settings" onClick={() => run("settings")}>
          <GearSix size={16} aria-hidden />
          <span>Settings</span>
          {hint("settings") && <kbd>{hint("settings")}</kbd>}
        </button>
        <button className="actions-home" aria-label="Home" data-key={hint("home")} onClick={() => run("home")}>
          <House size={16} aria-hidden />
        </button>
      </div>
      {carry && (() => {
        const i = items.find((x) => x.command === carry.command);
        return i && <span className="action-carry" style={{ left: carry.x, top: carry.y }} aria-hidden>{i.icon}<span>{i.name}</span></span>;
      })()}
    </section>
  );
}

// Right-click (or Control-click, or the Menu key or Shift+F10): the Actions panel as a short menu at the pointer, so
// nothing lives only here (Sam: no options buried under right-click). Its rows come first, then each set of small
// actions as one row that opens the set beside it, then Add to templates (which opens My templates and the user's
// sets), Add to dictionary…, Colour, a label's Alignment and Delete. An arrow's, a cycle's or a cycle's side arrow's picks
// (Kind, Line, Start, End, Heads, Size, Fill and so on, as the panel shows them) come before Add to templates.
type MenuProps = Pick<Props, "context" | "messy" | "hiddenWarnings" | "warned" | "grouping" | "layout" | "hint" | "run" | "colour" | "palette" | "online"> & { at: { x: number; y: number }; keyboard?: boolean; templateSets: string[]; onClose: () => void };
export function ActionsMenu({ at, keyboard, context, messy, hiddenWarnings, warned, grouping, layout, hint, run, colour, palette, online, templateSets, onClose }: MenuProps) {
  const { rows, sets } = arrangedActions(context, messy, hiddenWarnings, warned, grouping, layout, online);
  const item = (i: Item): MenuItem => ({ key: i.command, name: i.short ?? i.name, icon: i.icon, hint: hint(i.command) });
  const keep = (list: readonly Item[]) => list.filter((i) => i.command !== "template.add" && i.command !== "dictionary.add");
  const all = [...rows, ...sets.flatMap(([, list]) => list)], kept = all.find((i) => i.command === "template.add"), dict = all.find((i) => i.command === "dictionary.add");
  const del = sets.find(([s]) => s === "delete")?.[1] ?? [];
  // Selected atom labels: their alignment (the label chips' own, as a menu).
  const aligned = (context.kind === "atom" || context.kind === "structure") && context.text ? context.text.align ?? "auto" : undefined;
  // An arrow's kind and its picks, a cycle's and its side arrow's: the Actions panel's, from the same lists, each as a
  // row that opens its choices with the one picked ticked.
  const kind = arrowKind(context), picks = arrowPicks(context).flatMap((g) => g.picks), kinds = kind ? kindChoices(context) : [];
  const pickRows: MenuItem[] = [...(kind ? [{ key: "pick:arrow.kind", name: "Kind", icon: kinds.find((o) => o.id === kind)?.glyph, more: true }] : []),
    ...picks.map((p) => ({ key: `pick:${p.command}`, name: p.label, icon: choices(p, context).find((o) => o.id === p.value)?.glyph, more: true }))];
  const groups: MenuItem[][] = [keep(rows).map(item), sets.filter(([s, list]) => s !== "delete" && keep(list).length).map(([s]) => ({ key: `set:${s}`, name: SET_TITLES[s], icon: SET_ICONS[s], more: true })), pickRows,
    [...(kept ? [{ key: "templates", name: kept.name, icon: kept.icon, more: true }] : []), ...(dict ? [item(dict)] : []), ...(colour ? [{ key: "set:colour", name: "Colour", icon: <Palette size={18} />, more: true }] : []),
    ...(aligned ? [{ key: "set:align", name: "Alignment", icon: <TextAlignLeft size={18} />, more: true }] : []), ...del.map(item)]];
  // The open set's actions (Display and copy in its kinds' groups), the sets a template can go in, or the colours.
  const sub = (key: string) => {
    if (key === "templates") return { label: "Add to templates", groups: setItems(templateSets, (set) => `template.add:${set}`, "template.add.new") };
    if (key === "pick:arrow.kind") return { label: "Kind", groups: [kinds.map((o) => ({ key: `arrow.kind.${o.id}`, name: o.name, icon: o.glyph, checked: kind === o.id }))] };
    const p = picks.find((q) => `pick:${q.command}` === key);
    if (p) return { label: p.label, groups: [choices(p, context).map((o) => ({ key: `${p.command}.${o.id}`, name: o.name, icon: o.glyph, checked: p.value === o.id }))] };
    if (key === "set:align") return { label: "Alignment", groups: [labelAligns(18).map(([id, name, icon]) => ({ key: `caption.align.${id}`, name, icon, checked: aligned === id }))] };
    if (key === "set:colour") return { label: "Colour", groups: [[...(colour?.tints ? TINTS : COLOURS), ...palette.map((c): [string, string] => [c.name, c.hex])].map(([name, hex]) => ({ key: `colour.${hex}`, name, icon: <span className="pick-swatch" style={{ background: hex }} />, checked: colour?.value.toLowerCase() === hex.toLowerCase() }))] };
    const list = keep(sets.find(([s]) => `set:${s}` === key)?.[1] ?? []);
    return { label: SET_TITLES[key.slice(4) as SetId], groups: key === "set:more" ? MORE_GROUPS.map((k) => list.filter((i) => kindOf(i.command) === k).map(item)) : [list.map(item)] };
  };
  return <ContextMenu label="Actions" at={at} keyboard={keyboard} groups={groups} sub={sub} onChoose={run} onClose={onClose} />;
}
