// Projects on Home (decision 0003), shown as folders: a project is a list in Octet that points at drawings. The files
// stay where they are, and a project that goes takes no drawing with it. A drawing is in one folder at most, as a file
// is: putting it in a folder takes it out of the one it was in. The store also keeps the thumbnails the user chose (src/thumbs.ts) and, for drawings in
// projects, a copy of their automatic picture (a recent drawing's picture goes when it leaves the recent list).
// The app keeps the store's text in home.json (src-tauri/src/home.rs), which lets a project take only drawings Octet
// may open already. Every function here gives a new store and never changes the one it is given.
// The store has a version. A later Octet that changes its shape reads version 1 and writes its own; this one reads
// nothing from a later version (and the app does not let it write over one).
// A project has a colour (its folder on Home; Octet Blue unless the user picks another) and the time a drawing last
// went in or came out (used). A store from before one folder at a time (a drawing in several projects) keeps each
// drawing in the project used last (home.rs does the same).

export const STORE_VERSION = 1;
export const MAX_PROJECTS = 200, MAX_IN_PROJECT = 1000, MAX_NAME = 60, MAX_PATH = 4096;
export const UNTITLED = "Untitled folder";
export const PROJECT_COLOUR = "#213C99"; // Octet Blue
const COLOUR = /^#[0-9a-f]{6}$/i;

export type ProjectDrawing = { path: string; name: string; added: number }; // added: seconds since 1970
export type Project = { id: string; name: string; made: number; thumb?: string; colour?: string; used?: number; drawings: ProjectDrawing[] };
export type Pictures = { own?: string; auto?: string }; // thumbnail ids: the user's, and Octet's copy of the drawing
export type HomeStore = { version: number; projects: Project[]; pictures: Record<string, Pictures> };
export type StoreProblem = "damaged" | "newer";

export const emptyStore = (): HomeStore => ({ version: STORE_VERSION, projects: [], pictures: {} });
const THUMB = /^[0-9a-f]{16}$/, ID = /^[\w-]{1,40}$/;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const time = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const thumbId = (v: unknown) => (typeof v === "string" && THUMB.test(v) ? v : undefined);
const pathOk = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < MAX_PATH;

// A project's name as typed: no control characters, spaces closed up, 60 characters at most.
export const cleanName = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
// A drawing's name, from its file: the name without the folder or the extension.
export const drawingName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.(octet|oct|cdxml|cdx)$/i, "");
// A drawing's place with the user's home folder as ~ (Mac and Linux, where people know ~), for its tooltip.
export function tilde(path: string, home?: string): string {
  const h = home?.replace(/\/+$/, "");
  return h && h.startsWith("/") && path.startsWith(`${h}/`) ? `~${path.slice(h.length)}` : path;
}
// A new project's id.
export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);

