import { DASH, sig } from '../lib/format'
import CompoundName from './CompoundName'
import './procedure.css'

// Every value in this panel is either written in an ORD record or computed from one.
// The procedure text is verbatim -- no summarizing, no rewriting.

const MATCH = {
  exact: { label: 'SAME REACTION', say: 'This record has the same reactants and the same product as this step.' },
  covered: {
    label: 'SAME REACTION',
    say: 'This record makes the same product from this step’s reactants. It lists further species too — reagents and salts the record writes into the reaction itself.',
  },
  partial: {
    label: 'SHARED REACTANTS',
    say: 'This record makes the same product and shares some, but not all, of this step’s reactants.',
  },
  product: {
    label: 'SAME PRODUCT',
    say: 'This record makes the same product by a different route. The conditions are a starting point, not a precedent for this step.',
  },
}

// ORD lists mass, moles, and volume separately. Show only what is there
function amount(r) {
  const parts = []
  if (r.mass_g != null) parts.push(r.mass_g < 1 ? `${sig(r.mass_g * 1000)} mg` : `${sig(r.mass_g)} g`)
  if (r.volume_l != null) {
    const mL = r.volume_l * 1000
    parts.push(mL < 1 ? `${sig(mL * 1000)} µL` : `${sig(mL)} mL`)
  }
  if (r.moles != null) parts.push(`${sig(r.moles * 1000)} mmol`)
  return parts.length ? parts.join(' · ') : DASH
}

