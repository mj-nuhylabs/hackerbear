// Rich text in captions: a caption's text as runs, each with its own style (as ChemDraw's text runs, and CDXML's
// <s> elements). A caption without runs is one run in the caption's own style.
export type RunStyle = { bold?: true; italic?: true; underline?: true; script?: "sub" | "super"; font?: string; size?: number; colour?: string };
export type TextRun = RunStyle & { text: string };

const KEYS = ["bold", "italic", "underline", "script", "font", "size", "colour"] as const;
export const sameStyle = (a: RunStyle, b: RunStyle) => KEYS.every((k) => a[k] === b[k]);
export const styleOf = (r: TextRun): RunStyle => Object.fromEntries(KEYS.filter((k) => r[k] !== undefined).map((k) => [k, r[k]])) as RunStyle;
export const plainOf = (runs: TextRun[]) => runs.map((r) => r.text).join("");
export const runsOf = (c: { text: string; runs?: TextRun[] }): TextRun[] => (c.runs?.length ? c.runs : [{ text: c.text }]);
// True when any run has a style of its own (otherwise the caption needs no runs).
export const styled = (runs: TextRun[]) => runs.some((r) => KEYS.some((k) => r[k] !== undefined));

// Neighbours in the same style become one run; empty runs go (one empty run stays for an empty text).
export function normalise(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) out[out.length - 1] = { ...last, text: last.text + r.text };
    else out.push({ ...r });
  }
  return out.length ? out : [{ text: "", ...styleOf(runs[0] ?? { text: "" }) }];
}

// The runs with characters start to end restyled by patch (each run's style in, its new style out).
export function styleRange(runs: TextRun[], start: number, end: number, patch: (s: RunStyle) => RunStyle): TextRun[] {
  const out: TextRun[] = [];
  let at = 0;
  for (const r of runs) {
    const a = at, b = at + r.text.length;
    at = b;
    if (b <= start || a >= end) { out.push(r); continue; }
    const s = Math.max(start, a) - a, e = Math.min(end, b) - a;
    if (s > 0) out.push({ ...r, text: r.text.slice(0, s) });
    out.push({ ...clean(patch(styleOf(r))), text: r.text.slice(s, e) });
    if (e < r.text.length) out.push({ ...r, text: r.text.slice(e) });
  }
  return normalise(out);
}
const clean = (s: RunStyle): RunStyle => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && (v as unknown) !== false)) as RunStyle;

// The style every character from start to end shares (a key is left out where they differ). An empty range gives
// the style of the character before it.
export function common(runs: TextRun[], start: number, end: number): RunStyle {
  const picked: RunStyle[] = [];
  let at = 0;
  for (const r of runs) {
    const a = at, b = at + r.text.length;
    at = b;
    if (start === end ? a < start && start <= b : b > start && a < end) picked.push(styleOf(r));
  }
  if (!picked.length) return runs.length ? styleOf(runs[0]) : {};
  return Object.fromEntries(KEYS.filter((k) => picked.every((s) => s[k] === picked[0][k]) && picked[0][k] !== undefined).map((k) => [k, picked[0][k]])) as RunStyle;
}

// A caption as a whole: its own style, with the style all its runs share over it (a font picked for the whole caption,
// or Subscript on it, moves its bold, italic and underline into the runs). What the style buttons show for it.
export const whole = <T extends { text: string; runs?: TextRun[] }>(c: T): T & RunStyle => (c.runs?.length ? { ...c, ...common(c.runs, 0, c.text.length) } : c);
// The runs without the styles named, so a style set on the whole caption shows on all of it.
export const without = (runs: TextRun[], keys: string[]): TextRun[] =>
  normalise(runs.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))) as TextRun));

// A caption's colour when its text is closed: a colour every character has (its run's own, else the caption's)
// becomes the caption's own colour (none for the document's ink), and the runs lose it, as the CDXML reader does with
// a colour all the <s> runs share. Other colours stay on their runs. runs: none when nothing else is styled.
export function shareColour(runs: TextRun[] | undefined, own: string | undefined, ink: string): { colour?: string; runs?: TextRun[] } {
  const all = (runs ?? []).filter((r) => r.text).map((r) => r.colour ?? own ?? ink);
  if (!runs || !all.length || all.some((c) => c.toLowerCase() !== all[0].toLowerCase())) return { colour: own, runs };
  const rest = without(runs, ["colour"]);
  return { colour: all[0].toLowerCase() === ink.toLowerCase() ? undefined : all[0], runs: styled(rest) ? rest : undefined };
}

