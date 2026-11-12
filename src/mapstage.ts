// The map stage: the view, the markers and their placement, the
// background (image, PDF, and open map data), and the stage's controls.
import type { RowData } from './dataset';
import { displayName } from './roles';
import { strings } from './i18n';
import { MapView } from './mapview';
import { isPdfFile, openPdf, type PdfDocument } from './pdfbackground';
import { isOsmFile, MAX_OSM_BYTES, OsmError, parseOsm, planRender, type MercatorProjection, type OsmBounds } from './osm';
import { renderPlanToDataUrl } from './osmrender';
import { MarkerLayer } from './markerlayer';
import { drawSymbol, isSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import { placedMarkers, placeMarker, pruneMarkers, removeMarker, type PlacedMarker } from './markers';
import { BUTTON_ZOOM_FACTOR, screenToImage, type Point } from './viewport';
import { AnnotationLayer, DrawingTools } from './annotationlayer';
import {
  applyHighlight,
  closeNarrowOverlay,
  effectiveSymbols,
  hideDialog,
  MAX_IMPORT_BYTES,
  narrowApplication,
  numbered,
  numberLabel,
  renderGlance,
  renderLegends,
  renderPresentation,
  setHover,
  showDialog,
  symbolLabel,
  symbolOf,
  symbolSource,
  syncPresentationBackground,
} from './main';
import { el, fill, ROW_DRAG_TYPE, rowById, rowId, state } from './appstate';
import { markDirty, readText, renderWorkStatus } from './workfile';
import { renderComparison } from './exportdialog';
import { openDetails, renderDetailsPanel } from './detailspanel';
import {
  createAnnotation,
  drawingTools,
  renderAnnotationInspector,
  renderAnnotations,
  renderAnnotationToolbar,
  replaceAnnotation,
  selectAnnotation,
  setAnnotationDraft,
  setDrawingTools,
  setMapAnnotations,
  wireAnnotationToolbar,
} from './annotationpanel';

export let mapView: MapView | null = null;

type MapError =
  | 'unsupported'
  | 'unreadable'
  | 'needs-background'
  | 'pdf-unreadable'
  | 'pdf-render'
  | 'pdf-too-large'
  | 'osm-malformed'
  | 'osm-empty'
  | 'osm-too-large'
  | 'osm-render';

export function showMapError(kind: MapError | null): void {
  const t = strings(state.prefs.lang);
  const messages: Record<MapError, string> = {
    unsupported: t.mapUnsupported,
    unreadable: t.mapUnreadable,
    'needs-background': t.markerNeedsBackground,
    'pdf-unreadable': t.pdfUnreadable,
    'pdf-render': t.pdfRenderFailed,
    'pdf-too-large': t.pdfTooLarge,
    'osm-malformed': t.osmMalformed,
    'osm-empty': t.osmEmpty,
    'osm-too-large': t.osmTooLarge,
    'osm-render': t.osmRenderFailed,
  };
  const errorEl = el('map-error');
  errorEl.classList.toggle('hidden', kind === null);
  errorEl.textContent = kind ? messages[kind] : '';
}

let markerLayer: MarkerLayer | null = null;

// The display name of an item (FR-1): name/title, else identifier, else the
// item's number.
export function itemLabel(row: RowData, number: string): string {
  return displayName(row.values, state.roles, `${strings(state.prefs.lang).numberColumn} ${number}`);
}

export function markerLabel(marker: PlacedMarker): string {
  return `${strings(state.prefs.lang).markerLabel} ${marker.label}: ${itemLabel(marker.row, marker.label)}`;
}

function selectMarker(id: string | null): void {
  state.selectedMarker = id;
  renderMapItems();
  // Selecting a marker opens its details; the panel follows the selection.
  if (id !== null) {
    openDetails(id);
  }
}

function moveMarker(id: string, position: Point): void {
  const row = rowById(id);
  if (!row) {
    return;
  }
  placeMarker(state.positions, row, position);
  markDirty();
  renderMapItems();
}

function deleteMarker(id: string): void {
  const row = rowById(id);
  if (row && removeMarker(state.positions, row)) {
    markDirty();
  }
  if (state.selectedMarker === id) {
    state.selectedMarker = null;
  }
  renderMapItems();
}

// Tap-to-place (FR-73): the item waiting for a tap on the stage, if any.
let placingId: string | null = null;
let placingDown: { id: number; x: number; y: number } | null = null;
// The distance a tap may move and still be a tap, in pixels.
const TAP_SLOP = 8;

function startPlacing(id: string): void {
  placingId = id;
  closeNarrowOverlay();
  renderPlacing();
}

export function stopPlacing(): void {
  if (placingId === null) {
    return;
  }
  placingId = null;
  placingDown = null;
  renderPlacing();
}

export function renderPlacing(): void {
  const banner = el('place-banner');
  const row = placingId ? rowById(placingId) : undefined;
  if (!row || state.positions.has(row)) {
    placingId = null;
    banner.classList.add('hidden');
    delete el('map-stage').dataset.placing;
    return;
  }
  const t = strings(state.prefs.lang);
  el('place-banner-text').textContent = fill(t.placingHint, { name: itemLabel(row, numberLabel(row)) });
  banner.classList.remove('hidden');
  el('map-stage').dataset.placing = 'true';
}

function dropRowOnMap(id: string, clientX: number, clientY: number): void {
  const row = rowById(id);
  if (!row || !mapView) {
    return;
  }
  if (!mapView.background) {
    showMapError('needs-background');
    return;
  }
  showMapError(null);
  const position = screenToImage(mapView.viewport, mapView.stagePoint(clientX, clientY));
  placeMarker(state.positions, row, position);
  state.selectedMarker = id;
  markDirty();
  renderMapItems();
}

function renderPlacementList(): void {
  const t = strings(state.prefs.lang);
  const list = el('placement-list');
  list.innerHTML = '';
  numbered().forEach(({ row, label: number }) => {
    const id = rowId(row);
    const placed = state.positions.has(row);
    const li = document.createElement('li');
    li.className = 'placement-item';
    li.draggable = true;
    li.dataset.rowId = id;
    li.dataset.placed = placed ? 'true' : 'false';
    if (state.selectedMarker === id) {
      li.dataset.selected = 'true';
    }
    const badge = document.createElement('span');
    const symbol = symbolOf(row);
    badge.className = `marker-badge marker-${row.colour} ${symbolClasses(symbol)}`;
    drawSymbol(badge, symbol, String(number));
    const label = document.createElement('span');
    label.className = 'placement-label';
    label.textContent = itemLabel(row, number);
    const status = document.createElement('span');
    status.className = 'placement-status';
    status.textContent = placed ? t.placementPlaced : t.placementNotPlaced;
    li.append(badge, label, status);
    // Tap-to-place (FR-73): in the narrow layout, an unplaced item offers
    // the action; the stylesheet shows it there only.
    if (!placed) {
      const place = document.createElement('button');
      place.type = 'button';
      place.className = 'placement-place';
      place.textContent = t.placeOnMap;
      place.setAttribute('aria-label', fill(t.placeOnMapFor, { name: itemLabel(row, number) }));
      place.addEventListener('click', (e) => {
        e.stopPropagation();
        startPlacing(id);
      });
      li.appendChild(place);
    }
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(ROW_DRAG_TYPE, id);
      e.dataTransfer?.setData('text/plain', itemLabel(row, number));
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copyMove';
      }
    });
    li.addEventListener('click', () => {
      // In the narrow layout, choosing an entry closes the overlay and opens
      // the details (FR-72, FR-74).
      if (narrowApplication()) {
        closeNarrowOverlay();
      }
      if (state.positions.has(row)) {
        selectMarker(id);
      } else {
        openDetails(id);
      }
    });
    list.appendChild(li);
  });
  el('placement-hint').textContent = narrowApplication() ? t.placementHintNarrow : t.placementHint;
  el('placement-empty').classList.toggle('hidden', state.rows.length > 0);
  el('placement-hint').classList.toggle('hidden', state.rows.length === 0);
}

