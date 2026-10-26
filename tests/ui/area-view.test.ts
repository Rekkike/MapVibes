import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

function view(value: 'flat' | 'grouped'): void {
  const select = byId<HTMLSelectElement>('list-view');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

// The list as shown: section headings as "# name (count)", rows by ID.
function shown(): string[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-body tr')].map((tr) =>
    tr.classList.contains('group-row')
      ? `# ${tr.querySelector('.group-name')!.textContent} (${tr.querySelector('.group-count')!.textContent})`
      : tr.querySelector<HTMLInputElement>('td[data-header="ID"] .cell-input')!.value,
  );
}

function toggle(area: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(`#row-table-body tr.group-row[data-area="${area}"] .group-toggle`)!;
}

describe('group-by-area view (FR-17)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
  });

  test('the flat list is the default', () => {
    expect(byId<HTMLSelectElement>('list-view').value).toBe('flat');
    expect(shown()).toEqual(['A-01', 'A-02', 'A-03', 'A-04', 'A-05']);
  });

  test('the grouped view needs the area role and says so', () => {
    view('grouped');
    expect(byId('numbering-notice').textContent).toBe(
      'The view grouped by area needs the area role. Assign the area role to a column in the list; until then the flat list is shown.',
    );
    expect(shown()).toEqual(['A-01', 'A-02', 'A-03', 'A-04', 'A-05']);
  });

  test('the grouped view shows a section per area value, the items without one last', () => {
    setRole('Group', 'area');
    view('grouped');
    expect(shown()).toEqual(['# North (2 items)', 'A-01', 'A-02', '# South (1 items)', 'A-03', '# No area (2 items)', 'A-04', 'A-05']);
    // The heading spans the whole table.
    const th = document.querySelector<HTMLTableCellElement>('#row-table-body tr.group-row th')!;
    expect(th.colSpan).toBe(document.querySelectorAll('#row-table-head th').length);
  });

  test('sections collapse and expand', () => {
    setRole('Group', 'area');
    view('grouped');
    expect(toggle('North').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('North').getAttribute('aria-label')).toBe('Collapse the section: North');
    toggle('North').click();
    expect(shown()).toEqual(['# North (2 items)', '# South (1 items)', 'A-03', '# No area (2 items)', 'A-04', 'A-05']);
    expect(toggle('North').getAttribute('aria-expanded')).toBe('false');
    toggle('North').click();
    expect(shown()[1]).toBe('A-01');
  });

  test('filters work within the sections; sections without matching items are not shown', () => {
    setRole('Group', 'area');
    view('grouped');
    const kind = byId<HTMLSelectElement>('select-filter-kind');
    kind.value = 'contains';
    kind.dispatchEvent(new Event('change'));
    const column = byId<HTMLSelectElement>('select-filter-column');
    column.value = 'Note';
    column.dispatchEvent(new Event('change'));
    const text = byId<HTMLInputElement>('filter-text');
    text.value = 'item';
    text.dispatchEvent(new Event('input'));
    expect(shown()).toEqual(['# North (1 items)', 'A-01', '# South (1 items)', 'A-03', '# No area (2 items)', 'A-04', 'A-05']);
    text.value = 'Beta';
    text.dispatchEvent(new Event('input'));
    expect(shown()).toEqual(['# South (1 items)', 'A-03']);
  });

  test('sorting works within the sections', () => {
    setRole('Group', 'area');
    view('grouped');
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    expect(shown()).toEqual(['# North (2 items)', 'A-02', 'A-01', '# South (1 items)', 'A-03', '# No area (2 items)', 'A-05', 'A-04']);
  });

  test('select all takes only the rows of expanded sections', () => {
    setRole('Group', 'area');
    view('grouped');
    toggle('North').click();
    byId('select-all').click();
    expect(byId('counter-selected').textContent).toBe('Selected: 3');
  });

  test('editing an area value moves the row to its section; the flat view returns unchanged', () => {
    setRole('Group', 'area');
    view('grouped');
    const cell = document.querySelectorAll<HTMLElement>('#row-table-body tr:not(.group-row)')[4].querySelector<HTMLInputElement>('td[data-header="Group"] .cell-input')!;
    cell.value = 'South';
    cell.dispatchEvent(new Event('change'));
    // The typed value joined the area list (FR-32), whose order comes first.
    expect(shown()).toEqual(['# South (2 items)', 'A-03', 'A-05', '# North (2 items)', 'A-01', 'A-02', '# No area (1 items)', 'A-04']);
    view('flat');
    expect(shown()).toEqual(['A-01', 'A-02', 'A-03', 'A-04', 'A-05']);
  });

  test('the grouped view and the grouped numbering go together', () => {
    setRole('Group', 'area');
    view('grouped');
    const mode = byId<HTMLSelectElement>('numbering-mode');
    mode.value = 'grouped';
    mode.dispatchEvent(new Event('change'));
    expect([...document.querySelectorAll('#row-table-body .row-details')].map((b) => b.textContent)).toEqual(['1.1', '1.2', '2.1', '3.1', '3.2']);
  });

  test('the controls follow the language', () => {
    setRole('Group', 'area');
    view('grouped');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('list-view-text').textContent).toBe('Listvy');
    expect(shown()[0]).toBe('# North (2 objekt)');
    expect(shown()).toContain('# Inget område (2 objekt)');
  });
});
