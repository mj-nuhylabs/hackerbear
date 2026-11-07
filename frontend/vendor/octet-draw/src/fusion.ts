// Fusion nomenclature for ring systems outside the namer's table of retained names (IUPAC 2013, P-25; the 1998
// fused ring recommendations FR-2 to FR-8). Clean room: written from the published rules. Four parts:
//   1. Ring perception: the smallest rings of an ortho- or ortho- and peri-fused system, all walked the same way round.
//   2. Peripheral numbering (FR-5): the system drawn on a hexagonal grid, oriented (FR-5.2: most rings in a horizontal
//      row, then most rings up and to the right), numbered clockwise from the upper right ring (FR-5.3), and the
//      numberings left compared by FR-5.4 (heteroatoms, fusion carbon atoms, fusion heteroatoms).
//   3. Names (P-25.3): a base component, attached components as prefixes (pyrido, furo, benzo) of any order, fusion
//      descriptors ([2,3-b], [1',2':1,6]), multi-parent names (FR-6) and benzo names (2H-1,4-benzoxazine).
//   4. Parents of the namer (fusedParent): retained names, fusion names, bridged fused names (FR-8: 1,4-methano-
//      naphthalene) and spiro unions with a polycyclic component (P-24.5: spiro[cyclohexane-1,1'-indene]).
// Where the rules are open to more than one reading (drawing shapes, rows), this follows OPSIN, which reads every name
// back before the app shows it; where the numbering is still open, this module gives no name rather than a guess.

// ——— 1. Ring perception ———

const key = (a: number, b: number) => (a < b ? a * 65536 + b : b * 65536 + a);

// A ring system with local atom indices 0..n-1: rings walked the same way round (shared bonds run opposite ways),
// the ring across each ring bond (or -1), and the periphery (atom → next atom, in the rings' direction; -1 inside).
export type RingSystem = { n: number; el: string[]; adj: number[][]; rings: number[][]; across: number[][]; next: number[] };

// The smallest set of smallest rings: the shortest ring through each bond, kept while independent (GF(2)).
function smallestRings(n: number, adj: number[][]): number[][] {
  const index = new Map<number, number>();
  let edges = 0;
  for (let a = 0; a < n; a++) for (const b of adj[a]) if (a < b) index.set(key(a, b), edges++);
  const need = edges - n + 1, seen = new Set<bigint>(), found: { atoms: number[]; bits: bigint }[] = [];
  for (const [k] of index) {
    const u = Math.floor(k / 65536), v = k % 65536, prev = Array(n).fill(-1), queue = [u];
    prev[u] = u;
    for (let i = 0; i < queue.length && prev[v] < 0; i++) {
      const x = queue[i];
      for (const y of adj[x]) if (prev[y] < 0 && !(x === u && y === v)) { prev[y] = x; queue.push(y); }
    }
    if (prev[v] < 0) continue;
    const atoms = [v];
    while (atoms[atoms.length - 1] !== u) atoms.push(prev[atoms[atoms.length - 1]]);
    let bits = 0n;
    atoms.forEach((a, i) => (bits |= 1n << BigInt(index.get(key(a, atoms[(i + 1) % atoms.length]))!)));
    if (!seen.has(bits)) { seen.add(bits); found.push({ atoms, bits }); }
  }
  found.sort((x, y) => x.atoms.length - y.atoms.length);
  const basis: bigint[] = [], rings: number[][] = [];
  for (const c of found) {
    let b = c.bits;
    for (const r of basis) if ((b ^ r) < b) b ^= r; // rows kept in falling order, each with its own top bit
    if (!b) continue;
    basis.push(b);
    basis.sort((x, y) => (x > y ? -1 : x < y ? 1 : 0));
    rings.push(c.atoms);
  }
  if (rings.length !== need) throw new Error("ring perception");
  return rings;
}

// The rings of a fused system. Throws for systems that are not ortho- or ortho- and peri-fused (bridged, spiro).
export function ringSystem(el: string[], adj: number[][]): RingSystem {
  const n = el.length;
  if (adj.some((a) => a.length < 2 || a.length > 4)) throw new Error("not ortho-fused");
  const rings = smallestRings(n, adj);
  if (rings.length < 2) throw new Error("not ortho-fused");
  const ringsOf = new Map<number, number[]>();
  rings.forEach((r, i) => r.forEach((a, k) => { const e = key(a, r[(k + 1) % r.length]); ringsOf.set(e, [...(ringsOf.get(e) ?? []), i]); }));
  const pairs = new Set<number>();
  for (const [, rs] of ringsOf) {
    if (rs.length > 2) throw new Error("not ortho-fused");
    if (rs.length === 2) { const p = key(rs[0], rs[1]); if (pairs.has(p)) throw new Error("not ortho-fused"); pairs.add(p); }
  }
  // The same way round: a bond two rings share runs a→b in one and b→a in the other.
  const done = rings.map((_, i) => i === 0), queue = [0];
  while (queue.length) {
    const r = rings[queue.shift()!];
    r.forEach((a, k) => {
      const b = r[(k + 1) % r.length];
      for (const s of ringsOf.get(key(a, b))!) {
        const S = rings[s], forward = S[(S.indexOf(a) + 1) % S.length] === b;
        if (S === r) continue;
        if (!done[s]) { if (forward) S.reverse(); done[s] = true; queue.push(s); } else if (forward) throw new Error("not ortho-fused");
      }
    });
  }
  const across = rings.map((r, i) => r.map((a, k) => ringsOf.get(key(a, r[(k + 1) % r.length]))!.find((s) => s !== i) ?? -1));
  // The periphery: the bonds in one ring only, one cycle through every atom not inside.
  const next = Array(n).fill(-1);
  rings.forEach((r, i) => r.forEach((a, k) => { if (across[i][k] < 0) { if (next[a] >= 0) throw new Error("not ortho-fused"); next[a] = r[(k + 1) % r.length]; } }));
  const start = next.findIndex((x) => x >= 0);
  let len = 0;
  for (let a = start; ; ) { a = next[a]; len++; if (a === start) break; if (a < 0 || len > n) throw new Error("not ortho-fused"); }
  if (len !== next.filter((x) => x >= 0).length) throw new Error("not ortho-fused");
  // An atom with four ring bonds lies in three rings, two of which meet only there. OPSIN draws (and numbers) such a
  // system as this module does unless those two are both six-membered (checked on many systems).
  for (let a = 0; a < n; a++) {
    if (adj[a].length < 4) continue;
    const at = [...rings.keys()].filter((r) => rings[r].includes(a));
    if (at.some((r, i) => at.slice(i + 1).some((t) => !across[r].includes(t) && rings[r].length === 6 && rings[t].length === 6))) throw new Error("fused ring shape");
  }
  return { n, el, adj, rings, across, next };
}

// ——— 2. Peripheral numbering (FR-5) ———

// Ring centres on a grid (x in half ring widths, y in rows) for a fusion bond whose outward normal points at an angle.
const STEP: Record<number, [number, number]> = { 0: [2, 0], 60: [1, 1], 90: [0, 1], 120: [-1, 1], 180: [-2, 0], 240: [-1, -1], 270: [0, -1], 300: [1, -1] };
// Ring shapes (FR-5.1): the outward normal of each ring bond, counterclockwise from the bond the ring is entered by,
// relative to that bond. Null marks a bond that is not drawn at a hexagon's angle (a five-membered ring's long bond,
// a seven-membered ring's bent bonds); such a bond is never a fusion bond here. A five-membered ring is a hexagon less
// one atom; a seven-membered ring a hexagon with one atom more; four and eight a square and an octagon.
const SEVEN: (number | null)[][] = [
  [0, 60, 120, 180, null, 270, null], [0, null, 90, 120, 240, 270, null], [0, null, 90, null, 180, 240, 300],
  [0, 60, null, 120, null, 240, 300], [0, 60, 120, null, 240, null, 300],
];
function shapes(size: number, fused: boolean[]): (number | null)[][] {
  let list: (number | null)[][];
  if (size === 6) list = [[0, 60, 120, 180, 240, 300]];
  else if (size === 5) list = [1, 2, 3, 4].map((e) => [0, 1, 2, 3, 4].map((k) => (k < e ? 60 * k : k === e ? null : 60 * (k + 1))));
  else if (size === 7) list = SEVEN;
  else if (size === 4) list = [[0, 90, 180, 270]];
  else if (size === 3) list = [[0, 120, 240]];
  else if (size === 8) list = [[0, 60, 90, 120, 180, 240, 270, 300]];
  else if (size >= 9 && fused.filter(Boolean).length <= 2) {
    // Larger rings, drawn as OPSIN draws them (an octagon stretched; directions counted from the entry bond); it
    // numbers them only with two fusion bonds at most.
    const angle: Record<number, number> = { 0: 0, 1: 60, 2: 90, 3: 120, 4: 180, [-3]: 240, [-2]: 270, [-1]: 300 }, half = Math.floor(size / 2);
    const dir = (d: number) => (d === 1 ? -3 : d === size - 1 ? 3 : size % 2 === 0 ? (Math.abs(d - half) > 2 ? -2 * Math.sign(d - half) : d - half)
      : d === half || d === half + 1 ? 0 : d < half ? -2 : 2);
    list = [Array.from({ length: size }, (_, d) => (d ? (angle[dir(d)] + 180) % 360 : 0))];
  } else throw new Error("fused ring size");
  list = list.filter((s) => s.every((o, k) => o !== null || !fused[k]));
  // Shapes that put the fusion bonds the same way are one shape.
  const seen = new Set<string>();
  return list.filter((s) => { const t = s.map((o, k) => (fused[k] ? o : "")).join(); return !seen.has(t) && !!seen.add(t); });
}

// Directions between ring centres are kept to the grid: a bond facing between a diagonal and the horizontal (30°) is
// drawn as the diagonal (60°).
const snap = (a: number) => (a % 60 === 30 && a % 180 !== 90 ? (a % 180 < 90 ? a + 30 : a - 30) : a) % 360;

// One drawing of the system: the direction from each ring to the ring across each fusion bond (null for bonds in one
// ring only), and the tree of rings the drawing was built along.
type Drawing = { dir: (number | null)[][]; parent: number[]; via: number[]; order: number[] };

