// Octet's IUPAC namer: substitutive names from a molecular graph, following the IUPAC 2013 recommendations
// (Nomenclature of Organic Chemistry, P-1 to P-6). Clean room: written from the published rules. It names what it
// understands and returns undefined for the rest; the app also checks every name by reading it back with OPSIN.
//
// Covered: acyclic chains of any length; monocyclic rings (carbocycles, benzene, retained names, Hantzsch–Widman and
// replacement names for any ring of C and the elements in HW (N, O, S, P, Si, B, Se and others), with indicated and
// added hydrogen, hydro prefixes and λ for S and P oxides); ylidene prefixes;
// fused ring systems with retained names (naphthalene, indole, quinoline and others) with indicated hydrogen, added
// hydrogen and hydro prefixes; ring assemblies of two identical rings (1,1'-biphenyl); principal characteristic groups
// (carboxylic and sulfonic acids, esters, acid halides, amides, nitriles, aldehydes, ketones, alcohols, thiols,
// amines, imines and oximes) as suffixes; everything else as prefixes, nested to any depth; anhydrides, ureas,
// carbamates (also as prefixes: Boc-glycine); phosphanes and their oxides; anions (-oate, -olate, -ide), cations
// (aminium, ring "-ium", -ylium, diazonium, iminium, onium, pyrylium) and zwitterions (P-7); salts, hydrates and
// hydrochlorides; lone atoms, parent hydrides and inorganic species; bicyclic von Baeyer and monospiro rings with
// oxa, thia and aza replacement, adamantane and cubane; R/S and E/Z. Fused systems outside the table, bridged fused
// systems and spiro unions with a polycyclic component get their names from fusion.ts, other polycyclic von Baeyer
// systems from vonbaeyer.ts. Not yet: larger ring assemblies, radicals and other charged atoms. Octet's own name
// tables cover some of these (naming.ts). Structures with metal atoms are named in metals.ts; groups built on N, O,
// S, P and the halogens in namer-hetero.ts.
import type { Graph } from "./naming.ts";
import { fusedParent } from "./fusion.ts";
import { vonBaeyer } from "./vonbaeyer.ts";
import { ELEMENTS, isMetal, metalName, MORE_CATIONS, METAL_ANIONS, type MetalApi } from "./metals.ts";
import { chalcogenIonSuffix, chalcogenOne, chalcogenStem, chargeSeparated, checkChalcogenOnes, citedNuclides, isotopePrefix, isotopeSpecies, isotopeText, inorganicSpecies, NUCLIDE } from "./namer-maingroup.ts";
import { multiplicativeEster, multiplicativeName, multiplicativeUrea, phenylene, polyolDiyl } from "./namer-multiplicative.ts";
import { amideHetero, groupVariant, heteroAmine, heteroBond, heteroCharged, heteroParentName, heteroPrefix, hydrazinyl, nOxideN, nOxides, oxideText, perceiveHetero, perceiveIodanes, suffixStereo, sulfonamideN, sulfonateName, thioAcyl, thioDouble, thioPrefix, variantSuffix } from "./namer-hetero.ts";

type Name = { text: string; compound: boolean }; // compound: needs brackets when cited as a prefix

