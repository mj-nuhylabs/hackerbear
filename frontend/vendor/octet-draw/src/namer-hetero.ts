// Octet's IUPAC namer, part 2: groups built on N, O, S, P and the halogens (IUPAC 2013, P-6). Clean room, from the
// published rules. namer.ts calls these functions at a few fixed points (perception, suffixes, prefixes and the
// whole-molecule name); each takes the namer itself. Every name is still read back by OPSIN before the app shows it.
import { alkylWords, assemblePrefixes, alphaKey, enclose, substituted, times, HALO, MULT, MULT_COMPLEX, SENIORITY, type Name, type Namer } from "./namer.ts";
import { azoxy, azoxyName, azoxyPrefix } from "./namer-maingroup.ts";

// ——— Variants of principal groups: thio analogues and hydroperoxides ———
// =S and -S- in place of =O and -O- (P-65.1.5, P-65.6.3.2.3, P-66.1.4.1, P-64.6), and -OO- in place of -O- in an
// alcohol (P-63.4.2.1). Peroxy acids and esters are kinds of their own in namer.ts. The variant of a group atom: "S"
// (=O and -S-: thioic S-acid), "O" (=S and -O-: thioic O-acid), "SS" (dithioic acid), "=S" (=S on its own: thioamide,
// thial, thione), "OO" (peroxol), or "".
export function groupVariant(n: Namer, c: number): string {
  if (n.el[c] === "S" && n.group[c] === "ketone" && n.adj[c].length === 1) return "=S"; // =S on a ring P: 1λ⁵-phospholane-1-thione
  if (n.el[c] === "S") return n.group[c] && VARIANT_SUFFIX[n.group[c]!] ? (oxo(n, c).length === 1 ? (n.adj[c].some((j) => n.el[j] === "N" && n.ord(c, j) === 2) ? "S=N" : "S=O") : "") + (n.adj[c].some((j) => n.het.get(j) === "SSR") ? "S" : "") : ""; // sulfinic acid, sulfonimidic acid, sulfonothioate
  if (n.el[c] === "O") return n.group[c] === "alcohol" && n.adj[c].some((j) => n.el[j] === "O") ? "OO" : "";
  const d = n.carbonylO[c];
  if (d < 0) return "";
  const x = n.esterO.get(c) ?? n.adj[c].find((j) => j !== d && n.group[j] === "acid" && n.el[j] !== "C");
  if (x !== undefined && n.el[x] === "O" && n.adj[x].some((j) => j !== c && n.el[j] === "O")) return n.el[d] === "O" ? "" : "?";
  const dbl = n.el[d] === "S" || n.el[d] === "Se" || n.el[d] === "Te", single = x !== undefined && n.el[x] === "S";
  return dbl && single ? "SS" : dbl && x !== undefined ? "O" : single ? "S" : dbl ? "=S" : "";
}
// Whether the group carbon's double bond is to S (C=S).
export const thioDouble = (n: Namer, c: number) => n.carbonylO[c] >= 0 && n.el[n.carbonylO[c]] === "S";
const VARIANT_SUFFIX: Record<string, Record<string, [string, string]>> = {
  acid: { S: ["thioic S-acid", "carbothioic S-acid"], O: ["thioic O-acid", "carbothioic O-acid"], SS: ["dithioic acid", "carbodithioic acid"] },
  ester: { S: ["thioate", "carbothioate"], O: ["thioate", "carbothioate"], SS: ["dithioate", "carbodithioate"] },
  amide: { "=S": ["thioamide", "carbothioamide"] }, aldehyde: { "=S": ["thial", "carbothialdehyde"] },
  ketone: { "=S": ["thione", "thione"] }, halide: { "=S": ["thioyl", "carbothioyl"] }, alcohol: { OO: ["peroxol", "peroxol"] },
  sulfonic: { "S=O": ["sulfinic acid", "sulfinic acid"], "S=N": ["sulfonimidic acid", "sulfonimidic acid"] }, sulfonate: { "S=O": ["sulfinate", "sulfinate"], S: ["sulfonothioate", "sulfonothioate"], "S=OS": ["sulfinothioate", "sulfinothioate"] },
  sulfonamide: { "S=O": ["sulfinamide", "sulfinamide"] }, sulfonylhalide: { "S=O": ["sulfinyl", "sulfinyl"] },
};
// The suffix for a parent's principal groups when they are variants: ethanethioamide, propane-2-thione, benzenecarbothioic
// S-acid, 2-methylpropane-2-peroxol. Plain groups are senior to their variants (P-41, P-43): when a parent has both,
// the variants leave the suffix (sites) and are cited as prefixes (sulfanylidene, carbamothioyl, hydroperoxy).
export function variantSuffix(n: Namer, kind: string | undefined, sites: { atom: number; group: number }[], used: Set<number>, ring: boolean): string | undefined {
  if (!kind || !sites.length) return undefined;
  const v = sites.map((s) => groupVariant(n, s.group));
  if (v.every((x) => !x)) return undefined;
  if (v.some((x) => !x)) {
    for (const s of sites.filter((_, k) => v[k])) { used.delete(s.group); used.delete(n.carbonylO[s.group]); }
    const keep = sites.filter((_, k) => !v[k]);
    sites.length = 0;
    sites.push(...keep);
    return undefined;
  }
  const t = VARIANT_SUFFIX[kind]?.[v[0]];
  if (!t || v.some((x) => x !== v[0]) || (sites.length > 1 && (kind === "acid" || kind === "ester"))) throw new Error("thio");
  // =Se or =Te on an O-acid's carbon: selenoic O-acid, telluroic O-acid (P-65.1.5.1).
  const x = n.el[n.carbonylO[sites[0].group]];
  if (x === "Se" || x === "Te") {
    if (kind !== "acid" || v[0] !== "O" || sites.some((s) => n.el[n.carbonylO[s.group]] !== x)) throw new Error("seleno");
    return t[ring ? 1 : 0].replace("thio", x === "Se" ? "seleno" : "telluro");
  }
  return t[ring ? 1 : 0];
}
// An acyl prefix with =S: ethanethioyl, benzenecarbothioyl, cyclohexanecarbothioyl, methanethioyl (P-65.1.7.3.2).
export function thioAcyl(n: Namer, c: number, name: Name): Name {
  if (!thioDouble(n, c)) return name;
  const t = name.text;
  const text = /formyl$/.test(t) ? t.replace(/formyl$/, "methanethioyl") : /acetyl$/.test(t) ? t.replace(/acetyl$/, "ethanethioyl")
    : /benzoyl$/.test(t) ? t.replace(/benzoyl$/, t === "benzoyl" ? "benzenecarbothioyl" : "benzene-1-carbothioyl") : /carbonyl$/.test(t) ? t.replace(/carbonyl$/, "carbothioyl")
    : /oyl$/.test(t) ? t.replace(/oyl$/, "ethioyl") : undefined;
  if (!text) throw new Error("thio");
  return { text, compound: name.compound || text !== t };
}
// A variant acid, ester or amide group cited as a prefix: sulfanylcarbonyl, hydroxycarbonothioyl, carbamothioyl,
// methoxycarbonothioyl, (methylsulfanyl)carbonyl (P-65.1.7.3, P-65.6.3.2.3, P-66.1.4.1.3).
// Undefined for the rest.
export function thioPrefix(n: Namer, x: number, kind: string | undefined): Name | undefined {
  const v = groupVariant(n, x);
  if (!v) return undefined;
  if (kind === "acid") return { text: v === "S" ? "sulfanylcarbonyl" : v === "O" ? "hydroxycarbonothioyl" : "sulfanylcarbonothioyl", compound: true };
  if (kind === "aldehyde") return { text: "methanethioyl", compound: false };
  if (kind === "amide") {
    const nAtom = n.amideN(x)!, subs = n.adj[nAtom].filter((j) => j !== x).map((j) => n.substituent(j, nAtom));
    if (!subs.length) return { text: "carbamothioyl", compound: false };
    const inner = subs.length === 2 && subs[0].text === subs[1].text ? `di${enclose(subs[0])}` : subs.map(enclose).join("");
    return { text: `${inner}carbamothioyl`, compound: true };
  }
  if (kind === "ester") {
    const alkoxy = n.substituent(n.esterO.get(x)!, x), carbonyl = n.el[n.carbonylO[x]] === "S" ? "carbonothioyl" : "carbonyl";
    return { text: `${enclose(alkoxy)}${carbonyl}`.replace(/^\(([a-z-]+oxy)\)(carbon[a-z]+)$/, "$1$2"), compound: true };
  }
  // A ketone's =S is named by thioAcyl(); other groups with =S are not covered.
  if (kind !== "ketone") throw new Error("thio");
  return undefined;
}