// Every drawing of the system on the grid with no distorted ring (FR-5.1).
function drawings(sys: RingSystem): Drawing[] {
  const { rings, across } = sys, R = rings.length;
  const fusedCount = across.map((a) => a.filter((s) => s >= 0).length), least = Math.min(...fusedCount);
  const root = [...rings.keys()].filter((r) => fusedCount[r] === least).sort((a, b) => Number(rings[b].length === 6) - Number(rings[a].length === 6))[0];
  // The root ring is entered by a bond in no other ring, away from the fusion bonds if it can be.
  const rr = rings[root], free = rr.map((_, k) => across[root][k] < 0);
  const ref = [...rr.keys()].find((k) => free[k] && free[(k + 1) % rr.length] && free[(k + rr.length - 1) % rr.length]) ?? free.indexOf(true);
  // A tree of the rings, depth first; each ring entered by the bond it shares with its parent.
  const parent = Array(R).fill(-1), via = Array(R).fill(-1), entry = Array(R).fill(-1), order = [root];
  entry[root] = ref;
  const visit = (r: number) => {
    rings[r].forEach((_, k) => {
      const s = across[r][k];
      if (s < 0 || order.includes(s)) return;
      const a = rings[r][k], S = rings[s];
      parent[s] = r; via[s] = k; entry[s] = (S.indexOf(a) + S.length - 1) % S.length; order.push(s);
      visit(s);
    });
  };
  visit(root);
  const options = order.map((r) => {
    const n = rings[r].length, e = entry[r];
    return shapes(n, rings[r].map((_, j) => across[r][(e + j) % n] >= 0));
  });
  if (options.some((o) => !o.length)) throw new Error("fused ring shape");
  if (options.reduce((t, o) => t * o.length, 1) > 4096) throw new Error("fused ring shape");
  const out: Drawing[] = [];
  const choice = order.map(() => 0);
  for (;;) {
    const dir: (number | null)[][] = rings.map((r) => r.map(() => null));
    order.forEach((r, i) => {
      const n = rings[r].length, e = entry[r], shape = options[i][choice[i]];
      const f = r === root ? 180 : (dir[parent[r]][via[r]]! + 180) % 360;
      shape.forEach((o, j) => { if (o !== null && across[r][(e + j) % n] >= 0) dir[r][(e + j) % n] = snap((f + o) % 360); });
    });
    // Rings fused outside the tree must agree (no distorted ring).
    const agree = rings.every((r, i) => r.every((a, k) => {
      const s = across[i][k];
      if (s < 0) return true;
      const S = rings[s], ks = (S.indexOf(a) + S.length - 1) % S.length;
      return (dir[i][k]! + 180) % 360 === dir[s][ks];
    }));
    if (agree) out.push({ dir, parent, via, order });
    let i = 0;
    while (i < choice.length && ++choice[i] === options[i].length) choice[i++] = 0;
    if (i === choice.length) break;
  }
  if (!out.length) throw new Error("fused ring shape");
  return out;
}

// Heteroatoms in order of seniority for low locants (FR-5.4 b); higher value is more senior.
const SENIOR = ["Hg", "Tl", "In", "Ga", "Al", "B", "Pb", "Sn", "Ge", "Si", "Bi", "Sb", "As", "P", "N", "Te", "Se", "S", "O", "I", "Br", "Cl", "F"];
const senior = (e: string) => SENIOR.indexOf(e) + 1;

export type Numbering = { path: number[]; labels: string[]; interior: number[]; row: number };

// The peripheral numbering (FR-5.3, FR-5.4): every numbering the rules allow. All are alike up to symmetry; where the
// rules leave a choice between numberings that are not alike, this throws.
export function numberSystem(sys: RingSystem): Numbering[] {
  const { n, el, adj, rings, across, next } = sys;
  const prev = Array(n).fill(-1);
  next.forEach((b, a) => { if (b >= 0) prev[b] = a; });
  const fusion = (a: number) => adj[a].length >= 3;
  // Atoms the walk round the rings passes by (interior atoms, and atoms in three rings with four ring bonds such as
  // morphinans' 12b) follow, from the one next to the highest numbered atom along the interior bonds (CAS).
  const inside = (path: number[]) => {
    const rest = [...Array(n).keys()].filter((a) => !path.includes(a)), out: number[] = [], at = (a: number) => path.indexOf(a);
    const score = (a: number) => 1000 * Math.max(...adj[a].map((b) => out.indexOf(b) + 1)) + Math.max(...adj[a].map(at));
    while (out.length < rest.length) out.push(rest.filter((a) => !out.includes(a)).sort((a, b) => score(b) - score(a))[0]);
    return out;
  };
  type Pick = { pos: [number, number][]; mirror: boolean };
  const picks: { pick: Pick; q: [number, number, number] }[] = [];
  const all = drawings(sys);
  // FR-5.2 a: the longest row of rings fused in one direction; the drawing is turned to make each such row horizontal.
  let longest = 0;
  const turns = all.map(() => new Set<number>());
  all.forEach((d, i) => d.dir.forEach((ds, r) => ds.forEach((a, k) => {
    if (a === null) return;
    let len = 1;
    for (let s = across[r][k]; s >= 0; len++) { const j = d.dir[s].indexOf(a); s = j < 0 ? -1 : across[s][j]; if (len > rings.length) throw new Error("fused ring shape"); }
    if (len > longest) { longest = len; turns.forEach((t) => t.clear()); }
    if (len === longest) turns[i].add(a % 180);
  })));
  let row = 0;
  all.forEach((d, i) => { for (const turn of turns[i]) {
    // The drawing turned so that rows along `turn` run horizontally; centres from the tree.
    const pos: [number, number][] = rings.map(() => [0, 0]);
    for (const r of d.order.slice(1)) {
      const step = STEP[snap((d.dir[d.parent[r]][d.via[r]]! - turn + 360) % 360)];
      pos[r] = [pos[d.parent[r]][0] + step[0], pos[d.parent[r]][1] + step[1]];
    }
    const at = new Set(pos.map((p) => `${p[0]} ${p[1]}`));
    if (at.size !== rings.length) continue; // rings drawn over each other
    // Each longest horizontal row; then FR-5.2 b, c, d for each way of turning the drawing over.
    for (const p of pos) {
      if (at.has(`${p[0] - 2} ${p[1]}`)) continue;
      let len = 1;
      while (at.has(`${p[0] + 2 * len} ${p[1]}`)) len++;
      if (len < row) continue;
      if (len > row) { row = len; picks.length = 0; }
      const cx = p[0] + len - 1, cy = p[1];
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        let ur = 0, ll = 0, up = 0;
        for (const [x0, y0] of pos) {
          const x = sx * (x0 - cx), y = sy * (y0 - cy);
          const share = (fx: number, fy: number) => (x === 0 ? 0.5 : x * fx > 0 ? 1 : 0) * (y === 0 ? 0.5 : y * fy > 0 ? 1 : 0);
          ur += share(1, 1); ll += share(-1, -1); up += share(1, 1) + share(-1, 1);
        }
        picks.push({ pick: { pos: pos.map(([x, y]) => [sx * x, sy * y]), mirror: sx * sy < 0 }, q: [-ur, ll, -up] });
      }
    }
  } });
  if (!picks.length) throw new Error("fused ring orientation");
  const best = picks.reduce((m, p) => (cmp(p.q, m) < 0 ? p.q : m), picks[0].q);
  const paths: number[][] = [], walkedOf = new Map<number[], number>();
  for (const { pick, q } of picks) {
    if (cmp(q, best)) continue;
    const { pos, mirror } = pick;
    // FR-5.3: the upper right ring (highest row, then furthest right); one with only fusion atoms passes to the next
    // ring clockwise.
    let top = [...rings.keys()].sort((a, b) => pos[b][1] - pos[a][1] || pos[b][0] - pos[a][0])[0];
    const visited = new Set([top]);
    while (rings[top].every(fusion)) {
      const nb = across[top].filter((s) => s >= 0 && !visited.has(s)).sort((a, b) => pos[b][0] - pos[a][0] || pos[b][1] - pos[a][1]);
      if (!nb.length) throw new Error("fused ring numbering");
      top = nb[0];
      visited.add(top);
    }
    // Start clockwise after the bond the ring shares with its upper left neighbour.
    const ks = [...rings[top].keys()].filter((k) => across[top][k] >= 0);
    const k = ks.sort((a, b) => pos[across[top][b]][1] - pos[across[top][a]][1] || pos[across[top][a]][0] - pos[across[top][b]][0])[0];
    const r = rings[top], v = mirror ? r[(k + 1) % r.length] : r[k];
    if (next[v] < 0) throw new Error("fused ring numbering");
    // Walk clockwise ring by ring as OPSIN does: in each ring, from the atom it was entered at to the next bond it
    // shares with another ring, then into that ring.
    const cw = (q: number, a: number) => { const R = rings[q], i = R.indexOf(a); return R[(i + (mirror ? 1 : R.length - 1)) % R.length]; };
    const over = (q: number, a: number, b: number) => { const R = rings[q], i = R.indexOf(a); return across[q][R[(i + 1) % R.length] === b ? i : R.indexOf(b)]; };
    const path: number[] = [];
    let ring = top, a = v;
    for (let guard = 0; guard < 4 * n; guard++) {
      const b = cw(ring, a), s = over(ring, a, b);
      if (s >= 0) { ring = s; continue; }
      if (path.includes(b)) break;
      path.push(b);
      a = b;
    }
    if (!path.includes(v)) throw new Error("fused ring numbering");
    const full = [...path, ...inside(path)];
    walkedOf.set(full, path.length);
    paths.push(full);
  }
  // FR-5.4: low locants for heteroatoms together, then by seniority, then for fusion carbon atoms, then fusion
  // heteroatoms.
  const numbered = (p: number[]) => p.filter((a) => el[a] !== "C" || !fusion(a));
  const order = (x: number[], y: number[]) => {
    const nx = numbered(x), ny = numbered(y);
    for (let i = 0; i < nx.length; i++) if ((el[nx[i]] !== "C") !== (el[ny[i]] !== "C")) return el[nx[i]] !== "C" ? -1 : 1;
    for (let i = 0; i < nx.length; i++) if (el[nx[i]] !== el[ny[i]]) return senior(el[ny[i]]) - senior(el[nx[i]]);
    for (let i = 0; i < x.length; i++) { const fx = el[x[i]] === "C" && fusion(x[i]), fy = el[y[i]] === "C" && fusion(y[i]); if (fx !== fy) return fx ? -1 : 1; }
    for (let i = 0; i < x.length; i++) if (fusion(x[i]) !== fusion(y[i])) return fusion(x[i]) ? -1 : 1;
    return 0;
  };
  paths.sort(order);
  const chosen = paths.filter((p) => order(p, paths[0]) === 0);
  // FR-5.4 b counts element by element (O first, then S ...): it must pick the same, or there is no name.
  const hetero = (p: number[]) => numbered(p).map((a, i) => (el[a] !== "C" ? i : -1)).filter((i) => i >= 0);
  const byElement = (p: number[]) => SENIOR.slice().reverse().flatMap((e) => numbered(p).map((a, i) => (el[a] === e ? i : -1)).filter((i) => i >= 0).concat([-1]));
  if (paths.some((p) => !cmp(hetero(p), hetero(chosen[0])) && cmp(byElement(p), byElement(chosen[0])) < 0)) throw new Error("fused ring numbering");
  // Numberings the rules cannot tell apart must be alike (a symmetry of the system); else the choice is open.
  const like = (x: number[], y: number[]) => x.every((a, i) => el[a] === el[y[i]] && adj[a].every((b) => adj[y[i]].includes(y[x.indexOf(b)])));
  if (chosen.some((p) => !like(chosen[0], p))) throw new Error("fused ring numbering");
  const seen = new Set<string>();
  const walked = walkedOf.get(chosen[0])!, interior = chosen[0].slice(walked);
  if (chosen.some((p) => walkedOf.get(p) !== walked)) throw new Error("fused ring numbering");
  return chosen.filter((p) => !seen.has(p.join()) && !!seen.add(p.join())).map((path) => ({ path, labels: labelsOf(path, el, fusion), interior, row: longest }));
}

