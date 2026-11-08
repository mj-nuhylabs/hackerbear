// Octet Draw's editor (vendor/octet-draw, Apache-2.0, Sam Ellis), rendered in SynPath's Draw panel. This module
// loads only when the panel first opens: the editor with Indigo's wasm and Octet's data is about 25 MB.
//
// Octet's stylesheets are scoped to .octet-host (vite.config.js). The editor unmounts when the panel closes; Octet
// keeps the drawing in `rescue` (its crash recovery) and starts from it the next time.
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '../../vendor/octet-draw/brand/tokens.css' // before Editor, which reads drawing tokens at load
import { Component } from 'react'
import Editor, { keepNow } from '../../vendor/octet-draw/src/Editor'
import { toInchiKey, toSmiles } from '../../vendor/octet-draw/src/chem'
import { synpath } from '../../vendor/octet-draw/src/synpath'

class Guard extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('Octet Draw stopped', error)
    keepNow()
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="draw-loading" role="alert">
        <p className="loading-title">Octet Draw stopped</p>
        <p className="muted small">The drawing as last drawn is kept.</p>
        <button type="button" className="btn" onClick={() => this.setState({ failed: false })}>
          Open it again
        </button>
      </div>
    )
  }
}

export default function OctetEditor() {
  return (
    <Guard>
      <div className="octet-host">
        <Editor />
      </div>
    </Guard>
  )
}

// The structure SynPath searches: the selection, or the whole drawing when nothing is selected. Octet's Indigo
// engine writes the SMILES (without the CXSMILES part, as Octet's own Search PubChem sends it) and the InChIKey.
export function readDrawing() {
  const s = synpath.state
  if (!s?.loaded) return { problem: 'Octet is still loading its structure engine.' }
  const mol = synpath.part?.()
  if (!mol?.atoms.length) return { problem: s.selected ? 'The selection holds no structure.' : 'Draw a structure first.' }
  let smiles, inchikey
  try {
    smiles = toSmiles(mol).split(/\s/)[0]
    inchikey = toInchiKey(mol)
  } catch {
    return { problem: 'Octet could not read this structure.' }
  }
  if (!smiles) return { problem: 'Octet could not read this structure.' }
  if (smiles.includes('*')) return { problem: 'Generic atoms (R, X, A, Q) can’t be searched. Draw one specific molecule.' }
  if (smiles.includes('.'))
    return {
      problem: s.selected
        ? 'The selection holds more than one structure. Select only the target.'
        : 'The drawing holds more than one structure. Select the target first.',
    }
  return { smiles, inchikey }
}
