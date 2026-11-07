// The canvas's scroll bars, as the Mac's overlay ones on every system: thin, along the right and bottom edges of the
// window, shown while the view moves and while the pointer is over one, and gone when the window shows the whole
// drawing. Drag a thumb to pan; press the track to move one window that way (with a glide). The sums are in scroll.ts.
// The thumbs follow the view from its store, as the camera does: a pan or zoom draws no React render here, so the
// canvas draws again no slower than with no bars.
import { useLayoutEffect, useRef, useState } from "react";
import { bar, dragShift, pageShift, type Bar } from "./scroll";
import type { Store } from "./store";

export const BAR = 12; // px: each bar's width, which its pointer area takes along the window's edge
const SHOWN = 1000; // ms the bars stay after the view stops moving, as the Mac's

type Span = [number, number, number, number];
type View = { x: number; y: number; zoom: number };
type Axis = { track: number; content: [number, number]; seen: [number, number]; b?: Bar };

// One axis of the bars for a view: x across, y down.
function axisOf(x: boolean, view: View, box: Span, ruler: number): Axis {
  const size = x ? innerWidth : innerHeight, track = size - ruler - BAR, seen: [number, number] = [ruler, size];
  const content: [number, number] = x ? [view.x + box[0] * view.zoom, view.x + box[2] * view.zoom] : [view.y + box[1] * view.zoom, view.y + box[3] * view.zoom];
  return { track, content, seen, b: bar(content, seen, track) };
}

// views: the canvas's pan and zoom. box: the drawing and its pages (drawing px at 100%, y down). ruler: px the rulers
// take along the top and left. pan: moves the drawing at once (screen px); glide: moves it with the camera's glide.
// canvas: wheel turns over a bar go to it, so the view scrolls as it does over the drawing.
export function Scrollbars({ views, box, ruler, theme, pan, glide, canvas }: {
  views: Store<View>; box: Span; ruler: number; theme: "dark" | "light";
  pan: (dx: number, dy: number) => void; glide: (dx: number, dy: number) => void; canvas: React.RefObject<SVGSVGElement | null>;
}) {
  const root = useRef<HTMLDivElement>(null), across = useRef<HTMLDivElement>(null), down = useRef<HTMLDivElement>(null);
  const axes = useRef<[Axis, Axis]>(undefined);
  // Which bars there are: set only when one comes or goes.
  const [has, setHas] = useState<[boolean, boolean]>([false, false]);
  const [dragging, setDragging] = useState<"x" | "y">();
  const held = useRef<{ x: boolean; from: number; b: Bar; track: number; done: number }>(undefined);

  // Each view: the thumbs move, and the bars show and fade SHOWN ms after the view stops. Not when the drawing opens,
  // a bar comes, or the drawing or window changes with the view where it was.
  useLayoutEffect(() => {
    let last = views.get(), t = 0;
    const draw = () => {
      const view = views.get(), now: [Axis, Axis] = [axisOf(true, view, box, ruler), axisOf(false, view, box, ruler)];
      axes.current = now;
      setHas((h) => (h[0] === !!now[0].b && h[1] === !!now[1].b ? h : [!!now[0].b, !!now[1].b]));
      for (const [el, a, x] of [[across.current, now[0], true], [down.current, now[1], false]] as const) {
        if (!el || !a.b) continue;
        el.style.transform = x ? `translateX(${a.b.at}px)` : `translateY(${a.b.at}px)`;
        el.style[x ? "width" : "height"] = `${a.b.size}px`;
      }
      if (view.x === last.x && view.y === last.y && view.zoom === last.zoom) return;
      last = view;
      root.current?.classList.add("on");
      clearTimeout(t);
      t = window.setTimeout(() => root.current?.classList.remove("on"), SHOWN);
    };
    draw();
    const off = views.subscribe(draw);
    return () => { off(); clearTimeout(t); };
  }, [views, box, ruler, has]);

  const end = () => { held.current = undefined; setDragging(undefined); };
  return (
    <div ref={root} className="scrollbars" data-theme={theme} aria-hidden>
      {([true, false] as const).map((x) => has[x ? 0 : 1] && (
        <div key={x ? "x" : "y"} className={`scrollbar ${x ? "across" : "down"}${dragging === (x ? "x" : "y") ? " dragging" : ""}`}
          onWheel={(e) => canvas.current?.dispatchEvent(new WheelEvent("wheel", e.nativeEvent))}
          onPointerDown={(e) => {
            const a = axes.current?.[x ? 0 : 1], b = a?.b;
            if (e.button !== 0 || !a || !b) return;
            e.preventDefault();
            const along = (x ? e.clientX : e.clientY) - ruler;
            // On the track: one window towards the press. On the thumb: it drags.
            if (along < b.at || along > b.at + b.size) {
              const d = pageShift(a.content, a.seen, along < b.at ? -1 : 1);
              return x ? glide(-d, 0) : glide(0, -d);
            }
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the pointer is already gone */ }
            held.current = { x, from: x ? e.clientX : e.clientY, b, track: a.track, done: 0 };
            setDragging(x ? "x" : "y");
          }}
          onPointerMove={(e) => {
            const h = held.current;
            if (h?.x !== x) return;
            const shift = dragShift(h.b, h.track, (x ? e.clientX : e.clientY) - h.from), d = shift - h.done;
            h.done = shift;
            if (x) pan(-d, 0);
            else pan(0, -d);
          }}
          onPointerUp={end}
          onPointerCancel={end}>
          <div ref={x ? across : down} className="scroll-thumb" />
        </div>
      ))}
    </div>
  );
}
