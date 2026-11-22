import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, openWorkFile, stubSaveDialog, removeSaveDialog, textFile } from './harness';
import { parseWorkState } from '../../src/workstate';
import { DATA_ISLAND_ID } from '../../src/singlefile';

// The legacy stored copy of the withdrawn feature (v2.8.1). The automatic
// copy of v2.8.0 is withdrawn: the application writes no work state to
// device storage at any moment -- pinned here through edits, an explicit
// save, and pagehide. What remains is one final offer for a legacy key left
// by v2.8.0 or the withdrawn branch: on open, a seeded key offers once,
// clearly labelled as the copy of a withdrawn feature; restore applies it
// as v2.8.0 did, discard discards; either choice removes the key and the
// application never reads it again. A damaged copy is not offered; it is
// cleared with a notice. No key, no offer, no banner. The exported viewer
// never reads the key.

const KEY = 'mapvibes.stored-work';

// The storage's own setItem, reached without an unbound method reference.
function originalSetItem(): (this: Storage, key: string, value: string) => void {
  return (Storage.prototype as unknown as { setItem: (this: Storage, key: string, value: string) => void }).setItem;
}

function offerShown(): boolean {
  return !byId('legacy-offer').classList.contains('hidden');
}

// Saves the work through the stubbed save dialog and returns the file's
// text, so a valid legacy copy can be seeded from a real work state.
async function savedWorkText(): Promise<string> {
  await importExampleWorkbook();
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text ?? '';
}

// Seeds a legacy key exactly as v2.8.0 wrote it.
function seedLegacyCopy(state: string, savedAt = new Date().toISOString()): void {
  localStorage.setItem(KEY, JSON.stringify({ format: 'mapvibes-stored-work', version: 1, savedAt, state }));
}

describe('the withdrawal: zero storage writes of work state (v2.8.1)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  test('edits, an explicit save, and pagehide write no work state to device storage, ever', async () => {
    const calls: string[] = [];
    const orig = originalSetItem();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      calls.push(key);
      return orig.call(this, key, value);
    });
    await importExampleWorkbook();
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    document.querySelectorAll<HTMLInputElement>('#row-table-body .row-select')[0].click();
    byId('delete-selected').click();
    // An explicit save writes the work file -- and nothing to storage.
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(written.text).toContain('mapvibes-work-state');
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(calls).not.toContain(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    // No banner, no notice anywhere.
    expect(offerShown()).toBe(false);
    expect(byId('legacy-offer').classList.contains('hidden')).toBe(true);
    // And across a reload: no key, so no offer.
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('opening a work file writes nothing to device storage either', async () => {
    const text = await savedWorkText();
    const calls: string[] = [];
    const orig = originalSetItem();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      calls.push(key);
      return orig.call(this, key, value);
    });
    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    await flush();
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(calls).not.toContain(KEY);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(parseWorkState(text).rows.length).toBeGreaterThan(0);
  });
});

