export const DASH = '—'

// 유효숫자 n자리
export function sig(x, n = 3) {
  if (x == null || !Number.isFinite(x)) return DASH
  if (x === 0) return '0'
  const d = Math.min(6, Math.max(0, n - 1 - Math.floor(Math.log10(Math.abs(x)))))
  return x.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export const mmol = (mol) => (mol == null ? DASH : sig(mol * 1000))
export const grams = (g) => (g == null ? DASH : g < 1 ? `${sig(g * 1000)} mg` : `${sig(g)} g`)
export const usd = (x) =>
  x == null ? DASH : '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const pct = (x) => (x == null ? DASH : `${Math.round(x * 100)}%`)
export const shortHash = (h) => (h ? h.slice(0, 10) : DASH)
