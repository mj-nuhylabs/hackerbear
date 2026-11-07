// Export: a button that stays at the top right of the window. It opens a menu with Quick export (straight to the Save
// dialog, in the format Settings > Import and export > Quick export picks, PNG at first, with the saved settings) and
// Export…, which shows the settings first: what to export, the
// format, a raster picture's resolution (or its size in pixels), background and JPEG quality, the margin, and a preview
// with the size it will come out at.
import { useEffect, useRef, useState } from "react";
import { CaretUpDown, DownloadSimple, Export as ExportIcon, ImageSquare } from "@phosphor-icons/react";
import { Dialog } from "./Dialog";
import { Menu, Pick } from "./Menu";
import { Exit } from "./motion";
import { Select } from "./Select";
import { NumberField, Segmented } from "./Fields";
import { EXPORT_FORMATS as FORMATS, DPI_MAX, DPI_MIN, DPIS, dpiFor, pictureAs, PICTURES, pixelsAt, RASTERS, shortName, tooLarge } from "./export";
import type { ExportFormat } from "./export";
import type { FilePrefs } from "./SettingsWindow";

// A raster picture's background: "page" is the drawing's own page colour, white for a drawing that has none.
export const BACKDROPS: [FilePrefs["background"], string][] = [["transparent", "Transparent"], ["white", "White"], ["page", "Page colour"]];

// The resolution, in Export… and Settings: any dpi typed, or one of the usual ones from the list beside it.
export function DpiField({ value, onChange }: { value: number; onChange: (dpi: number) => void }) {
  const shown = Math.round(value * 10) / 10;
  return (
    <span className="dpi-field">
      <NumberField label="Resolution" unit="dpi" min={DPI_MIN} max={DPI_MAX} step={1} value={shown} onChange={onChange} />
      <Pick label="Resolutions" value={String(shown)} groups={[DPIS.map((d) => ({ key: String(d), name: `${d} dpi`, icon: null }))]} onPick={(k) => onChange(Number(k))} className="select-field dpi-presets">
        <CaretUpDown size={12} aria-hidden />
      </Pick>
    </span>
  );
}

// selected: something is selected, so Quick export saves the selection (as File > Print Selection… prints it), and its
// item says so.
export function ExportButton({ quick, selected, onQuick, onExport, hint }: { quick: ExportFormat; selected: boolean; onQuick: () => void; onExport: () => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setOpen(false); } };
    addEventListener("pointerdown", away, true);
    addEventListener("keydown", escape, true);
    return () => { removeEventListener("pointerdown", away, true); removeEventListener("keydown", escape, true); };
  }, [open]);
  return (
    <div className="export" ref={box}>
      <button className="export-button" aria-haspopup="menu" aria-expanded={open} data-tip="Export" data-key={hint} onClick={() => setOpen(!open)}>
        <ExportIcon size={16} aria-hidden />
        Export
      </button>
      <Exit>{open && (
        <Menu label="Export" className="export-menu" columns={1}
          groups={[[{ key: "quick", name: `Quick export ${selected ? "selection " : ""}as ${shortName(quick)}`, icon: <ImageSquare size={18} /> }, { key: "export", name: "Export…", icon: <DownloadSimple size={18} /> }]]}
          onChoose={(key) => { setOpen(false); if (key === "quick") onQuick(); else onExport(); }} />
      )}</Exit>
    </div>
  );
}

export type ExportSettings = Pick<FilePrefs, "dpi" | "background" | "margin" | "quality"> & { format: ExportFormat };

