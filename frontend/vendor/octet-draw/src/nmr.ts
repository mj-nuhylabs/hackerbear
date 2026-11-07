// NMR prediction: ¹H and ¹³C shifts for a structure, looked up by HOSE code (Bremser 1978: an atom's surroundings,
// sphere by sphere) in a table built from nmrshiftdb2's measured spectra (scripts/nmr-table.ts; the table's licence
// is in data/nmr/, decision 0006), with first-order multiplets for ¹H from typical coupling constants.
// The same code makes the codes when the table is built and when a structure is predicted, so lookups always match.
import type { Graph } from "./naming.ts";
import { aromaticAtoms } from "./rings.ts";
import { isMetal } from "./metals.ts";

export type Nucleus = "1H" | "13C";
// One signal: the atoms it belongs to (graph indices; for ¹H, the heavy atoms whose hydrogens these are), its shift
// (ppm), how many nuclei it counts (¹H: hydrogens; ¹³C: carbons), its couplings to neighbouring hydrogens (¹H: each
// coupling constant in Hz with the number of equivalent hydrogens it couples to), whether it is broad (OH, NH), and
// how sure the prediction is (the spread of the shifts it was based on, in ppm, and how many there were).
// group: what the signal comes from, as chemists name it ("CH3", "2 × CH"); level: how many spheres of the atom's
// surroundings matched the table (0, the atom alone, to 6); each coupling also names the groups it couples to (graph indices).
// solvent: the shift comes from spectra measured in the solvent asked for (unset: from spectra in any solvent).
// code: a hash of the atoms' longest code (their class), the same however the structure is drawn or numbered.
export type Signal = { atoms: number[]; shift: number; nuclei: number; couplings: { j: number; n: number; with?: number[] }[]; broad?: boolean; sd: number; based: number; group?: string; level?: number; solvent?: string; code?: string };
export type Prediction = { nucleus: Nucleus; signals: Signal[] };

export const LEVELS = 6; // spheres in the longest code

// --- The molecule as HOSE codes see it ---------------------------------------------------------------------------

// Hydrogens drawn as atoms become counts on the atoms they are bonded to. `from` gives each heavy atom's index in
// the graph it came from. Atoms η-bonded to a metal (hapto) are written one way, however they were drawn: no charge,
// and a carbon has the hydrogens of a ring or alkene carbon beside the metal (CH in a Cp or arene ring), so a Cp ring
// drawn with two double bonds, as its anion, or with a bond to the metal from each atom, gives the same codes.
export function heavy(g: Graph): { g: Graph; from: number[] } {
  const keep = g.atoms.map((a) => a.el !== "H"), to: number[] = [], from: number[] = [];
  g.atoms.forEach((_, i) => { if (keep[i]) { to[i] = from.length; from.push(i); } });
  const atoms = from.map((i) => ({ ...g.atoms[i] }));
  const bonds: Graph["bonds"] = [];
  for (const b of g.bonds) {
    if (keep[b.a] && keep[b.b]) bonds.push({ ...b, a: to[b.a], b: to[b.b] });
    else if (keep[b.a] !== keep[b.b]) atoms[to[keep[b.a] ? b.a : b.b]].h += 1;
  }
  const out = { atoms, bonds }, eta = hapto(out);
  if (eta.some((m) => m >= 0)) atoms.forEach((a, i) => {
    if (eta[i] < 0) return;
    a.charge = 0;
    if (a.el !== "C") return;
    // A carbon beside the metal: four bonds, one of them to the metal, then one to each η neighbour and its other bonds.
    let used = 1;
    for (const b of bonds) if (b.a === i || b.b === i) { const o = b.a === i ? b.b : b.a; if (!metalLike(atoms[o].el)) used += eta[o] === eta[i] ? 1 : b.order; }
    a.h = Math.max(0, 4 - used);
  });
  return { g: out, from };
}

