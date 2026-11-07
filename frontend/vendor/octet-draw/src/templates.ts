// The user's own templates for the Ring and Template tools, added by name or from the drawing. Each is kept as an
// .octet file in the settings (Octet's clipboard format), so it keeps everything that was selected (text, arrows,
// shapes, curves, groups, colours) and loading one goes through the same checks as opening a file. set: the named
// set it is in (the library's own category); unset is My templates.
import { normalise } from "./edit.ts";
import { parse, serialize } from "./file.ts";
import type { Mol } from "./render.ts";

export type Template = { id: string; name: string; mol: Mol; set?: string };
export type SavedTemplate = { id: string; name: string; file: string; set?: string };
export const MY_SET = "My templates";
// The tool a template is used with: the Ring tool (its Templates row) or the Template tool.
export type TemplateTool = "ring" | "template";

// A big template with rings (a pyranose, a ligand) reads best at icon size as its rings alone: the bonds in rings and
// their atoms. A bond is in a ring when its ends stay joined without it.
export function ringsOnly(m: Mol): Mol {
  if (m.atoms.length <= 9) return m;
  const joined = (skip: number, a: number, b: number) => {
    const seen = new Set([a]), todo = [a];
    while (todo.length) {
      const x = todo.pop()!;
      if (x === b) return true;
      m.bonds.forEach((bd, k) => { if (k === skip || !bd.atoms.includes(x)) return; const y = bd.atoms[0] === x ? bd.atoms[1] : bd.atoms[0]; if (!seen.has(y)) { seen.add(y); todo.push(y); } });
    }
    return false;
  };
  const ring = m.bonds.filter((b, k) => joined(k, b.atoms[0], b.atoms[1]));
  if (!ring.length) return m;
  const keep = [...new Set(ring.flatMap((b) => b.atoms))], at = new Map(keep.map((i, k) => [i, k]));
  return { atoms: keep.map((i) => m.atoms[i]), bonds: ring.map((b) => ({ ...b, atoms: [at.get(b.atoms[0])!, at.get(b.atoms[1])!] as [number, number] })) };
}

// A template's icon reads at toolbar size (20 px) when it is small: at most 9 atoms, or as its rings alone (ringsOnly)
// at most 14 atoms in one ring system. Adenosine (a purine and a ribose) does not (issue 29).
export function legible(whole: Mol): boolean {
  if (whole.atoms.length <= 9) return true;
  const m = ringsOnly(whole);
  if (m.atoms.length > 14) return false;
  const root = m.atoms.map((_, i) => i), find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const b of m.bonds) root[find(b.atoms[0])] = find(b.atoms[1]);
  return new Set(m.atoms.map((_, i) => find(i))).size <= 1;
}

// A template's variant name in the Ring tool's list.
export const templateKind = (id: string) => `custom:${id}`;
// The id of one of the user's templates from its kind, or undefined for a built-in one.
export const ownId = (kind: string) => (kind.startsWith("custom:") ? kind.slice(7) : undefined);
// A structure the library's search found by name or abbreviation (TREN, a name OPSIN reads), as a template: its kind,
// and the name from a kind (undefined for any other kind).
export const namedKind = (name: string) => `name:${name}`;
export const kindName = (kind: string) => (kind.startsWith("name:") ? kind.slice(5) : undefined);
// A set's name as it is kept: trimmed, at most 40 characters.
export const setName = (name: string) => name.trim().slice(0, 40);
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Templates read from their file text once: the same text gives the same structure each time the settings change, so
// its thumbnail is drawn once, and a template edited (new text) is drawn again.
const read = new Map<string, Mol>();
const readKept = (file: string) => {
  let mol = read.get(file);
  if (!mol) {
    mol = parse(file);
    if (read.size >= 2000) read.clear();
    read.set(file, mol);
  }
  return mol;
};
// Whether a drawing has something a template can hold.
export const hasContent = (m: Mol) => !!(m.atoms.length || m.captions?.length || m.arrows?.length || m.shapes?.length);

export function loadTemplates(saved: unknown): Template[] {
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((t: Partial<SavedTemplate>) => {
    try {
      if (typeof t?.id !== "string" || typeof t.name !== "string" || typeof t.file !== "string") return [];
      const mol = readKept(t.file), set = typeof t.set === "string" && setName(t.set) && setName(t.set) !== MY_SET ? setName(t.set) : undefined;
      return hasContent(mol) ? [{ id: t.id, name: t.name.slice(0, 80), mol, ...(set ? { set } : {}) }] : [];
    } catch {
      return [];
    }
  });
}

