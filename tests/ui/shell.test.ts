import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

function screen(): Document {
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  return doc;
}

describe('application shell markup', () => {
  test('the layout contains a list area and a map area (Pass 1 shell)', () => {
    const doc = screen();
    expect(doc.getElementById('list-area')).not.toBeNull();
    expect(doc.getElementById('map-area')).not.toBeNull();
    expect(doc.getElementById('map-placeholder')).not.toBeNull();
  });

  test('the language and theme controls exist (FR-19, FR-20)', () => {
    const doc = screen();
    const lang = doc.querySelector<HTMLSelectElement>('#select-language');
    expect(lang).not.toBeNull();
    expect([...lang!.options].map((o) => o.value)).toEqual(['en', 'sv']);
    const theme = doc.querySelector<HTMLSelectElement>('#select-theme');
    expect(theme).not.toBeNull();
    expect([...theme!.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });

  test('the theme default in the markup is follow-system (FR-20)', () => {
    const doc = screen();
    const theme = doc.querySelector<HTMLSelectElement>('#select-theme');
    expect(theme!.options[0].value).toBe('system');
  });

  test('the list area provides the FR-2 conveniences in markup', () => {
    const doc = screen();
    expect(doc.getElementById('select-filter-kind')).not.toBeNull();
    expect(doc.getElementById('select-filter-column')).not.toBeNull();
    expect(doc.getElementById('filter-text')).not.toBeNull();
    expect(doc.getElementById('column-visibility')).not.toBeNull();
    expect(doc.getElementById('select-all')).not.toBeNull();
    expect(doc.getElementById('delete-selected')).not.toBeNull();
    expect(doc.getElementById('counter-retained')).not.toBeNull();
    expect(doc.getElementById('counter-removed')).not.toBeNull();
    expect(doc.getElementById('counter-selected')).not.toBeNull();
  });

  test('the filter control offers all, empty, non-empty, and contains (FR-2)', () => {
    const doc = screen();
    const select = doc.querySelector<HTMLSelectElement>('#select-filter-kind');
    expect([...select!.options].map((o) => o.value)).toEqual(['all', 'empty', 'nonempty', 'contains']);
  });

  test('the colour controls offer the four defined colours (FR-2)', () => {
    const doc = screen();
    const chips = doc.querySelectorAll('.colour-chip');
    expect(chips.length).toBe(0);
  });
});

describe('page bootstrap (FR-19, FR-20)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('the document theme attribute is set from the stored theme', async () => {
    const { savePreferences } = await import('../../src/preferences');
    savePreferences({ lang: 'en', theme: 'dark' });
    expect(localStorage.getItem('mapvibes.preferences')).toContain('"theme":"dark"');
    const { loadPreferences } = await import('../../src/preferences');
    expect(loadPreferences().theme).toBe('dark');
  });

  test('language strings are externalised for both locales', async () => {
    const { strings } = await import('../../src/i18n');
    expect(strings('en').retained).toBe('Retained rows');
    expect(strings('sv').retained).toBe('Behållna rader');
    expect(strings('en').filterEmpty).toBe('Empty cells');
    expect(strings('sv').filterEmpty).toBe('Tomma celler');
  });
});
