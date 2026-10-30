import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, openWorkFile, placeExampleMarkers, pointer, presentationMarkers, STAGE, stubImageDecoding, stubStageLayout, textFile } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';
import { en, sv } from '../../src/i18n';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));
vi.mock('../../src/raster', () => ({
  backgroundJpeg: async () => ({ jpeg: new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.jpg'))), width: 1200, height: 800 }),
  stagePagePng: async () => ({ png: new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.png'))), width: 1920, height: 1080 }),
}));

// Translation parity (FR-19 as amended in v1.3.0): every user-visible string
// exists in both languages, and the Swedish interface shows no English text.

// Entries that are the same in both languages, each for a reason: the
// product's name, the attribution the map data's licence requires, a footer
// made of a name, a version, and a date, and Swedish words spelt as in
// English.
const SAME_IN_BOTH: Record<string, string> = {
  appName: 'the product name',
  fetchAttribution: 'the attribution required by the OpenStreetMap licence',
  documentSlideFooter: 'a name, a version, and a date',
  roleStatus: 'Swedish "status"',
  filter: 'Swedish "filter"',
  segmentInformation: 'Swedish "information"',
  segmentPresentation: 'Swedish "presentation"',
  statusSymbol: 'Swedish "symbol"',
  markerShape: 'Swedish "symbol"',
  detailsSymbol: 'Swedish "symbol"',
  toolPolygon: 'Swedish "polygon"',
  kindPolygon: 'Swedish "polygon"',
  annotationArea: 'Swedish "area"',
};

describe('translation parity: the string tables (FR-19)', () => {
  test('both languages have exactly the same entries, none empty', () => {
    expect(Object.keys(sv).sort()).toEqual(Object.keys(en).sort());
    for (const table of [en, sv]) for (const [key, value] of Object.entries(table)) expect(String(value).trim(), key).not.toBe('');
  });

  test('no entry is left untranslated: a Swedish entry equal to the English one is a listed exception', () => {
    const same = Object.keys(en).filter((k) => (en as Record<string, unknown>)[k] === (sv as Record<string, unknown>)[k]);
    expect(same.sort()).toEqual(Object.keys(SAME_IN_BOTH).sort());
  });

  test('the placeholders of an entry are the same in both languages', () => {
    const names = (v: string) => [...new Set([...v.matchAll(/\{(\w+)(?::[^}]*)?\}/g)].map((m) => m[1]))].sort();
    for (const key of Object.keys(en)) {
      expect(names(String((sv as Record<string, unknown>)[key])), key).toEqual(names(String((en as Record<string, unknown>)[key])));
    }
  });
});

// The English texts that must not appear in the Swedish interface: every
// English entry that differs from its Swedish one (templates by their fixed
// parts), and every literal text written into index.html.
function englishTexts(): Set<string> {
  const out = new Set<string>();
  for (const [key, value] of Object.entries(en)) {
    if (key in SAME_IN_BOTH || typeof value !== 'string') continue;
    for (const part of value.split(/\{[^}]*\}/)) if (part.trim().length >= 4) out.add(part.trim());
  }
  const doc = new DOMParser().parseFromString(readFileSync(join(process.cwd(), 'index.html'), 'utf8'), 'text/html');
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if ((n.textContent ?? '').trim().length >= 4) out.add(n.textContent!.trim());
  for (const el of doc.body.querySelectorAll('[aria-label], [title], [placeholder]')) {
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v && v.trim().length >= 4) out.add(v.trim());
    }
  }
  for (const k of Object.keys(SAME_IN_BOTH)) out.delete(String((en as Record<string, unknown>)[k]));
  return out;
}

// Every text the interface shows: the visible text nodes and the accessible
// attributes, outside hidden elements (they are written when shown) and the
// language names (each in its own language).
function shownTexts(): string[] {
  const out: string[] = [];
  const skip = (el: Element | null) => !!el?.closest('.hidden, [hidden], #select-language, script, style');
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? '').trim();
    if (text !== '' && !skip(n.parentElement)) out.push(text);
  }
  for (const el of document.body.querySelectorAll('[aria-label], [title], [placeholder]')) {
    if (skip(el)) continue;
    for (const attr of ['aria-label', 'title', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (v && v.trim() !== '') out.push(v.trim());
    }
  }
  return out;
}

// The work's own data shown in the interface (column headers, values,
// vocabularies, labels): data, not interface text.
let dataTexts = new Set<string>();

function collectData(app: Awaited<ReturnType<typeof mountApp>>): void {
  const ws = app.captureWorkState();
  dataTexts = new Set(
    [
      ...ws.headers,
      ...ws.manualColumns.map((c) => c.label),
      ...ws.rows.flatMap((r) => [...Object.values(r.values), ...r.comments.map((c) => c.text)]),
      ...ws.areaValues,
      ...ws.programValues,
      ...ws.statuses.map((s) => s.name),
      ...Object.values(ws.colourLabels),
      ...Object.values(ws.symbolLabels),
      ...ws.annotations.map((a) => a.label),
    ].map((v) => String(v).trim()),
  );
}

