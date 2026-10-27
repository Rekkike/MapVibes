import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { crc32, unzipStored, zip } from '../../src/zipwriter';
import { buildPptx, SLIDE, xmlText, type PptxContent } from '../../src/pptxwriter';
import { pptxTables, type DocumentTable } from '../../src/documents';

const png = new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.png')));
const AT = new Date(2026, 0, 2, 3, 4, 6);

describe('the zip writer (FR-51)', () => {
  test('CRC-32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  test('stored entries round-trip with their names, checksums, and offsets', () => {
    const entries = [
      { name: 'a.txt', data: new TextEncoder().encode('first') },
      { name: 'dir/åäö.xml', data: new TextEncoder().encode('<x>ö</x>') },
      { name: 'empty', data: new Uint8Array() },
    ];
    const bytes = zip(entries, AT);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const back = unzipStored(bytes);
    expect(back.map((e) => e.name)).toEqual(['a.txt', 'dir/åäö.xml', 'empty']);
    expect(back.map((e) => new TextDecoder().decode(e.data))).toEqual(['first', '<x>ö</x>', '']);
    // The end record counts the entries and points at the central directory.
    const view = new DataView(bytes.buffer);
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(3);
    expect(view.getUint32(view.getUint32(end + 16, true), true)).toBe(0x02014b50);
    // The modification time is the given one (two-second resolution).
    expect(view.getUint16(10, true)).toBe((3 << 11) | (4 << 5) | 3);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (1 << 5) | 2);
  });

  test('repeated names are refused', () => {
    expect(() => zip([{ name: 'x', data: new Uint8Array() }, { name: 'x', data: new Uint8Array() }])).toThrow();
  });
});

function content(tables: PptxContent['tables'] = []): PptxContent {
  return { title: 'Plan & översikt <1>', image: { png, description: 'The stage' }, tables, font: 10, padding: 5, margin: 30, titleHeight: 28, lang: 'sv-SE', created: AT };
}

function parts(bytes: Uint8Array): Map<string, string> {
  return new Map(unzipStored(bytes).map((e) => [e.name, e.name.endsWith('.png') ? '' : new TextDecoder().decode(e.data)]));
}

function xml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

const sample: DocumentTable = {
  headings: ['No.', 'Name', 'Note'],
  rows: [
    ['1', 'Åsa & Örjan <test>', 'Ω and 平和 are kept'],
    ['2', 'Second', 'A long note that wraps over more than one line of the table on the slide, and then goes on further still, '.repeat(3).trim()],
  ],
};
const texts = { tableTitle: 'Items {from} to {to} of {total}', tableTitleParts: 'Items {from} to {to} of {total} ({part} of {parts})' };

