// The economics blocks of the documents (FR-12 as amended in v1.13.0,
// FR-63 to FR-65, the explicit reversal of Pass 15's D9): each shown item
// with economics gets one block — its years as rows, the budget and the
// outcome-or-forecast track with its kind named, "–" for no value, a value
// that is not a number shown as typed outside the sums with a note, a year
// outside the item's span marked, the file's total leading with the sum of
// the years beside it when they differ, and the work's currency unit printed
// with every amount. An item without economics is simply absent. Pure: no
// DOM, no state; drawn through the Painter like the other page kinds.

import { economicsOf, formatAmount, yearRangesText, type Economics, type EconomicsFormat, type SeriesAssignments } from './economics';
import type { EconomicsLabels } from './economicsview';
import {
  drawFooter,
  layoutTable,
  LEGEND_FONT,
  PALETTE,
  rowCells,
  rowHeight,
  wrapValue,
  type DocumentTable,
  type PageFrame,
  type Painter,
  TABLE,
} from './documents';
import { fitText, textWidth, type Rgb } from './pdfwriter';

// One shown item's economics block, or null when the item has none (absence
// is never an error and never a zero).
export interface EconomicsBlock {
  // The number as shown, and the display name.
  label: string;
  name: string;
  economics: Economics;
}

export function economicsBlock(
  label: string,
  name: string,
  values: Record<string, string>,
  series: SeriesAssignments,
  span: { start: number | null; end: number | null },
  unit: string,
): EconomicsBlock | null {
  const economics = economicsOf(values, series, span, unit);
  return economics === null ? null : { label, name, economics };
}

export interface EconomicsPageLabels extends EconomicsLabels {
  // The page title.
  title: string;
}

// The blocks' geometry in page units.
export const ECON = {
  titleFont: 11,
  titleHeight: 20,
  headingFont: 9,
  headingHeight: 15,
  totalsFont: 9,
  totalsLineHeight: 12.5,
  totalsMaxLines: 2,
  noteFont: 9,
  noteLineHeight: 12,
  barHeight: 3,
  gap: 5,
} as const;

export interface EconomicsLayout {
  titleHeight: number;
  bodyTop: number;
  bodyHeight: number;
  // Per page, the indices into the blocks array, in order; every block once.
  pages: number[][];
  // The three columns' layout at the page's content width (the headings are
  // the same for every block).
  table: ReturnType<typeof layoutTable>;
}

// The height of one block in page units: its heading, its totals lines, the
// years table (heading row and year rows, wrapped as the table wraps), and
// the not-a-number note. The table's layout is the one computed over all the
// blocks' cells, so that every block's rows wrap as laid out.
export function blockHeight(
  block: EconomicsBlock,
  labels: EconomicsPageLabels,
  fmt: EconomicsFormat,
  width: number,
  table: ReturnType<typeof layoutTable>,
  e = ECON,
): number {
  const own = blockTable(block, labels, fmt);
  const heading = e.headingHeight;
  const totals = totalsLines(block, labels, fmt, width, e).reduce((s, lines) => s + lines * e.totalsLineHeight, 0);
  const rows =
    rowHeight(
      table.groups[0].map((c) => own.headings[c]),
      table.widths[0],
      'bold',
      TABLE,
    ) +
    own.rows.reduce(
      (s, r) =>
        s +
        rowHeight(
          table.groups[0].map((c) => r[c] ?? ''),
          table.widths[0],
          'regular',
          TABLE,
        ),
      0,
    );
  const note = block.economics.texts.length > 0 ? e.noteLineHeight : 0;
  return heading + totals + rows + note + e.gap;
}

// The block's years as a three-column table: year, budget, track — the
// cells as strings, the amounts formatted with the work's unit, "–" for no
// value, a value that is not a number as typed.
function blockTable(block: EconomicsBlock, labels: EconomicsPageLabels, fmt: EconomicsFormat): DocumentTable {
  const cell = (reading: Economics['years'][number]['budget']): string => {
    if (reading === null) {
      return '';
    }
    if (reading.kind === 'number') {
      return formatAmount(reading.value, reading.decimals, fmt);
    }
    if (reading.kind === 'text') {
      return reading.text;
    }
    return '–';
  };
  return {
    headings: [labels.year, labels.budget, labels.track],
    rows: block.economics.years.map((y) => [
      String(y.year) + (y.outside ? ` (${labels.outside})` : ''),
      cell(y.budget),
      y.track === null
        ? ''
        : y.track.reading.kind === 'number'
          ? `${formatAmount(y.track.reading.value, y.track.reading.decimals, fmt)} (${y.track.kind === 'outcome' ? labels.outcome : labels.forecast})`
          : y.track.reading.kind === 'text'
            ? y.track.reading.text
            : '–',
    ]),
  };
}

