// What's new in this version (releases.ts): once after an update, and from About Octet Draw. Earlier versions' notes
// are on GitHub. The highlights come first. A row of section names stays at the top of the notes: a click scrolls to
// that section, and the name of the section in view is marked as the notes scroll.
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { Dialog } from "./Dialog";
import type { Release } from "./releases";

export function WhatsNew({ release, onClose }: { release: Release; onClose: () => void }) {
  const sections = [...(release.summary ? [{ title: "Highlights", items: release.summary }] : []), ...release.sections];
  const notes = useRef<HTMLDivElement>(null), nav = useRef<HTMLDivElement>(null), heads = useRef<(HTMLElement | null)[]>([]);
  const [at, setAt] = useState(0);
  const jumping = useRef(0);
  const top = (i: number) => (heads.current[i]?.offsetTop ?? 0) - (nav.current?.offsetHeight ?? 0) - 4;
  const scrolled = () => {
    const n = notes.current;
    if (!n || jumping.current) return;
    let i = 0;
    sections.forEach((_, k) => { if (top(k) <= n.scrollTop + 1) i = k; });
    if (n.scrollTop + n.clientHeight >= n.scrollHeight - 2) i = sections.length - 1;
    setAt(i);
  };
  const go = (i: number) => {
    const n = notes.current;
    if (!n) return;
    setAt(i);
    // The marked name stays on the one clicked while the notes scroll to it.
    clearTimeout(jumping.current);
    jumping.current = window.setTimeout(() => { jumping.current = 0; }, 450);
    n.scrollTo({ top: Math.max(0, top(i)), behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <Dialog title={`What’s new in Octet Draw ${release.version}`} onClose={onClose} alt={{ label: "All versions", onClick: () => void invoke("open_link", { name: "releases" }).catch(() => undefined) }}>
      <div className="notes" ref={notes} onScroll={scrolled} tabIndex={0} role="region" aria-label="Release notes">
        <div className="notes-nav" ref={nav} role="navigation" aria-label="Sections">
          {sections.map((s, i) => (
            <button key={s.title} type="button" className="notes-tab" aria-current={i === at ? "true" : undefined} onClick={() => go(i)}>{s.title}</button>
          ))}
        </div>
        <p>{release.intro}</p>
        {sections.map((s, i) => (
          <section key={s.title} className={i === 0 && release.summary ? "notes-highlights" : undefined}>
            <h3 ref={(el) => { heads.current[i] = el; }}>{s.title}</h3>
            <ul>{s.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
        <p className="notes-thanks">{release.thanks}</p>
      </div>
    </Dialog>
  );
}
