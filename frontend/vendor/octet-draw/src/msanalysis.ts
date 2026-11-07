// Mass Spec Analysis (ChemDraw's tool of that name, CH-40): the fragments that fragmentation lines across a structure
// make, taken together as ChemDraw's three modes take them, and for the molecule and each fragment its ion's formula,
// m/z for an adduct and charge state, isotope pattern, a stick spectrum, the HRMS line chemists write, and the peaks
// of a measured peak list each one matches. Pure: no Indigo, no React.
import { HBOND, hydrogens, orderOf, type Mol } from "./render.ts";
import { isotopePattern, isotopesOf } from "./mass.ts";
import { ELEMENTS } from "./labels.ts";
import { inkOf, pageLabels, type Figure } from "./spectrumplot.ts";
import { crossedBonds } from "./masscut.ts";

type P = [number, number];

// The electron's mass in u: CODATA 2022 (NIST, physics.nist.gov/cuu/Constants), 5.485 799 090 441(97) × 10⁻⁴ u.
export const ELECTRON = 5.485799090441e-4;

// Element counts: an element's symbol, D or T, or one isotope as its mass number and element in brackets ("[13C]").
export type Counts = Record<string, number>;
export const addCounts = (...cs: Counts[]): Counts => {
  const out: Counts = {};
  for (const c of cs) for (const [el, n] of Object.entries(c)) if (n) out[el] = (out[el] ?? 0) + n;
  return out;
};
// a less b, or undefined if b has more of an element than a.
export function subCounts(a: Counts, b: Counts): Counts | undefined {
  const out: Counts = { ...a };
  for (const [el, n] of Object.entries(b)) {
    const left = (out[el] ?? 0) - n;
    if (left < 0) return undefined;
    if (left) out[el] = left; else delete out[el];
  }
  return out;
}
const times = (c: Counts, k: number): Counts => Object.fromEntries(Object.entries(c).map(([el, n]) => [el, n * k]));
const elementOf = (key: string) => (key === "D" || key === "T" ? "H" : /^\[\d+([A-Z][a-z]?)\]$/.exec(key)?.[1] ?? key);

// The formula in Hill order: C, then H, then the rest alphabetically (alphabetically throughout with no carbon). D
// and T sort as letters; an isotope in brackets follows its element.
export function hill(c: Counts): string {
  const keys = Object.keys(c).filter((k) => c[k] > 0), carbon = keys.some((k) => elementOf(k) === "C");
  const rank = (k: string) => { const el = elementOf(k), first = carbon ? (el === "C" ? "0" : el === "H" && k === "H" ? "1" : "2") : "2"; return `${first}${k === "D" || k === "T" ? k : el}${k === el ? "" : "~"}`; };
  return keys.sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0)).map((k) => `${k}${c[k] > 1 ? c[k] : ""}`).join("");
}

// The monoisotopic mass: each element at its most abundant isotope (IUPAC's definition, as PubChem's). Undefined for
// an element with no isotope data.
export function monoisotopic(c: Counts): number | undefined {
  let m = 0;
  for (const [el, n] of Object.entries(c)) {
    const iso = isotopesOf(el);
    if (!iso) return undefined;
    m += n * iso.reduce((best, x) => (x[1] > best[1] ? x : best))[0];
  }
  return m;
}
// Whether a formula with this charge has an odd number of electrons (a radical ion).
const oddElectrons = (c: Counts, charge: number) => {
  let e = -charge;
  for (const [el, n] of Object.entries(c)) e += n * (elementOf(el) === "H" ? 1 : [...ELEMENTS].indexOf(elementOf(el)) + 1);
  return Math.abs(e) % 2 === 1;
};

