// The open-map fetch dialog (FR-31): the place search, the bounds, and the
// labelled request. The network operation itself is in openmap.ts.
import { strings } from './i18n';
import type { OsmBounds } from './osm';
import {
  fetchableBounds,
  FetchError,
  fetchMapData,
  isOnline,
  parseBounds,
  searchPlace,
  type BoundsField,
  type FetchErrorCode,
  type PlaceResult,
} from './openmap';
import { hideDialog, showDialog } from './main';
import { el, state } from './appstate';
import { showMapError, useOsmText } from './mapstage';

// Open-map fetch, FR-31: the application's only network operation, made
// only from this panel, by explicit button presses. While a request runs the
// panel is busy and the request can be cancelled; every failure is reported
// in plain language with the service's own status.
let fetchSelected: PlaceResult | null = null;
let fetchResults: PlaceResult[] = [];
export let fetchAbort: AbortController | null = null;
let fetchMessage: { text: string; kind: 'info' | 'error' } | null = null;
let fetchInvalidField: BoundsField | null = null;

const EDGES: BoundsField[] = ['south', 'west', 'north', 'east'];

function edgeName(field: BoundsField): string {
  const t = strings(state.prefs.lang);
  return { south: t.fetchSouth, west: t.fetchWest, north: t.fetchNorth, east: t.fetchEast }[field];
}

function formatBounds(b: OsmBounds): string {
  const t = strings(state.prefs.lang);
  const f = (v: number) => v.toFixed(5);
  return `${t.fetchSouth} ${f(b.minLat)}, ${t.fetchWest} ${f(b.minLon)}, ${t.fetchNorth} ${f(b.maxLat)}, ${t.fetchEast} ${f(b.maxLon)}`;
}

// The service's answer, named in the message rather than swallowed.
function serviceStatus(e: FetchError): string {
  const t = strings(state.prefs.lang);
  if (e.detail.status !== undefined) {
    return ` ${t.fetchServiceSaid} HTTP ${e.detail.status}${httpReason(e.detail.status)}.`;
  }
  if (e.detail.message) {
    return ` ${t.fetchServiceSaid} "${e.detail.message}".`;
  }
  return '';
}

function httpReason(status: number): string {
  const reasons: Record<number, string> = {
    400: 'Bad Request',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return reasons[status] ? ` (${reasons[status]})` : '';
}

function fetchErrorText(e: FetchError, stage: 'search' | 'data'): string {
  const t = strings(state.prefs.lang);
  const field = e.detail.field ? edgeName(e.detail.field) : '';
  const texts: Record<FetchErrorCode, string> = {
    offline: t.fetchErrorOffline,
    cancelled: t.fetchCancelled,
    network: t.fetchErrorNetwork,
    timeout: t.fetchErrorTimeout,
    refused: t.fetchErrorRefused,
    service: t.fetchErrorService,
    'no-results': stage === 'search' ? t.fetchErrorNoResults : t.fetchErrorNoFeatures,
    'too-much-data': t.fetchErrorTooMuchData,
    'not-a-number': t.fetchErrorNotANumber.replace('{field}', field),
    'out-of-range': t.fetchErrorOutOfRange
      .replace('{field}', field)
      .replaceAll('{limit}', e.detail.field === 'south' || e.detail.field === 'north' ? '90' : '180'),
    'south-north': t.fetchErrorSouthNorth,
    'west-east': t.fetchErrorWestEast,
  };
  return texts[e.code] + serviceStatus(e);
}

function fetchMode(): 'place' | 'bbox' {
  return el<HTMLInputElement>('fetch-mode-bbox').checked ? 'bbox' : 'place';
}

function edgeInput(field: BoundsField): HTMLInputElement {
  return el<HTMLInputElement>(`fetch-${field}`);
}

function renderFetchState(): void {
  const t = strings(state.prefs.lang);
  const online = isOnline();
  const busy = fetchAbort !== null;
  const open = el<HTMLButtonElement>('fetch-open');
  open.disabled = !online;
  open.title = online ? '' : t.fetchOffline;
  el('fetch-offline').classList.toggle('hidden', online);
  const panel = el('fetch-panel');
  panel.setAttribute('aria-busy', busy ? 'true' : 'false');
  panel.dataset.busy = busy ? 'true' : 'false';
  const mode = fetchMode();
  el('fetch-place-row').classList.toggle('hidden', mode !== 'place');
  el('fetch-results').classList.toggle('hidden', mode !== 'place');
  el('fetch-bbox-row').classList.toggle('hidden', mode !== 'bbox');
  for (const id of ['fetch-mode-place', 'fetch-mode-bbox', 'fetch-place']) {
    el<HTMLInputElement>(id).disabled = busy;
  }
  for (const field of EDGES) {
    const input = edgeInput(field);
    input.disabled = busy;
    input.setAttribute('aria-invalid', fetchInvalidField === field ? 'true' : 'false');
  }
  el<HTMLButtonElement>('fetch-search').disabled = !online || busy;
  const ready = mode === 'place' ? fetchSelected !== null : EDGES.every((f) => edgeInput(f).value.trim() !== '');
  el<HTMLButtonElement>('fetch-go').disabled = !online || busy || !ready;
  el('fetch-cancel').classList.toggle('hidden', !busy);
  const list = el('fetch-results');
  list.innerHTML = '';
  for (const place of fetchResults) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fetch-result';
    button.textContent = place.name;
    button.disabled = busy;
    button.setAttribute('aria-pressed', fetchSelected === place ? 'true' : 'false');
    button.addEventListener('click', () => {
      fetchSelected = place;
      fetchMessage = null;
      renderFetchState();
    });
    li.appendChild(button);
    list.appendChild(li);
  }
  const status = el('fetch-status');
  status.textContent = fetchMessage?.text ?? '';
  status.classList.toggle('error', fetchMessage?.kind === 'error');
  status.classList.toggle('busy', busy);
}

