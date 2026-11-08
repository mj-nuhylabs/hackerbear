import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as api from './api'
import { usd } from './lib/format'
import { tierCounts } from './lib/route'
import { CopyText, Mock, Mol, TIER_INFO, TierBadge } from './components/bits'
import RouteScheme from './components/RouteScheme'
import StepDetail from './components/StepDetail'
import CostSheet from './components/CostSheet'
import { ImageSquare, SidebarSimple } from '@phosphor-icons/react'
import DrawPane, { sendToDraw } from './components/DrawPane'
import ImagePanel from './components/ImagePanel'
import Home from './components/Home'
import { ModelPanel } from './components/ModelPanel'
import { RankerPanel } from './components/RankerPanel'
import { BAR_H, DRAW_MIN, STRIP, WIDE_MIN, drawMax } from './lib/layout'
import { engineReady, nameOf, readText } from './octet/engine'
import './components/routes-extra.css'

const KIND_TAG = { name: 'Name', cas: 'CAS number', smiles: 'SMILES' }
// Octet's kinds of name (web/namedemo.ts kindOf), short enough to sit inside the search field; the full one is its title.
const OCTET_KIND = {
  'Common or trade name': 'Trade name',
  'Drug name': 'Drug',
  'IUPAC name': 'IUPAC',
  'Trivial name': 'Trivial name',
  'CAS number': 'CAS',
  'Salt or hydrate': 'Salt',
  'Condensed formula': 'Formula',
  Abbreviation: 'Abbreviation',
}

const DRAW_W_KEY = 'synthpath.drawWidth'
const subscribeResize = (f) => {
  addEventListener('resize', f)
  return () => removeEventListener('resize', f)
}
const windowWidth = () => innerWidth
function savedDrawWidth() {
  try {
    const w = Number(localStorage.getItem(DRAW_W_KEY))
    if (w >= DRAW_MIN) return w
  } catch {
    /* no storage: the default */
  }
  return Math.round(innerWidth * 0.42)
}

// Octet's name for the structure: its IUPAC namer, checked by reading the name back. Code, not a model; '—' when it
// has none.
function OctetName({ smiles }) {
  const [name, setName] = useState(undefined) // undefined while Octet's engine loads
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
  if (name === undefined) return <span className="muted">Octet is loading…</span>
  return name ?? '—'
}

// What the search field holds, as Octet's offline reader sees it: a thumbnail and the kind of name, the name it
// corrected a misspelling to, or that it has no match (Find routes then sends the text to the resolver as typed).
function QueryReading({ reading, detected }) {
  if (reading?.smiles)
    return (
      <span className="query-read" title={`Octet reads this ${reading.kind.toLowerCase()} as ${reading.smiles}`}>
        <span className="query-read-mol" aria-hidden="true" dangerouslySetInnerHTML={{ __html: reading.svg }} />
        <span>{reading.corrected ? `Read as ${reading.shown}` : (OCTET_KIND[reading.kind] ?? reading.kind)}</span>
      </span>
    )
  if (reading?.problem)
    return (
      <span
        className="query-read is-faint"
        title="Octet's offline name reader can't read this. Find routes sends it to the resolver as typed."
      >
        No offline match
      </span>
    )
  if (detected) return <span className="query-read is-faint">{KIND_TAG[detected]}</span>
  return null
}