// A structure as the analysis takes it: its drawn atoms; what holds them together (its bonds, and a multi-centre
// attachment's centre with its atoms), as atom pairs; for each fragmentation line (a cut), the links it crosses
// (indices into links); each drawn atom's element counts (with its hydrogens and its label's atoms) and charge; and
// the drawn atoms whose label is no element (a query atom, R). mol: the drawing. ids: the structure's atoms.
// expanded: expandWithOrigins of subset(mol, ids), whose drawn atoms are ids in order. Hydrogens are counted as
// fragmentMasses counts them: each atom keeps its own, so a cut is homolytic. cuts: each line's points, end to end
// (two for a straight line, more for one with corners).
export type Structure = { atoms: number[]; links: [number, number][]; lines: number[][]; counts: Map<number, Counts>; charges: Map<number, number>; unknown: Set<number> };
export function structureOf(mol: Mol, ids: number[], expanded: { mol: Mol; from: number[] }, cuts: P[][]): Structure {
  const atoms = [...new Set(ids)].filter((i) => mol.atoms[i]).sort((a, b) => a - b), own = new Set(atoms);
  const { mol: x, from } = expanded, used = x.atoms.map(() => 0), counts = new Map<number, Counts>(), charges = new Map<number, number>(), unknown = new Set<number>();
  x.bonds.forEach((b) => { if (b.type !== HBOND) b.atoms.forEach((i) => (used[i] += orderOf(b.type))); });
  x.atoms.forEach((a, i) => {
    const at = atoms[from[i] ?? i], mine = counts.get(at) ?? {};
    if (at === undefined) return;
    counts.set(at, mine);
    if (a.label === "*") return;
    if (a.charge) charges.set(at, (charges.get(at) ?? 0) + a.charge);
    const key = a.label === "H" && a.isotope === 2 ? "D" : a.label === "H" && a.isotope === 3 ? "T" : a.isotope && a.label !== "D" && a.label !== "T" ? `[${a.isotope}${a.label}]` : a.label;
    if (!ELEMENTS.has(elementOf(key)) && key !== "T") unknown.add(at);
    mine[key] = (mine[key] ?? 0) + 1;
    const h = a.implicitHCount ?? hydrogens(a.label === "D" || a.label === "T" ? "H" : a.label, a.charge ?? 0, used[i], a.radical);
    if (h) mine.H = (mine.H ?? 0) + h;
  });
  const links: [number, number][] = [], linkOf = new Map<number, number>();
  mol.bonds.forEach((b, k) => { if (b.type !== HBOND && own.has(b.atoms[0]) && own.has(b.atoms[1])) { linkOf.set(k, links.length); links.push([b.atoms[0], b.atoms[1]]); } });
  for (const i of atoms) for (const j of mol.atoms[i].centre?.atoms ?? []) if (own.has(j)) links.push([i, j]);
  const lines = cuts.map((path) => crossedBonds(mol, path).flatMap((c) => (linkOf.has(c.bond) ? [linkOf.get(c.bond)!] : [])));
  return { atoms, links, lines, counts, charges, unknown };
}

// ChemDraw's three ways to take several fragmentation lines (its Spectrum menu's Mass Spec Analysis): every
// combination of the lines, each line on its own, or all of them at once.
export type Mode = "combinatorial" | "sequential" | "simultaneous";
export const MODES: [Mode, string][] = [["combinatorial", "Combinatorial"], ["sequential", "Sequential"], ["simultaneous", "Simultaneous"]];
// A fragment: its drawn atoms, element counts, drawn charge, and the lines that made it (none for the molecule).
export type Fragment = { atoms: number[]; counts: Counts; charge: number; lines: number[] };
const MAX_LINES = 12;
// The molecule and its fragments, heaviest first, each set of atoms once (the one the fewest lines make). atoms: the
// structure's drawn atoms. links: what holds them together (its bonds, and a multi-centre attachment's atoms with its
// centre), as atom pairs. lines: for each line, the links it crosses (indices into links). Lines past the twelfth are
// left out.
export function fragmentsOf(o: { atoms: number[]; links: [number, number][]; lines: number[][]; counts: Map<number, Counts>; charges: Map<number, number>; mode: Mode }): Fragment[] {
  const lines = o.lines.slice(0, MAX_LINES).map((l, k) => ({ k, l })).filter((x) => x.l.length);
  const sum = (atoms: number[]) => addCounts(...atoms.map((i) => o.counts.get(i) ?? {}));
  const charge = (atoms: number[]) => atoms.reduce((s, i) => s + (o.charges.get(i) ?? 0), 0);
  const out: Fragment[] = [{ atoms: [...o.atoms].sort((a, b) => a - b), counts: sum(o.atoms), charge: charge(o.atoms), lines: [] }];
  const seen = new Set([out[0].atoms.join(",")]);
  const sets: number[][] = o.mode === "simultaneous" ? [lines.map((x) => x.k)] : o.mode === "sequential" ? lines.map((x) => [x.k])
    : Array.from({ length: (1 << lines.length) - 1 }, (_, m) => lines.filter((_, b) => ((m + 1) >> b) & 1).map((x) => x.k)).sort((a, b) => a.length - b.length);
  for (const set of sets) {
    const cut = new Set(set.flatMap((k) => o.lines[k]));
    const root = new Map(o.atoms.map((i) => [i, i])), find = (i: number): number => { const r = root.get(i)!; if (r === i) return i; const top = find(r); root.set(i, top); return top; };
    o.links.forEach(([a, b], k) => { if (!cut.has(k) && root.has(a) && root.has(b)) root.set(find(a), find(b)); });
    const groups = new Map<number, number[]>();
    for (const i of o.atoms) { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); }
    for (const atoms of groups.values()) {
      const key = [...atoms].sort((a, b) => a - b).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ atoms: [...atoms].sort((a, b) => a - b), counts: sum(atoms), charge: charge(atoms), lines: set });
    }
  }
  const m = (f: Fragment) => monoisotopic(f.counts) ?? 0;
  return [out[0], ...out.slice(1).sort((a, b) => m(b) - m(a))];
}

