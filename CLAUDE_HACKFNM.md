# SynthPath — 문헌 근거 합성 경로 플래너

해커톤 프로젝트. 개발 시간 12시간. Applied AI 트랙.

## 한 줄

화학자가 타겟 분자를 넣으면, **실제 문헌 레코드에 근거한** 합성 경로와 그 경로로 1 g을 만드는 데 드는 비용을 돌려준다.

---

## 절대 규칙 — 다른 모든 것보다 우선

이 프로젝트의 차별점은 "환각하지 않는다"이다. 아래를 어기면 프로젝트 자체가 무의미해진다.

1. **LLM은 화학적 사실을 생성하지 않는다.** LLM이 출력해도 되는 것은 자연어 설명문뿐이다. SMILES, 수율, 가격, DOI, 특허번호, 반응 조건을 LLM이 만들어내면 **버그다.**
2. **UI에 뜨는 모든 숫자는 출처가 있어야 한다.** 코퍼스 레코드의 `source_id`이거나, 코드로 계산한 값이거나 둘 중 하나. 제3의 출처는 없다.
3. **값이 없으면 `None`을 반환하고 UI에 `—`로 띄운다.** 절대 추정값이나 "전형적인 값"으로 채우지 않는다.
4. **반응이 새롭다고 주장하지 않는다.** 우리 코퍼스에 없다는 것뿐이다. 문구는 "코퍼스에서 선례를 찾지 못함".
5. 제안된 반응의 메커니즘을 실험적 사실인 것처럼 서술하지 않는다.

이 규칙들을 코드로 강제한다: `evidence/guards.py`에 LLM 출력에서 SMILES 패턴·숫자+단위·DOI 패턴을 검출하면 예외를 던지는 가드를 두고, 설명 생성 경로에 반드시 통과시킨다.

---

## 아키텍처 — 3층, 경계를 섞지 말 것

```
[결정론적 화학 엔진]  RDKit, 반응 템플릿, 양론 계산
         ↓ 경로 + 스텝
[학습한 모델]         반응 타당성 분류기 + 캘리브레이션
         ↓ 점수
[LLM]                 설명문 생성만. 입력은 이미 검색된 레코드뿐
```

각 층은 아래층의 출력만 소비한다. LLM이 화학 엔진을 호출하는 구조(에이전트 루프)로 만들지 말 것 — 12시간에 디버깅 불가능하고, 환각 통제도 깨진다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 런타임 | Python 3.10 (conda) | AiZynthFinder가 3.9–3.11만 지원 |
| 화학 | RDKit, RDChiral | |
| 경로 탐색 | AiZynthFinder (사전학습 모델) | `download_public_data`로 받음 |
| ML | LightGBM, scikit-learn | 캘리브레이션에 `CalibratedClassifierCV` |
| 백엔드 | FastAPI + uvicorn | |
| 프론트 | Vite + React, 단일 페이지 | Next.js 쓰지 말 것. 셋업 시간이 아깝다 |
| 분자 렌더 | RDKit `MolToImage` → SVG 문자열 | 프론트에 그대로 꽂음 |

---

## 데이터 소스

- **USPTO 반응 데이터** — AiZynthFinder 템플릿의 원천. 특허번호가 그대로 출처가 된다.
- **ORD (Open Reaction Database)** — HuggingFace 미러에서 parquet으로 직접 받는다. `pip install ord-schema`는 PostgreSQL 의존성 때문에 환경이 깨질 수 있으므로 **쓰지 말 것.**
- **PubChem PUG REST** — 이름/CAS → SMILES 변환. 무료, API 키 불필요.
- **가격** — `data/prices.csv`에 빌딩블록 약 200개의 정적 스냅샷. 컬럼에 `as_of_date` 필수. 실시간 공급사 API는 범위 밖.

---

## 디렉터리 구조

```
backend/
  main.py                FastAPI 앱, 라우트만
  chem/
    resolve.py           이름/CAS/SMILES → 정규 SMILES + MW + SVG
    routes.py            AiZynthFinder 래핑 → Route 객체
    templates.py         템플릿 적용, RDChiral 폴백 경로
  evidence/
    corpus.py            반응 레코드 로드 + 인덱싱
    provenance.py        템플릿 → 원본 레코드 역매핑
    tiers.py             증거 등급 판정
    guards.py            LLM 출력 가드 (절대 규칙 참조)
  model/
    featurize.py         반응 → fingerprint
    train.py             학습 스크립트 (한 번 돌리고 pkl 저장)
    calibrate.py         isotonic + reliability diagram PNG 생성
    predict.py           추론
  cost/
    stoich.py            역방향 양론
    prices.py            가격 조회
  llm/
    explain.py           설명 생성. 입력 = 레코드 리스트만
  data/                  코퍼스, prices.csv, model.pkl, calibrator.pkl
frontend/
  src/App.jsx            단일 페이지
```

---

## 핵심 데이터 모델

Pydantic으로 정의하고 이 모양을 끝까지 유지한다.

```python
EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]

class Evidence(BaseModel):
    tier: EvidenceTier
    source_ids: list[str]        # 특허번호 또는 ORD reaction id
    precedent_count: int         # 이 템플릿의 문헌 선례 수
    url: str | None              # 원본으로 가는 링크

class Step(BaseModel):
    rxn_smiles: str
    template_id: str | None
    reactants: list[Compound]
    product: Compound
    evidence: Evidence
    conditions: Conditions | None      # 없으면 None. 추정 금지
    reported_yield: float | None       # 문헌값. 없으면 None
    assumed_yield: float               # 계산용 가정값. 출처를 label에 명시
    plausibility_raw: float | None
    plausibility_calibrated: float | None

class Route(BaseModel):
    id: str
    steps: list[Step]                  # 위상 정렬, 출발물질 → 타겟
    leaf_materials: list[Compound]     # 구매 대상
```

