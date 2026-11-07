// 3D Clean Up (Structure menu, ⇧⌘D), as ChemDraw's: a quick 3D geometry for structures drawn in 2D, or a better one
// for structures in 3D already (run it again to improve it). Octet's own method, no force field library: each bond,
// each angle at an atom (from its hybridisation) and each double bond's cis or trans (as drawn) is a target distance
// between two atoms, and atoms three or more bonds apart keep a least distance. Rounds move each pair of atoms towards
// its target until the shape settles. A stereocentre keeps the hand its wedges and hashes draw, and a saturated
// six-membered ring starts as a chair. Lengths are in bond lengths: a bond is its real length over a C–C single bond,
// times the structure's median bond.
import { AROMATIC, HBOND, hydrogens, type Mol } from "./render.ts";
import { aromaticAtoms, rings } from "./rings.ts";

export const MOST_3D = 500; // ChemDraw's limit: atoms in one structure

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lenV = (a: V) => Math.hypot(a[0], a[1], a[2]);

// Covalent radii (Å), for a bond's real length; a C–C single bond is 1.52 Å.
const RADIUS: Record<string, number> = { H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Br: 1.2, I: 1.39 };
const CC = 1.52;

// ids: the atoms to clean up (whole structures). Returns the drawing with those atoms in 3D, with depth shading on
// (as ChemDraw turns it on after 3D Clean Up).
export function clean3d(m: Mol, ids: number[]): Mol {
  const n = ids.length, local = new Map(ids.map((g, k) => [g, k]));
  if (n < 2) return m;
  const bonds = m.bonds.filter((b) => b.type !== HBOND && local.has(b.atoms[0]) && local.has(b.atoms[1])).map((b) => ({ a: local.get(b.atoms[0])!, b: local.get(b.atoms[1])!, type: b.type, stereo: b.stereo, from: b.atoms[0] }));
  const nei: number[][] = ids.map(() => []);
  for (const b of bonds) { nei[b.a].push(b.b); nei[b.b].push(b.a); }
  const el = ids.map((g) => (m.atoms[g].text ? "C" : m.atoms[g].label));
  // The drawing's median bond, the unit every target is in.
  const p2 = ids.map((g): V => [m.atoms[g].location[0], m.atoms[g].location[1], m.atoms[g].location[2] ?? 0]);
  const drawn = bonds.map((b) => Math.hypot(p2[b.a][0] - p2[b.b][0], p2[b.a][1] - p2[b.b][1], p2[b.a][2] - p2[b.b][2])).sort((x, y) => x - y);
  const unit = drawn[Math.floor(drawn.length / 2)] || 1;

  // Each atom's hybridisation: sp (a triple bond, or two double bonds), sp2 (a double or aromatic bond, an aromatic
  // ring, or N or O next to one: amides, anilines, esters), or sp3; and its ideal angle.
  const used = ids.map(() => 0);
  for (const b of bonds) { const o = b.type === AROMATIC ? 1.5 : b.type === 2 || b.type === 3 ? b.type : 1; used[b.a] += o; used[b.b] += o; }
  const graph = { atoms: ids.map((g, k) => ({ el: el[k], charge: m.atoms[g].charge ?? 0, h: m.atoms[g].implicitHCount ?? hydrogens(el[k], m.atoms[g].charge ?? 0, used[k]) })), bonds: bonds.map((b) => ({ a: b.a, b: b.b, order: (b.type === 2 || b.type === 3 ? b.type : 1) as 1 | 2 | 3 })) };
  const aromatic = aromaticAtoms(graph);
  const hyb = ids.map((_, k) => {
    const mine = bonds.filter((b) => b.a === k || b.b === k);
    if (mine.some((b) => b.type === 3) || mine.filter((b) => b.type === 2).length > 1) return 1;
    if (mine.some((b) => b.type === 2 || b.type === AROMATIC) || aromatic[k]) return 2;
    return 3;
  });
  for (let k = 0; k < n; k++) if (hyb[k] === 3 && (el[k] === "N" || el[k] === "O") && nei[k].some((j) => hyb[j] === 2) && nei[k].length <= 3) hyb[k] = 2;
  const ideal = (k: number) => (hyb[k] === 1 ? Math.PI : hyb[k] === 2 ? (2 * Math.PI) / 3 : Math.acos(-1 / 3));

  // The target distances: bonds, then the third side of each angle, then across each double bond.
  type Pair = { i: number; j: number; d: number; w: number };
  const pairs: Pair[] = [], bondLength = new Map<string, number>(), key = (i: number, j: number) => (i < j ? `${i},${j}` : `${j},${i}`);
  for (const b of bonds) {
    const ring = aromatic[b.a] && aromatic[b.b] && (b.type === 1 || b.type === 2), f = b.type === AROMATIC || ring ? 0.91 : b.type === 3 ? 0.78 : b.type === 2 ? 0.87 : 1;
    const d = (((RADIUS[el[b.a]] ?? 0.76) + (RADIUS[el[b.b]] ?? 0.76)) * f / CC) * unit;
    bondLength.set(key(b.a, b.b), d);
    pairs.push({ i: b.a, j: b.b, d, w: 1 });
  }
  const bl = (i: number, j: number) => bondLength.get(key(i, j)) ?? unit;
  const near = new Set(bonds.map((b) => key(b.a, b.b)));
  for (let j = 0; j < n; j++) for (let x = 0; x < nei[j].length; x++) for (let y = x + 1; y < nei[j].length; y++) {
    const [i, k] = [nei[j][x], nei[j][y]], [a, c] = [bl(i, j), bl(j, k)];
    pairs.push({ i, j: k, d: Math.sqrt(a * a + c * c - 2 * a * c * Math.cos(ideal(j))), w: 0.6 });
    near.add(key(i, k));
  }
  // Across a double bond, each pair of substituents stays cis or trans, as it is drawn (in the plane, 120° angles).
  for (const b of bonds) {
    if (b.type !== 2) continue;
    const d = bl(b.a, b.b), side = (q: number, from: number, to: number) => Math.sign((p2[to][0] - p2[from][0]) * (p2[q][1] - p2[from][1]) - (p2[to][1] - p2[from][1]) * (p2[q][0] - p2[from][0]));
    for (const i of nei[b.a]) for (const l of nei[b.b]) {
      if (i === b.b || l === b.a || i === l) continue;
      const cis = side(i, b.a, b.b) === side(l, b.a, b.b), [a, c] = [bl(i, b.a), bl(b.b, l)];
      pairs.push({ i, j: l, d: Math.hypot(d + (a + c) / 2, ((cis ? c : -c) - a) * Math.sin(Math.PI / 3)), w: 0.3 });
      near.add(key(i, l));
    }
  }
  // Atoms three or more bonds apart keep a least distance (hydrogens a shorter one).
  const apart: [number, number, number][] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (near.has(key(i, j))) continue;
    apart.push([i, j, (el[i] === "H" || el[j] === "H" ? 1.2 : 1.7) * unit]);
  }

  // The start: as drawn, or for a flat drawing, depth from the wedges and hashes (a wedge's far end nearer, a hash's
  // further), each saturated six-membered ring as a chair, and a little depth so no saturated part stays flat.
  const p = p2.map((q): V => [...q]);
  const flat = p.every((q) => Math.abs(q[2]) < 1e-6);
  if (flat) {
    for (const b of bonds) if (b.stereo === 1 || b.stereo === 6) { const [s, e] = b.from === ids[b.a] ? [b.a, b.b] : [b.b, b.a]; p[e][2] = p[s][2] + (b.stereo === 1 ? 0.8 : -0.8) * unit; }
    for (const r of rings(graph)) if (r.length === 6 && r.every((k) => hyb[k] === 3)) r.forEach((k, x) => { if (Math.abs(p[k][2]) < 1e-6) p[k][2] = (x % 2 ? 0.25 : -0.25) * unit; });
    // Saturated atoms only: flat (aromatic and other sp2) parts stay in the page's plane, as drawn.
    p.forEach((q, k) => { if (hyb[k] === 3) q[2] += Math.sin(k * 12.9898 + 4.1) * 0.05 * unit; });
  }
  // Stereocentres: an sp3 atom with a wedge or hash, three or more neighbours; its hand is the side of the plane of
  // its first three neighbours it sits on.
  const centres = ids.flatMap((_, k) => (hyb[k] === 3 && nei[k].length >= 3 && bonds.some((b) => (b.stereo === 1 || b.stereo === 6) && (b.a === k || b.b === k) && b.from === ids[k]) ? [k] : []));
  const hand = (k: number) => { const [a, b, c] = nei[k].map((j) => p[j]); return Math.sign(dotV(sub(p[k], a), crossV(sub(b, a), sub(c, a)))); };
  const hands = new Map(centres.map((k) => [k, hand(k) || 1]));

  // Rounds: each pair moves towards its target, half each; the stereocentres keep their hands.
  const move = (i: number, j: number, d: number, w: number) => {
    const v = sub(p[j], p[i]), l = lenV(v) || 1e-9, s = ((l - d) / l) * 0.5 * w;
    for (let x = 0; x < 3; x++) { p[i][x] += v[x] * s; p[j][x] -= v[x] * s; }
  };
  for (let round = 0; round < 400; round++) {
    for (const q of pairs) move(q.i, q.j, q.d, q.w);
    if (round % 2 === 0) for (const [i, j, d] of apart) { const v = sub(p[j], p[i]); if (dotV(v, v) < d * d) move(i, j, d, 0.3); }
    for (const [k, want] of hands) {
      if (hand(k) === want) continue;
      // The wrong hand: the centre goes through the plane of its three neighbours, to the side it was drawn on.
      const [a, b, c] = nei[k].map((j) => p[j]), nn = crossV(sub(b, a), sub(c, a)), nl = lenV(nn) || 1, off = dotV(sub(p[k], a), nn) / nl;
      for (let x = 0; x < 3; x++) p[k][x] += (nn[x] / nl) * (want * 0.35 * unit - off);
    }
  }
  // The structure stays where it was drawn: its middle on the drawing's middle.
  const mid = (ps: V[]) => [0, 1, 2].map((x) => ps.reduce((s, q) => s + q[x], 0) / ps.length) as V;
  const [was, now] = [mid(p2), mid(p)], shift: V = [was[0] - now[0], was[1] - now[1], -now[2]];
  return {
    ...m,
    atoms: m.atoms.map((a, g) => {
      const k = local.get(g);
      if (k === undefined) return a;
      return { ...a, shade: true, location: [p[k][0] + shift[0], p[k][1] + shift[1], p[k][2] + shift[2]] as V };
    }),
  };
}
