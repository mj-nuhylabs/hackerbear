// Checks a drawing the way a chemist would at a glance: ChemDraw 26.1's chemical warnings (Check Structure and the
// marks on the drawing), and messy geometry. Messages follow the brief's style: what is wrong, the rule, then what to do.
import { bondedTo, bondOrders, fragments, freePairs, LARGE, mayBeChairBond, neighbourSlots, neighbours, perspectiveBonds, pos, WIDE, type P } from "./edit.ts";
import { chemicalText, labelSmiles, units } from "./labels.ts";
import { HBOND, isBracket, orderOf, type Bond, type Mol } from "./render.ts";

// The kinds of warning, as ChemDraw 26.1's Settings > Warnings lists them, each with its switch's default (all on but
// enhanced stereochemistry).
export type WarningType = "valence" | "parens" | "near" | "unspecified" | "ambiguous" | "enhanced" | "between" | "linear" | "hbonds" | "isolated" | "isotopes" | "misc" | "backwards";
export const WARNING_TYPES: { id: WarningType; name: string; on: boolean }[] = [
  { id: "valence", name: "Valence and charge errors", on: true },
  { id: "parens", name: "Unbalanced parentheses", on: true },
  { id: "near", name: "Atoms near other bonds", on: true },
  { id: "unspecified", name: "Unspecified stereochemistry", on: true },
  { id: "ambiguous", name: "Ambiguous stereochemistry", on: true },
  { id: "enhanced", name: "Enhanced stereochemistry errors", on: false },
  { id: "between", name: "Stereobond between chiral atoms", on: true },
  { id: "linear", name: "Linear atoms", on: true },
  { id: "hbonds", name: "Hydrogen bonds", on: true },
  // Off by default, unlike ChemDraw (Sam, 18 October 2026): a lone bond drawn on purpose should not show a warning.
  { id: "isolated", name: "Isolated bonds", on: false },
  { id: "isotopes", name: "Invalid isotopes", on: true },
  { id: "misc", name: "Miscellaneous warnings", on: true },
  { id: "backwards", name: "Stereobond originating from non-stereo atom", on: true },
];

// A problem is on an atom, a bond, a shape (brackets) or a caption that counts as chemistry (by id). fix: a command
// that mends it, with its button's name. hidden: the object's Display Warnings is off (ChemDraw's IgnoreWarnings, on
// atoms, bonds and brackets); Check Structure still reports it.
export type Problem = { type: WarningType; atom?: number; bond?: number; shape?: number; caption?: number; message: string; fix?: { label: string; command: string }; hidden?: true };
// Problems found on a drawing with its chemical captions as atoms (edit.ts withCaptionAtoms): those on a caption's
// atom go on the caption. atoms: the drawing's own atoms; captions: the caption each later atom is.
export const onCaptions = (list: Problem[], atoms: number, captions: number[]): Problem[] => list.map((p) => {
  if (p.atom === undefined || p.atom < atoms) return p;
  const { atom, ...rest } = p;
  return { ...rest, caption: captions[atom - atoms] };
});
// What Indigo works out about a drawing's stereocentres (chem.ts stereoFacts), by atom: centres (atoms that can be
// stereocentres), unset (centres whose configuration the drawing does not set), conflict (centres whose wedges and
// hashes conflict), and atoms in structures that cannot be chiral.
export type StereoFacts = { centres: Set<number>; unset: Set<number>; conflict: Set<number>; achiral: Set<number> };

