// ACS 1996 structure renderer: a KET molecule in, filled outlines and text runs out. Units are px.
// The geometry follows ChemDraw's ACS 1996 output, measured to about 1e-5 pt on a reference drawing:
// - Every bond line is a filled polygon. At an unlabelled atom the polygons meet in a mitred fan.
// - Bonds stop a margin short of the letter they meet; where that letter changes with the reading direction, short of
//   the label's box. One cut per bond. Between two labels the margin narrows, so the bond shows a third of its length.
// - Ring double bonds keep the axis line and add an inner line, trimmed back to the ring-angle bisector.
// - Terminal double bonds (C=O) are centred and run on until they meet the neighbouring bonds.
// - Labels are anchored on the advance centre and half the ink height of their first glyph. Read right to left,
//   that glyph stays on the atom if the label ends with it (OMe as MeO); if not (Br), the label's ink ends as far
//   right of the atom as it starts left of it read left to right.

import { pieces, units } from "./labels.ts";
import { atomIndicator, bondIndicator, queryLabel } from "./query.ts";
import { aromaticAtoms, rings as ringsOf } from "./rings.ts";
import { lines as richLines, plainOf, runsOf, styleOf, wrap, type RunStyle, type TextRun } from "./richtext.ts";
import type { DocStyle, Guides } from "./docstyle.ts";
import type { Cycle, CycleText } from "./cycle.ts";
import type { Measured } from "./measured.ts";
import type { Plot, PlotPart } from "./pageplot.ts";

type P = [number, number];
// text: a label that is not one element (OMe, CO2Et, Ph). label then holds the element it attaches through.
// Marks drawn around an atom: radical (unpaired electrons, 1 or 2), pairs (lone pairs shown), circled (the charge
// drawn as ⊕ or ⊖ beside the atom), partial (δ+ or δ−). A radical counts against the atom's hydrogens.
// hmark: a hydrogen shown by a dot on the atom (towards the viewer) or a short hash (away). attach: a point of
// attachment, in ChemDraw's three styles: a wavy line across the bond at this end (true), or a diamond or a star on
// the atom that the bond stops at. bead: a polymer bead (a resin sphere) at this atom.
export type Atom = {
  // Contract Label's group, kept with the label as ChemDraw keeps a contracted fragment: its atoms and bonds as drawn,
  // the labelled atom first. Expand Label draws it out again when the label is no abbreviation Octet knows.
  inner?: Mol;
  label: string; location: [number, number, number]; charge?: number; implicitHCount?: number; text?: string;
  radical?: number; // 1 a doublet (one unpaired electron), 2 a triplet (two), 3 a singlet (a paired carbene)
  isotope?: number; // mass number, written before the element (13C, 2H)
  pairs?: number; circled?: boolean; partial?: "+" | "-"; hmark?: "dot" | "dash"; attach?: boolean | "diamond" | "star"; bead?: boolean;
  map?: number; // a reaction atom map number: the same atom before and after
  enhanced?: string; // enhanced stereo: the stereocentre's group, "abs", "&1" (and) or "or1" (or)
  colour?: string; // #rrggbb for the atom's label and marks; unset draws in the document's ink
  // location[2] is the atom's depth (z, in bond lengths; nearer the viewer is larger), from a turn in 3D (Structure
  // Perspective), 3D Clean Up or a file. shade: depth shading is on for the atom's structure (ChemDraw's Structure >
  // Structure Perspective, ShowPerspective in CDXML): further bonds and labels are drawn fainter.
  shade?: true;
  // The label's text style (ChemDraw's Text menu on a selected label). Unset uses the document's label font and size.
  font?: string; size?: number; bold?: true; italic?: true; underline?: true;
  // A written label's characters that are bold, italic or underlined where the rest are not (styled as it is typed, as
  // ChemDraw's label runs): its text in runs, each with only those styles; text is always their text joined. The label's
  // own bold, italic and underline go on all of it.
  runs?: TextRun[];
  ignoreWarnings?: true; // Display Warnings off for this atom (ChemDraw's IgnoreWarnings): its problems are not marked
  cip?: true; // Show Stereochemistry is on for this atom's structure: its R/S (and its double bonds' E/Z) labels show
  halo?: string; // #rrggbb highlight behind the atom at 40% opacity (ChemDraw's highlight colours; NMR peak colours)
  circle?: true; // Toggle Aromatic Display: an aromatic ring whose atoms all have this is drawn with a circle
  number?: string; // Show Atom Number: the number drawn beside the atom
  hiddenNumber?: string; // a number the atom keeps but does not show (ChemDraw's AtomNumber with Show Atom Number off)
  peaks?: number[]; // the measured multiplets (Group ids in the drawing's spectra) the user linked this atom to
  // The label's alignment set by hand (ChemDraw's Flush Left, Centered, Flush Right and Stacked Above on a label;
  // LabelDisplay in CDXML): left reads from the atom, right ends at it (MeO, H2N), centre sits on it, above and below
  // stack the rest of the label over or under the atom's own unit. Unset is Automatic: it reads away from the bonds.
  align?: "left" | "centre" | "right" | "above" | "below";
  // The label turned anticlockwise about its anchor (the start, middle or end of its first line, by its alignment), in
  // degrees: ChemDraw's RotationAngle on a label, kept from a file.
  labelAngle?: number;
  hidden?: true; // Toggle Hydrogen Display: an explicit H that is not drawn, nor its bond (it still counts in the formula)
  // Marks moved round the atom by hand (dragged with Select): each mark's angle in degrees, anticlockwise from the right,
  // by its key: charge (a circled one, or a skeletal carbon's sign), partial, radical0, radical1, pair0 to pair3. Marks
  // without one go in the widest gaps.
  angles?: Record<string, number>;
  bars?: true; // the lone pairs drawn as bars, not dot pairs (ChemDraw's LonePairBar)
  // Interpret Chemically off (ChemDraw's InterpretChemically="no" on the label): the label is its text, not chemistry.
  // Chemistry reads the atom as an unknown atom (*), as it reads a label it cannot read.
  chemical?: false;
  shown?: true; // a carbon whose label shows with its hydrogens (CH3, CH2): ChemDraw's c key, or C typed as a label
  order?: number; // the draw order of the atom's structure (order.ts); unset draws it in its layer
  query?: AtomQuery; // ChemDraw's atom query properties (Atom Properties), for a database search
  // A multi-centre attachment (an η ligand's bond goes to all these atoms) or, with variable, a variable attachment
  // (a substituent on one of these atoms, a positional isomer). The atom has no label: it sits at the centre of its
  // atoms, and a bond to it is drawn from there. Atom numbers, as in the drawing.
  centre?: { atoms: number[]; variable?: true };
  // A stereocentre's configuration as ChemDraw keeps it (Geometry and BondOrdering in CDXML), even where the drawing's
  // stereo bonds do not set it: the neighbours (atom numbers; -1 the hydrogen or lone pair) in an order whose first
  // three turn clockwise seen with the fourth away, and the stereo bonds at the atom when it was read (cip.ts
  // stereoMarks). It holds while those bonds are unchanged.
  kept?: { atoms: number[]; marks: string };
  scale?: number; // the atom's size against the document style (decision 0007); unset is 1
  ox?: number; // the oxidation state written in its label, Os(II): set when labels are expanded (chem.ts), for names
};
// ChemDraw's atom query properties; unset is ChemDraw's default for each. subst: Substituents, as Free Sites (as drawn
// plus up to n more), Up To n or Exactly n (0 to 15). noH: Implicit Hydrogens not allowed. rings: Ring Bond Count.
// unsat: Unsaturation. change: Reaction Change must be as specified. stereo: Reaction Stereo. valence: Abnormal Valence
// allowed.
export type AtomQuery = {
  subst?: { kind: "free" | "upto" | "exactly"; n: number };
  noH?: true;
  rings?: "none" | "drawn" | "simple" | "fusion" | "spiro";
  unsat?: "absent" | "present";
  change?: true;
  stereo?: "inversion" | "retention";
  translation?: "broad" | "narrow" | "any";
  abundance?: "any" | "natural" | "enriched" | "deficient" | "nonnatural";
  valence?: true;
};
// ChemDraw's bond query properties. query: the bond types a search accepts (Any, Single or Double, Single or Aromatic,
// Double or Aromatic); the bond is drawn as its type says. topology: Ring, Chain, or Ring or Chain. rxn: Reaction
// Center (Center, Make/Break, Change, Make & Change, Not Center, Not Modified, Unmapped).
export type BondQuery = Pick<Bond, "query" | "topology" | "rxn">;
// KET stereo: 1 wedge, 6 hashed wedge. display: how a single bond is drawn when it is not plain.
// On a double bond: bold makes the main line bold, dashed the second line dashed, either crosses the two lines.
// A double bond's dashed (ChemDraw's Tautomeric: the second line dashed) and aromatic (both lines dashed) displays.
export type Display = "bold" | "dashed" | "hashed" | "wavy" | "dative" | "hollow" | "either" | "aromatic";
// position: where a double bond's second line goes, looking from atoms[0] to atoms[1]; unset means automatic.
// Where two bonds cross, the later one in the list is in front, and the one behind has a gap cut in it.
// halo: #rrggbb highlight, a band behind the bond as an atom's halo is a disc (ChemDraw's highlightColor on a bond).
// ignoreWarnings: Display Warnings off for this bond (ChemDraw's IgnoreWarnings): its problems are not marked.
export type Bond = {
  type: number; atoms: [number, number]; stereo?: number; display?: Display; position?: "left" | "centre" | "right"; colour?: string; halo?: string; ignoreWarnings?: true;
  query?: "any" | "sd" | "sa" | "da"; topology?: "ring" | "chain" | "either"; rxn?: "centre" | "makebreak" | "change" | "makechange" | "not" | "nochange" | "unmapped";
  spacing?: number; // a double bond's own spacing (% of the bond length, as ChemDraw's BondSpacing); unset is the document's
  own?: Record<string, string>; // ChemDraw's own settings on the bond that Octet does not turn into a scale, written back as they came
  peaks?: number[]; // the measured multiplets the user linked this bond to, as an atom's (an IR band to its C=O)
  // At each end that is a label keeping its atoms (inner), the atom of that group the bond joins; -1 is none. A residue
  // label (Ala) bonds on both sides, to its N and to its C=O (ChemDraw's BeginExternalNum and EndExternalNum).
  ports?: [number, number];
};
// Bond types: 1 to 3 by order, 4 aromatic and 10 a hydrogen bond (KET's numbers), and 14 a quadruple bond (KET has
// none; 14 keeps clear of KET's types). A hydrogen bond is drawn dotted and adds nothing to an atom's valence.
export const AROMATIC = 4, HBOND = 10, QUADRUPLE = 14;
// A bond's order, for valence and hydrogens. Any other type (a query bond) counts 1.
export const orderOf = (type: number) => (type === AROMATIC ? 1.5 : type === HBOND ? 0 : type === QUADRUPLE ? 4 : type === 2 || type === 3 ? type : 1);
// A caption: free text at x, y (bond lengths, y up; the text's anchor point by its alignment), or, with under
// set, kept centred under those atoms by the ACS rule (baseline 15 pt below the structure's ink box).
// Captions under the same structure stack one line apart, in id order.
// on: conditions text, kept centred above or below an arrow (by the arrow's id).
export type Caption = {
  id: number; text: string; x: number; y: number;
  bold?: boolean; italic?: boolean; underline?: boolean; size?: number; align?: "left" | "centre" | "right" | "justify"; under?: number[];
  on?: { arrow: number; side: "above" | "below" };
  colour?: string; // #rrggbb; unset uses the document's text colour
  cycle?: CycleText; // a catalytic cycle's centre label, or a reagent or product on one of its steps
  angle?: number; // turned anticlockwise about its anchor (the start, middle or end of its first baseline), in degrees (ChemDraw's RotationAngle)
  font?: string; // the caption's font; unset uses the document's caption font
  runs?: TextRun[]; // the text in runs, each with its own style (rich text); text is always their text joined
  property?: Kept; // ChemDraw's live property text (its name, formula or mass) for these atoms, kept and written back
  order?: number; // draw order (order.ts)
  width?: number; // the caption's width (bond lengths): its lines wrap to it, and justified lines fill it
  // Line spacing (ChemDraw's Text > Line Spacing): unset is Automatic (every line as far apart as the caption's
  // largest text needs), variable (each line as far from the last as their own text needs), or fixed, in pt.
  lineHeight?: "variable" | number;
  // Interpret Chemically off (ChemDraw's InterpretChemically="no" on the text): the caption is text only, even when
  // it reads as chemistry (edit.ts chemicalCaption).
  chemical?: false;
  // Conditions placed by hand, as a ChemDraw file has them: the anchor's offset from the middle of the arrow (bond
  // lengths, y up), and the arrow's end less its start when they were placed. The text keeps its place, and its own
  // alignment, while the arrow keeps that length and direction (it moves with the arrow, and keeps its place when
  // edited, as ChemDraw keeps a text's anchor). Once the arrow is lengthened, shortened or turned, or Clean Up
  // Reaction runs, Octet lays the text out (placedAt).
  placed?: { at: [number, number]; arrow: [number, number] };
  role?: PlotPart; // a page spectrum's part: its role and where Octet put it (pageplot.ts)
  // A compound number Octet gave (Number these compounds): an experiment page keeps it in reading order. Text the user
  // typed or edited, and every number in a file from Octet 1.1.0 or ChemDraw, has none and is never changed.
  auto?: true;
};
// Where conditions placed by hand go (their anchor, bond lengths): undefined when they are not placed by hand, or
// their arrow has changed length or direction since.
export function placedAt(c: Pick<Caption, "placed" | "on">, arrows?: Arrow[]): [number, number] | undefined {
  const a = c.placed && c.on && arrows?.find((x) => x.id === c.on!.arrow), p = c.placed;
  if (!a || !p || Math.abs(a.to[0] - a.from[0] - p.arrow[0]) > 2e-3 || Math.abs(a.to[1] - a.from[1] - p.arrow[1]) > 2e-3) return undefined;
  return [(a.from[0] + a.to[0]) / 2 + p.at[0], (a.from[1] + a.to[1]) / 2 + p.at[1]];
}
// Data Octet keeps from a ChemDraw object it does not edit: the object's attributes, and the atoms it is for.
export type Kept = { attrs: Record<string, string>; atoms: number[] };
// An arrow from one point to another (drawing coordinates). bend: how far a curved arrow's middle sits off the
// straight line, as a fraction of its length, to the left looking from start to end.
// line and arc are drawing elements with no head; they share the arrows' handles. style: how the shaft is drawn
// (dashed suits a proposed step; wavy and bold are for lines).
// orbital: an atomic or hybrid orbital drawn from its nucleus (from) to the tip of its main lobe (to).
// cut: a fragmentation line across bonds (the Mass spec analysis tool's), whose pieces the Mass spec panel analyses.
// nogo and hash: a reaction arrow crossed out, or struck through with two slashes (ChemDraw's No-Go Cross and Hash).
// dipole: an arrow with a bar across its tail. block: a hollow block arrow (a wide shaft and head drawn as an outline).
export type ArrowKind = "reaction" | "equilibrium" | "resonance" | "retro" | "nogo" | "hash" | "dipole" | "block" | "curved" | "fishhook" | "double" | "line" | "arc" | "orbital" | "cut" | "curve";
export type LineStyle = "dashed" | "bold" | "wavy" | "doubled";
// The Curves model, as ChemDraw's Curves menu: a head at either end of a line (none, full, or a half head with its
// barb on the left or right, looking the way the head points), the heads' shape, and a closed curve's fill.
export type Head = "none" | "full" | "left" | "right";
export type HeadShape = "solid" | "hollow" | "angled";
export type CurveFill = "solid" | "shaded" | "faded";
export type OrbitalShape = "s" | "oval" | "lobe" | "hybrid" | "p" | "d" | "dz2";
export type Phase = "plain" | "shaded" | "filled" | "phased";
export const ORBITAL_SHAPES: OrbitalShape[] = ["s", "oval", "lobe", "hybrid", "p", "d", "dz2"];
export const PHASES: Phase[] = ["plain", "shaded", "filled", "phased"];
// headSize: the heads' size set by hand (ChemDraw's Large, Medium and Small arrows, or a head handle dragged).
// ratio: an equilibrium's forward arrow against its back arrow (ChemDraw's ArrowEquilibriumRatio): above 1 the back
// arrow is shorter, below 1 the forward one. shaft: a block arrow's shaft width, in line widths.
// point: a straight arrow given a point in its middle, which bends it (bend) and starts branches.
export type Arrow = {
  id: number; kind: ArrowKind; from: [number, number]; to: [number, number]; bend?: number; style?: LineStyle; orbital?: { shape: OrbitalShape; phase: Phase }; colour?: string;
  start?: Head; end?: Head; head?: HeadShape; // heads set by hand; unset uses the kind's own
  curve?: Curve; fill?: CurveFill; // a pen curve's points (from and to are its ends), and a closed one's or a block arrow's fill
  headSize?: HeadSize; ratio?: number; shaft?: number; point?: true;
  order?: number; // draw order (order.ts)
  width?: number; // the line width in points; unset uses the document's. The scale multiplies it.
  scale?: number; // the arrow's size against the document style (decision 0007); unset is 1
  role?: PlotPart; // a page spectrum's part: its role and where Octet put it (pageplot.ts)
};
// An arrowhead's size in line widths, as CDXML keeps it in hundredths (HeadSize, ArrowheadCenterSize, ArrowheadWidth):
// how far back from the tip it reaches, how far back its notch is, and how far each barb stands off the shaft.
export type HeadSize = { length: number; centre: number; width: number };
// ChemDraw's Arrows palette: heads 22.5, 15 or 10 line widths long, notched at 7/8 of that and a quarter of it wide
// each side. Its hollow block arrows: heads 12 or 6 long, flat at the back, on a shaft as wide as the head is long.
// Its arc arrows (curved, fishhook, double-headed and elliptical): heads 8 long, which is their Small.
export const ARROW_SIZES = { large: 22.5, medium: 15, small: 10 } as const;
export const BLOCK_SIZES = { large: 12, medium: 6, small: 6 } as const;
export const ARC_HEAD = 8;
export type ArrowSize = keyof typeof ARROW_SIZES;
export const headOfLength = (length: number, flat = false): HeadSize => ({ length, centre: flat ? length : length * 0.875, width: length / 4 });
// An arrow's head size: its own, or its kind's (a block arrow's is the large one, an arc's 8). As in ChemDraw, a bold
// arrow's heads are twice the size.
export const headSize = (a: Pick<Arrow, "kind" | "headSize" | "style">): HeadSize => a.headSize ?? sizedHead(a, a.kind === "block" ? "large" : "small");
// A palette size's head for an arrow of this kind and line.
export const sizedHead = (a: Pick<Arrow, "kind" | "style">, size: ArrowSize): HeadSize =>
  headOfLength((a.kind === "block" ? BLOCK_SIZES[size] : size === "small" && curved(a) ? ARC_HEAD : ARROW_SIZES[size]) * (a.style === "bold" ? 2 : 1), a.kind === "block");
