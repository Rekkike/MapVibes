# Example Data

This folder holds the generic, fully fictional example workbook and fixtures used for testing.

Rules:

- All example data is fictional and generic. No real-world data, no real organisation names, no real projects, no domain-specific terminology.
- Column headers in examples use generic names (for example: ID, Start, End, Group, Note). The application must work with headers in any language.
- The example workbook format mirrors the expected input shape: one sheet, one header row, one item per row, arbitrary column count.

Files:

- `example.xlsx` — example workbook (one sheet, generic headers ID, Start, End, Group, Note; five fictional rows).
- `example-background.png` — generic 1200 × 800 pixel background image (a grid with four plain zones labelled A to D), used as a map background fixture.
- `example-background.jpg` — the same 1200 × 800 pixel background as `example-background.png`, saved as a baseline JPEG (quality 85), used to test the embedding of images in the PDF writer (FR-50).
- `example-background.pdf` — generic two-page PDF document (page 1: landscape, 842 × 595 points, zones A to D; page 2: portrait, 595 × 842 points, zones E to G), used as a PDF map background fixture. It uses only vector drawing and the standard Helvetica font.
- `example-repeated-headers.xlsx` — generic workbook with a repeated header (Label, Label), an empty header, and a Note column; two fictional rows. Used to verify that every column is imported and shown with the file's own headers.
- `example-work-state-v1.json` — a work-state file of schema version 1, written by MapVibes v0.4.0 from the example workbook and the example PDF background (page 2). Used to verify the migration of version 1 files.
- `example-map.osm` — a synthetic OpenStreetMap XML file of a fictional small town at invented coordinates near latitude 0, longitude 0 (a street grid, one main road, blocks of buildings, a lake, a park, a river, a railway, a footpath, and one non-drawn boundary way). It contains no real-world map data.
- `example-map-malformed.osm` — the same file truncated half-way, used to verify that malformed files fail with a clear message.
- `example-work-state-v2.json` — a work-state file of schema version 2, written by MapVibes v0.5.0 from the example workbook and the example background image (roles, one diamond marker, one item switched off for the presentation, and one preset). Used to verify the migration of version 2 files.
- `example-work-state-v3.json` — a work-state file of schema version 3, written by MapVibes v0.6.0 from the example workbook and the example background image, with a manual column (Rank), a manual row (M-01), roles, three markers (one square), and no vocabularies. Used to verify the migration of version 3 files.
- `example-work-state-v4.json` — a work-state file of schema version 4, written by MapVibes v0.7.0 from the example workbook and the example background image, with the area role and its collected values (North, South), a manual column (Phase) with the status role, two statuses (Open with the pause symbol, Done with the checkmark), the status-to-symbol toggle on, and three markers (one with a manually chosen gear). It has no edited values and no comments. Used to verify the migration of version 4 files.
- `demo.csv` — the list of the full-test demo (FR-41): twelve invented items (D-01 to D-12) of a fictional town, with generic headers (Item, Name, Area, Programme, Status, Start year, End year, Note), invented names, five invented area values, two invented programmes (Green links, Heritage route) that each span three areas or more, six invented statuses, and start and end years; one item has no area value, and five items belong to no programme. It is bundled into the build as the demo's data and read through the normal spreadsheet import.
- `demo-scenario.json` — the rest of the demo (scenario format version 2): the column preset matching the demo's headers (all roles, including the program and note roles, the area values, the programmes, and the statuses with their symbols), the status-to-symbol toggle, invented labels for the four colours, the at-a-glance columns (Programme, Status, End year), and per item its colour, its marker position as fractions of the background's width and height (eleven placed, in a deliberately varied arrangement with a cluster and items near the edges; one not placed), any manually chosen symbol (three items: a diamond, a square, and the lightning bolt), and comments; and three annotations, their points also as fractions: a polygon linked to D-07 as its footprint, a free rectangle, and one dashed line. The demo background is `example-map.osm`.
