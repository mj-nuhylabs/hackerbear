// Pictures dropped on the window or pasted (a screenshot, a picture copied from a browser), as ChemDraw 26.1 takes
// them: a picture object at 1 pt per pixel (the file's own dpi is not used), its bytes kept as they are in the format
// ChemDraw tags them with. PNG, JPEG and GIF stay as they are, as every export reads them. BMP, TIFF and WebP become a
// PNG from the webview's decoder, and a JPEG that its EXIF data turns a JPEG drawn upright, so exports draw them as
// the page does.
// Every file is hostile: its size and its pixel count are checked before it is decoded, and only the webview's image
// decoder reads it.
import { hex, toBase64 } from "./cdx.ts";
import { PICTURE_HEX } from "./cdxml.ts";
import { EMPTY } from "./edit.ts";
import type { Mol } from "./render.ts";

// The most picture data one drawing holds, in bytes. A .oct file holds each picture about 4.7 times over (hex in the
// CDXML, and hex in base64 in Octet's own copy), and Octet opens files of 64 MB at most.
export const MAX_PICTURE = 12 << 20;
// A file to make a PNG of (an uncompressed TIFF or BMP can be large) is read up to Open's limit.
const MAX_INPUT = 64 << 20, MAX_SIDE = 16384, MAX_PIXELS = 40e6;
export const TOO_LARGE = "It is larger than 12 MB.";
export const TOO_MANY_PIXELS = "It has too many pixels.";
export const NOT_PICTURE = "It is not a PNG, JPEG, GIF, BMP, TIFF or WebP picture.";
export const FULL = "The pictures in this drawing would be larger than 12 MB.";

export type PictureKind = "png" | "jpeg" | "gif" | "bmp" | "tiff" | "webp";
// What a file holds, from its first bytes (never its name).
export function kindOf(b: Uint8Array): PictureKind | undefined {
  const at = (i: number, s: string) => b.length >= i + s.length && [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (at(0, "\x89PNG\r\n\x1a\n")) return "png";
  if (at(0, "\xff\xd8\xff")) return "jpeg";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "gif";
  if (at(0, "BM") && [12, 40, 52, 56, 64, 108, 124].includes(b[14] | (b[15] << 8)) && !b[16] && !b[17]) return "bmp"; // and its header's size
  if (at(0, "II*\0") || at(0, "MM\0*")) return "tiff";
  if (at(0, "RIFF") && at(8, "WEBP")) return "webp";
  return undefined;
}

// Whether a JPEG's EXIF orientation turns or mirrors it (2 to 8). Exports draw a JPEG as its pixels are stored, so
// such a JPEG is drawn again the way the webview shows it.
export function jpegTurned(b: Uint8Array): boolean {
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    for (let i = 2; d.getUint8(i) === 0xff && d.getUint8(i + 1) !== 0xda; i += 2 + d.getUint16(i + 2)) {
      if (d.getUint8(i + 1) !== 0xe1 || d.getUint32(i + 4) !== 0x45786966) continue; // APP1 "Exif"
      const t = i + 10, little = d.getUint16(t) === 0x4949, ifd = t + d.getUint32(t + 4, little);
      for (let k = 0, n = d.getUint16(ifd, little); k < n; k++) {
        const e = ifd + 2 + 12 * k;
        if (d.getUint16(e, little) === 0x0112) return d.getUint16(e + 8, little) > 1;
      }
      return false;
    }
  } catch { /* the data ends early: not turned */ }
  return false;
}

// ChemDraw's tag for each format Octet keeps as it is.
const KEEP: Partial<Record<PictureKind, string>> = { png: "PNG", jpeg: "JPEG", gif: "GIF" };

// A picture file's bytes as a picture's data (CDXML's tags, bytes in hex) and its size in pixels. Throws one of the
// reasons above.
export async function readPicture(bytes: Uint8Array): Promise<{ picture: Record<string, string>; w: number; h: number }> {
  const kind = kindOf(bytes);
  if (!kind) throw new Error(NOT_PICTURE);
  if (bytes.length > (KEEP[kind] ? MAX_PICTURE : MAX_INPUT)) throw new Error(TOO_LARGE);
  // The size first: an image element reads it from the file's header, and decodes the pixels only when drawn.
  const img = new Image();
  const loaded = new Promise((ok, no) => { img.onload = ok; img.onerror = no; });
  img.src = `data:image/${kind};base64,${toBase64(bytes)}`;
  await loaded.catch(() => { throw new Error(NOT_PICTURE); });
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) throw new Error(NOT_PICTURE);
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) throw new Error(TOO_MANY_PIXELS);
  const tag = KEEP[kind], turned = kind === "jpeg" && jpegTurned(bytes);
  if (tag && !turned) return { picture: { [tag]: hex(bytes) }, w, h };
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")?.drawImage(img, 0, 0);
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, turned ? "image/jpeg" : "image/png", 0.92));
  if (!blob) throw new Error(NOT_PICTURE);
  const made = new Uint8Array(await blob.arrayBuffer());
  if (made.length > MAX_PICTURE) throw new Error(TOO_LARGE);
  return { picture: { [turned ? "JPEG" : "PNG"]: hex(made) }, w, h };
}

// The bytes of picture data a drawing holds (held as hex), its sizes and turns left out.
export const pictureBytes = (m: Mol) => (m.shapes ?? []).reduce((n, sh) => n + PICTURE_HEX.reduce((k, key) => k + (sh.picture?.[key]?.length ?? 0) / 2, 0), 0);

// A drawing of the picture alone, centred on 0,0, at 1 pt per pixel in a style whose bond is `bond` points long.
export function pictureMol(picture: Record<string, string>, w: number, h: number, bond: number): Mol {
  const x = w / 2 / bond, y = h / 2 / bond;
  return { ...EMPTY, shapes: [{ id: 1, kind: "picture", from: [-x, -y], to: [x, y], picture }] };
}
