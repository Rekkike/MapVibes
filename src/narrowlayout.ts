// The narrow layout of the application and of the exported viewer: the
// overlay module's start, the dialogs, and the moved controls.
import { MapView } from './mapview';
import { NARROW_QUERY, NarrowDialogs, NarrowViewer, type NarrowDialogSpec } from './narrowviewer';
import { el, state } from './appstate';
import { fetchAbort } from './fetchpanel';
import { closeDocumentDialog } from './documentdialog';
import { closeComparison, closeExportDialog } from './exportdialog';
import { closeActivityDialog } from './activitydialog';
import { openDetails } from './detailspanel';
import { renderAnnotationInspector, selectAnnotation } from './annotationpanel';
import { closePdf, mapView, renderMapItems } from './mapstage';
import { cardId, closeCard, presentationView, renderPresentation } from './presentationstage';

// The narrow viewer layout (FR-58), in the viewer only: active while its
// query matches. The stage's size at the last refit, so that a resize refits
// the view from it.
let narrow: NarrowViewer | null = null;
let narrowStage: { width: number; height: number } | null = null;

// Whether the presentation is in a narrow layout: the viewer's, or the
// application's (FR-71), which follows the viewer's patterns.
export function narrowViewer(): boolean {
  return (narrow?.active() ?? false) || narrowApplication();
}

export function closeNarrowOverlay(): void {
  narrow?.close({ returnFocus: false });
  appNarrow?.close({ returnFocus: false });
  narrowDialogs?.closeOpen();
}

// The six dialogs as overlays in the narrow layout (FR-71 and FR-72 as
// amended): shown and hidden through the manager, so that below
// the threshold they open over the stage -- one open at a time, focus moved
// in and returned, Escape and a tap outside closing -- and above the
// threshold they keep their page-flow shapes. The hidden class stays the
// dialogs' own open flag everywhere.
let narrowDialogs: NarrowDialogs | null = null;

export function showDialog(id: string): void {
  if (narrowDialogs?.active()) {
    narrowDialogs.closeOpen();
    closeNarrowOverlay();
    if (cardId !== null) {
      closeCard();
    }
    if (state.selectedAnnotation !== null) {
      selectAnnotation(null);
    }
    narrowDialogs.showing(id);
  }
  el(id).classList.remove('hidden');
}

export function hideDialog(id: string): void {
  el(id).classList.add('hidden');
  narrowDialogs?.hidden(id);
}

function dialogSpecs(): NarrowDialogSpec[] {
  return [
    {
      id: 'fetch-panel',
      kind: 'sheet',
      close: () => {
        fetchAbort?.abort();
        hideDialog('fetch-panel');
      },
    },
    { id: 'pdf-panel', kind: 'sheet', close: () => void closePdf() },
    { id: 'document-panel', kind: 'sheet', close: closeDocumentDialog },
    { id: 'export-panel', kind: 'page', close: closeExportDialog },
    { id: 'compare-panel', kind: 'page', close: closeComparison },
    { id: 'activity-panel', kind: 'page', close: closeActivityDialog },
  ];
}

// The narrow application layout (FR-71, FR-72): the application's own
// overlays, from the toggle bars of the Map and Presentation segments, one
// open at a time, gated on the application's mode, so that the viewer, when
// a presentation is opened in the application, has its own.
export let appNarrow: NarrowViewer | null = null;

export function narrowApplication(): boolean {
  return appNarrow?.active() ?? false;
}

export function startNarrowApplication(): void {
  appNarrow = new NarrowViewer(
    window.matchMedia(NARROW_QUERY),
    [
      { toggle: el<HTMLButtonElement>('menu-toggle'), panel: el('app-menu') },
      { toggle: el<HTMLButtonElement>('toggle-items'), panel: el('placement-area') },
      { toggle: el<HTMLButtonElement>('toggle-map-glance'), panel: el('map-glance') },
      { toggle: el<HTMLButtonElement>('toggle-map-legend'), panel: el('map-legend') },
      { toggle: el<HTMLButtonElement>('toggle-visibility'), panel: el('visibility-area') },
      { toggle: el<HTMLButtonElement>('toggle-glance'), panel: el('presentation-glance') },
      { toggle: el<HTMLButtonElement>('toggle-legend'), panel: el('presentation-legend') },
    ],
    {
      enabled: () => document.documentElement.dataset.mode !== 'viewer',
      // The card, the details sheet (FR-74), and the annotation inspector's
      // sheet take the overlays' place.
      closeCard: () => {
        if (cardId !== null) {
          closeCard();
        }
        if (state.detailsId !== null) {
          openDetails(null);
        }
        if (state.selectedAnnotation !== null) {
          selectAnnotation(null);
        }
        narrowDialogs?.closeOpen();
      },
      render: () => {
        layoutHeader();
        layoutAnnotationControls();
        renderMapItems();
        renderAnnotationInspector();
      },
      refit: () => refitNarrowStages(),
    },
  );
  layoutHeader();
  layoutAnnotationControls();
  // The six dialogs as overlays in the narrow layout (FR-71, FR-72 as
  // amended), on the same query and gate as the overlays.
  narrowDialogs = new NarrowDialogs(window.matchMedia(NARROW_QUERY), dialogSpecs(), {
    enabled: () => document.documentElement.dataset.mode !== 'viewer',
  });
  refitNarrowStages();
}

