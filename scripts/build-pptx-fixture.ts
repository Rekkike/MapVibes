// Builds a PowerPoint package with the repository's own writer
// (src/pptxwriter.ts via src/documents.ts, FR-51), for the round-trip check
// in CI: the package is then opened with python-pptx, which reads its slides
// back and asserts success (scripts/check-pptx.py). The fixture is generic
// and fictional; its picture comes from example-data only. Run:
// npx vite-node scripts/build-pptx-fixture.ts [output.pptx]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildPptxDocument, pptxTables, type DocumentTable } from '../src/documents';

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
const tables = pptxTables(table, texts);
const bytes = buildPptxDocument(png, 'The presentation stage with its markers', tables, 'Example presentation', 'en-GB', new Date(2026, 0, 2, 3, 4, 6));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log(`wrote ${out}: ${bytes.length} bytes, ${1 + tables.slides.length} slides, ${tables.columnGroups} column group(s)`);
