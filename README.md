# SynPath — Literature-Grounded Synthesis Route Planner

Give it a target molecule and it returns a synthesis route **grounded in real literature records**, plus the cost of making 1 g by that route.
The LLM only writes explanatory text — every SMILES, yield, price and source is either a corpus record or a value computed in code.

## Setup

```bash
# macOS: for LightGBM
brew install libomp

# Python 3.10 venv (uv)
uv venv --python 3.10 .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt

# AiZynthFinder pretrained models + stock (a few hundred MB)
.venv/bin/download_public_data backend/data/aizynth

# Frontend
cd frontend && npm install
```

### Data (all gitignored — re-fetch with the commands below)

```bash
# ORD projections (~1.3GB). Source of the evidence corpus and the ML positives.
# The repo is ord-artifacts, not ord-data. The projections are already flattened and the units
# are folded into the column names (setpoint_kelvin), so no protobuf is involved.
.venv/bin/python -c "from huggingface_hub import snapshot_download; \
snapshot_download('open-reaction-database/ord-artifacts', repo_type='dataset', \
allow_patterns=['projections/**'], local_dir='backend/data/ord', max_workers=8)"

# USPTO-50K (~9MB). 50k curated reactions with patent numbers. ML positives.
mkdir -p backend/data/uspto50k && for f in train-00000-of-00001 validation-00000-of-00001; do \
  curl -sL -o "backend/data/uspto50k/${f%%-*}.parquet" \
  "https://huggingface.co/datasets/pingzhili/uspto-50k/resolve/main/data/$f.parquet"; done
```

Derived files are built by code. `backend/data/ord/dataset_names.json` (dataset id → name) is checked into
the repo — the projections metadata has no names, so there is nowhere to recover them from.

```bash
.venv/bin/python scripts/flatten_ord.py          # → backend/data/ord_flat.parquet (2.43M reactions)
cd backend && ../.venv/bin/python -m model.train --positives all   # → model.pkl, calibrator.pkl, calibration.png
.venv/bin/python -I scripts/attach_procedures.py # → backend/data/ord_hits.json (verbatim experimental procedure per step)
```

`backend/data/ord_hits.json` (about 409 KB) is committed, so the demo's experimental-procedure panel works without downloading the 1.3 GB.

**Sources and license.** Reaction records and verbatim procedures come from the [Open Reaction Database](https://open-reaction-database.org)
and are [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The procedure panel shows the source and license for every record.

### Octet Draw integration

[Octet Draw](https://github.com/SamChemMan/Octet-Draw) (Apache-2.0) is vendored in `frontend/vendor/octet-draw/` and rendered directly inside our React
app (not an iframe). No separate build step. The upstream commit and our modifications are listed in `frontend/vendor/octet-draw/SYNPATH.md`.

- **Drawing panel**: on a wide window (1100 px or more) it is always open on the left, with results to its right. Collapse it with **Hide drawing**
  in the app bar, and drag the divider to resize it (the width is remembered). On a narrow window, **Draw** opens it over the results.
- **Find routes for selection / drawing**, below the panel: searches whole molecules touched by the selection (the whole drawing if nothing is selected)
  using the SMILES that Octet's Indigo computes. Selecting a single atom is enough to find its molecule.
- **Add to drawing** on the target card and on each step's compounds → places that structure to the right of the drawing, selected.
- Names and CAS numbers typed in the search box are read first by Octet's offline name resolver (OPSIN + Octet dictionary), and a thumbnail and the kind of
  the parsed structure are shown inside the search box. If it cannot read the input, the input is sent to `/resolve` as-is.
- **IUPAC name (Octet)** on the target card: a name that Octet's namer generated and verified by parsing it back into the structure. `—` if there is none.
- **Image** in the app bar: reads a structure from a drawing or photo (DECIMER, needs the backend). It searches only after you compare the original and the parsed structure side by side and confirm.
- The source (drawing, Octet name resolution, image) is shown in **Structure from** on the target card.
- Octet's UI is re-skinned with SynPath's colors, typefaces and accent color, and the paper of a new drawing follows the system theme (exports always have a white background).

## Run

```bash
cd backend && ../.venv/bin/uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

Run `cp .env.example .env`, then set `ANTHROPIC_API_KEY`.