const NAMES: Record<string, string> = {
  H: "Hydrogen", B: "Boron", C: "Carbon", N: "Nitrogen", O: "Oxygen", F: "Fluorine", Al: "Aluminium", Si: "Silicon", P: "Phosphorus", S: "Sulfur", Cl: "Chlorine",
  Ga: "Gallium", Ge: "Germanium", As: "Arsenic", Se: "Selenium", Br: "Bromine", In: "Indium", Sn: "Tin", Sb: "Antimony", Te: "Tellurium", I: "Iodine",
};
// Valence electrons and period of the main-group elements Octet checks.
const SHELL: Record<string, [number, number]> = {
  H: [1, 1], D: [1, 1], B: [3, 2], C: [4, 2], N: [5, 2], O: [6, 2], F: [7, 2], Al: [3, 3], Si: [4, 3], P: [5, 3], S: [6, 3], Cl: [7, 3],
  Ga: [3, 4], Ge: [4, 4], As: [5, 4], Se: [6, 4], Br: [7, 4], In: [3, 5], Sn: [4, 5], Sb: [5, 5], Te: [6, 5], I: [7, 5],
};
// The valences an atom can have with this charge, lowest first: those of the element it then has as many valence
// electrons as (N+ as C, O− as F). From period 3 an atom with five or more can use them in pairs (S 2, 4 or 6).
const valenceSets: Record<string, Record<number, number[] | undefined>> = {};
export function valences(label: string, charge: number): number[] | undefined {
  const sets = (valenceSets[label] ??= {});
  return charge in sets ? sets[charge] : (sets[charge] = valenceSet(label, charge));
}
function valenceSet(label: string, charge: number): number[] | undefined {
  const shell = SHELL[label];
  if (!shell) return undefined;
  const e = shell[0] - charge;
  if (shell[1] === 1) return [Math.max(0, 1 - Math.abs(charge))];
  if (e <= 0) return [0];
  if (e <= 4) return [e];
  const out = [];
  for (let v = 8 - e; v <= (shell[1] > 2 ? e : 8 - e); v += 2) out.push(v);
  return out;
}
const listOf = (vs: number[]) => (vs.length > 1 ? `${vs.slice(0, -1).join(", ")} or ${vs[vs.length - 1]}` : String(vs[0]));
const plural = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
// Known isotopes, lightest to heaviest mass number, by element (NUBASE, rounded out a little).
const ISOTOPES: Record<string, [number, number]> = Object.fromEntries(
  ("H1-7 He3-10 Li3-13 Be5-16 B6-21 C8-22 N10-25 O11-28 F13-31 Ne15-34 Na17-39 Mg18-40 Al21-43 Si22-45 P24-47 S26-49 Cl28-52 Ar29-54 " +
  "K31-59 Ca34-60 Sc36-62 Ti38-64 V40-66 Cr42-68 Mn44-71 Fe45-74 Co47-76 Ni48-79 Cu52-82 Zn54-85 Ga56-87 Ge58-90 As60-92 Se64-95 " +
  "Br67-98 Kr67-101 Rb71-103 Sr73-107 Y76-109 Zr78-112 Nb81-115 Mo83-117 Tc85-120 Ru87-124 Rh89-126 Pd91-128 Ag93-132 Cd95-134 " +
  "In97-137 Sn99-140 Sb103-142 Te104-145 I106-147 Xe108-150 Cs111-152 Ba113-155 La116-157 Ce119-159 Pr121-161 Nd124-164 Pm126-166 " +
  "Sm128-168 Eu130-170 Gd133-172 Tb135-174 Dy138-176 Ho140-178 Er142-180 Tm144-182 Yb148-185 Lu150-188 Hf153-190 Ta155-194 W157-197 " +
  "Re159-199 Os161-203 Ir164-205 Pt165-208 Au169-210 Hg171-216 Tl176-218 Pb178-220 Bi184-224 Po186-227 At191-229 Rn193-231 Fr197-233 " +
  "Ra201-235 Ac205-237 Th208-239 Pa212-241 U215-243").split(" ").map((s) => { const [, el, lo, hi] = /^([A-Z][a-z]?)(\d+)-(\d+)$/.exec(s)!; return [el, [Number(lo), Number(hi)]]; }));
const knownIsotope = (label: string, mass: number) => { const r = ISOTOPES[label]; return !r || (mass >= r[0] && mass <= r[1]); };