describe('the legacy stored copy: one final offer (v2.8.1)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  test('no key, no offer, no banner', async () => {
    await mountApp({ keepStorage: true });
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(offerShown()).toBe(false);
  });

  test('a seeded key offers once, labelled as the copy of a withdrawn feature, and restore applies it as v2.8.0 did', async () => {
    const text = await savedWorkText();
    const rows = parseWorkState(text).rows.length;
    seedLegacyCopy(text, new Date(Date.now() - 2 * 3600_000).toISOString());
    // A fresh application instance over the same storage (a reloaded page).
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    const offer = byId('legacy-text').textContent ?? '';
    expect(offer).toContain('automatic copy');
    expect(offer).toContain('withdrawn');
    expect(offer).toContain('2 hours ago');
    expect(offer).toContain('not a saved work file');
    expect(byId('legacy-restore').textContent).toBe('Restore the copy into the work');
    expect(byId('legacy-discard').textContent).toBe('Discard the copy');
    // Never applied silently: the list is still empty under the offer.
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(0);
    // The explicit action restores the work, exactly as v2.8.0 applied it.
    byId('legacy-restore').click();
    await flush();
    await flush();
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(rows);
    expect(byId('work-status').textContent).toContain('restored from the device copy of the withdrawn feature');
    expect(offerShown()).toBe(false);
    // Either choice removes the key; the application never reads it again.
    expect(localStorage.getItem(KEY)).toBeNull();
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(false);
  });

  test('the offer says the age in the interface language: minutes, hours, days, just now', async () => {
    const cases: Array<[number, string]> = [
      [30_000, 'just now'],
      [5 * 60_000, '5 min ago'],
      [3 * 3600_000, '3 hours ago'],
      [3 * 86_400_000, '3 days ago'],
    ];
    for (const [ms, age] of cases) {
      await mountApp();
      const text = await savedWorkText();
      seedLegacyCopy(text, new Date(Date.now() - ms).toISOString());
      await mountApp({ keepStorage: true });
      await flush();
      expect(offerShown()).toBe(true);
      expect(byId('legacy-text').textContent).toContain(age);
      byId('legacy-discard').click();
      await flush();
      expect(localStorage.getItem(KEY)).toBeNull();
      localStorage.clear();
      localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'en', theme: 'system' }));
    }
  });

  test('the offer in Swedish: kopian av den indragna funktionen, its age in Swedish', async () => {
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'sv', theme: 'system' }));
    await mountApp({ keepStorage: true });
    const text = await savedWorkText();
    seedLegacyCopy(text, new Date(Date.now() - 3 * 3600_000).toISOString());
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'sv', theme: 'system' }));
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    const offer = byId('legacy-text').textContent ?? '';
    expect(offer).toContain('automatiska kopian');
    expect(offer).toContain('dragits tillbaka');
    expect(offer).toContain('för 3 timmar sedan');
    expect(offer).toContain('inte en sparad arbetsfil');
    expect(byId('legacy-restore').textContent).toBe('Återställ kopian i arbetet');
    expect(byId('legacy-discard').textContent).toBe('Kasta kopian');
  });

  test('discarding the offer removes the key; a later open offers nothing', async () => {
    const text = await savedWorkText();
    seedLegacyCopy(text);
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    byId('legacy-discard').click();
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(offerShown()).toBe(false);
    expect(byId('work-status').textContent).toContain('discarded');
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(false);
  });

  test('a damaged copy is not offered; it is cleared with a notice, and a later open offers nothing', async () => {
    await mountApp();
    const text = await savedWorkText();
    seedLegacyCopy(text.slice(0, text.length / 2) + '{"format":"mapvibes-work-state"}');
    await mountApp({ keepStorage: true });
    await flush();
    // Not offered as a restore: the notice names the damaged copy instead.
    expect(offerShown()).toBe(true);
    expect(byId('legacy-text').textContent).toContain('cannot be read');
    expect(byId('legacy-text').textContent).toContain('withdrawn');
    expect(byId('legacy-restore').classList.contains('hidden')).toBe(true);
    expect(byId('legacy-discard').textContent).toBe('OK');
    // Cleared with the notice -- never silently.
    expect(localStorage.getItem(KEY)).toBeNull();
    byId('legacy-discard').click();
    await flush();
    expect(offerShown()).toBe(false);
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(false);
  });

  test('a key with a wrapper this application cannot parse is cleared with the notice too', async () => {
    await mountApp();
    localStorage.setItem(KEY, '{"format":"something-else"}');
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    expect(byId('legacy-text').textContent).toContain('cannot be read');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('the exported viewer never reads a legacy key: no offer, and the key untouched', async () => {
    const app = await mountApp({ singleFile: true });
    const text = await savedWorkText();
    seedLegacyCopy(text);
    const page = app.exportPage(new Date())!;
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    byId('legacy-discard').click();
    await flush();
    seedLegacyCopy(text);
    const before = localStorage.getItem(KEY);
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({ body: doc.body.innerHTML, keepStorage: true });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(document.getElementById(DATA_ISLAND_ID)).not.toBeNull();
    expect(offerShown()).toBe(false);
    expect(localStorage.getItem(KEY)).toBe(before);
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});
