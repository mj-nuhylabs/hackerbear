// Condensed formulas chemists write in text for a whole molecule: CH3CH2OH, PhCH2OH, Me3SiCl, PhB(OH)2, (CH3)3COH,
// CH3COOEt, HC≡CCH2OH, BnNH2. Read left to right with the units of an atom label (labels.ts): each atom takes the
// hydrogens written after it; an atom with one bond to spare (OH, CH3, Cl), a group (Ph, Me) or a bracket with one
// is a substituent of the atom before it, or of the atom after it when nothing comes before (Me3Si, (CH3)3C); any
// other atom joins the chain. An O or S after an atom can be a double-bonded branch (CO in a ketone, COO in an ester,
// SO2 in a sulfone), tried first. Bonds left short are made double or triple along the chain (CH3CN). The reading
// must use every valence exactly, so a molecular formula (C6H6, C2H6O) is not read: it has more than one structure.
import { ELEMENTS, GROUPS, units } from "./labels.ts";

// Valences, most first where an element has several (SO2 is a sulfone before it is anything else).
const VALENCE: Record<string, number[]> = {
  B: [3], C: [4], N: [3], O: [2], F: [1], Si: [4], P: [5, 3], S: [6, 4, 2], Cl: [1], Br: [1], I: [1], Se: [2], Ge: [4], Sn: [4],
  Li: [1], Na: [1], K: [1], Mg: [2], Zn: [2], Al: [3], Hg: [2],
};
// Groups a formula writes that have no single valence reading.
const SPECIAL: Record<string, string> = { NO2: "[N+](=O)[O-]", N3: "N=[N+]=[N-]" };
// Groups written as formulas: phenyl, ethyl and cyclohexyl. C3H7 and C4H9 have more than one structure and are not read.
const WRITTEN: [RegExp, string][] = [[/C6H5(?!\d)/g, "Ph"], [/C2H5(?!\d)/g, "Et"], [/C6H11(?!\d)/g, "Cy"]];

type Token = { t: "atom"; el: string; h: number } | { t: "group"; smiles: string } | { t: "bracket"; inner: Token[]; text: string } | { t: "bond"; order: 1 | 2 | 3 } | { t: "branch" };
type Node = { el?: string; h: number; smiles?: string; val: number; deg: number };
type Bond = { a: number; b: number; order: number; fixed: boolean };
type State = { nodes: Node[]; bonds: Bond[]; cur: number; pending: number[]; next?: 1 | 2 | 3 };

// SMILES for a condensed formula, or undefined when it is not one Octet can read in one way.
export function condensedSmiles(text: string): string | undefined {
  const s = text.trim();
  if (s.length > 100 || !/^[A-Za-z0-9()=≡-]+$/.test(s) || !/[A-Z]/.test(s)) return undefined;
  let w = s;
  for (const [re, group] of WRITTEN) w = w.replace(re, group);
  const tokens = tokenise(w);
  // A formula has a hydrogen or a group in it: text with neither (CCl4, CO) is SMILES or a formula, read elsewhere.
  if (!tokens || !/H|[a-z]/.test(w) || !tokens.some((t) => t.t !== "bond")) return undefined;
  const g = assemble(tokens, 0);
  return g && smilesOf(g);
}

