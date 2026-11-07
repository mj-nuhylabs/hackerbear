// API 계층. USE_MOCK=false로 바꾸면 FastAPI(/api → :8000)로 붙는다.
// 목업 응답은 API 계약(CLAUDE_HACKFNM.md)과 같은 모양을 유지한다.
import demo from './mock/demo.json'
import { computeCost } from './lib/cost'

export const USE_MOCK = false
export const ANALOGOUS_MIN = demo.analogous_min_precedents

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(path, body) {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Request to ${path} failed (${res.status})`)
  return res.json()
}

const hydrate = (c) => ({ ...c, svg: c.svg ?? demo.compounds[c.smiles]?.svg ?? null })
const hydrateRoute = (r) => ({
  ...r,
  steps: r.steps.map((s) => ({ ...s, reactants: s.reactants.map(hydrate), product: hydrate(s.product) })),
  leaf_materials: r.leaf_materials.map(hydrate),
})

export const DEMO_TARGETS = demo.targets.map((t) => ({ name: t.name, cas: t.cas }))

export function detectKind(q) {
  const s = q.trim()
  if (!s) return null
  if (/^\d{2,7}-\d{2}-\d$/.test(s)) return 'cas'
  if (!/\s/.test(s) && /[0-9=#()[\]@/\\]/.test(s)) return 'smiles'
  return 'name'
}

// inchikey: set for a structure drawn in Octet Draw, which computes it. The mock matches a drawing to a demo target
// by InChIKey, since Octet's SMILES is not written the same way as RDKit's.
export async function resolve(query, kind = 'auto', { inchikey } = {}) {
  if (!USE_MOCK) return post('/resolve', { query, kind })
  await sleep(380)
  const q = query.trim().toLowerCase()
  const t = demo.targets.find(
    (t) => t.aliases.includes(q) || t.compound.smiles.toLowerCase() === q || (inchikey && t.compound.inchikey === inchikey),
  )
  if (!t) {
    const names = DEMO_TARGETS.map((d) => d.name).join(', ')
    throw new Error(
      inchikey
        ? `The mockup only carries ${names} for now, and the drawing is none of them. The real build searches any drawn structure.`
        : `The mockup only carries ${names} for now. The real build resolves any name or CAS number through PubChem.`,
    )
  }
  return { ...hydrate(t.compound), name: t.name, cas: t.cas, search: t.search }
}

export async function getRoutes(smiles, maxDepth = 4) {
  if (!USE_MOCK) return post('/routes', { smiles, max_depth: maxDepth })
  await sleep(1100)
  const t = demo.targets.find((t) => t.compound.smiles === smiles)
  return { routes: t.routes.map(hydrateRoute) }
}

// 경로 하나의 BOM과 합계. 실제로는 POST /cost(backend/cost/stoich.py)가 data/prices.csv로 계산하고, 여기서는 UI가
// 쓰는 모양으로 옮기기만 한다. 목업에서는 같은 수식의 JS 구현(lib/cost.js)을 demo.json 가격으로 돌린다.
export async function getCost(route, { targetG, purification }) {
  if (USE_MOCK) return computeCost(route, { targetG, purification, prices: demo.prices })
  const c = await post('/cost', { route_id: route.id, target_g: targetG, purification_factor: purification })
  const leaves = new Map(route.leaf_materials.map((m) => [m.smiles, m]))
  return {
    lines: c.bom.map((l) => ({
      compound: leaves.get(l.smiles) ?? { smiles: l.smiles, mw: l.mw, name: l.name, svg: null },
      n: l.moles,
      massG: l.mass_g,
      price:
        l.price_per_g != null
          ? {
              price_per_g: l.price_per_g,
              pack_size_g: l.pack_size_g,
              pack_price: l.pack_price,
              currency: l.currency,
              supplier: l.supplier,
              as_of_date: l.as_of_date,
              mock: l.price_is_mock,
            }
          : null,
      consumption: l.consumption_cost,
      packs: l.packs,
      purchase: l.purchase_cost,
    })),
    stepScale: c.steps.map((s) => ({
      nRxn: s.n_rxn,
      yield: s.yield,
      yieldSource: s.yield_is_assumed ? 'assumed' : 'reported',
    })),
    catalysts: [],
    totals: {
      consumption: c.totals.consumption_cost,
      purchase: c.totals.purchase_cost,
      unpriced: c.totals.unpriced_materials,
      timeH: c.totals.reaction_time_h,
      untimedSteps: c.totals.steps_without_time,
    },
  }
}

// 목업 설명문. 실제로는 llm/explain.py가 검색된 레코드만 입력으로 받아 쓰고, 가드를 통과해야 나온다.
const EXPLAIN = {
  REPORTED: {
    why_works:
      'The corpus holds a record with these same reactants and this same product. Following the conditions in that record is the safest place to start.',
    why_fails:
      'Results can drift if your substrate purity or scale differs from the source record. Where the original says nothing about workup, that is the largest unknown.',
    next_experiment:
      'Reproduce the source conditions on a small scale first, confirm the product, and only then move up in scale.',
  },
  ANALOGOUS: {
    why_works:
      'The same reaction template recurs across many patent reactions. The closer your substrate looks to those precedents around the reaction centre, the more likely it carries over.',
    why_fails:
      'The precedent is similarity at the template level, not a record of this substrate. Other functional groups near the reaction centre can compete.',
    next_experiment:
      'Pick the precedent whose substrate is closest to yours, try its conditions on a small scale, and look for side reactions before anything else.',
  },
  COMPUTED: {
    why_works: 'The template applies to this substrate, but little in the literature backs it up.',
    why_fails:
      'No precedent for this substrate class was found in the corpus. This is the least certain step on the route.',
    next_experiment: 'Verify this step on its own first, or compare it against a route with more precedent behind it.',
  },
}

export async function explain(route, stepIndex) {
  if (!USE_MOCK) return post('/explain', { route_id: route.id, step_index: stepIndex })
  await sleep(1300)
  return { ...EXPLAIN[route.steps[stepIndex].evidence.tier], mock: true }
}
