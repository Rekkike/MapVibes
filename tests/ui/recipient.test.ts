import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, stubImageDecoding, stubStageLayout } from './harness';
import { NOTICE_ID } from '../../src/singlefile';
import { HOSTED_ADDRESS } from '../../src/hosted';

// The recipient problem (Pass 14): an exported file's static state (FR-38
// as amended in v1.5.0) and its no-scripts notice (FR-59). Their behaviour
// with and without scripts is measured in the browser suite.

async function exported(lang: 'en' | 'sv'): Promise<Document> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([[0, 60, 100]]);
  const select = byId<HTMLSelectElement>('select-language');
  select.value = lang;
  select.dispatchEvent(new Event('change'));
  return new DOMParser().parseFromString(app.exportPage(new Date(2024, 7, 9, 10, 30))!, 'text/html');
}

function notice(doc: Document): string[] {
  return [...doc.getElementById(NOTICE_ID)!.querySelectorAll('p')].map((p) => p.textContent ?? '');
}

describe('the exported static state and the notice (FR-38, FR-59)', () => {
  test('the exported page is written in the viewer mode, in the export language', async () => {
    const doc = await exported('sv');
    expect(doc.documentElement.getAttribute('data-mode')).toBe('viewer');
    expect(doc.documentElement.getAttribute('lang')).toBe('sv');
    // Not yet started: the started mark belongs to the running application.
    expect(doc.documentElement.hasAttribute('data-started')).toBe(false);
  });

  test('the notice says what happened, which routes work, and where the data is, in English', async () => {
    expect(notice(await exported('en'))).toEqual([
      'This presentation has not started.',
      'The way this file was opened did not run its program. On an iPhone or iPad, the previews of the Files and Mail apps show the page without running it.',
      `Open the file on a computer, or open it in the MapVibes application at ${HOSTED_ADDRESS} with "Open presentation".`,
      'The data of this presentation is in this file in readable form.',
    ]);
  });

  test('and in Swedish, naming the action as the Swedish interface does', async () => {
    const text = notice(await exported('sv'));
    expect(text[0]).toBe('Presentationen har inte startat.');
    expect(text[2]).toBe(`Öppna filen på en dator, eller öppna den i MapVibes-programmet på ${HOSTED_ADDRESS} med "Öppna presentation".`);
  });

  test('the address is text, not a link', async () => {
    const doc = await exported('en');
    expect(doc.getElementById(NOTICE_ID)!.querySelector('a')).toBeNull();
  });

  test('the running application marks itself started, in the viewer and in the editor', async () => {
    const page = (await exported('en')).documentElement.outerHTML;
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        // The mark of an earlier instance in the same document is cleared.
        delete document.documentElement.dataset.started;
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(document.documentElement.dataset.started).toBe('true');
    await mountApp({ beforeMain: () => delete document.documentElement.dataset.started });
    expect(document.documentElement.dataset.started).toBe('true');
  });
});