// Tab on an atom or bond (ChemDraw's): the fragments with all these atoms in them, smallest first and the molecule
// last, and the nth of them (Tab after Tab goes round; n below 0 goes back). Indices into fragments; undefined when
// none has them.
export function fragmentWith(fragments: { atoms: number[] }[], atoms: number[], n: number): number | undefined {
  const all = fragments.map((f, k) => ({ k, size: f.atoms.length })).filter(({ k }) => atoms.length && atoms.every((i) => fragments[k].atoms.includes(i)));
  all.sort((a, b) => (a.k === 0 ? 1 : 0) - (b.k === 0 ? 1 : 0) || a.size - b.size || a.k - b.k);
  return all.length ? all[((n % all.length) + all.length) % all.length].k : undefined;
}

// The ions: an adduct (taken n times for charge state n), or a loss (a hydrogen or a chloride), the radical ions
// that lose or gain an electron, and the molecule's own charge as drawn.
export type IonKey = "M+H" | "M+Na" | "M+K" | "M+NH4" | "M+Li" | "M+Ag" | "M-Cl" | "M.+" | "M" | "M-H" | "M+Cl" | "M+HCOO" | "M.-";
type Ion = { key: IonKey; sign: 1 | -1; add?: Counts; lose?: Counts; text: string };
export const IONS: Ion[] = [
  { key: "M+H", sign: 1, add: { H: 1 }, text: "H" },
  { key: "M+Na", sign: 1, add: { Na: 1 }, text: "Na" },
  { key: "M+K", sign: 1, add: { K: 1 }, text: "K" },
  { key: "M+NH4", sign: 1, add: { N: 1, H: 4 }, text: "NH4" },
  { key: "M+Li", sign: 1, add: { Li: 1 }, text: "Li" },
  { key: "M+Ag", sign: 1, add: { Ag: 1 }, text: "Ag" },
  { key: "M-Cl", sign: 1, lose: { Cl: 1 }, text: "Cl" },
  { key: "M.+", sign: 1, text: "" },
  { key: "M", sign: 1, text: "" },
  { key: "M-H", sign: -1, lose: { H: 1 }, text: "H" },
  { key: "M+Cl", sign: -1, add: { Cl: 1 }, text: "Cl" },
  { key: "M+HCOO", sign: -1, add: { C: 1, H: 1, O: 2 }, text: "HCOO" },
  { key: "M.-", sign: -1, text: "" },
];
const MINUS = "−", DOT = "•";
// "2+" for charge 2, "+" for 1, "−" for −1; with • for a radical ion.
const chargeText = (q: number, radical: boolean) => `${Math.abs(q) > 1 ? Math.abs(q) : ""}${q > 0 ? "+" : MINUS}${radical ? DOT : ""}`;

