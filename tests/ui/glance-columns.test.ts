import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, setRole } from './harness';

function values(prefix: 'map' | 'presentation'): string[][] {
  return [...byId(`${prefix}-glance-list`).querySelectorAll('.glance-entry')].map((e) => [...e.querySelectorAll('.glance-value')].map((v) => v.textContent ?? ''));
}

function picker(): Array<[string, boolean]> {
  return [...document.querySelectorAll<HTMLInputElement>('#glance-columns-list .glance-column-toggle')].map((b) => [b.dataset.header!, b.checked]);
}

function choose(header: string, on: boolean): void {
  const box = document.querySelector<HTMLInputElement>(`#glance-columns-list .glance-column-toggle[data-header="${header}"]`)!;
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

describe('configurable at-a-glance columns (FR-46)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    byId('tab-information').click();
    setRole('Group', 'area');
    setRole('Start', 'start');
    setRole('End', 'end');
    byId('tab-map').click();
  });

  test('by default the entries show the area, start, and end values; empty values are left out', () => {
    expect(values('map')).toEqual([
      ['North', '2024-01-05', '2024-02-01'],
      ['South', '2024-03-15'],
    ]);
    expect(byId('map-glance-list').querySelector('.glance-value')!.getAttribute('title')).toBe('Group');
  });

  test('the picker lists the columns with the defaults chosen; the name column is not offered', () => {
    expect(byId('glance-columns-summary').textContent).toBe('Columns shown');
    expect(picker()).toEqual([
      ['ID', false],
      ['Start', true],
      ['End', true],
      ['Group', true],
      ['Note', false],
    ]);
    expect(byId<HTMLButtonElement>('glance-columns-reset').disabled).toBe(true);
  });

  test('choosing columns changes the entries of both segments; the values keep the list order', async () => {
    choose('Note', true);
    choose('Start', false);
    expect(values('map')).toEqual([
      ['2024-02-01', 'North', 'Alpha item'],
      ['2024-03-15', 'South', 'Beta item'],
    ]);
    byId('tab-presentation').click();
    await flush();
    expect(values('presentation')).toEqual([
      ['2024-02-01', 'North', 'Alpha item'],
      ['2024-03-15', 'South', 'Beta item'],
    ]);
  });

  test('the defaults come back on request', () => {
    choose('Group', false);
    expect(byId<HTMLButtonElement>('glance-columns-reset').disabled).toBe(false);
    byId('glance-columns-reset').click();
    expect(values('map')[0]).toEqual(['North', '2024-01-05', '2024-02-01']);
  });

  test('a choice is an unsaved change and stays when roles change', async () => {
    const { stubSaveDialog, removeSaveDialog } = await import('./harness');
    stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    choose('Note', true);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    byId('tab-information').click();
    setRole('Group', '');
    byId('tab-map').click();
    // The chosen columns are kept by column, whatever their roles.
    expect(values('map')[0]).toEqual(['2024-01-05', '2024-02-01', 'North', 'Alpha item']);
  });

  test('without roles and without a choice, entries show the name only', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 60, 100]]);
    expect(values('map')).toEqual([[]]);
  });

  test('the picker follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('glance-columns-summary').textContent).toBe('Visade kolumner');
    expect(byId('glance-columns-reset').textContent).toBe('Använd standardkolumnerna');
  });

  test('the values sit beside the name on the entry line, under the dense scale', () => {
    const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
    expect(css).toMatch(/\.glance-values \{[^}]*margin-left: auto;/);
    expect(css).toMatch(/\.glance-values \.glance-value \+ \.glance-value \{[^}]*margin-left: var\(--dense-3\);/);
    // The name has priority; the values end in an ellipsis.
    expect(css).toMatch(/\.glance-text \.glance-name \{[^}]*min-width: 55%;/);
    expect(css).toMatch(/\.glance-values \{[^}]*text-overflow: ellipsis;/);
    expect(css).toMatch(/\.glance-columns ul \{[^}]*gap: var\(--dense-1\) var\(--dense-3\);/);
  });
});
