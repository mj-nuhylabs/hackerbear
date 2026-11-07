// Reactions: structures, text (reagents written as words or formulas, such as H2O), plus signs and straight arrows
// in a row, with each arrow's conditions: text kept on the arrow (captions with `on`), and structures or text drawn
// above or below it. findReaction reads a reaction from what is drawn (double-clicking an arrow picks it), and
// cleanUpReaction lays it out as ChemDraw 26.1's Structure > Clean Up Reaction does (⇧⌘X). The two are kept apart,
// so a fuller reading of reactions (reaction interpretation) can replace findReaction and keep the layout.
import { GAP_ARROW_PT, LINE, curveBox, curved, isNumber, straightArrow, type Arrow, type Box, type Caption, type Mol } from "./render.ts";
import { addCaption, fragments, moveAtoms } from "./edit.ts";

type P = [number, number];
// One thing in the row, with its box in drawing units (y up): [left, bottom, right, top]. A part's carry: what stands
// close over or under it and moves with it as it is: text (a compound number written as plain
// text), other structures (a reagent drawn by it), drawn curves and pictures, shapes, and the curved arrows (electrons
// pushed in a mechanism) that start or end on a structure. boxes: the carried text's and structures' boxes.
// ends: curved arrows with one end on this part and the other on another part; only that end moves with it.
export type Carry = { captions: number[]; atoms: number[]; arrows: number[]; shapes: number[]; ends: [number, "from" | "to"][]; boxes: Box[] };
export type Step =
  | { kind: "structure"; atoms: number[]; box: Box; carry?: Carry }
  | { kind: "plus"; id: number; box: Box }
  | { kind: "text"; id: number; box: Box; carry?: Carry } // a caption standing in the row as a reactant or product
  | { kind: "arrow"; id: number; box: Box; carry?: Carry };
// An arrow's conditions that are not kept on it: structures and text drawn above or below it, within its length.
// Above is up the page, or on the left of an arrow down the page, as for text kept on an arrow.
export type Conditions = { above: Step[]; below: Step[] };
// atoms, captions: everything of the reaction (its conditions and what its parts carry too); carried: the other
// objects its parts carry (curved arrows, drawn curves, shapes).
export type Reaction = { steps: Step[]; arrows: number[]; atoms: number[]; captions: number[]; carried: number[]; conditions: Map<number, Conditions> };

const REACH = 3.5; // the widest gap (bond lengths) between neighbours in one reaction
const NEAR = 3; // how far (bond lengths) conditions sit from their arrow at most
const CLOSE = 1; // how far (bond lengths) from a part of the row what it carries sits at most
const YIELD = 1.5; // how far (bond lengths) from its structure a yield sits at most
const NAMED = 2; // how far (bond lengths) under or over a part of the row its text (a name, a CAS number) sits at most
// Text that is a yield, line by line: a percentage, in brackets or not, with yield, ee, de, dr or conversion by it.
const isYield = (text: string) => !!text.trim() && text.split("\n").every((t) => /^\(?\s*(yield:?\s*)?\d+([.,]\d+)?\s*%(\s*(yield|ee|de|dr|conv\.?|conversion))?\s*\)?$/i.test(t.trim()));