// A name no other project has (letter case aside): the name, or the name and the next free number.
export function freeName(store: HomeStore, name = UNTITLED): string {
  const taken = new Set(store.projects.map((p) => p.name.toLowerCase())), base = cleanName(name) || UNTITLED;
  for (let n = 1; ; n++) {
    const tried = n === 1 ? base : `${base.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
    if (!taken.has(tried.toLowerCase())) return tried;
  }
}

// The store from home.json's text: empty for no file, and empty with a problem for a file that is damaged or from a
// later Octet. Each part that is wrong is left out on its own, so one bad entry loses only that entry.
export function readStore(text: string | null | undefined): { store: HomeStore; problem?: StoreProblem } {
  if (!text) return { store: emptyStore() };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { store: emptyStore(), problem: "damaged" }; }
  if (!isObject(raw) || typeof raw.version !== "number" || !Array.isArray(raw.projects)) return { store: emptyStore(), problem: "damaged" };
  if (raw.version > STORE_VERSION) return { store: emptyStore(), problem: "newer" };
  const ids = new Set<string>(), projects: Project[] = [];
  for (const p of raw.projects) {
    if (!isObject(p) || typeof p.id !== "string" || !ID.test(p.id) || ids.has(p.id) || typeof p.name !== "string" || !cleanName(p.name)) continue;
    ids.add(p.id);
    const seen = new Set<string>(), drawings: ProjectDrawing[] = [];
    for (const d of Array.isArray(p.drawings) ? p.drawings : []) {
      if (!isObject(d) || !pathOk(d.path) || seen.has(d.path)) continue;
      seen.add(d.path);
      drawings.push({ path: d.path, name: typeof d.name === "string" && d.name ? d.name.slice(0, 512) : drawingName(d.path), added: time(d.added) });
    }
    const thumb = thumbId(p.thumb), colour = typeof p.colour === "string" && COLOUR.test(p.colour) ? p.colour.toUpperCase() : undefined, used = time(p.used);
    projects.push({ id: p.id, name: cleanName(p.name), made: time(p.made), ...(thumb ? { thumb } : {}), ...(colour ? { colour } : {}), ...(used ? { used } : {}), drawings: drawings.slice(0, MAX_IN_PROJECT) });
  }
  const pictures: Record<string, Pictures> = {};
  for (const [path, v] of Object.entries(isObject(raw.pictures) ? raw.pictures : {})) {
    if (!pathOk(path) || !isObject(v)) continue;
    const own = thumbId(v.own), auto = thumbId(v.auto);
    if (own || auto) pictures[path] = { ...(own ? { own } : {}), ...(auto ? { auto } : {}) };
  }
  return { store: { version: STORE_VERSION, projects: oneFolder(projects.slice(0, MAX_PROJECTS)), pictures } };
}

// When a project was last used: a drawing went in or came out, else when it was made.
export const lastUsed = (p: Project) => Math.max(p.made, p.used ?? 0);
// Each drawing in one project only: the one used last (the first of them on a tie).
function oneFolder(projects: Project[]): Project[] {
  const home = new Map<string, Project>();
  for (const p of projects) for (const d of p.drawings) { const was = home.get(d.path); if (!was || lastUsed(p) > lastUsed(was)) home.set(d.path, p); }
  return projects.map((p) => (p.drawings.every((d) => home.get(d.path) === p) ? p : { ...p, drawings: p.drawings.filter((d) => home.get(d.path) === p) }));
}

export const writeStore = (store: HomeStore) => JSON.stringify({ ...store, version: STORE_VERSION });

const change = (store: HomeStore, id: string, f: (p: Project) => Project): HomeStore => ({ ...store, projects: store.projects.map((p) => (p.id === id ? f(p) : p)) });
export const projectOf = (store: HomeStore, id: string | undefined) => store.projects.find((p) => p.id === id);
// The projects a drawing is in (one at most, but a list keeps the callers simple).
export const projectsWith = (store: HomeStore, path: string) => store.projects.filter((p) => p.drawings.some((d) => d.path === path));
// The folder a drawing is in, if any.
export const folderOf = (store: HomeStore, path: string): Project | undefined => projectsWith(store, path)[0];
export const canCreate = (store: HomeStore) => store.projects.length < MAX_PROJECTS;

// A new project, after the others. With no name, or a name another project has, it takes a free one.
export function createProject(store: HomeStore, name: string, id: string, now: number): HomeStore {
  if (!canCreate(store) || store.projects.some((p) => p.id === id)) return store;
  return { ...store, projects: [...store.projects, { id, name: freeName(store, name), made: now, drawings: [] }] };
}

// A project's new name. An empty name changes nothing; a name another project has takes the next free one.
export function renameProject(store: HomeStore, id: string, name: string): HomeStore {
  const clean = cleanName(name), p = projectOf(store, id);
  if (!p || !clean || clean === p.name) return store;
  const others = { ...store, projects: store.projects.filter((x) => x.id !== id) };
  return change(store, id, (x) => ({ ...x, name: freeName(others, clean) }));
}

// A project goes; its drawings stay where they are. drop: thumbnails nothing uses any more (its own, and the
// automatic pictures of drawings in no other project).
export function deleteProject(store: HomeStore, id: string): { store: HomeStore; drop: string[] } {
  const p = projectOf(store, id);
  if (!p) return { store, drop: [] };
  let next: HomeStore = { ...store, projects: store.projects.filter((x) => x.id !== id) };
  const drop = p.thumb ? [p.thumb] : [];
  for (const d of p.drawings) {
    const auto = next.pictures[d.path]?.auto;
    if (!auto || projectsWith(next, d.path).length) continue;
    next = { ...next, pictures: withPictures(next.pictures, d.path, { own: next.pictures[d.path].own }) };
    drop.push(auto);
  }
  return { store: next, drop };
}

// Drawings into a project, after those in it; one in it already stays where it is. A drawing in another project moves:
// it comes out of that one (which counts as used). added: how many went in; moved: how many of those came from another.
export function addDrawings(store: HomeStore, id: string, drawings: { path: string; name?: string }[], now: number): { store: HomeStore; added: number; moved: number } {
  const p = projectOf(store, id);
  if (!p) return { store, added: 0, moved: 0 };
  const have = new Set(p.drawings.map((d) => d.path)), fresh: ProjectDrawing[] = [];
  for (const d of drawings) {
    if (!pathOk(d.path) || have.has(d.path) || p.drawings.length + fresh.length >= MAX_IN_PROJECT) continue;
    have.add(d.path);
    fresh.push({ path: d.path, name: d.name || drawingName(d.path), added: now });
  }
  if (!fresh.length) return { store, added: 0, moved: 0 };
  const going = new Set(fresh.map((d) => d.path));
  let moved = 0;
  const projects = store.projects.map((x) => {
    if (x.id === id) return { ...x, used: now, drawings: [...x.drawings, ...fresh] };
    const kept = x.drawings.filter((d) => !going.has(d.path));
    if (kept.length === x.drawings.length) return x;
    moved += x.drawings.length - kept.length;
    return { ...x, used: now, drawings: kept };
  });
  return { store: { ...store, projects }, added: fresh.length, moved };
}

// A drawing out of a project (the file stays). drop: its automatic picture, when no other project has the drawing.
// now: when, so the project counts as used.
export function removeDrawing(store: HomeStore, id: string, path: string, now = 0): { store: HomeStore; drop: string[] } {
  if (!projectOf(store, id)?.drawings.some((d) => d.path === path)) return { store, drop: [] };
  const next = change(store, id, (p) => ({ ...p, ...(now ? { used: now } : {}), drawings: p.drawings.filter((d) => d.path !== path) }));
  const auto = next.pictures[path]?.auto;
  if (!auto || projectsWith(next, path).length) return { store: next, drop: [] };
  return { store: { ...next, pictures: withPictures(next.pictures, path, { own: next.pictures[path].own }) }, drop: [auto] };
}

// The pictures with a drawing's set to p (and no entry when p has neither).
const withPictures = (all: Record<string, Pictures>, path: string, p: Pictures) => {
  const next = { ...all };
  if (p.own || p.auto) next[path] = { ...(p.own ? { own: p.own } : {}), ...(p.auto ? { auto: p.auto } : {}) }; else delete next[path];
  return next;
};

// A drawing that moved (Locate…): its new place in its folder, with its thumbnails. A project that has the new place
// already keeps that one entry; when another folder has it, it stays in the folder used last.
export function relocate(store: HomeStore, from: string, to: string): { store: HomeStore; drop: string[] } {
  if (from === to || !pathOk(to)) return { store, drop: [] };
  const projects = oneFolder(store.projects.map((p) => {
    if (!p.drawings.some((d) => d.path === from)) return p;
    const there = p.drawings.some((d) => d.path === to);
    return { ...p, drawings: there ? p.drawings.filter((d) => d.path !== from) : p.drawings.map((d) => (d.path === from ? { ...d, path: to, name: drawingName(to) } : d)) };
  }));
  const old = store.pictures[from], kept = store.pictures[to];
  if (!old) return { store: { ...store, projects }, drop: [] };
  const merged = { ...old, ...kept }, drop = [old.own, old.auto].filter((t) => t && t !== merged.own && t !== merged.auto) as string[];
  return { store: { ...store, projects, pictures: withPictures(withPictures(store.pictures, from, {}), to, merged) }, drop };
}

// A thumbnail for a drawing: the user's own (Set Thumbnail…), or Octet's copy of its automatic picture. drop: the
// thumbnail it takes the place of.
export function setPicture(store: HomeStore, path: string, which: keyof Pictures, id: string): { store: HomeStore; drop: string[] } {
  if (!pathOk(path) || !THUMB.test(id)) return { store, drop: [] };
  const was = store.pictures[path]?.[which];
  return { store: { ...store, pictures: withPictures(store.pictures, path, { ...store.pictures[path], [which]: id }) }, drop: was && was !== id ? [was] : [] };
}

// Use Automatic Thumbnail: the user's own thumbnail goes.
export function resetPicture(store: HomeStore, path: string): { store: HomeStore; drop: string[] } {
  const was = store.pictures[path]?.own;
  if (!was) return { store, drop: [] };
  return { store: { ...store, pictures: withPictures(store.pictures, path, { auto: store.pictures[path].auto }) }, drop: [was] };
}

// A project's own thumbnail on its folder, or (with none) its plain folder again.
export function setProjectThumb(store: HomeStore, id: string, thumb: string | undefined): { store: HomeStore; drop: string[] } {
  const p = projectOf(store, id);
  if (!p || (thumb !== undefined && !THUMB.test(thumb))) return { store, drop: [] };
  const next = change(store, id, ({ thumb: _, ...x }) => ({ ...x, ...(thumb ? { thumb } : {}) }));
  return { store: next, drop: p.thumb && p.thumb !== thumb ? [p.thumb] : [] };
}

// A project's colour, #RRGGBB in capitals. Octet Blue, the colour of a project with none, is not kept.
export function setProjectColour(store: HomeStore, id: string, colour: string): HomeStore {
  const p = projectOf(store, id);
  if (!p || !COLOUR.test(colour) || colour.toUpperCase() === colourOf(p)) return store;
  const next = colour.toUpperCase();
  return change(store, id, ({ colour: _, ...x }) => (next === PROJECT_COLOUR ? x : { ...x, colour: next }));
}
export const colourOf = (p: Project) => p.colour ?? PROJECT_COLOUR;

// A folder's colours from its project's: the front, the back (darker, or lighter for a colour near black so the two
// parts still show) and the lip along the front's top edge. dark: a colour near black, on which a picture shows
// lighter, not darker.
export function folderTones(hex: string): { front: string; back: string; lip: string; dark: boolean } {
  const c = (COLOUR.test(hex) ? hex : PROJECT_COLOUR).toUpperCase(), rgb = [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
  const mix = (to: number, t: number) => `#${rgb.map((v) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const dark = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 < 40;
  return { front: c, back: dark ? mix(255, 0.22) : mix(0, 0.3), lip: mix(255, dark ? 0.32 : 0.24), dark };
}

// A drawing removed from Home's recent drawings: when no project has it, its thumbnails go too, so the store does not
// keep pictures of drawings Home no longer shows.
export function forget(store: HomeStore, path: string): { store: HomeStore; drop: string[] } {
  const p = store.pictures[path];
  if (!p || projectsWith(store, path).length) return { store, drop: [] };
  return { store: { ...store, pictures: withPictures(store.pictures, path, {}) }, drop: [p.own, p.auto].filter(Boolean) as string[] };
}

// Every thumbnail the store uses, to load.
export const thumbIds = (store: HomeStore) => [...store.projects.flatMap((p) => (p.thumb ? [p.thumb] : [])), ...Object.values(store.pictures).flatMap((p) => [p.own, p.auto].filter(Boolean) as string[])];
