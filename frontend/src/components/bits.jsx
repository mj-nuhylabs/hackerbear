import { useState } from 'react'

export const TIER_INFO = {
  REPORTED: { label: 'REPORTED', say: 'The corpus holds a record for this exact reaction.' },
  ANALOGOUS: { label: 'ANALOGOUS', say: 'The template applies, and it has enough precedent in the literature.' },
  COMPUTED: { label: 'COMPUTED', say: 'The template applies, but precedent is thin or plausibility is low.' },
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
    <span className="mock" title={what ? `${what}: an example value, not real data` : 'An example value, not real data'}>
      example
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
        <div className="mol-svg mol-missing">no structure</div>
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
        {done ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}