// The runs with each line trimmed and empty lines left out, as an atom label keeps its text (edit.ts setLabel); each
// character keeps its style.
export function trimLines(runs: TextRun[]): TextRun[] {
  const chars = runs.flatMap((r) => r.text.split("").map((ch) => ({ ...styleOf(r), text: ch }))), out: TextRun[] = [];
  let line: TextRun[] = [];
  const end = () => {
    let a = 0, b = line.length;
    while (a < b && /\s/.test(line[a].text)) a++;
    while (b > a && /\s/.test(line[b - 1].text)) b--;
    if (a < b) out.push(...(out.length ? [{ text: "\n" }] : []), ...line.slice(a, b));
    line = [];
  };
  for (const c of chars) { if (c.text === "\n") end(); else line.push(c); }
  end();
  return normalise(out);
}

// An atom label's text styles from its runs as typed: bold, italic and underline only. What every character has is the
// label's own; the rest stays in runs (none when no character differs). A label is never partly another font or size.
export function labelStyle(runs: TextRun[]): { bold?: true; italic?: true; underline?: true; runs?: TextRun[] } {
  // Superscript and subscript (issue 44) stay on the characters: a label has no script of its own.
  const only = normalise(runs.map((r) => ({ text: r.text, ...(r.bold ? { bold: true as const } : {}), ...(r.italic ? { italic: true as const } : {}), ...(r.underline ? { underline: true as const } : {}), ...(r.script ? { script: r.script } : {}) })));
  const { script: _, ...all } = common(only, 0, plainOf(only).length) as { bold?: true; italic?: true; underline?: true; script?: string }, rest = without(only, Object.keys(all));
  return { ...all, ...(styled(rest) ? { runs: rest } : {}) };
}

// The runs after the text was typed to `next`: what changed is found by the longest common start and end, and
// new characters take `pending` (a style set with nothing selected) or the style of the character before them.
export function edited(runs: TextRun[], next: string, pending?: RunStyle): TextRun[] {
  const old = plainOf(runs);
  let p = 0;
  while (p < old.length && p < next.length && old[p] === next[p]) p++;
  let s = 0;
  while (s < old.length - p && s < next.length - p && old[old.length - 1 - s] === next[next.length - 1 - s]) s++;
  const inserted = next.slice(p, next.length - s), style = pending ?? common(runs, p, p);
  const keep = (from: number, to: number) => {
    const out: TextRun[] = [];
    let at = 0;
    for (const r of runs) {
      const a = at, b = at + r.text.length;
      at = b;
      const x = Math.max(from, a), y = Math.min(to, b);
      if (y > x) out.push({ ...r, text: r.text.slice(x - a, y - a) });
    }
    return out;
  };
  return normalise([...keep(0, p), ...(inserted ? [{ ...style, text: inserted }] : []), ...keep(old.length - s, old.length)]);
}

// The runs line by line (split at each newline).
export function lines(runs: TextRun[]): TextRun[][] {
  const out: TextRun[][] = [[]];
  for (const r of runs) {
    r.text.split("\n").forEach((part, i) => {
      if (i) out.push([]);
      if (part) out[out.length - 1].push({ ...r, text: part });
    });
  }
  return out;
}

// Soft line breaks for a caption with a width (ChemDraw's caption width): each line breaks at the last space that
// keeps it no wider than max, and a word wider than max goes on a line of its own. A breaking space becomes a line
// break, so every character keeps its place. width: how wide a piece of text is in a run's style. soft: the places
// of the breaks made.
export function wrap(runs: TextRun[], max: number, width: (text: string, style: RunStyle) => number): { runs: TextRun[]; soft: number[] } {
  const text = plainOf(runs), soft: number[] = [];
  const measure = (a: number, b: number) => {
    let w = 0, at = 0;
    for (const r of runs) {
      const s = Math.max(a, at), e = Math.min(b, at + r.text.length);
      if (e > s) w += width(r.text.slice(s - at, e - at), styleOf(r));
      at += r.text.length;
    }
    return w;
  };
  let start = 0;
  for (const line of text.split("\n")) {
    const end = start + line.length;
    let from = start;
    while (measure(from, end) > max) {
      let brk = -1;
      for (let i = from + 1; i < end; i++) {
        if (text[i] !== " ") continue;
        if (measure(from, i) <= max || brk < 0) brk = i;
        if (measure(from, i) > max) break;
      }
      if (brk < 0) break;
      soft.push(brk);
      from = brk + 1;
    }
    start = end + 1;
  }
  if (!soft.length) return { runs, soft };
  const breaks = new Set(soft);
  let at = 0;
  return { runs: runs.map((r) => { const t = r.text.split("").map((ch, k) => (breaks.has(at + k) ? "\n" : ch)).join(""); at += r.text.length; return { ...r, text: t }; }), soft };
}