// The palette size an arrow's heads are, if they are one of them.
export const sizeOf = (a: Pick<Arrow, "kind" | "headSize" | "style">): ArrowSize | undefined => {
  const h = headSize(a);
  return (["large", "medium", "small"] as const).find((k) => { const o = sizedHead(a, k); return Math.abs(o.length - h.length) < 0.01 && Math.abs(o.centre - h.centre) < 0.01 && Math.abs(o.width - h.width) < 0.01; });
};
// Every kind a drawing's arrow list may hold.
export const ALL_ARROW_KINDS: ArrowKind[] = ["reaction", "equilibrium", "resonance", "retro", "nogo", "hash", "dipole", "block", "curved", "fishhook", "double", "line", "arc", "orbital", "cut", "curve"];
export const isOrbital = (a: Pick<Arrow, "kind">) => a.kind === "orbital";
export const ARROW_KINDS: ArrowKind[] = ["reaction", "equilibrium", "resonance", "retro", "nogo", "hash", "dipole", "block", "curved", "fishhook", "double"];
export const LINE_KINDS: ArrowKind[] = ["line", "arc"];
export const curved = (a: Pick<Arrow, "kind">) => a.kind === "curved" || a.kind === "fishhook" || a.kind === "double" || a.kind === "arc";
// Arrows that carry reaction conditions and make up reactions: straight ones with heads.
export const straightArrow = (a: Pick<Arrow, "kind">) => !curved(a) && a.kind !== "line" && a.kind !== "orbital" && a.kind !== "cut" && a.kind !== "curve";
export const isLine = (a: Pick<Arrow, "kind">) => a.kind === "line" || a.kind === "arc" || a.kind === "curve";
// Lines that take the Curves menu's heads: everything drawn as one shaft, no-go and dipole arrows too (not equilibrium,
// retrosynthetic or block arrows, orbitals or fragmentation cuts).
export const takesHeads = (a: Pick<Arrow, "kind">) => !["equilibrium", "retro", "block", "orbital", "cut"].includes(a.kind);
// Arrows whose heads can be Solid, Hollow or Angled (ChemDraw's names, used in the Actions panel and the Curves menu):
// those that take heads, and an equilibrium's two half heads. A retrosynthetic arrow's head is angled and a block
// arrow's is its outline, by their kind.
export const shapesHeads = (a: Pick<Arrow, "kind">) => takesHeads(a) || a.kind === "equilibrium";
// Whether picked arrows' heads have a shape to choose: their heads all take one, and they have a head now (an
// equilibrium's come with its kind). The Actions panel shows Heads, and the Curves menu turns on its shapes, only then.
export const headShaped = (c: { shaped?: boolean; heads?: boolean; start?: Head; end?: Head }) => !!c.shaped && (c.start !== "none" || c.end !== "none" || !c.heads);
// Curves > Solid, Hollow and Angled Arrowhead for what is picked (the Actions panel's context): on for arrows whose
// heads have a shape to choose (headShaped), and for a catalytic cycle or its side arrow's text (cycle: the cycle.head
// commands, as in the Actions panel), with the shape they have ticked. Off for anything else.
export const HEAD_SHAPES: HeadShape[] = ["solid", "hollow", "angled"];
export function headMenu(c: { kind: string; shaped?: boolean; heads?: boolean; start?: Head; end?: Head; head?: HeadShape; cycleSide?: { head: HeadShape } } | undefined): { head?: HeadShape; cycle?: boolean } {
  if (c?.kind === "arrow") return headShaped(c) ? { head: c.head } : {};
  if (c?.kind === "cycle") return { head: c.head, cycle: true };
  if (c?.kind === "caption" && c.cycleSide) return { head: c.cycleSide.head, cycle: true };
  return {};
}
// The picks for an arrow, a catalytic cycle and a cycle's side arrow (ChemDraw's arrow menu has the line, the heads at
// each end, the fill and the kind). The Actions panel shows each as a small button and the right-click menu as a row
// that opens its choices, so both offer the same ones. command: the action each choice runs, with its id after a dot.
// head: the shape an end's choices are drawn with.
export type ArrowPick = { label: string; command: string; value: string; options: readonly (readonly [string, string])[]; head?: HeadShape };
type PickSide = { ends: string; start: Head; end: Head; head: HeadShape; size: string };
// The Actions panel's contexts these read (Context in Actions.tsx).
type ArrowContext = { kind: "arrow"; arrow: string; ratio: number; heads: boolean; shaped: boolean; curved: boolean; fillable: boolean; size?: string; style: string; start: Head; end: Head; head: HeadShape; sweep?: number; fill: string };
type CycleContext = { kind: "cycle"; side?: PickSide; head: HeadShape; size: string; step: boolean; reversible: boolean; balance: string };
const END_HEADS = [["none", "None"], ["full", "Arrowhead"], ["left", "Half, left"], ["right", "Half, right"]] as const;
const HEAD_NAMES = [["solid", "Solid"], ["hollow", "Hollow"], ["angled", "Angled"]] as const;
const LINE_STYLES = [["plain", "Plain"], ["dashed", "Dashed"], ["bold", "Bold"], ["doubled", "Double"], ["wavy", "Wavy"]] as const;
const HEAD_SIZES = [["large", "Large"], ["medium", "Medium"], ["small", "Small"]] as const;
const FILLS = [["none", "None"], ["solid", "Filled"], ["shaded", "Shaded"], ["faded", "Faded"]] as const;
export function arrowPicks(context: { kind: string } | undefined): { label: string; picks: ArrowPick[] }[] {
  const groups: { label: string; picks: ArrowPick[] }[] = [];
  const c = context?.kind === "arrow" ? context as ArrowContext : undefined, y = context?.kind === "cycle" ? context as CycleContext : undefined;
  const t = context?.kind === "caption" ? (context as { cycleSide?: PickSide }).cycleSide : undefined; // a side arrow's text
  if (c && (c.heads || c.curved || c.fillable || c.size !== undefined || c.arrow === "orbital")) {
    // An orbital's line is plain, dashed or bold, as ChemDraw's drawing element menu has it.
    const orbital = c.arrow === "orbital", picks: ArrowPick[] = [];
    if (c.heads || orbital) picks.push({ label: "Line", command: "arrow.style", value: c.style ?? "plain", options: LINE_STYLES.filter(([id]) => !orbital || id === "plain" || id === "dashed" || id === "bold") });
    if (c.heads) picks.push({ label: "Start", command: "arrow.start", value: c.start ?? "none", options: END_HEADS, head: c.head }, { label: "End", command: "arrow.end", value: c.end ?? "none", options: END_HEADS, head: c.head });
    if (headShaped(c)) picks.push({ label: "Heads", command: "arrow.head", value: c.head ?? "solid", options: HEAD_NAMES });
    if (c.curved) picks.push({ label: "Curve", command: "arrow.sweep", value: String(c.sweep ?? 120), options: SWEEPS.map((s) => [String(s), `${s}°`] as const) });
    if (c.size !== undefined) picks.push({ label: "Size", command: "arrow.size", value: c.size, options: [...(c.arrow === "block" ? HEAD_SIZES.slice(0, 2) : HEAD_SIZES), ...(c.size === "own" ? [["own", "Own size"] as const] : [])] });
    if (c.fillable) picks.push({ label: "Fill", command: "arrow.fill", value: c.fill ?? "none", options: FILLS });
    groups.push({ label: "Line and arrowheads", picks });
  }
  const side = y ? y.side : t;
  if (side) groups.push({ label: "Side arrow", picks: [{ label: "Ends", command: "cycle.side.ends", value: side.ends, options: [["both", "Reagent and product"], ["in", "Reagent"], ["out", "Product"]] },
    { label: "Start", command: "cycle.side.start", value: side.start, options: END_HEADS, head: side.head }, { label: "End", command: "cycle.side.end", value: side.end, options: END_HEADS, head: side.head }] });
  // The heads of all of a cycle's arrows, arcs and side arrows: their shape and size, as an arrow's.
  const all = y ?? t;
  if (all) groups.push({ label: "Arrowheads", picks: [{ label: "Heads", command: "cycle.head", value: all.head, options: HEAD_NAMES }, { label: "Size", command: "cycle.size", value: all.size, options: HEAD_SIZES }] });
  // A reversible step's balance: which half is longer, as an unbalanced equilibrium's.
  if (y?.step && y.reversible) groups.push({ label: "Step", picks: [{ label: "Balance", command: "cycle.step.balance", value: y.balance, options: [["equal", "Equal"], ["forward", "Forward longer"], ["back", "Back longer"]] }] });
  return groups;
}
// The arrow kind picked arrows have, as the kind chips and the right-click menu's Kind tick it (an equilibrium with
// unequal halves is "unbalanced"). Undefined for lines, orbitals and anything that is not an arrow: they have no kinds.
export function arrowKind(context: { kind: string } | undefined) {
  const c = context?.kind === "arrow" ? context as ArrowContext : undefined;
  return !c || isLine({ kind: c.arrow as ArrowKind }) || c.arrow === "orbital" ? undefined : c.arrow === "equilibrium" && c.ratio !== 1 ? "unbalanced" : c.arrow;
}
// A line's heads: the ones set by hand, or its kind's.
export function headsOf(a: Pick<Arrow, "kind" | "bend" | "start" | "end">): { start: Head; end: Head } {
  const own: Record<string, [Head, Head]> = {
    reaction: ["none", "full"], curved: ["none", "full"], double: ["full", "full"], resonance: ["full", "full"], nogo: ["none", "full"], hash: ["none", "full"], dipole: ["none", "full"], block: ["none", "full"],
    fishhook: ["none", (a.bend ?? 0) >= 0 ? "left" : "right"], // the barb on the outside of the curve
  };
  const [start, end] = own[a.kind] ?? ["none", "none"];
  return { start: a.start ?? start, end: a.end ?? end };
}
// Curved arrows are circular arcs. Their sweeps on offer, and the bend that gives each one.
export const SWEEPS = [90, 120, 180, 270];
export const sweepBend = (degrees: number) => Math.tan((degrees * Math.PI) / 720) / 2;
export const sweepOf = (bend: number) => (4 * Math.atan(2 * Math.abs(bend)) * 180) / Math.PI;
// A box, rounded box, oval, highlight or brackets, spanning from one corner to the other (drawing coordinates).
// colour: the outline's colour, or a highlight's fill; unset is the ink colour (a highlight's is mist).
// fill: shaded (lit from the top left) or solid in the colour. shadow: a grey shadow down and to the right, with the
// shape filled white over it. side: one bracket only. mark: a sign at a bracket's top right (‡, †, a charge, n).
// picture: a picture from a ChemDraw file (its embedded PNG, PDF, TIFF and so on), drawn in its box and written back.
export type ShapeKind = "box" | "rounded" | "oval" | "highlight" | "brackets" | "parens" | "braces" | "tlc" | "table" | "picture";
// A table's cells, row by row (the first row is the header), and its rules: journal style (top, header and bottom
// rules only) or a full grid.
// widths and heights: every column's width and every row's height once a border has been dragged (bond lengths; a
// column is never narrower than its text). lines: the lines drawn, from the edges, the rule under the header row,
// the lines between rows and the lines between columns (journal rules when unset: top, header and bottom; grid: true
// in older files is every line). align: each column's text (centred when unset). weight: the lines' width in points.
export type TableLine = "top" | "bottom" | "left" | "right" | "header" | "rows" | "cols";
export type CellAlign = "left" | "centre" | "right";
export type Table = { cells: string[][]; grid?: boolean; widths?: number[]; heights?: number[]; lines?: TableLine[]; align?: CellAlign[]; weight?: number };
export const TABLE_LINES: Record<"journal" | "grid" | "box" | "none", TableLine[]> = {
  journal: ["top", "header", "bottom"], grid: ["top", "bottom", "left", "right", "header", "rows", "cols"], box: ["top", "bottom", "left", "right"], none: [],
};
export const linesOf = (t?: Table): TableLine[] => t?.lines ?? (t?.grid ? TABLE_LINES.grid : TABLE_LINES.journal);
// A pen curve: anchor points joined by cubic Béziers. c1 is a point's incoming handle, c2 its outgoing one; a point
// without handles is a corner. A closed curve joins its last point back to its first.
export type CurvePoint = { at: [number, number]; c1?: [number, number]; c2?: [number, number] };
export type Curve = { points: CurvePoint[]; closed?: boolean };
// A TLC plate's lanes and spots: each spot in a lane at its Rf (0 at the origin, 1 at the solvent front).
// A TLC plate: its lanes and spots, Rf values shown for all, the origin's height and the front's depth (fractions of
// the plate, from the bottom and the top), and parts hidden, as ChemDraw's TLC tool.
// ticks: Rf ticks along both sides (ChemDraw's Show Side Ticks). transparent: what is behind the plate shows through
// it (ChemDraw's Transparent); otherwise the plate is the page's colour.
export type Tlc = { lanes: number; spots: Spot[]; rf?: boolean; origin?: number; front?: number; hide?: ("origin" | "front" | "border")[]; ticks?: true; transparent?: true };
// A spot: its lane and Rf, and when set by hand its colour, style, half-width and half-height, the smear below it
// (bond lengths), and its own Rf label. style is its fill (unset: filled); dashed and bold are its outline's, and
// doubled draws a second outline round it (ChemDraw's spot styles: Filled, Hollow, Dashed, Bold, Doubled).
export type Spot = { lane: number; rf: number; colour?: string; style?: "hollow" | "shaded"; dashed?: true; bold?: true; doubled?: true; w?: number; h?: number; tail?: number; showRf?: true };
// faded: a fill fading to nothing at the bottom right (as a closed curve's).
export type Shape = {
  id: number; kind: ShapeKind; from: [number, number]; to: [number, number]; dashed?: boolean; colour?: string;
  fill?: "shaded" | "solid" | "faded"; shadow?: boolean; side?: "left" | "right"; mark?: string; tlc?: Tlc; table?: Table;
  shade?: Shade; // a shadow's look, when it differs from SHADE
  boldLine?: true; // the outline in the bold width (ChemDraw's Bold line)
  picture?: Record<string, string>; // a picture's data as CDXML holds it: each format's bytes in hex, and its turn
  order?: number; // draw order (order.ts)
  angle?: number; // degrees anticlockwise: the box from and to span is drawn turned about its middle (not TLC plates, tables or pictures)
  width?: number; // the line width in points; unset uses the document's. The scale multiplies it.
  radius?: number; // a rounded box's corner radius in bond lengths, from ChemDraw's CornerRadius; unset is 0.3
  // The text of a table's cells or a TLC plate's Rf values, as the Text menu sets it; unset is the document's caption
  // style (an Rf value is 0.8 of its size). The scale multiplies the size.
  font?: string; size?: number; bold?: true; italic?: true; underline?: true;
  ignoreWarnings?: true; // Display Warnings off for a pair of brackets (ChemDraw's IgnoreWarnings): its problem is not marked
  polymer?: Polymer; // a pair of brackets' meaning (ChemDraw's Bracket Properties)
  // A pair with no usage that a ChemDraw file holds as a bracketed group round the atoms inside: written back as one.
  bracketed?: true;
  // An R-group definition (ChemDraw's alternative group): a box titled with its name (R1), the structures in it the
  // fragments R1 stands for, and its R-Logic (occurrence, Rest H, and the R-group that must then be present too).
  rgroup?: { name: string; occur?: string; restH?: true; then?: string };
  scale?: number; // the shape's size against the document style (decision 0007); unset is 1
};
// A bracket's usage, ChemDraw's Bracket Usage: SRU (n), monomer, mer, copolymer (and its alternating, random and block
// kinds), crosslink, graft, modification, component, unordered and ordered mixture, multiple group (#), generic,
// anypolymer, and parameterizable (a label, count or range, or a molecular weight). label: an SRU's label (unset is n),
// a multiple group's repeat count, a parameterizable bracket's label. order: a component's number. pattern: how the
// repeating units join, unset head-to-tail. flip: a ladder polymer's flip type. mw: a parameterizable bracket's Mw or Mn.
export type BracketUsage = "sru" | "mon" | "mer" | "co" | "alt" | "ran" | "blk" | "xl" | "grf" | "mod" | "c" | "mix" | "f" | "mult" | "gen" | "anyp" | "param";
export type Polymer = { usage: BracketUsage; label?: string; order?: number; pattern?: "hh" | "eu"; flip?: "noflip" | "flip"; mw?: number };
// A shadow: how far it falls down and right and how soft its edge is (bond lengths), and how dark it is (0 to 1).
export type Shade = { depth: number; blur: number; opacity: number };
export const SHADE: Shade = { depth: 0.12, blur: 0, opacity: 0.35 };
export const isBracket = (sh: Pick<Shape, "kind">) => sh.kind === "brackets" || sh.kind === "parens" || sh.kind === "braces";
// Boxes, ovals, highlights and brackets turn with a selection, as ChemDraw's graphics do. TLC plates, tables and
// pictures stay upright and move by their middle (ChemDraw cannot turn a table; Octet keeps a picture as ChemDraw had it).
export const turns = (sh: Pick<Shape, "kind">) => sh.kind !== "tlc" && sh.kind !== "table" && sh.kind !== "picture";
// A point turned about c by degrees, anticlockwise (drawing units, y up).
export const turnPoint = (q: [number, number], c: [number, number], degrees: number): [number, number] => {
  const r = (degrees * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), dx = q[0] - c[0], dy = q[1] - c[1];
  return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
};
const middleOf = (sh: Pick<Shape, "from" | "to">): [number, number] => [(sh.from[0] + sh.to[0]) / 2, (sh.from[1] + sh.to[1]) / 2];
// A point (drawing units) turned with a shape about its middle.
export const turnedWith = (sh: Pick<Shape, "kind" | "from" | "to" | "angle">, q: [number, number]): [number, number] => (sh.angle && turns(sh) ? turnPoint(q, middleOf(sh), sh.angle) : q);
// A shape's corners as drawn (drawing units): from, to and the other two (c1 has from's x and to's y), turned with it.
export function shapeCorners(sh: Pick<Shape, "from" | "to" | "angle">): Record<"from" | "to" | "c1" | "c2", [number, number]> {
  const c = middleOf(sh), t = (q: [number, number]) => (sh.angle ? turnPoint(q, c, sh.angle) : q);
  return { from: t(sh.from), to: t(sh.to), c1: t([sh.from[0], sh.to[1]]), c2: t([sh.to[0], sh.from[1]]) };
}
// The upright box round a shape as drawn: [left, bottom, right, top] in drawing units.
export function shapeBounds(sh: Pick<Shape, "from" | "to" | "angle">): Box {
  const ps = Object.values(shapeCorners(sh)), xs = ps.map((q) => q[0]), ys = ps.map((q) => q[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
// Whether a point (drawing units) is inside a shape's box as drawn.
export function inShape(sh: Pick<Shape, "from" | "to" | "angle">, p: [number, number]): boolean {
  const q = sh.angle ? turnPoint(p, middleOf(sh), -sh.angle) : p;
  return q[0] >= Math.min(sh.from[0], sh.to[0]) && q[0] <= Math.max(sh.from[0], sh.to[0]) && q[1] >= Math.min(sh.from[1], sh.to[1]) && q[1] <= Math.max(sh.from[1], sh.to[1]);
}
// Whether a point (drawing units) is inside a shape as drawn: an oval by its ellipse, any other shape by its box.
export function inDrawn(sh: Pick<Shape, "from" | "to" | "angle" | "kind">, p: [number, number]): boolean {
  if (!inShape(sh, p) || sh.kind !== "oval") return inShape(sh, p);
  const c = middleOf(sh), q = sh.angle ? turnPoint(p, c, -sh.angle) : p, rx = Math.abs(sh.to[0] - sh.from[0]) / 2, ry = Math.abs(sh.to[1] - sh.from[1]) / 2;
  return ((q[0] - c[0]) / rx) ** 2 + ((q[1] - c[1]) / ry) ** 2 <= 1;
}
// A shape after a turn or flip, with its angle in (-90, 90] (or none): a shape turned a half is the same shape with
// its corners swapped (one bracket alone then faces the other way), and a box, oval or highlight turned a quarter
// takes its height for its width. So a shape stays upright whenever it can, and its corners go where the turn took them.
export function settleShape(sh: Shape): Shape {
  const { angle: _, ...rest } = sh;
  if (!turns(sh)) return rest;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6, c = middleOf(sh);
  const half = (s: Shape): Shape => ({ ...s, from: s.to, to: s.from, ...(s.side ? { side: s.side === "left" ? "right" as const : "left" as const } : {}) });
  const quarter = (s: Shape, sign: number): Shape => {
    const d = [s.from[0] - c[0], s.from[1] - c[1]], r = [-sign * d[1], sign * d[0]];
    return { ...s, from: [c[0] + r[0], c[1] + r[1]], to: [c[0] - r[0], c[1] - r[1]] };
  };
  let a = (((((sh.angle ?? 0) + 180) % 360) + 360) % 360) - 180, out: Shape = rest; // [-180, 180)
  if (a > 90 + 1e-6) { out = half(out); a -= 180; } else if (a <= -90 + 1e-6) { out = half(out); a += 180; }
  if (near(a, 0)) return out;
  if (!isBracket(sh) && near(Math.abs(a), 90)) return quarter(out, Math.sign(a));
  return { ...out, angle: Math.round(a * 1e6) / 1e6 };
}
export const SHAPE_KINDS: ShapeKind[] = ["box", "rounded", "oval", "highlight", "brackets", "parens", "braces", "tlc", "table", "picture"];
export const HIGHLIGHT = "#DCE4F6";
// Captions, arrows, shapes and cycles share one set of ids.
// guides: what the file asks the window to show (grid, rulers, crosshair), when Octet saved it; files only.
// spectra: measured spectra (measured.ts), at most one for each key (¹H, ¹³C, IR and so on), shown in the Spectrum panel.
export type Mol = { atoms: Atom[]; bonds: Bond[]; captions?: Caption[]; arrows?: Arrow[]; shapes?: Shape[]; cycles?: Cycle[]; groups?: Group[]; grids?: Grid[]; fills?: RingFill[]; annotations?: Annotation[]; style?: DocStyle; guides?: Guides; spectra?: Measured[] };
// A ring fill (ChemDraw's Ring Fill colours, its ColoredMolecularArea): one ring, by its atoms in ring order, filled
// with the colour at 30% opacity behind the bonds. Each ring keeps its own fill, so fused rings can differ. A fill
// whose ring is broken is not drawn.
export type RingFill = { atoms: number[]; colour: string };
// A keyword and content pair on the document or a group (ChemDraw's File > Document Annotations, and the GUIDs ChemDraw
// writes). Not drawn: Octet keeps them from a ChemDraw file and writes them back (REL-28).
export type Annotation = { keyword: string; content: string };
// A stoichiometry grid (Structure > Analyse Stoichiometry) under the reaction an arrow belongs to: what was typed for
// each component, in base units, and the limiting reactant. A component's key is its side and what it is ("r:C7H8O" a
// reactant structure by its formula, 'r:"NaBH4"' a reagent written as text, "p:…" a product; "#2" on a second one the
// same), so typed values stay with their compound when the reaction changes ("r0", "p0" in drawings from before).
// hidden: rows (by id) and columns (by key) hidden with Hide Row and Hide Column; colour: the grid's ink. layout
// "rows": each reagent on a row of its own and the products in a section of their own under them (issue 34); unset,
// a column under each component, as ChemDraw's grid. Everything else is worked out from the reaction as it is drawn
// (stoich.ts).
export type Grid = {
  arrow: number; typed: Record<string, Partial<Record<"mass" | "moles" | "equiv" | "volume" | "density" | "molarity" | "purity" | "measured", number>>>; limiting?: string;
  hidden?: { rows?: string[]; cols?: string[] }; colour?: string; layout?: "rows";
};
// A group (Object > Group): atoms and other objects (captions, arrows, shapes, cycles, by id) that select and move as
// one. Groups nest: a group lists everything in it, the groups inside it too (edit.ts, tidyGroups). An integral group
// is never split: a click on any part picks all of it.
// plot: a page spectrum's record (pageplot.ts).
export type Group = { id: number; atoms: number[]; items: number[]; integral?: true; annotations?: Annotation[]; plot?: Plot };
// Sizes in px: bond length, line width, bold width, double-bond spacing, hash spacing, label margin, label font size.
// terminal, carbons: label carbons at chain ends (CH3), or every other carbon too; hideH: labels leave off implicit H.
// labelPt: the document's label size in pt, which an atom's own label size is measured against.
// Every length an object draws is the document's length times the object's scale (decision 0007): an atom's, an
// arrow's, a shape's or a cycle's own, and for a bond the mean of its two atoms'. Positions already carry the scale.
export type Style = { bond: number; line: number; bold: number; spacing: number; hash: number; margin: number; size: number; labelPt?: number; terminal?: boolean; carbons?: boolean; hideH?: boolean };
// width: advance; ascent: ink top above the baseline; outline: glyph edge points relative to the text origin (y down).
export type Ink = { width: number; ascent: number; outline: P[] };
// angle: a turned label's turn, anticlockwise in degrees about pivot (px), as its atom's labelAngle.
export type Label = { text: string; x: number; y: number; size: number; colour?: string; alpha?: number; font?: string; bold?: boolean; italic?: boolean; underline?: boolean; angle?: number; pivot?: P };
// The SVG transform that turns a label as drawn.
export const labelTurn = (l: Label) => (l.angle && l.pivot ? `rotate(${-l.angle} ${l.pivot[0]} ${l.pivot[1]})` : undefined);
// A label's face, for measuring it: its own font, bold and italic.
export type Face = { font?: string; bold?: boolean; italic?: boolean };
export type Box = [number, number, number, number];
// ink: each atom's ink box (its label and the bonds that touch it), for placing captions. label: the ink box of an
// atom's label alone (NH2, OMe), for highlighting it; undefined for an unlabelled atom. scale: px per bond length.
// electrons: where each lone pair and radical dot is drawn (px), for curly arrows to start from, and with key, every
// mark (circled and partial charges too), for moving it round its atom (Atom.angles). beads: polymer beads, drawn
// shaded by the caller. labelAt: where each label's atom is (px), which the label keeps level about while a drag turns
// its structure. maps: each atom map number (px): its text, the middle of its ink, its font size and ink height.
export type MapNumber = { atom: number; text: string; at: P; size: number; h: number };
export type Drawing = {
  sides?: number[]; // each bond's second line as drawn, for a double bond: -1 left, 1 right of its first atom to its second on screen, 0 centred
  polygons: P[][]; colours: (string | undefined)[]; alphas: number[]; labels: Label[]; box: Box; ink: Box[]; label: (Box | undefined)[]; scale: number;
  electrons: { atom: number; at: P; key?: string }[]; beads: { at: P; r: number }[]; labelAt: P[]; maps: MapNumber[];
};

// An object's scale: its own, or 1.
export const scaleOf = (x: { scale?: number }) => x.scale ?? 1;

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => mul(a, 1 / len(a));
const perp = (a: P): P => [-a[1], a[0]];
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const angle = (a: P, b: P) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b)))));

// Label type: subscripts 75% and 0.212 em down, charges 75% and 0.33 em up. A stacked line (indole NH, a label stacked
// above or below) is 1.167 times the H's cap height from the attaching line, baseline to baseline: 8.35 pt in Arial
// 10 pt, as ChemDraw stacks NH.
const SUB = 0.75, DROP = 0.212, RISE = 0.33, STACK = 1.167;
const TIP = 0.0165; // wedge half-width at the stereocentre, as a fraction of the bond length
const MAX_TRIM = 0.67; // an inner-line trim longer than this (times the bond length) is skipped
export const H_FIRST = new Set(['O', 'F', 'S', 'Cl', 'Se', 'Br', 'Te', 'I']); // H2O, HCl; but NH3, CH4
// Elements that are not metals. A bond to a metal does not change the hydrogens Octet draws on an atom (chem.ts).
export const NONMETAL = new Set(["H", "D", "T", "He", "B", "C", "N", "O", "F", "Ne", "Si", "P", "S", "Cl", "Ar", "Ge", "As", "Se", "Br", "Kr", "Sb", "Te", "I", "Xe", "At", "Rn", "*", "R"]);
const VALENCE: Record<string, number> = { C: 4, Si: 4, N: 3, P: 3, As: 3, B: 3, Al: 3, O: 2, S: 2, Se: 2, Te: 2, F: 1, Cl: 1, Br: 1, I: 1 };

// A ring's aromatic circle, as ChemDraw sizes it (Toggle Aromatic Display): the ring's inradius for its shortest bond
// L, less the double bond spacing (spacing, a fraction of the bond length) times a factor for the ring's size.
export function ringCircleRadius(n: number, L: number, spacing: number): number {
  const k = n === 4 ? 1.6 : n === 5 ? 1.5 : n >= 7 ? 1.2 : 4 / 3;
  return L * (1 / (2 * Math.tan(Math.PI / n)) - spacing * k);
}
// A π ligand's ellipse: round the ring's middle c, its axes across and along the bond to the ring's multi-centre point
// (from: the atom at the bond's other end), each the ring's reach that way scaled as an aromatic circle is for a ring
// of its size (spacing: the double bond spacing as a fraction of the bond length). Any units, y either way.
export function ligandEllipse(ring: P[], c: P, from: P | undefined, spacing: number): { across: P; along: P; ra: number; rb: number } {
  // The ellipse takes the ring's own flattening (the short axis of its points' spread about c), so it stays true to the
  // ring when the ring moves without the atom it hangs from (issue 6). A ring drawn round takes the bond's line.
  let xx = 0, yy = 0, xy = 0;
  for (const q of ring) { const [x, y] = sub(q, c); xx += x * x; yy += y * y; xy += x * y; }
  const flat = Math.hypot(xx - yy, 2 * xy) > 1e-6 * (xx + yy), t = Math.atan2(2 * xy, xx - yy) / 2 + Math.PI / 2;
  const along: P = flat ? [Math.cos(t), Math.sin(t)] : from && len(sub(c, from)) > 1e-9 ? unit(sub(c, from)) : [0, 1], across = perp(along), n = ring.length;
  const reach = (d: P) => Math.max(...ring.map((q) => Math.abs(dot(sub(q, c), d)))), f = ringCircleRadius(n, 1, spacing) * 2 * Math.sin(Math.PI / n);
  return { across, along, ra: reach(across) * f, rb: reach(along) * f };
}
// The rings Toggle Aromatic Display draws with a circle: aromatic rings of 5 to 8 atoms, every atom marked.
export function circledRings(mol: Mol): number[][] {
  if (!mol.atoms.some((a) => a.circle)) return [];
  const used = mol.atoms.map(() => 0);
  for (const b of mol.bonds) for (const i of b.atoms) used[i] += orderOf(b.type);
  const g = { atoms: mol.atoms.map((a, i) => ({ el: a.text ? "X" : a.label, charge: a.charge ?? 0, h: a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i]) })), bonds: mol.bonds.filter((b) => b.type !== HBOND).map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: Math.min(3, Math.max(1, b.type)) as 1 | 2 | 3 })) };
  const aromatic = aromaticAtoms(g);
  return ringsOf(g).filter((r) => r.length >= 5 && r.length <= 8 && r.every((i) => mol.atoms[i].circle && aromatic[i]));
}

// radical: Atom.radical; a singlet (3) is one pair, so it takes two hydrogens, as a triplet does.
export function hydrogens(label: string, charge: number, used: number, radical = 0) {
  const v = VALENCE[label];
  if (v === undefined) return 0;
  const target = v === 4 ? v - Math.abs(charge) : label === 'B' || label === 'Al' ? v - charge : v + charge;
  return Math.max(0, Math.round(target - used - (radical === 3 ? 2 : radical)));
}
// Valence electrons, for how many lone pairs an atom can show.
const SHELL: Record<string, number> = { H: 1, B: 3, Al: 3, C: 4, Si: 4, N: 5, P: 5, As: 5, O: 6, S: 6, Se: 6, Te: 6, F: 7, Cl: 7, Br: 7, I: 7 };
// The lone pairs an atom has: what is left of its valence electrons after its bonds, hydrogens, charge and radical.
export function lonePairs(label: string, charge: number, used: number, h: number, radical = 0) {
  const e = SHELL[label];
  return e === undefined ? 0 : Math.max(0, Math.floor((e - used - h - charge - (radical === 3 ? 2 : radical)) / 2));
}

