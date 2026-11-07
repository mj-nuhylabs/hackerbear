// CDX, ChemDraw's binary format, as the same tree of elements and attributes as CDXML (cdxml.ts's Xml), so one
// reader and one writer serve both. A CDX file is the header, then the document object: each object is its tag, its
// id, its properties (tag, length, bytes) and its child objects, closed by tag 0. cdxtags.ts names every tag and says
// how its bytes read. Format facts: decision 0009.
// The file is hostile until checked: every length is checked against the bytes left, nesting and object counts are
// capped as the XML reader caps them, and a property that does not read as its tag says is left out.

import { OBJECTS, PROPS } from "./cdxtags.ts";
import { LABELS, charsetCode, charsets, decoder, legacyByte } from "./charset.ts";
import { DAMAGED, TOO_BIG, fmt, pictureHex, type Xml } from "./cdxml.ts";

export const MAGIC = "VjCD0100";
// The magic, 04 03 02 01 and 10 reserved bytes; the document object's tag and id follow, as ChemDraw writes them.
const HEADER = [0x56, 0x6a, 0x43, 0x44, 0x30, 0x31, 0x30, 0x30, 4, 3, 2, 1, ...new Array(10).fill(0)];
const MAX_BYTES = 64 * 1024 * 1024, MAX_DEPTH = 64, MAX_OBJECTS = 1_000_000, MAX_POINTS = 8191, MAX_SPECTRUM = 1 << 21;

type Prop = { tag: number; name: string; kind: string; names?: Map<number, string>; values?: Map<string, number> };
const byTag = new Map<number, Prop>(), byName = new Map<string, Prop>(), objectTag = new Map<string, number>();
for (const [tag, name, kind, list] of PROPS) {
  const p: Prop = { tag, name, kind };
  if (list) {
    p.names = new Map();
    p.values = new Map();
    for (const pair of list.split(",")) {
      const k = pair.indexOf("="), v = Number(pair.slice(0, k)), n = pair.slice(k + 1);
      if (!p.names.has(v)) p.names.set(v, n);
      if (!p.values.has(n)) p.values.set(n, v);
    }
  }
  byTag.set(tag, p);
  if (name && !byName.has(name)) byName.set(name, p);
}
for (const [tag, name] of Object.entries(OBJECTS)) objectTag.set(name, Number(tag));
// The style records' four parts, as CDXML splits them (LabelFont, LabelFace, LabelSize, LabelColor).
const STYLE_PARTS = ["Font", "Face", "Size", "Color"];
// Name on a tag and on a chemical property is plain bytes, not a styled string.
const plainName = (el: Xml, p?: Prop): Prop | undefined => (p?.tag === 0x0008 && (el.name === "objecttag" || el.name === "chemicalproperty") ? { ...p, kind: "plain" } : p);

const utf8 = new TextDecoder("utf-8", { fatal: true });
// Bytes as UTF-8 when they are, otherwise as Mac Roman.
function anyText(b: Uint8Array): string {
  try { return utf8.decode(b); } catch { return decoder("macintosh").decode(b); }
}
const macByte = (ch: string) => legacyByte(ch, 10000);
// A text run's charset, as reader and writer both take it: its font's, else the text's caption or label font's, else
// the document's, else Mac Roman.
const runCharset = (fonts: Map<number, number>, font: number, el: Xml, root?: Xml) =>
  [font, ...[el, root].flatMap((x) => [x?.attrs.CaptionFont, x?.attrs.LabelFont]).map((f) => Number.parseInt(f ?? "", 10))].map((f) => fonts.get(f)).find((c) => c !== undefined) ?? 10000;

// Bytes as uppercase hex and back, as CDXML holds pictures: by table, as a picture can be megabytes.
const HEX = Array.from({ length: 256 }, (_, k) => k.toString(16).padStart(2, "0").toUpperCase());
export function hex(b: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < b.length; i += 0x8000) parts.push(Array.from(b.subarray(i, i + 0x8000), (x) => HEX[x]).join(""));
  return parts.join("");
}
const nibble = (c: number) => (c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1);
function unhex(s: string): Uint8Array | undefined {
  if (s.length % 2) return undefined;
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; i++) {
    const hi = nibble(s.charCodeAt(2 * i)), lo = nibble(s.charCodeAt(2 * i + 1));
    if (hi < 0 || lo < 0) return undefined;
    b[i] = (hi << 4) | lo;
  }
  return b;
}