function startFetchRequest(text: string): AbortSignal {
  fetchAbort = new AbortController();
  fetchMessage = { text, kind: 'info' };
  renderFetchState();
  return fetchAbort.signal;
}

function endFetchRequest(): void {
  fetchAbort = null;
}

async function searchFetchPlace(): Promise<void> {
  const t = strings(state.prefs.lang);
  fetchSelected = null;
  fetchResults = [];
  const signal = startFetchRequest(t.fetchSearching);
  try {
    fetchResults = await searchPlace(el<HTMLInputElement>('fetch-place').value, signal);
    fetchMessage = { text: t.fetchChoose, kind: 'info' };
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('service');
    fetchMessage = { text: fetchErrorText(err, 'search'), kind: err.code === 'cancelled' ? 'info' : 'error' };
  }
  endFetchRequest();
  renderFetchState();
}

async function fetchOpenMap(): Promise<void> {
  const t = strings(state.prefs.lang);
  let requested: OsmBounds;
  fetchInvalidField = null;
  try {
    requested =
      fetchMode() === 'bbox'
        ? parseBounds({
            south: edgeInput('south').value,
            west: edgeInput('west').value,
            north: edgeInput('north').value,
            east: edgeInput('east').value,
          })
        : fetchSelected!.bounds;
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('not-a-number');
    fetchInvalidField = err.detail.field ?? null;
    fetchMessage = { text: fetchErrorText(err, 'data'), kind: 'error' };
    renderFetchState();
    if (fetchInvalidField) {
      edgeInput(fetchInvalidField).focus();
    }
    return;
  }
  // A larger area is reduced about its centre; the reduction is stated.
  const bounds = fetchableBounds(requested);
  const reduced = bounds !== requested;
  const reduction = reduced ? `${t.fetchReduced} ${formatBounds(bounds)}.` : '';
  const signal = startFetchRequest(reduced ? `${reduction} ${t.fetchFetching}` : t.fetchFetching);
  showMapError(null);
  try {
    const text = await fetchMapData(bounds, signal);
    const outcome = await useOsmText(text, { bounds, attribution: t.fetchAttribution });
    if (outcome === 'ok') {
      fetchMessage = { text: reduced ? `${reduction} ${t.fetchDone}` : t.fetchDone, kind: 'info' };
    } else if (outcome === 'empty') {
      fetchMessage = { text: fetchErrorText(new FetchError('no-results'), 'data'), kind: 'error' };
    } else {
      fetchMessage = { text: fetchErrorText(new FetchError('service', { message: t.fetchUnreadableData }), 'data'), kind: 'error' };
    }
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('service');
    fetchMessage = { text: fetchErrorText(err, 'data'), kind: err.code === 'cancelled' ? 'info' : 'error' };
  }
  endFetchRequest();
  renderFetchState();
}

export function initialiseFetch(): void {
  el('fetch-open').addEventListener('click', () => {
    showDialog('fetch-panel');
    renderFetchState();
    (fetchMode() === 'place' ? el<HTMLInputElement>('fetch-place') : edgeInput('south')).focus();
  });
  el('fetch-close').addEventListener('click', () => {
    fetchAbort?.abort();
    hideDialog('fetch-panel');
  });
  el('fetch-cancel').addEventListener('click', () => fetchAbort?.abort());
  for (const id of ['fetch-mode-place', 'fetch-mode-bbox']) {
    el(id).addEventListener('change', renderFetchState);
  }
  for (const field of EDGES) {
    edgeInput(field).addEventListener('input', () => {
      if (fetchInvalidField === field) {
        fetchInvalidField = null;
      }
      renderFetchState();
    });
    edgeInput(field).addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !el<HTMLButtonElement>('fetch-go').disabled) {
        void fetchOpenMap();
      }
    });
  }
  el('fetch-search').addEventListener('click', () => void searchFetchPlace());
  el('fetch-place').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !el<HTMLButtonElement>('fetch-search').disabled) {
      void searchFetchPlace();
    }
  });
  el('fetch-go').addEventListener('click', () => void fetchOpenMap());
  window.addEventListener('online', renderFetchState);
  window.addEventListener('offline', renderFetchState);
  renderFetchState();
}