// The reaction an arrow is part of. ink: a structure's box (drawing units); captionBox: a caption's box.
// 1. Text that clings to a structure (within 0.3 bond lengths of its ink, or tied to it by a line) is the structure's
//    own (a partial charge, a label tied on by a dashed line), not a part of the row. So is a yield (35%) by it.
// 2. The row: everything that crosses the arrow's line (or nearly), walking out both ways from the arrow while the gaps
//    stay small, with any other straight arrow that points the same way (a scheme of several steps); not what stands
//    in a box or oval the arrow is not in (a catalyst drawn in a box beside the reaction).
// 3. What goes with the row:
//    - Conditions: a structure or text (not a plus sign) off the line, wholly on one side of it, near it, and within an
//      arrow's length (as ChemDraw reads them: inside its ends). Clean Up Reaction lays them out.
//    - Carried: what moves with a part of the row as it is drawn: a frame round that part alone (brackets round a
//      transition state), its clinging text, and anything close over or under the part, within its width (text, a
//      structure, a drawn curve or picture, a shape); but nothing in a box or frame that the part is not in (a legend).
//    - A curved arrow (electrons pushed) with its ends on two structures of the row stretches between them; one with an
//      end on one structure moves with it, and brings what its other end is on (a hydroxide ion attacking it).
// A reaction needs a structure in its row, or conditions on an arrow.
export function findReaction(m: Mol, arrowId: number, arrows: Arrow[], ink: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): Reaction | undefined {
  const a = arrows.find((x) => x.id === arrowId);
  if (!a || !straightArrow(a)) return undefined;
  // The row's line: through the arrow's middle, along it, or across or down the page when the arrow is within 20° of
  // that (a hand-drawn arrow a little off level), as Clean Up Reaction lays the row.
  const d: P = [a.to[0] - a.from[0], a.to[1] - a.from[1]], length = Math.hypot(...d) || 1, exact: P = [d[0] / length, d[1] / length], level = Math.cos((20 * Math.PI) / 180);
  const u: P = Math.abs(exact[0]) >= level ? [Math.sign(exact[0]), 0] : Math.abs(exact[1]) >= level ? [0, Math.sign(exact[1])] : exact, n: P = [-u[1], u[0]];
  const o: P = [(a.from[0] + a.to[0]) / 2, (a.from[1] + a.to[1]) / 2];
  const along = (q: P) => (q[0] - o[0]) * u[0] + (q[1] - o[1]) * u[1];
  const across = (q: P) => (q[0] - o[0]) * n[0] + (q[1] - o[1]) * n[1];
  const corners = (b: Box): P[] => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
  // Everything that could be in the row, as an interval along the row's line and across it.
  type Item = { step: Step; lo: number; hi: number; off: number; half: number };
  type Part = Extract<Step, { kind: "structure" | "text" | "arrow" }>;
  const item = (step: Step): Item => { const c = corners(step.box), xs = c.map(along), ys = c.map(across); return { step, lo: Math.min(...xs), hi: Math.max(...xs), off: (Math.min(...ys) + Math.max(...ys)) / 2, half: (Math.max(...ys) - Math.min(...ys)) / 2 }; };
  const items: Item[] = [];
  for (const atoms of fragments(m)) { const b = ink(atoms); if (b) items.push(item({ kind: "structure", atoms, box: b })); }
  for (const c of m.captions ?? []) { const b = captionBox(c.id); if (b && !c.under && !c.on && !c.cycle) items.push(item({ kind: c.text.trim() === "+" ? "plus" : "text", id: c.id, box: b })); }
  // Straight arrows: one that points the same way can be a step of the reaction; one that points another way (the
  // other reaction of C ← A → B) ends the row where it stands.
  const against = new Set<Item>();
  for (const x of arrows) {
    if (!straightArrow(x)) continue;
    const v: P = [x.to[0] - x.from[0], x.to[1] - x.from[1]], cos = (v[0] * exact[0] + v[1] * exact[1]) / (Math.hypot(...v) || 1);
    const it = item({ kind: "arrow", id: x.id, box: [Math.min(x.from[0], x.to[0]), Math.min(x.from[1], x.to[1]), Math.max(x.from[0], x.to[0]), Math.max(x.from[1], x.to[1])] });
    items.push(it);
    if (cos <= Math.cos((20 * Math.PI) / 180)) against.add(it);
  }
  const gapOf = (p: Box, q: Box) => Math.max(0, p[0] - q[2], q[0] - p[2], p[1] - q[3], q[1] - p[3]);
  const near = (q: P, b: Box, slack = 0.5) => q[0] >= b[0] - slack && q[0] <= b[2] + slack && q[1] >= b[1] - slack && q[1] <= b[3] + slack;
  const structures = items.filter((it) => it.step.kind === "structure");
  // What stands wholly on one side of the line, near it, with its middle over an arrow is that arrow's conditions,
  // however close to the line or to a structure: the first of several lines of text under it, or a wide one.
  const shafts = items.filter((it) => it.step.kind === "arrow" && !against.has(it) && Math.abs(it.off) < 0.4);
  const overArrow = (it: Item) => it.step.kind !== "arrow" && Math.abs(it.off) > it.half && Math.abs(it.off) - it.half <= NEAR && shafts.some((x) => (it.lo + it.hi) / 2 > x.lo && (it.lo + it.hi) / 2 < x.hi);

  // 1. Text that clings to a structure, and the lines that tie it on. A small structure drawn over a larger one (a
  //    substituent's bond drawn apart from its ring) clings to the larger one, as the walk below cannot take both.
  const clings = new Map<Item, Item>(), ties = new Map<Item, number[]>();
  for (const it of items) {
    if (it.step.kind !== "text" || overArrow(it)) continue;
    const s = structures.map((x) => [x, gapOf(it.step.box, x.step.box)] as const).filter(([, g]) => g < 0.3).sort((p, q) => p[1] - q[1])[0];
    if (s) clings.set(it, s[0]);
  }
  // A yield (35%, (35%), 35% yield, 92% ee) says how much of a structure was made: it goes with the nearest structure
  // within YIELD bond lengths (beside it in the row, or under it), and is never a reactant or product of its own.
  for (const it of items) {
    if (it.step.kind !== "text" || clings.has(it) || overArrow(it) || !isYield(m.captions?.find((c) => c.id === (it.step as { id: number }).id)?.text ?? "")) continue;
    const s = structures.map((x) => [x, gapOf(it.step.box, x.step.box)] as const).filter(([, g]) => g <= YIELD).sort((p, q) => p[1] - q[1])[0];
    if (s) clings.set(it, s[0]);
  }
  const size = (it: Item) => (it.step as { atoms: number[] }).atoms.length;
  for (const it of structures) {
    const s = structures.filter((x) => size(x) > size(it) && Math.min(x.hi, it.hi) - Math.max(x.lo, it.lo) > 0.3 && Math.abs(x.off - it.off) < x.half + it.half).sort((p, q) => size(q) - size(p))[0];
    if (s) clings.set(it, s);
  }
  for (const x of arrows) {
    if (x.kind !== "line" && x.kind !== "arc") continue;
    const s = structures.find((st) => near(x.from, st.step.box, 0.3) || near(x.to, st.step.box, 0.3));
    const other = s && (near(x.from, s.step.box, 0.3) ? x.to : x.from), t = other && items.find((it) => it.step.kind === "text" && near(other, it.step.box, 0.3));
    if (!s || !t) continue;
    clings.set(t, s);
    ties.set(s, [...(ties.get(s) ?? []), x.id]);
  }

  // 2. The row. A structure reaches as far as the text that clings to it (not as far as a structure that clings to it,
  //    which can reach past the arrow's end).
  const frames = (m.shapes ?? []).filter((x) => x.kind !== "highlight").map((x): [number, Box, boolean] => [x.id, [Math.min(x.from[0], x.to[0]), Math.min(x.from[1], x.to[1]), Math.max(x.from[0], x.to[0]), Math.max(x.from[1], x.to[1])], x.kind === "box" || x.kind === "rounded" || x.kind === "oval"]);
  const inside = (b: Box, f: Box) => (b[0] + b[2]) / 2 > f[0] && (b[0] + b[2]) / 2 < f[2] && (b[1] + b[3]) / 2 > f[1] && (b[1] + b[3]) / 2 < f[3];
  const arrowBox: Box = [Math.min(a.from[0], a.to[0]), Math.min(a.from[1], a.to[1]), Math.max(a.from[0], a.to[0]), Math.max(a.from[1], a.to[1])];
  const fenced = (it: Item) => frames.some(([, f, box]) => box && inside(it.step.box, f) && !inside(arrowBox, f));
  const span = new Map(items.map((it) => [it, { lo: it.lo, hi: it.hi }]));
  for (const [t, s] of clings) if (t.step.kind === "text") { const w = span.get(s)!; w.lo = Math.min(w.lo, t.lo); w.hi = Math.max(w.hi, t.hi); }
  // An arrow's text over and under it reaches past its ends when the arrow is too short for it: the gap to the next
  // part counts from there.
  const wide = new Map<Item, { lo: number; hi: number }>();
  for (const it of items) {
    if (it.step.kind !== "text" || !overArrow(it)) continue;
    const x = shafts.find((s) => (it.lo + it.hi) / 2 > s.lo && (it.lo + it.hi) / 2 < s.hi);
    if (x) { const w = wide.get(x) ?? { lo: x.lo, hi: x.hi }; wide.set(x, { lo: Math.min(w.lo, it.lo), hi: Math.max(w.hi, it.hi) }); }
  }
  const lo = (it: Item) => span.get(it)!.lo, hi = (it: Item) => span.get(it)!.hi, mid = (it: Item) => (lo(it) + hi(it)) / 2;
  const inLine = items.filter((it) => !clings.has(it) && !fenced(it) && !overArrow(it) && Math.abs(it.off) < it.half + 0.4);
  const start = inLine.find((it) => it.step.kind === "arrow" && it.step.id === arrowId);
  if (!start) return undefined;
  const row = [start];
  // Walk out both ways, taking the nearest thing each time, while the gap stays small.
  for (const dir of [-1, 1]) {
    let at = start;
    for (;;) {
      const edge = dir < 0 ? lo(at) : hi(at), far = dir < 0 ? Math.min(edge, wide.get(at)?.lo ?? edge) : Math.max(edge, wide.get(at)?.hi ?? edge);
      // Next: what starts past the edge, or overlaps it with its middle past it (a product drawn under the arrowhead).
      const next = inLine.filter((it) => !row.includes(it) && (dir < 0 ? hi(it) <= edge + 0.3 || mid(it) < edge : lo(it) >= edge - 0.3 || mid(it) > edge)).sort((p, q) => (dir < 0 ? hi(q) - hi(p) : lo(p) - lo(q)))[0];
      if (!next || against.has(next) || (dir < 0 ? far - hi(next) : lo(next) - far) > REACH) break;
      row.push(next);
      at = next;
    }
  }
  row.sort((p, q) => lo(p) - lo(q));
  const steps = row.map((it) => it.step);
  const arrowIds = steps.flatMap((s) => (s.kind === "arrow" ? [s.id] : []));

  // 3. What goes with the row.
  const conditions = new Map<number, Conditions>(arrowIds.map((id) => [id, { above: [], below: [] }]));
  // Above: up the page, or on the left of an arrow down the page (where the renderer puts text kept "above" it).
  const screenUp = Math.abs(u[0]) >= Math.abs(u[1]) ? Math.sign(n[1]) : -Math.sign(n[0]);
  const rowArrows = row.filter((it) => it.step.kind === "arrow");
  const carry = (s: Part | Extract<Step, { kind: "structure" }>) => (s.carry ??= { captions: [], atoms: [], arrows: [], shapes: [], ends: [], boxes: [] });
  const taken = new Set<Step>([...row, ...against].map((r) => r.step)); // (an arrow of another reaction is no one's to carry)
  // A structure's clinging text and the lines that tie it on go with it, wherever the structure goes.
  const bring = (k: Carry, s: Item) => {
    for (const [t, by] of clings) {
      if (by !== s || taken.has(t.step)) continue;
      taken.add(t.step);
      k.boxes.push(t.step.box);
      if (t.step.kind === "structure") { k.atoms.push(...t.step.atoms); bring(k, t); } else k.captions.push((t.step as { id: number }).id);
    }
    k.arrows.push(...(ties.get(s) ?? []));
  };
  for (const r of row) if (r.step.kind === "structure") bring(carry(r.step), r);
  // Frames round one part alone go with it, and widen it for what else it carries.
  const parts = row.filter((r) => r.step.kind === "structure" || r.step.kind === "text" || r.step.kind === "arrow");
  const reach = new Map<Item, Item>(parts.map((r) => [r, item({ kind: "text", id: -1, box: union([r.step.box, ...((r.step as Part).carry?.boxes ?? [])]) })]));
  for (const [id, f] of frames) {
    const ins = row.filter((r) => inside(r.step.box, f)), r = ins[0];
    if (ins.length !== 1 || !reach.has(r)) continue;
    const s = r.step as Part, w = reach.get(r)!.step.box;
    carry(s).shapes.push(id);
    carry(s).boxes.push(f);
    reach.set(r, item({ kind: "text", id: -1, box: union([w, f]) }));
  }
  // What is close over or under a part, and not in a frame the part is not in.
  const close = (it: Item, x: Item) => { const w = reach.get(x)!; return Math.max(0, Math.abs(it.off - w.off) - it.half - w.half) <= (it.step.kind === "text" ? NAMED : CLOSE) && !frames.some(([, f]) => inside(it.step.box, f) && !inside(x.step.box, f)); };
  const owner = (it: Item): Part | undefined => {
    const x = parts.find((r) => it.lo >= reach.get(r)!.lo - 0.75 && it.hi <= reach.get(r)!.hi + 0.75);
    return x && close(it, x) ? (x.step as Part) : undefined;
  };
  // A name: text under a part of a row across the page, wider than the part, with its middle within the part and no
  // other part's middle within it. It goes with the part, so the part does not move away from its name.
  const middle = (r: Item) => (reach.get(r)!.lo + reach.get(r)!.hi) / 2;
  const nameOf = (it: Item): Part | undefined => {
    const x = u[1] ? undefined : parts.find((r) => it.step.box[1] + it.step.box[3] < r.step.box[1] + r.step.box[3] && Math.abs((it.lo + it.hi) / 2 - middle(r)) <= (reach.get(r)!.hi - reach.get(r)!.lo) / 2
      && parts.every((o) => o === r || middle(o) <= it.lo || middle(o) >= it.hi));
    return x && close(it, x) ? (x.step as Part) : undefined;
  };
  // Nearest the line first, so that a part takes a stack of lines under it one after another (a CAS number, then a
  // price under that).
  const grow = (p: Part, b: Box) => { const r = parts.find((x) => x.step === p); if (r) reach.set(r, item({ kind: "text", id: -1, box: union([reach.get(r)!.step.box, b]) })); };
  for (const it of [...items].sort((p, q) => Math.abs(p.off) - p.half - (Math.abs(q.off) - q.half))) {
    if (taken.has(it.step) || clings.has(it) || it.step.kind === "arrow" || it.step.kind === "plus") continue;
    const near = Math.abs(it.off) - it.half, mid = (it.lo + it.hi) / 2;
    // (Text may run past the ends of an arrow too short for it; a structure may not.)
    const by = near >= 0.05 && near <= NEAR ? rowArrows.find((x) => mid >= x.lo && mid <= x.hi && (it.step.kind === "text" || (it.lo >= x.lo - 0.25 && it.hi <= x.hi + 0.25))) : undefined;
    if (by) {
      const c = conditions.get((by.step as { id: number }).id)!;
      (it.off * screenUp > 0 ? c.above : c.below).push(it.step);
      taken.add(it.step);
      if (it.step.kind === "structure") bring(carry(it.step), it);
      continue;
    }
    const o = owner(it), name = !o && it.step.kind === "text" ? nameOf(it) : undefined;
    // (A name takes room beside its part, as any text under it does, so its neighbours space out round it.)
    if (name) { carry(name).captions.push((it.step as { id: number }).id); carry(name).boxes.push(it.step.box); grow(name, it.step.box); taken.add(it.step); }
    if (!o) continue;
    const k = carry(o);
    if (it.step.kind === "structure") { k.atoms.push(...it.step.atoms); bring(k, it); } else k.captions.push((it.step as { id: number }).id);
    k.boxes.push(it.step.box);
    grow(o, it.step.box);
    taken.add(it.step);
  }
  // Drawn curves and pictures, and shapes round no part of the row.
  for (const x of arrows) {
    if (x.kind !== "curve" || !x.curve) continue;
    const [p, q] = curveBox(x.curve), box: Box = [p[0], p[1], q[0], q[1]], o = owner(item({ kind: "text", id: x.id, box }));
    if (o) { carry(o).arrows.push(x.id); carry(o).boxes.push(box); }
  }
  for (const [id, f] of frames) { const o = row.some((r) => inside(r.step.box, f)) ? undefined : owner(item({ kind: "text", id, box: f })); if (o) { carry(o).shapes.push(id); carry(o).boxes.push(f); } }
  // Curved arrows.
  const on = (q: P) => row.find((r) => r.step.kind === "structure" && near(q, r.step.box))?.step as Part | undefined;
  for (const x of arrows) {
    if (!curved(x)) continue;
    const s0 = on(x.from), s1 = on(x.to);
    if (s0 && s1 && s0 !== s1) { carry(s0).ends.push([x.id, "from"]); carry(s1).ends.push([x.id, "to"]); continue; }
    const s = s0 ?? s1;
    if (!s) continue;
    const k = carry(s), other = s0 ? x.to : x.from;
    k.arrows.push(x.id);
    const it = items.find((i) => !taken.has(i.step) && (i.step.kind === "structure" || i.step.kind === "text") && near(other, i.step.box));
    if (!it) continue;
    taken.add(it.step);
    if (it.step.kind === "structure") { k.atoms.push(...it.step.atoms); bring(k, it); } else k.captions.push((it.step as { id: number }).id);
    k.boxes.push(it.step.box);
  }
  // A carried thing brings the rest of its group (a picture drawn in layers), unless the group holds part of the row
  // or another reaction's arrow (the next step of a scheme that turns a corner).
  const otherArrows = new Set(arrows.filter((x) => straightArrow(x) && !arrowIds.includes(x.id)).map((x) => x.id));
  const rowAtoms = new Set(steps.flatMap((s) => (s.kind === "structure" ? s.atoms : []))), rowIds = new Set(steps.flatMap((s) => (s.kind === "structure" ? [] : [s.id])));
  const condAll = [...conditions.values()].flatMap((c) => [...c.above, ...c.below]);
  const condAtoms = new Set(condAll.flatMap((x) => (x.kind === "structure" ? x.atoms : []))), condIds = new Set(condAll.flatMap((x) => (x.kind === "structure" ? [] : [x.id])));
  const kindOf = new Map<number, "captions" | "arrows" | "shapes">([...(m.captions ?? []).map((x) => [x.id, "captions"] as const), ...(m.arrows ?? []).map((x) => [x.id, "arrows"] as const), ...(m.shapes ?? []).map((x) => [x.id, "shapes"] as const)]);
  for (const s of steps) {
    const k = s.kind === "plus" ? undefined : s.carry;
    if (!k) continue;
    for (const g of m.groups ?? []) {
      const has = g.atoms.some((i) => k.atoms.includes(i)) || g.items.some((id) => k.captions.includes(id) || k.arrows.includes(id) || k.shapes.includes(id));
      if (!has || g.atoms.some((i) => rowAtoms.has(i)) || g.items.some((id) => rowIds.has(id) || otherArrows.has(id))) continue;
      // (Its conditions are left out: they move with their arrow already.)
      k.atoms = [...new Set([...k.atoms, ...g.atoms.filter((i) => !condAtoms.has(i))])];
      for (const id of g.items) { const kind = kindOf.get(id); if (kind && !k[kind].includes(id) && !condIds.has(id)) k[kind].push(id); }
    }
  }
  const hasConditions = arrowIds.some((id) => { const c = conditions.get(id)!; return c.above.length + c.below.length > 0 || (m.captions ?? []).some((x) => x.on?.arrow === id); });
  if (!steps.some((s) => s.kind === "structure") && !hasConditions) return undefined;
  const condSteps = [...conditions.values()].flatMap((c) => [...c.above, ...c.below]), carries = [...steps, ...condSteps].flatMap((s) => (s.kind !== "plus" && s.carry ? [s.carry] : []));
  const atoms = [...new Set([...steps, ...condSteps].flatMap((s) => (s.kind === "structure" ? s.atoms : [])).concat(carries.flatMap((k) => k.atoms)))];
  // Its captions: the plus signs and text in the row, each arrow's conditions, the numbers and names under its
  // structures, and the text its parts carry.
  const inRow = new Set(atoms), own = new Set([...steps, ...condSteps].flatMap((s) => (s.kind === "plus" || s.kind === "text" ? [s.id] : [])).concat(carries.flatMap((k) => k.captions)));
  const captions = (m.captions ?? []).filter((c) => own.has(c.id) || (c.on && arrowIds.includes(c.on.arrow)) || (c.under && c.under.every((i) => inRow.has(i)))).map((c) => c.id);
  return { steps, arrows: arrowIds, atoms, captions, carried: [...new Set(carries.flatMap((k) => [...k.arrows, ...k.shapes, ...k.ends.map((e) => e[0])]))], conditions };
}
const union = (bs: Box[]): Box => [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
// Whether a reaction has a structure with a bond in its row (ChemDraw reads a reaction only from parts with atoms).
// Clean up lays out only such reactions unless their arrow is picked, so arrows among text alone (a spectrum's
// labels, the electrons of an energy diagram, a lone atom used as a word) stay as they are drawn.
export const withStructure = (r: Reaction) => r.steps.some((s) => s.kind === "structure" && s.atoms.length > 1);

// The space between neighbours in a cleaned reaction (bond lengths), as ChemDraw sets it: a bond length, or 1.5 times
// the caption size when that is larger (ACS Document 1996: 15 pt, 1.04 bond lengths).
export const gapFor = (captionPt: number, bondPt: number) => Math.max(1, (1.5 * captionPt) / bondPt);
export type Layout = {
  gap: number; // between neighbours (gapFor)
  width?: number; // the page's width (bond lengths): a longer reaction wraps onto more lines
  captionBox: (id: number) => Box | undefined; // a caption's box as drawn now
  plusBox: Box; // a new plus sign's box, about its point
  captionPt: number; bondPt: number; // the document's caption size and bond length (pt), for text kept on arrows
};

// Clean Up Reaction, as ChemDraw 26.1's (its help, and its ReactionNeatener):
// - Every structure, plus sign and text in the row is centred on one level line, and every arrow lies on it, with the
//   same space (gap) between neighbours. A plus sign goes between any two neighbours on one side of an arrow that have
//   none. A part's width and height take in what goes with it: the text under a structure (its name, number, CAS
//   number or price) and a yield beside it, so its neighbours space out round them.
// - An arrow is two gaps long, or as long as its widest conditions with a gap at each end. Its text stacks on it (the
//   renderer stacks captions kept on an arrow); text drawn above or below it is kept on it from now on; structures
//   above or below it stand in a row, centred on it, a quarter gap clear of its text.
// - A reaction wider than the page wraps onto lines two bond lengths apart, each centred under the first. Octet breaks
//   a line only before an arrow (before a plus sign if it must), and balances the lines.
// Octet keeps the reaction's way: a reaction drawn right to left, or down the page, is laid out that way (ChemDraw
// turns every reaction to read left to right). The first thing in the row stays where it is, level with the first
// arrow; with fixed (atoms already laid out by another reaction), the first structure among them stays instead, so
// reactions that share a structure stay joined.
export function cleanUpReaction(m: Mol, r: Reaction, arrows: Arrow[], o: Layout, fixed?: Set<number>): Mol {
  const first = arrows.find((a) => a.id === r.arrows[0]);
  if (!first) return m;
  // The frame: u along the row (the first arrow's way, turned to the nearest of across or down the page), n across it.
  const d = [first.to[0] - first.from[0], first.to[1] - first.from[1]], flat = Math.abs(d[0]) >= Math.abs(d[1]);
  const u: P = flat ? [Math.sign(d[0]) || 1, 0] : [0, Math.sign(d[1]) || 1], n: P = [-u[1], u[0]];
  const frame = (b: Box): Box => { const xs = [b[0] * u[0] + b[1] * u[1], b[2] * u[0] + b[3] * u[1]], ys = [b[0] * n[0] + b[1] * n[1], b[2] * n[0] + b[3] * n[1]]; return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const world = (a: number, c: number): P => [a * u[0] + c * n[0], a * u[1] + c * n[1]];
  // "Above" an arrow as the renderer draws text kept on it: up the page, or on the left of an arrow down the page.
  const up = flat ? Math.sign(n[1]) : -Math.sign(n[0]);
  const gap = o.gap;
  let out = m;

  // Plus signs where they are missing: between two neighbours on one side of an arrow.
  const steps: Step[] = [], text = (x: Step) => (x.kind === "text" ? (m.captions ?? []).find((c) => c.id === x.id)?.text.trim() ?? "" : "");
  r.steps.forEach((s, k) => {
    const prev = r.steps[k - 1];
    // (Text written with its own plus sign, such as +H2O, needs none.)
    if (prev && s.kind !== "arrow" && s.kind !== "plus" && prev.kind !== "arrow" && prev.kind !== "plus" && !text(s).startsWith("+") && !text(prev).endsWith("+")) {
      let id: number;
      [out, id] = addCaption(out, { text: "+", x: 0, y: 0, align: "centre" });
      steps.push({ kind: "plus", id, box: o.plusBox });
    }
    steps.push(s);
  });

  // An arrow with a drawing by it (a picture of a lamp beside its conditions) keeps its conditions as they are drawn:
  // they move with it, and it grows to reach past them. Otherwise text drawn above or below an arrow is kept on it from
  // now on, on its side.
  const rigid = (s: Step) => s.kind === "arrow" && !!s.carry && s.carry.arrows.length + s.carry.shapes.length > 0, takenOn = new Set<number>();
  for (const [id, c] of r.conditions) for (const side of ["above", "below"] as const) for (const s of c[side]) {
    if (s.kind !== "text" || steps.some((x) => x.kind === "arrow" && x.id === id && rigid(x))) continue;
    const b = frame(s.box), a = arrows.find((x) => x.id === id)!, mid = frame([a.from[0], a.from[1], a.to[0], a.to[1]]);
    const onSide: "above" | "below" = ((b[1] + b[3]) / 2 - (mid[1] + mid[3]) / 2) * up > 0 ? "above" : "below";
    out = { ...out, captions: out.captions?.map((x) => (x.id === s.id ? { ...x, on: { arrow: id, side: onSide } } : x)) };
    takenOn.add(s.id);
  }
  // The renderer stacks text kept on an arrow out from it in the order of the captions' ids. So that lines drawn by
  // hand (free text taken on now, or a ChemDraw file's) keep the order they are drawn in, the nearest the arrow
  // nearest, their texts are given out to the ids on their side in that order. Text Octet stacked already is in order.
  // (A side with a compound number, or text not measured, keeps its order.)
  for (const id of r.arrows) for (const side of ["above", "below"] as const) {
    const a = arrows.find((x) => x.id === id), list = (out.captions ?? []).filter((c) => c.on?.arrow === id && c.on.side === side);
    if (!a || list.length < 2 || list.some(isNumber) || !list.some((c) => takenOn.has(c.id) || c.placed)) continue;
    const boxes = list.map((c) => o.captionBox(c.id));
    if (boxes.some((b) => !b)) continue;
    const shaft = frame([a.from[0], a.from[1], a.to[0], a.to[1]]), line = (shaft[1] + shaft[3]) / 2, sign = side === "above" ? up : -up;
    const away = (k: number) => { const b = frame(boxes[k]!); return ((b[1] + b[3]) / 2 - line) * sign; };
    const ids = list.map((c) => c.id).sort((p, q) => p - q);
    const texts = list.map((c, k) => [c, away(k)] as const).sort((p, q) => p[1] - q[1]).map(([c]) => c);
    const give = new Map(ids.map((cid, k) => [cid, texts[k]]));
    if (texts.every((c, k) => c.id === ids[k])) continue;
    out = { ...out, captions: out.captions?.map((c) => (give.has(c.id) ? { ...give.get(c.id)!, id: c.id } : c)) };
  }
  const kept = (id: number, side: "above" | "below") => (out.captions ?? []).filter((c) => c.on?.arrow === id && c.on.side === side);
  // How far text kept on an arrow reaches from it, as the renderer stacks it (render.ts placeCaptions).
  const block = (cs: Caption[]) => (cs.length ? (GAP_ARROW_PT + cs.reduce((s, c) => s + (c.text.split("\n").length * LINE + 0.2) * (c.size ?? o.captionPt), 0)) / o.bondPt : 0);
  // The widest text kept on an arrow across the page (beside an arrow down the page, text does not set its length).
  const textWidth = (cs: Caption[]) => (flat ? Math.max(0, ...cs.map((c) => { const b = o.captionBox(c.id); return b ? b[2] - b[0] : 0; })) : 0);

  // Each part of the row: where it is now in the frame (its own box, and its extent with its captions), and where it
  // goes (along: lo; across: its middle, 0 being the level line).
  type Part = { step: Step; own: Box; full: Box; lo: number; length: number; up: number; down: number; at?: [number, number] };
  // A structure's names and numbers under it, and what it carries: they take room beside it.
  const besides = (s: Extract<Step, { kind: "structure" | "text" }>) => [...(s.kind === "structure" ? (out.captions ?? []).filter((c) => c.under?.length && c.under.every((i) => s.atoms.includes(i))).map((c) => o.captionBox(c.id)) : []), ...(s.carry?.boxes ?? [])].filter((b): b is Box => !!b);
  const condRow = (cs: Step[]) => cs.reduce((w, s) => w + (frame(s.box)[2] - frame(s.box)[0]), 0) + (gap / 2) * Math.max(0, cs.length - 1);
  const parts: Part[] = steps.map((s) => {
    if (s.kind === "arrow") {
      const c = r.conditions.get(s.id) ?? { above: [], below: [] }, above = c.above.filter((x) => x.kind === "structure"), below = c.below.filter((x) => x.kind === "structure");
      const own = frame(s.box), text = textWidth([...kept(s.id, "above"), ...kept(s.id, "below")]);
      if (rigid(s)) {
        // As drawn: the arrow reaches a gap past everything by it, either way from its middle.
        const boxes = [...c.above, ...c.below].map((x) => x.box).concat(s.carry!.boxes).map(frame), mid = (own[0] + own[2]) / 2, line = (own[1] + own[3]) / 2;
        const half = Math.max(0, ...boxes.map((b) => Math.max(mid - b[0], b[2] - mid))), hi = Math.max(0, ...boxes.map((b) => b[3] - line)), lo = Math.max(0, ...boxes.map((b) => line - b[1]));
        const length = Math.max(2 * gap, text > 0 ? text + 2 * gap : 0, half > 0 ? 2 * (half + gap) : 0);
        return { step: s, own, full: own, lo: 0, length, up: Math.max(0.2, block(kept(s.id, "above")), n[1] > 0 ? hi : lo), down: Math.max(0.2, block(kept(s.id, "below")), n[1] > 0 ? lo : hi) };
      }
      const widest = Math.max(text, condRow(above), condRow(below));
      const length = Math.max(2 * gap, widest > 0 ? widest + 2 * gap : 0);
      const reach = (side: Step[], text: number) => text + (side.length ? gap / 4 + Math.max(...side.map((x) => frame(x.box)[3] - frame(x.box)[1])) : 0);
      const upReach = reach(above, block(kept(s.id, "above"))), downReach = reach(below, block(kept(s.id, "below")));
      return { step: s, own, full: own, lo: 0, length, up: Math.max(0.2, upReach), down: Math.max(0.2, downReach) };
    }
    const own = frame(s.kind === "structure" ? s.box : o.captionBox(s.id) ?? s.box);
    const extra = s.kind === "structure" || s.kind === "text" ? besides(s).map(frame) : [];
    const full = union([own, ...extra]), mid = (own[1] + own[3]) / 2;
    // up and down: how far it reaches up and down the page from its middle (for wrapped lines).
    const hiC = full[3] - mid, loC = mid - full[1];
    return { step: s, own, full, lo: 0, length: full[2] - full[0], up: flat ? (n[1] > 0 ? hiC : loC) : 0, down: flat ? (n[1] > 0 ? loC : hiC) : 0 };
  });

  // Lines: one, unless the row is wider than the page. A line breaks before an arrow (or, failing that, a plus sign)
  // after the first arrow, so the first line holds the starting materials and their arrow (a line of starting
  // materials alone would read as no reaction); the fewest lines, then the most even.
  const widthOf = (from: number, to: number) => parts.slice(from, to).reduce((w, p) => w + p.length, 0) + gap * Math.max(0, to - from - 1);
  let breaks: number[] = [];
  if (flat && o.width && widthOf(0, parts.length) > o.width) {
    const firstArrow = parts.findIndex((p) => p.step.kind === "arrow"), at = (kind: string) => parts.flatMap((p, k) => (k > firstArrow && p.step.kind === kind ? [k] : []));
    for (const candidates of [at("arrow"), [...new Set([...at("arrow"), ...at("plus")])].sort((p, q) => p - q)]) {
      // best[k]: the fewest lines, then the narrowest widest line, for parts 0..k-1 broken at candidates.
      const ends = [...candidates, parts.length], best = new Map<number, { lines: number; widest: number; cuts: number[] }>([[0, { lines: 0, widest: 0, cuts: [] }]]);
      for (const end of ends) for (const [from, b] of [...best]) {
        // (A first line of one structure alone gains no room: the reaction stays on one line.)
        if (from >= end || (!from && end < 2)) continue;
        const w = widthOf(from, end);
        if (w > o.width && end - from > 1) continue;
        const next = { lines: b.lines + 1, widest: Math.max(b.widest, w), cuts: [...b.cuts, ...(from ? [from] : [])] }, was = best.get(end);
        if (!was || next.lines < was.lines || (next.lines === was.lines && next.widest < was.widest - 1e-9)) best.set(end, next);
      }
      const done = best.get(parts.length);
      if (done && done.widest <= o.width + 1e-9) { breaks = done.cuts; break; }
      if (done) breaks = done.cuts;
    }
  }

  // Along each line, from 0: each part a gap after the one before. Lines go down the page, each centred under the first.
  const lines = [0, ...breaks].map((from, k, all) => parts.slice(from, all[k + 1] ?? parts.length));
  const down = flat ? -Math.sign(n[1]) : 0; // across, the way down the page
  let level = 0, centre = 0;
  lines.forEach((line, k) => {
    let pos = 0;
    for (const p of line) { p.lo = pos; pos += p.length + gap; }
    const width = pos - gap;
    if (!k) centre = width / 2;
    else {
      const shift = centre - width / 2;
      for (const p of line) p.lo += shift;
      const prev = lines[k - 1], below = Math.max(...prev.map((p) => p.down)), above = Math.max(...line.map((p) => p.up));
      level += down * (below + 2 + above);
    }
    for (const p of line) p.at = [p.lo, level];
  });

  // Where the row is anchored: the first structure already laid out by another reaction, else the first part (along)
  // and the first arrow (across).
  const anchor = parts.find((p) => p.step.kind === "structure" && fixed && p.step.atoms.some((i) => fixed.has(i)));
  const firstArrow = parts.find((p) => p.step.kind === "arrow")!;
  const shift: [number, number] = anchor
    ? [anchor.full[0] - anchor.at![0], (anchor.own[1] + anchor.own[3]) / 2 - anchor.at![1]]
    : [parts[0].full[0] - parts[0].at![0], (firstArrow.own[1] + firstArrow.own[3]) / 2 - firstArrow.at![1]];

  // Where each thing goes: the parts, and what goes with them. Each thing moves once (the first part to take it).
  const atomBy = new Map<number, P>(), captionBy = new Map<number, P>(), arrowBy = new Map<number, P>(), shapeBy = new Map<number, P>();
  const endBy = new Map<number, { from?: P; to?: P }>(), arrowAt = new Map<number, [P, P]>();
  const take = <K,>(map: Map<K, P>, key: K, dv: P) => { if (!map.has(key)) map.set(key, dv); };
  // What a part carries moves with it as it is.
  const moveCarry = (k: Carry | undefined, dv: P) => {
    if (!k) return;
    for (const i of k.atoms) take(atomBy, i, dv);
    for (const id of k.captions) take(captionBy, id, dv);
    for (const id of k.arrows) take(arrowBy, id, dv);
    for (const id of k.shapes) take(shapeBy, id, dv);
    for (const [id, end] of k.ends) { const e = endBy.get(id) ?? {}; if (!e[end]) endBy.set(id, { ...e, [end]: dv }); }
  };
  for (const p of parts) {
    const [a, c] = p.at!, s = p.step;
    if (s.kind === "arrow") {
      const tail = world(a + shift[0], c + shift[1]), head = world(a + p.length + shift[0], c + shift[1]), was = arrows.find((x) => x.id === s.id)!;
      arrowAt.set(s.id, [tail, head]);
      const shiftMid: P = [(tail[0] + head[0] - was.from[0] - was.to[0]) / 2, (tail[1] + head[1] - was.from[1] - was.to[1]) / 2];
      moveCarry(s.carry, shiftMid);
      const cond = r.conditions.get(s.id);
      if (rigid(s)) {
        for (const x of [...(cond?.above ?? []), ...(cond?.below ?? [])]) {
          if (x.kind === "text") take(captionBy, x.id, shiftMid);
          if (x.kind === "structure") { for (const i of x.atoms) take(atomBy, i, shiftMid); moveCarry(x.carry, shiftMid); }
        }
        continue;
      }
      // Its structures above and below: a row centred on it, a quarter gap clear of its text.
      for (const side of ["above", "below"] as const) {
        const list = (cond?.[side] ?? []).filter((x): x is Extract<Step, { kind: "structure" }> => x.kind === "structure");
        if (!list.length) continue;
        const sign = side === "above" ? up : -up, base = c + shift[1] + sign * (block(kept(s.id, side)) + gap / 4);
        let x = a + shift[0] + p.length / 2 - condRow(list) / 2;
        for (const t of list) {
          const b = frame(t.box), dv = world(x - b[0], sign > 0 ? base - b[1] : base - b[3]);
          for (const i of t.atoms) take(atomBy, i, dv);
          moveCarry(t.carry, dv);
          x += b[2] - b[0] + gap / 2;
        }
      }
      continue;
    }
    const dv = world(a + shift[0] - p.full[0], c + shift[1] - (p.own[1] + p.own[3]) / 2);
    if (s.kind === "structure") for (const i of s.atoms) take(atomBy, i, dv);
    else take(captionBy, s.id, dv);
    if (s.kind !== "plus") moveCarry(s.carry, dv);
  }
  const by = (q: P, dv: P): P => [q[0] + dv[0], q[1] + dv[1]];
  return {
    ...out,
    atoms: out.atoms.map((x, i) => { const dv = atomBy.get(i); return dv ? { ...x, location: [x.location[0] + dv[0], x.location[1] + dv[1], x.location[2] ?? 0] } : x; }),
    // Conditions placed by hand are laid out from now on, as ChemDraw's Clean Up Reaction lays them out.
    captions: out.captions?.map((x) => {
      const dv = captionBy.get(x.id), { placed: _p, ...auto } = x, y = x.placed && x.on && r.arrows.includes(x.on.arrow) ? auto : x;
      return dv ? { ...y, x: y.x + dv[0], y: y.y + dv[1] } : y;
    }),
    arrows: out.arrows?.map((x) => {
      const at = arrowAt.get(x.id), dv = arrowBy.get(x.id), e = endBy.get(x.id);
      if (at) return { ...x, from: at[0], to: at[1] };
      if (dv) return { ...x, from: by(x.from, dv), to: by(x.to, dv), ...(x.curve ? { curve: { ...x.curve, points: x.curve.points.map((q) => ({ ...q, at: by(q.at, dv), ...(q.c1 ? { c1: by(q.c1, dv) } : {}), ...(q.c2 ? { c2: by(q.c2, dv) } : {}) })) } } : {}) };
      return e ? { ...x, ...(e.from ? { from: by(x.from, e.from) } : {}), ...(e.to ? { to: by(x.to, e.to) } : {}) } : x;
    }),
    shapes: out.shapes?.map((x) => { const dv = shapeBy.get(x.id); return dv ? { ...x, from: by(x.from, dv), to: by(x.to, dv) } : x; }),
  };
}

// Clean Up Reaction on a drawing: lays out every reaction `pick` takes, one after another. A structure one reaction
// has placed stays where it is for the next, so reactions that share a structure stay joined. arrows: the drawing's
// arrows as drawn (grown to fit their text); inkOf: the boxes of a drawing's structures. Returns the drawing, how many
// reactions it laid out, and how many it left as drawn.
// A reaction laid out later can move text that an earlier one read (a spectrum's labels, with every arrow picked).
// Thus the layout runs again on its result until nothing moves (4 times at most), and a second Clean Up Reaction
// moves nothing.
export function cleanUpReactions(drawn: Mol, arrows: Arrow[], inkOf: (mol: Mol) => (atoms: number[]) => Box | undefined, o: Layout, pick: (r: Reaction) => boolean): { mol: Mol; count: number; kept: number } {
  let out = layOutReactions(drawn, drawn, arrows, inkOf, o, pick);
  for (let k = 0; k < 3 && out.count; k++) {
    const again = layOutReactions(out.mol, drawn, arrows, inkOf, o, pick);
    if (samePlaces(out.mol, again.mol)) break;
    out = { ...again, count: Math.max(out.count, again.count) };
  }
  return out;
}
// Whether two drawings have each atom, caption, arrow and shape at the same place.
const samePlaces = (p: Mol, q: Mol) => {
  const at = (m: Mol) => [...m.atoms.flatMap((a) => a.location.slice(0, 2)), ...(m.captions ?? []).flatMap((c) => [c.x, c.y]), ...(m.arrows ?? []).flatMap((a) => [...a.from, ...a.to, ...(a.curve?.points.flatMap((x) => x.at) ?? [])]), ...(m.shapes ?? []).flatMap((x) => [...x.from, ...x.to])];
  const a = at(p), b = at(q);
  return a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 1e-9);
};
// One pass of cleanUpReactions over m. drawn: the drawing that arrows and o.captionBox measure.
function layOutReactions(m: Mol, drawn: Mol, arrows: Arrow[], inkOf: (mol: Mol) => (atoms: number[]) => Box | undefined, o: Layout, pick: (r: Reaction) => boolean): { mol: Mol; count: number; kept: number } {
  const fixed = new Set<number>(), done = new Set<number>(), middle = (x?: Arrow): P => (x ? [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2] : [0, 0]);
  let ink = inkOf(m), count = 0, kept = 0;
  for (const a of arrows.filter((x) => straightArrow(x))) {
    if (done.has(a.id)) continue;
    // The arrows as drawn (grown to fit their text), or as the last reaction left them.
    const now = arrows.map((x) => { const y = m.arrows?.find((z) => z.id === x.id); return y && (y.from !== x.from || y.to !== x.to) && drawn.arrows?.find((z) => z.id === x.id) !== y ? y : x; });
    // Each caption where it is now: its box as drawn, moved as far as the caption (or the arrow it is on) has moved
    // since. A plus sign that clean-up added has the box of a new plus sign.
    const was = m, lo: Layout = { ...o, captionBox: (id) => {
      const b = o.captionBox(id), c = was.captions?.find((x) => x.id === id), d = drawn.captions?.find((x) => x.id === id), q = o.plusBox;
      if (c && !d && c.text === "+") return [c.x + q[0], c.y + q[1], c.x + q[2], c.y + q[3]];
      if (!b || !c || !d || c === d) return b;
      const [p0, p1] = c.on ? middle(was.arrows?.find((x) => x.id === c.on!.arrow)) : [c.x, c.y], [d0, d1] = c.on ? middle(drawn.arrows?.find((x) => x.id === c.on!.arrow)) : [d.x, d.y];
      return [b[0] + p0 - d0, b[1] + p1 - d1, b[2] + p0 - d0, b[3] + p1 - d1];
    } };
    const r = findReaction(m, a.id, now, ink, lo.captionBox);
    if (!r) continue;
    r.arrows.forEach((id) => done.add(id));
    if (!pick(r)) continue;
    // A structure at an end of another reaction's arrow, or of a line it does not carry (a scheme that turns a corner),
    // stays where it is, as does one an earlier reaction placed. A reaction with two such structures is left as
    // drawn: a new layout would pull it away from one of them.
    const ends = now.filter((x) => (straightArrow(x) && !r.arrows.includes(x.id)) || (x.kind === "line" && !r.carried.includes(x.id))).flatMap((x) => [x.from, x.to]);
    const pinned = r.steps.flatMap((s) => (s.kind === "structure" && (s.atoms.some((i) => fixed.has(i)) || ends.some((q) => q[0] > s.box[0] - 1.5 && q[0] < s.box[2] + 1.5 && q[1] > s.box[1] - 1.5 && q[1] < s.box[3] + 1.5)) ? [s.atoms] : []));
    if (pinned.length > 1) { kept++; continue; }
    const next = cleanUpReaction(m, r, now, lo, new Set([...fixed, ...(pinned[0] ?? [])])), inkNext = inkOf(next);
    // A layout that puts what it moves over a structure, text or arrow it leaves where it is, and was clear of
    // before (a wrapped line on a legend below the reaction), is not used.
    if (covers(m, next, ink, inkNext, lo.captionBox)) { kept++; continue; }
    m = next;
    r.atoms.forEach((i) => fixed.add(i));
    ink = inkNext;
    count++;
  }
  return { mol: m, count, kept };
}
// Whether a layout (m to next) moves a structure, text or straight arrow on to one it does not move and was clear of.
function covers(m: Mol, next: Mol, ink: (atoms: number[]) => Box | undefined, inkNext: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): boolean {
  type Thing = { was?: Box; now?: Box };
  const span = (p: P, q: P): Box => [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])];
  const shift = (b: Box | undefined, d: P): Box | undefined => b && [b[0] + d[0], b[1] + d[1], b[2] + d[0], b[3] + d[1]];
  const same = (p?: Box, q?: Box) => !p || !q || p.every((v, k) => Math.abs(v - q[k]) < 1e-6);
  const meet = (p?: Box, q?: Box) => !!p && !!q && p[0] < q[2] - 0.1 && q[0] < p[2] - 0.1 && p[1] < q[3] - 0.1 && q[1] < p[3] - 0.1;
  const things: Thing[] = fragments(m).map((g) => ({ was: ink(g), now: inkNext(g) }));
  const mid = (x?: Arrow): P => (x ? [(x.from[0] + x.to[0]) / 2, (x.from[1] + x.to[1]) / 2] : [0, 0]);
  for (const a of m.arrows ?? []) {
    const b = next.arrows?.find((x) => x.id === a.id);
    if (b && (straightArrow(a) || a.kind === "line")) things.push({ was: span(a.from, a.to), now: span(b.from, b.to) });
  }
  // (A name or number under a structure goes with it; it is not counted apart.)
  for (const c of (m.captions ?? []).filter((x) => !x.under && !x.cycle)) {
    const d = next.captions?.find((x) => x.id === c.id), on = d?.on && m.arrows?.find((x) => x.id === d.on!.arrow), was = mid(on), now = mid(on && next.arrows?.find((x) => x.id === on.id));
    if (d) things.push({ was: captionBox(c.id), now: shift(captionBox(c.id), on ? [now[0] - was[0], now[1] - was[1]] : [d.x - c.x, d.y - c.y]) });
  }
  const moved = things.filter((t) => !same(t.was, t.now)), still = things.filter((t) => same(t.was, t.now));
  return moved.some((t) => still.some((s) => meet(t.now, s.was) && !meet(t.was, s.was)));
}

