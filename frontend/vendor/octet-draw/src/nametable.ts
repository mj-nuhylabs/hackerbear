// The dictionary's tables, kept small (dictionary.ts). Octet keeps the table's own bytes (UTF-8) and tables of numbers:
// where each compound's line starts, and hash tables for names, CAS numbers and InChIKeys. It keeps no string for each
// name. A hit is checked against the name in its line, so two names with the same hash never give the wrong compound.
// The trigrams for suggestions are packed as varints. So 116,974 compounds take less time and memory than 1.1.0's
// 28,881 did as strings.
import { commonKey } from "./common.ts";

const decoder = new TextDecoder();
const TAB = 9, NL = 10, BAR = 124, BANG = 33;

// FNV-1a over UTF-16 code units, as JavaScript strings hold them.
export function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// An open-addressed hash table from a hash to a compound. Its line is what a hit is checked against.
class HashTable {
  mask: number;
  hash: Uint32Array;
  value: Int32Array; // the compound + 1; 0 is an empty slot
  constructor(most: number) {
    let n = 1024;
    while (n < most * 1.5) n *= 2;
    this.mask = n - 1;
    [this.hash, this.value] = [new Uint32Array(n), new Int32Array(n)];
  }
  // The slot holding an entry that `same` accepts, else the empty slot where it would go.
  find(h: number, same: (slot: number) => boolean): number {
    let k = h & this.mask;
    while (this.value[k] !== 0) {
      if (this.hash[k] === h && same(k)) return k;
      k = (k + 1) & this.mask;
    }
    return k;
  }
  set(k: number, h: number, value: number) {
    [this.hash[k], this.value[k]] = [h, value + 1];
  }
}

// A growing list of numbers.
class Ints {
  a = new Int32Array(1024);
  n = 0;
  push(...v: number[]) {
    if (this.n + v.length > this.a.length) { const b = new Int32Array(this.a.length * 2); b.set(this.a); this.a = b; }
    for (const x of v) this.a[this.n++] = x;
  }
}

const pause = () => new Promise((ok) => setTimeout(ok, 0));
// A pause once 8 ms have gone since the last one (looked at every 64 calls), so no step holds the page longer, however
// fast the code runs yet.
function slicer(on: boolean) {
  let since = -1, calls = 0;
  return () => {
    if (!on) return false;
    if (since < 0) since = performance.now(); // the first call after a pause starts the clock again
    if (++calls % 64 !== 0 || performance.now() - since < 8) return false;
    since = -1;
    return true;
  };
}

export class NameTable {
  bytes: Uint8Array;
  line: Int32Array; // each compound's first byte
  names: HashTable;
  first: HashTable; // names marked "!": read before OPSIN
  cas: HashTable;
  keys: HashTable;
  // Suggestions: the names in order (each lower case only once), their compounds, and each trigram's names.
  shownStart: Int32Array = new Int32Array(0);
  shownEnd: Int32Array = new Int32Array(0);
  shownCompound: Int32Array = new Int32Array(0);
  gramIds = new Map<number, number>();
  // Built after the lookups, so Name to Structure answers first; suggestions come when this resolves.
  suggested: Promise<void> = Promise.resolve();
  gramStart: Int32Array = new Int32Array(1);
  grams: Uint8Array = new Uint8Array(0);
  // Each name in lower case once read, by index: an array, as a Map's lookups were most of a suggestion's time.
  private lowerCache: (string | undefined)[] = [];

  private constructor(bytes: Uint8Array, lines: number, names: number, marked: number, cas: number) {
    this.bytes = bytes;
    this.line = new Int32Array(lines);
    this.names = new HashTable(names);
    this.first = new HashTable(marked);
    this.cas = new HashTable(cas);
    this.keys = new HashTable(lines);
  }

  text(start: number, end: number): string {
    return decoder.decode(this.bytes.subarray(start, end));
  }
  get size() {
    return this.shownStart.length;
  }