// A label's attachment atom, from its SMILES: its bond orders inside the label, its charge, and its element.
const firstAtoms = new Map<string, { inside: number; charge: number; element: string } | undefined>();
function firstAtom(text: string) {
  if (firstAtoms.has(text)) return firstAtoms.get(text);
  const smiles = labelSmiles(text);
  let out: { inside: number; charge: number; element: string } | undefined;
  const m = smiles && /^(?:\[([A-Z][a-z]?)[^\]]*?([+-]\d*)?\]|(Cl|Br|[BCNOPSFI])|([bcnops]))/.exec(smiles);
  if (smiles && m) {
    const aromatic = !!m[4], element = m[1] ?? m[3] ?? m[4].toUpperCase(), charge = m[2] ? (m[2][0] === "-" ? -1 : 1) * (Number(m[2].slice(1)) || 1) : 0;
    // Its bonds: ring closures and the branches straight after it, then the next atom in the chain.
    let inside = 0, k = m[0].length, depth = 0, bond = "";
    const order = () => (bond === "=" ? 2 : bond === "#" ? 3 : aromatic ? 1.5 : 1);
    for (; k < smiles.length; k++) {
      const ch = smiles[k];
      if (depth) { depth += ch === "(" ? 1 : ch === ")" ? -1 : 0; continue; }
      if ("=#-".includes(ch)) { bond = ch; continue; }
      if (/\d/.test(ch)) { inside += order(); bond = ""; continue; }
      if (ch === "(") { const b = smiles[k + 1]; bond = "=#-".includes(b) ? b : ""; inside += order(); bond = ""; depth = 1; continue; }
      inside += order();
      break;
    }
    out = { inside, charge, element };
  }
  if (firstAtoms.size > 1000) firstAtoms.clear();
  firstAtoms.set(text, out);
  return out;
}
// The hydrogens a label writes on its attachment atom: CH3 3, NHBoc 1, H3C 3, OMe 0. Undefined when the attachment
// atom is counted (C6H4): its hydrogens are shared out, so Octet cannot tell.
function labelHydrogens(text: string): number | undefined {
  const us = units(text), last = us[us.length - 1];
  // A label that starts with a group and ends with one heavy atom is read from its end (Et3N), as labelSmiles reads it.
  if (us.length > 1 && us[0].kind === "group" && last.kind === "element" && last.text !== "H" && !last.count) return us[us.length - 2].text === "H" ? Number(us[us.length - 2].count ?? 1) : 0;
  const first = us.findIndex((u) => !(u.kind === "element" && u.text === "H"));
  if (us[first]?.count && us[first].count !== "1") return undefined;
  const h = us[first + 1]?.text === "H" ? us[first + 1] : first === 1 ? us[0] : undefined;
  return h ? Number(h.count ?? 1) : 0;
}
const balanced = (text: string) => {
  const open: string[] = [];
  for (const ch of text) {
    if ("([{".includes(ch)) open.push(ch);
    else if (")]}".includes(ch) && open.pop() !== "([{"[")]}".indexOf(ch)]) return false;
  }
  return !open.length;
};

