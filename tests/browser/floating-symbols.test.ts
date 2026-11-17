// @vitest-environment node
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chromium, devices, type Browser, type BrowserContextOptions, type Page } from 'playwright';
import { pressExport, setSelect } from './chrome';

// The floating chrome's symbols (v2.2.2, Unit 1's pin): every icon button
// draws ink -- no button can ship invisible again. Two mechanisms made
// buttons blank on the phone, both found by the census of every floating
// control at every class, both languages, both themes, both pointer kinds,
// in the application and in the exported viewer: (A) the four overlay
// toggles (#toggle-items, #toggle-visibility, #toggle-map-glance,
// #toggle-glance) are icon-shaped (hidden text, masked ::before glyph) but
// were left out of the position: relative anchor rule, so the absolutely
// positioned glyph anchored to the toolbar instead of the button and the
// 44-pixel box shipped blank -- right of the sort dropdown in the
// Presentation pill and in the Map bar on the phone; (B) the viewer's
// short-class rail shapes the zoom buttons as icon buttons (text pushed out
// by text-indent, masked ::before) but no --glyph is defined for them, so
// the mask resolved to none. This suite asserts, for every button of the
// floating chrome at every class: an icon-shaped button is positioned (its
// glyph anchors inside it), its text-hidden button has a mask, every mask's
// --glyph is defined and its data URI decodes to an image with opaque
// pixels. It fails on the current build for both blank classes. Run after
// the build (npm run build).
const BUILT = join(process.cwd(), 'dist', 'build', 'index.html');

// The floating chrome: the header (bar or rail), the toolbars and their
// pills, the zoom and fit groups, the "more" control and panel, the Menu
// overlay, the legends, the panels and drawers with their controls.
const ROOTS = [
  '#app-header',
  '#map-toolbar',
  '#annotation-toolbar',
  '#presentation-toolbar',
  '#map-zoom',
  '#pres-zoom',
  '#map-more-panel',
  '#app-menu',
  '#map-legend',
  '#presentation-legend',
  '#map-glance',
  '#presentation-glance',
  '#visibility-area',
  '#placement-area',
  '#details-panel',
];

