"""구조 그림 → SMILES. **격리된 venv(vendor/osr-venv)에서 돈다.**

DECIMER는 TensorFlow를 끌고 오는데, 그걸 메인 venv에 넣으면 RDKit/AiZynthFinder가 쓰는 numpy와
충돌할 수 있다. 그래서 따로 venv를 두고 서브프로세스로 부른다 (backend/chem/image.py).

이 스크립트는 모델이 뱉은 SMILES를 그대로 넘긴다. 검증·정규화는 RDKit이 있는 메인 venv에서 한다.

모델을 올리는 데 25초쯤 걸린다. 요청마다 새로 띄우면 못 쓰므로 --serve로 상주시킨다.

usage:
  vendor/osr-venv/bin/python scripts/osr_predict.py IMAGE [IMAGE ...]   한 번 돌고 끝
  vendor/osr-venv/bin/python scripts/osr_predict.py --serve             stdin에서 경로를 한 줄씩 받는다
출력: 한 줄에 JSON 하나 {"path":..., "smiles":..., "confidence":..., "error":...}
--serve는 모델을 다 올린 뒤 {"ready": true}를 먼저 한 줄 찍는다.
"""
import json
import sys


def load():
    """DECIMER 버전에 따라 신뢰도까지 주는 함수가 있기도 하고 없기도 하다."""
    import DECIMER  # noqa: N811  (패키지 이름이 대문자다)

    with_conf = getattr(DECIMER, "predict_SMILES_with_confidence", None)
    plain = getattr(DECIMER, "predict_SMILES", None)
    if plain is None and with_conf is None:
        raise RuntimeError("DECIMER has neither predict_SMILES nor predict_SMILES_with_confidence")
    return plain, with_conf


def predict(path, plain, with_conf):
    """(smiles, confidence) — 신뢰도는 못 구하면 None. 지어내지 않는다."""
    if with_conf is not None:
        try:
            out = with_conf(path)
            # 버전에 따라 [(token, conf), ...] 이거나 (smiles, conf)
            if isinstance(out, tuple) and len(out) == 2 and isinstance(out[0], str):
                return out[0], float(out[1])
            if isinstance(out, list) and out and isinstance(out[0], (list, tuple)):
                smiles = "".join(str(tok) for tok, _ in out)
                confs = [float(c) for _, c in out if c is not None]
                return smiles, (min(confs) if confs else None)
        except Exception:
            pass  # 아래 plain으로 넘어간다
    if plain is None:
        raise RuntimeError("no usable DECIMER entry point")
    return plain(path), None


def one(p, plain, with_conf):
    try:
        smiles, conf = predict(p, plain, with_conf)
        return {"path": p, "smiles": smiles, "confidence": conf, "error": None}
    except Exception as e:
        return {"path": p, "smiles": None, "confidence": None, "error": f"{type(e).__name__}: {e}"}


def emit(rec):
    print(json.dumps(rec, ensure_ascii=False), flush=True)


def main(argv):
    plain, with_conf = load()
    if argv[:1] == ["--serve"]:
        emit({"ready": True})
        for line in sys.stdin:  # 한 줄에 이미지 경로 하나
            p = line.strip()
            if p:
                emit(one(p, plain, with_conf))
        return
    for p in argv:
        emit(one(p, plain, with_conf))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1:])