// Every problem in the drawing, in the order Check Structure goes through them. stereo: Indigo's facts, for the
// stereochemistry warnings (left out without them). all: problems on objects with their warnings hidden too.
export function problems(m: Mol, stereo?: StereoFacts, all = false): Problem[] {
  const out: Problem[] = [], orders = bondOrders(m);
  // Each atom's number of bonds and its first two, and its bond orders with an aromatic bond counted 1.
  const count = new Int32Array(m.atoms.length), two = new Int32Array(2 * m.atoms.length);
  m.bonds.forEach((b, k) => { for (const i of b.atoms) { if (count[i] < 2) two[2 * i + count[i]] = k; count[i]++; } });
  const least = m.bonds.some((b) => b.type === 4) ? bondOrders(m, (type) => (type === 4 ? 1 : orderOf(type))) : orders;
  const atomOf = (i: number, p: Omit<Problem, "atom">) => { if (all || !m.atoms[i].ignoreWarnings) out.push({ atom: i, ...p, ...(m.atoms[i].ignoreWarnings ? { hidden: true as const } : {}) }); };
  const bondOf = (k: number, p: Omit<Problem, "bond">) => { if (all || !m.bonds[k].ignoreWarnings) out.push({ bond: k, ...p, ...(m.bonds[k].ignoreWarnings ? { hidden: true as const } : {}) }); };
  const name = (i: number) => `${m.atoms[i].text ?? m.atoms[i].label}${i + 1}`;
  // A plain carbon: not a label (a carbon shown as C is one), an attachment mark or bead, or a multi-centre or variable
  // attachment.
  const plain = (i: number) => !m.atoms[i].text && !m.atoms[i].shown && m.atoms[i].label === "C" && !m.atoms[i].attach && !m.atoms[i].bead && !m.atoms[i].centre;
  m.atoms.forEach((a, i) => {
    const charge = a.charge ?? 0, radical = a.radical === 1 ? 1 : a.radical ? 2 : 0;
    if (a.text) {
      // A label: its brackets, an isotope written before it (13CH3), and its attachment atom's valence with the
      // hydrogens the label writes and the bonds drawn to it.
      const t = chemicalText(a.text, a.runs)!;
      if (!balanced(t)) atomOf(i, { type: "parens", message: `The label ${a.text} has unbalanced parentheses. Add or remove a parenthesis.` });
      const iso = /^(\d+)([A-Z][a-z]?)/.exec(t);
      if (iso && !knownIsotope(iso[2], Number(iso[1]))) atomOf(i, { type: "isotopes", message: `${a.text} has an isotope that is not known: ${NAMES[iso[2]] ?? iso[2]} has no isotope of mass ${iso[1]}. Change the mass number.` });
      const first = firstAtom(t), vs = first && !a.query?.valence && valences(first.element, first.charge + charge), h = labelHydrogens(t);
      if (!first || !vs || h === undefined) return;
      const own = first.inside + h + radical, room = vs[vs.length - 1] - own, n = orders[i];
      if (own + n > vs[vs.length - 1] + 1e-9) atomOf(i, { type: "valence", message: n ? `${a.text} has ${plural(n, "bond")}. It can have ${room > 0 ? room : "no bonds"}. ${room > 0 ? "Remove a bond." : "Remove its bonds or change the label."}` : `An atom in ${a.text} has too many bonds. Change the label.` });
      return;
    }
    if (a.isotope && !knownIsotope(a.label, a.isotope)) atomOf(i, { type: "isotopes", message: `${name(i)} has mass number ${a.isotope}. ${NAMES[a.label] ?? a.label} has no isotope of mass ${a.isotope}. Change the mass number.` });
    // Abnormal Valence allowed (a query property): its valence is not checked, as in ChemDraw.
    const vs = a.query?.valence || a.centre ? undefined : valences(a.label, charge);
    if (vs) {
      // An aromatic bond counts 1.5 in the message; for the rule it can count 1 (pyrrole's N, furan's O).
      const used = orders[i] + radical, aromatic = least[i] !== orders[i];
      const most = vs[vs.length - 1], bonds = Number.isInteger(used) ? plural(used, "bond") : `${used} bond orders`;
      const fixable = valences(a.label, charge + 1)?.includes(used);
      const fix = fixable ? { label: "Add a positive charge", command: `fix:${i}:${charge + 1}` } : undefined;
      if (least[i] + radical > most + 1e-9) atomOf(i, { type: "valence", message: `${name(i)} has ${bonds}. ${NAMES[a.label] ?? a.label} has a maximum of ${most}. ${fixable ? "Add a positive charge or remove a bond." : "Remove a bond."}`, fix });
      // Between two valences (S with 3 bonds) Octet adds no hydrogens, so the atom is left with an odd valence.
      else if (!aromatic && used > vs[0] && !vs.includes(used)) atomOf(i, { type: "valence", message: `${name(i)} has ${bonds}. ${NAMES[a.label] ?? a.label} has a valence of ${listOf(vs)}. ${fixable ? "Add a positive charge, or add or remove a bond." : "Add or remove a bond."}`, fix });
    }
    // A shown lone pair more than the atom has, and an H dot or dash on an atom that does not have three bonds.
    if (a.pairs && a.pairs > freePairs(m, i, orders[i])) atomOf(i, { type: "misc", message: `${name(i)} shows ${plural(a.pairs, "lone pair")}. It has ${freePairs(m, i, orders[i])}. Hide a lone pair.` });
    if (a.hmark && count[i] !== 3) atomOf(i, { type: "misc", message: `The H dot or dash on ${name(i)} has a meaning only on an atom with three bonds.` });
    // An unlabelled carbon between two bonds of the same kind in a straight line does not show.
    if (plain(i) && !charge && count[i] === 2) {
      const [b, c] = [m.bonds[two[2 * i]], m.bonds[two[2 * i + 1]]];
      const same = b.type === c.type && (b.display ?? "") === (c.display ?? "") && (b.colour ?? "") === (c.colour ?? "") && !b.stereo && !c.stereo;
      const [p, q, r] = [pos(m, i), pos(m, b.atoms[0] === i ? b.atoms[1] : b.atoms[0]), pos(m, c.atoms[0] === i ? c.atoms[1] : c.atoms[0])];
      const u: P = [q[0] - p[0], q[1] - p[1]], v: P = [r[0] - p[0], r[1] - p[1]];
      if (same && (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1) < Math.cos((175 * Math.PI) / 180)) atomOf(i, { type: "linear", message: `${name(i)} has two bonds in a straight line, so it does not show. Add a label or bend a bond.` });
    }
  });
  // Unlabelled atoms very close to a bond they are not part of. The atoms go in a grid (one bond length square); each
  // bond tests the atoms in the cells its box, grown by NEAR, covers (a long bond, every atom). In a structure turned
  // in 3D the distance counts depth too: an atom that is only in line with a bond as seen (one behind it) is not close.
  // A bond to a multi-centre point crosses its own ring by design, so the ring's atoms are not close to it.
  const NEAR = 0.15, grid = new Map<number, number[]>(), key = (x: number, y: number) => x * 4194304 + y, xy = m.atoms.map((a) => a.location);
  let centred = false;
  m.atoms.forEach((a, i) => {
    if (a.centre) centred = true;
    if (a.text || a.shown || a.label !== "C" || !count[i] || a.centre) return;
    const k = key(Math.floor(xy[i][0]), Math.floor(xy[i][1])), cell = grid.get(k);
    if (cell) cell.push(i); else grid.set(k, [i]);
  });
  const close = new Set<number>();
  for (const b of m.bonds) {
    const [s, t] = [xy[b.atoms[0]], xy[b.atoms[1]]], dx = t[0] - s[0], dy = t[1] - s[1], l = dx * dx + dy * dy, own = centred ? (m.atoms[b.atoms[0]].centre ?? m.atoms[b.atoms[1]].centre)?.atoms : undefined;
    const x0 = Math.floor(Math.min(s[0], t[0]) - NEAR), x1 = Math.floor(Math.max(s[0], t[0]) + NEAR), y0 = Math.floor(Math.min(s[1], t[1]) - NEAR), y1 = Math.floor(Math.max(s[1], t[1]) + NEAR);
    const test = (i: number) => {
      if (i === b.atoms[0] || i === b.atoms[1] || own?.includes(i)) return;
      const p = xy[i], f = l ? Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / l)) : 0;
      if (Math.hypot(s[0] + f * dx - p[0], s[1] + f * dy - p[1], (s[2] ?? 0) + f * ((t[2] ?? 0) - (s[2] ?? 0)) - (p[2] ?? 0)) < NEAR) close.add(i);
    };
    if (x1 - x0 > 8 || y1 - y0 > 8) { for (const cell of grid.values()) cell.forEach(test); continue; }
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) grid.get(key(x, y))?.forEach(test);
  }
  for (const i of [...close].sort((a, b) => a - b)) atomOf(i, { type: "near", message: `${name(i)} is very close to a bond that it is not part of. Move it or join it.` });
  const seen = new Set<number>(), n = m.atoms.length;
  m.bonds.forEach((b, k) => {
    const [i, j] = b.atoms, pair = i < j ? i * n + j : j * n + i;
    // Two bonds that join the same two atoms.
    if (seen.has(pair)) bondOf(k, { type: "misc", message: "Two bonds join the same two atoms. Delete one of them." });
    seen.add(pair);
    // A lone single bond between two unlabelled carbons reads as ethane, which is seldom what was meant.
    if (b.type === 1 && count[i] === 1 && count[j] === 1 && plain(i) && plain(j) && !m.atoms[i].charge && !m.atoms[j].charge && !m.atoms[i].radical && !m.atoms[j].radical)
      bondOf(k, { type: "isolated", message: "Octet reads this lone bond as ethane. To draw a line, use the Line tool." });
  });
  // A hydrogen bond goes from an explicit H to an acceptor atom, as ChemDraw's Invalid or ambiguous H-Bond warning asks.
  m.bonds.forEach((b) => {
    if (b.type !== HBOND) return;
    const isH = (i: number) => m.atoms[i].label === "H" && !m.atoms[i].text, [p, q] = b.atoms, h = isH(p) ? p : isH(q) ? q : undefined;
    const other = h === p ? q : p, at = h ?? p;
    if (h !== undefined && !isH(other) && ACCEPTORS.has(m.atoms[other].label) && !m.atoms[other].text) return;
    atomOf(at, { type: "hbonds", message: `The hydrogen bond at ${m.atoms[at].text ?? m.atoms[at].label}${at + 1} does not join an H atom to an acceptor. Draw it from an H atom to an N, O or F atom.` });
  });
  // Brackets that cross a different number of bonds on each side.
  for (const sh of m.shapes ?? []) {
    if (!isBracket(sh) || sh.side || (sh.ignoreWarnings && !all)) continue;
    const [x0, x1] = [Math.min(sh.from[0], sh.to[0]), Math.max(sh.from[0], sh.to[0])], [y0, y1] = [Math.min(sh.from[1], sh.to[1]), Math.max(sh.from[1], sh.to[1])];
    const crosses = (x: number) => m.bonds.filter((b) => {
      const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])];
      if ((p[0] - x) * (q[0] - x) >= 0) return false;
      const y = p[1] + ((x - p[0]) / (q[0] - p[0])) * (q[1] - p[1]);
      return y > y0 && y < y1;
    }).length;
    const [left, right] = [crosses(x0), crosses(x1)];
    if (left !== right) out.push({ shape: sh.id, type: "parens", message: `These brackets cross ${plural(left, "bond")} on the left and ${right} on the right. Make the two sides cross the same bonds.`, ...(sh.ignoreWarnings ? { hidden: true as const } : {}) });
  }
  if (stereo) stereoProblems(m, stereo, atomOf, bondOf);
  return out;
}
const ACCEPTORS = new Set(["N", "O", "F", "S", "Se", "P", "Cl", "Br", "I"]);