// Base64 for the bytes of a file or a clipboard type, in chunks so a large one does not overflow the call stack.
export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(s: string): Uint8Array {
  if (s.length > (MAX_BYTES * 4) / 3 + 4) throw new Error(TOO_BIG);
  const t = atob(s), b = new Uint8Array(t.length);
  for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i);
  return b;
}
// A picture's bytes, held as hex (as CDXML holds them), in base64; undefined if the hex is not sound.
export const hexToBase64 = (h: string) => { const b = unhex(h); return b && toBase64(b); };
export const isCdx = (b: Uint8Array) => b.length >= 8 && MAGIC.split("").every((c, i) => b[i] === c.charCodeAt(0));
// A CDX file's bytes in base64 begin with this (the magic, "VjCD0100"): how Octet tells them from a text file's text.
export const BASE64_MAGIC = "VmpDRDAxMDA";

// ---------------------------------------------------------------------------------------------------------------
// Reading.

// A CDX file as the CDXML tree ChemDraw would write for it. Numbers are given as CDXML gives them (points to 0.01),
// or, with `exact`, in full, so the tree writes back to the same values. Throws DAMAGED, TOO_BIG or NOT_CDX.
export const NOT_CDX = "This file is not a ChemDraw drawing.";
export function cdxToXml(bytes: Uint8Array, exact = false): Xml {
  if (bytes.length > MAX_BYTES) throw new Error(TOO_BIG);
  if (!isCdx(bytes) || bytes.length < 28 || ![[4, 3, 2, 1], [1, 2, 3, 4]].some((o) => o.every((v, k) => bytes[8 + k] === v))) throw new Error(NOT_CDX);
  // Bytes 8 to 11 give the byte order: 04 03 02 01 little-endian, as ChemDraw writes; 01 02 03 04 big-endian, as
  // ChemDraw 4 on the Mac wrote.
  const little = bytes[8] === 4, view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 22, objects = 0;
  const fail = (): never => { throw new Error(DAMAGED); };
  const need = (n: number) => { if (pos + n > bytes.length) fail(); };
  const u16 = () => { need(2); const v = view.getUint16(pos, little); pos += 2; return v; };
  const u32 = () => { need(4); const v = view.getUint32(pos, little); pos += 4; return v; };
  const num = (v: number) => (exact ? String(v) : fmt(v));
  const fonts = new Map<number, number>(); // font id to charset code
  let root: Xml | undefined;

  // An integer of 1, 2 or 4 bytes, signed or not.
  const int = (d: DataView, signed: boolean): number | undefined =>
    d.byteLength === 1 ? (signed ? d.getInt8(0) : d.getUint8(0)) : d.byteLength === 2 ? (signed ? d.getInt16(0, little) : d.getUint16(0, little)) : d.byteLength === 4 ? (signed ? d.getInt32(0, little) : d.getUint32(0, little)) : undefined;
  const coord = (d: DataView, at: number) => d.getInt32(at, little) / 65536;
  // A styled string: its runs (start, font, face, size, colour) and its bytes. Short of its runs, it is all text.
  const styled = (b: Uint8Array) => {
    const d = new DataView(b.buffer, b.byteOffset, b.byteLength), n = b.length >= 2 ? d.getUint16(0, little) : 0;
    if (b.length < 2 || b.length < 2 + 10 * n) return { runs: [] as number[][], text: b };
    return { runs: Array.from({ length: n }, (_, k) => [0, 2, 4, 6, 8].map((o) => d.getUint16(2 + 10 * k + o, little))), text: b.subarray(2 + 10 * n) };
  };
  // A text object's runs as CDXML's <s> elements: each run's bytes decoded in its font's charset (UTF-8 for 0x0709).
  const runsOf = (b: Uint8Array, unicode: boolean, el: Xml): Xml[] => {
    const { runs, text } = styled(b);
    const parts: { run?: number[]; bytes: Uint8Array }[] = [];
    if (!runs.length) parts.push({ bytes: text });
    else {
      if (runs[0][0] > 0) parts.push({ bytes: text.subarray(0, runs[0][0]) });
      runs.forEach((r, k) => parts.push({ run: r, bytes: text.subarray(Math.min(r[0], text.length), Math.min(k + 1 < runs.length ? Math.max(r[0], runs[k + 1][0]) : text.length, text.length)) }));
    }
    return parts.filter((p) => p.bytes.length).map(({ run, bytes: b2 }) => {
      const s: Xml = { name: "s", attrs: Object.create(null), kids: [], text: "" };
      if (run && run[1] !== 0xffff) s.attrs.font = String(run[1]);
      if (run && run[3]) s.attrs.size = String(run[3] / 20);
      if (run) s.attrs.color = String(run[4]);
      if (run && run[2]) s.attrs.face = String(run[2]);
      s.text = (unicode ? anyText(b2) : decoder(LABELS[runCharset(fonts, run?.[1] ?? -1, el, root)] ?? "macintosh").decode(b2)).replace(/\r\n?/g, "\n");
      return s;
    });
  };

  // One property into the element: an attribute, or the children CDXML gives it (tables, represent, text runs).
  const prop = (el: Xml, tag: number, b: Uint8Array, text: { legacy?: Uint8Array; unicode?: Uint8Array }) => {
    const p = plainName(el, byTag.get(tag)), d = new DataView(b.buffer, b.byteOffset, b.byteLength), a = el.attrs;
    const kid = (name: string, attrs: Record<string, string>) => { const x: Xml = { name, attrs: Object.assign(Object.create(null), attrs), kids: [], text: "" }; return x; };
    const raw = () => { a[p?.name || `attrib${tag.toString(16).padStart(4, "0")}`] = `|x|${hex(b)}`; };
    if (!p) return raw();
    const name = p.name, n = b.length;
    switch (p.kind) {
      case "flag": a[name] = "yes"; return;
      case "bool": a[name] = n === 0 ? (tag === 0x0011 ? "no" : tag === 0x0014 ? "no" : "yes") : b.some((x) => x) ? "yes" : "no"; return;
      case "i8": case "i16": case "i32": case "u16": { const v = int(d, p.kind !== "u16"); if (v !== undefined) a[name] = String(v); return; }
      case "e8": case "e16": { const v = int(d, little); if (v !== undefined) a[name] = p.names!.get(v) ?? p.names!.get(v & 0xffff) ?? String(v); return; }
      case "b8": case "b16": {
        const v = int(d, false);
        if (v === undefined) return;
        const set = [...p.names!].filter(([bit]) => bit && (v & bit) === bit).map(([, nm]) => nm);
        a[name] = set.length ? set.join(" ") : p.names!.get(0) ?? "0";
        return;
      }
      case "order": {
        const v = int(d, false);
        if (v === undefined) return;
        a[name] = (n === 1 && v === 0xff) || v === 0xffff ? "any" : [...p.names!].filter(([bit]) => v & bit).map(([, nm]) => nm).join(" ") || "1";
        return;
      }
      case "charge": { const v = n === 4 ? d.getInt32(0, little) / 2 ** 24 : int(d, little); if (v !== undefined) a[name] = String(n === 4 ? +v.toFixed(4) : v); return; }
      case "coord": if (n === 4) a[name] = num(coord(d, 0)); return;
      case "p2": if (n === 8) a[name] = `${num(coord(d, 4))} ${num(coord(d, 0))}`; return;
      case "p3": if (n === 12) a[name] = `${num(coord(d, 0))} ${num(coord(d, 4))} ${num(coord(d, 8))}`; return;
      case "rect": if (n === 16) a[name] = `${num(coord(d, 4))} ${num(coord(d, 0))} ${num(coord(d, 12))} ${num(coord(d, 8))}`; return;
      case "angle": { const v = n === 4 ? d.getInt32(0, little) / 65536 : n === 2 ? d.getInt16(0, little) / 10 : undefined; if (v !== undefined) a[name] = exact ? String(v) : String(+v.toFixed(2)); return; }
      case "deg10": { const v = int(d, little); if (v !== undefined) a[name] = String(v / 10); return; }
      case "spacing": { const v = int(d, false); if (v !== undefined) a[name] = String(v / 10); return; }
      case "alpha": { const v = int(d, false); if (v !== undefined) a[name] = exact ? String(v / 65535) : String(+(v / 65535).toFixed(4)); return; }
      case "f64": if (n === 8) a[name] = String(d.getFloat64(0, little)); return;
      case "lh": { const v = n === 4 ? d.getInt32(0, little) / 65536 : int(d, little); if (v !== undefined) a[name] = n !== 4 && v === 1 ? "auto" : n !== 4 && v === 0 ? "variable" : String(n === 4 ? v : v / 20); return; }
      case "wrap": { const v = n === 4 ? d.getInt32(0, little) / 65536 : int(d, little); if (v !== undefined) a[name] = num(v); return; }
      case "str": a[name] = anyText(styled(b).text).replace(/\r\n?/g, "\n"); return;
      case "plain": a[name] = anyText(b); return;
      case "hex": a[name] = hex(b); return;
      case "ids": if (n % 4 === 0) a[name] = Array.from({ length: n / 4 }, (_, k) => d.getInt32(4 * k, little)).join(" "); return;
      case "attachments": {
        const counted = n >= 2 && n === 2 + 4 * d.getUint16(0, little), at = counted ? 2 : 0;
        if (counted || n % 4 === 0) a[name] = Array.from({ length: (n - at) / 4 }, (_, k) => d.getInt32(at + 4 * k, little)).join(" ");
        return;
      }
      case "linestarts": if (n >= 2 && n === 2 + 2 * d.getUint16(0, little)) a[name] = Array.from({ length: d.getUint16(0, little) }, (_, k) => d.getUint16(2 + 2 * k, little)).join(" "); return;
      case "elist": {
        if (n < 2) return;
        const c = d.getInt16(0, little), m = Math.abs(c);
        if (n === 2 + 2 * m) a[name] = (c < 0 ? "NOT " : "") + Array.from({ length: m }, (_, k) => d.getInt16(2 + 2 * k, little)).join(" ");
        return;
      }
      case "curve": {
        if (n < 2) return;
        const c = d.getUint16(0, little);
        if (n === 2 + 8 * c) a[name] = Array.from({ length: c }, (_, k) => `${num(coord(d, 6 + 8 * k))} ${num(coord(d, 2 + 8 * k))}`).join(" ");
        return;
      }
      // A spectrum's values, each in full (CDXML's YLow and YScale do not apply to them: they are dropped below).
      case "spectrum": if (n % 8 === 0 && n / 8 <= MAX_SPECTRUM) el.text = Array.from({ length: n / 8 }, (_, k) => String(d.getFloat64(8 * k, little))).join(" "); return;
      case "tagvalue": {
        const t = a.TagType;
        if (t === "Double" && n === 8) a[name] = String(d.getFloat64(0, little));
        else if (t === "Long") { const v = int(d, little); if (v !== undefined) a[name] = String(v); }
        else if (t === "String") a[name] = anyText(styled(b).text);
        else raw();
        return;
      }
      case "sgvalue": if (a.SGDataType === "4") a[name] = anyText(b); else if (n === 8) a[name] = String(d.getFloat64(0, little)); else raw(); return;
      case "text": text.legacy = b; return;
      case "utf8": text.unicode = b; return;
      // One part of a style record on its own (other writers, Indigo among them, write these).
      case "style": { const v = int(d, false); if (v !== undefined) a[name] = String(name.endsWith("Size") ? v / 20 : v); return; }
      case "labelstyle": case "captionstyle": {
        if (n !== 8) return;
        const which = p.kind === "labelstyle" ? "Label" : "Caption", [font, face, size, colour] = [0, 2, 4, 6].map((o) => d.getUint16(o, little));
        if (font !== 0xffff) a[`${which}Font`] = String(font);
        a[`${which}Face`] = String(face);
        a[`${which}Size`] = String(size / 20);
        a[`${which}Color`] = String(colour);
        return;
      }
      case "fonttable": {
        if (n < 4) return;
        const table = kid("fonttable", {}), count = d.getUint16(2, little);
        let at = 4;
        for (let k = 0; k < count; k++) {
          if (at + 6 > n) return;
          const id = d.getUint16(at, little), cs = d.getUint16(at + 2, little), len = d.getUint16(at + 4, little);
          if (at + 6 + len > n) return;
          const nameBytes = b.subarray(at + 6, at + 6 + len);
          fonts.set(id, cs);
          table.kids.push(kid("font", { id: String(id), charset: charsets.get(cs) ?? "Unknown", name: decoder(LABELS[cs] ?? "macintosh").decode(nameBytes) }));
          at += 6 + len;
        }
        if (at === n) el.kids.push(table);
        return;
      }
      case "colortable": {
        const count = n >= 2 ? d.getUint16(0, little) : -1;
        if (n !== 2 + 6 * count) return;
        const c = (v: number) => (v === 0 ? "0" : v === 0xffff ? "1" : exact ? String(v / 65535) : (v / 65535).toFixed(4));
        el.kids.push({ name: "colortable", attrs: Object.create(null), text: "", kids: Array.from({ length: count }, (_, k) => kid("color", { r: c(d.getUint16(2 + 6 * k, little)), g: c(d.getUint16(4 + 6 * k, little)), b: c(d.getUint16(6 + 6 * k, little)) })) });
        return;
      }
      case "represent":
        if (n % 6) return;
        for (let k = 0; k < n / 6; k++) el.kids.push(kid("represent", { attribute: byTag.get(d.getUint16(6 * k + 4, little))?.name || "", object: String(d.getUint32(6 * k, little)) }));
        return;
      default: raw();
    }
  };

  const object = (tag: number, id: number, depth: number): Xml => {
    if (++objects > MAX_OBJECTS || depth > MAX_DEPTH) throw new Error(TOO_BIG);
    const el: Xml = depth ? { name: OBJECTS[tag] ?? `object${tag.toString(16)}`, attrs: Object.create(null), kids: [], text: "" } : root!;
    if (id) el.attrs.id = String(id);
    const text: { legacy?: Uint8Array; unicode?: Uint8Array } = {}, objects0: Xml[] = [];
    for (;;) {
      if (!depth && pos >= bytes.length) break; // a document left open at the end of the file
      const t = u16();
      if (t === 0) break;
      if (t & 0x8000) { objects0.push(object(t, u32() | 0, depth + 1)); continue; }
      let len = u16();
      if (len === 0xffff) len = u32();
      need(len);
      const b = bytes.subarray(pos, pos + len);
      pos += len;
      prop(el, t, b, text);
    }
    // UTF-8 text wins over the legacy copy (as ChemDraw reads it).
    if (el.name === "spectrum" && el.text) { delete el.attrs.YLow; delete el.attrs.YScale; }
    const runs = text.unicode?.length ? runsOf(text.unicode, true, el) : text.legacy ? runsOf(text.legacy, false, el) : [];
    el.kids = [...el.kids, ...runs, ...objects0];
    return el;
  };
  // ChemDraw writes the document's tag and id after the header; other writers (Indigo) leave them as zeros.
  const tag = u16(), id = u32() | 0;
  if (tag !== 0x8000 && (tag || id)) fail();
  root = { name: "CDXML", attrs: Object.create(null), kids: [], text: "" };
  return object(0x8000, id, 0);
}

