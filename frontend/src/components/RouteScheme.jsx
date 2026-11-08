import { useEffect, useRef } from 'react'
import { schemeLayout } from '../lib/route'
import { Mol, TierBadge } from './bits'

function Arrow({ step, index, side, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`arrow-cell ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`Show details for step ${index + 1}`}
      onClick={() => onSelect(index)}
    >
      <span className="arrow-side">
        {side.map((r) => (
          <Mol key={r.smiles} compound={r} size="xs" caption={r.fromStep != null ? `from step ${r.fromStep + 1}` : null} />
        ))}
      </span>
      <svg className="arrow-line" viewBox="0 0 120 12" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="6" x2="112" y2="6" />
        <path d="M104 1 L118 6 L104 11 Z" />
      </svg>
      <span className="arrow-label">
        <span className="arrow-step">Step {index + 1}</span>
        <TierBadge tier={step.evidence.tier} size="sm" />
      </span>
    </button>
  )
}

export default function RouteScheme({ route, targetName, selectedStep, onSelect }) {
  const { start, cells, branches } = schemeLayout(route)
  const last = route.steps.length - 1
  const wrapRef = useRef(null)

  // If the selected step is outside the horizontal scroll area, scroll so that step is visible (the page does not move)
  useEffect(() => {
    const wrap = wrapRef.current
    const cell = wrap?.querySelector('.arrow-cell.is-selected')
    if (!wrap || !cell) return
    const target = cell.offsetLeft + cell.offsetWidth / 2 - wrap.clientWidth / 2
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    wrap.scrollTo({ left: Math.max(0, target), behavior: still ? 'auto' : 'smooth' })
  }, [route.id, selectedStep])

  return (
    <div className="scheme-wrap" ref={wrapRef}>
      <div className="scheme" role="group" aria-label="Reaction scheme">
        <Mol compound={start} size="md" caption="starting material" />
        {cells.map((c) => (
          <div className="scheme-pair" key={c.stepIndex}>
            <Arrow
              step={route.steps[c.stepIndex]}
              index={c.stepIndex}
              side={c.side}
              selected={selectedStep === c.stepIndex}
              onSelect={onSelect}
            />
            <Mol
              compound={c.product}
              size="md"
              caption={c.stepIndex === last ? targetName : `intermediate ${c.stepIndex + 1}`}
            />
          </div>
        ))}
      </div>
      {branches.length > 0 && (
        <div className="scheme-branches">
          <p className="branch-note">Branch steps feeding the main chain</p>
          {branches.map((b) => (
            <div className="scheme branch" key={b.stepIndex}>
              <div className="branch-inputs">
                {b.reactants.map((r, k) => (
                  <span className="branch-in" key={r.smiles}>
                    {k > 0 && <span className="plus">+</span>}
                    <Mol compound={r} size="sm" />
                  </span>
                ))}
              </div>
              <Arrow
                step={route.steps[b.stepIndex]}
                index={b.stepIndex}
                side={[]}
                selected={selectedStep === b.stepIndex}
                onSelect={onSelect}
              />
              <Mol compound={b.product} size="sm" caption={`intermediate ${b.stepIndex + 1}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
