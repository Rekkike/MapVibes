import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, placeExampleMarkers, removeSaveDialog, stubSaveDialog } from './harness';
import { parseWorkState } from '../../src/workstate';
import { DATA_ISLAND_ID } from '../../src/singlefile';

// The stored work on the device (v2.8.0): an automatic copy of the work in
// the browser's local storage, written on every change (debounced) and on
// pagehide, offered on open as a clearly labelled recovery -- never applied
// silently, never conflated with a saved work file -- with a way to clear
// it, a storage refusal reported honestly, and the exported viewer untouched.

const KEY = 'mapvibes.stored-work';

// The storage's own setItem, reached without an unbound method reference.
function originalSetItem(): (this: Storage, key: string, value: string) => void {
  return (Storage.prototype as unknown as { setItem: (this: Storage, key: string, value: string) => void }).setItem;
}

async function waitStored(): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if (localStorage.getItem(KEY) !== null) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the stored copy was not written');
}

function storedCopy(): { savedAt: string; state: string } {
  const raw = localStorage.getItem(KEY);
  expect(raw).not.toBeNull();
  const o = JSON.parse(raw!);
  expect(o.format).toBe('mapvibes-stored-work');
  expect(o.version).toBe(1);
  expect(typeof o.savedAt).toBe('string');
  expect(typeof o.state).toBe('string');
  return o;
}

function offerShown(): boolean {
  return !byId('recovery-offer').classList.contains('hidden');
}

async function makeStoredCopy(savedAt: string): Promise<void> {
  await mountApp();
  await importExampleWorkbook();
  await waitStored();
  // Rewrite the copy with the given moment, as if it had been stored then.
  const o = storedCopy();
  localStorage.setItem(KEY, JSON.stringify({ ...o, savedAt }));
}

