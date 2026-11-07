// A page spectrum's record (Add to drawing > Spectrum). The spectrum stays a group of ordinary lines, curves and
// captions, so each part selects, colours, moves, saves and prints as any other. The group also keeps what was
// plotted (plot) and each part keeps its role and the place Octet gave it (role). A resize or a scale then builds the
// parts again at the new frame from the record, and every part whose role is still there keeps what the user changed:
// colour, font, style, text, turn, and how far it was moved. A part the user deleted stays deleted. Nothing is laid
// out again on open or on render: the file holds every part where it was drawn. Octet 1.1.0 drops the record and the
// roles, and reads the same group.
import type { Arrow, Caption, CurvePoint, Group, Mol } from "./render.ts";
import { addArrow, addCaption, groupSelection } from "./edit.ts";
import { addTitle, GREY, spectrumFigure, traceColumns, type Figure, type LabelTurn } from "./spectrumplot.ts";
import { keyOf, levels, measuredFigure, nameOf, xAt, type Analysed, type Analysis, type Measured } from "./measured.ts";
import type { Kind } from "./jcamp.ts";
import type { Nucleus, Signal } from "./nmr.ts";

type P = [number, number];
// A part's role ("axis", "tick:7", "tick:7/n", "trace", "fill:k", "peak:k/0", "leader:peak:k", "title", "notice"; a
// second part with the same role gets "~1" and so on) and its place as Octet gave it (a caption's anchor, a line's
// start).
export type PlotPart = { role: string; at: P };
// A predicted signal as drawn: its key (from its atoms' class), shift, nuclei, couplings, broad, and colour.
export type PlotSignal = { key: string; shift: number; nuclei: number; couplings: { j: number; n: number }[]; broad?: true; colour?: string };
// A measured multiplet as drawn: its id, range, shift, name and nuclei, the solvent's or TMS's name, and its colour.
export type PlotPeak = { id: number; lo: number; hi: number; shift: number; name: string; n: number; other?: string; colour?: string };
// A measured trace: its points in range (at most MAX_TRACE), what they are, its baseline, and its multiplets.
export type PlotTrace = { kind: Kind; nucleus?: string; xUnit: string; yUnit: string; sticks?: true; base: number; x: number[]; y: number[]; peaks: PlotPeak[] };
// The record. frame: the plot's width and the tallest peak's height (bond lengths); origin: where the axis starts as
// Octet placed it (the parts' offsets carry any move since); scale: the structure's scale it was drawn at; text: how
// much its text and lines were scaled; labels: the Labels choice; roles: every role Octet placed last.
export type Plot = {
  kind: "predicted" | "measured"; nucleus: string; mhz: number; solvent: string; solventPeaks: boolean; range: P; frame: P; origin: P;
  scale: number; text: number; labels: LabelTurn; title: string; notice: boolean; signals?: PlotSignal[]; trace?: PlotTrace; roles: string[];
};
// What a build needs from the document: its caption size (pt), its bond length (pt), and a text's width in em.
export type PlotEnv = { captionSize: number; bond: number; measure?: (t: string) => number };
export const MAX_TRACE = 8192, MAX_LINES = 20000;
// The smallest frame a resize gives (bond lengths).
const MIN_W = 3, MIN_H = 0.5;

