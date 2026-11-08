import { useEffect, useState } from 'react'
import { nameOf } from '../octet/engine'

// Show one compound as a human-readable name. The source order matches backend/chem/names.py:
//   1. The name the backend gave -- a supplier product name (prices.csv) or the NAME the record lists
//   2. Octet's offline IUPAC namer -- deterministic code. Parse the name back to check it
//   3. If neither exists, the SMILES itself
// The SMILES is never removed. For checking isomers the SMILES is more exact than the name, and in this project
// the SMILES is also what proves a step is the same reaction as the record. Put the name first and the SMILES small underneath.
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