// ——— Groups perceived before carbonyl groups ———
// Hypervalent iodine on a carbon (P-68.5.1): iodosyl, iodyl and λ3-iodanyl groups such as
// [bis(acetyloxy)-λ3-iodanyl]benzene, with the acyl carbons of their acyloxy ligands. Role "I3". namer.ts leaves these
// carbons out of its chains. (Isocyanates and cyanates are namer.ts's pseudoGroup().)
export function perceiveIodanes(n: Namer) {
  for (let c = 0; c < n.n; c++) if (n.el[c] === "I" && !n.inRing[c] && !n.q[c] && n.adj[c].length >= 2) iodane(n, c);
  // OH, O-alkyl and acyloxy on a ring halogen (role "XO", with the acyl group's C and =O): hydroxy and acetyloxy
  // prefixes on its ring (1-hydroxy-3H-1λ³,2-benziodoxol-3-one, Dess–Martin periodinane), an OH alone the suffix ol.
  for (let x = 0; x < n.n; x++) {
    if (!HALO[n.el[x]] || !n.inRing[x] || n.q[x]) continue;
    for (const o of n.adj[x]) {
      if (n.el[o] !== "O" || n.inRing[o] || n.q[o] || n.ord(x, o) !== 1) continue;
      const r = n.adj[o].find((j) => j !== x), acyl = r !== undefined && n.carbonylO[r] >= 0;
      if (r === undefined ? n.h[o] !== 1 : n.adj[o].length !== 2 || n.el[r] !== "C" || n.isNitrileC(r) || n.inRing[r] || (acyl && n.adj[r].some((j) => j !== o && j !== n.carbonylO[r] && n.el[j] !== "C"))) continue;
      for (const k of acyl ? [o, r, n.carbonylO[r]] : [o]) n.het.set(k, "XO");
      if (r === undefined) n.mark(o, "alcohol", [x]);
    }
  }
}
// Iodosyl (C-I=O), iodyl (C-I(=O)=O) and λ3-iodanyl (C-I with two O or halogen ligands) groups at x.
function iodane(n: Namer, x: number) {
  const cs = n.adj[x].filter((j) => n.el[j] === "C" && n.ord(x, j) === 1), dbl = oxo(n, x), lig = n.adj[x].filter((j) => !cs.includes(j) && !dbl.includes(j));
  if (cs.length !== 1) return;
  const acyl: number[] = [];
  const okLig = (j: number) => {
    if (n.ord(x, j) !== 1 || n.q[j] || n.inRing[j]) return false;
    if (HALO[n.el[j]]) return n.adj[j].length === 1;
    if (n.el[j] !== "O") return false;
    if (n.adj[j].length === 1) return n.h[j] === 1;
    const r = n.adj[j].find((k) => k !== x)!;
    if (n.adj[j].length !== 2 || n.el[r] !== "C" || n.inRing[r]) return false;
    if (n.carbonylO[r] >= 0) { const others = n.adj[r].filter((k) => k !== j && k !== n.carbonylO[r]); if (others.length > 1 || others.some((k) => n.el[k] !== "C")) return false; acyl.push(r, n.carbonylO[r]); }
    return true;
  };
  if (!((dbl.length && !lig.length && dbl.length <= 2) || (!dbl.length && lig.length === 2 && lig.every(okLig)))) return;
  for (const k of [x, ...dbl, ...lig, ...acyl]) n.het.set(k, "I3");
}

// ——— Perception of hetero-hetero links ———
// Roles (n.het): "SS" polysulfide S (P-63.4.2.2), "OO" peroxide O, "NN" hydrazine N (P-68.3.1.2), "N=N" diazene N
// (P-68.3.1.3), "hz" hydrazone N (C=N-N), "NO" hydroxylamine N and O (P-68.3.1.1), "ON" an O on an amide or ring
// N, "N=O" nitroso N and O (P-61.5.1), "NX" a halogen on N.
const plainC = (n: Namer, j: number) => n.el[j] === "C" && n.carbonylO[j] < 0 && !n.isNitrileC(j);
const single = (n: Namer, i: number) => n.adj[i].every((j) => n.ord(i, j) === 1);
const free = (n: Namer, i: number) => !n.inRing[i] && !n.q[i] && !n.group[i] && !n.het.has(i) && !n.cip[i];
// An O on a ring or hydroxylamine N: OH, or O bonded to a plain carbon.
const oxyOnN = (n: Namer, o: number, on: number) => n.el[o] === "O" && free(n, o) && single(n, o) && n.adj[o].length + n.h[o] === 2 && n.adj[o].every((j) => j === on || plainC(n, j));

// A neighbour j of an amide N (not the carbonyl carbon) that is not a carbon: N-halo, N-sulfonyl. Claims it. (N-hydroxy
// and N-methoxy are namer.ts's nOxy().)
export function amideHetero(n: Namer, j: number): boolean {
  if (HALO[n.el[j]] && n.adj[j].length === 1) { n.het.set(j, "NX"); return true; }
  // A sulfonyl S (an N-acylsulfonamide, named as the carboxamide: N-(benzenesulfonyl)acetamide); perceiveSulfur
  // takes the S.
  return n.el[j] === "S" && !n.inRing[j] && !n.q[j] && oxo(n, j).length === 2 && n.adj[j].length === 4 && n.adj[j].filter((k) => n.el[k] === "C").length === 1;
}

export function perceiveHetero(n: Namer) {
  const { el, adj, h } = n;
  perceiveSulfur(n);
  perceiveCentres(n);
  for (let i = 0; i < n.n; i++) { const z = el[i] === "O" ? azoxy(n, i) : undefined; if (z) for (const a of [z.p, z.m, z.o]) n.het.set(a, "azoxy"); }
  for (let i = 0; i < n.n; i++) {
    if (nOxideO(n, i)) { n.het.set(i, "NO-"); continue; }
    // Halogens on N (N-bromo, N-chloro); the N is an amine, amide or ring N.
    if (HALO[el[i]] && adj[i].length === 1 && el[adj[i][0]] === "N" && !n.q[i] && n.ord(i, adj[i][0]) === 1) { n.het.set(i, "NX"); continue; }
    if (!free(n, i)) continue;
    if (el[i] === "S" && single(n, i) && adj[i].length + h[i] === 2 && adj[i].some((j) => el[j] === "S")) {
      // Polysulfanes: each S of the chain has two bonds, to S, a plain carbon or H.
      const chain = sulfurChain(n, i);
      if (chain && chain.length <= 6) for (const s of chain) n.het.set(s, "SS");
      continue;
    }
    if (el[i] === "O" && single(n, i) && adj[i].length + h[i] === 2) {
      const o = adj[i].find((j) => el[j] === "O");
      if (o === undefined || !free(n, o) || !single(n, o) || adj[o].length + h[o] !== 2) continue;
      const ends = [...adj[i], ...adj[o]].filter((j) => j !== i && j !== o);
      if (!ends.every((j) => plainC(n, j))) continue;
      n.het.set(i, "OO"); n.het.set(o, "OO");
      // A hydroperoxide (R-OOH) is a principal group like an alcohol, named by the suffix peroxol.
      const [inner, cs] = h[o] === 1 ? [i, adj[i].filter((j) => j !== o)] : h[i] === 1 ? [o, adj[o].filter((j) => j !== i)] : [-1, []];
      if (inner >= 0) n.mark(inner, "alcohol", cs);
      continue;
    }
    if (el[i] !== "N") continue;
    const ns = adj[i].filter((j) => el[j] === "N"), os = adj[i].filter((j) => el[j] === "O");
    // Nitroso (R-N=O, R2N-N=O): only a prefix.
    const oxo = os.find((o) => n.ord(i, o) === 2 && adj[o].length === 1 && !n.q[o]);
    if (oxo !== undefined) {
      const r = adj[i].filter((j) => j !== oxo);
      if (r.length === 1 && !h[i] && n.ord(i, r[0]) === 1 && (plainC(n, r[0]) || el[r[0]] === "N" || n.group[r[0]] === "ketone")) { n.het.set(i, "N=O"); n.het.set(oxo, "N=O"); } // on a ketone: nitroso(phenyl)methanone
      continue;
    }
    // Diazenes (R-N=N-R'), hydrazones (C=N-N) and hydrazines (N-N), with only plain carbons and H otherwise.
    if (ns.length === 1 && !os.length) {
      const m = ns[0];
      if (!free(n, m) || n.ord(i, m) === 3) continue;
      const others = [...adj[i], ...adj[m]].filter((j) => j !== i && j !== m);
      if (n.ord(i, m) === 2) {
        // A ketone's carbon too: 1-(phenyldiazenyl)ethan-1-one.
        if (adj[i].length + h[i] === 2 && adj[m].length + h[m] === 2 && others.every((j) => (plainC(n, j) || n.group[j] === "ketone") && n.ord(i, j) + n.ord(m, j) === 1)) { n.het.set(i, "N=N"); n.het.set(m, "N=N"); }
        // A triazene (P-68.3.1.4): R-N=N-NR2, the amine N with only plain carbons and H.
        const y = adj[m].find((j) => j !== i);
        if (y !== undefined && el[y] === "N" && free(n, y) && single(n, y) && adj[y].length + h[y] === 3 && adj[y].every((j) => j === m || plainC(n, j))
          && adj[i].length + h[i] === 2 && adj[m].length === 2 && adj[i].every((j) => j === m || plainC(n, j))) for (const k of [i, m, y]) n.het.set(k, "N3");
        continue;
      }
      // i = the N bonded by a double bond to C (hydrazone), m = the other.
      const c = adj[i].find((j) => n.ord(i, j) === 2);
      if (c !== undefined) {
        if (el[c] === "C" && n.carbonylO[c] < 0 && !n.isNitrileC(c) && adj[i].length === 2 && !h[i] && single(n, m) && adj[m].length + h[m] === 3 && adj[m].every((j) => j === i || plainC(n, j))) { n.het.set(i, "hz"); n.het.set(m, "hz"); }
        continue;
      }
      if (n.adj[m].some((j) => n.ord(m, j) === 2)) continue; // the hydrazone's other N, from its own side
      if (single(n, i) && single(n, m) && adj[i].length + h[i] === 3 && adj[m].length + h[m] === 3 && others.every((j) => plainC(n, j))) { n.het.set(i, "NN"); n.het.set(m, "NN"); }
      continue;
    }
    // Hydroxylamines: an N with one O (OH or O-C), and otherwise plain carbons and H.
    const nitrosoN = (j: number) => el[j] === "N" && !n.q[j] && adj[j].length === 2 && adj[j].some((o) => el[o] === "O" && n.ord(j, o) === 2 && adj[o].length === 1);
    if ((os.length === 1 || os.length === 2) && ns.every(nitrosoN) && single(n, i) && adj[i].length + h[i] === 3 && os.every((o) => oxyOnN(n, o, i)) && adj[i].every((j) => os.includes(j) || plainC(n, j) || nitrosoN(j))) {
      n.het.set(i, "NO");
      for (const o of os) n.het.set(o, "NO"); // N,N-dihydroxy: (dihydroxyamino)
    }
  }
  // Sulfenyl groups (P-63.3.2): R-S-Cl (chlorosulfanyl), R-S-OH (hydroxysulfanyl), R-S-NR2 (N-(phenylsulfanyl)).
  for (let i = 0; i < n.n; i++) {
    if (el[i] !== "S" || n.inRing[i] || n.q[i] || h[i] || adj[i].length !== 2 || !single(n, i) || n.het.has(i) || n.group[i] || n.sulfur.has(i)) continue;
    const c = adj[i].find((j) => el[j] === "C"), x = adj[i].find((j) => j !== c);
    if (c === undefined || x === undefined || (!plainC(n, c) && !n.inRing[c])) continue;
    if (HALO[el[x]] && adj[x].length === 1 && !n.het.has(x)) { n.het.set(i, "S-"); n.het.set(x, "S-"); }
    else if (el[x] === "O" && !n.inRing[x] && (adj[x].length === 1 ? h[x] === 1 : adj[x].length === 2 && plainC(n, adj[x].find((j) => j !== i)!)) && !n.het.has(x) && !n.group[x]) { n.het.set(i, "S-"); n.het.set(x, "S-"); }
    else if (el[x] === "N" && !n.q[x] && (n.inRing[x] || (single(n, x) && adj[x].every((j) => j === i || plainC(n, j)))) && !n.het.has(x)) n.het.set(i, "SN-");
  }
  // Ring N bearing OH or OR: N-hydroxy (piperidin-1-ol, 1-hydroxypyrrolidine-2,5-dione), N-alkoxy.
  for (let i = 0; i < n.n; i++) {
    if (el[i] !== "N" || !n.inRing[i] || n.q[i]) continue;
    for (const o of adj[i]) if (!n.inRing[o] && oxyOnN(n, o, i)) { n.het.set(o, "ON"); if (h[o] === 1) n.mark(o, "alcohol", [i]); }
  }
}
// The S atoms of a polysulfane chain through s, if every S has two bonds (to S, a plain carbon or H).
function sulfurChain(n: Namer, s: number): number[] | undefined {
  const chain = [s], stack = [s];
  while (stack.length) {
    const i = stack.pop()!;
    for (const j of n.adj[i]) {
      if (n.el[j] !== "S" || chain.includes(j)) continue;
      if (!free(n, j) || !single(n, j) || n.adj[j].length + n.h[j] !== 2) return undefined;
      chain.push(j); stack.push(j);
    }
  }
  const ends = chain.flatMap((i) => n.adj[i].filter((j) => n.el[j] !== "S"));
  return ends.every((j) => plainC(n, j)) ? chain : undefined;
}
// An amine N with hetero neighbours: N-halo, N-nitroso, and amines on a ring N (4-methyl-N,N-diphenylpiperidin-1-amine,
// a hydrazine with one N in a ring). Marks it as an amine borne by its carbons and ring N.
export function heteroAmine(n: Namer, i: number): boolean {
  if ((n.q[i] && !nOxideN(n, i)) || !single(n, i)) return false;
  const on = n.adj[i].filter((j) => plainC(n, j) || (n.el[j] === "N" && n.inRing[j] && !n.q[j]));
  const rest = n.adj[i].filter((j) => !on.includes(j));
  if (!on.length || (!rest.length && on.every((j) => n.el[j] === "C")) || !rest.every((j) => n.het.get(j) === "NX" || n.het.get(j) === "N=O" || n.het.get(j) === "SN-" || nOxideO(n, j) || n.nitroAtom(j))) return false;
  n.mark(i, "amine", on);
  return true;
}
// Bonds between heteroatoms that perception accounted for.
export function heteroBond(n: Namer, a: number, b: number): boolean {
  if (n.het.has(a) || n.het.has(b) || nOxideO(n, a) || nOxideO(n, b)) return true;
  if ((n.group[a] === "imine" && n.inRing[b]) || (n.group[b] === "imine" && n.inRing[a])) return true; // an imine on a ring N
  return (n.group[a] === "amine" && !!n.bearer.get(a)?.includes(b)) || (n.group[b] === "amine" && !!n.bearer.get(b)?.includes(a));
}