// Re-renders everything on the map that derives from the list: markers follow
// row deletions, colours, and the regenerated global numbering (FR-3).
export function renderMapItems(): void {
  pruneMarkers(state.positions, state.rows);
  if (state.selectedMarker) {
    const row = rowById(state.selectedMarker);
    if (!row || !state.positions.has(row)) {
      state.selectedMarker = null;
    }
  }
  for (const row of [...state.excluded]) {
    if (!state.rows.includes(row)) {
      state.excluded.delete(row);
    }
  }
  for (const row of [...state.shapes.keys()]) {
    if (!state.rows.includes(row)) {
      state.shapes.delete(row);
    }
  }
  // A footprint whose item is no longer in the data (a new import) becomes a
  // free annotation.
  for (const [id, row] of [...state.annotationLinks]) {
    if (!state.ingested.includes(row)) {
      state.annotationLinks.delete(id);
    }
  }
  const markers = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered());
  markerLayer?.render(markers, state.selectedMarker);
  renderAnnotations();
  renderGlance('map', mapView, state.selectedMarker, (id) => {
    // In the narrow layout, choosing an entry closes the overlay (FR-72).
    if (narrowApplication()) {
      closeNarrowOverlay();
    }
    selectMarker(id);
  });
  renderPresentation();
  applyHighlight();
  renderPlacementList();
  renderPlacing();
  const t = strings(state.prefs.lang);
  const selected = markers.find((m) => rowId(m.row) === state.selectedMarker);
  el('marker-selection').textContent = selected ? `${t.markerSelected}: ${selected.label}` : t.markerNoSelection;
  // The details panel names the item's footprints (FR-48).
  if (state.detailsId) {
    renderDetailsPanel();
  }
  el<HTMLButtonElement>('marker-remove').disabled = !selected;
  const shapeSelect = el<HTMLSelectElement>('marker-shape');
  shapeSelect.disabled = !selected;
  if (shapeSelect.options.length !== SYMBOLS.length) {
    shapeSelect.innerHTML = '';
    for (const shape of SYMBOLS) {
      const opt = document.createElement('option');
      opt.value = shape;
      shapeSelect.appendChild(opt);
    }
  }
  for (const opt of shapeSelect.options) {
    opt.textContent = symbolLabel(opt.value as MarkerSymbol);
  }
  shapeSelect.value = selected?.shape ?? 'circle';
  // The presentation's legend follows the visibility (FR-75): recomputed on
  // every change of the items, including every visibility toggle (FR-27).
  renderLegends();
}