// The resize and orientation refit (FR-71), in the narrow layout only (the
// module calls it there only): each stage's size at its last refit, so that
// a fitted view stays fitted and another keeps its centre. A stage hidden
// in another segment has no size: it keeps its record, and is refitted when
// it is shown again.
const narrowStages = new Map<MapView, { width: number; height: number }>();

export function refitNarrowStages(): void {
  for (const view of [mapView, presentationView]) {
    if (!view) {
      continue;
    }
    const now = view.stageSize();
    if (now.width <= 0 || now.height <= 0) {
      continue;
    }
    const before = narrowStages.get(view);
    if (before) {
      view.refit(before);
    }
    narrowStages.set(view, view.stageSize());
  }
  renderMapItems();
}

// The header's controls that the narrow layout moves into the Menu overlay
// (FR-71), each with an anchor marking its place in the header, so that
// leaving the narrow layout puts it back exactly where it was.
let headerAnchors: Array<{ item: HTMLElement; anchor: Comment }> | null = null;

function layoutHeader(): void {
  if (headerAnchors === null) {
    const items = [el('demo-badge'), el('demo-reset'), el('work-controls'), el('select-language').closest('label')!, el('select-theme').closest('label')!];
    headerAnchors = items.map((item) => {
      const anchor = document.createComment('menu');
      item.before(anchor);
      return { item, anchor };
    });
  }
  const menu = el('app-menu');
  if (narrowApplication()) {
    for (const { item } of headerAnchors) {
      if (item.parentElement !== menu) {
        menu.appendChild(item);
      }
    }
  } else {
    for (const { item, anchor } of headerAnchors) {
      if (item.previousSibling !== anchor) {
        anchor.after(item);
      }
    }
  }
}

// The four style controls of the annotation toolbar (FR-47 as amended in
// in the narrow layout they move into the inspector's bottom
// sheet, after its heading, so that the toolbar's single row keeps only the
// tools and the hint; above the threshold they sit in the toolbar as before.
// Each carries an anchor marking its place in the toolbar, so that leaving
// the narrow layout puts it back exactly where it was.
let annotationStyleAnchors: Array<{ item: HTMLElement; anchor: Comment }> | null = null;
let annotationStyleSheetAnchor: Comment | null = null;

function layoutAnnotationControls(): void {
  const toolbar = el('annotation-toolbar');
  if (annotationStyleAnchors === null) {
    const items = [...toolbar.querySelectorAll<HTMLElement>(':scope > label')];
    annotationStyleAnchors = items.map((item) => {
      const anchor = document.createComment('annotation-style');
      item.before(anchor);
      return { item, anchor };
    });
    const inspector = el('annotation-inspector');
    annotationStyleSheetAnchor = document.createComment('annotation-style');
    inspector.querySelector('#annotation-inspector-heading')!.after(annotationStyleSheetAnchor);
  }
  const inspector = el('annotation-inspector');
  if (narrowApplication()) {
    for (const { item } of annotationStyleAnchors) {
      if (item.parentElement !== inspector) {
        inspector.insertBefore(item, annotationStyleSheetAnchor);
      }
    }
  } else {
    for (const { item, anchor } of annotationStyleAnchors) {
      if (item.previousSibling !== anchor) {
        anchor.after(item);
      }
    }
  }
}

export function startNarrowViewer(): void {
  narrowStage = presentationView?.stageSize() ?? null;
  narrow = new NarrowViewer(
    window.matchMedia(NARROW_QUERY),
    [
      { toggle: el<HTMLButtonElement>('toggle-glance'), panel: el('presentation-glance') },
      { toggle: el<HTMLButtonElement>('toggle-legend'), panel: el('presentation-legend') },
    ],
    {
      closeCard: () => {
        if (cardId !== null) {
          closeCard();
        }
      },
      render: () => renderPresentation(),
      refit: () => {
        if (!presentationView) {
          return;
        }
        const before = narrowStage;
        narrowStage = presentationView.stageSize();
        if (before) {
          presentationView.refit(before);
        }
        renderPresentation();
      },
    },
  );
}
