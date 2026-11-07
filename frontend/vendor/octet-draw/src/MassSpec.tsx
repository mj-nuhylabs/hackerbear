// The Mass spec panel (ChemDraw's Mass Spec Analysis, CH-40): the fragments that the fragmentation lines across a
// structure make, in ChemDraw's three modes, each as an ion with its formula and m/z for the chosen adduct and charge
// state, its isotope pattern drawn as sticks, and the HRMS line for the chosen one. A pasted peak list (or a JCAMP-DX
// peak table) is drawn under the sticks, mirrored, and each ion is matched to its peaks. Docked as the Spectrum panel
// is; pointing at a row or a peak lights its fragment's atoms, and pointing at an atom lights its fragments (Tab goes
// from one to the next).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowsIn, ArrowsOut, ChartBar, CopySimple, Article, Tag, Table, X } from "@phosphor-icons/react";
import type { Mol } from "./render";
import { expandWithOrigins } from "./chem";
import { subset } from "./edit";
import { Select } from "./Select";
import { NumberField, Segmented } from "./Fields";
import { listOpen, Pick } from "./Menu";
import { useMovable } from "./movable";
import { holdCursor } from "./cursor";
import { useLeaving } from "./motion";
import { HIGHLIGHT_COLOURS } from "./docstyle";
import { inkOf } from "./spectrumplot";
import { panelRow, rowSize, RowText, type RowLabel } from "./Spectrum";
import { cutPoints } from "./masscut";
import {
  fragmentsOf, fragmentWith, hrmsLine, ionChoices, ionName, ionOf, MODES, mzRange, mzTicks, nearest, parsePeaks, patternMatch, ppm, SOURCES, structureOf, TOLERANCES,
  type IonOf, type MsPrefs, type Peak,
} from "./msanalysis";
import "./massspec.css";

const HEIGHT = 184, TOP = 40, BASE = 26, PAD = 14; // px: the plot, room for labels above it and the axis below, its ends
// Each fragment's colour: the Spectrum panel's peak colours, in its order.
export const FRAGMENT_COLOURS = ["Blue", "Orange", "Green", "Red", "Purple", "Teal", "Pink", "Gold", "Brown", "Slate"].map((name) => HIGHLIGHT_COLOURS.find(([n]) => n === name)![1]);
export type MsRow = { ion: IonOf; atoms: number[]; colour: string };
// Add to drawing: the spectrum (the m/z range shown, labelled at the calculated m/z), the chosen fragment's label (its
// ion, formula and calculated m/z), or the HRMS line.
export type MsAdd = { what: "spectrum"; rows: MsRow[]; range: [number, number]; label: "mono" | "top" } | { what: "label"; row: MsRow; mz: number } | { what: "hrms"; text: string };

type Props = {
  mol: Mol; atoms: number[]; ready: boolean; prefs: MsPrefs; lit?: number; // the drawing, the structure's atoms, Indigo loaded, the atom pointed at
  peaks?: Peak[]; // a measured peak list from elsewhere (an opened spectrum); a pasted one takes its place
  tab?: { atoms: number[]; n: number }; // Tab pressed n + 1 times on the canvas, on these atoms (an atom, or a bond's two)
  onPrefs: (p: MsPrefs) => void; onPoint: (atoms?: number[]) => void; onCopy: (text: string) => void; onAdd: (a: MsAdd) => void; onClose: () => void;
};