describe('the PowerPoint writer: package structure (FR-51)', () => {
  test('every part is well-formed XML and has a content type; every relationship target exists', () => {
    const bytes = buildPptx(content(pptxTables(sample, texts).slides));
    const p = parts(bytes);
    for (const [name, text] of p) if (!name.endsWith('.png')) xml(text);
    const types = xml(p.get('[Content_Types].xml')!);
    const defaults = new Map([...types.getElementsByTagName('Default')].map((d) => [d.getAttribute('Extension'), d.getAttribute('ContentType')]));
    const overrides = new Map([...types.getElementsByTagName('Override')].map((o) => [o.getAttribute('PartName'), o.getAttribute('ContentType')]));
    for (const name of p.keys()) {
      if (name === '[Content_Types].xml') continue;
      const ext = name.slice(name.lastIndexOf('.') + 1);
      expect(overrides.has(`/${name}`) || defaults.has(ext), name).toBe(true);
    }
    for (const part of overrides.keys()) expect(p.has(part!.slice(1)), part!).toBe(true);
    // Relationships point at parts that exist, relative to their source.
    for (const [name, text] of p) {
      if (!name.endsWith('.rels')) continue;
      const base = name.replace(/_rels\/[^/]*\.rels$/, '');
      for (const rel of xml(text).getElementsByTagName('Relationship')) {
        const target = new URL(rel.getAttribute('Target')!, `http://x/${base}`).pathname.slice(1);
        expect(p.has(target), `${name} → ${target}`).toBe(true);
      }
    }
  });

  test('the presentation lists the master and the slides at the 16:9 size; slide 1 is the image', () => {
    const p = parts(buildPptx(content(pptxTables(sample, texts).slides)));
    const pres = xml(p.get('ppt/presentation.xml')!);
    expect(pres.getElementsByTagName('p:sldId')).toHaveLength(2);
    const size = pres.getElementsByTagName('p:sldSz')[0];
    expect([Number(size.getAttribute('cx')), Number(size.getAttribute('cy'))]).toEqual([SLIDE.width, SLIDE.height]);
    const first = xml(p.get('ppt/slides/slide1.xml')!);
    expect(first.getElementsByTagName('p:pic')).toHaveLength(1);
    expect(first.getElementsByTagName('a:blip')[0].getAttribute('r:embed')).toBe('rId2');
    expect(p.get('ppt/slides/_rels/slide1.xml.rels')).toContain('Target="../media/image1.png"');
    expect(unzipStored(buildPptx(content())).find((e) => e.name === 'ppt/media/image1.png')!.data).toEqual(png);
  });

  test('the table slides hold native tables with the headings and every value, lines as laid out', () => {
    const tables = pptxTables(sample, texts);
    const p = parts(buildPptx(content(tables.slides)));
    const slide = xml(p.get('ppt/slides/slide2.xml')!);
    expect(slide.getElementsByTagName('a:tbl')).toHaveLength(1);
    expect(slide.getElementsByTagName('a:gridCol')).toHaveLength(3);
    expect(slide.getElementsByTagName('a:tr')).toHaveLength(3);
    const texts2 = [...slide.getElementsByTagName('a:t')].map((t) => t.textContent);
    expect(texts2[0]).toBe('Items 1 to 2 of 2');
    expect(texts2).toContain('Åsa & Örjan <test>');
    // Characters beyond WinAnsi are kept as they are in the PowerPoint file.
    expect(texts2).toContain('Ω and 平和 are kept');
    // The long note is in several paragraphs, as the layout broke it.
    const cell = [...slide.getElementsByTagName('a:tc')].find((tc) => tc.textContent!.startsWith('A long note'))!;
    expect(cell.getElementsByTagName('a:p').length).toBeGreaterThan(1);
    // The grid fills the slide's width between the margins.
    const widths = [...slide.getElementsByTagName('a:gridCol')].map((g) => Number(g.getAttribute('w')));
    expect(widths.reduce((s, w) => s + w, 0)).toBeCloseTo(SLIDE.width - 2 * 30 * 12700, -2);
  });

  test('the title and the creation time are in the document properties', () => {
    const p = parts(buildPptx(content()));
    const core = xml(p.get('docProps/core.xml')!);
    expect(core.getElementsByTagName('dc:title')[0].textContent).toBe('Plan & översikt <1>');
    expect(p.get('docProps/core.xml')).toContain('Plan &amp; översikt &lt;1&gt;');
  });

  test('many rows go on several slides; many columns in parts, each led by the number', () => {
    const many: DocumentTable = {
      headings: ['No.', ...Array.from({ length: 12 }, (_, c) => `Column ${c + 1}`)],
      rows: Array.from({ length: 60 }, (_, r) => [String(r + 1), ...Array.from({ length: 12 }, () => 'A value of some length')]),
    };
    const tables = pptxTables(many, texts);
    expect(tables.columnGroups).toBeGreaterThan(1);
    expect(tables.slides.length).toBeGreaterThan(tables.columnGroups);
    for (const s of tables.slides) expect(s.headings[0]).toBe('No.');
    expect(tables.slides[0].title).toMatch(/^Items 1 to \d+ of 60 \(1 of \d+\)$/);
  });

  test('without items there are no table slides', () => {
    expect(pptxTables({ headings: ['No.'], rows: [] }, texts).slides).toEqual([]);
  });
});

describe('XML text', () => {
  test('the special characters are escaped and characters XML forbids are dropped', () => {
    expect(xmlText(`a&b<c>d"e'f`)).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
    expect(xmlText('bell\u0007 and tab\tok')).toBe('bell and tab\tok');
    expect(xmlText('lone \ud800 surrogate, pair 😀 kept')).toBe('lone  surrogate, pair 😀 kept');
  });
});
