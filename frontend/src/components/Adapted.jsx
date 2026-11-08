import { DASH, sig } from '../lib/format'
import './procedure.css'

// Recorded procedures rescaled to this step. Every number in the table is either written in the
// source record (equivalents come from its recorded amounts) or arithmetic on it: our mmol =
// recorded equiv × our mmol of the limiting substrate, mass = mmol × MW of our molecule
// (backend/evidence/adapt.py). The procedure text is the source's own, never rewritten.

function qty(row, k) {
  const v = row[k]
  if (v == null) return DASH
  if (k === 'mass_mg') return v >= 1000 ? `${sig(v / 1000)} g` : `${sig(v)} mg`
  if (k === 'volume_ml') return `${sig(v)} mL`
  return sig(v)
}

function Table({ table, factor }) {
  if (!table?.rows?.length) return null
  const scaled = (row, k) => (row[k] == null ? null : row[k] * factor)
  return (
    <div className="proc-table-wrap">
      <table className="proc-table">
        <thead>
          <tr>
            <th scope="col">Input</th>
            <th scope="col" className="r">Equiv</th>
            <th scope="col" className="r">mmol</th>
            <th scope="col" className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              <td>
                <div className="proc-mat">
                  <span className="proc-name">
                    {r.is_substrate ? 'Your substrate' : (r.recorded_name ?? r.label ?? DASH)}
                    {r.is_substrate && r.pair_similarity != null && (
                      <span className="muted small"> (recorded one: Tanimoto {r.pair_similarity} to yours)</span>
                    )}
                    {r.no_recorded_counterpart && (
                      <span className="muted small"> — the record has no counterpart for it, so no amount</span>
                    )}
                    {r.unmatched_substrate && (
                      <span className="muted small"> — a substrate of the record, unlike any of yours</span>
                    )}
                  </span>
                  {(r.is_substrate ? r.our_smiles : r.recorded_smiles) && (
                    <code className="proc-smiles">{r.is_substrate ? r.our_smiles : r.recorded_smiles}</code>
                  )}
                </div>
              </td>
              <td className="r">{r.equiv != null ? sig(r.equiv) : DASH}</td>
              <td className="r">{r.mmol != null ? sig(scaled(r, 'mmol')) : DASH}</td>
              <td className="r">
                {r.mass_mg != null
                  ? qty({ mass_mg: scaled(r, 'mass_mg') }, 'mass_mg')
                  : r.volume_ml != null
                    ? qty({ volume_ml: scaled(r, 'volume_ml') }, 'volume_ml')
                    : DASH}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {table.unscaled_inputs?.length > 0 && (
        <p className="proc-note muted small">
          Not stated as an amount in the record, so not scaled: {table.unscaled_inputs.filter(Boolean).join(', ')}.
          The text below may give it.
        </p>
      )}
    </div>
  )
}

function Source({ item }) {
  return (
    <span className="proc-src">
      <code>{item.reaction_id}</code>
      {item.patent && <span className="muted">{item.patent}</span>}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer">
          source ↗
        </a>
      )}
    </span>
  )
}

export default function Adapted({ step, scaleMol }) {
  const recorded = (step.recorded_records ?? []).filter((r) => r.table)
  const adapted = step.adapted_procedures ?? []
  if (!recorded.length && !adapted.length) return null
  const mmolHere = scaleMol != null ? scaleMol * 1000 : 1
  const factor = mmolHere // tables are per 1 mmol of the limiting substrate
  const byModel = step.adapted_order === 'model_a'

  return (
    <div className="proc">
      {recorded.length > 0 && (
        <>
          <div className="proc-head">
            <h3>
              Recorded for this reaction{' '}
              <span className="proc-match proc-match-exact">REPORTED</span>
            </h3>
          </div>
          <p className="muted small">
            {recorded.length} record{recorded.length > 1 ? 's' : ''} of this exact reaction. Amounts are the recorded
            ones, rescaled to {sig(mmolHere)} mmol — the scale this step needs.
          </p>
          {recorded.slice(0, 2).map((r) => (
            <details key={r.reaction_id} className="proc-adapted" open={recorded.length === 1}>
              <summary>
                <Source item={r} />
                {r.yield_pct != null && <span className="muted small"> · recorded yield {r.yield_pct}%</span>}
              </summary>
              <Table table={r.table} factor={factor} />
              {r.procedure?.text && <blockquote className="proc-text">{r.procedure.text}</blockquote>}
            </details>
          ))}
        </>
      )}

      {adapted.length > 0 && (
        <>
          <div className="proc-head">
            <h3>
              Adapted from similar recorded reactions{' '}
              <span className="proc-match proc-match-product">ANALOGOUS</span>
            </h3>
          </div>
          <p className="muted small">
            {byModel
              ? 'Ordered by Model A, trained to pick the record whose conditions were actually used for substrates like this one. '
              : 'Ordered by reaction similarity — Model A has not been trained yet. '}
            Each record was run on a different substrate. Its recorded equivalents are rescaled to your substrates at{' '}
            {sig(mmolHere)} mmol; its conditions are not reported for this one.
          </p>
          {adapted.map((a, i) => (
            <details key={a.reaction_id} className="proc-adapted" open={i === 0}>
              <summary>
                <b>#{i + 1}</b> <Source item={a} />
                <span className="muted small">
                  {' '}
                  · similarity {a.similarity}
                  {byModel && a.similarity_rank !== i ? ` (was #${a.similarity_rank + 1} by similarity)` : ''}
                </span>
              </summary>
              <p className="muted small">
                Recorded reaction: <code className="proc-smiles">{a.analog_rxn}</code>
              </p>
              <Table table={a.table} factor={factor} />
              {a.table?.text && (
                <>
                  <p className="proc-verbatim">Verbatim from the source record — written for its own substrate.</p>
                  <blockquote className="proc-text">{a.table.text}</blockquote>
                </>
              )}
            </details>
          ))}
        </>
      )}
    </div>
  )
}