// A page spectrum's name as one object: "¹H NMR spectrum", "¹³C NMR spectrum", "IR spectrum", "Mass spectrum".
export function plotName(p: Plot): string {
  const key = p.trace ? keyOf({ kind: p.trace.kind, nucleus: p.trace.nucleus ?? (p.nucleus || undefined) }) : p.nucleus;
  return key === "ms" ? "Mass spectrum" : key === "other" ? "Spectrum" : `${nameOf(key)} spectrum`;
}
// Each signal's key: its class, with "#2" and so on for a second signal of the same class.
export function signalKeys(signals: Pick<Signal, "code" | "shift">[]): string[] {
  const seen = new Map<string, number>();
  return signals.map((s) => { const k = s.code ?? s.shift.toFixed(2), n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return n > 1 ? `${k}#${n}` : k; });
}
// A measured spectrum's points in range as a record keeps them: every point, or each of MAX_TRACE / 2 - 1 columns'
// lowest and highest, so no peak is lost.
export function traceOf(m: Measured, a: Analysis, range: P, colour: (id: number) => string | undefined): PlotTrace {
  const [lo, hi] = range, pad = (hi - lo) * 0.01, x: number[] = [], y: number[] = [];
  for (let i = 0; i < m.y.length; i++) { const v = xAt(m, i); if (v >= lo - pad && v <= hi + pad) { x.push(v); y.push(m.y[i]); } }
  if (x.length > MAX_TRACE) {
    const cols = MAX_TRACE / 2 - 1, cs = traceColumns({ first: m.first, last: m.last, y: m.y, xs: m.xs }, (v) => ((v - lo + pad) / (hi - lo + 2 * pad)) * cols, cols).filter(([c]) => c >= 0 && c <= cols);
    x.length = y.length = 0;
    for (const [c, v] of cs) { x.push(lo - pad + (c / cols) * (hi - lo + 2 * pad)); y.push(v); }
  }
  // Eight figures across and six up are more than the page or the file's 16-bit levels can show.
  for (let i = 0; i < x.length; i++) { x[i] = +x[i].toPrecision(8); y[i] = +y[i].toPrecision(6); }
  const peaks = a.groups.map((g): PlotPeak => ({ id: g.id, lo: g.lo, hi: g.hi, shift: g.shift, name: g.name, n: g.n, ...(g.other ? { other: g.other } : {}), ...(colour(g.id) ? { colour: colour(g.id) } : {}) }));
  return { kind: m.kind, ...(m.nucleus ? { nucleus: m.nucleus } : {}), xUnit: m.xUnit, yUnit: m.yUnit, ...(m.sticks ? { sticks: true as const } : {}), base: levels(m).base, x, y, peaks };
}
// The figure a record gives at its frame, with its title and notice.
export function plotFigure(p: Plot, env: PlotEnv): Figure {
  const [W, H] = p.frame, em = (env.captionSize * p.text) / env.bond, sizes = { width: W, height: H, em, pt: p.scale / env.bond, labels: p.labels, measure: env.measure };
  let fig: Figure;
  if (p.trace) {
    const t = p.trace, colours = new Map(t.peaks.map((g) => [g.id, g.colour]));
    const m = { title: "", kind: t.kind, nucleus: t.nucleus, xUnit: t.xUnit, yUnit: t.yUnit, first: t.x[0] ?? 0, last: t.x[t.x.length - 1] ?? 0, y: Float32Array.from(t.y), xs: Float64Array.from(t.x), lo: p.range[0], hi: p.range[1], threshold: 0, groups: [], ...(t.sticks ? { sticks: true as const } : {}) } as Measured;
    fig = measuredFigure({ m, a: { groups: t.peaks as Analysed[], peaks: [], per: 0, base: t.base, noise: 0 }, range: p.range, colour: (id) => colours.get(id), base: t.base, ...sizes });
  } else {
    const s = p.signals ?? [];
    fig = spectrumFigure({ prediction: { nucleus: p.nucleus as Nucleus, signals: s.map((x) => ({ atoms: [], sd: 0, based: 0, ...x })) }, nucleus: p.nucleus as Nucleus, mhz: p.mhz, solvent: p.solvent, solventPeaks: p.solventPeaks, range: p.range, colours: s.map((x) => x.colour), keys: s.map((x) => x.key), ...sizes });
  }
  addTitle(fig, { title: p.title, notice: p.notice, width: W, height: H, em });
  return fig;
}
// The figure's top above its axis (for placing it under a structure).
export const plotTop = (fig: Figure, p: Plot, env: PlotEnv) => (fig.top ?? p.frame[1]) + 0.6 * ((env.captionSize * p.text) / env.bond);

