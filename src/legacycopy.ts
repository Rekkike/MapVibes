// The legacy stored copy of the withdrawn feature (v2.8.1). v2.8.0 kept an
// automatic copy of the work in the browser's local storage under
// mapvibes.stored-work; that feature is withdrawn before release: the
// application writes no work state to device storage at any moment, and the
// work file -- written only on explicit save -- is the only persistence
// (hard constraint 4 in its original letter). What remains here is
// read-only kindness to the users who ran v2.8.0 or the withdrawn branch,
// because real work may live in the legacy key: on open, if the key is
// present, ONE final offer is made, clearly labelled as the copy of a
// withdrawn feature -- restore it into the work (applied exactly as v2.8.0
// applied it) or discard it. Either choice removes the key, and the
// application never reads or writes it again. A copy that cannot be read is
// not offered; it is cleared, with a notice saying so. Never a silent
// deletion: the key is removed only through the user's explicit choice, or
// as a damaged copy named by a notice. No key, no offer, no banner. The
// exported viewer never reads the key either.
import { el, state } from './appstate';
import { formatCommentDate } from './comments';
import { format, strings } from './i18n';
import { parseWorkState, type WorkState } from './workstate';
import { applyWorkState, renderWorkStatus, setWorkMessage } from './workfile';

const LEGACY_KEY = 'mapvibes.stored-work';
const LEGACY_FORMAT = 'mapvibes-stored-work';

// The legacy copy's wrapper, exactly as v2.8.0 wrote it: the work-state
// file's own JSON text (schema 14) with the moment it was stored.
interface LegacyStoredWork {
  format: typeof LEGACY_FORMAT;
  version: 1;
  savedAt: string;
  state: string;
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

// Reads the legacy key. Read-only: this module never writes work state to
// device storage, at any moment.
function readLegacyStoredWork(): LegacyStoredWork | null {
  const s = storage();
  if (!s) {
    return null;
  }
  try {
    const raw = s.getItem(LEGACY_KEY);
    if (!raw) {
      return null;
    }
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (o.format !== LEGACY_FORMAT || o.version !== 1 || typeof o.savedAt !== 'string' || typeof o.state !== 'string') {
      return null;
    }
    if (Number.isNaN(new Date(o.savedAt).getTime())) {
      return null;
    }
    return { format: LEGACY_FORMAT, version: 1, savedAt: o.savedAt, state: o.state };
  } catch {
    return null;
  }
}

// Whether the legacy copy holds a work state this application can open.
function legacyCopyReadable(stored: LegacyStoredWork): boolean {
  try {
    parseWorkState(stored.state);
    return true;
  } catch {
    return false;
  }
}

// Removes the legacy key. The only write this module ever makes, and only
// ever a removal, through the user's explicit choice or as a damaged copy
// named by a notice.
function removeLegacyKey(): void {
  const s = storage();
  if (s) {
    try {
      s.removeItem(LEGACY_KEY);
    } catch {
      // Nothing was stored, or the removal was refused: nothing to remove.
    }
  }
}

// How old the legacy copy is, in the interface language.
function legacyAgeText(savedAt: string): string {
  const t = strings(state.prefs.lang);
  const minutes = Math.floor((Date.now() - new Date(savedAt).getTime()) / 60000);
  if (minutes < 1) {
    return t.legacyAgeNow;
  }
  if (minutes < 60) {
    return format(t.legacyAgeMin, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return format(t.legacyAgeHour, { n: hours });
  }
  return format(t.legacyAgeDay, { n: Math.floor(hours / 24) });
}

function hideOffer(): void {
  el('legacy-offer').classList.add('hidden');
}

// On open, in the application only, ONE final offer for a legacy key: the
// copy of the withdrawn feature, labelled with what it is, when it was
// stored, and how old it is -- restore it into the work, or discard it.
// Either choice removes the key; the application never reads it again. A
// damaged copy is not offered: it is cleared, with a notice saying so. No
// key, no offer, no banner.
export function offerLegacyCopy(): void {
  if (state.viewOnly) {
    return;
  }
  const stored = readLegacyStoredWork();
  if (!stored) {
    // No key, or a wrapper this application cannot make sense of at all: a
    // wrapper that fails validation is a damaged copy -- cleared with a
    // notice, never offered, never silently deleted.
    const s = storage();
    let present = false;
    try {
      present = s !== null && s.getItem(LEGACY_KEY) !== null;
    } catch {
      present = false;
    }
    if (present) {
      removeLegacyKey();
      showDamagedNotice();
    }
    return;
  }
  if (!legacyCopyReadable(stored)) {
    removeLegacyKey();
    showDamagedNotice();
    return;
  }
  const t = strings(state.prefs.lang);
  el('legacy-text').textContent = format(t.legacyOffer, { date: formatCommentDate(stored.savedAt), age: legacyAgeText(stored.savedAt) });
  el('legacy-restore').textContent = t.legacyRestore;
  el('legacy-discard').textContent = t.legacyDiscard;
  el('legacy-restore').classList.remove('hidden');
  el('legacy-offer').classList.remove('hidden');
}

// A legacy copy that cannot be read is cleared with a notice: the offer's
// banner carries the notice, the restore action is not offered, and the
// remaining action only dismisses.
function showDamagedNotice(): void {
  const t = strings(state.prefs.lang);
  el('legacy-text').textContent = t.legacyDamaged;
  el('legacy-restore').classList.add('hidden');
  el('legacy-discard').textContent = t.legacyOk;
  el('legacy-offer').classList.remove('hidden');
}

// Restores the offered legacy copy into the work, as v2.8.0 did: the same
// validation and application as an opened work file, with the
// unsaved-changes confirmation where there is work on screen. The key is
// removed with the choice; the application never reads it again.
export async function restoreLegacyCopy(): Promise<boolean> {
  const stored = readLegacyStoredWork();
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
  removeLegacyKey();
  hideOffer();
  setWorkMessage('legacy-restored');
  renderWorkStatus();
  return true;
}

// Discards the offered legacy copy: the explicit choice. The key is removed
// and never read again. (On a damaged copy the key was already cleared with
// its notice; this only dismisses the notice.)
export function discardLegacyCopy(): void {
  removeLegacyKey();
  hideOffer();
  setWorkMessage('legacy-discarded');
  renderWorkStatus();
}
