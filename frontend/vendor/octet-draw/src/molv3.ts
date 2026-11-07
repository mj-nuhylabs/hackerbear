// MOL V3000 for query and Markush structures: a drawing with query properties, query labels, multi-centre or
// variable attachments, R-group definitions or polymer brackets is written, and read back, by Octet itself (Indigo
// writes and reads the rest). Facts from the public CTfile format: query atom fields (HCOUNT, SUBST, RBCNT, UNSAT,
// EXACHG, INVRET, RGROUPS, ATTCHPT), query bond types 5 to 8 and TOPO and RXCTR, ENDPTS with ATTACH, LINKNODE,
// S-groups, R-group blocks with RLOGIC, and enhanced stereo collections. Coordinates are in bond lengths, as Octet's
// other molfiles. A file is hostile: sizes are capped and every number checked.
import { expandLabel, fragments } from "./edit.ts";
import { ELEMENTS, isElement } from "./labels.ts";
import { altGroup, elementList, enclosed, linkNode, queryLabel, rgroupMembers, rNumber, USAGES, USAGE_KINDS } from "./query.ts";
import { HBOND, hydrogens, NONMETAL, orderOf, QUADRUPLE, type Atom, type AtomQuery, type Bond, type BracketUsage, type Mol, type Polymer, type Shape } from "./render.ts";

type P = [number, number];
const RAD_OUT: Record<number, number> = { 1: 2, 2: 3, 3: 1 }; // Octet's radical (doublet, triplet, singlet) to MDL's
const RAD_IN: Record<number, number> = { 1: 3, 2: 1, 3: 2 };
const RINGS: Record<string, number> = { none: -1, drawn: -2, simple: 2, fusion: 3, spiro: 4 };
export const RXCTR: Record<string, number> = { centre: 1, makebreak: 4, change: 8, makechange: 12, not: -1, nochange: 2 };
const BOND_TYPE: Record<string, number> = { sd: 5, sa: 6, da: 7, any: 8 };
const num = (v: number) => String(+v.toFixed(4)).replace(/^-0$/, "0");
const f4 = (v: number) => (Math.round(v * 1e4) / 1e4).toFixed(4);

// A V3000 line, split at 80 characters with "-" as ChemDraw and BIOVIA split them.
function lines(body: string): string[] {
  const out: string[] = [];
  let rest = `M  V30 ${body}`;
  while (rest.length > 80) { out.push(`${rest.slice(0, 79)}-`); rest = `M  V30 ${rest.slice(79)}`; }
  out.push(rest);
  return out;
}
const list = (xs: number[]) => `(${xs.length} ${xs.join(" ")})`;

// The drawing as a V3000 molfile. expand: a written label's atoms (atom 0 attaches), as for Octet's other molfiles.
export function writeV3000(drawn: Mol, expand?: (text: string) => Mol | undefined): string {
  const frags = fragments(drawn), defs = rgroupMembers(drawn, frags);
  const memberAtoms = new Set(defs.flatMap((d) => d.members.flat()));
  // The scaffold: every atom not in an R-group definition, with written labels drawn out.
  let root = pick(drawn, drawn.atoms.map((_, i) => i).filter((i) => !memberAtoms.has(i)));
  const rgroups = new Map<number, { members: Mol[]; logic?: Shape["rgroup"] }>();
  for (const d of defs) rgroups.set(rNumber(d.sh.rgroup!.name)!, { members: d.members.map((f) => pick(drawn, f)), logic: d.sh.rgroup });
  // An anonymous alternative group ([CH3, OMe, Ph]) is written as an R-group of its own, with the next free number.
  const used = new Set([...rgroups.keys(), ...drawn.atoms.flatMap((a) => (rNumber(a.text) ? [rNumber(a.text)!] : []))]);
  root = { ...root, atoms: root.atoms.map((a) => {
    const alts = queryLabel(a.text) === "alt" ? altGroup(a.text!) : undefined;
    if (!alts) return a;
    let n = 1;
    while (used.has(n)) n++;
    used.add(n);
    rgroups.set(n, { members: alts.map((t) => (isElement(t) ? { atoms: [{ label: t, location: [0, 0, 0] }], bonds: [] } : expand?.(t)) ?? { atoms: [{ label: "C", text: t, location: [0, 0, 0] }], bonds: [] }) });
    return { ...a, text: `R${n}` };
  }) };
  const out = ["", "  Octet", "", "  0  0  0     0  0            999 V3000", ...ctab(expanded(root, expand), drawn.shapes ?? [])];
  for (const [n, g] of [...rgroups].sort((p, q) => p[0] - q[0])) {
    const l = g.logic, then = rNumber(l?.then) ?? 0;
    out.push(`M  V30 BEGIN RGROUP ${n}`, `M  V30 RLOGIC ${then} ${l?.restH ? 1 : 0} ${l?.occur?.replace(/\s+/g, "") || ">0"}`);
    for (const m of g.members) out.push(...ctab(expanded(m, expand), [], true));
    out.push("M  V30 END RGROUP");
  }
  out.push("M  END");
  return out.join("\n");
}

