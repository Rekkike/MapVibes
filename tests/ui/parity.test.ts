import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, STAGE } from './harness';

// Zoom and pan parity (FR-36): the Presentation stage behaves exactly as the
// Map stage. Every gesture is played on both stages from the same fitted
// view, and the resulting views must be identical.

type Kind = 'map' | 'presentation';

const ids = {
  map: { tab: 'tab-map', stage: 'map-stage', content: 'map-content', zoomIn: 'map-zoom-in', zoomOut: 'map-zoom-out', fit: 'map-fit', reset: 'map-reset', level: 'map-zoom-level' },
  presentation: { tab: 'tab-presentation', stage: 'presentation-stage', content: 'presentation-content', zoomIn: 'pres-zoom-in', zoomOut: 'pres-zoom-out', fit: 'pres-fit', reset: 'pres-reset', level: 'pres-zoom-level' },
};

function view(kind: Kind): string {
  return byId(ids[kind].content).style.transform;
}

function scale(kind: Kind): number {
  return Number(byId(ids[kind].stage).dataset.scale);
}

function wheel(kind: Kind, x: number, y: number, deltaY: number): void {
  byId(ids[kind].stage).dispatchEvent(new WheelEvent('wheel', { deltaY, clientX: STAGE.left + x, clientY: STAGE.top + y, bubbles: true, cancelable: true }));
}

function drag(kind: Kind, from: [number, number], to: [number, number]): void {
  const stage = byId(ids[kind].stage);
  pointer('pointerdown', stage, STAGE.left + from[0], STAGE.top + from[1]);
  pointer('pointermove', stage, STAGE.left + (from[0] + to[0]) / 2, STAGE.top + (from[1] + to[1]) / 2);
  pointer('pointermove', stage, STAGE.left + to[0], STAGE.top + to[1]);
  pointer('pointerup', stage, STAGE.left + to[0], STAGE.top + to[1]);
}

function touch(type: string, kind: Kind, id: number, x: number, y: number): void {
  pointer(type, byId(ids[kind].stage), STAGE.left + x, STAGE.top + y, { pointerId: id, pointerType: 'touch' });
}

// Two fingers at a and b move to a2 and b2, one after the other.
function pinch(kind: Kind, a: [number, number], b: [number, number], a2: [number, number], b2: [number, number]): void {
  touch('pointerdown', kind, 11, ...a);
  touch('pointerdown', kind, 12, ...b);
  touch('pointermove', kind, 12, ...b2);
  touch('pointermove', kind, 11, ...a2);
  touch('pointerup', kind, 11, ...a2);
  touch('pointerup', kind, 12, ...b2);
}

function show(kind: Kind): void {
  byId(ids[kind].tab).click();
}

// Plays the same gesture on both stages, from the same fitted view.
function onBoth(gesture: (kind: Kind) => void): Record<Kind, string> {
  const out = {} as Record<Kind, string>;
  for (const kind of ['map', 'presentation'] as Kind[]) {
    show(kind);
    byId(ids[kind].fit).click();
    gesture(kind);
    out[kind] = view(kind);
  }
  return out;
}

