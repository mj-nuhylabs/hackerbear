// endo, exo, syn and anti in a name, on a von Baeyer bicycle (bicyclo[2.2.1]heptane, norbornene, bicyclo[2.2.2]octane,
// bicyclo[3.2.1]octane): "cis-5-norbornene-endo-2,3-dicarboxylic anhydride", "exo-bicyclo[2.2.1]heptan-2-ol",
// "(2-endo,3-exo)-...", "anti-bicyclo[2.2.1]hept-2-en-7-ol". OPSIN reads none of them, so Octet takes them out, has
// OPSIN read the rest with each atom's locant, and works out what they mean.
// IUPAC (P-93.5.2.4): in bicyclo[x.y.z] (x >= y > z > 0), a substituent on the x or y bridge is exo when it points
// towards the z bridge (the smallest, numbered last) and endo when it points away; one on the z bridge is syn when it
// points towards the x bridge (numbered first) and anti when it points away.
// Octet places the bicycle in a model frame in 3D, each substituent the way its word says, and its own CIP code
// (cip.ts) gives each ring atom R or S. OPSIN then reads "rel-(1S,2R,3S,4R)-..." in place of the words, so any other
// stereo the name gives stays. A syn or anti on the z bridge makes that atom r or s, which OPSIN does not read: the
// structure is then written as SMILES from OPSIN's atoms, where nothing else in the name has stereo.
import { cipLabels } from "./cip.ts";
import type { Mol } from "./render.ts";

type V = [number, number, number];
type Atoms = { atoms: [string, number, number, string][]; bonds: [number, number, number][] };
const WORD = "endo|exo|syn|anti";

