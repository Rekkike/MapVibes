# MapVibes — Functional Specification

Status: v0.3.0 — Map segment core pass delivered. See the changelog below.

MapVibes is a static, client-side web application: a spreadsheet-to-map visualisation tool. It has no backend, no database, and no server-side processing. Everything runs locally in the browser.

## Hard constraints

1. Fully client-side static web application (HTML, CSS, JavaScript).
2. No network calls at runtime: no uploads, no analytics, no telemetry, no CDN fetches during use. All fonts, styles, and scripts are bundled locally.
3. The application must function fully with no internet connection (airplane-mode test applies to every delivery).
4. All state remains on the user's device: files are read in the browser and written only on explicit export or save.
5. No hardcoded column names, headers, or business terminology: the application must work with arbitrary header names in any language.
6. No automatic selection or filtering logic deciding which rows "fit": data cleaning is deliberately a manual process performed by the user. The application provides generic list conveniences only.

## Functional requirements

- FR-1: Ingest a spreadsheet (xlsx) by file drop or file picker; parse all columns; surface parsing errors clearly. On import, present the file's actual headers and let the user map them: choose which columns to keep or hide, and assign roles (identifier, start date, end date, area/grouping) where the application needs semantics. All column data is treated as generic text.
- FR-2: Support the user's manual cleaning process: present all ingested rows in the list; the user removes rows by hand. The list shall support: sorting by column; setting the marker colour per row; showing and hiding columns; filtering on column values, including empty and non-empty cells in a chosen column; and selecting multiple or all rows for bulk deletion. Show running counts of retained and removed rows.
- FR-3: Assign sequential presentation numbers, starting at 1, globally across all items. When rows are removed or added after numbering, numbers regenerate so the sequence remains continuous.
- FR-4: Display a zoomable, pannable background map image supplied by the user.
- FR-5: Allow the user to place, move, and remove numbered markers, with the colours green (default), blue, yellow, and red.
- FR-6: Display a legend at the bottom of the map view.
- FR-7: Display a details panel for a selected marker.
- FR-8: The main view shows all areas; the user may zoom in or select a box/region of interest to focus on one area.
- FR-9: Allow the user to add items manually (not originating from the spreadsheet), with all the same fields, colour coding, and marker placement as ingested items.
- FR-10: Allow the user to edit any item's text fields, including start date and end date.
- FR-11: Export a single self-contained interactive HTML file (all data, map image, and application logic embedded in one file) that opens locally in any browser with zoom, legend, and per-marker details, requiring no server and no internet connection. This is the primary presentation format.
- FR-12: PDF and PowerPoint export is a secondary, optional feature. If implemented: the map with legend, followed by the relevant rows as a well-formatted table, with pagination or equivalent handling for large numbers of rows.
- FR-13: Support saving and reloading work state locally (an overlay/state file): marker positions, manually added items, field edits, comments, and the column mapping, so no work is lost between sessions.
- FR-14: Support importing a previously exported interactive map file so existing markers can be compared with a newly imported spreadsheet; reconciliation is performed by the user, not automatically.
- FR-15: Allow the user to attach a free-text comment to any item; comments are visible in the details view.
- FR-16: Present the item list alongside the map; selecting a line displays all details and comments for that item below the list.
- FR-17: Generate sequential presentation numbers in the list per FR-3, with the list grouped or groupable by area for readability.
- FR-18: Support drag-and-drop of an item from the list onto the map to create its numbered, colour-coded marker at the drop position.
- FR-19: Provide a UI language toggle between Swedish and English, with all interface strings externalised in translation files; the choice is remembered.
- FR-20: Provide dark, light, and follow-system theme options, defaulting to follow-system; the choice is remembered. The exported interactive map file shall respect the same theming options.
- FR-21: All user preferences (language, theme, column mapping, view state) are stored locally on the device only (browser local storage or the state file), never transmitted.
- FR-22: Segment structure. The application is organised into three segments with a clear flow: Information (list, cleaning, numbering), Map (background, markers, placement), and Presentation (final view and export). Work performed in one segment is never lost by moving to another segment.
- FR-23: Saved column-mapping presets. The user can save a column mapping under a name and apply it at a later import.
- FR-24: Manually added columns. The user can add columns by hand; such columns participate in sorting, filtering, and grouping in the same way as imported columns.
- FR-25: Map background import from PDF documents. In addition to image files (FR-4), the background can be loaded from a PDF document: the user selects the page, and the rendered page becomes the background image on the same viewport. PDF rendering uses a fully bundled library; no CDN or network access is involved.
- FR-26: Marker symbol library. Beyond the four colours (FR-5), a library of marker symbols is available, and the symbol is changeable per marker.
- FR-27: Presentation mode with per-item and per-layer visibility toggles. Items and layers excluded by the user are absent from the exported presentation.
- FR-28: At-a-glance panel. A panel beside the map shows only the items currently visible in the viewport, updating live as the viewport changes, with cross-highlighting between list entries and markers.
- FR-29: Design quality bar. The interface maintains a consistent visual language, spacing, and theming across the light and dark modes; where practical, this is pinned by automated DOM and CSS assertions.

