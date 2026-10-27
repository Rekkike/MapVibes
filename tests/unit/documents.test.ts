import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import { buildPdf, layoutTable, paginateTable, PALETTE, PDF_PAGE, sceneFromStage, TABLE, wrapValue, type DocumentTable, type StageInput } from '../../src/documents';
import { legendModel } from '../../src/legend';
import { en } from '../../src/i18n';
import { textWidth } from '../../src/pdfwriter';
import type { Annotation } from '../../src/annotations';

(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;

const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
const jpeg = new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.jpg')));

function annotation(id: string, kind: Annotation['kind'], points: Array<[number, number]>, label = ''): Annotation {
  return { id, kind, points: points.map(([x, y]) => ({ x, y })), colour: 'blue', fillOpacity: 0.3, outline: 'black', lineStyle: 'solid', label };
}

// A 1200 by 800 background at half scale, shifted: the stage of 400 by 300
// shows the image from (200, 100) to (1000, 700).
function input(): StageInput {
  return {
    viewport: { scale: 0.5, x: -100, y: -50 },
    stage: { width: 400, height: 300 },
    background: { width: 1200, height: 800 },
    markers: [
      { position: { x: 600, y: 400 }, symbol: 'circle', colour: 'green', label: '1' },
      // Just outside the left edge: its centre is 10 pixels off the stage.
      { position: { x: 180, y: 400 }, symbol: 'bolt', colour: 'red', label: '2' },
      // Far outside.
      { position: { x: 1150, y: 50 }, symbol: 'square', colour: 'blue', label: '3' },
    ],
    annotations: [annotation('a', 'rectangle', [[300, 200], [500, 300]], 'Inside'), annotation('b', 'line', [[1100, 750], [1190, 790]], 'Outside')],
    legendTitle: 'Legend',
    legend: legendModel(en),
  };
}

describe('the stage scene (FR-50)', () => {
  test('only what the stage shows: the visible part of the background, the markers and annotations in view', () => {
    const scene = sceneFromStage(input());
    expect(scene.background).toEqual({ stage: { x: 0, y: 0, width: 400, height: 300 }, image: { x: 200, y: 100, width: 800, height: 600 } });
    expect(scene.markers.map((m) => [m.label, m.x, m.y])).toEqual([
      ['1', 200, 150],
      ['2', -10, 150],
    ]);
    expect(scene.annotations.map((a) => a.label)).toEqual(['Inside']);
    expect(scene.annotations[0].points).toEqual([
      { x: 50, y: 50 },
      { x: 150, y: 100 },
    ]);
  });

  test('a background smaller than the stage is placed where it is shown', () => {
    const scene = sceneFromStage({ ...input(), viewport: { scale: 0.25, x: 20, y: 10 } });
    expect(scene.background).toEqual({ stage: { x: 20, y: 10, width: 300, height: 200 }, image: { x: 0, y: 0, width: 1200, height: 800 } });
  });

  test('the document palette is the light theme of the stylesheet', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const token = (name: string) => {
      const hex = new RegExp(`${name}:\\s*#([0-9a-f]{6})`, 'i').exec(root)![1];
      return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    };
    expect(PALETTE.green).toEqual(token('--marker-green'));
    expect(PALETTE.blue).toEqual(token('--marker-blue'));
    expect(PALETTE.yellow).toEqual(token('--marker-yellow'));
    expect(PALETTE.red).toEqual(token('--marker-red'));
    expect(PALETTE.markerText).toEqual(token('--marker-text'));
    expect(PALETTE.markerTextOnYellow).toEqual(token('--marker-text-on-yellow'));
    expect(PALETTE.ring).toEqual(token('--marker-ring'));
    expect(PALETTE.neutral).toEqual(token('--marker-neutral'));
    expect(PALETTE.halo).toEqual(token('--marker-halo'));
    expect(PALETTE.fg).toEqual(token('--fg'));
    expect(PALETTE.muted).toEqual(token('--muted'));
  });
});

function table(columns: number, rows: number, value = (r: number, c: number) => `Value ${r}.${c}`): DocumentTable {
  return {
    headings: ['No.', ...Array.from({ length: columns }, (_, c) => `Column ${c + 1}`)],
    rows: Array.from({ length: rows }, (_, r) => [String(r + 1), ...Array.from({ length: columns }, (_, c) => value(r, c))]),
  };
}

