// SynthPath: not part of Octet Draw. The link between SynthPath's page and this editor, which runs inside it rather
// than as its own window. See ../SYNTHPATH.md for every change made to Octet's files.
import type { Mol } from "./render";

// What the editor tells SynthPath, and what SynthPath asks of it. Editor.tsx fills these in on each render.
export const synthpath: {
  // The selection, or the whole drawing when nothing is selected (as Octet's own Search PubChem takes it).
  part?: () => Mol;
  state?: { loaded: boolean; atoms: number; selected: boolean };
  // A SMILES to put on the canvas, as a pasted SMILES lands, once Indigo has loaded.
  inbox?: string;
  // SynthPath's Draw panel listens for changes.
  changed?: () => void;
} = {};

// Octet's CSS is scoped to the .octet-host element (SynthPath's vite.config.js), so anything Octet puts outside its
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
