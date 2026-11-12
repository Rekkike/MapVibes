// The annotations: the layers of both stages, the inspector, the
// visibility list, and the drawing toolbar.
import { COLOURS, type RowColour, type RowData } from './dataset';
import { strings, type Strings } from './i18n';
import type { Point } from './viewport';
import {
  formatArea,
  LINE_STYLES,
  OUTLINES,
  trueArea,
  type Annotation,
  type AnnotationKind,
  type AnnotationStyle,
  type LineStyle,
  type Outline,
} from './annotations';
import { AnnotationLayer, DrawingTools, type DrawingTool } from './annotationlayer';
import { colourLabel, narrowApplication } from './main';
import { el, fill, rowById, rowId, state } from './appstate';
import { markDirty } from './workfile';
import { itemLabel, mapView, renderMapItems } from './mapstage';
import { presentationView } from './presentationstage';
import { numbered } from './listpanel';

// The annotation layer (FR-47): drawn and edited on the Map stage, shown
// view-only on the Presentation stage.
let mapAnnotations: AnnotationLayer | null = null;
export function setMapAnnotations(value: AnnotationLayer | null): void {
  mapAnnotations = value;
}
let presentationAnnotations: AnnotationLayer | null = null;
export function setPresentationAnnotations(value: AnnotationLayer | null): void {
  presentationAnnotations = value;
}
export let drawingTools: DrawingTools | null = null;
export function setDrawingTools(value: DrawingTools | null): void {
  drawingTools = value;
}
let annotationDraft: { draft: Annotation | null; cursor: Point | null } = { draft: null, cursor: null };
export function setAnnotationDraft(value: { draft: Annotation | null; cursor: Point | null }): void {
  annotationDraft = value;
}

// Linkage (FR-48): a linked annotation is its item's footprint and follows
// the item's visibility (removed from the list or switched off for the
// presentation, it goes too); a free annotation has its own toggle.
export function linkedRow(a: Annotation): RowData | undefined {
  return state.annotationLinks.get(a.id);
}

export function annotationShown(a: Annotation): boolean {
  const row = linkedRow(a);
  if (row) {
    return state.rows.includes(row) && !state.excluded.has(row);
  }
  return !state.hiddenAnnotations.has(a.id);
}

// The footprints of the item selected in a stage highlight with it.
function footprintsOf(id: string | null): Set<string> {
  const row = id ? rowById(id) : undefined;
  return new Set(row ? state.annotations.filter((a) => linkedRow(a) === row).map((a) => a.id) : []);
}

export function renderAnnotations(): void {
  const mapBg = mapView?.background ?? null;
  const selected = state.annotations.find((a) => a.id === state.selectedAnnotation) ?? null;
  // In the Map segment every annotation stays editable; those absent from
  // the presentation are shown faded, as switched-off markers are.
  mapAnnotations?.render(state.annotations, mapBg, {
    draft: annotationDraft.draft,
    cursor: annotationDraft.cursor,
    selectedId: state.selectedAnnotation,
    highlighted: footprintsOf(state.selectedMarker ?? state.detailsId),
    faded: new Set(state.annotations.filter((a) => !annotationShown(a)).map((a) => a.id)),
    handlesFor: drawingTools?.tool === 'select' ? selected : null,
  });
  renderPresentationAnnotations();
}

// The presentation stage's annotations, also on its own background and view
// changes (in the exported viewer the background arrives after the first
// rendering).
export function renderPresentationAnnotations(): void {
  presentationAnnotations?.render(
    state.annotations.filter((a) => annotationShown(a)),
    presentationView?.background ?? null,
    { highlighted: footprintsOf(state.presentationSelected) },
  );
}

