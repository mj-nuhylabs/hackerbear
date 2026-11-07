// The .oct file (decision 0004): a CDXML document that ChemDraw opens, with Octet's own drawing (its JSON, see
// file.ts) in a comment after it, beside a hash of the CDXML it was saved with. When another program has changed the
// CDXML, the hash no longer matches, and Octet reads the CDXML instead. Old .octet files are the JSON alone.
// A .cdx file (decision 0009) works the same way: the drawing's JSON goes in a property of the CDX document, beside a
// hash of the rest of the file.
import { fromCdxml, parseXml, toCdxml, type CdxmlOptions } from "./cdxml.ts";
import { BASE64_MAGIC, cdxToXml, fromBase64 as bytesOf, xmlToCdx } from "./cdx.ts";
import type { DocStyle } from "./docstyle.ts";
import { parse, serialize } from "./file.ts";
import type { Mol } from "./render.ts";

const MARK = "<!--Octet 1 ";

// FNV-1a over the text's UTF-16 units, twice with different seeds: a change check, not a security one.
function hash(text: string): string {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

// The same hash over bytes.
function hashBytes(b: Uint8Array): string {
  let a = 0x811c9dc5, c = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < b.length; i++) {
    a = Math.imul(a ^ b[i], 0x01000193);
    c = Math.imul(c ^ b[i], 0x01000193) ^ (c >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (c >>> 0).toString(16).padStart(8, "0");
}

// Base64 of UTF-8, in chunks so a large drawing does not overflow the call stack.
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): string {
  const s = atob(b64), bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// The drawing as a .oct (or .cdxml) file: the two are the same. cdxml: the drawing's CDXML when the caller has it.
export function writeOct(mol: Mol, style: DocStyle, opts: CdxmlOptions = {}, cdxml = toCdxml(mol, style, opts)): string {
  const body = cdxml.endsWith("\n") ? cdxml : `${cdxml}\n`;
  return `${body}${MARK}${hash(body)} ${toBase64(serialize({ ...mol, style }))}-->\n`;
}

// The drawing as a .cdx file: ChemDraw's binary form of the CDXML, with Octet's drawing in a user property (tag
// 0x4F43, "OC") first in the document, as the hash of the file without it, a space, and the JSON.
const OWN = 0x4f43;
export function writeCdx(mol: Mol, style: DocStyle, opts: CdxmlOptions = {}): Uint8Array {
  const body = xmlToCdx(parseXml(toCdxml(mol, style, opts))), json = new TextEncoder().encode(`${hashBytes(body)} ${serialize({ ...mol, style })}`);
  const head = json.length >= 0xffff ? 8 : 4, out = new Uint8Array(body.length + head + json.length), d = new DataView(out.buffer);
  out.set(body.subarray(0, 28));
  d.setUint16(28, OWN, true);
  if (head === 8) { d.setUint16(30, 0xffff, true); d.setUint32(32, json.length, true); } else d.setUint16(30, json.length, true);
  out.set(json, 28 + head);
  out.set(body.subarray(28), 28 + head + json.length);
  return out;
}
// A .cdx file: Octet's own drawing when the rest of the file is unchanged, otherwise the CDX as ChemDraw's drawing.
export function readCdx(bytes: Uint8Array): { mol: Mol; lost: Record<string, number>; foreign?: true } {
  if (bytes.length > 36 && bytes[28] === (OWN & 0xff) && bytes[29] === OWN >> 8) {
    const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), short = d.getUint16(30, true), head = short === 0xffff ? 8 : 4;
    const n = head === 8 ? d.getUint32(32, true) : short;
    if (28 + head + n <= bytes.length) {
      const own = bytes.subarray(28 + head, 28 + head + n), rest = new Uint8Array(bytes.length - head - n);
      rest.set(bytes.subarray(0, 28));
      rest.set(bytes.subarray(28 + head + n), 28);
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(own), cut = text.indexOf(" ");
        if (text.slice(0, cut) === hashBytes(rest)) return { mol: parse(text.slice(cut + 1)), lost: {} };
      } catch { /* a damaged copy: read the CDX */ }
    }
  }
  const read = fromCdxml(cdxToXml(bytes));
  return { mol: { ...read.mol, style: read.style }, lost: read.lost, foreign: true };
}

// The program that last saved a CDXML file, from its CDXML element: "ChemDraw 25.5.0.5789", or "".
const programOf = (text: string) => /\sCreationProgram="([^"]*)"/.exec(/<CDXML\s[^>]*/.exec(text.slice(0, 65536))?.[0] ?? "")?.[1] ?? "";

// A drawing from a file: Octet's own drawing when the CDXML around it is unchanged, otherwise the CDXML (with what
// Octet could not hold counted in `lost`, and `foreign` set), or an old .octet file's JSON. A .cdx file comes as its
// bytes in base64 (from the app, which reads it). oct: the file is named .oct, so Octet wrote it. `resaved` is set
// when Octet wrote the file (its comment is there, or the name is .oct) and ChemDraw saved it last: ChemDraw 25.5
// drops Octet's comment and attributes when it saves (issue 19), so Octet's own extras are gone.
export function readOct(text: string, oct = false): { mol: Mol; lost: Record<string, number>; foreign?: true; resaved?: true } {
  if (text.startsWith(BASE64_MAGIC)) return readCdx(bytesOf(text));
  if (/^\s*\{/.test(text)) return { mol: parse(text), lost: {} };
  const at = text.lastIndexOf(MARK);
  if (at >= 0) {
    const m = /^([0-9a-f]{16}) ([A-Za-z0-9+/=]+)-->\s*$/.exec(text.slice(at + MARK.length));
    if (m && hash(text.slice(0, at)) === m[1]) {
      try { return { mol: parse(fromBase64(m[2])), lost: {} }; } catch { /* a damaged copy: read the CDXML */ }
    }
  }
  const read = fromCdxml(text), resaved = (at >= 0 || oct) && /ChemDraw/i.test(programOf(text));
  return { mol: { ...read.mol, style: read.style }, lost: read.lost, foreign: true, ...(resaved ? { resaved: true as const } : {}) };
}

// Whether a file's text is a drawing readOct reads (a .oct, CDXML, CDX or an old .octet file), not a structure file
// (MOL, SDF, SMILES), which Indigo reads.
export const isDrawingText = (text: string) => text.startsWith(BASE64_MAGIC) || /^\s*\{/.test(text) || /<CDXML[\s>/]/.test(text.slice(0, 65536));

// What Octet could not hold from a file (readOct's `lost`), as a list: "6 annotations and 1 rotated shape".
export function lostText(lost: Record<string, number>): string {
  const parts = Object.entries(lost).map(([what, n]) => `${n} ${what}${n > 1 && !/s$/.test(what) ? "s" : ""}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0] ?? "";
}
