// API 계층. USE_MOCK=false로 바꾸면 FastAPI(/api → :8000)로 붙는다.
// 목업 응답은 API 계약(CLAUDE_HACKFNM.md)과 같은 모양을 유지한다.
import demo from './mock/demo.json'

export const USE_MOCK = true
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

export async function resolve(query, kind = 'auto') {
  if (!USE_MOCK) return post('/resolve', { query, kind })
  await sleep(380)
  const q = query.trim().toLowerCase()
  const t = demo.targets.find((t) => t.aliases.includes(q) || t.compound.smiles.toLowerCase() === q)
  if (!t) {
    const names = DEMO_TARGETS.map((d) => d.name).join(', ')
    throw new Error(
      `The mockup only carries ${names} for now. The real build resolves any name or CAS number through PubChem.`,
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

// STUB: 실제로는 POST /cost가 가격 스냅샷(data/prices.csv)으로 계산해 돌려준다
export const getPrices = () => demo.prices

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
