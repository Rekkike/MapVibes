// Map view (FR-4, FR-36): background image, zoom by wheel, controls, and
// touch pinch, pan by dragging, fit-view and reset. The Map and the
// Presentation stages are both map views, so their zoom and pan are the same.
// Viewport arithmetic lives in viewport.ts.

import {
  BUTTON_ZOOM_FACTOR,
  fitView,
  IDENTITY,
  panBy,
  pinchStep,
  resetView,
  wheelZoomFactor,
  zoomAt,
  type Point,
  type Size,
  type Viewport,
} from './viewport';

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'];

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  return IMAGE_EXTENSIONS.includes(ext);
}

// How long the stage keeps its easing class after a zoom by wheel or
// control, a fit, or a reset; slightly longer than the CSS transition.
export const EASE_MS = 300;

export interface Background {
  src: string;
  width: number;
  height: number;
}

export interface MapViewHooks {
  onError(kind: 'unsupported' | 'unreadable'): void;
  onBackgroundChanged(): void;
  onViewportChanged(): void;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export class MapView {
  viewport: Viewport = { ...IDENTITY };
  background: Background | null = null;
  private pendingFit = false;
  private pan: { pointerId: number; last: Point } | null = null;
  // The pointers down on the stage (client coordinates), and the two that
  // make a pinch while it lasts.
  private pointers = new Map<number, Point>();
  private pinch: [number, number] | null = null;
  private easeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly stage: HTMLElement,
    private readonly content: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly hooks: MapViewHooks,
    // On a view-only stage, a press on a marker may pan and pinch too.
    private readonly options: { panOverMarkers?: boolean } = {},
  ) {
    this.wire();
    this.render();
  }

  stageSize(): Size {
    const r = this.stage.getBoundingClientRect();
    const borderX = this.stage.offsetWidth > 0 ? this.stage.offsetWidth - this.stage.clientWidth : 0;
    const borderY = this.stage.offsetHeight > 0 ? this.stage.offsetHeight - this.stage.clientHeight : 0;
    return { width: r.width - borderX, height: r.height - borderY };
  }

