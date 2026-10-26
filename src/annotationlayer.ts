// Rendering and drawing of annotations (FR-47). Annotations are drawn into an
// SVG layer inside a stage's transformed content, in image coordinates, so
// that they follow zoom, pan, and eased motion exactly as the background
// does; outlines keep their width at every zoom. Labels sit in an HTML layer
// above, like markers, at a constant size. Drawing happens on the Map stage
// only; the Presentation stage shows annotations view-only.

import {
  closesPolygon,
  dashArray,
  distance,
  hits,
  isComplete,
  translate,
  newAnnotationId,
  outlinePoints,
  rectOf,
  type Annotation,
  type AnnotationKind,
  type AnnotationStyle,
} from './annotations';
import { imageToScreen, screenToImage, type Point, type Viewport } from './viewport';

const NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}

// Where an annotation's label sits: just below a shape, centred under it, so
// that it stays clear of the marker of the item a footprint surrounds; on the
// middle segment of a line.
export function labelAnchor(a: Pick<Annotation, 'kind' | 'points'>): Point {
  if (a.kind === 'circle') return { x: a.points[0].x, y: a.points[0].y + distance(a.points[0], a.points[1]) };
  if (a.kind === 'line') {
    const mid = Math.floor((a.points.length - 1) / 2);
    const p = a.points[mid];
    const q = a.points[Math.min(mid + 1, a.points.length - 1)];
    return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  }
  const v = outlinePoints(a);
  const xs = v.map((p) => p.x);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...v.map((p) => p.y)) };
}

export interface RenderOptions {
  selectedId?: string | null;
  highlighted?: ReadonlySet<string>;
  // Annotations shown faded (switched off for the presentation, FR-48).
  faded?: ReadonlySet<string>;
  // The annotation whose vertices get editing handles.
  handlesFor?: Annotation | null;
  // An annotation being drawn, with the pointer's position for its next
  // vertex.
  draft?: Annotation | null;
  cursor?: Point | null;
}

function annotationElement(a: Annotation, classes: string[]): SVGGElement {
  const g = svg('g', {
    class: ['annotation', `annotation-${a.kind}`, `colour-${a.colour}`, `outline-${a.outline}`, `style-${a.lineStyle}`, ...classes].join(' '),
    'data-annotation-id': a.id,
  });
  const common = { 'vector-effect': 'non-scaling-stroke' };
  if (a.kind === 'line') {
    const dash = dashArray(a.lineStyle);
    const extra: Record<string, string> = dash ? { 'stroke-dasharray': dash } : {};
    g.append(
      svg('polyline', { class: 'annotation-casing', points: pointsAttr(a.points), ...common, ...extra }),
      svg('polyline', { class: 'annotation-stroke', points: pointsAttr(a.points), ...common, ...extra }),
    );
    return g;
  }
  const fill = { 'fill-opacity': a.fillOpacity, ...common };
  if (a.kind === 'rectangle') {
    const r = rectOf(a.points[0], a.points[1]);
    g.appendChild(svg('rect', { class: 'annotation-shape', x: r.x, y: r.y, width: r.width, height: r.height, ...fill }));
  } else if (a.kind === 'circle') {
    g.appendChild(svg('circle', { class: 'annotation-shape', cx: a.points[0].x, cy: a.points[0].y, r: distance(a.points[0], a.points[1]), ...fill }));
  } else {
    g.appendChild(svg('polygon', { class: 'annotation-shape', points: pointsAttr(a.points), ...fill }));
  }
  return g;
}

export class AnnotationLayer {
  constructor(
    private readonly layer: SVGSVGElement,
    private readonly labels: HTMLElement,
    private readonly viewport: () => Viewport,
    // The layer of vertex handles; absent where nothing is edited.
    private readonly handles: HTMLElement | null = null,
  ) {}

