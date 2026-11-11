import { afterEach, describe, expect, test, vi } from 'vitest';
import { byId, editCell, flush, mountApp, openWorkFile, placeExampleMarkers, removeSaveDialog, stubSaveDialog, textFile } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The phone editor's phase two, unit 6 (FR-13 as noted in v1.15.0): the
// honest save status on the download path -- "Download started", the
// unsaved mark kept until the next open or an explicit confirmation -- the
// save-dialog path unchanged (the dialog confirms the write), and the share
// action gated on the browser's support for sharing files, fully local
// through the OS share sheet, nothing claimed otherwise. The phone tests
// delete showSaveFilePicker first: the emulated phone still exposes the
// desktop save picker, which real phone browsers lack.

type ShareFn = (data: ShareData) => Promise<void>;

function installShare(share: ShareFn | undefined, canShare: ((data: ShareData) => boolean) | undefined): void {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'canShare', { value: canShare, configurable: true });
}

afterEach(() => {
  delete (navigator as { share?: unknown }).share;
  delete (navigator as { canShare?: unknown }).canShare;
  vi.restoreAllMocks();
});

// Stands in for the browser's download machinery and records the blob handed
// to it.
function stubDownload(): Blob[] {
  const blobs: Blob[] = [];
  URL.createObjectURL = (b: Blob) => {
    blobs.push(b);
    return 'blob:local-test';
  };
  URL.revokeObjectURL = () => undefined;
  const original = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    /* recorded through the blob; navigation is not jsdom's */
  };
  return blobs;
}

async function mountWithWork(): Promise<void> {
  await mountApp();
  await placeExampleMarkers([[0, 60, 100]]);
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

function status(): string {
  return byId('work-status').textContent ?? '';
}

async function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('the save status on the download path (FR-13 as noted in v1.15.0)', () => {
  test('without a save dialog (deleted first, as on a phone): the download says so and keeps the unsaved mark until an explicit confirmation', async () => {
    await mountWithWork();
    removeSaveDialog();
    const blobs = stubDownload();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    byId('work-save').click();
    await flush();
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe('application/json');
    expect(status()).toBe('Download started. The unsaved mark stays until the file is opened or the save is confirmed.');
    expect(dirty()).toBe(true);
    // The explicit confirmation clears the mark.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    byId('work-save').click();
    await flush();
    expect(blobs).toHaveLength(2);
    expect(status()).toBe('Work saved.');
    expect(dirty()).toBe(false);
  });

  test('the next open clears the mark after a download-save', async () => {
    await mountWithWork();
    removeSaveDialog();
    const blobs = stubDownload();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    byId('work-save').click();
    await flush();
    expect(dirty()).toBe(true);
    const text = await blobText(blobs[0]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    openWorkFile(textFile('mapvibes-work-state.json', text));
    await flush();
    expect(status()).toBe('Work opened.');
    expect(dirty()).toBe(false);
  });

  test('the save-dialog path is unchanged: the dialog confirms the write, no download, no confirmation', async () => {
    await mountWithWork();
    const written = stubSaveDialog();
    const confirm = vi.spyOn(window, 'confirm');
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(written.closed).toBe(true);
    expect(status()).toBe('Work saved.');
    expect(dirty()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  test('on a phone (narrow), the same download path runs from the Menu overlay', async () => {
    await mountApp({
      beforeMain: () => {
        const plain = window.matchMedia;
        window.matchMedia = ((q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q))) as typeof window.matchMedia;
      },
    });
    await placeExampleMarkers([[0, 60, 100]]);
    removeSaveDialog();
    const blobs = stubDownload();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    // The work controls are in the Menu overlay in the narrow layout.
    expect(byId('work-save').closest('#app-menu')).not.toBeNull();
    byId('work-save').click();
    await flush();
    expect(blobs).toHaveLength(1);
    expect(status()).toBe('Download started. The unsaved mark stays until the file is opened or the save is confirmed.');
    expect(dirty()).toBe(true);
  });
});

describe('the share action (FR-13 as noted in v1.15.0)', () => {
  test('without navigator.share the action is hidden, and nothing is claimed', async () => {
    await mountWithWork();
    expect(byId('work-share').classList.contains('hidden')).toBe(true);
    expect(byId<HTMLButtonElement>('work-share').disabled).toBe(true);
    expect(status()).toBe('');
  });

  test('when the browser cannot share files, the action is disabled with a clear message', async () => {
    await mountWithWork();
    installShare(async () => undefined, () => false);
    renderAgain();
    expect(byId('work-share').classList.contains('hidden')).toBe(false);
    expect(byId<HTMLButtonElement>('work-share').disabled).toBe(true);
    expect(byId('work-share').title).toBe('This browser cannot share files, so the share action is not offered.');
    expect(byId('work-share').getAttribute('aria-label')).toContain('cannot share files');
  });

  test('where files can be shared, the work file goes to the OS share sheet, fully local; the unsaved mark is untouched', async () => {
    await mountWithWork();
    const calls: ShareData[] = [];
    installShare(async (data) => {
      calls.push(data);
    }, () => true);
    renderAgain();
    expect(byId<HTMLButtonElement>('work-share').disabled).toBe(false);
    byId('work-share').click();
    await flush();
    expect(calls).toHaveLength(1);
    const files = calls[0].files ?? [];
    expect(files).toHaveLength(1);
    expect(files[0].name).toBe('mapvibes-work-state.json');
    expect(files[0].type).toBe('application/json');
    const text = await blobText(files[0]);
    const parsed = JSON.parse(text);
    expect(parsed.schemaVersion).toBe(12);
    expect(status()).toBe('The work file was handed to the operating system\u2019s share sheet.');
    // Sharing is not saving.
    expect(dirty()).toBe(true);
  });

  test('closing the share sheet claims nothing; a failed share says so', async () => {
    await mountWithWork();
    installShare(async () => {
      throw new DOMException('Share canceled', 'AbortError');
    }, () => true);
    renderAgain();
    byId('work-share').click();
    await flush();
    expect(status()).toBe('');
    installShare(async () => {
      throw new DOMException('nope', 'NotAllowedError');
    }, () => true);
    renderAgain();
    byId('work-share').click();
    await flush();
    expect(status()).toBe('The work file could not be shared.');
    expect(dirty()).toBe(true);
  });
});

// An edit re-renders the work status, so that the share gate is evaluated
// against the installed navigator functions.
function renderAgain(): void {
  editCell(0, 'Note', 'share gate');
}
