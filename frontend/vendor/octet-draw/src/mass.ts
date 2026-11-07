// Mass spectra: a formula's isotope pattern (m/z and relative abundance), as ChemDraw's Analysis window shows it.
// Isotope masses and abundances: NIST's table (isotopes.ts), for every element with a natural abundance.
import { ISOTOPES } from "./isotopes.ts";

// T's mass: NIST's table (as isotopes.ts), which gives it no abundance as it has none in nature.
const TRITIUM = 3.01604928132;
// An element's isotopes ([mass, abundance in %]), or one isotope written as an element: D and T (hydrogen's), or a
// mass number and element in brackets ("[13C]"), each as the pure isotope.
export function isotopesOf(key: string): [number, number][] | undefined {
  if (ISOTOPES[key]) return ISOTOPES[key];
  if (key === "D") return [[ISOTOPES.H[1][0], 100]];
  if (key === "T") return [[TRITIUM, 100]];
  const [, n, el] = /^\[(\d+)([A-Z][a-z]?)\]$/.exec(key) ?? [];
  const one = el && ISOTOPES[el]?.find(([m]) => Math.round(m) === Number(n));
  return one ? [[one[0], 100]] : el === "H" && n === "3" ? [[TRITIUM, 100]] : undefined;
}

// An atom's mass for CIP rule 2: the isotope's (its mass number, when the table has no such isotope), or with no mass
// number the element's natural mean. Undefined for an element the table does not have.
export function atomMass(el: string, massNumber?: number): number | undefined {
  const iso = ISOTOPES[el];
  if (massNumber) return iso?.find(([m]) => Math.round(m) === massNumber)?.[0] ?? massNumber;
  return iso && iso.reduce((t, [m, a]) => t + m * a, 0) / iso.reduce((t, [, a]) => t + a, 0);
}

// A formula as element counts: "C8H9NO2" or Indigo's "C8 H9 N O2". Undefined if it has anything else in it.
export function counts(formula: string): Record<string, number> | undefined {
  const out: Record<string, number> = {}, text = formula.replace(/\s+/g, "");
  if (!/^([A-Z][a-z]?\d*)+$/.test(text)) return undefined;
  for (const [, el, n] of text.matchAll(/([A-Z][a-z]?)(\d*)/g)) out[el] = (out[el] ?? 0) + (n ? Number(n) : 1);
  return out;
}

// The isotope pattern of a formula (or its element counts): a peak for each whole mass unit above the lightest
// isotopologue (its mass the abundance-weighted mean of the isotopologues there), each as a percentage of the
// largest, in order of mass. Peaks under `least` % are left out. Undefined for an element with no isotope data, or
// over 2,000 atoms.
export function isotopePattern(formula: string | Record<string, number>, least = 0.5): { mz: number; rel: number }[] | undefined {
  const n = typeof formula === "string" ? counts(formula) : formula;
  if (!n || Object.keys(n).some((el) => !isotopesOf(el)) || Object.values(n).reduce((a, b) => a + b, 0) > 2000) return undefined;
  // Convolve one atom at a time, keeping peaks above a tiny share so big molecules stay quick.
  let peaks: [number, number][] = [[0, 1]];
  for (const [el, k] of Object.entries(n)) {
    const iso = isotopesOf(el)!.map(([m, a]) => [m, a / 100] as [number, number]);
    for (let i = 0; i < k; i++) {
      const next = new Map<number, [number, number]>();
      for (const [m, p] of peaks) for (const [im, ip] of iso) {
        const mass = m + im, prob = p * ip, key = Math.round(mass * 1000);
        const was = next.get(key);
        next.set(key, was ? [(was[0] * was[1] + mass * prob) / (was[1] + prob), was[1] + prob] : [mass, prob]);
      }
      const top = Math.max(...[...next.values()].map((x) => x[1]));
      peaks = [...next.values()].filter((x) => x[1] > top * 1e-6);
    }
  }
  // Merge the fine structure in each mass unit, counted from the lightest peak so a large mass defect cannot split a
  // cluster across a rounding edge.
  const light = Math.min(...peaks.map((x) => x[0])), merged = new Map<number, [number, number]>();
  for (const [m, p] of peaks) {
    const key = Math.round(m - light), was = merged.get(key);
    merged.set(key, was ? [(was[0] * was[1] + m * p) / (was[1] + p), was[1] + p] : [m, p]);
  }
  const top = Math.max(...[...merged.values()].map((x) => x[1]));
  return [...merged.values()].map(([mz, p]) => ({ mz, rel: (p / top) * 100 })).filter((x) => x.rel >= least).sort((a, b) => a.mz - b.mz);
}

// "C 63.56 H 6.00 N 9.27 O 21.17" (Indigo's mass composition) as chemists write an elemental analysis.
export const elementalAnalysis = (composition: string) =>
  composition.trim().split(/\s+/).reduce<string[]>((out, x, i, all) => (i % 2 ? out : [...out, `${x}, ${all[i + 1]}`]), []).join("; ");