type Made = { role: string; caption?: Omit<Caption, "id">; arrow?: Omit<Arrow, "id"> };
// The figure's parts at origin, each with its role. Text scaled by the record's text gets that size, and lines that
// scale.
function madeOf(fig: Figure, at: P, text: number, captionSize: number): Made[] {
  const to = (q: P): P => [at[0] + q[0], at[1] + q[1]], seen = new Map<string, number>(), out: Made[] = [];
  const named = (r = "part") => { const n = seen.get(r) ?? 0; seen.set(r, n + 1); return n ? `${r}~${n}` : r; };
  const paint = (x: { colour?: string; grey?: true }) => (x.colour || x.grey ? { colour: x.colour ?? GREY } : {});
  const scaled = text !== 1 ? { scale: text } : {}, size = text !== 1 ? { size: Math.round(captionSize * text * 10) / 10 } : {};
  for (const l of fig.lines) { const role = named(l.role), from = to(l.from); out.push({ role, arrow: { kind: "line", from, to: to(l.to), ...paint(l), ...scaled, role: { role, at: from } } }); }
  for (const c of fig.curves) {
    const role = named(c.role), pts: CurvePoint[] = c.points.map((q) => ({ at: to(q.at), ...(q.c1 ? { c1: to(q.c1) } : {}), ...(q.c2 ? { c2: to(q.c2) } : {}) }));
    out.push({ role, arrow: { kind: "curve", from: pts[0].at, to: pts[pts.length - 1].at, curve: { points: pts, ...(c.fill ? { closed: true } : {}) }, ...(c.fill ? { fill: "solid" as const, colour: c.fill } : paint(c)), ...scaled, role: { role, at: pts[0].at } } });
  }
  for (const t of fig.texts) {
    const role = named(t.role), q = to(t.at);
    out.push({ role, caption: { text: t.text, x: q[0], y: q[1], align: t.align, ...paint(t), ...(t.angle ? { angle: t.angle } : {}), ...(t.width ? { width: t.width } : {}), ...size, role: { role, at: q } } });
  }
  return out;
}
// A record's figure on the page in one plain group with the record. The new drawing, and its parts' ids.
export function placePlot(m: Mol, p: Plot, env: PlotEnv, fig = plotFigure(p, env)): [Mol, number[]] {
  const made = madeOf(fig, p.origin, p.text, env.captionSize), items: number[] = [];
  for (const x of made) { const [next, id] = x.caption ? addCaption(m, x.caption) : addArrow(m, x.arrow!); m = next; items.push(id); }
  const grouped = groupSelection(m, new Set(), new Set(items));
  if (!grouped) return [m, items];
  const plot = { ...p, roles: made.map((x) => x.role) };
  return [{ ...grouped[0], groups: grouped[0].groups?.map((g) => (g.id === grouped[1] ? { ...g, plot } : g)) }, items];
}

// How far most of a page spectrum's parts are from where Octet put them: the group's move. Undefined when fewer than
// half agree (the group was turned or flipped, or has no parts with roles), so the record is not used.
export function plotShift(m: Mol, g: Group): P | undefined {
  if (!g.plot) return undefined;
  const ids = new Set(g.items), offs: P[] = [];
  for (const c of m.captions ?? []) if (ids.has(c.id) && c.role) offs.push([c.x - c.role.at[0], c.y - c.role.at[1]]);
  for (const a of m.arrows ?? []) if (ids.has(a.id) && a.role) offs.push([a.from[0] - a.role.at[0], a.from[1] - a.role.at[1]]);
  let best: P | undefined, most = 0;
  const near = (q: P, o: P) => Math.abs(q[0] - o[0]) < 2e-3 && Math.abs(q[1] - o[1]) < 2e-3;
  for (const o of offs.slice(0, 200)) {
    const n = offs.reduce((k, q) => k + (near(q, o) ? 1 : 0), 0);
    if (n > most) { most = n; best = o; }
  }
  if (!best || 2 * most < offs.length) return undefined;
  // After a flip, the parts that still agree all sit on one line (the axis and its ticks), so they must spread both
  // across and up.
  const ats = [...(m.captions ?? []), ...(m.arrows ?? [])].flatMap((x) => (ids.has(x.id) && x.role && near("from" in x ? [x.from[0] - x.role.at[0], x.from[1] - x.role.at[1]] : [x.x - x.role.at[0], x.y - x.role.at[1]], best!) ? [x.role.at] : []));
  const spread = (k: 0 | 1) => Math.max(...ats.map((q) => q[k])) - Math.min(...ats.map((q) => q[k])) > 1e-3;
  return spread(0) && spread(1) ? best : undefined;
}
// The page spectra (with records still in use) whose parts are all among these objects.
export const plotsIn = (m: Mol, items: Set<number>) => (m.groups ?? []).filter((g) => g.plot && g.items.every((id) => items.has(id)) && plotShift(m, g));
// The one page spectrum that is all of what is chosen, if it is.
export function lonePlot(m: Mol, atoms: Set<number>, items: Set<number>): Group | undefined {
  const gs = atoms.size ? [] : plotsIn(m, items);
  return gs.length === 1 && [...items].every((id) => gs[0].items.includes(id)) ? gs[0] : undefined;
}