export const newTemplate = (name: string, mol: Mol, set?: string): SavedTemplate =>
  ({ id: newId(), name: name.trim().slice(0, 80), file: serialize(normalise(mol)), ...(set && set !== MY_SET ? { set } : {}) });

// What the library changes, as kept in the settings: the user's templates and their named sets (My templates is
// always first and is not listed), and the floating palettes open. Each change gives the settings back unchanged when
// it cannot be made.
export type Kept = { templates: SavedTemplate[]; templateSets: string[]; palettes?: FloatingPalette[] };
// The set a template goes into: one of the user's sets, else My templates.
const into = (s: Kept, set?: string) => (set && s.templateSets.includes(set) ? set : undefined);
// A template in a set (none: My templates).
const inSet = (t: SavedTemplate, set?: string): SavedTemplate => { const c = { ...t }; delete c.set; return set ? { ...c, set } : c; };
const sameSet = (a: SavedTemplate, b: SavedTemplate) => (a.set ?? "") === (b.set ?? "");

// A template added at the end of a set.
export const addTo = <S extends Kept>(s: S, t: SavedTemplate, set?: string): S => {
  return { ...s, templates: [...s.templates, inSet(t, into(s, set))] };
};
// A template's new name: trimmed, at most 80 characters, never empty.
export const renameTemplate = <S extends Kept>(s: S, id: string, name: string): S => {
  const to = name.trim().slice(0, 80);
  return to && s.templates.some((t) => t.id === id && t.name !== to) ? { ...s, templates: s.templates.map((t) => (t.id === id ? { ...t, name: to } : t)) } : s;
};
// A template moved to another set goes at that set's end.
export const moveTemplate = <S extends Kept>(s: S, id: string, set: string): S => {
  const to = into(s, set), t = s.templates.find((x) => x.id === id);
  if (!t || t.set === to) return s;
  return { ...s, templates: [...s.templates.filter((x) => x.id !== id), inSet(t, to)] };
};
// The order of a set (CD-32; ChemDraw orders panes in rows and columns): a template put just before another template
// of its set, or with before unset, at the end of its set. Templates of other sets keep their places.
export const placeTemplate = <S extends Kept>(s: S, id: string, before?: string): S => {
  const t = s.templates.find((x) => x.id === id);
  if (!t || before === id) return s;
  const rest = s.templates.filter((x) => x.id !== id);
  let at = rest.findIndex((x) => x.id === before && sameSet(x, t));
  if (before === undefined) { at = rest.length; while (at > 0 && !sameSet(rest[at - 1], t)) at--; }
  if (at < 0 || (before === undefined && at === 0)) return s;
  const templates = [...rest.slice(0, at), t, ...rest.slice(at)];
  return templates.every((x, k) => x === s.templates[k]) ? s : { ...s, templates };
};
// Move to start and Move to end, in a template's menu.
export const templateToStart = <S extends Kept>(s: S, id: string): S => {
  const t = s.templates.find((x) => x.id === id), first = t && s.templates.find((x) => sameSet(x, t));
  return first ? placeTemplate(s, id, first.id) : s;
};
export const templateToEnd = <S extends Kept>(s: S, id: string): S => placeTemplate(s, id);
// A template's drawing changed (Edit, then Save): its name, set and place stay. A drawing with nothing in it changes
// nothing.
export const updateTemplate = <S extends Kept>(s: S, id: string, mol: Mol): S => {
  if (!hasContent(mol) || !s.templates.some((t) => t.id === id)) return s;
  const file = serialize(normalise(mol));
  return { ...s, templates: s.templates.map((t) => (t.id === id ? { ...t, file } : t)) };
};
// A copy of one of the user's templates, just after it in its set, named "… copy".
export const duplicateTemplate = <S extends Kept>(s: S, id: string): S => {
  const k = s.templates.findIndex((t) => t.id === id);
  if (k < 0) return s;
  const t = s.templates[k], copy = { ...t, id: newId(), name: `${t.name.slice(0, 75)} copy` };
  return { ...s, templates: [...s.templates.slice(0, k + 1), copy, ...s.templates.slice(k + 1)] };
};
export const removeTemplate = <S extends Kept>(s: S, id: string): S => ({ ...s, templates: s.templates.filter((t) => t.id !== id) });
// A name a new set can take: not empty, not My templates, not one the user has.
export const freeSetName = (s: Kept, name: string) => { const n = setName(name); return !!n && n !== MY_SET && !s.templateSets.includes(n); };
export const addSet = <S extends Kept>(s: S, name: string): S => (freeSetName(s, name) && s.templateSets.length < 50 ? { ...s, templateSets: [...s.templateSets, setName(name)] } : s);
// A name for a set that is free: the name, or the name and the first number that makes it free ("Aromatics 2").
export const freeName = (s: Kept, name: string) => {
  const base = setName(name) || "Templates";
  if (freeSetName(s, base)) return base;
  for (let n = 2; ; n++) { const next = `${base.slice(0, 36)} ${n}`; if (freeSetName(s, next)) return next; }
};
// A set renamed: its templates and its floating palette go with it.
export const renameSet = <S extends Kept>(s: S, from: string, name: string): S => {
  const to = setName(name);
  if (!s.templateSets.includes(from) || !freeSetName(s, to)) return s;
  return { ...s, templateSets: s.templateSets.map((x) => (x === from ? to : x)), templates: s.templates.map((t) => (t.set === from ? { ...t, set: to } : t)),
    ...(s.palettes ? { palettes: s.palettes.map((p) => (p.set === from ? { ...p, set: to } : p)) } : {}) };
};
// A set removed: its templates go to My templates, and its floating palette closes.
export const removeSet = <S extends Kept>(s: S, name: string): S =>
  ({ ...s, templateSets: s.templateSets.filter((x) => x !== name), templates: s.templates.map((t) => (t.set === name ? inSet(t) : t)),
    ...(s.palettes ? { palettes: s.palettes.filter((p) => p.set !== name) } : {}) });
