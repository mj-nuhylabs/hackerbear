import { useState } from 'react'
import * as api from '../api'
import { checkText } from '../lib/guard'
import { DASH, mmol, pct, shortHash } from '../lib/format'
import { Mock, Mol, TIER_INFO, TierBadge } from './bits'

function Conditions({ c }) {
  const rows = [
    ['용매', c?.solvent],
    ['온도', c?.temperature_c != null ? `${c.temperature_c} °C` : null],
    ['시간', c?.time_h != null ? `${c.time_h} h` : null],
    ['촉매', c?.catalyst],
  ]
  return (
    <>
      {rows.map(([k, v]) => (
        <div className="kv-row" key={k}>
          <dt>{k}</dt>
          <dd>
            {v ?? DASH}
            {v != null && c?.mock && <Mock what="반응 조건" />}
          </dd>
        </div>
      ))}
    </>
  )
}

function Bar({ label, value, emphasize }) {
  return (
    <div className={`pbar ${emphasize ? 'pbar-main' : ''}`}>
      <span className="pbar-label">{label}</span>
      <span className="pbar-track">
        <span className="pbar-fill" style={{ width: `${(value ?? 0) * 100}%` }} />
      </span>
      <span className="pbar-val">{value == null ? DASH : value.toFixed(2)}</span>
    </div>
  )
}

// 단계가 바뀌면 key로 새로 마운트되므로 상태가 저절로 초기화된다
function Explain({ route, stepIndex }) {
  const [state, setState] = useState({ status: 'idle' })

  async function run() {
    setState({ status: 'loading' })
    const data = await api.explain(route, stepIndex)
    const text = [data.why_works, data.why_fails, data.next_experiment].join(' ')
    setState({ status: 'done', data, guard: checkText(text) })
  }

  return (
    <div className="explain">
      <div className="explain-head">
        <div>
          <h3>설명</h3>
          <p className="muted">이 단계의 출처 레코드만 입력으로 받아 LLM이 문장으로 정리합니다.</p>
        </div>
        {state.status !== 'done' && (
          <button type="button" className="btn" onClick={run} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? '작성 중…' : '설명 생성'}
          </button>
        )}
      </div>
      {state.status === 'done' && !state.guard.ok && (
        <p className="guard guard-fail">가드가 막았습니다: {state.guard.hits.join(', ')}이(가) 포함되어 있습니다.</p>
      )}
      {state.status === 'done' && state.guard.ok && (
        <>
          <div className="explain-cols">
            <section>
              <h4>왜 될 만한가</h4>
              <p>{state.data.why_works}</p>
            </section>
            <section>
              <h4>어디서 막힐 수 있나</h4>
              <p>{state.data.why_fails}</p>
            </section>
            <section>
              <h4>다음 실험</h4>
              <p>{state.data.next_experiment}</p>
            </section>
          </div>
          <p className="guard guard-ok">
            출력 가드 통과: 구조식, 숫자와 단위, DOI, 특허번호가 없습니다. {state.data.mock && <Mock what="설명문" />}
          </p>
        </>
      )}
    </div>
  )
}

