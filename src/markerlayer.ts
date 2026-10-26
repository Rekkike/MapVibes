// Marker layer (FR-5): renders placed markers over the map stage in stage
// coordinates, so markers keep a constant on-screen size at every zoom level,
// and handles selecting, moving (by dragging), and removing (Delete key).

import type { PlacedMarker } from './markers';
import { imageToScreen, screenToImage, type Point, type Viewport } from './viewport';

export interface MarkerLayerHooks {
  viewport(): Viewport;
  stagePoint(clientX: number, clientY: number): Point;
  rowId(marker: PlacedMarker): string;
  markerLabel(marker: PlacedMarker): string;
  onSelect(rowId: string | null): void;
  onMove(rowId: string, position: Point): void;
  onRemove(rowId: string): void;
}

export class MarkerLayer {
  private drag: { pointerId: number; rowId: string; offset: Point } | null = null;

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
    for (const marker of markers) {
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
      node.className = `marker marker-${marker.colour}`;
      node.classList.toggle('selected', id === selectedId);
      node.setAttribute('aria-pressed', id === selectedId ? 'true' : 'false');
      node.dataset.number = String(marker.number);
      node.dataset.colour = marker.colour;
      node.textContent = String(marker.number);
      node.setAttribute('aria-label', this.hooks.markerLabel(marker));
      node.title = this.hooks.markerLabel(marker);
      node.style.left = `${screen.x}px`;
      node.style.top = `${screen.y}px`;
    }
    existing.forEach((node) => node.remove());
  }

  private wire(): void {
    this.layer.addEventListener('pointerdown', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      if (!node || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const id = node.dataset.rowId ?? '';
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
    this.layer.addEventListener('pointerup', end);
    this.layer.addEventListener('pointercancel', end);
    this.layer.addEventListener('keydown', (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>('.marker');
      if (!node) return;
      const id = node.dataset.rowId ?? '';
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        this.hooks.onRemove(id);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.hooks.onSelect(id);
      }
    });
  }
}
