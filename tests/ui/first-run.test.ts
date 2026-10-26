import { describe, expect, test } from 'vitest';
import { byId, mountApp } from './harness';

describe('first-run language (FR-19)', () => {
  test('with nothing remembered, the interface starts in Swedish', async () => {
    await mountApp({ firstRun: true });
    expect(byId<HTMLSelectElement>('select-language').value).toBe('sv');
    expect(document.documentElement.lang).toBe('sv');
    expect(byId('tab-map').textContent).toBe('Karta');
    expect(byId('list-heading').textContent).toBe('Lista');
    expect([...byId<HTMLSelectElement>('select-theme').options].map((o) => o.textContent)).toEqual(['Följ systemet', 'Ljust', 'Mörkt']);
  });

  test('a remembered English choice is kept', async () => {
    await mountApp({ firstRun: true });
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    await mountApp({ keepStorage: true });
    expect(byId<HTMLSelectElement>('select-language').value).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(byId('tab-map').textContent).toBe('Map');
  });
});
