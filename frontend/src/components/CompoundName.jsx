import { useEffect, useState } from 'react'
import { nameOf } from '../octet/engine'

// 한 화합물을 사람이 읽는 이름으로. 출처 순서는 backend/chem/names.py와 같다:
//   1. 백엔드가 준 이름 — 공급사 제품명(prices.csv)이나 레코드가 적어 둔 NAME
//   2. Octet의 오프라인 IUPAC 네이머 — 결정론적 코드다. 이름을 다시 읽어 확인한다
//   3. 둘 다 없으면 SMILES 자체
// SMILES는 지우지 않는다. 이성질체를 확인할 때 이름보다 SMILES가 정확하고, 이 프로젝트에서
// 스텝이 레코드와 같은 반응임을 증명하는 것도 SMILES다. 이름을 앞에 두고 SMILES를 밑에 작게 둔다.
export default function CompoundName({ compound, name, smiles, showSmiles = true, className = '' }) {
  const smi = smiles ?? compound?.smiles
  const given = name ?? compound?.name ?? null
  const [octet, setOctet] = useState(undefined)

  useEffect(() => {
    if (given || !smi) return undefined
    let live = true
    nameOf(smi).then(
      (n) => live && setOctet(n),
      () => live && setOctet(null),
    )
    return () => {
      live = false
    }
  }, [smi, given])

  if (!smi && !given) return null
  const shown = given ?? (octet || null)
  return (
    <span className={`cmpd ${className}`}>
      <span className="cmpd-name" title={smi ?? undefined}>
        {shown ?? smi}
      </span>
      {showSmiles && shown && smi && <code className="cmpd-smiles">{smi}</code>}
    </span>
  )
}
