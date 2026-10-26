# MapVibes — Functional Specification

Status: v0.6.0 — manual data entry and open-map backgrounds pass delivered. See the changelog below.

MapVibes is a static, client-side web application: a spreadsheet-to-map visualisation tool. It has no backend, no database, and no server-side processing. Everything runs locally in the browser.

## Hard constraints

1. Fully client-side static web application (HTML, CSS, JavaScript).
2. No network calls at runtime: no uploads, no analytics, no telemetry, no CDN fetches during use. All fonts, styles, and scripts are bundled locally. The single exception is the explicit, user-initiated, clearly labelled fetch of open map data (FR-31): it is the application's only network operation; it is never made automatically; no user data is ever included in its requests; its result is embedded into the work state like any other background. All other operations, including the exported presentation file, remain fully offline.
3. The application must function fully with no internet connection (airplane-mode test applies to every delivery). The guarantee holds at all times except during the labelled open-map fetch (FR-31); with no connection, that control is disabled with a clear message and every other function works.
4. All state remains on the user's device: files are read in the browser and written only on explicit export or save.
5. No hardcoded column names, headers, or business terminology: the application must work with arbitrary header names in any language.
6. No automatic selection or filtering logic deciding which rows "fit": data cleaning is deliberately a manual process performed by the user. The application provides generic list conveniences only.

## Functional requirements

- FR-1: Ingest a spreadsheet (xlsx) by file drop or file picker; parse all columns; surface parsing errors clearly. Ingestion is direct: importing a spreadsheet populates the list immediately with all of the file's columns, named by the file's own headers, shown as-is; no configuration dialog interrupts the import, and no header names are hardcoded. Columns are shown and hidden in the list itself. Role assignment also takes place in the list: a per-column control in the list header assigns the optional roles identifier, name/title, start date, end date, and area/grouping (each role to at most one column). All column data is treated as generic text. The name/title is the display name of an item, used by the list, the marker labels, and the at-a-glance panel; where it is unassigned or empty, the display name falls back to the identifier value, and otherwise to the item's number.
- FR-2: Support the user's manual cleaning process: present all ingested rows in the list; the user removes rows by hand. The list shall support: sorting by column; setting the marker colour per row; showing and hiding columns; filtering on column values, including empty and non-empty cells in a chosen column; and selecting multiple or all rows for bulk deletion. Show running counts of retained and removed rows.
- FR-3: Assign sequential presentation numbers, starting at 1, globally across all items. When rows are removed or added after numbering, numbers regenerate so the sequence remains continuous.
- FR-4: Display a zoomable, pannable background map image supplied by the user.
- FR-5: Allow the user to place, move, and remove numbered markers, with the colours green (default), blue, yellow, and red.
- FR-6: Display a legend at the bottom of the map view.
- FR-7: Display a details panel for a selected marker.
- FR-8: The main view shows all areas; the user may zoom in or select a box/region of interest to focus on one area.
- FR-9: Allow the user to add items manually (not originating from the spreadsheet), with the same fields, colour coding, sequential numbering, and marker placement as imported items.
- FR-10: Allow the user to edit any item's text fields, including start date and end date.
- FR-11: Export a single self-contained interactive HTML file (all data, map image, and application logic embedded in one file) that opens locally in any browser with zoom, legend, and per-marker details, requiring no server and no internet connection. This is the primary presentation format.
- FR-12: PDF and PowerPoint export is a secondary, optional feature. If implemented: the map with legend, followed by the relevant rows as a well-formatted table, with pagination or equivalent handling for large numbers of rows.
- FR-13: Support saving and reloading work state locally (an overlay/state file): marker positions, manually added items, field edits, comments, and the column mapping, so no work is lost between sessions.
- FR-14: Support importing a previously exported interactive map file so existing markers can be compared with a newly imported spreadsheet; reconciliation is performed by the user, not automatically.
- FR-15: Allow the user to attach a free-text comment to any item; comments are visible in the details view.
- FR-16: Present the item list alongside the map; selecting a line displays all details and comments for that item below the list.
- FR-17: Generate sequential presentation numbers in the list per FR-3, with the list grouped or groupable by area for readability.
- FR-18: Support drag-and-drop of an item from the list onto the map to create its numbered, colour-coded marker at the drop position.
- FR-19: Provide a UI language toggle between Swedish and English, with all interface strings externalised in translation files; the choice is remembered. On first run (no remembered choice), the interface is in Swedish.
- FR-20: Provide dark, light, and follow-system theme options, defaulting to follow-system; the choice is remembered. The exported interactive map file shall respect the same theming options.
- FR-21: All user preferences (language, theme, column mapping, view state) are stored locally on the device only (browser local storage or the state file), never transmitted.
- FR-22: Segment structure. The application is organised into three segments with a clear flow: Information (list, cleaning, numbering), Map (background, markers, placement), and Presentation (final view and export). Work performed in one segment is never lost by moving to another segment.
- FR-23: Saved column presets. The current column configuration (shown and hidden columns, and role assignments) can be saved under a name. When a later import has the same headers, the matching preset applies automatically; presets can also be applied, switched, and removed by the user. Presets persist in the work-state file and in local storage where available (FR-21).
- FR-24: Manually added columns. The user can add columns by hand; such columns participate in sorting, filtering, and grouping exactly like imported columns.
- FR-25: Map background import from PDF documents. In addition to image files (FR-4), the background can be loaded from a PDF document: the user selects the page, and the rendered page becomes the background image on the same viewport. PDF rendering uses a fully bundled library; no CDN or network access is involved.
- FR-26: Marker symbol library. Beyond the four colours (FR-5), a library of marker symbols is available, and the symbol is changeable per marker.
- FR-27: Presentation mode with per-item and per-layer visibility toggles. Items and layers excluded by the user are absent from the exported presentation.
- FR-28: At-a-glance panel. A panel beside the map shows only the items currently visible in the viewport, updating live as the viewport changes, with cross-highlighting between list entries and markers.
- FR-29: Design quality bar. The interface maintains a consistent visual language, spacing, and theming across the light and dark modes; where practical, this is pinned by automated DOM and CSS assertions.
- FR-30: Manual population of the entire list. An empty list can be started with no import at all, so that the application is fully usable where no files can be opened; rows and columns are then added and edited by hand.
- FR-31: Open-map backgrounds. OpenStreetMap XML (.osm) files can be loaded locally and rendered as map backgrounds. In addition, an explicit, clearly labelled, user-initiated action fetches open map data by place name or bounding box from open services and renders it the same way (see hard constraints 2 and 3).

