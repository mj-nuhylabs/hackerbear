// Reaction interpretation, as ChemDraw reads a reaction (View > Show Reaction Interpretation; its stoichiometry grid
// and MDL files read reactions this way): each step of a reaction is one arrow, what stands before it in the row (its
// reactants), what stands after it (its products), and its conditions: the text kept on it, and the structures and text
// drawn above and below it. A structure between two arrows is the product of one step and a reactant of the next.
import { flipAtoms, rotateAtoms } from "./edit.ts";
import type { Box, Mol } from "./render.ts";
import type { Reaction, Step } from "./reaction.ts";

type P = [number, number];
export type Part = Extract<Step, { kind: "structure" | "text" }>;
export type RoleStep = { arrow: number; reactants: Part[]; products: Part[]; above: Part[]; below: Part[] };

// Each step of a reaction, in the row's order: findReaction's row and the conditions it reads by each arrow, and the
// text kept on the arrow. captionBox: a caption's box (drawing units).
export function interpret(m: Mol, r: Reaction, captionBox: (id: number) => Box | undefined): RoleStep[] {
  const at = r.steps.flatMap((s, k) => (s.kind === "arrow" ? [k] : []));
  const parts = (list: Step[]) => list.filter((s): s is Part => s.kind === "structure" || s.kind === "text");
  return at.map((k, j) => {
    const id = (r.steps[k] as Extract<Step, { kind: "arrow" }>).id, own = r.conditions.get(id);
    const step: RoleStep = { arrow: id, reactants: parts(r.steps.slice(j ? at[j - 1] + 1 : 0, k)), products: parts(r.steps.slice(k + 1, at[j + 1] ?? r.steps.length)), above: parts(own?.above ?? []), below: parts(own?.below ?? []) };
    for (const c of m.captions ?? []) {
      const b = c.on?.arrow === id ? captionBox(c.id) : undefined;
      if (b) (c.on!.side === "above" ? step.above : step.below).push({ kind: "text", id: c.id, box: b });
    }
    return step;
  });
}

// What a part is in a reaction step, for Show Reaction Interpretation: by its atoms (a structure) or its id (text).
export type Role = "reactant" | "product" | "above" | "below";
export function rolesOf(steps: RoleStep[]): { atoms: Map<number, Role>; captions: Map<number, Role> } {
  const atoms = new Map<number, Role>(), captions = new Map<number, Role>();
  const mark = (list: Part[], role: Role) => { for (const p of list) if (p.kind === "structure") for (const i of p.atoms) { if (!atoms.has(i)) atoms.set(i, role); } else if (!captions.has(p.id)) captions.set(p.id, role); };
  // A structure between two arrows is marked as the product it is first.
  steps.forEach((s, k) => { mark(s.reactants.filter(() => k === 0), "reactant"); mark(s.products, "product"); mark(s.above, "above"); mark(s.below, "below"); });
  return { atoms, captions };
}

