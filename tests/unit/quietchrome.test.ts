import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

describe('the quiet-chrome timer against a dead environment (v2.5.0 CI fix-forward)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test('a firing withdraw timer exits cleanly when the document is gone, and is not rescheduled', async () => {
    const { IDLE_MS, startQuietChrome } = await import('../../src/quietchrome');
    const baseline = vi.getTimerCount();
    startQuietChrome();
    expect(vi.getTimerCount()).toBe(baseline + 1);
    vi.stubGlobal('document', undefined);
    expect(() => vi.advanceTimersByTime(IDLE_MS + 1)).not.toThrow();
    expect(vi.getTimerCount()).toBeLessThanOrEqual(baseline);
  });

  test('starting the chrome against a dead document throws nothing and schedules nothing', async () => {
    vi.stubGlobal('document', undefined);
    const { startQuietChrome } = await import('../../src/quietchrome');
    const baseline = vi.getTimerCount();
    expect(() => startQuietChrome()).not.toThrow();
    expect(vi.getTimerCount()).toBe(baseline);
  });

  test('with the environment alive the timer keeps cycling exactly as before', async () => {
    const { IDLE_MS, startQuietChrome } = await import('../../src/quietchrome');
    startQuietChrome();
    expect(() => vi.advanceTimersByTime(IDLE_MS * 25 + 1)).not.toThrow();
    expect(document.documentElement.dataset.idle).toBeUndefined();
  });
});