function renderMapControls(): void {
  renderAnnotationToolbar();
  const view = mapView;
  const has = view?.background !== null && view?.background !== undefined;
  for (const id of ['map-zoom-in', 'map-zoom-out', 'map-fit', 'map-reset']) {
    el<HTMLButtonElement>(id).disabled = !has;
  }
  el('map-zoom-level').textContent = `${Math.round((view?.viewport.scale ?? 1) * 100)}%`;
  el('map-empty').classList.toggle('hidden', has);
}

let pdfDocument: PdfDocument | null = null;

export async function closePdf(): Promise<void> {
  const doc = pdfDocument;
  pdfDocument = null;
  hideDialog('pdf-panel');
  el('pdf-status').textContent = '';
  if (doc) {
    await doc.close().catch(() => undefined);
  }
}

function setPdfBusy(busy: boolean): void {
  el<HTMLButtonElement>('pdf-use').disabled = busy;
  el<HTMLSelectElement>('pdf-page').disabled = busy;
  el('pdf-status').textContent = busy ? strings(state.prefs.lang).pdfRendering : '';
}

// Renders the chosen page and hands it to the map view as the background
// image, on the same viewport machinery as an image file (FR-25).
async function usePdfPage(page: number): Promise<void> {
  const doc = pdfDocument;
  if (!doc || !mapView) {
    return;
  }
  setPdfBusy(true);
  let src: string;
  try {
    src = await doc.renderPage(page);
  } catch {
    setPdfBusy(false);
    showMapError('pdf-render');
    return;
  }
  await closePdf();
  setPdfBusy(false);
  await mapView.setBackgroundSource(src);
}

