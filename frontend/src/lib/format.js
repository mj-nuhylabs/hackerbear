export const DASH = '—'

// n significant figures
export function sig(x, n = 3) {
  if (x == null || !Number.isFinite(x)) return DASH
  if (x === 0) return '0'
  const d = Math.min(6, Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))))
  return x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export const mmol = (mol) => (mol == null ? DASH : sig(mol * 1000))
export const grams = (g) => (g == null ? DASH : g < 1 ? `${sig(g * 1000)} mg` : `${sig(g)} g`)
export const usd = (x) =>
  x == null ? DASH : '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = (x) => (x == null ? DASH : `${Math.round(x * 100)}%`)
// Time. Under 1 hour, use minutes -- a recorded 5-minute reaction showing as "0.0833 h" is unreadable
export const hours = (h) => (h == null ? DASH : h < 1 ? `${sig(h * 60)} min` : `${sig(h)} h`)
export const shortHash = (h) => (h ? h.slice(0, 10) : DASH)
