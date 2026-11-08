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
  const byVolume =
    a.volume_ml != null && (a.measured_by_density || a.volume_recorded || a.mass_mg == null)
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
  // 시트가 없는 스텝은 비워 두지 않는다. 왜 없는지 적는다 — 레코드가 이 반응을 쓴 적이 없다는
  // 사실 자체가 화학자가 알아야 할 정보다 (backend/evidence/procedures.adapts_to)
  if (!protocol?.charges?.length) {
    if (!protocol?.no_sheet_because) return null
    return (
      <div className="proc protocol protocol-absent">
        <div className="proc-head">
          <h3>No bench sheet for this step</h3>
        </div>
        <p className="muted small">
          The corpus has no written preparation this step can be run from: {protocol.no_sheet_because}. The closest
          records are below — read them as a starting point, not as a procedure for this reaction.
        </p>
      </div>
    )
  }
  const here = (protocol.scale_mmol ?? 1) * factor
  const an = protocol.from_analog

  return (
    <div className="proc protocol">
      <div className="proc-head">
        <h3>Run this at your scale</h3>
        <span className="muted small">
          {sig(here)} mmol{targetG ? ` · for ${targetG} g of product` : ''}
        </span>
      </div>
      {/* 다른 기질의 레코드에서 옮겨 온 시트. 이 반응의 선례가 아니라는 것을 먼저 말한다 */}
      {an && (
        <p className="protocol-analog small">
          This is not a record of this reaction. It is{' '}
          <strong className="num">{sig(an.similarity * 100, 2)}%</strong> similar — the same transformation written up
          for a different substrate, with its amounts rescaled to yours by equivalents. The conditions and the work-up
          are that substrate&apos;s, so treat them as a starting point and expect to re-optimise.
          {an.patent ? ` Record: ${an.patent}.` : ''}
        </p>
      )}
      {/* 레코드가 돌린 규모와의 배수. 50 mg짜리를 1 g으로 올리면 모든 양이 20배가 된다 */}
      {protocol.record_scale_mmol > 0 && here / protocol.record_scale_mmol >= 5 && (
        <p className="protocol-scaleup muted small">
          This record was run at {sig(protocol.record_scale_mmol)} mmol. Everything below is that run multiplied by{' '}
          <strong className="num">{sig(here / protocol.record_scale_mmol, 2)}×</strong> — a reagent used in large
          excess on a small scale becomes a large volume here, and the work-up was not written for it.
        </p>
      )}
      {/* 반대 방향도 같은 문제다. 1 mol 제법을 9 mmol로 내리면 촉매가 1 µL가 되고, 감압 증류로
          거두게 되어 있던 분리가 이 양에서는 같은 조작이 아니다 */}
      {protocol.record_scale_mmol > 0 && protocol.record_scale_mmol / here >= 5 && (
        <p className="protocol-scaleup muted small">
          This record was run at {sig(protocol.record_scale_mmol)} mmol. Everything below is that run scaled down{' '}
          <strong className="num">{sig(protocol.record_scale_mmol / here, 2)}×</strong> — a catalyst charge this small
          is hard to measure out accurately, and an isolation written for that much material is not the same operation
          at this one.
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