// The totals lines: the budget on its own, the track with its composition;
// the file's figure leads, the sum of the years beside it when they differ.
function totalsLines(block: EconomicsBlock, labels: EconomicsPageLabels, fmt: EconomicsFormat, width: number, e: typeof ECON): number[] {
  const out: number[] = [];
  const total = (label: string, t: NonNullable<Economics['budget']>, detail: string | null) => {
    let text = `${label}: `;
    const sum = formatAmount(t.sum, t.decimals, fmt);
    if (t.file?.kind === 'number') {
      text += formatAmount(t.file.value, t.file.decimals, fmt);
      if (Math.abs(t.file.value - t.sum) > 1e-9) {
        text += ` (${fill(labels.sumBeside, { sum })})`;
      }
    } else {
      text += sum;
    }
    if (detail) {
      text += ` — ${detail}`;
    }
    out.push(wrapValue(text, width, 'regular', e.totalsFont, e.totalsMaxLines).length);
  };
  if (block.economics.budget) {
    total(labels.budget, block.economics.budget, null);
  }
  if (block.economics.track) {
    const { outcomeYears, forecastYears } = block.economics.track;
    let detail: string | null = null;
    if (outcomeYears.length > 0 && forecastYears.length > 0) {
      detail = fill(labels.composition, {
        outcome: labels.outcome,
        outcomeYears: yearRangesText(outcomeYears),
        forecast: labels.forecast,
        forecastYears: yearRangesText(forecastYears),
      });
    } else if (outcomeYears.length > 0 || forecastYears.length > 0) {
      const only = outcomeYears.length > 0;
      detail = fill(labels.compositionOnly, { series: only ? labels.outcome : labels.forecast, years: yearRangesText(only ? outcomeYears : forecastYears) });
    }
    total(labels.track, block.economics.track, detail);
  }
  return out;
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ''));
}

// Lays the blocks out on a page frame: the pages, each holding whole blocks.
export function layoutEconomics(blocks: EconomicsBlock[], frame: PageFrame, labels: EconomicsPageLabels, fmt: EconomicsFormat, e = ECON): EconomicsLayout {
  const width = frame.width - 2 * frame.margin;
  const footerSpace = frame.footer === '' ? 0 : LEGEND_FONT * 2;
  const bodyTop = frame.margin + e.titleHeight;
  const bodyHeight = frame.height - frame.margin - footerSpace - bodyTop;
  // The three columns' layout, computed over every block's cells, so the
  // widest cell (a year with its outside mark) sets the year column's width.
  const table = layoutTable(
    { headings: [labels.year, labels.budget, labels.track], rows: blocks.flatMap((b) => blockTable(b, labels, fmt).rows) },
    width,
    TABLE,
  );
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  blocks.forEach((block, i) => {
    const h = blockHeight(block, labels, fmt, width, table, e);
    if (page.length > 0 && used + h > bodyHeight) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(i);
    used += h;
  });
  if (page.length > 0) {
    pages.push(page);
  }
  return { titleHeight: e.titleHeight, bodyTop, bodyHeight, pages, table };
}

