import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { synthpath } from '../../vendor/octet-draw/src/synthpath'

// Octet Draw (vendor/octet-draw, Apache-2.0) in a full-window panel. Octet's editor assumes it owns the window, so
// the panel is the whole viewport and SynthPath's controls float over the bottom-left corner.
const loadEditor = () => import('../octet/OctetEditor.jsx')
const OctetEditor = lazy(loadEditor)

// Puts a structure on the canvas the next time the panel opens (to the right of the drawing, selected).
export function sendToDraw(smiles) {
  synthpath.inbox = smiles
}

const same = (a, b) => a?.loaded === b?.loaded && a?.atoms === b?.atoms && a?.selected === b?.selected

export default function DrawPanel({ open, onClose, onSearch, busy }) {
  const dialog = useRef(null)
  const [state, setState] = useState(undefined)
  const [problem, setProblem] = useState(null)
  // One element for the editor, so this panel's own updates never re-render Octet (which reports each of its renders).
  const editor = useMemo(() => <OctetEditor />, [])

  useEffect(() => {
    const d = dialog.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  useEffect(() => {
    synthpath.changed = () => {
      const next = synthpath.state && { ...synthpath.state }
      setState((prev) => (same(prev, next) ? prev : next))
      setProblem(null)
    }
    return () => {
      synthpath.changed = undefined
    }
  }, [])

  async function search() {
    const { readDrawing } = await loadEditor()
    const r = readDrawing()
    if (r.problem) return setProblem(r.problem)
    onSearch({ smiles: r.smiles, inchikey: r.inchikey })
  }

  const ready = open && state?.loaded && state.atoms > 0
  const status =
    problem ??
    (!state?.loaded
      ? 'Loading Octet’s structure engine…'
      : state.selected
        ? 'Searches the selection.'
        : state.atoms
          ? 'Searches the whole drawing. Select one structure to search only it.'
          : 'Draw a molecule, or convert a name to a structure.')

  return (
    // Escape belongs to Octet (it clears selections and tools), so it does not close the panel.
    <dialog ref={dialog} className="draw" aria-label="Draw a target in Octet Draw" onCancel={(e) => e.preventDefault()}>
      {open && (
        <Suspense
          fallback={
            <div className="draw-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              <p className="loading-title">Loading Octet Draw</p>
            </div>
          }
        >
          {editor}
        </Suspense>
      )}
      <div className="draw-bar" role="group" aria-label="SynthPath">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setProblem(null)
            onClose()
          }}
        >
          Back to SynthPath
        </button>
        <p className={`draw-status ${problem ? 'draw-problem' : ''}`} role="status">
          {status}
        </p>
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={search}>
          {state?.selected ? 'Find routes for selection' : 'Find routes'}
        </button>
      </div>
    </dialog>
  )
}
