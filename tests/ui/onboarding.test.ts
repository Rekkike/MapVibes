import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

// Information-segment onboarding (FR-30 and FR-55 as amended in v1.3.0): the
// premapped empty list and the role explanation.

function heads(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-head th[data-header]')];
}

function helpLine(role: string): HTMLElement {
  return byId('role-help-list').querySelector<HTMLElement>(`li[data-role="${role}"]`)!;
}

describe('the premapped empty list (FR-30)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  test('the starter columns carry the name, start, end, and note roles, in the interface language', async () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    byId('start-empty').click();
    expect(heads().map((th) => th.querySelector<HTMLInputElement>('.column-name-input')!.value)).toEqual(['Namn', 'Startår', 'Slutår', 'Anteckning']);
    expect(heads().map((th) => th.dataset.role)).toEqual(['name', 'start', 'end', 'note']);
  });

  test('they are ordinary columns: renamed, given other roles, filled by hand', () => {
    byId('start-empty').click();
    const name = heads()[0].querySelector<HTMLInputElement>('.column-name-input')!;
    name.value = 'Title';
    name.dispatchEvent(new Event('change'));
    expect(heads()[0].querySelector<HTMLInputElement>('.column-name-input')!.value).toBe('Title');
    const key = heads()[3].dataset.header!;
    const select = document.querySelector<HTMLSelectElement>(`.role-select[data-header="${key}"]`)!;
    select.value = 'area';
    select.dispatchEvent(new Event('change'));
    expect(heads().find((th) => th.dataset.header === key)!.dataset.role).toBe('area');
    byId('add-row').click();
    expect(document.querySelectorAll('#row-table-body tr')).toHaveLength(1);
  });
});

describe('the role explanation (FR-55)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
  });

  test('"What do these do?" explains what every role feeds', () => {
    expect(byId('role-help-summary').textContent).toBe('What do these do?');
    expect([...byId('role-help-list').querySelectorAll('li')].map((li) => li.dataset.role)).toEqual(['identifier', 'name', 'start', 'end', 'area', 'status', 'program', 'note']);
    expect(helpLine('name').textContent).toContain('the header of the details panel and the card');
    expect(helpLine('start').textContent).toContain('at-a-glance column');
    expect(helpLine('end').textContent).toContain('at-a-glance column');
    expect(helpLine('note').textContent).toContain('headliner');
    expect(helpLine('area').textContent).toContain('groups');
    expect(helpLine('status').textContent).toContain('symbols');
    expect(helpLine('program').textContent).toContain('grouped numbering');
  });

  test('a role not assigned says so; an assigned role names its column', () => {
    expect(helpLine('name').querySelector('.role-help-status')!.textContent).toBe(' (not assigned)');
    expect(helpLine('name').querySelector('.role-help-status')!.classList.contains('is-missing')).toBe(true);
    setRole('Note', 'name');
    expect(helpLine('name').querySelector('.role-help-status')!.textContent).toBe(' (now: Note)');
  });

  test('the explanation follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('role-help-summary').textContent).toBe('Vad gör de här?');
    expect(helpLine('name').querySelector('.role-help-status')!.textContent).toBe(' (inte tilldelad)');
  });
});
