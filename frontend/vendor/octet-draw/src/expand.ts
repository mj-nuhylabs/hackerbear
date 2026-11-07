// Expand Generic Structure (ChemDraw's Structure menu): every structure a generic (Markush) structure stands for.
// Each site is enumerated, and every combination of sites makes one structure: an R label with an R-group definition
// takes each of its fragments, an anonymous alternative group each alternative, an element list each element, a
// variable attachment each of its atoms, and a wavy bond a wedge and a hash. At most MOST structures are made, as
// ChemDraw's command makes at most 500.
import { expandLabel, fragments, normalise, setLabel } from "./edit.ts";
import { altGroup, elementList, rgroupMembers, rNumber } from "./query.ts";
import type { Atom, Bond, Mol } from "./render.ts";

export const MOST = 500;
type P = [number, number];
// One site's choices, each a change to the structure.
type Choice = (m: Mol) => Mol;

// The structures that the generic structures among `atoms` stand for (the whole drawing's R-group definitions are
// used), each laid out at the origin, and how many combinations there are in all.
export function expandGeneric(drawing: Mol, atoms: number[]): { mols: Mol[]; total: number } {
  const frags = fragments(drawing), defs = rgroupMembers(drawing, frags);
  const members = new Set(defs.flatMap((d) => d.members.flat())), chosen = new Set(atoms);
  const scaffold = frags.filter((f) => f.some((i) => chosen.has(i)) && !f.some((i) => members.has(i)));
  // R-group fragments, each with its attaching atom first and its attachment marks left out.
  const groups = new Map<number, Fragment[]>();
  for (const d of defs) groups.set(rNumber(d.sh.rgroup!.name)!, d.members.map((f) => fragmentOf(drawing, f)).filter((g) => g.mol.atoms.length));
  const out: Mol[] = [];
  let total = 0;
  for (const f of scaffold) {
    const base = part(drawing, f);
    // The sites, in atom order: each a list of choices. Changes that remove or add atoms come last, so the atom
    // numbers of the other sites stay as they are.
    const sites: Choice[][] = [], late: Choice[][] = [];
    base.atoms.forEach((a, i) => {
      const r = rNumber(a.text), alts = altGroup(a.text ?? ""), list = elementList(a.text ?? "");
      if (r && groups.get(r)?.length) late.push(groups.get(r)!.map((g) => (m: Mol) => joinAt(m, i, g)));
      else if (alts) sites.push(alts.map((t) => (m: Mol) => setLabel(m, i, t)));
      else if (list && !list.not) sites.push(list.elements.map((e) => (m: Mol) => setLabel(m, i, e === "T" ? "H" : e)));
      else if (a.centre?.variable && a.centre.atoms.length) late.push(a.centre.atoms.map((j) => (m: Mol) => attachAt(m, i, j)));
    });
    base.bonds.forEach((b, k) => {
      if (b.type === 1 && b.display === "wavy") sites.push([1, 6].map((stereo) => (m: Mol) => ({ ...m, bonds: m.bonds.map((x, n) => (n === k ? { ...x, display: undefined, stereo } : x)) })));
    });
    // A structure with nothing to enumerate is not a generic structure: it is left out.
    if (!sites.length && !late.length) continue;
    const all = [...sites, ...late.reverse()], count = all.reduce((n, s) => n * s.length, 1);
    total += count;
    // Every combination, the first site changing slowest.
    const pick = all.map(() => 0);
    for (let n = 0; n < count && out.length < MOST; n++) {
      let m = base;
      // Late sites remove atoms: they go from the highest atom down, so earlier numbers stay right.
      all.forEach((s, k) => { m = s[pick[k]](m); });
      out.push(normalise(clean(m)));
      for (let k = all.length - 1; k >= 0; k--) { if (++pick[k] < all[k].length) break; pick[k] = 0; }
    }
  }
  return { mols: out, total };
}

