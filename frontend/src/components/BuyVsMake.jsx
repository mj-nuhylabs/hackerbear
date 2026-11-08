import { usd } from '../lib/format'
import { Mock } from './bits'
import './buy.css'

// Buy the finished compound, or make it? Both figures come from POST /cost (backend/cost/stoich.py buy_vs_make):
// the buy side is the target's own catalogue price, the make side is this route's bill of materials. The verdict is
// the backend's, and it is only given when the numbers settle it — a route with unpriced materials has a make cost that
// is a lower bound, so "make" is never claimed for it.
function Source({ p }) {
  if (p.mock) return <Mock what="Price" />
  const label = [p.supplier, p.catalog_no].filter(Boolean).join(' ')
  return p.url ? (
    <a href={p.url} target="_blank" rel="noreferrer noopener" title={`List price read ${p.as_of_date}`}>
      {label || 'source'}
    </a>
  ) : (
    <span>{label}</span>
  )
}

export default function BuyVsMake({ buy, targetG }) {
  if (!buy) return null
  if (!buy.available) {
    return (
      <p className="bvm bvm-quiet muted small">
        Buying the target outright can&apos;t be compared: it has no catalogue price in our price table.
      </p>
    )
  }
  const p = buy.price
  const packs = `${buy.packs} × ${p.pack_size_g} g`
  const makeCost = (
    <>
      {buy.makeIsLowerBound && 'at least '}
      <strong className="num">{usd(buy.makeCost)}</strong>
    </>
  )
  const lowerBoundNote = buy.makeIsLowerBound
    ? ` ${buy.unpriced} material${buy.unpriced > 1 ? 's have' : ' has'} no price, so making it costs more than that.`
    : ''

  if (buy.verdict === 'buy') {
    return (
      <div className="bvm bvm-buy" role="status">
        <div className="bvm-head">
          <span className="bvm-badge">Cheaper to buy</span>
          <span className="bvm-save num">{usd(buy.savings)} less</span>
        </div>
        <p>
          <Source p={p} /> sells the finished compound: {targetG} g means buying {packs} for{' '}
          <strong className="num">{usd(buy.cost)}</strong>. Making it on this route costs {makeCost} in materials
          alone.{lowerBoundNote}
        </p>
        <p className="muted small">
          The make cost leaves out solvents, labour and time, so buying is cheaper by more than this. Both sides use whole
          packs at list price.
        </p>
      </div>
    )
  }

  if (buy.verdict === 'make') {
    return (
      <div className="bvm bvm-make">
        <p>
          Making it costs less in materials: {makeCost}, against <strong className="num">{usd(buy.cost)}</strong> to buy{' '}
          {packs} from <Source p={p} />.
        </p>
        <p className="muted small">Materials only. Solvents, labour and time are not counted.</p>
      </div>
    )
  }

  // A price for the target, but no verdict: the make cost is unknown or only a lower bound that does not settle it.
  return (
    <p className="bvm bvm-quiet muted small">
      Buying {targetG} g costs {usd(buy.cost)} ({packs} from <Source p={p} />).{' '}
      {buy.makeCost != null
        ? `Making it costs at least ${usd(buy.makeCost)} in materials, but ${buy.unpriced} material${buy.unpriced > 1 ? 's have' : ' has'} no price, so the two can't be compared yet.`
        : "None of this route's materials has a price, so making it has no cost to compare."}
    </p>
  )
}
