// The demo (FR-41): loading, following the interface language, and
// resetting.
import { parseWorkbook } from './ingest';
import { statusNames } from './vocab';
import { clonePreset, storePresets, upsertPreset, type ColumnPreset } from './presets';
import { strings, type Lang } from './i18n';
import { restoreComments } from './comments';
import { placeMarker } from './markers';
import { activityId } from './workstate';
import { demoCounterparts, demoMapText, demoScenario, demoWorkbook, type DemoId } from './demo';
import { newAnnotationId, type Annotation } from './annotations';
import { el, state } from './appstate';
import { changeCount, markDirty, setWorkMessage, workMessage } from './workfile';
import { mapView, useOsmText } from './mapstage';
import { restoreCostsView, restoreTimelineView } from './presentationstage';
import { applyImport, renderList } from './listpanel';
import { applyStarterVocabulary } from './starter';
import { setEventMessage } from './columnpanels';
import { setSegment } from './segmentswitch';

// The full-test demo (FR-41): the fictional example scenario, loaded through
// the normal paths: the demo's column preset is saved, the demo list is
// imported (so the preset applies the roles and vocabularies as it would to
// any matching import), the town map renders as an .osm background, and the
// scenario adds the colours, comments, and markers. It is unsaved work,
// labelled as example data until other work replaces it.
export let demoLoaded = false;
export function setDemoLoaded(value: boolean): void {
  demoLoaded = value;
}
// The loaded demo (v2.4.0: one of the two bundled demos), or null.
let demoId: DemoId | null = null;
export function currentDemoId(): DemoId | null {
  return demoId;
}
let demoBaseline = -1;

// The language the demo's provided labels are in, and the demo's own
// annotations by their place in the scenario, so that the provided labels
// not renamed follow a change of language (FR-41 as amended).
let demoLang: Lang | null = null;
export function setDemoLang(value: Lang | null): void {
  demoLang = value;
}
let demoAnnotationIds: string[] = [];
export function setDemoAnnotationIds(value: string[]): void {
  demoAnnotationIds = value;
}
let demoEventIds: string[] = [];
export function setDemoEventIds(value: string[]): void {
  demoEventIds = value;
}

function samePreset(a: ColumnPreset, b: ColumnPreset): boolean {
  return JSON.stringify(clonePreset(a)) === JSON.stringify(clonePreset(b));
}

export async function loadDemo(id: DemoId, options: { confirmed?: boolean } = {}): Promise<boolean> {
  const t = strings(state.prefs.lang);
  if (!options.confirmed && state.dirty && !window.confirm(t.demoConfirmReplace)) {
    return false;
  }
  // The demo loads in the interface language (FR-41 as amended).
  const lang = state.prefs.lang;
  const scenario = demoScenario(id, lang);
  // The session's own settings start afresh, so that the demo is pristine.
  state.excluded = new Set();
  state.positions = new Map();
  state.shapes = new Map();
  // The demos ride the default vocabulary (FR-45, FR-54 as amended in
  // v2.6.0): a demo starts as a new work does.
  applyStarterVocabulary(state, state.prefs.lang);
  state.numbering = 'global';
  state.listView = 'flat';
  state.detailsId = null;
  state.selectedMarker = null;
  state.presentationSelected = null;
  restoreTimelineView(null);
  restoreCostsView(null);
  state.events = [];
  setEventMessage('');
  // The demo's preset of another language, if unchanged, gives way to this
  // language's.
  for (const other of (['en', 'sv'] as const).filter((l) => l !== lang)) {
    const provided = demoScenario(id, other).preset;
    state.presets = state.presets.filter((p) => !(p.name === provided.name && samePreset(p, provided)));
  }
  state.presets = upsertPreset(state.presets, scenario.preset);
  storePresets(state.presets);
  el('ingest-error').classList.add('hidden');
  applyImport(parseWorkbook(demoWorkbook(id, lang)));
  state.symbolsFromStatus = scenario.symbolsFromStatus;
  const idKey = state.roles.identifier;
  const rowOf = (item: string) => (idKey === undefined ? undefined : state.rows.find((r) => r.values[idKey] === item));
  for (const item of scenario.items) {
    const row = rowOf(item.item);
    if (!row) {
      continue;
    }
    row.colour = item.colour;
    if (item.comments.length > 0) {
      state.comments.set(row, restoreComments(item.comments));
    }
    if (item.activities && item.activities.length > 0) {
      state.activities.set(
        row,
        item.activities.map((a, j) => ({ id: activityId(j), ...a })),
      );
    }
    if (item.workPhase !== undefined) {
      state.workPhases.set(row, item.workPhase);
    }
  }
  // The demo's map background is open map data: it carries the
  // OpenStreetMap attribution as data, drawn into the rendered image like a
  // fetched background (FR-31), in the interface language.
  const outcome = await useOsmText(demoMapText(id), { attribution: t.fetchAttribution }, true);
  const bg = mapView?.background;
  if (outcome === 'ok' && bg) {
    for (const item of scenario.items) {
      const row = rowOf(item.item);
      if (!row || !item.position) {
        continue;
      }
      placeMarker(state.positions, row, { x: item.position[0] * bg.width, y: item.position[1] * bg.height });
      if (item.symbol) {
        state.shapes.set(row, item.symbol);
      }
    }
  }
  // The demo's own colour labels, at-a-glance columns, and annotations
  // (FR-41 as amended) replace any earlier ones.
  state.colourLabels = { ...state.colourLabels, ...scenario.colourLabels };
  state.glanceColumns = [...scenario.glanceColumns];
  state.annotations = [];
  state.annotationLinks = new Map();
  state.hiddenAnnotations = new Set();
  state.selectedAnnotation = null;
  demoAnnotationIds = [];
  if (outcome === 'ok' && bg) {
    for (const a of scenario.annotations) {
      const annotation: Annotation = {
        id: newAnnotationId(),
        kind: a.kind,
        points: a.points.map(([x, y]) => ({ x: x * bg.width, y: y * bg.height })),
        colour: a.colour,
        fillOpacity: a.fillOpacity,
        outline: a.outline,
        lineStyle: a.lineStyle,
        label: a.label,
      };
      state.annotations.push(annotation);
      demoAnnotationIds.push(annotation.id);
      const row = a.link === null ? undefined : rowOf(a.link);
      if (row) {
        state.annotationLinks.set(annotation.id, row);
      }
    }
  }
  // The demo's two fictional events (FR-41 as amended, FR-80).
  state.events = scenario.events.map((e, i) => ({ id: `e${i + 1}`, date: e.date, label: e.label }));
  demoEventIds = state.events.map((e) => e.id);
  demoLoaded = true;
  demoId = id;
  demoLang = lang;
  markDirty();
  demoBaseline = changeCount;
  setWorkMessage(id === 'helsingborg' ? 'demo-loaded-plan' : 'demo-loaded');
  renderList();
  setSegment('map');
  return outcome === 'ok';
}

