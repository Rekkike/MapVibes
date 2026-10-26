import { beforeEach, describe, expect, test } from 'vitest';
import { byId, editCell, flush, markers, mountApp, placeExampleMarkers, placementItems, presentationMarkers, setRole } from './harness';
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

describe('numbering modes (FR-3, FR-17)', () => {
  let app: Awaited<ReturnType<typeof mountApp>>;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    // Markers for A-01, A-03, A-05 (Group: North, South, empty).
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
  });

  test('the global numbering is the default', () => {
    expect(byId<HTMLSelectElement>('numbering-mode').value).toBe('global');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(true);
  });

  test('the grouped mode needs the area role and says so; the global numbers stay meanwhile', () => {
    mode('grouped');
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(false);
    expect(byId('numbering-notice').textContent).toBe(
      'Numbering by area needs the area role. Assign the area role to a column in the list; until then the global numbering applies.',
    );
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    setRole('Group', 'area');
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(true);
    expect(listNumbers()).toEqual(['1.1', '1.2', '2.1', '3.1', '3.2']);
  });

  test('grouped numbers are the same in the list, on the markers, and in every panel', () => {
    setRole('Group', 'area');
    mode('grouped');
    expect(byId('numbering-groups').textContent).toBe('Groups: 1. North · 2. South · 3. No area');
    byId('tab-map').click();
    expect(markers().map((m) => m.dataset.number)).toEqual(['1.1', '2.1', '3.2']);
    expect(markers().map((m) => m.textContent)).toEqual(['1.1', '2.1', '3.2']);
    expect(placementItems().map((li) => li.querySelector('.marker-badge')!.textContent)).toEqual(['1.1', '1.2', '2.1', '3.1', '3.2']);
    expect([...document.querySelectorAll('#map-glance-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '2.1', '3.2']);
    expect(markers()[1].getAttribute('aria-label')).toBe('Marker 2.1: A-03');
    placementItems()[2].click();
    expect(byId('details-panel').querySelector('.details-facts dd')!.textContent).toBe('2.1');
    expect(byId('details-panel').querySelector('.details-badge')!.textContent).toBe('2.1');
    // The legend explains the group numbers.
    expect([...byId('map-legend').querySelectorAll('.legend-group[data-kind="areas"] .legend-entry')].map((e) => e.textContent)).toEqual([
      '1.North',
      '2.South',
      '3.No area',
    ]);
    byId('tab-presentation').click();
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1.1', '2.1', '3.2']);
    expect([...document.querySelectorAll('#visibility-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '2.1', '3.2']);
  });

  test('the groups follow the order of the area list', async () => {
    setRole('Group', 'area');
    byId('area-panel-summary').click();
    for (const v of ['South', 'North']) {
      byId<HTMLInputElement>('area-new').value = v;
      byId('area-add').click();
    }
    mode('grouped');
    expect(listNumbers()).toEqual(['2.1', '2.2', '1.1', '3.1', '3.2']);
  });

  test('grouped numbers regenerate on deletion and on a change of area', () => {
    setRole('Group', 'area');
    mode('grouped');
    deleteRow(1);
    expect(listNumbers()).toEqual(['1.1', '2.1', '3.1', '3.2']);
    editCell(2, 'Group', 'North');
    expect(listNumbers()).toEqual(['1.1', '2.1', '1.2', '3.1']);
    byId('tab-map').click();
    expect(markers().map((m) => m.textContent)).toEqual(['1.1', '2.1', '3.1']);
  });

  test('sorting the list does not change the numbers', () => {
    setRole('Group', 'area');
    mode('grouped');
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    expect(listNumbers()).toEqual(['3.2', '3.1', '2.1', '1.2', '1.1']);
  });

  test('removing the area role falls back to the global numbers, with the notice; the global mode restores them', () => {
    setRole('Group', 'area');
    mode('grouped');
    setRole('Group', '');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-notice').classList.contains('hidden')).toBe(false);
    setRole('Group', 'area');
    expect(listNumbers()[0]).toBe('1.1');
    mode('global');
    expect(listNumbers()).toEqual(['1', '2', '3', '4', '5']);
    expect(byId('numbering-groups').textContent).toBe('');
    expect([...byId('map-legend').querySelectorAll('.legend-group[data-kind="areas"]')]).toHaveLength(0);
  });

  test('an export in the grouped mode carries the grouped numbers', () => {
    setRole('Group', 'area');
    mode('grouped');
    const page = app.exportPage()!;
    const data = parseExport(readDataIsland(new DOMParser().parseFromString(page, 'text/html'))!);
    expect(data.numbers).toEqual([1, 2, 3, 4, 5]);
    expect(data.labels).toEqual(['1.1', '1.2', '2.1', '3.1', '3.2']);
    mode('global');
    const global = parseExport(readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!);
    expect(global.labels).toBeUndefined();
  });

  test('the controls follow the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('numbering-text').textContent).toBe('Numrering');
    expect(byId<HTMLSelectElement>('numbering-mode').options[1].textContent).toBe('Per område (1.1, 1.2, 2.1 …)');
    mode('grouped');
    expect(byId('numbering-notice').textContent).toContain('kräver områdesrollen');
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
    setRole('Group', 'area');
    mode('grouped');
    const page = app.exportPage()!;
    const doc = new DOMParser().parseFromString(page, 'text/html');
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
    expect([...document.querySelectorAll('#visibility-list .marker-badge')].map((b) => b.textContent)).toEqual(['1.1', '1.2', '2.1', '3.1', '3.2']);
    expect([...byId('presentation-legend').querySelectorAll('.legend-group[data-kind="areas"] .legend-entry')].map((e) => e.textContent)).toEqual([
      '1.North',
      '2.South',
      '3.No area',
    ]);
  });
});
