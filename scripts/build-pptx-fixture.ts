// Builds a PowerPoint package with the repository's own writer
// (src/pptxwriter.ts via src/documents.ts, FR-51), for the round-trip check
// in CI: the package is then opened with python-pptx, which reads its slides
// back and asserts success (scripts/check-pptx.py). The fixture is generic
// and fictional; its pictures come from example-data only. Since v1.13.0 the
// package carries several image slides — the stage, then a timeline page and
// an economics page — before the table slides (FR-12 as amended). Run:
// npx vite-node scripts/build-pptx-fixture.ts [output.pptx]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildPptxDocument, pptxTables, type DocumentTable, type PptxImage } from '../src/documents';

const out = process.argv[2] ?? join(process.cwd(), 'dist', 'pptx-roundtrip', 'roundtrip.pptx');

const png = new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.png')));
const table: DocumentTable = {
  headings: ['No.', 'Name', 'Note'],
  rows: [
    ['1', 'First example item', 'A fictional note'],
    ['2', 'Second example item', 'A longer fictional note that wraps over more than one line of the table on the slide, and then goes on further still'],
  ],
};
const texts = {
  tableTitle: 'Items {from} to {to} of {total}',
  tableTitleParts: 'Items {from} to {to} of {total} ({part} of {parts})',
};
// The image slides: the stage, then a timeline page and an economics page.
// The fixture runs without a canvas, so the pictures are the example image;
// what is exercised is the package's multi-image structure.
const images: PptxImage[] = [
  { png, description: 'The presentation stage with its markers' },
  { png, description: 'The timeline page' },
  { png, description: 'An economics page' },
];
const tables = pptxTables(table, texts);
const bytes = buildPptxDocument(images, tables, 'Example presentation', 'en-GB', new Date(2026, 0, 2, 3, 4, 6));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`wrote ${out}: ${bytes.length} bytes, ${images.length + tables.slides.length} slides, ${tables.columnGroups} column group(s)`);
