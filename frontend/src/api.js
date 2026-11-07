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
  if (!res.ok) throw new Error(`${path} 요청이 실패했습니다 (${res.status})`)
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
      `목업 데이터에 없는 분자입니다. 지금은 ${names}만 조회됩니다. 실제 버전에서는 PubChem으로 이름과 CAS 번호를 SMILES로 바꿉니다.`,
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
      '코퍼스에 같은 반응물과 생성물을 가진 레코드가 있습니다. 출처 레코드의 조건을 그대로 따라가는 것이 가장 안전한 출발점입니다.',
    why_fails:
      '출처 레코드와 기질 순도나 스케일이 다르면 결과가 달라질 수 있습니다. 원문에 후처리 정보가 빠져 있다면 그 부분이 가장 큰 불확실성입니다.',
    next_experiment: '출처 조건으로 소량 재현부터 하고, 생성물을 확인한 뒤 스케일을 올리세요.',
  },
  ANALOGOUS: {
    why_works:
      '같은 반응 템플릿이 여러 특허 반응에서 반복해서 쓰였습니다. 반응 중심 주변 구조가 선례와 비슷할수록 그대로 옮겨질 가능성이 높습니다.',
    why_fails:
      '선례는 템플릿 수준의 유사성이고 이 기질 자체의 기록은 아닙니다. 반응 중심 근처의 다른 작용기가 경쟁 반응을 일으킬 수 있습니다.',
    next_experiment: '기질 구조가 가장 가까운 선례 레코드의 조건을 골라 소량으로 시험하고, 부반응 여부를 먼저 확인하세요.',
  },
  COMPUTED: {
    why_works: '템플릿은 이 기질에 적용되지만 뒷받침하는 문헌 선례가 적습니다.',
    why_fails: '코퍼스에서 이 기질 유형의 선례를 찾지 못했습니다. 이 경로에서 가장 불확실한 단계입니다.',
    next_experiment: '이 단계를 먼저 단독으로 검증하거나, 선례가 더 많은 다른 경로와 비교하세요.',
  },
}

export async function explain(route, stepIndex) {
  if (!USE_MOCK) return post('/explain', { route_id: route.id, step_index: stepIndex })
  await sleep(1300)
  return { ...EXPLAIN[route.steps[stepIndex].evidence.tier], mock: true }
}
