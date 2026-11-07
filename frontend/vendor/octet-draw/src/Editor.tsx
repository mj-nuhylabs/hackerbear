import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwise, ArrowCounterClockwise, ArrowsOutSimple, Atom as AtomIcon, Dna, Graph as GraphIcon, SelectionInverse, Cube, Flask, Circle, Square, BoundingBox, SelectionSlash, AlignLeft, AlignRight, AlignTop, AlignBottom,
  AlignCenterHorizontal, AlignCenterVertical, ArrowsOutLineHorizontal, ArrowsOutLineVertical, Eraser, FileArrowDown, FileArrowUp, FilePlus, FlipHorizontal, FlipVertical, FloppyDisk, FolderOpen, FrameCorners,
  GearSix, Keyboard, Lasso, MagicWand, MagnifyingGlassMinus, MagnifyingGlassPlus, Selection, SelectionAll, SlidersHorizontal, TextAlignCenter, TextAlignJustify, TextAlignLeft, TextAlignRight, TextAa,
  TextB, TextItalic, TextT, TextUnderline, Warning, Stack, StackSimple, ArrowsDownUp, FileText, CaretDown, ClockCounterClockwise, X, Info, Printer, Export as ExportIcon, Hash, ArrowsInSimple, Table,
  FileDashed, ArrowsLeftRight, Angle, CornersOut, Faders, FloppyDiskBack, Broom, Files, Unite, MagnetStraight, Paragraph, Resize, Ruler, GridFour, CrosshairSimple, Swatches, DotsNine, CompassTool, ArrowsVertical,
  EyeSlash, Crosshair, Repeat, CubeTransparent, ArrowsMerge, ArrowsInCardinal, FadersHorizontal, CaretLineUp, Sparkle, PencilRuler, CloudArrowDown, Bug, GraduationCap, CopySimple, IdentificationBadge, Key, FileCode, FileTxt, Notepad,
  File as PageIcon, CheckCircle, Asterisk, AsteriskSimple, BracketsSquare, SquaresFour, FlowArrow, BracketsRound,
  TreeStructure, StarFour, Lightbulb, Prohibit, SelectionForeground, PaintRoller, WarningDiamond, TextTSlash, NotePencil, ArrowSquareOut, ImageSquare, MarkdownLogo, Notebook,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "./listen";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { chemicalText, labelSmiles, GROUPS } from "./labels";
import { analyse, chiralFlagOnly, structures, expandWithOrigins, stereoFacts, stereoLabels, smilesWeight, toMolfile, toReaction, toSdf, toInchiKey, type RxnStep, type Structure, cipOf, cleanUp, MOST_CLEAN, expandLabels, fragmentMasses, mapReaction, importStructure, toInchi, toInchiAux, measurer, parseStructure, ready, STYLE, textExtent, textWidth, toSmiles } from "./chem";
import { MAX_PRINT_PAGES, MAX_PURPOSES, PURPOSES, QUICK, edgeAt, pagesOver, fontStack, pageSize, frameStyle, forPurpose, outlines as pageOutlines, purposeOf, readStyle, roundPt, sameStyle, styleFor, withScale, elementColours, COLOURS, FONTS, HIGHLIGHT_COLOURS, RING_FILLS, sizesAt, darkColour, type DocStyle, type Guides, type OwnPurpose, type PurposeKind } from "./docstyle";
import { gridLines, gridNudge, gridOf, shownStep, snapToGrid } from "./grid";
import { RULER, Rulers } from "./Rulers";
import { Scrollbars } from "./Scrollbars";
import { hiddenWarnings, hideProblems, MARK, messy, onCaptions, problemAt, problems, showWarnedHydrogens, showWarnings, WARNING_TYPES, type Problem, type WarningType } from "./check";
import { parse, serialize } from "./file";
import {
  EMPTY, extent, stack, addArrow, addCaption, addCycle, addCharge, addRing, lowerBond, updateArrow, deleteGraphics, deleteChosen, inPolygon, updateCaption, atomAt, atomsIn, bondAt, bounds, complete, deleteAtom, deleteAtoms, flipBond,
  addChair, addGroup, addLane, addTemplate, alignFragments, arrangeShifts, partBox, type Arrange, cutReaction, deleteLane, moveLane, restyleSpot, atomsInPolygon, flipAtoms, fragments, joinOverlaps, joinSelection, setLabel, merge, moveAtoms, neighbours, onSelection, pos, setBondSpec, setElement, setPosition, sprout, subset,
  addShape, addSymbol, markNear, moveMark, bondOrders, toggleHydrogens, freePairs, nextDirection, appendCurvePoint, moveCurvePoint, nearestOnCurve, removeCurvePoint, splitCurve, withCurve, setAtomMarks, toggleLonePairs, updateShape, type BondSpec, type Group, type P, type SymbolKind, newTable, resizeTable, setTableCell, expandLabel, contractLabel, spliceTable, sizeTable, fitTable, clearTable, pairMap, clearMap, scaleSettings, scaleSizes, transformParts, medianBond, fitSizes, scaleAt, stereocentres, setEnhanced, markDirections, tiltAtoms, turnAboutBond, flattenAtoms, hingeOf, carryDepth, groupsOf, groupSelection, ungroupSelection, duplicateSelection, extractSelection, insertMol, inRow, wholeIntegral, wholeGroups, groupTargets, selectedGroups, outermost, outerGroups, pivotOf,
  labelHooks, toFront, addChain, chainPoints, chainThrough, snake, clickBond, keyBond, dragBond, etaRing, addGroupAt, farBond, jumpHot, keepHot, walkHot, type Hot, keyElement, placeCentres, pickAtoms, nextGroup,
} from "./edit";
import { snapBoxes, snapMove, type Guide } from "./snap";
import { clean3d, MOST_3D } from "./clean3d";
import { arrowTrace, kept, lobesOf, nearTrace, shapeTrace } from "./hit";
import { store, type Store } from "./store";
import { loadSettings, RULER_UNITS, saveSettings, SETTINGS_KEY } from "./settings";
import { SELECT_DEFAULT, selectTints } from "./selectcolour";
import { ContextMenu, Menu, menuWidth } from "./Menu";
import { ACTIONS, actionFor, addsToSelection, controlTakes, copyDrag, feedbackChord, keyOf, keymap, label as keyLabel, menuRuns, native, platformLabel, registerMenu, skipsCycle, textEntry, textKey, toAccelerator } from "./keys";
import { Actions, ActionsMenu, actionItems, FontPick, SearchGlyph, type Context } from "./Actions";
import { onTop, reorder } from "./order";
import { Properties } from "./Properties";
import { propertyValues, PROPERTY_ROWS, rowLabel, type Calculated, type PropertyValues } from "./proprows";
import { SpectrumPanel, PEAK_COLOURS } from "./Spectrum";
import { MassSpecPanel, type MsAdd } from "./MassSpec";
import { chemRuns, msFigure } from "./msanalysis";
import { acsText, multiplicity, quality } from "./nmr";
import { nmrReady, predict, type Nucleus } from "./nmr";
import { placeFigure, withNotice } from "./spectrumplot";
import { numbered, placeBeside } from "./beside";
import { centreIn, dropClear, panInto, roomOf, type Span } from "./reveal";
import { followLeaders, labelLines, lonePlot, placePlot, plotFigure, plotsIn, plotTop, reframe, rescale, signalKeys, traceOf, type Plot, type PlotEnv } from "./pageplot";
import type { Show } from "./Spectrum";
import { analyse as analyseSpectrum, defineGroup, fromJcamp, groupText, keepIds, keyOf as spectrumKeyOf, measuredHead, msPeaks, nextGroupId, regroup, type Measured } from "./measured";
import { BRUKER, SPC, isJcamp, isSpectrum, readBrukerText as brukerOf, readJcamp, readSpcText, type JcampSpectrum } from "./jcamp";
import { rings } from "./rings";
import { NumberField, Segmented, Switch } from "./Fields";
import { fromCdxml, parseXml, toCdxml, type CdxmlOptions } from "./cdxml";
import { isDrawingText, lostText, readCdx, readOct, writeCdx, writeOct } from "./oct";
import { BASE64_MAGIC, fromBase64, hexToBase64, toBase64, xmlToCdx } from "./cdx";
import { About } from "./About";
import { WhatsNew } from "./WhatsNew";
import { notesFor } from "./releases";
import { version } from "../package.json";
import { Home, NameBox, type RecentEntry, type RecoveredEntry, type OpenWindow } from "./Home";
import { useHomeLibrary } from "./homeLibrary";
import { call as homeCall, HOME_API } from "./homeApi";
import { Coach, NOTHING_SEEN, type Seen } from "./Coach";
import { Feedback } from "./Feedback";
import { ExportButton, ExportDialog } from "./ExportDialog";
import { FeedbackLink } from "./FeedbackLink";
import { createPortal, flushSync } from "react-dom";
import { CARRY_CDXML, copyToClipboard, exportFile, glyphInk, MDL, pasteRefused, pictureAs, readClipboard, standaloneSvg, inkOfText, UI, type ExportFormat } from "./export";
import { FULL, kindOf, MAX_PICTURE, pictureBytes, pictureMol, readPicture } from "./picture";
import { conditionItems, formatAmount, formulaWeight, inert, keyColumns, parseAmount, solve, type Field } from "./stoich";
import { FIELDS as DETAILS, detailsLayout, detailsOf, experimentPage, experimentsCsv, growScheme, inSpan, markupCaption, markupRuns, newExperiment, newGrids, schemeLanding, schemeSpan, templateOf, withDetails, type Details, type ExperimentEntry } from "./experiment";
import { nextCompound, renumber, romanNumbers, setRoman } from "./numbering";
import { logS, properties as calculate } from "./props";
import type { Graph } from "./naming";
import { CommandPalette, type Command } from "./CommandPalette";
import { StructureThumb, type TemplateTool } from "./TemplateLibrary";
import { cleanUpReaction, cleanUpReactions, findReaction, gapFor, layoutRow, reactionClean, roleOf, rowOf, withStructure, type Layout, type Reaction } from "./reaction";
import { alignByMap, clearScheme, interpret, mapScheme, rolesOf, type Part, type Role, type RoleStep } from "./interpret";
import { SEARCHES, searchNow, searchQuery } from "./search";
import { frameHeight, frameMidY, frameSpan, frameWidth, synthpath } from "./synthpath"; // SynthPath: the editor's width is its pane's, not the window's
import { moduleOf, SettingsWindow, type ModuleId } from "./SettingsWindow";
import { addBranch, addSide, addStop, angleAbout, attachBeside, branchFor, branchHeads, branchOf, breakAt, clearAt, cycleAtoms, dragEnd, dragMeet, dropOnCycle, followArcs, isSide, labelEnd, layoutCycles, orderAround, pullBranch, removeEnd, removeStop, resizeCycle, setBranch, setEnd, setEnds, setStep, sideChoices, sideFor, spreadCycle, stepAt, stepFor, structureMeet, swapBranch, textOn, withEnd, type Cycle, type CycleBranch, type CycleLayout, type CycleText } from "./cycle";
import { LIBRARY, libraryItem, type LibraryItem } from "./library";
import { BracketGlyph, BRACKETS, bracketSpec, ElementGlyph, ORBITAL_GRID, OrbitalGlyph, orbitalName, orbitalSpec, SHAPE_EXTRA, SHAPE_GRID, shapeName, shapeSpec } from "./elements";
import {
  ArrowGlyph, arrowName, arrowVariant, BondGlyph, BONDS, ChainGlyph, CYCLES, ELLIPSES, HOLD_MS, Palette, pickHead, RingGlyph, RINGS, SELECTS, SEQUENCES, SideGlyph, STRAIGHT, SymbolGlyph, SYMBOLS, TemplateGlyph,
  type ArrowPick, type BondKind, type RingKind, type SelectKind, type Tool,
} from "./tools";
import { arrowPath, arrowShapes, bendPoint, blockOutline, curved, ellipseArrow, headBarb, headSize, sizeOf, sizedHead, turnPx, scaleOf, fitArrows, HIGHLIGHT, SHADE, inShape, inDrawn, shapeBounds, turns, tlcLayout, spotPath, tableLayout, linesOf, TABLE_LINES, TABLE_PAD, curveBox, headsOf, takesHeads, shapesHeads, headMenu, HEAD_SHAPES, isBracket, isLine, isOrbital, markAt, straightArrow, shapeInk, SWEEPS, sweepBend, sweepOf, isNumber, labelTurn, placeCaptions, render, renderParts, type Arrow, type ArrowKind, type Atom, type Bond, type Box, type Drawing, type PartCache, type Caption, type CurvePoint, type Head, type HeadShape, type CurveFill, type Mol, type Placed, type Shape, type ShapeKind, type Spot, type TableLine, type CellAlign, polymerLabelsAt, type AtomQuery, type BracketUsage, type Polymer, type Grid, ASCENT, DESCENT } from "./render";
import { cursorColour, dragCursor, drawCursors, type Cursors } from "./cursor";
import { CURSORS, handlePoint, isCorner, percentOf, resizeBy, sideAt, SIDES, type Box as RBox, type Side } from "./resize";
import { abbreviationOf, cleanOwnName, loadNames, mergeOwnNames, nameToSmiles, nameToAtoms, namesStarting, ownName, ownNamesFile, readOwnNamesFile, renameOwnName, setOwnNames, suggestName, knownName, looksLikeSmiles, withOwnName, withoutOwnName, type OwnName } from "./names";
import { isTemplateFile, readTemplateFile, writeTemplateFile } from "./ctp";
import { casProblem, nameList } from "./dictionary";
import { PEPTIDE, peptideProblem } from "./peptide";
import { relabel, residueName, residuesOf, SEQ_ENDS, sequenceParts, sequenceText, type SeqKind, type SeqParts } from "./sequence";
import { NUCLEIC, nucleicProblem } from "./nucleic";
import { fullLayout, isSequence, laterSmiles, PREVIEW_PAUSE, quickLayout, warmLayout } from "./namepreview";
import { commonKey } from "./common";
import { checkedName, graphOf, setComplexNamer, setNamer, withAbbreviation } from "./naming";
import { iupacLocants, iupacName } from "./namer";
import { sandwichIons } from "./metals";
import { complexName } from "./complexes";
import { mixtureName, mixturesOf, withSalts, type Mixture } from "./mixtures";
import { nameRuns } from "./nametype";
import { atomText, bondText, changeText, describe, groupTitle, ringOn, type Item as AccessItem } from "./access";
import { CanvasAccess, type HotItem } from "./CanvasAccess";

setNamer(iupacName);
setComplexNamer((m) => complexName(m, { read: nameToSmiles, atoms: nameToAtoms, inchi: toInchi, aux: toInchiAux, cip: cipOf }));
import { addSet, addSetOf, addTo, closePalette, duplicateTemplate, freeSetName, hasContent, kindName, loadTemplates, moveTemplate, MY_SET, namedKind, newTemplate, openPalette, placeTemplate, removeSet, removeTemplate, renameSet, renameTemplate, setName, templateKind, templateToEnd, templateToStart, updateTemplate } from "./templates";
import { formulaCaption, formulaRuns } from "./labels";
import { expandEscapes, expandRuns, keptText } from "./escapes";
import { CharMap, inMap } from "./CharMap";
import { captionAtom, captionsToAtoms, chemicalCaption, interpretLabels, labelable, sandwich, scriptLabels, setLabelRuns, withCaptionAtoms } from "./edit";
import { bendOf, crossedBonds, cutEndAt, cutPoints, cutSides, cutThrough, extendCut } from "./masscut";
import { common, edited, labelStyle, lines as richLines, normalise, plainOf, runsOf, shareColour, styleRange, styled, trimLines, whole, without, type RunStyle, type TextRun } from "./richtext";
import { RichBox, type RichApi } from "./RichBox";
import { Dialog } from "./Dialog";
import { addAttachment, stepSubstituents, anyQuery, enclosed, genericSites, nextRGroup, polymerLabel, polymerTags, rNumber, USAGES, USAGE_KINDS } from "./query";
import { Select } from "./Select";
import { expandGeneric, layoutGrid, MOST } from "./expand";
import { NoticeBar, type Notice } from "./NoticeBar";
import { Exit, reduced, timing, tween } from "./motion";
import { between, MOST_GLIDE, moving } from "./glide";
import { Tooltips } from "./Tooltip";
import { failure, fileName, type NoticeKind } from "./notice";
import { history, type History } from "./history";
import { logError } from "./crashlog";
import "./editor.css";


const MAC = navigator.platform.startsWith("Mac");
const MOD = MAC ? "⌘" : "Ctrl+";
// Export: ⌃⌘E on the Mac; Ctrl+Shift+E elsewhere, where ⌃ and ⌘ are both Ctrl (src-tauri/src/main.rs).
const EXPORT_KEYS = navigator.platform.startsWith("Mac") ? "⌃⌘E" : "⇧Ctrl+E";
// In the desktop app the native menu owns undo, redo and the file commands; in a browser (dev only) the page does.
const TAURI = "__TAURI_INTERNALS__" in window;
// Home and the drawing windows (src-tauri/src/windows.rs): in the app Home is a window of its own, and each drawing has
// a window. ?window marks a drawing window; ?editor (tests) is the editor with no Home.
const DRAW_WINDOW = TAURI && new URLSearchParams(location.search).has("window");
// A residue label renamed to another residue (Ala to Gly) takes that residue's atoms (sequence.ts relabel).
labelHooks.relabel = (m, i, text) => relabel(m, i, text, parseStructure);
const HOME_WINDOW = TAURI && !DRAW_WINDOW && !new URLSearchParams(location.search).has("editor");
// File > Print's paper size (printDrawing).
let pageSheet: CSSStyleSheet | undefined;
// In the app, copy and paste go through the app (src-tauri/src/clipboard.rs), with the types ChemDraw and Office use
// on each system (REL-3, CH-1). In a browser (dev only), the page uses the browser's clipboard.
const NATIVE_CLIP = TAURI;

const L = STYLE.bond; // px per bond length at 100%
// The largest structure the canvas for screen readers names (access.ts): naming a larger one could hold up the window.
const MOST_NAMED = 120;
// The drawing's origin is the middle of the page. The canvas opens at 125% of true size at the purpose's scale: 10 pt
// labels on Paper read like body text, and a structure fills a good part of the window without crowding it. Every
// purpose opens with bonds the same length on screen (IDEA-SIZE-7): Slides and Poster show their page smaller round
// the same structures. Actual Size still shows true size.
const OPEN_ZOOM = 1.25;
const openZoom = (d: DocStyle) => OPEN_ZOOM / (frameStyle(d, L).k * d.scale);
const SNAP = (15 * Math.PI) / 180; // dragged bonds snap to 15° steps
// The menu commands and panel actions Edit > Repeat can run again: turns, flips, scaling, arrangement, frames, colours
// and text styles.
const REPEATS = /^(flip_[hv]|mirror_[hv]|flatten|arrange_\w+|frame_\w+|colour_\d+|colour_user_\d+|highlight_\d+|ringfill_\d+|text_\w+|size_\d+|font_\d+|align_\w+|curves_\w+|bring_front|send_back|rotate\.\w+|colour\.#\w+|halo\.#?\w+|ringfill\.#?\w+|caption\.(bold|italic|underline|plain|sub|super|formula|size\.\d+|font\..+)|arrow\.(style|start|end|head|size|fill)\.\w+)$/;
const DOUBLE_MS = 500; // two clicks this close together (ms) are a double-click
const toPath = (polys: P[][]) => polys.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L") + "Z").join("");
// The page's paper: its background, with the system's light or dark for "system", and a colour of the user's own as
// dark or light paper by how light it is. Dark and blue paper take white ink.
const paperOf = (d: DocStyle, systemDark: boolean) => {
  const own = d.background.startsWith("#") ? d.background : undefined;
  const paper = d.background === "system" ? (systemDark ? "dark" : "white") : own ? (darkColour(own) ? "dark" : "white") : d.background;
  return { own, paper, dark: paper === "dark" || paper === "blueprint" };
};
// The page colour a raster export can put behind the drawing: the drawing's own light colour. Exports draw in black
// ink, so a dark page has none.
const pageColour = (d: DocStyle) => (d.background.startsWith("#") && !darkColour(d.background) ? d.background : undefined);

// A line, arc or orbital drawn the way arrows are: its kind, its bend for one sweep (signed by the drag), its style.
type Make = { kind: "line" | "arc" | "orbital" | "cut"; bend?: number; style?: Arrow["style"]; orbital?: Arrow["orbital"] };
// A handle: an arrow's ends or middle, or a picked caption's width. head: the barb of an arrow's end head, which
// sizes the head. add: the mark in a straight arrow's middle, which a click turns into a point (and only then does
// the arrow bend). A pen curve's point i: its anchor (at) or one of its handles (c1 in, c2 out).
// meet, end:in and end:out: a cycle's side arrow: where it touches the arc, and its end coming in and going out.
// lead, trail and bow: a cycle step's arc: its start, its end and its middle (the space after and before its
// intermediates, and how far it bows).
type Corner = "from" | "to" | "bend" | "width" | "head" | "add" | "meet" | "end:in" | "end:out" | "lead" | "trail" | "bow" | `p${number}:${"at" | "c1" | "c2"}`;
// arrow: an arrow or a shape (they share ids).
// key: the keyboard hotspot (ChemDraw's), put there by a key rather than by the pointer. branch and part: a cycle's side
// arrow, and its half coming in or going out. mark: with Select, the atom's charge, radical or lone pair (its key in
// Atom.angles) under the pointer, which a drag moves round the atom.
type Hover = { atom?: number; bond?: number; caption?: number; arrow?: number; cycle?: number; step?: number; branch?: number; part?: "in" | "out"; key?: true; mark?: string };
const hitIn = (m: Mol, p: P): Hover => {
  const atom = atomAt(m, p);
  return atom !== undefined ? { atom } : { bond: bondAt(m, p) };
};
// The atoms an atom or bond hit stands for.
const atomsOf = (m: Mol, t: Hover) => (t.atom !== undefined ? [t.atom] : t.bond !== undefined ? m.bonds[t.bond].atoms : []);
// The object a hit stands for: a caption, an arrow or shape, or a cycle.
const itemsOf = (t: Hover) => [t.caption, t.arrow, t.cycle].filter((x): x is number => x !== undefined);

// One pointer gesture. "working" kinds edit a copy of the drawing that commits as one undo step on release.
type Drag =
  // alt: Option was held at the press (a click on an atom then opens its label, or the Text tool repeats the last).
  // onto: a caption that counts as chemistry the bond ends on; it becomes an atom when the bond is drawn.
  | { kind: "bond"; from: number | P; at: P; start: [number, number]; target: Hover; to?: P; alt?: boolean; onto?: number }
  | { kind: "click"; at: P; start: [number, number]; target: Hover; alt?: boolean }
  // A ring tool's press: a drag sets the ring's first bond (to). alt, meta, shift: Option, Command and Shift at the press.
  | { kind: "ring"; from: number | P; at: P; start: [number, number]; target: Hover; to?: P; alt?: boolean; meta?: boolean; shift?: boolean }
  // A chain: side, the side of the drag its first bond goes; path, its points when it snakes (Command held); alt,
  // Option was held at the press (a click then repeats the last chain).
  | { kind: "chain"; from: number | P; start: [number, number]; target: Hover; to?: P; side?: number; path?: P[]; alt?: boolean }
  | { kind: "erase"; trail: P[]; bonds: Set<number>; atoms: Set<number>; captions: Set<number>; start: [number, number]; target: Hover; moved: boolean }
  | { kind: "box"; from: P; to: P; base: Set<number>; picks: Set<number>; target: Hover; moved: boolean }
  | { kind: "lasso"; points: P[]; base: Set<number>; picks: Set<number>; target: Hover; moved: boolean }
  // Moving the selection. If the pointer never moves, the press counts as a click with the tool in hand.
  // captions: where each moving caption starts (drawing coordinates), for captions that do not simply follow their structure.
  // base and atoms: what is moved, when it is not the drawing and the selection (Option-drag moves new copies).
  // snap: the boxes snapping uses, made at the first move (a click does not need them) and kept for the drag.
  | { kind: "move"; from: P; working: Mol; moved: boolean; start: [number, number]; target: Hover; guides: Guide[]; point?: P; captions: Map<number, P>; arrows: Set<number>; cycles: Set<number>; snap: () => { moving: number[]; targets: number[][] } | undefined; base?: Mol; atoms?: Set<number>; skip?: boolean }
  // Drawing an arrow, and dragging one of a picked arrow's handles (an end, or the middle of a curved one).
  // corners: a Mass spec analysis line's corners so far (a key pressed during the drag adds one where the pointer is);
  // longer: the line whose end the drag started from, which it makes longer.
  | { kind: "arrow"; from: P; start: [number, number]; target: Hover; to?: P; trail?: P[]; side?: number; make?: Make; alt?: boolean; corners?: P[]; longer?: { id: number; end: "from" | "to" } }
  // Drawing a shape from corner to corner.
  | { kind: "shape"; from: P; start: [number, number]; target: Hover; to?: P }
  // The Cycle tool: a circle drawn out from its centre, or a click on a circle. pull: a side arrow pulled out of a step's
  // arc where it was pressed (meet), as it would be with the pointer where it is. shift: pressed with Shift; radius: the
  // drawing with the circle pressed on sized out to the pointer.
  | { kind: "cycle"; from: P; start: [number, number]; target: Hover; to?: P; pull?: { cycle: number; step: number; meet: number; made?: ReturnType<typeof pullBranch> }; shift?: boolean; radius?: Mol }
  // step and branch: a cycle step's or side arrow's handle (id is the cycle). from and start: where it was pressed
  // (drawing coordinates, screen).
  | { kind: "handle"; id: number; which: Corner; working: Mol; step?: number; branch?: number; from?: P; start?: [number, number] }
  // Placing a pen point: where it was pressed, and its outgoing handle if the press was dragged.
  | { kind: "pen"; at: P; start: [number, number]; out?: P }
  // Structure Perspective: tilting atoms through 3D from where they were (base), about their centre, or turning part
  // of a structure about the bond that joins it to the rest (hinge: [inside atom, outside atom]).
  // TLC: a spot moved (lane and Rf) or sized (Shift: width across, height up, tail down), or the origin or front moved.
  | { kind: "spot"; plate: number; index: number; base: Mol; from: P; size: boolean; moved: boolean; working: Mol }
  | { kind: "tlcline"; plate: number; which: "origin" | "front"; base: Mol; working: Mol }
  | { kind: "lane"; plate: number; from: number; to: number; base: Mol; working: Mol } // a lane dragged by its origin tick
  // A mark (lone pair, radical, charge) moved round its atom, by its key (Atom.angles): dragged with Select (a hold
  // with any tool gives Select), or Shift-dragged with the Symbols tool.
  | { kind: "mark"; atom: number; key: string; start: [number, number]; base: Mol; working: Mol }
  // Tables: a column or row border dragged with the Table tool (index 0 is the left or top edge).
  | { kind: "tableedge"; id: number; axis: "col" | "row"; index: number; base: Mol; working: Mol }
  | { kind: "tilt"; base: Mol; ids: Set<number>; centre: [number, number, number]; start: [number, number]; hinge?: [number, number]; working: Mol }
  // Mapping one atom to another with the Atom map tool: from the atom pressed to the pointer.
  | { kind: "map"; atom: number; start: [number, number]; to?: P }
  // Turning the selection by its rotation handle: about its centre, from the angle the drag started at.
  | { kind: "turn"; centre: P; middles: Map<number, P>; start: number; degrees: number; working: Mol }
  // Moving the centre the selection turns about (Option-drag on the centre mark). Not moved, it is an Option-click.
  | { kind: "pivot"; start: [number, number]; target: Hover; at: P; moved: boolean }
  // Resizing the selection by one of its frame's handles (resize.ts): the frame at the press (drawing units), what is
  // scaled, each free caption's middle, the stops, the factors and the point they scale about now. whole: the whole
  // drawing with Labels and lines, which a scale in proportion only zooms (it shows the drawing as it is, scaled).
  | { kind: "resize"; side: Side; frame: RBox; atoms: Set<number>; items: Set<number>; middles: Map<number, P>; stops: number[]; size: P; anchor: P; whole: boolean; labels: boolean; lines: boolean; working: Mol; plot?: number }
  // Moving the crosshair (View > Show Crosshair): from where it was, to where it is now.
  | { kind: "crosshair"; from: P; at: P };

// Draws again whenever a store changes, by calling its children with the value; nothing else draws again.
function Live<T>({ store: from, children }: { store: Store<T>; children: (value: T) => React.ReactNode }) {
  return <>{children(useSyncExternalStore(from.subscribe, from.get))}</>;
}
// The view: where the drawing's origin is on screen (px) and the zoom. pinch: a zoom gesture goes on (see onWheel).
type View = { x: number; y: number; zoom: number; pinch?: boolean };
// What Export and Copy make from the drawing for other programs (pictures aside).
// molfile: V2000, as ChemDraw puts it on the clipboard; mol, sdf, rxn and rdf: V3000 (or V2000 with 2000), as ChemDraw
// 26.1 saves them.
type PartFormat = "cdxml" | "cdx" | "oct" | "molfile" | "smiles" | "inchi" | "mol" | "mol2000" | "sdf" | "sdf2000" | "rxn" | "rxn2000" | "rdf" | "rdf2000";
const sameHover = (a: Hover, b: Hover) => a.atom === b.atom && a.bond === b.bond && a.caption === b.caption && a.arrow === b.arrow && a.cycle === b.cycle && a.step === b.step && a.branch === b.branch && a.part === b.part && a.key === b.key && a.mark === b.mark;
const nothing = (t: Hover) => t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && t.cycle === undefined;
// Ink as SVG path data, kept with the arrow or shape it is made from, for each document style.
const arrowInks = new WeakMap<Arrow, [unknown, string]>(), shapeInks = new WeakMap<Shape, [unknown, string]>(), outlines = new WeakMap<object, [unknown, string]>(), blockOutlines = new WeakMap<Arrow, [unknown, P[]]>();
// A picture's data as an image the webview draws, made once per picture: PNG, JPEG, GIF or BMP, else TIFF (the Mac's
// webview draws it). Undefined when it holds none of these (an EMF or a PICT alone).
const pictureUrls = new WeakMap<object, string | undefined>();
function pictureUrl(p: Record<string, string>): string | undefined {
  if (pictureUrls.has(p)) return pictureUrls.get(p);
  const found = ([["PNG", "png"], ["JPEG", "jpeg"], ["GIF", "gif"], ["BMP", "bmp"], ["TIFF", "tiff"]] as const).find(([k]) => p[k]);
  const b64 = found && hexToBase64(p[found[0]]), url = found && b64 ? `data:image/${found[1]};base64,${b64}` : undefined;
  pictureUrls.set(p, url);
  return url;
}
// Octet's own calculators' values (props.ts), kept with the structure's values they are from (chem.ts keeps those by
// structure), so each structure is worked out once.
const calculated = new WeakMap<Structure, Calculated>();
// A drawing's rings (rings.ts, from its bonds alone), kept with its bond list: a drag that only moves atoms, a change
// of colour or fill, and undo find them again at once.
const ringLists = new WeakMap<Mol["bonds"], number[][]>();
function drawnRings(m: Mol): number[][] {
  let found = ringLists.get(m.bonds);
  if (!found) ringLists.set(m.bonds, (found = rings({ atoms: m.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: m.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) })));
  return found;
}

// A ring by its atoms, whatever atom it starts at and whichever way round.
const ringKey = (atoms: number[]) => [...atoms].sort((p, q) => p - q).join(",");
// The rings a ring fill goes in: every ring wholly selected; failing that, every ring with a selected atom in it;
// failing that, every ring of the structures the selection touches (a substituent picked).
function fillRings(m: Mol, atoms: Set<number>): number[][] {
  const all = drawnRings(m).filter((r) => r.length <= 12), whole = all.filter((r) => r.every((i) => atoms.has(i)));
  if (whole.length) return whole;
  const part = all.filter((r) => r.some((i) => atoms.has(i)));
  if (part.length) return part;
  const touched = new Set(fragments(m).filter((g) => g.some((i) => atoms.has(i))).flat());
  return all.filter((r) => r.every((i) => touched.has(i)));
}
// The ring fill those rings share, if each has the same one.
function fillOf(m: Mol, atoms: Set<number>): string | undefined {
  const keys = new Set(fillRings(m, atoms).map(ringKey)), on = (m.fills ?? []).filter((f) => keys.has(ringKey(f.atoms)));
  return on.length === keys.size && on.every((f) => f.colour === on[0].colour) ? on[0]?.colour : undefined;
}

// A caption's anchor in drawing coordinates: the start, middle or end of its first baseline.
const anchorOf = (c: Placed): P => { const b = c.frame ?? c.box; return [(c.anchor === "start" ? b[0] : c.anchor === "end" ? b[2] : (b[0] + b[2]) / 2) / L, -c.lines[0].y / L]; };
const union = (boxes: Box[]): Box | undefined => boxes.length ? [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))] : undefined;
// The draft caption being typed sorts after every real one.
const DRAFT = Number.MAX_SAFE_INTEGER;
// The clipboard's plain text when it is one short line, for the name field. In the app it comes from the clipboard
// itself, so WebKit asks nothing.
async function clipboardText(): Promise<string | undefined> {
  try {
    const t = (NATIVE_CLIP ? (await readClipboard()).text : await navigator.clipboard?.readText())?.trim();
    return t && t.length <= 200 && !t.includes("\n") ? t : undefined;
  } catch {
    return undefined;
  }
}
// Typing in a text field, or in a caption's rich text box (contentEditable): keys and Select All are the text's, not the
// drawing's. A focused slider (Line width) or button does not count (textEntry).
const typing = () => textEntry(document.activeElement as HTMLElement | null);
// A dialog or Settings is open: the drawing behind it takes no keys, menu commands, paste, copy or cut.
const modal = () => document.querySelector('[aria-modal="true"]') !== null;

// Rubbing out: marks every bond within radius r of the pointer's path between two points, and any lone atom.
// Nothing is removed until the pointer is released.
function rub(m: Mol, a: P, b: P, r: number, bonds: Set<number>, atoms: Set<number>) {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(0.05, r / 2)));
  for (let k = 0; k <= steps; k++) {
    const p: P = [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps];
    m.bonds.forEach((_, i) => { if (!bonds.has(i) && bondAt({ ...m, bonds: [m.bonds[i]] }, p, r) === 0) bonds.add(i); });
    m.atoms.forEach((_, i) => { if (!atoms.has(i) && !neighbours(m, i).length && Math.hypot(pos(m, i)[0] - p[0], pos(m, i)[1] - p[1]) < r + 0.1) atoms.add(i); });
  }
}

// Groups ink by colour: one list of polygons per colour, in first-seen order (undefined is the document's ink).
function byColour(items: readonly (readonly [string | undefined, P[][]])[]): [string | undefined, P[][]][] {
  const groups = new Map<string | undefined, P[][]>();
  for (const [colour, polys] of items) {
    const key = colour?.toLowerCase(), group = groups.get(key);
    if (group) for (const poly of polys) group.push(poly);
    else groups.set(key, [...polys]);
  }
  return [...groups];
}
// A structure moved, scaled or turned by a drag before it is drawn again (px), as an SVG transform.
const moveBy = ([x, y]: P, k = 1, turn = 0) => (turn ? `translate(${x} ${y}) rotate(${turn})${k !== 1 ? ` scale(${k})` : ""}` : k !== 1 ? `translate(${x} ${y}) scale(${k})` : x || y ? `translate(${x} ${y})` : undefined);
// A structure's ink as one path per colour and, in 3D structures, per how strongly it is drawn (Structure
// Perspective): [colour|alpha, path]. Made once for each drawing of the structure.
const inkPaths = new WeakMap<Drawing, [string, string][]>();
function structurePaths(d: Drawing): [string, string][] {
  let paths = inkPaths.get(d);
  if (!paths) {
    paths = byColour(d.polygons.map((poly, i) => [`${d.colours[i] ?? ""}|${(Math.round(d.alphas[i] * 20) / 20).toFixed(2)}`, [poly]] as const)).map(([key, polys]) => [key ?? "|1", toPath(polys)]);
    inkPaths.set(d, paths);
  }
  return paths;
}

// A colour as drawn on the paper: black ink is white on dark paper.
const inkOn = (dark: boolean, c: string) => (dark && /^#(000000|0f172a)$/i.test(c) ? "#FFFFFF" : c);
// A line of rich text as tspans: each run in its style, a subscript 0.212 em down and a superscript 0.33 em up at
// 75% size (as atom labels), each run starting from where the last one left the baseline. A run's own colour draws as
// the rest of the drawing does on dark paper (inkOn).
function richSpans(runs: TextRun[], size: number, PT: number, dark: boolean) {
  let shift = 0;
  return runs.map((r, k) => {
    const to = r.script === "sub" ? 0.212 * size : r.script === "super" ? -0.33 * size : 0, dy = to - shift;
    shift = to;
    const px = r.size ? r.size * PT : size;
    return (
      <tspan key={k} dy={dy || undefined} fill={r.colour && inkOn(dark, r.colour)} style={{ fontSize: r.script ? px * 0.75 : px, fontWeight: r.bold ? "bold" : undefined, fontStyle: r.italic ? "italic" : undefined, fontFamily: r.font ? fontStack(r.font) : undefined, textDecoration: r.underline ? "underline" : undefined }}>
        {r.text}
      </tspan>
    );
  });
}

// Octet's own clipboard type: a copied part of a drawing in Octet's file form (read back with the file checks).
const OCTET_CLIP = "application/x-octet+json";
// A file the system asked Octet to open, or dropped on the window (src-tauri/src/open.rs). path: set when Save may
// write over it. at: where it was dropped, in CSS pixels from the window's top left.
type OpenedFile = { name: string; path: string | null; text: string | null; picture: string | null; error: string | null; at: [number, number] | null };
// What a new drawing window opens: a new drawing for a purpose, the tutorial, a recent or recovered drawing, an example
// drawing's text, a file picked in Open, or files Octet was asked to open.
type Start = { new: string } | { tutorial: true } | { recent: string } | { recovered: string } | { text: string } | { picked: [string, string] } | { files: OpenedFile[] };
// Abbreviations Contract Label recognises, each with its InChI when capped with xenon at its attachment point
// (worked out once, on first use): the groups chemists name, and condensed formulas they write.
const CONTRACTED = ["OMe", "OEt", "OiPr", "OtBu", "OAc", "OBz", "OBn", "OPh", "OTs", "OMs", "OTf", "OTBS", "OTIPS", "OTBDPS", "OTMS", "OMOM", "OTHP", "OPMB",
  "CO2Me", "CO2Et", "CO2tBu", "CO2Bn", "CO2H", "CHO", "CN", "NO2", "CF3", "CCl3", "OCF3", "SMe", "SO2Me", "NMe2", "NEt2", "NHAc", "NHBoc", "NHCbz", "NHFmoc",
  "NHTs", "NBoc2", "CONH2", "CONMe2", "N3", "SO3H", "COMe", "COPh"];
// Choose Nickname (the = key): Octet's group names, then the condensed labels, each drawn as its structure (made once).
const NICKNAMES = [Object.keys(GROUPS), CONTRACTED];
const nicknameMols = new Map<string, Mol | undefined>();
const nicknameMol = (name: string) => {
  if (!nicknameMols.has(name)) { const smiles = labelSmiles(name); try { nicknameMols.set(name, smiles ? parseStructure(smiles) : undefined); } catch { nicknameMols.set(name, undefined); } }
  return nicknameMols.get(name);
};
// Structures for names and abbreviations (TREN, dppf, a name OPSIN reads), laid out once each: the template library's
// results for them, and the Ring or Template tool holding one ("name:" kinds). Undefined until Indigo and the names
// engine have loaded, and then kept.
const namedMols = new Map<string, Mol>();
const namedMol = (name: string): Mol | undefined => {
  if (namedMols.has(name)) return namedMols.get(name);
  const smiles = nameToSmiles(name);
  let m: Mol | undefined;
  try { m = smiles ? sandwich(parseStructure(smiles)) : undefined; } catch { m = undefined; }
  if (!m?.atoms.length) return undefined;
  if (namedMols.size >= 500) namedMols.clear();
  namedMols.set(name, m);
  return m;
};
// Structures for names typed in Name to Structure or the command palette, laid out once each (structureFor), so a
// keystroke that gives the same name again does not lay it out again.
const typedMols = new Map<string, Mol | undefined>();
const namedOf = (kind: string) => { const name = kindName(kind); return name ? namedMol(name) : undefined; };
// The tools that work on an atom also work on a caption that counts as chemistry (edit.ts chemicalCaption), made an
// atom when they press it. elementSteps names the undo step each press makes.
const ATOM_TOOLS = new Set<Tool>(["bond", "chain", "ring", "template", "symbol"]);
let elementSteps = 0;
// A bond's style in the tool's list, if it is one of them.
const bondKindOf = (b: Bond) => (Object.keys(BONDS) as BondKind[]).find((k) => { const spec: BondSpec = BONDS[k].spec; return spec.type === b.type && spec.stereo === b.stereo && spec.display === b.display; });
// The Bond Properties list, in the order of ChemDraw's Bond Type list. A hydrogen bond is in it only on a hydrogen
// bond: no bond becomes one, as in ChemDraw.
const BOND_TYPES: BondKind[] = ["single", "dashed", "hashed", "hashwedge", "bold", "wedge", "wavy", "hollow", "dative", "double", "eitherdouble", "bolddouble", "aromaticdouble", "dasheddouble", "triple", "quadruple", "hydrogen"];
let contracted: [string, string][] | undefined;
function contractLabelText(want: string): string | undefined {
  contracted ??= [...CONTRACTED, ...Object.keys(GROUPS)].flatMap((name) => { const smiles = labelSmiles(name), inchi = smiles ? toInchi(`[Xe]${smiles}`) : undefined; return inchi ? [[name, inchi] as [string, string]] : []; });
  return contracted.find(([, inchi]) => inchi === want)?.[0];
}
// The stoichiometry grid's rows, as ChemDraw's: what each component is, then amounts. shown: rows that appear only
// once one of these was typed somewhere; product: rows for products (true) or reactants (false) only. Equivalents are
// a product's coefficient too, as ChemDraw's product column has them.
const GRID_ROWS: { id: string; name: string; field?: Field; product?: boolean; shown?: Field[] }[] = [
  { id: "formula", name: "Formula" }, { id: "mw", name: "MW" }, { id: "limiting", name: "Limiting?", product: false },
  { id: "equiv", name: "Equivalents", field: "equiv" }, { id: "mass", name: "Mass", field: "mass", product: false }, { id: "moles", name: "Moles", field: "moles", product: false },
  { id: "volume", name: "Volume", field: "volume", product: false, shown: ["volume", "density", "molarity"] }, { id: "density", name: "Density", field: "density", product: false, shown: ["density"] },
  { id: "molarity", name: "Molarity", field: "molarity", product: false, shown: ["molarity"] }, { id: "purity", name: "Purity", field: "purity", shown: ["purity"] },
  { id: "expected", name: "Expected mass", product: true }, { id: "expectedMoles", name: "Expected moles", product: true },
  { id: "measured", name: "Measured mass", field: "measured", product: true }, { id: "yield", name: "Yield", product: true },
];

// A pen point: a corner, or (dragged out) a smooth point with its incoming handle mirroring its outgoing one.
const penPoint = (at: P, out?: P): CurvePoint => (out ? { at, c1: [2 * at[0] - out[0], 2 * at[1] - out[1]], c2: out } : { at });

// Text with its formula counts as subscripts (see formulaRuns): 75% size, 0.212 em down, as in atom labels.
const formula = (text: string, size: number) => formulaRuns(text).map((r, k, all) => (
  <tspan key={k} dy={r.sub ? 0.212 * size : k && all[k - 1].sub ? -0.212 * size : undefined} style={r.sub ? { fontSize: 0.75 * size } : undefined}>{r.text}</tspan>
));
const formulaWidth = (text: string, size: number, bold?: boolean, italic?: boolean, family?: string) =>
  formulaRuns(text).reduce((w, r) => w + textWidth(r.text, r.sub ? 0.75 * size : size, bold, italic, family), 0);
// A caption's text on the canvas. It draws again only when its layout or look changes, so typing in one caption
// passes over all the others. reagent: its counts print as subscripts (reaction conditions, a cycle's reagents).
const samePlaced = (a: Placed, b: Placed) => a === b || (a.id === b.id && a.size === b.size && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline
  && a.colour === b.colour && a.anchor === b.anchor && a.font === b.font && a.angle === b.angle && a.lines.length === b.lines.length
  && a.lines.every((l, j) => l.text === b.lines[j].text && l.x === b.lines[j].x && l.y === b.lines[j].y && l.spacing === b.lines[j].spacing && JSON.stringify(l.runs) === JSON.stringify(b.lines[j].runs)));
// fill: the caption's own colour, or the drawing's ink (var(--ink)) when it has none. dark: dark paper.
type CaptionProps = { c: Placed; fill: string; font: string; reagent: boolean; pt: number; dark: boolean };
const CaptionText = memo(({ c, fill, font, reagent, pt, dark }: CaptionProps) => (
  <text className="caption" textAnchor={c.anchor} textDecoration={c.underline ? "underline" : undefined} fill={fill} style={{ font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${c.size}px ${font}` }}
    transform={c.angle && c.pivot ? `rotate(${-c.angle} ${c.pivot[0]} ${c.pivot[1]})` : undefined}>
    {c.lines.map((l, j) => <tspan key={j} x={l.x} y={l.y} style={l.spacing ? { wordSpacing: l.spacing } : undefined}>{l.runs ? richSpans(l.runs, c.size, pt, dark) : reagent ? formula(l.text, c.size) : l.text}</tspan>)}
  </text>
), (a: CaptionProps, b: CaptionProps) => a.fill === b.fill && a.font === b.font && a.reagent === b.reagent && a.pt === b.pt && a.dark === b.dark && samePlaced(a.c, b.c));

// The file on disk and the drawing as last saved (undoing back to it makes the drawing clean again). lost: what
// Octet could not hold from the file, so Save asks before it writes over the file (REL-11). name: a drawing with no
// file yet keeps the name it had (a recovered drawing).
type FileState = { path?: string; saved: Mol; lost?: Record<string, number>; name?: string };
// The editor as last drawn without an error, for the error boundary in App.tsx (REL-23): it opens the editor again
// with the same drawing and undo history, or saves the drawing to a new file.
export const rescue: { current?: { h: History; file: FileState; home: boolean; name: string; contents: () => string } } = {};
// Crash safety (REL-1): while the drawing has unsaved changes, a copy of it goes to the app's data folder
// (src-tauri/src/recovery.rs), a second after an edit and then at most every 10 s. When the drawing is clean again
// (saved, or replaced after Don't Save) the copy goes. Calls go one after another, so a late write never follows a clear.
// kept is set before the write ends, so a clear always follows a write that is still under way. told: the user heard
// that recovery failed (once for each window).
const keeper = { timer: 0, last: 0, kept: false, told: false, queue: Promise.resolve() as Promise<unknown>, write: () => {} };
function keep<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const run = keeper.queue.then(() => invoke<T>(command, args));
  keeper.queue = run.catch(() => {});
  return run;
}
// The copy, written now: the error boundary keeps the drawing as last drawn before the window can close.
export function keepNow() {
  clearTimeout(keeper.timer);
  keeper.timer = 0;
  keeper.last = Date.now();
  keeper.write();
}
let crashOffered = false; // the log of a crash is offered once, at start

export default function Editor() {
  const [loaded, setLoaded] = useState(false);
  // Each time the window comes to the front: the menu bar takes this window's ticks, colours and fonts again.
  const [fronted, setFronted] = useState(0);
  const [h, dispatch] = useReducer(history, rescue.current?.h ?? { stack: [EMPTY], at: 0 });
  const doc = h.stack[h.at];
  // The drawing as it is now, for work that ends later (Cut deletes after the copy is on the clipboard).
  const now = useRef(doc);
  now.current = doc;
  const [tool, setTool] = useState<Tool>("bond");
  // The drawing tool to go back to when a hold-to-select gesture ends.
  const [spring, setSpring] = useState<Tool>();
  // The view and the thing under the pointer change on each pan, zoom and pointer move. They live in stores: only the
  // parts that show them draw again (Live), and handlers read them as they run.
  const [views] = useState(() => { const s = loadSettings(); return store<View>({ x: frameWidth() / 2, y: frameMidY(), zoom: Math.min(8, Math.max(0.25, openZoom(styleFor(s, s.purpose)))) }); });
  const setView = (next: View | ((v: View) => View)) => views.set(typeof next === "function" ? next(views.get()) : next);
  // A window made larger shows more of the grid and the rulers, which are drawn for the window alone.
  useEffect(() => { const grow = () => views.set({ ...views.get() }); addEventListener("resize", grow); return () => removeEventListener("resize", grow); }, [views]);
  const [hovers] = useState(() => store<Hover>({}, sameHover));
  const setHover = hovers.set;
  // The keyboard hotspot is the hover, marked key. A key that adds atoms moves it on to the new end, the arrow keys
  // walk it and Enter puts it on a selected structure, so a molecule can be typed. It stays while the pointer is
  // still or over empty canvas; the pointer takes over when it moves on to something else. keyFrom: what the
  // pointer was over when a key set it. hotOf: each drawing's hotspot, so undo and redo bring it back.
  const keyFrom = useRef<Hover>({});
  const hotOf = useRef(new WeakMap<Mol, Hot>());
  const [selection, setSelection] = useState<Set<number>>(new Set());
  // Captions picked, by id. Atoms and captions are selected separately and move, delete and copy together.
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [drag, setDrag] = useState<Drag>();
  // The notice at the bottom of the window (NoticeBar.tsx). Without a kind it is an error; undefined clears it.
  const [notice, showNotice] = useState<Notice>();
  const setNotice = (text?: string, kind: NoticeKind = "error", action?: Notice["action"]) =>
    showNotice(text ? (was) => ({ text, kind, action, n: (was?.n ?? 0) + 1 }) : undefined);
  // Feedback (for testers, not in the public release: vite.config.ts): ⌘ held with 1, 2 and 3 pressed together (Ctrl
  // on Windows and Linux; keys.ts feedbackChord) takes a picture of the window, then opens the feedback box
  // (Feedback.tsx). The picture is taken first, so it shows the window as it was.
  const [feedback, setFeedback] = useState<{ picture?: string }>();
  useEffect(() => {
    if (!__FEEDBACK__) return;
    const mac = navigator.platform.startsWith("Mac"), pressed = new Map<string, number>();
    const down = (e: KeyboardEvent) => {
      const digit = (mac ? e.metaKey : e.ctrlKey) && !e.repeat ? /^Digit([123])$/.exec(e.code)?.[1] : undefined;
      if (!digit || !feedbackChord(pressed, digit, e.timeStamp)) return;
      e.preventDefault();
      void invoke<string>("snapshot").then((picture) => setFeedback({ picture }), () => setFeedback({}));
    };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  }, []);
  // The hold-to-select switch: the tool icon pops and a ring pops at the pointer. pop.n restarts the animations.
  const [pop, setPop] = useState<{ n: number; x: number; y: number }>();
  // While a press may become a hold: a thin ring at the pointer fills as the hold time goes (FEEL-37).
  const [holding, setHolding] = useState<{ n: number; x: number; y: number }>();
  const [cursors, setCursors] = useState<Record<"black" | "white", Cursors>>();
  const [settings, setSettings] = useState(loadSettings);
  const drawingPrefs = useMemo(() => ({ fixedLengths: settings.fixedLengths, fixedAngles: settings.fixedAngles, sproutRings: settings.sproutRings, clickTriple: settings.clickTriple, pairBars: settings.pairBars,
    autoMap: settings.autoMap, stereoParens: settings.stereoParens, hideAbs: settings.hideAbs, mdlFlags: settings.mdlFlags, aromaticOnOpen: settings.aromaticOnOpen }),
  [settings.fixedLengths, settings.fixedAngles, settings.sproutRings, settings.clickTriple, settings.pairBars, settings.autoMap, settings.stereoParens, settings.hideAbs, settings.mdlFlags, settings.aromaticOnOpen]);
  // What this drawing shows over its page (View > Show Grid, Show Rulers, Show Crosshair). Not an edit: no undo step.
  const [guides, setGuides] = useState<Guides>({});
  // Where the pointer is (drawing coordinates), for the rulers' marks.
  const [pointers] = useState(() => store<P | undefined>(undefined));
  const bondKind = (settings.variants.bond in BONDS ? settings.variants.bond : "single") as BondKind;
  // The user's own rings, and the one in hand (a built-in RingKind or a template's kind).
  const templates = useMemo(() => loadTemplates(settings.templates), [settings.templates]);
  const ringKind = settings.variants.ring in RINGS || templates.some((t) => templateKind(t.id) === settings.variants.ring) || libraryItem(settings.variants.ring) || namedOf(settings.variants.ring) ? settings.variants.ring : "benzene";
  // The library to show again after a change made away from it: the tool it is beside, the set it opens on, and a
  // template just added, whose name is ready to type there. n: changes each time, so the same one shows again.
  const [reveal, setReveal] = useState<{ tool: TemplateTool; set: string; id?: string; n: number }>();
  const showLibrary = (tool: TemplateTool, set: string, id?: string) => setReveal((r) => ({ tool, set, id, n: (r?.n ?? 0) + 1 }));
  // A template of the user's own, at the end of a set (My templates unless one is named). It is the Ring tool's (or the
  // Template tool's, from its library) in hand now.
  function addOwnTemplate(name: string, mol: Mol, set?: string, tool: TemplateTool = "ring") {
    const t = newTemplate(name, mol);
    setSettings((s) => ({ ...addTo(s, t, set), variants: { ...s.variants, [tool]: templateKind(t.id) } }));
    setTool(tool);
    return t;
  }
  function removeRingTemplate(id: string) {
    const kind = templateKind(id);
    setSettings((s) => ({
      ...removeTemplate(s, id),
      pinned: s.pinned.filter((k) => k !== `ring:${kind}` && k !== `template:${kind}`),
      variants: { ...s.variants, ...(s.variants.ring === kind ? { ring: "benzene" } : {}), ...(s.variants.template === kind ? { template: "lib:Alanine" } : {}) },
    }));
  }
  // A drawing (a selection, a structure picked, a built-in template) becomes a template of the user's own, with
  // everything in it (its text, arrows, shapes and look, as ChemDraw's templates keep them). The library opens on its
  // set with its name ready to type: Return keeps the name.
  const addPart = (part: Mol | undefined, set = MY_SET, tool: TemplateTool = "ring", name?: string) => {
    if (!part) return;
    let n = templates.length + 1;
    while (templates.some((t) => t.name === `Template ${n}`)) n++;
    const t = addOwnTemplate(name ?? `Template ${n}`, part, set, tool);
    showLibrary(tool, set, t.id);
  };
  // What Add to templates keeps: the selection, or with one atom or bond chosen (its Actions), its whole structure.
  const templatePart = () => {
    const kind = contextOf().kind;
    if (kind !== "atom" && kind !== "bond") return selectedPart();
    const [atoms, items] = wholeIntegral(doc, new Set(fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat()), picked);
    return extractSelection(doc, atoms, items, drawnAt, drawnAlign);
  };
  // Add in My templates or a set of the user's: the selection goes in at once. With nothing selected, the library gets
  // out of the way and the next structure clicked goes in (templatePick); Escape stops it.
  const [templatePick, setTemplatePick] = useState<{ set: string; tool: TemplateTool }>();
  const addToSet = (set: string, tool: TemplateTool) => (selection.size || picked.size ? addPart(selectedPart(), set, tool) : setTemplatePick({ set, tool }));
  const stopPick = () => { if (templatePick) showLibrary(templatePick.tool, templatePick.set); setTemplatePick(undefined); };
  // New set…: the set's name first (Dialog), then what was asked for goes in it.
  const askSet = (then: (set: string) => void) => setDialog({ kind: "templateSet", name: "", then });
  // Template sets (the library's categories of the user's own): a new one, one renamed (its templates go with it), one
  // removed (its templates go to My templates), and a template moved to another set.
  const templateSets = {
    add: (name: string) => setSettings((s) => addSet(s, name)),
    rename: (from: string, name: string) => setSettings((s) => renameSet(s, from, name)),
    remove: (name: string) => setSettings((s) => removeSet(s, name)),
    move: (id: string, set: string) => setSettings((s) => moveTemplate(s, id, set)),
  };
  // Edit (a template's menu, CD-32): the template opens on the canvas as a drawing of its own, with its own undo steps,
  // and the drawing in hand is set aside, as ChemDraw opens a template pane in its document window. Save (the bar, or
  // File > Save) puts what is drawn in the template (a copy of a built-in one goes in My templates, under its name) and
  // brings the drawing back as it was; Cancel brings it back and leaves the template. While a template is open, what
  // would replace the drawing (New, Open, Home, Close, Quit) waits: a notice says to save or cancel first. A crash keeps
  // the drawing set aside, not the template (rescue, recovery).
  type TemplateEdit = { id?: string; name: string; tool: TemplateTool; saved: Mol; back: { h: History; file: FileState; view: View; guides: Guides; selection: Set<number>; picked: Set<number> } };
  const [templateEdit, setTemplateEdit] = useState<TemplateEdit>();
  const templateDirty = !!templateEdit && doc !== templateEdit.saved;
  function editTemplate(kind: string, tool: TemplateTool) {
    if (templateEdit) return setNotice("Save or cancel the template first.", "info");
    const own = templates.find((t) => templateKind(t.id) === kind), mol = own?.mol ?? libraryItem(kind)?.mol ?? namedOf(kind);
    if (!mol) return;
    // The template fills a good part of the window (templates are small): up to three times the open zoom.
    const start: Mol = { ...mol, style: newStyle }, b = bounds(start) ?? extent(start), open = openZoom(newStyle);
    const fit = b ? 0.6 * Math.min((frameWidth() - 160) / ((b[2] - b[0] + 1) * L), (frameSpan() - 120) / ((b[3] - b[1] + 1) * L)) : open, zoom = Math.min(3 * open, Math.max(open, fit));
    setTemplateEdit({ id: own?.id, name: own?.name ?? libraryItem(kind)?.name ?? kindName(kind) ?? "Template", tool, saved: start,
      back: { h, file, view: views.get(), guides, selection, picked } });
    dispatch({ type: "reset", h: { stack: [start], at: 0 } });
    setFile({ saved: start, name: own?.name ?? libraryItem(kind)?.name ?? kindName(kind) });
    setSelection(new Set());
    setPicked(new Set());
    setGuides(freshGuides([0, 0], newStyle));
    setTemplatePick(undefined);
    setView({ x: frameWidth() / 2 - (b ? (b[0] + b[2]) / 2 : 0) * zoom * L, y: frameMidY() + (b ? (b[1] + b[3]) / 2 : 0) * zoom * L, zoom });
  }
  function endTemplateEdit() {
    const e = templateEdit;
    if (!e) return;
    dispatch({ type: "reset", h: e.back.h });
    setFile(e.back.file);
    setView(e.back.view);
    setGuides(e.back.guides);
    setSelection(e.back.selection);
    setPicked(e.back.picked);
    setTemplateEdit(undefined);
  }
  function saveTemplateEdit() {
    const e = templateEdit;
    if (!e) return;
    const { style: _, guides: __, ...mol } = doc;
    if (!hasContent(mol)) return setNotice("The template is empty. Draw something, or press Cancel.", "info");
    // A template removed meanwhile (from a palette) is kept as a new one, so nothing drawn is lost.
    const kept = !!e.id && templates.some((t) => t.id === e.id);
    if (kept) setSettings((s) => updateTemplate(s, e.id!, mol));
    else { const t = newTemplate(e.name, mol); setSettings((s) => addTo(s, t)); }
    endTemplateEdit();
    setNotice(kept ? `${e.name} is saved.` : `${e.name} is saved in My templates.`, "done");
  }
  // Floating palettes (View > Templates, and Keep open in the library): a set kept open beside the canvas, where it was
  // left, until its close button closes it. A set opened again comes to the front. View > Templates lists the user's
  // sets (My templates first), then Octet's.
  const keepOpen = (set: string, tool: TemplateTool) => setSettings((s) => ({ ...s, palettes: openPalette(s.palettes, set, tool) }));
  // View > Templates shows or hides a set's palette, as ChemDraw's does; a palette opened there is the Template tool's.
  const togglePalette = (set: string) => setSettings((s) => ({ ...s, palettes: s.palettes.some((f) => f.set === set) ? closePalette(s.palettes, set) : openPalette(s.palettes, set, "template") }));
  const ownSets = [MY_SET, ...settings.templateSets], octetSets = LIBRARY.map((c) => c.name), menuSets = [...ownSets, ...octetSets];
  const setsMenu = ownSets.join("\n");
  useEffect(() => { if (TAURI) invoke("set_template_sets", { own: ownSets, octet: octetSets }).then(syncChecks).catch(() => {}); }, [setsMenu]); // eslint-disable-line react-hooks/exhaustive-deps
  // A ChemDraw template file (.ctp, or .cts stationery) opened or dropped: its panes become a new set of the user's,
  // named after the file, and the library opens on it.
  function openTemplateFile(fileName: string, text: string) {
    try {
      const read = readTemplateFile(text, fileName);
      if (!read.templates.length && read.left) return setNotice(`Octet cannot read the templates in ${fileName}.`);
      const { set } = addSetOf(settings, read.set, read.templates);
      if (!set) return setNotice("You have 50 template sets, the most Octet keeps. Remove a set first.");
      setSettings((s) => addSetOf(s, read.set, read.templates).kept);
      showLibrary("template", set);
      const n = read.templates.length, more = read.left ? ` Octet left out ${read.left} that ${read.left > 1 ? "were" : "was"} too large or damaged.` : "";
      setNotice(n ? `Added ${n} template${n > 1 ? "s" : ""} in the set ${set}.${more}` : `Added the empty set ${set}.${more}`, read.left ? "info" : "done");
    } catch (e) {
      setNotice(failure(`Octet cannot open ${fileName}.`, e));
    }
  }
  // Save for ChemDraw… (a set's menu in the library or on a palette's bar, File > Save Templates for ChemDraw, the
  // command palette): a set, the user's or Octet's, as a ChemDraw template file through the Save dialog (.ctp, or .cts
  // stationery: the same file). Its grid is as many columns as the set's palette shows (ChemDraw's five when it is not
  // open), and its panes are the palette's template size (or the library's).
  async function saveTemplateSet(set: string) {
    if (!TAURI) return;
    const list = set === MY_SET || settings.templateSets.includes(set) ? templates.filter((t) => (t.set ?? MY_SET) === set) : LIBRARY.find((c) => c.name === set)?.items ?? [];
    if (!list.length) return setNotice(`The set ${set} has no templates.`, "info");
    const palette = settings.palettes.find((f) => f.set === set);
    try {
      const file = writeTemplateFile(list, set, palette?.columns, palette?.size ?? settings.librarySize);
      if (!file.written) return setNotice(`Octet cannot save the templates in ${set} as a ChemDraw template. They are too large.`);
      const path = await invoke<string | null>("export_file", { export: { name: set, ctp: toBase64(file.bytes) } });
      if (!path) return;
      const more = file.left ? ` Octet left out ${file.left} that ${file.left > 1 ? "were" : "was"} too large for a template file.` : "";
      setNotice(`Saved ${file.written} template${file.written > 1 ? "s" : ""} from ${set} as a ChemDraw template.${more}`, file.left ? "info" : "done");
    } catch (e) {
      setNotice(failure(`Octet cannot save ${set} as a ChemDraw template.`, e));
    }
  }
  // The user's own dictionary (Structure > Add Structure to Dictionary): names.ts gets the names whenever they change,
  // and names drawn before are drawn again, so a name renamed, removed or given a new structure is never drawn from
  // memory.
  const ownNamesFor = useRef<OwnName[]>(undefined);
  if (ownNamesFor.current !== settings.dictionary) {
    ownNamesFor.current = settings.dictionary;
    setOwnNames(settings.dictionary);
    namedMols.clear();
    typedMols.clear();
  }
  // Add to dictionary (right-click, the Actions panel, or Structure > Add Structure to Dictionary…): the selected
  // structure (or, with an atom or bond picked, its whole structure) is kept by a name the user gives (Dialog), with its
  // SMILES and InChI.
  function addToDictionary() {
    const part = templatePart();
    if (!part?.atoms.length) return setNotice("Select a structure first.", "info");
    let smiles = "", inchi: string | undefined;
    try { smiles = toSmiles(part); } catch { smiles = ""; }
    try { inchi = toInchi(part) || undefined; } catch { inchi = undefined; }
    if (!smiles) return setNotice("Octet cannot write this structure as SMILES.");
    setDialog({ kind: "dictionary", name: "", smiles, inchi });
  }
  // Settings > Dictionary: Export… writes the dictionary as a SMILES file with names; Import… reads one (with Import a
  // Structure's file dialog) and adds the names the user does not have. A SMILES Octet cannot read is left out.
  async function exportNames() {
    if (!TAURI) return;
    try { await invoke("export_file", { export: { name: "Octet dictionary", format: "smi", smiles: ownNamesFile(settings.dictionary) } }); }
    catch (e) { setNotice(failure("Octet cannot export the dictionary.", e)); }
  }
  async function importNames() {
    if (!TAURI) return;
    try {
      const picked = await invoke<[string, string] | null>("import_structure");
      if (!picked) return;
      await ready;
      const read = readOwnNamesFile(picked[1]).flatMap((n) => {
        try { const m = parseStructure(n.smiles, false); return m.atoms.length ? [{ ...n, inchi: toInchi(m) || undefined }] : []; } catch { return []; }
      });
      if (!read.length) return setNotice(`There are no names in ${picked[0]}. Octet reads a SMILES file with a name after each SMILES.`);
      const merged = mergeOwnNames(settings.dictionary, read);
      setSettings((s) => ({ ...s, dictionary: mergeOwnNames(s.dictionary, read).list }));
      setNotice(`Added ${merged.added} name${merged.added === 1 ? "" : "s"} to your dictionary.${merged.kept ? ` ${merged.kept} ${merged.kept === 1 ? "was" : "were"} in it already and stayed as ${merged.kept === 1 ? "it was" : "they were"}.` : ""}`, "done");
    } catch (e) {
      setNotice(failure("Octet cannot import this file.", e));
    }
  }
  // A name from the user's own dictionary draws with the name under it, as ChemDraw's does.
  const withOwnCaption = (name: string, frag: Mol): Mol => {
    const own = ownName(name);
    if (!own || !frag.atoms.length) return frag;
    const xs = frag.atoms.map((a) => a.location[0]), ys = frag.atoms.map((a) => a.location[1]);
    return addCaption(frag, { text: own.name, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys) - 1, under: frag.atoms.map((_, i) => i) })[0];
  };
  const selectKind = (settings.variants.select in SELECTS ? settings.variants.select : "box") as SelectKind;
  const symbolKind = (settings.variants.symbol in SYMBOLS ? settings.variants.symbol : "plus") as SymbolKind;
  // The template in hand: a library one or the user's own.
  const templateMol = (kind: string) => templates.find((x) => templateKind(x.id) === kind)?.mol ?? libraryItem(kind)?.mol ?? namedOf(kind);
  const templateVariant = templateMol(settings.variants.template) ? settings.variants.template : "lib:Alanine";
  // The Shape and Bracket tools' choices. A line or arc from the Shape tool is drawn like an arrow, with no head.
  const shapeChoice = shapeSpec(settings.variants.shape) ? settings.variants.shape : "box-plain";
  const bracketChoice = bracketSpec(settings.variants.bracket) ? settings.variants.bracket : "brackets";
  const cycleChoice = settings.variants.cycle && CYCLES[settings.variants.cycle] ? settings.variants.cycle : "circle";
  const sequenceChoice = SEQUENCES[settings.variants.sequence] ? settings.variants.sequence : "peptide";
  const shapePick = shapeSpec(shapeChoice)!, bracketPick = bracketSpec(bracketChoice)!;
  const editCurve = tool === "shape" && "edit" in shapePick; // Edit curve in hand
  const orbitalChoice = orbitalSpec(settings.variants.orbital) ? settings.variants.orbital : "p-shaded";
  // A clicked orbital's tip: s orbitals a third of a bond across, lobes most of a bond long, pointing up, or for a
  // single lobe or hybrid on an atom, out into the atom's widest gap.
  const orbitalTip = (make: Make, from: P, t: Hover): P => {
    const shape = make.orbital?.shape, length = shape === "s" || shape === "oval" ? 0.35 : 0.85;
    const d = (shape === "lobe" || shape === "hybrid") && t.atom !== undefined ? nextDirection(doc, t.atom) : [0, 1];
    return [from[0] + d[0] * length, from[1] + d[1] * length];
  };
  // The shape a drag from one point to another makes with the tool in hand. A circle grows out from where it starts.
  const shapeFrom = (from: P, to: P): Omit<Shape, "id"> | undefined => {
    // A TLC plate gets a lane for about every 1.6 bond lengths of its width.
    if (tool === "tlc") return { kind: "tlc", from, to, tlc: { lanes: Math.max(1, Math.round(Math.abs(to[0] - from[0]) / 1.6)), spots: [] } };
    // A table gets a column for about every 2.2 bond lengths of its width and a row for every 0.9 of its height.
    if (tool === "table") {
      const cols = Math.max(2, Math.min(12, Math.round(Math.abs(to[0] - from[0]) / 2.2))), rows = Math.max(2, Math.min(40, Math.round(Math.abs(to[1] - from[1]) / 0.9)));
      return { kind: "table", from: [Math.min(from[0], to[0]), Math.max(from[1], to[1])], to: [Math.max(from[0], to[0]), Math.min(from[1], to[1])], table: newTable(rows, cols) };
    }
    const spec = tool === "bracket" ? bracketPick : shapePick;
    if (!("shape" in spec)) return undefined;
    const style = { ...("dashed" in spec && spec.dashed ? { dashed: true } : {}), ...("fill" in spec && spec.fill ? { fill: spec.fill } : {}), ...("shadow" in spec && spec.shadow ? { shadow: true } : {}), ...("side" in spec && spec.side ? { side: spec.side } : {}), ...("bold" in spec && spec.bold ? { bold: true as const } : {}) };
    if ("circle" in spec && spec.circle) { const r = Math.hypot(to[0] - from[0], to[1] - from[1]); return { kind: "oval", from: [from[0] - r, from[1] - r], to: [from[0] + r, from[1] + r], ...style }; }
    // An R-group definition takes the next R number (one a label uses with no definition yet, first).
    if ("rgroup" in spec && spec.rgroup) return { kind: "box", from, to, rgroup: { name: nextRGroup(doc) } };
    return { kind: spec.shape, from, to, ...style };
  };
  const arrowPick: ArrowPick = arrowVariant(settings.variants.arrow) ?? { kind: "reaction" };
  const arrowKind = arrowPick.kind;
  // A new arrow of the kind in hand. A curved one is an arc of the sweep in hand, bent to the left of its line, or
  // to the right (side -1) when the drag curved that way.
  // An elliptical one is a pen curve with a head. A size or ratio the variant names comes with it.
  const newArrow = (from: P, to: P, side = 1, make?: Make): Omit<Arrow, "id"> => {
    if (make) return { ...make, from, to, ...(make.bend ? { bend: side * make.bend } : {}) };
    if (arrowPick.ellipse) return ellipseArrow(from, to, arrowPick.ellipse === "cw");
    const head = pickHead(arrowPick);
    return { kind: arrowKind, from, to, ...(curved({ kind: arrowKind }) ? { bend: side * sweepBend(arrowPick.sweep ?? 120) } : {}), ...(head ? { headSize: head } : {}), ...(arrowPick.ratio ? { ratio: arrowPick.ratio } : {}) };
  };
  // The offered sweep nearest an arc's.
  const nearestSweep = (bend: number) => SWEEPS.reduce((best, s) => (Math.abs(s - sweepOf(bend)) < Math.abs(best - sweepOf(bend)) ? s : best));
  const bondSpec: BondSpec = BONDS[bondKind].spec;
  // What the pointer is over, for the cursor and the page and rotation handle highlights: the selection, the
  // selection's rotation handle, a table border with the Table tool (which way it drags), and a page's edge. It
  // changes as the pointer moves, so it lives in a store too.
  // join: where Shift with the Arrow tool would start an arrow joined to another (an end, or a middle point).
  // cycle: the cycle the Cycle tool is over, whose handles show. grab: the Cycle tool is over a structure or text, which
  // a press moves. details: Select is over an experiment's details, which a double-click edits (a text cursor, issue 34).
  const [overs] = useState(() => store<{ selection: boolean; turn: boolean; edge?: "col" | "row"; page?: string; resize?: Side; join?: P; cross?: boolean; cycle?: number; grab?: boolean; details?: boolean }>({ selection: false, turn: false },
    (a, b) => a.selection === b.selection && a.turn === b.turn && a.edge === b.edge && a.page === b.page && a.resize === b.resize && a.join?.[0] === b.join?.[0] && a.join?.[1] === b.join?.[1] && a.cross === b.cross && a.cycle === b.cycle && a.grab === b.grab && a.details === b.details));
  // Where the eraser outline is drawn (drawing coordinates), while the Eraser is in hand. It follows the pointer, so
  // it lives in a store too.
  const [brushes] = useState(() => store<P | undefined>(undefined));
  const setBrush = brushes.set;
  // The atom whose label is being typed, and the text so far. all: every atom the label goes on (several selected
  // atoms, as ChemDraw's ! key labels them all); merge: the step the label joins (> adds a bond, then its label);
  // blank: the box opened empty (the ! and > keys), so closing it with nothing typed keeps the atoms as they were.
  // colour: a colour chosen while typing (the label takes it when the box closes, in the same step); "element": Colour
  // by Element, the colour of the element typed.
  // runs, version, caret and pending: as the caption box's (Writing below): the text in styled runs (bold, italic,
  // underline), and a style set with nothing selected for the next characters typed. font and size: a font or size
  // chosen while typing, for the whole label.
  type Editing = { atom: number; value: string; all?: number[]; merge?: string; blank?: true; colour?: string; runs?: TextRun[]; version?: number; caret?: [number, number]; pending?: RunStyle; font?: string; size?: number };
  const [editing, setEditing] = useState<Editing>();
  const labelApi = useRef<RichApi>(undefined);
  const labelOpen = useRef(false);
  // The last label typed in a label box: the Text tool's Option-click repeats it (ChemDraw's Repeat Last Label).
  const lastLabel = useRef<string>(undefined);
  // The bond tool's last click on an atom, and the drawing it made: a second click there soon after is a double-click.
  const lastClick = useRef<{ atom: number; time: number; after: Mol }>(undefined);
  // The Cycle tool's last click on an arc (a break, or a step made reversible): the step, when, and the drawing it made.
  const lastArc = useRef<{ cycle: number; step: number; time: number; after: Mol }>(undefined);
  // Select's last click on an atom or bond: a second click on it soon after is a double-click. The browser sends no
  // double-click when the first click drew the selection over what the second click presses.
  const lastPick = useRef<{ on: string; time: number }>(undefined);
  // A label's own bold, italic and underline, as a run style (undefined when it has none).
  const ownStyle = (a: Atom): RunStyle | undefined => (a.bold || a.italic || a.underline ? { ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}) } : undefined);
  const editLabel = (atom: number) => {
    const a = doc.atoms[atom], value = a.text ?? (a.label === "C" ? "" : a.label), own = ownStyle(a);
    // The label's own style goes on each run, so the box shows it and it can come off a part.
    labelOpen.current = true;
    setEditing({ atom, value, runs: (a.text && a.runs && plainOf(a.runs) === a.text ? a.runs : [{ text: value }]).map((r) => ({ ...own, ...r })) });
  };
  // Bold, italic, underline and Plain on the label being typed (ChemDraw's Text menu as it is typed): on the characters
  // selected, else on the next ones typed, as in a caption.
  const styleLabel = (patch: (s: RunStyle, all: RunStyle) => RunStyle) => {
    if (!editing) return;
    const runs = editing.runs ?? [{ text: editing.value }], [s, e] = labelApi.current?.range() ?? [editing.value.length, editing.value.length], all = common(runs, s, e);
    if (s === e) return setEditing({ ...editing, runs, pending: patch({ ...(editing.pending ?? all) }, editing.pending ?? all), version: (editing.version ?? 0) + 1, caret: [s, e] });
    setEditing({ ...editing, runs: styleRange(runs, s, e, (st) => patch(st, all)), version: (editing.version ?? 0) + 1, caret: [s, e] });
  };
  // The caption being typed: an existing one (id), or a new one at a point or under a structure, with its style.
  // runs: the text in styled runs as it is typed; version and caret: the box is built again (a style was applied)
  // with the selection there; pending: a style set with nothing selected, for the next characters typed.
  type Writing = { id?: number; value: string; at?: P; under?: number[]; on?: Caption["on"]; cycle?: CycleText; style: Partial<Caption>;
    runs?: TextRun[]; version?: number; caret?: [number, number]; pending?: RunStyle };
  const [writing, setWriting] = useState<Writing>();
  // A citation just pasted plain into the caption (richpaste.ts): where it went and its formatted runs. A bar under the
  // box offers Plain text or Keep formatting until the next key or the box closes.
  const [pasteOffer, setPasteOffer] = useState<{ start: number; plain: string; runs: TextRun[] }>();
  useEffect(() => { if (!writing) setPasteOffer(undefined); }, [writing]);
  const keepFormatting = () => {
    setPasteOffer(undefined);
    if (!writing || !pasteOffer) return;
    const runs = writing.runs ?? [{ text: writing.value }], old = plainOf(runs), at = pasteOffer.start, text = plainOf(pasteOffer.runs);
    if (old.slice(at, at + pasteOffer.plain.length) !== pasteOffer.plain) return;
    let next = styleRange(edited(runs, old.slice(0, at) + text + old.slice(at + pasteOffer.plain.length)), at, at + text.length, (st) => {
      const keep = { ...st };
      delete keep.bold; delete keep.italic; delete keep.underline; delete keep.script;
      return keep;
    });
    let k = at;
    for (const r of pasteOffer.runs) {
      const own: RunStyle = { ...(r.bold ? { bold: true as const } : {}), ...(r.italic ? { italic: true as const } : {}), ...(r.underline ? { underline: true as const } : {}), ...(r.script ? { script: r.script } : {}) };
      next = styleRange(next, k, k + r.text.length, (st) => ({ ...st, ...own }));
      k += r.text.length;
    }
    next = normalise(next);
    setWriting({ ...writing, runs: next, value: plainOf(next), version: (writing.version ?? 0) + 1, caret: [k, k], pending: undefined });
  };
  // True while the caption box is open. Enter, Escape and blur all close it; only the first one counts.
  const writingOpen = useRef(false);
  // The style new text starts with, set from the Actions panel while the Text tool is in hand.
  const [textStyle, setTextStyle] = useState<Partial<Caption>>({});
  const openWriting = (w: Writing) => { writingOpen.current = true; setWriting(w); };
  const richApi = useRef<RichApi>(undefined);
  // The caret moving in the box changes what the Actions panel shows as on (Bold, Subscript and so on): only the panel
  // draws again.
  const [carets] = useState(() => store(0));
  useEffect(() => {
    if (!writing) return;
    const tick = () => carets.set(carets.get() + 1);
    document.addEventListener("selectionchange", tick);
    return () => document.removeEventListener("selectionchange", tick);
  }, [!!writing]); // eslint-disable-line react-hooks/exhaustive-deps
  // The curve the Pen is drawing (its points so far), and where the pointer is, for the segment to it.
  const [pen, setPen] = useState<CurvePoint[]>();
  const [penAt, setPenAt] = useState<P>();
  // The table cell being typed in: its table, row and column, and the text so far.
  const [cell, setCell] = useState<{ id: number; r: number; c: number; value: string }>();
  // The table cell last typed in: the row and column the table actions add, delete and align at.
  const [lastCell, setLastCell] = useState<{ id: number; r: number; c: number }>();
  useEffect(() => { if (cell) setLastCell({ id: cell.id, r: cell.r, c: cell.c }); }, [cell?.id, cell?.r, cell?.c]); // eslint-disable-line react-hooks/exhaustive-deps
  const cellOpen = useRef(false);
  const cellInput = useRef<HTMLInputElement>(null);
  useEffect(() => { cellInput.current?.select(); }, [cell?.id, cell?.r, cell?.c]);
  useEffect(() => { drawCursors().then(setCursors); }, []);
  // A drag on the canvas keeps its cursor wherever the pointer goes until it ends: the closed hand for a handle, the
  // arrows for a resize or a table's edge, else the cursor the canvas showed at the press, as the rotation arrow for a
  // turn (not the Eraser's none, which would lose the pointer over a panel).
  const dragShows = drag?.kind === "handle" ? "grabbing" : drag?.kind === "resize" ? CURSORS[drag.side]
    : drag?.kind === "move" ? "move" : drag?.kind === "tableedge" ? `${drag.axis}-resize` : undefined;
  useEffect(() => {
    const shows = drag && (dragShows ?? (svg.current && getComputedStyle(svg.current).cursor));
    if (!shows || shows === "none") return;
    dragCursor(shows);
    return () => dragCursor();
  }, [drag?.kind, dragShows]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where the centre mark was put (Option-drag, as in ChemDraw): every turn of the selection goes about it until the
  // selection changes.
  const [pivot, setPivot] = useState<P>();
  useEffect(() => setPivot(undefined), [selection, picked]);
  useEffect(() => {
    const was = before.current;
    before.current = doc;
    if (!was || was === doc) return;
    const ids = new Set([...(was.captions ?? []), ...(was.arrows ?? []), ...(was.shapes ?? []), ...(was.cycles ?? [])].map((x) => x.id));
    const item = [...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => !ids.has(x.id)).pop();
    const at: Hover | undefined = doc.atoms.length > was.atoms.length ? { atom: doc.atoms.length - 1 } : item ? (doc.cycles?.some((c) => c.id === item.id) ? { cycle: item.id } : doc.captions?.some((c) => c.id === item.id) ? { caption: item.id } : { arrow: item.id }) : undefined;
    added.current = at ? { mol: doc, at } : undefined;
  }, [doc]);
  const hold = useRef<number>(undefined);
  const svg = useRef<SVGSVGElement>(null);
  const pointer = useRef<P>(undefined);
  // What the last edit added (its first new atom, or else its last new object), for Space.
  const added = useRef<{ mol: Mol; at: Hover }>(undefined), before = useRef<Mol>(undefined);
  // Every edit clears the selection, except a move, which keeps the same atoms selected. Groups keep whole structures,
  // so atoms drawn onto a grouped structure join its group (wholeGroups). Atoms drawn onto a structure turned in 3D
  // take its depth (carryDepth).
  // Returns the drawing as it goes in the history. joinNext: the step that edits during the press under way join (a
  // caption made an atom by a bond tool, then the bond drawn from it).
  const joinNext = useRef<string>(undefined);
  // A structure or text an edit moves or adds onto or beside a catalytic cycle joins it (dropOnCycle). A drag shows
  // the same before it is let go. A caption's box: its own text's, where it is now (a side arrow's text, where its end
  // was dragged).
  const dropBox = (c: Caption): Box => {
    if (isSide(c.cycle)) return [c.x, c.y, c.x, c.y];
    const size = (c.size ?? style.captionSize) / style.bond, lines = c.text.split("\n"), w = Math.max(...lines.map((t) => textWidth(t, size, c.bold, c.italic, fontStack(c.font ?? style.captionFont)))), x = c.x - (c.align === "right" ? w : c.align === "centre" ? w / 2 : 0);
    return [x, c.y - (lines.length - 0.75) * 1.2 * size, x + w, c.y + 0.75 * size];
  };
  const dropped = (m: Mol, skip = false, placed = false) => (m.cycles?.length ? dropOnCycle(m, fragments(m), doc, { skip, placed, box: dropBox, bond: style.bond }) : m);
  // drop false: ⌘ was held, so nothing joins a cycle. "placed": what the edit adds went where the pointer aimed, so it
  // joins a cycle as a structure dragged there does.
  // The drawing the last edit made, so an experiment page grows its Reaction scheme box after an edit only.
  const lastSet = useRef<Mol>(undefined);
  const set = (mol: Mol, keepSelection = false, merge = joinNext.current, drop: boolean | "placed" = true) => {
    // A page spectrum's label moved takes its leader with it (followLeaders), in the same step.
    mol = followLeaders(doc, mol);
    const fitted = placeCentres(carryDepth(doc, settings.warnings ? showWarnedHydrogens(mol) : mol));
    // On an experiment page, a reaction drawn in this drawing (not one opened) gets its stoichiometry grid at once, and
    // the compound numbers follow the compounds' order (numbering.ts).
    const ordered = onTop(doc, wholeGroups(dropped(fitted, !drop, drop === "placed")), fragments), next = expPage && mol.style === doc.style ? renumber(newGrids(doc, ordered)) : ordered;
    lastSet.current = next;
    dispatch({ type: "set", mol: next, merge });
    if (!keepSelection) { setSelection(new Set()); setPicked(new Set()); }
    return next;
  };
  // The drawings made by a scale of the whole drawing, each with how far it zoomed the view (commitScale). Undo and redo
  // of such a scale zoom back and again, so the drawing and the page look as they did.
  const zoomedBy = useRef(new WeakMap<Mol, number>());
  // Clean up, Rotate 180°, Flip, a turn of 15° or more, Align, Distribute, Line up, and a catalytic cycle made or tidied
  // glide into place (FEEL-38). The drawing changes at once, as one undo step. Only the picture on screen moves to it
  // (glide). There is no glide with reduced motion, with more than MOST_GLIDE atoms moving, or for a command that comes
  // again before the last glide is over (a key held down). path: the way there when it is not a straight line (a turn);
  // false: no glide.
  const [glide, setGlide] = useState<{ to: Mol; mol: Mol }>();
  const glideNext = useRef<{ from: Mol; path?: (t: number) => Mol | undefined }>(undefined), glideAt = useRef(0);
  const glideTo = (mol: Mol, path?: ((t: number) => Mol) | false) => {
    const now = performance.now(), again = now - glideAt.current < timing().duration, n = moving(doc, mol);
    glideAt.current = now;
    if (path !== false && !again && !reduced() && n && n <= MOST_GLIDE) glideNext.current = { from: doc, path };
    set(mol, true);
  };
  // The glide starts before the new drawing is first painted, from where the atoms were.
  useLayoutEffect(() => {
    const next = glideNext.current;
    glideNext.current = undefined;
    if (!next) return;
    const to = doc, path = next.path ?? ((t: number) => between(next.from, to, t));
    const step = (t: number) => {
      if (t >= 1) return setGlide(undefined);
      const mol = path(t);
      if (mol) setGlide({ to, mol });
    };
    step(0);
    // A new drawing (an edit, undo) ends the glide at once. Redo can bring back the same drawing, so none is kept.
    const stop = tween(step);
    return () => { stop(); setGlide(undefined); };
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // A structure placed from Name to structure settles from its faint ghost into full ink (FEEL-43): the first atom it
  // has, in the drawing it went into.
  const settleFrom = useRef<number>(undefined), [settle, setSettle] = useState<{ doc: Mol; from: number }>();
  useLayoutEffect(() => {
    const from = settleFrom.current;
    settleFrom.current = undefined;
    if (from !== undefined) setSettle({ doc, from });
    else if (settle) setSettle(undefined); // so a redo to the same drawing does not settle again
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const undo = (redo = false) => {
    const step = redo ? h.stack[h.at + 1] : h.at > 0 ? h.stack[h.at] : undefined, r = step && zoomedBy.current.get(step);
    if (r) setView((v) => ({ ...v, zoom: clampZoom(redo ? v.zoom * r : v.zoom / r) }));
    sayAfter(redo ? "Redo" : "Undo");
    dispatch({ type: redo ? "redo" : "undo" });
    setSelection(new Set());
    setPicked(new Set());
    const back = hovers.get().key && hotOf.current.get(h.stack[Math.max(0, Math.min(h.stack.length - 1, h.at + (redo ? 1 : -1)))]);
    if (back) setHover({ ...back, key: true });
  };
  const [file, setFile] = useState<FileState>(() => rescue.current?.file ?? { saved: EMPTY });
  // Home (decision 0003): where Octet opens (?editor skips it, for tests), with the name box on first launch and the
  // tutorial then, or from Help > Tutorial. Recent drawings come from the app (src-tauri/src/recent.rs), and drawings
  // a crash took from src-tauri/src/recovery.rs.
  // SynthPath: in SynthPath's Draw panel the editor opens on the canvas, not on Home.
  const [home, setHome] = useState(() => rescue.current?.home ?? false);
  // Home opened over a drawing (Home in the File menu) offers to go back to it; Home at the start has nothing to go back to.
  const [overDrawing, setOverDrawing] = useState(false);
  const homeOpen = useRef(home); // for the menu listener, which is set up once
  homeOpen.current = home;
  const [welcomed, setWelcomed] = useState(false), [recents, setRecents] = useState<RecentEntry[]>([]), [recovered, setRecovered] = useState<RecoveredEntry[]>([]);
  const [experiments, setExperiments] = useState<ExperimentEntry[]>([]);
  // The tutorial (Coach.tsx) on a new drawing: which run it is (0 when off), what it saw done, and the tool it points at.
  const [coach, setCoach] = useState(0), [seen, setSeen] = useState<Seen>(NOTHING_SEEN), [coachTool, setCoachTool] = useState<Tool>();
  const saw = (k: keyof Seen) => { if (coach) setSeen((s) => ({ ...s, [k]: s[k] + 1 })); };
  const [away] = useState(() => { const last = loadSettings().lastSeen; return last ? Date.now() - last : 0; });
  const dirty = doc !== file.saved;
  // The drawing the user has, set aside while a template is edited: what recovery keeps and what Quit asks about.
  const mainH = templateEdit?.back.h ?? h, mainFile = templateEdit?.back.file ?? file, mainDoc = mainH.stack[mainH.at], mainDirty = mainDoc !== mainFile.saved;
  const mainName = mainFile.path?.split(/[\\/]/).pop()?.replace(/\.(octet|oct|cdxml)$/i, "") ?? mainFile.name ?? "Untitled";
  // In the app, the first drawing opens in Home's window, as Octet's one window did. After that, what opens from Home or
  // a drawing window opens in a window of its own, unless the window holds an untouched new drawing (as a Mac app
  // reuses its empty Untitled document) and, for Home's window, no other drawing window is open. The open windows, for
  // Home's list, and to bring a drawing that is open already to the front.
  const [openWindows, setOpenWindows] = useState<OpenWindow[]>([]);
  // Settings > General > Windows off: one window, with Home over the drawing, as Octet had before.
  const homeWindow = HOME_WINDOW && settings.windows, drawWindow = DRAW_WINDOW && settings.windows;
  const holds = !!file.path || file.name !== undefined || dirty || !!templateEdit || !!extent(doc) || !!doc.spectra?.length;
  // Home's window counts only the other windows: its own entry can still be on the list a moment after it closes its
  // drawing (Close Window, issue 38).
  const elsewhere = (homeWindow && (holds || openWindows.some((w) => w.label !== "main"))) || (drawWindow && holds);
  // Home over other drawings: a spectrum opens in a new window. Over no drawing, or once Home is closed, it goes in this one.
  const hub = homeWindow && home && elsewhere;
  const claimed = useRef(false); // Home's window took a file to open, before it holds the drawing
  useEffect(() => { if (holds) claimed.current = false; }, [holds]);
  const inNew = (start: Start) => void invoke("open_window", { start }).catch((e) => setNotice(failure("Octet cannot open a new window.", e)));
  const openIn = (path: string | null | undefined) => {
    const there = path ? openWindows.find((w) => w.path === path) : undefined;
    if (there) void invoke("window_show", { label: there.label }).catch(() => {});
    return !!there;
  };

  useEffect(() => { ready.then(() => setLoaded(true)); }, []);
  // Name to structure loads in the background once the window has settled.
  const [namesLoaded, setNamesLoaded] = useState(false);
  // The names engine loads in the background soon after start, so Structure to name is ready when first asked. Its
  // start-up is one long step, so it waits until there is no pointer or key input for 1.5 s: it does not stop the
  // window while the user draws. Asking for a name loads it at once.
  useEffect(() => {
    const input = ["pointerdown", "pointermove", "keydown", "wheel"];
    let t = 0;
    const wait = () => { clearTimeout(t); t = window.setTimeout(start, 1500); };
    const stop = () => { clearTimeout(t); input.forEach((e) => removeEventListener(e, wait, true)); };
    function start() { stop(); void loadNames().then(() => setNamesLoaded(true)).catch(() => {}); }
    input.forEach((e) => addEventListener(e, wait, { capture: true, passive: true }));
    wait();
    return stop;
  }, []);
  // The text in the name-to-structure field, while it is open.
  const [naming, setNaming] = useState<string>();
  // Names drawn before: five under the field, or all fifty when opened. at: the row the arrow keys are on.
  const [recent, setRecent] = useState<{ all: boolean; at: number }>({ all: false, at: -1 });
  useEffect(() => setRecent({ all: false, at: -1 }), [naming === undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each name is kept with its structure (as SMILES), so it draws again whatever happens to the name lists.
  const rememberName = (name: string, frag: Mol) => {
    let smiles = "";
    try { smiles = toSmiles(frag); } catch { /* kept by name alone */ }
    setSettings((s) => ({ ...s, nameHistory: [{ name, smiles }, ...s.nameHistory.filter((n) => n.name.toLowerCase() !== name.toLowerCase())].slice(0, 50) }));
  };
  const historyMols = useRef(new Map<string, Mol | undefined>());
  const nameField = useRef<HTMLInputElement>(null);
  // A structure for a chemical name, laid out, or undefined (also until the names engine has loaded).
  // A list of names ("benzaldehyde, aniline; acetic acid", or one a line) gives each structure in a row, in order.
  // smiles: the name already read (nameToSmiles; null when it does not read), so it is not read twice.
  const structureFor = (name: string, smiles: string | null | undefined = loaded ? nameToSmiles(name) : undefined): Mol | undefined => {
    if (!smiles) return undefined;
    const key = `${name}\n${smiles}`;
    if (typedMols.has(key)) return typedMols.get(key);
    let m: Mol | undefined;
    try {
      // A metallocene (ferrocene) is drawn as a sandwich, not as the ions the name gives.
      const list = nameList(name, nameToSmiles);
      m = list?.join(".") === smiles ? inRow(list.map((t) => sandwich(parseStructure(t)))) : sandwich(parseStructure(smiles));
      if (!m.atoms.length) m = undefined;
    } catch { m = undefined; }
    if (typedMols.size >= 200) typedMols.clear();
    typedMols.set(key, m);
    return m;
  };
  // A structure for typed or pasted text: a chemical name first (Octet's own names, drugs and formulas too), then
  // SMILES, InChI or a MOL file when the text looks like one. Indigo reads words such as "aspirin" as query atoms,
  // so a word is never read as SMILES. Text of several lines that is not a file can be a list of names.
  // refused gets the reason when the text is over Octet's limits.
  const structureFromText = (text: string, refused?: (why: string) => void, smiles?: string | null): Mol | undefined => {
    const s = text.trim(), lines = s.includes("\n");
    const named = lines && /V[23]000|M {2}END|\$RXN|\$RDFILE|^[<{]/.test(s) ? undefined : structureFor(s, smiles);
    if (named || !loaded || !(lines || looksLikeSmiles(s))) return named;
    // A MOL file keeps its first line, which is often blank (the name).
    try { const m = parseStructure(lines ? text.trimEnd() : s); return m.atoms.length ? asOpened(m, text) : undefined; } catch (err) { if (err instanceof RangeError) refused?.(err.message); return undefined; }
  };
  // Octet's own names that begin as typed (TREN and Tris for "TR"). Drawing one takes a few milliseconds, so while typing
  // (read false) only the ones drawn before come; once typing pauses (read true), all of them and the name as typed, or
  // Octet's suggestion for it.
  const namesFor = (q: string, read: boolean, most: number) => {
    const names = namesStarting(q, most).filter((name) => read || namedMols.has(name)), typed = read ? (nameToSmiles(q) ? q.trim() : suggestName(q, false)) : undefined;
    return typed && !names.some((n) => commonKey(n) === commonKey(typed)) ? [...names, typed] : names;
  };
  // The template library's results for names (LibraryPanel), each a template.
  const findNamed = useMemo(() => (q: string, read: boolean): LibraryItem[] => !loaded || !namesLoaded ? [] : namesFor(q, read, 8).flatMap((name) => {
    const mol = namedMol(name);
    return mol ? [{ kind: namedKind(name), name, category: "Names", mol }] : [];
  }), [loaded, namesLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // A structure for a name typed with a slip in it: the name as typed, or else Octet's suggestion (thorough: from every
  // name one keystroke away too, 30 to 90 ms).
  const structureOrSuggestion = (text: string, thorough = false): { frag: Mol; name: string } | undefined => {
    const frag = structureFromText(text);
    if (frag) return { frag, name: text.trim() };
    const fixed = suggestName(text, thorough), mended = fixed ? structureFor(fixed) : undefined;
    return fixed && mended ? { frag: mended, name: fixed } : undefined;
  };
  // After an edit, the thing under a still pointer may have changed.
  // A keyboard hotspot stays on its atom or bond while that is still there (keepHot), or goes where a key put it.
  const lastDoc = useRef(doc);
  useEffect(() => {
    const now = hovers.get(), was = lastDoc.current, mine = hotOf.current.get(doc);
    lastDoc.current = doc;
    if (now.key && mine && mine.atom === now.atom && mine.bond === now.bond) return;
    const kept = now.key ? keepHot(was, doc, now) : undefined;
    if (kept) setHover({ ...kept, key: true });
    else if (pointer.current || now.key) setHover(pointer.current ? hit(pointer.current) : {});
  }, [doc]);

  const name = file.path?.split(/[\\/]/).pop()?.replace(/\.(octet|oct|cdxml)$/i, "") ?? file.name ?? "Untitled";
  useEffect(() => { if (TAURI) getCurrentWindow().setTitle(home ? "Octet Draw" : dirty ? `${name} (edited)` : name); }, [name, dirty, home]);

  // A picture of part of the drawing (or all of it) as a standalone SVG at true size: the canvas shows only that part
  // for a moment (nothing is painted in between), and the picture is cut to the ink of what it draws.
  function pictureOf(part: Mol): string | undefined {
    const canvas = svg.current;
    if (!canvas) return undefined;
    flushSync(() => setExporting(part));
    try {
      const box = canvasInk(canvas);
      return box && standaloneSvg(canvas, box, 1 / pt);
    } finally {
      flushSync(() => setExporting(undefined));
    }
  }
  // What other programs read: CDXML, CDX (ChemDraw's binary form of the same drawing, as base64), a .oct file (the same
  // CDXML with Octet's drawing), and the molecules as a molfile, SMILES and InChI; undefined where Octet or Indigo cannot
  // write them. Each is made when it is first asked for and kept with the part (the drawing itself, or the selection's
  // part from selectedPart), so Export and Copy make only what they use, once for each version of the drawing. They are
  // made again when the style, the name, Indigo or the arrows of a catalytic cycle (what cdxmlOptions gives) change.
  const made = useRef(new WeakMap<Mol, { style: DocStyle; name: string; loaded: boolean; derived: unknown; formats: Partial<Record<PartFormat, string>> }>());
  function formatOf(part: Mol, f: PartFormat): string | undefined {
    let kept = made.current.get(part);
    if (kept?.style !== style || kept.name !== name || kept.loaded !== loaded || kept.derived !== cycleArrows) made.current.set(part, kept = { style, name, loaded, derived: cycleArrows, formats: {} });
    if (f in kept.formats) return kept.formats[f];
    const cdxml = f === "oct" || f === "cdx" ? formatOf(part, "cdxml") : undefined;
    let out: string | undefined;
    try {
      out = (f === "cdxml" ? toCdxml(part, savedStyle(), cdxmlOptions()) : f === "oct" ? cdxml && writeOct(part, savedStyle(), cdxmlOptions(), cdxml)
        : f === "cdx" ? cdxml && toBase64(xmlToCdx(parseXml(cdxml)))
        : loaded ? ((m) => (m.atoms.length ? chemistryOf(m, f) : undefined))(withCaptionAtoms(part, style.interpret).mol) : undefined) || undefined;
    } catch { out = undefined; }
    return (kept.formats[f] = out);
  }
  // A part's molecules or reactions as MDL files and SMILES. A drawing with reactions copies as reaction SMILES (one line
  // for each step, with its map numbers); an RXN file holds one step, an RD file every step.
  function chemistryOf(part: Mol, f: PartFormat): string | undefined {
    const v2000 = f.endsWith("2000"), kind = f.replace("2000", "");
    if (f === "inchi") return toInchi(part);
    if (f === "molfile" || kind === "mol") return toMolfile(part, f === "molfile" || v2000);
    if (kind === "sdf") return toSdf(part, v2000);
    const steps = stepsIn(part);
    if (f === "smiles") return steps.length ? toReaction(part, steps, "smiles") : toSmiles(part);
    if (kind === "rxn") return steps.length === 1 ? toReaction(part, steps, "rxn", v2000) : undefined;
    return steps.length ? toReaction(part, steps, "rdf", v2000) : undefined;
  }
  // The ink of what the canvas shows (px, in the drawing's frame): every drawn element but Octet's own layers and what
  // only shapes others (defs, masks, clips). Text
  // by its glyphs (inkOfText), and a stroke by half its width (a square cap or mitred join by √2 times that).
  function canvasInk(canvas: SVGSVGElement): [number, number, number, number] | undefined {
    const world = canvas.querySelector<SVGGElement>("#world"), inv = world?.getCTM()?.inverse();
    if (!world || !inv) return undefined;
    let box: [number, number, number, number] | undefined;
    for (const el of world.querySelectorAll<SVGGraphicsElement>("path, polygon, polyline, line, rect, circle, ellipse, text, image, use")) {
      // What only shapes others (a shadow's mask, a clip, a gradient) is not ink: a shadowed box's mask is a square
      // 200,000 px wide, which made its export 150,000 pt across.
      if (el.closest(UI) || el.closest("defs, mask, clipPath, pattern, marker, symbol, filter")) continue;
      const g = el.getBBox(), m = el.getCTM(), s = getComputedStyle(el);
      const t = el instanceof SVGTextElement ? inkOfText(el, glyphInk) : undefined;
      const sw = s.stroke !== "none" && s.strokeOpacity !== "0" ? (parseFloat(s.strokeWidth) || 0) / 2 * (s.strokeLinecap === "square" || s.strokeLinejoin === "miter" ? Math.SQRT2 : 1) : 0;
      const b = t ? { x: t[0] - sw, y: t[1] - sw, width: t[2] - t[0] + 2 * sw, height: t[3] - t[1] + 2 * sw } : { x: g.x - sw, y: g.y - sw, width: g.width + 2 * sw, height: g.height + 2 * sw };
      if ((!g.width && !g.height) || !m) continue;
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const q = new DOMPoint(x, y).matrixTransform(inv.multiply(m));
        box = box ? [Math.min(box[0], q.x), Math.min(box[1], q.y), Math.max(box[2], q.x), Math.max(box[3], q.y)] : [q.x, q.y, q.x, q.y];
      }
    }
    return box;
  }
  // File > Print (⌘P): every page the drawing covers, at true size, the drawing where it sits on them, as pictures the
  // print layout shows alone (the editor's chrome is hidden for printing), then the system's print dialog. The pages
  // tile the canvas from the document's page, as ChemDraw's poster pages do, in reading order. File > Print Selection
  // prints the selection alone, on the pages it covers (ChemDraw's Print dialog: Selection).
  const [printing, setPrinting] = useState<{ srcs: string[]; w: number; h: number }>();
  async function printDrawing(selectionOnly = false) {
    const canvas = svg.current, [, w, h] = pages[0], pw = w * mm * L, ph = h * mm * L;
    const part = selectionOnly ? selectedPart() : doc;
    if (!canvas) return;
    if (!part) return setNotice("Select what to print first.", "info");
    flushSync(() => setExporting(part));
    const texts: string[] = [];
    try {
      const { count, pages: sheets } = pagesOver(canvasInk(canvas) ?? [0, 0, 0, 0], pw, ph);
      if (count > MAX_PRINT_PAGES) return setNotice(`The drawing covers ${count} pages. Octet prints ${MAX_PRINT_PAGES} pages at most. Move the drawing nearer to the page, or make it smaller.`);
      for (const [i, j] of sheets) texts.push(standaloneSvg(canvas, [(i - 0.5) * pw, (j - 0.5) * ph, (i + 0.5) * pw, (j + 0.5) * ph], 1 / pt));
    } finally { flushSync(() => setExporting(undefined)); }
    const srcs = texts.map((text) => {
      const bytes = new TextEncoder().encode(text);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return `data:image/svg+xml;base64,${btoa(bin)}`;
    });
    const size = { w: (w * 72) / 25.4, h: (h * 72) / 25.4 };
    // The paper size, as an @page rule in a sheet made here: the CSP allows no <style> element (REL-31).
    pageSheet ??= new CSSStyleSheet();
    pageSheet.replaceSync(`@page { size: ${size.w.toFixed(2)}pt ${size.h.toFixed(2)}pt; margin: 0; }`);
    if (!document.adoptedStyleSheets.includes(pageSheet)) document.adoptedStyleSheets = [...document.adoptedStyleSheets, pageSheet];
    flushSync(() => setPrinting({ srcs, ...size }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try { await invoke("print_page"); } catch (e) { setNotice(failure("Octet cannot print.", e)); }
  }
  // The selection as a drawing of its own, kept while the drawing and the selection stay the same.
  const partKept = useRef<{ doc: Mol; selection: Set<number>; picked: Set<number>; part: Mol }>(undefined);
  // Where a caption is drawn, and how it is lined up there: a picked caption copied without its structure, arrow or
  // cycle, or left when they are deleted, goes there as free text and keeps its place.
  const drawnAt = (c: Caption) => { const q = placed.find((x) => x.id === c.id); return q && anchorOf(q); };
  const drawnAlign = (c: Caption) => { const q = placed.find((x) => x.id === c.id); return q && ({ start: "left", middle: "centre", end: "right" } as const)[q.anchor]; };
  const selectedPart = () => {
    if (!selection.size && !picked.size) return undefined;
    const s = partKept.current;
    if (s?.doc === doc && s.selection === selection && s.picked === picked) return s.part;
    return (partKept.current = { doc, selection, picked, part: extractSelection(doc, selection, picked, drawnAt, drawnAlign) }).part;
  };
  // Export… (⌃⌘E, and the Export button): the settings first, with the whole drawing's picture and, when something is
  // selected, the selection's. The chosen format is made when the dialog shows it. Then the Save dialog for that format.
  function openExport() {
    const sel = selectedPart();
    setExportView({ all: pictureOf(doc), selection: sel && pictureOf(sel), parts: { all: doc, selection: sel } });
  }
  const filePrefs = settings.files;
  async function exportPart(part: "all" | "selection") {
    const v = exportView, svg = v?.[part], mol = v?.parts[part], f = filePrefs;
    if (!v || !mol) return;
    // Only what the format needs: a PDF, PNG or EMF carries the CDXML, so it opens and pastes back as the drawing.
    const make = (pf: PartFormat, ...fs: ExportFormat[]) => (fs.includes(f.format) ? formatOf(mol, pf) : undefined);
    try {
      const pic = svg ? pictureAs(svg, f, pageColour(style)) : undefined;
      const path = await exportFile({ name, format: f.format, oct: make("oct", "oct"), svg: pic?.svg, cdxml: make("cdxml", "cdxml", ...CARRY_CDXML), cdx: make("cdx", "cdx"), mdl: MDL.includes(f.format) ? formatOf(mol, f.format as PartFormat) : undefined, smiles: make("smiles", "smi"), inchi: make("inchi", "inchi"), dpi: f.dpi, transparent: pic?.transparent, quality: f.quality });
      if (path) { setExportView(undefined); saved(path); }
    } catch (e) {
      setNotice(failure("Octet cannot export this drawing.", e));
    }
  }
  // Quick export: the selection, or the whole drawing, straight to the Save dialog in the Quick export format (PNG
  // at first; SVG or EMF for Office, PDF for LaTeX), with the saved settings. A PDF, PNG or EMF carries the CDXML, as
  // Export's does.
  async function quickExport() {
    const part = selectedPart() ?? doc, svg = pictureOf(part), f = filePrefs, format = filePrefs.quick;
    if (!svg) return setNotice("There is nothing to export.", "info");
    try {
      const pic = pictureAs(svg, { ...f, format }, pageColour(style));
      const path = await exportFile({ name, format, svg: pic.svg, cdxml: CARRY_CDXML.includes(format) ? formatOf(part, "cdxml") : undefined, dpi: f.dpi, transparent: pic.transparent, quality: f.quality });
      if (path) saved(path);
    } catch (e) {
      setNotice(failure("Octet cannot export this drawing.", e));
    }
  }
  // A file written where the user chose (an export, or a save to a new place): its name, and a button that shows it
  // in the system's file manager.
  function saved(path: string) {
    const reveal = TAURI && { label: navigator.platform.startsWith("Mac") ? "Show in Finder" : "Show in Folder", run: () => void invoke("reveal_file", { path }).catch((e) => setNotice(failure("Octet cannot show this file.", e))) };
    setNotice(`Saved ${fileName(path)}.`, "done", reveal || undefined);
  }
  // What the CDXML writer needs from the editor: a catalytic cycle's arrows (drawn from the cycle, so not in the
  // drawing), each written label's atoms for ChemDraw's abbreviations, and the document's name.
  const cdxmlOptions = (): CdxmlOptions => ({
    derived: cycleArrows, name,
    expand: (text) => { const smiles = loaded ? labelSmiles(text) : undefined; try { return smiles ? parseStructure(smiles) : undefined; } catch { return undefined; } },
  });
  // What Octet could not hold from a ChemDraw file, said once: "Octet left out 6 annotations and 1 rotated shape."
  const sayLost = (lost: Record<string, number>) => { if (Object.keys(lost).length) setNotice(`Octet left out ${lostText(lost)}.`); };
  // Resolves true when the drawing was saved. Over a file another app changed since Octet opened or saved it (issue 2),
  // Save asks first, as Mac apps do: Save Anyway writes over it, Save As keeps it. Over a file that had things Octet
  // could not hold (REL-11), Save asks too: Save As keeps the original file, Replace writes over it. anyway: the first
  // question was answered.
  async function save(as: boolean, replace = false, anyway = false): Promise<boolean> {
    if (!as && !anyway && file.path && TAURI && await invoke<boolean>("file_changed", { path: file.path }).catch(() => false))
      return new Promise((done) => setDialog({ kind: "changed", done }));
    if (!as && !replace && file.path && file.lost) {
      const lost = file.lost;
      return new Promise((done) => setDialog({ kind: "lossy", lost, done }));
    }
    try {
      // A .cdx file, or one the Save dialog could make, gets ChemDraw's binary form too (decision 0009).
      const cdx = as || !file.path || /\.cdx$/i.test(file.path) ? toBase64(writeCdx({ ...doc, guides }, savedStyle(), cdxmlOptions())) : undefined;
      const path = await invoke<string | null>("save_drawing", { path: as ? null : (file.path ?? null), name, contents: writeOct({ ...doc, guides }, savedStyle(), cdxmlOptions()), cdx, format: settings.files.saveAs });
      if (path) setFile({ path, saved: doc });
      // A save to a new place says where it went. A save in place does not: the window's title shows it.
      if (path && path !== file.path) saved(path);
      return !!path;
    } catch (e) {
      setNotice(failure("Octet cannot save this drawing.", e));
      return false;
    }
  }
  // Before the drawing is replaced (New, Open, a recent drawing) or the window closes: with unsaved changes, ask to
  // save them first. stay: what runs when the drawing stays (Cancel, or a save that did not happen).
  // While a template is open on the canvas, nothing replaces the drawing: the template is saved or cancelled first.
  const keepWork = (next: () => void, stay?: () => void) => {
    if (templateEdit) { setNotice("Save or cancel the template first.", "info"); return stay?.(); }
    return dirty ? setDialog({ kind: "unsaved", next, stay }) : next();
  };
  // Close, Quit (REL-2) and Update: after the question about unsaved changes, the copy kept for recovery goes, then
  // Octet does then (closes the window, or installs the update). A quit from the Dock or a logout waits for the answer
  // (src-tauri/src/quit.rs): when the drawing stays, it stops.
  const leave = (then: () => Promise<unknown>) => keepWork(() => {
    clearTimeout(keeper.timer);
    keeper.timer = 0;
    keeper.kept = false;
    void keep("recovery_clear").catch(keepFailed()).then(then).catch((e) => setNotice(failure("Octet cannot do this.", e)));
  }, () => { if (TAURI) invoke("quit_answer", { quit: false }).catch(() => {}); });
  const closeWindow = () => leave(() => invoke("close_window"));
  // Close Window and the window's close button (issue 38). On Windows and Linux, closing the drawing in Home's window
  // shows Home there again, and closing the last drawing window opens Home (src-tauri/src/windows.rs close_window), so
  // Octet is never left running with no window. On the Mac the window closes and Octet stays open, as a Mac app does.
  // Quit (and a quit from outside Octet) still closes each window. With Home showing (and in one window, Settings >
  // windows off) the window closes, so the close button always closes it in the end.
  const closeDrawing = () => MAC || home ? closeWindow() : DRAW_WINDOW ? leave(() => invoke("close_window", { home: true })) : leave(async () => {
    const fresh = set(EMPTY);
    setFile({ saved: fresh }); setHome(true); setOverDrawing(false); setCoach(0);
  });
  // Updates (decision 0010, src-tauri/src/update.rs): a check when Octet opens, only if the user said yes to it, and
  // Check for Updates…. An update found asks before it installs, but never over another question: then it asks at the
  // next check. asked: the user chose Check for Updates, so the result shows also when there is no update or no network.
  const checkUpdates = (asked: boolean) => {
    if (!TAURI) return;
    void invoke<string | null>("update_check").then(
      (version) => (version ? setDialog((d) => d ?? { kind: "update", version }) : asked && setNotice("Octet is up to date.", "done")),
      () => asked && setNotice("Octet cannot check for updates. Connect to the internet and try again."),
    );
  };
  useEffect(() => {
    if (!settings.updates || DRAW_WINDOW) return;
    const t = setTimeout(() => checkUpdates(false), 5000);
    return () => clearTimeout(t);
  }, [settings.updates === true]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!TAURI) return;
    const off = getCurrentWindow().onCloseRequested((e) => { e.preventDefault(); commands.current.close(); });
    return () => void off.then((f) => f());
  }, []);
  // With unsaved changes, the Dock's Quit, a logout or a restart waits and sends Quit here (src-tauri/src/quit.rs).
  // A template open on the canvas counts too: Quit asks, and the page says to save or cancel it first.
  const unsaved = mainDirty || !!templateEdit;
  useEffect(() => { if (TAURI) invoke("set_edited", { edited: unsaved }).catch(() => {}); }, [unsaved]);
  // Home's window is on the list while it holds a drawing, so the drawing is not opened again elsewhere.
  const listed = DRAW_WINDOW || (homeWindow && holds);
  useEffect(() => {
    if (listed) invoke("window_info", { name: mainName, path: mainFile.path ?? null, edited: unsaved, picture: null }).catch(() => {});
    else if (homeWindow) invoke("window_empty").catch(() => {});
  }, [listed, mainName, mainFile.path, unsaved]); // eslint-disable-line react-hooks/exhaustive-deps
  // Recovery that fails goes to the crash log, and the user hears once that Octet keeps no copy (issue 2). A copy that
  // does not clear is only logged.
  const keepFailed = (what?: string) => (e: unknown) => {
    logError(`Recovery: ${e instanceof Error ? e.message : String(e)}`);
    if (what && !keeper.told) { keeper.told = true; setNotice(failure(what, e)); }
  };
  // Recovery keeps the user's drawing: while a template is edited, the drawing set aside.
  useEffect(() => {
    if (!TAURI) return;
    if (!mainDirty) { if (keeper.kept) { keeper.kept = false; keep("recovery_clear").catch(keepFailed()); } return; }
    if (!keeper.timer) keeper.timer = window.setTimeout(() => { keeper.timer = 0; keeper.last = Date.now(); keeper.write(); }, Math.max(1000, keeper.last + 10_000 - Date.now()));
  }, [mainDoc, mainDirty]);
  // The editor as last drawn: the copy the timer writes, and the error boundary's rescue. The copy is Octet's own
  // form of the drawing only, which readOct reads as it reads a .oct. For an 8 MB drawing with pictures it takes
  // 12 ms to make, and a whole .oct takes 0.3 s, so the editor does not stop every 10 s.
  useEffect(() => {
    const kept = templateEdit ? mainDoc : { ...doc, style: savedStyle() };
    const contents = () => (templateEdit ? writeOct(mainDoc, readStyle(mainDoc.style ?? newStyle), cdxmlOptions()) : writeOct(doc, savedStyle(), cdxmlOptions()));
    keeper.write = () => {
      if (!mainDirty) return;
      try { keeper.kept = true; keep("recovery_write", { name: mainName, contents: serialize(kept) }).catch(keepFailed("Octet cannot keep a copy of this drawing for recovery.")); } catch { /* kept at the next edit */ }
    };
    rescue.current = { h: mainH, file: mainFile, home, name: mainName, contents };
  });
  // After a crash, the next start offers the log (src-tauri/src/crashlog.rs), to show or to email. Nothing is sent
  // unless the user chooses.
  useEffect(() => {
    if (!TAURI || DRAW_WINDOW || crashOffered) return;
    crashOffered = true;
    invoke<string | null>("crash_report").then((log) => { if (log) setDialog({ kind: "crashed", log }); }).catch(() => {});
  }, []);
  // A new drawing for Quick start or a purpose (IDEA-SIZE-1): its style and page, at the middle of the window and the
  // open zoom. ⌘N starts the one picked last, as ChemDraw's New takes the stationery used last; Return on Home starts
  // Quick start.
  // An experiment page starts with its details (Date today) and its text, from its template.
  // New from a window that shows a drawing, even an untouched blank one, opens a window of its own (issue 38): a blank
  // page put in place of a blank page looks as if New did nothing. here: a new drawing window starts its own drawing.
  const newDrawing = (id = settings.purpose, here = false) => elsewhere || (!here && ((homeWindow && !home) || drawWindow)) ? inNew({ new: id }) : keepWork(() => {
    const style = styleFor(settings, id), own = settings.ownPurposes.find((p) => p.id === id);
    let template: Mol | undefined;
    try { template = own?.start ? parse(own.start) : undefined; } catch { template = undefined; }
    const fresh: Mol = { ...EMPTY, style, ...(purposeOf(settings, id)?.kind === "experiment" ? newExperiment(pageSize(style), style.bond, template) : {}) };
    drawingColours.current = []; set(fresh); setFile({ saved: fresh }); setGuides(freshGuides([0, 0], style)); setHome(false); setCoach(0); openView(style);
    setSettings((s) => ({ ...s, purpose: id === QUICK || purposeOf(s, id) ? id : QUICK }));
  });
  // The tutorial is always on Paper (IDEA-SIZE-14): its steps are made for a manuscript's sizes.
  const startTutorial = () => elsewhere ? inNew({ tutorial: true }) : keepWork(() => {
    const style = styleFor(settings, "paper"), fresh: Mol = { ...EMPTY, style };
    set(fresh); setFile({ saved: fresh }); setGuides(freshGuides([0, 0], style)); setHome(false); openView(style); setTool("bond"); setSeen(NOTHING_SEEN); setCoach((n) => n + 1);
    setSettings((s) => ({ ...s, tutorialDone: true }));
  });
  // The open view for a new drawing in a style: the page's middle in the window's middle, at the open zoom. The page
  // outlines do not grow into place.
  const openView = (d: DocStyle) => { lastK.current = frameStyle(d, L).k * d.scale; outlineFrom.current = undefined; setView({ x: frameWidth() / 2, y: frameMidY(), zoom: openZoom(d) }); };
  // File > Apply Settings From File… (ChemDraw's Apply Document Settings from > Other…): the open drawing takes the
  // whole style of another drawing (.oct or ChemDraw's CDXML): its lengths, text, labels, page and background, with
  // one undo step. Its purpose stays, so its outlines do too.
  async function applyStyleFile() {
    try {
      const text = await invoke<string | null>("pick_style_file");
      if (text === null) return;
      const from = readOct(text).mol.style;
      if (!from) return setNotice("This file has no document settings.");
      const next = readStyle({ ...from, purpose: style.purpose });
      set({ ...scaleSizes(doc, next.scale / style.scale), style: next }, true);
    } catch (e) {
      setNotice(failure("Octet cannot read this file.", e));
    }
  }
  // Settings > Document > For, and For in the command palette: the open drawing takes a purpose's sizes and page in one
  // undo step. The sizes it holds in points go with the scale (decision 0007).
  const applyPurpose = (id: string) => {
    const next = forPurpose(style, styleFor(settings, id));
    set({ ...scaleSizes(doc, next.scale / style.scale), style: next }, true);
  };
  // Every purpose, for Home, Settings, File > New For and the command palette: Octet's four, then the user's own.
  const purposeList = useMemo(() => [
    ...(Object.keys(PURPOSES) as PurposeKind[]).map((kind) => ({ id: kind as string, name: PURPOSES[kind].name, kind, style: styleFor(settings, kind) })),
    ...settings.ownPurposes.map((p) => ({ id: p.id, name: p.name, kind: p.kind, style: p.style, own: true })),
  ], [settings.purposeStyles, settings.ownPurposes]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Use for new documents": the style becomes its purpose's style for new drawings (with no purpose: Quick start's).
  // "Save as template…" (and Custom template on Home): a style becomes a purpose of the user's own, after the others.
  // The same name again saves over it. It gives the template's id.
  const keepForNew = (d: DocStyle) => setSettings((s) => {
    const id = purposeOf(s, d.purpose) ? d.purpose! : QUICK, { purpose: _, ...plain } = d, kept = id === QUICK ? plain : { ...d, purpose: id };
    return s.ownPurposes.some((p) => p.id === id) ? { ...s, ownPurposes: s.ownPurposes.map((p) => (p.id === id ? { ...p, style: kept } : p)) }
      : { ...s, purposeStyles: { ...s.purposeStyles, [id]: kept } };
  });
  // A template of the user's own goes from Home, File > New For and Settings; New then starts Quick start if it started that one.
  const removePurpose = (id: string) => setSettings((s) => ({ ...s, ownPurposes: s.ownPurposes.filter((p) => p.id !== id), purpose: s.purpose === id ? QUICK : s.purpose }));
  // A template made from an experiment page keeps its details and text (experiment.ts templateOf); one made from
  // another template keeps that template's.
  const savePurpose = (name: string, from: DocStyle = style) => {
    const same = settings.ownPurposes.find((p) => p.name.toLowerCase() === name.toLowerCase()), id = same?.id ?? `u${Date.now().toString(36)}`;
    const kind = purposeOf(settings, from.purpose)?.kind ?? "paper", start = kind !== "experiment" ? undefined : from === style ? serialize(templateOf(doc)) : settings.ownPurposes.find((p) => p.id === from.purpose)?.start;
    const own = { id, name, kind, style: { ...from, purpose: id }, ...(start ? { start } : {}) };
    setSettings((s) => ({ ...s, ownPurposes: s.ownPurposes.some((p) => p.id === id) ? s.ownPurposes.map((p) => (p.id === id ? own : p)) : [...s.ownPurposes, own].slice(0, MAX_PURPOSES) }));
    return id;
  };
  // Custom template on Home: the template being made, which Settings > Document shows and changes in place of the
  // drawing's style until Settings closes.
  const [making, setMaking] = useState<string>();
  const madeTemplate = settings.ownPurposes.find((p) => p.id === making);
  const changeTemplate = (id: string, change: Partial<OwnPurpose>) => setSettings((s) => ({
    ...s, ownPurposes: s.ownPurposes.map((p) => (p.id === id ? { ...p, ...change, id, style: { ...(change.style ?? p.style), purpose: id } } : p)),
  }));
  // File > New For lists the user's purposes, and File > New shows the purpose it starts: the menu bar is built again
  // when they change.
  const purposeMenu = JSON.stringify([settings.ownPurposes.map((p) => p.name), purposeOf(settings, settings.purpose)?.name ?? ""]);
  useEffect(() => {
    const [names, current] = JSON.parse(purposeMenu);
    if (TAURI) invoke("set_purposes", { names, current }).then(syncChecks).catch(() => {});
  }, [purposeMenu]); // eslint-disable-line react-hooks/exhaustive-deps
  const openDrawing = () => (elsewhere ? void open() : keepWork(() => void open()));
  // File > Revert to Saved: after the question macOS asks, the drawing's file read again. One step to undo.
  const revertToSaved = () => {
    if (!file.path || !TAURI) return setNotice("This drawing has no saved file.", "info");
    if (!dirty) return setNotice("There are no changes since the last save.", "info");
    setDialog({ kind: "revert" });
  };
  const revert = () => void invoke<string>("revert_drawing", { path: file.path }).then((text) => load(file.path, text)).catch((e) => setNotice(failure("Octet cannot revert this drawing.", e)));
  // Back in front: a drawing with no unsaved changes whose file another app changed opens again, as Mac apps do. One
  // step to undo. With unsaved changes, Save asks before it writes over the file (issue 2). An edit made meanwhile (the
  // click that brought the window to the front can draw) stays, and Save asks.
  useEffect(() => {
    if (!TAURI || !fronted || !file.path || dirty || home || templateEdit) return;
    const at = doc;
    void invoke<boolean>("file_changed", { path: file.path }).then((changed) => { if (changed && now.current === at) revert(); }).catch(() => {});
  }, [fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  // A drawing on the recent list or in a project on Home (only those open without the file dialog).
  const openRecent = (r: { path: string }) => openIn(r.path) ? undefined : elsewhere ? inNew({ recent: r.path }) : r.path === file.path && overDrawing ? setHome(false) : keepWork(() => void homeCall<[string, string]>("open_recent", { path: r.path }).then((picked) => load(picked[0], picked[1]))
    .catch((e) => { setNotice(failure("Octet cannot open this drawing.", e)); refreshRecents(); }));
  // A recovered drawing opens with its changes unsaved; its kept copy becomes this window's.
  const openRecovered = (r: RecoveredEntry) => elsewhere ? inNew({ recovered: r.id }) : keepWork(() => void keep<[string, string]>("recovery_open", { id: r.id }).then(([title, text]) => { keeper.kept = true; load(undefined, text, title); })
    .catch((e) => { keepFailed()(e); setNotice(failure("Octet cannot open this drawing.", e)); refreshRecents(); }));
  // Remove from Home: one at a time, as each changes the list file, then Home reads the list again.
  const removeRecents = (list: RecentEntry[]) => void list.reduce((done, r) => done.then(() => homeCall("recent_remove", { path: r.path })).then(() => void library.forget(r.path)), Promise.resolve())
    .catch(() => {}).finally(refreshRecents);
  const homeSelectAll = useRef<() => void>(undefined);
  const refreshRecents = () => {
    if (!HOME_API) return;
    homeCall<RecentEntry[]>("recent_list").then(setRecents).catch(() => {});
    homeCall<RecoveredEntry[]>("recovery_list").then(setRecovered).catch(keepFailed("Octet cannot read the drawings it kept for recovery."));
    homeCall<ExperimentEntry[]>("experiment_list").then(setExperiments).catch(() => {});
  };
  useEffect(() => { if (home) refreshRecents(); }, [home, fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  // Home's projects and thumbnails (src/projects.ts).
  const library = useHomeLibrary({ active: home, recents, notice: (text, kind) => setNotice(text, kind) });
  // Opened or saved: the drawing's picture goes to its Home tile, and to Octet's copy for a drawing in a project.
  useEffect(() => {
    if (!TAURI || !file.path) return;
    const path = file.path;
    const t = window.setTimeout(() => { const svg = pictureOf(file.saved); if (svg) { invoke("recent_thumb", { path, svg }).catch(() => {}); library.autoSvg(path, svg); } }, 0);
    return () => clearTimeout(t);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
  // When Octet was last opened, for the next "Welcome back".
  useEffect(() => { if (!DRAW_WINDOW) setSettings((s) => ({ ...s, lastSeen: Date.now() })); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // A spectrum picked goes into the window's drawing; from Home over other drawings it opens in a new window.
  async function open() {
    try {
      const picked = await invoke<[string, string] | null>("open_drawing");
      if (!picked) return;
      if (isTemplateFile(picked[0])) return openTemplateFile(picked[0].split(/[\\/]/).pop() ?? "Templates.ctp", picked[1]);
      if (isSpectrum(picked[1]) && !hub) return openSpectrumText(picked[1], picked[0].split(/[\\/]/).pop() ?? "this file");
      if (openIn(picked[0])) return;
      if (elsewhere) return inNew({ picked });
      openPicked(picked);
    } catch (e) {
      setNotice(failure("Octet cannot open this file.", e));
    }
  }
  function openPicked(picked: [string, string]) {
    if (isSpectrum(picked[1])) openSpectrumText(picked[1], picked[0].split(/[\\/]/).pop() ?? "this file");
    else load(picked[0], picked[1]);
  }
  // Files the system asked Octet to open (Finder, Explorer, the Dock, a second launch) or that were dropped on the
  // window (src-tauri/src/open.rs; REL-14, CH-6). Dropped on a drawing, they go into it. Otherwise the first one opens,
  // as File > Open opens a drawing (Home lists the other drawings), after the question about unsaved changes. A
  // picture opens as a new drawing of it, as ChemDraw opens a picture file.
  async function takeOpened() {
    const insert = !home, into = home ? library.dropTarget.current : undefined;
    library.dropTarget.current = undefined;
    const all = await invoke<OpenedFile[]>("take_opened", { insert, project: into && "project" in into });
    // Dropped on a tile on Home: a picture becomes its thumbnail, and drawings dropped on a project go in it. Neither
    // opens.
    if (into) {
      const dropped = all.filter((f) => f.at), picture = dropped.find((f) => f.picture);
      if (picture) void library.pictureThumb(into, fromBase64(picture.picture!));
      if ("project" in into) {
        for (const f of dropped) if (f.error) setNotice(f.error);
        const paths = dropped.flatMap((f) => (f.path ? [{ path: f.path }] : []));
        if (paths.length) void library.add(into.project, paths);
        return takeFiles(all.filter((f) => !f.at), insert);
      }
      return takeFiles(all.filter((f) => !f.picture || !f.at), insert);
    }
    await takeFiles(all, insert);
  }
  async function takeFiles(all: OpenedFile[], insert: boolean) {
    // ChemDraw template files, opened or dropped anywhere: each becomes a set of templates.
    for (const f of all) if (f.text !== null && !f.error && isTemplateFile(f.name)) openTemplateFile(f.name, f.text);
    const files = all.filter((f) => !isTemplateFile(f.name) || f.error);
    // Home's window decides from the windows open now (Octet opened by a file starts before its list comes), and claims
    // the first file before it waits, so files that come in two lots do not both open here.
    let away = elsewhere;
    if (homeWindow && !away) {
      const list = await invoke<OpenWindow[]>("window_list").catch(() => []);
      away = list.length > 0 || claimed.current;
      if (!away && files.some((f) => !f.error)) claimed.current = true;
    }
    // Spectra (on the canvas or the Spectrum panel, or opened) go into the drawing. Opened in Home's window once a
    // drawing is open, each opens in a new window, as drawings do.
    const sent = (f: OpenedFile) => hub || (homeWindow && away && !f.at);
    const spectra = files.filter((f) => f.text !== null && isSpectrum(f.text) && !sent(f));
    const read = files.filter((f) => f.picture !== null || (f.text !== null && (sent(f) || !isSpectrum(f.text))));
    for (const f of spectra) openSpectrumText(f.text!, f.name);
    if (homeWindow && spectra.length) away = true; // the drawings with them open in windows of their own
    for (const f of files) if (f.error) setNotice(f.error);
    if (read.some((f) => f.text !== null && !isDrawingText(f.text))) await ready;
    const dropped = read.filter((f) => f.at && insert), opening = read.filter((f) => !(f.at && insert)), first = opening[0];
    if (dropped.length) await dropFiles(dropped);
    // Each file to open opens in a window of its own (one open already comes to the front).
    if (away) { for (const f of opening) if (!openIn(f.path)) inNew({ files: [f] }); return; }
    // The first opens here; with windows on, each of the others opens in a window of its own.
    if (homeWindow) for (const f of opening.slice(1)) if (!openIn(f.path)) inNew({ files: [f] });
    if (first?.picture) {
      const m = await pictureDrawing(fromBase64(first.picture), newStyle.bond, MAX_PICTURE, `Octet cannot open ${first.name}.`);
      if (m) keepWork(() => load(undefined, { ...m, style: newStyle }, first.name.replace(/\.[^.]*$/, "")));
    } else if (first) keepWork(() => load(first.path ?? undefined, first.text!, first.name.replace(/\.[^.]*$/, "")));
  }
  // A picture file's bytes as a drawing of the picture alone (picture.ts), at 1 pt per pixel for a bond of `bond` pt,
  // when it fits in `room` bytes; otherwise a notice that starts with `failed`.
  async function pictureDrawing(bytes: Uint8Array, bond: number, room: number, failed: string) {
    try {
      const r = await readPicture(bytes), m = pictureMol(r.picture, r.w, r.h, bond);
      if (pictureBytes(m) > room) throw new Error(FULL);
      return m;
    } catch (e) {
      setNotice(`${failed} ${e instanceof Error ? e.message : ""}`);
    }
  }
  // Files dropped on the drawing: their contents go in where they were dropped, selected, as ChemDraw's drop does:
  // the first centred on the drop point, the others in a column under it. One step to undo. A picture goes in at
  // 1 pt per pixel, as ChemDraw's does.
  async function dropFiles(files: OpenedFile[]) {
    const mols: Mol[] = [], lost: Record<string, number> = {};
    for (const f of files) {
      if (f.picture) {
        const room = MAX_PICTURE - pictureBytes(now.current) - mols.reduce((n, x) => n + pictureBytes(x), 0);
        const m = await pictureDrawing(fromBase64(f.picture), style.bond, room, `Octet cannot insert ${f.name}.`);
        if (m) mols.push(m);
        continue;
      }
      try {
        if (!isDrawingText(f.text!)) { mols.push(importStructure(f.text!)); continue; }
        const r = readOct(f.text!);
        mols.push({ ...r.mol, style: undefined });
        for (const [what, n] of Object.entries(r.lost)) lost[what] = (lost[what] ?? 0) + n;
      } catch {
        setNotice(`Octet cannot read the structures in ${f.name}.`);
      }
    }
    const add = stack(mols), b = mols.map(extent).find(Boolean), at = toDoc(...files[0].at!);
    if (!b) return;
    // The drawing as it is now: the structure engine can take seconds to start, and the user can draw meanwhile.
    const r = insertMol(now.current, add, [at[0] - (b[0] + b[2]) / 2, at[1] - (b[1] + b[3]) / 2]);
    set(r.mol, true, undefined, "placed");
    revealNext.current = true;
    setSelection(r.atoms);
    setPicked(r.items);
    sayLost(lost);
  }
  // A drawing read from a file, into the editor. With no path and a title, a recovered drawing or a file Octet cannot
  // save over: its changes are not saved yet. With neither (a starter drawing from Home) it is a new drawing. A MOL,
  // SDF or SMILES file opens as a new drawing of its structures, in the middle. A drawing made already (of a picture)
  // comes as it is.
  function load(path: string | undefined, text: string | Mol, title?: string) {
    drawingColours.current = [];
    try {
      let read: ReturnType<typeof readOct>;
      if (typeof text !== "string") read = { mol: text, lost: {} };
      else if (isDrawingText(text)) read = readOct(text, /\.oct$/i.test(path ?? ""));
      else {
        let mol: Mol;
        try { mol = importStructure(text); } catch { throw new Error("Octet cannot read the structures in this file."); }
        const b = bounds(mol);
        if (!b) throw new Error("There are no structures in this file.");
        read = { mol: merge(EMPTY, mol, [-(b[0] + b[2]) / 2, -(b[1] + b[3]) / 2]), lost: {} };
      }
      const lost = read.lost, { guides: saved, ...kept } = read.mol;
      // Settings > Files > Keep ChemDraw styles off: another program's drawing takes Octet's default style.
      const mol = wholeGroups(asOpened(read.foreign && !settings.files.keepStyle ? { ...kept, style: undefined } : kept, "", !!read.foreign));
      // The grid, rulers and crosshair as the drawing was saved with them; the user's last choice when it says none.
      // A drawing saved before Show Grid, with Gridlines set (a step in mm), shows its grid as it did. The view centres
      // on the structures, or on everything else when there are none (text, arrows, pictures).
      const b = bounds(mol) ?? extent(mol);
      setGuides(saved ?? { ...freshGuides(b && [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], readStyle(mol.style ?? newStyle)), ...(typeof kept.style?.grid === "number" ? { grid: true } : {}) });
      set(mol);
      // As ChemDraw does, a drawing with a structure turned in 3D opens with Select as Structure Perspective, to turn it.
      if (mol.atoms.some((a) => a.location[2])) { setSettings((s) => ({ ...s, variants: { ...s.variants, select: "perspective" } })); setTool("select"); }
      setFile(path ? { path, saved: mol, lost: Object.keys(lost).length ? lost : undefined } : title !== undefined ? { saved: EMPTY, name: title } : { saved: mol });
      setHome(false); setCoach(0); outlineFrom.current = undefined;
      // A drawing with a measured spectrum opens with it in the Spectrum panel.
      if (mol.spectra?.length) { setSpectrum(spectrumKeyOf(mol.spectra[0])); setSpectrumShow("measured"); setChosenGroup(undefined); }
      // Once for each open: a file Octet wrote that ChemDraw saved since has lost Octet's own extras (issue 19).
      // With things left out too it stays an error, as sayLost's notice is.
      const left = Object.keys(lost).length > 0;
      if (read.resaved) setNotice(`ChemDraw saved this file last and did not keep Octet's own extras.${left ? ` Octet left out ${lostText(lost)}.` : ""}`, left ? "error" : "info");
      else sayLost(lost);
      if (b) setView((v) => ({ ...v, x: frameWidth() / 2 - ((b[0] + b[2]) / 2) * v.zoom * L, y: frameMidY() + ((b[1] + b[3]) / 2) * v.zoom * L }));
    } catch (e) {
      setNotice(failure("Octet cannot open this file.", e));
    }
  }
  // Atom Properties: the atom's element or label, charge, isotope and radical, in one dialog.
  function atomProperties(i: number | undefined) {
    if (i === undefined || !doc.atoms[i]) return setNotice("Select an atom first.", "info");
    const a = doc.atoms[i];
    const g = /^(abs|&|or)(\d*)$/.exec(a.enhanced ?? "");
    // Its query properties apply to every selected atom (only those changed), as ChemDraw's dialog does.
    const targets = selection.has(i) ? [...selection].filter((k) => doc.atoms[k]) : [i];
    setDialog({ kind: "atom", atom: i, element: a.text ?? a.label, charge: String(a.charge ?? 0), isotope: a.isotope ? String(a.isotope) : "", radical: String(a.radical ?? 0), stereo: g?.[1] ?? "", group: g?.[2] || "1",
      targets, q: { ...a.query }, q0: { ...a.query } });
  }
  // Bond Properties (/ over a bond, or the Structure menu): the selected bonds' (or bond k's, or the one under the
  // pointer's) type in ChemDraw's order with its query types, where a double bond's second line goes, its topology and
  // its reaction centre. Bond k with others selected takes them all.
  function bondProperties(k?: number) {
    const chosen = doc.bonds.flatMap((b, j) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [j] : [])), hovered = hovers.get().bond;
    const bonds = k !== undefined && doc.bonds[k] && !chosen.includes(k) ? [k] : chosen.length ? chosen : hovered !== undefined ? [hovered] : [];
    if (!bonds.length) return setNotice("Select a bond first.", "info");
    const b = doc.bonds[bonds[0]];
    const now = { type: b.query ?? bondKindOf(b) ?? "", position: b.position ?? ("auto" as const), topology: b.topology ?? "", rxn: b.rxn ?? "" };
    setDialog({ kind: "bond", bonds, ...now, start: now });
  }
  // Bracket Properties: a picked pair of brackets' usage and what goes with it.
  function bracketProperties() {
    const sh = (doc.shapes ?? []).find((x) => picked.has(x.id) && isBracket(x) && !x.side);
    if (!sh) return setNotice("Select a pair of brackets first.", "info");
    const p = sh.polymer, e = enclosed(doc, sh);
    // Flip Type is for a ladder polymer's brackets: two bonds crossing each bracket.
    setDialog({ kind: "bracket", shape: sh.id, usage: p?.usage ?? "", label: p?.usage === "sru" || p?.usage === "param" ? p.label ?? "" : "", count: p?.usage === "mult" ? p.label ?? "2" : "2",
      order: p?.order ? String(p.order) : "0", mw: p?.mw ? String(p.mw) : "", pattern: p?.pattern ?? "", flip: p?.flip ?? "", flippable: e.crossing.length === 4 });
  }
  // R-Logic Query: a row for each R-group definition.
  function rLogic() {
    const boxes = (doc.shapes ?? []).filter((x) => x.rgroup).sort((p, q) => (rNumber(p.rgroup!.name) ?? 0) - (rNumber(q.rgroup!.name) ?? 0));
    if (!boxes.length) return setNotice("Draw an R-group definition first: use the Shape tool's R-group definition round its fragments.", "info");
    setDialog({ kind: "rlogic", rows: boxes.map((x) => ({ id: x.id, name: x.rgroup!.name, occur: x.rgroup!.occur ?? "", restH: !!x.rgroup!.restH, then: x.rgroup!.then ?? "" })) });
  }
  // An attachment on the selected atoms (two or more).
  function attach(variable: boolean) {
    const atoms = [...selection].filter((i) => doc.atoms[i] && !doc.atoms[i].centre && !doc.atoms[i].attach);
    if (atoms.length < 2) return setNotice("Select the atoms the attachment joins: two or more.", "info");
    // Not selected: a drag from it with the Bond tool then draws its bond, and does not move it.
    set(addAttachment(doc, atoms, variable)[0]);
  }
  // Structure > Enhanced Stereochemistry on the selected stereocentres (every one with nothing selected).
  function enhance(kind: "abs" | "or" | "&" | undefined) {
    const centres = stereocentres(doc, selection.size ? selection : undefined);
    if (!centres.length) return setNotice("Select a stereocentre: an atom at the narrow end of a wedge or hash bond.", "info");
    // ChemDraw asks before it sets a flag its preferences hide; Octet sets it and says so.
    if (kind === "abs" && settings.hideAbs) setNotice("Abs flags are hidden in Settings > Drawing.", "info");
    if (kind !== "or" && kind !== "&") return set(setEnhanced(doc, centres, kind), true);
    let m = doc;
    const moving = new Set(centres);
    for (const g of fragments(doc)) {
      const ours = g.filter((i) => moving.has(i));
      if (ours.length) m = setEnhanced(m, ours, `${kind}${nextGroup(doc, g, kind, moving)}`);
    }
    set(m, true);
  }
  // Show or hide atom numbers. Each atom's number is its place in its structure, counting from 1, as ChemDraw numbers
  // atoms in the order they were drawn, or the number it keeps hidden. When every one of the atoms already shows its
  // number, they are hidden, and kept, as ChemDraw keeps them.
  // iupac (Show atom numbers in the Actions panel): a structure Octet can name is numbered as its IUPAC name numbers
  // its parent chain or ring, as ChemDraw's IUPAC atom numbers; its other atoms show none. Shown numbers then hide.
  function numberAtoms(atoms: number[], iupac = false) {
    const hide = iupac ? atoms.some((i) => doc.atoms[i]?.number) : atoms.every((i) => doc.atoms[i]?.number), place = new Map<number, number>();
    for (const g of fragments(doc)) [...g].sort((p, q) => p - q).forEach((i, k) => place.set(i, k + 1));
    const locants = new Map<number, string | undefined>();
    if (iupac && !hide) for (const g of fragments(doc)) {
      if (!g.some((i) => atoms.includes(i))) continue;
      const sorted = [...g].sort((p, q) => p - q), graph = graphOf(expandLabels(subset(doc, new Set(sorted)))), l = graph && iupacLocants(graph);
      if (l) sorted.forEach((i, k) => locants.set(i, l[k]));
    }
    if (iupac && !hide && !locants.size) setNotice("Octet has no name for this structure, so it numbers the atoms in the order they were drawn.", "info");
    const flip = (a: Atom, i: number): Atom => {
      const { number, hiddenNumber, ...rest } = a;
      if (locants.has(i)) { const l = locants.get(i); return l ? { ...rest, number: l } : rest; }
      return hide ? { ...rest, hiddenNumber: number } : number ? a : { ...rest, number: hiddenNumber ?? String(place.get(i) ?? 1) };
    };
    set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? flip(a, i) : a)) }, true);
  }
  // A structure from another program's file or the clipboard, as Settings asks: MDL files' chiral flag shows as stereo
  // flags only with Stereo flags from the chiral flag on (ChemDraw's Show Stereoflags When Opening MDL Format Files);
  // enhanced stereo the file sets itself always stays. aromatic: the aromatic rings as Settings > Aromatic rings asks
  // (ChemDraw's Normalize Aromatic Display), for files opened or imported.
  function asOpened(m: Mol, text = "", aromatic = false): Mol {
    let out = m;
    if (!settings.mdlFlags && chiralFlagOnly(text)) out = { ...out, atoms: out.atoms.map((a) => (a.enhanced ? (({ enhanced: _, ...rest }) => rest)(a) : a)) };
    if (aromatic && settings.aromaticOnOpen) out = { ...out, atoms: out.atoms.map((a) => ({ ...a, circle: settings.aromaticOnOpen === "circles" || undefined })) };
    return out;
  }
  // Import a structure file: it lands to the right of the drawing (or in the middle of an empty canvas), selected.
  async function importFile() {
    try {
      const picked = await invoke<[string, string] | null>("import_structure");
      if (!picked) return;
      if (picked[1].startsWith(BASE64_MAGIC) || /<CDXML[\s>/]/.test(picked[1].slice(0, 65536))) {
        // A ChemDraw drawing (CDXML or CDX): all of it, arrows and text too, to the right of what is there, its text in
        // proportion to this drawing (fitSizes).
        const { mol: read, lost } = readOct(picked[1]), add = asOpened(read, "", true);
        const r = insertMol(doc, { ...(add.style ? fitSizes(add, add.style, style) : add), style: undefined }, add.atoms.length ? landing(add) : [0, 0]);
        set(r.mol, true);
        revealNext.current = true;
        setSelection(r.atoms);
        setPicked(r.items);
        return sayLost(lost);
      }
      place(asOpened(importStructure(picked[1]), picked[1], true));
    } catch (e) {
      setNotice(failure("Octet cannot read this file.", e));
    }
  }
  // Where a new fragment goes: beside the drawing, or centred in an empty view (or centred on a given point).
  // Where a pasted or named structure goes: to the right of everything drawn (arrows, shapes and text too). Just
  // after a reaction arrow it lands as the product: on the arrow's level, at the reaction's spacing.
  function landing(frag: Mol, at?: P): P {
    const f = bounds(frag)!, d = bounds(doc);
    if (at) return [at[0] - (f[0] + f[2]) / 2, at[1] - (f[1] + f[3]) / 2];
    const ends = [
      ...(d ? [{ x: d[2], level: (d[1] + d[3]) / 2, arrow: false }] : []),
      ...arrows.filter((a) => !isOrbital(a)).map((a) => ({ x: Math.max(a.from[0], a.to[0]), level: (a.from[1] + a.to[1]) / 2, arrow: straightArrow(a) })),
      ...(doc.shapes ?? []).map((sh) => ({ x: shapeBounds(sh)[2], level: (sh.from[1] + sh.to[1]) / 2, arrow: false })),
      ...placed.filter((c) => c.id !== DRAFT).map((c) => ({ x: c.box[2] / L, level: -(c.box[1] + c.box[3]) / 2 / L, arrow: false })),
    ];
    if (!ends.length) { const c = toDoc(frameWidth() / 2, frameMidY()); return [c[0] - (f[0] + f[2]) / 2, c[1] - (f[1] + f[3]) / 2]; }
    const last = ends.reduce((p, q) => (q.x > p.x + 1e-6 || (Math.abs(q.x - p.x) < 1e-6 && q.arrow) ? q : p));
    const level = last.arrow ? last.level : d ? (d[1] + d[3]) / 2 : last.level;
    return [last.x + (last.arrow ? reactionGap : 1.5) - f[0], level - (f[1] + f[3]) / 2];
  }
  // What is in the drawing, as boxes (drawing units): each structure's atoms, each arrow, each text as drawn, and each
  // reagent table. Where an experiment page's next scheme goes under (schemeLanding).
  // The reagent tables' boxes from the last drawing: the name field's preview places its structure before this
  // drawing's tables are worked out (gridViews, further down), and reading them there stopped the editor.
  const tableSpans = useRef<number[][]>([]);
  const schemeTaken = (m: Mol): number[][] => [
    ...fragments(m).map((g) => { const xs = g.map((i) => m.atoms[i].location[0]), ys = g.map((i) => m.atoms[i].location[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }),
    ...(m.arrows ?? []).map((a) => [Math.min(a.from[0], a.to[0]), Math.min(a.from[1], a.to[1]), Math.max(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1])]),
    ...placed.filter((c) => c.id !== DRAFT).map((c) => [c.box[0] / L, -c.box[3] / L, c.box[2] / L, -c.box[1] / L]),
    ...tableSpans.current,
  ];
  // Puts a new fragment in place and selects it. Put at a point (where the pointer was), it joins a cycle there. On an
  // experiment page it goes in the Reaction scheme box (under what is there) unless the point is in the box already.
  const schemeAt = (frag: Mol, base: Mol, at?: P) => (expPage && !(at && inSpan(schemeSpan(base), at)) ? schemeLanding(base, bounds(frag)!, schemeTaken(base)) : undefined);
  function place(frag: Mol, base: Mol = doc, at?: P) {
    if (!frag.atoms.length) throw new Error("It has no atoms.");
    revealNext.current = true;
    const scheme = schemeAt(frag, base, at);
    if (scheme) at = undefined;
    const drop = at ? "placed" : true, land = (f: Mol, p?: P) => scheme ?? landing(f, p);
    // A query file's R-group boxes and polymer brackets, and a reaction's arrows and plus signs, come with its atoms.
    if (frag.shapes?.length || frag.arrows?.length || frag.captions?.length) {
      const r = insertMol(base, frag, land(frag, at));
      set(frag.arrows?.length ? laidOut(r.mol, (frag.arrows ?? []).map((a) => r.ids.get(a.id)!)) : r.mol, false, undefined, drop);
      setSelection(r.atoms);
      return setPicked(r.items);
    }
    set(merge(base, frag, land(frag, at)), false, undefined, drop);
    setSelection(new Set(frag.atoms.map((_, i) => base.atoms.length + i)));
  }
  // SynthPath: what SynthPath's search reads (each structure the selection touches, whole, as Bring to Front takes
  // them, so one picked atom searches its molecule; the whole drawing when nothing is selected), and a structure
  // SynthPath sends, placed as a pasted SMILES is (to the right of the drawing, selected). See synthpath.ts.
  synthpath.part = () => {
    if (!selection.size && !picked.size) return doc;
    const touched = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
    return touched.length ? extractSelection(doc, new Set(touched), new Set()) : extractSelection(doc, selection, picked);
  };
  synthpath.load = (smiles: string) => {
    if (!loaded) { synthpath.inbox = smiles; return; }
    try { place(asOpened(importStructure(smiles), smiles)); } catch { setNotice("Octet cannot draw this structure."); }
  };
  useEffect(() => {
    synthpath.state = { loaded, atoms: doc.atoms.length, selected: selection.size > 0 || picked.size > 0 };
    if (loaded && synthpath.inbox) {
      const smiles = synthpath.inbox;
      synthpath.inbox = undefined;
      try { place(asOpened(importStructure(smiles), smiles)); } catch { setNotice("Octet cannot draw this structure."); }
    }
    synthpath.changed?.();
  });
  useEffect(() => () => { synthpath.part = undefined; synthpath.load = undefined; synthpath.state = undefined; }, []);
  // A reaction that came in (a file or text with arrows) laid out as Clean Up Reaction lays it out, measured as it will
  // be drawn. arrowIds: its arrows.
  function laidOut(m: Mol, arrowIds: number[]): Mol {
    const d = render(m, frame, measure, L), box = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
    const width = (t: string, c: Caption) => textWidth(t, (c.size ?? style.captionSize) * pt, c.bold, c.italic, fontStack(c.font ?? style.captionFont));
    const caps = placeCaptions(m, d, width, m.arrows ?? [], pt, style.captionSize), done = new Set<number>(), captionOf = (cid: number) => box(caps.find((c) => c.id === cid)?.box);
    for (const id of arrowIds) {
      if (done.has(id)) continue;
      const r = findReaction(m, id, m.arrows ?? [], (atoms) => box(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))), captionOf);
      if (!r) continue;
      r.arrows.forEach((a) => done.add(a));
      m = cleanUpReaction(m, r, m.arrows ?? [], reactionLayout(captionOf));
    }
    return m;
  }
  // Name to structure (⇧⌘N), from what is in hand, as ChemDraw does: the caption or lone atom label being typed or
  // picked becomes its structure, in its place. Text that is not a name opens the name field with that text. With
  // nothing in hand the name field opens empty, or with the clipboard's text when that is a name or SMILES. In the
  // name field, ⇧⌘N draws the name, as Return does.
  function nameToStructure(waited = false) {
    if (naming !== undefined) return drawNamed();
    if (!waited && !namesLoaded) return void loadNames().then(() => { setNamesLoaded(true); nameToStructure(true); }, () => openNaming());
    // The caption being typed.
    if (writing) {
      const text = writing.value.trim(), c = placed.find((x) => x.id === (writing.id ?? DRAFT)), found = text ? structureOrSuggestion(text, true) : undefined;
      // The caption is kept first, so Undo gives back the text as typed (as in ChemDraw, where the caption is there).
      commitWriting();
      if (!found || !c) return openNaming(text);
      return convertInPlace(found, writing.id !== undefined ? deleteGraphics(doc, new Set([writing.id])) : doc, [(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L]);
    }
    // The label being typed: an atom with no bonds becomes the structure. Otherwise the label is kept, as Return keeps
    // it, and the name field opens with its text.
    if (editing) {
      const text = editing.value.trim(), lone = !doc.bonds.some((b) => b.atoms.includes(editing.atom)), found = lone && text ? structureOrSuggestion(text, true) : undefined;
      labelOpen.current = false;
      setEditing(undefined);
      const [x, y] = doc.atoms[editing.atom].location;
      // The label is kept first, as Return keeps it, so Undo gives back the text as typed.
      set(setLabel(doc, editing.atom, expandEscapes(editing.value, keptText(doc.atoms[editing.atom].text))));
      if (found) return convertInPlace(found, deleteAtom(doc, editing.atom), [x, y]);
      return openNaming(text);
    }
    // A picked caption, or one picked atom with a label and no bonds.
    const c = picked.size === 1 && !selection.size ? doc.captions?.find((x) => picked.has(x.id)) : undefined;
    const atom = !picked.size && selection.size === 1 ? [...selection][0] : undefined, a = atom !== undefined ? doc.atoms[atom] : undefined;
    const label = a?.text && !doc.bonds.some((b) => b.atoms.includes(atom!)) ? a.text : undefined;
    if (c) {
      const found = structureOrSuggestion(c.text, true), p = placed.find((x) => x.id === c.id);
      if (found && p) return convertInPlace(found, deleteGraphics(doc, new Set([c.id])), [(p.box[0] + p.box[2]) / 2 / L, -(p.box[1] + p.box[3]) / 2 / L]);
      return openNaming(c.text);
    }
    if (label) {
      const found = structureOrSuggestion(label, true);
      if (found) return convertInPlace(found, deleteAtom(doc, atom!), [a!.location[0], a!.location[1]]);
      return openNaming(label);
    }
    openNaming();
  }
  // A structure in place of the text it was read from. A name (not SMILES) joins the names drawn before.
  function convertInPlace(found: { frag: Mol; name: string }, base: Mol, at: P) {
    place(withOwnCaption(found.name, found.frag), base, at);
    if (structureFor(found.name)) rememberName(found.name, found.frag);
  }
  // The name field, with the text given; with none, the clipboard's text if Octet reads it as a structure. The
  // structure lands where the pointer was on the canvas when the field opened (Sam, 2 November 2026); with the pointer
  // off the canvas, after the drawing as before.
  const namingAt = useRef<P>(undefined);
  function openNaming(text?: string) {
    namingAt.current = pointer.current;
    void loadNames().then(() => setNamesLoaded(true), () => {});
    setNaming(text ?? "");
    if (text) return;
    void clipboardText().then((t) => {
      if (!t || !structureFromText(t)) return;
      // Selected, so a name typed in its place replaces it.
      flushSync(() => setNaming((n) => (n === "" ? t : n)));
      if (nameField.current?.value === t) nameField.current.select();
    });
  }
  // Structure > Insert Peptide…, Insert RNA… and Insert DNA…: the name field with the prefix in it, the caret after it.
  function insertSequence(prefix: string) {
    warmLayout();
    openNaming(prefix);
    requestAnimationFrame(() => { const f = nameField.current; f?.setSelectionRange(f.value.length, f.value.length); });
  }
  // A sequence with Residue labels on is drawn as its residues' labels (sequence.ts residues); anything else, and a
  // sequence whose atoms are not in the order of its SMILES, as it is.
  const asResidues = (text: string, frag: Mol) => (settings.sequenceLabels && isSequence(text) ? residuesOf(text, frag, parseStructure) ?? frag : frag);
  // The sequence choices under the name field (sequence.ts): the text is rewritten, the caret goes after the codes, and
  // with the Sequence tool in hand the kind chosen is the tool's choice from now on.
  function chooseSequence(next: SeqParts) {
    const { text, caret } = sequenceText(next);
    setNaming(text);
    if (tool === "sequence" && next.kind !== sequenceChoice) setSettings((s) => ({ ...s, variants: { ...s.variants, sequence: next.kind } }));
    requestAnimationFrame(() => { const f = nameField.current; f?.focus(); f?.setSelectionRange(caret, caret); });
  }
  // Draws what the name field holds (or the recent name the arrow keys are on). False when it is not a name. Text
  // nothing offline reads goes to PubChem (askPubChem), and true means the answer draws when it comes.
  function drawNamed(): boolean {
    if (naming === undefined) return false;
    if (recent.at >= 0 && historyRows[recent.at] !== undefined) { pickHistory(historyRows[recent.at]); return true; }
    // A sequence or large structure, previewed with Indigo's layout alone, is drawn tidied: laid out in the worker
    // (namepreview.ts fullLayout), so the window never waits. The field is busy until it comes (landLater).
    if (later) {
      if (placing === naming) return true;
      placingJob.current?.cancel();
      const s = naming.trim(), list = typedSmiles ? nameList(s, nameToSmiles) : undefined;
      // As structureFor and structureFromText draw it: each name of a list in a row; SMILES typed as it is keeps its ions.
      const job = fullLayout(list && list.join(".") === typedSmiles ? list : [later], !!typedSmiles || isSequence(s));
      placingJob.current = job;
      setPlacing(naming);
      void job.result.then((mols) => landLater.current?.(naming, mols, job));
      return true;
    }
    const frag = named;
    if (!frag) return askPubChem(naming);
    settleFrom.current = doc.atoms.length;
    place(withOwnCaption(naming.trim(), asResidues(naming.trim(), frag)), doc, namingAt.current);
    if (structureFromText(naming)) { if (structureFor(naming.trim())) rememberName(naming.trim(), frag); } else if (suggestion) rememberName(suggestion, frag);
    setNaming(undefined);
    return true;
  }
  // Return's structure on its way from the worker: the text it is for (the field shows it is busy) and the job. An edit,
  // Escape or closing the field cancels it. It lands as one undo step, as any name does.
  const [placing, setPlacing] = useState<string>();
  const placingJob = useRef<ReturnType<typeof fullLayout>>(undefined);
  useEffect(() => {
    if (placing === undefined || naming === placing) return;
    placingJob.current?.cancel();
    placingJob.current = undefined;
    setPlacing(undefined);
  }, [naming, placing]);
  const landLater = useRef<(text: string, mols: Mol[] | undefined, job: ReturnType<typeof fullLayout>) => void>(undefined);
  landLater.current = (text, mols, job) => {
    if (placingJob.current !== job) return;
    placingJob.current = undefined;
    setPlacing(undefined);
    if (naming !== text) return;
    const s = text.trim(), name = !!typedSmiles || isSequence(s);
    let frag = mols && (mols.length > 1 ? inRow(mols) : mols[0]);
    if (frag && !name) frag = asOpened(frag, text);
    if (!frag?.atoms.length) { if (nameField.current) shake(nameField.current); return; }
    settleFrom.current = doc.atoms.length;
    place(withOwnCaption(s, asResidues(s, frag)), doc, namingAt.current);
    if (name) rememberName(s, frag);
    setNaming(undefined);
  };
  // Name to Structure's last step (decision 0015): with Settings > Online search on, a name or InChIKey nothing offline
  // reads goes to PubChem when the user presses Return. Typing never waits for the answer. It draws if the field still
  // holds the same text, and a notice says it came from PubChem. No answer or no network: the field shakes, as it does
  // for any text Octet cannot read.
  const [asking, setAsking] = useState<string>();
  const answered = useRef<(text: string, smiles: string | null | undefined, why?: string) => void>(undefined);
  answered.current = (text, smiles, why) => {
    setAsking(undefined);
    if (naming?.trim() !== text) return;
    let frag: Mol | undefined;
    try { frag = smiles ? parseStructure(smiles) : undefined; } catch { frag = undefined; }
    if (!frag?.atoms.length) {
      if (why?.startsWith("PubChem")) setNotice(why, "info");
      if (nameField.current) shake(nameField.current);
      return;
    }
    settleFrom.current = doc.atoms.length;
    place(frag, doc, namingAt.current);
    rememberName(text, frag);
    setNaming(undefined);
    setNotice("Drawn from PubChem.", "info");
  };
  function askPubChem(text: string): boolean {
    const s = text.trim();
    if (!TAURI || !settings.onlineSearch || !namesLoaded || asking !== undefined || !s || s.length > 300 || casProblem(s) || PEPTIDE.test(s) || NUCLEIC.test(s) || looksLikeSmiles(s)) return false;
    setAsking(s);
    invoke<string | null>("pubchem_structure", { text: s }).then((smiles) => answered.current?.(s, smiles), (e) => answered.current?.(s, undefined, typeof e === "string" ? e : undefined));
    return true;
  }
  // The name field shakes for text that is not a name.
  const shake = (el: HTMLElement) => {
    if (!reduced()) el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], timing("--motion-slow"));
  };
  // The command Repeat runs again (see repeatLast).
  const lastRepeat = useRef<{ menu?: string; action?: string; rotate?: number; scale?: number }>(undefined);
  // Menu commands. New and Open go on the undo list, so they never lose work.
  const commands = useRef<Record<string, () => void>>({});
  commands.current = {
    new: () => newDrawing(),
    new_quick: () => newDrawing(QUICK),
    ...Object.fromEntries(Object.keys(PURPOSES).map((k) => [`new_${k}`, () => newDrawing(k)])),
    ...Object.fromEntries(settings.ownPurposes.map((p, k) => [`new_own_${k}`, () => newDrawing(p.id)])),
    experiment_details: () => { if (expPage) setDialog({ kind: "details", values: detailsOf(doc.annotations) }); },
    open: () => openDrawing(),
    opened: () => void takeOpened().catch((e) => setNotice(failure("Octet cannot open this file.", e))),
    home: () => (drawWindow ? void invoke("show_home").catch(() => {}) : homeWindow && home ? undefined : templateEdit ? setNotice("Save or cancel the template first.", "info") : (setHome(true), setOverDrawing(true))),
    quit: () => closeWindow(),
    // File > Close Window on Windows and Linux, where there is no Close Window of the system's (REL-18).
    close: () => closeDrawing(),
    tutorial: () => startTutorial(),
    shortcuts: () => setSettingsOpen("keys"),
    report_problem: () => void invoke("open_link", { name: "issues" }).catch((e) => setNotice(failure("Octet cannot open the link.", e))),
    check_updates: () => checkUpdates(true),
    import: () => void importFile(),
    // While a template is open on the canvas, Save keeps it in the template (as ChemDraw saves its template document).
    save: () => (templateEdit ? saveTemplateEdit() : void save(false)),
    save_as: () => void save(true),
    // Edit > Cut, Copy and Paste on Linux, where they are Octet's own menu items (main.rs).
    cut: () => clipCommand("cut"),
    copy: () => clipCommand("copy"),
    paste: () => clipCommand("paste"),
    // While a label or caption is being typed, the Edit menu works on its text.
    undo: () => (typing() ? void document.execCommand("undo") : undo()),
    redo: () => (typing() ? void document.execCommand("redo") : h.at < h.stack.length - 1 ? undo(true) : repeatLast()),
    select_all: () => {
      if (homeOpen.current && !typing()) return homeSelectAll.current?.();
      if (typing()) {
        const el = document.activeElement as HTMLElement;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.select();
        const range = document.createRange(), sel = getSelection();
        range.selectNodeContents(el);
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      // Everything, as ChemDraw's Select All: structures, text, arrows, orbitals, shapes, brackets and cycles.
      setSelection(new Set(doc.atoms.map((_, i) => i)));
      setPicked(new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id)));
    },
    snap: () => setSettings((s) => ({ ...s, snap: !s.snap })),
    snap_grid: () => setSettings((s) => ({ ...s, snapGrid: !s.snapGrid })),
    grid: () => showGuide("grid"),
    rulers: () => showGuide("rulers"),
    crosshair: () => showGuide("crosshair"),
    // ChemDraw's Object > Fixed Lengths (⌘L) and Fixed Angles (⌘E).
    fixed_lengths: () => setSettings((s) => ({ ...s, fixedLengths: !s.fixedLengths })),
    fixed_angles: () => setSettings((s) => ({ ...s, fixedAngles: !s.fixedAngles })),
    warnings: () => setSettings((s) => ({ ...s, warnings: !s.warnings })),
    // Display Warnings back on for the selected atoms, the bonds between them and the picked brackets, or for the whole
    // drawing when nothing is selected; off for the warnings marked on the selection.
    show_warnings: () => set(showWarnings(doc, ...warnScope()), true),
    hide_warnings: () => { const list = selectedOf(found); return list.length ? set(hideProblems(doc, list), true) : setNotice("Select an object with a warning.", "info"); },
    // Structure commands act on the selection, or on the whole drawing when nothing is selected.
    clean_up: () => {
      if (!loaded || !doc.atoms.length) return;
      saw("clean");
      sayAfter(selection.size ? "Cleaned up the selection." : "Cleaned up the drawing.");
      const ids = selection.size ? selection : undefined;
      let m = cleanUp(doc, ids);
      // A catalytic cycle picked (every one, with nothing selected) is tidied too, as Tidy the cycle does, measured after
      // the clean-up, as a reaction is laid out again below.
      const cycles = (doc.cycles ?? []).filter((c) => (!selection.size && !picked.size) || picked.has(c.id));
      if (cycles.length) { const d = render(m, frame, measure, L); for (const c of cycles) m = spread(m, m.cycles!.find((x) => x.id === c.id)!, d); }
      if (fragments(doc).some((g) => g.length > MOST_CLEAN && (!ids || g.some((i) => ids.has(i))))) setNotice(`Octet cannot clean up a structure of more than ${MOST_CLEAN.toLocaleString("en-GB")} atoms.`);
      const docBox = (b?: Box): Box | undefined => b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const inkOf = (mol: Mol) => { const d = render(mol, frame, measure, L); return (atoms: number[]) => docBox(union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i]))); };
      const captionOf = (id: number) => docBox(placed.find((c) => c.id === id)?.box);
      // Structures in a reaction keep their sides: each reaction they are in is laid out again, as Clean Up Reaction
      // does (reactants, the arrow, products), measured after the clean-up.
      const touched = new Set(ids ? fragments(m).filter((g) => g.some((i) => ids.has(i))).flat() : m.atoms.map((_, i) => i));
      const laid = cleanReactions(m, (r) => withStructure(r) && r.atoms.some((i) => touched.has(i)));
      if (laid.count) return glideTo(laid.mol);
      // Otherwise several structures that overlap, or have a plus sign among them, go in a row like a reaction's
      // starting materials. With a plus sign, an arrow after them is offered: Tab draws it.
      const row = rowOf(m, ids, inkOf(m), captionOf);
      if (row) {
        const laid = layoutRow(m, row.steps, reactionGap);
        m = laid.mol;
        const ahead = (doc.arrows ?? []).some((a) => !curved(a) && Math.min(a.from[0], a.to[0]) > laid.right - 0.5 && Math.abs((a.from[1] + a.to[1]) / 2 - laid.level) < 1.5);
        if (row.plus && !ahead) setOffer({ from: [laid.right + reactionGap, laid.level], to: [laid.right + 3 * reactionGap, laid.level], doc: m });
      }
      glideTo(m);
    },
    // ChemDraw's Rotate 180° Horizontal and Vertical (⇧⌘H, ⇧⌘V: stereo kept), and its Flip (a mirror image).
    flip_h: () => flip("horizontal"),
    flip_v: () => flip("vertical"),
    mirror_h: () => flip("horizontal", true),
    mirror_v: () => flip("vertical", true),
    // Add Frame (Object menu): a frame round everything selected, 0.4 bond lengths clear of it (0.3 for brackets).
    ...Object.fromEntries(([["frame_brackets", "brackets", false], ["frame_parens", "parens", false], ["frame_braces", "braces", false], ["frame_box", "box", false],
      ["frame_rounded", "rounded", false], ["frame_box_shadow", "box", true], ["frame_rounded_shadow", "rounded", true]] as const).map(([id, kind, shadow]) => [id, () => {
      const boxes = [...(selection.size ? [withCaptions(selection)].filter((b): b is Box => !!b) : []), ...placed.filter((c) => picked.has(c.id)).map((c) => c.box),
        ...arrows.filter((x) => picked.has(x.id)).map((x): Box => [Math.min(x.from[0], x.to[0]) * L, -Math.max(x.from[1], x.to[1]) * L, Math.max(x.from[0], x.to[0]) * L, -Math.min(x.from[1], x.to[1]) * L]),
        ...(doc.shapes ?? []).filter((x) => picked.has(x.id)).map((x): Box => { const b = shapeBounds(x); return [b[0] * L, -b[3] * L, b[2] * L, -b[1] * L]; })];
      const b = boxes.length ? union(boxes) : undefined;
      if (!b) return setNotice("Select what to frame first.", "info");
      const pad = (isBracket({ kind }) ? 0.3 : 0.4) * L;
      const [mol, frameId] = addShape(doc, { kind, from: [(b[0] - pad) / L, -(b[3] + pad) / L], to: [(b[2] + pad) / L, -(b[1] - pad) / L], ...(shadow ? { shadow: true } : {}) });
      set(mol);
      setPicked(new Set([frameId]));
    }])),
    // Structure Perspective (⌥⌘S), as ChemDraw's: depth shading on or off for the selected structures (or every one).
    // With it on, a 3D structure's further bonds and labels are fainter. Flatten (Object menu): the selected atoms lose
    // their depth and keep where they are drawn.
    structure_perspective: () => {
      const atoms = new Set(selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i));
      const on = [...atoms].some((i) => doc.atoms[i].shade);
      set({ ...doc, atoms: doc.atoms.map((a, i) => { if (!atoms.has(i)) return a; const { shade: _, ...rest } = a; return on ? rest : { ...rest, shade: true as const }; }) }, true);
    },
    flatten: () => set(flattenAtoms(doc, selection.size ? selection : new Set(doc.atoms.map((_, i) => i))), true),
    // 3D Clean Up (⇧⌘D, Structure menu), as ChemDraw's: the selected structures (or every one) in 3D, with depth
    // shading on, up to 500 atoms each; again to improve it. Then, as ChemDraw does, Select is Structure Perspective, to turn them.
    clean_3d: () => {
      const all = fragments(doc).filter((g) => !selection.size || g.some((i) => selection.has(i))), ok = all.filter((g) => g.length <= MOST_3D && g.length > 1);
      if (all.some((g) => g.length > MOST_3D)) setNotice(`Octet cannot clean up in 3D a structure of more than ${MOST_3D} atoms.`);
      if (!ok.length) return;
      sayAfter("Cleaned up in 3D.");
      // Each structure on its own, so the time grows with the structures and not with all their atoms squared.
      set(ok.reduce((m, g) => clean3d(m, g), doc), true);
      setSettings((s) => ({ ...s, variants: { ...s.variants, select: "perspective" } }));
      setTool("select");
    },
    // Align (⇧⌥⌘ L, C, R, T, M, B) and Distribute (⇧⌥⌘ H, V), as ChemDraw's Object menu: every selected structure,
    // group and object is one thing; they line up on the one highest on the page, or space out evenly between the
    // two at the ends.
    ...Object.fromEntries((["left", "centre", "right", "top", "middle", "bottom", "across", "down"] as const).map((how) => [`arrange_${how}`, () => arrange(how)])),
    // Rotate… (⌘R) and Scale… (⌘K), as ChemDraw's.
    rotate_dialog: () => setDialog({ kind: "rotate", angle: "90", clockwise: false }),
    // Scale… opens on the document's bond length, so ⌘K and Return still set it. ChemDraw opens on "So that median bond
    // is", which loses that. Median bond to types the chosen bonds' median in. With no bond chosen, it opens on Scale by
    // 100% (the median rows are dimmed).
    scale_dialog: () => setDialog({ kind: "scale", how: chosenMedian() ? "document" : "percent", value: "100" }),
    // Join (⌘J), as ChemDraw's Object > Join: atoms or bonds from different structures become one (joinSelection).
    join: () => {
      const m = joinSelection(doc, selection);
      if (!m) return setNotice("Select one atom in each structure, or one bond in each of two structures.", "info");
      set(m);
    },
    // Center on Page (Object menu), as ChemDraw's: the box round the selection (its labels and text too), or round
    // the whole drawing, moves so its middle is the middle of the page.
    centre_page: () => {
      const { atoms, items } = chosen(), b = drawnBox(atoms, items);
      if (!b) return;
      // The page's middle is the drawing's origin. drawnBox is in px, y down.
      const d: P = [-(b[0] + b[2]) / 2 / L, (b[1] + b[3]) / 2 / L];
      if (Math.hypot(...d) > 1e-9) set(transformParts(doc, atoms, items, (q) => [q[0] + d[0], q[1] + d[1]], [1, 1], captionMiddles()), true);
    },
    // Repeat (Edit menu, and ⌘Y when there is nothing to redo), as ChemDraw's.
    repeat: () => repeatLast(),
    // The whole structure of the selected atom or bond (ChemDraw's Molecule > Select), as Space over it selects it.
    select_structure: () => choose(fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat(), picked),
    // Group (⌘G) and Ungroup (⇧⌘G), as ChemDraw's: the selected structures and objects select and move as one.
    group: () => {
      const r = groupSelection(doc, selection, picked);
      if (!r) return setNotice("Select two or more things to group.", "info");
      set(r[0], true);
    },
    ungroup: () => set(ungroupSelection(doc, selection, picked), true),
    // Pick as One (ChemDraw's Group > Integral): on the groups Ungroup would undo.
    group_integral: () => {
      const touched = new Set(groupTargets(doc, selection, picked)), on = [...touched].every((g) => g.integral);
      if (!touched.size) return setNotice("Select a group.", "info");
      set({ ...doc, groups: doc.groups?.map((g) => (touched.has(g) ? { ...g, integral: on ? undefined : true } : g)) }, true);
    },
    // Invert Selection (⇧⌘I): everything that was not selected is, and the rest is not.
    invert_selection: () => {
      setSelection(new Set(doc.atoms.map((_, i) => i).filter((i) => !selection.has(i))));
      setPicked(new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id).filter((id) => !picked.has(id))));
    },
    // Clean Up Reaction (⇧⌘X): every reaction the selection touches (a structure, a plus sign, an arrow or its text),
    // or every reaction in the drawing when nothing is selected, as Clean Up Structure works on the whole drawing.
    clean_reaction: () => {
      const items = new Set(picked), atoms = selection, any = !items.size && !atoms.size;
      const laid = cleanReactions(doc, (r) => r.arrows.some((id) => items.has(id)) || (withStructure(r) && (any || r.atoms.some((i) => atoms.has(i)) || r.captions.some((id) => items.has(id)))));
      if (!laid.count) return setNotice(laid.kept ? "Octet leaves the reaction as drawn. A new layout would move it on to, or away from, the rest of the drawing." : "Octet finds no reaction to clean up. Draw a straight arrow with a structure on each side.", "info");
      if (sameLayout(doc, laid.mol)) return; // nothing to undo when it was clean already
      sayAfter(laid.count === 1 ? "Cleaned up the reaction." : `Cleaned up ${laid.count} reactions.`);
      glideTo(laid.mol);
    },
    // Augmented Clean Up Reaction (ChemDraw's): each product turned to lie as the reactant it came from, by the atom
    // map (mapped for this and the map taken off again when the reaction had none), then Clean Up Reaction.
    clean_reaction_augmented: () => {
      const arrow = reactionPicked()?.arrows[0] ?? [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      const r = arrow !== undefined ? reactionOf(arrow) : undefined;
      if (!r || arrow === undefined) return setNotice("Select a reaction arrow first.", "info");
      const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
      const steps = interpret(doc, r, captionBox).map((x) => ({ reactants: structures(x.reactants), products: structures(x.products) }));
      const had = r.atoms.some((i) => doc.atoms[i].map);
      let m = alignByMap(had ? doc : mapScheme(doc, steps, mapReaction, (atoms) => pickAtoms(doc, atoms)) ?? doc, steps);
      if (!had) m = { ...clearScheme(m, new Set(r.atoms)), bonds: m.bonds.map((b, k) => ({ ...b, rxn: doc.bonds[k].rxn })) };
      // The reaction read again from where its parts now stand, then laid out as Clean Up Reaction lays it out.
      set(cleanReactions(m, (x) => x.arrows.includes(arrow)).mol, true);
    },
    // Show Reaction Interpretation (View menu): pointing at a reaction shows what each part of it is.
    interpretation: () => setSettings((s) => ({ ...s, interpretation: !s.interpretation })),
    // Structure > Map Reaction Atoms and Clear Reaction Map, as ChemDraw's.
    map_reaction: () => runAction("reaction.map"),
    clear_reaction_map: () => runAction("reaction.unmap"),
    // Zoom about the middle of the window. Actual size is 100%: bonds at their true 14.4 pt.
    zoom_in: () => zoomTo(views.get().zoom * 1.25),
    zoom_out: () => zoomTo(views.get().zoom / 1.25),
    zoom_actual: () => zoomTo(1 / frame.k),
    actions: () => setSettings((s) => ({ ...s, actions: !s.actions })),
    export: () => checkFirst(openExport),
    export_quick: () => checkFirst(() => void quickExport()),
    print: () => void printDrawing(),
    print_selection: () => void printDrawing(true),
    apply_style_file: () => void applyStyleFile(),
    about: () => setAbout(true),
    // Atom Properties (Structure menu): the selected atom's element or label, charge, isotope and radical.
    atom_properties: () => atomProperties([...selection][0] ?? hovers.get().atom),
    bond_properties: () => bondProperties(),
    bracket_properties: () => bracketProperties(),
    rlogic: () => rLogic(),
    // Add Multi-Centre Attachment and Add Variable Attachment (Structure menu): an attachment at the centre of the
    // selected atoms, for a bond to be drawn from it (to the metal of an η ligand, or to a substituent).
    add_multicentre: () => attach(false),
    add_variable: () => attach(true),
    // An R-group definition round the selected structures, named with the next R number.
    define_rgroup: () => {
      const atoms = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
      if (!atoms.length) return setNotice("Select the fragments that the R-group stands for.", "info");
      // The box clears the structures as drawn, labels and the text under them too.
      const ink = withCaptions(atoms), xs = atoms.map((i) => doc.atoms[i].location[0]), ys = atoms.map((i) => doc.atoms[i].location[1]);
      const [x0, y0, x1, y1] = ink ? [ink[0] / L, -ink[3] / L, ink[2] / L, -ink[1] / L] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const [m, id] = addShape(doc, { kind: "box", from: [x0 - 0.4, y1 + 0.4], to: [x1 + 0.4, y0 - 0.4], rgroup: { name: nextRGroup(doc) } });
      set(m);
      setPicked(new Set([id]));
    },
    // Expand Generic Structure: every structure the selected generic structures (or all) stand for, in a new drawing.
    expand_generic: () => {
      const { mols, total } = expandGeneric(doc, selection.size ? [...selection] : doc.atoms.map((_, i) => i));
      if (!mols.length) return setNotice("This structure has nothing to expand. Use an R-group, an element list, an alternative group, a variable attachment or a wavy bond.", "info");
      keepWork(() => {
        const grid = layoutGrid(mols);
        set(grid);
        setFile({ saved: EMPTY });
        if (total > MOST) setNotice(`Octet made the first ${MOST} of ${total.toLocaleString("en-GB")} structures.`, "info");
        const b = bounds(grid);
        if (b) setView((v) => ({ ...v, x: frameWidth() / 2 - ((b[0] + b[2]) / 2) * v.zoom * L, y: frameMidY() + ((b[1] + b[3]) / 2) * v.zoom * L }));
      });
    },
    // Show Atom Number (Object menu): each atom's number beside it, for the selected atoms or the whole drawing.
    atom_numbers: () => numberAtoms(selection.size ? [...selection] : doc.atoms.map((_, i) => i), true),
    // Page Setup (⇧⌘P): the page's size and orientation, which live in the document's settings.
    page_setup: () => setSettingsOpen("document"),
    // Analyse Stoichiometry: a grid under the picked reaction, or off again.
    stoichiometry: () => {
      const arrow = reactionPicked()?.arrows[0] ?? [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      if (arrow === undefined) return setNotice("Select a reaction first.", "info");
      const has = doc.grids?.some((g) => reactionOf(g.arrow)?.arrows.includes(arrow));
      set({ ...doc, grids: has ? doc.grids!.filter((g) => !reactionOf(g.arrow)?.arrows.includes(arrow)) : [...(doc.grids ?? []), { arrow, typed: {} }] }, true);
    },
    properties: () => setSettings((s) => ({ ...s, properties: !s.properties })),
    predict_1h: () => openSpectrum("1H"),
    // Expand Label (Structure menu): each selected label (OMe, CO2Et, Boc) drawn out as its atoms.
    expand_label: () => {
      let m = doc;
      const labelled = [...selection].filter((i) => doc.atoms[i]?.text && doc.atoms[i].chemical !== false).sort((a, b) => b - a);
      if (!labelled.length) return setNotice("Select a labelled atom, such as OMe or Boc.", "info");
      for (const i of labelled) {
        // An abbreviation Octet knows, else the group Contract Label kept with the label (or a ChemDraw file's).
        // A residue label (its bonds say which kept atom each joins) is its kept group, even when its text is P.
        const inner = m.atoms[i].inner, ported = !!inner?.atoms.length && m.bonds.some((b) => b.ports && b.atoms.some((k, e) => k === i && b.ports![e] >= 0));
        const smiles = ported ? undefined : labelSmiles(chemicalText(doc.atoms[i].text, doc.atoms[i].runs)!);
        if (!smiles && !inner?.atoms.length) { setNotice(`Octet cannot draw out ${doc.atoms[i].text}.`); continue; }
        try { m = expandLabel(m, i, smiles ? parseStructure(smiles) : inner!); } catch { setNotice(`Octet cannot draw out ${doc.atoms[i].text}.`); }
      }
      set(m);
    },
    // Interpret Chemically, as ChemDraw's (on labels and captions): the selected labels become text, not chemistry, and
    // a label with no bonds becomes a caption where it was; or they are chemistry again. The picked captions turn
    // their own Interpret Chemically off, or on again (edit.ts chemicalCaption): they stay captions.
    interpret: () => {
      const ids = [...selection].filter((i) => drawing.label[i]);
      if (ids.length) {
        const on = ids.some((i) => doc.atoms[i].chemical === false), lone = on ? [] : ids.filter((i) => !neighbours(doc, i).length);
        let m = interpretLabels(doc, ids, on, style.hideH);
        for (const i of lone) {
          const a = m.atoms[i], k = (a.size ?? style.labelSize) / style.labelSize, first = measure((doc.atoms[i].text ?? a.label)[0]);
          const runs = formulaRuns(a.text!).map((r) => (r.sub ? { text: r.text, script: "sub" as const } : { text: r.text }));
          [m] = addCaption(m, { text: a.text!, x: drawing.label[i]![0] / L, y: (a.location[1] * L - (first.ascent * k) / 2) / L, align: "left", ...(runs.some((r) => r.script) ? { runs } : {}),
            ...(a.size || style.labelSize !== style.captionSize ? { size: a.size ?? style.labelSize } : {}), ...(a.font || style.labelFont !== style.captionFont ? { font: a.font ?? style.labelFont } : {}),
            ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}), ...(a.colour ? { colour: a.colour } : {}) });
        }
        if (lone.length) { m = deleteChosen(m, new Set(lone), new Set(), undefined, drawnAt, drawnAlign); setSelection(new Set()); }
        return set(m, true);
      }
      const caps = (doc.captions ?? []).filter((c) => picked.has(c.id));
      if (!caps.length) return setNotice("Select a label or a caption.", "info");
      const on = caps.some((c) => c.chemical === false), flag = ({ chemical: _, ...c }: Caption): Caption => (on ? c : { ...c, chemical: false });
      return set({ ...doc, captions: doc.captions!.map((c) => (picked.has(c.id) ? flag(c) : c)) }, true);
    },
    // Make element (Sam, 21 October 2026): the picked captions that read as an element or a label become atoms.
    make_element: () => {
      const caps = (doc.captions ?? []).filter((c) => picked.has(c.id) && labelable(c));
      if (!caps.length) return setNotice("Select a caption with an element or a label, such as Rh or OMe.", "info");
      makeElements(caps);
    },
    // Contract Label (Structure menu): the selected substituent (joined to the rest by one bond) becomes one labelled
    // atom: the abbreviation it is (OMe, CO2Et, Boc, TBS), recognised whatever way it was drawn, or else its formula.
    // The label to contract to is asked for, as in ChemDraw, with Octet's suggestion filled in.
    contract_label: () => {
      const group = new Set([...selection].filter((i) => i < doc.atoms.length));
      const links = doc.bonds.filter((b) => group.has(b.atoms[0]) !== group.has(b.atoms[1]));
      if (group.size < 2 || !links.length) return setNotice("Select a group joined to the rest of the structure.", "info");
      // Joined on more than one side (a residue in a chain): its name when it is an amino acid, a nucleoside or a
      // phosphate, with each outside bond capped as the free compound has it (OH on C or P, H on N or O).
      if (links.length > 1) {
        const keep = group.has(links[0].atoms[0]) ? links[0].atoms[0] : links[0].atoms[1];
        return setDialog({ kind: "contract", text: residueName(doc, group, toInchi) ?? analyse(subset(doc, group))?.[0]?.formula ?? "R", keep, group: [...group] });
      }
      const keep = group.has(links[0].atoms[0]) ? links[0].atoms[0] : links[0].atoms[1], outside = links[0].atoms[0] === keep ? links[0].atoms[1] : links[0].atoms[0];
      // The group with xenon in place of the rest of the structure, as an InChI, against each abbreviation's.
      const capped = subset({ ...doc, atoms: doc.atoms.map((a, i) => (i === outside ? { ...a, label: "Xe", text: undefined, charge: undefined } : a)) }, new Set([...group, outside]));
      const want = toInchi(capped), text = want && contractLabelText(want);
      const formula = analyse(subset(doc, group))?.[0]?.formula;
      setDialog({ kind: "contract", text: text ?? formula ?? "R", keep, group: [...group], want });
    },
    // Toggle Hydrogen Display (Structure menu): explicit H atoms on carbon in the selection (or the drawing) hidden or
    // shown again, as ChemDraw's.
    hydrogen_display: () => {
      const m = toggleHydrogens(doc, selection.size ? selection : doc.atoms.map((_, i) => i));
      // An H on an atom with a warning stays shown (set shows it again).
      const same = (settings.warnings ? showWarnedHydrogens(m) : m).atoms.every((a, i) => a.hidden === doc.atoms[i].hidden);
      return same ? setNotice("Select a structure with H atoms on carbon.", "info") : set(m, true);
    },
    // Toggle Aromatic Display (⌥⌘K): the selected structures' aromatic rings with circles, or back to Kekulé bonds.
    aromatic_display: () => {
      const atoms = selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i);
      const on = !atoms.some((i) => doc.atoms[i].circle);
      set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? { ...a, circle: on || undefined } : a)) }, true);
    },
    // Show Stereochemistry (Object menu): on or off for the selected structures, or every structure.
    show_stereo: () => {
      const atoms = selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i);
      const on = !atoms.every((i) => doc.atoms[i].cip);
      set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.includes(i) ? { ...a, cip: on || undefined } : a)) }, true);
    },
    predict_13c: () => openSpectrum("13C"),
    // Explain This Warning (ChemDraw's context menu): the warnings marked on the selection, in a dialog.
    explain_warning: () => { const list = selectedOf(found); return list.length ? setExplaining(list) : setNotice("Select an object with a warning.", "info"); },
    // Structure > Check Structure: the selection's problems (or the drawing's) one at a time (see checkThen).
    check_structure: () => checkThen(selection.size || picked.size ? subsetProblems() : allProblems(), () => {}, true),
    // Structure > Enhanced Stereochemistry, as ChemDraw's: on the selected stereocentres (every one with nothing
    // selected). Clear All takes their flags off; Mark as Absolute flags them abs; Create Or Group and Create And Group
    // put each structure's selected centres in a new group, numbered with the lowest number its structure has free.
    stereo_clear: () => enhance(undefined),
    stereo_abs: () => enhance("abs"),
    stereo_or: () => enhance("or"),
    stereo_and: () => enhance("&"),
    name_to_structure: () => nameToStructure(),
    // Structure > Insert Peptide… (issue 27): the name field, ready for one-letter codes after "peptide: " (peptide.ts).
    insert_peptide: () => insertSequence("peptide: "),
    // Structure > Insert RNA… and Insert DNA…: the same, for one-letter codes after "rna: " or "dna: " (nucleic.ts).
    insert_rna: () => insertSequence("rna: "),
    insert_dna: () => insertSequence("dna: "),
    // Structure > Add Structure to Dictionary…: a name of the user's own for the selected structure.
    dictionary_add: () => addToDictionary(),
    // View > Templates: a set's floating palette shown or hidden (the user's sets, then Octet's, as the menu lists them).
    ...Object.fromEntries(menuSets.map((set, k) => [`templates_${k}`, () => togglePalette(set)])),
    // File > Save Templates for ChemDraw: a set as a ChemDraw template file (the sets in View > Templates' order).
    ...Object.fromEntries(menuSets.map((set, k) => [`ctp_${k}`, () => saveTemplateSet(set)])),
    document: () => setSettingsOpen("document"),
    settings: () => setSettingsOpen(moduleOf(settings.settingsModule)),
    structure_to_name: () => nameStructures(),
    copy_smiles: () => copyAs("smiles"),
    copy_inchi: () => copyAs("inchi"),
    copy_inchikey: () => copyAs("inchikey"),
    copy_cdxml: () => copyAs("cdxml"),
    copy_mol: () => copyAs("mol"),
    copy_mol_v2000: () => copyAs("mol_v2000"),
    // File > Open Recent: the drawing at that place in the list (the menu lists them in the list's order).
    ...Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`recent_${k}`, () => {
      if (TAURI) void invoke<RecentEntry[]>("recent_list").then((list) => { if (list[k]) openRecent(list[k]); }).catch(() => {});
    }])),
    recent_clear: () => refreshRecents(),
    revert: () => revertToSaved(),
    // Search Reaxys and Search PubChem (the Search menu and the Actions panel), while Settings > Online search is on.
    ...(settings.onlineSearch ? Object.fromEntries(Object.entries(SEARCHES).map(([id, [site, exact]]) => [id, () => searchOnline(site, exact)])) : {}),
    // Bring to Front (⌘[) and Send to Back (⌘]), as ChemDraw's: any selected structure (a picked atom or bond takes its
    // whole structure) and object goes over, or under, everything else; and the selected bonds go over (or under) the
    // bonds they cross, which then have the gap (render.ts).
    bring_front: () => restack(true),
    send_back: () => restack(false),
    command_palette: () => { setCommandsOpen((o) => !o); if (!namesLoaded) void loadNames().then(() => setNamesLoaded(true)).catch(() => {}); },
    // The Text menu styles the caption being typed, or the picked captions.
    text_bold: () => runAction("caption.bold"),
    text_plain: () => runAction("caption.plain"),
    text_sub: () => runAction("caption.sub"),
    text_super: () => runAction("caption.super"),
    text_formula: () => runAction("caption.formula"),
    text_markup: () => markupText(),
    // While typing, the key moves the focus into a map already open (CharMap.tsx); otherwise it opens or closes it. The
    // map opened with the key takes the focus; opened from the menu with the mouse, it leaves the caret in the text.
    char_map: () => {
      const byKey = performance.now() - charKey.current < 1000, first = document.querySelector<HTMLElement>(".char-map .char[tabindex='0']");
      if (first && typing() && byKey) return first.focus();
      charFocus.current = byKey;
      setCharMap((o) => !o);
    },
    // Text > Font: Other Font… finds any font on the computer (the menu's own fonts are added with the font list).
    font_other: () => {
      const c = contextOf();
      setDialog({ kind: "font", font: (c.kind === "caption" ? c.font : c.kind === "atom" || c.kind === "structure" ? c.text?.font : undefined) ?? style.captionFont });
    },
    text_italic: () => runAction("caption.italic"),
    text_underline: () => runAction("caption.underline"),
    // Text alignment: on captions, and on the selected atom labels (with Stacked Above and Automatic), as in ChemDraw.
    align_left: () => runAction("caption.align.left"),
    align_centre: () => runAction("caption.align.centre"),
    align_right: () => runAction("caption.align.right"),
    align_justify: () => restyle(() => ({ align: "justify" })),
    align_above: () => runAction("caption.align.above"),
    align_auto: () => runAction("caption.align.auto"),
    // The Curves menu: line styles, heads at either end (again takes one off), and a closed curve's fill.
    ...Object.fromEntries(["plain", "dashed", "bold", "doubled"].map((st) => [`curves_${st}`, () => runAction(`arrow.style.${st}`)])),
    ...Object.fromEntries((["start", "end"] as const).flatMap((at) => (["full", "left", "right"] as const).map((h) => [`curves_${at}_${h}`, () => runAction(`arrow.${at}.${h}`)]))),
    curves_closed: () => runAction("arrow.closed"),
    // The heads' shape: the picked arrows', or all of a picked cycle's arrows (as the Actions panel's Heads).
    ...Object.fromEntries(HEAD_SHAPES.map((h) => [`curves_head_${h}`, () => { const m = headMenu(contextOf()); if (m.head) runAction(`${m.cycle ? "cycle" : "arrow"}.head.${h}`); }])),
    ...Object.fromEntries(["solid", "shaded", "faded"].map((f) => [`curves_${f}`, () => runAction(`arrow.fill.${f}`)])),
    // The Colour menu: each colour in COLOURS by its place, and Other Colour… for the system picker.
    ...Object.fromEntries(COLOURS.map(([, hex], k) => [`colour_${k}`, () => runAction(`colour.${hex}`)])),
    // The user's colours, then the drawing's own (its saved palette and the colours it uses), as the menu lists them.
    ...Object.fromEntries(Array.from({ length: 44 }, (_, k) => [`colour_user_${k}`, () => { const c = [...settings.palette, ...docColours][k]; if (c) runAction(`colour.${c.hex}`); }])),
    // By Element, Highlight and Ring Fill, as in the Actions panel (and ChemDraw's Colors menu and toolbars).
    colour_by_element: () => colourByElement(),
    ...Object.fromEntries(["none", ...HIGHLIGHT_COLOURS.map(([, hex]) => hex)].map((v, k) => [`highlight_${k}`, () => runAction(`halo.${v}`)])),
    ...Object.fromEntries(["none", ...RING_FILLS.map(([, hex]) => hex)].map((v, k) => [`ringfill_${k}`, () => runAction(`ringfill.${v}`)])),
    colour_other: () => setSettingsOpen("appearance"),
    colours_add: () => { setAddingColour(true); setSettingsOpen("appearance"); },
    // Text > Size (its sizes are set with the font list, below): Other Size… types any size; Last Typed Size uses that
    // size again (ChemDraw's Other… and Set Font Size To Last One).
    size_other: () => setDialog({ kind: "size", size: String(lastSize.current ?? style.captionSize) }),
    size_last: () => (lastSize.current ? runAction(`caption.size.${lastSize.current}`) : commands.current.size_other()),
    // Text > Line Spacing…: Automatic, Variable, or Fixed at a size in pt, for the captions picked or being typed.
    line_spacing: () => {
      const c = writing ? { ...doc.captions?.find((x) => x.id === writing.id), ...writing.style } : doc.captions?.find((x) => picked.has(x.id)) ?? textStyle, lh = c.lineHeight;
      setDialog({ kind: "spacing", mode: lh === "variable" ? "variable" : typeof lh === "number" ? "fixed" : "auto", pt: String(typeof lh === "number" ? lh : Math.round((c.size ?? style.captionSize) * 1.2 * 10) / 10) });
    },
    // View > Show Page (ChemDraw's Show Document): the whole page in the window, centred. Fit to Window (⌘/) fits the
    // drawing.
    show_page: () => fitPage(pages[0]),
    zoom_fit: () => {
      // Everything drawn (text, arrows and shapes too), or the atoms when the canvas is not there.
      const ink = svg.current ? canvasInk(svg.current) : undefined, b = ink ? [ink[0] / L, -ink[3] / L, ink[2] / L, -ink[1] / L] : bounds(doc);
      if (!b) return moveView({ x: frameWidth() / 2, y: frameMidY(), zoom: openZoom(style) });
      const free = [frameWidth() - 160, frameSpan() - 120], size = [(b[2] - b[0] + 1) * L, (b[3] - b[1] + 1) * L];
      const zoom = clampZoom(Math.min(free[0] / size[0], free[1] / size[1]));
      moveView({ zoom, x: frameWidth() / 2 - ((b[0] + b[2]) / 2) * L * zoom, y: frameMidY() + ((b[1] + b[3]) / 2) * L * zoom });
    },
    // View > Centre in Window (⌥⌘/): the selection, or else the whole drawing (else the page), in the middle of the room
    // the panels leave, at the same zoom. From a key the view moves at once; from the pointer (the menu, Actions) it glides.
    centre_view: () => {
      const { atoms, items } = chosen(), [, w, h] = pages[0], el = svg.current?.getBoundingClientRect();
      const b = drawnBox(atoms, items) ?? [-(w / 2) * mm * L, -(h / 2) * mm * L, (w / 2) * mm * L, (h / 2) * mm * L];
      if (!el) return;
      const v = views.get(), [dx, dy] = centreIn([v.x + b[0] * v.zoom, v.y + b[1] * v.zoom, v.x + b[2] * v.zoom, v.y + b[3] * v.zoom], roomOf([el.left, el.top, el.right, el.bottom], panelSpans()));
      const to = { ...v, x: v.x + dx, y: v.y + dy };
      if (performance.now() - keyAt.current > 500) return moveView(to);
      stopCamera();
      setView(to);
    },
  };
  // Edit > Repeat, as ChemDraw's: the last turn, flip, scale, arrangement, frame, colour or text style again, on what
  // is selected now. Each of those menu commands, panel actions and dialogs notes itself as the one to repeat.
  for (const id of Object.keys(commands.current)) {
    if (!REPEATS.test(id)) continue;
    const run = commands.current[id];
    commands.current[id] = () => { lastRepeat.current = { menu: id }; run(); };
  }
  function repeatLast() {
    const r = lastRepeat.current;
    if (r?.menu) commands.current[r.menu]?.();
    else if (r?.action) runAction(r.action);
    else if (r?.rotate !== undefined) rotateBy(r.rotate);
    else if (r?.scale !== undefined) scaleBy(r.scale);
  }
  function zoomTo(target: number) {
    const view = views.get(), zoom = clampZoom(target), k = zoom / view.zoom, cx = frameWidth() / 2, cy = frameMidY();
    moveView({ zoom, x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k });
  }
  // Keep the setting on disk and the View menu ticks in step with it.
  const syncChecks = () => Promise.all(([["grid", !!guides.grid], ["rulers", !!guides.rulers], ["crosshair", !!guides.crosshair], ["snap", settings.snap], ["snap_grid", settings.snapGrid],
    ["warnings", settings.warnings], ["interpretation", settings.interpretation], ["fixed_lengths", settings.fixedLengths], ["fixed_angles", settings.fixedAngles],
    // View > Templates: a set is ticked while its floating palette is open.
    ...menuSets.map((set, k): [string, boolean] => [`templates_${k}`, settings.palettes.some((f) => f.set === set)])] as const).map(([id, checked]) => invoke("set_check", { id, checked }))).catch(() => {});
  useEffect(() => {
    saveSettings(settings);
    if (TAURI) syncChecks();
  }, [settings]);
  useEffect(() => { if (TAURI) syncChecks(); }, [guides, fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  // A setting changed in another window.
  const settingsNow = useRef(settings);
  settingsNow.current = settings;
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key !== SETTINGS_KEY) return;
      const next = loadSettings();
      if (JSON.stringify(next) !== JSON.stringify(settingsNow.current)) setSettings(next);
    };
    addEventListener("storage", changed);
    return () => removeEventListener("storage", changed);
  }, []);
  // The last menu command the page ran from a Ctrl key off the Mac, so the same command from the menu does not run twice.
  const pageRan = useRef<{ id: string; at: number }>(undefined);
  useEffect(() => {
    if (!TAURI) return;
    // Over a dialog, Settings or Home, the menu does not work on the drawing (menuRuns).
    const off = listen<string>("menu", (e) => {
      // A Ctrl shortcut the page already ran (off the Mac, below) can arrive from the menu too: run it once.
      const ran = pageRan.current;
      if (ran && ran.id === e.payload && performance.now() - ran.at < 600) return;
      if (menuRuns(e.payload, { home: homeOpen.current, modal: modal(), typing: typing() })) commands.current[e.payload]?.();
    });
    return () => { off.then((f) => f()); };
  }, []);
  // Files to open or dropped: those named before the page started, then each time the app says more came. The page
  // listens first and then takes, so a file named in between is not left waiting.
  useEffect(() => {
    if (!TAURI) return;
    const take = () => commands.current.opened();
    const off = listen("opened", take);
    void off.then(take, take);
    return () => { off.then((f) => f()); };
  }, []);
  // A new drawing window opens what Home or another window asked for (src-tauri/src/windows.rs).
  useEffect(() => {
    if (!DRAW_WINDOW) return;
    void invoke<Start | null>("window_start").then(async (s) => {
      if (!s) return;
      if ("new" in s) newDrawing(s.new, true);
      else if ("tutorial" in s) startTutorial();
      else if ("recent" in s) openRecent({ path: s.recent });
      else if ("recovered" in s) openRecovered({ id: s.recovered, name: "", at: 0 });
      else if ("text" in s) load(undefined, s.text);
      else if ("picked" in s) openPicked(s.picked);
      else await takeFiles(s.files, false);
    }).catch((e) => setNotice(failure("Octet cannot open this drawing.", e)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // File > Home in a drawing window: Home over this window's drawing (src-tauri/src/windows.rs show_home).
  useEffect(() => {
    if (!HOME_WINDOW) return;
    const offHome = listen("show-home", () => { if (menuRuns("home", { home: homeOpen.current, modal: modal(), typing: typing() })) commands.current.home(); });
    // Its drawing chosen from a list: Home closes over it.
    const offDrawing = listen("show-drawing", () => setHome(false));
    return () => { offHome.then((f) => f()); offDrawing.then((f) => f()); };
  }, []);
  // The open drawing windows, kept up to date.
  useEffect(() => {
    if (!TAURI) return;
    void invoke<OpenWindow[]>("window_list").then(setOpenWindows).catch(() => {});
    const off = listen<OpenWindow[]>("windows", (e) => setOpenWindows(e.payload));
    return () => { off.then((f) => f()); };
  }, []);
  // In front: the menu bar takes this window's state again (and Home reads its lists again). Left: a drawing window
  // gives Home its picture.
  const leftWindow = useRef(() => {});
  leftWindow.current = () => { if (listed) invoke("window_info", { name: mainName, path: mainFile.path ?? null, edited: unsaved, picture: pictureOf(mainDoc) ?? "" }).catch(() => {}); };
  useEffect(() => {
    if (!TAURI) return;
    const off = getCurrentWindow().onFocusChanged(({ payload }) => (payload ? setFronted((n) => n + 1) : leftWindow.current()));
    return () => { off.then((f) => f()); };
  }, []);
  // Every menu command's shortcut can be changed in Settings, with the canvas keys: the menu lists its commands, and
  // is built again with the user's shortcuts (Command or Ctrl ones; the page handles any other key itself).
  // Settings > Online search: the Search menu is built only while it is on, so the list is read after it is set.
  const [menuReady, setMenuReady] = useState(0);
  useEffect(() => {
    if (TAURI) invoke("set_online_search", { on: settings.onlineSearch }).then(() => invoke<[string, string, string, string][]>("menu_items"))
      .then((items) => { registerMenu(items); setMenuReady(items.length); }).then(syncChecks).catch(() => {});
  }, [settings.onlineSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  const sentMenuKeys = useRef("");
  useEffect(() => {
    if (!TAURI || !menuReady) return;
    const map = keymap(settings.keys), keys: Record<string, string> = {};
    for (const a of ACTIONS) if (a.id.startsWith("menu.")) { const k = (map[a.id] ?? []).find(native); keys[a.id.slice(5)] = k ? toAccelerator(k) : ""; }
    const text = JSON.stringify(keys);
    if (text === sentMenuKeys.current || (!sentMenuKeys.current && !Object.keys(settings.keys).some((id) => id.startsWith("menu.")))) { sentMenuKeys.current ||= text; return; }
    sentMenuKeys.current = text;
    invoke("set_menu_keys", { keys }).then(syncChecks).catch(() => {});
  }, [settings.keys, menuReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Screen (px from the window's top left) to drawing coordinates (bond lengths, y up).
  const toDoc = (sx: number, sy: number): P => { const view = views.get(); return [(sx - view.x) / (view.zoom * L), -(sy - view.y) / (view.zoom * L)]; };

  // The document's style (or the default for new documents), as widths and sizes in the drawing frame. It comes before
  // the Chain tool's path, which uses its chain angle while the drawing is shown.
  // A drawing with no style (from another program, with Keep ChemDraw styles off) takes the style File > New gives.
  const newStyle = useMemo(() => styleFor(settings, settings.purpose), [settings.purpose, settings.purposeStyles, settings.ownPurposes]); // eslint-disable-line react-hooks/exhaustive-deps
  const style: DocStyle = useMemo(() => readStyle(doc.style ?? newStyle), [doc.style, newStyle]);
  // The drawing as chemistry reads it (edit.ts withCaptionAtoms): the captions that count as chemistry (ChemDraw's
  // Interpret Chemically) as lone atoms after its own, for the formula and mass, names, copies and warnings.
  const chem = useMemo(() => withCaptionAtoms(doc, style.interpret), [doc, style.interpret]);
  // The atoms in chem of the picked captions that count as chemistry; undefined when no caption is picked.
  const pickedChem = (pk: Set<number>) => (doc.captions?.some((c) => pk.has(c.id)) ? new Set(chem.captions.flatMap((id, k) => (pk.has(id) ? [doc.atoms.length + k] : []))) : undefined);
  // The Chain tool. A drag's points (snaking or straight), and how many atoms they draw: one per bond, and the first
  // atom too on empty canvas (ChemDraw's count).
  const chainPath = (d: { from: number | P; to?: P; side?: number; path?: P[] }) => d.path ?? chainPoints(doc, d.from, d.to ?? (typeof d.from === "number" ? pos(doc, d.from) : d.from), d.side ?? 1, style.chainAngle);
  const chainCount = (d: { from: number | P; to?: P; side?: number; path?: P[] }) => chainPath(d).length + (typeof d.from === "number" ? 0 : 1);
  // A part of the drawing shown alone for a moment, to take its picture (copy and export).
  const [exporting, setExporting] = useState<Mol>();
  // A copy that worked (FEEL-41): the selection's tint rises and falls once, or with nothing selected the page's edge
  // lights once. n restarts it; editor.css leaves it out with reduced motion.
  const [copied, setCopied] = useState<{ n: number; page: boolean }>();
  const ackCopy = (page: boolean) => setCopied((c) => ({ n: (c?.n ?? 0) + 1, page }));
  // A ring dragged with a ring tool: its first bond from the press (or the atom pressed) to the pointer, the ring on
  // that bond's left, as ChemDraw draws it. Command and Shift at the press work as on a click. A chair faces the drag.
  const ringDrop = (d: Extract<Drag, { kind: "ring" }>): Mol => {
    const r: { n: number; aromatic: boolean; chair?: 1 | 2 } = RINGS[ringKind as RingKind], origin = typeof d.from === "number" ? pos(doc, d.from) : d.from, to = d.to!;
    // From a bond: the ring on the side dragged to, a chair the way it fits nearest the pointer.
    if (d.target.bond !== undefined && d.target.atom === undefined) {
      const bond = d.target.bond;
      return r.chair ? addChair(doc, r.chair, { bond, toward: to }) : addRing(doc, r.n, r.aromatic || !!d.meta, { bond, toward: to }, { firstSingle: d.shift, circle: d.meta });
    }
    if (r.chair) return addChair(doc, r.chair, { point: origin, turn: Math.atan2(to[1] - origin[1], to[0] - origin[0]) });
    return addRing(doc, r.n, r.aromatic || !!d.meta, { along: [origin, to], ...(typeof d.from === "number" ? { atom: d.from } : {}) }, { firstSingle: d.shift, circle: d.meta });
  };
  // A chair dragged with ⌘ stays off a catalytic cycle, as a stamped one does (⌘ draws a plain ring delocalised).
  const chairFree = (d: Extract<Drag, { kind: "ring" }>) => !!d.meta && !!(RINGS[ringKind as RingKind] as { chair?: 1 | 2 } | undefined)?.chair;
  const shown = useMemo(() => {
    if (exporting) return exporting;
    if (drag?.kind === "bond" && drag.to) return dragBond(doc, drag.from, drag.to, bondSpec);
    if (drag?.kind === "chain" && drag.to) return chainThrough(doc, drag.from, chainPath(drag)).mol;
    if (drag?.kind === "ring" && drag.to) return dropped(ringDrop(drag), chairFree(drag), true);
    if (drag?.kind === "move" || drag?.kind === "handle" || drag?.kind === "turn" || drag?.kind === "resize" || drag?.kind === "tilt" || drag?.kind === "spot" || drag?.kind === "tlcline" || drag?.kind === "lane" || drag?.kind === "tableedge" || drag?.kind === "mark") return placeCentres(dropped(drag.kind === "move" ? followLeaders(doc, drag.working) : drag.working, drag.kind === "move" && drag.skip));
    if (drag?.kind === "arrow" && drag.to && tool === "massspec") return msLine(drag, drag.to)[0];
    if (drag?.kind === "arrow" && drag.to && drag.make?.kind === "cut") return massCut(drag, true).mol;
    if (drag?.kind === "arrow" && drag.to) return addArrow(doc, newArrow(drag.from, drag.to, drag.side, drag.make))[0];
    if (drag?.kind === "shape" && drag.to) { const sh = shapeFrom(drag.from, drag.to); return sh ? addShape(doc, sh)[0] : doc; }
    if (drag?.kind === "cycle" && drag.to) return addCycle(doc, newCycle(drag.from, drag.to))[0];
    if (drag?.kind === "cycle" && drag.pull?.made) return drag.pull.made.m;
    if (drag?.kind === "cycle" && drag.radius) return drag.radius;
    if (pen || drag?.kind === "pen") {
      // The curve so far, with the point being placed (or a straight run to the pointer).
      const now = drag?.kind === "pen" ? penPoint(drag.at, drag.out) : penAt ? { at: penAt } : undefined, points = [...(pen ?? []), ...(now ? [now] : [])];
      if (points.length >= 2) return addArrow(doc, { kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve: { points } })[0];
    }
    if (glide?.to === doc) return glide.mol;
    return doc;
  }, [doc, drag, pen, penAt, glide, exporting]); // eslint-disable-line react-hooks/exhaustive-deps
  // The space between the parts of a reaction (Clean Up Reaction, the reaction shortcut, a product pasted after an arrow).
  const reactionGap = gapFor(style.captionSize, style.bond);
  // The font lists: Octet's fonts, then any other font the drawing uses (one picked from More fonts, or a file's).
  const fontList = useMemo(() => {
    const used = new Set<string>([style.labelFont, style.captionFont]);
    for (const a of doc.atoms) if (a.font) used.add(a.font);
    for (const c of doc.captions ?? []) { if (c.font) used.add(c.font); for (const r of c.runs ?? []) if (r.font) used.add(r.font); }
    return [...FONTS, ...[...used].filter((f) => !FONTS.includes(f)).sort()];
  }, [doc.atoms, doc.captions, style]);
  // The sizes on offer: ChemDraw's sizes times the document scale (decision 0007).
  const sizeList = useMemo(() => sizesAt(style.scale), [style.scale]);
  // Text > Font and Text > Size list the same fonts and sizes, on captions and on selected atom labels, as ChemDraw's:
  // the menu bar is built again when a list changes.
  Object.assign(commands.current, Object.fromEntries(fontList.map((f) => [`font:${f}`, () => runAction(`caption.font.${f}`)])));
  Object.assign(commands.current, Object.fromEntries(sizeList.map((pt) => [`size_${pt}`, () => runAction(`caption.size.${pt}`)])));
  const fontNames = fontList.join("\n");
  useEffect(() => {
    if (TAURI) invoke("set_text_lists", { fonts: fontList, sizes: sizeList }).then(syncChecks).catch(() => {});
  }, [fontNames, sizeList, fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSize = useRef<number>(undefined); // the size last typed in Other Size…
  // The text style of the first labelled atom among these, for the label style buttons; none when no atom has a label.
  const labelText = (ids: number[]) => {
    const i = ids.find((k) => drawing.label[k]), a = i === undefined ? undefined : doc.atoms[i];
    // The size the label is drawn at: its own size (or the document's) times its atom's scale.
    return a && { bold: !!a.bold, italic: !!a.italic, underline: !!a.underline, font: a.font ?? style.labelFont, size: Math.round((a.size ?? style.labelSize) * scaleOf(a) * 100) / 100, align: a.align ?? "auto", chemical: a.chemical !== false };
  };
  // An atom label's font: its own font, bold and italic when it has them, else the document's label font.
  const labelFont = (l: { size: number; font?: string; bold?: boolean; italic?: boolean }, font = style.labelFont) =>
    `${l.italic ? "italic " : ""}${l.bold ? "bold " : ""}${l.size}px ${fontStack(l.font ?? font)}`;
  const frame = useMemo(() => frameStyle(style, L), [style]);
  const measure = useMemo(() => measurer(fontStack(style.labelFont), frame.size), [style.labelFont, frame.size]);
  const pt = (4 / 3) * frame.k; // frame px per point
  // The document's style with an object's own line width (points), one for each width, so ink is kept with it.
  const lineStyles = useMemo(() => new Map<number, typeof frame>(), [frame]);
  const lined = (width?: number) => {
    if (width === undefined) return frame;
    let s = lineStyles.get(width);
    if (!s) lineStyles.set(width, (s = { ...frame, line: width * pt }));
    return s;
  };
  // The zoom limits (set below, once the pages are known), and a zoom kept inside them.
  const zoomLimits = useRef<[number, number]>([0.25, 8]);
  const clampZoom = (z: number) => Math.min(zoomLimits.current[1], Math.max(zoomLimits.current[0], z));
  // A new bond length keeps the drawing the same size on screen relative to its true size at the document's scale. A
  // new scale (a purpose, or the Scale field) keeps the structures still on screen, and the page outlines grow or
  // shrink round them (IDEA-SIZE-7).
  const lastK = useRef(frame.k * style.scale);
  // A zoom past the limits comes back inside them about the window's middle, so the next pinch does not jump.
  useEffect(() => {
    const r = lastK.current / (frame.k * style.scale), cx = frameWidth() / 2, cy = frameMidY();
    lastK.current = frame.k * style.scale;
    if (Math.abs(r - 1) < 1e-3) return;
    setView((v) => { const zoom = clampZoom(v.zoom * r), q = zoom / (v.zoom * r); return { zoom, x: cx - (cx - v.x) * q, y: cy - (cy - v.y) * q }; });
  }, [frame.k, style.scale]); // eslint-disable-line react-hooks/exhaustive-deps
  // Each structure is drawn again only when its atoms or bonds change (renderParts): a drag of text, an arrow or one
  // structure leaves the other structures' drawings as they were. A structure a drag moves keeps its drawing, moved by
  // a transform, and its points move where it lands.
  const partCache = useRef<{ frame: typeof frame; measure: typeof measure; cache: PartCache }>(undefined);
  const still = !drag && glide?.to !== doc;
  const drawing = useMemo(() => {
    if (partCache.current?.frame !== frame || partCache.current.measure !== measure) partCache.current = { frame, measure, cache: { parts: new WeakMap(), last: new Map() } };
    return renderParts(shown, frame, measure, L, partCache.current.cache, still);
  }, [shown.atoms, shown.bonds, frame, measure, still]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pages, in bond lengths: the document's page, then the rest of its series, all turned the same way.
  const mm = ((72 / 25.4) * (4 / 3) * frame.k) / L;
  // The page's background. On a dark or blue page, structures and default-coloured text are white.
  const [systemDark, setSystemDark] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const q = matchMedia("(prefers-color-scheme: dark)"), on = () => setSystemDark(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  const { own, paper, dark: darkPaper } = paperOf(style, systemDark);
  // The cursors in the colour the user chose (Settings > General > Cursor): on the canvas for its page, and in the
  // panels (editor.css, --cursor-*) for the interface's light or dark.
  const cursor = cursors?.[cursorColour(settings.cursor, darkPaper)];
  useEffect(() => {
    const ui = cursors?.[cursorColour(settings.cursor, systemDark)];
    for (const [name, value] of Object.entries(ui ?? {})) document.documentElement.style.setProperty(`--cursor-${name}`, value);
  }, [cursors, settings.cursor, systemDark]);
  const textInk = (c: string) => inkOn(darkPaper, c);
  // The page outlines (mm): the page, then what the drawing's purpose needs (IDEA-SIZE-6), unless Settings > Page edges
  // is Page only.
  const purposeKind = purposeOf(settings, style.purpose)?.kind;
  const pages = useMemo(() => pageOutlines(style, purposeKind, settings.outlines), [style, purposeKind, settings.outlines]);
  // An experiment page (experiment.ts): its details as a block at the top of the page. A double-click on the block
  // opens them to edit.
  const expPage = experimentPage(purposeKind, style.purpose, doc.annotations);
  const details = useMemo(() => (expPage ? detailsLayout(detailsOf(doc.annotations), [pages[0][1], pages[0][2]], style.bond, style.captionSize,
    (text, size, bold) => textWidth(text, size, bold, false, fontStack(style.captionFont))) : undefined), [expPage, doc.annotations, pages, style]);
  const detailsAt = (p: P) => !!details && p[0] >= details.box[0] && p[0] <= details.box[2] && p[1] >= details.box[1] && p[1] <= details.box[3];
  // A new page size on the same drawing (a purpose or a scale): the outlines grow or shrink into place about the page's
  // middle. A new or opened drawing shows them at once.
  const pagesEl = useRef<SVGGElement>(null), outlineFrom = useRef<number>(undefined);
  useEffect(() => {
    const now = pages[0][1] * mm, was = outlineFrom.current;
    outlineFrom.current = now;
    if (was === undefined || Math.abs(was / now - 1) < 1e-3 || reduced()) return;
    pagesEl.current?.animate([{ transform: `scale(${was / now})` }, { transform: "scale(1)" }], timing("--motion-slow"));
  }, [pages, mm]);
  // The page whose edge is under a point (drawing coordinates), within a few screen px. With page edges off, none.
  const pageEdgeAt = (p: P) => edgeAt(style.edges ? pages : [], [p[0] / mm, p[1] / mm], 5 / (views.get().zoom * L * mm));
  // The page a press fits in the window: on a page's edge clear of the drawing, with every tool (Sam asks for this).
  // (ChemDraw's help gives a page boundary no click action; its View > Show Document fits the page.)
  const edgePage = (p: P, t: Hover) => (t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined ? pageEdgeAt(p) : undefined);
  // The grid (grid.ts): the document's step, counted from the page's top-left corner (where the rulers start), or
  // from the crosshair while it shows. It shows on engineering paper and with View > Show Grid; the crosshair shows
  // its heavier lines. Snap to Grid snaps to the lines that show, within 6 screen px; ⌘ frees.
  const corner: P = [-(pages[0][1] / 2) * mm, (pages[0][2] / 2) * mm];
  const cross = drag?.kind === "crosshair" ? drag.at : guides.crosshair;
  const grid = gridOf(style.grid, mm, cross ?? corner), heavy = { ...grid, minor: grid.minor * grid.every, every: 1 };
  const gridShown = !!guides.grid || paper === "blueprint";
  const snapGrid = !settings.snapGrid ? undefined : gridShown ? grid : guides.crosshair ? heavy : undefined;
  const toGrid = (p: P, free = false): P => {
    if (!snapGrid || free) return p;
    const [x, y] = snapToGrid(snapGrid, p, views.get().zoom * L, 6);
    return [x ?? p[0], y ?? p[1]];
  };
  const onCrosshair = (p: P, t: Hover) => !!cross && t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && t.cycle === undefined
    && Math.hypot(p[0] - cross[0], p[1] - cross[1]) * L * views.get().zoom < 8;
  // The crosshair's place when it is shown, as ChemDraw's: the middle of the window (or a point given), on the
  // nearest heavier grid line from the page's corner. d: the style of a drawing about to open, whose page and grid
  // it takes.
  const crosshairHome = (at?: P, d?: DocStyle): [number, number] => {
    const k = d ? ((72 / 25.4) * (4 / 3) * frameStyle(d, L).k) / L : mm, [, w, h] = d ? pageOutlines(d, purposeOf(settings, d.purpose)?.kind)[0] : pages[0];
    const o: P = [-(w / 2) * k, (h / 2) * k], g = d ? gridOf(d.grid, k, o) : grid, step = g.minor * g.every, c = at ?? toDoc(frameWidth() / 2, frameMidY());
    return [0, 1].map((i) => o[i] + Math.round((c[i] - o[i]) / step) * step) as [number, number];
  };
  // New drawings, and drawings saved without them, show what the user last chose in the View menu.
  const freshGuides = (at?: P, d?: DocStyle): Guides => ({
    ...(settings.guides.grid ? { grid: true } : {}), ...(settings.guides.rulers ? { rulers: true } : {}), ...(settings.guides.crosshair ? { crosshair: crosshairHome(at, d) } : {}),
  });
  // The guides as last set, so View commands that arrive before the page draws again each see the one before.
  const guidesNow = useRef(guides);
  guidesNow.current = guides;
  const showGuide = (k: "grid" | "rulers" | "crosshair") => {
    const was = guidesNow.current, on = !was[k], next: Guides = { ...was };
    if (!on) delete next[k];
    else if (k === "crosshair") next.crosshair = crosshairHome();
    else next[k] = true;
    guidesNow.current = next;
    setGuides(next);
    setSettings((s) => ({ ...s, guides: { ...s.guides, [k]: on } }));
  };
  // The Settings window, open at a module.
  const [settingsOpen, setSettingsOpen] = useState<ModuleId>();
  const [addingColour, setAddingColour] = useState(false); // Settings opened from a colour row's +, to add a colour
  // Object > Rotate… (⌘R) and Scale… (⌘K): the dialog open, and what is typed in it.
  const [about, setAbout] = useState(false);
  // What's new in this version (releases.ts): once after an update, in Home's window, for someone who has used Octet
  // before (someone new starts at the name box, which marks the notes seen), and from About.
  const [notes, setNotes] = useState(false), ownNotes = notesFor(version);
  useEffect(() => {
    if (!HOME_WINDOW || !ownNotes || settings.userName === null || settings.seenNotes === version) return;
    setNotes(true);
    setSettings((s) => ({ ...s, seenNotes: version }));
  }, [settings.userName, settings.seenNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  // The right-click menu (ActionsMenu): where it opens, and whether a key opened it. noMenu: a Control-press on the Mac
  // that went to a resize handle (Control there turns Labels and lines over), whose right-click opens no menu.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number; keyboard?: boolean }>();
  // The Side arrow tool's question at the pointer: what to add to step `step` of a cycle, g along it (askSide).
  const [sideAsk, setSideAsk] = useState<{ x: number; y: number; cycle: number; step: number; g: number; choices: ("in" | "out" | "both")[] }>();
  const noMenu = useRef(false);
  // The Select tool's modifiers at the last press, and the selection before it, for a click with Shift or Option.
  const pressMods = useRef<{ shift: boolean; alt: boolean; atoms: Set<number>; picks: Set<number> } | undefined>(undefined);
  // Option held at the last press, with any tool (Option-click opens or repeats a label).
  const pressAlt = useRef(false);
  const pressCtrlCopy = useRef(false); // Ctrl at the press made this a copy-drag (Windows and Linux): see skipsCycle
  const [exportView, setExportView] = useState<{ all?: string; selection?: string; parts: { all: Mol; selection?: Mol } }>();
  const [dialog, setDialog] = useState<{ kind: "rotate"; angle: string; clockwise: boolean } | { kind: "scale"; how: "document" | "length" | "percent"; value: string }
    | { kind: "atom"; atom: number; element: string; charge: string; isotope: string; radical: string; stereo: string; group: string; targets: number[]; q: AtomQuery; q0: AtomQuery; reset?: true }
    | { kind: "contract"; text: string; keep: number; group: number[]; want?: string; warn?: string }
    | { kind: "bond"; bonds: number[]; type: string; position: "auto" | "left" | "centre" | "right"; topology: string; rxn: string; start: { type: string; position: string; topology: string; rxn: string } }
    | { kind: "bracket"; shape: number; usage: string; label: string; count: string; order: string; mw: string; pattern: string; flip: string; flippable: boolean }
    | { kind: "rlogic"; rows: { id: number; name: string; occur: string; restH: boolean; then: string }[] }
    | { kind: "font"; font: string } | { kind: "size"; size: string } | { kind: "spacing"; mode: "auto" | "variable" | "fixed"; pt: string }
    | { kind: "unsaved"; next: () => void; stay?: () => void } | { kind: "rf"; plate: number; index: number; value: string } | { kind: "details"; values: Details } | { kind: "chain"; from: number | P; atoms: string }
    | { kind: "template"; name: string; from: string } | { kind: "templateSet"; name: string; then: (set: string) => void } | { kind: "lossy"; lost: Record<string, number>; done: (saved: boolean) => void } | { kind: "revert" }
    | { kind: "changed"; done: (saved: boolean) => void }
    | { kind: "discard"; entries: RecoveredEntry[]; recents: RecentEntry[] } | { kind: "crashed"; log: string } | { kind: "update"; version: string }
    | { kind: "dictionary"; name: string; smiles: string; inchi?: string }>();
  // Check Structure's dialog: the problems, the one shown, and what runs after them (a copy or export that asked).
  // select: Check Structure itself, which selects each problem's objects as it shows it.
  const [checking, setChecking] = useState<{ list: Problem[]; at: number; then: () => void; select: boolean }>();
  // Explain This Warning's dialog: the selection's warnings.
  const [explaining, setExplaining] = useState<Problem[]>();
  const [commandsOpen, setCommandsOpen] = useState(false);
  // Text > Character Map (CharMap.tsx): open until it is closed, as ChemDraw's window is. charKey: when its key
  // (⇧⌘Space) was last pressed, so the map takes the focus from the text only when opened with the key; from the menu
  // with the mouse, the caret stays in the text.
  const [charMap, setCharMap] = useState(false);
  const charKey = useRef(-Infinity), charFocus = useRef(true);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if ((e.code === "Space" || e.key === " ") && e.shiftKey && (e.metaKey || e.ctrlKey)) charKey.current = performance.now(); };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  }, []);
  // Choose Nickname: the list open by an atom (its place on screen). A click outside it or Escape closes it.
  const [nicknames, setNicknames] = useState<{ atom: number; x: number; y: number }>();
  const nicknameBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!nicknames) return;
    const away = (e: PointerEvent) => { if (!nicknameBox.current?.contains(e.target as Node)) setNicknames(undefined); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNicknames(undefined); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [nicknames]);
  // An arrow Octet offers after a row of starting materials (from Clean up). Tab draws it; any other change drops it.
  const [offer, setOffer] = useState<{ from: P; to: P; doc: Mol }>();
  useEffect(() => { if (offer && offer.doc !== doc) setOffer(undefined); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSideAsk(undefined), [doc]); // the Side arrow menu's cycle and step are the drawing's as it was asked
  const docOpen = settingsOpen === "document";
  // The Document window's preview: paracetamol with its compound number, drawn in the style at 125% of true size
  // (smaller if it would not fit), so a change of preset shows as a change of size. It is drawn on the page's own
  // background, with the canvas's ink: white paper and black ink unless the Background is dark, in both themes.
  const sample = useMemo(() => (loaded && docOpen ? parseStructure("CC(=O)Nc1ccc(O)cc1") : undefined), [loaded, docOpen]);
  // A template being made (Custom template on Home) shows in its own style.
  const previewStyle = madeTemplate?.style ?? style;
  const preview = useMemo(() => {
    if (!sample) return null;
    const s = previewStyle, f = frameStyle(s, L), k = (4 / 3) * f.k, { own, paper, dark } = paperOf(s, systemDark);
    const ink = (c: string) => (dark && /^#(000000|0f172a)$/i.test(c) ? "#FFFFFF" : c);
    const m: Mol = { ...sample, captions: [{ id: 1, text: "1", x: 0, y: 0, bold: true, under: sample.atoms.map((_, i) => i) }] };
    const d = render(m, f, s === style ? measure : measurer(fontStack(s.labelFont), f.size), L);
    const width = (t: string, c: Caption) => textWidth(t, (c.size ?? s.captionSize) * k, c.bold, c.italic, fontStack(s.captionFont));
    const [cap] = placeCaptions(m, d, width, [], k, s.captionSize);
    const box = [Math.min(d.box[0], cap.box[0]), Math.min(d.box[1], cap.box[1]), Math.max(d.box[2], cap.box[2]), Math.max(d.box[3], cap.box[3]) + f.size * 0.3];
    const scale = Math.min(OPEN_ZOOM / f.k, 112 / (box[3] - box[1]), 420 / (box[2] - box[0]));
    // Drawn on the page's own paper, with the canvas's ink rule: white ink on dark and blue paper.
    return (
      <div className={`style-preview paper-${paper}`} data-theme={dark ? "dark" : "light"} style={own ? ({ "--canvas": own } as React.CSSProperties) : undefined} aria-hidden>
        <svg width={(box[2] - box[0]) * scale} height={(box[3] - box[1]) * scale} viewBox={`${box[0]} ${box[1]} ${box[2] - box[0]} ${box[3] - box[1]}`}>
          <path d={toPath(d.polygons)} fill={ink("#000000")} />
          {d.labels.map((l, i) => <text key={i} x={l.x} y={l.y} transform={labelTurn(l)} fill={ink("#000000")} textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l, s.labelFont) }}>{l.text}</text>)}
          <text x={cap.lines[0].x} y={cap.lines[0].y} textAnchor="middle" fill={ink(s.colour)} style={{ font: `bold ${cap.size}px ${fontStack(s.captionFont)}` }}>1</text>
        </svg>
      </div>
    );
  }, [sample, measure, style, previewStyle, systemDark]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every view change Octet makes (Fit to window, Actual size, the zoom keys, a click on a page's edge, a panel that
  // would cover the structure) moves the camera the same way: the view is set once, and the drawing glides there from
  // where it is as a CSS transform on its group (motion token), so nothing draws again on the way. A new move starts
  // from where the last one has got to; a scroll, pinch or press ends it. Instant with reduced motion.
  const camera = useRef<SVGGElement>(null);
  // A middle-button drag of the view: where the pointer was last (onPointerDown).
  const panFrom = useRef<[number, number]>(undefined), [panning, setPanning] = useState(false);
  // When a key was last pressed. A view command from a key moves the view at once; from the pointer it glides.
  const keyAt = useRef(-Infinity);
  useEffect(() => {
    const down = () => { keyAt.current = performance.now(); };
    addEventListener("keydown", down, true);
    return () => removeEventListener("keydown", down, true);
  }, []);
  const stopCamera = () => { for (const el of [camera.current, svg.current]) el?.getAnimations().forEach((a) => a.cancel()); };
  function moveView(to: View) {
    const g = camera.current, now = g && getComputedStyle(g).transform;
    const m = now && now !== "none" ? new DOMMatrix(now) : undefined, from: View = m ? { x: m.e, y: m.f, zoom: m.a } : views.get();
    stopCamera();
    setView(to);
    if (!g || reduced() || (from.x === to.x && from.y === to.y && from.zoom === to.zoom)) return;
    const at = (v: View) => ({ transform: `translate(${v.x}px, ${v.y}px) scale(${v.zoom})` });
    g.animate([at(from), at(to)], timing());
  }
  // A click on a page's edge (edgePage) fits that page in the window, centred.
  const fitZoom = ([, w, h]: [string, number, number]) => Math.min((frameWidth() - 160) / (w * mm * L), (frameSpan() - 48) / (h * mm * L));
  const fitPage = (page: [string, number, number]) => moveView({ x: frameWidth() / 2, y: frameMidY(), zoom: fitZoom(page) });
  // The zoom limits: a bond drawn 0.25 to 8 times its size, widened so that every page outline can be fitted. At
  // any document scale the page never stops a zoom, and no zoom jumps (decision 0007).
  zoomLimits.current = [Math.min(0.25, ...pages.map(fitZoom)), Math.max(8, ...pages.map(fitZoom))];
  // The structure for the name being typed, drawn faintly where it will land.
  // A suggestion when the text is not a name: from the common names straight away, or (after a pause in typing)
  // from every name one keystroke away.
  const quick = useMemo(() => (naming === undefined || !namesLoaded ? undefined : suggestName(naming, false)), [naming, namesLoaded]);
  const [thorough, setThorough] = useState<{ typed: string; name?: string }>();
  useEffect(() => {
    if (naming === undefined || quick || !namesLoaded) return;
    const t = setTimeout(() => setThorough({ typed: naming, name: suggestName(naming) }), 150);
    return () => clearTimeout(t);
  }, [naming, quick, namesLoaded]);
  const suggestion = quick ?? (thorough && thorough.typed === naming ? thorough.name : undefined);
  // In place of a suggestion: why a CAS number is refused, or the wait for PubChem.
  const seqParts = naming === undefined ? undefined : sequenceParts(naming);
  const nameNote = naming === undefined ? undefined : asking === naming.trim() ? "Searching PubChem" : casProblem(naming) ?? peptideProblem(naming) ?? nucleicProblem(naming);
  // The text read as a name, once a keystroke (a sequence is never read here: OPSIN takes up to 0.3 s over a peptide).
  const typedSmiles = useMemo(() => (naming === undefined || !loaded || isSequence(naming.trim()) ? undefined : nameToSmiles(naming)), [naming, namesLoaded, loaded]);
  // A sequence or a large structure: laid out away from the page once typing pauses (namepreview.ts), with the last
  // one shown meanwhile. Anything else is drawn at once, tidied, as Return draws it.
  const later = useMemo(() => (naming === undefined || !loaded ? undefined : laterSmiles(naming, typedSmiles)), [naming, typedSmiles, loaded]);
  const [quickPreview, setQuickPreview] = useState<{ smiles: string; mol?: Mol }>();
  useEffect(() => {
    if (naming === undefined) setQuickPreview(undefined);
    if (!later || quickPreview?.smiles === later) return;
    let gone = false;
    const t = setTimeout(() => void quickLayout(later).then((mol) => { if (!gone) setQuickPreview({ smiles: later, mol }); }), PREVIEW_PAUSE);
    return () => { gone = true; clearTimeout(t); };
  }, [later, naming === undefined]); // eslint-disable-line react-hooks/exhaustive-deps
  const named = useMemo(
    () => (naming === undefined || later ? undefined : structureFromText(naming, undefined, typedSmiles ?? null) ?? (suggestion ? structureFor(suggestion) : undefined)),
    [naming, suggestion, namesLoaded, loaded, later, typedSmiles],
  );
  const shownFull = later ? quickPreview?.mol : named, shownNamed = useMemo(() => (shownFull && naming !== undefined ? asResidues(naming.trim(), shownFull) : shownFull), [shownFull, settings.sequenceLabels]); // eslint-disable-line react-hooks/exhaustive-deps
  // Captions as laid out, with the caption being typed in place of its saved text (or added, if it is new).
  // Arrows grow to fit their conditions, including conditions being typed. The arrow lists stay the same lists while
  // their arrows do not change (most typing), so nothing drawn from them is made again.
  const laid = useRef<{ arrows: Arrow[]; cycles: ReturnType<typeof layoutCycles>["arrows"] }>({ arrows: [], cycles: [] });
  // A caption line's width: each run in its own font, size and style (rich text), or the caption's own.
  const captionWidth = (t: string, c: Caption, j = 0) => {
    const px = (c.size ?? style.captionSize) * pt;
    if (c.runs) return (richLines(c.runs)[j] ?? []).reduce((w, r) => w + textWidth(r.text, (r.size ? r.size * pt : px) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)), 0);
    return (formulaCaption(c) ? formulaWidth : textWidth)(t, px, c.bold, c.italic, fontStack(c.font ?? style.captionFont));
  };
  // A piece of text in a run's style: its width, for captions with a width (their lines wrap to it), and its reach
  // above and below the baseline, for Variable line spacing.
  const runFace = (c: Caption, r: RunStyle) => [(r.size ? r.size * pt : (c.size ?? style.captionSize) * pt) * (r.script ? 0.75 : 1), r.bold ?? c.bold, r.italic ?? c.italic, fontStack(r.font ?? c.font ?? style.captionFont)] as const;
  const runWidth = (t: string, c: Caption, r: RunStyle) => textWidth(t, ...runFace(c, r)), runExtent = (t: string, c: Caption, r: RunStyle) => textExtent(t, ...runFace(c, r));
  const { placed, arrows, cycleArrows, cycleLayout } = useMemo(() => {
    let m = shown;
    const runs = writing?.runs && styled(writing.runs) && plainOf(writing.runs) ? writing.runs : undefined;
    if (writing?.id !== undefined) m = updateCaption(m, writing.id, { text: writing.value || " ", ...writing.style, runs });
    else if (writing) m = labelEnd({ ...m, captions: [...(m.captions ?? []), { id: DRAFT, text: writing.value || " ", x: writing.at?.[0] ?? 0, y: writing.at?.[1] ?? 0, under: writing.under, on: writing.on, cycle: writing.cycle, ...writing.style, runs }] }, DRAFT);
    const width = captionWidth, measure = runWidth, extent = runExtent;
    const fitted = fitArrows(m, L, (c) => Math.max(...c.text.split("\n").map((t, j) => width(t, c, j))), pt);
    // Catalytic cycles: their arcs, side arrows and labels follow wherever their intermediates are, text ones included.
    const nodeText = (m.captions ?? []).filter((c) => c.cycle?.side === "node");
    const texts = nodeText.length ? placeCaptions({ ...m, captions: nodeText }, drawing, width, fitted, pt, style.captionSize, new Map(), measure, extent) : [];
    const frame = (id: number, anchor: Placed["anchor"], wrap?: number) => { const c = m.captions?.find((x) => x.id === id); return c && placeCaptions({ ...m, captions: [c] }, drawing, width, fitted, pt, style.captionSize, new Map([[id, { x: 0, y: 0, anchor, wrap }]]), measure, extent)[0]?.box; };
    const cycles = layoutCycles(m, L, pt, (atoms) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])), (id) => texts.find((x) => x.id === id)?.box, frame);
    const same = (a: readonly Arrow[], b: readonly Arrow[]) => a.length === b.length && a.every((x, i) => x === b[i] || JSON.stringify(x) === JSON.stringify(b[i]));
    if (!same(fitted, laid.current.arrows)) laid.current.arrows = fitted;
    if (!same(cycles.arrows, laid.current.cycles)) laid.current.cycles = cycles.arrows;
    return { placed: placeCaptions(m, drawing, width, fitted, pt, style.captionSize, cycles.anchors, measure, extent), arrows: laid.current.arrows, cycleArrows: laid.current.cycles, cycleLayout: cycles as CycleLayout };
  }, [shown, drawing, writing, style, pt]); // eslint-disable-line react-hooks/exhaustive-deps
  // A caption as a lone atom labelled with its text, in the caption's size, font, style and colour. The label's first
  // glyph goes where the caption's was, as an atom label sits on its atom.
  const placedAtom = (c: Caption, p: Placed) => {
    const w = whole(c), size = w.size ?? style.captionSize, first = measurer(fontStack(w.font ?? style.captionFont), frame.size, !!w.bold, !!w.italic)(c.text.trim()[0]), k = (size * pt) / frame.size;
    return captionAtom(c, [(p.box[0] + (first.width * k) / 2) / L, -(p.lines[0].y - (first.ascent * k) / 2) / L, 0], style);
  };
  // Make element and Interpret Chemically on captions: each caption becomes its atom, in one undo step (merge: the step
  // it joins). select: the new atoms are selected.
  function makeElements(caps: Caption[], merge?: string, select = true) {
    const made = caps.flatMap((c) => { const p = placed.find((x) => x.id === c.id); return p ? [{ id: c.id, atom: placedAtom(c, p) }] : []; });
    if (!made.length) return undefined;
    const m = set(captionsToAtoms(doc, made), false, merge);
    if (select) setSelection(new Set(made.map((_, k) => doc.atoms.length + k)));
    return m;
  }
  // The structure for the name being typed, where place puts it: in the Reaction scheme box on an experiment page,
  // else where the pointer was, else after the arrows and text (which landing reads).
  const ghost = useMemo(() => shownNamed && shownNamed.atoms.length ? render(moveAtoms(shownNamed, new Set(shownNamed.atoms.map((_, i) => i)), schemeAt(shownNamed, doc, namingAt.current) ?? landing(shownNamed, namingAt.current)), frame, measure, L) : undefined,
    [shownNamed, doc, frame, measure, placed, arrows, expPage]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reaction conditions and a cycle's reagents print formulas with subscripts (K2CO3 as K₂CO₃).
  const reagents = useMemo(() => new Set((shown.captions ?? []).filter(formulaCaption).map((c) => c.id)), [shown]);
  // Each object's ink is drawn in its layer, or on its own under or over all the layers when it has a draw order
  // (Bring to Front, Send to Back; order.ts). level: a thing that is drawn in its layer.
  const level = (x?: { order?: number }) => !x?.order;
  // Arrow ink, one path per colour (unset is the document's ink), each arrow's part kept with the arrow.
  // Filled pen curves draw their own outline with their fill, in order (below), so clip art's layers stack as drawn.
  const arrowInk = useMemo(() => {
    const groups = new Map<string | undefined, string>();
    for (const a of [...arrows.filter((x) => level(x) && !(x.curve?.closed && x.fill)), ...cycleArrows.filter(level)]) {
      const key = a.colour?.toLowerCase();
      groups.set(key, (groups.get(key) ?? "") + kept(arrowInks, a, lined(a.width), () => toPath(arrowShapes(a, lined(a.width), L))));
    }
    return [...groups];
  }, [arrows, cycleArrows, frame]);
  // Structure ink: each structure's own paths, so a drag changes only the paths of what moved.
  const structureInk = useMemo(() => drawing.parts.filter(({ ids }) => level(shown.atoms[ids[0]])).flatMap(({ ids, drawing: d, at, k, turn }) => structurePaths(d).map(([key, path]) => [`${ids[0]}|${key}`, key, path, moveBy(at, k, turn), ids[0]] as const)), [drawing]); // eslint-disable-line react-hooks/exhaustive-deps
  // The structure that settles into ink (FEEL-43): its atoms from this one on.
  const settling = settle?.doc === doc ? settle.from : Infinity;
  // Atom labels as text, one group per structure, made once for each drawing of it: React passes over the ones that
  // did not change, and a structure being moved only moves its group. A structure being turned turns its group, and
  // each label turns back about its atom, so it keeps level.
  const labelCache = useRef<{ look: string; parts: WeakMap<Drawing, React.ReactElement[]> }>(undefined);
  const labelTexts = useMemo(() => {
    const look = `${darkPaper}|${style.labelFont}`;
    if (labelCache.current?.look !== look) labelCache.current = { look, parts: new WeakMap() };
    const cache = labelCache.current.parts;
    return drawing.parts.map(({ ids, drawing: d, at, k, turn }) => {
      let texts = cache.get(d);
      if (!texts) {
        texts = d.labels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} transform={labelTurn(l)} fill={l.colour ? textInk(l.colour) : "var(--ink)"} fillOpacity={l.alpha} textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l) }}>
            {l.text}
          </text>
        ));
        cache.set(d, texts);
      }
      if (turn) texts = texts.map((t, i) => <g key={i} transform={`rotate(${-turn} ${d.labelAt[i][0]} ${d.labelAt[i][1]})`}>{t}</g>);
      return texts.length ? <g key={ids[0]} className={ids[0] >= settling ? "settle" : undefined} transform={moveBy(at, k, turn)}>{texts}</g> : null;
    });
  }, [drawing, darkPaper, style.labelFont, settling]); // eslint-disable-line react-hooks/exhaustive-deps
  // Where each stereo flag goes, worked out once per change of the atoms or bonds.
  const markDirs = useMemo(() => markDirections(shown, shown.atoms.flatMap((a, i) => (a.enhanced ? [i] : []))), [shown.atoms, shown.bonds]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Mass spec panel's structure (see openMassSpec), and the atoms lit from it.
  const [massSpec, setMassSpec] = useState<number[]>(), [msPoint, setMsPoint] = useState<number[]>();
  // Tab on an atom or bond with Mass spec analysis: the atom or bond, its atoms, and how many times Tab was pressed on it.
  const [msTab, setMsTab] = useState<{ atom?: number; bond?: number; atoms: number[]; n: number }>();
  // A cut with the Mass fragmentation tool (ChemDraw's): one caption for each side, its pieces' formula (counts as
  // subscripts) and exact mass added up, beside the cut's end on that side (the left side's at its start). The
  // captions move, change and delete as any caption does. The cut line goes when the pointer is released; with Option
  // held it stays, as a dashed line or arc, curved as the pointer went. The mass has the Properties panel's decimals.
  function massCut(d: { from: P; to?: P; trail?: P[]; alt?: boolean }, keepLine: boolean): { mol: Mol; items: number[] } {
    if (!d.to) return { mol: doc, items: [] };
    const bend = d.alt ? bendOf([...(d.trail ?? [d.from]), d.to]) : 0;
    const line: Omit<Arrow, "id"> = { kind: bend ? "arc" : "line", from: d.from, to: d.to, ...(bend ? { bend } : {}), style: "dashed" };
    const path = arrowPath({ ...line, id: 0 }, 1).map(([x, y]): P => [x, -y]);
    let m = doc;
    const items: number[] = [];
    if (keepLine) { const [next, id] = addArrow(m, line); m = next; items.push(id); }
    for (const s of (loaded && cutSides(doc, path, fragmentMasses)) || []) {
      // The end of the path on this side, its direction there, and the normal out to this side.
      const [end, before] = s.side > 0 ? [path[0], path[1]] : [path[path.length - 1], path[path.length - 2]];
      const u: P = s.side > 0 ? [before[0] - end[0], before[1] - end[1]] : [end[0] - before[0], end[1] - before[1]], len = Math.hypot(...u) || 1;
      const n: P = [(-u[1] / len) * s.side, (u[0] / len) * s.side], f = Math.max(...s.atoms.map((i) => scaleOf(doc.atoms[i] ?? {})), 1);
      const runs: TextRun[] = [];
      for (const [, letters, digits] of s.formula.matchAll(/(\D*)(\d*)/g)) { if (letters) runs.push({ text: letters }); if (digits) runs.push({ text: digits, script: "sub" }); }
      runs.push({ text: ` ${s.exact.toFixed(settings.decimals ?? 4)}` });
      const clean = normalise(runs), [next, id] = addCaption(m, { text: plainOf(clean), x: end[0] + n[0] * 0.25 * f, y: end[1] + n[1] * 0.25 * f, align: n[0] >= 0 ? "left" : "right", runs: clean });
      m = next;
      items.push(id);
    }
    return { mol: m, items };
  }
  // The cycle arc (or side arrow) under a point.
  // A thicker line (an object's scale) is as easy to hit as it is wide.
  const cycleAt = (p: P) => cycleArrows.find((a) => nearTrace([p[0] * L, -p[1] * L], arrowTrace(a, L), 5 / views.get().zoom + frame.line * 2 * scaleOf(a)));
  // Which step of which cycle was last pressed, right-clicked or had a handle under the pointer: actions go on that step.
  const [cycleStep, setCycleStep] = useState<{ cycle: number; step: number }>();
  // A cycle's step picked on its own (a second click on a picked cycle's arc, with Select), and the step a press on a
  // picked cycle's arc would pick if it is a click.
  const [stepPick, setStepPick] = useState<{ cycle: number; step: number }>();
  const stepAgain = useRef<number>(undefined);
  // A cycle's side arrow picked on its own (a click on it).
  const [branchPick, setBranchPick] = useState<{ cycle: number; branch: number }>();
  // Only a step or a side arrow of a cycle is picked: Delete and Cut take that alone, and Copy has nothing to copy.
  const partPick = !selection.size && picked.size === 1 && !!((branchPick && picked.has(branchPick.cycle)) || (stepPick && picked.has(stepPick.cycle)));
  // The step an action on a cycle acts on: the picked one, else the one last pressed or right-clicked, else its longest
  // drawn step with no side arrow.
  const stepHere = (c: Cycle) => {
    const n = Math.max(c.nodes.length, 1), own = stepPick?.cycle === c.id ? stepPick : cycleStep?.cycle === c.id ? cycleStep : undefined;
    if (own) return Math.min(own.step, n - 1);
    const free = cycleLayout.spans.filter((s) => s.cycle === c.id && !c.branches?.some((b) => b.step === s.step));
    return free.reduce<(typeof free)[number] | undefined>((x, s) => (!x || s.to - s.from > x.to - x.from ? s : x), undefined)?.step ?? 0;
  };
  // A cycle with all it is made of: its intermediates and its side arrows' structures (atoms), and all its text.
  const cycleParts = (c: Cycle): [number[], number[]] => [cycleAtoms(c), (doc.captions ?? []).filter((t) => t.cycle?.cycle === c.id).map((t) => t.id)];
  // The one cycle picked on its own: with its text, no atoms and nothing else.
  const loneCycle = () => { const cs = selection.size ? [] : (doc.cycles ?? []).filter((c) => picked.has(c.id)); return cs.length === 1 && [...picked].every((x) => x === cs[0].id || doc.captions?.some((t) => t.id === x && t.cycle?.cycle === cs[0].id)) ? cs[0].id : undefined; };
  useEffect(() => {
    if (stepPick && !(picked.size === 1 && picked.has(stepPick.cycle))) setStepPick(undefined);
    if (branchPick && !(picked.size === 1 && picked.has(branchPick.cycle) && doc.cycles?.find((c) => c.id === branchPick.cycle)?.branches?.some((b) => b.id === branchPick.branch))) setBranchPick(undefined);
  }, [picked, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // The arrow under a point (drawing coordinates), within a few px of its line.
  // A block arrow is hit anywhere inside its outline too.
  const arrowAt = (p: P) => [...arrows].reverse().find((a) => !isOrbital(a) && (nearTrace([p[0] * L, -p[1] * L], arrowTrace(a, L), 5 / views.get().zoom + frame.line * 2 * scaleOf(a))
    || (a.kind === "block" && inPolygon([p[0] * L, -p[1] * L], kept(blockOutlines, a, frame, () => blockOutline(a, frame, L))))))?.id;
  // The arrow with an end at a point, within a mark's reach (markNear).
  const arrowEndAt = (p: P) => [...arrows].reverse().find((a) => !isOrbital(a) && [a.from, a.to].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.2))?.id;
  // The orbital whose lobes a point is in.
  const orbitalAt = (p: P) => [...arrows].reverse().find((a) => isOrbital(a) && lobesOf(a, L).some((l) => inPolygon([p[0] * L, -p[1] * L], l.path)))?.id;
  // The shape whose line is under a point; with the Select tool, also a highlight the point is inside.
  const shapeAt = (p: P) => {
    const q: P = [p[0] * L, -p[1] * L], near = (sh: Shape) => 5 / views.get().zoom + frame.line * 2 * scaleOf(sh);
    return [...(shown.shapes ?? [])].reverse().find((sh) => (sh.kind === "table" ? tableAt(p)?.id === sh.id : nearTrace(q, shapeTrace(sh, L, frame.bond), near(sh))))?.id;
  };
  // A highlight, picture or filled shape a point is inside, as drawn: a press anywhere on it picks it (Sam, 28 October
  // 2026: a shaded circle drags from its middle, as from its line).
  const highlightAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => (sh.kind === "highlight" || sh.kind === "picture" || !!sh.fill) && inDrawn(sh, p))?.id;
  // The TLC plate a point is on, and a click on it: a spot in that lane at that height, or off again if one is there.
  const plateAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => sh.kind === "tlc"
    && p[0] >= Math.min(sh.from[0], sh.to[0]) && p[0] <= Math.max(sh.from[0], sh.to[0]) && p[1] >= Math.min(sh.from[1], sh.to[1]) && p[1] <= Math.max(sh.from[1], sh.to[1]));
  // TLC plates, as ChemDraw's TLC tool: the spot or line under a point, and a press on the plate. A press on a spot
  // drags it (Option: a copy of it; Shift: its size); on the origin or front, moves that line; anywhere else on the
  // plate, adds a spot there. A spot pressed and not moved is picked, for its colour, style and size.
  const [spotPick, setSpotPick] = useState<{ plate: number; index: number }>();
  // The lane a plate's lane actions act on (Add, Duplicate and Delete Lane): the last one pressed or right-clicked, as
  // ChemDraw's act on the lane under the pointer.
  const [lanePick, setLanePick] = useState<{ plate: number; lane: number }>();
  const laneOf = (sh: Shape, p: P) => { const t = tlcLayout(sh); return Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width))); };
  // A lane's origin tick under a point, within 5 px.
  const tickAt = (sh: Shape, p: P) => {
    const t = tlcLayout(sh), near = 5 / (views.get().zoom * L);
    if (sh.tlc?.hide?.includes("origin") || Math.abs(p[1] - t.origin) > near) return undefined;
    const k = laneOf(sh, p);
    return Math.abs(p[0] - t.lane(k)) < near ? k : undefined;
  };
  // The spot whose Rf value (shown) is under a point.
  const rfAt = (sh: Shape, p: P) => {
    const t = tlcLayout(sh);
    return (sh.tlc?.spots ?? []).findIndex((x) => (sh.tlc?.rf || x.showRf) && p[0] >= t.lane(x.lane) + t.size(x).rx && p[0] <= t.lane(x.lane) + t.size(x).rx + 0.8 * t.f && Math.abs(p[1] - t.at(x.rf) + 0.05 * t.f) < 0.2 * t.f);
  };
  // A spot is hit within 4 px of its edge (its tail included), the nearest one first.
  const spotHit = (sh: Shape, p: P) => {
    const t = tlcLayout(sh), slack = 4 / (views.get().zoom * L);
    const fit = (sh.tlc?.spots ?? []).map((x, i) => {
      const { rx, ry } = t.size(x), dx = (p[0] - t.lane(x.lane)) / (rx + slack), dy = p[1] - t.at(x.rf), below = dy < 0 ? Math.max(0, -dy - (x.tail ?? 0) * t.f) : dy;
      return { i, d: Math.hypot(dx, below / (ry + slack)) };
    }).filter((f) => f.d <= 1).sort((p1, q) => p1.d - q.d);
    return fit[0]?.i ?? -1;
  };
  const lineHit = (sh: Shape, p: P): "origin" | "front" | undefined => {
    const t = tlcLayout(sh), near = 5 / (views.get().zoom * L);
    return Math.abs(p[1] - t.origin) < near ? "origin" : Math.abs(p[1] - t.front) < near ? "front" : undefined;
  };
  const spotAt = (sh: Shape, p: P, screen: [number, number], copy: boolean, size: boolean) => {
    setSelection(new Set());
    setPicked(new Set([sh.id]));
    setLanePick({ plate: sh.id, lane: laneOf(sh, p) });
    const t = tlcLayout(sh), spots = sh.tlc?.spots ?? [], hit = spotHit(sh, p);
    if (hit >= 0) {
      const base = copy ? updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: [...spots, { ...spots[hit] }] } }) : doc;
      return setDrag({ kind: "spot", plate: sh.id, index: copy ? spots.length : hit, base, from: p, size, moved: false, working: base });
    }
    const line = lineHit(sh, p);
    if (line) return setDrag({ kind: "tlcline", plate: sh.id, which: line, base: doc, working: doc });
    const lane = Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width)));
    const rf = Math.round(Math.min(1, Math.max(0, (p[1] - t.origin) / (t.front - t.origin))) * 100) / 100;
    set(updateShape(doc, sh.id, { tlc: { ...sh.tlc!, spots: [...spots, { lane, rf }] } }), true);
    setSpotPick({ plate: sh.id, index: spots.length });
    void screen;
  };
  useEffect(() => {
    if (spotPick && (!picked.has(spotPick.plate) || picked.size !== 1)) setSpotPick(undefined);
    if (lanePick && !picked.has(lanePick.plate)) setLanePick(undefined);
  }, [picked]); // eslint-disable-line react-hooks/exhaustive-deps
  // A spot's changes, on the plate it is on.
  // whole: the change is the whole new spot (so what it leaves out goes).
  const editSpot = (m: Mol, plate: number, index: number, change: (x: Spot) => Partial<Spot>, whole = false): Mol => {
    const sh = m.shapes?.find((x) => x.id === plate);
    if (!sh?.tlc) return m;
    return updateShape(m, plate, { tlc: { ...sh.tlc, spots: sh.tlc.spots.map((x, i) => (i === index ? (whole ? change(x) as Spot : { ...x, ...change(x) }) : x)) } });
  };
  // Tables: a cell's text width (drawing units), the table a point is on, and opening a cell to type in.
  const cellWidth = (sh: Shape) => (text: string) => formulaWidth(text, (sh.size ?? style.captionSize) * pt, sh.bold, sh.italic, fontStack(sh.font ?? style.captionFont)) / L;
  const tableAt = (p: P) => [...(shown.shapes ?? [])].reverse().find((sh) => {
    if (sh.kind !== "table") return false;
    const t = tableLayout(sh, cellWidth(sh), style.captionSize);
    return p[0] >= t.x0 && p[0] <= t.x1 && p[1] >= t.y0 && p[1] <= t.y1;
  });
  // The border of a table under a point, within 4 px: a column's (0 is the left edge) or a row's (0 is the top).
  const tableEdge = (p: P) => {
    const near = 4 / (views.get().zoom * L);
    for (const sh of [...(shown.shapes ?? [])].reverse()) {
      if (sh.kind !== "table") continue;
      const t = tableLayout(sh, cellWidth(sh), style.captionSize);
      if (p[0] < t.x0 - near || p[0] > t.x1 + near || p[1] < t.y0 - near || p[1] > t.y1 + near) continue;
      const col = Array.from({ length: t.cols + 1 }, (_, i) => i).find((i) => Math.abs(p[0] - t.col(i)) < near);
      if (col !== undefined) return { sh, axis: "col" as const, index: col };
      const row = Array.from({ length: t.rows + 1 }, (_, i) => i).find((i) => Math.abs(p[1] - t.row(i)) < near);
      if (row !== undefined) return { sh, axis: "row" as const, index: row };
    }
    return undefined;
  };
  const openCell = (sh: Shape, p: P) => {
    const t = tableLayout(sh, cellWidth(sh), style.captionSize);
    const c = Math.max(0, Array.from({ length: t.cols }, (_, i) => i).filter((i) => t.col(i) <= p[0]).pop() ?? 0);
    const r = Math.max(0, Array.from({ length: t.rows }, (_, i) => i).filter((i) => t.row(i) >= p[1]).pop() ?? 0);
    cellOpen.current = true;
    setCell({ id: sh.id, r, c, value: sh.table?.cells[r]?.[c] ?? "" });
    setSelection(new Set());
    setPicked(new Set([sh.id]));
  };
  // Ends the Pen's curve (closed when it came back to its first point) and adds it, if it has two points or more.
  function finishPen(closed = false) {
    const points = (pen ?? []).filter((q, i, all) => i === 0 || Math.hypot(q.at[0] - all[i - 1].at[0], q.at[1] - all[i - 1].at[1]) > 0.05);
    setPen(undefined);
    setPenAt(undefined);
    if (points.length < 2) return;
    const curve = { points, ...(closed && points.length > 2 ? { closed: true } : {}) };
    const [mol, id] = addArrow(doc, { kind: "curve", from: points[0].at, to: points[points.length - 1].at, curve });
    set(mol);
    setPicked(new Set([id]));
  }
  // Putting the Pen down ends its curve.
  useEffect(() => { if (pen && !(tool === "shape" && "pen" in shapePick)) finishPen(); }, [tool, shapeChoice]); // eslint-disable-line react-hooks/exhaustive-deps
  // Saves the cell being typed, then moves to another cell (adding a row past the last one) or closes.
  function commitCell(to?: [number, number]) {
    const w = cell;
    if (!cellOpen.current || !w) return;
    const sh = doc.shapes?.find((x) => x.id === w.id);
    if (!sh?.table) { cellOpen.current = false; return setCell(undefined); }
    let cur = sh, m = doc;
    const value = expandEscapes(w.value, keptText(sh.table.cells[w.r]?.[w.c])); // \delta is δ (escapes.ts)
    if (value !== (sh.table.cells[w.r]?.[w.c] ?? "")) { cur = { ...cur, ...setTableCell(cur, w.r, w.c, value, cellWidth(cur), style.captionSize) }; m = updateShape(m, sh.id, cur); }
    if (to) {
      const [r, c] = to, rows = cur.table!.cells.length;
      if (r >= rows) { cur = { ...cur, ...resizeTable(cur, rows + 1, cur.table!.cells[0].length, cellWidth(cur), style.captionSize) }; m = updateShape(m, sh.id, cur); }
      if (r >= 0) setCell({ id: sh.id, r, c, value: cur.table!.cells[r]?.[c] ?? "" });
    } else { cellOpen.current = false; setCell(undefined); }
    if (m !== doc) set(m, true);
  }
  // The caption under a point (drawing coordinates), with a few px of slack.
  const captionAt = (p: P) => {
    const at: P = [p[0] * L, -p[1] * L], pad = 3 / views.get().zoom;
    // A turned caption: the point turned back about its pivot, against its own box.
    return [...placed].reverse().find((c) => {
      const [x, y] = c.angle && c.pivot ? turnPx(at, c.pivot, -c.angle) : at, b = c.frame ?? c.box;
      return c.id !== DRAFT && x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad;
    })?.id;
  };
  // A reaction around an arrow, from what is drawn now: structures' and captions' boxes in drawing units.
  const inkBox = (atoms: number[]): Box | undefined => { const b = union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])); return b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L]; };
  const captionBox = (id: number): Box | undefined => { const c = placed.find((x) => x.id === id); return c && [c.box[0] / L, -c.box[3] / L, c.box[2] / L, -c.box[1] / L]; };
  const reactionOf = (arrowId: number) => findReaction(doc, arrowId, arrows, inkBox, captionBox);
  // Every reaction in the drawing, each once, with its steps as Octet reads them (interpret.ts).
  const reactions = () => {
    const out: { r: Reaction; steps: RoleStep[] }[] = [], seen = new Set<number>();
    for (const a of arrows) {
      if (seen.has(a.id) || !straightArrow(a)) continue;
      const r = reactionOf(a.id);
      if (!r) continue;
      r.arrows.forEach((id) => seen.add(id));
      out.push({ r, steps: interpret(doc, r, captionBox) });
    }
    return out;
  };
  // Show Reaction Interpretation: each reaction's steps and what each part is, read again when the drawing changes.
  const interpreted = useMemo(() => (settings.interpretation && loaded ? reactions().map(({ r, steps }) => ({ r, steps, roles: rolesOf(steps) })) : []),
    [settings.interpretation, loaded, doc, drawing, placed]); // eslint-disable-line react-hooks/exhaustive-deps
  // The reaction steps in a part of the drawing (the drawing, or the selection's part), for RXN and RD files and
  // reaction SMILES: each step's reactant, product and agent structures, by the part's atoms. A step needs a reactant
  // and a product structure, and all of it in the part.
  const stepsIn = (part: Mol): RxnStep[] => {
    const at = part === doc ? undefined : new Map([...selection].filter((i) => i < doc.atoms.length).sort((p, q) => p - q).map((i, k) => [i, k]));
    const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
    return reactions().flatMap(({ steps }) => steps).map((s) => ({ reactants: structures(s.reactants), products: structures(s.products), agents: structures([...s.above, ...s.below]) }))
      .filter((s) => s.reactants.length && s.products.length && (!at || [...s.reactants, ...s.products, ...s.agents].flat().every((i) => at.has(i))))
      .map((s) => (at ? { reactants: s.reactants.map((g) => g.map((i) => at.get(i)!)), products: s.products.map((g) => g.map((i) => at.get(i)!)), agents: s.agents.map((g) => g.map((i) => at.get(i)!)) } : s));
  };
  // ChemDraw's reaction shortcut: a reaction arrow (the Arrow tool's straight arrow) and a copy of the selected
  // structures (or the structure under the pointer) beyond it, that way, spaced as Clean Up Reaction spaces a reaction.
  // The copy is selected, so the next ⌘ + arrow carries the scheme on. Enter then puts the keyboard hotspot on the copy:
  // on the atom the original's hotspot was on, else (as ChemDraw) the heteroatom furthest from the arrowhead, else the
  // atom furthest from it. False when there is nothing to copy.
  function reactionShortcut(dir: "left" | "right" | "up" | "down"): boolean {
    const hover = hovers.get(), one = hover.atom ?? (hover.bond !== undefined ? doc.bonds[hover.bond]?.atoms[0] : undefined);
    const pick = selection.size ? selection : one !== undefined ? new Set([one]) : new Set<number>();
    const atoms = new Set(fragments(doc).filter((g) => g.some((i) => pick.has(i))).flat());
    const b = union([...atoms].filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]));
    if (!atoms.size || !b) return false;
    const box: Box = [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L], u: P = dir === "right" ? [1, 0] : dir === "left" ? [-1, 0] : dir === "up" ? [0, 1] : [0, -1];
    const mid: P = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], half = u[0] ? (box[2] - box[0]) / 2 : (box[3] - box[1]) / 2, g = reactionGap;
    const tail: P = [mid[0] + u[0] * (half + g), mid[1] + u[1] * (half + g)], head: P = [tail[0] + u[0] * 2 * g, tail[1] + u[1] * 2 * g];
    // The copy is a new compound: its structures only, without the names and numbers under them.
    const part = extractSelection(doc, atoms, new Set()), shift = 2 * half + 4 * g;
    const r = insertMol(doc, { ...part, captions: part.captions?.filter((c) => !c.under) }, [u[0] * shift, u[1] * shift]);
    const kind: ArrowKind = (["reaction", "equilibrium", "resonance", "retro", "nogo"] as ArrowKind[]).includes(settings.variants.arrow as ArrowKind) ? (settings.variants.arrow as ArrowKind) : "reaction";
    const [mol] = addArrow(r.mol, { kind, from: tail, to: head });
    const sorted = [...atoms].sort((p, q) => p - q), copy = [...r.atoms].sort((p, q) => p - q), was = hotOf.current.get(doc)?.atom;
    const far = (pick: (i: number) => boolean) => copy.filter(pick).sort((p, q) => Math.hypot(pos(mol, q)[0] - head[0], pos(mol, q)[1] - head[1]) - Math.hypot(pos(mol, p)[0] - head[0], pos(mol, p)[1] - head[1]))[0];
    const hot = was !== undefined && atoms.has(was) ? copy[sorted.indexOf(was)] : far((i) => !["C", "H"].includes(mol.atoms[i].label)) ?? far(() => true);
    set(mol);
    revealNext.current = true;
    if (hot !== undefined) hotOf.current.set(mol, { atom: hot });
    setSelection(r.atoms);
    setPicked(new Set());
    return true;
  }
  // Clean Up Reaction's spacing and page (reaction.ts): the gap from the document's style, the page's width less a
  // half-inch margin each side, and a new plus sign's box.
  const reactionLayout = (captionBox: (id: number) => Box | undefined): Layout => {
    const size = (style.captionSize * pt) / L, w = textWidth("+", style.captionSize * pt, false, false, fontStack(style.captionFont)) / L;
    return { gap: reactionGap, width: ((pageSize(style)[0] * 72) / 25.4 - 72) / style.bond, captionBox, plusBox: [-w / 2, -DESCENT * size, w / 2, ASCENT * size], captionPt: style.captionSize, bondPt: style.bond };
  };
  const placedBox = (id: number): Box | undefined => { const c = placed.find((x) => x.id === id); return c && [c.box[0] / L, -c.box[3] / L, c.box[2] / L, -c.box[1] / L]; };
  // Whether two drawings have everything in the same place (to within a millionth of a bond length).
  const sameLayout = (p: Mol, q: Mol) => {
    const near = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
    return p.atoms.length === q.atoms.length && p.atoms.every((a, i) => near(a.location, q.atoms[i].location))
      && (p.captions?.length ?? 0) === (q.captions?.length ?? 0) && (p.captions ?? []).every((c, k) => { const d = q.captions![k]; return near([c.x, c.y], [d.x, d.y]) && c.on?.arrow === d.on?.arrow && c.on?.side === d.on?.side; })
      && (p.arrows ?? []).every((a, k) => near(a.from, q.arrows![k].from) && near(a.to, q.arrows![k].to)) && (p.shapes ?? []).every((x, k) => near(x.from, q.shapes![k].from) && near(x.to, q.shapes![k].to));
  };
  // Lays out every reaction `pick` takes (reaction.ts cleanUpReactions), measured as drawn now.
  function cleanReactions(m: Mol, pick: (r: Reaction) => boolean): { mol: Mol; count: number; kept: number } {
    const inkOf = (mol: Mol) => { const d = mol === doc ? drawing : render(mol, frame, measure, L); return (atoms: number[]) => { const b = union(atoms.filter((i) => d.ink[i]).map((i) => d.ink[i])); return b && [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L] as Box; }; };
    return cleanUpReactions(m, arrows, inkOf, reactionLayout(placedBox), pick);
  }
  // The reaction picked, when exactly a whole reaction is: its arrows and its structures.
  const reactionPicked = () => {
    const first = arrows.find((a) => picked.has(a.id) && !curved(a) && !isLine(a));
    if (!first || !selection.size) return undefined;
    const r = reactionOf(first.id);
    return r && r.atoms.length === selection.size && r.atoms.every((i) => selection.has(i)) && r.arrows.every((id) => picked.has(id)) ? r : undefined;
  };
  // The atom whose label (all of it, as in ChemDraw, not only its first letter) is at a point, with a little slack.
  const labelAt = (p: P) => {
    const [x, y] = [p[0] * L, -p[1] * L], pad = 2 / views.get().zoom;
    let found: number | undefined;
    drawing.label.forEach((b, i) => { if (b && i < doc.atoms.length && x >= b[0] - pad && x <= b[2] + pad && y >= b[1] - pad && y <= b[3] + pad) found = i; });
    return found;
  };
  // The atom or bond at a point: an atom's spot, then anywhere on its label, then a bond. A multi-centre point (the
  // middle of a π ligand's ring) is not an atom to point at.
  const hitAt = (p: P): Hover => {
    const t = hitIn(doc, p);
    if (t.atom !== undefined && doc.atoms[t.atom].centre) return { bond: bondAt(doc, p) };
    if (t.atom !== undefined) return t;
    const atom = labelAt(p);
    return atom !== undefined ? { atom } : t;
  };
  // Atoms come first, then captions, then bonds.
  const hit = (p: P): Hover => {
    // With Select, a charge, radical or lone pair beside an atom comes first: a drag moves it round the atom. On a
    // selected atom a press moves the selection (Shift-drag still moves the mark).
    const mark = tool === "select" && selectKind !== "perspective" ? markNear(drawing.electrons, doc, p, L) : undefined;
    // A curved arrow that starts or ends on those electrons (electronAt puts its end there) comes before them.
    const end = mark && arrowEndAt(p);
    if (end !== undefined) return { arrow: end };
    if (mark && !selection.has(mark.atom)) return mark;
    // With Select, a filled shape or highlight brought to the front (order.ts) covers what is under it, so a click
    // there picks it unless what is under is in front of it too.
    const cover = tool === "select" ? (shown.shapes ?? []).filter((sh) => (sh.order ?? 0) > 0 && (sh.kind === "highlight" || sh.fill) && inDrawn(sh, p))
      .sort((a, b) => b.order! - a.order!)[0] : undefined;
    if (cover) {
      const under = hitBelow(p), id = under.caption ?? under.arrow, x = under.atom !== undefined ? doc.atoms[under.atom] : under.bond !== undefined ? doc.atoms[doc.bonds[under.bond].atoms[0]] : id !== undefined ? [...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? [])].find((y) => y.id === id) : undefined;
      return (x?.order ?? 0) > cover.order! ? under : { arrow: cover.id };
    }
    return hitBelow(p);
  };
  const hitBelow = (p: P): Hover => {
    const t = hitAt(p);
    if (t.atom !== undefined) return t;
    const caption = captionAt(p);
    if (caption !== undefined) return { caption };
    const arrow = arrowAt(p) ?? shapeAt(p);
    if (arrow !== undefined) return { arrow };
    const arc = cycleAt(p);
    if (arc) return { cycle: arc.cycle, step: arc.step, ...(arc.branch !== undefined ? { branch: arc.branch, part: arc.part } : {}) };
    const inside = t.bond === undefined ? (tool === "select" ? highlightAt(p) ?? plateAt(p)?.id : undefined) ?? (tool === "select" || tool === "orbital" ? orbitalAt(p) : undefined) : undefined;
    return inside !== undefined ? { arrow: inside } : t;
  };
  // Curved arrows start and end on atoms and bond middles, where electrons are.
  const electronAt = (p: P, t: Hover): P => {
    // A lone pair or radical dot near the pointer comes first: the arrow starts at the electrons themselves.
    const near = drawing.electrons.filter((e) => e.key !== "charge" && e.key !== "partial").map((e) => ({ e, d: Math.hypot(e.at[0] / L - p[0], -e.at[1] / L - p[1]) })).filter((x) => x.d < 0.3).sort((a, b) => a.d - b.d)[0];
    if (near) return [near.e.at[0] / L, -near.e.at[1] / L];
    if (t.atom !== undefined) return pos(doc, t.atom);
    if (t.bond !== undefined) { const [a, b] = doc.bonds[t.bond].atoms.map((i) => pos(doc, i)); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
    return p;
  };
  // The arrow whose conditions a caption at this point would be: just above or below the middle of a straight arrow.
  const arrowBeside = (p: P): Caption["on"] => {
    for (const a of arrows) {
      if (!straightArrow(a)) continue;
      const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]), u = [(a.to[0] - a.from[0]) / len, (a.to[1] - a.from[1]) / len];
      const along = (p[0] - a.from[0]) * u[0] + (p[1] - a.from[1]) * u[1], off = -(p[0] - a.from[0]) * u[1] + (p[1] - a.from[1]) * u[0];
      if (along < 0 || along > len || Math.abs(off) > 1.2) continue;
      // Above on screen is +y in the drawing; for an arrow pointing left the sides swap.
      return { arrow: a.id, side: (off > 0) === (u[0] >= 0) ? "above" : "below" };
    }
    return undefined;
  };
  const inkOf = (atoms: number[]) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i]));
  // A structure's size as people see it, as ChemDraw treats a structure and its caption: its atoms with their labels,
  // and the captions attached to it (under it). For frames, aligning, snapping and the group frame.
  const withCaptions = (atoms: Iterable<number>): Box | undefined => {
    const set = new Set(atoms), under = new Set((shown.captions ?? []).filter((c) => c.under?.some((i) => set.has(i))).map((c) => c.id));
    return union([...[...set].flatMap((i) => (drawing.ink[i] ? [drawing.ink[i]] : [])), ...placed.filter((c) => under.has(c.id)).map((c) => c.box)]);
  };
  // Atoms and objects as drawn (px, y down): the atoms with their labels and the text under them, and the text, arrows,
  // curves, shapes and cycles. For the group frame, the rotation handle and the middle every turn and flip goes about.
  const drawnBox = (atoms: Iterable<number>, items: Set<number>): Box | undefined => union([
    ...[withCaptions(atoms)].filter((b): b is Box => !!b),
    ...placed.filter((c) => items.has(c.id)).map((c) => c.box),
    // An orbital by its lobes, which reach past its nucleus and out to its sides.
    ...[...arrows.filter((a) => items.has(a.id)), ...cycleArrows.filter((a) => items.has(a.cycle))].map((a) => (isOrbital(a) && union(lobesOf(a, L).flatMap((l) => l.path.map(([x, y]): Box => [x, y, x, y])))) || arrowTrace(a, L).box),
    ...(shown.shapes ?? []).filter((sh) => items.has(sh.id)).map((sh): Box => { const b = shapeBounds(sh); return [b[0] * L, -b[3] * L, b[2] * L, -b[1] * L]; }),
  ]);
  // What an insertion adds (a paste, Name to Structure, Import, the reaction keys, Add to drawing) comes into view once
  // it is drawn and selected: the view pans by as little as it takes, at once with no glide (the keys make most of
  // them), 48 px clear of the window's edges and of the panels over the canvas (the tools, Actions, and a panel along
  // the bottom). Bigger than that room, it is centred. Objects named in place of true come into view without being
  // selected (Add to drawing > Key, Shifts beside atoms, and the Properties panel's).
  const revealNext = useRef<boolean | Set<number>>(false);
  const panelSpans = () => [...document.querySelectorAll(".palette, .actions:not(.leaving), .spectrum, .massspec, .properties")].map((p): Span => { const r = p.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  // What the scroll bars span: the drawing (drawnBox, with every object) and its pages, drawing px at 100%, y down.
  const scrollBox = useMemo((): Span => {
    const items = new Set([...placed.map((c) => c.id), ...arrows.map((a) => a.id), ...cycleArrows.map((a) => a.cycle), ...(shown.shapes ?? []).map((sh) => sh.id)]);
    const b = drawnBox(doc.atoms.keys(), items), [x, y] = [Math.max(...pages.map(([, w]) => w)) / 2 * mm * L, Math.max(...pages.map(([, , h]) => h)) / 2 * mm * L];
    return b ? [Math.min(b[0], -x), Math.min(b[1], -y), Math.max(b[2], x), Math.max(b[3], y)] : [-x, -y, x, y];
  }, [doc, placed, arrows, cycleArrows, shown.shapes, pages, mm]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const what = revealNext.current;
    if (!what) return;
    revealNext.current = false;
    const b = what === true ? drawnBox(selection, picked) : drawnBox([], what), el = svg.current?.getBoundingClientRect();
    if (!b || !el) return;
    const v = views.get(), [dx, dy] = panInto([v.x + b[0] * v.zoom, v.y + b[1] * v.zoom, v.x + b[2] * v.zoom, v.y + b[3] * v.zoom], roomOf([el.left, el.top, el.right, el.bottom], panelSpans()));
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    stopCamera();
    setView({ ...v, x: v.x + dx, y: v.y + dy });
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // The structure a caption at this point (drawing coordinates) would sit under: one whose ink is just above it.
  const structureAbove = (p: P, reach = 2.5) => {
    const [x, y] = [p[0] * L, -p[1] * L];
    return fragments(doc).find((g) => {
      const b = inkOf(g);
      return b && x >= b[0] - 0.5 * L && x <= b[2] + 0.5 * L && y > b[3] && y < b[3] + reach * L;
    });
  };

  // Typing captions. Enter, Escape or a click elsewhere keeps the text. Empty text deletes the caption.
  function startWriting(target: { id: number } | { at: P }) {
    tabRow.current = undefined;
    setSelection(new Set());
    setPicked(new Set());
    if ("id" in target) {
      const c = doc.captions?.find((x) => x.id === target.id);
      if (c) openWriting({ id: c.id, value: c.text, runs: runsOf(c).map((r) => ({ ...r })), version: 0, style: {} });
      return;
    }
    // Clicked just above or below an arrow: the text is its conditions.
    const on = arrowBeside(target.at);
    if (on) return openWriting({ value: "", on, style: { ...textStyle } });
    // Clicked just under a structure: the caption is centred under it, by the ACS rule.
    const under = structureAbove(target.at);
    openWriting(under ? { value: "", under, style: { ...textStyle } } : { value: "", at: target.at, style: { align: "left", ...textStyle } });
  }
  // Tab in a new caption makes a quick table, as in ChemDraw: the caption is kept and the next one starts 20 pt to its
  // right (or under the column the rows above have there), in that column's style; Tab on an empty caption starts a
  // new row 20 pt under the first caption of the row.
  const tabRow = useRef<{ x: number[]; style: Partial<Caption>[]; k: number }>(undefined);
  function tabCaption() {
    const w = writing, at = w?.at;
    if (!w || !at) return;
    const text = w.value.replace(/\s+$/, ""), gap = (20 * pt) / L, row = tabRow.current ?? { x: [at[0]], style: [w.style], k: 0 };
    commitWriting();
    if (!text) { tabRow.current = { ...row, k: 0 }; return openWriting({ value: "", at: [row.x[0], at[1] - gap], style: { ...row.style[0] } }); }
    const size = (w.style.size ?? style.captionSize) * pt, font = fontStack(w.style.font ?? style.captionFont), align = w.style.align ?? "left";
    const wide = Math.max(...text.split("\n").map((t) => textWidth(t, size, w.style.bold, w.style.italic, font))) / L, k = row.k + 1;
    row.style[row.k] = w.style;
    if (row.x[k] === undefined) row.x[k] = at[0] + wide * (align === "right" ? 0 : align === "centre" ? 0.5 : 1) + gap;
    tabRow.current = { ...row, k };
    openWriting({ value: "", at: [row.x[k], at[1]], style: { ...(row.style[k] ?? w.style) } });
  }
  // Tab in a side arrow's text: the text is kept and the text at its other end opens (that end is added if missing).
  function tabSide(): boolean {
    const w = writing, t = w && (w.cycle ?? doc.captions?.find((c) => c.id === w.id)?.cycle), c = t && doc.cycles?.find((x) => x.id === t.cycle);
    if (!w || !t || !c || !isSide(t)) return false;
    const branch = branchFor(c, t), other = t.side === "in" ? "out" : "in", there = doc.captions?.find((x) => x.cycle?.cycle === c.id && x.cycle.branch === branch && x.cycle.side === other);
    commitWriting();
    if (there) openWriting({ id: there.id, value: there.text, runs: runsOf(there).map((x) => ({ ...x })), version: 0, style: {} });
    else openWriting({ value: "", cycle: { cycle: c.id, step: t.step, side: other, branch }, style: { ...textStyle } });
    return true;
  }
  function commitWriting() {
    const w = writing;
    if (!writingOpen.current) return;
    writingOpen.current = false;
    setWriting(undefined);
    if (!w) return;
    // A name typed as LaTeX's, \delta, is its character, δ (escapes.ts, Stefan Schramm's idea in PR 42).
    const typed = expandRuns(w.runs ?? [{ text: w.value }], keptText(doc.captions?.find((c) => c.id === w.id)?.text)), text = plainOf(typed).replace(/\s+$/, "");
    // Runs are kept only when some text has a style of its own; trailing space goes from them as from the text. A colour
    // all the text has becomes the caption's own (shareColour), so it is kept as a colour picked for the whole caption.
    const own = "colour" in w.style ? w.style.colour : doc.captions?.find((c) => c.id === w.id)?.colour;
    const { colour, runs } = shareColour(w.runs && styled(typed) ? edited(typed, text) : undefined, own, style.colour), st = colour !== own ? { ...w.style, colour } : w.style;
    // On an experiment page, the markup typed becomes rich text as a step of its own, so Undo gives the text as typed.
    const marked = (m: Mol, id: number) => {
      const c = expPage ? m.captions?.find((x) => x.id === id) : undefined, next = c && markupCaption(c);
      if (next) dispatch({ type: "set", mol: { ...m, captions: m.captions!.map((x) => (x.id === id ? next : x)) } });
    };
    if (w.id !== undefined) {
      const old = doc.captions?.find((c) => c.id === w.id);
      if (!text) return set(deleteGraphics(doc, new Set([w.id])));
      if (old && (text !== old.text || Object.keys(st).length || JSON.stringify(runs) !== JSON.stringify(old.runs))) {
        // A caption that already held markup kept as typed (an escape, or Undo of the change) is not changed again.
        // New text typed over a number Octet gave makes it the user's (numbering.ts renumber).
        const m = set(updateCaption(doc, w.id, { text, ...st, runs, ...(text !== old.text ? { auto: undefined } : {}) }));
        if (!(expPage && markupCaption(old))) marked(m, w.id);
      }
      return setPicked(new Set([w.id]));
    }
    // A side arrow's end written with nothing stays there, bare.
    if (!text) { const sb = w.cycle && isSide(w.cycle) ? branchOf(doc, w.cycle) : undefined, part = w.cycle?.side as "in" | "out"; return sb && !sb.b[part] ? void set(withEnd(doc, sb.c.id, sb.b.id, part)) : undefined; }
    const [mol, id] = addCaption(doc, { text, x: w.at?.[0] ?? 0, y: w.at?.[1] ?? 0, ...(w.under ? { under: w.under } : {}), ...(w.on ? { on: w.on } : {}), ...(w.cycle ? { cycle: w.cycle } : {}), ...st, ...(runs ? { runs } : {}) });
    marked(set(labelEnd(mol, id)), id);
    setPicked(new Set([id]));
  }
  // A text style on the characters selected in the caption box (with nothing selected, on the next characters
  // typed), or on the whole of every picked caption (the caption's own bold, italic and underline go into its runs,
  // so part of it can be set apart).
  function styleText(patch: (s: RunStyle, all: RunStyle) => RunStyle, what: string) {
    const fold = (c: Partial<Caption>, runs: TextRun[]) => runs.map((r) => ({ ...(c.bold ? { bold: true as const } : {}), ...(c.italic ? { italic: true as const } : {}), ...(c.underline ? { underline: true as const } : {}), ...r }));
    const unfold = { bold: false, italic: false, underline: false };
    if (writing) {
      const base = writing.id !== undefined ? { ...doc.captions?.find((c) => c.id === writing.id), ...writing.style } : writing.style;
      const runs = normalise(fold(base, writing.runs ?? [{ text: writing.value }])), [s, e] = richApi.current?.range() ?? [writing.value.length, writing.value.length];
      const all = common(runs, s, e);
      if (s === e) return setWriting({ ...writing, runs, style: { ...writing.style, ...unfold }, pending: patch({ ...(writing.pending ?? all) }, writing.pending ?? all), version: (writing.version ?? 0) + 1, caret: [s, e] });
      return setWriting({ ...writing, runs: styleRange(runs, s, e, (st) => patch(st, all)), style: { ...writing.style, ...unfold }, version: (writing.version ?? 0) + 1, caret: [s, e] });
    }
    if (!picked.size) return what === "font" ? setTextStyle((t) => ({ ...t, font: patch({}, {}).font })) : undefined;
    set({
      ...doc,
      captions: doc.captions?.map((c) => {
        if (!picked.has(c.id)) return c;
        const runs = normalise(fold(c, runsOf(c))), next = styleRange(runs, 0, c.text.length, (st) => patch(st, common(runs, 0, c.text.length)));
        return { ...c, bold: undefined, italic: undefined, underline: undefined, runs: styled(next) ? next : undefined };
      }),
    }, true);
  }
  // Formula (⌘F, as ChemDraw's): the counts in the selected text (or the whole caption) become subscripts.
  function formulaText() {
    const apply = (runs: TextRun[], s: number, e: number) => {
      const text = plainOf(runs).slice(s, e);
      let out = runs, at = s;
      for (const r of formulaRuns(text)) { if (r.sub) out = styleRange(out, at, at + r.text.length, (st) => ({ ...st, script: "sub" })); at += r.text.length; }
      return out;
    };
    if (writing) {
      const runs = writing.runs ?? [{ text: writing.value }], range = richApi.current?.range(), [s, e] = range && range[0] !== range[1] ? range : [0, writing.value.length];
      return setWriting({ ...writing, runs: apply(runs, s, e), version: (writing.version ?? 0) + 1, caret: range ?? [s, e] });
    }
    set({ ...doc, captions: doc.captions?.map((c) => { if (!picked.has(c.id)) return c; const next = apply(runsOf(c), 0, c.text.length); return { ...c, runs: styled(next) ? next : undefined }; }) }, true);
  }
  // Apply Markup: the markup in the text being typed (or in each picked caption) becomes rich text (experiment.ts):
  // *italic*, **bold**, \textit{…}, $^{13}$C and the rest. Undo gives the text as it was typed.
  function markupText() {
    if (writing) {
      const runs = markupRuns(writing.runs ?? [{ text: writing.value }]), value = plainOf(runs);
      return setWriting({ ...writing, value, runs, version: (writing.version ?? 0) + 1, caret: [value.length, value.length] });
    }
    if (!doc.captions?.some((c) => picked.has(c.id) && markupCaption(c))) return;
    set({ ...doc, captions: doc.captions.map((c) => (picked.has(c.id) ? markupCaption(c) ?? c : c)) }, true);
  }
  // Applies a style change to the caption being typed, or to every picked caption.
  function restyle(change: (c: Partial<Caption>) => Partial<Caption>) {
    if (writing) {
      const base = writing.id !== undefined ? { ...doc.captions?.find((c) => c.id === writing.id), ...writing.style } : writing.style;
      return setWriting({ ...writing, style: { ...writing.style, ...change(base) } });
    }
    if (!picked.size) return tool === "text" ? setTextStyle((s) => ({ ...s, ...change(s) })) : undefined;
    const first = doc.captions?.find((c) => picked.has(c.id));
    if (!first) return;
    // One change for all, so Bold on a mixed set makes them all bold. It is on the whole of each caption, so its runs
    // lose that style.
    const delta = change(whole(first)), keys = Object.keys(delta);
    const restyled = (c: Caption): Caption => { const runs = c.runs && without(c.runs, keys); return { ...c, ...delta, ...(c.runs ? { runs: runs && styled(runs) ? runs : undefined } : {}) }; };
    set({ ...doc, captions: doc.captions?.map((c) => (picked.has(c.id) ? restyled(c) : c)) }, true);
  }
  // Moves the selected atoms and the moving captions. A caption under a structure that is not moving comes
  // away from it and stays where it is dragged.
  function moveAll(base: Mol, d: P, captions: Map<number, P>, arrowIds = new Set<number>(), cycleIds = new Set<number>(), atoms = selection): Mol {
    let m = atoms.size ? moveAtoms(base, atoms, d) : base;
    if (cycleIds.size) m = { ...m, cycles: m.cycles?.map((c) => (cycleIds.has(c.id) ? { ...c, centre: [c.centre[0] + d[0], c.centre[1] + d[1]] } : c)) };
    const shift = <T extends { id: number; from: [number, number]; to: [number, number] }>(a: T): T => (arrowIds.has(a.id) ? { ...a, from: [a.from[0] + d[0], a.from[1] + d[1]], to: [a.to[0] + d[0], a.to[1] + d[1]] } : a);
    const shiftCurve = (x: Arrow): Arrow => (arrowIds.has(x.id) && x.curve ? { ...shift(x), curve: { ...x.curve, points: x.curve.points.map((q) => ({ at: [q.at[0] + d[0], q.at[1] + d[1]], ...(q.c1 ? { c1: [q.c1[0] + d[0], q.c1[1] + d[1]] as P } : {}), ...(q.c2 ? { c2: [q.c2[0] + d[0], q.c2[1] + d[1]] as P } : {}) })) } } : shift(x));
    if (arrowIds.size) m = { ...m, arrows: m.arrows?.map(shiftCurve), shapes: m.shapes?.map(shift) };
    if (!captions.size) return m;
    // A side arrow's text: its end goes where it is dragged, and the text follows its end.
    for (const [id, from] of captions) {
      const t = m.captions?.find((x) => x.id === id)?.cycle, sb = t && branchOf(m, t);
      if (sb) m = dragEnd(m, cycleLayout, sb.c.id, sb.b.id, t!.side as "in" | "out", [(from[0] + d[0]) * L, -(from[1] + d[1]) * L], L).m;
    }
    return {
      ...m,
      captions: m.captions?.map((c) => {
        const from = captions.get(c.id);
        if (!from) return c;
        // A cycle's reagent or product stays on its cycle: its arrow's outer end (from) goes where it is dragged. A
        // step's name goes along its step the same way; an intermediate written as text stays one.
        if (isSide(c.cycle)) return { ...c, x: from[0] + d[0], y: from[1] + d[1] };
        if (c.cycle?.side === "node") return { ...c, x: from[0] + d[0], y: from[1] + d[1] };
        if (c.cycle?.side === "name") {
          const f = doc.cycles?.find((y) => y.id === c.cycle!.cycle)?.scale ?? 1, to = sideFor(cycleLayout, c.cycle!, [(from[0] + d[0]) * L, -(from[1] + d[1]) * L], L, f);
          return to ? { ...c, cycle: { ...c.cycle!, ...to } } : c;
        }
        // A centre label stays the cycle's while it is well inside the circle (off, in bond lengths at its scale);
        // further out it is free text.
        const own = c.cycle?.side === "centre" ? doc.cycles?.find((y) => y.id === c.cycle!.cycle) : undefined, f = own?.scale ?? 1, o = c.cycle?.off ?? [0, 0];
        const off: [number, number] = [Math.round((o[0] + d[0] / f) * 1000) / 1000, Math.round((o[1] + d[1] / f) * 1000) / 1000];
        if (own && Math.hypot(...off) * f <= 0.8 * own.radius && Math.hypot(...off) <= 50) return { ...c, cycle: { ...c.cycle!, off } };
        const { under: _u, on: _o, cycle: _c, placed: _p, ...free } = c;
        return { ...free, x: from[0] + d[0], y: from[1] + d[1] };
      }),
    };
  }
  // Catalytic cycles: make one from the selected structures, tidy it, turn it the other way, label it, or ungroup it.
  // Tidy a cycle (Tidy the cycle, Make a cycle, Clean Up): breaks go round evenly with the intermediates, and its side
  // arrows' structures go with their arcs. A circle with no structures or text on it stays as it is. An intermediate's
  // ink is its structure's in d (m drawn), or its text's.
  const spread = (m: Mol, c: Cycle, d: Pick<typeof drawing, "ink"> = drawing) => {
    if (!c.nodes.some((n, i) => n.length || textOn(m, c, i))) return m;
    const ink = (atoms: number[], i: number) => { const t = atoms.length ? undefined : textOn(m, c, i); return t ? placed.find((x) => x.id === t.id)?.box : union(atoms.filter((k) => d.ink[k]).map((k) => d.ink[k])); };
    const { shifts, radius } = spreadCycle(c, L, ink), even = c.nodes.map((_, i) => Math.PI / 2 - ((c.clockwise ? 1 : -1) * 2 * Math.PI * i) / c.nodes.length);
    m = followArcs(m, c, even, radius);
    c.nodes.forEach((n, i) => {
      m = moveAtoms(m, new Set(n), shifts[i]);
      const t = n.length ? undefined : textOn(m, c, i);
      if (t) m = updateCaption(m, t.id, { x: t.x + shifts[i][0], y: t.y + shifts[i][1] });
    });
    return { ...m, cycles: m.cycles?.map((x) => (x.id === c.id ? { ...x, radius, at: even } : x)) };
  };
  function cycleAction(what: string) {
    // A picked side arrow, or the one whose text is picked: the ends it has, turned round, inside or outside the circle,
    // its heads, back where Octet puts it, or taken off. A picked step's name goes back where Octet puts it.
    if (what.startsWith("side.") && what !== "side.add") {
      let m = doc;
      const mine = new Map<string, { c: number; b: number }>();
      if (branchPick && picked.has(branchPick.cycle)) mine.set(`${branchPick.cycle}:${branchPick.branch}`, { c: branchPick.cycle, b: branchPick.branch });
      for (const cap of doc.captions ?? []) {
        if (!picked.has(cap.id) || !cap.cycle) continue;
        if (cap.cycle.side === "name" && what === "side.reset") { const { at: _a, reach: _r, ...rest } = cap.cycle; m = updateCaption(m, cap.id, { cycle: rest }); continue; }
        const sb = isSide(cap.cycle) ? branchOf(doc, cap.cycle) : undefined;
        if (sb) mine.set(`${sb.c.id}:${sb.b.id}`, { c: sb.c.id, b: sb.b.id });
      }
      for (const { c, b: id } of mine.values()) {
        const cy = m.cycles?.find((x) => x.id === c), b = cy?.branches?.find((x) => x.id === id);
        if (!cy || !b) continue;
        // A structure alone turned round, or put back, meets the arc where a structure dropped there would.
        const lone = (b.in ?? b.out)!, solo = !(b.in && b.out) && lone.atoms?.length ? lone.atoms : undefined, again = (x: Mol, part: "in" | "out") => { const at = solo && structureMeet(x, cy, solo, part); return at ? setBranch(x, c, id, at) : x; };
        if (what === "side.swap") m = again(swapBranch(m, c, id), b.in ? "out" : "in");
        if (what === "side.remove") m = removeEnd(removeEnd(m, c, id, "in"), c, id, "out");
        if (what.startsWith("side.ends.")) m = setEnds(m, c, id, what.slice(10) as "both" | "in" | "out");
        // Inside, an end stays no nearer the middle than a fifth of the radius.
        // A structure end stays where its structure is.
        if (what === "side.inside") { const inside = insideOf(b); for (const part of ["in", "out"] as const) { const r = b[part]?.reach ?? 1.1; if (b[part] && !b[part]!.atoms?.length && r < 0 === inside) m = setEnd(m, c, id, part, { reach: r > 0 ? -Math.min(r, 0.8 * cy.radius) : -r }); } }
        if (what === "side.reset") m = again(setBranch(m, c, id, { meet: undefined, ...(b.in ? { in: b.in.atoms ? { atoms: b.in.atoms } : {} } : {}), ...(b.out ? { out: b.out.atoms ? { atoms: b.out.atoms } : {} } : {}) }), b.in ? "in" : "out");
        // A head at the arrow's start or end: the one it has already takes it off, as with an arrow.
        if (what.startsWith("side.start.") || what.startsWith("side.end.")) {
          const h = branchHeads(b), k = what.startsWith("side.start.") ? 0 : 1, v = what.split(".").pop() as Head, heads: [Head, Head] = k ? [h[0], h[1] === v ? "none" : v] : [h[0] === v ? "none" : v, h[1]];
          m = setBranch(m, c, id, { heads: heads[0] === "none" && heads[1] === (b.out ? "full" : "none") ? undefined : heads });
        }
      }
      return set(m, true);
    }
    // The heads of every arrow of each picked cycle (or of the cycle a picked side arrow's text is on): their shape and
    // palette size, as an arrow's.
    if (what.startsWith("head.") || what.startsWith("size.")) {
      const [key, v] = what.split("."), on = new Set([...picked, ...(doc.captions ?? []).filter((x) => picked.has(x.id) && isSide(x.cycle)).map((x) => x.cycle!.cycle)]);
      const value = v === "solid" || v === "small" ? undefined : key === "head" ? (["hollow", "angled"].includes(v) ? v : undefined) : ["large", "medium"].includes(v) ? v : undefined;
      return set({ ...doc, cycles: doc.cycles?.map((c) => (on.has(c.id) ? { ...c, [key === "head" ? "head" : "arrowSize"]: value } : c)) }, true);
    }
    // The clear space round each intermediate, in tenths of a point.
    if (what.startsWith("gap.")) {
      const g = Number(what.slice(4)) / 10;
      return set({ ...doc, cycles: doc.cycles?.map((c) => (picked.has(c.id) ? { ...c, gap: g } : c)) }, true, `cycle-gap-${[...picked].join()}`);
    }
    if (what === "make") {
      const groups = fragments(doc).filter((g) => g.some((i) => selection.has(i)));
      if (groups.length < 2) return;
      const items = groups.map((atoms) => { const b = inkOf(atoms)!; return { atoms, middle: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as P }; });
      const middle: P = [items.reduce((s, x) => s + x.middle[0], 0) / items.length, items.reduce((s, x) => s + x.middle[1], 0) / items.length];
      const [m, id] = addCycle(doc, { centre: [middle[0] / L, -middle[1] / L], radius: 3, clockwise: true, nodes: orderAround(middle, items), at: [] });
      glideTo(spread(m, m.cycles!.find((c) => c.id === id)!));
      return choose(groups.flat(), [id]);
    }
    const c = (doc.cycles ?? []).find((x) => picked.has(x.id));
    if (!c) return;
    if (what === "tidy") return glideTo(spread(doc, c));
    // The step picked or last pressed (stepHere): reversible or forward, and a reversible one's balance (Arrow.ratio).
    const s = stepHere(c);
    if (what === "step.reset") return set(setStep(doc, c.id, s, { lead: undefined, trail: undefined, bow: undefined, ratio: undefined }), true);
    if (what === "step.hide") return set(c.steps?.[s]?.hidden ? setStep(doc, c.id, s, { hidden: undefined }) : hideArc(c.id, s), true);
    if (what === "step.show") return set(c.steps?.reduce((m, x, k) => (x?.hidden ? setStep(m, c.id, k, { hidden: undefined }) : m), doc) ?? doc, true);
    // A new side arrow on the step, picked on its own so its handles show.
    if (what === "side.add") {
      const [m, branch] = addBranch(doc, c.id, s);
      if (branch === undefined) return;
      set(m, true);
      setSelection(new Set());
      setPicked(new Set([c.id]));
      setStepPick(undefined);
      return setBranchPick({ cycle: c.id, branch });
    }
    if (what === "step.reversible") return set(setStep(doc, c.id, s, { kind: c.steps?.[s]?.kind ? undefined : "equilibrium" }), true);
    if (what.startsWith("step.balance.")) return set(setStep(doc, c.id, s, { kind: "equilibrium", ratio: what.endsWith(".forward") ? 3 : what.endsWith(".back") ? 1 / 3 : undefined }), true);
    if (what === "reverse") return set({ ...doc, cycles: doc.cycles?.map((x) => (x.id === c.id ? { ...x, clockwise: !x.clockwise } : x)) }, true);
    // Remove the cycle (cycle.ungroup: its old id, so a key saved for it still works): its arrows go, and its structures
    // and text stay where they are.
    if (what === "remove" || what === "ungroup") return set(deleteGraphics(doc, new Set([c.id]), drawnAt, drawnAlign));
    if (what === "name") return openName(c.id, s);
    if (what === "centre" || what === "in" || what === "out") {
      setPicked(new Set());
      setSelection(new Set());
      return openWriting({ value: "", cycle: { cycle: c.id, step: what === "centre" ? 0 : s, side: what }, style: { ...textStyle } });
    }
  }
  // A side arrow pulled out of a cycle's arc (pullBranch), let go: on a structure, the structure labels its end; on free
  // text, the text does; elsewhere its text is written there (none leaves the end bare). Let go near the arc, nothing.
  function releasePull(id: number, step: number, made?: ReturnType<typeof pullBranch>) {
    if (!made) return;
    const { branch, part } = made, h = pointer.current ? hit(pointer.current) : {}, atom = h.atom ?? (h.bond !== undefined ? doc.bonds[h.bond]?.atoms[0] : undefined), c = made.m.cycles?.find((x) => x.id === id);
    const atoms = atom !== undefined ? fragments(doc).find((g) => g.includes(atom)) : undefined, cycle: CycleText = { cycle: id, step, side: part, branch };
    if (c && atoms && !c.nodes.some((n) => n.some((i) => atoms.includes(i)))) {
      // A structure labels one end at a time: one it labelled before is bare now.
      let m = made.m;
      for (const b of c.branches ?? []) for (const x of ["in", "out"] as const) if ((b.id !== branch || x !== part) && b[x]?.atoms?.some((i) => atoms.includes(i))) m = setEnd(m, id, b.id, x, { atoms: undefined });
      return set(setEnd(m, id, branch, part, { atoms, along: undefined, reach: undefined }), true);
    }
    const text = h.caption !== undefined ? doc.captions?.find((x) => x.id === h.caption && !x.under && !x.on && !x.cycle) : undefined;
    if (text) return set(updateCaption(made.m, text.id, { cycle }), true);
    set(made.m);
    openWriting({ value: "", cycle, style: { ...textStyle } });
  }
  // A step's name opened for typing: the name it has, or a new one.
  function openName(id: number, step: number) {
    const there = doc.captions?.find((x) => x.cycle?.cycle === id && x.cycle.step === step && x.cycle.side === "name");
    setSelection(new Set());
    setPicked(new Set());
    if (there) return openWriting({ id: there.id, value: there.text, runs: runsOf(there).map((x) => ({ ...x })), version: 0, style: {} });
    return openWriting({ value: "", cycle: { cycle: id, step, side: "name" }, style: { ...textStyle, italic: true } });
  }
  // The Cycle tool. A new cycle drawn from its centre out to a point, turning clockwise, with no nodes yet.
  function newCycle(centre: P, to: P): Omit<Cycle, "id"> {
    return { centre, radius: Math.max(0.5, Math.hypot(to[0] - centre[0], to[1] - centre[1])), clockwise: true, nodes: [], at: [] };
  }
  // The cycles laid out afresh for another drawing with the same structures and text (resplice).
  const relay = (m: Mol) => layoutCycles(m, L, pt, (atoms) => union(atoms.filter((i) => drawing.ink[i]).map((i) => drawing.ink[i])), (id) => placed.find((x) => x.id === id)?.box);
  // A step's arc hidden (the Eraser, Delete, Hide the arc): the last arc showing takes its cycle with it.
  const hideArc = (id: number, step: number) => cycleLayout.spans.some((s) => s.cycle === id && s.step !== step && s.to > s.from && !doc.cycles?.find((c) => c.id === id)?.steps?.[s.step]?.hidden) ? setStep(doc, id, step, { hidden: true }) : deleteGraphics(doc, new Set([id]), drawnAt, drawnAlign);
  // The cycle whose circle passes within a few px (px) of a point: the nearest, where two do.
  const circleAt = (p: P, px = 8) => {
    const d = (c: Cycle) => Math.abs(Math.hypot(p[0] - c.centre[0], p[1] - c.centre[1]) - c.radius) * L * views.get().zoom;
    return (doc.cycles ?? []).filter((c) => d(c) < px).sort((a, b) => d(a) - d(b))[0];
  };
  // A hidden step under a point: within a few px of where its arc would run.
  const hiddenAt = (p: P) => cycleLayout.spans.find((s) => {
    if (!doc.cycles?.find((c) => c.id === s.cycle)?.steps?.[s.step]?.hidden || s.to <= s.from) return false;
    const q: P = [p[0] * L, -p[1] * L], t = (((Math.sign(s.sw) || s.dir) * (Math.atan2(q[1] - s.O[1], q[0] - s.O[0]) - s.p0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    return t <= Math.abs(s.sw) && Math.abs(Math.hypot(q[0] - s.O[0], q[1] - s.O[1]) - s.Rs) * views.get().zoom < 8;
  });
  // A drag draws a circle, and structures already on it join it; a drag from a circle pulls a side arrow out of it
  // (releasePull). A click on a circle breaks it there (or joins it up again at a break); a click away from any circle
  // draws one three bond lengths across. Step name: a click on a step of a circle adds its name there, or edits the
  // name already there. Reversible step: as Catalytic cycle, but a click on a circle makes the step there reversible,
  // or forward again. Option-click goes on to its next balance: equal, forward longer, back longer. A click where a
  // hidden step's arc was shows it again. A break never goes in an intermediate's ink or the gap round it. A double-click
  // on an arc opens its step's name, with no break or change left by its clicks. Side arrow: as Catalytic cycle, but a
  // click on or near a circle asks what to add to the step there (askSide).
  function releaseCycle(from: P, to?: P, screen?: [number, number]) {
    if (cycleChoice === "side" && !to) return askSide(from, screen);
    const c = circleAt(from), hid = !to && cycleChoice !== "name" ? hiddenAt(from) : undefined, was = lastArc.current;
    lastArc.current = undefined;
    // The second click of a double-click on an arc takes the first one's change back and opens the step's name.
    if (!to && was && (c?.id ?? hid?.cycle) === was.cycle && was.after === doc && performance.now() - was.time < DOUBLE_MS) { undo(); return openName(was.cycle, was.step); }
    const s = c && stepAt(doc, c, angleAbout(c, from)), clicked = (m: Mol, at = { cycle: c!.id, step: s! }) => { lastArc.current = { ...at, time: performance.now(), after: set(m, true) }; };
    if (hid) return clicked(setStep(doc, hid.cycle, hid.step, { hidden: undefined }), { cycle: hid.cycle, step: hid.step });
    if (cycleChoice === "name") return c ? openName(c.id, stepAt(doc, c, angleAbout(c, from))) : undefined;
    if (!to && c && cycleChoice === "reversible") {
      const st = c.steps?.[s!], r = st?.ratio ?? 1;
      setCycleStep({ cycle: c.id, step: s! });
      return clicked(setStep(doc, c.id, s!, pressAlt.current ? { kind: "equilibrium", ratio: st?.kind !== "equilibrium" || r === 1 ? 3 : r > 1 ? 1 / 3 : undefined } : { kind: st?.kind ? undefined : "equilibrium" }));
    }
    if (!to && c) {
      const a = angleAbout(c, from), gap = breakAt(doc, c, a, 10 / (c.radius * L * views.get().zoom));
      if (gap === undefined && c.nodes.length && !clearAt(cycleLayout, c.id, a)) return;
      return clicked(gap !== undefined ? removeStop(doc, c.id, gap, relay) : addStop(doc, c.id, a, [], relay));
    }
    // The new cycle is not picked, so the next clicks on its circle break it (and do not land on its frame's handles).
    const [m] = addCycle(doc, newCycle(from, to ?? [from[0] + 3, from[1]]));
    set(dropOnCycle(m, fragments(m)));
  }
  // The Side arrow tool's click within 24 px of a circle: a menu at the pointer asks Reagent, Product or Reagent and
  // product, the likely one first (sideChoices) and under the pointer, so Return or a second click takes it.
  function askSide(from: P, screen?: [number, number]) {
    const c = circleAt(from, 24), s = c && stepAt(doc, c, angleAbout(c, from));
    if (!c || s === undefined || !screen) { setSelection(new Set()); setPicked(new Set()); return; }
    const g = sideFor(cycleLayout, { cycle: c.id, step: s }, [from[0] * L, -from[1] * L], L, c.scale ?? 1)?.at ?? 0.5;
    setSideAsk({ x: screen[0] - 24, y: screen[1] - 20, cycle: c.id, step: s, g, choices: sideChoices(c, s, g) });
  }
  // The answer: the end goes on (one undo step), and its text opens for typing there (none leaves the end bare). Both
  // ends: the reagent's first.
  function chooseSide(ask: NonNullable<typeof sideAsk>, ends: "in" | "out" | "both") {
    const [m, branch] = addSide(doc, ask.cycle, ask.step, ask.g, ends);
    if (branch === undefined) return;
    set(m);
    openWriting({ value: "", cycle: { cycle: ask.cycle, step: ask.step, side: ends === "out" ? "out" : "in", branch }, style: { ...textStyle } });
  }
  // Numbers the structures in the selection, left to right, skipping any that already have a number.
  function numberStructures() {
    let m = doc;
    const groups = fragments(doc).filter((g) => g.some((i) => selection.has(i)) && !doc.captions?.some((c) => isNumber(c) && c.under?.some((i) => g.includes(i))));
    groups.sort((a, b) => (inkOf(a)?.[0] ?? 0) - (inkOf(b)?.[0] ?? 0));
    for (const g of groups) m = addCaption(m, { text: nextCompound(m), x: 0, y: 0, bold: true, under: g, auto: true })[0];
    if (m !== doc) set(m, true);
  }

  const stopHold = () => {
    if (hold.current === undefined) return;
    clearTimeout(hold.current);
    hold.current = undefined;
    setHolding(undefined);
  };
  const addPoint = useRef<number>(undefined); // the arrow whose middle mark the press went down on
  const editPress = useRef<number>(undefined); // the curve Edit curve had picked when the press went down
  const holdFrom = useRef<[number, number]>(undefined); // where the press that may become a hold went down

  // Select tool press: on something selected, move the selection; on something else, select it and move it;
  // on empty canvas, start a selection box. Shift adds to the selection.
  // picks: the captions that will be picked once this press's state updates land.
  // The selected things for Align and Distribute: each structure, group, cycle and object, with its box in drawing
  // units (y up: [left, bottom, right, top]) and what moves with it. A group is one thing when it is all selected; the
  // members of a group selected in part line up one by one. A picked cycle is one thing with its intermediates.
  function things() {
    const box = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
    const out: { atoms: number[]; items: number[]; box: Box; home?: object }[] = [];
    const groups = selectedGroups(doc, selection, picked), cycles = (doc.cycles ?? []).filter((c) => picked.has(c.id));
    const homeOf = (atoms: number[], id?: number): object | undefined => groups.find((g) => (id !== undefined ? g.items.includes(id) : atoms.some((i) => g.atoms.includes(i))))
      ?? cycles.find((c) => (id !== undefined ? c.id === id : c.nodes.some((n) => n.some((i) => atoms.includes(i)))));
    const add = (atoms: number[], items: number[], b: Box | undefined) => {
      if (!b) return;
      const home = homeOf(atoms, items[0]), mine = home && out.find((o) => o.home === home);
      if (mine) { mine.atoms.push(...atoms); mine.items.push(...items); mine.box = [Math.min(mine.box[0], b[0]), Math.min(mine.box[1], b[1]), Math.max(mine.box[2], b[2]), Math.max(mine.box[3], b[3])]; }
      else out.push({ atoms: [...atoms], items: [...items], box: b, home });
    };
    // A structure selected only in part lines up by that part and moves whole (partBox), as ChemDraw.
    for (const g of fragments(doc).filter((f) => f.some((i) => selection.has(i)))) { const part = partBox(doc, g, selection), b = part ? undefined : withCaptions(g); add(g, [], part ?? (b && box(b))); }
    for (const c of cycles) { const b = drawnBox([], new Set([c.id])); add([], [c.id], b && box(b)); }
    for (const c of placed) if (picked.has(c.id)) { const cap = doc.captions?.find((x) => x.id === c.id); if (cap && !cap.under && !cap.on && !cap.cycle) add([], [c.id], box(c.box)); }
    for (const a of doc.arrows ?? []) if (picked.has(a.id)) {
      const [f, t] = a.curve ? curveBox(a.curve) : [a.from, a.to];
      add([], [a.id], [Math.min(f[0], t[0]), Math.min(f[1], t[1]), Math.max(f[0], t[0]), Math.max(f[1], t[1])]);
    }
    for (const sh of doc.shapes ?? []) if (picked.has(sh.id)) add([], [sh.id], shapeBounds(sh));
    return out;
  }
  // The selected atoms and picked objects with the whole of each group they reach into (the outermost, when groups
  // nest). Sam (28 October 2026): a group turns, flips and scales as one, whatever part of it is selected.
  const withGroups = (atoms: Set<number>, items: Set<number>): [Set<number>, Set<number>] => {
    const gs = outerGroups(groupsOf(doc, atoms, items));
    return gs.length ? [new Set([...atoms, ...gs.flatMap((g) => g.atoms)]), new Set([...items, ...gs.flatMap((g) => g.items)])] : [atoms, items];
  };
  // What Rotate…, Scale…, the flips, the Turn keys and the selection's handles act on: the selected atoms and picked
  // objects with their groups, or the whole drawing when nothing is selected. whole: it is the whole drawing (nothing
  // selected, or all).
  const chosen = () => {
    const none = !selection.size && !picked.size, objects = [...(doc.captions ?? []).filter((c) => !c.under && !c.on && !c.cycle), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])];
    const [atoms, items] = none ? [new Set(doc.atoms.map((_, i) => i)), new Set([...(doc.captions ?? []), ...objects].map((x) => x.id))] : withGroups(selection, picked);
    return { atoms, items, whole: none || (atoms.size === doc.atoms.length && objects.every((x) => items.has(x.id))) };
  };
  // Text alone (captions and nothing else). Scale… and the handles always scale its size, as ChemDraw scales the text
  // of one label whatever its checkbox says, so Labels and lines counts as on for it.
  const textAlone = () => !selection.size && picked.size > 0 && [...picked].every((id) => doc.captions?.some((c) => c.id === id));
  const scalesText = () => settings.scaleLabels || textAlone();
  // Each free caption's middle, from its laid-out box (drawing units).
  const captionMiddles = () => new Map(placed.filter((c) => c.id !== DRAFT).map((c) => [c.id, [(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L] as P]));
  // A scale of the chosen atoms and objects by size (across, up) about c. Shapes, tables and cycles grow with it.
  // A scale in proportion with Labels and lines on (lines) multiplies each object's own scale and its text's sizes
  // too (decision 0007); a stretch moves geometry only.
  // A page spectrum is built again at its new frame (pageplot.ts), its text scaled only as the rest's is.
  const scaledParts = (m: Mol, atoms: Set<number>, items: Set<number>, size: P, c: P, lines: boolean, middles: Map<number, P>) => {
    const k = size[0] === size[1] ? size[0] : 1, text = lines && k !== 1 ? k : 1, f = (q: P): P => [c[0] + (q[0] - c[0]) * size[0], c[1] + (q[1] - c[1]) * size[1]];
    const plots = plotsIn(m, items), held = new Set(plots.flatMap((g) => g.items)), rest = held.size ? new Set([...items].filter((id) => !held.has(id))) : items;
    let moved = transformParts(m, atoms, rest, f, size, middles, text);
    if (text !== 1) moved = scaleSettings(moved, atoms, rest, k, style.captionSize);
    for (const g of plots) moved = rescale(moved, g.id, f, size, text, plotEnv());
    return moved;
  };
  // What a page spectrum's build takes from the document style: its caption size and font, and its bond length.
  const plotEnv = (): PlotEnv => { const family = fontStack(style.captionFont); return { captionSize: style.captionSize, bond: style.bond, measure: (t) => textWidth(t, 1, false, false, family) }; };
  // Commits a scale of what is chosen (working: the drag's copy, when there is one). The whole drawing scaled in
  // proportion with Labels and lines on changes the document's scale instead (IDEA-SCALE-8), so what is drawn next
  // matches: positions are in bond lengths, so each one moves to keep c in its place, sizes in points go with it,
  // and the view zooms with the document, so the drawing looks as it did in the drag.
  function commitScale(size: P, c: P, lines: boolean, working?: Mol) {
    const { atoms, items, whole } = chosen(), k = size[0], next = withScale(style, style.scale * k);
    if (whole && lines && size[0] === size[1] && k !== 1 && Math.abs(next.scale - style.scale * k) < 1e-9) {
      const d: P = [c[0] * (1 / k - 1), c[1] * (1 / k - 1)], all = new Set([...(doc.captions ?? []), ...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].map((x) => x.id));
      const moved = transformParts(doc, new Set(doc.atoms.map((_, i) => i)), all, (q) => [q[0] + d[0], q[1] + d[1]]);
      const nk = frameStyle(next, L).k, was = views.get().zoom, zoom = clampZoom(was * (frame.k / nk));
      lastK.current = nk * next.scale;
      setView((v) => ({ ...v, zoom }));
      zoomedBy.current.set(set({ ...scaleSizes(moved, k), style: next }, true), zoom / was);
      return;
    }
    // A drag of the whole drawing in proportion only showed it scaled (its working copy is the drawing as it was), so
    // a scale the document cannot take (outside 10% to 1000%, or past a style limit) is made here, as object scales.
    const scaled = set(working && working !== doc ? working : scaledParts(doc, atoms, items, size, c, lines, captionMiddles()), true), plots = plotsIn(doc, items);
    // A page spectrum built at its new frame stays picked whole, its new parts too.
    if (plots.length && picked.size) setPicked(new Set([...picked, ...plots.flatMap((g) => scaled.groups?.find((x) => x.id === g.id)?.items ?? [])]));
  }
  // The selection's scale against the document (decision 0007), for the Actions panel's Scale field: its atoms',
  // arrows', shapes' and cycles' scale; null when they differ; undefined when nothing selected has a scale.
  const selectionScale = (): number | null | undefined => {
    const xs = [...[...selection].map((i) => doc.atoms[i]), ...[...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => picked.has(x.id))].filter(Boolean).map(scaleOf);
    return !xs.length ? undefined : xs.every((x) => Math.abs(x - xs[0]) < 1e-4) ? xs[0] : null;
  };
  // The middle of what is chosen, in drawing units: every turn, flip and scale goes about it. Atoms count by their
  // positions and objects as drawn. Text that follows a structure, arrow or cycle is placed again after the move, so it
  // does not count: a structure with its number under it flips in place.
  const selectionMiddle = (): P => {
    const { atoms, items } = chosen(), objects = new Set(items);
    for (const c of doc.captions ?? []) if (c.under || c.on || c.cycle) objects.delete(c.id);
    const b = union([...[...atoms].filter((i) => i < doc.atoms.length).map((i): Box => { const [x, y] = pos(doc, i); return [x * L, -y * L, x * L, -y * L]; }), ...[drawnBox([], objects)].filter((x): x is Box => !!x)]);
    return b ? [(b[0] + b[2]) / 2 / L, -(b[1] + b[3]) / 2 / L] : [0, 0];
  };
  // The chosen atoms and objects turned by degrees (anticlockwise) about c. Text keeps level; shapes keep their shape.
  const turnedParts = (m: Mol, degrees: number, c: P, middles = captionMiddles()) => {
    const { atoms, items } = chosen(), r = (degrees * Math.PI) / 180, [cs, sn] = [Math.cos(r), Math.sin(r)];
    return transformParts(m, atoms, items, (q) => [c[0] + (q[0] - c[0]) * cs - (q[1] - c[1]) * sn, c[1] + (q[0] - c[0]) * sn + (q[1] - c[1]) * cs], [1, 1], middles);
  };
  // The point every turn of the selection goes about (the handle, the Turn keys, Turn 15° and Rotate…), as ChemDraw's:
  // the centre mark where it was put, else the one atom the selected atoms hang from (pivotOf), else the middle. Turns
  // one after another keep the same centre, so turning back puts everything back (text stays upright, so the middle
  // of what is drawn moves as it turns).
  const lastTurn = useRef<{ mol: Mol; selection: Set<number>; picked: Set<number>; centre: P }>(undefined);
  const turnCentre = (): P => {
    if (pivot) return pivot;
    const last = lastTurn.current;
    if (last && last.mol === doc && last.selection === selection && last.picked === picked) return last.centre;
    const k = selection.size ? pivotOf(doc, chosen().atoms) : undefined;
    return k !== undefined ? pos(doc, k) : selectionMiddle();
  };
  const turnTo = (mol: Mol, centre: P) => { lastTurn.current = { mol, selection, picked, centre }; set(mol, true); };
  // A turn of 15° or more glides round the centre, so the structure keeps its shape on the way (a 1° turn is at once).
  // Every turn by an angle (the Turn keys and actions, Rotate…) is the one Edit > Repeat does next.
  const rotateBy = (degrees: number) => {
    const c = turnCentre(), mol = turnedParts(doc, degrees, c), from = doc;
    lastRepeat.current = { rotate: degrees };
    lastTurn.current = { mol, selection, picked, centre: c };
    glideTo(mol, Math.abs(degrees) >= 15 && ((t) => turnedParts(from, degrees * t, c)));
  };
  // Rotate 180° (a turn through 3D) and Flip (a mirror), across or down, about the middle of what is chosen as drawn.
  // The atoms turn over first (flipAtoms keeps or inverts the stereochemistry), then the objects.
  function flip(axis: "horizontal" | "vertical", mirror = false) {
    const c = selectionMiddle(), k = axis === "horizontal" ? 0 : 1, { atoms, items } = chosen();
    glideTo(transformParts(flipAtoms(doc, atoms, axis, mirror, c[k]), new Set(), items, (q) => (k ? [q[0], 2 * c[1] - q[1]] : [2 * c[0] - q[0], q[1]]), [1, 1], captionMiddles(), 1, k ? "down" : "across"));
  }
  function scaleBy(k: number, lines = scalesText()) {
    if (!(k > 0) || !Number.isFinite(k)) return;
    lastRepeat.current = { scale: k };
    commitScale([k, k], selectionMiddle(), lines);
  }
  // The median bond length of what is chosen, in drawing units: bonds with both atoms chosen. Undefined with none.
  const chosenMedian = () => medianBond(doc, chosen().atoms);
  // Moves one of those things by d (drawing units): its atoms, free captions, arrows, shapes and curve points.
  const shiftThing = (m: Mol, t: { atoms: number[]; items: number[] }, d: P): Mol => {
    const ids = new Set(t.items), by = (q: [number, number]): [number, number] => [q[0] + d[0], q[1] + d[1]];
    let out = moveAtoms(m, new Set(t.atoms), d);
    out = {
      ...out,
      captions: out.captions?.map((c) => (ids.has(c.id) ? { ...c, x: c.x + d[0], y: c.y + d[1] } : c)),
      arrows: out.arrows?.map((a) => (ids.has(a.id) ? { ...a, from: by(a.from), to: by(a.to), ...(a.curve ? { curve: { ...a.curve, points: a.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) } : a)),
      shapes: out.shapes?.map((x) => (ids.has(x.id) ? { ...x, from: by(x.from), to: by(x.to) } : x)),
      cycles: out.cycles?.map((c) => (ids.has(c.id) ? { ...c, centre: by(c.centre) } : c)),
    };
    return out;
  };
  function arrange(how: Arrange) {
    const list = things();
    if (list.length < (how === "across" || how === "down" ? 3 : 2)) return setNotice(how === "across" || how === "down" ? "Select three or more things to space out." : "Select two or more things to line up.", "info");
    let m = doc;
    arrangeShifts(list.map((t) => t.box), how).forEach((d, n) => { if (d[0] || d[1]) m = shiftThing(m, list[n], d); });
    glideTo(m);
  }
  // What moves with some atoms and picked objects: the picked arrows, shapes and cycles, and each picked caption that
  // does not simply follow its structure, arrow or cycle (it comes away and moves alone, from where it is drawn).
  // original: each copy's original, for copies not yet drawn.
  const movers = (base: Mol, atoms: Set<number>, picks: Set<number>, original = new Map<number, number>()) => {
    const captions = new Map<number, P>(), arrowIds = new Set([...(base.arrows ?? []), ...(base.shapes ?? [])].filter((a) => picks.has(a.id)).map((a) => a.id));
    const cycleIds = new Set((base.cycles ?? []).filter((c) => picks.has(c.id)).map((c) => c.id));
    for (const caption of base.captions ?? []) {
      const c = placed.find((x) => x.id === (original.get(caption.id) ?? caption.id));
      // A cycle's text follows it, but for an intermediate written as text, which moves as a structure would.
      const follows = (caption.under && caption.under.every((i) => atoms.has(i))) || (caption.on && arrowIds.has(caption.on.arrow)) || (caption.cycle && caption.cycle.side !== "node" && cycleIds.has(caption.cycle.cycle));
      // A cycle's reagent or product moves by its arrow's outer end, where it is at the press.
      // (A reagent's text is at its arrow's start, a product's at its end.)
      const start = cycleArrows.find((a) => a.caption === caption.id), end = cycleArrows.find((a) => a.captionEnd === caption.id);
      if (c && picks.has(caption.id) && !follows) captions.set(caption.id, start ? start.from : end ? end.to : anchorOf(c));
    }
    return { captions, arrowIds, cycleIds };
  };
  // alone: the atoms move without becoming the selection (a bond tool's Shift-drag).
  const startMove = (p: P, screen: [number, number], t: Hover, picks = picked, atoms = selection, copy = false, alone = false) => {
    // Option-drag moves copies, made now and kept only if the pointer moves.
    let base = doc, copies: Map<number, number> | undefined;
    const atoms0 = atoms, picks0 = picks;
    if (copy && (atoms.size || picks.size)) {
      const d = duplicateSelection(doc, atoms, picks);
      [base, atoms, picks, copies] = [d.mol, d.atoms, d.items, d.ids];
      setSelection(atoms);
      setPicked(picks);
    }
    const { captions, arrowIds, cycleIds } = movers(base, atoms, picks, new Map([...(copies ?? [])].map(([from, to]) => [to, from])));
    // Snapping (snap.ts): the box of everything moving, drawn (atoms with their labels, text as placed, arrows and
    // shapes by their ends), and every other object's, as they were at the press. Copies snap to their originals.
    // They are worked out at the first move and kept for the rest of the drag.
    let boxes: ReturnType<Extract<Drag, { kind: "move" }>["snap"]> | null = null;
    const snap = () => {
      if (boxes !== null) return boxes;
      const up = (b: Box): Box => [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L];
      const ends = (a: { from: P; to: P; curve?: { points: { at: P }[] }; angle?: number }): Box => {
        if (a.angle) return shapeBounds(a);
        const ps = [a.from, a.to, ...(a.curve?.points.map((q) => q.at) ?? [])];
        return [Math.min(...ps.map((q) => q[0])), Math.min(...ps.map((q) => q[1])), Math.max(...ps.map((q) => q[0])), Math.max(...ps.map((q) => q[1]))];
      };
      const ink = (g: Iterable<number>) => { const b = withCaptions(g); return b && up(b); };
      const textOf = new Map((doc.captions ?? []).map((c) => [c.id, c]));
      const moves = (id: number) => {
        const c = textOf.get(id);
        return picks0.has(id) || !!(c && ((c.under?.length && c.under.every((i) => atoms0.has(i))) || (c.on && picks0.has(c.on.arrow)) || (c.cycle && picks0.has(c.cycle.cycle))));
      };
      const things = [...arrows.filter((a) => !isOrbital(a)), ...(doc.shapes ?? [])];
      const movingBox = union([...(atoms0.size ? [ink(atoms0)] : []), ...placed.filter((c) => c.id !== DRAFT && moves(c.id)).map((c) => up(c.box)), ...things.filter((a) => picks0.has(a.id)).map(ends)].filter((b): b is Box => !!b));
      const targets = movingBox ? [
        ...fragments(doc).filter((g) => copies || !g.some((i) => atoms0.has(i))).map(ink),
        ...placed.filter((c) => c.id !== DRAFT && (copies || !moves(c.id))).map((c) => up(c.box)),
        ...things.filter((a) => copies || !picks0.has(a.id)).map(ends),
      ].filter((b): b is Box => !!b) : [];
      return (boxes = movingBox ? { moving: movingBox, targets } : undefined);
    };
    setDrag({ kind: "move", from: p, working: base, moved: false, start: screen, target: t, guides: [], captions, arrows: arrowIds, cycles: cycleIds, snap, ...(copies || alone ? { base, atoms } : {}) });
  };
  // A press on a cycle's arrows picks the cycle with all its parts (cycleParts, and the rest of an integral group it is
  // in), and grabs them.
  function pressCycle(p: P, t: Hover, screen: [number, number], copy = false) {
    const c = doc.cycles?.find((x) => x.id === t.cycle);
    if (!c) return;
    if (t.branch !== undefined) return pressBranch(p, t, screen);
    const [own, text] = cycleParts(c), [atoms, picks] = wholeIntegral(doc, new Set(own), new Set([c.id, ...text]));
    stepAgain.current = tool === "select" && picked.has(c.id) ? t.step : undefined;
    if (stepAgain.current === undefined) setStepPick(undefined);
    setBranchPick(undefined);
    setCycleStep({ cycle: c.id, step: t.step ?? 0 });
    setSelection(atoms);
    setPicked(picks);
    startMove(p, screen, t, picks, atoms, copy);
  }
  // A press on a cycle's side arrow picks that side arrow on its own and grabs the end of the half pressed (a click leaves
  // it picked).
  function pressBranch(p: P, t: Hover, screen: [number, number]) {
    setSelection(new Set());
    setPicked(new Set([t.cycle!]));
    setStepPick(undefined);
    setBranchPick({ cycle: t.cycle!, branch: t.branch! });
    setCycleStep({ cycle: t.cycle!, step: t.step ?? 0 });
    setDrag({ kind: "handle", id: t.cycle!, which: `end:${t.part ?? "in"}`, branch: t.branch, working: doc, from: p, start: screen });
  }
  // A press on a caption or arrow picks it (Shift adds it), with the rest of an integral group it is in, and grabs it.
  function pressCaption(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const id = (t.caption ?? t.arrow)!;
    if (picked.has(id) && !shift) return startMove(p, screen, t, picked, selection, copy);
    const [atoms, picks] = wholeIntegral(doc, shift ? selection : new Set<number>(), new Set(shift ? [...picked, id] : [id]));
    setPicked(picks);
    setSelection(atoms);
    startMove(p, screen, t, picks, atoms, copy);
  }

  function pressSelect(p: P, t: Hover, shift: boolean, screen: [number, number], copy = false) {
    const ids = atomsOf(doc, t), its = itemsOf(t);
    // Sam (28 October 2026): a press on any part of a group picks the whole (outermost) group (Shift adds it) and
    // moves it; a press on a part already picked (by a double-click, pickPart) moves that part within its group.
    if (selectKind !== "perspective" && groupsOf(doc, new Set(ids), new Set(its)).length) {
      if (!shift && ids.every((i) => selection.has(i)) && its.every((x) => picked.has(x))) return startMove(p, screen, t, picked, selection, copy);
      const [ga, gi] = withGroups(new Set(ids), new Set(its)), atoms = new Set([...(shift ? selection : []), ...ga]), picks = new Set([...(shift ? picked : []), ...gi]);
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms, copy);
    }
    // Structure Perspective: a press on the selection, or on a structure, tilts it through 3D as the pointer moves.
    if (selectKind === "perspective" && (ids.length || (selection.size && onSelection(doc, selection, p)))) {
      const on = selection.size && (onSelection(doc, selection, p) || ids.some((i) => selection.has(i)));
      const [set3, picks3] = wholeIntegral(doc, new Set(on ? [...selection] : (fragments(doc).find((g) => g.includes(ids[0])) ?? ids)), new Set());
      setSelection(set3);
      setPicked(picks3);
      const hinge = hingeOf(doc, set3), ps = [...set3].map((i) => doc.atoms[i].location);
      const centre: [number, number, number] = [0, 1, 2].map((k) => (Math.min(...ps.map((q) => q[k] ?? 0)) + Math.max(...ps.map((q) => q[k] ?? 0))) / 2) as [number, number, number];
      return setDrag({ kind: "tilt", base: doc, ids: set3, centre, start: screen, hinge, working: doc });
    }
    if (t.cycle !== undefined) return pressCycle(p, t, screen, copy);
    if (t.caption !== undefined || t.arrow !== undefined) return pressCaption(p, t, shift, screen, copy);
    if (!shift && (selection.size || picked.size) && onSelection(doc, selection, p)) return startMove(p, screen, t, picked, selection, copy);
    if (ids.length) {
      const atoms = new Set(shift ? [...selection, ...ids] : ids), picks = shift ? picked : new Set<number>();
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms, copy);
    }
    // A press anywhere inside the frame of a selected group moves the whole group.
    const f = frameBox(views.get().zoom);
    if (!shift && f && p[0] >= f[0] && p[0] <= f[2] && p[1] >= f[1] && p[1] <= f[3] && groupsOf(doc, selection, picked).length) {
      const [ga, gi] = withGroups(selection, picked);
      setSelection(ga);
      setPicked(gi);
      return startMove(p, screen, t, gi, ga, copy);
    }
    const base = shift ? selection : new Set<number>(), picks = shift ? picked : new Set<number>();
    setSelection(base);
    setPicked(picks);
    startArea(p, t, base, picks);
  }

  // Selects atoms and objects, with the whole of any integral group they touch: one cannot be split (as in ChemDraw,
  // where selecting any part of it selects all of it).
  const choose = (atoms: Iterable<number>, items: Iterable<number>) => {
    const [a, i] = wholeIntegral(doc, new Set(atoms), new Set(items));
    setSelection(a);
    setPicked(i);
  };
  // What a selection area (inside: whether a point is in it) takes in: also each cycle whose circle it takes in, or all
  // of whose intermediates it does, with all its parts. A side arrow it takes in whole, with no atoms and no text but
  // its own, is picked.
  const chooseArea = (atoms: Set<number>, items: number[], inside: (q: P) => boolean) => {
    const node = (c: Cycle, n: number[], j: number) => (n.length ? n.every((i) => atoms.has(i)) : items.includes(textOn(doc, c, j)?.id ?? NaN));
    const cycles = (doc.cycles ?? []).filter((c) => Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8).every((a) => inside([c.centre[0] + c.radius * Math.cos(a), c.centre[1] + c.radius * Math.sin(a)]))
      || (c.nodes.some((n, j) => n.length || textOn(doc, c, j)) && c.nodes.every((n, j) => node(c, n, j) || (!n.length && !textOn(doc, c, j)))));
    // Its whole path taken in, with no atoms, and no text but its own.
    const whole = (b: CycleLayout["branches"][number]) => cycleArrows.filter((a) => a.cycle === b.cycle && a.branch === b.branch).every((a) => arrowTrace(a, L).paths.every((q) => q.every((x) => inside([x[0] / L, -x[1] / L]))));
    const own = (b: CycleLayout["branches"][number]) => items.every((x) => doc.captions?.some((t) => t.id === x && t.cycle?.cycle === b.cycle && t.cycle.branch === b.branch));
    const parts = cycles.map(cycleParts), bs = cycles.length || atoms.size ? [] : cycleLayout.branches.filter((b) => whole(b) && own(b));
    setStepPick(undefined);
    setBranchPick(bs.length === 1 ? { cycle: bs[0].cycle, branch: bs[0].branch } : undefined);
    if (bs.length === 1) return choose([], [bs[0].cycle]);
    choose([...atoms, ...parts.flatMap((x) => x[0])], [...items, ...cycles.map((c) => c.id), ...parts.flatMap((x) => x[1])]);
  };
  // A selection area: a box, or a lasso, as the Select tool is set.
  function startArea(p: P, t: Hover, base: Set<number>, picks = new Set<number>()) {
    if (selectKind === "lasso") setDrag({ kind: "lasso", points: [p], base, picks, target: t, moved: false });
    else setDrag({ kind: "box", from: p, to: p, base, picks, target: t, moved: false });
  }
  // The captions and arrows whose middle is inside a selection area (drawing coordinates). Shapes are containers:
  // the area picks one when it crosses the shape's frame or takes in its middle, never when the area lies wholly
  // inside the shape, so a structure in a box can be picked on its own. corners: the area's outline points.
  const captionsWhere = (inside: (q: P) => boolean, corners: P[]) => [
    ...placed.filter((c) => c.id !== DRAFT && inside([(c.box[0] + c.box[2]) / 2 / L, -(c.box[1] + c.box[3]) / 2 / L])).map((c) => c.id),
    ...arrows.filter((a) => {
      const [f, t] = a.curve ? curveBox(a.curve) : [a.from, a.to];
      return inside([(f[0] + t[0]) / 2, (f[1] + t[1]) / 2]);
    }).map((a) => a.id),
    ...(doc.shapes ?? []).filter((sh) => {
      const b = shapeBounds(sh), lo = [b[0], b[1]], hi = [b[2], b[3]];
      const within = (q: P) => inShape(sh, q);
      const into = corners.filter(within).length;
      if (into === corners.length) return false; // drawn inside the shape
      // Takes in its middle, or crosses its frame: a corner inside, or (a box area) running right through it.
      const xs = corners.map((q) => q[0]), ys = corners.map((q) => q[1]);
      const through = corners.length === 4 && Math.min(...xs) < hi[0] && Math.max(...xs) > lo[0] && Math.min(...ys) < hi[1] && Math.max(...ys) > lo[1];
      return inside([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]) || into > 0 || through;
    }).map((sh) => sh.id),
  ];
  // A picked caption's width handle (ChemDraw's): on the side its lines run to, level with its middle, just outside its
  // width (or the end of its longest line, when it has no width). Drag it to wrap the caption.
  const HANDLE_GAP = 0.35; // em: the handle's clearance from the text
  const widthHandle = (): { id: number; at: P; c: Placed } | undefined => {
    const ids = [...picked], c = ids.length === 1 && !selection.size ? placed.find((x) => x.id === ids[0]) : undefined, w = c && shown.captions?.find((x) => x.id === c.id)?.width;
    if (!c || writing || c.angle) return undefined; // a turned caption keeps its width (its handle would not turn with it)
    const x = c.lines[0].x, k = w ? w * L : 0, m = HANDLE_GAP * c.size;
    const hx = c.anchor === "end" ? (w ? x - k : c.box[0]) - m : (c.anchor === "middle" ? (w ? x + k / 2 : c.box[2]) : w ? x + k : c.box[2]) + m;
    return { id: c.id, at: [hx / L, -(c.box[1] + c.box[3]) / 2 / L], c };
  };
  // A cycle's side arrows' handles (where each meets the arc and its ends): every one's while the Cycle tool is over the
  // cycle, or when the cycle is picked on its own; the picked side arrow's alone, or the one whose text is picked.
  const branchHandles = (): CycleLayout["branches"] => {
    if (writing || tool === "erase") return [];
    const over = tool === "cycle" ? overs.get().cycle : undefined, alone = picked.size === 1 && !selection.size ? [...picked][0] : undefined, one = loneCycle();
    const t = alone === undefined ? undefined : shown.captions?.find((x) => x.id === alone)?.cycle, sb = t && isSide(t) ? branchOf(shown, t) : undefined;
    const mine = (b: CycleLayout["branches"][number]) => (sb ? b.cycle === sb.c.id && b.branch === sb.b.id : b.cycle === one && stepPick?.cycle !== one && (branchPick?.cycle !== one || b.branch === branchPick.branch));
    return cycleLayout.branches.filter((b) => b.cycle === over || mine(b));
  };
  // A cycle's step handles (lead, trail and bow): every drawn step's while the Cycle tool is over the cycle, or when the
  // cycle is picked on its own; the picked step's alone.
  const stepHandles = (): { c: Cycle; steps: number[] } | undefined => {
    if (writing || tool === "erase") return undefined;
    const one = doc.cycles?.find((x) => x.id === loneCycle()), id = tool === "cycle" ? overs.get().cycle ?? one?.id : one?.id, c = doc.cycles?.find((x) => x.id === id);
    if (!c) return undefined;
    const pick = c === one && stepPick?.cycle === c.id ? stepPick.step : undefined;
    if (c === one && branchPick?.cycle === c.id && overs.get().cycle !== c.id) return undefined;
    return { c, steps: cycleLayout.spans.filter((s) => s.cycle === c.id && s.to > s.from && !c.steps?.[s.step]?.hidden && (pick === undefined || s.step === pick)).map((s) => s.step) };
  };
  // The handle of the one picked arrow under a point: its ends, and the middle of a curved one.
  const handleAt = (p: P): { id: number; which: Corner; step?: number; branch?: number } | undefined => {
    const ids = [...picked], a = ids.length === 1 && !selection.size ? arrows.find((x) => x.id === ids[0]) : undefined;
    const near = (q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) * L * views.get().zoom < 8;
    for (const b of branchHandles()) for (const which of ["meet", "end:in", "end:out"] as const) { const q = which === "meet" ? b.T : b[which === "end:in" ? "in" : "out"]; if (q && near(q)) return { id: b.cycle, which, branch: b.branch }; }
    const sh = stepHandles();
    if (sh) for (const which of ["lead", "trail", "bow"] as const) for (const s of cycleLayout.spans) if (s.cycle === sh.c.id && sh.steps.includes(s.step) && near(s[which])) return { id: sh.c.id, which, step: s.step };
    const wh = widthHandle();
    if (wh && near(wh.at)) return { id: wh.id, which: "width" };
    // A picked pen curve's anchors, then their handles; a fragmentation line's corners and ends.
    if ((a?.kind === "curve" || a?.kind === "cut") && a.curve) {
      const i = a.curve.points.findIndex((q) => near(q.at));
      if (i >= 0) return { id: a.id, which: `p${i}:at` };
      for (const [k, q] of a.curve.points.entries()) for (const part of ["c1", "c2"] as const) { const h = q[part]; if (h && near(h)) return { id: a.id, which: `p${k}:${part}` }; }
      return undefined;
    }
    if (!a) return undefined;
    const barb = headBarb(a, frame, L);
    return near(a.to) ? { id: a.id, which: "to" } : near(a.from) ? { id: a.id, which: "from" } : (curved(a) || a.point) && near(bendPoint(a)) ? { id: a.id, which: "bend" }
      : barb && near([barb[0] / L, -barb[1] / L]) ? { id: a.id, which: "head" } : pointable(a) && !a.point && near(bendPoint(a)) ? { id: a.id, which: "add" } : undefined;
  };
  // The end of an arrow or line under a point, or its middle where it has a point (a curved arrow always does), as
  // the exact place a joined arrow starts from.
  const joinAt = (p: P): P | undefined => {
    const near = (q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]) * L * views.get().zoom < 8;
    for (const a of [...arrows].reverse()) {
      if (isOrbital(a) || a.kind === "cut") continue;
      const spots: [number, number][] = [a.to, a.from, ...((curved(a) || a.point) ? [bendPoint(a)] : [])];
      const hit = spots.find(near);
      if (hit) return [hit[0], hit[1]];
    }
    return undefined;
  };
  // The one pen curve picked, if it is one.
  const pickedCurve = () => (picked.size === 1 && !selection.size ? doc.arrows?.find((a) => picked.has(a.id) && a.kind === "curve" && a.curve) : undefined);
  // Straight arrows and lines that can take a point in their middle, to bend and branch from.
  const pointable = (a: Arrow) => (straightArrow(a) || a.kind === "line") && a.kind !== "block" && a.kind !== "retro";
  // The frame round the selection (px, y down) with its resize handles (resize.ts) and its rotation handle, by one
  // rule for every kind of selection: atoms, text, arrows, shapes, cycles, groups or a mix, as ChemDraw's selection
  // frame. It holds what is chosen as drawn (drawnBox), part of a group with the whole group. A lone straight arrow keeps its own
  // end handles and shows only the rotation handle (handles: false), and one atom of a structure gets none. corners:
  // text alone has corner handles only, as a stretch does not change text. turns: two or more things (a group is its
  // parts), or one arrow, curve or shape that can turn; one caption, table, TLC plate or atom alone does not turn.
  // Worked out once for each selection, as the pointer tests the handles on every move. It stays while the centre
  // mark is dragged (pivot), so the mark shows where it goes.
  const framing = !drag || drag.kind === "pivot";
  const selectionFrame = useMemo(() => {
    if (!framing) return undefined;
    // The frame holds what its handles turn and scale: the selection with its groups (chosen).
    const [atoms, items] = withGroups(selection, new Set([...picked].filter((id) => id !== DRAFT))), ids = [...items], grown = atoms.size + items.size > selection.size + picked.size;
    const arrow = ids.length === 1 && !atoms.size ? arrows.find((x) => x.id === ids[0]) : undefined;
    if (!items.size && (!atoms.size || (atoms.size === 1 && neighbours(doc, [...atoms][0]).length))) return undefined;
    const box = drawnBox(atoms, items);
    const turning = atoms.size + ids.length >= 2 || !!arrow || !!doc.shapes?.some((x) => x.id === ids[0] && turns(x));
    return box && { box, handles: !arrow || arrow.kind === "curve", corners: !grown && textAlone(), turns: turning };
  }, [framing, selection, picked, drawing, placed, arrows, cycleArrows, shown.shapes]); // eslint-disable-line react-hooks/exhaustive-deps
  // The frame in drawing units (y up), 4 px clear of what it holds at this zoom, and the handles it shows: the side
  // handles only when that side is long enough on screen to hold them apart.
  const frameBox = (zoom: number): RBox | undefined => {
    const f = selectionFrame, pad = 4 / zoom;
    return f && [(f.box[0] - pad) / L, -(f.box[3] + pad) / L, (f.box[2] + pad) / L, -(f.box[1] - pad) / L];
  };
  const frameSides = (b: RBox, zoom: number) => SIDES.filter((h) => selectionFrame?.handles && (isCorner(h) || (!selectionFrame.corners && ((h === "n" || h === "s" ? b[2] - b[0] : b[3] - b[1]) * L * zoom >= 30))));
  const resizeAt = (p: P): Side | undefined => {
    const zoom = views.get().zoom, b = tool !== "erase" ? frameBox(zoom) : undefined, f = selectionFrame?.box;
    return b && sideAt(b, frameSides(b, zoom), p, 6 / (L * zoom), f && [f[0] / L, -f[3] / L, f[2] / L, -f[1] / L]);
  };
  // The rotation handle, as in ChemDraw: just off the frame's top right corner (px).
  const turnHandle = (zoom: number): P | undefined => {
    const b = frameBox(zoom);
    return b && selectionFrame!.turns ? [b[2] * L + 14 / zoom, -b[3] * L - 14 / zoom] : undefined;
  };
  const onTurnHandle = (p: P) => { const zoom = views.get().zoom, h = turnHandle(zoom); return !!h && Math.hypot(p[0] * L - h[0], -p[1] * L - h[1]) * zoom < 11; };
  // The centre mark: where the selection turns about, worked out once for each selection and drawing.
  const centreMark = useMemo(() => (selectionFrame?.turns ? turnCentre() : undefined), [selectionFrame, pivot, doc]); // eslint-disable-line react-hooks/exhaustive-deps
  const onCentreMark = (p: P) => !!centreMark && Math.hypot(p[0] - centreMark[0], p[1] - centreMark[1]) * L * views.get().zoom < 8;

  // What a pick for a template set takes from what is under the pointer: the whole structure (with its captions, as
  // selecting it would), or the object, with the rest of any integral group it is in.
  const pickOf = (h: Hover): [Set<number>, Set<number>] | undefined => {
    const atoms = atomsOf(doc, h), items = itemsOf(h), cycle = doc.cycles?.find((c) => c.id === h.cycle);
    if (!atoms.length && !items.length) return undefined;
    return wholeIntegral(doc, new Set([...fragments(doc).filter((g) => g.some((i) => atoms.includes(i))).flat(), ...(cycle?.nodes.flat() ?? [])]), new Set(items));
  };
  // A pick stops when a press lands anywhere but the canvas.
  useEffect(() => {
    if (!templatePick) return;
    const away = (e: PointerEvent) => { if (!(e.target as Element).closest?.(".canvas")) setTemplatePick(undefined); };
    addEventListener("pointerdown", away, true);
    return () => removeEventListener("pointerdown", away, true);
  }, [templatePick]);
  // Drop places for a selection dragged off the canvas (data-drop-set): the open template set in the library, a set's
  // name there, and the Ring and Template tools. The one under the pointer shows it takes the drop.
  const dropOver = useRef<HTMLElement>(undefined);
  const markDrop = (el?: HTMLElement) => {
    if (dropOver.current === el) return;
    dropOver.current?.removeAttribute("data-over");
    el?.setAttribute("data-over", "");
    dropOver.current = el;
  };
  // Right-click (Control-click on the Mac): what is under the pointer is selected, unless it is selected already, and
  // the Actions menu opens there. On a TLC plate the plate is picked, with the spot under the pointer. On a cycle's arc,
  // the cycle is picked, and its actions go on that step; on the arc of a cycle picked already, the step is picked (as
  // a second click picks it); on a side arrow, the side arrow.
  function onContextMenu(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault();
    if (noMenu.current || drag || writing) { noMenu.current = false; return; }
    // On a warning's red mark, its atom, bond or brackets, as ChemDraw's right-click on the red box.
    const p = toDoc(e.clientX, e.clientY), under = hit(p), mark = Object.values(under).every((v) => v === undefined) ? problemAt(shown, found, p) : undefined;
    const t: Hover = mark ? (mark.shape !== undefined ? { arrow: mark.shape } : { atom: mark.atom, bond: mark.bond }) : under, free = t.atom === undefined && t.bond === undefined && t.caption === undefined && t.cycle === undefined;
    const plate = free && (t.arrow === undefined || doc.shapes?.some((x) => x.id === t.arrow && x.kind === "tlc")) ? plateAt(p) : undefined;
    if (plate) {
      const k = spotHit(plate, p);
      setSelection(new Set());
      setPicked(new Set([plate.id]));
      setSpotPick(k >= 0 ? { plate: plate.id, index: k } : undefined);
      setLanePick({ plate: plate.id, lane: laneOf(plate, p) });
    } else {
      const found: Hover = free && t.arrow === undefined ? { arrow: highlightAt(p) ?? orbitalAt(p) } : t;
      const atoms = atomsOf(doc, found), items = itemsOf(found), cycle = doc.cycles?.find((c) => c.id === found.cycle), [own, text] = cycle ? cycleParts(cycle) : [[], []];
      const on = atoms.length || items.length ? atoms.every((i) => selection.has(i)) && items.every((x) => picked.has(x)) : selection.size > 0 && onSelection(doc, selection, p);
      if (cycle) setCycleStep({ cycle: cycle.id, step: found.step ?? 0 });
      if (cycle && (found.branch !== undefined || (on && found.step !== undefined))) {
        setSelection(new Set());
        setPicked(new Set([cycle.id]));
        setStepPick(found.branch === undefined ? { cycle: cycle.id, step: found.step! } : undefined);
        setBranchPick(found.branch !== undefined ? { cycle: cycle.id, branch: found.branch } : undefined);
      } else if (!on) choose([...atoms, ...own], [...items, ...text]);
    }
    setMenuAt({ x: e.clientX, y: e.clientY });
  }
  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    stopCamera(); // what is drawn is where the press lands
    joinNext.current = undefined;
    // The middle button (the wheel) drags the view with every tool, as in Figma and Sketch. Its default (Windows'
    // autoscroll, Linux's paste) does not run.
    if (e.button === 1) {
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
      panFrom.current = [e.clientX, e.clientY];
      return setPanning(true);
    }
    if (e.button !== 0) return;
    // Linking a measured multiplet: a click on an atom or bond links it (or, a second time, unlinks it); anywhere else
    // stops.
    if (chosenGroup !== undefined) {
      const t = hit(toDoc(e.clientX, e.clientY));
      if (t.atom !== undefined) return linkTo(chosenGroup, [t.atom]);
      if (t.bond !== undefined) return linkTo(chosenGroup, [], [t.bond]);
      setChosenGroup(undefined);
    }
    // Picking a structure for a template set (Add with nothing selected): a click on a structure or object adds it.
    if (templatePick && !(MAC && e.ctrlKey)) {
      const p = toDoc(e.clientX, e.clientY), t = hit(p), free = t.atom === undefined && t.bond === undefined && t.caption === undefined && t.cycle === undefined;
      const part = pickOf(free && t.arrow === undefined ? { arrow: highlightAt(p) ?? orbitalAt(p) } : t);
      if (!part) return;
      setTemplatePick(undefined);
      setHover({});
      return addPart(extractSelection(doc, ...part, drawnAt, drawnAlign), templatePick.set, templatePick.tool);
    }
    // On the Mac a Control-click is the right-click (onContextMenu): the press does nothing more, but on a resize handle.
    if (MAC && e.ctrlKey) {
      if (!resizeAt(toDoc(e.clientX, e.clientY))) return;
      noMenu.current = true;
    }
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
    const p = toDoc(e.clientX, e.clientY), t = hit(p), screen: [number, number] = [e.clientX, e.clientY];
    pointer.current = p;
    pressAlt.current = e.altKey;
    // Option-drag (Ctrl- or Alt-drag on Windows and Linux) moves copies (keys.ts copyDrag). Option-click still takes
    // out of the selection (pressMods.alt); Ctrl-click on Windows and Linux adds to it, as Shift-click does.
    const copy = copyDrag(e);
    pressCtrlCopy.current = !MAC && e.ctrlKey;
    // A press on a TLC plate's lane makes it the lane the plate's lane actions act on.
    const lanePlate = tool === "select" || tool === "tlc" ? plateAt(p) : undefined;
    if (lanePlate) setLanePick({ plate: lanePlate.id, lane: laneOf(lanePlate, p) });
    if (hovers.get().key) setHover(t); // a press takes over from the keyboard hotspot
    // The crosshair's middle drags it, whatever tool is in hand (a structure or object there comes first).
    if (onCrosshair(p, t)) return setDrag({ kind: "crosshair", from: cross!, at: cross! });
    // Shift with the Arrow tool over an arrow's end, or its middle point, starts a new arrow joined there.
    const join = tool === "arrow" && e.shiftKey ? joinAt(p) : undefined;
    if (join) { setSelection(new Set()); setPicked(new Set()); overs.set({ ...overs.get(), join: undefined }); return setDrag({ kind: "arrow", from: join, start: screen, target: {} }); }
    // A drag on a mark with Select (Shift-drag with the Symbols tool) moves it round its atom, as in ChemDraw. On a
    // selected atom a press moves the selection, and a Shift-drag moves the mark.
    // A picked object's handle comes before a mark under it (a curved arrow's tail on a lone pair).
    const handle = tool !== "erase" ? handleAt(p) : undefined;
    const mark = handle && handle.which !== "add" ? undefined : t.mark !== undefined ? { atom: t.atom!, mark: t.mark } : ((tool === "select" && selectKind !== "perspective") || (e.shiftKey && tool === "symbol")) && arrowEndAt(p) === undefined ? markNear(drawing.electrons, doc, p, L) : undefined;
    if (mark && tool === "select") pressMods.current = { shift: addsToSelection(e), alt: e.altKey, atoms: selection, picks: picked };
    if (mark && t.mark === undefined && tool === "select" && !e.shiftKey) return startMove(p, screen, { atom: mark.atom }, picked, selection, copy);
    if (mark) return setDrag({ kind: "mark", atom: mark.atom, key: mark.mark, start: screen, base: doc, working: doc });
    // The middle mark: a press moves the arrow as usual; a click (no move) gives it its point.
    addPoint.current = handle?.which === "add" ? handle.id : undefined;
    // With Edit curve, Option-click takes an anchor out (a curve keeps two).
    if (handle && editCurve && e.altKey && handle.which.endsWith(":at")) {
      const a = doc.arrows?.find((x) => x.id === handle.id);
      return a?.curve && a.curve.points.length > 2 ? set(updateArrow(doc, a.id, withCurve(removeCurvePoint(a.curve, Number(handle.which.slice(1, -3))))), true) : undefined;
    }
    if (handle && handle.which !== "add") return setDrag({ kind: "handle", ...handle, working: doc, from: p, start: screen });
    // Option-drag on the centre mark moves the centre the selection turns about (it snaps to atoms).
    if (tool !== "erase" && e.altKey && onCentreMark(p)) {
      if (tool === "select") pressMods.current = { shift: addsToSelection(e), alt: true, atoms: selection, picks: picked };
      return setDrag({ kind: "pivot", start: screen, target: t, at: p, moved: false });
    }
    // A resize handle: the drag scales what is chosen. Its soft stops: 100%, and the median bond at the document's
    // bond length.
    const side = resizeAt(p);
    if (side) {
      const frame = frameBox(views.get().zoom)!, { atoms, items, whole } = chosen(), median = medianBond(doc, atoms), plot = lonePlot(doc, atoms, items);
      return setDrag({ kind: "resize", side, frame, atoms, items, middles: captionMiddles(), stops: [1, ...(median ? [1 / median] : [])], size: [1, 1], anchor: pivot ?? handlePoint(frame, side), whole, labels: scalesText(), lines: scalesText(), working: doc, ...(plot ? { plot: plot.id } : {}) });
    }
    // Edit curve keeps its curve picked: a click on the curve adds a point there, a click away adds one at its end.
    editPress.current = editCurve ? pickedCurve()?.id : undefined;
    if (editCurve && editPress.current !== undefined && t.arrow === undefined && t.caption === undefined && t.atom === undefined) return setDrag({ kind: "click", at: p, start: screen, target: t });
    if (tool !== "erase" && onTurnHandle(p)) {
      const centre = turnCentre();
      return setDrag({ kind: "turn", centre, middles: captionMiddles(), start: Math.atan2(p[1] - centre[1], p[0] - centre[0]), degrees: 0, working: doc });
    }
    const page = edgePage(p, t);
    if (page) return fitPage(page);
    // A TLC lane's origin tick drags the lane to another place among the lanes (ChemDraw's way to order lanes), with
    // Select or the TLC tool.
    const tick = lanePlate ? tickAt(lanePlate, p) : undefined;
    if (lanePlate && tick !== undefined) {
      setSelection(new Set());
      setPicked(new Set([lanePlate.id]));
      return setDrag({ kind: "lane", plate: lanePlate.id, from: tick, to: tick, base: doc, working: doc });
    }
    if (tool === "select") {
      // Ctrl-click on Windows and Linux adds as Shift-click does, when the click ends (click, pressMods.shift). Its
      // press is Ctrl-drag's, which moves a copy, but on bare canvas, where it starts a box that adds, as Shift's does.
      const adds = addsToSelection(e), bare = adds && !atomsOf(doc, t).length && !itemsOf(t).length && !((selection.size || picked.size) && onSelection(doc, selection, p));
      pressMods.current = { shift: adds, alt: e.altKey, atoms: selection, picks: picked };
      return pressSelect(p, t, e.shiftKey || bare, screen, copy);
    }
    // The Pen: each press places a point (drag for a smooth one); pressing the first point again closes the curve.
    if (tool === "shape" && "pen" in shapePick) {
      if (pen && pen.length >= 2 && Math.hypot(p[0] - pen[0].at[0], p[1] - pen[0].at[1]) * L * views.get().zoom < 8) return finishPen(true);
      setDrag({ kind: "pen", at: p, start: screen });
      return startHold(p, t, screen);
    }
    // With the Table tool, a border drags to size its column or row (the left and top edges size them all), and a
    // click inside a cell opens it. A hold there gives Select, as with every tool.
    if (tool === "table" && tableEdge(p)) {
      const { sh, axis, index } = tableEdge(p)!;
      setSelection(new Set());
      setPicked(new Set([sh.id]));
      setDrag({ kind: "tableedge", id: sh.id, axis, index, base: doc, working: doc });
      return startHold(p, t, screen);
    }
    if (tool === "table" && tableAt(p)) { setDrag({ kind: "click", at: p, start: screen, target: t }); return startHold(p, t, screen); }
    // With something selected, a press on it (or inside it) grabs it, whatever tool is in hand. So does a press
    // on a caption, except with the Text tool, which edits it.
    if (tool !== "erase" && selection.size && onSelection(doc, selection, p)) return startMove(p, screen, t);
    // The Cycle tool moves a structure (whole) or text as Select does, so it can go on to a cycle or off it. Side arrow:
    // a click (no drag) on a free structure or text beside a step makes it that step's reagent or product (click).
    if (tool === "cycle" && t.caption !== undefined) return pressCaption(p, t, false, screen);
    if (tool === "cycle" && (t.atom !== undefined || t.bond !== undefined)) {
      const [atoms, picks] = wholeIntegral(doc, new Set(fragments(doc).find((g) => g.includes(t.atom ?? doc.bonds[t.bond!].atoms[0]))), new Set());
      setSelection(atoms);
      setPicked(picks);
      return startMove(p, screen, t, picks, atoms);
    }
    if (tool === "cycle" && t.branch !== undefined) return pressBranch(p, t, screen);
    if (tool === "cycle") { setDrag({ kind: "cycle", from: p, start: screen, target: t, shift: e.shiftKey }); return startHold(p, t, screen); }
    if (tool !== "erase" && tool !== "text" && t.cycle !== undefined) return pressCycle(p, t, screen);
    // A tool that works on an atom (bond, chain, ring, template, symbol), pressed on a caption that counts as chemistry
    // (Bi, Rh, OMe), makes it that atom and goes on from it, as one undo step. ChemDraw joins bonds to a caption it
    // reads chemically (Interpret Chemically).
    const asAtom = !e.shiftKey && t.caption !== undefined && ATOM_TOOLS.has(tool) ? doc.captions?.find((c) => c.id === t.caption && chemicalCaption(c, style.interpret)) : undefined;
    const key = asAtom && `element ${++elementSteps}`;
    if (asAtom && key && makeElements([asAtom], key, false)) {
      joinNext.current = key;
      const at: Hover = { atom: doc.atoms.length };
      pressTool(p, at, screen, e.altKey, { meta: MOD === "⌘" ? e.metaKey : e.ctrlKey, shift: e.shiftKey });
      return startHold(p, at, screen);
    }
    // Mass spec analysis: a press on an end of a fragmentation line makes the line longer (pressTool), not moves it.
    const lineEnd = tool === "massspec" && cutEndAt(doc.arrows ?? [], p, 8 / L / views.get().zoom);
    if (tool !== "erase" && tool !== "text" && !lineEnd && (t.caption !== undefined || t.arrow !== undefined)) return pressCaption(p, t, e.shiftKey, screen);
    // With the TLC tool, a spot or a line on a plate drags, and a click adds a spot. A hold gives Select.
    if (tool === "tlc" && plateAt(p)) {
      const sh = plateAt(p)!;
      if (spotHit(sh, p) >= 0 || lineHit(sh, p)) spotAt(sh, p, screen, e.altKey, e.shiftKey);
      else setDrag({ kind: "click", at: p, start: screen, target: t });
      return startHold(p, t, screen);
    }
    // The eraser takes a TLC spot off its plate, and a click inside a lane takes the lane away (as ChemDraw's). A lane
    // whose last spot is erased goes too, as in ChemDraw.
    if (tool === "erase" && plateAt(p) && spotHit(plateAt(p)!, p) >= 0) {
      const sh = plateAt(p)!, i = spotHit(sh, p), lane = sh.tlc!.spots[i].lane, left = { ...sh, tlc: { ...sh.tlc!, spots: sh.tlc!.spots.filter((_, k) => k !== i) } };
      return set(updateShape(doc, sh.id, left.tlc.spots.some((x) => x.lane === lane) ? { tlc: left.tlc } : deleteLane(left, lane)));
    }
    if (tool === "erase" && t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && plateAt(p) && (plateAt(p)!.tlc?.lanes ?? 1) > 1) {
      const sh = plateAt(p)!;
      return set(updateShape(doc, sh.id, deleteLane(sh, laneOf(sh, p))));
    }
    // Pressing away from the selection with a drawing tool clears it. On empty canvas that is all the press does, so
    // the next press draws (Sam, 19 October 2026; ChemDraw also draws). A hold still gives Select.
    if (selection.size || picked.size) {
      setSelection(new Set());
      setPicked(new Set());
      if (t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && t.cycle === undefined) return startHold(p, t, screen);
    }
    // A bond tool's Shift-drag moves the atom (or bond) pressed, as ChemDraw's does. Dropped on a neighbour, the atom
    // joins it, so a ring loses an atom (Reducing Ring Size).
    if (tool === "bond" && e.shiftKey && (t.atom !== undefined || t.bond !== undefined)) return startMove(p, screen, t, new Set(), new Set(atomsOf(doc, t)), false, true);
    // Snap to Grid: a press on empty canvas starts on the grid (the new atom, the text, an arrow's or shape's start).
    pressTool(tool !== "erase" && t.atom === undefined && t.bond === undefined ? toGrid(p, e.metaKey) : p, t, screen, e.altKey, { meta: MOD === "⌘" ? e.metaKey : e.ctrlKey, shift: e.shiftKey });
    startHold(p, t, screen);
  }
  // What a press does with each drawing tool in hand: starts its drag (a click when the pointer never moves).
  function pressTool(p: P, t: Hover, screen: [number, number], alt = false, more: { meta?: boolean; shift?: boolean } = {}) {
    if (tool === "arrow") return setDrag({ kind: "arrow", from: curved({ kind: arrowKind }) ? electronAt(p, t) : p, start: screen, target: t });
    if (tool === "shape" && "line" in shapePick) {
      const make: Make = { kind: shapePick.line, ...(shapePick.sweep ? { bend: sweepBend(shapePick.sweep) } : {}), ...(shapePick.style ? { style: shapePick.style } : {}) };
      return setDrag({ kind: "arrow", from: p, start: screen, target: t, make });
    }
    if (tool === "shape" || tool === "bracket" || tool === "tlc" || tool === "table") return setDrag({ kind: "shape", from: p, start: screen, target: t });
    if (tool === "map" && t.atom !== undefined) return setDrag({ kind: "map", atom: t.atom, start: screen });
    // Mass spec analysis: a press on an end of a fragmentation line makes that line longer (ChemDraw's).
    const end = tool === "massspec" ? cutEndAt(doc.arrows ?? [], p, 8 / L / views.get().zoom) : undefined;
    if (end) return setDrag({ kind: "arrow", from: end.line[end.end], start: screen, target: t, make: { kind: "cut" }, longer: { id: end.line.id, end: end.end } });
    if (tool === "fragment" || tool === "massspec" || tool === "synthesis" || tool === "retro") return setDrag({ kind: "arrow", from: p, start: screen, target: t, make: { kind: "cut" } });
    // An orbital grows from the atom pressed (or the point) towards the pointer.
    if (tool === "orbital") return setDrag({ kind: "arrow", from: t.atom !== undefined ? pos(doc, t.atom) : p, start: screen, target: t, make: { kind: "orbital", orbital: orbitalSpec(orbitalChoice)! } });
    if (tool === "erase") return setDrag({ kind: "erase", trail: [p], bonds: new Set(), atoms: new Set(), captions: new Set(), start: screen, target: t, moved: false });
    if (tool === "bond") return setDrag({ kind: "bond", from: t.atom ?? p, at: p, start: screen, target: t, alt });
    if (tool === "chain") return setDrag({ kind: "chain", from: t.atom ?? p, start: screen, target: t, alt });
    if (tool === "ring" && ringKind in RINGS) return setDrag({ kind: "ring", from: t.atom ?? p, at: p, start: screen, target: t, alt, ...more });
    setDrag({ kind: "click", at: p, start: screen, target: t, alt });
  }
  // Every drawing tool: hold still for HOLD_MS and Select takes over until release. On the selection it moves it;
  // elsewhere it draws a box. Moving 4 px first keeps the tool (see onPointerMove).
  function startHold(p: P, t: Hover, screen: [number, number]) {
    stopHold();
    holdFrom.current = screen;
    setHolding((old) => ({ n: (old?.n ?? 0) + 1, x: screen[0], y: screen[1] }));
    hold.current = window.setTimeout(() => {
      hold.current = undefined;
      setHolding(undefined);
      setSpring(tool);
      setTool("select");
      setPop((old) => ({ n: (old?.n ?? 0) + 1, x: screen[0], y: screen[1] }));
      // On a mark, Select moves the mark, as a press with Select does.
      const mark = markNear(drawing.electrons, doc, p, L);
      if (mark && !selection.has(mark.atom)) { pressMods.current = undefined; return setDrag({ kind: "mark", atom: mark.atom, key: mark.mark, start: screen, base: doc, working: doc }); }
      const ids = atomsOf(doc, t);
      if (ids.length && ids.every((i) => selection.has(i))) return startMove(p, screen, t);
      setSelection(new Set());
      startArea(p, t, new Set());
    }, HOLD_MS);
  }

  // Where a bond (or a ring's first bond) dragged from origin toward p ends: one bond length long and at a 15° step
  // while Fixed Lengths and Fixed Angles are on (ChemDraw's), free when they are off or Option is held.
  // k: the scale of the atom the bond starts from, so a fixed length matches the bonds there.
  const fixedEnd = (origin: P, p: P, alt: boolean, k = 1): P => {
    const raw = Math.atan2(p[1] - origin[1], p[0] - origin[0]), far = Math.hypot(p[0] - origin[0], p[1] - origin[1]);
    const a = settings.fixedAngles && !alt ? Math.round(raw / SNAP) * SNAP : raw, r = settings.fixedLengths && !alt ? k : far;
    return [origin[0] + r * Math.cos(a), origin[1] + r * Math.sin(a)];
  };
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const from = panFrom.current;
    if (from) {
      panFrom.current = [e.clientX, e.clientY];
      return setView((v) => ({ ...v, x: v.x + e.clientX - from[0], y: v.y + e.clientY - from[1] }));
    }
    const p = toDoc(e.clientX, e.clientY);
    pointer.current = p;
    if (guides.rulers) pointers.set(p);
    if (hold.current && holdFrom.current && Math.hypot(e.clientX - holdFrom.current[0], e.clientY - holdFrom.current[1]) >= 4) stopHold();
    if (tool === "erase") setBrush(p);
    if (pen && !drag) setPenAt(p);
    if (!drag) {
      const t = hit(p), h = tool === "cycle" || picked.size ? handleAt(p) : undefined;
      // A cycle's handle under the pointer: actions go on its step.
      const hs = h?.step ?? (h?.branch !== undefined ? doc.cycles?.find((c) => c.id === h.id)?.branches?.find((b) => b.id === h.branch)?.step : undefined);
      if (h && hs !== undefined && (cycleStep?.cycle !== h.id || cycleStep.step !== hs)) setCycleStep({ cycle: h.id, step: hs });
      overs.set({
        selection: tool !== "erase" && selection.size > 0 && onSelection(doc, selection, p), turn: tool !== "erase" && onTurnHandle(p), edge: tool === "table" ? tableEdge(p)?.axis : undefined, resize: resizeAt(p),
        page: edgePage(p, t)?.[0], cross: onCrosshair(p, t),
        join: tool === "arrow" && e.shiftKey ? joinAt(p) : undefined,
        cycle: tool === "cycle" ? t.cycle ?? circleAt(p)?.id ?? (h?.id === overs.get().cycle ? overs.get().cycle : undefined) : undefined,
        grab: tool === "cycle" && (t.atom !== undefined || t.bond !== undefined || t.caption !== undefined),
        details: tool === "select" && t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && detailsAt(p),
      });
      // While the keyboard's focus is on the canvas (CanvasAccess), the pointer does not take the keys: VoiceOver can move
      // it to follow its cursor, and the keys act on the hotspot or the selection. A click gives the keys back to it.
      if (accessIn.current) return;
      // A keyboard hotspot stays until the pointer moves on to something other than what it was over.
      if (hovers.get().key) {
        if (nothing(t)) keyFrom.current = {};
        if (nothing(t) || sameHover(t, keyFrom.current)) return;
      }
      return setHover(t);
    }
    switch (drag.kind) {
      case "click":
        if (Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) >= 4) stopHold();
        return;
      case "crosshair": {
        // On the page's grid, a lighter step at a time from its corner (⌘ frees it); Shift keeps it to one axis.
        const step = gridOf(style.grid, mm, corner).minor;
        let q: P = e.metaKey ? p : [0, 1].map((k) => corner[k] + Math.round((p[k] - corner[k]) / step) * step) as P;
        if (e.shiftKey) q = Math.abs(q[0] - drag.from[0]) >= Math.abs(q[1] - drag.from[1]) ? [q[0], drag.from[1]] : [drag.from[0], q[1]];
        return setDrag({ ...drag, at: q });
      }
      case "bond": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        if (drag.target.bond !== undefined && drag.target.atom === undefined) return; // dragging from a bond does nothing
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from;
        const onto = hitAt(p).atom, onCaption = onto === undefined ? captionAt(p) : undefined;
        // A hydrogen bond goes from an atom to another atom, never to a new one.
        if (bondKind === "hydrogen" && (typeof drag.from !== "number" || onto === undefined || onto === drag.from)) return setDrag({ ...drag, to: undefined });
        // A caption that counts as chemistry (Rh) takes the bond's end where its atom will be.
        const c = onCaption !== undefined ? doc.captions?.find((x) => x.id === onCaption && chemicalCaption(x, style.interpret)) : undefined, cp = c && placed.find((x) => x.id === c.id);
        if (c && cp) { const [x, y] = placedAtom(c, cp).location; return setDrag({ ...drag, to: [x, y], onto: c.id }); }
        // From a metal, the middle of a ring takes the bond's end: the ring joins as an η ligand (edit.ts dragBond).
        const eta = onto === undefined && typeof drag.from === "number" ? etaRing(doc, drag.from, p) : undefined;
        if (eta) return setDrag({ ...drag, onto: undefined, to: [0, 1].map((k) => eta.reduce((s, i) => s + pos(doc, i)[k], 0) / eta.length) as P });
        return setDrag({ ...drag, onto: undefined, to: onto !== undefined && onto !== drag.from ? pos(doc, onto) : fixedEnd(origin, p, e.altKey, typeof drag.from === "number" ? scaleAt(doc, drag.from) : 1) });
      }
      case "arrow": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // A mass-fragmentation cut keeps the pointer's path: with Option held it is curved as the pointer goes, and stays.
        if (drag.make?.kind === "cut" && e.altKey) return setDrag({ ...drag, to: p, trail: [...(drag.trail ?? [drag.from]), p], alt: true });
        const cut = drag.make?.kind === "cut" ? { trail: [...(drag.trail ?? [drag.from]), p], alt: false } : {};
        // A curved arrow ends on an atom or bond; a straight one snaps to 15° steps (⌥/Alt frees it).
        if (curved({ kind: drag.make?.kind ?? arrowKind })) {
          // The arc bulges the way the drag went: the sign of the area between the pointer's path and the line.
          const to = drag.make ? p : electronAt(p, hitAt(p)), trail = [...(drag.trail ?? [drag.from]), p], ring = [...trail, to];
          let area = 0;
          for (let i = 0; i < ring.length; i++) { const [a, b] = [ring[i], ring[(i + 1) % ring.length]]; area += a[0] * b[1] - b[0] * a[1]; }
          const chord = Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]);
          const side = Math.abs(area / 2) > 0.05 * chord * chord ? (area < 0 ? 1 : -1) : (drag.side ?? 1);
          return setDrag({ ...drag, to, trail, side });
        }
        // A line with corners steps from its last corner.
        const o = drag.corners?.[drag.corners.length - 1] ?? drag.from, far = Math.hypot(p[0] - o[0], p[1] - o[1]), raw = Math.atan2(p[1] - o[1], p[0] - o[0]);
        const a = e.altKey || !settings.fixedAngles ? raw : Math.round(raw / SNAP) * SNAP, to: P = [o[0] + far * Math.cos(a), o[1] + far * Math.sin(a)];
        // Snap to Grid: a level or upright arrow ends on a grid line too (other angles keep their 15° steps).
        const turn = ((Math.round(a / SNAP) % 12) + 12) % 12, g = toGrid(to, e.metaKey || e.altKey), stepped = a !== raw || raw % SNAP === 0;
        return setDrag({ ...drag, ...cut, to: stepped && turn === 0 ? [g[0], to[1]] : stepped && turn === 6 ? [to[0], g[1]] : to });
      }
      case "map":
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, to: p });
      case "ring": {
        // The ring's first bond follows the pointer, as the bond tool's does (on to an atom there, if any). A chair
        // faces the drag, across the page or up and down. From a bond, the pointer picks the ring's side (and a
        // chair's fit); ChemDraw does nothing there.
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        if (drag.target.bond !== undefined && drag.target.atom === undefined) return setDrag({ ...drag, to: p });
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from, onto = hitAt(p).atom;
        if ((RINGS[ringKind as RingKind] as { chair?: number } | undefined)?.chair) { const a = Math.round(Math.atan2(p[1] - origin[1], p[0] - origin[0]) / (Math.PI / 2)) * (Math.PI / 2); return setDrag({ ...drag, to: [origin[0] + Math.cos(a), origin[1] + Math.sin(a)] }); }
        return setDrag({ ...drag, to: onto !== undefined && onto !== drag.from ? pos(doc, onto) : fixedEnd(origin, p, e.altKey, typeof drag.from === "number" ? scaleAt(doc, drag.from) : 1) });
      }
      case "spot": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.plate);
        if (!sh?.tlc) return;
        const t = tlcLayout(sh), x = sh.tlc.spots[drag.index], d: P = [p[0] - drag.from[0], p[1] - drag.from[1]];
        if (!drag.moved && Math.hypot(d[0], d[1]) * L * views.get().zoom < 3) return;
        const working = drag.size
          ? editSpot(drag.base, drag.plate, drag.index, () => {
            const { rx, ry } = t.size(x);
            return { w: Math.max(0.04, rx + d[0]) / t.f, ...(d[1] >= 0 ? { h: Math.max(0.04, ry + d[1]) / t.f } : { tail: Math.max(0, (x.tail ?? 0) - d[1] / t.f) }) };
          })
          : editSpot(drag.base, drag.plate, drag.index, () => ({
            lane: Math.min(t.lanes - 1, Math.max(0, Math.floor((p[0] - t.x0) / t.width))),
            rf: Math.round(Math.min(1, Math.max(0, (p[1] - t.origin) / (t.front - t.origin))) * 100) / 100,
          }));
        return setDrag({ ...drag, working, moved: true });
      }
      case "tableedge": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.id);
        if (!sh?.table) return;
        const t = tableLayout(sh, cellWidth(sh), style.captionSize), i = drag.index;
        const size = drag.axis === "col"
          // The left edge scales every column, keeping the right edge; another border sizes the column before it.
          ? i === 0 ? { widths: t.widths.map((w) => (w * Math.max(0.1, t.x1 - p[0])) / (t.x1 - t.x0)), x0: Math.min(p[0], t.x1 - 0.1) } : { widths: t.widths.map((w, c) => (c === i - 1 ? p[0] - t.col(c) : w)) }
          : i === 0 ? { heights: t.heights.map((h) => (h * Math.max(0.1, p[1] - t.y0)) / (t.y1 - t.y0)), y1: Math.max(p[1], t.y0 + 0.1) } : { heights: t.heights.map((h, r) => (r === i - 1 ? t.row(r) - p[1] : h)) };
        return setDrag({ ...drag, working: updateShape(drag.base, drag.id, sizeTable(sh, size, cellWidth(sh), style.captionSize)) });
      }
      case "mark":
        // In 15° steps while Fixed Angles is on, free when it is off or Option is held (as a dragged bond).
        if (drag.working === drag.base && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, working: moveMark(drag.base, drag.atom, drag.key, p, settings.fixedAngles && !e.altKey) });
      case "lane": {
        // The lane goes where the pointer is among the lanes, its spots with it.
        const sh = drag.base.shapes?.find((x) => x.id === drag.plate);
        if (!sh?.tlc) return;
        const to = laneOf(sh, p);
        return to === drag.to ? undefined : setDrag({ ...drag, to, working: updateShape(drag.base, drag.plate, moveLane(sh, drag.from, to)) });
      }
      case "tlcline": {
        const sh = drag.base.shapes?.find((x) => x.id === drag.plate);
        if (!sh?.tlc) return;
        const t = tlcLayout(sh), h = t.y1 - t.y0;
        // The origin stays below the front and the front above the origin, each inside the plate.
        const change = drag.which === "origin" ? { origin: Math.min(0.9, Math.max(0.02, (p[1] - t.y0) / h), 1 - (sh.tlc.front ?? 0.1) - 0.1) }
          : { front: Math.min(0.9, Math.max(0.02, (t.y1 - p[1]) / h), 1 - (sh.tlc.origin ?? 0.12) - 0.1) };
        return setDrag({ ...drag, working: updateShape(drag.base, drag.plate, { tlc: { ...sh.tlc, ...change } }) });
      }
      case "tilt": {
        // As ChemDraw's: 1.146° (0.02 radian) for each point the pointer moves on the page, so a turn is finer when
        // zoomed in. Across turns about the vertical axis, up and down about the horizontal one, the front going with
        // the pointer; Shift keeps to one axis. Part of a structure joined by one bond turns about that bond (and,
        // in Octet, part joined to the same two atoms, as a bridging ligand, about the line through them), by the
        // move across the axis; Shift turns it in steps of 15°, as the rotation handle does.
        let dx = e.clientX - drag.start[0], dy = e.clientY - drag.start[1];
        const rate = (1.146 * 14.4) / (L * views.get().zoom);
        if (e.shiftKey && !drag.hinge) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        const axis = drag.hinge && [0, 1].map((k) => drag.base.atoms[drag.hinge![0]].location[k] - drag.base.atoms[drag.hinge![1]].location[k]), along = axis ? Math.hypot(axis[0], axis[1]) || 1 : 1;
        const about = axis ? ((dx * axis[1] + dy * axis[0]) / along) * rate : 0, step = e.shiftKey ? Math.round(about / 15) * 15 : about;
        const working = drag.hinge ? turnAboutBond(drag.base, drag.ids, drag.hinge[1], drag.hinge[0], step) : tiltAtoms(drag.base, drag.ids, drag.centre, dx * rate, dy * rate);
        return setDrag({ ...drag, working });
      }
      case "pen":
        if (!drag.out && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        return setDrag({ ...drag, out: p });
      case "pivot": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        if (!drag.moved) setDrag({ ...drag, moved: true });
        const a = atomAt(doc, p, 8 / (L * views.get().zoom));
        return setPivot(a !== undefined ? pos(doc, a) : p);
      }
      case "turn": {
        // Free, or in 15° steps with Shift. Anticlockwise is positive, as on the page.
        let degrees = ((Math.atan2(p[1] - drag.centre[1], p[0] - drag.centre[0]) - drag.start) * 180) / Math.PI;
        degrees = ((degrees + 540) % 360) - 180;
        if (e.shiftKey) degrees = Math.round(degrees / 15) * 15;
        return setDrag({ ...drag, degrees, working: turnedParts(doc, degrees, drag.centre, drag.middles) });
      }
      case "resize": {
        // ⌘ turns the soft stops off, as it turns snapping off while moving. Control turns Labels and lines over for
        // this drag, as ChemDraw's Ctrl does on its handles. A moved centre mark is the point it scales about.
        const { size, anchor } = resizeBy(drag.frame, drag.side, p, { shift: e.shiftKey, alt: e.altKey, about: pivot }, e.metaKey ? [] : drag.stops, 6 / (views.get().zoom * L));
        const lines = drag.labels !== e.ctrlKey;
        if (size[0] === drag.size[0] && size[1] === drag.size[1] && anchor[0] === drag.anchor[0] && anchor[1] === drag.anchor[1] && lines === drag.lines) return;
        // A page spectrum alone: its plot grows by what its frame grows, and its text keeps its size (pageplot.ts).
        if (drag.plot !== undefined) {
          const f = drag.frame, xs = [f[0], f[2]].map((v) => anchor[0] + (v - anchor[0]) * size[0]), ys = [f[1], f[3]].map((v) => anchor[1] + (v - anchor[1]) * size[1]);
          return setDrag({ ...drag, size, anchor, lines, working: reframe(doc, drag.plot, f, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], plotEnv()) });
        }
        return setDrag({ ...drag, size, anchor, lines, working: drag.whole && lines && size[0] === size[1] ? doc : scaledParts(doc, drag.atoms, drag.items, size, anchor, lines, drag.middles) });
      }
      case "cycle": {
        if (cycleChoice === "name" || (!drag.to && !drag.pull && !drag.radius && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4)) return;
        stopHold();
        // A radius snaps to half a bond length (at the cycle's scale); Option frees it.
        const snap = (r: number, f = 1) => (e.altKey ? r : Math.max(0.5 * f, Math.round(r / (0.5 * f)) * 0.5 * f));
        // Pressed on a circle: a side arrow comes out of the arc there, coming in or going out the way the pointer goes.
        // With Shift, the circle is sized out to the pointer about its centre.
        const c = drag.pull ? undefined : drag.target.cycle !== undefined && drag.target.branch === undefined ? doc.cycles?.find((x) => x.id === drag.target.cycle) : circleAt(drag.from);
        if (c && drag.shift && !drag.to) return setDrag({ ...drag, radius: resizeCycle(doc, c.id, snap(Math.hypot(p[0] - c.centre[0], p[1] - c.centre[1]), c.scale ?? 1)) });
        const step = c && (drag.target.cycle === c.id && drag.target.step !== undefined ? drag.target.step : stepAt(doc, c, angleAbout(c, drag.from)));
        const pull = drag.pull ?? (c && step !== undefined ? { cycle: c.id, step, meet: sideFor(cycleLayout, { cycle: c.id, step }, [drag.from[0] * L, -drag.from[1] * L], L, c.scale ?? 1)?.at ?? 0.5 } : undefined);
        if (pull) return setDrag({ ...drag, pull: { ...pull, made: pullBranch(doc, cycleLayout, pull.cycle, pull.step, pull.meet, [p[0] * L, -p[1] * L], L) } });
        const r = Math.hypot(p[0] - drag.from[0], p[1] - drag.from[1]), k = r ? snap(r) / r : 0;
        return setDrag({ ...drag, to: [drag.from[0] + (p[0] - drag.from[0]) * k, drag.from[1] + (p[1] - drag.from[1]) * k] });
      }
      case "shape": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // Shift makes it square (or round).
        const w = p[0] - drag.from[0], h = p[1] - drag.from[1], side = Math.max(Math.abs(w), Math.abs(h));
        return setDrag({ ...drag, to: e.shiftKey ? [drag.from[0] + Math.sign(w || 1) * side, drag.from[1] + Math.sign(h || 1) * side] : toGrid(p, e.metaKey) });
      }
      case "handle": {
        // A caption's width: from its anchor to the pointer (both ways from a centred caption's middle). Dragged out
        // past its longest line, it has no width again.
        const cap = drag.which === "width" ? placed.find((x) => x.id === drag.id) : undefined;
        if (cap) {
          const x = cap.lines[0].x / L, m = (HANDLE_GAP * cap.size) / L, d = cap.anchor === "end" ? x - p[0] - m : cap.anchor === "middle" ? 2 * (Math.abs(p[0] - x) - m) : p[0] - x - m;
          const longest = Math.max(...(doc.captions?.find((c) => c.id === cap.id)?.text.split("\n") ?? []).map((t) => textWidth(t, cap.size, cap.bold, cap.italic, fontStack(cap.font ?? style.captionFont)))) / L;
          return setDrag({ ...drag, working: updateCaption(doc, cap.id, { width: d >= longest ? undefined : Math.max(0.5, d) }) });
        }
        // A cycle's side arrow, once the pointer has moved: its end goes where it is dragged (dragEnd: past where the arrow
        // meets the arc, a lone end turns round), with its text, or its structure moves; where it meets the arc slides
        // along the arc (dragMeet), or pulled well off it gives a one-ended arrow its other end there.
        const br = drag.branch !== undefined ? doc.cycles?.find((x) => x.id === drag.id)?.branches?.find((x) => x.id === drag.branch) : undefined;
        if (br) {
          if (drag.working === doc && drag.start && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
          const q: P = [p[0] * L, -p[1] * L], part = drag.which === "end:out" ? "out" : "in", atoms = drag.which !== "meet" ? br[part]?.atoms : undefined;
          if (atoms?.length && drag.from) return setDrag({ ...drag, working: moveAtoms(doc, new Set(atoms), [p[0] - drag.from[0], p[1] - drag.from[1]]) });
          if (drag.which === "meet") return setDrag({ ...drag, working: dragMeet(doc, cycleLayout, drag.id, br.id, q, L) });
          const moved = dragEnd(doc, cycleLayout, drag.id, br.id, part, q, L);
          return setDrag({ ...drag, working: moved.m });
        }
        // A step's lead, trail or bow (stepFor), live once the pointer has moved. Shift gives the node's other side the
        // same space; Option on a reversible step's lead or trail sets its balance instead.
        const cy = drag.step !== undefined ? doc.cycles?.find((x) => x.id === drag.id) : undefined;
        if (cy) {
          if (drag.working === doc && drag.start && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
          const which = drag.which as "lead" | "trail" | "bow", s = drag.step!, n = Math.max(cy.nodes.length, 1), ratio = e.altKey && which !== "bow" && cy.steps?.[s]?.kind === "equilibrium";
          const change = stepFor(cycleLayout, cy, s, which, [p[0] * L, -p[1] * L], L, pt, (which === "bow" ? 6 : 4) / views.get().zoom, ratio);
          if (!change) return;
          const working = setStep(doc, cy.id, s, change);
          return setDrag({ ...drag, working: !e.shiftKey || ratio || which === "bow" ? working : which === "lead" ? setStep(working, cy.id, (s - 1 + n) % n, { trail: change.lead }) : setStep(working, cy.id, (s + 1) % n, { lead: change.trail }) });
        }
        const a = doc.arrows?.find((x) => x.id === drag.id);
        if (!a) return;
        if (a.curve && drag.which.startsWith("p")) {
          const [i, part] = drag.which.slice(1).split(":");
          return setDrag({ ...drag, working: updateArrow(doc, a.id, withCurve(moveCurvePoint(a.curve, Number(i), part as "at" | "c1" | "c2", p, e.altKey))) });
        }
        if (drag.which === "head") {
          // The barb's distance back from the tip sets the head's length, its distance off the shaft its width; the
          // notch keeps its place between them.
          const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) || 1, u = [(a.to[0] - a.from[0]) / len, (a.to[1] - a.from[1]) / len], lw = frame.line / L, h = headSize(a);
          const along = ((a.to[0] - p[0]) * u[0] + (a.to[1] - p[1]) * u[1]) / lw, across = Math.abs((p[0] - a.to[0]) * -u[1] + (p[1] - a.to[1]) * u[0]) / lw;
          const length = Math.max(2, Math.min(500, along)), width = Math.max(0.5, Math.min(500, across));
          return setDrag({ ...drag, working: updateArrow(doc, a.id, { headSize: { length, centre: (length * h.centre) / h.length, width } }) });
        }
        if (a.kind === "equilibrium" && e.altKey && (drag.which === "from" || drag.which === "to")) {
          // Option-drag on an equilibrium's end shortens one of its arrows about the middle, never past its full
          // length (ChemDraw's ratio): the end's handle, the forward arrow; the start's, the back arrow.
          const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) || 1, u = [(a.to[0] - a.from[0]) / len, (a.to[1] - a.from[1]) / len];
          const reach = Math.abs((p[0] - (a.from[0] + a.to[0]) / 2) * u[0] + (p[1] - (a.from[1] + a.to[1]) / 2) * u[1]) * 2, notch = (headSize(a).centre * frame.line) / L;
          const ratio = drag.which === "to" ? Math.max(0.05, Math.min(1, reach / len)) : Math.max(1, Math.min(20, a.bend ? len / Math.max(1e-3, reach) : (len - notch) / Math.max(1e-3, reach - notch)));
          return setDrag({ ...drag, working: updateArrow(doc, a.id, { ratio: Math.abs(ratio - 1) < 0.02 ? undefined : ratio }) });
        }
        if (drag.which === "bend") {
          // The middle follows the pointer across the line; how far across sets the bend.
          const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) || 1, n = [-(a.to[1] - a.from[1]) / len, (a.to[0] - a.from[0]) / len];
          const off = (p[0] - (a.from[0] + a.to[0]) / 2) * n[0] + (p[1] - (a.from[1] + a.to[1]) / 2) * n[1];
          return setDrag({ ...drag, working: updateArrow(doc, a.id, { bend: Math.max(-1.5, Math.min(1.5, off / len)) }) });
        }
        const other = drag.which === "from" ? a.to : a.from;
        let q: P = curved(a) ? electronAt(p, hitAt(p)) : p;
        if (!curved(a) && !e.altKey && settings.fixedAngles) {
          const far = Math.hypot(q[0] - other[0], q[1] - other[1]), ang = Math.round(Math.atan2(q[1] - other[1], q[0] - other[0]) / SNAP) * SNAP;
          q = [other[0] + far * Math.cos(ang), other[1] + far * Math.sin(ang)];
        }
        return setDrag({ ...drag, working: updateArrow(doc, a.id, { [drag.which as "from" | "to"]: q }) });
      }
      case "chain": {
        if (!drag.to && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        stopHold();
        // The chain follows the pointer: its direction snaps to 15° steps, its length is free. The side of that line
        // the pointer is on puts the first bond on that side (moving across the line turns the zig-zag over, as in
        // ChemDraw). With Command held (Ctrl off the Mac) it snakes after the pointer instead.
        const origin = typeof drag.from === "number" ? pos(doc, drag.from) : drag.from, far = Math.hypot(p[0] - origin[0], p[1] - origin[1]);
        const raw = Math.atan2(p[1] - origin[1], p[0] - origin[0]), a = settings.fixedAngles && !e.altKey ? Math.round(raw / SNAP) * SNAP : raw, off = Math.sin(raw - a) * far * L * views.get().zoom;
        const to: P = [origin[0] + far * Math.cos(a), origin[1] + far * Math.sin(a)], side = Math.abs(off) >= 1 ? Math.sign(off) : drag.side ?? 1;
        const snaking = MOD === "⌘" ? e.metaKey : e.ctrlKey;
        const path = snaking ? snake(origin, drag.path ?? chainPoints(doc, drag.from, to, side, style.chainAngle).slice(0, 1), p, style.chainAngle) : undefined;
        return setDrag({ ...drag, to, side, path });
      }
      case "erase": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        const bonds = new Set(drag.bonds), atoms = new Set(drag.atoms), captions = new Set(drag.captions);
        rub(doc, drag.trail[drag.trail.length - 1], p, settings.eraser, bonds, atoms);
        const [x, y] = [p[0] * L, -p[1] * L], r = settings.eraser * L;
        for (const c of placed) if (x >= c.box[0] - r && x <= c.box[2] + r && y >= c.box[1] - r && y <= c.box[3] + r) captions.add(c.id);
        for (const a of arrows) if (nearTrace([x, y], arrowTrace(a, L), r)) captions.add(a.id);
        for (const sh of doc.shapes ?? []) if (nearTrace([x, y], shapeTrace(sh, L, frame.bond), r)) captions.add(sh.id);
        // An integral group goes whole, as with ChemDraw's eraser.
        for (const g of groupsOf(doc, new Set([...atoms, ...[...bonds].flatMap((i) => doc.bonds[i].atoms)]), captions)) if (g.integral) { g.atoms.forEach((i) => atoms.add(i)); g.items.forEach((id) => captions.add(id)); }
        return setDrag({ ...drag, trail: [...drag.trail, p], bonds, atoms, captions, moved: true });
      }
      case "box": {
        // Smart: atoms the box only just missed (all their neighbours are in it) come along too.
        const [lo, hi] = [[Math.min(drag.from[0], p[0]), Math.min(drag.from[1], p[1])], [Math.max(drag.from[0], p[0]), Math.max(drag.from[1], p[1])]];
        const within = ([x, y]: P) => x >= lo[0] && x <= hi[0] && y >= lo[1] && y <= hi[1];
        chooseArea(complete(doc, new Set([...drag.base, ...atomsIn(doc, drag.from, p)])), [...drag.picks, ...captionsWhere(within, [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]])], within);
        return setDrag({ ...drag, to: p, moved: true });
      }
      case "lasso": {
        const points = [...drag.points, p];
        chooseArea(complete(doc, new Set([...drag.base, ...atomsInPolygon(doc, points)])), [...drag.picks, ...captionsWhere((q) => inPolygon(q, points), points)], (q) => inPolygon(q, points));
        return setDrag({ ...drag, points, moved: true });
      }
      case "move": {
        if (!drag.moved && Math.hypot(e.clientX - drag.start[0], e.clientY - drag.start[1]) < 4) return;
        // Over a template set the selection stays where it is, as letting go there leaves it.
        const into = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-drop-set]") ?? undefined;
        markDrop(into);
        if (into) return setDrag({ ...drag, working: drag.base ?? doc, moved: true, guides: [], point: undefined });
        // Snap within 6 screen px, unless snapping is off or ⌘ is held (Option is ChemDraw's copy, at the press).
        const raw: P = [p[0] - drag.from[0], p[1] - drag.from[1]], base = drag.base ?? doc, moving = drag.atoms ?? selection;
        // Text, arrows and shapes moving without atoms snap the same way.
        const tol = 6 / (views.get().zoom * L);
        const boxes = !settings.snap || e.metaKey ? undefined : drag.snap();
        const snapped = !settings.snap || e.metaKey ? { d: raw, guides: [] as Guide[], point: undefined }
          : moving.size ? snapMove(base, moving, raw, tol, boxes)
          : boxes ? { ...snapBoxes(boxes.moving, boxes.targets, raw, tol), point: undefined }
          : { d: raw, guides: [] as Guide[], point: undefined };
        // Snap to Grid, on each axis an atom or object snap left free: the atom grabbed (a bond's nearer atom), or else
        // the nearest corner or middle of the moving box, lands on a grid line.
        if (snapGrid && !e.metaKey && !snapped.point) {
          const t = drag.target, grabbed = t.atom ?? (t.bond !== undefined ? base.bonds[t.bond].atoms.reduce((a, b) => (Math.hypot(pos(base, a)[0] - drag.from[0], pos(base, a)[1] - drag.from[1]) <= Math.hypot(pos(base, b)[0] - drag.from[0], pos(base, b)[1] - drag.from[1]) ? a : b)) : undefined);
          const b = grabbed !== undefined && moving.has(grabbed) ? undefined : drag.snap()?.moving;
          const points: P[] = grabbed !== undefined && moving.has(grabbed) ? [pos(base, grabbed)] : b ? [b[0], (b[0] + b[2]) / 2, b[2]].flatMap((x) => [b[1], (b[1] + b[3]) / 2, b[3]].map((y): P => [x, y])) : [];
          const nudge = gridNudge(snapGrid, points.map((q) => [q[0] + snapped.d[0], q[1] + snapped.d[1]]), views.get().zoom * L, 6);
          // A spacing mark across a horizontal space is a snap on x, though it is drawn as a horizontal line.
          const free = (axis: "x" | "y") => !snapped.guides.some((g) => (g.gap ? (g.axis === "x" ? "y" : "x") : g.axis) === axis);
          snapped.d = [snapped.d[0] + (free("x") ? nudge[0] ?? 0 : 0), snapped.d[1] + (free("y") ? nudge[1] ?? 0 : 0)];
        }
        // ⌘ (Ctrl) also keeps what moves off any catalytic cycle, but for Ctrl on a Ctrl-drag copy (keys.ts skipsCycle).
        return setDrag({ ...drag, working: moveAll(base, snapped.d, drag.captions, drag.arrows, drag.cycles, moving), moved: true, guides: snapped.guides, point: snapped.point, skip: skipsCycle(e, pressCtrlCopy.current) });
      }
    }
  }

  // Runs a shortcut action (see keys.ts for the list).
  // What an atom or bond key works on: the atom or bond under the pointer, else the one atom or bond selected
  // (so a key still works while the pointer is over the Actions panel).
  const keyTarget = (): { atom?: number; bond?: number } => {
    const hover = hovers.get();
    if ((hover.atom ?? -1) < doc.atoms.length && (hover.bond ?? -1) < doc.bonds.length && (hover.atom !== undefined || hover.bond !== undefined)) return { atom: hover.atom, bond: hover.bond };
    if (picked.size || !selection.size || selection.size > 2) return {};
    const ids = [...selection];
    if (ids.length === 1) return { atom: ids[0] };
    const b = doc.bonds.findIndex((x) => x.atoms.includes(ids[0]) && x.atoms.includes(ids[1]));
    return b >= 0 ? { bond: b } : {};
  };
  // Puts the keyboard hotspot on an atom or bond of mol, and keeps it with mol for undo.
  const keyHot = (hot: Hot, mol = doc) => {
    lastHot.current = hot.atom ?? (hot.bond !== undefined ? mol.bonds[hot.bond]?.atoms[0] : undefined);
    keyFrom.current = pointer.current ? hit(pointer.current) : {};
    hotOf.current.set(mol, hot);
    setHover({ ...hot, key: true });
  };
  // An edit by a key: the hotspot it acted on stays with the drawing before it, and the hotspot moves to `hot`.
  const keyEdit = (mol: Mol, hot: Hot | undefined, from: Hot) => {
    hotOf.current.set(doc, from);
    set(mol);
    if (hot) keyHot(hot, mol);
    else if (hovers.get().key) setHover({});
  };
  // With several atoms selected and the pointer away from the drawing or on the selection, an atom key acts on every
  // selected atom and a bond key on every selected bond, as one step (ChemDraw's: Shift-click the four end carbons of
  // neopentane and press n). onBond: the pointer is on a selected bond, or the selection is one bond, so a key that
  // means something for bonds acts on the bonds first.
  const manyTarget = (): { atoms: number[]; bonds: number[]; onBond: boolean } | undefined => {
    const hover = hovers.get();
    if (picked.size || selection.size < 2) return undefined;
    if (hover.atom !== undefined && !selection.has(hover.atom)) return undefined;
    if (hover.bond !== undefined && !doc.bonds[hover.bond]?.atoms.every((i) => selection.has(i))) return undefined;
    if (hover.caption !== undefined || hover.arrow !== undefined) return undefined;
    const atoms = [...selection].filter((i) => i < doc.atoms.length), bonds = doc.bonds.flatMap((b, k) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [k] : []));
    return { atoms, bonds, onBond: hover.bond !== undefined || (atoms.length === 2 && bonds.length === 1) };
  };
  // The action a key runs on such a selection: its atom or bond action, else one that works anywhere.
  const manyAction = (pressed: string, many: { onBond: boolean }) => {
    const map = keymap(settings.keys);
    for (const place of many.onBond ? ["bond", "atom"] as const : ["atom", "bond"] as const) {
      const id = actionFor(map, pressed, place);
      if (id && ACTIONS.find((a) => a.id === id)?.place === place) return id;
    }
    return actionFor(map, pressed, "none");
  };
  // An atom or bond key on every selected atom or bond (see manyTarget), as one step. False when the key does not act
  // on a selection this way.
  function runMany(id: string, many: { atoms: number[]; bonds: number[] }): boolean {
    const [kind, arg] = id.split("."), { atoms, bonds } = many, each = (f: (m: Mol, i: number) => Mol, ids: number[]) => set(ids.reduce(f, doc), true);
    if (kind === "element") return each((m, i) => keyElement(m, i, arg), atoms), true;
    if (kind === "label") return each((m, i) => setLabel(m, i, arg), atoms), true;
    if (kind === "charge") return each((m, i) => addCharge(m, i, arg === "plus" ? 1 : -1), atoms), true;
    if (kind === "group") return each((m, i) => addGroupAt(m, i, arg as Group)[0], atoms), true;
    if (id === "atom.attach") { const on = atoms.some((i) => !doc.atoms[i].attach); return each((m, i) => setAtomMarks(m, i, { attach: on || undefined }), atoms), true; }
    if (id === "atom.number") return numberAtoms(atoms), true;
    if (id === "atom.newlabel") { labelOpen.current = true; return setEditing({ atom: atoms[0], value: "", all: atoms, blank: true, pending: ownStyle(doc.atoms[atoms[0]]) }), true; }
    if (id === "atom.sproutlabel") return sproutLabel(atoms), true;
    if (kind === "bond" && arg in BONDS) return each((m, k) => keyBond(m, k, BONDS[arg as BondKind].spec), bonds), true;
    if (kind === "bond" && (arg === "left" || arg === "centre" || arg === "right")) return each((m, k) => (m.bonds[k].type === 2 ? setPosition(m, k, arg) : m), bonds), true;
    if (id === "bond.front") return set(toFront(doc, new Set(atoms)), true), true;
    return false;
  }
  // ChemDraw's > key: a bond from each atom (as 1 adds it), and a new label typed for their new ends, as one step.
  const sprouts = useRef(0);
  function sproutLabel(atoms: number[]) {
    let m = doc;
    const ends = atoms.map((i) => { let end: number; [m, end] = addGroupAt(m, i, "chain"); return end; });
    const merge = `sprout-label ${++sprouts.current}`;
    set(m, false, merge);
    labelOpen.current = true;
    setEditing({ atom: ends[0], value: "", ...(ends.length > 1 ? { all: ends } : {}), merge, blank: true });
  }
  // The Eraser's click and Delete with nothing selected: the atom, bond or object under the pointer goes, or the
  // whole of the (outermost) integral group it is part of (as with ChemDraw's eraser).
  // A cycle's side arrow loses the end under the pointer (with its text); an arc is hidden (the last one takes the cycle).
  function removeAt(t: Hover) {
    const c = doc.cycles?.find((x) => x.id === t.cycle), g = outermost(groupsOf(doc, new Set(atomsOf(doc, t)), new Set(itemsOf(t))).filter((x) => x.integral));
    if (g) return set(deleteChosen(doc, new Set(g.atoms), new Set(g.items), undefined, drawnAt, drawnAlign));
    if (c && t.branch !== undefined) return set(removeEnd(doc, c.id, t.branch, t.part ?? "in"));
    if (c && t.step !== undefined) return set(hideArc(c.id, t.step));
    if (t.atom !== undefined) return set(deleteChosen(doc, new Set([t.atom]), new Set(), undefined, drawnAt, drawnAlign));
    if (t.caption !== undefined || t.arrow !== undefined || t.cycle !== undefined) return set(deleteChosen(doc, new Set(), new Set(itemsOf(t)), undefined, drawnAt, drawnAlign));
    if (t.bond !== undefined) return set(deleteChosen(doc, new Set(), new Set(), new Set([t.bond]), drawnAt, drawnAlign));
  }
  function run(id: string) {
    const [kind, arg] = id.split(".");
    const { atom, bond } = keyTarget();
    // As in ChemDraw: G selects the atom or bond under the pointer; Space takes Select and, over a structure,
    // selects all of it.
    if (id === "select.here") return atom !== undefined || bond !== undefined ? choose(atomsOf(doc, { atom, bond }), []) : undefined;
    const hover = hovers.get();
    if (id === "tool.select") {
      setTool("select");
      // Right after a bond or shape is drawn the pointer has not moved, so nothing is hovered yet: what is under the
      // pointer counts, and else what was drawn last, so Space picks what was just drawn, ready to move (as in ChemDraw).
      let under = Object.values(hover).some((v) => v !== undefined) || !pointer.current ? hover : hit(pointer.current);
      if (!Object.values(under).some((v) => v !== undefined) && added.current?.mol === doc) under = added.current.at;
      const one = under.atom ?? (under.bond !== undefined ? doc.bonds[under.bond].atoms[0] : undefined);
      if (one !== undefined) choose(fragments(doc).find((g) => g.includes(one)) ?? [one], []);
      else if (under.caption !== undefined || under.arrow !== undefined || under.cycle !== undefined) choose([], [(under.caption ?? under.arrow ?? under.cycle)!]);
      return;
    }
    if (id === "atom.attach" && atom !== undefined) return set(setAtomMarks(doc, atom, { attach: !doc.atoms[atom].attach || undefined }));
    if (id === "atom.number" && atom !== undefined) return numberAtoms([atom]);
    if (id === "atom.properties" && atom !== undefined) return atomProperties(atom);
    if (id === "atom.nickname" && atom !== undefined) {
      const view = views.get(), q = doc.atoms[atom].location;
      return setNicknames({ atom, x: view.x + q[0] * L * view.zoom, y: view.y - q[1] * L * view.zoom });
    }
    if (kind === "element" && atom !== undefined) return set(keyElement(doc, atom, arg));
    if (kind === "label" && atom !== undefined) return set(setLabel(doc, atom, arg));
    if (id === "atom.label" && atom !== undefined) return editLabel(atom);
    // ! asks for a new label for the atom; > adds a bond and asks for the label of its new end (ChemDraw's ? hotkeys).
    if (id === "atom.newlabel" && atom !== undefined) { labelOpen.current = true; return setEditing({ atom, value: "", blank: true, pending: ownStyle(doc.atoms[atom]) }); }
    if (id === "atom.sproutlabel" && atom !== undefined) return sproutLabel([atom]);
    if (id === "charge.plus" && atom !== undefined) return set(addCharge(doc, atom, 1));
    if (id === "charge.minus" && atom !== undefined) return set(addCharge(doc, atom, -1));
    if (kind === "subst" && atom !== undefined) return set(stepSubstituents(doc, atom, arg as "free" | "upto" | "exactly" | "lower"));
    if (kind === "menu") return commands.current[id.slice(5)]?.(); // a menu command on a key (Settings)
    if (kind === "action") { runAction(id.slice(7)); return; } // an Actions panel action on a key (Settings)
    // As in ChemDraw, a group key moves the hotspot on to the group's new end, and a ring fused by a key moves it
    // to the ring's far bond, so the next key carries on from there.
    if (kind === "group" && atom !== undefined) { const [mol, hot] = addGroupAt(doc, atom, arg as Group); return keyEdit(mol, { atom: hot }, { atom }); }
    if (kind === "bond" && bond !== undefined) {
      if (arg in BONDS) return set(keyBond(doc, bond, BONDS[arg as BondKind].spec, hover.key ? undefined : pointer.current));
      if (arg === "left" || arg === "centre" || arg === "right" || arg === "auto") return set(setPosition(doc, bond, arg === "auto" ? undefined : arg));
      // ChemDraw's f: the bond goes to the front, so where it crosses another bond, the other one has the gap.
      if (arg === "front") {
        const mol = toFront(doc, new Set(doc.bonds[bond].atoms)), at = mol.bonds.length - 1;
        if (hover.key) return keyEdit(mol, { bond: at }, { bond });
        set(mol);
        if (hover.bond === bond) setHover({ ...hover, bond: at });
        return;
      }
      if (arg === "properties") return bondProperties(bond);
      const fuse = (mol: Mol) => { const far = farBond(mol, bond, doc.bonds.length); return keyEdit(mol, far === undefined ? undefined : { bond: far }, { bond }); };
      if (arg === "chair1" || arg === "chair2") return fuse(addChair(doc, arg === "chair1" ? 1 : 2, { bond }));
      const ring = arg.startsWith("ring") ? RINGS[arg.slice(4) as RingKind] : RINGS[arg as RingKind];
      if (ring) return fuse(addRing(doc, ring.n, ring.aromatic, { bond }));
    }
    if (kind === "tool") {
      const ringTools: Record<string, RingKind> = { benzene: "benzene", cyclopentadiene: "cyclopentadiene", cyclohexane: "6", cyclopentane: "5" };
      if (ringTools[arg]) {
        setSettings((s) => ({ ...s, variants: { ...s.variants, ring: ringTools[arg] } }));
        return setTool("ring");
      }
      return setTool(arg as Tool);
    }
    if (kind === "eraser") return setSettings((s) => ({ ...s, eraser: Math.min(2, Math.max(0.05, s.eraser * (arg === "bigger" ? 1.25 : 0.8))) }));
    // With nothing selected, the arrow keys walk the hotspot atom to bond to atom; Shift jumps about three bonds.
    if (kind === "nudge" && !selection.size && !picked.size && (atom !== undefined || bond !== undefined)) {
      const dir: P = arg.startsWith("left") ? [-1, 0] : arg.startsWith("right") ? [1, 0] : arg.startsWith("up") ? [0, 1] : [0, -1];
      const next = (arg.endsWith("10") ? jumpHot : walkHot)(doc, { atom, bond }, dir);
      // A screen reader hears the next atom or bond as it takes the focus (CanvasAccess); with none that way, it hears so.
      if (next.atom === atom && next.bond === bond) say(arg.endsWith("10") ? "No atom that way." : "No bond that way.");
      return keyHot(next);
    }
    if (kind === "nudge" && (selection.size || picked.size)) {
      // 1 pt is 1/14.4 of a bond (ACS 1996). Up is +y in the drawing.
      const step = (arg.endsWith("10") ? 10 : 1) / 14.4, dir = arg.replace("10", "");
      const d: P = dir === "left" ? [-step, 0] : dir === "right" ? [step, 0] : dir === "up" ? [0, step] : [0, -step];
      const m = movers(doc, selection, picked);
      return set(moveAll(doc, d, m.captions, m.arrowIds, m.cycleIds), true);
    }
    if (kind === "rotate" && (selection.size || picked.size)) return rotateBy((arg.startsWith("ccw") ? 1 : -1) * Number(arg.replace(/\D/g, "")));
    // Shift+Option+arrows (ChemDraw's): a 12° turn in 3D about the middle of the selection, left and right about the
    // vertical axis and up and down about the horizontal one, the front going the way of the arrow. With nothing
    // selected they move the hotspot to the nearest structure that way.
    if (kind === "tilt" && !selection.size && !picked.size && (atom !== undefined || bond !== undefined)) {
      return keyHot(jumpHot(doc, { atom, bond }, arg === "left" ? [-1, 0] : arg === "right" ? [1, 0] : arg === "up" ? [0, 1] : [0, -1], true));
    }
    if (kind === "tilt" && selection.size) {
      const ps = [...selection].filter((i) => i < doc.atoms.length).map((i) => doc.atoms[i].location);
      const centre = [0, 1, 2].map((k) => (Math.min(...ps.map((q) => q[k] ?? 0)) + Math.max(...ps.map((q) => q[k] ?? 0))) / 2) as [number, number, number];
      return set(tiltAtoms(doc, selection, centre, arg === "left" ? -12 : arg === "right" ? 12 : 0, arg === "up" ? -12 : arg === "down" ? 12 : 0), true);
    }
    if (id === "edit.delete") {
      // A cycle's side arrow picked goes with its text (its structures stay); a step picked loses its arc.
      const alone = !selection.size && picked.size === 1;
      if (alone && branchPick && picked.has(branchPick.cycle)) return cycleAction("side.remove");
      if (alone && stepPick && picked.has(stepPick.cycle)) return set(hideArc(stepPick.cycle, stepPick.step), true);
      if (selection.size || picked.size) return set(deleteChosen(doc, selection, picked, undefined, drawnAt, drawnAlign));
      // A picked stoichiometry grid cell: the grid goes, as the panel's Delete removes it.
      if (gridPick) { runAction("grid.remove"); return; }
      // As in ChemDraw: the first Delete on a labelled atom removes the label; the next removes the atom. Deleting
      // the keyboard hotspot's atom moves the hotspot back to the atom it was bonded to.
      const integral = atom !== undefined && groupsOf(doc, new Set([atom]), new Set()).some((g) => g.integral);
      if (atom !== undefined && !integral && (doc.atoms[atom].label !== "C" || doc.atoms[atom].text || doc.atoms[atom].shown)) return set(setElement(doc, atom, "C"));
      if (atom !== undefined && !integral && hover.key) {
        const mol = deleteChosen(doc, new Set([atom]), new Set(), undefined, drawnAt, drawnAlign), back = neighbours(doc, atom).map((j) => atomAt(mol, pos(doc, j), 1e-6)).find((j) => j !== undefined);
        return keyEdit(mol, back === undefined ? undefined : { atom: back }, { atom });
      }
      // A double (or triple) bond under the pointer loses a line; a single bond goes.
      const lower = atom === undefined && bond !== undefined ? lowerBond(doc, bond) : undefined;
      if (lower) return set(lower);
      // Any other object under the pointer goes too (ChemDraw deletes a hovered arrow), with its integral group.
      return removeAt({ ...hover, atom, bond });
    }
  }

  // Structure to name: a checked name for each structure in the selection (or the drawing), where there is one.
  // Structure to name runs only when asked, once per structure: names are kept by the structure's own file text.
  const nameCache = useRef(new Map<string, { name?: string; bare?: string; mol: Mol }>());
  // A name's structure is drawn as Octet draws SMILES before its InChI is taken, so it counts hydrogens as the
  // drawing does (the P of PPh3 bonded to Pd has none).
  const inchiOf = (s: Mol | string) => { try { return toInchi(typeof s === "string" ? parseStructure(s, false) : s); } catch { return undefined; } };
  // The checked name (bare), the name shown (with its abbreviation) and the structure named.
  const namedPart = (g: number[], base = doc) => {
    const part = subset(base, new Set(g)), key = serialize(part);
    if (!nameCache.current.has(key)) {
      let bare: string | undefined;
      // A metallocene drawn with the j key is named as its ions, as OPSIN and the standard InChI have it.
      const p = sandwichIons(part) ?? part;
      try { bare = checkedName(p, expandLabels(p), nameToSmiles, inchiOf, cipOf, knownName); } catch { bare = undefined; }
      // The abbreviation follows the checked name, as in an experimental section: "... (TREN)".
      nameCache.current.set(key, { bare, name: bare && withAbbreviation(bare, abbreviationOf(inchiOf(p))), mol: p });
    }
    return nameCache.current.get(key)!;
  };
  const nameFor = (g: number[], base = doc): string | undefined => namedPart(g, base).name;

  // ——— The canvas for screen readers and the keyboard (access.ts, CanvasAccess.tsx) ———
  // Each object's role and name, in reading order, worked out 300 ms after the drawing last changed, so typing and
  // drawing never wait for it. A structure's formula and checked name come from a cache (known) kept by its content
  // wherever it is drawn, filled a few at a time after that with the window free between them (structures of up to
  // MOST_NAMED atoms are named), and cleared when it grows large.
  const [access, setAccess] = useState<{ doc: Mol; items: AccessItem[] }>({ doc: EMPTY, items: [] });
  const [factsAdded, setFactsAdded] = useState(0);
  const known = useRef(new Map<string, { formula?: string; name?: string; named?: boolean }>());
  const accessEl = useRef<HTMLDivElement>(null), accessIn = useRef(false), accessWant = useRef<string>(undefined), accessKey = useRef<string>(undefined);
  const accessAt = useRef(0), accessQuiet = useRef(false), lastHot = useRef<number>(undefined);
  function accessItems(): { items: AccessItem[]; wanted: [string, number[]][] } {
    const near: number[][] = doc.atoms.map(() => []), keys = new Map<number[], string>(), wanted: [string, number[]][] = [];
    doc.bonds.forEach((b, k) => near[b.atoms[0]]?.push(k));
    const factOf = (atoms: number[]) => {
      let key = keys.get(atoms);
      if (key === undefined) {
        const at = new Map(atoms.map((i, k) => [i, k])), [x0, y0] = pos(doc, atoms[0]), r = (v: number) => Math.round(v * 1000);
        key = JSON.stringify([atoms.map((i) => { const a = doc.atoms[i]; return [a.label, a.text, a.charge, a.isotope, a.radical, a.implicitHCount, !!a.centre, r(a.location[0] - x0), r(a.location[1] - y0), r(a.location[2] ?? 0)]; }),
          atoms.flatMap((i) => near[i].map((k) => { const b = doc.bonds[k]; return [b.type, b.stereo, b.display, at.get(b.atoms[0]), at.get(b.atoms[1])]; }))]);
        keys.set(atoms, key);
        const f = known.current.get(key);
        if ((loaded && f?.formula === undefined) || (namesLoaded && !f?.named)) wanted.push([key, atoms]);
      }
      return known.current.get(key);
    };
    const items = describe(doc, {
      // As drawn, at least 0.3 bond lengths each way (a level arrow's line has no height), so its focus ring is a box.
      box: (atoms, items) => {
        const b = drawnBox(atoms, new Set(items));
        if (!b) return undefined;
        const [x0, y0, x1, y1] = [b[0] / L, -b[3] / L, b[2] / L, -b[1] / L], dx = Math.max(0, 0.3 - (x1 - x0)) / 2, dy = Math.max(0, 0.3 - (y1 - y0)) / 2;
        return [x0 - dx, y0 - dy, x1 + dx, y1 + dy];
      },
      formula: (atoms) => factOf(atoms)?.formula || undefined,
      name: (atoms) => factOf(atoms)?.name,
      reaction: reactionOf,
    });
    return { items, wanted };
  }
  function fillFact(key: string, atoms: number[], base: Mol) {
    if (known.current.size >= 2000) known.current.clear();
    const f = known.current.get(key) ?? {};
    if (loaded && f.formula === undefined) { try { f.formula = analyse(subset(base, new Set(atoms)), 1)?.[0]?.formula ?? ""; } catch { f.formula = ""; } }
    if (namesLoaded && !f.named) { f.name = atoms.length <= MOST_NAMED ? namedPart(atoms, base).name : undefined; f.named = true; }
    known.current.set(key, f);
  }
  useEffect(() => {
    if (home) return;
    let timer = window.setTimeout(() => {
      const { items, wanted } = accessItems(), base = doc;
      setAccess({ doc: base, items });
      let k = 0;
      const fill = () => {
        const t0 = performance.now();
        while (k < wanted.length && performance.now() - t0 < 8) { const [key, atoms] = wanted[k++]; fillFact(key, atoms, base); }
        if (k < wanted.length) timer = window.setTimeout(fill, 0);
        else setFactsAdded((n) => n + 1);
      };
      if (wanted.length) timer = window.setTimeout(fill, 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [doc, drawing, placed, arrows, cycleArrows, loaded, namesLoaded, factsAdded, home]); // eslint-disable-line react-hooks/exhaustive-deps
  // The objects as the drawing is now: those worked out, or worked out at once when the drawing changed since.
  const accessNow = () => {
    if (access.doc === doc) return access.items;
    const { items } = accessItems();
    setAccess({ doc, items });
    return items;
  };
  // The keyboard hotspot's element: what its atom or bond is, while the keyboard's focus is on the canvas. Kept for each
  // drawing and hotspot, as the canvas draws again many times between two keys.
  const hotSaid = useRef(new WeakMap<Mol, Map<string, HotItem | undefined>>());
  const hotItem = (h: Hover): HotItem | undefined => {
    if (!h.key || !accessIn.current) return undefined;
    const key = `${h.atom}|${h.bond}`, mine = hotSaid.current.get(doc) ?? new Map<string, HotItem | undefined>();
    hotSaid.current.set(doc, mine);
    if (!mine.has(key)) mine.set(key, hotAt(h));
    return mine.get(key);
  };
  const hotAt = (h: Hover): HotItem | undefined => {
    if (h.atom !== undefined && doc.atoms[h.atom]) {
      // A square on the atom; a written label (OMe) as wide as its ink.
      const i = h.atom, ink = doc.atoms[i].text ? drawing.ink[i] : undefined, [x, y] = pos(doc, i), r = 0.3;
      const b: Box = ink ? [Math.min(ink[0] / L, x - r), y - r, Math.max(ink[2] / L, x + r), y + r] : [x - r, y - r, x + r, y + r];
      return { key: `h${i}`, role: "atom", name: atomText(doc, i), box: b };
    }
    if (h.bond !== undefined && doc.bonds[h.bond]) {
      const [p, q] = doc.bonds[h.bond].atoms.map((i) => pos(doc, i)), c = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], half = Math.hypot(q[0] - p[0], q[1] - p[1]) / 2;
      return { key: `hb${h.bond}`, role: "bond", name: bondText(doc, h.bond), box: [c[0] - half, c[1] - 0.2, c[0] + half, c[1] + 0.2], turn: (Math.atan2(q[1] - p[1], q[0] - p[0]) * 180) / Math.PI };
    }
    return undefined;
  };
  // Focus Octet gives an object (Tab, which has selected it already, or a rescue) changes no selection.
  const accessFocus = (key: string) => {
    accessIn.current = true;
    accessQuiet.current = true;
    queueMicrotask(() => { accessQuiet.current = false; });
    const el = accessEl.current?.querySelector<HTMLElement>(`[data-object="${CSS.escape(key)}"]`);
    if (el) el.focus({ preventScroll: true });
    else accessWant.current = key;
  };
  // An object took the focus. When Tab brought it from a control outside the canvas, the selection follows it.
  const accessFocused = (key: string) => {
    const at = access.items.findIndex((x) => x.key === key), x = access.items[at];
    accessKey.current = key;
    if (at >= 0) accessAt.current = at;
    if (accessQuiet.current || !x) return;
    setHover({});
    choose(x.atoms, x.items);
  };
  // Where the focus goes when its element went: the structure the hotspot was on, selected (Escape goes up from the
  // atom to its structure, as in Figma); else the object it was on, else the one now in its place (after a delete), not
  // selected, so a second Delete does not take it too.
  const accessRescue = () => {
    const items = access.items, hot = lastHot.current, of = hot !== undefined && !hovers.get().key ? items.find((x) => x.atoms.includes(hot)) : undefined;
    lastHot.current = undefined;
    if (of) choose(of.atoms, of.items);
    const to = of ?? items.find((x) => x.key === accessKey.current) ?? items[Math.min(accessAt.current, items.length - 1)];
    if (to) { accessQuiet.current = true; queueMicrotask(() => { accessQuiet.current = false; }); }
    return to?.key;
  };
  // Tab and Shift+Tab (ChemDraw's: with Select, the next or previous structure): the next or previous object on the
  // canvas in reading order, with any tool, and the selection follows. With a keyboard hotspot, Tab selects its
  // structure, as ChemDraw's does. With the focus on the canvas, Tab past the last object (or Shift+Tab before the
  // first) leaves it for the controls around it; from no control, it comes round. False when Tab is not the canvas's.
  function stepAccess(back: boolean): boolean {
    const el = document.activeElement, inLayer = !!accessEl.current?.contains(el);
    if (!inLayer && el && el !== document.body && el !== svg.current) return false;
    const items = accessNow(), hot = hovers.get();
    if (!items.length) return false;
    let to: number;
    if (hot.key && (hot.atom !== undefined || hot.bond !== undefined)) {
      const i = hot.atom ?? doc.bonds[hot.bond!]?.atoms[0];
      to = items.findIndex((x) => x.atoms.includes(i));
    } else {
      // From the object with the focus (one not selected is selected where it is), else from the selection.
      const key = inLayer ? (el as HTMLElement).dataset.object : undefined, chosen = (x: AccessItem) => x.atoms.some((i) => selection.has(i)) || x.items.some((i) => picked.has(i));
      let at = key ? items.findIndex((x) => x.key === key) : -1;
      if (at >= 0 && !chosen(items[at])) to = at;
      else {
        if (at < 0) at = items.findIndex(chosen);
        to = at < 0 ? (back ? items.length - 1 : 0) : at + (back ? -1 : 1);
        if (to < 0 || to >= items.length) {
          if (inLayer) return false;
          to = (to + items.length) % items.length;
        }
      }
    }
    const x = items[to];
    if (!x) return false;
    setHover({}); // the hotspot, or what the pointer was over: the keys now act on what Tab selected
    choose(x.atoms, x.items);
    accessKey.current = x.key;
    accessAt.current = to;
    lastHot.current = undefined;
    accessFocus(x.key);
    return true;
  }
  // What an edit changed, said once in the live region (access.ts changeText), 400 ms after the last change: a key held
  // down, or a nudge pressed ten times, says one sentence. A new or opened drawing says nothing. sayNext: what a command
  // says in place of the change (Clean Up), or before it (Undo).
  const [said, setSaid] = useState("");
  const say = (text: string) => setSaid((was) => (was === text ? `${text} ` : text));
  const spoken = useRef(doc), sayNext = useRef<{ text: string; at: number }>(undefined);
  const sayAfter = (text: string) => { sayNext.current = { text, at: performance.now() }; };
  useEffect(() => {
    const t = window.setTimeout(() => {
      const from = spoken.current;
      spoken.current = doc;
      if (home || from === doc || !h.stack.includes(from)) return;
      const note = sayNext.current && performance.now() - sayNext.current.at < 2000 ? sayNext.current.text : undefined;
      sayNext.current = undefined;
      const text = note === "Undo" || note === "Redo" ? `${note}. ${changeText(from, doc)}` : note ?? changeText(from, doc);
      if (text) say(text);
    }, 400);
    return () => clearTimeout(t);
  }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  // A grouped mixture's name (mixtures.ts): its components' checked names with their ratio, read back whole.
  const mixtureNameFor = (mix: Mixture): string | undefined => {
    const parts = mix.parts.map((p) => { const n = namedPart(p.atoms); return { name: n.bare ?? "", mol: n.mol, count: p.count }; });
    try { return mixtureName(parts, nameToSmiles, inchiOf); } catch { return undefined; }
  };
  // The structures to name. The ions of a salt (charged pieces within 3.5 bond lengths of each other whose charges
  // cancel) are named together, as sodium acetate rather than two names. With only captions picked, none.
  const targets = () => {
    return withSalts(doc, fragments(doc).filter((g) => g.length && (!selection.size || g.some((i) => selection.has(i))) && (selection.size || !pickedChem(picked))));
  };
  // Search Reaxys and Search PubChem (decision 0008): the selection, or the whole drawing when nothing is selected
  // (as Copy), opens in the user's browser. Structures on one side of a reaction search Reaxys's reactions for them
  // in that part, as ChemDraw's Reactant and Reaction product searches. Only a press runs a search.
  function searchOnline(site: "reaxys" | "pubchem", exact: boolean) {
    if (!loaded) return;
    const all = !selection.size && !picked.size, part = all ? doc : extractSelection(doc, selection, picked);
    if (!part.atoms.length) return setNotice("Select a structure to search.", "info");
    const reactions: Reaction[] = [], seen = new Set<number>();
    for (const a of arrows.filter((x) => straightArrow(x))) {
      if (seen.has(a.id)) continue;
      const r = reactionOf(a.id);
      r?.arrows.forEach((id) => seen.add(id));
      if (r) reactions.push(r);
    }
    const role = roleOf(reactions, fragments(doc).filter((g) => all || g.some((i) => selection.has(i))));
    if (role === "mixed") return setNotice("Select the starting materials or the products of the reaction.", "info");
    let query: ReturnType<typeof searchQuery>;
    try { query = searchQuery(part); } catch { return setNotice("Octet cannot read this structure."); }
    if (!searchNow()) return;
    // A query with generic labels always looks for substructures.
    invoke("search_online", { site, ...query, exact: exact && !query.molfile, role: site === "reaxys" ? role : undefined })
      .catch((e) => setNotice(typeof e === "string" ? e : "Search runs in the Octet app."));
  }
  // The selection to the front or the back of the draw order (order.ts): each structure it touches, as a whole, and
  // each picked object (a picked cycle takes its intermediates too).
  function restack(front: boolean) {
    const inCycle = new Set((doc.cycles ?? []).filter((c) => picked.has(c.id)).flatMap((c) => c.nodes.flat()));
    // The structures and objects among the rest (order.ts), and the selected bonds among the bonds they cross.
    const m = toFront(reorder(doc, fragments(doc).filter((g) => g.some((i) => selection.has(i) || inCycle.has(i))), picked, front), selection, !front);
    if (m !== doc) set(m, true);
  }
  // A name's italic and raised characters as IUPAC prints them (nametype.ts), as runs; the text stays the same.
  const typeset = (name: string): { runs?: TextRun[] } => { const runs = nameRuns(name); return styled(runs) ? { runs } : {}; };
  // Structure to name: each named structure gets its name centred underneath (after its compound number).
  function nameStructures() {
    if (!namesLoaded) { void loadNames().then(() => setNamesLoaded(true)).catch(() => {}); return setNotice("Loading names. Try again in a moment.", "info"); }
    let m = doc, missed = 0;
    // A grouped mixture has one name, with its components' ratio (ChemDraw 26.1).
    const all = targets(), mixtures = mixturesOf(doc, all), inMixture = new Set(mixtures.flatMap((x) => x.atoms));
    for (const mix of mixtures) {
      const name = mixtureNameFor(mix), atoms = mix.atoms;
      if (!name) { missed++; continue; }
      if (!m.captions?.some((c) => c.text === name && c.under?.some((i) => atoms.includes(i)))) m = addCaption(m, { text: name, ...typeset(name), x: 0, y: 0, under: atoms })[0];
    }
    for (const atoms of all.filter((t) => !t.some((i) => inMixture.has(i)))) {
      const name = nameFor(atoms);
      if (!name) { missed++; continue; }
      if (!m.captions?.some((c) => c.text === name && c.under?.some((i) => atoms.includes(i)))) m = addCaption(m, { text: name, ...typeset(name), x: 0, y: 0, under: atoms })[0];
    }
    // Captions that count as chemistry (Rh as rhodium): the picked ones, or all of them with nothing selected. The
    // name goes under the caption.
    const own = selection.size ? new Set<number>() : pickedChem(picked);
    chem.captions.forEach((id, k) => {
      const i = doc.atoms.length + k, c = doc.captions!.find((x) => x.id === id)!;
      if (own && !own.has(i)) return;
      const name = nameFor([i], chem.mol), at = belowCaption(c);
      if (!name) { missed++; return; }
      if (!m.captions?.some((x) => x.text === name && Math.hypot(x.x - at.x, x.y - at.y) < 1e-6)) m = addCaption(m, { text: name, ...typeset(name), ...at })[0];
    });
    setNotice(missed === 0 ? undefined : missed === 1 ? "Octet cannot name this structure yet." : `Octet cannot name ${missed} of these structures yet.`);
    if (m !== doc) set(m, true);
  }
  const nameable = loaded && chem.mol.atoms.length > 0;
  // Where text for a caption goes (its name, its properties): one line under it, in the same alignment.
  const belowCaption = (c: Caption) => ({ x: c.x, y: c.y - (1.4 * (whole(c).size ?? style.captionSize)) / style.bond, ...(c.align ? { align: c.align } : {}) });
  // Of the things picked, the first that draws a line: the Actions panel shows its colour and line width. A filled pen
  // curve's outline is only a hairline, so a flask shows its glass, not its liquid.
  const lineOf = <T extends Arrow | Shape | Cycle | Caption>(xs: T[]) => xs.find((x) => !("curve" in x && x.curve?.closed && x.fill)) ?? xs[0];
  // The colour the Actions panel shows as chosen: the first selected thing's (lineOf), for every kind of selection.
  const selectionColour = (context: Context): { value: string; tints?: boolean } | undefined => {
    // A label being typed: its colour (the colour row is for it while its box is open).
    if (editing && doc.atoms[editing.atom]) return { value: editing.colour && editing.colour !== "element" ? editing.colour : doc.atoms[editing.atom].colour ?? "#000000" };
    // Pictures take no colour (ChemDraw's pictures have none).
    if (context.kind === "shape" && doc.shapes?.every((x) => !picked.has(x.id) || x.kind === "picture")) return undefined;
    if (context.kind === "caption" || context.kind === "shape") return { value: context.colour, tints: context.kind === "shape" && context.shape === "highlight" };
    if (context.kind === "spot" && spotPick) return { value: doc.shapes?.find((x) => x.id === spotPick.plate)?.tlc?.spots[spotPick.index]?.colour ?? "#000000" };
    if (context.kind === "empty" || context.kind === "drawing") return undefined;
    if (context.kind === "grid") return { value: doc.grids?.find((g) => g.arrow === gridPick?.arrow)?.colour ?? "#000000" };
    // A bond alone takes its own colour (the colour action sets the bond only), so its row shows the bond's.
    if (context.kind === "bond") return { value: doc.bonds.find((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1]))?.colour ?? "#000000" };
    // A cycle's side arrow picked: its own colour, else its cycle's.
    if (context.kind === "cycle" && context.side && branchPick) { const c = doc.cycles?.find((x) => x.id === branchPick.cycle); return { value: c?.branches?.find((b) => b.id === branchPick.branch)?.colour ?? c?.colour ?? "#000000" }; }
    const first = [...selection][0], thing = lineOf([...(doc.arrows ?? []), ...(doc.cycles ?? []), ...(doc.shapes ?? []), ...(doc.captions ?? [])].filter((x) => picked.has(x.id)));
    return { value: (first !== undefined ? doc.atoms[first]?.colour : thing?.colour) ?? "#000000" };
  };
  // The kinds of thing selected (structures, captions, arrows, shapes, cycles) and how many things. A caption under a
  // selected structure, on a picked arrow or in a picked cycle goes with it, and so do a picked cycle's intermediates.
  // A group selected whole counts as one thing, as Align takes it (things); lone: that group, when it is all that is
  // selected.
  // Whether the drawing's compound numbers are roman numerals; undefined when it has none (numbering.ts).
  const romanOrNone = () => (doc.captions?.some((c) => isNumber(c) && c.under?.length) ? romanNumbers(doc) : undefined);
  const mixOf = (): { kinds: number; count: number; atoms: boolean; lines: boolean; lone?: NonNullable<Mol["groups"]>[number] } => {
    if (!picked.size) return { kinds: selection.size ? 1 : 0, count: 0, atoms: selection.size > 0, lines: false };
    const cycles = (doc.cycles ?? []).filter((c) => picked.has(c.id)), inCycle = new Set(cycles.flatMap(cycleAtoms));
    const arrowIds = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id)).map((a) => a.id)), shapes = (doc.shapes ?? []).filter((x) => picked.has(x.id)).map((x) => x.id);
    const captions = (doc.captions ?? []).filter((c) => picked.has(c.id) && !c.under?.some((i) => selection.has(i)) && !(c.on && arrowIds.has(c.on.arrow)) && !(c.cycle && cycles.some((y) => y.id === c.cycle!.cycle))).map((c) => c.id);
    const structures = fragments(doc).filter((g) => g.some((i) => selection.has(i) && !inCycle.has(i)));
    const counts = [structures.length, captions.length, arrowIds.size, shapes.length, cycles.length];
    const groups = selectedGroups(doc, selection, picked), held = new Set(groups.flatMap((g) => g.items)), grouped = new Set(groups.flatMap((g) => g.atoms));
    const loose = structures.filter((f) => !grouped.has(f[0])).length + [...captions, ...arrowIds, ...shapes, ...cycles.map((c) => c.id)].filter((id) => !held.has(id)).length;
    return { kinds: counts.filter(Boolean).length, count: loose + groups.length, atoms: structures.length > 0, lines: !structures.length && !captions.length, ...(groups.length === 1 && !loose ? { lone: groups[0] } : {}) };
  };
  // A cycle's side arrow, as the Actions panel shows it: its ends, inside the circle, moved from where Octet puts it, and
  // its heads.
  // inside: whether its first end that is not a structure is inside the circle (undefined: all its ends are structures).
  const insideOf = (b: CycleBranch) => { const e = [b.in, b.out].find((x) => x && !x.atoms?.length); return e && (e.reach ?? 1.1) < 0; };
  const sideOf = (b: CycleBranch, c: Cycle) => ({ ends: b.in && b.out ? "both" as const : b.in ? "in" as const : "out" as const, inside: insideOf(b),
    moved: b.meet !== undefined || [b.in, b.out].some((e) => e?.along !== undefined || e?.reach !== undefined), start: branchHeads(b)[0], end: branchHeads(b)[1], head: c.head ?? "solid", size: c.arrowSize ?? "small" });
  // The line width an arrow, shape or cycle is drawn with, at its scale: its own, a table's rules', or the document's
  // (a filled pen curve's outline is a hairline unless set; curveFill).
  const widthOf = (x: Arrow | Shape | Cycle) => (("table" in x && x.table ? x.table.weight : x.width) ?? ("curve" in x && x.curve?.closed && x.fill ? 0.05 : style.line)) * scaleOf(x);
  // What the Actions panel shows: it follows the selection (and, while typing, the caret). Worked out when the panel
  // draws and when an action runs.
  // Arrows and lines with a head at either end (or heads of their own kind), which the head size acts on.
  const headed = (a: Arrow) => a.kind === "equilibrium" || a.kind === "retro" || a.kind === "block" || (!isOrbital(a) && a.kind !== "cut" && (headsOf(a).start !== "none" || headsOf(a).end !== "none"));
  // Stoichiometry grids, each laid out under its reaction: a column under each reactant, each reagent drawn or written
  // above or below an arrow (as ChemDraw's grid takes them, as reactants), and each product; text reagents such as H2O
  // or MeOH too, each item of a list such as "NaBH4, MeOH" on its own, their molar mass from the formula or the
  // abbreviation. The row names on the left, the amounts worked out from what was typed (stoich.ts). Typed values show
  // bold, worked-out ones plain, as ChemDraw's grid does. Hidden rows and columns are left out.
  // One grid for each reaction (an experiment page gives each new arrow one). On an experiment page every row shows.
  // While a part is being exported (a selection), its own grids, read from the part as it is drawn then.
  const gridViews = useMemo(() => { const m = exporting ?? doc; const seen = new Set<number>(); return (loaded ? m.grids ?? [] : []).flatMap((g) => {
    const r = findReaction(m, g.arrow, arrows, inkBox, captionBox);
    if (!r || seen.has(r.arrows[0])) return [];
    seen.add(r.arrows[0]);
    const steps = interpret(m, r, captionBox);
    if (!steps.length) return [];
    // label: what names it in a table of rows, its compound number or the text it is written as.
    const parts: { product: boolean; what: string; formula: string; mw: number; x: number; low: number; label?: string }[] = [];
    // conditions: only text with a molar mass makes a column ("0 °C" and "2 h" do not).
    const add = (p: Part, product: boolean, conditions = false) => {
      const x = (p.box[0] + p.box[2]) / 2, low = p.box[1];
      if (p.kind === "structure") { const a = analyse(pickAtoms(m, p.atoms))?.[0], n = m.captions?.find((c) => isNumber(c) && c.under?.some((i) => p.atoms.includes(i)))?.text; parts.push({ product, what: a?.formula ?? "?", formula: a?.formula ?? "", mw: a?.weight ?? 0, x, low, label: n }); return; }
      const text = m.captions?.find((c) => c.id === p.id)?.text ?? "", items = conditions ? conditionItems(text) : [text.trim()];
      items.forEach((item, k) => {
        const plain = item.replace(/^\d+\s+(?=\S)/, ""), weight = formulaWeight(plain), smiles = weight === undefined ? labelSmiles(plain) : undefined, read = smiles ? smilesWeight(smiles) : undefined;
        // The atmosphere's gas (N2, Ar, air) is not a reagent: it has no column.
        if (conditions && ((!weight && !read) || inert(item))) return;
        parts.push({ product, what: `"${item}"`, formula: weight ? plain.replace(/\s+/g, "") : read?.formula ?? "", mw: weight ?? read?.weight ?? 0, x: x + k * 0.01, low, label: plain });
      });
    };
    steps[0].reactants.forEach((p) => add(p, false));
    for (const st of steps) for (const p of [...st.above, ...st.below]) add(p, false, true);
    steps[steps.length - 1].products.forEach((p) => add(p, true));
    if (!parts.length) return [];
    const keyed = keyColumns(parts, g.typed, g.limiting), all = keyed.cols, hidden = g.hidden ?? {};
    const solved = solve(all, keyed.limiting), limiting = keyed.limiting ?? all.find((c) => !c.product)?.key;
    // The grid takes its arrow's scale (decision 0007). Columns stand under what they are, a column's width apart.
    const f = scaleOf(m.arrows?.find((a) => a.id === g.arrow) ?? {}), width = 3.4 * f;
    const cols = all.filter((c) => !hidden.cols?.includes(c.key)).sort((p, q) => p.x - q.x).map((c) => ({ ...c }));
    cols.forEach((c, k) => { if (k && c.x < cols[k - 1].x + width) c.x = cols[k - 1].x + width; });
    if (!cols.length) return [];
    const used = (fd: Field) => cols.some((c) => c.typed[fd] !== undefined), products = cols.some((c) => c.product);
    // As rows, Volume, Density, Molarity and Purity show only when used, on an experiment page too, so the table fits the page.
    const rows = GRID_ROWS.filter((row) => !hidden.rows?.includes(row.id) && (row.product ? products : row.shown && (!expPage || g.layout === "rows") ? row.shown.some(used) : true));
    // Below the components and the numbers under them.
    const under = (m.captions ?? []).filter((c) => c.under?.some((i) => r.atoms.includes(i))).map((c) => placed.find((p) => p.id === c.id)).filter(Boolean).map((p) => -p!.box[3] / L);
    const top = Math.min(...cols.map((c) => c.low), ...under) - 0.9 * f, rh = (style.captionSize * pt * 0.9 * 1.6 * f) / L;
    // The row names end a little before the first column; the rules start at the longest name.
    const left = Math.min(...cols.map((c) => c.x)) - width / 2 - 0.3 * f, size = style.captionSize * pt * 0.9 * f;
    const names = Math.max(...rows.map((row) => formulaWidth(row.name, size, false, false, fontStack(style.captionFont)) / L));
    // Every cell: its component and row, its middle, top and width, for picking and typing in it. As rows (Grid.layout),
    // the reagents each take a row and the products a section of their own under them, each section with its title and
    // the names of its columns; the first column names each component by its compound number or its text.
    type Cell = { key: string; row: string; x: number; y: number; w: number; product: boolean };
    type Text = { text: string; x: number; y: number; anchor: "start" | "middle"; bold?: true; formula?: true };
    let cells: Cell[] = [], texts: Text[] | undefined, rules: [number, number, number][] | undefined;
    if (g.layout === "rows") {
      const wide = (t: string, bold = false) => formulaWidth(t, size, bold, false, fontStack(style.captionFont)) / L;
      // A product's row: what it is, its expected mass, the mass measured and the yield; its equivalents only when typed.
      const ownEquiv = cols.some((c) => c.product && c.typed.equiv !== undefined), fits = (row: (typeof rows)[number], product: boolean) => row.product !== !product && !(product && (row.id === "expectedMoles" || (row.id === "equiv" && !ownEquiv)));
      const sections = ([[false, "Reagents"], [true, "Products"]] as const).map(([product, title]) => ({ product, title, fields: rows.filter((row) => fits(row, product)), comps: cols.filter((c) => c.product === product) })).filter((sec) => sec.comps.length && sec.fields.length);
      const x0 = Math.min(...cols.map((c) => c.x)) - width / 2, nameW = Math.max(...sections.flatMap((sec) => [wide(sec.title, true), ...sec.comps.map((c) => wide(c.label ?? ""))])) + 0.4 * f;
      let y = top;
      texts = []; rules = [];
      for (const sec of sections) {
        let x = x0 + nameW;
        const at = sec.fields.map((row) => { const w = Math.max(width, wide(row.name) + 0.4 * f); x += w; return [x - w / 2, w]; });
        rules.push([x0, x, y]);
        texts.push({ text: sec.title, x: x0, y, anchor: "start", bold: true }, ...sec.fields.map((row, j) => ({ text: row.name, x: at[j][0], y, anchor: "middle" as const })));
        y -= rh;
        rules.push([x0, x, y]);
        for (const c of sec.comps) {
          texts.push({ text: c.label ?? "", x: x0, y, anchor: "start", formula: true });
          cells.push({ key: c.key, row: "name", x: x0 + nameW / 2, y, w: nameW, product: c.product }, ...sec.fields.map((row, j) => ({ key: c.key, row: row.id, x: at[j][0], y, w: at[j][1], product: c.product })));
          y -= rh;
        }
        rules.push([x0, x, y]);
        y -= 0.5 * rh;
      }
    } else cells = rows.flatMap((row, k) => cols.map((c) => ({ key: c.key, row: row.id, x: c.x, y: top - k * rh, w: width, product: c.product })));
    return [{ arrow: g.arrow, all, cols, rows, solved, limiting, top, rh, left, width, start: left - names - 0.2 * f, f, colour: g.colour, hiding: !!(hidden.rows?.length || hidden.cols?.length), cells, texts, rules }];
  }); }, [loaded, doc, drawing, placed, exporting, expPage]); // eslint-disable-line react-hooks/exhaustive-deps
  type GridView = (typeof gridViews)[number];
  // A reagent table's box: from its row names to its last column, from its top to its last row.
  function tableSpan(v: GridView): number[] {
    return [v.start, Math.min(...v.cells.map((c) => c.y - v.rh), ...(v.rules ?? []).map((r) => r[2])), Math.max(...v.cells.map((c) => c.x + c.w / 2)), v.top];
  }
  // An edit on an experiment page whose reagent table runs past the bottom of the Reaction scheme box grows the box,
  // and moves what is under it down (growScheme), in the edit's own undo step. A drawing opened is left as it is.
  useEffect(() => {
    const b = expPage && doc === lastSet.current ? schemeSpan(doc) : undefined;
    if (!b) return;
    const low = gridViews.map(tableSpan).filter((t) => t[3] < b[3] && t[3] > b[1] && t[0] < b[2] && t[2] > b[0]).map((t) => t[1]);
    const grown = low.length ? growScheme(doc, Math.min(...low)) : doc;
    if (grown !== doc) { lastSet.current = grown; dispatch({ type: "amend", mol: grown }); }
  }, [gridViews]); // eslint-disable-line react-hooks/exhaustive-deps
  tableSpans.current = gridViews.map(tableSpan);
  // Opened or saved: an experiment page's details, with its first product's yield, go to Home's Experiments list, and
  // a drawing that is no longer one leaves it. The yield follows when the chemistry has loaded.
  useEffect(() => {
    if (!TAURI || !file.path) return;
    const saved = file.saved, details = detailsOf(saved.annotations), v = gridViews[0], product = v?.all.find((c) => c.product), y = product && v.solved[product.key]?.yield;
    const page = experimentPage(purposeOf(settings, saved.style?.purpose)?.kind, saved.style?.purpose, saved.annotations) && Object.keys(details).length > 0;
    invoke("experiment_note", { path: file.path, experiment: page ? { details, ...(y !== undefined && y >= 0 && y <= 100 ? { yield: y } : {}) } : null }).catch(() => {});
  }, [file, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // A cell's text, and whether it was typed.
  const gridText = (v: GridView, c: GridView["cols"][number], row: (typeof GRID_ROWS)[number]): { text: string; typed?: boolean } => {
    const s = v.solved[c.key];
    if (row.id === "formula") return { text: c.formula };
    if (row.id === "mw") return { text: c.mw ? formatAmount(c.mw, "mw") : "" };
    if (row.id === "limiting") return { text: c.product ? "" : v.limiting === c.key ? "Yes" : "" };
    if (row.product !== c.product && row.product !== undefined) return { text: "" };
    if (row.id === "expected") return { text: formatAmount(s?.expectedMass, "mass") };
    if (row.id === "expectedMoles") return { text: formatAmount(s?.expectedMoles, "moles") };
    if (row.id === "yield") return { text: formatAmount(s?.yield, "yield") };
    if (!row.field || (c.product && !["purity", "measured", "equiv"].includes(row.field))) return { text: "" };
    return { text: formatAmount(s?.[row.field as keyof typeof s] as number | undefined, row.field), typed: c.typed[row.field] !== undefined };
  };
  // The grid cell under a point (drawing units), if any.
  const gridCellAt = (p: P) => {
    for (const v of gridViews) {
      const c = v.cells.find((x) => Math.abs(p[0] - x.x) < x.w / 2 && p[1] <= x.y && p[1] > x.y - v.rh);
      if (c) return { arrow: v.arrow, key: c.key, row: c.row, x: c.x, y: c.y, w: c.w, product: c.product };
    }
    return undefined;
  };
  const [gridEdit, setGridEdit] = useState<{ arrow: number; key: string; row: string; x: number; y: number; w: number; product: boolean; value: string }>();
  // A grid cell clicked with Select: picked, for the grid's actions (Set as limiting, Hide row and column, colour).
  const [gridPick, setGridPick] = useState<{ arrow: number; key: string; row: string }>();
  useEffect(() => { if (selection.size || picked.size) setGridPick(undefined); }, [selection, picked]);
  // A grid changed: its typed values and limiting reactant saved under each column's key as the grid now reads them
  // (keyColumns), so values matched by order are kept by key from now on.
  const changeGrid = (arrow: number, change: (g: Grid, v: GridView) => Partial<Grid>) => {
    const g = doc.grids?.find((x) => x.arrow === arrow), v = gridViews.find((x) => x.arrow === arrow);
    if (!g || !v) return;
    const now: Grid = { ...g, typed: Object.fromEntries(v.all.filter((c) => Object.keys(c.typed).length).map((c) => [c.key, c.typed])), limiting: v.limiting };
    set({ ...doc, grids: doc.grids!.map((x) => (x === g ? { ...now, ...change(now, v) } : x)) }, true);
  };
  // Typing in a cell: the unit says what it is (250 mg a mass, 0.5 mL a volume, 1.2 eq equivalents), a bare number is
  // the row's own quantity, and an empty cell clears it. A reactant's mass, moles, volume or equivalents replaces the
  // others (they are four ways to say how much); a product's equivalents are its coefficient. Limiting? sets the
  // limiting reactant.
  function commitGridCell(typed: string) {
    const w = gridEdit, text = expandEscapes(typed, keptText(gridEdit?.value)); // 5 \mu{}L is 5 μL (escapes.ts)
    setGridEdit(undefined);
    if (!w) return;
    const row = GRID_ROWS.find((r) => r.id === w.row)!;
    if (row.id === "limiting") return w.product ? undefined : changeGrid(w.arrow, () => ({ limiting: w.key }));
    if (!row.field) return;
    const field0 = row.field;
    changeGrid(w.arrow, (g) => {
      const typed = { ...(g.typed[w.key] ?? {}) };
      if (!text.trim()) delete typed[field0];
      else {
        const fields: Field[] = w.product ? ["measured", "purity", "equiv"] : [field0, "mass", "moles", "volume", "equiv", "density", "molarity", "purity"];
        const bare = /^\s*[\d.,]+(e[+-]?\d+)?\s*$/i.test(text), field = bare ? (w.product && field0 !== "purity" && field0 !== "equiv" ? "measured" : field0) : fields.find((fd) => parseAmount(text, fd) !== undefined);
        const value = field && parseAmount(text, field);
        if (!field || value === undefined) { setNotice("Type an amount with its unit, such as 250 mg, 1.2 eq or 0.5 mL.", "info"); return {}; }
        if (!w.product && ["mass", "moles", "volume", "equiv"].includes(field)) for (const fd of ["mass", "moles", "volume", "equiv"] as Field[]) delete typed[fd];
        typed[field] = value;
      }
      return { typed: { ...g.typed, [w.key]: typed } };
    });
  }
  const contextOf = (): Context => {
    // Typing, or the Text tool in hand: the panel is a text editor for that text (or the next text).
    if (writing) {
      const st = { ...(writing.id !== undefined ? doc.captions?.find((c) => c.id === writing.id) : undefined), ...writing.style };
      const range = richApi.current?.range() ?? [writing.value.length, writing.value.length], at = writing.pending ?? common(writing.runs ?? [{ text: writing.value }], range[0], range[1]);
      return { kind: "caption", mode: "typing", convertible: false, colour: at.colour ?? st.colour ?? style.colour, count: 1, bold: !!(at.bold ?? st.bold), italic: !!(at.italic ?? st.italic), underline: !!(at.underline ?? st.underline),
        size: at.size ?? st.size ?? style.captionSize, align: st.align ?? "centre", attached: false, attachable: false, script: at.script, font: at.font ?? st.font ?? style.captionFont, fonts: fontList };
    }
    if (tool === "text" && !selection.size && !picked.size)
      return { kind: "caption", mode: "next", convertible: false, colour: textStyle.colour ?? style.colour, count: 1, bold: !!textStyle.bold, italic: !!textStyle.italic, underline: !!textStyle.underline, size: textStyle.size ?? style.captionSize, align: textStyle.align ?? "left", attached: false, attachable: false, font: textStyle.font ?? style.captionFont, fonts: fontList };
    // A whole reaction picked (as a double-click on its arrow picks it).
    const reaction = reactionPicked();
    if (reaction) return { kind: "reaction", roman: romanOrNone(), grid: !!doc.grids?.some((g) => reaction.arrows.includes(g.arrow)), steps: reaction.arrows.length, structures: reaction.steps.filter((x) => x.kind === "structure").length, clean: reactionClean(doc, reaction, arrows, reactionLayout(placedBox)), mapped: reaction.atoms.some((i) => doc.atoms[i]?.map) };
    // A cycle picked (with its intermediates), when it is all that is picked.
    const mix = mixOf();
    const pickedCycle = (doc.cycles ?? []).find((c) => picked.has(c.id));
    if (pickedCycle && mix.kinds === 1) {
      const s = stepHere(pickedCycle), step = pickedCycle.steps?.[s], r = step?.ratio ?? 1;
      return { kind: "cycle", clockwise: pickedCycle.clockwise, steps: pickedCycle.nodes.length, centre: !!doc.captions?.some((c) => c.cycle?.cycle === pickedCycle.id && c.cycle.side === "centre"), width: widthOf(pickedCycle), gap: pickedCycle.gap ?? 6,
        step: stepPick?.cycle === pickedCycle.id && picked.size === 1 && !selection.size, reversible: step?.kind === "equilibrium", balance: r > 1 ? "forward" : r < 1 ? "back" : "equal",
        shaped: [step?.lead, step?.trail, step?.bow, step?.ratio].some((x) => x !== undefined), hidden: !!step?.hidden, arcs: !!pickedCycle.steps?.some((x) => x?.hidden), named: !!doc.captions?.some((x) => x.cycle?.cycle === pickedCycle.id && x.cycle.step === s && x.cycle.side === "name"),
        ...(branchPick?.cycle === pickedCycle.id && picked.size === 1 && !selection.size ? (() => { const b = pickedCycle.branches?.find((x) => x.id === branchPick.branch); return b ? { side: sideOf(b, pickedCycle) } : {}; })() : {}), head: pickedCycle.head ?? "solid", size: pickedCycle.arrowSize ?? "small" };
    }
    // Different kinds of thing picked together (an arrow and a box, a caption and an atom, everything): what applies to
    // all of them. Lines picked together (arrows, shapes and cycles only) share one line width.
    const lined = mix.lines ? lineOf([...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => picked.has(x.id))) : undefined;
    if (mix.kinds > 1) return { kind: "selection", count: mix.count, ...(mix.lone ? { name: groupTitle(doc, mix.lone) } : {}), atoms: mix.atoms, joinable: mix.atoms && !!joinSelection(doc, selection), ...(lined ? { width: widthOf(lined) } : {}) };
    // A TLC spot picked on its plate.
    const plate = spotPick && !selection.size && picked.size === 1 && picked.has(spotPick.plate) ? doc.shapes?.find((x) => x.id === spotPick.plate) : undefined, spot = plate?.tlc?.spots[spotPick!.index];
    if (plate && spot) {
      // The sizes shown are the sizes drawn, at the plate's scale.
      const t = tlcLayout(plate), { rx, ry } = t.size(spot);
      return { kind: "spot", style: spot.style ?? "filled", dashed: !!spot.dashed, bold: !!spot.bold, doubled: !!spot.doubled, w: rx, h: ry, tail: (spot.tail ?? 0) * t.f, rf: !!spot.showRf, pt: style.bond };
    }
    // A table's lines, the alignment of the column last typed in (or of every column, when they share one), and its
    // lines' width.
    const tableContext = (sh: Shape) => {
      const cols = sh.table ? tableLayout(sh, cellWidth(sh), style.captionSize).cols : 0, aligns = Array.from({ length: cols }, (_, c) => sh.table?.align?.[c] ?? "centre");
      const cellAlign = lastCell?.id === sh.id ? aligns[lastCell.c] : aligns.every((a) => a === aligns[0]) ? aligns[0] : undefined;
      return { lines: linesOf(sh.table), cellAlign, weight: ((sh.table ? sh.table.weight : sh.width) ?? style.line) * scaleOf(sh), cell: lastCell?.id === sh.id };
    };
    // Shapes picked on their own.
    const pickedShapes = (doc.shapes ?? []).filter((x) => picked.has(x.id));
    if (!selection.size && pickedShapes.length && pickedShapes.length === picked.size) {
      const first = pickedShapes[0];
      return {
        kind: "shape", count: pickedShapes.length, shape: first.kind, dashed: !!first.dashed, boldLine: !!first.boldLine, rgroup: pickedShapes.some((x) => x.rgroup), colour: first.colour ?? (first.kind === "highlight" ? HIGHLIGHT : "#000000"),
        style: first.fill ?? (first.shadow ? "shadow" : first.dashed ? "dashed" : "plain"), side: first.side ?? "both", mark: first.mark ?? "", rf: !!first.tlc?.rf, ...tableContext(first), hide: first.tlc?.hide ?? [], ticks: !!first.tlc?.ticks, transparent: !!first.tlc?.transparent, lane: lanePick?.plate === first.id, shade: { ...SHADE, ...first.shade, pt: style.bond },
        ...(first.kind === "table" || first.kind === "tlc" ? { text: { bold: !!first.bold, italic: !!first.italic, underline: !!first.underline, font: first.font ?? style.captionFont, size: first.size ?? (first.kind === "tlc" ? style.captionSize * 0.8 : style.captionSize) } } : {}),
      };
    }
    // Arrows picked on their own.
    const pickedArrows = (doc.arrows ?? []).filter((a) => picked.has(a.id));
    if (!selection.size && pickedArrows.length && pickedArrows.length === picked.size)
      return {
        kind: "arrow", count: pickedArrows.length, arrow: pickedArrows[0].kind, curved: pickedArrows.some(curved), style: pickedArrows[0].style ?? "plain", orbital: pickedArrows[0].orbital,
        heads: pickedArrows.every(takesHeads), shaped: pickedArrows.every(shapesHeads), ...headsOf(pickedArrows[0]), head: pickedArrows[0].head ?? "solid",
        closed: pickedArrows[0].curve ? !!pickedArrows[0].curve.closed : undefined, fill: pickedArrows[0].fill ?? "none",
        width: widthOf(lineOf(pickedArrows)),
        // The sweep the curved ones share, if it is one on offer.
        sweep: SWEEPS.find((sw) => pickedArrows.filter(curved).every((a) => Math.abs(sweepOf(a.bend ?? 0) - sw) < 2)),
        size: pickedArrows.every(headed) ? sizeOf(pickedArrows[0]) ?? "own" : undefined, ratio: pickedArrows[0].ratio ?? 1,
        fillable: pickedArrows.every((a) => a.kind === "block" || !!a.curve?.closed),
        point: pickedArrows.length === 1 && pointable(pickedArrows[0]) ? (pickedArrows[0].point ? (pickedArrows[0].bend ? "bent" : "remove") : "add") : undefined,
      };
    if (!selection.size && picked.size) {
      const cs = (doc.captions ?? []).filter((c) => picked.has(c.id)), c = cs[0];
      if (c) {
        const p = placed.find((x) => x.id === c.id), w = whole(c);
        return { kind: "caption", mode: "picked", colour: w.colour ?? style.colour, convertible: cs.length === 1 && namesLoaded && !!(nameToSmiles(c.text) || looksLikeSmiles(c.text) || suggestName(c.text, false)), count: cs.length, bold: !!w.bold, italic: !!w.italic, underline: !!w.underline, size: w.size ?? style.captionSize, align: c.align ?? "centre", attached: !!c.under, attachable: !c.under && !!p && !!structureAbove(anchorOf(p), 4) , font: w.font ?? style.captionFont, fonts: fontList, labelable: cs.some(labelable),
          ...(cs.length === 1 && isSide(c.cycle) && branchOf(doc, c.cycle!) ? { cycleSide: sideOf(branchOf(doc, c.cycle!)!.b, branchOf(doc, c.cycle!)!.c) } : {}),
          ...(cs.length === 1 && c.cycle?.side === "name" ? { cycleName: { moved: c.cycle.at !== undefined || c.cycle.reach !== undefined } } : {}),
          // Their Interpret chemically, while the document's is on: whether each one that reads as chemistry has it on.
          ...(style.interpret && cs.some(labelable) ? { chemical: cs.filter(labelable).every((x) => x.chemical !== false) } : {}) };
      }
    }
    // A stoichiometry grid's cell picked.
    const pickedGrid = gridPick && !selection.size && !picked.size ? gridViews.find((v) => v.arrow === gridPick.arrow) : undefined, pickedCol = pickedGrid?.all.find((c) => c.key === gridPick!.key);
    if (pickedGrid && pickedCol) return { kind: "grid", product: pickedCol.product, limiting: pickedGrid.limiting === pickedCol.key, hidden: pickedGrid.hiding, rows: !!pickedGrid.texts };
    if (!selection.size) return doc.atoms.length || doc.captions?.length || doc.arrows?.length || doc.shapes?.length ? { kind: "drawing", nameable, generic: genericSites(doc, doc.atoms.keys()) } : { kind: "empty" };
    // Atoms that are only in a drag (an Option-drag's copies, before they are kept) are not in the drawing yet.
    const ids = [...selection].filter((i) => i < doc.atoms.length);
    if (!ids.length) return { kind: "drawing", nameable };
    if (ids.length === 1) {
      const a = doc.atoms[ids[0]];
      // Its structure's and and or groups, and the lowest new one of each, for the stereo flag buttons.
      const centre = stereocentres(doc).includes(ids[0]), structure = centre ? fragments(doc).find((g) => g.includes(ids[0])) ?? [] : [];
      const groups = (kind: "&" | "or") => [...new Set([...structure.flatMap((i) => { const g = /^(&|or)(\d+)$/.exec(doc.atoms[i].enhanced ?? ""); return g && g[1] === kind ? [Number(g[2])] : []; }), nextGroup(doc, structure, kind)])].sort((p, q) => p - q);
      return { kind: "atom", text: labelText([ids[0]]), label: a.text ?? a.label, charge: a.charge ?? 0, terminal: neighbours(doc, ids[0]).length === 1, carbon: a.label === "C" && !a.text, centre, enhanced: a.enhanced, groups: centre ? { and: groups("&"), or: groups("or") } : undefined, halo: a.halo, fill: fillOf(doc, selection), numbered: !!a.number, repeat: lastLabel.current };
    }
    const bi = ids.length === 2 ? doc.bonds.findIndex((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1])) : -1;
    if (bi >= 0) {
      const b = doc.bonds[bi], style = bondKindOf(b);
      return { kind: "bond", style, double: b.type === 2, flippable: !!b.stereo || b.display === "dative" || b.display === "hollow", halo: b.halo, fill: fillOf(doc, selection), ring: drawnRings(doc).some((r) => r.includes(b.atoms[0]) && r.includes(b.atoms[1])) };
    }
    // Lone pairs: whether the heteroatoms have any to show, and whether they all show already.
    const used = bondOrders(doc), hetero = ids.filter((i) => doc.atoms[i].label !== "C" && freePairs(doc, i, used[i]) > 0);
    const pairs = !hetero.length ? undefined : hetero.every((i) => (doc.atoms[i].pairs ?? 0) >= freePairs(doc, i, used[i])) ? "shown" as const : "hidden" as const;
    // Its stereocentres as a whole: absolute (no flags), racemic (all &1), relative (all or1), or a mix.
    const centres = stereocentres(doc, selection), flags = new Set(centres.map((i) => doc.atoms[i].enhanced ?? ""));
    const stereo = !centres.length ? undefined : flags.size > 1 ? "mixed" : flags.has("&1") ? "racemic" : flags.has("or1") ? "relative" : flags.has("") ? "absolute" : "mixed";
    // A 3D structure (Structure Perspective): depth shading on or off.
    const solid = ids.some((i) => Math.abs(doc.atoms[i].location[2] ?? 0) > 1e-3);
    return { kind: "structure", text: labelText(ids), atoms: ids.length, generic: genericSites(doc, fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat()), hydrogens: ids.some((i) => doc.atoms[i].label === "H" && !doc.atoms[i].text), structures: fragments(doc).filter((g) => g.some((i) => selection.has(i))).length, next: nextCompound(doc), roman: romanOrNone(), nameable, pairs, stereo, joinable: !!joinSelection(doc, selection),
      ...(solid ? { depth: fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat().some((i) => doc.atoms[i].shade) } : {}), cip: fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat().every((i) => doc.atoms[i].cip), numbers: ids.every((i) => doc.atoms[i].number),
      // Aromatic rings drawn with circles, so the aromatic display action can name what it shows next.
      circles: fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat().some((i) => doc.atoms[i].circle),
      // The highlight the selected atoms share, and the ring fill of the rings a fill would go in, if they share one.
      halo: ids.every((i) => doc.atoms[i].halo === doc.atoms[ids[0]].halo) ? doc.atoms[ids[0]].halo : undefined, fill: fillOf(doc, selection),
      properties: settings.properties }; // so the Properties action names what it does next, as the palette does
  };
  // The panel's context, worked out again only when something it reads changes: not on each frame of a drag or of
  // the Pen (the drawing and the captions' places change then, and the context follows them when what is shown is the
  // drawing again). While text is typed, the caret changes it too, so the panel works it out as it draws (see Actions
  // below).
  const settled = shown === doc;
  const panelContext = useMemo(() => (writing ? undefined : contextOf()), [doc, selection, picked, writing, tool, textStyle, spotPick, lanePick, lastCell, namesLoaded, loaded, style, fontList, settled && drawing, settled && placed, gridPick, gridViews, settings.properties]); // eslint-disable-line react-hooks/exhaustive-deps
  // Curves > Solid, Hollow and Angled Arrowhead: the selection's head shape ticked, and on only where heads take one.
  const heads = headMenu(panelContext);
  useEffect(() => {
    if (TAURI) void Promise.all(HEAD_SHAPES.map((h) => invoke("set_check", { id: `curves_head_${h}`, checked: heads.head === h, enabled: !!heads.head }))).catch(() => {});
  }, [heads.head, heads.cycle, fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  // The formula and mass the panel shows (of the selection, the picked captions that count as chemistry, or everything
  // with those captions): only while it is open and shows them, and only for the first three structures, as it shows
  // no more.
  const facts = settings.actions && (panelContext?.kind === "drawing" || panelContext?.kind === "structure" || (panelContext?.kind === "caption" && panelContext.mode === "picked"));
  const analysis = useMemo(() => {
    if (!loaded || !facts) return undefined;
    const own = selection.size ? undefined : pickedChem(picked);
    // With each structure's abbreviation, once the names engine has loaded (TREN · C6H18N4).
    return analyse(selection.size ? subset(doc, selection) : own ? subset(chem.mol, own) : chem.mol, 3, namesLoaded ? abbreviationOf : undefined);
  }, [loaded, facts, doc, chem, selection, picked, namesLoaded, settings.dictionary]); // eslint-disable-line react-hooks/exhaustive-deps
  // The Properties panel's values, while it is open: for each structure in the selection (or the drawing), with
  // each structure's atoms in the drawing (for Add to drawing). While a box or lasso sweeps, the panel keeps the
  // values it has until the pointer stops for a moment or lets go, so it does not work them out on every move.
  const sweep = drag?.kind === "box" || drag?.kind === "lasso" ? drag.base : undefined; // the same for the whole sweep
  const [paused, setPaused] = useState<{ sweep: Set<number>; selection: Set<number> }>();
  useEffect(() => {
    if (!sweep) return;
    const t = setTimeout(() => setPaused({ sweep, selection }), 250);
    return () => clearTimeout(t);
  }, [sweep, selection]);
  const propertySelection = !sweep ? selection : paused?.sweep === sweep ? paused.selection : undefined;
  const lastProperties = useRef<{ atoms: number[][]; values: PropertyValues }>(undefined);
  const properties = useMemo(() => {
    if (!loaded || !settings.properties) return undefined;
    if (!propertySelection) return lastProperties.current;
    // ids: each value's atoms in chem (a caption that counts as chemistry is an atom after the drawing's).
    const own = propertySelection.size ? undefined : pickedChem(picked);
    const ids = propertySelection.size ? [...propertySelection].filter((i) => i < doc.atoms.length).sort((a, b) => a - b) : own ? [...own].sort((a, b) => a - b) : chem.mol.atoms.map((_, i) => i);
    const base = propertySelection.size ? subset(doc, propertySelection) : own ? subset(chem.mol, own) : chem.mol, groups = fragments(base), found = structures(base, groups);
    if (!found) return undefined;
    const kept = groups.map((g, k) => ({ atoms: g.map((i) => ids[i]), s: found[k] })).filter((x) => x.s).slice(0, 12);
    // Octet's own calculators, once for each structure's values; pKa sites above 13 (alcohols, amides) are left out.
    const calc = (s: Structure, g: Graph) => {
      if (!calculated.has(s)) { const p = calculate(g); calculated.set(s, { ...p, pka: p.pka.filter((x) => x.pka < 13), logS: s.logP !== undefined ? logS(s.logP, s.weight, p) : undefined }); }
      return calculated.get(s);
    };
    return { atoms: kept.map((x) => x.atoms), values: propertyValues(kept.map((x) => x.s!), calc, settings.decimals) };
  }, [loaded, settings.properties, settings.decimals, doc, chem, propertySelection, picked]); // eslint-disable-line react-hooks/exhaustive-deps
  lastProperties.current = properties;
  // The Mass spec panel (MassSpec.tsx): the structure it analyses (the one with an atom it opened on, as the drawing
  // changes). Its fragmentation lines are the drawing's cut lines.
  const msAtoms = useMemo(() => (massSpec ? fragments(doc).find((g) => g.some((i) => massSpec.includes(i))) : undefined), [doc, massSpec]);
  // The drawing's measured mass spectrum, as Mass Spec Analysis's peak list: its ions are matched against it.
  const msMeasured = useMemo(() => { const s = doc.spectra?.find((x) => x.kind === "ms"); return s && msPeaks(s); }, [doc.spectra]);
  function openMassSpec(atom: number) {
    const group = fragments(doc).find((g) => g.includes(atom));
    if (!group) return;
    setSpectrum(undefined);
    setMassSpec(group);
  }
  // The line a Mass spec analysis drag makes, and its id: a new line through the drag's corners to the pointer, or the
  // line the drag started from, made longer.
  function msLine(d: Extract<Drag, { kind: "arrow" }>, to: P): [Mol, number] {
    const old = d.longer && doc.arrows?.find((a) => a.id === d.longer!.id);
    if (old && d.longer) return [updateArrow(doc, old.id, { curve: undefined, ...extendCut(old, d.longer.end, d.corners ?? [], to) }), old.id];
    return addArrow(doc, { kind: "cut", ...cutThrough([d.from, ...(d.corners ?? []), to]) });
  }
  function massSpecLine(d: Extract<Drag, { kind: "arrow" }>) {
    const { from, to, target } = d;
    const bond = target.bond ?? bondAt(doc, from, 0.3), one = target.atom ?? atomAt(doc, from, 0.5) ?? (bond !== undefined ? doc.bonds[bond]?.atoms[0] : undefined);
    if (d.longer && (!to || Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.2)) return;
    if (!to || (Math.hypot(to[0] - from[0], to[1] - from[1]) < 0.2 && !d.corners?.length)) return one !== undefined && one < doc.atoms.length ? openMassSpec(one) : setNotice("Drag the line across one or more bonds.", "info");
    const [next, id] = msLine(d, to), line = next.arrows!.find((a) => a.id === id)!, crossed = crossedBonds(doc, cutPoints(line));
    if (!crossed.length) return setNotice("Drag the line across one or more bonds.", "info");
    set(next);
    openMassSpec(doc.bonds[crossed[0].bond].atoms[0]);
  }
  // Opening the panel scrolls the canvas up if the panel would cover the structure, as the Spectrum panel does, and
  // again as the panel grows (its rows come in, a peak list opens).
  useEffect(() => {
    const el = document.querySelector(".massspec");
    if (!massSpec || !el) return;
    const fit = () => {
      const atoms = (msAtoms ?? []).filter((i) => doc.atoms[i]), panel = el.getBoundingClientRect(), box = svg.current?.getBoundingClientRect();
      const low = Math.min(...atoms.map((i) => pos(doc, i)[1]));
      if (!box || !Number.isFinite(low) || el.classList.contains("expanded")) return;
      const view = views.get(), over = view.y - low * L * view.zoom + 2 * L * view.zoom - (panel.top - box.top);
      if (over > 0) moveView({ ...view, y: view.y - over });
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [massSpec]); // eslint-disable-line react-hooks/exhaustive-deps
  // Add to drawing from the Mass spec panel: the spectrum under the structure (lines and captions in one plain group), each
  // fragment's ion and m/z beside it, or the HRMS line under the structure.
  function addMassSpec(a: MsAdd) {
    const atoms = (msAtoms ?? []).filter((i) => doc.atoms[i]), ps = atoms.map((i) => pos(doc, i));
    if (!ps.length) return;
    const f = atoms.reduce((s0, i) => s0 + scaleOf(doc.atoms[i]), 0) / atoms.length, labelPt = style.captionSize * 0.8 * f, size = Math.round(labelPt * 10) / 10;
    let m = doc, items: number[] = [];
    const keep = ([next, id]: [Mol, number]) => { m = next; items.push(id); };
    if (a.what === "hrms") { const runs = normalise(chemRuns(a.text)); if (a.text) keep(addCaption(m, { text: plainOf(runs), x: 0, y: 0, under: atoms, runs })); }
    else if (a.what === "label") {
      // Beside the fragment, away from the structure's middle; the molecule's under it.
      const r = a.row, qs = r.atoms.filter((i) => doc.atoms[i]).map((i) => pos(doc, i));
      const cx = ps.reduce((s0, q) => s0 + q[0], 0) / ps.length, cy = ps.reduce((s0, q) => s0 + q[1], 0) / ps.length;
      const fx = qs.reduce((s0, q) => s0 + q[0], 0) / (qs.length || 1), fy = qs.reduce((s0, q) => s0 + q[1], 0) / (qs.length || 1), d = Math.hypot(fx - cx, fy - cy);
      const runs = normalise([...chemRuns(r.ion.label).map((x) => ({ ...x, colour: r.colour })), { text: "\n" }, ...chemRuns(`${r.ion.label.includes(r.ion.formula) ? "" : `${r.ion.formula} `}${a.mz.toFixed(4)}`)]);
      if (!qs.length) return;
      if (qs.length === ps.length || d < 0.3) keep(addCaption(m, { text: plainOf(runs), x: 0, y: 0, under: atoms, runs }));
      else {
        const reach = Math.max(...qs.map((q) => Math.hypot(q[0] - fx, q[1] - fy))) + 0.8, at: P = [fx + ((fx - cx) / d) * reach, fy + ((fy - cy) / d) * reach];
        keep(addCaption(m, { text: plainOf(runs), x: at[0], y: at[1], size, align: at[0] >= cx ? "left" : "right", runs }));
      }
    } else {
      const em = style.captionSize / style.bond, W = 14 * f, H = 3.5 * f, cx = (Math.min(...ps.map((q) => q[0])) + Math.max(...ps.map((q) => q[0]))) / 2;
      const fig = msFigure({ ions: a.rows.map((r) => ({ ion: r.ion, colour: r.colour })), range: a.range, width: W, height: H, em, pt: f / style.bond, label: a.label, measure: (t) => textWidth(t, 1, false, false, fontStack(style.captionFont)) });
      const ink = withCaptions(atoms), low = Math.min(Math.min(...ps.map((q) => q[1])) - 1, ink ? -ink[3] / L - 0.5 : Infinity);
      const top = fig.top ?? H;
      [m, items] = placeFigure(doc, fig, [cx - W / 2, low - 1.4 * em - top]);
      const drop = figureDrop(m, items);
      if (drop) [m, items] = placeFigure(doc, fig, [cx - W / 2, low - 1.4 * em - top - drop]);
    }
    if (m === doc) return;
    // Text lands clear too; a label beside its fragment is kept clear of the other structures.
    if (a.what !== "spectrum") m = landText(m, items, a.what === "label" ? atoms : undefined);
    set(m);
    revealNext.current = true;
    setSelection(new Set());
    setPicked(new Set(items));
  }
  // The Spectrum panel's structure (the first in the selection, or the drawing's largest), its predicted spectrum
  // once the shift tables are loaded, and which drawn atom each of the prediction's atoms is.
  // The key: a nucleus ("1H", "13C") or a measured spectrum's kind ("ir"); only ¹H and ¹³C are predicted.
  const [spectrum, setSpectrum] = useState<string>();
  const nucleusOpen: Nucleus | undefined = spectrum === "1H" || spectrum === "13C" ? spectrum : undefined;
  // The structure the spectrum is of, kept from when it opened (the first selected, or the drawing's largest), so the
  // selection can go and the structure's highlights show. Edits that renumber atoms fall back to the largest.
  const [nmrTarget, setNmrTarget] = useState<number[]>();
  function openSpectrum(nucleus: string) {
    const groups = fragments(doc), pick = (selection.size ? groups.find((g) => g.some((i) => selection.has(i))) : undefined) ?? [...groups].sort((a, b) => b.length - a.length)[0];
    setNmrTarget(pick);
    setMassSpec(undefined);
    setSpectrum(nucleus);
    setSelection(new Set());
    setPicked(new Set());
  }
  const [nmrTables, setNmrTables] = useState(false);
  const [nmrPoint, setNmrPoint] = useState<number[]>();
  // The measured spectrum shown (the drawing's, for the panel's key), how it shows beside the prediction, its analysis
  // (peaks, multiplets, integrals), and its multiplets' atoms and bonds. groupPoint: the multiplet pointed at in the
  // panel; chosenGroup: the one the next atoms or bonds clicked are linked to; linkAtom and linkBond: the atom or bond
  // under a drag from a multiplet.
  const [spectrumShow, setSpectrumShow] = useState<Show>("measured");
  const [groupPoint, setGroupPoint] = useState<number>();
  const [chosenGroup, setChosenGroup] = useState<number>();
  const [linkAtom, setLinkAtom] = useState<number>();
  const [linkBond, setLinkBond] = useState<number>();
  const measured = spectrum ? doc.spectra?.find((s) => spectrumKeyOf(s) === spectrum) : undefined;
  // The solvent: the measured NMR spectrum's, so the prediction beside it is for the same solvent.
  const nmrSolvent = (measured?.kind === "nmr" && measured.solvent) || settings.nmrSolvent;
  const spectrumAnalysis = useMemo(() => measured && analyseSpectrum(measured, measured.kind === "nmr" ? nmrSolvent : undefined), [measured, nmrSolvent]);
  const measuredShown = !!measured && (!nucleusOpen || spectrumShow !== "predicted");
  const linkedAtoms = useMemo(() => {
    const out = new Map<number, number[]>();
    doc.atoms.forEach((a, i) => a.peaks?.forEach((k) => out.set(k, [...(out.get(k) ?? []), i])));
    return out;
  }, [doc]);
  const linkedBonds = useMemo(() => {
    const out = new Map<number, number[]>();
    doc.bonds.forEach((b, k) => b.peaks?.forEach((g) => out.set(g, [...(out.get(g) ?? []), k])));
    return out;
  }, [doc]);
  // A multiplet's colour: the highlight of its first linked atom, else of its first linked bond. Its ends: the atoms
  // its links stand on (its atoms and its bonds' atoms).
  const linkColour = (id: number) => doc.atoms[linkedAtoms.get(id)?.[0] ?? -1]?.halo ?? doc.bonds[linkedBonds.get(id)?.[0] ?? -1]?.halo;
  const linkedEnds = (id: number) => [...(linkedAtoms.get(id) ?? []), ...(linkedBonds.get(id) ?? []).flatMap((k) => doc.bonds[k]?.atoms ?? [])];
  useEffect(() => { if (chosenGroup !== undefined && !measured?.groups.some((g) => g.id === chosenGroup)) setChosenGroup(undefined); }, [measured, chosenGroup]);
  // A measured spectrum's change, as one undo step (`merge`: a slider's steps join): it replaces the drawing's
  // spectrum for its key, and atoms and bonds let go of multiplets that are gone.
  function setMeasured(next: Measured | undefined, key = spectrum, merge?: string) {
    const base = now.current, spectra = [...(base.spectra ?? []).filter((s) => spectrumKeyOf(s) !== key), ...(next ? [next] : [])];
    set({ ...linksKept(base, spectra), spectra: spectra.length ? spectra : undefined }, true, merge);
  }
  const withPeaks = <T extends { peaks?: number[] }>(a: T, peaks: number[]): T => { const { peaks: _, ...rest } = a; return (peaks.length ? { ...rest, peaks } : rest) as T; };
  // The drawing's atoms and bonds with their links to multiplets the spectra no longer have let go.
  const linksKept = (base: Mol, spectra: Measured[]) => {
    const ids = new Set(spectra.flatMap((s) => s.groups.map((g) => g.id))), keep = <T extends { peaks?: number[] }>(x: T) => (x.peaks?.some((k) => !ids.has(k)) ? withPeaks(x, x.peaks.filter((k) => ids.has(k))) : x);
    return { ...base, atoms: base.atoms.map(keep), bonds: base.bonds.map(keep) };
  };
  // Links atoms and bonds to a measured multiplet. toggle: when they all have it already they let go of it (a second
  // click).
  function linkTo(id: number, atoms: number[], bonds: number[] = [], toggle = true) {
    const base = now.current, ok = atoms.filter((i) => base.atoms[i]), okBonds = bonds.filter((k) => base.bonds[k]);
    if (!ok.length && !okBonds.length) return;
    const off = toggle && [...ok.map((i) => base.atoms[i]), ...okBonds.map((k) => base.bonds[k])].every((x) => x.peaks?.includes(id));
    const flip = <T extends { peaks?: number[] }>(x: T) => withPeaks(x, off ? (x.peaks ?? []).filter((k) => k !== id) : [...new Set([...(x.peaks ?? []), id])]);
    set({ ...base, atoms: base.atoms.map((a, i) => (ok.includes(i) ? flip(a) : a)), bonds: base.bonds.map((b, k) => (okBonds.includes(k) ? flip(b) : b)) }, true);
  }
  // Spectra from a file (JCAMP-DX, or Bruker's processed data as the app reads it) go into the drawing, each taking the
  // place of one of its kind; on Home they start a new drawing. The panel opens on the first.
  function openSpectrumText(text: string, name: string) {
    let found: JcampSpectrum[];
    try { found = text.startsWith(BRUKER) ? [brukerOf(text)] : text.startsWith(SPC) ? readSpcText(text) : readJcamp(text); } catch (e) { return setNotice(failure(`Octet cannot open ${name}.`, e)); }
    const base = home ? EMPTY : now.current;
    let spectra = base.spectra ?? [];
    const added: Measured[] = [];
    for (const s of found) {
      const fresh = fromJcamp(s, nextGroupId(spectra)), m = keepIds(fresh, spectra.find((x) => spectrumKeyOf(x) === spectrumKeyOf(fresh)), nextGroupId([...spectra, fresh]));
      spectra = [...spectra.filter((x) => spectrumKeyOf(x) !== spectrumKeyOf(m)), m];
      added.push(m);
    }
    const next = { ...linksKept(base, spectra), spectra };
    if (home) load(undefined, next); else set(next, true);
    const first = added[0], key = spectrumKeyOf(first);
    if (first.kind === "nmr" && first.mhz && (key === "1H" || key === "13C")) {
      const mhz = key === "1H" ? first.mhz : first.mhz / 0.25145, near = [60, 80, 90, 200, 300, 400, 500, 600, 700, 800].reduce((b, f) => (Math.abs(f - mhz) < Math.abs(b - mhz) ? f : b));
      setSettings((s) => ({ ...s, nmrMhz: near }));
    }
    const groups = fragments(next);
    setNmrTarget([...groups].sort((p, q) => q.length - p.length)[0]);
    setSpectrum(key);
    setSpectrumShow("measured");
    setChosenGroup(undefined);
    setSelection(new Set());
    setPicked(new Set());
  }  useEffect(() => { if (spectrum && !nmrTables) void nmrReady().then(() => setNmrTables(true)); }, [spectrum, nmrTables]);
  const nmr = useMemo(() => {
    if (!nucleusOpen || !loaded || !doc.atoms.length) return undefined;
    const groups = fragments(doc), kept = nmrTarget && groups.find((g) => g.length === nmrTarget.length && g.every((i) => nmrTarget.includes(i)));
    const pick = kept ?? [...groups].sort((a, b) => b.length - a.length)[0];
    const ids = [...pick].sort((a, b) => a - b), { mol, from } = expandWithOrigins(subset(doc, new Set(ids)), true), g = graphOf(mol);
    return { prediction: g && nmrTables ? predict(g, nucleusOpen, nmrSolvent) : undefined, toDoc: from.map((i) => ids[i]) };
  }, [nucleusOpen, loaded, doc, nmrTarget, nmrTables, nmrSolvent]);
  // The prediction's atoms lit by pointing at an atom on the canvas, and the drawn atoms lit from the spectrum.
  const nmrLit = (atom?: number) => new Set(nmr && atom !== undefined ? nmr.toDoc.flatMap((d, k) => (d === atom ? [k] : [])) : []);
  // With the atoms of the measured multiplet pointed at or being linked, and the atom under a drag from one.
  const nmrMarks = new Set([...(nmr && nmrPoint ? nmrPoint.map((k) => nmr.toDoc[k]) : []), ...[groupPoint, chosenGroup].flatMap((g) => (g === undefined ? [] : linkedAtoms.get(g) ?? [])), ...(linkAtom !== undefined ? [linkAtom] : [])]);
  const nmrBondMarks = new Set([...[groupPoint, chosenGroup].flatMap((g) => (g === undefined ? [] : linkedBonds.get(g) ?? [])), ...(linkBond !== undefined ? [linkBond] : [])]);
  // Each drawn atom's predicted shifts, shown beside it while the panel is open.
  const nmrShifts = new Map<number, number[]>(), nmrQuality = new Map<number, string>();
  const stereo = useMemo(() => { const m = exporting ?? doc; return loaded && m.atoms.some((a) => a.cip) ? stereoLabels(m) : undefined; }, [loaded, doc, exporting]);
  const ringsOf = useMemo(() => (spectrum || doc.atoms.some((a) => a.cip || a.number) ? drawnRings(shown) : []), [spectrum, shown, doc]);
  // Opening the panel scrolls the canvas up if the panel would cover the structure (again once the spectrum is in,
  // as the panel grows).
  useEffect(() => {
    if (!spectrum || (!nmr && !measured)) return;
    const panel = document.querySelector(".spectrum")?.getBoundingClientRect(), box = svg.current?.getBoundingClientRect();
    const low = Math.min(...[...new Set(nmr ? nmr.toDoc : doc.atoms.map((_, i) => i))].filter((i) => doc.atoms[i]).map((i) => pos(doc, i)[1]));
    if (!panel || !box || !Number.isFinite(low)) return;
    const view = views.get(), over = view.y - low * L * view.zoom + 2 * L * view.zoom - (panel.top - box.top);
    if (over > 0) moveView({ ...view, y: view.y - over });
  }, [spectrum, !!nmr?.prediction, settings.nmrDetails, spectrumShow, !!measured]); // eslint-disable-line react-hooks/exhaustive-deps
  // Properties opens along the bottom too, and scrolls the canvas the same way so its structures stay in view.
  useEffect(() => {
    if (!settings.properties) return;
    const panel = document.querySelector(".properties:not(.stacked)")?.getBoundingClientRect(), box = svg.current?.getBoundingClientRect();
    const atoms = selection.size ? [...selection] : doc.atoms.map((_, i) => i), low = Math.min(...atoms.filter((i) => i < doc.atoms.length).map((i) => pos(doc, i)[1]));
    if (!panel || !box || !Number.isFinite(low)) return;
    const view = views.get(), over = view.y - low * L * view.zoom + 2 * L * view.zoom - (panel.top - box.top);
    if (over > 0) moveView({ ...view, y: view.y - over });
  }, [settings.properties]); // eslint-disable-line react-hooks/exhaustive-deps
  // The measured shifts of linked atoms when the measured spectrum shows; otherwise the predicted ones.
  if (measuredShown && spectrumAnalysis) { for (const g of spectrumAnalysis.groups) for (const d of linkedAtoms.get(g.id) ?? []) nmrShifts.set(d, [...(nmrShifts.get(d) ?? []), g.shift]); }
  else for (const s of nmr?.prediction?.signals ?? []) for (const d of new Set(s.atoms.map((k) => nmr!.toDoc[k]))) { nmrShifts.set(d, [...(nmrShifts.get(d) ?? []), s.shift]); nmrQuality.set(d, quality(s, nucleusOpen!)); }
  // Where each atom's shifts go (px, the anchor on the baseline): one place for the panel's numbers and for Add to
  // drawing > Shifts beside atoms (beside.ts), clear of the bonds, the atom labels, the atom numbers and (R) and (S),
  // the text and each other. They are in the caption font at 0.8 times the caption size (in the atom's scale), as atom
  // numbers are. An atom that already has a number beside it (one added, or one from a ChemDraw file) gets none.
  const shiftKey = [...nmrShifts].map(([i, v]) => `${i}:${v.join(",")}`).join(";");
  const shiftSpots = useMemo(() => {
    const texts = new Map<number, string>();
    for (const [i, shifts] of nmrShifts) if (i < shown.atoms.length) texts.set(i, [...shifts].sort((a, b) => b - a).map((v) => v.toFixed(spectrum === "1H" ? 2 : spectrum === "ir" || spectrum === "uv" || spectrum === "ms" ? 0 : 1)).join(", "));
    if (!texts.size) return [];
    const family = fontStack(style.captionFont), at = shown.atoms.map((_, i): P => { const [x, y] = pos(shown, i); return [x * L, -y * L]; }), Ls = shown.atoms.map((a) => L * scaleOf(a));
    const sizeOf = (i: number) => Math.round(style.captionSize * 0.8 * scaleOf(shown.atoms[i]) * 100) / 100;
    const has = numbered(at, Ls, placed.map((c) => ({ text: c.lines.map((l) => l.text).join("\n"), box: c.box })), texts);
    const bonded = shown.atoms.map((): number[] => []);
    for (const b of shown.bonds) if (bonded[b.atoms[0]] && bonded[b.atoms[1]]) { bonded[b.atoms[0]].push(b.atoms[1]); bonded[b.atoms[1]].push(b.atoms[0]); }
    // The marks already placed: atom numbers, (R) and (S), (E) and (Z), map numbers, electrons and charges, and text.
    const taken: Box[] = [
      ...stereoMarks().map((m): Box => { const w = textWidth(m.text, m.size, false, !m.upright, family), x = m.anchor === "start" ? m.x : m.anchor === "end" ? m.x - w : m.x - w / 2; return [x, m.y - 0.4 * m.size, x + w, m.y + 0.4 * m.size]; }),
      ...drawing.maps.map((n): Box => { const w = textWidth(n.text, n.size, false, false, family); return [n.at[0] - w / 2, n.at[1] - n.h / 2, n.at[0] + w / 2, n.at[1] + n.h / 2]; }),
      ...drawing.electrons.map((e): Box => [e.at[0] - 0.12 * L, e.at[1] - 0.12 * L, e.at[0] + 0.12 * L, e.at[1] + 0.12 * L]),
      ...placed.map((c) => c.frame ?? c.box),
    ];
    // The bond ink, each structure's polygons where it is drawn.
    const bondInk = drawing.parts.flatMap(({ drawing: d, at: [ax, ay], k, turn }) => { const c = Math.cos((turn * Math.PI) / 180) * k, s = Math.sin((turn * Math.PI) / 180) * k; return d.polygons.map((poly) => poly.map(([x, y]): P => [x * c - y * s + ax, x * s + y * c + ay])); });
    const items = [...texts].filter(([i]) => !has.has(i)).map(([i, text]) => { const px = sizeOf(i) * pt, [up, down] = textExtent(text, px, false, false, family); return { atom: i, w: textWidth(text, px, false, false, family), up, down, L: Ls[i] }; });
    return placeBeside(items, { at, bonded, rings: ringsOf, ink: bondInk, labels: drawing.label, taken }).map((s) => ({ ...s, text: texts.get(s.atom)!, size: sizeOf(s.atom) }));
  }, [shiftKey, spectrum, shown, drawing, placed, ringsOf, stereo, style, pt, settings.stereoParens]); // eslint-disable-line react-hooks/exhaustive-deps
  const shiftLabels = () => shiftSpots;
  // A label's place beside an atom (px): in a gap between its bonds, out of its rings (or away from the atoms within
  // two bonds), clear of the atom's own label and of the boxes in `taken` (the chosen box is added to it).
  function besideAtom(i: number, w: number, h: number, taken: number[][], gap = 0.62) {
    const at = pos(shown, i), bonded = shown.bonds.filter((b) => b.atoms.includes(i)).map((b) => (b.atoms[0] === i ? b.atoms[1] : b.atoms[0]));
    const mine = ringsOf.filter((r) => r.includes(i)), two = new Set(bonded.flatMap((k) => shown.bonds.filter((b) => b.atoms.includes(k)).flatMap((b) => b.atoms)));
    two.delete(i);
    const around = (mine.length ? mine.flat() : [...two]).map((k) => pos(shown, k));
    const away = around.length ? Math.atan2(at[1] - around.reduce((s, q) => s + q[1], 0) / around.length, at[0] - around.reduce((s, q) => s + q[0], 0) / around.length) : Math.PI / 2;
    const angles = bonded.map((k) => Math.atan2(pos(shown, k)[1] - at[1], pos(shown, k)[0] - at[0])).sort((a, b) => a - b);
    // Each gap's middle, best first: wider gaps, then those facing away.
    const gaps = angles.length === 0 ? [{ m: Math.PI / 2, score: 0 }] : angles.length === 1 ? [{ m: angles[0] + Math.PI, score: 1 }, { m: angles[0] + Math.PI / 2, score: 0 }, { m: angles[0] - Math.PI / 2, score: 0 }]
      : angles.map((a, k) => { const next = k + 1 < angles.length ? angles[k + 1] : angles[0] + 2 * Math.PI, m = (a + next) / 2; return { m, score: next - a + 0.3 * Math.cos(m - away) }; });
    gaps.sort((a, b) => b.score - a.score);
    const box = drawing.label[i], r = box ? Math.max(gap * L, Math.hypot(box[2] - box[0], box[3] - box[1]) / 2 + 0.25 * L) : gap * L;
    const place = (m: number) => {
      const ux = Math.cos(m), uy = Math.sin(m), x = at[0] * L + ux * r, y = -(at[1] * L + uy * r), anchor = ux > 0.4 ? "start" as const : ux < -0.4 ? "end" as const : "middle" as const;
      const left = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      return { x, y, anchor, rect: [left, y - h / 2, left + w, y + h / 2] };
    };
    const free = gaps.map((g) => place(g.m)).find((c) => !taken.some((b) => c.rect[0] < b[2] && c.rect[2] > b[0] && c.rect[1] < b[3] && c.rect[3] > b[1])) ?? place(gaps[0].m);
    taken.push(free.rect);
    return { x: free.x, y: free.y, anchor: free.anchor };
  }
  // Show Stereochemistry: (R) and (S) beside stereocentres and (E) and (Z) beside double bonds, in structures that
  // have it on, in the caption font a little smaller, italic as IUPAC writes them.
  // Atom numbers go first, upright, and the stereo labels find room around them.
  function stereoMarks() {
    // Settings > Drawing > Parentheses round R and S (ChemDraw's Include Parentheses When Showing Stereochemistry).
    const paren = (c: string) => (settings.stereoParens ? `(${c})` : c);
    // Each in its atom's scale (its bond's mean for E and Z).
    const out: { key: string; x: number; y: number; anchor: "start" | "middle" | "end"; text: string; colour?: string; upright?: boolean; size: number }[] = [], taken: number[][] = [], base = style.captionSize * pt * 0.8;
    shown.atoms.forEach((a, i) => { const size = base * scaleOf(a); if (a.number) out.push({ key: `n${i}`, ...besideAtom(i, a.number.length * size * 0.55, size, taken, 0.55 * scaleOf(a)), text: a.number, colour: a.colour, upright: true, size }); });
    if (!stereo) return out;
    stereo.atoms.forEach((c, i) => {
      if (!c || !shown.atoms[i]?.cip) return;
      const text = paren(c), size = base * scaleOf(shown.atoms[i]);
      out.push({ key: `a${i}`, ...besideAtom(i, text.length * size * 0.55, size, taken, 0.55 * scaleOf(shown.atoms[i])), text, colour: shown.atoms[i].colour, size });
    });
    stereo.bonds.forEach((c, k) => {
      const b = shown.bonds[k];
      if (!c || !b || !shown.atoms[b.atoms[0]]?.cip) return;
      // Beside the middle of the double bond, on the side with fewer neighbours.
      const [p, q] = b.atoms.map((i) => pos(shown, i)), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = -(q[1] - p[1]) / d, ny = (q[0] - p[0]) / d;
      const side = shown.bonds.filter((o) => o !== b && o.atoms.some((i) => b.atoms.includes(i))).map((o) => { const far = pos(shown, b.atoms.includes(o.atoms[0]) ? o.atoms[1] : o.atoms[0]); return Math.sign((far[0] - mx) * nx + (far[1] - my) * ny); }).reduce((s, v) => s + v, 0) > 0 ? -1 : 1;
      const f = (scaleOf(shown.atoms[b.atoms[0]]) + scaleOf(shown.atoms[b.atoms[1]])) / 2;
      out.push({ key: `b${k}`, x: (mx + side * nx * 0.5 * f) * L, y: -(my + side * ny * 0.5 * f) * L, anchor: "middle", text: paren(c), colour: b.colour, size: base * f });
    });
    return out;
  }
  // The problem marks: a red ring round each atom, bond (at its middle) or pair of brackets with a problem. Pointing at
  // one shows what is wrong, as ChemDraw's tooltip on a warning does.
  function problemMarks() {
    const at = new Map<string, { x: number; y: number; r: number; w?: number; h?: number; text: string[] }>();
    for (const p of found) {
      let mark: { key: string; x: number; y: number; r: number; w?: number; h?: number } | undefined;
      if (p.atom !== undefined && shown.atoms[p.atom]) { const [x, y] = pos(shown, p.atom); mark = { key: `a${p.atom}`, x: x * L, y: -y * L, r: MARK.atom * L }; }
      else if (p.bond !== undefined && shown.bonds[p.bond]) {
        const [q, r] = shown.bonds[p.bond].atoms.map((i) => pos(shown, i));
        mark = { key: `b${p.bond}`, x: ((q[0] + r[0]) / 2) * L, y: (-(q[1] + r[1]) / 2) * L, r: MARK.bond * L };
      } else if (p.shape !== undefined) {
        const sh = shown.shapes?.find((x) => x.id === p.shape), pad = MARK.pad;
        if (sh) mark = { key: `s${p.shape}`, x: (Math.min(sh.from[0], sh.to[0]) - pad) * L, y: -(Math.max(sh.from[1], sh.to[1]) + pad) * L, r: 0.2 * L, w: (Math.abs(sh.to[0] - sh.from[0]) + 2 * pad) * L, h: (Math.abs(sh.to[1] - sh.from[1]) + 2 * pad) * L };
      } else if (p.caption !== undefined) {
        // A box round the caption, as ChemDraw marks a caption with a bad valence.
        const b = placed.find((x) => x.id === p.caption)?.box, pad = 0.1 * L;
        if (b) mark = { key: `c${p.caption}`, x: b[0] - pad, y: b[1] - pad, r: 0.1 * L, w: b[2] - b[0] + 2 * pad, h: b[3] - b[1] + 2 * pad };
      }
      if (!mark) continue;
      const kept = at.get(mark.key);
      if (kept) kept.text.push(p.message); else at.set(mark.key, { ...mark, text: [p.message] });
    }
    return [...at.entries()].map(([key, m]) => (m.w !== undefined
      ? <rect key={key} className="problem-mark" x={m.x} y={m.y} width={m.w} height={m.h} rx={m.r} vectorEffect="non-scaling-stroke"><title>{m.text.join("\n")}</title></rect>
      : <circle key={key} className="problem-mark" cx={m.x} cy={m.y} r={m.r} vectorEffect="non-scaling-stroke"><title>{m.text.join("\n")}</title></circle>));
  }
  // Check Structure (ChemDraw's Possible Error in Drawing): the problems one at a time, with Stop, Ignore and Ignore
  // All. Ignore goes to the next problem; after the last one, and on Ignore All, `then` runs (the copy or export that
  // asked for the check); Stop runs nothing. With no problems `then` runs at once, and Check Structure itself says so.
  // asked: Check Structure itself, which also selects each problem's atoms, bond or brackets as it shows it.
  function checkThen(list: Problem[], then: () => void, asked = false) {
    if (!list.length) { if (asked) setNotice("Octet found no problems.", "done"); return then(); }
    if (asked) showProblem(list[0]);
    setChecking({ list, at: 0, then, select: asked });
  }
  // Settings > Warnings > Check structure when copying or exporting: the selection's problems (or the drawing's)
  // first, then the copy or export.
  const checkFirst = (then: () => void) => (settings.checkCopy ? checkThen(selection.size || picked.size ? subsetProblems() : allProblems(), then) : then());
  // Whether a selected atom, a bond between selected atoms or picked brackets (with nothing selected, anything in the
  // drawing) have their warnings hidden (for Show warnings).
  const warnScope = (): [Set<number>?, Set<number>?] => (selection.size || picked.size ? [selection, picked] : []);
  const hiddenHere = () => hiddenWarnings(doc, ...warnScope());
  function showProblem(p: Problem) {
    if (p.atom !== undefined) { setSelection(new Set([p.atom])); setPicked(new Set()); }
    else if (p.bond !== undefined && doc.bonds[p.bond]) { setSelection(new Set(doc.bonds[p.bond].atoms)); setPicked(new Set()); }
    else if (p.shape !== undefined || p.caption !== undefined) { setSelection(new Set()); setPicked(new Set([(p.shape ?? p.caption)!])); }
  }
  // Peak colours are the highlights of the peak's atoms, so the colours are part of the drawing: saved, undone,
  // printed and pasted with it. Colour peaks gives every signal its own colour; Add key writes the coloured shifts
  // under the structure.
  const nmrColours = (nmr?.prediction?.signals ?? []).map((s) => doc.atoms[nmr!.toDoc[s.atoms[0]]]?.halo);
  const withHalos = (m: Mol, colour: (k: number) => string | undefined, only?: number): Mol => {
    if (!nmr?.prediction) return m;
    const to = new Map<number, string | undefined>();
    nmr.prediction.signals.forEach((s, k) => { if (only === undefined || only === k) for (const a of s.atoms) to.set(nmr.toDoc[a], colour(k)); });
    return { ...m, atoms: m.atoms.map((a, i) => (to.has(i) ? { ...a, halo: to.get(i) } : a)) };
  };
  const haloSignals = (colour: (k: number) => string | undefined, only?: number) => set(withHalos(doc, colour, only), true);
  // Add to drawing lands in free space. Each thing goes where the panel puts it (under its structure and the text
  // there, or beside its atoms); where that would cover another object (a structure, text, an arrow or curve, a shape
  // or a table), it goes straight down under what is in the way, half a bond length clear (dropClear), as an
  // experiment page's next scheme goes under what is there. Then it comes into view (revealNext). A box or other shape
  // round the spot is a frame it sits in, so it does not count. own: atoms whose structure does not count (a label
  // put beside that structure's atoms). Boxes in px, y down.
  function dropFor(box: Span, also: Span[] = [], own?: number[]): number {
    const mine = own && new Set(own), inside = (t: Span) => t[0] <= box[0] && t[1] <= box[1] && t[2] >= box[2] && t[3] >= box[3];
    const taken: Span[] = [
      ...fragments(doc).filter((g) => !mine || !g.some((i) => mine.has(i))).flatMap((g) => { const b = inkOf(g); return b ? [b] : []; }),
      ...placed.filter((c) => c.id !== DRAFT).map((c) => c.box),
      ...[...arrows, ...cycleArrows].map((a) => arrowTrace(a, L).box),
      ...(shown.shapes ?? []).map((sh): Span => { const b = shapeBounds(sh); return [b[0] * L, -b[3] * L, b[2] * L, -b[1] * L]; }).filter((t) => !inside(t)),
      ...gridViews.map(tableSpan).map((t): Span => [t[0] * L, -t[3] * L, t[2] * L, -t[1] * L]),
      ...also,
    ];
    return dropClear(box, taken, 0.1 * L, 0.5 * L);
  }
  // The text of a drawing as it will be laid out (with the atoms as drawn now).
  const placedIn = (m: Mol) => placeCaptions(m, drawing, captionWidth, m.arrows ?? [], pt, style.captionSize, new Map(), runWidth, runExtent);
  // How far down a figure just added (its parts, items) goes to land clear, in bond lengths.
  function figureDrop(next: Mol, items: number[]): number {
    const want = new Set(items), b = union([...placedIn(next).filter((c) => want.has(c.id)).map((c) => c.box), ...(next.arrows ?? []).filter((a) => want.has(a.id)).map((a) => arrowTrace(a, L).box)]);
    return b ? dropFor(b) / L : 0;
  }
  // Text just added (ids), each landed clear in turn (the ones before it count as taken). Text under a structure that
  // would cover something becomes free text there, moved down, where it was across.
  function landText(next: Mol, ids: number[], own?: number[]): Mol {
    let m = next, caps = placedIn(m);
    const done: Span[] = [];
    for (const id of ids) {
      const p = caps.find((c) => c.id === id), c = m.captions?.find((x) => x.id === id);
      if (!p || !c) continue;
      const dy = dropFor(p.box, done, own);
      done.push([p.box[0], p.box[1] + dy, p.box[2], p.box[3] + dy]);
      if (!dy) continue;
      const { under: _, ...free } = c, moved = c.under ? { ...free, x: p.lines[0].x / L, y: -(p.lines[0].y + dy) / L } : { ...c, y: c.y - dy / L };
      m = { ...m, captions: m.captions!.map((x) => (x.id === id ? moved : x)) };
      caps = placedIn(m);
    }
    return m;
  }
  function addKey() {
    if (measuredShown && measured && spectrumAnalysis) return addMeasuredKey(measured, spectrumAnalysis.groups.filter((g) => !g.other));
    const p = nmr?.prediction;
    if (!p) return;
    const coloured = p.signals.map((s, k) => ({ s, c: nmrColours[k] })).filter((x) => x.c);
    const rows = coloured.length ? coloured : p.signals.map((s, k) => ({ s, c: PEAK_COLOURS[k % PEAK_COLOURS.length] }));
    let m = coloured.length ? doc : withHalos(doc, (k) => PEAK_COLOURS[k % PEAK_COLOURS.length]);
    const head = acsText({ ...p, signals: [] }, settings.nmrMhz, nmrSolvent).replace(/ δ \.$/, ", δ (ppm)");
    const runs: TextRun[] = [{ text: head }];
    for (const { s, c } of [...rows].sort((a, b) => b.s.shift - a.s.shift)) {
      runs.push({ text: "\n" }, { text: "● ", colour: c });
      runs.push({ text: p.nucleus === "1H" ? `${s.shift.toFixed(2)} (${multiplicity(s)}${s.couplings.length && !s.broad && multiplicity(s) !== "m" ? `, J = ${s.couplings.map((x) => x.j.toFixed(1)).join(", ")} Hz` : ""}, ${s.nuclei}H)` : `${s.shift.toFixed(1)}${s.nuclei > 1 ? ` (${s.nuclei}C)` : ""}` });
    }
    const atoms = [...new Set(nmr!.toDoc)];
    const [k, id] = addCaption(m, { text: plainOf(normalise(runs)), x: 0, y: 0, under: atoms, runs: normalise(runs) });
    set(landText(k, [id]), true);
    revealNext.current = new Set([id]);
  }
  // The key of a measured spectrum: its multiplets high to low as the text line gives them, each linked one after a
  // dot in its colour (linked multiplets take colours first if none has one), under the structure they are linked to.
  function addMeasuredKey(ms: Measured, groups: NonNullable<typeof spectrumAnalysis>["groups"]) {
    if (!groups.length) return;
    const linked = groups.filter((g) => linkedAtoms.get(g.id) || linkedBonds.get(g.id)), colourOf = (g: { id: number }) => linkColour(g.id);
    const fresh = !linked.some(colourOf), give = new Map(linked.map((g, k) => [g.id, PEAK_COLOURS[k % PEAK_COLOURS.length]]));
    const tint = <T extends { peaks?: number[]; halo?: string }>(x: T): T => { const g = x.peaks?.find((k) => give.has(k)); return g !== undefined ? { ...x, halo: give.get(g) } : x; };
    let m: Mol = fresh ? { ...doc, atoms: doc.atoms.map(tint), bonds: doc.bonds.map(tint) } : doc;
    const head = measuredHead(ms, ms.kind === "nmr" ? nmrSolvent : undefined), runs: TextRun[] = [{ text: ms.kind === "nmr" ? `${head}, δ (${ms.xUnit})` : `${head} (${ms.xUnit})` }];
    for (const g of [...groups].sort((p, q) => q.shift - p.shift)) {
      const c = fresh ? give.get(g.id) : colourOf(g);
      runs.push({ text: "\n" }, ...(c ? [{ text: "● ", colour: c }] : []), { text: groupText(ms, g) });
    }
    const under = [...new Set(linked.flatMap((g) => linkedEnds(g.id)))];
    const [k, id] = addCaption(m, { text: plainOf(normalise(runs)), x: 0, y: 0, ...(under.length ? { under } : {}), runs: normalise(runs) });
    set(landText(k, [id]), true);
    revealNext.current = new Set([id]);
  }
  // Add to drawing > Shifts beside atoms: each predicted shift as a caption where the panel shows it, so it saves,
  // prints and exports with the drawing (the panel's own shift labels are not part of the drawing), and the nmrshiftdb2
  // notice under the structure when the shifts are predicted and the drawing has none. Measured shifts carry none.
  function addShifts() {
    let m = doc;
    for (const l of shiftLabels()) m = addCaption(m, { text: l.text, x: l.x / L, y: -l.y / L, size: l.size, align: l.align })[0];
    const predicted = !(measuredShown && spectrumAnalysis) && !!nmr?.prediction;
    const atoms = predicted ? [...new Set(nmr!.toDoc)].filter((i) => doc.atoms[i]) : [];
    if (m === doc) return;
    // The shifts and the notice come into view (revealNext).
    // The numbers are clear already (beside.ts); the notice under the structure lands clear.
    const had = new Set((doc.captions ?? []).map((c) => c.id)), withIt = withNotice(m, atoms, (14 * atoms.reduce((s0, i) => s0 + scaleOf(doc.atoms[i]), 0)) / (atoms.length || 1));
    const added = (withIt.captions ?? []).filter((c) => !had.has(c.id));
    set(landText(withIt, added.filter((c) => c.under).map((c) => c.id)));
    revealNext.current = new Set(added.map((c) => c.id));
  }
  // Add to drawing > Spectrum: the spectrum as the panel shows it (its shift range, solvent peaks and peak colours) as
  // lines, curves and captions under the structure, in one plain group (each part can be picked and edited), with the
  // line that names it and the notice the nmrshiftdb2 licence asks a published prediction to carry. Its text is in the
  // document style.
  function addSpectrum(range: [number, number]) {
    const ms = measuredShown && measured && spectrumAnalysis ? measured : undefined, p = ms ? undefined : nmr?.prediction;
    if (!ms && !p) return;
    // Under the structure: the one predicted, or the atoms linked to the measured spectrum (or every atom).
    const linked = ms ? spectrumAnalysis!.groups.flatMap((g) => linkedEnds(g.id)) : [];
    const atoms = [...new Set(p ? nmr!.toDoc : linked.length ? linked : nmr?.toDoc ?? doc.atoms.map((_, i) => i))].filter((i) => doc.atoms[i]), ps = atoms.length ? atoms.map((i) => pos(doc, i)) : [[0, 0] as [number, number]];
    const f = atoms.length ? atoms.reduce((s0, i) => s0 + scaleOf(doc.atoms[i]), 0) / atoms.length : 1, em = style.captionSize / style.bond;
    const W = 14 * f, H = 3.5 * f, cx = (Math.min(...ps.map((q) => q[0])) + Math.max(...ps.map((q) => q[0]))) / 2;
    // Its title; a prediction also carries the notice nmrshiftdb2's licence asks for.
    const title = ms ? measuredHead(ms, ms.kind === "nmr" ? nmrSolvent : undefined) : `${acsText({ ...p!, signals: [] }, settings.nmrMhz, nmrSolvent).replace(/ δ \.$/, "")}, predicted`;
    // The record of what is plotted (pageplot.ts), from which a resize builds it again. Its labels are spaced by their
    // widths in the caption font, as they are drawn.
    const keys = p ? signalKeys(p.signals) : [], env = plotEnv();
    const plot: Plot = {
      kind: ms ? "measured" : "predicted", nucleus: ms ? ms.nucleus ?? "" : p!.nucleus, mhz: ms ? ms.mhz ?? 0 : settings.nmrMhz, solvent: nmrSolvent, solventPeaks: settings.nmrSolventPeaks, range, frame: [W, H], origin: [0, 0],
      scale: f, text: 1, labels: settings.nmrLabels, title, notice: !!p, roles: [],
      ...(ms ? { trace: traceOf(ms, spectrumAnalysis!, range, linkColour) }
        : { signals: p!.signals.map((s, k) => ({ key: keys[k], shift: s.shift, nuclei: s.nuclei, couplings: s.couplings.map((c) => ({ j: c.j, n: c.n })), ...(s.broad ? { broad: true as const } : {}), ...(nmrColours[k] ? { colour: nmrColours[k] } : {}) })) }),
    };
    const fig = plotFigure(plot, env), top = plotTop(fig, plot, env);
    // The figure's top (its title's) sits one bond length under the structure, and under the text already there (the
    // key, the properties), so it covers none of it.
    const ink = withCaptions(atoms), low = Math.min(Math.min(...ps.map((q) => q[1])) - 1, ink ? -ink[3] / L - 0.5 : Infinity);
    let [m, items] = placePlot(doc, { ...plot, origin: [cx - W / 2, low - 1.4 * em - top] }, env, fig);
    const drop = figureDrop(m, items);
    if (drop) [m, items] = placePlot(doc, { ...plot, origin: [cx - W / 2, low - 1.4 * em - top - drop] }, env, fig);
    set(m);
    revealNext.current = true;
    setSelection(new Set());
    setPicked(new Set(items));
  }
  // Add to drawing: the chosen rows as a caption under each structure, the formula's counts as subscripts.
  function addProperties() {
    if (!properties) return;
    const chosen = PROPERTY_ROWS.flat().map((r) => r.key).filter((k) => settings.propertyRows.includes(k));
    const rows = properties.values.flat().filter((r) => chosen.includes(r.key));
    let m = doc, id = 0;
    const items: number[] = [];
    properties.atoms.forEach((atoms, k) => {
      const runs: TextRun[] = [];
      rows.forEach((r, i) => {
        const v = r.values[k];
        if (v === undefined) return;
        if (runs.length) runs.push({ text: "\n" });
        runs.push({ text: `${rowLabel(r)}: ` });
        if (r.key === "formula") for (const [, letters, digits] of v.matchAll(/(\D*)(\d*)/g)) { if (letters) runs.push({ text: letters }); if (digits) runs.push({ text: digits, script: "sub" }); }
        else runs.push({ text: v });
        void i;
      });
      if (!runs.length) return;
      const clean = normalise(runs), text = { text: plainOf(clean), ...(styled(clean) ? { runs: clean } : {}) };
      // A caption that counts as chemistry is an atom after the drawing's (chem): its values go under the caption.
      const c = atoms[0] >= doc.atoms.length ? doc.captions?.find((x) => x.id === chem.captions[atoms[0] - doc.atoms.length]) : undefined;
      if (!c && atoms.some((i) => i >= doc.atoms.length)) return;
      [m, id] = addCaption(m, c ? { ...text, ...belowCaption(c) } : { ...text, x: 0, y: 0, under: atoms });
      items.push(id);
    });
    if (m === doc) return;
    // The view pans to them as to any other insertion (revealNext). They are not selected: the panel shows the
    // structures selected (or the drawing), and picked text alone would leave it nothing to show.
    set(landText(m, items));
    revealNext.current = new Set(items);
  }
  // Chemical warnings (View > Show Chemical Warnings), of the kinds switched on in Settings > Warnings. The
  // stereochemistry warnings need Indigo's facts, read only when one of their kinds is on.
  const warnOn = (t: WarningType) => settings.warningTypes[t] ?? WARNING_TYPES.find((w) => w.id === t)!.on;
  const stereoWarnings = (["unspecified", "ambiguous", "enhanced", "between", "backwards"] as const).some(warnOn);
  const stereoOf = (m: Mol) => { try { return loaded && stereoWarnings ? stereoFacts(m, warnOn("enhanced")) : undefined; } catch { return undefined; } };
  // A caption that counts as chemistry is checked as its atom (chem), and its problems are on the caption.
  const found = useMemo(() => (exporting || !settings.warnings ? [] : onCaptions(problems(chem.mol, stereoOf(doc)), doc.atoms.length, chem.captions).filter((p) => warnOn(p.type))), [doc, chem, exporting, settings.warnings, settings.warningTypes, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every problem, those on objects with their warnings hidden too (for Check Structure), of the kinds switched on.
  const allProblems = () => onCaptions(problems(chem.mol, stereoOf(doc), true), doc.atoms.length, chem.captions).filter((p) => warnOn(p.type));
  // The problems on what is selected: its atoms, the bonds between them, and the picked shapes and captions.
  const selectedOf = (list: Problem[]) => list.filter((p) => (p.atom !== undefined ? selection.has(p.atom) : p.bond !== undefined ? doc.bonds[p.bond]?.atoms.every((i) => selection.has(i)) : picked.has((p.shape ?? p.caption)!)));
  const subsetProblems = () => selectedOf(allProblems());
  // The drawing's own colours (a ChemDraw file's, say) join the Colour row after Octet's and the user's, as ChemDraw's
  // Color menu lists each document's colours. A colour stays in the row until another drawing opens.
  const drawingColours = useRef<string[]>([]);
  const docColours = useMemo(() => {
    const known = new Set([...COLOURS.map(([, hex]) => hex), ...settings.palette.map((c) => c.hex)].map((h) => h.toLowerCase()));
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!v || typeof v !== "object") return;
      for (const [k, x] of Object.entries(v)) {
        if (k === "style") continue;
        if (k === "colour" && typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x)) { const h = x.toLowerCase(); if (!known.has(h) && !drawingColours.current.includes(h)) drawingColours.current.push(h); }
        else walk(x);
      }
    };
    walk(doc);
    // The palette saved with the document (by name) comes first.
    const named = (style.palette ?? []).filter((c, k, all) => !known.has(c.hex.toLowerCase()) && all.findIndex((x) => x.hex.toLowerCase() === c.hex.toLowerCase()) === k);
    return [...named, ...drawingColours.current.filter((h) => !known.has(h) && !named.some((c) => c.hex.toLowerCase() === h)).map((hex) => ({ name: hex.toUpperCase(), hex }))].slice(0, 24);
  }, [doc, settings.palette, style.palette]);
  // The Colour menu lists the user's colours and the drawing's own by name: the menu bar is built again when they change.
  const paletteNames = [...settings.palette, ...docColours].map((c) => c.name).join("\n");
  useEffect(() => {
    if (TAURI) invoke("set_palette", { names: paletteNames.split("\n").filter(Boolean) }).then(syncChecks).catch(() => {});
  }, [paletteNames, fronted]); // eslint-disable-line react-hooks/exhaustive-deps
  const untidy = useMemo(() => messy(doc, selection), [doc, selection]);
  // Text the panel asked to copy; the copy handler uses it instead of SMILES.
  const copyText = useRef<string>(undefined);
  // Text on the clipboard, as text only (a value from a panel, Copy As SMILES). In the app, the app puts it there
  // (CH-7): the webview lets a page copy only during a click, and a menu command is not one. In a browser, the copy
  // event puts it there, or else the Clipboard API.
  const copyPlain = (text: string) => {
    if (NATIVE_CLIP) return void copyToClipboard({ text }).then(() => setNotice("Copied.", "done"), (err) => setNotice(failure("Octet cannot copy this.", err)));
    copyText.current = text;
    if (document.execCommand("copy")) return;
    copyText.current = undefined;
    void (navigator.clipboard?.writeText(text) ?? Promise.reject()).then(() => setNotice("Copied.", "done"), () => setNotice("Octet cannot copy this."));
  };
  // Edit > Cut, Copy and Paste on Linux, where they are Octet's own menu items (main.rs) and GTK gives them Ctrl+X, C
  // and V before the page. In a text field they work on its text through the app's clipboard, as copyPlain does (the
  // webview lets a page use the clipboard only during a click or a key). Elsewhere they are the drawing's own cut, copy
  // and paste: the clipboard events below, which do nothing on Home or over a dialog.
  const clipCommand = (id: "cut" | "copy" | "paste") => {
    const el = document.activeElement;
    if (!typing()) return void dispatchEvent(new ClipboardEvent(id, { cancelable: true }));
    if (id === "paste") return void readClipboard().then((c) => { if (c.text) document.execCommand("insertText", false, c.text); }, (err) => setNotice(failure("Octet cannot read the clipboard.", err)));
    const field = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : undefined;
    // A number field has no selection to read: its whole value.
    const text = field ? (field.selectionStart === null ? field.value : field.value.slice(field.selectionStart, field.selectionEnd ?? field.selectionStart)) : getSelection()?.toString() ?? "";
    if (text) void copyToClipboard({ text }).then(() => { if (id === "cut") document.execCommand("delete"); }, (err) => setNotice(failure("Octet cannot copy this.", err)));
  };
  // Edit > Copy As (CH-7, CH-26): the selected structures, or every structure, as text, as ChemDraw's does. SMILES
  // (⌥⌘C), InChI, InChIKey, CDXML Text (⌘D, the selection's whole drawing), MOL Text (⌥⌘O, V3000 as in ChemDraw
  // 26.1) and MOL V2000 Text (⇧⌥⌘O).
  const COPY_AS: Record<string, [string, (m: Mol) => string]> = {
    smiles: ["SMILES", (m) => chemistryOf(m, "smiles") ?? ""], inchi: ["InChI", (m) => toInchi(m) ?? ""], inchikey: ["an InChIKey", toInchiKey],
    mol: ["MOL text", (m) => toMolfile(m)], mol_v2000: ["MOL V2000 text", (m) => toMolfile(m, true)],
  };
  const copyAs = (what: string) => {
    const part = selectedPart() ?? doc;
    if (what === "cdxml") {
      if (!part.atoms.length && !part.captions?.length && !part.arrows?.length && !part.shapes?.length) return setNotice("There is nothing to copy.", "info");
      const cdxml = formatOf(part, "cdxml");
      return cdxml ? copyPlain(cdxml) : setNotice("Octet cannot write this drawing as CDXML.");
    }
    const [name, write] = COPY_AS[what], mol = withCaptionAtoms(part, style.interpret).mol;
    let text = "";
    try { text = mol.atoms.length && loaded ? write(mol).trimEnd() : ""; } catch { text = ""; }
    if (text) copyPlain(text);
    else if (mol.atoms.length) setNotice(`Octet cannot write this structure as ${name}.`);
    else setNotice("There is no structure to copy.", "info");
  };

  // The key to show beside an action: menu shortcuts, then the user's shortcut table.
  const MENU_KEYS: Record<string, string> = {
    undo: `${MOD}Z`, redo: `${MOD}Y`, invert_selection: `⇧${MOD}I`, clean_reaction: `⇧${MOD}X`, paste_hint: `${MOD}V`, clean_up: `⇧${MOD}K`, flip_h: `⇧${MOD}H`, flip_v: `⇧${MOD}V`, select_all: `${MOD}A`, zoom_fit: `${MOD}/`, centre_view: `⌥${MOD}/`, copy_smiles: `⌥${MOD}C`, copy: `${MOD}C`, delete: "⌫",
    copy_cdxml: `${MOD}D`, copy_mol: `⌥${MOD}O`, copy_mol_v2000: `⇧⌥${MOD}O`,
    structure_to_name: `⌥${MOD}N`, bring_front: `${MOD}[`, send_back: `${MOD}]`, "caption.align.justify": `⇧${MOD}J`,
    search_reaxys: `⌥${MOD}F`, search_reaxys_exact: `⇧⌥${MOD}F`, search_pubchem: `⌥${MOD}U`, search_pubchem_sub: `⇧⌥${MOD}U`,
    settings: `${MOD},`, name_to_structure: `⇧${MOD}N`, "caption.bold": `${MOD}B`, "caption.italic": `${MOD}I`, "caption.underline": `${MOD}U`, "caption.sub": `${MOD}−`, "caption.super": `${MOD}+`, "caption.plain": `${MOD}T`, "caption.formula": `${MOD}F`, "caption.edit": keyLabel("enter"),
  };
  const hint = (command: string) => {
    // A menu command's shortcut as the user has it (Settings), else as the menu has it.
    const own = menuReady ? keymap(settings.keys)[`menu.${command}`] : undefined;
    if (own) return own[0] ? keyLabel(own[0]) : undefined;
    const panelKey = keymap(settings.keys)[`action.${command}`]?.[0]; // an Actions panel action's own key (Settings)
    if (panelKey) return keyLabel(panelKey);
    if (MENU_KEYS[command]) return platformLabel(MENU_KEYS[command]);
    if (MENU_NAMES[command]?.[1]) return platformLabel(MENU_NAMES[command][1]);
    const first = keymap(settings.keys)[command]?.[0];
    return first ? keyLabel(first) : undefined;
  };

  // The names drawn before that match what is typed (all of them when nothing is), five at a time until opened.
  const historyMatches = naming === undefined ? [] : settings.nameHistory.filter(({ name: n }) => { const q = naming.trim().toLowerCase(); return !q || (n.toLowerCase().includes(q) && n.toLowerCase() !== q); });
  const historyRows = recent.all ? historyMatches : historyMatches.slice(0, 5), historyMore = !recent.all && historyMatches.length > 5;
  const historyMol = ({ name, smiles }: { name: string; smiles: string }) => {
    if (!historyMols.current.has(name) && loaded && (smiles || namesLoaded)) {
      let m: Mol | undefined;
      try { m = smiles ? parseStructure(smiles) : structureFor(name); } catch { m = undefined; }
      historyMols.current.set(name, m?.atoms.length ? m : undefined);
    }
    return historyMols.current.get(name);
  };
  const pickHistory = (entry: { name: string; smiles: string }) => {
    const frag = historyMol(entry) ?? structureFor(entry.name);
    if (!frag) return;
    place(frag, doc, namingAt.current);
    rememberName(entry.name, frag);
    setNaming(undefined);
  };

  // Everything the command palette offers: the actions for the selection, the menu commands, every tool and
  // variant (templates too), and the Settings modules. Each shows its shortcut where it has one. The aromatic display
  // names what it shows next for the structures it acts on, worked out only while the palette is open.
  const MENU_NAMES: Record<string, [string, string | undefined, React.ReactNode]> = {
    new: ["New drawing", `${MOD}N`, <FilePlus size={18} />], open: ["Open…", `${MOD}O`, <FolderOpen size={18} />], import: ["Import a structure…", "", <FileArrowDown size={18} />],
    save: ["Save", `${MOD}S`, <FloppyDisk size={18} />], save_as: ["Save as…", `⇧${MOD}S`, <FloppyDiskBack size={18} />],
    copy_smiles: ["Copy as SMILES", `⌥${MOD}C`, <CopySimple size={18} />], copy_inchi: ["Copy as InChI", "", <IdentificationBadge size={18} />], copy_inchikey: ["Copy as InChIKey", "", <Key size={18} />],
    copy_cdxml: ["Copy as CDXML text", `${MOD}D`, <FileCode size={18} />], copy_mol: ["Copy as MOL text", `⌥${MOD}O`, <FileTxt size={18} />], copy_mol_v2000: ["Copy as MOL V2000 text", `⇧⌥${MOD}O`, <Notepad size={18} />],
    export: ["Export…", EXPORT_KEYS, <ExportIcon size={18} />], print: ["Print…", `${MOD}P`, <Printer size={18} />], print_selection: ["Print selection…", "", <SelectionForeground size={18} />], apply_style_file: ["Apply settings from file…", "", <PaintRoller size={18} />], page_setup: ["Page setup…", `⇧${MOD}P`, <FileDashed size={18} />],
    about: ["About Octet Draw", "", <Info size={18} />], check_updates: ["Check for updates…", "", <CloudArrowDown size={18} />], report_problem: ["Report a problem…", "", <Bug size={18} />], tutorial: ["Tutorial", "", <GraduationCap size={18} />], atom_properties: ["Atom properties…", "", <Faders size={18} />], bond_properties: ["Bond properties…", "", <FadersHorizontal size={18} />],
    bracket_properties: ["Bracket properties…", "", <BracketsRound size={18} />], rlogic: ["R-Logic query…", "", <TreeStructure size={18} />],
    add_multicentre: ["Add multi-centre attachment", "", <Asterisk size={18} />], add_variable: ["Add variable attachment", "", <AsteriskSimple size={18} />],
    define_rgroup: ["Make an R-group definition", "", <BracketsSquare size={18} />], expand_generic: ["Expand generic structure", "", <SquaresFour size={18} />], atom_numbers: ["Show atom numbers", "", <Hash size={18} />],
    expand_label: ["Expand label", "", <ArrowsOutSimple size={18} />], contract_label: ["Contract label", "", <ArrowsInSimple size={18} />], stoichiometry: ["Analyse stoichiometry", "", <Table size={18} />],
    undo: ["Undo", `${MOD}Z`, <ArrowCounterClockwise size={18} />], redo: ["Redo", `${MOD}Y`, <ArrowClockwise size={18} />], invert_selection: ["Invert selection", `⇧${MOD}I`, <SelectionInverse size={18} />], clean_reaction: ["Clean up reaction", `⇧${MOD}X`, <Broom size={18} />],
    clean_reaction_augmented: ["Augmented clean up reaction", "", <StarFour size={18} />],
    map_reaction: ["Map atoms", "", <FlowArrow size={18} />], clear_reaction_map: ["Clear atom map", "", <X size={18} />],
    interpretation: [settings.interpretation ? "Hide reaction interpretation" : "Show reaction interpretation", "", <Lightbulb size={18} />],
    mirror_h: ["Flip horizontal", "", <FlipHorizontal size={18} />], mirror_v: ["Flip vertical", "", <FlipVertical size={18} />],
    properties: [settings.properties ? "Hide the Properties panel" : "Show the Properties panel", "", <Flask size={18} />], aromatic_display: [commandsOpen && (selection.size ? fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat() : doc.atoms.map((_, i) => i)).some((i) => doc.atoms[i].circle) ? "Show Kekulé bonds" : "Show aromatic circles", `⌥${MOD}K`, <Circle size={18} />], hydrogen_display: ["Toggle hydrogen display", "", <EyeSlash size={18} />], show_stereo: ["Show stereochemistry", "", <span className="glyph-text">R/S</span>], predict_1h: ["Predict ¹H-NMR shifts", "", <span className="glyph-text">¹H</span>], predict_13c: ["Predict ¹³C-NMR shifts", "", <span className="glyph-text">¹³C</span>], structure_perspective: ["Structure perspective", `⌥${MOD}S`, <Cube size={18} />], flatten: ["Flatten", "", <Square size={18} />], clean_3d: ["3D clean up", `⇧${MOD}D`, <CubeTransparent size={18} />],
    rotate_dialog: ["Rotate…", `${MOD}R`, <Angle size={18} />], scale_dialog: ["Scale…", `${MOD}K`, <Resize size={18} />],
    group: ["Group", `${MOD}G`, <BoundingBox size={18} />], ungroup: ["Ungroup", `⇧${MOD}G`, <SelectionSlash size={18} />], group_integral: ["Pick as one", "", <Unite size={18} />],
    join: ["Join", `${MOD}J`, <ArrowsMerge size={18} />], centre_page: ["Centre on page", "", <ArrowsInCardinal size={18} />], repeat: ["Repeat", "", <Repeat size={18} />],
    arrange_left: ["Align left edges", `⌥⇧${MOD}L`, <AlignLeft size={18} />], arrange_centre: ["Align left-right centres", `⌥⇧${MOD}C`, <AlignCenterHorizontal size={18} />],
    arrange_right: ["Align right edges", `⌥⇧${MOD}R`, <AlignRight size={18} />], arrange_top: ["Align top edges", `⌥⇧${MOD}T`, <AlignTop size={18} />],
    arrange_middle: ["Align top-bottom centres", `⌥⇧${MOD}M`, <AlignCenterVertical size={18} />], arrange_bottom: ["Align bottom edges", `⌥⇧${MOD}B`, <AlignBottom size={18} />],
    arrange_across: ["Distribute horizontally", `⌥⇧${MOD}H`, <ArrowsOutLineHorizontal size={18} />], arrange_down: ["Distribute vertically", `⌥⇧${MOD}V`, <ArrowsOutLineVertical size={18} />], select_all: ["Select all", `${MOD}A`, <SelectionAll size={18} />],
    clean_up: ["Clean up structure", `⇧${MOD}K`, <MagicWand size={18} />], flip_h: ["Rotate 180° horizontal", `⇧${MOD}H`, <ArrowsLeftRight size={18} />], flip_v: ["Rotate 180° vertical", `⇧${MOD}V`, <ArrowsDownUp size={18} />],
    zoom_in: ["Magnify", `⇧${MOD}+`, <MagnifyingGlassPlus size={18} />], zoom_out: ["Reduce", `⇧${MOD}−`, <MagnifyingGlassMinus size={18} />],
    zoom_actual: ["Actual size", `${MOD}\\`, <FrameCorners size={18} />], zoom_fit: ["Fit to window", `${MOD}/`, <CornersOut size={18} />], centre_view: ["Centre in window", `⌥${MOD}/`, <Crosshair size={18} />], show_page: ["Show page", "", <PageIcon size={18} />],
    name_to_structure: ["Convert name to structure", `⇧${MOD}N`, <AtomIcon size={18} />], insert_peptide: ["Insert peptide…", "", <Dna size={18} />], insert_rna: ["Insert RNA…", "", <span className="glyph-text">RNA</span>], insert_dna: ["Insert DNA…", "", <span className="glyph-text">DNA</span>], char_map: [charMap ? "Hide character map" : "Character map", `⇧${MOD}Space`, <span className="glyph-text">αβ</span>],
    check_structure: ["Check structure", "", <CheckCircle size={18} />], stereo_clear: ["Clear enhanced stereochemistry", "", <Prohibit size={18} />],
    stereo_abs: ["Mark as absolute", "", <span className="glyph-text">abs</span>], stereo_or: ["Create or group", "", <span className="glyph-text">or</span>], stereo_and: ["Create and group", "", <span className="glyph-text">&amp;</span>],
    snap: [settings.snap ? "Turn snapping off" : "Turn snapping on", undefined, <MagnetStraight size={18} />],
    grid: [guides.grid ? "Hide grid" : "Show grid", `${MOD}'`, <GridFour size={18} />],
    snap_grid: [settings.snapGrid ? "Turn grid snapping off" : "Turn grid snapping on", `⇧${MOD}'`, <DotsNine size={18} />],
    rulers: [guides.rulers ? "Hide rulers" : "Show rulers", `${MOD};`, <Ruler size={18} />],
    crosshair: [guides.crosshair ? "Hide crosshair" : "Show crosshair", `⌥${MOD}X`, <CrosshairSimple size={18} />],
    warnings: [settings.warnings ? "Hide chemical warnings" : "Show chemical warnings", undefined, <Warning size={18} />],
    fixed_lengths: [settings.fixedLengths ? "Turn fixed lengths off" : "Turn fixed lengths on", `${MOD}L`, <PencilRuler size={18} />],
    fixed_angles: [settings.fixedAngles ? "Turn fixed angles off" : "Turn fixed angles on", `${MOD}E`, <CompassTool size={18} />],
    actions: [settings.actions ? "Hide the Actions panel" : "Show the Actions panel", undefined, <SlidersHorizontal size={18} />],
    text_bold: ["Bold", `${MOD}B`, <TextB size={18} />], text_italic: ["Italic", `${MOD}I`, <TextItalic size={18} />], text_underline: ["Underline", `${MOD}U`, <TextUnderline size={18} />],
    align_left: ["Flush left", `⇧${MOD}L`, <TextAlignLeft size={18} />], align_centre: ["Centre text", `⇧${MOD}C`, <TextAlignCenter size={18} />], align_right: ["Flush right", `⇧${MOD}R`, <TextAlignRight size={18} />],
    align_justify: ["Justified", `⇧${MOD}J`, <TextAlignJustify size={18} />], align_above: ["Stacked above", "", <CaretLineUp size={18} />], align_auto: ["Automatic label alignment", `⇧${MOD}M`, <Sparkle size={18} />],
    interpret: ["Interpret chemically", "", <GraphIcon size={18} />], make_element: ["Make element", "", <TextTSlash size={18} />],
    text_markup: ["Apply markup", "", <MarkdownLogo size={18} />], ...(expPage ? { experiment_details: ["Experiment details…", "", <Notebook size={18} />] } as Record<string, [string, string, React.ReactNode]> : {}),
    font_other: ["Other font…", "", <TextAa size={18} />], size_other: ["Other size…", "", <ArrowsVertical size={18} />], line_spacing: ["Line spacing…", "", <Paragraph size={18} />],
    bring_front: ["Bring to front", `${MOD}[`, <StackSimple size={18} />], send_back: ["Send to back", `${MOD}]`, <Stack size={18} />],
    ...(settings.onlineSearch ? {
      search_reaxys: ["Search Reaxys", `⌥${MOD}F`, <SearchGlyph letter="R" />], search_reaxys_exact: ["Search Reaxys for exact structure", `⇧⌥${MOD}F`, <SearchGlyph letter="R" />],
      search_pubchem: ["Search PubChem", `⌥${MOD}U`, <SearchGlyph letter="P" />], search_pubchem_sub: ["Search PubChem for substructures", `⇧⌥${MOD}U`, <SearchGlyph letter="P" />],
    } as Record<string, [string, string, React.ReactNode]> : {}),
  };
  // Other spellings people search with (American ones), by command.
  const WORDS: Record<string, string> = { stoichiometry: "analyze analysis" };
  const paletteCommands = (): Command[] => {
    const toolKey = (id: string) => { const k = keymap(settings.keys)[id]?.[0]; return k ? keyLabel(k) : undefined; };
    const pick = (t: Tool, variant?: [string, string]) => () => { if (variant) setSettings((s) => ({ ...s, variants: { ...s.variants, [variant[0]]: variant[1] } })); setTool(t); };
    const variants = (t: Tool, slot: string, list: [string, string, React.ReactNode][], group: string, words = ""): Command[] =>
      list.map(([kind, name, icon]) => ({ id: `${t}:${kind}`, name, group, icon, words, run: pick(t, [slot, kind]) }));
    // A menu command that is also one of the selection's actions shows once, as the action.
    const acts = actionItems(contextOf(), untidy, hiddenHere(), selectedOf(found).length, settings.onlineSearch), acted = new Set(acts.map((i) => i.command));
    return [
      ...acts.map((i) => ({ id: `action:${i.command}`, name: i.name, group: "Actions", icon: i.icon, keys: hint(i.command), words: WORDS[i.command], run: () => runAction(i.command) })),
      ...Object.entries(MENU_NAMES).filter(([id]) => commands.current[id] && !acted.has(id)).map(([id, [name, , icon]]) => ({ id: `menu:${id}`, name, group: "Commands", keys: hint(id), icon, words: WORDS[id], run: () => commands.current[id]() })),
      { id: `new:${QUICK}`, name: "Quick start", group: "Commands", words: "new drawing canvas", icon: <FilePlus size={18} />, run: () => newDrawing(QUICK) },
      // The selection's picture as the drawing's thumbnail on Home (Home's Set Thumbnail… takes a picture file).
      ...(TAURI && file.path && (selection.size || picked.size) ? [{ id: "home-thumb", name: "Use selection as thumbnail", group: "Commands", words: "home picture preview", icon: <ImageSquare size={18} />,
        run: () => { const path = file.path, part = selectedPart(), svg = part && pictureOf(part); if (path && svg) library.ownSvg(path, svg); } }] : []),
      ...purposeList.map((p) => ({ id: `new:${p.id}`, name: `New ${p.name}`, group: "Commands", words: "new drawing template", icon: <FilePlus size={18} />, run: () => newDrawing(p.id) })),
      ...purposeList.map((p) => ({ id: `for:${p.id}`, name: `For ${p.name}`, group: "Document", words: "template size page scale", icon: <FileText size={18} />, run: () => applyPurpose(p.id) })),
      { id: "tool:select", name: "Select", group: "Tools", keys: toolKey("tool.select"), icon: <Selection size={18} />, run: pick("select", ["select", "box"]) },
      { id: "tool:lasso", name: "Lasso", group: "Tools", icon: <Lasso size={18} />, run: pick("select", ["select", "lasso"]) },
      ...variants("bond", "bond", (Object.keys(BONDS) as BondKind[]).map((k) => [k, `${BONDS[k].name} bond`, <BondGlyph kind={k} />]), "Bonds"),
      { id: "tool:chain", name: "Chain", group: "Tools", keys: toolKey("tool.chain"), icon: <ChainGlyph />, run: pick("chain") },
      ...variants("ring", "ring", (Object.keys(RINGS) as RingKind[]).map((k) => [k, RINGS[k].name, <RingGlyph kind={k} />]), "Rings"),
      ...LIBRARY.flatMap((c) => variants("template", "template", c.items.map((t) => [t.kind, t.name, <TemplateGlyph mol={t.icon ?? t.mol} />]), c.name, "template")),
      ...templates.map((t) => ({ id: `template:${templateKind(t.id)}`, name: t.name, group: "My templates", icon: <TemplateGlyph mol={t.mol} />, run: pick("template", ["template", templateKind(t.id)]) })),
      // Each template set as a floating palette (View > Templates).
      ...menuSets.map((set) => ({ id: `palette:${set}`, name: `Keep ${set} open`, group: "Templates", icon: <ArrowSquareOut size={18} />, run: () => keepOpen(set, "template") })),
      ...(TAURI ? menuSets.map((set) => ({ id: `ctp:${set}`, name: `Save ${set} for ChemDraw…`, group: "Templates", icon: <FileArrowUp size={18} />, run: () => saveTemplateSet(set) })) : []),
      ...variants("symbol", "symbol", Object.entries(SYMBOLS).map(([k, n]) => [k, n, <SymbolGlyph kind={k as SymbolKind} />]), "Symbols"),
      ...variants("arrow", "arrow", [...STRAIGHT, ...["curved", "fishhook", "double"].flatMap((k) => SWEEPS.map((sw) => `${k}-${sw}`)), ...ELLIPSES]
        .map((k) => [k, `${arrowName(k)} arrow`, <ArrowGlyph kind={k} />]), "Arrows"),
      ...variants("shape", "shape", [...SHAPE_GRID.flat(), ...SHAPE_EXTRA].map((k) => [k, shapeName(k)!, <ElementGlyph v={k} />]), "Shapes"),
      ...variants("bracket", "bracket", Object.entries(BRACKETS).map(([k, n]) => [k, n, <BracketGlyph v={k} />]), "Brackets"),
      ...variants("orbital", "orbital", ORBITAL_GRID.flat().map((k) => [k, orbitalName(k)!, <OrbitalGlyph v={k} />]), "Orbitals"),
      { id: "tool:text", name: "Text", group: "Tools", keys: toolKey("tool.text"), icon: <TextT size={18} />, run: pick("text") },
      { id: "tool:erase", name: "Eraser", group: "Tools", icon: <Eraser size={18} />, run: pick("erase") },
      ...([["document", "Document settings", <FileText size={18} />], ["keys", "Keyboard shortcuts", <Keyboard size={18} />], ["appearance", "Appearance settings", <Swatches size={18} />], ["files", "Import and export settings", <Files size={18} />], ["warnings", "Warnings settings", <WarningDiamond size={18} />]] as [ModuleId, string, React.ReactNode][])
        .map(([id, name, icon]) => ({ id: `settings:${id}`, name, group: "Settings", icon, run: () => setSettingsOpen(id) })),
      { id: "settings:open", name: "Settings", group: "Settings", keys: `${MOD},`, icon: <GearSix size={18} />, run: () => commands.current.settings() },
    ];
  };
  // A typed name (spelling mended) or SMILES, as a command that draws it.
  const drawCommand = (q: string): Command | undefined => {
    const text = q.trim();
    if (text.length < 2) return undefined;
    const found = structureOrSuggestion(text);
    if (!found) return undefined;
    const { frag, name: shown } = found;
    return { id: `draw:${shown}`, name: `Draw ${shown}`, group: "Structure", icon: <TemplateGlyph mol={frag} />, run: () => { place(frag); if (structureFor(shown)) rememberName(shown, frag); } };
  };
  // Octet's own names that begin as typed (TREN and Tris for "TR"), each as a command that draws it: the ones drawn before
  // while typing, all of them once typing pauses (read).
  const nameCommands = (q: string, read: boolean): Command[] => (loaded && namesLoaded ? namesStarting(q, 6).filter((name) => read || namedMols.has(name)) : []).flatMap((name) => {
    const frag = namedMol(name);
    return frag ? [{ id: `draw:${name}`, name: `Draw ${name}`, group: "Structure", icon: <TemplateGlyph mol={frag} />, run: () => { place(withOwnCaption(name, frag)); rememberName(name, frag); } }] : [];
  });

  // Runs an action from the panel on the selected atom, bond or atoms.
  // Colour by Element: the selected (or every) heteroatom label in its element's colour (the brand's element colours,
  // with the user's own from Settings > Colours); carbon and hydrogen keep the ink.
  function colourByElement() {
    if (editing) return setEditing({ ...editing, colour: "element" }); // a label being typed: its element's colour
    const by = { ...elementColours(), ...settings.elementColours }, atoms = selection.size ? selection : new Set(doc.atoms.map((_, i) => i));
    set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.has(i) && by[a.label] ? { ...a, colour: by[a.label] } : a)) }, true);
  }
  // The document's style as saved: with the user's colours and the drawing's own palette (ChemDraw keeps a palette in
  // each document).
  const savedStyle = (): DocStyle => {
    const own = [...settings.palette, ...(style.palette ?? []).filter((c) => !settings.palette.some((u) => u.hex.toLowerCase() === c.hex.toLowerCase()))].slice(0, 24);
    return own.length ? { ...style, palette: own } : style;
  };
  function runAction(command: string) {
    const ids = [...selection];
    if (commands.current[command]) return commands.current[command]();
    if (REPEATS.test(command)) lastRepeat.current = { action: command };
    // The Actions panel's Scale field: the selection takes that scale with its labels and lines, about its middle; when
    // its parts differ, each structure, group and object takes it about its own middle.
    if (command.startsWith("scale.")) {
      const v = Number(command.slice(6)) / 100, now = selectionScale(), middles = captionMiddles();
      if (!(v > 0) || now === undefined) return;
      if (now !== null) return set(scaledParts(doc, selection, picked, [v / now, v / now], selectionMiddle(), true, middles), true);
      let m = doc;
      for (const t of things()) {
        const own = [...t.atoms.map((i) => doc.atoms[i]), ...[...(doc.arrows ?? []), ...(doc.shapes ?? []), ...(doc.cycles ?? [])].filter((x) => t.items.includes(x.id))].map(scaleOf).sort((a, b) => a - b);
        if (!own.length) continue;
        const k = v / own[Math.floor(own.length / 2)];
        m = scaledParts(m, new Set(t.atoms), new Set(t.items), [k, k], [(t.box[0] + t.box[2]) / 2, (t.box[1] + t.box[3]) / 2], true, middles);
      }
      return set(m, true);
    }
    const context = contextOf();
    // Colour, for everything selected, as ChemDraw's Color menu: atoms (their labels and marks), the bonds between
    // them, and every picked arrow, orbital, line, shape, table, TLC plate, cycle and caption, whatever else is picked
    // with them. Black is the document's ink, so it clears the colour. Only text being typed (or the Text tool's next
    // text) takes the colour as a text style.
    // A picked grid cell: ChemDraw's Set Limiting, Hide Row, Hide Column and Show All, and removing the grid.
    if (command.startsWith("grid.") && gridPick) {
      const what = command.slice(5), { arrow, key, row } = gridPick;
      if (what === "limiting") return changeGrid(arrow, () => ({ limiting: key }));
      if (what === "show") return changeGrid(arrow, () => ({ hidden: undefined }));
      setGridPick(undefined);
      if (what === "layout") return changeGrid(arrow, (g) => ({ layout: g.layout ? undefined : "rows" }));
      // As rows (Grid.layout), a row is a component and a column a quantity: Hide row hides what shows as a row.
      const rowsLayout = doc.grids?.find((g) => g.arrow === arrow)?.layout === "rows", hideKey = what === (rowsLayout ? "hide.row" : "hide.col");
      if (!hideKey && row === "name") return;
      if (what === "hide.row" || what === "hide.col") return changeGrid(arrow, (g) => (hideKey ? { hidden: { ...g.hidden, cols: [...(g.hidden?.cols ?? []), key] } } : { hidden: { ...g.hidden, rows: [...(g.hidden?.rows ?? []), row] } }));
      // Every grid of the reaction goes (an experiment page gives each of its arrows one), as Analyse Stoichiometry takes it off.
      if (what === "remove") { const r = reactionOf(arrow)?.arrows ?? [arrow]; return set({ ...doc, grids: doc.grids?.filter((g) => !r.includes(g.arrow)) }, true); }
    }
    if (command === "delete" && context.kind === "grid") return runAction("grid.remove");
    if (command.startsWith("colour.")) {
      const hex = command.slice(7), ink = hex.toLowerCase() === "#000000" ? undefined : hex;
      // A label being typed takes the colour when its box closes.
      if (editing) return setEditing({ ...editing, colour: hex });
      if (context.kind === "grid" && gridPick) return changeGrid(gridPick.arrow, () => ({ colour: ink }));
      if (context.kind === "caption" && context.mode !== "picked") return runAction(`caption.colour.${hex}`);
      if (context.kind === "spot" && spotPick) return set(editSpot(doc, spotPick.plate, spotPick.index, () => ({ colour: ink })), true);
      if (context.kind === "cycle" && context.side && branchPick) return set(setBranch(doc, branchPick.cycle, branchPick.branch, { colour: ink }), true);
      const pick = <T extends { id: number; colour?: string }>(x: T): T => (picked.has(x.id) ? { ...x, colour: ink } : x);
      return set({
        ...doc,
        atoms: context.kind === "bond" ? doc.atoms : doc.atoms.map((a, i) => (selection.has(i) ? { ...a, colour: ink } : a)), // a bond alone keeps its atoms' colours
        bonds: doc.bonds.map((b) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? { ...b, colour: ink } : b)),
        arrows: doc.arrows?.map(pick), shapes: doc.shapes?.map(pick), cycles: doc.cycles?.map(pick),
        // A whole caption takes the colour on all its characters: its runs lose their own.
        captions: doc.captions?.map((c) => (picked.has(c.id) ? { ...c, colour: hex.toLowerCase() === style.colour.toLowerCase() ? undefined : hex, ...(c.runs ? { runs: styled(without(c.runs, ["colour"])) ? without(c.runs, ["colour"]) : undefined } : {}) } : c)),
      }, true);
    }
    // Highlight colours and ring fills, as ChemDraw's Highlight and Ring Fill colour toolbars; none takes them off. A
    // highlight goes on the selected atoms and the bonds between them. A ring fill goes in the rings fillRings finds,
    // and replaces the fill each one had, so fused rings keep their own. A custom colour dragged in the picker is one
    // step to undo (merge).
    // A bond alone takes its highlight without its atoms, as it takes a colour.
    if (command.startsWith("halo.") || command.startsWith("ringfill.")) {
      const value = command.split(".")[1], c = value === "none" ? undefined : value;
      const atoms = selection.size ? selection : new Set(doc.atoms.map((_, i) => i)), merge = command.endsWith(".drag") ? command.split(".")[0] : undefined;
      if (command.startsWith("halo.")) return set({ ...doc, atoms: contextOf().kind === "bond" ? doc.atoms : doc.atoms.map((a, i) => (atoms.has(i) ? { ...a, halo: c } : a)), bonds: doc.bonds.map((b) => (atoms.has(b.atoms[0]) && atoms.has(b.atoms[1]) ? { ...b, halo: c } : b)) }, true, merge);
      const targets = fillRings(doc, atoms), keys = new Set(targets.map(ringKey)), rest = (doc.fills ?? []).filter((f) => !keys.has(ringKey(f.atoms)));
      const fills = [...rest, ...(c ? targets.map((r) => ({ atoms: r, colour: c })) : [])];
      return set({ ...doc, fills: fills.length ? fills : undefined }, true, merge);
    }

    if (["copy_smiles", "copy_inchi", "copy_inchikey", "copy_cdxml", "copy_mol", "copy_mol_v2000"].includes(command)) return copyAs(command.slice(5));
    if (command === "copy") return void document.execCommand("copy");
    if (command === "paste_hint") return setNotice(`Copy a name, SMILES string or MOL file. Then press ${MOD}V here.`, "info");
    if (command.startsWith("copy_text:")) return copyPlain(command.slice(10));
    if (command.startsWith("fix:")) { const [, i, charge] = command.split(":"); return set(addCharge(doc, Number(i), Number(charge) - (doc.atoms[Number(i)].charge ?? 0)), true); }
    // A problem's atom (a3), bond (b5), brackets (s7) or caption (c4): shown (selected), or its warnings hidden (the
    // object's Display Warnings goes off, as in ChemDraw; saved as IgnoreWarnings). A caption's Interpret Chemically
    // goes off instead, as ChemDraw's help says to do.
    if (command.startsWith("show:") || command.startsWith("hide_warning:")) {
      const what = command.slice(command.indexOf(":") + 1), n = Number(what.slice(1)), on = what[0];
      if (command.startsWith("show:")) return showProblem(on === "b" ? { type: "misc", message: "", bond: n } : on === "s" ? { type: "misc", message: "", shape: n } : on === "c" ? { type: "misc", message: "", caption: n } : { type: "misc", message: "", atom: on === "a" ? n : Number(what) });
      if (on === "c") return doc.captions?.some((c) => c.id === n) && set(hideProblems(doc, [{ caption: n }]), true);
      if (on === "b") return doc.bonds[n] && set(hideProblems(doc, [{ bond: n }]), true);
      if (on === "s") return doc.shapes?.some((x) => x.id === n) && set(hideProblems(doc, [{ shape: n }]), true);
      const i = on === "a" ? n : Number(what);
      return doc.atoms[i] && set(hideProblems(doc, [{ atom: i }]), true);
    }
    // A wedge or hash drawn the wrong way round: its ends swapped.
    if (command.startsWith("flip_bond:")) { const k = Number(command.slice(10)); return doc.bonds[k] && set(flipBond(doc, k), true); }
    if (command.startsWith("align.")) return glideTo(alignFragments(doc, selection, command.slice(6) as "row" | "column" | "spread-row"));
    if (command === "delete" && context.kind === "spot") return runAction("spot.delete");
    // A cycle's side arrow picked goes with its text (its structures stay); a step picked loses its arc.
    if (command === "delete" && context.kind === "cycle" && context.side) return cycleAction("side.remove");
    if (command === "delete" && context.kind === "cycle" && context.step && stepPick) return set(hideArc(stepPick.cycle, stepPick.step), true);
    if (command === "delete") return selection.size || picked.size ? set(deleteChosen(doc, selection, picked, undefined, drawnAt, drawnAlign)) : undefined;
    if (command === "number") return numberStructures();
    // Compound numbers in roman numerals (I, II, III) or arabic ones again, as ChemDraw's reaction numbering offers.
    if (command === "numbers.roman") return set(setRoman(doc, !romanNumbers(doc)), true);
    // Atom mapping (Map Reaction Atoms): every step of the picked reaction, numbered by Indigo, with one numbering
    // through the scheme and Rxn marks on the bonds the reaction changes (interpret.ts); or every number cleared.
    if (command === "reaction.map" || command === "reaction.unmap") {
      const arrow = [...picked].find((id) => arrows.some((a) => a.id === id && straightArrow(a)));
      const r = reactionPicked() ?? (arrow !== undefined ? reactionOf(arrow) : undefined);
      if (!r) return setNotice("Select a reaction first.", "info");
      if (command === "reaction.unmap") return set(clearScheme(doc, new Set(r.atoms)), true);
      const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
      const steps = interpret(doc, r, captionBox).map((x) => ({ reactants: structures(x.reactants), products: structures(x.products) }));
      const mapped = mapScheme(doc, steps, mapReaction, (atoms) => pickAtoms(doc, atoms));
      return mapped ? set(mapped, true) : setNotice("Octet cannot map these atoms.");
    }
    if (command.startsWith("cycle.")) return cycleAction(command.slice(6));

    // Enhanced stereo: one stereocentre's flag (again to take it off), or every stereocentre in the selection at once.
    if (command.startsWith("stereo.")) {
      const [, what, arg] = command.split(".");
      if (what === "atom") { const i = [...selection][0]; return set(setEnhanced(doc, [i], doc.atoms[i].enhanced === arg ? undefined : arg), true); }
      return set(setEnhanced(doc, stereocentres(doc, selection), what === "racemic" ? "&1" : what === "relative" ? "or1" : undefined), true);
    }
    // A picked TLC spot: style, size (hundredths of a bond length), tail, its own Rf, removal.
    if (command.startsWith("spot.") && spotPick) {
      const [, what, arg] = command.split("."), at = (change: Parameters<typeof editSpot>[3]) => set(editSpot(doc, spotPick.plate, spotPick.index, change), true, `spot-${what}`);
      if (what === "style") return set(editSpot(doc, spotPick.plate, spotPick.index, (x) => restyleSpot(x, arg, !(arg === "dashed" || arg === "bold" || arg === "doubled") || !x[arg]), true), true);
      // Set Rf…: its Rf typed in (the spot moves to it).
      if (what === "setrf") { const x = doc.shapes?.find((y) => y.id === spotPick.plate)?.tlc?.spots[spotPick.index]; return x && setDialog({ kind: "rf", plate: spotPick.plate, index: spotPick.index, value: String(x.rf) }); }
      // The size shown is the size drawn; the spot keeps it over its plate's scale.
      if (what === "w" || what === "h" || what === "tail") return at(() => ({ [what]: Number(arg) / 100 / scaleOf(doc.shapes?.find((x) => x.id === spotPick.plate) ?? {}) }));
      if (what === "rf") return at((x) => ({ showRf: x.showRf ? undefined : true }));
      if (what === "delete") {
        const sh = doc.shapes?.find((x) => x.id === spotPick.plate);
        setSpotPick(undefined);
        return sh?.tlc ? set(updateShape(doc, sh.id, { tlc: { ...sh.tlc, spots: sh.tlc.spots.filter((_, k) => k !== spotPick.index) } }), true) : undefined;
      }
    }
    if (command.startsWith("shape.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.shapes ?? []).filter((x) => picked.has(x.id)).map((x) => x.id));
      const each = (f: (x: Shape) => Partial<Shape>) => set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, ...f(x) } : x)) }, true);
      if (what === "kind") {
        setSettings((s) => ({ ...s, variants: { ...s.variants, shape: arg } }));
        // A colour made for a highlight's fill (or an outline) does not carry over between the two.
        return each((x) => ({ kind: arg as ShapeKind, ...((x.kind === "highlight") !== (arg === "highlight") ? { colour: undefined } : {}) }));
      }
      if (what === "dashed") return each((x) => ({ dashed: !x.dashed || undefined }));
      // A shadow's depth, softness and opacity (in hundredths), from the Actions sliders: a drag is one undo step.
      if (what === "depth" || what === "blur" || what === "opacity") {
        const value = Number(arg) / 100;
        return set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, shade: { ...SHADE, ...x.shade, [what]: value } } : x)) }, true, `shade-${what}-${[...ids].join()}`);
      }
      // TLC plates, as ChemDraw's Add Lane, Duplicate Lane and Delete Lane: at the lane last pressed or right-clicked
      // (a new lane goes after it), or at the last lane. The plate grows or shrinks by a lane. Rf values on or off.
      if (what === "lanes") return each((x) => {
        const n = x.tlc?.lanes ?? 1, k = lanePick?.plate === x.id ? Math.min(n - 1, lanePick.lane) : n - 1;
        if (arg !== "-1") setLanePick({ plate: x.id, lane: k + 1 });
        return arg === "-1" ? deleteLane(x, k) : addLane(x, k + 1, arg === "copy" ? k : undefined);
      });
      if (what === "rf") return each((x) => ({ tlc: { ...x.tlc!, rf: !x.tlc?.rf || undefined } }));
      // Show Side Ticks and Transparent, as ChemDraw's plate menu.
      if (what === "ticks" || what === "transparent") return each((x) => ({ tlc: { ...x.tlc!, [what]: !x.tlc?.[what] || undefined } }));
      // A plate's origin, front or border shown or hidden, and one style for all its spots.
      if (what === "hide") return each((x) => { const h = new Set(x.tlc?.hide ?? []), k = arg as "origin" | "front" | "border"; if (h.has(k)) h.delete(k); else h.add(k); return { tlc: { ...x.tlc!, hide: h.size ? [...h] : undefined } }; });
      // Every spot's style at once (a toggle goes on unless every spot has it already).
      if (what === "spots") return each((x) => {
        const spots = x.tlc?.spots ?? [], on = !spots.every((y) => (arg === "dashed" || arg === "bold" || arg === "doubled") && y[arg]);
        return { tlc: { ...x.tlc!, spots: spots.map((y) => restyleSpot(y, arg, on)) } };
      });
      // Tables: rows and columns added or deleted at the cell last typed in (at the end without one), the lines drawn
      // (a set, or one line on or off), the cells' alignment (the cell's column, or all), the lines' width, Clear
      // Contents and Size To Fit Contents.
      if (what === "row" || what === "col") return each((x) => {
        const t = tableLayout(x, cellWidth(x), style.captionSize), mine = lastCell?.id === x.id ? lastCell : undefined;
        const at = what === "row" ? mine?.r ?? t.rows - 1 : mine?.c ?? t.cols - 1, after = arg === "after" ? 1 : 0;
        if (mine && arg !== "delete") setLastCell({ ...mine, ...(after ? {} : what === "row" ? { r: mine.r + 1 } : { c: mine.c + 1 }) });
        return arg === "delete" ? spliceTable(x, what, at, 1, 0, cellWidth(x), style.captionSize) : spliceTable(x, what, at + after, 0, 1, cellWidth(x), style.captionSize);
      });
      if (what === "lines") return each((x) => ({ table: { ...x.table!, grid: undefined, lines: arg in TABLE_LINES ? TABLE_LINES[arg as keyof typeof TABLE_LINES] : linesOf(x.table).includes(arg as TableLine) ? linesOf(x.table).filter((l) => l !== arg) : [...linesOf(x.table), arg as TableLine] } }));
      if (what === "align") return each((x) => {
        const cols = tableLayout(x, cellWidth(x), style.captionSize).cols, only = lastCell?.id === x.id ? lastCell.c : undefined;
        return { table: { ...x.table!, align: Array.from({ length: cols }, (_, c) => (only === undefined || c === only ? arg as CellAlign : x.table?.align?.[c] ?? "centre")) } };
      });
      if (what === "clear") return each((x) => clearTable(x));
      if (what === "fit") return each((x) => fitTable(x, cellWidth(x), style.captionSize));
      // One style at a time: plain, dashed, shaded, filled or with a shadow.
      if (what === "style") return each(() => ({ dashed: arg === "dashed" || undefined, fill: arg === "shaded" || arg === "solid" || arg === "faded" ? arg : undefined, shadow: arg === "shadow" || undefined }));
      if (what === "boldline") return each((x) => ({ boldLine: !x.boldLine || undefined }));
      if (what === "side") return each(() => ({ side: arg === "both" ? undefined : (arg as "left" | "right") }));
      if (what === "mark") return each((x) => ({ mark: x.mark === arg ? undefined : arg }));
      if (what === "colour") return each(() => ({ colour: arg.toLowerCase() === "#000000" ? undefined : arg }));
      if (what === "front" || what === "back") return restack(what === "front");
    }
    if (command.startsWith("orbital.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id) && isOrbital(a)).map((a) => a.id));
      const each = (f: (a: Arrow) => Partial<Arrow>) => set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, ...f(a) } : a)) }, true);
      const first = doc.arrows?.find((a) => ids.has(a.id));
      if (first?.orbital && (what === "shape" || what === "phase")) {
        const next = { ...first.orbital, [what]: arg } as NonNullable<Arrow["orbital"]>;
        if (next.phase === "phased" && !["p", "d", "dz2", "hybrid"].includes(next.shape)) next.phase = "filled";
        setSettings((s) => ({ ...s, variants: { ...s.variants, orbital: `${next.shape}-${next.phase}` } }));
        return each((a) => ({ orbital: { ...a.orbital!, [what]: arg, ...(next.phase !== (what === "phase" ? arg : a.orbital!.phase) ? { phase: next.phase } : {}) } as Arrow["orbital"] }));
      }
      // Turning an orbital round swaps its phases.
      if (what === "swap") return each((a) => ({ to: [2 * a.from[0] - a.to[0], 2 * a.from[1] - a.to[1]] }));
    }
    // The line width of every picked arrow, shape (a table's rules, 0.1 pt at least) and cycle, as ChemDraw's Object
    // Settings > Line Width: one undo step for a whole slider drag. The width given is the width drawn; each object
    // keeps it over its scale.
    if (command.startsWith("lines.weight.")) {
      const w = Number(command.slice(13)) / 100, on = (x: { id: number }) => picked.has(x.id);
      return set({ ...doc, arrows: doc.arrows?.map((a) => (on(a) ? { ...a, width: w / scaleOf(a) } : a)), cycles: doc.cycles?.map((c) => (on(c) ? { ...c, width: w / scaleOf(c) } : c)),
        shapes: doc.shapes?.map((x) => (!on(x) ? x : x.table ? { ...x, table: { ...x.table, weight: Math.max(0.1, w) / scaleOf(x) } } : { ...x, width: w / scaleOf(x) })) }, true, `lines-weight-${[...picked].join()}`);
    }
    if (command.startsWith("arrow.")) {
      const [, what, arg] = command.split(".");
      const ids = new Set((doc.arrows ?? []).filter((a) => picked.has(a.id)).map((a) => a.id)), id = [...ids][0];
      const each = (f: (a: Arrow) => Partial<Arrow>) => set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, ...f(a) } : a)) }, true);
      if (what === "kind") {
        // Switching between straight and curved adds or drops the bend (a straight arrow with a point keeps its own).
        // An unbalanced equilibrium has a ratio of 3. To and from a block arrow, the heads take the new kind's size.
        const pick = arrowVariant(arg), kind = pick?.kind ?? (arg as ArrowKind), bent = curved({ kind }), first = doc.arrows?.find((a) => ids.has(a.id));
        setSettings((s) => ({ ...s, variants: { ...s.variants, arrow: bent ? `${kind}-${first?.bend ? nearestSweep(first.bend) : 120}` : arg } }));
        return each((a) => ({ kind, bend: bent ? (a.bend || sweepBend(120)) : a.point ? a.bend : undefined, point: bent ? undefined : a.point, ratio: pick?.ratio,
          ...((a.kind === "block") !== (kind === "block") ? { headSize: undefined, shaft: undefined, fill: undefined } : {}) }));
      }
      // ChemDraw's arrow sizes (Large, Medium, Small) for the heads; a kind's own size is left unset.
      if (what === "size" && (arg === "large" || arg === "medium" || arg === "small")) return each((a) => {
        if (!headed(a)) return {};
        const head = sizedHead(a, arg), own = sizedHead(a, a.kind === "block" ? "large" : "small");
        return { headSize: head.length === own.length ? undefined : head };
      });
      if (what === "sweep") {
        const first = doc.arrows?.find((a) => ids.has(a.id) && curved(a));
        if (first) setSettings((s) => ({ ...s, variants: { ...s.variants, arrow: `${first.kind}-${arg}` } }));
        return each((a) => (curved(a) ? { bend: (Math.sign(a.bend ?? 1) || 1) * sweepBend(Number(arg)) } : {}));
      }
      if (what === "reverse") return each((a) => ({ from: a.to, to: a.from, ...(a.bend ? { bend: -a.bend } : {}), ...(a.curve ? { curve: { ...a.curve, points: [...a.curve.points].reverse().map((q) => ({ at: q.at, ...(q.c2 ? { c1: q.c2 } : {}), ...(q.c1 ? { c2: q.c1 } : {}) })) } } : {}), ...(a.start || a.end ? { start: a.end, end: a.start } : {}) }));
      // The Curves model: a head at the start or end (again with the same head takes it off), the heads' shape,
      // a pen curve closed or opened, and a closed curve's fill (again takes it off).
      if (what === "start" || what === "end") {
        const h = arg as Head, all = (doc.arrows ?? []).filter((a) => ids.has(a.id) && takesHeads(a)), on = all.every((a) => headsOf(a)[what] === h);
        return each((a) => (takesHeads(a) ? { [what]: on && h !== "none" ? "none" : h } : {}));
      }
      if (what === "head") return each((a) => (shapesHeads(a) ? { head: arg === "solid" ? undefined : (arg as HeadShape) } : {}));
      if (what === "closed") return each((a) => (a.curve ? { curve: { ...a.curve, closed: !a.curve.closed || undefined }, ...(a.curve.closed ? { fill: undefined } : {}) } : {}));
      if (what === "fill") return each((a) => (a.curve?.closed || a.kind === "block" ? { fill: arg === "none" || a.fill === arg ? undefined : (arg as CurveFill) } : {}));
      // A style chip sets it; the arrows' Dashed line action turns dashes on and off. Heads set by hand double as
      // the line goes bold and halve as it stops being bold, as in ChemDraw (a kind's own size follows by itself).
      if (what === "style") return each((a) => {
        const style = arg === "plain" || (arg === "dashed" && a.style === "dashed" && !isLine(a) && a.kind !== "curve") ? undefined : (arg as Arrow["style"]);
        const k = (style === "bold") === (a.style === "bold") ? 1 : style === "bold" ? 2 : 0.5, h = a.headSize;
        return { style, ...(h && k !== 1 ? { headSize: { length: h.length * k, centre: h.centre * k, width: h.width * k } } : {}) };
      });
      if (what === "flip") return each((a) => ({ bend: -(a.bend ?? sweepBend(120)) }));
      // A straight arrow's point: added (it may then bend and branch), or taken off with its bend.
      if (what === "point") return each((a) => (pointable(a) ? (a.point ? { point: undefined, bend: undefined } : { point: true }) : {}));
      // The line width, as for shapes (one undo step for a whole slider drag).
      // The width shown is the width drawn; the arrow keeps it over its scale.
      if (what === "weight") return set({ ...doc, arrows: doc.arrows?.map((a) => (ids.has(a.id) ? { ...a, width: Number(arg) / 100 / scaleOf(a) } : a)) }, true, `arrow-weight-${[...ids].join()}`);
      if ((what === "above" || what === "below") && id !== undefined) {
        setPicked(new Set());
        return openWriting({ value: "", on: { arrow: id, side: what }, style: { ...textStyle } });
      }
    }
    // Add to templates: into My templates (the Actions panel), into a set (the right-click menu), or into a new set.
    if (command === "template.add" || command.startsWith("template.add:")) return addPart(templatePart(), command.slice(13) || MY_SET);
    if (command === "template.add.new") { const part = templatePart(); return part && askSet((set) => addPart(part, set)); }
    if (command === "dictionary.add") return addToDictionary();
    if (command === "caption.add") {
      // A new caption under the selected structures, centred on them.
      const under = fragments(doc).filter((g) => g.some((i) => selection.has(i))).flat();
      setSelection(new Set());
      return openWriting({ value: "", under, style: { ...textStyle } });
    }
    if (command.startsWith("caption.")) {
      const [, what, ...rest] = command.split("."), arg = rest.join(".");
      // The label being typed: Bold, Italic, Underline and Plain on its characters (as a caption's), a font or size on
      // all of it (a label has one).
      // Subscript and Superscript on part of a label too (issue 44, ChemDraw's Fe with III raised).
      const toggles: Record<string, ((s: RunStyle, all: RunStyle) => RunStyle) | undefined> = {
        bold: (s, all) => ({ ...s, bold: all.bold ? undefined : true }), italic: (s, all) => ({ ...s, italic: all.italic ? undefined : true }),
        underline: (s, all) => ({ ...s, underline: all.underline ? undefined : true }), plain: (s) => ({ ...s, bold: undefined, italic: undefined, underline: undefined }),
        sub: (s, all) => ({ ...s, script: all.script === "sub" ? undefined : "sub" }), super: (s, all) => ({ ...s, script: all.script === "super" ? undefined : "super" }),
      };
      if (editing && labelOpen.current) {
        if (toggles[what]) return styleLabel(toggles[what]!);
        if (what === "font") return setEditing({ ...editing, font: arg });
        if (what === "size" && Number(arg) > 0) return setEditing({ ...editing, size: Number(arg) });
        return;
      }
      // On selected atoms, the Text menu and the label style buttons style their labels, as in ChemDraw. Subscript and
      // Superscript put all of each label in that script.
      const labelled = !writing && !picked.size ? [...selection].filter((i) => drawing.label[i]) : [];
      if (labelled.length && (what === "sub" || what === "super")) return set(scriptLabels(doc, labelled, what, style.hideH), true);
      if (labelled.length && ["bold", "italic", "underline", "plain", "font", "size", "align"].includes(what)) {
        const first = doc.atoms[labelled[0]], ids = new Set(labelled);
        const change: Partial<Atom> = what === "plain" ? { bold: undefined, italic: undefined, underline: undefined }
          : what === "align" ? { align: arg === "auto" ? undefined : (arg as Atom["align"]) }
          : what === "font" ? { font: arg === style.labelFont ? undefined : arg }
          : { [what]: first[what as "bold" | "italic" | "underline"] ? undefined : true };
        // A size is the size drawn: the label's own size is it over the atom's scale. A style set on the whole label
        // comes off the characters that had it of their own (its runs), as on a caption.
        const own = (a: Atom) => { const v = Math.round((Number(arg) / scaleOf(a)) * 100) / 100; return Math.abs(v - style.labelSize) < 0.01 ? undefined : v; };
        const runs = (a: Atom) => { if (!a.runs || what === "size" || what === "font" || what === "align") return {}; const r = without(a.runs, what === "plain" ? ["bold", "italic", "underline"] : [what]); return { runs: styled(r) ? r : undefined }; };
        return set({ ...doc, atoms: doc.atoms.map((a, k) => (ids.has(k) ? { ...a, ...(what === "size" ? { size: own(a) } : change), ...runs(a) } : a)) }, true);
      }
      // On picked tables and TLC plates, the same styles set their text (the cells, or the Rf values), as in ChemDraw.
      const texts = !writing && !selection.size ? (doc.shapes ?? []).filter((x) => picked.has(x.id) && (x.kind === "table" || x.kind === "tlc")) : [];
      if (texts.length && ["bold", "italic", "underline", "plain", "font", "size"].includes(what)) {
        const first = texts[0], ids = new Set(texts.map((x) => x.id));
        const change = (x: Shape): Partial<Shape> => what === "plain" ? { bold: undefined, italic: undefined, underline: undefined }
          : what === "font" ? { font: arg === style.captionFont ? undefined : arg }
          : what === "size" ? { size: Number(arg) === (x.kind === "tlc" ? style.captionSize * 0.8 : style.captionSize) ? undefined : Number(arg) }
          : { [what]: first[what as "bold" | "italic" | "underline"] ? undefined : true };
        return set({ ...doc, shapes: doc.shapes?.map((x) => (ids.has(x.id) ? { ...x, ...change(x) } : x)) }, true);
      }
      // Text styles: on the characters selected while typing (or the next ones typed), else on whole captions.
      const toggle = (key: "bold" | "italic" | "underline") => (s: RunStyle, all: RunStyle): RunStyle => ({ ...s, [key]: all[key] ? undefined : true });
      const script = (to: "sub" | "super") => (s: RunStyle, all: RunStyle): RunStyle => ({ ...s, script: all.script === to ? undefined : to });
      const patches: Record<string, ((s: RunStyle, all: RunStyle) => RunStyle) | undefined> = {
        bold: toggle("bold"), italic: toggle("italic"), underline: toggle("underline"), sub: script("sub"), super: script("super"),
        plain: (s) => ({ ...s, bold: undefined, italic: undefined, underline: undefined, script: undefined }),
        font: (s) => ({ ...s, font: arg === style.captionFont ? undefined : arg }),
      };
      if (what === "formula") return formulaText();
      if (patches[what] && (writing || what === "sub" || what === "super" || what === "plain" || what === "font")) return styleText(patches[what]!, what);
      if (what === "bold") return restyle((c) => ({ bold: !c.bold }));
      if (what === "italic") return restyle((c) => ({ italic: !c.italic }));
      if (what === "underline") return restyle((c) => ({ underline: !c.underline }));
      if (what === "size" && writing && richApi.current?.range()?.[0] !== richApi.current?.range()?.[1]) return styleText((s) => ({ ...s, size: Number(arg) }), what);
      if (what === "size") return restyle(() => ({ size: Number(arg) === style.captionSize ? undefined : Number(arg) }));
      if (what === "align" && arg !== "above" && arg !== "auto") return restyle(() => ({ align: arg as Caption["align"] }));
      // Colour, as ChemDraw's Color menu: while typing, on the characters selected (or the next ones typed), as the
      // other text styles; a run in the caption's own colour has none of its own. Else on whole captions.
      if (what === "colour" && writing) {
        const own = ("colour" in writing.style ? writing.style.colour : doc.captions?.find((c) => c.id === writing.id)?.colour) ?? style.colour;
        return styleText((s) => ({ ...s, colour: arg.toLowerCase() === own.toLowerCase() ? undefined : arg }), what);
      }
      if (what === "colour") return restyle(() => ({ colour: arg.toLowerCase() === style.colour.toLowerCase() ? undefined : arg }));
      const id = [...picked][0];
      if (what === "edit" && id !== undefined) return startWriting({ id });
      if (what === "detach" || what === "attach") {
        // Detach leaves the caption where it is, as free text. Attach centres it under the structure above it.
        const moves = new Map(placed.filter((c) => picked.has(c.id)).map((c) => [c.id, anchorOf(c)]));
        return set({
          ...doc,
          captions: doc.captions?.map((c) => {
            const at = moves.get(c.id);
            if (!at) return c;
            if (what === "detach") { const { under: _, ...free } = c; return { ...free, x: at[0], y: at[1] }; }
            const under = structureAbove(at, 4);
            return under ? { ...c, under, align: undefined } : c;
          }),
        }, true);
      }
    }
    if (command.startsWith("rotate.")) return run(command);
    if (command === "pairs") return set(toggleLonePairs(doc, [...selection], settings.pairBars), true);
    if (context.kind === "atom") {
      const i = ids[0], [kind, arg] = command.split(".");
      if (kind === "element") return set(setElement(doc, i, arg), true);
      if (command.startsWith("label:")) return set(setLabel(doc, i, command.slice(6)), true);
      if (kind === "group") return set(addGroup(doc, i, arg as Group));
      if (command === "atom.label") return editLabel(i);
      // ChemDraw's Repeat Last Label: the last label typed, on this atom.
      if (command === "repeat_label" && lastLabel.current) return set(setLabel(doc, i, lastLabel.current), true);
      if (command === "charge.plus" || command === "charge.minus") return set(addCharge(doc, i, command === "charge.plus" ? 1 : -1), true);
    }
    if (context.kind === "bond") {
      const bi = doc.bonds.findIndex((b) => selection.has(b.atoms[0]) && selection.has(b.atoms[1])), arg = command.split(".")[1];
      // A style chip does what its key does (keyBond): Wedge on a wedge turns it round.
      if (arg in BONDS) return set(keyBond(doc, bi, BONDS[arg as BondKind].spec), true);
      const ring = arg.startsWith("ring") ? RINGS[arg.slice(4) as RingKind] : arg === "benzene" ? RINGS.benzene : undefined;
      if (ring) return set(addRing(doc, ring.n, ring.aromatic, { bond: bi }));
      if (arg === "left" || arg === "centre" || arg === "right" || arg === "auto") return set(setPosition(doc, bi, arg === "auto" ? undefined : arg), true);
      if (arg === "flip") return set(flipBond(doc, bi), true);
      if (arg === "properties") return bondProperties(bi);
    }
  }

  // Where bond k's second line is drawn now (render's sides), from the part of the drawing it is in.
  const drawnSide = (k: number) => {
    const part = drawing.parts.find((x) => x.ids.includes(doc.bonds[k].atoms[0]));
    if (!part) return 0;
    const ids = new Set(part.ids);
    let n = 0;
    for (let j = 0; j < k; j++) if (ids.has(doc.bonds[j].atoms[0])) n++;
    return part.drawing.sides?.[n] ?? 0;
  };
  // The length the Add Chain box offers and Option-click repeats: the last one added or dragged (ChemDraw starts at 5).
  const chainLength = useRef(5);
  const addChainOf = (from: number | P, n: number) => {
    const atoms = Math.max(2, Math.min(999, Math.round(n)));
    chainLength.current = atoms;
    set(addChain(doc, from, atoms).mol);
  };
  // A click opens Add Chain (Attach on an atom). Option-click adds the last length at once; on an atom it opens the
  // atom's label instead, as ChemDraw's drawing tools do.
  function chainClick(from: number | P, alt: boolean) {
    if (alt && typeof from === "number") return editLabel(from);
    if (alt) return addChainOf(from, chainLength.current);
    setDialog({ kind: "chain", from, atoms: String(chainLength.current) });
  }
  // Select's double-click on an atom or bond: its whole structure. In a group (not an integral one) that is the part
  // the double-click picks, to move within the group (Sam, 28 October 2026); a click picks the whole group.
  function pickWhole(t: Hover) {
    const g = outermost(groupsOf(doc, new Set(atomsOf(doc, t)), new Set(itemsOf(t)))), one = atomsOf(doc, t)[0];
    if (g?.integral) { setPicked(new Set(g.items)); return setSelection(new Set(g.atoms)); }
    setPicked(new Set());
    setSelection(new Set(fragments(doc).find((x) => x.includes(one)) ?? [one]));
  }
  // What a click does with each tool in hand. alt, more: Option, and Command and Shift, were held.
  function click(t: Hover, at: P, alt = false, more: { meta?: boolean; shift?: boolean } = {}) {
    // Select: Shift-click adds what was clicked to the selection, or takes it out if it was all selected already;
    // Option-click takes it out. Either way from the selection as it was before the press.
    const mods = pressMods.current;
    pressMods.current = undefined;
    // Sequence: the name field opens with the codes' prefix, and the structure lands where the click was,
    // also over a structure.
    if (tool === "sequence") return insertSequence(SEQUENCES[sequenceChoice].prefix);
    // An integral group goes in or out whole, and a cycle with all its parts (as a click picks them).
    if (tool === "select" && mods && (mods.shift || mods.alt)) {
      const cycle = doc.cycles?.find((c) => c.id === t.cycle), [own, text] = cycle ? cycleParts(cycle) : [[], []];
      const [ids, items] = wholeIntegral(doc, new Set([...atomsOf(doc, t), ...own]), new Set([...itemsOf(t), ...text]));
      const all = [...ids].every((i) => mods.atoms.has(i)) && [...items].every((x) => mods.picks.has(x)), out = mods.alt || all;
      const atoms = new Set(mods.atoms), picks = new Set(mods.picks);
      for (const i of ids) if (out) atoms.delete(i); else atoms.add(i);
      for (const x of items) if (out) picks.delete(x); else picks.add(x);
      setSelection(atoms);
      setPicked(picks);
      return;
    }
    // Edit curve: a click on the curve it had picked adds a point there; a click away from it, a point at its end.
    if (editCurve) {
      const c = doc.arrows?.find((a) => a.id === editPress.current && a.curve);
      if (!c?.curve) return;
      const near = nearestOnCurve(c.curve, at), on = near.d * L * views.get().zoom < 8;
      if (t.arrow === c.id && on) return set(updateArrow(doc, c.id, withCurve(splitCurve(c.curve, near.seg, near.t))), true);
      if (t.arrow === undefined) return set(updateArrow(doc, c.id, withCurve(appendCurvePoint(c.curve, at))), true);
      return;
    }
    // Select: a click on part of a wider selection keeps that part alone (a whole integral group; a cycle keeps the
    // intermediates its press picked).
    if (tool === "select") {
      const gc = Object.values(t).every((v) => v === undefined) ? gridCellAt(at) : undefined;
      if (gc) { choose([], []); return setGridPick({ arrow: gc.arrow, key: gc.key, row: gc.row }); }
      setGridPick(undefined);
      // A second click on a picked cycle's arc picks that step on its own.
      if (t.cycle !== undefined) {
        if (stepAgain.current === undefined) return;
        setSelection(new Set());
        setPicked(new Set([t.cycle]));
        return setStepPick({ cycle: t.cycle, step: stepAgain.current });
      }
      const on = t.atom !== undefined ? `atom ${t.atom}` : t.bond !== undefined ? `bond ${t.bond}` : undefined, was = lastPick.current, now = performance.now();
      lastPick.current = on === undefined ? undefined : { on, time: now };
      if (on !== undefined && was?.on === on && now - was.time < DOUBLE_MS) { lastPick.current = undefined; return pickWhole(t); }
      if (groupsOf(doc, new Set(atomsOf(doc, t)), new Set(itemsOf(t))).length) return; // the press picked the group, or the part picked before
      return choose(atomsOf(doc, t), itemsOf(t));
    }
    // Side arrow: a click on a structure or free text beside a step makes it that step's reagent or product
    // (attachBeside). One that is already a cycle's, or not beside a step, was only picked.
    if (tool === "cycle" && cycleChoice === "side" && (t.atom !== undefined || t.bond !== undefined || t.caption !== undefined)) {
      const atom = t.atom ?? (t.bond !== undefined ? doc.bonds[t.bond].atoms[0] : undefined), atoms = atom !== undefined ? fragments(doc).find((g) => g.includes(atom)) : undefined;
      const free = atoms ? !doc.cycles?.some((c) => cycleAtoms(c).some((i) => atoms.includes(i))) : doc.captions?.some((x) => x.id === t.caption && !x.cycle && !x.under && !x.on);
      const m = free ? attachBeside(doc, atoms ? { atoms } : { text: t.caption }, { box: dropBox, bond: style.bond }) : doc;
      return m !== doc ? void set(m) : undefined;
    }
    if ((t.caption !== undefined || t.cycle !== undefined) && tool !== "text") return; // a caption or cycle was picked, not drawn on
    if (tool === "table" && tableAt(at)) return openCell(tableAt(at)!, at);
    if (tool === "tlc" && plateAt(at)) return spotAt(plateAt(at)!, at, [0, 0], false, false);
    // An arrow clicked with the Arrow tool, as in ChemDraw: one like the tool's, unchanged but for its ends, turns
    // round; one like it but changed goes back to the tool's own; any other becomes the tool's kind.
    const clicked = tool === "arrow" && t.arrow !== undefined ? doc.arrows?.find((a) => a.id === t.arrow && (straightArrow(a) || curved(a)) && a.kind !== "arc") : undefined;
    if (clicked && !arrowPick.ellipse) {
      const fresh = newArrow(clicked.from, clicked.to, Math.sign(clicked.bend ?? 1) || 1), same = clicked.kind === fresh.kind;
      const keys = ["bend", "style", "start", "end", "head", "headSize", "ratio", "shaft", "fill", "point"] as const, changed = keys.some((k) => JSON.stringify(clicked[k]) !== JSON.stringify(fresh[k]));
      if (same && !changed) return set(updateArrow(doc, clicked.id, { from: clicked.to, to: clicked.from, ...(clicked.bend ? { bend: -clicked.bend } : {}) }), true);
      return set(updateArrow(doc, clicked.id, { kind: fresh.kind, ...Object.fromEntries(keys.map((k) => [k, fresh[k]])) }), true);
    }
    // As in ChemDraw: Option-click on an atom with the bond or template tool opens its label, and so does a
    // double-click with the bond tool (its first click's bond is taken back). The Text tool's Option-click puts the
    // last label typed on the atom at once.
    const before = lastClick.current;
    lastClick.current = undefined;
    if (t.atom !== undefined && alt && (tool === "bond" || tool === "template")) return editLabel(t.atom);
    if (t.atom !== undefined && tool === "text" && alt && lastLabel.current) return set(setLabel(doc, t.atom, lastLabel.current));
    if (t.atom !== undefined && tool === "bond" && before && before.atom === t.atom && before.after === doc && performance.now() - before.time < DOUBLE_MS) {
      undo();
      return editLabel(t.atom);
    }
    if (tool === "bond") {
      // The hydrogen bond tool only joins two atoms (a drag from an H atom to an acceptor), as in ChemDraw.
      if (bondKind === "hydrogen") return;
      // On an atom (anywhere on its label), a bond the way that keeps it out from under a label such as CO2Me. An
      // element's label (OH, NH2) moves its H out of the way, so there the zig-zag goes on.
      if (t.atom !== undefined) {
        const box = doc.atoms[t.atom].text ? drawing.label[t.atom] : undefined, off = box ? (box[0] + box[2]) / 2 / L - pos(doc, t.atom)[0] : 0;
        const after = sprout(doc, t.atom, bondSpec, Math.abs(off) > 0.15 ? Math.sign(off) : 0);
        lastClick.current = { atom: t.atom, time: performance.now(), after };
        return set(after);
      }
      if (t.bond === undefined) return set(sprout(doc, at, bondSpec));
      // On a bond, as ChemDraw: see clickBond (a single bond becomes double, a double bond's second line moves round,
      // or with Settings > Drawing > Clicks make triple bonds, becomes triple).
      return set(clickBond(doc, t.bond, bondSpec, at, drawnSide(t.bond), settings.clickTriple));
    }
    if (tool === "chain") return chainClick(t.atom ?? at, false);
    // Option-click with the lone pair draws the atom's lone pairs as bars (or as dots again), as in ChemDraw.
    if (tool === "symbol") return t.atom !== undefined ? set(addSymbol(doc, t.atom, symbolKind, pressAlt.current, settings.pairBars)) : undefined;
    if (tool === "bracket" && "mark" in bracketPick) {
      // A dagger goes on a bracket clicked (again takes it off), or stands alone where clicked.
      const sh = t.arrow !== undefined ? doc.shapes?.find((x) => x.id === t.arrow && isBracket(x)) : undefined;
      if (sh) return set(updateShape(doc, sh.id, { mark: sh.mark === bracketPick.mark ? undefined : bracketPick.mark }));
      return set(addCaption(doc, { text: bracketPick.mark, x: at[0], y: at[1], align: "left" })[0]);
    }
    if (tool === "shape" || tool === "bracket") {
      // A click puts the shape round the structure or caption clicked (Add Frame puts one round a selection).
      const one = t.atom ?? (t.bond !== undefined ? doc.bonds[t.bond].atoms[0] : undefined);
      const atoms = one !== undefined ? fragments(doc).find((g) => g.includes(one)) ?? [] : [];
      const boxes = [...(atoms.length ? [withCaptions(atoms)].filter((b): b is Box => !!b) : []), ...placed.filter((c) => c.id === t.caption).map((c) => c.box)];
      const b = boxes.length ? union(boxes) : undefined;
      if (!b) return;
      const pad = (tool === "bracket" ? 0.3 : 0.4) * L, sh = shapeFrom([0, 0], [1, 1]);
      if (!sh) return;
      // A circle round something is the smallest circle round its box.
      const round = "circle" in shapePick && shapePick.circle && tool === "shape", cx = (b[0] + b[2]) / 2 / L, cy = -(b[1] + b[3]) / 2 / L, r = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 / L + pad / L;
      const [mol, id] = addShape(doc, { ...sh, ...(round ? { from: [cx - r, cy - r], to: [cx + r, cy + r] } : { from: [(b[0] - pad) / L, -(b[3] + pad) / L], to: [(b[2] + pad) / L, -(b[1] - pad) / L] }) });
      set(mol);
      setSelection(new Set());
      return setPicked(new Set([id]));
    }
    if (tool === "template") {
      const mol = templateMol(templateVariant);
      // The point goes too: a template with no bonds or no atoms (a lamp, a flask) goes where the click was.
      // Stamped beside a catalytic cycle, it joins it (⌘ keeps it free).
      return mol ? set(addTemplate(doc, mol, { ...(t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : {}), point: at }), false, undefined, !more.meta && "placed") : undefined;
    }
    if (tool === "ring") {
      const custom = templates.find((x) => templateKind(x.id) === ringKind)?.mol ?? libraryItem(ringKind)?.mol ?? namedOf(ringKind);
      // A ring stamped beside a catalytic cycle joins it. ⌘ keeps a chair or a library ring free, as with a template; on
      // a plain ring ⌘ draws it delocalised, so that one joins (only near an arc, never in the middle of the cycle).
      if (custom) return set(addTemplate(doc, custom, { ...(t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : {}), point: at }), false, undefined, !more.meta && "placed");
      const r: { n: number; aromatic: boolean; chair?: 1 | 2 } = RINGS[ringKind as RingKind];
      if (r.chair) return set(addChair(doc, r.chair, t.bond !== undefined ? { bond: t.bond } : { point: at }), false, undefined, !more.meta && "placed");
      // As in ChemDraw: a click on an atom makes a spiro ring, and Option-click sprouts the ring on a new bond (the
      // other way round with Sprout rings on a click in Settings). Command draws the ring delocalised, with a circle;
      // Shift makes its first bond single.
      const sproutIt = t.atom !== undefined && alt !== settings.sproutRings;
      return set(addRing(doc, r.n, r.aromatic || !!more.meta, t.bond !== undefined ? { bond: t.bond } : t.atom !== undefined ? { atom: t.atom } : { point: at }, { sprout: sproutIt, firstSingle: more.shift, circle: more.meta }), false, undefined, "placed");
    }
    if (tool === "text") {
      // Option-click repeats the last label typed, as in ChemDraw.
      if (t.atom !== undefined) return pressAlt.current && lastLabel.current ? set(setLabel(doc, t.atom, lastLabel.current)) : editLabel(t.atom);
      return startWriting(t.caption !== undefined ? { id: t.caption } : { at });
    }
  }

  // An option dragged from the toolbar and let go on the canvas is the tool in hand now (Palette), and goes in there as
  // a click with it would put it. Once the new tool is in hand, Octet presses there and lets go a frame later, so the
  // drop takes the same way as a click with every tool.
  const [dropAt, setDropAt] = useState<[number, number]>();
  // A drop always puts it in, so a selection is cleared first and the press waits for that: a press away from a
  // selection would only clear it.
  useEffect(() => {
    if (!dropAt) return;
    if (selection.size || picked.size) { setSelection(new Set()); setPicked(new Set()); return; }
    setDropAt(undefined);
    const [clientX, clientY] = dropAt, press = (type: string) => svg.current?.dispatchEvent(new PointerEvent(type, { clientX, clientY, bubbles: true, isPrimary: true, pointerType: "mouse", buttons: type === "pointerdown" ? 1 : 0 }));
    press("pointerdown");
    requestAnimationFrame(() => press("pointerup"));
  }, [dropAt, selection, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerUp() {
    if (panFrom.current) { panFrom.current = undefined; return setPanning(false); }
    const joined = joinNext.current;
    release();
    joinNext.current = undefined;
    // A caption made an atom by this press is not a double-click's first click: Undo would take the atom away again.
    if (joined) lastClick.current = undefined;
  }
  function release() {
    stopHold();
    if (spring) { setTool(spring); setSpring(undefined); }
    const over = dropOver.current;
    markDrop(undefined);
    if (!drag) return;
    setDrag(undefined);
    // A selection let go on a template set (or the Ring or Template tool) goes into it and stays where it was. Copies an
    // Option-drag made are not kept.
    if (drag.kind === "move" && drag.moved && over?.dataset.dropSet) {
      const part = extractSelection(drag.base ?? doc, drag.atoms ?? selection, picked, drawnAt, drawnAlign);
      if (drag.base && drag.base !== doc) { setSelection(new Set()); setPicked(new Set()); }
      return addPart(part, over.dataset.dropSet, over.dataset.dropTool === "template" ? "template" : "ring");
    }
    switch (drag.kind) {
      case "crosshair":
        return setGuides((g) => ({ ...g, crosshair: drag.at }));
      case "bond": {
        const { to, from, target: t, at } = drag;
        // ChemDraw's hydrogen bond tool says so when the two atoms already have a bond.
        if (to && bondKind === "hydrogen" && typeof from === "number" && neighbours(doc, from).includes(atomAt(doc, to)!)) return setNotice("These atoms already have a bond.");
        // A bond that ends on a caption that counts as chemistry makes the caption an atom, in the same undo step.
        const c = to && drag.onto !== undefined ? doc.captions?.find((x) => x.id === drag.onto) : undefined, key = c && (joinNext.current ?? `element ${++elementSteps}`);
        const made = c && key && makeElements([c], key, false);
        if (to && made) return set(dragBond(made, from, to, bondSpec), false, key);
        if (to) return set(dragBond(doc, from, to, bondSpec));
        return click(t, at, drag.alt);
      }
      case "arrow": {
        // Synthesis and Retrosynthesis (ChemDraw's): the line cut the bonds it crossed, and the reaction is drawn
        // (cutReaction). With Option held, the line stays, dashed, on the whole structure.
        if (tool === "synthesis" || tool === "retro") {
          const r = drag.to && cutReaction(doc, drag.from, drag.to, tool === "retro");
          if (!r) return setNotice("Drag the line across one or more bonds.", "info");
          if (!r.cut) return setNotice("Octet does not cut bonds in aromatic rings.");
          let m = r.mol;
          if (pressAlt.current) [m] = addArrow(m, { kind: "line", style: "dashed", from: [drag.from[0] + r.moved[0], drag.from[1] + r.moved[1]], to: [drag.to![0] + r.moved[0], drag.to![1] + r.moved[1]] });
          setNotice(r.aromatic ? `${r.aromatic === 1 ? "One bond" : `${r.aromatic} bonds`} in aromatic rings stayed whole.` : undefined, "info");
          return set(m);
        }
        // Mass spec analysis (ChemDraw's): the line stays as a fragmentation line, and the Mass spec panel opens on the
        // structure it crosses. A click on a structure opens the panel on it.
        if (tool === "massspec") return massSpecLine(drag);
        if (drag.make?.kind === "cut") {
          if (!drag.to) return;
          const { mol, items } = massCut(drag, !!drag.alt);
          if (mol !== doc) { set(mol); setPicked(new Set(items)); }
          return;
        }
        // A click makes an arrow of the usual length (three bonds; a short arc for a curved one), going right.
        const to: P = drag.to ?? (drag.make?.kind === "orbital" ? orbitalTip(drag.make, drag.from, drag.target) : !drag.make && arrowPick.ellipse ? [drag.from[0] + (arrowPick.ellipse === "cw" ? 0.6 : -0.6), drag.from[1] + 1.2]
          : curved({ kind: drag.make?.kind ?? arrowKind }) ? [drag.from[0] + 1.5, drag.from[1]] : [drag.from[0] + 3, drag.from[1]]);
        if (Math.hypot(to[0] - drag.from[0], to[1] - drag.from[1]) < 0.2) return;
        const [mol, id] = addArrow(doc, newArrow(drag.from, to, drag.side, drag.make));
        set(mol);
        return setPicked(new Set([id]));
      }
      case "cycle":
        if (drag.radius) return set(drag.radius, true);
        return drag.pull ? releasePull(drag.pull.cycle, drag.pull.step, drag.pull.made) : releaseCycle(drag.from, drag.to, drag.start);
      case "shape": {
        // Too small to be a shape is a click. A circle needs only a radius; anything else both a width and a height.
        const round = tool === "shape" && "circle" in shapePick && shapePick.circle;
        const tiny = !drag.to || (round ? Math.hypot(drag.to[0] - drag.from[0], drag.to[1] - drag.from[1]) < 0.1 : Math.abs(drag.to[0] - drag.from[0]) < 0.1 || Math.abs(drag.to[1] - drag.from[1]) < 0.1);
        // A click with the Table tool makes a table of four columns and six rows there.
        const to = tiny && tool === "table" ? [drag.from[0] + 8.8, drag.from[1] - 5.4] as P : drag.to;
        if ((tiny && tool !== "table") || !to) return click(drag.target, drag.from);
        const sh = shapeFrom(drag.from, to);
        if (!sh) return;
        const [mol, id] = addShape(doc, sh);
        set(mol);
        setPicked(new Set([id]));
        // A new table opens its second header cell for typing (the first says Entry).
        if (sh.kind === "table") { cellOpen.current = true; setCell({ id, r: 0, c: 1, value: "" }); }
        return;
      }
      case "handle":
        // A click on a step's handle does nothing.
        if (drag.step !== undefined && drag.working === doc) return;
        // A click on a side arrow or its handle picks the side arrow.
        if (drag.branch !== undefined && drag.working === doc) { setSelection(new Set()); setPicked(new Set([drag.id])); setStepPick(undefined); return setBranchPick({ cycle: drag.id, branch: drag.branch }); }
        return set(drag.working, true);
      case "tilt":
        return set(drag.working, true);
      case "spot":
        if (drag.moved) return set(drag.working, true);
        return setSpotPick({ plate: drag.plate, index: drag.index });
      case "lane":
        setLanePick({ plate: drag.plate, lane: drag.to });
        return drag.working !== drag.base ? set(drag.working, true) : undefined;
      case "mark":
        // A click on a mark with Select picks its atom, as a click beside it does (Shift or Option adds it or takes
        // it out, as a click on the atom does).
        if (drag.working === drag.base && tool === "select") {
          if (pressMods.current?.shift || pressMods.current?.alt) return click({ atom: drag.atom }, pos(doc, drag.atom));
          const [atoms, picks] = withGroups(new Set([drag.atom]), new Set());
          setSelection(atoms);
          setPicked(picks);
        }
        pressMods.current = undefined;
        return drag.working !== drag.base ? set(drag.working, true) : undefined;
      case "tlcline":
      case "tableedge":
        return drag.working !== drag.base ? set(drag.working, true) : undefined;
      case "pen":
        setPenAt(drag.at);
        return setPen([...(pen ?? []), penPoint(drag.at, drag.out)]);
      case "map": {
        // Dropped on another atom: the two are mapped to each other. A click on a mapped atom takes its number off.
        const to = drag.to ? hitAt(drag.to).atom : drag.atom;
        if (to === drag.atom) return doc.atoms[drag.atom].map ? set(clearMap(doc, drag.atom), true) : undefined;
        if (to === undefined) return;
        // Settings > Drawing > Map the rest of a reaction (ChemDraw's Automatic Reaction Mapping, on by default): the
        // rest of the pair's reaction is mapped too, keeping the pairs mapped by hand.
        const paired = pairMap(doc, drag.atom, to), hit = settings.autoMap ? reactions().find(({ r }) => r.atoms.includes(drag.atom) && r.atoms.includes(to)) : undefined;
        if (!hit) return set(paired, true);
        const structures = (list: Part[]) => list.flatMap((x) => (x.kind === "structure" ? [x.atoms] : []));
        const steps = hit.steps.map((x) => ({ reactants: structures(x.reactants), products: structures(x.products) }));
        return set(mapScheme(paired, steps, (rs, ps) => mapReaction(rs, ps, true), (atoms) => pickAtoms(paired, atoms)) ?? paired, true);
      }
      case "turn":
        if (!drag.degrees) return;
        lastRepeat.current = { rotate: drag.degrees }; // Edit > Repeat turns the next selection as far
        return turnTo(drag.working, drag.centre);
      case "pivot":
        return drag.moved ? undefined : click(drag.target, drag.at);
      case "resize":
        // A page spectrum built at its new frame stays picked whole, its new parts too.
        if (drag.plot !== undefined) {
          if (drag.working === doc) return;
          const g = set(drag.working, true).groups?.find((x) => x.id === drag.plot);
          if (g) setPicked(new Set(g.items));
          return;
        }
        return drag.size[0] !== 1 || drag.size[1] !== 1 ? commitScale(drag.size, drag.anchor, drag.lines, drag.working) : undefined;
      case "chain":
        if (drag.to) { chainLength.current = chainCount(drag); return set(chainThrough(doc, drag.from, chainPath(drag)).mol); }
        return chainClick(drag.from, !!drag.alt);
      case "click":
        return click(drag.target, drag.at, drag.alt);
      case "ring":
        return drag.to ? set(ringDrop(drag), false, undefined, !chairFree(drag) && "placed") : click(drag.target, drag.at, drag.alt, { meta: drag.meta, shift: drag.shift });
      case "erase": {
        // A click removes the atom, bond or object under the pointer; a rub removes everything it marked.
        const t = drag.target;
        if (drag.moved) return set(deleteChosen(doc, drag.atoms, drag.captions, drag.bonds, drawnAt, drawnAlign));
        return removeAt(t);
      }
      case "box":
      case "lasso":
        saw("select");
        // A hold that never moved selects what it was held on; on a stoichiometry grid's cell, picks the cell.
        if (!drag.moved) {
          const gc = drag.kind === "box" && !drag.base.size && Object.values(drag.target).every((v) => v === undefined) ? gridCellAt(drag.from) : undefined;
          choose([...drag.base, ...atomsOf(doc, drag.target)], [...drag.picks, ...[drag.target.caption ?? drag.target.arrow].filter((x): x is number => x !== undefined)]);
          setGridPick(gc && { arrow: gc.arrow, key: gc.key, row: gc.row });
        }
        return;
      case "move": {
        if (!drag.moved && addPoint.current !== undefined) return set(updateArrow(doc, addPoint.current, { point: true }), true);
        if (!drag.moved) return click(drag.target, drag.from);
        saw("move");
        // An atom dropped exactly on another joins it. Joining renumbers atoms, so the selection clears then.
        const { mol, joined } = joinOverlaps(drag.working, drag.atoms ?? selection);
        return set(mol, !joined, undefined, !drag.skip);
      }
    }
  }

  // The web view's own menu (Reload, Inspect) never shows: a right-click on the canvas opens the Actions menu, and text
  // fields keep the system's menu for cut, copy and paste.
  useEffect(() => {
    const block = (e: MouseEvent) => { if (!(e.target as Element).closest?.("input, textarea, [contenteditable]")) e.preventDefault(); };
    addEventListener("contextmenu", block);
    return () => removeEventListener("contextmenu", block);
  }, []);
  // Trackpad and mouse wheel: scroll pans (Shift scrolls across), pinch (or ⌘/Ctrl + scroll) zooms around the pointer. While a zoom goes on (until 150 ms
  // after its last step), the drawing's text is laid out at its own size and scaled with the drawing (pinch, in
  // editor.css), so a zoom step does not lay out all the text again. When the zoom stops, the text is laid out for
  // the screen again and looks as it did before.
  useEffect(() => {
    const el = svg.current!;
    let stop: number | undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopCamera();
      const zooming = e.ctrlKey || e.metaKey;
      // Deltas in lines or pages (Firefox, some Linux mice) as pixels. A mouse wheel's notch is 100 px on Windows: each
      // zoom step is at most 1.25 times, as Magnify's, so Ctrl and the wheel zoom in steps (a pinch's steps are smaller).
      // Shift and a mouse wheel scroll across: the Mac turns the wheel's delta itself; Windows and Linux may not.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? frameHeight() : 1, across = e.shiftKey && !zooming && !e.deltaX;
      const dx = (across ? e.deltaY : e.deltaX) * unit, dy = across ? 0 : e.deltaY * unit;
      setView((v) => {
        if (!zooming) return { ...v, x: v.x - dx, y: v.y - dy };
        const zoom = clampZoom(v.zoom * Math.exp(-Math.max(-Math.log(1.25), Math.min(Math.log(1.25), dy * 0.01)))), k = zoom / v.zoom;
        return { zoom, x: e.clientX - (e.clientX - v.x) * k, y: e.clientY - (e.clientY - v.y) * k, pinch: true };
      });
      if (!zooming) return;
      clearTimeout(stop);
      stop = window.setTimeout(() => setView((v) => (v.pinch ? { ...v, pinch: undefined } : v)), 150);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { clearTimeout(stop); el.removeEventListener("wheel", onWheel); };
  }, []);

  // Whether the focus came from the keyboard (Tab) or from a click. A click anywhere gives the keys back to the drawing.
  // Keys in a dialog do not count: a dialog gives the focus back to the control that opened it, and that focus is the
  // keyboard's only if the control had it from the keyboard.
  const keyFocus = useRef(false);
  useEffect(() => {
    let clicked = false;
    const click = () => { clicked = true; keyFocus.current = false; }, key = () => { if (!modal()) clicked = false; }, focus = () => { keyFocus.current = !clicked; };
    addEventListener("pointerdown", click, true);
    addEventListener("keydown", key, true);
    addEventListener("focusin", focus, true);
    return () => { removeEventListener("pointerdown", click, true); removeEventListener("keydown", key, true); removeEventListener("focusin", focus, true); };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // On Windows and Linux a key pressed in the page can stay in the web view and never reach the native menu, so
      // the page runs the menu's Ctrl shortcuts itself. On the Mac it runs those with Shift and a symbol key (⇧⌘-,
      // ⇧⌘=): a Mac menu can miss them, as Shift changes the character the key types. When the menu takes the key the
      // page never sees it, and when both run it, pageRan runs it once. In a text box, Undo, Redo and Select All stay
      // the box's own.
      const shiftedSymbol = (k: string) => /(^|\+)shift\+[^a-z0-9]$/.test(k);
      if (TAURI && !e.defaultPrevented && (e.ctrlKey || e.metaKey) && (!MAC || shiftedSymbol(keyOf(e) ?? ""))) {
        const k = keyOf(e), id = k && native(k) ? actionFor(keymap(settings.keys), k, "none") : undefined;
        if (id?.startsWith("menu.")) {
          const cmd = id.slice(5), over = { home, modal: modal(), typing: typing() };
          // In a text box these are the box's own. A menu command that follows from the same key does not run again.
          if (over.typing && ["undo", "redo", "select_all", "cut", "copy", "paste"].includes(cmd)) { pageRan.current = { id: cmd, at: performance.now() }; return; }
          if (!menuRuns(cmd, over)) return;
          e.preventDefault();
          pageRan.current = { id: cmd, at: performance.now() };
          return commands.current[cmd]?.();
        }
      }
      if (typing() || e.defaultPrevented) return; // typing in a label or caption box, or a box already used the key
      if (home || modal()) return; // Home and dialogs have their own keys
      // Mass spec analysis (ChemDraw's): a key pressed while a line is dragged puts a corner in it where the pointer is.
      if (drag?.kind === "arrow" && tool === "massspec" && drag.to && e.key !== "Escape") {
        e.preventDefault();
        if (!e.repeat) setDrag({ ...drag, corners: [...(drag.corners ?? []), drag.to] });
        return;
      }
      // Tab with an atom or bond of the analysed structure under the pointer goes to the next fragment it is in, and
      // Shift+Tab back (ChemDraw's).
      if (e.key === "Tab" && tool === "massspec" && msAtoms && !e.altKey) {
        const h = hovers.get(), atoms = h.atom !== undefined ? [h.atom] : h.bond !== undefined ? doc.bonds[h.bond]?.atoms : undefined;
        if (atoms?.every((i) => msAtoms.includes(i))) {
          e.preventDefault();
          const again = msTab && msTab.atom === h.atom && msTab.bond === h.bond;
          return setMsTab({ atom: h.atom, bond: h.bond, atoms: [...atoms], n: again ? msTab.n + (e.shiftKey ? -1 : 1) : 0 });
        }
      }
      // Escape stops a pick for a template set, and the library shows again.
      if (templatePick && e.key === "Escape") { e.preventDefault(); return stopPick(); }
      if (controlTakes(e.key, document.activeElement as HTMLElement | null, keyFocus.current)) return;
      const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
      // Drawing with the Pen: Return or Escape ends the curve; Delete takes back the last point.
      if (pen && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); return finishPen(); }
      if (pen && (e.key === "Backspace" || e.key === "Delete")) { e.preventDefault(); return setPen(pen.length > 1 ? pen.slice(0, -1) : undefined); }
      // Redo is ⌘Y (ChemDraw's) in the menu, and Repeat when there is nothing to redo; ⇧⌘Z, the Mac's own, works too.
      if (!TAURI && mod && key === "z") { e.preventDefault(); return undo(e.shiftKey); }
      if (mod && key === "y") { e.preventDefault(); return commands.current.redo(); }
      if (TAURI && mod && e.shiftKey && key === "z") { e.preventDefault(); return undo(true); }
      if (!TAURI && mod && key === "a" && !e.shiftKey) { e.preventDefault(); return commands.current.select_all(); }
      if (!TAURI && mod && key === "a" && e.shiftKey) { e.preventDefault(); return commands.current.command_palette(); }
      if (!TAURI && mod && key === "n" && e.shiftKey) { e.preventDefault(); return commands.current.name_to_structure(); }
      // A menu command on a key without Command or Ctrl (set in Settings): the page runs it (the menu cannot take
      // such a key without taking it from text boxes too). Command and Ctrl keys are the menu's own in the app.
      const pressedKey = keyOf(e), bound = pressedKey && actionFor(keymap(settings.keys), pressedKey, "none");
      if (bound?.startsWith("menu.") && (!TAURI || !native(pressedKey!))) { e.preventDefault(); return commands.current[bound.slice(5)]?.(); }
      if (bound?.startsWith("action.")) { e.preventDefault(); return runAction(bound.slice(7)); }
      // The Menu key and Shift+F10 open the Actions menu at the selection (or the middle of the window).
      if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
        e.preventDefault();
        const view = views.get(), c = selection.size || picked.size ? selectionMiddle() : undefined;
        return setMenuAt(c ? { x: view.x + c[0] * L * view.zoom, y: view.y - c[1] * L * view.zoom, keyboard: true } : { x: frameWidth() / 2, y: frameMidY(), keyboard: true });
      }
      // ChemDraw's reaction shortcut (⌘ + an arrow key, Ctrl + an arrow key elsewhere).
      if (bound?.startsWith("reaction.")) { if (reactionShortcut(bound.slice(9) as "left" | "right" | "up" | "down")) e.preventDefault(); return; }
      if (mod) return;
      // Option keys run only what the shortcut table gives them: Option + arrows turn the selection (as ChemDraw's).
      // One that works anywhere goes on below (so it reaches a selection); one for an atom or bond runs here.
      if (e.altKey && !bound) {
        const t = keyTarget(), id = pressedKey && actionFor(keymap(settings.keys), pressedKey, t.atom !== undefined ? "atom" : t.bond !== undefined ? "bond" : "none");
        if (id) { e.preventDefault(); run(id); }
        return;
      }
      if (e.key === "Escape") {
        // Escape dismisses one thing at a time. With nothing left to dismiss it goes on to the window (which leaves
        // full screen).
        if (!drag && !spring && !selection.size && !picked.size && !gridPick && !hold.current && !hovers.get().key) return;
        e.preventDefault();
        if (hovers.get().key) setHover(pointer.current ? hit(pointer.current) : {});
        setGridPick(undefined);
        stopHold();
        setDrag(undefined);
        if (spring) { setTool(spring); setSpring(undefined); }
        setPicked(new Set());
        return setSelection(new Set());
      }
      // Enter with atoms selected (ChemDraw's): the selection becomes the keyboard hotspot, on the hotspot it had if
      // that is in a selected structure, else on the right-most heteroatom, else the right-most carbon.
      if (e.key === "Enter" && selection.size >= 2 && !picked.size && hovers.get().atom === undefined) {
        e.preventDefault();
        const ids = [...selection].filter((i) => i < doc.atoms.length), groups = fragments(doc).filter((g) => g.some((i) => selection.has(i)));
        const was = hotOf.current.get(doc)?.atom, right = (pick: (i: number) => boolean) => ids.filter(pick).sort((a, b) => pos(doc, b)[0] - pos(doc, a)[0] || pos(doc, a)[1] - pos(doc, b)[1])[0];
        const hot = was !== undefined && groups.some((g) => g.includes(was)) ? was : right((i) => !["C", "H"].includes(doc.atoms[i].label)) ?? right((i) => doc.atoms[i].label === "C");
        setSelection(new Set());
        if (hot !== undefined) keyHot({ atom: hot });
        return;
      }
      // Enter on a picked caption types into it, as Enter on an atom types its label. On a picked peak label (both its
      // lines), into the line under the pointer, else its top line.
      const lines = picked.size === 2 && !selection.size ? labelLines(doc, [...picked][0]) : [];
      if (e.key === "Enter" && (picked.size === 1 || (lines.length === 2 && lines.every((id) => picked.has(id)))) && !selection.size && hovers.get().atom === undefined) {
        e.preventDefault();
        const over = hovers.get().caption, top = () => doc.captions!.filter((c) => picked.has(c.id)).reduce((a, b) => (b.y > a.y ? b : a)).id;
        return startWriting({ id: picked.size === 1 ? [...picked][0] : over !== undefined && picked.has(over) ? over : top() });
      }
      // Tab takes the arrow Octet offers.
      if (e.key === "Tab" && offer) {
        e.preventDefault();
        const [m, id] = addArrow(doc, { kind: "reaction", from: offer.from, to: offer.to });
        setOffer(undefined);
        set(m, true);
        setSelection(new Set());
        return setPicked(new Set([id]));
      }
      // Otherwise Tab and Shift+Tab step through the objects on the canvas (stepAccess).
      if (e.key === "Tab" && !e.altKey && stepAccess(e.shiftKey)) { e.preventDefault(); return; }
      // Everything else goes through the shortcut table (keys.ts), so every key can be changed.
      const pressed = keyOf(e), many = pressed ? manyTarget() : undefined;
      if (pressed && many) {
        const id = manyAction(pressed, many);
        if (!id) return;
        e.preventDefault();
        if (!runMany(id, many)) run(id);
        return;
      }
      const target = keyTarget(), id = pressed && actionFor(keymap(settings.keys), pressed, target.atom !== undefined ? "atom" : target.bond !== undefined ? "bond" : "none");
      if (!id) return;
      e.preventDefault();
      run(id);
    };
    // A ChemDraw drawing as CDXML (hidden in its PDF on the Mac, ChemDraw JS's CDXML type, or text from Copy As CDXML)
    // or as CDX: all of it, arrows and text too, beside the drawing. False when it holds nothing Octet can draw.
    const CDXML_TEXT = /<CDXML[\s>/]/;
    const pasteCdxml = (cdxml: string) => pasteRead(() => { const read = fromCdxml(cdxml); return { mol: { ...read.mol, style: read.style }, lost: read.lost }; });
    // Its text keeps its proportion to the drawing's (fitSizes).
    const pasteRead = (read: () => { mol: Mol; lost: Record<string, number> }) => {
      try {
        const { mol: add, lost } = read();
        if (!add.atoms.length && !add.arrows?.length && !add.captions?.length && !add.shapes?.length) return false;
        const r = insertMol(doc, { ...(add.style ? fitSizes(add, add.style, style) : add), style: undefined }, add.atoms.length ? landing(add) : [0, 0]);
        set(r.mol, true);
        revealNext.current = true;
        setSelection(r.atoms);
        setPicked(r.items);
        sayLost(lost);
        return true;
      } catch {
        return false;
      }
    };
    // A picture from the clipboard (a screenshot, a picture copied from a browser), as ChemDraw pastes one when nothing
    // else on the clipboard pastes: centred in the window, selected, one step to undo.
    const pastePicture = async (bytes: Uint8Array) => {
      const m = await pictureDrawing(bytes, style.bond, MAX_PICTURE - pictureBytes(now.current), "Octet cannot paste this picture.");
      if (!m) return;
      const r = insertMol(now.current, m, toDoc(frameWidth() / 2, frameMidY()));
      set(r.mol, true);
      revealNext.current = true;
      setSelection(r.atoms);
      setPicked(r.items);
    };
    // The picture file the webview gives a paste, if any (a browser; the app reads the clipboard itself).
    const imageFile = (e: ClipboardEvent) => [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
    // Paste a SMILES string or MOL file: it goes to the right of the drawing, or in the middle of an empty canvas.
    const onPaste = (e: ClipboardEvent) => {
      if (typing() || home || modal()) return; // pasting into a label or caption, or on Home or a dialog
      // In the app: the clipboard as Octet, ChemDraw and Office put it (Octet's own copy, then CDXML, which ChemDraw
      // hides in its PDF on the Mac and Word keeps, then CDX (the whole drawing, and ChemDraw for Windows' only one),
      // then a molfile, then SMILES), then plain text that names a structure, and a picture last.
      if (NATIVE_CLIP && !e.clipboardData?.getData(OCTET_CLIP)) {
        const given = e.clipboardData?.getData("text/plain"), file = imageFile(e);
        e.preventDefault();
        void readClipboard().then(async (clip) => {
          // Edit > Paste on Linux sends a paste with no data (clipCommand): the text is the app's.
          const text = given || clip.text || undefined;
          if (clip.spectrum) return openSpectrumText(clip.spectrum[1], clip.spectrum[0]);
          if (text && isJcamp(text)) return openSpectrumText(text, "the clipboard");
          if (clip.octet) {
            let add: Mol;
            try { add = parse(clip.octet); } catch { return setNotice("Octet cannot read what is on the clipboard."); }
            const r = insertMol(doc, add.style ? fitSizes(add, add.style, style) : add, [0.8, -0.8]);
            set(r.mol, true);
            revealNext.current = true;
            setSelection(r.atoms);
            setPicked(r.items);
            return;
          }
          // ChemDraw's (or Word's copy of ChemDraw's) drawing; otherwise the molfile or SMILES.
          if (clip.cdxml && pasteCdxml(clip.cdxml)) return;
          if (clip.cdx && pasteRead(() => readCdx(fromBase64(clip.cdx!)))) return;
          if (text && CDXML_TEXT.test(text.slice(0, 65536)) && pasteCdxml(text)) return;
          let why = "Paste a name, a SMILES string or a MOL file.";
          const refused = (reason: string) => { why = reason; };
          for (const source of [clip.molfile, clip.smiles]) {
            if (!source || !loaded) continue;
            let frag: Mol | undefined;
            try { frag = asOpened(importStructure(source), source); } catch (err) { frag = undefined; if (err instanceof RangeError) refused(err.message); }
            if (frag?.atoms.length) return place(frag);
          }
          if (text?.trim()) {
            // The names engine loads only for text, so no other paste waits for it.
            await loadNames().then(() => setNamesLoaded(true), () => {});
            const frag = structureFromText(text, refused);
            if (frag) return place(frag);
          }
          const picture = clip.picture ? fromBase64(clip.picture) : file && new Uint8Array(await file.arrayBuffer());
          if (picture) return pastePicture(picture);
          const say = pasteRefused(clip, text, why);
          if (say) setNotice(say);
        }).catch((err) => setNotice(failure("Octet cannot read the clipboard.", err)));
        return;
      }
      // Octet's own copy: everything that was selected, read as a hostile file is, a little down and right of where it was.
      const own = e.clipboardData?.getData(OCTET_CLIP);
      if (own) {
        e.preventDefault();
        let add: Mol;
        try { add = parse(own); } catch { return setNotice("Octet cannot read what is on the clipboard."); }
        const r = insertMol(doc, add.style ? fitSizes(add, add.style, style) : add, [0.8, -0.8]);
        set(r.mol, true);
        revealNext.current = true;
        setSelection(r.atoms);
        setPicked(r.items);
        return;
      }
      const text = e.clipboardData?.getData("text/plain"), file = imageFile(e), named = !!text?.trim() && loaded;
      // A spectrum file (JCAMP-DX as text, SPC as its bytes in the app's form), or JCAMP-DX text.
      const jdx = [...(e.clipboardData?.files ?? [])].find((f) => /\.(jdx|dx|jcamp|spc)$/i.test(f.name));
      const spc = (f: File) => f.arrayBuffer().then((b) => `${SPC}${JSON.stringify({ name: f.name, data: toBase64(new Uint8Array(b)) })}`);
      if (jdx || (text && isJcamp(text))) { e.preventDefault(); void (jdx ? (/\.spc$/i.test(jdx.name) ? spc(jdx) : jdx.text()) : Promise.resolve(text!)).then((t) => openSpectrumText(t, jdx?.name ?? "the clipboard")); return; }
      if (text && CDXML_TEXT.test(text.slice(0, 65536)) && pasteCdxml(text)) return e.preventDefault();
      if (!named && !file) return;
      e.preventDefault();
      // A chemical name first, then SMILES or a MOL file, then a picture.
      void (named ? loadNames().then(() => setNamesLoaded(true), () => {}) : Promise.resolve()).then(async () => {
        let why = "Paste a name, a SMILES string or a MOL file.";
        const frag = named ? structureFromText(text!, (reason) => { why = reason; }) : undefined;
        if (frag) place(frag);
        else if (file) await pastePicture(new Uint8Array(await file.arrayBuffer()));
        else setNotice(`Octet cannot read this structure. ${why}`);
      });
    };
    // Copy puts the selection, or the whole drawing, on the clipboard (or text a panel or Copy As SMILES asked for).
    // Resolves whether it did, so Cut deletes only what is on the clipboard. Check Structure runs first when Settings
    // asks for it: the copy (and so a cut's delete) waits for Ignore All, and never happens after Stop.
    const onCopy = (e: ClipboardEvent): Promise<boolean> => {
      if ((typing() || home || modal()) && !copyText.current) return Promise.resolve(false); // the text's, or nothing to copy on Home or a dialog
      if (copyText.current) {
        e.clipboardData?.setData("text/plain", copyText.current);
        e.preventDefault();
        copyText.current = undefined;
        setNotice("Copied.", "done");
        return Promise.resolve(true);
      }
      if (partPick) return Promise.resolve(false);
      // Everything selected (or the whole drawing) in Octet's own form, for pasting back with arrows, text and shapes,
      // with this drawing's style, so a paste into a drawing of another size keeps text in proportion (fitSizes); and
      // in the forms other programs read: those switched on in Settings > Import and export > Copy (REL-19, CH-8).
      const part = selectedPart() ?? doc;
      if (!part.atoms.length && !part.captions?.length && !part.arrows?.length && !part.shapes?.length) return Promise.resolve(false);
      e.preventDefault();
      // Check Structure first when Settings asks for it; the copy waits for Ignore All, then goes to the clipboard with no
      // copy event (the app's clipboard, or the browser's as text).
      if (settings.checkCopy) {
        const list = selection.size || picked.size ? subsetProblems() : allProblems();
        if (list.length) return new Promise((done) => checkThen(list, () => void copyOut(part).then(done)));
      }
      return copyOut(part, e);
    };
    const copyOut = (part: Mol, e?: ClipboardEvent): Promise<boolean> => {
      saw("copy");
      const page = !selection.size && !picked.size, on = settings.files.clipboard, octetJson = serialize({ ...part, style });
      // In the app: as ChemDraw copies, for Word, PowerPoint and Keynote (a picture at true size: on the Mac a vector
      // PDF, on Windows an EMF and on Linux a PNG, each with the structure hidden in it, so it pastes back as a
      // structure), then CDX, CDXML, a molfile and SMILES, then Octet's own form. The CDXML goes in the picture too.
      if (NATIVE_CLIP) {
        const ask = (yes: boolean, f: PartFormat) => (yes ? formatOf(part, f) : undefined);
        return copyToClipboard({ dpi: settings.files.dpi, svg: on.pdf ? pictureOf(part) : undefined, cdxml: ask(on.cdxml || on.pdf, "cdxml"), cdxmlType: on.cdxml, cdx: ask(on.cdx, "cdx"), molfile: ask(on.mol, "molfile"), smiles: ask(on.smiles, "smiles"), octetJson })
          .then(() => { ackCopy(page); return true; }, (err) => { setNotice(failure("Octet cannot copy this.", err)); return false; });
      }
      // A browser (dev only): its own clipboard, with Octet's form and SMILES (or the text) as text. After Check Structure
      // there is no copy event, so the text alone goes on.
      const text = (on.smiles ? formatOf(part, "smiles") : undefined) ?? (part.captions ?? []).map((c) => c.text).join("\n");
      if (!e) return (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("no clipboard"))).then(() => { ackCopy(page); return true; }, (err) => { setNotice(failure("Octet cannot copy this.", err)); return false; });
      e.clipboardData?.setData(OCTET_CLIP, octetJson);
      if (text) e.clipboardData?.setData("text/plain", text);
      ackCopy(page);
      return Promise.resolve(true);
    };
    // Cut: copy, then delete what was copied (an arrow's conditions too), once the copy is on the clipboard and if the
    // drawing has not changed.
    const onCut = (e: ClipboardEvent) => {
      if (typing() || home || modal() || (!selection.size && !picked.size)) return;
      if (partPick) return run("edit.delete");
      const taken = new Set([...picked, ...(selectedPart()?.captions ?? []).map((c) => c.id)]);
      const before = doc, gone = deleteGraphics(deleteAtoms(doc, selection), taken, drawnAt, drawnAlign);
      void onCopy(e).then((copied) => { if (copied && now.current === before) set(gone); });
    };
    addEventListener("keydown", onKey);
    addEventListener("paste", onPaste);
    addEventListener("copy", onCopy);
    addEventListener("cut", onCut);
    return () => { removeEventListener("keydown", onKey); removeEventListener("paste", onPaste); removeEventListener("copy", onCopy); removeEventListener("cut", onCut); };
  });
  // In a browser (development and the headless checks), files dropped on the page go the app's way. The app takes
  // drops itself (src-tauri/src/open.rs), so its webview never sees them.
  useEffect(() => {
    if (TAURI) return;
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      const list = [...(e.dataTransfer?.files ?? [])], at: [number, number] = [e.clientX, e.clientY];
      if (!list.length) return;
      e.preventDefault();
      void Promise.all(list.map(async (f): Promise<OpenedFile> => {
        const b = new Uint8Array(await f.arrayBuffer()), picture = !!kindOf(b);
        return { name: f.name, path: null, text: picture ? null : new TextDecoder().decode(b), picture: picture ? toBase64(b) : null, error: null, at };
      })).then((files) => takeFiles(files, !home));
    };
    addEventListener("dragover", over);
    addEventListener("drop", drop);
    return () => { removeEventListener("dragover", over); removeEventListener("drop", drop); };
  });

  // Highlights, in px at 100% (the same frame as the drawing): the selection, then the hover on top.
  // An atom's mark covers its whole label (NH2, OMe); an unlabelled atom gets a dot.
  const atomMark = (i: number, key: string, cls: string) => {
    const b = drawing.label[i], pad = 0.16 * L;
    if (b) return <rect key={key} className={cls} x={b[0] - pad} y={b[1] - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} rx={Math.min(0.32 * L, (b[3] - b[1]) / 2 + pad)} />;
    return <circle key={key} className={cls} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.32 * L} />;
  };
  // A charge, radical or lone pair under the pointer with Select: a ring round it.
  const markRing = (i: number, key: string) => {
    const e = drawing.electrons.find((x) => x.atom === i && x.key === key);
    return e ? <circle key="h" className="mark" cx={e.at[0]} cy={e.at[1]} r={0.22 * L} /> : null;
  };
  const bondMark = (i: number, key: string, cls: string) => {
    const [a, b] = shown.bonds[i].atoms.map((k) => pos(shown, k));
    return <line key={key} className={cls} x1={a[0] * L} y1={-a[1] * L} x2={b[0] * L} y2={-b[1] * L} strokeWidth={0.36 * L} />;
  };
  const captionMark = (id: number, key: string, cls: string) => {
    const c = placed.find((x) => x.id === id);
    if (!c) return null;
    const pad = 0.12 * L, b = c.frame ?? c.box;
    return <rect key={key} className={cls} x={b[0] - pad} y={b[1] - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} rx={pad} transform={c.angle && c.pivot ? `rotate(${-c.angle} ${c.pivot[0]} ${c.pivot[1]})` : undefined} />;
  };
  // An arrow's mark: a wide soft line along it.
  const arrowMark = (id: number, key: string, cls: string) => {
    const a = arrows.find((x) => x.id === id), sh = a ? undefined : shown.shapes?.find((x) => x.id === id);
    if (a && isOrbital(a)) return <g key={key}>{lobesOf(a, L).map((l, i) => <polygon key={i} className={`arrow-mark ${cls}`} points={l.path.map((q) => q.join(",")).join(" ")} strokeWidth={0.2 * L} />)}</g>;
    if (sh) return <g key={key}>{shapeTrace(sh, L, frame.bond).paths.map((path, i) => <polyline key={i} className={`arrow-mark ${cls}`} points={path.map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>;
    return a ? <polyline key={key} className={`arrow-mark ${cls}`} points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} /> : null;
  };
  // A group wholly selected (the outermost, when groups nest): a dotted frame round all of it (its atoms with their
  // labels, its text, arrows, shapes and cycles), so it reads as one thing. The frame keeps 6 px clear of the selection
  // marks (0.32 bond lengths round each atom) at any zoom.
  const groupBoxes = selectedGroups(shown, selection, picked).flatMap((g) => { const b = g.atoms.length + g.items.length > 1 ? drawnBox(g.atoms, new Set(g.items)) : undefined; return b ? [[g.id, b] as const] : []; });
  const groupFrames = groupBoxes.length > 0 && <Live store={views}>{(view) => {
    const pad = 0.32 * L + 6 / view.zoom;
    return <g className="group-frame">{groupBoxes.map(([id, b]) => <rect key={`gf${id}`} x={b[0] - pad} y={b[1] - pad} width={b[2] - b[0] + 2 * pad} height={b[3] - b[1] + 2 * pad} rx={4 / view.zoom} />)}</g>;
  }}</Live>;
  // An eraser stroke: its trail, and the bonds and atoms it will remove, tinted.
  const rubbing = drag?.kind === "erase" && drag.moved ? (
    <>
      <polyline className="trail" points={drag.trail.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} strokeWidth={2 * settings.eraser * L} />
      <g className="erase-marks">
        {[...drag.bonds].filter((i) => i < shown.bonds.length).map((i) => bondMark(i, `eb${i}`, ""))}
        {[...drag.atoms].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ea${i}`, ""))}
        {[...drag.captions].map((id) => captionMark(id, `ec${id}`, "") ?? arrowMark(id, `ea${id}`, ""))}
      </g>
    </>
  ) : null;
  const selected = drag?.kind === "erase" ? [] : [
    // Hidden H atoms (Toggle Hydrogen Display) and their bonds are selected with their structure but not marked.
    ...shown.bonds.flatMap((b, i) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) && !shown.atoms[b.atoms[0]].hidden && !shown.atoms[b.atoms[1]].hidden ? [bondMark(i, `sb${i}`, "")] : [])),
    ...[...selection].filter((i) => i < shown.atoms.length && !shown.atoms[i].hidden).map((i) => atomMark(i, `sa${i}`, "")),
    ...[...picked].map((id) => captionMark(id, `sc${id}`, "") ?? arrowMark(id, `sr${id}`, "")),
    // A picked cycle's arrows; of a picked step or side arrow, its own alone.
    ...cycleArrows.filter((a) => picked.has(a.cycle) && (branchPick?.cycle !== a.cycle || a.branch === branchPick.branch) && (stepPick?.cycle !== a.cycle || (a.branch === undefined && a.step === stepPick.step))).map((a) => <polyline key={`sy${a.id}`} className="arrow-mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />),
  ];
  // With Select or the Eraser, over any part of an integral group the mark covers all of it, as a click picks or
  // removes all of it (ChemDraw highlights the outermost integral group too). Each group's members, worked out once
  // for each drawing.
  const integrals = useMemo(() => outerGroups((doc.groups ?? []).filter((g) => g.integral)).map((g) => ({ g, atoms: new Set(g.atoms), items: new Set(g.items) })), [doc.groups]);
  // The mark on a whole: an integral group, or what a pick for a template set takes.
  const partMark = (atoms: Set<number>, items: Set<number>) => (
    <g key="h">
      {shown.bonds.flatMap((b, i) => (atoms.has(b.atoms[0]) && atoms.has(b.atoms[1]) ? [bondMark(i, `hb${i}`, "mark")] : []))}
      {[...atoms].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ha${i}`, "mark"))}
      {[...items].map((id) => captionMark(id, `hc${id}`, "mark") ?? arrowMark(id, `hr${id}`, "mark"))}
      {cycleArrows.filter((a) => items.has(a.cycle)).map((a) => <polyline key={`hy${a.id}`} className="arrow-mark mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}
    </g>
  );
  const wholeMark = (w: (typeof integrals)[number]) => partMark(w.atoms, w.items);
  const integralAt = (hover: Hover) => {
    if ((tool !== "select" && tool !== "erase") || !integrals.length) return undefined;
    const ids = atomsOf(doc, hover), items = itemsOf(hover);
    const w = integrals.find((x) => ids.some((i) => x.atoms.has(i)) || items.some((id) => x.items.has(id)));
    return w && (tool === "erase" || !(w.g.atoms.every((i) => selection.has(i)) && w.g.items.every((id) => picked.has(id)))) ? w : undefined;
  };
  // The grid cell picked, marked as a selection is.
  const gridPickMark = () => {
    const v = gridPick && gridViews.find((x) => x.arrow === gridPick.arrow), c = v?.cells.find((x) => x.key === gridPick!.key && x.row === gridPick!.row);
    return v && c ? <rect className="grid-pick" aria-hidden x={(c.x - c.w / 2) * L} y={-c.y * L} width={c.w * L} height={v.rh * L} /> : null;
  };
  // Show Reaction Interpretation: the reaction under the pointer, each part boxed and named by what it is.
  const ROLE_NAMES: Record<Role, string> = { reactant: "Reactant", product: "Product", above: "Above arrow", below: "Below arrow" };
  const interpretationAt = (hover: Hover) => {
    if (!interpreted.length || drag) return null;
    const atom = hover.atom ?? (hover.bond !== undefined ? doc.bonds[hover.bond]?.atoms[0] : undefined);
    const x = interpreted.find(({ r, roles }) => (atom !== undefined && roles.atoms.has(atom)) || (hover.arrow !== undefined && r.arrows.includes(hover.arrow))
      || (hover.caption !== undefined && (roles.captions.has(hover.caption) || r.captions.includes(hover.caption))));
    if (!x) return null;
    const pad = 0.15, seen = new Set<string>();
    return (
      <g className="interpretation" aria-hidden>
        {x.steps.flatMap((st) => ([["reactant", st.reactants], ["product", st.products], ["above", st.above], ["below", st.below]] as [Role, Part[]][]).flatMap(([role, list]) => list.map((part) => {
          const key = part.kind === "structure" ? `s${part.atoms[0]}` : `t${part.id}`, b = part.box;
          // An intermediate is shown once, as the product it is first.
          if (seen.has(key) || (role === "reactant" && st !== x.steps[0])) return null;
          seen.add(key);
          return (
            <g key={key} className={role}>
              <rect x={(b[0] - pad) * L} y={-(b[3] + pad) * L} width={(b[2] - b[0] + 2 * pad) * L} height={(b[3] - b[1] + 2 * pad) * L} rx={0.2 * L} />
              {/* The name over its box; under it below the arrow, so it clears what is above the arrow. */}
              <text x={(b[0] - pad) * L} y={role === "below" ? -(b[1] - pad) * L + 11 : -(b[3] + pad) * L - 3}>{ROLE_NAMES[role]}</text>
            </g>
          );
        })))}
      </g>
    );
  };
  const hovered = (hover: Hover) => { const mark = hoveredMark(hover), shown = settings.interpretation ? interpretationAt(hover) : null; return shown ? <g key="h">{shown}{mark}</g> : mark; };
  // The mark on what is under the pointer, drawn by Live as the pointer moves.
  const hoveredMark = (hover: Hover, whole = drag ? undefined : integralAt(hover), pick = templatePick && !drag ? pickOf(hover) : undefined) => drag ? null
    : pick ? partMark(...pick)
    : hover.mark !== undefined ? markRing(hover.atom!, hover.mark)
    : whole ? wholeMark(whole)
    // The Reaction Atom-Atom Map tool on a mapped atom: its partners (the atoms with its number) ringed too.
    : tool === "map" && hover.atom !== undefined && shown.atoms[hover.atom]?.map ? (
      <g key="h">
        {atomMark(hover.atom, "ha", "mark")}
        <g className="mapping" aria-hidden>
          {shown.atoms.flatMap((a, i) => (a.map === shown.atoms[hover.atom!].map && i !== hover.atom ? [<circle key={i} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={0.32 * L} />] : []))}
        </g>
      </g>
    )
    : hover.atom !== undefined && shown.atoms[hover.atom] ? atomMark(hover.atom, "h", "mark")
    : hover.caption !== undefined && !picked.has(hover.caption) ? captionMark(hover.caption, "h", "mark")
    : hover.arrow !== undefined && !picked.has(hover.arrow) ? arrowMark(hover.arrow, "h", "mark")
    // Over a cycle's side arrow, that side arrow (the half the Eraser would take); over an arc with the Eraser, that arc.
    : hover.cycle !== undefined && !picked.has(hover.cycle) ? <g key="h">{cycleArrows.filter((a) => a.cycle === hover.cycle && (hover.branch !== undefined ? a.branch === hover.branch && (tool !== "erase" || a.part === hover.part) : tool !== "erase" || (a.branch === undefined && a.step === hover.step))).map((a) => <polyline key={a.id} className="arrow-mark mark" points={arrowTrace(a, L).paths[0].map((q) => q.join(",")).join(" ")} strokeWidth={0.36 * L} />)}</g>
    : hover.bond !== undefined && shown.bonds[hover.bond] ? bondMark(hover.bond, "h", "mark") : null;
  const box = drag?.kind === "box" && drag.moved ? (
    <rect
      className="box"
      x={Math.min(drag.from[0], drag.to[0]) * L}
      y={-Math.max(drag.from[1], drag.to[1]) * L}
      width={Math.abs(drag.to[0] - drag.from[0]) * L}
      height={Math.abs(drag.to[1] - drag.from[1]) * L}
      vectorEffect="non-scaling-stroke"
    />
  ) : null;

  // The Actions panel's group row: Group when the selection holds two or more things (a group counts as one), and
  // Ungroup and Pick as One when it touches a group.
  const grouping = useMemo(() => {
    const gs = groupTargets(doc, selection, picked), count = fragments(doc).filter((g) => g.some((i) => selection.has(i))).length + picked.size;
    const group = count >= 2 && (!doc.groups?.length || !!groupSelection(doc, selection, picked));
    return gs.length || count >= 2 ? { grouped: gs.length > 0, integral: gs.length > 0 && gs.every((g) => g.integral), group } : undefined;
  }, [doc, selection, picked]);
  // Home stays on screen while it fades out, so going to a drawing (or the tutorial) is one smooth move.
  const [homeLeaving, setHomeLeaving] = useState(false), [wasHome, setWasHome] = useState(home), homeKind = useRef<"name" | "home">("home");
  if (home) homeKind.current = settings.userName === null ? "name" : "home";
  if (wasHome !== home) { setWasHome(home); setHomeLeaving(wasHome); }
  useEffect(() => {
    if (!homeLeaving) return;
    const t = setTimeout(() => setHomeLeaving(false), timing().duration); // Home's exit (editor.css, home-out)
    return () => clearTimeout(t);
  }, [homeLeaving]);

  // The selection's extent (px at 100%), for the rulers' band: its atoms with their labels and text, picked text, and
  // picked arrows and shapes by their ends. It follows a move as it goes.
  const rulerExtent = guides.rulers && (selection.size || picked.size) ? union([
    withCaptions(selection), ...placed.filter((c) => picked.has(c.id)).map((c) => c.box),
    ...[...(shown.arrows ?? []), ...(shown.shapes ?? [])].filter((a) => picked.has(a.id)).map((a): Box => [Math.min(a.from[0], a.to[0]) * L, -Math.max(a.from[1], a.to[1]) * L, Math.max(a.from[0], a.to[0]) * L, -Math.min(a.from[1], a.to[1]) * L]),
  ].filter((b): b is Box => !!b)) : undefined;
  // The grid across the window, lighter and heavier lines (only the ones far enough apart to read at this zoom), and
  // the crosshair over it: two lines across the window, with a tick at each lighter step when the grid is off, as
  // ChemDraw's. Drawn for the window alone, so it costs the same at every zoom. Never exported or printed.
  const gridMarks = (view: { x: number; y: number; zoom: number }) => {
    if (!gridShown && !cross) return null;
    const scale = view.zoom * L, box: [number, number, number, number] = [-view.x / scale, (view.y - frameHeight()) / scale, (frameWidth() - view.x) / scale, view.y / scale];
    const [top, bottom, left, right] = [-box[3] * L, -box[1] * L, box[0] * L, box[2] * L], lines = gridLines(gridShown ? grid : heavy, box, scale);
    const path = (major: boolean) => [...lines.x.filter(([, m]) => m === major).map(([x]) => `M${x * L} ${top}V${bottom}`), ...lines.y.filter(([, m]) => m === major).map(([y]) => `M${left} ${-y * L}H${right}`)].join("");
    const ticks = cross && !gridShown && shownStep(grid, scale) === grid.minor ? gridLines(grid, box, scale) : undefined, t = 5 / view.zoom;
    return (
      <>
        <path className="grid" d={path(false)} vectorEffect="non-scaling-stroke" />
        <path className="grid major" d={path(true)} vectorEffect="non-scaling-stroke" />
        {cross && <path className="crosshair" vectorEffect="non-scaling-stroke"
          d={`M${cross[0] * L} ${top}V${bottom}M${left} ${-cross[1] * L}H${right}${ticks ? [...ticks.x.map(([x]) => `M${x * L} ${-cross[1] * L - t}v${2 * t}`), ...ticks.y.map(([y]) => `M${cross[0] * L - t} ${-y * L}h${2 * t}`)].join("") : ""}`} />}
      </>
    );
  };
  // A shape's fill: a highlight, a solid, shaded or faded fill, or a shadow.
  const shapeFill = (sh: Shape) => {
    // A TLC plate is the page's colour, as ChemDraw's, unless it is Transparent.
    if (sh.kind === "tlc" && !sh.tlc?.transparent) { const t = tlcLayout(sh); return <rect key={`f${sh.id}`} x={t.x0 * L} y={-t.y1 * L} width={(t.x1 - t.x0) * L} height={(t.y1 - t.y0) * L} fill="var(--canvas)" />; }
    if (!(sh.kind === "highlight" || sh.fill || sh.shadow)) return null;
    const d = kept(outlines, sh, frame.bond, () => toPath(shapeTrace(sh, L, frame.bond).paths.slice(0, 1))), shade = { ...SHADE, ...sh.shade }, off = shade.depth * L * scaleOf(sh);
    if (sh.kind === "highlight") return <path key={`f${sh.id}`} d={d} fill={sh.colour ?? HIGHLIGHT} />;
    if (sh.fill) return <path key={`f${sh.id}`} d={d} fill={sh.fill !== "solid" ? `url(#shade${sh.id})` : sh.colour ? textInk(sh.colour) : "var(--ink)"} />;
    // A shadow falls down and to the right, in the shape's colour at its opacity, softened by a blur. It shows
    // only outside the shape, so the shape stays unfilled: what is behind it shows through, and an export on a
    // transparent background has nothing in it.
    return (
      <g key={`f${sh.id}`}>
        <defs>
          {shade.blur > 0 && <filter id={`soft${sh.id}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation={shade.blur * L * 0.5 * scaleOf(sh)} /></filter>}
          <mask id={`outside${sh.id}`} maskUnits="userSpaceOnUse" x={-1e5} y={-1e5} width={2e5} height={2e5}>
            <rect x={-1e5} y={-1e5} width={2e5} height={2e5} fill="#fff" />
            <path d={d} fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#outside${sh.id})`}>
          <path d={d} transform={`translate(${off} ${off})`} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} fillOpacity={shade.opacity} filter={shade.blur > 0 ? `url(#soft${sh.id})` : undefined} />
        </g>
      </g>
    );
  };
  // A closed pen curve's fill: solid, shaded (lit from the top left) or faded (to nothing at the bottom right).
  const curveFill = (a: Arrow) => {
    if (!(a.curve?.closed && a.fill)) return null;
    // As ChemDraw draws them (checked in its SVG export): each curve's fill, then its outline as a 0.05 pt
    // hairline, in order, so a curve drawn later (a lamp's highlight over its glass, say) covers those under it.
    const ink = a.colour ? textInk(a.colour) : "var(--ink)", d = kept(outlines, a, L, () => toPath(arrowTrace(a, L).paths));
    const outline = <path d={d} fill="none" stroke={ink} strokeWidth={(a.width ?? 0.05) * pt * scaleOf(a)} />;
    if (a.fill === "solid") return <g key={`cf${a.id}`}><path d={d} fill={ink} />{outline}</g>;
    return (
      <g key={`cf${a.id}`}>
        <defs>
          {a.fill === "shaded"
            ? <radialGradient id={`cfill${a.id}`} cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" style={{ stopColor: ink }} /></radialGradient>
            : <linearGradient id={`cfill${a.id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: ink }} /><stop offset="1" style={{ stopColor: ink }} stopOpacity={0} /></linearGradient>}
        </defs>
        <path d={d} fill={`url(#cfill${a.id})`} />
        {outline}
      </g>
    );
  };
  const orbitalsInk = (orbitals: Arrow[]) => {
    // Orbitals sit behind the structure: plain lobes are the page's colour, shaded ones lit from the top
    // left, filled ones solid; phased orbitals fill one phase and leave the other plain.
    return (
      <g className="orbitals">
        <defs>
          <radialGradient id="lobe" cx="0.36" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" style={{ stopColor: "var(--ink)" }} stopOpacity={0.55} />
          </radialGradient>
        </defs>
        {orbitals.filter((a) => a.colour && a.orbital!.phase === "shaded").map((a) => (
          <radialGradient key={`g${a.id}`} id={`lobe${a.id}`} cx="0.36" cy="0.32" r="0.75">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor={textInk(a.colour!)} stopOpacity={0.55} />
          </radialGradient>
        ))}
        {orbitals.flatMap((a) => lobesOf(a, L).map((l, i) => {
          const ink = a.colour ? textInk(a.colour) : "var(--ink)", ph = a.orbital!.phase;
          const fill = ph === "filled" || (ph === "phased" && !l.second) ? ink : ph === "shaded" ? `url(#lobe${a.colour ? a.id : ""})` : "var(--canvas)";
          return <path key={`${a.id}-${i}`} d={toPath([l.path])} fill={fill} fillRule="evenodd" stroke={ink} strokeWidth={lined(a.width).line * scaleOf(a)} />;
        }))}
      </g>
    );
  };
  // A TLC plate's lines and spots.
  // The lane marked on a picked plate (lanePick), for the drawing's memos below.
  const laneMark = lanePick && picked.has(lanePick.plate) ? lanePick : undefined;
  const tlcInk = (sh: Shape) => {
    // A plate's origin line, dashed solvent front, side ticks (every 0.1 Rf, longer at 0, 0.5 and 1), spots, and their
    // Rf values when shown. The lane its actions act on is marked while the plate is picked.
    const t = tlcLayout(sh), y = (v: number) => -v * L, ink = sh.colour ? textInk(sh.colour) : "var(--ink)", hide = new Set(sh.tlc?.hide ?? []), w = lined(sh.width).line * t.f;
    const dragging = drag?.kind === "spot" && drag.plate === sh.id ? drag.index : undefined, path = (q: [number, number][]) => "M" + q.map(([px, py]) => `${(px * L).toFixed(2)} ${(-py * L).toFixed(2)}`).join("L") + "Z";
    const ticks = sh.tlc?.ticks && Array.from({ length: 11 }, (_, k) => { const at = y(t.at(k / 10)), n = (k % 5 ? 0.09 : 0.16) * L * t.f; return `M${t.x0 * L} ${at}h${n}M${t.x1 * L} ${at}h${-n}`; }).join("");
    return (
      <g key={`tlc${sh.id}`} className="tlc">
        {laneMark?.plate === sh.id && laneMark.lane < t.lanes && <rect className="lane-picked" x={(t.x0 + t.width * laneMark.lane) * L} y={y(t.y1)} width={t.width * L} height={(t.y1 - t.y0) * L} />}
        {ticks && <path d={ticks} stroke={ink} strokeWidth={w} fill="none" />}
        {!hide.has("origin") && <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.origin)} y2={y(t.origin)} stroke={ink} strokeWidth={w} />}
        {!hide.has("origin") && Array.from({ length: t.lanes }, (_, k) => <line key={`t${k}`} x1={t.lane(k) * L} x2={t.lane(k) * L} y1={y(t.origin) - 0.08 * L * t.f} y2={y(t.origin) + 0.08 * L * t.f} stroke={ink} strokeWidth={w} />)}
        {!hide.has("front") && <line x1={t.x0 * L} x2={t.x1 * L} y1={y(t.front)} y2={y(t.front)} stroke={ink} strokeWidth={w} strokeDasharray={`${0.12 * L * t.f} ${0.08 * L * t.f}`} />}
        {(sh.tlc?.spots ?? []).map((x, i) => {
          // A spot in its own colour (or the plate's): filled, hollow (its outline) or shaded (lit from the top left); its
          // outline dashed (and hollow) or bold; doubled, with a second outline round it, clear of the first by its width and
          // two line widths.
          const c = x.colour ? textInk(x.colour) : ink, d = path(spotPath(t, x)), { rx } = t.size(x), filled = x.style !== "hollow" && !x.dashed, sw = x.bold ? lined(sh.width).bold * t.f : w, grow = x.doubled ? (2 * sw + 2 * w) / L : 0;
          const picked = spotPick?.plate === sh.id && spotPick.index === i;
          return (
            <g key={i}>
              {x.style === "shaded" && filled && <defs><radialGradient id={`spot${sh.id}-${i}`} cx="0.36" cy="0.32" r="0.75"><stop offset="0" stopColor="#FFFFFF" /><stop offset="1" style={{ stopColor: c }} /></radialGradient></defs>}
              <path d={d} fill={!filled ? "none" : x.style === "shaded" ? `url(#spot${sh.id}-${i})` : c} stroke={!filled || x.bold ? c : undefined} strokeWidth={sw} strokeDasharray={x.dashed ? `${3 * sw} ${2 * sw}` : undefined} />
              {x.doubled && <path d={path(spotPath(t, x, grow))} fill="none" stroke={c} strokeWidth={sw} />}
              {picked && <path d={d} className="spot-picked" fill="none" vectorEffect="non-scaling-stroke" />}
              {(sh.tlc?.rf || x.showRf || dragging === i) && <text x={(t.lane(x.lane) + rx + grow + 0.1 * t.f) * L} y={y(t.at(x.rf)) + 0.12 * L * t.f} fill={c} style={textFace(sh, (sh.size ?? style.captionSize * 0.8) * pt * t.f)}>{x.rf.toFixed(2)}</text>}
            </g>
          );
        })}
      </g>
    );
  };
  // The text style of a table's cells or a TLC plate's Rf values (px size).
  const textFace = (sh: Shape, size: number): React.CSSProperties => ({ font: `${sh.italic ? "italic " : ""}${sh.bold ? "bold " : ""}${size}px ${fontStack(sh.font ?? style.captionFont)}`, ...(sh.underline ? { textDecoration: "underline" } : {}) });
  // A table's lines and text.
  const tableInk = (sh: Shape) => {
    // A table: the lines it has (journal rules unless set otherwise), solid or dashed, and each cell's text
    // aligned in its column.
    const t = tableLayout(sh, cellWidth(sh), style.captionSize), y = (v: number) => -v * L, ink = sh.colour ? textInk(sh.colour) : "var(--ink)", size = (sh.size ?? style.captionSize) * pt * t.f;
    const lines = new Set(linesOf(sh.table)), inner = (n: number) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1);
    const across = [...(lines.has("top") ? [t.y1] : []), ...inner(t.rows).filter((r) => lines.has("rows") || (r === 1 && lines.has("header"))).map((r) => t.row(r)), ...(lines.has("bottom") ? [t.y0] : [])];
    const down = [...(lines.has("left") ? [t.x0] : []), ...(lines.has("cols") ? inner(t.cols).map((c) => t.col(c)) : []), ...(lines.has("right") ? [t.x1] : [])];
    const weight = (sh.table?.weight ?? style.line) * pt * t.f, dash = sh.dashed ? `${3 * weight} ${3 * weight}` : undefined;
    const anchor = (c: number) => sh.table?.align?.[c] ?? "centre";
    return (
      <g key={`table${sh.id}`} className="table">
        {across.map((v, i) => <line key={`r${i}`} x1={t.x0 * L} x2={t.x1 * L} y1={y(v)} y2={y(v)} stroke={ink} strokeWidth={weight} strokeDasharray={dash} />)}
        {down.map((v, i) => <line key={`c${i}`} x1={v * L} x2={v * L} y1={y(t.y1)} y2={y(t.y0)} stroke={ink} strokeWidth={weight} strokeDasharray={dash} />)}
        {(sh.table?.cells ?? []).map((row, r) => row.map((text, c) => text && !(cell?.id === sh.id && cell.r === r && cell.c === c) ? (
          <text key={`${r}-${c}`} x={(anchor(c) === "left" ? t.col(c) + TABLE_PAD * t.f : anchor(c) === "right" ? t.col(c + 1) - TABLE_PAD * t.f : t.col(c) + t.widths[c] / 2) * L} y={y(t.row(r) - t.heights[r] / 2) + 0.35 * size}
            textAnchor={anchor(c) === "left" ? "start" : anchor(c) === "right" ? "end" : "middle"} fill={ink} style={textFace(sh, size)}>{formula(text, size)}</text>
        ) : null))}
      </g>
    );
  };
  // A shape's lines: its outline, a TLC plate's lines and spots, a table's lines and text, and a bracket's sign.
  const shapeLines = (sh: Shape) => (
    <Fragment key={`sl${sh.id}`}>
      {sh.kind !== "highlight" && sh.kind !== "table" && !sh.fill && !(sh.kind === "tlc" && sh.tlc?.hide?.includes("border")) && <path key={`sh${sh.id}`} d={kept(shapeInks, sh, lined(sh.width), () => toPath(shapeInk(sh, lined(sh.width), L)))} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} />}
      {sh.kind === "tlc" && tlcInk(sh)}
      {sh.kind === "table" && tableInk(sh)}
      {sh.mark && isBracket(sh) && (() => {
        const m = markAt(sh, L);
        return <text key={`m${sh.id}`} x={m.x} y={m.y} textAnchor={m.anchor} fill={sh.colour ? textInk(sh.colour) : "var(--ink)"} style={{ font: `${style.captionSize * pt * scaleOf(sh)}px ${fontStack(style.captionFont)}` }}>{sh.mark}</text>;
      })()}
      {/* A polymer bracket's usage label at its lower right, and its repeat pattern and flip at its upper right. */}
      {sh.polymer && isBracket(sh) && !sh.side && (() => {
        const at = polymerLabelsAt(sh, L), label = polymerLabel(sh.polymer), tags = polymerTags(sh.polymer), font = { font: `${0.75 * style.captionSize * pt * scaleOf(sh)}px ${fontStack(style.captionFont)}` }, fill = sh.colour ? textInk(sh.colour) : "var(--ink)";
        return (
          <Fragment key={`p${sh.id}`}>
            {label && <text x={at.label.x} y={at.label.y} fill={fill} style={font}>{label}</text>}
            {tags && <text x={at.tags.x} y={at.tags.y} fill={fill} style={font}>{tags}</text>}
          </Fragment>
        );
      })()}
      {/* An R-group definition's name, in a tab on its box's upper left edge (ChemDraw's alternative group title). */}
      {sh.rgroup && (() => {
        const x0 = Math.min(sh.from[0], sh.to[0]) * L, y0 = -Math.max(sh.from[1], sh.to[1]) * L, size = style.captionSize * pt * scaleOf(sh), w = textWidth(sh.rgroup.name, size, false, false, fontStack(style.captionFont)) + 0.8 * size, h = 1.5 * size;
        const fill = sh.colour ? textInk(sh.colour) : "var(--ink)";
        return (
          <g key={`rg${sh.id}`}>
            <path d={`M${x0} ${y0}V${y0 - h}H${x0 + w}V${y0}`} fill="none" stroke={fill} strokeWidth={lined(sh.width).line} strokeDasharray={sh.dashed ? `${0.2 * L} ${0.2 * L}` : undefined} />
            <text x={x0 + 0.4 * size} y={y0 - 0.4 * size} fill={fill} style={{ font: `${size}px ${fontStack(style.captionFont)}` }}>{sh.rgroup.name}</text>
          </g>
        );
      })()}
    </Fragment>
  );
  // The drawing's layers. Hovering, panning, zooming and the caret do not change them, and each is made again only
  // when what it shows changes, so React passes over the rest of the drawing.
  const gridKey = gridViews.length ? gridViews : undefined;
  const under = useMemo(() => (
    <>
      {/* Pictures from ChemDraw files, at the back, in their boxes (turned as ChemDraw turned them). One with no format
          the webview draws shows as a tinted box. */}
      {(shown.shapes ?? []).filter((sh) => sh.kind === "picture" && sh.picture).map((sh) => {
        const x0 = Math.min(sh.from[0], sh.to[0]) * L, x1 = Math.max(sh.from[0], sh.to[0]) * L, y0 = -Math.max(sh.from[1], sh.to[1]) * L, y1 = -Math.min(sh.from[1], sh.to[1]) * L;
        const url = pictureUrl(sh.picture!), turn = (Number(sh.picture!.RotationAngle) || 0) / 65536;
        const t = turn ? `rotate(${turn} ${(x0 + x1) / 2} ${(y0 + y1) / 2})` : undefined;
        return url
          ? <image key={`pic${sh.id}`} href={url} x={x0} y={y0} width={x1 - x0} height={y1 - y0} preserveAspectRatio="none" transform={t} />
          : <rect key={`pic${sh.id}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill="var(--brand-mist)" transform={t} />;
      })}
      {/* Fills go behind the structures: highlights, shadows (with the shape white over them), solid and shaded shapes. */}
      {/* Ring fills: each ring that is still closed, filled with its colour behind the bonds. */}
      {shown.fills?.length && (() => {
        const joined = new Set(shown.bonds.map((b) => ringKey(b.atoms)));
        return shown.fills.filter((f) => f.atoms.every((i, k) => i < shown.atoms.length && joined.has(ringKey([i, f.atoms[(k + 1) % f.atoms.length]])))).map((f) => (
          <polygon key={`fill${f.atoms.join("-")}`} points={f.atoms.map((i) => `${pos(shown, i)[0] * L},${-pos(shown, i)[1] * L}`).join(" ")} fill={f.colour} fillOpacity={0.3} />
        ));
      })()}
      {/* Highlight colours, as ChemDraw draws them: a band along each highlighted bond (as wide as a bond's outline:
          its line and three bond spacings), a disc on a highlighted atom with no bond of its colour, and a ring round a
          label. One group per colour, so the parts do not darken where they overlap. */}
      {[...new Set([...shown.atoms.map((at) => at.halo), ...shown.bonds.map((b) => b.halo)].filter((c): c is string => !!c))].map((c) => {
        const band = frame.line + 3 * frame.spacing, own = new Set(shown.bonds.flatMap((b) => (b.halo === c ? b.atoms : [])));
        return (
          <g key={`halo${c}`} className="atom-halo" opacity={0.4} fill={c} stroke={c} strokeLinecap="round">
            {shown.bonds.map((b, k) => b.halo === c && <line key={`b${k}`} x1={pos(shown, b.atoms[0])[0] * L} y1={-pos(shown, b.atoms[0])[1] * L} x2={pos(shown, b.atoms[1])[0] * L} y2={-pos(shown, b.atoms[1])[1] * L} strokeWidth={band} />)}
            {shown.atoms.map((at, i) => {
              if (at.halo !== c) return null;
              const box = drawing.label[i];
              if (!box) return !own.has(i) && <circle key={i} cx={pos(shown, i)[0] * L} cy={-pos(shown, i)[1] * L} r={band / 2} stroke="none" />;
              // A label: a circle round one letter, or a box with round ends round a longer label.
              const [w, h] = [box[2] - box[0], box[3] - box[1]], pad = band / 4 + 0.08 * L;
              if (Math.abs(w - h) < 0.6 * h) return <circle key={i} cx={(box[0] + box[2]) / 2} cy={(box[1] + box[3]) / 2} r={Math.max(w, h) / 2 + pad} stroke="none" />;
              return <rect key={i} x={box[0] - pad - h / 4} y={box[1] - pad} width={w + 2 * pad + h / 2} height={h + 2 * pad} rx={h / 4 + pad} ry={h / 2 + pad} stroke="none" />;
            })}
          </g>
        );
      })}
      <defs>
        {(shown.shapes ?? []).filter((sh) => sh.fill === "shaded").map((sh) => (
          <radialGradient key={sh.id} id={`shade${sh.id}`} cx="0.36" cy="0.32" r="0.72">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" style={{ stopColor: sh.colour ? textInk(sh.colour) : "var(--ink)" }} />
          </radialGradient>
        ))}
        {(shown.shapes ?? []).filter((sh) => sh.fill === "faded").map((sh) => (
          <linearGradient key={sh.id} id={`shade${sh.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: sh.colour ?? "var(--ink)" }} />
            <stop offset="1" style={{ stopColor: sh.colour ?? "var(--ink)" }} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      {(shown.shapes ?? []).filter(level).map(shapeFill)}
      {arrows.filter(level).map(curveFill)}
      {arrows.some((a) => level(a) && isOrbital(a)) && orbitalsInk(arrows.filter((a) => level(a) && isOrbital(a)))}
      {gridViews.map((v) => {
        // The grid: a rule above and below, row names right-aligned on the left, each column centred under its component.
        const size = style.captionSize * pt * 0.9 * v.f, font = `${size}px ${fontStack(style.captionFont)}`, y = (k: number) => -(v.top - (k + 0.5) * v.rh) * L + 0.35 * size;
        const x0 = v.start * L, x1 = (Math.max(...v.cols.map((c) => c.x)) + v.width / 2) * L, ink = v.colour ? textInk(v.colour) : "var(--ink)";
        // As rows: its rules, its titles and names, then each cell's amount as gridText gives it.
        const baseline = (top: number) => -(top - 0.5 * v.rh) * L + 0.35 * size;
        if (v.texts && v.rules) return (
          <g key={`grid${v.arrow}`} className="stoich" fill={ink} style={{ font }}>
            {v.rules.map(([a, b, h], k) => <line key={`r${k}`} x1={a * L} x2={b * L} y1={-h * L} y2={-h * L} stroke={ink} strokeWidth={frame.line * v.f} />)}
            {v.texts.map((t, k) => <text key={`t${k}`} x={t.x * L} y={baseline(t.y)} textAnchor={t.anchor} fontWeight={t.bold ? 700 : undefined}>{t.formula ? formula(t.text, size) : t.text}</text>)}
            {v.cells.map((cell) => {
              const c = v.cols.find((x) => x.key === cell.key), row = GRID_ROWS.find((x) => x.id === cell.row), t = c && row ? gridText(v, c, row) : undefined;
              return t?.text && !(gridEdit?.arrow === v.arrow && gridEdit.key === cell.key && gridEdit.row === cell.row) ? (
                <text key={`${cell.row}${cell.key}`} x={cell.x * L} y={baseline(cell.y)} textAnchor="middle" fontWeight={t.typed ? 700 : 400}>{cell.row === "formula" ? formula(t.text, size) : t.text}</text>
              ) : null;
            })}
          </g>
        );
        return (
          <g key={`grid${v.arrow}`} className="stoich" fill={v.colour ? textInk(v.colour) : "var(--ink)"} style={{ font }}>
            <line x1={x0} x2={x1} y1={-v.top * L} y2={-v.top * L} stroke={v.colour ? textInk(v.colour) : "var(--ink)"} strokeWidth={frame.line * v.f} />
            <line x1={x0} x2={x1} y1={-(v.top - v.rows.length * v.rh) * L} y2={-(v.top - v.rows.length * v.rh) * L} stroke={v.colour ? textInk(v.colour) : "var(--ink)"} strokeWidth={frame.line * v.f} />
            {v.rows.map((row, k) => <text key={row.id} x={v.left * L} y={y(k)} textAnchor="end">{row.name}</text>)}
            {v.rows.flatMap((row, k) => v.cols.map((c) => {
              const t = gridText(v, c, row);
              return t.text && !(gridEdit?.arrow === v.arrow && gridEdit.key === c.key && gridEdit.row === row.id) ? (
                <text key={`${row.id}${c.key}`} x={c.x * L} y={y(k)} textAnchor="middle" fontWeight={t.typed ? 700 : 400}>{row.id === "formula" ? formula(t.text, size) : t.text}</text>
              ) : null;
            }))}
          </g>
        );
      })}
      {stereoMarks().map((m) => <text key={m.key} className="stereo-label" x={m.x} y={m.y} textAnchor={m.anchor} dominantBaseline="middle" fill={m.colour ?? "var(--ink)"} style={{ font: `${m.upright ? "" : "italic "}${m.size}px ${fontStack(style.captionFont)}` }}>{m.text}</text>)}
      {problemMarks()}
    </>
  ), [shown, drawing, frame, darkPaper, arrows, pt, gridKey, gridEdit, style, stereo, ringsOf, found, found.some((p) => p.caption !== undefined) && placed, doc.atoms, settings.stereoParens]); // eslint-disable-line react-hooks/exhaustive-deps
  // The selection's marks, and the mark on what is under the pointer (Live: a pointer move draws only that again).
  const marks = (
    <>
      {/* One group with one opacity, so overlapping marks don't stack up darker. */}
      <g key={copied?.page === false ? `copied${copied.n}` : undefined} className={copied?.page === false ? "selection-marks copied" : "selection-marks"}>{selected}</g>
      {gridPickMark()}
      {groupFrames}
      {msPoint && msAtoms && <g className="nmr-marks">{msPoint.filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `ms${i}`, ""))}</g>}
      {nmrBondMarks.size > 0 && <g className="nmr-marks">{[...nmrBondMarks].filter((k) => k < shown.bonds.length).map((k) => bondMark(k, `nmrb${k}`, ""))}</g>}
      {nmrMarks.size > 0 && <g className="nmr-marks">{[...nmrMarks].filter((i) => i < shown.atoms.length).map((i) => atomMark(i, `nmr${i}`, ""))}</g>}
      {shiftLabels().map((l) => (
        <text key={`shift${l.atom}`} className={`nmr-shift${nmrMarks.has(l.atom) ? " lit" : ""}${settings.nmrDetails && nmrQuality.has(l.atom) ? ` q-${nmrQuality.get(l.atom)}` : ""}`} x={l.x} y={l.y} textAnchor={l.align === "left" ? "start" : l.align === "right" ? "end" : "middle"} style={{ font: `${l.size * pt}px ${fontStack(style.captionFont)}` }}>{l.text}</text>
      ))}
      <Live store={hovers}>{hovered}</Live>
    </>
  );
  const ink = useMemo(() => (
    <>
      {structureInk.map(([id, key, path, move, first]) => { const [colour, alpha] = key.split("|"); return <path key={`s${id}`} className={first >= settling ? "settle" : undefined} d={path} transform={move} fill={colour ? textInk(colour) : "var(--ink)"} fillOpacity={Number(alpha) < 1 ? Number(alpha) : undefined} />; })}
      {drawing.beads.length > 0 && (
        // Polymer beads: spheres lit from the top left, over the bond they end.
        <>
          <defs>
            <radialGradient id="bead" cx="0.36" cy="0.32" r="0.72">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" style={{ stopColor: "var(--ink)" }} />
            </radialGradient>
          </defs>
          {drawing.beads.map((b, i) => <circle key={`bd${i}`} cx={b.at[0]} cy={b.at[1]} r={b.r} fill="url(#bead)" />)}
        </>
      )}
      {arrowInk.map(([colour, d]) => <path key={`a${colour}`} d={d} fill={colour ? textInk(colour) : "var(--ink)"} />)}
    </>
  ), [drawing.beads, structureInk, arrowInk, darkPaper, style, pt, settling]); // eslint-disable-line react-hooks/exhaustive-deps
  const draggedSpot = drag?.kind === "spot" ? `${drag.plate} ${drag.index}` : undefined;
  const over = useMemo(() => (
    <>
      {(shown.shapes ?? []).filter(level).map(shapeLines)}
      {shown.atoms.map((a, i) => a.enhanced && drawing.ink[i] && !(settings.hideAbs && a.enhanced === "abs") ? (
        // Enhanced stereo flags: small, by the stereocentre on its open side, as ChemDraw prints them. Settings > Drawing >
        // Hide abs flags hides the absolute ones (ChemDraw's Hide Absolute Stereoflags).
        <text key={`st${i}`} className="stereo-flag" textAnchor="middle" fill="var(--ink)" x={(pos(shown, i)[0] + 0.5 * scaleOf(a) * markDirs.get(i)![0]) * L} y={-(pos(shown, i)[1] + 0.5 * scaleOf(a) * markDirs.get(i)![1]) * L + 0.25 * frame.size * scaleOf(a)}
          style={{ font: `${frame.size * 0.7 * scaleOf(a)}px ${fontStack(style.labelFont)}` }}>{a.enhanced}</text>
      ) : null)}
      {drawing.maps.map((n) => (
        // Atom map numbers: in brand blue, in the label's face, where render puts them (clear of the label and bonds).
        <text key={`map${n.atom}`} className="atom-map" textAnchor="middle" x={n.at[0]} y={n.at[1] + n.h / 2} style={{ font: labelFont({ ...shown.atoms[n.atom], size: n.size }) }}>{n.text}</text>
      ))}
      {labelTexts.filter((_, k) => level(shown.atoms[drawing.parts[k].ids[0]]))}
      {placed.filter(level).map((c) => c.id === (writing?.id ?? DRAFT) || c.id === DRAFT ? null : (
        <CaptionText key={`c${c.id}`} c={c} fill={c.colour ? textInk(c.colour) : "var(--ink)"} font={fontStack(c.font ?? style.captionFont)} reagent={reagents.has(c.id)} pt={pt} dark={darkPaper} />
      ))}
    </>
  ), [shown, frame, darkPaper, draggedSpot, spotPick, laneMark?.plate, laneMark?.lane, style, pt, cell?.id, cell?.r, cell?.c, drawing, markDirs, labelTexts, placed, writing?.id, reagents, settings.hideAbs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Things with a draw order (order.ts), each drawn whole: under all the layers (below zero) or over them, lowest first.
  const lifted = useMemo(() => {
    const things: [number, React.ReactNode][] = [];
    drawing.parts.forEach(({ ids, drawing: d, at, k: grown, turn }, k) => {
      const o = shown.atoms[ids[0]]?.order;
      if (o) things.push([o, (
        <g key={`os${ids[0]}`}>
          {structurePaths(d).map(([key, path]) => { const [colour, alpha] = key.split("|"); return <path key={key} d={path} transform={moveBy(at, grown, turn)} fill={colour ? textInk(colour) : "var(--ink)"} fillOpacity={Number(alpha) < 1 ? Number(alpha) : undefined} />; })}
          {labelTexts[k]}
        </g>
      )]);
    });
    for (const sh of shown.shapes ?? []) if (sh.order) things.push([sh.order, <g key={`osh${sh.id}`}>{shapeFill(sh)}{shapeLines(sh)}</g>]);
    for (const a of [...arrows, ...cycleArrows]) if (a.order) things.push([a.order, (
      <g key={`oa${a.id}`}>
        {isOrbital(a) ? orbitalsInk([a]) : a.curve?.closed && a.fill ? curveFill(a) : <path d={kept(arrowInks, a, lined(a.width), () => toPath(arrowShapes(a, lined(a.width), L)))} fill={a.colour ? textInk(a.colour) : "var(--ink)"} />}
      </g>
    )]);
    for (const c of placed) if (c.order && c.id !== (writing?.id ?? DRAFT) && c.id !== DRAFT) things.push([c.order, <CaptionText key={`oc${c.id}`} c={c} fill={c.colour ? textInk(c.colour) : "var(--ink)"} font={fontStack(c.font ?? style.captionFont)} reagent={reagents.has(c.id)} pt={pt} dark={darkPaper} />]);
    things.sort((a, b) => a[0] - b[0]);
    return { back: things.filter(([o]) => o < 0).map(([, x]) => x), front: things.filter(([o]) => o > 0).map(([, x]) => x) };
  }, [shown, frame, darkPaper, draggedSpot, spotPick, laneMark?.plate, laneMark?.lane, style, pt, cell?.id, cell?.r, cell?.c, drawing, labelTexts, placed, arrows, cycleArrows, writing?.id, reagents]); // eslint-disable-line react-hooks/exhaustive-deps

  // The selection's colour, when the user has picked their own (editor.css, data-select), with its tints.
  const ownSelect = settings.selectColour !== SELECT_DEFAULT ? settings.selectColour : undefined;
  const selectStyle = ownSelect ? (([tint, dark]) => ({ "--select-own": ownSelect, "--select-own-tint": tint, "--select-own-tint-dark": dark }) as React.CSSProperties)(selectTints(ownSelect)) : undefined;

  return (
    <div className={guides.rulers && !home ? "editor with-rulers" : "editor"} data-select={ownSelect ? "own" : undefined} style={selectStyle}>
      {/* The canvas draws again as the view, or what the pointer is over, changes. The drawing's layers in it are made
          by the editor (under, marks, ink and over), so React passes over them. */}
      <Live store={views}>{(view) => <Live store={overs}>{({ selection: overSelection, turn: overTurn, edge: edgeHover, page: pageHover, resize: overResize, join: overJoin, cross: overCross, grab: overGrab, details: overDetails }) => (
      <svg
        ref={svg}
        className={`canvas paper-${paper}${view.pinch ? " pinch" : ""}`}
        data-theme={darkPaper ? "dark" : "light"}
        data-tool={tool}
        style={{
          ...((overCross && !drag) || drag?.kind === "crosshair" ? { cursor: "move" } : pageHover && !drag ? { cursor: "zoom-in" } : (overResize && !drag) || drag?.kind === "resize" ? { cursor: CURSORS[drag?.kind === "resize" ? drag.side : overResize!] }
            : (overTurn && !drag) || drag?.kind === "turn" ? { cursor: cursor?.turn ?? "grab" } : overSelection || drag?.kind === "move" ? { cursor: "move" } : overGrab && !drag ? { cursor: "grab" } : overDetails && !drag ? { cursor: cursor?.text ?? "text" } : {}),
          ...Object.fromEntries(Object.entries(cursor ?? {}).map(([name, value]) => [`--cursor-${name}`, value])),
          ...((edgeHover && !drag) || drag?.kind === "tableedge" ? { cursor: (drag?.kind === "tableedge" ? drag.axis : edgeHover) === "col" ? "col-resize" : "row-resize" } : {}),
          ...(templatePick ? { cursor: "copy" } : {}),
          ...(panning ? { cursor: "grabbing" } : {}),
          ...(darkPaper ? { "--ink": "#FFFFFF" } : {}),
          ...(own ? { "--canvas": own } : {}),
        } as React.CSSProperties}
        // Screen readers read the canvas through CanvasAccess, over it: each object, atom and bond on its own.
        aria-hidden
        onPointerDown={onPointerDown}
        onContextMenu={onContextMenu}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => { pointer.current = undefined; pointers.set(undefined); setBrush(undefined); if (!drag && !hovers.get().key) setHover({}); }}
        onDoubleClick={(e) => {
          // A double-click ends the Pen's curve.
          if (pen) return finishPen();
          // A double-click on a resize handle opens Scale…, and on the rotation handle Rotate…, as in ChemDraw.
          if (resizeAt(toDoc(e.clientX, e.clientY))) return commands.current.scale_dialog?.();
          if (tool !== "erase" && onTurnHandle(toDoc(e.clientX, e.clientY))) return commands.current.rotate_dialog?.();
          // A double-click on a cycle step's handle puts its space or bow back; on a side arrow's, where it meets the arc
          // or that end.
          const stepHandle = tool !== "erase" ? handleAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (stepHandle?.step !== undefined) return doc.cycles?.find((c) => c.id === stepHandle.id)?.steps?.[stepHandle.step]?.[stepHandle.which as "lead" | "trail" | "bow"] === undefined ? undefined : set(setStep(doc, stepHandle.id, stepHandle.step, { [stepHandle.which]: undefined }), true);
          if (stepHandle?.branch !== undefined) return set(stepHandle.which === "meet" ? setBranch(doc, stepHandle.id, stepHandle.branch, { meet: undefined }) : setEnd(doc, stepHandle.id, stepHandle.branch, stepHandle.which === "end:out" ? "out" : "in", { along: undefined, reach: undefined }), true);
          // With the Cycle tool, a double-click on an arc opens its step's name.
          const arc = tool === "cycle" ? hit(toDoc(e.clientX, e.clientY)) : undefined;
          if (arc?.cycle !== undefined && arc.branch === undefined && arc.step !== undefined) return writingOpen.current ? undefined : openName(arc.cycle, arc.step);
          // With Select, a double-click on part of a group picks that part alone, to move it within the group (an
          // integral group stays whole). A double-click on a part already picked goes on (a caption's text opens). A page
          // spectrum's peak label across is one part: both its lines (labelLines), and the next double-click types into
          // the line under the pointer.
          if (tool === "select") {
            const h = hit(toDoc(e.clientX, e.clientY)), ids = atomsOf(doc, h), its = itemsOf(h).flatMap((x) => (x === h.caption ? labelLines(doc, x) : [x])), g = outermost(groupsOf(doc, new Set(ids), new Set(its)));
            if (g && (g.integral || ids.length)) return pickWhole(h);
            if (g && !(its.every((x) => picked.has(x)) && picked.size === its.length && !selection.size)) { setSelection(new Set()); setPicked(new Set(its)); return; }
          }
          // With Select, double-click an atom to type its label (other tools would draw on each click).
          // Double-click a caption with any tool to type into it.
          const t = hit(toDoc(e.clientX, e.clientY));
          // Double-click a stoichiometry cell to type in it (Limiting? sets the limiting reactant at once).
          const gc = tool !== "erase" ? gridCellAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (gc && gc.row === "limiting") { if (!gc.product) changeGrid(gc.arrow, () => ({ limiting: gc.key })); return; }
          if (gc && !["name", "formula", "mw", "expected", "expectedMoles", "yield"].includes(gc.row)) {
            const v = gridViews.find((x) => x.arrow === gc.arrow)!, c = v.cols.find((x) => x.key === gc.key)!, row = GRID_ROWS.find((r) => r.id === gc.row)!;
            return setGridEdit({ ...gc, value: c.typed[row.field as Field] !== undefined ? gridText(v, c, row).text : "" });
          }
          // Double-click a TLC spot, or its Rf value, to type its Rf (ChemDraw's Set Rf; the spot moves to it).
          const plate = tool !== "erase" ? plateAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (plate) {
            const q = toDoc(e.clientX, e.clientY), k = spotHit(plate, q) >= 0 ? spotHit(plate, q) : rfAt(plate, q);
            if (k >= 0) return setDialog({ kind: "rf", plate: plate.id, index: k, value: String(plate.tlc!.spots[k].rf) });
          }
          // Double-click a table to type in the cell.
          const table = tool !== "erase" ? tableAt(toDoc(e.clientX, e.clientY)) : undefined;
          if (table) return openCell(table, toDoc(e.clientX, e.clientY));
          // Double-click an experiment's details with Select to edit them (a click with a drawing tool there draws).
          if (tool === "select" && t.atom === undefined && t.bond === undefined && t.caption === undefined && t.arrow === undefined && detailsAt(toDoc(e.clientX, e.clientY))) return setDialog({ kind: "details", values: detailsOf(doc.annotations) });
          // Double-click a reaction arrow to pick the whole reaction: structures, plus signs, arrows and their text.
          const a = t.arrow !== undefined ? arrows.find((x) => x.id === t.arrow) : undefined;
          if (a && !curved(a) && !isLine(a) && tool !== "erase") {
            const r = reactionOf(a.id);
            if (r) return choose(r.atoms, [...r.arrows, ...r.captions, ...r.carried]);
          }
          if (t.caption !== undefined && tool !== "erase") startWriting({ id: t.caption });
          // With Select, a double-click on an atom or bond picks its whole structure, as in ChemDraw. (Enter, the Text
          // tool and Option-click with a drawing tool type an atom's label.)
          else if (tool === "select" && atomsOf(doc, t).length) pickWhole(t);
        }}
      >
        <g ref={camera} transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* The grid and the crosshair, drawn for the window. Not part of the drawing. */}
          <g className="pages" aria-hidden>{gridMarks(view)}</g>
          {/* The page outlines: the page and what its purpose needs, each an edge with corner marks and its name. Not part of the drawing. */}
          <g className="pages" aria-hidden ref={pagesEl}>
            {style.edges && pages.map(([name, w, h]) => {
              const [x, y, t] = [(w / 2) * mm * L, (h / 2) * mm * L, 10 / view.zoom];
              return (
                <g key={name} className={pageHover === name ? "page hovered" : "page"}>
                  <rect className="page-edge" x={-x} y={-y} width={2 * x} height={2 * y} vectorEffect="non-scaling-stroke" />
                  {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => (
                    <path key={`${sx}${sy}`} d={`M${sx * x - sx * t} ${sy * y}H${sx * x}V${sy * y - sy * t}`} vectorEffect="non-scaling-stroke" />
                  ))}
                  <text x={-x + 3 / view.zoom} y={-y + 13 / view.zoom} style={{ fontSize: 11 / view.zoom }}>{name}</text>
                </g>
              );
            })}
            {/* A copy of the whole drawing lights the page's edge once, shown or not (FEEL-41). */}
            {copied?.page && <rect key={copied.n} className="page-copied" x={(-pages[0][1] / 2) * mm * L} y={(-pages[0][2] / 2) * mm * L} width={pages[0][1] * mm * L} height={pages[0][2] * mm * L} vectorEffect="non-scaling-stroke" />}
          </g>
          {/* The drawing and its marks, without the page, so the Spectrum panel can show the structure beside its spectrum. */}
          <g id="world">
          {/* An experiment's details at the top of its page: part of the page as it prints and exports, not of a part copied. */}
          {details && (!exporting || exporting === doc) && (
            <g className="details" fill="var(--ink)">
              {details.texts.map((x, k) => <text key={k} x={x.x * L} y={-x.y * L} style={{ font: `${x.bold ? "bold " : ""}${x.size * pt}px ${fontStack(style.captionFont)}` }}>{x.text}</text>)}
              <line x1={details.rule[0] * L} x2={details.rule[1] * L} y1={-details.rule[2] * L} y2={-details.rule[2] * L} stroke="var(--ink)" strokeWidth={style.line * pt} />
            </g>
          )}
          {/* The whole drawing scaled in proportion is shown scaled as it is, as nothing in it changes but its size. */}
          <g transform={drag?.kind === "resize" && drag.plot === undefined && drag.whole && drag.lines && drag.size[0] === drag.size[1] && drag.size[0] !== 1
            ? `translate(${drag.anchor[0] * L * (1 - drag.size[0])} ${-drag.anchor[1] * L * (1 - drag.size[0])}) scale(${drag.size[0]})` : undefined}>
          {lifted.back}
          {under}
          {marks}
          {ink}
          {offer && (() => {
            // The offered arrow, faint, with the key that takes it.
            const a: Arrow = { id: -1, kind: "reaction", from: offer.from, to: offer.to }, mid: P = [((a.from[0] + a.to[0]) / 2) * L, -a.from[1] * L];
            return (
              <g className="suggested" aria-label="Suggested arrow. Press Tab to draw it.">
                <path d={toPath(arrowShapes(a, frame, L))} />
                <g transform={`translate(${mid[0]} ${mid[1] + 0.55 * L}) scale(${1 / view.zoom})`}>
                  <rect x={-16} y={-10} width={32} height={20} rx={5} />
                  <text x={0} y={4} textAnchor="middle">Tab</text>
                </g>
              </g>
            );
          })()}
          {over}
          {lifted.front}
          </g>
          {(pen || drag?.kind === "pen") && (() => {
            // The Pen's points as small squares, and the handle being dragged out of the point being placed.
            const r = 3.5 / view.zoom, now = drag?.kind === "pen" ? penPoint(drag.at, drag.out) : undefined;
            return (
              <g className="pen-points" aria-hidden>
                {now?.c1 && now.c2 && <line x1={now.c1[0] * L} y1={-now.c1[1] * L} x2={now.c2[0] * L} y2={-now.c2[1] * L} />}
                {now?.c1 && now.c2 && [now.c1, now.c2].map((q, i) => <circle key={i} cx={q[0] * L} cy={-q[1] * L} r={r * 0.8} />)}
                {[...(pen ?? []), ...(now ? [now] : [])].map((q, i) => <rect key={i} x={q.at[0] * L - r} y={-q.at[1] * L - r} width={2 * r} height={2 * r} />)}
              </g>
            );
          })()}
          {drag?.kind === "map" && drag.to && (() => {
            // The atom being mapped, joined by a dashed line to the pointer, or to the atom under it (ringed).
            const a = pos(doc, drag.atom), on = hitAt(drag.to).atom, b = on !== undefined && on !== drag.atom ? pos(doc, on) : drag.to;
            return (
              <g className="mapping" aria-hidden>
                <circle cx={a[0] * L} cy={-a[1] * L} r={0.32 * L} />
                <line x1={a[0] * L} y1={-a[1] * L} x2={b[0] * L} y2={-b[1] * L} strokeDasharray={`${0.18 * L} ${0.14 * L}`} />
                {on !== undefined && on !== drag.atom && <circle cx={b[0] * L} cy={-b[1] * L} r={0.32 * L} />}
              </g>
            );
          })()}
          {ghost && (
            <g className="ghost" aria-hidden>
              <path d={toPath(ghost.polygons)} />
              {ghost.labels.map((l, i) => <text key={i} x={l.x} y={l.y} transform={labelTurn(l)} textDecoration={l.underline ? "underline" : undefined} style={{ font: labelFont(l) }}>{l.text}</text>)}
            </g>
          )}
          {(() => {
            // A picked arrow's handles: its ends, and the middle of a curved one.
            const ids = [...picked], a = ids.length === 1 && !selection.size && drag?.kind !== "move" ? arrows.find((x) => x.id === ids[0]) : undefined;
            const wh = drag?.kind === "move" ? undefined : widthHandle();
            if ((a?.kind === "curve" || a?.kind === "cut") && a.curve && !wh) {
              // A picked pen curve (or fragmentation line with corners): every anchor as a small square, and each handle
              // as a dot on a line from its anchor.
              const r = 3.5 / view.zoom, c = a.curve;
              return (
                <g className="pen-points" aria-hidden>
                  {c.points.flatMap((q, i) => (["c1", "c2"] as const).flatMap((part) => { const h = q[part]; return h ? [<line key={`l${i}${part}`} x1={q.at[0] * L} y1={-q.at[1] * L} x2={h[0] * L} y2={-h[1] * L} />] : []; }))}
                  {c.points.flatMap((q, i) => (["c1", "c2"] as const).flatMap((part) => { const h = q[part]; return h ? [<circle key={`h${i}${part}`} cx={h[0] * L} cy={-h[1] * L} r={r * 0.8} />] : []; }))}
                  {c.points.map((q, i) => <rect key={`p${i}`} x={q.at[0] * L - r} y={-q.at[1] * L - r} width={2 * r} height={2 * r} />)}
                </g>
              );
            }
            if ((!a || a.kind === "curve") && !wh) return null;
            const barb = !wh && a ? headBarb(a, frame, L) : undefined;
            const points = wh ? [wh.at] : [a!.from, a!.to, ...(curved(a!) || a!.point ? [bendPoint(a!)] : []), ...(barb ? [[barb[0] / L, -barb[1] / L] as P] : [])];
            return (
              <>
                {points.map((q, i) => <circle key={`hd${i}`} className="handle" cx={q[0] * L} cy={-q[1] * L} r={4 / view.zoom} vectorEffect="non-scaling-stroke" />)}
                {!wh && a && pointable(a) && !a.point && (() => { const m = bendPoint(a); return <circle className="handle add" cx={m[0] * L} cy={-m[1] * L} r={3 / view.zoom} vectorEffect="non-scaling-stroke" />; })()}
              </>
            );
          })()}
          {(drag && drag.kind !== "handle" ? [] : branchHandles()).flatMap((b) => (["meet", "end:in", "end:out"] as const).flatMap((which) => {
            // A cycle's side arrows' handles (branchHandles): where each meets the arc, and its ends. The one being dragged
            // is hidden.
            const q = which === "meet" ? b.T : b[which === "end:in" ? "in" : "out"];
            return q && !(drag?.kind === "handle" && drag.branch === b.branch && drag.id === b.cycle && drag.which === which) ? [<circle key={`cb${b.cycle}:${b.branch}${which}`} className="handle" cx={q[0] * L} cy={-q[1] * L} r={4 / view.zoom} vectorEffect="non-scaling-stroke" />] : [];
          }))}
          {(() => {
            // A cycle's step handles (stepHandles): each arc's start, end and middle. The one being dragged is hidden;
            // a dragged start or end shows its space beside it.
            const sh = drag && drag.kind !== "handle" ? undefined : stepHandles(), on = drag?.kind === "handle" && drag.step !== undefined ? drag : undefined;
            return sh && cycleLayout.spans.filter((s) => s.cycle === sh.c.id && sh.steps.includes(s.step)).flatMap((s) => (["lead", "trail", "bow"] as const).map((which) => {
              const q = s[which], key = `st${s.step}${which}`;
              if (on?.step !== s.step || on.which !== which) return <circle key={key} className="handle" cx={q[0] * L} cy={-q[1] * L} r={4 / view.zoom} vectorEffect="non-scaling-stroke" />;
              const v = which === "bow" ? undefined : on.working.cycles?.find((x) => x.id === on.id)?.steps?.[s.step]?.[which] ?? 0;
              return v === undefined ? null : <text key={key} className="turn-angle" x={q[0] * L} y={-q[1] * L - 10 / view.zoom} textAnchor="middle" style={{ fontSize: 11 / view.zoom }}>{`${v} pt`}</text>;
            }));
          })()}
          {overJoin && !drag && (
            // Where a joined arrow would start: a small square, as ChemDraw marks it.
            <rect className="handle join" x={overJoin[0] * L - 3 / view.zoom} y={-overJoin[1] * L - 3 / view.zoom} width={6 / view.zoom} height={6 / view.zoom} vectorEffect="non-scaling-stroke" />
          )}
          {(() => {
            // The selection's frame with its resize handles and rotation handle, and the centre the selection turns
            // about (a +, which Option-drag moves); while resizing, the frame as it is now and the scale in its middle;
            // while turning, the centre and the angle.
            const h = drag?.kind === "turn" ? undefined : turnHandle(view.zoom), c = drag?.kind === "turn" ? drag.centre : h && centreMark;
            const centre = c && <path className="turn-centre" d="M-5 0H5M0 -5V5" transform={`translate(${c[0] * L} ${-c[1] * L}) scale(${1 / view.zoom})`} aria-hidden />;
            if (drag?.kind === "turn") {
              return <>{centre}<text className="turn-angle" x={c![0] * L} y={-c![1] * L - 10 / view.zoom} textAnchor="middle" style={{ fontSize: 11 / view.zoom }}>{`${Math.round(drag.degrees)}°`}</text></>;
            }
            if (drag?.kind === "resize") {
              const [sx, sy] = drag.size, a = drag.anchor, f = drag.frame, x0 = a[0] + (f[0] - a[0]) * sx, x1 = a[0] + (f[2] - a[0]) * sx, y0 = a[1] + (f[1] - a[1]) * sy, y1 = a[1] + (f[3] - a[1]) * sy;
              return (
                <g className="frame-marks" aria-hidden>
                  <rect className="selection-frame" x={x0 * L} y={-y1 * L} width={(x1 - x0) * L} height={(y1 - y0) * L} vectorEffect="non-scaling-stroke" />
                  <text className="turn-angle" x={((x0 + x1) / 2) * L} y={(-(y0 + y1) / 2) * L} textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12 / view.zoom }}>{percentOf(drag.size)}</text>
                </g>
              );
            }
            const b = frameBox(view.zoom), r = 3.5 / view.zoom;
            return b && (
              <g className="frame-marks" aria-hidden>
                {selectionFrame!.handles && <rect className="selection-frame" x={b[0] * L} y={-b[3] * L} width={(b[2] - b[0]) * L} height={(b[3] - b[1]) * L} vectorEffect="non-scaling-stroke" />}
                {frameSides(b, view.zoom).map((side) => { const q = handlePoint(b, side); return <rect key={side} className={overResize === side ? "resize-handle hot" : "resize-handle"} x={q[0] * L - r} y={-q[1] * L - r} width={2 * r} height={2 * r} vectorEffect="non-scaling-stroke" />; })}
                {centre}
                {h && (
                  <g className={overTurn ? "turn-handle hot" : "turn-handle"} transform={`translate(${h[0]} ${h[1]}) scale(${1 / view.zoom})`}>
                    <circle r={9} />
                    <path d="M3.6 -3.2 A4.8 4.8 0 1 0 4.6 1.6 M3.6 -3.2 L3.8 -6.2 M3.6 -3.2 L0.7 -3" />
                  </g>
                )}
              </g>
            );
          })()}
          {box}
          {drag?.kind === "lasso" && drag.moved && (
            <polygon className="box" points={drag.points.map(([x, y]) => `${x * L},${-y * L}`).join(" ")} vectorEffect="non-scaling-stroke" />
          )}
          {rubbing}
          {drag?.kind === "chain" && drag.to && (() => {
            // How many atoms the chain draws (ChemDraw's count), just past its end.
            const points = chainPath(drag), end = points[points.length - 1], before = points.length > 1 ? points[points.length - 2] : typeof drag.from === "number" ? pos(doc, drag.from) : drag.from;
            const d = Math.hypot(end[0] - before[0], end[1] - before[1]) || 1, gap = 12 / view.zoom;
            return (
              <text className="count" x={end[0] * L + ((end[0] - before[0]) / d) * gap} y={-end[1] * L - ((end[1] - before[1]) / d) * gap} textAnchor="middle" dominantBaseline="central" style={{ fontSize: 12 / view.zoom }}>
                {chainCount(drag)}
              </text>
            );
          })()}
          <Live store={brushes}>{(brush) => tool === "erase" && brush && <circle className="brush" cx={brush[0] * L} cy={-brush[1] * L} r={settings.eraser * L} vectorEffect="non-scaling-stroke" />}</Live>
          {drag?.kind === "move" && drag.guides.map((g, i) => {
            // A space made equal: a line across it with a tick at each end.
            const tick = 4 / view.zoom, ends = g.gap ? [g.from, g.to] : [];
            return g.axis === "x"
              ? <g key={i}><line className="guide" x1={g.at * L} x2={g.at * L} y1={-g.from * L} y2={-g.to * L} vectorEffect="non-scaling-stroke" />
                {ends.map((e) => <line key={e} className="guide" x1={g.at * L - tick} x2={g.at * L + tick} y1={-e * L} y2={-e * L} vectorEffect="non-scaling-stroke" />)}</g>
              : <g key={i}><line className="guide" y1={-g.at * L} y2={-g.at * L} x1={g.from * L} x2={g.to * L} vectorEffect="non-scaling-stroke" />
                {ends.map((e) => <line key={e} className="guide" y1={-g.at * L - tick} y2={-g.at * L + tick} x1={e * L} x2={e * L} vectorEffect="non-scaling-stroke" />)}</g>;
          })}
          {drag?.kind === "move" && drag.point && <circle key={drag.point.join()} className="snap-point" cx={drag.point[0] * L} cy={-drag.point[1] * L} r={0.22 * L} vectorEffect="non-scaling-stroke" />}
          </g>
        </g>
      </svg>
      )}</Live>}</Live>
      {!home && (
        <Scrollbars views={views} box={scrollBox} ruler={guides.rulers ? RULER : 0} theme={darkPaper ? "dark" : "light"} canvas={svg}
          pan={(dx, dy) => { stopCamera(); setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })); }}
          glide={(dx, dy) => { const v = views.get(); moveView({ ...v, x: v.x + dx, y: v.y + dy }); }} />
      )}
      {!home && (
        <CanvasAccess items={access.items} hover={hovers} hotOf={hotItem} views={views} scale={L} paper={paper} ring={own && ringOn(own)} current={accessKey.current}
          inside={accessIn} want={accessWant} rescue={accessRescue} onFocusItem={accessFocused} layer={accessEl} />
      )}
      <div className="visually-hidden" role="status">{said}</div>
      {guides.rulers && !home &&<Live store={views}>{(view) => <Live store={pointers}>{(at) => (
        <Rulers view={view} scale={L} mm={mm} origin={corner} unit={settings.rulerUnit} pointer={at} extent={rulerExtent}
          onUnit={() => setSettings((s) => ({ ...s, rulerUnit: RULER_UNITS[(RULER_UNITS.findIndex(([u]) => u === s.rulerUnit) + 1) % RULER_UNITS.length][0] }))} />
      )}</Live>}</Live>}
      {editing && doc.atoms[editing.atom] && <Live store={views}>{(view) => {
        // The label box sits on the atom, in the label font at the size the label is drawn and the current zoom.
        const [ax, ay] = pos(doc, editing.atom), a = doc.atoms[editing.atom], drawn = (a.size ?? style.labelSize) * scaleOf(a);
        // Enter, Escape and a click elsewhere all keep the label; only the first one counts. A colour chosen while typing
        // goes on with the label, in one step (black is the ink: no colour of its own).
        const ids = editing.all ?? [editing.atom], by = { ...elementColours(), ...settings.elementColours }, chosen = editing.colour;
        const tint = (m: Mol): Mol => !chosen ? m : { ...m, atoms: m.atoms.map((x, i) => (!ids.includes(i) ? x : { ...x, colour: chosen === "element" ? by[x.label] ?? x.colour : chosen.toLowerCase() === "#000000" ? undefined : chosen })) };
        // The text as kept (each line trimmed), and its styles: what all of it has is the label's own bold, italic and
        // underline, the rest its runs (a label that is an element has no runs). A font or size chosen while typing goes
        // on all of it; a size is the size drawn, kept over the atom's scale.
        // A name typed as LaTeX's, \delta, is its character, δ (escapes.ts).
        const typed = trimLines(expandRuns(editing.runs ?? [{ text: editing.value }], keptText(a.text))), text = plainOf(typed), st = labelStyle(typed);
        const ownSize = (x: Atom) => { const v = Math.round(((editing.size ?? 0) / scaleOf(x)) * 100) / 100; return Math.abs(v - style.labelSize) < 0.01 ? undefined : v; };
        const dress = (m: Mol): Mol => ({ ...m, atoms: m.atoms.map((x, i) => {
          if (!ids.includes(i)) return x;
          const { bold: _b, italic: _i, underline: _u, runs: _r, ...rest } = x;
          return { ...rest, ...(st.bold ? { bold: true } : {}), ...(st.italic ? { italic: true } : {}), ...(st.underline ? { underline: true } : {}),
            ...(editing.font ? { font: editing.font === style.labelFont ? undefined : editing.font } : {}), ...(editing.size ? { size: ownSize(x) } : {}) };
        }) });
        // The label's runs (its characters' own styles); a raised or lowered part is drawn, not read (issue 44).
        const runs = (m: Mol): Mol => ids.reduce((n, i) => (n.atoms[i]?.text ? setLabelRuns(n, i, st.runs) : n), m);
        const commit = () => {
          if (!labelOpen.current) return;
          labelOpen.current = false;
          if (text || !editing.blank) set(runs(dress(tint(ids.reduce((m, i) => setLabel(m, i, text), doc)))), !!editing.all, editing.merge);
          if (text) lastLabel.current = text;
          setEditing(undefined);
        };
        // The box opens with the label selected; its first line is on the atom (half a line above it to half below), and
        // Option-Return (or Return, as Settings ask) starts another line under it, as ChemDraw's labels do.
        const size = frame.size * ((editing.size ?? drawn) / style.labelSize) * view.zoom;
        return (
          <RichBox
            className="label-box"
            label="Atom label"
            returnNewLine={settings.labelReturnNewLine}
            runs={editing.runs ?? [{ text: editing.value }]}
            version={editing.version ?? 0}
            caret={editing.caret ?? [0, editing.value.length]}
            pending={editing.pending}
            api={labelApi}
            look={(r) => ({ fontWeight: r.bold ? "bold" : "", fontStyle: r.italic ? "italic" : "", textDecoration: r.underline ? "underline" : "",
              verticalAlign: r.script === "sub" ? "sub" : r.script === "super" ? "super" : "", fontSize: r.script ? "75%" : "" })}
            style={{ left: view.x + ax * L * view.zoom, top: view.y - ay * L * view.zoom - 0.6 * size - 2, fontSize: size, fontFamily: fontStack(editing.font ?? a.font ?? style.labelFont),
              color: (chosen === "element" ? by[editing.value.trim()] : chosen) ?? a.colour }}
            onRuns={(runs, rebuild) => setEditing((w) => w && { ...w, runs, value: plainOf(runs), ...(rebuild ? { version: (w.version ?? 0) + 1, caret: rebuild, pending: undefined } : {}) })}
            onKeyDown={(e) => {
              // Return reaches here only when it does not make a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); commit(); }
              // ⇧⌘N in the browser (the app's menu does it there): the label's text as a name.
              if (!TAURI && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); commands.current.name_to_structure(); }
              // ChemDraw's text keys, as in a caption: the box takes them first, and marks them so the Text menu's own
              // command from the same key does not run again.
              else if (TAURI ? (MAC ? e.metaKey : e.ctrlKey) : e.metaKey || e.ctrlKey) {
                const command = textKey(e, true);
                if (command?.startsWith("caption.")) {
                  e.preventDefault();
                  if (TAURI) pageRan.current = { id: `text_${command.slice(8)}`, at: performance.now() };
                  runAction(command);
                }
              }
            }}
            onBlur={commit}
          />
        );
      }}</Live>}
      {printing && createPortal(
        // What Print prints: only this, a page to a sheet, at true size (see editor.css, @media print). It is the body's
        // own child, so it flows from sheet to sheet while everything else is left out.
        <div className="print-root" aria-hidden>
          {printing.srcs.map((src, k) => <img key={k} src={src} alt="" style={{ display: "block", width: `${printing.w}pt`, height: `${printing.h}pt`, breakAfter: k < printing.srcs.length - 1 ? "page" : undefined }} />)}
        </div>, document.body,
      )}
      {gridEdit && <Live store={views}>{(view) => {
        // The stoichiometry cell box, over the cell; Enter keeps it, Escape leaves it as it was.
        const v = gridViews.find((x) => x.arrow === gridEdit.arrow);
        if (!v) return null;
        const z = view.zoom, w = gridEdit.w * L * z, h = v.rh * L * z;
        return (
          <input
            className="cell-box" aria-label="Amount" autoFocus spellCheck={false} defaultValue={gridEdit.value}
            style={{ left: view.x + gridEdit.x * L * z - w / 2, top: view.y - gridEdit.y * L * z, width: w, height: h, font: `${style.captionSize * pt * 0.9 * v.f * z}px ${fontStack(style.captionFont)}` }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitGridCell(e.currentTarget.value); } if (e.key === "Escape") { e.preventDefault(); setGridEdit(undefined); } }}
            onBlur={(e) => { if (!inMap(e.relatedTarget)) commitGridCell(e.currentTarget.value); }}
          />
        );
      }}</Live>}
      {cell && <Live store={views}>{(view) => {
        // The cell box sits over the cell, in the table's font at the current zoom. Tab and Shift-Tab move along the
        // row, Enter and the up and down arrows move down and up a column, and Tab past the last cell adds a row.
        const sh = doc.shapes?.find((x) => x.id === cell.id);
        if (!sh?.table) return null;
        const t = tableLayout(sh, cellWidth(sh), style.captionSize), z = view.zoom, size = (sh.size ?? style.captionSize) * pt * t.f * z, cols = t.cols;
        const width = Math.max(t.widths[cell.c], (cellWidth(sh)(cell.value) + 2 * TABLE_PAD) * t.f) * L * z, align = sh.table.align?.[cell.c] ?? "centre";
        return (
          <input
            ref={cellInput}
            className="cell-box"
            aria-label={`Row ${cell.r + 1}, column ${cell.c + 1}`}
            autoFocus
            spellCheck={false}
            value={cell.value}
            style={{
              left: view.x + ((t.col(cell.c) + t.widths[cell.c] / 2) * L * z) - width / 2, top: view.y - t.row(cell.r) * L * z,
              width, height: t.heights[cell.r] * L * z, ...textFace(sh, size), color: sh.colour ?? style.colour,
              textAlign: align === "centre" ? "center" : align, padding: `0 ${TABLE_PAD * t.f * L * z}px`,
            }}
            onChange={(e) => setCell({ ...cell, value: e.target.value })}
            onKeyDown={(e) => {
              const i = cell.r * cols + cell.c;
              if (e.key === "Tab") {
                e.preventDefault();
                // Forwards, Tab steps over the entry numbers the table filled in itself.
                let j = e.shiftKey ? Math.max(0, i - 1) : i + 1;
                if (!e.shiftKey && j % cols === 0 && cols > 1 && (sh.table!.cells[j / cols]?.[0] ?? String(j / cols)) === String(j / cols)) j++;
                return commitCell([Math.floor(j / cols), j % cols]);
              }
              if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); return cell.r + 1 < t.rows ? commitCell([cell.r + 1, cell.c]) : commitCell(); }
              if (e.key === "ArrowUp") { e.preventDefault(); return commitCell([Math.max(0, cell.r - 1), cell.c]); }
              if (e.key === "Escape") { e.preventDefault(); return commitCell(); }
            }}
            onBlur={(e) => { if (!inMap(e.relatedTarget)) commitCell(); }}
          />
        );
      }}</Live>}
      {writing && <Live store={views}>{(view) => {
        // The caption box sits exactly over the caption, in its font at the current zoom, so typing is in place.
        const c = placed.find((x) => x.id === (writing.id ?? DRAFT));
        if (!c) return null;
        // Its lines as far apart as the caption's line spacing puts them (the first two lines' gap), each baseline where
        // the canvas draws it: the leading split above and below Arial's ascent and descent. A turned caption's box
        // turns with it, about its pivot.
        const z = view.zoom, size = c.size * z, slack = 0.5 * size, gap = c.lines.length > 1 ? c.lines[1].y - c.lines[0].y : 1.2 * c.size, lead = (gap - 1.117 * c.size) / 2 + 0.905 * c.size;
        // A caption with a width wraps in the box as it does on the canvas: the box is that wide, from its anchor.
        const own = writing.id !== undefined ? doc.captions?.find((x) => x.id === writing.id) : undefined, wrapAt = (writing.style.width ?? own?.width ?? 0) * L, b = c.frame ?? c.box;
        const x0 = !wrapAt ? b[0] : c.anchor === "end" ? c.lines[0].x - wrapAt : c.anchor === "middle" ? c.lines[0].x - wrapAt / 2 : c.lines[0].x;
        const left = view.x + x0 * z - slack, top = view.y + (c.lines[0].y - lead) * z;
        return (
          <>
          <RichBox
            key={writing.at ? writing.at.join(" ") : undefined} // a new box for each caption Tab starts
            returnNewLine={!settings.captionOptionReturn}
            runs={writing.runs ?? [{ text: writing.value }]}
            version={writing.version ?? 0}
            caret={writing.caret}
            pending={writing.pending}
            api={richApi}
            look={(r) => ({
              fontWeight: r.bold ? "bold" : "", fontStyle: r.italic ? "italic" : "", textDecoration: r.underline ? "underline" : "",
              fontFamily: r.font ? fontStack(r.font) : "", color: r.colour ?? "", verticalAlign: r.script === "sub" ? "sub" : r.script === "super" ? "super" : "",
              fontSize: r.size ? `${r.size * pt * z * (r.script ? 0.75 : 1)}px` : r.script ? "75%" : "",
            })}
            style={{
              left, top,
              width: (wrapAt || b[2] - b[0]) * z + 2 * slack,
              ...(c.angle && c.pivot ? { transform: `rotate(${-c.angle}deg)`, transformOrigin: `${view.x + c.pivot[0] * z - left}px ${view.y + c.pivot[1] * z - top}px` } : {}),
              whiteSpace: wrapAt ? "pre-wrap" : undefined,
              height: c.lines.length * gap * z,
              font: `${c.italic ? "italic " : ""}${c.bold ? "bold " : ""}${size}px/${gap * z}px ${fontStack(c.font ?? style.captionFont)}`,
              color: c.colour ?? style.colour,
              padding: `0 ${slack}px`,
              textDecoration: c.underline ? "underline" : undefined,
              textAlign: (writing.style.align ?? own?.align) === "justify" ? "justify" : c.anchor === "start" ? "left" : c.anchor === "end" ? "right" : "center",
            }}
            onRuns={(runs, rebuild) => setWriting((w) => w && { ...w, runs, value: plainOf(runs), ...(rebuild ? { version: (w.version ?? 0) + 1, caret: rebuild, pending: undefined } : {}) })}
            onOffer={(start, plain, runs) => setPasteOffer({ start, plain, runs })}
            onKeyDown={(e) => {
              // With a citation just pasted: ⇧⌘V keeps its formatting; any other key goes on with it plain.
              if (pasteOffer) {
                if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "v") { e.preventDefault(); return keepFormatting(); }
                if (!["Shift", "Meta", "Control", "Alt"].includes(e.key)) setPasteOffer(undefined);
              }
              // Return reaches here only when it does not make a new line (Settings: Option-Return for a new line).
              if (e.key === "Enter" && !e.shiftKey && !e.altKey) { e.preventDefault(); commitWriting(); }
              if (e.key === "Tab" && !e.shiftKey && tabSide()) e.preventDefault();
              else if (e.key === "Tab" && !e.shiftKey && writing.at && writing.id === undefined) { e.preventDefault(); tabCaption(); }
              if (e.key === "Escape") { e.preventDefault(); commitWriting(); } // Escape keeps the text, as a click elsewhere does
              // ChemDraw's text keys. The text box takes them first (in the app too: the web view gets the keystroke before
              // the Text menu does), and marks them so the same command from the menu does not run twice.
              if (TAURI ? (MAC ? e.metaKey : e.ctrlKey) : e.metaKey || e.ctrlKey) {
                const command = textKey(e, false);
                if (command) {
                  e.preventDefault();
                  if (TAURI) pageRan.current = { id: command.startsWith("caption.") ? `text_${command.slice(8)}` : command, at: performance.now() };
                  runAction(command);
                }
              }
            }}
            onBlur={() => commitWriting()}
          />
          {pasteOffer && (
            <div className="paste-offer" style={{ left: left + slack, top: top + c.lines.length * gap * z + 8 }} onPointerDown={(e) => e.preventDefault()}>
              <div className="segmented" role="radiogroup" aria-label="Paste">
                <button type="button" role="radio" aria-checked="true" tabIndex={-1} data-tip="" onClick={() => setPasteOffer(undefined)}>Plain text</button>
                <button type="button" role="radio" aria-checked="false" tabIndex={-1} data-tip="Keep formatting" data-key={`⇧${MOD}V`} onClick={keepFormatting}>Keep formatting</button>
              </div>
            </div>
          )}
          </>
        );
      }}</Live>}
      <Exit>{charMap && <CharMap focus={charFocus.current} onClose={() => setCharMap(false)} />}</Exit>
      <Exit>{naming !== undefined && seqParts && (
        // A sequence's kind and ends, under the field. The field keeps the focus, so the codes go on being typed. Another
        // kind starts with the usual ends: an N-acetyl is not a 5'-phosphate.
        <div className="name-options" role="toolbar" aria-label="Sequence" onPointerDown={(e) => e.preventDefault()}>
          <span className="name-kinds" role="radiogroup" aria-label="Kind">
            {(Object.keys(SEQUENCES) as SeqKind[]).map((k) => (
              <button key={k} type="button" role="radio" tabIndex={-1} aria-checked={seqParts.kind === k} onClick={() => chooseSequence({ ...seqParts, kind: k, start: false, end: false })}>{SEQUENCES[k].name}</button>
            ))}
          </span>
          {(["start", "end"] as const).map((end, i) => (
            <button key={end} type="button" tabIndex={-1} aria-pressed={seqParts[end]} onClick={() => chooseSequence({ ...seqParts, [end]: !seqParts[end] })}>{SEQ_ENDS[seqParts.kind][i]}</button>
          ))}
          {/* Off: every atom (issue 27). On: one label for each residue, as ChemDraw draws a sequence. Kept for next time. */}
          <button type="button" tabIndex={-1} aria-pressed={settings.sequenceLabels} onClick={() => setSettings((s) => ({ ...s, sequenceLabels: !s.sequenceLabels }))}>Residue labels</button>
        </div>
      )}</Exit>
      <Exit>{naming !== undefined && nameNote && (
        // A wrong CAS check digit, or the wait for PubChem, under the field where a suggestion shows.
        <p className={seqParts ? "name-suggestion lower" : "name-suggestion"} aria-live="polite"><span>{nameNote}</span></p>
      )}</Exit>
      <Exit>{naming !== undefined && !nameNote && suggestion && !nameToSmiles(naming) && (() => {
        // The suggested name under the field, with the letters it adds or changes marked. Tab takes it.
        const typed = naming.trim().toLowerCase(), name = suggestion;
        let a = 0, b = 0;
        while (a < typed.length && a < name.length && typed[a] === name[a].toLowerCase()) a++;
        while (b < typed.length - a && b < name.length - a && typed[typed.length - 1 - b] === name[name.length - 1 - b].toLowerCase()) b++;
        return (
          <p className="name-suggestion" aria-live="polite">
            <span>{name.slice(0, a)}<mark>{name.slice(a, name.length - b)}</mark>{name.slice(name.length - b)}</span>
            <kbd>Tab</kbd>
          </p>
        );
      })()}</Exit>
      <Exit>{naming !== undefined && (historyRows.length > 0) && (
        // Names drawn before, newest first, matching what is typed. The field keeps focus while a row is clicked.
        <div className={["name-history", (nameNote || (suggestion && !nameToSmiles(naming))) && "below", seqParts && "lower", recent.all && "all"].filter(Boolean).join(" ")} role="listbox" aria-label="Recent names" onPointerDown={(e) => e.preventDefault()}>
          {historyRows.map((entry, i) => {
            const mol = historyMol(entry), name = entry.name;
            return (
              <div key={name} role="option" aria-selected={recent.at === i} className="name-recent" onPointerMove={() => setRecent((h) => ({ ...h, at: i }))} onClick={() => pickHistory(entry)}>
                <span className="name-thumb">{mol ? <StructureThumb id={`name:${name}`} mol={mol} /> : <ClockCounterClockwise size={16} />}</span>
                <span className="name-text">{name}</span>
                <button className="name-forget" aria-label={`Remove ${name}`} data-tip="Remove" onClick={(e) => { e.stopPropagation(); setSettings((s) => ({ ...s, nameHistory: s.nameHistory.filter((n) => n.name !== name) })); }}>
                  <X size={12} />
                </button>
              </div>
            );
          })}
          {historyMore && (
            <div role="option" aria-selected={recent.at === historyRows.length} className="name-recent show-all" onPointerMove={() => setRecent((h) => ({ ...h, at: historyRows.length }))} onClick={() => setRecent({ all: true, at: -1 })}>
              <span className="name-thumb"><CaretDown size={12} /></span>
              <span className="name-text">Show all {historyMatches.length}</span>
            </div>
          )}
        </div>
      )}</Exit>
      <Exit>{naming !== undefined && (
        <input
          ref={nameField}
          className="name-field"
          aria-label="Chemical name"
          aria-invalid={!!naming.trim() && namesLoaded && !named && !later}
          aria-busy={placing === naming || undefined}
          placeholder="Name"
          autoFocus
          spellCheck={false}
          value={naming}
          onChange={(e) => { setNaming(e.target.value); setRecent((h) => ({ ...h, at: -1 })); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setNaming(undefined); }
            if (e.key === "Tab" && suggestion) { e.preventDefault(); setNaming(suggestion); }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = historyRows.length + (historyMore ? 1 : 0);
              if (n) setRecent((h) => ({ ...h, at: e.key === "ArrowDown" ? Math.min(n - 1, h.at + 1) : Math.max(-1, h.at - 1) }));
            }
            if (e.key === "Enter" && recent.at === historyRows.length && historyMore) { e.preventDefault(); return setRecent({ all: true, at: -1 }); }
            // ⇧⌘N draws the name too (in the browser; the app's menu does it there).
            const again = !TAURI && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "n";
            if (e.key !== "Enter" && !again) return;
            e.preventDefault();
            if (drawNamed()) return;
            // Not a name Octet can read: the field shakes.
            shake(e.currentTarget);
          }}
          onBlur={() => setNaming(undefined)}
        />
      )}</Exit>
      <Exit>{settingsOpen && (
        // Making a template (Custom template on Home), the window shows its Document settings alone and changes the
        // template: For starts it again from another template, and its outlines follow.
        <SettingsWindow
          module={madeTemplate ? "document" : settingsOpen}
          onModule={(m) => { setSettingsOpen(m); setSettings((s) => ({ ...s, settingsModule: m })); }}
          template={madeTemplate?.name}
          style={madeTemplate?.style ?? style}
          isDefault={sameStyle(style, styleFor(settings, purposeOf(settings, style.purpose) ? style.purpose! : QUICK))}
          preview={preview}
          onStyle={(next) => (madeTemplate ? changeTemplate(madeTemplate.id, { style: next }) : set({ ...scaleSizes(doc, next.scale / style.scale), style: next }, true))}
          onDefault={() => keepForNew(style)}
          purposes={purposeList}
          onPurpose={(id) => (!madeTemplate ? applyPurpose(id)
            : id !== madeTemplate.id && changeTemplate(madeTemplate.id, { kind: purposeOf(settings, id)?.kind ?? "paper", style: forPurpose(madeTemplate.style, styleFor(settings, id)) }))}
          onSavePurpose={!madeTemplate && settings.ownPurposes.length < MAX_PURPOSES ? savePurpose : undefined}
          ownTemplates={madeTemplate ? [] : settings.ownPurposes}
          onRenameTemplate={(id, name) => setSettings((s) => ({ ...s, ownPurposes: s.ownPurposes.map((x) => (x.id === id ? { ...x, name } : x)) }))}
          onRemoveTemplate={removePurpose}
          dictionary={settings.dictionary}
          onRenameName={(from, to) => setSettings((s) => ({ ...s, dictionary: renameOwnName(s.dictionary, from, to) }))}
          onRemoveName={(name) => setSettings((s) => ({ ...s, dictionary: withoutOwnName(s.dictionary, name) }))}
          onExportNames={() => void exportNames()}
          onImportNames={() => void importNames()}
          onApplyFile={TAURI && !madeTemplate ? () => void applyStyleFile() : undefined}
          keys={settings.keys}
          onKeys={(keys) => setSettings((s) => ({ ...s, keys }))}
          files={settings.files}
          onFiles={(files) => setSettings((s) => ({ ...s, files }))}
          drawing={drawingPrefs}
          onDrawing={(patch) => setSettings((s) => ({ ...s, ...patch }))}
          captionOptionReturn={settings.captionOptionReturn}
          onCaptionOptionReturn={(captionOptionReturn) => setSettings((s) => ({ ...s, captionOptionReturn }))}
          labelReturnNewLine={!!settings.labelReturnNewLine}
          onLabelReturnNewLine={(labelReturnNewLine) => setSettings((s) => ({ ...s, labelReturnNewLine }))}
          panelMenus={settings.panelMenus}
          onPanelMenus={(panelMenus) => setSettings((s) => ({ ...s, panelMenus }))}
          onlineSearch={settings.onlineSearch}
          onOnlineSearch={(onlineSearch) => setSettings((s) => ({ ...s, onlineSearch }))}
          rulerUnit={settings.rulerUnit}
          onRulerUnit={(rulerUnit) => setSettings((s) => ({ ...s, rulerUnit }))}
          selectColour={settings.selectColour}
          onSelectColour={(selectColour) => setSettings((s) => ({ ...s, selectColour }))}
          outlines={settings.outlines}
          onOutlines={(outlines) => setSettings((s) => ({ ...s, outlines }))}
          menuKeys={menuReady ? [] : Object.values(MENU_NAMES).flatMap(([name, keys]) => (keys ? [[name, platformLabel(keys)!] as [string, string]] : []))}
          palette={settings.palette}
          onPalette={(palette) => setSettings((s) => ({ ...s, palette }))}
          elementColours={settings.elementColours}
          onElementColours={(elementColours) => setSettings((s) => ({ ...s, elementColours }))}
          warnings={settings.warnings}
          onWarnings={(warnings) => setSettings((s) => ({ ...s, warnings }))}
          warningTypes={settings.warningTypes}
          onWarningTypes={(warningTypes) => setSettings((s) => ({ ...s, warningTypes }))}
          checkCopy={settings.checkCopy}
          windows={settings.windows} onWindows={(windows) => setSettings((s) => ({ ...s, windows }))}
          cursor={settings.cursor} onCursor={(cursor) => setSettings((s) => ({ ...s, cursor }))}
          onCheckCopy={(checkCopy) => setSettings((s) => ({ ...s, checkCopy }))}
          adding={addingColour}
          updates={settings.updates === true}
          onUpdates={(updates) => setSettings((s) => ({ ...s, updates }))}
          onCheckUpdates={() => checkUpdates(true)}
          onClose={() => { setSettingsOpen(undefined); setAddingColour(false); setMaking(undefined); }}
        />
      )}</Exit>
      {/* The ring and the halo need different keys. With the same key, React leaves an old ring on the page. */}
      {holding && (
        <svg key={`hold${holding.n}`} className="hold-ring" style={{ left: holding.x, top: holding.y, "--hold": `${HOLD_MS}ms` } as React.CSSProperties} viewBox="0 0 32 32" aria-hidden>
          <circle cx={16} cy={16} r={13} pathLength={1} />
        </svg>
      )}
      {pop && <span key={pop.n} className="halo" style={{ left: pop.x, top: pop.y }} aria-hidden />}

      <Palette
        tool={tool}
        coach={coachTool}
        variants={{ select: selectKind, bond: bondKind, ring: ringKind, template: templateVariant, symbol: symbolKind, orbital: orbitalChoice, shape: shapeChoice, bracket: bracketChoice, cycle: cycleChoice, sequence: sequenceChoice, more: settings.variants.more ?? "tlc", arrow: arrowVariant(settings.variants.arrow) ? settings.variants.arrow : "reaction" }}
        curvedArrows={settings.curvedArrows}
        onCurvedArrows={(curvedArrows) => setSettings((s) => ({ ...s, curvedArrows }))}
        libraryRings={settings.libraryRings}
        onLibraryRings={(libraryRings) => setSettings((s) => ({ ...s, libraryRings }))}
        templates={templates}
        templateSets={settings.templateSets}
        onTemplateSets={templateSets}
        pinned={settings.pinned}
        onPinned={(pinned) => setSettings((s) => ({ ...s, pinned }))}
        canAddSelection={selection.size > 0 || picked.size > 0}
        reveal={reveal}
        preview={(name) => structureFor(name) ?? (() => { const s = suggestName(name, false); return s ? structureFor(s) : undefined; })()}
        onAddName={(typed) => {
          // A misspelt name is added with its corrected spelling.
          const name = nameToSmiles(typed) ? typed : suggestName(typed);
          const m = name && structureFor(name);
          if (!name || !m) return false;
          addOwnTemplate(name.charAt(0).toUpperCase() + name.slice(1), m);
          return true;
        }}
        onAdd={addToSet}
        onRename={(id, name) => setSettings((s) => renameTemplate(s, id, name))}
        onCopy={(kind, set, tool) => { const m = libraryItem(kind)?.mol ?? namedOf(kind); if (m) addPart(m, set, tool, libraryItem(kind)?.name ?? kindName(kind)); }}
        named={namedOf}
        findNamed={findNamed}
        onNewSet={askSet}
        onRemoveTemplate={removeRingTemplate}
        onEditTemplate={editTemplate}
        onDuplicate={(id) => setSettings((s) => duplicateTemplate(s, id))}
        onPlace={(id, before) => setSettings((s) => placeTemplate(s, id, before))}
        onToStart={(id) => setSettings((s) => templateToStart(s, id))}
        onToEnd={(id) => setSettings((s) => templateToEnd(s, id))}
        palettes={home ? [] : settings.palettes.filter((f) => menuSets.includes(f.set))}
        onPalettes={(change) => setSettings((s) => ({ ...s, palettes: change(s.palettes) }))}
        onKeepOpen={keepOpen}
        onReveal={showLibrary}
        librarySize={settings.librarySize}
        onLibrarySize={(librarySize) => setSettings((s) => ({ ...s, librarySize }))}
        onSaveSet={saveTemplateSet}
        popKey={pop?.n ?? 0}
        canUndo={h.at > 0}
        canRedo={h.at < h.stack.length - 1}
        keys={hint}
        onTool={setTool}
        onVariant={(t, kind) => setSettings((s) => ({ ...s, variants: { ...s.variants, [t]: kind } }))}
        onUndo={() => undo()}
        onRedo={() => undo(true)}
        onDrop={(x, y) => setDropAt([x, y])}
        wide={settings.paletteWide}
        onWide={(wide) => setSettings((s) => ({ ...s, paletteWide: wide }))}
        stripWidths={settings.strips}
        onStripWidth={(t, width) => setSettings((s) => ({ ...s, strips: { ...s.strips, [t]: width } }))}
      />

      <Exit>{spectrum && <Live store={hovers}>{(hover) => (
        <SpectrumPanel
          spectrumKey={spectrum}
          keys={[...new Set(["1H", "13C", ...(doc.spectra ?? []).map(spectrumKeyOf)])]}
          onKey={(k) => { setSpectrum(k); setChosenGroup(undefined); setGroupPoint(undefined); }}
          prediction={nmr?.prediction}
          mhz={settings.nmrMhz}
          solvent={nmrSolvent}
          lit={new Set([hover.atom, ...(groupPoint !== undefined ? linkedAtoms.get(groupPoint) ?? [] : [])].flatMap((d) => [...nmrLit(d)]))}
          onMhz={(mhz) => setSettings((s) => ({ ...s, nmrMhz: mhz }))}
          onSolvent={(solvent) => { setSettings((s) => ({ ...s, nmrSolvent: solvent })); if (measured?.kind === "nmr") setMeasured(regroup({ ...measured, solvent }, measured.threshold, nextGroupId(doc.spectra))); }}
          onPoint={setNmrPoint}
          onCopy={(text) => runAction(`copy_text:${text}`)}
          onClose={() => { setSpectrum(undefined); setNmrPoint(undefined); setGroupPoint(undefined); setChosenGroup(undefined); }}
          measured={measured}
          analysis={spectrumAnalysis}
          show={spectrumShow}
          onShow={setSpectrumShow}
          litGroups={new Set([...[hover.atom, ...(nmr && nmrPoint ? nmrPoint.map((k) => nmr.toDoc[k]) : [])].flatMap((d) => (d !== undefined ? doc.atoms[d]?.peaks ?? [] : [])), ...(hover.bond !== undefined ? doc.bonds[hover.bond]?.peaks ?? [] : [])])}
          groupColour={linkColour}
          linkedCount={(id) => (linkedAtoms.get(id)?.length ?? 0) + (linkedBonds.get(id)?.length ?? 0)}
          linkedBondCount={(id) => linkedBonds.get(id)?.length ?? 0}
          chosenGroup={chosenGroup}
          onChooseGroup={(id) => {
            // With atoms selected, a click on a multiplet links them and the bonds between them to it (as ChemDraw's
            // Make Spectrum-Structure Assignment does with its selection).
            if (id !== undefined && selection.size) { linkTo(id, [...selection], doc.bonds.flatMap((b, k) => (selection.has(b.atoms[0]) && selection.has(b.atoms[1]) ? [k] : [])), false); setSelection(new Set()); }
            setChosenGroup(id);
          }}
          onPointGroup={setGroupPoint}
          onThreshold={(t) => measured && setMeasured(regroup(measured, t, nextGroupId(doc.spectra)), spectrum, "spectrum threshold")}
          onDefine={(lo, hi) => measured && setMeasured(defineGroup(measured, lo, hi, nextGroupId(doc.spectra)))}
          onCount={(id, n) => { const g = spectrumAnalysis?.groups.find((x) => x.id === id); if (measured && g && g.area > 0) setMeasured({ ...measured, per: g.area / n }); }}
          onLinkHover={(at) => { const t: Hover = at ? hit(toDoc(...at)) : {}; setLinkAtom(t.atom); setLinkBond(t.atom === undefined ? t.bond : undefined); }}
          onLinkAt={(id, at) => { const t = hit(toDoc(...at)); setLinkAtom(undefined); setLinkBond(undefined); if (t.atom !== undefined) linkTo(id, [t.atom], [], false); else if (t.bond !== undefined) linkTo(id, [], [t.bond], false); }}
          onUnlink={(id) => linkTo(id, linkedAtoms.get(id) ?? [], linkedBonds.get(id) ?? [], true)}
          onGroupColour={(id, c) => { const atoms = new Set(linkedAtoms.get(id) ?? []), bonds = new Set(linkedBonds.get(id) ?? []); set({ ...doc, atoms: doc.atoms.map((a, i) => (atoms.has(i) ? { ...a, halo: c } : a)), bonds: doc.bonds.map((b, k) => (bonds.has(k) ? { ...b, halo: c } : b)) }, true); }}
          onGroupColourAll={(on) => {
            const colour = new Map<number, string | undefined>(), bondColour = new Map<number, string | undefined>();
            (spectrumAnalysis?.groups ?? []).filter((g) => linkedAtoms.get(g.id) || linkedBonds.get(g.id)).forEach((g, k) => {
              const c = on ? PEAK_COLOURS[k % PEAK_COLOURS.length] : undefined;
              for (const i of linkedAtoms.get(g.id) ?? []) colour.set(i, c);
              for (const b of linkedBonds.get(g.id) ?? []) bondColour.set(b, c);
            });
            set({ ...doc, atoms: doc.atoms.map((a, i) => (colour.has(i) ? { ...a, halo: colour.get(i) } : a)), bonds: doc.bonds.map((b, k) => (bondColour.has(k) ? { ...b, halo: bondColour.get(k) } : b)) }, true);
          }}
          onRemove={() => { setMeasured(undefined); setChosenGroup(undefined); setGroupPoint(undefined); if (!nucleusOpen) setSpectrum(undefined); }}
          inset={(() => {
            // The structure's box on the canvas (px, unzoomed), with room for its shift labels.
            const ps = [...new Set(nmr?.toDoc ?? [])].filter((i) => i < shown.atoms.length).map((i) => pos(shown, i));
            if (!ps.length) return undefined;
            const xs = ps.map((q) => q[0] * L), ys = ps.map((q) => -q[1] * L), pad = 2.6 * L;
            return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad] as [number, number, number, number];
          })()}
          solventPeaks={settings.nmrSolventPeaks}
          colours={nmrColours}
          details={settings.nmrDetails}
          onDetails={(on) => setSettings((s) => ({ ...s, nmrDetails: on }))}
          onColour={(k, c) => haloSignals(() => c, k)}
          onColourAll={(on) => haloSignals((k) => (on ? PEAK_COLOURS[k % PEAK_COLOURS.length] : undefined))}
          onAdd={(what, range) => (what === "key" ? addKey() : what === "shifts" ? addShifts() : addSpectrum(range))}
          onSolventPeaks={(on) => setSettings((s) => ({ ...s, nmrSolventPeaks: on }))}
          labels={settings.nmrLabels}
          onLabels={(t) => setSettings((s) => ({ ...s, nmrLabels: t }))}
        />
      )}</Live>}</Exit>
      <Exit>{msAtoms && <Live store={hovers}>{(hover) => (
        <MassSpecPanel mol={doc} atoms={msAtoms} ready={loaded} prefs={settings.massSpec} lit={hover.atom} peaks={msMeasured}
          tab={msTab && tool === "massspec" && msTab.atom === hover.atom && msTab.bond === hover.bond ? msTab : undefined}
          onPrefs={(massSpec) => setSettings((s) => ({ ...s, massSpec }))} onPoint={setMsPoint} onCopy={(text) => runAction(`copy_text:${text}`)} onAdd={addMassSpec}
          onClose={() => { setMassSpec(undefined); setMsPoint(undefined); }} />
      )}</Live>}</Exit>
      <Exit>{settings.properties && properties && (
        <Properties
          values={properties.values}
          chosen={settings.propertyRows}
          onChoose={(key) => setSettings((s) => ({ ...s, propertyRows: s.propertyRows.includes(key) ? s.propertyRows.filter((k) => k !== key) : [...s.propertyRows, key] }))}
          onCopy={(text) => runAction(`copy_text:${text}`)}
          onAdd={addProperties}
          onClose={() => setSettings((s) => ({ ...s, properties: false }))}
          stacked={!!spectrum}
          decimals={settings.decimals}
          onDecimals={(decimals) => setSettings((s) => ({ ...s, decimals }))}
        />
      )}</Exit>
      <Live store={carets}>{() => {
        const context = panelContext ?? contextOf();
        return (
          <Actions
            open={settings.actions}
            context={context}
            analysis={analysis}
            problems={found}
            fonts={fontList}
            hiddenWarnings={hiddenHere()}
            warned={selectedOf(found).length}
            online={settings.onlineSearch}
            messy={untidy}
            hint={hint}
            onOpen={(open) => setSettings((s) => ({ ...s, actions: open }))}
            layout={settings.actionLayout}
            onLayout={(kind, layout) => setSettings((s) => ({ ...s, actionLayout: { ...s.actionLayout, [kind]: layout } }))}
            colour={selectionColour(context)}
            menus={settings.panelMenus}
            folded={settings.folded}
            onFold={(id, folded) => setSettings((s) => ({ ...s, folded: folded ? [...s.folded.filter((k) => k !== id), id] : s.folded.filter((k) => k !== id) }))}
            grouping={grouping}
            palette={[...settings.palette, ...docColours]}
            sizes={sizeList}
            scale={selectionScale()}
            run={runAction}
          />
        );
      }}</Live>
      <Exit>{sideAsk && (
        <ContextMenu label="Side arrow" at={sideAsk} keyboard sub={() => undefined} onClose={() => setSideAsk(undefined)} onChoose={(k) => chooseSide(sideAsk, k as "in" | "out" | "both")}
          groups={[sideAsk.choices.map((k) => ({ key: k, name: { in: "Reagent", out: "Product", both: "Reagent and product" }[k], icon: <SideGlyph ends={k} /> }))]} />
      )}</Exit>
      <Exit>{menuAt && (() => {
        const context = panelContext ?? contextOf();
        return <ActionsMenu at={menuAt} keyboard={menuAt.keyboard} context={context} messy={untidy} hiddenWarnings={hiddenHere()} warned={selectedOf(found).length} grouping={grouping}
          layout={settings.actionLayout} hint={hint} colour={selectionColour(context)} palette={[...settings.palette, ...docColours]} online={settings.onlineSearch} templateSets={settings.templateSets} run={runAction} onClose={() => setMenuAt(undefined)} />;
      })()}</Exit>
      <Exit>{dialog?.kind === "rf" && (
        // Set Rf…, as ChemDraw's: the spot moves to the Rf typed.
        <Dialog title="Set Rf" action="Set" onClose={() => setDialog(undefined)}
          onAction={() => { const v = Number(dialog.value); if (v >= 0 && v <= 1) set(editSpot(doc, dialog.plate, dialog.index, () => ({ rf: Math.round(v * 1000) / 1000 })), true); setDialog(undefined); }}>
          <label className="dialog-row">
            <span>Rf</span>
            <NumberField label="Rf" min={0} max={1} step={0.01} value={Number(dialog.value)} onChange={(n) => setDialog({ ...dialog, value: String(n) })} />
          </label>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "details" && (
        // An experiment's details (experiment.ts), kept as the document's annotations.
        <Dialog title="Experiment details" action="Save" onClose={() => setDialog(undefined)}
          onAction={() => { const next = withDetails(doc.annotations, Object.fromEntries(Object.entries(dialog.values).map(([k, v]) => [k, v && expandEscapes(v, keptText(detailsOf(doc.annotations)[k as keyof Details]))]))); if (JSON.stringify(next) !== JSON.stringify(doc.annotations)) set({ ...doc, annotations: next }, true); setDialog(undefined); }}>
          {DETAILS.map(([k, name]) => (
            <label key={k} className="dialog-row"><span>{name}</span><span className="unit-field text"><input aria-label={name} value={dialog.values[k] ?? ""} maxLength={200} spellCheck={false} onChange={(e) => setDialog({ ...dialog, values: { ...dialog.values, [k]: e.target.value } })} /></span></label>
          ))}
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "rotate" && (
        <Dialog title="Rotate" action="Rotate" onClose={() => setDialog(undefined)}
          onAction={() => { const a = Number(dialog.angle); if (Number.isFinite(a)) rotateBy(dialog.clockwise ? -a : a); setDialog(undefined); }}>
          <label className="dialog-row">
            <span>Angle</span>
            <NumberField label="Angle" unit="°" min={-360} max={360} step={1} value={Number(dialog.angle)} onChange={(n) => setDialog({ ...dialog, angle: String(n) })} />
          </label>
          <Segmented label="Direction" value={dialog.clockwise ? "cw" : "ccw"} options={[["ccw", "Anticlockwise"], ["cw", "Clockwise"]]} onChange={(v) => setDialog({ ...dialog, clockwise: v === "cw" })} />
        </Dialog>
      )}</Exit>
      {(home || homeLeaving) && (homeKind.current === "name"
        ? <NameBox leaving={!home} onDone={(userName) => { setSettings((s) => ({ ...s, userName, seenNotes: version })); setWelcomed(true); if (!settings.tutorialDone) startTutorial(); }} />
        : <Home leaving={!home} name={settings.userName ?? ""} first={welcomed} away={away} recents={recents} newKey={keyLabel("enter")} openKey={hint("open")}
            back={overDrawing ? { name, key: keyLabel("escape"), go: () => setHome(false) } : undefined}
            recovered={recovered} onRecovered={openRecovered} onDiscard={(entries, recents = []) => setDialog({ kind: "discard", entries, recents })} selectAll={homeSelectAll}
            purposes={purposeList} onNew={newDrawing} onOpen={openDrawing} onRecent={openRecent} onStarter={(text) => (elsewhere ? inNew({ text }) : keepWork(() => load(undefined, text)))}
            windows={homeWindow ? openWindows : undefined} onWindow={(w: OpenWindow) => void invoke("window_show", { label: w.label }).catch(() => {})}
            onRemovePurpose={removePurpose}
            onCustom={settings.ownPurposes.length < MAX_PURPOSES ? () => setDialog({ kind: "template", name: "", from: purposeOf(settings, settings.purpose) ? settings.purpose : "paper" }) : undefined}
            onRemove={removeRecents}
            experiments={experiments} onRemoveExperiment={(path) => void homeCall("experiment_remove", { path }).then(refreshRecents).catch(() => {})}
            onExportExperiments={(list) => void exportFile({ name: "Experiments", format: "csv", csv: experimentsCsv(list) })
              .then((path) => { if (path) saved(path); }, (e) => setNotice(failure("Octet cannot export the experiments.", e)))}
            lib={library} drops={TAURI} palette={settings.palette}
            layout={settings.homeLayout} onLayout={(homeLayout) => setSettings((s) => ({ ...s, homeLayout }))} />)}
      <Exit>{coach > 0 && !home && (
        <Coach key={coach} doc={doc} selected={selection.size} seen={seen} keys={{ clean: hint("clean_up") ?? "", copy: keyLabel("mod+c") }} low={naming !== undefined}
          onTool={setCoachTool} onSkip={() => setCoach(0)} onFinish={() => { const fresh: Mol = { ...EMPTY, style: doc.style }; setCoach(0); set(fresh); setFile({ saved: fresh }); }} />
      )}</Exit>
      <Exit>{dialog?.kind === "templateSet" && (() => {
        // New set… (Add to templates and Move to): the set's name, then the template goes in it.
        const ok = freeSetName(settings, dialog.name);
        return (
          <Dialog title="New set" action="Add" disabled={!ok} onClose={() => setDialog(undefined)}
            onAction={() => { if (!ok) return; const d = dialog; setDialog(undefined); setSettings((s) => addSet(s, d.name)); d.then(setName(d.name)); }}>
            <label className="dialog-row"><span>Name</span><span className="unit-field text"><input aria-label="Name" value={dialog.name} maxLength={40} spellCheck={false} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} /></span></label>
          </Dialog>
        );
      })()}</Exit>
      <Exit>{dialog?.kind === "dictionary" && (() => {
        // Add to dictionary (ChemDraw's Add Structure to Dictionary, with its Enter Name field and Save): the name for
        // the structure. A name in the dictionary already is replaced, as ChemDraw asks; the dialog says so first. A name
        // Octet reads already then gives the user's structure.
        const name = cleanOwnName(dialog.name), there = name ? ownName(name) : undefined, octets = !!name && !there && !!nameToSmiles(name);
        const keepIt = () => {
          if (!name) return;
          const d = dialog;
          setDialog(undefined);
          setSettings((s) => ({ ...s, dictionary: withOwnName(s.dictionary, { name, smiles: d.smiles, ...(d.inchi ? { inchi: d.inchi } : {}) }) }));
          setNotice(`${name} is in your dictionary. Type it in Name to Structure to draw it.`, "done");
        };
        return (
          <Dialog title="Add to dictionary" action={there ? "Replace" : "Save"} disabled={!name} onClose={() => setDialog(undefined)} onAction={keepIt}>
            <label className="dialog-row"><span>Name</span><span className="unit-field text"><input aria-label="Name" value={dialog.name} maxLength={80} spellCheck={false} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} /></span></label>
            {there && <p className="dialog-note">Your dictionary has “{there.name}” already. Replace gives it this structure.</p>}
            {octets && <p className="dialog-note">Octet reads this name already. Your structure comes first.</p>}
          </Dialog>
        );
      })()}</Exit>
      <Exit>{templateEdit && (
        // A template open on the canvas (Edit): its name, Cancel and Save. Save is also File > Save (⌘S).
        <div className={naming !== undefined ? "template-bar low" : "template-bar"} role="region" aria-label="Template">
          <span className="template-bar-name"><NotePencil size={16} aria-hidden />{templateEdit.id ? templateEdit.name : `Copy of ${templateEdit.name}`}</span>
          <button className="dialog-button" onClick={endTemplateEdit}>Cancel</button>
          <button className="dialog-button primary" data-key={hint("save")} onClick={saveTemplateEdit} disabled={!templateDirty && !!templateEdit.id}>Save</button>
        </div>
      )}</Exit>
      <Exit>{dialog?.kind === "template" && (() => {
        // Custom template on Home: its name and the template it starts from. Continue saves it as a template and opens
        // its Document settings. A name must not be Quick start's or one of Octet's; the same name as one of the
        // user's own saves over it, as Save as template… does.
        const name = dialog.name.trim(), ok = !!name && !["Quick start", ...Object.values(PURPOSES).map((x) => x.name)].some((t) => t.toLowerCase() === name.toLowerCase());
        return (
          <Dialog title="Custom template" action="Continue" disabled={!ok} onClose={() => setDialog(undefined)}
            onAction={() => { if (!ok) return; setMaking(savePurpose(name, styleFor(settings, dialog.from))); setDialog(undefined); setSettingsOpen("document"); }}>
            <label className="dialog-row"><span>Name</span><span className="unit-field text"><input aria-label="Name" value={dialog.name} maxLength={40} spellCheck={false} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} /></span></label>
            <label className="dialog-row"><span>Start from</span>
              <Select label="Start from" value={dialog.from} options={purposeList.map((x): [string, string] => [x.id, x.name])} onChange={(from) => setDialog({ ...dialog, from })} />
            </label>
          </Dialog>
        );
      })()}</Exit>
      <Exit>{dialog?.kind === "unsaved" && (
        <Dialog title={`Save changes to “${name}”?`} action="Save" onClose={() => { const d = dialog; setDialog(undefined); d.stay?.(); }}
          alt={{ label: "Don’t Save", onClick: () => { const d = dialog; setDialog(undefined); d.next(); } }}
          onAction={() => { const d = dialog; setDialog(undefined); void save(false).then((ok) => (ok ? d.next() : d.stay?.())); }}>
          <p className="dialog-note">If you do not save, your changes are lost.</p>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "lossy" && (
        <Dialog title={`Replace “${file.path ? fileName(file.path) : name}”?`} action="Save As…" onClose={() => { const d = dialog; setDialog(undefined); d.done(false); }}
          alt={{ label: "Replace", onClick: () => { const d = dialog; setDialog(undefined); void save(false, true, true).then(d.done); } }}
          onAction={() => { const d = dialog; setDialog(undefined); void save(true).then(d.done); }}>
          <p className="dialog-note">Replace removes {lostText(dialog.lost)} from this file, because Octet cannot keep {Object.values(dialog.lost).reduce((a, b) => a + b, 0) > 1 ? "them" : "it"}. Save As keeps the original file.</p>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "changed" && (
        <Dialog title={`Another app changed “${file.path ? fileName(file.path) : name}”`} action="Save Anyway" onClose={() => { const d = dialog; setDialog(undefined); d.done(false); }}
          alt={{ label: "Save As…", onClick: () => { const d = dialog; setDialog(undefined); void save(true).then(d.done); } }}
          onAction={() => { const d = dialog; setDialog(undefined); void save(false, false, true).then(d.done); }}>
          <p className="dialog-note">Another app changed it after you opened or saved it. If you save, you lose the changes from the other app.</p>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "revert" && (
        <Dialog title={`Revert to the saved “${name}”?`} action="Revert" onClose={() => setDialog(undefined)} onAction={() => { setDialog(undefined); revert(); }}>
          <p className="dialog-note">Octet opens the file as you last saved it. Undo brings your changes back.</p>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "discard" && (
        <Dialog title={dialog.entries.length === 1 ? `Discard “${dialog.entries[0].name}”?` : `Discard ${dialog.entries.length} drawings?`} action="Discard" onClose={() => setDialog(undefined)}
          onAction={() => {
            const { entries, recents } = dialog, many = entries.length > 1;
            setDialog(undefined);
            void homeCall("recovery_discard", { ids: entries.map((r) => r.id) }).then(refreshRecents, (e) => { setNotice(failure(many ? "Octet cannot discard these drawings." : "Octet cannot discard this drawing.", e)); refreshRecents(); });
            if (recents.length) removeRecents(recents);
          }}>
          <p className="dialog-note">Octet keeps no other copy of these changes.{dialog.recents.length > 0 && ` The other ${dialog.recents.length === 1 ? "drawing leaves" : `${dialog.recents.length} drawings leave`} Home. Their files stay.`}</p>
        </Dialog>
      )}</Exit>
      {/* Email Log uses Feedback's email draft to Sam (for testers): not in the public release (REL-8). */}
      <Exit>{dialog?.kind === "crashed" && (
        <Dialog title="Octet stopped because of an error" action={__FEEDBACK__ ? "Email Log" : undefined} onClose={() => setDialog(undefined)}
          alt={{ label: "Show Log", onClick: () => void invoke("show_log").catch((e) => setNotice(failure("Octet cannot show the log.", e))) }}
          onAction={__FEEDBACK__ ? () => {
            const log = dialog.log;
            setDialog(undefined);
            void invoke("send_feedback", { note: `Octet stopped because of an error.\n\n${log}`, picture: null })
              .then(() => setNotice("The log is ready to send in your mail app.", "done"), (e) => setNotice(failure("Octet cannot make the email.", e)));
          } : undefined}>
          <p className="dialog-note">The log of the error is on this computer only. Octet sends nothing.{__FEEDBACK__ && " To help fix the error, email the log."}</p>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "update" && (
        <Dialog title={`Update to Octet ${dialog.version}?`} action="Update" onClose={() => setDialog(undefined)}
          onAction={() => { setDialog(undefined); if (openWindows.some((w) => w.edited)) return setNotice("Save or close your other drawings first. Octet restarts to update.", "info"); leave(() => {
            setNotice("Downloading the update.", "info");
            return invoke("update_install").catch((e) => { throw `Octet cannot install the update. ${e}`; });
          }); }}>
          <p className="dialog-note">Octet starts again after the update.</p>
        </Dialog>
      )}</Exit>
      <Exit>{about && <About onClose={() => setAbout(false)} onWhatsNew={ownNotes && (() => setNotes(true))} />}</Exit>
      <Exit>{notes && ownNotes && <WhatsNew release={ownNotes} onClose={() => setNotes(false)} />}</Exit>
      <Exit>{__FEEDBACK__ && feedback && <Feedback picture={feedback.picture} onClose={() => setFeedback(undefined)} onError={(e) => setNotice(failure("Octet cannot make your feedback.", e))}
        onSent={() => { setFeedback(undefined); setNotice("Your feedback is ready to send in your mail app.", "done"); }} />}</Exit>
      <FeedbackLink onOpen={() => void invoke("open_link", { name: "feedback" }).catch((e) => setNotice(failure("Octet cannot open your mail app.", e)))} />
      <ExportButton quick={filePrefs.quick} selected={!!(selection.size || picked.size)} hint={platformLabel(EXPORT_KEYS)} onQuick={() => checkFirst(() => void quickExport())} onExport={() => checkFirst(openExport)} />
      <Exit>{exportView && (
        <ExportDialog prefs={settings.files} onPrefs={(p) => setSettings((s) => ({ ...s, files: { ...s.files, ...p } }))} pictures={exportView} page={pageColour(style)}
          chemistry={(part) => {
            // The chosen format is made now, so the dialog says at once when it cannot be. The others are offered
            // when the part can have them, and made when they are chosen.
            const mol = exportView.parts[part], may = !!mol?.atoms.length && loaded, f = settings.files.format, steps = may && mol ? stepsIn(mol).length : 0;
            const has: Partial<Record<ExportFormat, boolean>> = { oct: true, cdxml: true, cdx: true, smi: may, inchi: may, ...Object.fromEntries(MDL.map((x) => [x, x.startsWith("rxn") ? steps === 1 : x.startsWith("rdf") ? steps > 0 : may])) };
            const pf: PartFormat | undefined = f === "oct" || f === "cdxml" || f === "cdx" || f === "inchi" ? f : f === "smi" ? "smiles" : MDL.includes(f) ? (f as PartFormat) : undefined;
            if (pf && mol) has[f] = !!formatOf(mol, pf);
            return has;
          }}
          onExport={(part) => void exportPart(part)} onClose={() => setExportView(undefined)} />
      )}</Exit>
      <Exit>{dialog?.kind === "atom" && (
        <Dialog title="Atom Properties" action="Apply" onClose={() => setDialog(undefined)}
          alt={{ label: "Use Defaults", onClick: () => setDialog({ ...dialog, charge: "0", isotope: "", radical: "0", stereo: "", group: "1", q: {}, reset: true }) }}
          onAction={() => {
            const d = dialog, a = doc.atoms[d.atom];
            if (!a) return setDialog(undefined);
            let m = d.element.trim() && d.element.trim() !== (a.text ?? a.label) ? setLabel(doc, d.atom, d.element.trim()) : doc;
            // ChemDraw's ranges: charge −8 to +8, an enhanced stereo group from 1 to 99.
            const charge = Math.max(-8, Math.min(8, Math.round(Number(d.charge) || 0))), isotope = Math.round(Number(d.isotope));
            const group = Math.max(1, Math.min(99, Math.round(Number(d.group)) || 1)), enhanced = d.stereo === "abs" ? "abs" : d.stereo ? `${d.stereo}${group}` : undefined;
            m = { ...m, atoms: m.atoms.map((x, k) => (k === d.atom ? { ...x, charge: charge || undefined, isotope: isotope >= 1 && isotope <= 300 ? isotope : undefined, radical: Number(d.radical) || undefined, enhanced } : x)) };
            // The query properties changed in the dialog, on every selected atom. After Use Defaults, every selected
            // atom starts from none.
            const changed = (Object.keys({ ...d.q, ...d.q0 }) as (keyof AtomQuery)[]).filter((k) => JSON.stringify(d.q[k]) !== JSON.stringify(d.q0[k]));
            if (changed.length || d.reset) m = { ...m, atoms: m.atoms.map((x, k) => {
              if (!d.targets.includes(k)) return x;
              const q: AtomQuery = d.reset ? {} : { ...x.query };
              for (const key of d.reset ? (Object.keys(d.q) as (keyof AtomQuery)[]) : changed) { if (d.q[key] === undefined) delete q[key]; else (q as Record<string, unknown>)[key] = d.q[key]; }
              return { ...x, query: anyQuery(q) ? q : undefined };
            }) };
            set(m, true);
            setDialog(undefined);
          }}>
          <label className="dialog-row"><span>Element</span><span className="unit-field text"><input aria-label="Element" value={dialog.element} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, element: e.target.value.slice(0, 40) })} /></span></label>
          <label className="dialog-row"><span>Charge</span><NumberField label="Charge" min={-8} max={8} step={1} value={Number(dialog.charge) || 0} onChange={(n) => setDialog({ ...dialog, charge: String(Math.round(n)) })} /></label>
          <label className="dialog-row"><span>Isotope</span><NumberField label="Isotope (mass number)" min={1} max={300} step={1} placeholder="Natural" value={dialog.isotope ? Number(dialog.isotope) : undefined}
            onChange={(n) => setDialog({ ...dialog, isotope: String(Math.round(n)) })} onClear={() => setDialog({ ...dialog, isotope: "" })} /></label>
          <div className="dialog-row"><span>Radical</span>
            <Segmented label="Radical" value={dialog.radical} options={[["0", "None"], ["1", "•", "Doublet"], ["2", "••", "Triplet"], ["3", ":", "Singlet"]]} onChange={(v) => setDialog({ ...dialog, radical: v })} />
          </div>
          {/* ChemDraw's Enhanced Stereochemistry, for a stereocentre: None, Absolute, Or or And, with a group number. */}
          {(stereocentres(doc).includes(dialog.atom) || doc.atoms[dialog.atom]?.enhanced) && (
            <div className="dialog-row"><span>Enhanced stereo</span>
              <Segmented label="Enhanced stereo" value={dialog.stereo} options={[["", "None"], ["abs", "Absolute"], ["or", "Or"], ["&", "And"]]} onChange={(v) => setDialog({ ...dialog, stereo: v })} />
            </div>
          )}
          {(dialog.stereo === "or" || dialog.stereo === "&") && (
            <label className="dialog-row"><span>Group</span><NumberField label="Group number" min={1} max={99} step={1} value={Number(dialog.group) || 1} onChange={(n) => setDialog({ ...dialog, group: String(Math.round(n)) })} /></label>
          )}
          {/* ChemDraw's atom query properties, for a search. Unset is ChemDraw's default for each. */}
          {(() => {
            const q = dialog.q, setQ = (k: keyof AtomQuery, v: unknown) => setDialog({ ...dialog, q: Object.fromEntries(Object.entries({ ...q, [k]: v }).filter(([, x]) => x !== undefined)) as AtomQuery });
            const row = (k: keyof AtomQuery & string, name: string, options: [string, string][]) => (
              <div className="dialog-row" key={k}><span>{name}</span><Select label={name} value={String(q[k] ?? "")} options={options} onChange={(v) => setQ(k, v === "yes" ? true : v || undefined)} /></div>
            );
            const yesNo = (k: keyof AtomQuery & string, name: string, no: string, yes: string) => (
              <div className="dialog-row" key={k}><span>{name}</span><Segmented label={name} value={q[k] ? "yes" : ""} options={[["", no], ["yes", yes]]} onChange={(v) => setQ(k, v ? true : undefined)} /></div>
            );
            return (
              <>
                <div className="dialog-row"><span>Substituents</span>
                  <Select label="Substituents" value={q.subst?.kind ?? ""} options={[["", "Unspecified"], ["free", "Free sites"], ["upto", "Up to"], ["exactly", "Exactly"]]}
                    onChange={(v) => setQ("subst", v ? { kind: v, n: q.subst?.n ?? 0 } : undefined)} />
                  {q.subst && <NumberField label="Substituents" min={0} max={15} step={1} value={q.subst.n} onChange={(n) => setQ("subst", { kind: q.subst!.kind, n: Math.round(n) })} />}
                </div>
                {yesNo("noH", "Implicit hydrogens", "Allowed", "Not allowed")}
                {row("rings", "Ring bond count", [["", "Any"], ["none", "No ring bonds"], ["drawn", "As drawn"], ["simple", "Simple ring"], ["fusion", "Fusion"], ["spiro", "Spiro or higher"]])}
                {row("unsat", "Unsaturation", [["", "Unspecified"], ["absent", "Must be absent"], ["present", "Must be present"]])}
                {yesNo("change", "Reaction change", "May be anything", "Must be as specified")}
                {row("stereo", "Reaction stereo", [["", "Any"], ["inversion", "Inversion"], ["retention", "Retention"]])}
                {row("translation", "Translation", [["", "Equal"], ["broad", "Broad"], ["narrow", "Narrow"], ["any", "Any"]])}
                {row("abundance", "Isotopic abundance", [["", "Unspecified"], ["any", "Any"], ["natural", "Natural"], ["enriched", "Enriched"], ["deficient", "Deficient"], ["nonnatural", "Nonnatural"]])}
                {yesNo("valence", "Abnormal valence", "Not allowed", "Allowed")}
              </>
            );
          })()}
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "contract" && (
        <Dialog title="Contract Label" action="Contract" onClose={() => setDialog(undefined)}
          onAction={() => {
            const d = dialog, text = d.text.trim();
            if (!text || !d.group.every((i) => doc.atoms[i])) return setDialog(undefined);
            // A known abbreviation that is not what is selected is checked once, as ChemDraw's Possible Error in Drawing.
            const smiles = labelSmiles(text), other = smiles && d.want && toInchi(`[Xe]${smiles}`) !== d.want;
            if (other && d.warn !== text) return setDialog({ ...d, warn: text });
            set(contractLabel(doc, d.keep, new Set(d.group), text));
            setSelection(new Set());
            setDialog(undefined);
          }}>
          <label className="dialog-row"><span>Label</span><span className="unit-field text"><input aria-label="Label" value={dialog.text} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, text: e.target.value.slice(0, 40) })} /></span></label>
          {dialog.warn && dialog.warn === dialog.text.trim() && <p className="dialog-note">{dialog.warn} is not the selected group. Select Contract again to use it.</p>}
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "bond" && (() => {
        const d = dialog, hbonds = d.bonds.every((k) => doc.bonds[k]?.type === BONDS.hydrogen.spec.type);
        return (
          <Dialog title="Bond Properties" action="Apply" onClose={() => setDialog(undefined)}
            alt={{ label: "Use Defaults", onClick: () => setDialog({ ...d, type: "single", position: "auto", topology: "", rxn: "" }) }}
            onAction={() => {
              let m = doc;
              for (const k of d.bonds) {
                if (!m.bonds[k]) continue;
                // A bond style keeps the bond's colour, highlight, topology and reaction centre (setBondSpec); a query
                // type keeps the drawn bond under it.
                if (d.type !== d.start.type) m = d.type in BONDS ? setBondSpec(m, k, BONDS[d.type as BondKind].spec) : { ...m, bonds: m.bonds.map((b, j) => (j === k ? { ...b, query: d.type as Bond["query"] } : b)) };
                if ((d.position !== d.start.position || d.type !== d.start.type) && m.bonds[k].type === 2) m = setPosition(m, k, d.position === "auto" ? undefined : d.position);
                if (d.topology !== d.start.topology || d.rxn !== d.start.rxn) m = { ...m, bonds: m.bonds.map((b, j) => {
                  if (j !== k) return b;
                  const x: Bond = { ...b, topology: (d.topology !== d.start.topology ? d.topology || undefined : b.topology) as Bond["topology"], rxn: (d.rxn !== d.start.rxn ? d.rxn || undefined : b.rxn) as Bond["rxn"] };
                  return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as Bond;
                }) };
              }
              set(m, true);
              setDialog(undefined);
            }}>
            <label className="dialog-row"><span>Bond type</span>
              <Select label="Bond type" value={d.type} onChange={(type) => setDialog({ ...d, type })}
                options={[...BOND_TYPES.filter((k) => k !== "hydrogen" || hbonds).map((k): [string, string] => [k, BONDS[k].name]), ["any", "Any"], ["sd", "Single or double"], ["da", "Double or aromatic"], ["sa", "Single or aromatic"]]} />
            </label>
            {d.type in BONDS && BONDS[d.type as BondKind].spec.type === 2 && (
              <label className="dialog-row"><span>Second line</span>
                <Select label="Second line" value={d.position} options={[["auto", "Automatic"], ["left", "Left"], ["centre", "Centre"], ["right", "Right"]]} onChange={(v) => setDialog({ ...d, position: v as "auto" })} />
              </label>
            )}
            <div className="dialog-row"><span>Topology</span>
              <Select label="Topology" value={d.topology} onChange={(topology) => setDialog({ ...d, topology })} options={[["", "Unspecified"], ["ring", "Ring"], ["chain", "Chain"], ["either", "Ring or chain"]]} />
            </div>
            <div className="dialog-row"><span>Reaction centre</span>
              <Select label="Reaction centre" value={d.rxn} onChange={(rxn) => setDialog({ ...d, rxn })}
                options={[["", "Unspecified"], ["centre", "Centre"], ["makebreak", "Make or break"], ["change", "Change"], ["makechange", "Make and change"], ["not", "Not centre"], ["nochange", "Not modified"], ["unmapped", "Unmapped"]]} />
            </div>
          </Dialog>
        );
      })()}</Exit>
      <Exit>{dialog?.kind === "bracket" && (() => {
        const d = dialog, u = d.usage as BracketUsage | "";
        // Repeat Pattern applies to repeating units, not to components, mixtures, multiple groups or generic brackets.
        const repeats = !!u && !["c", "mix", "f", "mult", "gen"].includes(u);
        return (
          <Dialog title="Bracket Properties" action="Apply" onClose={() => setDialog(undefined)} alt={{ label: "Use Defaults", onClick: () => setDialog({ ...d, usage: "", label: "", count: "2", order: "0", mw: "", pattern: "", flip: "" }) }}
            onAction={() => {
              const n = Number(d.count), o = Math.round(Number(d.order)), mw = Number(d.mw);
              const polymer: Polymer | undefined = !u ? undefined : {
                usage: u, ...((u === "sru" || u === "param") && d.label.trim() && !(u === "sru" && d.label.trim() === "n") ? { label: d.label.trim().slice(0, 20) } : {}),
                ...(u === "mult" && n > 0 && n !== 2 ? { label: String(n) } : {}), ...(u === "c" && o > 0 ? { order: Math.min(999, o) } : {}),
                ...(u === "param" && mw > 0 ? { mw } : {}), ...(repeats && d.pattern ? { pattern: d.pattern as Polymer["pattern"] } : {}), ...(d.flippable && d.flip ? { flip: d.flip as Polymer["flip"] } : {}),
              };
              set(updateShape(doc, d.shape, { polymer }), true);
              setDialog(undefined);
            }}>
            <div className="dialog-row"><span>Bracket usage</span>
              <Select label="Bracket usage" value={d.usage} onChange={(usage) => setDialog({ ...d, usage })} options={[["", "Unspecified"], ...USAGE_KINDS.map((k): [string, string] => [k, USAGES[k].name])]} />
            </div>
            {(u === "sru" || u === "param") && (
              <label className="dialog-row"><span>{u === "sru" ? "SRU label" : "Label"}</span><span className="unit-field text"><input aria-label="Label" value={d.label} placeholder={u === "sru" ? "n" : "n, 3 or 2-5"} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...d, label: e.target.value.slice(0, 20) })} /></span></label>
            )}
            {u === "param" && <label className="dialog-row"><span>Mw or Mn</span><NumberField label="Mw or Mn" min={0.01} max={1e8} step={1} value={d.mw ? Number(d.mw) : undefined} placeholder="None" onChange={(v) => setDialog({ ...d, mw: String(v) })} onClear={() => setDialog({ ...d, mw: "" })} /></label>}
            {/* A fractional count too, as ChemDraw's stoichiometry and mixture ratios take (0.5 HCl, 0.72/0.28). */}
            {u === "mult" && <label className="dialog-row"><span>Repeat count</span><NumberField label="Repeat count" min={0.001} max={1e6} step={1} value={Number(d.count) || 2} onChange={(v) => setDialog({ ...d, count: String(Math.max(0.001, Math.round(v * 1000) / 1000)) })} /></label>}
            {u === "c" && <label className="dialog-row"><span>Order</span><NumberField label="Component order" min={0} max={999} step={1} value={Number(d.order) || 0} onChange={(v) => setDialog({ ...d, order: String(Math.round(v)) })} /></label>}
            {repeats && (
              <div className="dialog-row"><span>Repeat pattern</span>
                <Select label="Repeat pattern" value={d.pattern} onChange={(pattern) => setDialog({ ...d, pattern })} options={[["", "Head-to-tail"], ["hh", "Head-to-head"], ["eu", "Either or unknown"]]} />
              </div>
            )}
            {d.flippable && u && (
              <div className="dialog-row"><span>Flip type</span>
                <Select label="Flip type" value={d.flip} onChange={(flip) => setDialog({ ...d, flip })} options={[["", "Unspecified"], ["noflip", "No flip"], ["flip", "Flip"]]} />
              </div>
            )}
          </Dialog>
        );
      })()}</Exit>
      <Exit>{dialog?.kind === "rlogic" && (() => {
        const d = dialog, names = d.rows.map((r) => r.name), row = (k: number, change: Partial<(typeof d.rows)[number]>) => setDialog({ ...d, rows: d.rows.map((r, j) => (j === k ? { ...r, ...change } : r)) });
        return (
          <Dialog title="R-Logic" action="Apply" onClose={() => setDialog(undefined)}
            onAction={() => {
              const by = new Map(d.rows.map((r) => [r.id, r]));
              set({ ...doc, shapes: doc.shapes?.map((x) => {
                const r = by.get(x.id);
                if (!r || !x.rgroup) return x;
                const occur = r.occur.replace(/\s+/g, "");
                return { ...x, rgroup: { name: x.rgroup.name, ...(/^[\d,<>=-]{1,20}$/.test(occur) && occur !== ">0" ? { occur } : {}), ...(r.restH ? { restH: true as const } : {}), ...(r.then && r.then !== r.name ? { then: r.then } : {}) } };
              }) }, true);
              setDialog(undefined);
            }}>
            {d.rows.map((r, k) => (
              <Fragment key={r.id}>
                <label className="dialog-row"><span>{r.name} occurrence</span><span className="unit-field text"><input aria-label={`${r.name} occurrence`} value={r.occur} placeholder=">0" onChange={(e) => row(k, { occur: e.target.value.slice(0, 20) })} /></span></label>
                <div className="dialog-row"><span>{r.name} rest H</span><Segmented label={`${r.name} rest H`} value={r.restH ? "yes" : ""} options={[["", "Off"], ["yes", "On"]]} onChange={(v) => row(k, { restH: !!v })} /></div>
                <div className="dialog-row"><span>If {r.name}, then</span><Select label={`If ${r.name}, then`} value={r.then} onChange={(then) => row(k, { then })} options={[["", "None"], ...names.filter((n) => n !== r.name).map((n): [string, string] => [n, n])]} /></div>
              </Fragment>
            ))}
          </Dialog>
        );
      })()}</Exit>
      <Exit>{dialog?.kind === "font" && (
        <Dialog title="Font" action="Apply" onClose={() => setDialog(undefined)} onAction={() => { runAction(`caption.font.${dialog.font}`); setDialog(undefined); }}>
          <div className="dialog-row"><span>Font</span><FontPick label="Font" font={dialog.font} fonts={fontList} onPick={(font) => setDialog({ ...dialog, font })} className="select-field" start /></div>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "size" && (
        <Dialog title="Size" action="Apply" onClose={() => setDialog(undefined)}
          onAction={() => { const n = Number(dialog.size), pt = roundPt(n); if (n > 0 && pt <= 999) { lastSize.current = pt; runAction(`caption.size.${pt}`); } setDialog(undefined); }}>
          {/* Any size from 0.1 to 999 pt (decision 0007), to the nearest half point from 5 pt and the nearest tenth below. */}
          <label className="dialog-row"><span>Size</span><NumberField label="Size" unit="pt" min={0.1} max={999} step={1} value={Number(dialog.size)} onChange={(n) => setDialog({ ...dialog, size: String(n) })} /></label>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "spacing" && (
        <Dialog title="Line Spacing" action="Apply" onClose={() => setDialog(undefined)}
          onAction={() => { const pt = Number(dialog.pt); restyle(() => ({ lineHeight: dialog.mode === "variable" ? "variable" : dialog.mode === "fixed" && pt >= 0.1 && pt <= 999 ? pt : undefined })); setDialog(undefined); }}>
          {/* ChemDraw's three: Automatic (by the caption's largest text), Variable (each line by its own) and Fixed at. */}
          <Segmented label="Line spacing" value={dialog.mode} onChange={(mode) => setDialog({ ...dialog, mode })} options={[["auto", "Automatic"], ["variable", "Variable"], ["fixed", "Fixed"]]} />
          <label className="dialog-row"><span>Fixed at</span><NumberField label="Fixed at" unit="pt" min={0.1} max={999} step={0.5} disabled={dialog.mode !== "fixed"} value={Number(dialog.pt)} onChange={(n) => setDialog({ ...dialog, pt: String(n) })} /></label>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "chain" && (
        <Dialog title="Add Chain" action={typeof dialog.from === "number" ? "Attach" : "Add"} onClose={() => setDialog(undefined)}
          onAction={() => { const n = Number(dialog.atoms); if (n >= 1) addChainOf(dialog.from, n); setDialog(undefined); }}>
          <label className="dialog-row"><span>Number of atoms</span><span className="unit-field"><input aria-label="Number of atoms" inputMode="numeric" value={dialog.atoms} onFocus={(e) => e.target.select()} onChange={(e) => setDialog({ ...dialog, atoms: e.target.value.replace(/\D/g, "").slice(0, 3) })} /></span></label>
        </Dialog>
      )}</Exit>
      <Exit>{dialog?.kind === "scale" && (
        <Dialog title="Scale" action="Scale" onClose={() => setDialog(undefined)}
          onAction={() => {
            const v = Number(dialog.value), median = chosenMedian();
            // The document's bond length is one bond length in the drawing; a length in pt is in the document style's points.
            if (dialog.how === "percent") scaleBy(v / 100);
            else if (median) scaleBy(dialog.how === "document" ? 1 / median : v / style.bond / median);
            setDialog(undefined);
          }}>
          {/* ChemDraw's three ways: the median bond to the document's bond length, the median bond to a length, or a percent.
              With no bond chosen, the two median ways are dimmed. "Bond length" starts at the chosen median. */}
          <Segmented label="Scale" value={dialog.how} onChange={(how) => setDialog({ ...dialog, how, value: how === "percent" ? "100" : String(Math.round((chosenMedian() ?? 1) * style.bond * 100) / 100) })}
            options={[["document", "Document bond", undefined, !chosenMedian()], ["length", "Bond length", undefined, !chosenMedian()], ["percent", "Percent"]]} />
          <label className="dialog-row">
            <span>{dialog.how === "percent" ? "Scale by" : "Median bond"}</span>
            <NumberField label={dialog.how === "percent" ? "Scale by" : "Median bond"} unit={dialog.how === "percent" ? "%" : "pt"} step={dialog.how === "percent" ? 1 : 0.1} disabled={dialog.how === "document"}
              value={dialog.how === "document" ? style.bond : Number(dialog.value)} onChange={(n) => setDialog({ ...dialog, value: String(n) })} />
          </label>
          {/* ChemDraw's "Scale atom labels and settings": label sizes, line widths and the rest scale with the positions.
              Text alone always scales its size, so the switch shows on and dimmed for it. */}
          <label className="dialog-row">
            <span>Labels and lines</span>
            <Switch on={scalesText()} label="Labels and lines" disabled={textAlone()} onChange={(on) => setSettings((s) => ({ ...s, scaleLabels: on }))} />
          </label>
        </Dialog>
      )}</Exit>
      <Exit>{nicknames && (
        <div ref={nicknameBox}>
          <Menu label="Choose a nickname" className="nickname-menu" columns={3}
            style={{ position: "fixed", left: Math.max(8, Math.min(nicknames.x + 16, innerWidth - 8 - menuWidth(3))), top: Math.max(8, nicknames.y - 20) }}
            groups={NICKNAMES.map((g) => g.map((name) => { const m = nicknameMol(name); return { key: name, name, icon: m?.bonds.length ? <TemplateGlyph mol={m} /> : <TextAa size={20} />, checked: doc.atoms[nicknames.atom]?.text === name }; }))}
            onChoose={(name) => { const i = nicknames.atom; setNicknames(undefined); if (doc.atoms[i]) set(setLabel(doc, i, name), true); }} />
        </div>
      )}</Exit>
      <Exit>{checking && (
        <Dialog title="Possible Error in Drawing" action="Ignore" cancel="Stop" onClose={() => setChecking(undefined)}
          alt={{ label: "Ignore All", onClick: () => { const c = checking; setChecking(undefined); c.then(); } }}
          onAction={() => {
            const c = checking, at = c.at + 1;
            if (at >= c.list.length) { setChecking(undefined); return c.then(); }
            if (c.select) showProblem(c.list[at]);
            setChecking({ ...c, at });
          }}>
          <p className="dialog-note">{checking.list[checking.at].message}</p>
          {checking.list.length > 1 && <p className="dialog-note">{checking.at + 1} of {checking.list.length}</p>}
        </Dialog>
      )}</Exit>
      <Exit>{explaining && (
        // One warning with a fix offers the fix; otherwise the dialog only shows the warnings.
        <Dialog title="Possible Error in Drawing" onClose={() => setExplaining(undefined)} cancel="Close"
          {...(explaining.length === 1 && explaining[0].fix ? { action: explaining[0].fix.label, onAction: () => { setExplaining(undefined); runAction(explaining[0].fix!.command); } } : {})}>
          {explaining.map((p, k) => <p key={k} className="dialog-note">{p.message}</p>)}
        </Dialog>
      )}</Exit>
      {commandsOpen && <CommandPalette commands={paletteCommands()} named={nameCommands} draw={drawCommand} onClose={() => setCommandsOpen(false)} />}
      <Exit>{notice && <NoticeBar notice={notice} onGone={() => showNotice(undefined)} />}</Exit>
      <Tooltips />
    </div>
  );
}