// An ion of the molecule or of a fragment: its formula, charge, m/z (of its monoisotopic peak and of its most intense
// one) and isotope pattern, and its label ([M+H]+, [M+H−CH3]+, [M−2H]2−). Undefined when the ion cannot be made (a
// loss of what the formula does not have) or has no charge.
export type IonOf = { label: string; formula: string; counts: Counts; charge: number; radical: boolean; mono?: number; top?: number; pattern?: { mz: number; rel: number }[] };
export function ionOf(f: Fragment, molecule: Fragment, key: IonKey, z: number): IonOf | undefined {
  const ion = IONS.find((x) => x.key === key) ?? IONS[0];
  // As drawn: the drawn charge alone. Otherwise the drawn charge and n adducts or losses (or electrons).
  const n = key === "M" ? 0 : Math.max(1, Math.min(4, Math.round(z)));
  const counts = subCounts(addCounts(f.counts, times(ion.add ?? {}, n)), times(ion.lose ?? {}, n));
  const charge = f.charge + (key === "M" ? 0 : ion.sign * n);
  if (!counts || !charge || (key !== "M" && charge * ion.sign < 0)) return undefined;
  const radical = oddElectrons(counts, charge);
  // The label: M, or M less what the fragment lost (or the fragment's own formula when it is the smaller part), then
  // the adducts or losses, then the charge.
  const lost = f === molecule ? undefined : subCounts(molecule.counts, f.counts), lighter = lost && (monoisotopic(lost) ?? 0) <= (monoisotopic(f.counts) ?? 0);
  const ends = key === "M" || key === "M.+" || key === "M.-" ? "" : `${ion.add ? "+" : MINUS}${n > 1 ? n : ""}${ion.text}`;
  const core = f === molecule ? `M${ends}` : lighter ? `M${ends}${MINUS}${hill(lost!)}` : hill(counts);
  const label = `[${core}]${chargeText(charge, radical)}`;
  const mono = monoisotopic(counts), raw = isotopePattern(counts, 0.1), q = Math.abs(charge);
  const pattern = raw?.map((p) => ({ mz: (p.mz - charge * ELECTRON) / q, rel: p.rel }));
  const top = pattern?.reduce((b, p) => (p.rel > b.rel ? p : b)).mz;
  return { label, formula: hill(counts), counts, charge, radical, mono: mono === undefined ? undefined : (mono - charge * ELECTRON) / q, top, pattern };
}
// The ion keys that make sense for a molecule with this drawn charge: as drawn only for a charged one.
export const ionChoices = (charge: number) => IONS.filter((x) => x.key !== "M" || charge !== 0);
// An ion's name in the Ion menu for charge state z: [M+H]+, [M+2H]2+, [M]+•.
export function ionName(key: IonKey, z: number, charge = 0): string {
  const ion = IONS.find((x) => x.key === key) ?? IONS[0], n = key === "M" ? 0 : Math.max(1, Math.min(4, Math.round(z)));
  if (key === "M") return `[M]${chargeText(charge, false)}`;
  if (key === "M.+" || key === "M.-") return `[M]${chargeText(ion.sign * n, n % 2 === 1)}`;
  return `[M${ion.add ? "+" : MINUS}${n > 1 ? n : ""}${ion.text}]${chargeText(ion.sign * n, false)}`;
}

