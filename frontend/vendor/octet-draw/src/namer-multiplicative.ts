// Octet's IUPAC namer, part 4: multiplicative names (IUPAC 2013, P-15.3 and P-51.3). Clean room, from the published
// rules. Identical parent structures (each with its principal characteristic groups and substituents) joined by a
// multiplying substituent group are named once, multiplied: 2,2'-oxydi(ethan-1-ol), 4,4'-methylenedianiline,
// 2,2',2'',2'''-(ethane-1,2-diyldinitrilo)tetraacetic acid. namer.ts calls multiplicativeName() where it would name
// the senior parent substitutively; undefined means the substitutive name stands. Every name is still read back by
// OPSIN before the app shows it.
//
// When a multiplicative name is the name (P-51.3.1, P-15.3.1.1, P-15.3.4):
// - The identical units are the senior parents (P-44): each has the most principal characteristic groups, then rings
//   before chains, then the senior ring or the longest chain. Every principal group is on a unit. The last P-44 rule
//   (most substituents) does not count: 1,1'-[1,4-phenylenebis(oxy)]dibenzene, not 1,4-diphenoxybenzene (P-52.2.5).
// - Acyclic hydrocarbons are never units (P-15.3.4.2, P-52.2.8): a chain is a unit only with a principal group, so
//   bis(2-chloroethyl) ether is 1-chloro-2-(2-chloroethoxy)ethane.
// - The units are identical, with the same substituents at the same locants, joined to the multiplying group by the
//   same bonds; the multiplying group is a central group with identical branches (P-15.3.2.4.1, P-15.3.4.1). Else the
//   substitutive name stands: 2-[(4-carboxycyclohexyl)methyl]cyclohexane-1-carboxylic acid (P-51.3.3).
// - The most units possible (P-51.3.2.1): 4,4',4''-(ethane-1,1,2-triyl)tribenzoic acid.
// The multiplying group: a central component, then each branch's components from the centre outwards (P-15.3.1.2.2):
// oxy, sulfanediyl, disulfanediyl, sulfonyl, azanediyl, nitrilo, methylene, carbonyl, ethane-1,2-diyl, 1,4-phenylene,
// pyridine-2,6-diyl. Branch components are numbered from the end nearest the unit and cite the locant towards the
// centre first: oxybis(ethane-2,1-diyl). Where the rules leave a choice of form, the one OPSIN reads: azanylylidene
// and methanylylidene for -N= and -CH= (salen ligands), bis(oxy) and dinitrilo.
import { Namer, CARBON_GROUP, MULT, MULT_COMPLEX, alphaKey, assemblePrefixes, chainStem, citedLabels, enclose, joinPrefixes, substituted, times, type Kind, type Name } from "./namer.ts";
import { groupVariant } from "./namer-hetero.ts";

type Cand = { atoms: number[]; ring: boolean; groups: number; subs: number; assembly?: { rings: [number[], number[]]; junction: [number, number] } };
// A component of the multiplying group: a ring system, a chain of carbons, or a heteroatom group.
type Comp = { atoms: number[]; type: "ring" | "chain" | "het" };
// A bond from a component to the next one (or to a unit): the atom in the component, the atom beyond, the order.
type Valence = { at: number; to: number; order: number };
// plain: one component with no prefixes or stereodescriptors, then the units.
type Branch = { text: string; units: number[]; unit?: boolean; plain?: boolean };
type Named = { text: string; order: Valence[]; plain?: boolean };
const SIMPLE_HET = new Set(["oxy", "sulfanediyl", "sulfinyl", "sulfonyl", "selanediyl", "tellanediyl", "disulfanediyl", "trisulfanediyl", "diselanediyl", "peroxy", "azanediyl", "nitrilo", "methylene", "carbonyl", "carbonothioyl", "methanetriyl", "methanetetrayl", "silanediyl"]);

const compare = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};
const locantsOf = (name: string) => (name.match(/\d+/g) ?? []).map(Number);

// Off while substitutively() runs: complexes.ts names ligands substitutively, as its κ terms cite donor atoms by the
// locants of the parent and its substituent groups, and a multiplying group has neither.
let on = true;
export function substitutively<T>(f: () => T): T {
  const was = on;
  on = false;
  try { return f(); } finally { on = was; }
}

// The multiplicative name of the molecule, or undefined when the substitutive name stands. kind: the principal
// characteristic group; skip: group carbons cited as prefixes (namer.ts ionSkip).
export function multiplicativeName(n: Namer, kind: Kind | undefined, skip = new Set<number>()): string | undefined {
  if (!on) return undefined;
  try { return named(n, kind, skip); } catch { return undefined; }
}

// A candidate's atoms as they look from inside: element, charge, hydrogens and stereo of each, with its neighbours'
// elements (ring bonds of any order, as Kekulé structures differ). Identical units look alike, so units are compared
// cheaply before they are named.
function look(n: Namer, atoms: number[]): string {
  const set = new Set(atoms);
  return atoms.map((a) => `${n.el[a]}${n.q[a]}${n.h[a]}${n.cip[a] ?? ""}(${n.adj[a].map((j) => (set.has(j) ? `${n.el[j]}${n.inRing[a] && n.inRing[j] ? "" : n.ord(a, j)}` : `x${n.el[j]}${n.ord(a, j)}`)).sort().join(",")})`).sort().join(" ");
}

