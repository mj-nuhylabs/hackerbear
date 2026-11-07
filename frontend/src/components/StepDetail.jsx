import { useState } from 'react'
import * as api from '../api'
import { checkText } from '../lib/guard'
import { DASH, mmol, pct, shortHash } from '../lib/format'
import { Mock, Mol, TIER_INFO, TierBadge } from './bits'

function Conditions({ c }) {
  const rows = [
    ['Solvent', c?.solvent],
    ['Temperature', c?.temperature_c != null ? `${c.temperature_c} °C` : null],
    ['Time', c?.time_h != null ? `${c.time_h} h` : null],
    ['Catalyst', c?.catalyst],
  ]
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <dt>{k}</dt>
          <dd>
            {v ?? DASH}
            {v != null && c?.mock && <Mock what="Conditions" />}
          </dd>
        </div>
      ))}
    </>
  )
}

function Bar({ label, value, emphasize }) {
  return (
    <div className={`pbar ${emphasize ? 'pbar-main' : ''}`}>
      <span className="pbar-label">{label}</span>
      <span className="pbar-track">
        <span className="pbar-fill" style={{ width: `${(value ?? 0) * 100}%` }} />
      </span>
      <span className="pbar-val">{value == null ? DASH : value.toFixed(2)}</span>
    </div>
  )
}

// 단계가 바뀌면 key로 새로 마운트되므로 상태가 저절로 초기화된다
function Explain({ route, stepIndex }) {
  const [state, setState] = useState({ status: 'idle' })

  async function run() {
    setState({ status: 'loading' })
    const data = await api.explain(route, stepIndex)
    const text = [data.why_works, data.why_fails, data.next_experiment].join(' ')
    setState({ status: 'done', data, guard: checkText(text) })
  }

  return (
    <div className="explain">
      <div className="explain-head">
        <div>
          <h3>Explanation</h3>
          <p className="muted">The model writes prose from this step&rsquo;s source records and nothing else.</p>
        </div>
        {state.status !== 'done' && (
          <button type="button" className="btn" onClick={run} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Writing…' : 'Write explanation'}
          </button>
        )}
      </div>
      {state.status === 'done' && !state.guard.ok && (
        <p className="guard guard-fail">Guard blocked this: the text contains {state.guard.hits.join(', ')}.</p>
      )}
      {state.status === 'done' && state.guard.ok && (
        <>
          <div className="explain-cols">
            <section>
              <h4>Why it should work</h4>
              <p>{state.data.why_works}</p>
            </section>
            <section>
              <h4>Where it could fail</h4>
              <p>{state.data.why_fails}</p>
            </section>
            <section>
              <h4>Next experiment</h4>
              <p>{state.data.next_experiment}</p>
            </section>
          </div>
          <p className="guard guard-ok">
            Guard passed: no structures, no numbers with units, no DOIs, no patent numbers.{' '}
            {state.data.mock && <Mock what="Explanation" />}
          </p>
        </>
      )}
    </div>
  )
}