## Non-goals

- No GitHub Pages deployment: the application is a locally run tool.
- No automatic data matching, merging, or selection logic.
- No hardcoded schema: no fixed column names or formats.

## Changelog

### v0.3.0

Map segment core pass (Pass 2).

Specification amendment (recorded before implementation; each item marked as implemented in this pass, deferred, or continuous):

- FR-22 segment structure (Information, Map, Presentation; no work lost between segments): implemented in this pass for the Information and Map segments; the Presentation segment is present as a labelled placeholder only.
- FR-23 saved column-mapping presets: deferred.
- FR-24 manually added columns participating in sorting, filtering, and grouping: deferred.
- FR-25 map background import from PDF documents: implemented in this pass.
- FR-26 marker symbol library beyond the four colours, changeable per marker: deferred.
- FR-27 presentation mode with per-item and per-layer visibility toggles: deferred.
- FR-28 at-a-glance panel of the items visible in the viewport, with cross-highlighting: deferred.
- FR-29 design quality bar: continuous; pinned in this pass by stylesheet assertions (every light-theme colour token redefined for the dark theme, no literal colours outside the theme token blocks, shared spacing and radius tokens, one colour token per marker colour, and a minimum 4.5:1 contrast for marker numbers and for body and muted text in both themes).

Delivered units:

1. Segment navigation (FR-22): a tab bar in the header switches between the Information, Map, and Presentation segments, by pointer or by the arrow keys. Segments are panels of one document, so the list, its deletions, colours, filters, the background, the view, and the markers are retained across every switch.
2. Background and viewport (FR-4): a background image (PNG, JPEG, GIF, WebP, BMP, SVG, AVIF) is loaded by drop onto the map stage or by the file picker, read locally as a data URL, and fitted to the stage. Zoom by the mouse wheel (anchored at the cursor) and by the zoom controls (anchored at the stage centre), pan by dragging, a fit-view control (whole image, centred), and a reset control (actual size, centred). Unsupported or undecodable files are reported clearly.
3. Markers (FR-5, FR-18): the Map segment lists every item with its number and colour; dragging an item onto the map creates its numbered, colour-coded marker (green default, blue, yellow, red, taken from the row colour set in the list) at the drop point. A marker can be selected, moved by dragging, and removed with the toolbar control or the Delete key. Marker numbers are not stored: each marker shows its row's global sequential number (FR-3), so markers renumber with the list, and deleting a row removes its marker. Each item has at most one marker; dropping a placed item again moves its marker. Positions are stored in image coordinates; markers keep a constant on-screen size at every zoom level.
4. Legend (FR-6): a fixed legend below the map stage lists the four colours in order with their names; it does not move with the view.
5. PDF background import (FR-25): a PDF document is loaded by the same drop or picker route. The bundled PDF.js library (pdfjs-dist 6.4.299, legacy build, pinned exactly) parses the document; for a multi-page document the user selects the page (a single-page document is used directly); the page is rendered to an image at three times its point size, bounded to 4096 pixels on the longest side, and becomes the background on the same viewport machinery. The PDF.js worker module is bundled and runs in-thread, so no worker script, font, or other resource is fetched; no URL is ever given to the library.

Verification: type checking; unit tests (viewport mathematics, marker numbering, PDF page parsing and render scale with the real library against the example document); UI tests against the real application markup and module (segment navigation and retained work, background load by picker and by drop, zoom, pan, fit, reset, drag-and-drop marker creation, colour classes and numbers of markers, marker move and removal, renumbering after deletion, legend, PDF page selection); the build regression suite, now asserting that the rendered body text of both built artifacts is exactly the interface text of the source markup (confirmed to fail against the reverted v0.2.1 inliner defect); and headless-Chromium end-to-end runs of both built artifacts opened via file:// with the browser context set offline, confirming every feature of this pass and that the only request made is the local file itself.

Known limitations, stated explicitly:

- Marker positions persist only within the session. The state save and load file (FR-13) is a later pass, so placed markers, the background, and the view do not survive a reload yet. Importing a new spreadsheet replaces the rows and therefore removes the markers of the previous rows.
- The legend names the four colours; the specification assigns no meaning to the colours, and no user-defined legend labels are specified, so none are invented.
- PDF rendering: fonts that are not embedded in the document are substituted by system fonts, because the standard font data and character maps of PDF.js are not bundled; JPEG 2000 images, which need the WebAssembly decoders of PDF.js, are not bundled and may not render; XFA forms are not rendered. Rendering runs on the main thread. The bundled library raises the application bundle to approximately 2.2 MB (approximately 0.7 MB compressed).
- The theme option labels are not yet translated by the language toggle; this is a pre-existing gap from v0.2.0 and was outside the scope of this pass.

Still deferred: FR-7 to FR-17 (FR-8: zooming exists, region selection does not), FR-23, FR-24, FR-26, FR-27, FR-28, and the Presentation segment itself.

Release: from this version onward, the release body includes the SHA-256 of the released mapvibes.zip archive. The release archive now also contains THIRD_PARTY_LICENSES.txt with the licence texts of the bundled libraries (PDF.js and SheetJS, both Apache-2.0), because the minified bundle does not retain their licence headers.

### v0.2.1

Recovery defect-fix pass over the v0.2.0 delivery. Both built artifacts (the folder build `index.html` and the single-file build `mapvibes-singlefile.html`) rendered a large dump of source text above the application interface. Root causes confirmed and fixed in the shared post-build inlining step:

- The inliner used a replacement string in `String.replace`; JavaScript interprets `$&`, `$'`, and similar sequences in replacement strings, so the xlsx bundle spliced the remainder of the HTML document into the middle of the inlined script. The substitution now uses a replacer function, which is literal.
- The inlined bundle contained `<!--` sequences (inside xlsx regex literals) and one `<script` sequence (inside an xlsx string literal); in HTML script tokenization `<!--` switches the tokenizer to escaped state, `<script` can then enter double-escaped state, and the closing `</script>` is consumed as a state transition instead of closing the element, rendering the remainder of the bundle as page text. A content-agnostic post-build sanitiser is now applied to the entire bundle on every build: `</script` is escaped as `<\/script`, `<!--` as `<\x21\x2D\x2D`, and `<script` as `<\x73cript` — hex escapes that are valid and semantics-preserving inside JavaScript string and regex literals while breaking the HTML tokenizer sequences.

Verification: a build regression test that parses the built document with a model of the browser's script-data tokeniser states and asserts that no script source renders as body text (fails against the deliberately reverted inliner, passes against the fixed one), plus a real headless-Chromium `file://` render of both builds confirming both open directly at the application interface with no source dump. The README Running section now describes the Release archive (download, extract, open) as the primary runnable route, with the development workflow second. No functional requirements were added or changed in this pass; the FR-4 through FR-18 deferrals stand.

### v0.2.0

Delivered the foundation pass:

- Toolchain: Vite + TypeScript + Vitest static client-side application. The production build is entirely self-contained: scripts and styles are bundled (no CDN references, no runtime fetches).
- Application shell: layout framework with a list area and a map area (map area is a placeholder in this pass).
- FR-19: Swedish/English language toggle; all interface strings externalised in translation files; the choice is remembered.
- FR-20: dark/light/follow-system theme options, follow-system default; the choice is remembered.
- FR-21: preferences stored in browser local storage only.
- FR-1: .xlsx ingestion by file drop or file picker; all columns parsed with the vendored SheetJS library; actual file headers presented for keep/hide decisions and role assignment (identifier, start date, end date, area/grouping); all column data treated as generic text; parsing errors surfaced clearly.
- FR-2: the list presents all ingested rows; supports sorting by column, per-row colour setting (green default, blue, yellow, red), column show/hide, filtering on column values including empty/non-empty for a chosen column, multi-select and select-all bulk deletion, and running counts of retained and removed rows.
- FR-3: global sequential numbering starting at 1, regenerated continuously when rows are removed or added.
- Delivery: a build workflow produces a runnable archive (folder build that opens via file:// without a server, plus a fully self-contained single-file HTML build) attached to a GitHub Release tagged with the specification version. The repository remains code-only.

Not implemented in this pass (deferred to later passes): FR-4 through FR-18.

### v0.1.0

Initial specification for the first implementation pass.

## Versioning

0.x is pre-1.0 development. 1.0 marks the deployable-and-complete promise against this specification.