// ---------------------------------------------------------------------------------------------------------------
// Writing.

// A growing byte buffer, little-endian.
class Out {
  b = new Uint8Array(1 << 16);
  n = 0;
  room(k: number) {
    if (this.n + k <= this.b.length) return;
    const next = new Uint8Array(Math.max(this.b.length * 2, this.n + k));
    next.set(this.b.subarray(0, this.n));
    this.b = next;
  }
  bytes(x: ArrayLike<number>) { this.room(x.length); this.b.set(x, this.n); this.n += x.length; }
  u16(v: number) { this.room(2); new DataView(this.b.buffer).setUint16(this.n, v & 0xffff, true); this.n += 2; }
  u32(v: number) { this.room(4); new DataView(this.b.buffer).setUint32(this.n, v >>> 0, true); this.n += 4; }
  done() { return this.b.slice(0, this.n); }
}
// Little-endian values as bytes.
const le = (size: 1 | 2 | 4, ...vs: number[]) => {
  const b = new Uint8Array(size * vs.length), d = new DataView(b.buffer);
  vs.forEach((v, k) => (size === 1 ? d.setUint8(k, v & 0xff) : size === 2 ? d.setUint16(2 * k, v & 0xffff, true) : d.setUint32(4 * k, v >>> 0, true)));
  return b;
};
const f64 = (v: number) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); return b; };
const enc = new TextEncoder();
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d{1,3})?$/;
const real = (s?: string) => { const t = s?.trim(); return t && NUMBER.test(t) && Math.abs(Number(t)) < 1e9 ? Number(t) : undefined; };
const reals = (s: string) => s.trim().split(/\s+/).map(real);
// Whole numbers in a list (ids reach 2^31).
const ints = (s: string) => (s.trim() ? s.trim().split(/\s+/) : []).map((v) => (/^-?\d{1,10}$/.test(v) && Math.abs(Number(v)) < 2 ** 32 ? Number(v) : undefined));
const fixed = (v: number) => Math.round(v * 65536);
// A string's bytes: Mac Roman, as ChemDraw writes its strings, or UTF-8 when Mac Roman lacks a character.
// Annotations' keywords and contents are always UTF-8.
function stringBytes(s: string, unicode = false): Uint8Array {
  if (!unicode) {
    const mac: number[] = [];
    for (const ch of s) { const b = macByte(ch); if (b === undefined) return enc.encode(s); mac.push(b); }
    return new Uint8Array(mac);
  }
  return enc.encode(s);
}
// A styled string with no runs.
const plainString = (s: string, unicode = false) => { const t = stringBytes(s, unicode); const b = new Uint8Array(2 + t.length); b.set(t, 2); return b; };

