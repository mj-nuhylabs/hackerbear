// Drawing elements: the Shape tool's shapes, lines and arcs, and the Bracket tool's brackets and daggers. Each
// variant is a string, so it can be kept as the tool's choice and pinned to the toolbar like any other option.
import { orbitalPaths, type Head, type HeadShape, type LineStyle, type OrbitalShape, type Phase, type ShapeKind } from "./render";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width={20} height={20} viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

// The Shape tool's grid, as ChemDraw lays it out: each shape across its styles, then a line and two arcs per row.
const SHAPE_ROWS = ["circle", "oval", "rounded", "box"] as const;
const STYLES = ["plain", "dashed", "shaded", "solid", "shadow"] as const;
const LINES = ["plain", "dashed", "wavy", "bold"] as const;
const ARCS = [270, 180, 120, 90];
export const SHAPE_GRID: string[][] = SHAPE_ROWS.map((row, i) => [...STYLES.map((st) => `${row}-${st}`), `line-${LINES[i]}`, `arc-${ARCS[i]}`, `arc-${ARCS[i]}-dashed`]);
export const SHAPE_EXTRA = ["highlight", "pen", "pen-edit", "rgroup"];

// What a Shape tool variant draws: a shape (a circle is an oval drawn out from its middle), or a line or arc.
export type ElementSpec =
  | { shape: ShapeKind; circle?: boolean; dashed?: true; fill?: "shaded" | "solid" | "faded"; shadow?: true; bold?: true; rgroup?: true }
  | { line: "line" | "arc"; sweep?: number; style?: LineStyle }
  | { pen: true }
  | { edit: true }; // Edit curve: a picked pen curve's points and handles, and points added or taken out
export function shapeSpec(v: string): ElementSpec | undefined {
  if (v === "highlight") return { shape: "highlight" };
  if (v === "pen") return { pen: true };
  if (v === "pen-edit") return { edit: true };
  // An R-group definition (ChemDraw's Alternative Group tool): a box titled with its R number.
  if (v === "rgroup") return { shape: "box", rgroup: true };
  // Faded and bold are the Actions panel's styles for a picked shape (ChemDraw's Faded and Bold).
  let m = /^(circle|oval|rounded|box)(?:-(plain|dashed|shaded|solid|shadow|faded|bold))?$/.exec(v);
  if (m) {
    const st = m[2] ?? "plain";
    return {
      shape: m[1] === "circle" ? "oval" : (m[1] as ShapeKind), circle: m[1] === "circle",
      ...(st === "dashed" ? { dashed: true } : {}), ...(st === "shaded" || st === "solid" || st === "faded" ? { fill: st } : {}), ...(st === "shadow" ? { shadow: true } : {}), ...(st === "bold" ? { bold: true } : {}),
    } as ElementSpec;
  }
  m = /^line-(plain|dashed|wavy|bold)$/.exec(v);
  if (m) return { line: "line", ...(m[1] !== "plain" ? { style: m[1] as LineStyle } : {}) };
  m = /^arc-(90|120|180|270)(-dashed)?$/.exec(v);
  if (m) return { line: "arc", sweep: Number(m[1]), ...(m[2] ? { style: "dashed" as const } : {}) };
  return undefined;
}
const SHAPE_NAMES = { circle: "circle", oval: "oval", rounded: "rounded box", box: "box" } as const;
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
export function shapeName(v: string): string | undefined {
  if (v === "highlight") return "Highlight";
  if (v === "pen") return "Pen";
  if (v === "pen-edit") return "Edit curve";
  if (v === "rgroup") return "R-group definition";
  let m = /^(circle|oval|rounded|box)(?:-(plain|dashed|shaded|solid|shadow|faded|bold))?$/.exec(v);
  if (m) {
    const n = SHAPE_NAMES[m[1] as keyof typeof SHAPE_NAMES], st = m[2] ?? "plain";
    return st === "plain" ? cap(n) : `${cap(st === "solid" ? "filled" : st === "shadow" ? "shadowed" : st)} ${n}`;
  }
  m = /^line-(plain|dashed|wavy|bold)$/.exec(v);
  if (m) return m[1] === "plain" ? "Line" : `${cap(m[1])} line`;
  m = /^arc-(90|120|180|270)(-dashed)?$/.exec(v);
  if (m) return `${m[2] ? "Dashed arc" : "Arc"}, ${m[1]}°`;
  return undefined;
}