// Where line p + r·t meets line q + s·t; null if they are parallel.
const meet = (p: P, r: P, q: P, s: P): P | null => {
  const d = cross(r, s);
  return Math.abs(d) < 1e-9 ? null : add(p, mul(r, cross(sub(q, p), s) / d));
};

// Whether the line from p to q goes through box b.
function crosses(b: Box, p: P, q: P): boolean {
  let t0 = 0, t1 = 1;
  for (const [e, f] of [[p[0] - q[0], p[0] - b[0]], [q[0] - p[0], b[2] - p[0]], [p[1] - q[1], p[1] - b[1]], [q[1] - p[1], b[3] - p[1]]]) {
    if (Math.abs(e) < 1e-12) { if (f < 0) return false; continue; }
    if (e < 0) t0 = Math.max(t0, f / e); else t1 = Math.min(t1, f / e);
    if (t0 > t1) return false;
  }
  return true;
}

// Where a labelled atom's charge sign goes (y down, any units). Its own place is after the label and raised (N⁺), or
// before it for a label read right to left (⁻O). Where a bond leaves through that place (the sign would stop one of the
// bond's lines further out than the rest of the label does), it takes the label's other upper corner if the bonds leave
// that clear (⁺N, or N⁺ read right to left). With neither clear, it goes in the middle of the widest gap between the
// bonds and the label outside the rings (the gap nearest the upper right on a tie), just clear of the label, as a
// circled charge does. X: the atom. bonds: each bond's far atom, its lines' offsets from its axis, and how far a line
// stops short of ink. rings: pairs of bonds (by index) that are two sides of one ring at the atom. left, right: the
// ends of the label's attaching line. raised: a raised sign's baseline. w, ink: the sign's advance, and its ink outline
// from its origin. label: the label's ink outline. size: the label's size.
// Returns the sign's origin, and whether that is after the label and raised, where ChemDraw puts a label's sign.
export function signSpot(X: P, bonds: { to: P; lines: number[]; m: number }[], rings: [number, number][], left: number, right: number, raised: number, w: number, ink: P[], rtl: boolean, label: P[], size: number): { at: P; after: boolean } {
  const [x0, y0, x1, y1] = outlineBox(ink), first = rtl ? left - w : right, second = rtl ? right : left - w;
  // How far out along a bond's lines some ink (moved by o) stops them, as the label cuts below work it out.
  const cutBy = (pts: P[], d: number, u: P, lines: number[], m: number, o: P = [0, 0]) => {
    let cut = 0;
    for (const q of pts) {
      const r = sub(add(q, o), X), a = dot(r, u), c = cross(u, r);
      for (const off of lines) { const e = Math.abs(c - off); if (e < m) { const s = Math.sqrt(m * m - e * e); if (a - s < d) cut = Math.max(cut, a + s); } }
    }
    return cut;
  };
  const ways = bonds.map(({ to, lines, m }) => {
    const d = len(sub(to, X)), u = d > 1e-9 ? mul(sub(to, X), 1 / d) : ([1, 0] as P);
    return { d, u, lines, m, cut: cutBy(label, d, u, lines, m) };
  });
  // Whether a direction from the atom lies inside a ring: between two of its sides at the atom, in the angle under 180°.
  const inRing = (v: P) => rings.some(([p, q]) => { const a = ways[p].u, b = ways[q].u, s = cross(a, b); return s * cross(a, v) > 0 && s * cross(v, b) > 0; });
  // A corner is clear when the sign there stops no bond, sits at least 30° off every bond, and is not inside a ring.
  const mid: P = [(x0 + x1) / 2, (y0 + y1) / 2], stops = (o: P) => ways.some(({ d, u, lines, m, cut }) => cutBy(ink, d, u, lines, m, o) > cut + 1e-9);
  const clear = (o: P) => { const v = sub(add(o, mid), X); return !inRing(v) && !stops(o) && ways.every(({ u }) => angle(v, u) >= Math.PI / 6); };
  let at = ([[first, raised], [second, raised]] as P[]).find(clear);
  if (!at) {
    // The gaps between the bonds and the parts of the label away from the atom (its H, a mass number).
    const TAU = 2 * Math.PI, taken = bonds.map(({ to }) => Math.atan2(to[1] - X[1], to[0] - X[0]));
    for (const q of label) if (len(sub(q, X)) > 0.62 * size) taken.push(Math.atan2(q[1] - X[1], q[0] - X[0]));
    const sorted = taken.map((t) => ((t % TAU) + TAU) % TAU).sort((p, q) => p - q);
    const fromUpRight = (t: number) => Math.abs(Math.atan2(Math.sin(t + Math.PI / 4), Math.cos(t + Math.PI / 4)));
    let t = -Math.PI / 4, most = -Infinity;
    sorted.forEach((s, k) => {
      const span = (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + TAU) - s, mid = s + span / 2, score = span - (inRing([Math.cos(mid), Math.sin(mid)]) ? 10 : 0);
      if (score > most + 1e-6 || (score > most - 1e-6 && fromUpRight(mid) < fromUpRight(t))) { most = score; t = mid; }
    });
    // Out along the gap's middle until the sign's ink box clears the label's ink by a seventh of the label size, and
    // the sign stops no bond.
    const d: P = [Math.cos(t), Math.sin(t)], g = 0.14 * size;
    const fits = (o: P) => label.every((q) => q[0] <= o[0] + x0 - g || q[0] >= o[0] + x1 + g || q[1] <= o[1] + y0 - g || q[1] >= o[1] + y1 + g) && !stops(o);
    for (let r = 0; r <= 4 * size && !at; r += 0.02 * size) { const o = sub(add(X, mul(d, r)), mid); if (fits(o)) at = o; }
    at ??= sub(add(X, mul(d, 4 * size)), mid);
  }
  return { at, after: at[0] === right && at[1] === raised };
}
// A labelled atom's bonds as signSpot takes them: each bond's far atom (where `at` puts it), its lines' offsets as they
// will be drawn (a double bond to another label centred, unless a ring or a set position may move it; otherwise allowed
// for on either side), and how far a line stops short of ink (z: the atom's lengths); and the pairs of them that are
// two sides of one ring. nbrs: the atoms each is bonded to; covalent: by bonds that are not hydrogen bonds.
export function signBonds(i: number, nbrs: number[][], covalent: number[][], bondOf: (i: number, j: number) => Bond, labelled: (j: number) => boolean, at: (j: number) => P, z: { spacing: number; margin: number; hw: number; wide: number }) {
  const rings: [number, number][] = [], sp = z.spacing;
  const bonds = nbrs[i].map((j, k) => {
    const bd = bondOf(i, j), two = bd.type === 2 || bd.type === AROMATIC, ring = ringsThrough(i, j, covalent);
    for (const r of ring) { const q = nbrs[i].indexOf(r[1]); if (q > k) rings.push([k, q]); }
    const lines = bd.type === QUADRUPLE ? [-1.5, -0.5, 0.5, 1.5].map((f) => f * sp) : two && labelled(j) && !bd.position && !ring.length ? [-sp / 2, sp / 2] : two || bd.type === 3 ? [-sp, 0, sp] : [0];
    return { to: at(j), lines, m: z.margin + (bd.stereo || bd.display ? z.wide : z.hw) };
  });
  return { bonds, rings };
}

// Small rings through bond a–b (simple paths from a back to b, up to 8 atoms).
function ringsThrough(a: number, b: number, nbrs: number[][]): number[][] {
  const out: number[][] = [];
  const walk = (path: number[]) => {
    const at = path[path.length - 1];
    if (path.length > 8) return;
    for (const n of nbrs[at]) {
      if (n === b) out.push([...path, b]);
      else if (!path.includes(n)) walk([...path, n]);
    }
  };
  for (const n of nbrs[a]) if (n !== b) walk([a, n]);
  return out;
}

// A bond, planned. Kinds 'line' and 'wedge' join the fans; 'none' is a centred double bond (its two lines only).
// 'dash', 'hashbar', 'wavy' and 'dot' (a hydrogen bond) are drawn along the axis and stay out of the fans. half: the line's half-width
// when it is not the normal one (bold). head: an arrowhead at b (dative bond).
// lines: extra lines parallel to the axis at offset o, trimmed t0 at a and t1 at b (negative runs past the atom).
// cut: distance from a and from b at which a label stops the bond.
type Plan = {
  a: number; b: number; u: P; n: P; length: number;
  kind: 'line' | 'wedge' | 'hash' | 'none' | 'dash' | 'hashbar' | 'wavy' | 'hollow' | 'dot';
  half?: number;
  head?: boolean;
  // half: a line's own half width (a bold double's); dashed: drawn as dashes (a dashed double's second line).
  lines: { o: number; t0: number; t1: number; half?: number; dashed?: boolean }[];
  cross?: boolean; // a double bond drawn as two crossing lines (either geometry)
  cut: [number, number];
  hidden?: boolean;
  side?: number; // a double bond's second line: -1 left, 1 right, 0 centred
  z: Z; // the bond's lengths at its scale
};
// The lengths an object draws at one scale (px): bond, half line width, wedge half-width at each end, bold width,
// double-bond spacing, hash spacing, label margin and label size.
type Z = { L: number; hw: number; wide: number; tip: number; bold: number; spacing: number; hash: number; margin: number; size: number };

// A label's glyph outline where it is drawn: the measured outline (shared, not copied), placed at x, y and scaled by f.
type Piece = { pts: P[]; x: number; y: number; f: number };
// An outline's box, found once per outline.
const outlineBoxes = new WeakMap<P[], Box>();
function outlineBox(pts: P[]): Box {
  let b = outlineBoxes.get(pts);
  if (!b) {
    b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y] of pts) { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; }
    outlineBoxes.set(pts, b);
  }
  return b;
}
// An outline's points in cells 2 px across, each with its centre and the furthest its points are from it, found once
// per outline. The label cuts pass over a cell whose points cannot change the cut.
type Cell = { c: P; r: number; pts: P[] };
const outlineCells = new WeakMap<P[], Cell[]>();
function cellsOf(pts: P[]): Cell[] {
  let cells = outlineCells.get(pts);
  if (!cells) {
    const by = new Map<string, P[]>();
    for (const q of pts) { const k = `${Math.floor(q[0] / 2)} ${Math.floor(q[1] / 2)}`; let list = by.get(k); if (!list) by.set(k, (list = [])); list.push(q); }
    cells = [...by.values()].map((list) => {
      const b = outlineBox(list), c: P = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
      return { c, r: Math.max(...list.map((q) => len(sub(q, c)))), pts: list };
    });
    outlineCells.set(pts, cells);
  }
  return cells;
}
// A piece's box where it is drawn (the same numbers as the box of its placed points).
const pieceBox = ({ pts, x, y, f }: Piece): Box => { const b = outlineBox(pts); return [x + b[0] * f, y + b[1] * f, x + b[2] * f, y + b[3] * f]; };
// A glyph's outline turned over about the middle of its advance (width), found once per outline.
const mirrors = new WeakMap<P[], P[]>();
function mirrored(pts: P[], width: number): P[] {
  let m = mirrors.get(pts);
  if (!m) mirrors.set(pts, (m = pts.map(([x, y]): P => [width - x, y])));
  return m;
}
// Where a line through o (along u, y down) comes within m of box b: the stretch [in, out] along it, or none. That is
// where it crosses the box grown by m all round, with rounded corners.
function boxSpan(o: P, u: P, b: Box, m: number): [number, number] | undefined {
  let lo = Infinity, hi = -Infinity;
  const slab = (p: number, d: number, a: number, c: number): [number, number] => {
    if (Math.abs(d) < 1e-12) return p >= a && p <= c ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const t0 = (a - p) / d, t1 = (c - p) / d;
    return t0 < t1 ? [t0, t1] : [t1, t0];
  };
  for (const [x0, x1, y0, y1] of [[b[0] - m, b[2] + m, b[1], b[3]], [b[0], b[2], b[1] - m, b[3] + m]]) {
    const [a0, a1] = slab(o[0], u[0], x0, x1), [c0, c1] = slab(o[1], u[1], y0, y1), t0 = Math.max(a0, c0), t1 = Math.min(a1, c1);
    if (t0 <= t1) { lo = Math.min(lo, t0); hi = Math.max(hi, t1); }
  }
  for (const c of [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]] as P[]) {
    const w0 = o[0] - c[0], w1 = o[1] - c[1], h = w0 * u[0] + w1 * u[1], disc = h * h - (w0 * w0 + w1 * w1 - m * m);
    if (disc >= 0) { lo = Math.min(lo, -h - Math.sqrt(disc)); hi = Math.max(hi, -h + Math.sqrt(disc)); }
  }
  return lo <= hi ? [lo, hi] : undefined;
}
// A label's points where they are drawn, for the few atoms with marks round them.
const placedPoints = (shape: Piece[]): P[] => shape.flatMap(({ pts, x, y, f }) => pts.map(([px, py]): P => [x + px * f, y + py * f]));

