"""Evidence tier assignment.

REPORTED   an identical reaction record exists in the corpus (reactant set + product match on canonical SMILES)
ANALOGOUS  a template was applied and it has at least ANALOGOUS_MIN_PRECEDENTS literature precedents
COMPUTED   fewer precedents than that, or plausibility score below PLAUSIBILITY_MIN

If the score is None (no model / normalization failed), the tier is not downgraded; it is decided by precedent count
alone.
This is so that "missing" is never read as "low" (absolute rule 3).

What PLAUSIBILITY_MIN downgrades is a **structurally doubtful step**, not a step "that will not work in the lab".
The score does not predict real reaction outcomes (scripts/validate_external.py: ROC-AUC 0.47). So
this threshold is used only as a "the template looks misapplied" signal, never to raise a tier.
"""
from __future__ import annotations

from typing import Literal

EvidenceTier = Literal["REPORTED", "ANALOGOUS", "COMPUTED"]

ANALOGOUS_MIN_PRECEDENTS = 10
PLAUSIBILITY_MIN = 0.5

# Some steps have very many precedents but a low score and drop to COMPUTED. This is a decision, not a bug.
#
# Measured (6 molecules, 40 steps): 8 steps with 10+ precedents but score below 0.5.
#   paracetamol demethylation  precedents 13,100  score 0.227
#   lidocaine step             precedents  3,983  score 0.453
#   mCPBA sulfoxidation         precedents    655  score 0.478
# Also, per scripts/head2head.py the oxidation class is the weakest for the 1.33M model, at 0.637.
#
# We considered a rule "ignore a low score when precedents are many" and **decided not to add it.**
# Reason: the UI shows precedent count and score **both**. With 13,100 precedents next to a score of 0.227, the
# chemist sees that the model and the literature disagree and can judge for themselves. Picking one and hiding
# the other removes the material for that judgment, and is indistinguishable from tuning the threshold to
# make the demo look good.
#
# To change this, first produce better evidence than these numbers. "It looks bad" is not a reason to change it.


def decide(
    *,
    has_corpus_record: bool,
    precedent_count: int,
    plausibility_calibrated: float | None = None,
) -> EvidenceTier:
    """Evidence tier of one step. Inputs are all corpus lookup results or model output."""
    if has_corpus_record:
        return "REPORTED"
    if precedent_count < ANALOGOUS_MIN_PRECEDENTS:
        return "COMPUTED"
    if plausibility_calibrated is not None and plausibility_calibrated < PLAUSIBILITY_MIN:
        return "COMPUTED"
    return "ANALOGOUS"
