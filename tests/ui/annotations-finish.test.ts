import { describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, loadExampleBackground, mountApp, pointer, STAGE } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The phone editor's phase two, unit 3 (FR-47 as amended in v1.15.0), on
// both viewports: Done and Cancel in the hint row finish or abandon a
// drawing, and the Straight toggle beside the Line and Polygon tools is the
// touch form of the Shift constraint -- one transient flag consulted
// alongside the modifier-key reads, snapping to the same eight directions,
// reset on tool change, never saved (nothing of it reaches the work state).

type App = Awaited<ReturnType<typeof mountApp>>;

function at(type: string, x: number, y: number, target: Element = byId('map-stage')): void {
  pointer(type, target, STAGE.left + x, STAGE.top + y);
}

function press(x: number, y: number): void {
  at('pointerdown', x, y);
  at('pointerup', x, y);
}

function tool(name: string): void {
  document.querySelector<HTMLButtonElement>(`#annotation-tools [data-tool="${name}"]`)!.click();
}

function straightButton(): HTMLButtonElement {
  return byId('annotation-straight');
}

function points(app: App, i = 0): Array<{ x: number; y: number }> {
  return app.captureWorkState().annotations[i].points;
}

function angle(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return Math.round(((deg % 180) + 180) % 180);
}

async function mount(mode: 'wide' | 'narrow'): Promise<App> {
  const app = await mountApp(
    mode === 'narrow'
      ? {
          beforeMain: () => {
            const plain = window.matchMedia.bind(window);
            window.matchMedia = (q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q));
          },
        }
      : {},
  );
  await importExampleWorkbook();
  byId('tab-map').click();
  await loadExampleBackground();
  return app;
}

function draft(): Element | null {
  return byId('map-annotations').querySelector('g.annotation.draft');
}

for (const mode of ['wide', 'narrow'] as const) {
  describe(`Done, Cancel, and the Straight toggle on the ${mode} viewport (FR-47 as amended in v1.15.0)`, () => {
    test('while a line is being drawn the hint row carries Done and Cancel; Done finishes the line', async () => {
      const app = await mount(mode);
      expect(byId('annotation-done').classList.contains('hidden')).toBe(true);
      expect(byId('annotation-cancel').classList.contains('hidden')).toBe(true);
      tool('line');
      press(100, 100);
      expect(byId('annotation-done').classList.contains('hidden')).toBe(false);
      expect(byId('annotation-cancel').classList.contains('hidden')).toBe(false);
      expect(byId('annotation-done').textContent).toBe('Done');
      expect(byId('annotation-cancel').textContent).toBe('Cancel');
      press(300, 112);
      expect(draft()).not.toBeNull();
      byId('annotation-done').click();
      expect(draft()).toBeNull();
      expect(byId('annotation-done').classList.contains('hidden')).toBe(true);
      expect(app.captureWorkState().annotations).toHaveLength(1);
      expect(points(app)).toHaveLength(2);
      // The finished line is selected, the tool is back to Select.
      expect(document.querySelector('#annotation-tools [data-tool="select"]')!.getAttribute('aria-pressed')).toBe('true');
      expect(byId('map-annotations').querySelectorAll('g.annotation').length).toBe(1);
    });

    test('Cancel abandons the drawing: no annotation, no draft, the tool stays', async () => {
      const app = await mount(mode);
      tool('line');
      press(100, 100);
      press(300, 112);
      expect(draft()).not.toBeNull();
      byId('annotation-cancel').click();
      expect(draft()).toBeNull();
      expect(byId('annotation-done').classList.contains('hidden')).toBe(true);
      expect(app.captureWorkState().annotations).toHaveLength(0);
      expect(byId('map-annotations').querySelectorAll('g.annotation').length).toBe(0);
      expect(document.querySelector('#annotation-tools [data-tool="line"]')!.getAttribute('aria-pressed')).toBe('true');
    });

    test('Done also closes a polygon', async () => {
      const app = await mount(mode);
      tool('polygon');
      press(100, 100);
      press(200, 100);
      press(200, 200);
      expect(byId('annotation-done').classList.contains('hidden')).toBe(false);
      byId('annotation-done').click();
      expect(app.captureWorkState().annotations).toHaveLength(1);
      expect(points(app)).toHaveLength(3);
    });

    test('the Straight toggle snaps the segment to the nearest of the eight directions, like the key', async () => {
      const app = await mount(mode);
      tool('line');
      expect(straightButton().getAttribute('aria-pressed')).toBe('false');
      straightButton().click();
      expect(straightButton().getAttribute('aria-pressed')).toBe('true');
      press(100, 100);
      // Almost horizontal, toggle on: exactly horizontal.
      press(300, 112);
      // Almost diagonal: exactly diagonal.
      press(380, 185);
      byId('annotation-done').click();
      const p = points(app);
      expect(p).toHaveLength(3);
      expect(angle(p[0], p[1])).toBe(0);
      expect(angle(p[1], p[2])).toBe(45);
    });

    test('with the toggle off a vertex goes where it is pressed, and the key still works', async () => {
      const app = await mount(mode);
      tool('line');
      press(100, 100);
      press(300, 112);
      byId('annotation-done').click();
      expect(angle(points(app)[0], points(app)[1])).not.toBe(0);
      tool('line');
      press(100, 300);
      pointer('pointerdown', byId('map-stage'), STAGE.left + 300, STAGE.top + 312, { shiftKey: true });
      pointer('pointerup', byId('map-stage'), STAGE.left + 300, STAGE.top + 312, { shiftKey: true });
      byId('annotation-done').click();
      const p = points(app, 1);
      expect(angle(p[0], p[1])).toBe(0);
    });

    test('the toggle is transient: reset on tool change, never saved', async () => {
      const app = await mount(mode);
      tool('line');
      straightButton().click();
      expect(straightButton().getAttribute('aria-pressed')).toBe('true');
      tool('rectangle');
      expect(straightButton().getAttribute('aria-pressed')).toBe('false');
      tool('line');
      expect(straightButton().getAttribute('aria-pressed')).toBe('false');
      press(100, 100);
      press(300, 112);
      byId('annotation-done').click();
      expect(angle(points(app)[0], points(app)[1])).not.toBe(0);
      // Nothing of the flag is in the work state.
      expect(JSON.stringify(app.captureWorkState())).not.toContain('straight');
    });

    test('the toggle constrains a dragged vertex as the key does', async () => {
      const app = await mount(mode);
      tool('rectangle');
      at('pointerdown', 100, 100);
      at('pointermove', 300, 200);
      at('pointerup', 300, 200);
      tool('select');
      straightButton().click();
      const handle = byId('map-annotation-handles').querySelectorAll<HTMLElement>('.annotation-handle')[1];
      pointer('pointerdown', handle, STAGE.left + 300, STAGE.top + 200);
      pointer('pointermove', handle, STAGE.left + 360, STAGE.top + 230);
      pointer('pointerup', handle, STAGE.left + 360, STAGE.top + 230);
      const p = points(app);
      // The dragged corner stayed on the nearest axis through its start:
      // the drag went 60 by 30 on screen, so the diagonal wins.
      const [corner] = p.slice(1);
      const start = { x: 300 / (2 / 3), y: (200 - (600 - 800 * (2 / 3)) / 2) / (2 / 3) };
      expect(angle(start, corner)).toBe(45);
    });
  });
}
