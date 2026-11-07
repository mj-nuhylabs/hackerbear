// Octet's colour picker: a square for how strong and how light the colour is, a strip for its hue, and its hex.
// Used wherever a colour is chosen freely (Settings, Colours). There is no system colour panel anywhere in Octet.
import { useEffect, useRef, useState } from "react";
import { holdCursor } from "./cursor";
import { useLeaving } from "./motion";

type HSV = [number, number, number]; // hue 0–360, saturation 0–1, value 0–1

export function hexToHsv(hex: string): HSV {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [(h + 360) % 360, max === 0 ? 0 : d / max, max];
}
export function hsvToHex([h, s, v]: HSV): string {
  const f = (k: number) => { const x = (k + h / 60) % 6; return v - v * s * Math.max(0, Math.min(x, 4 - x, 1)); };
  return "#" + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function ColourPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [text, setText] = useState(value.toUpperCase());
  // A colour set from outside (another row picked) resets the picker; its own changes do not move the hue.
  const own = useRef(value);
  useEffect(() => { if (value !== own.current) { own.current = value; setHsv(hexToHsv(value)); setText(value.toUpperCase()); } }, [value]);
  const set = (next: HSV) => { setHsv(next); const hex = hsvToHex(next); own.current = hex; setText(hex); onChange(hex); };
  // Dragging in the square or along the strip: the pointer is followed until it is let go.
  const track = (e: React.PointerEvent<HTMLDivElement>, at: (x: number, y: number) => void) => {
    const box = e.currentTarget.getBoundingClientRect();
    const go = (ev: { clientX: number; clientY: number }) => at(Math.min(1, Math.max(0, (ev.clientX - box.left) / box.width)), Math.min(1, Math.max(0, (ev.clientY - box.top) / box.height)));
    go(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    holdCursor(e.currentTarget);
    const move = (ev: PointerEvent) => go(ev), up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };
  const [h, s, v] = hsv;
  return (
    <div className="colour-picker">
      <div className="picker-square" style={{ backgroundColor: `hsl(${h} 100% 50%)` }} role="slider" aria-label="Strength and lightness" aria-valuetext={text} tabIndex={0}
        onPointerDown={(e) => track(e, (x, y) => set([h, x, 1 - y]))}
        onKeyDown={(e) => {
          const d = e.shiftKey ? 0.1 : 0.02, k = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key];
          if (k) { e.preventDefault(); set([h, Math.min(1, Math.max(0, s + k[0])), Math.min(1, Math.max(0, v + k[1]))]); }
        }}>
        <span className="picker-knob" style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, background: text }} />
      </div>
      <div className="picker-hue" role="slider" aria-label="Hue" aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(h)} tabIndex={0}
        onPointerDown={(e) => track(e, (x) => set([x * 360, s, v]))}
        onKeyDown={(e) => {
          const d = (e.shiftKey ? 10 : 2) * (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0);
          if (d) { e.preventDefault(); set([(h + d + 360) % 360, s, v]); }
        }}>
        <span className="picker-knob" style={{ left: `${(h / 360) * 100}%`, top: "50%", background: `hsl(${h} 100% 50%)` }} />
      </div>
      <input className="picker-hex" aria-label="Hex" spellCheck={false} value={text}
        onChange={(e) => {
          const t = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, "");
          setText(t);
          const hex = (t.startsWith("#") ? t : `#${t}`).slice(0, 7);
          if (/^#[0-9A-F]{6}$/.test(hex)) { own.current = hex; setHsv(hexToHsv(hex)); onChange(hex); }
        }}
        onBlur={() => setText(hsvToHex(hsv))} />
    </div>
  );
}

// The colour picker in a small window by the button that opens it (anchor: the button's box): under the button, or
// over it when there is no room below. A click outside it (but on keep, the button) or Escape closes it. Wrap it in
// Exit: it leaves with a motion, and takes no clicks or keys on its way out.
export function ColourPop({ anchor, keep, label, value, onChange, onClose }: { anchor: DOMRect; keep?: HTMLElement | null; label: string; value: string; onChange: (hex: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null), close = useRef(onClose), leaving = useLeaving();
  close.current = onClose;
  useEffect(() => {
    if (leaving) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !keep?.contains(e.target as Node)) close.current(); };
    // Escape closes this only, not the window it is in (Settings), whichever listener comes first (listOpen).
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close.current(); keep?.focus(); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", esc, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", esc, true); };
  }, [keep, leaving]);
  const above = anchor.bottom + 260 > innerHeight - 8 && anchor.top - 260 > 8;
  return (
    <div ref={box} className={["page-menu colour-pop", above && "above", leaving && "leaving"].filter(Boolean).join(" ")} role="dialog" aria-label={label} inert={leaving}
      style={{ left: Math.max(8, Math.min(anchor.right - 208, innerWidth - 216)), top: above ? anchor.top - 6 : anchor.bottom + 6 }}>
      <ColourPicker value={value} onChange={onChange} />
    </div>
  );
}
