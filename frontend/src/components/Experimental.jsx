import { useState } from 'react'
import { sig } from '../lib/format'
import './procedure.css'

// Experimental entry for submission. It follows the standard format of a journal/thesis experimental section and uses values
// converted **to our scale**. A model does not write the sentences -- the assembly rules below are all there is:
//   numbers      values converted from the record's equivalents by evidence/adapt.py (liquids as volume via chem/density.py)
//   order        substrate -> reagent/catalyst -> solvent (evidence/protocol.ROLE_ORDER)
//   conditions   that one record (evidence/provenance.conditions_from)
//   workup       quoted verbatim -- nothing in it can be converted
// What the record lacks (appearance, NMR, HRMS) is left blank and stated as missing. We do not make it up (absolute rule 3).

// Numbers in the submission format carry no trailing zeros -- "25 °C, 4 h, 76%", not "25.0 °C, 4.00 h, 76.0%"
const num = (v) => String(Number(v.toPrecision(4)))
const mass = (mg) => (mg >= 1000 ? `${sig(mg / 1000)} g` : `${sig(mg)} mg`)
const vol = (ml) => (ml < 1 ? `${sig(ml * 1000)} µL` : `${sig(ml)} mL`)
const hours = (h) => (h < 1 ? `${num(h * 60)} min` : `${num(h)} h`)

// One reagent's amount in the submission format: mass for solids, volume for liquids, then mmol and equivalents
function amountOf(c, factor) {
  const a = c.amount
  if (!a) return null
  const byVolume =
    a.volume_ml != null && (a.measured_by_density || a.volume_recorded || a.mass_mg == null)
  const primary = byVolume
    ? vol(a.volume_ml * factor)
    : a.mass_mg != null
      ? mass(a.mass_mg * factor)
      : null
  const bits = [primary]
  if (a.mmol != null) bits.push(`${sig(a.mmol * factor)} mmol`)
  // Solvents take no equivalents. Rounding a catalyst to two decimals would erase the value the record lists --
  // if 0.015 equiv comes out as "0.01 equiv", that is a number the source did not write
  if (a.equiv != null && (c.role || '').toUpperCase() !== 'SOLVENT')
    bits.push(`${a.equiv >= 0.1 ? a.equiv.toFixed(2) : sig(a.equiv, 3)} equiv`)
  return bits.filter(Boolean).join(', ')
}

const withAmount = (c, factor) => {
  const a = amountOf(c, factor)
  return a ? `${c.name ?? 'an unnamed reagent'} (${a})` : `${c.name ?? 'an unnamed reagent'}`
}

const listOf = (parts) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`

function paragraph(protocol, factor) {
  const charges = protocol.charges ?? []
  const role = (c) => (c.role || 'REACTANT').toUpperCase()
  const solvents = charges.filter((c) => role(c) === 'SOLVENT')
  const inputs = charges.filter((c) => role(c) !== 'SOLVENT')
  // The limiting reagent (1.00 equiv) becomes the subject of the sentence
  const limiting = inputs.find((c) => c.amount?.equiv === 1 || c.is_substrate) ?? inputs[0]
  const rest = inputs.filter((c) => c !== limiting)

  const sentences = []
  if (limiting) {
    const inSolvent = solvents.length
      ? ` in ${listOf(solvents.map((c) => withAmount(c, factor)))}`
      : ''
    // The default is "the limiting reagent is already in the flask and the rest is added", but if the record says the opposite
    // (added_last), use that as is. Bax & Stevens add the thiophenol to a premade mixture -- writing it the other way
    // would claim an order the source does not state
    sentences.push(
      !rest.length
        ? `${withAmount(limiting, factor)}${inSolvent} was charged to the flask.`
        : limiting.added_last
          ? `${withAmount(limiting, factor)} was added to ` +
            `${listOf(rest.map((c) => withAmount(c, factor)))}${inSolvent}.`
          : `To ${withAmount(limiting, factor)}${inSolvent} ${rest.length > 1 ? 'were' : 'was'} added ` +
            `${listOf(rest.map((c) => withAmount(c, factor)))}.`,
    )
  }

  // Conditions. If either one is missing, say it is missing -- do not fill in a plausible value
  const t = protocol.temperature_c
  const h = protocol.time_h
  if (t != null && h != null) sentences.push(`The mixture was stirred at ${num(t)} °C for ${hours(h)}.`)
  else if (t != null) sentences.push(`The mixture was stirred at ${num(t)} °C for a time the source does not state.`)
  else if (h != null) sentences.push(`The mixture was stirred for ${hours(h)} at a temperature the source does not state.`)
  else sentences.push('The source states neither a temperature nor a reaction time.')

  if (protocol.workup) {
    sentences.push(protocol.workup)
    // The quoted workup sentence contains an absolute mass **at the original scale** ("138.7 g, 81.5%"). Placed next to our
    // scaled charge amounts, it reads as if this experiment yields that much. The sentence cannot be converted,
    // so we do not edit it; we state which scale the number is from
    const ran = protocol.record_scale_mmol
    const here = (protocol.scale_mmol ?? 1) * factor
    const off = ran > 0 && (here / ran >= 1.5 || here / ran <= 0.67)
    if (off && /\d\s*(?:mg|g|kg)\b/i.test(protocol.workup)) {
      sentences.push(
        `That isolation is the source's own wording for its own run at ${sig(ran)} mmol, so any mass it ` +
          `quotes is that run's and not this one's.`,
      )
    }
  }

  const y = protocol.reported_yield
  const saidAlready = y != null && (protocol.workup ?? '').includes(`${num(y * 100)}%`)
  if (y != null && !saidAlready) {
    sentences.push(
      protocol.expected_g != null
        ? `The source reports a yield of ${num(y * 100)}%, which on this scale is ${sig(protocol.expected_g)} g ` +
          `of ${protocol.product_name ?? 'product'}.`
        : `The source reports a yield of ${num(y * 100)}%.`,
    )
  } else if (y == null) {
    sentences.push('The source reports no yield, so none is stated here.')
  }
  // Capitalize the first letter. Forms that do not start with "To ..." ("thiophenol was added to ...") appeared,
  // and the paragraph started in lowercase
  const text = sentences.join(' ')
  return text ? text[0].toUpperCase() + text.slice(1) : text
}