// ——— Oxoacid centres of sulfur (P-65.3, P-66.1.1.4, P-67.1) ———
// The terminal =O atoms of an S or P; the terminal =S atoms of a P (phosphorothioates).
const oxo = (n: Namer, x: number) => n.adj[x].filter((j) => n.el[j] === "O" && n.ord(x, j) === 2 && n.adj[j].length === 1 && !n.q[j]);
const thioxo = (n: Namer, x: number) => n.adj[x].filter((j) => n.el[j] === "S" && n.ord(x, j) === 2 && n.adj[j].length === 1 && !n.q[j]);
// A ligand of an S or P oxoacid centre x (single bond): "OH", "OR" (ester), "SR" (thioester), "N" (amide), "Nring" (a
// ring N), "N3" (azide), "X" (halide), or "bridge" (an O to another S or P centre: an anhydride, a diphosphate).
// Undefined for anything else.
function ligand(n: Namer, x: number, j: number): string | undefined {
  if (n.ord(x, j) !== 1 || n.q[j]) return undefined;
  if (HALO[n.el[j]]) return n.adj[j].length === 1 ? "X" : undefined;
  if (n.el[j] === "C") return n.el[x] === "P" && cyanide(n, j) ? "X" : undefined; // a cyanide, named as a halide
  if (n.el[j] === "O" && !n.inRing[j]) {
    if (n.adj[j].length === 1) return n.h[j] === 1 ? "OH" : undefined;
    const k = n.adj[j].find((y) => y !== x)!;
    // On a carbon, or on Si, Ge or Sn (trimethylsilyl trifluoromethanesulfonate).
    if (n.adj[j].length === 2 && (plainC(n, k) || (["Si", "Ge", "Sn"].includes(n.el[k]) && !n.inRing[k] && !n.q[k]))) return "OR";
    if (n.adj[j].length === 2 && ((n.el[k] === "S" && oxo(n, k).length === 2) || n.el[k] === "P") && !n.inRing[k] && !n.q[k]) return "bridge";
    return undefined;
  }
  if (n.el[j] === "S" && !n.inRing[j] && n.adj[j].length === 2 && plainC(n, n.adj[j].find((y) => y !== x)!)) return "SR";
  if (n.el[j] !== "N") return undefined;
  if (n.inRing[j]) return "Nring";
  if (azideN(n, j) === x) return "N3";
  // An imine N on S (a sulfinimine): N-[(E)-phenylmethylidene]-2-methylpropane-2-sulfinamide.
  if (n.adj[j].length === 2 && !n.h[j]) { const c = n.adj[j].find((y) => y !== x)!; if (n.el[c] === "C" && n.ord(j, c) === 2 && n.carbonylO[c] < 0 && !n.isNitrileC(c) && n.el[x] === "S") return "N"; }
  return single(n, j) && n.adj[j].length + n.h[j] === 3 && n.adj[j].every((y) => y === x || plainC(n, y) || (n.el[y] === "S" && !n.inRing[y] && oxo(n, y).length === 2) || nitrosoOrAmino(n, y, j) || (HALO[n.el[y]] && n.adj[y].length === 1) || (n.el[y] === "C" && (n.group[y] === "amide" || n.group[y] === "urea" || n.group[y] === "carbamate"))) ? "N" : undefined;
}
// An N on an amide N j: nitroso (N-methyl-N-nitroso), amino (a hydrazide: N-amino), or an imine N (=N-, a hydrazone).
function nitrosoOrAmino(n: Namer, y: number, j: number): boolean {
  if (n.el[y] !== "N" || n.inRing[y] || n.q[y] || n.ord(y, j) !== 1) return false;
  const rest = n.adj[y].filter((k) => k !== j);
  if (rest.length === 1 && n.el[rest[0]] === "O" && n.ord(y, rest[0]) === 2 && n.adj[rest[0]].length === 1) return true;
  if (single(n, y) && n.adj[y].length + n.h[y] === 3 && rest.every((k) => plainC(n, k))) return true;
  return rest.length === 1 && !n.h[y] && n.el[rest[0]] === "C" && n.ord(y, rest[0]) === 2 && n.carbonylO[rest[0]] < 0;
}
// The atom an azido group (-N=N+=N-) at its first N, i, is bonded to; undefined if i is not one.
function azideN(n: Namer, i: number): number | undefined {
  if (n.el[i] !== "N" || n.q[i] || n.adj[i].length !== 2) return undefined;
  const mid = n.adj[i].find((j) => n.el[j] === "N" && n.q[j] === 1 && n.ord(i, j) === 2);
  if (mid === undefined || n.adj[mid].length !== 2) return undefined;
  const end = n.adj[mid].find((j) => j !== i)!;
  if (n.el[end] !== "N" || n.q[end] !== -1 || n.adj[end].length !== 1 || n.ord(mid, end) !== 2) return undefined;
  const x = n.adj[i].find((j) => j !== mid)!;
  return n.ord(i, x) === 1 ? x : undefined;
}
// The three N of an azido group on S or P (sulfonyl azides, phosphorazidates), by the atom it hangs on.
function azideAtoms(n: Namer, i: number): number[] {
  const mid = n.adj[i].find((j) => n.q[j] === 1)!;
  return [i, mid, n.adj[mid].find((j) => j !== i)!];
}
// S with =O and two other single bonds that namer.ts does not perceive: sulfinic acids, sulfonate and sulfinate esters,
// sulfonamides and sulfinamides, sulfinyl halides, sulfonic anhydrides, sulfonyl groups on a ring N (on a carbon:
// 1-(methanesulfonyl)piperidine; without one, the ring N bears the suffix: piperidine-1-sulfonic acid), and without
// carbon, sulfuric and sulfurous acid derivatives (dimethyl sulfate, sulfamic acid). Role "S" in n.het.
function perceiveSulfur(n: Namer) {
  for (let s = 0; s < n.n; s++) {
    if (n.el[s] !== "S" || n.inRing[s] || n.q[s] || n.h[s]) continue;
    const os = oxo(n, s), rest = n.adj[s].filter((j) => !os.includes(j));
    if (!os.length || os.length > 2 || rest.length !== 2) continue;
    const cs = rest.filter((j) => n.el[j] === "C"), lig = rest.filter((j) => n.el[j] !== "C"), types = lig.map((j) => ligand(n, s, j));
    if (cs.length === 2 || cs.some((j) => !plainC(n, j)) || types.some((t) => !t || (t === "SR" && cs.length !== 1)) || (n.cip[s] && !(os.length === 1 && cs.length))) continue;
    if (cs.length === 1 && os.length === 2 && (types[0] === "OH" || types[0] === "X")) continue; // sulfonic acids, sulfonyl halides: namer.ts
    // The atom the group hangs on: its carbon, or a ring N that takes the suffix.
    const ring = lig.filter((_, k) => types[k] === "Nring");
    const on = cs.length ? cs : ring.length === 1 && types.length === 2 ? ring : [];
    const t = on.length && !cs.length ? types[1 - types.indexOf("Nring")] : on.length ? types[0] : undefined;
    n.het.set(s, "S");
    n.sulfur.add(s);
    for (const o of os) n.sulfur.add(o);
    lig.forEach((j, k) => {
      if (types[k] === "OH" || types[k] === "X") n.sulfur.add(j);
      else if (types[k] === "OR" || types[k] === "N" || types[k] === "bridge" || types[k] === "SR") n.het.set(j, `S${types[k]}`);
      if (types[k] === "N3") for (const a of azideAtoms(n, j)) n.het.set(a, "SN3");
      if (types[k] === "N") for (const y of n.adj[j]) if (y !== s && n.el[y] === "N" && !n.het.has(y)) claimNN(n, y);
    });
    if (!on.length || (t === "Nring" && cs.length)) continue; // sulfuric acid derivatives; a sulfonyl on a ring N
    const kind = t === "OH" ? "sulfonic" : t === "X" || t === "N3" ? "sulfonylhalide" : t === "OR" || t === "SR" ? "sulfonate" : t === "N" ? "sulfonamide" : t === "bridge" ? "anhydride" : undefined;
    if (kind) n.mark(s, kind as never, on);
  }
}
// An N on a sulfonamide or phosphoramide N (nitroso, amino or imine N), with its =O: claimed so that it is named from
// the amide N (N-nitroso, N-amino, N-[(propan-2-ylidene)amino]).
function claimNN(n: Namer, y: number) {
  const o = n.adj[y].find((k) => n.el[k] === "O" && n.ord(y, k) === 2);
  n.het.set(y, o === undefined ? "NN'" : "N=O");
  if (o !== undefined) n.het.set(o, "N=O");
}
// R or S at the S of a suffix (sulfinamide, sulfinate ester, sulfinic acid), cited without a locant:
// (R)-2-methylpropane-2-sulfinamide, methyl (R)-4-methylbenzene-1-sulfinate. Only as the parent's one descriptor.
export function suffixStereo(n: Namer, sites: { atom: number; group: number }[], others: number): { at: number; text: string }[] {
  const s = sites.filter((x) => n.el[x.group] === "S" && (n.cip[x.group] === "R" || n.cip[x.group] === "S"));
  // A sulfinic acid's S is not a stereocentre to OPSIN (nor to InChI, which moves the H): not cited.
  if (s.length && (others || s.length > 1 || s.some((x) => n.adj[x.group].some((j) => n.el[j] === "O" && n.ord(x.group, j) === 1 && n.h[j])))) throw new Error("sulfur stereo");
  return s.map((x) => ({ at: 0, text: n.cip[x.group]! }));
}
// The N of a sulfonamide group (for its N-substituents as N-prefixes).
export function sulfonamideN(n: Namer, kind: string | undefined, s: number): number | undefined {
  return kind === "sulfonamide" ? n.adj[s].find((j) => n.het.get(j) === "SN") : undefined;
}
// A sulfonate or sulfinate ester (P-65.6.3.3): the alkyl from the ester O, then the acid's name: methyl
// methanesulfonate, 4-[(methanesulfonyl)oxy]butyl methanesulfonate (busulfan).
export function sulfonateName(n: Namer): string | undefined {
  // Several sulfonate esters of one acid on one framework: butane-1,4-diyl dimethanesulfonate (busulfan).
  const all = [...n.bearer.keys()].filter((g) => n.group[g] === "sulfonate"), esterO = (g: number) => n.adj[g].find((j) => n.het.get(j) === "SOR");
  if (all.length > 1 && all.every((g) => esterO(g) !== undefined)) {
    const acids = all.map((g) => n.parentName("sulfonate" as never, new Set(), n.side(g, esterO(g)!))?.text);
    // di before an unsubstituted acid (dimethanesulfonate), bis() before a substituted one (bis(trifluoromethanesulfonate)).
    const side = [...n.side(all[0], esterO(all[0])!)], plain = side.every((a) => a === all[0] || n.el[a] === "C" || oxo(n, all[0]).includes(a));
    const poly = acids.every((a) => a && a === acids[0]) ? polyEster(n, all.map((g) => esterO(g)!), all, acids[0]!, plain) : undefined;
    if (poly) return poly;
  }
  const s = all[0];
  const o = n.adj[s].find((j) => n.het.get(j) === "SOR" || n.het.get(j) === "SSR")!, r = n.adj[o].find((j) => j !== s)!;
  const acid = n.parentName("sulfonate" as never, new Set(), n.side(s, o)), alkyl = n.substituent(r, o);
  // A thioester names the atom its alkyl is on: S-methyl methanesulfonothioate (P-65.6.3.2.3).
  return acid && `${n.el[o] === "S" ? `S-${enclose(alkyl)}` : alkyl.text} ${acid.text}`;
}
// Identical ester groups on one framework (P-65.6.3.2.2): the framework named as its polyol, with -diyl for -diol,
// then the acid's anion multiplied: butane-1,4-diyl dimethanesulfonate, propane-1,2,3-triyl trinitrate,
// ethane-1,2-diyl bis(4-methylbenzene-1-sulfonate). os[k] is the ester O of the acid centre centres[k]. Undefined when
// the polyol's name does not end in the ester groups alone (another OH, a senior group, PETN's four on two kinds).
function polyEster(n: Namer, os: number[], centres: number[], acid: string, plain: boolean): string | undefined {
  const yl = n.polyolYl(os, centres);
  return yl && `${yl} ${times(os.length, { text: acid, compound: !plain || /[\d([ -]/.test(acid) })}`;
}
// A sulfur oxoacid centre cited as a prefix, from the atom `from`: methanesulfonyl, 4-methylbenzene-1-sulfonyl,
// sulfo, sulfino, methoxysulfonyl, sulfamoyl, dimethylsulfamoyl, chlorosulfonyl, [(R)-methanesulfinyl] (P-65.3.2.3,
// P-66.1.1.4.3). Undefined for the S groups namer.ts names.
function sulfurPrefix(n: Namer, x: number, from: number): Name | undefined {
  if (!n.het.has(x) && n.group[x] !== "sulfonylhalide" && !n.cip[x]) return undefined;
  const os = oxo(n, x), others = n.adj[x].filter((j) => j !== from && !os.includes(j)), word = os.length === 2 ? "sulfonyl" : "sulfinyl";
  const stereo = (t: Name): Name => (n.cip[x] === "R" || n.cip[x] === "S" ? { text: `(${n.cip[x]})-${t.text}`, compound: true } : t);
  if (others.length !== 1) throw new Error("sulfur");
  const j = others[0];
  if (n.el[j] === "C") {
    const p = n.inRing[j] ? { atoms: n.rings[n.ringOf[j]], ring: true } : { atoms: n.bestChain(j, x), ring: false };
    return stereo({ text: n.nameParent(p, { attach: [j, x], sulfo: word }).text, compound: true });
  }
  const t = ligand(n, x, j);
  if (t === "OH") return { text: os.length === 2 ? "sulfo" : "sulfino", compound: false };
  if (t === "X") return { text: `${HALO[n.el[j]]}${word}`, compound: true };
  if (t === "N3") return { text: `azido${word}`, compound: true };
  if (t === "SR") return { text: `${enclose(n.substituent(j, x))}${word}`, compound: true };
  if (t === "OR") return { text: `${enclose(n.substituent(j, x))}${word}`.replace(/^\(([a-z-]+oxy)\)(sulf[a-z]+)$/, "$1$2"), compound: true };
  if (t === "N") {
    const subs = n.adj[j].filter((y) => y !== x).map((y) => n.substituent(y, j)), amoyl = os.length === 2 ? "sulfamoyl" : "sulfinamoyl";
    return { text: `${substituted(subs)}${amoyl}`, compound: subs.length > 0 };
  }
  if (t === "Nring") return { text: `${enclose(n.substituent(j, x))}${word}`, compound: true };
  throw new Error("sulfur");
}

