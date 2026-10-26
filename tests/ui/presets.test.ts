import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, exampleFile, flush, importExampleWorkbook, mountApp, setRole } from './harness';

function roleOf(header: string): string {
  return document.querySelector<HTMLSelectElement>(`.role-select[data-header="${header}"]`)!.value;
}

function hidden(header: string): boolean {
  return !document.querySelector<HTMLInputElement>(`.column-visible[data-header="${header}"]`)!.checked;
}

function hideColumn(header: string): void {
  document.querySelector<HTMLInputElement>(`.column-visible[data-header="${header}"]`)!.click();
}

function savePreset(name: string): void {
  byId<HTMLInputElement>('preset-name').value = name;
  byId('preset-save').click();
}

function choose(name: string): void {
  const select = byId<HTMLSelectElement>('preset-select');
  select.value = name;
  select.dispatchEvent(new Event('change'));
}

async function importFile(name: string): Promise<void> {
  const input = byId<HTMLInputElement>('file-input');
  Object.defineProperty(input, 'files', { value: [exampleFile(name, 'application/octet-stream')], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

describe('saved column presets (FR-23)', () => {
  beforeEach(async () => {
    await mountApp();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await importExampleWorkbook();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('the current configuration is saved under a name and stored locally', () => {
    setRole('ID', 'identifier');
    setRole('Note', 'name');
    hideColumn('End');
    savePreset('Standard');
    expect(byId('preset-status').textContent).toBe('The preset "Standard" was saved.');
    expect([...byId<HTMLSelectElement>('preset-select').options].map((o) => o.value)).toEqual(['', 'Standard']);
    const stored = JSON.parse(localStorage.getItem('mapvibes.presets')!);
    expect(stored).toEqual([
      { name: 'Standard', headers: ['ID', 'Start', 'End', 'Group', 'Note'], hidden: ['End'], roles: { identifier: 'ID', name: 'Note' }, areas: [], statuses: [] },
    ]);
  });

  test('a later import with the same headers applies the matching preset automatically', async () => {
    setRole('Group', 'area');
    hideColumn('Start');
    savePreset('Standard');
    await importFile('example.xlsx');
    expect(roleOf('Group')).toBe('area');
    expect(hidden('Start')).toBe(true);
    expect(byId('preset-status').textContent).toBe('The preset "Standard" matches these columns and was applied automatically.');
    expect(byId<HTMLSelectElement>('preset-select').value).toBe('Standard');
  });

  test('presets persist across sessions through local storage and auto-apply there', async () => {
    setRole('ID', 'identifier');
    savePreset('Standard');
    await mountApp({ keepStorage: true });
    await importExampleWorkbook();
    expect(roleOf('ID')).toBe('identifier');
  });

  test('an import with other headers is not matched; such presets are marked', async () => {
    setRole('ID', 'identifier');
    savePreset('Standard');
    await importFile('example-repeated-headers.xlsx');
    expect(byId('preset-status').textContent).toBe('');
    const option = [...byId<HTMLSelectElement>('preset-select').options].find((o) => o.value === 'Standard')!;
    expect(option.textContent).toBe('Standard (other columns)');
    expect(option.dataset.matches).toBe('false');
  });

  test('presets can be applied and switched', () => {
    setRole('ID', 'identifier');
    savePreset('One');
    setRole('ID', '');
    setRole('Note', 'name');
    hideColumn('Group');
    savePreset('Two');
    choose('One');
    byId('preset-apply').click();
    expect(roleOf('ID')).toBe('identifier');
    expect(roleOf('Note')).toBe('');
    expect(hidden('Group')).toBe(false);
    choose('Two');
    byId('preset-apply').click();
    expect(roleOf('Note')).toBe('name');
    expect(roleOf('ID')).toBe('');
    expect(hidden('Group')).toBe(true);
    expect(byId('preset-status').textContent).toBe('The preset "Two" was applied.');
  });

  test('a preset can be removed after confirmation, also from storage', () => {
    savePreset('One');
    savePreset('Two');
    choose('One');
    byId('preset-remove').click();
    expect([...byId<HTMLSelectElement>('preset-select').options].map((o) => o.value)).toEqual(['', 'Two']);
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!).map((x: { name: string }) => x.name)).toEqual(['Two']);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    choose('Two');
    byId('preset-remove').click();
    expect([...byId<HTMLSelectElement>('preset-select').options].map((o) => o.value)).toEqual(['', 'Two']);
  });

  test('saving under an existing name asks before replacing', () => {
    setRole('ID', 'identifier');
    savePreset('One');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    setRole('ID', '');
    savePreset('One');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('mapvibes.presets')!)[0].roles).toEqual({ identifier: 'ID' });
  });

  test('an empty preset name saves nothing', () => {
    savePreset('   ');
    expect(localStorage.getItem('mapvibes.presets')).toBeNull();
  });
});