// Atoms that hold η ligands: metals, and "*" (a template's M).
const metalLike = (el: string) => el === "*" || isMetal(el);
// Each atom's metal when it is η-bonded to one (hapto: bonded to the metal and to another atom bonded to it, as a Cp
// or arene ring's atoms or an alkene's are), else -1.
export function hapto(g: Graph): number[] {
  const out = g.atoms.map(() => -1), metalOf = new Map<number, number[]>();
  g.bonds.forEach((b) => {
    for (const [m, x] of [[b.a, b.b], [b.b, b.a]]) if (metalLike(g.atoms[m].el) && !metalLike(g.atoms[x].el) && g.atoms[x].el !== "H") metalOf.set(x, [...(metalOf.get(x) ?? []), m]);
  });
  if (!metalOf.size) return out;
  for (const b of g.bonds) {
    const shared = metalOf.get(b.a)?.find((m) => metalOf.get(b.b)?.includes(m));
    if (shared !== undefined) out[b.a] = out[b.b] = shared;
  }
  return out;
}

type Edge = { to: number; bond: string };
// eta: each atom's metal when it is η-bonded to one (hapto), else -1.
export type Env = { g: Graph; edges: Edge[][]; label: string[]; cls: number[]; aromatic: boolean[]; eta: number[] };

// Bonds in no ring (bridges), by Tarjan's method, without recursion.
function bridges(n: number, adj: { to: number; k: number }[][]): Set<number> {
  const order = new Array<number>(n).fill(-1), low = new Array<number>(n).fill(0), out = new Set<number>();
  let t = 0;
  for (let s = 0; s < n; s++) {
    if (order[s] >= 0) continue;
    const stack: { v: number; via: number; i: number }[] = [{ v: s, via: -1, i: 0 }];
    order[s] = low[s] = t++;
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < adj[top.v].length) {
        const { to, k } = adj[top.v][top.i++];
        if (k === top.via) continue;
        if (order[to] < 0) { order[to] = low[to] = t++; stack.push({ v: to, via: k, i: 0 }); }
        else low[top.v] = Math.min(low[top.v], order[to]);
      } else {
        stack.pop();
        const up = stack[stack.length - 1];
        if (up) { low[up.v] = Math.min(low[up.v], low[top.v]); if (low[top.v] > order[up.v]) out.add(top.via); }
      }
    }
  }
  return out;
}

// Each atom's neighbours with their bond (= double, % triple, * aromatic, ~ between atoms η-bonded to one metal, ^
// from such an atom to its metal, nothing for single), its label (element and charge), and its symmetry class: atoms
// in one class are equivalent in the graph (refined Morgan invariants). An η ring is not aromatic here, whichever
// Kekulé form or charges it was drawn with, so all five atoms of a Cp ring are alike.
export function environment(g: Graph): Env {
  const n = g.atoms.length, adj: { to: number; k: number }[][] = g.atoms.map(() => []);
  g.bonds.forEach((b, k) => { adj[b.a].push({ to: b.b, k }); adj[b.b].push({ to: b.a, k }); });
  const eta = hapto(g), aromatic = aromaticAtoms(g).map((x, i) => x && eta[i] < 0), bridge = bridges(n, adj);
  const sym = (k: number) => {
    const b = g.bonds[k];
    if (eta[b.a] >= 0 && eta[b.a] === eta[b.b]) return "~";
    if (eta[b.a] === b.b || eta[b.b] === b.a) return "^";
    return aromatic[b.a] && aromatic[b.b] && !bridge.has(k) ? "*" : b.order === 2 ? "=" : b.order === 3 ? "%" : "";
  };
  const edges = adj.map((list) => list.map(({ to, k }) => ({ to, bond: sym(k) })));
  const label = g.atoms.map((a) => `${a.el}${a.charge > 0 ? "+" : a.charge < 0 ? "-" : ""}`);
  // Classes: start from what each atom is, then split by what its neighbours are until nothing more splits.
  const rank = (keys: string[]) => { const sorted = [...new Set(keys)].sort(); return keys.map((k) => sorted.indexOf(k)); };
  let cls = rank(g.atoms.map((a, i) => `${label[i]}|${a.h}|${aromatic[i] ? 1 : 0}|${edges[i].length}`)), count = new Set(cls).size;
  for (let round = 0; round < n; round++) {
    const next = rank(cls.map((c, i) => `${c}|${edges[i].map((e) => `${e.bond}${cls[e.to]}`).sort().join(",")}`)), more = new Set(next).size;
    cls = next;
    if (more === count) break;
    count = more;
  }
  return { g, edges, label, cls, aromatic, eta };
}

