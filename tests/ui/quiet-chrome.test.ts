import { describe, expect, test, vi } from 'vitest';
import { mountApp } from './harness';
import { IDLE_MS } from '../../src/quietchrome';

// v2.3.0: the demo's map text is now the parkland extract (demo-map.osm,
// 6.36 MiB, 154k XML elements). A jsdom DOMParser over it needs more memory
// than the test runners have (the worker is OOM-killed), so in the jsdom UI
// tests the demo's map text is substituted with the small synthetic town
// fixture; the real extract's parse and render is pinned by the unit pin
// (tests/unit/demo.test.ts) and by every browser suite, which loads the built
// application natively (the whole demo load measures 1.7 s there).
vi.mock('../../src/demo', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/demo')>();
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const town = readFileSync(join(process.cwd(), 'example-data', 'example-map.osm'), 'utf8');
  return { ...mod, DEMO_MAP_TEXT: town, demoMapText: () => town };
});

// The quiet chrome (FR-37 as amended in v2.1.0): on the Presentation
// segment's stage, the floating chrome withdraws after four seconds of
// stillness — the owner's ruled delay — and returns on any interaction. The
// state toggles instantly: no fade, with or without the reduced-motion
// preference (the stylesheet declares no transition for it).

async function mountPresentation() {
  const app = await mountApp();
  document.getElementById('load-demo')!.click();
  document.getElementById('demo-go')!.click();
  await vi.waitFor(() => expect(document.documentElement.dataset.segment).toBe('map'));
  document.getElementById('tab-presentation')!.click();
  await vi.waitFor(() => expect(document.documentElement.dataset.segment).toBe('presentation'));
  return app;
}

describe('the quiet chrome (FR-37 as amended in v2.1.0)', () => {
  test('the ruled delay is four seconds', () => {
    expect(IDLE_MS).toBe(4000);
  });

  test('on the Presentation segment the floating chrome withdraws when idle and returns on interaction', async () => {
    vi.useFakeTimers();
    try {
      await mountPresentation();
      // Reset the timer that the mounting itself started.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(document.documentElement.dataset.idle).toBeUndefined();
      vi.advanceTimersByTime(IDLE_MS - 1);
      expect(document.documentElement.dataset.idle).toBeUndefined();
      vi.advanceTimersByTime(1);
      expect(document.documentElement.dataset.idle).toBe('true');
      // Any interaction returns the chrome on the same timer.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(document.documentElement.dataset.idle).toBeUndefined();
      vi.advanceTimersByTime(IDLE_MS);
      expect(document.documentElement.dataset.idle).toBe('true');
      window.dispatchEvent(new MouseEvent('pointermove'));
      expect(document.documentElement.dataset.idle).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test('on another segment the chrome does not withdraw', async () => {
    vi.useFakeTimers();
    try {
      await mountApp();
      document.getElementById('load-demo')!.click();
      document.getElementById('demo-go')!.click();
      await vi.waitFor(() => expect(document.documentElement.dataset.segment).toBe('map'));
      vi.advanceTimersByTime(IDLE_MS * 3);
      expect(document.documentElement.dataset.idle).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  test('while a panel is open the chrome stays', async () => {
    vi.useFakeTimers();
    try {
      await mountPresentation();
      // Open the "In view" overlay (narrow) or fold... in the default jsdom
      // width the panel floats; mark it open through the fold state instead.
      document.getElementById('presentation-glance')!.dataset.state = 'open';
      vi.advanceTimersByTime(IDLE_MS * 3);
      expect(document.documentElement.dataset.idle).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
