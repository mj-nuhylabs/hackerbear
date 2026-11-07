"""증거 등급 판정.

REPORTED   코퍼스에 동일 반응 레코드 존재 (정규화 SMILES로 반응물 집합 + 생성물 일치)
ANALOGOUS  템플릿이 적용됐고, 그 템플릿의 문헌 선례가 ANALOGOUS_MIN_PRECEDENTS건 이상
COMPUTED   선례가 그보다 적거나, 타당성 점수가 PLAUSIBILITY_MIN 미만

점수가 None이면(모델 없음/정규화 실패) 등급을 깎지 않는다. 선례 수만으로 판정한다.
"없음"을 "낮음"으로 바꿔 읽지 않기 위해서다 (절대 규칙 3).

PLAUSIBILITY_MIN이 깎는 것은 **구조적으로 미심쩍은 스텝**이지 "실험이 안 될 스텝"이 아니다.
점수는 실제 반응 결과를 맞히지 못한다(scripts/validate_external.py: ROC-AUC 0.47). 그래서
이 임계값은 "템플릿이 엉뚱하게 적용된 것 같다"는 신호로만 쓰고, 등급을 올리는 데는 쓰지 않는다.
"""
from __future__ import annotations

from typing import Literal

EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]

ANALOGOUS_MIN_PRECEDENTS = 10
PLAUSIBILITY_MIN = 0.5


def decide(
    *,
    has_corpus_record: bool,
    precedent_count: int,
    plausibility_calibrated: float | None = None,
) -> EvidenceTier:
    """스텝 하나의 증거 등급. 입력은 전부 코퍼스 조회 결과이거나 모델 출력이다."""
    if has_corpus_record:
        return "REPORTED"
    if precedent_count < ANALOGOUS_MIN_PRECEDENTS:
        return "COMPUTED"
    if plausibility_calibrated is not None and plausibility_calibrated < PLAUSIBILITY_MIN:
        return "COMPUTED"
    return "ANALOGOUS"
