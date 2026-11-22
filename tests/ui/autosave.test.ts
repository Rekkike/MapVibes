import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, openWorkFile, placeExampleMarkers, removeSaveDialog, stubSaveDialog, textFile } from './harness';
import { parseWorkState } from '../../src/workstate';
import { DATA_ISLAND_ID } from '../../src/singlefile';

// The stored work on the device (v2.8.0, scoped by the owner's ruling in
// v2.8.1): the automatic copy exists only for a work with an explicit file
// relationship -- at least one successful save to a work file, or opened
// from one; a never-saved work performs zero storage writes through any
// number of edits. A refused write is named once, in a dismissible notice
// at the top of the main area (never over an interactive surface, never
// persistent), and after a refusal the copy stops retrying until the work
// changes materially or is saved explicitly. The recovery offer for a
// valid copy is unchanged: restore or discard, the age stated, never
// silent. The exported viewer never reads or writes a stored copy.

const KEY = 'mapvibes.stored-work';

// The storage's own setItem, reached without an unbound method reference.
function originalSetItem(): (this: Storage, key: string, value: string) => void {
  return (Storage.prototype as unknown as { setItem: (this: Storage, key: string, value: string) => void }).setItem;
}

async function waitStoredChanged(before: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const raw = localStorage.getItem(KEY);
    if (raw !== null && (JSON.parse(raw) as { state: string }).state !== before) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('the stored copy was not updated');
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
  const o = JSON.parse(raw ?? '');
  expect(o.format).toBe('mapvibes-stored-work');
  expect(o.version).toBe(1);
  expect(typeof o.savedAt).toBe('string');
  expect(typeof o.state).toBe('string');
  return o;
}

function offerShown(): boolean {
  return !byId('recovery-offer').classList.contains('hidden');
}

function refusalShown(): boolean {
  return !byId('storage-refused').classList.contains('hidden');
}

// Saves the work through the stubbed save dialog; a successful save is the
// explicit file relationship that starts the stored copy.
async function saveViaDialog(): Promise<string> {
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text ?? '';
}

// Imports the example workbook and saves it, so the stored copy exists; the
// saved file's text is returned.
async function savedWork(): Promise<string> {
  await importExampleWorkbook();
  const text = await saveViaDialog();
  await waitStored();
  return text;
}

async function makeStoredCopy(savedAt: string): Promise<void> {
  await mountApp();
  await savedWork();
  // Rewrite the copy with the given moment, as if it had been stored then.
  localStorage.setItem(KEY, JSON.stringify({ ...storedCopy(), savedAt }));
}

describe('the stored work on the device (v2.8.1 scope)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  test('a never-saved work performs zero storage writes through any number of edits, on change and on pagehide', async () => {
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
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[1]?.click();
    window.dispatchEvent(new Event('pagehide'));
    await new Promise((r) => setTimeout(r, 1500));
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(calls).not.toContain(KEY);
    // The unsaved mark still shows: nothing was saved, silently or otherwise.
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    expect(refusalShown()).toBe(false);
  });

  test('the first successful save starts the copy, and the copy then follows changes', async () => {
    await importExampleWorkbook();
    await new Promise((r) => setTimeout(r, 1300));
    expect(localStorage.getItem(KEY)).toBeNull();
    const text = await saveViaDialog();
    await waitStored();
    const copy = storedCopy();
    // The copy holds the saved work itself.
    expect(parseWorkState(copy.state).rows.length).toBe(parseWorkState(text).rows.length);
    expect(copy.state).toContain('"format": "mapvibes-work-state"');
    // A further change is followed by the copy.
    const before = copy.state;
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await waitStoredChanged(before);
    const after = storedCopy();
    expect(after.state).not.toBe(before);
    expect(parseWorkState(after.state).rows.length).toBe(parseWorkState(text).rows.length);
    // And pagehide writes at once after another change. A deleted row stays
    // in the work state, marked removed (FR-3), so the copy is pinned by the
    // removed count, not by the row count.
    document.querySelectorAll<HTMLInputElement>('#row-table-body .row-select')[0].click();
    byId('delete-selected').click();
    window.dispatchEvent(new Event('pagehide'));
    const removedInCopy = parseWorkState(storedCopy().state).rows.filter((r) => r.removed).length;
    const removedInFile = parseWorkState(text).rows.filter((r) => r.removed).length;
    expect(removedInCopy).toBe(removedInFile + 1);
  });

  test('a work opened from a work file starts the copy at once', async () => {
    await importExampleWorkbook();
    const text = await saveViaDialog();
    // A fresh session over cleared storage; the work file is opened.
    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    await flush();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(parseWorkState(storedCopy().state).rows.length).toBe(parseWorkState(text).rows.length);
  });

  test('on open a stored copy is offered, labelled with what it is and how old it is, and never applied silently', async () => {
    await importExampleWorkbook();
    const rows = document.querySelectorAll('#row-table-body tr').length;
    await savedWork();
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
    // Nothing was applied silently: the list is still empty under the offer.
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
    // A restored copy has a file relationship: an edit is followed by the copy.
    const before = storedCopy().state;
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await waitStoredChanged(before);
    expect(storedCopy().state).not.toBe(before);
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
    await savedWork();
    expect(localStorage.getItem(KEY)).not.toBeNull();
    byId('work-clear-stored').click();
    await flush();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(document.querySelectorAll('#row-table-body tr').length).toBe(rows);
    expect(byId('work-status').textContent).toContain('was cleared');
  });

  test('a stored copy that cannot be read is not offered, but can be cleared', async () => {
    await importExampleWorkbook();
    await savedWork();
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
    const app = await mountApp({ singleFile: true });
    await importExampleWorkbook();
    await placeExampleMarkers([[0, 60, 100]]);
    const page = app.exportPage(new Date())!;
    // A stored copy exists on the device (the session saved the work).
    await savedWork();
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
    expect(refusalShown()).toBe(false);
    expect(writes).not.toContain(KEY);
    expect(localStorage.getItem(KEY)).toBe(before);
    // And the pagehide write does not happen in the viewer either.
    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem(KEY)).toBe(before);
  });
});