// Hide warnings: Display Warnings off (IgnoreWarnings, saved with the drawing) on each problem's atom, bond or
// brackets. A caption's Interpret Chemically goes off instead, as ChemDraw's help says to do.
export function hideProblems(m: Mol, list: Omit<Problem, "type" | "message">[]): Mol {
  const on = (k: "atom" | "bond" | "shape" | "caption") => new Set(list.map((p) => p[k]).filter((v) => v !== undefined));
  const atoms = on("atom"), bonds = on("bond"), shapes = on("shape"), captions = on("caption");
  return {
    ...m, atoms: m.atoms.map((a, i) => (atoms.has(i) ? { ...a, ignoreWarnings: true as const } : a)),
    bonds: m.bonds.map((b, k) => (bonds.has(k) ? { ...b, ignoreWarnings: true as const } : b)),
    ...(m.shapes ? { shapes: m.shapes.map((x) => (shapes.has(x.id) ? { ...x, ignoreWarnings: true as const } : x)) } : {}),
    ...(m.captions ? { captions: m.captions.map((c) => (captions.has(c.id) ? { ...c, chemical: false as const } : c)) } : {}),
  };
}
// The red marks (Editor problemMarks): a ring round an atom or a bond's middle, a box round brackets padded by pad.
export const MARK = { atom: 0.42, bond: 0.5, pad: 0.15 };
// The problem whose red mark is under p (stroke included), so a right-click on the mark offers its warning.
export function problemAt(m: Mol, list: Problem[], p: P): Problem | undefined {
  const near = (q: P, r: number) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= r + 0.08;
  return list.find((x) => {
    if (x.atom !== undefined) return !!m.atoms[x.atom] && near(pos(m, x.atom), MARK.atom);
    const b = x.bond !== undefined ? m.bonds[x.bond] : undefined;
    if (b) { const [q, r] = b.atoms.map((i) => pos(m, i)); return near([(q[0] + r[0]) / 2, (q[1] + r[1]) / 2], MARK.bond); }
    const sh = x.shape !== undefined ? m.shapes?.find((s) => s.id === x.shape) : undefined, d = MARK.pad + 0.08;
    return !!sh && [0, 1].every((k) => p[k] >= Math.min(sh.from[k], sh.to[k]) - d && p[k] <= Math.max(sh.from[k], sh.to[k]) + d);
  });
}
// Show warnings: Display Warnings back on for the atoms given, the bonds between them and the brackets given, or for
// the whole drawing when neither is given. hiddenWarnings: whether any of them has it off.
const hiddenIn = (m: Mol, atoms?: Set<number>, shapes?: Set<number>) => ({
  atom: (i: number) => !!m.atoms[i]?.ignoreWarnings && (!atoms || atoms.has(i)),
  bond: (b: Bond) => !!b.ignoreWarnings && (!atoms || b.atoms.every((i) => atoms.has(i))),
  shape: (x: { id: number; ignoreWarnings?: true }) => !!x.ignoreWarnings && (!shapes || shapes.has(x.id)),
});
export function hiddenWarnings(m: Mol, atoms?: Set<number>, shapes?: Set<number>): boolean {
  const h = hiddenIn(m, atoms, shapes);
  return m.atoms.some((_, i) => h.atom(i)) || m.bonds.some(h.bond) || !!m.shapes?.some(h.shape);
}
export function showWarnings(m: Mol, atoms?: Set<number>, shapes?: Set<number>): Mol {
  const h = hiddenIn(m, atoms, shapes);
  return {
    ...m, atoms: m.atoms.map((a, i) => (h.atom(i) ? { ...a, ignoreWarnings: undefined } : a)),
    bonds: m.bonds.map((b) => (h.bond(b) ? { ...b, ignoreWarnings: undefined } : b)),
    ...(m.shapes ? { shapes: m.shapes.map((x) => (h.shape(x) ? { ...x, ignoreWarnings: undefined } : x)) } : {}),
  };
}