// Locants: numbers for peripheral atoms and every heteroatom, a letter after the last number for fusion carbon atoms.
function labelsOf(path: number[], el: string[], fusion: (a: number) => boolean): string[] {
  let num = 0, letter = 0;
  return path.map((a) => (el[a] !== "C" || !fusion(a) ? ((letter = 0), String(++num)) : `${num}${String.fromCharCode(97 + letter++)}`));
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// ——— 3. Names (P-25.3) ———

// A small SMILES reader for the ring skeletons below (atoms, ring closures, branches; bond orders are ignored).
function skeleton(smiles: string): { el: string[]; adj: number[][] } {
  const el: string[] = [], adj: number[][] = [], open = new Map<string, number>(), stack: number[] = [];
  let prev = -1;
  for (const c of smiles) {
    if (c === "(") stack.push(prev);
    else if (c === ")") prev = stack.pop()!;
    else if (/[0-9]/.test(c)) {
      const o = open.get(c);
      if (o === undefined) open.set(c, prev); else { adj[o].push(prev); adj[prev].push(o); open.delete(c); }
    } else if (/[A-Za-z]/.test(c)) {
      const a = el.push(c.toUpperCase()) - 1;
      adj.push([]);
      if (prev >= 0) { adj[a].push(prev); adj[prev].push(a); }
      prev = a;
    }
  }
  return { el, adj };
}

// Retained polycyclic components (P-25.1.1, P-25.2.1) with their prefix forms (P-25.3.2.2). A skeleton given as SMILES is
// numbered by the rules above; one given as bonds by locant keeps its retained numbering. Benzo names (1-benzofuran,
// 1,3-benzoxazole) are not here: they are formed from their rings (FR-3.5).
const ANTHRACENE = "1-2 2-3 3-4 4-4a 4a-10 10-10a 10a-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 8a-10a";
const RETAINED: [string, string, string, string?][] = [
  ["naphthalene", "naphtho", "C1=CC=CC2=CC=CC=C12"], ["quinoline", "quino", "N1=CC=CC2=CC=CC=C12"], ["isoquinoline", "isoquino", "C1=NC=CC2=CC=CC=C12"],
  ["quinazoline", "quinazolino", "N1=CN=CC2=CC=CC=C12"], ["quinoxaline", "quinoxalino", "N1=CC=NC2=CC=CC=C12"], ["cinnoline", "cinnolino", "N1=NC=CC2=CC=CC=C12"],
  ["phthalazine", "phthalazino", "C1=NN=CC2=CC=CC=C12"], ["1,5-naphthyridine", "[1,5]naphthyridino", "N1=CC=CC2=NC=CC=C12"],
  ["1,6-naphthyridine", "[1,6]naphthyridino", "N1=CC=CC2=CN=CC=C12"], ["1,7-naphthyridine", "[1,7]naphthyridino", "N1=CC=CC2=CC=NC=C12"],
  ["1,8-naphthyridine", "[1,8]naphthyridino", "N1=CC=CC2=CC=CN=C12"], ["2,6-naphthyridine", "[2,6]naphthyridino", "C1=NC=CC2=CN=CC=C12"],
  ["2,7-naphthyridine", "[2,7]naphthyridino", "C1=NC=CC2=CC=NC=C12"], ["pteridine", "pteridino", "N1=CN=CC2=NC=CN=C12"],
  ["quinolizine", "quinolizino", "C1=CCN2C=CC=CC2=C1"], ["indene", "indeno", "C1=CC2=CC=CC=C2C1"], ["indole", "indolo", "N1C=CC2=CC=CC=C12"],
  ["isoindole", "isoindolo", "C1NC=C2C=CC=CC12"], ["indazole", "indazolo", "N1N=CC2=CC=CC=C12"], ["indolizine", "indolizino", "C1=CN2C=CC=CC2=C1"],
  ["pyrrolizine", "pyrrolizino", "C1C=CN2C=CC=C12"], ["azulene", "azuleno", "C1=CC=C2C=CC=CC=C12"], ["pentalene", "pentaleno", "C1=CC=C2C=CC=C12"],
  ["heptalene", "heptaleno", "C1=CC=CC=C2C=CC=CC=C12"], ["biphenylene", "biphenyleno", "C1=CC=CC=2C3=CC=CC=C3C12"],
  ["as-indacene", "as-indaceno", "C1=CC=C2C=CC3=CC=CC3=C12"], ["s-indacene", "s-indaceno", "C1=CC=C2C=C3C=CC=C3C=C12"],
  ["acenaphthylene", "acenaphtho", "C1=CC2=CC=CC3=CC=CC1=C23"], ["fluorene", "fluoreno", "C1=CC=CC=2C3=CC=CC=C3CC12"],
  ["phenalene", "phenaleno", "C1C=CC2=CC=CC3=CC=CC1=C23"], ["perimidine", "perimido", "N1C=NC2=CC=CC3=CC=CC1=C23"],
  ["phenanthridine", "phenanthridino", "C1=CC=CC2=NC=C3C=CC=CC3=C12"], 
  ["phenazine", "phenazino", "C1=CC=CC2=NC3=CC=CC=C3N=C12"], ["phenoxazine", "phenoxazino", "C1=CC=CC=2OC3=CC=CC=C3NC12"],
  ["phenothiazine", "phenothiazino", "C1=CC=CC=2SC3=CC=CC=C3NC12"], ["phenoxathiine", "phenoxathiino", "C1=CC=CC=2OC3=CC=CC=C3SC12"],
  ["thianthrene", "thianthreno", "C1=CC=CC=2SC3=CC=CC=C3SC12"], ["fluoranthene", "fluorantheno", "C1=CC=C2C=CC=C3C4=CC=CC=C4C1=C23"],
  ["acephenanthrylene", "acephenanthryleno", "C1=CC=C2C=CC3=CC4=CC=CC=C4C1=C23"], ["aceanthrylene", "aceanthryleno", "C1=CC2=CC=CC3=CC4=CC=CC=C4C1=C23"],
  ["triphenylene", "triphenyleno", "C1=CC=CC=2C3=CC=CC=C3C3=CC=CC=C3C12"], 
  ["chrysene", "chryseno", "C1=CC=CC=2C3=CC=C4C=CC=CC4=C3C=CC12"], ["tetracene", "tetraceno", "C1=CC=CC2=CC3=CC4=CC=CC=C4C=C3C=C12"],
  ["tetraphene", "tetrapheno", "C1=CC=CC2=CC=C3C=C4C=CC=CC4=CC3=C12"], ["picene", "piceno", "C1=CC=CC2=CC=C3C4=CC=C5C=CC=CC5=C4C=CC3=C21"],
  ["pentaphene", "pentapheno", "C1=CC=CC2=CC3=CC=C4C=C5C=CC=CC5=CC4=C3C=C12"],
  ["pentacene", "pentaceno", "C1=CC=CC2=CC3=CC4=CC5=CC=CC=C5C=C4C=C3C=C12"], ["hexaphene", "hexapheno", "C1=CC=CC2=CC3=CC=C4C=C5C=C6C=CC=CC6=CC5=CC4=C3C=C12"],
  ["hexacene", "hexaceno", "C1=CC=CC2=CC3=CC4=CC5=CC6=CC=CC=C6C=C5C=C4C=C3C=C12"], 
  ["trinaphthylene", "trinaphthyleno", "C1=CC=CC2=CC=3C4=CC5=CC=CC=C5C=C4C4=CC5=CC=CC=C5C=C4C3C=C12"],
  ["heptaphene", "heptapheno", "C1=CC=CC2=CC3=CC4=CC=C5C=C6C=C7C=CC=CC7=CC6=CC5=C4C=C3C=C12"], ["heptacene", "heptaceno", "C1=CC=CC2=CC3=CC4=CC5=CC6=CC7=CC=CC=C7C=C6C=C5C=C4C=C3C=C12"],
  
  ["tetraphenylene", "tetraphenyleno", "C1=CC=CC=2C3=CC=CC=C3C3=CC=CC=C3C3=CC=CC=C3C12"],
  
  // Retained numbering (exceptions to FR-5.3), and peri-fused parents with interior locants as OPSIN reads them.
  ["pyrene", "pyreno", "1-2 2-3 3-3a 3a-4 4-5 5-5a 5a-6 6-7 7-8 8-8a 8a-9 9-10 10-10a 1-10a 10a-10b 3a-10b 10b-10c 5a-10c 8a-10c", ""],
  ["perylene", "peryleno", "1-2 2-3 3-3a 3a-4 4-5 5-6 6-6a 6a-6b 6b-7 7-8 8-9 9-9a 9a-10 10-11 11-12 12-12a 12a-12b 1-12b 3a-12c 6a-12c 12b-12c 6b-12d 9a-12d 12a-12d", ""],
  ["coronene", "coroneno", "1-2 2-2a 2a-3 3-4 4-4a 4a-5 5-6 6-6a 6a-7 7-8 8-8a 8a-9 9-10 10-10a 10a-11 11-12 12-12a 1-12a 2a-12b 12b-12c 4a-12c 12c-12d 6a-12d 12d-12e 8a-12e 12e-12f 10a-12f 12f-12g 12a-12g 12b-12g", ""],
  ["ovalene", "ovaleno", "1-2 2-2a 2a-3 3-4 4-4a 4a-5 5-6 6-6a 6a-7 7-7a 7a-8 8-9 9-9a 9a-10 10-11 11-11a 11a-12 12-13 13-13a 13a-14 14-14a 1-14a 14a-14b 14b-14c 2a-14c 14c-14d 4a-14d 14d-14e 6a-14e 14e-14f 14f-14g 7a-14g 14g-14h 9a-14h 14h-14i 11a-14i 14i-14j 13a-14j 14j-14k 14b-14k 14f-14k", ""],
  ["pyranthrene", "pyranthreno", "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-5a 5a-6 6-7 7-7a 7a-8 8-8a 8a-9 9-10 10-11 11-12 12-12a 8a-12a 12a-12b 12b-13 13-13a 13a-14 14-15 15-15a 15a-16 16-16a 1-16a 4a-16a 4b-15b 15a-15b 15b-15c 13a-15c 15c-15d 5a-15d 15d-15e 7a-15e 12b-15e", ""],
  ["rubicene", "rubiceno", "1-2 2-3 3-3a 3a-3b 3b-4 4-5 5-6 6-7 7-7a 3b-7a 7a-7b 7b-7c 7c-8 8-9 9-10 10-10a 10a-10b 10b-11 11-12 12-13 13-14 14-14a 10b-14a 14a-14b 14b-14c 1-14c 3a-14d 7b-14d 14c-14d 7c-14e 10a-14e 14b-14e", ""],
  ["anthracene", "anthra", ANTHRACENE, ""], ["acridine", "acridino", ANTHRACENE, "N10"], ["xanthene", "xantheno", ANTHRACENE, "O10"],
  ["thioxanthene", "thioxantheno", ANTHRACENE, "S10"],
  ["phenanthrene", "phenanthro", "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-10 10-10a 10a-1 4a-10a 4b-8a", ""],
  ["carbazole", "carbazolo", "1-2 2-3 3-4 4-4a 4a-4b 4b-5 5-6 6-7 7-8 8-8a 8a-9 9-9a 9a-1 4a-9a 4b-8a", "N9"],
  ["purine", "purino", "1-2 2-3 3-4 4-5 5-6 6-1 5-7 7-8 8-9 9-4", "N1 N3 N7 N9"],
  // Phenanthrolines: a nitrogen in each end ring, numbered as the hydrocarbon (FR-5).
  ...["1,7", "1,8", "1,9", "1,10", "2,7", "2,8", "2,9", "3,7", "3,8", "4,7"].map((l): [string, string, string, string] =>
    [`${l}-phenanthroline`, `[${l}]phenanthrolino`, "1-2 2-3 3-4 4-4a 4a-5 5-6 6-6a 6a-7 7-8 8-9 9-10 10-10a 10a-10b 10b-1 4a-10b 6a-10a", l.split(",").map((x) => `N${x}`).join(" ")]),
  ["pleiadene", "pleiadeno", "1-2 2-3 3-3a 3a-4 4-5 5-6 6-6a 6a-7 7-7a 7a-8 8-9 9-10 10-11 11-11a 11a-12 12-12a 12a-1 7a-11a 3a-12b 6a-12b 12a-12b", ""],
  // Steroid numbering, as OPSIN reads the name (CAS; FR-5.3 notes the difference).
  ["cyclopenta[a]phenanthrene", "", "1-2 2-3 3-4 4-5 5-6 6-7 7-8 8-14 14-15 15-16 16-17 17-13 13-12 12-11 11-9 9-10 10-1 5-10 8-9 13-14", ""],
];

// A component as matched: its atoms in its own locant order (one array for each numbering), its locants, its periphery
// (indices, from locant 1 towards 2), and its seniority (FR-2.3; lower is more senior).
type Template = { name: string; prefix: string; el: string[]; adj: number[][]; labels: string[]; peri: number[]; rings: number; sizes: number[]; row: number; given: boolean };
type Comp = { name: string; prefix: string; rings: number[]; nums: number[][]; labels: string[]; peri: number[]; key: number[]; carbo: boolean };

const locOrder = (a: string, b: string) => parseInt(a) - parseInt(b) || (a < b ? -1 : a > b ? 1 : 0);
const locValue = (l: string) => parseInt(l) + (/[a-z]$/.test(l) ? (l.charCodeAt(l.length - 1) - 96) / 100 : 0);
let templates: Template[] | undefined;
function retained(): Template[] {
  if (templates) return templates;
  templates = RETAINED.map(([name, prefix, s, hetero]) => {
    let el: string[], adj: number[][], labels: string[], peri: number[];
    if (hetero === undefined) {
      // Numbered by FR-5: atoms put in locant order.
      const g = skeleton(s), num = numberSystem(ringSystem(g.el, g.adj))[0], at = new Map(num.path.map((a, i) => [a, i]));
      el = num.path.map((a) => g.el[a]);
      adj = num.path.map((a) => g.adj[a].map((b) => at.get(b)!));
      labels = num.labels;
      peri = num.path.slice(0, num.path.length - num.interior.length).map((_, i) => i);
    } else {
      const pairs = s.split(" ").map((b) => b.split("-"));
      labels = [...new Set(pairs.flat())].sort(locOrder);
      el = labels.map(() => "C");
      for (const h of hetero.split(" ").filter(Boolean)) el[labels.indexOf(h.slice(1))] = h[0];
      adj = labels.map(() => []);
      for (const [a, b] of pairs) { adj[labels.indexOf(a)].push(labels.indexOf(b)); adj[labels.indexOf(b)].push(labels.indexOf(a)); }
      const sys = ringSystem(el, adj);
      // The periphery from 1 towards 2.
      const step = sys.next[1] === 0 ? (a: number) => sys.next.indexOf(a) : (a: number) => sys.next[a];
      peri = [0];
      while (peri.length < sys.next.filter((x) => x >= 0).length) peri.push(step(peri[peri.length - 1]));
    }
    const sys = ringSystem(el, adj);
    let row = 0;
    try { row = numberSystem(sys)[0].row; } catch { /* no drawing: no preference by orientation */ }
    return { name, prefix, el, adj, labels, peri, rings: sys.rings.length, sizes: sys.rings.map((r) => r.length).sort((a, b) => b - a), row, given: hetero !== undefined };
  });
  return templates;
}

// Hantzsch-Widman names (P-22.2.2) and the retained names of monocycles used in fusion names (P-25.3.2.2).
const HW_ORDER = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
const HW_PREFIX: Record<string, string> = { F: "fluora", Cl: "chlora", Br: "broma", I: "ioda", O: "oxa", S: "thia", Se: "selena", Te: "tellura", N: "aza", P: "phospha", As: "arsa", Sb: "stiba",
  Bi: "bisma", Si: "sila", Ge: "germa", Sn: "stanna", Pb: "plumba", B: "bora", Hg: "mercura" };
const MULT = ["", "", "di", "tri", "tetra", "penta"];
const BIGMULT = ["", "", "di", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca"];
// Stems of rings of nine members or more, for [n]annulene, cyclonona and replacement names.
const BIG = ["", "", "", "", "", "", "", "", "", "non", "dec", "undec", "dodec", "tridec", "tetradec", "pentadec", "hexadec", "heptadec", "octadec",
  "nonadec", "icos", "henicos", "docos", "tricos", "tetracos"];
const MONO: Record<string, [string, string]> = {
  "6:": ["benzene", "benzo"], "6:N1": ["pyridine", "pyrido"], "6:N1,N2": ["pyridazine", "pyridazino"], "6:N1,N3": ["pyrimidine", "pyrimido"],
  "6:N1,N4": ["pyrazine", "pyrazino"], "6:O1": ["pyran", "pyrano"], "6:S1": ["thiopyran", "thiopyrano"], "6:Se1": ["selenopyran", "selenopyrano"], "6:Te1": ["telluropyran", "telluropyrano"],
  "5:Se1": ["selenophene", "selenopheno"], "5:Te1": ["tellurophene", "telluropheno"], "5:N1": ["pyrrole", "pyrrolo"],
  "5:N1,N2": ["pyrazole", "pyrazolo"], "5:N1,N3": ["imidazole", "imidazo"], "5:O1": ["furan", "furo"], "5:S1": ["thiophene", "thieno"],
  "5:": ["", "cyclopenta"], "4:": ["", "cyclobuta"], "3:": ["", "cyclopropa"], "7:": ["[7]annulene", "cyclohepta"], "8:": ["[8]annulene", "cycloocta"],
};

// A ring as a component: its name, prefix, stem and the numberings its heteroatoms allow (low locants together, then
// O, S, N).
function monocycle(els: string[]): { name: string; prefix: string; stem: string; nums: number[][] } | undefined {
  const n = els.length;
  let nums: number[][] = [];
  for (let s = 0; s < n; s++) for (const d of [1, -1]) nums.push(els.map((_, k) => (s + d * k + 2 * n) % n));
  const lowest = (f: (num: number[]) => number[]) => {
    let best: number[] | undefined;
    for (const num of nums) { const l = f(num); if (!best || cmp(l, best) < 0) best = l; }
    nums = nums.filter((num) => !cmp(f(num), best!));
  };
  // Number 1 is the most senior heteroatom (O, S, Se, Te, N), then low locants for the heteroatoms together, then in
  // order of seniority (P-22.2.2.1.2).
  const top = HW_ORDER.find((e) => els.includes(e));
  if (top) nums = nums.filter((num) => els[num[0]] === top);
  lowest((num) => num.map((a, k) => (els[a] !== "C" ? k + 1 : 0)).filter(Boolean));
  for (const e of HW_ORDER) lowest((num) => num.map((a, k) => (els[a] === e ? k + 1 : 0)).filter(Boolean));
  const hetero = nums[0].flatMap((a, k): [string, number][] => (els[a] !== "C" ? [[els[a], k + 1]] : []))
    .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || x[1] - y[1]);
  if (hetero.some(([e]) => !HW_PREFIX[e])) return undefined;
  const known = MONO[`${n}:${hetero.map(([e, k]) => e + k).join(",")}`];
  if (known) return { name: known[0], prefix: known[1], stem: known[0], nums };
  // Six-membered rings end -inine when the last heteroatom cited is B, P, As, Sb or a halogen (P-22.2.2.1.4).
  const six = ["B", "P", "As", "Sb", "F", "Cl", "Br", "I"].includes(hetero[hetero.length - 1]?.[0]) ? "inine" : "ine";
  const stems = ["", "", "", hetero.some(([e]) => e === "N") ? "irine" : "irene", "ete", "ole", six, "epine", "ocine", "onine", "ecine"];
  if (!hetero.length) return BIG[n] ? { name: `[${n}]annulene`, prefix: `cyclo${BIG[n]}a`, stem: `[${n}]annulene`, nums } : undefined;
  if (!stems[n]) {
    // Rings of more than ten members: replacement names (P-31.1.4.2.4): [1,4,7,10,13,16]hexaoxacyclooctadecine.
    if (!BIG[n]) return undefined;
    const locs = `[${hetero.map(([, k]) => k).join(",")}]`;
    const stem = HW_ORDER.filter((e) => hetero.some(([x]) => x === e)).map((e) => BIGMULT[hetero.filter(([x]) => x === e).length] + HW_PREFIX[e]).join("") + `cyclo${BIG[n]}ine`;
    return { name: locs + stem, prefix: locs + stem.replace(/e$/, "o"), stem, nums };
  }
  const unique = hetero.length >= n - 1 && new Set(hetero.map(([e]) => e)).size === 1;
  const locs = hetero.length > 1 && !unique ? `[${hetero.map(([, k]) => k).join(",")}]` : "";
  const stem = (HW_ORDER.filter((e) => hetero.some(([x]) => x === e)).map((e) => MULT[hetero.filter(([x]) => x === e).length] + HW_PREFIX[e]).join("") + stems[n]).replace(/a(?=[aeiou])/g, "");
  return { name: locs + stem, prefix: locs + stem.replace(/e$/, "o"), stem, nums };
}

// Seniority of a component (FR-2.3): nitrogen, then the first heteroatom in F, Cl, Br, I, O, S ... order; more rings;
// larger rings; more heteroatoms; more kinds; more of each in order; lower heteroatom locants; lower locants in order;
// lower fusion carbon locants.
const FR23A = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
const FR23F = ["F", "Cl", "Br", "I", "O", "S", "Se", "Te", "N", "P", "As", "Sb", "Bi", "Si", "Ge", "Sn", "Pb", "B", "Hg"];
function seniority(el: string[], labels: string[], sizes: number[], fusion: boolean[], row = sizes.length > 1 ? 2 : 1): number[] {
  const hetero = el.map((e, i) => (e !== "C" ? i : -1)).filter((i) => i >= 0), has = (e: string) => hetero.some((i) => el[i] === e);
  const first = has("N") ? 0 : FR23A.findIndex(has) + 1 || 99;
  const locs = (f: (i: number) => boolean) => el.map((_, i) => i).filter(f).map((i) => locValue(labels[i])).sort((a, b) => a - b);
  return [first, -sizes.length, ...sizes.map((s) => -s), -hetero.length, -new Set(hetero.map((i) => el[i])).size, ...FR23F.map((e) => -hetero.filter((i) => el[i] === e).length), -row,
    ...locs((i) => el[i] !== "C"), ...FR23F.flatMap((e) => locs((i) => el[i] === e)), ...locs((i) => el[i] === "C" && fusion[i])];
}

// Every map of a template onto atoms that keeps elements and bonds (bounded).
function isomorphisms(tel: string[], tadj: number[][], atoms: number[], el: (a: number) => string, nb: (a: number) => number[]): number[][] {
  const order = [0];
  for (let k = 0; k < order.length; k++) for (const j of tadj[order[k]]) if (!order.includes(j)) order.push(j);
  const out: number[][] = [], map: number[] = tel.map(() => -1), used = new Set<number>();
  let steps = 0;
  const place = (k: number) => {
    if (++steps > 50000) throw new Error("ring match");
    if (k === order.length) { out.push([...map]); return; }
    const p = order[k], placed = tadj[p].filter((q) => map[q] >= 0);
    for (const a of placed.length ? nb(map[placed[0]]) : atoms) {
      if (used.has(a) || el(a) !== tel[p] || nb(a).length !== tadj[p].length || !placed.every((q) => nb(map[q]).includes(a))) continue;
      map[p] = a; used.add(a);
      place(k + 1);
      map[p] = -1; used.delete(a);
    }
  };
  place(0);
  return out;
}

// The components found in a system: each ring, every retained polycycle, and benzo units (a benzene ring with a
// heteromonocycle of five or more members, FR-3.5), numbered as a fused bicycle.
function components(sys: RingSystem) {
  const { rings, across, el, adj } = sys;
  const monos = rings.map((r, i): Comp | undefined => {
    const m = monocycle(r.map((a) => el[a]));
    if (!m) return undefined;
    const nums = m.nums.map((num) => num.map((k) => r[k])), labels = r.map((_, k) => String(k + 1));
    return { name: m.name, prefix: m.prefix, rings: [i], nums, labels, peri: labels.map((_, k) => k), carbo: !r.some((a) => el[a] !== "C"),
      key: seniority(nums[0].map((a) => el[a]), labels, [r.length], labels.map(() => false)) };
  });
  // Retained polycycles on connected sets of rings with the same atoms and bonds.
  const polys: Comp[] = [], sets = new Map<string, number[]>();
  const grow = (set: number[]) => {
    const k = [...set].sort((a, b) => a - b).join();
    if (sets.has(k) || set.length > 10) return;
    sets.set(k, set);
    for (const r of set) for (const s of across[r]) if (s >= 0 && !set.includes(s)) grow([...set, s]);
  };
  rings.forEach((_, r) => grow([r]));
  for (const set of sets.values()) {
    if (set.length < 2) continue;
    const atoms = [...new Set(set.flatMap((r) => rings[r]))], inSet = new Set(atoms);
    const bonds = new Set(set.flatMap((r) => rings[r].map((a, k) => key(a, rings[r][(k + 1) % rings[r].length]))));
    const nb = (a: number) => adj[a].filter((b) => inSet.has(b) && bonds.has(key(a, b)));
    for (const t of retained()) {
      if (t.rings !== set.length || t.el.length !== atoms.length) continue;
      const nums = isomorphisms(t.el, t.adj, atoms, (a) => el[a], nb);
      if (nums.length && t.prefix) polys.push({ name: t.name, prefix: t.prefix, rings: set, nums, labels: t.labels, peri: t.peri, carbo: false, key: seniority(t.el, t.labels, t.sizes, t.adj.map((x) => x.length === 3), t.row) });
    }
  }
  const unit = (set: number[]): Comp | undefined => {
    if (set.length !== 2 || polys.some((p) => p.rings.length === 2 && set.every((r) => p.rings.includes(r)))) return undefined;
    const [b, h] = monos[set[0]]?.name === "benzene" ? set : [set[1], set[0]];
    const ring = rings[h], m = monocycle(ring.map((a) => el[a]));
    if (monos[b]?.name !== "benzene" || !m || !ring.some((a) => el[a] !== "C") || ring.length < 5 || !across[b].includes(h)) return undefined;
    const atoms = [...new Set([...rings[b], ...ring])], at = new Map(atoms.map((a, i) => [a, i]));
    const local = ringSystem(atoms.map((a) => el[a]), atoms.map((a) => adj[a].filter((x) => at.has(x)).map((x) => at.get(x)!)));
    const num = numberSystem(local), nums = num.map((x) => x.path.map((i) => atoms[i])), labels = num[0].labels;
    const hetero = nums[0].flatMap((a, i): [string, string][] => (el[a] !== "C" ? [[el[a], labels[i]]] : []))
      .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || locOrder(x[1], y[1]));
    const locs = m.name === "imidazole" ? "" : `[${hetero.map((x) => x[1]).join(",")}]`;
    const benz = /^[aeiou]/.test(m.stem) ? "benz" : "benzo";
    return { name: locs + benz + m.stem, prefix: locs + benz + m.prefix.replace(/^\[[^\]]*\]/, ""), rings: set, nums, labels, peri: labels.map((_, i) => i), carbo: false,
      key: seniority(nums[0].map((a) => el[a]), labels, [ring.length, 6].sort((x, y) => y - x), nums[0].map((a) => local.adj[at.get(a)!].length === 3)) };
  };
  return { monos, polys, unit };
}

