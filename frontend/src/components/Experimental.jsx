import { useState } from 'react'
import { sig } from '../lib/format'
import './procedure.css'

// 제출용 실험 항목. 저널/학위논문 experimental section의 표준 서식으로, **우리 규모로** 환산된
// 값으로 쓴다. 문장을 모델이 쓰지 않는다 — 아래 조립 규칙이 전부다:
//   숫자   evidence/adapt.py가 레코드의 당량으로 환산한 값 (액체는 chem/density.py로 부피)
//   순서   기질 → 시약/촉매 → 용매 (evidence/protocol.ROLE_ORDER)
//   조건   그 레코드 하나 (evidence/provenance.conditions_from)
//   후처리 원문 그대로 인용 — 환산할 수 있는 게 없다
// 레코드에 없는 것(외관, NMR, HRMS)은 비워 두고 없다고 적는다. 지어내지 않는다 (절대 규칙 3).

// 제출 서식의 숫자는 뒤에 붙는 0을 달지 않는다 — "25 °C, 4 h, 76%"이지 "25.0 °C, 4.00 h, 76.0%"가 아니다
const num = (v) => String(Number(v.toPrecision(4)))
const mass = (mg) => (mg >= 1000 ? `${sig(mg / 1000)} g` : `${sig(mg)} mg`)
const vol = (ml) => (ml < 1 ? `${sig(ml * 1000)} µL` : `${sig(ml)} mL`)
const hours = (h) => (h < 1 ? `${num(h * 60)} min` : `${num(h)} h`)

// 한 시약의 양을 제출 서식대로: 고체는 질량, 액체는 부피, 그 뒤에 mmol과 당량
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
  // 용매는 당량을 쓰지 않는다. 촉매는 소수점 두 자리로 자르면 레코드가 적은 값이 사라진다 —
  // 0.015 equiv가 "0.01 equiv"로 나오면 그건 출처가 적지 않은 숫자다
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
  // 한계 시약(1.00 당량)이 문장의 주어가 된다
  const limiting = inputs.find((c) => c.amount?.equiv === 1 || c.is_substrate) ?? inputs[0]
  const rest = inputs.filter((c) => c !== limiting)

  const sentences = []
  if (limiting) {
    const inSolvent = solvents.length
      ? ` in ${listOf(solvents.map((c) => withAmount(c, factor)))}`
      : ''
    // 기본은 "한계 시약이 플라스크에 먼저 있고 나머지를 넣는다"이지만, 레코드가 반대라고 적어 두면
    // (added_last) 그대로 쓴다. Bax & Stevens는 티오페놀을 미리 만든 혼합물에 넣는다 — 뒤집어 쓰면
    // 출처가 말하지 않은 순서를 주장하게 된다
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

  // 조건. 둘 중 하나가 없으면 없다고 쓴다 — 그럴듯한 값으로 채우지 않는다
  const t = protocol.temperature_c
  const h = protocol.time_h
  if (t != null && h != null) sentences.push(`The mixture was stirred at ${num(t)} °C for ${hours(h)}.`)
  else if (t != null) sentences.push(`The mixture was stirred at ${num(t)} °C for a time the source does not state.`)
  else if (h != null) sentences.push(`The mixture was stirred for ${hours(h)} at a temperature the source does not state.`)
  else sentences.push('The source states neither a temperature nor a reaction time.')

  if (protocol.workup) {
    sentences.push(protocol.workup)
    // 인용한 후처리 문장에는 **원문 규모의** 절대 질량이 들어 있다 ("138.7 g, 81.5%"). 우리 규모로
    // 환산한 투입량 옆에 그대로 두면 이 실험에서 그만큼 나온다는 말로 읽힌다. 환산할 수 없는
    // 문장이니 고치지 않고, 어느 규모의 숫자인지 밝힌다
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
  // 첫 글자는 대문자로. "To ..."로 시작하지 않는 형태("thiophenol was added to ...")가 생기면서
  // 문단이 소문자로 시작했다
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
      {/* 벤치 시트와 같은 경고. 문단 쪽에만 없으면, 붙여 넣은 사람은 이 양이 그 논문이 실제로
          돌린 양인 줄 알게 된다 — 카페인 쪽은 50 mg에서 쓴 요오드화 메틸 34.7 당량이 그램 규모에서
          16 mL가 된다 */}
      {protocol.record_scale_mmol > 0 && here / protocol.record_scale_mmol >= 5 && (
        <p className="protocol-scaleup muted small">
          The source ran this at {sig(protocol.record_scale_mmol)} mmol. Every quantity above is that run multiplied
          by <strong className="num">{sig(here / protocol.record_scale_mmol, 2)}×</strong>, so a reagent it used in
          large excess at small scale becomes a volume worth reconsidering before you write this up, and its isolation
          was not designed for this much material.
        </p>
      )}
      {/* 내려가는 쪽. 1 mol 문헌 제법을 g 규모로 쓰는 것은 흔한 일이고, 쓰기 전에 알아야 하는 것도 같다 */}
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
      {/* 원문이 자기 물질에 대해 측정한 값. 우리 물질의 값이 아니라는 걸 라벨이 말한다 */}
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
