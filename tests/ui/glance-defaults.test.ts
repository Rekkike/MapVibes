import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, openWorkFile, placeExampleMarkers, setRole, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

// The at-a-glance columns of work that made no deliberate choice (FR-46 as
// amended in v1.3.1): the full current defaults, the area, start, and end
// columns, in both segments; a deliberate choice is respected.

type App = Awaited<ReturnType<typeof mountApp>>;

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
}

// The columns the entries of a segment's panel show, per entry.
function shownColumns(prefix: 'map' | 'presentation'): string[][] {
  return [...byId(`${prefix}-glance-list`).querySelectorAll('.glance-entry')].map((e) => [...e.querySelectorAll<HTMLElement>('.glance-value')].map((v) => v.dataset.header!));
}

// Both segments' panels, fitted, show for the example's first item (every
// value filled) exactly these columns; a chosen set in the list's order.
async function expectBothSegments(columns: string[], inListOrder = false): Promise<void> {
  const same = (shown: string[]) => (inListOrder ? expect([...shown].sort()).toEqual([...columns].sort()) : expect(shown).toEqual(columns));
  byId('tab-map').click();
  byId('map-fit').click();
  await flush();
  same(shownColumns('map')[0]);
  byId('tab-presentation').click();
  byId('pres-fit').click();
  await flush();
  same(shownColumns('presentation')[0]);
}

function example(name: string): string {
  return readFileSync(join(process.cwd(), 'example-data', name), 'utf8');
}

async function openWork(text: string): Promise<void> {
  stubStageLayout();
  stubImageDecoding(1200, 800);
  openWorkFile(textFile('work.json', text));
  await settle();
}

async function placeWithRoles(): Promise<void> {
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  byId('tab-information').click();
  setRole('ID', 'identifier');
  setRole('Group', 'area');
  setRole('Start', 'start');
  setRole('End', 'end');
}

describe('work with no deliberate choice shows the full defaults (FR-46)', () => {
  test('a fresh file', async () => {
    const app = await mountApp();
    await placeWithRoles();
    expect(app.captureWorkState().glanceColumns).toBeNull();
    await expectBothSegments(['Group', 'Start', 'End']);
  });

  test('a file from before the choice existed (schema version 5)', async () => {
    const app = await mountApp();
    await openWork(example('example-work-state-v5.json'));
    expect(app.captureWorkState().glanceColumns).toBeNull();
    await expectBothSegments(['Group', 'Start', 'End']);
  });

  test('a version 6 file with a deliberate choice keeps it, with the end column added once', async () => {
    const app = await mountApp();
    await openWork(example('example-work-state-v6.json'));
    expect(app.captureWorkState().glanceColumns).toEqual(['Group', 'Start', 'End']);
    await expectBothSegments(['Group', 'Start', 'End']);
  });

  test('a deliberate choice is respected in both segments', async () => {
    const app = await mountApp();
    await placeWithRoles();
    byId('tab-map').click();
    const box = document.querySelector<HTMLInputElement>('#glance-columns-list .glance-column-toggle[data-header="Start"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await expectBothSegments(['Group', 'End'], true);
    const reopened = await mountApp();
    await openWork(serialiseWorkState(app.captureWorkState(), new Date()));
    expect([...reopened.captureWorkState().glanceColumns!].sort()).toEqual(['End', 'Group']);
    await expectBothSegments(['Group', 'End'], true);
  });
});

describe('the choice of the demo does not outlive the demo (FR-41, FR-46)', () => {
  async function demoThen(replace: () => Promise<void>): Promise<App> {
    const app = await mountApp({
      singleFile: true,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(3000, 2000);
      },
    });
    byId('load-demo').click();
    await settle();
    expect(app.captureWorkState().glanceColumns).toEqual(['Programme', 'Status', 'End year']);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await replace();
    return app;
  }

  test('a list imported after the demo starts with the full defaults and no demo colour labels, and saves a file that opens', async () => {
    const app = await demoThen(importExampleWorkbook);
    const ws = app.captureWorkState();
    expect(ws.glanceColumns).toBeNull();
    expect(ws.colourLabels).toEqual({});
    // Before v1.3.1, the demo's choice stayed: the panels showed neither the
    // start nor the end, and the saved file could not be opened.
    expect(() => parseWorkState(serialiseWorkState(ws, new Date()))).not.toThrow();
    await placeWithRoles();
    await expectBothSegments(['Group', 'Start', 'End']);
    expect([...byId('map-legend').querySelectorAll('.legend-entry[data-colour]')].map((e) => e.textContent)).toEqual(['Green', 'Blue', 'Yellow', 'Red']);
  });

  test('an empty list started after the demo has no choice and no demo colour labels', async () => {
    const app = await demoThen(async () => byId('start-empty').click());
    const ws = app.captureWorkState();
    expect(ws.glanceColumns).toBeNull();
    expect(ws.colourLabels).toEqual({});
  });

  test('a file saved that way before v1.3.1 opens, with the full defaults', async () => {
    // The demo's choice saved with the example list, as v1.3.0 wrote it.
    const app = await mountApp();
    await placeWithRoles();
    const file = JSON.parse(serialiseWorkState(app.captureWorkState(), new Date()));
    file.glance.columns = ['Programme', 'Status', 'End year'];
    const reopened = await mountApp();
    await openWork(JSON.stringify(file));
    expect(byId('work-status').textContent).not.toMatch(/could not/);
    expect(reopened.captureWorkState().glanceColumns).toBeNull();
    await expectBothSegments(['Group', 'Start', 'End']);
  });
});
