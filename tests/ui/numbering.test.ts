import { beforeEach, describe, expect, test } from 'vitest';
import { addColumn, byId, columnKeyOf, editCell, flush, markers, mountApp, placeExampleMarkers, placementItems, presentationMarkers, setRole } from './harness';
import { parseExport } from '../../src/exportfile';
import { readDataIsland } from '../../src/singlefile';

function listNumbers(): string[] {
  return [...document.querySelectorAll('#row-table-body .row-details')].map((b) => b.textContent ?? '');
}

function mode(value: 'global' | 'grouped'): void {
  const select = byId<HTMLSelectElement>('numbering-mode');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function deleteRow(index: number): void {
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[index].querySelector<HTMLInputElement>('.row-select')!.click();
  byId('delete-selected').click();
}

// A programme column added by hand: A-01 and A-04 in P-East, A-03 in P-West,
// A-02 and A-05 in none.
let programKey: string;

function addPrograms(): void {
  addColumn('Prog');
  programKey = columnKeyOf('Prog');
  editCell(0, 'Prog', 'P-East');
  editCell(2, 'Prog', 'P-West');
  editCell(3, 'Prog', 'P-East');
}

function programRole(on = true): void {
  setRole(programKey, on ? 'program' : '');
}

describe('numbering modes (FR-3, FR-17)', () => {
  let app: Awaited<ReturnType<typeof mountApp>>;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    // Markers for A-01, A-03, A-05.
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
    addPrograms();
  });

  test('the global numbering is the default', () => {
    expect(byId<HTMLSelectElement>('numbering-mode').value).toBe('global');
    expect(byId<HTMLSelectElement>('numbering-mode').options[1].textContent).toBe('By programme (1.1, 1.2, 2.1 …)');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(true);
  });

  test('the grouped mode needs the programme role and says so; the global numbers stay meanwhile', () => {
    mode('grouped');
    expect(byId('numbering-notice').textContent).toBe(
      'Numbering by programme needs the programme role. Assign the programme role to a column in the list; until then the global numbering applies.',
    );
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    // The area role does not count.
    setRole('Group', 'area');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    programRole();
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(true);
    expect(listNumbers()).toEqual(['1.1', '1', '2.1', '1.2', '2']);
  });

  test('items without a programme keep running numbers of their own; every number is unique', () => {
    programRole();
    mode('grouped');
    const numbers = listNumbers();
    expect(numbers.filter((n) => !n.includes('.'))).toEqual(['1', '2']);
    expect(new Set(numbers).size).toBe(5);
  });

  test('grouped numbers are the same in the list, on the markers, and in every panel and card', async () => {
    programRole();
    mode('grouped');
    expect(byId('numbering-groups').textContent).toBe('Programmes: 1. P-East · 2. P-West; items without a programme are numbered 1, 2, 3 …');
    byId('tab-map').click();
    expect(markers().map((m) => m.textContent)).toEqual(['1.1', '2.1', '2']);
    expect(placementItems().map((li) => li.querySelector('.marker-badge')!.textContent)).toEqual(['1.1', '1', '2.1', '1.2', '2']);
    expect([...document.querySelectorAll('#map-glance-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '2.1', '2']);
    expect(markers()[1].getAttribute('aria-label')).toBe('Marker 2.1: A-03');
    placementItems()[2].click();
    expect(byId('details-panel').querySelector('.details-badge')!.textContent).toBe('2.1');
    expect([...byId('map-legend').querySelectorAll('.legend-group[data-kind="programs"] .legend-entry')].map((e) => e.textContent)).toEqual([
      '1.P-East',
      '2.P-West',
    ]);
    byId('tab-presentation').click();
    await flush();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1.1', '2.1', '2']);
    expect([...document.querySelectorAll('#visibility-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '2.1', '2']);
  });

  test('the programmes follow the order of the programme list', () => {
    programRole();
    for (const v of ['P-West', 'P-East']) {
      byId<HTMLInputElement>('program-new').value = v;
      byId('program-add').click();
    }
    mode('grouped');
    expect(listNumbers()).toEqual(['2.1', '1', '1.1', '2.2', '2']);
  });

  test('grouped numbers regenerate on deletion and on a change of programme', () => {
    programRole();
    mode('grouped');
    deleteRow(0);
    // P-West now appears first.
    expect(listNumbers()).toEqual(['1', '1.1', '2.1', '2']);
    editCell(0, 'Prog', 'P-West');
    expect(listNumbers()).toEqual(['1.1', '1.2', '2.1', '1']);
  });

  test('sorting the list does not change the numbers', () => {
    programRole();
    mode('grouped');
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    expect(listNumbers()).toEqual(['2', '1.2', '2.1', '1', '1.1']);
  });

  test('removing the programme role falls back to the global numbers with the notice; the global mode restores them', () => {
    programRole();
    mode('grouped');
    programRole(false);
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(false);
    programRole();
    expect(listNumbers()[0]).toBe('1.1');
    mode('global');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-groups').textContent).toBe('');
    expect([...byId('map-legend').querySelectorAll('.legend-group[data-kind="programs"]')]).toHaveLength(0);
  });

  test('the grouped list view by area and the numbering by programme are independent', () => {
    programRole();
    mode('grouped');
    const view = byId<HTMLSelectElement>('list-view');
    view.value = 'grouped';
    view.dispatchEvent(new Event('change'));
    expect(byId('numbering-notice').textContent).toContain('The view grouped by area needs the area role.');
    setRole('Group', 'area');
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(true);
    expect(listNumbers()).toEqual(['1.1', '1', '2.1', '1.2', '2']);
  });

  test('an export in the grouped mode carries the grouped numbers', () => {
    programRole();
    mode('grouped');
    const data = parseExport(readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!);
    expect(data.numbers).toEqual([1, 2, 3, 4, 5]);
    expect(data.labels).toEqual(['1.1', '1', '2.1', '1.2', '2']);
    mode('global');
    const global = parseExport(readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!);
    expect(global.labels).toBeUndefined();
  });

  test('the comparison shows the grouped numbers of the current items', async () => {
    programRole();
    setRole('ID', 'identifier');
    const page = app.exportPage()!;
    mode('grouped');
    const { openWorkFile, textFile } = await import('./harness');
    openWorkFile(textFile('presentation.html', page));
    await flush();
    const names = [...document.querySelectorAll('#compare-groups .compare-name')].map((n) => n.textContent);
    expect(names).toContain('1.1. A-01');
    expect(names).toContain('2. A-05');
  });

  test('the controls follow the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('numbering-text').textContent).toBe('Numrering');
    expect(byId<HTMLSelectElement>('numbering-mode').options[1].textContent).toBe('Per program (1.1, 1.2, 2.1 …)');
    mode('grouped');
    expect(byId('numbering-notice').textContent).toContain('kräver programrollen');
  });
});

describe('grouped numbers in the exported viewer (FR-17, FR-38)', () => {
  test('the viewer shows the grouped numbers and their key', async () => {
    const app = await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    byId('tab-information').click();
    addPrograms();
    programRole();
    mode('grouped');
    const doc = new DOMParser().parseFromString(app.exportPage()!, 'text/html');
    const { stubImageDecoding, stubStageLayout } = await import('./harness');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1.1', '2.1']);
    expect([...document.querySelectorAll('#visibility-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '1', '2.1', '1.2', '2']);
    expect([...byId('presentation-legend').querySelectorAll('.legend-group[data-kind="programs"] .legend-entry')].map((e) => e.textContent)).toEqual([
      '1.P-East',
      '2.P-West',
    ]);
  });
});
