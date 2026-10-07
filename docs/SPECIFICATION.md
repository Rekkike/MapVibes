# MapVibes — Functional Specification

Status: v0.2.0 — foundation pass delivered. See the changelog below.

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

## Non-goals

- No GitHub Pages deployment: the application is a locally run tool.
- No automatic data matching, merging, or selection logic.
- No hardcoded schema: no fixed column names or formats.

## Changelog

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