function Reagents({ reagents }) {
  if (!reagents?.length) return null
  return (
    <div className="proc-table-wrap">
      <table className="proc-table">
        <thead>
          <tr>
            <th scope="col">Reagent</th>
            <th scope="col">Role</th>
            <th scope="col" className="r">
              Amount
            </th>
            <th scope="col" className="r">
              Equiv
            </th>
          </tr>
        </thead>
        <tbody>
          {reagents.map((r, i) => (
            <tr key={`${r.smiles ?? r.label}-${i}`}>
              <td>
                {/* If the record gave a name, use it; if not, the namer reads the structure. label is
                    an ORD role name ("Base"), not a name, so use it only when neither exists */}
                <div className="proc-mat">
                  {r.smiles ? (
                    <CompoundName name={r.name} smiles={r.smiles} />
                  ) : (
                    <span className="proc-name">{r.name ?? r.label}</span>
                  )}
                </div>
              </td>
              <td className="proc-role">{r.role ? r.role.toLowerCase().replace(/_/g, ' ') : DASH}</td>
              <td className="r">{amount(r)}</td>
              <td className="r">
                {r.equiv != null ? r.equiv : DASH}
                {r.is_limiting && <span className="proc-limiting">limiting</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// A note that applies only when there is a reagent table. With no table, there is nothing to say.
// This table is at the scale the record ran. "Run this step" just above is at our scale (per 1 g), so unless the two are
// connected it reads like "0.72 mmol makes 8.11 mmol" -- someone really did read it that way.
function AmountsNote({ scaleMmol, ourMmol }) {
  const factor = scaleMmol && ourMmol ? ourMmol / scaleMmol : null
  return (
    <p className="proc-note muted small">
      {scaleMmol != null && (
        <strong className="proc-scale-warn">
          These are the amounts the record itself used, at its own scale of {sig(scaleMmol)} mmol — not the amounts
          for your step.{' '}
          {ourMmol != null && factor != null && (
            <>
              Yours needs {sig(ourMmol)} mmol, which is {sig(factor, 2)}× this. The rescaled amounts are in the table
              further down.{' '}
            </>
          )}
        </strong>
      )}
      Equivalents are worked out from those amounts, using molar masses computed from the structures — where the
      record gives only a volume, there is no density to go on and the column stays empty.
    </p>
  )
}

// The source attribution is always shown, independent of the reagent table.
// It used to hang off AmountsNote, so for records with no reagents it **quoted the original text without naming the source.**
// It does not trigger on the current data (41/41, live 2/2 all have reagents), but the condition was the wrong shape.
// If you show someone else's sentence verbatim, you name the source -- not because a reagent table happens to be there.
function SourceNote() {
  return (
    <p className="proc-note muted small">
      Records come from the{' '}
      <a href="https://open-reaction-database.org/" target="_blank" rel="noreferrer">
        Open Reaction Database
      </a>{' '}
      (CC BY-SA 4.0). Structures and molar masses are computed with RDKit.
    </p>
  )
}

export default function Procedure({ procedure, ourMmol }) {
  if (!procedure) {
    return (
      <div className="proc">
        <div className="proc-head">
          <h3>Procedure</h3>
        </div>
        <p className="proc-none">
          No matching ORD record was found for this step, so there is no written procedure to show. For now the lookup
          covers only the products of the example routes, so for other molecules this does not mean the corpus has
          none. Nothing here is filled in with a typical or estimated value.
        </p>
      </div>
    )
  }

  // backend/evidence/procedures.py: the record's text is not always a preparation. USPTO mining
  // pulls whatever sat in procedure_details, and that can be a patent's background section or an
  // HPLC assay method. Say which it is rather than head it "Procedure" and let a chemist act on it.
  if (procedure.experimental === false) {
    return (
      <div className="proc">
        <div className="proc-head">
          <h3>Recorded text</h3>
          <span className="proc-match proc-match-partial">NOT A PROCEDURE</span>
        </div>
        <p className="proc-none">
          The record for this step carries text, but it {procedure.not_experimental_reason}. It is shown as the
          record wrote it, and it is not a procedure to run. The adapted procedures below come from recorded
          reactions that are.
        </p>
        <blockquote className="proc-text">{procedure.text}</blockquote>
      </div>
    )
  }

  const m = MATCH[procedure.match] ?? MATCH.product
  const facts = [
    ['Temperature', procedure.temperature_c != null ? `${procedure.temperature_c} °C` : null],
    ['Time', procedure.time_h != null ? `${procedure.time_h} h` : null],
    ['Yield', procedure.yield_pct != null ? `${procedure.yield_pct}%` : null],
  ].filter(([, v]) => v)

  return (
    <div className="proc">
      <div className="proc-head">
        <h3>
          Procedure{' '}
          <span className={`proc-match proc-match-${procedure.match}`} title={m.say}>
            {m.label}
          </span>
        </h3>
        <span className="proc-src">
          <code>{procedure.reaction_id}</code>
          {procedure.organization && <span className="muted">{procedure.organization}</span>}
          {procedure.url && (
            <a href={procedure.url} target="_blank" rel="noreferrer">
              source ↗
            </a>
          )}
        </span>
      </div>

      <p className="muted small">{m.say}</p>

      {facts.length > 0 && (
        <div className="proc-facts">
          {facts.map(([k, v]) => (
            <span key={k}>
              {k} <b>{v}</b>
            </span>
          ))}
        </div>
      )}

      <Reagents reagents={procedure.reagents} />
      {procedure.reagents?.length > 0 && (
        <AmountsNote scaleMmol={procedure.limiting_recorded_mmol} ourMmol={ourMmol} />
      )}

      {procedure.text && (
        <>
          {/* The procedure text of an ORD record is verbatim. A hand-transcribed record (scripts/import_scifinder.py)
              is not "verbatim" even when every number comes from the source -- we do not hide that difference */}
          <p className="proc-verbatim">
            {procedure.transcribed
              ? 'Transcribed from the cited source — every quantity is the source’s, but this is not a verbatim extract. Check it against the DOI above.'
              : 'Verbatim from the source record — not written or summarised by a model.'}
          </p>
          <blockquote className="proc-text">{procedure.text}</blockquote>
        </>
      )}

      {procedure.workups?.length > 0 && (
        <>
          <h4>Workup</h4>
          <ol className="proc-workups">
            {procedure.workups.map((w, i) => (
              <li key={i}>
                <span className="wk-type">{w.type ? w.type.toLowerCase().replace(/_/g, ' ') : 'step'}</span>
                {w.details ? ` — ${w.details}` : ''}
                {w.duration_h != null ? ` (${w.duration_h} h)` : ''}
              </li>
            ))}
          </ol>
        </>
      )}

      <SourceNote />
    </div>
  )
}