// Whether a reaction is clean: Clean Up Reaction would change nothing in it (within 0.02 bond lengths).
export function reactionClean(m: Mol, r: Reaction, arrows: Arrow[], o: Layout): boolean {
  const after = cleanUpReaction(m, r, arrows, o);
  if ((after.captions?.length ?? 0) !== (m.captions?.length ?? 0)) return false;
  const near = (p: number[], q: number[]) => Math.abs(p[0] - q[0]) < 0.02 && Math.abs(p[1] - q[1]) < 0.02;
  return r.atoms.every((i) => near(m.atoms[i].location, after.atoms[i].location))
    && (m.arrows ?? []).every((a, k) => near(a.from, after.arrows![k].from) && near(a.to, after.arrows![k].to))
    && (m.captions ?? []).every((c, k) => { const x = after.captions![k]; return near([c.x, c.y], [x.x, x.y]) && c.on?.arrow === x.on?.arrow && c.on?.side === x.on?.side && !c.placed === !x.placed; });
}

// Several structures as Clean up sees them: a row to lay out when they overlap, or when a plus sign stands among
// them (then they read as a reaction's starting materials, and plus is true). atoms: the structures in play
// (all of them when undefined).
export function rowOf(m: Mol, atoms: Set<number> | undefined, ink: (atoms: number[]) => Box | undefined, captionBox: (id: number) => Box | undefined): { steps: Step[]; plus: boolean } | undefined {
  const structures = fragments(m).filter((g) => !atoms || g.some((i) => atoms.has(i))).flatMap((g): Step[] => { const b = ink(g); return b ? [{ kind: "structure", atoms: g, box: b }] : []; });
  if (structures.length < 2) return undefined;
  const all: Box = [Math.min(...structures.map((s) => s.box[0])) - 1, Math.min(...structures.map((s) => s.box[1])) - 1, Math.max(...structures.map((s) => s.box[2])) + 1, Math.max(...structures.map((s) => s.box[3])) + 1];
  const plus = (m.captions ?? []).flatMap((c): Step[] => {
    const b = captionBox(c.id);
    return b && c.text.trim() === "+" && !c.under && !c.on && b[0] >= all[0] && b[2] <= all[2] && b[1] >= all[1] && b[3] <= all[3] ? [{ kind: "plus", id: c.id, box: b }] : [];
  });
  const touch = (p: Box, q: Box) => p[0] < q[2] + 0.3 && q[0] < p[2] + 0.3 && p[1] < q[3] + 0.3 && q[1] < p[3] + 0.3;
  const overlap = structures.some((s, k) => structures.slice(k + 1).some((t) => touch(s.box, t.box)));
  if (!overlap && !plus.length) return undefined;
  // In reading order: by the middle of each, left to right.
  const steps = [...structures, ...plus].sort((p, q) => (p.box[0] + p.box[2]) - (q.box[0] + q.box[2]));
  return { steps, plus: plus.length > 0 };
}

