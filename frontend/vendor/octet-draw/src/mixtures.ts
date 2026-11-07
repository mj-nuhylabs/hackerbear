// Names for grouped mixtures, as ChemDraw 26.1 writes them (its help, Structure to Name): the components' names joined
// by "--", then their ratio in brackets, "A--B (0.72/0.28)". IUPAC names addition compounds the same way (Red Book
// IR-5.5: components joined by em dashes, the ratio with solidi); ChemDraw writes two hyphens for the dash, and Name to
// Structure (names.ts) reads both. A mixture is two or more structures in one group (Object > Group); a component's
// count is the repeat count of a multiple-group bracket pair round it (ChemDraw's 0.72 subscript), else 1.
import { polymerBrackets, repeatCount } from "./query.ts";
import type { Mol } from "./render.ts";

// The structures to name (each a list of atoms), with the ions of a salt together: charged pieces within 3.5 bond
// lengths of each other whose charges cancel are named as one, as sodium acetate rather than two names.
export function withSalts(doc: Mol, all: number[][]): number[][] {
  const charge = (g: number[]) => g.reduce((q, i) => q + (doc.atoms[i].charge ?? 0), 0), at = (i: number) => doc.atoms[i].location;
  const ions = all.filter((g) => charge(g) !== 0), group = ions.map((_, k) => k);
  const root = (k: number): number => (group[k] === k ? k : (group[k] = root(group[k])));
  const near = (g: number[], h: number[]) => g.some((i) => h.some((j) => Math.hypot(at(i)[0] - at(j)[0], at(i)[1] - at(j)[1]) < 3.5));
  ions.forEach((g, k) => ions.forEach((h, j) => { if (j > k && near(g, h)) group[root(j)] = root(k); }));
  const salts = new Map<number, number[][]>();
  ions.forEach((g, k) => salts.set(root(k), [...(salts.get(root(k)) ?? []), g]));
  const merged = [...salts.values()].filter((gs) => gs.length > 1 && gs.reduce((q, g) => q + charge(g), 0) === 0);
  const inSalt = new Set(merged.flat());
  return [...all.filter((g) => !inSalt.has(g)), ...merged.map((gs) => gs.flat())];
}

// The grouped mixtures among the structures to name (each a list of atoms): every group, outermost first, holding two
// or more of them whole. Each component with its count, in drawing order (left to right, as ChemDraw cites them).
export type Mixture = { atoms: number[]; parts: { atoms: number[]; count: number }[] };
export function mixturesOf(doc: Mol, targets: number[][]): Mixture[] {
  const groups = [...(doc.groups ?? [])].sort((a, b) => b.atoms.length - a.atoms.length), taken = new Set<number>(), out: Mixture[] = [];
  if (!groups.length || targets.length < 2) return out;
  const brackets = polymerBrackets(doc).filter((b) => b.sh.polymer!.usage === "mult");
  const centre = (atoms: number[]) => atoms.reduce((t, i) => t + doc.atoms[i].location[0], 0) / atoms.length;
  for (const g of groups) {
    const inside = new Set(g.atoms), ks = targets.flatMap((t, k) => (!taken.has(k) && t.length && t.every((i) => inside.has(i)) ? [k] : []));
    if (ks.length < 2) continue;
    const parts = ks.map((k) => {
      const atoms = targets[k], own = new Set(atoms);
      // A multiple-group bracket pair round exactly this component (its atoms, no more): its repeat count.
      const b = brackets.find((x) => x.atoms.length === atoms.length && x.atoms.every((i) => own.has(i)));
      return { atoms, count: b ? repeatCount(b.sh.polymer!) : 1 };
    });
    if (parts.some((p) => p.count === undefined || !(p.count > 0) || p.count > 1e6)) continue;
    ks.forEach((k) => taken.add(k));
    out.push({ atoms: ks.flatMap((k) => targets[k]), parts: (parts as { atoms: number[]; count: number }[]).sort((a, b) => centre(a.atoms) - centre(b.atoms)) });
  }
  return out;
}

// A count as the ratio cites it: as drawn, with no trailing zeros (0.72, 2).
const countText = (n: number) => String(Math.round(n * 1e6) / 1e6);

// The name of a mixture from its components' checked names (each the name Structure to Name gives the component alone,
// with no abbreviation after it). Given only if Name to Structure (read) reads it back as the components, each as many
// times as it draws them: a ratio of whole numbers from 1 to 12 draws each component that many times, any other ratio
// each once (names.ts parts). The ratio it gives back must be the drawn one.
export function mixtureName(parts: { name: string; mol: Mol; count: number }[], read: (name: string) => string | undefined, inchi: (s: Mol | string) => string | undefined): string | undefined {
  if (parts.length < 2 || parts.length > 8 || parts.some((p) => !p.name || p.name.length > 1000)) return undefined;
  const counts = parts.map((p) => countText(p.count)), name = `${parts.map((p) => p.name).join("--")} (${counts.join("/")})`;
  const back = /\(([\d.]+(?:\/[\d.]+)+)\)$/.exec(name)?.[1].split("/").map(Number);
  if (!back || back.length !== parts.length || back.some((n, k) => Math.abs(n - parts[k].count) > 1e-6)) return undefined;
  const whole = back.every((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  // The components together, each as many times as Name to Structure draws it.
  const atoms: Mol["atoms"] = [], bonds: Mol["bonds"] = [];
  for (const p of parts) for (let k = 0; k < (whole ? p.count : 1); k++) {
    const base = atoms.length;
    atoms.push(...p.mol.atoms);
    bonds.push(...p.mol.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
  }
  const smiles = read(name), want = inchi({ atoms, bonds });
  return smiles && want && inchi(smiles) === want ? name : undefined;
}
