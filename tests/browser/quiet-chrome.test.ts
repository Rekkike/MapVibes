// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The quiet chrome (FR-37 and FR-38 as amended in v2.1.0) counts every
// interaction, wherever it lands (fix-forward of v2.7.0's CI): the schedule
// views stop the pointer and the wheel at their root so that the map
// underneath never receives them, and the card stops the pointer too; the
// quiet chrome must still see them, or the floating chrome withdraws after
// four seconds while the user is working inside a view. The release
// workflow's run 72 caught it: five presses on the timeline's lines outlasted
// the idle delay on the slower runner, and Fit view had withdrawn. Run after
// the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) {
    throw new Error('dist/build/index.html is missing: run the build first');
  }
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function timeline(options: Parameters<Browser['newContext']>[0]): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.evaluate(() => {
    const s = document.querySelector<HTMLSelectElement>('#select-language')!;
    s.value = 'en';
    s.dispatchEvent(new Event('change'));
    document.querySelector<HTMLButtonElement>('#load-demo')!.click();
    document.getElementById('demo-go')!.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#tab-presentation')!.click());
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#pres-mode-timeline')!.click());
  await page.waitForTimeout(400);
  return page;
}

describe('the quiet chrome sees the interaction inside the schedule views', () => {
  for (const [name, options] of [
    ['1500x950', { viewport: { width: 1500, height: 950 } }],
    ['390x844', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ] as const) {
    test(`moving and pressing inside the timeline for longer than the idle delay keeps the chrome on ${name}`, async () => {
      const page = await timeline(options);
      const body = (await page.locator('#presentation-timeline .timeline-body').boundingBox())!;
      // Six seconds of interaction inside the timeline only, well past the
      // four-second idle delay: pointer moves, and a press on a line's plot.
      for (let i = 0; i < 8; i++) {
        await page.mouse.move(body.x + 40 + i * 6, body.y + body.height / 2);
        if (i === 4) {
          await page
            .locator('#presentation-timeline button.timeline-plot-control')
            .first()
            .click({ position: { x: 3, y: 3 } });
        }
        await page.waitForTimeout(750);
      }
      expect(await page.evaluate(() => document.documentElement.dataset.idle ?? 'active')).toBe('active');
      await page.click('#pres-fit', { timeout: 3000 });
      // With no interaction at all the chrome still withdraws, as ruled.
      await page.waitForTimeout(4600);
      expect(await page.evaluate(() => document.documentElement.dataset.idle)).toBe('true');
      await page.context().close();
    }, 60_000);
  }
});
