// Map view (FR-4): background image, zoom by wheel and controls, pan by
// dragging, fit-view and reset. Viewport arithmetic lives in viewport.ts.

import {
  BUTTON_ZOOM_FACTOR,
  fitView,
  IDENTITY,
  panBy,
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

  constructor(
    private readonly stage: HTMLElement,
    private readonly content: HTMLElement,
    private readonly image: HTMLImageElement,
    private readonly hooks: MapViewHooks,
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

  // Loads any image source (a data URL from a file or a rendered PDF page)
  // and makes it the background once its intrinsic size is known.
  setBackgroundSource(src: string): Promise<void> {
    return new Promise((resolve) => {
      const probe = this.image;
      const done = (ok: boolean) => {
        probe.removeEventListener('load', onLoad);
        probe.removeEventListener('error', onError);
        if (ok) {
          this.background = { src, width: probe.naturalWidth, height: probe.naturalHeight };
          this.pendingFit = true;
          this.fit();
          this.hooks.onBackgroundChanged();
        } else {
          this.hooks.onError('unreadable');
          if (this.background) probe.src = this.background.src;
          else probe.removeAttribute('src');
        }
        this.render();
        resolve();
      };
      const onLoad = () => done(probe.naturalWidth > 0 && probe.naturalHeight > 0);
      const onError = () => done(false);
      probe.addEventListener('load', onLoad);
      probe.addEventListener('error', onError);
      probe.src = src;
    });
  }

  private setViewport(v: Viewport): void {
    this.viewport = v;
    this.render();
    this.hooks.onViewportChanged();
  }

  zoomBy(factor: number, anchor?: Point): void {
    if (!this.background) return;
    const size = this.stageSize();
    this.setViewport(zoomAt(this.viewport, factor, anchor ?? { x: size.width / 2, y: size.height / 2 }));
  }

  fit(): void {
    if (!this.background) return;
    const size = this.stageSize();
    if (size.width <= 0 || size.height <= 0) {
      this.pendingFit = true;
      return;
    }
    this.pendingFit = false;
    this.setViewport(fitView(this.background, size));
  }

  reset(): void {
    if (!this.background) return;
    this.setViewport(resetView(this.background, this.stageSize()));
  }

  // Called when the map segment becomes visible: a background loaded while
  // the stage had no layout size is fitted now.
  shown(): void {
    if (this.pendingFit) this.fit();
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
      if (!this.background || e.button !== 0) return;
      if ((e.target as HTMLElement).closest('.marker, .map-overlay-control')) return;
      this.pan = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
      this.stage.classList.add('panning');
      try {
        this.stage.setPointerCapture?.(e.pointerId);
      } catch {
        // Pointer capture is an enhancement only.
      }
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      const dx = e.clientX - this.pan.last.x;
      const dy = e.clientY - this.pan.last.y;
      this.pan.last = { x: e.clientX, y: e.clientY };
      if (dx !== 0 || dy !== 0) this.setViewport(panBy(this.viewport, dx, dy));
    });
    const endPan = (e: PointerEvent) => {
      if (!this.pan || e.pointerId !== this.pan.pointerId) return;
      this.pan = null;
      this.stage.classList.remove('panning');
    };
    this.stage.addEventListener('pointerup', endPan);
    this.stage.addEventListener('pointercancel', endPan);
  }
}
