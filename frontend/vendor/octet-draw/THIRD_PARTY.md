# Third-party software

Every dependency Octet uses, with its licence. Rules: [docs/licence.md](docs/licence.md).

| Library | Version | Licence | Used for |
| ------- | ------- | ------- | -------- |
| tauri, tauri-build (Rust) | 2.12 | Apache-2.0 OR MIT | Desktop shell and installers |
| @tauri-apps/cli | 2.12 | Apache-2.0 OR MIT | Build tool (dev only) |
| @tauri-apps/api | 2.12 | Apache-2.0 OR MIT | Calls from the page to the app (menu, save, open) |
| tauri-plugin-dialog (Rust) | 2.8 | Apache-2.0 OR MIT | Native Open and Save dialogs |
| tauri-plugin-updater (Rust) | 2.14 | Apache-2.0 OR MIT | Check for Updates and the check when Octet opens, if the user allows it (decision 0010). Checks each update's minisign signature. It brings reqwest, hyper-rustls, rustls, rustls-platform-verifier, tokio-rustls (Apache-2.0 OR ISC OR MIT, or MIT OR Apache-2.0), ring (Apache-2.0 AND ISC), rustls-webpki and untrusted (ISC), minisign-verify (MIT), subtle (BSD-3-Clause) and tar (MIT OR Apache-2.0) |
| reqwest, rustls (Rust) | 0.13, 0.23 | MIT OR Apache-2.0; Apache-2.0 OR ISC OR MIT | Name to Structure's PubChem step, with Online search on (`src-tauri/src/pubchem.rs`, decision 0015). The updater's own HTTPS client and TLS, with the same features: nothing new in the build |
| tauri-plugin-single-instance (Rust) | 2.5 | Apache-2.0 OR MIT | Windows and Linux: a file opened from Explorer or a file manager goes to the Octet that runs. On Linux it brings zbus, zvariant and endi (MIT) and the smol async crates (Apache-2.0 OR MIT) |
| svg2pdf, pdf-writer, subsetter (Rust, typst project) | 0.13, 0.12, 0.2 | MIT OR Apache-2.0 | Vector PDF of the drawing for export and the clipboard, with font subsets and the CDXML in the PDF |
| resvg, usvg (Rust, linebender) | 0.45 | Apache-2.0 OR MIT | Reads the drawing's SVG; draws the PNG export |
| tiny-skia (Rust) | 0.11 | BSD-3-Clause | Raster drawing for the PNG export and the clipboard picture on Windows and Linux (used by resvg) |
| fontdb (Rust) | 0.23 | MIT | Finds the system fonts to embed in PDFs (used by usvg) |
| slotmap (Rust) | 1.1 | Zlib | Used by fontdb. Zlib approved by Sam, 17 October 2026 |
| png (Rust) | 0.17 | MIT OR Apache-2.0 | Writes the PNG export with its resolution |
| image (Rust, image-rs) | 0.25 | MIT OR Apache-2.0 | Writes the JPEG and GIF exports (already in the build through svg2pdf) |
| gif, color_quant (Rust, image-rs) | 0.14, 1.1 | MIT OR Apache-2.0; MIT | The GIF export's encoder and its 256-colour palette (used by image) |
| miniz_oxide (Rust) | 0.8 | MIT OR Zlib OR Apache-2.0 | Compresses and reads the CDXML stream in PDFs |
| base64 (Rust) | 0.22 | MIT OR Apache-2.0 | ChemDraw's CDX from the clipboard, sent to the page |
| serde (Rust) | 1 | MIT OR Apache-2.0 | Export and paste data between the page and the app |
| serde_json (Rust) | 1 | MIT OR Apache-2.0 | The recent drawings list on Home (already in the build through Tauri) |
| objc2, objc2-foundation, objc2-app-kit (Rust) | 0.6, 0.3, 0.3 | MIT; MIT; Zlib OR Apache-2.0 OR MIT | The macOS clipboard (NSPasteboard). Already used by Tauri |
| dispatch2 (Rust) | 0.3 | Zlib OR Apache-2.0 OR MIT | Quit from the Dock answers AppKit on the main queue (macOS). Already used by Tauri's dialogs (rfd) |
| objc2-web-kit, block2 (Rust) | 0.3, 0.6 | Zlib OR Apache-2.0 OR MIT; MIT | Feedback's picture of the window (WKWebView snapshot), for testers: not in the public release (REL-8). Already used by Tauri |
| windows-sys (Rust, Microsoft) | 0.61 | MIT OR Apache-2.0 | The Windows clipboard (copy and paste), and the menu bar's access keys. Already used by Tauri |
| webview2-com (Rust, Bill Avery) | 0.39 | MIT | Alt and a menu's access key on Windows, from the web view to the menu bar (WebView2's AcceleratorKeyPressed). Already used by Tauri |
| gtk (Rust, gtk-rs project) | 0.18 | MIT | The Linux clipboard (copy and paste, through GTK). Already used by Tauri |
| open (Rust, Byron) | 5.4 | MIT | Opens web addresses (Search Reaxys, Search PubChem, links) and the feedback draft in the user's own programs. On Windows it calls ShellExecuteExW, not cmd.exe |
| is-wsl, is-docker (Rust) | 0.4, 0.2 | MIT | Used by open on Linux |
| dunce (Rust) | 1.0 | CC0-1.0 OR MIT-0 OR Apache-2.0 (used under Apache-2.0) | Used by open on Windows. Already used by Tauri |
| indigo-ketcher | 1.46 | Apache-2.0 | Chemistry engine, CDX/CDXML |
| Inside indigo-ketcher's WASM: libpng, zlib, TinyXML-2, RapidJSON, cppcodec, object_threadsafe | 1.6.54 (libpng) | libpng-2.0, Zlib, Zlib, MIT, MIT, Apache-2.0 | Built into Indigo (its `third_party` folder). Notices in `src-tauri/licences/indigo-wasm.txt` |
| Inside indigo-ketcher's WASM: InChI Software | 1.06 | IUPAC/InChI-Trust InChI Licence No. 1.0, which is based on the LGPL 2.1. Sam approved, 18 October 2026 | InChI and InChIKey (Copy As, Export). Octet uses Indigo's own WASM build, not changed. Its licence text is in `src-tauri/licences/indigo-wasm.txt` |
| MPL-2.0 crates inside Tauri: cssparser, selectors, dtoa-short (through tauri-utils' dom_query), option-ext (through dirs) | 0.37, 0.38, 0.3, 0.2 | MPL-2.0, not changed. Sam approved, 18 October 2026 | Octet does not call them. Tauri needs them. Their text and source location are in the shipped licences file |
| Unicode-3.0 code crates inside Tauri: icu_collections, icu_normalizer, icu_properties, icu_provider and the ICU4X crates they use (through url) | 2.3 | Unicode-3.0. Sam approved, 18 October 2026 (code and data) | Octet does not call them. Tauri needs them for web addresses |
| Indigo's MoleculeCleaner2d and BiconnectedDecomposer (indigo-core) | 1.46.0 | Apache-2.0 | Clean Up's geometry, ported to TypeScript and changed in `src/clean2d.ts` (EPAM's copyright notice kept there) |
| react, react-dom | 19.3 | MIT | UI |
| vite, @vitejs/plugin-react | 8.3, 6.1 | MIT | Bundler (dev only) |
| typescript | 7.0 | Apache-2.0 | Type checking (dev only) |
| @types/react, @types/react-dom | 19.3 | MIT | Type definitions (dev only) |
| Instrument Sans (@fontsource/instrument-sans) | 5.3 | OFL-1.1 | UI font |
| IBM Plex Mono (@fontsource/ibm-plex-mono) | 5.3 | OFL-1.1 | SMILES, InChI and formula font |
| @phosphor-icons/react | 2.1 | MIT | UI icons |
| OPSIN | 2.8.0 | MIT | Name to structure, compiled to JavaScript ([tools/opsin](tools/opsin/README.md)). Octet adds phthalocyanine and corrole to its data (`tools/opsin/pack/arylGroups.patch`) |
| dk.brics.automaton | 1.12-4 | BSD-3-Clause | Used by OPSIN (one class modified) |
| TeaVM class library and runtime | 0.16.0 | Apache-2.0 | Runs OPSIN's Java as JavaScript |
| StAX API | 1.0.1 | Apache-2.0 | XML interfaces used by OPSIN |
| Unicode character data (in TeaVM) | TeaVM 0.16.0's copy | Unicode-3.0 | Case mapping in the OPSIN build. Sam approved, 16 October 2026 |
| nmrshiftdb2 data (measured spectra) | Download of 16 October 2026 | nmrshiftdb2 Database License (ODbL 1.0 with clause 4.5) | The ¹H and ¹³C shift table in [data/nmr/](data/nmr/README.md). Sam approved, 16 October 2026 (decision 0006) |
| thermo (Caleb Bell), Joback group values | 0.6.1, `thermo/group_contribution/joback.py` | MIT | The Joback & Reid group contribution table in `src/props.ts` (values only; Octet's own group typer) |
| Dimorphite-DL site table (Durrant lab) | 2.1.0, `dimorphite_dl/smarts/site_substructures.smarts` | Apache-2.0 | Ionisable groups with mean pKa and SD in `src/props.ts` (values only; Octet's own group tests) |
| PatWalters/solubility, ESOL coefficients | `esol.py`, master of 16 October 2026 | MIT | ESOL logS coefficients refitted for Crippen logP in `src/props.ts` |
| RDKit | 2026.09.1 | BSD-3-Clause | Reference values in `src/props.check.ts` (TPSA, rotatable bonds, aromatic atoms, logP, weight). Its CIP labeller (after John Mayfield's Centres) was read for the details `src/cip.ts` settles as the CIP validation suite's authors do; no code is copied. Not shipped |
| tauri-driver; WebKitWebDriver; Microsoft Edge WebDriver; xclip, xdotool, AT-SPI (pyatspi) | Latest on each run | Apache-2.0 OR MIT; LGPL-2.1 and BSD (WebKitGTK); Microsoft's licence; GPL-2.0, BSD-3-Clause, LGPL-2.0 | Installed only on GitHub's Windows and Linux machines by `.github/workflows/platforms.yml`, to drive Octet in a test. Not in the repository and not shipped |
| CIP validation suite (Hanson, Mayfield, Vainio, Yerin, Musacchio and Redkin, J. Chem. Inf. Model. 2018) | v1.0 | No licence, so not in this repository | Reference labels for `src/cip.ts`, run locally by `scripts/cip-suite.ts` from `~/octet-research`. Not shipped |
| PubChem (NCBI) | Records read 17, 23 and 27 October 2026 | NCBI places no restrictions on PubChem data; structures are facts | Reference InChIKeys in `src/names.check.ts` and `src/dictionary.check.ts`, monoisotopic masses in `src/msanalysis.check.ts`, and the InChIs of phthalocyanine and corrole in `src/macrocycles.check.ts`. Octet's drug names (`src/drugs.ts`) are Octet's own SMILES checked against PubChem; a few complex ones (tetracyclines, steroids, paclitaxel, strychnine) follow PubChem's SMILES. Sam approved, 18 October 2026. The dictionary's build asks PubChem which compound a shared or doubtful name keeps (no PubChem data is shipped for it), and Name to Structure asks PubChem online (decision 0015). Notice in `src-tauri/licences/pubchem.txt` |
| NIST Atomic Weights and Isotopic Compositions (SRD 144), and CODATA 2022 | Read 27 October 2026 | Physical facts (isotope masses and abundances, the electron's mass); the source is cited in each file | Every element's isotopes in `src/isotopes.ts` (isotope patterns, exact masses) and the electron's mass in `src/msanalysis.ts` (m/z) |
| Wikidata | Read 5 November 2026 | CC0 1.0 | Name to Structure's dictionary of common, trivial and trade names, CAS numbers and InChIKeys with their structures, in [data/names/](data/names/README.md) (`scripts/build-dictionary.ts`, decision 0015). Notice in `data/names/NOTICE.txt` |
| FDA Global Substance Registration System (UNII list) | List of 4 August 2026, read 5 November 2026 | US government work, not copyrighted (FDA website policies) | CAS numbers, names and structures of substances in Name to Structure's dictionary, in [data/names/](data/names/README.md) (`scripts/build-dictionary.ts`). Notice in `data/names/NOTICE.txt` |

The OPSIN build's notices are in [src/vendor/opsin/NOTICES.txt](src/vendor/opsin/NOTICES.txt). The app ships them as `licences/opsin.txt`.

The app ships every licence notice in `licences/third-party.txt`, which About > Licences opens. `node scripts/licences.mjs`
writes it from the Rust crates and npm packages Octet ships and the files named above (REL-12).