// scale: px per input unit. By default the median bond is drawn at the style's bond length.
// zRange: the depth range of the whole drawing for depth shading (renderParts gives it for each structure it draws);
// by default the range of mol's own atoms.
export function render(mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, scale?: number, zRange?: [number, number] | null): Drawing {
  return drawn(mol, s, measure, scale, zRange) as Drawing;
}
// Each atom's label ink box (a Drawing's label) and the scale, with the labels placed as render() places them but no
// bonds or marks drawn: a sixth of render()'s time, for a repair that moves atoms a step at a time (chem.ts). scale:
// as render()'s.
export const labelInk = (mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, scale?: number) => drawn(mol, s, measure, scale, undefined, true);
// The box round a label's glyph boxes.
const around = (bs: Box[]): Box | undefined => (bs.length ? bs.reduce((b, c) => [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[2]), Math.max(b[3], c[3])]) : undefined);
// only: stop once the labels are placed (labelInk).
function drawn(mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, scale?: number, zRange?: [number, number] | null, only = false): Drawing | Pick<Drawing, "label" | "scale"> {
  const raw = mol.bonds.map((b) => len(sub(mol.atoms[b.atoms[0]].location as unknown as P, mol.atoms[b.atoms[1]].location as unknown as P)));
  const median = [...raw].sort((x, y) => x - y)[Math.floor(raw.length / 2)] || 1;
  const k = scale ?? s.bond / median;
  const pts: P[] = mol.atoms.map((a) => [a.location[0] * k, -a.location[1] * k]); // KET y points up
  // A bond seen end on (a structure in perspective looked at down a bond: a Newman projection): its atoms less than a
  // tenth of its length apart on the page. It is not drawn, and the atom behind, when it has no label, is a circle
  // its other bonds start from (endOn: the atom behind, by bond).
  const endOn = new Map<Bond, number>();
  for (const b of mol.bonds) {
    const [p, q] = b.atoms.map((i) => mol.atoms[i].location), flat = Math.hypot(p[0] - q[0], p[1] - q[1]), deep = Math.abs((p[2] ?? 0) - (q[2] ?? 0));
    if (deep > 0.3 && flat < 0.1 * Math.hypot(flat, deep)) endOn.set(b, (p[2] ?? 0) < (q[2] ?? 0) ? b.atoms[0] : b.atoms[1]);
  }
  // The neighbours in view: an H hidden by Toggle Hydrogen Display is not one, nor the atom at the far end of a bond seen
  // end on. A carbon with all its H hidden is then labelled as a lone carbon is (CH4), and a labelled carbon counts its
  // hidden H in its label (CH3).
  const nbrs: number[][] = mol.atoms.map(() => []);
  mol.bonds.forEach((b) => { if (!mol.atoms[b.atoms[0]].hidden && !mol.atoms[b.atoms[1]].hidden && !endOn.has(b)) { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); } });
  const bondAt = new Map<string, Bond>();
  const key = (i: number, j: number) => (i < j ? `${i} ${j}` : `${j} ${i}`);
  mol.bonds.forEach((b) => bondAt.set(key(b.atoms[0], b.atoms[1]), b));
  // Rings go through covalent bonds only: a hydrogen bond closes no ring.
  const covalent = mol.bonds.some((b) => b.type === HBOND) ? nbrs.map((ns, i) => ns.filter((j) => bondAt.get(key(i, j))!.type !== HBOND)) : nbrs;
  // Each atom's lengths at its scale, made once per scale.
  const zs = new Map<number, Z>();
  const zOf = (f: number): Z => {
    let z = zs.get(f);
    if (!z) zs.set(f, (z = { L: s.bond * f, hw: (s.line / 2) * f, wide: s.bold * 0.75 * f, tip: TIP * s.bond * f, bold: s.bold * f, spacing: s.spacing * f, hash: s.hash * f, margin: s.margin * f, size: s.size * f }));
    return z;
  };
  const atomZ = mol.atoms.map((a) => zOf(scaleOf(a)));
  const deg = (i: number) => nbrs[i].length;
  const dir = (i: number, j: number) => unit(sub(pts[j], pts[i]));

  // Labels. Heteroatoms and lone carbons get one; skeletal carbons don't, even when charged.
  // A multi-centre or variable attachment shows only as an asterisk, until a bond is drawn to it.
  const labelled = mol.atoms.map((a, i) => (a.centre ? !deg(i) : !a.attach && !a.bead && !a.hidden && (a.label !== 'C' || !deg(i) || !!a.text || !!a.isotope || !!a.shown || (deg(i) === 1 ? !!s.terminal : !!s.carbons))));
  // The circle of an atom behind a bond seen end on (a Newman projection's back carbon): its radius, 0.4 bond lengths.
  const newman = new Map<number, number>();
  for (const back of endOn.values()) if (!labelled[back]) newman.set(back, 0.4 * zOf(scaleOf(mol.atoms[back])).L);
  const labels: Label[] = [], labelAtom = new Map<Label, number>();
  const marks: P[][] = mol.atoms.map(() => []); // ink that is not a label shape (a skeletal carbon's charge)
  const skeletalSign: (P | undefined)[] = []; // where a skeletal carbon's charge is drawn, to move it (electrons)
  const sign = (c: number) => `${Math.abs(c) > 1 ? Math.abs(c) : ''}${c > 0 ? '+' : '–'}`;
  // A diamond or star attachment point, ChemDraw's size: three quarters of the label size and two line widths across.
  const pointR = (0.75 * s.size + 2 * s.line) / 2;
  const pointOutline = (st: "diamond" | "star"): P[] => st === "diamond"
    ? [[pointR, 0], [0, pointR], [-pointR, 0], [0, -pointR]]
    : Array.from({ length: 10 }, (_, k): P => { const t = -Math.PI / 2 + (k * Math.PI) / 5, r = k % 2 ? 0.45 * pointR : pointR; return [r * Math.cos(t), r * Math.sin(t)]; });
  // Each label's size against the document's: its own size, times its atom's scale.
  const ratio = mol.atoms.map((a) => (a.size && s.labelPt ? a.size / s.labelPt : 1) * scaleOf(a));
  const grown = (m: Ink, r: number): Ink => (r === 1 ? m : { width: m.width * r, ascent: m.ascent * r, outline: m.outline.map(([px, py]) => [px * r, py * r] as P) });
  // Each label's runs as drawn: the line each is on (0 the attaching line, 1 on for stacked lines, -1 a raised charge or
  // mass number), its text, advance and outline; and the label's cap height. The clips below are made from them.
  type Run = { line: number; text: string; width: number; p: Piece };
  const runsAt: Run[][] = mol.atoms.map(() => []), capAt: number[] = mol.atoms.map(() => 0);
  // The glyph a bond meets, where it is the same whichever way the label reads (O of OH and HO, C of CF3 and F3C).
  const meets: (Run | undefined)[] = mol.atoms.map(() => undefined);
  // What a bond stops at, a margin short: boxes, and outlines (a diamond's or star's, or a glyph's).
  const clips: { boxes: Box[]; pieces: Piece[] }[] = mol.atoms.map(() => ({ boxes: [], pieces: [] }));
  const shapes: Piece[][] = mol.atoms.map((a, i) => {
    // A Newman projection's back carbon: its bonds start at its circle (the margin and the line's half width inside it).
    const R = newman.get(i);
    if (R) {
      const { margin, hw } = atomZ[i], r = Math.max(0.05 * R, R - margin - hw);
      clips[i].pieces = [{ pts: Array.from({ length: 48 }, (_, j): P => [r * Math.cos((2 * Math.PI * j) / 48), r * Math.sin((2 * Math.PI * j) / 48)]), x: pts[i][0], y: pts[i][1], f: 1 }];
      return clips[i].pieces;
    }
    // The bond stops at a diamond or star: its outline, drawn in a margin, cuts the bond as a label does.
    if (a.attach === "diamond" || a.attach === "star") {
      const f = scaleOf(a), inset = Math.max(0.2, 1 - s.margin / pointR), edge = pointOutline(a.attach).map((q) => mul(q, f));
      clips[i].pieces = [{ pts: edge.flatMap((q, k) => { const r = edge[(k + 1) % edge.length]; return Array.from({ length: 6 }, (_, j): P => mul(add(q, mul(sub(r, q), j / 6)), inset)); }), x: pts[i][0], y: pts[i][1], f: 1 }];
      return clips[i].pieces;
    }
    // The label in its own style: measured in its face, and scaled by its size against the document's.
    const face: Face | undefined = a.font || a.bold || a.italic ? { font: a.font, bold: a.bold, italic: a.italic } : undefined;
    const r = ratio[i], S = s.size * r;
    const M = !face && r === 1 ? measure : (t: string): Ink => grown(measure(t, face), r);
    if (!labelled[i]) {
      // A charged skeletal carbon: the sign alone, in the direction furthest from its bonds (up-right on a tie), or
      // where it was moved by hand (Atom.angles charge; y is down here).
      if (a.charge && !a.circled) {
        const t = sign(a.charge), m = M(t), dirs = nbrs[i].map((j) => dir(i, j)), deg = a.angles?.charge;
        const gap = (c: P) => Math.min(...dirs.map((b) => angle(b, c)));
        const d: P = deg !== undefined ? [Math.cos((-deg * Math.PI) / 180), Math.sin((-deg * Math.PI) / 180)]
          : ([[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]] as P[]).map(unit).reduce((best, c) => (gap(c) > gap(best) + 0.01 ? c : best));
        const c = add(pts[i], mul(d, 0.6 * S));
        skeletalSign[i] = c;
        labels.push({ text: t, x: c[0] - (m.width * SUB) / 2, y: c[1] + (m.ascent * SUB) / 2, size: S * SUB, colour: a.colour });
        labelAtom.set(labels[labels.length - 1], i);
        marks[i] = m.outline.map(([px, py]) => [c[0] - (m.width * SUB) / 2 + px * SUB, c[1] + (m.ascent * SUB) / 2 + py * SUB]);
      }
      return [];
    }
    const look = { ...(a.font ? { font: a.font } : {}), ...(a.bold ? { bold: true } : {}), ...(a.italic ? { italic: true } : {}), ...(a.underline ? { underline: true } : {}) };
    const shape: Piece[] = [];
    capAt[i] = M('H').ascent;
    // A written label with some characters bold, italic or underlined (its runs): each character's style, by its place
    // in the text. Text from place at is measured and drawn piece by piece, each piece in its own style.
    const styled = a.text && a.runs && plainOf(a.runs) === a.text ? a.runs.flatMap((x) => x.text.split("").map(() => x)) : undefined;
    // A piece in superscript or subscript (issue 44) is drawn as a mass number or count is: k its size against the
    // rest, dy how far its baseline moves (down is positive). Text already drawn small (a count, a charge) is not
    // moved again: script applies at full size only (f 1).
    const stylePieces = (text: string, at?: number, f = 1): { text: string; look: typeof look; m: Ink; k: number; dy: number }[] => {
      if (!styled || at === undefined) return [{ text, look, m: M(text), k: 1, dy: 0 }];
      const out: { text: string; look: typeof look; script?: "sub" | "super" }[] = [];
      for (let k = 0; k < text.length; k++) {
        const st = styled[at + k], last = out[out.length - 1];
        if (last && k && styled[at + k - 1] === st) { last.text += text[k]; continue; }
        out.push({ text: text[k], look: { ...look, ...(st?.bold ? { bold: true } : {}), ...(st?.italic ? { italic: true } : {}), ...(st?.underline ? { underline: true } : {}) }, ...(st?.script && f === 1 ? { script: st.script } : {}) });
      }
      return out.map(({ script, ...p }) => {
        const fc = p.look.font || p.look.bold || p.look.italic ? { font: p.look.font, bold: p.look.bold, italic: p.look.italic } : undefined;
        return { ...p, m: !fc && r === 1 ? measure(p.text) : grown(measure(p.text, fc), r), k: script ? SUB : 1, dy: script === "super" ? -RISE * S : script === "sub" ? DROP * S : 0 };
      });
    };
    // Text measured as drawn: from place at in a written label, each piece in its own style.
    const Mx = (text: string, at?: number, f = 1): Ink => {
      const ps = stylePieces(text, at, f);
      if (ps.length === 1 && ps[0].k === 1) return ps[0].m;
      let x = 0;
      const outline: P[] = [];
      for (const p of ps) { for (const [px, py] of p.m.outline) outline.push([x + px * p.k, py * p.k + p.dy]); x += p.m.width * p.k; }
      return { width: x, ascent: Math.max(...ps.map((p) => p.m.ascent * p.k - p.dy)), outline };
    };
    // Units with superscript or subscript set by hand (issue 44). A count in a script is drawn in it, so it joins the
    // unit's text (13 raised before C is not a count of 1). from: the place of the first unit in the label's text.
    const scripted = (n: number) => !!styled?.[n]?.script;
    const fix = <U extends { text: string; count?: string }>(list: U[], from = 0): U[] => {
      if (!styled) return list;
      let n = from;
      return list.map((u) => { const at = n; n += u.text.length + (u.count?.length ?? 0); return u.count && scripted(at + u.text.length) ? { ...u, text: u.text + u.count, count: undefined } : u; });
    };
    // The units read right to left: a unit all in a script (the III of Fe with III raised) stays after the unit before it.
    const backwards = <U extends { text: string; count?: string }>(list: U[]): U[] => {
      const groups: U[][] = [];
      let n = 0;
      for (const u of list) {
        const len = u.text.length + (u.count?.length ?? 0), all = !!styled && len > 0 && Array.from({ length: len }, (_, k) => scripted(n + k)).every(Boolean);
        n += len;
        if (all && groups.length) groups[groups.length - 1].push(u); else groups.push([u]);
      }
      return groups.reverse().flat();
    };
    // A run of text from x on baseline y at size f, on a line of the label (-1: raised, a charge or mass number). at: its
    // place in a written label's text, for the style of each character.
    const run = (text: string, x: number, y: number, f = 1, line = 0, at?: number): Run | undefined => {
      let px = x;
      for (const p of stylePieces(text, at, f)) {
        labels.push({ text: p.text, x: px, y: y + p.dy, size: S * f * p.k, colour: a.colour, ...p.look });
        labelAtom.set(labels[labels.length - 1], i);
        px += p.m.width * f * p.k;
      }
      const m = Mx(text, at, f);
      if (!m.outline.length) return undefined;
      const r = { line, text, width: m.width, p: { pts: m.outline, x, y, f } };
      shape.push(r.p);
      runsAt[i].push(r);
      return r;
    };
    // The charge sign, where signSpot puts it: left and right are the ends of the label's attaching line, base its
    // baseline.
    const charged = (left: number, right: number, base: number, rtl: boolean) => {
      if (!a.charge || a.circled) return;
      const t = sign(a.charge), m = M(t), ink = m.outline.length ? m.outline.map(([px, py]): P => [px * SUB, py * SUB]) : ([[0, -m.ascent * SUB], [m.width * SUB, 0]] as P[]);
      const { bonds, rings } = signBonds(i, nbrs, covalent, (p, q) => bondAt.get(key(p, q))!, (j) => labelled[j], (j) => pts[j], atomZ[i]);
      const { at } = signSpot(pts[i], bonds, rings, left, right, base - RISE * S, m.width * SUB, ink, rtl, placedPoints(shape), S);
      run(t, at[0], at[1], SUB, -1);
    };
    // A text's ink, left and right of where it starts; and how far left of the middle of a glyph its ink starts.
    const inkOf = (t: string): [number, number] => { const o = M(t).outline; if (!o.length) return [0, 0]; const b = outlineBox(o); return [b[0], b[2]]; };
    const near = (ch: string) => M(ch).width / 2 - inkOf(ch)[0];
    const [x, y] = pts[i];
    // Which way the label reads: away from the bonds. Bonds on the right (within 70° of horizontal) reverse it, as a
    // right alignment set by hand does. Read left to right, its first glyph sits centred on the atom. Read right to
    // left, the glyph a bond meets stays centred if it is the same glyph (MeO, HO, F3C, a lone O); if not (Br, Ph),
    // the label's ink ends as far right of the atom as it would start left of it read left to right, so bonds from
    // either side stop the same distance away. A charge sign is not counted: it goes after a label read left to right
    // (O⁻, H₃N⁺) and before one read right to left (⁻O, ⁺H₃N), away from the bonds, unless a bond leaves through that
    // place (signSpot).
    const v = nbrs[i].reduce<P>((acc, j) => add(acc, dir(i, j)), [0, 0]);
    const steep = len(v) > 1e-6 && Math.abs(v[1]) > Math.abs(v[0]) * Math.tan((70 * Math.PI) / 180);
    const align = a.align, rtl = align ? align === "right" : deg(i) > 0 && !steep && v[0] > 1e-6;
    if (a.centre) {
      const m = M('*');
      meets[i] = run('*', x - m.width / 2, y + m.ascent / 2);
      return shape;
    }
    const ql = queryLabel(a.text);
    if (a.text && (ql === 'list' || ql === 'alt' || ql === 'link')) {
      // An element list, alternative group or link node reads as typed, never reversed. Counts in it (CH₂) and a link
      // node's repeat range ([CH₂]₃₋₇) are subscript.
      const range = ql === 'link' ? /\d{1,2}-\d{1,2}$/.exec(a.text)![0] : '', pieces: { t: string; f: number }[] = [];
      for (const t of a.text.slice(0, a.text.length - range.length).match(/\d+|\D+/g) ?? []) pieces.push({ t, f: /^\d/.test(t) && /[A-Za-z)]$/.test(pieces[pieces.length - 1]?.t ?? '') ? SUB : 1 });
      if (range) pieces.push({ t: range, f: SUB });
      const width = pieces.reduce((n, p) => n + M(p.t).width * p.f, 0), first = M(a.text[0]), base = y + first.ascent / 2;
      let px = 0, right = -Infinity;
      for (const p of pieces) { right = Math.max(right, px + inkOf(p.t)[1] * p.f); px += M(p.t).width * p.f; }
      const cx = rtl ? x + near(a.text[0]) - right : x - first.width / 2;
      px = cx;
      for (const p of pieces) { run(p.t, px, p.f === 1 ? base : base + DROP * S, p.f); px += M(p.t).width * p.f; }
      charged(cx, cx + width, base, rtl);
      return shape;
    }
    if (a.text?.includes("\n")) {
      // A label of more than one line (Option-Return as it is typed, as in ChemDraw): each line reads as typed (never
      // reversed), its counts subscript. The attaching line (the first; the last when stacked above) sits on the atom:
      // its first glyph centred on it, or read right to left its last glyph, or centred (or stacked), the whole line.
      // The other lines go a caption's automatic line spacing apart, lined up with it: the same start, the same end
      // read right to left, centred on the atom when centred or stacked. Bonds stop at the box round each line.
      const rows = a.text.split("\n"), k0 = align === "above" ? rows.length - 1 : 0, own = rows[k0] || "H";
      const us = rows.map((t, j) => fix(units(t).flatMap(pieces), rows.slice(0, j).reduce((n, r) => n + r.length + 1, 0)));
      // Each unit's place in the text, for its style.
      const at = new Map<(typeof us)[number][number], number>();
      let place = 0;
      us.forEach((line) => { for (const u of line) { at.set(u, place); place += u.text.length + (u.count?.length ?? 0); } place++; });
      const wide = (u: (typeof us)[number][number]) => Mx(u.text, at.get(u)).width + (u.count ? Mx(u.count, at.get(u)! + u.text.length, SUB).width * SUB : 0);
      const widths = us.map((line) => line.reduce((w, u) => w + wide(u), 0)), tail = us[k0][us[k0].length - 1];
      const just = align === "centre" || align === "above" || align === "below" ? "centre" : align === "right" || (!align && rtl) ? "right" : "left";
      const o = rows.slice(0, k0).reduce((n, t) => n + t.length + 1, 0), last = o + own.length - 1;
      const first = Mx(own[0], o), base = y + first.ascent / 2, start = x - first.width / 2, end = x + (tail?.count ? Mx(tail.count.slice(-1), last, SUB).width * SUB : Mx(own[own.length - 1], last).width) / 2;
      const from = (j: number) => (just === "centre" ? x - widths[j] / 2 : just === "right" ? end - widths[j] : start);
      us.forEach((line, j) => {
        let ux = from(j);
        const uy = base + (j - k0) * LINE * S, n = j === k0 ? 0 : j + 1;
        for (const u of line) {
          run(u.text, ux, uy, 1, n, at.get(u));
          if (u.count) run(u.count, ux + Mx(u.text, at.get(u)).width, uy + DROP * S, SUB, n, at.get(u)! + u.text.length);
          ux += wide(u);
        }
      });
      charged(from(k0), from(k0) + widths[k0], base, just === "right");
      return shape;
    }
    if (a.text) {
      // A written label: units in order, reversed when it reads right to left (OMe as MeO). Centred, the whole label
      // sits on the atom; stacked, each unit after the first goes one line further up (or down), centred over the atom.
      const us = fix(units(a.text)), at = new Map<(typeof us)[number], number>();
      // Each unit's place in the text, for its style (a label's runs).
      us.reduce((n, u) => { at.set(u, n); return n + u.text.length + (u.count?.length ?? 0); }, 0);
      // Units as drawn, each piece of a bracket with its own place (labels.ts pieces).
      const split = (list: typeof us) => list.flatMap((u) => { let n = at.get(u)!; return pieces(u).map((q) => { at.set(q, n); n += q.text.length + (q.count?.length ?? 0); return q; }); });
      const W = (u: (typeof us)[number]) => Mx(u.text, at.get(u)).width, count = (u: (typeof us)[number]) => at.get(u)! + u.text.length;
      const width = (u: (typeof us)[number]) => W(u) + (u.count ? Mx(u.count, count(u), SUB).width * SUB : 0);
      const first = Mx(us[0].text[0], 0), base = y + first.ascent / 2, same = !us[0].count && [...us[0].text].length === 1;
      if (align === "above" || align === "below") {
        const pitch = STACK * M('H').ascent * (align === "above" ? -1 : 1);
        const wide = (u: (typeof us)[number]) => split([u]).reduce((w, q) => w + width(q), 0);
        us.forEach((u, k) => {
          let ux = k ? x - wide(u) / 2 : x - first.width / 2;
          const uy = base + k * pitch;
          split([u]).forEach((q, j) => {
            const r = run(q.text, ux, uy, 1, k, at.get(q));
            if (!k && !j && same) meets[i] = r;
            if (q.count) run(q.count, ux + W(q), uy + DROP * S, SUB, k, count(q));
            ux += width(q);
          });
        });
        charged(x - first.width / 2, x - first.width / 2 + wide(us[0]), base, false);
        return shape;
      }
      const order = split(rtl ? backwards(us) : us), total = order.reduce((w, u) => w + width(u), 0);
      let ux = 0, right = -Infinity;
      for (const u of order) { right = Math.max(right, ux + inkOf(u.text)[1], u.count ? ux + W(u) + inkOf(u.count)[1] * SUB : -Infinity); ux += width(u); }
      let cx = align === "centre" ? x - total / 2 : !rtl ? x - first.width / 2 : same ? x + first.width / 2 - total : x + near(us[0].text[0]) - right;
      const start = cx;
      for (const u of order) {
        const r = run(u.text, cx, base, 1, 0, at.get(u));
        if (u === us[0] && same) meets[i] = r;
        if (u.count) run(u.count, cx + W(u), base + DROP * S, SUB, 0, count(u));
        cx += width(u);
      }
      charged(start, cx, base, rtl);
      return shape;
    }
    const first = M(a.label[0]), charge = a.charge ?? 0, lw = M(a.label).width;
    const used = nbrs[i].reduce((n, j) => n + orderOf(bondAt.get(key(i, j))!.type), 0);
    const h = s.hideH ? 0 : a.implicitHCount ?? hydrogens(a.label, charge, used, a.radical === 3 ? 2 : a.radical);
    const count = h > 1 ? String(h) : '';
    const hW = M('H').width, cW = count ? M(count).width * SUB : 0;
    const iso = a.isotope ? String(a.isotope) : '', isoW = iso ? M(iso).width * SUB : 0;
    // H goes first when the label reads right to left (HO, H2N), and on a lone atom written that way (H2O, HCl): the
    // element ends the label. Centred by hand: the element (Os) or the element and its H together sit on the atom.
    const back = rtl || (!align && !deg(i) && !!h && H_FIRST.has(a.label)), same = [...a.label].length === 1;
    const ox = align === "centre" ? x - (lw + (h ? hW + cW : 0)) / 2 : back && !same ? x + near(a.label[0]) - inkOf(a.label)[1] : x - first.width / 2, base = y + first.ascent / 2;
    const el = run(a.label, ox, base);
    if (same) meets[i] = el;
    // An isotope's mass number, raised, just before the element (after an H that goes first: H₃¹³C).
    if (iso) run(iso, ox - isoW, base - RISE * S, SUB, -1);
    const hs = (hx: number, hy: number, line = 0) => { run('H', hx, hy, 1, line); if (count) run(count, hx + hW, hy + DROP * S, SUB, line); };
    let end = ox + lw; // the charge goes here
    const pitch = STACK * M('H').ascent;
    if (h && align) {
      if (align === "right") hs(ox - isoW - hW - cW, base);
      else if (align === "above" || align === "below") hs(x - hW / 2, base + (align === "above" ? -pitch : pitch), 1);
      else { hs(end, base); end += hW + cW; }
    } else if (h) {
      // Sum of the bond directions: within 70° of horizontal, H goes on the far side; steeper, H stacks (indole NH).
      if (back) hs(ox - isoW - hW - cW, base); // HO, H2N
      else if (!steep || deg(i) < 2) { hs(end, base); end += hW + cW; } // OH, NH2
      else hs(x - hW / 2, base + (v[1] > 0 ? -pitch : pitch), 1);
    }
    charged(ox - isoW - (h && (align ? align === "right" : back) ? hW + cW : 0), end, base, rtl);
    return shape;
  });
  // A turned label (labelAngle) turns about its anchor, as ChemDraw turns a text about its p: the middle of its first
  // line when centred, else the end of its first line that the atom is nearer (where it starts, or ends read right to
  // left). Its glyph outlines turn with it.
  const turned = mol.atoms.map((a, i) => {
    const runs = runsAt[i];
    if (!a.labelAngle || !runs.length) return false;
    const line = runs.filter((r) => r.line <= 0), x = pts[i][0], start = Math.min(...line.map((r) => r.p.x)), end = Math.max(...line.map((r) => r.p.x + r.width * r.p.f));
    const pivot: P = [a.align === "centre" ? x : x - start <= end - x ? start : end, runs.find((r) => r.line === 0 && r.p.f === 1)?.p.y ?? runs[0].p.y];
    for (const { p } of runs) Object.assign(p, { pts: p.pts.map(([px, py]) => turnPx([p.x + px * p.f, p.y + py * p.f], pivot, a.labelAngle!)), x: 0, y: 0, f: 1 });
    for (const l of labels) if (labelAtom.get(l) === i) Object.assign(l, { angle: a.labelAngle, pivot });
    return true;
  });
  if (only) return { label: shapes.map((shape) => around(shape.map(pieceBox))), scale: k };
  // Bonds stop at the letter they meet; where that letter changes with the reading direction, at the label's box.
  // The letter (O of OH and HO, a ring's O, N or S) is its outline and that outline turned over about its middle, so
  // bonds from either side stop alike; the rest of the label is its glyph outlines. The box runs round each line of
  // the label, from the cap height to the baseline (further where a glyph's ink goes) and across the line's ink, so a
  // short letter (r of Br, e of Me) counts as full height. Subscripts, charges and mass numbers keep their outlines.
  // Bonds stop at a turned label's glyph outlines.
  runsAt.forEach((runs, i) => {
    if (turned[i]) return void clips[i].pieces.push(...runs.map((r) => r.p));
    const at = meets[i], lines = new Map<number, Run[]>();
    for (const r of runs) {
      if (at || r.p.f !== 1) clips[i].pieces.push(r.p);
      if (!at && r.line >= 0) lines.set(r.line, [...(lines.get(r.line) ?? []), r]);
    }
    if (at) clips[i].pieces.push({ ...at.p, pts: mirrored(at.p.pts, at.width) });
    for (const line of lines.values()) {
      const all = line.map((r) => pieceBox(r.p)), tall = line.filter((r) => r.p.f === 1).map((r) => pieceBox(r.p)), base = line.find((r) => r.p.f === 1)?.p.y ?? all[0][3];
      clips[i].boxes.push([Math.min(...all.map((b) => b[0])), Math.min(base - capAt[i], ...tall.map((b) => b[1])), Math.max(...all.map((b) => b[2])), Math.max(base, ...tall.map((b) => b[3]))]);
    }
  });

  // Marks around atoms: a circled charge, a partial charge, radical dots and lone pairs. A circled or partial
  // charge sits up and to the right when that is clear; the rest share out the widest gaps between the bonds and
  // the label, evenly spaced, and each sits just clear of the label.
  const symbols: P[][][] = mol.atoms.map(() => []);
  const electrons: { atom: number; at: P; key?: string }[] = skeletalSign.flatMap((at, i) => (at ? [{ atom: i, at, key: 'charge' }] : [])), beads: { at: P; r: number }[] = [];
  const TAU = 2 * Math.PI, turn = (x: number) => ((x % TAU) + TAU) % TAU;
  // Every polygon winds one way (see polygons below); a disc or ring built here is turned to match.
  const wound = (poly: P[]) => (poly.reduce((sum, q, j) => sum + cross(q, poly[(j + 1) % poly.length]), 0) > 0 ? poly.reverse() : poly);
  const disc = (c: P, r: number): P[] => wound(Array.from({ length: 20 }, (_, j) => add(c, [r * Math.cos((TAU * j) / 20), r * Math.sin((TAU * j) / 20)])));
  mol.atoms.forEach((a, i) => {
    if (a.hidden) return;
    const kinds: ('charge' | 'partial' | 'radical' | 'pair' | 'query')[] = [];
    if (a.circled && a.charge) kinds.push('charge');
    if (a.partial) kinds.push('partial');
    // The query indicator ChemDraw draws beside an atom with query properties (X2, H, R…).
    const indicator = atomIndicator(a.query);
    if (indicator) kinds.push('query');
    for (let r = 0; r < Math.min(2, a.radical === 3 ? 0 : a.radical ?? 0); r++) kinds.push('radical');
    if (a.radical === 3) kinds.push('pair');
    for (let r = 0; r < Math.min(4, a.pairs ?? 0); r++) kinds.push('pair');
    if (!kinds.length) return;
    // Marks are sized by the atom's drawn label size, and drawn in its line width.
    const X = pts[i], z = s.size * ratio[i], hw = atomZ[i].hw, shape = placedPoints(shapes[i]);
    // Directions already taken: the bonds, the label past its first letter (H, a charge sign), a skeletal charge.
    const taken = nbrs[i].map((j) => { const d = dir(i, j); return Math.atan2(d[1], d[0]); });
    for (const q of [...shape, ...marks[i]]) if (len(sub(q, X)) > 0.62 * z) taken.push(Math.atan2(q[1] - X[1], q[0] - X[0]));
    const clearOf = (t: number, need: number) => taken.every((b) => Math.abs(Math.atan2(Math.sin(t - b), Math.cos(t - b))) >= need);
    const at = new Map<number, number>(); // index in kinds → angle
    // Marks placed by hand keep their angle (y is down here, so the angle turns the other way).
    const keys = kinds.map((kind, k) => (kind === 'charge' || kind === 'partial' ? kind : `${kind}${kinds.slice(0, k).filter((x) => x === kind).length}`));
    keys.forEach((key, k) => { const deg = a.angles?.[key]; if (deg !== undefined) { at.set(k, (-deg * Math.PI) / 180); taken.push((-deg * Math.PI) / 180); } });
    const UP_RIGHT = -Math.PI / 4;
    if (!at.has(0) && (kinds[0] === 'charge' || kinds[0] === 'partial' || kinds[0] === 'query') && clearOf(UP_RIGHT, Math.PI / 5)) { at.set(0, UP_RIGHT); taken.push(UP_RIGHT); }
    const rest = kinds.map((_, k) => k).filter((k) => !at.has(k));
    const sorted = taken.map(turn).sort((x, y) => x - y);
    const gaps = sorted.length
      ? sorted.map((t, j) => ({ start: t, size: j + 1 < sorted.length ? sorted[j + 1] - t : sorted[0] + TAU - t, n: 0 }))
      : [{ start: -Math.PI / 2 - Math.PI / Math.max(1, rest.length), size: TAU, n: 0 }];
    for (const _ of rest) gaps.reduce((best, g) => (g.size / (g.n + 1) > best.size / (best.n + 1) + 1e-6 ? g : best)).n++;
    let next = 0;
    for (const g of gaps.sort((x, y) => x.start - y.start)) for (let j = 0; j < g.n; j++) at.set(rest[next++], g.start + (g.size * (j + 1)) / (g.n + 1));
    kinds.forEach((kind, k) => {
      const t = at.get(k)!, d: P = [Math.cos(t), Math.sin(t)], n = perp(d);
      // The mark as discs (centre offset across, radius); how far out it goes is found by search.
      const R = kind === 'charge' ? 0.34 * z : kind === 'radical' ? 0.1 * z : kind === 'pair' ? 0.09 * z : 0;
      const text = kind === 'partial' ? (a.partial === '+' ? 'δ+' : 'δ–') : kind === 'query' ? indicator : '', ink = text ? grown(measure(text), ratio[i]) : undefined;
      const parts: [number, number][] = kind === 'pair' ? [[0.19 * z, R], [-0.19 * z, R]] : ink ? [[0, (Math.max(ink.width, ink.ascent) * SUB) / 2]] : [[0, R]];
      const gap = 0.14 * z;
      const fits = (r: number) => parts.every(([o, pr]) => { const c = add(add(X, mul(d, r)), mul(n, o)); return shape.every((q) => len(sub(q, c)) >= pr + gap); });
      // Start past the label along the way out (so nothing sits inside a letter's counter), then find the
      // nearest distance that clears every outline point.
      const corridor = Math.max(...parts.map(([o, pr]) => Math.abs(o) + pr)) + gap;
      let lo = shape.length ? Math.max(0, ...shape.filter((q) => Math.abs(cross(sub(q, X), d)) < corridor).map((q) => dot(sub(q, X), d))) : 0.3 * z + Math.max(...parts.map((x) => x[1]));
      let hi = lo + 3 * z;
      if (!fits(lo)) { for (let j = 0; j < 24; j++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; } lo = hi; }
      const c = add(X, mul(d, lo));
      if (kind === 'pair' && a.bars) {
        // A lone pair as a bar across the way out, as long as the dot pair is wide, in the line width.
        const e = 0.19 * z + R;
        symbols[i].push(wound([add(add(c, mul(n, -e)), mul(d, -hw)), add(add(c, mul(n, e)), mul(d, -hw)), add(add(c, mul(n, e)), mul(d, hw)), add(add(c, mul(n, -e)), mul(d, hw))]));
        electrons.push({ atom: i, at: c, key: keys[k] });
      } else if (kind === 'radical' || kind === 'pair') { for (const [o, pr] of parts) symbols[i].push(disc(add(c, mul(n, o)), pr)); electrons.push({ atom: i, at: c, key: keys[k] }); }
      else electrons.push({ atom: i, at: c, key: keys[k] });
      if (kind === 'charge') {
        // A ring the line width thick, with the sign inside it.
        for (let j = 0; j < 40; j++) {
          const a0 = (TAU * j) / 40, a1 = (TAU * (j + 1)) / 40, ro = R + hw, ri = R - hw;
          symbols[i].push(wound([add(c, [ri * Math.cos(a0), ri * Math.sin(a0)]), add(c, [ro * Math.cos(a0), ro * Math.sin(a0)]), add(c, [ro * Math.cos(a1), ro * Math.sin(a1)]), add(c, [ri * Math.cos(a1), ri * Math.sin(a1)])]));
        }
        // A charge of 2 or more (Circled negative clicked again) shows its number and sign inside the ring: 2−, 3+.
        const q = Math.abs(a.charge ?? 0);
        if (q > 1) {
          const sign = `${q}${a.charge! > 0 ? '+' : '−'}`, m = grown(measure(sign), ratio[i]), size = Math.min(SUB, (1.35 * R) / m.width, (1.1 * R) / m.ascent);
          const x = c[0] - (m.width * size) / 2, y = c[1] + (m.ascent * size) / 2;
          labels.push({ text: sign, x, y, size: z * size, colour: a.colour });
          labelAtom.set(labels[labels.length - 1], i);
        } else {
          const arm = 0.58 * R, bar = (u: P) => symbols[i].push(wound([add(c, add(mul(u, -arm), mul(perp(u), -hw))), add(c, add(mul(u, -arm), mul(perp(u), hw))), add(c, add(mul(u, arm), mul(perp(u), hw))), add(c, add(mul(u, arm), mul(perp(u), -hw)))]));
          bar([1, 0]);
          if ((a.charge ?? 0) > 0) bar([0, 1]);
        }
      }
      if (ink) {
        const x = c[0] - (ink.width * SUB) / 2, y = c[1] + (ink.ascent * SUB) / 2;
        labels.push({ text, x, y, size: z * SUB, colour: a.colour });
        labelAtom.set(labels[labels.length - 1], i);
        for (const [px, py] of ink.outline) marks[i].push([x + px * SUB, y + py * SUB]);
      }
    });
  });

  // An H dot sits on the atom; an H hash points into the widest gap; an attachment squiggle crosses the bond at the
  // atom; a bead is a sphere on the atom.
  mol.atoms.forEach((a, i) => {
    if (!a.hmark && !a.attach && !a.bead) return;
    const X = pts[i], dirs = nbrs[i].map((j) => dir(i, j)), { L, hw } = atomZ[i];
    if (a.hmark === 'dot') symbols[i].push(disc(X, 0.09 * L));
    if (a.hmark === 'dash') {
      const angles = dirs.map((d) => Math.atan2(d[1], d[0])).sort((x, y) => x - y);
      let best = -Math.PI / 2;
      if (angles.length) {
        const gaps = angles.map((t, j) => ({ t, size: (j + 1 < angles.length ? angles[j + 1] : angles[0] + 2 * Math.PI) - t }));
        const g = gaps.reduce((p, q) => (q.size > p.size ? q : p));
        best = g.t + g.size / 2;
      }
      const u: P = [Math.cos(best), Math.sin(best)], n = perp(u);
      for (let k = 1; k <= 3; k++) {
        const c = add(X, mul(u, 0.1 * L * k)), half = 0.04 * L + 0.025 * L * k;
        symbols[i].push(wound([add(add(c, mul(n, -half)), mul(u, -hw)), add(add(c, mul(n, half)), mul(u, -hw)), add(add(c, mul(n, half)), mul(u, hw)), add(add(c, mul(n, -half)), mul(u, hw))]));
      }
    }
    if (a.attach === "diamond" || a.attach === "star") {
      // Its outline, in three quarters of the line width.
      const edge = pointOutline(a.attach).map((q) => add(X, mul(q, scaleOf(a)))), w = 0.375 * s.line * scaleOf(a);
      edge.forEach((q, k) => { const r = edge[(k + 1) % edge.length], u = unit(sub(r, q)), n = perp(u); symbols[i].push(wound([add(add(q, mul(n, -w)), mul(u, -w)), add(add(q, mul(n, w)), mul(u, -w)), add(add(r, mul(n, w)), mul(u, w)), add(add(r, mul(n, -w)), mul(u, w))])); });
    } else if (a.attach) {
      // A wave across the bond, 0.6 bond lengths long.
      const u = dirs[0] ?? [1, 0], n = perp(u), wave = waveAlong([add(X, mul(n, -0.3 * L)), add(X, mul(n, 0.3 * L))], 0.05 * L, 0.15 * L);
      for (let k = 0; k + 1 < wave.length; k++) {
        const p = wave[k], q = wave[k + 1], v = unit(sub(q, p)), m = perp(v);
        symbols[i].push(wound([add(p, mul(m, -hw)), add(p, mul(m, hw)), add(q, mul(m, hw)), add(q, mul(m, -hw))]));
      }
    }
    if (a.bead) { beads.push({ at: X, r: 0.3 * L }); for (const q of [add(X, [-0.3 * L, -0.3 * L]), add(X, [0.3 * L, 0.3 * L])]) marks[i].push(q); }
  });
  // A Newman projection's back carbon: a circle in the line width.
  for (const [i, R] of newman) {
    const X = pts[i], hw = atomZ[i].hw, at = (r: number, j: number): P => add(X, [r * Math.cos((2 * Math.PI * j) / 48), r * Math.sin((2 * Math.PI * j) / 48)]);
    for (let j = 0; j < 48; j++) symbols[i].push(wound([at(R - hw, j), at(R + hw, j), at(R + hw, j + 1.02), at(R - hw, j + 1.02)]));
  }

  const plans: Plan[] = mol.bonds.map((bond) => {
    const [a, b] = bond.atoms, p = pts[a], q = pts[b];
    const length = len(sub(q, p)), u = unit(sub(q, p)), n = perp(u);
    // A bond with its own double-bond spacing (from ChemDraw) keeps it.
    const z0 = zOf((scaleOf(mol.atoms[a]) + scaleOf(mol.atoms[b])) / 2), z = bond.spacing === undefined ? z0 : { ...z0, spacing: (bond.spacing / 100) * z0.L }, { L, hw } = z;
    const plan: Plan = { a, b, u, n, length, kind: 'line', lines: [], cut: [0, 0], z, ...(mol.atoms[a].hidden || mol.atoms[b].hidden ? { hidden: true } : {}) };
    if (endOn.has(bond)) return { ...plan, u: [1, 0] as P, n: [0, 1] as P, hidden: true };
    const side = (j: number) => Math.sign(dot(sub(pts[j], p), n));
    // Angles at x from the bond to x's other neighbours on one side, smallest first.
    const near = (x: number, y: number, sd: number) =>
      nbrs[x].filter((j) => j !== y && side(j) === sd).map((j) => angle(sub(pts[y], pts[x]), sub(pts[j], pts[x]))).sort((m, l) => m - l);

    // A delocalised bond takes the single bond styles too (a π ligand's ring drawn in perspective).
    const single = bond.type === 1 || bond.type === 4;
    if (single && (bond.stereo === 1 || bond.stereo === 6)) { plan.kind = bond.stereo === 1 ? 'wedge' : 'hash'; return plan; }
    if (single && bond.display) {
      if (bond.display === 'bold') plan.half = z.bold / 2;
      else if (bond.display === 'dative') plan.head = true;
      else plan.kind = bond.display === 'dashed' ? 'dash' : bond.display === 'hashed' ? 'hashbar' : bond.display === 'hollow' ? 'hollow' : 'wavy';
      return plan;
    }
    if (bond.type === HBOND) { plan.kind = 'dot'; return plan; }
    if (bond.type === 3) { plan.lines = [z.spacing, -z.spacing].map((o) => ({ o, t0: 0, t1: 0 })); return plan; }
    // A quadruple bond, as ChemDraw draws it: four lines one spacing apart, centred on the axis.
    if (bond.type === QUADRUPLE) { plan.kind = 'none'; plan.lines = [1.5, 0.5, -0.5, -1.5].map((k) => ({ o: k * z.spacing, t0: 0, t1: 0 })); return plan; }
    if (bond.type !== 2) return plan;
    // Bold double (ChemDraw's ⇧B): the main line bold, the second line normal and moved out by the extra width, so
    // the gap between them looks the same as a plain double bond's.
    const bold = bond.display === "bold", extra = bold ? z.bold / 2 - hw : 0, spacing = z.spacing + extra;
    // Double Either: two lines crossing between the atoms, whatever the ring or substituents.
    if (bond.display === "either") { plan.kind = 'none'; plan.cross = true; return plan; }

    // Side of the second line: into the ring with the most double bonds (then six-membered, then smallest),
    // toward the inside of the angle at an unlabelled degree-2 end, or toward more substituents. 0 = centred.
    let sd = 0, ring: number[] | undefined;
    const rings = ringsThrough(a, b, covalent);
    // A position the user set wins. On screen (y down) the left of a→b is the -n side.
    if (bond.position) sd = bond.position === "centre" ? 0 : bond.position === "left" ? -1 : 1;
    else if (rings.length) {
      const doubles = (r: number[]) => r.reduce((c, at, i) => c + (i && bondAt.get(key(r[i - 1], at))?.type === 2 ? 1 : 0), 0);
      ring = rings.sort((x, y) => doubles(y) - doubles(x) || Number(y.length === 6) - Number(x.length === 6) || x.length - y.length)[0];
      const centre = mul(ring.reduce<P>((c, i) => add(c, pts[i]), [0, 0]), 1 / ring.length);
      sd = Math.sign(dot(sub(centre, p), n));
    } else if (deg(a) === 1 || deg(b) === 1) {
      const inner = deg(a) === 1 ? b : a, outer = inner === a ? b : a;
      if (deg(inner) === 2 && !labelled[inner]) sd = side(nbrs[inner].find((j) => j !== outer)!);
    } else {
      const linear = (x: number, y: number) =>
        deg(x) === 2 && nbrs[x].every((j) => bondAt.get(key(x, j))!.type === 2) &&
        angle(sub(pts[y], pts[x]), sub(pts[nbrs[x].find((j) => j !== y)!], pts[x])) > (161.8 * Math.PI) / 180;
      if (!(labelled[a] && labelled[b]) && !linear(a, b) && !linear(b, a)) {
        const others = [...nbrs[a].filter((j) => j !== b), ...nbrs[b].filter((j) => j !== a)];
        sd = Math.sign(others.reduce((c, j) => c + side(j), 0)) || side(nbrs[a].find((j) => j !== b)!);
      }
    }

    plan.side = sd;
    if (!sd) {
      // Centred: lines at ±spacing/2 that stay out of the fan and run on to the neighbouring bond's axis.
      plan.kind = 'none';
      const h = spacing / 2;
      // A neighbour in line (an allene's middle atom, drawn with rounding) is met end to end, not run on to.
      const reach = (x: number, y: number, o: number) => {
        const phi = labelled[x] ? undefined : near(x, y, Math.sign(o))[0];
        return phi === undefined || Math.sin(phi) < 0.05 ? 0 : h / Math.tan(phi);
      };
      plan.lines = [h, -h].map((o, k) => ({ o, t0: reach(a, b, o), t1: reach(b, a, o), ...(bold && !k ? { half: z.bold / 2 } : {}), ...((bond.display === "dashed" && k) || bond.display === "aromatic" ? { dashed: true } : {}) }));
      return plan;
    }
    // Offset: the axis joins the fan; the inner line is trimmed back to the angle bisector at unlabelled ends.
    const trim = (x: number, y: number, ringNbr?: number) => {
      if (labelled[x]) return 0;
      const theta = ringNbr !== undefined ? angle(sub(pts[y], pts[x]), sub(pts[ringNbr], pts[x])) : near(x, y, sd)[0];
      if (theta === undefined) return 0;
      const t = spacing / Math.tan(theta / 2);
      return t > MAX_TRIM * L ? 0 : t;
    };
    if (bold) plan.half = z.bold / 2;
    if (bond.display === "aromatic") plan.kind = 'dash';
    plan.lines = [{ o: sd * spacing, t0: trim(a, b, ring?.[1]), t1: trim(b, a, ring?.[ring.length - 2]), ...(bond.display === "dashed" || bond.display === "aromatic" ? { dashed: true } : {}) }];
    return plan;
  });
  // Aromatic rings drawn with a circle (Toggle Aromatic Display): their bonds are single lines, and a circle sits
  // inside each ring. The structure keeps its Kekulé bonds.
  const circled = circledRings(mol);
  for (const r of circled) r.forEach((x, k) => {
    const y = r[(k + 1) % r.length], pl = plans[mol.bonds.findIndex((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))];
    if (pl && mol.bonds[mol.bonds.indexOf(mol.bonds.find((b) => (b.atoms[0] === x && b.atoms[1] === y) || (b.atoms[0] === y && b.atoms[1] === x))!)].type === 2) { pl.lines = []; pl.kind = 'line'; delete pl.half; }
  });

  // Label cuts: the shortest cut along the axis at which every line of the bond clears the label's clips (above).
  // Provisional sizes for the bond styles ChemDraw's reference drawing did not include.
  const WAVE = 0.08; // wavy bond amplitude, in bond lengths
  const half = (pl: Plan) => pl.half ?? (pl.kind === 'hashbar' ? pl.z.bold / 2 : pl.kind === 'wavy' ? WAVE * pl.z.L + pl.z.hw : pl.z.hw);
  const widths = (pl: Plan, x: number): [number, number] =>
    pl.kind === 'wedge' || pl.kind === 'hash' || pl.kind === 'hollow' ? (x === pl.a ? [pl.z.tip, pl.z.wide] : [pl.z.wide, pl.z.tip]) : [half(pl), half(pl)];
  // The cut at one end of a bond (0 where the atom has no label), for a margin round the label.
  const cutAt = (pl: Plan, end: 0 | 1, margin: number): number => {
    const x = end ? pl.b : pl.a, { boxes, pieces } = clips[x];
    if (!boxes.length && !pieces.length) return 0;
    const u = end ? mul(pl.u, -1) : pl.u, w = widths(pl, x)[0], m = margin + w;
    const offsets = [...(pl.kind === 'none' ? [] : [0]), ...pl.lines.map((l) => l.o)];
    // A line stops where it leaves the margin round a box it meets before the bond's far end.
    let cut = 0;
    for (const b of boxes) for (const o of offsets) {
      const span = boxSpan(add(pts[x], mul(pl.n, o)), u, b, m);
      if (span && span[0] < pl.length) cut = Math.max(cut, span[1]);
    }
    // A line from t to the bond's far end clears an outline point (a along the bond, d across from the line) when
    // the point lies off the line by the margin, or before the line's start or past its end by the rest of it.
    // So the cut is the largest a + √(m² − d²) over the points the line passes, worked out once (no search).
    // The sums are dot(q − X, u) and dot(q − X, n), written out, as this is the renderer's busiest loop.
    const [X0, X1] = pts[x], [u0, u1] = u, [n0, n1] = pl.n;
    for (const { pts: outline, x: px0, y: py0, f } of pieces) {
      for (const cell of cellsOf(outline)) {
        // A cell no line passes within the margin of, or whose points cannot reach past the cut so far, is passed over.
        const c0 = px0 + cell.c[0] * f - X0, c1 = py0 + cell.c[1] * f - X1, r = cell.r * f + 1e-9;
        const ca = c0 * u0 + c1 * u1, cc = c0 * n0 + c1 * n1;
        if (ca + r + m <= cut || offsets.every((o) => Math.abs(cc - o) >= m + r)) continue;
        for (const [px, py] of cell.pts) {
          const r0 = px0 + px * f - X0, r1 = py0 + py * f - X1, a = r0 * u0 + r1 * u1, c = r0 * n0 + r1 * n1;
          for (const o of offsets) {
            const d = c - o;
            if (Math.abs(d) >= m) continue;
            const reach = Math.sqrt(m * m - d * d);
            if (a - reach < pl.length) cut = Math.max(cut, a + reach);
          }
        }
      }
    }
    return cut;
  };
  // A label's ink as points where it is drawn: its outlines, and its boxes' edges every pixel or so.
  const inkPoints = (x: number): P[] => [...placedPoints(clips[x].pieces), ...clips[x].boxes.flatMap((b) => {
    const n = Math.max(2, Math.ceil(Math.max(b[2] - b[0], b[3] - b[1]))), out: P[] = [];
    for (let k = 0; k <= n; k++) { const f = k / n, x0 = b[0] + (b[2] - b[0]) * f, y0 = b[1] + (b[3] - b[1]) * f; out.push([x0, b[1]], [x0, b[3]], [b[0], y0], [b[2], y0]); }
    return out;
  })];
  // A flared end clears the label at its atom by the margin along its sides too: from the cut, the drawing widens from
  // w0 at a slope k for T. Each ink point beside that stretch moves the cut out until it is the margin off the side.
  const flare = (pl: Plan, end: 0 | 1, cut: number, margin: number, w0: number, k: number, T: number): number => {
    const x = end ? pl.b : pl.a, X = pts[x], u = end ? mul(pl.u, -1) : pl.u, ink = inkPoints(x), s = margin * Math.sqrt(1 + k * k);
    for (let pass = 0, moved = true; moved && pass < 8; pass++) {
      moved = false;
      for (const q of ink) {
        const r = sub(q, X), t = dot(r, u) - cut, g = (Math.abs(cross(u, r)) - w0 - s) / k;
        if (t > 0 && t <= T && t > g) { cut += t - Math.max(g, 0); moved = true; }
      }
    }
    return cut;
  };
  // A bond's cuts at both ends for a margin (a dative bond's head keeps the full margin). Between two labels, a wedge's
  // narrow end and a dative bond's head are flared ends (the visible bond is short, so they widen near a label).
  const cutsOf = (pl: Plan, margin: number): [number, number] => {
    const { L, tip, wide, hw, margin: full } = pl.z, cut: [number, number] = [cutAt(pl, 0, margin), cutAt(pl, 1, pl.head ? full : margin)];
    if (!labelled[pl.a] || !labelled[pl.b]) return cut;
    for (let k = 0; k < 3 && (pl.kind === 'wedge' || pl.kind === 'hash' || pl.kind === 'hollow'); k++) {
      const D = pl.length - cut[0] - cut[1];
      if (D <= 0) break;
      const w0 = pl.kind === 'hollow' ? hw : tip, slope = (wide - w0) / D;
      cut[0] = flare(pl, 0, cut[0], margin, pl.kind === 'hash' ? w0 + slope * hw : w0, slope, D);
    }
    if (pl.head) cut[1] = flare(pl, 1, cut[1], full, hw, 0.4, Math.min(0.3 * L, (pl.length - cut[0] - cut[1]) / 2));
    return cut;
  };
  // A bond between two labels stays readable: where it would show less than a third of its length, the margin at both
  // ends (a dative bond's tail only) narrows, to no less than 0.3 of it (0.5 pt in ACS 1996), until it shows that much.
  // Every line keeps the bond's cut.
  for (const pl of plans) {
    let cut = cutsOf(pl, pl.z.margin);
    const shows = (c: [number, number]) => pl.length - c[0] - c[1] >= pl.length / 3;
    if (labelled[pl.a] && labelled[pl.b] && !shows(cut)) {
      let lo = 0.3 * pl.z.margin, hi = pl.z.margin;
      if (shows(cutsOf(pl, lo))) for (let k = 0; k < 20; k++) { const mid = (lo + hi) / 2; if (shows(cutsOf(pl, mid))) lo = mid; else hi = mid; }
      cut = cutsOf(pl, lo);
    }
    pl.cut = cut;
    // A bond whose cuts from its two ends meet or cross has nothing left to draw.
    if (cut[0] + cut[1] >= pl.length) pl.hidden = true;
  }

  // Mitred fans at unlabelled atoms. Each end is a list of points from the -n to the +n side of the
  // bond as seen from that atom; with two or more members it passes through the atom centre.
  const drawnEnd = (pl: Plan, x: number): P => (x === pl.a ? add(pts[pl.a], mul(pl.u, pl.cut[0])) : add(pts[pl.b], mul(pl.u, -pl.cut[1])));
  const ends = new Map<string, P[]>();
  const atAtom: { pl: Plan; i: number }[][] = mol.atoms.map(() => []);
  plans.forEach((pl, i) => { atAtom[pl.a].push({ pl, i }); if (pl.b !== pl.a) atAtom[pl.b].push({ pl, i }); });
  mol.atoms.forEach((_, x) => {
    if (labelled[x] || shapes[x].length) return; // a label, or an attachment point's diamond or star, cuts its bonds
    const X = pts[x];
    const members = atAtom[x]
      .filter(({ pl }) => !pl.hidden && (pl.kind === 'line' || pl.kind === 'wedge'))
      .map(({ pl, i }) => {
        const f = drawnEnd(pl, x === pl.a ? pl.b : pl.a), u = unit(sub(f, X)), [w0, w1] = widths(pl, x);
        return { i, u, n: perp(u), w0, w1, f, ang: Math.atan2(u[1], u[0]) };
      })
      .sort((m, l) => m.ang - l.ang);
    type M = (typeof members)[number];
    // Where m's +n edge meets l's -n edge. Parallel, or too far out (very acute angles): square corners instead.
    const miter = (m: M, l: M): [P, P] => {
      const pm = add(X, mul(m.n, m.w0)), pl = add(X, mul(l.n, -l.w0));
      const c = meet(pm, sub(add(m.f, mul(m.n, m.w1)), pm), pl, sub(add(l.f, mul(l.n, -l.w1)), pl));
      return c && len(sub(c, X)) < 6 * Math.max(m.w0, l.w0, atomZ[x].hw) ? [c, c] : [pm, pl];
    };
    members.forEach((m, j) => {
      if (members.length === 1) { ends.set(`${m.i} ${x}`, [add(X, mul(m.n, -m.w0)), add(X, mul(m.n, m.w0))]); return; }
      const prev = members[(j + members.length - 1) % members.length], next = members[(j + 1) % members.length];
      ends.set(`${m.i} ${x}`, [miter(prev, m)[1], X, miter(m, next)[0]]);
    });
  });
  // An end with no fan (at a labelled atom): square, at the label cut.
  const endOf = (pl: Plan, i: number, x: number): P[] => {
    const fan = ends.get(`${i} ${x}`);
    if (fan) return fan;
    const n = x === pl.a ? pl.n : mul(pl.n, -1), c = drawnEnd(pl, x), w = widths(pl, x)[0];
    return [add(c, mul(n, -w)), add(c, mul(n, w))];
  };

  // Every polygon winds the same way (-n to +n at its start, then back along +n), so one nonzero path fills them all.
  const polygons: P[][] = [];
  const bar = (S: P, E: P, n: P, w: number) => polygons.push([add(S, mul(n, -w)), add(S, mul(n, w)), add(E, mul(n, w)), add(E, mul(n, -w))]);
  const drawPlan = (pl: Plan, i: number) => {
    if (pl.hidden) return;
    const { L, hw, wide, tip } = pl.z, hash = pl.z.hash;
    if (pl.kind === 'line' || pl.kind === 'wedge') polygons.push([...endOf(pl, i, pl.a), ...endOf(pl, i, pl.b)]);
    const S = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1];
    if (pl.kind === 'dash') {
      // Evenly spaced dashes, one per hash spacing, the first and last flush with the ends.
      const count = Math.max(1, Math.round(D / hash)), dash = Math.min(D, hash * 0.55), step = count > 1 ? (D - dash) / (count - 1) : 0;
      for (let k = 0; k < count; k++) bar(add(S, mul(pl.u, k * step)), add(S, mul(pl.u, k * step + dash)), pl.n, hw);
    }
    if (pl.kind === 'dot') {
      // A hydrogen bond: round dots the line width across, one every half hash spacing (ChemDraw's dotted bond
      // spacing), the first and last at the ends.
      const count = Math.max(1, Math.round(D / (hash / 2)));
      for (let k = 0; k <= count; k++) polygons.push(disc(add(S, mul(pl.u, (D * k) / count)), hw));
    }
    if (pl.kind === 'hashbar') {
      // Marks of one length (the bold width), evenly spaced from end to end.
      const marks = Math.max(1, Math.round(D / hash));
      for (let j = 0; j <= marks; j++) {
        const c = add(S, mul(pl.u, hw + ((D - 2 * hw) * j) / marks));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, pl.z.bold / 2);
      }
    }
    if (pl.kind === 'wavy') {
      // A sine wave with a whole number of waves, as one strip of even width.
      const waves = Math.max(1, Math.round(D / (0.25 * L))), k = (2 * Math.PI * waves) / D, steps = waves * 16;
      const left: P[] = [], right: P[] = [];
      for (let j = 0; j <= steps; j++) {
        const t = (D * j) / steps, c = add(add(S, mul(pl.u, t)), mul(pl.n, WAVE * L * Math.sin(k * t)));
        const normal = perp(unit(add(pl.u, mul(pl.n, WAVE * L * k * Math.cos(k * t)))));
        left.push(add(c, mul(normal, hw)));
        right.push(add(c, mul(normal, -hw)));
      }
      polygons.push([right[0], ...left, ...right.slice(1).reverse()]);
    }
    if (pl.kind === 'hollow') {
      // Hollow wedge: the wedge's outline, in normal-width lines, point at a.
      const E = drawnEnd(pl, pl.b), left = add(E, mul(pl.n, wide - hw)), right = add(E, mul(pl.n, -(wide - hw)));
      for (const corner of [left, right]) {
        const u = unit(sub(corner, S));
        bar(S, corner, perp(u), hw);
      }
      bar(add(right, mul(pl.n, -hw)), add(left, mul(pl.n, hw)), mul(pl.u, -1), hw);
    }
    if (pl.head) {
      // Dative bond: an arrowhead pointing at b, 0.3 bond lengths long, or half the bond as drawn if that is less.
      const E = drawnEnd(pl, pl.b), h = Math.min(0.3 * L, D / 2), base = add(E, mul(pl.u, -h)), w = 0.4 * h;
      polygons.push([add(base, mul(pl.n, -w)), add(base, mul(pl.n, w)), E]);
    }
    if (pl.kind === 'hash') {
      // Marks at even pitch, the last one flush with the wide end. Hash Spacing is the gap between marks, so the pitch
      // is the spacing plus the line width, as ChemDraw draws it. Where another bond meets an unlabelled wide end, the
      // last mark is left out so it doesn't run into that bond, as ChemDraw does (issue 7).
      const start = drawnEnd(pl, pl.a), D = pl.length - pl.cut[0] - pl.cut[1], marks = Math.max(1, Math.round(D / (hash + 2 * hw))), pitch = D / marks;
      const joined = !labelled[pl.b] && nbrs[pl.b].length > 1 && marks > 1;
      for (let j = 1; j <= marks - (joined ? 1 : 0); j++) {
        const t = j * pitch - hw, c = add(start, mul(pl.u, t));
        bar(add(c, mul(pl.u, -hw)), add(c, mul(pl.u, hw)), pl.n, tip + ((wide - tip) * t) / D);
      }
    }
    if (pl.cross) {
      // Two lines from each end's -n and +n sides to the other end's opposite side.
      const h = pl.z.spacing / 2, A = drawnEnd(pl, pl.a), B = drawnEnd(pl, pl.b);
      for (const sgn of [1, -1]) { const p0 = add(A, mul(pl.n, sgn * h)), p1 = add(B, mul(pl.n, -sgn * h)); bar(p0, p1, perp(unit(sub(p1, p0))), hw); }
    }
    for (const { o, t0, t1, half: w, dashed } of pl.lines) {
      const from = labelled[pl.a] ? pl.cut[0] : t0, to = pl.length - (labelled[pl.b] ? pl.cut[1] : t1);
      if (to - from < 0.1) continue;
      if (dashed) {
        // Dashes as a dashed bond's: one per hash spacing, the first and last flush with the ends.
        const D = to - from, count = Math.max(1, Math.round(D / hash)), dash = Math.min(D, hash * 0.55), step = count > 1 ? (D - dash) / (count - 1) : 0;
        for (let k = 0; k < count; k++) bar(add(add(pts[pl.a], mul(pl.u, from + k * step)), mul(pl.n, o)), add(add(pts[pl.a], mul(pl.u, from + k * step + dash)), mul(pl.n, o)), pl.n, w ?? hw);
        continue;
      }
      bar(add(add(pts[pl.a], mul(pl.u, from)), mul(pl.n, o)), add(add(pts[pl.a], mul(pl.u, to)), mul(pl.n, o)), pl.n, w ?? hw);
    }
  };
  // Each polygon belongs to the bond it draws, so to both of its atoms' ink boxes.
  const ink: Box[] = pts.map(([x, y]) => [x, y, x, y]);
  const grow = (i: number, [x, y]: P) => { const b = ink[i]; b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); };
  // A structure turned in 3D is drawn as any other, as ChemDraw draws it: each atom where its x and y put it (no
  // vanishing point), every bond style as it is, at the document's widths. Its depth (z) decides which bond is in
  // front where two cross. Depth shading (ChemDraw's Structure Perspective, on after 3D Clean Up or Structure >
  // Structure Perspective) also draws objects further back paler: ChemDraw fades their colour towards the paper, as
  // an alpha over the paper does.
  const range = zRange === undefined ? depthRange(mol) : zRange;
  const fade = (...atoms: number[]) => (range && atoms.some((x) => mol.atoms[x].shade) ? shadeAt(atoms.reduce((t, x) => t + (mol.atoms[x].location[2] ?? 0), 0) / atoms.length, range) : 1);
  // Crossing bonds (ChemDraw's Bond Crossing): a section of the bond behind is cut out round the bond in front. As
  // ChemDraw decides, the bond whose middle is nearer is in front, so Bring to Front does nothing where bonds have
  // depth; at the same depth (a flat drawing) the bond drawn later is (Bring to Front and the f key move a bond to the
  // end of the list). The cut is the front bond's own width (across) and, all round it, the margin of the bond
  // behind; its axis runs on by the margin at each end. A bond whose end only nearly meets the other (within their
  // widths and the margin) is cut too, as in ChemDraw.
  const margin = (pl: Plan) => (pl.z.margin * 1.6) / 1.69; // Margin Width: s.margin is the label clearance, 1.69/1.6 of it (chem.ts)
  const across = (pl: Plan) => {
    const offs = [...(pl.kind === 'none' ? [] : [0]), ...pl.lines.map((l) => l.o)], lo = Math.min(...offs), hi = Math.max(...offs);
    // Two lines or more: from the middle, the distance to the outer lines, and half a bold line's width.
    const bold = Math.max(pl.kind === 'line' ? pl.half ?? 0 : 0, ...pl.lines.map((l) => l.half ?? 0));
    if (offs.length > 1) { const h = (hi - lo) / 2 + (bold > pl.z.hw ? bold : 0); return { o: (lo + hi) / 2, ha: h, hb: h }; }
    // A wedge: the line width at its narrow end (a), 1.5 bold widths at its wide end (b). A bold bond: the bold width.
    if (pl.kind === 'wedge' || pl.kind === 'hash' || pl.kind === 'hollow') return { o: 0, ha: pl.z.hw, hb: pl.z.wide };
    const h = pl.kind === 'line' && pl.half ? pl.half : pl.z.hw;
    return { o: 0, ha: h, hb: h };
  };
  const cutter = (pl: Plan, m: number): P[] => {
    const { o, ha, hb } = across(pl), A = add(add(pts[pl.a], mul(pl.n, o)), mul(pl.u, -m)), B = add(add(pts[pl.b], mul(pl.n, o)), mul(pl.u, m));
    return [add(A, mul(pl.n, -ha - m)), add(B, mul(pl.n, -hb - m)), add(B, mul(pl.n, hb + m)), add(A, mul(pl.n, ha + m))];
  };
  const fronts: number[][] = plans.map(() => []), mid = (k: number) => mol.bonds[k].atoms.reduce((t, x) => t + (mol.atoms[x].location[2] ?? 0), 0) / 2;
  // The front and back carbons' bonds in a Newman projection start at its middle, but do not cross.
  const axis = new Set([...endOn.keys()].map((b) => key(b.atoms[0], b.atoms[1])));
  for (const [r, f] of crossingBonds(mol.bonds, (i) => pts[i], s.bond, s)) {
    const R = plans[r], F = plans[f];
    if (R.hidden || F.hidden || (axis.size && mol.bonds[r].atoms.some((x) => mol.bonds[f].atoms.some((y) => axis.has(key(x, y)))))) continue;
    if (mid(r) - mid(f) > 1e-6) fronts[f].push(r); else fronts[r].push(f);
  }
  const cutFronts = (i: number, from: number) => {
    for (const f of fronts[i]) polygons.push(...polygons.splice(from).flatMap((poly) => without(poly, cutter(plans[f], margin(plans[i])))));
  };
  // Each polygon's colour (its bond's, or for a mark, its atom's) and how strongly it is drawn (fainter further back).
  const colours: (string | undefined)[] = [], alphas: number[] = [];
  plans.forEach((pl, i) => {
    const before = polygons.length, alpha = fade(pl.a, pl.b);
    drawPlan(pl, i);
    cutFronts(i, before);
    for (const poly of polygons.slice(before)) { colours.push(mol.bonds[i].colour); alphas.push(alpha); for (const q of poly) { grow(pl.a, q); grow(pl.b, q); } }
  });
  // The aromatic circles, each as a ring of short bars in the line width.
  for (const r of circled) {
    const c = mul(r.reduce<P>((m, i) => add(m, pts[i]), [0, 0]), 1 / r.length);
    const edge = Math.min(...r.map((x, k) => len(sub(pts[r[(k + 1) % r.length]], pts[x]))));
    const radius = ringCircleRadius(r.length, edge, s.spacing / s.bond), steps = 72, before = polygons.length;
    for (let k = 0; k < steps; k++) {
      const a0 = (2 * Math.PI * k) / steps, a1 = (2 * Math.PI * (k + 1.05)) / steps, S = add(c, [Math.cos(a0) * radius, Math.sin(a0) * radius]), E = add(c, [Math.cos(a1) * radius, Math.sin(a1) * radius]);
      bar(S, E, perp(unit(sub(E, S))), atomZ[r[0]].hw);
    }
    for (const poly of polygons.slice(before)) { colours.push(mol.atoms[r[0]].colour); alphas.push(fade(...r)); for (const q of poly) grow(r[0], q); }
  }
  // A π ligand (a ring of delocalised bonds round a multi-centre point) has an ellipse inside, sized as an aromatic
  // circle for the ring and flattened as the ring is (ligandEllipse).
  mol.atoms.forEach((a, i) => {
    const r = a.centre && !a.centre.variable ? a.centre.atoms : [];
    if (r.length < 3 || !r.every((x) => r.filter((y) => bondAt.get(key(x, y))?.type === 4).length === 2)) return;
    const c = pts[i], { across, along, ra, rb } = ligandEllipse(r.map((x) => pts[x]), c, nbrs[i].length ? pts[nbrs[i][0]] : undefined, s.spacing / s.bond);
    const at = (t: number) => add(c, add(mul(across, Math.cos(t) * ra), mul(along, Math.sin(t) * rb))), steps = 72, before = polygons.length;
    for (let k = 0; k < steps; k++) { const S = at((2 * Math.PI * k) / steps), E = at((2 * Math.PI * (k + 1.05)) / steps); bar(S, E, perp(unit(sub(E, S))), atomZ[r[0]].hw); }
    for (const poly of polygons.slice(before)) { colours.push(mol.atoms[r[0]].colour); alphas.push(fade(...r)); for (const q of poly) grow(r[0], q); }
  });
  // A bond's query indicators (S/D, Rng, Rxn), small, beside its middle: inside its smallest ring, else on the side with
  // more room. Where that covers a label, an atom's indicator, another bond's indicator or another bond, a little along
  // the bond, then the other side, then further out.
  const outlines: P[][] = [], told: Box[] = [];
  mol.bonds.forEach((bond, k) => {
    const text = bondIndicator(bond);
    if (!text) return;
    if (!outlines.length) outlines.push(...shapes.map(placedPoints));
    const pl = plans[k], z = pl.z, m = grown(measure(text), z.size / s.size), mid = mul(add(pts[pl.a], pts[pl.b]), 0.5), w = m.width * SUB, h = m.ascent * SUB;
    // Far enough out that the text's box clears the bond's double line, and out more.
    const at = (sd: number, more: number, along = 0) => { const d = mul(pl.n, sd); return add(add(mid, mul(pl.u, along * z.L)), mul(d, z.spacing + 0.5 * (Math.abs(d[0]) * w + Math.abs(d[1]) * h) + (0.1 + more) * z.L)); };
    const room = (c: P) => Math.min(Infinity, ...pts.filter((_, j) => j !== pl.a && j !== pl.b).map((q) => len(sub(q, c))));
    const ring = ringsThrough(pl.a, pl.b, nbrs).sort((p, q) => p.length - q.length)[0];
    const inward = ring && Math.sign(dot(sub(mul(ring.reduce<P>((t, j) => add(t, pts[j]), [0, 0]), 1 / ring.length), pts[pl.a]), pl.n));
    const first = inward || (room(at(1, 0)) >= room(at(-1, 0)) ? 1 : -1);
    // How much a place covers: points of labels, marks, bare atoms and other bonds in its box, and other indicators.
    const covers = (c: P) => {
      const gx = w / 2 + 0.08 * z.L, gy = h / 2 + 0.08 * z.L, inside = (q: P) => Math.abs(q[0] - c[0]) < gx && Math.abs(q[1] - c[1]) < gy;
      let n = told.filter((b) => b[0] < c[0] + gx && b[2] > c[0] - gx && b[1] < c[1] + gy && b[3] > c[1] - gy).length;
      for (const list of [...outlines, ...marks]) for (const q of list) if (inside(q)) n++;
      pts.forEach((q, j) => { if (j !== pl.a && j !== pl.b && !labelled[j] && inside(q)) n++; });
      plans.forEach((o) => { if (o !== pl) for (const t of [0.25, 0.5, 0.75]) if (inside(add(pts[o.a], mul(sub(pts[o.b], pts[o.a]), t)))) n++; });
      return n;
    };
    let c = at(first, 0), least = covers(c);
    for (const more of [0, 0.4, 0.8]) for (const sd of [first, -first]) for (const along of [0, -0.3, 0.3]) {
      if (!least) break;
      const q = at(sd, more, along), n = covers(q);
      if (n < least) { c = q; least = n; }
    }
    const x = c[0] - w / 2, y = c[1] + h / 2;
    labels.push({ text, x, y, size: z.size * SUB, colour: bond.colour });
    told.push([x, y - h, x + w, y]);
    marks[pl.a].push([x, y - h], [x + w, y]);
  });
  // A label's ink is its glyphs' boxes.
  const labelBoxes = shapes.map((shape) => shape.map(pieceBox));
  labelBoxes.forEach((bs, i) => bs.forEach(([a, b, c, d]) => { grow(i, [a, b]); grow(i, [c, d]); }));
  marks.forEach((mark, i) => mark.forEach((q) => grow(i, q)));
  symbols.forEach((polys, i) => polys.forEach((poly) => { polygons.push(poly); colours.push(mol.atoms[i].colour); alphas.push(fade(i)); poly.forEach((q) => grow(i, q)); }));
  // Labels in a structure with depth shading fade with their atom's depth too.
  for (const l of labels) {
    const i = labelAtom.get(l);
    const alpha = i === undefined ? 1 : fade(i);
    if (alpha < 1) l.alpha = alpha;
  }

  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  pts.forEach(([x, y], i) => { if (!mol.atoms[i].hidden) take(x, y); });
  for (const poly of polygons) for (const [x, y] of poly) take(x, y);
  const pad = s.bond / 2;
  const label = labelBoxes.map((bs) => {
    const b = around(bs);
    if (b) { take(b[0], b[1]); take(b[2], b[3]); }
    return b;
  });
  // Map numbers, as ChemDraw draws them: in the label's face at three quarters of its size. After a label that reads
  // one way (OH, H2N, NH3+), level with the atom, if no bond is there; else out on the atom's open side (the middle
  // of its widest gap between bonds that is not inside a ring, lower on a tie). Either way just clear of
  // the atom's label (element, H, counts, charge), its marks and its bonds.
  const maps: MapNumber[] = [];
  mol.atoms.forEach((a, i) => {
    if (!a.map || a.hidden) return;
    const X = pts[i], z = s.size * ratio[i], { hw, spacing } = atomZ[i], gap = 0.2 * z, text = String(a.map);
    const m = grown(measure(text, a.font || a.bold || a.italic ? { font: a.font, bold: a.bold, italic: a.italic } : undefined), ratio[i]);
    const w = m.width * SUB, h = m.ascent * SUB;
    const boxes = [...labelBoxes[i], ...[marks[i], ...symbols[i]].filter((q) => q.length).map(outlineBox)];
    const bonds = nbrs[i].map((j) => { const b = bondAt.get(key(i, j))!; return { q: pts[j], t: hw + (b.type === 1 && !b.stereo && !b.display ? 0 : spacing) }; });
    const clear = (c: P) => {
      const b: Box = [c[0] - w / 2 - gap, c[1] - h / 2 - gap, c[0] + w / 2 + gap, c[1] + h / 2 + gap];
      return boxes.every((o) => o[0] >= b[2] || o[2] <= b[0] || o[1] >= b[3] || o[3] <= b[1]) && bonds.every(({ q, t }) => !crosses([b[0] - t, b[1] - t, b[2] + t, b[3] + t], X, q));
    };
    let at: P | undefined;
    const lb = label[i], reads = lb ? lb[2] - X[0] - (X[0] - lb[0]) : 0;
    if (lb && Math.abs(reads) > 0.1 * z) {
      const c: P = [reads > 0 ? lb[2] + gap + w / 2 + 0.01 : lb[0] - gap - w / 2 - 0.01, X[1]];
      if (clear(c)) at = c;
    }
    if (!at) {
      const sides = nbrs[i].map((j) => ({ j, t: Math.atan2(pts[j][1] - X[1], pts[j][0] - X[0]), rings: ringsThrough(i, j, covalent) })).sort((p, q) => p.t - q.t);
      let d: P = [0, 1], best = -Infinity;
      sides.forEach((p, k) => {
        const q = sides[(k + 1) % sides.length], size = sides.length === 1 ? TAU : turn(q.t - p.t) || TAU, mid = p.t + size / 2;
        // A gap between two bonds of one ring is inside that ring (on a fused or spiro atom too).
        const score = size - (p.rings.some((r) => r[1] === q.j) ? 10 : 0) + 0.01 * Math.sin(mid);
        if (score > best) { best = score; d = [Math.cos(mid), Math.sin(mid)]; }
      });
      for (let r = 0; r <= 5 * z && !at; r += 0.02 * z) if (clear(add(X, mul(d, r)))) at = add(X, mul(d, r));
      at ??= add(X, mul(d, 5 * z));
    }
    maps.push({ atom: i, text, at, size: z * SUB, h });
    for (const q of [[at[0] - w / 2, at[1] - h / 2], [at[0] + w / 2, at[1] + h / 2]] as P[]) { grow(i, q); take(q[0], q[1]); }
  });
  const labelAt = labels.map((l): P => pts[labelAtom.get(l) ?? -1] ?? [l.x, l.y]);
  return { polygons, colours, alphas, labels, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], ink, label, scale: k, electrons, beads, labelAt, maps, sides: plans.map((pl) => pl.side ?? 0) };
}