  // sliced: a pause every few thousand lines, so typing and drawing never wait.
  static async read(bytes: Uint8Array, sliced: boolean): Promise<NameTable> {
    // First each line's fields (SMILES, names, CAS numbers, InChIKey, names OPSIN reads: where each starts, then the
    // line's end), and how many names, marked names and CAS numbers, for the tables' sizes.
    let rows = 1;
    if (sliced) await pause();
    for (let i = bytes.indexOf(NL); i >= 0; i = bytes.indexOf(NL, i + 1)) rows++;
    if (sliced) await pause();
    const pos = new Int32Array(rows * 6), items = (a: number, e: number) => { let c = a < e ? 1 : 0; for (let i = a; i < e; i++) if (bytes[i] === BAR) c++; return c; };
    let names = 0, cas = 0, marked = 0;
    const slice = slicer(sliced);
    for (let at = 0, r = 0; r < rows; r++) {
      if (slice()) await pause();
      let eol = bytes.indexOf(NL, at);
      if (eol < 0) eol = bytes.length;
      const o = r * 6;
      pos[o] = at;
      for (let f = 1, i = at; f < 5; f++) { const t = i <= eol ? bytes.indexOf(TAB, i) : -1; i = t >= 0 && t < eol ? t + 1 : eol + 1; pos[o + f] = i; }
      pos[o + 5] = eol + 1;
      names += items(pos[o + 1], pos[o + 2] - 1);
      cas += items(pos[o + 2], pos[o + 3] - 1);
      for (let i = pos[o + 1], e = pos[o + 2] - 1; i < e; i++) if (bytes[i] === BANG) marked++;
      at = eol + 1;
    }
    const t = new NameTable(bytes, rows, names, marked, cas);
    const shown = new Ints();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      if (slice()) await pause();
      const o = r * 6, s1 = pos[o + 1] - 1;
      if (s1 <= pos[o] || s1 - pos[o] > 4000) continue;
      t.line[n] = pos[o];
      for (let a = pos[o + 1], e = pos[o + 2] - 1; a < e;) {
        let b = a;
        while (b < e && bytes[b] !== BAR) b++;
        if (b > a) {
          const mark = bytes[a] === BANG, from = mark ? a + 1 : a, h = t.keyHash(from, b);
          if (h !== undefined) {
            if (mark) t.first.set(t.findName(t.first, h, from, b, true), h, n);
            const k = t.findName(t.names, h, from, b, false);
            if (t.names.value[k] === 0) { t.names.set(k, h, n); shown.push(from, b, n); }
          }
        }
        a = b + 1;
      }
      for (let a = pos[o + 2], e = pos[o + 3] - 1; a < e;) {
        let b = a;
        while (b < e && bytes[b] !== BAR) b++;
        if (b > a) t.exact(t.cas, 2, a, b, n);
        a = b + 1;
      }
      if (pos[o + 4] - 1 > pos[o + 3]) t.exact(t.keys, 3, pos[o + 3], pos[o + 4] - 1, n);
      for (let a = pos[o + 4], e = pos[o + 5] - 1; a < e;) {
        let b = a;
        while (b < e && bytes[b] !== BAR) b++;
        if (b > a) shown.push(a, b, n);
        a = b + 1;
      }
      n++;
    }
    t.line = t.line.slice(0, n);
    t.suggested = t.suggestions(shown, sliced);
    return t;
  }
  // The slot for a name's key in a table: the one holding it, else the empty one where it goes. The key is made only
  // when a hash matches.
  private findName(table: HashTable, h: number, from: number, b: number, marked: boolean): number {
    let k = h & table.mask, key: string | undefined;
    while (table.value[k] !== 0) {
      if (table.hash[k] === h && this.hasName(table.value[k] - 1, (key ??= commonKey(this.text(from, b))), marked)) return k;
      k = (k + 1) & table.mask;
    }
    return k;
  }

  // Each item of a field, between bars.
  private each([a, b]: [number, number], f: (a: number, b: number) => void) {
    for (let i = a, from = a; i <= b; i++) if (i === b || this.bytes[i] === BAR) { if (i > from) f(from, i); from = i + 1; }
  }
  // An exact entry (a CAS number, field 2; an InChIKey, field 3), hashed from its bytes (both are ASCII, so the hash
  // is the string's): the first one kept.
  private exact(table: HashTable, f: number, a: number, b: number, n: number) {
    const bytes = this.bytes;
    let h = 0x811c9dc5;
    for (let i = a; i < b; i++) h = Math.imul(h ^ bytes[i], 0x01000193);
    h >>>= 0;
    const k = table.find(h, (k) => this.hasItem(table.value[k] - 1, f, this.text(a, b)));
    if (table.value[k] === 0) table.set(k, h, n);
  }
  // A field of compound n's line, as [start, end).
  private fieldOf(n: number, f: number): [number, number] {
    const bytes = this.bytes;
    let a = this.line[n], e = bytes.indexOf(NL, a);
    if (e < 0) e = bytes.length;
    for (let i = 0; i < f; i++) { const t = bytes.indexOf(TAB, a); if (t < 0 || t >= e) return [e, e]; a = t + 1; }
    const t = bytes.indexOf(TAB, a);
    return [a, t < 0 || t > e ? e : t];
  }
  // Whether compound n has the item s in field f.
  private hasItem(n: number, f: number, s: string): boolean {
    let found = false;
    this.each(this.fieldOf(n, f), (a, b) => { found ||= this.text(a, b) === s; });
    return found;
  }
  // Whether compound n has a name with this key (marked: one marked "!", to read before OPSIN).
  private hasName(n: number, key: string, marked: boolean): boolean {
    let found = false;
    this.each(this.fieldOf(n, 1), (a, b) => {
      if (found || (marked && this.bytes[a] !== BANG)) return;
      found = commonKey(this.text(this.bytes[a] === BANG ? a + 1 : a, b)) === key;
    });
    return found;
  }
  // The hash of a name's key (common.ts commonKey), straight from the bytes for a name in ASCII. Undefined for an
  // empty key.
  private keyHash(a: number, b: number): number | undefined {
    const bytes = this.bytes;
    let h = 0x811c9dc5, units = 0;
    for (let i = a; i < b; i++) {
      let c = bytes[i];
      if (c >= 0x80) { const key = commonKey(this.text(a, b)); return key ? hashOf(key) : undefined; }
      if (c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0x2d || c === 0x27) continue;
      if (c >= 0x41 && c <= 0x5a) c += 32;
      else if (c === 0x2e) c = 0xb7;
      h = Math.imul(h ^ c, 0x01000193);
      units++;
    }
    return units ? h >>> 0 : undefined;
  }
  // The compound with a name of this key (commonKey); marked: only names marked "!". -1 if none.
  nameCompound(key: string, marked = false): number {
    if (!key) return -1;
    const table = marked ? this.first : this.names, k = table.find(hashOf(key), (k) => this.hasName(table.value[k] - 1, key, marked));
    return table.value[k] - 1;
  }
  casCompound(s: string): number {
    const k = this.cas.find(hashOf(s), (k) => this.hasItem(this.cas.value[k] - 1, 2, s));
    return this.cas.value[k] - 1;
  }
  keyCompound(s: string): number {
    const k = this.keys.find(hashOf(s), (k) => this.hasItem(this.keys.value[k] - 1, 3, s));
    return this.keys.value[k] - 1;
  }
  smiles(n: number): string | undefined {
    return n < 0 ? undefined : this.text(...this.fieldOf(n, 0));
  }

  // ——— Suggestions ———
  // Built in a worker thread when there is one (nametable.worker.ts), so the page does no more work than the lookups
  // need; else here.
  private async suggestions(list: Ints, sliced: boolean) {
    const names = list.a.slice(0, list.n);
    if (sliced && typeof Worker !== "undefined" && typeof document !== "undefined") {
      try {
        const index = await new Promise<SuggestionIndex>((ok, fail) => {
          const w = new Worker(new URL("./nametable.worker.ts", import.meta.url), { type: "module" }), bytes = this.bytes.slice();
          w.onmessage = (e: MessageEvent<SuggestionIndex>) => { w.terminate(); ok(e.data); };
          w.onerror = (e) => { w.terminate(); fail(e); };
          w.postMessage({ bytes, names }, [bytes.buffer]);
        });
        return this.install(index);
      } catch { /* built here instead */ }
    }
    if (sliced) await pause();
    this.install(suggestionIndex(this.bytes, names));
  }
  private install(x: SuggestionIndex) {
    [this.shownStart, this.shownEnd, this.shownCompound, this.gramStart, this.grams] = [x.start, x.end, x.compound, x.gramStart, x.grams];
    [this.lowerCache, this.lengthCache] = [[], undefined];
    const ids = new Map<number, number>();
    x.keys.forEach((k, i) => ids.set(k, x.ids[i]));
    this.gramIds = ids;
  }
  private gramId(t: string, j: number): number {
    return this.gramIds.get((t.charCodeAt(j) * 65536 + t.charCodeAt(j + 1)) * 65536 + t.charCodeAt(j + 2)) ?? -1;
  }

  // The names with a trigram (three characters of a name in lower case, with a space before and after it), in order;
  // a name that has the trigram twice comes twice.
  *withGram(gram: string): Generator<number> {
    const id = gram.length === 3 ? this.gramId(gram, 0) : -1;
    if (id < 0) return;
    let i = -1;
    for (let p = this.gramStart[id], e = this.gramStart[id + 1]; p < e;) {
      let d = 0, shift = 0, b;
      do { b = this.grams[p++]; d |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      i += d;
      yield i;
    }
  }
  // How long a trigram's list is (its bytes), to read the shorter of two.
  gramSize(gram: string): number {
    const id = gram.length === 3 ? this.gramId(gram, 0) : -1;
    return id < 0 ? 0 : this.gramStart[id + 1] - this.gramStart[id];
  }
  // The same names to visit, in a plain loop: a generator costs more than the decoding in the hot loops (nearNames).
  forGram(gram: string, visit: (i: number) => void) {
    const id = gram.length === 3 ? this.gramId(gram, 0) : -1;
    if (id < 0) return;
    const grams = this.grams;
    let i = -1;
    for (let p = this.gramStart[id], e = this.gramStart[id + 1]; p < e;) {
      let d = 0, shift = 0, b;
      do { b = grams[p++]; d |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
      i += d;
      visit(i);
    }
  }
  // Each name's length in characters (its UTF-8 bytes less the continuation bytes), counted once, so nearNames passes
  // over names too long or short to be a slip without reading them.
  private lengthCache?: Uint16Array;
  lengths(): Uint16Array {
    if (this.lengthCache) return this.lengthCache;
    const out = new Uint16Array(this.size), b = this.bytes;
    for (let i = 0; i < out.length; i++) {
      let n = 0;
      for (let p = this.shownStart[i], e = this.shownEnd[i]; p < e; p++) if ((b[p] & 0xc0) !== 0x80) n++;
      out[i] = Math.min(n, 65535);
    }
    return (this.lengthCache = out);
  }
  lower(i: number): string {
    let l = this.lowerCache[i];
    if (l === undefined) this.lowerCache[i] = l = this.written(i).toLowerCase();
    return l;
  }
  written(i: number): string {
    return this.text(this.shownStart[i], this.shownEnd[i]);
  }
  compound(i: number): number {
    return this.shownCompound[i];
  }
}


// The index for suggestions: each name once in lower case, in the order the table gives them, and the names with each
// of its trigrams (a space each side). Names in ASCII are lower-cased and cut into trigrams straight from the bytes;
// others go through strings. names: each name as its start, end and compound, three numbers a name.
export type SuggestionIndex = { start: Int32Array; end: Int32Array; compound: Int32Array; gramStart: Int32Array; grams: Uint8Array; keys: Float64Array; ids: Int32Array };
export function suggestionIndex(bytes: Uint8Array, names: Int32Array): SuggestionIndex {
  let longest = 0;
  for (let j = 0; j < names.length; j += 3) longest = Math.max(longest, names[j + 1] - names[j]);
  const u = new Uint16Array(longest + 2), v = new Uint16Array(longest + 2);
  // Each trigram's number: three ASCII characters through a small open-addressed table (it stays in the processor's
  // cache), anything else through a map.
  const SLOTS = 1 << 17, codes = new Int32Array(SLOTS), nums = new Int32Array(SLOTS), other = new Map<number, number>();
  let ids = 0;
  const id = (j: number) => {
    const p = u[j], q = u[j + 1], r = u[j + 2];
    if (p < 128 && q < 128 && r < 128) {
      const x = ((p << 14) | (q << 7) | r) + 1;
      let k = Math.imul(x, 0x9e3779b1) >>> 15;
      while (codes[k] !== 0 && codes[k] !== x) k = (k + 1) & (SLOTS - 1);
      if (codes[k] === 0) { codes[k] = x; nums[k] = ids++; }
      return nums[k];
    }
    const key = (p * 65536 + q) * 65536 + r;
    let n = other.get(key);
    if (n === undefined) other.set(key, (n = ids++));
    return n;
  };
  // One pass over the names: each lower-case name once (seen: its place in the list, to check a hash against), its
  // trigram numbers (kept for the second pass), and the bytes each trigram's list takes: a varint for each gap between
  // names, 0 for a trigram a name has twice. Then the lists.
  const seen = new HashTable(names.length / 3), start = new Ints(), end = new Ints(), compound = new Ints(), ends = new Ints();
  let seq = new Int32Array(1 << 20), m = 0, last = new Int32Array(4096), size = new Int32Array(4096);
  for (let j = 0; j < names.length; j += 3) {
    const a = names[j], b = names[j + 1], len = units(bytes, a, b, u);
    let h = 0x811c9dc5;
    for (let x = 1; x < len - 1; x++) h = Math.imul(h ^ u[x], 0x01000193);
    h >>>= 0;
    const k = seen.find(h, (k) => {
      const m = seen.value[k] - 1, other = units(bytes, start.a[m], end.a[m], v);
      if (other !== len) return false;
      for (let x = 1; x < len - 1; x++) if (u[x] !== v[x]) return false;
      return true;
    });
    if (seen.value[k] !== 0) continue;
    const i = start.n;
    seen.set(k, h, i);
    start.push(a);
    end.push(b);
    compound.push(names[j + 2]);
    if (m + len > seq.length) { const q = new Int32Array(seq.length * 2); q.set(seq); seq = q; }
    for (let x = 0; x + 3 <= len; x++) {
      const g = id(x);
      if (g >= last.length) { const l = new Int32Array(last.length * 2), z = new Int32Array(last.length * 2); l.set(last); z.set(size); [last, size] = [l, z]; }
      const d = i - (last[g] - 1);
      size[g] += d < 0x80 ? 1 : d < 0x4000 ? 2 : d < 0x200000 ? 3 : 4;
      last[g] = i + 1;
      seq[m++] = g;
    }
    ends.push(m);
  }
  const count = start.n;
  const gramStart = new Int32Array(ids + 1);
  for (let g = 0; g < ids; g++) gramStart[g + 1] = gramStart[g] + size[g];
  const grams = new Uint8Array(gramStart[ids]), at = gramStart.slice(0, ids);
  last.fill(0);
  for (let i = 0, j = 0; i < count; i++) {
    for (; j < ends.a[i]; j++) {
      const g = seq[j];
      let d = i - (last[g] - 1);
      last[g] = i + 1;
      while (d >= 0x80) { grams[at[g]++] = (d & 0x7f) | 0x80; d >>>= 7; }
      grams[at[g]++] = d;
    }
  }
  // Each trigram as a number (its three code units) and its number in the lists, for the page's map.
  const keys = new Float64Array(ids), idOf = new Int32Array(ids);
  let w = 0;
  for (const [k, n] of other) { keys[w] = k; idOf[w++] = n; }
  for (let k = 0; k < SLOTS; k++) if (codes[k]) { const x = codes[k] - 1; keys[w] = ((x >> 14) * 65536 + ((x >> 7) & 127)) * 65536 + (x & 127); idOf[w++] = nums[k]; }
  return { start: start.a.slice(0, count), end: end.a.slice(0, count), compound: compound.a.slice(0, count), gramStart, grams, keys, ids: idOf };
}

// A name in lower case as UTF-16 code units, with a space before and after it, into `out`; its length.
function units(bytes: Uint8Array, a: number, b: number, out: Uint16Array): number {
  let n = 0;
  out[n++] = 32;
  for (let i = a; i < b; i++) {
    const c = bytes[i];
    if (c >= 0x80) {
      const low = decoder.decode(bytes.subarray(a, b)).toLowerCase();
      for (n = 1; n - 1 < low.length; n++) out[n] = low.charCodeAt(n - 1);
      out[n++] = 32;
      return n;
    }
    out[n++] = c >= 0x41 && c <= 0x5a ? c + 32 : c;
  }
  out[n++] = 32;
  return n;
}