// The settings before saving. pictures: the picture of the whole drawing and, when something is selected, of the
// selection (standaloneSvg, in pt, no margin). page: the drawing's page colour, when it has one. Changes are kept as
// the next export's defaults.
export function ExportDialog({ prefs, onPrefs, pictures, page, chemistry, onExport, onClose }: {
  prefs: ExportSettings; onPrefs: (p: Partial<ExportSettings>) => void; page?: string;
  pictures: { all?: string; selection?: string };
  chemistry: (part: "all" | "selection") => Partial<Record<ExportFormat, boolean>>;
  onExport: (part: "all" | "selection") => void; onClose: () => void;
}) {
  const [part, setPart] = useState<"all" | "selection">(pictures.selection ? "selection" : "all");
  const has = chemistry(part), picture = pictures[part], format = prefs.format;
  const usable = FORMATS.filter(([f]) => (PICTURES.includes(f) ? !!picture : has[f]));
  const isPicture = PICTURES.includes(format), raster = RASTERS.includes(format);
  const shown = picture && isPicture ? pictureAs(picture, prefs, page) : undefined, svg = shown?.svg, clear = !!shown?.transparent;
  const size = svg ? (/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg) ?? []).slice(1).map(Number) : [];
  const mm = (pt: number) => Math.round((pt * 25.4) / 72);
  const px = size.length === 2 ? size.map((pt) => pixelsAt(pt, prefs.dpi)) : [], big = raster && px.length === 2 && tooLarge(px[0], px[1]);
  // The backgrounds this format and drawing have, and the one in use (white for a page colour the drawing lacks).
  const backdrops = BACKDROPS.filter(([b]) => (b !== "transparent" || format !== "jpg") && (b !== "page" || page));
  const backdrop = backdrops.some(([b]) => b === prefs.background) ? prefs.background : "white";
  // A saved format this drawing has nothing for stays in the list, so the list shows it and Export… is off.
  const ok = usable.some(([f]) => f === format);
  // The preview is white paper in both themes, so it and the text on it take the light theme's colours.
  return (
    <Dialog title="Export" action="Export…" onClose={onClose} onAction={() => onExport(part)} disabled={!ok || big}>
      <div className={["export-preview", svg && clear && "transparent"].filter(Boolean).join(" ")} data-theme="light">
        {svg ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt="Preview" /> : <span className="export-none">{ok ? FORMATS.find(([f]) => f === format)?.[1] : "Nothing to export in this format"}</span>}
      </div>
      {size.length === 2 && (
        <p className="export-size">
          {mm(size[0])} × {mm(size[1])} mm{raster ? ` · ${px[0].toLocaleString()} × ${px[1].toLocaleString()} px` : ""}
        </p>
      )}
      {big && <p className="export-size export-big" role="alert">Too large. Choose a lower resolution.</p>}
      {pictures.selection && (
        <Segmented label="What to export" value={part} onChange={setPart} options={[["all", "Whole drawing"], ["selection", "Selection"]]} />
      )}
      <label className="dialog-row"><span>Format</span>
        <Select label="Format" value={format} options={ok ? usable : usable.length ? [...usable, ...FORMATS.filter(([f]) => f === format)] : FORMATS} onChange={(v) => onPrefs({ format: v as ExportFormat })} />
      </label>
      {raster && (
        <label className="dialog-row"><span>Resolution</span>
          <DpiField value={prefs.dpi} onChange={(dpi) => onPrefs({ dpi })} />
        </label>
      )}
      {raster && px.length === 2 && (
        <div className="dialog-row export-pixels"><span>Size</span>
          <NumberField label="Width" unit="px" min={1} max={99999} step={1} value={px[0]} onChange={(n) => onPrefs({ dpi: dpiFor(n, size[0]) })} />
          <span className="times">×</span>
          <NumberField label="Height" unit="px" min={1} max={99999} step={1} value={px[1]} onChange={(n) => onPrefs({ dpi: dpiFor(n, size[1]) })} />
        </div>
      )}
      {raster && backdrops.length > 1 && (
        <label className="dialog-row"><span>Background</span>
          <Select label="Background" value={backdrop} options={backdrops} onChange={(v) => onPrefs({ background: v as FilePrefs["background"] })} />
        </label>
      )}
      {format === "jpg" && (
        <label className="dialog-row"><span>Quality</span>
          <NumberField label="Quality" unit="%" min={1} max={100} step={5} value={prefs.quality} onChange={(n) => onPrefs({ quality: Math.round(n) })} />
        </label>
      )}
      {isPicture && (
        <label className="dialog-row"><span>Margin</span>
          <NumberField label="Margin" unit="pt" min={0} max={72} step={1} value={prefs.margin} onChange={(n) => onPrefs({ margin: n })} />
        </label>
      )}
    </Dialog>
  );
}