function leaks(english: Set<string>): string[] {
  return [
    ...new Set(
      shownTexts()
        .filter((t) => /\p{L}/u.test(t) && !dataTexts.has(t))
        .filter((t) => [...english].some((e) => t === e || (e.length >= 12 && t.includes(e)))),
    ),
  ];
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
}

describe('translation parity: the rendered interface in Swedish (FR-19)', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`no English text in any segment, panel, or dialog (${theme} theme)`, async () => {
      const app = await mountApp({
        singleFile: true,
        beforeMain: () => {
          stubStageLayout();
          stubImageDecoding(3000, 2000);
        },
      });
      const english = englishTexts();
      const lang = byId<HTMLSelectElement>('select-language');
      lang.value = 'sv';
      lang.dispatchEvent(new Event('change'));
      const themeSelect = byId<HTMLSelectElement>('select-theme');
      themeSelect.value = theme;
      themeSelect.dispatchEvent(new Event('change'));
      const found: string[] = [];
      // The start: the empty Information segment.
      found.push(...leaks(english));
      // The demo, every panel open.
      byId('load-demo').click();
      await settle();
      collectData(app);
      byId('tab-information').click();
      for (const d of document.querySelectorAll('details')) d.open = true;
      found.push(...leaks(english));
      // The Map segment, with an annotation selected and the details panel.
      byId('tab-map').click();
      document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="select"]')!.click();
      document.querySelector<HTMLElement>('#marker-layer .marker')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      found.push(...leaks(english));
      // The annotation inspector: the demo's free rectangle, selected.
      pointer('pointerdown', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
      pointer('pointerup', byId('map-stage'), STAGE.left + 328, STAGE.top + 438);
      expect(byId('annotation-inspector').classList.contains('hidden')).toBe(false);
      found.push(...leaks(english));
      // The Presentation segment, a card, and the three export dialogs.
      byId('tab-presentation').click();
      await flush();
      const m = presentationMarkers()[6];
      pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
      pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
      found.push(...leaks(english));
      byId('export-open').click();
      found.push(...leaks(english));
      byId('export-cancel').click();
      for (const id of ['pdf-open', 'pptx-open']) {
        byId(id).click();
        await settle();
        found.push(...leaks(english));
        byId('document-cancel').click();
      }
      // The comparison panel, with an exported file opened back.
      openWorkFile(textFile('presentation.html', app.exportPage()!));
      await settle();
      expect(byId('compare-panel').classList.contains('hidden')).toBe(false);
      found.push(...leaks(english));
      expect([...new Set(found)]).toEqual([]);
    }, 30_000);
  }
});

// The narrow viewer's toggle bar and overlays (FR-58), hidden on the
// desktop and so outside the audit above: in Swedish, with the narrow
// layout in force.
describe('translation parity: the narrow viewer in Swedish (FR-19, FR-58)', () => {
  test('the toggle bar and its overlays show no English text', async () => {
    const author = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 60, 100]]);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    const page = author.exportPage(new Date(2024, 7, 9, 10, 30))!;
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
        const plain = window.matchMedia;
        window.matchMedia = ((q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q))) as typeof window.matchMedia;
      },
    });
    await flush();
    const english = englishTexts();
    const bar = byId('viewer-toggles');
    const texts = [bar.getAttribute('aria-label')!, ...[...bar.querySelectorAll('button')].map((b) => b.textContent!.trim())];
    expect(texts).toEqual(['Paneler', 'I vyn', 'Teckenförklaring']);
    byId('toggle-legend').click();
    expect(byId('presentation-legend').dataset.state).toBe('open');
    const shown = [...texts, byId('presentation-legend').textContent!, byId('presentation-glance').textContent!];
    expect(shown.filter((t) => [...english].some((e) => t === e || (e.length >= 12 && t.includes(e))))).toEqual([]);
  });
});

// The no-scripts notice of an exported file (FR-59), written at export time
// in the export's language and never shown by a running application: in a
// Swedish export it holds no English text.
describe('translation parity: the no-scripts notice in Swedish (FR-19, FR-59)', () => {
  test('a Swedish export carries its notice in Swedish only', async () => {
    const author = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 60, 100]]);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    const doc = new DOMParser().parseFromString(author.exportPage(new Date(2024, 7, 9, 10, 30))!, 'text/html');
    const paragraphs = [...doc.getElementById('boot-notice')!.querySelectorAll('p')].map((p) => p.textContent!.trim());
    expect(paragraphs).toHaveLength(4);
    const english = englishTexts();
    expect(paragraphs.filter((t) => [...english].some((e) => t === e || (e.length >= 12 && t.includes(e))))).toEqual([]);
    expect(paragraphs[0]).toBe('Presentationen har inte startat.');
  });
});