function named(n: Namer, kind: Kind | undefined, skip: Set<number>): string | undefined {
  if (n.isotopic || n.opaque.size || n.hzN.size) return undefined;
  const principal = [...n.bearer].filter(([g]) => n.group[g] === kind && !skip.has(g));
  if (kind ? principal.length < 2 : n.rings.length < 2) return undefined;
  const sig = (atoms: number[]) => look(n, atoms);
  // Candidate parents, scored as namer.ts parentName() scores them, less its last rule (most substituents).
  const count = (atoms: number[], ring: boolean) => {
    let c = 0;
    for (const [g, on] of principal) {
      if (CARBON_GROUP.has(kind!)) c += (!ring && atoms.includes(g)) || (ring && on.some((a) => atoms.includes(a))) ? 1 : 0;
      else if (kind === "ketone" || kind === "imine") c += atoms.includes(n.el[g] === "O" ? on[0] : g) ? 1 : 0;
      else c += on.some((a) => atoms.includes(a)) ? 1 : 0;
    }
    return c;
  };
  const outside = (atoms: number[]) => atoms.reduce((s, a) => s + n.adj[a].filter((j) => !atoms.includes(j)).length, 0);
  const cands: Cand[] = n.rings.map((r) => ({ atoms: r, ring: true, groups: kind ? count(r, true) : 0, subs: outside(r) }));
  // Ring assemblies of two alike rings (P-28) as units: 4,4''-oxydi(1,1'-biphenyl). An assembly ranks above its ring.
  for (const a of n.rings.keys()) for (const x of n.rings[a]) for (const y of n.adj[x]) {
    if (!n.inRing[y] || n.ringOf[y] <= a || n.ord(x, y) !== 1) continue;
    const ra = n.rings[a], rb = n.rings[n.ringOf[y]], name = n.assemblyComponent(ra);
    if (!name || name !== n.assemblyComponent(rb)) continue;
    const atoms = [...ra, ...rb];
    cands.push({ atoms, ring: true, groups: kind ? count(atoms, true) : 0, subs: outside(atoms), assembly: { rings: [ra, rb], junction: [x, y] } });
  }
  if (kind) {
    const carbons = [...Array(n.n).keys()].filter((i) => n.el[i] === "C" && !n.inRing[i] && !skip.has(i) && !n.pseudo.has(i) && !n.het.has(i) && (kind === "nitrile" || !n.isNitrileC(i)));
    const seen = new Set<string>();
    for (const a of carbons) for (const p of n.paths(a, -1, true, kind === "nitrile")) {
      const key = [...p].sort((x, y) => x - y).join(" ");
      if (seen.has(key) || p.some((i) => skip.has(i))) continue;
      seen.add(key);
      const groups = count(p, false);
      if (groups) cands.push({ atoms: p, ring: false, groups, subs: outside(p) });
    }
    // More than two carboxylic groups on a chain make it a parent of its own (propane-1,2,3-tricarboxylic acid).
    if (CARBON_GROUP.has(kind) && principal.length > 2) {
      const own = new Set(principal.map(([g]) => g));
      for (const a of carbons) if (!own.has(a)) for (const p of n.paths(a, -1, true, false, own)) if (count(p, true) > 2) return undefined;
    }
  }
  const multiple = (c: Cand, o?: number) => c.ring ? 0 : c.atoms.slice(1).filter((a, k) => { const b = n.ord(c.atoms[k], a); return b > 1 && (o === undefined || b === o); }).length;
  const ringRank = (atoms: number[]) => {
    const hetero = atoms.filter((a) => n.el[a] !== "C"), set = new Set(atoms), has = (e: string) => hetero.some((a) => n.el[a] === e);
    const bonds = atoms.reduce((t, a) => t + n.adj[a].filter((j) => set.has(j)).length, 0) / 2;
    return [has("N") ? 0 : has("O") ? 1 : has("S") ? 2 : hetero.length ? 3 : 4, atoms.length - 1 - bonds, -atoms.length, -hetero.length];
  };
  const score = (c: Cand) => [-c.groups, c.ring ? 0 : 1, ...(c.ring ? [...ringRank(c.assembly?.rings[0] ?? c.atoms), c.assembly ? -2 : -1] : [-c.atoms.length, -multiple(c), -multiple(c, 2), 0, 0])];
  const scores = new Map(cands.map((c) => [c, score(c)]));
  const best = cands.reduce((b, c) => (compare(scores.get(c)!, scores.get(b)!) < 0 ? c : b));
  if (kind && !best.groups) return undefined;
  const top = cands.filter((c) => compare(scores.get(c)!, scores.get(best)!) === 0);
  if (top.length < 2) return undefined;
  // Two senior rings joined by a bond are a ring assembly (1,1'-biphenyl), senior to either ring.
  if (top.some((c) => c.ring && !c.assembly && c.atoms.some((a) => n.adj[a].some((j) => n.inRing[j] && n.ringOf[j] !== n.ringOf[a] && top.some((d) => d.ring && d.atoms.includes(j)))))) return undefined;
  // Families of disjoint, alike candidates, the largest first (P-51.3.2.1); then the units with the most
  // substituents (P-45.2.1), then the lowest locants, then alphabetical order.
  const bySig = new Map<string, Cand[]>();
  for (const c of top) bySig.set(sig(c.atoms), [...(bySig.get(sig(c.atoms)) ?? []), c]);
  const families: Cand[][] = [];
  let steps = 0;
  for (const group of bySig.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => b.subs - a.subs);
    const pick = (i: number, chosen: Cand[], used: Set<number>) => {
      if (++steps > 4000) throw new Error("multiplicative search");
      if (i === group.length) { if (chosen.length >= 2) families.push([...chosen]); return; }
      const c = group[i];
      if (c.atoms.every((a) => !used.has(a))) pick(i + 1, [...chosen, c], new Set([...used, ...c.atoms]));
      pick(i + 1, chosen, used);
    };
    pick(0, [], new Set());
  }
  families.sort((a, b) => b.length - a.length || b.reduce((t, c) => t + c.subs, 0) - a.reduce((t, c) => t + c.subs, 0));
  let found: { text: string; size: number; subs: number }[] = [], tried = 0;
  for (const f of families) {
    if (found.length && f.length < found[0].size) break;
    if (++tried > 24) break;
    const text = attempt(n, kind, skip, f, principal.length);
    if (text) found.push({ text, size: f.length, subs: f.reduce((t, c) => t + c.subs, 0) });
  }
  found = found.filter((x) => x.subs === Math.max(...found.map((y) => y.subs)));
  found.sort((a, b) => compare(locantsOf(a.text), locantsOf(b.text)) || a.text.localeCompare(b.text));
  return found[0]?.text;
}