// Hidden H atoms (Toggle Hydrogen Display) on an atom with a warning are shown again, as ChemDraw shows them, so the
// warning can be read. While the warning stays, they stay shown.
export function showWarnedHydrogens(m: Mol): Mol {
  if (!m.atoms.some((a) => a.hidden)) return m;
  const warned = new Set(problems(m).map((p) => p.atom)), show = new Set<number>();
  for (const { atoms: [p, q] } of m.bonds) {
    if (m.atoms[p].hidden && warned.has(q)) show.add(p);
    if (m.atoms[q].hidden && warned.has(p)) show.add(q);
  }
  return show.size ? { ...m, atoms: m.atoms.map((a, i) => (show.has(i) ? { ...a, hidden: undefined } : a)) } : m;
}

// The stereochemistry warnings, from Indigo's facts. As in ChemDraw, unset and conflicting stereocentres are warned
// about only where Show Stereochemistry is on.
function stereoProblems(m: Mol, s: StereoFacts, atomOf: (i: number, p: Omit<Problem, "atom">) => void, bondOf: (k: number, p: Omit<Problem, "bond">) => void) {
  // The wedges and hashes, by bond number.
  const all: number[] = [];
  m.bonds.forEach((b, k) => { if (b.stereo === 1 || b.stereo === 6) all.push(k); });
  // A wedge or hash that draws a ring in perspective (a chair's or Haworth projection's front edge) sets nothing.
  // Only the wedges the warnings below can turn on are looked at: one with a stereocentre at its wide end, one that
  // starts where such a wedge between two stereocentres ends, and one at a stereocentre with no configuration. When
  // none of those can be a chair's (and no bond is bold, as a Haworth projection's front edge is), the perspective
  // bonds change nothing here, and are not found.
  // Each atom's facts as flags, read many times below.
  const n = m.atoms.length, centre = new Uint8Array(n), open = new Uint8Array(n), ends = new Uint8Array(n);
  for (const i of s.centres) if (i < n) centre[i] = 1;
  for (const i of s.unset) if (m.atoms[i]?.cip && !s.conflict.has(i)) open[i] = 1;
  for (const k of all) { const e = m.bonds[k].atoms; if (centre[e[0]] && centre[e[1]]) ends[e[1]] = 1; }
  const need = all.filter((k) => { const e = m.bonds[k].atoms; return centre[e[1]] || ends[e[0]] || open[e[0]] || open[e[1]]; });
  const slots = need.length ? neighbourSlots(m) : undefined;
  const flat = need.length && (m.bonds.some((b) => b.display === "bold") || mayBeChairBond(m, need, slots)) ? perspectiveBonds(m) : undefined;
  const own = flat?.size ? all.filter((k) => !flat.has(k)) : all, wedges = own.map((k) => m.bonds[k]);
  const wedged = new Uint8Array(n);
  for (const w of wedges) { wedged[w.atoms[0]] = 1; wedged[w.atoms[1]] = 1; }
  // Each wedge's narrow end with a neighbour that is no stereocentre (1), found once for the wedges that join two.
  let lone: Uint8Array | undefined, starts: Set<number> | undefined;
  const loneAt = (i: number) => {
    if (!lone) {
      lone = new Uint8Array(m.atoms.length);
      const ask = new Uint8Array(m.atoms.length);
      for (const w of wedges) if (centre[w.atoms[0]] && centre[w.atoms[1]]) ask[w.atoms[0]] = 1;
      if (slots) {
        for (let p = 0; p < ask.length; p++) if (ask[p]) for (let r = WIDE * p; r < WIDE * p + slots.deg[p]; r++) if (!centre[slots.near[r]]) lone[p] = 1;
      } else for (const b of m.bonds) {
        const p = b.atoms[0], q = b.atoms[1];
        if (ask[p] && !s.centres.has(q)) lone[p] = 1;
        if (ask[q] && !s.centres.has(p)) lone[q] = 1;
      }
    }
    return lone[i] === 1;
  };
  own.forEach((k, n) => {
    const narrow = wedges[n].atoms[0], wide = wedges[n].atoms[1];
    // A stereocentre whose neighbours are all stereocentres (a quaternary carbon in a cage: ginkgolide's, aconitine's)
    // can only be set by a bond to one of them. Read at its narrow end, as wedges are, the bond sets only that centre,
    // so it is clear where the wide end's centre is set by its own wedge or hash.
    if (centre[narrow] && centre[wide] && !((starts ??= new Set(wedges.map((w) => w.atoms[0]))).has(wide) && !loneAt(narrow))) bondOf(k, { type: "between", message: "This wedge or hash joins two stereocentres, so it is not clear which one it sets. Start it at one stereocentre only." });
    else if (!centre[narrow] && centre[wide]) bondOf(k, { type: "backwards", message: "This wedge or hash starts at an atom that cannot be a stereocentre. Put its narrow end on the stereocentre.", fix: { label: "Swap the ends", command: `flip_bond:${k}` } });
  });
  m.atoms.forEach((a, i) => {
    if (!a.cip && !a.enhanced) return;
    const name = `${a.text ?? a.label}${i + 1}`;
    if (a.cip && (s.conflict.has(i) || (s.unset.has(i) && wedged[i]))) atomOf(i, { type: "ambiguous", message: `The wedge and hash bonds at ${name} conflict, or do not set its configuration. Change a wedge or hash.` });
    else if (a.cip && s.unset.has(i)) atomOf(i, { type: "unspecified", message: `${name} is a stereocentre with no wedge or hash bond. Add one to set its configuration.` });
    if (a.enhanced && !s.centres.has(i)) atomOf(i, { type: "enhanced", message: `${name} has the stereo flag ${a.enhanced}, but it is not a stereocentre. Remove the flag.` });
  });
  // A structure flagged as a racemic (and) or relative (or) mixture that cannot be chiral: one message, at its first
  // flagged atom.
  const told = new Set<string>();
  m.atoms.forEach((a, i) => {
    if (!a.enhanced) return;
    const kind = /^&/.test(a.enhanced) ? "racemic" : /^or/.test(a.enhanced) ? "relative" : undefined;
    if (!kind || !s.achiral.has(i) || told.has(kind)) return;
    told.add(kind);
    atomOf(i, { type: "enhanced", message: `This compound cannot be ${kind}: it is not chiral. Remove its stereo flags.` });
  });
}

