// The cursors Octet draws: Select's arrow with Phosphor's selection square beside it, the rotation arrow, the
// crosshair and the I-beam. Cursors must be bitmaps to work everywhere, so each SVG is drawn to PNGs at 1x and 2x.
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ArrowClockwise, Selection } from "@phosphor-icons/react";
import { inHost } from "./synthpath";

// The glyph's path data, read from the real icon component (no copied paths).
function glyphPaths(icon: typeof Selection = Selection): string[] {
  const div = document.createElement("div");
  const root = createRoot(div);
  flushSync(() => root.render(createElement(icon, { size: 256, weight: "bold" })));
  const paths = [...div.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "");
  root.unmount();
  return paths;
}

// The light theme's ink, the cursors' black.
function lightInk() {
  const probe = document.createElement("div");
  probe.dataset.theme = "light";
  // SynthPath: read inside .octet-host, where Octet's tokens are scoped.
  return inHost((parent) => {
    parent.append(probe);
    const ink = getComputedStyle(probe).getPropertyValue("--ink").trim() || "#0F172A";
    probe.remove();
    return ink;
  });
}

async function png(svg: string, scale: number): Promise<string> {
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 24 * scale;
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

// While a drag runs, its cursor shows wherever the pointer goes, over panels and menus too (editor.css,
// data-drag-cursor). The open hand closes. No cursor: the drag has ended.
export function dragCursor(cursor?: string) {
  const root = document.documentElement;
  root.style.setProperty("--drag-cursor", cursor === "grab" ? "grabbing" : cursor ?? "");
  root.toggleAttribute("data-drag-cursor", !!cursor);
}
// A press on a control that is dragged (a grip, a slider): its cursor holds until the pointer is let go.
export function holdCursor(el: Element) {
  dragCursor(getComputedStyle(el).cursor);
  const end = () => { dragCursor(); removeEventListener("pointerup", end); removeEventListener("pointercancel", end); };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);
}

// The cursors Octet draws itself: Select's arrow, the rotation handle's arrow, the drawing tools' crosshair and the
// Text tool's I-beam. Windows draws its own crosshair and I-beam by inverting what is under them, which can leave
// them the colour of the page; these have a glyph with an edge of the other colour, so they show on any page. Each
// value ends in a keyword cursor, for a system that cannot show the picture.
export type CursorInk = "auto" | "black" | "white";
export const CURSOR_INKS: [CursorInk, string][] = [["auto", "Automatic"], ["black", "Black"], ["white", "White"]];
export type CursorName = "select" | "turn" | "cross" | "text";
export type Cursors = Record<CursorName, string>;
// Each cursor's hotspot (in its 24 px box) and the keyword cursor it falls back to.
export const CURSORS: Record<CursorName, { hot: [number, number]; fallback: string }> = {
  select: { hot: [3, 2], fallback: "default" }, turn: { hot: [12, 12], fallback: "grab" },
  cross: { hot: [11, 11], fallback: "crosshair" }, text: { hot: [11, 12], fallback: "text" },
};
// Automatic: black on a light page, white on a dark one.
export const cursorColour = (choice: CursorInk, darkPage: boolean): "black" | "white" => choice === "auto" ? (darkPage ? "white" : "black") : choice;
// The glyph's colour and its edge's: black is the light theme's ink.
export const cursorPaint = (colour: "black" | "white", ink: string): [string, string] => colour === "black" ? [ink, "#FFFFFF"] : ["#FFFFFF", ink];

// A cursor as SVG in a 24 px box, the glyph over a wider stroke of the edge colour. icon: the Phosphor glyph's paths
// (Select's square, the rotation arrow). The crosshair and I-beam lines sit on the middle of a pixel, so they are sharp.
export function cursorSvg(name: CursorName, ink: string, edge: string, icon: string[] = []): string {
  const glyph = icon.map((p) => `<path d="${p}"/>`).join("");
  const lines = (d: string) => `<path d="${d}" fill="none" stroke="${edge}" stroke-width="3" stroke-linecap="square"/><path d="${d}" fill="none" stroke="${ink}" stroke-width="1"/>`;
  const body = name === "select" ? `<path d="M3 2v15l4-3.6 2.6 6 2.4-1-2.6-5.9H15z" fill="${ink}" stroke="${edge}" stroke-width="1.5" stroke-linejoin="round" paint-order="stroke"/>
    <svg x="13" y="13" width="10" height="10" viewBox="0 0 256 256">
      <g fill="${edge}" stroke="${edge}" stroke-width="44" stroke-linejoin="round">${glyph}</g>
      <g fill="${ink}">${glyph}</g>
    </svg>`
    : name === "turn" ? `<svg x="3" y="3" width="18" height="18" viewBox="0 0 256 256">
      <g fill="${edge}" stroke="${edge}" stroke-width="48" stroke-linejoin="round">${glyph}</g>
      <g fill="${ink}">${glyph}</g>
    </svg>`
    : lines(name === "cross" ? "M11.5 2v19M2 11.5h19" : "M9 3.5h5M11.5 3.5v17M9 20.5h5");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
}

// The CSS value: the 1x and 2x pictures at the hotspot, then the keyword. A webview that does not take image-set for
// a cursor gets the 1x picture.
export function cursorValue(name: CursorName, one: string, two: string): string {
  const { hot: [x, y], fallback } = CURSORS[name];
  const set = `-webkit-image-set(url("${one}") 1x, url("${two}") 2x) ${x} ${y}, ${fallback}`;
  return globalThis.CSS?.supports("cursor", set) === false ? `url("${one}") ${x} ${y}, ${fallback}` : set;
}

// Every cursor in black and in white, drawn at start-up (outside React's rendering, where flushSync cannot draw the
// icons). A cursor that fails to draw is its keyword.
let drawn: Promise<Record<"black" | "white", Cursors>> | undefined;
export function drawCursors() {
  return (drawn ??= (async () => {
    const ink = lightInk(), icons: Partial<Record<CursorName, string[]>> = { select: glyphPaths(), turn: glyphPaths(ArrowClockwise) };
    const set = async (colour: "black" | "white") => Object.fromEntries(await Promise.all((Object.keys(CURSORS) as CursorName[]).map(async (name) => {
      const svg = cursorSvg(name, ...cursorPaint(colour, ink), icons[name]);
      try {
        const [one, two] = await Promise.all([png(svg, 1), png(svg, 2)]);
        return [name, cursorValue(name, one, two)];
      } catch {
        return [name, CURSORS[name].fallback];
      }
    }))) as Cursors;
    return { black: await set("black"), white: await set("white") };
  })());
}
if (typeof document !== "undefined") drawCursors();