---

## API 계약

```
POST /resolve   {query, kind}          → {smiles, inchikey, mw, svg}
POST /routes    {smiles, max_depth=4}  → {routes: Route[]}
POST /cost      {route_id, target_g}   → {bom: BomLine[], totals: {...}}
POST /explain   {route_id, step_index} → {why_works, why_fails, next_experiment}
GET  /gaps      ?template_id=          → {untested_substrate_classes: [...]}
GET  /calibration                      → reliability diagram PNG
```

---

## 비용 엔진 수식 — 정확히 이대로 구현할 것

이 부분은 ML이 아니라 순수 계산이다. **데모에서 절대 깨지면 안 되는 부분**이므로 정확히 맞춰야 한다.

마지막 스텝부터 역방향으로 순회한다.

```
# 1. 타겟 요구 몰수
n_needed[target] = target_mass_g / MW(target)

# 2. 각 스텝 i (타겟 쪽부터)
n_rxn[i] = n_needed[product_i] / (yield_i * purification_factor_i)

# 3. 그 스텝의 각 반응물 j
n_needed[reactant_j] += n_rxn[i] * stoich_j * equiv_j

# 4. 촉매
n_cat[i] = n_rxn[i] * catalyst_loading_i    # loading은 몰분율

# 5. 반응물이 앞 스텝의 중간체면 그 스텝의 n_needed가 되어 재귀
#    말단(구매 가능) 물질이면 여기서 멈춤

# 6. 말단 물질의 비용 — 두 가지를 분리해서 둘 다 보여준다
mass_g        = n_needed * MW
consumption   = mass_g * price_per_g                      # 실제 소비량 기준
purchase      = ceil(mass_g / pack_size_g) * pack_price   # 실제 지불액
```

- `purification_factor`는 기본 0.9로 두고 UI에서 조절 가능하게. **가정값임을 반드시 라벨에 표시한다.**
- `yield_i`는 문헌값이 있으면 그것, 없으면 가정값을 쓰되 `assumed`로 표시.
- 총 소요일 = 각 스텝 반응시간 + 후처리 시간의 합. 문헌에 없는 스텝은 합계에서 빼고 "n개 스텝 시간 미상"으로 표기.

---

## 증거 등급 판정 규칙

```
REPORTED   — 코퍼스에 동일 반응 레코드 존재 (정규화 SMILES로 반응물 집합 + 생성물 일치)
ANALOGOUS  — 템플릿이 적용됐고, 그 템플릿의 문헌 선례가 10건 이상
COMPUTED   — 템플릿이 적용됐으나 선례가 10건 미만, 또는 타당성 점수가 낮음
```

임계값 10은 조절 가능한 상수로 둔다. UI 배지 색: REPORTED 초록, ANALOGOUS 노랑, COMPUTED 회색.

---

## ML 모델 스펙

**목표**: 반응 타당성 이진 분류 + 캘리브레이션된 확률.

- Positive: 코퍼스의 실제 반응
- Negative: 같은 반응물에 템플릿을 잘못 적용해 생성한 가짜 생성물 (positive당 1~3개)
- 피처: 생성물 Morgan fingerprint − 반응물 Morgan fingerprint 합 (2048 bit, radius 2). DRFP를 쓸 수 있으면 그쪽이 낫다.
- 모델: `LGBMClassifier`, 기본 하이퍼파라미터로 충분
- **캘리브레이션 필수**: 홀드아웃에 `CalibratedClassifierCV(method="isotonic")`, reliability diagram을 PNG로 저장해 `/calibration`으로 서빙

성능이 낮게 나와도 모델을 빼지 않는다. 캘리브레이션 곡선을 그대로 보여주는 것이 정직한 결과이고 그 자체가 발표 포인트다.

---

## 빌드 순서

1. `chem/resolve.py` + `/resolve` — 입력이 되는지부터
2. `chem/routes.py` + `/routes` — AiZynthFinder 래핑
3. `evidence/` 전체 — 등급과 출처
4. `model/train.py` 실행 (백그라운드) + `cost/` 구현 (병렬)
5. `llm/explain.py`
6. 프론트 조립

각 단계가 끝날 때마다 해당 엔드포인트가 curl로 응답하는지 확인하고 다음으로 간다.

---

## 하지 말 것

- 스펙에 없는 기능 추가. 아이디어가 떠오르면 `IDEAS.md`에 적고 넘어간다.
- 테스트 스위트 작성. 12시간이고, 데모 경로 3개가 도는 것이 테스트다.
- 에이전트 루프, 멀티 에이전트, RAG 체인 구조. 디버깅에 시간을 다 쓴다.
- Docker, CI, 배포 설정. 로컬에서 돈다.
- 데이터베이스. parquet/CSV를 메모리에 올린다.
- 리팩터링. 돌아가면 둔다.
- 깨진 실제 구현보다 작동하는 스텁이 낫다. 스텁에는 `# STUB:` 주석을 반드시 남긴다.

막히면 멈추고 물어본다. 혼자 대안 아키텍처로 전환하지 말 것.
