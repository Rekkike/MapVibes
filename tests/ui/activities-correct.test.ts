import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, stubImageDecoding, stubStageLayout } from './harness';
import { PdfDocument } from '../../src/pdfwriter';

// Hand corrections (FR-76 as amended in v1.12.0) under the repair-only rule:
// the user fixes what the source gave and never adds. The details panel's
// action opens the activities dialog in its edit mode; every correction
// marks the activity as edited by hand (FR-77); a re-import of the same file
// and page keeps the hand-corrected activities, and an import of another
// file or page replaces the activities with an explicit count.

type App = Awaited<ReturnType<typeof mountApp>>;

const ROWS = [
  ['Grävning', '2024-01-08', '2024-02-16', '6 v', '100 %'],
  ['Ledningar', '2024-02-12', '2024-04-30', '11 v', '60 %'],
  ['Granskning', '15/03/2024', '2024-06-30', '', '10 %'],
  ['Totalt', '', '', '17 v', ''],
];

function tablePdf(name = 'plan.pdf', rows = ROWS): File {
  const doc = new PdfDocument({ title: 'Fiktivt system', created: new Date('2024-07-01T00:00:00Z') });
  const page = doc.addPage(595, 842);
  const x = [40, 220, 320, 400, 470];
  ['Post', 'Från', 'Till', 'Längd', 'Klart'].forEach((h, c) => page.text(x[c], 780, h, 'bold', 10));
  rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell !== '') {
        page.text(x[c], 780 - (r + 1) * 24, cell, 'regular', 10);
      }
    }),
  );
  return new File([doc.toBytes() as unknown as BlobPart], name, { type: 'application/pdf' });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await flush();
  }
}

const action = (text: string) => [...document.querySelectorAll<HTMLElement>('#details-panel .details-economics')].find((b) => b.textContent === text);

async function openDetails(): Promise<void> {
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
  await flush();
}

