import { describe, expect, test } from 'vitest';
import { PdfDocument } from '../../src/pdfwriter';
import { PdfPainter, PDF_PAGE, type PageFrame, type Painter } from '../../src/documents';
import {
  blockHeight,
  drawEconomicsPage,
  ECON,
  economicsBlock,
  layoutEconomics,
  type EconomicsBlock,
  type EconomicsPageLabels,
} from '../../src/documenteconomics';
import type { SeriesAssignments } from '../../src/economics';
import type { Rgb, Transform } from '../../src/pdfwriter';

class RecordingPainter implements Painter {
  ops: Array<{ op: string; args: unknown[] }> = [];
  private record(op: string, ...args: unknown[]): void {
    this.ops.push({ op, args });
  }
  save(): void {
    this.record('save');
  }
  restore(): void {
    this.record('restore');
  }
  fillColour(c: Rgb): void {
    this.record('fillColour', c);
  }
  strokeColour(c: Rgb): void {
    this.record('strokeColour', c);
  }
  lineWidth(w: number): void {
    this.record('lineWidth', w);
  }
  dash(pattern: readonly number[]): void {
    this.record('dash', pattern);
  }
  opacity(a: number): void {
    this.record('opacity', a);
  }
  roundLines(): void {
    this.record('roundLines');
  }
  beginPath(): void {
    this.record('beginPath');
  }
  moveTo(x: number, y: number): void {
    this.record('moveTo', x, y);
  }
  lineTo(x: number, y: number): void {
    this.record('lineTo', x, y);
  }
  curveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void {
    this.record('curveTo', x1, y1, x2, y2, x, y);
  }
  close(): void {
    this.record('close');
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.record('rect', x, y, w, h);
  }
  circle(cx: number, cy: number, r: number): void {
    this.record('circle', cx, cy, r);
  }
  svgPath(d: string, t: Transform): void {
    this.record('svgPath', d, t);
  }
  fill(): void {
    this.record('fill');
  }
  stroke(): void {
    this.record('stroke');
  }
  clip(): void {
    this.record('clip');
  }
  text(x: number, y: number, text: string): void {
    this.record('text', x, y, text);
  }
  image(): void {
    this.record('image');
  }
  texts(): string[] {
    return this.ops.filter((o) => o.op === 'text').map((o) => String(o.args[2]));
  }
}

const labels: EconomicsPageLabels = {
  title: 'Economics',
  name: '',
  heading: 'Economics',
  close: '',
  year: 'Year',
  budget: 'Budget',
  outcome: 'Outcome',
  forecast: 'Forecast',
  track: 'Outcome / Forecast',
  outside: "outside the item's years",
  noValue: 'no value',
  sumBeside: 'the years add up to {sum}',
  composition: '{outcome} {outcomeYears}, {forecast} {forecastYears}',
  compositionOnly: '{series} {years}',
  texts: 'Values that are not numbers are shown as typed and are left out of the sums.',
  span: "The item's years: {start}–{end}.",
};

const fmt = { locale: 'en-GB', unit: 'SEK' };

// A fictional series assignment: budget 2020-2022 with a total column,
// outcome 2020-2021, forecast 2022.
const series: SeriesAssignments = {
  budget: { name: 'Budget', columns: { '2020': 'b2020', '2021': 'b2021', '2022': 'b2022' }, total: 'btotal' },
  outcome: { name: 'Outcome', columns: { '2020': 'o2020', '2021': 'o2021' }, total: null },
  forecast: { name: 'Forecast', columns: { '2022': 'f2022' }, total: null },
};

// Alpha carries a not-a-number value in the budget (ambiguous, never
// guessed), one in the outcome, and a file total that differs from the sum
// of its years. Beta has no values at all: no block. Gamma has an outcome in
// a year outside its span.
const alpha = {
  b2020: '1000',
  b2021: '2000',
  b2022: '1234.567',
  btotal: '9999',
  o2020: '900',
  o2021: 'not a number',
  f2022: '500',
};
const gamma = { o2020: '300' };

function blocks(): EconomicsBlock[] {
  return [
    economicsBlock('1', 'Alpha', alpha, series, { start: 2020, end: 2022 }, 'SEK')!,
    economicsBlock('3', 'Gamma', gamma, { outcome: series.outcome! }, { start: 2024, end: 2025 }, 'SEK')!,
  ];
}

const frame = (): PageFrame => ({ width: PDF_PAGE.width, height: PDF_PAGE.height, margin: PDF_PAGE.margin, footer: 'MapVibes · page 1 of 1' });