// The fusion name of a system (P-25.3.1.3, FR-3): the senior component as the base, the other rings covered by attached
// components, each fused to one component nearer the base (first order, second order ...). Among the ways to cover
// the rings: no higher-order components if possible, then the most first-order components, then the most senior ones
// (FR-3.3.1, FR-3.4). Then FR-3.5: a benzo ring joins the heteromonocycle it is fused to ([1]benzofuro, [1,5]benzodiazepine),
// which may become the base (pyrido[1,2-a]benzimidazole). `num` is the system's own numbering, for benzo names (P-25.2.2.4).
type Node = { c: Comp; kids: Node[]; order: number };
export function fusionName(sys: RingSystem, num: Numbering): string {
  const { rings, across, el } = sys;
  const { monos, polys, unit } = components(sys);
  // A benzo name for benzene with one heteromonocycle: 2H-1,4-benzoxazine.
  if (rings.length === 2) {
    const u = unit([0, 1]);
    if (u) {
      const hetero = num.path.flatMap((a, i): [string, string][] => (el[a] !== "C" ? [[el[a], num.labels[i]]] : []))
        .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || locOrder(x[1], y[1]));
      const stem = u.name.replace(/^\[[^\]]*\]/, "");
      return stem === "benzimidazole" ? stem : `${hetero.map((x) => x[1]).join(",")}-${stem}`;
    }
  }
  const all = [...monos.filter((c): c is Comp => !!c), ...polys];
  if (!all.length) throw new Error("fused ring component");
  const senior = all.reduce((m, c) => (cmp(c.key, m.key) < 0 ? c : m));
  const bases = all.filter((c) => !cmp(c.key, senior.key));
  if (new Set(bases.map((c) => c.name)).size > 1 || !senior.name) throw new Error("fused ring base component");
  const fusedTo = (x: Comp, y: Comp) => x.rings.some((r) => across[r].some((s) => y.rings.includes(s)));
  const multi = multiParent(sys, bases, all, fusedTo);
  if (multi) return multi;
  let best: { rank: number[]; name: string } | undefined;
  for (const b of bases) {
    const rest = rings.map((_, r) => r).filter((r) => !b.rings.includes(r));
    for (const cover of covers(rest, all.filter((c) => c.prefix && c.rings.every((r) => rest.includes(r))))) {
      const tree = treeOf(b, cover, fusedTo);
      if (!tree) continue;
      // FR-3.3.1 b, c, f: the fewest orders, the most first-order components, the most senior ones.
      const nodes = flat(tree), first = tree.kids.map((k) => k.c.key).sort(cmp);
      const rank = [Math.max(...nodes.map((x) => x.order)), -tree.kids.length, ...first.flatMap((k) => [...k, 999])];
      const final = benzoUnits(tree, unit, fusedTo);
      if (!final) continue;
      const named = describe(sys, final);
      if (!named) continue;
      const key = [...rank, -1e6, ...named.key];
      if (!best || cmp(key, best.rank) < 0) best = { rank: key, name: named.name };
    }
  }
  if (!best) throw new Error("fused ring components");
  return best.name;
}

