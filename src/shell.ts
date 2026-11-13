// The layout of the medium, wide, and extra wide classes (FR-81): the bar's
// menus, the tool strip's "more", the folds of the panels, and the controls
// that sit in other places than in the compact and short classes. The layout
// itself is in the stylesheet, in one media block on the complement of the
// narrow query; this module moves the controls that the block cannot reach
// by style alone, each with an anchor marking its place in the page, so that
// the compact and short classes (and the viewer) find every control exactly
// where it was.

import { DOCK_QUERY, NARROW_QUERY, NarrowViewer, WIDE_QUERY, XWIDE_QUERY } from './narrowviewer';
import { el, state } from './appstate';
import { setSegment } from './segmentswitch';

export type LayoutClass = 'compact' | 'short' | 'medium' | 'wide' | 'xwide';

const SHORT_QUERY = '(max-height: 31.249rem)';

interface Queries {
  narrow: MediaQueryList;
  short: MediaQueryList;
  wide: MediaQueryList;
  dock: MediaQueryList;
  xwide: MediaQueryList;
}

let made: Queries | null = null;

// The queries, made on first use: the narrow application's overlays lay the
// header out before this module is started.
function q(): Queries {
  made ??= {
    narrow: window.matchMedia(NARROW_QUERY),
    short: window.matchMedia(SHORT_QUERY),
    wide: window.matchMedia(WIDE_QUERY),
    dock: window.matchMedia(DOCK_QUERY),
    xwide: window.matchMedia(XWIDE_QUERY),
  };
  return made;
}
let popovers: NarrowViewer | null = null;
let onChange: () => void = () => undefined;

function viewerMode(): boolean {
  return document.documentElement.dataset.mode === 'viewer';
}

// The class in force, by the viewport alone.
export function layoutClass(): LayoutClass {
  const queries = q();
  if (queries.narrow.matches) {
    return queries.short.matches ? 'short' : 'compact';
  }
  return queries.xwide.matches ? 'xwide' : queries.wide.matches ? 'wide' : 'medium';
}

// Whether the layout of FR-81 is in force: the application (not the viewer)
// in the medium class or above.
export function shellActive(): boolean {
  return !q().narrow.matches && !viewerMode();
}

// --- The moved controls ----------------------------------------------------

type Mode = 'narrow' | 'compact' | 'medium' | 'wide' | null;

interface Move {
  item: HTMLElement;
  anchor: Comment;
  // Where the control sits in a mode; null where it keeps its own place.
  where: (mode: Mode) => HTMLElement | null;
  first?: boolean;
}

let moves: Move[] | null = null;
let placed: Mode | undefined;

function move(id: string | HTMLElement, where: Move['where'], first = false): Move {
  const item = typeof id === 'string' ? el(id) : id;
  const anchor = document.createComment('place');
  item.before(anchor);
  return { item, anchor, where, first };
}

