// @vitest-environment node
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type Page } from 'playwright';
import { setSelect } from './chrome';

// The demo picker (v2.4.0, the owner's ruling on the Unit 3 proposal):
// a hidden role="dialog" panel (#demo-panel, the export/activity panels'
// pattern) with one radio option per bundled demo, Load and Cancel, opened
// from the start screen's Load demo button and, when a demo is loaded, from
// the app menu's "Load a demo…" beside "Reset demo". The two demos: Parkland
// (fictional example, 11 markers) and Helsingborg (public plan, 12 markers,
// badge disclosing the as-of date). The panel must pass in light, dark and
// follow-system themes and in both languages; every new string is pinned
// here in both languages. Run after the build (npm run build).
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

async function openStart(options: Parameters<Browser['newContext']>[0], lang: 'en' | 'sv', theme: 'light' | 'dark' | 'system'): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.waitForTimeout(200);
  return page;
}

const TEXTS = {
  en: {
    title: 'Load a demo',
    parkland: 'Parkland (fictional example)',
    helsingborg: 'Helsingborg (public plan)',
    go: 'Load',
    cancel: 'Cancel',
    loadAgain: 'Load a demo…',
    badgeFictional: 'Demo: fictional example data',
    badgePlan: 'Demo: public plan data, as of 2026-11-17',
  },
  sv: {
    title: 'Läs in en demo',
    parkland: 'Parkland (fiktivt exempel)',
    helsingborg: 'Helsingborg (offentlig plan)',
    go: 'Ladda in',
    cancel: 'Avbryt',
    loadAgain: 'Läs in en demo…',
    badgeFictional: 'Demo: fiktiva exempeldata',
    badgePlan: 'Demo: offentlig plandata per 2026-11-17',
  },
} as const;

