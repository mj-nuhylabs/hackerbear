// 타당성 모델이 얼마나 쓸만한지 — 백엔드가 계산한 수치를 그대로 읽어 띄운다.
//
// 판정 문장을 하드코딩하지 않는다. "잘 캘리브레이션돼 있다" / "구분하지 못한다"는 **오늘 모델**에
// 대한 말이고, 재학습하면 틀린 말이 될 수 있다. 그래서 문장을 AUC/ECE에서 끌어낸다 —
// 숫자가 바뀌면 문장도 같이 바뀐다.
//
// 값이 없으면(백엔드 꺼짐, 아직 학습 전) —로 띄운다. 지어내지 않는다.
import { useEffect, useState } from 'react'

const LOADING = undefined
const UNAVAILABLE = null

const num = (v, digits = 3) => (v == null || Number.isNaN(v) ? '—' : Number(v).toFixed(digits))
const count = (v) => (v == null ? '—' : Number(v).toLocaleString())

// 외부 검증 판정 — 0.5가 우연이다
function outcomeVerdict(auc) {
  if (auc == null) return null
  if (auc <= 0.55)
    return (
      <>
        That is <strong>no better than chance</strong> (0.5 is chance). On this evidence the score does{' '}
        <strong>not</strong> tell you whether a reaction works in the lab, so the step panel presents it as a
        structural check only.
      </>
    )
  if (auc < 0.7)
    return (
      <>
        That is only weakly better than chance (0.5 is chance) — not enough to read it as a chance of the
        reaction working. Treat it as a structural signal.
      </>
    )
  return (
    <>
      On this test it also ranks reactions that worked above ones that failed under every recorded condition.
      That is a stronger claim than the step panel currently makes, and the wording there should be revisited.
    </>
  )
}

function calibrationVerdict(m) {
  const ece = m?.calibrated?.ece
  if (ece == null) return null
  return ece <= 0.05 ? (
    <>
      Calibrated probabilities land close to observed frequencies, so a score of 0.7 means roughly seven in ten
      of those steps really are corpus reactions rather than decoys.
    </>
  ) : (
    <>
      The calibrated probabilities still drift from observed frequencies, so read the score as a ranking rather
      than a probability.
    </>
  )
}

// How many of the scored reactions this very model was trained on (validate_external.py:
// overlap_with_this_model_training, counted against backend/data/ml/dataset.parquet). Its overlap with the next run's
// candidate set is a different question and is not shown. The wording follows the share: none is a clean hold-out,
// up to 1% close to one, more than that not one.
function overlapNote(v) {
  const n = v?.overlap_with_this_model_training
  if (n == null) return null
  if (n === 0) return 'None of them were in this model’s training data, so this is a clean hold-out.'
  const total = (v.n_failed ?? 0) + (v.n_worked ?? 0)
  if (total && n / total <= 0.01)
    return `Only ${count(n)} of them were in this model’s training data, so this is close to a clean hold-out.`
  return `${count(n)} of them were in this model’s training data, so this is not a clean hold-out.`
}

function Figure({ src, caption }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <div className="model-fig model-fig-empty">{caption} — not served yet</div>
  return (
    <figure className="model-fig">
      <img src={src} alt={caption} onError={() => setFailed(true)} loading="lazy" />
      <figcaption className="muted small">{caption}</figcaption>
    </figure>
  )
}

export function ModelPanel() {
  const [cal, setCal] = useState(LOADING)
  const [val, setVal] = useState(LOADING)

  useEffect(() => {
    let alive = true
    const get = (path, set) =>
      fetch(`/api${path}`)
        .then((r) => (r.ok ? r.json() : UNAVAILABLE))
        .then((d) => alive && set(d))
        .catch(() => alive && set(UNAVAILABLE))
    get('/calibration/metrics', setCal)
    get('/validation/metrics', setVal)
    return () => {
      alive = false
    }
  }, [])

  const offline = cal === UNAVAILABLE && val === UNAVAILABLE
  const auc = val?.roc_auc

  return (
    <section className="panel model-panel" aria-labelledby="model-title">
      <h2 id="model-title">How good is the plausibility score?</h2>
      <p className="muted">
        Two measurements, read from the backend and shown the way they came out.
        {offline && ' The backend is not answering, so the numbers below are unavailable.'}
      </p>

      <div className="model-grid">
        <div>
          <h3>Calibration — the task it was trained on</h3>
          <p className="muted small">
            Telling real corpus reactions apart from products of other templates applied to the same reactants,
            on a held-out split.
          </p>
          <dl className="kv">
            <div className="kv-row">
              <dt>Held-out reactions</dt>
              <dd>{count(cal?.test_n)}</dd>
            </div>
            <div className="kv-row">
              <dt>ROC-AUC</dt>
              <dd>{num(cal?.calibrated?.roc_auc)}</dd>
            </div>
            <div className="kv-row">
              <dt>Calibration error</dt>
              <dd>
                {num(cal?.raw?.ece)} → {num(cal?.calibrated?.ece)}
              </dd>
            </div>
          </dl>
          <p className="muted small">{calibrationVerdict(cal) ?? '—'}</p>
        </div>

        <div>
          <h3>External check — real recorded outcomes</h3>
          <p className="muted small">
            {val?.source ? `${val.source}. ` : ''}Reactions that failed under every condition on record, against
            ones that worked under some condition. {overlapNote(val)}
          </p>
          <dl className="kv">
            <div className="kv-row">
              <dt>Failed / worked</dt>
              <dd>
                {count(val?.n_failed)} / {count(val?.n_worked)}
              </dd>
            </div>
            <div className="kv-row">
              <dt>ROC-AUC</dt>
              <dd>{num(auc)}</dd>
            </div>
            <div className="kv-row">
              <dt>Median score</dt>
              <dd>
                {num(val?.median_score_failed, 2)} failed vs {num(val?.median_score_worked, 2)} worked
              </dd>
            </div>
          </dl>
          <p className="muted small">{outcomeVerdict(auc) ?? '—'}</p>
          {val?.caveat && <p className="muted small">{val.caveat}</p>}
        </div>
      </div>

      <div className="model-figs">
        <Figure src="/api/calibration" caption="Reliability diagram (held-out split)" />
        <Figure src="/api/validation" caption="Scores against real recorded outcomes" />
      </div>
    </section>
  )
}