function buildMoves(): Move[] {
  const menu = el('app-menu');
  // The strip's placement, in the medium and wide classes and in the compact
  // class, where the tool rows become the 56-pixel bottom bar (v2.1.0).
  const strip = (target: () => HTMLElement) => (mode: Mode) => (mode === 'medium' || mode === 'wide' || mode === 'compact' ? target() : null);
  const desk = (target: () => HTMLElement) => (mode: Mode) => (mode === 'medium' || mode === 'wide' ? target() : null);
  const language = el('select-language').closest('label')!;
  const theme = el('select-theme').closest('label')!;
  const inMenu = (narrow: boolean, shell: boolean) => (mode: Mode) =>
    ((mode === 'narrow' || mode === 'compact') && narrow) || ((mode === 'medium' || mode === 'wide') && shell) ? menu : null;
  return [
    // The Menu: in the compact and short classes the whole of the work
    // controls with the demo's badge (FR-71); in the classes above, what the
    // bar does not show.
    move('demo-badge', inMenu(true, false)),
    move('demo-reset', inMenu(true, true)),
    move('work-controls', inMenu(true, false)),
    move('work-open', inMenu(false, true)),
    move('work-share', inMenu(false, true)),
    move(language, inMenu(true, true)),
    move(theme, inMenu(true, true)),
    // The exports: in the bar's Export menu in the medium and wide classes,
    // in the Menu overlay on the phone, where the bar has no Export (the
    // mockup's phone frames).
    ...['export-open', 'pdf-open', 'pptx-open'].map((id) =>
      move(id, (mode: Mode) => (mode === 'compact' ? menu : mode === 'medium' || mode === 'wide' ? el('bar-export-menu') : null)),
    ),
    // Behind the tool strip's "more".
    ...['map-load', 'fetch-open', 'fetch-offline', 'map-reset', 'marker-selection', 'marker-shape-label', 'marker-remove'].map((id) =>
      move(
        id,
        strip(() => el('map-more-panel')),
      ),
    ),
    move(
      'map-more',
      strip(() => el('annotation-tools')),
    ),
    // The zoom and fit controls, floating at the stage's lower right.
    ...['map-zoom-in', 'map-zoom-level', 'map-zoom-out', 'map-fit'].map((id) =>
      move(
        id,
        strip(() => el('map-zoom')),
      ),
    ),
    ...['pres-zoom-in', 'pres-zoom-level', 'pres-zoom-out', 'pres-fit', 'pres-reset'].map((id) =>
      move(
        id,
        strip(() => el('pres-zoom')),
      ),
    ),
    // On the phone, the overlay toggles ride in the bottom bar with the tools.
    move('map-toggles', (mode: Mode) => (mode === 'compact' ? el('annotation-toolbar') : null)),
    // The folds' controls, in the panels they fold.
    move(
      'toggle-items',
      desk(() => el('placement-area')),
      true,
    ),
    move(
      'toggle-visibility',
      desk(() => el('visibility-area')),
      true,
    ),
    move(
      'toggle-legend',
      desk(() => el('presentation-area')),
    ),
    move(
      'toggle-map-glance',
      desk(() => el('map-glance')),
      true,
    ),
    move(
      'toggle-glance',
      desk(() => el('presentation-glance')),
      true,
    ),
  ];
}

function placeControls(): void {
  moves ??= buildMoves();
  const cls = layoutClass();
  const mode: Mode = viewerMode() ? null : cls === 'short' ? 'narrow' : cls === 'compact' ? 'compact' : cls === 'medium' ? 'medium' : 'wide';
  if (mode === placed) {
    return;
  }
  placed = mode;
  // Everything back to its own place first, so that a group moved as a
  // whole and a control moved out of it never meet half way.
  for (const m of moves) {
    if (m.item.previousSibling !== m.anchor) {
      m.anchor.after(m.item);
    }
  }
  for (const m of moves) {
    const target = m.where(mode);
    if (!target) {
      continue;
    }
    if (m.first) {
      target.prepend(m.item);
    } else {
      target.appendChild(m.item);
    }
  }
}

// --- The folds --------------------------------------------------------------

interface Fold {
  key: string;
  toggle: string;
  panel: string;
  // Open by default where the room allows.
  // Open by default: in every class of this layout, from the docking width,
  // or never.
  opens: 'always' | 'dock' | 'never';
}

// The stage's floating chrome is visible by default where there is room and
// folds on request (the owner's principle): the legends and both "In view"
// panels are open by default in every class of this layout. The items panel
// is open by default from the width at which it docks; the Presentation
// segment's visibility list, a drawer rather than floating chrome, is
// folded by default.
const FOLDS: Fold[] = [
  { key: 'Items', toggle: 'toggle-items', panel: 'placement-area', opens: 'dock' },
  { key: 'MapGlance', toggle: 'toggle-map-glance', panel: 'map-glance', opens: 'always' },
  { key: 'MapLegend', toggle: 'toggle-map-legend', panel: 'map-legend', opens: 'always' },
  { key: 'Visibility', toggle: 'toggle-visibility', panel: 'visibility-area', opens: 'never' },
  { key: 'PresGlance', toggle: 'toggle-glance', panel: 'presentation-glance', opens: 'always' },
  { key: 'PresLegend', toggle: 'toggle-legend', panel: 'presentation-legend', opens: 'always' },
];

const open = new Map<string, boolean>();
let foldsFor: string | null = null;

function applyFolds(): void {
  const root = document.documentElement;
  const active = shellActive();
  // The defaults return whenever the class, or the docking width within it,
  // changes.
  const basis = active ? `${layoutClass()}:${q().dock.matches}` : null;
  if (basis !== foldsFor) {
    foldsFor = basis;
    open.clear();
    if (active) {
      for (const fold of FOLDS) {
        open.set(fold.key, fold.opens === 'always' || (fold.opens === 'dock' && q().dock.matches));
      }
    }
  }
  for (const fold of FOLDS) {
    const name = `fold${fold.key}`;
    const panel = el(fold.panel);
    if (!active) {
      delete root.dataset[name];
      delete panel.dataset.fold;
      continue;
    }
    const value = open.get(fold.key) ? 'open' : 'closed';
    root.dataset[name] = value;
    panel.dataset.fold = value;
    el(fold.toggle).setAttribute('aria-expanded', value === 'open' ? 'true' : 'false');
  }
}

