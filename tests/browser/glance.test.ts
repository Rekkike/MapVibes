// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';

// The at-a-glance end column (FR-46 as amended in v1.3.0) in a real layout:
// fresh work shows the end values by default, and a version 6 work whose
// saved choice lacks the end column shows them after migration, in both
// segments. Since v1.3.1 (FR-46 as amended), work with no deliberate choice
// shows the full defaults, the area, start, and end, in both segments: a
// version 5 work from before the choice, and a list imported after the demo,
// which before kept the demo's choice. Run after the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');
const EXAMPLE = join(process.cwd(), 'example-data');

let browser: Browser;

beforeAll(async () => {
  if (!existsSync(BUILT)) throw new Error('dist/build/index.html is missing: run the build first');
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function open(): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await page.selectOption('#select-language', 'en');
  return page;
}

// The values shown in the at-a-glance entries of a segment.
async function glanceValues(page: Page, prefix: 'map' | 'presentation'): Promise<string[]> {
  return page.locator(`#${prefix}-glance-list .glance-values`).allTextContents();
}

describe('the at-a-glance end column in a browser (FR-46)', () => {
  test('fresh work shows the end values by default, in both segments', async () => {
    const page = await open();
    await page.setInputFiles('#file-input', join(EXAMPLE, 'example.xlsx'));
    await page.selectOption('.role-select[data-header="ID"]', 'identifier');
    await page.selectOption('.role-select[data-header="End"]', 'end');
    await page.click('#tab-map');
    await page.setInputFiles('#map-file-input', join(EXAMPLE, 'example-background.png'));
    await page.waitForFunction(() => document.getElementById('map-stage')!.dataset.hasBackground === 'true');
    const box = (await page.locator('#map-stage').boundingBox())!;
    await page.locator('.placement-item').nth(0).dragTo(page.locator('#map-stage'), { targetPosition: { x: Math.round(box.width * 0.3), y: Math.round(box.height / 2) } });
    await page.locator('.placement-item').nth(2).dragTo(page.locator('#map-stage'), { targetPosition: { x: Math.round(box.width * 0.6), y: Math.round(box.height / 2) } });
    const map = await glanceValues(page, 'map');
    expect(map.join(' ')).toContain('2024-02-01');
    expect(map.join(' ')).toContain('2024-03-15');
    await page.click('#tab-presentation');
    await page.waitForTimeout(300);
    expect((await glanceValues(page, 'presentation')).join(' ')).toContain('2024-02-01');
    await page.context().close();
  }, 60_000);

  test('a version 6 work whose choice lacks the end column shows it after migration, in both segments', async () => {
    const page = await open();
    await page.setInputFiles('#work-file-input', join(EXAMPLE, 'example-work-state-v6.json'));
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length > 0);
    await page.click('#tab-map');
    await page.waitForTimeout(300);
    const map = (await glanceValues(page, 'map')).join(' ');
    expect(map).toContain('2024-02-01');
    // The picker shows the end column as chosen, and it governs both panels.
    expect(await page.locator('.glance-column-toggle[data-header="End"]').isChecked()).toBe(true);
    await page.click('#tab-presentation');
    await page.waitForTimeout(300);
    expect((await glanceValues(page, 'presentation')).join(' ')).toContain('2024-02-01');
    await page.click('#tab-map');
    await page.locator('#glance-columns-summary').click();
    await page.locator('.glance-column-toggle[data-header="End"]').uncheck();
    expect((await glanceValues(page, 'map')).join(' ')).not.toContain('2024-02-01');
    await page.click('#tab-presentation');
    await page.waitForTimeout(300);
    expect((await glanceValues(page, 'presentation')).join(' ')).not.toContain('2024-02-01');
    await page.context().close();
  }, 60_000);

  // The example's first item shows its area, start, and end; the second its
  // area and start (its end is empty).
  async function expectFullDefaults(page: Page): Promise<void> {
    for (const prefix of ['map', 'presentation'] as const) {
      await page.click(`#tab-${prefix}`);
      await page.click(prefix === 'map' ? '#map-fit' : '#pres-fit');
      await page.waitForTimeout(300);
      const headers = await page.locator(`#${prefix}-glance-list .glance-entry`).first().locator('.glance-value').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.header));
      expect(headers, prefix).toEqual(['Group', 'Start', 'End']);
    }
  }

  test('a version 5 work from before the choice shows the full defaults, in both segments', async () => {
    const page = await open();
    await page.setInputFiles('#work-file-input', join(EXAMPLE, 'example-work-state-v5.json'));
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length > 0);
    await expectFullDefaults(page);
    await page.context().close();
  }, 60_000);

  test('a list imported after the demo shows the full defaults, in both segments', async () => {
    const page = await open();
    await page.click('#load-demo');
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11);
    page.on('dialog', (d) => d.accept());
    await page.click('#tab-information');
    await page.setInputFiles('#file-input', join(EXAMPLE, 'example.xlsx'));
    await page.waitForFunction(() => document.querySelector('.role-select[data-header="Group"]') !== null);
    for (const [header, role] of [['ID', 'identifier'], ['Group', 'area'], ['Start', 'start'], ['End', 'end']]) await page.selectOption(`.role-select[data-header="${header}"]`, role);
    await page.click('#tab-map');
    const box = (await page.locator('#map-stage').boundingBox())!;
    await page.locator('.placement-item').nth(0).dragTo(page.locator('#map-stage'), { targetPosition: { x: Math.round(box.width * 0.3), y: Math.round(box.height / 2) } });
    await expectFullDefaults(page);
    await page.context().close();
  }, 60_000);
});