// Lays a row out on one level line (the first structure's middle) with even gaps, from where its left end is.
// Returns the drawing, the level, and where the row ends on the right.
export function layoutRow(m: Mol, steps: Step[], gap: number): { mol: Mol; level: number; right: number } {
  const first = steps.find((s) => s.kind === "structure")!, level = (first.box[1] + first.box[3]) / 2;
  let x = Math.min(...steps.map((s) => s.box[0])), out = m;
  for (const s of steps) {
    const [dx, dy] = [x - s.box[0], level - (s.box[1] + s.box[3]) / 2];
    if (s.kind === "structure") out = moveAtoms(out, new Set(s.atoms), [dx, dy]);
    if (s.kind === "plus" || s.kind === "text") out = { ...out, captions: out.captions?.map((c) => (c.id === s.id ? { ...c, x: c.x + dx, y: c.y + dy } : c)) };
    x += s.box[2] - s.box[0] + gap;
  }
  return { mol: out, level, right: x - gap };
}

// The part structures take in the drawing's reactions, for a Reaxys reaction search (ChemDraw's Reactant search
// and Reaction product search): what goes in (before a reaction's first arrow), what comes out (after its last), or
// either (between two arrows). structures: each one's atoms. undefined: in no reaction. "mixed": more than one
// part (a whole reaction), or some in a reaction and some not.
export type Role = "starting_material" | "product" | "all_reactions";
export function roleOf(reactions: Reaction[], structures: number[][]): Role | "mixed" | undefined {
  const roles = new Set(structures.map((atoms) => {
    for (const r of reactions) {
      const k = r.steps.findIndex((s) => s.kind === "structure" && s.atoms.includes(atoms[0]));
      if (k < 0) continue;
      const arrows = r.steps.flatMap((s, i) => (s.kind === "arrow" ? [i] : []));
      return k < arrows[0] ? "starting_material" : k > arrows[arrows.length - 1] ? "product" : "all_reactions";
    }
    return "none";
  }));
  if (roles.size > 1) return "mixed";
  const [role] = roles;
  return role === "none" ? undefined : role;
}
