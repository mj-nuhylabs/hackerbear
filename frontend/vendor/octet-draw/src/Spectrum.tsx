// The Spectrum panel: the predicted ¹H or ¹³C NMR spectrum of a structure, and a measured spectrum opened from a file
// (JCAMP-DX or Bruker: NMR, IR, UV-Vis, MS), docked under the canvas (ChemDraw opens a new window; here the structure
// stays in view). Predicted and measured show alone, one above the other, or overlaid. Pointing at a peak lights its
// atoms on the canvas and pointing at an atom lights its peak. A measured multiplet is linked to atoms and bonds (an IR
// band to its C=O) by a click on it and then on them, or by a drag from it to one. The wheel zooms the shift axis, a
// drag pans it, a Shift-drag makes one multiplet of the peaks it covers, and a double-click shows all of it. Expanded,
// the panel fills the canvas with the structure beside the spectrum (the canvas's own drawing, shown again).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { host, inHost } from "./synpath"; // SynPath: portals go in the editor's own element
import { createPortal } from "react-dom";
import { ArrowsIn, ArrowsOut, ChartLine, CopySimple, LinkBreak, ListBullets, Tag, Trash, X } from "@phosphor-icons/react";
import { acsText, detailsTable, multiplicity, quality, type Nucleus, type Prediction, type Signal } from "./nmr";
import { levels, measuredText, nameOf, nucleusText, reversed, type Analysis, type Measured } from "./measured";
import { Select } from "./Select";
import { NumberField, Segmented } from "./Fields";
import { Slider } from "./Actions";
import { listOpen, Pick } from "./Menu";
import { useMovable } from "./movable";
import { holdCursor } from "./cursor";
import { useLeaving } from "./motion";
import { HIGHLIGHT_COLOURS } from "./docstyle";
import { columnsOf, fullRange, inkOf, labelRow, peakIn, sample, solventPeaks, spectrumLines, ticks, traceColumns, turned, NOTICE, SOLVENTS, type LabelTurn, type Line, type Trace } from "./spectrumplot";
import { textWidth } from "./chem";

const FIELDS = [60, 80, 90, 200, 300, 400, 500, 600, 700, 800];
const HEIGHT = 184, STACKED = 320, TOP = 44, BASE = 26, PAD = 14; // px: the plot docked (one lane, two), room for labels above a lane and the axis below, and its ends

// Colours for peaks and the discs behind their atoms: ten of the highlight colours, in an order that keeps
// neighbouring peaks far apart.
const PEAKS = ["Blue", "Orange", "Green", "Red", "Purple", "Teal", "Pink", "Gold", "Brown", "Slate"].map((name) => HIGHLIGHT_COLOURS.find(([n]) => n === name)!);
export const PEAK_COLOURS = PEAKS.map(([, hex]) => hex);

export type Show = "predicted" | "measured" | "stacked" | "overlaid";

// A lane's peak labels, laid out as the page's are (spectrumplot's labelRow): each label's x, the x its lines run from
// and to, its shift and the rest (multiplicity and hydrogens), and plain: a name (the solvent's or TMS's).
export type RowLabel = { x: number; a: number; b: number; shift: string; rest: string; plain?: boolean };
const FONT = 11, GAP = 3, BAND = 10, STUB = 3; // px: the labels' size, the gap over the ink, the slants' band, the stubs
const oneLine = (l: RowLabel) => (l.rest ? `${l.shift} (${l.rest})` : l.shift);
// A label's width in px in the font the panel draws it in, with its digits all as wide (tabular, as the plot sets them).
const PANEL_FONT = inHost((h) => getComputedStyle(h).getPropertyValue("--font-sans")); // SynPath: tokens live on .octet-host
const widthOf = (t: string, size: number) => textWidth(t.replace(/\d/g, "0"), size, false, false, PANEL_FONT);
// Whether a lane's labels turn (Labels), their widths across the row, and the room they need over the lane. dot: room
// for the linked mark over a turned label.
export function rowSize(ls: RowLabel[], turn: LabelTurn, width: number, dot = 0) {
  const across = ls.map((l) => Math.max(widthOf(l.shift, FONT), widthOf(l.rest, FONT)) + 8), vertical = turned(turn, ls.map((l) => l.x), across, 2, width - 2, ls.map((l) => l.plain));
  const room = 2 * GAP + BAND + STUB + (vertical ? Math.max(0, ...ls.map((l) => widthOf(oneLine(l), FONT))) + 4 + dot : 29);
  return { vertical, widths: vertical ? ls.map(() => 15) : across, room };
}
// The label row in the panel's own px (y down): lane is the lane's top and bottom, ink the ink's height over its bottom.
export function panelRow(ls: RowLabel[], size: ReturnType<typeof rowSize>, width: number, lane: { top: number; bottom: number }, ink: (a: number, b: number) => number) {
  const row = labelRow(ls.map((l, i) => ({ x: l.x, a: l.a, b: l.b, width: size.widths[i], plain: l.plain })), { lo: 2, hi: width - 2, ceiling: lane.bottom - lane.top, ink, pt: 1, gap: GAP, band: BAND, stub: STUB });
  const path = (pts: [number, number][]) => pts.map(([px, h], k) => `${k ? "L" : "M"}${px.toFixed(1)} ${(lane.bottom - h).toFixed(1)}`).join("");
  return { ...row, base: lane.bottom - row.base, paths: row.leaders.map(path), brackets: row.brackets.map((b) => ({ peaks: b.peaks, d: path(b.points) })) };
}
// A row's label: across, the shift over the rest; turned, one line read bottom to top.
export function RowText({ l, at, base, vertical }: { l: RowLabel; at: number; base: number; vertical: boolean }) {
  if (vertical) return <text x={at + 4} y={base - 2} transform={`rotate(-90 ${at + 4} ${base - 2})`}>{l.shift}{l.rest && <tspan className="spectrum-integral"> ({l.rest})</tspan>}</text>;
  return <><text x={at} y={l.rest ? base - 15 : base - 3} textAnchor="middle">{l.shift}</text>{l.rest && <text className="spectrum-integral" x={at} y={base - 3} textAnchor="middle">{l.rest}</text>}</>;
}
type PanelRow = ReturnType<typeof panelRow>;
// A key's name on its button: ¹H, ¹³C, ¹⁹F, IR, UV-Vis, MS.
const keyName = (k: string) => (/^\d/.test(k) ? nucleusText(k) : nameOf(k));

