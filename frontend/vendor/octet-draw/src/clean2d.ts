// Clean Up Structure's geometry: a TypeScript port of Indigo's MoleculeCleaner2d (indigo-core/layout/src/
// molecule_cleaner_2d.cpp and graph/src/biconnected_decomposer.cpp, Indigo 1.46.0).
// Copyright (C) from 2009 to Present EPAM Systems. Licensed under the Apache License, Version 2.0
// (http://www.apache.org/licenses/LICENSE-2.0).
// Changed by Octet (2026): the same two passes and energy as Indigo's, with these changes. Each atom's energy gradient
// sums only the terms its move changes (Indigo sums the whole energy three times for each atom, so a round cost N^3),
// and atoms closer than a bond are found through a grid. The output is exact (Sam, 21 October 2026: a biphenyl came
// out a little bent): Indigo's gradient is a forward difference over 0.01 bond lengths, its angles come from a 12-term
// series for asin, and it stops at the first round that finds nothing lower, so its atoms stop up to 2% of a bond and
// 1° short of the lowest energy. Octet's gradient is a central difference over 1e-5 bond lengths, its angles are exact
// (atan2), and once the atoms move less than 1% of a bond a round, its steps follow conjugate gradients. A pass ends
// when every bond and angle is exact to about 1e-9, when a round lowers the energy by less than a part in 10^12, or
// when a round finds nothing lower. Each ring angle aims at the angle of a regular polygon the size of its ring
// (Indigo aims every one at 120°), so fused rings of 3 to 8 atoms (indane's five and six) come out regular.
//
// The first pass gives each bond its own block and turns ring angles towards their regular polygon's. The second keeps
// each ring as it is and spreads the bonds round each atom that joins two blocks. In both, the atoms are a linear
// (complex) function of a few base atoms, bonds are pulled to the median bond length, and atoms closer than a bond are
// pushed apart. Each round is a step along the gradient (or the conjugate direction), scaled to at most one bond length
// and halved up to 20 times to the lowest energy.

const ROUNDS = 1000, HALVINGS = 20;
const SHRINK = Array.from({ length: HALVINGS + 1 }, (_, i) => (i ? 0.5 ** (i - 1) : 0));
// The angle inside a regular polygon of s atoms; Indigo's 120° for a ring of more than 8 (a macrocycle).
const polygon = (s: number) => (s <= 8 ? Math.PI - (2 * Math.PI) / s : (2 * Math.PI) / 3);

// The biconnected blocks of a graph, each as a membership array, in the order Indigo's decomposer finds them.
function blocks(n: number, nei: number[][]): Uint8Array[] {
  const order = new Int32Array(n), low = new Int32Array(n), out: Uint8Array[] = [], edges: number[] = [];
  let cur = 0;
  for (let s = 0; s < n; s++) {
    if (order[s]) continue;
    const stack = [s];
    order[s] = low[s] = ++cur;
    while (stack.length) {
      const v = stack[stack.length - 1], u = stack.length > 1 ? stack[stack.length - 2] : -1;
      let pushed = false;
      for (const w of nei[v]) {
        if (!order[w]) { edges.push(v, w); stack.push(w); order[w] = low[w] = ++cur; pushed = true; break; }
        if (order[w] < order[v] && w !== u) { edges.push(v, w); if (low[v] > order[w]) low[v] = order[w]; }
      }
      if (pushed) continue;
      stack.pop();
      if (!stack.length) continue;
      const p = stack[stack.length - 1];
      if (low[v] < low[p]) low[p] = low[v];
      if (low[v] >= order[p]) {
        const comp = new Uint8Array(n);
        while (order[edges[edges.length - 2]] >= order[v]) { comp[edges.pop()!] = 1; comp[edges.pop()!] = 1; }
        comp[p] = comp[v] = 1;
        edges.length -= 2;
        out.push(comp);
      }
    }
  }
  return out;
}

