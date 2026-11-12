// The shared context of the application's modules: the state, the element
// lookup, and the small helpers every surface uses.
import { counters, NO_FILTER, type RowColour, type RowData, type SortDirection, type ValueFilter } from './dataset';
import type { StatusEntry } from './vocab';
import { loadStoredPresets, type ColumnPreset } from './presets';
import type { RoleAssignments } from './roles';
import { format } from './i18n';
import { loadPreferences, type Preferences } from './preferences';
import type { LegendGroup } from './legend';
import type { CommentStore } from './comments';
import type { MarkerSymbol } from './symbols';
import type { MarkerPositions, MarkerShapes } from './markers';
import type { Segment } from './segments';
import type { ActivityImport, PresentationMode, PresentationOrder, StoredEvent, StoredActivity, TimelineWindow } from './workstate';
import { DEFAULT_CURRENCY_UNIT, type SeriesAssignments } from './economics';
import { DEFAULT_STYLE, type Annotation, type AnnotationStyle } from './annotations';

interface AppState {
  prefs: Preferences;
  roles: RoleAssignments;
  // Manual columns (FR-24): key to label; and the rows added by hand (FR-9).
  manualColumns: Map<string, string>;
  manualRows: Set<RowData>;
  // The user's area vocabulary (FR-32): empty until the user fills it.
  areaValues: string[];
  // The user's program vocabulary (FR-43).
  programValues: string[];
  // The user's names for the four colours (FR-45); a missing or empty name
  // shows the colour's own name.
  colourLabels: Partial<Record<RowColour, string>>;
  // The user's symbol labels (FR-54); a symbol without one shows its name.
  symbolLabels: Partial<Record<MarkerSymbol, string>>;
  // The columns the at-a-glance entries show (FR-46), or null for the
  // defaults: the area, start, and end columns.
  glanceColumns: string[] | null;
  // The card fields (FR-62), or null for the role fields; the year series
  // assigned to the budget, forecast, and outcome roles (FR-63); and the
  // currency unit (FR-64).
  cardColumns: string[] | null;
  series: SeriesAssignments;
  currencyUnit: string;
  // The annotation layer (FR-47): the annotations in drawing order, and the
  // style given to new ones.
  annotations: Annotation[];
  annotationStyle: AnnotationStyle;
  selectedAnnotation: string | null;
  // Linkage (FR-48): the item whose footprint an annotation is; the free
  // annotations switched off for the presentation.
  annotationLinks: Map<string, RowData>;
  hiddenAnnotations: Set<string>;
  // The user's status vocabulary (FR-33): empty until the user fills it.
  statuses: StatusEntry[];
  // FR-34: assign marker symbols from status; off by default.
  symbolsFromStatus: boolean;
  // Saved column presets (FR-23), latest last, and the preset in effect.
  presets: ColumnPreset[];
  activePreset: string | null;
  headers: string[];
  // All ingested rows in ingestion order, retained and removed.
  ingested: RowData[];
  // The retained rows, in ingestion order: the numbered list (FR-3).
  rows: RowData[];
  visibleHeaders: string[];
  hiddenHeaders: Set<string>;
  filter: ValueFilter;
  sort: { header: string | null; direction: SortDirection };
  selected: Set<string>;
  nextRowId: number;
  rowIds: Map<RowData, string>;
  segment: Segment;
  positions: MarkerPositions;
  // Marker shapes (FR-26), per marker; circle where unset.
  shapes: MarkerShapes;
  selectedMarker: string | null;
  // True when the work has changed since it was last saved or opened.
  dirty: boolean;
  // Items switched off for the presentation (FR-27).
  excluded: Set<RowData>;
  // The item selected on the presentation stage.
  presentationSelected: string | null;
  // The item whose details panel is open (FR-7), if any.
  detailsId: string | null;
  // The comments of each item (FR-15).
  comments: CommentStore;
  // The imported values edited by hand (FR-10), with their imported value.
  edited: Map<RowData, Record<string, string>>;
  // The activities of each item (FR-77) and the import they came from
  // (FR-76), both keyed by row, like the comments.
  activities: Map<RowData, StoredActivity[]>;
  activityImports: Map<RowData, ActivityImport>;
  // The work phase of an item (FR-78): the id of one of its activities.
  workPhases: Map<RowData, string>;
  // The exported viewer (FR-38): view-only, with the numbers the items have
  // in the exported presentation.
  viewOnly: boolean;
  numbers: Map<RowData, number> | null;
  // The numbers shown in the exported viewer, when they differ from the
  // numbers (the grouped numbering, FR-17).
  viewerLabels: Map<RowData, string> | null;
  // The program groups of an exported file (FR-40), in the viewer only.
  viewerProgramGroups: LegendGroup[] | null;
  // The numbering mode (FR-3, FR-17): global by default, or grouped by area.
  numbering: 'global' | 'grouped';
  // The list view (FR-17): flat, or grouped by area in collapsible sections;
  // the area values whose sections are collapsed.
  listView: 'flat' | 'grouped';
  collapsedAreas: Set<string>;
  // The presentation's view (FR-66) and order (FR-70); the timeline's view
  // to restore when it is next drawn (FR-67), or null for the fitted view.
  presentationMode: PresentationMode;
  presentationOrder: PresentationOrder;
  timelineRestore: TimelineWindow | null;
  // The events (FR-80): global dated markers the user authored; and the
  // costs view's view to restore when it is next drawn (FR-79).
  events: StoredEvent[];
  costsRestore: TimelineWindow | null;
}