for (const theme of ['light', 'dark']) {
  describe(`zoom and pan parity, ${theme} theme (FR-36)`, () => {
    beforeEach(async () => {
      await mountApp();
      const select = byId<HTMLSelectElement>('select-theme');
      select.value = theme;
      select.dispatchEvent(new Event('change'));
      await placeExampleMarkers([
        [0, 100, 100],
        [2, 400, 300],
      ]);
      await flush();
    });

    test('both stages start from the same fitted view', () => {
      show('presentation');
      expect(view('presentation')).toBe(view('map'));
      expect(scale('presentation')).toBeCloseTo(2 / 3, 10);
    });

    test('wheel zoom at the cursor', () => {
      const r = onBoth((k) => wheel(k, 200, 150, -100));
      expect(r.presentation).toBe(r.map);
      expect(r.map).not.toBe(onBoth(() => undefined).map);
    });

    test('control zoom in and out, with the zoom level shown', () => {
      const r = onBoth((k) => {
        byId(ids[k].zoomIn).click();
        byId(ids[k].zoomIn).click();
        byId(ids[k].zoomOut).click();
      });
      expect(r.presentation).toBe(r.map);
      expect(byId(ids.presentation.level).textContent).toBe(byId(ids.map.level).textContent);
      expect(byId(ids.map.level).textContent).toBe('83%');
    });

    test('drag pan', () => {
      const r = onBoth((k) => drag(k, [300, 300], [360, 250]));
      expect(r.presentation).toBe(r.map);
      expect(r.map).toContain('translate(');
    });

    test('touch pinch zooms about the fingers on both stages', () => {
      const r = onBoth((k) => pinch(k, [300, 300], [500, 300], [250, 300], [550, 300]));
      expect(r.presentation).toBe(r.map);
      expect(scale('map')).toBeCloseTo((2 / 3) * 1.5, 10);
      expect(scale('presentation')).toBeCloseTo((2 / 3) * 1.5, 10);
    });

    test('a pinch that turns back into a one-finger drag keeps panning', () => {
      const r = onBoth((k) => {
        touch('pointerdown', k, 11, 300, 300);
        touch('pointerdown', k, 12, 500, 300);
        touch('pointermove', k, 12, 600, 300);
        touch('pointerup', k, 12, 600, 300);
        touch('pointermove', k, 11, 340, 330);
        touch('pointerup', k, 11, 340, 330);
      });
      expect(r.presentation).toBe(r.map);
      expect(byId(ids.map.stage).classList.contains('panning')).toBe(false);
      expect(byId(ids.map.stage).classList.contains('pinching')).toBe(false);
    });

    test('on the Presentation stage, a pinch may start with a finger on a marker', () => {
      show('presentation');
      byId(ids.presentation.fit).click();
      const marker = presentationMarkers()[1];
      const [x, y] = [parseFloat(marker.style.left), parseFloat(marker.style.top)];
      pointer('pointerdown', marker, STAGE.left + x, STAGE.top + y, { pointerId: 31, pointerType: 'touch' });
      touch('pointerdown', 'presentation', 32, x + 200, y);
      touch('pointermove', 'presentation', 32, x + 300, y);
      touch('pointerup', 'presentation', 32, x + 300, y);
      pointer('pointerup', marker, STAGE.left + x, STAGE.top + y, { pointerId: 31, pointerType: 'touch' });
      expect(scale('presentation')).toBeCloseTo((2 / 3) * 1.5, 10);
      // A pinch is not a tap: no card opens.
      expect(byId('presentation-card').dataset.state).toBe('closed');
    });

    test('fit view and reset', () => {
      const fitted = onBoth((k) => {
        byId(ids[k].zoomIn).click();
        drag(k, [300, 300], [100, 100]);
        byId(ids[k].fit).click();
      });
      expect(fitted.presentation).toBe(fitted.map);
      const reset = onBoth((k) => byId(ids[k].reset).click());
      expect(reset.presentation).toBe(reset.map);
      expect(scale('map')).toBe(1);
    });

    test('markers follow the view identically on both stages', () => {
      onBoth((k) => {
        wheel(k, 400, 300, -200);
        pinch(k, [200, 200], [400, 400], [180, 180], [440, 440]);
      });
      const positions = (nodes: HTMLElement[]) => nodes.map((m) => [m.style.left, m.style.top]);
      show('map');
      const onMap = positions(markers());
      show('presentation');
      expect(positions(presentationMarkers())).toEqual(onMap);
    });

    test('a finger on a marker of the Map segment drags the marker and takes no part in a pinch: the other finger pans', () => {
      show('map');
      const before = view('map');
      pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100, { pointerId: 21, pointerType: 'touch' });
      touch('pointerdown', 'map', 22, 500, 300);
      touch('pointermove', 'map', 22, 600, 300);
      touch('pointerup', 'map', 22, 600, 300);
      pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100, { pointerId: 21, pointerType: 'touch' });
      expect(view('map')).not.toBe('');
      // Only one finger was on the stage itself: that is a pan, not a pinch.
      expect(scale('map')).toBeCloseTo(2 / 3, 10);
      expect(view('map')).not.toBe(before);
    });
  });
}

describe('smooth viewport motion (FR-36, FR-37)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
  });

  afterEach(() => vi.useRealTimers());

  test('zoom by control, fit, reset, and the wheel ease on both stages; the easing ends by itself', async () => {
    for (const kind of ['map', 'presentation'] as Kind[]) {
      show(kind);
      const stage = byId(ids[kind].stage);
      for (const action of [() => byId(ids[kind].zoomIn).click(), () => byId(ids[kind].fit).click(), () => byId(ids[kind].reset).click(), () => wheel(kind, 100, 100, -100)]) {
        stage.classList.remove('easing');
        action();
        expect(stage.classList.contains('easing')).toBe(true);
      }
      await new Promise((r) => setTimeout(r, 350));
      expect(stage.classList.contains('easing')).toBe(false);
    }
  });

  test('dragging and pinching follow the pointer directly', () => {
    for (const kind of ['map', 'presentation'] as Kind[]) {
      show(kind);
      const stage = byId(ids[kind].stage);
      byId(ids[kind].zoomIn).click();
      expect(stage.classList.contains('easing')).toBe(true);
      pointer('pointerdown', stage, STAGE.left + 300, STAGE.top + 300);
      expect(stage.classList.contains('easing')).toBe(false);
      pointer('pointerup', stage, STAGE.left + 300, STAGE.top + 300);
    }
  });

  test('loading a background fits it without easing', () => {
    expect(byId('map-stage').classList.contains('easing')).toBe(false);
  });
});
