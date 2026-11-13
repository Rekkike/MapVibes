// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The calendar-anchored zoom of the schedule views (FR-67 as amended in
// v2.2.0, and FR-80's note on the today mark) in a real layout, headless
// Chromium, offline, on the full-test demo, with the clock set to 13 November
// 2026 at noon: the ladder's anchors land on calendar boundaries in their
// order; the zoom and the pan settle onto them; the axis is graded with the
// level in both languages; and the today mark's position is today's place in
// the visible window, measured against the axis's own dated ticks, in both
// views, in the application and in the exported viewer. Run after the build.
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const NOW = new Date('2026-11-13T12:00:00');
const TODAY = Date.UTC(2026, 10, 13) / 86_400_000;

const PROFILES: Array<[string, BrowserContextOptions]> = [
  ['desktop 1440x900', { viewport: { width: 1440, height: 900 } }],
  ['phone 390x844', { ...devices['iPhone 13'] }],
];
const VIEWS = ['timeline', 'costs'] as const;
type View = (typeof VIEWS)[number];

let browser: Browser;
let exported: string;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function openApp(options: BrowserContextOptions, lang = 'en', reduced = false): Promise<Page> {
  const context = await browser.newContext({ ...options, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(`file://${BUILT}`);
  await setSelect(page, 'select-language', lang);
  await page.evaluate(() => document.getElementById('load-demo')!.click());
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  await page.evaluate(() => document.getElementById('tab-presentation')!.click());
  return page;
}

async function showView(page: Page, view: View): Promise<void> {
  await page.evaluate((v) => document.getElementById(`pres-mode-${v}`)!.click(), view);
  await page.waitForTimeout(300);
}

// The plot's place, the ticks with their days and labels, the grade, and
// the today mark's centre, for the view shown.
interface Axis {
  left: number;
  width: number;
  ticks: Array<{ day: number; x: number; label: string }>;
  grade: string | undefined;
  mark: number | null;
  cell: number | null;
  page: [number, number, number, number];
}

function axis(page: Page, view: View): Promise<Axis> {
  return page.evaluate((v) => {
    const root = document.getElementById(`presentation-${v}`)!;
    const plot = root.querySelector('.timeline-axis-plot')!.getBoundingClientRect();
    const mark = root.querySelector('.timeline-today');
    const cell = root.querySelector('.timeline-today-day');
    const m = mark?.getBoundingClientRect();
    return {
      left: plot.left,
      width: plot.width,
      ticks: [...root.querySelectorAll<HTMLElement>('.timeline-tick')].map((t) => ({
        day: Number(t.dataset.day),
        x: t.getBoundingClientRect().left,
        label: t.textContent.trim(),
      })),
      grade: (root.matches('.timeline') ? root : root.querySelector<HTMLElement>('.timeline'))?.dataset.grade,
      mark: m ? m.left + m.width / 2 + 1 : null,
      cell: cell ? cell.getBoundingClientRect().width : null,
      page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight, innerWidth, innerHeight],
    };
  }, view);
}

// The window, read from the axis: two ticks with their days give the scale.
function windowOf(a: Axis): { from: number; to: number } {
  const [p, q] = [a.ticks[0], a.ticks[a.ticks.length - 1]];
  const perDay = (q.x - p.x) / (q.day - p.day);
  const from = p.day - (p.x - a.left) / perDay;
  return { from, to: from + a.width / perDay };
}

const dayOf = (y: number, m: number, d = 1) => Date.UTC(y, m - 1, d) / 86_400_000;
const dateOf = (day: number) => {
  const d = new Date(Math.round(day) * 86_400_000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
};

// The calendar unit of a level that starts at a day, as the ladder defines it.
function unitEnd(level: string, from: number): number {
  const { y, m } = dateOf(from);
  const months = { month: 1, quarter: 3, half: 6, year: 12 }[level]!;
  const end = m - 1 + months;
  return dayOf(y + Math.floor(end / 12), (end % 12) + 1);
}

function expectAnchor(a: Axis, level: string, at: string): void {
  const w = windowOf(a);
  const from = Math.round(w.from);
  const { m, d } = dateOf(from);
  expect(Math.abs(w.from - from), `${at}: the window starts on a day boundary`).toBeLessThan(0.05);
  expect(d, `${at}: the window starts on the 1st`).toBe(1);
  const months = { month: 1, quarter: 3, half: 6, year: 12 }[level]!;
  expect((m - 1) % months, `${at}: the window starts at a ${level}'s first month`).toBe(0);
  expect(Math.abs(w.to - unitEnd(level, from)), `${at}: the window ends at the ${level}'s end`).toBeLessThan(0.05);
}

// Steps the zoom in from the fitted view to the month, and pans to today by
// the edge chip where today lies beyond the window.
async function monthAtToday(page: Page, view: View): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => document.getElementById('pres-zoom-in')!.click());
    await page.waitForTimeout(150);
  }
  await page.evaluate((v) => document.querySelector<HTMLElement>(`#presentation-${v} .timeline-today-edge`)?.click(), view);
  await page.waitForTimeout(500);
}

