import { DASH, grams, mmol, usd } from '../lib/format'
import { Mock, Mol } from './bits'

export default function CostSheet({ cost, targetG, setTargetG, purification, setPurification }) {
  const { lines, totals } = cost
  const asOf = lines.find((l) => l.price)?.price.as_of_date
  return (
    <section className="panel cost" aria-labelledby="cost-title">
      <div className="panel-head">
        <h2 id="cost-title">Bill of materials</h2>
        <p className="muted">Only leaf materials are bought. Intermediates get made along the route.</p>
      </div>

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
                </td>
                <td className="r num">{l.compound.mw.toFixed(2)}</td>
                <td className="r num">{mmol(l.n)} mmol</td>
                <td className="r num">{grams(l.massG)}</td>
                <td className="r num">{l.price ? `${usd(l.price.price_per_g)}/g` : DASH}</td>
                <td className="r num">{usd(l.consumption)}</td>
                <td className="r num">{l.price ? `${l.packs} × ${l.price.pack_size_g} g` : DASH}</td>
                <td className="r num strong">{usd(l.purchase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals">
        <div className="total">
          <span className="total-k">Consumption basis</span>
          <span className="total-v num">{usd(totals.consumption)}</span>
          <span className="muted small">What the material you actually use is worth</span>
        </div>
        <div className="total total-main">
          <span className="total-k">Actual purchase</span>
          <span className="total-v num">{usd(totals.purchase)}</span>
          <span className="muted small">What you pay buying whole packs</span>
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
        Unit and pack prices are <Mock what="Prices" /> values {asOf && `(snapshot dated ${asOf})`}. Yield uses the
        reported figure where there is one, otherwise an assumed 70%. Every equivalent is assumed to be 1.0.
      </p>
    </section>
  )
}
