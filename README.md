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

## Run

```bash
cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

`cp .env.example .env` 후 `ANTHROPIC_API_KEY` 설정.
