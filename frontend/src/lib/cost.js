// 비용 엔진 — CLAUDE_HACKFNM.md "비용 엔진 수식"을 그대로 옮김.
// 목업 전용 JS 구현. 실제 버전은 backend/cost/stoich.py가 POST /cost로 계산한다.

const DEFAULT_STOICH = 1 // STUB: 반응식 계수. 코퍼스 레코드에서 채워질 예정
const DEFAULT_EQUIV = 1 // STUB: 당량. 문헌 조건에서 채워질 예정

export function computeCost(route, { targetG, purification, prices }) {
  const steps = route.steps
  const need = new Map() // smiles → 필요 몰수
  const add = (smi, n) => need.set(smi, (need.get(smi) ?? 0) + n)

  // 1. 타겟 요구 몰수
  const target = steps[steps.length - 1].product
  add(target.smiles, targetG / target.mw)

  // 2–5. 타겟 쪽 스텝부터 역방향 (steps는 출발물질 → 타겟 위상 정렬)
  const stepScale = new Array(steps.length)
  const catalysts = []
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    const y = s.reported_yield ?? s.assumed_yield
    const nRxn = (need.get(s.product.smiles) ?? 0) / (y * purification)
    stepScale[i] = { nRxn, yield: y, yieldSource: s.reported_yield != null ? 'reported' : 'assumed' }
    for (const r of s.reactants) add(r.smiles, nRxn * DEFAULT_STOICH * DEFAULT_EQUIV)
    const loading = s.conditions?.catalyst_loading
    if (loading) catalysts.push({ step: i, name: s.conditions.catalyst, n: nRxn * loading })
  }

  // 6. 말단 물질 비용 — 소비량 기준과 실제 구매액을 분리
  const lines = route.leaf_materials.map((leaf) => {
    const n = need.get(leaf.smiles) ?? 0
    const massG = n * leaf.mw
    const p = prices[leaf.smiles] ?? null
    const packs = p ? Math.ceil(massG / p.pack_size_g) : null
    return {
      compound: leaf,
      n,
      massG,
      price: p,
      consumption: p ? massG * p.price_per_g : null,
      packs,
      purchase: p ? packs * p.pack_price : null,
    }
  })

  const sum = (k) => lines.reduce((a, l) => a + (l[k] ?? 0), 0)
  const unpriced = lines.filter((l) => !l.price).length

  // 총 소요 시간: 문헌에 시간이 있는 스텝만 합산
  const timed = steps.filter((s) => s.conditions?.time_h != null)
  return {
    lines,
    stepScale,
    catalysts,
    totals: {
      consumption: sum('consumption'),
      purchase: sum('purchase'),
      unpriced,
      timeH: timed.length ? timed.reduce((a, s) => a + s.conditions.time_h, 0) : null,
      untimedSteps: steps.length - timed.length,
    },
  }
}