## Non-goals

- GitHub Pages hosts the generic application build; it never hosts user data, work states, or exported presentation files.
- No automatic data matching, merging, or selection logic.
- No hardcoded schema: no fixed column names or formats.

## Changelog

### v0.6.0

Manual data entry and open-map backgrounds pass (Pass 5).

Specification amendments (recorded before implementation; all implemented in this pass):

- FR-9 manual item entry (previously deferred): items can be added entirely by hand, with the same fields, colour coding, numbering, and marker placement as imported items. Implemented.
- FR-24 manual columns (previously deferred): columns can be added by hand and take part in sorting, filtering, and grouping exactly like imported columns. Implemented.
- FR-30 (new): manual population of the entire list: an empty list can be started with no import at all. Implemented.
- FR-31 (new): open-map backgrounds: OpenStreetMap XML (.osm) files load locally and render as backgrounds; an explicit, labelled action fetches open map data by place name or bounding box. Implemented.
- Hard constraints 2 and 3 (amended): the labelled open-map fetch is the application's only network operation; nothing is fetched automatically; no user data is included in a request; the result is embedded into the work state like any other background; everything else, including the future exported presentation, stays fully offline; the airplane-mode guarantee holds except during that one action, and the action is disabled with a clear message when the application is offline. Implemented. Because the standing discipline rule 6 (privacy constraints are non-negotiable; no network calls at runtime) conflicted with this amendment, the conflict was reported before implementation, and on the owner's decision docs/ENVIRONMENT_DISCIPLINE.md rule 6 was amended with the same single, narrow exception; any further network operation requires a further explicit amendment of both documents.

Delivered units:

