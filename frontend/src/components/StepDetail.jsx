import { useEffect, useState } from 'react'
import * as api from '../api'
import { checkText } from '../lib/guard'
import { DASH, mmol, pct, shortHash, sig } from '../lib/format'
import { nameOf } from '../octet/engine'
import { Mock, Mol, TIER_INFO, TierBadge } from './bits'
import Procedure from './Procedure'
import Analogs from './Analogs'
import Adapted from './Adapted'
import Protocol from './Protocol'
import './analogs.css'

// ORD는 용매·촉매를 구조로 적는다. 그대로 띄우면 화학자가 "C(CCC)O"를 읽어야 하므로, Octet의
// 오프라인 명명기로 이름을 붙이고 구조는 title에 남긴다. 이름을 못 붙이면 구조를 그대로 보여준다 —
// 다른 이름으로 바꾸지 않는다.
function Structure({ smiles }) {
  const [name, setName] = useState(undefined)
  useEffect(() => {
    let live = true
    nameOf(smiles).then(
      (n) => live && setName(n),
      () => live && setName(null),
    )
    return () => {
      live = false
    }
  }, [smiles])
  if (name) return <span title={smiles}>{name}</span>
  return <code className="cond-smiles">{smiles}</code>
}

// 벤치에서 바로 필요한 조건 칸들. 값이 없으면 — 로 남긴다.
// 이 반응을 실제로 돌린 **출처**들이 각각 뭐라고 적었는가. 한 특허가 표 하나로 6건을 올리면
// 레코드 수로는 압도하지만 독립된 근거는 하나다 — 아스피린에서 그 6건이 설퍼이트 지르코니아
// 스크리닝 표였고, 그게 "아스피린의 촉매"처럼 떴다.
function SourceSpread({ by }) {
  if (!by?.length) return null
  const span = (s, unit) =>
    s == null ? null : s.min === s.max ? `${sig(s.min)}${unit}` : `${sig(s.min)}–${sig(s.max)}${unit}`
  return (
    <div className="cond-sources">
      <p className="muted small">
        {by.length} independent {by.length === 1 ? 'source has' : 'sources have'} run this reaction. Each row is one
        patent or paper, however many entries it contributed — the conditions above are from the one that reports a
        yield.
      </p>
      <ul>
        {by.map((g) => (
          <li key={g.source}>
            <span className="cond-src-name">
              {g.url ? (
                <a href={g.url} target="_blank" rel="noreferrer noopener">
                  {g.source}
                </a>
              ) : (
                g.source
              )}
            </span>
            <span className="muted small">
              {' '}
              {g.records} record{g.records > 1 ? 's' : ''}
              {span(g.temperature_c, ' °C') ? ` · ${span(g.temperature_c, ' °C')}` : ''}
              {span(g.time_h, ' h') ? ` · ${span(g.time_h, ' h')}` : ''}
              {span(g.yield_pct, '%') ? ` · yield ${span(g.yield_pct, '%')}` : ''}
              {g.catalysts?.length ? ` · catalyst ${g.catalysts.join(', ')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Conditions({ c }) {
  const rows = [
    ['Temperature', c?.temperature_c != null ? `${sig(c.temperature_c)} °C` : null, false, 'temperature_c'],
    ['Time', c?.time_h != null ? `${sig(c.time_h)} h` : null, false, 'time_h'],
    ['Solvent', c?.solvent, true, 'solvent'],
    // 촉매는 레코드가 적어 둔 이름이 먼저다. 구조가 이름과 안 맞으면 백엔드가 구조를 버린다
    // (backend/evidence/identity.py) — "zirconia"에 엉뚱한 유기물 구조가 붙어 있던 경우
    ['Catalyst', c?.catalyst ?? c?.catalyst_name ?? null, !!c?.catalyst, 'catalyst'],
  ]
  return (
    <>
      {rows.map(([k, v, isStructure, key]) => (
        <div className="bench-cell" key={k}>
          <dt>{k}</dt>
          <dd>
            {v == null ? DASH : isStructure ? <Structure smiles={v} /> : v}
            {v != null && c?.mock && <Mock what="Conditions" />}
            {/* 이 반응 자체의 기록이 아니라 유사 반응에서 가져온 조건이면 반드시 표시한다 */}
            {v != null && c?.from_analog && (
              <span className="ana-basis ana-basis-analogs" title={`Tanimoto ${c.similarity}`}>
                from analog
              </span>
            )}
            {/* 구조가 이름과 안 맞아서 버린 경우. 이름만 보여주고 왜인지 말해 준다 */}
            {key === 'catalyst' && c?.catalyst_structure_dropped && (
              <span className="cond-src" title={c.catalyst_structure_dropped}>
                name only
              </span>
            )}
          </dd>
        </div>
      ))}
    </>
  )
}

// 비용 계산에 들어간 수율과 그 출처. 세 가지뿐이다 — 이 반응의 레코드, 가까운 유사 반응, 가정값.
// 유사 반응에서 왔으면 하나의 숫자가 아니라 퍼짐을 같이 보여준다: 측정된 평균 오차가 ±20%p라서
// "62%"만 띄우면 화학자가 ±5%p쯤으로 읽는다 (scripts/validate_analogs.py).
const yieldBasis = (step) => step.yield_basis?.basis ?? (step.reported_yield != null ? 'reported' : 'assumed')

function YieldUsed({ step }) {
  const b = step.yield_basis ?? {}
  const basis = yieldBasis(step)
  const label = { reported: 'reported', analogs: 'from analogs', assumed: 'assumed' }[basis]
  const spread =
    basis === 'analogs' && b.yield_pct_min != null && b.yield_pct_max != null
      ? `${Math.round(b.yield_pct_min)}–${Math.round(b.yield_pct_max)}% across ${b.n_analogs} analog${
          b.n_analogs > 1 ? 's' : ''
        }`
      : null
  return (
    <>
      {pct(step.assumed_yield)}
      <span className={`ana-basis ana-basis-${basis}`}>{label}</span>
      {spread && <div className="muted small">{spread}</div>}
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
    try {
      const data = await api.explain(route, stepIndex)
      // The backend says why when it wrote nothing (no API key, or the guard discarded the text). Show that reason,
      // not empty columns under a "guard passed" line.
      if (data.available === false) {
        setState({ status: 'unavailable', reason: data.reason })
        return
      }
      const text = [data.why_works, data.why_fails, data.next_experiment].join(' ')
      setState({ status: 'done', data, guard: checkText(text) })
    } catch (e) {
      setState({ status: 'unavailable', reason: e.message })
    }
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
      {state.status === 'unavailable' && <p className="muted">No explanation was written: {state.reason}</p>}
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

export default function StepDetail({ route, stepIndex, onSelect, scale, targetG, onOpenInDraw, indexStats }) {
  const s = route.steps[stepIndex]
  // A compound's molar mass, and a button that adds it to the drawing (Octet Draw).
  const caption = (c) => (
    <>
      {`${c.mw.toFixed(2)} g/mol`}
      {onOpenInDraw && (
        <button type="button" className="ghost-btn draw-open" onClick={() => onOpenInDraw(c.smiles)}>
          Add to drawing
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
      {/* backend/chem/balance.py: 반응물 목록이 생성물의 원자를 다 대지 못한다 — 레코드에서 반응물이 빠졌다 */}
      {s.missing_atoms && Object.keys(s.missing_atoms).length > 0 && (
        <p className="step-gap" role="note">
          <strong>A reactant is missing from this step.</strong> The product has{' '}
          {Object.entries(s.missing_atoms)
            .map(([el, n]) => `${n} ${el}`)
            .join(', ')}{' '}
          that none of the listed reactants supply — the record left one out. That material is not on the bill, so
          this route’s cost is a lower bound.
        </p>
      )}
      {/* 만들 때 바로 봐야 하는 것부터: 스케일, 수율, 조건 → 절차 → 내 스케일로 환산한 양 */}
      <div className="run-step">
        <h3>Run this step</h3>
        <dl className="bench-grid">
          <div className="bench-cell bench-scale">
            <dt>Scale</dt>
            <dd>
              <span className="num">{mmol(scale?.nRxn)}</span> mmol
            </dd>
            <span className="muted small">to end up with {targetG} g of target</span>
          </div>
          <div className="bench-cell">
            <dt>Yield used in costing</dt>
            <dd>
              <YieldUsed step={s} />
            </dd>
            {yieldBasis(s) !== 'reported' && (
              <span className="muted small">
                Reported {pct(s.reported_yield)}
                {s.reported_yield != null && isMock('reported_yield') && <Mock what="Reported yield" />}
              </span>
            )}
          </div>
          <Conditions c={s.conditions} />
        </dl>
        {/* 레코드 수가 아니라 **출처 수**로 본다. 한 특허의 스크리닝 표가 6건이면 레코드로는
            다수지만 독립된 근거는 하나다 (backend/evidence/provenance.py _by_source) */}
        <SourceSpread by={s.conditions?.by_source} />
      </div>

      <Protocol protocol={s.protocol} factor={scale?.nRxn != null ? scale.nRxn * 1000 : 1} targetG={targetG} />

      <Procedure procedure={s.procedure} ourMmol={scale?.nRxn != null ? scale.nRxn * 1000 : null} />

      <Adapted step={s} scaleMol={scale?.nRxn} />

      <div className="step-ref-head">
        <h3>Evidence and checks</h3>
        <p className="muted small">Where this step comes from and how far to trust it.</p>
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
                {s.recorded_step ? (
                  <>
                    <span className="num">{s.recorded_step.n_records.toLocaleString('en-US')}</span> records of this
                    reaction from {s.recorded_step.n_sources} source{s.recorded_step.n_sources === 1 ? '' : 's'}
                    <span className="src">Open Reaction Database</span>
                    {s.recorded_step.unclassified?.length > 0 && (
                      <p className="muted small">
                        The record also lists {s.recorded_step.unclassified.length} organic molecule
                        {s.recorded_step.unclassified.length > 1 ? 's' : ''} we could not classify as substrate or
                        reagent. If any is a co-substrate, this step needs it and the cost below is a lower bound:{' '}
                        {s.recorded_step.unclassified.map((u) => (
                          <code key={u} className="cond-smiles">
                            {u}
                          </code>
                        ))}
                      </p>
                    )}
                  </>
                ) : ev.precedent_count != null ? (
                  <>
                    <span className="num">{ev.precedent_count.toLocaleString('en-US')}</span> records
                    <span className="src">USPTO template library</span>
                  </>
                ) : (
                  DASH
                )}
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
                ) : ev.tier === 'COMPUTED' ? (
                  <span className="muted">No precedent found in the corpus</span>
                ) : (
                  <span className="muted">
                    The template library counts precedents but does not name the patents behind them
                  </span>
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
          <h3>Structural plausibility {isMock('plausibility_calibrated') && <Mock what="Plausibility" />}</h3>
          <Bar label="Model raw score" value={s.plausibility_raw} />
          <Bar label="Calibrated" value={s.plausibility_calibrated} emphasize />
          <p className="muted small">
            How much this step looks like a real literature reaction rather than a template misapplied to
            these reactants. A low score means the structure is doubtful, and that is what drops a step to
            COMPUTED.
          </p>
          <p className="muted small">
            <strong>It scores structure, not outcome.</strong> It was trained to tell real corpus reactions
            apart from the products of other templates applied to these same reactants — never on whether a
            reaction succeeded. How far that carries over to real laboratory results is measured against
            reactions with recorded outcomes, in the model panel below.
          </p>
        </div>
      </div>

      <Analogs analogs={s.analogs} indexStats={indexStats} />

      <Explain key={`${route.id}-${stepIndex}`} route={route} stepIndex={stepIndex} />

      <div className="gaps">
        <h3>Substrate classes this template has not been tried on {isMock('gaps') && <Mock what="Gaps" />}</h3>
        {s.gaps?.length ? (
          <ul className="chips">
            {[...new Set(s.gaps)].map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">{DASH} Not computed for this step yet.</p>
        )}
      </div>
    </section>
  )
}
