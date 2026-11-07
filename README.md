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

### Octet Draw 통합

[Octet Draw](https://github.com/SamChemMan/Octet-Draw) (Apache-2.0)가 `frontend/vendor/octet-draw/`에 들어 있고, 우리 React
앱 안에서 직접 렌더된다 (iframe 아님). 별도 빌드 단계 없음. 원본 커밋과 수정 내역은 `frontend/vendor/octet-draw/SYNTHPATH.md`.

- **Draw** 버튼 → 전체 화면 Octet 에디터. 선택한 구조(없으면 전체 그림)를 Octet의 Indigo가 계산한 SMILES로 검색한다.
- 타겟 카드와 각 스텝 화합물의 **Open in Draw** → 그 구조를 에디터에 올린다.
- 검색창의 이름·CAS는 Octet의 오프라인 이름 해석기(OPSIN + Octet 사전)가 먼저 읽는다. 못 읽으면 `/resolve`로 그대로 보낸다.
- 타겟 카드의 **IUPAC name (Octet)**: Octet 명명기가 이름을 다시 구조로 읽어 검증한 이름. 없으면 `—`.
- 출처는 타겟 카드의 **Structure from**에 표시된다.

## Run

```bash
cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

`cp .env.example .env` 후 `ANTHROPIC_API_KEY` 설정.