export function createAnnotation(annotation: Annotation): void {
  state.annotations = [...state.annotations, annotation];
  state.selectedAnnotation = annotation.id;
  setDrawingTool('select');
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

export function replaceAnnotation(annotation: Annotation): void {
  state.annotations = state.annotations.map((a) => (a.id === annotation.id ? annotation : a));
}

export function selectAnnotation(id: string | null): void {
  state.selectedAnnotation = id;
  renderAnnotations();
  renderAnnotationInspector();
  renderAnnotationToolbar();
}

function deleteAnnotation(id: string): void {
  state.annotations = state.annotations.filter((a) => a.id !== id);
  state.annotationLinks.delete(id);
  state.hiddenAnnotations.delete(id);
  if (state.selectedAnnotation === id) {
    state.selectedAnnotation = null;
  }
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function updateSelectedAnnotation(change: Partial<Annotation>): void {
  const a = state.annotations.find((x) => x.id === state.selectedAnnotation);
  if (!a) {
    return;
  }
  replaceAnnotation({ ...a, ...change });
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function setAnnotationLink(id: string, row: RowData | null): void {
  if (row) {
    state.annotationLinks.set(id, row);
    state.hiddenAnnotations.delete(id);
  } else {
    state.annotationLinks.delete(id);
  }
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function setAnnotationHidden(id: string, hidden: boolean): void {
  if (hidden) {
    state.hiddenAnnotations.add(id);
  } else {
    state.hiddenAnnotations.delete(id);
  }
  markDirty();
  renderMapItems();
}

export function areaLocale(): string {
  return state.prefs.lang === 'sv' ? 'sv-SE' : 'en-GB';
}

function kindName(kind: AnnotationKind, t: Strings): string {
  return { rectangle: t.kindRectangle, circle: t.kindCircle, polygon: t.kindPolygon, line: t.kindLine }[kind];
}

// The name of an annotation in lists: its label, else its kind and position.
export function annotationName(a: Annotation, t: Strings): string {
  if (a.label.trim() !== '') {
    return a.label.trim();
  }
  const sameKind = state.annotations.filter((x) => x.kind === a.kind);
  return `${kindName(a.kind, t)} ${sameKind.indexOf(a) + 1}`;
}

// The inspector as a bottom sheet over the stage in the narrow layout
// (FR-47 as amended, FR-72): a data-state of open or closed, inert
// while closed, focus moved into the sheet on opening and returned on
// closing; the stage never moves under a selection, because the sheet
// overlays it (the details-sheet pattern of FR-74). Above the threshold the
// inspector keeps its place in the flow, hidden while nothing is selected.
let annotationInspectorReturnFocus: HTMLElement | null = null;

function setAnnotationInspectorSheet(open: boolean): void {
  const inspector = el('annotation-inspector');
  const was = inspector.dataset.state === 'open';
  inspector.classList.remove('hidden');
  inspector.dataset.state = open ? 'open' : 'closed';
  inspector.inert = !open;
  if (open) {
    inspector.removeAttribute('inert');
  } else {
    inspector.setAttribute('inert', '');
  }
  inspector.tabIndex = -1;
  if (open && !was) {
    annotationInspectorReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inspector.focus({ preventScroll: true });
  } else if (!open && was) {
    const target = annotationInspectorReturnFocus;
    annotationInspectorReturnFocus = null;
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  }
}

// The inspector of the selected annotation (FR-47 to FR-49): its label, the
// item it is the footprint of, its area where it can be measured honestly,
// and its deletion.
export function renderAnnotationInspector(): void {
  const t = strings(state.prefs.lang);
  const inspector = el('annotation-inspector');
  const a = state.annotations.find((x) => x.id === state.selectedAnnotation) ?? null;
  if (narrowApplication()) {
    setAnnotationInspectorSheet(a !== null);
  } else {
    // Above the threshold (or leaving the narrow layout): the inspector
    // keeps its place in the flow, and nothing of the sheet remains.
    inspector.classList.toggle('hidden', !a);
    delete inspector.dataset.state;
    inspector.inert = false;
    inspector.removeAttribute('inert');
    inspector.removeAttribute('tabindex');
    annotationInspectorReturnFocus = null;
  }
  if (!a) {
    return;
  }
  inspector.dataset.annotationId = a.id;
  el('annotation-inspector-heading').textContent = annotationName(a, t);
  el('annotation-label-text').textContent = t.annotationLabel;
  const label = el<HTMLInputElement>('annotation-label');
  if (document.activeElement !== label) {
    label.value = a.label;
  }
  el('annotation-link-text').textContent = t.annotationLink;
  const link = el<HTMLSelectElement>('annotation-link');
  link.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t.annotationNotLinked;
  link.appendChild(none);
  for (const { row, label: number } of numbered()) {
    const opt = document.createElement('option');
    opt.value = rowId(row);
    opt.textContent = `${number}. ${itemLabel(row, number)}`;
    link.appendChild(opt);
  }
  const row = linkedRow(a);
  link.value = row && state.rows.includes(row) ? rowId(row) : '';
  el('annotation-delete').textContent = t.annotationDelete;
  el('annotation-inspector-close').textContent = t.close;
  const area = el('annotation-area');
  if (a.kind === 'line') {
    area.textContent = '';
  } else {
    const squareMetres = trueArea(a, mapView?.background?.projection);
    area.textContent = squareMetres === null ? t.annotationAreaNoScale : fill(t.annotationArea, { area: formatArea(squareMetres, areaLocale()) });
  }
}

// The free annotations' toggles beside the presentation stage (FR-48).
export function renderAnnotationVisibility(): void {
  const t = strings(state.prefs.lang);
  const list = el('annotation-visibility-list');
  list.innerHTML = '';
  const free = state.viewOnly ? [] : state.annotations.filter((a) => !linkedRow(a));
  for (const a of free) {
    const li = document.createElement('li');
    li.className = 'visibility-item';
    li.dataset.annotationId = a.id;
    const label = document.createElement('label');
    label.className = 'visibility-control';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'annotation-toggle';
    toggle.dataset.annotationId = a.id;
    toggle.checked = !state.hiddenAnnotations.has(a.id);
    const name = annotationName(a, t);
    toggle.setAttribute('aria-label', `${t.annotationShown}: ${name}`);
    toggle.addEventListener('change', () => setAnnotationHidden(a.id, !toggle.checked));
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch marker-${a.colour} marker-shape-square`;
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'placement-label';
    text.textContent = name;
    label.append(toggle, swatch, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  el('annotation-visibility-heading').textContent = t.annotationVisibility;
  el('annotation-visibility-heading').classList.toggle('hidden', free.length === 0);
}

export function setDrawingTool(tool: DrawingTool): void {
  drawingTools?.setTool(tool);
  annotationDraft = { draft: null, cursor: null };
  renderAnnotationToolbar();
  renderAnnotations();
}

// The style controls set the style of what is drawn next and, while an
// annotation is selected, its style too.
function setAnnotationStyle(change: Partial<AnnotationStyle>): void {
  state.annotationStyle = { ...state.annotationStyle, ...change };
  if (state.selectedAnnotation) {
    updateSelectedAnnotation(change);
  }
  renderAnnotationToolbar();
}

export function renderAnnotationToolbar(): void {
  const t = strings(state.prefs.lang);
  const has = mapView?.background !== null && mapView?.background !== undefined;
  const tool = drawingTools?.tool ?? 'select';
  el('annotation-heading').textContent = t.annotationHeading;
  const toolNames: Record<DrawingTool, string> = {
    select: t.toolSelect,
    rectangle: t.toolRectangle,
    circle: t.toolCircle,
    polygon: t.toolPolygon,
    line: t.toolLine,
  };
  document.querySelectorAll<HTMLButtonElement>('#annotation-tools .annotation-tool').forEach((button) => {
    const name = button.dataset.tool as DrawingTool;
    button.textContent = toolNames[name];
    button.setAttribute('aria-pressed', name === tool ? 'true' : 'false');
    button.disabled = !has && name !== 'select';
  });
  el('annotation-colour-text').textContent = t.annotationColour;
  el('annotation-fill-text').textContent = t.annotationFill;
  el('annotation-outline-text').textContent = t.annotationOutline;
  el('annotation-line-text').textContent = t.annotationLine;
  const colour = el<HTMLSelectElement>('annotation-colour');
  if (colour.options.length !== COLOURS.length) {
    colour.innerHTML = '';
    for (const c of COLOURS) {
      const opt = document.createElement('option');
      opt.value = c;
      colour.appendChild(opt);
    }
  }
  for (const opt of colour.options) {
    opt.textContent = colourLabel(opt.value as RowColour);
  }
  // While an annotation is selected, the controls show its style.
  const style = state.annotations.find((a) => a.id === state.selectedAnnotation) ?? state.annotationStyle;
  colour.value = style.colour;
  const fillInput = el<HTMLInputElement>('annotation-fill');
  fillInput.value = String(Math.round(style.fillOpacity * 100));
  fillInput.setAttribute('aria-valuetext', `${fillInput.value} %`);
  el('annotation-fill-value').textContent = `${fillInput.value} %`;
  const outline = el<HTMLSelectElement>('annotation-outline');
  const outlineNames: Record<Outline, string> = { black: t.outlineBlack, white: t.outlineWhite };
  for (const opt of outline.options) {
    opt.textContent = outlineNames[opt.value as Outline];
  }
  outline.value = style.outline;
  const line = el<HTMLSelectElement>('annotation-line-style');
  const lineNames: Record<LineStyle, string> = { solid: t.lineSolid, dotted: t.lineDotted, dashed: t.lineDashed };
  for (const opt of line.options) {
    opt.textContent = lineNames[opt.value as LineStyle];
  }
  line.value = style.lineStyle;
  const hints: Record<DrawingTool, string> = {
    select: t.hintSelect,
    rectangle: t.hintRectangle,
    circle: t.hintCircle,
    polygon: t.hintPolygon,
    line: t.hintLine,
  };
  el('annotation-hint').textContent = has ? hints[tool] : t.hintNoBackground;
  // While a drawing is in progress, the hint row carries Done and Cancel
  // (FR-47 as amended); the Straight toggle beside the tools
  // carries its state.
  const drawing = drawingTools?.drawing ?? false;
  el('annotation-done').textContent = t.hintDone;
  el('annotation-cancel').textContent = t.hintCancel;
  el('annotation-done').classList.toggle('hidden', !drawing);
  el('annotation-cancel').classList.toggle('hidden', !drawing);
  const straight = el<HTMLButtonElement>('annotation-straight');
  straight.textContent = t.toolStraight;
  straight.setAttribute('aria-label', t.toolStraight);
  straight.setAttribute('aria-pressed', drawingTools?.straight ? 'true' : 'false');
  straight.disabled = !has;
}

export function wireAnnotationToolbar(): void {
  document.querySelectorAll<HTMLButtonElement>('#annotation-tools .annotation-tool').forEach((button) => {
    button.addEventListener('click', () => setDrawingTool(button.dataset.tool as DrawingTool));
  });
  // The Straight toggle (FR-47 as amended): one transient state
  // flag on the drawing tools, reset on tool change, never saved.
  el<HTMLButtonElement>('annotation-straight').addEventListener('click', () => {
    if (drawingTools) {
      drawingTools.straight = !drawingTools.straight;
    }
    renderAnnotationToolbar();
  });
  // Done and Cancel in the hint row finish or abandon a drawing.
  el('annotation-done').addEventListener('click', () => drawingTools?.finish());
  el('annotation-cancel').addEventListener('click', () => drawingTools?.cancel());
  el<HTMLSelectElement>('annotation-colour').addEventListener('change', (e) =>
    setAnnotationStyle({ colour: (e.target as HTMLSelectElement).value as RowColour }),
  );
  el<HTMLInputElement>('annotation-fill').addEventListener('input', (e) =>
    setAnnotationStyle({ fillOpacity: Number((e.target as HTMLInputElement).value) / 100 }),
  );
  el<HTMLSelectElement>('annotation-outline').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as Outline;
    if (OUTLINES.includes(value)) {
      setAnnotationStyle({ outline: value });
    }
  });
  el<HTMLSelectElement>('annotation-line-style').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as LineStyle;
    if (LINE_STYLES.includes(value)) {
      setAnnotationStyle({ lineStyle: value });
    }
  });
  // Enter finishes a polygon or a line being drawn; Escape cancels it.
  // With an annotation selected (and no text field in use), Delete removes
  // it and Escape deselects it.
  window.addEventListener('keydown', (e) => {
    if (state.segment !== 'map' || !drawingTools) {
      return;
    }
    if (drawingTools.drawing) {
      if (e.key === 'Escape') {
        drawingTools.cancel();
      } else if (e.key === 'Enter') {
        drawingTools.finish();
      }
      return;
    }
    const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
    if (!state.selectedAnnotation || typing) {
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteAnnotation(state.selectedAnnotation);
    } else if (e.key === 'Escape') {
      selectAnnotation(null);
    }
  });
  const label = el<HTMLInputElement>('annotation-label');
  label.addEventListener('input', () => updateSelectedAnnotation({ label: label.value }));
  el<HTMLSelectElement>('annotation-link').addEventListener('change', (e) => {
    const id = state.selectedAnnotation;
    if (!id) {
      return;
    }
    const value = (e.target as HTMLSelectElement).value;
    setAnnotationLink(id, value === '' ? null : (rowById(value) ?? null));
  });
  el('annotation-delete').addEventListener('click', () => {
    if (state.selectedAnnotation) {
      deleteAnnotation(state.selectedAnnotation);
    }
  });
  el('annotation-inspector-close').addEventListener('click', () => selectAnnotation(null));
  // In the narrow layout, a tap outside the stage and the open inspector
  // sheet closes the sheet (the stage's own taps select and deselect). On
  // the window, so that the test harness removes the listener between
  // mounts, like the other window listeners.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!narrowApplication()) {
        return;
      }
      const inspector = el('annotation-inspector');
      if (inspector.dataset.state !== 'open') {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (inspector.contains(target) || target.closest('#map-stage')) {
        return;
      }
      selectAnnotation(null);
    },
    true,
  );
}