// A change of language while the demo is loaded (FR-41 as amended): each
// provided label the user has not renamed takes its counterpart in the new
// language: the colour labels, the area, program, and status values with the
// cells that hold them, and the annotation labels. What the user typed is kept as typed; the list's own headers and
// texts stay as loaded, and so does the preset, which matches the headers.
// The default vocabulary's names that followed the language just before
// (FR-54 as amended) count with the demo's own: following is not a change of
// the user's. Returns whether the demo handled the change.
export function followDemoLanguage(to: Lang, starterFollowed = false): boolean {
  if (!demoLoaded || demoId === null || demoLang === null || demoLang === to) {
    return false;
  }
  const c = demoCounterparts(demoId, demoLang, to);
  demoLang = to;
  let changed = false;
  for (const { colour, from, to: next } of c.colourLabels) {
    if (state.colourLabels[colour] !== from) {
      continue;
    }
    state.colourLabels[colour] = next;
    changed = true;
  }
  // A value follows unless its counterpart is already taken.
  const follow = (values: string[], pairs: Array<[string, string]>, key: string | undefined): Map<string, string> => {
    const renamed = new Map<string, string>();
    for (const [from, next] of pairs) {
      if (values.includes(from) && !values.includes(next)) {
        renamed.set(from, next);
      }
    }
    if (key !== undefined) {
      for (const row of state.ingested) {
        const next = renamed.get((row.values[key] ?? '').trim());
        if (next !== undefined) {
          row.values[key] = next;
        }
      }
    }
    if (renamed.size > 0) {
      changed = true;
    }
    return renamed;
  };
  const areas = follow(state.areaValues, c.areas, state.roles.area);
  state.areaValues = state.areaValues.map((v) => areas.get(v) ?? v);
  const programs = follow(state.programValues, c.programs, state.roles.program);
  state.programValues = state.programValues.map((v) => programs.get(v) ?? v);
  const statuses = follow(statusNames(state.statuses), c.statuses, state.roles.status);
  state.statuses = state.statuses.map((s) => ({ ...s, name: statuses.get(s.name) ?? s.name }));
  demoAnnotationIds.forEach((id, i) => {
    const annotation = state.annotations.find((a) => a.id === id);
    const [from, next] = c.annotationLabels[i];
    if (annotation && annotation.label === from) {
      annotation.label = next;
      changed = true;
    }
  });
  demoEventIds.forEach((id, i) => {
    const event = state.events.find((e) => e.id === id);
    const [from, next] = c.eventLabels[i];
    if (event && event.label === from) {
      event.label = next;
      changed = true;
    }
  });
  if (!changed && !starterFollowed) {
    return true;
  }
  // The demo is as untouched as before: following the language is not a
  // change of the user's.
  const pristine = changeCount === demoBaseline;
  const message = workMessage;
  markDirty();
  if (pristine) {
    demoBaseline = changeCount;
    if (message === 'demo-loaded' || message === 'demo-loaded-plan') {
      setWorkMessage(message);
    }
  }
  return true;
}

// Reset demo (FR-56): after the unsaved-changes confirmation (asked only when
// the demo was changed), the session is discarded and the pristine demo is
// loaded in one step.
export async function resetDemo(): Promise<boolean> {
  if (!demoLoaded || demoId === null) {
    return false;
  }
  if (changeCount !== demoBaseline && !window.confirm(strings(state.prefs.lang).demoResetConfirm)) {
    return false;
  }
  return loadDemo(demoId, { confirmed: true });
}
