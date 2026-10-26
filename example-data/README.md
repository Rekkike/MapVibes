# Example Data

This folder holds the generic, fully fictional example workbook and fixtures used for testing.

Rules:

- All example data is fictional and generic. No real-world data, no real organisation names, no real projects, no domain-specific terminology.
- Column headers in examples use generic names (for example: ID, Start, End, Group, Note). The application must work with headers in any language.
- The example workbook format mirrors the expected input shape: one sheet, one header row, one item per row, arbitrary column count.

Files:

- `example.xlsx` — example workbook (one sheet, generic headers ID, Start, End, Group, Note; five fictional rows).
- `example-background.png` — generic 1200 × 800 pixel background image (a grid with four plain zones labelled A to D), used as a map background fixture.
- `example-background.pdf` — generic two-page PDF document (page 1: landscape, 842 × 595 points, zones A to D; page 2: portrait, 595 × 842 points, zones E to G), used as a PDF map background fixture. It uses only vector drawing and the standard Helvetica font.
- `example-repeated-headers.xlsx` — generic workbook with a repeated header (Label, Label), an empty header, and a Note column; two fictional rows. Used to verify that every column is imported and shown with the file's own headers.
- `example-work-state-v1.json` — a work-state file of schema version 1, written by MapVibes v0.4.0 from the example workbook and the example PDF background (page 2). Used to verify the migration of version 1 files.
- `example-map.osm` — a synthetic OpenStreetMap XML file of a fictional small town at invented coordinates near latitude 0, longitude 0 (a street grid, one main road, blocks of buildings, a lake, a park, a river, a railway, a footpath, and one non-drawn boundary way). It contains no real-world map data.
- `example-map-malformed.osm` — the same file truncated half-way, used to verify that malformed files fail with a clear message.
- `example-work-state-v2.json` — a work-state file of schema version 2, written by MapVibes v0.5.0 from the example workbook and the example background image (roles, one diamond marker, one item switched off for the presentation, and one preset). Used to verify the migration of version 2 files.
