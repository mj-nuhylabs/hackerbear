// Mock version of the LLM output guard. The real enforcement is in backend/evidence/guards.py.
// If an explanation contains a structure, number+unit, DOI, or patent number, it does not pass.

const UNIT = /\d+(?:[.,]\d+)?\s*(?:%|°\s*C|℃|mmol|mol\b|mg\b|kg\b|g\b|mL|µL|L\b|M\b|h\b|hr|min|equiv|eq\b|USD|\$)/i
const DOI = /\b10\.\d{4,9}\/\S+/
const PATENT = /\b(?:US|EP|WO|JP|KR|CN)\s?-?\d{5,}/i

function looksLikeSmiles(token) {
  return (
    token.length >= 5 &&
    /^[A-Za-z0-9@+\-[\]()=#$/\\%.]+$/.test(token) &&
    /[=#[\]()]|[A-Za-z]\d/.test(token) &&
    /[CNOcno]/.test(token)
  )
}

export function checkText(text) {
  const hits = []
  if (UNIT.test(text)) hits.push('a number with a unit')
  if (DOI.test(text)) hits.push('a DOI')
  if (PATENT.test(text)) hits.push('a patent number')
  if (text.split(/\s+/).some(looksLikeSmiles)) hits.push('a structure')
  return { ok: hits.length === 0, hits }
}