// A peak label across is a caption a line: "2.42" over "(q, 2H)", roles "peak:k/1" and "peak:k/0". Both lines of the
// label this caption is a line of, in its own spectrum, so they pick, move and colour as one label. Any other caption:
// itself.
const labelKey = (r: string) => { const k = /^((?:peak|solvent):[^/~]*)\/\d+(~\d+)?$/.exec(r); return k ? k[1] + (k[2] ?? "") : undefined; };
export function labelLines(m: Mol, id: number): number[] {
  const c = m.captions?.find((x) => x.id === id), k = c?.role && labelKey(c.role.role);
  const g = k ? (m.groups ?? []).filter((x) => x.items.includes(id)).sort((a, b) => a.items.length - b.items.length)[0] : undefined;
  if (!g) return [id];
  const ids = new Set(g.items);
  return m.captions!.filter((x) => ids.has(x.id) && x.role && labelKey(x.role.role) === k).map((x) => x.id);
}

// --- Leaders ------------------------------------------------------------------------------------------------------
// A label's leader is one line, or three (stub, slant, drop): roles "leader:R", "leader:R~1", "leader:R~2", where R is
// the label's role ("R/0" is its bottom line across, "R" the label turned). n: how many parts Octet placed, from the
// record; a figure with no record (a mass spectrum) counts the parts it has.
type Leader = { label?: Caption; parts: (Arrow | undefined)[]; n: number };
// Within what a file's rounding leaves (as plotShift), so a drawing read from CDXML alone still joins.
const close = (a: P, b: P) => Math.abs(a[0] - b[0]) < 2e-3 && Math.abs(a[1] - b[1]) < 2e-3;
const plus = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const offsetOf = (x: Caption | Arrow): P => ("from" in x ? [x.from[0] - x.role!.at[0], x.from[1] - x.role!.at[1]] : [x.x - x.role!.at[0], x.y - x.role!.at[1]]);
function leadersOf(m: Mol, g: Group): Map<string, Leader> {
  const out = new Map<string, Leader>(), ids = new Set(g.items), at = (r: string) => { const k = /~(\d+)$/.exec(r); return k ? [r.slice(0, k.index), +k[1]] as const : [r, 0] as const; };
  const get = (r: string) => out.get(r) ?? out.set(r, { parts: [], n: 0 }).get(r)!;
  for (const r of g.plot?.roles ?? []) if (r.startsWith("leader:")) get(at(r.slice(7))[0]).n++;
  if (g.plot && !out.size) return out;
  for (const a of m.arrows ?? []) {
    if (!ids.has(a.id) || !a.role?.role.startsWith("leader:")) continue;
    const [r, k] = at(a.role.role.slice(7));
    if (g.plot && !out.has(r)) continue;
    const l = get(r);
    l.parts[k] = a;
    if (!g.plot) l.n = Math.max(l.n, k + 1);
  }
  const caps = new Map((m.captions ?? []).filter((c) => ids.has(c.id) && c.role).map((c) => [c.role!.role, c]));
  for (const [r, l] of out) l.label = caps.get(`${r}/0`) ?? caps.get(r);
  return out;
}
// Whether a leader still joins its label as Octet keeps it: every part there, its first part moved as far as its
// label, and each part starting where the one before ends. A leader the user moved, cut or bent does not.
function joined(l: Leader): boolean {
  if (!l.label || !l.n || l.parts.length !== l.n || [...l.parts].some((a) => !a)) return false;
  return close(offsetOf(l.parts[0]!), offsetOf(l.label)) && l.parts.every((a, k) => !k || close(l.parts[k - 1]!.to, a!.from));
}
// A label moved (a nudge, a drag): its leader follows, so it still joins label and peak. Its first part moves with the
// label (one line: only its label end), and the slant runs from there to the drop, which stays on its peak. A leader
// that no longer joins its label, or that this edit moved itself, stays as it is, and so does a spectrum this edit
// built again (replot joins its leaders). was: the drawing before the edit.
export function followLeaders(was: Mol, now: Mol): Mol {
  if (was === now || was.captions === now.captions || !now.groups?.length) return now;
  const before = new Map((was.captions ?? []).map((c) => [c.id, c]));
  const moved = new Set((now.captions ?? []).filter((c) => { const o = c.role && before.get(c.id); return o && !close([o.x, o.y], [c.x, c.y]); }).map((c) => c.id));
  if (!moved.size) return now;
  const change = new Map<number, Arrow>();
  for (const g of now.groups) {
    const og = g.items.some((id) => moved.has(id)) ? was.groups?.find((x) => x.id === g.id) : undefined;
    if (!og || og.plot !== g.plot) continue;
    const old = leadersOf(was, og);
    for (const [r, l] of leadersOf(now, g)) {
      const o = old.get(r), c0 = o?.label, c1 = l.label;
      if (!o || !c0 || !c1 || c0.id !== c1.id || !moved.has(c1.id) || !joined(o)) continue;
      if (l.parts.length !== o.parts.length || o.parts.some((a, k) => !l.parts[k] || !close(a!.from, l.parts[k]!.from) || !close(a!.to, l.parts[k]!.to))) continue;
      const d: P = [c1.x - c0.x, c1.y - c0.y], [s, slant] = l.parts as Arrow[];
      if (l.parts.length === 1) { change.set(s.id, { ...s, from: plus(s.from, d) }); continue; }
      const stub = { ...s, from: plus(s.from, d), to: plus(s.to, d) };
      change.set(s.id, stub);
      change.set(slant.id, { ...slant, from: stub.to });
    }
  }
  return change.size ? { ...now, arrows: now.arrows!.map((a) => change.get(a.id) ?? a) } : now;
}
// After a rebuild: each leader that joined its label before joins it again. Its first part goes as far from where Octet
// put it as its label did, its last part (the drop) as far as the whole spectrum moved, and the slant runs between.
function rejoin(old: Map<string, Leader>, captions: Caption[], arrows: Arrow[], shift: P): Arrow[] {
  const caps = new Map(captions.filter((c) => c.role).map((c) => [c.role!.role, c])), lines = new Map(arrows.filter((a) => a.role).map((a) => [a.role!.role, a])), change = new Map<number, Arrow>();
  for (const [r, o] of old) {
    if (!joined(o)) continue;
    const label = caps.get(`${r}/0`) ?? caps.get(r), parts: Arrow[] = [];
    for (let k = 0; k < 8; k++) { const a = lines.get(k ? `leader:${r}~${k}` : `leader:${r}`); if (!a) break; parts.push(a); }
    if (!label || !parts.length) continue;
    // Each part where Octet put it now: it was moved whole, so its end is as far from Octet's as its start.
    const at = parts.map((a): [P, P] => { const d = offsetOf(a); return [a.role!.at, [a.to[0] - d[0], a.to[1] - d[1]]]; }), dl = offsetOf(label), n = parts.length;
    const made: [P, P][] = n === 1 ? [[plus(at[0][0], dl), plus(at[0][1], shift)]] : at.map(([f, t], k) => (k === 0 ? [plus(f, dl), plus(t, dl)] : [plus(f, shift), plus(t, shift)]));
    for (let k = 1; k < n - 1; k++) made[k] = [made[k - 1][1], made[k + 1][0]];
    parts.forEach((a, k) => change.set(a.id, { ...a, from: made[k][0], to: made[k][1] }));
  }
  return change.size ? arrows.map((a) => change.get(a.id) ?? a) : arrows;
}

