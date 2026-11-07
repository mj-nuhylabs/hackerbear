// Motion in script, from the same tokens as the CSS (brand/tokens.css): animations made with element.animate(), and
// Exit, which lets an overlay leave with a motion instead of vanishing in one frame.
import { cloneElement, createContext, isValidElement, useContext, useEffect, useReducer, useRef } from "react";
import { inHost } from "./synthpath"; // SynthPath

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// A motion token (--motion-fast, --motion, --motion-slow) as Web Animations timing, with the brand's ease-out.
// The build writes 150ms as .15s, so a value in seconds becomes milliseconds here.
export function timing(token = "--motion") {
  // SynthPath: the tokens are scoped to .octet-host, so they are read there (synthpath.ts).
  const [value, ease] = inHost((h) => { const root = getComputedStyle(h); return [root.getPropertyValue(token).trim(), root.getPropertyValue("--ease-out").trim()]; });
  return { duration: parseFloat(value) * (/\ds$/.test(value) ? 1000 : 1) || 180, easing: ease || "ease-out" };
}
// Motion that CSS cannot do (atoms moving from one drawing to the next): step gets how far the motion has got, 0 to 1
// with the brand's ease-out, once a frame, and 1 last. The returned function stops it.
export function tween(step: (t: number) => void, token = "--motion") {
  const motion = new Animation(new KeyframeEffect(null, null, timing(token)));
  let frame = 0;
  const tick = () => {
    const t = motion.playState === "finished" ? 1 : motion.effect?.getComputedTiming().progress ?? 0;
    step(t);
    if (t < 1) frame = requestAnimationFrame(tick);
  };
  motion.play();
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); motion.cancel(); };
}

// True inside an overlay that is leaving. The overlay adds the class "leaving" to its root (editor.css plays the exit)
// and is inert, so it takes no clicks or keys on its way out.
const Leaving = createContext(false);
export const useLeaving = () => useContext(Leaving);

// Wrap an overlay that comes and goes: <Exit>{open && <Menu … />}</Exit>. When it closes, Exit keeps it on screen for
// the exit (motion-fast), then lets it go. A plain element (a div, an input) gets "leaving" and inert from Exit; a
// component reads useLeaving. Opened again while it leaves, a new one opens. Reduced motion: it goes at once.
export function Exit({ children }: { children: React.ReactNode }) {
  const shown = !!children, kept = useRef<React.ReactNode>(null), round = useRef(0), was = useRef(false);
  const [, gone] = useReducer((n: number) => n + 1, 0);
  if (shown && !was.current) round.current++;
  was.current = shown;
  if (shown) kept.current = children;
  else if (kept.current && reduced()) kept.current = null;
  useEffect(() => {
    if (shown || !kept.current) return;
    const t = setTimeout(() => { kept.current = null; gone(); }, timing("--motion-fast").duration);
    return () => clearTimeout(t);
  }, [shown]);
  let k = kept.current;
  if (!k) return null;
  if (!shown && isValidElement<{ className?: string; inert?: boolean }>(k) && typeof k.type === "string")
    k = cloneElement(k, { className: [k.props.className, "leaving"].filter(Boolean).join(" "), inert: true });
  return <Leaving.Provider key={round.current} value={!shown}>{k}</Leaving.Provider>;
}