1. Manual list (FR-9, FR-24, FR-30): "Start an empty list" begins a list with no import (asking first when there are unsaved changes). "Add row" appends a row that takes the next number; "Add column" adds a named column with an empty value in every row. Manual columns have stable internal keys, so their names can be repeated and renamed (in the column heading) without affecting roles, presets, or markers; they take part in sorting, filtering (including empty and non-empty), roles (including area/grouping and name/title), presets, and showing and hiding, like imported columns. Manual rows are coloured, numbered, placed as markers, removed, and renumbered like imported rows, and rows can also be added to an imported list. Cells of manual rows and of manual columns are edited in the list; imported values of imported columns remain read-only, as editing them (FR-10) is not part of this pass.
2. OpenStreetMap file backgrounds (FR-31): a .osm file loads by drop or by the background file picker and is parsed in the browser (nodes, ways, and their tags; relations are not interpreted). Ways are classified as major roads, minor roads, paths, rail, waterways, water areas, buildings, and green areas, projected in Web Mercator with the true aspect ratio, and drawn onto an image of 3000 pixels on its longest side (at most 4096), with line widths scaled to the image so that the map stays legible when fitted. The image is an ordinary background, like an image file or a PDF page: zoom, pan, fit, markers, the presentation stage, and the work state work unchanged, and the background is embedded in the work-state file. The style uses one fixed palette (backgrounds are content, not themed interface): roads are light lines with darker casings, water is blue, buildings are beige with darker outlines, green areas are green; every line edge and outline keeps at least 3:1 contrast against the land colour. Markers gain a thin dark halo so that every marker colour stays legible on light maps in both interface themes. Malformed, truncated, or non-OSM XML fails with a clear message, as does data with no drawable features; the current background is kept.
3. Open-map fetch (FR-31): "Fetch open map data (online)", marked with a network symbol, opens a panel marked "Network" that states that this is the only network operation and what is sent. A place name is searched with the Nominatim geocoder (the request carries only the name); the user chooses a result; its area (reduced about its centre to at most 0.0025 square degrees, about 5.5 by 5.5 kilometres at the equator, with a notice when reduced) is fetched from the Overpass API (the request carries only the bounding box and the feature classes drawn); a bounding box can also be entered directly. Requests are GET requests without credentials or cookies and with the referrer limited to the page origin. The result is parsed and rendered exactly like a local .osm file, with the attribution "© OpenStreetMap contributors" drawn into the image so that it travels with the background, and is embedded into the work state. Offline (as reported by the browser), the action is disabled and a message points to local .osm loading; going offline with the panel open disables its request buttons. Network failures, busy services, empty results, invalid or too large areas, and unexpected answers are reported and change nothing. All network code is confined to one module, and a test fails if any other source file contains a network call or a remote address.
4. Work-state schema version 3 (FR-13): adds the manual-list metadata: the manual columns (key and label) and, per row, whether it was imported or added by hand. Files of schema versions 1 (v0.4.0) and 2 (v0.5.x) still open: they are migrated on reading, with no manual columns and all rows imported, and keep all their content; saving then writes version 3. Any other version is rejected with a clear message.
5. Tests and delivery: unit tests for .osm parsing, classification, and the render plan; for the fetch requests (only the name or the bounding box is sent, only to the two services), bounding boxes, and the confinement of network code; for manual keys; and for schema version 3 and the migration of versions 1 and 2 (against files written by v0.4.0 and v0.5.0, in example-data); UI tests for the manual list flow, .osm loading, the fetch action and its offline state (with the services replaced by a stand-in), and marker placement on rendered backgrounds; stylesheet and palette assertions for the rendered map's legibility in both themes; and the build regression suite. The release workflow publishes the archive and deploys the identical build to the hosted page.

Verification: type checking; the unit, UI, and build regression suites in chunked invocations; and headless-Chromium runs of both built artifacts via file:// (manual list, .osm loading and rendering in both themes, malformed files, offline state of the fetch action with the browser context offline, and only the local file requested otherwise), plus fetch runs from file:// and from a local HTTP origin with the two services emulated by request interception, confirming that requests occur only after the explicit presses, carry only the place name or the bounding box, send no cookies, send the referrer as the origin only (none from file://), and that the fetched data is rendered and placed like a local file.

