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

# 선례가 아주 많은데도 점수가 낮아 COMPUTED로 내려가는 스텝이 있다. 버그가 아니라 결정이다.
#
# 실측 (6개 분자 40스텝): 선례 10건 이상인데 점수 0.5 미만이 8개.
#   파라세타몰 탈메틸화  선례 13,100  점수 0.227
#   리도카인 스텝        선례  3,983  점수 0.453
#   mCPBA 설폭사이드화   선례    655  점수 0.478
# 그리고 scripts/head2head.py 기준 산화 클래스는 1.33M 모델에서 0.637로, 가장 약한 쪽이다.
#
# "선례가 많으면 낮은 점수를 무시한다"는 규칙을 넣을지 검토했고, **넣지 않기로 했다.**
# 이유: UI가 선례 수와 점수를 **둘 다** 보여준다. 선례 13,100 옆에 점수 0.227이 그대로 뜨므로,
# 화학자는 모델과 문헌이 엇갈린다는 사실 자체를 보고 직접 판단할 수 있다. 한쪽을 골라 숨기면
# 그 판단 재료가 사라진다. 임계값을 조정해 데모를 보기 좋게 만드는 것과도 구분되지 않는다.
#
# 바꾸려면 이 숫자들보다 나은 근거를 먼저 만들 것. 그냥 보기 안 좋다는 이유로는 바꾸지 않는다.


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