// The same drawing as render's, made structure by structure. Each structure's drawing stays in `cache` while its
// atoms and bonds are the same objects, so a change to one structure (a drag, an edit) draws only that structure
// again. Structures whose bonds cross are drawn as one, as the bond in front cuts a gap in the bond behind it.
// While something moves (still false), a structure whose atoms all moved the same way keeps its drawing, moved by
// `at` (px); once it is still, the drawing's own points move there. A structure scaled while it moves, with its
// atoms' scales (decision 0007), keeps its drawing too, scaled by k and then moved by `at`; once it is still, it is
// drawn again.
// parts: each structure's own drawing, its atoms, and how far it is moved and scaled, in order of their first atom.
// A structure's drawing as a drag shows it: scaled by k, turned by turn (degrees, as SVG's rotate, y down), then moved
// by at (px).
export type Part = { atoms: Atom[]; bonds: Bond[]; drawn: Atom[]; drawing: Drawing; at: P; k: number; turn: number; range?: [number, number] | null };
export type PartCache = { parts: WeakMap<Atom, Part>; last: Map<number, Part> };
export type Parts = Pick<Drawing, "box" | "ink" | "label" | "scale" | "electrons" | "beads" | "maps"> & { parts: { ids: number[]; drawing: Drawing; at: P; k: number; turn: number }[] };
export function renderParts(mol: Mol, s: Style, measure: (text: string, face?: Face) => Ink, scale: number, cache: PartCache, still = true): Parts {
  // Structures: atoms joined by bonds, each under its lowest atom.
  const root = mol.atoms.map((_, i) => i);
  const find = (i: number) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
  const join = (i: number, j: number) => { const p = find(i), q = find(j); if (p !== q) root[Math.max(p, q)] = Math.min(p, q); };
  for (const b of mol.bonds) join(b.atoms[0], b.atoms[1]);
  // A multi-centre point is drawn with its ring (the ring's ellipse goes round it).
  mol.atoms.forEach((a, i) => { for (const j of a.centre?.atoms ?? []) if (j < mol.atoms.length) join(i, j); });
  // Structures whose bonds cross (or nearly meet) are drawn as one, so the bond behind gets its gap. Depth shading
  // fades over the depth range of the whole drawing, as ChemDraw's does over the page.
  for (const [r, f] of crossingBonds(mol.bonds, (i) => mol.atoms[i].location as unknown as P, 1, s, 1 / s.bond)) join(mol.bonds[r].atoms[0], mol.bonds[f].atoms[0]);
  const range = depthRange(mol), sameRange = (p: Part) => (p.range ?? null) === range || (!!p.range && !!range && p.range[0] === range[0] && p.range[1] === range[1]);
  const groups = new Map<number, { ids: number[]; bonds: Bond[] }>();
  mol.atoms.forEach((_, i) => { const r = find(i); let g = groups.get(r); if (!g) groups.set(r, (g = { ids: [], bonds: [] })); g.ids.push(i); });
  for (const b of mol.bonds) groups.get(find(b.atoms[0]))!.bonds.push(b);
  const out: Parts = { box: [Infinity, Infinity, -Infinity, -Infinity], ink: [], label: [], scale, electrons: [], beads: [], maps: [], parts: [] }, last = new Map<number, Part>();
  for (const { ids, bonds } of groups.values()) {
    const atoms = ids.map((i) => mol.atoms[i]);
    const shaded = atoms.some((x) => x.shade), same = (p?: Part): p is Part => !!p && (!shaded || sameRange(p)) && p.atoms.length === atoms.length && p.bonds.length === bonds.length && p.bonds.every((b, k) => b === bonds[k]);
    let part = cache.parts.get(atoms[0]);
    if (!same(part) || part.atoms.some((a, k) => a !== atoms[k])) {
      const was = cache.last.get(ids[0]), at = !still && same(was) ? shiftOf(was.drawn, atoms, scale) ?? turnOf(was.drawn, atoms, scale) : undefined;
      part = at && was ? { atoms, bonds, drawn: was.drawn, drawing: was.drawing, at: at.at, k: at.k, turn: at.turn ?? 0, range } : undefined;
    }
    // Once still, a moved structure's drawing is moved by the same numbers (render gives the same points there), as
    // drawing it again is slow when a drag moves many structures. A scaled or turned one is drawn again.
    if (part && still && (part.k !== 1 || part.turn)) part = undefined;
    if (part && still && (part.at[0] || part.at[1])) part = { atoms, bonds, drawn: atoms, drawing: shifted(part.drawing, part.at), at: [0, 0], k: 1, turn: 0, range };
    if (!part) {
      const local = new Map(ids.map((i, k) => [i, k]));
      const drawing = render({ atoms: atoms.map((a) => (a.centre ? { ...a, centre: { ...a.centre, atoms: a.centre.atoms.flatMap((j) => (local.has(j) ? [local.get(j)!] : [])) } } : a)), bonds: bonds.map((b) => ({ ...b, atoms: [local.get(b.atoms[0])!, local.get(b.atoms[1])!] })) }, s, measure, scale, range);
      part = { atoms, bonds, drawn: atoms, drawing, at: [0, 0], k: 1, turn: 0, range };
    }
    cache.parts.set(atoms[0], part);
    last.set(ids[0], part);
    const d = part.drawing, [ax, ay] = part.at, f = part.k, turn = part.turn, moved = !!(ax || ay) || f !== 1 || !!turn;
    const cs = Math.cos((turn * Math.PI) / 180) * f, sn = Math.sin((turn * Math.PI) / 180) * f;
    const to = (q: P): P => (turn ? [q[0] * cs - q[1] * sn + ax, q[0] * sn + q[1] * cs + ay] : [q[0] * f + ax, q[1] * f + ay]);
    const move = (b: Box): Box => {
      if (!moved) return b;
      if (!turn) return [b[0] * f + ax, b[1] * f + ay, b[2] * f + ax, b[3] * f + ay];
      const qs = [to([b[0], b[1]]), to([b[2], b[1]]), to([b[2], b[3]]), to([b[0], b[3]])];
      return [Math.min(...qs.map((q) => q[0])), Math.min(...qs.map((q) => q[1])), Math.max(...qs.map((q) => q[0])), Math.max(...qs.map((q) => q[1]))];
    };
    out.parts.push({ ids, drawing: d, at: part.at, k: f, turn });
    for (const x of d.beads) out.beads.push(moved ? { at: to(x.at), r: x.r * f } : x);
    for (const e of d.electrons) out.electrons.push({ ...e, atom: ids[e.atom], at: moved ? to(e.at) : e.at });
    for (const n of d.maps) out.maps.push({ ...n, atom: ids[n.atom], ...(moved ? { at: to(n.at), size: n.size * f, h: n.h * f } : {}) });
    ids.forEach((i, k) => { out.ink[i] = move(d.ink[k]); const l = d.label[k]; out.label[i] = l && move(l); });
    const b = out.box, db = move(d.box);
    b[0] = Math.min(b[0], db[0]); b[1] = Math.min(b[1], db[1]); b[2] = Math.max(b[2], db[2]); b[3] = Math.max(b[3], db[3]);
  }
  cache.last = last;
  return out;
}
// A drawing moved by x, y (px).
function shifted(d: Drawing, [x, y]: P): Drawing {
  const box = (b: Box): Box => [b[0] + x, b[1] + y, b[2] + x, b[3] + y];
  return {
    ...d, box: box(d.box), ink: d.ink.map(box), label: d.label.map((b) => b && box(b)),
    polygons: d.polygons.map((poly) => poly.map(([px, py]): P => [px + x, py + y])),
    labels: d.labels.map((l) => ({ ...l, x: l.x + x, y: l.y + y, ...(l.pivot ? { pivot: [l.pivot[0] + x, l.pivot[1] + y] as P } : {}) })),
    electrons: d.electrons.map((e) => ({ ...e, at: [e.at[0] + x, e.at[1] + y] })),
    maps: d.maps.map((n) => ({ ...n, at: [n.at[0] + x, n.at[1] + y] })),
    beads: d.beads.map((b) => ({ ...b, at: [b.at[0] + x, b.at[1] + y] })),
    labelAt: d.labelAt.map(([px, py]): P => [px + x, py + y]),
  };
}
// How atoms have moved from where they were drawn, when every one moved the same way and nothing else about them
// changed: how far (px, y down), after a scale by k about the drawing's origin. A scale counts only when every atom's
// own scale changed by the same k as the distances between them (Scale… or a resize handle with Labels and lines),
// as the drawing is then the same drawing scaled. Otherwise undefined.
function shiftOf(drawn: Atom[], atoms: Atom[], px: number): { at: P; k: number; turn?: number } | undefined {
  // Scales are kept to 4 decimals (edit.ts), so a scaled structure is held to that.
  const k = scaleOf(atoms[0]) / scaleOf(drawn[0]), near = k === 1 ? 1e-9 : 1e-4;
  const dx = atoms[0].location[0] - drawn[0].location[0] * k, dy = atoms[0].location[1] - drawn[0].location[1] * k;
  for (let j = 0; j < atoms.length; j++) {
    const a = atoms[j], b = drawn[j], off = (n: number, m: number, d: number) => Math.abs(n - m * k - d) > near * (1 + Math.abs(m * k));
    if (off(a.location[0], b.location[0], dx) || off(a.location[1], b.location[1], dy) || off(a.location[2] ?? 0, b.location[2] ?? 0, 0) || off(scaleOf(a), scaleOf(b), 0) || !alike(a, b)) return undefined;
  }
  return { at: [dx * px, -dy * px], k };
}
// Whether two atoms are the same but for where they are and their scale.
const rest = (x: Atom) => (Object.keys(x) as (keyof Atom)[]).filter((key) => key !== "location" && key !== "scale");
const alike = (a: Atom, b: Atom) => { const ka = rest(a), kb = rest(b); return ka.length === kb.length && ka.every((key) => a[key] === b[key]); };
// How atoms have turned from where they were drawn, when every one turned and moved as one and nothing else about them
// changed (the rotation handle): the turn (degrees, as SVG's rotate, y down) and then the move (px). The drawing turned
// so is the same drawing but for its labels, which keep level. Otherwise undefined.
function turnOf(drawn: Atom[], atoms: Atom[], px: number): { at: P; k: number; turn: number } | undefined {
  const o = drawn[0].location, n = atoms[0].location;
  let far = 0, reach = 0;
  for (let j = 1; j < drawn.length; j++) { const r = Math.hypot(drawn[j].location[0] - o[0], drawn[j].location[1] - o[1]); if (r > reach) { reach = r; far = j; } }
  if (reach < 1e-6) return undefined;
  const phi = Math.atan2(atoms[far].location[1] - n[1], atoms[far].location[0] - n[0]) - Math.atan2(drawn[far].location[1] - o[1], drawn[far].location[0] - o[0]);
  const c = Math.cos(phi), s = Math.sin(phi), near = 1e-6 * (1 + reach);
  for (let j = 0; j < atoms.length; j++) {
    const a = atoms[j].location, b = drawn[j].location, dx = b[0] - o[0], dy = b[1] - o[1];
    if (Math.abs(a[0] - n[0] - dx * c + dy * s) > near || Math.abs(a[1] - n[1] - dx * s - dy * c) > near || (a[2] ?? 0) !== (b[2] ?? 0) || scaleOf(atoms[j]) !== scaleOf(drawn[j]) || !alike(atoms[j], drawn[j])) return undefined;
  }
  // q turns to n + R(q - o), so the drawing (px, y down) turns by -phi and then moves by n - R(o).
  const t: P = [n[0] - (o[0] * c - o[1] * s), n[1] - (o[0] * s + o[1] * c)];
  return { at: [t[0] * px, -t[1] * px], k: 1, turn: (-phi * 180) / Math.PI };
}