// SMILES for a name with endo, exo, syn or anti. atoms: OPSIN's atoms (with locants) for a name; read: OPSIN's SMILES.
// Undefined for a name without the words, or one whose words Octet cannot place (a tricycle, a word on a bridgehead,
// a ring atom with two substituents): Octet never draws a name without the stereo it gives.
export function endoExoSmiles(name: string, atoms: (name: string) => string | undefined, read: (name: string) => string | undefined): string | undefined {
  if (name.length > 300 || !new RegExp(`\\b(?:${WORD})\\b`, "i").test(name)) return undefined;
  // Each word with its locant: as a prefix of its own ("(2-endo,3-exo)-"), after a locant ("2-exo", "7-syn"), or before
  // the locants it qualifies ("endo-2,3-dicarboxylic", where each locant is a substituted ring atom: not
  // "endo-1,7,7-trimethyl...-2-ol"). A word with no locant ("exo-", "endo,endo-") goes to the substituted ring atoms in
  // turn.
  const at = new Map<string, string>(), bare: string[] = [], before: [string, string[]][] = [];
  let s = name.replace(new RegExp(`^\\(((?:\\d+-?(?:${WORD}),?)+)\\)-`, "i"), (_, list: string) => {
    for (const [, l, w] of list.matchAll(new RegExp(`(\\d+)-?(${WORD})`, "gi"))) at.set(l, w.toLowerCase());
    return "";
  });
  s = s.replace(new RegExp(`(\\d+)-?(${WORD})\\b`, "gi"), (_, l: string, w: string) => { at.set(l, w.toLowerCase()); return l; });
  s = s.replace(new RegExp(`\\b(${WORD})-(\\d+(?:,\\d+)*)-`, "gi"), (_, w: string, ls: string) => { before.push([w.toLowerCase(), ls.split(",")]); return `${ls}-`; });
  s = s.replace(new RegExp(`\\b((?:${WORD})(?:,(?:${WORD}))*)-`, "gi"), (_, ws: string) => { bare.push(...ws.toLowerCase().split(",")); return ""; });
  // "cis-" says again what endo/exo says.
  s = s.replace(/^(?:cis|trans)-/i, "").replace(/\(\s*\)-?/g, "").replace(/-{2,}/g, "-").replace(/^-/, "");
  // A stereo list the name gives already ("(1R)-..."): Octet's labels are matched to it.
  const given = /^\(((?:\d+[RS],?)+)\)-/.exec(s);
  if (given) s = s.slice(given[0].length);
  // "2-endo,3-exo-bicyclo..." leaves "2,3-bicyclo...", which reads without its locants; "2-endo,3-exo-dibromo..." keeps them.
  if (!atoms(s) && /^\d+(?:,\d+)*-/.test(s)) s = s.replace(/^\d+(?:,\d+)*-/, "");
  const json = atoms(s);
  if (!json) return undefined;
  const g = JSON.parse(json) as Atoms, nb = g.atoms.map(() => [] as number[]);
  for (const [a, b] of g.bonds) { nb[a].push(b); nb[b].push(a); }
  // The bicycle: atom 1 and the atoms with whole-number locants joined to it, n atoms with n + 1 bonds among them, two
  // of them (the bridgeheads) in three each.
  const num = (i: number) => /^\d+$/.test(g.atoms[i][3]) && g.atoms[i][0] !== "H";
  const one = g.atoms.findIndex((a, i) => a[3] === "1" && num(i));
  if (one < 0) return undefined;
  const ring = new Set([one]);
  for (const todo = [one]; todo.length; ) for (const j of nb[todo.pop()!]) if (num(j) && !ring.has(j)) { ring.add(j); todo.push(j); }
  const inRing = (i: number) => ring.has(i), loc = (i: number) => Number(g.atoms[i][3]);
  const heads = [...ring].filter((i) => nb[i].filter(inRing).length === 3);
  if (heads.length !== 2 || !heads.includes(one) || g.bonds.filter(([a, b]) => inRing(a) && inRing(b)).length !== ring.size + 1) return undefined;
  const other = heads.find((h) => h !== one)!;
  // The bridges from atom 1 to the other bridgehead, in locant order: x, y, then z (which must have an atom).
  const bridges = nb[one].filter(inRing).map((first) => {
    const path: number[] = [];
    for (let prev = one, i = first; i !== other; ) { path.push(i); const next = nb[i].find((j) => inRing(j) && j !== prev)!; prev = i; i = next; }
    return path;
  }).sort((a, b) => (a.length ? loc(a[0]) : Infinity) - (b.length ? loc(b[0]) : Infinity));
  if (bridges.length !== 3 || !bridges[2].length) return undefined;
  // The model: bridgeheads on the x axis, the x bridge towards +y, the y bridge towards -y (both below), the z bridge on
  // top (+z). Each bridge atom's outward direction.
  const place: V[] = g.atoms.map(() => [NaN, NaN, NaN]), out = new Map<number, V>();
  place[one] = [-1.1, 0, 0];
  place[other] = [1.1, 0, 0];
  const FRAME: [number, number, V][] = [[1.2, -0.5, [0, 1, 0]], [-1.2, -0.5, [0, -1, 0]], [0, 1.2, [0, 0, 1]]];
  bridges.forEach((path, k) => path.forEach((i, n) => { const [y, z, o] = FRAME[k]; place[i] = [-1.1 + (2.2 * (n + 1)) / (path.length + 1), y, z]; out.set(i, o); }));
  const z = new Set(bridges[2]), off = (i: number) => nb[i].filter((j) => !inRing(j));
  // The ring atoms a word can go to: one substituent besides a hydrogen, endo or exo on the x or y bridge, syn or anti
  // on the z bridge.
  const carriers = [...ring].filter((i) => !heads.includes(i) && off(i).length === 2 && off(i).filter((j) => g.atoms[j][0] !== "H").length === 1).sort((a, b) => loc(a) - loc(b));
  const fits = (i: number, word: string) => (z.has(i) ? /syn|anti/ : /endo|exo/).test(word);
  for (const [word, ls] of before) {
    if (ls.every((l) => carriers.some((i) => String(loc(i)) === l))) for (const l of ls) at.set(l, word);
    else bare.unshift(word);
  }
  if (bare.length) {
    const open = carriers.filter((i) => !at.has(String(loc(i))) && fits(i, bare[0]));
    if (bare.length === 1) for (const i of open) at.set(String(loc(i)), bare[0]);
    else if (bare.length === open.length) open.forEach((i, k) => at.set(String(loc(i)), bare[k]));
    else return undefined;
  }
  if (!at.size) return undefined;
  const add = (a: V, b: V, t = 1): V => [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t];
  for (const [l, word] of at) {
    const i = [...ring].find((r) => String(loc(r)) === l);
    if (i === undefined || heads.includes(i)) return undefined;
    const two = off(i), heavy = two.filter((j) => g.atoms[j][0] !== "H");
    if (two.length !== 2 || heavy.length !== 1 || !fits(i, word)) return undefined;
    const towards: V = z.has(i) ? [0, word === "syn" ? 1 : -1, 0] : [0, 0, word === "exo" ? 1 : -1];
    place[heavy[0]] = add(add(place[i], out.get(i)!, 0.6), towards, 0.8);
    place[two.find((j) => j !== heavy[0])!] = add(add(place[i], out.get(i)!, 0.6), towards, -0.8);
  }
  for (const h of heads) for (const j of off(h)) if (Number.isNaN(place[j][0])) place[j] = add(place[h], [h === one ? -1 : 1, 0, 0]);
  // Every other atom out from one placed before it, spread so that no centre is flat. Their own stereo is not read.
  for (let more = true; more; ) {
    more = false;
    for (let i = 0; i < place.length; i++) {
      if (!Number.isNaN(place[i][0])) continue;
      const p = nb[i].find((j) => !Number.isNaN(place[j][0]));
      if (p !== undefined) { place[i] = add(place[p], [0.3 + (i % 3) * 0.2, 0.5 - (i % 2), 0.4 + (i % 5) * 0.1]); more = true; }
    }
  }
  const mol: Mol = { atoms: g.atoms.map((a, i) => ({ label: a[0], location: [place[i][0] * 30, place[i][1] * 30, place[i][2]] as V, ...(a[1] ? { charge: a[1] } : {}) })), bonds: g.bonds.map(([a, b, type]) => ({ type, atoms: [a, b] as [number, number] })) };
  const cip = cipLabels(mol);
  const centres = [...ring].filter((i) => /^[RSrs]$/.test(cip.atoms[i] ?? "")).sort((a, b) => loc(a) - loc(b));
  if (!centres.some((i) => !heads.includes(i))) return undefined;
  if (centres.every((i) => /[RS]/.test(cip.atoms[i]!))) {
    let mine = new Map(centres.map((i) => [String(loc(i)), cip.atoms[i]!]));
    if (!given) return read(`rel-(${[...mine].map(([l, x]) => l + x).join(",")})-${s}`);
    // The name's own labels are absolute: Octet's (one enantiomer of two) turn over to match them.
    const theirs = new Map(given[1].split(",").map((x) => [x.slice(0, -1), x.slice(-1)]));
    const clash = (m: Map<string, string>) => [...m].some(([l, x]) => theirs.has(l) && theirs.get(l) !== x);
    if (clash(mine)) mine = new Map([...mine].map(([l, x]) => [l, x === "R" ? "S" : "R"]));
    if (clash(mine)) return undefined;
    const all = new Map([...theirs, ...mine]);
    return read(`(${[...all].sort((a, b) => Number(a[0]) - Number(b[0])).map(([l, x]) => l + x).join(",")})-${s}`);
  }
  // r or s: SMILES from OPSIN's atoms, when OPSIN gives the rest of the name no stereo.
  if ((given || /[@/\\]/.test(read(s) ?? "@"))) return undefined;
  return smilesOf(g, place, new Set(centres));
}

