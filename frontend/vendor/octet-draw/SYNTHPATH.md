# Octet Draw inside SynthPath

This folder is [Octet Draw](https://github.com/SamChemMan/Octet-Draw) by Sam Ellis, Apache License 2.0 (`LICENSE`),
copied from commit `934719abf213e0a8c9725256338bcbc0f305cab6` (v1.1.1, 2026-11-07). Third-party notices:
`THIRD_PARTY.md`, `data/names/NOTICE.txt`, `data/nmr/LICENCE.txt`, `src/vendor/opsin/NOTICES.txt`.

SynthPath renders Octet's editor directly in its own React page (the Draw panel), and uses Octet's name reader and
namer for the search box and the target card. Nothing is fetched at build or run time.

## What was copied

- `src/` without the `*.check.ts` test files
- `data/` (the names dictionary and NMR shifts), `web/namedemo.ts` (the name lookup SynthPath's search uses)
- `brand/tokens.css`, `brand/tokens.json`, `brand/logos/*.svg`, `src-tauri/icons/app-icon.svg` (imported by `src/`)
- `package.json` (Editor reads its version), `LICENSE`, `THIRD_PARTY.md`

Octet's runtime packages are in SynthPath's `frontend/package.json` at the same versions.

## Changes to Octet's files

Each one is marked `SynthPath` in the code. `src/synthpath.ts` is new.

| File | Change | Why |
| --- | --- | --- |
| `src/Editor.tsx` | Opens on the canvas, not Home | No Home screen inside SynthPath |
| `src/Editor.tsx` | Fills `synthpath.part`/`state`, places `synthpath.inbox` | SynthPath reads the selection (or drawing) and sends structures in |
| `src/Menu.tsx`, `src/Spectrum.tsx`, `src/Home.tsx` | Portals go in `.octet-host`, not `document.body` | Octet's CSS is scoped to that element, and the panel is a modal dialog |
| `src/cursor.ts`, `src/docstyle.ts` | Colour probes read inside `.octet-host` | Same scoping |
| `src/chem.ts`, `src/motion.tsx`, `src/Spectrum.tsx` | Tokens read from `.octet-host`, not `:root` | Same scoping |

## How it fits SynthPath

- `frontend/vite.config.js` scopes every stylesheet in this folder to `.octet-host` (`:root`, `html` and `body` become
  that element), and `frontend/src/index.css` keeps SynthPath's rules out of it with `@scope`.
- The editor assumes it owns the window (`position: fixed`, `innerWidth`), so the Draw panel is full-screen.
- It unmounts when the panel closes. Octet keeps the drawing in `rescue` (its crash recovery) and reopens with it.
- Online features that need the desktop app (Search Reaxys/PubChem, file dialogs, updates) say so and do nothing.

To take a newer Octet: copy the same files from the new commit, then reapply the changes above
(`grep -rn SynthPath src`).
