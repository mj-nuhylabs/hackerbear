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
- 출처(그림, Octet 이름 해석)는 타겟 카드의 **Structure from**에 표시된다.
- Octet의 UI는 SynthPath의 색·서체·강조색으로 다시 입혔고, 새 그림의 용지는 시스템 테마를 따른다(내보내기는 항상 흰 바탕).

## Run

```bash
cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

`cp .env.example .env` 후 `ANTHROPIC_API_KEY` 설정.