// An atom's codes, one per level (sphere 1 to `levels`), in the spirit of HOSE codes: the centre's label and
// hydrogens, then each sphere's atoms. Each atom is described by its label, the bonds and descriptions of the atoms
// in the sphere before that reach it, and its bonds to atoms in its own sphere (& where a ring closes). Every list is
// sorted, so the codes are the same whatever order the atoms were drawn in. There is always one code per level.
export function hose(env: Env, centre: number, levels = LEVELS): string[] {
  const { edges, label } = env, dist = new Map([[centre, 0]]), spheres: string[] = [], out: string[] = [];
  const head = `${label[centre]}H${env.g.atoms[centre].h}`;
  let desc = new Map([[centre, head]]);
  for (let level = 1; level <= levels; level++) {
    const reached = new Map<number, string[]>();
    for (const [p, d] of desc) for (const e of edges[p]) {
      const at = dist.get(e.to);
      if (at !== undefined && at !== level) continue;
      dist.set(e.to, level);
      reached.set(e.to, [...(reached.get(e.to) ?? []), `${e.bond}${d}`]);
    }
    // Past the end of the molecule the spheres are empty: "nothing more" is part of the code, so toluene's ipso
    // carbon does not match a para-substituted one.
    const next = new Map<number, string>();
    for (const [v, from] of reached) {
      const ring = edges[v].filter((e) => dist.get(e.to) === level).map((e) => `${e.bond}&`).sort().join("");
      next.set(v, short(`${label[v]}(${from.sort().join(",")})${ring}`));
    }
    spheres.push([...next.values()].sort().join(","));
    out.push(`${head}(${spheres.join("/")})`);
    desc = next;
  }
  return out;
}
// An atom's codes from level 0 to the longest, indexed by level. Level 0 is the atom alone: its label, its hydrogens
// and whether it is η-bonded to a metal (^), so a Cp or arene ring on a metal the table has never seen gets the shifts
// of such rings on other metals. It is the last resort, so every atom gets a shift, rated rough when it comes from it.
export const codes = (env: Env, centre: number): string[] => [`${env.label[centre]}H${env.g.atoms[centre].h}${env.eta[centre] >= 0 ? "^" : ""}`, ...hose(env, centre)];
// A description as 8 hex digits, so codes stay short however deep they go.
const short = (s: string) => codeHash("1H", s).toString(16).padStart(8, "0");

// --- The shift table ---------------------------------------------------------------------------------------------