// The multiplicative name with these units, or undefined.
function attempt(n: Namer, kind: Kind | undefined, skip: Set<number>, units: Cand[], groups: number): string | undefined {
  if (units.reduce((t, u) => t + u.groups, 0) !== groups) return undefined; // every principal group on a unit
  const unitOf = new Map<number, number>();
  units.forEach((u, k) => u.atoms.forEach((a) => unitOf.set(a, k)));
  // An amide unit may be joined through its N (P-15.3.2.2.1): N,N'-methylenediacetamide. Its group atoms go with it.
  if (kind === "amide") for (const [g, on] of n.bearer) {
    const k = n.group[g] === kind ? units.findIndex((u) => u.atoms.includes(g) || on.some((a) => u.atoms.includes(a))) : -1;
    if (k >= 0 && units[k].groups === 1) for (const a of [g, n.carbonylO[g], n.amideN(g)]) if (a !== undefined && a >= 0) unitOf.set(a, k);
  }
  // An amine unit may be joined through one of its amine N atoms, as an amide unit is: N1,N1'-(ethane-1,2-diyl)bis
  // (N1-methylbenzene-1,4-diamine), N,N'-(ethane-1,2-diyl)dianiline. Its amine N atoms go with it.
  if (kind === "amine") for (const [g, on] of n.bearer) {
    const k = n.group[g] === kind ? units.findIndex((u) => on.some((a) => u.atoms.includes(a))) : -1;
    if (k >= 0 && !unitOf.has(g)) unitOf.set(g, k);
  }
  // The rest of the molecule in connected parts: a part on one unit is that unit's substituent; the one part on every
  // unit is the multiplying group.
  const part = new Map<number, number>(), parts: { atoms: number[]; units: Set<number> }[] = [];
  for (let s = 0; s < n.n; s++) {
    if (unitOf.has(s) || part.has(s)) continue;
    const p = { atoms: [s], units: new Set<number>() }, stack = [s];
    part.set(s, parts.length);
    while (stack.length) {
      const i = stack.pop()!;
      for (const j of n.adj[i]) {
        if (unitOf.has(j)) p.units.add(unitOf.get(j)!);
        else if (!part.has(j)) { part.set(j, parts.length); p.atoms.push(j); stack.push(j); }
      }
    }
    parts.push(p);
  }
  const linkers = parts.filter((p) => p.units.size > 1);
  if (linkers.length !== 1 || linkers[0].units.size !== units.length) return undefined;
  const L = new Set(linkers[0].atoms);
  // Each unit joined to the multiplying group by one single bond; units not bonded to each other.
  const attach: [number, number][] = [];
  for (const [a, k] of unitOf) for (const j of n.adj[a]) {
    if (unitOf.has(j) && unitOf.get(j) !== k) return undefined;
    if (L.has(j)) { if (attach[k] || n.ord(a, j) !== 1) return undefined; attach[k] = [a, j]; }
  }
  if (units.some((_, k) => !attach[k])) return undefined;
  for (const a of L) if ((kind && n.group[a] === kind) || skip.has(a)) return undefined;
  const centre = linkerName(n, L, unitOf);
  if (!centre || centre.units.length !== units.length) return undefined;
  // The units, each named with its attachment as a locant after its principal groups; an amide's N is N, N', N''.
  const unitNames = centre.units.map((k) => {
    const u = units[k], nm = n.nameParent({ atoms: u.atoms, ring: u.ring, ...(u.assembly ? { assembly: u.assembly } : {}) }, { kind: u.groups ? kind : undefined, skip, mult: attach[k] });
    const a = attach[k][0], amineN = kind === "amine" && !u.atoms.includes(a);
    // An amine N is N, or N with its carbon's locant where the unit has more than one amine group (N1).
    return { ...nm, at: u.atoms.includes(a) ? nm.label!(a) : amineN && u.groups > 1 ? `N${nm.label!(n.adj[a].find((j) => u.atoms.includes(j))!)}` : "N" };
  });
  // Stereodescriptors of the units' own atoms go in front, primed: (2R,2'R)-2,2'-oxydipropanoic acid.
  const front: string[][] = [], bare: string[] = [];
  for (const u of unitNames) {
    const m = u.text.match(/^\(([^()]*)\)-(.*)$/);
    bare.push(m ? m[2] : u.text);
    front.push(m ? m[1].split(",") : []);
  }
  if (new Set(bare).size !== 1 || new Set(unitNames.map((u) => u.at)).size !== 1 || new Set(front.map((f) => f.join(","))).size !== 1) return undefined;
  if (front[0].some((d) => !/^\d+[a-z]?[RSEZ]$/.test(d)) || unitNames[0].text.includes(" oxide")) return undefined;
  // Each unit's locants primed on from the last unit's: an assembly's second ring is already primed, so the next
  // assembly's locants take two more primes (4, 4'').
  const span = units[0].assembly ? 2 : 1, primed = (loc: string, k: number) => loc + "'".repeat(k * span);
  if (units[0].assembly && front.some((f) => f.length)) return undefined;
  const descriptors = front.flatMap((f, k) => f.map((d) => { const [, loc, x] = d.match(/^(\d+[a-z]?)([RSEZ])$/)!; return { loc, k, text: `${primed(loc, k)}${x}` }; }))
    .sort((a, b) => parseInt(a.loc) - parseInt(b.loc) || a.loc.localeCompare(b.loc) || a.k - b.k).map((d) => d.text);
  const unit = bare[0], k = units.length, mono = !units[0].ring && units[0].atoms.length === 1 && !unitNames[0].prefixes && unitNames[0].at !== "N";
  const multiplied = unitNames[0].prefixes ? MULT_COMPLEX[k] + enclose({ text: unit, compound: true }) : /[\d(]/.test(unit) ? MULT[k] + enclose({ text: unit, compound: true }) : MULT[k] + unit;
  const linker = centre.compound ? enclose({ text: centre.text, compound: true }) : centre.text;
  const locs = mono ? "" : `${unitNames.map((u, i) => primed(u.at, i)).join(",")}-`;
  const text = `${descriptors.length ? `(${descriptors.join(",")})-` : ""}${locs}${linker}${multiplied}`;
  // Every stereodescriptor of the structure must be cited, or the substitutive name stands.
  const labelled = n.cip.filter(Boolean).length + [...n.cipBond.values()].filter(Boolean).length;
  return citedLabels(text) === labelled ? text : undefined;
}

// The multiplying group L, joined to the units (unitOf: unit atoms by unit) by one bond each: a central component and
// identical branches (P-15.3.1.2), named from the centre: ethane-1,2-diylbis(oxy), oxybis(ethane-2,1-diyl). units: the
// units in the order their locants are primed. compound: the name needs enclosing marks before what follows it.
function linkerName(n: Namer, L: Set<number>, unitOf: Map<number, number>): { text: string; units: number[]; compound: boolean } | undefined {
  if ([...L].some((a) => n.q[a] || n.opaque.has(a))) return undefined;
  // Components of the multiplying group: ring systems, chains of carbon atoms (with their =O), S-S, O-O, Se-Se and
  // N=N, and single heteroatoms.
  const chainC = (a: number) => n.el[a] === "C" && !n.inRing[a] && !n.isNitrileC(a) && (!n.group[a] || n.group[a] === "ketone" || n.group[a] === "imine") && !n.het.has(a) && !n.pseudo.has(a);
  const compOf = new Map<number, number>(), comps: Comp[] = [];
  for (const a of L) {
    if (compOf.has(a)) continue;
    let atoms = [a];
    if (n.inRing[a]) atoms = n.rings[n.ringOf[a]];
    else {
      const join = chainC(a) ? (_: number, j: number) => chainC(j)
        : ["O", "S", "Se"].includes(n.el[a]) ? (i: number, j: number) => n.el[j] === n.el[a] && !n.inRing[j] && n.ord(i, j) === 1
        : n.el[a] === "N" ? (i: number, j: number) => n.el[j] === "N" && !n.inRing[j] && n.ord(i, j) === 2 : () => false;
      const seen = new Set([a]);
      for (let k = 0; k < atoms.length; k++) for (const j of n.adj[atoms[k]]) if (L.has(j) && !seen.has(j) && join(atoms[k], j)) { seen.add(j); atoms.push(j); }
    }
    if (atoms.some((x) => !L.has(x) || compOf.has(x))) return undefined;
    atoms.forEach((x) => compOf.set(x, comps.length));
    comps.push({ atoms, type: n.inRing[a] ? "ring" : chainC(a) ? "chain" : "het" });
  }
  // The component tree, with the units as leaves; components that lead to no unit are substituents (pruned).
  const nb = comps.map(() => new Set<number>()); // neighbouring components; units as -1 - k
  for (const a of L) for (const j of n.adj[a]) {
    if (L.has(j) && compOf.get(j) !== compOf.get(a)) nb[compOf.get(a)!].add(compOf.get(j)!);
    if (unitOf.has(j)) nb[compOf.get(a)!].add(-1 - unitOf.get(j)!);
  }
  const live = new Set(comps.map((_, c) => c));
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of live) {
      const around = [...nb[c]].filter((d) => d < 0 || live.has(d));
      if (around.length < 2 && !around.some((d) => d < 0)) { live.delete(c); changed = true; }
    }
  }
  const edges = [...live].reduce((t, c) => t + [...nb[c]].filter((d) => d < 0 || live.has(d)).length, 0);
  if (edges !== 2 * (live.size - 1) + new Set(unitOf.values()).size) return undefined; // a tree
  // Valences of a live component: its bonds to live components and to units.
  const valences = (c: number): Valence[] => comps[c].atoms.flatMap((a) => n.adj[a].filter((j) => unitOf.has(j) || (L.has(j) && compOf.get(j) !== c && live.has(compOf.get(j)!))).map((j) => ({ at: a, to: j, order: n.ord(a, j) })));
  const into = (v: Valence) => (unitOf.has(v.to) ? -1 - unitOf.get(v.to)! : compOf.get(v.to)!);
  // A branch from component c, entered by valence `from` (c's own valence back towards the centre).
  const branch = (c: number, from?: Valence): Branch | undefined => {
    const vs = valences(c), back = from && vs.find((v) => v.at === from.to && v.to === from.at);
    const out = vs.filter((v) => v !== back);
    const comp = nameComp(n, comps[c], back, out, !from);
    if (!comp) return undefined;
    const kids = comp.order.map((v) => { const d = into(v); return d < 0 ? { text: "", units: [-1 - d], unit: true } : branch(d, v); });
    if (kids.some((k) => !k) || (kids.some((k) => k!.unit) && !kids.every((k) => k!.unit))) return undefined;
    const texts = new Set(kids.map((k) => k!.text));
    if (texts.size !== 1) return undefined;
    const t = kids[0]!.text, m = kids.length;
    // di before nitrilo and before one unsubstituted component with locants (peroxydi(4,1-phenylene)); bis before
    // the rest, where di would read as one group (bis(oxy), bis(methylene), bis(ethane-2,1-diyloxy)), P-16.3.
    const more = kids[0]!.unit ? "" : m === 1 ? t : t === "nitrilo" ? MULT[m] + t : kids[0]!.plain && /\d/.test(t) ? `${MULT[m]}(${t})` : MULT_COMPLEX[m] + enclose({ text: t, compound: true });
    // E or Z on the double bond into this component: azanylylidene(E)-methanylylidene.
    const ez = from && n.ord(from.at, from.to) === 2 ? n.cipBond.get(n.key(from.at, from.to)) : undefined;
    // A component with prefixes or stereodescriptors is enclosed before the next one: [(1R,2R)-cyclohexane-1,2-diyl]bis(...).
    const own = more && !comp.plain ? enclose({ text: comp.text, compound: true }) : comp.text;
    return { text: `${ez ? `(${ez})-` : ""}${own}${more}`, units: kids.flatMap((k) => k!.units), plain: !ez && !!comp.plain && !!kids[0]!.unit };
  };
  for (const c of live) {
    if (valences(c).some((v) => v.order !== 1)) continue; // a centre has single bonds only (P-15.3.4.1)
    let b: Branch | undefined;
    try { b = branch(c); } catch { b = undefined; }
    if (b) return { text: b.text, units: b.units, compound: !SIMPLE_HET.has(b.text) || live.size > 1 };
  }
  return undefined;
}