Supplement to this version (delivered after the pass units, under the same version on the owner's decision): the header shows the build version next to the application name, for example "MapVibes v0.6.0". The version is the specification version of the build: the release workflow reads it from the status line of this specification (the same source as the release tag) and injects it at build time; a local build or test run reads the same line, and a build fails if an injected value differs from it. It is never maintained by hand in the source. As the hosted page and the release archive are the identical build, both show the same value; a UI test asserts the header text and the build regression suite asserts the value in both built artifacts. Because this supplement updates the already published v0.6.0 release, the release workflow now points the release tag at the built commit before updating a release, so that the tag, the archive, the hosted page, and the displayed version always match; the v0.6.0 tag was accordingly moved from the commit first released to the commit of this supplement.

A further supplement to this version (fetch usability, on the owner's instruction, delivered under the same version):

- Bounding rectangle: the single ambiguous field is replaced by four explicitly labelled fields in decimal degrees (WGS84), in the order south, west, north, east, with a one-line explanation of the ranges and a generic example value (south 10.000, west 20.000, north 10.020, east 20.030). A comma is accepted as the decimal separator. Validation rejects a non-numeric or out-of-range value with a message naming the offending field (latitudes from −90 to 90, longitudes from −180 to 180), and also rejects a south edge not below the north edge or a west edge not left of the east edge; the offending field is marked. The place-name search remains the primary route, labelled "recommended"; the rectangle is the secondary route.
- Failure surfacing: while a search or a data request runs, the panel shows a busy state (a running indicator and a status line; its inputs are disabled) and offers Cancel; a cancelled request changes nothing. Every failure has its own plain-language message: no places found for the name; no map features in the area; the service timed out (an HTTP timeout status, a timeout remark from the service, or no answer within the browser's time limit); the service refused or rate-limited the request (HTTP 403, 429, 503); the area held more data than the cap; a network error; or an unexpected answer. The service's own status (the HTTP status with its reason, or the service's message) is appended to the message, never swallowed. When an area is larger than the area cap, it is reduced about its centre and the reduction is stated with the new edges, for a chosen place as well as for an entered rectangle (which is reduced rather than refused).
- Conservative query: the area fetched at once is at most 0.0025 square degrees (about 5.5 by 5.5 kilometres at the equator); the Overpass query asks the service to stop at 16 MiB of data (maxsize) and after 25 seconds; an answer larger than 16 MiB is not processed; the browser stops waiting after 40 seconds for map data and 15 seconds for a place search; a place search asks for at most 5 results. A plausible search therefore never pulls an entire region.
- Verification: each failure class, the busy state, and cancellation are tested against simulated service responses (unit and UI tests), as before. Verification against the live services remains with the tester: the development environment has no access to them.

Known limitations and notices, stated explicitly:

- The fetch was not verified against the live services or on the hosted page: the development environment has no network access to them. Request interception in the test browser does not apply the browser's cross-origin checks, so it cannot show whether a browser accepts the live services' answers in a page opened from a file. The services send headers that allow requests from any origin, so the fetch is expected to work from file:// as well as from the hosted page; if a browser blocks it from a file-based page, the hosted page or a local .osm file is the alternative, and local .osm loading is always the fully offline route. This is stated in the README.
- Using the open services is subject to their usage policies (fair use; the geocoder allows at most about one request per second). Requests are only ever made by explicit user action, one at a time. The hosted page sends its origin as the referrer, as the geocoder's policy asks; a page opened from a file sends none.
- Large .osm files: the file is read whole and parsed on the main thread; files above 50 MB are refused with a message asking for a smaller area. Below that, loading takes time in proportion to the size and the page does not respond meanwhile: in the test browser, synthetic files of 10, 25, and 45 MB took about 4, 11, and 20 seconds. The rendered image is at most 4096 pixels on its longest side, so a large area is drawn with less detail; small details may merge at that scale.
- Relations, including multipolygons, are not interpreted: features that exist only as relations (for example many large lakes and some large buildings) are not drawn. Names and labels are not drawn. Data that is not in the fetched feature classes is not requested.
- The rendered map uses one fixed palette in both interface themes, like an image or PDF background; it is not re-coloured for the dark theme.
- The fetched data is OpenStreetMap data (licensed under the Open Database Licence); the attribution is drawn into the rendered image. Local .osm files carry no attribution, as their origin is not known to the application.
- Manual columns cannot yet be removed (only hidden), and imported values of imported columns cannot be edited (FR-10 remains deferred).
- The test fixtures for this pass are synthetic: the .osm files describe a fictional town at invented coordinates, as real map extracts would be real-world data.

### v0.5.1

Supplement to Pass 4: GitHub Pages deployment.

Specification amendment: the non-goal "No GitHub Pages deployment: the application is a locally run tool." is replaced by "GitHub Pages hosts the generic application build; it never hosts user data, work states, or exported presentation files." Implemented in this version.

Delivered:

- The release workflow deploys to GitHub Pages the same built artifact that the release archive publishes: the Pages content is the release archive's directory from the same workflow run (index.html, mapvibes-singlefile.html, README.txt, THIRD_PARTY_LICENSES.txt), with no separate build. Before upload, a workflow step stops the deployment if the directory contains any file other than these four, and confirms byte for byte that both HTML files are the built artifacts.
- Pages therefore hosts only the generic application. It hosts no example data, no user data, no work states, and no exported presentation files; files that a user opens in the hosted application are read in the browser and are never uploaded.
- The README describes the hosted application as a second way to run MapVibes, alongside the release archive.

Notices:

- The hosted page is downloaded from GitHub's servers when it is opened, so that visit is a network access subject to GitHub's own logging; once loaded, the application makes no network calls. The release archive remains the fully offline route and the one that satisfies the airplane-mode requirement.
- This supplement is delivered as version 0.5.1 because version 0.5.0 had already been merged and released; re-releasing under the v0.5.0 tag would have published an archive from a later commit under a tag that points to an earlier one.
- The deployment requires the repository's Pages source to be set to GitHub Actions; the workflow cannot enable Pages by itself with its default token.

### v0.5.0

Ingestion experience and presentation mode pass (Pass 4).

Specification amendments (recorded before implementation; all implemented in this pass):

- FR-1 flow amendment: ingestion is direct. Importing a spreadsheet populates the list immediately with all of the file's columns, named by the file's own headers and shown as-is; no configuration dialog interrupts the import. Implemented.
- FR-1 role amendment: roles are assigned in the list, through a per-column control in the list header (identifier, name/title, start date, end date, area/grouping; each role to at most one column). The name/title role is new; it is the display name used by the list, the marker labels, and the at-a-glance panel, with the fallbacks identifier value, then the item number. Implemented.
- FR-23 saved column presets (previously deferred): save under a name, automatic application on an import with the same headers, apply, switch, and remove; persisted in local storage and in the work-state file. Implemented.
- FR-19 amendment: Swedish interface on first run; a remembered language choice is unaffected. Implemented.

Delivered units:

1. Direct import (FR-1): the upfront mapping dialog is removed; every column is imported and shown with the file's headers, and showing and hiding columns remains an in-list control. Columns whose headers repeat in the file keep separate values under internal unique keys and are all displayed with the file's header text; an empty header is shown as "(untitled header)". Importing over unsaved changes asks for confirmation first, as opening a work-state file does, because the removed dialog no longer stands between a dropped file and the replacement of the work.
2. In-list role assignment (FR-1): a role control below each column heading; assigning a role to a column moves it from any other column. The name/title column leads the list as the primary label (shown first after the number, in bold). Display names: name/title, else identifier, else "No. n" (Swedish "Nr n").
3. Saved presets (FR-23): presets hold the hidden columns and the role assignments for a set of column keys. A preset matches an import with the same headers in any order; on import, the most recently saved matching preset applies automatically and this is announced. Presets can be applied (also to other columns, where only the settings for present columns apply; such presets are marked "other columns"), switched, and removed after confirmation; saving under an existing name asks before replacing. Presets are stored in local storage (key mapvibes.presets) and in the work-state file; on opening a file, its presets are merged into the stored presets, a preset of the same name being replaced by the one in the file.
4. Defect fixes (both pre-existing): (a) the list header row now has a cell for the row-selection column, so every heading sits above its values; a hidden column now hides its heading as well as its values (a second pre-existing misalignment found while fixing the first). Pinned by a UI test that fails against the previous code. (b) The damaged-file detail texts are externalised into both dictionaries: each inconsistency is reported as a problem kind with its own Swedish and English message; the field path in the message remains a language-neutral technical identifier.
5. Presentation mode (FR-27): the Presentation segment is a stage over the whole map with the background, the markers, the legend, zoom and pan on its own viewport, and a visibility list with a toggle per placed item; switched-off items' markers are hidden on the stage. No placement, moving, or removal occurs on the stage, and drops onto it are refused; editing remains in the Map segment, where switched-off markers stay editable and are shown faded.
6. At-a-glance panel (FR-28): a panel beside the stage in both the Map and the Presentation segments lists only the switched-on items whose markers are inside the visible part of that stage, updating live as the view moves; entries show the number, colour, and shape, the display name, and the area value where the area role is assigned. Hovering or focusing an entry highlights its marker and hovering a marker highlights its entry; clicking an entry selects its marker. In the Presentation segment, clicking a marker also opens its visibility control, which stays open so that the choice can be reversed, and closes on its close button, on Escape, or on a click on the empty stage.
7. Marker symbol library (FR-26): five shapes (circle, the default; square; diamond; triangle; hexagon), chosen per marker in the Map segment toolbar for the selected marker, independently of the colour, which remains set in the list. Markers remain numbered; the shape is shown on the map, on the stage, and in all side lists; the legend explains the colours and the shapes. The specification assigns no meaning to colours or shapes, so the legend names them only.
8. Work-state schema version 2 (FR-13): adds role assignments by column key (replacing the version 1 column mapping), the shape per marker, the presentation visibility toggles (as row references), and the presets. Version 1 files (written by v0.4.0) still open: they are migrated on reading, with all columns kept as before, version 1 roles carried over, circle shapes, all items switched on, and no presets; saving then writes version 2. Any other version is rejected with a clear message.
9. Tests and delivery: unit tests for the viewport-visibility computation, preset matching and validation, roles and display names, direct import with repeated headers, and the schema version 2 format and version 1 migration (against a version 1 file written by v0.4.0, now in example-data); UI tests for every unit, including both defect fixes and the Swedish first run; stylesheet assertions pinning the marker colour and shape classes, the symbol layers, and the at-a-glance panel density; and the build regression suite.

Verification: type checking; the unit, UI, and build regression suites in chunked invocations; and headless-Chromium runs of both built artifacts via file:// with the browser context offline, covering the Swedish first run, direct import, role assignment, presets, the list alignment, shapes in both themes, the at-a-glance panel and cross-highlighting, the presentation stage with its visibility controls, saving and reopening a schema version 2 file, and opening the version 1 fixture. The only request made was the local file itself.

Known limitations and notices, stated explicitly:

- Terminology: the pass directive referred to "projects"; the generic term "item" of this specification is used throughout the interface and this document, in keeping with the rule against domain terminology.
- FR-27 is implemented for per-item visibility only; per-layer visibility toggles are not implemented (no layers exist yet), and the exported presentation remains deferred with the interactive HTML export.
- The presentation stage viewport is not saved in the work-state file; the stage is fitted to the background when the work is opened. The presentation selection, marker selection, and hover state are transient.
- A preset's role and visibility settings apply to columns present in the current import only; a preset is not altered when it is applied to other columns. Changing the configuration after applying a preset does not change the stored preset until it is saved again.
- Presets are stored in local storage only when the user saves, removes, or opens a file containing presets; where local storage is unavailable, presets remain available for the session and in saved work-state files.
- The work-state file continues to capture only the features implemented so far; later passes will extend the schema further.

### v0.4.0

Work-state persistence pass (Pass 3).

Delivered units:

1. Work-state file (FR-13): an explicit Save work action writes the complete work state to one local JSON file. Where the browser offers a save dialog (the File System Access API, for example in Chromium-based browsers), the user chooses the file there; elsewhere the file is offered as a local download named mapvibes-work-state.json, and the browser's download settings decide whether the user is asked for a location. The file carries the format name mapvibes-work-state and the schema version field schemaVersion, whose value in this version is 1. It contains: the column mapping (every column of the import with its kept flag and role), the kept columns, and the columns hidden in the list; all ingested rows in ingestion order with all values, their retained or removed status, their colour, and their global sequential number (null for removed rows); the map background embedded as image data (the loaded image file or the rendered PDF page), with its size; every marker with its position in image coordinates and its association to a row; and the view state (the current segment, the map viewport, and the list sorting and filter). To keep the removed status, removed rows are now kept in the work state rather than discarded.
2. Work-state load (FR-13): an explicit Open work action reads such a file and restores the complete state, including the background and the markers, without the original spreadsheet or background file. The file is validated completely before anything changes: a file that is not JSON or not a work-state file, a file whose schema version is not 1, and a damaged or inconsistent file (for example a numbering that breaks the global sequence, a marker on a removed row, or a background that is not embedded image data) are rejected with a clear message and nothing is opened. A background that is not embedded image data is always rejected, so opening a file can never make the browser fetch a resource. Opening over unsaved changes requires an explicit confirmation; declining changes nothing. If the stored background cannot be decoded, nothing is opened.
3. Unsaved-changes awareness: an indicator in the header shows when the work has unsaved changes, and closing or reloading the page with unsaved changes asks the browser to confirm. Content changes count as unsaved changes (import, row removal, colour changes, the background, and placing, moving, or removing markers); view changes alone (segment, zoom and pan, list sorting, filtering, and column visibility) are saved with the work but do not count as unsaved changes. Saving or opening a file clears the indicator; a cancelled save does not. Nothing is written automatically at any time: files are written only by Save work.
4. Defect fix: the theme option labels (Follow system, Light, Dark) now follow the language toggle (FR-19); a regression test covers the switch in both directions, the unchanged option values and current choice, and a stored Swedish preference at start.

Verification: type checking; unit tests of the work-state file (a save and load round trip restoring an identical state, including the embedded background data and marker positions, and byte-identical on a second round trip; rejection of unknown schema versions, of non-work-state files, of non-embedded backgrounds, and of inconsistent numbering, markers, and columns); UI tests of the save flow (save dialog, cancelled dialog, failed write, download fallback), of the open flow (complete restoration in a fresh application instance, an identical file when saved again, confirmation accepted and declined, no confirmation without unsaved changes, unknown schema version, non-work-state file, damaged file, undecodable background), of the unsaved-changes indicator and the unload guard (including that no file is written and nothing is stored by editing or unloading), and of the theme label fix; the build regression suite; and headless-Chromium runs of both built artifacts via file:// with the browser context offline, covering the reload guard, Save through the download route, restoration of the saved file in a fresh page with identical markers, view, counts, and segment, and the confirmation when opening over unsaved changes. The only request made was the local file itself.

Known limitations, stated explicitly:

- The work-state file captures only the features implemented so far. Features added in later passes (for example manually added items, field edits, comments, manual columns, and presentation settings) will extend the schema; such extensions will raise the schema version, and files of an older version will need an explicit migration path in a later pass.
- Marker selection and row selection in the list are transient interaction state and are not saved. The original spreadsheet is not embedded: only the kept columns of the imported rows are saved, so columns not kept at import cannot be recovered from the file, and after opening a file the column mapping cannot be changed (re-importing the spreadsheet starts a new import).
- The native save dialog cannot be driven by browser automation; the save-dialog route is verified with a stand-in in the UI tests, and the download route in the headless-browser run. In browsers without a save dialog, the work is marked as saved once the download is handed to the browser.
- The detail text of a damaged-file message names the inconsistent field in English in both interface languages.
- The work-state file contains the user's data in plain text; it is written only where the user saves it and is never transmitted.
- Pre-existing defect observed during verification and not fixed in this pass (outside its scope): the header row of the list table has no cell for the row-selection column, so each column heading is shown one column to the left of its values.

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