// Atoms by square cells, for finding the atoms near each atom.
class Grid {
  head = new Int32Array(1);
  next: Int32Array;
  cx: Int32Array;
  cy: Int32Array;
  constructor(n: number) {
    let size = 1;
    while (size < 2 * n) size *= 2;
    this.head = new Int32Array(size);
    [this.next, this.cx, this.cy] = [new Int32Array(n), new Int32Array(n), new Int32Array(n)];
  }
  slot(x: number, y: number) { return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) & (this.head.length - 1); }
  fill(pos: Float64Array, n: number, cell: number) {
    this.head.fill(-1);
    for (let i = 0; i < n; i++) {
      const x = (this.cx[i] = Math.floor(pos[2 * i] / cell)), y = (this.cy[i] = Math.floor(pos[2 * i + 1] / cell)), h = this.slot(x, y);
      this.next[i] = this.head[h];
      this.head[h] = i;
    }
  }
  // The atoms in the 3 × 3 cells round atom i's cell, into `out`; returns how many.
  near(i: number, out: Int32Array) {
    let k = 0;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const x = this.cx[i] + dx, y = this.cy[i] + dy;
        for (let j = this.head[this.slot(x, y)]; j >= 0; j = this.next[j]) if (this.cx[j] === x && this.cy[j] === y) out[k++] = j;
      }
    return k;
  }
}

