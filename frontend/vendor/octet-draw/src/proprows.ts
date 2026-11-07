// The Properties panel's rows (ChemDraw's Analysis and Chemical Properties windows), their values for each structure,
// and the report (ChemDraw's Report…) with each value's method and source.
import type { Structure } from "./chem.ts";
import type { Graph } from "./naming.ts";
import { elementalAnalysis, isotopePattern } from "./mass.ts";
import { massText } from "./query.ts";

// What Octet's own calculators (props.ts) give for a structure.
export type Calculated = {
  tpsa: number; henry?: number; pka: { atom: number; kind: string; pka: number; sd: number }[];
  joback?: { tb: number; tm: number; tc: number; pc: number; vc: number; hf: number; gf: number };
  logS?: number;
};
// method: how the value is found, and the source, for the report. places: the decimals set for the masses (unset:
// 4 for the exact mass, 2 for the molecular weight and m/z). predicted: a model's estimate of a measured property,
// which the panel, Add to drawing, Copy and the report all mark (rowLabel).
export type Row = { key: string; name: string; method: string; predicted?: true; value: (s: Structure, c?: Calculated, places?: number) => string | undefined };
export const rowLabel = (r: { name: string; predicted?: true }) => (r.predicted ? `${r.name} (predicted)` : r.name);

const sign = (x: number, places: number) => x.toFixed(places).replace("-", "−");
const celsius = (k?: number) => (k === undefined ? undefined : `${sign(k - 273.15, 1)} °C`);
const unit = (x: number | undefined, places: number, u: string) => (x === undefined || !Number.isFinite(x) ? undefined : `${sign(x, places)} ${u}`);
const JOBACK = "Joback group contributions (Joback and Reid, Chem. Eng. Commun. 1987, 57, 233).";
const CRIPPEN = "Wildman–Crippen atom contributions (Wildman and Crippen, J. Chem. Inf. Comput. Sci. 1999, 39, 868), calculated by Indigo.";

// The rows, in ChemDraw's two windows' order: analysis and tPSA (calculated from the structure), then the predicted
// physical properties, then the predicted medicinal chemist's.
export const PROPERTY_ROWS: Row[][] = [
  [
    { key: "formula", name: "Formula", method: "Molecular formula of the drawn structure, with its implicit hydrogens (Indigo).", value: (s) => s.formula },
    { key: "exact", name: "Exact mass", method: "Monoisotopic mass: the most abundant isotope of each element (Indigo).", value: (s, _, d) => (Number.isFinite(s.exact) ? massText(s, "exact", d ?? 4) : undefined) },
    { key: "weight", name: "Molecular weight", method: "Average mass from the standard atomic weights (Indigo).", value: (s, _, d) => massText(s, "weight", d ?? 2) },
    { key: "mz", name: "m/z", method: "Isotope pattern from the isotope masses and abundances in NIST Atomic Weights and Isotopic Compositions (Coursey et al., NIST, 2015); the six most intense peaks, relative to the largest.",
      value: (s, _, d) => isotopePattern(s.formula)?.slice(0, 6).map((p) => `${p.mz.toFixed(d ?? 2)} (${p.rel.toFixed(1)}%)`).join(", ") },
    { key: "analysis", name: "Elemental analysis", method: "Mass percentage of each element, from the formula and the standard atomic weights.", value: (s) => elementalAnalysis(s.composition) },
    { key: "tpsa", name: "tPSA", method: "Topological polar surface area from N and O contributions (Ertl, Rohde and Selzer, J. Med. Chem. 2000, 43, 3714).", value: (_, c) => unit(c?.tpsa, 2, "Å²") },
  ],
  [
    { key: "tb", name: "Boiling point", predicted: true, method: JOBACK, value: (_, c) => celsius(c?.joback?.tb) },
    { key: "tm", name: "Melting point", predicted: true, method: JOBACK, value: (_, c) => celsius(c?.joback?.tm) },
    { key: "tc", name: "Critical temperature", predicted: true, method: JOBACK, value: (_, c) => celsius(c?.joback?.tc) },
    { key: "pc", name: "Critical pressure", predicted: true, method: JOBACK, value: (_, c) => unit(c?.joback?.pc, 2, "bar") },
    { key: "vc", name: "Critical volume", predicted: true, method: JOBACK, value: (_, c) => unit(c?.joback?.vc, 1, "cm³/mol") },
    { key: "hf", name: "Heat of formation", predicted: true, method: `${JOBACK} Ideal gas at 298 K.`, value: (_, c) => unit(c?.joback?.hf, 2, "kJ/mol") },
    { key: "gf", name: "Gibbs energy", predicted: true, method: `${JOBACK} Ideal gas at 298 K.`, value: (_, c) => unit(c?.joback?.gf, 2, "kJ/mol") },
    { key: "henry", name: "Henry's law (log)", predicted: true, method: "Henry's law constant, log10.", value: (_, c) => (c?.henry === undefined ? undefined : sign(c.henry, 2)) },
  ],
  [
    { key: "logp", name: "logP", predicted: true, method: CRIPPEN, value: (s) => (s.logP === undefined ? undefined : sign(s.logP, 2)) },
    { key: "mr", name: "Molar refractivity", predicted: true, method: CRIPPEN, value: (s) => unit(s.mr, 2, "cm³/mol") },
    { key: "logs", name: "logS", predicted: true, method: "Aqueous solubility, log10 of mol/L, by ESOL (Delaney, J. Chem. Inf. Comput. Sci. 2004, 44, 1000), with coefficients refitted for Crippen logP (P. Walters).", value: (_, c) => (c?.logS === undefined ? undefined : sign(c.logS, 2)) },
    { key: "pka", name: "pKa", predicted: true, method: "Typical pKa of each ionisable group (for a base, of its conjugate acid), from the Dimorphite-DL site table (Ropp et al., J. Cheminform. 2019, 11, 14).", value: (_, c) => (c?.pka.length ? c.pka.map((p) => `${p.pka.toFixed(1)} (${p.kind})`).join(", ") : undefined) },
  ],
];

// Each row's values, one per structure, for the rows that have any. places: the decimals set for the masses.
export function propertyValues(structures: Structure[], calc?: (s: Structure, g: Graph) => Calculated | undefined, places?: number) {
  const calculated = structures.map((s) => (s.graph && calc ? calc(s, s.graph) : undefined));
  return PROPERTY_ROWS.map((group) => group.map((row) => ({ ...row, values: structures.map((s, k) => row.value(s, calculated[k], places)) })).filter((r) => r.values.some((v) => v !== undefined)));
}
export type PropertyValues = ReturnType<typeof propertyValues>;

// The report (ChemDraw's Report…): each structure's values, then each value's method and source, as text that also
// pastes into a spreadsheet (a tab between a name and its value).
export function propertyReport(values: PropertyValues, date = new Date()): string {
  const rows = values.flat(), count = Math.max(0, ...rows.map((r) => r.values.length));
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const out = ["Chemical properties", `Calculated by Octet on ${day}. Values marked (predicted) come from a model. They are not measured.`];
  for (let k = 0; k < count; k++) {
    out.push("", count > 1 ? `Structure ${k + 1}` : "Structure");
    for (const r of rows) if (r.values[k] !== undefined) out.push(`${rowLabel(r)}\t${r.values[k]}`);
  }
  out.push("", "Methods");
  for (const r of rows) if (r.method) out.push(`${rowLabel(r)}: ${r.method}`);
  return out.join("\n");
}