export default function StepDetail({ route, stepIndex, onSelect, scale, targetG, onOpenInDraw }) {
  const s = route.steps[stepIndex]
  // A compound's molar mass, and a button that opens it in the Draw panel (Octet Draw).
  const caption = (c) => (
    <>
      {`${c.mw.toFixed(2)} g/mol`}
      {onOpenInDraw && (
        <button type="button" className="ghost-btn draw-open" onClick={() => onOpenInDraw(c.smiles)}>
          Open in Draw
        </button>
      )}
    </>
  )
  const n = route.steps.length
  const ev = s.evidence
  const isMock = (k) => s.mock?.includes(k)
  const evMock = (k) => ev.mock?.includes(k)

  return (
    <section className="panel step" aria-labelledby="step-title">
      <header className="step-head">
        <div className="step-title-row">
          <h2 id="step-title">
            Step {stepIndex + 1}
            <span className="of"> / {n}</span>
          </h2>
          <TierBadge tier={ev.tier} />
          {evMock('tier') && <Mock what="Evidence tier" />}
        </div>
        <div className="step-nav">
          <button type="button" className="ghost-btn" disabled={stepIndex === 0} onClick={() => onSelect(stepIndex - 1)}>
            Previous
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={stepIndex === n - 1}
            onClick={() => onSelect(stepIndex + 1)}
          >
            Next
          </button>
        </div>
      </header>

      <div className="rxn-line">
        {s.reactants.map((r, k) => (
          <span className="rxn-in" key={r.smiles}>
            {k > 0 && <span className="plus">+</span>}
            <Mol compound={r} size="sm" caption={caption(r)} />
          </span>
        ))}
        <svg className="rxn-arrow" viewBox="0 0 60 12" aria-hidden="true">
          <line x1="0" y1="6" x2="52" y2="6" />
          <path d="M46 1 L60 6 L46 11 Z" />
        </svg>
        <Mol compound={s.product} size="sm" caption={caption(s.product)} />
      </div>
      <p className="rxn-smiles">
        <code>{s.rxn_smiles}</code>
      </p>

      <div className="step-grid">
        <div className="block">
          <h3>Evidence</h3>
          <p className="tier-say">{TIER_INFO[ev.tier].say}</p>
          <dl className="kv">
            <div className="kv-row">
              <dt>Precedents</dt>
              <dd>
                <span className="num">{ev.precedent_count.toLocaleString('en-US')}</span> records
                <span className="src">USPTO template library</span>
              </dd>
            </div>
            <div className="kv-row">
              <dt>Sources</dt>
              <dd>
                {ev.source_ids.length ? (
                  <span className="src-list">
                    {ev.source_ids.map((id) => (
                      <code key={id}>{id}</code>
                    ))}
                    {evMock('source_ids') && <Mock what="Source IDs" />}
                  </span>
                ) : (
                  <span className="muted">No precedent found in the corpus</span>
                )}
              </dd>
            </div>
            <div className="kv-row">
              <dt>Template ID</dt>
              <dd>
                <code>{shortHash(s.template_id)}</code>
              </dd>
            </div>
          </dl>
        </div>

        <div className="block">
          <h3>Yield and conditions</h3>
          <dl className="kv">
            <div className="kv-row">
              <dt>Reported yield</dt>
              <dd>
                {pct(s.reported_yield)}
                {s.reported_yield != null && isMock('reported_yield') && <Mock what="Reported yield" />}
              </dd>
            </div>
            <div className="kv-row">
              <dt>Used in costing</dt>
              <dd>
                {pct(s.reported_yield ?? s.assumed_yield)}
                <span className={`assumed ${s.reported_yield != null ? 'is-reported' : ''}`}>
                  {s.reported_yield != null ? 'reported' : 'assumed'}
                </span>
              </dd>
            </div>
            <Conditions c={s.conditions} />
          </dl>
        </div>

        <div className="block">
          <h3>Reaction plausibility {isMock('plausibility_calibrated') && <Mock what="Plausibility" />}</h3>
          <Bar label="Model raw score" value={s.plausibility_raw} />
          <Bar label="Calibrated" value={s.plausibility_calibrated} emphasize />
          <p className="muted small">Judge by the calibrated probability.</p>
        </div>

        <div className="block">
          <h3>Scale at this step</h3>
          <p className="scale-num">
            <span className="num">{mmol(scale?.nRxn)}</span> mmol
          </p>
          <p className="muted small">What you have to run to end up with {targetG} g of target.</p>
        </div>
      </div>

      <Explain key={`${route.id}-${stepIndex}`} route={route} stepIndex={stepIndex} />

      <div className="gaps">
        <h3>Substrate classes this template has not been tried on {isMock('gaps') && <Mock what="Gaps" />}</h3>
        <ul className="chips">
          {s.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
