import { DASH, sig } from '../lib/format'
import './procedure.css'

// 이 패널의 값은 전부 ORD 레코드에 적힌 것이거나 그것으로 계산한 것이다.
// 절차문은 원문 그대로다 — 요약도 재작성도 하지 않는다.

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

// ORD는 질량·몰수·부피를 따로 싣는다. 있는 것만 보여준다
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
                <div className="proc-mat">
                  <span className="proc-name">{r.name ?? r.label}</span>
                  {r.smiles && <code className="proc-smiles">{r.smiles}</code>}
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

// 시약 표가 있을 때만 해당하는 설명. 표가 없으면 할 말이 없다.
function AmountsNote() {
  return (
    <p className="proc-note muted small">
      Amounts are as written in the record. Equivalents are worked out from those amounts, using molar masses computed
      from the structures — where the record gives only a volume, there is no density to go on and the column stays
      empty.
    </p>
  )
}

// 출처 표기는 시약 표와 무관하게 항상 띄운다.
// 전에는 AmountsNote에 붙어 있어서 시약이 없는 레코드에서는 **원문을 인용하면서 출처를 안 밝혔다.**
// 지금 데이터에서는 안 걸리지만(41/41, 라이브 2/2 모두 시약 있음) 조건이 틀린 모양이었다.
// 남의 문장을 그대로 보여주면 출처를 밝힌다 — 시약 표가 우연히 있어서가 아니라.
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

export default function Procedure({ procedure }) {
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
      {procedure.reagents?.length > 0 && <AmountsNote />}

      {procedure.text && (
        <>
          <p className="proc-verbatim">Verbatim from the source record — not written or summarised by a model.</p>
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