async function loadPdfFile(file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    showMapError('pdf-too-large');
    return;
  }
  await closePdf();
  let doc: PdfDocument;
  try {
    doc = await openPdf(await file.arrayBuffer());
  } catch {
    showMapError('pdf-unreadable');
    return;
  }
  if (doc.pageCount < 1) {
    await doc.close().catch(() => undefined);
    showMapError('pdf-unreadable');
    return;
  }
  pdfDocument = doc;
  const select = el<HTMLSelectElement>('pdf-page');
  select.innerHTML = '';
  for (let page = 1; page <= doc.pageCount; page++) {
    const opt = document.createElement('option');
    opt.value = String(page);
    opt.textContent = String(page);
    select.appendChild(opt);
  }
  select.value = '1';
  el('pdf-page-count').textContent = `${strings(state.prefs.lang).pdfPageCount} ${doc.pageCount}`;
  setPdfBusy(false);
  if (doc.pageCount === 1) {
    await usePdfPage(1);
    return;
  }
  showDialog('pdf-panel');
  select.focus();
}

// OpenStreetMap data (FR-31): parsed locally and rendered to an image that
// becomes the background like an image file or a PDF page.
type OsmOutcome = 'ok' | 'malformed' | 'empty' | 'render' | 'decode';

// Renders OpenStreetMap data as the background. A local file reports its
// failures in the map area; a fetch reports them in its own panel.
export async function useOsmText(text: string, fetched?: { bounds: OsmBounds; attribution: string }): Promise<OsmOutcome> {
  let src: string;
  let projection: MercatorProjection | undefined;
  try {
    const data = parseOsm(text);
    // Fetched data carries no bounds element: the requested area is the extent.
    if (fetched) {
      data.bounds = fetched.bounds;
    }
    const plan = planRender(data);
    projection = plan.projection;
    src = renderPlanToDataUrl(plan, fetched?.attribution);
  } catch (e) {
    const outcome: OsmOutcome = e instanceof OsmError ? (e.code === 'empty' ? 'empty' : 'malformed') : 'render';
    if (!fetched) {
      showMapError(outcome === 'empty' ? 'osm-empty' : outcome === 'malformed' ? 'osm-malformed' : 'osm-render');
    }
    return outcome;
  }
  await closePdf();
  // The rendering's projection makes its scale known (FR-49).
  return (await mapView?.setBackgroundSource(src, undefined, projection)) ? 'ok' : 'decode';
}

async function loadOsmFile(file: File): Promise<void> {
  if (file.size > MAX_OSM_BYTES) {
    showMapError('osm-too-large');
    return;
  }
  let text: string;
  try {
    text = await readText(file);
  } catch {
    showMapError('unreadable');
    return;
  }
  await useOsmText(text);
}

async function loadBackgroundFile(file: File): Promise<void> {
  showMapError(null);
  if (isOsmFile(file)) {
    await loadOsmFile(file);
  } else if (isPdfFile(file)) {
    await loadPdfFile(file);
  } else {
    await mapView?.loadImageFile(file);
  }
}

