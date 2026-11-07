// The notice at the bottom of the window. Its icon says what kind it is (notice.ts). It stays long enough to read,
// stays while the pointer is on it or the window is hidden, and fades out. An error is read out at once; other kinds
// wait their turn.
import { useEffect, useState } from "react";
import { CheckCircle, Info, Warning, X } from "@phosphor-icons/react";
import { noticeTime, type NoticeKind } from "./notice";
import { useLeaving } from "./motion";

export type Notice = { text: string; kind: NoticeKind; action?: { label: string; run: () => void }; n: number };

const ICONS: Record<NoticeKind, React.ReactNode> = {
  error: <Warning size={16} aria-hidden />,
  info: <Info size={16} aria-hidden />,
  done: <CheckCircle size={16} aria-hidden />,
};

export function NoticeBar({ notice, onGone }: { notice: Notice; onGone: () => void }) {
  // It fades out when its time is up, and when it is closed or cleared (motion.tsx, Exit).
  const [held, setHeld] = useState(false), [fading, setFading] = useState(false), closed = useLeaving(), leaving = fading || closed;
  // While the window is hidden (minimised, or on another desktop) the notice waits, so it is there when the user is back.
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const seen = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);
  useEffect(() => setFading(false), [notice.n]);
  useEffect(() => {
    if (held || hidden || leaving) return;
    const t = setTimeout(() => setFading(true), noticeTime(notice.text));
    return () => clearTimeout(t);
  }, [notice.n, held, hidden, leaving]); // eslint-disable-line react-hooks/exhaustive-deps
  // The fade-out is 150 ms; the notice goes when it ends (or after 200 ms, if the animation does not run).
  useEffect(() => {
    if (!fading) return;
    const t = setTimeout(onGone, 200);
    return () => clearTimeout(t);
  }, [fading]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={`notice ${notice.kind}${leaving ? " leaving" : ""}`} role={notice.kind === "error" ? "alert" : "status"} inert={closed}
      onPointerEnter={() => { setHeld(true); setFading(false); }} onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)} onBlur={() => setHeld(false)} onAnimationEnd={(e) => { if (fading && e.target === e.currentTarget) onGone(); }}>
      {ICONS[notice.kind]}
      <span className="notice-text text-ui">{notice.text}</span>
      {notice.action && <button className="text-button" onClick={() => { notice.action!.run(); onGone(); }}>{notice.action.label}</button>}
      <button className="notice-close" aria-label="Close" onClick={onGone}><X size={12} /></button>
    </div>
  );
}