describe('the zoom ladder (FR-67 as amended in v2.2.0)', () => {
  for (const [name, profile] of PROFILES) {
    test(`on a ${name}: the buttons step year, half-year, quarter, month, each on calendar boundaries, and back out to the fit; no overflow and no page scroll at any level`, async () => {
      const page = await openApp(profile);
      for (const view of VIEWS) {
        await showView(page, view);
        const fit = await axis(page, view);
        const levels = ['year', 'half', 'quarter', 'month'];
        const lengths: number[] = [];
        for (const level of levels) {
          await page.evaluate(() => document.getElementById('pres-zoom-in')!.click());
          await page.waitForTimeout(150);
          const a = await axis(page, view);
          expectAnchor(a, level, `${name} ${view} ${level}`);
          const w = windowOf(a);
          lengths.push(w.to - w.from);
          expect(a.page[0], `${view} ${level}: no sideways overflow`).toBe(a.page[2]);
          expect(a.page[1], `${view} ${level}: no page scroll`).toBe(a.page[3]);
        }
        // The order of the ladder holds: each anchor is narrower than the last.
        for (let i = 1; i < lengths.length; i++) {
          expect(lengths[i]).toBeLessThan(lengths[i - 1]);
        }
        // Month is the deepest level: a further step leaves the window.
        await page.evaluate(() => document.getElementById('pres-zoom-in')!.click());
        await page.waitForTimeout(150);
        expectAnchor(await axis(page, view), 'month', `${name} ${view} below month`);
        for (const level of ['quarter', 'half', 'year']) {
          await page.evaluate(() => document.getElementById('pres-zoom-out')!.click());
          await page.waitForTimeout(150);
          expectAnchor(await axis(page, view), level, `${name} ${view} out to ${level}`);
        }
        await page.evaluate(() => document.getElementById('pres-zoom-out')!.click());
        await page.waitForTimeout(150);
        const back = windowOf(await axis(page, view));
        const fitted = windowOf(fit);
        expect(Math.abs(back.from - fitted.from)).toBeLessThan(0.5);
        expect(Math.abs(back.to - fitted.to)).toBeLessThan(0.5);
        // The fitted view is the outermost level: a further step leaves it.
        await page.evaluate(() => document.getElementById('pres-zoom-out')!.click());
        await page.waitForTimeout(150);
        expect(Math.abs(windowOf(await axis(page, view)).from - fitted.from)).toBeLessThan(0.5);
      }
      await page.context().close();
    }, 120_000);
  }

  test('a wheel zoom settles onto the nearest anchor after its pause; a pan at an anchor settles onto the unit at the new centre; with reduced motion at once', async () => {
    for (const reduced of [false, true]) {
      const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', reduced);
      await showView(page, 'timeline');
      await monthAtToday(page, 'timeline');
      // Out from the month with the wheel to about two months' span: the
      // quarter is nearest on the logarithmic scale.
      const plot = await axis(page, 'timeline');
      const x = plot.left + plot.width / 2;
      await page.mouse.move(x, 400);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 340);
      await page.keyboard.up('Control');
      await page.waitForTimeout(reduced ? 300 : 650);
      expectAnchor(await axis(page, 'timeline'), 'quarter', `wheel settle (reduced ${reduced})`);
      // A sideways drag at the quarter across most of the plot (about 80
      // days, into the next quarter), then the release: the quarter at the
      // new centre. The drag runs below "In view" and above the legend.
      const before = windowOf(await axis(page, 'timeline'));
      await page.mouse.move(plot.left + plot.width - 60, 600);
      await page.mouse.down();
      await page.mouse.move(plot.left + 120, 600, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(reduced ? 50 : 450);
      const after = await axis(page, 'timeline');
      expectAnchor(after, 'quarter', `pan settle (reduced ${reduced})`);
      expect(windowOf(after).from).toBeGreaterThan(before.from);
      await page.context().close();
    }
  }, 120_000);
});