// SMILES for an atom label written as a condensed formula from its attachment atom (CH2N3, SO2Me, CH2CN, CH2NO2,
// CH2CO2Me), its first atom first, or undefined when it is not one Octet can read in one way. The label is read as a
// whole formula with the bond to the drawing as one more substituent of its first atom, so every valence is used:
// N3 and NO2 are azide and nitro, SO2 a sulfone, a short bond along the chain a double or triple bond.
export function condensedLabel(text: string): string | undefined {
  if (text.length > 40 || !/^[A-Z][A-Za-z0-9()]*$/.test(text)) return undefined;
  const tokens = tokenise(text);
  if (!tokens?.length || tokens[0].t !== "atom") return undefined;
  const g = assemble([{ t: "group", smiles: "[*]" }, ...tokens], 0);
  // A label leaves out what a chemist takes as read (SiOMe, SCMe, CCO2H): a double or triple bond only where the group
  // written always has one, C=O, N=O, P=O, S=O, C=S and P=S, and C≡N, C≡C or C=N along the chain, and never O–O.
  // Others are read left to right instead (labelSmiles).
  const el = (i: number) => g!.nodes[i].el ?? "", pair = (a: number, b: number) => el(a) + el(b);
  const fine = (b: Bond) => b.order === 1 ? pair(b.a, b.b) !== "OO" : b.fixed ? /^([CNPS]O|[CP]S)$/.test(pair(b.a, b.b)) : /^[CN][CN]$/.test(pair(b.a, b.b));
  if (!g?.bonds.every(fine)) return undefined;
  const smiles = smilesOf(g);
  if (!smiles?.startsWith(`[${tokens[0].el}`)) return undefined;
  // The bond to the drawing goes; hydrogens are left to valence, as the rest of Octet's label SMILES has them.
  const out = smiles.replace(/\(\[\*\]\)|\[\*\]/, "").replace(/\[(Cl|Br|[BCNOPSFI])(?:H\d*)?\]/g, "$1");
  return out.includes("*") ? undefined : out;
}

// The text as tokens: atoms with their hydrogens, groups, brackets (inner tokens, repeated by the count after them) and
// bonds. Undefined for anything that is not a formula.
function tokenise(text: string, depth = 0): Token[] | undefined {
  if (depth > 3) return undefined;
  const out: Token[] = [];
  let i = 0, leadH = 0;
  const count = () => { const m = /^\d{1,2}/.exec(text.slice(i)); i += m?.[0].length ?? 0; return m ? Number(m[0]) : 1; };
  const push = (t: Token, n: number) => { for (let k = 0; k < n; k++) out.push(k ? structuredClone(t) : t); };
  while (i < text.length) {
    const c = text[i];
    if (c === "(") {
      let d = 0, j = i;
      for (; j < text.length; j++) { if (text[j] === "(") d++; else if (text[j] === ")" && !--d) break; }
      if (j >= text.length) return undefined;
      const body = text.slice(i + 1, j);
      i = j + 1;
      const n = count();
      if (body.startsWith("=")) { // (=O): a double-bonded branch
        const inner = tokenise(body.slice(1), depth + 1);
        if (!inner || inner.length !== 1 || inner[0].t !== "atom") return undefined;
        for (let k = 0; k < n; k++) out.push({ t: "branch" }, structuredClone(inner[0]));
        continue;
      }
      const inner = SPECIAL[body] ? [{ t: "group", smiles: SPECIAL[body] } as Token] : tokenise(body, depth + 1);
      if (!inner?.length) return undefined;
      push({ t: "bracket", inner, text: body }, n);
      continue;
    }
    if (c === "-" || c === "=" || c === "≡") { out.push({ t: "bond", order: c === "-" ? 1 : c === "=" ? 2 : 3 }); i++; continue; }
    const special = Object.keys(SPECIAL).find((k) => text.startsWith(k, i) && !/^[a-z0-9]/.test(text[i + k.length] ?? ""));
    if (special) { i += special.length; out.push({ t: "group", smiles: SPECIAL[special] }); continue; }
    // One unit of an atom label: an element or group and its count.
    const [u] = units(text.slice(i).match(/^[a-z]?[A-Z][a-z]*\d*/)?.[0] ?? "");
    if (!u) return undefined;
    i += u.text.length + (u.count?.length ?? 0);
    const n = Number(u.count ?? 1);
    if (u.kind === "group") {
      if (u.text === "Ar" || !GROUPS[u.text]) return undefined;
      push({ t: "group", smiles: GROUPS[u.text] }, n);
    } else if (u.kind === "element" && u.text === "H") {
      const last = out[out.length - 1];
      if (last?.t === "atom") last.h += n;
      else if (!out.some((t) => t.t !== "bond")) leadH += n;
      else return undefined;
    } else if (u.kind === "element" && ELEMENTS.has(u.text) && VALENCE[u.text]) {
      push({ t: "atom", el: u.text, h: leadH }, 1);
      leadH = 0;
      for (let k = 1; k < n; k++) out.push({ t: "atom", el: u.text, h: 0 });
    } else return undefined;
  }
  return leadH ? undefined : out;
}

