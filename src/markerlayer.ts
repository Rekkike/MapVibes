// Marker layer (FR-5): renders placed markers over the map stage in stage
// coordinates, so markers keep a constant on-screen size at every zoom level,
// and handles selecting, moving (by dragging), and removing (Delete key).

import type { PlacedMarker } from './markers';
import { drawSymbol, symbolClasses } from './symbols';
import { imageToScreen, screenToImage, type Point, type Viewport } from './viewport';

export interface MarkerLayerHooks {
  // False for the presentation stage: markers can be selected but never
  // moved or removed there.
  editable: boolean;
  viewport(): Viewport;
  stagePoint(clientX: number, clientY: number): Point;
  rowId(marker: PlacedMarker): string;
  markerLabel(marker: PlacedMarker): string;
  onSelect(rowId: string | null): void;
  isExcluded?(marker: PlacedMarker): boolean;
  onHover?(rowId: string | null): void;
  symbolSource?(marker: PlacedMarker): string;
  isHighlighted?(marker: PlacedMarker): boolean;
  onMove(rowId: string, position: Point): void;
  onRemove(rowId: string): void;
}

// How far, in pixels, a tap may move and still select its marker.
const TAP_SLOP = 6;

export class MarkerLayer {
  private drag: { pointerId: number; rowId: string; offset: Point } | null = null;
  // On the presentation stage, a marker is selected by a tap: a press and
  // release without movement and without a second finger. A press on a
  // marker that moves pans the stage, and a second finger makes a pinch
  // (FR-36), as anywhere else on the stage.
  private tap: { pointerId: number; rowId: string; x: number; y: number } | null = null;

  constructor(
    private readonly layer: HTMLElement,
    private readonly hooks: MarkerLayerHooks,
  ) {
    this.wire();
  }

  render(markers: PlacedMarker[], selectedId: string | null): void {
    const v = this.hooks.viewport();
    const existing = new Map<string, HTMLElement>();
    this.layer.querySelectorAll<HTMLElement>('.marker').forEach((m) => existing.set(m.dataset.rowId ?? '', m));
    markers.forEach((marker, index) => {
      const id = this.hooks.rowId(marker);
      let node = existing.get(id);
      existing.delete(id);
      if (!node) {
        node = document.createElement('div');
        node.dataset.rowId = id;
        node.tabIndex = 0;
        node.setAttribute('role', 'button');
        this.layer.appendChild(node);
      }
      const screen = imageToScreen(v, marker.position);
      node.className = `marker marker-${marker.colour} ${symbolClasses(marker.shape)}`;
      if (this.hooks.isExcluded?.(marker)) node.classList.add('marker-excluded');
      if (this.hooks.isHighlighted?.(marker)) node.classList.add('highlighted');
      node.classList.toggle('selected', id === selectedId);
      node.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
      node.dataset.number = marker.label;
      node.dataset.colour = marker.colour;
      node.dataset.shape = marker.shape;
      const source = this.hooks.symbolSource?.(marker);
      if (source) node.dataset.symbolSource = source;
      if (node.dataset.drawn !== `${marker.shape}:${marker.label}`) {
        drawSymbol(node, marker.shape, marker.label);
        node.dataset.drawn = `${marker.shape}:${marker.label}`;
      }
      node.setAttribute('aria-label', this.hooks.markerLabel(marker));
      node.title = this.hooks.markerLabel(marker);
      node.style.left = `${screen.x}px`;
      node.style.top = `${screen.y}px`;
      // Document order follows the numbering (and so does keyboard order);
      // nodes are moved only when out of place, so focus is kept.
      const at = this.layer.children[index];
      if (at !== node) this.layer.insertBefore(node, at ?? null);
    });
    existing.forEach((node) => node.remove());
  }

  private wire(): void {
    this.layer.addEventListener('pointerdown', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      if (!node || e.button !== 0) return;
      const id = node.dataset.rowId ?? '';
      if (!this.hooks.editable) {
        // The press goes on to the stage, which may pan or pinch.
        this.tap = this.tap ? null : { pointerId: e.pointerId, rowId: id, x: e.clientX, y: e.clientY };
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const pointer = this.hooks.stagePoint(e.clientX, e.clientY);
      const centre = { x: parseFloat(node.style.left) || 0, y: parseFloat(node.style.top) || 0 };
      this.drag = { pointerId: e.pointerId, rowId: id, offset: { x: pointer.x - centre.x, y: pointer.y - centre.y } };
      node.classList.add('dragging');
      try {
        node.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture is an enhancement only.
      }
      node.focus({ preventScroll: true });
      this.hooks.onSelect(id);
    });
    this.layer.addEventListener('pointermove', (e) => {
      if (!this.drag || e.pointerId !== this.drag.pointerId) return;
      const pointer = this.hooks.stagePoint(e.clientX, e.clientY);
      const screen = { x: pointer.x - this.drag.offset.x, y: pointer.y - this.drag.offset.y };
      this.hooks.onMove(this.drag.rowId, screenToImage(this.hooks.viewport(), screen));
    });
    const end = (e: PointerEvent) => {
      if (!this.drag || e.pointerId !== this.drag.pointerId) return;
      this.layer.querySelector(`.marker.dragging`)?.classList.remove('dragging');
      this.drag = null;
    };
    this.layer.addEventListener('mouseover', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      if (node) this.hooks.onHover?.(node.dataset.rowId ?? null);
    });
    this.layer.addEventListener('mouseout', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      const to = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (node && !node.contains(to)) this.hooks.onHover?.(null);
    });
    this.layer.addEventListener('pointerup', end);
    this.layer.addEventListener('pointercancel', end);
    if (!this.hooks.editable) this.wireTap();
    this.layer.addEventListener('keydown', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      if (!node) return;
      const id = node.dataset.rowId ?? '';
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.hooks.editable) {
        e.preventDefault();
        this.hooks.onRemove(id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.hooks.onSelect(id);
      }
    });
  }

  private wireTap(): void {
    const stage = this.layer.parentElement;
    if (!stage) return;
    stage.addEventListener(
      'pointerdown',
      (e) => {
        if (this.tap && e.pointerId !== this.tap.pointerId) this.tap = null;
      },
      true,
    );
    stage.addEventListener('pointermove', (e) => {
      if (this.tap && e.pointerId === this.tap.pointerId && Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) > TAP_SLOP) this.tap = null;
    });
    stage.addEventListener('pointerup', (e) => {
      const tap = this.tap;
      if (!tap || e.pointerId !== tap.pointerId) return;
      this.tap = null;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) <= TAP_SLOP) this.hooks.onSelect(tap.rowId);
    });
    stage.addEventListener('pointercancel', () => (this.tap = null));
  }
}
