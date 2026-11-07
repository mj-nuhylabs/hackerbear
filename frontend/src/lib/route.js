// 경로를 논문식 반응 스킴으로 배치: 타겟에서 거꾸로 주 사슬을 잡고,
// 나머지 반응물은 화살표 위 보조 투입물로, 사슬 밖 스텝은 분기로 둔다.
export function schemeLayout(route) {
  const steps = route.steps
  const producedBy = new Map(steps.map((s, i) => [s.product.smiles, i]))

  const chain = []
  let cur = steps.length - 1
  while (cur != null) {
    chain.unshift(cur)
    const intermediates = steps[cur].reactants
      .filter((r) => producedBy.has(r.smiles))
      .sort((a, b) => b.mw - a.mw)
    cur = intermediates.length ? producedBy.get(intermediates[0].smiles) : null
  }

  const first = steps[chain[0]]
  const start = [...first.reactants].sort((a, b) => b.mw - a.mw)[0]

  const withSource = (r) => ({ ...r, fromStep: producedBy.has(r.smiles) ? producedBy.get(r.smiles) : null })

  const cells = chain.map((i, k) => {
    const mainIn = k === 0 ? start.smiles : steps[chain[k - 1]].product.smiles
    return {
      stepIndex: i,
      side: steps[i].reactants.filter((r) => r.smiles !== mainIn).map(withSource),
      product: steps[i].product,
    }
  })

  const branches = steps
    .map((s, i) => ({ stepIndex: i, reactants: s.reactants.map(withSource), product: s.product }))
    .filter((b) => !chain.includes(b.stepIndex))

  return { start, cells, branches }
}

export function tierCounts(route) {
  const c = { REPORTED: 0, ANALOGOUS: 0, COMPUTED: 0 }
  for (const s of route.steps) c[s.evidence.tier]++
  return c
}