describe('the axis grade (FR-67 as amended in v2.2.0)', () => {
  test('day numbers at the month with the 1st named, month names at the quarter and the half-year, years beyond, the year on the first label and every January; in both languages', async () => {
    for (const lang of ['en', 'sv']) {
      // The interface language's locale, as the application names it.
      const locale = lang === 'sv' ? 'sv-SE' : 'en-GB';
      const page = await openApp({ viewport: { width: 1440, height: 900 } }, lang);
      for (const view of VIEWS) {
        await showView(page, view);
        expect((await axis(page, view)).grade).toBe('years');
        const grades: Array<[string, string]> = [
          ['years', 'year'],
          ['months', 'half'],
          ['months', 'quarter'],
          ['days', 'month'],
        ];
        for (const [grade, level] of grades) {
          await page.evaluate(() => document.getElementById('pres-zoom-in')!.click());
          await page.waitForTimeout(150);
          const a = await axis(page, view);
          expect(a.grade, `${lang} ${view} ${level}`).toBe(grade);
          a.ticks.forEach((t, i) => {
            const { y, m, d } = dateOf(t.day);
            // The first label and every January carry the year beside the
            // month's name (FR-67 as amended in v2.2.1).
            const year = i === 0 || (m === 1 && d === 1) ? { year: 'numeric' as const } : {};
            const at = new Date(t.day * 86_400_000);
            const month = new Intl.DateTimeFormat(locale, { month: 'short', ...year, timeZone: 'UTC' }).format(at);
            if (grade === 'years') {
              expect([m, d, t.label]).toEqual([1, 1, String(y)]);
            } else if (grade === 'months') {
              expect([d, t.label]).toEqual([1, month]);
            } else {
              expect(t.label).toBe(
                d === 1 || i === 0 ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', ...year, timeZone: 'UTC' }).format(at) : String(d),
              );
              // The days of the ruling where every day has no room.
              expect([1, 8, 15, 22, 29]).toContain(d);
            }
          });
          // The window's year is on its first label at every anchored grade.
          if (grade !== 'years') {
            expect(a.ticks[0].label).toContain(String(dateOf(a.ticks[0].day).y));
          }
        }
        await page.evaluate(() => document.getElementById('pres-fit')!.click());
        await page.waitForTimeout(150);
      }
      await page.context().close();
    }
  }, 120_000);
});