// Shape icons: the shape in its style. Shading is shown flat (a tint and a highlight), with no gradient.
export function ElementGlyph({ v }: { v: string }) {
  const spec = shapeSpec(v);
  if (!spec) return null;
  // An R-group definition: a box with its name's tab on its upper left.
  if ("shape" in spec && spec.rgroup) {
    return (
      <Icon>
        <rect x={36} y={84} width={184} height={136} />
        <polyline points="36,84 36,40 124,40 124,84" />
        <text x={80} y={73} textAnchor="middle" fontSize={44} fontWeight={600} fill="currentColor" stroke="none">R</text>
      </Icon>
    );
  }
  // The pen: a Bézier curve with its two anchors and one handle.
  if ("pen" in spec) {
    return (
      <Icon>
        <path d="M44,196 C84,52 172,212 212,60" />
        <line x1={44} y1={196} x2={84} y2={92} strokeWidth={8} />
        <rect x={30} y={182} width={28} height={28} fill="var(--surface-raised)" strokeWidth={10} />
        <rect x={198} y={46} width={28} height={28} fill="var(--surface-raised)" strokeWidth={10} />
        <circle cx={84} cy={92} r={12} fill="currentColor" stroke="none" />
      </Icon>
    );
  }
  // Edit curve: a curve through three anchors, the middle one with its handles out.
  if ("edit" in spec) {
    return (
      <Icon>
        <path d="M40,192 C64,112 96,96 128,128 C160,160 192,144 216,64" />
        <line x1={88} y1={96} x2={168} y2={160} strokeWidth={8} />
        {[[40, 192], [128, 128], [216, 64]].map(([x, y]) => <rect key={x} x={x - 14} y={y - 14} width={28} height={28} fill="var(--surface-raised)" strokeWidth={10} />)}
        <circle cx={88} cy={96} r={12} fill="currentColor" stroke="none" />
        <circle cx={168} cy={160} r={12} fill="currentColor" stroke="none" />
      </Icon>
    );
  }
  if ("line" in spec) {
    const dash = spec.style === "dashed" ? "24 22" : undefined;
    if (spec.line === "arc") {
      const half = ((spec.sweep ?? 180) * Math.PI) / 360, n = 24;
      const raw = Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI / 2 + half - (2 * half * i) / n; return [Math.cos(a), -Math.sin(a)]; });
      const xs = raw.map((q) => q[0]), ys = raw.map((q) => q[1]);
      const k = 168 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      const cx = 128 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, cy = 128 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k;
      return <Icon><polyline points={raw.map(([x, y]) => `${(cx + x * k).toFixed(1)},${(cy + y * k).toFixed(1)}`).join(" ")} strokeDasharray={dash} /></Icon>;
    }
    if (spec.style === "wavy") {
      const pts = Array.from({ length: 33 }, (_, i) => { const t = i / 32, x = 48 + 160 * t, y = 208 - 160 * t, w = 18 * Math.sin(t * 6 * Math.PI); return `${(x + w * 0.7071).toFixed(1)},${(y + w * 0.7071).toFixed(1)}`; });
      return <Icon><polyline points={pts.join(" ")} /></Icon>;
    }
    return <Icon><line x1={52} y1={204} x2={204} y2={52} strokeDasharray={dash} strokeWidth={spec.style === "bold" ? 34 : 16} /></Icon>;
  }
  const shape = (props: React.SVGProps<SVGElement>) => {
    const p = props as Record<string, unknown>;
    if (spec.circle) return <circle cx={128} cy={128} r={84} {...p} />;
    if (spec.shape === "oval") return <ellipse cx={128} cy={128} rx={100} ry={64} {...p} />;
    return <rect x={36} y={68} width={184} height={120} rx={spec.shape === "rounded" ? 34 : spec.shape === "highlight" ? 12 : 0} {...p} />;
  };
  if (spec.shape === "highlight") return <Icon>{shape({ fill: "currentColor", fillOpacity: 0.28, stroke: "none" })}</Icon>;
  if (spec.fill === "solid") return <Icon>{shape({ fill: "currentColor", stroke: "none" })}</Icon>;
  if (spec.fill === "faded") {
    const id = `fade-${v}`;
    return <Icon><defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>{shape({ fill: `url(#${id})` })}</Icon>;
  }
  if (spec.bold) return <Icon>{shape({ strokeWidth: 30 })}</Icon>;
  if (spec.fill === "shaded") {
    return (
      <Icon>
        {shape({ fill: "currentColor", fillOpacity: 0.45, stroke: "none" })}
        <ellipse cx={spec.circle ? 100 : 92} cy={spec.circle ? 98 : 104} rx={spec.circle ? 30 : 34} ry={spec.circle ? 24 : 16} fill="var(--surface-raised)" stroke="none" />
      </Icon>
    );
  }
  if (spec.shadow) return <Icon><g transform="translate(18 18)">{shape({ fill: "currentColor", fillOpacity: 0.3, stroke: "none" })}</g>{shape({ fill: "var(--surface-raised)" })}</Icon>;
  return <Icon>{shape({ strokeDasharray: spec.dashed ? "24 22" : undefined })}</Icon>;
}

