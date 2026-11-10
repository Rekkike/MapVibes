import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, openWorkFile, placeExampleMarkers, setRole, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { parseWorkState, serialiseWorkState, type WorkState } from '../../src/workstate';
import { dayNumber } from '../../src/dates';

// The work-phase marker (FR-78 as amended in v1.12.0): one of an item's
// activities, assigned in the edit mode of the activities dialog; in the
// timeline, and in the timeline only, a hatched band across the line's plot
// with the referenced segment hatched; a used-only legend entry (FR-75).

type App = Awaited<ReturnType<typeof mountApp>>;

const timeline = () => byId('presentation-timeline');
const lineOf = (name: string) => [...timeline().querySelectorAll<HTMLElement>('.timeline-line')].find((li) => li.textContent!.includes(name))!;
const legendKinds = () => [...byId('presentation-legend').querySelectorAll<HTMLElement>('.legend-group')].map((g) => g.dataset.kind);
const action = (text: string) => [...document.querySelectorAll<HTMLElement>('#details-panel .details-economics')].find((b) => b.textContent === text)!;

// The example workbook with activities on its first two items: five on the
// first, overlapping so that two lie behind the "+n" badge, and two on the
// second, one with a date that cannot be read.
async function setUp(change: (ws: WorkState) => void = () => undefined): Promise<App> {
  const app = await mountApp({ singleFile: true });
  window.confirm = () => true;
  await placeExampleMarkers([[0, 100, 100], [1, 300, 150]]);
  setRole('ID', 'identifier');
  setRole('Start', 'start');
  const ws = app.captureWorkState();
  ws.rows[0].activities = [
    { id: 'a1', label: 'Groundwork', start: '2024-01-05', end: '2024-01-20', progress: 100 },
    { id: 'a2', label: 'Piping', start: '2024-01-10', end: '2024-01-25', progress: 60 },
    { id: 'a3', label: 'Wiring', start: '2024-01-15', end: '2024-01-30', progress: 0 },
    { id: 'a4', label: 'Testing', start: '2024-01-20', end: '2024-02-01', progress: null },
    { id: 'a5', label: 'Handover', start: '2024-02-03', end: '2024-02-15', progress: 10 },
  ];
  ws.rows[1].activities = [
    { id: 'a1', label: 'Survey', start: '2024-02-02', end: '2024-02-10', progress: 100 },
    { id: 'a2', label: 'Report', start: '15/03/2024', end: '2024-03-20', progress: null },
  ];
  change(ws);
  openWorkFile(textFile('work.json', serialiseWorkState(ws, new Date())));
  await flush();
  return app;
}

async function openCorrection(row: number): Promise<void> {
  byId('tab-information').click();
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[row].querySelector<HTMLElement>('.row-details')!.click();
  await flush();
  action('Correct activities').click();
  await flush();
}

