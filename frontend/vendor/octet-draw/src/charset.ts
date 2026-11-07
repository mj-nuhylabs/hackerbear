// Legacy text in ChemDraw files: the charset codes and names of a font table, one decoder and one byte table per
// charset (so the CDX reader, the CDX writer and the CDXML reader agree), and the Symbol font.
// ChemDraw writes Greek, arrows and some maths in the Symbol font as Latin bytes: "n" in Symbol is ν, "D" is Δ, byte
// 0xAE is →. Octet reads those runs as the Unicode characters ChemDraw draws, and writes Unicode (issue 21).

import { CHARSETS } from "./cdxtags.ts";

export const charsets = new Map(CHARSETS.split(",").map((pair) => { const k = pair.indexOf("="); return [Number(pair.slice(0, k)), pair.slice(k + 1)] as const; }));
export const charsetCode = new Map([...charsets].map(([code, name]) => [name, code]));

// Text in a legacy charset: the WHATWG name of each charset code ChemDraw writes. Others read as Mac Roman, which is
// what ChemDraw itself falls back to.
export const LABELS: Record<number, string> = { 10000: "macintosh", 1252: "windows-1252", 1250: "windows-1250", 1251: "windows-1251", 1253: "windows-1253", 1254: "windows-1254",
  1255: "windows-1255", 1256: "windows-1256", 1257: "windows-1257", 1258: "windows-1258", 874: "windows-874", 932: "shift_jis", 936: "gbk", 949: "euc-kr", 950: "big5",
  866: "ibm866", 10007: "x-mac-cyrillic", 65001: "utf-8", 1200: "utf-8" };
const decoders = new Map<string, TextDecoder>();
export function decoder(label: string): TextDecoder {
  let d = decoders.get(label);
  if (!d) {
    try { d = new TextDecoder(label); } catch { d = new TextDecoder("macintosh"); }
    decoders.set(label, d);
  }
  return d;
}
// A charset's one-byte characters, for writing ChemDraw's legacy copy of a text in the charset its reader decodes it
// in. A multibyte charset (UTF-8, Shift JIS) gives only its one-byte characters.
const byteTables = new Map<number, Map<string, number>>();
export function legacyByte(ch: string, charset: number): number | undefined {
  const c = ch.codePointAt(0)!;
  if (c < 0x80) return c;
  let t = byteTables.get(charset);
  if (!t) {
    t = new Map();
    const d = decoder(LABELS[charset] ?? "macintosh");
    for (let b = 0x80; b < 0x100; b++) { const x = d.decode(new Uint8Array([b])); if (x.length === 1 && x !== "�") t.set(x, b); }
    byteTables.set(charset, t);
  }
  return t.get(ch);
}

// The Symbol font's glyphs for bytes 0x20 to 0xFE, as Unicode publishes Adobe's table. Δ, Ω and μ are the Greek
// letters. Adobe's private-use pieces are the real characters: bracket and brace pieces (U+239B to U+23AD), the
// extenders (U+203E, U+23D0, U+23AF, U+23AE) and ® © ™. A space is a byte with no glyph (0x7F to 0x9F, 0xF0).
const SYMBOL = " !∀#∃%&∋()∗+,−./0123456789:;<=>?≅ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ[∴]⊥_‾αβχδεφγηιϕκλμνοπθρστυϖωξψζ{|}∼"
  + " ".repeat(33)
  + "€ϒ′≤⁄∞ƒ♣♦♥♠↔←↑→↓°±″≥×∝∂•÷≠≡≈…⏐⎯↵ℵℑℜ℘⊗⊕∅∩∪⊃⊇⊄⊂⊆∈∉∠∇®©™∏√⋅¬∧∨⇔⇐⇑⇒⇓◊〈®©™∑⎛⎜⎝⎡⎢⎣⎧⎨⎩⎪ 〉∫⌠⎮⌡⎞⎟⎠⎤⎥⎦⎫⎬⎭";
const glyph = (b: number) => (b >= 0x20 && b <= 0xfe && (b === 0x20 || SYMBOL[b - 0x20] !== " ") ? SYMBOL[b - 0x20] : undefined);

// The Symbol font and its clones on Linux, by name with case, spaces and hyphens ignored.
const SYMBOL_FONTS = ["symbol", "symbolmt", "standardsymbolsps", "standardsyml"];
export const isSymbolFont = (name?: string) => !!name && SYMBOL_FONTS.includes(name.toLowerCase().replace(/[\s-]/g, ""));

// A Symbol run's text as the characters ChemDraw draws. An ASCII character is its own byte. Windows's private-use
// copy of a Symbol byte (U+F020 to U+F0FF) is that byte. Another character is the byte it is in the font's charset
// when that is a Windows charset (iso-8859-1 and the other Windows code pages). In any other charset (a Mac one,
// Unknown, none) it is kept, as ChemDraw on the Mac draws it as it is. A character with no byte is kept.
// A byte the font has no glyph for keeps its character, and `missing` counts it.
export function symbolText(text: string, charset: number): { text: string; missing: number } {
  let out = "", missing = 0;
  const windows = LABELS[charset]?.startsWith("windows-");
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) { out += ch; continue; }
    const b = c < 0x80 ? c : c >= 0xf020 && c <= 0xf0ff ? c - 0xf000 : windows ? legacyByte(ch, charset) : undefined;
    if (b === undefined) { out += ch; continue; }
    const g = glyph(b);
    if (g === undefined) missing++;
    out += g ?? ch;
  }
  return { text: out, missing };
}