// The Bracket tool: pairs and single brackets, and the daggers that mark a transition state (‡) or a radical (†).
export const BRACKETS: Record<string, string> = {
  brackets: "Brackets", parens: "Parentheses", braces: "Braces", ddagger: "Double dagger",
  "brackets-left": "Left bracket", "parens-left": "Left parenthesis", "braces-left": "Left brace", dagger: "Dagger",
};
export type BracketSpec = { shape: ShapeKind; side?: "left" } | { mark: string };
export function bracketSpec(v: string): BracketSpec | undefined {
  if (v === "ddagger") return { mark: "‡" };
  if (v === "dagger") return { mark: "†" };
  const m = /^(brackets|parens|braces)(-left)?$/.exec(v);
  return m ? { shape: m[1] as ShapeKind, ...(m[2] ? { side: "left" as const } : {}) } : undefined;
}
export function BracketGlyph({ v }: { v: string }) {
  const spec = bracketSpec(v);
  if (!spec) return null;
  if ("mark" in spec) return <Icon><text x={128} y={128} dy="0.36em" textAnchor="middle" fill="currentColor" stroke="none" style={{ font: "500 200px var(--font-sans)" }}>{spec.mark}</text></Icon>;
  const left = spec.shape === "brackets" ? <polyline points="92,40 56,40 56,216 92,216" /> : spec.shape === "parens" ? <path d="M92,36 Q36,128 92,220" />
    : <path d="M96,36 Q68,36 68,64 L68,108 Q68,128 44,128 Q68,128 68,148 L68,192 Q68,220 96,220" />;
  return <Icon>{left}{!spec.side && <g transform="matrix(-1 0 0 1 256 0)">{left}</g>}</Icon>;
}

// The Orbitals tool: each shape across its phases (phased only where an orbital has lobes of both signs).
export const ORBITAL_GRID: string[][] = [
  ["s-plain", "s-shaded", "s-filled"], ["oval-plain", "oval-shaded", "oval-filled"], ["lobe-plain", "lobe-shaded", "lobe-filled"],
  ["hybrid-plain", "hybrid-shaded", "hybrid-filled", "hybrid-phased"], ["p-plain", "p-shaded", "p-filled", "p-phased"],
  ["d-plain", "d-shaded", "d-filled", "d-phased"], ["dz2-plain", "dz2-shaded", "dz2-filled", "dz2-phased"],
];
const ORBITAL_NAMES: Record<OrbitalShape, string> = { s: "s orbital", oval: "s orbital, tilted", lobe: "lobe", hybrid: "hybrid orbital", p: "p orbital", d: "d orbital", dz2: "dz² orbital" };
export function orbitalSpec(v: string): { shape: OrbitalShape; phase: Phase } | undefined {
  const m = /^(s|oval|lobe|hybrid|p|d|dz2)-(plain|shaded|filled|phased)$/.exec(v);
  return m ? { shape: m[1] as OrbitalShape, phase: m[2] as Phase } : undefined;
}
export function orbitalName(v: string): string | undefined {
  const o = orbitalSpec(v);
  if (!o) return undefined;
  const base = ORBITAL_NAMES[o.shape];
  // Orbital letters stay lower case (p orbital); other names start with a capital.
  const first = /^[spd] /.test(base) || base.startsWith("dz") ? base : cap(base);
  return o.phase === "plain" ? first : `${cap(o.phase)} ${base}`;
}
// An orbital's icon: its lobes, flat (a tint and a highlight for shaded, filled and empty lobes for phased).
export function OrbitalGlyph({ v }: { v: string }) {
  const o = orbitalSpec(v);
  if (!o) return null;
  const up = o.shape === "s" || o.shape === "oval" ? 1 : o.shape === "lobe" ? 2 : 1;
  const lobes = orbitalPaths({ id: 0, kind: "orbital", from: [0, o.shape === "lobe" ? -0.5 : 0], to: o.shape === "oval" ? [up, 0] : [0, up], orbital: o }, 1);
  const pts = lobes.flatMap((l) => l.path), xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1, k = 184 / span;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const d = (path: [number, number][]) => "M" + path.map(([x, y]) => `${(128 + (x - cx) * k).toFixed(1)} ${(128 + (y - cy) * k).toFixed(1)}`).join("L") + "Z";
  return (
    <Icon>
      {lobes.map((l, i) => {
        const solid = o.phase === "filled" || (o.phase === "phased" && !l.second) || (o.phase === "shaded" && false);
        return <path key={i} d={d(l.path)} fill={solid ? "currentColor" : o.phase === "shaded" ? "currentColor" : "var(--surface-raised)"} fillOpacity={o.phase === "shaded" ? 0.4 : 1} fillRule="evenodd" strokeWidth={10} />;
      })}
    </Icon>
  );
}