// The ways to cover rings with components (each ring in one component), bounded.
function covers(rings: number[], comps: Comp[]): Comp[][] {
  const out: Comp[][] = [];
  const go = (left: number[], chosen: Comp[]) => {
    if (out.length > 200) return;
    if (!left.length) { out.push(chosen); return; }
    for (const c of comps) if (c.rings.includes(left[0]) && c.rings.every((r) => left.includes(r))) go(left.filter((r) => !c.rings.includes(r)), [...chosen, c]);
  };
  go(rings, []);
  return out;
}

// The components as a tree from the base: each fused to exactly one component nearer the base. Undefined if the
// components are fused in a ring (peri-fused components) or not all reached.
function treeOf(base: Comp, comps: Comp[], fusedTo: (x: Comp, y: Comp) => boolean): Node | undefined {
  const all = [base, ...comps];
  let edges = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (fusedTo(all[i], all[j])) edges++;
  if (edges !== all.length - 1) return undefined;
  const root: Node = { c: base, kids: [], order: 0 }, placed = new Set([base]), queue = [root];
  while (queue.length) {
    const n = queue.shift()!;
    for (const c of comps) if (!placed.has(c) && fusedTo(n.c, c)) { const k = { c, kids: [], order: n.order + 1 }; n.kids.push(k); placed.add(c); queue.push(k); }
  }
  return placed.size === all.length ? root : undefined;
}
const flat = (n: Node): Node[] => [n, ...n.kids.flatMap(flat)];

// FR-3.5: a benzo ring (a benzene component) fused to a heteromonocycle joins it as a benzo unit: its parent first, else
// its one child; not where benzo is multiplied (dibenzofuran). Then the most senior component is the base.
function benzoUnits(tree: Node, unit: (rings: number[]) => Comp | undefined, fusedTo: (x: Comp, y: Comp) => boolean): Node | undefined {
  const comps = flat(tree).map((n) => n.c), parentOf = new Map<Comp, Comp>();
  for (const n of flat(tree)) for (const k of n.kids) parentOf.set(k.c, n.c);
  const hetero1 = (c?: Comp) => !!c && c.rings.length === 1 && !c.carbo;
  let changed = false;
  for (const bz of comps.filter((c) => c.name === "benzene")) {
    const p = parentOf.get(bz)!, siblings = comps.filter((c) => c !== bz && c.name === "benzene" && parentOf.get(c) === p);
    if (siblings.length) continue;
    const kids = comps.filter((c) => parentOf.get(c) === bz && hetero1(c));
    const partner = hetero1(p) ? p : kids.length === 1 ? kids[0] : undefined;
    const u = partner && unit([partner.rings[0], bz.rings[0]]);
    if (!u || !comps.includes(partner!)) continue;
    comps.splice(comps.indexOf(bz), 1, u);
    comps.splice(comps.indexOf(partner!), 1);
    changed = true;
  }
  if (!changed) return tree;
  const base = comps.reduce((m, c) => (cmp(c.key, m.key) < 0 ? c : m));
  if (comps.some((c) => c !== base && !cmp(c.key, base.key) && c.name !== base.name)) return undefined;
  return treeOf(base, comps.filter((c) => c !== base), fusedTo);
}

// Base letters: a is the side 1-2, b 2-3 ... (FR-4.1).
const letter = (i: number) => String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : "");
const values = (l: string[]) => l.map(locValue);
const primes = (l: string[], k: number) => l.map((x) => x + "'".repeat(k));
// The bonds of x's rings shared with y's rings.
const contactOf = (sys: RingSystem, x: Comp, y: Comp) => x.rings.flatMap((r) => sys.rings[r].flatMap((a, k): [number, number][] =>
  (y.rings.includes(sys.across[r][k]) ? [[a, sys.rings[r][(k + 1) % sys.rings[r].length]]] : [])));