// Typing a target: in the app bar over the results, and at full size on the homescreen (variant 'hero'). Only one
// is on the page at a time, so they share their element ids' stem.
function SearchForm({ variant, query, setQuery, kind, setKind, reading, detected, busy, onRun, onImage }) {
  const hero = variant === 'hero'
  // The homescreen puts the cursor in its field, except on a touch screen, where that would raise the keyboard.
  const [focus] = useState(() => hero && matchMedia('(pointer: fine)').matches)
  return (
    <form
      className={`search ${hero ? 'search-hero' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        if (query.trim()) onRun(query)
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
      <div className="query">
        <label className="sr-only" htmlFor="q">
          Target molecule
        </label>
        <input
          id="q"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={hero ? 'Name, CAS number or SMILES, for example imatinib' : 'Name, CAS number or SMILES'}
          autoComplete="off"
          spellCheck="false"
          autoFocus={focus}
        />
        <QueryReading reading={reading} detected={detected} />
      </div>
      {onImage && (
        <button
          type="button"
          className="btn image-btn"
          aria-label="Read a structure from an image"
          title="Read a structure from an image"
          onClick={onImage}
        >
          <ImageSquare size={18} aria-hidden="true" />
          <span aria-hidden="true">Image</span>
        </button>
      )}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        Find routes
      </button>
    </form>
  )
}

function TargetCard({ target, onDraw }) {
  return (
    <section className="panel target" aria-labelledby="target-title">
      <Mol compound={target} size="lg" />
      <div className="target-head">
        <h2 id="target-title" className="target-name">
          {target.name ?? 'Unnamed structure'}
        </h2>
        <button type="button" className="ghost-btn" onClick={onDraw}>
          Add to drawing
        </button>
      </div>
      <dl className="kv">
        {target.source && (
          <div className="kv-row">
            <dt>Structure from</dt>
            <dd>{target.source}</dd>
          </div>
        )}
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
        <div className="kv-row kv-stack">
          <dt title="Octet Draw's IUPAC namer, checked by reading the name back to the same structure">
            IUPAC name (Octet)
          </dt>
          <dd className="octet-name">
            <OctetName key={target.smiles} smiles={target.smiles} />
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
        {search?.precomputed ? (
          <p className="muted small">
            Recorded routes first — every step is an ORD record ({search.recorded_routes_found} found). Then
            AiZynthFinder routes ({search.aizynth_routes_searched} searched),{' '}
            {search.model_b === 'trained' ? 'ranked by Model B' : 'ranked by AiZynth score (Model B not trained yet)'}, one
            per final disconnection.
          </p>
        ) : (
          <p className="muted small">AiZynthFinder searched for {search?.search_time_s ?? '—'} s. Highest score first.</p>
        )}
      </div>
      <ul className="route-list" data-n={routes.length}>
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
                  <span className="rc-name">
                    Route {i + 1}
                    {r.kind && (
                      <span className={`rc-kind rc-kind-${r.kind}`}>{r.kind === 'recorded' ? 'recorded' : 'computed'}</span>
                    )}
                  </span>
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
                  {r.kind === 'recorded'
                    ? `${r.steps.length} recorded step${r.steps.length > 1 ? 's' : ''}${r.complete === false ? ' · gap to buyable' : ''}`
                    : r.route_rank_score != null
                      ? `Model B ${r.route_rank_score.toFixed(2)} · AiZynth ${r.aizynth_score?.toFixed(3) ?? '—'}`
                      : `Score ${r.aizynth_score != null ? r.aizynth_score.toFixed(3) : '—'}`}{' '}
                  <span className="rc-id">{r.id}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="muted small">
        Costs use supplier list prices where a material has one, and <Mock what="Prices" /> values for the rest. The
        bill of materials says which is which, per material.
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
            {t === 'COMPUTED' && `Under ${api.ANALOGOUS_MIN} precedents, or structurally doubtful`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Loading({ phase, kind }) {
  return (
    <div className="loading panel" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading-title">
          {phase === 'resolving' ? 'Resolving the structure' : 'Searching retrosynthetic routes'}
        </p>
        <p className="muted small">
          {phase !== 'resolving'
            ? 'AiZynthFinder works backward up to 4 steps with USPTO templates until every branch reaches buyable material.'
            : kind === 'smiles'
              ? 'Canonicalizing the SMILES with RDKit.'
              : 'Turning the name or CAS number into SMILES through PubChem, then canonicalizing with RDKit.'}
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('auto')
  // 'idle' is the homescreen: before the first search, and again from the wordmark.
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [routes, setRoutes] = useState([])
  const [routeId, setRouteId] = useState(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetG, setTargetG] = useState(1)
  const [purification, setPurification] = useState(0.9)
  // Octet Draw starts closed, so the homescreen has the window; its Draw button (or the bar's) opens it.
  const [drawOpen, setDrawOpen] = useState(false)
  const [drawW, setDrawW] = useState(savedDrawWidth)
  const [imageOpen, setImageOpen] = useState(false)
  const winW = useSyncExternalStore(subscribeResize, windowWidth)
  // Wide enough for Octet Draw and SynthPath side by side; narrower, the drawing pane covers the results while open.
  const wide = winW >= WIDE_MIN
  const paneW = Math.max(DRAW_MIN, Math.min(drawW, drawMax()))
  const [runKind, setRunKind] = useState(kind)
  const [reading, setReading] = useState(null) // Octet's reading of the typed text: { text, ...readText() }
  const runId = useRef(0)
  // route id → cost (undefined while it is worked out, null if /cost failed)
  const [costs, setCosts] = useState({})

  // extra: { inchikey, source } for a structure Octet drew or read (api.resolve matches the mock by InChIKey).
  async function run(q, k = kind, extra = {}) {
    const id = ++runId.current
    setError(null)
    setTarget(null)
    setRoutes([])
    setCosts({}) // route ids repeat across searches (R1, R2, …), so an old cost must not show on a new route
    let query = q
    let as = k === 'auto' ? api.detectKind(q) : k
    let more = extra
    setRunKind(as)
    setPhase('resolving')
    try {
      // A name or CAS number goes through Octet's offline reader first, once it has loaded. Text it cannot read goes
      // to /resolve as typed (PubChem in the real build).
      if (!more.source && (as === 'name' || as === 'cas') && engineReady()) {
        const read = await readText(q)
        if (id !== runId.current) return
        if (read.smiles) {
          query = read.smiles
          as = 'smiles'
          more = {
            inchikey: read.inchikey,
            // Octet read this name, so /resolve only ever sees the SMILES and answers with no name of its own.
            // Keep what the chemist typed (Octet's corrected spelling where it fixed one) as the card's heading.
            name: read.shown || q.trim(),
            source: read.corrected
              ? `Octet’s offline name reader, spelling fixed to “${read.shown}”`
              : `Octet’s offline name reader (${read.kind})`,
          }
          setRunKind(as)
        }
      }
      const t = await api.resolve(query, query === q ? k : 'smiles', more)
      if (id !== runId.current) return
      setTarget({ ...t, name: t.name ?? more.name ?? null, source: more.source })
      setPhase('searching')
      const res = await api.getRoutes(t.smiles, 4)
      if (id !== runId.current) return
      // The search stats come with the routes from the backend; the mock carries them on the target.
      if (res.search) setTarget((cur) => ({ ...cur, search: res.search }))
      setRoutes(res.routes)
      pick(res.routes[0])
      setPhase('ready')
    } catch (e) {
      if (id !== runId.current) return
      setError(e.message)
      setPhase('error')
    }
  }

  function resizeDraw(w) {
    setDrawW(w)
    try {
      localStorage.setItem(DRAW_W_KEY, String(w))
    } catch {
      /* the width just is not kept */
    }
  }

  // Opens the drawing pane, with a structure added to the canvas (to the right of the drawing, selected) if given.
  function openDraw(smiles) {
    if (smiles) sendToDraw(smiles)
    setDrawOpen(true)
  }

  function pick(r) {
    if (!r) return
    setRouteId(r.id)
    setStepIdx(r.steps.length - 1)
  }

  // Back to the homescreen. A search still running is dropped (its answer no longer matches runId).
  function goHome() {
    runId.current++
    setError(null)
    setTarget(null)
    setRoutes([])
    setCosts({})
    setPhase('idle')
    scrollTo(0, 0)
  }

  // An example target from the homescreen: searched by name, as typed.
  function runExample(name) {
    setQuery(name)
    run(name, 'name')
  }

  // Every route's bill of materials, from POST /cost. Debounced, since the purification slider fires on every tick.
  useEffect(() => {
    if (!routes.length) return
    let live = true
    const t = setTimeout(
      () => {
        Promise.all(
          routes.map((r) =>
            api.getCost(r, { targetG, purification }).then(
              (c) => [r.id, c],
              () => [r.id, null],
            ),
          ),
        ).then((pairs) => live && setCosts(Object.fromEntries(pairs)))
      },
      api.USE_MOCK ? 0 : 200,
    )
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [routes, targetG, purification])
  const route = routes.find((r) => r.id === routeId)
  const routeIndex = routes.findIndex((r) => r.id === routeId)
  const detected = kind === 'auto' ? api.detectKind(query) : null
  const busy = phase === 'resolving' || phase === 'searching'

  // While a name or CAS number is typed, Octet shows what it reads it as (and starts loading in the background).
  const asTyped = kind === 'auto' ? detected : kind
  const readsNames = asTyped === 'name' || asTyped === 'cas'
  useEffect(() => {
    if (!readsNames || !query.trim()) return
    let live = true
    const t = setTimeout(() => {
      readText(query).then(
        (r) => live && setReading({ text: query, ...r }),
        () => {},
      )
    }, 300)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, readsNames])
  const shownReading = readsNames && reading?.text === query ? reading : null
  const home = phase === 'idle'
  const toggleLabel = drawOpen ? (wide ? 'Hide drawing' : home ? 'Back to home' : 'Back to results') : 'Draw'
  const searchProps = {
    query,
    setQuery,
    kind,
    setKind,
    reading: shownReading,
    detected,
    busy,
    onRun: (q) => run(q),
  }

  return (
    <div
      className={`app ${drawOpen && wide ? 'with-draw' : ''}`}
      style={{ '--draw-w': `${paneW}px`, '--bar-h': `${BAR_H}px`, '--strip': `${STRIP}px` }}
    >
      <header className="appbar">
        <div className="appbar-lead">
          <button type="button" className="wordmark wordmark-btn" onClick={goHome} title="Home">
            SynthPath
          </button>
          <button
            type="button"
            className="pane-toggle"
            aria-pressed={drawOpen}
            aria-label={toggleLabel}
            title={toggleLabel}
            onClick={() => (drawOpen ? setDrawOpen(false) : openDraw())}
          >
            <SidebarSimple size={18} weight={drawOpen ? 'fill' : 'regular'} aria-hidden="true" />
            <span aria-hidden="true">{toggleLabel}</span>
          </button>
        </div>
        {/* The homescreen has the search at full size in its hero, so the bar carries none of its own there. */}
        {!home && <SearchForm {...searchProps} onImage={() => setImageOpen(true)} />}
      </header>

      <div className="notebook">
        {home ? (
          <Home
            search={<SearchForm {...searchProps} variant="hero" />}
            onRun={runExample}
            onDraw={() => openDraw()}
            onImage={() => setImageOpen(true)}
          />
        ) : (
          <main className="wrap bench">
            {phase === 'error' && (
              <div className="panel error" role="alert">
                <p className="loading-title">No match for &ldquo;{query}&rdquo;</p>
                <p className="muted">{error}</p>
              </div>
            )}
            {busy && <Loading phase={phase} kind={runKind} />}

            {target && (
              <aside className="rail">
                <TargetCard target={target} onDraw={() => openDraw(target.smiles)} />
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
                  onOpenInDraw={openDraw}
                  indexStats={target?.search?.analog_index}
                />

                {costs[route.id] ? (
                  <CostSheet
                    cost={costs[route.id]}
                    targetG={targetG}
                    setTargetG={setTargetG}
                    purification={purification}
                    setPurification={setPurification}
                  />
                ) : (
                  <section className="panel cost" aria-labelledby="cost-title">
                    <h2 id="cost-title">Bill of materials</h2>
                    <p className="muted">
                      {costs[route.id] === null
                        ? 'The bill of materials could not be computed. If the backend restarted, run the search again.'
                        : 'Working out the bill of materials…'}
                    </p>
                  </section>
                )}

                <RankerPanel />

                <ModelPanel />
              </div>
            )}
          </main>
        )}
      </div>

      <ImagePanel
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        busy={busy}
        onSearch={({ smiles, inchikey }) => {
          setImageOpen(false)
          setQuery(smiles)
          run(smiles, 'smiles', { inchikey, source: 'Read from an image by DECIMER, confirmed by you' })
        }}
      />
      <DrawPane
        open={drawOpen}
        side={wide}
        width={paneW}
        onWidth={resizeDraw}
        busy={busy}
        onSearch={({ smiles, inchikey }) => {
          // Beside the results the drawing stays open; covering the window, it gets out of the way.
          if (!wide) setDrawOpen(false)
          setQuery(smiles)
          run(smiles, 'smiles', { inchikey, source: 'Drawn in Octet Draw' })
        }}
      />
    </div>
  )
}