// Captions, placed in the drawing's px frame (y down). Sizes are in pt; 1 pt is 4/3 px.
// ACS 1996: a caption under a structure is centred on the structure's ink box, its baseline 15 pt below the
// box. Left and right alignment line it up with the box's edges instead. Captions under the same atoms stack
// one line apart: the compound number first (bold digits or roman numerals, as ACS sets them), then the rest in id
// order. LINE (1.2 em) is provisional until it is measured against ChemDraw.
export const CAPTION_PT = 10;
export const isNumber = (c: Caption) => !!c.bold && (/^\d+[a-z]?$/.test(c.text) || (!!c.under?.length && /^(?=[IVXLCDM])M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})[a-z]?$/.test(c.text)));
export const GAP_PT = 15, GAP_ARROW_PT = 3, LINE = 1.2, ASCENT = 0.905, DESCENT = 0.212; // Arial's ascent and descent, in em
// A turned caption (angle) turns about its anchor on the first baseline (pivot, px); frame is its box before the turn,
// and box the box round it turned.
// Each line's baseline below the first's (px), by the caption's line spacing (Caption.lineHeight). size: the
// caption's text size (px); a run's own size is in pt. Variable, as ChemDraw's: each line is as tall as its tallest
// character and lowest descender, with no gap between lines. ink: how far line j's text reaches above and below its
// baseline (px); without it (or on an empty line), the ascent and descent of the line's largest text.
export function lineOffsets(c: Pick<Caption, "lineHeight" | "runs" | "text">, size: number, pt: number, ink?: (j: number) => [number, number] | undefined): number[] {
  const runLines = c.runs ? richLines(c.runs) : undefined, count = c.text.split("\n").length;
  const tallest = (j: number) => Math.max(size, ...(runLines?.[j] ?? []).map((r) => (r.size ? r.size * pt : size) * (r.script ? 0.75 : 1)));
  const all = Math.max(...Array.from({ length: count }, (_, j) => tallest(j)));
  const out = [0];
  for (let j = 1; j < count; j++) {
    const below = ink?.(j - 1)?.[1] ?? DESCENT * tallest(j - 1), above = ink?.(j)?.[0] ?? ASCENT * tallest(j);
    out.push(out[j - 1] + (typeof c.lineHeight === "number" ? c.lineHeight * pt : c.lineHeight === "variable" ? below + above : LINE * all));
  }
  return out;
}
export type Placed = {
  id: number; size: number; bold?: boolean; italic?: boolean; underline?: boolean; colour?: string; anchor: "start" | "middle" | "end"; font?: string;
  lines: { text: string; x: number; y: number; runs?: TextRun[]; spacing?: number }[]; box: Box; // spacing: a justified line's extra space per space (px)
  order?: number; // the caption's draw order (order.ts)
  angle?: number; pivot?: P; frame?: Box;
};
// A point (px) turned anticlockwise on the page by degrees about a pivot (px, y down).
export function turnPx(q: P, pivot: P, degrees: number): P {
  const r = (degrees * Math.PI) / 180, dx = q[0] - pivot[0], dy = q[1] - pivot[1];
  return [pivot[0] + dx * Math.cos(r) + dy * Math.sin(r), pivot[1] - dx * Math.sin(r) + dy * Math.cos(r)];
}
// pt: px per point in the drawing frame; size: the document's caption size in pt.
// fixed: where captions placed by something else (a cycle's labels) go, in px. measure: how wide a piece of text is
// in a run's style (px), for captions with a width; without it they do not wrap. extent: how far a piece of text
// reaches above and below its baseline (px), for Variable line spacing.
export function placeCaptions(mol: Mol, d: Pick<Drawing, "ink" | "scale">, width: (text: string, c: Caption, line: number) => number, arrows: Arrow[] = mol.arrows ?? [], pt = 4 / 3, defaultSize = CAPTION_PT,
  fixed: Map<number, { x: number; y: number; anchor: Placed["anchor"]; wrap?: number }> = new Map(), measure?: (text: string, c: Caption, style: RunStyle) => number,
  extent?: (text: string, c: Caption, style: RunStyle) => [number, number]): Placed[] {
  const k = d.scale, below = new Map<string, number>(); // the next free baseline under each structure
  const beside = new Map<string, number>(); // how far the conditions on each side of each arrow already reach
  const order = (c: Caption) => (isNumber(c) ? 0 : 1);
  // Conditions placed by hand go first: the others on their side of the arrow stack out past them.
  const sorted = [...(mol.captions ?? [])].sort((a, b) => order(a) - order(b) || a.id - b.id), done = new Map<number, Placed[]>();
  for (const c of sorted) if (placedAt(c, mol.arrows)) done.set(c.id, place(c));
  for (const c of sorted) if (!done.has(c.id)) done.set(c.id, place(c));
  return sorted.flatMap((c) => done.get(c.id)!);
  function place(given: Caption): Placed[] {
    // A caption with a width wraps to it: its soft breaks become lines here, and the lines they end are justified. A
    // cycle's step name can wrap to the width its layout gives it (px).
    const max = given.width ? given.width * k : fixed.get(given.id)?.wrap, wrapped = max && measure ? wrap(runsOf(given), max, (t, s) => measure(t, given, s)) : undefined;
    const c = wrapped?.soft.length ? { ...given, text: plainOf(wrapped.runs), ...(given.runs ? { runs: wrapped.runs } : {}) } : given;
    const softLines = new Set((wrapped?.soft ?? []).map((p) => c.text.slice(0, p).split("\n").length - 1));
    const size = (c.size ?? defaultSize) * pt, lines = c.text.split("\n"), align = c.align ?? "centre";
    // A line's ink (Variable line spacing): its runs' reach, a subscript's lowered and a superscript's raised as drawn.
    const inkLines = c.lineHeight === "variable" && extent ? (c.runs ? richLines(c.runs) : lines.map((text): TextRun[] => [{ text }])) : undefined;
    const ink = inkLines && ((j: number): [number, number] | undefined => {
      const parts = (inkLines[j] ?? []).filter((r) => r.text.trim());
      if (!parts.length) return undefined;
      return parts.reduce<[number, number]>(([up, down], r) => {
        const [a, b] = extent!(r.text, c, styleOf(r)), shift = (r.script === "sub" ? 0.212 : r.script === "super" ? -0.33 : 0) * size;
        return [Math.max(up, a - shift), Math.max(down, b + shift)];
      }, [0, 0]);
    });
    const offs = lineOffsets(c, size, pt, ink);
    const anchor = align === "left" || align === "justify" ? "start" : align === "right" ? "end" : "middle";
    let x: number, y: number, anchorOverride: Placed["anchor"] | undefined;
    const arrow = c.on && arrows.find((a) => a.id === c.on!.arrow), hand = placedAt(c, mol.arrows);
    if (c.on && !arrow) return [];
    const pinned = fixed.get(c.id);
    if (c.cycle && c.cycle.side !== "node" && !pinned) return [];
    if (pinned) {
      [x, y, anchorOverride] = [pinned.x, pinned.y - offs[offs.length - 1] * (pinned.anchor === "middle" ? 0.5 : 0), pinned.anchor];
    } else if (arrow && hand) {
      [x, y] = [hand[0] * k, -hand[1] * k];
    } else if (arrow) {
      // Conditions: centred on the arrow's middle, GAP_ARROW_PT (times the arrow's scale) clear of it, stacking away from it.
      const [s, t] = [[arrow.from[0] * k, -arrow.from[1] * k], [arrow.to[0] * k, -arrow.to[1] * k]];
      const mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2], len = Math.hypot(t[0] - s[0], t[1] - s[1]) || 1, u = [(t[0] - s[0]) / len, (t[1] - s[1]) / len];
      const key = `${arrow.id} ${c.on!.side}`, used = beside.get(key) ?? 0, gap = GAP_ARROW_PT * scaleOf(arrow) * pt + used;
      const block = offs[offs.length - 1];
      beside.set(key, used + block + (LINE + 0.2) * size);
      if (Math.abs(u[0]) >= 0.5) {
        // A mostly horizontal arrow: text above or below its middle.
        x = mid[0];
        y = c.on!.side === "above" ? mid[1] - gap - DESCENT * size - block : mid[1] + gap + ASCENT * size;
        anchorOverride = "middle";
      } else {
        // A steep arrow: text to its left (above) or right (below), level with its middle.
        x = c.on!.side === "above" ? mid[0] - gap : mid[0] + gap;
        y = mid[1] + (ASCENT * size - block) / 2 - (DESCENT * size) / 2;
        anchorOverride = c.on!.side === "above" ? "end" : "start";
      }
    } else if (c.under) {
      const atoms = c.under.filter((i) => d.ink[i]);
      if (!atoms.length) return [];
      const b: Box = [Math.min(...atoms.map((i) => d.ink[i][0])), Math.min(...atoms.map((i) => d.ink[i][1])), Math.max(...atoms.map((i) => d.ink[i][2])), Math.max(...atoms.map((i) => d.ink[i][3]))];
      const key = [...c.under].sort((p, q) => p - q).join(" ");
      // The gap under a structure follows the structure's scale (the mean of its atoms').
      const f = atoms.reduce((sum, i) => sum + scaleOf(mol.atoms[i] ?? {}), 0) / atoms.length;
      x = align === "left" || align === "justify" ? b[0] : align === "right" ? b[2] : (b[0] + b[2]) / 2;
      y = below.get(key) ?? b[3] + GAP_PT * f * pt;
      below.set(key, y + offs[offs.length - 1] + LINE * size);
    } else [x, y] = [c.x * k, -c.y * k];
    const at = anchorOverride ?? anchor;
    const widths = lines.map((t, j) => width(t, c, j)), full = align === "justify" && softLines.size ? max! : 0, w = Math.max(full, ...widths);
    const runLines = c.runs ? richLines(c.runs) : undefined;
    const left = at === "start" ? x : at === "end" ? x - w : x - w / 2;
    // A justified line (one a soft break ends) spreads its spaces to fill the width.
    const spacing = (j: number) => { const gaps = lines[j].split(" ").length - 1; return full && softLines.has(j) && gaps ? { spacing: (full - widths[j]) / gaps } : {}; };
    const frame: Box = [left, y - ASCENT * size, left + w, y + offs[offs.length - 1] + DESCENT * size];
    if (arrow && hand) {
      // How far it reaches from the arrow on its side: up (above) or down (below) from a level arrow, left (above) or
      // right (below) of a steep one. Conditions laid out on that side start a line's gap past it.
      const s: P = [arrow.from[0] * k, -arrow.from[1] * k], t: P = [arrow.to[0] * k, -arrow.to[1] * k], mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2], above = c.on!.side === "above";
      const reach = Math.abs(t[0] - s[0]) >= 0.5 * Math.hypot(t[0] - s[0], t[1] - s[1]) ? (above ? mid[1] - frame[1] : frame[3] - mid[1]) : above ? mid[0] - frame[0] : frame[2] - mid[0];
      const key = `${arrow.id} ${c.on!.side}`;
      beside.set(key, Math.max(beside.get(key) ?? 0, reach + 0.2 * size - GAP_ARROW_PT * scaleOf(arrow) * pt));
    }
    const turned = c.angle ? ([[frame[0], frame[1]], [frame[2], frame[1]], [frame[2], frame[3]], [frame[0], frame[3]]] as P[]).map((q) => turnPx(q, [x, y], c.angle!)) : undefined;
    return [{
      id: c.id, size, bold: c.bold, italic: c.italic, underline: c.underline, colour: c.colour, anchor: at, font: c.font, ...(c.order ? { order: c.order } : {}),
      lines: lines.map((text, j) => ({ text, x, y: y + offs[j], ...(runLines ? { runs: runLines[j] ?? [] } : {}), ...spacing(j) })),
      box: turned ? [Math.min(...turned.map((q) => q[0])), Math.min(...turned.map((q) => q[1])), Math.max(...turned.map((q) => q[0])), Math.max(...turned.map((q) => q[1]))] : frame,
      ...(turned ? { angle: c.angle, pivot: [x, y] as P, frame } : {}),
    }];
  }
}

