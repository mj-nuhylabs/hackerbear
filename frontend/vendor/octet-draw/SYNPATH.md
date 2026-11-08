# Octet Draw inside SynPath

This folder is [Octet Draw](https://github.com/SamChemMan/Octet-Draw) by Sam Ellis, Apache License 2.0 (`LICENSE`),
copied from commit `934719abf213e0a8c9725256338bcbc0f305cab6` (v1.1.1, 2026-11-07). Third-party notices:
`THIRD_PARTY.md`, `data/names/NOTICE.txt`, `data/nmr/LICENCE.txt`, `src/vendor/opsin/NOTICES.txt`.

SynPath renders Octet's editor directly in its own React page (the drawing pane), and uses Octet's name reader
and namer for the search box and the target card. Nothing is fetched at build or run time.

## What was copied

- `src/` without the `*.check.ts` test files
- `data/` (the names dictionary and NMR shifts), `web/namedemo.ts` (the name lookup SynPath's search uses)
- `brand/tokens.css`, `brand/tokens.json`, `brand/logos/*.svg`, `src-tauri/icons/app-icon.svg` (imported by `src/`)
- `package.json` (Editor reads its version), `LICENSE`, `THIRD_PARTY.md`

Octet's runtime packages are in SynPath's `frontend/package.json` at the same versions.

## Changes to Octet's files

Each one is marked `SynPath` in the code. `src/synpath.ts` is new: the link to SynPath, the pane's size
(`frameWidth`, `frameHeight`, `frameTop`, `frameMidY`, `frameSpan`), and the keyboard guard.

| File | Change | Why |
| --- | --- | --- |
| `src/Editor.tsx` | Opens on the canvas, not Home | No Home screen inside SynPath |
| `src/Editor.tsx` | Fills `synpath.part`/`load`/`state`; places `synpath.inbox` | SynPath reads the structures the selection touches (or the drawing) and sends structures in |
| `src/Editor.tsx`, `Rulers.tsx`, `Scrollbars.tsx`, `movable.ts`, `TemplateLibrary.tsx`, `tools.tsx` | The window's `innerWidth`/`innerHeight` become the pane's (`frameWidth`, `frameHeight`); centring and fitting use the part below SynPath's app bar (`frameMidY`, `frameSpan`, `frameTop`) | The editor is a pane in SynPath's page, not the window |
| `src/Menu.tsx`, `src/Spectrum.tsx`, `src/Home.tsx` | Portals go in `.octet-host`, not `document.body` | Octet's CSS is scoped to that element |
| `src/cursor.ts`, `src/docstyle.ts` | Colour probes read inside `.octet-host` | Same scoping |
| `src/chem.ts`, `src/motion.tsx`, `src/Spectrum.tsx` | Tokens read from `.octet-host`, not `:root` | Same scoping |
| `src/docstyle.ts` | New drawings' background is `"system"`, not `"white"` | The sheet follows SynPath's light or dark theme; exports still draw on white (`export.ts`) |

Left as they are: overlays placed at the pointer (tooltips, menus, drag ghosts), which are `position: fixed` and
already in window coordinates.

## How it fits SynPath

- SynPath's drawing pane (`frontend/src/components/DrawPane.jsx`) is pinned to the window's left edge at full height,
  so the editor's top-left corner is the window's and every pointer and overlay coordinate holds unchanged. SynPath's
  app bar lies over its top (the canvas runs on under it); its status bar sits under the editor.
- `frontend/vite.config.js` scopes every stylesheet in this folder to `.octet-host` (`:root`, `html` and `body` become
  that element). `frontend/src/index.css` keeps SynPath's own rules out of it with `@scope`, re-points Octet's colour,
  radius and type tokens to SynPath's, and moves the panels that hang from the top below the app bar.
- Octet listens for keys and the clipboard on the whole window. `synpath.ts` passes them on only when they happen in
  the editor, or on the page after the last click was in it, so typing in SynPath never edits the drawing.
- The editor unmounts when the pane is hidden. Octet keeps the drawing in `rescue` (its crash recovery) and reopens
  with it.
- Online features that need the desktop app (Search Reaxys/PubChem, file dialogs, updates) say so and do nothing.

To take a newer Octet: copy the same files from the new commit, then reapply the changes above
(`grep -rn SynPath src`).
