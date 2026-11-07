// Von Baeyer names for ring systems of three rings or more (IUPAC 2013, P-23.2; the 1999 von Baeyer recommendations).
// Clean room: written from the published rules. The namer (namer.ts) names bicyclic systems itself and asks here for
// the polycyclic systems that fusion nomenclature does not name: cages (pentacyclo[4.2.0.0²,⁵.0³,⁸.0⁴,⁷]octane, which
// is cubane), adamantene (tricyclo[3.3.1.1³,⁷]dec-1-ene) and scopolamine's 3-oxa-9-azatricyclo[3.3.1.0²,⁴]nonane.
//
// The main ring holds as many atoms as possible, then the main bridge as many as possible, then the main ring is
// divided as symmetrically as possible, then the superscripts are as low as possible (P-23.2.5.1). The main ring is
// numbered from a main bridgehead round its longer segment, then its shorter, then the main bridge from the end nearer
// atom 1. Secondary bridge atoms follow, bridge by bridge from the one on the highest-numbered bridgehead, each from its
// end nearer that bridgehead (as OPSIN numbers them). A bridge on a bridge (a dependent bridge) is not covered: such a
// system gets no name here.

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
const sup = (n: number) => [...String(n)].map((d) => SUP[Number(d)]).join("");
const MULT = ["", "", "bi", "tri", "tetra", "penta", "hexa", "hepta", "octa", "nona", "deca", "undeca", "dodeca"];

// The descriptor (tricyclo[3.3.1.1³,⁷]) and every numbering the rules allow (the atoms in locant order).
export type VonBaeyer = { prefix: string; nums: number[][] };

