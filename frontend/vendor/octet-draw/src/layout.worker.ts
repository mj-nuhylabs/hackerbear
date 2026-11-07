// Lays out structures for Name to Structure (namepreview.ts) away from the page, so the window never waits for Indigo:
// SMILES for the name field's live preview (quickMol), and Return's fully tidied structure (fullMol, a piece at a
// time). It answers each message with the structure, or undefined: also when Indigo fails to load, so the name field
// never waits for an answer that does not come.
import { fullMol, quickMol, ready } from "./chem.ts";

self.onmessage = async (e: MessageEvent<{ smiles: string } | { pieces: string[]; ions: boolean }>) => {
  const ask = e.data;
  try {
    await ready;
    if ("smiles" in ask) return postMessage(quickMol(ask.smiles));
    postMessage(ask.pieces.map((p) => fullMol(p, ask.ions)));
  } catch { postMessage(undefined); }
};
