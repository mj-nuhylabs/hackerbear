import { useEffect, useState } from 'react'
import { DASH, sig } from '../lib/format'
import './analogs.css'

// Every value in this panel is either written in an ORD record or computed from one.
// Similarity is the Tanimoto of DRFP bits -- a code-computed value, not a score assigned by a model.

// Display label. The threshold used for yield is YIELD_MIN_SIMILARITY (0.6) in evidence/analogs.py; below that
// range, measurement shows a fixed 70% is more accurate -- Accuracy reads that number from the backend and shows it.
const BANDS = [
  [0.8, 'near-identical'],
  [0.6, 'close'],
  [0.4, 'related'],
  [0, 'weak'],
]
const bandOf = (s) => BANDS.find(([lo]) => s >= lo)[1]

const pctRange = (a) => {
  if (a.yield_median == null) return null
  const mid = `${Math.round(a.yield_median)}%`
  // If the same reaction was run several times, show the spread too. With one run, it is just that value.
  if (a.yield_min == null || a.yield_max == null || Math.round(a.yield_min) === Math.round(a.yield_max))
    return mid
  return `${mid} (${Math.round(a.yield_min)}–${Math.round(a.yield_max)}%, ${a.n_yields} runs)`
}

function Analog({ a }) {
  const y = pctRange(a)
  const src = a.reaction_ids?.[0]
  return (
    <li className="ana-row">
      <div className="ana-sim" title={`Tanimoto similarity on DRFP bits: ${a.similarity}`}>
        <span className="ana-sim-val">{a.similarity.toFixed(2)}</span>
        <span className="ana-sim-bar">
          <span className="ana-sim-fill" style={{ width: `${Math.max(2, a.similarity * 100)}%` }} />
        </span>
        <span className="ana-sim-tag">{bandOf(a.similarity)}</span>
      </div>
      <div className="ana-body">
        <p className="ana-rxn">{a.rxn_smiles}</p>
        <p className="ana-facts">
          <span>
            Yield <b>{y ?? DASH}</b>
          </span>
          <span>
            Temperature <b>{a.temperature_c != null ? `${sig(a.temperature_c)} °C` : DASH}</b>
          </span>
          <span>
            Time <b>{a.time_h != null ? `${sig(a.time_h)} h` : DASH}</b>
          </span>
          {a.n_records > 1 && <span className="ana-spread">{a.n_records} records</span>}
        </p>
        <p className="ana-src">
          {src && <code>{src}</code>}
          {a.patent && <code>{a.patent}</code>}
          {a.organization && <span className="muted">{a.organization}</span>}
          {a.url && (
            <a href={a.url} target="_blank" rel="noreferrer">
              source ↗
            </a>
          )}
        </p>
      </div>
    </li>
  )
}

// The yield error is read straight from what the backend measured. The reason we do not hardcode the sentence is the same as in ModelPanel --
// rebuilding the index changes the numbers, and then the sentence has to change with them.
function Accuracy({ topSimilarity }) {
  const [m, setM] = useState(undefined)
  useEffect(() => {
    let live = true
    fetch('/api/analogs/metrics')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && setM(d))
      .catch(() => live && setM(null))
    return () => {
      live = false
    }
  }, [])
  if (!m) return null
  const band = m.bands?.find((b) => topSimilarity >= b.from && topSimilarity < b.to)
  if (!band) return null
  return (
    <p className="ana-foot">
      Measured on {m.queries.toLocaleString()} held-out reactions: in this similarity range the analog
      yield is off by <b>{band.analog_mae}</b> percentage points on average, against{' '}
      <b>{band.flat_mae}</b> for the flat {m.flat_assumption_pct}% assumption
      {band.winner === 'analog' ? '' : ', so the flat assumption is used here instead'}. Read a shown
      yield as a range, not a figure.
    </p>
  )
}

export default function Analogs({ analogs, indexStats }) {
  if (!indexStats) {
    return (
      <div className="ana">
        <div className="ana-head">
          <h3>Closest recorded reactions</h3>
        </div>
        <p className="ana-none">
          The analog index is not built, so no lookup ran. This is not the same as finding nothing — run{' '}
          <code>scripts/build_analog_index.py</code> to switch it on.
        </p>
      </div>
    )
  }
  if (!analogs?.length) {
    return (
      <div className="ana">
        <div className="ana-head">
          <h3>Closest recorded reactions</h3>
        </div>
        <p className="ana-none">
          Nothing in the corpus resembles this step closely enough to show. The corpus holds no precedent
          for it — that is a statement about the corpus, not about the chemistry.
        </p>
      </div>
    )
  }
  return (
    <div className="ana">
      <div className="ana-head">
        <h3>Closest recorded reactions</h3>
        <p className="muted small">
          {indexStats.reactions.toLocaleString()} reactions indexed, ranked by structural similarity
        </p>
      </div>
      <ul className="ana-list">
        {analogs.map((a) => (
          <Analog key={a.reaction_ids?.[0] ?? a.rxn_smiles} a={a} />
        ))}
      </ul>
      <Accuracy topSimilarity={analogs[0].similarity} />
      <p className="ana-foot">
        Records come from the Open Reaction Database (CC BY-SA 4.0). Similarity is Tanimoto over DRFP
        bits, computed here — nothing on this panel is written by a model.
      </p>
    </div>
  )
}