// Some atoms of a drawing on their own, with their bonds and attachments renumbered.
function part(m: Mol, ids: number[]): Mol {
  const sorted = [...ids].sort((p, q) => p - q), map = new Map(sorted.map((i, k) => [i, k]));
  return {
    atoms: sorted.map((i) => { const a = m.atoms[i]; return a.centre ? { ...a, centre: { ...a.centre, atoms: a.centre.atoms.flatMap((j) => (map.has(j) ? [map.get(j)!] : [])) } } : { ...a }; }),
    bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] as [number, number] })),
  };
}
// An R-group fragment: its attaching atom first (the atom an attachment mark is on, or its first atom), marks left out,
// and the way from that atom to the rest of the structure: to its mark, else 120° from its one bond, so a chain
// joined on keeps its zigzag (unset: away from the middle of its bonds).
type Fragment = { mol: Mol; way?: P };
function fragmentOf(m: Mol, ids: number[]): Fragment {
  const p = part(m, ids), marks = new Set(p.atoms.flatMap((a, i) => (a.attach ? [i] : [])));
  const mark = [...marks][0], on = mark === undefined ? 0 : p.bonds.find((b) => b.atoms.includes(mark))?.atoms.find((i) => i !== mark) ?? 0;
  const order = [on, ...p.atoms.map((_, i) => i).filter((i) => i !== on && !marks.has(i))], map = new Map(order.map((i, k) => [i, k]));
  const at = (i: number): P => [p.atoms[i].location[0], p.atoms[i].location[1]], d = (i: number): P => [at(i)[0] - at(on)[0], at(i)[1] - at(on)[1]];
  const near = p.bonds.flatMap((b) => (b.atoms.includes(on) ? b.atoms.filter((i) => i !== on && !marks.has(i)) : []));
  const way: P | undefined = mark !== undefined && on !== mark ? d(mark) : near.length === 1 ? [d(near[0])[0] * -0.5 - d(near[0])[1] * 0.866, d(near[0])[0] * 0.866 + d(near[0])[1] * -0.5] : undefined;
  return { mol: { atoms: order.map((i) => p.atoms[i]), bonds: p.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] as [number, number] })) }, way };
}
// The R atom i becomes the fragment, joined where the R label was, its bond to the rest of the structure on its way.
const joinAt = (m: Mol, i: number, g: Fragment): Mol => expandLabel(m, i, { atoms: g.mol.atoms.map((a) => ({ ...a })), bonds: g.mol.bonds }, g.way);
// A variable attachment i on atom j: its substituents bond to j instead, moved to point out from the ring there.
function attachAt(m: Mol, i: number, j: number): Mol {
  const c = m.atoms[i], ring = c.centre!.atoms, at = (k: number): P => [m.atoms[k].location[0], m.atoms[k].location[1]];
  const mid: P = [ring.reduce((s, k) => s + at(k)[0], 0) / ring.length, ring.reduce((s, k) => s + at(k)[1], 0) / ring.length];
  const out: P = [at(j)[0] - mid[0], at(j)[1] - mid[1]], l = Math.hypot(...out) || 1, target: P = [at(j)[0] + out[0] / l, at(j)[1] + out[1] / l];
  const subs = m.bonds.filter((b) => b.atoms.includes(i)).map((b) => (b.atoms[0] === i ? b.atoms[1] : b.atoms[0]));
  // The substituent's atoms (everything joined to it but the attachment), moved so it sits a bond length out.
  const moved = new Set<number>(), stack = [...subs];
  while (stack.length) { const k = stack.pop()!; if (moved.has(k) || k === i) continue; moved.add(k); for (const b of m.bonds) if (b.atoms.includes(k)) stack.push(b.atoms[0] === k ? b.atoms[1] : b.atoms[0]); }
  const d: P = subs.length ? [target[0] - at(subs[0])[0], target[1] - at(subs[0])[1]] : [0, 0];
  const atoms: Atom[] = m.atoms.map((a, k) => (moved.has(k) ? { ...a, location: [a.location[0] + d[0], a.location[1] + d[1], a.location[2] ?? 0] } : a));
  const bonds: Bond[] = m.bonds.map((b) => (b.atoms.includes(i) ? { ...b, atoms: b.atoms.map((k) => (k === i ? j : k)) as [number, number] } : b));
  return { ...m, atoms: atoms.map((a, k) => (k === i ? { ...a, centre: undefined, gone: true } as Atom : a)), bonds };
}
// The atoms a choice took out (a variable attachment once used) removed, with the bonds renumbered.
function clean(m: Mol): Mol {
  const keep = m.atoms.map((a) => !(a as { gone?: boolean }).gone), map: number[] = [];
  let n = 0;
  keep.forEach((k, i) => { if (k) map[i] = n++; });
  if (n === m.atoms.length) return m;
  return { atoms: m.atoms.filter((_, i) => keep[i]).map((a) => (a.centre ? { ...a, centre: { ...a.centre, atoms: a.centre.atoms.filter((k) => keep[k]).map((k) => map[k]) } } : a)), bonds: m.bonds.filter((b) => keep[b.atoms[0]] && keep[b.atoms[1]]).map((b) => ({ ...b, atoms: [map[b.atoms[0]], map[b.atoms[1]]] as [number, number] })) };
}

// The structures laid out in rows of up to five, two bond lengths apart, as the new drawing ChemDraw makes.
export function layoutGrid(mols: Mol[]): Mol {
  const out: Mol = { atoms: [], bonds: [] };
  const sizes = mols.map((m) => { const xs = m.atoms.map((a) => a.location[0]), ys = m.atoms.map((a) => a.location[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; });
  const cw = Math.max(1, ...sizes.map((s) => s[0])) + 2, ch = Math.max(1, ...sizes.map((s) => s[1])) + 2, cols = Math.min(5, mols.length);
  mols.forEach((m, k) => {
    const x = (k % cols) * cw - ((cols - 1) * cw) / 2, y = -Math.floor(k / cols) * ch, base = out.atoms.length;
    out.atoms.push(...m.atoms.map((a) => ({ ...a, location: [a.location[0] + x, a.location[1] + y, a.location[2] ?? 0] as [number, number, number], ...(a.centre ? { centre: { ...a.centre, atoms: a.centre.atoms.map((i) => i + base) } } : {}) })));
    out.bonds.push(...m.bonds.map((b) => ({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] as [number, number] })));
  });
  return out;
}