// Some atoms of a drawing on their own, with the bonds between them and their attachments renumbered.
function pick(m: Mol, ids: number[]): Mol {
  const map = new Map(ids.map((i, k) => [i, k]));
  return {
    atoms: ids.map((i) => { const a = m.atoms[i]; return a.centre ? { ...a, centre: { ...a.centre, atoms: a.centre.atoms.flatMap((j) => (map.has(j) ? [map.get(j)!] : [])) } } : a; }),
    bonds: m.bonds.filter((b) => map.has(b.atoms[0]) && map.has(b.atoms[1])).map((b) => ({ ...b, atoms: [map.get(b.atoms[0])!, map.get(b.atoms[1])!] as [number, number] })),
  };
}
// Written labels (OMe) drawn out as atoms; query labels and labels that cannot be read stay as they are. A label's own
// charge (O2 drawn with a minus) goes on its first atom, as in Octet's other molfiles.
function expanded(m: Mol, expand?: (text: string) => Mol | undefined): Mol {
  let out = m;
  m.atoms.forEach((a, i) => {
    if (!a.text || queryLabel(a.text) || !expand) return;
    const frag = expand(a.text);
    if (!frag?.atoms.length) return;
    out = expandLabel(out, i, frag);
    if (a.charge) out = { ...out, atoms: out.atoms.map((x, k) => (k === i ? { ...x, charge: (frag.atoms[0].charge ?? 0) + a.charge! || undefined } : x)) };
  });
  return out;
}

