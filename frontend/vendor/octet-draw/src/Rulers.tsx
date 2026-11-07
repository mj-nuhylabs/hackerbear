// The rulers along the top and left of the canvas (View > Show Rulers, ⌘;), as ChemDraw's: zero at the page's
// top-left corner, in the user's unit, with a mark where the pointer is and a band across the selection. They are
// window chrome over the canvas, so they are never exported or printed.
import { useMemo } from "react";
import { rulerTicks } from "./grid";
import type { RulerUnit } from "./settings";

type P = [number, number];
// mm in each unit.
const MM: Record<RulerUnit, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6 };
export const RULER = 24; // px

// view: the canvas's pan and zoom; scale: screen px per bond length at 100%; mm: bond lengths per mm; origin: the
// page's top-left corner (drawing coordinates); pointer: drawing coordinates; extent: the selection (px at 100%).
export function Rulers({ view, scale, mm, origin, unit, pointer, extent, onUnit }: {
  view: { x: number; y: number; zoom: number }; scale: number; mm: number; origin: P; unit: RulerUnit; pointer?: P;
  extent?: [number, number, number, number]; onUnit: () => void;
}) {
  const per = MM[unit] * mm * scale * view.zoom; // screen px per unit
  // Screen positions of drawing coordinates, and of a distance in units from the corner.
  const sx = (x: number) => view.x + x * scale * view.zoom, sy = (y: number) => view.y - y * scale * view.zoom;
  // The scales change only as the view does: the pointer moving draws its mark alone.
  const [x0, y0] = [sx(origin[0]), sy(origin[1])];
  const scales = useMemo(() => {
    const across = rulerTicks((RULER - x0) / per, (innerWidth - x0) / per, per, unit === "in"), down = rulerTicks((RULER - y0) / per, (innerHeight - y0) / per, per, unit === "in");
    const len = [5, 8, RULER], ux = (u: number) => Math.round(x0 + u * per), uy = (u: number) => Math.round(y0 + u * per);
    return [
      <g key="across">
        <path className="ruler-ticks" d={across.map((t) => `M${ux(t.at) + 0.5} ${RULER}v${-len[t.size]}`).join("")} />
        {across.filter((t) => t.label).map((t) => <text key={t.at} x={ux(t.at) + 3} y={11}>{t.label}</text>)}
      </g>,
      <g key="down">
        <path className="ruler-ticks" d={down.map((t) => `M${RULER} ${uy(t.at) + 0.5}h${-len[t.size]}`).join("")} />
        {down.filter((t) => t.label).map((t) => <text key={t.at} transform={`translate(11 ${uy(t.at) + 3}) rotate(-90)`} textAnchor="end">{t.label}</text>)}
      </g>,
    ];
  }, [x0, y0, per, unit, innerWidth, innerHeight]); // a larger window shows more of each ruler
  const marks = (horizontal: boolean) => {
    const at = pointer && (horizontal ? sx(pointer[0]) : sy(pointer[1])), lo = extent && (horizontal ? view.x + extent[0] * view.zoom : view.y + extent[1] * view.zoom);
    const hi = extent && (horizontal ? view.x + extent[2] * view.zoom : view.y + extent[3] * view.zoom);
    const line = (v: number) => (horizontal ? `M${v} 0V${RULER}` : `M0 ${v}H${RULER}`);
    return (
      <>
        {lo !== undefined && hi !== undefined && <rect className="ruler-band" {...(horizontal ? { x: lo, y: 0, width: Math.max(1, hi - lo), height: RULER } : { x: 0, y: lo, width: RULER, height: Math.max(1, hi - lo) })} />}
        {lo !== undefined && hi !== undefined && <path className="ruler-edge" d={line(Math.round(lo) + 0.5) + line(Math.round(hi) + 0.5)} />}
        {at !== undefined && <path className="ruler-pointer" d={line(Math.round(at) + 0.5)} />}
      </>
    );
  };
  return (
    <div className="rulers">
      <svg className="ruler across" aria-hidden>
        {scales[0]}
        {marks(true)}
      </svg>
      <svg className="ruler down" aria-hidden>
        {scales[1]}
        {marks(false)}
      </svg>
      {/* The unit, in the corner where the rulers meet: a click changes it. */}
      <button className="ruler-corner" aria-label={`Ruler unit: ${unit}. Change the unit.`} data-tip="Ruler unit" onClick={onUnit}>{unit}</button>
    </div>
  );
}