function choosePhase(value: string): void {
  const select = byId<HTMLSelectElement>('activity-phase');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

async function showTimeline(): Promise<void> {
  byId('tab-presentation').click();
  byId('pres-mode-timeline').click();
  await flush();
}

describe('assigning the work phase (FR-78)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
  });

  test('the edit mode has a select listing the item\'s activities, "None" first; the import mode has none', async () => {
    await openCorrection(0);
    expect(byId('activity-phase-row').classList.contains('hidden')).toBe(false);
    expect(byId('activity-phase-label').textContent).toBe('Work phase');
    expect([...byId<HTMLSelectElement>('activity-phase').options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'None'],
      ['a1', 'Groundwork'],
      ['a2', 'Piping'],
      ['a3', 'Wiring'],
      ['a4', 'Testing'],
      ['a5', 'Handover'],
    ]);
    expect(byId<HTMLSelectElement>('activity-phase').value).toBe('');
    byId('activity-cancel').click();
    action('Import activities').click();
    await flush();
    expect(byId('activity-phase-row').classList.contains('hidden')).toBe(true);
  });

  test('a chosen activity is saved as the row\'s reference; "None" clears it; assigning marks nothing as edited', async () => {
    await openCorrection(0);
    choosePhase('a2');
    byId('activity-go').click();
    await flush();
    let ws = app.captureWorkState();
    expect(ws.rows[0].workPhase).toBe('a2');
    expect(ws.rows[0].activities!.some((a) => a.edited)).toBe(false);
    expect(ws.rows[1].workPhase).toBeUndefined();
    // It is saved with the work and read back.
    expect(parseWorkState(serialiseWorkState(ws, new Date())).rows[0].workPhase).toBe('a2');
    await openCorrection(0);
    expect(byId<HTMLSelectElement>('activity-phase').value).toBe('a2');
    choosePhase('');
    byId('activity-go').click();
    await flush();
    ws = app.captureWorkState();
    expect(ws.rows[0].workPhase).toBeUndefined();
  });

  test('removing the referenced activity clears the work phase; it is not offered once removed', async () => {
    await openCorrection(0);
    choosePhase('a2');
    byId('activity-go').click();
    await flush();
    await openCorrection(0);
    document.querySelectorAll<HTMLElement>('#activity-rows .activity-edit')[1].querySelector<HTMLButtonElement>('.activity-edit-remove')!.click();
    expect(byId<HTMLSelectElement>('activity-phase').value).toBe('');
    expect([...byId<HTMLSelectElement>('activity-phase').options].map((o) => o.value)).toEqual(['', 'a1', 'a3', 'a4', 'a5']);
    byId('activity-go').click();
    await flush();
    const ws = app.captureWorkState();
    expect(ws.rows[0].workPhase).toBeUndefined();
    expect(ws.rows[0].activities!.map((a) => a.id)).toEqual(['a1', 'a3', 'a4', 'a5']);
  });
});