export function initialiseMapView(): void {
  mapView = new MapView(
    el('map-stage'),
    el('map-content'),
    el<HTMLImageElement>('map-image'),
    {
      onError: (kind) => showMapError(kind),
      onBackgroundChanged: () => {
        markDirty();
        syncPresentationBackground();
        renderMapControls();
        renderWorkStatus();
        renderComparison();
      },
      onViewportChanged: () => {
        renderMapControls();
        renderMapItems();
      },
    },
    { panFilter: (e) => drawingTools?.allowsPan(e) ?? true },
  );
  setMapAnnotations(
    new AnnotationLayer(
      el('map-annotations') as unknown as SVGSVGElement,
      el('map-annotation-labels'),
      () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
      el('map-annotation-handles'),
    ),
  );
  setDrawingTools(
    new DrawingTools(el('map-stage'), {
      viewport: () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
      stagePoint: (x, y) => mapView?.stagePoint(x, y) ?? { x, y },
      hasBackground: () => mapView?.background !== null && mapView?.background !== undefined,
      style: () => ({ ...state.annotationStyle }),
      onDraft: (draft, cursor) => {
        setAnnotationDraft({ draft, cursor });
        renderAnnotations();
        renderAnnotationToolbar();
      },
      onCreate: createAnnotation,
      editable: () => state.annotations,
      selectedId: () => state.selectedAnnotation,
      onSelect: selectAnnotation,
      onChange: (annotation, final) => {
        replaceAnnotation(annotation);
        if (final) {
          markDirty();
        }
        renderAnnotations();
        if (final) {
          renderAnnotationInspector();
        }
      },
      touch: () => narrowApplication(),
    }),
  );
  wireAnnotationToolbar();
  markerLayer = new MarkerLayer(el('marker-layer'), {
    editable: true,
    isExcluded: (marker) => state.excluded.has(marker.row),
    onHover: setHover,
    viewport: () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
    stagePoint: (x, y) => mapView?.stagePoint(x, y) ?? { x, y },
    rowId: (marker) => rowId(marker.row),
    symbolSource: (marker) => symbolSource(marker.row),
    markerLabel,
    onSelect: selectMarker,
    onMove: moveMarker,
    onRemove: deleteMarker,
  });
  renderMapControls();

  const fileInput = el<HTMLInputElement>('map-file-input');
  el('map-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void loadBackgroundFile(file);
    }
    fileInput.value = '';
  });
  el('map-zoom-in').addEventListener('click', () => mapView?.zoomBy(BUTTON_ZOOM_FACTOR));
  el('map-zoom-out').addEventListener('click', () => mapView?.zoomBy(1 / BUTTON_ZOOM_FACTOR));
  el('map-fit').addEventListener('click', () => mapView?.fit());
  el('map-reset').addEventListener('click', () => mapView?.reset());
  el('pdf-use').addEventListener('click', () => {
    void usePdfPage(Number(el<HTMLSelectElement>('pdf-page').value));
  });
  el('pdf-cancel').addEventListener('click', () => void closePdf());
  el('marker-shape').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    const row = state.selectedMarker ? rowById(state.selectedMarker) : undefined;
    if (!row || !isSymbol(value)) {
      return;
    }
    state.shapes.set(row, value);
    markDirty();
    renderMapItems();
    renderDetailsPanel();
  });
  el('marker-remove').addEventListener('click', () => {
    if (state.selectedMarker) {
      deleteMarker(state.selectedMarker);
    }
  });

  const stage = el('map-stage');
  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    stage.classList.add('dragover');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  // Tap-to-place (FR-73): a tap on the stage, not a pan or a pinch, places
  // the waiting item through the drop's own placement.
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (placingId === null) {
        return;
      }
      placingDown = e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    },
    true,
  );
  stage.addEventListener(
    'pointerup',
    (e) => {
      const down = placingDown;
      placingDown = null;
      if (placingId === null || !down || down.id !== e.pointerId) {
        return;
      }
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) {
        return;
      }
      const id = placingId;
      placingId = null;
      dropRowOnMap(id, e.clientX, e.clientY);
      renderPlacing();
    },
    true,
  );
  stage.addEventListener('pointercancel', () => (placingDown = null), true);
  el('place-cancel').addEventListener('click', () => stopPlacing());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && placingId !== null) {
      stopPlacing();
    }
  });
  stage.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('.marker') && state.selectedMarker) {
      selectMarker(null);
    }
  });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    const draggedRow = e.dataTransfer?.getData(ROW_DRAG_TYPE);
    if (draggedRow) {
      dropRowOnMap(draggedRow, e.clientX, e.clientY);
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void loadBackgroundFile(file);
    }
  });
}
