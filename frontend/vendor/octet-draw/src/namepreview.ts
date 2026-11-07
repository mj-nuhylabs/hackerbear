// Name to Structure's live preview: the faint structure under the name field while a name is typed. A structure that
// is quick to draw shows at once, fully tidied, as before. A sequence ("peptide: …", "rna: …", "dna: …") or a
// structure of more than PREVIEW_ATOMS atoms takes up to 2 seconds to tidy, so it waits until typing pauses
// (PREVIEW_PAUSE) and is laid out away from the page (layout.worker.ts) with Indigo's layout alone. Typing never
// waits for it. Return draws the full, tidied structure, laid out in the same worker (fullLayout): the field shows it is
// busy meanwhile, and an edit or Escape cancels it.
import { fullMol, quickMol, smilesAtoms } from "./chem.ts";
import { looksLikeSmiles } from "./names.ts";
import { NUCLEIC, nucleicText } from "./nucleic.ts";
import { PEPTIDE, peptideSmiles } from "./peptide.ts";
import type { Mol } from "./render.ts";

// Above this many atoms Octet no longer tidies a layout without stereochemistry (chem.ts MOST_TIDIED).
export const PREVIEW_ATOMS = 100;
// ms after the last keystroke, as for the name field's thorough suggestion.
export const PREVIEW_PAUSE = 150;

// Sequences are read without asking OPSIN.
export const isSequence = (text: string) => PEPTIDE.test(text) || NUCLEIC.test(text);

// The SMILES to lay out later, or undefined to draw the text now (or nothing, when it is not a structure). smiles: the
// text read as a name (names.ts nameToSmiles; never asked for a sequence).
export function laterSmiles(text: string, smiles: string | undefined): string | undefined {
  const s = text.trim();
  if (PEPTIDE.test(s)) return peptideSmiles(s);
  if (NUCLEIC.test(s)) { const n = nucleicText(s); return n && "smiles" in n ? n.smiles : undefined; }
  const big = (x: string) => !/[\r\n]/.test(x) && smilesAtoms(x) > PREVIEW_ATOMS;
  return smiles ? (big(smiles) ? smiles : undefined) : looksLikeSmiles(s) && big(s) ? s : undefined;
}

// One worker, started when first needed. It does one job at a time, and Return's full layout (fullLayout) goes before
// any preview. Only the newest preview waits: one that has not started when another comes is dropped (resolves
// undefined), and the caller drops an answer it no longer wants.
type Job = { ask: { smiles: string } | { pieces: string[]; ions: boolean }; done: (answer?: unknown) => void };
let worker: Worker | undefined, running: Job | undefined, preview: Job | undefined, full: Job | undefined;
const start = () => (worker ??= new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" }));
export const warmLayout = () => { if (typeof Worker !== "undefined") start(); };
export function quickLayout(smiles: string): Promise<Mol | undefined> {
  if (typeof Worker === "undefined") return Promise.resolve(quickMol(smiles));
  return new Promise((done) => {
    preview?.done();
    preview = { ask: { smiles }, done: (m) => done(m as Mol | undefined) };
    next();
  });
}
// Return's structure for a sequence or a large structure, made in the worker so the window never waits: each piece
// (a name in a list of names, else the one SMILES) fully tidied, as chem.ts fullMol makes it, or undefined when one
// does not read. cancel drops it, with undefined: a job that has started stops with its worker, which starts again
// for the next request. The last few are kept, so Return on the same text again draws at once.
const laid = new Map<string, Mol[]>();
export function fullLayout(pieces: string[], ions: boolean): { result: Promise<Mol[] | undefined>; cancel: () => void } {
  const key = `${ions}\n${pieces.join("\n")}`, kept = laid.get(key);
  const keep = (mols: Mol[] | undefined) => {
    if (mols) { if (laid.size >= 8) laid.delete(laid.keys().next().value!); laid.set(key, mols); }
    return mols;
  };
  if (kept) return { result: Promise.resolve(kept), cancel: () => {} };
  if (typeof Worker === "undefined") {
    let mols: Mol[] | undefined;
    try { mols = pieces.map((p) => fullMol(p, ions)); } catch { mols = undefined; }
    return { result: Promise.resolve(keep(mols)), cancel: () => {} };
  }
  let job: Job;
  const result = new Promise<Mol[] | undefined>((done) => {
    full?.done();
    job = full = { ask: { pieces, ions }, done: (m) => done(keep(m as Mol[] | undefined)) };
    next();
  });
  const cancel = () => {
    if (full === job) { full = undefined; job.done(); }
    else if (running === job) { worker?.terminate(); worker = undefined; running = undefined; job.done(); next(); }
  };
  return { result, cancel };
}
function next() {
  const job = full ?? preview;
  if (running || !job) return;
  if (job === full) full = undefined; else preview = undefined;
  running = job;
  const w = start();
  const finish = (answer: unknown) => { if (running !== job) return; running = undefined; job.done(answer); next(); };
  w.onmessage = (e: MessageEvent) => finish(e.data);
  // A worker that fails is started again for the next request.
  w.onerror = () => { w.terminate(); if (worker === w) worker = undefined; finish(undefined); };
  w.postMessage(job.ask);
}