// The first point of difference.
function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function vonBaeyer(atoms: number[], ring: (a: number) => number[]): VonBaeyer {
  const n = atoms.length, at = new Map(atoms.map((a, i) => [a, i]));
  const adj = atoms.map((a) => ring(a).map((b) => at.get(b)!));
  const edges: [number, number][] = [], index = new Map<number, number>();
  const key = (i: number, j: number) => (i < j ? i * 4096 + j : j * 4096 + i);
  for (let i = 0; i < n; i++) for (const j of adj[i]) if (i < j) { index.set(key(i, j), edges.length); edges.push([i, j]); }
  const rings = edges.length - n + 1;
  if (rings < 3 || rings >= MULT.length || n > 60) throw new Error("von Baeyer size");

  // Every cycle is a sum of fundamental cycles (P-23.2.5.1.1 wants the longest): a spanning tree, then each edge
  // outside it with the tree path between its ends. 2^rings sums at most.
  const parent = Array(n).fill(-1), depth = Array(n).fill(-1), queue = [0];
  depth[0] = 0;
  for (let k = 0; k < queue.length; k++) for (const j of adj[queue[k]]) if (depth[j] < 0) { depth[j] = depth[queue[k]] + 1; parent[j] = queue[k]; queue.push(j); }
  if (queue.length !== n) throw new Error("von Baeyer size");
  const basis: bigint[] = [];
  edges.forEach(([i, j], e) => {
    if (parent[i] === j || parent[j] === i) return;
    let m = 1n << BigInt(e), a = i, b = j;
    while (a !== b) {
      if (depth[a] < depth[b]) [a, b] = [b, a];
      m ^= 1n << BigInt(index.get(key(a, parent[a]))!);
      a = parent[a];
    }
    basis.push(m);
  });
  let longest: number[][] = [], best = 0;
  for (let s = 1, m = 0n; s < 1 << rings; s++) {
    m ^= basis[Math.log2(s & -s)]; // Gray code: one basis cycle in or out at each step
    const es = edges.filter((_, e) => (m >> BigInt(e)) & 1n);
    if (es.length < best) continue;
    const nb = new Map<number, number[]>();
    for (const [i, j] of es) { nb.set(i, [...(nb.get(i) ?? []), j]); nb.set(j, [...(nb.get(j) ?? []), i]); }
    if ([...nb.values()].some((l) => l.length !== 2)) continue;
    const cycle = [es[0][0]];
    for (let prev = -1, cur = es[0][0]; ; ) { const next = nb.get(cur)!.find((x) => x !== prev)!; if (next === cycle[0]) break; cycle.push(next); prev = cur; cur = next; }
    if (cycle.length !== es.length) continue; // two cycles
    if (es.length > best) { best = es.length; longest = []; }
    longest.push(cycle);
  }

  // Main bridges for each main ring: paths between two of its atoms through atoms outside it, the longest (P-23.2.5.1.2),
  // then the most symmetric division (P-23.2.5.1.3).
  type Pick = { cycle: number[]; path: number[] };
  let picks: Pick[] = [], score = [-1, -1];
  let steps = 0;
  for (const cycle of longest) {
    const pos = new Map(cycle.map((a, k) => [a, k])), L = cycle.length;
    const inCycle = (i: number, j: number) => pos.has(i) && pos.has(j) && ((pos.get(i)! - pos.get(j)! + L) % L === 1 || (pos.get(j)! - pos.get(i)! + L) % L === 1);
    const walk = (path: number[]) => {
      if (++steps > 100000) throw new Error("von Baeyer size");
      const last = path[path.length - 1];
      for (const y of adj[last]) {
        if (path.includes(y) && y !== path[0]) continue;
        if (path.length === 1 && inCycle(last, y)) continue;
        if (pos.has(y)) {
          if (y === path[0] || (path.length === 1 && y < last)) continue; // a chord once, not twice
          const p = [...path, y], arc = (pos.get(y)! - pos.get(path[0])! + L) % L - 1, s = [p.length - 2, Math.min(arc, L - 2 - arc)];
          const c = cmp(s, score);
          if (c > 0) { score = s; picks = []; }
          if (c >= 0) picks.push({ cycle, path: p });
        } else walk([...path, y]);
      }
    };
    for (const u of cycle) walk([u]);
  }

  // Each main ring and main bridge, numbered each way the rules allow, with its secondary bridges.
  type Cand = { order: number[]; sups: number[]; cited: number[]; prefix: string };
  const cands: Cand[] = [];
  for (const { cycle, path } of picks) {
    const L = cycle.length, [u, v] = [path[0], path[path.length - 1]], inner = path.slice(1, -1);
    const built = new Set([...cycle, ...inner]), used = new Set<number>();
    for (let k = 0; k < L; k++) used.add(key(cycle[k], cycle[(k + 1) % L]));
    for (let k = 1; k < path.length; k++) used.add(key(path[k - 1], path[k]));
    // Secondary bridges: edges between built atoms, and chains of the other atoms, each atom with two ring bonds.
    const bridges: { ends: [number, number]; inner: number[] }[] = [];
    for (const [i, j] of edges) if (!used.has(key(i, j)) && built.has(i) && built.has(j)) bridges.push({ ends: [i, j], inner: [] });
    const seen = new Set<number>();
    for (let s = 0; s < n; s++) {
      if (built.has(s) || seen.has(s)) continue;
      if (adj[s].length !== 2) throw new Error("von Baeyer dependent bridge");
      // Walk out both ways to built atoms.
      const chain = [s];
      seen.add(s);
      const ends: number[] = [];
      for (const dir of adj[s]) {
        const part: number[] = [];
        let prev = s, cur = dir;
        while (!built.has(cur)) {
          if (adj[cur].length !== 2 || seen.has(cur)) throw new Error("von Baeyer dependent bridge");
          seen.add(cur); part.push(cur);
          const next = adj[cur].find((x) => x !== prev)!; prev = cur; cur = next;
        }
        ends.push(cur);
        if (ends.length === 1) chain.unshift(...part.reverse()); else chain.push(...part);
      }
      if (ends[0] === ends[1]) throw new Error("von Baeyer spiro");
      bridges.push({ ends: [ends[0], ends[1]], inner: chain });
    }
    if (bridges.length !== rings - 2) throw new Error("von Baeyer bridges");
    const arcs = (h: number) => {
      const k = cycle.indexOf(h), fwd: number[] = [], back: number[] = [];
      for (let i = 1; cycle[(k + i) % L] !== (h === u ? v : u); i++) fwd.push(cycle[(k + i) % L]);
      for (let i = 1; cycle[(k - i + L) % L] !== (h === u ? v : u); i++) back.push(cycle[(k - i + L) % L]);
      return [fwd, back];
    };
    for (const h1 of [u, v]) {
      const h2 = h1 === u ? v : u, [p, q] = arcs(h1), bridge = h1 === u ? inner : [...inner].reverse();
      for (const [long, short] of [[p, q], [q, p]]) {
        if (long.length < short.length) continue;
        const order = [h1, ...long, h2, ...[...short].reverse(), ...bridge];
        const loc = (a: number) => order.indexOf(a) + 1;
        const sec = bridges.map((b) => {
          const [x, y] = b.ends.map(loc), [lo, hi] = x < y ? [x, y] : [y, x];
          return { lo, hi, len: b.inner.length, atoms: x < y ? [...b.inner].reverse() : b.inner }; // from the end nearer the higher bridgehead
        });
        // Bridge atoms bridge by bridge: higher bridgehead first, then the higher lower one, then the longer bridge.
        const numbered = [...sec].sort((a, b) => b.hi - a.hi || b.lo - a.lo || b.len - a.len);
        const cited = [...sec].sort((a, b) => b.len - a.len || a.lo - b.lo || a.hi - b.hi);
        cands.push({
          order: [...order, ...numbered.flatMap((b) => b.atoms)],
          sups: sec.flatMap((b) => [b.lo, b.hi]).sort((a, b) => a - b),
          cited: cited.flatMap((b) => [b.lo, b.hi]),
          prefix: `${MULT[rings]}cyclo[${long.length}.${short.length}.${bridge.length}${cited.map((b) => `.${b.len}${sup(b.lo)},${sup(b.hi)}`).join("")}]`,
        });
      }
    }
  }
  // The lowest superscripts (P-23.2.5.1.4), as a set and then in order of citation.
  const low = cands.reduce((m, c) => (cmp(c.sups, m.sups) < 0 || (!cmp(c.sups, m.sups) && cmp(c.cited, m.cited) < 0) ? c : m), cands[0]);
  const chosen = cands.filter((c) => !cmp(c.sups, low.sups) && !cmp(c.cited, low.cited));
  if (chosen.some((c) => c.prefix !== low.prefix)) throw new Error("von Baeyer numbering");
  return { prefix: low.prefix, nums: chosen.map((c) => c.order.map((i) => atoms[i])) };
}