// --- The whole ---------------------------------------------------------------

// Lays the chrome out for the class in force: called at the start and at
// every change of the class or of the mode.
export function layoutShell(): void {
  document.documentElement.dataset.layout = layoutClass();
  placeControls();
  applyFolds();
}

export function refreshShell(): void {
  popovers?.refresh();
}

export function closeShellPopover(): void {
  popovers?.close({ returnFocus: false });
}

// A media query list that matches where another does not, changing with it.
function complement(list: MediaQueryList): MediaQueryList {
  return {
    get matches() {
      return !list.matches;
    },
    media: `not (${list.media})`,
    addEventListener: (type: string, listener: EventListener) => list.addEventListener(type, listener),
    removeEventListener: (type: string, listener: EventListener) => list.removeEventListener(type, listener),
  } as unknown as MediaQueryList;
}

// Starts the layout. Called after the narrow application's overlays are
// started, so that at a change of the class their state is cleared before
// this module writes its own. The hook runs after a fold changes the stage's
// size.
export function startShell(hooks: { resized: () => void; narrow: () => void }): void {
  onChange = hooks.resized;
  const queries = q();
  // The bar's two menus and the tool strip's "more": one open at a time,
  // with the overlays' behaviour (Escape, a press outside, the focus).
  popovers = new NarrowViewer(
    complement(queries.narrow),
    [
      { toggle: el<HTMLButtonElement>('menu-toggle'), panel: el('app-menu') },
      { toggle: el<HTMLButtonElement>('bar-export'), panel: el('bar-export-menu') },
      { toggle: el<HTMLButtonElement>('map-more'), panel: el('map-more-panel') },
    ],
    {
      enabled: () => !viewerMode(),
      closeCard: () => undefined,
      // The Menu is shared with the narrow application's overlays: where
      // this instance stands down it has just cleared the Menu's state, so
      // the narrow overlays write theirs again.
      render: () => {
        layoutShell();
        if (!shellActive()) {
          hooks.narrow();
        }
      },
      refit: () => undefined,
    },
  );
  for (const list of [queries.short, queries.wide, queries.dock, queries.xwide]) {
    list.addEventListener('change', () => {
      layoutShell();
      onChange();
    });
  }
  for (const fold of FOLDS) {
    el(fold.toggle).addEventListener('click', () => {
      if (!shellActive()) {
        return;
      }
      open.set(fold.key, !open.get(fold.key));
      applyFolds();
      onChange();
    });
  }
  // An export chosen from another segment shows the Presentation segment
  // first, where the export's dialog lives; the menu then closes.
  el('bar-export-menu').addEventListener(
    'click',
    (e) => {
      if (!(e.target instanceof HTMLButtonElement)) {
        return;
      }
      closeShellPopover();
      if (state.segment !== 'presentation') {
        setSegment('presentation');
      }
    },
    true,
  );
  // An action behind "more" closes it, except the marker's symbol select.
  el('map-more-panel').addEventListener('click', (e) => {
    if (e.target instanceof HTMLButtonElement) {
      closeShellPopover();
    }
  });
  // The tool in use, for the strip's options; and the offline state, for the
  // bar's pill. Both mirror what other modules already write.
  const stage = el('map-stage');
  const mirrorTool = () => {
    document.documentElement.dataset.tool = stage.dataset.tool ?? 'select';
  };
  new MutationObserver(mirrorTool).observe(stage, { attributes: true, attributeFilter: ['data-tool'] });
  mirrorTool();
  const inspector = el('annotation-inspector');
  const mirrorSelection = () => {
    document.documentElement.dataset.annotation = inspector.classList.contains('hidden') ? 'none' : 'selected';
  };
  new MutationObserver(mirrorSelection).observe(inspector, { attributes: true, attributeFilter: ['class'] });
  mirrorSelection();
  const offline = el('fetch-offline');
  const mirrorOffline = () => el('bar-offline').classList.toggle('hidden', offline.classList.contains('hidden'));
  new MutationObserver(mirrorOffline).observe(offline, { attributes: true, attributeFilter: ['class'] });
  mirrorOffline();
  layoutShell();
}
