import { useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { computeCost } from './lib/cost'
import { usd } from './lib/format'
import { tierCounts } from './lib/route'
import { CopyText, Mock, Mol, TIER_INFO, TierBadge } from './components/bits'
import RouteScheme from './components/RouteScheme'
import StepDetail from './components/StepDetail'
import CostSheet from './components/CostSheet'

const KIND_LABEL = { name: '이름', cas: 'CAS 번호', smiles: 'SMILES' }

function TargetCard({ target }) {
  return (
    <section className="panel target" aria-labelledby="target-title">
      <Mol compound={target} size="lg" />
      <h2 id="target-title" className="target-name">
        {target.name}
      </h2>
      <dl className="kv">
        <div className="kv-row">
          <dt>CAS</dt>
          <dd className="num">{target.cas ?? '—'}</dd>
        </div>
        <div className="kv-row">
          <dt>분자량</dt>
          <dd>
            <span className="num">{target.mw.toFixed(2)}</span> g/mol
          </dd>
        </div>
        <div className="kv-row">
          <dt>InChIKey</dt>
          <dd>
            <code className="break">{target.inchikey}</code>
          </dd>
        </div>
        <div className="kv-row kv-stack">
          <dt>SMILES</dt>
          <dd>
            <CopyText text={target.smiles} />
          </dd>
        </div>
      </dl>
    </section>
  )
}

function RouteList({ routes, costs, routeId, onPick, targetG, search }) {
  return (
    <section className="panel routes" aria-labelledby="routes-title">
      <div className="panel-head">
        <h2 id="routes-title">경로 {routes.length}개</h2>
        <p className="muted small">
          AiZynthFinder가 {search.search_time_s}초 동안 탐색했습니다. 점수가 높은 순서입니다.
        </p>
      </div>
      <ul className="route-list">
        {routes.map((r, i) => {
          const c = tierCounts(r)
          return (
            <li key={r.id}>
              <button
                type="button"
                className={`route-card ${r.id === routeId ? 'is-selected' : ''}`}
                aria-pressed={r.id === routeId}
                onClick={() => onPick(r)}
              >
                <span className="rc-top">
                  <span className="rc-name">경로 {i + 1}</span>
                  <span className="rc-steps">{r.steps.length}단계</span>
                </span>
                <span className="tier-strip" aria-label="단계별 증거 등급">
                  {r.steps.map((s, k) => (
                    <span key={k} className={`pip pip-${s.evidence.tier.toLowerCase()}`} title={`단계 ${k + 1}: ${s.evidence.tier}`} />
                  ))}
                </span>
                <span className="rc-figs">
                  <span>
                    구매 물질 {r.leaf_materials.length}종
                    {c.COMPUTED > 0 && <span className="rc-warn"> · 선례 부족 {c.COMPUTED}단계</span>}
                  </span>
                  <span className="rc-cost">
                    {targetG} g 기준 <strong className="num">{usd(costs[r.id]?.totals.purchase)}</strong>
                  </span>
                </span>
                <span className="rc-score muted small">
                  점수 {r.aizynth_score.toFixed(3)} <span className="rc-id">{r.id}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="muted small">구매액은 <Mock what="가격" /> 가격으로 계산했습니다.</p>
    </section>
  )
}

function Legend() {
  return (
    <ul className="legend">
      {Object.keys(TIER_INFO).map((t) => (
        <li key={t}>
          <TierBadge tier={t} size="sm" />
          <span>
            {t === 'REPORTED' && '코퍼스에 같은 반응 레코드가 있음'}
            {t === 'ANALOGOUS' && `템플릿 문헌 선례 ${api.ANALOGOUS_MIN}건 이상`}
            {t === 'COMPUTED' && `선례 ${api.ANALOGOUS_MIN}건 미만 또는 타당성 낮음`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Loading({ phase }) {
  return (
    <div className="loading panel" role="status">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="loading-title">
          {phase === 'resolving' ? '구조를 확인하는 중입니다' : '역합성 경로를 탐색하는 중입니다'}
        </p>
        <p className="muted small">
          {phase === 'resolving'
            ? '이름이나 CAS 번호를 PubChem에서 SMILES로 바꾸고 RDKit으로 정규화합니다.'
            : 'AiZynthFinder가 USPTO 템플릿으로 최대 4단계까지 거꾸로 풀어 구매 가능한 물질에 닿는 경로를 찾습니다.'}
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const [query, setQuery] = useState('Imatinib')
  const [kind, setKind] = useState('auto')
  const [phase, setPhase] = useState('idle')
  const [error, setError] = useState(null)
  const [target, setTarget] = useState(null)
  const [routes, setRoutes] = useState([])
  const [routeId, setRouteId] = useState(null)
  const [stepIdx, setStepIdx] = useState(0)
  const [targetG, setTargetG] = useState(1)
  const [purification, setPurification] = useState(0.9)
  const runId = useRef(0)
  const prices = api.getPrices()

  async function run(q, k = kind) {
    const id = ++runId.current
    setError(null)
    setTarget(null)
    setRoutes([])
    setPhase('resolving')
    try {
      const t = await api.resolve(q, k)
      if (id !== runId.current) return
      setTarget(t)
      setPhase('searching')
      const res = await api.getRoutes(t.smiles, 4)
      if (id !== runId.current) return
      setRoutes(res.routes)
      pick(res.routes[0])
      setPhase('ready')
    } catch (e) {
      if (id !== runId.current) return
      setError(e.message)
      setPhase('error')
    }
  }

  function pick(r) {
    if (!r) return
    setRouteId(r.id)
    setStepIdx(r.steps.length - 1)
  }

  useEffect(() => {
    run('Imatinib', 'name')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const costs = useMemo(
    () => Object.fromEntries(routes.map((r) => [r.id, computeCost(r, { targetG, purification, prices })])),
    [routes, targetG, purification, prices],
  )
  const route = routes.find((r) => r.id === routeId)
  const routeIndex = routes.findIndex((r) => r.id === routeId)
  const detected = kind === 'auto' ? api.detectKind(query) : null
  const busy = phase === 'resolving' || phase === 'searching'

  return (
    <div className="app">
      <header className="topbar">
        <div className="wrap topbar-inner">
          <div className="brand">
            <span className="wordmark">SynthPath</span>
            <span className="tagline">문헌 근거 합성 경로 플래너</span>
          </div>
          <form
            className="search"
            onSubmit={(e) => {
              e.preventDefault()
              if (query.trim()) run(query)
            }}
          >
            <label className="sr-only" htmlFor="kind">
              입력 종류
            </label>
            <select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="auto">자동 감지</option>
              <option value="name">이름</option>
              <option value="cas">CAS 번호</option>
              <option value="smiles">SMILES</option>
            </select>
            <label className="sr-only" htmlFor="q">
              타겟 분자
            </label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, CAS 번호 또는 SMILES"
              autoComplete="off"
              spellCheck="false"
            />
            <button type="submit" className="btn btn-primary" disabled={busy}>
              경로 찾기
            </button>
          </form>
          <div className="demos">
            <span className="muted small">{detected ? `${KIND_LABEL[detected]}(으)로 인식` : '예시 타겟'}</span>
            {api.DEMO_TARGETS.map((t) => (
              <button
                key={t.name}
                type="button"
                className="chip-btn"
                onClick={() => {
                  setQuery(t.name)
                  run(t.name, 'name')
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="notice">
        <div className="wrap notice-inner">
          <p>
            <strong>UI 목업입니다.</strong> 구조, 분자량, 경로, 템플릿 선례 수는 RDKit과 AiZynthFinder로 실제 계산한
            값입니다. <Mock /> 표시가 붙은 값은 흐름을 보여주기 위한 예시입니다.
          </p>
          <ol className="flow" aria-label="사용 흐름">
            <li>타겟 입력</li>
            <li>경로 비교</li>
            <li>단계별 근거 확인</li>
            <li>목표량 비용 계산</li>
          </ol>
        </div>
      </div>

      <main className="wrap bench">
        {phase === 'error' && (
          <div className="panel error" role="alert">
            <p className="loading-title">“{query}”을(를) 찾지 못했습니다</p>
            <p className="muted">{error}</p>
          </div>
        )}
        {busy && <Loading phase={phase} />}

        {target && (
          <aside className="rail">
            <TargetCard target={target} />
            {phase === 'ready' && (
              <RouteList
                routes={routes}
                costs={costs}
                routeId={routeId}
                onPick={pick}
                targetG={targetG}
                search={target.search}
              />
            )}
          </aside>
        )}

        {phase === 'ready' && route && (
          <div className="work">
            <section className="panel scheme-panel" aria-labelledby="scheme-title">
              <div className="panel-head scheme-head">
                <div>
                  <h2 id="scheme-title">
                    경로 {routeIndex + 1} <span className="of">{route.steps.length}단계</span>
                  </h2>
                  <p className="muted small">화살표를 누르면 그 단계의 근거와 조건을 봅니다.</p>
                </div>
                <Legend />
              </div>
              <RouteScheme route={route} targetName={target.name} selectedStep={stepIdx} onSelect={setStepIdx} />
            </section>

            <StepDetail
              route={route}
              stepIndex={stepIdx}
              onSelect={setStepIdx}
              scale={costs[route.id]?.stepScale[stepIdx]}
              targetG={targetG}
            />

            <CostSheet
              cost={costs[route.id]}
              targetG={targetG}
              setTargetG={setTargetG}
              purification={purification}
              setPurification={setPurification}
            />

            <section className="panel calib" aria-labelledby="calib-title">
              <div className="calib-text">
                <h2 id="calib-title">타당성 모델 캘리브레이션</h2>
                <p className="muted">
                  반응 타당성 분류기를 학습하면 홀드아웃 세트의 reliability diagram이 여기에 뜹니다. 점수가 0.7인 반응들이
                  실제로 70% 맞는지를 보여주는 그래프입니다.
                </p>
              </div>
              <div className="calib-frame">
                <span>학습 전</span>
                <code>GET /calibration</code>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