export function MassSpecPanel(p: Props) {
  const box = useRef<HTMLDivElement>(null), [width, setWidth] = useState(600), [expanded, setExpanded] = useState(false), [tall, setTall] = useState(HEIGHT);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => { setWidth(el.clientWidth); setTall(Math.max(HEIGHT, el.clientHeight)); };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !listOpen()) { e.stopPropagation(); setExpanded(false); } };
    addEventListener("keydown", key, true);
    return () => removeEventListener("keydown", key, true);
  }, [expanded]);
  const move = useMovable("massspec", expanded), leaving = useLeaving(), H = expanded ? tall : HEIGHT;
  const set = (change: Partial<MsPrefs>) => p.onPrefs({ ...p.prefs, ...change });

  // The structure, its fragmentation lines and its fragments.
  const structure = useMemo(() => {
    if (!p.ready || !p.atoms.length) return undefined;
    const ids = p.atoms.filter((i) => p.mol.atoms[i]).sort((a, b) => a - b);
    try {
      const cuts = (p.mol.arrows ?? []).filter((a) => a.kind === "cut").map(cutPoints);
      return structureOf(p.mol, ids, expandWithOrigins(subset(p.mol, new Set(ids))), cuts);
    } catch { return undefined; }
  }, [p.mol, p.atoms, p.ready]);
  const fragments = useMemo(() => (structure ? fragmentsOf({ ...structure, mode: p.prefs.mode }) : []), [structure, p.prefs.mode]);
  const molecule = fragments[0], charge = molecule?.charge ?? 0;
  // The ion: as drawn for a charged structure until another is chosen for it (as drawn is only for a charged one).
  const [ionHere, setIonHere] = useState<MsPrefs["ion"]>();
  useLayoutEffect(() => setIonHere(undefined), [p.atoms]);
  const ionKey = ionHere ?? (charge ? "M" : p.prefs.ion === "M" ? "M+H" : p.prefs.ion);
  const rows: MsRow[] = useMemo(() => fragments.flatMap((f, k) => {
    const ion = molecule && ionOf(f, molecule, ionKey, p.prefs.z);
    return ion ? [{ ion, atoms: f.atoms, colour: FRAGMENT_COLOURS[k % FRAGMENT_COLOURS.length] }] : [];
  }), [fragments, molecule, ionKey, p.prefs.z]);
  const calc = (r: MsRow) => (p.prefs.calc === "top" ? r.ion.top : r.ion.mono);

  // The measured peaks: pasted, or given.
  const [pasting, setPasting] = useState(false), [pasted, setPasted] = useState("");
  const peaks = useMemo(() => (pasted.trim() ? parsePeaks(pasted) : p.peaks ?? []), [pasted, p.peaks]);
  const found = (r: MsRow) => { const m = calc(r); return m === undefined || !peaks.length ? undefined : nearest(peaks, m, p.prefs.tolerance); };

  // The m/z axis: every ion's peaks (and the measured ones), until the wheel or a drag changes it.
  const all = useMemo(() => mzRange([...rows.flatMap((r) => (r.ion.pattern ?? []).filter((q) => q.rel >= 1).map((q) => q.mz)), ...peaks.map((q) => q.mz)]), [rows, peaks]);
  const [range, setRange] = useState<[number, number]>();
  useLayoutEffect(() => setRange(undefined), [all[0], all[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const [lo, hi] = range ?? all;
  const x = (mz: number) => PAD + ((mz - lo) / (hi - lo)) * (width - 2 * PAD), mzAt = (px: number) => lo + ((px - PAD) / (width - 2 * PAD)) * (hi - lo);
  // Mirrored when there are measured peaks: measured above the axis, predicted below.
  const mirror = peaks.length > 0, axis = mirror ? TOP + (H - TOP - BASE) / 2 : H - BASE, span = mirror ? (H - TOP - BASE) / 2 - 4 : H - TOP - BASE;
  const up = (rel: number) => axis - (rel / 100) * span, down = (rel: number) => axis + (rel / 100) * span;

  const [pointed, setPointed] = useState<number>(), [chosen, setChosen] = useState(0);
  useLayoutEffect(() => setChosen(0), [p.prefs.mode, structure]);
  const point = (k?: number) => { if (k !== pointed) { setPointed(k); p.onPoint(k === undefined ? undefined : rows[k]?.atoms); } };
  // Tab on the canvas (ChemDraw's): the fragments with the atom or bond pointed at, one after another. The one reached
  // is chosen, and lit here and on the canvas.
  const tabbed = p.tab ? fragmentWith(rows, p.tab.atoms, p.tab.n) : undefined, tabbing = useRef(false);
  useLayoutEffect(() => {
    if (!p.tab && !tabbing.current) return;
    tabbing.current = !!p.tab;
    if (tabbed !== undefined) setChosen(tabbed);
    p.onPoint(tabbed === undefined ? undefined : rows[tabbed].atoms);
  }, [p.tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Rows lit from the canvas: the fragments with the atom pointed at (the molecule only when it is the only one), or
  // the one Tab reached.
  const lit = (k: number) => pointed === k || (tabbed !== undefined ? k === tabbed : p.lit !== undefined && rows[k].atoms.includes(p.lit) && (k > 0 || rows.length === 1));
  const drag = useRef<{ from: number; range: [number, number]; moved: boolean }>(undefined);
  // The ion whose sticks are nearest the pointer, within 6 px.
  const rowAt = (px: number) => {
    let best: number | undefined, d = 6;
    rows.forEach((r, k) => { for (const q of r.ion.pattern ?? []) if (q.rel >= 1 && Math.abs(x(q.mz) - px) < d) { d = Math.abs(x(q.mz) - px); best = k; } });
    return best;
  };

  const one = rows[chosen] ?? rows[0], d = 4, fmt = (v?: number) => (v === undefined ? "–" : v.toFixed(d));
  const [typed, setTyped] = useState<number>();
  useLayoutEffect(() => setTyped(undefined), [one?.ion.label, one?.ion.formula]);
  const measured = one && found(one), foundMz = typed ?? measured?.mz, oneCalc = one && calc(one);
  const line = one && oneCalc !== undefined ? hrmsLine({ source: p.prefs.source, label: one.ion.label, formula: one.ion.formula, calcd: oneCalc, found: foundMz }) : "";
  const table = () => [["Ion", "Formula", "m/z", ...(mirror ? ["Found", "Error (ppm)"] : [])].join("\t"), ...rows.map((r) => {
    const m = calc(r), f = found(r);
    return [r.ion.label, r.ion.formula, fmt(m), ...(mirror ? [f ? f.mz.toFixed(d) : "", f && m ? ppm(f.mz, m).toFixed(1) : ""] : [])].join("\t");
  })].join("\n");
  const pattern = (r: MsRow) => (r.ion.pattern ?? []).filter((q) => q.rel >= 1).map((q) => `${q.mz.toFixed(d)} (${q.rel.toFixed(q.rel >= 10 ? 0 : 1)})`).join(", ");

  // Each ion labelled at its calculated m/z (monoisotopic or most intense, as chosen), the labels spread apart.
  const shown = rows.map((r, k) => { const m = calc(r); return m !== undefined && m >= lo && m <= hi ? k : -1; }).filter((k) => k >= 0);
  // The one label layout every spectrum uses: across, each on a leader that drops to the top of its peak.
  const places = hi - lo < 30 ? 4 : hi - lo < 300 ? 2 : 1, labels: RowLabel[] = shown.map((k) => ({ x: x(calc(rows[k])!), a: x(calc(rows[k])!), b: x(calc(rows[k])!), shift: calc(rows[k])!.toFixed(places), rest: "" }));
  const drawn: [number, number][] = mirror ? peaks.map((q) => [x(q.mz), axis - up(q.i)]) : rows.flatMap((r) => (r.ion.pattern ?? []).filter((q) => q.rel >= 1).map((q): [number, number] => [x(q.mz), axis - up(q.rel)]));
  const row = shown.length ? panelRow(labels, rowSize(labels, "horizontal", width), width, { top: TOP, bottom: axis }, inkOf(drawn)) : undefined;
  const ticks = mzTicks(lo, hi, width - 2 * PAD), tickPlaces = ticks.length > 1 && ticks[1] - ticks[0] < 1 ? 2 : 0;

  return (
    <section className={["spectrum", "massspec", expanded && "expanded", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Mass spec" style={move.style} inert={leaving}>
      <header onPointerDown={move.onPointerDown}>
        <h2>Mass spec</h2>
        <span className="spectrum-head-buttons">
          <button className="actions-close" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Leave full screen" : "Full screen"} data-tip={expanded ? "Leave full screen" : "Full screen"}>{expanded ? <ArrowsIn size={12} /> : <ArrowsOut size={12} />}</button>
          <button className="actions-close" onClick={p.onClose} aria-label="Close mass spec" data-tip="Close mass spec"><X size={12} /></button>
        </span>
      </header>
      <div className="spectrum-controls">
        <Segmented label="Fragments" value={p.prefs.mode} options={MODES.map(([m, name]) => [m, name])} onChange={(mode) => set({ mode })} />
        <Select label="Ion" value={ionKey} options={ionChoices(charge).map((x) => [x.key, ionName(x.key, p.prefs.z, charge)])} onChange={(v) => { const ion = v as MsPrefs["ion"]; setIonHere(ion); if (ion !== "M") set({ ion }); }} />
        <Segmented label="Charge" value={ionKey === "M" ? "" : String(p.prefs.z)} options={[1, 2, 3, 4].map((z) => [String(z), `${z}`, `Charge ${z}`, ionKey === "M"])} onChange={(z) => set({ z: Number(z) })} />
        <Segmented label="Calculated m/z" value={p.prefs.calc} options={[["mono", "Monoisotopic"], ["top", "Most intense"]]} onChange={(calc) => set({ calc })} />
        <button className="spectrum-button" aria-pressed={pasting} onClick={() => setPasting(!pasting)}>Peak list</button>
        <span className="spectrum-gap" />
        <Pick label="Add to drawing" value="" className="spectrum-button" title="Put the spectrum, the chosen fragment's label or the HRMS line on the page" disabled={!rows.length}
          groups={[[{ key: "spectrum", name: "Spectrum", icon: <ChartBar size={18} /> }, { key: "label", name: "Fragment label", icon: <Tag size={18} /> }, { key: "hrms", name: "HRMS line", icon: <Article size={18} /> }]]}
          onPick={(what) => (what === "spectrum" ? p.onAdd({ what, rows, range: [lo, hi], label: p.prefs.calc }) : what === "label" ? one && oneCalc !== undefined && p.onAdd({ what, row: one, mz: oneCalc }) : p.onAdd({ what: "hrms", text: line }))}>
          Add to drawing
        </Pick>
        <Pick label="Copy" value="" className="spectrum-button" title="Copy the HRMS line, the table or the isotope pattern" disabled={!rows.length}
          groups={[[{ key: "hrms", name: "HRMS line", icon: <Article size={18} /> }, { key: "table", name: "Table", icon: <Table size={18} /> }, { key: "pattern", name: "Isotope pattern", icon: <ChartBar size={18} /> }]]}
          onPick={(what) => p.onCopy(what === "hrms" ? line : what === "table" ? table() : one ? pattern(one) : "")}>
          <CopySimple size={16} /> Copy
        </Pick>
      </div>
      {pasting && (
        <div className="massspec-peaks-row">
          <textarea className="massspec-peaks" value={pasted} rows={3} maxLength={2_000_000} spellCheck={false} aria-label="Peak list"
            placeholder="m/z  intensity" onChange={(e) => setPasted(e.target.value)} />
          <Select label="Tolerance" value={p.prefs.tolerance} options={TOLERANCES} onChange={(tolerance) => set({ tolerance })} />
        </div>
      )}
      <div className="spectrum-body">
        <div ref={box} className="spectrum-plot">
          <svg width={width} height={H} role="img" aria-label={rows.length ? `Mass spectrum of ${rows.length} ions` : "No ions"}
            onWheel={(e) => {
              const at = mzAt(e.nativeEvent.offsetX), k = Math.exp(e.deltaY * 0.002), span0 = Math.min(all[1] - all[0], Math.max(0.05, (hi - lo) * k)), f = (at - lo) / (hi - lo);
              const l = Math.max(all[0], Math.min(all[1] - span0, at - f * span0));
              setRange([l, l + span0]);
            }}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); holdCursor(e.currentTarget); drag.current = { from: e.clientX, range: [lo, hi], moved: false }; }}
            onPointerMove={(e) => {
              if (drag.current && e.buttons && Math.abs(e.clientX - drag.current.from) > 3) {
                drag.current.moved = true;
                const [a, b] = drag.current.range, dm = -((e.clientX - drag.current.from) / width) * (b - a), shift = Math.min(all[1] - b, Math.max(all[0] - a, dm));
                return setRange([a + shift, b + shift]);
              }
              point(rowAt(e.nativeEvent.offsetX));
            }}
            onPointerUp={() => { if (drag.current && !drag.current.moved && pointed !== undefined) setChosen(pointed); drag.current = undefined; }}
            onPointerLeave={() => point(undefined)}
            onDoubleClick={() => setRange(undefined)}>
            <line className="spectrum-axis" x1={PAD} x2={width - PAD} y1={axis} y2={axis} />
            {ticks.map((v) => (
              <g key={v} className="spectrum-tick">
                <line x1={x(v)} x2={x(v)} y1={H - BASE} y2={H - BASE + 4} />
                <text x={x(v)} y={H - BASE + 16} textAnchor="middle">{v.toFixed(tickPlaces)}</text>
              </g>
            ))}
            {mirror && <line className="spectrum-axis" x1={PAD} x2={width - PAD} y1={H - BASE} y2={H - BASE} />}
            <text className="spectrum-unit" x={width - 2} y={H - 2} textAnchor="end">m/z</text>
            {peaks.map((q, i) => q.mz >= lo && q.mz <= hi && <line key={`m${i}`} className="massspec-measured" x1={x(q.mz)} x2={x(q.mz)} y1={axis} y2={up(q.i)} />)}
            {rows.map((r, k) => (
              <g key={k} className={`massspec-ion${lit(k) ? " lit" : ""}${chosen === k ? " chosen" : ""}`} style={{ stroke: r.colour, fill: r.colour }}>
                {lit(k) && r.ion.pattern?.length ? <rect className="spectrum-lit" x={x(r.ion.pattern[0].mz) - 4} y={TOP - 4} width={x(r.ion.pattern[r.ion.pattern.length - 1].mz) - x(r.ion.pattern[0].mz) + 8} height={H - BASE - TOP + 4} rx={3} /> : null}
                {(r.ion.pattern ?? []).map((q, i) => q.rel >= 1 && q.mz >= lo && q.mz <= hi && <line key={i} className="massspec-stick" x1={x(q.mz)} x2={x(q.mz)} y1={axis} y2={mirror ? down(q.rel) : up(q.rel)} />)}
              </g>
            ))}
            {row && row.brackets.map((b) => <path key={`b${b.peaks.join()}`} className="spectrum-leader" d={b.d} />)}
            {row && shown.map((k, i) => {
              const r = rows[k];
              return (
                <g key={`l${k}`} className={`massspec-label${lit(k) ? " lit" : ""}${chosen === k ? " chosen" : ""}`} style={{ fill: r.colour }} data-tip={`${r.ion.label} ${r.ion.formula}`}>
                  {row.paths[i] && <path className="spectrum-leader" d={row.paths[i]} />}
                  <RowText l={labels[i]} at={row.at[i]} base={row.base} vertical={false} />
                </g>
              );
            })}
          </svg>
        </div>
        <div className="spectrum-details massspec-table">
          <table>
            <thead>
              <tr><th>Ion</th><th>Formula</th><th className="num">m/z</th>{mirror && <><th className="num">Found</th><th className="num">ppm</th><th className="num">Fit</th></>}</tr>
            </thead>
            <tbody>
              {rows.map((r, k) => {
                const m = calc(r), f = found(r), fit = mirror && r.ion.pattern ? patternMatch(peaks, r.ion.pattern, p.prefs.tolerance) : undefined;
                return (
                  <tr key={k} className={[lit(k) && "lit", chosen === k && "chosen"].filter(Boolean).join(" ") || undefined}
                    onPointerEnter={() => point(k)} onPointerLeave={() => point(undefined)} onClick={() => setChosen(k)}>
                    <td><span className="dot" style={{ background: r.colour }} />{r.ion.label}</td>
                    <td className="formula">{r.ion.formula}</td>
                    <td className="num">{fmt(m)}</td>
                    {mirror && <><td className="num">{f ? f.mz.toFixed(d) : "–"}</td><td className="num">{f && m ? ppm(f.mz, m).toFixed(1) : "–"}</td><td className="num">{fit === undefined ? "–" : `${Math.round(fit)}%`}</td></>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <footer className="spectrum-foot massspec-foot">
        <p className="spectrum-text">{line}</p>
        <span className="spectrum-gap" />
        <Select label="Source" value={p.prefs.source} options={SOURCES.map((s) => [s, s])} onChange={(source) => set({ source })} />
        <label className="massspec-found">Found
          <NumberField label="Found m/z" value={foundMz} min={0.0001} max={100000} step={0.0001} placeholder="m/z" onChange={setTyped} onClear={() => setTyped(undefined)} />
        </label>
        <span className="massspec-ppm" aria-live="polite">{foundMz !== undefined && oneCalc ? `${ppm(foundMz, oneCalc) >= 0 ? "+" : "−"}${Math.abs(ppm(foundMz, oneCalc)).toFixed(1)} ppm` : ""}</span>
      </footer>
      {one && <p className="massspec-pattern">{pattern(one)}</p>}
    </section>
  );
}