// Imports a PDF on the first item; drop names the review rows to drop.
async function importPdf(file: File, drop: number[] = [3]): Promise<void> {
  action('Import activities')!.click();
  await flush();
  const input = byId<HTMLInputElement>('activity-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle();
  for (const i of drop) {
    document.querySelectorAll<HTMLInputElement>('#activity-rows .activity-row input[type="checkbox"]')[i].click();
  }
}

async function attach(): Promise<void> {
  byId('activity-go').click();
  await flush();
}

const editRows = () => [...document.querySelectorAll<HTMLElement>('#activity-rows .activity-edit')];
const field = (row: number, name: string) => editRows()[row].querySelector<HTMLInputElement>(`.activity-edit-${name}`)!;

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

async function openCorrection(): Promise<void> {
  action('Correct activities')!.click();
  await flush();
}

describe('hand corrections (FR-76, FR-77)', () => {
  let app: App;
  const activities = () => app.captureWorkState().rows[0].activities;

  beforeEach(async () => {
    app = await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    await openDetails();
  });

  test('the action is offered only for an item that has activities', async () => {
    expect(action('Import activities')).toBeDefined();
    expect(action('Correct activities')).toBeUndefined();
    await importPdf(tablePdf());
    await attach();
    expect(action('Correct activities')).toBeDefined();
  });

  test('the edit mode lists what the import gave: text inputs for label, start, and end, a progress, and a remove per row; no control adds an activity', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(false);
    expect(byId('activity-heading').textContent).toBe('Correct activities');
    expect(byId('activity-intro').textContent).toContain('Activities are not added here');
    // The import's own controls are not part of the edit mode.
    expect(byId('activity-choose-row').classList.contains('hidden')).toBe(true);
    expect(byId('activity-roles').classList.contains('hidden')).toBe(true);
    expect(editRows().map((li) => [...li.querySelectorAll('input')].map((i) => [i.type, i.value]))).toEqual([
      [
        ['text', 'Grävning'],
        ['text', '2024-01-08'],
        ['text', '2024-02-16'],
        ['text', '100'],
      ],
      [
        ['text', 'Ledningar'],
        ['text', '2024-02-12'],
        ['text', '2024-04-30'],
        ['text', '60'],
      ],
      [
        ['text', 'Granskning'],
        ['text', '15/03/2024'],
        ['text', '2024-06-30'],
        ['text', '10'],
      ],
    ]);
    expect(editRows().every((li) => li.querySelectorAll('button.activity-edit-remove').length === 1)).toBe(true);
    // Repair only: the dialog has exactly its close, save, and cancel
    // buttons and one remove per row, and nothing that creates a row.
    const buttons = [...byId('activity-panel').querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.closest('.hidden'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Close', 'Remove', 'Remove', 'Remove', 'Save the corrections', 'Cancel']);
    expect(byId('activity-panel').textContent).not.toMatch(/\badd\b/i);
    // An unreadable date is shown as typed.
    expect(editRows()[2].querySelector('.activity-edit-note')!.textContent).toBe('Start: 15/03/2024 (as typed)');
  });

  test('every correction marks the activity as edited by hand; an untouched activity carries no mark', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(0, 'label'), 'Schakt');
    type(field(1, 'progress'), '75');
    expect(editRows()[0].querySelector('.activity-edit-note')!.textContent).toBe('edited by hand');
    expect(editRows()[2].dataset.edited).toBe('false');
    await attach();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(true);
    expect(byId('work-status').textContent).toBe('Corrections saved: 2 corrected, 0 removed.');
    expect(activities()).toEqual([
      { id: 'a1', edited: true, label: 'Schakt', start: '2024-01-08', end: '2024-02-16', progress: 100 },
      { id: 'a2', edited: true, label: 'Ledningar', start: '2024-02-12', end: '2024-04-30', progress: 75 },
      { id: 'a3', label: 'Granskning', start: '15/03/2024', end: '2024-06-30', progress: 10 },
    ]);
    // The mark stays, and is shown, when the dialog is opened again.
    await openCorrection();
    expect(editRows().map((li) => li.dataset.edited)).toEqual(['true', 'true', 'false']);
    // Saving without a change marks nothing more and is not a change of the work.
    await attach();
    expect(byId('work-status').textContent).toBe('Corrections saved: 0 corrected, 0 removed.');
    expect(activities()![2].edited).toBeUndefined();
  });

  test('a date is mended, or kept as typed and never guessed', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(2, 'start'), '2024-03-15');
    expect(editRows()[2].querySelector('.activity-edit-note')!.textContent).toBe('edited by hand');
    type(field(0, 'end'), 'mid February');
    expect(editRows()[0].querySelector('.activity-edit-note')!.textContent).toBe('edited by hand · End: mid February (as typed)');
    await attach();
    expect(activities()![2]).toEqual({ id: 'a3', edited: true, label: 'Granskning', start: '2024-03-15', end: '2024-06-30', progress: 10 });
    expect(activities()![0]).toEqual({ id: 'a1', edited: true, label: 'Grävning', start: '2024-01-08', end: 'mid February', progress: 100 });
    // The mended activity now has a segment; the one made unreadable has none.
    byId('tab-presentation').click();
    byId('pres-mode-timeline').click();
    await flush();
    const titles = [...document.querySelectorAll<HTMLElement>('#presentation-timeline .timeline-seg')].map((s) => s.title);
    expect(titles.some((x) => x.startsWith('Granskning: 2024-03-15'))).toBe(true);
    expect(titles.some((x) => x.startsWith('Grävning'))).toBe(false);
  });

  test('the progress is bounded: 0 to 100 or empty for none; anything else is refused and nothing is saved', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(0, 'progress'), '101');
    expect(editRows()[0].querySelector('.activity-edit-note')!.textContent).toContain('the progress is not a number from 0 to 100');
    await attach();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(false);
    expect(byId('activity-status').textContent).toBe('A progress is not a number from 0 to 100. Nothing was saved.');
    expect(activities()![0].progress).toBe(100);
    for (const bad of ['-5', 'half', '1e2']) {
      type(field(0, 'progress'), bad);
      await attach();
      expect(byId('activity-panel').classList.contains('hidden')).toBe(false);
    }
    type(field(0, 'progress'), '');
    type(field(1, 'progress'), '0');
    type(field(2, 'progress'), '62,5');
    await attach();
    expect(activities()!.map((a) => a.progress)).toEqual([null, 0, 62.5]);
  });

  test('an activity is removed per row; the ids of the others do not change; removing all leaves none', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    const remove = () => editRows().map((li) => li.querySelector<HTMLButtonElement>('.activity-edit-remove')!);
    remove()[1].click();
    expect(editRows()[1].dataset.dropped).toBe('true');
    expect(remove()[1].textContent).toBe('Keep');
    expect(field(1, 'label').disabled).toBe(true);
    // A removal can be taken back before saving.
    remove()[1].click();
    expect(editRows()[1].dataset.dropped).toBe('false');
    remove()[1].click();
    await attach();
    expect(byId('work-status').textContent).toBe('Corrections saved: 0 corrected, 1 removed.');
    expect(activities()!.map((a) => a.id)).toEqual(['a1', 'a3']);
    await openCorrection();
    for (const b of remove()) {
      b.click();
    }
    await attach();
    expect(activities()).toBeUndefined();
    expect(action('Correct activities')).toBeUndefined();
  });

  test('cancelling discards the corrections', async () => {
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(0, 'label'), 'Schakt');
    byId('activity-cancel').click();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(true);
    expect(activities()![0]).toEqual({ id: 'a1', label: 'Grävning', start: '2024-01-08', end: '2024-02-16', progress: 100 });
  });

  test('the edit mode follows the interface language (Swedish)', async () => {
    await importPdf(tablePdf());
    await attach();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    await flush();
    action('Rätta aktiviteter')!.click();
    await flush();
    expect(byId('activity-heading').textContent).toBe('Rätta aktiviteter');
    expect(byId('activity-go').textContent).toBe('Spara rättningarna');
    expect(editRows()[2].querySelector('.activity-edit-note')!.textContent).toBe('Start: 15/03/2024 (som skrivet)');
  });

  test('the corrections are saved and reopened with the work, and carried by the exported file; the viewer offers no correction', async () => {
    app = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 100, 100]]);
    await openDetails();
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(2, 'start'), '2024-03-15');
    await attach();
    const doc = new DOMParser().parseFromString(app.exportPage(new Date(2026, 10, 9, 10, 0))!, 'text/html');
    const viewer = await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(viewer.captureWorkState().rows[0].activities![2]).toEqual({
      id: 'a3',
      edited: true,
      label: 'Granskning',
      start: '2024-03-15',
      end: '2024-06-30',
      progress: 10,
    });
    expect(document.querySelector('.details-correct-activities')).toBeNull();
  });
});

