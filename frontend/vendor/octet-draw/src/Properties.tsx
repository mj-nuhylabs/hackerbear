// The Properties panel: ChemDraw's Analysis and Chemical Properties windows in one, for every structure in the
// selection (or the drawing; values for several structures are separated by semicolons, as ChemDraw does). A
// click on a value copies its row; the boxes choose the rows Add to drawing writes under each structure. Decimals
// sets the places of the exact mass, molecular weight and m/z (ChemDraw's Analysis window: 0 to 8, those three
// rows only); Copy report copies every value with the method and source it comes from (ChemDraw's Report…). The
// groups of predicted values have a Predicted heading, and every copy of their values says (predicted).
import { useLayoutEffect, useMemo, useState } from "react";
import { Check, CopySimple, X } from "@phosphor-icons/react";
import { useMovable } from "./movable";
import { Select } from "./Select";
import { propertyReport, rowLabel, type PropertyValues } from "./proprows";
import { useLeaving } from "./motion";

const SUB = "₀₁₂₃₄₅₆₇₈₉";
// Decimals: ChemDraw's 0 to 8, and Octet's standard places (4 for the exact mass, 2 for the rest).
const DECIMALS: [string, string][] = [["", "Standard"], ...Array.from({ length: 9 }, (_, n): [string, string] => [String(n), String(n)])];

type Props = {
  values: PropertyValues; chosen: string[]; onChoose: (key: string) => void; onCopy: (text: string) => void; onAdd: () => void; onClose: () => void; stacked?: boolean;
  decimals?: number; onDecimals: (places?: number) => void;
};

export function Properties({ values, chosen, onChoose, onCopy, onAdd, onClose, stacked, decimals, onDecimals }: Props) {
  const show = (key: string, v: string) => (key === "formula" ? v.replace(/\d/g, (d) => SUB[Number(d)]) : v);
  const groups = useMemo(() => values.filter((g) => g.length), [values]);
  // It opens where the Spectrum opens, along the bottom (above the Spectrum when that is open too), and moves by its
  // header.
  const move = useMovable("properties"), leaving = useLeaving();
  // Stacked: it sits on the Spectrum's top edge and shrinks to the room above it, so it never covers the Spectrum's
  // controls.
  const [below, setBelow] = useState(0);
  useLayoutEffect(() => {
    const el = stacked ? document.querySelector<HTMLElement>(".spectrum") : null;
    if (!el) return setBelow(0);
    const fit = () => setBelow(el.offsetHeight);
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [stacked]);
  return (
    <section className={["properties", stacked && "stacked", leaving && "leaving"].filter(Boolean).join(" ")} aria-label="Properties" inert={leaving} style={{ ...move.style, ...(stacked ? { "--below": `${below}px` } : {}) } as React.CSSProperties}>
      <header onPointerDown={move.onPointerDown}>
        <h2>Properties</h2>
        <button className="actions-close" onClick={onClose} aria-label="Close properties" data-tip="Close properties"><X size={12} /></button>
      </header>
      <div className="prop-list">
        {groups.map((g, k) => (
          <div key={k} className="prop-group">
            {g.every((r) => r.predicted) && <h3 className="prop-heading">Predicted</h3>}
            {g.map((row) => {
              const text = row.values.map((v) => (v === undefined ? "–" : v)).join("; "), on = chosen.includes(row.key);
              return (
                <div key={row.key} className={`prop-row${text.length > 18 ? " long" : ""}`}>
                  <button className="prop-check" role="checkbox" aria-checked={on} aria-label={`Add ${rowLabel(row)} to the drawing`} data-tip="Add to drawing" onClick={() => onChoose(row.key)}>
                    {on && <Check size={12} />}
                  </button>
                  <span className="prop-name">{row.name}</span>
                  <button className={row.key === "formula" ? "prop-value formula" : "prop-value"} data-tip="Copy" onClick={() => onCopy(`${rowLabel(row)}: ${text}`)}>{show(row.key, text)}</button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="prop-foot">
        <button className="prop-add" onClick={onAdd} disabled={!chosen.length}>Add to drawing</button>
        <button className="prop-add" onClick={() => onCopy(propertyReport(values))} disabled={!groups.length} data-tip="Copy every value with its method and source"><CopySimple size={16} aria-hidden /> Copy report</button>
        <span className="prop-decimals">
          <span className="prop-name">Decimals</span>
          <Select label="Decimals" value={decimals === undefined ? "" : String(decimals)} options={DECIMALS} onChange={(v) => onDecimals(v === "" ? undefined : Number(v))} />
        </span>
      </div>
    </section>
  );
}