// Arrows grow to fit their conditions: a straight arrow is lengthened about its middle until the widest
// conditions text has ARROW_MARGIN_PT clear at each end. Curved arrows keep their shape. Text placed by hand
// (placedAt) does not count: it keeps its place by the arrow as drawn.
const ARROW_MARGIN_PT = 6;
export function fitArrows(mol: Mol, scale: number, width: (c: Caption) => number, pt = 4 / 3): Arrow[] {
  return (mol.arrows ?? []).map((a) => {
    if (curved(a)) return a;
    const widest = Math.max(0, ...(mol.captions ?? []).filter((c) => c.on?.arrow === a.id && !placedAt(c, mol.arrows)).map(width));
    const need = (widest + 2 * ARROW_MARGIN_PT * scaleOf(a) * pt) / scale, len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]);
    if (!widest || len >= need || !len) return a;
    const grow = (need - len) / 2 / len, d = [(a.to[0] - a.from[0]) * grow, (a.to[1] - a.from[1]) * grow];
    return { ...a, from: [a.from[0] - d[0], a.from[1] - d[1]], to: [a.to[0] + d[0], a.to[1] + d[1]] };
  });
}

// The middle of a curved arrow's arc, in drawing coordinates.
export function bendPoint(a: Arrow): [number, number] {
  const len = Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]), b = a.bend ?? 0;
  const n = [-(a.to[1] - a.from[1]) / (len || 1), (a.to[0] - a.from[0]) / (len || 1)];
  return [(a.from[0] + a.to[0]) / 2 + n[0] * b * len, (a.from[1] + a.to[1]) / 2 + n[1] * b * len];
}

// An arrow's path in px (y down): two points for a straight arrow, a sampled arc for a curved one. The arc is
// the circle through both ends and the middle point, which is how CDXML stores curved arrows too.
export function arrowPath(a: Arrow, k: number): P[] {
  // A pen curve, or a fragmentation line with corners.
  if ((a.kind === "curve" || a.kind === "cut") && a.curve) return curvePath(a.curve, k);
  const S: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k];
  if (!a.bend || (!curved(a) && !a.point)) return [S, T];
  const m = bendPoint(a), M: P = [m[0] * k, -m[1] * k];
  const d = 2 * (S[0] * (M[1] - T[1]) + M[0] * (T[1] - S[1]) + T[0] * (S[1] - M[1]));
  if (Math.abs(d) < 1e-9) return [S, T];
  const sq = (q: P) => q[0] * q[0] + q[1] * q[1];
  const O: P = [
    (sq(S) * (M[1] - T[1]) + sq(M) * (T[1] - S[1]) + sq(T) * (S[1] - M[1])) / d,
    (sq(S) * (T[0] - M[0]) + sq(M) * (S[0] - T[0]) + sq(T) * (M[0] - S[0])) / d,
  ];
  const r = Math.hypot(S[0] - O[0], S[1] - O[1]), angle = (q: P) => Math.atan2(q[1] - O[1], q[0] - O[0]);
  const turn = (x: number) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  // From the start round to the end, the way that passes the middle.
  const a0 = angle(S);
  let sweep = turn(angle(T) - a0);
  if (turn(angle(M) - a0) > sweep) sweep -= 2 * Math.PI;
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 48)));
  return Array.from({ length: n + 1 }, (_, i) => (i === 0 ? S : i === n ? T : [O[0] + r * Math.cos(a0 + (sweep * i) / n), O[1] + r * Math.sin(a0 + (sweep * i) / n)] as P));
}

// How much of its own size a straight arrow's head is drawn at: ChemDraw keeps a head to two thirds of the arrow.
// Arcs and pen curves keep their whole head (a curve's ends can be close together).
const headFit = (a: Arrow, s: Style, k: number) => (a.bend || a.kind === "curve" ? 1 : Math.min(1,(2 * Math.hypot(a.to[0] - a.from[0], a.to[1] - a.from[1]) * k) / 3 / (headSize(a).length * s.line || 1)));
// An arrow as filled polygons in px (y down). Heads are drawn as ChemDraw draws them, at their size (headSize) in
// line widths: the tip, the barbs their length back and their width off the shaft, and the notch between.
export function arrowShapes(a: Arrow, s: Style, k: number): P[][] {
  const f = scaleOf(a);
  if (f !== 1) s = { ...s, line: s.line * f, bold: s.bold * f, bond: s.bond * f };
  const size = headSize(a), fit = headFit(a, s, k);
  const hw = s.line / 2, H = size.length * s.line * fit, C = size.centre * s.line * fit, W = size.width * s.line * fit;
  const out: P[][] = [];
  const bar = (p: P, q: P, w = hw) => { const u = unit(sub(q, p)), n = perp(u); out.push([add(p, mul(n, w)), add(q, mul(n, w)), add(q, mul(n, -w)), add(p, mul(n, -w))]); };
  // Points shortened at their end by `trim` (where a head takes over).
  const cut = (pts: P[], trim: number) => {
    const path = [...pts];
    for (let left = trim; left > 0 && path.length > 1; ) {
      const [p, q] = [path[path.length - 2], path[path.length - 1]], d = len(sub(q, p));
      if (d > left) { path[path.length - 1] = add(q, mul(unit(sub(p, q)), left)); break; }
      left -= d;
      path.pop();
    }
    return path;
  };
  // A shaft along points, stopping `trim` short of the end, drawn in the arrow's style: dashes of 0.15 bond lengths
  // with gaps of 0.1, a wave 0.06 bond lengths high every 0.2, the bold width, or two lines 0.1 bond lengths apart.
  const line = (pts: P[], trim: number) => {
    const path = cut(pts, trim);
    if (a.style === "doubled") {
      const g = 0.05 * s.bond;
      for (const side of [-1, 1]) { const o = offsetPath(path, side * g); for (let i = 0; i + 1 < o.length; i++) if (len(sub(o[i + 1], o[i])) > 1e-9) bar(o[i], o[i + 1]); }
      return;
    }
    if (a.style === "dashed" || a.kind === "cut") return dashes(path, 0.15 * s.bond, 0.1 * s.bond).forEach(([p, q]) => bar(p, q));
    if (a.style === "wavy") {
      const wave = waveAlong(path, 0.06 * s.bond, 0.2 * s.bond);
      for (let i = 0; i + 1 < wave.length; i++) bar(wave[i], wave[i + 1]);
      return;
    }
    for (let i = 0; i + 1 < path.length; i++) if (len(sub(path[i + 1], path[i])) > 1e-9) bar(path[i], path[i + 1], a.style === "bold" ? s.bold / 2 : hw);
  };
  // A head at the end of pts: full, or half (the barb on the left side looking along the arrow, or the right),
  // solid, hollow (its outline) or angled (open barbs). On a curve it points along the chord of its own length,
  // so it sits on the arc.
  const shape = a.head ?? "solid";
  const head = (pts: P[], half?: "left" | "right") => {
    const T = pts[pts.length - 1], back = cut(pts, H).pop()!, u = unit(sub(T, back)), n = perp(u);
    const base = add(T, mul(u, -H)), notch = add(T, mul(u, -C));
    const barbs = half ? [half === "left" ? -1 : 1] : [1, -1];
    if (shape === "angled") { for (const side of barbs) bar(T, add(base, mul(n, side * W))); return; }
    if (shape === "hollow") {
      for (const side of barbs) { bar(T, add(base, mul(n, side * W))); bar(add(base, mul(n, side * W)), half ? base : base); }
      if (!half) bar(add(base, mul(n, W)), add(base, mul(n, -W)));
      return;
    }
    // Wound the way the bars are, so where a head and a line overlap (its own shaft, or an arrow joined at its tip)
    // the fill adds up and leaves no hole.
    if (!half) out.push([T, add(base, mul(n, -W)), notch, add(base, mul(n, W))]);
    else if (half === "left") out.push([T, add(base, mul(n, -W)), add(notch, mul(n, -hw))]);
    else out.push([T, add(notch, mul(n, hw)), add(base, mul(n, W))]);
  };
  // How far a head takes over the shaft: to its notch (solid), its base (hollow), or not at all (angled).
  const takes = (h: Head) => (h === "none" ? 0 : shape === "angled" ? hw : shape === "hollow" ? H : h === "full" ? C : 0);
  const path = arrowPath(a, k), [S, T] = [path[0], path[path.length - 1]];
  // A closed curve ends where it starts: its marks have no direction to go by, and it needs none.
  const u: P = len(sub(T, S)) > 1e-9 ? unit(sub(T, S)) : [1, 0], n = perp(u);
  if (takesHeads(a)) {
    // One shaft, and a head at either end as set (the Curves menu) or as the kind has them.
    const { start, end } = headsOf(a), reversed = [...path].reverse();
    line(cut(cut(path, takes(end)).reverse(), takes(start)).reverse(), 0);
    if (end !== "none") head(path, end === "full" ? undefined : end);
    if (start !== "none") head(reversed, start === "full" ? undefined : start);
    // ChemDraw's marks, d (twice the head's half-width) each way: on the middle of the shaft a cross, or two
    // parallel slashes (hash); across the tail, at the notch's depth from it, a dipole's bar as wide as the head.
    const m = a.bend ? path[Math.floor(path.length / 2)] : mul(add(S, T), 0.5), d = 2 * W, at = (p: P, x: number, y: number) => add(add(p, mul(u, x * d)), mul(n, y * d));
    if (a.kind === "nogo") { bar(at(m, 1, 1), at(m, -1, -1)); bar(at(m, -1, 1), at(m, 1, -1)); }
    if (a.kind === "hash") { bar(at(m, 1, -1), at(m, 0, 1)); bar(at(m, 0, -1), at(m, -1, 1)); }
    if (a.kind === "dipole") { const b = add(S, mul(u, C)); bar(add(b, mul(n, -W)), add(b, mul(n, W))); }
    return out;
  }
  switch (a.kind) {
    case "cut":
      line(path, 0);
      break;
    case "equilibrium": {
      // Two half-headed arrows, one each way, barbs on the outside. An unbalanced one (ratio) shortens one of them
      // about the middle, as ChemDraw does: above 1 the back arrow, to its notch plus the rest over the ratio; below 1
      // the forward arrow, to the ratio of the whole. A bent one (from its point) is two arcs beside its own, and a
      // short one sweeps the ratio of its arc (ChemDraw's curved equilibrium).
      const g = 0.11 * s.bond, along = (q: P[]) => q.slice(1).reduce((sum, p, i) => sum + len(sub(p, q[i])), 0), whole = along(path), r = a.ratio ?? 1;
      const ahead = r < 1 ? whole * r : whole, back = r > 1 ? (a.bend ? whole / r : C + (whole - C) / r) : whole;
      // Part of a path about its middle: the fraction f of its length.
      const middle = (q: P[], f: number) => { const t = ((1 - f) / 2) * along(q); return cut(cut(q, t).reverse(), t).reverse(); };
      const top = middle(offsetPath(path, -g), ahead / (whole || 1)), bottom = middle(offsetPath(path, g), back / (whole || 1)).reverse();
      line(top, 0);
      head(top, "left");
      line(bottom, 0);
      head(bottom, "left");
      break;
    }
    case "block": {
      // Its outline, with the lines run on half a width at each corner so the corners close.
      const o = blockOutline({ ...a, scale: undefined }, s, k); // s is at the arrow's scale already
      o.forEach((p, i) => { const q = o[(i + 1) % o.length], e = unit(sub(q, p)); bar(add(p, mul(e, -hw)), add(q, mul(e, hw))); });
      break;
    }
    case "retro": {
      // Two lines and an open head.
      const g = 0.09 * s.bond, tip = add(T, mul(u, -2 * g)), back = add(T, mul(u, -(H + 2 * g)));
      for (const side of [-1, 1]) {
        bar(add(S, mul(n, side * g)), add(tip, mul(n, side * g)));
        bar(T, add(back, mul(n, side * (W + 2 * g))));
      }
      break;
    }
  }
  return out;
}

// Where a straight arrow's end head has a barb (px, y down): the handle that sizes the head. undefined when it has none.
export function headBarb(a: Arrow, s: Style, k: number): P | undefined {
  if (scaleOf(a) !== 1) s = { ...s, line: s.line * scaleOf(a) };
  const end = headsOf(a).end, S: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k];
  if (a.bend || end === "none" || !(takesHeads(a)) || a.kind === "curve" || len(sub(T, S)) < 1e-9) return undefined;
  const u = unit(sub(T, S)), size = headSize(a), f = headFit(a, s, k);
  return add(add(T, mul(u, -size.length * s.line * f)), mul(perp(u), (end === "left" ? -1 : 1) * size.width * s.line * f));
}

// A block arrow's outline (px, y down), as ChemDraw draws one: a shaft `shaft` line widths wide, and a head whose barbs
// stand off the axis by its notch depth, its length back from the tip. The shaft's edges meet the head's back edges.
export function blockOutline(a: Arrow, s: Style, k: number): P[] {
  if (scaleOf(a) !== 1) s = { ...s, line: s.line * scaleOf(a) };
  const S: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k];
  if (len(sub(T, S)) < 1e-9) return [];
  const u = unit(sub(T, S)), n = perp(u), size = headSize(a), fit = headFit(a, s, k);
  const H = size.length * s.line * fit, C = size.centre * s.line * fit, o = ((a.shaft ?? size.length) * s.line) / 2;
  const t = C > 0 ? Math.min(1, Math.max(0, 1 - o / C)) : 1, back = H - t * (H - C);
  const at = (along: number, across: number): P => add(add(T, mul(u, -along)), mul(n, across));
  return [add(S, mul(n, o)), at(back, o), at(H, C), T, at(H, -C), at(back, -o), add(S, mul(n, -o))];
}

