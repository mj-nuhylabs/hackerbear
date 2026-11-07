// JCAMP-DX spectra (versions 4.24, 5.0 and 6.0: McDonald and Wilks 1988, Davies and Lampen 1993, Lampen et al. 1999):
// NMR, IR, UV-Vis and mass spectra, as XYDATA in every form (AFFN, PAC, SQZ, DIF and DUP), XYPOINTS, PEAK TABLE, and
// NTUPLES pages of a processed NMR spectrum (the real part). Also Bruker's processed data (procs and 1r) and Galactic
// SPC files. Every file is hostile: sizes, point counts and nesting are limited, and a file that breaks a rule is
// refused with a plain message, never half read.

export type Kind = "nmr" | "ir" | "uv" | "ms" | "other";
// A spectrum as read: evenly spaced from `first` to `last` (x units), or at `xs` when it is not; `sticks` for a peak
// table (a mass spectrum), drawn as lines. NMR shifts are in ppm. `peaks`: the file's own peak table, if it has one
// beside the data.
export type JcampSpectrum = {
  title: string; kind: Kind; nucleus?: string; mhz?: number; solvent?: string; xUnit: string; yUnit: string;
  first: number; last: number; y: Float64Array; xs?: Float64Array; sticks?: true; peaks?: [number, number][];
};

export const MAX_POINTS = 1 << 21; // points in one spectrum (2,097,152)
const MAX_ALL = 1 << 23, MAX_BLOCKS = 64, MAX_DEPTH = 3, MAX_PEAKS = 100_000, MAX_SPECTRA = 16;

const fail = (why: string): never => { throw new Error(why); };
const damaged = (what: string): never => fail(`This JCAMP-DX file is damaged: ${what}.`);
const tooMany = (n: number): never => fail(`This spectrum has ${Math.round(n).toLocaleString("en-GB")} points. Octet opens spectra of up to ${MAX_POINTS.toLocaleString("en-GB")} points.`);

// A label as JCAMP-DX compares them: capitals, without spaces, hyphens, slashes and underscores.
const norm = (label: string) => label.toUpperCase().replace(/[\s\-/_]/g, "");

type Ldr = { label: string; value: string };
type Block = { ldrs: Ldr[]; children: Block[] };