// Every reading of the tokens, in order of preference, until one uses each valence exactly. open: the bonds the
// result keeps to spare (a bracket's 1 or 2; 0 for a whole molecule).
function assemble(tokens: Token[], open: 0 | 1 | 2): State | undefined {
  let tries = 0;
  const start: State = { nodes: [], bonds: [], cur: -1, pending: [] };
  const copy = (st: State): State => ({ nodes: st.nodes.map((n) => ({ ...n })), bonds: st.bonds.map((b) => ({ ...b })), cur: st.cur, pending: [...st.pending], next: st.next });
  const bond = (st: State, a: number, b: number, order: number, fixed: boolean) => {
    st.bonds.push({ a, b, order, fixed });
    st.nodes[a].deg += order; st.nodes[b].deg += order;
    return st.nodes[a].deg <= st.nodes[a].val && st.nodes[b].deg <= st.nodes[b].val;
  };
  // A new atom of the chain: bonded to the one before it, and given the substituents waiting for it.
  const chain = (st: State, i: number) => {
    let ok = true;
    if (st.cur >= 0) ok = bond(st, st.cur, i, st.next ?? 1, st.next !== undefined);
    st.next = undefined;
    for (const p of st.pending) ok &&= bond(st, i, p, 1, true);
    st.pending = [];
    st.cur = i;
    return ok;
  };
  // A substituent (index i, one bond to spare): on the atom before it, or waiting for the next.
  const substituent = (st: State, i: number) => (st.cur >= 0 && st.next === undefined ? bond(st, st.cur, i, 1, true) : (st.pending.push(i), true));
  function* readings(st: State, k: number): Generator<State> {
    if (++tries > 20000 || st.nodes.length > 100) return;
    if (k === tokens.length) { yield st; return; }
    const t = tokens[k];
    if (t.t === "bond") {
      if (st.cur < 0 || st.next !== undefined) return;
      const n = copy(st); n.next = t.order;
      yield* readings(n, k + 1);
    } else if (t.t === "branch") {
      // (=O): the next atom is a double-bonded branch of this one.
      const a = tokens[k + 1];
      if (st.cur < 0 || a?.t !== "atom") return;
      for (const val of VALENCE[a.el]) {
        if (val - a.h !== 2) continue;
        const n = copy(st), i = n.nodes.push({ el: a.el, h: a.h, val: 2, deg: 0 }) - 1;
        if (bond(n, n.cur, i, 2, true)) yield* readings(n, k + 2);
      }
    } else if (t.t === "group") {
      const n = copy(st), i = n.nodes.push({ smiles: t.smiles, h: 0, val: 1, deg: 0 }) - 1;
      if (substituent(n, i)) yield* readings(n, k + 1);
    } else if (t.t === "bracket") {
      const inner = assembleBracket(t.inner);
      if (!inner) return;
      const n = copy(st), base = n.nodes.length;
      n.nodes.push(...inner.state.nodes.map((x) => ({ ...x })));
      for (const b of inner.state.bonds) n.bonds.push({ ...b, a: b.a + base, b: b.b + base, fixed: true });
      const [first, last] = inner.ends.map((e) => e + base);
      // One bond to spare: a substituent. Two: a link in the chain ((CH2)3).
      if (inner.ends.length === 1 ? substituent(n, first) : chain(n, first) && ((n.cur = last), true)) yield* readings(n, k + 1);
    } else {
      for (const val of VALENCE[t.el]) {
        const free = val - t.h;
        if (free < 0) continue;
        // An O or S with two bonds to spare after an atom: a double-bonded branch (C=O), then a link in the chain.
        if (free === 2 && st.cur >= 0 && st.next === undefined && /^(O|S|Se)$/.test(t.el)) {
          const n = copy(st), i = n.nodes.push({ el: t.el, h: t.h, val: free, deg: 0 }) - 1;
          if (bond(n, n.cur, i, 2, true)) yield* readings(n, k + 1);
        }
        const n = copy(st), i = n.nodes.push({ el: t.el, h: t.h, val: free, deg: 0 }) - 1;
        // One to spare after an atom: a substituent (OH, CH3, Cl). The first atom, or one with more: the chain.
        const ok = free === 1 && st.cur >= 0 && st.next === undefined ? substituent(n, i) : chain(n, i);
        if (ok) yield* readings(n, k + 1);
      }
    }
  }
  for (const st of readings(start, 0)) {
    // Two groups and nothing else (PhMe, PhNO2): bonded to each other.
    if (!open && st.cur < 0 && st.pending.length === 2) { bond(st, st.pending[0], st.pending[1], 1, true); st.pending = []; }
    if (st.pending.length || st.next !== undefined || !st.nodes.length) continue;
    if (open) { if (spare(st) === open) return st; continue; }
    // Bonds along the chain take what each atom has left, left to right (CH3CN, HC≡CH, CH2=CH2).
    for (const b of st.bonds) {
      if (b.fixed) continue;
      const add = Math.min(st.nodes[b.a].val - st.nodes[b.a].deg, st.nodes[b.b].val - st.nodes[b.b].deg, 3 - b.order);
      if (add > 0) { b.order += add; st.nodes[b.a].deg += add; st.nodes[b.b].deg += add; }
    }
    if (st.nodes.every((n) => n.deg === n.val)) return st;
  }
  return undefined;
}
const spare = (st: State) => st.nodes.reduce((s, n) => s + n.val - n.deg, 0);