// Ureas joined by a multiplying group through an N (P-15.3.2.2.1, P-66.1.6.1.1, as amides are): N,N''-methylenediurea,
// N,N''-(ethane-1,2-diyl)bis(N'-methylurea). Each unit is a urea group, its C, its =O and its two N
// atoms, with its own substituents; the attachment N of each unit is N, so the units' N locants run N, N', then N'',
// N''' and so on. The units must be alike, and the rest of the molecule one multiplying group.
export function multiplicativeUrea(n: Namer, cs: number[]): string | undefined {
  if (!on || cs.length < 2 || cs.length > 4) return undefined;
  try { return ureaUnits(n, cs); } catch { return undefined; }
}
function ureaUnits(n: Namer, cs: number[]): string | undefined {
  if (n.isotopic || n.opaque.size || n.cip.some(Boolean) || [...n.cipBond.values()].some(Boolean)) return undefined;
  const unitOf = new Map<number, number>(), ns: number[][] = [];
  for (const [k, c] of cs.entries()) {
    const o = n.carbonylO[c], nn = n.adj[c].filter((j) => n.el[j] === "N" && n.ord(c, j) === 1);
    if (o < 0 || nn.length !== 2 || n.adj[c].length !== 3) return undefined;
    for (const a of [c, o, ...nn]) { if (unitOf.has(a)) return undefined; unitOf.set(a, k); }
    ns.push(nn);
  }
  // The rest in connected parts: one part on every unit (the multiplying group), the others each on one unit.
  const part = new Map<number, number>(), parts: { atoms: number[]; units: Set<number> }[] = [];
  for (let s = 0; s < n.n; s++) {
    if (unitOf.has(s) || part.has(s)) continue;
    const p = { atoms: [s], units: new Set<number>() }, stack = [s];
    part.set(s, parts.length);
    while (stack.length) {
      const i = stack.pop()!;
      for (const j of n.adj[i]) {
        if (unitOf.has(j)) p.units.add(unitOf.get(j)!);
        else if (!part.has(j)) { part.set(j, parts.length); p.atoms.push(j); stack.push(j); }
      }
    }
    parts.push(p);
  }
  const linkers = parts.filter((p) => p.units.size > 1);
  if (linkers.length !== 1 || linkers[0].units.size !== cs.length) return undefined;
  const L = new Set(linkers[0].atoms), attach: [number, number][] = [];
  for (const [a, k] of unitOf) for (const j of n.adj[a]) {
    if (unitOf.has(j) && unitOf.get(j) !== k) return undefined;
    if (L.has(j)) { if (attach[k] || n.el[a] !== "N" || n.ord(a, j) !== 1) return undefined; attach[k] = [a, j]; }
  }
  if (cs.some((_, k) => !attach[k])) return undefined;
  const centre = linkerName(n, L, unitOf);
  if (!centre || centre.units.length !== cs.length) return undefined;
  // Each unit: N at its attachment, N' at its other N.
  const units = cs.map((c, k) => {
    const [at, to] = attach[k], other = ns[k].find((x) => x !== at)!;
    const prefixes = [at, other].flatMap((x, j) => n.adj[x].filter((y) => y !== c && !(x === at && y === to)).map((y) => ({ loc: j ? "N'" : "N", name: n.substituent(y, x) })));
    // Thioureas stay substitutive: OPSIN reads N,N''-(ethane-1,2-diyl)dithiourea as another structure.
    return { text: assemblePrefixes(prefixes, false) + (n.el[n.carbonylO[c]] === "O" ? "urea" : "?"), prefixed: prefixes.length > 0 };
  });
  if (new Set(units.map((u) => u.text)).size !== 1 || units[0].text.endsWith("?")) return undefined;
  const k = cs.length, unit = units[0].text;
  const multiplied = units[0].prefixed ? MULT_COMPLEX[k] + enclose({ text: unit, compound: true }) : MULT[k] + unit;
  const locs = centre.units.map((_, i) => `N${"''".repeat(i)}`).join(",");
  return `${locs}-${centre.compound ? enclose({ text: centre.text, compound: true }) : centre.text}${multiplied}`;
}

