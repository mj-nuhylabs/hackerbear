import { DASH, sig } from '../lib/format'
import CompoundName from './CompoundName'
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

// Below 1 mL, use µL. A 0.0007 L volume written as "0.0007 mL" cannot be picked up with a pipette
const mL = (v) => (v == null ? DASH : v < 1 ? `${sig(v * 1000)} µL` : `${sig(v)} mL`)

// What the record was run at, against what this step needs. Without it the verbatim text ("0.0072
// moles of salicylic acid") sits beside a table saying 8.11 mmol and nothing connects the two, so
// it reads as though a small charge were making a larger one.
function ScaleNote({ table, factor }) {
  const was = table?.limiting_recorded_mmol
  if (was == null || !factor) return null
  const k = (factor * (table.scale_mmol || 1)) / was
  return (
    <p className="proc-scale muted small">
      The record was run at <span className="num">{sig(was)}</span> mmol of its limiting substrate. Your step needs{' '}
      <span className="num">{sig(factor * (table.scale_mmol || 1))}</span> mmol, so every amount below is the
      record&apos;s own, multiplied by <span className="num">{sig(k, 2)}</span>.
    </p>
  )
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
                  {/* This line only says "whose is it". The name and structure are written once, by CompoundName below */}
                  <span className="proc-name">
                    {r.is_substrate ? 'Your substrate' : ''}
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
                    // The structure on the substrate row is **ours**. A name the record lists is the record's compound
                    // name, so it must not be attached to that row -- there the namer reads our structure
                    <CompoundName
                      name={r.is_substrate ? null : r.recorded_name}
                      smiles={r.is_substrate ? r.our_smiles : r.recorded_smiles}
                    />
                  )}
                </div>
              </td>
              <td className="r">{r.equiv != null ? sig(r.equiv) : DASH}</td>
              <td className="r">{r.mmol != null ? sig(scaled(r, 'mmol')) : DASH}</td>
              {/* Liquids are measured out -- if the density is on the record/product page, put mL first and add the mass
                  in parentheses (backend/chem/density.py). Solids keep the mass as is. */}
              <td className="r">
                {r.measure_ml != null && r.mass_mg != null ? (
                  <>
                    <span className="num">{mL(scaled(r, 'measure_ml'))}</span>
                    <span className="muted small"> ({qty({ mass_mg: scaled(r, 'mass_mg') }, 'mass_mg')})</span>
                  </>
                ) : r.mass_mg != null ? (
                  qty({ mass_mg: scaled(r, 'mass_mg') }, 'mass_mg')
                ) : r.volume_ml != null ? (
                  qty({ volume_ml: scaled(r, 'volume_ml') }, 'volume_ml')
                ) : (
                  DASH
                )}
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
                {r.procedure?.text && r.experimental === false && (
                  <span className="muted small"> · text is not a procedure</span>
                )}
              </summary>
              <ScaleNote table={r.table} factor={factor} />
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
                {/* backend/evidence/procedures.py — prose and assay methods are sorted last and said so */}
                {a.experimental === false && (
                  <span className="proc-match proc-match-partial" title={a.not_experimental_reason ?? undefined}>
                    NOT A PROCEDURE
                  </span>
                )}
              </summary>
              <p className="muted small">
                Recorded reaction: <code className="proc-smiles">{a.analog_rxn}</code>
              </p>
              <ScaleNote table={a.table} factor={factor} />
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
