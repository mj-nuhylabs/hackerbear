// The tutorial: a few steps done on a real drawing, as ChemDraw's own tutorials teach (Help > Tutorials: draw a
// bond, click its end, point at an atom and type O, add a ring to a bond), then Octet's hold to select and move,
// Clean up and Copy. A card at the top of the page says what to do. Each step is done when the user does it, and the
// next one comes. It shows once after the name box, and from Help > Tutorial, always on a Paper drawing (its steps
// are made for a manuscript's sizes). Skip is at the card's bottom right.
import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "@phosphor-icons/react";
import { rings } from "./rings";
import type { Mol } from "./render";
import type { Tool } from "./tools";
import { useLeaving } from "./motion";
import { keyOf, label } from "./keys";
import mark from "../brand/logos/octet-mark.svg";
import markWhite from "../brand/logos/octet-mark-white.svg";

// Counts of what the editor saw happen: a selection area finished, a selection moved, Clean up, Copy.
export type Seen = { select: number; move: number; clean: number; copy: number };
export const NOTHING_SEEN: Seen = { select: 0, move: 0, clean: 0, copy: 0 };

type Now = { doc: Mol; selected: number; seen: Seen };
const ringCount = (m: Mol) => rings({ atoms: m.atoms.map(() => ({ el: "C", charge: 0, h: 0 })), bonds: m.bonds.map((b) => ({ a: b.atoms[0], b: b.atoms[1], order: 1 as const })) }).length;
const oxygens = (m: Mol) => m.atoms.filter((a) => a.label === "O").length;

// key: the key the step asks for, as its chip shows it. The chip goes down when that key does.
type Step = { title: string; text: React.ReactNode; tool?: Tool; key?: string; done: (now: Now, from: Now) => boolean };
const steps = (keys: { clean: string; copy: string }): Step[] => [
  { title: "Draw", text: "Click on the page to draw a bond. Click its end to add another.", tool: "bond", done: (n, f) => n.doc.bonds.length >= f.doc.bonds.length + 2 },
  { title: "Rings", text: "Choose the ring tool. Click a bond to build a ring on it.", tool: "ring", done: (n, f) => ringCount(n.doc) > ringCount(f.doc) },
  { title: "Labels", text: <>Point at an atom and press <kbd>O</kbd>.</>, key: "O", done: (n, f) => oxygens(n.doc) > oxygens(f.doc) },
  { title: "Hold to select", text: "Press and hold on the page until Select takes over. Then drag a box round the structure.", done: (n, f) => n.seen.select > f.seen.select && n.selected > 0 },
  { title: "Hold to move", text: "Press and hold on the selected structure. Then drag it to a new place.", done: (n, f) => n.seen.move > f.seen.move },
  { title: "Tidy", text: <>Press <kbd>{keys.clean}</kbd> to clean up the structure.</>, key: keys.clean, done: (n, f) => n.seen.clean > f.seen.clean },
  { title: "Share", text: <>Press <kbd>{keys.copy}</kbd> to copy the drawing. Paste it into Word, PowerPoint or Keynote.</>, key: keys.copy, done: (n, f) => n.seen.copy > f.seen.copy },
];

// low: the card waits at the bottom of the window, as the Name to structure field is open at the top.
type Props = Now & { keys: { clean: string; copy: string }; low?: boolean; onTool: (tool?: Tool) => void; onSkip: () => void; onFinish: () => void };

export function Coach({ doc, selected, seen, keys, low, onTool, onSkip, onFinish }: Props) {
  const all = steps(keys), now = { doc, selected, seen };
  const [step, setStep] = useState(0), [from, setFrom] = useState<Now>(now), [done, setDone] = useState(false), [pressed, setPressed] = useState(false);
  const latest = useRef(now), leaving = useLeaving();
  latest.current = now;
  const end = step >= all.length, want = all[step]?.key;
  // The step's key chip goes down while its key is down. A key coming up lets it go: with Command held, the Mac sends
  // no key up for the letter, so it goes when Command does.
  useEffect(() => {
    if (!want) return;
    const down = (e: KeyboardEvent) => { const k = keyOf(e); if (k && label(k) === want) setPressed(true); };
    const up = () => setPressed(false);
    addEventListener("keydown", down, true);
    addEventListener("keyup", up, true);
    addEventListener("blur", up);
    return () => { removeEventListener("keydown", down, true); removeEventListener("keyup", up, true); removeEventListener("blur", up); setPressed(false); };
  }, [want]);
  useEffect(() => onTool(all[step]?.tool), [step]);
  useEffect(() => {
    if (!end && !done && all[step].done(now, from)) setDone(true);
  }, [doc, selected, seen]);
  // A done step shows its tick for a moment, then the next step starts from the drawing as it is then.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => { setStep(step + 1); setFrom(latest.current); setDone(false); }, 800);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <section className={["coach", low && "low", pressed && "pressed", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Tutorial" inert={leaving}>
      {end ? (
        <div className="coach-body" key="end">
          {/* The mark draws itself once (FEEL-42): the file as it is, uncovered round its ring from the top. */}
          <svg className="coach-mark" viewBox="0 0 1000 1000" width={32} height={32} aria-hidden>
            <image className="on-light" href={mark} width={1000} height={1000} />
            <image className="on-dark" href={markWhite} width={1000} height={1000} />
            <circle className="cover" cx={500} cy={500} r={450} pathLength={1} transform="rotate(-90 500 500)" />
          </svg>
          <h2>You’re ready.</h2>
          <div className="coach-foot">
            <span className="coach-dots" aria-hidden>{all.map((s) => <span key={s.title} className="past" />)}</span>
            <button className="dialog-button primary" onClick={onFinish} autoFocus>Start drawing</button>
          </div>
        </div>
      ) : (
        <div className="coach-body" key={step} aria-live="polite">
          <h2 className={done ? "done" : undefined}>
            {done && <CheckCircle size={18} aria-hidden />}
            {all[step].title}
          </h2>
          <p>{all[step].text}</p>
          <div className="coach-foot">
            <span className="coach-dots" aria-label={`Step ${step + 1} of ${all.length}`}>
              {all.map((s, k) => <span key={s.title} className={k < step || (k === step && done) ? "past" : k === step ? "now" : undefined} />)}
            </span>
            <button className="text-button" onClick={onSkip}>Skip</button>
          </div>
        </div>
      )}
    </section>
  );
}
