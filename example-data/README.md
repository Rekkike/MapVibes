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