// The sides of a component (in one numbering) along which bonds run: consecutive, perhaps across the end (mna); the
// shared atoms in the direction of the sides.
function run(c: Comp, m: number[], bonds: [number, number][]) {
  const at = c.peri.map((i) => m[i]), P = at.length;
  const sides = bonds.map(([a, b]) => at.findIndex((x, i) => (x === a && at[(i + 1) % P] === b) || (x === b && at[(i + 1) % P] === a)));
  if (sides.some((s) => s < 0)) return undefined;
  const start = sides.find((s) => !sides.includes((s + P - 1) % P));
  if (start === undefined) return undefined;
  const r = sides.map((_, i) => (start + i) % P);
  if (r.some((s) => !sides.includes(s))) return undefined;
  return { sides: r, atoms: [...r.map((s) => at[s]), at[(r[r.length - 1] + 1) % P]] };
}
// A component's locants for shared atoms (fusion carbon atoms between the ends left out, FR-4.6.2).
function locsOf(c: Comp, m: number[], atoms: number[]) {
  const idx = atoms.map((a) => m.indexOf(a));
  return idx.some((i) => i < 0) ? undefined : idx.filter((i, k) => k === 0 || k === idx.length - 1 || !/[a-z]$/.test(c.labels[i])).map((i) => c.labels[i]);
}

// A multi-parent name (FR-6.1): two or more locations of the parent component fused to one interparent component, and
// nothing else: benzo[1,2-b:4,5-b']dithiophene. Letters as low as possible, then the interparent locants.
function multiParent(sys: RingSystem, bases: Comp[], all: Comp[], fusedTo: (x: Comp, y: Comp) => boolean): string | undefined {
  if (bases.length < 2) return undefined;
  for (const mid of all) {
    if (!mid.prefix || mid.name === bases[0].name) continue;
    const parents = bases.filter((b) => !b.rings.some((r) => mid.rings.includes(r)) && fusedTo(b, mid));
    if (parents.length < 2 || parents.some((p, i) => parents.some((q, j) => i !== j && (p.rings.some((r) => q.rings.includes(r)) || fusedTo(p, q))))) continue;
    if (mid.rings.length + parents.reduce((t, p) => t + p.rings.length, 0) !== sys.rings.length) continue;
    let best: { key: number[]; name: string } | undefined;
    for (const m of mid.nums) {
      const parts: { letter: number; locs: string[] }[] = [];
      for (const p of parents) {
        let pick: { letter: number; locs: string[] } | undefined;
        for (const pm of p.nums) {
          const r = run(p, pm, contactOf(sys, p, mid));
          const locs = r && r.sides.length === 1 ? locsOf(mid, m, r.atoms) : undefined;
          if (locs && (!pick || r!.sides[0] < pick.letter || (r!.sides[0] === pick.letter && cmp(values(locs), values(pick.locs)) < 0))) pick = { letter: r!.sides[0], locs };
        }
        if (!pick) return undefined;
        parts.push(pick);
      }
      parts.sort((x, y) => cmp(values(x.locs).sort((a, b) => a - b), values(y.locs).sort((a, b) => a - b)));
      const key = [...parts.map((x) => x.letter).sort((a, b) => a - b), -1, ...parts.map((x) => x.letter), -1, ...parts.flatMap((x) => values(x.locs))];
      if (best && cmp(key, best.key) >= 0) continue;
      // A hydrocarbon parent needs no letters: benzo[1,2:4,5]di[7]annulene.
      const base = bases[0].name, mult = /^\[\d+\]annulene|^[a-z]/.test(base) ? MULT[parts.length] : ["", "", "bis", "tris", "tetrakis"][parts.length];
      best = { key, name: `${mid.prefix}[${parts.map((x, i) => x.locs.join(",") + (bases[0].carbo ? "" : `-${letter(x.letter)}${"'".repeat(i)}`)).join(":")}]${mult}${inFusion(base)}` };
    }
    if (best) return best.name;
  }
  return undefined;
}

// The fusion descriptors (FR-4.3 to FR-4.9) and the name: attached prefixes in alphabetical order, each after its own
// higher-order prefixes, then the base. Base letters as low as possible (as a set, then in order of citation), then
// first-order locants, then the locants of lower-order components for higher-order fusion, then higher-order locants.
function describe(sys: RingSystem, root: Node): { key: number[]; name: string } | undefined {
  const contact = (x: Comp, y: Comp) => contactOf(sys, x, y);
  type Text = { text: string; key: number[][] }; // key: [first-order locants, lower-order locants, higher-order locants]
  // A component's prefix with its descriptor and its own higher-order prefixes, in its best numbering; `atoms` are the
  // atoms it shares with its parent, in the order the parent cites them; `cite` the parent's text for them.
  const branch = (n: Node, atoms: number[], cite: string): Text | undefined => {
    let best: Text | undefined;
    for (const m of n.c.nums) {
      const own = n.c.carbo && !n.kids.length && n.order > 1 ? [] : locsOf(n.c, m, atoms);
      if (!own) return undefined;
      const kids = twigs(n, m);
      if (!kids) continue;
      const desc = n.order === 1 ? (own.length && !(n.c.carbo && !n.kids.length) ? `[${own.join(",")}-${cite}]` : `[${cite}]`)
        : n.c.carbo && !n.kids.length ? `[${cite}]` : `[${primes(own, n.order - 1).join(",")}:${cite}]`;
      const key: number[][] = [[], [], []];
      key[n.order === 1 ? 0 : 2].push(...values(own).sort((a, b) => a - b), ...values(own));
      kids.key.forEach((l, i) => key[i].push(...l));
      const t = { text: kids.text + n.c.prefix + desc, key };
      if (!best || cmp(t.key.flat(), best.key.flat()) < 0) best = t;
    }
    return best;
  };
  // The higher-order prefixes on a component in one numbering, in alphabetical order.
  const twigs = (n: Node, m: number[]): Text | undefined => {
    const parts: Text[] = [], lower: number[] = [];
    for (const k of n.kids) {
      const r = run(n.c, m, contact(n.c, k.c));
      if (!r) return undefined;
      // The lower-order component's locants, as low as possible in order of citation.
      let atoms = r.atoms, mine = locsOf(n.c, m, atoms)!;
      if (cmp(values([...mine].reverse()), values(mine)) < 0) { atoms = [...atoms].reverse(); mine = [...mine].reverse(); }
      const t = branch(k, atoms, primes(mine, n.order - 1).join(","));
      if (!t) return undefined;
      lower.push(...values(mine));
      parts.push(t);
    }
    if (new Set(n.kids.map((k) => k.c.prefix)).size < n.kids.length) return undefined; // multiplied higher-order components
    parts.sort((x, y) => alpha(x.text).localeCompare(alpha(y.text)) || x.text.localeCompare(y.text));
    const key: number[][] = [[], [...lower].sort((a, b) => a - b).concat(lower), []];
    for (const p of parts) p.key.forEach((l, i) => key[i].push(...l));
    return { text: parts.map((p) => p.text).join(""), key };
  };
  // Alphabetical order of prefixes: without fusion descriptors and heteroatom locants, a group as one unit (FR-3.6).
  const alpha = (t: string) => t.replace(/\[[^\]]*\]/g, "").replace(/^\(|\)/g, "").replace(/^(as|s)-/, "");
  const base = root.c;
  let best: { key: number[]; name: string } | undefined;
  for (const m of base.nums) {
    // First-order components: base sides as letters.
    const firsts: { n: Node; letters: string; sides: number[]; t: Text; locs: string[] }[] = [];
    for (const n of root.kids) {
      const r = run(base, m, contact(n.c, base));
      if (!r) return undefined;
      const letters = r.sides.map(letter).join("");
      const t = branch(n, r.atoms, letters);
      if (!t) return undefined;
      firsts.push({ n, letters, sides: r.sides, t, locs: [] });
    }
    // Citation order: alphabetical (FR-3.6), identical first-order prefixes together and multiplied (FR-4.9).
    firsts.sort((x, y) => alpha(x.t.text).localeCompare(alpha(y.t.text)) || cmp(x.sides, y.sides));
    const key = [...firsts.flatMap((f) => f.sides).sort((a, b) => a - b), -1, ...firsts.flatMap((f) => f.sides), -1,
      ...[0, 1, 2].flatMap((i) => [...firsts.flatMap((f) => f.t.key[i]), -1])];
    if (best && cmp(key, best.key) >= 0) continue;
    // A carbocyclic monocyclic base with one attached component needs no letters (5H-benzo[7]annulene).
    const bare = base.carbo && base.rings.length === 1 && firsts.length === 1 && !firsts[0].n.kids.length;
    let text = "";
    for (let i = 0; i < firsts.length; ) {
      const f = firsts[i], group = firsts.filter((g) => !g.n.kids.length && !f.n.kids.length && g.n.c.prefix === f.n.c.prefix);
      if (group.length < 2) { text += bare ? f.n.c.prefix : f.t.text; i++; continue; }
      // dibenzo[b,d]furan; difuro[3,2-b:2',3'-d]pyridine.
      const list = group.map((g, k) => g.t.text.slice(g.n.c.prefix.length + 1, -1).replace(/^([^-]*)-/, (_, l: string) => primes(l.split(","), k).join(",") + "-"));
      const mult = /^(\[|di|tri)/.test(f.n.c.prefix) ? ["", "", "bis", "tris", "tetrakis"][group.length] : MULT[group.length];
      // A prefix in brackets needs no more: bis[1,3]dioxolo[4,5-b:4',5'-d]pyran (OPSIN reads no bis([1,3]dioxolo)).
      text += `${/s$/.test(mult) && !f.n.c.prefix.startsWith("[") ? `${mult}(${f.n.c.prefix})` : mult + f.n.c.prefix}[${list.join(group.some((g) => /-/.test(g.t.text)) ? ":" : ",")}]`;
      i += group.length;
    }
    best = { key, name: text + inFusion(base.name) };
  }
  return best;
}
// A parent name with locants in front is bracketed inside a fusion name: pyrazino[2,3-f][1,10]phenanthroline.
const inFusion = (name: string) => name.replace(/^([\d,]+)-/, "[$1]");