// Esters of a multiplied acid (P-65.6.3.2.1): dimethyl 4,4'-oxydibenzoate, tetraethyl
// 2,2',2'',2'''-(ethane-1,2-diyldinitrilo)tetraacetate. The alkyl groups must all be the same.
export function multiplicativeEster(n: Namer, kind: Kind, esters: number[]): string | undefined {
  if (kind !== "ester" || !on) return undefined;
  try {
    if (esters.some((c) => groupVariant(n, c))) return undefined; // thioates: S-methyl, O-methyl
    const alkyls = esters.map((c) => { const o = n.esterO.get(c)!; return n.substituent(n.adj[o].find((j) => j !== c && !n.peroxO.has(j))!, o); });
    if (new Set(alkyls.map((a) => a.text)).size !== 1) return undefined;
    const acid = named(n, kind, new Set());
    return acid && `${times(esters.length, alkyls[0])} ${acid}`;
  } catch { return undefined; }
}

// benzene-1,4-diyl as the multiplying group of esters is 1,4-phenylene (P-13.6.2: dimethyl 1,4-phenylene
// dipropanedioate): 2-chloro-1,4-phenylene diacetate.
export const phenylene = (yl: string) => !on ? yl : yl.replace(/^(.*?)benzene-(\d,\d)-diyl$/, (_, pre: string, locs: string) => joinPrefixes(pre.replace(/-$/, ""), `${locs}-phenylene`));

