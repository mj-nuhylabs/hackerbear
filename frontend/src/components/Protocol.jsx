import { sig } from '../lib/format'
import CompoundName from './CompoundName'
import './procedure.css'

// The step-by-step sheet for running this step **at our scale**. A model does not write the sentences:
//   amounts     values converted from the record's equivalents by evidence/adapt.py (liquids as volume via chem/density.py)
//   order       the order in which the record lists inputs -- substrate, reagent, catalyst, solvent
//   conditions  that one record (evidence/provenance.conditions_from)
//   workup      verbatim -- nothing in it can be converted
// What is missing is stated as missing. We do not fill it with a plausible value (absolute rule 3).
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
  // A step with no sheet is not left blank. We say why -- the fact that no record has ever used this reaction
  // is itself information a chemist needs (backend/evidence/procedures.adapts_to)
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
      {/* A sheet carried over from a record with a different substrate. First say that it is not a precedent for this reaction */}
      {an && (
        <p className="protocol-analog small">
          This is not a record of this reaction. It is{' '}
          <strong className="num">{sig(an.similarity * 100, 2)}%</strong> similar — the same transformation written up
          for a different substrate, with its amounts rescaled to yours by equivalents. The conditions and the work-up
          are that substrate&apos;s, so treat them as a starting point and expect to re-optimise.
          {an.patent ? ` Record: ${an.patent}.` : ''}
        </p>
      )}
      {/* The multiple relative to the scale the record ran. Scaling 50 mg up to 1 g makes every amount 20x */}
      {protocol.record_scale_mmol > 0 && here / protocol.record_scale_mmol >= 5 && (
        <p className="protocol-scaleup muted small">
          This record was run at {sig(protocol.record_scale_mmol)} mmol. Everything below is that run multiplied by{' '}
          <strong className="num">{sig(here / protocol.record_scale_mmol, 2)}×</strong> — a reagent used in large
          excess on a small scale becomes a large volume here, and the work-up was not written for it.
        </p>
      )}
      {/* The reverse direction is the same problem. Scaling a 1 mol procedure down to 9 mmol makes the catalyst 1 µL, and a separation
          meant to be collected by vacuum distillation is not the same operation at this amount */}
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
