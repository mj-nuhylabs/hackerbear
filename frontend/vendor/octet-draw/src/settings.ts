// User settings, kept on this computer. Every default here is the one a new user gets.
// snap: snap moved structures to others. snapGrid: snap what is moved or placed to the grid, while it shows.
// guides: whether new drawings (and drawings from other programs) show the grid, the rulers and the crosshair: the
// last choice in the View menu, as ChemDraw keeps its own. rulerUnit: the rulers' unit.
// eraser: eraser radius in bond lengths. keys: the user's shortcut changes.
// variants: the bond and ring each tool had last.
// strips: the width each tool's options strip was dragged to. actions: whether the Actions panel is open.
// templates: the user's own rings. pinned: options dragged onto the toolbar, as "tool:variant".
// actionLayout: for each kind of selection, the user's order of Actions panel actions and how many show as rows.
// curvedArrows: the curved arrows kept in the Arrow strip, as "kind-sweep".
// folded: the Actions panel's titled sections folded to their title, by set ("turn", "colour"), for every kind of
// selection. A new user has every section open.
import { readPalettes, readSize, type FloatingPalette, type SavedTemplate, type TemplateSize } from "./templates";
import type { OwnName } from "./names";
import { QUICK, readPurposes, type DocStyle, type OwnPurpose, type PurposeKind } from "./docstyle";
import { DEFAULT_FILES, type FilePrefs } from "./SettingsWindow";
import { DPI_MIN, DPI_MAX, PICTURES } from "./export";
import { WARNING_TYPES, type WarningType } from "./check";
import { MS_DEFAULTS, readMsPrefs, type MsPrefs } from "./msanalysis";
import type { LabelTurn } from "./spectrumplot";
import { readLayout, type HomeLayout } from "./homeLayout";
import { CURSOR_INKS, type CursorInk } from "./cursor";
import { readSelectColour, SELECT_DEFAULT } from "./selectcolour";

const inRange = (n: unknown, lo: number, hi: number) => typeof n === "number" && n >= lo && n <= hi;

