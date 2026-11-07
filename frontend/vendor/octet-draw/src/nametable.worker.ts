// Builds the dictionary's index for suggestions away from the page (nametable.ts), and gives it back without a copy.
import { suggestionIndex } from "./nametable.ts";

self.onmessage = (e: MessageEvent<{ bytes: Uint8Array; names: Int32Array }>) => {
  const x = suggestionIndex(e.data.bytes, e.data.names);
  postMessage(x, { transfer: [x.start.buffer, x.end.buffer, x.compound.buffer, x.gramStart.buffer, x.grams.buffer, x.keys.buffer, x.ids.buffer] as Transferable[] });
};