type Props = {
  spectrumKey: string; keys: string[]; onKey: (k: string) => void; // which spectrum: a nucleus ("1H", "13C") or a measured kind ("ir")
  prediction?: Prediction; mhz: number; solvent: string; lit: Set<number>; solventPeaks: boolean;
  colours: (string | undefined)[]; // each signal's colour (its atoms' highlight)
  details: boolean; onDetails: (on: boolean) => void; // the table of how each shift was found
  onColour: (signal: number, colour?: string) => void; onColourAll: (on: boolean) => void;
  // Add to drawing: the spectrum as shown (its shift range), each shift beside its atom, or the key (coloured shifts),
  // as objects on the page that save, print and export with it.
  onAdd: (what: "spectrum" | "shifts" | "key", range: [number, number]) => void;
  inset?: [number, number, number, number]; // the structure's box on the canvas (px), shown beside the spectrum when expanded
  onMhz: (mhz: number) => void; onSolvent: (s: string) => void; onSolventPeaks: (on: boolean) => void;
  labels: LabelTurn; onLabels: (t: LabelTurn) => void; // the peak labels across, turned, or Auto (turned when crowded)
  onPoint: (atoms?: number[]) => void; onCopy: (text: string) => void; onClose: () => void;
  // The measured spectrum and its analysis, how the two show, and its multiplets: those lit from the canvas, each
  // one's colour (its atoms' highlight), number of linked atoms and bonds and of bonds alone, and the one being linked.
  measured?: Measured; analysis?: Analysis; show: Show; onShow: (s: Show) => void;
  litGroups: Set<number>; groupColour: (id: number) => string | undefined; linkedCount: (id: number) => number; linkedBondCount: (id: number) => number;
  chosenGroup?: number; onChooseGroup: (id?: number) => void; onPointGroup: (id?: number) => void;
  onThreshold: (t: number) => void; onDefine: (lo: number, hi: number) => void; onCount: (id: number, n: number) => void;
  onLinkHover: (at?: [number, number]) => void; onLinkAt: (id: number, at: [number, number]) => void; onUnlink: (id: number) => void;
  onGroupColour: (id: number, colour?: string) => void; onGroupColourAll: (on: boolean) => void; onRemove: () => void;
};