// One economics page: the title, then the blocks — heading, totals, the
// years table with the track's bar in each cell, and the not-a-number note —
// then the footer.
export function drawEconomicsPage(
  p: Painter,
  blocks: EconomicsBlock[],
  labels: EconomicsPageLabels,
  fmt: EconomicsFormat,
  layout: EconomicsLayout,
  page: number[],
  frame: PageFrame,
  e = ECON,
): void {
  const width = frame.width - 2 * frame.margin;
  let y = frame.margin;
  p.fillColour(PALETTE.fg);
  p.text(frame.margin, y + e.titleFont, labels.title, 'bold', e.titleFont);
  y += e.titleHeight;
  for (const i of page) {
    const block = blocks[i];
    // The heading: the number as shown and the name.
    p.fillColour(PALETTE.fg);
    const number = `${block.label} `;
    p.text(frame.margin, y + e.headingFont, number, 'bold', e.headingFont);
    p.text(
      frame.margin + textWidth(number, 'bold', e.headingFont),
      y + e.headingFont,
      fitText(block.name, 'regular', e.headingFont, width - textWidth(number, 'bold', e.headingFont)),
      'regular',
      e.headingFont,
    );
    y += e.headingHeight;
    // The totals.
    p.fillColour(PALETTE.fg);
    const lines = totalsText(block, labels, fmt, width, e);
    for (const text of lines) {
      p.text(frame.margin, y + e.totalsLineHeight - 2, text, 'regular', e.totalsFont);
      y += e.totalsLineHeight;
    }
    // The years table, with the track's bar in the track cell: solid for an
    // outcome, outlined for a forecast, scaled to the item's largest amount.
    const table = blockTable(block, labels, fmt);
    const t = layout.table;
    const g = t.groups[0];
    const widths = t.widths[0];
    const numbers = block.economics.years
      .flatMap((yr) => [yr.budget, yr.track?.reading])
      .filter((r): r is Extract<NonNullable<Economics['years'][number]['budget']>, { kind: 'number' }> => r?.kind === 'number');
    const scale = Math.max(0, ...numbers.map((r) => Math.abs(r.value)));
    const drawRow = (
      values: string[],
      font: 'regular' | 'bold',
      shade: Rgb | null,
      trackKinds?: Array<'outcome' | 'forecast' | null>,
      trackValues?: Array<number | null>,
    ) => {
      const cells = rowCells(values, widths, font, TABLE);
      const h = Math.max(1, ...cells.map((c) => c.length)) * TABLE.lineHeight + 2 * TABLE.padding;
      let x = frame.margin;
      if (shade) {
        p.fillColour(shade);
        p.beginPath();
        p.rect(
          x,
          y,
          widths.reduce((s, w) => s + w, 0),
          h,
        );
        p.fill();
      }
      cells.forEach((cellLines, ci) => {
        // The bar in the track cell (the third column).
        const trackValue = trackValues?.[ci];
        if (ci === 2 && trackKinds && trackValue !== null && trackValue !== undefined && scale > 0) {
          const share = Math.min(1, Math.abs(trackValue) / scale);
          const bw = (widths[ci] - 2 * TABLE.padding) * share;
          const by = y + h - TABLE.padding - e.barHeight;
          p.beginPath();
          p.rect(x + TABLE.padding, by, bw, e.barHeight);
          if (trackKinds[ci] === 'outcome') {
            p.fillColour(PALETTE.fg);
            p.fill();
          } else {
            p.strokeColour(PALETTE.fg);
            p.lineWidth(0.6);
            p.stroke();
          }
        }
        p.fillColour(PALETTE.fg);
        cellLines.forEach((line, l) => p.text(x + TABLE.padding, y + TABLE.padding + (l + 0.78) * TABLE.lineHeight, line, font, TABLE.font));
        x += widths[ci];
      });
      p.strokeColour(PALETTE.border);
      p.lineWidth(0.5);
      p.beginPath();
      p.moveTo(frame.margin, y + h);
      p.lineTo(x, y + h);
      p.stroke();
      y += h;
    };
    drawRow(
      g.map((c) => table.headings[c]),
      'bold',
      PALETTE.shade,
    );
    table.rows.forEach((row, ri) => {
      const yr = block.economics.years[ri];
      drawRow(
        g.map((c) => row[c] ?? ''),
        'regular',
        ri % 2 === 1 ? ([0xf8, 0xf9, 0xfb] as Rgb) : null,
        [null, null, yr.track?.kind ?? null],
        [null, null, yr.track?.reading.kind === 'number' ? yr.track.reading.value : null],
      );
    });
    // The not-a-number note: the values shown as typed are left out of the sums.
    if (block.economics.texts.length > 0) {
      p.fillColour(PALETTE.muted);
      p.text(frame.margin, y + e.noteLineHeight - 2, fitText(labels.texts, 'regular', e.noteFont, width), 'regular', e.noteFont);
      y += e.noteLineHeight;
    }
    y += e.gap;
  }
  drawFooter(p, frame);
}

// The totals as the wrapped lines they are drawn as.
function totalsText(block: EconomicsBlock, labels: EconomicsPageLabels, fmt: EconomicsFormat, width: number, e: typeof ECON): string[] {
  const out: string[] = [];
  const total = (label: string, t: NonNullable<Economics['budget']>, detail: string | null) => {
    let text = `${label}: `;
    const sum = formatAmount(t.sum, t.decimals, fmt);
    if (t.file?.kind === 'number') {
      text += formatAmount(t.file.value, t.file.decimals, fmt);
      if (Math.abs(t.file.value - t.sum) > 1e-9) {
        text += ` (${fill(labels.sumBeside, { sum })})`;
      }
    } else {
      text += sum;
    }
    if (detail) {
      text += ` — ${detail}`;
    }
    out.push(...wrapValue(text, width, 'regular', e.totalsFont, e.totalsMaxLines));
  };
  if (block.economics.budget) {
    total(labels.budget, block.economics.budget, null);
  }
  if (block.economics.track) {
    const { outcomeYears, forecastYears } = block.economics.track;
    let detail: string | null = null;
    if (outcomeYears.length > 0 && forecastYears.length > 0) {
      detail = fill(labels.composition, {
        outcome: labels.outcome,
        outcomeYears: yearRangesText(outcomeYears),
        forecast: labels.forecast,
        forecastYears: yearRangesText(forecastYears),
      });
    } else if (outcomeYears.length > 0 || forecastYears.length > 0) {
      const only = outcomeYears.length > 0;
      detail = fill(labels.compositionOnly, { series: only ? labels.outcome : labels.forecast, years: yearRangesText(only ? outcomeYears : forecastYears) });
    }
    total(labels.track, block.economics.track, detail);
  }
  return out;
}