// The polyol part of esters of one acid when the polyol is not named "-diol" (namer.ts polyolYl): the framework
// without its ester O atoms (os), as a multiplying group: oxydi(ethane-2,1-diyl) diacetate,
// ethane-1,2-diylbis(oxyethane-2,1-diyl) diacetate (P-15.3.0, P-65.6.3.2.2).
export function polyolDiyl(n: Namer, alcohol: Set<number>, os: number[]): string | undefined {
  if (!on) return undefined;
  try {
    const L = new Set([...alcohol].filter((a) => !os.includes(a)));
    if (os.some((o) => n.adj[o].filter((j) => L.has(j)).length !== 1)) return undefined;
    const g = linkerName(n, L, new Map(os.map((o, k) => [o, k])));
    if (!g || g.units.length !== os.length) return undefined;
    const labelled = [...L].filter((a) => n.cip[a]).length + [...n.cipBond].filter(([key, v]) => v && key.split(" ").every((x) => L.has(Number(x)))).length;
    return citedLabels(g.text) === labelled ? g.text : undefined;
  } catch { return undefined; }
}

// A component's name, with its valences in the order they are cited (the one back towards the centre first, then the
// others by locant), or undefined if Octet does not name it. central: the component is the centre (no `back`).
function nameComp(n: Namer, c: Comp, back: Valence | undefined, out: Valence[], central: boolean): Named | undefined {
  const all = back ? [back, ...out] : out, partner = (a: number, x: number) => all.some((v) => v.at === a && v.to === x);
  if (out.length < 1 || all.length < 2) return undefined;
  const named = c.type === "het" ? hetName(n, c, back, out, partner) : c.type === "chain" ? chainName(n, c, back, out, central, partner) : ringName(n, c, back, out, central, partner);
  // Single atoms with no prefixes are plain words: oxy, nitrilo, methylene, methanylylidene, carbonyl.
  return named && { ...named, plain: named.plain ?? (SIMPLE_HET.has(named.text) || named.text === "azanylylidene" || named.text === "methanylylidene") };
}
const subsOf = (n: Namer, atoms: number[], partner: (a: number, x: number) => boolean, skipAtoms = new Set<number>()) =>
  atoms.flatMap((a) => n.adj[a].filter((x) => !atoms.includes(x) && !partner(a, x) && !skipAtoms.has(x)).map((x) => ({ a, x })));
// =O and =S on a component atom are oxo and sulfanylidene; other substituents as namer.ts names them.
const prefixOf = (n: Namer, a: number, x: number): Name => {
  if (n.ord(a, x) === 2 && n.adj[x].length === 1 && !n.q[x] && (n.el[x] === "O" || n.el[x] === "S")) return { text: n.el[x] === "O" ? "oxo" : "sulfanylidene", compound: false };
  if (n.ord(a, x) === 2 && n.el[x] === "N" && n.group[x] === "imine") return n.iminoPrefix(x, a);
  return n.substituent(x, a);
};

