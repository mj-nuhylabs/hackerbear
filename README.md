# SynthPath — 문헌 근거 합성 경로 플래너

화학자가 타겟 분자를 넣으면, **실제 문헌 레코드에 근거한** 합성 경로와 그 경로로 1 g을 만드는 데 드는 비용을 돌려준다.
LLM은 설명문만 쓴다 — SMILES, 수율, 가격, 출처는 전부 코퍼스 레코드 또는 코드 계산값.

## Setup

```bash
# macOS: LightGBM용
brew install libomp

# Python 3.10 venv (uv)
uv venv --python 3.10 .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt

# AiZynthFinder 사전학습 모델 + stock (~수백 MB)
.venv/bin/download_public_data backend/data/aizynth

# Frontend
cd frontend && npm install
```

### 데이터 (전부 gitignore — 아래로 다시 받는다)

```bash
# ORD projections (~1.3GB). 증거 코퍼스 + ML positive의 원천.
# repo는 ord-data가 아니라 ord-artifacts다. projections는 이미 평면화돼 있고 단위가
# 컬럼명에 접혀 있어(setpoint_kelvin) protobuf를 거치지 않는다.
.venv/bin/python -c "from huggingface_hub import snapshot_download; \
snapshot_download('open-reaction-database/ord-artifacts', repo_type='dataset', \
allow_patterns=['projections/**'], local_dir='backend/data/ord', max_workers=8)"

# USPTO-50K (~9MB). 특허번호가 붙은 큐레이션 반응 5만건. ML positive.
mkdir -p backend/data/uspto50k && for f in train-00000-of-00001 validation-00000-of-00001; do \
  curl -sL -o "backend/data/uspto50k/${f%%-*}.parquet" \
  "https://huggingface.co/datasets/pingzhili/uspto-50k/resolve/main/data/$f.parquet"; done
```

파생물은 코드로 만든다. `backend/data/ord/dataset_names.json`(데이터셋 id→이름)은 저장소에
들어 있다 — projections 메타데이터에는 이름이 없어서 복구할 데가 없다.

```bash
.venv/bin/python scripts/flatten_ord.py          # → backend/data/ord_flat.parquet (243만 반응)
cd backend && ../.venv/bin/python -m model.train --positives all   # → model.pkl, calibrator.pkl, calibration.png
.venv/bin/python -I scripts/attach_procedures.py # → backend/data/ord_hits.json (스텝별 실험 절차 원문)
```

`backend/data/ord_hits.json`(약 409 KB)은 커밋돼 있어서, 1.3 GB를 받지 않아도 데모의 실험 절차 패널은 돈다.

**출처와 라이선스.** 반응 레코드와 실험 절차 원문은 [Open Reaction Database](https://open-reaction-database.org)에서
오며 [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)이다. 절차 패널은 레코드마다 출처와 라이선스를 표시한다.

### Octet Draw 통합

[Octet Draw](https://github.com/SamChemMan/Octet-Draw) (Apache-2.0)가 `frontend/vendor/octet-draw/`에 들어 있고, 우리 React
앱 안에서 직접 렌더된다 (iframe 아님). 별도 빌드 단계 없음. 원본 커밋과 수정 내역은 `frontend/vendor/octet-draw/SYNTHPATH.md`.

- **그리기 패널**: 넓은 창(1100 px 이상)에서는 왼쪽에 항상 열려 있고, 결과는 그 오른쪽에 나온다. 앱 바의 **Hide drawing**으로
  접고, 경계를 끌어 너비를 바꾼다(너비는 기억됨). 좁은 창에서는 **Draw**로 열면 결과 위를 덮는다.
- 패널 아래 **Find routes for selection / drawing**: 선택이 닿은 분자 전체(선택이 없으면 그림 전체)를 Octet의 Indigo가 계산한
  SMILES로 검색한다. 원자 하나만 골라도 그 분자를 찾는다.
- 타겟 카드와 각 스텝 화합물의 **Add to drawing** → 그 구조를 그림 오른쪽에 선택된 채로 올린다.
- 검색창의 이름·CAS는 Octet의 오프라인 이름 해석기(OPSIN + Octet 사전)가 먼저 읽고, 읽은 구조의 썸네일과 종류를 검색창 안에
  보여 준다. 못 읽으면 `/resolve`로 그대로 보낸다.
- 타겟 카드의 **IUPAC name (Octet)**: Octet 명명기가 이름을 다시 구조로 읽어 검증한 이름. 없으면 `—`.
- 앱 바의 **Image**: 그림·사진에서 구조를 읽는다(DECIMER, 백엔드 필요). 원본과 읽은 구조를 나란히 보고 확인해야만 검색한다.
- 출처(그림, Octet 이름 해석, 이미지)는 타겟 카드의 **Structure from**에 표시된다.
- Octet의 UI는 SynthPath의 색·서체·강조색으로 다시 입혔고, 새 그림의 용지는 시스템 테마를 따른다(내보내기는 항상 흰 바탕).

## Run

```bash
cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

`cp .env.example .env` 후 `ANTHROPIC_API_KEY` 설정.