// The CDXML tree (as cdxml.ts reads or writes it) as a CDX file. Attributes CDX has no tag for are left out (Octet's
// own "Octet" data among them), as are elements it has no object for.
export function xmlToCdx(root: Xml): Uint8Array {
  const out = new Out();
  out.bytes(HEADER);
  const docStyle: Record<string, string> = {};
  for (const [k, v] of Object.entries(root.attrs)) if (/^(Label|Caption)(Font|Face|Size|Color)$/.test(k)) docStyle[k] = v;
  const fontIds: number[] = [];
  // Font id to charset code, so each run's legacy text is in its font's charset.
  const fonts = new Map<number, number>();
  for (const f of root.kids.find((k) => k.name === "fonttable")?.kids ?? []) fonts.set(Number.parseInt(f.attrs.id ?? "", 10), charsetCode.get(f.attrs.charset ?? "") ?? 10000);
  const put = (tag: number, data: Uint8Array) => {
    out.u16(tag);
    if (data.length >= 0xffff) { out.u16(0xffff); out.u32(data.length); } else out.u16(data.length);
    out.bytes(data);
  };
  // An attribute's bytes, by its tag's kind; undefined when the value does not fit it.
  const value = (el: Xml, p: Prop, v: string): Uint8Array | undefined => {
    const i = Number.parseInt(v, 10), r = real(v), list = reals(v), whole = ints(v);
    const named = (s: string) => p.values!.get(s) ?? [...p.values!].find(([nm]) => nm.toLowerCase() === s.toLowerCase())?.[1] ?? (/^-?\d+$/.test(s) ? Number(s) : undefined);
    switch (p.kind) {
      case "flag": return /^(yes|true)$/.test(v) ? new Uint8Array(0) : undefined;
      case "bool": return le(1, /^(yes|true)$/.test(v) ? 1 : 0);
      case "i8": return Number.isFinite(i) ? le(1, i) : undefined;
      case "i16": case "u16": return Number.isFinite(i) ? le(2, i) : undefined;
      case "i32": return Number.isFinite(i) ? le(4, i) : undefined;
      case "e8": case "e16": { const x = named(v.trim()); return x === undefined ? undefined : le(p.kind === "e8" ? 1 : 2, x); }
      case "b8": case "b16": {
        const bits = v.trim().split(/\s+/).map(named);
        return bits.some((x) => x === undefined) ? undefined : le(p.kind === "b8" ? 1 : 2, bits.reduce((s: number, x) => s | x!, 0));
      }
      case "order": {
        if (v.trim() === "any") return le(2, 0xffff);
        const bits = v.trim().split(/\s+/).map((s) => p.values!.get(s));
        return bits.some((x) => x === undefined) ? undefined : le(2, bits.reduce((s: number, x) => s | x!, 0));
      }
      case "charge": return r === undefined ? undefined : Number.isInteger(r) && Math.abs(r) < 128 ? le(1, r) : le(4, Math.round(r * 2 ** 24));
      case "coord": return r === undefined ? undefined : le(4, fixed(r));
      case "p2": return list.length >= 2 && list[0] !== undefined && list[1] !== undefined ? le(4, fixed(list[1]), fixed(list[0])) : undefined;
      case "p3": return list.length >= 2 && list.slice(0, 3).every((x) => x !== undefined) ? le(4, fixed(list[0]!), fixed(list[1]!), fixed(list[2] ?? 0)) : undefined;
      case "rect": return list.length === 4 && list.every((x) => x !== undefined) ? le(4, fixed(list[1]!), fixed(list[0]!), fixed(list[3]!), fixed(list[2]!)) : undefined;
      case "angle": return r === undefined ? undefined : le(4, fixed(r));
      case "deg10": return r === undefined ? undefined : le(2, Math.round(r * 10));
      case "spacing": return r === undefined ? undefined : le(2, Math.round(r * 10));
      case "alpha": return r === undefined ? undefined : le(2, Math.round(Math.min(1, Math.max(0, r)) * 65535));
      case "f64": return r === undefined ? undefined : f64(r);
      case "lh": return v === "auto" ? le(2, 1) : v === "variable" ? le(2, 0) : r === undefined ? undefined : le(2, Math.round(r * 20));
      case "wrap": return r === undefined ? undefined : le(2, Math.round(r));
      case "str": return plainString(v.replace(/\n/g, "\r"), p.tag === 0x1500 || p.tag === 0x1501);
      case "plain": return stringBytes(v);
      case "hex": { const h = pictureHex(v); return h === undefined ? undefined : unhex(h); }
      case "ids": return whole.every((x) => x !== undefined) ? le(4, ...(whole as number[])) : undefined;
      case "attachments": return whole.every((x) => x !== undefined) ? new Uint8Array([...le(2, whole.length), ...le(4, ...(whole as number[]))]) : undefined;
      case "linestarts": return whole.every((x) => x !== undefined) ? le(2, whole.length, ...(whole as number[])) : undefined;
      case "elist": {
        const not = /^NOT\s/.test(v), ids = reals(v.replace(/^NOT\s+/, ""));
        return ids.every((x) => x !== undefined) ? le(2, not ? -ids.length : ids.length, ...(ids as number[])) : undefined;
      }
      case "curve": {
        if (list.length % 2 || list.some((x) => x === undefined) || list.length / 2 > MAX_POINTS) return undefined;
        const pts: number[] = [];
        for (let k = 0; k < list.length; k += 2) pts.push(fixed(list[k + 1]!), fixed(list[k]!));
        return new Uint8Array([...le(2, list.length / 2), ...le(4, ...pts)]);
      }
      case "tagvalue": {
        const t = el.attrs.TagType;
        return t === "Double" && r !== undefined ? f64(r) : t === "Long" && Number.isFinite(i) ? le(4, i) : t === "String" ? plainString(v) : undefined;
      }
      case "sgvalue": return el.attrs.SGDataType === "4" ? enc.encode(v) : r === undefined ? undefined : f64(r);
      default: return undefined;
    }
  };
  // A raw property kept from a CDX file ("|x|" and hex).
  const rawValue = (v: string) => (v.startsWith("|x|") ? unhex(v.slice(3)) : enc.encode(v));

  // A text object's runs as the legacy text (in each run's charset, the run cut at its first character the charset
  // lacks) and the UTF-8 text, as ChemDraw writes them.
  const textProps = (runs: Xml[], el: Xml) => {
    const legacy: number[][] = [], unicode: number[][] = [], legacyBytes: number[] = [], unicodeBytes: number[] = [];
    for (const s of runs) {
      const text = s.text.replace(/\r\n?|\n/g, "\r"), font = Number.parseInt(s.attrs.font ?? "", 10), size = real(s.attrs.size), colour = Number.parseInt(s.attrs.color ?? "", 10), face = Number.parseInt(s.attrs.face ?? "", 10);
      const style = [Number.isFinite(font) ? font : 0xffff, Number.isFinite(face) ? face : 0, size ? Math.round(size * 20) : 0, Number.isFinite(colour) ? colour : 3];
      if (!text) continue;
      const u = enc.encode(text);
      unicode.push([unicodeBytes.length, ...style]);
      unicodeBytes.push(...u);
      const bytes: number[] = [], cs = runCharset(fonts, style[0], el, root);
      for (const ch of text) { const b = legacyByte(ch, cs); if (b === undefined || b === 0) break; bytes.push(b); }
      if (bytes.length) { legacy.push([legacyBytes.length, ...style]); legacyBytes.push(...bytes); }
    }
    const pack = (rs: number[][], b: number[]) => new Uint8Array([...le(2, rs.length), ...rs.flatMap((r) => [...le(2, ...r)]), ...b]);
    if (legacy.length) put(0x0700, pack(legacy, legacyBytes));
    if (unicode.length) put(0x0709, pack(unicode, unicodeBytes));
  };

  const object = (x: Xml, depth: number) => {
    const tag = objectTag.get(x.name);
    if (tag === undefined || depth > MAX_DEPTH) return;
    out.u16(tag);
    out.u32(Number.parseInt(x.attrs.id ?? "0", 10) || 0);
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(x.attrs)) {
      if (k === "id") continue;
      const m = /^attrib([0-9a-f]{4})$/.exec(k);
      if (m) { const b = rawValue(v); if (b) put(parseInt(m[1], 16), b); continue; }
      const p = plainName(x, byName.get(k));
      if (!p) continue;
      if (p.kind === "style") { style[k] = v; continue; }
      if (p.kind === "raw") { const b = rawValue(v); if (b) put(p.tag, b); continue; }
      // Width and Height on a TLC spot, and its Tail, are whole 1/65536 pt.
      const kind = x.name === "tlcspot" && (k === "Width" || k === "Height") ? { ...p, kind: "i32" } : p;
      const b = value(x, kind, v);
      if (b) put(p.tag, b);
    }
    // Label and caption styles: CDXML's four attributes as one 8-byte record, the document's filling any part left out.
    for (const which of ["Label", "Caption"]) {
      if (!STYLE_PARTS.some((part) => style[which + part] !== undefined)) continue;
      const part = (s: string, d: number) => { const v = real(style[which + s] ?? docStyle[which + s]); return v === undefined ? d : v; };
      put(which === "Label" ? 0x080a : 0x080b, le(2, part("Font", 0xffff), part("Face", 0), Math.round(part("Size", 10) * 20), part("Color", 3)));
    }
    // Children CDXML holds that CDX holds as properties.
    for (const k of x.kids) {
      if (k.name === "colortable") put(0x0300, new Uint8Array([...le(2, k.kids.length), ...k.kids.flatMap((c) => [...le(2, ...["r", "g", "b"].map((ch) => Math.round(Math.min(1, Math.max(0, real(c.attrs[ch]) ?? 0)) * 65535)))])]));
      if (k.name === "fonttable") {
        const entries: number[] = [];
        for (const f of k.kids) {
          const id = Number.parseInt(f.attrs.id ?? "", 10), cs = charsetCode.get(f.attrs.charset ?? "") ?? 10000;
          if (!Number.isFinite(id)) continue;
          fontIds.push(id);
          const nm: number[] = [];
          for (const ch of f.attrs.name ?? "") { const b = legacyByte(ch, cs); if (b !== undefined) nm.push(b); }
          entries.push(...le(2, id, cs, nm.length), ...nm);
        }
        put(0x0100, new Uint8Array([...le(2, 1, fontIds.length), ...entries]));
      }
    }
    const represent = x.kids.filter((k) => k.name === "represent").flatMap((k) => {
      const tagOf = byName.get(k.attrs.attribute ?? "")?.tag, id = Number.parseInt(k.attrs.object ?? "", 10);
      return tagOf === undefined || !Number.isFinite(id) ? [] : [...le(4, id), ...le(2, tagOf)];
    });
    if (represent.length) put(0x000e, new Uint8Array(represent));
    // A spectrum's values in full: CDXML's text times YScale (when it is not 0 or 1), plus YLow.
    if (x.name === "spectrum" && x.text.trim()) {
      const v = x.text.trim().split(/\s+/).map(Number), scale = Number(x.attrs.YScale ?? 0), low = Number(x.attrs.YLow ?? 0), f = Number.isFinite(scale) && scale !== 0 ? scale : 1;
      if (v.length <= MAX_SPECTRUM && v.every(Number.isFinite) && Number.isFinite(low)) {
        const b = new Uint8Array(8 * v.length), dv = new DataView(b.buffer);
        v.forEach((n, k) => dv.setFloat64(8 * k, n * f + low, true));
        put(0x0a86, b);
      }
    }
    const runs = x.kids.filter((k) => k.name === "s");
    if (runs.length) textProps(runs, x);
    for (const k of x.kids) if (!["colortable", "fonttable", "represent", "s"].includes(k.name)) object(k, depth + 1);
    out.u16(0);
  };
  object(root, 0);
  return out.done();
}