// One of Indigo's passes over a connected structure: `xy` (x, y for each atom) is moved in place. `external` picks the
// second pass. The pass stops after `rounds`, or once it has done `budget` work (counted below), so a drawing always
// comes out the same, however busy the computer is. `deadline` (a performance.now time) is a last resort for a
// structure the count misjudges: a pass that reaches it stops with the best step yet, and can then come out differently
// from run to run.
function pass(xy: Float64Array, bonds: readonly (readonly [number, number, number])[], external: boolean, budget: number, rounds: number, deadline: number) {
  const n = xy.length / 2, E = bonds.length, nei: number[][] = Array.from({ length: n }, () => []), neiE: number[][] = Array.from({ length: n }, () => []);
  bonds.forEach(([a, b], e) => { nei[a].push(b); neiE[a].push(e); nei[b].push(a); neiE[b].push(e); });
  if (xy.every((v) => v === 0)) return;

  // Blocks: each bond on its own in the first pass, biconnected blocks in the second.
  let inc: Uint8Array[] = external ? blocks(n, nei) : bonds.map(([a, b]) => { const c = new Uint8Array(n); c[a] = c[b] = 1; return c; });
  let trivial = external ? inc.map((c) => c.reduce((s, x) => s + x, 0) === 2) : inc.map(() => true);
  // An atom between a triple and a single bond, or two double bonds, is straight: its two blocks join. In a ring of up
  // to 8 atoms, where a straight alkyne does not fit, or in a lone ring, it stays bent, so the ring stays a regular
  // polygon (ChemDraw draws cyclooctyne so). An arylene-ethynylene macrocycle keeps its straight alkynes.
  const ringBlocks = external ? [] : blocks(n, nei);
  const bent = (v: number) => {
    const c = ringBlocks.find((c) => c[v] && c[nei[v][0]] && c[nei[v][1]]);
    if (!c) return false;
    if (c.reduce((s, x) => s + x, 0) === bonds.filter(([a, b]) => c[a] && c[b]).length) return true;
    // The shortest path between v's neighbours round the ring, not through v: 6 bonds or fewer is a ring of up to 8.
    let front = [nei[v][0]];
    const seen = new Set([v, nei[v][0]]);
    for (let d = 0; d < 6 && front.length; d++) {
      front = front.flatMap((u) => nei[u].filter((w) => c[w] && !seen.has(w) && seen.add(w)));
      if (seen.has(nei[v][1])) return true;
    }
    return false;
  };
  const straight = new Uint8Array(n), uniteTo: number[][] = inc.map(() => []), uniteWith = inc.map((_, c) => c);
  for (let v = 0; v < n; v++) {
    if (nei[v].length !== 2 || !inc.some((c, k) => c[v] && trivial[k]) || bonds[neiE[v][0]][2] + bonds[neiE[v][1]][2] !== 4 || bent(v)) continue;
    straight[v] = 1;
    let c1 = -1, c2 = -1;
    inc.forEach((c, k) => { if (c[v]) [c2, c1] = [c1, k]; });
    if (c2 >= 0) { uniteTo[c1].push(c2); uniteTo[c2].push(c1); }
  }
  for (let c = 0; c < inc.length; c++)
    if (uniteWith[c] === c && uniteTo[c].length === 1)
      for (let cc = c; ;) {
        let next = -1;
        for (const k of uniteTo[cc]) if (uniteWith[k] !== c) next = k;
        if (next < 0) break;
        uniteWith[(cc = next)] = c;
      }
  const lead = new Uint8Array(inc.length);
  uniteWith.forEach((c) => (lead[c] = 1));
  const kept = inc.map((_, c) => c).filter((c) => lead[c]), at = new Map(kept.map((c, k) => [c, k]));
  const merged = kept.map(() => new Uint8Array(n));
  inc.forEach((c, k) => { const m = merged[at.get(uniteWith[k])!]; for (let v = 0; v < n; v++) m[v] |= c[v]; });
  [inc, trivial] = [merged, kept.map((c) => trivial[c])];
  const C = inc.length;
  // One block is left as it is, unless it is one straight chain (2-butyne, a nitrile), which still needs straightening.
  if (C <= 1 && !straight.includes(1)) return;
  const art = new Uint8Array(n);
  for (let v = 0; v < n; v++) { let k = 0; for (const c of inc) k += c[v]; art[v] = k > 1 ? 1 : 0; }
  const validBase = (v: number) => art[v] || nei[v].length === 1;

  // Each atom as a sum of base atoms, each times a complex coefficient (rotation and scale).
  const base: number[] = [], coef: Map<number, [number, number]>[] = Array.from({ length: n }, () => new Map());
  const addCoef = (v: number, k: number, x: number, y: number) => { const c = coef[v].get(k); if (c) { c[0] += x; c[1] += y; } else coef[v].set(k, [x, y]); };
  const keys = (a: number, b: number) => new Set([...coef[a].keys(), ...coef[b].keys()]);
  const first = (test: (j: number) => unknown) => { for (let j = 0; j < n; j++) if (test(j)) return j; return -1; };
  const addBase = (v: number) => { base.push(v); addCoef(v, base.length - 1, 1, 0); };
  if (external) {
    const hasComp = new Uint8Array(C), block = new Uint8Array(n), list: number[] = [], defining: number[][] = inc.map(() => []);
    let index = 0;
    for (let c = 0; c < C; c++) {
      if (hasComp[c]) continue;
      let ver = first((j) => inc[c][j] && validBase(j));
      if (ver < 0) ver = first((j) => inc[c][j]);
      if (ver < 0) return;
      addBase(ver);
      block[ver] = hasComp[c] = 1;
      list.push(c);
      for (; index < list.length; index++) {
        const comp = inc[list[index]], dp = defining[list[index]];
        ver = first((j) => comp[j] && !block[j] && art[j]);
        if (ver < 0) ver = first((j) => comp[j] && !block[j] && validBase(j));
        if (ver < 0) ver = first((j) => comp[j] && !block[j]);
        if (ver < 0) ver = first((j) => comp[j] && validBase(j));
        if (ver < 0) return;
        addBase(ver);
        for (const b of base) if (comp[b]) dp.push(b);
        if (dp.length < 2) dp.push(first((j) => block[j] && comp[j]));
        const [d0, d1] = dp;
        for (let j = 0; j < n; j++) {
          if (!comp[j] || j === d0 || j === d1 || block[j] || d1 < 0) continue;
          const ux = xy[2 * d1] - xy[2 * d0], uy = xy[2 * d1 + 1] - xy[2 * d0 + 1], wx = xy[2 * j] - xy[2 * d0], wy = xy[2 * j + 1] - xy[2 * d0 + 1];
          const d2 = ux * ux + uy * uy, cx = (ux * wx + uy * wy) / d2, cy = (ux * wy - uy * wx) / d2;
          for (const k of keys(d0, d1)) {
            const [ax, ay] = coef[d1].get(k) ?? [0, 0], [bx, by] = coef[d0].get(k) ?? [0, 0];
            addCoef(j, k, cx * ax - cy * ay + (1 - cx) * bx + cy * by, cx * ay + cy * ax + (1 - cx) * by - cy * bx);
          }
        }
        for (let v = 0; v < n; v++)
          if (comp[v] && art[v]) for (let k = 0; k < C; k++) if (inc[k][v] && !hasComp[k]) { list.push(k); hasComp[k] = 1; }
        for (let v = 0; v < n; v++) if (comp[v]) block[v] = 1;
      }
    }
  } else {
    for (let v = 0; v < n; v++) if (validBase(v)) addBase(v);
    // The atoms inside a straight chain sit evenly along it.
    for (const comp of inc) {
      const start = first((v) => comp[v] && validBase(v));
      if (start < 0) continue;
      const chain = [start], seen = new Set(chain);
      for (let found = true; found; ) {
        found = false;
        for (const w of nei[chain[chain.length - 1]]) if (comp[w] && !seen.has(w)) { chain.push(w); seen.add(w); found = true; break; }
      }
      const [a, b] = [chain[0], chain[chain.length - 1]];
      for (let i = 1; i < chain.length - 1; i++) {
        const t = 1 - i / (chain.length - 1);
        for (const k of keys(a, b)) { const [ax, ay] = coef[a].get(k) ?? [0, 0], [bx, by] = coef[b].get(k) ?? [0, 0]; addCoef(chain[i], k, ax * t + bx * (1 - t), ay * t + by * (1 - t)); }
      }
    }
  }
  const baseIndex = new Int32Array(n).fill(-1);
  base.forEach((v, k) => (baseIndex[v] = k));
  const lens = bonds.map(([a, b]) => Math.hypot(xy[2 * a] - xy[2 * b], xy[2 * a + 1] - xy[2 * b + 1])).sort((p, q) => p - q);
  const T = lens.length % 2 ? lens[lens.length >> 1] : (lens[lens.length / 2] + lens[lens.length / 2 - 1]) / 2;
  if (!(T > 0)) return;
  const H = T * 1e-5; // the gradient's step
  // Pairs of atoms in one block (they are not pushed apart), and pairs in one biconnected block (ring angles).
  const pairsOf = (comps: Uint8Array[]) => {
    const same = new Uint8Array(n * n);
    for (const c of comps) {
      const m: number[] = [];
      c.forEach((x, v) => { if (x) m.push(v); });
      for (const i of m) for (const j of m) same[i * n + j] = 1;
    }
    return same;
  };
  const same = pairsOf(inc), ring = external ? undefined : pairsOf(ringBlocks);
  // The first pass's ring angles: at each joining atom, the neighbour pairs in one ring and not in one block.
  const angles: number[][] = Array.from({ length: n }, () => []);
  if (ring)
    for (let i = 0; i < n; i++)
      if (art[i]) for (let a = 0; a < nei[i].length; a++) for (let b = 0; b < a; b++) {
        const [v1, v2] = [nei[i][a], nei[i][b]];
        if (!same[v1 * n + v2] && ring[v1 * n + v2]) angles[i].push(v1, v2);
      }
  // Each ring angle's goal (unsigned, at most 180°): its regular polygon's. Where two rings fuse at an atom, the third
  // angle (between the atoms not shared) takes what is left of 360°; where a small ring fuses into a macrocycle (a
  // porphyrin's pyrroles), its two other angles share what is left. At a bridgehead, or an atom with more ring bonds,
  // every angle keeps Indigo's 120°.
  const goals: number[][] = angles.map(() => []);
  if (ring) {
    const seen = new Int32Array(n).fill(-1), queue = new Int32Array(n);
    let stamp = 0;
    // The atoms in the smallest ring through v1-i-v2: the shortest path from v1 to v2 that misses i, plus 2.
    const smallest = (i: number, v1: number, v2: number) => {
      const mark = stamp++;
      let head = 0, tail = 0, depth = 0;
      queue[tail++] = v1;
      seen[v1] = seen[i] = mark;
      for (let end = tail; head < tail && depth < 14; depth++, end = tail)
        for (; head < end; head++)
          for (const w of nei[queue[head]]) {
            if (w === v2) return depth + 3;
            if (seen[w] !== mark) { seen[w] = mark; queue[tail++] = w; }
          }
      return Infinity;
    };
    // The ring blocks with a bridgehead (or an atom with more ring bonds) keep Indigo's 120° throughout: a mix of goals
    // in one bridged system (morphine) only strains it more.
    const blockOf = (i: number, v: number) => ringBlocks.find((c) => c[i] && c[v])!, bridged = new Set<Uint8Array>();
    for (let i = 0; i < n; i++)
      for (let k = 0; k < angles[i].length; k += 2) {
        const [v1, v2] = [angles[i][k], angles[i][k + 1]], around = nei[i].filter((w) => ring[w * n + v1]);
        let goal = (2 * Math.PI) / 3;
        if (around.length === 2) goal = polygon(smallest(i, v1, v2));
        else {
          const w = around.find((x) => x !== v1 && x !== v2)!, own = smallest(i, v1, v2), [a, b] = [smallest(i, v1, w), smallest(i, v2, w)];
          // Fused: the largest ring of the three is the two smaller ones joined.
          const [p, q, r] = [own, a, b].sort((x, y) => x - y), left = 2 * Math.PI - polygon(p) - polygon(q);
          if (around.length === 3 && p <= 8 && r >= p + q - 2)
            goal = own === p ? polygon(p) : q > 8 || q === r ? Math.PI - polygon(p) / 2 : own === q ? polygon(q) : Math.min(left, 2 * Math.PI - left);
          else bridged.add(blockOf(i, v1));
        }
        goals[i].push(goal);
      }
    if (bridged.size)
      for (let i = 0; i < n; i++)
        for (let k = 0; k < angles[i].length; k += 2) if (bridged.has(blockOf(i, angles[i][k]))) goals[i][k >> 1] = (2 * Math.PI) / 3;
  }

  // Positions: the base atoms move freely, and every other atom follows its coefficients.
  const pos = Float64Array.from(xy), follow: number[] = [], terms: number[][] = [];
  for (let v = 0; v < n; v++) if (baseIndex[v] < 0) { follow.push(v); terms.push([...coef[v]].flatMap(([k, [x, y]]) => [base[k], x, y])); }
  const update = () => {
    for (let f = 0; f < follow.length; f++) {
      const t = terms[f];
      let x = 0, y = 0;
      for (let k = 0; k < t.length; k += 3) { const b = 2 * t[k]; x += t[k + 1] * pos[b] - t[k + 2] * pos[b + 1]; y += t[k + 1] * pos[b + 1] + t[k + 2] * pos[b]; }
      pos[2 * follow[f]] = x;
      pos[2 * follow[f] + 1] = y;
    }
  };

  // The energy's terms.
  const ea = Int32Array.from(bonds, (b) => b[0]), eb = Int32Array.from(bonds, (b) => b[1]);
  const edgeTerm = (e: number) => {
    const dx = pos[2 * ea[e]] - pos[2 * eb[e]], dy = pos[2 * ea[e] + 1] - pos[2 * eb[e] + 1], d = (Math.sqrt(dx * dx + dy * dy) - T) / T;
    return d * d;
  };
  const pairTerm = (i: number, j: number) => {
    const dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1], d2 = dx * dx + dy * dy;
    if (d2 >= T * T) return 0;
    const d = (Math.sqrt(d2) - T) / T;
    return d * d;
  };
  const sorted = new Float64Array(n + 1);
  const angleTerm = (i: number) => {
    const ix = pos[2 * i], iy = pos[2 * i + 1];
    let r = 0;
    if (external) {
      const deg = nei[i].length;
      if (deg === 2) {
        // The two turns between two bonds, smaller first.
        const [v, w] = nei[i], x1 = pos[2 * v] - ix, y1 = pos[2 * v + 1] - iy, x2 = pos[2 * w] - ix, y2 = pos[2 * w + 1] - iy;
        const d0 = Math.abs(Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2)), d1 = 2 * Math.PI - d0;
        return straight[i] ? (d0 - Math.PI) ** 2 + (d1 - Math.PI) ** 2 : (d0 - (2 * Math.PI) / 3) ** 2 + (d1 - (4 * Math.PI) / 3) ** 2;
      }
      for (let k = 0; k < deg; k++) {
        const v = nei[i][k], a = Math.atan2(pos[2 * v + 1] - iy, pos[2 * v] - ix);
        let q = k;
        for (; q > 0 && sorted[q - 1] > a; q--) sorted[q] = sorted[q - 1];
        sorted[q] = a;
      }
      sorted[deg] = sorted[0] + 2 * Math.PI;
      // Equal turns. (Indigo aims at 360° / (deg + 1): the same turns, but an energy that never reaches 0, so a pass
      // could not tell when it had finished.)
      const target = (2 * Math.PI) / deg;
      for (let k = 0; k < deg; k++) { const d = sorted[k + 1] - sorted[k] - target; r += d * d; }
      return r;
    }
    const a = angles[i], goal = goals[i];
    for (let k = 0; k < a.length; k += 2) {
      const x1 = pos[2 * a[k]] - ix, y1 = pos[2 * a[k] + 1] - iy, x2 = pos[2 * a[k + 1]] - ix, y2 = pos[2 * a[k + 1] + 1] - iy;
      const alpha = Math.atan2(x1 * y2 - y1 * x2, x1 * x2 + y1 * y2);
      const target = straight[i] ? (alpha > 0 ? Math.PI : -Math.PI) : alpha < 0 ? -goal[k >> 1] : goal[k >> 1];
      r += (alpha - target) ** 2;
    }
    return r;
  };
  const centres: number[] = [], centre = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (art[i] && (external || angles[i].length)) { centres.push(i); centre[i] = 1; }
  // The atoms (not in one block) that could come closer than a bond while each atom moves up to `by`: for atom i,
  // partners[starts[i]] to partners[starts[i + 1] - 1].
  const grid = new Grid(n), found = new Int32Array(n), starts = new Int32Array(n + 1);
  let partners = new Int32Array(16 * n);
  const collect = (by: number) => {
    const r = T + 2 * by;
    grid.fill(pos, n, r);
    let k = 0;
    for (let i = 0; i < n; i++) {
      starts[i] = k;
      const c = grid.near(i, found);
      if (k + c > partners.length) partners = Int32Array.from({ length: 2 * (k + c) }, (_, q) => partners[q] ?? 0);
      for (let q = 0; q < c; q++) {
        const j = found[q], dx = pos[2 * i] - pos[2 * j], dy = pos[2 * i + 1] - pos[2 * j + 1];
        if (j !== i && !same[i * n + j] && dx * dx + dy * dy < r * r) partners[k++] = j;
      }
    }
    starts[n] = k;
  };
  const energy = () => {
    let r = 0;
    for (let e = 0; e < E; e++) r += edgeTerm(e);
    for (let i = 0; i < n; i++) for (let q = starts[i]; q < starts[i + 1]; q++) if (partners[q] > i) r += pairTerm(i, partners[q]);
    for (const i of centres) r += angleTerm(i);
    return r;
  };

  // For each base atom: the atoms that move with it (and how far), and the bonds and angles they touch.
  const uniq = [...new Set(base)], moves = new Map<number, number[]>(uniq.map((v) => [v, [v, 1, 0]]));
  follow.forEach((v, f) => {
    const sum = new Map<number, [number, number]>(), t = terms[f];
    for (let k = 0; k < t.length; k += 3) { const s = sum.get(t[k]) ?? [0, 0]; s[0] += t[k + 1]; s[1] += t[k + 2]; sum.set(t[k], s); }
    for (const [b, [x, y]] of sum) if (x || y) moves.get(b)!.push(v, x, y);
  });
  let reach = 1;
  const touched = new Map(uniq.map((v) => {
    const m = moves.get(v)!, edges = new Set<number>(), around = new Set<number>();
    for (let k = 0; k < m.length; k += 3) {
      reach = Math.max(reach, Math.hypot(m[k + 1], m[k + 2]));
      const u = m[k];
      neiE[u].forEach((e) => edges.add(e));
      if (centre[u]) around.add(u);
      nei[u].forEach((w) => { if (centre[w]) around.add(w); });
    }
    return [v, { edges: [...edges], around: [...around] }];
  }));
  // The work, in energy terms worked out: each round's gradient (four shifts of each base atom's group, each summing
  // the bonds, angles and close pairs it touches), then each energy along its step (every atom, bond, angle and
  // following atom at 1.5 a term, every pair it checks at 0.5), and n² for the setup above. An angle of the second pass
  // at an atom of d bonds costs d + d²/4 (its bonds are sorted by angle). Fitted to the times of src/cleanup.check.ts's
  // and src/cleanup-geometry.check.ts's structures, a unit takes 6 to 13 ns on an M1 Pro.
  const angleCost = (i: number) => (external ? nei[i].length * (1 + nei[i].length / 4) : angles[i].length / 2);
  const shared = new Float64Array(n);
  let fixed = 2 * n, evalCost = n + E;
  for (const v of uniq) {
    const m = moves.get(v)!, { edges, around } = touched.get(v)!;
    fixed += 4 * (4 + m.length / 3 + edges.length + around.reduce((s, i) => s + angleCost(i), 0));
    for (let k = 0; k < m.length; k += 3) shared[m[k]] += 4;
  }
  for (const i of centres) evalCost += angleCost(i);
  for (const t of terms) evalCost += t.length / 3;
  const gradWork = () => {
    let r = fixed;
    for (let u = 0; u < n; u++) r += shared[u] * (starts[u + 1] - starts[u]);
    return r;
  };
  const mark = new Int32Array(n).fill(-1), saved = new Float64Array(2 * n);
  // The energy terms that moving base atom v's group changes.
  const local = (v: number) => {
    const m = moves.get(v)!, { edges, around } = touched.get(v)!;
    let r = 0;
    for (const e of edges) r += edgeTerm(e);
    for (const i of around) r += angleTerm(i);
    for (let k = 0; k < m.length; k += 3) {
      const u = m[k];
      for (let q = starts[u]; q < starts[u + 1]; q++) { const j = partners[q]; if (!(mark[j] >= 0 && mark[j] < k)) r += pairTerm(u, j); }
    }
    return r;
  };
  const diff = (v: number): [number, number] => {
    const m = moves.get(v)!;
    for (let k = 0; k < m.length; k += 3) { const u = m[k]; mark[u] = k; saved[2 * u] = pos[2 * u]; saved[2 * u + 1] = pos[2 * u + 1]; }
    const shift = (sx: number, sy: number) => {
      for (let k = 0; k < m.length; k += 3) {
        const u = m[k];
        pos[2 * u] = saved[2 * u] + (m[k + 1] * sx - m[k + 2] * sy) * H;
        pos[2 * u + 1] = saved[2 * u + 1] + (m[k + 1] * sy + m[k + 2] * sx) * H;
      }
      const r = local(v);
      for (let k = 0; k < m.length; k += 3) { const u = m[k]; pos[2 * u] = saved[2 * u]; pos[2 * u + 1] = saved[2 * u + 1]; }
      return r;
    };
    const dx = shift(1, 0) - shift(-1, 0), dy = shift(0, 1) - shift(0, -1);
    for (let k = 0; k < m.length; k += 3) mark[m[k]] = -1;
    return [dx / (2 * H), dy / (2 * H)];
  };

  const B = base.length, g = new Float64Array(2 * B), grads = new Float64Array(2 * n), start = new Float64Array(2 * n), energies = new Float64Array(HALVINGS + 1);
  const step = (by: number) => { for (let j = 0; j < B; j++) { const b = 2 * base[j]; pos[b] -= g[2 * j] * by; pos[b + 1] -= g[2 * j + 1] * by; } };
  // Once the atoms move less than 1% of a bond a round, each step follows conjugate gradients (Polak–Ribière), as plain
  // gradient steps creep along a long valley: the last round's gradient and direction. A conjugate step that finds
  // nothing lower starts again from the gradient. (Conjugate steps from the start can carry a tangled drawing, such as
  // a porphyrin with a pyrrole folded in, into a worse shape.)
  const last = new Float64Array(2 * B), dir = new Float64Array(2 * B);
  let lastLen = 0, settling = false;
  update();
  let work = n * n;
  for (let round = 0; round < rounds; round++) {
    collect(reach * H);
    work += gradWork();
    for (const v of uniq) [grads[2 * v], grads[2 * v + 1]] = diff(v);
    let len = 0, over = 0;
    base.forEach((v, j) => { g[2 * j] = grads[2 * v]; g[2 * j + 1] = grads[2 * v + 1]; len += g[2 * j] ** 2 + g[2 * j + 1] ** 2; over += g[2 * j] * last[2 * j] + g[2 * j + 1] * last[2 * j + 1]; });
    const beta = settling && lastLen ? Math.max(0, (len - over) / lastLen) : 0;
    let down = 0, size = 0;
    for (let j = 0; j < 2 * B; j++) { dir[j] = g[j] + beta * dir[j]; down += dir[j] * g[j]; }
    if (!(down > 0)) dir.set(g);
    last.set(g);
    lastLen = len;
    for (let j = 0; j < 2 * B; j++) size += dir[j] ** 2;
    const factor = Math.min(T / Math.sqrt(size), 1);
    if (!Number.isFinite(factor)) break;
    for (let j = 0; j < 2 * B; j++) g[j] = dir[j] * factor;
    // The longest step moves no atom further than `far`, so the pairs within T + 2 far are all the line search needs.
    start.set(pos);
    step(1);
    update();
    let far = 0;
    for (let v = 0; v < n; v++) far = Math.max(far, Math.hypot(pos[2 * v] - start[2 * v], pos[2 * v + 1] - start[2 * v + 1]));
    pos.set(start);
    collect(far * (1 + 1e-9));
    // A pass that has done its work (or reaches the deadline) stops its search with the best step yet.
    let tried = 0, best = 0;
    while (tried <= HALVINGS) {
      step(SHRINK[tried]);
      update();
      energies[tried] = energy();
      work += 1.5 * evalCost + 0.5 * starts[n];
      pos.set(start);
      if (energies[tried] < energies[best]) best = tried;
      if (++tried > 1 && (work > budget || performance.now() > deadline)) break;
    }
    if (!best) {
      if (!beta) break;
      [lastLen, round] = [0, round - 1];
      dir.fill(0);
      continue;
    }
    step(SHRINK[best]);
    update();
    if (far * SHRINK[best] < 0.01 * T) settling = true;
    // Finished: every bond and angle exact to about 1e-9, or the round lowered the energy by less than a part in 10^12
    // (a strained structure creeps on for ever).
    if (energies[best] < 1e-18 || energies[0] - energies[best] < 1e-12 * energies[0] || work > budget || performance.now() > deadline) break;
  }
  update();
  xy.set(pos);
}