// SMILES for OPSIN's atoms (hydrogens drawn), each atom in brackets, with @ or @@ on the given centres from their
// neighbours' places. @: seen from the first neighbour, the others turn anticlockwise.
function smilesOf(g: Atoms, place: V[], centres: Set<number>): string {
  const nb = g.atoms.map(() => [] as [number, number][]);
  for (const [a, b, t] of g.bonds) { nb[a].push([b, t]); nb[b].push([a, t]); }
  const seen = new Set<number>(), closes = new Map<number, [number, number, number][]>(), order: number[][] = g.atoms.map(() => []);
  let digit = 0;
  // First pass: the ring closures (a bond to an atom already reached by another path), each with a digit.
  const walk = (i: number, from: number) => {
    seen.add(i);
    for (const [j, t] of nb[i]) {
      if (j === from) continue;
      if (seen.has(j)) { if (![...(closes.get(j) ?? [])].some(([k]) => k === i)) { const d = ++digit; closes.set(i, [...(closes.get(i) ?? []), [j, d, t]]); closes.set(j, [...(closes.get(j) ?? []), [i, d, t]]); } }
      else walk(j, i);
    }
  };
  walk(0, -1);
  seen.clear();
  const BOND = ["", "", "=", "#"];
  const write = (i: number, from: number): string => {
    seen.add(i);
    const ring = closes.get(i) ?? [], kids = nb[i].filter(([j]) => j !== from && !seen.has(j) && !ring.some(([k]) => k === j));
    order[i] = [...(from >= 0 ? [from] : []), ...ring.map(([k]) => k)];
    const parts: string[] = [];
    for (const [j, t] of kids) if (!seen.has(j)) { order[i].push(j); parts.push(BOND[t] + write(j, i)); }
    const [el, charge] = g.atoms[i];
    const hand = centres.has(i) ? (handed(place, order[i]) ? "@" : "@@") : "";
    const q = charge ? (charge > 0 ? "+" : "-") + (Math.abs(charge) > 1 ? Math.abs(charge) : "") : "";
    const head = `[${el}${hand}${q}]${ring.map(([, d, t]) => BOND[t] + (d > 9 ? `%${d}` : d)).join("")}`;
    return head + parts.slice(0, -1).map((p) => `(${p})`).join("") + (parts[parts.length - 1] ?? "");
  };
  const parts = [write(0, -1)];
  for (let i = 0; i < g.atoms.length; i++) if (!seen.has(i)) parts.push(write(i, -1));
  return parts.join(".");
}
// Whether, seen from the first of four neighbours, the other three turn anticlockwise round the centre: the sign of
// the volume they span.
function handed(place: V[], n: number[]): boolean {
  const [a, b, d, e] = n.map((j) => place[j]), v = (p: V): V => [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const [p, q, r] = [v(b), v(d), v(e)];
  return p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0]) > 0;
}
