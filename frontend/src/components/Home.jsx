// The homescreen: what SynthPath does, where to start (type, draw or read an image), the saved example targets, the
// evidence tiers, and where each value on the results comes from. Every figure here is read from the backend (or from
// demo.json, which scripts/make_mock_data.py wrote from RDKit and AiZynthFinder output); missing ones show as —.
import { Fragment, useEffect, useState } from 'react'
import { ImageSquare, PencilSimple } from '@phosphor-icons/react'
import demo from '../mock/demo.json'
import late from '../mock/late_targets.json'
import * as api from '../api'
import { Mock, Mol, TierBadge } from './bits'
import './home.css'

const hydrate = (c) => ({ ...c, svg: c.svg ?? demo.compounds[c.smiles]?.svg ?? null })
// demo.json's five, then the ones added after it was written (late_targets.json). The live backend
// answers all of them from its precomputed payloads; the USE_MOCK path only carries demo.json's.
const EXAMPLES = [...demo.targets, ...late.targets].map((t) => ({ name: t.name, compound: hydrate(t.compound) }))

// The last step of the first saved route for the first example target: what a step on the results looks like.
const SAMPLE = (() => {
  const t = demo.targets[0]
  const s = t?.routes?.[0]?.steps?.at(-1)
  if (!s) return null
  return { target: t.name, step: { ...s, reactants: s.reactants.map(hydrate), product: hydrate(s.product) } }
})()

const count = (v) => (v == null ? '—' : Number(v).toLocaleString('en-US'))
const num = (v, digits = 3) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(digits))

