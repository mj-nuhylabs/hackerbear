import { useState } from 'react'

export const TIER_INFO = {
  REPORTED: { label: 'REPORTED', say: '코퍼스에 같은 반응 레코드가 있습니다.' },
  ANALOGOUS: { label: 'ANALOGOUS', say: '템플릿이 적용됐고, 이 템플릿의 문헌 선례가 충분합니다.' },
  COMPUTED: { label: 'COMPUTED', say: '템플릿은 적용됐지만 선례가 적거나 타당성 점수가 낮습니다.' },
}

export function TierBadge({ tier, size }) {
  return (
    <span className={`tier tier-${tier.toLowerCase()} ${size === 'sm' ? 'tier-sm' : ''}`} title={TIER_INFO[tier].say}>
      {TIER_INFO[tier].label}
    </span>
  )
}

export function Mock({ what }) {
  return (
    <span className="mock" title={what ? `${what}: 예시값이며 실데이터가 아닙니다` : '예시값이며 실데이터가 아닙니다'}>
      예시값
    </span>
  )
}

export function Mol({ compound, size = 'md', caption }) {
  if (!compound) return null
  return (
    <figure className={`mol mol-${size}`} title={compound.smiles}>
      {compound.svg ? (
        <div className="mol-svg" dangerouslySetInnerHTML={{ __html: compound.svg }} />
      ) : (
        <div className="mol-svg mol-missing">구조 없음</div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

export function CopyText({ text, className = '' }) {
  const [done, setDone] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 1400)
    } catch {
      const sel = window.getSelection()
      const node = document.getElementById(`copy-${text.length}`)
      if (sel && node) sel.selectAllChildren(node)
    }
  }
  return (
    <span className={`copytext ${className}`}>
      <code id={`copy-${text.length}`}>{text}</code>
      <button type="button" className="ghost-btn" onClick={copy}>
        {done ? '복사됨' : '복사'}
      </button>
    </span>
  )
}
