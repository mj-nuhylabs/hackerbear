import { DASH, grams, mmol, usd } from '../lib/format'
import { Mock, Mol } from './bits'

export default function CostSheet({ cost, targetG, setTargetG, purification, setPurification }) {
  const { lines, totals } = cost
  const asOf = lines.find((l) => l.price)?.price.as_of_date
  return (
    <section className="panel cost" aria-labelledby="cost-title">
      <div className="panel-head">
        <h2 id="cost-title">구매 목록과 비용</h2>
        <p className="muted">말단 물질만 구매 대상입니다. 중간체는 경로 안에서 만듭니다.</p>
      </div>

      <div className="cost-controls">
        <label className="ctl" htmlFor="target-g">
          <span>목표량</span>
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
            정제 회수율 <span className="assumed">가정값</span>
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
              <th scope="col">물질</th>
              <th scope="col" className="r">
                분자량
              </th>
              <th scope="col" className="r">
                필요량
              </th>
              <th scope="col" className="r">
                질량
              </th>
              <th scope="col" className="r">
                단가
              </th>
              <th scope="col" className="r">
                소비량 기준
              </th>
              <th scope="col" className="r">
                포장
              </th>
              <th scope="col" className="r">
                구매액
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
          <span className="total-k">소비량 기준</span>
          <span className="total-v num">{usd(totals.consumption)}</span>
          <span className="muted small">실제로 쓰는 양만큼의 금액</span>
        </div>
        <div className="total total-main">
          <span className="total-k">실제 구매액</span>
          <span className="total-v num">{usd(totals.purchase)}</span>
          <span className="muted small">포장 단위로 사야 하는 금액</span>
        </div>
        <div className="total">
          <span className="total-k">예상 소요 시간</span>
          <span className="total-v num">{totals.timeH != null ? `${totals.timeH} h` : DASH}</span>
          <span className="muted small">
            {totals.untimedSteps > 0 ? `${totals.untimedSteps}개 단계 시간 미상` : '모든 단계 시간 확인됨'}
          </span>
        </div>
      </div>

      <p className="cost-foot muted small">
        단가와 포장 가격은 <Mock what="가격" /> {asOf && `(스냅샷 기준일 ${asOf})`}입니다. 수율은 문헌값이 있으면 그 값을,
        없으면 가정값 70%를 씁니다. 당량은 모두 1.0으로 가정했습니다.
      </p>
    </section>
  )
}