// The today mark's truth: its centre is noon of today's place in the window
// that the axis's own dated ticks define.
async function expectToday(page: Page, view: View, at: string): Promise<Axis> {
  const a = await axis(page, view);
  const w = windowOf(a);
  expect(a.mark, `${at}: the mark is drawn`).not.toBeNull();
  const fraction = (a.mark! - a.left) / a.width;
  expect(Math.abs(fraction - (TODAY + 0.5 - w.from) / (w.to - w.from)), `${at}: the mark at today's place`).toBeLessThan(1.5 / a.width + 0.0005);
  return a;
}

describe('the today mark (FR-80 as noted in v2.2.0)', () => {
  for (const [name, profile] of PROFILES) {
    test(`in the application on a ${name}: at today's place in the window at the fit and at the month, with today's day cell shaded at the month, in both views`, async () => {
      const page = await openApp(profile);
      for (const view of VIEWS) {
        await showView(page, view);
        await expectToday(page, view, `${name} ${view} fit`);
        await monthAtToday(page, view);
        const a = await expectToday(page, view, `${name} ${view} month`);
        expectAnchor(a, 'month', `${name} ${view} month at today`);
        // November 2026: noon of the 13th is 12.5 thirtieths of the window.
        expect(Math.abs((a.mark! - a.left) / a.width - 12.5 / 30)).toBeLessThan(1.5 / a.width + 0.0005);
        expect(a.cell, 'the day cell is one day wide').toBeCloseTo(a.width / 30, 0);
        await page.evaluate(() => document.getElementById('pres-fit')!.click());
        await page.waitForTimeout(150);
        expect((await axis(page, view)).cell, 'no day cell beyond the month level').toBeNull();
      }
      await page.context().close();
    }, 120_000);
  }

  test('the exported file is written from the demo', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } });
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-zoom-')), 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();
  }, 90_000);

  for (const [name, profile] of PROFILES) {
    test(`in the exported viewer on a ${name}: the ladder steps on calendar boundaries and the mark is at today's place, in both views`, async () => {
      const context = await browser.newContext({ ...profile });
      await context.setOffline(true);
      const page = await context.newPage();
      await page.clock.setFixedTime(NOW);
      await page.goto(`file://${exported}`);
      await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
      await page.waitForTimeout(500);
      for (const view of VIEWS) {
        await showView(page, view);
        await expectToday(page, view, `viewer ${name} ${view} fit`);
        await monthAtToday(page, view);
        const a = await expectToday(page, view, `viewer ${name} ${view} month`);
        expectAnchor(a, 'month', `viewer ${name} ${view} month`);
        expect(a.grade).toBe('days');
        expect(a.page[0]).toBe(a.page[2]);
        await page.evaluate(() => document.getElementById('pres-fit')!.click());
        await page.waitForTimeout(150);
      }
      await context.close();
    }, 120_000);
  }
});

// The readout says the window (FR-67 as amended in v2.2.1).
const READOUT: Record<string, string[]> = {
  en: ['2024\u20132037', '2031', 'H2 2031', 'Q4 2031', 'Nov 2031'],
  sv: ['2024\u20132037', '2031', 'H2 2031', 'K4 2031', 'nov. 2031'],
};

async function readouts(page: Page, view: View): Promise<string[]> {
  await showView(page, view);
  const out: string[] = [];
  for (let i = 0; i < 5; i++) {
    out.push((await page.textContent('#pres-zoom-level'))!);
    await page.evaluate(() => document.getElementById('pres-zoom-in')!.click());
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => document.getElementById('pres-fit')!.click());
  await page.waitForTimeout(120);
  return out;
}

