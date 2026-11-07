// LLM 출력 가드의 목업 버전. 실제 강제는 backend/evidence/guards.py에서 한다.
// 설명문에 구조식, 숫자+단위, DOI, 특허번호가 섞이면 통과시키지 않는다.

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
