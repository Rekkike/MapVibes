import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, loadExampleBackground, mountApp, pointer, STAGE } from './harness';
import { labelSize } from '../../src/annotationlayer';

// The straight-line constraint and the screen-space labels (FR-47 as amended
// in v1.3.0), through pointer events carrying the modifier keys.

type App = Awaited<ReturnType<typeof mountApp>>;
type Mods = { shiftKey?: boolean; ctrlKey?: boolean };

function at(type: string, x: number, y: number, mods: Mods = {}, target: Element = byId('map-stage')): void {
  pointer(type, target, STAGE.left + x, STAGE.top + y, mods);
}

function tool(name: string): void {
  document.querySelector<HTMLButtonElement>(`#annotation-tools [data-tool="${name}"]`)!.click();
}

function points(app: App, i = 0): Array<{ x: number; y: number }> {
  return app.captureWorkState().annotations[i].points;
}

// The direction of a segment, in degrees from horizontal, 0 to 180.
function angle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return Math.round(((deg % 180) + 180) % 180);
}

describe('the straight-line constraint (FR-47)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp();
    await importExampleWorkbook();
    byId('tab-map').click();
    await loadExampleBackground();
  });

  test('a line drawn by presses: with Shift held, each new vertex lies on the nearest axis', () => {
    tool('line');
    at('pointerdown', 100, 100);
    at('pointerup', 100, 100);
    // Almost horizontal, held: exactly horizontal.
    at('pointerdown', 300, 112, { shiftKey: true });
    at('pointerup', 300, 112, { shiftKey: true });
    // Almost diagonal, held with Ctrl: exactly diagonal.
    at('pointerdown', 380, 185, { ctrlKey: true });
    at('pointerup', 380, 185, { ctrlKey: true });
    at('pointerdown', 380, 185, { ctrlKey: true });
    at('pointerup', 380, 185, { ctrlKey: true });
    const p = points(app);
    expect(p).toHaveLength(3);
    expect(angle(p[0], p[1])).toBe(0);
    expect(angle(p[1], p[2])).toBe(45);
  });

  test('without the key, a vertex goes where it is pressed', () => {
    tool('line');
    at('pointerdown', 100, 100);
    at('pointerup', 100, 100);
    at('pointerdown', 300, 112);
    at('pointerup', 300, 112);
    at('pointerdown', 300, 112);
    at('pointerup', 300, 112);
    const p = points(app);
    expect(angle(p[0], p[1])).not.toBe(0);
  });

  test('the preview of the next vertex follows the constraint live, before the press', () => {
    tool('line');
    at('pointerdown', 100, 100);
    at('pointerup', 100, 100);
    at('pointermove', 260, 108, { shiftKey: true });
    const draft = byId('map-annotations').querySelector('g.annotation.draft polyline')!;
    const coords = draft.getAttribute('points')!.split(' ').map((pair) => pair.split(',').map(Number));
    expect(coords[coords.length - 1][1]).toBeCloseTo(coords[0][1], 6);
  });

  test('a freehand stroke held with the key is one straight segment that follows the pointer along its axis', () => {
    tool('polygon');
    at('pointerdown', 100, 300);
    for (const [x, y] of [
      [150, 304],
      [200, 297],
      [260, 305],
      [320, 302],
    ]) {
      at('pointermove', x, y, { shiftKey: true });
    }
    // Released: freehand again.
    at('pointermove', 330, 360);
    at('pointermove', 300, 420);
    at('pointerup', 300, 420);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    const p = points(app);
    // The held part added one vertex only, on the horizontal through the start.
    expect(angle(p[0], p[1])).toBe(0);
    expect(p[1].x).toBeGreaterThan(p[0].x);
    expect(p.length).toBeGreaterThanOrEqual(3);
  });

  test('dragging a shape with the key held moves it along the nearest axis', () => {
    tool('rectangle');
    at('pointerdown', 100, 150);
    at('pointermove', 200, 250);
    at('pointerup', 200, 250);
    tool('select');
    const before = points(app).map((q) => ({ ...q }));
    at('pointerdown', 150, 200);
    at('pointermove', 250, 210, { shiftKey: true });
    at('pointerup', 250, 210, { shiftKey: true });
    const after = points(app);
    expect(after[0].y).toBeCloseTo(before[0].y, 6);
    expect(after[0].x).toBeGreaterThan(before[0].x);
  });

  test('dragging a vertex with the key held moves it along the nearest axis', () => {
    tool('polygon');
    for (const [x, y] of [
      [100, 100],
      [250, 100],
      [250, 250],
    ]) {
      at('pointerdown', x, y);
      at('pointerup', x, y);
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    tool('select');
    at('pointerdown', 180, 140);
    at('pointerup', 180, 140);
    const handle = byId('map-annotation-handles').querySelectorAll<HTMLElement>('.annotation-handle')[2];
    const before = points(app)[2];
    const hx = parseFloat(handle.style.left);
    const hy = parseFloat(handle.style.top);
    at('pointerdown', hx, hy, {}, handle);
    at('pointermove', hx + 6, hy + 80, { ctrlKey: true });
    at('pointerup', hx + 6, hy + 80, { ctrlKey: true });
    const after = points(app)[2];
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeGreaterThan(before.y);
  });
});

describe('annotation labels on the map (FR-47 as amended in v1.4.0)', () => {
  const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

  test('the labels are inside the scaled map content, printed relative to the sheet, with no motion of their own', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const [labels, content] of [
      ['map-annotation-labels', 'map-content'],
      ['presentation-annotation-labels', 'presentation-content'],
    ]) {
      expect(doc.getElementById(content)!.contains(doc.getElementById(labels))).toBe(true);
    }
    const rule = /^\.annotation-label \{([^}]*)\}/m.exec(css)![1];
    expect(rule).toMatch(/font-size: var\(--label-size, var\(--dense-font\)\);/);
    // The labels move with the scaled map; the glide of their own is gone,
    // while the markers keep theirs.
    expect(css).not.toMatch(/\.annotation-label[^{]*\{[^}]*transition/);
    expect(css).toMatch(/\.stage\.easing \.marker \{/);
  });

  test('the printed size is the longer side of the background divided by 64', () => {
    expect(labelSize({ width: 3000, height: 2000 })).toBe(3000 / 64);
    expect(labelSize({ width: 800, height: 1200 })).toBe(1200 / 64);
  });
});