// ——— Oxoacid centres of phosphorus and nitrogen, and ylides (P-67.1, P-65.6.3) ———
// P with an O, N, S or halogen ligand (phosphates, phosphonates, phosphinates, phosphites, phosphorothioates, their
// amides and halides; P bonded only to C and H is a phosphane, in namer.ts), phosphane sulfides, phosphorus ylides,
// nitrate, nitrite and hypohalite esters. Roles in n.het: "P" (and "P-" for its ligands), "PS3", "P=C", "NO3" and
// "NO2" (the N, its O atoms and the ester O), "OX". Onium cations (phosphanium, sulfanium, iodanium) are namer.ts's
// perceiveIons().
function perceiveCentres(n: Namer) {
  for (let p = 0; p < n.n; p++) {
    if (n.inRing[p] || n.cip[p] || n.het.has(p)) continue;
    if (n.el[p] === "P" && !n.q[p] && !n.h[p] && n.adj[p].length === 4) {
      // A phosphorus ylide (P-68.3.2.3.2): R3P=CR2, triphenyl-λ5-phosphanylidene.
      const dbl = n.adj[p].filter((j) => n.ord(p, j) === 2);
      if (dbl.length === 1 && n.el[dbl[0]] === "C" && n.carbonylO[dbl[0]] < 0 && n.adj[p].every((j) => n.el[j] === "C" && (j === dbl[0] || plainC(n, j)))) { n.het.set(p, "P=C"); continue; }
    }
    if (n.el[p] === "N") { nitrate(n, p); continue; }
    if (HALO[n.el[p]]) { hypohalite(n, p); continue; }
    if (n.el[p] !== "P" || n.q[p]) continue;
    const os = [...oxo(n, p), ...thioxo(n, p)], rest = n.adj[p].filter((j) => !os.includes(j));
    if (os.length > 1 || rest.some((j) => n.ord(p, j) !== 1) || os.length + rest.length + n.h[p] !== (os.length ? 4 : 3)) continue;
    const lig = rest.filter((j) => n.el[j] !== "C" || cyanide(n, j)), types = lig.map((j) => ligand(n, p, j));
    if (rest.some((j) => n.el[j] === "C" && !plainC(n, j) && !cyanide(n, j)) || types.some((t) => !t)) continue;
    if (!lig.length) { if (os.length === 1 && n.el[os[0]] === "S" && !n.h[p]) { n.het.set(p, "PS3"); n.het.set(os[0], "P-"); } continue; } // triphenylphosphane sulfide
    n.het.set(p, "P");
    for (const o of os) n.het.set(o, "P-");
    lig.forEach((j, k) => {
      if (types[k] === "N3") for (const a of azideAtoms(n, j)) n.het.set(a, "P-");
      else if (types[k] !== "Nring" && !n.het.has(j)) n.het.set(j, "P-");
      if (types[k] === "N") for (const y of n.adj[j]) if (y !== p && n.el[y] === "N" && !n.het.has(y)) claimNN(n, y);
      if (cyanide(n, j)) for (const y of n.adj[j]) if (y !== p) n.het.set(y, "P-"); // its N
    });
  }
}
// A cyano group's carbon, as a pseudohalide ligand of a P centre (P-67.1.2.4): diethyl phosphorocyanidate, tabun.
const cyanide = (n: Namer, c: number) => n.el[c] === "C" && !n.inRing[c] && !n.q[c] && n.adj[c].length === 2
  && n.adj[c].some((j) => n.el[j] === "N" && n.ord(c, j) === 3 && n.adj[j].length === 1 && !n.q[j]);
