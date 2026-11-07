// Home's projects and thumbnails as the page holds them (src/projects.ts): read from the app when Home shows, and each
// change written back before it shows, one after another. A store Octet cannot read shows as empty, with a notice;
// the app keeps the damaged file beside the new one. Thumbnails load once and stay for the session.
import { useEffect, useRef, useState } from "react";
import { fromBase64 } from "./cdx";
import { failure, type NoticeKind } from "./notice";
import { call, HOME_API } from "./homeApi";
import { makeThumb } from "./thumbs";
import {
  addDrawings, createProject, deleteProject, drawingName, emptyStore, forget, newId, projectOf, projectsWith, readStore, relocate, removeDrawing, renameProject,
  resetPicture, setPicture, setProjectColour, setProjectThumb, thumbIds, writeStore, type HomeStore, type StoreProblem,
} from "./projects";

export type RecentLike = { path: string; name: string; thumb?: string };
// A tile's picture: a data address, and whether it is a photo to fill the tile (a JPEG) or a drawing to fit in it.
export type TilePicture = { src: string; fill: boolean; own: boolean };
// What a thumbnail is for: a drawing (by its path) or a project.
export type ThumbTarget = { path: string } | { project: string };
type Change = { store: HomeStore; drop?: string[] };

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const now = () => Math.floor(Date.now() / 1000);

