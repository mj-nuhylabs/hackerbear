import { useEffect, useRef, useState } from 'react'
import './imagepanel.css'

// A structure read from an image is a model's guess, not a record. So we place it next to the original and
// pass it to route search only after the user says "correct". We never search automatically.

const ENDPOINT = '/api/recognise'

export default function ImagePanel({ open, onClose, onSearch, busy }) {
  const dialog = useRef(null)
  const input = useRef(null)
  const [file, setFile] = useState(null)      // { name, url }
  const [state, setState] = useState({ status: 'idle' })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const d = dialog.current
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Release the preview object URL when the file changes or the panel closes
  useEffect(() => () => file && URL.revokeObjectURL(file.url), [file])

  function reset() {
    setFile(null)
    setState({ status: 'idle' })
    if (input.current) input.current.value = ''
  }

  async function send(picked) {
    if (!picked) return
    if (!picked.type?.startsWith('image/')) {
      setState({ status: 'error', message: `${picked.name} is not an image.` })
      return
    }
    setFile({ name: picked.name, url: URL.createObjectURL(picked) })
    setState({ status: 'reading' })

    const body = new FormData()
    body.append('file', picked)
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', body })
      if (!res.ok) {
        const detail = await res.json().catch(() => null)
        throw new Error(detail?.detail ?? `the server answered ${res.status}`)
      }
      const data = await res.json()
      if (!data.ok || !data.smiles) {
        setState({ status: 'error', message: data.error ?? 'No structure could be read from this image.' })
        return
      }
      setState({ status: 'done', data })
    } catch (e) {
      // With only the mock running there is no backend. Do not hide it; say so plainly.
      setState({
        status: 'error',
        message: `${e.message}. Reading a structure from an image runs the model in the backend — start it with: cd backend && ../.venv/bin/uvicorn main:app --port 8000`,
      })
    }
  }

  const d = state.data

  return (
    <dialog ref={dialog} className="imgp" aria-labelledby="imgp-title" onClose={onClose}>
      <div className="imgp-head">
        <div>
          <h2 id="imgp-title">Read a structure from an image</h2>
          <p className="muted small">
            A photo of a scheme, a figure from a paper, a screenshot. The model reads it; you check it before anything
            is searched.
          </p>
        </div>
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="imgp-body">
        {state.status === 'idle' && (
          <label
            className={`imgp-drop ${dragging ? 'imgp-is-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              send(e.dataTransfer.files?.[0])
            }}
          >
            <input
              ref={input}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => send(e.target.files?.[0])}
            />
            <span className="imgp-drop-main">Drop an image here, or choose a file</span>
            <span className="muted small">PNG, JPEG, WebP, GIF, BMP or TIFF · up to 12 MB</span>
          </label>
        )}

        {state.status !== 'idle' && (
          <div className="imgp-compare">
            <figure className="imgp-side">
              <div className="imgp-shot">{file && <img src={file.url} alt={`uploaded: ${file.name}`} />}</div>
              <figcaption>what you gave it</figcaption>
            </figure>

            <div className="imgp-verdict">
              {state.status === 'reading' && (
                <div className="imgp-reading">
                  <span className="spinner" aria-hidden="true" />
                  <p className="muted small">
                    Reading the structure. The first image waits for the model to load, which takes about half a minute;
                    after that each one takes a second or two.
                  </p>
                </div>
              )}
              {state.status === 'error' && <p className="imgp-error">{state.message}</p>}
              {state.status === 'done' && (
                <>
                  <span className="imgp-readby">read by DECIMER</span>
                  {d.confidence != null && <span className="imgp-conf">confidence {d.confidence.toFixed(2)}</span>}
                </>
              )}
            </div>

            <figure className="imgp-side">
              <div className="imgp-shot">
                {state.status === 'done' ? (
                  <div className="mol-svg" dangerouslySetInnerHTML={{ __html: d.svg }} />
                ) : (
                  <div className="imgp-shot-empty" />
                )}
              </div>
              <figcaption>what the model read</figcaption>
            </figure>
          </div>
        )}

        {state.status === 'done' && (
          <dl className="imgp-facts">
            <div>
              <dt>SMILES</dt>
              <dd>
                <code className="break">{d.smiles}</code>
              </dd>
            </div>
            <div>
              <dt>Molar mass</dt>
              <dd className="num">{d.mw} g/mol</dd>
            </div>
            <div>
              <dt>InChIKey</dt>
              <dd>
                <code className="break">{d.inchikey}</code>
              </dd>
            </div>
          </dl>
        )}
      </div>

      <div className="imgp-foot">
        <p className="small muted">
          {state.status === 'done'
            ? 'Compare the two drawings. A model reading a picture can misread a bond or a substituent, and nothing is searched until you say this is right.'
            : 'Nothing is searched until you confirm what the model read.'}
        </p>
        <div className="imgp-actions">
          {state.status !== 'idle' && (
            <button type="button" className="btn" onClick={reset}>
              {state.status === 'done' ? 'Not right' : 'Try another'}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={state.status !== 'done' || busy}
            onClick={() => onSearch({ smiles: d.smiles, inchikey: d.inchikey })}
          >
            Yes, find routes for this
          </button>
        </div>
      </div>
    </dialog>
  )
}
