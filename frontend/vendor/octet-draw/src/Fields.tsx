// Octet's number field, segmented control and switch. Settings and every dialog use them, so a number, a short choice
// and an on or off setting look and work the same everywhere (brand/CLAUDE.md: one component per job).
import { useEffect, useRef, useState } from "react";

// A number with its unit inside the field. It keeps what is being typed (such as "0." or "-") until it is a usable
// value, from min to max. Up and Down change it by step, or by ten steps with Shift. onClear: an empty field is no
// value (the placeholder shows). lazy: the value is used on Return or when the field is left, not at each key, and
// Escape puts it back as it was.
export function NumberField({ value, unit, label, onChange, min = 0.001, max = 1e6, step = 0.1, onClear, placeholder, disabled, lazy }: {
  value: number | undefined; unit?: string; label: string; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; onClear?: () => void; placeholder?: string; disabled?: boolean; lazy?: boolean;
}) {
  const shown = value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  const focused = useRef(false), cancel = useRef(false);
  useEffect(() => { if (!focused.current) setText(shown); }, [shown]);
  const ok = (n: number) => Number.isFinite(n) && n >= min && n <= max;
  return (
    <span className="unit-field" aria-disabled={disabled || undefined}>
      <input
        aria-label={label}
        inputMode={min < 0 ? "text" : "decimal"}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={(e) => { focused.current = true; e.target.select(); }}
        onBlur={() => { focused.current = false; const n = Number(text); if (lazy && !cancel.current && text.trim() && ok(n) && n !== value) onChange(n); else setText(shown); cancel.current = false; }}
        onChange={(e) => {
          const t = e.target.value.replace(min < 0 ? /[^\d.+-]/g : /[^\d.]/g, "");
          setText(t);
          const n = Number(t);
          if (!t.trim()) onClear?.();
          else if (!lazy && t && ok(n)) onChange(n);
        }}
        onKeyDown={(e) => {
          if (lazy && (e.key === "Enter" || e.key === "Escape")) { e.preventDefault(); cancel.current = e.key === "Escape"; e.currentTarget.blur(); return; }
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          // Rounded to the step's places (two at least), so a finer step keeps its places.
          const by = e.shiftKey ? step * 10 : step, k = 10 ** Math.max(2, (String(step).split(".")[1] ?? "").length);
          const n = Math.max(min, Math.min(max, Math.round(((value ?? (min > 0 ? min : 0)) + (e.key === "ArrowUp" ? by : -by)) * k) / k));
          setText(String(n));
          onChange(n);
        }}
      />
      {unit && <span className="unit">{unit}</span>}
    </span>
  );
}

// A short choice, as a row of buttons: one is on (or none, when the value is none of them; Tab then reaches the
// first). Left and Right move along it. An option marked off is dimmed and skipped.
export function Segmented<T extends string>({ label, value, options, onChange, className }: {
  label: string; value: T; options: [T, React.ReactNode, string?, boolean?][]; onChange: (v: T) => void; className?: string;
}) {
  return (
    <span className={className ? `segmented ${className}` : "segmented"} role="radiogroup" aria-label={label}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        // With none on, Right goes to the first option and Left to the last.
        const on = options.filter((o) => !o[3]), right = e.key === "ArrowRight", k = on.findIndex(([v]) => v === value), at = k < 0 ? (right ? -1 : 0) : k;
        const next = on[(at + (right ? 1 : on.length - 1)) % on.length]?.[0];
        if (next === undefined) return;
        onChange(next);
        (e.currentTarget.children[options.findIndex(([v]) => v === next)] as HTMLElement | undefined)?.focus();
      }}>
      {options.map(([v, shown, name, off], k) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} aria-label={name} data-tip={name} disabled={off}
          tabIndex={value === v || (k === 0 && !options.some(([o]) => o === value)) ? 0 : -1} onClick={() => onChange(v)}>{shown}</button>
      ))}
    </span>
  );
}

// An on or off setting. disabled: dimmed, and it shows the value it has.
export function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  // No tooltip: the switch's name is beside it.
  return <button type="button" className="switch" role="switch" aria-checked={on} aria-label={label} data-tip="" disabled={disabled} onClick={() => onChange(!on)}><span /></button>;
}