// Retained parents that are not ortho- or peri-fused, named only as a whole (P-25.2.1): porphyrin, whose parent has
// two indicated hydrogens (21H,23H-porphyrin), and corrin (P-101), a parent with no mancude form: its saturated atoms
// are listed, and a structure is corrin only where those atoms have no ring double bond. Phthalocyanine and corrole
// are retained by the IUPAC tetrapyrrole recommendations (TP-1.6 Fig. 4, TP-5.3 Fig. 11; the Red Book's Table VII has
// phthalocyanine-29,31-diido) with the numbering of those figures. Their names imply hydrogen on the interior N atoms
// as porphyrin's do: 29H,31H-phthalocyanine and 21H,22H,23H-corrole (hydrogens). The fusion atoms of phthalocyanine,
// which the figure leaves unnumbered, take letters (FR-5.3): 4a, 7a. Corrole follows corrin, which takes its skeleton
// first where the saturation fits.
const WHOLE: [name: string, bonds: string, hetero: string, saturated?: string, hydrogens?: number][] = [
  ["porphyrin", "1-2 2-3 3-4 4-21 21-1 4-5 5-6 6-7 7-8 8-9 9-22 22-6 9-10 10-11 11-12 12-13 13-14 14-23 23-11 14-15 15-16 16-17 17-18 18-19 19-24 24-16 19-20 20-1", "N21 N22 N23 N24"],
  ["corrin", "1-2 2-3 3-4 4-21 21-1 4-5 5-6 6-7 7-8 8-9 9-22 22-6 9-10 10-11 11-12 12-13 13-14 14-23 23-11 14-15 15-16 16-17 17-18 18-19 19-24 24-16 19-1", "N21 N22 N23 N24", "1 2 3 7 8 12 13 17 18 19 24"],
  ["corrole", "1-2 2-3 3-4 4-21 21-1 4-5 5-6 6-7 7-8 8-9 9-22 22-6 9-10 10-11 11-12 12-13 13-14 14-23 23-11 14-15 15-16 16-17 17-18 18-19 19-24 24-16 19-1", "N21 N22 N23 N24", undefined, 3],
  ["phthalocyanine", "1-2 2-3 3-4 4-4a 4a-28a 28a-1 28-28a 4a-5 5-29 29-28 5-6 6-7 7-7a 7a-8 8-9 9-10 10-11 11-11a 11a-7a 11a-12 12-32 32-7 12-13 13-14 14-14a 14a-15 15-16 16-17 17-18 18-18a 18a-14a 18a-19 19-31 31-14 19-20 20-21 21-21a 21a-22 22-23 23-24 24-25 25-25a 25a-21a 25a-26 26-30 30-21 26-27 27-28",
    "N6 N13 N20 N27 N29 N30 N31 N32"],
];

// The parent name and numberings of a fused system outside the namer's table, for atoms of a molecule: the name, its
// locants in order, and each numbering (the molecule's atoms in locant order). `uncited` holds indices whose locants
// the rules leave open (interior atoms), which a name must not cite; `hydrogens` the parent's indicated hydrogens where
// fixed. A bridged fused system (FR-8) also gives its bridge prefixes: indicated hydrogen goes between them and the
// fused name (4,7-methano-1H-indene). `fixed` holds atoms that take no hydro prefixes (bridge atoms, spiro atoms and
// saturated monocyclic spiro components).
type Parent = { name: string; labels: string[]; nums: number[][]; uncited: number[]; hydrogens?: number; bridges?: string; fixed?: number[] };
export function fusedParent(atoms: number[], el: (a: number) => string, ring: (a: number) => number[], order?: (a: number, b: number) => number): Parent {
  const at = new Map(atoms.map((a, i) => [a, i]));
  const lel = atoms.map(el), ladj = atoms.map((a) => ring(a).map((b) => at.get(b)!));
  let p: Parent;
  try { p = whole(lel, ladj, order && ((a, b) => order(atoms[a], atoms[b]))) ?? ortho(lel, ladj); } catch (e) {
    if (!(e instanceof Error) || e.message !== "not ortho-fused" || !order) throw e;
    // A spiro atom (its removal splits the rings) makes a spiro system; else bridges.
    const ord = (a: number, b: number) => order(atoms[a], atoms[b]);
    p = ladj.some((x) => x.length === 4) ? (() => { try { return spiroParent(lel, ladj, ord); } catch (f) { if ((f as Error).message === "not ortho-fused") return bridgedFused(lel, ladj, ord); throw f; } })() : bridgedFused(lel, ladj, ord);
  }
  return { ...p, nums: p.nums.map((n) => n.map((i) => atoms[i])), fixed: p.fixed?.map((i) => atoms[i]) };
}

// Retained parents named only as a whole (porphyrin, corrin). Corrin needs the bond orders (order).
function whole(lel: string[], ladj: number[][], order?: (a: number, b: number) => number): Parent | undefined {
  for (const [name, bonds, hetero, saturated, hydrogens = 2] of WHOLE) {
    const pairs = bonds.split(" ").map((b) => b.split("-")), labels = [...new Set(pairs.flat())].sort(locOrder);
    if (labels.length !== lel.length || (saturated && !order)) continue;
    const tel = labels.map((l) => hetero.split(" ").find((h) => h.slice(1) === l)?.[0] ?? "C"), tadj: number[][] = labels.map(() => []);
    for (const [a, b] of pairs) { tadj[labels.indexOf(a)].push(labels.indexOf(b)); tadj[labels.indexOf(b)].push(labels.indexOf(a)); }
    let nums = isomorphisms(tel, tadj, lel.map((_, i) => i), (i) => lel[i], (i) => ladj[i]);
    if (!saturated) { if (nums.length) return { name, labels, nums, uncited: [], hydrogens }; continue; }
    // The parent's saturated atoms take no hydro prefixes; they must be the same atoms in every numbering left.
    const at = saturated.split(" ").map((l) => labels.indexOf(l)), fixed = (num: number[]) => at.map((k) => num[k]).sort((x, y) => x - y);
    nums = nums.filter((num) => at.every((k) => ladj[num[k]].every((b) => order!(num[k], b) === 1)));
    if (!nums.length) continue;
    if (nums.some((num) => fixed(num).join() !== fixed(nums[0]).join())) throw new Error("corrin numbering");
    return { name, labels, nums, uncited: [], fixed: fixed(nums[0]) };
  }
  return undefined;
}

// An ortho- or ortho- and peri-fused system (local atom indices): a retained name with its own numbering, or a fusion
// name numbered by FR-5. Fusion names need two rings of five or more members (P-25.0); else von Baeyer names.
function ortho(lel: string[], ladj: number[][]): Parent {
  const sys = ringSystem(lel, ladj);
  if (sys.rings.filter((r) => r.length >= 5).length < 2) throw new Error("small fused rings");
  const inner = (labels: string[], n: number) => (n > 1 ? labels.map((_, i) => i).slice(labels.length - n) : []);
  for (const t of retained()) {
    if (t.el.length !== lel.length || t.rings !== sys.rings.length) continue;
    const nums = isomorphisms(t.el, t.adj, lel.map((_, i) => i), (i) => lel[i], (i) => ladj[i]);
    if (nums.length) return { name: t.name, labels: t.labels, nums, uncited: t.given ? [] : inner(t.labels, t.labels.length - t.peri.length) };
  }
  const num = numberSystem(sys);
  return { name: fusionName(sys, num[0]), labels: num[0].labels, nums: num.map((n) => n.path), uncited: inner(num[0].labels, num[0].interior.length) };
}

// Bridges (FR-8, P-25.4.2.1.4) as OPSIN reads them, by their atoms from the bridgehead cited first: alkano bridges by
// length, and these. Composite names are in parentheses.
const BRIDGES: Record<string, string> = {
  "C=C": "etheno", "C=CC": "prop[1]eno", "C=CCC": "but[1]eno", "CC=CC": "but[2]eno", "C=CC=C": "buta[1,3]dieno",
  O: "epoxy", OO: "epidioxy", S: "epithio", SS: "epidithio", N: "epimino", "N=N": "diazeno",
  OC: "(epoxymethano)", NCC: "(epiminoethano)", CCNC: "(ethanoiminomethano)", CNCC: "[2]azabutano",
};
const ALKANO = ["", "methano", "ethano", "propano", "butano", "pentano", "hexano"];