// A line as the Curves controls show it: its style, and its heads at either end in their shape.
export function LineGlyph({ start = "none", end = "none", head = "solid", style }: { start?: Head; end?: Head; head?: HeadShape; style?: LineStyle | "plain" }) {
  const tip = (x: number, dir: 1 | -1, h: Head) => {
    if (h === "none") return null;
    const base = x - dir * 52, barbs = h === "full" ? [-1, 1] : [h === "left" ? -dir : dir], pts = barbs.map((b) => `${base},${128 + b * 34}`);
    if (head === "angled") return <polyline points={barbs.length === 2 ? `${pts[0]} ${x},128 ${pts[1]}` : `${pts[0]} ${x},128`} />;
    const outline = barbs.length === 2 ? `${pts[0]} ${x},128 ${pts[1]} ${base + dir * 10},128` : `${pts[0]} ${x},128 ${base},128`;
    return <polygon points={outline} fill={head === "hollow" ? "var(--surface-raised)" : "currentColor"} strokeWidth={head === "hollow" ? 12 : 6} />;
  };
  const x0 = start === "none" || head === "angled" ? 32 : 76, x1 = end === "none" || head === "angled" ? 224 : 180;
  const shaft = style === "doubled" ? <><line x1={x0} y1={116} x2={x1} y2={116} strokeWidth={10} /><line x1={x0} y1={140} x2={x1} y2={140} strokeWidth={10} /></>
    : style === "wavy" ? <polyline points={Array.from({ length: 25 }, (_, i) => `${(x0 + ((x1 - x0) * i) / 24).toFixed(1)},${(128 + 14 * Math.sin((i / 24) * 6 * Math.PI)).toFixed(1)}`).join(" ")} />
      : <line x1={x0} y1={128} x2={x1} y2={128} strokeDasharray={style === "dashed" ? "24 18" : undefined} strokeWidth={style === "bold" ? 30 : 16} strokeLinecap={style === "bold" ? "butt" : "round"} />;
  return <Icon>{shaft}{tip(224, 1, end)}{tip(32, -1, start)}</Icon>;
}

// A closed curve's fill: none, solid, shaded (lit from the top left) or faded (to nothing at the bottom right).
export function FillGlyph({ fill }: { fill: "none" | "solid" | "shaded" | "faded" }) {
  const blob = "M64,160 C40,96 112,40 168,64 C224,88 220,176 160,200 C112,220 80,200 64,160 Z";
  if (fill === "solid") return <Icon><path d={blob} fill="currentColor" /></Icon>;
  if (fill === "shaded") return <Icon><path d={blob} fill="currentColor" fillOpacity={0.45} /><ellipse cx={116} cy={100} rx={30} ry={18} fill="var(--surface-raised)" stroke="none" /></Icon>;
  if (fill === "faded") return <Icon><defs><linearGradient id="fade-glyph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="currentColor" /><stop offset="1" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs><path d={blob} fill="url(#fade-glyph)" /></Icon>;
  return <Icon><path d={blob} /></Icon>;
}