describe('the work phase in the timeline (FR-78, FR-75)', () => {
  test('a hatched band across the line\'s plot from the activity\'s start to its end, behind the bar and the segments; the referenced segment is marked', async () => {
    await setUp((ws) => (ws.rows[1].workPhase = 'a1'));
    await showTimeline();
    const line = lineOf('A-02');
    const bands = [...line.querySelectorAll<HTMLElement>('.timeline-phase')];
    expect(bands).toHaveLength(1);
    expect([Number(bands[0].dataset.from), Number(bands[0].dataset.to)]).toEqual([dayNumber(2024, 2, 2), dayNumber(2024, 2, 11)]);
    // Behind: it comes first in the plot.
    expect(line.querySelector('.timeline-plot')!.firstElementChild).toBe(bands[0]);
    const seg = line.querySelector<HTMLElement>('.timeline-seg')!;
    expect(seg.dataset.phase).toBe('true');
    // The band stands where the segment stands.
    expect([bands[0].style.left, bands[0].style.width]).toEqual([seg.style.left, seg.style.width]);
    expect(seg.title).toBe('Survey: 2024-02-02 – 2024-02-10, 100%, Work phase');
    expect(line.querySelector('.timeline-entry')!.getAttribute('aria-label')).toContain('Survey: 2024-02-02 – 2024-02-10, 100%, Work phase');
    // No other line has a band.
    expect(timeline().querySelectorAll('.timeline-phase')).toHaveLength(1);
    expect(timeline().querySelectorAll('.timeline-seg[data-phase="true"]')).toHaveLength(1);
  });

  test('lane packing does not hide the band: behind the "+n" badge the segment is hidden and the band still shows; expanded, the segment shows hatched', async () => {
    await setUp((ws) => (ws.rows[0].workPhase = 'a4'));
    await showTimeline();
    const line = lineOf('A-01');
    const seg = [...line.querySelectorAll<HTMLElement>('.timeline-seg')].find((s) => s.title.startsWith('Testing'))!;
    expect(Number(seg.dataset.lane)).toBeGreaterThanOrEqual(3);
    expect(seg.style.display).toBe('none');
    const band = line.querySelector<HTMLElement>('.timeline-phase')!;
    expect(band.style.display).toBe('');
    expect([Number(band.dataset.from), Number(band.dataset.to)]).toEqual([dayNumber(2024, 1, 20), dayNumber(2024, 2, 2)]);
    line.querySelector<HTMLButtonElement>('.timeline-badge-more')!.click();
    expect(line.dataset.expanded).toBe('true');
    expect(seg.style.display).toBe('');
    expect(seg.dataset.phase).toBe('true');
    // The band is the plot's, not a lane's: it has no lane and no height of its own.
    expect(band.dataset.lane).toBeUndefined();
    expect(band.style.top).toBe('');
    expect(band.style.height).toBe('');
  });

  test('a referenced activity whose dates cannot be read has no band, and the legend has no entry for it', async () => {
    await setUp((ws) => (ws.rows[1].workPhase = 'a2'));
    await showTimeline();
    expect(timeline().querySelectorAll('.timeline-phase')).toHaveLength(0);
    expect(legendKinds()).not.toContain('phase');
  });

  test('an activity edited by hand says so in its title and in the line\'s description', async () => {
    await setUp((ws) => (ws.rows[1].activities![0].edited = true));
    await showTimeline();
    const seg = lineOf('A-02').querySelector<HTMLElement>('.timeline-seg')!;
    expect(seg.dataset.edited).toBe('true');
    expect(seg.title).toBe('Survey: 2024-02-02 – 2024-02-10, 100%, edited by hand');
  });

  test('the legend carries the work-phase entry with its hatched swatch in the timeline only, under the used-only rule', async () => {
    await setUp((ws) => (ws.rows[1].workPhase = 'a1'));
    byId('tab-presentation').click();
    // The map view: no entry.
    expect(legendKinds()).not.toContain('phase');
    byId('pres-mode-timeline').click();
    await flush();
    expect(legendKinds()).toContain('phase');
    const group = byId('presentation-legend').querySelector<HTMLElement>('.legend-group[data-kind="phase"]')!;
    expect(group.querySelector('.legend-group-label')!.textContent).toBe('Work phase');
    expect(group.querySelectorAll('.legend-entry')).toHaveLength(1);
    expect(group.querySelector('.legend-label')!.textContent).toBe('The marked activity of an item');
    expect(group.querySelector('.legend-swatch')!.classList.contains('legend-phase-swatch')).toBe(true);
    // The costs view: no entry, and nothing of the phase.
    byId('pres-mode-costs').click();
    await flush();
    expect(legendKinds()).not.toContain('phase');
    expect(byId('presentation-costs').querySelectorAll('.timeline-phase, [data-phase]')).toHaveLength(0);
    // Used-only: with the item switched off, the entry goes.
    byId('pres-mode-timeline').click();
    await flush();
    document.querySelectorAll<HTMLInputElement>('#visibility-list input[type="checkbox"]')[1].click();
    expect(legendKinds()).not.toContain('phase');
    // The Map segment's legend is the working palette and has no entry.
    expect([...byId('map-legend').querySelectorAll<HTMLElement>('.legend-group')].map((g) => g.dataset.kind)).not.toContain('phase');
  });

  test('without a work phase, the timeline and the legend are as before', async () => {
    await setUp();
    await showTimeline();
    expect(timeline().querySelectorAll('.timeline-phase, [data-phase]')).toHaveLength(0);
    expect(legendKinds()).not.toContain('phase');
  });

  test('the card is untouched: it shows nothing of the phase or the corrections', async () => {
    await setUp((ws) => {
      ws.rows[1].workPhase = 'a1';
      ws.rows[1].activities![0].edited = true;
    });
    await showTimeline();
    lineOf('A-02').querySelector<HTMLButtonElement>('.timeline-entry')!.click();
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.textContent).not.toMatch(/Work phase|edited by hand|Survey/);
    expect(card.querySelector('.details-correct-activities')).toBeNull();
  });

  test('the exported viewer shows the band and the legend entry, view-only', async () => {
    const app = await setUp((ws) => (ws.rows[1].workPhase = 'a1'));
    await showTimeline();
    const doc = new DOMParser().parseFromString(app.exportPage(new Date(2026, 10, 9, 10, 0))!, 'text/html');
    const viewer = await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(viewer.captureWorkState().rows[1].workPhase).toBe('a1');
    expect(timeline().querySelectorAll('.timeline-phase')).toHaveLength(1);
    expect(legendKinds()).toContain('phase');
    expect(byId('activity-panel').classList.contains('hidden')).toBe(true);
  });
});