// The props of a part the user can change, which a rebuild keeps.
const CAPTION_KEEP = ["colour", "font", "bold", "italic", "underline", "text", "runs", "angle", "align", "lineHeight", "chemical", "order"] as const;
const TWIN_KEEP = ["colour", "font", "bold", "italic", "underline", "order"] as const;
const ARROW_KEEP = ["colour", "style", "width", "start", "end", "head", "headSize", "fill", "order"] as const;
function keep<T extends object>(made: T, old: object, keys: readonly string[]): T {
  const out = { ...made } as Record<string, unknown>, o = old as Record<string, unknown>;
  for (const k of keys) { if (o[k] === undefined) delete out[k]; else out[k] = o[k]; }
  return out as T;
}
// A page spectrum built again with its record changed (a new frame, origin or text scale). Each part whose role is
// still there keeps its id, what the user changed and its offset from where Octet put it; a new part takes the
// group's move. Text keeps its size, times the change in the record's text scale.
export function replot(m: Mol, gid: number, change: Partial<Pick<Plot, "frame" | "origin" | "text">>, env: PlotEnv): Mol {
  const g = m.groups?.find((x) => x.id === gid), was = g?.plot, shift = g && plotShift(m, g);
  if (!g || !was || !shift) return m;
  const ids = new Set(g.items), now = new Map<string, Caption | Arrow>();
  for (const x of [...(m.captions ?? []), ...(m.arrows ?? [])]) if (ids.has(x.id) && x.role) now.set(x.role.role, x);
  const p: Plot = { ...was, ...change }, ratio = p.text / was.text, made = madeOf(plotFigure(p, env), p.origin, p.text, env.captionSize);
  // Deleted: a role Octet placed that is gone, and a role whose every part is gone (a whole leader).
  const base = (r: string) => r.split(/[/~]/)[0], gone = new Set(was.roles.filter((r) => !now.has(r)));
  const goneBase = new Set(was.roles.map(base).filter((b) => was.roles.every((r) => base(r) !== b || gone.has(r))));
  let next = Math.max(0, ...[...(m.captions ?? []), ...(m.arrows ?? []), ...(m.shapes ?? []), ...(m.cycles ?? []), ...(m.groups ?? [])].map((x) => x.id)) + 1;
  // A label that turns (Auto) or turns back takes the colour, font, size and move of the label it was: a turned label's
  // role is "peak:k" and its two lines across are "peak:k/0" and "peak:k/1".
  const roles = new Set(made.map((x) => x.role));
  const twin = (r: string) => {
    if (!/^(peak|solvent):[^/~]*(\/\d)?$/.test(r)) return undefined;
    const root = r.split("/")[0], c = (r === root ? [`${root}/0`, `${root}/1`] : [root]).find((k) => !roles.has(k) && now.get(k) && !("from" in now.get(k)!));
    return c === undefined ? undefined : (now.get(c) as Caption);
  };
  const captions: Caption[] = [], arrows: Arrow[] = [];
  for (const x of made) {
    if (gone.has(x.role) || goneBase.has(base(x.role))) continue;
    const old = now.get(x.role), prior = old ?? (x.caption ? twin(x.role) : undefined);
    const d: P = prior ? ("from" in prior ? [prior.from[0] - prior.role!.at[0], prior.from[1] - prior.role!.at[1]] : [prior.x - prior.role!.at[0], prior.y - prior.role!.at[1]]) : shift;
    const id = old?.id ?? next++, by = (q: P): P => [q[0] + d[0], q[1] + d[1]];
    if (x.caption) {
      const o = prior && !("from" in prior) ? prior : undefined, c: Caption = { ...x.caption, id, x: x.caption.x + d[0], y: x.caption.y + d[1] };
      captions.push(o ? { ...keep(c, o, old ? CAPTION_KEEP : TWIN_KEEP), ...(o.size !== undefined ? { size: Math.round(o.size * ratio * 10) / 10 } : {}) } : c);
    } else {
      const a0 = x.arrow!, o = old && "from" in old ? old : undefined;
      const a: Arrow = { ...a0, id, from: by(a0.from), to: by(a0.to), ...(a0.curve ? { curve: { ...a0.curve, points: a0.curve.points.map((q) => ({ at: by(q.at), ...(q.c1 ? { c1: by(q.c1) } : {}), ...(q.c2 ? { c2: by(q.c2) } : {}) })) } } : {}) };
      arrows.push(o ? { ...keep(a, o, ARROW_KEEP), ...(o.scale !== undefined ? { scale: o.scale * ratio } : {}) } : a);
    }
  }
  // The new parts go where the old ones were in the drawing order.
  const swap = <T extends { id: number; role?: PlotPart }>(list: T[] | undefined, fresh: T[]): T[] => {
    const all = list ?? [], first = all.findIndex((x) => ids.has(x.id) && x.role), rest = all.filter((x) => !(ids.has(x.id) && x.role));
    const at = first < 0 ? rest.length : all.slice(0, first).filter((x) => !(ids.has(x.id) && x.role)).length;
    return [...rest.slice(0, at), ...fresh, ...rest.slice(at)];
  };
  const removed = new Set([...now.values()].map((x) => x.id)), newIds = [...captions.map((c) => c.id), ...arrows.map((a) => a.id)];
  const plot: Plot = { ...p, roles: made.map((x) => x.role) }, rejoined = rejoin(leadersOf(m, g), captions, arrows, shift);
  // The spectrum's group, and any group it is in (which lists everything in it too), lose the parts gone and gain the
  // new ones.
  const holds = (x: Group) => x.id === gid || g.items.every((id) => x.items.includes(id));
  return { ...m, captions: swap(m.captions, captions), arrows: swap(m.arrows, rejoined),
    groups: m.groups!.map((x) => (holds(x) ? { ...x, items: [...x.items.filter((id) => !removed.has(id)), ...newIds], ...(x.id === gid ? { plot } : {}) } : x)) };
}
// A page spectrum whose frame on the page (box, bond lengths: left, bottom, right, top) is dragged from `from` to
// `to` by a resize handle: the plot grows by what the frame grows, and the side not dragged stays where it is.
export function reframe(m: Mol, gid: number, from: [number, number, number, number], to: [number, number, number, number], env: PlotEnv): Mol {
  const p = m.groups?.find((x) => x.id === gid)?.plot;
  if (!p) return m;
  const W = Math.max(MIN_W, p.frame[0] + (to[2] - to[0]) - (from[2] - from[0])), H = Math.max(MIN_H, p.frame[1] + (to[3] - to[1]) - (from[3] - from[1]));
  const moved = (a: number, b: number) => Math.abs(a - b) > 1e-9, share = (lo: boolean, hi: boolean) => (lo ? (hi ? 0.5 : 1) : 0);
  const sx = share(moved(to[0], from[0]), moved(to[2], from[2])), sy = share(moved(to[1], from[1]), moved(to[3], from[3]));
  return replot(m, gid, { frame: [W, H], origin: [p.origin[0] - sx * (W - p.frame[0]), p.origin[1] - sy * (H - p.frame[1])] }, env);
}
// A page spectrum scaled by size (across, up) as f moves points (Scale…, and the handles on a wider selection): its
// frame grows by size, its axis start goes where f puts it, and its text and lines grow by `text`.
export function rescale(m: Mol, gid: number, f: (q: P) => P, size: P, text: number, env: PlotEnv): Mol {
  const g = m.groups?.find((x) => x.id === gid), p = g?.plot, shift = g && plotShift(m, g);
  if (!p || !shift) return m;
  const q = f([p.origin[0] + shift[0], p.origin[1] + shift[1]]);
  return replot(m, gid, { frame: [Math.max(MIN_W, p.frame[0] * Math.abs(size[0])), Math.max(MIN_H, p.frame[1] * Math.abs(size[1]))], origin: [q[0] - shift[0], q[1] - shift[1]], text: p.text * text }, env);
}

