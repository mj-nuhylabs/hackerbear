import { sig } from '../lib/format'
import CompoundName from './CompoundName'
import './procedure.css'

// 이 스텝을 **우리 규모로** 돌리는 순서표. 문장을 모델이 쓰지 않는다:
//   양   evidence/adapt.py가 레코드의 당량으로 환산한 값 (액체는 chem/density.py로 부피)
//   순서 레코드가 입력을 적어 둔 순서 — 기질, 시약, 촉매, 용매
//   조건 그 레코드 하나 (evidence/provenance.conditions_from)
//   후처리 원문 그대로 — 환산할 수 있는 게 없다
// 없는 값은 없다고 적는다. 그럴듯한 값으로 채우지 않는다 (절대 규칙 3).
const mass = (mg) => (mg >= 1000 ? `${sig(mg / 1000)} g` : `${sig(mg)} mg`)
const vol = (ml) => (ml < 1 ? `${sig(ml * 1000)} µL` : `${sig(ml)} mL`)
const hours = (h) => (h < 1 ? `${sig(h * 60)} min` : `${sig(h)} h`)

function Charge({ c, factor }) {
  const a = c.amount
  if (!a) {
    return (
      <li>
        <span className="protocol-verb">Charge</span> <CompoundName name={c.name} smiles={c.smiles} showSmiles={false} />{' '}
        <span className="muted small">— {c.note}</span>
      </li>
    )
  }
  // by volume when a density let us convert a mass, and also when the record only ever gave a
  // volume — a solvent with no density on record still has to appear as the millilitres it is
  const byVolume = a.volume_ml != null && (a.measured_by_density || a.mass_mg == null)
  const amount = byVolume ? vol(a.volume_ml * factor) : a.mass_mg != null ? mass(a.mass_mg * factor) : null
  return (
    <li>
      <span className="protocol-verb">{byVolume ? 'Measure' : 'Weigh'}</span>{' '}
      <CompoundName name={c.name} smiles={c.smiles} showSmiles={false} />{' '}
      {amount && <strong className="num">{amount}</strong>}
      <span className="muted small">
        {a.mmol != null ? ` · ${sig(a.mmol * factor)} mmol` : ''}
        {a.equiv != null ? ` · ${sig(a.equiv)} equiv` : ''}
        {byVolume && a.mass_mg != null ? ` · ${mass(a.mass_mg * factor)}` : ''}
        {c.role && c.role !== 'REACTANT' ? ` · ${c.role.toLowerCase()}` : ''}
      </span>
    </li>
  )
}

export default function Protocol({ protocol, factor, targetG }) {
  if (!protocol?.charges?.length) return null
  const here = (protocol.scale_mmol ?? 1) * factor

  return (
    <div className="proc protocol">
      <div className="proc-head">
        <h3>Run this at your scale</h3>
        <span className="muted small">
          {sig(here)} mmol{targetG ? ` · for ${targetG} g of product` : ''}
        </span>
      </div>
      {/* 레코드가 돌린 규모와의 배수. 50 mg짜리를 1 g으로 올리면 모든 양이 20배가 된다 */}
      {protocol.record_scale_mmol > 0 && here / protocol.record_scale_mmol >= 5 && (
        <p className="protocol-scaleup muted small">
          This record was run at {sig(protocol.record_scale_mmol)} mmol. Everything below is that run multiplied by{' '}
          <strong className="num">{sig(here / protocol.record_scale_mmol, 2)}×</strong> — a reagent used in large
          excess on a small scale becomes a large volume here, and the work-up was not written for it.
        </p>
      )}
      <ol className="protocol-steps">
        {protocol.charges.map((c, i) => (
          <Charge key={`${c.smiles ?? c.name}-${i}`} c={c} factor={factor} />
        ))}
        <li>
          <span className="protocol-verb">Hold</span>{' '}
          {protocol.temperature_c != null ? (
            <strong className="num">{sig(protocol.temperature_c)} °C</strong>
          ) : (
            <span className="muted">at a temperature this record does not state</span>
          )}
          {protocol.time_h != null ? (
            <>
              {' for '}
              <strong className="num">{hours(protocol.time_h)}</strong>
            </>
          ) : (
            <span className="muted small"> · no time on record</span>
          )}
        </li>
        {protocol.workup && (
          <li>
            <span className="protocol-verb">Work up</span> <span className="protocol-quote">{protocol.workup}</span>
          </li>
        )}
      </ol>
      <p className="muted small">
        Amounts are the record&apos;s own equivalents at {sig(here)} mmol — a liquid by volume where its supplier page
        states a density, a solid by mass. The order is the order the record lists its inputs, and the work-up is the
        source&apos;s own words, since none of it can be recomputed for another scale.
        {protocol.missing?.length > 0 && (
          <> This record states no {protocol.missing.join(', no ')}, so none is shown.</>
        )}
      </p>
    </div>
  )
}
