// Typing Greek and the other signs chemistry needs without leaving the keyboard (issue 25): \delta becomes δ when
// the text is kept, \Delta becomes Δ, \leq becomes ≤. The idea and the first table are Prof. Stefan Schramm's (PR 42).
//
// The names are LaTeX's, and a name is replaced only when it matches exactly, as in LaTeX: the name is every letter
// after the backslash, so \leq is ≤ (never ≤ and a q), and \DeltaT, \number, C:\new\data and \temp\pictures stay as
// typed. A space after a name stays, so \Delta T is Δ T; \Delta{}T is ΔT, and the {} goes. A backslash after a
// backslash is not a name's, so \\delta stays as typed.
//
// The characters are real Unicode, never a Latin letter in the Symbol font (cdxml.ts leaves Symbol out), so the text
// stays right to search, copy and read aloud. Text from a file or the clipboard is never expanded: only text typed.
// Each text box keeps, as `keep`, the text it opened with and what was pasted into it (keptText), and as many of
// each name as those hold stay as they are, from the left.
import { normalise, styleOf, type TextRun } from "./richtext.ts";

export const ESCAPES: Record<string, string> = {
  // Greek, lower case, then the capitals that differ from Latin ones (LaTeX's rule: the capitalised name).
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "φ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  // Signs.
  circ: "°", degree: "°", textdegree: "°", pm: "±", mp: "∓", times: "×", div: "÷", cdot: "·", minus: "−",
  le: "≤", leq: "≤", ge: "≥", geq: "≥", ne: "≠", neq: "≠", approx: "≈", sim: "∼", equiv: "≡", propto: "∝", infty: "∞",
  prime: "′", dprime: "″", permil: "‰", textperthousand: "‰", sqrt: "√", partial: "∂", nabla: "∇", int: "∫", sum: "∑",
  cdots: "⋯", ldots: "…", dots: "…", hbar: "ħ", AA: "Å", angstrom: "Å", micro: "µ",
  // Arrows.
  to: "→", rightarrow: "→", gets: "←", leftarrow: "←", leftrightarrow: "↔", rightleftharpoons: "⇌", uparrow: "↑", downarrow: "↓",
  // Marks on a species or a state.
  ddagger: "‡", dagger: "†", bullet: "•", ast: "✱",
};

// Each name to replace in `text`: where its backslash is, how many characters go, and what comes instead. As many of
// each name as `keep` holds are left as they are, from the left.
function* found(text: string, keep = ""): Generator<{ at: number; eats: number; to: string; name: string }> {
  if (!text.includes("\\")) return;
  const left = new Map<string, number>();
  if (keep.includes("\\")) for (const r of found(keep)) left.set(r.name, (left.get(r.name) ?? 0) + 1);
  for (const m of text.matchAll(/\\([A-Za-z]+)(\{\})?/g)) {
    const to = Object.prototype.hasOwnProperty.call(ESCAPES, m[1]) ? ESCAPES[m[1]] : undefined; // never "constructor"
    if (to === undefined || text[m.index! - 1] === "\\") continue;
    const n = left.get(m[1]) ?? 0;
    if (n) { left.set(m[1], n - 1); continue; }
    yield { at: m.index!, eats: m[0].length, to, name: m[1] };
  }
}

// `text` with every name replaced, but those `keep` holds.
export function expandEscapes(text: string, keep = ""): string {
  let out = "", from = 0;
  for (const r of found(text, keep)) { out += text.slice(from, r.at) + r.to; from = r.at + r.eats; }
  return from ? out + text.slice(from) : text;
}

// Rich text with every name replaced, but those `keep` holds. A name may cross runs; its character takes the style
// of the backslash.
export function expandRuns(runs: TextRun[], keep = ""): TextRun[] {
  const text = runs.map((r) => r.text).join("");
  if (expandEscapes(text, keep) === text) return runs;
  const style = runs.flatMap((r) => Array.from({ length: r.text.length }, () => styleOf(r))), out: TextRun[] = [];
  let from = 0;
  const copy = (to: number) => { for (let i = from; i < to; i++) out.push({ ...style[i], text: text[i] }); };
  for (const r of found(text, keep)) { copy(r.at); out.push({ ...style[r.at], text: r.to }); from = r.at + r.eats; }
  copy(text.length);
  return normalise(out);
}

// Text pasted into each text box still open (a box that has closed is gone from the page, and its pastes with it).
const pastes: { box: Element; text: string }[] = [];
if (typeof document !== "undefined") document.addEventListener("paste", (e) => {
  const text = e.clipboardData?.getData("text/plain"), box = e.target instanceof Element ? e.target.closest("input, textarea, [contenteditable]") : null;
  if (box && text?.includes("\\")) pastes.push({ box, text });
}, true);
// What a text box keeps as it is: the text it opened with and every paste into a box still open.
export function keptText(opened = ""): string {
  for (let i = pastes.length - 1; i >= 0; i--) if (!pastes[i].box.isConnected) pastes.splice(i, 1);
  return [opened, ...pastes.map((p) => p.text)].join("\n");
}