export function useHomeLibrary({ active, recents, notice }: { active: boolean; recents: RecentLike[]; notice: (text: string, kind?: NoticeKind) => void }) {
  const [store, setStore] = useState<HomeStore>(emptyStore), [problem, setProblem] = useState<StoreProblem>();
  const [missing, setMissing] = useState<Set<string>>(new Set()), [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string>(); // the project Home shows, if one is open
  const held = useRef(store), queue = useRef(Promise.resolve()), problemRef = useRef(problem);
  problemRef.current = problem;
  // The tile files from Finder were dropped on (Home sets it): a project takes drawings, and a picture as its
  // thumbnail; a drawing takes a picture as its thumbnail.
  const dropTarget = useRef<ThumbTarget>(undefined);
  const [home, setHome] = useState<string>(); // the user's home folder, shown as ~

  // Read when Home shows. A damaged or newer store says so once.
  useEffect(() => {
    if (!active || !HOME_API) return;
    let gone = false;
    void call<{ text: string | null; damaged: boolean; missing: string[]; home?: string | null }>("home_read").then((r) => {
      if (gone) return;
      const read = r.damaged ? { store: emptyStore(), problem: "damaged" as const } : readStore(r.text);
      if (read.problem && read.problem !== problemRef.current) notice(read.problem === "newer" ? "A newer Octet saved your folders. Update Octet to see them." : "Octet cannot read your folders. Octet kept a copy of the file and starts with no folders.");
      held.current = read.store;
      setStore(read.store); setProblem(read.problem); setMissing(new Set(r.missing)); setHome(r.home ?? undefined);
    }).catch(() => {});
    return () => { gone = true; };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  // The thumbnails the store uses, loaded once each.
  useEffect(() => {
    const want = thumbIds(store).filter((id) => !(id in urls));
    if (want.length && HOME_API) void call<Record<string, string>>("thumb_load", { ids: want }).then((got) => setUrls((u) => ({ ...u, ...got }))).catch(() => {});
  }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

  // A change to the store: made on the newest store, written, then shown. Thumbnails it no longer uses go. Gives
  // whether it was written.
  const commit = (f: (s: HomeStore) => Change, failed = "Octet cannot change your folders."): Promise<boolean> => {
    const done = queue.current.then(async () => {
      if (problemRef.current === "newer") { notice("A newer Octet saved your folders. Update Octet to change them."); return false; }
      const r = f(held.current);
      if (r.store !== held.current) {
        await call("home_write", { text: writeStore(r.store) });
        held.current = r.store;
        setStore(r.store);
        if (problemRef.current === "damaged") setProblem(undefined); // the damaged file is kept beside the new one
      }
      for (const id of r.drop ?? []) void call("thumb_drop", { id }).catch(() => {});
      return true;
    }).catch((e) => { notice(failure(failed, e)); return false; });
    queue.current = done.then(() => {});
    return done;
  };
  const recentOf = (path: string) => recents.find((r) => r.path === path);

  // A drawing's picture: the user's own, else its picture from the recent list (the newest), else Octet's copy.
  const pictureFor = (path: string): TilePicture | undefined => {
    const own = urls[store.pictures[path]?.own ?? ""];
    if (own) return { src: own, fill: own.startsWith("data:image/jpeg"), own: true };
    const recent = recentOf(path)?.thumb, auto = urls[store.pictures[path]?.auto ?? ""];
    return recent ? { src: svgUrl(recent), fill: false, own: false } : auto ? { src: auto, fill: false, own: false } : undefined;
  };
  // Octet's copy of a drawing's picture, for a drawing in a project (the recent list keeps 24 drawings only).
  const lastAuto = useRef(new Map<string, string>());
  const keepAuto = async (path: string, svg: string) => {
    if (!projectsWith(held.current, path).length || lastAuto.current.get(path) === svg) return;
    lastAuto.current.set(path, svg);
    const id = await call<string>("thumb_save", { svg });
    setUrls((u) => ({ ...u, [id]: svgUrl(svg) }));
    await commit((s) => (projectsWith(s, path).length ? setPicture(s, path, "auto", id) : { store: s, drop: [id] }));
  };

  // Drawings into a folder (out of the one each was in), with a notice that says what went in, which a screen reader
  // reads. Each takes a copy of its picture with it. Gives how many went in.
  const add = (id: string, drawings: { path: string; name?: string }[]) => {
    let added = 0, moved = 0;
    return commit((s) => { const r = addDrawings(s, id, drawings, now()); added = r.added; moved = r.moved; return r; }).then((ok) => {
      const p = projectOf(held.current, id);
      if (!ok || !p || !drawings.length) return 0;
      const what = added === 1 && drawings.length === 1 ? drawings[0].name || drawingName(drawings[0].path) : `${added} ${added === 1 ? "drawing" : "drawings"}`;
      notice(added ? `${moved ? "Moved" : "Added"} ${what} to ${p.name}.` : `${p.name} has ${drawings.length === 1 ? "this drawing" : "these drawings"} already.`, added ? "done" : "info");
      for (const d of drawings) { const svg = recentOf(d.path)?.thumb; if (svg && !held.current.pictures[d.path]?.auto) void keepAuto(d.path, svg).catch(() => {}); }
      return added;
    });
  };

  // A picture file's bytes as the thumbnail of a drawing or a project: Set thumbnail…, or a picture dropped on a tile.
  const pictureThumb = async (target: ThumbTarget, bytes: Uint8Array) => {
    try {
      let jpeg: string;
      try { jpeg = await makeThumb(bytes); } catch (e) { return notice(`Octet cannot use this picture. ${e instanceof Error ? e.message : ""}`.trim()); }
      const id = await call<string>("thumb_save", { jpeg });
      setUrls((u) => ({ ...u, [id]: `data:image/jpeg;base64,${jpeg}` }));
      await commit((s) => ("path" in target ? setPicture(s, target.path, "own", id) : setProjectThumb(s, target.project, id)));
    } catch (e) {
      notice(failure("Octet cannot set this thumbnail.", e));
    }
  };
  const chooseThumb = (target: ThumbTarget) => call<string | null>("home_pick_picture").then((b64) => { if (b64) return pictureThumb(target, fromBase64(b64)); })
    .catch((e) => notice(failure("Octet cannot set this thumbnail.", e)));

  return {
    store, problem, missing, urls, open, setOpen, dropTarget, pictureFor, pictureThumb, home,
    colour: (id: string, colour: string) => commit((s) => ({ store: setProjectColour(s, id, colour) })),
    create: (name: string, then?: { path: string; name?: string }[]) => {
      const id = newId();
      return commit((s) => ({ store: createProject(s, name, id, now()) })).then(() => { if (then?.length && projectOf(held.current, id)) return add(id, then); }).then(() => id);
    },
    rename: (id: string, name: string) => commit((s) => ({ store: renameProject(s, id, name) })),
    remove: (id: string) => { if (open === id) setOpen(undefined); return commit((s) => deleteProject(s, id), "Octet cannot delete this folder."); },
    add,
    // Add Drawings… in a project: the Open dialog for drawings.
    addPicked: (id: string) => void call<string[]>("home_pick_drawings", { many: true }).then((paths) => { if (paths.length) return add(id, paths.map((path) => ({ path }))); })
      .catch((e) => notice(failure("Octet cannot add these drawings.", e))),
    // Remove from folder: the drawings stay where they are on disk and on Home's recent list.
    removeDrawing: (id: string, paths: string[]) => {
      const p = projectOf(held.current, id), name = paths.length === 1 ? p?.drawings.find((d) => d.path === paths[0])?.name ?? drawingName(paths[0]) : `${paths.length} drawings`;
      return commit((s) => paths.reduce((r, path) => { const x = removeDrawing(r.store, id, path, now()); return { store: x.store, drop: [...r.drop, ...x.drop] }; }, { store: s, drop: [] as string[] }))
        .then((ok) => { if (ok && p) notice(`Removed ${name} from ${p.name}.`, "done"); });
    },
    // Locate…: the drawing's new place, picked in the Open dialog, in every project.
    locate: (path: string) => void call<string[]>("home_pick_drawings", { many: false }).then(async ([to]) => {
      if (!to || !(await commit((s) => relocate(s, path, to)))) return;
      setMissing((m) => { const n = new Set(m); n.delete(path); n.delete(to); return n; });
      notice(`Octet found ${drawingName(to)}.`, "done");
    }).catch((e) => notice(failure("Octet cannot locate this drawing.", e))),
    chooseThumb,
    resetThumb: (target: ThumbTarget) => commit((s) => ("path" in target ? resetPicture(s, target.path) : setProjectThumb(s, target.project, undefined))),
    // Use Selection as Thumbnail (the editor): a picture Octet drew, as the drawing's own thumbnail.
    ownSvg: (path: string, svg: string) => void call<string>("thumb_save", { svg }).then((id) => { setUrls((u) => ({ ...u, [id]: svgUrl(svg) })); return commit((s) => setPicture(s, path, "own", id)); })
      .then(() => notice("Home shows the selection as this drawing's thumbnail.", "done")).catch((e) => notice(failure("Octet cannot set this thumbnail.", e))),
    // The drawing's picture changed (it was opened or saved): Octet's copy for a drawing in a project follows.
    autoSvg: (path: string, svg: string) => void keepAuto(path, svg).catch(() => {}),
    // Remove from Home: a drawing in no project takes its thumbnails with it.
    forget: (path: string) => commit((s) => forget(s, path)),
  };
}
export type HomeLibrary = ReturnType<typeof useHomeLibrary>;
