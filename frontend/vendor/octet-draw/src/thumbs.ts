// Thumbnails the user chooses for Home's tiles (Set Thumbnail…). Every picture file is hostile: its size and its pixel
// count are checked before it is decoded, and only the webview's image decoder reads it (as src/picture.ts does). It
// is cut to the tiles' 4:3 from its middle, drawn at twice the largest tile's size on white (the page colour every
// drawing's picture sits on), and kept as a JPEG. The original file is never kept. The app checks the JPEG again
// with its own decoder before it keeps it (src-tauri/src/home.rs).
import { toBase64 } from "./cdx.ts";
import { kindOf, NOT_PICTURE, TOO_MANY_PIXELS } from "./picture.ts";

// Home's widest tile is 256 by 192 px, so a thumbnail is 512 by 384: sharp on a Retina screen, and the webview makes it
// smaller for a tile that is smaller, or a screen that is not Retina.
export const THUMB_W = 512, THUMB_H = 384;
export const MAX_INPUT = 32 << 20, MAX_SIDE = 16384, MAX_PIXELS = 40e6, MAX_OUTPUT = 512 * 1024;
export const INPUT_TOO_LARGE = "It is larger than 32 MB.";

// Why a file cannot be a thumbnail, from its first bytes and its size (never its name), or undefined.
export function inputProblem(bytes: Uint8Array): string | undefined {
  if (!kindOf(bytes)) return NOT_PICTURE;
  if (bytes.length > MAX_INPUT) return INPUT_TOO_LARGE;
  return undefined;
}
// Why a picture of this size cannot be decoded for a thumbnail, or undefined.
export const sizeProblem = (w: number, h: number) => (!w || !h ? NOT_PICTURE : w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS ? TOO_MANY_PIXELS : undefined);

// The part of a w by h picture that fills a W by H tile: the whole of its short side, from the middle of its long one.
export function cover(w: number, h: number, W = THUMB_W, H = THUMB_H): { sx: number; sy: number; sw: number; sh: number } {
  if (w / h > W / H) { const sw = (h * W) / H; return { sx: (w - sw) / 2, sy: 0, sw, sh: h }; }
  const sh = (w * H) / W;
  return { sx: 0, sy: (h - sh) / 2, sw: w, sh };
}

// A picture file's bytes as a thumbnail: a JPEG in base64. Throws an Error that says why it cannot.
export async function makeThumb(bytes: Uint8Array): Promise<string> {
  const problem = inputProblem(bytes);
  if (problem) throw new Error(problem);
  // The size first: an image element reads it from the file's header, and decodes the pixels only when drawn.
  const img = new Image();
  const loaded = new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
  img.src = `data:image/${kindOf(bytes)};base64,${toBase64(bytes)}`;
  await loaded.catch(() => { throw new Error(NOT_PICTURE); });
  const size = sizeProblem(img.naturalWidth, img.naturalHeight);
  if (size) throw new Error(size);
  const canvas = document.createElement("canvas"), c = canvas.getContext("2d");
  if (!c) throw new Error(NOT_PICTURE);
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  c.fillStyle = "#fff";
  c.fillRect(0, 0, THUMB_W, THUMB_H);
  c.imageSmoothingQuality = "high";
  const r = cover(img.naturalWidth, img.naturalHeight);
  c.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, THUMB_W, THUMB_H);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.86));
  if (!blob || blob.size > MAX_OUTPUT) throw new Error(NOT_PICTURE);
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}