// The templates of a file (a ChemDraw template document) as a new set, named after the file (with a number when the
// user has a set of that name), in order. No set when the user has as many sets as Octet keeps.
export const addSetOf = <S extends Kept>(s: S, name: string, list: { name: string; mol: Mol }[]): { kept: S; set?: string } => {
  if (s.templateSets.length >= 50) return { kept: s };
  const set = freeName(s, name), added = addSet(s, set);
  return { kept: { ...added, templates: [...added.templates, ...list.map((t) => newTemplate(t.name, t.mol, set))] }, set };
};

// The size templates are shown at, in the library and in each floating palette (ChemDraw's pane size, which a template
// palette's corner sets). Anything else read from the settings is medium.
export type TemplateSize = "small" | "medium" | "large";
export const TEMPLATE_SIZES: TemplateSize[] = ["small", "medium", "large"];
export const readSize = (v: unknown): TemplateSize => (v === "small" || v === "large" ? v : "medium");

// ——— Floating palettes ———
// A set torn off into a small palette that stays open beside the canvas, as ChemDraw's template palettes: the set (one
// of Octet's or the user's), the tool its templates go to, where its top left corner is (px from the window's top
// left), how many columns it shows and its template size. Kept in the settings, so open palettes come back where they
// were.
export type FloatingPalette = { set: string; tool: TemplateTool; x: number; y: number; columns: number; size: TemplateSize };
export const PALETTE_COLUMNS = 3, MOST_PALETTES = 12;
const whole = (n: unknown, lo: number, hi: number, or: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : or);
export function readPalettes(v: unknown): FloatingPalette[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((p: Partial<FloatingPalette> | null): FloatingPalette[] => {
    if (!p || typeof p !== "object" || typeof p.set !== "string" || !setName(p.set) || seen.has(setName(p.set))) return [];
    seen.add(setName(p.set));
    return [{ set: setName(p.set), tool: p.tool === "ring" ? "ring" : "template", x: whole(p.x, 0, 10000, 80), y: whole(p.y, 0, 10000, 96), columns: whole(p.columns, 1, 8, PALETTE_COLUMNS), size: readSize(p.size) }];
  }).slice(-MOST_PALETTES);
}
// A set's palette opened (at `at`, or a little down and right of the last one), or brought to the front when it is open
// already: the last in the list is drawn on top.
export const openPalette = (list: FloatingPalette[], set: string, tool: TemplateTool, at?: { x: number; y: number }): FloatingPalette[] => {
  const open = list.find((p) => p.set === set);
  if (open) return [...list.filter((p) => p !== open), at ? { ...open, ...at } : open];
  const last = list[list.length - 1], place = at ?? (last ? { x: last.x + 24, y: last.y + 24 } : { x: 80, y: 96 });
  return readPalettes([...list, { set, tool, ...place, columns: PALETTE_COLUMNS, size: "medium" }]);
};
export const closePalette = (list: FloatingPalette[], set: string) => list.filter((p) => p.set !== set);
// A palette moved (x, y), made wider or narrower (columns) or given another template size, within Octet's limits.
export const changePalette = (list: FloatingPalette[], set: string, change: Partial<Pick<FloatingPalette, "x" | "y" | "columns" | "size">>) =>
  list.map((p) => (p.set === set ? readPalettes([{ ...p, ...change }])[0] ?? p : p));
