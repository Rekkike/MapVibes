// The economics view (FR-64): an item's year series in a table with the
// years as rows, the budget and the outcome-or-forecast track with its kind
// named and a bar inside the row, and the two totals. Rendering only: the
// figures come from economicsOf, the words from the caller.

import { yearRanges, type Economics, type Reading } from './economics';

export interface EconomicsLabels {
  // The item's name, and the view's own heading.
  name: string;
  heading: string;
  close: string;
  year: string;
  // The user's own series names.
  budget: string;
  outcome: string;
  forecast: string;
  // The heading of the track's column and total ("Utfall / Prognos").
  track: string;
  outside: string;
  noValue: string;
  // Templates: {sum}; {outcome} {forecast} with their years.
  sumBeside: string;
  composition: string;
  compositionOnly: string;
  texts: string;
  span: string;
}

export interface EconomicsFormat {
  locale: string;
  unit: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function formatAmount(value: number, decimals: number, format: EconomicsFormat): string {
  const number = new Intl.NumberFormat(format.locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
  return format.unit === '' ? number : `${number} ${format.unit}`;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '');
}

function rangesText(years: number[]): string {
  return yearRanges(years)
    .map(([a, b]) => (a === b ? String(a) : `${a}–${b}`))
    .join(', ');
}

// A cell's content: the amount, "–" for no value (never zero), or the value
// as typed.
function cell(reading: Reading, format: EconomicsFormat, labels: EconomicsLabels): HTMLElement {
  if (reading.kind === 'number') return el('span', 'economics-amount', formatAmount(reading.value, reading.decimals, format));
  if (reading.kind === 'text') return el('span', 'economics-amount is-text', reading.text);
  const none = el('span', 'economics-amount is-empty', '–');
  none.setAttribute('aria-label', labels.noValue);
  return none;
}

export function renderEconomics(container: HTMLElement, e: Economics, labels: EconomicsLabels, format: EconomicsFormat, close: () => void): void {
  container.replaceChildren();
  const header = el('div', 'economics-header');
  const titles = el('div', 'economics-titles');
  titles.appendChild(el('p', 'economics-kicker', labels.heading));
  const title = el('h2', 'economics-title', labels.name);
  title.id = `${container.id}-title`;
  container.setAttribute('aria-labelledby', title.id);
  titles.appendChild(title);
  const closeButton = el('button', 'economics-close icon-button', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', labels.close);
  closeButton.title = labels.close;
  closeButton.addEventListener('click', () => close());
  header.append(titles, closeButton);
  container.appendChild(header);

  // The totals: the budget on its own number; the track with its
  // composition. The file's figure leads; the sum of the years is beside it
  // when they differ.
  const totals = el('dl', 'economics-totals');
  const total = (label: string, t: NonNullable<Economics['budget']>, detail: string | null) => {
    const wrapper = el('div', 'economics-total');
    const value = el('dd', 'economics-total-value');
    const sum = formatAmount(t.sum, t.decimals, format);
    if (t.file?.kind === 'number') {
      value.appendChild(el('span', 'economics-total-figure', formatAmount(t.file.value, t.file.decimals, format)));
      if (Math.abs(t.file.value - t.sum) > 1e-9) value.appendChild(el('span', 'economics-total-sum', ` (${fill(labels.sumBeside, { sum })})`));
    } else {
      value.appendChild(el('span', 'economics-total-figure', sum));
    }
    if (detail) value.appendChild(el('span', 'economics-total-detail', detail));
    wrapper.append(el('dt', 'economics-total-label', label), value);
    totals.appendChild(wrapper);
  };
  if (e.budget) total(labels.budget, e.budget, null);
  if (e.track) {
    const { outcomeYears, forecastYears } = e.track;
    let detail: string | null = null;
    if (outcomeYears.length > 0 && forecastYears.length > 0) {
      detail = fill(labels.composition, { outcome: labels.outcome, outcomeYears: rangesText(outcomeYears), forecast: labels.forecast, forecastYears: rangesText(forecastYears) });
    } else if (outcomeYears.length > 0 || forecastYears.length > 0) {
      const only = outcomeYears.length > 0;
      detail = fill(labels.compositionOnly, { series: only ? labels.outcome : labels.forecast, years: rangesText(only ? outcomeYears : forecastYears) });
    }
    total(labels.track, e.track, detail);
  }
  container.appendChild(totals);
  if (e.span.start !== null && e.span.end !== null) container.appendChild(el('p', 'economics-span', fill(labels.span, { start: String(e.span.start), end: String(e.span.end) })));

  // The table, the years as rows.
  const table = el('table', 'economics-table');
  const head = el('tr');
  head.appendChild(el('th', 'economics-year', labels.year));
  if (e.budget) head.appendChild(el('th', 'economics-budget', labels.budget));
  if (e.track) head.appendChild(el('th', 'economics-track', labels.track));
  const thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const numbers = e.years.flatMap((y) => [y.budget, y.track?.reading]).filter((r): r is Extract<Reading, { kind: 'number' }> => r?.kind === 'number');
  const scale = Math.max(0, ...numbers.map((r) => Math.abs(r.value)));
  const body = el('tbody');
  for (const y of e.years) {
    const tr = el('tr', y.outside ? 'is-outside' : undefined);
    tr.dataset.year = String(y.year);
    const yearCell = el('th', 'economics-year', String(y.year));
    yearCell.scope = 'row';
    if (y.outside) yearCell.appendChild(el('span', 'economics-outside', labels.outside));
    tr.appendChild(yearCell);
    if (y.budget) {
      const td = el('td', 'economics-budget');
      td.appendChild(cell(y.budget, format, labels));
      tr.appendChild(td);
    }
    if (y.track) {
      const td = el('td', 'economics-track');
      td.dataset.kind = y.track.kind;
      const line = el('span', 'economics-track-line');
      line.appendChild(cell(y.track.reading, format, labels));
      if (y.track.reading.kind !== 'empty') line.appendChild(el('span', 'economics-kind', y.track.kind === 'outcome' ? labels.outcome : labels.forecast));
      td.appendChild(line);
      // The bar inside the row: solid for an outcome, lighter for a forecast.
      if (y.track.reading.kind === 'number' && scale > 0) {
        const bar = el('span', 'economics-bar');
        bar.dataset.kind = y.track.kind;
        bar.style.width = `${Math.round((Math.abs(y.track.reading.value) / scale) * 1000) / 10}%`;
        bar.setAttribute('aria-hidden', 'true');
        td.appendChild(bar);
      }
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  const scroll = el('div', 'economics-scroll');
  scroll.appendChild(table);
  container.appendChild(scroll);

  if (e.texts.length > 0) container.appendChild(el('p', 'economics-texts', labels.texts));
}
