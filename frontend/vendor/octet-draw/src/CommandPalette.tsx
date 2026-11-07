// The command palette (⌘K): every command, tool, template and setting by name, with its shortcut. A chemical
// name, abbreviation (TREN, and the ones that begin as typed) or SMILES that is typed can be drawn straight away. It
// opens and closes at once, without animation: it is used too often for motion to help.
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useModal } from "./Dialog";

export type Command = { id: string; name: string; group: string; icon?: React.ReactNode; keys?: string; words?: string; run: () => void };

const RECENT = "octet.recent";
const recent = (): string[] => { try { const v = JSON.parse(localStorage.getItem(RECENT) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; } };
const remember = (id: string) => { try { localStorage.setItem(RECENT, JSON.stringify([id, ...recent().filter((x) => x !== id)].slice(0, 8))); } catch { /* storage is optional */ } };

// How well a command matches what is typed: the whole name, its start, a word's start, anywhere in it, its other
// words, then its letters in order, where letters that start words or follow each other count for more (so "cln"
// finds Clean up before Decalin, and "flh" Flip horizontal).
function score(query: string, c: Command): number {
  const q = query.trim().toLowerCase(), n = c.name.toLowerCase();
  if (!q) return 1;
  if (n === q) return 100;
  if (n.startsWith(q)) return 90 - n.length / 100;
  if (n.split(/[\s,()/-]+/).some((w) => w.startsWith(q))) return 70 - n.length / 100;
  if (n.includes(q)) return 50;
  if (c.words?.toLowerCase().split(/\s+/).some((w) => w.startsWith(q))) return 40;
  let i = 0, points = 0, first = -1, last = -2;
  for (let k = 0; k < n.length && i < q.length; k++) {
    if (n[k] !== q[i]) continue;
    points += k === 0 || /[\s,()/-]/.test(n[k - 1]) || k === last + 1 ? 3 : 1;
    if (first < 0) first = k;
    last = k;
    i++;
  }
  // Letters close together beat letters spread across the name.
  return i === q.length ? 10 + (10 * points) / (3 * q.length) - 0.2 * (last - first) : 0;
}

// named: commands that draw Octet's own names beginning as typed (TREN, Tris): while typing, the ones drawn before;
// once typing pauses (read), all of them. draw: a command that draws the name or SMILES typed, read once typing pauses
// (OPSIN takes a moment). Return reads what is typed at once.
export function CommandPalette({ commands, named, draw, onClose }: { commands: Command[]; named: (query: string, read: boolean) => Command[]; draw: (query: string) => Command | undefined; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null), backdrop = useRef<HTMLDivElement>(null);
  useModal(backdrop);
  // Reading a name is slow next to a keystroke, so each query is read once, and only when typing pauses.
  const drawn = useRef(new Map<string, Command | undefined>());
  const drawFor = (q: string) => { if (!drawn.current.has(q)) drawn.current.set(q, draw(q)); return drawn.current.get(q); };
  const [read, setRead] = useState<string>();
  useEffect(() => {
    const q = query.trim();
    if (!q || drawn.current.has(q)) return setRead(q);
    const t = setTimeout(() => setRead(q), 150);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  const listFor = (query: string, done: boolean) => {
    if (!query.trim()) {
      // Nothing typed: recent commands, then the actions for what is selected, then the rest.
      const seen = recent(), byId = new Map(commands.map((c) => [c.id, c]));
      const first = seen.flatMap((id) => (byId.has(id) ? [{ ...byId.get(id)!, group: "Recent" }] : []));
      return [...first, ...commands.filter((c) => !seen.includes(c.id))].slice(0, 60);
    }
    const found = commands.map((c) => ({ c, s: score(query, c) + (recent().includes(c.id) ? 3 : 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
    // Structures by name: Octet's own names, then the name as typed. They go first unless a command matches closely,
    // and come before commands that match only loosely.
    const own = named(query.trim(), done), structure = done ? drawFor(query.trim()) : undefined;
    const draws = [...own, ...(structure && !own.some((c) => c.id.toLowerCase() === structure.id.toLowerCase()) ? [structure] : [])];
    const strong = found.filter((c) => score(query, c) >= 40), loose = found.filter((c) => score(query, c) < 40);
    return (found[0] && score(query, found[0]) >= 70 ? [...strong, ...draws, ...loose] : [...draws, ...strong, ...loose]).slice(0, 60);
  };
  const results = useMemo(() => listFor(query, read === query.trim()), [query, read, commands]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [query]);
  useEffect(() => { list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);

  const go = (c: Command | undefined) => {
    if (!c) return;
    remember(c.id);
    onClose();
    c.run();
  };
  return (
    <div ref={backdrop} className="command-backdrop" onPointerDown={onClose}>
      <div className="command-palette" role="dialog" aria-label="Commands" onPointerDown={(e) => e.stopPropagation()}>
        <label className="command-search">
          <MagnifyingGlass size={16} aria-hidden />
          <input
            autoFocus
            placeholder="Search"
            aria-label="Search commands, tools and templates, or type a name to draw"
            role="combobox"
            aria-expanded
            aria-controls="command-list"
            aria-activedescendant={results.length ? `command-${active}` : undefined}
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const n = results.length || 1;
                setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + n) % n);
              }
              // Return before the name has been read reads it now.
              if (e.key === "Enter") {
                e.preventDefault();
                const now = read === query.trim() ? results : listFor(query, true);
                go(now[Math.min(active, now.length - 1)]);
              }
              // The search field keeps the focus (the list follows it), so Escape still closes the palette and no key
              // reaches the drawing behind it.
              if (e.key === "Tab") e.preventDefault();
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
            }}
          />
        </label>
        <div ref={list} id="command-list" className="command-list" role="listbox" aria-label="Results" tabIndex={-1}>
          {results.map((c, i) => (
            <div key={`${c.group}${c.id}`} id={`command-${i}`} data-i={i} role="option" aria-selected={i === active} className="command"
              onPointerMove={() => setActive(i)} onClick={() => go(c)}>
              <span className="command-icon" aria-hidden>{c.icon}</span>
              <span className="command-name">{c.name}</span>
              <span className="command-group">{c.group}</span>
              {c.keys && <kbd>{c.keys}</kbd>}
            </div>
          ))}
          {!results.length && <p className="command-none">Nothing called “{query.trim()}”.</p>}
        </div>
      </div>
    </div>
  );
}
