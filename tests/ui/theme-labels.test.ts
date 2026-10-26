import { beforeEach, describe, expect, test } from 'vitest';
import { byId, mountApp } from './harness';

function themeLabels(): string[] {
  return [...byId<HTMLSelectElement>('select-theme').options].map((o) => o.textContent ?? '');
}

function setLanguage(lang: string): void {
  const select = byId<HTMLSelectElement>('select-language');
  select.value = lang;
  select.dispatchEvent(new Event('change'));
}

// Regression test for the pre-existing defect: the theme option labels did
// not follow the language toggle (FR-19).
describe('theme option labels follow the language (FR-19, FR-20)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  test('the labels are English by default', () => {
    expect(themeLabels()).toEqual(['Follow system', 'Light', 'Dark']);
  });

  test('switching to Swedish translates the labels, and switching back restores them', () => {
    setLanguage('sv');
    expect(themeLabels()).toEqual(['Följ systemet', 'Ljust', 'Mörkt']);
    setLanguage('en');
    expect(themeLabels()).toEqual(['Follow system', 'Light', 'Dark']);
  });

  test('the option values and the current choice are unchanged by translation', () => {
    const theme = byId<HTMLSelectElement>('select-theme');
    theme.value = 'dark';
    theme.dispatchEvent(new Event('change'));
    setLanguage('sv');
    expect([...theme.options].map((o) => o.value)).toEqual(['system', 'light', 'dark']);
    expect(theme.value).toBe('dark');
  });

  test('a stored Swedish preference shows Swedish labels at start', async () => {
    setLanguage('sv');
    expect(localStorage.getItem('mapvibes.preferences')).toContain('"lang":"sv"');
    await mountApp({ keepStorage: true });
    expect(byId<HTMLSelectElement>('select-language').value).toBe('sv');
    expect(themeLabels()).toEqual(['Följ systemet', 'Ljust', 'Mörkt']);
  });
});
