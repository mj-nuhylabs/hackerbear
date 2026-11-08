// Lay out a route as a paper-style reaction scheme: pick the main chain backward from the target,
// put the remaining reactants as auxiliary inputs above the arrow, and place steps off the chain as branches.
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