describe('re-import after hand corrections (FR-76)', () => {
  let app: App;
  const activities = () => app.captureWorkState().rows[0].activities;
  const reviewRows = () => [...document.querySelectorAll<HTMLElement>('#activity-rows .activity-row')];
  const notice = () => byId('activity-replace-notice');

  beforeEach(async () => {
    app = await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    await openDetails();
    await importPdf(tablePdf());
    await attach();
    await openCorrection();
    type(field(2, 'start'), '2024-03-15');
    type(field(2, 'label'), 'Slutgranskning');
    await attach();
  });

  test('the same file and page: the hand-corrected activity keeps its values and its mark, and the review shows it as edited by hand', async () => {
    // The source changed meanwhile: a new progress on the first row, another
    // text on the third.
    const changed = [['Grävning', '2024-01-08', '2024-02-16', '6 v', '80 %'], ROWS[1], ['Granskning (ny)', '20/03/2024', '2024-07-31', '', '50 %'], ROWS[3]];
    await importPdf(tablePdf('plan.pdf', changed));
    // Not a replacement: no count notice.
    expect(notice().classList.contains('hidden')).toBe(true);
    expect(reviewRows().map((li) => li.dataset.edited ?? 'false')).toEqual(['false', 'false', 'true', 'false']);
    // Beside the source's cells, the values that are kept.
    expect(reviewRows()[2].textContent).toContain('Post: Granskning (ny)');
    expect(reviewRows()[2].querySelector('.activity-edit-note')!.textContent).toBe(
      'Edited by hand; kept as corrected: Slutgranskning · 2024-03-15 – 2024-06-30 · 10 %',
    );
    await attach();
    expect(activities()).toEqual([
      // Not corrected by hand: the source's new value.
      { id: 'a1', label: 'Grävning', start: '2024-01-08', end: '2024-02-16', progress: 80 },
      { id: 'a2', label: 'Ledningar', start: '2024-02-12', end: '2024-04-30', progress: 60 },
      // Corrected by hand: kept, with its mark.
      { id: 'a3', edited: true, label: 'Slutgranskning', start: '2024-03-15', end: '2024-06-30', progress: 10 },
    ]);
  });

  test('the same file and page: the match is by row position, so an earlier removal does not shift it; a row dropped in the review drops its correction with it', async () => {
    await openCorrection();
    editRows()[0].querySelector<HTMLButtonElement>('.activity-edit-remove')!.click();
    await attach();
    expect(activities()!.map((a) => a.id)).toEqual(['a2', 'a3']);
    await importPdf(tablePdf());
    expect(reviewRows().map((li) => li.dataset.edited ?? 'false')).toEqual(['false', 'false', 'true', 'false']);
    await attach();
    // The removed activity is back from the source, as the review showed;
    // the corrected one is still the third row's.
    expect(activities()!.map((a) => [a.id, a.label, a.edited])).toEqual([
      ['a1', 'Grävning', undefined],
      ['a2', 'Ledningar', undefined],
      ['a3', 'Slutgranskning', true],
    ]);
    await importPdf(tablePdf(), [2, 3]);
    await attach();
    expect(activities()!.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  test('another file: the import replaces the activities, and the review says so with the count, never silently', async () => {
    await importPdf(tablePdf('other.pdf'));
    expect(notice().classList.contains('hidden')).toBe(false);
    expect(notice().textContent).toBe(
      'This is another file or page than the last import (plan.pdf, page 1). Attaching replaces the 3 activities the item has, 1 of them corrected by hand.',
    );
    // No row is shown as kept: nothing is kept.
    expect(reviewRows().some((li) => li.dataset.edited === 'true')).toBe(false);
    await attach();
    expect(activities()).toEqual([
      { id: 'a1', label: 'Grävning', start: '2024-01-08', end: '2024-02-16', progress: 100 },
      { id: 'a2', label: 'Ledningar', start: '2024-02-12', end: '2024-04-30', progress: 60 },
      { id: 'a3', label: 'Granskning', start: '15/03/2024', end: '2024-06-30', progress: 10 },
    ]);
    expect(app.captureWorkState().rows[0].activityImport!.file).toBe('other.pdf');
  });

  test('another file, cancelled: nothing is replaced', async () => {
    await importPdf(tablePdf('other.pdf'));
    byId('activity-cancel').click();
    expect(activities()![2]).toEqual({ id: 'a3', edited: true, label: 'Slutgranskning', start: '2024-03-15', end: '2024-06-30', progress: 10 });
  });

  test('a first import says nothing of replacing', async () => {
    app = await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    await openDetails();
    await importPdf(tablePdf());
    expect(notice().classList.contains('hidden')).toBe(true);
    expect(notice().textContent).toBe('');
  });
});