// A hypohalite ester (R-O-X: tert-butyl hypochlorite) with its halogen at x.
function hypohalite(n: Namer, x: number) {
  const o = n.adj[x][0];
  if (n.adj[x].length !== 1 || n.q[x] || n.el[o] !== "O" || n.inRing[o] || n.q[o] || n.adj[o].length !== 2 || n.het.has(o) || n.group[o] || !plainC(n, n.adj[o].find((j) => j !== x)!)) return;
  n.het.set(x, "OX"); n.het.set(o, "OX");
}
// A nitrate ester (R-O-NO2, as N+(=O)O-) or nitrite ester (R-O-N=O) with its N at x.
function nitrate(n: Namer, x: number) {
  const os = n.adj[x].filter((j) => n.el[j] === "O" && !n.inRing[j]);
  if (os.length !== n.adj[x].length || n.h[x]) return;
  const dbl = os.filter((o) => n.ord(x, o) === 2 && n.adj[o].length === 1 && !n.q[o]), minus = os.filter((o) => n.ord(x, o) === 1 && n.adj[o].length === 1 && n.q[o] === -1);
  const ester = os.filter((o) => n.ord(x, o) === 1 && !n.q[o] && n.adj[o].length === 2 && plainC(n, n.adj[o].find((j) => j !== x)!));
  const role = n.q[x] === 1 && os.length === 3 && dbl.length === 1 && minus.length === 1 && ester.length === 1 ? "NO3" : !n.q[x] && os.length === 2 && dbl.length === 1 && ester.length === 1 ? "NO2" : undefined;
  if (!role || ester.some((o) => n.het.has(o) || n.group[o])) return;
  for (const a of [x, ...os]) n.het.set(a, role);
}
// N-oxides (P-74.2.1.2): an O- on an N+ with four bonds (pyridine 1-oxide, 4-methylmorpholine 4-oxide,
// N,N-dimethylmethanamine N-oxide). Not nitro or nitrate groups.
const nOxideO = (n: Namer, o: number): boolean => {
  if (n.el[o] !== "O" || n.q[o] !== -1 || n.adj[o].length !== 1) return false;
  const x = n.adj[o][0];
  return n.el[x] === "N" && n.q[x] === 1 && n.adj[x].filter((j) => n.el[j] === "O").length === 1 && n.adj[x].reduce((t, j) => t + n.ord(x, j), 0) + n.h[x] === 4
    && (n.inRing[x] || n.adj[x].every((j) => n.ord(x, j) === 1));
};
export const nOxideN = (n: Namer, x: number) => n.el[x] === "N" && n.adj[x].some((o) => nOxideO(n, o));
// The N-oxides of a parent (ring N atoms, or the N of an amine suffix): their O atoms join `used` (no prefix). Throws
// for an N-oxide the parent cannot cite (on a substituent, or with an ester or other group named after the parent).
export function nOxides(n: Namer, atoms: number[], sites: { atom: number; group: number }[], kind: string | undefined, used: Set<number>, whole: boolean): number[] {
  const ring = atoms.filter((a) => nOxideN(n, a)), amine = kind === "amine" ? sites.map((s) => s.group).filter((g) => nOxideN(n, g)) : [];
  if (!ring.length && !amine.length) return [];
  if (!whole || (kind && !["acid", "sulfonic", "ester", "amide", "sulfonamide", "nitrile", "aldehyde", "ketone", "alcohol", "thiol", "amine"].includes(kind)) || (ring.length && amine.length) || amine.length > 1) throw new Error("oxide");
  for (const x of [...ring, ...amine]) for (const o of n.adj[x]) if (nOxideO(n, o)) used.add(o);
  return [...ring, ...amine];
}
// The text after the name for its N-oxides: " 1-oxide", " 1,4-dioxide", " N-oxide" (P-74.2.1.2).
export function oxideText(n: Namer, oxides: number[], label: (a: number) => string): string {
  if (!oxides.length) return "";
  if (!n.inRing[oxides[0]]) return " N-oxide";
  return ` ${oxides.map(label).sort((a, b) => parseInt(a) - parseInt(b)).join(",")}-${oxides.length > 1 ? MULT[oxides.length] : ""}oxide`;
}
// Charged atoms Octet names here: azido groups on S or P, the N+ and O- of nitrate esters and N-oxides.
export function heteroCharged(n: Namer, i: number): boolean {
  const { el, q, adj } = n;
  if (azoxy(n, i)) return true; // R-N(+)(O-)=N-R (namer-maingroup.ts)
  if (el[i] === "N" && q[i]) { // an azido group on S or P: sulfonyl azides, phosphorazidates
    const mid = q[i] === 1 ? i : adj[i][0], first = adj[mid]?.find((j) => j !== i && !q[j]) ?? (q[i] === 1 ? adj[i].find((j) => !q[j]) : undefined);
    const on = first === undefined ? undefined : azideN(n, first);
    if (on !== undefined && (el[on] === "S" || el[on] === "P")) return true;
  }
  if (nOxideO(n, i) || (el[i] === "N" && q[i] === 1 && adj[i].some((o) => nOxideO(n, o)))) return true;
  if (el[i] === "P" && q[i] === 1) return !n.inRing[i] && adj[i].length + n.h[i] === 4 && adj[i].every((j) => el[j] === "C" && n.ord(i, j) === 1);
  const x = el[i] === "N" ? i : el[i] === "O" && q[i] === -1 && adj[i].length === 1 ? adj[i][0] : -1;
  if (x < 0 || el[x] !== "N" || q[x] !== 1 || n.inRing[x] || adj[x].length !== 3 || !adj[x].every((j) => el[j] === "O")) return false;
  const os = adj[x];
  return os.filter((o) => q[o] === -1 && adj[o].length === 1).length === 1 && os.filter((o) => n.ord(x, o) === 2 && !q[o]).length === 1
    && os.some((o) => !q[o] && n.ord(x, o) === 1 && adj[o].length === 2);
}
type Centre = { at: number; os: number[]; cs: number[]; lig: number[]; types: string[] };
const centreOf = (n: Namer, x: number): Centre => {
  const os = n.el[x] === "P" ? [...oxo(n, x), ...thioxo(n, x)] : oxo(n, x), rest = n.adj[x].filter((j) => !os.includes(j));
  const cn = (j: number) => n.el[x] === "P" && cyanide(n, j), lig = rest.filter((j) => n.el[j] !== "C" || cn(j));
  return { at: x, os, cs: rest.filter((j) => n.el[j] === "C" && !cn(j)), lig, types: lig.map((j) => ligand(n, x, j) ?? "?") };
};
// The class a centre ranks by (P-41): a cation, an acid (an OH left), an ester, an acid halide or an amide; undefined
// when it cannot be the parent (anhydrides, ring N).
function centreClass(n: Namer, x: number): string | undefined {
  const role = n.het.get(x);
  if (role === "NO3" || role === "NO2" || role === "OX") return "ester";
  const c = centreOf(n, x);
  if (c.types.includes("bridge")) { const chain = phosphateChain(n, x); return !chain ? undefined : chain.oh ? "acid" : "ester"; }
  if (c.types.some((t) => t === "Nring" || t === "?")) return undefined;
  if (c.types.includes("SR") || c.os.some((o) => n.el[o] === "S")) return c.types.every((t) => t === "OR" || t === "SR") ? "ester" : undefined;
  return c.types.includes("OH") ? "acid" : c.types.includes("OR") ? "ester" : c.types.includes("X") || c.types.includes("N3") ? "halide" : c.types.includes("N") ? "amide" : undefined;
}
// The last kind of characteristic group (SENIORITY) each class of centre is junior to.
const OUTRANKED_BY: Record<string, string> = { acid: "tellurinic", ester: "sulfonate", halide: "sulfonylhalide", amide: "sulfonamide" };
const HALIDE_STEM: Record<string, string> = { F: "fluorid", Cl: "chlorid", Br: "bromid", I: "iodid", C: "cyanid" };
// The ester groups' names (from each OR ligand) and the hydrogen of the OH left: "dimethyl", "methyl dihydrogen".
function esterPart(n: Namer, c: Centre): string {
  const ors = c.lig.filter((_, k) => c.types[k] === "OR"), oh = c.types.filter((t) => t === "OH").length;
  const names = ors.map((o) => n.substituent(n.adj[o].find((j) => j !== c.at)!, o));
  return `${alkylWords(names)} ${oh ? `${MULT[oh]}hydrogen ` : ""}`;
}
// The one halogen of a centre's halide ligands, or throws for mixed halides.
function halideOf(n: Namer, c: Centre): string {
  const els = new Set(c.lig.filter((_, k) => c.types[k] === "X").map((j) => n.el[j]));
  if (els.size !== 1) throw new Error("mixed halides");
  return [...els][0];
}
// N-substituents of amide ligands, with locants N, N', N'' (the N with more substituents first).
function amideSubs(n: Namer, c: Centre): { loc: string; name: Name }[] {
  const ns = c.lig.filter((_, k) => c.types[k] === "N").map((j) => ({ j, subs: n.adj[j].filter((y) => y !== c.at).map((y) => n.substituent(y, j)) }));
  ns.sort((a, b) => b.subs.length - a.subs.length || a.subs.map((x) => x.text).join().localeCompare(b.subs.map((x) => x.text).join()));
  return ns.flatMap((a, k) => a.subs.map((name) => ({ loc: `N${"'".repeat(k)}`, name })));
}
// A phosphorus oxoacid centre as the parent (P-67.1): methylphosphonic acid, trimethyl phosphate, methyl dihydrogen
// phosphate, diethyl (2-oxopropyl)phosphonate, phosphoryl trichloride, diethyl phosphorochloridate,
// N,N,N',N',N'',N''-hexamethylphosphoric triamide, diethyl N-phenylphosphoramidate, trimethyl phosphite.
function phosphorusName(n: Namer, c: Centre): string {
  const nR = c.cs.length + n.h[c.at], five = c.os.length === 1, rs = c.cs.map((j) => n.substituent(j, c.at));
  if (nR > 2) throw new Error("phosphorus");
  const base = ["phosphor", "phosphon", "phosphin"][nR], count = (t: string) => c.types.filter((x) => x === t).length;
  if (count("SR") || c.os.some((o) => n.el[o] === "S")) return thiophosphateName(n, c, base, substituted(rs));
  const o = count("OH") + count("OR"), x = count("X"), nn = count("N");
  if (count("N3")) {
    // Phosphorazidates (diphenyl phosphorazidate): the azide in the acid's name, like a halide.
    if (x || nn || count("N3") > 1 || !five) throw new Error("phosphorus");
    const stem = `${base}${nR ? "o" : ""}azid`;
    return count("OR") ? `${esterPart(n, c)}${substituted(rs)}${stem}ate` : `${substituted(rs)}${stem}ic acid`;
  }
  if (x && !o && !nn) {
    const hal = halideOf(n, c), word = { F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide", C: "cyanide" }[hal]!;
    if (!five) return `${substituted([...c.lig.map((j) => ({ text: HALO[n.el[j]] ?? "cyano", compound: false })), ...rs])}phosphane`; // trichlorophosphane
    return nR ? `${substituted(rs)}${base}ic ${MULT[x]}${word}` : `phosphoryl ${MULT[x]}${word}`;
  }
  if (nn === 1 && x === 1 && five && nR === 0 && o === count("OR")) {
    // An amide and a halide on P (P-67.1.2.4): ethyl N,N-dimethylphosphoramidocyanidate (tabun), methyl
    // phosphoramidochloridate.
    const stem = `phosphoramido${HALIDE_STEM[halideOf(n, c)]}`, list = amideSubs(n, c);
    return o ? `${esterPart(n, c)}${letterPrefixes(list)}${stem}ate` : `${letterPrefixes(list)}${stem}ic acid`;
  }
  if (nn && !x) {
    const list = [...rs.map((name) => ({ loc: "P", name })), ...amideSubs(n, c)];
    if (!o) return `${letterPrefixes(list)}${base}${five ? "ic" : "ous"} ${MULT[nn]}amide`;
    if (!five || nR > 1) throw new Error("phosphorus");
    const stem = `${base}${nR ? "" : "o"}${nn > 1 ? `${MULT[nn]}amid` : "amid"}`.replace(/^phosphoroamid/, "phosphoramid");
    return count("OR") ? `${esterPart(n, c)}${letterPrefixes(list)}${stem}ate` : `${letterPrefixes(list)}${stem}ic acid`;
  }
  if (nn) throw new Error("phosphorus");
  const r = substituted(rs);
  if (x) {
    if (!five) throw new Error("phosphorus");
    const stem = `${base}o${x > 1 ? MULT[x] : ""}${HALIDE_STEM[halideOf(n, c)]}`;
    return count("OR") ? `${esterPart(n, c)}${r}${stem}ate` : `${r}${stem}ic acid`;
  }
  return count("OR") ? `${esterPart(n, c)}${r}${base.replace(/or$/, "")}${five ? "ate" : "ite"}` : `${r}${base}${five ? "ic" : "ous"} acid`;
}
// A chain of P(V)=O linked by O (diphosphoric acid, triphosphoric acid) through x, each P with only OH, OR and the
// links: its P atoms in order and its OH count. Undefined for other P-O-P groups.
function phosphateChain(n: Namer, x: number): { ps: number[]; oh: number } | undefined {
  const ok = (p: number) => n.het.get(p) === "P" && oxo(n, p).length === 1 && !n.h[p] && centreOf(n, p).cs.length === 0 && centreOf(n, p).types.every((t) => t === "OH" || t === "OR" || t === "bridge");
  const next = (p: number, not: number) => centreOf(n, p).lig.filter((o) => ligand(n, p, o) === "bridge").map((o) => n.adj[o].find((j) => j !== p)!).filter((q) => q !== not);
  if (!ok(x)) return undefined;
  let end = x, prev = -1;
  for (let steps = 0; steps < 8; steps++) { const q = next(end, prev); if (!q.length) break; if (q.length > 1) return undefined; prev = end; end = q[0]; }
  if (!ok(end)) return undefined; // isohypophosphoric acid: a P with H
  const ps = [end];
  for (let q = next(end, -1); q.length && ps.length < 8; q = next(ps[ps.length - 1], ps[ps.length - 2] ?? -1)) { if (q.length > 1 || !ok(q[0])) return undefined; ps.push(q[0]); }
  if (ps.length < 2) return undefined;
  return { ps, oh: ps.reduce((t, p) => t + centreOf(n, p).types.filter((t2) => t2 === "OH").length, 0) };
}
// Diphosphoric and triphosphoric acids and their esters (P-67.1.3.1): diphosphoric acid, tetraethyl diphosphate,
// 3-methylbut-3-en-1-yl trihydrogen diphosphate, a nucleoside's tetrahydrogen triphosphate. One ester group (on an
// end of the chain), or all.
function phosphateChainName(n: Namer, chain: { ps: number[]; oh: number }): string {
  const k = chain.ps.length, ors = chain.ps.flatMap((p) => centreOf(n, p).lig.filter((o) => ligand(n, p, o) === "OR").map((o) => ({ p, o })));
  if (!ors.length) return `${MULT[k]}phosphoric acid`;
  if (ors.length > 1 && chain.oh) throw new Error("phosphate esters");
  if (ors.length === 1 && chain.oh && ors[0].p !== chain.ps[0] && ors[0].p !== chain.ps[k - 1]) throw new Error("phosphate esters");
  const names = ors.map(({ p, o }) => n.substituent(n.adj[o].find((j) => j !== p)!, o));
  return `${alkylWords(names)} ${chain.oh ? `${MULT[chain.oh]}hydrogen ` : ""}${MULT[k]}phosphate`;
}
// Esters of phosphorothioic acids (P-67.1.3.2): O,O-diethyl O-(4-nitrophenyl) phosphorothioate, O,O,S-trimethyl
// phosphorodithioate, O,O-diethyl methylphosphonothioate. Each ester group has the locant of its O or S.
function thiophosphateName(n: Namer, c: Centre, base: string, r: string): string {
  const groups = new Map<string, { name: Name; locs: string[] }>();
  c.lig.forEach((j, k) => {
    const name = n.substituent(n.adj[j].find((y) => y !== c.at)!, j), g = groups.get(name.text) ?? { name, locs: [] };
    g.locs.push(c.types[k] === "SR" ? "S" : "O");
    groups.set(name.text, g);
  });
  const ss = c.types.filter((t) => t === "SR").length + c.os.filter((o) => n.el[o] === "S").length;
  const esters = [...groups.values()].sort((a, b) => alphaKey(a.name.text).localeCompare(alphaKey(b.name.text))).map((g) => {
    const m = g.locs.length, word = m > 1 ? (g.name.compound ? `${MULT_COMPLEX[m]}${enclose(g.name)}` : MULT[m] + g.name.text) : enclose(g.name);
    return `${g.locs.sort().join(",")}-${word}`;
  }).join(" ");
  return `${esters} ${r}${base}o${ss > 1 ? MULT[ss] : ""}thioate`;
}
// A sulfuric or sulfurous acid derivative with no carbon on S as the parent (P-67.1.2): dimethyl sulfate, ethyl
// hydrogen sulfate, phenylsulfamic acid, methyl sulfamate, N,N'-dimethylsulfuric diamide, dimethylsulfamoyl chloride,
// methyl sulfurochloridate, dimethyl sulfite, sulfurous dichloride.
function sulfuricName(n: Namer, c: Centre): string {
  const six = c.os.length === 2, count = (t: string) => c.types.filter((x) => x === t).length;
  const o = count("OH") + count("OR"), x = count("X"), nn = count("N");
  const word = (hal: string) => ({ F: "fluoride", Cl: "chloride", Br: "bromide", I: "iodide" })[hal]!;
  if (x === 2) return `${six ? "sulfuryl" : "sulfurous"} di${word(halideOf(n, c))}`;
  if (!six) {
    if (o === 2) return count("OR") ? `${esterPart(n, c)}sulfite`.replace(/ $/, "") : "sulfurous acid";
    if (nn === 2) return `${letterPrefixes(amideSubs(n, c))}sulfurous diamide`;
    throw new Error("sulfur");
  }
  if (nn === 2) return `${letterPrefixes(amideSubs(n, c))}sulfuric diamide`;
  if (nn === 1) {
    const subs = substituted(amideSubs(n, c).map((a) => a.name));
    if (x) return `${subs}sulfamoyl ${word(halideOf(n, c))}`;
    return count("OR") ? `${esterPart(n, c)}${subs}sulfamate` : `${subs}sulfamic acid`;
  }
  if (x) return count("OR") ? `${esterPart(n, c)}sulfuro${HALIDE_STEM[halideOf(n, c)]}ate` : `sulfuro${HALIDE_STEM[halideOf(n, c)]}ic acid`;
  return count("OR") ? `${esterPart(n, c)}sulfate`.replace(/ $/, "") : "sulfuric acid";
}
// A sulfonic anhydride (P-65.7.7): trifluoromethanesulfonic anhydride, 4-methylbenzenesulfonic methanesulfonic
// anhydride. Each acid is named with its S taken as a sulfonic acid.
function sulfonicAnhydrideName(n: Namer): string | undefined {
  const ss = [...n.bearer.keys()].filter((g) => n.group[g] === "anhydride");
  if (ss.length !== 2 || ss.some((g) => n.el[g] !== "S")) return undefined;
  const o = n.adj[ss[0]].find((j) => n.het.get(j) === "Sbridge" && n.adj[j].includes(ss[1]));
  if (o === undefined) throw new Error("anhydride");
  const acids = ss.map((g) => {
    n.group[g] = "sulfonic";
    try { return n.parentName("sulfonic", new Set(), n.side(g, o))?.text.replace(/ acid$/, ""); } finally { n.group[g] = "anhydride"; }
  });
  if (acids.some((a) => !a)) throw new Error("anhydride");
  return acids[0] === acids[1] ? `${acids[0]} anhydride` : `${acids.sort((a, b) => alphaKey(a!).localeCompare(alphaKey(b!))).join(" ")} anhydride`;
}
// A centre (S, P or N) that outranks the molecule's senior characteristic group, named as the parent.
function centreName(n: Namer, kind: string | undefined): string | undefined {
  const centres = [...n.het].filter(([x, r]) => (r === "S" && !n.group[x]) || r === "P" || ((r === "NO3" || r === "NO2") && n.el[x] === "N") || (r === "OX" && n.el[x] !== "O")).map(([x]) => x);
  const order = ["acid", "ester", "halide", "amide"];
  const ranked = centres.map((x) => ({ x, cls: centreClass(n, x) })).filter((c) => c.cls).sort((a, b) => order.indexOf(a.cls!) - order.indexOf(b.cls!));
  const best = ranked[0];
  if (!best) return undefined;
  if (kind && SENIORITY.indexOf(kind as never) <= SENIORITY.indexOf(OUTRANKED_BY[best.cls!] as never)) return undefined;
  if (kind === "aminium") return undefined;
  const x = best.x, role = n.het.get(x);
  if (role === "OX") { const o = n.adj[x][0]; return `${n.substituent(n.adj[o].find((j) => j !== x)!, o).text} hypo${{ F: "fluor", Cl: "chlor", Br: "brom", I: "iod" }[n.el[x]]}ite`; }
  if (n.el[x] === "P" && centreOf(n, x).types.includes("bridge")) return phosphateChainName(n, phosphateChain(n, x)!);
  if (role === "NO3" || role === "NO2") {
    // Several on one framework: propane-1,2,3-triyl trinitrate.
    const ns = [...n.het].filter(([y, r]) => r === role && n.el[y] === "N").map(([y]) => y), esterO = (y: number) => n.adj[y].find((j) => n.adj[j].length === 2)!;
    const poly = ns.length > 1 ? polyEster(n, ns.map(esterO), ns, role === "NO3" ? "nitrate" : "nitrite", true) : undefined;
    if (poly) return poly;
    const o = n.adj[x].find((j) => n.adj[j].length === 2)!;
    return `${n.substituent(n.adj[o].find((j) => j !== x)!, o).text} ${role === "NO3" ? "nitrate" : "nitrite"}`;
  }
  const c = centreOf(n, x);
  // A centre this namer cannot name as the parent (a phosphoramidite) is cited as a prefix of a carbon parent instead.
  try { return n.el[x] === "P" ? phosphorusName(n, c) : sulfuricName(n, c); } catch { return undefined; }
}
// A phosphorus centre cited as a prefix: phosphono, (dimethoxyphosphoryl), [hydroxy(methyl)phosphoryl],
// (diethoxyphosphanyl) (P-67.1.4); a nitrate or nitrite N: nitro, nitroso (in nitrooxy, nitrosooxy).
function centrePrefix(n: Namer, x: number, from: number): Name | undefined {
  const role = n.het.get(x);
  if (role === "NO3" || role === "NO2") return n.el[x] === "N" ? { text: role === "NO3" ? "nitro" : "nitroso", compound: false } : undefined;
  if (role === "P=C") {
    // On the ylide carbon's parent: (triphenyl-λ5-phosphanylidene); from one of its other carbons, the ylide as a
    // phosphanyl group: [methylidene(diphenyl)-λ5-phosphanyl].
    const subs = n.adj[x].filter((j) => j !== from).map((j) => (n.ord(x, j) === 2 ? ylidene(n, j, x) : n.substituent(j, x)));
    return { text: `${substituted(subs)}-λ5-phosphanyl${n.ord(x, from) === 2 ? "idene" : ""}`, compound: true };
  }
  if (role !== "P" && role !== "PS3") return undefined;
  if (n.h[x]) throw new Error("phosphorus");
  const os = [...oxo(n, x), ...thioxo(n, x)], subs = n.adj[x].filter((j) => j !== from && !os.includes(j)).map((j) => n.substituent(j, x));
  const word = !os.length ? "phosphanyl" : n.el[os[0]] === "S" ? "phosphorothioyl" : "phosphoryl";
  if (word === "phosphoryl" && subs.length === 2 && subs.every((s) => s.text === "hydroxy")) return { text: "phosphono", compound: false };
  return { text: `${substituted(subs)}${word}`, compound: true };
}

// ——— Prefixes ———
// Prefixes for hetero-hetero groups: disulfanyl, peroxy, hydrazinyl, hydrazinylidene, diazenyl, nitroso. Undefined for
// other atoms.
export function heteroPrefix(n: Namer, x: number, from: number): Name | undefined {
  const role = n.het.get(x), el = n.el[x];
  if (el === "C" && n.el[from] === "N" && n.ord(x, from) === 2 && n.carbonylO[x] < 0) return ylidene(n, x, from); // N-(phenylmethylidene)
  if (el === "S" && n.sulfur.has(x) && oxo(n, x).length) return sulfurPrefix(n, x, from);
  if (el === "P" || (el === "N" && role?.startsWith("NO"))) { const c = centrePrefix(n, x, from); if (c) return c; }
  // Peroxy (also an ester's or an acid's -O-O-): hydroperoxy, (methylperoxy), tert-butylperoxy.
  const o = el === "O" && !n.inRing[x] ? n.adj[x].find((j) => j !== from && n.el[j] === "O" && !n.inRing[j]) : undefined;
  if (o !== undefined) {
    const r = n.adj[o].find((j) => j !== x);
    if (r === undefined) return { text: "hydroperoxy", compound: false };
    const s = n.substituent(r, o);
    return { text: `${s.text === "tert-butyl" ? s.text : enclose(s)}peroxy`, compound: true };
  }
  // An imine N cited from its single bond (P-62.3.1.2): (propan-2-ylideneamino), {[(E)-phenylmethylidene]amino}.
  if (el === "N" && (!role || role === "NN'") && !n.inRing[x] && !n.q[x] && !n.h[x] && n.adj[x].length === 2 && n.ord(x, from) === 1) {
    const c = n.adj[x].find((j) => j !== from)!;
    if (n.el[c] === "C" && n.ord(x, c) === 2 && n.carbonylO[c] < 0) return { text: `${enclose(ylidene(n, c, x))}amino`, compound: true };
  }
  if (!role) return undefined;
  if (role === "N3" && el === "N") return triazenyl(n, x);
  if (role === "I3" && el === "I") {
    const dbl = oxo(n, x);
    if (dbl.length) return { text: dbl.length === 1 ? "iodosyl" : "iodyl", compound: false };
    return { text: `${substituted(n.adj[x].filter((j) => j !== from).map((j) => n.substituent(j, x)))}-λ3-iodanyl`, compound: true };
  }
  if (role === "SS") {
    // -S-S-R: disulfanyl, methyldisulfanyl, (2-aminoethyl)disulfanyl; trisulfanyl for -S-S-S-.
    let k = 1, at = x, prev = from;
    for (;;) {
      const next = n.adj[at].find((j) => j !== prev && n.el[j] === "S");
      if (next === undefined) break;
      prev = at; at = next; k++;
    }
    const r = n.adj[at].find((j) => j !== prev);
    const word = `${MULT[k]}sulfanyl`;
    return r === undefined ? { text: word, compound: false } : { text: `${enclose(n.substituent(r, at))}${word}`, compound: true };
  }
  if (role === "N=O") return el === "N" ? { text: "nitroso", compound: false } : undefined;
  if (role === "azoxy" && el === "N") return azoxyPrefix(n, x); // (2-methyl-2-oxidodiazen-2-ium-1-yl) (namer-maingroup.ts)
  if (role === "N=N") {
    const m = n.adj[x].find((j) => n.het.get(j) === "N=N")!, r = n.adj[m].find((j) => j !== x);
    const ez = n.cipBond.get(n.key(x, m));
    const text = r === undefined ? "diazenyl" : `${enclose(n.substituent(r, m))}diazenyl`;
    return ez === "E" || ez === "Z" ? { text: `(${ez})-${text}`, compound: true } : { text, compound: r !== undefined };
  }
  if (role === "NN") return hydrazinyl(n, x, from, n.adj[x].find((j) => n.het.get(j) === "NN")!, "yl");
  if (role === "hz") {
    const m = n.adj[x].find((j) => n.het.get(j) === "hz")!;
    if (n.ord(x, from) === 2) { // =N-NR2 on a parent carbon, with E or Z on that bond: [(E)-2-phenylhydrazinylidene]
      const t = hydrazinyl(n, x, from, m, "ylidene"), ez = n.cipBond.get(n.key(x, from));
      return ez === "E" || ez === "Z" ? { text: `(${ez})-${t.text}`, compound: true } : t;
    }
    return hydrazinyl(n, x, from, m, "yl"); // -NR-N=CR2
  }
  return undefined;
}
// A hydrazine group with its free valence at x (locant 1) and its other N, m (locant 2): hydrazinyl,
// 2-phenylhydrazinyl, 1-methylhydrazinyl, 2-(propan-2-ylidene)hydrazinyl, (2-phenylhydrazinylidene).
export function hydrazinyl(n: Namer, x: number, from: number, m: number, end: string): Name {
  const list = [
    ...n.adj[x].filter((j) => j !== from && j !== m).map((j) => ({ loc: "1", name: hydrazineSub(n, j, x) })),
    ...n.adj[m].filter((j) => j !== x).map((j) => ({ loc: "2", name: hydrazineSub(n, j, m) })),
  ];
  return { text: `${assemblePrefixes(list, false)}hydrazin${end}`, compound: list.length > 0 };
}
// A triazene, N1=N2-N3: its N atoms in order from x (an end) and the stereodescriptor of its N=N.
function triazene(n: Namer, x: number): { ns: number[]; ez: string } {
  const m = n.adj[x].find((j) => n.het.get(j) === "N3")!, y = n.adj[m].find((j) => j !== x)!;
  const ns = n.ord(x, m) === 2 ? [x, m, y] : [y, m, x], ez = n.cipBond.get(n.key(ns[0], ns[1]));
  return { ns, ez: ez === "E" || ez === "Z" ? `(1${ez})-` : "" };
}
// A triazenyl prefix from its N1 end: (3,3-dimethyltriaz-1-en-1-yl), [(1E)-3,3-dimethyltriaz-1-en-1-yl].
function triazenyl(n: Namer, x: number): Name {
  const { ns, ez } = triazene(n, x);
  if (ns[0] !== x) throw new Error("triazene");
  const list = n.adj[ns[2]].filter((j) => j !== ns[1]).map((j) => ({ loc: "3", name: n.substituent(j, ns[2]) }));
  return { text: `${ez}${assemblePrefixes(list, false)}triaz-1-en-1-yl`, compound: true };
}
// A triazene as the parent: (1E)-3,3-dimethyl-1-phenyltriaz-1-ene.
function triazeneName(n: Namer, x: number): string {
  const { ns, ez } = triazene(n, x);
  const list = [...n.adj[ns[0]].filter((j) => j !== ns[1]).map((j) => ({ loc: "1", name: n.substituent(j, ns[0]) })), ...n.adj[ns[2]].filter((j) => j !== ns[1]).map((j) => ({ loc: "3", name: n.substituent(j, ns[2]) }))];
  return `${ez}${assemblePrefixes(list, false)}triaz-1-ene`;
}
// A substituent on a hydrazine N: a carbon, or the ylidene of a hydrazone.
function hydrazineSub(n: Namer, j: number, on: number): Name {
  return n.ord(j, on) === 2 ? ylidene(n, j, on) : n.substituent(j, on);
}
// A carbon double-bonded to `from` (an N or P) as a substituent: propan-2-ylidene, cyclohexylidene, phenylmethylidene
// (P-29.2). E or Z on the double bond to `from` is cited in front: (E)-(5-nitrofuran-2-yl)methylidene. On a carbon
// parent, nameParent() cites it instead.
export function ylidene(n: Namer, c: number, from: number): Name {
  const named = n.ylidene(c, from), ez = n.cipBond.get(n.key(c, from));
  return ez === "E" || ez === "Z" ? { text: `(${ez})-${named.text}`, compound: true } : named;
}

// ——— Parents ———
// Hydrazine, diazene and hydroxylamine as the parent when nothing is cited as a suffix (P-68.3.1): phenylhydrazine,
// 1,1-dimethylhydrazine, (propan-2-ylidene)hydrazine, (E)-diphenyldiazene, N,O-dimethylhydroxylamine. One such group
// only; else undefined, and a carbon parent cites them as prefixes.
export function heteroParentName(n: Namer, kind: string | undefined): string | undefined {
  if (kind === "anhydride") return sulfonicAnhydrideName(n);
  if (kind === "sulfonylhalide") {
    // A sulfonyl azide (4-methylbenzene-1-sulfonyl azide): the acid halide's name with azide.
    const s = [...n.bearer.keys()].find((g) => n.group[g] === "sulfonylhalide" && n.adj[g].some((j) => n.het.get(j) === "SN3"));
    if (s !== undefined) { const t = n.parentName("sulfonylhalide", new Set())?.text; return t && `${t} azide`; }
  }
  const centre = centreName(n, kind);
  if (centre || kind) return centre;
  const roles = [...n.het.values()];
  if (roles.includes("azoxy")) return azoxyName(n); // 1,2-diphenyldiazene 1-oxide (namer-maingroup.ts)
  const ylides = [...n.het].filter(([, r]) => r === "P=C").map(([x]) => x), sulfides = [...n.het].filter(([, r]) => r === "PS3").map(([x]) => x);
  if (sulfides.length === 1 && !ylides.length) { const x = sulfides[0]; return `${substituted(n.adj[x].filter((j) => n.el[j] === "C").map((j) => n.substituent(j, x)))}phosphane sulfide`; }
  const triazenes = [...n.het].filter(([x, r]) => r === "N3" && n.adj[x].some((j) => n.het.get(j) === "N3" && n.ord(x, j) === 2) && n.adj[x].filter((j) => n.het.get(j) === "N3").length === 1).map(([x]) => x);
  if (triazenes.length === 1 && !ylides.length) return triazeneName(n, triazenes[0]);
  if (ylides.length === 1) { const x = ylides[0]; return `${substituted(n.adj[x].map((j) => (n.ord(x, j) === 2 ? ylidene(n, j, x) : n.substituent(j, x))))}-λ5-phosphane`; }
  const count = (r: string) => roles.filter((x) => x === r).length;
  const pair = (r: string) => { const a = [...n.het].find(([, v]) => v === r)![0]; return [a, n.adj[a].find((j) => n.het.get(j) === r)!]; };
  if (count("NN") === 2 && !count("hz") && !count("N=N")) {
    const [a, b] = pair("NN");
    return hydrazineName(n, a, b);
  }
  if (count("hz") === 2 && !count("NN") && !count("N=N")) {
    const [a, b] = pair("hz");
    return hydrazineName(n, a, b);
  }
  if (count("N=N") === 2 && !count("NN") && !count("hz")) {
    const [a, b] = pair("N=N");
    const subs = [a, b].flatMap((x) => n.adj[x].filter((j) => n.het.get(j) !== "N=N").map((j) => n.substituent(j, x)));
    const ez = n.cipBond.get(n.key(a, b));
    return `${ez === "E" || ez === "Z" ? `(${ez})-` : ""}${substituted(subs)}diazene`;
  }
  if (count("NO") === 2 && !count("NN") && !count("hz") && !count("N=N")) {
    const [a, b] = pair("NO"), [nn, o] = n.el[a] === "N" ? [a, b] : [b, a];
    const list = [...n.adj[nn].filter((j) => j !== o).map((j) => ({ loc: "N", name: n.substituent(j, nn) })), ...n.adj[o].filter((j) => j !== nn).map((j) => ({ loc: "O", name: n.substituent(j, o) }))];
    return `${letterPrefixes(list)}hydroxylamine`;
  }
  return undefined;
}
// Hydrazine with substituents on its two N (locants 1 and 2): lowest locants, then the prefix cited first
// alphabetically takes the lower; no locants with a single substituent (phenylhydrazine).
function hydrazineName(n: Namer, a: number, b: number): string {
  const subs = (x: number, y: number) => n.adj[x].filter((j) => j !== y).map((j) => hydrazineSub(n, j, x));
  const sa = subs(a, b), sb = subs(b, a);
  const list = (first: Name[], second: Name[]) => [...first.map((name) => ({ loc: "1", name })), ...second.map((name) => ({ loc: "2", name }))];
  const options = [list(sa, sb), list(sb, sa)];
  const key = (l: { loc: string; name: Name }[]) => [...l.map((x) => x.loc).sort().join(","), "|", ...l.slice().sort((x, y) => alphaKey(x.name.text).localeCompare(alphaKey(y.name.text))).map((x) => x.loc)].join("");
  options.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  const best = options[0];
  return `${assemblePrefixes(best, best.length === 1)}hydrazine`;
}
// Prefixes with letter locants (N, O): N,O-dimethyl, N,N-diethyl, O-benzyl, in alphabetical order.
function letterPrefixes(list: { loc: string; name: Name }[]): string {
  const groups = new Map<string, { name: Name; locs: string[] }>();
  for (const p of list) { const g = groups.get(p.name.text) ?? { name: p.name, locs: [] }; g.locs.push(p.loc); groups.set(p.name.text, g); }
  return [...groups.values()].sort((x, y) => alphaKey(x.name.text).localeCompare(alphaKey(y.name.text))).map((g) => {
    const m = g.locs.length, word = m > 1 ? (g.name.compound ? `${["", "", "bis", "tris"][m]}${enclose(g.name)}` : MULT[m] + g.name.text) : enclose(g.name);
    return `${g.locs.sort().join(",")}-${word}`;
  }).join("-");
}

