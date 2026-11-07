// The canvas for screen readers and the keyboard: an element over each object on the canvas (access.ts names them), and
// one over the keyboard hotspot's atom or bond, each laid out where it is drawn. Screen readers read them; VoiceOver's
// cursor, the system's zoom and the focus ring follow them. Like Figma's mirror of its canvas, they sit in the page in
// reading order, take the focus as Tab moves through the drawing, and take no pointer events: the SVG under them draws.
// The view moves the layer they are in, so a pan or zoom draws none of them again.
import { memo, useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type MutableRefObject } from "react";
import type { Box } from "./render";
import type { Item } from "./access";
import type { Store } from "./store";
import { textEntry } from "./keys";

// The hotspot's element: what it says, and its box (drawing units, y up), turned (degrees anticlockwise) along a bond.
export type HotItem = { key: string; role: string; name: string; box: Box; turn?: number };
type Props<T> = {
  items: Item[];
  hover: Store<T>; // what the pointer or the keyboard hotspot is on
  hotOf: (h: T) => HotItem | undefined; // the hotspot's element, when the keyboard put the hotspot there
  views: Store<{ x: number; y: number; zoom: number }>;
  scale: number; // px per bond length at 100%
  paper: string; // the page's paper (white, dark, blueprint)
  ring?: string; // the focus ring's colour on a page of the user's own colour (access.ts ringOn)
  current?: string; // the object Tab last went to: the one Tab comes back to from outside the canvas
  inside: MutableRefObject<boolean>; // the keyboard's focus is on the canvas
  want: MutableRefObject<string | undefined>; // an element to focus once it is drawn
  rescue: () => string | undefined; // where the focus goes when its element is gone (an object deleted, the hotspot off)
  onFocusItem: (key: string) => void;
  layer: MutableRefObject<HTMLDivElement | null>;
};

const place = (b: Box, k: number, turn = 0): CSSProperties =>
  ({ "--x": b[0] * k, "--y": -b[3] * k, "--w": (b[2] - b[0]) * k, "--h": (b[3] - b[1]) * k, ...(turn ? { "--turn": `${-turn}deg` } : {}) }) as CSSProperties;

export function CanvasAccess<T>({ items, hover, hotOf, views, scale, paper, ring, current, inside, want, rescue, onFocusItem, layer }: Props<T>) {
  const moving = useRef<HTMLDivElement>(null);
  // The objects draw again only when they change: the focus handler reaches them through a ref, not a new prop.
  const onFocus = useRef(onFocusItem);
  onFocus.current = onFocusItem;
  const focusItem = useRef((key: string) => onFocus.current(key)).current;
  // The view moves the layer: its pan in the transform, its zoom in --zoom.
  useLayoutEffect(() => {
    const show = () => {
      const v = views.get(), el = moving.current;
      if (!el) return;
      el.style.transform = `translate(${v.x}px, ${v.y}px)`;
      el.style.setProperty("--zoom", String(v.zoom));
    };
    show();
    return views.subscribe(show);
  }, [views]);
  // The focus is on the canvas from when one of these takes it until a click, or until the keyboard takes it to a
  // control outside the canvas. A label or caption box opened from the canvas keeps it there.
  useEffect(() => {
    const focus = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (layer.current?.contains(t)) inside.current = true;
      else if (t !== document.body && !textEntry(t)) inside.current = false;
    };
    const press = () => { inside.current = false; };
    addEventListener("focusin", focus, true);
    addEventListener("pointerdown", press, true);
    return () => { removeEventListener("focusin", focus, true); removeEventListener("pointerdown", press, true); };
  }, [inside, layer]);
  // After each draw: an element waiting for the focus takes it; and when the element with the focus went, the focus goes
  // to what rescue gives (the hotspot's structure, the next object), never to nothing.
  useLayoutEffect(() => {
    const box = layer.current;
    if (!box) return;
    const by = (key?: string) => (key ? box.querySelector<HTMLElement>(`[data-object="${CSS.escape(key)}"]`) : null);
    if (want.current && by(want.current)) {
      by(want.current)!.focus({ preventScroll: true });
      want.current = undefined;
      return;
    }
    const lost = !document.activeElement || document.activeElement === document.body;
    if (inside.current && lost && !document.querySelector('[aria-modal="true"]')) (by(rescue()) ?? box).focus({ preventScroll: true });
  });
  const roving = current && items.some((x) => x.key === current) ? current : items[0]?.key;
  return (
    <div
      ref={layer}
      className={`canvas-access paper-${paper}${ring ? " own-ring" : ""}`}
      style={ring ? ({ "--focus-ring": ring } as CSSProperties) : undefined}
      role="application"
      aria-label="Drawing canvas"
      aria-description={items.length ? undefined : "Empty"}
      tabIndex={items.length ? -1 : 0}
    >
      <div ref={moving} className="canvas-access-layer">
        <Items items={items} scale={scale} roving={roving} onFocusItem={focusItem} />
        <Hot hover={hover} hotOf={hotOf} scale={scale} inside={inside} />
      </div>
    </div>
  );
}

// The objects, drawn again only when they change (not as the pointer moves or the hotspot walks).
const Items = memo(({ items, scale, roving, onFocusItem }: { items: Item[]; scale: number; roving?: string; onFocusItem: (key: string) => void }) => (
  <>
    {items.map((x) => x.box && (
      <div key={x.key} data-object={x.key} role="img" aria-roledescription={x.role} aria-label={x.name} aria-description={x.more}
        tabIndex={x.key === roving ? 0 : -1} style={place(x.box, scale)} onFocus={() => onFocusItem(x.key)} />
    ))}
  </>
));

// The hotspot's atom or bond. Each step makes a new element, which takes the focus while the canvas has it, so a screen
// reader reads each atom and bond as the arrow keys reach it.
function Hot<T>({ hover, hotOf, scale, inside }: { hover: Store<T>; hotOf: (h: T) => HotItem | undefined; scale: number; inside: MutableRefObject<boolean> }) {
  const h = hotOf(useSyncExternalStore(hover.subscribe, hover.get));
  return h ? <HotElement key={h.key} h={h} scale={scale} inside={inside} /> : null;
}
function HotElement({ h, scale, inside }: { h: HotItem; scale: number; inside: MutableRefObject<boolean> }) {
  const el = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (inside.current) el.current?.focus({ preventScroll: true }); }, [inside]);
  return <div ref={el} data-object={h.key} role="img" aria-roledescription={h.role} aria-label={h.name} tabIndex={-1} style={place(h.box, scale, h.turn)} />;
}