describe('the refusal, cured (v2.8.1)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    removeSaveDialog();
  });

  // Makes the stored write throw, as a full device storage does.
  function refuseWrites(): ReturnType<typeof vi.spyOn> {
    const orig = originalSetItem();
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === KEY) {
        throw new DOMException('QuotaExceeded', 'QuotaExceededError');
      }
      return orig.call(this, key, value);
    });
  }

  function writeAttempts(spy: ReturnType<typeof vi.spyOn>): number {
    return spy.mock.calls.filter((c) => c[0] === KEY).length;
  }

  test('a refused write is named once, in a dismissible notice at the top of the main area, never over a stage; retries stop until a material change; a later write clears it', async () => {
    await importExampleWorkbook();
    await saveViaDialog();
    await waitStored();
    const spy = refuseWrites();
    // A change: the debounced write is refused and named once.
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await new Promise((r) => setTimeout(r, 1400));
    for (let i = 0; i < 30; i++) {
      if (refusalShown()) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(refusalShown()).toBe(true);
    expect(byId('storage-refused-text').textContent).toContain('too large for the device storage');
    expect(byId('storage-refused-text').textContent).toContain('Saving the work as a file is the protection');
    expect(byId('storage-refused-dismiss').textContent).toBe('Dismiss');
    // The notice is a block at the top of the main area, not over any stage.
    expect(byId('storage-refused').parentElement!.id).toBe('app-main');
    expect(byId('storage-refused').closest('.stage')).toBeNull();
    expect(byId('app-main').firstElementChild!.id).toBe('recovery-offer');
    // It does not mask the work status.
    expect(byId('work-status').textContent ?? '').not.toContain('refused');
    // Dismissed: the notice goes and does not come back for this episode.
    const attemptsAfterFirstRefusal = writeAttempts(spy);
    byId('storage-refused-dismiss').click();
    await flush();
    expect(refusalShown()).toBe(false);
    // No retry while the work does not change: the attempts do not grow.
    await new Promise((r) => setTimeout(r, 1500));
    expect(writeAttempts(spy)).toBe(attemptsAfterFirstRefusal);
    // A material change retries once, is refused again, and is NOT named again.
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[1]?.click();
    await new Promise((r) => setTimeout(r, 1400));
    expect(writeAttempts(spy)).toBe(attemptsAfterFirstRefusal + 1);
    expect(refusalShown()).toBe(false);
    // A write that succeeds clears the episode: the notice stays away and the copy is written.
    spy.mockRestore();
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[2]?.click();
    await waitStored();
    expect(refusalShown()).toBe(false);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  test('an explicit save resets the refusal episode and retries the copy', async () => {
    await importExampleWorkbook();
    await saveViaDialog();
    await waitStored();
    const spy = refuseWrites();
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await new Promise((r) => setTimeout(r, 1400));
    expect(refusalShown()).toBe(true);
    // An explicit save (still refused for the copy) resets the episode: the
    // next change retries, and the save itself is unaffected.
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(parseWorkState(written.text ?? '').rows.length).toBeGreaterThan(0);
    spy.mockRestore();
    // The copy exists from the first save, so freshness is pinned by a
    // change of the copy's content, not by its mere presence.
    const beforeRetry = storedCopy().state;
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[1]?.click();
    await waitStoredChanged(beforeRetry);
    expect(refusalShown()).toBe(false);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  test('the refusal notice in Swedish', async () => {
    localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'sv', theme: 'system' }));
    await mountApp({ keepStorage: true });
    await importExampleWorkbook();
    await saveViaDialog();
    await waitStored();
    refuseWrites();
    document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')[0].click();
    await new Promise((r) => setTimeout(r, 1400));
    for (let i = 0; i < 30; i++) {
      if (refusalShown()) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(refusalShown()).toBe(true);
    expect(byId('storage-refused-text').textContent).toContain('för stort för enhetens lagring');
    expect(byId('storage-refused-text').textContent).toContain('Att spara arbetet som en fil är skyddet');
    expect(byId('storage-refused-dismiss').textContent).toBe('Stäng');
  });
});
