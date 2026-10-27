import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, removeSaveDialog, stubSaveDialog } from './harness';
import { unzipStored } from '../../src/zipwriter';
import type { StageScene } from '../../src/documents';

// jsdom has no canvas: the rasterising of the stage page stands in with the
// example image and records the scene and frame it was given.
const rendered: Array<{ scene: StageScene; frame: { width: number; height: number; footer: string }; scale: number; src: string | null }> = [];
vi.mock('../../src/raster', () => ({
  backgroundJpeg: async () => {
    throw new Error('not used by the PowerPoint export');
  },
  stagePagePng: async (scene: StageScene, frame: { width: number; height: number; footer: string }, scale: number, src: string | null) => {
    rendered.push({ scene, frame, scale, src });
    return { png: new Uint8Array(readFileSync(join(process.cwd(), 'example-data', 'example-background.png'))), width: 1920, height: 1080 };
  },
}));

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
}

function lines(id: string): string[] {
  return [...byId(id).querySelectorAll('li')].map((li) => li.textContent ?? '');
}

async function exportPptx(): Promise<Map<string, string>> {
  const written = stubSaveDialog();
  byId('pptx-open').click();
  await settle();
  byId('document-go').click();
  await settle();
  expect(written.name).toBe('mapvibes-presentation.pptx');
  expect(written.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');
  return new Map(unzipStored(written.bytes!).map((e) => [e.name, e.name.endsWith('.png') ? '' : new TextDecoder().decode(e.data)]));
}

function slideTexts(xml: string): string[] {
  return [...new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('a:t')].map((t) => t.textContent ?? '');
}

describe('PowerPoint export (FR-12, FR-51, FR-52)', () => {
  beforeEach(async () => {
    rendered.length = 0;
    removeSaveDialog();
    await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    byId('tab-presentation').click();
    await flush();
  });

  test('the action sits in the Presentation toolbar; the dialog states what the document holds', async () => {
    expect(byId('pptx-open').textContent).toBe('Export PowerPoint');
    expect(byId('pptx-open').parentElement!.id).toBe('presentation-toolbar');
    byId('pptx-open').click();
    await settle();
    expect(byId('document-heading').textContent).toBe('Export PowerPoint');
    expect(lines('document-contains')).toEqual([
      'the presentation stage as shown: 2 markers and 0 annotations in view',
      'the visible part of the background (1200 × 800 pixels)',
      'the legend',
      'a table of the 5 shown items with 5 columns, on 1 slides',
    ]);
    // Nothing is replaced in a PowerPoint document: no line about it.
    expect(lines('document-omitted').some((l) => l.includes('characters'))).toBe(false);
    expect(byId('document-size').textContent).toMatch(/^File size: \d+ kB\.$/);
  });

  test('the slide image is the stage page at 1920 by 1080 pixels; the table follows on native table slides', async () => {
    const p = await exportPptx();
    expect(rendered).toHaveLength(1);
    expect(rendered[0].frame.width * rendered[0].scale).toBe(1920);
    expect(rendered[0].frame.height * rendered[0].scale).toBe(1080);
    expect(rendered[0].scene.markers.map((m) => m.label)).toEqual(['1', '3']);
    expect(rendered[0].src).toMatch(/^data:image\/png;base64,/);
    expect(rendered[0].frame.footer).toMatch(/^MapVibes v\d+\.\d+\.\d+ · /);
    expect(p.has('ppt/media/image1.png')).toBe(true);
    expect([...p.keys()].filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))).toEqual(['ppt/slides/slide1.xml', 'ppt/slides/slide2.xml']);
    const table = slideTexts(p.get('ppt/slides/slide2.xml')!);
    expect(table.slice(0, 7)).toEqual(['Items 1 to 5 of 5', 'No.', 'ID', 'Start', 'End', 'Group', 'Note']);
    for (const id of ['A-01', 'A-02', 'A-03', 'A-04', 'A-05']) expect(table).toContain(id);
    expect(byId('document-status').textContent).toBe('The document was exported.');
  });

  test('switched-off items are absent from the slide image and the table', async () => {
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    const p = await exportPptx();
    expect(rendered[0].scene.markers.map((m) => m.label)).toEqual(['3']);
    const table = slideTexts(p.get('ppt/slides/slide2.xml')!);
    expect(table).not.toContain('A-01');
    expect(table).toContain('A-03');
  });

  test('the dialog and the document follow the language', async () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('pptx-open').textContent).toBe('Exportera PowerPoint');
    const p = await exportPptx();
    expect(slideTexts(p.get('ppt/slides/slide2.xml')!).slice(0, 2)).toEqual(['Objekt 1 till 5 av 5', 'Nr']);
    expect(p.get('ppt/slides/slide2.xml')).toContain('lang="sv-SE"');
  });
});