// Map Reaction Atoms over every step of a reaction, with one numbering for the whole scheme: an atom keeps the number
// it got as a product when the next step maps it on (A → B → C: an atom of A, its place in B and its place in C share
// a number). map: the mapper for one step (chem.ts mapReaction), each structure's atom numbers or undefined. Bonds the
// reaction makes or breaks, or whose order it changes, get the Rxn mark (reaction centre), as ChemDraw's mapping marks
// them. Returns undefined when no step can be mapped.
type Mapper = (reactants: Mol[], products: Mol[]) => { reactants: (number | undefined)[][]; products: (number | undefined)[][] } | undefined;
export function mapScheme(m: Mol, given: { reactants: number[][]; products: number[][] }[], map: Mapper, part: (atoms: number[]) => Mol): Mol | undefined {
  // Each structure's atoms in drawing order, as part (subset) lists them and the mapper numbers them.
  const sorted = (gs: number[][]) => gs.map((g) => [...g].sort((p, q) => p - q));
  const steps = given.map((s) => ({ reactants: sorted(s.reactants), products: sorted(s.products) }));
  const all = new Set(steps.flatMap((s) => [...s.reactants, ...s.products].flat()));
  const number = new Map<number, number>();
  let next = 0, any = false;
  for (const s of steps) {
    const got = s.reactants.length && s.products.length ? map(s.reactants.map(part), s.products.map(part)) : undefined;
    if (!got) continue;
    any = true;
    // This step's numbers in the scheme's: an atom already numbered keeps its number, the rest get new ones.
    const scheme = new Map<number, number>();
    s.reactants.forEach((g, k) => g.forEach((i, j) => { const n = got.reactants[k][j]; if (n !== undefined && number.has(i)) scheme.set(n, number.get(i)!); }));
    const at = (n: number) => { if (!scheme.has(n)) scheme.set(n, ++next); return scheme.get(n)!; };
    s.reactants.forEach((g, k) => g.forEach((i, j) => { const n = got.reactants[k][j]; if (n !== undefined && !number.has(i)) number.set(i, at(n)); }));
    s.products.forEach((g, k) => g.forEach((i, j) => { const n = got.products[k][j]; if (n !== undefined) number.set(i, at(n)); }));
    next = Math.max(next, ...number.values());
  }
  if (!any) return undefined;
  const atoms = m.atoms.map((a, i) => (number.has(i) ? { ...a, map: number.get(i) } : all.has(i) ? { ...a, map: undefined } : a));
  // Reaction centres, step by step: a bond between two numbered atoms that is not there on the other side, or has
  // another order there. A mark set by an earlier mapping is taken off first.
  const centre = new Map<number, "makebreak" | "change">();
  for (const s of steps) {
    const side = (groups: number[][]) => {
      const inSide = new Set(groups.flat()), bonds = new Map<string, { k: number; type: number }>();
      m.bonds.forEach((b, k) => {
        const [p, q] = b.atoms.map((i) => (inSide.has(i) ? atoms[i].map : undefined));
        if (p && q) bonds.set(p < q ? `${p}-${q}` : `${q}-${p}`, { k, type: b.type });
      });
      return bonds;
    };
    const before = side(s.reactants), after = side(s.products);
    const mapped = (groups: number[][]) => new Set(groups.flat().flatMap((i) => (atoms[i].map ? [atoms[i].map!] : [])));
    const left = mapped(s.reactants), right = mapped(s.products);
    for (const [key, b] of before) { const [p, q] = key.split("-").map(Number), o = after.get(key); if (!o && right.has(p) && right.has(q)) centre.set(b.k, "makebreak"); else if (o && o.type !== b.type) { centre.set(b.k, "change"); centre.set(o.k, "change"); } }
    for (const [key, b] of after) { const [p, q] = key.split("-").map(Number); if (!before.has(key) && left.has(p) && left.has(q)) centre.set(b.k, "makebreak"); }
  }
  const bonds = m.bonds.map((b, k) => {
    const inScheme = all.has(b.atoms[0]) && all.has(b.atoms[1]), was = inScheme && (b.rxn === "makebreak" || b.rxn === "change");
    return centre.has(k) ? { ...b, rxn: centre.get(k) } : was ? { ...b, rxn: undefined } : b;
  });
  return { ...m, atoms, bonds };
}
// Clear Reaction Map: the scheme's map numbers and the Rxn marks mapping set.
export function clearScheme(m: Mol, atoms: Set<number>): Mol {
  return {
    ...m, atoms: m.atoms.map((a, i) => (atoms.has(i) && a.map ? { ...a, map: undefined } : a)),
    bonds: m.bonds.map((b) => (atoms.has(b.atoms[0]) && atoms.has(b.atoms[1]) && (b.rxn === "makebreak" || b.rxn === "change") ? { ...b, rxn: undefined } : b)),
  };
}