  // Stage coordinates are relative to the stage's padding box, where the
  // background content and the marker layer are positioned.
  stagePoint(clientX: number, clientY: number): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: clientX - r.left - this.stage.clientLeft, y: clientY - r.top - this.stage.clientTop };
  }

  async loadImageFile(file: File): Promise<void> {
    if (!isImageFile(file)) {
      this.hooks.onError('unsupported');
      return;
    }
    let src: string;
    try {
      src = await readAsDataUrl(file);
    } catch {
      this.hooks.onError('unreadable');
      return;
    }
    await this.setBackgroundSource(src);
  }

  // Loads any image source (a data URL from a file, a rendered PDF page, or a
  // work-state file) and makes it the background once its intrinsic size is
  // known. The view is fitted, unless a saved viewport is to be restored.
  setBackgroundSource(src: string, restoreViewport?: Viewport): Promise<boolean> {
    return new Promise((resolve) => {
      const probe = this.image;
      const done = (ok: boolean) => {
        probe.removeEventListener('load', onLoad);
        probe.removeEventListener('error', onError);
        if (ok) {
          this.background = { src, width: probe.naturalWidth, height: probe.naturalHeight };
          if (restoreViewport) {
            this.pendingFit = false;
            this.setViewport({ ...restoreViewport });
          } else {
            this.pendingFit = true;
            this.fit(false);
          }
          this.hooks.onBackgroundChanged();
        } else {
          this.hooks.onError('unreadable');
          if (this.background) probe.src = this.background.src;
          else probe.removeAttribute('src');
        }
        this.render();
        resolve(ok);
      };
      const onLoad = () => done(probe.naturalWidth > 0 && probe.naturalHeight > 0);
      const onError = () => done(false);
      probe.addEventListener('load', onLoad);
      probe.addEventListener('error', onError);
      probe.src = src;
    });
  }

  // Removes the background (for example when an opened work-state file has
  // none) and sets the given view.
  clearBackground(viewport: Viewport): void {
    this.background = null;
    this.pendingFit = false;
    this.image.removeAttribute('src');
    this.setViewport({ ...viewport });
    this.hooks.onBackgroundChanged();
  }

  private setViewport(v: Viewport): void {
    this.viewport = v;
    this.render();
    this.hooks.onViewportChanged();
  }

  zoomBy(factor: number, anchor?: Point): void {
    if (!this.background) return;
    const size = this.stageSize();
    this.ease();
    this.setViewport(zoomAt(this.viewport, factor, anchor ?? { x: size.width / 2, y: size.height / 2 }));
  }

  fit(animate = true): void {
    if (!this.background) return;
    const size = this.stageSize();
    if (size.width <= 0 || size.height <= 0) {
      this.pendingFit = true;
      return;
    }
    this.pendingFit = false;
    if (animate) this.ease();
    this.setViewport(fitView(this.background, size));
  }

  reset(): void {
    if (!this.background) return;
    this.ease();
    this.setViewport(resetView(this.background, this.stageSize()));
  }

  // Smooth motion (FR-36): the stylesheet eases the background and the
  // markers into place while the class is set.
  private ease(): void {
    this.stage.classList.add('easing');
    if (this.easeTimer !== null) clearTimeout(this.easeTimer);
    this.easeTimer = setTimeout(() => this.stopEasing(), EASE_MS);
  }

  // Dragging and pinching follow the pointer directly.
  private stopEasing(): void {
    if (this.easeTimer !== null) clearTimeout(this.easeTimer);
    this.easeTimer = null;
    this.stage.classList.remove('easing');
  }

  // Called when the map segment becomes visible: a background loaded while
  // the stage had no layout size is fitted now.
  shown(): void {
    if (this.pendingFit) this.fit(false);
    else this.render();
  }

  render(): void {
    const has = this.background !== null;
    this.stage.dataset.hasBackground = has ? 'true' : 'false';
    this.content.classList.toggle('hidden', !has);
    if (this.background) {
      this.image.width = this.background.width;
      this.image.height = this.background.height;
    }
    const { scale, x, y } = this.viewport;
    this.content.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    this.stage.dataset.scale = String(scale);
  }

  private wire(): void {
    this.stage.addEventListener(
      'wheel',
      (e) => {
        if (!this.background) return;
        e.preventDefault();
        this.zoomBy(wheelZoomFactor(e.deltaY), this.stagePoint(e.clientX, e.clientY));
      },
      { passive: false },
    );
    this.stage.addEventListener('pointerdown', (e) => {
      this.stopEasing();
      if (!this.background || e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.map-overlay-control')) return;
      const onMarker = (e.target as HTMLElement).closest('.marker') !== null;
      if (onMarker && !this.options.panOverMarkers) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // A press on a marker is not captured, so that its release still
      // reaches the marker when it is a tap.
      if (!onMarker) {
        try {
          this.stage.setPointerCapture?.(e.pointerId);
        } catch {
          // Pointer capture is an enhancement only.
        }
      }
      if (this.pointers.size >= 2 && this.pinch === null) {
        // A second finger turns the pan into a pinch.
        const [a, b] = [...this.pointers.keys()];
        this.pinch = [a, b];
        this.pan = null;
        this.stage.classList.remove('panning');
        this.stage.classList.add('pinching');
        return;
      }
      if (this.pinch === null) {
        this.pan = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
        this.stage.classList.add('panning');
      }
    });
    this.stage.addEventListener('pointermove', (e) => {
      const previous = this.pointers.get(e.pointerId);
      if (previous) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && previous && this.pinch.includes(e.pointerId)) {
        const [a, b] = this.pinch;
        const other = this.pointers.get(e.pointerId === a ? b : a)!;
        const stage = (p: Point) => this.stagePoint(p.x, p.y);
        const from: [Point, Point] = [stage(previous), stage(other)];
        const to: [Point, Point] = [stage({ x: e.clientX, y: e.clientY }), stage(other)];
        this.setViewport(pinchStep(this.viewport, from, to));
        return;
      }
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      const dx = e.clientX - this.pan.last.x;
      const dy = e.clientY - this.pan.last.y;
      this.pan.last = { x: e.clientX, y: e.clientY };
      if (dx !== 0 || dy !== 0) this.setViewport(panBy(this.viewport, dx, dy));
    });
    const endPan = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch?.includes(e.pointerId)) {
        this.pinch = null;
        this.stage.classList.remove('pinching');
        // The finger that stays down goes on panning.
        const [rest] = [...this.pointers.entries()];
        if (rest) {
          this.pan = { pointerId: rest[0], last: { ...rest[1] } };
          this.stage.classList.add('panning');
          return;
        }
      }
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      this.pan = null;
      this.stage.classList.remove('panning');
    };
    this.stage.addEventListener('pointerup', endPan);
    this.stage.addEventListener('pointercancel', endPan);
  }
}