// O, S (sulfinyl, sulfonyl), Se, Te, S-S, O-O, Se-Se, N (azanediyl, nitrilo, azanylylidene), N=N, Si.
function hetName(n: Namer, c: Comp, back: Valence | undefined, out: Valence[], partner: (a: number, x: number) => boolean): Named | undefined {
  const all = back ? [back, ...out] : out, [a] = c.atoms, el = n.el[a], orders = all.map((v) => v.order);
  if (c.atoms.some((x) => n.q[x] || n.cip[x])) return undefined;
  const subs = subsOf(n, c.atoms, partner);
  const single = orders.every((o) => o === 1);
  if (c.atoms.length > 1) {
    if (all.length !== 2 || !single || subs.length) return undefined;
    if (el === "N") { // N=N: diazene-1,2-diyl
      const ez = n.cipBond.get(n.key(c.atoms[0], c.atoms[1]));
      return c.atoms.length === 2 && all[0].at !== all[1].at ? { text: `${ez ? `(${ez})-` : ""}diazene-1,2-diyl`, order: out } : undefined;
    }
    if (all[0].at === all[1].at) return undefined;
    const word = el === "O" ? (c.atoms.length === 2 ? "peroxy" : undefined) : `${MULT[c.atoms.length]}${el === "S" ? "sulfane" : "selane"}diyl`;
    return word ? { text: word, order: out } : undefined;
  }
  if (el === "O" && all.length === 2 && single && !subs.length && !n.h[a]) return { text: "oxy", order: out };
  if ((el === "Se" || el === "Te") && all.length === 2 && single && !subs.length && !n.h[a]) return { text: el === "Se" ? "selanediyl" : "tellanediyl", order: out };
  if (el === "S" && all.length === 2 && single && !n.h[a]) {
    const oxo = subs.filter(({ x }) => n.el[x] === "O" && n.ord(a, x) === 2 && n.adj[x].length === 1);
    if (oxo.length !== subs.length) return undefined;
    return { text: ["sulfanediyl", "sulfinyl", "sulfonyl"][oxo.length], order: out };
  }
  if (el === "N" && !n.inRing[a]) {
    if (all.length === 3 && single && !subs.length) return { text: "nitrilo", order: out };
    if (all.length === 2 && back?.order === 1 && out[0].order === 2 && !subs.length && !n.h[a]) return { text: "azanylylidene", order: out };
    if (all.length === 2 && single && subs.every(({ a: y, x }) => n.ord(y, x) === 1)) {
      const names = subs.map(({ a: y, x }) => n.substituent(x, y));
      return { text: `${substituted(names)}azanediyl`, order: out };
    }
    return undefined;
  }
  if (el === "Si" && all.length === 2 && single && subs.every(({ a: y, x }) => n.ord(y, x) === 1)) return { text: `${substituted(subs.map(({ a: y, x }) => n.substituent(x, y)))}silanediyl`, order: out };
  return undefined;
}

// Chains of carbon atoms: methylene, carbonyl, methanetriyl, methanylylidene (-CH=), ethane-1,2-diyl, propane-2,2-diyl,
// prop-1-ene-1,3-diyl, propanedioyl. The main chain holds every valence; then the longest, the most multiple bonds,
// the most double bonds. Numbering: lowest locants to the valences, then (a branch component) to those towards the
// units, then to multiple bonds, then to prefixes, then to the prefix cited first.
function chainName(n: Namer, c: Comp, back: Valence | undefined, out: Valence[], central: boolean, partner: (a: number, x: number) => boolean): Named | undefined {
  const all = back ? [back, ...out] : out, carbons = c.atoms, inComp = new Set(carbons);
  if (carbons.length === 1) {
    const [a] = carbons, subs = subsOf(n, carbons, partner);
    if (n.cip[a]) return undefined;
    if (all.length === 2 && back?.order === 2 && out[0].order === 1 && !subs.length && n.h[a] === 1) return { text: "methanylylidene", order: out };
    if (all.some((v) => v.order !== 1)) return undefined;
    const oxo = subs.filter(({ x }) => n.ord(a, x) === 2);
    if (oxo.length) return all.length === 2 && subs.length === 1 && n.adj[oxo[0].x].length === 1 && ["O", "S"].includes(n.el[oxo[0].x]) ? { text: n.el[oxo[0].x] === "O" ? "carbonyl" : "carbonothioyl", order: out } : undefined;
    const word = ["", "", "methylene", "methanetriyl", "methanetetrayl"][all.length];
    return word ? { text: substituted(subs.map(({ a: y, x }) => n.substituent(x, y))) + word, order: out } : undefined;
  }
  if (all.some((v) => v.order !== 1)) return undefined;
  // Every path through the component's carbons that holds every valence atom.
  const need = new Set(all.map((v) => v.at)), paths: number[][] = [];
  const walk = (p: number[]) => {
    if ([...need].every((a) => p.includes(a))) paths.push(p);
    for (const j of n.adj[p[p.length - 1]]) if (inComp.has(j) && !p.includes(j)) walk([...p, j]);
  };
  if (carbons.length > 30) return undefined;
  for (const s of carbons) walk([s]);
  if (!paths.length) return undefined;
  const mult = (p: number[], o?: number) => p.slice(1).filter((a, k) => { const b = n.ord(p[k], a); return b > 1 && (o === undefined || b === o); }).length;
  const rank = (p: number[]) => [-p.length, -mult(p), -mult(p, 2)];
  const bestRank = paths.map(rank).reduce((b, r) => (compare(r, b) < 0 ? r : b));
  let nums = paths.filter((p) => compare(rank(p), bestRank) === 0);
  const loc = (num: number[], a: number) => num.indexOf(a) + 1;
  const prefixes = (num: number[]) => subsOf(n, num, partner, new Set());
  const multiples = (num: number[], o?: number) => num.slice(0, -1).flatMap((a, k) => { const b = n.ord(a, num[k + 1]); return b > 1 && (o === undefined || b === o) ? [k + 1] : []; });
  nums = n.lowest(nums, (num) => all.map((v) => loc(num, v.at)));
  if (!central) nums = n.lowest(nums, (num) => out.map((v) => loc(num, v.at)));
  nums = n.lowest(nums, (num) => multiples(num));
  nums = n.lowest(nums, (num) => multiples(num, 2));
  nums = n.lowest(nums, (num) => prefixes(num).map(({ a }) => loc(num, a)));
  const named = new Map<number, Name>();
  const nameOf = (a: number, x: number) => { if (!named.has(x)) named.set(x, prefixOf(n, a, x)); return named.get(x)!; };
  const alpha = [...new Set(prefixes(nums[0]).map(({ a, x }) => nameOf(a, x).text))].sort((p, q) => alphaKey(p).localeCompare(alphaKey(q)));
  for (const t of alpha) nums = n.lowest(nums, (num) => prefixes(num).filter(({ a, x }) => nameOf(a, x).text === t).map(({ a }) => loc(num, a)));
  const num = nums[0], size = num.length;
  // A double bond from the main chain to a branch carbon with E or Z is not cited here.
  if (num.some((a) => n.adj[a].some((x) => !num.includes(x) && n.ord(a, x) === 2 && n.cipBond.get(n.key(a, x))))) return undefined;
  const pre = prefixes(num), ends = [num[0], num[size - 1]];
  // Both ends C=O and the two valences there: an acyl group (propanedioyl, P-65.1.7.2.1).
  const acyl = all.length === 2 && ends.every((e) => n.carbonylO[e] >= 0 && n.el[n.carbonylO[e]] === "O" && all.some((v) => v.at === e)) && all[0].at !== all[1].at;
  const list = pre.filter(({ a, x }) => !(acyl && ends.includes(a) && x === n.carbonylO[a])).map(({ a, x }) => ({ loc: String(loc(num, a)), name: nameOf(a, x) }));
  const prefixText = assemblePrefixes(list, false);
  const stem = chainStem(size, multiples(num, 2), multiples(num, 3), false);
  const stereo = [...num.flatMap((a) => (n.cip[a] === "R" || n.cip[a] === "S" ? [`${loc(num, a)}${n.cip[a]}`] : [])),
    ...num.slice(0, -1).flatMap((a, k) => { const e = n.cipBond.get(n.key(a, num[k + 1])); return e === "E" || e === "Z" ? [`${k + 1}${e}`] : []; })];
  if (num.some((a) => n.cip[a] && n.cip[a] !== "R" && n.cip[a] !== "S")) return undefined;
  const order = [...out].sort((x, y) => loc(num, x.at) - loc(num, y.at));
  const locs = [...(back ? [loc(num, back.at)] : []), ...order.map((v) => loc(num, v.at))];
  if (central) locs.sort((x, y) => x - y);
  const body = acyl ? `${stem}dioyl` : `${stem}-${locs.join(",")}-${MULT[all.length]}yl`;
  return { text: (stereo.length ? `(${stereo.join(",")})-` : "") + joinPrefixes(prefixText, body), order, plain: !list.length && !stereo.length };
}