// Text as a caption takes it: an ion's charge (after "]") as a superscript, and a formula's counts (digits after a
// letter or a closing bracket) as subscripts. "[M−C10H8N2]2+" is [M−C₁₀H₈N₂]²⁺; "[M+2H]2+" keeps its 2H.
export function chemRuns(text: string): { text: string; script?: "sub" | "super" }[] {
  const out: { text: string; script?: "sub" | "super" }[] = [];
  let at = 0;
  for (const m of text.matchAll(/\](\d*[+\u2212]\u2022?)|(?<=[A-Za-z)])\d+/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    if (m[1]) out.push({ text: "]" }, { text: m[1], script: "super" });
    else out.push({ text: m[0], script: "sub" });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// Ionisation sources as experimental sections name them.
export const SOURCES = ["ESI", "APCI", "APPI", "EI", "CI", "MALDI", "FAB", "ASAP", "DART", "FI"];
// The HRMS line: "HRMS (ESI) m/z: [M+H]+ calcd for C10H13O2 165.0910; found 165.0912." Without a found value it ends
// after the calculated one.
export function hrmsLine(o: { source: string; label: string; formula: string; calcd: number; found?: number; decimals?: number }): string {
  const d = o.decimals ?? 4;
  return `HRMS (${o.source}) m/z: ${o.label} calcd for ${o.formula} ${o.calcd.toFixed(d)}${o.found !== undefined && Number.isFinite(o.found) ? `; found ${o.found.toFixed(d)}` : ""}.`;
}
// The error of a found m/z in parts per million.
export const ppm = (found: number, calcd: number) => ((found - calcd) / calcd) * 1e6;

// A pasted peak list (or a JCAMP-DX peak table): m/z and intensity, one peak to a line, or pairs on a line. Text
// that is not numbers is skipped. Intensities are scaled to 100 for the largest (100 each when there are none). At
// most 20,000 peaks, from at most 2 MB of text.
export type Peak = { mz: number; i: number };
export function parsePeaks(text: string): Peak[] {
  const out: Peak[] = [];
  for (const line of text.slice(0, 2_000_000).split(/\r?\n/)) {
    if (out.length >= 20000) break;
    if (/^\s*##/.test(line) && !/^\s*##PEAK\s*TABLE/i.test(line)) continue; // JCAMP-DX labels other than the peak table
    const nums = (line.replace(/^\s*##[^=]*=/, "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    if (!nums.length) continue;
    const pairs = nums.length > 2 && nums.length % 2 === 0 ? nums.length / 2 : 1;
    for (let k = 0; k < pairs; k++) {
      const mz = nums[2 * k], i = nums.length > 1 ? nums[2 * k + 1] : NaN;
      if (Number.isFinite(mz) && mz > 0 && mz < 100000) out.push({ mz, i: Number.isFinite(i) && i >= 0 ? i : NaN });
    }
  }
  const top = Math.max(0, ...out.map((p) => (Number.isNaN(p.i) ? 0 : p.i)));
  return out.map((p) => ({ mz: p.mz, i: Number.isNaN(p.i) || top <= 0 ? 100 : (p.i / top) * 100 }));
}
// The tolerances a match may take: in ppm, or in Da (for a low-resolution list).
export const TOLERANCES: [string, string][] = [["2ppm", "2 ppm"], ["5ppm", "5 ppm"], ["10ppm", "10 ppm"], ["20ppm", "20 ppm"], ["0.01Da", "0.01 Da"], ["0.1Da", "0.1 Da"], ["0.5Da", "0.5 Da"]];
export const within = (tol: string) => {
  const [, v, unit] = /^([\d.]+)(ppm|Da)$/.exec(tol) ?? [, "5", "ppm"];
  return (mz: number) => (unit === "ppm" ? (mz * Number(v)) / 1e6 : Number(v));
};
// The measured peak nearest an m/z within the tolerance, if any (the most intense of equally near ones).
export function nearest(peaks: Peak[], mz: number, tol: string): Peak | undefined {
  const w = within(tol)(mz);
  let best: Peak | undefined;
  for (const p of peaks) if (Math.abs(p.mz - mz) <= w && (!best || Math.abs(p.mz - mz) < Math.abs(best.mz - mz) - 1e-9 || (Math.abs(p.mz - mz) - Math.abs(best.mz - mz) < 1e-9 && p.i > best.i))) best = p;
  return best;
}
// How well a measured cluster matches an ion's isotope pattern: the share of the pattern's intensity (peaks over 1%)
// found within the tolerance, with each found peak weighted by how close its intensity is to the predicted one, as 0
// to 100. The measured cluster is scaled so its peak at the ion's most intense m/z is 100.
export function patternMatch(peaks: Peak[], pattern: { mz: number; rel: number }[], tol: string): number | undefined {
  const main = pattern.reduce((b, p) => (p.rel > b.rel ? p : b)), hit = nearest(peaks, main.mz, tol);
  if (!hit) return undefined;
  let total = 0, got = 0;
  for (const p of pattern.filter((x) => x.rel >= 1)) {
    total += p.rel;
    const m = nearest(peaks, p.mz, tol);
    if (m) got += p.rel * Math.max(0, 1 - Math.abs((m.i / hit.i) * 100 - p.rel) / Math.max(p.rel, 10));
  }
  return total ? (got / total) * 100 : undefined;
}

// Ticks for an m/z axis: a round step that leaves `room` between labels.
export function mzTicks(lo: number, hi: number, width: number, room = 64): number[] {
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((s) => (hi - lo) / s <= width / room) ?? 10000;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
// A range that shows every m/z with a margin, at least 10 wide.
export function mzRange(mzs: number[]): [number, number] {
  if (!mzs.length) return [0, 100];
  const lo = Math.min(...mzs), hi = Math.max(...mzs), pad = Math.max(5, (hi - lo) * 0.06);
  return [Math.max(0, lo - pad), hi + pad];
}

// The stick spectrum as a figure for the page (as spectrumFigure's): an axis with m/z ticks, each ion's isotope
// peaks over 1% as sticks in its colour, and each labelled with its monoisotopic m/z (or its most intense peak's, with
// label "top"). width and height in bond lengths; em: the labels' size in bond lengths.
export function msFigure(o: { ions: { ion: IonOf; colour?: string }[]; range: [number, number]; width: number; height: number; em: number; pt?: number; label?: "mono" | "top"; decimals?: number; measure?: (t: string) => number }): Figure {
  const [lo, hi] = o.range, W = o.width, H = o.height, em = o.em, x = (mz: number) => ((mz - lo) / (hi - lo)) * W;
  const out: Figure = { lines: [{ from: [0, 0], to: [W, 0] }], curves: [], texts: [] };
  for (const v of mzTicks(lo, hi, W, 4 * em)) {
    out.lines.push({ from: [x(v), 0], to: [x(v), -0.15] });
    out.texts.push({ text: String(v), at: [x(v), -0.15 - 0.85 * em], align: "centre" });
  }
  out.texts.push({ text: "m/z", at: [W, -0.15 - 1.9 * em], align: "right", role: "unit" });
  const labels: Parameters<typeof pageLabels>[1] = [], drawn: [number, number][] = [];
  o.ions.forEach(({ ion, colour }, k) => {
    for (const p of ion.pattern ?? []) if (p.rel >= 1 && p.mz >= lo && p.mz <= hi) { out.lines.push({ from: [x(p.mz), 0], to: [x(p.mz), (p.rel / 100) * H], colour }); drawn.push([x(p.mz), (p.rel / 100) * H]); }
    const m = o.label === "top" ? ion.top : ion.mono;
    if (m === undefined || m < lo || m > hi) return;
    const text = m.toFixed(o.decimals ?? 4);
    labels.push({ x: x(m), a: x(m), b: x(m), across: [text], turned: text, colour, role: `peak:${k}` });
  });
  // Labels in a row over the peaks, each on a leader to its peak (the one label layout every spectrum uses).
  pageLabels(out, labels, { width: W, height: H, em, pt: o.pt ?? 1 / 14.4, turn: "horizontal", ink: inkOf(drawn), measure: o.measure });
  return out;
}

// The Mass spec panel's choices, as Settings keeps them (each checked when read).
export type MsPrefs = { mode: Mode; ion: IonKey; z: number; source: string; calc: "mono" | "top"; tolerance: string };
export const MS_DEFAULTS: MsPrefs = { mode: "combinatorial", ion: "M+H", z: 1, source: "ESI", calc: "mono", tolerance: "5ppm" };
export function readMsPrefs(saved: unknown): MsPrefs {
  const s = (typeof saved === "object" && saved ? saved : {}) as Partial<Record<keyof MsPrefs, unknown>>;
  return {
    mode: MODES.some(([m]) => m === s.mode) ? (s.mode as Mode) : MS_DEFAULTS.mode,
    ion: IONS.some((x) => x.key === s.ion) ? (s.ion as IonKey) : MS_DEFAULTS.ion,
    z: Number.isInteger(s.z) && (s.z as number) >= 1 && (s.z as number) <= 4 ? (s.z as number) : 1,
    source: SOURCES.includes(s.source as string) ? (s.source as string) : MS_DEFAULTS.source,
    calc: s.calc === "top" ? "top" : "mono",
    tolerance: TOLERANCES.some(([t]) => t === s.tolerance) ? (s.tolerance as string) : MS_DEFAULTS.tolerance,
  };
}