describe('the table (FR-12)', () => {
  const width = PDF_PAGE.width - 2 * PDF_PAGE.margin;

  test('columns that fit share one page width, the number leading', () => {
    const layout = layoutTable(table(4, 3), width);
    expect(layout.groups).toEqual([[0, 1, 2, 3, 4]]);
    expect(layout.widths[0].reduce((s, w) => s + w, 0)).toBeCloseTo(width, 6);
  });

  test('columns that do not fit continue in further parts, each led by the number, none squeezed', () => {
    const long = table(14, 2, () => 'A fairly long value that needs room');
    const layout = layoutTable(long, width);
    expect(layout.groups.length).toBeGreaterThan(1);
    for (const g of layout.groups) expect(g[0]).toBe(0);
    expect(layout.groups.flatMap((g) => g.slice(1))).toEqual(Array.from({ length: 14 }, (_, c) => c + 1));
    for (const widths of layout.widths) {
      expect(widths.reduce((s, w) => s + w, 0)).toBeLessThanOrEqual(width + 1e-6);
      for (const w of widths.slice(1)) expect(w).toBeGreaterThanOrEqual(TABLE.minColumn);
    }
  });

  test('values wrap at words into at most three lines, the last shortened with an ellipsis', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
    const lines = wrapValue(text, 60, 'regular', 8, 3);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(textWidth(line, 'regular', 8)).toBeLessThanOrEqual(60);
    expect(lines[2].endsWith('…')).toBe(true);
    expect(lines[0]).toBe('one two three');
    expect(wrapValue('short', 60, 'regular', 8, 3)).toEqual(['short']);
    expect(wrapValue('', 60, 'regular', 8, 3)).toEqual(['']);
    // A word longer than a line is split.
    const split = wrapValue('Supercalifragilisticexpialidocious', 40, 'regular', 8, 3);
    expect(split.length).toBeGreaterThan(1);
    for (const line of split) expect(textWidth(line, 'regular', 8)).toBeLessThanOrEqual(40);
  });

  test('rows are paginated under the repeated heading; every row appears once per part', () => {
    const many = table(3, 120);
    const layout = layoutTable(many, width);
    const pages = paginateTable(many, layout, 400);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.flatMap((p) => p.rows)).toEqual(Array.from({ length: 120 }, (_, r) => r));
  });
});

describe('the PDF document (FR-12, FR-50)', () => {
  const texts = { title: 'MapVibes presentation', footer: 'MapVibes · page {page} of {pages}', tableTitle: 'Items {from} to {to} of {total}', tableTitleParts: 'Items {from} to {to} of {total} (part {part} of {parts})' };

  async function read(bytes: Uint8Array) {
    const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const content = await (await doc.getPage(i)).getTextContent();
      pages.push(content.items.map((it) => ('str' in it ? it.str : '')).filter((s) => s.trim() !== '').join('|'));
    }
    return pages;
  }

  test('the stage page, then the table pages, each with its footer; an A4 landscape page', async () => {
    const result = buildPdf(sceneFromStage(input()), table(3, 70), { jpeg, width: 800, height: 600 }, texts, new Date('2026-01-02T00:00:00Z'));
    expect(result.pages).toBe(1 + result.tablePages);
    expect(result.tablePages).toBeGreaterThan(1);
    expect(result.replaced).toBe(0);
    const pages = await read(result.bytes);
    expect(pages).toHaveLength(result.pages);
    expect(pages[0]).toContain('Inside');
    expect(pages[0]).not.toContain('Outside');
    expect(pages[0].endsWith(`MapVibes · page 1 of ${result.pages}`)).toBe(true);
    expect(pages[1].startsWith('Items 1 to ')).toBe(true);
    const s = new TextDecoder('latin1').decode(result.bytes);
    expect(s).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(s).toContain(`/Filter /DCTDecode /Length ${jpeg.length}`);
  });

  test('when the columns are split, each table page names its part', async () => {
    const wide = table(14, 3, () => 'A fairly long value that needs room');
    const result = buildPdf(sceneFromStage(input()), wide, null, texts, new Date());
    expect(result.columnGroups).toBeGreaterThan(1);
    const pages = await read(result.bytes);
    expect(pages[1].startsWith(`Items 1 to 3 of 3 (part 1 of ${result.columnGroups})`)).toBe(true);
    expect(pages[2].startsWith(`Items 1 to 3 of 3 (part 2 of ${result.columnGroups})`)).toBe(true);
  });

  test('without items, the document is the stage page alone', () => {
    const result = buildPdf(sceneFromStage(input()), table(3, 0), null, texts, new Date());
    expect(result.pages).toBe(1);
  });

  test('characters the fonts cannot show are counted across the whole document', () => {
    const result = buildPdf(sceneFromStage(input()), table(1, 2, (r) => (r === 0 ? 'Ωμέγα' : 'plain')), null, texts, new Date());
    expect(result.replaced).toBe(5);
  });
});
