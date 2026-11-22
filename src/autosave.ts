// The stored work on the device: an automatic copy of the work kept in the
// browser's local storage, so that real work is not lost to a crash, a
// closed tab, or a reloaded page. It is not a saved work file: the explicit
// save and open of work files stay primary and untouched in primacy, every
// recovery is a clearly labelled offer on open and is never applied
// silently, and the exported viewer never reads or writes it. All state
// stays on the device (hard constraint 4); no network is involved at any
// point.
//
// The scope, owner-ruled from use (v2.8.1): nothing is written to device
// storage without the user's initiative. The automatic copy exists only
// for a work with an explicit file relationship -- at least one successful
// save to a work file, or opened from one. From that moment the debounced
// copy follows changes. A never-saved work performs zero storage writes
// through any number of edits; its crash-loss risk is acknowledged in the
// changelog, the work file being the user's initiative and this rule's
// reason.
//
// The refusal, cured (v2.8.1, the defect from use: a persistent pill over
// the map while the owner worked in a work larger than the device quota):
// a refused write is named once, in a dismissible notice placed at the top
// of the main area -- never over an interactive surface, never persistent
// -- and after a refusal the copy stops retrying until the work changes
// materially or is saved explicitly. A quota-oversize work is named for
// what it is, with the explicit save pointed to as the protection. The
// refusal is never treated as data loss at the explicit save, which writes
// a file and is unaffected.
import { el, state } from './appstate';
import { formatCommentDate } from './comments';
import { format, strings } from './i18n';
import { parseWorkState, serialiseWorkState, type WorkState } from './workstate';
import { applyWorkState, captureWorkState, changeCount, hasWork, renderWorkStatus, setWorkMessage } from './workfile';

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

// The current work's explicit file relationship (v2.8.1): set when the
// work is saved to a file successfully, opened from one, or restored from
// the stored copy; cleared when a new work replaces it (an import, an empty
// list, a demo). Only a work with the relationship is ever written to
// device storage.
let fileRelationship = false;

// A successful save to a work file, an open from one, or a restore: the
// relationship begins and the copy starts (or resumes) now.
export function beginFileRelationship(): void {
  fileRelationship = true;
  resetRefusal();
  writeStoredWork();
}

// A new work that never had a file relationship replaces the current one.
export function resetFileRelationship(): void {
  fileRelationship = false;
}

// The refusal episode: the change count at the last refusal (retries stop
// until the work changes materially or is saved explicitly), and whether a
// refusal has already been named (a refused write is named once, in a
// dismissible notice, never persistent; the naming resets only when a
// stored write succeeds, or when the stored work is cleared).
let refusedAtChange = -1;
let refusalNamed = false;

function hideRefusal(): void {
  el('storage-refused').classList.add('hidden');
}

function resetRefusal(): void {
  refusedAtChange = -1;
}

// Names a refused write once, in the dismissible notice at the top of the
// main area (never over a stage). A quota-oversize work is named for what
// it is, with the explicit save as the protection.
function nameRefusalOnce(): void {
  if (refusalNamed) {
    return;
  }
  refusalNamed = true;
  const t = strings(state.prefs.lang);
  el('storage-refused-text').textContent = t.storageRefused;
  el('storage-refused-dismiss').textContent = t.storageRefusedDismiss;
  el('storage-refused').classList.remove('hidden');
}

// The notice's dismiss action: the refusal stays named (it was named once),
// and the notice does not come back for this episode.
export function dismissRefusal(): void {
  hideRefusal();
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

// Writes the current work as the stored copy now. Only a work with an
// explicit file relationship is ever written (v2.8.1). After a refusal the
// write stops retrying until the work changes materially (the change count
// moved) or is saved explicitly (which resets the episode). A refusal is
// named once, in the dismissible notice; it is never treated as data loss
// at the explicit save, which writes a file and is unaffected.
export function writeStoredWork(): void {
  if (state.viewOnly || !hasWork() || !fileRelationship) {
    return;
  }
  if (refusedAtChange >= 0 && changeCount === refusedAtChange) {
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
  if (ok) {
    refusedAtChange = -1;
    refusalNamed = false;
    hideRefusal();
  } else {
    refusedAtChange = changeCount;
    nameRefusalOnce();
  }
}

// The stored copy after a change, debounced (markDirty calls this). A work
// without a file relationship schedules nothing: zero storage writes.
export function scheduleAutosave(): void {
  if (state.viewOnly || !fileRelationship) {
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
// work on screen is untouched, and its file relationship is unaffected.
export function clearStoredWork(): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(STORAGE_KEY);
    } catch {
      // Nothing was stored, or the removal was refused: nothing to clear.
    }
  }
  resetRefusal();
  refusalNamed = false;
  hideRefusal();
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
// file. A copy the application cannot read is not offered. (Unchanged in
// v2.8.1: the recovery banner's behaviour for a valid copy.)
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
// unsaved-changes confirmation where there is work on screen. A restored
// copy has a file relationship: the copy follows the work from here.
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
  beginFileRelationship();
  renderWorkStatus();
  return true;
}
