import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { computeCost } from './lib/cost'
import { usd } from './lib/format'
import { tierCounts } from './lib/route'
import { CopyText, Mock, Mol, TIER_INFO, TierBadge } from './components/bits'
import RouteScheme from './components/RouteScheme'
import StepDetail from './components/StepDetail'
import CostSheet from './components/CostSheet'

const KIND_LABEL = { name: 'a name', cas: 'a CAS number', smiles: 'SMILES' }

function TargetCard({ target }) {
  return (
    <section className="panel target" aria-labelledby="target-title">
      <Mol compound={target} size="lg" />
      <h2 id="target-title" className="target-name">
        {target.name}
      </h2>
      <dl className="kv">
        <div className="kv-row">
          <dt>CAS</dt>
          <dd className="num">{target.cas ?? '—'}</dd>
        </div>
        <div className="kv-row">
          <dt>Molar mass</dt>
          <dd>
            <span className="num">{target.mw.toFixed(2)}</span> g/mol
          </dd>
        </div>
        <div className="kv-row">
          <dt>InChIKey</dt>
          <dd>
            <code className="break">{target.inchikey}</code>
          </dd>
        </div>
        <div className="kv-row kv-stack">
          <dt>SMILES</dt>
          <dd>
            <CopyText text={target.smiles} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

function RouteList({ routes, costs, routeId, onPick, targetG, search }) {
  return (
    <section className="panel routes" aria-labelledby="routes-title">
      <div className="panel-head">
        <h2 id="routes-title">{routes.length} routes</h2>
        <p className="muted small">AiZynthFinder searched for {search.search_time_s} s. Highest score first.</p>
      </div>
      <ul className="route-list">
        {routes.map((r, i) => {
          const c = tierCounts(r)
          return (
            <li key={r.id}>
              <button
                type="button"
                className={`route-card ${r.id === routeId ? 'is-selected' : ''}`}
                aria-pressed={r.id === routeId}
                onClick={() => onPick(r)}
              >
                <span className="rc-top">
                  <span className="rc-name">Route {i + 1}</span>
                  <span className="rc-steps">
                    {r.steps.length} step{r.steps.length > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="tier-strip" aria-label="Evidence tier per step">
                  {r.steps.map((s, k) => (
                    <span
                      key={k}
                      className={`pip pip-${s.evidence.tier.toLowerCase()}`}
                      title={`Step ${k + 1}: ${s.evidence.tier}`}
                    />
                  ))}
                </span>
                <span className="rc-figs">
                  <span>
                    {r.leaf_materials.length} to buy
                    {c.COMPUTED > 0 && <span className="rc-warn"> · {c.COMPUTED} thin on precedent</span>}
                  </span>
                  <span className="rc-cost">
                    <strong className="num">{usd(costs[r.id]?.totals.purchase)}</strong> for {targetG} g
                  </span>
                </span>
                <span className="rc-score muted small">
                  Score {r.aizynth_score.toFixed(3)} <span className="rc-id">{r.id}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="muted small">
        Costs use <Mock what="Prices" /> prices.
      </p>
    </section>
  )
}

function Legend() {
  return (
    <ul className="legend">
      {Object.keys(TIER_INFO).map((t) => (
        <li key={t}>
          <TierBadge tier={t} size="sm" />
          <span>
            {t === 'REPORTED' && 'Corpus holds this exact reaction'}
            {t === 'ANALOGOUS' && `Template has ${api.ANALOGOUS_MIN}+ precedents`}
            {t === 'COMPUTED' && `Under ${api.ANALOGOUS_MIN} precedents, or low plausibility`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Loading({ phase }) {
  return (
    <div className="loading panel" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading-title">
          {phase === 'resolving' ? 'Resolving the structure' : 'Searching retrosynthetic routes'}
        </p>
        <p className="muted small">
          {phase === 'resolving'
            ? 'Turning the name or CAS number into SMILES through PubChem, then canonicalizing with RDKit.'
            : 'AiZynthFinder works backward up to 4 steps with USPTO templates until every branch reaches buyable material.'}
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('Imatinib')
  const [kind, setKind] = useState('auto')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [routes, setRoutes] = useState([])
  const [routeId, setRouteId] = useState(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetG, setTargetG] = useState(1)
  const [purification, setPurification] = useState(0.9)
  const runId = useRef(0)
  const prices = api.getPrices()

  async function run(q, k = kind) {
    const id = ++runId.current
    setError(null)
    setTarget(null)
    setRoutes([])
    setPhase('resolving')
    try {
      const t = await api.resolve(q, k)
      if (id !== runId.current) return
      setTarget(t)
      setPhase('searching')
      const res = await api.getRoutes(t.smiles, 4)
      if (id !== runId.current) return
      setRoutes(res.routes)
      pick(res.routes[0])
      setPhase('ready')
    } catch (e) {
      if (id !== runId.current) return
      setError(e.message)
      setPhase('error')
    }
  }

  function pick(r) {
    if (!r) return
    setRouteId(r.id)
    setStepIdx(r.steps.length - 1)
  }

  useEffect(() => {
    run('Imatinib', 'name')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const costs = useMemo(
    () => Object.fromEntries(routes.map((r) => [r.id, computeCost(r, { targetG, purification, prices })])),
    [routes, targetG, purification, prices],
  )
  const route = routes.find((r) => r.id === routeId)
  const routeIndex = routes.findIndex((r) => r.id === routeId)
  const detected = kind === 'auto' ? api.detectKind(query) : null
  const busy = phase === 'resolving' || phase === 'searching'

  return (
    <div className="app">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <span className="wordmark">SynthPath</span>
            <span className="tagline">Literature-grounded synthesis planner</span>
          </div>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim()) run(query)
            }}
          >
            <label className="sr-only" htmlFor="kind">
              Input type
            </label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="auto">Auto-detect</option>
              <option value="name">Name</option>
              <option value="cas">CAS number</option>
              <option value="smiles">SMILES</option>
            </select>
            <label className="sr-only" htmlFor="q">
              Target molecule
            </label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, CAS number or SMILES"
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Find routes
            </button>
          </form>
          <div className="demos">
            <span className="muted small">{detected ? `Read as ${KIND_LABEL[detected]}` : 'Try'}</span>
            {api.DEMO_TARGETS.map((t) => (
              <button
                key={t.name}
                type="button"
                className="chip-btn"
                onClick={() => {
                  setQuery(t.name)
                  run(t.name, 'name')
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="notice">
        <div className="wrap notice-inner">
          <p>
            <strong>This is a UI mockup.</strong> Structures, molar masses, routes and precedent counts are computed for
            real with RDKit and AiZynthFinder. Anything tagged <Mock /> stands in to show the flow.
          </p>
          <ol className="flow" aria-label="How it goes">
            <li>Enter a target</li>
            <li>Compare routes</li>
            <li>Check the evidence</li>
            <li>Price the batch</li>
          </ol>
        </div>
      </div>

      <main className="wrap bench">
        {phase === 'error' && (
          <div className="panel error" role="alert">
            <p className="loading-title">No match for &ldquo;{query}&rdquo;</p>
            <p className="muted">{error}</p>
          </div>
        )}
        {busy && <Loading phase={phase} />}

        {target && (
          <aside className="rail">
            <TargetCard target={target} />
            {phase === 'ready' && (
              <RouteList
                routes={routes}
                costs={costs}
                routeId={routeId}
                onPick={pick}
                targetG={targetG}
                search={target.search}
              />
            )}
          </aside>
        )}

        {phase === 'ready' && route && (
          <div className="work">
            <section className="panel scheme-panel" aria-labelledby="scheme-title">
              <div className="panel-head scheme-head">
                <div>
                  <h2 id="scheme-title">
                    Route {routeIndex + 1}{' '}
                    <span className="of">
                      {route.steps.length} step{route.steps.length > 1 ? 's' : ''}
                    </span>
                  </h2>
                  <p className="muted small">Click an arrow to see that step&rsquo;s evidence and conditions.</p>
                </div>
                <Legend />
              </div>
              <RouteScheme route={route} targetName={target.name} selectedStep={stepIdx} onSelect={setStepIdx} />
            </section>

            <StepDetail
              route={route}
              stepIndex={stepIdx}
              onSelect={setStepIdx}
              scale={costs[route.id]?.stepScale[stepIdx]}
              targetG={targetG}
            />

            <CostSheet
              cost={costs[route.id]}
              targetG={targetG}
              setTargetG={setTargetG}
              purification={purification}
              setPurification={setPurification}
            />

            <section className="panel calib" aria-labelledby="calib-title">
              <div className="calib-text">
                <h2 id="calib-title">Plausibility model calibration</h2>
                <p className="muted">
                  Once the plausibility classifier is trained, its reliability diagram on the holdout set shows up here:
                  whether reactions the model scores at 0.7 really do work about 70% of the time.
                </p>
              </div>
              <div className="calib-frame">
                <span>not trained yet</span>
                <code>GET /calibration</code>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