// Ring systems: 1,4-phenylene, benzene-1,3,5-triyl, pyridine-2,6-diyl, piperazine-1,4-diyl, cyclohexane-1,1-diyl,
// naphthalene-1,5-diyl. Fused systems only when they need no indicated or added hydrogen.
function ringName(n: Namer, c: Comp, back: Valence | undefined, out: Valence[], central: boolean, partner: (a: number, x: number) => boolean): Named | undefined {
  const all = back ? [back, ...out] : out, atoms = c.atoms;
  if (all.some((v) => v.order !== 1) || atoms.some((a) => n.q[a] || n.lambda(a))) return undefined;
  const info = n.ringInfo(atoms);
  if (info.bridged || info.assembly) return undefined;
  let name: string, labels: string[] | undefined;
  if (info.fused) {
    const f = info.fused;
    if (f.mono !== undefined || f.tpl.odd || f.d.length || f.tpl.uncited?.length || f.tpl.bridges || f.tpl.hydrogens) return undefined;
    name = f.tpl.name;
    labels = f.tpl.labels;
  } else if (info.ring) name = (info.ring.hydrogen ?? "") + info.ring.name;
  else {
    if (atoms.some((a, k) => n.ord(a, atoms[(k + 1) % atoms.length]) !== 1)) return undefined;
    name = `cyclo${chainStem(atoms.length, [], [], true)}`;
  }
  if (atoms.some((a) => n.adj[a].some((b) => atoms.includes(b) && n.cipBond.get(n.key(a, b))))) return undefined;
  const loc = (num: number[], a: number) => num.indexOf(a) + 1, label = (num: number[], a: number) => (labels ? labels[num.indexOf(a)] : String(loc(num, a)));
  const pre = subsOf(n, atoms, partner);
  let nums = info.numberings;
  nums = n.lowest(nums, (num) => all.map((v) => loc(num, v.at)));
  if (!central) nums = n.lowest(nums, (num) => out.map((v) => loc(num, v.at)));
  nums = n.lowest(nums, (num) => pre.map(({ a }) => loc(num, a)));
  const named = pre.map(({ a, x }) => ({ a, name: prefixOf(n, a, x) }));
  for (const t of [...new Set(named.map((p) => p.name.text))].sort((p, q) => alphaKey(p).localeCompare(alphaKey(q)))) nums = n.lowest(nums, (num) => named.filter((p) => p.name.text === t).map(({ a }) => loc(num, a)));
  const num = nums[0];
  if (atoms.some((a) => n.cip[a] && n.cip[a] !== "R" && n.cip[a] !== "S")) return undefined;
  const stereo = atoms.filter((a) => n.cip[a]).sort((a, b) => loc(num, a) - loc(num, b)).map((a) => `${label(num, a)}${n.cip[a]}`);
  const order = [...out].sort((x, y) => loc(num, x.at) - loc(num, y.at));
  const ls = [...(back ? [back] : []), ...order];
  if (central) ls.sort((x, y) => loc(num, x.at) - loc(num, y.at));
  const locs = ls.map((v) => label(num, v.at)).join(",");
  const prefixText = assemblePrefixes(named.map((p) => ({ loc: label(num, p.a), name: p.name })), false);
  const body = name === "benzene" && all.length === 2 ? `${locs}-phenylene` : `${name}-${locs}-${MULT[all.length]}yl`;
  return { text: (stereo.length ? `(${stereo.join(",")})-` : "") + joinPrefixes(prefixText, body), order, plain: !named.length && !stereo.length };
}