export type Settings = {
  snap: boolean; snapGrid: boolean; guides: { grid: boolean; rulers: boolean; crosshair: boolean }; rulerUnit: RulerUnit; eraser: number; keys: Record<string, string[]>; variants: { select: string; bond: string; ring: string; template: string; symbol: string; orbital: string; arrow: string; cycle: string; sequence: string; shape: string; bracket: string; more: string };
  strips: Record<string, number>; actions: boolean; templates: SavedTemplate[]; pinned: string[];
  actionLayout: Record<string, { order: string[]; rows: number }>;
  layoutVersion: number; // the Actions panel's layout scheme the saved actionLayout was made for
  folded: string[];
  panelMenus: boolean; // the Actions panel's sets of small actions as titled rows that open menus, not sections of buttons
  captionOptionReturn: boolean; // ChemDraw's "Require Option+Return to create new line in Captions": Return then closes the box
  labelReturnNewLine?: boolean; // ChemDraw's "Require Option+Return to create new line in Atom labels" off: Return makes a new line (unset: Option-Return)
  // Home: the user's name (null until asked; "" when they skipped it), whether the tutorial was seen, and when Octet
  // was last opened (ms), for "Welcome back". homeLayout: Home's sections in the user's order, and those folded to
  // their heading (src/homeLayout.ts).
  userName: string | null; tutorialDone: boolean; lastSeen: number; homeLayout: HomeLayout;
  seenNotes: string; // the version whose notes (releases.ts) the user has seen, so they show once after an update
  updates: boolean; // check for updates when Octet opens: on unless the user turns it off in Settings (decision 0010)
  warnings: boolean; // View > Show Chemical Warnings: problems marked on the drawing and listed in Actions
  warningTypes: Partial<Record<WarningType, boolean>>; // Settings > Warnings: each kind switched on or off (unset: its default)
  checkCopy: boolean; // ChemDraw's "Check Structure When Copying to Clipboard or Exporting"
  pairBars: boolean; // new lone pairs drawn as bars (lines), as some countries draw Lewis structures; Option-click still switches
  outlines: boolean; // Settings > Page edges: All sizes (the other sizes the purpose gives, such as journal columns, show with the page) or Page only
  windows: boolean; // each drawing in a window of its own, with Home in its own (decision 0020); off: one window
  // What new drawings are for (IDEA-SIZE-1): Quick start or the purpose ⌘N starts (the last one picked; Return on
  // Home starts Quick start), the style of Quick start and of each built-in purpose when the user made it their own
  // with "Use for new documents", and the user's own purposes (templates).
  purpose: string; purposeStyles: Partial<Record<PurposeKind | typeof QUICK, DocStyle>>; ownPurposes: OwnPurpose[];
  files: FilePrefs; // export, copy and import preferences
  settingsModule: string; // the Settings module last open
  curvedArrows: string[];
  libraryRings: string[]; // library templates kept in the Ring strip, as "lib:name"
  palettes: FloatingPalette[]; // template sets open as floating palettes, each where it was left (the last on top)
  librarySize: TemplateSize; // the size of the templates in the template library (each floating palette has its own)
  dictionary: OwnName[]; // the user's own names for structures (Structure > Add Structure to Dictionary), in the order added
  templateSets: string[]; // the user's named template sets, in order (My templates is always first and not listed)
  nameHistory: { name: string; smiles: string }[]; // names drawn with Name to structure, newest first (50 at most), each with its structure
  paletteWide: boolean; // the toolbar in two columns
  palette: Swatch[]; // the user's own colours, named, after Octet's in every colour row and the Colour menu (20 at most)
  elementColours: Record<string, string>; // Colour by Element: the user's colour for an element, where it differs from Octet's
  properties: boolean; // the Chemical Properties panel is open
  propertyRows: string[]; // the rows Add to drawing writes under a structure
  decimals?: number; // Properties > Decimals: places for the exact mass, molecular weight and m/z (0 to 8); unset is 4, 2 and 2
  nmrMhz: number; nmrSolvent: string; nmrSolventPeaks: boolean; nmrDetails: boolean; // the predicted spectrum's frequency (¹H, MHz), solvent, and whether its peaks show
  nmrLabels: LabelTurn; // the Spectrum panel's Labels: peak labels across, turned (read bottom to top) or Auto (turned when crowded)
  massSpec: MsPrefs; // the Mass spec panel's mode, ion, charge state, source, calculated peak and match tolerance
  scaleLabels: boolean; // Scale…'s Labels and lines: label sizes and line widths scale with the positions (decision 0007)
  onlineSearch: boolean; // Search Reaxys and Search PubChem are offered (decision 0008); off hides them everywhere
  interpretation: boolean; // View > Show Reaction Interpretation: pointing at a reaction shows what each part of it is
  // ChemDraw's Object > Fixed Lengths and Fixed Angles: a dragged bond, ring or arrow is one bond length long and at a
  // 15° step (Option frees it while it is held). sproutRings: ChemDraw's "Sprout Rings Instead of Spiro When Clicking".
  fixedLengths: boolean; fixedAngles: boolean; sproutRings: boolean;
  clickTriple: boolean; // a bond tool's click on a plain double bond makes it triple, and on a triple single (ChemDraw's clicks move the second line)
  // ChemDraw's preferences (CH-34). autoMap: Automatic Reaction Mapping (a pair mapped with the Atom map tool maps the
  // rest of its reaction). stereoParens: Include Parentheses When Showing Stereochemistry. hideAbs: Hide Absolute
  // Stereoflags. mdlFlags: Show Stereoflags When Opening MDL Format Files (the chiral flag as abs or &1 flags).
  // aromaticOnOpen: Normalize Aromatic Display (on opening and importing: alternating bonds or circles; "" leaves
  // each structure as the file has it).
  autoMap: boolean; stereoParens: boolean; hideAbs: boolean; mdlFlags: boolean; aromaticOnOpen: "" | "kekule" | "circles";
  cursor: CursorInk; // Settings > General > Cursor: Octet's cursors black, white, or the one that shows on the page
  selectColour: string; // Settings > General > Selection: the selection's colour, #RRGGBB (selectcolour.ts)
  sequenceLabels: boolean; // the name field's Residue labels: a sequence drawn as H–Ala–Cys–OH (sequence.ts residues)
};
export type Swatch = { name: string; hex: string };
export type RulerUnit = "mm" | "cm" | "in" | "pt" | "pc";
export const RULER_UNITS: [RulerUnit, string][] = [["mm", "Millimetres"], ["cm", "Centimetres"], ["in", "Inches"], ["pt", "Points"], ["pc", "Picas"]];
const DEFAULTS: Settings = { snap: true, snapGrid: false, guides: { grid: false, rulers: false, crosshair: false }, rulerUnit: "mm", eraser: 0.15, keys: {}, variants: { select: "box", bond: "single", ring: "benzene", template: "lib:Alanine", symbol: "plus", orbital: "p-shaded", arrow: "reaction", cycle: "circle", sequence: "peptide", shape: "box-plain", bracket: "brackets", more: "tlc" }, strips: {}, actions: true, templates: [], pinned: [], actionLayout: {}, layoutVersion: 3, folded: [], panelMenus: false, captionOptionReturn: false, userName: null, tutorialDone: false, seenNotes: "", homeLayout: readLayout([], []), updates: true, warnings: true, warningTypes: {}, checkCopy: false, pairBars: false, outlines: true, windows: true, lastSeen: 0, purpose: QUICK, purposeStyles: {}, ownPurposes: [], files: DEFAULT_FILES, settingsModule: "document", curvedArrows: ["curved-120", "fishhook-120"], libraryRings: [], palettes: [], librarySize: "medium", dictionary: [], templateSets: [], nameHistory: [], paletteWide: false, palette: [], elementColours: {}, properties: false, propertyRows: ["formula", "weight"], nmrMhz: 400, nmrSolvent: "CDCl₃", nmrSolventPeaks: true, nmrDetails: false, nmrLabels: "auto", massSpec: MS_DEFAULTS, scaleLabels: true, onlineSearch: true, fixedLengths: true, fixedAngles: true, sproutRings: false, clickTriple: false, interpretation: false, autoMap: true, stereoParens: true, hideAbs: false, mdlFlags: false, aromaticOnOpen: "", cursor: "auto", selectColour: SELECT_DEFAULT, sequenceLabels: false };
export const SETTINGS_KEY = "octet.settings";
const KEY = SETTINGS_KEY;

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const list = <T,>(v: unknown, ok: (x: unknown) => boolean) => (Array.isArray(v) ? (v.filter(ok) as T[]) : []);
    return {
      // The Cycle tool's Reagent in and Product out (Octet 1.0.29) are its Catalytic cycle now: side arrows pull out of it.
      ...DEFAULTS, ...saved, variants: { ...DEFAULTS.variants, ...saved.variants, ...(["in", "out"].includes(saved.variants?.cycle) ? { cycle: "circle" } : {}) },
      templates: list<SavedTemplate>(saved.templates, (t) => typeof t === "object" && t !== null),
      pinned: list<string>(saved.pinned, (k) => typeof k === "string"),
      libraryRings: list<string>(saved.libraryRings, (k) => typeof k === "string"),
      templateSets: list<string>(saved.templateSets, (k) => typeof k === "string" && !!k.trim() && k.length <= 40).slice(0, 50),
      palettes: readPalettes(saved.palettes),
      librarySize: readSize(saved.librarySize),
      dictionary: list<OwnName>(saved.dictionary, (n) => typeof n === "object" && n !== null && typeof (n as OwnName).name === "string" && !!(n as OwnName).name.trim() && (n as OwnName).name.length <= 80
        && typeof (n as OwnName).smiles === "string" && !!(n as OwnName).smiles && (n as OwnName).smiles.length <= 4000 && ((n as OwnName).inchi === undefined || typeof (n as OwnName).inchi === "string")).slice(0, 2000),
      nameHistory: (Array.isArray(saved.nameHistory) ? saved.nameHistory : []).flatMap((k: unknown) =>
        typeof k === "string" ? [{ name: k, smiles: "" }] : typeof k === "object" && k && typeof (k as { name?: unknown }).name === "string" && typeof (k as { smiles?: unknown }).smiles === "string" ? [k as { name: string; smiles: string }] : [],
      ).filter((k: { name: string; smiles: string }) => k.name.length <= 300 && k.smiles.length <= 2000).slice(0, 50),
      curvedArrows: Array.isArray(saved.curvedArrows) ? list<string>(saved.curvedArrows, (k) => typeof k === "string") : DEFAULTS.curvedArrows,
      ...readPurposes(saved),
      // A saved 350 dpi is the old default, not a choice: it moves to the new default. A dpi or JPEG quality out of
      // range (the quality a whole number, as Rust reads it), or a background Octet does not have, takes the default.
      files: { ...DEFAULT_FILES, ...(typeof saved.files === "object" && saved.files ? saved.files : {}), ...(saved.files?.dpi === 350 || !inRange(saved.files?.dpi, DPI_MIN, DPI_MAX) ? { dpi: DEFAULT_FILES.dpi } : {}),
        ...(Number.isInteger(saved.files?.quality) && inRange(saved.files.quality, 1, 100) ? {} : { quality: DEFAULT_FILES.quality }), ...(["white", "transparent", "page"].includes(saved.files?.background) ? {} : { background: DEFAULT_FILES.background }), clipboard: { ...DEFAULT_FILES.clipboard, ...(saved.files?.clipboard ?? {}) }, saveAs: saved.files?.saveAs === "cdxml" ? "cdxml" : "oct", quick: PICTURES.includes(saved.files?.quick) ? saved.files.quick : DEFAULT_FILES.quick },
      paletteWide: saved.paletteWide === true,
      warningTypes: Object.fromEntries(WARNING_TYPES.flatMap((w) => (typeof saved.warningTypes?.[w.id] === "boolean" ? [[w.id, saved.warningTypes[w.id]]] : []))),
      checkCopy: saved.checkCopy === true,
      windows: saved.windows !== false, outlines: saved.outlines !== false, pairBars: saved.pairBars === true,
      snapGrid: saved.snapGrid === true,
      // Settings from before Show Grid: Gridlines set (a step in mm) in the default style, or in the style of the
      // purpose New starts, shows the grid.
      guides: { grid: saved.guides ? saved.guides.grid === true : [saved.docStyle, saved.purposeStyles?.[saved.purpose ?? "paper"]].some((st) => typeof st?.grid === "number" && st.grid > 0), rulers: saved.guides?.rulers === true, crosshair: saved.guides?.crosshair === true },
      rulerUnit: RULER_UNITS.some(([u]) => u === saved.rulerUnit) ? saved.rulerUnit : DEFAULTS.rulerUnit,
      properties: saved.properties === true,
      nmrMhz: typeof saved.nmrMhz === "number" && saved.nmrMhz >= 20 && saved.nmrMhz <= 1500 ? saved.nmrMhz : DEFAULTS.nmrMhz,
      nmrSolvent: typeof saved.nmrSolvent === "string" && saved.nmrSolvent.length < 20 ? saved.nmrSolvent : DEFAULTS.nmrSolvent,
      nmrSolventPeaks: saved.nmrSolventPeaks !== false,
      nmrDetails: saved.nmrDetails === true,
      nmrLabels: saved.nmrLabels === "horizontal" || saved.nmrLabels === "vertical" ? saved.nmrLabels : "auto",
      massSpec: readMsPrefs(saved.massSpec),
      fixedLengths: saved.fixedLengths !== false, fixedAngles: saved.fixedAngles !== false, sproutRings: saved.sproutRings === true, clickTriple: saved.clickTriple === true,
      autoMap: saved.autoMap !== false, stereoParens: saved.stereoParens !== false, hideAbs: saved.hideAbs === true, mdlFlags: saved.mdlFlags === true,
      aromaticOnOpen: saved.aromaticOnOpen === "kekule" || saved.aromaticOnOpen === "circles" ? saved.aromaticOnOpen : "",
      cursor: CURSOR_INKS.some(([c]) => c === saved.cursor) ? saved.cursor : DEFAULTS.cursor,
      selectColour: readSelectColour(saved.selectColour),
      scaleLabels: saved.scaleLabels !== false,
      onlineSearch: saved.onlineSearch !== false,
      interpretation: saved.interpretation === true,
      decimals: Number.isInteger(saved.decimals) && saved.decimals >= 0 && saved.decimals <= 8 ? saved.decimals : undefined,
      propertyRows: Array.isArray(saved.propertyRows) ? list<string>(saved.propertyRows, (k) => typeof k === "string" && k.length < 20).slice(0, 30) : DEFAULTS.propertyRows,
      elementColours: Object.fromEntries(Object.entries(typeof saved.elementColours === "object" && saved.elementColours ? saved.elementColours : {}).filter(([k, v]) => /^[A-Z][a-z]?$/.test(k) && typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v))) as Record<string, string>,
      palette: list<Swatch>(saved.palette, (c) => typeof c === "object" && c !== null && typeof (c as Swatch).name === "string" && /^#[0-9a-f]{6}$/i.test((c as Swatch).hex)).slice(0, 20),
      // Layouts arranged before the panel's sub-menus (17 October 2026) start again from the new defaults.
      actionLayout: saved.layoutVersion === 3 && typeof saved.actionLayout === "object" && saved.actionLayout !== null && !Array.isArray(saved.actionLayout) ? saved.actionLayout : {},
      layoutVersion: 3,
      folded: list<string>(saved.folded, (k) => typeof k === "string" && k.length <= 20).slice(0, 40),
      panelMenus: saved.panelMenus === true,
      captionOptionReturn: saved.captionOptionReturn === true,
      labelReturnNewLine: saved.labelReturnNewLine === true,
      userName: typeof saved.userName === "string" ? saved.userName.slice(0, 40) : null,
      tutorialDone: saved.tutorialDone === true,
      seenNotes: typeof saved.seenNotes === "string" && saved.seenNotes.length <= 20 ? saved.seenNotes : "",
      homeLayout: readLayout(saved.homeLayout?.order, saved.homeLayout?.folded),
      updates: typeof saved.updates === "boolean" ? saved.updates : true,
      lastSeen: typeof saved.lastSeen === "number" && Number.isFinite(saved.lastSeen) ? saved.lastSeen : 0,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(s: Settings) {
  try {
    // Every window keeps the same settings: a change here reaches the others as a storage event (Editor.tsx).
    const text = JSON.stringify(s);
    if (localStorage.getItem(KEY) !== text) localStorage.setItem(KEY, text);
  } catch {
    // Storage can be unavailable; the setting then lasts for this session only.
  }
}