  render(annotations: Annotation[], size: { width: number; height: number } | null, options: RenderOptions = {}): void {
    this.layer.replaceChildren();
    this.labels.replaceChildren();
    this.handles?.replaceChildren();
    if (!size) {
      this.layer.setAttribute('width', '0');
      this.layer.setAttribute('height', '0');
      return;
    }
    this.layer.setAttribute('width', String(size.width));
    this.layer.setAttribute('height', String(size.height));
    this.layer.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`);
    const v = this.viewport();
    for (const a of annotations) {
      const classes: string[] = [];
      if (options.selectedId === a.id) classes.push('selected');
      if (options.highlighted?.has(a.id)) classes.push('highlighted');
      if (options.faded?.has(a.id)) classes.push('faded');
      this.layer.appendChild(annotationElement(a, classes));
      if (a.label.trim() !== '') {
        const label = document.createElement('div');
        label.className = `annotation-label outline-${a.outline}${a.kind === 'line' ? '' : ' below'}${options.faded?.has(a.id) ? ' faded' : ''}`;
        label.dataset.annotationId = a.id;
        label.textContent = a.label.trim();
        const at = imageToScreen(v, labelAnchor(a));
        label.style.left = `${at.x}px`;
        label.style.top = `${at.y}px`;
        this.labels.appendChild(label);
      }
    }
    const edited = options.handlesFor;
    if (edited && this.handles) {
      edited.points.forEach((p, index) => {
        const handle = document.createElement('span');
        handle.className = 'annotation-handle';
        handle.dataset.index = String(index);
        handle.dataset.annotationId = edited.id;
        const at = imageToScreen(v, p);
        handle.style.left = `${at.x}px`;
        handle.style.top = `${at.y}px`;
        this.handles!.appendChild(handle);
      });
    }
    const draft = options.draft;
    if (draft && draft.points.length > 0) {
      const shown = (draft.kind === 'polygon' || draft.kind === 'line') && options.cursor ? { ...draft, points: [...draft.points, options.cursor] } : draft;
      if (shown.points.length >= 2) {
        // A polygon being drawn shows as an open line until it closes.
        const preview = shown.kind === 'polygon' ? { ...shown, kind: 'line' as AnnotationKind, lineStyle: 'dashed' as const } : shown;
        this.layer.appendChild(annotationElement(preview, ['draft']));
      }
      if (draft.kind === 'polygon') {
        const first = draft.points[0];
        this.layer.appendChild(svg('circle', { class: 'annotation-snap', cx: first.x, cy: first.y, r: 6 / v.scale }));
      }
    }
  }
}

export type DrawingTool = 'select' | AnnotationKind;

export interface DrawingHooks {
  viewport(): Viewport;
  stagePoint(clientX: number, clientY: number): Point;
  hasBackground(): boolean;
  style(): AnnotationStyle;
  // A drawing changed (the draft or the cursor): render again.
  onDraft(draft: Annotation | null, cursor: Point | null): void;
  onCreate(annotation: Annotation): void;
  // Editing with the Select tool (FR-47): the annotations that can be
  // selected (topmost last), the selection, and changes (live while dragging,
  // then final).
  editable(): Annotation[];
  selectedId(): string | null;
  onSelect(id: string | null): void;
  onChange(annotation: Annotation, final: boolean): void;
}

// How near a press must be to an outline or a line, in screen pixels.
const HIT_TOLERANCE = 6;

// The smallest size of a drawn rectangle or circle, and the spacing of
// freehand vertices, in screen pixels.
const MINIMUM_SIZE = 4;
const FREEHAND_SPACING = 8;

// The drawing tools of the Map stage (FR-47): rectangle and circle by
// dragging; polygon and line by pressing at each vertex or by dragging
// freehand. A polygon closes on a press near its first vertex (or Enter); a
// line finishes on a press on its last vertex (or Enter); Escape cancels.
export class DrawingTools {
  tool: DrawingTool = 'select';
  private draft: Annotation | null = null;
  private pressed: number | null = null;
  private cursor: Point | null = null;
  // A move of a whole annotation or of one vertex, while pressed.
  private edit: { pointerId: number; original: Annotation; from: Point; index: number | null; moved: boolean } | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly hooks: DrawingHooks,
  ) {
    stage.addEventListener('pointerdown', (e) => this.down(e));
    stage.addEventListener('pointermove', (e) => this.move(e));
    stage.addEventListener('pointerup', (e) => this.up(e));
    stage.addEventListener('pointercancel', () => this.cancel());
  }

  get drawing(): boolean {
    return this.draft !== null;
  }

  // Whether the stage's own pointer handling (panning) may run: not while a
  // drawing tool is in use, nor for a press on an annotation or a handle.
  allowsPan(e?: PointerEvent): boolean {
    if (this.tool !== 'select') return false;
    if (!e) return true;
    if ((e.target as HTMLElement).closest?.('.annotation-handle')) return false;
    return this.hitAt(this.image(e).image) === null;
  }

  // The topmost annotation under a point (image coordinates).
  private hitAt(p: Point): Annotation | null {
    const tolerance = HIT_TOLERANCE / this.hooks.viewport().scale;
    const list = this.hooks.editable();
    for (let i = list.length - 1; i >= 0; i--) if (hits(list[i], p, tolerance)) return list[i];
    return null;
  }

  setTool(tool: DrawingTool): void {
    this.cancel();
    this.tool = tool;
    this.stage.dataset.tool = tool;
  }

  cancel(): void {
    this.draft = null;
    this.pressed = null;
    this.cursor = null;
    this.hooks.onDraft(null, null);
  }

  // Enter finishes a polygon or a line being drawn.
  finish(): void {
    if (this.draft && (this.draft.kind === 'polygon' || this.draft.kind === 'line')) this.commit();
  }

  private image(e: PointerEvent): { image: Point; screen: Point } {
    const screen = this.hooks.stagePoint(e.clientX, e.clientY);
    return { screen, image: screenToImage(this.hooks.viewport(), screen) };
  }

  private screenOf(p: Point): Point {
    return imageToScreen(this.hooks.viewport(), p);
  }

  private start(kind: AnnotationKind, p: Point): Annotation {
    return { id: newAnnotationId(), kind, points: [p], label: '', ...this.hooks.style() };
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || !this.hooks.hasBackground()) return;
    if (this.tool === 'select') {
      this.selectDown(e);
      return;
    }
    if ((e.target as HTMLElement).closest?.('.marker')) return;
    e.preventDefault();
    const { image, screen } = this.image(e);
    this.pressed = e.pointerId;
    try {
      this.stage.setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is an enhancement only.
    }
    if (this.tool === 'rectangle' || this.tool === 'circle') {
      this.draft = { ...this.start(this.tool, image), points: [image, image] };
    } else if (!this.draft) {
      this.draft = this.start(this.tool, image);
    } else if (this.tool === 'polygon' && closesPolygon(this.draft.points, screen, this.screenOf(this.draft.points[0]))) {
      this.pressed = null;
      this.commit();
      return;
    } else if (this.tool === 'line' && distance(screen, this.screenOf(this.draft.points[this.draft.points.length - 1])) <= 8) {
      this.pressed = null;
      this.commit();
      return;
    } else {
      this.draft = { ...this.draft, points: [...this.draft.points, image] };
    }
    this.cursor = null;
    this.hooks.onDraft(this.draft, null);
  }

  private selectDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest?.('.marker')) return;
    const { image } = this.image(e);
    const handle = (e.target as HTMLElement).closest?.<HTMLElement>('.annotation-handle');
    const selected = this.hooks.editable().find((a) => a.id === this.hooks.selectedId());
    if (handle && selected && handle.dataset.annotationId === selected.id) {
      this.beginEdit(e, selected, image, Number(handle.dataset.index));
      return;
    }
    const hit = this.hitAt(image);
    if (!hit) {
      if (this.hooks.selectedId() !== null) this.hooks.onSelect(null);
      return;
    }
    if (this.hooks.selectedId() !== hit.id) this.hooks.onSelect(hit.id);
    this.beginEdit(e, hit, image, null);
  }

  private beginEdit(e: PointerEvent, original: Annotation, from: Point, index: number | null): void {
    e.preventDefault();
    this.edit = { pointerId: e.pointerId, original, from, index, moved: false };
    try {
      this.stage.setPointerCapture?.(e.pointerId);
    } catch {
      // Pointer capture is an enhancement only.
    }
  }

  // The annotation as edited so far: moved as a whole, or with one vertex
  // moved (a circle's centre moves the whole circle).
  private edited(to: Point): Annotation {
    const { original, from, index } = this.edit!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (index === null || (original.kind === 'circle' && index === 0)) return translate(original, dx, dy);
    return { ...original, points: original.points.map((p, i) => (i === index ? { x: p.x + dx, y: p.y + dy } : { ...p })) };
  }

  private move(e: PointerEvent): void {
    if (this.edit && this.edit.pointerId === e.pointerId) {
      this.edit.moved = true;
      this.hooks.onChange(this.edited(this.image(e).image), false);
      return;
    }
    if (!this.draft) return;
    const { image, screen } = this.image(e);
    if (this.draft.kind === 'rectangle' || this.draft.kind === 'circle') {
      if (this.pressed !== e.pointerId) return;
      this.draft = { ...this.draft, points: [this.draft.points[0], image] };
      this.hooks.onDraft(this.draft, null);
      return;
    }
    if (this.pressed === e.pointerId) {
      // Freehand: a vertex every few pixels while pressed.
      const last = this.draft.points[this.draft.points.length - 1];
      if (distance(screen, this.screenOf(last)) >= FREEHAND_SPACING) this.draft = { ...this.draft, points: [...this.draft.points, image] };
      this.cursor = null;
    } else {
      this.cursor = image;
    }
    this.hooks.onDraft(this.draft, this.cursor);
  }

  private up(e: PointerEvent): void {
    if (this.edit && this.edit.pointerId === e.pointerId) {
      const final = this.edit.moved ? this.edited(this.image(e).image) : null;
      this.edit = null;
      if (final) this.hooks.onChange(final, true);
      return;
    }
    if (this.pressed !== e.pointerId) return;
    this.pressed = null;
    if (this.draft && (this.draft.kind === 'rectangle' || this.draft.kind === 'circle')) this.commit();
  }

  private commit(): void {
    const draft = this.draft;
    this.draft = null;
    this.cursor = null;
    if (draft && isComplete(draft, MINIMUM_SIZE / this.hooks.viewport().scale)) this.hooks.onCreate(draft);
    this.hooks.onDraft(null, null);
  }
}