export default function Experimental({ protocol, factor, targetG }) {
  const [copied, setCopied] = useState(false)
  if (!protocol?.charges?.length) return null
  const here = (protocol.scale_mmol ?? 1) * factor
  const text = paragraph(protocol, factor)
  const title = protocol.product_name ?? 'Title compound'

  const copy = () => {
    navigator.clipboard?.writeText(`${title}\n\n${text}`).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  return (
    <div className="proc experimental">
      <div className="proc-head">
        <h3>Experimental, in submission format</h3>
        <span className="muted small">
          {sig(here)} mmol{targetG ? ` · for ${targetG} g of product` : ''}
        </span>
      </div>
      {protocol.from_analog && (
        <p className="protocol-analog small">
          Written from a record of a different substrate ({sig(protocol.from_analog.similarity * 100, 2)}% similar).
          This is not an experimental section for a reaction anyone has reported — do not submit it as one.
        </p>
      )}
      {/* The same warning as the bench sheet. If only the sheet has it and the paragraph does not, whoever pastes it
          will think these amounts are what the paper actually ran -- on the caffeine side, 34.7 equiv of methyl iodide used at 50 mg
          becomes 16 mL at gram scale */}
      {protocol.record_scale_mmol > 0 && here / protocol.record_scale_mmol >= 5 && (
        <p className="protocol-scaleup muted small">
          The source ran this at {sig(protocol.record_scale_mmol)} mmol. Every quantity above is that run multiplied
          by <strong className="num">{sig(here / protocol.record_scale_mmol, 2)}×</strong>, so a reagent it used in
          large excess at small scale becomes a volume worth reconsidering before you write this up, and its isolation
          was not designed for this much material.
        </p>
      )}
      {/* The scale-down side. Writing a 1 mol literature procedure at g scale is common, and what you need to know before doing it is the same */}
      {protocol.record_scale_mmol > 0 && protocol.record_scale_mmol / here >= 5 && (
        <p className="protocol-scaleup muted small">
          The source ran this at {sig(protocol.record_scale_mmol)} mmol. Every quantity above is that run scaled down{' '}
          <strong className="num">{sig(protocol.record_scale_mmol / here, 2)}×</strong>, so a catalyst charge this
          small is hard to measure out accurately, and an isolation written for that much material is not the same
          operation at this one. Say what you actually did, not what the paper did.
        </p>
      )}
      <p className="exp-title">{title}</p>
      <p className="exp-body">{text}</p>
      {/* A value the source measured for its own material. The label says it is not a value for our material */}
      {protocol.characterisation && (
        <p className="exp-data">
          <span className="exp-data-label">Data reported by the source for its own material: </span>
          {protocol.characterisation}
        </p>
      )}
      <p className="muted small">
        Quantities are this step&apos;s own scale, from the record&apos;s equivalents — a liquid by volume where its
        supplier page states a density, a solid by mass. The work-up sentence is the source&apos;s own wording.{' '}
        {protocol.characterisation
          ? 'The data line is the source\u2019s own measurement of its own material \u2014 a submission needs yours.'
          : 'The record carries no appearance, melting point or spectroscopic data, so none is written above; a submission needs those from your own material.'}
        {protocol.source_id ? ` Source record: ${protocol.source_id}.` : ''}
      </p>
      <button type="button" className="exp-copy" onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