// Numerical terms (P-14.2.1), for chains and multiplying prefixes of any length: 11 undeca, 21 henicosa, 22 docosa,
// 31 hentriaconta, 101 henhecta.
function numeral(n: number): string {
  if (n < 10) return ["", "mono", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona"][n];
  const u = n % 10, t = Math.floor(n / 10) % 10, h = Math.floor(n / 100) % 10;
  const unit = u === 1 ? (t === 1 ? "un" : "hen") : u === 2 ? "do" : ["", "", "", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona"][u];
  const ten = t === 2 ? (/[aeiou]$/.test(unit) ? "cosa" : "icosa") : ["", "deca", "", "triaconta", "tetraconta", "pentaconta", "hexaconta", "heptaconta", "octaconta", "nonaconta"][t];
  return unit + ten + ["", "hecta", "dicta", "tricta", "tetracta", "pentacta", "hexacta", "heptacta", "octacta", "nonacta"][h];
}
const STEMS = Array.from({ length: 1000 }, (_, n) => (n < 5 ? ["", "meth", "eth", "prop", "but"][n] : numeral(n).replace(/a$/, "")));
const MULT = Array.from({ length: 1000 }, (_, n) => (n < 2 ? "" : numeral(n)));
const MULT_COMPLEX = Array.from({ length: 1000 }, (_, n) => (n < 2 ? "" : n === 2 ? "bis" : n === 3 ? "tris" : `${numeral(n)}kis`));
const HALO: Record<string, string> = { F: "fluoro", Cl: "chloro", Br: "bromo", I: "iodo" };
const VOWEL = /^[aeiouy]/;

// Principal characteristic groups, most senior first (P-41).
// Carbamates are esters and ureas amides of carbonic acid (P-65.2.1, P-66.1.6); halides are acid halides.
// Carbonic acid derivatives rank as the acids, esters, halides and amides they are, each after the carboxylic one:
// carbonic (carbamic acid), carbamate (carbamates, carbonates), carbonylhalide (carbamoyl chloride), urea.
// Anions, then cations (aminium and the rest), are senior to every neutral group (P-41, P-72, P-73).
// Imidic acids, their esters and halides, and amidines and guanidines (amides of imidic acids, P-65.1.3.1,
// P-66.4.1), each after its oxo analogue; peroxy acids, their esters and diacyl peroxides likewise (P-65.1.4).
// The Se and Te acids follow the sulfonic acids, and selenols and tellurols follow thiols. Sulfonate esters and
// sulfonamides follow the carbonic ones, as sulfonic acids follow carbonic acid.
type Ion = "ide" | "carboxylate" | "peroxoate" | "sulfonateion" | "sulfinate" | "olate" | "aminide" | "ylium" | "iminium" | "diazonium";
const ANION_KINDS: Ion[] = ["ide", "carboxylate", "peroxoate", "sulfonateion", "sulfinate", "olate", "aminide"];
type Kind = Ion | "aminium" | "acid" | "peroxy" | "imidic" | "carbonic" | "sulfonic" | "selenonic" | "seleninic" | "telluronic" | "tellurinic" | "anhydride" | "peroxide" | "ester" | "peroxyester" | "imidate" | "carbamate" | "sulfonate" | "halide" | "imidoylhalide" | "carbonylhalide" | "sulfonylhalide" | "amide" | "amidine" | "urea" | "guanidine" | "sulfonamide" | "hydrazide" | "nitrile" | "aldehyde" | "ketone" | "alcohol" | "thiol" | "selenol" | "tellurol" | "amine" | "imine";
const SENIORITY: Kind[] = [...ANION_KINDS, "aminium", "ylium", "iminium", "diazonium", "acid", "peroxy", "imidic", "carbonic", "sulfonic", "selenonic", "seleninic", "telluronic", "tellurinic", "anhydride", "peroxide", "ester", "peroxyester", "imidate", "carbamate", "sulfonate", "halide", "imidoylhalide", "carbonylhalide", "sulfonylhalide", "amide", "amidine", "urea", "guanidine", "sulfonamide", "hydrazide", "nitrile", "aldehyde", "ketone", "alcohol", "thiol", "selenol", "tellurol", "amine", "imine"];
// Groups whose carbon is counted in a chain name (propanoic acid) but cited as "carbo…" on a ring (cyclohexanecarboxylic acid).
const CARBON_GROUP = new Set<Kind>(["acid", "peroxy", "imidic", "anhydride", "ester", "peroxyester", "imidate", "halide", "imidoylhalide", "amide", "amidine", "hydrazide", "nitrile", "aldehyde", "carboxylate", "peroxoate"]);
const HALIDE: Record<string, string> = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" };
// Cations of salts (P-65.6.2.2) and their charges.
const CATIONS: Record<string, [string, number]> = { Li: ["lithium", 1], Na: ["sodium", 1], K: ["potassium", 1], Rb: ["rubidium", 1], Cs: ["caesium", 1], Ag: ["silver", 1],
  Mg: ["magnesium", 2], Ca: ["calcium", 2], Sr: ["strontium", 2], Ba: ["barium", 2], Zn: ["zinc", 2], ...MORE_CATIONS };
// Inorganic anions (IUPAC 2005, IR-5 and IR-8), by their atoms (with hydrogens) and charge. Every name is read back.
const ANIONS: Record<string, string> = {
  "F-1": "fluoride", "Cl-1": "chloride", "Br-1": "bromide", "I-1": "iodide", "H-1": "hydride", "HO-1": "hydroxide", "O-2": "oxide", "S-2": "sulfide",
  "CO3-2": "carbonate", "CHO3-1": "hydrogencarbonate", "O4S-2": "sulfate", "HO4S-1": "hydrogensulfate", "O3S-2": "sulfite", "HO3S-1": "hydrogensulfite",
  "O3S2-2": "thiosulfate", "NO3-1": "nitrate", "NO2-1": "nitrite", "O4P-3": "phosphate", "HO4P-2": "hydrogenphosphate", "H2O4P-1": "dihydrogenphosphate",
  "N3-1": "azide", "CN-1": "cyanide", "CNS-1": "thiocyanate", "ClO4-1": "perchlorate", "ClO-1": "hypochlorite", "IO4-1": "periodate",
  "MnO4-1": "permanganate", "BF4-1": "tetrafluoroborate", "F6P-1": "hexafluorophosphate", "BH4-1": "tetrahydroborate",
  "AlH4-1": "tetrahydroaluminate", ...METAL_ANIONS,
};

// Rings Octet knows by name. key: size, then a (aromatic) or s (saturated), then heteroatoms with their lowest locants.
type Ring = { name: string; stem: string; aromatic: boolean; hydrogen?: string };
const RINGS: Record<string, Ring> = {
  "6a:": { name: "benzene", stem: "phenyl", aromatic: true },
  "6a:N1": { name: "pyridine", stem: "pyridin", aromatic: true },
  "6a:N1,N2": { name: "pyridazine", stem: "pyridazin", aromatic: true },
  "6a:N1,N3": { name: "pyrimidine", stem: "pyrimidin", aromatic: true },
  "6a:N1,N4": { name: "pyrazine", stem: "pyrazin", aromatic: true },
  "6a:N1,N3,N5": { name: "1,3,5-triazine", stem: "1,3,5-triazin", aromatic: true },
  "5a:O1": { name: "furan", stem: "furan", aromatic: true },
  "5a:S1": { name: "thiophene", stem: "thiophen", aromatic: true },
  "5a:N1": { name: "pyrrole", stem: "pyrrol", aromatic: true, hydrogen: "1H-" },
  "5a:N1,N3": { name: "imidazole", stem: "imidazol", aromatic: true, hydrogen: "1H-" },
  "5a:N1,N2": { name: "pyrazole", stem: "pyrazol", aromatic: true, hydrogen: "1H-" },
  "5a:O1,N3": { name: "1,3-oxazole", stem: "1,3-oxazol", aromatic: true },
  "5a:S1,N3": { name: "1,3-thiazole", stem: "1,3-thiazol", aromatic: true },
  "5a:O1,N2": { name: "1,2-oxazole", stem: "1,2-oxazol", aromatic: true },
  "5a:S1,N2": { name: "1,2-thiazole", stem: "1,2-thiazol", aromatic: true },
  "6s:N1": { name: "piperidine", stem: "piperidin", aromatic: false },
  "6s:O1": { name: "oxane", stem: "oxan", aromatic: false },
  "6s:S1": { name: "thiane", stem: "thian", aromatic: false },
  "6s:N1,N4": { name: "piperazine", stem: "piperazin", aromatic: false },
  "6s:O1,N4": { name: "morpholine", stem: "morpholin", aromatic: false },
  "6s:O1,O4": { name: "1,4-dioxane", stem: "1,4-dioxan", aromatic: false },
  "6s:O1,O3": { name: "1,3-dioxane", stem: "1,3-dioxan", aromatic: false },
  "5s:N1": { name: "pyrrolidine", stem: "pyrrolidin", aromatic: false },
  "5s:O1": { name: "oxolane", stem: "oxolan", aromatic: false },
  "5s:S1": { name: "thiolane", stem: "thiolan", aromatic: false },
  "5s:O1,O3": { name: "1,3-dioxolane", stem: "1,3-dioxolan", aromatic: false },
  "4s:O1": { name: "oxetane", stem: "oxetan", aromatic: false },
  "4s:N1": { name: "azetidine", stem: "azetidin", aromatic: false },
  "3s:O1": { name: "oxirane", stem: "oxiran", aromatic: false },
  "3s:N1": { name: "aziridine", stem: "aziridin", aromatic: false },
};
// Ring cations named as a whole (P-73.1.1.2): an aromatic six-membered ring with O+ or S+.
const ION_RINGS: Record<string, Ring> = { "6a:O1": { name: "pyrylium", stem: "", aromatic: true }, "6a:S1": { name: "thiopyrylium", stem: "", aromatic: true },
  "6a:Se1": { name: "selenopyrylium", stem: "", aromatic: true }, "6a:Te1": { name: "telluropyrylium", stem: "", aromatic: true } };
const HETERO_ORDER = ["O", "S", "N"]; // heteroatoms in order of seniority for low locants (P-31.1.4.2.4)
// The same for von Baeyer and spiro systems, which may hold P and As too (the cage of P4O10): O > S > N > P > As.
const BRIDGE_ORDER = [...HETERO_ORDER, "P", "As"];
// Hantzsch–Widman prefixes in order of seniority (P-22.2.2.1.1, P-22.2.2.1.3).
// A ring is named only with elements perceive() accepts.
// They are also the replacement prefixes of von Baeyer and large rings (P-15.4), in the same order.
const HW: Record<string, string> = { F: "fluora", Cl: "chlora", Br: "broma", I: "ioda", O: "oxa", S: "thia", Se: "selena", Te: "tellura", N: "aza", P: "phospha", As: "arsa", Sb: "stiba", Bi: "bisma", Si: "sila", Ge: "germa", Sn: "stanna", Pb: "plumba", B: "bora", Al: "aluma", Ga: "galla", In: "indiga", Tl: "thalla", Hg: "mercura" };
const HW_ORDER = Object.keys(HW);
// Ring atoms with two bonds (no double bond in the mancude ring), and the six-membered ring endings by the last
// heteroatom cited (P-22.2.2.1.2): 6A ine/ane, 6B ine/inane, the rest inine/inane.
const DIVALENT = new Set(["O", "S", "Se", "Te", "Hg"]);
// Ring atoms that take =O by the λ-convention (P-14.1.3).
const LAMBDA = new Set(["S", "Se", "Te", "P", "As", "Sb", "Bi"]);
const SIX_A = new Set(["O", "S", "Se", "Te", "Bi", "Hg"]), SIX_B = new Set(["N", "Si", "Ge", "Sn", "Pb"]);
// Retained names of monocycles not in RINGS (P-22.2.1), by size and heteroatom locants: saturated and mancude.
const SATURATED: Record<string, string> = { "5:N1,N2": "pyrazolidine", "5:N1,N3": "imidazolidine", "5:N1": "pyrrolidine", "6:N1": "piperidine", "6:N1,N4": "piperazine", "6:O1,N4": "morpholine" };
const MANCUDE: Record<string, string> = {
  "5:N1": "pyrrole", "5:N1,N2": "pyrazole", "5:N1,N3": "imidazole", "5:O1": "furan", "5:S1": "thiophene", "6:N1": "pyridine",
  "6:N1,N2": "pyridazine", "6:N1,N3": "pyrimidine", "6:N1,N4": "pyrazine", "6:O1": "pyran", "6:S1": "thiopyran",
  "5:Se1": "selenophene", "5:Te1": "tellurophene",
};
// A Hantzsch–Widman name (P-22.2.2.1) from the ring's elements by locant: prefixes in order of seniority, multiplied,
// then the ending for the ring size, the final "a" elided before a vowel. Locants are left out for one heteroatom and
// where every atom but one is the same heteroatom (oxane, 1H-tetrazole).
function hwName(els: string[], saturated: boolean, lam: string[] = []): string {
  const join = (a: string, b: string) => (/a$/.test(a) && /^[aeiou]/.test(b) ? a.slice(0, -1) : a) + b;
  const present = HW_ORDER.filter((e) => els.includes(e)), size = els.length, hasN = present.includes("N"), last = present[present.length - 1];
  const locs = present.flatMap((e) => els.flatMap((x, k) => (x === e ? [k + 1] : [])));
  // A multiplying prefix loses its "a" only before another "a": tetrazole, but tetraoxane.
  const stem = present.reduce((t, e) => { const n = els.filter((x) => x === e).length; return join(t, MULT[n].replace(/a$/, /^a/.test(HW[e]) ? "" : "a") + HW[e]); }, "");
  const ends: [string, string] = size === 3 ? (hasN ? ["irine", "iridine"] : ["irene", "irane"]) : size === 4 ? ["ete", hasN ? "etidine" : "etane"]
    : size === 5 ? ["ole", hasN ? "olidine" : "olane"] : size === 6 ? (SIX_A.has(last) ? ["ine", "ane"] : SIX_B.has(last) ? ["ine", "inane"] : ["inine", "inane"])
    : [["epine", "epane"], ["ocine", "ocane"], ["onine", "onane"], ["ecine", "ecane"]][size - 7] as [string, string];
  // λ-atoms (P-14.1.3) carry their λ in the locants: 1λ⁶,4-thiazinane; with no locants, in front: 1λ⁶-thiolane.
  const bare = locs.length === 1 || (present.length === 1 && locs.length >= size - 1);
  const cited = bare ? locs.filter((l) => lam[l - 1]) : locs;
  return (cited.length ? `${cited.map((l) => `${l}${lam[l - 1] ?? ""}`).join(",")}-` : "") + join(stem, ends[saturated ? 1 : 0]);
}
// The subsets of l with k members, in order of lowest locants (l in locant order).
function subsets(l: number[], k: number): number[][] {
  if (!k) return [[]];
  return l.flatMap((a, i) => subsets(l.slice(i + 1), k - 1).map((s) => [a, ...s]));
}

// Fused ring parents (P-25.1, P-25.2.1). Each skeleton is its ring bonds by locant; atoms are kept in locant order
// (4 < 4a < 5), so index order is locant order. Each name gives its heteroatoms by locant. Indicated hydrogen is
// worked out from the structure (1H-indole, 9H-purine), so names here are without it.
const SKELETONS: Record<string, string> = {
  naphthalene: "1-2 2-3 3-4 4-4a 4a-5 5-6 6-7 7-8 8-8a 8a-1 4a-8a",
  indene: "1-2 2-3 3-3a 3a-4 4-5 5-6 6-7 7-7a 7a-1 3a-7a",
  anthracene: "1-2 2-3 3-4 4-4a 4a-10 10-10a 10a-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 8a-10a",
  phenazine: "1-2 2-3 3-4 4-4a 4a-5 5-5a 5a-6 6-7 7-8 8-9 9-9a 9a-10 10-10a 10a-1 4a-10a 5a-9a",
  phenanthrene: "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-10 10-10a 10a-1 4a-10a 4b-8a",
  fluorene: "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 4b-8a",
  purine: "1-2 2-3 3-4 4-5 5-6 6-1 5-7 7-8 8-9 9-4",
};
const FUSED_NAMES: [string, string, string][] = [
  ["naphthalene", "naphthalene", ""], ["naphthalene", "quinoline", "N1"], ["naphthalene", "isoquinoline", "N2"],
  ["naphthalene", "quinazoline", "N1 N3"], ["naphthalene", "quinoxaline", "N1 N4"], ["naphthalene", "cinnoline", "N1 N2"],
  ["naphthalene", "phthalazine", "N2 N3"], ["naphthalene", "1,5-naphthyridine", "N1 N5"], ["naphthalene", "1,6-naphthyridine", "N1 N6"],
  ["naphthalene", "1,7-naphthyridine", "N1 N7"], ["naphthalene", "1,8-naphthyridine", "N1 N8"], ["naphthalene", "2,6-naphthyridine", "N2 N6"],
  ["naphthalene", "2,7-naphthyridine", "N2 N7"], ["naphthalene", "pteridine", "N1 N3 N5 N8"],
  ["naphthalene", "1-benzopyran", "O1"], ["naphthalene", "2-benzopyran", "O2"],
  ["indene", "indene", ""], ["indene", "indole", "N1"], ["indene", "isoindole", "N2"], ["indene", "1-benzofuran", "O1"],
  ["indene", "2-benzofuran", "O2"], ["indene", "1-benzothiophene", "S1"], ["indene", "2-benzothiophene", "S2"],
  ["indene", "indazole", "N1 N2"], ["indene", "benzimidazole", "N1 N3"], ["indene", "1,3-benzoxazole", "O1 N3"],
  ["indene", "1,3-benzothiazole", "S1 N3"], ["indene", "1,2-benzoxazole", "O1 N2"], ["indene", "1,2-benzothiazole", "S1 N2"],
  ["anthracene", "anthracene", ""], ["anthracene", "acridine", "N10"], ["phenazine", "phenazine", "N5 N10"],
  ["anthracene", "xanthene", "O10"], ["anthracene", "thioxanthene", "S10"], ["phenazine", "phenoxazine", "O5 N10"],
  ["phenazine", "phenothiazine", "S5 N10"],
  ["phenanthrene", "phenanthrene", ""], ["fluorene", "fluorene", ""], ["fluorene", "carbazole", "N9"],
  ["purine", "purine", "N1 N3 N7 N9"],
  // Benzo names with Se, Te and B (P-25.2.2.4): ebselen is 2-phenyl-1,2-benzoselenazol-3(2H)-one, tavaborole
  // 5-fluoro-1,3-dihydro-2,1-benzoxaborol-1-ol, catechol boronates 2-phenyl-1,3,2-benzodioxaborole.
  ["indene", "1-benzoselenophene", "Se1"], ["indene", "2-benzoselenophene", "Se2"], ["indene", "1-benzotellurophene", "Te1"],
  ["indene", "1,3-benzoselenazole", "Se1 N3"], ["indene", "1,2-benzoselenazole", "Se1 N2"], ["indene", "2,1,3-benzoselenadiazole", "N1 Se2 N3"],
  ["indene", "1,3,2-benzodioxaborole", "O1 B2 O3"], ["indene", "2,1-benzoxaborole", "B1 O2"],
];
// Ring atoms that can take a double bond in a mancude ring (C, N, and P, As, Sb, Si, Ge, Sn, B as in phosphinine). A
// cationic O, S, Se or Te can too (phenothiazin-5-ium); fusedInfo() adds those. O, S, Se and Te otherwise cannot.
const PI_ATOMS = new Set(["C", "N", "P", "As", "Sb", "Si", "Ge", "Sn", "B"]);
// Locant order: 4 < 4a < 4b < 5.
const locOrder = (a: string, b: string) => parseInt(a) - parseInt(b) || (a < b ? -1 : a > b ? 1 : 0);
type Fused = { name: string; labels: string[]; el: string[]; adj: number[][]; order: number[]; bonds: number; formula: string; odd: boolean; uncited?: number[]; hydrogens?: number; bridges?: string };
const FUSED: Fused[] = FUSED_NAMES.map(([skeleton, name, hetero]) => skeletonTemplate(SKELETONS[skeleton], name, hetero));
// Adamantane, a retained von Baeyer name (P-23.7), numbered as tricyclo[3.3.1.1^3,7]decane; any ring atoms (*).
const ADAMANTANE = { ...skeletonTemplate("1-2 2-3 3-4 4-5 5-6 6-7 7-8 8-1 1-9 9-5 3-10 10-7", "adamantane", ""), el: Array(10).fill("*") };
function skeletonTemplate(skeleton: string, name: string, hetero: string): Fused {
  const pairs = skeleton.split(" ").map((b) => b.split("-"));
  const labels = [...new Set(pairs.flat())].sort(locOrder);
  const el = labels.map(() => "C");
  for (const h of hetero.split(" ").filter(Boolean)) { const e = h.match(/^[A-Z][a-z]?/)![0]; el[labels.indexOf(h.slice(e.length))] = e; }
  const adj = labels.map(() => [] as number[]);
  for (const [a, b] of pairs) { adj[labels.indexOf(a)].push(labels.indexOf(b)); adj[labels.indexOf(b)].push(labels.indexOf(a)); }
  // Search order: each atom after the first is bonded to one already placed.
  const order = [0];
  for (let k = 0; k < order.length; k++) for (const j of adj[order[k]]) if (!order.includes(j)) order.push(j);
  const cn = el.filter((e) => PI_ATOMS.has(e)).length;
  return { name, labels, el, adj, order, bonds: pairs.length, formula: [...el].sort().join(""), odd: cn % 2 === 1 };
}
// A fused system in a molecule: the parent's numberings (atom at each locant), its C and N atoms, those with no ring
// double bond (d), and its ring bonds.
// A monocycle named from its mancude ring has the same shape, with mono: the number of indicated hydrogens its parent needs.
// dehydro: ring triple bonds, each a double bond of the parent made triple (didehydro).
type FusedSys = { tpl: Fused; nums: number[][]; cn: number[]; d: number[]; ring: (a: number) => number[]; mono?: number; dehydro?: [number, number][] };
// Indicated hydrogen (x, or xs), added hydrogen (y, or ys, cited with the ketone yOn) and hydro prefixes, in one numbering.
type Saturation = { x?: number; y?: number; yOn?: number; hydro: number[]; xs?: number[]; ys?: number[] };
// A von Baeyer or spiro ring system: its descriptor (bicyclo[2.2.1], spiro[4.5]), numberings, and ring bonds.
type Bridged = { prefix: string; nums: number[][]; bonds: [number, number][]; retained?: string };
// Replacement prefixes for ring heteroatoms (P-15.4), in order of citation.
const REPLACE = Object.entries(HW);
// A ring assembly (P-28): two identical rings and the single bond joining them.
type Assembly = { rings: [number[], number[]]; junction: [number, number] };
// A parent: a chain or ring (or ring assembly), a hydrazine or diazene (hetero), or a chain whose carboxylic groups hang
// on it as "carbo…" suffixes (attached: propane-1,2,3-tricarboxylic acid).
type Parent = { atoms: number[]; ring: boolean; assembly?: Assembly; hetero?: string; attached?: boolean };
const HYDRO = [...MULT, "undeca", "dodeca", "trideca", "tetradeca"];

// Retained names used in preferred IUPAC names (P-65, P-66, P-63): parent ring or chain, principal group, name.
const RETAINED: Record<string, string> = {
  "benzene:acid": "benzoic acid", "benzene:ester": "benzoate", "benzene:amide": "benzamide", "benzene:nitrile": "benzonitrile",
  "benzene:aldehyde": "benzaldehyde", "benzene:alcohol": "phenol", "benzene:amine": "aniline",
  "C2:acid": "acetic acid", "C2:ester": "acetate", "C2:amide": "acetamide", "C2:nitrile": "acetonitrile", "C2:aldehyde": "acetaldehyde",
  "C1:acid": "formic acid", "C1:ester": "formate", "C1:amide": "formamide", "C1:aldehyde": "formaldehyde",
  "benzene:anhydride": "benzoic acid", "C2:anhydride": "acetic acid", "C1:anhydride": "formic acid",
  "benzene:halide": "benzoyl", "C2:halide": "acetyl", "C1:halide": "formyl",
  "benzene:hydrazide": "benzohydrazide", "C2:hydrazide": "acetohydrazide", "C1:hydrazide": "formohydrazide",
  "benzene:carboxylate": "benzoate", "C2:carboxylate": "acetate", "C1:carboxylate": "formate", "benzene:olate": "phenolate", "benzene:aminide": "anilinide",
};

// Main-group elements beyond C, N, O, S, P and the halogens (P-21.1, P-68, P-69): parent hydride, substituent prefix,
// and standard bonding number; their ring prefixes are in HW. Mercury names like a parent hydride (dimethylmercury).
type Main = { hydride: string; yl: string; valence: number };
const MAIN: Record<string, Main> = {
  Si: { hydride: "silane", yl: "silyl", valence: 4 }, Ge: { hydride: "germane", yl: "germyl", valence: 4 },
  Sn: { hydride: "stannane", yl: "stannyl", valence: 4 }, Pb: { hydride: "plumbane", yl: "plumbyl", valence: 4 },
  B: { hydride: "borane", yl: "boranyl", valence: 3 }, Al: { hydride: "alumane", yl: "alumanyl", valence: 3 },
  Ga: { hydride: "gallane", yl: "gallanyl", valence: 3 }, In: { hydride: "indigane", yl: "indiganyl", valence: 3 },
  Tl: { hydride: "thallane", yl: "thallanyl", valence: 3 }, As: { hydride: "arsane", yl: "arsanyl", valence: 3 },
  Sb: { hydride: "stibane", yl: "stibanyl", valence: 3 }, Bi: { hydride: "bismuthane", yl: "bismuthanyl", valence: 3 },
  Se: { hydride: "selane", yl: "selanyl", valence: 2 }, Te: { hydride: "tellane", yl: "tellanyl", valence: 2 },
  Hg: { hydride: "mercury", yl: "mercurio", valence: 2 },
};
const RING_BEARERS = new Set(["N", "P", "As", "Sb", "B", "Si", "Ge", "Sn"]);
const CHALCOGEN = new Set(["Se", "Te"]), CHALCOGENS = new Set(["O", "S", "Se", "Te"]);
// The bonding number of a main-group atom with a charge (P-73, P-72): B⁻ and As⁺ four (boranuide, arsanium), As⁻
// two (1H-arsol-1-ide), Si⁻ three, Se⁺ three (selenopyrylium).
const bonding = (el: string, q: number) => { const v = MAIN[el].valence; return v === 3 && !["As", "Sb", "Bi"].includes(el) ? v - q : v === 4 ? v - Math.abs(q) : v + q; };
// These bond to each other (disilane, silylboranes); Se and Te bond to themselves (diselanes).
const CATENATE = new Set(["Si", "Ge", "Sn", "Pb", "B"]);
// Senior parent hydrides (P-44.1.2): the senior atom in this order, carbon last. Mercury, a metal, first.
const PARENT_ORDER = ["Hg", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Al", "Ga", "In", "Tl", "O", "S", "Se", "Te"];

class Namer {
  n: number; el: string[]; h: number[]; q: number[]; adj: number[][]; bond = new Map<string, number>();
  inRing: boolean[]; rings: number[][] = []; ringOf: number[];
  fused: boolean[] = []; fusedCache = new Map<number, FusedSys>(); // ring systems that are not a single cycle
  carbonylO: number[]; // the =O (or =S, a thio analogue) on each carbon, or -1
  cip: (string | undefined)[]; cipBond = new Map<string, string>(); // R/S on atoms, E/Z on double bonds
  iso: (number | undefined)[]; hx: number[][]; isotopic: boolean; // isotopes: each atom's mass number, its isotopic hydrogens' (P-82)
  group: (Kind | undefined)[] = []; // the characteristic group each atom carries or is (functional carbons, O, S, N)
  bearer = new Map<number, number[]>(); // a group's atom (O, S, N or functional C) → the carbons it hangs on
  esterO = new Map<number, number>(); // ester carbon (and carbamate carbon) → its single-bonded O
  sulfur = new Set<number>(); // sulfonyl and sulfinyl S, with their =O and any OH or halogen
  anhydrideO = new Map<number, number>(); // anhydride carbon → its bridging O
  phosphorus = new Set<number>(); // phosphane P, with the =O of a phosphane oxide
  main = new Set<number>(); // Si, B, Se, As and the like (MAIN), with the O and halogen atoms bonded to them
  pseudo = new Set<number>(); // the atoms of groups cited only as prefixes (isocyanato, cyanato), which are not carbon parents
  prefixOnly = new Map<number, string>(); // such a group's attachment atom → its prefix
  whole?: string; // the name of a molecule that is one such group with H: isocyanic acid, cyanic acid
  locants?: Map<number, string>; // the parent chain's or ring's atoms and their locants, as the name numbers them
  diimine = new Set<number>(); // carbodiimide carbons, R-N=C=N-R
  nO = new Set<number>(); // the O of N-hydroxy and N-alkoxy amides, ureas and carbamates
  hzN = new Set<number>(); // the N atoms of a hydrazine or diazene that is the parent of a carbonyl group on its N
  peroxO = new Set<number>(); // the O-O of peroxy acids, their esters and diacyl peroxides
  het = new Map<number, string>(); // atoms of groups built on N, O, S, P and the halogens, by role (namer-hetero.ts)
  ions = new Set<number>(); ionBonds = new Set<string>(); onium: number[] = []; azanide: number[] = []; // atoms named as ions, their hetero bonds, onium S, P, O, azanide N
  esterIon?: { x: number; word: string; ors: number[]; ohs: number }; // an ester anion of an inorganic acid: methyl sulfate

  // opaque: atoms that stand for a group named elsewhere (metals.ts: ferrocenyl), cited by that name and in no chain.
  opaque: Map<number, Name>;
  constructor(g: Graph, opaque = new Map<number, Name>()) {
    this.opaque = opaque;
    this.n = g.atoms.length;
    this.el = g.atoms.map((a) => a.el);
    this.h = g.atoms.map((a) => a.h);
    this.q = g.atoms.map((a) => a.charge);
    this.adj = g.atoms.map(() => []);
    for (const b of g.bonds) {
      this.adj[b.a].push(b.b);
      this.adj[b.b].push(b.a);
      this.bond.set(this.key(b.a, b.b), b.order);
      if (b.cip) this.cipBond.set(this.key(b.a, b.b), b.cip);
    }
    this.cip = g.atoms.map((a) => a.cip);
    this.iso = g.atoms.map((a) => a.iso);
    this.hx = g.atoms.map((a) => a.hx ?? []);
    this.isotopic = g.atoms.some((a) => a.iso || a.hx?.length);
    this.inRing = this.findRings();
    this.ringOf = Array(this.n).fill(-1);
    this.rings.forEach((r, k) => r.forEach((i) => (this.ringOf[i] = k)));
    // =Se and =Te too on an acid carbon, C(=Se)OH (P-65.1.5.1: selenoic O-acids); name() names those only as the
    // principal groups.
    const oh = (i: number) => this.adj[i].some((o) => this.el[o] === "O" && this.h[o] === 1 && this.adj[o].length === 1 && this.ord(i, o) === 1 && !this.q[o]);
    this.carbonylO = Array.from({ length: this.n }, (_, i) =>
      this.el[i] === "C" ? this.adj[i].find((o) => (this.el[o] === "O" || this.el[o] === "S" || ((this.el[o] === "Se" || this.el[o] === "Te") && this.adj[i].length === 3 && oh(i) && !this.h[o])) && this.ord(i, o) === 2 && this.adj[o].length === 1 && !this.q[o]) ?? -1 : -1);
  }
  key = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`);
  ord = (a: number, b: number) => this.bond.get(this.key(a, b)) ?? 0;
  carbons = (i: number, not: number[] = []) => this.adj[i].filter((j) => this.el[j] === "C" && !not.includes(j));

  // Rings: each ring bond lies on a cycle. Ring systems are single cycles (kept in cycle order) or fused systems.
  findRings(): boolean[] {
    const ringBond = (a: number, b: number) => {
      const seen = new Set([a]), stack = [a];
      while (stack.length) {
        const i = stack.pop()!;
        for (const j of this.adj[i]) {
          if ((i === a && j === b) || seen.has(j)) continue;
          if (j === b) return true;
          seen.add(j);
          stack.push(j);
        }
      }
      return false;
    };
    const inRing = Array(this.n).fill(false), edges: [number, number][] = [];
    for (const [k] of this.bond) {
      const [a, b] = k.split(" ").map(Number);
      if (ringBond(a, b)) { inRing[a] = inRing[b] = true; edges.push([a, b]); }
    }
    // Ring systems: each must be one simple cycle (as many ring bonds as ring atoms).
    const seen = new Set<number>();
    for (let s = 0; s < this.n; s++) {
      if (!inRing[s] || seen.has(s)) continue;
      const atoms: number[] = [], stack = [s];
      seen.add(s);
      while (stack.length) {
        const i = stack.pop()!;
        atoms.push(i);
        for (const [a, b] of edges) {
          const j = a === i ? b : b === i ? a : -1;
          if (j >= 0 && !seen.has(j)) { seen.add(j); stack.push(j); }
        }
      }
      const count = edges.filter(([a]) => atoms.includes(a)).length;
      this.fused.push(count !== atoms.length);
      if (count !== atoms.length) { this.rings.push(atoms); continue; }
      // Walk the cycle in order.
      const cycle = [atoms[0]];
      while (cycle.length < atoms.length) {
        const last = cycle[cycle.length - 1], prev = cycle[cycle.length - 2];
        const next = edges.map(([a, b]) => (a === last ? b : b === last ? a : -1)).find((j) => j >= 0 && j !== prev && !cycle.includes(j));
        if (next === undefined) throw new Error("ring walk");
        cycle.push(next);
      }
      this.rings.push(cycle);
    }
    return inRing;
  }

  // Characteristic groups (P-41). Throws for atoms Octet cannot yet name.
  perceive() {
    const { el, h, q, adj } = this;
    this.perceiveIons();
    for (let i = 0; i < this.n; i++) {
      if (!["C", "N", "O", "S", "P", "F", "Cl", "Br", "I"].includes(el[i]) && !MAIN[el[i]]) throw new Error(`element ${el[i]}`);
      if (this.mainIon(i)) continue; // an ion of a salt: trifluoro(phenyl)boranuide, tetraphenylarsanium
      if (q[i] && !this.nitroAtom(i) && !this.cationN(i) && !this.diazoAtom(i) && !this.azidoAtom(i) && !heteroCharged(this, i) && !this.ions.has(i)) throw new Error("charge");
    }
    for (let c = 0; c < this.n; c++) if (el[c] === "C") this.pseudoGroup(c); // first: isoselenocyanato and isocyanato on Si are not perceiveMain()'s
    this.perceiveMain();
    perceiveIodanes(this); // λ3-iodanyl, iodosyl (namer-hetero.ts)
    for (let c = 0; c < this.n; c++) {
      if (el[c] !== "C" || this.pseudo.has(c) || this.het.has(c) || this.group[c] || this.ions.has(c)) continue;
      // A ring N joined to a functional carbon outside its ring stands where a ring carbon would (P-66.1.1.4.3, P-64.1.2):
      // piperidine-1-carboxylic acid, tert-butyl azetidine-1-carboxylate, 1-(piperidin-1-yl)ethan-1-one.
      const o = this.carbonylO[c], cs = [...this.carbons(c), ...this.ringN(c)];
      const others = adj[c].filter((j) => j !== o && !cs.includes(j));
      const nitrileN = adj[c].find((j) => el[j] === "N" && this.ord(c, j) === 3 && adj[j].length === 1);
      if (nitrileN !== undefined) {
        // Cyanamide, cyanic acid and carbononitridic halides and azide (P-66.5.1.1): N#C on N, OH, halogen or N3, with no carbon.
        const y = others.find((j) => j !== nitrileN)!;
        if (!cs.length && others.length === 2 && !this.inRing[c] && this.ord(c, y) === 1 && !this.q[y] && ((HALO[el[y]] && adj[y].length === 1) || (el[y] === "O" && this.h[y] === 1 && adj[y].length === 1)
          || (el[y] === "N" && !this.inRing[y] && adj[y].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)))) || this.azidoAtom(y))) {
          this.mark(c, "nitrile", []);
          this.group[nitrileN] = "nitrile";
          this.group[y] ??= "nitrile"; // unless the N is a guanidine's (N-cyanoguanidine, cimetidine)
          continue;
        }
        if (!cs.length && others.length === 2 && el[others.find((j) => j !== nitrileN)!] === "P") continue; // a cyanide on P: namer-hetero.ts
        if (this.inRing[c] || cs.length > 1 || others.filter((j) => !CATENATE.has(el[j])).length !== 1 || others.length + cs.length > 2) throw new Error("nitrile"); // on C, or on Si: silanecarbonitrile
        this.mark(c, "nitrile", cs);
        this.group[nitrileN] = "nitrile";
        continue;
      }
      // Imines and oximes (P-62.3.1.1, P-68.3.1.1.1): C=N, the N bearing H, a carbon or an O (N-hydroxy, N-alkoxy).
      const n = this.imineN(c);
      if (n !== undefined) {
        const rest = others.filter((j) => j !== n);
        if (rest.length && o < 0 && !this.inRing[c]) { this.amidineGroup(c, n, cs, rest); continue; }
        // A ring imine, between ring carbons or ring heteroatoms alike, as a ring ketone is: 2H-pyran-2-imine.
        if (o >= 0 || rest.some((j) => !this.inRing[c] || this.ringOf[j] !== this.ringOf[c])) throw new Error("imine");
        this.mark(c, "imine", cs);
        this.group[n] = "imine";
        continue;
      }
      if (o < 0) continue;
      this.group[o] = "ketone"; // the =O belongs to whichever group its carbon is
      // A ring carbonyl is a ketone, between ring carbons or ring heteroatoms alike: lactams and lactones are named as
      // heterocyclic ketones (P-65.6.5, P-66.1.4): pyrrolidin-2-one, quinolin-2(1H)-one.
      if (this.inRing[c]) {
        if (!adj[c].every((j) => j === o || this.ringOf[j] === this.ringOf[c])) throw new Error("carbonyl");
        this.mark(c, "ketone", cs); // an OH, O-alkyl or halogen on its ring N: perceiveHetero(), 1-hydroxypyrrolidine-2,5-dione
        continue;
      }
      if (others.length === 0) {
        if (cs.length === 2) this.mark(c, "ketone", cs);
        else if (!this.inRing[c] && h[c] >= 1) this.mark(c, "aldehyde", cs);
        else if (cs.length === 1 && this.ord(c, cs[0]) === 2) this.mark(c, "ketone", cs); // a ketene: ethenone (P-64.1.1)
        else throw new Error("carbonyl");
        continue;
      }
      if (this.acylBridge(c, cs, others)) continue;
      const hz = others.length === 2 && !cs.length ? this.hydrazineN(c) : [];
      // A diazene and a hydrazide N on it (carbazone): diazenecarbohydrazide.
      const dz = hz.length === 2 ? hz.filter((n) => adj[n].some((j) => el[j] === "N" && this.ord(n, j) === 2)) : [];
      if (hz.length === 1 || (dz.length === 1 && this.hydrazideN(c, hz.find((n) => n !== dz[0])!) !== undefined)) { const n = dz[0] ?? hz[0]; this.hydrazineGroup(c, n, others.find((j) => j !== n)!); continue; }
      // Two diazenyl groups on C=O (carbodiazone): di(diazenyl)methanone, as bis(imidazol-1-yl)methanone is named.
      if (dz.length === 2) { this.mark(c, "ketone", []); continue; }
      if (hz.length === 2) {
        // Carbonic dihydrazide (P-66.3.1.1.3), H2N-NH-CO-NH-NH2, and nothing else on it.
        if (this.n !== 6 || hz.some((n) => adj[n].length !== 2 || adj[adj[n].find((j) => el[j] === "N")!].length !== 1 || adj[n].some((j) => this.ord(n, j) !== 1))) throw new Error("carbonic acid derivative");
        this.whole = "carbonic dihydrazide";
        for (const a of [c, o, ...hz, ...hz.map((n) => adj[n].find((j) => el[j] === "N")!)]) this.pseudo.add(a);
        continue;
      }
      // A nitro or nitroso group on formic acid's carbon is a prefix (P-65.1.8.2, which allows substituents other than those
      // P-65.1.8.1 lists): nitroformic acid, methyl nitroformate, sodium nitroformate. Not on formamide: OPSIN reads
      // nitroformamide as N-nitroformamide.
      const nitro = others.length === 2 && !cs.length && others.some((j) => el[j] === "O") ? others.find((j) => this.nitroAtom(j) || this.nitrosoAtom(j)) : undefined;
      if (others.length === 2 && !cs.length && nitro === undefined) { this.carbonicGroup(c, others); continue; }
      const xs = others.filter((j) => j !== nitro);
      if (this.inRing[c] || xs.length !== 1 || cs.length > 1) throw new Error("carbonyl");
      const x = xs[0];
      // Acid halides, and acid pseudohalides (P-65.5.3): benzoyl isothiocyanate.
      if ((HALO[el[x]] && adj[x].length === 1) || this.prefixOnly.has(x)) { this.mark(c, "halide", cs); this.group[x] = "halide"; continue; }
      const y = el[x] === "O" && adj[x].length === 2 ? adj[x].find((j) => j !== c)! : -1;
      if (y >= 0 && el[y] === "C" && this.carbonylO[y] >= 0 && !this.inRing[y]) { this.mark(c, "anhydride", cs); this.group[x] = "anhydride"; this.anhydrideO.set(c, x); continue; }
      // A nitro or nitroso group on a carbonyl carbon is a prefix on a ketone: 1-nitropropan-1-one, nitroso(phenyl)methanone;
      // a sulfonic acid or sulfonyl group is cited from it: 1-oxopentane-1-sulfonic acid, 1-(methanesulfonyl)propan-1-one.
      const sulfonyl = el[x] === "S" && !q[x] && !this.inRing[x] && adj[x].length === 4 && adj[x].filter((j) => this.isOxo(x, j)).length === 2;
      // So is a diazenyl group (P-68.3.1.3): 1-(phenyldiazenyl)ethan-1-one.
      const diazenyl = el[x] === "N" && !q[x] && !this.inRing[x] && adj[x].length === 2 && adj[x].some((j) => el[j] === "N" && this.ord(x, j) === 2 && !q[j] && !this.inRing[j]);
      if ((this.nitroAtom(x) || sulfonyl || diazenyl || this.nitrosoAtom(x)) && cs.length === 1) { this.mark(c, "ketone", cs); continue; }
      const peroxo = el[x] === "O" && el[o] === "O" && adj[x].length === 2 ? adj[x].find((j) => j !== c && el[j] === "O" && q[j] <= 0 && !this.inRing[j]) : undefined;
      if (peroxo !== undefined) { this.peroxyGroup(c, cs, x, peroxo); continue; }
      // -SH and -S-R in place of -OH and -O-R (P-65.1.5): thioic S-acids and S-esters.
      const r = adj[x].find((j) => j !== c);
      if ((el[x] === "O" || el[x] === "S") && h[x] === 1 && adj[x].length === 1) { this.mark(c, "acid", cs); this.group[x] = "acid"; }
      else if ((el[x] === "O" && adj[x].length === 2 && ((this.carbonylO[r!] < 0 && (el[r!] === "C" || this.silylEster(x))) || this.ringNO(x)))
        || (el[x] === "S" && adj[x].length === 2 && this.carbonylO[r!] < 0 && el[r!] === "C")) {
        this.mark(c, "ester", cs);
        this.esterO.set(c, x);
        this.group[x] = "ester";
      } else if (el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && adj[x].every((j) => j === c || CATENATE.has(el[j]) || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j) || amideHetero(this, j) || this.ringAmino(x, j))) {
        // N-acyl amides are imides (P-66.2.1.1): N-acetylacetamide. N-hydroxy amides are hydroxamic acids: N-hydroxyacetamide.
        this.mark(c, "amide", cs);
        this.group[x] = "amide";
        for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j);
      } else if (this.hydrazideN(c, x) !== undefined) {
        // Hydrazides (P-66.3.1): acetohydrazide, N'-phenylbenzohydrazide, pyridine-4-carbohydrazide.
        this.mark(c, "hydrazide", cs);
        this.group[x] = this.group[this.hydrazideN(c, x)!] = "hydrazide";
      } else if (!(el[x] === "O" && this.main.has(x))) throw new Error("carbonyl group"); // else acyloxy on B, Hg: a prefix
    }
    perceiveHetero(this); // N-N, N-O, O-O, S-S and N-halogen links (namer-hetero.ts)
    // Sulfonic acids, sulfonyl halides (P-65.3), and the S of sulfoxides and sulfones (P-63.6), which are prefixes.
    for (let i = 0; i < this.n; i++) {
      if (el[i] !== "S" || this.inRing[i] || this.het.has(i) || this.group[i] || this.sulfur.has(i)) continue;
      const os = adj[i].filter((j) => el[j] === "O" && this.ord(i, j) === 2 && adj[j].length === 1 && !q[j]);
      if (!os.length) continue;
      // =NH with one =O: sulfoximines (methanesulfonimidoyl) and sulfonimidic acids (P-65.3.1, P-63.6).
      const im = os.length === 1 ? adj[i].filter((j) => el[j] === "N" && this.ord(i, j) === 2 && !this.inRing[j] && !q[j] && adj[j].length === 1 && h[j] === 1) : [];
      const cs = this.carbons(i), rest = adj[i].filter((j) => !os.includes(j) && !cs.includes(j) && !im.includes(j));
      if (adj[i].some((j) => this.ord(i, j) === 2 && !os.includes(j) && !im.includes(j)) || cs.some((j) => (this.carbonylO[j] >= 0 && this.group[j] !== "ketone") || this.isNitrileC(j))) throw new Error("sulfur");
      if (os.length + im.length === 2 && cs.length === 1 && rest.length === 1 && el[rest[0]] === "O" && h[rest[0]] === 1 && adj[rest[0]].length === 1) this.mark(i, "sulfonic", cs);
      else if (os.length === 2 && cs.length === 1 && rest.length === 1 && HALO[el[rest[0]]] && adj[rest[0]].length === 1) this.mark(i, "sulfonylhalide", cs);
      else if (!(os.length + im.length <= 2 && cs.length === 2 && !rest.length)) throw new Error("sulfur");
      if (this.cip[i] && !(os.length === 1 && !im.length && cs.length === 2)) throw new Error("sulfur stereo"); // R/S on a sulfoxide: namer-hetero.ts
      this.sulfur.add(i);
      for (const j of [...os, ...im, ...rest]) this.sulfur.add(j);
    }
    // Phosphanes and phosphane oxides (P-68.3.2): P with three single bonds to carbon or hydrogen, and perhaps =O.
    for (let i = 0; i < this.n; i++) {
      if (el[i] !== "P" || this.het.has(i) || this.ions.has(i)) continue;
      // A ring P with three bonds (phosphinane, 1H-phosphole), or with =O too (1λ⁵-phospholan-1-one), is named with its
      // ring; an OH on it as on a ring N (phosphinan-1-ol, 2,3-dihydro-1H-1-benzophosphol-1-ol).
      if (this.inRing[i] && !q[i] && !this.cip[i] && adj[i].reduce((t, j) => t + this.ord(i, j), 0) + h[i] === (this.lambda(i) ? 5 : 3) && adj[i].every((j) => this.ringOf[j] === this.ringOf[i] || this.ringOxide(j) || (el[j] === "C" && this.ord(i, j) === 1) || this.isOH(j))) {
        for (const o of adj[i].filter((j) => this.isOH(j))) { this.het.set(o, "ON"); this.mark(o, "alcohol", [i]); }
        continue;
      }
      const os = adj[i].filter((j) => el[j] === "O" && this.ord(i, j) === 2 && adj[j].length === 1 && !q[j]), rest = adj[i].filter((j) => !os.includes(j));
      if (this.inRing[i] || q[i] || os.length > 1 || rest.length + h[i] !== 3 || rest.some((j) => el[j] !== "C" || this.ord(i, j) !== 1 || this.carbonylO[j] >= 0) || this.cip[i]) throw new Error("phosphorus");
      this.phosphorus.add(i);
      for (const j of os) this.phosphorus.add(j);
    }
    // =O on a ring S, Se, Te, P, As, Sb, Bi or halogen is a ketone on that atom (heterones, λ-convention):
    // 1λ⁶-thiolane-1,1-dione, 1λ⁴-selenophen-1-one; oxo as a prefix.
    for (let i = 0; i < this.n; i++) if (this.ringOxide(i) && this.lambda(this.adj[i][0])) this.mark(i, "ketone", [this.adj[i][0]]);
    for (let i = 0; i < this.n; i++) {
      if (this.group[i] || this.sulfur.has(i) || this.phosphorus.has(i) || this.pseudo.has(i) || this.het.has(i) || this.ions.has(i) || el[i] === "C" || this.inRing[i]) continue;
      if (this.main.has(i)) continue; // checked by perceiveMain
      const cs = this.carbons(i);
      if (HALO[el[i]]) { if (adj[i].length !== 1 || cs.length !== 1) throw new Error("halogen"); continue; }
      if (el[i] === "O" && adj[i].some((j) => this.group[j] === "imine") && adj[i].length - cs.length === 1 && adj[i].length <= 2) continue; // an oxime's O: N-hydroxy, N-alkoxy
      if (this.nO.has(i) || this.hzN.has(i) || this.peroxO.has(i)) continue;
      if (el[i] === "O") {
        if (adj[i].length === 1 && h[i] === 1 && cs.length === 1) this.mark(i, "alcohol", cs);
        else if (!(adj[i].length === 2 && cs.length === 2) && !this.nitroAtom(i)) throw new Error("oxygen");
      } else if (el[i] === "S") {
        if (adj[i].length === 1 && h[i] === 1 && cs.length === 1) this.mark(i, "thiol", cs);
        else if (!(adj[i].length === 2 && cs.length === 2)) throw new Error("sulfur");
      } else if (el[i] === "N") {
        if (this.nitroAtom(i) || this.diazoAtom(i) || this.azidoAtom(i)) continue;
        if (this.cationN(i)) {
          if (!cs.length || cs.some((j) => this.carbonylO[j] >= 0 || this.isNitrileC(j))) throw new Error("cation");
          this.mark(i, "aminium", cs);
          continue;
        }
        if (heteroAmine(this, i)) continue;
        if (cs.length !== adj[i].length || adj[i].some((j) => this.ord(i, j) !== 1) || cs.some((j) => this.carbonylO[j] >= 0 || this.isNitrileC(j))) throw new Error("nitrogen");
        this.mark(i, "amine", cs);
      }
    }
    // Ring heteroatoms are part of the ring's name, ring bonds between them too (pyrazole, cinnoline); any other
    // heteroatom bonded to another heteroatom is not covered.
    for (const [k, o] of this.bond) {
      const [a, b] = k.split(" ").map(Number);
      if ((this.inRing[a] && this.ringOf[a] === this.ringOf[b]) || (this.sulfur.has(a) && this.sulfur.has(b)) || heteroBond(this, a, b) || this.ionBonds.has(k)) continue;
      if (this.main.has(a) || this.main.has(b)) continue; // checked by perceiveMain
      const oxime = (x: number, y: number) => this.group[x] === "imine" && el[x] === "N" && el[y] === "O" && o === 1;
      const oxide = this.phosphorus.has(a) && this.phosphorus.has(b);
      const n2 = (this.diazoAtom(a) && this.diazoAtom(b)) || (this.azidoAtom(a) && this.azidoAtom(b));
      if (el[a] !== "C" && el[b] !== "C" && !this.nitroBond(a, b) && !oxime(a, b) && !oxime(b, a) && !oxide && !n2 && !this.classBond(a, b) && this.group[a] !== "ketone" && this.group[b] !== "ketone") throw new Error(`hetero bond ${el[a]}${o}${el[b]}`);
    }
  }
  // =O on a ring S, Se, Te, P, As, Sb, Bi or halogen, or =S on a ring P, As, Sb or Bi (a λ⁵ thione: the cage of P4S10).
  ringOxide(o: number): boolean {
    if ((this.el[o] !== "O" && this.el[o] !== "S") || this.q[o] || this.h[o] || this.adj[o].length !== 1) return false;
    const a = this.adj[o][0];
    if (this.el[o] === "S" && !["P", "As", "Sb", "Bi"].includes(this.el[a])) return false;
    return this.ord(a, o) === 2 && this.inRing[a] && (LAMBDA.has(this.el[a]) || !!HALO[this.el[a]]) && !this.q[a];
  }
  // The λ-convention (P-14.1.3): a ring S, Se or Te with one or two =O is λ⁴ or λ⁶ (1λ⁶-thiolane, 1λ⁴-selenophen-1-one),
  // a ring P, As, Sb or Bi with one =O λ⁵. A ring halogen always has a bonding number other than 1: 1λ³-bromole,
  // 1λ³,2-chlorazinane.
  lambda(a: number): string {
    if (HALO[this.el[a]]) return this.inRing[a] && !this.q[a] ? `λ${"⁰¹²³⁴⁵⁶⁷"[this.adj[a].reduce((t, j) => t + this.ord(a, j), 0) + this.h[a]] ?? ""}` : "";
    const k = this.inRing[a] ? this.adj[a].filter((j) => this.ringOxide(j)).length : 0;
    return !k ? "" : DIVALENT.has(this.el[a]) ? (k === 1 ? "λ⁴" : k === 2 ? "λ⁶" : "") : k === 1 ? "λ⁵" : "";
  }
  mark(i: number, kind: Kind, on: number[]) { this.group[i] = kind; this.bearer.set(i, on); }
  // Carbonic acid and its derivatives (P-65.2.1, P-66.1.6): a C=O or C=S carbon with no carbon, and two of OH, O-alkyl,
  // SH, S-alkyl, O-OH, N (not in a ring) and halogen. Carbonic and carbamic acids and their thio and peroxy analogues;
  // carbamates, carbonates and carbonochloridates; carbonyl dihalides and carbamoyl halides; ureas.
  carbonicGroup(c: number, ls: number[]) {
    const { el, adj } = this;
    const peroxy = new Map<number, number>(); // O-O: the second O of an O-OH, or of an O-O-C(=O) to another carbonic group
    const type = ls.map((x) => {
      if (HALO[el[x]] && adj[x].length === 1) return "X";
      if (CHALCOGENS.has(el[x]) && adj[x].length === 1 && this.h[x] === 1 && !this.q[x]) return "OH";
      const r = adj[x].find((j) => j !== c)!;
      if (el[x] === "O" && adj[x].length === 2 && (el[r] === "C" || this.ringNO(x))) return el[r] !== "C" || this.carbonylO[r] < 0 ? "OR" : this.inRing[r] ? "" : "OCO";
      if (CHALCOGENS.has(el[x]) && el[x] !== "O" && adj[x].length === 2 && !this.q[x] && !this.inRing[x] && el[r] === "C" && this.carbonylO[r] < 0 && !this.isNitrileC(r)) return "OR";
      if (el[x] === "O" && adj[x].length === 2 && el[r] === "O" && !this.inRing[r] && !this.q[r]) {
        const s = adj[r].find((j) => j !== x);
        if (s === undefined ? this.h[r] !== 1 : adj[r].length !== 2 || el[s] !== "C" || this.carbonylO[s] < 0 || this.carbons(s).length > 0 || this.inRing[s]) return "";
        peroxy.set(x, r);
        return s === undefined ? "OH" : "OCO";
      }
      if (el[x] === "N" && this.ord(c, x) === 1 && !this.q[x] && adj[x].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j) || amideHetero(this, j) || this.ringAmino(x, j))) return "N";
      return "";
    });
    if (type.includes("") || ls.some((x) => this.prefixOnly.has(x))) throw new Error("carbonic acid derivative");
    const kind: Kind = type.includes("OH") ? "carbonic" : type.includes("OR") || type.includes("OCO") ? "carbamate" : type.includes("X") ? "carbonylhalide" : "urea";
    this.mark(c, kind, []);
    ls.forEach((x, k) => { this.group[x] = kind; if (type[k] === "OR" && !this.esterO.has(c)) this.esterO.set(c, x); });
    for (const [x, r] of peroxy) { this.peroxO.add(x); this.peroxO.add(r); this.group[r] ??= kind; }
    for (const x of ls) if (el[x] === "N") for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j); // N-hydroxyurea
  }
  // A ring N on an amide or urea N: N-(2-methyl-2,3-dihydro-1H-indol-1-yl)benzamide (indapamide).
  ringAmino = (n: number, j: number) => this.el[j] === "N" && this.inRing[j] && !this.q[j] && this.ord(n, j) === 1 && this.el[n] === "N" && !this.inRing[n];
  // Two acyl groups (C=O or C=S) on one S, or on S-S (P-65.7.7, P-63.4.2.2): diacetyl sulfide, bis(dimethylcarbamothioyl)
  // disulfide (thiram). Named as diacyl peroxides are; marks c and the S atoms.
  acylBridge(c: number, cs: number[], others: number[]): boolean {
    const { el, adj } = this;
    const s = (x: number) => el[x] === "S" && !this.inRing[x] && !this.q[x] && adj[x].length === 2 && adj[x].every((j) => this.ord(x, j) === 1);
    const acyl = (r: number) => el[r] === "C" && r !== c && this.carbonylO[r] >= 0 && !this.inRing[r];
    for (const x of others) {
      if (!s(x) || cs.length + others.length > 2) continue;
      const r = adj[x].find((j) => j !== c)!, path = acyl(r) ? [x] : s(r) && acyl(adj[r].find((j) => j !== x)!) ? [x, r] : undefined;
      if (!path) continue;
      this.mark(c, "peroxide", cs);
      for (const j of [...others, ...path]) this.group[j] ??= "peroxide";
      for (const j of path) this.peroxO.add(j);
      return true;
    }
    return false;
  }
  // A nitroso group's N: N=O, the O bearing nothing else, neither charged.
  nitrosoAtom = (x: number) => this.el[x] === "N" && !this.q[x] && this.adj[x].length === 2 && this.adj[x].some((j) => this.el[j] === "O" && this.ord(x, j) === 2 && this.adj[j].length === 1 && !this.q[j]);
  // An OH or O-alkyl on an amide-like N (N-hydroxy, N-methoxy: hydroxamic acids, Weinreb amides, hydroxyurea).
  nOxy(n: number, o: number): boolean {
    return this.el[o] === "O" && this.ord(n, o) === 1 && !this.q[o] && !this.inRing[o]
      && (this.adj[o].length === 1 ? this.h[o] === 1 : this.adj[o].length === 2 && this.adj[o].every((j) => j === n || (this.el[j] === "C" && this.carbonylO[j] < 0)));
  }
  // The N' of a hydrazide R-C(=O)-NH-NH2 (P-66.3.1), x being its N: not in a ring, every other atom on N and N' carbon.
  hydrazideN(c: number, x: number): number | undefined {
    const { el, adj } = this;
    if (el[x] !== "N" || this.ord(c, x) !== 1 || this.inRing[x] || this.q[x]) return undefined;
    const ys = adj[x].filter((j) => j !== c && el[j] !== "C"), y = ys[0];
    if (ys.length !== 1 || el[y] !== "N" || this.ord(x, y) !== 1 || this.inRing[y] || this.q[y]) return undefined;
    const carbon = (n: number, not: number) => adj[n].every((j) => j === not || (el[j] === "C" && !this.isNitrileC(j)));
    return carbon(x, y) && carbon(y, x) ? y : undefined;
  }
  // The N atoms of carbon c (with no carbon) that belong to a hydrazine or diazene, N-N or N=N with only carbon on them.
  hydrazineN(c: number): number[] {
    const { el, adj } = this;
    const ok = (n: number) => el[n] === "N" && !this.inRing[n] && !this.q[n];
    return adj[c].filter((n) => {
      if (!ok(n) || this.ord(c, n) !== 1) return false;
      const ms = adj[n].filter((j) => el[j] !== "C"), m = ms[0];
      return ms.length === 1 && ok(m) && adj[m].every((j) => j === n || (el[j] === "C" && !this.isNitrileC(j))) && adj[n].every((j) => j === m || (el[j] === "C" && !this.isNitrileC(j)));
    });
  }
  // A carboxylic acid group on a hydrazine or diazene N: the N-N is the parent (P-68.3.1.1.1, P-66.1.6.1.2):
  // hydrazinecarboxamide (semicarbazide), tert-butyl hydrazinecarboxylate, diethyl diazene-1,2-dicarboxylate.
  hydrazineGroup(c: number, n: number, x: number, imine?: number) {
    const { el, adj } = this;
    const r = adj[x].find((j) => j !== c);
    const oxo: Kind | undefined = HALO[el[x]] && adj[x].length === 1 ? "halide" : el[x] === "O" && adj[x].length === 1 && this.h[x] === 1 ? "acid"
      : el[x] === "O" && adj[x].length === 2 && ((el[r!] === "C" && this.carbonylO[r!] < 0) || this.ringNO(x)) ? "ester"
      : el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && !this.q[x] && adj[x].every((j) => j === c || (el[j] === "C" && !this.isNitrileC(j)) || this.nOxy(x, j)) ? "amide"
      : this.hydrazideN(c, x) !== undefined && imine === undefined ? "hydrazide" : undefined;
    // With =N in place of =O (P-66.4.1.2.1): hydrazinecarboximidamide (aminoguanidine), hydrazinecarboximidic acid.
    const kind: Kind | undefined = imine === undefined ? oxo : ({ halide: "imidoylhalide", acid: "imidic", ester: "imidate", amide: "amidine" } as Record<string, Kind>)[oxo ?? ""];
    if (!kind) throw new Error("carbonic acid derivative");
    this.mark(c, kind, [n]);
    this.group[x] = kind;
    if (kind === "hydrazide") this.group[this.hydrazideN(c, x)!] = kind; // diazenecarbohydrazide (carbazone)
    if (imine !== undefined) this.group[imine] = "imine";
    if (kind === "ester" || kind === "imidate") this.esterO.set(c, x);
    for (const j of adj[x]) if ((kind === "amide" || kind === "amidine") && this.nOxy(x, j)) this.nO.add(j);
    this.hzN.add(n);
    this.hzN.add(adj[n].find((j) => el[j] === "N")!);
  }
  // C(=O)-O-O (P-65.1.4.1): a peroxy acid (benzenecarboperoxoic acid), its ester (tert-butyl ethaneperoxoate), or a
  // diacyl peroxide (dibenzoyl peroxide).
  peroxyGroup(c: number, cs: number[], x: number, y: number) {
    const r = this.adj[y].find((j) => j !== x);
    const kind: Kind | undefined = r === undefined ? (this.h[y] === 1 ? "peroxy" : this.q[y] === -1 ? "peroxoate" : undefined) : this.el[r] !== "C" ? undefined
      : this.carbonylO[r] < 0 ? "peroxyester" : this.inRing[r] ? undefined : "peroxide";
    if (!kind || this.inRing[x] || this.adj[y].length > 2) throw new Error("carbonyl group");
    this.mark(c, kind, cs);
    this.group[x] = this.group[y] = kind;
    this.peroxO.add(x);
    this.peroxO.add(y);
    if (kind === "peroxyester") this.esterO.set(c, y);
  }
  // Diacyl peroxides (P-65.7), and their S analogues (acylBridge): dibenzoyl peroxide, acetyl benzoyl peroxide,
  // diacetyl disulfide.
  peroxideName(): string {
    const cs = [...this.bearer.keys()].filter((g) => this.group[g] === "peroxide");
    if (cs.length !== 2) throw new Error("peroxide");
    const x = this.groupHetero(cs[0]).find((j) => this.peroxO.has(j))!;
    const word = this.el[x] === "O" ? "peroxide" : this.adj[x].some((j) => this.peroxO.has(j)) ? "disulfide" : "sulfide";
    const acyls = cs.map((c) => this.acylName(c, this.groupHetero(c).find((j) => this.peroxO.has(j))!));
    if (acyls[0].text === acyls[1].text) return `${times(2, acyls[0])} ${word}`;
    return `${acyls.map((a) => enclose(a)).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} ${word}`;
  }
  // An ester O on a ring N (P-65.6.3.2.3): 2,5-dioxopyrrolidin-1-yl acetate, the N-hydroxysuccinimide esters.
  ringNO = (o: number) => this.adj[o].some((j) => this.el[j] === "N" && this.inRing[j] && !this.q[j] && this.ord(o, j) === 1);
  // Bonds between heteroatoms that these classes allow: N-O of N-hydroxy amides and of esters on a ring N, N-N of
  // hydrazides.
  classBond = (a: number, b: number) => this.nO.has(a) || this.nO.has(b) || ((this.ringAmino(a, b) || this.ringAmino(b, a)) && [a, b].some((x) => this.group[x] === "amide" || this.group[x] === "urea" || this.group[x] === "carbamate" || this.group[x] === "peroxide")) || (this.group[a] === "hydrazide" && this.group[b] === "hydrazide" && this.el[a] === "N" && this.el[b] === "N") || (this.hzN.has(a) && this.hzN.has(b)) || (this.peroxO.has(a) && this.peroxO.has(b)) || (this.pseudo.has(a) && this.pseudo.has(b))
    || [a, b].some((o) => this.el[o] === "O" && (this.group[o] === "ester" || this.group[o] === "carbamate") && this.ringNO(o));
  // Groups cited only as prefixes (P-61, P-65.2.2): N=C=O and N=C=S on N (isocyanato, isothiocyanato), N#C-O and
  // N#C-S on O or S (cyanato, thiocyanato). With H in place of the attachment, the molecule is the acid: isocyanic acid.
  pseudoGroup(c: number): boolean {
    const { el, adj } = this;
    if (this.inRing[c] || this.q[c] || adj[c].length !== 2) return false;
    for (const [n, x] of [adj[c], [...adj[c]].reverse()]) {
      // O, S, Se, Te: isocyanato, isothiocyanato, isoselenocyanato, isotellurocyanato.
      const stem = ({ O: "", S: "thio", Se: "seleno", Te: "telluro" } as Record<string, string>)[el[x]];
      if (el[n] !== "N" || stem === undefined || this.q[n] || this.q[x] || this.inRing[n] || this.inRing[x]) continue;
      const iso = this.ord(c, n) === 2 && this.ord(c, x) === 2 && adj[x].length === 1;
      const cyan = this.ord(c, n) === 3 && this.ord(c, x) === 1 && adj[n].length === 1;
      if (!iso && !cyan) continue;
      const at = iso ? n : x, word = `${iso ? "iso" : ""}${stem}cyan`;
      if (adj[at].length === 1 && this.h[at] === 1) this.whole = `${word}ic acid`;
      else if (adj[at].length !== 2 || this.h[at] || this.ord(at, adj[at].find((j) => j !== c)!) !== 1) continue;
      else this.prefixOnly.set(at, `${word}ato`);
      for (const a of [c, n, x]) this.pseudo.add(a);
      return true;
    }
    return false;
  }
  // C=N with N or N=C (P-66.4.1, P-66.4.1.2.1, P-62.3.1.1): amidines (ethanimidamide, piperidine-1-carboximidamide),
  // guanidines and carbodiimides (methanediimine).
  amidineGroup(c: number, n: number, cs: number[], rest: number[]) {
    const { el, adj } = this;
    const plain = (x: number) => el[x] === "N" && this.ord(c, x) === 1 && !this.inRing[x] && !this.q[x] && adj[x].every((j) => j === c || el[j] === "C" || this.nOxy(x, j));
    for (const x of rest) if (plain(x)) for (const j of adj[x]) if (this.nOxy(x, j)) this.nO.add(j); // N-hydroxyguanidine, amidoximes
    const m = rest[0];
    if (!cs.length && rest.length === 1 && el[m] === "N" && this.ord(c, m) === 2 && !this.inRing[m] && !this.q[m] && adj[m].length + this.h[m] === 2
      && adj[m].every((j) => j === c || (el[j] === "C" && this.carbonylO[j] < 0 && !this.isNitrileC(j)))) {
      this.mark(c, "imine", []);
      this.group[n] = this.group[m] = "imine";
      this.diimine.add(c);
      return;
    }
    const hz = !cs.length && rest.length === 2 ? this.hydrazineN(c) : [];
    if (hz.length === 1) { this.hydrazineGroup(c, hz[0], rest.find((j) => j !== hz[0])!, n); return; }
    // Isoureas and other imidic carbonic acid derivatives (P-65.2.1.2): carbamimidic acid, methyl carbamimidate.
    if (!cs.length && rest.length === 2 && !rest.every(plain)) { this.carbonicGroup(c, rest); this.group[n] = "imine"; return; }
    // Imidic acids, imidates and imidoyl halides (P-65.1.3.1): ethanimidic acid, methyl ethanimidate.
    const x = rest[0], r = adj[x].find((j) => j !== c);
    const one: Kind | undefined = plain(x) ? "amidine" : el[x] === "O" && adj[x].length === 1 && this.h[x] === 1 ? "imidic"
      : el[x] === "O" && adj[x].length === 2 && ((el[r!] === "C" && this.carbonylO[r!] < 0) || this.ringNO(x)) ? "imidate" : HALO[el[x]] && adj[x].length === 1 ? "imidoylhalide" : undefined;
    const kind: Kind | undefined = cs.length <= 1 && rest.length === 1 ? one : !cs.length && rest.length === 2 ? "guanidine" : undefined;
    if (!kind) throw new Error("imine");
    this.mark(c, kind, cs);
    this.group[n] = "imine";
    for (const y of rest) this.group[y] = kind;
    if (kind === "imidate") this.esterO.set(c, x);
  }
  // Ring N atoms single-bonded to carbon c, when c is outside a ring, and ring P, As, Sb, B, Si, Ge and Sn atoms likewise
  // (2,3-dihydro-1H-1-benzarsole-1-carboxylic acid).
  ringN = (c: number) => (this.inRing[c] ? [] : this.adj[c].filter((j) => RING_BEARERS.has(this.el[j]) && this.inRing[j] && this.ord(c, j) === 1 && !this.q[j]));
  isNitrileC = (c: number) => this.adj[c].some((j) => this.el[j] === "N" && this.ord(c, j) === 3);
  nitroAtom(i: number): boolean {
    if (this.el[i] !== "N" && this.el[i] !== "O") return false;
    const n = this.el[i] === "N" ? i : this.adj[i].find((j) => this.el[j] === "N");
    if (n === undefined || this.el[n] !== "N" || this.q[n] !== 1) return false;
    const os = this.adj[n].filter((j) => this.el[j] === "O");
    return os.length === 2 && os.some((o) => this.ord(n, o) === 2 && !this.q[o]) && os.some((o) => this.ord(n, o) === 1 && this.q[o] === -1)
      && this.adj[n].length === 3 && this.adj[n].some((j) => this.el[j] === "C" || (this.el[j] === "N" && !this.q[j])); // on C, or on N: N-nitro (nitramines)
  }
  nitroBond = (a: number, b: number) => this.nitroAtom(a) || this.nitroAtom(b);
  // The N=N+ end of a diazo or azido group: N+ with a terminal =N- and one more double bond, to x.
  private n2End(mid: number): number | undefined {
    if (this.el[mid] !== "N" || this.q[mid] !== 1 || this.h[mid] || this.adj[mid].length !== 2) return undefined;
    const end = this.adj[mid].find((j) => this.el[j] === "N" && this.q[j] === -1 && !this.h[j] && this.adj[j].length === 1 && this.ord(mid, j) === 2);
    if (end === undefined) return undefined;
    const x = this.adj[mid].find((j) => j !== end)!;
    return this.ord(mid, x) === 2 ? x : undefined;
  }
  // Diazo (P-61.4): C=N+=N- on a carbon outside a ring, cited only as the prefix diazo. True for its two N.
  diazoAtom(i: number): boolean {
    if (this.el[i] !== "N") return false;
    const mid = this.q[i] === 1 ? i : this.adj[i].find((j) => this.q[j] === 1);
    const c = mid === undefined ? undefined : this.n2End(mid);
    return c !== undefined && this.el[c] === "C" && !this.inRing[c];
  }
  // Azido (P-61.5): C-N=N+=N-, cited only as the prefix azido. True for its three N.
  azidoAtom(i: number): boolean {
    if (this.el[i] !== "N") return false;
    const mids = this.q[i] === 1 ? [i] : this.adj[i].filter((j) => this.el[j] === "N" && this.q[j] === 1);
    for (const mid of mids) {
      const n = this.n2End(mid);
      if (n === undefined || this.el[n] !== "N" || this.q[n] || this.h[n] || this.adj[n].length !== 2) continue;
      const c = this.adj[n].find((j) => j !== mid)!;
      if ((this.el[c] === "C" || CATENATE.has(this.el[c])) && this.ord(n, c) === 1) return true; // also azido(trimethyl)silane
    }
    return false;
  }
  // A positive N with four bonds counting hydrogens: an aminium N (single bonds) or a ring N of an "-ium" cation.
  cationN(i: number): boolean {
    if (this.el[i] !== "N" || this.q[i] !== 1 || this.nitroAtom(i) || nOxideN(this, i)) return false;
    const valence = this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.h[i];
    return valence === 4 && (this.inRing[i] ? this.adj[i].every((j) => this.ord(i, j) === 1 || this.ringOf[j] === this.ringOf[i]) : this.adj[i].every((j) => this.ord(i, j) === 1));
  }
  // The N of a C=N imine on carbon c: not in a ring, with H, one carbon (not a carbonyl) or one O.
  imineN(c: number): number | undefined {
    const n = this.adj[c].find((j) => this.el[j] === "N" && this.ord(c, j) === 2);
    if (n === undefined || this.inRing[n] || this.q[n]) return undefined;
    const rest = this.adj[n].filter((j) => j !== c);
    if (rest.length + this.h[n] !== 1) return undefined;
    const x = rest[0];
    if (x === undefined) return n;
    if (this.ord(n, x) !== 1) return undefined;
    if (this.el[x] === "C" && this.carbonylO[x] < 0) return n; // N-cyano too: N''-cyanoguanidine
    if (this.el[x] === "O" && !this.q[x] && this.adj[x].length + this.h[x] === 2 && this.adj[x].every((j) => j === n || (this.el[j] === "C" && this.carbonylO[j] < 0))) return n;
    if (this.el[x] === "N" && this.inRing[x] && !this.q[x]) return n; // on a ring N: N-(piperidin-1-yl)ethanimine
    // A sulfonyl group on the =N of an amidine or guanidine: N'-sulfamoylpropanimidamide (famotidine).
    if (this.el[x] === "S" && !this.inRing[x] && !this.q[x] && this.adj[x].filter((o) => this.isOxo(x, o)).length === 2 && !this.inRing[c]
      && this.adj[c].some((j) => j !== n && this.el[j] === "N" && this.ord(c, j) === 1 && !this.inRing[j])) return n;
    return undefined;
  }

  // ——— Ions (P-72 anions, P-73 cations, P-74 zwitterions) ———
  // Charged atoms Octet names, marked before the neutral groups. Anions: carboxylates (-oate), sulfonates, alkoxides
  // and phenoxides (-olate), amine anions (-aminide), carbanions and ring N anions (-ide). Cations: carbocations
  // (-ylium), iminium and diazonium ions, onium ions of S, P and O (trimethylsulfanium), and the O or S of a pyrylium
  // ring. An O- on a cation is cited as oxido (1-oxidopyridin-1-ium). Any other charged atom is left unnamed.
  perceiveIons() {
    const { el, h, q, adj } = this;
    const valence = (i: number) => adj[i].reduce((t, j) => t + this.ord(i, j), 0) + h[i];
    const single = (i: number) => adj[i].every((j) => this.ord(i, j) === 1);
    const plainC = (c: number) => el[c] === "C" && !q[c] && this.carbonylO[c] < 0 && !this.isNitrileC(c);
    const oMinus = (o: number) => el[o] === "O" && q[o] === -1 && !h[o] && adj[o].length === 1 && single(o);
    const terminalO = (x: number, o: number) => el[o] === "O" && !q[o] && adj[o].length === 1 && this.ord(x, o) === 2;
    const ion = (i: number, kind?: Kind, on?: number[]) => { this.ions.add(i); if (kind) this.mark(i, kind, on!); };
    // The O- of a peroxoate, C(=O)-O-O- (P-65.1.4.2): peroxyGroup() names the group.
    for (let i = 0; i < this.n; i++) {
      const x = adj[i][0];
      if (oMinus(i) && el[x] === "O" && !this.inRing[x] && adj[x].some((c) => c !== i && el[c] === "C" && this.carbonylO[c] >= 0 && el[this.carbonylO[c]] === "O")) ion(i);
    }
    for (let i = 0; i < this.n; i++) {
      if (!q[i] || this.nitroAtom(i) || this.diazoAtom(i) || this.azidoAtom(i) || this.ions.has(i)) continue;
      const e = el[i], cs = this.carbons(i);
      if (oMinus(i)) {
        const x = adj[i][0];
        if (el[x] === "C" && !q[x] && this.carbonylO[x] >= 0 && !this.inRing[x] && this.carbons(x).length <= 1 && adj[x].length === this.carbons(x).length + 2) {
          ion(i);
          this.group[i] = "carboxylate";
          this.mark(x, "carboxylate", this.carbons(x));
          this.group[this.carbonylO[x]] = "ketone";
        } else if (plainC(x)) ion(i, "olate", [x]);
        else if ((el[x] === "S" || CHALCOGEN.has(el[x])) && !q[x] && !this.inRing[x] && (adj[x].length === 4 || adj[x].length === 3) && !this.group[x]) {
          // Sulfonates and sulfinates (P-65.3): C-S(=O)2-O- and C-S(=O)-O-; with Se and Te, selenonates and
          // tellurinates (perceiveMain() checks their bonds).
          const os = adj[x].filter((o) => terminalO(x, o)), c = adj[x].filter(plainC);
          if (os.length === adj[x].length - 2 && c.length === 1) {
            ion(i);
            this.mark(x, os.length === 2 ? "sulfonateion" : "sulfinate", c);
            if (el[x] === "S") for (const j of [x, i, ...os]) this.sulfur.add(j);
          }
        }
        // One ester anion per structure: a second one's O- is left unnamed.
        if (!this.ions.has(i) && (el[x] === "S" || el[x] === "P" || el[x] === "C") && !q[x] && !this.inRing[x] && !this.esterIon) {
          // Ester anions of inorganic acids (functional class names, IR-8): dodecyl sulfate, methyl hydrogen phosphate,
          // dimethyl phosphate, methyl carbonate. The rest of x's atoms are =O, O-, OH and O-R.
          const of = (f: (o: number) => boolean) => adj[x].filter((o) => o !== i && f(o));
          const os = of((o) => terminalO(x, o)), minus = [i, ...of(oMinus)], ohs = of((o) => el[o] === "O" && !q[o] && h[o] === 1 && adj[o].length === 1);
          const ors = of((o) => el[o] === "O" && !q[o] && !h[o] && adj[o].length === 2 && this.ord(x, o) === 1 && plainC(adj[o].find((j) => j !== x)!));
          const word = el[x] === "S" ? os.length === 2 && minus.length === 1 && !ohs.length && ors.length === 1 && "sulfate"
            : el[x] === "P" ? os.length === 1 && ors.length && adj[x].length === 4 && "phosphate" : os.length === 1 && minus.length === 1 && ors.length === 1 && !ohs.length && "carbonate";
          if (!word || adj[x].length !== os.length + minus.length + ohs.length + ors.length) continue;
          for (const j of [x, ...minus]) ion(j);
          this.esterIon = { x, word, ors, ohs: ohs.length };
          const set = el[x] === "S" ? this.sulfur : el[x] === "P" ? this.phosphorus : this.ions;
          for (const j of [x, ...os, ...minus, ...ohs, ...ors]) set.add(j);
          for (const o of os) this.group[o] = "ketone";
        }
      } else if (e === "N" && q[i] === -1 && valence(i) === 2 && single(i)) {
        if (this.inRing[i]) { if (!h[i] && adj[i].length === 2) ion(i, "ide", [i]); }
        else if (cs.length && cs.length === adj[i].length && cs.every(plainC)) ion(i, "aminide", cs);
        else {
          // An azanide (P-72.2.2.1) with acyl, sulfonyl and cyano groups: acetyl(phenyl)azanide,
          // bis(trifluoromethanesulfonyl)azanide, dicyanoazanide.
          // Alkoxycarbonyl too: (methoxycarbonyl)(phenyl)azanide.
          const alkoxy = (c: number) => adj[c].filter((o) => el[o] === "O" && !q[o] && adj[o].length === 2 && this.ord(c, o) === 1 && plainC(adj[o].find((k) => k !== c)!));
          const acyl = (c: number) => el[c] === "C" && !q[c] && !this.inRing[c] && this.carbonylO[c] >= 0 && this.carbons(c).length + alkoxy(c).length <= 1 && adj[c].length === this.carbons(c).length + alkoxy(c).length + 2;
          const sulfonyl = (s: number) => el[s] === "S" && !q[s] && !this.inRing[s] && adj[s].length === 4 && adj[s].filter((o) => terminalO(s, o)).length === 2 && adj[s].filter(plainC).length === 1;
          const cyano = (c: number) => el[c] === "C" && !q[c] && adj[c].length === 2 && adj[c].some((n) => el[n] === "N" && !q[n] && adj[n].length === 1 && this.ord(c, n) === 3);
          // Silyl groups pass here, but perceiveMain() takes no N- on Si yet: bis(trimethylsilyl)azanide has no name.
          if (!adj[i].every((j) => plainC(j) || acyl(j) || sulfonyl(j) || cyano(j) || el[j] === "Si")) continue;
          ion(i);
          this.azanide.push(i);
          for (const j of adj[i]) {
            if (cyano(j)) { this.group[j] = "nitrile"; this.group[adj[j].find((n) => n !== i)!] = "nitrile"; }
            if (acyl(j)) { this.ions.add(j); this.group[this.carbonylO[j]] = "ketone"; }
            if (sulfonyl(j)) { for (const k of [j, ...adj[j].filter((o) => terminalO(j, o))]) this.sulfur.add(k); this.ionBonds.add(this.key(i, j)); }
          }
        }
      } else if (e === "C" && Math.abs(q[i]) === 1 && valence(i) === 3 && this.carbonylO[i] < 0 && !this.isNitrileC(i)) ion(i, q[i] < 0 ? "ide" : "ylium", [i]);
      else if (q[i] === -1 && valence(i) === ({ P: 2, As: 2, Sb: 2, Si: 3, Ge: 3, Sn: 3 } as Record<string, number>)[e]) {
        // Anions of P, As, Sb, Si, Ge and Sn (P-72.2.2.1): in a ring, -ide (1H-1-benzophosphol-1-ide); else the parent
        // hydride's anion with its carbon substituents (diphenylphosphanide, dimethyl(phenyl)silanide).
        if (this.inRing[i]) ion(i, "ide", [i]);
        else if (adj[i].every((j) => plainC(j) && this.ord(i, j) === 1)) { ion(i); this.azanide.push(i); }
      }
      else if (e === "N" && q[i] === 1 && !this.cationN(i) && !this.inRing[i] && !h[i] && adj[i].length === 2) {
        // Diazonium (P-73.1.1.2): C-N+≡N.
        const n2 = adj[i].find((j) => el[j] === "N" && !q[j] && !h[j] && adj[j].length === 1 && this.ord(i, j) === 3), c = adj[i].find(plainC);
        if (n2 === undefined || c === undefined || this.ord(i, c) !== 1) continue;
        ion(i, "diazonium", [c]);
        this.group[n2] = "diazonium";
        this.ionBonds.add(this.key(i, n2));
      } else if (e === "N" && q[i] === 1 && !this.inRing[i] && valence(i) === 4) {
        // Iminium (P-73.1.2): C=N+, the N bearing H, carbons or an O- (a nitrone, N-oxido).
        const c = adj[i].find((j) => this.ord(i, j) === 2);
        if (c === undefined || el[c] !== "C" || q[c] || this.carbonylO[c] >= 0 || adj[i].some((j) => j !== c && (!(plainC(j) || oMinus(j)) || this.ord(i, j) !== 1))) continue;
        ion(i, "iminium", [c]);
      } else if (q[i] === 1 && !this.inRing[i] && (e === "S" || e === "P" || e === "O" || HALO[e]) && single(i) && valence(i) === (e === "P" ? 4 : HALO[e] ? 2 : 3) && cs.length && cs.length === adj[i].length && cs.every((c) => plainC(c) || (q[c] === -1 && valence(c) === 3))) {
        // Onium ions (P-73.1.1.1): trimethylsulfanium, tetraphenylphosphanium, triethyloxidanium, diphenyliodanium.
        ion(i);
        this.onium.push(i);
      } else if (q[i] === 1 && e === "S" && !this.inRing[i] && adj[i].length === 4 && cs.length === 3 && adj[i].some((o) => terminalO(i, o)) && cs.every((c) => plainC(c) || (q[c] === -1 && valence(c) === 3))) {
        // A sulfoxonium ion: trimethyl(oxo)-λ4-sulfanium.
        ion(i);
        this.onium.push(i);
        for (const j of [i, ...adj[i].filter((o) => terminalO(i, o))]) this.sulfur.add(j);
      } else if (q[i] === 1 && (e === "O" || e === "S" || CHALCOGEN.has(e)) && this.inRing[i] && adj[i].length === 2 && !h[i] && adj[i].filter((j) => this.ord(i, j) === 2).length === 1) ion(i); // pyrylium, selenopyrylium
    }
    // Oxido: an O- on an N+ (amine and ring N-oxides, nitrones) or on an onium ion.
    for (let i = 0; i < this.n; i++) {
      const x = adj[i][0];
      if (!oMinus(i) || this.ions.has(i) || this.nitroAtom(i) || !(this.cationN(x) || this.onium.includes(x) || this.group[x] === "iminium")) continue;
      ion(i);
      this.ionBonds.add(this.key(i, x));
    }
  }
  // Under an ion suffix a carboxylic acid (or a carboxylate under another anion) is cited as carboxy (carboxylato),
  // so its carbon stays out of the parent chain: 3-carboxypropanoate, carboxy-N,N,N-trimethylmethanaminium.
  ionSkip = (kind: Kind | undefined) => (kind && SENIORITY.indexOf(kind) <= SENIORITY.indexOf("diazonium") ? new Set([...this.bearer.keys()].filter((g) => this.group[g] === "acid" || (this.group[g] === "carboxylate" && kind !== "carboxylate" && this.el[g] === "C"))) : undefined);
  // A parent that is an ion as a whole, or must hold the ion: an onium cation (P-73.1.1.1: trimethylsulfanium), an
  // azanide (acetyl(phenyl)azanide), or a ring cation with neutral groups cited as prefixes (3-carbamoyl-1-methylpyridin-1-ium).
  ionParent(kind: Kind | undefined): string | undefined {
    const anion = (ANION_KINDS as (Kind | undefined)[]).includes(kind);
    if (this.esterIon) {
      // The alkyl groups in alphabetical order, then hydrogen: ethyl methyl phosphate, methyl hydrogen phosphate.
      const { x, word, ors, ohs } = this.esterIon;
      if (anion || this.azanide.length) throw new Error("several anions");
      const alkyls = ors.map((o) => this.substituent(this.adj[o].find((j) => j !== x)!, o).text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
      const words = [...new Set(alkyls)].map((t) => { const k = alkyls.filter((a) => a === t).length; return k < 2 ? t : `${MULT[k]}${t}`; });
      return [...words, ...(ohs ? [`${ohs > 1 ? MULT[ohs] : ""}hydrogen`] : []), word].join(" ");
    }
    if (this.azanide.length) {
      if (anion || this.azanide.length > 1) throw new Error("several anions");
      return this.centre(this.azanide[0]);
    }
    if (anion) return undefined;
    if (this.onium.length) return this.oniumName();
    const rings = new Set([...Array(this.n).keys()].filter((i) => this.inRing[i] && this.q[i] === 1 && (this.cationN(i) || this.ions.has(i))).map((i) => this.ringOf[i]));
    if (!rings.size || !kind || SENIORITY.indexOf(kind) <= SENIORITY.indexOf("diazonium")) return undefined;
    return this.parentName(undefined, undefined, new Set([...rings].flatMap((k) => this.rings[k])))?.text;
  }
  // A radical (fewer bonds and hydrogens than the atom's usual valence: CH2•, O•) is not named here (P-71).
  radicals() {
    for (let i = 0; i < this.n; i++) {
      if (this.opaque.has(i)) continue; // a group named elsewhere (metals.ts: ferrocenyl)
      const e = this.el[i], q = this.q[i], low = e === "C" ? 4 - Math.abs(q) : e === "N" || e === "P" ? 3 + q : e === "O" || e === "S" ? 2 + q : HALO[e] ? 1 + q : undefined;
      if (low !== undefined && this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.h[i] < low) throw new Error("radical");
    }
  }
  // The N of an aminide or iminium group g, whose other substituents are cited with N locants.
  ionN = (kind: Kind | undefined, g: number) => (kind === "aminide" || kind === "iminium" ? g : undefined);
  // Ions cited as prefixes (P-72.6, P-73.6): oxido, carboxylato, sulfonato, and azaniumyl, sulfaniumyl, phosphaniumyl
  // with their substituents ((trimethylazaniumyl)acetate). Other ions are not cited as prefixes.
  ionPrefix(x: number, from: number): Name | undefined {
    const g = this.group[x], el = this.el[x];
    if ((this.ions.has(x) || this.het.get(x) === "NO-") && el === "O" && this.q[x] === -1 && this.adj[x].length === 1) return { text: "oxido", compound: false };
    if (g === "carboxylate") return { text: "carboxylato", compound: false };
    if (g === "sulfonateion" || g === "sulfinate") return { text: chalcogenStem(el) + (g === "sulfinate" ? "inato" : "onato"), compound: false }; // sulfonato, selenonato
    // An amine N-oxide as a prefix (P-74.2.1.2): (oxidoazaniumyl), [dimethyl(oxido)azaniumyl].
    const oxide = !this.inRing[x] && nOxideN(this, x) && this.adj[x].every((j) => this.ord(x, j) === 1);
    if (g === "aminium" || this.onium.includes(x) || oxide) return { text: `${this.centre(x, from)}yl`, compound: this.adj[x].length > 1 };
    if ((g && (ANION_KINDS as Kind[]).includes(g)) || g === "ylium" || g === "iminium" || g === "diazonium" || (this.ions.has(x) && this.inRing[x])) throw new Error(`${g ?? "ion"} as a prefix`);
    return undefined;
  }
  oniumName(): string {
    if (this.onium.length !== 1) throw new Error("several onium ions");
    return this.centre(this.onium[0]);
  }
  // An onium or azanide centre x as a parent, with its substituents (but not the atom `from` it hangs on):
  // trimethylsulfanium, trimethyl(oxo)-λ4-sulfanium, tetraphenylphosphanium, acetyl(phenyl)azanide. (Boranuides are
  // mainParent()'s.)
  centre(x: number, from = -1): string {
    const el = this.el[x], oxo = this.adj[x].filter((j) => this.ord(x, j) === 2 && this.el[j] === "O");
    const subs = [...this.adj[x].filter((j) => j !== from && !oxo.includes(j)).map((j) => this.substituent(j, x)), ...oxo.map(() => ({ text: "oxo", compound: false }))];
    const word = this.q[x] < 0 ? ({ N: "azanide", P: "phosphanide", As: "arsanide", Sb: "stibanide", Si: "silanide", Ge: "germanide", Sn: "stannanide" } as Record<string, string>)[el] : oxo.length ? "-λ4-sulfanium" : { N: "azanium", S: "sulfanium", P: "phosphanium", O: "oxidanium", I: "iodanium", Br: "bromanium", Cl: "chloranium", F: "fluoranium" }[el];
    if (!word) throw new Error("charge");
    return substituted(subs) + word;
  }

  // ——— Parents ———

  // A ring's identity: retained or cyclo name, and the numberings its heteroatoms allow.
  ringInfo(cycle: number[]): { ring?: Ring; numberings: number[][]; aromatic: boolean; fused?: FusedSys; assembly?: { stem: string; labels: string[]; junction: [number, number] }; bridged?: Bridged } {
    const k = this.ringOf[cycle[0]];
    if (this.fused[k]) {
      let f: FusedSys;
      try { f = this.fusedInfo(k); } catch (e) { const b = this.bridgedInfo(k); if (!b) throw e; return { numberings: b.nums, aromatic: false, bridged: b }; }
      return { numberings: f.nums, aromatic: true, fused: f };
    }
    const size = cycle.length, ringBonds = cycle.map((a, k) => this.ord(a, cycle[(k + 1) % size]));
    const doubles = cycle.map((a) => cycle.some((b) => b !== a && this.ord(a, b) === 2 && this.adjacentIn(cycle, a, b)));
    const hetero = cycle.filter((a) => this.el[a] !== "C");
    const allNumberings: number[][] = [];
    for (let s = 0; s < size; s++) for (const dir of [1, -1]) allNumberings.push(cycle.map((_, k) => cycle[(s + dir * k + size * 2) % size]));
    const aromatic6 = size === 6 && doubles.every(Boolean);
    const aromatic5 = size === 5 && ringBonds.filter((o) => o === 2).length === 2 && cycle.filter((_, k) => !doubles[k]).every((a) => this.el[a] !== "C");
    const aromatic = aromatic6 || aromatic5;
    if (ringBonds.some((o) => o === 3) && hetero.length) throw new Error("ring triple bond");
    if (!hetero.length && !aromatic6) return { numberings: allNumberings, aromatic: false };
    // Rings with Si, B, Se and the like, partly unsaturated rings and rings with a λ-atom: monoInfo().
    if ((!aromatic && ringBonds.some((o) => o === 2)) || hetero.some((a) => MAIN[this.el[a]] && !(aromatic6 && this.q[a] === 1)) || cycle.some((a) => this.lambda(a))) return this.monoInfo(cycle);
    // Lowest locants to heteroatoms together, then by seniority O, S, N; then (azoles) to the N bearing hydrogen.
    const heteroLocants = (num: number[]) => num.map((a, k) => (this.el[a] !== "C" ? k + 1 : 0)).filter(Boolean);
    let best = allNumberings;
    best = this.lowest(best, heteroLocants);
    for (const e of HETERO_ORDER) best = this.lowest(best, (num) => num.map((a, k) => (this.el[a] === e ? k + 1 : 0)).filter(Boolean));
    if (aromatic5) best = this.lowest(best, (num) => num.map((a, k) => (this.el[a] !== "C" && !doubles[cycle.indexOf(a)] ? k + 1 : 0)).filter(Boolean));
    const sig = best[0].map((a, k) => (this.el[a] !== "C" ? `${this.el[a]}${k + 1}` : "")).filter(Boolean).sort((x, y) => HETERO_ORDER.indexOf(x[0]) - HETERO_ORDER.indexOf(y[0]) || parseInt(x.slice(1)) - parseInt(y.slice(1)));
    const ring = RINGS[`${size}${aromatic ? "a" : "s"}:${sig.join(",")}`] ?? ION_RINGS[`${size}${aromatic ? "a" : "s"}:${sig.join(",")}`];
    if (!ring) return this.monoInfo(cycle);
    return { ring, numberings: best, aromatic };
  }
  // Any other monocycle of C, N, O, S and P. Numbered from the senior heteroatom, then lowest locants to the
  // heteroatoms together, then in order of seniority (P-22.2.2.1.5). Saturated rings take retained or Hantzsch–Widman
  // names (pyrazolidine, azepane, 1,3-oxazolidine); rings with double bonds are named from the mancude ring
  // (P-31.1.4.2.4: 2H-pyran, 1H-1,2,4-triazole) with indicated hydrogen, added hydrogen and hydro prefixes, as fused
  // systems are. Rings of more than ten atoms take replacement names (P-22.2.3: 1-oxacyclododecane).
  monoInfo(cycle: number[]): ReturnType<Namer["ringInfo"]> {
    const size = cycle.length, el = (a: number) => this.el[a], set = new Set(cycle);
    if (cycle.some((a) => !HW[el(a)] && el(a) !== "C") || size < 3) throw new Error("unknown ring");
    let nums: number[][] = [];
    for (let s = 0; s < size; s++) for (const dir of [1, -1]) nums.push(cycle.map((_, k) => cycle[(s + dir * k + size * 2) % size]));
    const at = (e?: string) => (num: number[]) => num.flatMap((a, k) => ((e ? el(a) === e : el(a) !== "C") ? [k + 1] : []));
    if (size <= 10) nums = nums.filter((num) => el(num[0]) === HW_ORDER.find((e) => cycle.some((a) => el(a) === e)));
    nums = this.lowest(nums, at());
    for (const e of HW_ORDER) nums = this.lowest(nums, at(e));
    nums = this.lowest(nums, (num) => num.flatMap((a, k) => (this.lambda(a) ? [k + 1] : []))); // then λ-atoms (P-31.1.4.2.4)
    const els = nums[0].map(el), ring = (a: number) => this.adj[a].filter((j) => set.has(j)), lam = nums[0].map((a) => this.lambda(a));
    // A retained name with its λ-atoms in front: 1λ⁶-thiophene.
    const retained = (n?: string) => n && (lam.some(Boolean) ? `${lam.flatMap((l, k) => (l ? [`${k + 1}${l}`] : [])).join(",")}-${n}` : n);
    const bonds = cycle.map((a, k): [number, number] => [a, cycle[(k + 1) % size]]);
    if (bonds.some(([a, b]) => this.ord(a, b) === 3)) throw new Error("ring triple bond");
    const doubles = (a: number) => ring(a).filter((j) => this.ord(a, j) === 2).length;
    for (const a of cycle) {
      if (!doubles(a)) continue;
      if (DIVALENT.has(el(a)) || HALO[el(a)]) throw new Error("ring heteroatom double bond");
      if (doubles(a) > 1 || this.adj[a].some((j) => !set.has(j) && this.ord(a, j) > 1)) throw new Error("ring bonds");
    }
    if (size > 10 && cycle.some((a) => el(a) !== "C" && !REPLACE.some(([e]) => e === el(a)))) throw new Error("unknown ring");
    if (size > 10) return { numberings: nums, aromatic: false, bridged: { prefix: "cyclo", nums, bonds } };
    const key = `${size}:${HW_ORDER.flatMap((e) => els.flatMap((x, k) => (x === e ? [`${e}${k + 1}`] : []))).join(",")}`;
    if (bonds.every(([a, b]) => this.ord(a, b) === 1)) {
      const name = retained(SATURATED[key]) || hwName(els, true, lam);
      return { ring: { name, stem: name.replace(/e$/, ""), aromatic: false }, numberings: nums, aromatic: false };
    }
    // The mancude parent: C, N and P take double bonds; it needs indicated hydrogen on one atom of each run of them
    // with an odd number of atoms (the whole ring when it has no O or S).
    const cn = cycle.filter((a) => !DIVALENT.has(el(a)) && !HALO[el(a)]), d = cn.filter((a) => !doubles(a));
    let indicated = 0;
    if (cn.length === size) indicated = size % 2;
    else for (let k = 0, s = cycle.findIndex((a) => !cn.includes(a)), run = 0; k <= size; k++) {
      const a = cycle[(s + k) % size];
      if (cn.includes(a) && k < size) run++;
      else { indicated += run % 2; run = 0; }
    }
    const name = retained(MANCUDE[key]) || hwName(els, false, lam);
    const tpl: Fused = { name, labels: cycle.map((_, k) => String(k + 1)), el: els, adj: [], order: [], bonds: size, formula: "", odd: indicated > 0 };
    return { numberings: nums, aromatic: true, fused: { tpl, nums, cn, d, ring, mono: indicated } };
  }
  // Indicated hydrogen, added hydrogen and hydro prefixes for a monocycle from its mancude parent, in one numbering
  // (P-31.1.4.2.4, P-31.1.4.3.4). Indicated hydrogen goes where the parent allows it and leaves the least added
  // hydrogen for the ketones (2H-pyran-2-one, 1H-pyrrole-2,5-dione), then at the lowest locants; added hydrogen at the
  // lowest locants (pyrimidine-2,4(1H,3H)-dione); the other saturated atoms are hydro prefixes (3,4-dihydro-2H-pyran).
  monoSaturation(f: FusedSys, num: number[], ketones: number[]): Saturation {
    const byLoc = (l: number[]) => [...l].sort((a, b) => num.indexOf(a) - num.indexOf(b));
    const d = byLoc(f.d), rest = (sat: number[]) => f.cn.filter((a) => !sat.includes(a));
    let best: { xs: number[]; ys: number[] } | undefined;
    for (const xs of subsets(d, f.mono!)) {
      if (!pairable(rest(xs), f.ring)) continue;
      const free = d.filter((a) => !xs.includes(a) && !ketones.includes(a));
      for (let m = 0; m <= free.length && (!best || m < best.ys.length); m++) {
        const ys = subsets(free, m).find((y) => pairable(rest([...xs, ...ketones, ...y]), f.ring));
        if (ys) { best = { xs, ys }; break; }
      }
      if (best && !best.ys.length) break;
    }
    if (!best) throw new Error("indicated hydrogen");
    const { xs, ys } = best, sat = [...xs, ...ketones, ...ys];
    return { x: xs[0], xs, y: ys[0], ys, yOn: byLoc(ketones.filter((a) => !xs.includes(a) && f.cn.includes(a))).pop(), hydro: d.filter((a) => !sat.includes(a)) };
  }
  // A ring that can be a ring assembly's component: benzene, a retained heterocycle without indicated hydrogen, or a
  // fused system with no saturated atoms (naphthalene, quinoline).
  assemblyComponent(r: number[]): string | undefined {
    const info = this.ringInfo(r);
    if (info.fused) return !info.fused.tpl.odd && !info.fused.d.length ? info.fused.tpl.name : undefined;
    return info.ring?.aromatic && !info.ring.hydrogen ? info.ring.name : undefined;
  }
  // A ring assembly (P-28.2): each ring numbered as itself, the second primed, the junction as low as possible.
  // Locants interleave (1, 1', 2, 2') so that index order is locant order.
  assemblyInfo(asm: Assembly): ReturnType<Namer["ringInfo"]> {
    const [ra, rb] = asm.rings, [ja, jb] = asm.junction, ia = this.ringInfo(ra), ib = this.ringInfo(rb);
    let nums: number[][] = [];
    for (const [x, y] of [[ia, ib], [ib, ia]]) for (const n1 of x.numberings) for (const n2 of y.numberings) nums.push(n1.flatMap((a, k) => [a, n2[k]]));
    nums = this.lowest(nums, (num) => [num.indexOf(ja) + 1, num.indexOf(jb) + 1]);
    const name = this.assemblyComponent(ra)!;
    const stem = name === "benzene" ? "biphenyl" : /^\d/.test(name) ? `bi(${name})` : `bi${name}`;
    return { numberings: nums, aromatic: true, assembly: { stem, labels: ia.fused ? ia.fused.tpl.labels : ra.map((_, k) => String(k + 1)), junction: asm.junction } };
  }
  // A fused system: the table entry whose skeleton maps onto it with the same elements (P-25.3.3: every such map
  // is a numbering the parent allows). Ring bonds may be single or double; hydro prefixes say which.
  fusedInfo(k: number): FusedSys {
    const cached = this.fusedCache.get(k);
    if (cached) return cached;
    const atoms = this.rings[k], sys = new Set(atoms);
    const ringAdj = new Map(atoms.map((a) => [a, this.adj[a].filter((j) => sys.has(j))]));
    const ring = (a: number) => ringAdj.get(a)!;
    // Each C and N has at most one ring double bond, O and S none; the only double bond out of the system is a ring
    // ketone's. A ring triple bond between carbons is a double bond of the parent, made triple by the prefix didehydro
    // (P-31.1.4.2.4): 16,17-didehydro-…-cyclopenta[a]phenanthrene.
    const cn: number[] = [], d: number[] = [], dehydro: [number, number][] = [];
    for (const a of atoms) {
      const doubles = ring(a).filter((j) => this.ord(a, j) > 1).length, triple = ring(a).find((j) => this.ord(a, j) === 3);
      if (doubles > 1 || (triple !== undefined && (this.el[a] !== "C" || this.el[triple] !== "C"))) throw new Error("ring bonds");
      if (triple !== undefined && a < triple) dehydro.push([a, triple]);
      // A ring carbon with no ring double bond may carry =C or =N (an ylidene: 5H-dibenzo[a,d][7]annulen-5-ylidene,
      // 2-ethylidenecyclohexan-1-one): indicated hydrogen or hydro prefixes cover it.
      const ylidene = (j: number) => this.el[a] === "C" && !doubles && this.ord(a, j) === 2 && (this.el[j] === "C" || this.el[j] === "N");
      // =O on a ring S, Se, Te, P, As, Sb or Bi is a ketone by the λ-convention: 10H-10λ⁵-dibenzo[b,e][1,4]oxarsinin-10-one.
      if (this.adj[a].some((j) => !sys.has(j) && this.ord(a, j) > 1 && j !== this.carbonylO[a] && !ylidene(j) && !(this.ringOxide(j) && this.lambda(a)) && !chalcogenOne(this, j))) throw new Error("exocyclic double bond");
      // A ring O+, S+, Se+ or Te+ (pyrylium, phenothiazin-5-ium) takes a ring double bond.
      if (PI_ATOMS.has(this.el[a]) || (this.q[a] > 0 && DIVALENT.has(this.el[a]))) { cn.push(a); if (!doubles) d.push(a); }
      else if (doubles) throw new Error("ring heteroatom double bond");
    }
    const bonds = atoms.reduce((t, a) => t + ring(a).length, 0) / 2, formula = atoms.map((a) => this.el[a]).sort().join("");
    for (const tpl of FUSED) {
      if (tpl.el.length !== atoms.length || tpl.bonds !== bonds || tpl.formula !== formula) continue;
      const nums = this.match(tpl, atoms, ring);
      if (!nums.length) continue;
      const f = { tpl, nums, cn, d, ring, dehydro };
      this.fusedCache.set(k, f);
      return f;
    }
    // Other fused systems: retained names and fusion names (fusion.ts). A neutral fusion N (three ring bonds) has no
    // double bond in the parent and needs no hydrogen; a cationic one with a ring double bond has (quinolizin-5-ium).
    // Bridge atoms (4,7-methanoindene), spiro atoms and saturated spiro components are named as they are and take no
    // hydro prefixes.
    const p = fusedParent(atoms, (a) => this.el[a], ring, this.ord);
    // An atom with four bonds in the fused system (morphinans' 12b) has no double bond either.
    const own = (a: number) => ring(a).filter((b) => !p.fixed?.includes(b)).length;
    const sp2 = (a: number) => (this.el[a] === "C" || ring(a).length < 3 || ring(a).some((b) => this.ord(a, b) === 2)) && !p.fixed?.includes(a) && own(a) < 4;
    const tpl: Fused = { name: p.name, labels: p.labels, el: [], adj: [], order: [], bonds, formula, odd: cn.filter(sp2).length % 2 === 1, uncited: p.uncited, hydrogens: p.hydrogens, bridges: p.bridges };
    if (dehydro.some((b) => b.some((a) => !sp2(a)))) throw new Error("ring bonds"); // in a bridge or a saturated spiro ring
    const f = { tpl, nums: p.nums, cn: cn.filter(sp2), d: d.filter(sp2), ring, dehydro };
    this.fusedCache.set(k, f);
    return f;
  }
  // Two rings that are not ortho-fused (or fused with no name in the table): a bicyclic von Baeyer system (P-23.2,
  // bicyclo[2.2.1]heptane) or a monospiro system (P-24.2, spiro[4.5]decane), with every numbering the rules allow and
  // then the lowest locants to heteroatoms (P-31.1.4.2.4), which are named by replacement (7-oxa, 1,4-diaza). Three
  // rings or more: a polycyclic von Baeyer system (vonbaeyer.ts), or adamantane and cubane (P-23.7) with no ring
  // multiple bond.
  bridgedInfo(k: number): Bridged | undefined {
    const atoms = this.rings[k], sys = new Set(atoms), ring = (a: number) => this.adj[a].filter((j) => sys.has(j));
    const bonds = atoms.flatMap((a) => ring(a).filter((b) => a < b).map((b): [number, number] => [a, b]));
    const unsaturated = bonds.some(([a, b]) => this.ord(a, b) > 1);
    if (atoms.length === 10 && bonds.length === 12 && !unsaturated && atoms.every((a) => ["C", "N", "O", "S", "P", "As"].includes(this.el[a]) && (this.el[a] === "C" || !this.q[a]))) {
      let nums = this.match(ADAMANTANE, atoms, ring);
      nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] !== "C" ? i + 1 : 0)).filter(Boolean));
      for (const e of BRIDGE_ORDER) nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] === e ? i + 1 : 0)).filter(Boolean));
      if (nums.length) return { prefix: "", nums, bonds, retained: "adamantane" };
    }
    if (atoms.some((a) => !["C", "N", "O", "S", "Se", "Si", "Ge", "Sn", "B", "P", "As"].includes(this.el[a]) || (this.el[a] !== "C" && this.q[a] && !this.cationN(a)))) return undefined;
    // Triple bonds are named as -yne (bicyclo[2.2.1]hept-2-yne); an atom with two multiple bonds is not covered.
    if (atoms.some((a) => ring(a).filter((j) => this.ord(a, j) > 1).length > 1)) return undefined;
    if (bonds.length > atoms.length + 1) {
      let { prefix, nums } = vonBaeyer(atoms, ring);
      nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] !== "C" ? i + 1 : 0)).filter(Boolean));
      for (const e of BRIDGE_ORDER) nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] === e ? i + 1 : 0)).filter(Boolean));
      const cubane = prefix === "pentacyclo[4.2.0.0²,⁵.0³,⁸.0⁴,⁷]" && !unsaturated && atoms.every((a) => this.el[a] === "C");
      return { prefix, nums, bonds, ...(cubane ? { retained: "cubane" } : {}) };
    }
    // The atoms from `from` (not included) along `start` until `end`.
    const walk = (from: number, start: number, end: number) => {
      const path: number[] = [];
      for (let prev = from, at = start; at !== end; ) { path.push(at); const next = ring(at).find((j) => j !== prev)!; prev = at; at = next; }
      return path;
    };
    const heads = atoms.filter((a) => ring(a).length === 3), spiro = atoms.filter((a) => ring(a).length === 4);
    let nums: number[][] = [], prefix: string;
    if (heads.length === 2 && !spiro.length) {
      // Main ring as large as possible, main bridge as large as possible: bridges by length, longest first. Number
      // from a main bridgehead along the longest bridge, back along the next, then the main bridge from the end
      // nearer to bridgehead 1.
      const [h1, h2] = heads, bridges = ring(h1).map((x) => (x === h2 ? [] : walk(h1, x, h2)));
      const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].filter((o) => bridges[o[0]].length >= bridges[o[1]].length && bridges[o[1]].length >= bridges[o[2]].length);
      const [x, y, z] = orders[0].map((i) => bridges[i].length);
      // Two rings of five or more sharing a bond take fusion names (P-25.0), so a von Baeyer name is used for them only
      // when they are not aromatic (one ring double bond at most: DBU, bicyclo[4.4.0]dec-1-ene is named by fusion).
      if (!z && y >= 3 && bonds.filter(([a, b]) => this.ord(a, b) === 2).length > 1) return undefined;
      prefix = `bicyclo[${x}.${y}.${z}]`;
      for (const [m, from1] of [[h1, true], [h2, false]] as [number, boolean][]) for (const [a, b, c] of orders) {
        const fwd = (p: number[]) => (from1 ? p : [...p].reverse());
        nums.push([m, ...fwd(bridges[a]), from1 ? h2 : h1, ...[...fwd(bridges[b])].reverse(), ...fwd(bridges[c])]);
      }
    } else if (spiro.length === 1 && !heads.length) {
      // Number from the smaller ring, at an atom next to the spiro atom, round to the spiro atom, then round the other.
      const s = spiro[0], loops: number[][] = [];
      for (const x of ring(s)) if (!loops.some((l) => l.includes(x))) loops.push(walk(s, x, s));
      if (loops.length !== 2) return undefined;
      loops.sort((a, b) => a.length - b.length);
      prefix = `spiro[${loops[0].length}.${loops[1].length}]`;
      const firsts = loops[0].length === loops[1].length ? [0, 1] : [0];
      for (const f of firsts) for (const r1 of [loops[f], [...loops[f]].reverse()]) for (const r2 of [loops[1 - f], [...loops[1 - f]].reverse()]) nums.push([...r1, s, ...r2]);
    } else return undefined;
    nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] !== "C" ? i + 1 : 0)).filter(Boolean));
    for (const e of BRIDGE_ORDER) nums = this.lowest(nums, (num) => num.map((a, i) => (this.el[a] === e ? i + 1 : 0)).filter(Boolean));
    return { prefix, nums, bonds };
  }
  // Every map of the skeleton onto the ring system that keeps elements and bonds, as numberings (the atom at each
  // locant). Atoms and bonds are equal in number, so a map that keeps every skeleton bond is an isomorphism.
  match(tpl: Fused, atoms: number[], ring: (a: number) => number[]): number[][] {
    const out: number[][] = [], map: number[] = tpl.el.map(() => -1), used = new Set<number>();
    let steps = 0;
    const place = (k: number) => {
      if (++steps > 20000) throw new Error("ring match"); // bounded: the app names on every selection
      if (k === tpl.order.length) { out.push([...map]); return; }
      const p = tpl.order[k], placed = tpl.adj[p].filter((q) => map[q] >= 0);
      for (const a of placed.length ? ring(map[placed[0]]) : atoms) {
        if (used.has(a) || (this.el[a] !== tpl.el[p] && tpl.el[p] !== "*") || ring(a).length !== tpl.adj[p].length || !placed.every((q) => this.ord(map[q], a))) continue;
        map[p] = a;
        used.add(a);
        place(k + 1);
        map[p] = -1;
        used.delete(a);
      }
    };
    place(0);
    return out;
  }
  // Indicated hydrogen (P-31.1.4.2.4), added hydrogen (P-31.1.4.3.4) and hydro prefixes for a fused system in one
  // numbering. Every C and N with no ring double bond is accounted for. A parent with an odd number of C and N atoms
  // needs indicated hydrogen, one whose atoms cannot otherwise pair up two (1H,3H-naphtho[1,8-cd]pyran-1,3-dione): on
  // a lone ketone's carbon (1,3-dihydro-2H-indol-2-one), else on the lowest free or ketone atoms (2,3-dihydro-1H-indole,
  // 1H-indole-2,3-dione). Ketones in pairs need nothing more; a ketone left on its own takes added hydrogen from the
  // lowest free atom (naphthalen-1(2H)-one, 1H-isoindole-1,3(2H)-dione), and ketones that cannot pair take one each
  // (pteridine-2,4(1H,3H)-dione). The rest are hydro prefixes, in pairs.
  saturation(f: FusedSys, num: number[], ketones: number[]): Saturation {
    const byLoc = (l: number[]) => [...l].sort((a, b) => num.indexOf(a) - num.indexOf(b));
    ketones = ketones.filter((a) => f.cn.includes(a)); // a ketone on a bridge or a saturated spiro ring needs nothing
    // f.cn, not the template, counts: a ring O+ or S+ takes a double bond (phenothiazin-5-ium).
    // Sets of m atoms from a list, in its order.
    const sets = (l: number[], m: number): number[][] => (!m ? [[]] : l.flatMap((a, i) => sets(l.slice(i + 1), m - 1).map((r) => [a, ...r])));
    // A parent named as a whole has its own (21H,23H-porphyrin, 21H,22H,23H-corrole).
    let indicated = f.tpl.hydrogens ?? (f.cn.length % 2 ? 1 : !pairable(f.cn, f.ring) ? 2 : 0);
    // A parent whose atoms cannot pair up even so needs two more (P-31.1.4.2.4): the O-CH2-O carbons of
    // bis[1,3]dioxolo[4,5-b:4',5'-d]pyran (topiramate) each take one, and the pyran a third.
    if (indicated === 1 && f.cn.length <= 30 && !f.cn.some((a) => pairable(f.cn.filter((b) => b !== a), f.ring))) indicated = 3;
    const lone = ketones.length % 2 ? byLoc(ketones) : [];
    const pool = [...lone, ...byLoc(f.d.filter((a) => !lone.includes(a)))];
    for (const xs of sets(pool, indicated)) {
      const left = ketones.filter((a) => !xs.includes(a)), free = byLoc(f.d.filter((a) => !xs.includes(a) && !ketones.includes(a)));
      // The fewest added hydrogens; the parent with its indicated and added hydrogen must exist: the other C and N atoms
      // pair up into double bonds.
      for (let m = left.length % 2; m <= Math.min(left.length, 3); m += 2) for (const ys of sets(free, m)) {
        const sat = new Set([...ketones, ...xs, ...ys]);
        if (!pairable(f.cn.filter((a) => !sat.has(a)), f.ring)) continue;
        const hydro = byLoc(f.d.filter((a) => !sat.has(a)));
        if (hydro.length % 2) continue;
        return { x: xs[0], xs, y: ys[0], ys, yOn: ys.length === 1 ? left[0] : undefined, hydro };
      }
    }
    throw new Error("indicated hydrogen");
  }
  adjacentIn = (cycle: number[], a: number, b: number) => Math.abs(cycle.indexOf(a) - cycle.indexOf(b)) % (cycle.length - 2) === 1 || Math.abs(cycle.indexOf(a) - cycle.indexOf(b)) === 1;
  // The numberings whose locants (from f) are lowest at the first point of difference.
  lowest(nums: number[][], f: (num: number[]) => number[]): number[][] {
    let best: number[][] = [], bestL: number[] | undefined;
    for (const num of nums) {
      const l = f(num).sort((a, b) => a - b), c = bestL ? compare(l, bestL) : -1;
      if (c < 0) { best = [num]; bestL = l; } else if (c === 0) best.push(num);
    }
    return best;
  }

  // ——— Naming a parent with its suffix, prefixes and numbering ———
  // atoms: the parent's chain (in order) or ring (in cycle order). attach: for a substituent, the atom with the free
  // valence and the atom it is joined to. suffix: the principal groups expressed as a suffix.
  nameParent(p: Parent, opts: { kind?: Kind; attach?: [number, number]; acyl?: boolean; sulfo?: string; skip?: Set<number>; tiebreak?: (nums: number[][]) => number[][]; mult?: [number, number] }): Name & { score: number[]; label?: (a: number) => string; prefixes?: number } {
    const { atoms } = p, inParent = new Set(atoms), kind = opts.kind;
    const skip = opts.skip ?? new Set<number>();
    const info = p.hetero ? ({ numberings: [atoms, [...atoms].reverse()], aromatic: false } as ReturnType<Namer["ringInfo"]>)
      : p.assembly ? this.assemblyInfo(p.assembly) : p.ring ? this.ringInfo(atoms) : undefined;
    const numberings = p.ring ? info!.numberings : [atoms, [...atoms].reverse()];
    // Suffix sites: the parent atom each principal group sits on (a chain's own functional carbon, or the ring atom
    // a functional carbon hangs on), and the group atoms used up by the suffix.
    const sites: { atom: number; group: number }[] = [];
    const used = new Set<number>();
    if (kind) {
      for (const [g, on] of this.bearer) {
        if (this.group[g] !== kind || skip.has(g)) continue;
        if (CARBON_GROUP.has(kind)) {
          if (inParent.has(g) && !p.ring && !p.attached) sites.push({ atom: g, group: g });
          else if ((p.ring || p.attached) && on.some((a) => inParent.has(a))) { sites.push({ atom: on.find((a) => inParent.has(a))!, group: g }); used.add(g); }
        } else if (kind === "ketone" && (this.el[g] === "O" || this.el[g] === "S")) { if (inParent.has(on[0])) { sites.push({ atom: on[0], group: g }); used.add(g); } } // =O on a ring S or P, =S on a ring P
        else if (kind === "ketone" || kind === "imine") { if (inParent.has(g)) { sites.push({ atom: g, group: g }); used.add(kind === "ketone" ? this.carbonylO[g] : this.imineN(g)!); } }
        else { const a = on.find((x) => inParent.has(x)); if (a !== undefined) { sites.push({ atom: a, group: g }); used.add(g); } }
      }
    }
    // A carbanion or carbocation in the parent is its suffix; a pyrylium ring is a parent with no suffix.
    if (atoms.some((a) => (this.group[a] === "ide" || this.group[a] === "ylium") && !sites.some((s) => s.group === a))) throw new Error("ion as a prefix");
    // With a ring carbanion, an ylide: pyrylium-2-ide.
    if (info?.ring && Object.values(ION_RINGS).includes(info.ring) && ((kind && !(kind === "ide" && sites.every((s) => inParent.has(s.atom)))) || opts.attach || !atoms.some((a) => this.q[a] === 1))) throw new Error("ring cation");
    // ethanethioamide, 2-methylpropane-2-peroxol (namer-hetero.ts), 2-aminoethane-1-selenonate (namer-maingroup.ts)
    const thio = chalcogenIonSuffix(this, kind, sites) ?? variantSuffix(this, kind, sites, used, p.ring);
    const oxides = nOxides(this, atoms, sites, kind, used, !opts.attach && !opts.sulfo); // pyridine 1-oxide (namer-hetero.ts)
    // Prefixes: every neighbour outside the parent that the suffix does not use, and N-substituents of an amide or amine suffix.
    const prefixes: { atom: number; name: Name; n?: boolean }[] = [];
    for (const a of atoms) {
      for (const x of this.adj[a]) {
        if (inParent.has(x) || used.has(x) || (opts.attach && x === opts.attach[1] && a === opts.attach[0]) || (opts.mult && x === opts.mult[1] && a === opts.mult[0])) continue;
        if (kind === "ketone" && sites.some((s) => s.atom === a) && x === this.carbonylO[a]) continue;
        if (CARBON_GROUP.has(kind!) && !p.ring && sites.some((s) => s.group === a) && (x === this.carbonylO[a] || this.groupHetero(a).includes(x))) continue;
        if (x === this.carbonylO[a] && !p.ring && opts.acyl && a === atoms[0]) continue; // the acyl group's own =O
        if (x === this.carbonylO[a] || (this.ord(a, x) === 2 && this.el[x] === "O")) { prefixes.push({ atom: a, name: { text: this.el[x] === "S" ? "sulfanylidene" : "oxo", compound: false } }); continue; }
        if (this.ord(a, x) === 2 && this.group[x] === "imine") { prefixes.push({ atom: a, name: this.iminoPrefix(x, a) }); continue; }
        prefixes.push({ atom: a, name: this.substituent(x, a) });
      }
    }
    // With several amide or amine suffixes, N-locants name their suffix's locant (N1,N4) and count for numbering.
    // An amidine's amino N is N, its imino N is N' (P-66.4.1.3): N'-hydroxyethanimidamide. A hydrazide's second N is
    // N' (P-66.3.1.2): N'-phenylacetohydrazide.
    const prime = new Set<{ atom: number; name: Name; n?: boolean }>();
    for (const s of sites) {
      const nAtom = kind === "amide" || kind === "amidine" || kind === "hydrazide" ? this.amideN(s.group) : kind === "amine" || kind === "aminium" ? s.group : kind === "imine" || kind === "imidic" || kind === "imidate" || kind === "imidoylhalide" ? this.imineN(s.group) : sulfonamideN(this, kind, s.group) ?? this.ionN(kind, s.group);
      const second = kind === "amidine" ? this.imineN(s.group) : kind === "hydrazide" ? this.hydrazideN(s.group, nAtom!) : undefined;
      for (const a of second !== undefined ? [nAtom!, second] : nAtom === undefined ? [] : [nAtom])
        for (const x of this.adj[a]) if (x !== s.group && !inParent.has(x) && x !== s.atom && x !== second && x !== nAtom && !used.has(x) && !(opts.mult && a === opts.mult[0] && x === opts.mult[1])) {
          prefixes.push({ atom: s.atom, name: this.substituent(x, a), n: true });
          if (a !== nAtom) prime.add(prefixes[prefixes.length - 1]);
        }
    }
    if (prime.size && sites.length > 1) throw new Error("several amidines");
    const manyN = sites.length > 1 && prefixes.some((x) => x.n), counted = prefixes.filter((x) => !x.n || manyN);
    // Choose the numbering (P-31.1.4): indicated hydrogen, then free valence and suffixes, then added hydrogen, then
    // hydro prefixes, multiple bonds and double bonds, then all prefixes, then the prefix cited first in alphabetical order.
    const fused = info?.fused, assembly = info?.assembly, saturation = new Map<number[], Saturation>();
    const sat = (num: number[]) => {
      let v = saturation.get(num);
      if (!v) saturation.set(num, (v = (fused!.mono === undefined ? this.saturation : this.monoSaturation).call(this, fused!, num, kind === "ketone" || kind === "imine" ? sites.map((x) => x.atom) : [])));
      return v;
    };
    const bridged = info?.bridged;
    const multiple = (num: number[], o?: number) => bridged ? bridged.bonds.flatMap(([a, b]) => {
      // A double bond between atoms with locants that do not follow on (a bridgehead's) cannot be cited this way.
      const ord = this.ord(a, b), x = loc(num, a), y = loc(num, b);
      return ord > 1 && (o === undefined || ord === o) ? [Math.abs(x - y) === 1 ? Math.min(x, y) : 1000 + Math.min(x, y)] : [];
    }).sort((a, b) => a - b) : num.flatMap((a, k) => {
      const b = num[(k + 1) % num.length];
      if (k === num.length - 1 && !p.ring) return [];
      if ((p.ring && info!.aromatic) || p.hetero) return [];
      const ord = this.ord(a, b);
      return ord > 1 && (o === undefined || ord === o) ? [k + 1] : [];
    });
    const loc = (num: number[], a: number) => num.indexOf(a) + 1;
    const label = (num: number[], a: number) => {
      const k = num.indexOf(a);
      if (fused?.tpl.uncited?.includes(k)) throw new Error("interior locant");
      return assembly ? assembly.labels[k >> 1] + (k & 1 ? "'" : "") : fused ? fused.tpl.labels[k] : String(k + 1);
    };
    const one = (a?: number) => (a === undefined ? [] : [a]), xs = (s: Saturation) => s.xs ?? one(s.x), ys = (s: Saturation) => s.ys ?? one(s.y);
    let nums = numberings;
    // λ-atoms, then indicated hydrogen (P-31.1.4.2.4). A monocycle's numbering has its λ-atoms already.
    const lam = fused && fused.mono === undefined ? atoms.filter((a) => this.lambda(a)) : [];
    if (lam.length) nums = this.lowest(nums, (num) => lam.map((a) => loc(num, a)));
    if (fused) nums = this.lowest(nums, (num) => xs(sat(num)).map((a) => loc(num, a)));
    if (opts.attach) nums = this.lowest(nums, (num) => [loc(num, opts.attach![0])]);
    if (opts.acyl && !p.ring) nums = nums.filter((num) => num[0] === atoms[0]);
    nums = this.lowest(nums, (num) => sites.map((s) => loc(num, s.atom)));
    const bySites = nums; // the numberings that keep the suffixes in place
    // A ring's cationic centres (-ium) come next, as suffixes do (P-31.1.4.2.4): 6-methylpyrimidin-1-ium.
    if (p.ring) nums = this.lowest(nums, (num) => atoms.filter((a) => this.q[a] === 1 && (this.cationN(a) || this.ions.has(a))).map((a) => loc(num, a)));
    // A multiplied unit's attachment comes next (namer-multiplicative.ts): 2,2'-oxydi(ethan-1-ol).
    // A unit joined through an amine N (N1,N1'-…bis(…benzene-1,4-diamine)) counts at the atom that N is on.
    if (opts.mult) { const at = inParent.has(opts.mult[0]) ? opts.mult[0] : sites.find((s) => s.group === opts.mult![0])?.atom ?? opts.mult[0]; nums = this.lowest(nums, (num) => [loc(num, at)]); }
    if (fused) {
      nums = this.lowest(nums, (num) => ys(sat(num)).map((a) => loc(num, a)));
      nums = this.lowest(nums, (num) => [...sat(num).hydro, ...(fused.dehydro?.flat() ?? [])].map((a) => loc(num, a))); // hydro and dehydro together
    }
    nums = this.lowest(nums, (num) => multiple(num));
    nums = this.lowest(nums, (num) => multiple(num, 2));
    nums = this.lowest(nums, (num) => counted.map((x) => loc(num, x.atom)));
    const alpha = [...new Set(counted.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)));
    for (const t of alpha) nums = this.lowest(nums, (num) => counted.filter((x) => x.name.text === t).map((x) => loc(num, x.atom)));
    if (opts.tiebreak) nums = opts.tiebreak(nums);
    const num = nums[0];

    // Assemble (P-14, P-16): prefixes in alphabetical order, then the parent, unsaturation and suffix.
    const size = atoms.length;
    const retainedKey = info?.ring ? `${info.ring.name}:${kind}` : !p.ring && !p.attached ? `C${size}:${kind}` : "";
    let retained = kind && !opts.attach && !thio && RETAINED[retainedKey];
    // Acetic acid and the like keep their name only without multiple bonds; the suffix site is fixed.
    if (retained && !p.ring && (multiple(num).length || sites.length !== 1)) retained = undefined;
    if (retained && info?.ring && sites.length !== 1) retained = undefined;
    // Suffix locants; added hydrogen goes with its ketone: naphthalen-1(2H)-one.
    const added = fused ? sat(num) : undefined;
    const sitesLoc = sites.map((s) => s.atom).sort((a, b) => loc(num, a) - loc(num, b))
      .map((a, i, all) => label(num, a) + (added && ys(added).length && (added.yOn === a || (added.yOn === undefined && i === all.length - 1)) ? `(${ys(added).map((y) => `${label(num, y)}H`).join(",")})` : ""));
    // Locants are left out only where nothing else could be meant (P-14.3.4). Substitutable hydrogen is on the parent's
    // atoms and on the N of its suffix; not on the O of an acid or alcohol, nor on a formyl carbon (P-14.3.4.5).
    const plain = !fused && !assembly && !bridged && !p.attached, cPrefixes = prefixes.filter((x) => !x.n);
    const nH = cPrefixes.length < prefixes.length || sites.some((s) => [s.group, ...this.adj[s.group]].some((x) => !inParent.has(x) && this.el[x] === "N" && this.h[x] > 0));
    const hAt = (a: number) => this.h[a] > 0 && !(kind === "aldehyde" && sites.some((s) => s.group === a));
    const places = atoms.filter((a) => hAt(a) || cPrefixes.some((x) => x.atom === a));
    // Where a symmetry of the parent (a numbering that keeps its atoms and multiple bonds) takes atom a.
    const orbit = (ns: number[][], a: number) => new Set(ns.filter((n) => atoms.every((b) => {
      const f = n[num.indexOf(b)];
      return this.el[f] === this.el[b] && (!!info?.aromatic || this.adj[b].every((c) => !inParent.has(c) || this.ord(b, c) === this.ord(f, n[num.indexOf(c)])));
    })).map((n) => n[num.indexOf(a)]));
    // One substituent, prefix or suffix, on a parent hydride with one kind of substitutable hydrogen (P-14.3.4.2,
    // P-14.3.4.3): ethanol, chloroethene, bromobenzene, pyrazinecarboxylic acid; but 2-chloroethan-1-ol and
    // 1-phenylethan-1-one (P-31.1.4.2.4).
    const subs = [...cPrefixes.map((x) => x.atom), ...sites.map((s) => s.atom), ...(opts.sulfo ? [opts.attach![0]] : [])];
    const hydride = plain && (!opts.attach || !!opts.sulfo) && subs.length === 1 && atoms.filter((a) => hAt(a) || subs.includes(a)).every((a) => orbit(numberings, subs[0]).has(a));
    // Substitutable hydrogen of the parent compound at one place (P-14.3.4.6): difluoroacetic acid, chloroacetyl,
    // diphenylethenone; or one prefix and one kind of place on a chain acid, nitrile and the like (P-14.3.4.3):
    // chlorobutanedioic acid, but 2-methylpropanediamide and 1-ethyl 4-methyl 2-hydroxybutanedioate. A stereo
    // descriptor tells those places apart: (2S)-2-aminobutanedioic acid.
    const stereoOn = atoms.some((a) => this.cip[a] === "R" || this.cip[a] === "S" || this.adj[a].some((b) => /^[EZ]$/.test(this.cipBond.get(this.key(a, b)) ?? "")));
    const compound = plain && !nH && cPrefixes.length > 0 && ((places.length === 1 && (size === 2 || !multiple(num).length)) ||
      (cPrefixes.length === 1 && !p.ring && !stereoOn && ["acid", "nitrile", "aldehyde", "halide", "carboxylate"].includes(kind!) && places.every((a) => orbit(bySites, cPrefixes[0].atom).has(a))));
    // One prefix in every place (P-14.3.4.5): hexachlorobenzene, pentafluoropropanoic acid, tetrafluoroethene.
    const full = plain && !nH && cPrefixes.length > 0 && !atoms.some(hAt) && cPrefixes.every((x) => x.name.text === cPrefixes[0].name.text);
    // A multiplied unit's attachment is a substituent too (namer-multiplicative.ts): 2,2'-oxydi(ethan-1-ol).
    const free = (!p.ring && size === 1) || (!opts.mult && (hydride || compound)); // no locants at all: chloromethane, ethanol
    const prefixText = assemblePrefixes(prefixes.map((x) => ({ loc: x.n ? (manyN ? `N${label(num, x.atom)}` : prime.has(x) ? "N'" : "N") : label(num, x.atom), name: x.name })), free || full)
      // Isotopes on the parent and its suffix's heteroatoms go after the prefixes (P-82): trichloro(²H₁)methane.
      + (!this.isotopic ? "" : isotopeText(this, atoms, [...used, ...(kind && CARBON_GROUP.has(kind) ? sites.flatMap((s) => [s.group, ...this.groupHetero(s.group), this.carbonylO[s.group]]) : [])]
        .filter((a, k, all) => a >= 0 && !inParent.has(a) && all.indexOf(a) === k), (a) => label(num, a)));
    let parent: string;
    if (p.hetero) parent = p.hetero; // hydrazine, diazene
    else if (retained) parent = retained;
    else if (fused) {
      // Hydro prefixes, then indicated hydrogen, in front of the parent (P-31.1.4.2.4): 2,3-dihydro-1H-indole.
      const { hydro } = sat(num), x = xs(sat(num));
      const h = !hydro.length ? "" : `${hydro.length === fused.cn.length && !fused.tpl.bridges ? "" : hydro.map((a) => label(num, a)).join(",") + "-"}${HYDRO[hydro.length]}hydro`;
      const dh = fused.dehydro?.flat().map((a) => label(num, a)).sort(locOrder) ?? [];
      // Bridges of a bridged fused system go in front of the parent: 4,7-methanoindene. λ-atoms follow indicated
      // hydrogen (lambdaName): 10H-10λ⁵-dibenzo[b,e][1,4]oxarsinine, 1λ⁶,2-benzothiazine.
      const core = (x.length ? `${x.map((a) => `${label(num, a)}H`).join(",")}-` : "") + lambdaName(fused.tpl.name, lam.map((a) => `${label(num, a)}${this.lambda(a)}`));
      parent = joinPrefixes(dh.length ? `${dh.join(",")}-${MULT[dh.length]}dehydro` : "", joinPrefixes(h, fused.tpl.bridges ? joinPrefixes(fused.tpl.bridges, core) : core));
    } else if (assembly) {
      // 1,1'-biphenyl; in brackets before a suffix: [1,1'-biphenyl]-4-carboxylic acid.
      const junction = [...assembly.junction].sort((a, b) => loc(num, a) - loc(num, b)).map((a) => label(num, a)).join(",");
      parent = kind || opts.attach ? `[${junction}-${assembly.stem}]` : `${junction}-${assembly.stem}`;
    } else if (p.ring && info!.ring) parent = (info!.ring.hydrogen && (!opts.attach || opts.sulfo || opts.acyl) ? info!.ring.hydrogen : "") + info!.ring.name;
    else if (bridged) {
      // A large monocycle's double bond from its last atom to atom 1 takes a compound locant (P-31.1.4.2.4): 1(13).
      const closure = (l: number[]) => l.map((x) => (x > 999 ? `${x - 1000}(${size})` : String(x))).sort((a, b) => parseInt(a) - parseInt(b));
      if (multiple(num).some((l) => l > 999) && bridged.prefix !== "cyclo") throw new Error("bridgehead double bond");
      // Replacement prefixes in front: 8-azabicyclo[3.2.1]octane, 1,4-dioxaspiro[4.5]decane, and azonia for an N+
      // (P-73.1.2): 1,4-diazoniabicyclo[2.2.2]octane.
      const replaced = [...REPLACE, ["N+", "azonia"]].map(([e, word]) => {
        const at = atoms.filter((a) => (e === "N+" ? this.el[a] === "N" && this.q[a] === 1 : this.el[a] === e && !this.q[a])).map((a) => loc(num, a)).sort((a, b) => a - b).map((l) => `${l}${this.lambda(num[l - 1])}`);
        return at.length ? `${at.join(",")}-${MULT[at.length]}${word}` : "";
      }).filter(Boolean).join("-");
      parent = (replaced ? `${replaced}${/^\d/.test(bridged.prefix) ? "-" : ""}` : "") + (bridged.retained ?? bridged.prefix + chainStem(size, closure(multiple(num, 2)), closure(multiple(num, 3)), true));
    }
    else parent = (p.ring ? "cyclo" : "") + chainStem(size, multiple(num, 2), multiple(num, 3), p.ring);
    // A ring's one multiple bond needs no locant when nothing else is cited (P-31.1.4.2.4): cyclohexene, cyclooctyne;
    // likewise propene and propyne (P-14.3.4.2).
    if ((p.ring ? !info?.ring && !fused && !bridged && !assembly : size === 3) && multiple(num).length === 1 && !prefixes.length && !sites.length && !opts.attach) parent = parent.replace(/-1-(ene|yne)$/, "$1");
    // A ring cation (P-73.1.2): pyridin-1-ium, 1-methylpyridin-1-ium, acridin-10-ium; with an anion suffix,
    // 1-methylpyridin-1-ium-3-carboxylate; as a prefix, pyridin-1-ium-1-yl.
    const ium = p.ring && !bridged ? atoms.filter((a) => this.cationN(a) || (fused && this.ions.has(a) && this.q[a] === 1)) : [];
    if (ium.length) {
      if ((kind && !(ANION_KINDS as Kind[]).includes(kind)) || opts.acyl || opts.sulfo || retained) throw new Error("ring cation");
      parent = `${(opts.attach && info?.ring?.hydrogen) || ""}${parent.replace(/e$/, "")}-${ium.map((a) => label(num, a)).sort(locOrder).join(",")}-${MULT[ium.length]}ium`;
    }
    let text: string;
    // N-substituents need no ring locant: N-methylcyclohexanecarboxamide.
    const locantFree = p.ring && !fused && !assembly && !bridged && (!info?.ring || info.ring.name === "benzene") && prefixes.every((x) => x.n) && !multiple(num).length && !opts.mult;
    if (opts.sulfo) text = joinPrefixes(prefixText, withSuffix(parent, undefined, [label(num, opts.attach![0])], p.ring, locantFree, free, opts.sulfo));
    else if (opts.attach) text = joinPrefixes(prefixText, ium.length ? `${parent}-${label(num, opts.attach[0])}-yl` : this.substituentForm(parent, info, label(num, opts.attach[0]), p.ring, size, !!opts.acyl, multiple(num).length > 0));
    else if (retained) text = prefixText + retained; // benzoic acid, acetic acid: the suffix locant is understood
    else if (kind === "ylium") {
      // Carbocations take the substituent form (P-73.2.1): methylium, propan-2-ylium, cyclohexylium, benzenylium.
      if (sites.length !== 1) throw new Error("several ylium centres");
      const yl = this.substituentForm(parent, info, sitesLoc[0], p.ring, size, false, multiple(num).length > 0);
      text = joinPrefixes(prefixText, (yl === "phenyl" ? (prefixes.length ? `benzen-${sitesLoc[0]}-yl` : "benzenyl") : yl) + "ium");
    }
    else text = joinPrefixes(prefixText, withSuffix(parent, kind, sitesLoc, p.ring || !!p.attached, locantFree, !p.attached && free, thio));
    if (p.attached && size === 1) text = text.replace(/methane-1(,1)+-/, "methane"); // methanetricarboxylic acid
    text += oxideText(this, oxides, (a) => label(num, a)); // after the suffix: N,N-dimethylaniline N-oxide
    // Benzyl, benzylidene and benzylidyne are the preferred prefixes when not substituted (P-29.6.1): 2-benzylpyridine,
    // but 2-[(4-bromophenyl)methyl]pyridine.
    const benzyl = !!opts.attach && /^phenylmethyl(idene|idyne)?$/.test(text);
    if (benzyl) text = text.replace("phenylmethyl", "benzyl");
    // Stereodescriptors (P-91, P-93): R and S on the parent's atoms, E and Z on its double bonds, in locant order,
    // in front of everything they belong to.
    const stereo: { at: number; text: string }[] = [];
    for (const a of atoms) if (this.cip[a] === "R" || this.cip[a] === "S") stereo.push({ at: loc(num, a), text: `${label(num, a)}${this.cip[a]}` });
    // E and Z on an imine's C=N, at the carbon's locant: (1E)-N-hydroxyethanimine.
    if (kind === "imine") for (const st of sites) { const c = this.cipBond.get(this.key(st.atom, this.imineN(st.atom)!)); if (c === "E" || c === "Z") stereo.push({ at: loc(num, st.atom), text: `${label(num, st.atom)}${c}` }); }
    // Likewise on the C=N of an amidine, imidic acid, imidate or imidoyl halide that ends a chain: (1Z)-N'-hydroxyethanimidamide.
    if (kind && ["amidine", "imidic", "imidate", "imidoylhalide"].includes(kind) && !p.ring && !p.attached) for (const st of sites) {
      const c = this.cipBond.get(this.key(st.group, this.imineN(st.group)!));
      if (c === "E" || c === "Z") stereo.push({ at: loc(num, st.atom), text: `${label(num, st.atom)}${c}` });
    }
    // E and Z on an ylidene's double bond, at the parent atom's locant: (2E)-2-ethylidenecyclohexan-1-one.
    for (const a of new Set(prefixes.filter((x) => !x.n).map((x) => x.atom))) for (const y of this.adj[a]) {
      const free = opts.attach && a === opts.attach[0] && y === opts.attach[1]; // cited by the parent the group is on
      const c = !inParent.has(y) && !free && this.el[y] === "C" && this.ord(a, y) === 2 ? this.cipBond.get(this.key(a, y)) : undefined;
      if (c === "E" || c === "Z") stereo.push({ at: loc(num, a), text: `${label(num, a)}${c}` });
    }
    if (fused || assembly) {
      if (atoms.some((a) => this.adj[a].some((b) => inParent.has(b) && /^[EZ]$/.test(this.cipBond.get(this.key(a, b)) ?? "")))) throw new Error("ring E/Z");
    } else if (p.hetero) {
      const e = this.cipBond.get(this.key(atoms[0], atoms[1])); // (E)-diazene-1,2-dicarboxylate
      if (e === "E" || e === "Z") stereo.push({ at: 0, text: e });
    } else for (let k = 0; k + 1 < num.length + (p.ring ? 1 : 0); k++) {
      const c = this.cipBond.get(this.key(num[k], num[(k + 1) % num.length]));
      if (c === "E" || c === "Z") stereo.push({ at: k + 1, text: `${k + 1}${c}` });
    }
    stereo.push(...suffixStereo(this, sites, stereo.length)); // (R)-2-methylpropane-2-sulfinamide (namer-hetero.ts)
    if (stereo.length) text = `(${stereo.sort((x, y) => x.at - y.at).map((x) => x.text).join(",")})-${text}`;
    // A prefix needs brackets when it carries prefixes of its own or locants (P-16.5.1).
    return { text, compound: (prefixes.length > 0 && !benzyl) || stereo.length > 0 || /[\d,]/.test(text) || NUCLIDE.test(text), score: [], label: (a: number) => label(num, a), prefixes: prefixes.length }; // [(²H₃)methyl]
  }
  groupHetero = (c: number) => this.adj[c].filter((j) => j !== this.carbonylO[c] && this.el[j] !== "C" && !this.nitroAtom(j) && !this.nitrosoAtom(j)); // a nitro group is a prefix: nitroformic acid
  // The N of an amide, amidine or hydrazide on carbon c: not the ring N it may hang on (piperidine-1-carboxamide), nor
  // an amidine's =N.
  amideN = (c: number) => this.groupHetero(c).find((j) => !this.inRing[j] && this.ord(c, j) === 1 && !this.bearer.get(c)?.includes(j));

  // The ring or chain stem as a substituent prefix: phenyl, pyridin-3-yl, cyclohexyl, propan-2-yl, acetyl.
  substituentForm(parent: string, info: ReturnType<Namer["ringInfo"]> | undefined, at: string, ring: boolean, size: number, acyl: boolean, unsaturated: boolean): string {
    if (info?.fused) return acyl ? `${parent}-${at}-carbonyl` : `${parent.replace(/e(\]?)$/, "$1")}-${at}-yl`; // 1H-indol-3-yl
    if (acyl) {
      if (ring) return parent === "benzene" ? "benzoyl" : `${parent}-${at}-carbonyl`; // 1H-pyrrole-2-carbonyl: nameParent puts the H in parent
      if (size === 2 && parent === "ethane") return "acetyl";
      if (size === 1) return "carbonyl"; // a substituted formyl: carboxycarbonyl (P-65.1.7.2.2)
      return parent.replace(/e$/, "") + "oyl";
    }
    if (info?.ring) {
      if (info.ring.name === "benzene") return "phenyl";
      const h = info.ring.hydrogen ? info.ring.hydrogen : "";
      return `${h}${info.ring.stem}-${at}-yl`;
    }
    if (ring) return at === "1" && !unsaturated && !info?.bridged ? parent.replace(/ane$/, "yl") : `${parent.replace(/e$/, "")}-${at}-yl`;
    if (!unsaturated && at === "1") return parent.replace(/ane$/, "yl");
    if (size === 2 && at === "1") return parent.replace(/e$/, "yl"); // ethenyl, ethynyl
    return `${parent.replace(/e$/, "")}-${at}-yl`.replace(/an-(\d+)-yl$/, "an-$1-yl");
  }

  // ——— Substituent prefixes ———
  substituent(x: number, from: number): Name {
    const opaque = this.opaque.get(x);
    if (opaque) return opaque;
    const tagged = isotopePrefix(this, x, from); // (²H₁)hydroxy (namer-maingroup.ts)
    if (tagged) return tagged;
    const only = this.ord(x, from) === 1 ? this.prefixOnly.get(x) : undefined; // isocyanato, isoselenocyanato
    if (only) return { text: only, compound: false };
    const imidoyl = this.ord(x, from) === 1 ? this.imidoylPrefix(x, from) : undefined; // carbamimidoyl, guanidines
    if (imidoyl) return imidoyl;
    const het = heteroPrefix(this, x, from); // disulfanyl, peroxy, hydrazinyl, diazenyl, nitroso (namer-hetero.ts)
    if (het) return het;
    const el = this.el[x];
    // Diazo is the one prefix on a double bond that Octet names (=N+=N-); =CH2 and the like are not covered.
    if (el === "N" && this.diazoAtom(x) && this.ord(x, from) === 2) return { text: "diazo", compound: false };
    if (chalcogenOne(this, x)) return { text: el === "Se" ? "selanylidene" : "tellanylidene", compound: false };
    if (el === "C" && this.ord(x, from) === 2) {
      if (this.group[x] || this.carbonylO[x] >= 0) throw new Error("ylidene");
      return this.ylidene(x, from);
    }
    if (this.ord(x, from) !== 1) throw new Error("ylidene");
    // Rings with a free valence, on a ring carbon or a ring nitrogen (piperidin-1-yl).
    if (this.inRing[x]) return this.nameParent({ atoms: this.rings[this.ringOf[x]], ring: true }, { attach: [x, from] });
    const ion = this.ionPrefix(x, from); // oxido, carboxylato, trimethylazaniumyl
    if (ion) return ion;
    if (MAIN[el]) return this.mainPrefix(x, from);
    // Groups Octet does not yet cite as prefixes.
    const g = this.group[x];
    if (g === "sulfonylhalide" || g === "aminium" || this.peroxO.has(x)) throw new Error(`${g} as a prefix`);
    // A carbonyl carbon reached from its own N or O is an acyl group: N-acetyl, carbamoyl, (methoxycarbonyl)oxy.
    if (el === "C" && this.carbonylO[x] >= 0 && this.groupHetero(x).includes(from) && !this.inRing[from]) return this.acylName(x, from);
    // Phosphanyl and phosphoryl (P-68.3.2.3): diphenylphosphanyl, diphenylphosphoryl.
    if (el === "P") {
      const subs = this.adj[x].filter((j) => j !== from && this.el[j] === "C").map((j) => this.substituent(j, x)), oxide = this.adj[x].some((j) => this.el[j] === "O");
      return { text: `${substituted(subs)}${oxide ? "phosphoryl" : "phosphanyl"}`, compound: subs.length > 0 };
    }
    // Sulfonic acids as sulfo; sulfoxides and sulfones as alkanesulfinyl and alkanesulfonyl (P-63.6, P-65.3.2.3).
    if (this.sulfur.has(x)) {
      const imino = this.adj[x].some((j) => this.el[j] === "N" && this.ord(x, j) === 2);
      if (g === "sulfonic" && imino) throw new Error("sulfonimidic acid as a prefix");
      if (g === "sulfonic") return { text: "sulfo", compound: false };
      const r = this.adj[x].find((j) => j !== from && this.el[j] === "C")!;
      const sulfo = imino ? "sulfonimidoyl" : this.adj[x].filter((j) => this.el[j] === "O").length === 2 ? "sulfonyl" : "sulfinyl"; // methanesulfonimidoyl
      const p = this.inRing[r] ? { atoms: this.rings[this.ringOf[r]], ring: true } : { atoms: this.bestChain(r, x), ring: false };
      return { text: this.nameParent(p, { attach: [r, x], sulfo }).text, compound: true };
    }
    if (HALO[el]) return { text: HALO[el], compound: false };
    if (el === "N" && this.nitroAtom(x)) return { text: "nitro", compound: false };
    if (el === "N" && this.azidoAtom(x)) return { text: "azido", compound: false };
    if (el === "O") {
      if (this.adj[x].length === 1) {
        if (this.h[x] === 1) return { text: "hydroxy", compound: false };
        throw new Error("oxygen substituent");
      }
      const r = this.adj[x].find((j) => j !== from)!;
      if (this.carbonylO[r] >= 0) {
        const acyl = this.acylName(r, x);
        return { text: `${enclose(acyl)}oxy`, compound: true };
      }
      const alkyl = this.substituent(r, x);
      const simple: Record<string, string> = { methyl: "methoxy", ethyl: "ethoxy", propyl: "propoxy", butyl: "butoxy", phenyl: "phenoxy", "tert-butyl": "tert-butoxy", benzyl: "benzyloxy" };
      if (simple[alkyl.text]) return { text: simple[alkyl.text], compound: simple[alkyl.text] === "benzyloxy" };
      // Methoxy, ethoxy, propoxy, butoxy and phenoxy keep their short form when substituted (P-63.2.2.2):
      // 2-chloroethoxy, (9H-fluoren-9-yl)methoxy, 4-nitrophenoxy.
      if (/(?<!cyclo)(meth|eth|prop|but|phen)yl$/.test(alkyl.text)) return { text: alkyl.text.replace(/yl$/, "oxy"), compound: true };
      return { text: `${enclose(alkyl)}oxy`, compound: true };
    }
    if (el === "S") {
      if (this.adj[x].length === 1 && this.h[x] === 1) return { text: "sulfanyl", compound: false };
      const r = this.adj[x].find((j) => j !== from)!;
      if (this.carbonylO[r] >= 0) return { text: `${enclose(this.acylName(r, x))}sulfanyl`, compound: true }; // acetylsulfanyl, (chloroacetyl)sulfanyl
      return { text: `${enclose(this.substituent(r, x))}sulfanyl`, compound: true };
    }
    if (el === "N") {
      const others = this.adj[x].filter((j) => j !== from);
      const acyl = others.filter((j) => this.carbonylO[j] >= 0);
      // A hydrazide's N-N as a prefix (P-68.3.1.2.1): hydrazinyl, 2-phenylhydrazinyl, 2-acetylhydrazinyl.
      const m = this.group[x] === "hydrazide" ? others.find((j) => this.el[j] === "N" && this.group[j] === "hydrazide") : undefined;
      if (m !== undefined) return hydrazinyl(this, x, from, m, "yl");
      if (acyl.length === 1 && others.length === 1) {
        const an = this.acylName(acyl[0], x), a = an.text;
        const retained: Record<string, string> = { acetyl: "acetamido", benzoyl: "benzamido", formyl: "formamido" };
        // Carbonic acyl groups keep their own brackets: carboxyamino, carbamoylamino, [(methoxycarbonyl)amino].
        const carbonic = !this.carbons(acyl[0]).length && !this.ringN(acyl[0]).length;
        return { text: retained[a] ?? `${enclose(carbonic ? an : { text: a, compound: true })}amino`, compound: !retained[a] };
      }
      // N-acyl, N-alkyl: acetyl(methyl)amino, diacetylamino.
      const subs = others.map((j) => (this.carbonylO[j] >= 0 ? this.acylName(j, x) : this.substituent(j, x)));
      if (!subs.length) return { text: "amino", compound: false };
      if (subs.length === 1) return { text: subs[0].text === "phenyl" ? "anilino" : `${enclose(subs[0])}amino`, compound: subs[0].text !== "phenyl" };
      // dimethylamino, bis(carboxymethyl)amino, (2-chloroethyl)(methyl)amino, with brackets nested as they should be.
      return { text: `${substituted(subs)}amino`, compound: true };
    }
    if (el !== "C") throw new Error("substituent");
    // Functional carbons cited as prefixes.
    const kind = this.group[x];
    const thio = thioPrefix(this, x, kind); // carbamothioyl (namer-hetero.ts)
    if (thio) return thio;
    if (kind === "acid") return { text: "carboxy", compound: false };
    if (kind === "aldehyde") return { text: "formyl", compound: false };
    if (kind === "nitrile") return { text: "cyano", compound: false };
    if (kind === "hydrazide") {
      // Hydrazinecarbonyl (P-66.3.2); with substituents on its N atoms, not yet.
      const n = this.groupHetero(x).find((j) => this.group[j] === "hydrazide")!, m = this.hydrazideN(x, n);
      if (this.adj[n].length !== 2 || m === undefined || this.adj[m].length !== 1) throw new Error("hydrazide as a prefix");
      return { text: "hydrazinecarbonyl", compound: true };
    }
    if (kind === "amide") {
      const nAtom = this.amideN(x)!, subs = this.adj[nAtom].filter((j) => j !== x).map((j) => this.substituent(j, nAtom));
      if (!subs.length) return { text: "carbamoyl", compound: false };
      const inner = subs.length === 2 && subs[0].text === subs[1].text ? `di${enclose(subs[0])}` : subs.map(enclose).join("");
      return { text: `${inner}carbamoyl`, compound: true };
    }
    if (kind === "ester") {
      const o = this.esterO.get(x)!, r = this.adj[o].find((j) => j !== x)!;
      const alkoxy = this.substituent(o, x); // named from the oxygen
      void r;
      return { text: `${enclose(alkoxy)}carbonyl`, compound: true }; // methoxycarbonyl, [(benzyloxy)carbonyl]
    }
    if (this.carbonylO[x] >= 0) return this.acylName(x, from);
    // tert-butyl and benzyl are retained prefixes (P-29.6).
    const methyls = this.carbons(x, [from]).filter((j) => this.h[j] === 3 && this.adj[j].length === 1);
    if (methyls.length === 3 && this.adj[x].length === 4) return { text: "tert-butyl", compound: false };
    const chain = this.bestChain(x, from);
    return this.nameParent({ atoms: chain, ring: false }, { attach: [x, from] });
  }

  // Prefixes for amidine, guanidine and carbodiimide groups (P-66.4.1.2.1.3): carbamimidoyl on its carbon,
  // carbamimidamido and (diaminomethylidene)amino on an N, [(ethylimino)methylidene]amino on a carbodiimide's N.
  // Undefined for anything else.
  imidoylPrefix(x: number, from: number): Name | undefined {
    const plain = (c: number) => this.adj[c].every((j) => j === x || j === from || (this.el[j] === "N" && this.adj[j].length === 1));
    if (this.el[x] === "C" && (this.group[x] === "amidine" || this.group[x] === "guanidine") && plain(x)) return { text: "carbamimidoyl", compound: false };
    if (this.el[x] !== "N" || this.adj[x].length !== 2) return undefined;
    const c = this.adj[x].find((j) => j !== from)!;
    if (this.diimine.has(c)) {
      const e = enclose(this.iminoPrefix(this.adj[c].find((j) => j !== x)!, c));
      return { text: `${enclose({ text: `${e}methylidene`, compound: true })}amino`, compound: true };
    }
    if (this.group[c] !== "guanidine") return undefined;
    if (this.ord(x, c) === 1) return plain(c) ? { text: "carbamimidamido", compound: false } : undefined;
    const subs = this.adj[c].filter((j) => j !== x).map((j) => this.substituent(j, c));
    return { text: `${enclose({ text: `${substituted(subs)}methylidene`, compound: true })}amino`, compound: true };
  }
  // A carbon joined to the parent by a double bond (P-29.2, P-31.1.4.3.4): its substituent group with -ylidene for
  // -yl, the free valence at the lowest locant: methylidene, propan-2-ylidene, cyclohexylidene, (oxolan-3-ylidene).
  ylidene(x: number, from: number): Name {
    const p = this.inRing[x] ? { atoms: this.rings[this.ringOf[x]], ring: true } : { atoms: this.bestChain(x, from), ring: false };
    const n = this.nameParent(p, { attach: [x, from] });
    if (!n.text.endsWith("yl")) throw new Error("ylidene");
    return { text: `${n.text}idene`, compound: n.compound };
  }
  // The prefix for =N on a parent atom: imino, (hydroxyimino), (methylimino).
  iminoPrefix(n: number, c: number): Name {
    const x = this.adj[n].find((j) => j !== c);
    return x === undefined ? { text: "imino", compound: false } : { text: `${enclose(this.substituent(x, n))}imino`, compound: true };
  }
  // An acyl group: the carbonyl carbon c joined (at its free valence) to `from`.
  acylName(c: number, from: number): Name {
    // C(=O) with a heteroatom besides `from` is named from it (P-65.1.7.4, P-65.2.1.5, P-65.5.2): carboxy,
    // tert-butoxycarbonyl, [(benzyloxy)carbonyl], carbamoyl, dimethylcarbamoyl, chlorocarbonyl. With C=S:
    // carbonothioyl, carbamothioyl (P-65.1.7.3).
    const rN = this.ringN(c), y = this.groupHetero(c).find((j) => j !== from && !rN.includes(j) && this.ord(c, j) === 1);
    if (y !== undefined) {
      const thio = thioDouble(this, c), carbonyl = thio ? "carbonothioyl" : "carbonyl";
      if (HALO[this.el[y]] || this.prefixOnly.has(y)) return { text: `${HALO[this.el[y]] ?? this.prefixOnly.get(y)}${carbonyl}`, compound: true };
      if (this.el[y] === "O" && this.adj[y].length === 1) return thio ? { text: "hydroxycarbonothioyl", compound: true } : { text: "carboxy", compound: false };
      if (this.el[y] === "O") return { text: `${enclose(this.substituent(y, c))}${carbonyl}`, compound: true };
      if (this.el[y] !== "N") throw new Error("acyl");
      const subs = this.adj[y].filter((j) => j !== c).map((j) => this.substituent(j, y));
      return { text: `${substituted(subs)}${thio ? "carbamothioyl" : "carbamoyl"}`, compound: subs.length > 0 };
    }
    const r = [...this.carbons(c, [from]), ...rN.filter((j) => j !== from)];
    if (!r.length) return thioAcyl(this, c, { text: "formyl", compound: false });
    if (this.inRing[r[0]]) {
      const cycle = this.rings[this.ringOf[r[0]]];
      return thioAcyl(this, c, this.nameParent({ atoms: cycle, ring: true }, { attach: [r[0], c], acyl: true }));
    }
    const chain = this.bestChain(c, from, true);
    return thioAcyl(this, c, this.nameParent({ atoms: chain, ring: false }, { attach: [c, from], acyl: true }));
  }

  // Acyclic carbon paths (no ring atoms) through or from `start`, not crossing `from`. A nitrile's carbon is in a chain
  // only when the chain is named with the -nitrile suffix; else it is cyano (ethyl cyanoacetate, P-66.5.1.2). Opaque
  // atoms (metals.ts) and the carbons of groups in namer-hetero.ts are never in a chain.
  paths(start: number, from: number, fromStart: boolean, nitrile = false, avoid?: Set<number>): number[][] {
    const ok = (j: number) => this.el[j] === "C" && !this.inRing[j] && j !== from && (nitrile || !this.isNitrileC(j)) && !avoid?.has(j) && !this.opaque.has(j) && !this.het.has(j);
    const walk = (a: number, seen: Set<number>): number[][] => {
      const next = this.adj[a].filter((j) => ok(j) && !seen.has(j) && (j === start || this.carbonylO[j] < 0 || true));
      const ends = next.flatMap((j) => walk(j, new Set([...seen, j])).map((p) => [j, ...p]));
      return ends.length ? ends : [[]];
    };
    const arms = walk(start, new Set([start]));
    if (!arms.some((a) => !a.length)) arms.push([]); // the path may also end at start
    if (fromStart) return arms.map((p) => [start, ...p]);
    const out: number[][] = [];
    for (const a of arms) for (const b of arms) {
      if (a.length && b.length && a[0] === b[0]) continue;
      out.push([...[...a].reverse(), start, ...b]);
    }
    return out;
  }
  // A substituent's chain (P-29, P-44.3): the longest, then the most multiple bonds, then the most double bonds,
  // then the lowest locant for the free valence, then the most prefixes.
  bestChain(x: number, from: number, fromStart = false): number[] {
    const multiple = (p: number[], o?: number) => p.slice(1).filter((a, k) => { const b = this.ord(p[k], a); return b > 1 && (o === undefined || b === o); }).length;
    const fv = (p: number[]) => Math.min(p.indexOf(x) + 1, p.length - p.indexOf(x));
    const subs = (p: number[]) => p.reduce((s, a) => s + this.adj[a].filter((j) => !p.includes(j) && j !== from).length, 0);
    const score = (p: number[]) => [-p.length, -multiple(p), -multiple(p, 2), fv(p), -subs(p)];
    // An acid's carbon (or a carboxylate's) is never in a substituent chain: carboxymethyl (P-65.1.2.3), not
    // 2-hydroxy-2-oxoethyl; carboxylatomethyl.
    const acids = new Set([...this.bearer.keys()].filter((g) => this.el[g] === "C" && (this.group[g] === "acid" || this.group[g] === "peroxy" || this.group[g] === "carboxylate") && g !== x));
    return this.paths(x, from, fromStart, false, acids).sort((a, b) => compare(score(a), score(b)))[0];
  }

  // ——— Main-group elements (P-68, P-69): Si, Ge, Sn, Pb, B, Al, Ga, In, Tl, As, Sb, Bi, Se, Te, Hg ———
  isOH = (j: number) => this.el[j] === "O" && this.h[j] === 1 && this.adj[j].length === 1 && !this.q[j];
  isOxo = (i: number, j: number) => this.el[j] === "O" && this.ord(i, j) === 2 && this.adj[j].length === 1 && !this.h[j] && !this.q[j];
  // B with charge -1 or As, Sb with charge +1, each with four bonds (P-73.1.1.2, P-73.2.2.1), the only charge, outside a
  // ring: an ion of a salt, as boranuide, arsanium or stibanium.
  mainIon = (i: number) => ((this.el[i] === "B" && this.q[i] === -1) || ((this.el[i] === "As" || this.el[i] === "Sb") && this.q[i] === 1)) && !this.inRing[i] && this.q.filter(Boolean).length === 1;
  // An ester's O on Si, Ge, Sn or Pb (outside a ring): trimethylsilyl acetate.
  silylEster = (o: number) => this.adj[o].some((j) => MAIN[this.el[j]]?.valence === 4 && this.el[j] !== "Hg" && !this.inRing[j]);

  // Checks the bonds of each main-group atom and marks selenols and tellurols (P-63.1.5). Each atom has its standard
  // bonding number, or As, Sb, Bi with one =O, or Se, Te with one or two =O. Its other bonds are single, to C, H,
  // halogens, these atoms, OH, or O bridging to C or to these atoms (silyl ethers, siloxanes). Else it throws.
  perceiveMain() {
    const { el, h, adj } = this;
    for (let i = 0; i < this.n; i++) {
      const m = MAIN[el[i]];
      if (!m || this.pseudo.has(i)) continue; // isoselenocyanato: pseudoGroup()'s
      const chalcogen = CHALCOGEN.has(el[i]), oxo = adj[i].filter((j) => this.isOxo(i, j));
      const valence = adj[i].reduce((t, j) => t + this.ord(i, j), 0) + h[i];
      // With =O: As, Sb and Bi (λ⁵, or one =O on the usual three bonds: oxo(phenyl)arsane), Se and Te (λ⁴, λ⁶); in a
      // ring, by the λ-convention (5λ⁵-dibenzo[b,e]arsinin-5(10H)-one).
      const ok = !oxo.length ? valence === bonding(el[i], this.q[i]) : (!this.inRing[i] || !!this.lambda(i)) && !this.q[i]
        && ((["As", "Sb", "Bi"].includes(el[i]) && oxo.length === 1 && (valence === 5 || (valence === 3 && !this.inRing[i]))) || (chalcogen && valence === 2 + 2 * oxo.length));
      if (!ok || (this.q[i] && !this.mainIon(i) && !this.ions.has(i))) throw new Error(`${el[i]} bonds`);
      this.main.add(i);
      for (const j of adj[i]) {
        if (oxo.includes(j)) { this.main.add(j); continue; }
        if (this.inRing[i] && this.ringOf[j] === this.ringOf[i]) continue; // the ring's own bonds
        if (this.ord(i, j) !== 1 && !chalcogenOne(this, i) && this.carbonylO[j] !== i) throw new Error(`${el[i]} bonds`); // =Se: selanylidene
        // An ion's atom (the O⁻ of a selenonate, the N⁻ of bis(trimethylsilyl)azanide) or a group cited only as a prefix
        // (isocyanato(trimethyl)silane).
        if (this.ions.has(j) || this.prefixOnly.has(j)) continue;
        if (el[j] === "C" || (CATENATE.has(el[i]) && CATENATE.has(el[j])) || (chalcogen && el[j] === el[i])) continue;
        // N: a ring N (1-(trimethylsilyl)-1H-imidazole), azido, an amide N, or an amine N on Si, Ge, Sn, Pb, B (silanamines, boranamines).
        if (el[j] === "N" && (this.inRing[j] || (CATENATE.has(el[i]) && this.azidoAtom(j)))) continue;
        if (el[j] === "N" && CATENATE.has(el[i]) && adj[j].some((k) => this.carbonylO[k] >= 0)) continue; // an amide N: N-(trimethylsilyl)acetamide
        if (el[j] === "N" && CATENATE.has(el[i]) && !this.q[j] && adj[j].every((k) => this.ord(j, k) === 1 && (CATENATE.has(el[k]) || (el[k] === "C" && this.carbonylO[k] < 0 && !this.isNitrileC(k))))) {
          this.mark(j, "amine", adj[j].filter((k) => el[k] === "C"));
          continue;
        }
        // The far side of an O or S bridge: C, these atoms, or a sulfonyl S (silyl sulfonates, which perceive() names).
        const bridge = (k: number) => k === i || el[k] === "C" || (MAIN[el[k]] && !CHALCOGEN.has(el[k])) || (el[k] === "S" && adj[k].filter((o) => this.isOxo(k, o)).length === 2)
          || (el[k] === "P" && !this.inRing[k] && !this.q[k]); // silyl phosphates: tris(trimethylsilyl) phosphate
        const twoBonds = (k: number) => !this.q[k] && !h[k] && !this.inRing[k] && adj[k].length === 2 && adj[k].every(bridge);
        if ((HALO[el[j]] && adj[j].length === 1) || (el[j] === "O" && (this.isOH(j) || twoBonds(j))) || (el[j] === "S" && !chalcogen && twoBonds(j))) { this.main.add(j); continue; }
        throw new Error(`${el[i]} bonds`);
      }
      // -SeH and -TeH on a carbon: the suffixes selenol and tellurol. -Se(=O)OH and -Se(=O)2OH: seleninic and
      // selenonic acids (P-65.3.1), and the Te acids.
      const cs = adj[i].filter((j) => el[j] === "C" && this.carbonylO[j] < 0 && !this.isNitrileC(j)), te = el[i] === "Te";
      if (!chalcogen || this.inRing[i] || cs.length !== 1) continue;
      if (h[i] === 1 && adj[i].length === 1) this.mark(i, te ? "tellurol" : "selenol", cs);
      else if (oxo.length && adj[i].length === oxo.length + 2 && adj[i].some((j) => this.isOH(j))) this.mark(i, oxo.length === 2 ? (te ? "telluronic" : "selenonic") : te ? "tellurinic" : "seleninic", cs);
    }
  }
  // A main-group atom as a prefix: trimethylsilyl, [tert-butyl(dimethyl)silyl], dimethylboranyl, borono, arsono,
  // tributylstannyl, (chloromercurio); Se and Te like S (P-63.2.2, P-63.6): methylselanyl, phenyldiselanyl,
  // methaneseleninyl, benzeneselenonyl.
  mainPrefix(x: number, from: number): Name {
    const el = this.el[x], m = MAIN[el], others = this.adj[x].filter((j) => j !== from);
    const oxo = others.filter((j) => this.isOxo(x, j)), oh = others.filter((j) => this.isOH(j));
    if (this.q[x]) throw new Error("charge");
    if (CHALCOGEN.has(el)) {
      const acid = this.group[x];
      if (acid && /^(selen|tellur)/.test(acid) && acid.endsWith("ic")) return { text: acid.replace(/(on|in)ic$/, "$1o"), compound: false }; // selenono, tellurino
      if (!others.length) return { text: m.yl, compound: false };
      const r = others.find((j) => !oxo.includes(j))!;
      if (oxo.length) {
        if (others.length !== oxo.length + 1 || this.el[r] !== "C") throw new Error(`${el} acid`);
        const own = (el === "Se" ? "selen" : "tellur") + (oxo.length === 2 ? "onyl" : "inyl");
        const p = this.inRing[r] ? { atoms: this.rings[this.ringOf[r]], ring: true } : { atoms: this.bestChain(r, x), ring: false };
        return { text: this.nameParent(p, { attach: [r, x], sulfo: own }).text, compound: true };
      }
      const r2 = this.adj[r].find((j) => j !== x);
      if (this.el[r] === el && !this.inRing[r] && this.adj[r].length === 2 && this.el[r2!] !== el) return { text: `${enclose(this.substituent(r2!, r))}di${m.yl}`, compound: true };
      return { text: `${enclose(this.substituent(r, x))}${m.yl}`, compound: true };
    }
    if (el === "B" && oh.length === 2 && others.length === 2) return { text: "borono", compound: false };
    if ((el === "As" || el === "Sb") && oxo.length === 1 && oh.length === 2 && others.length === 3) return { text: el === "As" ? "arsono" : "stibono", compound: false };
    if (oxo.length && others.length !== 1) throw new Error(`${el} oxide as a prefix`);
    const subs = others.map((j) => (oxo.includes(j) ? { text: "oxo", compound: false } : this.substituent(j, x))); // oxoarsanyl
    return { text: substituted(subs) + m.yl, compound: subs.length > 0 };
  }
  // A main-group atom as the parent: its class and a function for its name. cls -1: an ion (boranuide, arsanium); 0: an acid
  // (P-67.1: phenylboronic acid, dimethylarsinic acid); 0.5: a boron ester; 0.8: "-carbonitrile"; 1: "-ol"
  // (trimethylsilanol); 1.5: "-amine"; 2: the parent hydride (trimethyl(phenyl)silane, triphenylarsane oxide,
  // chloro(phenyl)mercury).
  mainParent(i: number): { cls: number; text: () => string } {
    const el = this.el[i], m = MAIN[el], oxo = this.adj[i].filter((j) => this.isOxo(i, j)), oh = this.adj[i].filter((j) => this.isOH(j));
    const named = (js: number[]) => js.map((j) => this.substituent(j, i));
    if (this.q[i]) return { cls: -1, text: () => substituted(named(this.adj[i])) + (el === "B" ? "boranuide" : m.hydride.replace(/ane$/, "anium")) }; // tris(acetyloxy)boranuide, tetraphenylarsanium
    if (CHALCOGEN.has(el)) return { cls: 0, text: () => `${el === "Se" ? "selen" : "tellur"}${oxo.length === 2 ? "ic" : "ous"} acid` }; // selenic acid
    // Esters of boric, boronic and borinic acids (P-67.1.3.2): trimethyl borate, dimethyl phenylboronate.
    const ors = this.adj[i].filter((j) => this.el[j] === "O" && this.adj[j].length === 2 && this.adj[j].some((k) => k !== i && this.el[k] === "C" && this.carbonylO[k] < 0));
    if (el === "B" && ors.length && this.adj[i].every((j) => ors.includes(j) || this.el[j] === "C")) {
      const alkyls = () => alkylWords(ors.map((o) => this.substituent(this.adj[o].find((k) => k !== i)!, o)));
      return { cls: 0.5, text: () => `${alkyls()} ${substituted(named(this.adj[i].filter((j) => !ors.includes(j))))}${["", "borinate", "boronate", "borate"][ors.length]}` };
    }
    // A nitrile on Si, Ge, Sn, Pb or B, the only nitrile: trimethylsilanecarbonitrile.
    const cn = this.adj[i].filter((j) => this.group[j] === "nitrile");
    if (cn.length === 1 && [...this.bearer.keys()].every((g) => this.group[g] !== "nitrile" || g === cn[0])) {
      return { cls: 0.8, text: () => substituted(named(this.adj[i].filter((j) => j !== cn[0]))) + `${m.hydride}carbonitrile` };
    }
    // An amine N on Si, Ge, Sn, Pb or B, the only amine: trimethylsilanamine, N,N-dimethylboranamine, N,N,1,1,1-pentamethylsilanamine,
    // 1,1,1-trimethyl-N-(trimethylsilyl)silanamine. Its N-substituents take locant N, the others 1 (P-31.1.4.2.4).
    const amines = this.adj[i].filter((j) => this.group[j] === "amine" && !this.inRing[j]);
    if (amines.length === 1 && !oh.length && [...this.bearer.keys()].every((g) => this.group[g] !== "amine" || g === amines[0])) {
      const n = amines[0];
      return { cls: 1.5, text: () => {
        const ns = this.adj[n].filter((j) => j !== i).map((j) => ({ loc: "N", name: this.substituent(j, n) }));
        const subs = this.adj[i].filter((j) => j !== n).map((j) => ({ loc: "1", name: this.substituent(j, i) }));
        return (ns.length ? assemblePrefixes([...ns, ...subs], false) : substituted(subs.map((s) => s.name))) + `${m.hydride.replace(/e$/, "")}amine`;
      } };
    }
    // Other substituents on the acids are prefixes (P-67.1.1.2): chloro(phenyl)borinic acid, (arsonooxy)arsonic acid.
    let word = m.hydride, cls = 2, used = oh;
    // One =O on the usual three bonds is a prefix: oxo(phenyl)arsane, chloro(oxo)bismuthane.
    const three = oxo.length === 1 && this.adj[i].reduce((t, j) => t + this.ord(i, j), 0) + this.h[i] === 3;
    if (three) return { cls, text: () => substituted([...named(this.adj[i].filter((j) => !oxo.includes(j))), { text: "oxo", compound: false }]) + word };
    if (el === "B" && oh.length) [word, cls] = [["", "borinic acid", "boronic acid", "boric acid"][oh.length], 0];
    else if (el === "Bi" && oxo.length && !oh.length) [word, cls] = [`${m.hydride} oxide`, 2];
    else if ((el === "As" || el === "Sb") && oxo.length) {
      [word, cls] = oh.length ? [`${el === "As" ? "ars" : "stib"}${["", "inic", "onic", "oric"][oh.length]} acid`, 0] : [`${m.hydride} oxide`, 2];
    } else if ((el === "As" || el === "Sb") && oh.length) [word, cls] = [`${el === "As" ? "ars" : "stib"}${["", "inous", "onous", "orous"][oh.length]} acid`, 0];
    else if (m.valence === 4 && el !== "Hg" && oh.length) [word, cls] = [`${m.hydride.replace(/e$/, "")}${oh.length > 1 ? `e${MULT[oh.length].replace(/a$/, "")}` : ""}ol`, 1];
    else used = [];
    return { cls, text: () => substituted(named(this.adj[i].filter((j) => !oxo.includes(j) && !used.includes(j)))) + word };
  }
  // The parent is a main-group atom (P-44.1) when its acid (P-41: after carboxylic acids and the S, Se and Te acids),
  // ester, "-ol" or "-amine" is the senior group, or when no group is a suffix and no ring holds an atom as senior
  // (P-44.1.2; a ring wins a tie). Of several, the senior class, then the senior atom, then the shortest name. Se and Te
  // are never parents here: like S, they are cited as prefixes (methylselanyl) or the suffixes selenol and tellurol.
  mainName(kind?: Kind): string | undefined {
    const k = kind ? SENIORITY.indexOf(kind) : SENIORITY.length;
    const rank = (e: string) => (PARENT_ORDER.includes(e) ? PARENT_ORDER.indexOf(e) : PARENT_ORDER.length);
    const gate: Record<number, boolean> = { [-1]: true, 0: k >= SENIORITY.indexOf("anhydride"), 0.5: k > SENIORITY.indexOf("ester"), 1: k > SENIORITY.indexOf("alcohol"), 0.8: k >= SENIORITY.indexOf("nitrile"), 1.5: k >= SENIORITY.indexOf("amine"), 2: !kind };
    // Se and Te only as selenic, selenous, telluric and tellurous acid: two OH and one or two =O.
    const oxoacid = (i: number) => this.adj[i].filter((j) => this.isOH(j)).length === 2 && this.adj[i].length > 2 && this.adj[i].every((j) => this.isOH(j) || this.isOxo(i, j));
    const fit = [...this.main].filter((i) => MAIN[this.el[i]] && !this.inRing[i] && (!CHALCOGEN.has(this.el[i]) || oxoacid(i)))
      .map((i) => ({ i, ...this.mainParent(i) })).filter((c) => gate[c.cls]);
    if (!fit.length) return undefined;
    fit.sort((a, b) => a.cls - b.cls || rank(this.el[a.i]) - rank(this.el[b.i]));
    const best = fit[0];
    // An S or P oxoacid ester outranks a parent hydride (P-41): bis(trimethylsilyl) sulfate.
    if (best.cls === 2 && (this.phosphorus.size || [...this.het.values()].some((r) => r === "S" || r === "P") || Math.min(...this.rings.flat().map((a) => rank(this.el[a]))) <= rank(this.el[best.i]))) return undefined;
    if (best.cls >= 1) { const chain = this.mainChain(best.i); if (chain) return chain; }
    const names = fit.filter((c) => c.cls === best.cls && this.el[c.i] === this.el[best.i]).map((c) => c.text());
    return names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  // A chain of Si, Ge, Sn or Pb atoms (P-21.2.2, P-21.2.3.1): homogeneous (hexamethyldisilane, trisilane) or with an O
  // between each two (hexamethyldisiloxane, 1,1,3,3-tetramethyldisiloxane-1,3-diol). The longest chain, then the
  // lowest locants to OH, then to prefixes, then to the prefix cited first. Locants are left out when one prefix fills
  // every position (P-14.3.4). Undefined for a lone atom.
  mainChain(c: number): string | undefined {
    const { el, adj } = this, E = el[c];
    if (MAIN[E].valence !== 4 || E === "Hg") return undefined;
    const isE = (a: number) => el[a] === E && !this.inRing[a];
    const viaO = (a: number) => adj[a].filter((o) => el[o] === "O" && !this.inRing[o] && adj[o].length === 2 && adj[o].every((k) => k === a || isE(k)));
    const oxy = viaO(c).length > 0;
    if (oxy === adj[c].some(isE)) return undefined; // a lone atom, or both kinds of link
    const step = (a: number): number[][] => (oxy ? viaO(a).map((o) => [o, adj[o].find((k) => k !== a)!]) : adj[a].filter(isE).map((b) => [b]));
    const walk = (a: number, seen: Set<number>): number[][] => {
      const arms = step(a).filter((s) => !seen.has(s[s.length - 1])).flatMap((s) => walk(s[s.length - 1], new Set([...seen, ...s])).map((p) => [...s, ...p]));
      return arms.length ? arms : [[]];
    };
    // Every E atom reachable from c, and the paths from each end.
    const comp = new Set([c]);
    for (const a of comp) for (const s of step(a)) comp.add(s[s.length - 1]);
    const paths = [...comp].filter((a) => step(a).length === 1).flatMap((a) => walk(a, new Set([a])).map((p) => [a, ...p]));
    const longest = Math.max(...paths.map((p) => p.length)), names: string[] = [];
    for (const path of paths.filter((p) => p.length === longest)) {
      const inChain = new Set(path), es = path.filter((a) => el[a] === E), ohs: number[] = [], pre: { atom: number; name: Name }[] = [];
      if (es.length > 10) throw new Error("chain too long");
      for (const a of es) for (const x of adj[a]) if (!inChain.has(x)) { if (this.isOH(x)) ohs.push(a); else pre.push({ atom: a, name: this.substituent(x, a) }); }
      const loc = (num: number[], a: number) => num.indexOf(a) + 1;
      let nums = this.lowest([path, [...path].reverse()], (num) => ohs.map((a) => loc(num, a)));
      nums = this.lowest(nums, (num) => pre.map((p) => loc(num, p.atom)));
      for (const t of [...new Set(pre.map((p) => p.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b)))) nums = this.lowest(nums, (num) => pre.filter((p) => p.name.text === t).map((p) => loc(num, p.atom)));
      const num = nums[0], stem = MULT[es.length] + (oxy ? MAIN[E].hydride.replace(/ane$/, "oxane") : MAIN[E].hydride);
      const full = !ohs.length && es.every((a) => !this.h[a]) && new Set(pre.map((p) => p.name.text)).size === 1;
      const prefixText = assemblePrefixes(pre.map((p) => ({ loc: String(loc(num, p.atom)), name: p.name })), full);
      names.push(joinPrefixes(prefixText, ohs.length ? withSuffix(stem, "alcohol", ohs.map((a) => loc(num, a)).sort((a, b) => a - b).map(String), false, false, false) : stem));
    }
    return names.sort((a, b) => compare(locantsOf(a), locantsOf(b)) || a.length - b.length || a.localeCompare(b))[0];
  }

  // ——— The whole molecule ———
  name(): string | undefined {
    this.perceive();
    this.radicals();
    if (this.adj.some((a, i) => a.length === 0 && this.el[i] !== "C") || this.n === 0) return undefined;
    const kind = SENIORITY.find((k) => this.group.includes(k) && [...this.bearer.keys()].some((g) => this.group[g] === k));
    checkChalcogenOnes(this, kind, SENIORITY); // =Se as a prefix only under a ketone or a senior group (namer-maingroup.ts)
    // Selenoic and telluroic O-acids only as the principal groups, all of one element: 2-amino-4-sulfobutaneselenoic O-acid.
    const seAcids = this.carbonylO.flatMap((d, c) => (d >= 0 && (this.el[d] === "Se" || this.el[d] === "Te") ? [c] : []));
    if (seAcids.length) {
      const acids = [...this.bearer.keys()].filter((g) => this.group[g] === "acid");
      if (kind !== "acid" || seAcids.some((c) => !acids.includes(c)) || new Set(acids.map((c) => this.el[this.carbonylO[c]])).size !== 1) throw new Error("seleno acid");
    }
    // An ion as the parent (trimethylsulfanium, methyl sulfate), a main-group parent (phenylboronic acid,
    // trimethyl(phenyl)silane), or a parent or acid centre built on N, O, S or P (phenylhydrazine, trimethyl phosphate).
    let text: string | undefined = this.ionParent(kind) ?? this.mainName(kind) ?? heteroParentName(this, kind);
    if (text) { /* named */ }
    else if (kind === "ester" || kind === "imidate" || kind === "peroxyester") text = this.esterName(kind);
    else if (kind === "peroxide") text = this.peroxideName();
    else if (kind === "sulfonate") text = sulfonateName(this); // methyl methanesulfonate (namer-hetero.ts)
    else if (kind === "anhydride") text = this.anhydrideName();
    else if (this.whole && this.pseudo.size === this.n) text = this.whole;
    else if (kind === "urea" || kind === "carbamate" || kind === "carbonic" || kind === "carbonylhalide" || kind === "guanidine" || (kind === "imine" && this.diimine.size)
      || (kind === "nitrile" && [...this.bearer].every(([g, on]) => this.group[g] !== "nitrile" || (!on.length && this.groupHetero(g).length === 2)))) text = this.carbonicName(kind);
    else if (!kind && this.phosphorus.size) text = this.phosphaneName();
    else {
      // Identical parents joined by a multiplying group (namer-multiplicative.ts): 2,2'-oxydi(ethan-1-ol).
      const multiplied = multiplicativeName(this, kind, this.ionSkip(kind)), parent = multiplied ? undefined : this.parentName(kind, this.ionSkip(kind));
      text = multiplied ?? parent?.text;
      if (parent?.parent && parent.label) {
        this.locants = new Map();
        for (const a of parent.parent.atoms) try { this.locants.set(a, parent.label(a)); } catch { /* an interior atom of a fused system has no locant */ }
      }
      // Acid halides (P-65.5.1): acetyl chloride, butanedioyl dichloride, methanesulfonyl chloride.
      if (text && (kind === "halide" || kind === "sulfonylhalide" || kind === "imidoylhalide")) {
        const xs = [...Array(this.n).keys()].filter((x) => (HALO[this.el[x]] || this.prefixOnly.has(x)) && this.adj[x].some((j) => this.group[j] === kind));
        const word = (x: number) => HALIDE[this.el[x]] ?? this.prefixOnly.get(x)!.replace(/o$/, "e"); // isothiocyanato → isothiocyanate
        if (new Set(xs.map(word)).size !== 1) throw new Error("mixed halides");
        text += ` ${MULT[xs.length]}${word(xs[0])}`;
      }
    }
    // Every stereo label must be cited (P-91): a name that drops one would be wrong, and labels other than R, S, E
    // and Z are not covered.
    // Several azaniumyl groups are bis(azaniumyl): OPSIN reads diazaniumyl as a diazane.
    text = text?.replace(/\b(di|tri|tetra)azaniumyl/g, (_, m: string) => `${MULT_COMPLEX[MULT.indexOf(m)]}(azaniumyl)`);
    const cited = citedLabels(text ?? "");
    const labelled = this.cip.filter(Boolean).length + [...this.cipBond.values()].filter(Boolean).length;
    if (text && cited !== labelled) throw new Error("stereo not cited");
    return text;
  }
  // Candidate parents: every acyclic carbon chain and every ring; the senior one wins (P-44).
  parentName(kind: Kind | undefined, skip = new Set<number>(), within?: Set<number>): (Name & { parent?: Parent; label?: (a: number) => string }) | undefined {
    const carbons = [...Array(this.n).keys()].filter((i) => this.el[i] === "C" && !this.inRing[i] && (!within || within.has(i)) && !skip.has(i) && !this.pseudo.has(i) && !this.opaque.has(i) && !this.het.has(i) && (kind === "nitrile" || !this.isNitrileC(i)));
    const chains: number[][] = [];
    for (const a of carbons) for (const p of this.paths(a, -1, true, kind === "nitrile")) if (p.every((i) => !skip.has(i) && (!within || within.has(i)))) chains.push(p);
    const count = (atoms: number[], ring: boolean) => {
      if (!kind) return 0;
      let c = 0;
      for (const [g, on] of this.bearer) {
        if (this.group[g] !== kind || skip.has(g)) continue;
        if (CARBON_GROUP.has(kind)) c += (!ring && atoms.includes(g)) || (ring && on.some((a) => atoms.includes(a))) ? 1 : 0;
        else if (kind === "ketone" || kind === "imine") c += atoms.includes(this.el[g] === "O" || this.el[g] === "S" ? on[0] : g) ? 1 : 0;
        else c += on.some((a) => atoms.includes(a)) ? 1 : 0;
      }
      return c;
    };
    // A chain must not leave out a group carbon that it could include at its end.
    const cands: (Parent & { groups: number })[] = [
      ...this.rings.filter((r) => !within || r.every((a) => within.has(a))).map((r) => ({ atoms: r, ring: true, groups: count(r, true) })),
      ...chains.map((c) => ({ atoms: c, ring: false, groups: count(c, false) })),
    ];
    // More than two carboxylic groups on a chain cannot all end it: the chain without them carries every one as a
    // "carbo…" suffix (P-65.1.2.2.2): 2-hydroxypropane-1,2,3-tricarboxylic acid (citric acid).
    const own = new Set([...this.bearer.keys()].filter((g) => kind && CARBON_GROUP.has(kind) && this.group[g] === kind && !skip.has(g)));
    if (own.size > 2) for (const a of carbons) if (!own.has(a)) for (const p of this.paths(a, -1, true, false, own)) {
      const groups = count(p, true);
      if (groups > 2 && p.every((i) => !skip.has(i) && (!within || within.has(i)))) cands.push({ atoms: p, ring: false, attached: true, groups });
    }
    // A hydrazine or diazene bearing carboxylic acid groups is a parent, senior to carbon (P-44.1.2): named as a ring is,
    // with "carbo…" suffixes.
    for (const a of this.hzN) for (const b of this.adj[a]) if (a < b && this.hzN.has(b) && (!within || (within.has(a) && within.has(b))))
      cands.push({ atoms: [a, b], ring: true, groups: count([a, b], true), hetero: this.ord(a, b) === 2 ? "diazene" : "hydrazine" });
    // Ring assemblies (P-28): two identical rings joined by a single bond.
    for (const [k, o] of this.bond) {
      const [a, b] = k.split(" ").map(Number), ra = this.rings[this.ringOf[a]], rb = this.rings[this.ringOf[b]];
      if (o !== 1 || !this.inRing[a] || !this.inRing[b] || ra === rb || (within && ![...ra, ...rb].every((x) => within.has(x)))) continue;
      const name = this.assemblyComponent(ra);
      if (!name || name !== this.assemblyComponent(rb)) continue;
      const atoms = [...ra, ...rb];
      cands.push({ atoms, ring: true, groups: count(atoms, true), assembly: { rings: [ra, rb], junction: [a, b] } });
    }
    if (!cands.length) return undefined;
    const multiple = (c: { atoms: number[]; ring: boolean }, o?: number) => c.ring ? 0 : c.atoms.slice(1).filter((a, k) => { const b = this.ord(c.atoms[k], a); return b > 1 && (o === undefined || b === o); }).length;
    // Senior ring (P-44.2.1.2): has nitrogen; else the senior heteroatom (O, then S); then more rings, more ring
    // atoms, more heteroatoms.
    const ringRank = (c: { atoms: number[] }) => {
      const hetero = c.atoms.filter((a) => this.el[a] !== "C"), set = new Set(c.atoms);
      const has = (e: string) => hetero.some((a) => this.el[a] === e);
      const bonds = c.atoms.reduce((t, a) => t + this.adj[a].filter((j) => set.has(j)).length, 0) / 2;
      return [has("N") ? 0 : has("O") ? 1 : has("S") ? 2 : hetero.length ? 3 : 4, c.atoms.length - 1 - bonds, -c.atoms.length, -hetero.length];
    };
    const subs = (c: { atoms: number[] }) => c.atoms.reduce((s, a) => s + this.adj[a].filter((j) => !c.atoms.includes(j)).length, 0);
    // An assembly ranks by its component ring, then above that ring alone.
    const score = (c: Parent & { groups: number }) =>
      [-c.groups, c.ring ? 0 : 1, ...(c.ring ? [...ringRank({ atoms: c.assembly?.rings[0] ?? c.atoms }), c.assembly ? -2 : -1] : [-c.atoms.length, -multiple(c), -multiple(c, 2), 0, 0]), -subs(c)];
    const scores = new Map(cands.map((c) => [c, score(c)]));
    cands.sort((a, b) => compare(scores.get(a)!, scores.get(b)!));
    const best = cands.filter((c) => compare(scores.get(c)!, scores.get(cands[0])!) === 0);
    // Equal parents: the name with the lowest locants (then first alphabetically) wins.
    const names = best.map((c) => ({ c, n: this.nameParent(c, { kind: c.groups ? kind : undefined, skip }) }));
    names.sort((a, b) => compare(locantsOf(a.n.text), locantsOf(b.n.text)) || a.n.text.localeCompare(b.n.text));
    // The chosen parent and its locants, for the names that cite them (1-ethyl 4-methyl butanedioate).
    return { text: names[0].n.text, compound: true, parent: names[0].c, label: names[0].n.label };
  }
  // Everything reachable from c without crossing o.
  side(c: number, o: number): Set<number> {
    const side = new Set<number>([c]), stack = [c];
    while (stack.length) { const i = stack.pop()!; for (const j of this.adj[i]) if (j !== o && !side.has(j)) { side.add(j); stack.push(j); } }
    return side;
  }
  // A phosphane as the parent (P-68.3.2), senior to carbon parents (P-44.1.2): triphenylphosphane,
  // methyl(diphenyl)phosphane, [2-(diphenylphosphanyl)ethyl]diphenylphosphane; with =O, triphenylphosphane oxide.
  // With several P, the shortest name.
  phosphaneName(): string {
    const names = [...this.phosphorus].filter((i) => this.el[i] === "P").map((p) => {
      const subs = this.adj[p].filter((j) => this.el[j] === "C").map((j) => this.substituent(j, p));
      return `${substituted(subs)}phosphane${this.adj[p].some((j) => this.el[j] === "O") ? " oxide" : ""}`;
    });
    return names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  // Esters (P-65.6.3): "alkyl alkanoate", the alkyl named from the ester oxygen's other side.
  esterName(kind: Kind): string | undefined {
    const esters = [...this.esterO.keys()].filter((c) => this.group[c] === kind);
    if (esters.length !== 1) return this.severalEsters(esters, kind);
    const c = esters[0], o = this.esterO.get(c)!, r = this.adj[o].find((j) => j !== c && !this.peroxO.has(j))!;
    const alkyl = this.substituent(r, o);
    // The acid side: everything reachable from the ester carbon without crossing the ester oxygen.
    const acid = this.parentName(kind, new Set(), this.side(c, o));
    if (!acid) return undefined;
    const acidText = acid.text.replace(/oic acid$/, "oate").replace(/carboxylic acid$/, "carboxylate").replace(/ic acid$/, "ate");
    // The thioate's alkyl names the atom it is on: S-methyl ethanethioate, O-methyl ethanethioate (P-65.6.3.2.3).
    const v = groupVariant(this, c);
    return `${v === "S" || v === "O" ? `${v}-${enclose(alkyl)}` : alkyl.text} ${acidText}`;
  }
  // Several esters (P-65.6.3.2). Esters of one polyol with one acid: propane-1,2,3-triyl triacetate. Else the
  // polyacid with the most ester groups names them, its alkyl groups in alphanumerical order, with the locants of
  // their acid groups when they differ: dimethyl butanedioate, 1-ethyl 4-methyl butanedioate. The other esters are
  // prefixes: methyl 4-(acetyloxy)benzoate, 4-methoxy-4-oxobutanoic acid (P-65.6.3.3).
  severalEsters(esters: number[], kind: Kind = "ester"): string {
    const polyol = this.polyolEster(esters) ?? multiplicativeEster(this, kind, esters); // dimethyl 4,4'-oxydibenzoate
    if (polyol) return polyol;
    const p = this.parentName(kind)?.parent;
    if (!p) throw new Error("several esters");
    const site = (c: number) => (p.ring || p.attached ? this.bearer.get(c)!.find((a) => p.atoms.includes(a)) : p.atoms.includes(c) ? c : undefined);
    const groups = new Map<string, { name: Name; sites: number[] }>();
    for (const c of esters) {
      const at = site(c);
      if (at === undefined) continue;
      const o = this.esterO.get(c)!, r = this.adj[o].find((j) => j !== c && !this.peroxO.has(j))!;
      if (p.atoms.some((a) => this.side(r, o).has(a))) throw new Error("cyclic ester");
      const name = this.substituent(r, o), g = groups.get(name.text) ?? { name, sites: [] };
      g.sites.push(at);
      groups.set(name.text, g);
    }
    // Low locants go to the alkyl group cited first (3-ethyl 5-methyl pyridine-3,5-dicarboxylate).
    const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
    const tiebreak = (nums: number[][]) => sorted.reduce((best, g) => this.lowest(best, (num) => g.sites.map((a) => num.indexOf(a) + 1)), nums);
    const acid = this.nameParent(p, { kind, tiebreak });
    // A compound alkyl group after its locants goes in enclosing marks (P-16.5.1): 1-methyl 5-(2-methylpropyl) pentanedioate.
    const alkyls = sorted.map((g) => (sorted.length > 1 ? `${g.sites.map(acid.label!).sort(locOrder).join(",")}-` : "")
      + (sorted.length > 1 && g.sites.length === 1 && (g.name.compound || /^[\d(]/.test(g.name.text)) ? enclose(g.name) : times(g.sites.length, g.name)));
    return `${alkyls.join(" ")} ${acid.text}`;
  }
  // Esters of a polyol (P-65.6.3.2.2): cut at each ester's C–O bond, one part holds every ester O and no ester carbon,
  // and the acids are all the same: ethane-1,2-diyl diacetate. The polyol's name (ethane-1,2-diol) gives the
  // alkyl's (ethane-1,2-diyl).
  polyolEster(esters: number[]): string | undefined {
    const os = esters.map((c) => this.esterO.get(c)!), yl = this.polyolYl(os, esters);
    if (!yl) return undefined;
    const acids = esters.map((c) => {
      const p = this.part(c, new Set(esters.map((d) => this.key(d, this.esterO.get(d)!))));
      if (esters.some((d) => d !== c && p.has(d))) return undefined;
      return new Namer(this.piece([...p], [], [c])).name()?.replace(/oic acid$/, "oate").replace(/carboxylic acid$/, "carboxylate").replace(/ic acid$/, "ate");
    });
    if (!acids[0]?.endsWith("ate") || acids.some((a) => a !== acids[0])) return undefined;
    return `${yl} ${times(esters.length, { text: acids[0], compound: /[\d([ -]/.test(acids[0]) })}`;
  }
  // Everything reachable from s without crossing the bonds in cut (by key).
  part(s: number, cut: Set<string>): Set<number> {
    const seen = new Set([s]), stack = [s];
    while (stack.length) { const i = stack.pop()!; for (const j of this.adj[i]) if (!seen.has(j) && !cut.has(this.key(i, j))) { seen.add(j); stack.push(j); } }
    return seen;
  }
  // The polyol of esters (P-65.6.3.2.2) whose ester O atoms os are each bonded to the acid centre centres[k] (a
  // carbon, S or N), as its -diyl name: ethane-1,2-diyl, propane-1,2,3-triyl. Undefined unless the ester O atoms are
  // the polyol's only OH groups and its name ends in them (-diol, -triol).
  polyolYl(os: number[], centres: number[]): string | undefined {
    const alcohol = this.part(os[0], new Set(os.map((o, k) => this.key(o, centres[k]))));
    if (!os.every((o) => alcohol.has(o)) || centres.some((c) => alcohol.has(c)) || [...alcohol].some((a) => this.el[a] === "O" && !os.includes(a) && this.h[a])) return undefined;
    const polyol = new Namer(this.piece([...alcohol], os)).name(), m = polyol?.match(/(di|tri|tetra|penta|hexa)ol$/);
    // Else the framework as a multiplying group (namer-multiplicative.ts): oxydi(ethane-2,1-diyl).
    return polyol && m && MULT.indexOf(m[1]) === os.length ? phenylene(polyol.replace(/ol$/, "yl")) : polyol ? polyolDiyl(this, alcohol, os) : undefined;
  }
  // Some atoms as a structure of their own, with a hydrogen more on each of `addH` and an OH more on each of `addOH`.
  // Stereo labels are kept: they describe the whole structure, as the name does.
  piece(atoms: number[], addH: number[], addOH: number[] = []): Graph {
    const index = new Map(atoms.map((a, k) => [a, k]));
    const g: Graph = { atoms: atoms.map((a) => ({ el: this.el[a], charge: this.q[a], h: this.h[a] + (addH.includes(a) ? 1 : 0), ...(this.cip[a] ? { cip: this.cip[a] } : {}) })), bonds: [] };
    for (const [k, order] of this.bond) {
      const [a, b] = k.split(" ").map(Number), cip = this.cipBond.get(k);
      if (index.has(a) && index.has(b)) g.bonds.push({ a: index.get(a)!, b: index.get(b)!, order: order as 1 | 2 | 3, ...(cip ? { cip } : {}) });
    }
    for (const c of addOH) { g.atoms.push({ el: "O", charge: 0, h: 1 }); g.bonds.push({ a: index.get(c)!, b: g.atoms.length - 1, order: 1 }); }
    return g;
  }
  // Anhydrides (P-65.7.1): the acids' names, then "anhydride": acetic anhydride, acetic propanoic anhydride.
  anhydrideName(): string {
    // Diacyl peroxides are peroxideName()'s.
    if (this.anhydrideO.size !== 2 || new Set(this.anhydrideO.values()).size !== 1 || [...this.anhydrideO.keys()].some((c) => thioDouble(this, c))) throw new Error("anhydride");
    const acids = [...this.anhydrideO.keys()].map((c) => {
      const acid = this.parentName("anhydride", new Set(), this.side(c, this.anhydrideO.get(c)!))?.text;
      if (!acid?.endsWith(" acid")) throw new Error("anhydride");
      return acid.slice(0, -5);
    });
    if (acids[0] === acids[1]) return `${acids[0]} anhydride`;
    return `${acids.sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} anhydride`;
  }
  // Urea and carbamates (P-66.1.6.1, P-65.2.1): N-substituents with locants N and N' (lowest locants, then N for the
  // prefix cited first), and a carbamate's ester alkyl in front: N,N'-dimethylurea, tert-butyl carbamate.
  carbonicName(kind: Kind): string {
    const cs = [...this.bearer.keys()].filter((g) => this.group[g] === kind);
    if (cs.length === 1) return this.carbonicOne(cs[0], kind);
    // Alike ureas joined by a multiplying group (namer-multiplicative.ts): N,N''-methylenediurea.
    const multiplied = kind === "urea" ? multiplicativeUrea(this, cs) : undefined;
    if (multiplied) return multiplied;
    // Dicarbonates (P-65.2.1.4): di-tert-butyl dicarbonate. Dicarbamates of a polyol: ethane-1,2-diyl dicarbamate.
    const di = this.dicarbonate(cs) ?? (kind === "carbamate" && cs.every((c) => this.esterO.has(c)) ? this.polyolEster(cs) : undefined);
    if (di) return di;
    // Else one group names the compound and the others are prefixes: the shortest such name (N,N'-dicarbamoylurea).
    let why: unknown;
    const names = cs.flatMap((c) => { try { return [this.carbonicOne(c, kind)]; } catch (e) { why ??= e; return []; } });
    if (!names.length) throw why; // the reason the first one gave: unknown ring
    return names.sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
  }
  // Two carbonic acid groups that share an O, or an O-O (P-65.2.1.4): dicarbonic acid, peroxydicarbonic acid, and their
  // diesters (di-tert-butyl dicarbonate, dipropan-2-yl peroxydicarbonate).
  dicarbonate(cs: number[]): string | undefined {
    if (cs.length !== 2 || cs.some((c) => thioDouble(this, c))) return undefined;
    const [l1, l2] = cs.map((c) => this.groupHetero(c)), o = l1.find((x) => l2.includes(x));
    const oo = o === undefined ? l1.find((x) => this.peroxO.has(x) && l2.some((y) => this.ord(x, y) === 1)) : undefined;
    if (o === undefined && oo === undefined) return undefined;
    const word = o === undefined ? "peroxydicarbon" : "dicarbon";
    const ends = [l1.find((x) => x !== (o ?? oo))!, l2.find((x) => x !== o && (oo === undefined || this.ord(oo, x) !== 1))!];
    if (ends.some((x) => this.el[x] !== "O" || this.peroxO.has(x))) return undefined;
    if (ends.every((x) => this.adj[x].length === 1)) return `${word}ic acid`;
    if (ends.some((x) => this.adj[x].length === 1)) return undefined;
    const alkyls = ends.map((x, k) => this.substituent(this.adj[x].find((j) => j !== cs[k])!, x));
    if (alkyls[0].text === alkyls[1].text) return `${times(2, alkyls[0])} ${word}ate`;
    return `${alkyls.map((a) => a.text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} ${word}ate`;
  }
  // Thio analogues of carbonic acid derivatives (P-65.2.1.5): =S, -SH and -S-R for =O, -OH and -O-R, and likewise Se and
  // Te. An ester's alkyl group is cited on its atom (O-, S-) where the name has two elements: S-methyl carbamothioate,
  // O-ethyl S-methyl carbonodithioate, dimethyl carbonotrithioate, O-phenyl carbonochloridothioate, carbamodithioic acid,
  // carbamimidoselenoic acid. An acid whose H could be on either is not named: OPSIN reads no O- or S-acid of these, and
  // the InChI cannot tell them apart.
  thioCarbonic(c: number, kind: Kind, text: string, n: boolean, imidic: boolean, chal: number[], xs: string[]): string {
    const d = this.carbonylO[c], others = [...(d >= 0 ? [d] : []), ...chal].map((x) => this.el[x]).filter((e) => e !== "O");
    if (new Set(others).size !== 1) throw new Error("thio");
    const stem = (n ? "carbam" : xs.length && chal.length ? `carbono${xs[0].slice(0, -1)}` : "carbon") + (imidic ? "imid" : "") + "o" + MULT[others.length] + { S: "thio", Se: "seleno", Te: "telluro" }[others[0]];
    if (kind === "carbonylhalide") return `${text}${stem}yl ${xs.length === 2 && xs[0] === xs[1] ? `di${xs[0]}` : xs.join(" ")}`;
    const esters = chal.filter((x) => this.adj[x].length === 2), acids = chal.filter((x) => this.adj[x].length === 1);
    const at = (l: number[]) => new Set([...(d >= 0 ? [d] : []), ...l].map((x) => this.el[x]));
    const mixed = at(chal).size > 1;
    if (!esters.length || (acids.length && at(acids).size > 1)) {
      if (mixed) throw new Error("thio acid");
      return `${text}${stem}ic acid`;
    }
    const named = esters.map((x) => ({ at: this.el[x], name: this.substituent(this.adj[x].find((j) => j !== c)!, x) }));
    const alkyl = named.length === 2 && named[0].name.text === named[1].name.text ? `${mixed ? `${named.map((x) => x.at).sort().join(",")}-` : ""}${times(2, named[0].name)}`
      : named.sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text))).map((x) => (mixed ? `${x.at}-${enclose(x.name)}` : x.name.text)).join(" ");
    return `${alkyl}${acids.length ? " hydrogen" : ""} ${text}${stem}ate`;
  }
  carbonicOne(c: number, kind: Kind): string {
    if (kind === "imine" && !this.diimine.has(c)) throw new Error("imine");
    // N and N' (a guanidine's imino N is N''): lowest locants, then low locants to the prefix cited first.
    const imidic = this.carbonylO[c] < 0 && kind !== "imine" && kind !== "nitrile";
    const imino = imidic ? this.imineN(c)! : undefined, last = imino === undefined ? [] : [imino];
    const ns = this.groupHetero(c).filter((j) => this.el[j] === "N" && j !== imino && !this.azidoAtom(j) && (kind === "imine" || this.ord(c, j) === 1));
    const prefixes = [...ns, ...last].flatMap((n) => this.adj[n].filter((j) => j !== c).map((j) => ({ n, name: this.substituent(j, n) })));
    let nums = ns.length === 2 ? [[...ns, ...last], [ns[1], ns[0], ...last]] : [[...ns, ...last]];
    nums = this.lowest(nums, (num) => prefixes.map((x) => num.indexOf(x.n) + 1));
    for (const t of [...new Set(prefixes.map((x) => x.name.text))].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))))
      nums = this.lowest(nums, (num) => prefixes.filter((x) => x.name.text === t).map((x) => num.indexOf(x.n) + 1));
    // Urea needs no N locants with one substituent, or one prefix in all four places (P-14.3.4.3, P-14.3.4.5):
    // methylurea, tetramethylurea; but N,N-dimethylurea.
    const same = prefixes.every((x) => x.name.text === prefixes[0]?.name.text);
    const free = kind === "urea" && !imidic && ns.length === 2 && (prefixes.length === 1 || (prefixes.length === 4 && same));
    const text = free ? substituted(prefixes.map((x) => x.name)) : assemblePrefixes(prefixes.map((x) => ({ loc: ["N", "N'", "N''"][nums[0].indexOf(x.n)], name: x.name })), false);
    // Thiourea (P-66.1.6.1.2); O-alkyl carbamothioates come below.
    const thio = thioDouble(this, c);
    // E or Z on a guanidine's C=N, in front: (E)-N''-cyano-N-methyl-N'-…guanidine (cimetidine).
    const ez = kind === "guanidine" ? this.cipBond.get(this.key(c, imino!)) : undefined;
    if (kind === "guanidine" || (kind === "urea" && !imidic)) return `${ez === "E" || ez === "Z" ? `(${ez})-` : ""}${text}${thio ? "thio" : ""}${kind}`;
    if (kind === "urea") throw new Error("imine");
    if (kind === "imine") return `${text}methanediimine`;
    // Carbamic acid, carbamates and carbamoyl halides; carbonic acid, carbonates, carbonochloridic acid and its esters,
    // and carbonyl dihalides (P-65.2.1, P-65.5.1).
    const ls = this.groupHetero(c), oh = ls.some((x) => this.el[x] === "O" && this.adj[x].length === 1);
    const alkyls = ls.filter((x) => this.el[x] === "O" && this.adj[x].length === 2 && !this.peroxO.has(x)).map((o) => this.substituent(this.adj[o].find((j) => j !== c)!, o));
    const xs = ls.filter((x) => HALO[this.el[x]]).map((x) => HALIDE[this.el[x]]).sort();
    if (kind === "nitrile") return ns.length ? `${text}cyanamide` : xs.length ? `carbononitridic ${xs[0]}` : ls.some((j) => this.azidoAtom(j)) ? "carbononitridic azide" : "cyanic acid";
    // O-OH in place of OH (P-65.2.1.4): carbonoperoxoic acid. Other peroxy groups only as dicarbonates.
    if (ls.some((x) => this.peroxO.has(x))) {
      if (kind !== "carbonic" || imidic || thio || ns.length || ls.some((x) => this.el[x] !== "O" || (!this.peroxO.has(x) && this.adj[x].length !== 1))) throw new Error("peroxy");
      return "carbonoperoxoic acid";
    }
    const chal = ls.filter((x) => CHALCOGENS.has(this.el[x]) && this.ord(c, x) === 1);
    if (thio || chal.some((x) => this.el[x] !== "O")) return this.thioCarbonic(c, kind, text, ns.length > 0, imidic, chal, xs);
    const oxo = () => {
      if (ns.length) return kind === "carbonic" ? `${text}carbamic acid` : kind === "carbonylhalide" ? `${text}carbamoyl ${xs[0]}` : `${alkyls[0].text} ${text}carbamate`;
      if (xs.length) return oh ? `carbono${xs[0].slice(0, -1)}ic acid` : alkyls.length ? `${alkyls[0].text} carbono${xs[0].slice(0, -1)}ate` : xs[0] === xs[1] ? `${text}carbonyl di${xs[0]}` : `${text}carbonyl ${xs.join(" ")}`;
      if (oh) return alkyls.length ? `${alkyls[0].text} hydrogen carbonate` : "carbonic acid";
      if (alkyls[0].text === alkyls[1].text) return `${times(2, alkyls[0])} ${text}carbonate`;
      return `${alkyls.map((a) => a.text).sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).join(" ")} ${text}carbonate`;
    };
    // With =N in place of =O (P-65.2.1.2): carbamimidic acid, methyl carbamimidate, N-phenylcarbonimidoyl dichloride.
    const word = oxo();
    if (text && !word.includes(text)) throw new Error("imidic acid derivative");
    if (!imidic) return word;
    return word.replace(/carbamic acid$/, "carbamimidic acid").replace(/carbamate$/, "carbamimidate").replace(/carbamoyl /, "carbamimidoyl ")
      .replace(/carbonyl /, "carbonimidoyl ").replace(/(carbono\w+)ic acid$/, "$1imidic acid").replace(/(carbono\w+id)ate$/, "$1imidate")
      .replace(/carbonate$/, "carbonimidate").replace(/carbonic acid$/, "carbonimidic acid");
  }
}

// ——— Text helpers ———
// Whether the atoms pair up along bonds (a Kekulé structure exists). Bounded search.
function pairable(atoms: number[], bonded: (a: number) => number[]): boolean {
  const free = new Set(atoms);
  let steps = 0;
  const pair = (): boolean => {
    if (++steps > 20000) throw new Error("pairing");
    const a = free.values().next().value;
    if (a === undefined) return true;
    free.delete(a);
    for (const b of bonded(a)) {
      if (!free.has(b)) continue;
      free.delete(b);
      if (pair()) return true;
      free.add(b);
    }
    free.add(a);
    return false;
  };
  return pair();
}
function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
const locantsOf = (name: string) => (name.match(/\d+/g) ?? []).map(Number);
// The stereodescriptors a name cites, (2R,3S)- and the like, each counted as often as its multiplying prefix says:
// tris[(9Z)-octadec-9-enoate] cites three.
function citedLabels(text: string): number {
  const times = [1];
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === ")" || ch === "]" || ch === "}") { times.pop(); continue; }
    if (ch !== "(" && ch !== "[" && ch !== "{") continue;
    const m = text.slice(0, i).match(/(bis|tris|tetrakis|pentakis|hexakis|heptakis|octakis)$/), here = times[times.length - 1];
    const d = ch === "(" ? text.slice(i).match(/^\(([^()]*)\)-/) : null;
    if (d) n += here * d[1].split(",").filter((t) => /^(\d+[a-z]?'*)?[RSEZ]$/.test(t)).length;
    times.push(here * (m ? MULT_COMPLEX.indexOf(m[1]) : 1));
  }
  return n;
}
// Alphabetical order ignores multiplying prefixes of simple substituents, locants and italic prefixes (P-14.5).
function alphaKey(t: string): string {
  // Enclosing marks go first, then every leading locant, stereodescriptor, λ and indicated hydrogen: (2R,3S)-3,4-dihydroxy…
  // is under d, 1H-1,2,4-triazol-1-yl under t, {2-[4-(hydroxymethyl)phenyl]hydrazinyl} under h, (E)-… after the E,
  // and a fusion name's leading locants too: [1,2,4]triazolo[4,3-a]pyridin-3-yl is under t.
  // Isotope descriptors do not count either (P-82): [(²H₃)methyl] is under m.
  let k = t.replace(/\([^()]*\)/g, (d) => (NUCLIDE.test(d) ? "" : d)).replace(/^[([{]*\[[\d',]+\](?=[a-z])/, "").replace(/[()[\]{}]/g, "");
  for (const lead = /^(tert|sec|N\d*'*|\d+[a-z]?'*(λ[¹²³⁴⁵⁶])?[RSEZH]?|[RSEZ])(,(N\d*'*|\d+[a-z]?'*(λ[¹²³⁴⁵⁶])?[RSEZH]?|[RSEZ]))*-/; lead.test(k); ) k = k.replace(lead, "");
  return k;
}
// Substituents on a parent without locants (amino, phosphane): phenyl, diphenyl, methyl(diphenyl), in alphabetical order.
function substituted(subs: Name[]): string {
  const groups = new Map<string, { name: Name; n: number }>();
  for (const s of subs) groups.set(s.text, { name: s, n: (groups.get(s.text)?.n ?? 0) + 1 });
  const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
  const parts = sorted.map((g) => (g.n > 1 ? times(g.n, g.name) : enclose(g.name)));
  // After the first, each substituent goes in brackets: methyl(diphenyl)phosphane, ethyl(methyl)(phenyl)phosphane.
  return parts.map((t, k) => (k === 0 || /^[([{]/.test(t) ? t : enclose({ text: t, compound: true }))).join("");
}
// The alkyl groups of an ester with several, as separate words in alphabetical order: trimethyl, ethyl methyl.
function alkylWords(names: Name[]): string {
  const groups = new Map<string, { name: Name; n: number }>();
  for (const s of names) groups.set(s.text, { name: s, n: (groups.get(s.text)?.n ?? 0) + 1 });
  return [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)))
    .map((g) => times(g.n, g.name)).join(" ");
}
// A name multiplied (P-16.9.1): dimethyl, di-tert-butyl, bis(2-chloroethyl).
function times(k: number, n: Name): string {
  if (k < 2) return n.text;
  return n.compound ? MULT_COMPLEX[k] + enclose(n) : MULT[k] + (/^(tert|sec)-/.test(n.text) ? "-" : "") + n.text;
}
// Enclosing marks nest ( ), [ ], { }, then ( ) again (P-16.5.4): {[({[( )]})]}. A name goes in the mark one level
// above the deepest marks it holds: ({[(9H-fluoren-9-yl)methoxy]carbonyl}amino). The marks of fusion, von Baeyer,
// spiro and ring assembly names and of added hydrogen do not count (P-16.5.4.1.1, P-16.5.4.1.2):
// (dibenzo[b,d]furan-1-yl), (bicyclo[2.2.1]heptan-2-yl), ([1,1'-biphenyl]-4-yl), (quinolin-1(2H)-yl). Stereo,
// isotope and compound-locant marks count (P-16.5.4.1.3). A mark next to one of its own level takes the next level
// (P-16.5.4.1.5): [(2S)-2-{…}propanoyl], not ((2S)-2-{…}propanoyl).
const OPEN = "([{", CLOSE = ")]}";
function enclose(n: Name): string {
  if (!n.compound) return n.text;
  const t = n.text
    .replace(/\[(?:[\d',:]+(?:-[a-z]{1,4})?|[a-z]{1,4}(?:,[a-z]{1,4})*|[\d',:-]+[a-z]{1,4}(?:[,:][\d',-]*[a-z]{1,4})*)\]/g, "") // fusion
    .replace(/(?<=cyclo|spiro)\[[\d.,⁰¹²³⁴⁵⁶⁷⁸⁹]+\]/g, "") // von Baeyer and spiro
    .replace(/\[(\d[\d',:]*-(?:bi|ter|quater)[^[\]]*)\]/g, "$1") // ring assembly
    .replace(/(?<=\d[a-z]?'*)\(\d+[a-z]?'*H(?:,\d+[a-z]?'*H)*\)/g, ""); // added hydrogen
  let depth = 0, level = 0;
  for (const ch of t) if (OPEN.includes(ch)) level = Math.max(level, ++depth); else if (CLOSE.includes(ch)) depth--;
  while (t[0] === OPEN[level % 3] || t[t.length - 1] === CLOSE[level % 3]) level++;
  return OPEN[level % 3] + n.text + CLOSE[level % 3];
}
// Prefixes: grouped by name, multiplied (di, tri; bis, tris for compound names), ordered alphabetically.
function assemblePrefixes(list: { loc: string; name: Name }[], noLocants: boolean): string {
  const groups = new Map<string, { name: Name; locs: string[] }>();
  for (const p of list) {
    const g = groups.get(p.name.text) ?? { name: p.name, locs: [] };
    g.locs.push(p.loc);
    groups.set(p.name.text, g);
  }
  const sorted = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text)));
  const parts = sorted.map((g) => {
    // N-locants first (N, N', N1, N4), then numerals.
    const isN = (l: string) => l[0] === "N", nKey = (l: string) => "0" + l.slice(1);
    const locs = g.locs.sort((a, b) => (isN(a) !== isN(b) ? (isN(a) ? -1 : 1) : isN(a) ? locOrder(nKey(a), nKey(b)) : locOrder(a, b)));
    const m = g.locs.length, multiplied = m > 1 ? times(m, g.name) : enclose(g.name);
    return noLocants && !locs.some(isN) ? multiplied : `${locs.join(",")}-${multiplied}`;
  });
  // No hyphen before a bracket: phenyl(pyrrolidin-1-yl)methanone. Without locants, each prefix after the first is in
  // brackets (P-16.5.1): trichloro(fluoro)methane, (carbamoylamino)(oxo)acetic acid.
  const bare = (t: string) => !/^N/.test(t); // no N-locant
  return parts.map((t, k) => (!k || /^[([{]/.test(t) ? t : noLocants && bare(t) && bare(parts[k - 1]) ? enclose({ text: t, compound: true }) : `-${t}`)).join("");
}
// A fused parent name with its λ-atoms (P-14.1.3): in its heteroatom locants where it starts with them
// (1λ⁶,2-benzothiazine, 2λ⁴-benzothiophene), else in front (5λ⁴-phenothiazine, 5λ⁴-dibenzo[b,e][1,4]thiarsinine).
function lambdaName(name: string, lams: string[]): string {
  if (!lams.length) return name;
  const m = name.match(/^(\d+[a-z]?(?:,\d+[a-z]?)*)-(?=[a-z])/);
  if (!m) return `${lams.join(",")}-${name}`;
  const locs = m[1].split(","), bare = (l: string) => l.replace(/λ.*/, "");
  if (!lams.every((l) => locs.includes(bare(l)))) throw new Error("λ locant");
  return locs.map((l) => lams.find((x) => bare(x) === l) ?? l).join(",") + name.slice(m[1].length);
}
// Prefixes, then the rest of the name, with a hyphen before a locant: 5-bromo-1H-indole, 1-methyl-1H-pyrrole.
const joinPrefixes = (prefixes: string, rest: string) => (prefixes && /^\d/.test(rest) ? `${prefixes}-${rest}` : prefixes + rest);
// A chain or ring stem with its double and triple bonds: propane, prop-1-ene, buta-1,3-diene, pent-1-en-4-yne.
function chainStem(size: number, enes: (number | string)[], ynes: (number | string)[], ring: boolean): string {
  const stem = STEMS[size];
  if (!stem) throw new Error("chain too long");
  if (!enes.length && !ynes.length) return stem + "ane";
  const multi = enes.length > 1 || ynes.length > 1;
  let t = stem + (multi ? "a" : "");
  const show = !(size === 2 && !ring) || multi;
  if (enes.length) t += (show ? `-${enes.join(",")}-` : "") + MULT[enes.length] + (ynes.length ? "en" : "ene");
  if (ynes.length) t += (show ? `-${ynes.join(",")}-` : "") + MULT[ynes.length] + "yne";
  return t;
}
// The parent with its suffix: propan-1-ol, propane-1,2-diol, butanedioic acid, cyclohexanecarboxylic acid.
function withSuffix(parent: string, kind: Kind | undefined, locs: string[], ring: boolean, locantFree: boolean, one: boolean, own?: string): string {
  if (!kind && !own) return parent;
  const m = locs.length;
  const base: Record<Kind, [string, string]> = {
    acid: ["oic acid", "carboxylic acid"], anhydride: ["oic acid", "carboxylic acid"], halide: ["oyl", "carbonyl"],
    sulfonic: ["sulfonic acid", "sulfonic acid"], selenonic: ["selenonic acid", "selenonic acid"], seleninic: ["seleninic acid", "seleninic acid"],
    telluronic: ["telluronic acid", "telluronic acid"], tellurinic: ["tellurinic acid", "tellurinic acid"], sulfonylhalide: ["sulfonyl", "sulfonyl"], urea: ["", ""], carbamate: ["", ""], ester: ["oate", "carboxylate"], amide: ["amide", "carboxamide"], nitrile: ["nitrile", "carbonitrile"],
    sulfonate: ["sulfonate", "sulfonate"], sulfonamide: ["sulfonamide", "sulfonamide"],
    aldehyde: ["al", "carbaldehyde"], ketone: ["one", "one"], alcohol: ["ol", "ol"], thiol: ["thiol", "thiol"], selenol: ["selenol", "selenol"], tellurol: ["tellurol", "tellurol"], amine: ["amine", "amine"],
    aminium: ["aminium", "aminium"], imine: ["imine", "imine"], carbonic: ["", ""], carbonylhalide: ["", ""],
    amidine: ["imidamide", "carboximidamide"], guanidine: ["", ""], hydrazide: ["hydrazide", "carbohydrazide"],
    imidic: ["imidic acid", "carboximidic acid"], imidate: ["imidate", "carboximidate"], imidoylhalide: ["imidoyl", "carboximidoyl"],
    peroxy: ["peroxoic acid", "carboperoxoic acid"], peroxyester: ["peroxoate", "carboperoxoate"], peroxide: ["", ""],
    carboxylate: ["oate", "carboxylate"], sulfonateion: ["sulfonate", "sulfonate"], sulfinate: ["sulfinate", "sulfinate"], olate: ["olate", "olate"], aminide: ["aminide", "aminide"], ide: ["ide", "ide"],
    ylium: ["ylium", "ylium"], iminium: ["iminium", "iminium"], diazonium: ["diazonium", "diazonium"], peroxoate: ["peroxoate", "carboperoxoate"],
  };
  let s = own ?? base[kind!][ring ? 1 : 0];
  // The chain's own carbon carries -oic acid, -al, -nitrile and -amide, always at an end, so no locants (P-31.1.4.2.1).
  const terminal = !ring && !!kind && CARBON_GROUP.has(kind);
  if (m > 1) s = MULT[m] + (s.startsWith("oic") ? "oic acid" : s);
  if (terminal && kind === "nitrile" && m === 1 && !one) s = "nitrile";
  const word = m > 1 && terminal && kind === "acid" ? `${MULT[m]}oic acid` : s;
  const elide = VOWEL.test(word) ? parent.replace(/e(\]?)$/, "$1") : parent;
  if (terminal || (locantFree && m === 1 && ring) || (one && m === 1)) return (VOWEL.test(word) ? elide : parent) + word;
  return `${VOWEL.test(word) ? elide : parent}-${locs.join(",")}-${word}`;
}

// Salts (P-65.6.2.2, P-73; IUPAC 2005 IR-5): cations, then anions, each with a multiplying prefix for the ratio:
// sodium acetate, calcium diacetate, disodium butanedioate, sodium chloride, dipotassium carbonate, ammonium chloride,
// N,N,N-trimethylmethanaminium chloride, pyridin-1-ium chloride.
// Several cations or anions go in alphabetical order (IR-5.4): potassium sodium tartrate. A metal with a Stock number
// needs no multiplying prefixes: iron(III) chloride. Hydrogen halides and water of crystallisation follow (IR-5.5):
// aniline hydrochloride, copper(II) sulfate pentahydrate.
function saltName(g: Graph, parts: number[][]): string | undefined {
  const lone = (p: number[], el: string, h: number) => p.length === 1 && g.atoms[p[0]].el === el && g.atoms[p[0]].h === h && !g.atoms[p[0]].charge;
  const adducts = ["Cl", "Br", "I", "F", "O"].map((el) => [el, parts.filter((p) => lone(p, el, el === "O" ? 2 : 1)).length] as const).filter(([, k]) => k);
  const rest = parts.filter((p) => !["Cl", "Br", "I", "F", "O"].some((el) => lone(p, el, el === "O" ? 2 : 1)));
  if (adducts.length && rest.length) {
    if (adducts.some(([, k]) => k >= MULT.length)) return undefined;
    const main = nameOf(partOf(g, rest.flat()));
    return main && [main, ...adducts.map(([el, k]) => el === "O" ? `${k === 1 ? "mono" : MULT[k]}hydrate` : `${MULT[k]}hydro${HALIDE[el]}`)].join(" ");
  }
  const charge = (p: number[]) => p.reduce((t, i) => t + g.atoms[i].charge, 0);
  const cations = parts.filter((p) => charge(p) > 0), anions = parts.filter((p) => charge(p) < 0);
  if (!cations.length || !anions.length || cations.length + anions.length !== parts.length || parts.reduce((t, p) => t + charge(p), 0) !== 0) return undefined;
  const cationNames = cations.map((p) => cationName(g, p)), anionNames = anions.map((p) => anionOf(g, p));
  if (cationNames.includes(undefined) || anionNames.includes(undefined)) return undefined;
  // Repeated formula units (two NaCl) have no name that keeps their count.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  if (new Set(cationNames).size === 1 && new Set(anionNames).size === 1 && gcd(cations.length, anions.length) > 1) return undefined;
  // OPSIN reads a nitride only with Li, Na, K, Be, Mg, Ca or Sr, and an amide only with an s-block metal; an oxide or
  // sulfide only with a metal that has no Stock number; a hydride or cyanide not with a Stock-numbered metal, silver or
  // aluminium (it makes them covalent).
  const metals = cations.map((p) => (p.length === 1 ? g.atoms[p[0]].el : ""));
  const stockName = cationNames.some((n) => /\([IVX]+\)$/.test(n!));
  for (const n of anionNames) {
    if (n === "nitride" && !metals.every((e) => /^(Li|Na|K|Be|Mg|Ca|Sr)$/.test(e))) return undefined;
    if (n === "amide" && !metals.every((e) => /^(Li|Na|K|Rb|Cs|Fr|Be|Mg|Ca|Sr|Ba|Ra)$/.test(e))) return undefined;
    if (/^(sulfide|selenide|telluride)$/.test(n!) && (stockName || !metals.every((e) => CATIONS[e] || metal(e)))) return undefined;
    // OPSIN reads an oxide of a d- or f-block metal ion of charge 3 or more as ions (iron(III) oxide, chromium(VI)
    // oxide), and the others as covalent (copper(II) oxide is Cu=O).
    if (n === "oxide" && !cations.every((p) => CATIONS[metals[cations.indexOf(p)]] || (isMetal(metals[cations.indexOf(p)]) && g.atoms[p[0]].charge >= 3))) return undefined;
    if ((n === "hydride" || n === "cyanide") && (stockName || metals.some((e) => e === "Ag" || e === "Al"))) return undefined;
  }
  // Multiplying prefixes (IR-5.4): di and tri before a simple ion (sodium, chloride, acetate); bis and tris before
  // everything else, where di could be read otherwise: oxoanions (diphosphate is another anion), hydrogen anions and
  // substituted names (dicarboxymethanaminium). None with a Stock number or a nitride, and none before an anion with a
  // space (magnesium methyl sulfate): OPSIN takes the ratio from the charges there.
  const bare = stockName || anionNames.includes("nitride"), spaced = anionNames.some((n) => n!.includes(" "));
  const oxo = new Set([...Object.values(ANIONS), ...Object.values(LINKED), ...Object.values(PEROXY)].filter((n) => /(ate|ite)$/.test(n) && n !== "thiocyanate"));
  const simple = new Set([...Object.values(ANIONS).filter((n) => !oxo.has(n)), ...Object.values(CATIONS).map((c) => c[0]), "ammonium", "acetate", "formate", "benzoate", "phenolate"]);
  const plain = (n: string) => simple.has(n) && !/^(di|tri|tetra|penta|hexa|hydrogen)/.test(n);
  const multiplied = (k: number, name: string, anion: boolean) => (k < 2 || bare || (anion && spaced) ? name : plain(name) ? MULT[k] + name : `${MULT_COMPLEX[k]}(${name})`);
  const list = (names: string[], anion: boolean) => [...new Set(names)].sort((a, b) => alphaKey(a).localeCompare(alphaKey(b))).map((n) => multiplied(names.filter((x) => x === n).length, n, anion)).join(" ");
  return `${list(cationNames as string[], false)} ${list(anionNames as string[], true)}`;
}
// One part of a salt as a structure of its own.
function partOf(g: Graph, part: number[]): Graph {
  const index = new Map(part.map((i, k) => [i, k]));
  return { atoms: part.map((i) => ({ ...g.atoms[i] })), bonds: g.bonds.filter((b) => index.has(b.a)).map((b) => ({ ...b, a: index.get(b.a)!, b: index.get(b.b)! })) };
}
// A cation: a metal ion with its usual charge, ammonium, or an organic cation (aminium, ring "-ium").
function cationName(g: Graph, part: number[]): string | undefined {
  const a = g.atoms[part[0]];
  if (part.length === 1 && CATIONS[a.el]) return CATIONS[a.el][1] === a.charge && !a.h ? CATIONS[a.el][0] : undefined;
  if (part.length === 1 && metal(a.el) && !a.h) return ROMAN[a.charge] ? `${ELEMENTS.get(a.el)}(${ROMAN[a.charge]})` : undefined;
  if (part.length === 1 && a.el === "N" && a.h === 4 && a.charge === 1) return "ammonium";
  return speciesName(partOf(g, part)) ?? new Namer(partOf(g, part)).name();
}
// The formula of a part, with hydrogens, and its charge: CO3-2, HO-1. Carbon first, then hydrogen, then the others
// in alphabetical order; without carbon, all in alphabetical order.
function ionFormula(g: Graph, part: number[]): string {
  const count = new Map<string, number>();
  for (const i of part) { const a = g.atoms[i]; count.set(a.el, (count.get(a.el) ?? 0) + 1); if (a.h) count.set("H", (count.get("H") ?? 0) + a.h); }
  const els = [...count.keys()].sort((x, y) => (count.has("C") ? (x === "C" ? -1 : y === "C" ? 1 : x === "H" ? -1 : y === "H" ? 1 : 0) : 0) || (x < y ? -1 : x > y ? 1 : 0));
  return els.map((e) => e + (count.get(e)! > 1 ? count.get(e) : "")).join("") + part.reduce((t, i) => t + g.atoms[i].charge, 0);
}
// An anion: inorganic (chloride, carbonate), then by the namer (methanolate, 3-carboxypropanoate), then from its acid.
function anionOf(g: Graph, p: number[]): string | undefined {
  const part = partOf(g, p), iso = part.atoms.some((a) => a.iso || a.hx?.length); // (²H₄)tetrahydroborate: speciesName()
  const simple = (iso ? undefined : anionByFormula(part, ionFormula(g, p))) ?? speciesName(part);
  if (simple) return simple;
  try { return new Namer(part).name(); } catch (e) {
    let old: string | undefined;
    try { old = anionName(g, p); } catch { old = undefined; }
    if (old) return old;
    throw e;
  }
}
// An anion named from its acid or alcohol: every acid group (or every O- on carbon) must be ionised and on the parent
// (P-65.6.2.2): acetate, butanedioate, methanolate, phenolate.
function anionName(g: Graph, part: number[]): string | undefined {
  const { atoms, bonds } = partOf(g, part);
  const nbrs = (k: number) => bonds.flatMap((b) => (b.a === k ? [b] : b.b === k ? [{ ...b, b: b.a }] : []));
  // An acid group's OH: O on a C=O carbon, or on an S with two =O.
  const acidO = (k: number) => {
    const n = nbrs(k);
    if (atoms[k].el !== "O" || n.length !== 1 || n[0].order !== 1) return false;
    const owner = n[0].b, doubles = nbrs(owner).filter((b) => b.order === 2 && atoms[b.b].el === "O").length;
    return (atoms[owner].el === "C" && doubles === 1) || (atoms[owner].el === "S" && doubles === 2);
  };
  let ions = 0, olates = 0;
  for (let k = 0; k < atoms.length; k++) {
    const n = nbrs(k);
    if (acidO(k)) {
      if (atoms[k].charge !== -1) return undefined; // a hydrogen salt
      ions++;
    } else if (atoms[k].el === "O" && atoms[k].charge === -1 && n.length === 1 && n[0].order === 1 && atoms[n[0].b].el === "C") olates++;
    else continue;
    atoms[k] = { ...atoms[k], charge: 0, h: 1 };
  }
  if (ions && olates) return undefined;
  const name = new Namer({ atoms, bonds }).name();
  if (!ions && !olates && name?.endsWith("boranuide")) return name; // potassium trifluoro(phenyl)boranuide
  if (olates) {
    const m = name?.match(/(di|tri|tetra)?ol$/);
    return m && (m[1] ? MULT.indexOf(m[1]) : 1) === olates ? `${name}ate` : undefined;
  }
  const mult = name?.match(/(di|tri|tetra)(oic|carboxylic|sulfonic) acid$/)?.[1];
  if (!name?.endsWith("ic acid") || (mult ? MULT.indexOf(mult) : 1) !== ions) return undefined;
  return name.replace(/ic acid$/, "ate");
}

// What metals.ts needs from the namer.
const METAL_API: MetalApi = {
  name: (g, opaque) => new Namer(g, opaque).name(),
  prefix: (g, x, from) => { const n = new Namer(g); n.perceive(); return n.substituent(x, from); },
  groups: (g) => {
    const n = new Namer(g);
    n.perceive();
    const kind = SENIORITY.find((k) => [...n.bearer.keys()].some((a) => n.group[a] === k));
    return { kind, sites: [...n.bearer].filter(([a]) => n.group[a] === kind).map(([atom, on]) => ({ atom, on })) };
  },
  anion: anionOf, salt: saltName, cation: (el) => CATIONS[el], assemblePrefixes, alphaKey, enclose,
};

// ——— Simple species: lone atoms, parent hydrides, inorganic molecules and ions (IUPAC 2005 IR-3, IR-5, IR-6) ———
// Mononuclear parent hydrides (P-21.1, IR-6.2) by element and hydrogen count; water, ammonia and the hydrogen halides
// by the names chemists use.
const HYDRIDES: Record<string, string> = {
  B3: "borane", Al3: "alumane", Ga3: "gallane", In3: "indigane", Tl3: "thallane", Si4: "silane", Ge4: "germane", Sn4: "stannane",
  Pb4: "plumbane", N3: "ammonia", P3: "phosphane", As3: "arsane", Sb3: "stibane", Bi3: "bismuthane", O2: "water", S2: "hydrogen sulfide",
  Se2: "hydrogen selenide", Te2: "hydrogen telluride", Po2: "polane", F1: "hydrogen fluoride", Cl1: "hydrogen chloride",
  Br1: "hydrogen bromide", I1: "hydrogen iodide", At1: "astatane", P5: "λ5-phosphane",
};
Object.assign(ANIONS, {
  "N-3": "nitride", "O2-2": "dioxidanediide", "HO2-1": "hydroperoxide", "HS-1": "sulfanide", "Se-2": "selenide",
  "Te-2": "telluride", "ClO3-1": "chlorate", "ClO2-1": "chlorite", "BrO-1": "hypobromite", "BrO2-1": "bromite", "BrO3-1": "bromate",
  "BrO4-1": "perbromate", "IO-1": "hypoiodite", "IO2-1": "iodite", "IO3-1": "iodate", "O3P-3": "phosphite", "H2O2P-1": "phosphinate",
  "O7P2-4": "diphosphate", "O10P3-5": "triphosphate", "O7S2-2": "disulfate", "O8S2-2": "peroxydisulfate", "O4Se-2": "selenate", "O3Se-2": "selenite",
  "AsF6-1": "hexafluoroarsenate", "F6Sb-1": "hexafluoroantimonate", "AlCl4-1": "tetrachloroaluminate",
  "I3-1": "triiodide", "Br3-1": "tribromide", "H2NO3S-1": "sulfamate", "IO6-5": "orthoperiodate",
  "O5S2-2": "disulfite", "O5P2-4": "diphosphite", "O13P4-6": "tetraphosphate", "O16P5-7": "pentaphosphate", "ClCrO3-1": "chlorochromate",
  "FO-1": "hypofluorite",
});
// Anions of two or more centres joined by O (O3S-O-SO3), or by O-O in peroxydisulfate. The rest have one centre.
const BRIDGED = new Set(["O7P2-4", "O10P3-5", "O13P4-6", "O16P5-7", "O7S2-2", "O8S2-2", "Cr2O7-2", "O5S2-2", "O5P2-4"]);
// Anions of one centre with an O-O-, or O-OH, on it: peroxymonosulfate (Oxone's anion).
const PEROXY: Record<string, string> = { "O5S-2": "peroxymonosulfate", "HO5S-1": "hydrogen peroxymonosulfate" };
// Anions of two centres bonded to each other (O2S-SO2), whose formulas may also be an O-bridged anion's.
const LINKED: Record<string, string> = { "O4S2-2": "dithionite", "O5S2-2": "metabisulfite", "O6S2-2": "dithionate", "O6P2-4": "hypodiphosphate", "O4P2-4": "hypodiphosphite" };
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
// Metals that are not in CATIONS: named with their charge as a Stock number in salts, iron(III) chloride.
const metal = (el: string) => ELEMENTS.has(el) && !/^(H|He|B|C|N|O|F|Ne|Si|P|S|Cl|Ar|As|Se|Br|Kr|Te|I|Xe|At|Rn)$/.test(el);
// The shapes of a structure, for anionByFormula: each atom bonded to all the others as the centre.
function shapes(g: Graph): string[] {
  const label = (i: number) => { const a = g.atoms[i]; return `${a.el}${a.h ? `H${a.h > 1 ? a.h : ""}` : ""}${(a.charge > 0 ? "+" : "-").repeat(Math.abs(a.charge))}`; };
  if (g.bonds.length !== g.atoms.length - 1) return [];
  return g.atoms.flatMap((_, c) => {
    const bonds = g.bonds.filter((b) => b.a === c || b.b === c);
    return bonds.length === g.atoms.length - 1 ? [`${label(c)}(${bonds.map((b) => "-=#"[b.order - 1] + label(b.a === c ? b.b : b.a)).sort().join(",")})`] : [];
  });
}
// An inorganic anion by its formula, if it has the expected shape: one centre (not O, unless all atoms are O); for
// BRIDGED, centres joined only through O; for LINKED, two centres bonded to each other and the O on them.
function anionByFormula(g: Graph, formula: string): string | undefined {
  if (g.atoms.length === 1) return ANIONS[formula];
  const el = (i: number) => g.atoms[i].el, o = (k: number) => g.bonds.filter((b) => (el(b.a) === "O" ? 1 : 0) + (el(b.b) === "O" ? 1 : 0) === k).length;
  if (g.bonds.length !== g.atoms.length - 1) return undefined;
  if (LINKED[formula] && o(0) === 1 && o(2) === 0) return LINKED[formula];
  if (PEROXY[formula]) {
    const oo = g.bonds.find((b) => el(b.a) === "O" && el(b.b) === "O"), end = oo && [oo.a, oo.b].find((i) => g.bonds.filter((b) => b.a === i || b.b === i).length === 1);
    return !o(0) && o(2) === 1 && end !== undefined && (g.atoms[end].h === 1 || g.atoms[end].charge === -1) ? PEROXY[formula] : undefined;
  }
  if (BRIDGED.has(formula)) return !o(0) && o(2) === (formula === "O8S2-2" ? 1 : 0) ? ANIONS[formula] : undefined;
  return ANIONS[formula] && shapes(g).some((s) => s[0] !== "O" || g.atoms.every((a) => a.el === "O")) ? ANIONS[formula] : undefined;
}

// A structure of one fragment that is a simple species: a lone atom by its element name (argon, sodium), a parent
// hydride (ammonia, phosphane), a monatomic ion (chloride, sodium(1+)), or an inorganic molecule or ion by formula
// (hydrogen peroxide, nitrate). Undefined for the rest, which the namer names.
function speciesName(g: Graph): string | undefined {
  if (g.atoms.some((a) => a.iso || a.hx?.length)) return isotopeSpecies(g, speciesName); // (²H₂)water (namer-maingroup.ts)
  const known = inorganicSpecies(g); // hydrogen peroxide, nitric acid, orthotelluric acid, seleninyl dichloride (namer-maingroup.ts)
  if (known) return known;
  const f = ionFormula(g, g.atoms.map((_, i) => i));
  const inorganic = f.includes("-") ? anionByFormula(g, f) : undefined;
  if (inorganic) return inorganic;
  if (g.atoms.length !== 1) return undefined;
  const a = g.atoms[0];
  if (!a.charge) return a.h ? HYDRIDES[`${a.el}${a.h}`] : a.el === "H" ? undefined : ELEMENTS.get(a.el);
  return a.charge > 0 && !a.h && a.el !== "H" && ELEMENTS.has(a.el) ? `${ELEMENTS.get(a.el)}(${a.charge}+)` : undefined;
}

// The structure with each benzene ring (six atoms, bonds alternately single and double) drawn with its other Kekulé
// structure; undefined if it has none.
function otherKekule(g: Graph): Graph | undefined {
  const order = new Map(g.bonds.map((b) => [b.a < b.b ? `${b.a} ${b.b}` : `${b.b} ${b.a}`, b.order]));
  const ord = (a: number, b: number) => order.get(a < b ? `${a} ${b}` : `${b} ${a}`) ?? 0;
  const adj = g.atoms.map(() => [] as number[]);
  for (const b of g.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  const flip = new Set<string>();
  const walk = (path: number[]) => {
    if (path.length === 6) {
      if (ord(path[5], path[0]) === 1) path.forEach((a, i) => { const b = path[(i + 1) % 6]; flip.add(a < b ? `${a} ${b}` : `${b} ${a}`); });
      return;
    }
    const last = path[path.length - 1];
    for (const n of adj[last]) if (!path.includes(n) && ord(last, n) === (path.length % 2 ? 2 : 1)) walk([...path, n]);
  };
  for (let a = 0; a < g.atoms.length; a++) walk([a]);
  if (!flip.size) return undefined;
  return { atoms: g.atoms, bonds: g.bonds.map((b) => (flip.has(b.a < b.b ? `${b.a} ${b.b}` : `${b.b} ${b.a}`) ? { ...b, order: (3 - b.order) as 1 | 2 } : b)) };
}

export function iupacName(g: Graph): string | undefined {
  return iupacNameWhy(g).name;
}

// The IUPAC numbering of a structure's parent chain or ring, as its name numbers it (Show atom numbers): each atom's
// locant ("1", "4a", "2'"), undefined for atoms off the parent. Undefined when the namer gives no name or names the
// structure some other way (an ester, a salt, a multiplied parent).
export function iupacLocants(g: Graph): (string | undefined)[] | undefined {
  try {
    const { g: folded, index } = foldIndexed(g);
    if (fragments(folded).length !== 1) return undefined;
    const n = new Namer(chargeSeparated(folded));
    if (!n.name() || !n.locants) return undefined;
    return g.atoms.map((_, i) => (index[i] === undefined ? undefined : n.locants!.get(index[i])));
  } catch {
    return undefined;
  }
}

// Hydrogen drawn as an atom (an H label, a wedged H) counts on the atom it is bonded to.
function foldHydrogens(g: Graph): Graph {
  return foldIndexed(g).g;
}
// The same, with where each atom went (undefined for an H folded in).
function foldIndexed(g: Graph): { g: Graph; index: (number | undefined)[] } {
  const bonds = (i: number) => g.bonds.filter((b) => b.a === i || b.b === i);
  const other = (i: number) => { const b = bonds(i)[0]; return b.a === i ? b.b : b.a; };
  const drop = g.atoms.map((a, i) => a.el === "H" && !a.charge && !a.h && bonds(i).length === 1 && bonds(i)[0].order === 1 && g.atoms[other(i)].el !== "H");
  if (!drop.some(Boolean)) return { g, index: g.atoms.map((_, i) => i) };
  const index: (number | undefined)[] = [], atoms: Graph["atoms"] = [];
  g.atoms.forEach((a, i) => { if (!drop[i]) { index[i] = atoms.length; atoms.push({ ...a }); } });
  g.atoms.forEach((a, i) => {
    if (!drop[i]) return;
    const to = atoms[index[other(i)]!];
    to.h++;
    if (a.iso) to.hx = [...(to.hx ?? []), a.iso]; // deuterium and tritium: their mass numbers (namer-maingroup.ts)
  });
  return { g: { atoms, bonds: g.bonds.filter((b) => !drop[b.a] && !drop[b.b]).map((b) => ({ ...b, a: index[b.a]!, b: index[b.b]! })) }, index };
}

// The name, or why Octet cannot name the structure yet (the namer's reason, for its tests and the gap survey).
export function iupacNameWhy(g: Graph): { name?: string; why?: string } {
  try {
    if (!g.atoms.length) return { why: "empty" };
    const folded = chargeSeparated(foldHydrogens(g)), name = nameOf(folded); // R-N(=O)=O as R-N⁺(=O)O⁻ (namer-maingroup.ts)
    // Every isotope must be cited (P-82): a part of the namer that does not cite them gives no name.
    if (name && citedNuclides(name) !== folded.atoms.reduce((t, a) => t + (a.iso ? 1 : 0) + (a.hx?.length ?? 0), 0)) return { why: "isotope" };
    return name ? { name } : { why: fragments(folded).length === 1 ? "no name" : "salt" };
  } catch (e) {
    return { why: e instanceof Error ? e.message : String(e) };
  }
}

// The N-oxide of a nitrile or imine (P-62.5): the structure with one N, named without its O-, then "N-oxide":
// methanenitrile N-oxide (fulminic acid), N-hydroxymethanimine N-oxide. Ring and amine N-oxides are named in
// nameParent (namer-hetero.ts nOxides: pyridine 1-oxide, N,N-dimethylmethanamine N-oxide). Undefined for the rest.
function nOxideName(g: Graph): string | undefined {
  const charged = g.atoms.flatMap((a, i) => (a.charge ? [i] : []));
  if (charged.length !== 2 || g.atoms.filter((a) => a.el === "N").length !== 1) return undefined;
  const o = charged.find((i) => g.atoms[i].el === "O" && g.atoms[i].charge === -1 && !g.atoms[i].h), n = charged.find((i) => g.atoms[i].el === "N" && g.atoms[i].charge === 1);
  const bond = g.bonds.find((b) => (b.a === o && b.b === n) || (b.a === n && b.b === o));
  if (o === undefined || n === undefined || !bond || bond.order !== 1 || g.bonds.filter((b) => b.a === o || b.b === o).length !== 1) return undefined;
  if (!g.bonds.some((b) => (b.a === n || b.b === n) && b.order > 1 && g.atoms[b.a === n ? b.b : b.a].el === "C") || new Namer(g).inRing[n]) return undefined;
  const keep = g.atoms.map((_, i) => i).filter((i) => i !== o), index = new Map(keep.map((i, k) => [i, k]));
  const neutral: Graph = { atoms: keep.map((i) => ({ ...g.atoms[i], charge: 0 })), bonds: g.bonds.filter((b) => b !== bond).map((b) => ({ ...b, a: index.get(b.a)!, b: index.get(b.b)! })) };
  try { const name = new Namer(neutral).name(); return name && `${name} N-oxide`; } catch { return undefined; }
}
// The fragments of a structure, by atom.
function fragments(g: Graph): number[][] {
  const adj = g.atoms.map(() => [] as number[]);
  for (const b of g.bonds) { adj[b.a].push(b.b); adj[b.b].push(b.a); }
  const parts: number[][] = [], seen = new Set<number>();
  for (let s = 0; s < g.atoms.length; s++) {
    if (seen.has(s)) continue;
    const part = [s], stack = [s];
    seen.add(s);
    while (stack.length) { const i = stack.pop()!; for (const j of adj[i]) if (!seen.has(j)) { seen.add(j); part.push(j); stack.push(j); } }
    parts.push(part);
  }
  return parts;
}
// A structure's name: one with metal atoms (metals.ts), a simple species, one structure, or a salt.
function nameOf(g: Graph): string | undefined {
  const parts = fragments(g);
  const named = (h: Graph) => metalName(h, parts, METAL_API) ?? (parts.length === 1 ? speciesName(h) ?? nOxideName(h) ?? new Namer(h).name() : saltName(h, parts));
  try { return named(g); } catch (e) {
    // A von Baeyer name cannot cite a double bond between bridgeheads; the benzene rings drawn the other way round
    // avoid it: bicyclo[4.2.0]octa-1,3,5-triene.
    const other = e instanceof Error && e.message === "bridgehead double bond" && parts.length === 1 ? otherKekule(g) : undefined;
    if (!other) throw e;
    return named(other);
  }
}

// For namer-hetero.ts, which names groups built on N, O, S, P and the halogens.
export { Namer, enclose, substituted, assemblePrefixes, alphaKey, alkylWords, times, joinPrefixes, MULT, MULT_COMPLEX, HALO, SENIORITY, CARBON_GROUP, chainStem, citedLabels };
export type { Name, Kind };