// The file's blocks: each from ##TITLE to ##END, a compound file's blocks inside its link block. $$ starts a comment.
function blocks(text: string): Block[] {
  if (!/^\s*##\s*TITLE\s*=/i.test(text.slice(0, 4096).replace(/^﻿/, "").replace(/^(\s*\$\$[^\n]*\n)*/, ""))) fail("This file is not a JCAMP-DX spectrum.");
  const top: Block[] = [], stack: Block[] = [];
  let count = 0, ldr: Ldr | undefined;
  const lines = text.split(/\r\n|\r|\n/);
  for (const raw of lines) {
    const at = raw.indexOf("$$"), line = at >= 0 ? raw.slice(0, at) : raw;
    const m = /^\s*##([^=]*)=(.*)$/.exec(line);
    if (!m) { if (ldr && line.trim()) ldr.value += `\n${line}`; continue; }
    const label = norm(m[1]);
    if (label === "TITLE") {
      if (++count > MAX_BLOCKS) fail(`This JCAMP-DX file has more than ${MAX_BLOCKS} blocks. Octet cannot open it.`);
      if (stack.length >= MAX_DEPTH) fail("This JCAMP-DX file has blocks nested too deep. Octet cannot open it.");
      const b: Block = { ldrs: [], children: [] };
      (stack.length ? stack[stack.length - 1].children : top).push(b);
      stack.push(b);
    } else if (!stack.length) damaged("a label comes before the first title");
    ldr = { label, value: m[2] };
    stack[stack.length - 1].ldrs.push(ldr);
    if (label === "END") { stack.pop(); ldr = undefined; }
  }
  if (!top.length) fail("This file is not a JCAMP-DX spectrum.");
  return top;
}

// --- Numbers ---------------------------------------------------------------------------------------------------

const SQZ = "@ABCDEFGHI", SQZ_NEG = "abcdefghi", DIF = "%JKLMNOPQR", DIF_NEG = "jklmnopqr", DUP = "STUVWXYZs";
type Tok = { kind: "abs" | "dif" | "dup"; v: number };

// One line of an ASDF table as tokens: absolute values (AFFN, PAC or SQZ), differences (DIF) and repeats (DUP). An
// E is an exponent only after a digit and before a sign (1.5E+03); otherwise it is SQZ for +5.
function tokens(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = line.length, digits = (from: number) => { let j = from; while (j < n && ((line[j] >= "0" && line[j] <= "9") || line[j] === ".")) j++; return j; };
  const num = (s: string) => { const v = Number(s); return Number.isFinite(v) && Math.abs(v) < 1e300 ? v : damaged(`"${s.slice(0, 20)}" is not a number`); };
  while (i < n) {
    const c = line[i];
    if (c === " " || c === "\t" || c === "," || c === ";") { i++; continue; }
    if (c === "?") { out.push({ kind: "abs", v: 0 }); i++; continue; }
    if ((c >= "0" && c <= "9") || c === "." || c === "+" || c === "-") {
      let j = c === "+" || c === "-" ? i + 1 : i;
      j = digits(j);
      if ((line[j] === "E" || line[j] === "e") && (line[j + 1] === "+" || line[j + 1] === "-") && line[j + 2] >= "0" && line[j + 2] <= "9") j = digits(j + 2);
      if (j === i + 1 && (c === "+" || c === "-")) damaged("a sign stands alone");
      out.push({ kind: "abs", v: num(line.slice(i, j)) });
      i = j;
      continue;
    }
    let k: number, kind: Tok["kind"], sign = 1;
    if ((k = SQZ.indexOf(c)) >= 0) kind = "abs";
    else if ((k = SQZ_NEG.indexOf(c)) >= 0) { kind = "abs"; sign = -1; k += 1; }
    else if ((k = DIF.indexOf(c)) >= 0) kind = "dif";
    else if ((k = DIF_NEG.indexOf(c)) >= 0) { kind = "dif"; sign = -1; k += 1; }
    else if ((k = DUP.indexOf(c)) >= 0) { kind = "dup"; k += 1; }
    else return damaged(`"${c}" cannot be in a data line`);
    const j = digits(i + 1);
    out.push({ kind, v: sign * num(`${k}${line.slice(i + 1, j)}`) });
    i = j;
  }
  return out;
}

// An (X++(Y..Y)) table's Y values: each line's X, then its Ys. A line that ends in DIF form repeats its last Y as the
// next line's first (the Y check), which is dropped. `most`: the points expected; more is an error.
function asdf(lines: string[], most: number): number[] {
  const ys: number[] = [];
  let checked = false;
  for (const line of lines) {
    const t = tokens(line);
    if (!t.length) continue;
    if (t[0].kind !== "abs") damaged("a data line does not start with its X value");
    let last: Tok | undefined, y = ys.length ? ys[ys.length - 1] : 0, first = true;
    for (const tok of t.slice(1)) {
      if (tok.kind === "dup") {
        if (!last) damaged("a repeat has nothing to repeat");
        const times = tok.v - 1;
        if (!Number.isInteger(tok.v) || tok.v < 1) damaged("a repeat count is not a whole number");
        if (ys.length + times > most + 1) tooMany(ys.length + times);
        for (let r = 0; r < times; r++) { if (last!.kind === "dif") y += last!.v; ys.push(y); }
        continue;
      }
      if (tok.kind === "dif") {
        if (!ys.length && first) damaged("the data start with a difference");
        y += tok.v;
      } else {
        y = tok.v;
        // The Y check: the line before ended in DIF form, so this first value repeats its last.
        if (first && checked) { first = false; last = tok; continue; }
      }
      first = false;
      if (ys.length >= most + 1) tooMany(ys.length + 1);
      ys.push(y);
      last = tok;
    }
    checked = last?.kind === "dif";
  }
  return ys;
}

// Free-form (XY..XY) values: pairs (or triples, for XYW and XYM) of numbers.
function tuples(lines: string[], width: number): number[][] {
  const vs = lines.flatMap((l) => tokens(l).map((t) => (t.kind === "abs" ? t.v : damaged("a table holds compressed values"))));
  if (vs.length % width) damaged("a table has a value missing");
  const out: number[][] = [];
  for (let i = 0; i < vs.length; i += width) out.push(vs.slice(i, i + width));
  return out;
}

// --- Blocks to spectra ----------------------------------------------------------------------------------------

const solventNames: [RegExp, string][] = [
  [/^(CDCL3|CHLOROFORM(-?D)?)$/i, "CDCl₃"], [/^(DMSO(-?D6)?|D6-?DMSO|DIMETHYL ?SULF?PH?OXIDE(-?D6)?)$/i, "DMSO-d₆"], [/^(CD3OD|MEOD|METHANOL(-?D4)?)$/i, "CD₃OD"],
  [/^(D2O|DEUTERIUM ?OXIDE|WATER(-?D2)?)$/i, "D₂O"], [/^(C6D6|BENZENE(-?D6)?)$/i, "C₆D₆"], [/^(ACETONE(-?D6)?|\(CD3\)2CO|CD3COCD3)$/i, "Acetone-d₆"], [/^(CD3CN|ACETONITRILE(-?D3)?)$/i, "CD₃CN"],
];
// A solvent's name as the Spectrum panel lists it (CDCl₃, DMSO-d₆), or the file's own name.
export function solventName(raw: string): string | undefined {
  const s = raw.replace(/[<>]/g, "").trim();
  if (!s) return undefined;
  return solventNames.find(([re]) => re.test(s))?.[1] ?? s.slice(0, 40);
}
// A nucleus as "1H" or "13C" from ^1H, 1H, <13C>, C13.
function nucleusOf(raw: string | undefined): string | undefined {
  const s = raw?.replace(/[\^<>\s]/g, "") ?? "";
  const m = /^(\d{1,3})([A-Z][a-z]?)$/.exec(s) ?? /^([A-Z][a-z]?)(\d{1,3})$/.exec(s)?.slice(0, 3).reverse();
  if (!m) return undefined;
  const [mass, el] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  return `${mass}${el}`;
}
const kind0 = (type: string): Kind => {
  const t = type.toUpperCase();
  return /NMR/.test(t) ? "nmr" : /INFRARED|\bIR\b|RAMAN/.test(t) ? "ir" : /UV|VIS/.test(t) ? "uv" : /MASS/.test(t) ? "ms" : "other";
};

function spectrumOf(b: Block, inherited: Map<string, string>): JcampSpectrum | undefined {
  const all = new Map(inherited);
  for (const l of b.ldrs) all.set(l.label, l.value);
  const get = (k: string) => all.get(k)?.trim();
  const number = (k: string) => {
    const v = get(k);
    if (v === undefined || v === "") return undefined;
    const n = Number(v.split(/[\s,]/)[0]);
    return Number.isFinite(n) ? n : damaged(`${k} is not a number`);
  };
  const type = get("DATATYPE") ?? get("NTUPLES") ?? "";
  if (/\bFID\b/i.test(type) || (kind0(type) === "nmr" && /SECONDS/i.test(get("XUNITS") ?? ""))) fail("This file holds a raw FID. Process it into a spectrum, then open it.");
  if (/2D|NMR ?SPECTRUM ?2|\bND\b/i.test(type) || (number("NUMDIM") ?? 1) > 1) fail("Octet opens 1D spectra only.");
  const kind = kind0(type), title = (b.ldrs.find((l) => l.label === "TITLE")?.value ?? "").trim().replace(/[\u0000-\u001f]/g, " ").slice(0, 200);
  const mhz = number(".OBSERVEFREQUENCY") ?? number("$SF") ?? number("$BF1");
  const nucleus = kind === "nmr" ? nucleusOf(get(".OBSERVENUCLEUS") ?? get("$NUC1") ?? get("$AXNUC")) : undefined;
  const solvent = solventName(get(".SOLVENTNAME") ?? get("$SOLVENT") ?? "");
  let xUnit = (get("XUNITS") ?? "").toUpperCase(), yUnit = (get("YUNITS") ?? "").toUpperCase();
  const xf = number("XFACTOR") ?? 1, yf = number("YFACTOR") ?? 1;
  let first: number | undefined = number("FIRSTX"), last: number | undefined = number("LASTX"), y: number[] | undefined, xs: number[] | undefined, sticks = false;
  const declared = number("NPOINTS");
  if (declared !== undefined && (!Number.isInteger(declared) || declared < 1)) damaged("NPOINTS is not a whole number");
  if (declared !== undefined && declared > MAX_POINTS) tooMany(declared);
  const data = (label: string) => b.ldrs.find((l) => l.label === label);
  let peaks: [number, number][] | undefined;
  const table = data("PEAKTABLE");
  if (table) {
    const form = table.value.split("\n")[0].replace(/\s/g, "").toUpperCase(), width = form.includes("XYW") || form.includes("XYM") ? 3 : 2;
    const rows = tuples(table.value.split("\n").slice(1).concat(form.startsWith("(") ? [] : [table.value.split("\n")[0]]), width);
    if (rows.length > MAX_PEAKS) fail(`This spectrum has more than ${MAX_PEAKS.toLocaleString("en-GB")} peaks. Octet cannot open it.`);
    peaks = rows.map((r) => [r[0] * xf, r[1] * yf]);
  }
  const xy = data("XYDATA"), points = data("XYPOINTS");
  if (xy && /X\+\+\(Y\.\.Y\)/i.test(xy.value.split("\n")[0].replace(/\s/g, ""))) {
    if (first === undefined || last === undefined) damaged("FIRSTX or LASTX is missing");
    y = asdf(xy.value.split("\n").slice(1), declared ?? MAX_POINTS).map((v) => v * yf);
  } else if (xy || points) {
    const rows = tuples((xy ?? points)!.value.split("\n").slice(1), 2);
    if (rows.length > MAX_POINTS) tooMany(rows.length);
    xs = rows.map((r) => r[0] * xf);
    y = rows.map((r) => r[1] * yf);
  } else if (b.ldrs.some((l) => l.label === "NTUPLES")) {
    const page = ntuplePage(b, all);
    if (!page) return undefined;
    ({ first, last, y, xUnit, yUnit } = { ...page, xUnit: page.xUnit || xUnit, yUnit: page.yUnit || yUnit });
  } else if (peaks?.length) {
    // A peak table alone (a mass spectrum, a peak list): sticks.
    xs = peaks.map((p) => p[0]);
    y = peaks.map((p) => p[1]);
    sticks = true;
    peaks = undefined;
  } else return undefined;
  if (!y.length) damaged("the spectrum has no points");
  if (y.length > MAX_POINTS) tooMany(y.length);
  if (declared !== undefined && !xs && y.length !== declared) damaged(`it declares ${declared} points and holds ${y.length}`);
  
  if (!y.every(Number.isFinite)) damaged("a value is not a number");
  // NMR in Hz becomes ppm, by the observe frequency; a shift reference (a point and its shift) moves the axis.
  const hz = xUnit === "HZ";
  if (kind === "nmr" && hz) {
    if (!mhz || mhz <= 0) damaged("an NMR spectrum in Hz has no observe frequency");
    const f = (v: number) => v / mhz!;
    if (xs) xs = xs.map(f); else { first = f(first!); last = f(last!); }
    if (peaks) peaks = peaks.map(([px, py]) => [f(px), py]);
    xUnit = "PPM";
  }
  if (kind === "nmr" && !xs) {
    const n = y.length, step = n > 1 ? (last! - first!) / (n - 1) : 0;
    let move = 0;
    const ref = /^\(?\s*(?:INTERNAL|EXTERNAL)\s*,[^,]*,\s*(\d+)\s*,\s*([-+\d.eE]+)\s*\)?$/i.exec(get(".SHIFTREFERENCE") ?? "");
    const offset = number("$OFFSET");
    if (ref && Number(ref[1]) >= 1 && Number(ref[1]) <= n) move = Number(ref[2]) - (first! + (Number(ref[1]) - 1) * step);
    else if (hz && offset !== undefined && Math.abs(offset - first!) < 1) move = offset - first!;
    if (Number.isFinite(move) && move) { first! += move; last! += move; if (peaks) peaks = peaks.map(([px, py]) => [px + move, py]); }
  }
  const unit = (u: string) => ({ PPM: "ppm", HZ: "Hz", "1/CM": "cm⁻¹", NANOMETERS: "nm", MICROMETERS: "µm", "M/Z": "m/z", SECONDS: "s", TRANSMITTANCE: "%T", ABSORBANCE: "A", "RELATIVE ABUNDANCE": "%" }[u] ?? u.toLowerCase().slice(0, 20));
  const out: JcampSpectrum = {
    title, kind, xUnit: unit(xUnit), yUnit: unit(yUnit), first: xs ? xs[0] : first!, last: xs ? xs[xs.length - 1] : last!, y: Float64Array.from(y),
    ...(nucleus ? { nucleus } : {}), ...(mhz && mhz > 0 && mhz < 3000 ? { mhz } : {}), ...(solvent ? { solvent } : {}),
    ...(xs ? { xs: Float64Array.from(xs) } : {}), ...(sticks ? { sticks: true as const } : {}), ...(peaks?.length ? { peaks } : {}),
  };
  if (![out.first, out.last].every(Number.isFinite)) damaged("FIRSTX or LASTX is not a number");
  if (out.kind === "nmr" && !out.nucleus) out.nucleus = Math.abs(out.last - out.first) > 40 ? "13C" : "1H";
  return out;
}

// The real page of an NTUPLES table (a processed NMR spectrum: X++(R..R)), with its X range and units.
function ntuplePage(b: Block, all: Map<string, string>) {
  const list = (k: string) => (all.get(k) ?? "").split(",").map((s) => s.trim());
  const symbols = list("SYMBOL").map((s) => s.toUpperCase()), units = list("UNITS"), firsts = list("FIRST"), lasts = list("LAST"), factors = list("FACTOR"), dims = list("VARDIM");
  const at = (s: string) => symbols.indexOf(s), num = (v: string | undefined, d?: number) => (v === undefined || v === "" ? d : Number(v));
  const tables = b.ldrs.filter((l) => l.label === "DATATABLE");
  if (tables.length > 2 && new Set(tables.map((t) => t.value.split("\n")[0].replace(/\s/g, "").toUpperCase())).size < tables.length) fail("Octet opens 1D spectra only.");
  const real = tables.find((t) => /\(R\.\.R\)/i.test(t.value.split("\n")[0].replace(/\s/g, ""))) ?? tables.find((t) => /X\+\+\(Y\.\.Y\)/i.test(t.value.split("\n")[0].replace(/\s/g, "")));
  if (!real) return undefined;
  const ySym = /\(R\.\.R\)/i.test(real.value.split("\n")[0]) ? "R" : "Y", xi = at("X"), yi = at(ySym);
  if (xi < 0) damaged("NTUPLES has no X variable");
  // The page's own NPOINTS, FIRST and LAST win over the table's.
  const page = b.ldrs.slice(b.ldrs.indexOf(real) - 12 < 0 ? 0 : b.ldrs.indexOf(real) - 12, b.ldrs.indexOf(real));
  const pageNum = (k: string) => { const l = [...page].reverse().find((x) => x.label === k); return l ? Number(l.value.trim()) : undefined; };
  const n = pageNum("NPOINTS") ?? num(dims[yi >= 0 ? yi : xi]);
  if (n === undefined || !Number.isInteger(n) || n < 1) damaged("NTUPLES gives no number of points");
  if (n! > MAX_POINTS) tooMany(n!);
  const first = num(firsts[xi]), last = num(lasts[xi]), yf = num(factors[yi], 1)!;
  if (first === undefined || last === undefined || !Number.isFinite(first) || !Number.isFinite(last)) damaged("NTUPLES gives no X range");
  const y = asdf(real.value.split("\n").slice(1), n!).map((v) => v * (Number.isFinite(yf) ? yf : 1));
  if (y.length !== n) damaged(`a page declares ${n} points and holds ${y.length}`);
  if (/SECONDS|TIME/i.test(units[xi] ?? "")) fail("This file holds a raw FID. Process it into a spectrum, then open it.");
  return { first: first!, last: last!, y, xUnit: (units[xi] ?? "").toUpperCase(), yUnit: (units[yi] ?? "").toUpperCase() };
}

// Every spectrum in a JCAMP-DX file (a compound file's blocks too). Throws an Error with a message for the user.
export function readJcamp(text: string): JcampSpectrum[] {
  if (text.length > 64 * 1024 * 1024) fail("This file is larger than 64 MB. Octet cannot open it.");
  const out: JcampSpectrum[] = [];
  let points = 0;
  const walk = (b: Block, inherited: Map<string, string>) => {
    if (b.children.length) {
      // A link block: its own labels (a title, a data type) pass to the blocks inside it.
      const own = new Map(inherited);
      for (const l of b.ldrs) if (!["TITLE", "END", "BLOCKS", "BLOCKID"].includes(l.label)) own.set(l.label, l.value);
      for (const c of b.children) walk(c, own);
      return;
    }
    const s = spectrumOf(b, inherited);
    if (!s) return;
    points += s.y.length;
    if (points > MAX_ALL) fail("This file holds too many points. Octet cannot open it.");
    if (out.length < MAX_SPECTRA) out.push(s);
  };
  for (const b of blocks(text)) walk(b, new Map());
  if (!out.length) fail("This JCAMP-DX file holds no spectrum Octet can read.");
  return out;
}

// Whether a file's text is JCAMP-DX: it starts with ##TITLE= (after any comments).
export const isJcamp = (text: string) => /^﻿?(\s*\$\$[^\n]*\n)*\s*##\s*TITLE\s*=/i.test(text.slice(0, 4096));

// --- Bruker -----------------------------------------------------------------------------------------------------

// Bruker's processed spectrum: the procs parameters (SI points from OFFSET ppm, SW_p Hz wide at SF MHz, stored as
// 32-bit integers times 2^NC_proc or as doubles, little or big endian) and the 1r file. acqus names the nucleus and
// the solvent.
export function readBruker(procs: string, data: Uint8Array, acqus = "", name = "Bruker spectrum"): JcampSpectrum {
  const param = (text: string, k: string) => [...text.matchAll(/^##\$?([^=\n]+)=[ \t]*(.*)$/gm)].find((m) => norm(m[1]) === k)?.[2]?.trim();
  const num = (k: string) => { const v = Number(param(procs, k)); return Number.isFinite(v) ? v : damaged(`procs has no ${k}`); };
  const si = num("SI"), offset = num("OFFSET"), sw = num("SWP"), sf = num("SF"), nc = Number(param(procs, "NCPROC") ?? 0), big = param(procs, "BYTORDP") === "1", dtype = Number(param(procs, "DTYPP") ?? 0);
  if (!Number.isInteger(si) || si < 2) damaged("SI is not a whole number");
  if (si > MAX_POINTS) tooMany(si);
  const size = dtype === 2 ? 8 : 4;
  if (data.length !== si * size) damaged(`1r holds ${Math.floor(data.length / size)} points, not ${si}`);
  if (!(sf > 0) || !(sw > 0)) damaged("SF or SW_p is not above zero");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength), scale = 2 ** (Number.isFinite(nc) ? Math.max(-64, Math.min(64, nc)) : 0);
  const y = new Float64Array(si);
  for (let i = 0; i < si; i++) y[i] = dtype === 2 ? view.getFloat64(i * 8, !big) : view.getInt32(i * 4, !big) * scale;
  if (!y.every(Number.isFinite)) damaged("a value is not a number");
  const nucleus = nucleusOf(param(acqus, "NUC1") ?? param(procs, "AXNUC")) ?? "1H", solvent = solventName(param(acqus, "SOLVENT") ?? "");
  return { title: name.replace(/[\u0000-\u001f]/g, " ").slice(0, 200), kind: "nmr", nucleus, mhz: sf, ...(solvent ? { solvent } : {}), xUnit: "ppm", yUnit: "", first: offset, last: offset - ((si - 1) * sw) / sf / si, y };
}

// Bruker's processed data as the app hands it to the page (src-tauri/src/open.rs): this line, then JSON with the
// folder's name, procs, acqus and the 1r file's bytes in base64.
export const BRUKER = "OCTET-BRUKER 1\n";
export function readBrukerText(text: string): JcampSpectrum {
  let d: { name?: unknown; procs?: unknown; acqus?: unknown; data?: unknown };
  try { d = JSON.parse(text.slice(BRUKER.length)); } catch { return fail("Octet cannot read this Bruker folder."); }
  if (typeof d?.procs !== "string" || typeof d.data !== "string" || (d.acqus !== undefined && typeof d.acqus !== "string")) fail("Octet cannot read this Bruker folder.");
  let bytes: Uint8Array;
  try { const s = atob(d.data as string); bytes = Uint8Array.from(s, (c) => c.charCodeAt(0)); } catch { return fail("Octet cannot read this Bruker folder."); }
  return readBruker(d.procs as string, bytes, (d.acqus as string | undefined) ?? "", typeof d.name === "string" ? d.name : undefined);
}

// --- Galactic SPC -----------------------------------------------------------------------------------------------

// Galactic (now Thermo) SPC files of versions 4B (little endian) and 4C (big endian), as Galactic's format document
// gives them: a 512-byte header (flags, version, experiment, Y exponent, points, first and last X, subfiles, X and Y
// units, a comment), then the X values when the file gives them, then each subfile: a 32-byte header and its Y values.
// Y values are 32-bit floats (exponent 0x80), or whole numbers of 32 bits (16 with TSPREC) times 2^(exponent - 32, or
// - 16). Octet reads the first subfile. Every count is checked against the file's length before it is read.
const TSPREC = 0x01, TMULTI = 0x04, TXYXYS = 0x40, TXVALS = 0x80;
const SPC_KIND: Record<number, Kind> = { 4: "ir", 5: "ir", 6: "uv", 7: "uv", 9: "ms", 10: "nmr", 11: "ir" };
const SPC_X: Record<number, string> = { 1: "cm⁻¹", 2: "µm", 3: "nm", 4: "s", 6: "Hz", 9: "m/z", 10: "ppm", 13: "cm⁻¹" };
const X_KIND: Record<string, Kind> = { "cm⁻¹": "ir", "µm": "ir", nm: "uv", "m/z": "ms", ppm: "nmr" };
export function readSpc(b: Uint8Array, name = "SPC spectrum"): JcampSpectrum[] {
  const bad = (what: string): never => fail(`This SPC file is damaged: ${what}.`);
  if (b.length > 64 * 1024 * 1024) fail("This file is larger than 64 MB. Octet cannot open it.");
  if (b[1] === 0x4d) fail("This SPC file is in the old format (4D). Octet opens SPC files of versions 4B and 4C.");
  if (b.length < 2 || (b[1] !== 0x4b && b[1] !== 0x4c)) fail("This file is not an SPC spectrum.");
  if (b.length < 512) bad("its header is cut short");
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength), le = b[1] === 0x4b, flags = b[0], xy = !!(flags & TXYXYS), multi = !!(flags & TMULTI);
  const fexp = d.getInt8(3), npts = d.getUint32(4, le), first = d.getFloat64(8, le), last = d.getFloat64(16, le), xUnit = SPC_X[b[28]] ?? "", ytype = b[29];
  if (b[28] === 255 || ytype === 1) fail("This SPC file holds an interferogram. Process it into a spectrum, then open it.");
  if (multi && !d.getUint32(24, le)) bad("it has no subfiles");
  let at = 512;
  const count = (n: number) => { if (!n) bad("a subfile has no points"); if (n > MAX_POINTS) tooMany(n); return n; };
  const floats = (n: number) => {
    if (at + 4 * n > b.length) bad("its data are cut short");
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) out[i] = d.getFloat32(at + 4 * i, le);
    at += 4 * n;
    return out;
  };
  let xs = flags & TXVALS && !xy ? floats(count(npts)) : undefined;
  // The first subfile: its header, its own X values (in a file whose subfiles each have their own), its Y values.
  if (at + 32 > b.length) bad("its first subfile is cut short");
  const subexp = d.getInt8(at + 1), n = count(xy ? d.getUint32(at + 16, le) : npts);
  at += 32;
  if (xy) xs = floats(n);
  const exp = multi ? subexp : fexp, float = exp === -128 || fexp === -128, size = float || !(flags & TSPREC) ? 4 : 2, scale = 2 ** (exp - 8 * size);
  if (at + size * n > b.length) bad("its data are cut short");
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = float ? d.getFloat32(at + 4 * i, le) : size === 2 ? d.getInt16(at + 2 * i, le) * scale : d.getInt32(at + 4 * i, le) * scale;
  if (!y.every(Number.isFinite) || (xs && !xs.every(Number.isFinite)) || !Number.isFinite(first) || !Number.isFinite(last)) bad("a value is not a number");
  const kind = SPC_KIND[b[2]] ?? X_KIND[xUnit] ?? "other";
  if (kind === "nmr" && xUnit === "s") fail("This file holds a raw FID. Process it into a spectrum, then open it.");
  if (kind === "nmr" && xUnit !== "ppm") fail("This SPC file holds an NMR spectrum with no shift scale in ppm. Octet cannot open it.");
  let comment = "";
  for (let i = 88; i < 218 && b[i]; i++) comment += String.fromCharCode(b[i]);
  const top = y.reduce((m, v) => Math.max(m, v), -Infinity), x0 = xs ? xs[0] : first, x1 = xs ? xs[n - 1] : last;
  return [{
    title: (comment.replace(/[\u0000-\u001f]/g, " ").trim() || name.replace(/[\u0000-\u001f]/g, " ")).slice(0, 200), kind, xUnit,
    yUnit: ytype === 2 ? "A" : ytype === 128 ? (top <= 1.5 ? "T" : "%T") : ytype === 11 ? "%" : "", first: x0, last: x1, y,
    ...(xs ? { xs } : {}), ...(kind === "ms" && xy ? { sticks: true as const } : {}), ...(kind === "nmr" ? { nucleus: Math.abs(x1 - x0) > 40 ? "13C" : "1H" } : {}),
  }];
}
// An SPC file as the app hands it to the page (src-tauri/src/spectrum.rs): this line, then JSON with the file's name
// and its bytes in base64.
export const SPC = "OCTET-SPC 1\n";
export function readSpcText(text: string): JcampSpectrum[] {
  let d: { name?: unknown; data?: unknown };
  try { d = JSON.parse(text.slice(SPC.length)); } catch { return fail("Octet cannot read this SPC file."); }
  if (typeof d?.data !== "string") fail("Octet cannot read this SPC file.");
  let bytes: Uint8Array;
  try { const s = atob(d.data as string); bytes = Uint8Array.from(s, (c) => c.charCodeAt(0)); } catch { return fail("Octet cannot read this SPC file."); }
  return readSpc(bytes, typeof d.name === "string" ? d.name : undefined);
}

// Whether a file's text is a spectrum Octet opens: JCAMP-DX, Bruker's processed data, or an SPC file.
export const isSpectrum = (text: string) => text.startsWith(BRUKER) || text.startsWith(SPC) || isJcamp(text);