// GET /api<path> as JSON: undefined while it loads, null if the backend does not answer or has nothing there.
function useBackend(path) {
  const [v, setV] = useState(undefined)
  useEffect(() => {
    let live = true
    fetch(`/api${path}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setV(d))
      .catch(() => live && setV(null))
    return () => {
      live = false
    }
  }, [path])
  return v
}

function SampleStep({ onRun }) {
  if (!SAMPLE) return null
  const { step, target } = SAMPLE
  return (
    <figure className="home-sample">
      <div className="home-sample-scheme">
        <div className="home-sample-in">
          {step.reactants.map((m, i) => (
            <Fragment key={m.smiles}>
              {i > 0 && (
                <span className="plus" aria-hidden="true">
                  +
                </span>
              )}
              <Mol compound={m} size="sm" />
            </Fragment>
          ))}
        </div>
        <div className="home-sample-arrow">
          <TierBadge tier={step.evidence.tier} size="sm" />
          <svg className="rxn-arrow" viewBox="0 0 80 12" aria-hidden="true">
            <line x1="0" y1="6" x2="72" y2="6" />
            <path d="M80 6 L70 1 L70 11 Z" />
          </svg>
          <span className="small muted">
            <span className="num">{count(step.evidence.precedent_count)}</span> precedents
          </span>
        </div>
        <Mol compound={step.product} size="md" caption={target} />
      </div>
      <figcaption className="small muted">
        The last step of route 1 in the saved {target} search. The precedent count is that template&rsquo;s, from
        AiZynthFinder.{' '}
        <button type="button" className="link-btn" onClick={() => onRun(target)}>
          Run this search
        </button>
      </figcaption>
    </figure>
  )
}

function BackendStatus({ health }) {
  if (api.USE_MOCK) return <p className="home-status">Mockup: searches replay the saved example targets.</p>
  if (health === undefined) return <p className="home-status">Checking the backend…</p>
  if (health?.status === 'ok') return <p className="home-status is-ok">Backend connected. Searches run live.</p>
  return <p className="home-status is-bad">The backend is not answering, so searches will fail and figures show —.</p>
}

export default function Home({ search, onRun, onDraw, onImage }) {
  const health = useBackend('/health')
  const analogs = useBackend('/analogs/metrics')
  const cal = useBackend('/calibration/metrics')
  const val = useBackend('/validation/metrics')

  const sources = [
    {
      what: 'Structure, molar mass, InChIKey',
      from: 'RDKit, computed from the structure you give.',
    },
    {
      what: 'Name or CAS number to structure',
      from: 'Octet’s offline name reader first, then PubChem for anything it cannot read.',
    },
    {
      what: 'Routes and template precedents',
      from: 'AiZynthFinder, working backward with reaction templates taken from US patents.',
    },
    {
      what: 'Recorded procedures and analog yields',
      from: analogs?.source ?? 'Open Reaction Database',
      fig: (
        <>
          <span className="num">{count(analogs?.index_reactions)}</span> reactions indexed
        </>
      ),
    },
    {
      what: 'Plausibility score',
      from: 'Our LightGBM classifier on reaction fingerprints, with isotonic calibration.',
      fig: (
        <>
          ROC-AUC <span className="num">{num(cal?.calibrated?.roc_auc)}</span> on{' '}
          <span className="num">{count(cal?.test_n)}</span> held-out reactions;{' '}
          <span className="num">{num(val?.roc_auc)}</span> against real recorded outcomes, where 0.5 is chance.
        </>
      ),
    },
    {
      what: 'Prices',
      from: (
        <>
          Supplier list prices, with the date each was read. A material without one carries the <Mock what="Price" />{' '}
          tag.
        </>
      ),
    },
    {
      what: 'Step explanations',
      from: 'An LLM writes the prose only, from records already retrieved. A guard blocks any SMILES, quantity with a unit or DOI in what it writes.',
    },
  ]

  return (
    <main className="wrap home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="home-eyebrow">Retrosynthesis, grounded in the record</p>
          <h1 id="home-title" className="home-title">
            Synthesis routes with the evidence behind every step.
          </h1>
          <p className="home-lede">
            Give SynthPath a target molecule. It works backward to materials you can buy, tells you which steps are on
            record, which are analogous and which are only computed, and prices out what you need for the amount you
            want.
          </p>
          {search}
          <div className="home-alt">
            <span className="muted small">Or start from a structure</span>
            <button type="button" className="btn home-alt-btn" onClick={onDraw}>
              <PencilSimple size={18} aria-hidden="true" />
              Draw it
            </button>
            <button type="button" className="btn home-alt-btn" onClick={onImage}>
              <ImageSquare size={18} aria-hidden="true" />
              Read it from an image
            </button>
          </div>
        </div>
        <SampleStep onRun={onRun} />
      </section>

      <section className="home-examples" aria-labelledby="examples-title">
        <div className="home-section-head">
          <h2 id="examples-title">Example targets</h2>
          <p className="muted small">
            {api.USE_MOCK ? 'Saved searches in this mockup.' : 'Each one runs a live AiZynthFinder search.'}
          </p>
        </div>
        <ul className="home-example-list">
          {EXAMPLES.map((t) => (
            <li key={t.name}>
              <button type="button" className="home-example" onClick={() => onRun(t.name)}>
                <Mol compound={t.compound} size="sm" />
                <span className="home-example-name">{t.name}</span>
                <span className="small muted">
                  <span className="num">{t.compound.mw.toFixed(2)}</span> g/mol
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="home-grid">
        <section className="panel home-tiers" aria-labelledby="tiers-title">
          <div className="panel-head">
            <h2 id="tiers-title">Every step carries an evidence tier</h2>
            <p className="muted small">How much of the literature stands behind it, decided by code.</p>
          </div>
          <dl className="home-tier-list">
            <div>
              <dt>
                <TierBadge tier="REPORTED" />
              </dt>
              <dd>The corpus holds a record of this exact reaction: the same reactants and the same product.</dd>
            </div>
            <div>
              <dt>
                <TierBadge tier="ANALOGOUS" />
              </dt>
              <dd>
                The reaction template behind the step has <span className="num">{api.ANALOGOUS_MIN}</span> or more
                precedents in the literature.
              </dd>
            </div>
            <div>
              <dt>
                <TierBadge tier="COMPUTED" />
              </dt>
              <dd>
                The template applies, but it has fewer than <span className="num">{api.ANALOGOUS_MIN}</span> precedents
                or the step scores low on plausibility.
              </dd>
            </div>
          </dl>
          <p className="muted small">
            A step with nothing behind it is never called new. It is one for which the corpus holds no precedent.
          </p>
        </section>

        <section className="panel home-sources" aria-labelledby="sources-title">
          <div className="panel-head">
            <h2 id="sources-title">Where each value comes from</h2>
            <BackendStatus health={health} />
          </div>
          <dl className="home-source-list">
            {sources.map((s) => (
              <div key={s.what}>
                <dt>{s.what}</dt>
                <dd>
                  {s.from}
                  {s.fig && <span className="home-fig">{s.fig}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="muted small">Where a value is not on record, the results show — instead of an estimate.</p>
        </section>
      </div>
    </main>
  )
}
