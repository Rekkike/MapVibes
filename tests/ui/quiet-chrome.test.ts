import { describe, expect, test, vi } from 'vitest';
import { mountApp } from './harness';
import { IDLE_MS } from '../../src/quietchrome';

// The quiet chrome (FR-37 as amended in v2.1.0): on the Presentation
// segment's stage, the floating chrome withdraws after four seconds of
// stillness — the owner's ruled delay — and returns on any interaction. The
// state toggles instantly: no fade, with or without the reduced-motion
// preference (the stylesheet declares no transition for it).

async function mountPresentation() {
  const app = await mountApp();
  document.getElementById('load-demo')!.click();
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
