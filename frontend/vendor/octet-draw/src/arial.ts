// Arial's advance widths (1/1000 em), to place labels and size text the way ChemDraw measures them (CDXML), and to
// space a spectrum's peak labels where no screen font can be measured.
const UPPER = [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611];
const LOWER = [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500];
const OTHER: Record<string, number> = { " ": 278, "+": 584, "-": 333, "−": 584, "(": 333, ")": 333, "[": 278, "]": 278, ".": 278, ",": 278, "'": 191 };
export function advance(ch: string, size: number): number {
  const c = ch.charCodeAt(0);
  const w = c >= 65 && c <= 90 ? UPPER[c - 65] : c >= 97 && c <= 122 ? LOWER[c - 97] : OTHER[ch] ?? 556;
  return (w * size) / 1000;
}
export const widthOf = (text: string, size: number) => [...text].reduce((w, ch) => w + advance(ch, size), 0);