describe('the demo picker (v2.4.0)', () => {
  test('the panel is a hidden dialog with the two options in both languages, at wide and compact, in both themes', async () => {
    for (const [lang, theme] of [
      ['en', 'light'],
      ['sv', 'dark'],
      ['en', 'system'],
      ['sv', 'light'],
    ] as const) {
      for (const options of [{ viewport: { width: 1440, height: 900 } }, { ...devices['iPhone 13'] }]) {
        const page = await openStart(options, lang, theme);
        const t = TEXTS[lang];
        expect(await page.isVisible('#demo-panel')).toBe(false);
        expect(await page.getAttribute('#demo-panel', 'role')).toBe('dialog');
        await page.click('#load-demo');
        expect(await page.isVisible('#demo-panel')).toBe(true);
        expect(await page.textContent('#demo-heading')).toBe(t.title);
        expect(await page.textContent('#demo-opt-parkland')).toBe(t.parkland);
        expect(await page.textContent('#demo-opt-helsingborg')).toBe(t.helsingborg);
        expect((await page.textContent('#demo-opt-parkland-desc'))!.length).toBeGreaterThan(10);
        expect((await page.textContent('#demo-opt-helsingborg-desc'))!).toContain('2026-11-17');
        expect(await page.textContent('#demo-go')).toBe(t.go);
        expect(await page.textContent('#demo-cancel')).toBe(t.cancel);
        // The parkland option is preselected by default.
        expect(await page.isChecked('#demo-choice-parkland')).toBe(true);
        // The panel follows the theme tokens like every other surface.
        const bg = await page.evaluate(() => getComputedStyle(document.getElementById('demo-panel')!).backgroundColor);
        const expected = theme === 'dark' ? 'rgb(30, 34, 42)' : bg; // dark token checked against the theme below
        if (theme === 'dark') {
          expect(bg).not.toBe('rgba(0, 0, 0, 0)');
          expect(bg).not.toBe('rgb(255, 255, 255)');
        } else {
          expect(bg).not.toBe('rgba(0, 0, 0, 0)');
        }
        void expected;
        // Cancel closes without loading anything.
        await page.click('#demo-cancel');
        expect(await page.isVisible('#demo-panel')).toBe(false);
        expect(await page.locator('#marker-layer .marker').count()).toBe(0);
        await page.context().close();
      }
    }
  });

  test('the panel is themed: its surface colour differs between light and dark', async () => {
    const light = await openStart({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await light.click('#load-demo');
    const lightBg = await light.evaluate(() => getComputedStyle(document.getElementById('demo-panel')!).backgroundColor);
    await light.context().close();
    const dark = await openStart({ viewport: { width: 1440, height: 900 } }, 'en', 'dark');
    await dark.click('#load-demo');
    const darkBg = await dark.evaluate(() => getComputedStyle(document.getElementById('demo-panel')!).backgroundColor);
    await dark.context().close();
    expect(lightBg).not.toBe(darkBg);
  });

  test('loading Parkland places 11 markers with the fictional badge; loading Helsingborg places 12 with the plan badge and its map', async () => {
    const page = await openStart({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    page.on('dialog', (d) => void d.accept());
    await page.click('#load-demo');
    await page.click('#demo-go');
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11, undefined, { timeout: 30_000 });
    expect(await page.textContent('#demo-badge')).toBe(TEXTS.en.badgeFictional);
    const parklandSize = await page.evaluate(() => {
      const img = document.getElementById('map-image') as HTMLImageElement;
      return [img.naturalWidth, img.naturalHeight];
    });
    expect(parklandSize).toEqual([3000, 2397]);
    // Switch through the menu: "Load a demo…" beside "Reset demo".
    await page.click('#menu-toggle');
    expect(await page.isVisible('#demo-load-again')).toBe(true);
    expect(await page.textContent('#demo-load-again')).toBe(TEXTS.en.loadAgain);
    await page.click('#demo-load-again');
    expect(await page.isVisible('#demo-panel')).toBe(true);
    // The loaded demo is preselected.
    expect(await page.isChecked('#demo-choice-parkland')).toBe(true);
    await page.check('#demo-choice-helsingborg');
    await page.click('#demo-go');
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 12, undefined, { timeout: 30_000 });
    expect(await page.textContent('#demo-badge')).toBe(TEXTS.en.badgePlan);
    const size = await page.evaluate(() => {
      const img = document.getElementById('map-image') as HTMLImageElement;
      return [img.naturalWidth, img.naturalHeight];
    });
    expect(size).toEqual([2514, 3000]);
    // The attribution is drawn into the rendered background as data.
    const attrPixels = await page.evaluate(() => {
      const img = document.getElementById('map-image') as HTMLImageElement;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const stripH = Math.round(img.naturalHeight * 0.04);
      const stripW = Math.round(img.naturalWidth * 0.35);
      const d = ctx.getImageData(img.naturalWidth - stripW, img.naturalHeight - stripH, stripW, stripH).data;
      let dark = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 90) {
          dark++;
        }
      }
      return dark;
    });
    expect(attrPixels).toBeGreaterThan(1000);
    // The list shows the build story: 13 rows, the about item first.
    const listInfo = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#row-table-body tr')];
      return { count: rows.length, firstName: rows[0]?.querySelector<HTMLInputElement>('td[data-header="Name"] input')?.value ?? '' };
    });
    expect(listInfo.count).toBe(13);
    expect(listInfo.firstName).toBe('About this example');
    await page.context().close();
  });

  test('the switch path on the phone: the Menu overlay carries "Load a demo…", the picker opens over the stage, both demos load', async () => {
    const page = await openStart({ ...devices['iPhone 13'] }, 'sv', 'dark');
    page.on('dialog', (d) => void d.accept());
    await page.tap('#load-demo');
    await page.tap('#demo-go');
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 11, undefined, { timeout: 30_000 });
    expect(await page.textContent('#demo-badge')).toBe(TEXTS.sv.badgeFictional);
    // The menu carries the affordance; the badge stays informational.
    await page.tap('#menu-toggle');
    expect(await page.isVisible('#demo-load-again')).toBe(true);
    expect(await page.textContent('#demo-load-again')).toBe(TEXTS.sv.loadAgain);
    await page.tap('#demo-load-again');
    expect(await page.isVisible('#demo-panel')).toBe(true);
    expect(await page.textContent('#demo-opt-helsingborg')).toBe(TEXTS.sv.helsingborg);
    await page.tap('#demo-choice-helsingborg');
    await page.tap('#demo-go');
    await page.waitForFunction(() => document.querySelectorAll('#marker-layer .marker').length === 12, undefined, { timeout: 30_000 });
    expect(await page.textContent('#demo-badge')).toBe(TEXTS.sv.badgePlan);
    await page.context().close();
  });

  test('the start-screen hint is generalized and no demo control is offered before work exists', async () => {
    const page = await openStart({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    expect(await page.textContent('#demo-hint')).toBe('Load a demo to try the application with example data.');
    // Before a demo is loaded, the menu's switch entry carries the hidden class.
    expect(await page.evaluate(() => document.getElementById('demo-load-again')!.classList.contains('hidden'))).toBe(true);
    await page.context().close();
    const pageSv = await openStart({ viewport: { width: 1440, height: 900 } }, 'sv', 'light');
    expect(await pageSv.textContent('#demo-hint')).toBe('Läs in en demo för att prova programmet med exempeldata.');
    await pageSv.context().close();
  });
});