// One connection table: atoms, bonds, link nodes, S-groups (polymer brackets round its atoms) and enhanced stereo
// collections. member: an R-group's fragment, whose attachment points (or first atom) take ATTCHPT.
function ctab(m: Mol, shapes: Shape[], member = false): string[] {
  const nbrs: number[][] = m.atoms.map(() => []), used = m.atoms.map(() => 0);
  m.bonds.forEach((b) => { nbrs[b.atoms[0]].push(b.atoms[1]); nbrs[b.atoms[1]].push(b.atoms[0]); used[b.atoms[0]] += orderOf(b.type); used[b.atoms[1]] += orderOf(b.type); });
  // A nonmetal bonded to a metal has the hydrogens the drawing shows (PPh3 on Pd is P, not PH): its valence, as
  // Octet's other molfiles write it.
  const plain = (a: Atom) => !a.text && !a.centre && !a.attach && !a.bead;
  const metalled = m.atoms.map((a, i) => plain(a) && NONMETAL.has(a.label) && nbrs[i].some((j) => plain(m.atoms[j]) && !NONMETAL.has(m.atoms[j].label)));
  // An R-group fragment's attachment points: the atoms its attach marks are bonded to, else its first atom. The marks
  // themselves are not written.
  const marks = member ? m.atoms.flatMap((a, i) => (a.attach ? [i] : [])) : [];
  const attachAt = new Map<number, number>();
  if (member) {
    marks.forEach((i, k) => { const j = nbrs[i][0]; if (j !== undefined) attachAt.set(j, attachAt.has(j) ? -1 : Math.min(k + 1, 2)); });
    if (!marks.length && m.atoms.length) attachAt.set(0, 1);
  }
  const keep = m.atoms.map((_, i) => !marks.includes(i)), index: number[] = [];
  let n = 0;
  keep.forEach((k, i) => { if (k) index[i] = ++n; });
  const atomLines: string[] = [], links: string[] = [];
  m.atoms.forEach((a, i) => {
    if (!keep[i]) return;
    const [x, y, z] = a.location, q = queryLabel(a.text), r = rNumber(a.text), extra: string[] = [];
    let type = a.label;
    if (a.centre || a.attach || a.bead) type = "*";
    else if (r) { type = "R#"; extra.push(`RGROUPS=(1 ${r})`); }
    else if (q === "generic") type = a.text!; // A, Q, M, X and their H forms are query atoms; the rest pseudo atoms
    else if (q === "list") { const l = elementList(a.text!)!; type = `${l.not ? "NOT" : ""}[${l.elements.map((e) => (e === "D" || e === "T" ? "H" : e)).join(",")}]`; }
    else if (q === "link") {
      const l = linkNode(a.text!)!;
      type = l.generic ?? l.element;
      // A link node joins two atoms: its repeats sit between them.
      if (nbrs[i].length === 2) links.push(`LINKNODE ${l.low} ${l.high} 2 ${index[i]} ${index[nbrs[i][0]]} ${index[i]} ${index[nbrs[i][1]]}`);
    } else if (a.text) type = a.text.replace(/\s+/g, "");
    else if (a.label === "D" || a.label === "T") { type = "H"; extra.push(`MASS=${a.label === "D" ? 2 : 3}`); }
    if (a.charge) extra.push(`CHG=${a.charge}`);
    if (a.radical) extra.push(`RAD=${RAD_OUT[a.radical]}`);
    if (a.isotope && !a.text) extra.push(`MASS=${a.isotope}`);
    const aq = a.query;
    if (aq?.noH) extra.push("HCOUNT=-1");
    if (aq?.subst?.kind === "exactly") extra.push(`SUBST=${aq.subst.n || -1}`);
    else if (aq?.subst?.kind === "free" && aq.subst.n === 0) extra.push("SUBST=-2");
    if (aq?.rings) extra.push(`RBCNT=${RINGS[aq.rings]}`);
    if (aq?.unsat === "present") extra.push("UNSAT=1");
    if (aq?.change) extra.push("EXACHG=1");
    if (aq?.stereo) extra.push(`INVRET=${aq.stereo === "inversion" ? 1 : 2}`);
    if (metalled[i]) extra.push(`VAL=${Math.round(used[i]) + (a.implicitHCount ?? hydrogens(a.label, a.charge ?? 0, used[i], a.radical === 3 ? 2 : a.radical))}`);
    if (attachAt.has(i)) extra.push(`ATTCHPT=${attachAt.get(i)}`);
    atomLines.push(...lines(`${index[i]} ${type} ${f4(x)} ${f4(y)} ${f4(z ?? 0)} ${a.map ?? 0}${extra.length ? " " + extra.join(" ") : ""}`));
  });
  const bondLines: string[] = [];
  let bn = 0;
  for (const b of m.bonds) {
    if (!keep[b.atoms[0]] || !keep[b.atoms[1]]) continue;
    const extra: string[] = [];
    // A hydrogen bond is type 10 and a quadruple bond single, as ChemDraw writes them.
    const type = b.query ? BOND_TYPE[b.query] : b.type === HBOND ? 10 : b.type === QUADRUPLE ? 1 : b.display === "dative" && b.type === 1 ? 9 : b.type === 4 ? 4 : Math.min(3, b.type);
    const cfg = b.type === 1 && b.stereo === 1 ? 1 : b.type === 1 && b.stereo === 6 ? 3 : (b.type === 1 && b.display === "wavy") || (b.type === 2 && b.display === "either") ? 2 : 0;
    if (cfg) extra.push(`CFG=${cfg}`);
    if (b.topology === "ring" || b.topology === "chain") extra.push(`TOPO=${b.topology === "ring" ? 1 : 2}`);
    if (b.rxn && RXCTR[b.rxn] !== undefined) extra.push(`RXCTR=${RXCTR[b.rxn]}`);
    // A bond to a multi-centre or variable attachment lists the atoms it stands for.
    const star = [b.atoms[0], b.atoms[1]].find((i) => m.atoms[i].centre);
    const c = star !== undefined ? m.atoms[star].centre! : undefined;
    if (c) extra.push(`ENDPTS=${list(c.atoms.filter((j) => keep[j]).map((j) => index[j]))}`, `ATTACH=${c.variable ? "ANY" : "ALL"}`);
    bondLines.push(...lines(`${++bn} ${type} ${index[b.atoms[0]]} ${index[b.atoms[1]]}${extra.length ? " " + extra.join(" ") : ""}`));
  }
  // S-groups: each polymer bracket pair round some of these atoms.
  const sgroups: string[] = [];
  let ns = 0;
  for (const sh of shapes) {
    if (!sh.polymer || sh.side) continue;
    const inside = enclosed(m, sh).atoms.filter((i) => keep[i]);
    if (!inside.length) continue;
    const set = new Set(inside), p = sh.polymer, u = USAGES[p.usage], k = ++ns, extra: string[] = [];
    const xbonds = m.bonds.flatMap((b, j) => (set.has(b.atoms[0]) !== set.has(b.atoms[1]) ? [j + 1] : []));
    if (xbonds.length) extra.push(`XBONDS=${list(xbonds)}`);
    const x0 = Math.min(sh.from[0], sh.to[0]), x1 = Math.max(sh.from[0], sh.to[0]), y0 = Math.min(sh.from[1], sh.to[1]), y1 = Math.max(sh.from[1], sh.to[1]);
    extra.push(`BRKXYZ=(9 ${num(x0)} ${num(y0)} 0 ${num(x0)} ${num(y1)} 0 0 0 0)`, `BRKXYZ=(9 ${num(x1)} ${num(y1)} 0 ${num(x1)} ${num(y0)} 0 0 0 0)`);
    if (["SRU", "COP", "MON", "MER", "CRO", "GRA", "MOD", "ANY"].includes(u.mdl)) extra.push(`CONNECT=${p.pattern === "hh" ? "HH" : p.pattern === "eu" ? "EU" : "HT"}`);
    if (u.sub) extra.push(`SUBTYPE=${u.sub}`);
    if (p.usage === "mult") extra.push(`MULT=${Math.max(1, Math.round(Number(p.label ?? 2)) || 2)}`, `PATOMS=${list(inside.map((i) => index[i]))}`);
    if ((p.usage === "sru" || p.usage === "param") && p.label) extra.push(`LABEL=${p.label.replace(/\s+/g, "")}`);
    if (p.usage === "c" && p.order) extra.push(`COMPNO=${p.order}`);
    sgroups.push(...lines(`${k} ${u.mdl} 0 ATOMS=${list(inside.map((i) => index[i]))} ${extra.join(" ")}`));
  }
  // Enhanced stereochemistry: the absolute centres, and each and and or group.
  const groups = new Map<string, number[]>();
  m.atoms.forEach((a, i) => {
    const e = /^(abs|&|or)(\d*)$/.exec(a.enhanced ?? "");
    if (!e || !keep[i]) return;
    const name = e[1] === "abs" ? "STEABS" : `${e[1] === "&" ? "STERAC" : "STEREL"}${e[2] || 1}`;
    groups.set(name, [...(groups.get(name) ?? []), index[i]]);
  });
  const out = ["M  V30 BEGIN CTAB", `M  V30 COUNTS ${n} ${bn} ${ns} 0 0`, "M  V30 BEGIN ATOM", ...atomLines, "M  V30 END ATOM"];
  if (bondLines.length) out.push("M  V30 BEGIN BOND", ...bondLines, "M  V30 END BOND");
  out.push(...links.flatMap(lines));
  if (sgroups.length) out.push("M  V30 BEGIN SGROUP", ...sgroups, "M  V30 END SGROUP");
  if (groups.size) out.push("M  V30 BEGIN COLLECTION", ...[...groups].flatMap(([name, ids]) => lines(`MDLV30/${name} ATOMS=${list(ids)}`)), "M  V30 END COLLECTION");
  out.push("M  V30 END CTAB");
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Reading.

// A molfile only Octet's reader takes: V3000 with query or Markush data in it.
export const isQueryMolfile = (text: string) =>
  /V3000/.test(text.slice(0, 4096)) && /RGROUPS=|SUBST=|UNSAT=|RBCNT=|HCOUNT=|TOPO=|RXCTR=|ENDPTS=|LINKNODE|BEGIN RGROUP|INVRET=|EXACHG=|^M {2}V30 \d+ (SRU|MUL|COP|MON|MER|CRO|GRA|MOD|COM|MIX|FOR|ANY|GEN) |^M {2}V30 \d+ (NOT)?\[|^M {2}V30 \d+ (A|AH|Q|QH|M|MH|X|XH|R#|\*) |^M {2}V30 \d+ [5-8] \d+ \d+/m.test(text);

const MAX_TEXT = 1_000_000, MAX_ATOMS = 10_000;
// The fields of a V3000 line: words, (lists) and "quoted text" kept whole.
function fields(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (line[i] === " ") i++;
    if (i >= line.length) break;
    let j = i, depth = 0, quote = false;
    for (; j < line.length; j++) {
      const c = line[j];
      if (c === '"') quote = !quote;
      else if (!quote && c === "(") depth++;
      else if (!quote && c === ")") depth--;
      else if (!quote && depth <= 0 && c === " ") break;
    }
    out.push(line.slice(i, j));
    i = j;
  }
  return out;
}
const keyed = (fs: string[]) => Object.fromEntries(fs.filter((f) => f.includes("=")).map((f) => [f.slice(0, f.indexOf("=")).toUpperCase(), f.slice(f.indexOf("=") + 1)]));
const ints = (v?: string) => { const m = /^\((.*)\)$/.exec(v ?? ""); const xs = (m ? m[1] : "").trim().split(/\s+/).map(Number); return xs.length > 1 && xs.every(Number.isInteger) ? xs.slice(1, 1 + xs[0]) : []; };
const finite = (v?: string) => { const x = Number(v); return v !== undefined && v !== "" && Number.isFinite(x) && Math.abs(x) < 1e5 ? x : undefined; };

type Table = { atoms: Atom[]; bonds: Bond[]; ids: Map<number, number>; attach: Map<number, number>; sgroups: { type: string; kv: Record<string, string>; brk: number[][] }[]; links: number[][]; collections: [string, number[]][] };

// A V3000 molfile as a drawing: the scaffold, each R-group's fragments in a box to the right, polymer brackets round
// their S-groups. Throws an Error with a message for the user when the file is not a V3000 molfile or is damaged.
export function readV3000(text: string): Mol {
  const bad = () => new Error("This molfile is damaged.");
  if (text.length > MAX_TEXT) throw new Error("This file is too large to open.");
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  if (raw.length < 4 || !/V3000/.test(raw[3])) throw new Error("This file is not a V3000 molfile.");
  // V30 lines, with continued lines joined.
  const body: string[] = [];
  for (let k = 4; k < raw.length; k++) {
    const l = raw[k];
    if (/^M {2}END/.test(l)) break;
    if (!l.startsWith("M  V30 ")) continue;
    const content = l.slice(7);
    if (body.length && body[body.length - 1].endsWith("-")) body[body.length - 1] = body[body.length - 1].slice(0, -1) + content;
    else body.push(content);
  }
  let at = 0;
  // A connection table from BEGIN CTAB on.
  const table = (): Table => {
    const t: Table = { atoms: [], bonds: [], ids: new Map(), attach: new Map(), sgroups: [], links: [], collections: [] };
    let block = "";
    for (; at < body.length; at++) {
      const l = body[at].trim();
      if (l === "END CTAB") { at++; return t; }
      const begin = /^BEGIN (\w+)/.exec(l), end = /^END (\w+)/.exec(l);
      if (begin) { block = begin[1]; continue; }
      if (end) { block = ""; continue; }
      const fs = fields(l), kv = keyed(fs);
      if (block === "ATOM") {
        if (t.atoms.length >= MAX_ATOMS) throw new Error("This file is too large to open.");
        const id = Number(fs[0]), x = finite(fs[2]), y = finite(fs[3]), z = finite(fs[4]) ?? 0;
        if (!Number.isInteger(id) || x === undefined || y === undefined || !fs[1]) throw bad();
        t.ids.set(id, t.atoms.length);
        t.atoms.push(atomOf(fs[1], [x, y, z], Number(fs[5]) || 0, kv));
        const ap = Number(kv.ATTCHPT);
        if (ap === 1 || ap === 2 || ap === -1) t.attach.set(t.atoms.length - 1, ap);
      } else if (block === "BOND") {
        const type = Number(fs[1]), i = t.ids.get(Number(fs[2])), j = t.ids.get(Number(fs[3]));
        if (i === undefined || j === undefined || i === j || !(type >= 1 && type <= 10)) throw bad();
        const b: Bond = { type: type === 2 || type === 7 ? 2 : type === 3 ? 3 : type === 4 ? 4 : type === 10 ? HBOND : 1, atoms: [i, j] };
        const q = { 5: "sd", 6: "sa", 7: "da", 8: "any" }[type] as Bond["query"];
        if (q) b.query = q;
        if (type === 9) b.display = "dative";
        const cfg = Number(kv.CFG);
        if (cfg === 1 && b.type === 1) b.stereo = 1;
        else if (cfg === 3 && b.type === 1) b.stereo = 6;
        else if (cfg === 2) b.display = b.type === 2 ? "either" : "wavy";
        if (kv.TOPO === "1") b.topology = "ring"; else if (kv.TOPO === "2") b.topology = "chain";
        const rx = Object.keys(RXCTR).find((k) => String(RXCTR[k]) === kv.RXCTR);
        if (rx) b.rxn = rx as Bond["rxn"];
        // A bond to a star atom that lists end points: a multi-centre (ALL) or variable (ANY) attachment.
        const ends = ints(kv.ENDPTS).map((e) => t.ids.get(e)).filter((e): e is number => e !== undefined);
        if (ends.length >= 2) {
          const star = [i, j].find((k) => t.atoms[k].text === "*" || t.atoms[k].attach) ?? i;
          t.atoms[star] = { label: "C", location: t.atoms[star].location, centre: { atoms: [...new Set(ends)], ...((kv.ATTACH ?? "").toUpperCase() === "ANY" ? { variable: true as const } : {}) } };
        }
        t.bonds.push(b);
      } else if (block === "SGROUP") {
        if (t.sgroups.length >= 1000) continue;
        const brk = fs.filter((f) => /^BRKXYZ=/i.test(f)).map((f) => (/\((.*)\)/.exec(f)?.[1] ?? "").trim().split(/\s+/).map(Number));
        t.sgroups.push({ type: (fs[1] ?? "").toUpperCase(), kv, brk });
      } else if (block === "COLLECTION") {
        const name = /^MDLV30\/(\w+)/.exec(fs[0] ?? "")?.[1];
        if (name) t.collections.push([name, ints(kv.ATOMS)]);
      } else if (fs[0] === "LINKNODE" && t.links.length < 1000) t.links.push(fs.slice(1, 8).map(Number));
    }
    throw bad();
  };
  // The scaffold, then the R-group blocks.
  while (at < body.length && body[at].trim() !== "BEGIN CTAB") at++;
  at++;
  const root = table();
  const groups: { n: number; logic: Shape["rgroup"]; members: Table[] }[] = [];
  for (; at < body.length; at++) {
    const g = /^BEGIN RGROUP (\d+)/.exec(body[at].trim());
    if (!g) continue;
    const n = Number(g[1]), members: Table[] = [];
    let logic: Shape["rgroup"] = { name: `R${n}` };
    for (at++; at < body.length && body[at].trim() !== "END RGROUP"; at++) {
      const l = body[at].trim();
      const r = /^RLOGIC\s+(-?\d+)\s+(\d)\s*(\S*)/.exec(l);
      if (r) logic = { name: `R${n}`, ...(r[3] && r[3] !== ">0" && /^[\d,<>=-]{1,20}$/.test(r[3]) ? { occur: r[3] } : {}), ...(r[2] === "1" ? { restH: true as const } : {}), ...(Number(r[1]) > 0 && Number(r[1]) < 100 ? { then: `R${Number(r[1])}` } : {}) };
      if (l === "BEGIN CTAB") { at++; members.push(table()); at--; }
    }
    if (n >= 1 && n <= 99) groups.push({ n, logic, members });
  }
  const mol: Mol = { atoms: [], bonds: [] };
  const add = (t: Table, shift: P): number => {
    const base = mol.atoms.length;
    for (const a of t.atoms) mol.atoms.push({ ...a, location: [a.location[0] + shift[0], a.location[1] + shift[1], a.location[2]], ...(a.centre ? { centre: { ...a.centre, atoms: a.centre.atoms.map((i) => i + base) } } : {}) });
    for (const b of t.bonds) mol.bonds.push({ ...b, atoms: [b.atoms[0] + base, b.atoms[1] + base] });
    // Link nodes (minimum and maximum repeats, bond count, then the node and its neighbour for each bond): the
    // repeated atom's label, as typed ([CH2]1-3).
    for (const l of t.links) {
      const i = t.ids.get(l[3]);
      if (i === undefined || !(l[0] >= 1 && l[1] >= l[0] && l[1] <= 99)) continue;
      const a = mol.atoms[base + i], used = t.bonds.reduce((s, b) => s + (b.atoms.includes(i) ? orderOf(b.type) : 0), 0);
      const h = a.text ? 0 : hydrogens(a.label, a.charge ?? 0, used), inner = a.text ?? `${a.label}${h ? `H${h > 1 ? h : ""}` : ""}`;
      mol.atoms[base + i] = { ...a, label: a.text ? a.label : a.label, text: `[${inner}]${l[0]}-${l[1]}` };
    }
    // Enhanced stereochemistry.
    for (const [name, ids] of t.collections) {
      const e = /^(STEABS|STERAC|STEREL)(\d*)$/.exec(name);
      if (!e) continue;
      const flag = e[1] === "STEABS" ? "abs" : `${e[1] === "STERAC" ? "&" : "or"}${Math.min(99, Number(e[2]) || 1)}`;
      for (const id of ids) { const i = t.ids.get(id); if (i !== undefined) mol.atoms[base + i].enhanced = flag; }
    }
    return base;
  };
  add(root, [0, 0]);
  // Polymer brackets: a box round each S-group's atoms, from its brackets when it has two upright ones.
  const shapes: Shape[] = [];
  let id = 1;
  for (const { type, kv, brk } of root.sgroups) {
    const usage = polymerUsage(type, kv);
    if (!usage) continue;
    const inside = ints(kv.ATOMS).map((x) => root.ids.get(x)).filter((i): i is number => i !== undefined);
    if (!inside.length) continue;
    const xs = inside.map((i) => mol.atoms[i].location[0]), ys = inside.map((i) => mol.atoms[i].location[1]);
    let box: [number, number, number, number] = [Math.min(...xs) - 0.4, Math.min(...ys) - 0.5, Math.max(...xs) + 0.4, Math.max(...ys) + 0.5];
    const lines9 = brk.map((v) => v.slice(1));
    if (lines9.length === 2 && lines9.every((v) => v.length === 9 && v.every(Number.isFinite) && Math.abs(v[0] - v[3]) < 1e-3)) {
      const bx = lines9.map((v) => v[0]).sort((p, q) => p - q), by = lines9.flatMap((v) => [v[1], v[4]]);
      if (bx[0] < Math.min(...xs) && bx[1] > Math.max(...xs)) box = [bx[0], Math.min(...by), bx[1], Math.max(...by)];
    }
    shapes.push({ id: id++, kind: "brackets", from: [box[0], box[3]], to: [box[2], box[1]], polymer: usage });
  }
  // R-groups: each in a box to the right of the scaffold, its fragments stacked down it; a fragment that attaches
  // other than by its first atom alone gets its attachment marks back.
  const xs = mol.atoms.map((a) => a.location[0]), ys = mol.atoms.map((a) => a.location[1]);
  let left = (xs.length ? Math.max(...xs) : 0) + 2;
  const top = ys.length ? Math.max(...ys) : 0;
  for (const g of groups) {
    let y = top, width = 1;
    const start = mol.atoms.length;
    for (const t of g.members) {
      if (!t.atoms.length) continue;
      const mx = t.atoms.map((a) => a.location[0]), my = t.atoms.map((a) => a.location[1]);
      const base = add(t, [left + 0.6 - Math.min(...mx), y - 0.6 - Math.max(...my)]);
      const points = [...t.attach].filter(([i, ap]) => !(i === 0 && ap === 1 && t.attach.size === 1));
      for (const [i, ap] of points) for (let k = 0; k < (ap === -1 ? 2 : 1); k++) {
        const q = mol.atoms[base + i].location, j = mol.atoms.push({ label: "C", attach: true, location: [q[0] - 1, q[1] - 0.5 * k, 0] }) - 1;
        mol.bonds.push({ type: 1, atoms: [base + i, j] });
      }
      width = Math.max(width, Math.max(...mx) - Math.min(...mx) + 1.2);
      y -= Math.max(...my) - Math.min(...my) + 1.4;
    }
    if (mol.atoms.length === start) continue;
    shapes.push({ id: id++, kind: "box", from: [left, top], to: [left + width + 0.6, y + 0.4], rgroup: g.logic });
    left += width + 1.6;
  }
  if (shapes.length) mol.shapes = shapes;
  return mol;
}

// An atom from its V3000 type and fields.
function atomOf(type: string, location: [number, number, number], map: number, kv: Record<string, string>): Atom {
  const a: Atom = { label: "C", location };
  const list = /^(NOT)?\[([A-Za-z,]+)\]$/.exec(type);
  if (type === "R#") { const r = ints(kv.RGROUPS)[0]; a.text = r >= 1 && r <= 99 ? `R${r}` : "R"; }
  else if (list) a.text = `[${list[1] ? "NOT " : ""}${list[2].split(",").join(",")}]`;
  else if (type === "*") a.text = "*";
  else if (ELEMENTS.has(type)) a.label = type;
  else if (/^[A-Za-z][\w*']{0,9}$/.test(type)) a.text = type;
  const chg = Number(kv.CHG), rad = Number(kv.RAD), mass = Number(kv.MASS);
  if (Number.isInteger(chg) && chg && Math.abs(chg) <= 9) a.charge = chg;
  if (RAD_IN[rad]) a.radical = RAD_IN[rad];
  if (Number.isInteger(mass) && mass >= 1 && mass <= 300 && !a.text) { if (a.label === "H" && (mass === 2 || mass === 3)) a.label = mass === 2 ? "D" : "T"; else a.isotope = mass; }
  if (Number.isInteger(map) && map > 0 && map <= 9999) a.map = map;
  const q: AtomQuery = {}, subst = Number(kv.SUBST), rb = Number(kv.RBCNT);
  if (kv.HCOUNT === "-1") q.noH = true;
  if (subst === -2) q.subst = { kind: "free", n: 0 };
  else if (subst === -1) q.subst = { kind: "exactly", n: 0 };
  else if (Number.isInteger(subst) && subst >= 1 && subst <= 15) q.subst = { kind: "exactly", n: subst };
  const ring = Object.keys(RINGS).find((k) => RINGS[k] === rb);
  if (ring && rb) q.rings = ring as AtomQuery["rings"];
  if (kv.UNSAT === "1") q.unsat = "present";
  if (kv.EXACHG === "1") q.change = true;
  if (kv.INVRET === "1") q.stereo = "inversion"; else if (kv.INVRET === "2") q.stereo = "retention";
  if (Object.keys(q).length) a.query = q;
  if (a.text === "*") { delete a.text; a.attach = true; }
  return a;
}

// A polymer S-group's meaning: its type (and copolymer subtype), connection, label, count and component number.
function polymerUsage(type: string, kv: Record<string, string>): Polymer | undefined {
  const sub = (kv.SUBTYPE ?? "").toUpperCase();
  const usage = type === "COP" ? (USAGE_KINDS.find((u) => USAGES[u].mdl === "COP" && USAGES[u].sub === sub) ?? "co") : type === "SRU" ? "sru" : USAGE_KINDS.find((u) => u !== "param" && USAGES[u].mdl === type);
  if (!usage) return undefined;
  const p: Polymer = { usage: usage as BracketUsage }, label = (kv.LABEL ?? "").replace(/^"|"$/g, "").slice(0, 20), connect = (kv.CONNECT ?? "").toUpperCase();
  if (connect === "HH") p.pattern = "hh"; else if (connect === "EU") p.pattern = "eu";
  if (usage === "sru" && label && label !== "n") p.label = label;
  if (usage === "mult") { const n = Number(kv.MULT); if (Number.isFinite(n) && n > 0 && n !== 2) p.label = String(n); }
  if (usage === "c") { const n = Number(kv.COMPNO); if (Number.isInteger(n) && n > 0 && n <= 999) p.order = n; }
  return p;
}