describe('the stored work on the device (v2.8.0)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  test('a change stores the work on the device, debounced, as the work file itself; the unsaved mark stays', async () => {
    expect(localStorage.getItem(KEY)).toBeNull();
    await importExampleWorkbook();
    await waitStored();
    const copy = storedCopy();
    const ws = parseWorkState(copy.state);
    expect(ws.rows.length).toBeGreaterThan(0);
    expect(copy.state).toContain('"schemaVersion": 14');
    // The explicit save stays primary: the unsaved mark is untouched by the
    // stored copy, and the saved file is the same state.
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(parseWorkState(written.text!).rows.length).toBe(ws.rows.length);
  });

  test('pagehide writes the stored copy at once', async () => {
    await importExampleWorkbook();
    expect(localStorage.getItem(KEY)).toBeNull();
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(storedCopy().state).toContain('mapvibes-work-state');
  });

  test('on open a stored copy is offered, labelled with what it is and how old it is, and never applied silently', async () => {
    await importExampleWorkbook();
    const rows = document.querySelectorAll('#row-table-body tr').length;
    await waitStored();
    const savedAt = new Date(Date.now() - 2 * 3600_000).toISOString();
    localStorage.setItem(KEY, JSON.stringify({ ...storedCopy(), savedAt }));
    // A fresh application instance over the same storage (a reloaded page).
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    const text = byId('recovery-text').textContent ?? '';
    expect(text).toContain('Stored work on this device from');
    expect(text).toContain('2 hours ago');
    expect(text).toContain('not a saved work file');
    // Nothing was applied silently: the list is still empty.
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(0);
    expect(byId('work-clear-stored').classList.contains('hidden')).toBe(false);
    // Restoring applies it, as an explicit action, and says so.
    byId('recovery-restore').click();
    await flush();
    await flush();
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(rows);
    expect(byId('work-status').textContent).toContain('was restored');
    expect(byId('work-status').textContent).toContain('not a saved work file');
    expect(offerShown()).toBe(false);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(true);
    // The copy stays and tracks the restored work.
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  test('the offer says the age in the interface language: minutes, hours, days, just now', async () => {
    const cases: Array<[number, string]> = [
      [30_000, 'just now'],
      [5 * 60_000, '5 min ago'],
      [3 * 3600_000, '3 hours ago'],
      [3 * 86_400_000, '3 days ago'],
    ];
    for (const [ms, age] of cases) {
      await makeStoredCopy(new Date(Date.now() - ms).toISOString());
      await mountApp({ keepStorage: true });
      await flush();
      expect(offerShown()).toBe(true);
      expect(byId('recovery-text').textContent).toContain(age);
      byId('recovery-discard').click();
      await flush();
      expect(localStorage.getItem(KEY)).toBeNull();
      localStorage.clear();
      localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'en', theme: 'system' }));
    }
  });

  test('the offer in Swedish: sparat arbete, its age in Swedish', async () => {
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'sv', theme: 'system' }));
    await makeStoredCopy(new Date(Date.now() - 3 * 3600_000).toISOString());
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'sv', theme: 'system' }));
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    const text = byId('recovery-text').textContent ?? '';
    expect(text).toContain('Sparat arbete på den här enheten från');
    expect(text).toContain('för 3 timmar sedan');
    expect(text).toContain('inte en sparad arbetsfil');
    expect(byId('recovery-restore').textContent).toBe('Återställ sparat arbete');
    expect(byId('recovery-discard').textContent).toBe('Kasta sparat arbete');
    expect(byId('work-clear-stored').textContent).toBe('Rensa sparat arbete');
  });

  test('discarding the offer clears the stored work and dismisses it', async () => {
    await makeStoredCopy(new Date().toISOString());
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(true);
    byId('recovery-discard').click();
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(offerShown()).toBe(false);
    expect(byId('work-clear-stored').classList.contains('hidden')).toBe(true);
    expect(byId('work-status').textContent).toContain('was cleared');
  });

  test('the clear action removes the stored work without touching the work on screen', async () => {
    await importExampleWorkbook();
    const rows = document.querySelectorAll('#row-table-body tr').length;
    await waitStored();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    byId('work-clear-stored').click();
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(rows);
    expect(byId('work-status').textContent).toContain('was cleared');
  });

  test('a storage refusal is reported honestly and stays visible; the explicit save is unaffected', async () => {
    const orig = originalSetItem();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) {
        throw new DOMException('QuotaExceeded', 'QuotaExceededError');
      }
      return orig.call(this, key, value);
    });
    await importExampleWorkbook();
    // Let this instance's own debounced write fire before reading the notice.
    await new Promise((r) => setTimeout(r, 1400));
    for (let i = 0; i < 30; i++) {
      if (!byId('storage-refused').classList.contains('hidden')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    // The refusal has its own persistent notice, in the error style, and
    // does not mask the work status.
    expect(byId('storage-refused').classList.contains('hidden')).toBe(false);
    expect(byId('storage-refused').textContent).toContain('refused to store the work on this device');
    expect(byId('storage-refused').classList.contains('error')).toBe(true);
    // The refusal does not mask the work status.
    expect(byId('work-status').textContent ?? '').not.toContain('refused to store');
    // The unsaved mark stays: a refusal is not a save and not a loss.
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    // The explicit save writes the file as ever.
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(parseWorkState(written.text!).rows.length).toBeGreaterThan(0);
    expect(byId('work-status').textContent).toBe('Work saved.');
    // The refusal stays visible beside it: the stored write is still refused.
    expect(byId('storage-refused').classList.contains('hidden')).toBe(false);
  });

  test('a refusal is cleared when a stored write succeeds again', async () => {
    const orig = originalSetItem();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) {
        throw new DOMException('QuotaExceeded', 'QuotaExceededError');
      }
      return orig.call(this, key, value);
    });
    await importExampleWorkbook();
    await new Promise((r) => setTimeout(r, 1400));
    for (let i = 0; i < 30; i++) {
      if (!byId('storage-refused').classList.contains('hidden')) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(byId('storage-refused').textContent).toContain('refused to store');
    spy.mockRestore();
    // Another change stores the copy and clears the refusal.
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await waitStored();
    expect(byId('storage-refused').classList.contains('hidden')).toBe(true);
  });

  test('a stored copy that cannot be read is not offered, but can be cleared', async () => {
    await importExampleWorkbook();
    await waitStored();
    localStorage.setItem(
      KEY,
      JSON.stringify({ format: 'mapvibes-stored-work', version: 1, savedAt: new Date().toISOString(), state: '{"format":"mapvibes-work-state"}' }),
    );
    await mountApp({ keepStorage: true });
    await flush();
    expect(offerShown()).toBe(false);
    expect(byId('work-clear-stored').classList.contains('hidden')).toBe(false);
    byId('work-clear-stored').click();
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  test('the exported viewer never offers, reads, or writes a stored copy', async () => {
    // Build an exported page from a real session.
    const app = await mountApp({ singleFile: true, beforeMain: () => undefined });
    await importExampleWorkbook();
    await placeExampleMarkers([[0, 60, 100]]);
    const page = app.exportPage(new Date())!;
    // A stored copy exists on the device.
    await waitStored();
    const before = localStorage.getItem(KEY);
    const writes: string[] = [];
    const orig = originalSetItem();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      writes.push(key);
      return orig.call(this, key, value);
    });
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({ body: doc.body.innerHTML, keepStorage: true });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(document.getElementById(DATA_ISLAND_ID)).not.toBeNull();
    expect(offerShown()).toBe(false);
    expect(writes).not.toContain(KEY);
    expect(localStorage.getItem(KEY)).toBe(before);
    // And the pagehide write does not happen in the viewer either.
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});
