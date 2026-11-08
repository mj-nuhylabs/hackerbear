import { DASH, grams, mmol, usd } from '../lib/format'
import { Mock, Mol } from './bits'
import BuyVsMake from './BuyVsMake'
import './cost.css'

// Where one row's price came from. A real price links to the page it was read from, so the number can be checked;
// an example price says so instead. Those are the only two cases — a price with no source does not get in
// (scripts/import_prices.py refuses it).
function PriceSource({ price }) {
  if (price.mock) {
    return (
      <div className="price-src">
        <Mock what="Price" />
      </div>
    )
  }
  const label = [price.supplier, price.catalog_no].filter(Boolean).join(' ')
  return (
    <div className="price-src">
      {price.url ? (
        <a href={price.url} target="_blank" rel="noreferrer noopener" title={`${label} — list price read ${price.as_of_date}`}>
          {label || 'source'}
        </a>
      ) : (
        <span className="muted">{label}</span>
      )}
    </div>
  )
}

// Everything the route consumes that does not end up in the product — reagents, catalysts, solvents —
// at the amounts the records state (backend/cost/inputs.py). Kept apart from the bill of materials: a
// record states these only for some steps, so adding them to the material total would make a
// well-documented route look dearer than one with no record at all. The footer says what it covers.
function ReagentTable({ cost }) {
  const rows = cost.reagents ?? []
  const t = cost.totals
  if (!rows.length) {
    return (
      <p className="reag-none muted small">
        No record of this route&apos;s steps states an amount for anything outside the product, so its reagents,
        catalysts and solvents are unknown — not zero.
      </p>
    )
  }
  const amount = (l) =>
    l.massG != null ? grams(l.massG) : l.volumeMl != null ? `${l.volumeMl.toFixed(l.volumeMl < 10 ? 2 : 0)} mL` : DASH
  return (
    <div className="reagents">
      <h3>
        Reagents, catalysts and solvents <span className="reag-tag">recorded</span>
      </h3>
      <p className="muted small">
        Scaled from the equivalents and volumes the records state, at the target amount above. Not added to the
        totals below — the records cover {t.stepsWithInputs} of {t.stepsTotal} step{t.stepsTotal === 1 ? '' : 's'},
        so these are what is known, not the whole of it.
      </p>
      <div className="table-wrap">
        <table className="bom reag">
          <thead>
            <tr>
              <th scope="col">Input</th>
              <th scope="col">Role</th>
              <th scope="col" className="r">
                Equiv
              </th>
              <th scope="col" className="r">
                Amount
              </th>
              <th scope="col" className="r">
                Unit price
              </th>
              <th scope="col" className="r">
                Consumption
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={`${l.smiles}-${l.role}`}>
                <td>
                  <div className="reag-name">{l.name || l.smiles}</div>
                  <code className="bom-smiles">{l.smiles}</code>
                </td>
                <td className="reag-role">{(l.role || '').toLowerCase()}</td>
                <td className="r num">{l.equiv != null ? l.equiv : DASH}</td>
                <td className="r num">{amount(l)}</td>
                <td className="r num">
                  {l.price ? (
                    <>
                      {usd(l.price.price_per_g)}/g
                      <PriceSource price={l.price} />
                    </>
                  ) : (
                    DASH
                  )}
                </td>
                <td className="r num">
                  {l.consumption != null ? (
                    usd(l.consumption)
                  ) : (
                    <span title={l.uncostedReason ?? undefined}>{DASH}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        {t.reagentCost != null ? (
          <>
            <strong className="num">{usd(t.reagentCost)}</strong> of these have a price.{' '}
          </>
        ) : null}
        {t.reagentUncosted > 0 && (
          <>
            {t.reagentUncosted} of {t.reagentLines} {t.reagentUncosted > 1 ? 'are' : 'is'} shown as {DASH}: a solvent
            is recorded as a volume and ORD carries no density, and the rest have no price on record.{' '}
          </>
        )}
        {t.reagentUnidentified > 0 && (
          <>
            {t.reagentUnidentified} further input{t.reagentUnidentified > 1 ? 's are' : ' is'} named in the record
            without a structure, so {t.reagentUnidentified > 1 ? 'they are' : 'it is'} left here and kept on the step
            itself.{' '}
          </>
        )}
        Patent records list workup and extraction volumes alongside the reaction solvent, so a solvent figure is
        everything the record poured, not the reaction concentration.
      </p>
    </div>
  )
}

export default function CostSheet({ cost, targetG, setTargetG, purification, setPurification }) {
  const { lines, totals } = cost
  const priced = lines.filter((l) => l.price)
  const real = priced.filter((l) => !l.price.mock)
  const asOf = real[0]?.price.as_of_date ?? priced[0]?.price.as_of_date
  // A material with no price on record adds nothing to either total, so with any of them missing the totals are
  // only a lower bound. Say so on the number itself, not just in a footnote: a bare $63.00 reads as the whole bill.
  const unpriced = lines.length - priced.length
  const partial = unpriced > 0 && priced.length > 0
  const total = (v) => (v != null && partial ? `≥ ${usd(v)}` : usd(v))
  const gap =
    unpriced === 0
      ? null
      : priced.length === 0
        ? 'No material on this route has a price on record'
        : `Leaves out ${unpriced} of ${lines.length} materials that have no price on record`
  return (
    <section className="panel cost" aria-labelledby="cost-title">
      <div className="panel-head">
        <h2 id="cost-title">Bill of materials</h2>
        <p className="muted">Only leaf materials are bought. Intermediates get made along the route.</p>
      </div>

      <BuyVsMake buy={cost.buy} targetG={targetG} />

      <div className="cost-controls">
        <label className="ctl" htmlFor="target-g">
          <span>Target amount</span>
          <span className="ctl-input">
            <input
              id="target-g"
              type="number"
              min="0.01"
              step="0.1"
              value={targetG}
              onChange={(e) => setTargetG(Math.max(0.01, Number(e.target.value) || 0.01))}
            />
            g
          </span>
        </label>
        <label className="ctl ctl-range" htmlFor="purif">
          <span>
            Purification recovery <span className="assumed">assumed</span>
          </span>
          <span className="ctl-input">
            <input
              id="purif"
              type="range"
              min="0.5"
              max="1"
              step="0.01"
              value={purification}
              onChange={(e) => setPurification(Number(e.target.value))}
            />
            <output htmlFor="purif" className="num">
              {Math.round(purification * 100)}%
            </output>
          </span>
        </label>
      </div>

      <div className="table-wrap">
        <table className="bom">
          <thead>
            <tr>
              <th scope="col">Material</th>
              <th scope="col" className="r">
                Molar mass
              </th>
              <th scope="col" className="r">
                Needed
              </th>
              <th scope="col" className="r">
                Mass
              </th>
              <th scope="col" className="r">
                Unit price
              </th>
              <th scope="col" className="r">
                Consumption
              </th>
              <th scope="col" className="r">
                Packs
              </th>
              <th scope="col" className="r">
                Purchase
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.compound.smiles}>
                <td>
                  <div className="bom-mat">
                    <Mol compound={l.compound} size="xs" />
                    <code className="bom-smiles">{l.compound.smiles}</code>
                  </div>
                  {/* backend/chem/stock.py: ZINC에 없는 흔한 시약. 구매 가능의 근거이지 가격이 아니다 */}
                  {l.compound.stock_status === 'commodity' && (
                    <div
                      className="bom-stock muted small"
                      title={`Not in the ZINC catalog. Counted as buyable because ${l.compound.ord_records?.toLocaleString() ?? '—'} ORD records from ${l.compound.ord_sources?.toLocaleString() ?? '—'} patents or papers use it as a reactant — not a price.`}
                    >
                      common reagent · {l.compound.ord_records?.toLocaleString() ?? '—'} ORD records
                    </div>
                  )}
                </td>
                <td className="r num">{l.compound.mw != null ? l.compound.mw.toFixed(2) : DASH}</td>
                <td className="r num">{mmol(l.n)} mmol</td>
                <td className="r num">{grams(l.massG)}</td>
                <td className="r num">
                  {l.price ? (
                    <>
                      {usd(l.price.price_per_g)}/g
                      <PriceSource price={l.price} />
                    </>
                  ) : (
                    DASH
                  )}
                </td>
                <td className="r num">{usd(l.consumption)}</td>
                <td className="r num">{l.price ? `${l.packs} × ${l.price.pack_size_g} g` : DASH}</td>
                <td className="r num strong">{usd(l.purchase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReagentTable cost={cost} />

      <div className="totals">
        <div className="total">
          <span className="total-k">Consumption basis</span>
          <span className="total-v num">{total(totals.consumption)}</span>
          <span className="muted small">What the material you actually use is worth</span>
          {gap && <span className="total-gap small">{gap}</span>}
        </div>
        <div className="total total-main">
          <span className="total-k">Actual purchase</span>
          <span className="total-v num">{total(totals.purchase)}</span>
          <span className="muted small">What you pay buying whole packs</span>
          {gap && <span className="total-gap small">{gap}</span>}
        </div>
        <div className="total">
          <span className="total-k">Estimated time</span>
          <span className="total-v num">{totals.timeH != null ? `${totals.timeH} h` : DASH}</span>
          <span className="muted small">
            {totals.untimedSteps > 0
              ? `${totals.untimedSteps} step${totals.untimedSteps > 1 ? 's' : ''} with no time on record`
              : 'Every step has a time on record'}
          </span>
        </div>
      </div>

      <p className="cost-foot muted small">
        {real.length > 0 && (
          <>
            {real.length} of {lines.length} materials have a supplier list price, read on {asOf}; each links to the
            page it came from. The pack is the smallest one at or above 1 g, and the unit price is that same pack&apos;s,
            so the two totals differ only by what is left in the bottle. For a reagent sold only as a solution, the pack
            size counts the reagent itself, from the concentration on its page.{' '}
          </>
        )}
        {unpriced > 0 && (
          <>
            {unpriced} material{unpriced > 1 ? 's have' : ' has'} no price on record and{' '}
            {unpriced > 1 ? 'are' : 'is'} shown as {DASH}, not estimated.{' '}
          </>
        )}
        {real.length < priced.length && (
          <>
            The rest are <Mock what="Prices" /> values.{' '}
          </>
        )}
        Yield uses the figure reported for the step where there is one, else the median of its closest recorded
        reactions, else an assumed 70% — each step says which. Each material is counted at 1.0 equivalent; the
        recorded equivalents are in the table above, where a record states them.
      </p>
    </section>
  )
}
