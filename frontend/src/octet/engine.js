// Octet's offline name reader and namer (vendor/octet-draw): OPSIN, Octet's dictionary and drug names, its IUPAC
// namer and Indigo, as Octet's own Name to Structure page uses them (web/namedemo.ts). Deterministic code, not a
// model: text it cannot read comes back as a problem, never a guess. Loaded in the background (about 15 MB).
let loading
let loaded = false

export function loadEngine() {
  // Octet's tokens first: chem.ts reads its bond lengths and label sizes from them as it loads.
  loading ??= import('../../vendor/octet-draw/brand/tokens.css')
    .then(() => Promise.all([import('../../vendor/octet-draw/web/namedemo.ts'), import('../../vendor/octet-draw/src/chem.ts')]))
    .then(async ([demo, chem]) => {
      await demo.load()
      loaded = true
      return { demo, chem }
    })
    .catch((e) => {
      loading = undefined
      throw e
    })
  return loading
}

export const engineReady = () => loaded

// A name, CAS number, InChI or SMILES as Octet reads it: { smiles, inchikey, svg, kind, shown, corrected, name }, or
// { problem }. `shown` is the text Octet read: what was typed, or the name it corrected a misspelling to.
export async function readText(text) {
  const { demo, chem } = await loadEngine()
  const r = demo.lookup(text)
  if ('problem' in r) return { problem: r.problem || null }
  let inchikey
  try {
    inchikey = chem.toInchiKey(chem.parseStructure(r.smiles))
  } catch {
    inchikey = undefined
  }
  return { ...r, inchikey }
}

// Octet's name for a structure (its IUPAC namer, checked by reading the name back), or null when it has none.
export async function nameOf(smiles) {
  const { demo } = await loadEngine()
  const r = demo.lookup(smiles)
  return 'problem' in r ? null : (r.name ?? null)
}