export default function StepDetail({ route, stepIndex, onSelect, scale, targetG }) {
  const s = route.steps[stepIndex]
  const n = route.steps.length
  const ev = s.evidence
  const isMock = (k) => s.mock?.includes(k)
  const evMock = (k) => ev.mock?.includes(k)

  return (
    <section className="panel step" aria-labelledby="step-title">
      <header className="step-head">
        <div className="step-title-row">
          <h2 id="step-title">
            단계 {stepIndex + 1}
            <span className="of"> / {n}</span>
          </h2>
          <TierBadge tier={ev.tier} />
          {evMock('tier') && <Mock what="증거 등급" />}
        </div>
        <div className="step-nav">
          <button type="button" className="ghost-btn" disabled={stepIndex === 0} onClick={() => onSelect(stepIndex - 1)}>
            이전 단계
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={stepIndex === n - 1}
            onClick={() => onSelect(stepIndex + 1)}
          >
            다음 단계
          </button>
        </div>
      </header>

      <div className="rxn-line">
        {s.reactants.map((r, k) => (
          <span className="rxn-in" key={r.smiles}>
            {k > 0 && <span className="plus">+</span>}
            <Mol compound={r} size="sm" caption={`${r.mw.toFixed(2)} g/mol`} />
          </span>
        ))}
        <svg className="rxn-arrow" viewBox="0 0 60 12" aria-hidden="true">
          <line x1="0" y1="6" x2="52" y2="6" />
          <path d="M46 1 L60 6 L46 11 Z" />
        </svg>
        <Mol compound={s.product} size="sm" caption={`${s.product.mw.toFixed(2)} g/mol`} />
      </div>
      <p className="rxn-smiles">
        <code>{s.rxn_smiles}</code>
      </p>

      <div className="step-grid">
        <div className="block">
          <h3>근거</h3>
          <p className="tier-say">{TIER_INFO[ev.tier].say}</p>
          <dl className="kv">
            <div className="kv-row">
              <dt>템플릿 선례</dt>
              <dd>
                <span className="num">{ev.precedent_count.toLocaleString('ko-KR')}건</span>
                <span className="src">USPTO 템플릿 라이브러리</span>
              </dd>
            </div>
            <div className="kv-row">
              <dt>출처 레코드</dt>
              <dd>
                {ev.source_ids.length ? (
                  <span className="src-list">
                    {ev.source_ids.map((id) => (
                      <code key={id}>{id}</code>
                    ))}
                    {evMock('source_ids') && <Mock what="출처 ID" />}
                  </span>
                ) : (
                  <span className="muted">코퍼스에서 선례를 찾지 못함</span>
                )}
              </dd>
            </div>
            <div className="kv-row">
              <dt>템플릿 ID</dt>
              <dd>
                <code>{shortHash(s.template_id)}</code>
              </dd>
            </div>
          </dl>
        </div>

        <div className="block">
          <h3>수율과 조건</h3>
          <dl className="kv">
            <div className="kv-row">
              <dt>문헌 수율</dt>
              <dd>
                {pct(s.reported_yield)}
                {s.reported_yield != null && isMock('reported_yield') && <Mock what="문헌 수율" />}
              </dd>
            </div>
            <div className="kv-row">
              <dt>계산에 쓴 수율</dt>
              <dd>
                {pct(s.reported_yield ?? s.assumed_yield)}
                <span className={`assumed ${s.reported_yield != null ? 'is-reported' : ''}`}>
                  {s.reported_yield != null ? '문헌값' : '가정값'}
                </span>
              </dd>
            </div>
            <Conditions c={s.conditions} />
          </dl>
        </div>

        <div className="block">
          <h3>
            반응 타당성 {isMock('plausibility_calibrated') && <Mock what="타당성 점수" />}
          </h3>
          <Bar label="모델 원점수" value={s.plausibility_raw} />
          <Bar label="캘리브레이션 확률" value={s.plausibility_calibrated} emphasize />
          <p className="muted small">판단은 캘리브레이션된 확률로 합니다.</p>
        </div>

        <div className="block">
          <h3>이 단계 스케일</h3>
          <p className="scale-num">
            <span className="num">{mmol(scale?.nRxn)}</span> mmol
          </p>
          <p className="muted small">타겟 {targetG} g을 얻으려면 이만큼 반응시켜야 합니다.</p>
        </div>
      </div>

      <Explain key={`${route.id}-${stepIndex}`} route={route} stepIndex={stepIndex} />

      <div className="gaps">
        <h3>
          이 템플릿으로 아직 시험되지 않은 기질군 {isMock('gaps') && <Mock what="갭 분석" />}
        </h3>
        <ul className="chips">
          {s.gaps.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