// A path moved sideways by d (px) at every point, along the path's own normal there.
function offsetPath(path: P[], d: number): P[] {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)], t = sub(b, a);
    return len(t) < 1e-9 ? p : add(p, mul(perp(unit(t)), d));
  });
}

// A shape's lines in px (y down), as paths: the outline of a box or oval, or each bracket of a pair. A highlight's
// outline is its edge. Rounded corners have a radius of 0.3 bond lengths (or the box's own); bracket ends reach 0.25
// bond lengths in.
export function shapePaths(sh: Shape, k: number, bond = k): P[][] {
  const upright = uprightPaths(sh, k, bond * scaleOf(sh));
  if (!sh.angle || !turns(sh)) return upright;
  // Turned about the middle: anticlockwise on the page is clockwise in px (y down).
  const r = (sh.angle * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), c = middleOf(sh), cx = c[0] * k, cy = -c[1] * k;
  return upright.map((path) => path.map(([x, y]): P => [cx + (x - cx) * cs + (y - cy) * sn, cy - (x - cx) * sn + (y - cy) * cs]));
}
function uprightPaths(sh: Shape, k: number, bond: number): P[][] {
  const x0 = Math.min(sh.from[0], sh.to[0]) * k, x1 = Math.max(sh.from[0], sh.to[0]) * k;
  const y0 = -Math.max(sh.from[1], sh.to[1]) * k, y1 = -Math.min(sh.from[1], sh.to[1]) * k;
  const w = x1 - x0, h = y1 - y0, arc = (c: P, r: [number, number], a0: number, a1: number, n = 12): P[] =>
    Array.from({ length: n + 1 }, (_, i) => [c[0] + r[0] * Math.cos(a0 + ((a1 - a0) * i) / n), c[1] + r[1] * Math.sin(a0 + ((a1 - a0) * i) / n)] as P);
  switch (sh.kind) {
    case "oval": return [arc([(x0 + x1) / 2, (y0 + y1) / 2], [w / 2, h / 2], 0, 2 * Math.PI, 72)];
    case "rounded": {
      const r = Math.min((sh.radius ?? 0.3) * bond, w / 2, h / 2);
      return [[...arc([x1 - r, y0 + r], [r, r], -Math.PI / 2, 0), ...arc([x1 - r, y1 - r], [r, r], 0, Math.PI / 2), ...arc([x0 + r, y1 - r], [r, r], Math.PI / 2, Math.PI), ...arc([x0 + r, y0 + r], [r, r], Math.PI, 1.5 * Math.PI), [x1 - r, y0]]];
    }
    case "brackets": {
      const t = Math.min(0.25 * bond, w / 3);
      return sides(sh, [[x0 + t, y0], [x0, y0], [x0, y1], [x0 + t, y1]], [[x1 - t, y0], [x1, y0], [x1, y1], [x1 - t, y1]]);
    }
    case "parens": {
      // Each one an arc through its ends and a middle 0.25 bond lengths out.
      const t = Math.min(0.25 * bond, w / 3), R = (t * t + (h / 2) ** 2) / (2 * t), half = Math.asin(Math.min(1, h / 2 / R));
      return sides(sh, arc([x0 + R, (y0 + y1) / 2], [R, R], Math.PI - half, Math.PI + half, 32), arc([x1 - R, (y0 + y1) / 2], [R, R], half, -half, 32));
    }
    case "braces": {
      // Hooks at the ends, straight runs, and a point at the middle.
      const t = Math.min(0.25 * bond, w / 3), c = Math.min(t / 2, h / 4), m = (y0 + y1) / 2;
      const q = (a: P, ctl: P, b: P): P[] => Array.from({ length: 9 }, (_, i) => { const u = i / 8, v = 1 - u; return [v * v * a[0] + 2 * v * u * ctl[0] + u * u * b[0], v * v * a[1] + 2 * v * u * ctl[1] + u * u * b[1]] as P; });
      const brace = (x: number, s: number): P[] => [
        ...q([x + s * t, y0], [x + (s * t) / 2, y0], [x + (s * t) / 2, y0 + c]), ...q([x + (s * t) / 2, m - c], [x + (s * t) / 2, m], [x, m]),
        ...q([x, m], [x + (s * t) / 2, m], [x + (s * t) / 2, m + c]), ...q([x + (s * t) / 2, y1 - c], [x + (s * t) / 2, y1], [x + s * t, y1]),
      ];
      return sides(sh, brace(x0, 1), brace(x1, -1));
    }
    default: return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
  }
}

// A pair of brackets, or the one side asked for.
const sides = (sh: Shape, left: P[], right: P[]): P[][] => (sh.side === "left" ? [left] : sh.side === "right" ? [right] : [left, right]);
// Where a bracket's mark goes: just outside its top right corner (px, y down), or the top left for a left bracket alone.
// A turned bracket's mark stays upright, beside the same corner.
export function markAt(sh: Shape, k: number): { x: number; y: number; anchor: "start" | "end" } {
  const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.max(sh.from[1], sh.to[1]), f = scaleOf(sh);
  const at = (x: number, y: number) => (sh.angle ? turnPoint([x, y], middleOf(sh), sh.angle) : [x, y]);
  const [x, y] = sh.side === "left" ? at(x0 - 0.08 * f, y0 - 0.1 * f) : at(x1 + 0.08 * f, y0 - 0.1 * f);
  return { x: x * k, y: -y * k, anchor: sh.side === "left" ? "end" : "start" };
}

// Where a polymer bracket pair's labels go (px, y down, scale k): its usage label just outside the lower end of the
// right bracket, and its repeat pattern and flip tags at the upper end (under a mark there), as ChemDraw places them.
export function polymerLabelsAt(sh: Shape, k: number): { label: { x: number; y: number }; tags: { x: number; y: number } } {
  const x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]);
  const at = (x: number, y: number) => { const [px, py] = sh.angle ? turnPoint([x, y], middleOf(sh), sh.angle) : [x, y]; return { x: px * k, y: -py * k }; };
  return { label: at(x1 + 0.08, y0 + 0.05), tags: at(x1 + 0.08, y1 - (sh.mark ? 0.45 : 0.1)) };
}

// A shape's ink as filled polygons (px, y down), winding like the bonds: its lines at the line width, dashed when
// asked (dashes and gaps of 0.2 bond lengths). A highlight has no lines; its fill is its outline. A picture has none.
export function shapeInk(sh: Shape, s: Style, k: number): P[][] {
  if (sh.kind === "highlight" || sh.kind === "picture") return [];
  const f = scaleOf(sh), hw = ((sh.boldLine ? s.bold : s.line) / 2) * f, out: P[][] = [], dash = 0.2 * s.bond * f;
  const bar = (p: P, q: P) => { const d = len(sub(q, p)); if (d < 1e-9) return; const n = perp(unit(sub(q, p))); out.push([add(p, mul(n, -hw)), add(p, mul(n, hw)), add(q, mul(n, hw)), add(q, mul(n, -hw))]); };
  for (const path of shapePaths(sh, k, s.bond)) {
    // Lines run on by half a width at each joint so corners close.
    if (!sh.dashed) {
      for (let i = 0; i + 1 < path.length; i++) {
        if (len(sub(path[i + 1], path[i])) < 1e-9) continue; // where two curves meet
        const u = unit(sub(path[i + 1], path[i]));
        bar(add(path[i], mul(u, -hw)), add(path[i + 1], mul(u, hw)));
      }
      continue;
    }
    let on = true, left = dash;
    for (let i = 0; i + 1 < path.length; i++) {
      let p = path[i];
      const q = path[i + 1];
      while (len(sub(q, p)) > 1e-9) {
        const step = Math.min(left, len(sub(q, p))), r = add(p, mul(unit(sub(q, p)), step));
        if (on) bar(p, r);
        p = r;
        left -= step;
        if (left <= 1e-9) { on = !on; left = dash; }
      }
    }
  }
  return out;
}

// Dash segments along a path: on, off, on, ... measured along it.
export function dashes(path: P[], on: number, off: number): [P, P][] {
  const out: [P, P][] = [];
  let drawing = true, left = on, start: P | undefined = path[0];
  for (let i = 0; i + 1 < path.length; i++) {
    let p = path[i];
    const q = path[i + 1];
    while (len(sub(q, p)) > 1e-9) {
      const step = Math.min(left, len(sub(q, p))), r = add(p, mul(unit(sub(q, p)), step));
      p = r;
      left -= step;
      if (left <= 1e-9) {
        if (drawing && start) out.push([start, r]);
        drawing = !drawing;
        left = drawing ? on : off;
        start = drawing ? r : undefined;
      }
    }
  }
  if (drawing && start && len(sub(path[path.length - 1], start)) > 1e-9) out.push([start, path[path.length - 1]]);
  return out;
}
// A sine wave following a path: amplitude and wavelength in px, sampled finely.
export function waveAlong(path: P[], amplitude: number, wavelength: number): P[] {
  const out: P[] = [];
  let travelled = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i], q = path[i + 1], d = len(sub(q, p));
    if (d < 1e-9) continue;
    const u = unit(sub(q, p)), n = perp(u), steps = Math.max(1, Math.ceil(d / (wavelength / 12)));
    for (let j = 0; j <= steps; j++) {
      const t = (d * j) / steps, along = travelled + t;
      out.push(add(add(p, mul(u, t)), mul(n, amplitude * Math.sin((2 * Math.PI * along) / wavelength))));
    }
    travelled += d;
  }
  return out;
}

// An orbital's lobes as closed outlines (px, y down). second: the lobe takes the other phase (the back lobe of a p
// orbital, alternate lobes of a d orbital, a dz2's ring). Lobes follow r = L cos²(angle from their axis).
export function orbitalPaths(a: Arrow, k: number): { path: P[]; second: boolean }[] {
  const C: P = [a.from[0] * k, -a.from[1] * k], T: P = [a.to[0] * k, -a.to[1] * k], L = len(sub(T, C));
  if (L < 1e-6 || !a.orbital) return [];
  const u = unit(sub(T, C)), n = perp(u), axis = Math.atan2(u[1], u[0]);
  const at = (t: number, r: number): P => add(C, [r * Math.cos(t), r * Math.sin(t)]);
  const lobe = (dir: number, length: number, narrow = 1): P[] =>
    Array.from({ length: 49 }, (_, i) => { const f = -Math.PI / 2 / narrow + (Math.PI / narrow) * (i / 48); return at(dir + f, length * Math.cos(f * narrow) ** 2); });
  const ellipse = (a1: number, b1: number): P[] => Array.from({ length: 64 }, (_, i) => { const t = (2 * Math.PI * i) / 64; return add(add(C, mul(u, a1 * Math.cos(t))), mul(n, b1 * Math.sin(t))); });
  switch (a.orbital.shape) {
    case "s": return [{ path: ellipse(L, L), second: false }];
    case "oval": return [{ path: ellipse(L, 0.42 * L), second: false }];
    case "lobe": return [{ path: lobe(axis, L), second: false }];
    case "hybrid": return [{ path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, 0.38 * L), second: true }];
    case "p": return [{ path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, L), second: true }];
    case "d": return [0, 1, 2, 3].map((q) => ({ path: lobe(axis + Math.PI / 4 + (q * Math.PI) / 2, L, 2), second: q % 2 === 1 }));
    case "dz2": {
      // Two lobes along the axis and a ring round the middle, drawn as a flat band.
      const ring = ellipse(0.24 * L, 0.62 * L), hole = ellipse(0.1 * L, 0.32 * L).reverse();
      return [{ path: [...ring, ring[0], ...hole, hole[0]], second: true }, { path: lobe(axis, L), second: false }, { path: lobe(axis + Math.PI, L), second: false }];
    }
  }
}

// A TLC plate's layout (drawing units): its box, the origin and solvent front heights, each lane's middle, and
// where a spot of a given Rf sits.
export const TLC_ORIGIN = 0.12, TLC_FRONT = 0.1; // the origin's height and the front's depth, as fractions of the plate
export function tlcLayout(sh: Shape) {
  const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]);
  const lanes = Math.max(1, sh.tlc?.lanes ?? 1), origin = y0 + (y1 - y0) * (sh.tlc?.origin ?? TLC_ORIGIN), front = y1 - (y1 - y0) * (sh.tlc?.front ?? TLC_FRONT);
  const lane = (k: number) => x0 + ((x1 - x0) * (k + 0.5)) / lanes;
  const width = (x1 - x0) / lanes;
  // A spot's half-width and half-height (bond lengths): set by hand, or 30% of a lane (at most 0.34) by 0.15; drawn
  // times the plate's scale.
  const f = scaleOf(sh), size = (x: Spot) => ({ rx: (x.w ?? Math.min((0.3 * width) / f, 0.34)) * f, ry: (x.h ?? 0.15) * f });
  return { x0, x1, y0, y1, origin, front, lanes, width, lane, size, f, at: (rf: number) => origin + (front - origin) * rf };
}
// A spot's outline (drawing units): an ellipse, drawn out below into a smear when it has a tail. grow: how far out
// (a doubled spot's second outline).
export function spotPath(t: ReturnType<typeof tlcLayout>, x: Spot, grow = 0): [number, number][] {
  const cx = t.lane(x.lane), cy = t.at(x.rf), size = t.size(x), [rx, ry] = [size.rx + grow, size.ry + grow], tail = (x.tail ?? 0) * t.f, n = 32, out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * 2 * i) / n, sin = Math.sin(a);
    // The lower half stretches down by the tail, narrowing a little, so a smear reads as a streak.
    const down = sin < 0 ? tail * -sin : 0, narrow = sin < 0 && tail ? 1 - 0.35 * Math.min(1, tail / (ry * 4)) * -sin : 1;
    out.push([cx + rx * Math.cos(a) * narrow, cy + ry * sin - down]);
  }
  return out;
}

// A table's layout (drawing units, y up). Each column is as wide as its widest text plus padding, and the columns
// share out any width the box has to spare; rows are equal. measure: a cell's text width in drawing units at the
// table's own text size (or the document's caption size). caption: the document's caption size (pt). The text,
// padding and least sizes follow the table's scale.
export const TABLE_PAD = 0.35, TABLE_ROW = 0.8; // bond lengths: padding each side of a column's text; least row height
// A table's least row height: TABLE_ROW at its scale, taller for text larger than the document's caption size (pt).
export const tableRow = (sh: Pick<Shape, "size" | "scale">, caption = 10) => TABLE_ROW * scaleOf(sh) * Math.max(1, (sh.size ?? caption) / caption);
export function tableLayout(sh: Shape, measure: (text: string) => number = () => 0, caption?: number) {
  const x0 = Math.min(sh.from[0], sh.to[0]), y1 = Math.max(sh.from[1], sh.to[1]);
  const cells = sh.table?.cells.length ? sh.table.cells : [[""]];
  const rows = cells.length, cols = Math.max(...cells.map((r) => r.length)), f = scaleOf(sh);
  const natural = Array.from({ length: cols }, (_, c) => Math.max(f, ...cells.map((r) => (r[c] ? (measure(r[c]) + 2 * TABLE_PAD) * f : 0))));
  const spare = Math.max(0, Math.abs(sh.to[0] - sh.from[0]) - natural.reduce((a, b) => a + b, 0)) / cols;
  // Columns and rows whose borders were dragged keep their sizes; the rest share the box.
  const widths = natural.map((w, c) => Math.max(w, sh.table?.widths?.[c] ?? w + spare)), edges = [x0];
  for (const w of widths) edges.push(edges[edges.length - 1] + w);
  const h = Math.max(tableRow(sh, caption), Math.abs(sh.to[1] - sh.from[1]) / rows);
  const heights = Array.from({ length: rows }, (_, r) => sh.table?.heights?.[r] ?? h), tops = [y1];
  for (const v of heights) tops.push(tops[tops.length - 1] - v);
  return { x0, x1: edges[cols], y0: tops[rows], y1, rows, cols, h, widths, heights, natural, f, col: (c: number) => edges[c], row: (r: number) => tops[r] }; // row 0 at the top
}

// A pen curve as a polyline (px, y down): each Bézier segment in 24 steps.
export function curvePath(c: Curve, k: number): P[] {
  const pts = c.points, out: P[] = [], px = (q: [number, number]): P => [q[0] * k, -q[1] * k];
  if (!pts.length) return out;
  out.push(px(pts[0].at));
  const segments = c.closed && pts.length > 2 ? pts.length : pts.length - 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], p0 = px(a.at), p1 = px(a.c2 ?? a.at), p2 = px(b.c1 ?? b.at), p3 = px(b.at);
    if (!a.c2 && !b.c1) { out.push(p3); continue; }
    for (let j = 1; j <= 24; j++) {
      const t = j / 24, u = 1 - t;
      out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
    }
  }
  return out;
}
// Part of an ellipse as Bézier points (drawing units): the ellipse centre + cos t·a + sin t·b, from t0 to t1 (radians),
// one segment for each quarter turn or less. An affine map keeps Bézier points, so these are a circle's, mapped.
export function ellipsePoints(c: [number, number], a: [number, number], b: [number, number], t0: number, t1: number): CurvePoint[] {
  const n = Math.max(1, Math.ceil(Math.abs(t1 - t0) / (Math.PI / 2) - 1e-9)), dt = (t1 - t0) / n, k = (4 / 3) * Math.tan(dt / 4);
  const at = (t: number): [number, number] => [c[0] + Math.cos(t) * a[0] + Math.sin(t) * b[0], c[1] + Math.cos(t) * a[1] + Math.sin(t) * b[1]];
  const along = (t: number): [number, number] => [-Math.sin(t) * a[0] + Math.cos(t) * b[0], -Math.sin(t) * a[1] + Math.cos(t) * b[1]];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = t0 + i * dt, p = at(t), d = along(t);
    return { at: p, ...(i > 0 ? { c1: [p[0] - k * d[0], p[1] - k * d[1]] as [number, number] } : {}), ...(i < n ? { c2: [p[0] + k * d[0], p[1] + k * d[1]] as [number, number] } : {}) };
  });
}
// ChemDraw's elliptical arrow (its 270° Elliptical arrows): from the end of an ellipse's long axis 270° round, clockwise
// or not, to the end of its short axis, which is 0.4 times as long. from and to are its tail and head.
export function ellipseArrow(from: [number, number], to: [number, number], clockwise: boolean): Omit<Arrow, "id"> {
  const d = [to[0] - from[0], to[1] - from[1]], s = clockwise ? -1 : 1, q = 1 / 1.16;
  // The tail is the centre plus the long half-axis a; the head is the centre less the short one, b = 0.4 a turned a
  // quarter (anticlockwise, or clockwise): so to - from = -(a + b), solved for a.
  const a: [number, number] = [-q * (d[0] + s * 0.4 * d[1]), -q * (d[1] - s * 0.4 * d[0])], b: [number, number] = [-s * 0.4 * a[1], s * 0.4 * a[0]];
  const points = ellipsePoints([from[0] - a[0], from[1] - a[1]], a, b, 0, (3 * Math.PI) / 2);
  return { kind: "curve", from, to, curve: { points }, end: "full", headSize: headOfLength(ARC_HEAD) };
}
// A curve's box (drawing units) over its anchors and handles: [from, to] as a shape stores them.
export function curveBox(c: Curve): [[number, number], [number, number]] {
  const qs = c.points.flatMap((p) => [p.at, ...(p.c1 ? [p.c1] : []), ...(p.c2 ? [p.c2] : [])]);
  return [[Math.min(...qs.map((q) => q[0])), Math.max(...qs.map((q) => q[1]))], [Math.max(...qs.map((q) => q[0])), Math.min(...qs.map((q) => q[1]))]];
}

// Depth shading (ChemDraw's Structure Perspective): the depth range of a drawing, over every atom in it (ChemDraw takes
// every object on the page), or none when it is 5 pt or less (ChemDraw's limit; 14.4 pt to a bond length, as in ACS
// 1996). Depth is in bond lengths, nearer the viewer larger.
export function depthRange(m: Mol): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const a of m.atoms) { const z = a.location[2] ?? 0; if (z < lo) lo = z; if (z > hi) hi = z; }
  return hi - lo > 5 / 14.4 ? [lo, hi] : null;
}
// How strongly depth shading draws something at depth z, as ChemDraw fades it: 1 at the front of the range, 0.25 at
// the back, in hundredths.
export const shadeAt = (z: number, [lo, hi]: [number, number]) => Math.trunc(100 * (1 - (0.75 * (hi - Math.min(hi, Math.max(lo, z)))) / (hi - lo)) + 1e-9) / 100;
// Bonds whose lines cross (not at an atom they share), as [earlier, later] in the list. With s, also bonds whose end
// comes within the two bonds' widths and the margin of the other bond, as ChemDraw counts crossings (at: positions in
// px at the style's size, or in bond lengths with unit 1/s.bond). Bonds are sorted into a grid of cells `cell` wide,
// so only near bonds are tested; the tests stop at a fixed number, so a hostile file of long bonds cannot hold the
// drawing up (a gap is only a look).
export function crossingBonds(bonds: Bond[], at: (i: number) => P, cell: number, s?: Style, unit = 1): [number, number][] {
  const widths = s ? bonds.map((b) => crossWidth(b, s) * unit) : [], m = s ? ((s.margin * 1.6) / 1.69) * unit : 0, near = s ? m + 2 * Math.max(0, ...widths) : 0;
  const grid = new Map<number, number[]>(), out: [number, number][] = [], seen = new Set<number>();
  const c = (v: number) => Math.max(-1e6, Math.min(1e6, Math.floor(v / cell)));
  bonds.forEach((b, k) => {
    const p = at(b.atoms[0]), q = at(b.atoms[1]), x0 = c(Math.min(p[0], q[0]) - near), x1 = c(Math.max(p[0], q[0]) + near), y0 = c(Math.min(p[1], q[1]) - near), y1 = c(Math.max(p[1], q[1]) + near);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4096) return; // a bond across thousands of cells (no real drawing has one)
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { const key = x * 4194304 + y, list = grid.get(key); if (list) list.push(k); else grid.set(key, [k]); }
  });
  let tests = 0;
  for (const list of grid.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (++tests > 2e6) return out;
    const r = Math.min(list[i], list[j]), f = Math.max(list[i], list[j]), key = r * bonds.length + f;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = bonds[r].atoms, b = bonds[f].atoms;
    if (a[0] === b[0] || a[0] === b[1] || a[1] === b[0] || a[1] === b[1]) continue;
    if (meets(at(a[0]), at(a[1]), at(b[0]), at(b[1]), s ? m + widths[r] + widths[f] : 0)) out.push([r, f]);
  }
  return out;
}
// A bond's width as ChemDraw's bond crossings take it (its "logical width"): a single bond's line width (a bold bond's
// bold width, a wedge's 1.5 bold widths at its wide end), and for two lines or more the distance between the outer
// lines (and a bold line's width).
function crossWidth(b: Bond, s: Style): number {
  if (b.type === QUADRUPLE) return 3 * s.spacing;
  if (b.type === 3) return 2 * s.spacing;
  if (b.type === 2 || b.type === AROMATIC) return s.spacing + (b.display === "bold" ? s.bold : 0);
  if (b.stereo === 1 || b.stereo === 6 || b.display === "hollow") return 1.5 * s.bold;
  return b.display === "bold" ? s.bold : s.line;
}
// Whether two bonds meet as ChemDraw's crossings count it: their lines cross, or (with near) an end of one lies within
// near of the other, unless they are all but parallel.
function meets(p1: P, p2: P, q1: P, q2: P, near: number): boolean {
  if (crossing(p1, p2, q1, q2)) return true;
  if (!near || Math.abs(cross(sub(p2, p1), sub(q2, q1))) < (near * near) / 2) return false;
  const off = (p: P, a: P, b: P) => { const d = sub(b, a), l = dot(d, d), t = l ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l)) : 0; return len(sub(add(a, mul(d, t)), p)); };
  return off(p1, q1, q2) < near || off(p2, q1, q2) < near || off(q1, p1, p2) < near || off(q2, p1, p2) < near;
}
// A polygon less a convex polygon (`cut`, either winding): the pieces outside each of its edges in turn, so they do not
// overlap (a faint, depth-shaded bond shows no darker seams).
function without(poly: P[], cut: P[]): P[][] {
  const out: P[][] = [], c = mul(cut.reduce<P>((t, q) => add(t, q), [0, 0]), 1 / cut.length);
  let rest = poly;
  for (let k = 0; k < cut.length && rest.length; k++) {
    const a = cut[k], b = cut[(k + 1) % cut.length], e = sub(b, a);
    if (len(e) < 1e-9) continue;
    let n = unit(perp(e));
    if (dot(sub(c, a), n) > 0) n = mul(n, -1); // n points out of the cut
    const outside = clipSide(rest, a, n, 0);
    if (outside.length) out.push(outside);
    rest = clipSide(rest, a, mul(n, -1), 0);
  }
  return out;
}
// The part of a polygon where dot(q − o, n) ≥ d (Sutherland–Hodgman against one line); empty when nothing is left.
function clipSide(poly: P[], o: P, n: P, d: number): P[] {
  const out: P[] = [], f = (q: P) => dot(sub(q, o), n) - d;
  poly.forEach((q, k) => {
    const r = poly[(k + 1) % poly.length], fq = f(q), fr = f(r);
    if (fq >= 0) out.push(q);
    if ((fq >= 0) !== (fr >= 0)) out.push(add(q, mul(sub(r, q), fq / (fq - fr))));
  });
  return out.length >= 3 ? out : [];
}
// Where segments p1–p2 and q1–q2 cross, as fractions along each (inside both), or undefined.
function crossing(p1: P, p2: P, q1: P, q2: P): [number, number] | undefined {
  const r = sub(p2, p1), s = sub(q2, q1), d = cross(r, s);
  if (Math.abs(d) < 1e-9) return undefined;
  const t = cross(sub(q1, p1), s) / d, u = cross(sub(q1, p1), r) / d;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98 ? [t, u] : undefined;
}