// 32-bit FNV-1a of a nucleus's code at a level.
export function codeHash(nucleus: Nucleus, code: string): number {
  let h = 0x811c9dc5;
  const s = `${nucleus}:${code}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

// A table: sorted code hashes, each with the median shift, the spread (standard deviation) and how many measured
// shifts it holds. Version 1 of the file holds the ¹³C table, then the ¹H one: "ONMR", version, the two counts, then
// per table the hashes (u32), shifts (i16, ppm × 100), spreads (u16, ppm × 100) and counts (u16). Version 2 adds the
// solvent tables, ¹³C then ¹H (four counts, four tables): codes measured in one solvent (solventCode) whose shifts
// there differ from the shifts in every solvent.
export type Table = { hash: Uint32Array; shift: Int16Array; sd: Uint16Array; n: Uint16Array };
export type Tables = Record<Nucleus, Table> & { solvent?: Record<Nucleus, Table> };
const tables: Partial<Record<Nucleus, Table>> = {}, solventTables: Partial<Record<Nucleus, Table>> = {};

export function readTables(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), version = bytes.length >= 8 ? view.getUint32(4, true) : 0;
  if (bytes.length < 16 || String.fromCharCode(...bytes.slice(0, 4)) !== "ONMR" || (version !== 1 && version !== 2)) throw new Error("Not a shift table");
  const parts = version === 2 ? 4 : 2, head = 8 + 4 * parts;
  if (bytes.length < head) throw new Error("Shift table is cut short");
  let at = head;
  delete solventTables["13C"];
  delete solventTables["1H"];
  for (let k = 0; k < parts; k++) {
    const count = view.getUint32(8 + 4 * k, true);
    if (at + count * 10 > bytes.length) throw new Error("Shift table is cut short");
    const copy = <T>(make: (b: ArrayBuffer) => T, size: number) => { const b = new Uint8Array(bytes.subarray(at, at + count * size)).buffer; at += count * size; return make(b); };
    const t = { hash: copy((b) => new Uint32Array(b), 4), shift: copy((b) => new Int16Array(b), 2), sd: copy((b) => new Uint16Array(b), 2), n: copy((b) => new Uint16Array(b), 2) };
    (k < 2 ? tables : solventTables)[k % 2 ? "1H" : "13C"] = t;
  }
}
export function writeTables(t: Tables): Uint8Array {
  const parts = [t["13C"], t["1H"], ...(t.solvent ? [t.solvent["13C"], t.solvent["1H"]] : [])], head = 8 + 4 * parts.length;
  const out = new Uint8Array(head + parts.reduce((s, p) => s + p.hash.length * 10, 0)), view = new DataView(out.buffer);
  out.set([..."ONMR"].map((c) => c.charCodeAt(0)));
  view.setUint32(4, t.solvent ? 2 : 1, true);
  parts.forEach((p, k) => view.setUint32(8 + 4 * k, p.hash.length, true));
  let at = head;
  for (const p of parts) for (const arr of [p.hash, p.shift, p.sd, p.n]) { out.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), at); at += arr.byteLength; }
  return out;
}
export const useTables = (t: Tables) => { Object.assign(tables, { "13C": t["13C"], "1H": t["1H"] }); if (t.solvent) Object.assign(solventTables, t.solvent); };
// A code as measured in one solvent: the solvent's name (as SOLVENTS in spectrumplot.ts lists it) before it.
export const solventCode = (solvent: string, code: string) => `${solvent}|${code}`;

function find(t: Table, h: number) {
  let lo = 0, hi = t.hash.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, v = t.hash[mid];
    if (v === h) return mid;
    if (v < h) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}
// An atom's shift: from its longest code the table has (level 0 at the least), as measured in `solvent` where the
// solvent table has that code. Undefined when not even the atom alone is there.
export function lookup(env: Env, nucleus: Nucleus, atom: number, solvent?: string): { shift: number; sd: number; based: number; level: number; solvent?: string } | undefined {
  const t = tables[nucleus], st = solvent ? solventTables[nucleus] : undefined;
  if (!t) return undefined;
  const all = codes(env, atom);
  for (let level = all.length - 1; level >= 0; level--) {
    const i = find(t, codeHash(nucleus, all[level]));
    if (i < 0) continue;
    const j = st ? find(st, codeHash(nucleus, solventCode(solvent!, all[level]))) : -1;
    if (j >= 0) return { shift: st!.shift[j] / 100, sd: st!.sd[j] / 100, based: st!.n[j], level, solvent };
    return { shift: t.shift[i] / 100, sd: t.sd[i] / 100, based: t.n[i], level };
  }
  return undefined;
}

// Loads the shift tables (once, on first use), gzipped next to the app.
let loading: Promise<void> | undefined;
export function nmrReady(): Promise<void> {
  loading ??= (async () => {
    const raw = new Uint8Array(await (await fetch(new URL("../data/nmr/shifts.bin.gz", import.meta.url))).arrayBuffer());
    // A server may have unzipped it already.
    const zipped = raw[0] === 0x1f && raw[1] === 0x8b;
    readTables(zipped ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()) : raw);
  })().catch((e) => { loading = undefined; throw e; });
  return loading;
}

// --- Prediction --------------------------------------------------------------------------------------------------

// Typical ¹H–¹H couplings (Hz) between hydrogens on neighbouring atoms: aromatic ortho, vinylic (cis and trans
// averaged; Octet's graph has no geometry), next to an aldehyde, and otherwise vicinal sp³. Meta coupling on a ring
// is 2 Hz. Round a ring η-bonded to a metal: 2.5 Hz in a Cp ring, 6.5 Hz in an arene's. Hydrogens on O, N and S
// exchange and do not couple.
function vicinal(env: Env, a: number, b: number): number {
  const e = env.edges[a].find((x) => x.to === b)!;
  if (e.bond === "~") {
    const ring = new Set([a]);
    for (const i of ring) for (const x of env.edges[i]) if (x.bond === "~") ring.add(x.to);
    return ring.size === 5 ? 2.5 : 6.5;
  }
  if (e.bond === "*") return 8;
  if (e.bond === "=") return 12;
  const sp2 = (i: number) => env.edges[i].some((x) => x.bond === "=" || x.bond === "*");
  const aldehyde = (i: number) => env.edges[i].some((x) => x.bond === "=" && env.label[x.to] === "O");
  if (aldehyde(a) || aldehyde(b)) return 2.5;
  return sp2(a) || sp2(b) ? 7.5 : 7;
}

// Solvents that exchange their deuterium with OH, NH and SH hydrogens, so those hydrogens give no ¹H peak.
const EXCHANGING = ["D₂O", "CD₃OD"];
// The predicted spectrum, or undefined before the tables are loaded or when no atom is covered. solvent: shifts
// measured in it are used where the table has them (ChemDraw has CDCl₃ and DMSO only).
export function predict(drawn: Graph, nucleus: Nucleus, solvent?: string): Prediction | undefined {
  if (!tables[nucleus]) return undefined;
  const { g, from } = heavy(drawn), env = environment(g), done = new Set<number>(), signals: Signal[] = [];
  const exchange = (i: number) => ["O", "N", "S"].includes(g.atoms[i].el), gone = nucleus === "1H" && !!solvent && EXCHANGING.includes(solvent);
  const centres = g.atoms.map((_, i) => i).filter((i) => (nucleus === "13C" ? g.atoms[i].el === "C" : g.atoms[i].h > 0 && !(gone && exchange(i))));
  for (const c of centres) {
    if (done.has(env.cls[c])) continue;
    done.add(env.cls[c]);
    const found = lookup(env, nucleus, c, solvent);
    if (!found) continue;
    const members = centres.filter((i) => env.cls[i] === env.cls[c]);
    const nuclei = nucleus === "13C" ? members.length : members.reduce((s, i) => s + g.atoms[i].h, 0);
    // ¹H couplings: to the hydrogens on each neighbouring heavy atom (vicinal), and meta on aromatic rings, each J
    // with the number of hydrogens it couples to; none to equivalent hydrogens or across O, N and S.
    const couplings: Signal["couplings"] = [];
    if (nucleus === "1H" && !exchange(c)) {
      const add = (j: number, n: number, to: number) => {
        const same = couplings.find((x) => Math.abs(x.j - j) < 0.6);
        if (same) { same.n += n; same.with!.push(from[to]); } else couplings.push({ j, n, with: [from[to]] });
      };
      for (const e of env.edges[c]) if (g.atoms[e.to].h && !exchange(e.to) && env.cls[e.to] !== env.cls[c]) add(vicinal(env, c, e.to), g.atoms[e.to].h, e.to);
      if (env.aromatic[c]) {
        const meta = new Set<number>();
        for (const e of env.edges[c]) if (e.bond === "*") for (const f of env.edges[e.to]) if (f.bond === "*" && f.to !== c && env.edges[c].every((x) => x.to !== f.to)) meta.add(f.to);
        for (const m of meta) if (g.atoms[m].h && env.cls[m] !== env.cls[c]) add(2, g.atoms[m].h, m);
      }
    }
    signals.push({
      atoms: members.map((i) => from[i]), shift: found.shift, nuclei, couplings: couplings.sort((a, b) => b.j - a.j),
      ...(nucleus === "1H" && exchange(c) ? { broad: true } : {}), sd: found.sd, based: found.based, level: found.level, ...(found.solvent ? { solvent: found.solvent } : {}),
      group: `${members.length > 1 ? `${members.length} × ` : ""}${g.atoms[c].el}${g.atoms[c].h ? `H${g.atoms[c].h > 1 ? g.atoms[c].h : ""}` : ""}`,
      code: codeHash(nucleus, hose(env, c)[LEVELS - 1]).toString(36),
    });
  }
  return signals.length ? { nucleus, signals: signals.sort((a, b) => b.shift - a.shift) } : undefined;
}

// How far to trust a shift, as ChemDraw rates its estimates. Good: four or more spheres of the atom's surroundings
// matched, the measured shifts agree (spread up to 0.15 ppm for ¹H, 1.5 for ¹³C), and there were two or more of them
// (one is enough when all six spheres matched). Rough: two spheres or fewer matched, or the shifts spread more than
// twice that. Medium otherwise.
export function quality(s: Signal, nucleus: Nucleus): "good" | "medium" | "rough" {
  const level = s.level ?? 0, tight = nucleus === "1H" ? 0.15 : 1.5;
  if (level <= 2 || s.sd > 2 * tight) return "rough";
  return level >= 4 && s.sd <= tight && (s.based >= 2 || level === 6) ? "good" : "medium";
}
// The details as a table (tab-separated, for a spreadsheet): one row per signal.
export function detailsTable(p: Prediction): string {
  const head = p.nucleus === "1H" ? ["Group", "δ (ppm)", "Multiplicity", "J (Hz)", "Integral", "Spheres matched", "Measured shifts", "Measured in", "Spread (ppm)", "Quality"]
    : ["Group", "δ (ppm)", "Carbons", "Spheres matched", "Measured shifts", "Measured in", "Spread (ppm)", "Quality"];
  const rows = [...p.signals].sort((a, b) => b.shift - a.shift).map((s) => (p.nucleus === "1H"
    ? [s.group ?? "", s.shift.toFixed(2), multiplicity(s), s.couplings.map((c) => c.j.toFixed(1)).join(", "), `${s.nuclei}H`, String(s.level ?? ""), String(s.based), s.solvent ?? "any solvent", s.sd.toFixed(2), quality(s, p.nucleus)]
    : [s.group ?? "", s.shift.toFixed(1), String(s.nuclei), String(s.level ?? ""), String(s.based), s.solvent ?? "any solvent", s.sd.toFixed(1), quality(s, p.nucleus)]));
  return [head, ...rows].map((r) => r.join("\t")).join("\n");
}

// --- Text --------------------------------------------------------------------------------------------------------

// A signal's multiplicity as chemists write it: s, d, t, q, quint, sext, sept, dd, dt, td, ddd and so on, m when it
// has more than three kinds of coupling, br s for a broad one.
export function multiplicity(s: Signal): string {
  if (s.broad) return "br s";
  const name = ["s", "d", "t", "q", "quint", "sext", "sept"], c = [...s.couplings].sort((a, b) => b.j - a.j);
  if (c.length <= 1) return c.length && c[0].n > 6 ? "m" : name[c[0]?.n ?? 0];
  // Several couplings: each one's pattern, the largest J first (dd, dt, td, ddd); m past three or for big ones.
  return c.length > 3 || c.some((x) => x.n > 3) ? "m" : c.map((x) => name[x.n]).join("");
}

// The prediction as a journal's characterisation line (ACS style): "¹H NMR (400 MHz, CDCl₃) δ 7.26 (d, J = 8.0 Hz,
// 2H), …" with shifts from high to low; ¹³C lists the shifts alone.
export function acsText(p: Prediction, mhz: number, solvent: string): string {
  const signals = [...p.signals].sort((a, b) => b.shift - a.shift);
  if (p.nucleus === "13C") return `¹³C NMR (${Math.round(mhz * 0.25145)} MHz, ${solvent}) δ ${signals.map((s) => s.shift.toFixed(1)).join(", ")}.`;
  const one = (s: Signal) => {
    const m = multiplicity(s), j = s.couplings.length && m !== "m" && !s.broad ? `, J = ${[...s.couplings].sort((a, b) => b.j - a.j).map((c) => c.j.toFixed(1)).join(", ")} Hz` : "";
    return `${s.shift.toFixed(2)} (${m}${j}, ${s.nuclei}H)`;
  };
  return `¹H NMR (${mhz} MHz, ${solvent}) δ ${signals.map(one).join(", ")}.`;
}