// A bridged fused system (FR-8): bridges are chains of atoms (each with two ring bonds) between two atoms of an ortho-
// or peri-fused system. The fused system has the most rings, then the most atoms, then the fewest heteroatoms, then is
// the senior (FR-8.2 a to d); then the fewest composite bridges, then the lowest bridgehead locants (FR-8.2 e, i).
// Bridge atoms are numbered after the fused system's highest number, bridge by bridge from the one on the highest
// numbered bridgehead, each from its end nearer that bridgehead (FR-8.6).
function bridgedFused(el: string[], adj: number[][], order: (a: number, b: number) => number): Parent {
  const n = el.length, deg = adj.map((a) => a.length);
  const chains: { ends: [number, number]; inner: number[] }[] = [], seen = new Set<string>();
  for (let u = 0; u < n; u++) if (deg[u] > 2) for (const first of adj[u]) {
    if (deg[first] !== 2) continue;
    const inner: number[] = [];
    let prev = u, cur = first;
    while (deg[cur] === 2 && inner.length <= n) { inner.push(cur); const next = adj[cur].find((x) => x !== prev)!; prev = cur; cur = next; }
    const k = [...inner].sort((a, b) => a - b).join();
    if (cur === u || seen.has(k)) continue;
    seen.add(k);
    chains.push({ ends: [u, cur], inner });
  }
  if (chains.length > 24) throw new Error("bridged fused ring");
  type Pick = { score: number[]; parent: Parent };
  let best: Pick | undefined;
  const subsets = (from: number, m: number): number[][] => (!m ? [[]] : chains.slice(from).flatMap((_, i) => subsets(from + i + 1, m - 1).map((r) => [from + i, ...r])));
  for (let m = 1; m <= 3 && !best; m++) for (const set of subsets(0, m)) {
    const gone = new Set(set.flatMap((c) => chains[c].inner)), keep = [...Array(n).keys()].filter((a) => !gone.has(a));
    const at = new Map(keep.map((a, i) => [a, i]));
    const fel = keep.map((a) => el[a]), fadj = keep.map((a) => adj[a].filter((b) => at.has(b)).map((b) => at.get(b)!));
    if (fadj.some((x) => x.length < 2)) continue;
    let f: Parent;
    try { f = whole(fel, fadj) ?? ortho(fel, fadj); } catch { continue; }
    // The bridges: names, and the bridgehead cited first (the one the bridge's first atom is on).
    const bridges: { name: string; first: number; second: number; atoms: number[]; sym: boolean }[] = [];
    for (const c of set.map((i) => chains[i])) {
      const [u, v] = c.ends, path = [u, ...c.inner, v];
      if (order(u, c.inner[0]) !== 1 || order(c.inner[c.inner.length - 1], v) !== 1) { bridges.length = 0; break; }
      const text = (p: number[]) => p.slice(1, -1).map((a, i) => (i && order(p[i], a) === 2 ? "=" : "") + el[a]).join("");
      const named = (t: string) => BRIDGES[t] ?? (/^C+$/.test(t) ? ALKANO[t.length] : undefined);
      const fwd = named(text(path)), back = named(text([...path].reverse())), sym = text(path) === text([...path].reverse());
      if (fwd) bridges.push({ name: fwd, first: u, second: v, atoms: c.inner, sym });
      else if (back) bridges.push({ name: back, first: v, second: u, atoms: [...c.inner].reverse(), sym });
      else { bridges.length = 0; break; }
    }
    // A bridge on an interior atom whose locant the rules leave open cannot be cited.
    if (!bridges.length || bridges.some((b) => f.nums.some((num) => [b.first, b.second].some((a) => f.uncited.includes(num.indexOf(at.get(a)!)))))) continue;
    // Numberings of the fused system with the lowest bridgehead locants (FR-8.2 i).
    const value = (num: number[], a: number) => locValue(f.labels[num.indexOf(at.get(a)!)]);
    const heads = (num: number[]) => bridges.flatMap((b) => [value(num, b.first), value(num, b.second)]).sort((x, y) => x - y);
    const low = f.nums.reduce((m, num) => (cmp(heads(num), m) < 0 ? heads(num) : m), heads(f.nums[0]));
    const nums = f.nums.filter((num) => !cmp(heads(num), low));
    const sizes = ringSystem(fel, fadj).rings.map((r) => r.length).sort((x, y) => y - x);
    const keyOf = seniority(f.nums[0].map((i) => fel[i]), f.labels, sizes, f.nums[0].map((i) => fadj[i].length === 3));
    const score = [-keep.length, keep.filter((a) => el[a] !== "C").length, ...keyOf, bridges.filter((b) => /^\(/.test(b.name)).length, ...low];
    if (best && cmp(score, best.score) >= 0) continue;
    // Bridge atom locants (OPSIN's reading of FR-8.6), then the name: bridges in alphabetical order, identical ones
    // multiplied (1,4:5,8-dimethanonaphthalene).
    const top = Math.max(...f.labels.filter((l) => /^\d+$/.test(l)).map(Number));
    const all = nums.map((num) => {
      const lab = (a: number) => f.labels[num.indexOf(at.get(a)!)];
      // A symmetric bridge is cited from its lower bridgehead; bridges in alphabetical order, then by locants.
      const flip = (b: (typeof bridges)[number]) => ({ ...b, first: b.second, second: b.first, atoms: [...b.atoms].reverse() });
      const alpha = (t: string) => t.replace(/[()[\]\d,]/g, "");
      const cited = bridges.map((b) => (!b.sym || locValue(lab(b.first)) <= locValue(lab(b.second)) ? b : flip(b)))
        .sort((x, y) => alpha(x.name).localeCompare(alpha(y.name)) || locValue(lab(x.first)) - locValue(lab(y.first)));
      const high = (b: (typeof bridges)[number]) => Math.max(parseInt(lab(b.first)), parseInt(lab(b.second)));
      let next = top;
      const extra: number[] = [], labels: string[] = [];
      for (const b of [...cited].sort((x, y) => high(y) - high(x))) {
        for (const a of parseInt(lab(b.first)) <= parseInt(lab(b.second)) ? [...b.atoms].reverse() : b.atoms) { extra.push(a); labels.push(String(++next)); }
      }
      const groups = new Map<string, string[]>();
      for (const b of cited) groups.set(b.name, [...(groups.get(b.name) ?? []), `${lab(b.first)},${lab(b.second)}`]);
      const text = [...groups].map(([name, locs]) => `${locs.join(":")}-${locs.length > 1 ? (/^[([]/.test(name) ? ["", "", "bis", "tris"][locs.length] : MULT[locs.length]) : ""}${name}`).join("-");
      return { order: [...num.map((i) => keep[i]), ...extra], labels: [...f.labels, ...labels], text, key: cited.flatMap((b) => [locValue(lab(b.first)), locValue(lab(b.second))]) };
    });
    // The bridges' locants in order of citation as low as possible; the numberings left give the same name.
    const lowest = all.reduce((m, x) => (cmp(x.key, m) < 0 ? x.key : m), all[0].key), full = all.filter((x) => !cmp(x.key, lowest));
    if (full.some((x) => x.text !== full[0].text)) continue;
    best = { score, parent: { name: f.name, labels: full[0].labels, nums: full.map((x) => x.order), uncited: f.uncited, hydrogens: f.hydrogens, bridges: full[0].text, fixed: [...gone] } };
  }
  if (!best) throw new Error("not ortho-fused");
  return best.parent;
}

// Saturated monocycles as spiro components (P-24.5, P-22.2.2): cyclohexane, piperidine, 1,3-dioxolane, azetidine.
const ALKANE = ["", "", "", "prop", "but", "pent", "hex", "hept", "oct", "non", "dec", "undec", "dodec"];
const SATURATED: Record<string, string> = { "5:N1": "pyrrolidine", "5:N1,N2": "pyrazolidine", "5:N1,N3": "imidazolidine", "6:N1": "piperidine",
  "6:N1,N4": "piperazine", "6:O1,N4": "morpholine" };
function saturatedRing(els: string[]): { name: string; nums: number[][] } | undefined {
  const n = els.length;
  if (!els.some((e) => e !== "C")) {
    const nums: number[][] = [];
    for (let s = 0; s < n; s++) for (const d of [1, -1]) nums.push(els.map((_, k) => (s + d * k + 2 * n) % n));
    return ALKANE[n] ? { name: `cyclo${ALKANE[n]}ane`, nums } : undefined;
  }
  const m = monocycle(els);
  if (!m) return undefined;
  const hetero = m.nums[0].flatMap((a, k): [string, number][] => (els[a] !== "C" ? [[els[a], k + 1]] : []))
    .sort((x, y) => HW_ORDER.indexOf(x[0]) - HW_ORDER.indexOf(y[0]) || x[1] - y[1]);
  const known = SATURATED[`${n}:${hetero.map(([e, k]) => e + k).join(",")}`];
  if (known) return { name: known, nums: m.nums };
  const N = hetero.some(([e]) => e === "N");
  const six = ["O", "S", "Se", "Te", "Bi", "Hg"].includes(hetero[hetero.length - 1][0]) ? "ane" : "inane";
  const stems = ["", "", "", N ? "iridine" : "irane", N ? "etidine" : "etane", N ? "olidine" : "olane", six, "epane", "ocane", "onane", "ecane"];
  if (!stems[n]) return undefined;
  const stem = (HW_ORDER.filter((e) => hetero.some(([x]) => x === e)).map((e) => MULT[hetero.filter(([x]) => x === e).length] + HW_PREFIX[e]).join("") + stems[n]).replace(/a(?=[aeiou])/g, "");
  const unique = hetero.length >= n - 1 && new Set(hetero.map(([e]) => e)).size === 1;
  return { name: (hetero.length > 1 && !unique ? `${hetero.map(([, k]) => k).join(",")}-` : "") + stem, nums: m.nums };
}

// A monospiro system with at least one polycyclic component (P-24.5.1): spiro[cyclohexane-1,1'-indene],
// 9,9'-spirobi[fluorene]. Components in alphabetical order, each numbered as itself with the spiro atom as low as
// possible, the second primed. Saturated monocyclic components and the spiro atom take no hydro prefixes; ring double
// bonds in a monocyclic component are not covered.
function spiroParent(el: string[], adj: number[][], order: (a: number, b: number) => number): Parent {
  const n = el.length;
  const parts = (s: number) => {
    const out: number[][] = [];
    for (const start of adj[s]) {
      if (out.some((c) => c.includes(start))) continue;
      const c = [start];
      for (let i = 0; i < c.length; i++) for (const b of adj[c[i]]) if (b !== s && !c.includes(b)) c.push(b);
      out.push(c);
    }
    return out;
  };
  const spiro = [...Array(n).keys()].filter((a) => adj[a].length === 4 && parts(a).length === 2);
  if (spiro.length !== 1) throw new Error("not ortho-fused");
  const s = spiro[0];
  const comps = parts(s).map((c) => {
    const atoms = [s, ...c], at = new Map(atoms.map((a, i) => [a, i]));
    const cel = atoms.map((a) => el[a]), cadj = atoms.map((a) => adj[a].filter((b) => at.has(b)).map((b) => at.get(b)!));
    const bonds = cadj.reduce((t, x) => t + x.length, 0) / 2;
    let name: string, labels: string[], nums: number[][], uncited: string[] = [], mono = false;
    if (bonds === atoms.length) {
      // One ring: walk it, all single bonds.
      const cycle = [0];
      while (cycle.length < atoms.length) cycle.push(cadj[cycle[cycle.length - 1]].find((b) => !cycle.includes(b))!);
      const double = (x: number, y: number) => order(atoms[x], atoms[y]) === 2;
      labels = cycle.map((_, i) => String(i + 1)); mono = true;
      if (cycle.some((a, i) => double(a, cycle[(i + 1) % cycle.length]))) {
        // A carbocycle with double bonds, numbered from the spiro atom, double bonds as low as possible: cyclohexa-2,5-diene.
        if (cel.some((e) => e !== "C") || !ALKANE[cycle.length]) throw new Error("spiro ring double bond");
        const k = cycle.length, runs = [cycle, [cycle[0], ...cycle.slice(1).reverse()]];
        const enes = (r: number[]) => r.flatMap((a, i) => (double(a, r[(i + 1) % k]) ? [i + 1] : []));
        const lowest = runs.reduce((m, r) => (cmp(enes(r), m) < 0 ? enes(r) : m), enes(runs[0]));
        nums = runs.filter((r) => !cmp(enes(r), lowest)).map((r) => r.map((a) => atoms[a]));
        name = `cyclo${ALKANE[k]}${lowest.length > 1 ? "a" : ""}-${lowest.join(",")}-${MULT[lowest.length]}ene`;
      } else {
        const r = saturatedRing(cycle.map((a) => cel[a]));
        if (!r) throw new Error("spiro component");
        name = r.name; nums = r.nums.map((num) => num.map((k) => atoms[cycle[k]]));
      }
    } else {
      const f = whole(cel, cadj) ?? ortho(cel, cadj);
      name = f.name; labels = f.labels; nums = f.nums.map((num) => num.map((i) => atoms[i])); uncited = f.uncited.map((i) => f.labels[i]);
    }
    // The spiro atom as low as possible.
    const low = Math.min(...nums.map((num) => num.indexOf(s)));
    return { name, labels, nums: nums.filter((num) => num.indexOf(s) === low), uncited, mono, atoms };
  });
  if (comps.every((c) => c.mono)) throw new Error("not ortho-fused"); // two monocycles: von Baeyer spiro names
  const alpha = (t: string) => t.replace(/^[\d,]+-|\[[^\]]*\]/g, "").replace(/^\d+[a-z]?H-/, "");
  comps.sort((x, y) => alpha(x.name).localeCompare(alpha(y.name)) || x.name.localeCompare(y.name));
  const [A, B] = comps, same = A.name === B.name, spot = (c: typeof A) => c.labels[c.nums[0].indexOf(s)];
  const name = same ? `${spot(A)},${spot(A)}'-spirobi[${A.name}]` : `spiro[${A.name}-${spot(A)},${spot(B)}'-${B.name}]`;
  // Locants of the whole: 1 < 1' < 2 < 2a < 2a' (the spiro atom takes the unprimed one).
  const value = (l: string) => [locValue(l), (l.match(/'/g) ?? []).length];
  const all: { atoms: number[]; labels: string[] }[] = [];
  for (const [P, Q] of same ? [[A, B], [B, A]] : [[A, B]]) for (const mp of P.nums) for (const mq of Q.nums) {
    const entries = [...mp.map((a, i) => [a, P.labels[i]] as [number, string]), ...mq.flatMap((a, i): [number, string][] => (a === s ? [] : [[a, Q.labels[i] + "'"]]))];
    entries.sort((x, y) => cmp(value(x[1]), value(y[1])));
    all.push({ atoms: entries.map((e) => e[0]), labels: entries.map((e) => e[1]) });
  }
  const labels = all[0].labels;
  if (all.some((x) => x.labels.join() !== labels.join())) throw new Error("spiro numbering");
  const uncited = labels.map((l, i) => (A.uncited.includes(l) || B.uncited.map((u) => u + "'").includes(l) ? i : -1)).filter((i) => i >= 0);
  return { name, labels, nums: all.map((x) => x.atoms), uncited, fixed: [s, ...comps.filter((c) => c.mono).flatMap((c) => c.atoms)] };
}