describe('the economics blocks (FR-12 as amended in v1.13.0, FR-63 to FR-65)', () => {
  test('an item without economics has no block; absence is never an error', () => {
    expect(economicsBlock('2', 'Beta', {}, series, { start: 2020, end: 2022 }, 'SEK')).toBeNull();
    expect(economicsBlock('2', 'Beta', { b2020: '  ' }, series, { start: 2020, end: 2022 }, 'SEK')).toBeNull();
  });

  test('the blocks paginate whole, every block once, in order, within the body', () => {
    const many: EconomicsBlock[] = Array.from({ length: 12 }, (_, i) =>
      economicsBlock(
        String(i + 1),
        `Item ${i + 1}`,
        { b2020: '1000', b2021: '2000', b2022: '500', o2020: '900', f2022: '100' },
        series,
        { start: 2020, end: 2022 },
        'SEK',
      )!,
    );
    const layout = layoutEconomics(many, frame(), labels, fmt);
    expect(layout.pages.length).toBeGreaterThanOrEqual(1);
    expect(layout.pages.flat()).toEqual(many.map((_, i) => i));
    for (const page of layout.pages) {
      const used = page.reduce((s, i) => s + blockHeight(many[i], labels, fmt, frame().width - 2 * frame().margin, layout.table), 0);
      expect(used).toBeLessThanOrEqual(layout.bodyHeight + 1e-6);
    }
  });

  test('a block is drawn: the heading, the totals with the file figure leading and the sum beside it, the years with the unit, the dash, the outside mark, the bars, and the not-a-number note', () => {
    const bs = blocks();
    const layout = layoutEconomics(bs, frame(), labels, fmt);
    expect(layout.pages).toHaveLength(1);
    const p = new RecordingPainter();
    drawEconomicsPage(p, bs, labels, fmt, layout, layout.pages[0], frame());
    const texts = p.texts();
    // The heading: the number as shown and the name.
    expect(texts).toContain('1 ');
    expect(texts).toContain('Alpha');
    // The totals: the file's 9,999 leads, the sum of the years beside it.
    expect(texts.some((t) => t.includes('Budget: 9,999 SEK (the years add up to 3,000 SEK)'))).toBe(true);
    // The track total with its composition spelled out.
    expect(texts.some((t) => t.includes('Outcome / Forecast: 1,400 SEK') && t.includes('Outcome 2020–2021, Forecast 2022'))).toBe(true);
    // The years as rows, with the unit on every amount.
    expect(texts).toContain('2020');
    expect(texts).toContain('1,000 SEK');
    expect(texts).toContain('900 SEK (Outcome)');
    expect(texts).toContain('500 SEK (Forecast)');
    // The not-a-number values are shown as typed...
    expect(texts).toContain('1234.567');
    expect(texts).toContain('not a number');
    // ...and the note says they are left out of the sums.
    expect(texts).toContain(labels.texts);
    // Gamma's outcome year 2020 is outside its span 2024-2025 and is marked
    // (the cell wraps, so the mark may sit on its own line).
    expect(texts.join(' ')).toContain('outside the');
    expect(texts.join(' ')).toContain("item's years)");
    // The track bars: a fill for an outcome, an outline for a forecast.
    const barOps = p.ops.map((o, i) => ({ o, i })).filter(({ o }) => o.op === 'rect' && Number(o.args[3]) === ECON.barHeight);
    expect(barOps.length).toBeGreaterThanOrEqual(3);
    const paintsAfter = (i: number) => p.ops.slice(i + 1, i + 5).map((o) => o.op);
    expect(barOps.some(({ i }) => paintsAfter(i).includes('fill'))).toBe(true);
    expect(barOps.some(({ i }) => paintsAfter(i).includes('stroke'))).toBe(true);
    // The page title and the footer.
    expect(texts).toContain('Economics');
    expect(texts).toContain('MapVibes · page 1 of 1');
  });

  test('a year without a value shows the dash and adds nothing to a sum', () => {
    const b = economicsBlock('1', 'Alpha', { b2020: '1000', b2021: '', b2022: '2000', o2020: '900' }, series, { start: 2020, end: 2022 }, 'SEK')!;
    const layout = layoutEconomics([b], frame(), labels, fmt);
    const p = new RecordingPainter();
    drawEconomicsPage(p, [b], labels, fmt, layout, layout.pages[0], frame());
    expect(p.texts()).toContain('–');
    expect(p.texts().some((t) => t.includes('Budget: 3,000 SEK'))).toBe(true);
  });

  test('a unit character WinAnsi cannot represent is replaced and counted in the PDF', () => {
    const b = economicsBlock('1', 'Alpha', { b2020: '1000', o2020: '900' }, series, { start: 2020, end: 2020 }, '₹')!;
    const layout = layoutEconomics([b], frame(), labels, { locale: 'en-GB', unit: '₹' });
    const p = new RecordingPainter();
    drawEconomicsPage(p, [b], labels, { locale: 'en-GB', unit: '₹' }, layout, layout.pages[0], frame());
    const drawn = p.texts().join('').split('₹').length - 1;
    expect(drawn).toBeGreaterThan(0);
    const doc = new PdfDocument({ title: 't' });
    const page = doc.addPage(PDF_PAGE.width, PDF_PAGE.height);
    drawEconomicsPage(new PdfPainter(page, null), [b], labels, { locale: 'en-GB', unit: '₹' }, layout, layout.pages[0], frame());
    doc.toBytes();
    expect(doc.replacedCharacters).toBe(drawn);
  });
});