// Is f true for a pair of points (by index) that may be within `cell` of each other? Each point is put in a grid of
// that size and compared only with the points already in its own cell and the eight cells round it. A cell's key is a
// number (faster than a string); two cells with the same key only add pairs for f to test.
function nearPair(ps: P[], cell: number, f: (i: number, j: number) => boolean): boolean {
  const grid = new Map<number, number[]>(), key = (x: number, y: number) => x * 4194304 + y;
  return ps.some((p, k) => {
    const x = Math.floor(p[0] / cell), y = Math.floor(p[1] / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of grid.get(key(x + dx, y + dy)) ?? []) if (f(j, k)) return true;
    const here = grid.get(key(x, y));
    if (here) here.push(k); else grid.set(key(x, y), [k]);
    return false;
  });
}

// Messy geometry: a bond far from the standard length, or two atoms almost on top of each other. A structure turned
// in 3D is drawn in perspective, with short and crossing bonds by design, so it is never messy.
export function messy(m: Mol, ids?: Set<number>): boolean {
  const solid = new Set(m.atoms.some((a) => a.location[2]) ? fragments(m).filter((g) => g.some((i) => m.atoms[i].location[2])).flat() : []);
  const inside = (i: number) => (!ids?.size || ids.has(i)) && !solid.has(i);
  const uneven = m.bonds.some((b) => {
    if (!inside(b.atoms[0]) || !inside(b.atoms[1]) || m.atoms[b.atoms[0]].centre || m.atoms[b.atoms[1]].centre) return false;
    const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])];
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    return length < 0.75 || length > 1.3;
  });
  if (uneven) return true;
  // A multi-centre or variable attachment sits among its atoms by design.
  const atoms = m.atoms.map((_, i) => i).filter((i) => inside(i) && !m.atoms[i].centre), large = m.atoms.length > LARGE;
  const near = large ? bondedTo(m) : undefined;
  const close = (i: number, j: number) => {
    const [p, q]: P[] = [pos(m, i), pos(m, j)];
    return Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.35 && !(near ? near[i] : neighbours(m, i)).includes(j);
  };
  // A large drawing compares only atoms in the same or next cells of a grid.
  const crowded = large ? nearPair(atoms.map((i) => pos(m, i)), 0.5, (j, k) => close(atoms[j], atoms[k]))
    : atoms.some((i, k) => atoms.slice(k + 1).some((j) => close(i, j)));
  if (crowded) return true;
  // Two bonds that cross (and share no atom) also need cleaning up.
  // A bond to a multi-centre or variable attachment crosses its ring by design.
  const bonds = m.bonds.filter((b) => inside(b.atoms[0]) && inside(b.atoms[1]) && !m.atoms[b.atoms[0]].centre && !m.atoms[b.atoms[1]].centre);
  const cross = (a: P, b: P, c: P, d: P) => {
    const s = (p: P, q: P, r: P) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0;
  };
  const crossing = (b: Bond, c: Bond) =>
    !b.atoms.some((i) => c.atoms.includes(i)) && cross(pos(m, b.atoms[0]), pos(m, b.atoms[1]), pos(m, c.atoms[0]), pos(m, c.atoms[1]));
  // Here every bond is at most 1.3 long, so two bonds that cross have midpoints at most 1.3 apart.
  if (large) return nearPair(bonds.map((b) => { const [p, q] = [pos(m, b.atoms[0]), pos(m, b.atoms[1])]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }), 1.5, (j, k) => crossing(bonds[j], bonds[k]));
  return bonds.some((b, k) => bonds.slice(k + 1).some((c) => crossing(b, c)));
}