describe('the readout (FR-67 as amended in v2.2.1)', () => {
  test('it says the window at every level, in both languages and both views, in the application; the map view keeps its percentage; a window at no anchor shows its ends', async () => {
    for (const lang of ['en', 'sv']) {
      const page = await openApp({ viewport: { width: 1440, height: 900 } }, lang);
      await page.waitForTimeout(200);
      expect(await page.textContent('#pres-zoom-level')).toMatch(/^\d+%$/);
      for (const view of VIEWS) {
        expect(await readouts(page, view), `${lang} ${view}`).toEqual(READOUT[lang]);
      }
      // From the month, a wheel zoom read before its settling pause: the
      // window's ends at the axis's grade; then the settled anchor's label.
      await showView(page, 'timeline');
      await monthAtToday(page, 'timeline');
      const plot = await axis(page, 'timeline');
      await page.mouse.move(plot.left + plot.width / 2, 400);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, 300);
      await page.keyboard.up('Control');
      const between = (await page.textContent('#pres-zoom-level'))!;
      expect(between, `${lang} between anchors`).toContain('\u2013');
      expect(between).toContain('2026');
      await page.waitForTimeout(700);
      expect(await page.textContent('#pres-zoom-level')).toBe(lang === 'en' ? 'Q4 2026' : 'K4 2026');
      await page.context().close();
    }
  }, 120_000);

  test('in the exported viewer, in both views', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.setOffline(true);
    const page = await context.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(`file://${exported}`);
    await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer');
    await page.waitForTimeout(500);
    for (const view of VIEWS) {
      expect(await readouts(page, view), `viewer ${view}`).toEqual(READOUT.en);
    }
    await context.close();
  }, 120_000);
});

// The floating view switch and the schedule's axis labels (FR-67 as amended
// in v2.2.1): no overlap at any class, before and after the four-second
// withdrawal.
describe('the view switch clears the axis (FR-67 as amended in v2.2.1)', () => {
  const CLASSES: Array<[string, BrowserContextOptions]> = [
    ['compact 390x844', { ...devices['iPhone 13'] }],
    ['compact 320x568', { ...devices['iPhone SE'] }],
    ['short 844x390', { ...devices['iPhone 13 landscape'] }],
    ['medium 768x1024', { viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true }],
    ['wide 1440x900', { viewport: { width: 1440, height: 900 } }],
    ['extra wide 1920x1080', { viewport: { width: 1920, height: 1080 } }],
  ];
  const covered = (page: Page, view: View) =>
    page.evaluate((v) => {
      const pill = document.getElementById('presentation-toolbar')!;
      const s = getComputedStyle(pill);
      const b = pill.getBoundingClientRect();
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0 || b.width === 0) {
        return { shown: false, hit: 0, labels: 0 };
      }
      const labels = [...document.querySelectorAll(`#presentation-${v} .timeline-tick`)].map((t) => t.getBoundingClientRect());
      const hit = labels.filter((l) => l.right > b.left && l.left < b.right && l.bottom > b.top && l.top < b.bottom).length;
      return { shown: true, hit, labels: labels.length };
    }, view);

  for (const [name, profile] of CLASSES) {
    test(`${name}: in both languages and both schedule views, at rest and after the idle withdrawal`, async () => {
      for (const lang of ['en', 'sv']) {
        const context = await browser.newContext({ ...profile });
        await context.setOffline(true);
        const page = await context.newPage();
        await page.clock.install({ time: NOW });
        await page.goto(`file://${BUILT}`);
        await page.evaluate((l) => {
          const select = document.getElementById('select-language') as HTMLSelectElement;
          select.value = l;
          select.dispatchEvent(new Event('change'));
          document.getElementById('load-demo')!.click();
        }, lang);
        await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
        await page.evaluate(() => document.getElementById('tab-presentation')!.click());
        for (const view of VIEWS) {
          await page.evaluate((v) => document.getElementById(`pres-mode-${v}`)!.click(), view);
          await page.waitForTimeout(300);
          const rest = await covered(page, view);
          expect(rest.hit, `${name} ${lang} ${view} at rest`).toBe(0);
          await page.clock.runFor(4500);
          await page.waitForTimeout(300);
          expect((await covered(page, view)).hit, `${name} ${lang} ${view} after the withdrawal`).toBe(0);
        }
        await context.close();
      }
    }, 120_000);
  }
});
