import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { setFrame, synthpath } from '../../vendor/octet-draw/src/synthpath'
import { BAR_H, DRAW_MIN, STRIP, drawMax } from '../lib/layout'

// Octet Draw (vendor/octet-draw, Apache-2.0), built into the page as a pane pinned to the window's left edge, full
// height: its top-left corner is the window's, so Octet's pointer and overlay coordinates hold as they are. SynthPath's
// app bar lies over its top and this pane's status bar under it; Octet lays itself out between them
// (synthpath.ts frameTop/frameHeight/frameWidth). On a wide window the results sit to its right; on a narrow one the
// pane covers them while it is open.
const loadEditor = () => import('../octet/OctetEditor.jsx')
const OctetEditor = lazy(loadEditor)

// Puts a structure on the canvas (to the right of the drawing, selected): now if the editor is open, else when it
// next opens.
export function sendToDraw(smiles) {
  if (synthpath.load) synthpath.load(smiles)
  else synthpath.inbox = smiles
}

const same = (a, b) => a?.loaded === b?.loaded && a?.atoms === b?.atoms && a?.selected === b?.selected

export default function DrawPane({ open, side, width, onWidth, onSearch, busy }) {
  const [state, setState] = useState(undefined)
  const [problem, setProblem] = useState(null)
  // One element for the editor, so this pane's own updates never re-render Octet (which reports each of its renders).
  const editor = useMemo(() => <OctetEditor />, [])

  // Read by Octet as it renders, so set before it does (a parent renders before its children).
  setFrame(side ? width : undefined, STRIP, BAR_H)

  // Octet lays itself out again on a window resize; the pane changing size is one too.
  useEffect(() => {
    if (open) dispatchEvent(new Event('resize'))
  }, [open, side, width])

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
    setProblem(null)
    onSearch({ smiles: r.smiles, inchikey: r.inchikey })
  }

  // Drag the pane's right edge. The pane starts at the window's left edge, so the pointer's x is the new width.
  function startResize(e) {
    e.preventDefault()
    const move = (ev) => onWidth(Math.round(Math.max(DRAW_MIN, Math.min(drawMax(), ev.clientX))))
    const up = () => {
      removeEventListener('pointermove', move)
      removeEventListener('pointerup', up)
      document.body.classList.remove('draw-resizing')
    }
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
    document.body.classList.add('draw-resizing')
  }

  const ready = open && state?.loaded && state.atoms > 0
  const status =
    problem ??
    (!state?.loaded
      ? 'Loading Octet’s structure engine…'
      : state.selected
        ? 'Searches the selected structure.'
        : state.atoms
          ? 'Searches the whole drawing. Select a structure to search just that one.'
          : 'Draw a target, or paste a name or SMILES onto the sheet.')

  return (
    <aside className="draw-pane" data-mode={side ? 'side' : 'full'} hidden={!open} aria-label="Drawing (Octet Draw)">
      <div className="draw-stage">
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
      </div>
      <div className="draw-strip" role="group" aria-label="Search the drawing">
        <p className={`draw-status ${problem ? 'draw-problem' : ''}`} role="status">
          {status}
        </p>
        <button type="button" className="btn btn-primary" disabled={!ready || busy} onClick={search}>
          {state?.selected ? 'Find routes for selection' : 'Find routes for drawing'}
        </button>
      </div>
      {side && (
        <div
          className="draw-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the drawing pane"
          onPointerDown={startResize}
        />
      )}
    </aside>
  )
}