// Indigo's clean-up of one connected structure: `points` are the atoms' x and y, `bonds` their atoms and orders (1 to
// 3). Each pass may do `work` (see pass) and `rounds`, and stops at `ms` whatever it has done. Returns the new points,
// or the points as they were if the clean-up fails.
export function clean2d(points: readonly (readonly number[])[], bonds: readonly { atoms: readonly [number, number]; order: number }[], work: number, ms: number, rounds = ROUNDS): [number, number][] {
  const xy = Float64Array.from(points.flatMap((p) => [p[0], p[1]]));
  const graph = bonds.map((b) => [b.atoms[0], b.atoms[1], b.order === 2 ? 2 : b.order >= 3 ? 3 : 1] as const);
  pass(xy, graph, false, work, rounds, performance.now() + ms);
  pass(xy, graph, true, work, rounds, performance.now() + ms);
  // A straight chain drawn with its ends on one point has no line to lie on, and its atoms would fall onto that point.
  const collapsed = graph.some(([a, b]) => xy[2 * a] === xy[2 * b] && xy[2 * a + 1] === xy[2 * b + 1]);
  if (collapsed || !xy.every(Number.isFinite)) return points.map((p) => [p[0], p[1]]);
  return points.map((_, i) => [xy[2 * i], xy[2 * i + 1]]);
}
