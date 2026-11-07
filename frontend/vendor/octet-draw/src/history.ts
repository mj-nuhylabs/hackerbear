// Undo history: every edit pushes a new Mol; undo and redo move along the list.
// merge: edits with the same key one after another (a slider being dragged) make one step.
// The oldest steps go when there are more than 1000, or when the steps hold more than 2,000,000 objects (atoms, bonds,
// captions and the rest) in all, so a long session on a large drawing does not fill the memory (issue 2). The last
// 200 steps always stay: a 10,000-atom drawing keeps 200.
import type { Mol } from "./render.ts";

export type History = { stack: Mol[]; at: number; merge?: string };
// amend: the step now showing changed, with no step of its own (an experiment page's box grown for the table an edit
// made, so one Undo takes back both).
export type Action = { type: "set"; mol: Mol; merge?: string } | { type: "amend"; mol: Mol } | { type: "undo" } | { type: "redo" } | { type: "reset"; h: History };
export const MOST_STEPS = 1000, FEWEST_STEPS = 200, MOST_OBJECTS = 2_000_000;

const objects = (m: Mol) => Object.values(m).reduce((n: number, v) => n + (Array.isArray(v) ? v.length : 0), 1);
function trimmed(h: History): History {
  let drop = Math.max(0, h.stack.length - MOST_STEPS), held = 0;
  for (let i = drop; i < h.stack.length; i++) held += objects(h.stack[i]);
  while (h.stack.length - drop > FEWEST_STEPS && held > MOST_OBJECTS) held -= objects(h.stack[drop++]);
  return drop ? { ...h, stack: h.stack.slice(drop), at: h.at - drop } : h;
}

export function history(h: History, a: Action): History {
  // A drawing of its own with its own steps (a template opened to edit), or the drawing set aside for it, back.
  if (a.type === "reset") return a.h;
  if (a.type === "undo") return { ...h, at: Math.max(0, h.at - 1), merge: undefined };
  if (a.type === "redo") return { ...h, at: Math.min(h.stack.length - 1, h.at + 1), merge: undefined };
  if (a.type === "amend") return a.mol === h.stack[h.at] ? h : { ...h, stack: h.stack.map((m, k) => (k === h.at ? a.mol : m)) };
  if (a.mol === h.stack[h.at]) return h;
  if (a.merge && a.merge === h.merge && h.at === h.stack.length - 1 && h.at > 0) return { stack: [...h.stack.slice(0, h.at), a.mol], at: h.at, merge: a.merge };
  return trimmed({ stack: [...h.stack.slice(0, h.at + 1), a.mol], at: h.at + 1, merge: a.merge });
}
