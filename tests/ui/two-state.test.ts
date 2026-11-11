import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, openWorkFile, placeExampleMarkers, setRole, textFile } from './harness';
import { serialiseWorkState, type WorkState } from '../../src/workstate';

// The two states of a schedule line (FR-78, FR-79 as amended in v1.14.0) and
// the split of its controls (FR-35, FR-67 as amended): the number-and-name
// chip opens the card, anchored beside the chip; the plot expands and
// collapses the line, with its expanded state exposed and reachable by the
// keyboard; the quiet indicator counts the activities in the timeline and
// is marked without a count in the costs view.

type App = Awaited<ReturnType<typeof mountApp>>;

const view = (name: string) => byId(`presentation-${name}`);
const lineOf = (v: string, item: string) => [...view(v).querySelectorAll<HTMLElement>('.timeline-line')].find((li) => li.querySelector('.timeline-title')!.textContent === item)!;
const chip = (line: HTMLElement) => line.querySelector<HTMLButtonElement>('.timeline-chip')!;
const control = (line: HTMLElement) => line.querySelector<HTMLElement>('.timeline-plot-control')!;
const card = () => byId('presentation-card');

// The example workbook with activities on two items (five on the first, two
// on the second) and year series assigned, so that both views have
// something to expand.
async function setUp(change: (ws: WorkState) => void = () => undefined): Promise<App> {
  const app = await mountApp({ singleFile: true });
  window.confirm = () => true;
  await placeExampleMarkers([[0, 100, 100], [1, 300, 150]], 'example-economics.xlsx');
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  for (const [key, role] of [['budget', 'budget'], ['prognos', 'forecast'], ['utfall', 'outcome']]) {
    const select = document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`)!;
    select.value = role;
    select.dispatchEvent(new Event('change'));
  }
  const ws = app.captureWorkState();
  ws.rows[0].activities = [
    { id: 'a1', label: 'Groundwork', start: '2020-01-05', end: '2020-06-20', progress: 100 },
    { id: 'a2', label: 'Piping', start: '2020-03-10', end: '2020-09-25', progress: 60 },
    { id: 'a3', label: 'Wiring', start: '2020-05-15', end: '2020-12-30', progress: 0 },
    { id: 'a4', label: 'Testing', start: '2021-01-20', end: '2021-06-01', progress: null },
    { id: 'a5', label: 'Handover', start: '15/03/2032', end: '2032-06-15', progress: 10 },
  ];
  ws.rows[2].activities = [
    { id: 'a1', label: 'Survey', start: '2025-02-02', end: '2025-05-10', progress: 100 },
    { id: 'a2', label: 'Report', start: '2026-02-20', end: '2026-08-01', progress: 40 },
  ];
  change(ws);
  openWorkFile(textFile('work.json', serialiseWorkState(ws, new Date())));
  await flush();
  byId('tab-presentation').click();
  return app;
}

async function show(v: 'timeline' | 'costs'): Promise<void> {
  byId(`pres-mode-${v}`).click();
  await flush();
}

describe('the split of a line\'s controls (FR-35, FR-67, FR-78 as amended)', () => {
  test('each line holds two real controls -- the chip and, where there is something to reveal, the plot -- in a line that is not itself a control; no control is nested in another', async () => {
    await setUp();
    await show('timeline');
    for (const li of view('timeline').querySelectorAll<HTMLElement>('.timeline-line')) {
      const entry = li.querySelector<HTMLElement>('.timeline-entry')!;
      expect(entry.tagName).toBe('DIV');
      expect(chip(li).tagName).toBe('BUTTON');
      expect(chip(li).type).toBe('button');
      expect(li.querySelectorAll('button button')).toHaveLength(0);
    }
    const long = lineOf('timeline', 'Long item');
    expect(control(long).tagName).toBe('BUTTON');
    expect(control(long).getAttribute('aria-expanded')).toBe('false');
    // A line with nothing to reveal has no plot control.
    expect(control(lineOf('timeline', 'No economics')).tagName).toBe('SPAN');
    // The old badge is gone.
    expect(view('timeline').querySelector('.timeline-badge-more')).toBeNull();
  });

  test('the chip opens the card; a press on the plot expands and collapses the line and leaves the card alone', async () => {
    await setUp();
    await show('timeline');
    // The lines are drawn again on every change: each is found afresh.
    const long = () => lineOf('timeline', 'Long item');
    control(long()).click();
    expect(long().dataset.expanded).toBe('true');
    expect(control(long()).getAttribute('aria-expanded')).toBe('true');
    expect(card().dataset.state).not.toBe('open');
    chip(long()).click();
    expect(card().dataset.state).toBe('open');
    expect(card().textContent).toContain('Long item');
    expect(long().dataset.expanded).toBe('true');
    control(long()).click();
    expect(long().dataset.expanded).toBe('false');
    expect(control(long()).getAttribute('aria-expanded')).toBe('false');
    expect(card().dataset.state).toBe('open');
    // A press on the plot of a line with nothing to reveal does nothing.
    const none = lineOf('timeline', 'No economics');
    control(none).click();
    expect(none.dataset.expanded).toBe('false');
    expect(card().textContent).toContain('Long item');
  });

  test('the keyboard path: the chip and the plot are tab stops in line order; Escape returns focus to the chip', async () => {
    await setUp();
    await show('timeline');
    const stops = [...view('timeline').querySelectorAll<HTMLElement>('button')].filter((b) => b.closest('.timeline-lines'));
    const title = (b: HTMLElement) => b.closest('li')!.querySelector('.timeline-title')!.textContent;
    expect(stops.map((b) => `${b.classList.contains('timeline-chip') ? 'chip' : 'plot'} ${title(b)}`)).toEqual([
      'chip Long item', 'plot Long item', 'chip No economics', 'chip Budget only', 'plot Budget only', 'chip Gaps', 'chip Outside',
    ]);
    expect(stops.every((b) => b.tabIndex === 0)).toBe(true);
    chip(lineOf('timeline', 'Long item')).focus();
    chip(lineOf('timeline', 'Long item')).click();
    byId('presentation-stage').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card().dataset.state).toBe('closed');
    expect(document.activeElement).toBe(chip(lineOf('timeline', 'Long item')));
  });

  test('the controls\' accessible names: the chip carries the line\'s description, the plot its activities or series', async () => {
    await setUp();
    await show('timeline');
    const long = lineOf('timeline', 'Long item');
    expect(chip(long).getAttribute('aria-label')).toMatch(/^1: Long item, 2020 – 2032\. Activities: Groundwork/);
    expect(control(long).getAttribute('aria-label')).toBe('Activities of 1: Long item: 4');
    await show('costs');
    expect(control(lineOf('costs', 'Long item')).getAttribute('aria-label')).toBe('Series by year of 1: Long item');
  });

  test('the indicator counts the activities a press reveals in the timeline, and is a mark without a count in the costs view', async () => {
    await setUp();
    await show('timeline');
    const indicator = (li: HTMLElement) => li.querySelector('.timeline-indicator');
    // Four drawn; the fifth has a date that cannot be read.
    expect(indicator(lineOf('timeline', 'Long item'))!.textContent).toBe('4');
    expect(indicator(lineOf('timeline', 'Budget only'))!.textContent).toBe('2');
    expect(indicator(lineOf('timeline', 'No economics'))).toBeNull();
    expect(indicator(lineOf('timeline', 'Long item'))!.getAttribute('aria-hidden')).toBe('true');
    // Part of the plot's control: a press on it expands.
    expect(indicator(lineOf('timeline', 'Long item'))!.parentElement).toBe(control(lineOf('timeline', 'Long item')));
    await show('costs');
    // In the costs view, the lines with forecast or outcome to reveal.
    expect([...view('costs').querySelectorAll<HTMLElement>('.timeline-line')].map((li) => indicator(li)?.textContent ?? null)).toEqual(['≡', null, null, '≡', null]);
  });

  test('several lines stand open at once; the expansion is transient, never saved, and survives a re-render, zoom, fit, and a change of order', async () => {
    const app = await setUp();
    await show('timeline');
    control(lineOf('timeline', 'Long item')).click();
    control(lineOf('timeline', 'Budget only')).click();
    const open = () => [...view('timeline').querySelectorAll<HTMLElement>('.timeline-line[data-expanded="true"]')].map((li) => li.querySelector('.timeline-title')!.textContent);
    expect(open()).toEqual(['Long item', 'Budget only']);
    byId('pres-zoom-in').click();
    byId('pres-fit').click();
    const order = byId<HTMLSelectElement>('pres-order');
    order.value = 'start';
    order.dispatchEvent(new Event('change'));
    expect(open().sort()).toEqual(['Budget only', 'Long item']);
    const text = serialiseWorkState(app.captureWorkState(), new Date());
    expect(text).not.toMatch(/expand/i);
    // Switching views and back keeps them open; each view has its own.
    await show('costs');
    expect(view('costs').querySelectorAll('.timeline-line[data-expanded="true"]')).toHaveLength(0);
    await show('timeline');
    expect(open().sort()).toEqual(['Budget only', 'Long item']);
  });

  test('the card is anchored beside the chip that opened it', async () => {
    await setUp();
    await show('timeline');
    // jsdom has no layout: the stage and every chip get a box.
    const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.id === 'presentation-stage') return rect(100, 50, 800, 600);
      if (this.classList.contains('timeline-chip')) return rect(100, 130, 180, 28);
      return original.call(this);
    };
    try {
      chip(lineOf('timeline', 'Long item')).click();
      // At the chip's right edge, with the card's gap of 28 pixels.
      expect(card().style.left).toBe('208px');
      expect(card().dataset.side).toBe('right');
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
});

describe('the timeline\'s two states (FR-78 as amended)', () => {
  const segs = (li: HTMLElement) => [...li.querySelectorAll<HTMLElement>('.timeline-seg')];
  const names = (li: HTMLElement) => [...li.querySelectorAll<HTMLElement>('.timeline-lane-label')];

  test('collapsed, a line shows its own bar alone: no activity segment and no name is drawn', async () => {
    await setUp((ws) => (ws.rows[0].workPhase = 'a2'));
    await show('timeline');
    const long = lineOf('timeline', 'Long item');
    expect(long.dataset.expanded).toBe('false');
    expect(segs(long)).toHaveLength(4);
    expect(segs(long).every((s) => s.style.display === 'none')).toBe(true);
    expect(names(long).every((n) => n.dataset.place === 'none')).toBe(true);
    // The own bar is the plain line's centred bar.
    const bar = long.querySelector<HTMLElement>('.timeline-bar')!;
    expect([bar.style.display, bar.style.top, bar.style.height]).toEqual(['', '', '']);
    // The band stays, unbidden.
    expect(long.querySelector<HTMLElement>('.timeline-phase')!.style.display).toBe('');
    // One lane high.
    expect(long.style.getPropertyValue('--timeline-plot-h')).toBe('28px');
  });

  test('expanded, the lanes are whole: the plot is the lane count times the lane, each bar in its own row', async () => {
    await setUp();
    await show('timeline');
    control(lineOf('timeline', 'Long item')).click();
    const long = lineOf('timeline', 'Long item');
    const lanes = Number(long.dataset.lanes);
    expect(lanes).toBe(4);
    expect(long.style.getPropertyValue('--timeline-plot-h')).toBe(`${lanes * 28}px`);
    expect(segs(long).every((s) => s.style.display === '')).toBe(true);
    for (const s of segs(long)) {
      const lane = Number(s.dataset.lane);
      expect(Number.parseFloat(s.style.top)).toBe(lane * 28 + 7);
      expect(s.style.height).toBe('14px');
    }
    // The progress fill inside the bar.
    expect(segs(long).map((s) => s.querySelector<HTMLElement>('.timeline-seg-fill')!.style.width)).toEqual(['100%', '60%', '0%', '0%']);
  });

  test('expanded, each activity\'s name stands beside its bar in its lane, or nowhere, its title the fallback; never on the bar', async () => {
    await setUp();
    await show('timeline');
    control(lineOf('timeline', 'Long item')).click();
    const long = lineOf('timeline', 'Long item');
    expect(names(long).map((n) => n.textContent)).toEqual(['Groundwork', 'Piping', 'Wiring', 'Testing']);
    // jsdom has no layout: the names are placed by their estimated widths.
    expect(names(long).every((n) => ['after', 'before', 'none'].includes(n.dataset.place!))).toBe(true);
    expect(names(long).some((n) => n.dataset.place !== 'none')).toBe(true);
    for (const n of names(long)) {
      expect(n.parentElement!.classList.contains('timeline-plot')).toBe(true);
      expect(n.getAttribute('aria-hidden')).toBe('true');
      expect(n.style.top).toBe(`${Number(n.dataset.lane) * 28}px`);
    }
    // No name is written inside a bar any more.
    expect(long.querySelectorAll('.timeline-seg .timeline-seg-label, .timeline-seg .timeline-lane-label')).toHaveLength(0);
    expect(segs(long)[0].title).toBe('Groundwork: 2020-01-05 – 2020-06-20, 100%');
  });

  test('collapsing again hides the segments and the names', async () => {
    await setUp();
    await show('timeline');
    control(lineOf('timeline', 'Long item')).click();
    control(lineOf('timeline', 'Long item')).click();
    const long = lineOf('timeline', 'Long item');
    expect(segs(long).every((s) => s.style.display === 'none')).toBe(true);
    expect(names(long).every((n) => n.dataset.place === 'none')).toBe(true);
  });
});

describe('the costs view\'s two states (FR-79 as amended)', () => {
  const shown = (li: HTMLElement) => [...li.querySelectorAll<HTMLElement>('.timeline-seg')].filter((s) => s.style.display !== 'none');

  test('collapsed, a costs line shows its budget alone, as its spine, at the line\'s rhythm; pressed, the three sub-lanes', async () => {
    await setUp();
    await show('costs');
    const long = () => lineOf('costs', 'Long item');
    expect(long().style.getPropertyValue('--timeline-plot-h')).toBe('28px');
    expect([...new Set(shown(long()).map((s) => s.dataset.series))]).toEqual(['budget']);
    expect(shown(long())).toHaveLength(13);
    for (const s of shown(long())) expect([s.style.top, s.style.height]).toEqual(['8px', '12px']);
    control(long()).click();
    expect(long().style.getPropertyValue('--timeline-plot-h')).toBe('46px');
    expect([...new Set(shown(long()).map((s) => s.dataset.series))]).toEqual(['budget', 'forecast', 'outcome']);
    expect(shown(long())).toHaveLength(31);
    // The totals row is unchanged.
    expect(view('costs').querySelector('.timeline-totals')!.querySelectorAll('.timeline-seg').length).toBeGreaterThan(0);
  });

  test('a year that carries forecast or outcome but no budget shows a quiet tick while collapsed', async () => {
    await setUp();
    await show('costs');
    // E-04: "ca 1 M" is no number, so 2024 has a forecast and no budget.
    const gaps = lineOf('costs', 'Gaps');
    const ticks = [...gaps.querySelectorAll<HTMLElement>('.timeline-year-tick')];
    expect(ticks.map((t) => t.title)).toEqual(['2024: Prognos, no budget']);
    expect(ticks[0].style.left).not.toBe('');
    // No other line has one: every other year with a value has its budget.
    expect(view('costs').querySelectorAll('.timeline-year-tick')).toHaveLength(1);
  });
});
