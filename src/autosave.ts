// The stored work on the device (v2.8.0): an automatic copy of the work kept
// in the browser's local storage, so that real work is not lost to a crash,
// a closed tab, or a reloaded page. It is not a saved work file: the explicit
// save and open of work files stay primary and untouched in primacy, every
// recovery is a clearly labelled offer on open and is never applied
// silently, and the exported viewer never reads or writes it. All state
// stays on the device (hard constraint 4); no network is involved at any
// point.
//
// The enumeration behind the design: before this pass the work lived only
// in memory -- a reload, a crash, or a cleared browser lost everything
// since the last explicit save, and "unsaved changes" meant only the mark
// that asked on unload. Local storage held just the preferences and the
// saved presets. Measured against the loaded Helsingborg demo (2.32 MiB of
// map): the work state serialises to 4.72 MiB (the rendered background's
// data URL alone is 4.69 MiB) against a localStorage write limit of about
// 5 MiB, so the demo fits a fresh profile with little room to spare and a
// refusal is a real case -- handled honestly below, never as data loss at
// the explicit save.
import { el, state } from './appstate';
import { formatCommentDate } from './comments';
import { format, strings } from './i18n';
import { parseWorkState, serialiseWorkState, type WorkState } from './workstate';
import { applyWorkState, captureWorkState, hasWork, renderWorkStatus, setWorkMessage } from './workfile';

const STORAGE_KEY = 'mapvibes.stored-work';
const STORED_WORK_FORMAT = 'mapvibes-stored-work';

// The stored copy: the work-state file's own JSON text (schema 14, read and
// validated exactly as an opened file), with the moment it was stored. No
// new field is needed in the work file's format, so it stays at 14.
interface StoredWork {
  format: typeof STORED_WORK_FORMAT;
  version: 1;
  savedAt: string;
  state: string;
}

// The stored copy after a change is debounced, so that a burst of edits
// writes once; the pagehide write covers the last change before a close.
const AUTOSAVE_DELAY_MS = 1000;
let timer: number | null = null;
// Each application start takes a new session token, so that a debounced
// write still pending from an earlier instance of the application (a
// remount in the tests) never fires into the new one.
const W = window as unknown as { __mapvibesAutosaveSession?: number };
export function beginAutosaveSession(): void {
  W.__mapvibesAutosaveSession = (W.__mapvibesAutosaveSession ?? 0) + 1;
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
}

function storage(): Storage | null {
  try {
    const s = globalThis.localStorage;
    const probe = 'mapvibes.probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readStoredWork(): StoredWork | null {
  const s = storage();
  if (!s) {
    return null;
  }
  try {
    const raw = s.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.format !== STORED_WORK_FORMAT || o.version !== 1 || typeof o.savedAt !== 'string' || typeof o.state !== 'string') {
      return null;
    }
    if (Number.isNaN(new Date(o.savedAt).getTime())) {
      return null;
    }
    return { format: STORED_WORK_FORMAT, version: 1, savedAt: o.savedAt, state: o.state };
  } catch {
    return null;
  }
}

// Whether the stored copy holds a work state this application can open. A
// damaged copy is not offered; the clear action remains available for it.
export function storedWorkReadable(stored: StoredWork): boolean {
  try {
    parseWorkState(stored.state);
    return true;
  } catch {
    return false;
  }
}

// Whether the last stored write was refused by the browser. The refusal has
// its own persistent notice beside the work status, so that it stays
// visible without masking the transient messages (an opened file, a saved
// file).
let refused = false;
export function storageRefused(): boolean {
  return refused;
}

// Writes the current work as the stored copy now. A refusal -- the storage
// full or blocked -- is reported honestly and stays visible; it is never
// treated as data loss at the explicit save, which writes a file and is
// unaffected.
export function writeStoredWork(): void {
  if (state.viewOnly || !hasWork()) {
    return;
  }
  const s = storage();
  const stored: StoredWork | null = s
    ? {
        format: STORED_WORK_FORMAT,
        version: 1,
        savedAt: new Date().toISOString(),
        state: serialiseWorkState(captureWorkState(), new Date()),
      }
    : null;
  let ok = false;
  if (s && stored) {
    try {
      s.setItem(STORAGE_KEY, JSON.stringify(stored));
      ok = true;
    } catch {
      ok = false;
    }
  }
  refused = !ok;
  renderWorkStatus();
}

// The stored copy after a change, debounced (markDirty calls this).
export function scheduleAutosave(): void {
  if (state.viewOnly) {
    return;
  }
  if (timer !== null) {
    window.clearTimeout(timer);
  }
  const session = W.__mapvibesAutosaveSession ?? 0;
  timer = window.setTimeout(() => {
    timer = null;
    if ((W.__mapvibesAutosaveSession ?? 0) !== session) {
      return;
    }
    writeStoredWork();
  }, AUTOSAVE_DELAY_MS);
}

function hideOffer(): void {
  el('recovery-offer').classList.add('hidden');
  el('work-clear-stored').classList.add('hidden');
}

// Clears the stored work on the device, as an explicit action; the current
// work on screen is untouched.
export function clearStoredWork(): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      // Nothing was stored, or the removal was refused: nothing to clear.
    }
  }
  hideOffer();
  setWorkMessage('cleared');
  renderWorkStatus();
}

// How old the stored copy is, in the interface language.
export function ageText(savedAt: string): string {
  const t = strings(state.prefs.lang);
  const minutes = Math.floor((Date.now() - new Date(savedAt).getTime()) / 60000);
  if (minutes < 1) {
    return t.recoveryAgeNow;
  }
  if (minutes < 60) {
    return format(t.recoveryAgeMin, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return format(t.recoveryAgeHour, { n: hours });
  }
  return format(t.recoveryAgeDay, { n: Math.floor(hours / 24) });
}

// On open, a stored copy is offered: clearly labelled with what it is and
// how old it is, never applied silently, never conflated with a saved work
// file. A copy the application cannot read is not offered.
export function offerStoredWork(): void {
  if (state.viewOnly) {
    return;
  }
  const stored = readStoredWork();
  if (!stored) {
    el('work-clear-stored').classList.add('hidden');
    return;
  }
  el('work-clear-stored').classList.remove('hidden');
  if (!storedWorkReadable(stored)) {
    return;
  }
  const t = strings(state.prefs.lang);
  el('recovery-text').textContent = format(t.recoveryOffer, { date: formatCommentDate(stored.savedAt), age: ageText(stored.savedAt) });
  el('recovery-restore').textContent = t.recoveryRestore;
  el('recovery-discard').textContent = t.recoveryDiscard;
  el('recovery-offer').classList.remove('hidden');
}

// Restores the offered stored copy, as an explicit action: the same
// validation and application as an opened work file, with the
// unsaved-changes confirmation where there is work on screen.
export async function restoreStoredWork(): Promise<boolean> {
  const stored = readStoredWork();
  if (!stored || state.viewOnly) {
    return false;
  }
  let ws: WorkState;
  try {
    ws = parseWorkState(stored.state);
  } catch {
    return false;
  }
  if (state.dirty && !window.confirm(strings(state.prefs.lang).workConfirmReplace)) {
    return false;
  }
  const ok = await applyWorkState(ws);
  if (!ok) {
    return false;
  }
  setWorkMessage('restored');
  hideOffer();
  renderWorkStatus();
  return true;
}
