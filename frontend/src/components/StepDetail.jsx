import { useEffect, useState } from 'react'
import * as api from '../api'
import { checkText } from '../lib/guard'
import { DASH, mmol, pct, shortHash, sig } from '../lib/format'
import { nameOf } from '../octet/engine'
import { Mock, Mol, TIER_INFO, TierBadge } from './bits'
import Procedure from './Procedure'
import Analogs from './Analogs'
import Adapted from './Adapted'
import Experimental from './Experimental'
import Protocol from './Protocol'
import './analogs.css'

// ORD lists solvents and catalysts as structures. Showing them as is would make the chemist read "C(CCC)O", so we use Octet's
// offline namer to give a name and keep the structure in the title. If no name can be assigned, show the structure as is --
// we do not swap in a different name.
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

// Condition cells needed right at the bench. A missing value stays as —.
// What each **source** that actually ran this reaction reported. If one patent posts 6 entries in a single table,
// the record count is overwhelming but the independent evidence is one -- for aspirin, those 6 were a sulfated zirconia
// screening table, and it showed up as "the catalyst for aspirin".
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
    // The name the record lists comes first for a catalyst. If the structure does not match the name, the backend drops the structure
    // (backend/evidence/identity.py) -- e.g. a case where "zirconia" had an unrelated organic structure attached
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
            {/* If the conditions come from a similar reaction rather than this reaction's own record, always flag it */}
            {v != null && c?.from_analog && (
              <span className="ana-basis ana-basis-analogs" title={`Tanimoto ${c.similarity}`}>
                from analog
              </span>
            )}
            {/* The case where the structure was dropped because it did not match the name. Show only the name and say why */}
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

// The yield used in the cost calculation and its source. There are only three -- this reaction's record, a close analog, or an assumed value.
// If it came from an analog, show the spread, not a single number: the measured mean error is ±20 pp, so showing
// just "62%" makes the chemist read it as about ±5 pp (scripts/validate_analogs.py).
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

// When the step changes it is remounted via key, so state resets by itself
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
      {/* backend/chem/balance.py: the reactant list does not account for all the product's atoms -- a reactant is missing from the record.
          But if a reagent in the record's charge table supplies those atoms, nothing is missing (missing_supplied_by) */}
      {s.missing_atoms && Object.keys(s.missing_atoms).length > 0 && (
        <p className="step-gap" role="note">
          {s.missing_supplied_by?.length ? (
            <>
              <strong>The arrow does not show everything this step needs.</strong> The product has{' '}
              {Object.entries(s.missing_atoms)
                .map(([el, n]) => `${n} ${el}`)
                .join(', ')}{' '}
              that no starting material supplies. The record&apos;s own quantity table charges{' '}
              {s.missing_supplied_by
                .map((m) => m.name || m.smiles)
                .reduce((a, x, i, all) => (i === 0 ? x : i === all.length - 1 ? `${a} and ${x}` : `${a}, ${x}`), '')}
              , which between them account for it, so the material is on the sheet below and in the bill as a reagent
              line rather than missing from it.
            </>
          ) : (
            <>
              <strong>A reactant is missing from this step.</strong> The product has{' '}
              {Object.entries(s.missing_atoms)
                .map(([el, n]) => `${n} ${el}`)
                .join(', ')}{' '}
              that none of the listed reactants supply — the record left one out. That material is not on the bill, so
              this route’s cost is a lower bound.
            </>
          )}
        </p>
      )}
      {/* Start with what you need to see when making it: scale, yield, conditions -> procedure -> amounts converted to my scale */}
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
        {/* Judge by the number of **sources**, not the record count. If one patent's screening table has 6 entries, it is
            a majority by records but one independent piece of evidence (backend/evidence/provenance.py _by_source) */}
        <SourceSpread by={s.conditions?.by_source} />
      </div>

      <Protocol protocol={s.protocol} factor={scale?.nRxn != null ? scale.nRxn * 1000 : 1} targetG={targetG} />

      {/* The same data as a submission-format paragraph. Because a table cannot be pasted in as is */}
      <Experimental protocol={s.protocol} factor={scale?.nRxn != null ? scale.nRxn * 1000 : 1} targetG={targetG} />

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