// A bracket's reading, with the atom (one bond to spare) or the two atoms (a link) it joins by.
function assembleBracket(tokens: Token[]): { state: State; ends: number[] } | undefined {
  if (tokens.length === 1 && tokens[0].t === "group") return { state: { nodes: [{ smiles: tokens[0].smiles, h: 0, val: 1, deg: 0 }], bonds: [], cur: 0, pending: [] }, ends: [0] };
  for (const open of [1, 2] as const) {
    const st = assemble(tokens, open);
    if (!st) continue;
    const ends = st.nodes.flatMap((n, i) => Array<number>(n.val - n.deg).fill(i));
    return { state: st, ends: open === 1 ? ends : [ends[0], ends[1]] };
  }
  return undefined;
}

// The reading as SMILES: each atom in brackets with its hydrogens, groups as branches. Two groups alone: the first as
// a branch on the second's first atom.
const FIRST_ATOM = /^(?:\[[^\]]+\]|Cl|Br|[BCNOPSFIbcnops])/;
function smilesOf(st: State): string | undefined {
  if (st.nodes.every((n) => n.smiles)) {
    const [a, b] = st.nodes.map((n) => n.smiles!), head = st.nodes.length === 2 ? FIRST_ATOM.exec(b)?.[0] : undefined;
    return head && `${head}(${a})${b.slice(head.length)}`;
  }
  const root = st.nodes.findIndex((n) => n.el);
  const near = st.nodes.map(() => [] as { to: number; order: number }[]);
  for (const b of st.bonds) { near[b.a].push({ to: b.b, order: b.order }); near[b.b].push({ to: b.a, order: b.order }); }
  const seen = new Set<number>();
  const write = (i: number): string => {
    seen.add(i);
    const n = st.nodes[i];
    if (n.smiles) return n.smiles;
    const kids = near[i].filter((x) => !seen.has(x.to)).map((x) => { seen.add(x.to); return x; });
    const parts = kids.map((x) => `${["", "", "=", "#"][x.order]}${write(x.to)}`);
    return `[${n.el}${n.h ? `H${n.h > 1 ? n.h : ""}` : ""}]` + parts.map((p, k) => (k < parts.length - 1 ? `(${p})` : p)).join("");
  };
  const out = write(root);
  return seen.size === st.nodes.length ? out : undefined;
}
