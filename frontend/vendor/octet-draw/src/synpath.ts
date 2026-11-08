// SynPath: not part of Octet Draw. The link between SynPath's page and this editor, which runs inside it rather
// than as its own window. See ../SYNPATH.md for every change made to Octet's files.
import type { Mol } from "./render";

// What the editor tells SynPath, and what SynPath asks of it. Editor.tsx fills these in on each render.
export const synpath: {
  // The selection, or the whole drawing when nothing is selected (as Octet's own Search PubChem takes it).
  part?: () => Mol;
  state?: { loaded: boolean; atoms: number; selected: boolean };
  // Puts a SMILES on the canvas now, as a pasted SMILES lands (to the right of the drawing, selected).
  load?: (smiles: string) => void;
  // A SMILES waiting for the editor to mount and Indigo to load.
  inbox?: string;
  // SynPath's Draw pane listens for changes.
  changed?: () => void;
  // The pane's width in px. The pane is pinned to the window's left edge at full height, so its top-left corner is
  // the window's and Octet's pointer and overlay coordinates hold as they are; only its width differs.
  width?: number;
  // The px SynPath keeps at the bottom of the pane for its own controls; the editor stops above them.
  strip?: number;
  // The px of SynPath's app bar over the top of the pane. The canvas runs on under it (so its coordinates stay the
  // window's); Octet's panels and centring start below it.
  top?: number;
} = {};

// The editor's width and height, where Octet used the window's (centring, fitting, rulers, scrollbars, panels kept in view).
export const frameWidth = (): number => synpath.width ?? innerWidth;
// frameHeight is the editor's bottom edge in window px; frameTop the top of the part not under SynPath's app bar.
export const frameHeight = (): number => innerHeight - (synpath.strip ?? 0);
export const frameTop = (): number => synpath.top ?? 0;
export const frameSpan = (): number => frameHeight() - frameTop();
export const frameMidY = (): number => (frameTop() + frameHeight()) / 2;
// SynPath's pane sets its size as it renders, before Octet renders inside it and reads it. width: undefined when
// the pane covers the window.
export function setFrame(width: number | undefined, strip: number, top: number): void {
  synpath.width = width;
  synpath.strip = strip;
  synpath.top = top;
}

// Octet's CSS is scoped to the .octet-host element (SynPath's vite.config.js), so anything Octet puts outside its
// own tree (menus, probes that read its colour tokens) goes in that element instead of document.body.
export const host = (): HTMLElement => document.querySelector<HTMLElement>(".octet-host") ?? document.body;

// A probe that reads Octet's tokens needs a .octet-host above it, even before the editor is on the page.
export function inHost<T>(read: (parent: HTMLElement) => T): T {
  const live = document.querySelector<HTMLElement>(".octet-host");
  if (live) return read(live);
  const temp = document.createElement("div");
  temp.className = "octet-host";
  temp.hidden = true;
  document.body.append(temp);
  try {
    return read(temp);
  } finally {
    temp.remove();
  }
}

// Octet listens for keys and the clipboard on the whole window, as a desktop app may. On SynPath's page they are
// Octet's only when they happen in the editor, or on the page itself after the last click was in the editor: typing
// in SynPath's search box, or Delete after clicking a route card, never edits the drawing. Registered as this
// module loads, before any Octet listener, so it runs first; the browser's own handling (typing, pasting) goes on.
if (typeof window !== "undefined") {
  const inEditor = (t: EventTarget | null) => t instanceof Element && !!t.closest(".octet-host");
  let lastClickInEditor = false;
  addEventListener("pointerdown", (e) => {
    lastClickInEditor = inEditor(e.target);
    // A click in the editor takes the keyboard from a SynPath field (Octet's canvas does not take focus itself).
    const focused = document.activeElement;
    if (lastClickInEditor && focused instanceof HTMLElement && focused !== document.body && !inEditor(focused)) focused.blur();
  }, true);
  for (const type of ["keydown", "keyup", "keypress", "paste", "copy", "cut"]) {
    addEventListener(type, (e) => {
      const t = e.target;
      const onPage = t === document.body || t === document.documentElement || t === document || t === window;
      if (inEditor(t) || (onPage && lastClickInEditor)) return;
      e.stopImmediatePropagation();
    }, true);
  }
}