// --- Reading ------------------------------------------------------------------------------------------------------
// A record or a role from a file, if it is sound: anything else is left out, and the group or part stays plain.
const num = (v: unknown, lo = -1e6, hi = 1e6) => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v: unknown, most = 200) => typeof v === "string" && v.length <= most && !/[\u0000-\u001f]/.test(v);
const pair = (v: unknown, lo?: number, hi?: number): v is P => Array.isArray(v) && v.length === 2 && v.every((x) => num(x, lo, hi));
const colour = (v: unknown) => v === undefined || (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v));
const KINDS: Kind[] = ["nmr", "ir", "uv", "ms", "other"];
export function readPart(v: unknown): PlotPart | undefined {
  const o = v as Record<string, unknown> | undefined;
  return o && str(o.role, 120) && (o.role as string).length > 0 && pair(o.at) ? { role: o.role as string, at: [o.at[0], o.at[1]] } : undefined;
}
export function readPlot(v: unknown): Plot | undefined {
  const o = v as Record<string, unknown> | undefined;
  if (!o || (o.kind !== "predicted" && o.kind !== "measured") || !str(o.nucleus, 20) || !num(o.mhz, 0, 1e4) || !str(o.solvent, 40) || typeof o.solventPeaks !== "boolean"
    || !pair(o.range) || o.range[0] >= o.range[1] || !pair(o.frame, 0.01, 1000) || !pair(o.origin) || !num(o.scale, 0.01, 100) || !num(o.text, 0.01, 100)
    || !["auto", "horizontal", "vertical"].includes(o.labels as string) || !str(o.title, 400) || typeof o.notice !== "boolean"
    || !Array.isArray(o.roles) || o.roles.length > 20000 || !o.roles.every((r) => str(r, 120))) return undefined;
  const out: Plot = { kind: o.kind, nucleus: o.nucleus as string, mhz: o.mhz as number, solvent: o.solvent as string, solventPeaks: o.solventPeaks, range: o.range, frame: o.frame, origin: o.origin,
    scale: o.scale as number, text: o.text as number, labels: o.labels as LabelTurn, title: o.title as string, notice: o.notice, roles: o.roles as string[] };
  if (o.signals !== undefined) {
    const ss = o.signals as Record<string, unknown>[];
    if (!Array.isArray(ss) || ss.length > 2000 || !ss.every((s) => s && str(s.key, 40) && num(s.shift) && num(s.nuclei, 0, 1000) && colour(s.colour) && (s.broad === undefined || s.broad === true)
      && Array.isArray(s.couplings) && s.couplings.length <= 16 && (s.couplings as Record<string, unknown>[]).every((c) => c && num(c.j, 0, 1000) && Number.isInteger(c.n) && num(c.n, 0, 64)))) return undefined;
    // A ¹H trace is sampled every 0.3 Hz, and each coupling multiplies its signal's lines, so a record that would make
    // more than a million points or MAX_LINES lines is left out.
    const many = ss.reduce((n, s) => n + (s.couplings as { n: number }[]).reduce((k, c) => Math.min(k * (c.n + 1), MAX_LINES + 1), 1), 0);
    if (!["1H", "13C"].includes(o.nucleus as string) || !num(o.mhz, 20, 1500) || many > MAX_LINES || (o.nucleus === "1H" && (o.range[1] - o.range[0]) * (o.mhz as number) > 3e5)) return undefined;
    out.signals = ss.map((s) => ({ key: s.key as string, shift: s.shift as number, nuclei: s.nuclei as number, couplings: (s.couplings as { j: number; n: number }[]).map((c) => ({ j: c.j, n: c.n })), ...(s.broad ? { broad: true as const } : {}), ...(s.colour ? { colour: s.colour as string } : {}) }));
  }
  if (o.trace !== undefined) {
    const t = o.trace as Record<string, unknown>, ps = t?.peaks as Record<string, unknown>[];
    if (!t || !KINDS.includes(t.kind as Kind) || (t.nucleus !== undefined && !str(t.nucleus, 20)) || !str(t.xUnit, 20) || !str(t.yUnit, 20) || (t.sticks !== undefined && t.sticks !== true) || !num(t.base, -1e30, 1e30)
      || !Array.isArray(t.x) || !Array.isArray(t.y) || t.x.length !== t.y.length || t.x.length > MAX_TRACE || !t.x.every((x) => num(x, -1e9, 1e9)) || !t.y.every((y) => num(y, -1e30, 1e30))
      || !Array.isArray(ps) || ps.length > 2000 || !ps.every((g) => g && Number.isInteger(g.id) && num(g.lo, -1e9, 1e9) && num(g.hi, -1e9, 1e9) && num(g.shift, -1e9, 1e9) && str(g.name, 40) && num(g.n, 0, 1e4) && (g.other === undefined || str(g.other, 40)) && colour(g.colour))) return undefined;
    out.trace = { kind: t.kind as Kind, ...(t.nucleus !== undefined ? { nucleus: t.nucleus as string } : {}), xUnit: t.xUnit as string, yUnit: t.yUnit as string, ...(t.sticks ? { sticks: true as const } : {}), base: t.base as number, x: t.x as number[], y: t.y as number[],
      peaks: ps.map((g) => ({ id: g.id as number, lo: g.lo as number, hi: g.hi as number, shift: g.shift as number, name: g.name as string, n: g.n as number, ...(g.other !== undefined ? { other: g.other as string } : {}), ...(g.colour ? { colour: g.colour as string } : {}) })) };
  }
  return (out.kind === "predicted") === !!out.signals && (out.kind === "measured") === !!out.trace ? out : undefined;
}