const PROFILES: Array<[string, BrowserContextOptions]> = [
  ['compact 390x844 coarse', { ...devices['iPhone 13'] }],
  ['compact 390x844 fine', { viewport: { width: 390, height: 844 } }],
  ['short 844x390 coarse', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['medium 820x1180 fine', { viewport: { width: 820, height: 1180 } }],
  ['wide 1440x900 fine', { viewport: { width: 1440, height: 900 } }],
  ['extra wide 1920x1080 fine', { viewport: { width: 1920, height: 1080 } }],
];
const VIEWER_PROFILES = new Set(['compact 390x844 coarse', 'short 844x390 coarse', 'wide 1440x900 fine']);

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

async function openApp(options: BrowserContextOptions, lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${BUILT}`);
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.evaluate(() => {
    document.getElementById('load-demo')!.click();
    document.getElementById('demo-go')!.click();
  });
  await page.waitForFunction(() => document.documentElement.dataset.segment === 'map', undefined, { timeout: 30_000 });
  return page;
}

async function openViewer(options: BrowserContextOptions, lang: 'en' | 'sv', theme: 'light' | 'dark'): Promise<Page> {
  const context = await browser.newContext(options);
  await context.setOffline(true);
  const page = await context.newPage();
  await page.goto(`file://${exported}`);
  await page.waitForFunction(() => document.documentElement.dataset.mode === 'viewer', undefined, { timeout: 30_000 });
  await setSelect(page, 'select-language', lang);
  await setSelect(page, 'select-theme', theme);
  await page.waitForTimeout(300);
  return page;
}

interface Walked {
  root: string;
  id: string;
  pos: string;
  glyphPseudo: boolean;
  maskSet: boolean;
  glyphDefined: boolean;
  textHidden: boolean;
  iconShaped: boolean;
}

// Every button of the floating chrome, with the glyph rules resolved, and
// every --glyph URI used anywhere in the stylesheet decoded to a pixel
// count of opaque ink.
function walkButtons(page: Page): Promise<{ buttons: Walked[]; glyphInk: Array<{ sel: string; uri: string; opaque: number }> }> {
  return page.evaluate(async (roots) => {
    const seen = new Set<Element>();
    const buttons: Walked[] = [];
    for (const rs of roots) {
      const root = document.querySelector(rs);
      if (!root) {
        continue;
      }
      for (const e of root.querySelectorAll('button')) {
        if (seen.has(e)) {
          continue;
        }
        seen.add(e);
        const cs = getComputedStyle(e);
        const bef = getComputedStyle(e, '::before');
        const glyphPseudo = bef.content !== 'none';
        const maskSet = bef.maskImage !== 'none' || bef.webkitMaskImage !== 'none';
        const glyphDefined = cs.getPropertyValue('--glyph').trim() !== '';
        const textHidden = cs.textIndent !== '0px' || cs.fontSize === '0px';
        buttons.push({
          root: rs,
          id: (e as HTMLElement).id || e.className,
          pos: cs.position,
          glyphPseudo,
          maskSet,
          glyphDefined,
          textHidden,
          iconShaped: glyphPseudo || textHidden,
        });
      }
    }
    const uris = new Map<string, string>();
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        const style = (rule as CSSStyleRule).style;
        if (!style) {
          continue;
        }
        const g = style.getPropertyValue('--glyph').trim();
        if (g && !uris.has(g)) {
          uris.set(g, (rule as CSSStyleRule).selectorText);
        }
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = 20;
    canvas.height = 20;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const glyphInk: Array<{ sel: string; uri: string; opaque: number }> = [];
    for (const [g, sel] of uris) {
      const m = g.match(/url\((.*)\)/s);
      const uri = m ? m[1].replace(/^"|"$/g, '') : g;
      const img = new Image();
      let opaque = -1;
      try {
        img.src = uri;
        await img.decode();
        ctx.clearRect(0, 0, 20, 20);
        ctx.drawImage(img, 0, 0, 20, 20);
        const d = ctx.getImageData(0, 0, 20, 20).data;
        opaque = 0;
        for (let i = 3; i < d.length; i += 4) {
          if (d[i] > 0) {
            opaque++;
          }
        }
      } catch {
        opaque = -1;
      }
      glyphInk.push({ sel, uri, opaque });
    }
    return { buttons, glyphInk };
  }, ROOTS);
}

function expectInk(walked: { buttons: Walked[]; glyphInk: Array<{ sel: string; uri: string; opaque: number }> }, where: string): void {
  for (const b of walked.buttons) {
    if (!b.iconShaped) {
      continue;
    }
    const at = `${where} ${b.root} #${b.id}`;
    if (b.maskSet) {
      expect(b.pos, `${at}: the glyph's anchor -- the button must be positioned so the ::before glyph draws inside it`).not.toBe('static');
      expect(b.glyphDefined, `${at}: the mask's --glyph must be defined`).toBe(true);
    }
    if (b.textHidden) {
      expect(b.maskSet, `${at}: a text-hidden icon button must carry a mask glyph in place of its text`).toBe(true);
    }
  }
  for (const g of walked.glyphInk) {
    expect(g.opaque, `the glyph ${g.sel} decodes to an image with opaque ink (${g.uri.slice(0, 60)}...)`).toBeGreaterThan(0);
  }
}

describe('the floating chrome\u2019s symbols: every icon button draws ink (v2.2.2, Unit 1)', () => {
  test('the exported file is written from the demo', async () => {
    const page = await openApp({ viewport: { width: 1440, height: 900 } }, 'en', 'light');
    await page.evaluate(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
    await pressExport(page, 'export-open');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-go')]);
    exported = join(mkdtempSync(join(tmpdir(), 'mapvibes-symbols-')), 'presentation.html');
    await download.saveAs(exported);
    await page.context().close();
  }, 90_000);

  for (const [name, profile] of PROFILES) {
    for (const lang of ['en', 'sv'] as const) {
      const theme = name.startsWith('compact') && lang === 'en' ? ('light' as const) : ('dark' as const);
      test(`in the application, ${name}, ${lang}, ${theme}: every floating button draws ink`, async () => {
        const page = await openApp(profile, lang, theme);
        for (const seg of ['map', 'presentation'] as const) {
          if (seg === 'presentation') {
            await page.evaluate(() => document.getElementById('tab-presentation')!.click());
            await page.waitForFunction(() => document.documentElement.dataset.segment === 'presentation', undefined, { timeout: 30_000 });
          }
          await page.waitForTimeout(300);
          const walked = await walkButtons(page);
          expectInk(walked, `app ${name} ${lang} ${theme} ${seg}`);
        }
        await page.context().close();
      }, 120_000);

      if (VIEWER_PROFILES.has(name)) {
        test(`in the exported viewer, ${name}, ${lang}, ${theme}: every floating button draws ink`, async () => {
          const page = await openViewer(profile, lang, theme);
          const walked = await walkButtons(page);
          expectInk(walked, `viewer ${name} ${lang} ${theme}`);
          await page.context().close();
        }, 120_000);
      }
    }
  }
});
