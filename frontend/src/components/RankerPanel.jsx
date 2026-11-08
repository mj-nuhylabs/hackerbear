// 두 랭킹 모델이 얼마나 쓸만한지 — 백엔드가 /rankers/metrics로 준 수치를 그대로 띄운다.
//
// ModelPanel과 같은 원칙이다: 판정 문장을 하드코딩하지 않는다. "기준선을 이겼다"는 **오늘 학습한
// 모델**에 대한 말이라, 재학습해서 뒤집히면 문장도 뒤집혀야 한다. 그래서 숫자에서 끌어낸다.
//
// 천장(oracle, ceiling)을 같이 띄우는 것이 이 패널의 핵심이다. 모델은 **검색이 찾아온 후보 중에서만**
// 고를 수 있어서, 후보에 정답이 없으면 아무리 잘 골라도 못 맞힌다. 그 한계를 숨기면 점수가 실제보다
// 좋아 보인다.
import { useEffect, useState } from 'react'

const LOADING = undefined
const UNAVAILABLE = null

const pct = (v, digits = 1) => (v == null || Number.isNaN(v) ? '—' : `${(Number(v) * 100).toFixed(digits)}%`)
const num = (v, digits = 3) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(digits))
const count = (v) => (v == null ? '—' : Number(v).toLocaleString())

// 기준선 대비 몇 배인지. 숫자에서 나오므로 재학습하면 같이 바뀐다.
function versus(model, base, label) {
  if (model == null || !base) return null
  const ratio = model / base
  if (ratio >= 1.05)
    return (
      <>
        <strong>{ratio.toFixed(1)}× better</strong> than {label}.
      </>
    )
  if (ratio >= 0.95) return <>About the same as {label}.</>
  return (
    <>
      <strong>Worse</strong> than {label} — on this run the model is not earning its place.
    </>
  )
}

// 천장을 몇 퍼센트나 잡았는지. 천장은 "후보 안에 정답이 들어 있는 경우의 비율"이고, 그 정답이
// 무엇인지는 모델마다 다르다 — 그래서 문장을 호출부에서 받는다. 두 모델에 같은 문구를 쓰면
// 한쪽은 거짓말이 된다.
function ceilingNote(got, ceiling, what) {
  if (got == null || !ceiling) return null
  return (
    <>
      Only <strong>{pct(ceiling)}</strong> {what}, so that is the most any ranker could score here. This model
      takes <strong>{pct(got / ceiling)}</strong> of what was reachable — the rest is missing from the candidates,
      not mis-ranked.
    </>
  )
}

function Row({ label, children }) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Transfer({ m }) {
  const t = m?.test
  const model = t?.model
  const sim = t?.['nearest_similarity (current app)']
  const oracle = t?.['oracle (ceiling)']
  return (
    <div>
      <h3>Picking the procedure to adapt</h3>
      <p className="muted small">
        Of the nearest recorded reactions to a step, which one&rsquo;s recorded conditions were actually used for a
        substrate like this. Scored on held-out product scaffolds, never seen in training.
      </p>
      <dl className="kv">
        <Row label="Held-out queries">{count(m?.test_queries)}</Row>
        <Row label="Right on the first pick">
          <strong>{pct(model?.top1_relevance_ge2_rate)}</strong> vs {pct(sim?.top1_relevance_ge2_rate)} picking the
          most similar
        </Row>
        <Row label="NDCG@5">
          {num(model?.ndcg_at_5)} vs {num(sim?.ndcg_at_5)}
        </Row>
        <Row label="Best possible">{pct(oracle?.top1_relevance_ge2_rate)}</Row>
      </dl>
      <p className="muted small">
        {versus(model?.top1_relevance_ge2_rate, sim?.top1_relevance_ge2_rate, 'taking the most similar reaction') ??
          '—'}{' '}
        {ceilingNote(
          model?.top1_relevance_ge2_rate,
          oracle?.top1_relevance_ge2_rate,
          'of steps have any retrieved record whose conditions match the ones actually recorded',
        )}
      </p>
    </div>
  )
}

function Route({ m }) {
  // 측정 수치는 route_ranker.py가 쓰는 metrics 파일의 `test` 아래에 있다 (transfer 쪽과 같은 모양).
  // 예전에 이 블록을 한 단계 위에서 읽어서, 모델이 멀쩡히 학습돼 있는데도 표가 전부 —로 떴다.
  const t = m?.test
  if (!t)
    return (
      <div>
        <h3>Ranking the routes</h3>
        <p className="muted small">
          Not trained yet. Candidate routes are still being searched, so the route list is ordered by
          AiZynthFinder&rsquo;s own score — which ties at 0.994 for most short routes, the reason the routes used to
          look alike.
        </p>
      </div>
    )
  const me = t.methods?.model
  const az = t.methods?.aizynth_state_score
  return (
    <div>
      <h3>Ranking the routes</h3>
      <p className="muted small">
        Which candidate route looks like one chemists actually ran, learned from routes chained inside a single
        patent. Scored on held-out patents.
      </p>
      <dl className="kv">
        <Row label="Held-out targets">{count(t.n_targets)}</Row>
        <Row label="Reported route ranked first">
          <strong>{pct(me?.top1_final)}</strong> vs {pct(az?.top1_final)} by AiZynth score
        </Row>
        <Row label="In the top 5">
          {pct(me?.top5_final)} vs {pct(az?.top5_final)}
        </Row>
        <Row label="Best possible">{pct(t.ceiling_any_final)}</Row>
      </dl>
      <p className="muted small">
        {versus(me?.top1_final, az?.top1_final, 'AiZynthFinder’s own score') ?? '—'}{' '}
        {ceilingNote(
          me?.top1_final,
          t.ceiling_any_final,
          'of targets have the reported route among the candidates the search returned',
        )}
      </p>
    </div>
  )
}

export function RankerPanel() {
  const [m, setM] = useState(LOADING)

  useEffect(() => {
    let alive = true
    fetch('/api/rankers/metrics')
      .then((r) => (r.ok ? r.json() : UNAVAILABLE))
      .then((d) => alive && setM(d))
      .catch(() => alive && setM(UNAVAILABLE))
    return () => {
      alive = false
    }
  }, [])

  if (m === UNAVAILABLE)
    return (
      <section className="panel model-panel" aria-labelledby="ranker-title">
        <h2 id="ranker-title">Do the two rankers help?</h2>
        <p className="muted">Neither ranker has been trained yet, so there is nothing measured to show.</p>
      </section>
    )

  return (
    <section className="panel model-panel" aria-labelledby="ranker-title">
      <h2 id="ranker-title">Do the two rankers help?</h2>
      <p className="muted">
        Both are ranking models: they order records and routes that already exist and write no chemistry of their
        own. Both were trained with the five original demo targets and their recorded intermediates held out, so
        these numbers are not the demo marking its own homework. S-phenyl thioformate was added after training, so
        that exclusion was never applied to it — but the corpus holds no record that makes it and none that consumes
        it, so there was no route to it for either model to have memorised.
      </p>
      <div className="model-grid">
        <Transfer m={m?.transfer} />
        <Route m={m?.route} />
      </div>
    </section>
  )
}
