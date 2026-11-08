// Cost engine -- a direct port of the "cost engine formula" in CLAUDE_HACKFNM.md.
// Mock-only JS implementation. In the real app backend/cost/stoich.py computes it via POST /cost.

const DEFAULT_STOICH = 1 // STUB: reaction stoichiometric coefficient. To be filled from corpus records
const DEFAULT_EQUIV = 1 // STUB: equivalents. To be filled from literature conditions

export function computeCost(route, { targetG, purification, prices }) {
  const steps = route.steps
  const need = new Map() // smiles → moles needed
  const add = (smi, n) => need.set(smi, (need.get(smi) ?? 0) + n)

  // 1. Moles of target required
  const target = steps[steps.length - 1].product
  add(target.smiles, targetG / target.mw)

  // 2-5. Backward from the target-side step (steps are topologically sorted starting material -> target)
  const stepScale = new Array(steps.length)
  const catalysts = []
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    // A yield of 0 or negative would divide by zero. If the value is unusable, fall back to the assumed value.
    const reported = s.reported_yield > 0 ? s.reported_yield : null
    const y = reported ?? s.assumed_yield
    const nRxn = (need.get(s.product.smiles) ?? 0) / (y * purification)
    stepScale[i] = { nRxn, yield: y, yieldSource: reported != null ? 'reported' : 'assumed' }
    for (const r of s.reactants) add(r.smiles, nRxn * DEFAULT_STOICH * DEFAULT_EQUIV)
    const loading = s.conditions?.catalyst_loading
    if (loading) catalysts.push({ step: i, name: s.conditions.catalyst, n: nRxn * loading })
  }

  // 6. Cost of terminal materials -- consumption-based and actual purchase amount kept separate
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

  // Sum only lines that have a price. If none do, the result is null, not 0 (same as backend/cost/stoich.py) -- $0.00 would be a lie
  const sum = (k) => (lines.some((l) => l[k] != null) ? lines.reduce((a, l) => a + (l[k] ?? 0), 0) : null)
  const unpriced = lines.filter((l) => !l.price).length

  // Total time: sum only steps that have a time in the literature
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