// Augmented Clean Up Reaction, before the reaction is laid out (as ChemDraw 26.1's, which maps the reaction for it
// when it has no map): each structure of the scheme drawn at its bond length, then each product turned to lie as the
// reactant it shares most mapped atoms with, or turned over (in 3D, so its stereo is kept) when that matches better,
// about its own middle. ChemDraw does the first step only; Octet does every step, in order, so a whole scheme lines up
// with its starting material.
export function alignByMap(m: Mol, steps: { reactants: number[][]; products: number[][] }[]): Mol {
  const box = (mol: Mol, g: number[]): P => { const xs = g.map((i) => mol.atoms[i].location[0]), ys = g.map((i) => mol.atoms[i].location[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; };
  let out = m;
  // Each structure at its own bond length (one bond length at its scale), about its middle.
  for (const g of [...new Set(steps.flatMap((s) => [...s.reactants, ...s.products]).map((g) => [...g].sort((p, q) => p - q).join(",")))].map((k) => k.split(",").map(Number))) {
    const set = new Set(g), lengths = out.bonds.filter((b) => set.has(b.atoms[0]) && set.has(b.atoms[1])).map((b) => Math.hypot(...[0, 1].map((k) => out.atoms[b.atoms[1]].location[k] - out.atoms[b.atoms[0]].location[k]))).sort((p, q) => p - q);
    const scale = g.map((i) => out.atoms[i].scale ?? 1).sort((p, q) => p - q)[Math.floor(g.length / 2)], k = lengths.length ? scale / lengths[Math.floor(lengths.length / 2)] : 1;
    if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-6) continue;
    const c = box(out, g);
    out = { ...out, atoms: out.atoms.map((a, i) => (set.has(i) ? { ...a, location: [c[0] + (a.location[0] - c[0]) * k, c[1] + (a.location[1] - c[1]) * k, a.location[2] ?? 0] } : a)) };
  }
  for (const s of steps) {
    for (const g of s.products) {
      // The reactant with the most atoms mapped to this product, and the pairs.
      const pairsWith = (r: number[]) => g.flatMap((i) => { const n = out.atoms[i].map, j = n ? r.find((x) => out.atoms[x].map === n) : undefined; return j === undefined ? [] : [[i, j] as [number, number]]; });
      const pairs = s.reactants.map(pairsWith).sort((p, q) => q.length - p.length)[0] ?? [];
      if (pairs.length < 2) continue;
      // The best turn of the product's mapped atoms onto their partners (least squares), as it is drawn or turned over.
      const fit = (flip: boolean) => {
        const ps = pairs.map(([i]) => [out.atoms[i].location[0], (flip ? -1 : 1) * out.atoms[i].location[1]] as P), qs = pairs.map(([, j]) => [out.atoms[j].location[0], out.atoms[j].location[1]] as P);
        const mid = (xs: P[]): P => [xs.reduce((t, x) => t + x[0], 0) / xs.length, xs.reduce((t, x) => t + x[1], 0) / xs.length], cp = mid(ps), cq = mid(qs);
        let sin = 0, cos = 0;
        ps.forEach((p, k) => { const a = [p[0] - cp[0], p[1] - cp[1]], b = [qs[k][0] - cq[0], qs[k][1] - cq[1]]; sin += a[0] * b[1] - a[1] * b[0]; cos += a[0] * b[0] + a[1] * b[1]; });
        const t = Math.atan2(sin, cos), c = Math.cos(t), si = Math.sin(t);
        const error = ps.reduce((e, p, k) => { const a = [p[0] - cp[0], p[1] - cp[1]], x = a[0] * c - a[1] * si - (qs[k][0] - cq[0]), y = a[0] * si + a[1] * c - (qs[k][1] - cq[1]); return e + x * x + y * y; }, 0);
        return { t, error };
      };
      const plain = fit(false), over = fit(true), set = new Set(g), before = box(out, g);
      if (over.error < plain.error - 1e-6) out = flipAtoms(out, set, "vertical", false, before[1]);
      out = rotateAtoms(out, set, ((over.error < plain.error - 1e-6 ? over.t : plain.t) * 180) / Math.PI);
      const after = box(out, g);
      out = { ...out, atoms: out.atoms.map((a, i) => (set.has(i) ? { ...a, location: [a.location[0] + before[0] - after[0], a.location[1] + before[1] - after[1], a.location[2] ?? 0] } : a)) };
    }
  }
  return out;
}