export function SpectrumPanel(p: Props) {
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(600), [expanded, setExpanded] = useState(false), [tall, setTall] = useState(HEIGHT);
  const nucleus: Nucleus | undefined = p.spectrumKey === "1H" || p.spectrumKey === "13C" ? p.spectrumKey : undefined;
  const m = p.measured, a = p.analysis;
  const show: Show = !m ? "predicted" : !nucleus ? "measured" : p.show;
  const showP = show !== "measured" && !!nucleus, showM = show !== "predicted" && !!m && !!a;
  const docked = show === "stacked" ? STACKED : HEIGHT;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => { setWidth(el.clientWidth); setTall(Math.max(docked, el.clientHeight)); };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [expanded, docked]);
  // Escape lets go of the multiplet being linked, then leaves full screen.
  useEffect(() => {
    if (!expanded && p.chosenGroup === undefined) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || listOpen()) return;
      e.stopPropagation();
      if (p.chosenGroup !== undefined) p.onChooseGroup(undefined); else setExpanded(false);
    };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [expanded, p.chosenGroup]); // eslint-disable-line react-hooks/exhaustive-deps
  const H = expanded ? tall : docked;
  const h1M = !!m && m.kind === "nmr" && m.nucleus === "1H";
  const base = showM && h1M ? 42 : BASE, axisY = H - base;

  // The x range to show all: the prediction's, the measured spectrum's, or both. NMR and IR run high to low.
  const rev = m && showM ? reversed(m) : true;
  const all = useMemo((): [number, number] => {
    const r: [number, number][] = [];
    if (showP) r.push(fullRange(p.prediction, nucleus!));
    if (showM && m) {
      const lo = Math.min(m.first, m.last), hi = Math.max(m.first, m.last), pad = m.sticks ? 0.05 * (hi - lo) || 1 : 0;
      r.push([lo - pad, hi + pad]);
    }
    return r.length ? [Math.min(...r.map((x) => x[0])), Math.max(...r.map((x) => x[1]))] : [0, 10];
  }, [p.prediction, nucleus, m, showP, showM]);
  const [range, setRange] = useState<[number, number]>();
  const [lo, hi] = range ?? all;
  useLayoutEffect(() => setRange(undefined), [p.spectrumKey, p.prediction, m?.first, m?.last, show === "predicted"]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = (v: number) => PAD + ((rev ? hi - v : v - lo) / (hi - lo)) * (width - 2 * PAD), at = (px: number) => (rev ? hi - ((px - PAD) / (width - 2 * PAD)) * (hi - lo) : lo + ((px - PAD) / (width - 2 * PAD)) * (hi - lo));
  const signals = useMemo(() => (showP ? p.prediction?.signals ?? [] : []), [p.prediction, showP]);
  const shown = (s: Signal) => s.shift >= lo && s.shift <= hi;
  // Overlaid on a measured spectrum the prediction is drawn faint, unlabelled. The solvent's own peaks, in grey: the
  // residual peak (and water) in ¹H, the deuterated carbons in ¹³C.
  const faint = show === "overlaid";
  const solvent = useMemo(() => (showP && !faint && p.solventPeaks && nucleus ? solventPeaks(p.solvent, nucleus, p.mhz) : []), [p.solvent, p.solventPeaks, nucleus, p.mhz, showP, faint]);
  // Every line (¹³C: one for each signal), and each signal's, computed once.
  const lineList = useMemo(() => (nucleus ? spectrumLines(signals, nucleus, p.mhz, solvent) : []), [signals, nucleus, p.mhz, solvent]);
  const split = useMemo(() => { const out: Line[][] = signals.map(() => []); for (const l of lineList) if (l.signal >= 0) out[l.signal].push(l); return out; }, [signals, lineList]);
  const [pointed, setPointed] = useState<number>();
  const [pointedGroup, setPointedGroup] = useState<number>();
  const [chosen, setChosen] = useState<number>(); // the predicted peak clicked, to colour
  useLayoutEffect(() => setChosen(undefined), [nucleus, p.prediction, show]);
  const drag = useRef<{ from: [number, number]; range: [number, number]; moved: boolean; group?: number; band?: boolean; link?: boolean }>(undefined);
  const [link, setLink] = useState<{ from: [number, number]; to: [number, number] }>(); // a drag from a multiplet to an atom
  const [band, setBand] = useState<[number, number]>(); // a Shift-drag's range (px)
  const move = useMovable("spectrum", expanded), leaving = useLeaving(); // full screen stays put
  const clip = useId();
  const anyColour = showM ? (a?.groups ?? []).some((g) => p.groupColour(g.id)) : p.colours.some(Boolean);

  // The lowest and highest shift of some lines.
  const span = (ls: { ppm: number }[]) => [Math.min(...ls.map((l) => l.ppm)), Math.max(...ls.map((l) => l.ppm))] as const;
  const pxSpan = (ls: { ppm: number }[]) => { const [a, b] = span(ls).map(x); return { a: Math.min(a, b), b: Math.max(a, b) }; };
  const inRange = faint ? [] : signals.map((s, k) => (shown(s) ? k : -1)).filter((k) => k >= 0), solventIn = solvent.filter((s) => s.ppm >= lo && s.ppm <= hi);
  const labelsP: RowLabel[] = [
    ...inRange.map((k) => { const s = signals[k]; return { x: x(s.shift), ...pxSpan(split[k]), shift: s.shift.toFixed(nucleus === "1H" ? 2 : 1), rest: nucleus === "1H" ? `${multiplicity(s)}, ${s.nuclei}H` : s.nuclei > 1 ? `${s.nuclei}C` : "" }; }),
    ...solventIn.map((s) => ({ x: x(s.ppm), ...pxSpan(s.lines), shift: s.name, rest: "", plain: true })),
  ];
  const groups = useMemo(() => (showM ? a!.groups.filter((g) => g.shift >= lo && g.shift <= hi) : []), [a, showM, lo, hi]);
  const ownGroups = groups.filter((g) => !g.other);
  const dp = m?.kind === "nmr" ? (m.nucleus === "1H" ? 2 : 1) : m?.kind === "ms" && !ownGroups.every((g) => Math.abs(g.shift - Math.round(g.shift)) < 0.05) ? 1 : 0;
  const second = (g: Analysis["groups"][number]) => (h1M ? `${g.name}, ${Math.max(1, Math.round(g.n))}H` : "");
  const pxRange = (g: { lo: number; hi: number }) => ({ a: Math.min(x(g.lo), x(g.hi)), b: Math.max(x(g.lo), x(g.hi)) });
  const labelsM: RowLabel[] = groups.map((g) => (g.other ? { x: x(g.shift), ...pxRange(g), shift: g.other, rest: "", plain: true } : { x: x(g.shift), ...pxRange(g), shift: g.shift.toFixed(dp), rest: second(g) }));
  // The labels over each lane, and so the room each lane leaves for them; then the lanes: one, or the predicted
  // spectrum above the measured one.
  const sizeP = rowSize(labelsP, p.labels, width), sizeM = rowSize(labelsM, p.labels, width, 8);
  // The measured lane's marks stand up to 10 px over it. Each lane keeps at least 32 px, however long the labels.
  const lanes = show === "stacked" ? 2 : 1, room = Math.min(Math.max(TOP, (axisY - 32 * lanes) / lanes), Math.max(TOP, showP && !faint ? sizeP.room : 0, showM ? sizeM.room + 10 : 0));
  const laneP = show === "stacked" ? { top: room, bottom: room + (axisY - 2 * room) / 2 } : { top: room, bottom: axisY };
  const laneM = show === "stacked" ? { top: laneP.bottom + room, bottom: axisY } : { top: room, bottom: axisY };

  // --- The predicted spectrum --------------------------------------------------------------------------------------
  // ¹H as the lines summed (sample), each pixel column drawn from its lowest to its highest value, so every line shows
  // at any zoom; ¹³C as sticks, as tall as the carbons they count. step: two points a pixel when zoomed in close.
  const step = (hi - lo) / (2 * width), pxPpm = (hi - lo) / (width - 2 * PAD);
  const trace = useMemo(() => (nucleus === "1H" && signals.length ? sample(lineList.filter((l) => l.signal >= 0), lo, hi, step) : undefined), [lineList, signals, nucleus, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const solventTrace = useMemo(() => (nucleus === "1H" && solvent.length ? sample(lineList.filter((l) => l.signal < 0), lo, hi, step) : undefined), [lineList, solvent, nucleus, lo, hi, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = nucleus === "1H" ? Math.max(1e-9, trace ? peakIn(trace) : 0, solventTrace ? peakIn(solventTrace) : 0) : Math.max(1, ...signals.map((s) => s.nuclei), ...solvent.flatMap((s) => s.lines.map((l) => l.h)));
  const y = (v: number) => laneP.bottom - (v / top) * (laneP.bottom - laneP.top);
  const to = ([px, v]: [number, number]) => `${px.toFixed(1)} ${y(v).toFixed(1)}`;
  const pathOf = (t?: Trace) => (t ? columnsOf(t, x, width).map((q, i) => `${i ? "L" : "M"}${to(q)}`).join("") : "");
  const path = pathOf(trace);
  const on = (s: Signal, k: number) => pointed === k || s.atoms.some((atom) => p.lit.has(atom));
  // What a measured multiplet is linked to, in words: "2 atoms and 1 bond".
  const linkedWords = (id: number) => {
    const bonds = p.linkedBondCount(id), atoms = p.linkedCount(id) - bonds, words = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
    return [atoms ? words(atoms, "atom") : "", bonds ? words(bonds, "bond") : ""].filter(Boolean).join(" and ");
  };

  // --- The measured spectrum ---------------------------------------------------------------------------------------
  // Its trace (each pixel's highest and lowest point), scaled so the tallest peak in view that is not the solvent's
  // fills its lane; taller ones are cut at the lane's top. A peak table's sticks rise from the axis.
  const lv = useMemo(() => (m ? levels(m) : undefined), [m]);
  const cols = useMemo(() => (m && lv && showM && !m.sticks ? traceColumns({ first: m.first, last: m.last, y: lv.v, xs: m.xs }, x, width) : undefined), [m, lv, showM, lo, hi, width, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const mTop = useMemo(() => {
    if (!m || !lv || !a) return 1;
    const others = a.groups.filter((g) => g.other);
    let best = 0;
    for (let i = 0; i < lv.v.length; i++) {
      const xv = m.xs ? m.xs[i] : m.first + (i * (m.last - m.first)) / Math.max(1, lv.v.length - 1);
      if (xv < lo || xv > hi || others.some((g) => xv >= g.lo && xv <= g.hi)) continue;
      best = Math.max(best, lv.v[i] - lv.base);
    }
    return best > 0 ? best * 1.05 : Math.max(1e-30, lv.top);
  }, [m, lv, a, lo, hi]);
  const yM = (v: number) => laneM.bottom - ((v - (lv?.base ?? 0)) / mTop) * (laneM.bottom - laneM.top);
  const groupOn = (id: number) => pointedGroup === id || p.chosenGroup === id || p.litGroups.has(id);
  // Each lane's label row: the ink's height over the lane's bottom from a to b px places the leaders.
  const rowP: PanelRow | undefined = labelsP.length ? panelRow(labelsP, sizeP, width, laneP, nucleus === "1H"
    ? (a0, b0) => { const [u, v] = [at(a0), at(b0)]; return (Math.max(trace ? peakIn(trace, u, v) : 0, solventTrace ? peakIn(solventTrace, u, v) : 0) / top) * (laneP.bottom - laneP.top); }
    : inkOf([...signals.map((q): [number, number] => [x(q.shift), (q.nuclei / top) * (laneP.bottom - laneP.top)]), ...solvent.flatMap((q) => q.lines.map((l): [number, number] => [x(l.ppm), (l.h / top) * (laneP.bottom - laneP.top)]))])) : undefined;
  const rowM: PanelRow | undefined = labelsM.length && m && lv ? panelRow(labelsM, sizeM, width, laneM, inkOf([
    ...(m.sticks && m.xs ? Array.from(m.xs, (xv, i): [number, number] => [x(xv), lv.v[i]]) : cols ?? []).map(([q, v]): [number, number] => [q, Math.min(laneM.bottom - laneM.top, laneM.bottom - yM(v))]),
    // The mark over each peak.
    ...(m.sticks ? [] : a!.peaks.map((pk): [number, number] => [x(pk.x), Math.min(laneM.bottom - laneM.top + 10, laneM.bottom - yM(lv.base + pk.h) + 7)])),
  ])) : undefined;
  // The multiplet under the pointer: the nearest whose range spans it, within 6 px.
  const groupAt = (px: number, py: number) => {
    if (!showM || (show === "stacked" && py < laneP.bottom + 4)) return undefined;
    let best: number | undefined, d = 6;
    for (const g of ownGroups) {
      const xa = Math.min(x(g.lo), x(g.hi)), xb = Math.max(x(g.lo), x(g.hi)), gap = px < xa ? xa - px : px > xb ? px - xb : 0;
      if (gap < d) { d = gap; best = g.id; }
    }
    return best;
  };

  const { out: tickAt, places } = ticks(lo, hi, width);
  const predictedText = p.prediction && nucleus ? acsText(p.prediction, p.mhz, p.solvent) : "";
  const text = showM && m && a ? measuredText(m, a, m.kind === "nmr" ? p.solvent : undefined) : predictedText;
  const chosenM = p.chosenGroup !== undefined ? a?.groups.find((g) => g.id === p.chosenGroup) : undefined;

  // The predicted signal under the pointer: the nearest whose lines span the pointer, within 8 px.
  const signalAt = (px: number, py: number) => {
    if (!showP || faint || (show === "stacked" && py > laneP.bottom + 4)) return undefined;
    let best: number | undefined, d = 8;
    split.forEach((ls, k) => {
      const xa = Math.min(...ls.map((l) => x(l.ppm))), xb = Math.max(...ls.map((l) => x(l.ppm))), gap = px < xa ? xa - px : px > xb ? px - xb : 0;
      if (gap < d) { d = gap; best = k; }
    });
    return best;
  };
  const setPoint = (k?: number, g?: number) => {
    if (k !== pointed) { setPointed(k); p.onPoint(k === undefined ? undefined : signals[k].atoms); }
    if (g !== pointedGroup) { setPointedGroup(g); p.onPointGroup(g); }
  };
  const outside = (cx: number, cy: number) => { const r = box.current?.closest("section")?.getBoundingClientRect(); return !r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom; };

  return (
    <section className={["spectrum", expanded && "expanded", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Spectrum" style={move.style} inert={leaving}>
      {/* The shared panel header (as Actions and Properties): the title at the left, the close button at the top right.
          The controls sit in a row of their own under it. */}
      <header onPointerDown={move.onPointerDown}>
        <h2>{nameOf(p.spectrumKey)}{m && showM && m.title && <span className="spectrum-title">{m.title}</span>}</h2>
        <span className="spectrum-head-buttons">
          <button className="actions-close" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Leave full screen" : "Full screen"} data-tip={expanded ? "Leave full screen" : "Full screen"}>{expanded ? <ArrowsIn size={12} /> : <ArrowsOut size={12} />}</button>
          <button className="actions-close" onClick={p.onClose} aria-label="Close spectrum" data-tip="Close spectrum"><X size={12} /></button>
        </span>
      </header>
      <div className="spectrum-controls">
        <Segmented label="Spectrum" value={p.spectrumKey} options={p.keys.map((k) => [k, keyName(k)])} onChange={p.onKey} />
        {m && nucleus && <Segmented label="Show" value={show} options={[["predicted", "Predicted"], ["measured", "Measured"], ["stacked", "Stacked"], ["overlaid", "Overlaid"]]} onChange={p.onShow} />}
        {showP && <Select label="Frequency" value={String(p.mhz)} options={FIELDS.map((f) => [String(f), `${f} MHz`])} onChange={(v) => p.onMhz(Number(v))} />}
        {(showP || m?.kind === "nmr") && <Select label="Solvent" value={p.solvent} options={[...new Set([...SOLVENTS, p.solvent])].map((s) => [s, s])} onChange={p.onSolvent} />}
        {showP && !faint && <button className="spectrum-button" aria-pressed={p.solventPeaks} onClick={() => p.onSolventPeaks(!p.solventPeaks)} data-tip={p.solventPeaks ? "Hide the solvent's peaks" : "Show the solvent's peaks"}>Solvent peaks</button>}
        <Segmented label="Labels" value={p.labels} options={[["auto", "Auto"], ["horizontal", "Horizontal"], ["vertical", "Vertical"]]} onChange={p.onLabels} />
        {showP && !showM && <button className="spectrum-button" aria-pressed={p.details} onClick={() => p.onDetails(!p.details)} data-tip={p.details ? "Hide the details" : "How each shift was predicted, and how far to trust it"}>Details</button>}
        {showM && m && <span className="spectrum-threshold"><Slider name="Threshold" value={Math.round(m.threshold * 1000) / 10} min={0.5} max={50} step={0.5} show={(v) => `${v}%`} onChange={(v) => p.onThreshold(v / 100)} /></span>}
        <span className="spectrum-gap" />
        {chosen !== undefined && !showM && (
          // The clicked peak's colour, which its atoms take as a highlight too.
          <span className="spectrum-swatches" role="radiogroup" aria-label="Peak colour">
            {PEAKS.map(([name, c]) => <button key={c} role="radio" aria-checked={p.colours[chosen] === c} aria-label={name} data-tip={name} className="swatch" style={{ background: c }} onClick={() => p.onColour(chosen, c)} />)}
            <button role="radio" aria-checked={!p.colours[chosen]} aria-label="No colour" data-tip="No colour" className="swatch none" onClick={() => p.onColour(chosen, undefined)} />
          </span>
        )}
        {chosenM && p.linkedCount(chosenM.id) > 0 && (
          <span className="spectrum-swatches" role="radiogroup" aria-label="Peak colour">
            {PEAKS.map(([name, c]) => <button key={c} role="radio" aria-checked={p.groupColour(chosenM.id) === c} aria-label={name} data-tip={name} className="swatch" style={{ background: c }} onClick={() => p.onGroupColour(chosenM.id, c)} />)}
            <button role="radio" aria-checked={!p.groupColour(chosenM.id)} aria-label="No colour" data-tip="No colour" className="swatch none" onClick={() => p.onGroupColour(chosenM.id, undefined)} />
          </span>
        )}
        {chosenM && h1M && !chosenM.other && <NumberField label="Hydrogens" unit="H" value={Math.round(chosenM.n * 100) / 100} min={0.01} max={1000} step={1} lazy onChange={(n) => p.onCount(chosenM.id, n)} />}
        {chosenM && p.linkedCount(chosenM.id) > 0 && <button className="spectrum-button" onClick={() => p.onUnlink(chosenM.id)} data-tip="Unlink this peak from its atoms and bonds"><LinkBreak size={16} /> Unlink</button>}
        <button className="spectrum-button" onClick={() => (showM ? p.onGroupColourAll(!anyColour) : p.onColourAll(!anyColour))} disabled={showM ? !(a?.groups ?? []).some((g) => p.linkedCount(g.id)) : !signals.length}>{anyColour ? "Clear colours" : "Colour peaks"}</button>
        <Pick label="Add to drawing" value="" className="spectrum-button" title="Put the spectrum, the shifts or the key on the page" disabled={showM ? !ownGroups.length : !signals.length}
          groups={[[{ key: "spectrum", name: "Spectrum", icon: <ChartLine size={18} /> }, { key: "shifts", name: "Shifts beside atoms", icon: <Tag size={18} /> }, { key: "key", name: "Key", icon: <ListBullets size={18} /> }]]}
          onPick={(what) => p.onAdd(what as "spectrum" | "shifts" | "key", [lo, hi])}>
          Add to drawing
        </Pick>
        <button className="spectrum-button" onClick={() => p.onCopy(text)} disabled={!text} data-tip="Copy the characterisation line"><CopySimple size={16} /> Copy</button>
        {m && <button className="spectrum-button" onClick={p.onRemove} data-tip="Remove the measured spectrum from the drawing" aria-label="Remove measured spectrum"><Trash size={16} /></button>}
      </div>
      <div className="spectrum-body">
      <div ref={box} className="spectrum-plot">
        <svg
          width={width} height={H} role="img" aria-label={text || "No spectrum"}
          onWheel={(e) => {
            const pin = at(e.nativeEvent.offsetX), k = Math.exp(e.deltaY * 0.002), fewest = showM && m ? Math.abs(m.last - m.first) / 2000 : nucleus === "1H" ? 0.05 : 1;
            const span = Math.min(all[1] - all[0], Math.max(fewest, (hi - lo) * k)), f = (hi - pin) / (hi - lo);
            const h = Math.min(all[1], Math.max(all[0] + span, pin + f * span));
            setRange([h - span, h]);
          }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            holdCursor(e.currentTarget);
            const px = e.nativeEvent.offsetX, py = e.nativeEvent.offsetY;
            drag.current = { from: [e.clientX, e.clientY], range: [lo, hi], moved: false, group: groupAt(px, py), band: e.shiftKey && showM };
            if (drag.current.band) setBand([px, px]);
          }}
          onPointerMove={(e) => {
            const d = drag.current, px = e.nativeEvent.offsetX, py = e.nativeEvent.offsetY;
            if (d && e.buttons) {
              const dx = e.clientX - d.from[0], dy = e.clientY - d.from[1];
              if (!d.moved && Math.hypot(dx, dy) <= 3) return;
              // A drag from a multiplet that heads up, off the plot, links it to the atom it ends on.
              if (!d.moved && d.group !== undefined && !d.band && Math.abs(dy) > Math.abs(dx)) d.link = true;
              d.moved = true;
              if (d.band) return setBand([band?.[0] ?? px, px]);
              if (d.link) { setLink({ from: d.from, to: [e.clientX, e.clientY] }); p.onLinkHover(outside(e.clientX, e.clientY) ? [e.clientX, e.clientY] : undefined); return; }
              const [a0, b0] = d.range, shift = Math.min(all[1] - b0, Math.max(all[0] - a0, ((rev ? dx : -dx) / width) * (b0 - a0)));
              return setRange([a0 + shift, b0 + shift]);
            }
            const g = groupAt(px, py);
            setPoint(g === undefined ? signalAt(px, py) : undefined, g);
          }}
          // A click (no drag) picks the peak under the pointer, or lets go of it. A measured multiplet picked is the one
          // the next atoms and bonds clicked are linked to.
          onPointerUp={(e) => {
            const d = drag.current;
            drag.current = undefined;
            if (d?.band && band) {
              const [u, v] = [at(band[0]), at(band[1])];
              setBand(undefined);
              if (Math.abs(band[1] - band[0]) > 3) p.onDefine(Math.min(u, v), Math.max(u, v));
              return;
            }
            if (d?.link) { setLink(undefined); p.onLinkHover(undefined); if (outside(e.clientX, e.clientY)) p.onLinkAt(d.group!, [e.clientX, e.clientY]); return; }
            if (d && !d.moved) {
              if (showM) p.onChooseGroup(d.group === p.chosenGroup ? undefined : d.group);
              else setChosen(signalAt(e.nativeEvent.offsetX, e.nativeEvent.offsetY));
            }
          }}
          onPointerLeave={() => setPoint(undefined, undefined)}
          onDoubleClick={() => setRange(undefined)}
        >
          <defs><clipPath id={clip}><rect x={0} y={laneM.top - 8} width={width} height={laneM.bottom - laneM.top + 8} /></clipPath></defs>
          <line className="spectrum-axis" x1={PAD} x2={width - PAD} y1={axisY} y2={axisY} />
          {tickAt.map((v) => (
            <g key={v} className="spectrum-tick">
              <line x1={x(v)} x2={x(v)} y1={axisY} y2={axisY + 4} />
              <text x={x(v)} y={axisY + (showM && h1M ? 32 : 16)} textAnchor="middle">{v.toFixed(places)}</text>
            </g>
          ))}
          <text className="spectrum-unit" x={width - 2} y={H - 2} textAnchor="end">{showM && m ? m.xUnit : "ppm"}</text>
          {show === "stacked" && <line className="spectrum-axis faint" x1={PAD} x2={width - PAD} y1={laneP.bottom} y2={laneP.bottom} />}

          {/* The predicted spectrum. */}
          <g className={faint ? "spectrum-overlay" : undefined}>
            {solventTrace && <path className="spectrum-solvent" d={pathOf(solventTrace)} />}
            {nucleus === "13C" && solvent.flatMap((s, k) => s.lines.map((l, i) => l.ppm >= lo && l.ppm <= hi && <line key={`sv${k}-${i}`} className="spectrum-solvent" x1={x(l.ppm)} x2={x(l.ppm)} y1={laneP.bottom} y2={y(l.h)} />))}
            {!faint && signals.map((s, k) => {
              if (!on(s, k)) return null;
              const xs = split[k].map((l) => x(l.ppm)), xa = Math.min(...xs), xb = Math.max(...xs);
              return <rect key={k} className="spectrum-lit" x={xa - 4} y={laneP.top - 2} width={xb - xa + 8} height={laneP.bottom - laneP.top + 2} rx={3} />;
            })}
            {nucleus === "1H" && !faint && signals.map((s, k) => {
              // A coloured peak: its own lines, filled in its colour under the whole trace.
              const c = p.colours[k];
              if (!c || !shown(s)) return null;
              const [a, b] = span(split[k]), own = columnsOf(sample(split[k], Math.max(lo, a - 40 * pxPpm), Math.min(hi, b + 40 * pxPpm), step), x, width);
              if (!own.length) return null;
              const d = `M${to([own[0][0], 0])}L${own.map(to).join("L")}L${to([own[own.length - 1][0], 0])}Z`;
              return <path key={`c${k}`} d={d} fill={c} fillOpacity={0.35} stroke={c} strokeWidth={1} />;
            })}
            {trace && <path className="spectrum-trace" d={path} />}
            {nucleus === "13C" && signals.map((s, k) => shown(s) && <line key={k} className={`spectrum-stick${on(s, k) ? " lit" : ""}`} x1={x(s.shift)} x2={x(s.shift)} y1={laneP.bottom} y2={y(s.nuclei)} style={p.colours[k] ? { stroke: p.colours[k] } : undefined} />)}
            {rowP && rowP.brackets.map((b) => <path key={`b${b.peaks.join()}`} className="spectrum-leader" d={b.d} />)}
            {rowP && labelsP.map((l, i) => {
              const at = rowP.at[i], k = inRange[i], leader = rowP.paths[i] && <path className="spectrum-leader" d={rowP.paths[i]} />;
              // The solvent's names, in grey; then each peak's label in its colour.
              if (k === undefined) return <g key={`sl${i}`} className="spectrum-solvent-label">{leader}<RowText l={l} at={at} base={rowP.base} vertical={sizeP.vertical} /></g>;
              const s = signals[k];
              return (
                <g key={k} className={`spectrum-signal${on(s, k) ? " lit" : ""}${chosen === k ? " chosen" : ""}`} style={p.colours[k] ? { fill: p.colours[k] } : undefined}
                  data-tip={nucleus === "1H" ? `${s.shift.toFixed(2)} ppm, ${multiplicity(s)}${s.couplings.length ? `, J = ${s.couplings.map((c) => c.j.toFixed(1)).join(", ")} Hz` : ""}, ${s.nuclei}H` : `${s.shift.toFixed(1)} ppm, ${s.nuclei} C`}>
                  {leader}
                  <RowText l={l} at={at} base={rowP.base} vertical={sizeP.vertical} />
                </g>
              );
            })}
          </g>

          {/* The measured spectrum: lit and picked multiplets behind it, its trace (or sticks), a mark over each peak,
              the solvent and TMS named in grey, each multiplet's label, and under the axis each ¹H multiplet's integral. */}
          {showM && m && lv && (
            <g className="spectrum-measured">
              {ownGroups.map((g) => {
                if (!groupOn(g.id)) return null;
                const xa = Math.min(x(g.lo), x(g.hi)), xb = Math.max(x(g.lo), x(g.hi));
                return <rect key={`lit${g.id}`} className={`spectrum-lit${p.chosenGroup === g.id ? " chosen" : ""}`} x={xa - 2} y={laneM.top - 2} width={xb - xa + 4} height={laneM.bottom - laneM.top + 2} rx={3} />;
              })}
              {band && <rect className="spectrum-band" x={Math.min(...band)} y={laneM.top - 2} width={Math.abs(band[1] - band[0])} height={laneM.bottom - laneM.top + 2} />}
              <g clipPath={`url(#${clip})`}>
                {ownGroups.map((g) => {
                  // A coloured multiplet: its part of the trace, filled in its colour.
                  const c = p.groupColour(g.id);
                  if (!c || !cols) return null;
                  const xa = Math.min(x(g.lo), x(g.hi)), xb = Math.max(x(g.lo), x(g.hi)), part = cols.filter(([q]) => q >= xa && q <= xb);
                  if (!part.length) return null;
                  return <path key={`f${g.id}`} d={`M${part[0][0]} ${laneM.bottom}${part.map(([q, v]) => `L${q} ${yM(v).toFixed(1)}`).join("")}L${part[part.length - 1][0]} ${laneM.bottom}Z`} fill={c} fillOpacity={0.35} stroke="none" />;
                })}
                {cols && <path className="spectrum-trace" d={cols.map(([q, v], i) => `${i ? "L" : "M"}${q.toFixed(1)} ${yM(v).toFixed(1)}`).join("")} />}
                {m.sticks && m.xs && Array.from(m.xs, (xv, i) => (xv >= lo && xv <= hi ? <line key={`st${i}`} className="spectrum-stick" x1={x(xv)} x2={x(xv)} y1={laneM.bottom} y2={yM(lv.v[i])} /> : null))}
              </g>
              {!m.sticks && a!.peaks.map((pk, i) => (pk.x >= lo && pk.x <= hi ? <line key={`pk${i}`} className="spectrum-peak" x1={x(pk.x)} x2={x(pk.x)} y1={Math.max(laneM.top - 6, yM(lv.base + pk.h) - 3)} y2={Math.max(laneM.top - 10, yM(lv.base + pk.h) - 7)} /> : null))}
              {rowM && rowM.brackets.map((b) => <path key={`b${b.peaks.join()}`} className="spectrum-leader" d={b.d} />)}
              {rowM && groups.map((g, i) => {
                const lx = rowM.at[i], l = labelsM[i], leader = rowM.paths[i] && <path className="spectrum-leader" d={rowM.paths[i]} />;
                if (g.other) return <g key={`o${g.id}`} className="spectrum-solvent-label">{leader}<RowText l={l} at={lx} base={rowM.base} vertical={sizeM.vertical} /></g>;
                const c = p.groupColour(g.id), linked = p.linkedCount(g.id) > 0, label = l.shift;
                // A linked multiplet's mark: left of its label across, over it turned.
                const mark = sizeM.vertical ? [lx, rowM.base - 6 - widthOf(oneLine(l), FONT)] : [lx - Math.max(widthOf(l.shift, FONT), widthOf(l.rest, FONT)) / 2 - 5, rowM.base - (l.rest ? 19 : 7)];
                return (
                  <g key={g.id} className={`spectrum-signal${groupOn(g.id) ? " lit" : ""}${p.chosenGroup === g.id ? " chosen" : ""}`} style={c ? { fill: c } : undefined}
                    data-tip={`${h1M && g.name === "m" && g.peaks.length > 1 ? `${g.peaks[0].x.toFixed(2)}–${g.peaks[g.peaks.length - 1].x.toFixed(2)}` : label} ${m.xUnit}${h1M ? `, ${g.name}${g.js.length ? `, J = ${g.js.map((j) => j.toFixed(1)).join(", ")} Hz` : ""}, ${g.n.toFixed(2)}H` : ""}${linked ? `, linked to ${linkedWords(g.id)}` : ""}`}>
                    {leader}
                    {linked && <circle className="spectrum-linked" cx={mark[0]} cy={mark[1]} r={2.5} style={c ? { fill: c } : undefined} />}
                    <RowText l={l} at={lx} base={rowM.base} vertical={sizeM.vertical} />
                  </g>
                );
              })}
              {h1M && ownGroups.map((g) => {
                const xa = Math.min(x(g.lo), x(g.hi)), xb = Math.max(x(g.lo), x(g.hi));
                return (
                  <g key={`int${g.id}`} className="spectrum-int">
                    <path d={`M${xa} ${axisY + 4}L${xa} ${axisY + 7}L${xb} ${axisY + 7}L${xb} ${axisY + 4}`} />
                    <text x={(xa + xb) / 2} y={axisY + 18} textAnchor="middle">{g.n.toFixed(2)}</text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
      {expanded && p.inset && (
        <svg className="spectrum-inset" viewBox={`${p.inset[0]} ${p.inset[1]} ${p.inset[2] - p.inset[0]} ${p.inset[3] - p.inset[1]}`} role="img" aria-label="The structure">
          <use href="#world" />
        </svg>
      )}
      </div>
      {link && createPortal(<svg className="spectrum-link" aria-hidden><line x1={link.from[0]} y1={link.from[1]} x2={link.to[0]} y2={link.to[1]} /><circle cx={link.to[0]} cy={link.to[1]} r={3} /></svg>, host())}
      {p.details && showP && !showM && p.prediction && (() => {
        // How each shift was found: the group, its shift and couplings (with the groups they couple to), how many
        // spheres of its surroundings matched measured shifts, how many there were and how far they spread, and so how
        // far to trust it. Pointing at a row lights its atoms and peak, as pointing at the peak does.
        const groupOf = (atom: number) => signals.find((s) => s.atoms.includes(atom))?.group ?? "";
        const order = signals.map((_, k) => k).sort((u, v) => signals[v].shift - signals[u].shift);
        return (
          <div className="spectrum-details">
            <table>
              <thead>
                <tr><th>Group</th><th>δ (ppm)</th>{nucleus === "1H" ? <><th>Multiplicity</th><th>J (Hz)</th><th>Integral</th></> : <th>Carbons</th>}<th>Based on</th><th>Quality</th></tr>
              </thead>
              <tbody>
                {order.map((k) => {
                  const s = signals[k], q = quality(s, nucleus!);
                  return (
                    <tr key={k} className={pointed === k ? "lit" : undefined} onPointerEnter={() => { setPointed(k); p.onPoint(s.atoms); }} onPointerLeave={() => { setPointed(undefined); p.onPoint(undefined); }}>
                      <td>{p.colours[k] && <span className="dot" style={{ background: p.colours[k] }} />}{s.group}</td>
                      <td className="num">{s.shift.toFixed(nucleus === "1H" ? 2 : 1)}</td>
                      {nucleus === "1H" ? (
                        <>
                          <td>{multiplicity(s)}</td>
                          <td>{s.couplings.length ? s.couplings.map((c) => `${c.j.toFixed(1)} to ${[...new Set((c.with ?? []).map(groupOf))].join(", ")}`).join("; ") : "–"}</td>
                          <td className="num">{s.nuclei}H</td>
                        </>
                      ) : <td className="num">{s.nuclei}</td>}
                      <td>{s.level} {s.level === 1 ? "sphere" : "spheres"} matched, {s.based} measured in {s.solvent ?? "any solvent"}, ±{s.sd.toFixed(nucleus === "1H" ? 2 : 1)}</td>
                      <td><span className={`quality ${q}`}>{q[0].toUpperCase() + q.slice(1)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button className="spectrum-button" onClick={() => p.onCopy(detailsTable(p.prediction!))}><CopySimple size={16} /> Copy table</button>
          </div>
        );
      })()}
      <footer className="spectrum-foot">
        <p className="spectrum-text">{text}</p>
        {showP && <span className="spectrum-credit" data-tip={NOTICE}>nmrshiftdb2</span>}
      </footer>
    </section>
  );
}