export const state: AppState = {
  prefs: loadPreferences(),
  roles: {},
  manualColumns: new Map(),
  manualRows: new Set(),
  areaValues: [],
  programValues: [],
  colourLabels: {},
  symbolLabels: {},
  glanceColumns: null,
  cardColumns: null,
  series: {},
  currencyUnit: DEFAULT_CURRENCY_UNIT,
  annotations: [],
  annotationStyle: { ...DEFAULT_STYLE },
  selectedAnnotation: null,
  annotationLinks: new Map(),
  hiddenAnnotations: new Set(),
  statuses: [],
  symbolsFromStatus: false,
  presets: loadStoredPresets(),
  activePreset: null,
  headers: [],
  ingested: [],
  rows: [],
  visibleHeaders: [],
  hiddenHeaders: new Set(),
  filter: { ...NO_FILTER },
  sort: { header: null, direction: 'asc' },
  selected: new Set(),
  nextRowId: 1,
  rowIds: new Map(),
  segment: 'information',
  positions: new Map(),
  shapes: new Map(),
  selectedMarker: null,
  dirty: false,
  excluded: new Set(),
  presentationSelected: null,
  detailsId: null,
  comments: new Map(),
  edited: new Map(),
  activities: new Map(),
  activityImports: new Map(),
  workPhases: new Map(),
  viewOnly: false,
  numbers: null,
  viewerLabels: null,
  viewerProgramGroups: null,
  numbering: 'global',
  listView: 'flat',
  collapsedAreas: new Set(),
  presentationMode: 'map',
  presentationOrder: 'number',
  timelineRestore: null,
  events: [],
  costsRestore: null,
};

// Drag-and-drop data type identifying a list row dragged onto the map.
export const ROW_DRAG_TYPE = 'application/x-mapvibes-row';

export function rowId(row: RowData): string {
  let id = state.rowIds.get(row);
  if (!id) {
    id = `row-${state.nextRowId++}`;
    state.rowIds.set(row, id);
  }
  return id;
}

export function rowById(id: string): RowData | undefined {
  return state.rows.find((r) => state.rowIds.get(r) === id);
}

export function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) {
    throw new Error(`missing element #${id}`);
  }
  return e as T;
}

export function currentCounters() {
  return counters(state.ingested.length, state.rows.length);
}

export function fill(template: string, values: Record<string, string | number>): string {
  return format(template, values);
}
