# MapVibes

A security-and-privacy-first, fully local spreadsheet-to-map visualisation tool.

MapVibes turns a spreadsheet export into an interactive, zoomable map: clean the rows, number them, drag them onto the map as colour-coded markers, and export a single self-contained interactive HTML map that anyone can open in a browser.

## Why it is privacy-first

- **Fully local.** All processing happens in your browser. Spreadsheets, map images, and exports never leave your device.
- **No network calls at runtime, with one labelled exception.** No uploads, no telemetry, no analytics, no CDN fetches; all assets are bundled with the app. The only network operation is the optional, clearly labelled "Fetch open map data (online)" action, made only when you press its buttons; it sends only the place name or area you enter to open OpenStreetMap services and never any of your data.
- **Works offline.** The application runs from a local folder with no internet connection; offline, the open-map fetch is disabled and everything else works.
- **Self-contained exports.** The exported interactive map is a single HTML file with everything embedded: open it anywhere, no server needed.

## Core features

- Three segments with a clear flow: Information (list, cleaning, numbering), Map (background, markers, placement), and Presentation (final view and export).
- Direct spreadsheet ingestion: every column appears at once under the file's own headers, in any language; columns are shown, hidden, and assigned roles in the list itself, and column configurations can be saved as named presets that apply automatically to matching files.
- Manual data cleaning with sorting, column filters (including empty/non-empty), per-row colouring, show/hide columns, and bulk deletion.
- Global sequential numbering with automatic renumbering when rows are removed or added.
- Zoomable, pannable map on a user-supplied background: an image file, a chosen page of a PDF document, or an OpenStreetMap (.osm) file rendered locally; optionally, open map data fetched by place name or area.
- Manual entry: start an empty list with no file at all, and add rows and columns by hand; hand-made rows are coloured, numbered, and placed like imported ones.
- Your own vocabularies: an area list and a status list (each status with a marker symbol), empty until you fill them, offered as choices in the list's cells; optional assignment of marker symbols from status. Nothing domain-specific is predefined.
- A symbol library of geometric shapes and six icons (light bulb, magnifying glass, gear, pause, cross, checkmark).
- Drag-and-drop rows from the list onto the map as numbered markers in four colours (green, blue, yellow, red) and five shapes, with a legend at the bottom and an at-a-glance panel of the items in view.
- Presentation mode: a read-only stage with per-item visibility toggles.
- Details panel per item, including free-text comments.
- Explicit save and reopen of the complete work state as a local file, with an unsaved-changes indicator.
- Manual item entry and editing of all fields, including dates.
- Single-file interactive HTML export (primary output); optional PDF and PowerPoint export.
- Swedish and English interface; dark, light, and system-following themes.

## Running

The runnable application is distributed as the Release archive, which requires no development tooling.

1. Download the `mapvibes.zip` archive from the repository's [Releases](../../releases) page (the release tagged with the current specification version).
2. Extract the archive to a local folder.
3. Open the extracted `index.html` directly in a modern browser (via `file://`; no server, no installation, no build step). The extracted `mapvibes-singlefile.html` is the same application as one fully self-contained HTML file with no external references.

Both files work fully offline; all scripts, styles, and assets are bundled, and the application makes no network calls.

The same build is also hosted on the repository's GitHub Pages site. The hosted page is the generic application only: no data of any kind is hosted with it, and files you open in it are read in your browser and never uploaded. Opening the hosted page downloads it from GitHub, so that visit is a network access; for fully offline use, run the Release archive locally.

Opening the application directly from a file (`file://`) and fetching open map data: the request is sent with an opaque (`null`) origin, and the open services answer with headers that allow requests from any origin, so the fetch is expected to work there as well as on the hosted page. This has not been verified against the live services from the development environment, which has no access to them; if a browser blocks the fetch from a file-based page, use the hosted page, or load a local `.osm` file, which is always the fully offline route (an `.osm` file can be exported for a chosen area from the OpenStreetMap website or obtained from any OpenStreetMap data extract).

For development, the repository remains code-only: install Node.js, run `npm ci`, then `npm run dev` for a development server, `npm test` for the test suites, and `npm run build` to produce the built artifacts under `dist/build/`.

## Documentation

- `docs/SPECIFICATION.md` — functional specification.
- `docs/ENVIRONMENT_DISCIPLINE.md` — working rules for automated coding agents.

## Example data

`example-data/` contains a generic, fully fictional example workbook and fixtures for testing. It contains no real data and no real-world terminology.
