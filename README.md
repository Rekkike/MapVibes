# MapVibes

A security-and-privacy-first, fully local spreadsheet-to-map visualisation tool.

MapVibes turns a spreadsheet export into an interactive, zoomable map: clean the rows, number them, drag them onto the map as colour-coded markers, and export a single self-contained interactive HTML map that anyone can open in a browser.

## Why it is privacy-first

- **Fully local.** All processing happens in your browser. Spreadsheets, map images, and exports never leave your device.
- **No network calls at runtime.** No uploads, no telemetry, no analytics, no CDN fetches. All assets are bundled with the app.
- **Works offline.** The application runs from a local folder with no internet connection.
- **Self-contained exports.** The exported interactive map is a single HTML file with everything embedded: open it anywhere, no server needed.

## Core features

- Excel/spreadsheet ingestion with column mapping (keep, hide, and assign roles to columns of any language).
- Manual data cleaning with sorting, column filters (including empty/non-empty), per-row colouring, show/hide columns, and bulk deletion.
- Global sequential numbering with automatic renumbering when rows are removed or added.
- Zoomable, pannable map on a user-supplied background image.
- Drag-and-drop rows from the list onto the map as numbered, colour-coded markers (green, blue, yellow, red), with a legend at the bottom.
- Details panel per item, including free-text comments.
- Manual item entry and editing of all fields, including dates.
- Single-file interactive HTML export (primary output); optional PDF and PowerPoint export.
- Swedish and English interface; dark, light, and system-following themes.

## Running

Open `index.html` in a modern browser, or serve the folder with any static file server. No installation, no build step required for use. (A build step may be used during development.)

## Documentation

- `docs/SPECIFICATION.md` — functional specification.
- `docs/ENVIRONMENT_DISCIPLINE.md` — working rules for automated coding agents.

## Example data

`example-data/` contains a generic, fully fictional example workbook and fixtures for testing. It contains no real data and no real-world terminology.
