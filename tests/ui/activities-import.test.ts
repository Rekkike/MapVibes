import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, STAGE } from './harness';
import { PdfDocument } from '../../src/pdfwriter';

// The activities import (FR-76) in the interface: the details panel's action
// opens the dialog; a crafted text-selectable PDF is read with the bundled
// library, the table is recognised generically, the columns are proposed and
// assigned (the PDF's own header words shown as they are), the rows are
// reviewed and droppable, and only then do the activities attach (FR-77) and
// render in the timeline (FR-78).

function tablePdf(): File {
  const doc = new PdfDocument({ title: 'Fiktivt system', created: new Date('2024-07-01T00:00:00Z') });
  const page = doc.addPage(595, 842);
  const x = [40, 220, 320, 400, 470];
  page.text(40, 810, 'Utdrag 2024-07-01.', 'regular', 9);
  ['Post', 'Från', 'Till', 'Längd', 'Klart'].forEach((h, c) => page.text(x[c], 780, h, 'bold', 10));
  const rowsData = [
    ['Grävning', '2024-01-08', '2024-02-16', '6 v', '100 %'],
    ['Ledningar', '2024-02-12', '2024-04-30', '11 v', '60 %'],
    ['15/03/2024 rad', '15/03/2024', '2024-06-30', '', '10 %'],
    ['Totalt', '', '', '17 v', ''],
  ];
  rowsData.forEach((row, r) => row.forEach((cell, c) => { if (cell !== '') page.text(x[c], 780 - (r + 1) * 24, cell, 'regular', 10); }));
  const bytes = doc.toBytes();
  return new File([bytes as unknown as BlobPart], 'plan.pdf', { type: 'application/pdf' });
}

function prosePdf(): File {
  const doc = new PdfDocument({ title: 'Ingen tabell', created: new Date('2024-07-01T00:00:00Z') });
  doc.addPage(595, 842).text(40, 700, 'Only prose.', 'regular', 12);
  return new File([doc.toBytes() as unknown as BlobPart], 'prose.pdf', { type: 'application/pdf' });
}

function chooseFile(file: File): void {
  const input = byId<HTMLInputElement>('activity-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

async function openImportDialog(): Promise<void> {
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
  await flush();
  const action = [...document.querySelectorAll<HTMLElement>('#details-panel .details-economics')].find((b) => b.textContent === 'Import activities')!;
  action.click();
  await flush();
}

describe('the activities import (FR-76, FR-77, FR-78)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
  });

  test('the full flow: parse, propose, assign, review, attach, render', async () => {
    const app = await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    await openImportDialog();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(false);
    chooseFile(tablePdf());
    await flush();
    await flush();
    // The propose step offers the PDF's own header words as the options.
    const roles = [...document.querySelectorAll<HTMLSelectElement>('#activity-roles .activity-role')];
    expect(roles.map((s) => s.dataset.field)).toEqual(['label', 'start', 'end', 'progress', 'duration']);
    expect([...roles[0].options].map((o) => o.textContent)).toEqual(['Not used', 'Post', 'Från', 'Till', 'Längd', 'Klart']);
    // The proposed mapping: label Post, start Från, end Till, progress Klart, duration Längd.
    expect(roles.map((s) => s.value)).toEqual(['0', '1', '2', '4', '3']);
    // The review lists the four parsed rows; the summary row can be dropped.
    expect(document.querySelectorAll('#activity-rows .activity-row')).toHaveLength(4);
    const review = [...document.querySelectorAll<HTMLElement>('#activity-rows .activity-row')];
    expect(review[2].textContent).toContain('15/03/2024 (as typed)');
    // Reassign the progress column to none, then back; the review keeps its rows.
    roles[3].value = '';
    roles[3].dispatchEvent(new Event('change'));
    await flush();
    roles[3].value = '4';
    roles[3].dispatchEvent(new Event('change'));
    await flush();
    expect(document.querySelectorAll('#activity-rows .activity-row')).toHaveLength(4);
    document.querySelectorAll<HTMLInputElement>('#activity-rows .activity-row input')[3].click(); // drop "Totalt"
    await flush();
    byId('activity-go').click();
    await flush();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(true);
    // Attached and persisted (FR-77): three activities (the summary row was dropped).
    const ws = app.captureWorkState();
    expect(ws.rows[0].activities).toEqual([
      { label: 'Grävning', start: '2024-01-08', end: '2024-02-16', progress: 100 },
      { label: 'Ledningar', start: '2024-02-12', end: '2024-04-30', progress: 60 },
      { label: '15/03/2024 rad', start: '15/03/2024', end: '2024-06-30', progress: 10 },
    ]);
    expect(ws.rows[0].activityImport).toEqual({ file: 'plan.pdf', page: 1, columns: { label: 'Post', start: 'Från', end: 'Till', progress: 'Klart', duration: 'Längd' } });
    // Rendered in the timeline (FR-78): the segments are there.
    byId('tab-presentation').click();
    await flush();
    byId('pres-mode-timeline').click();
    await flush();
    // Two segments render (the unreadable date has none); all three are in the description.
    expect(document.querySelectorAll('#presentation-timeline .timeline-seg').length).toBe(2);
    const line = document.querySelector('#presentation-timeline .timeline-line')!;
    expect(line.querySelector('.timeline-entry')!.getAttribute('aria-label')).toContain('Activities');
    expect(line.querySelector('.timeline-entry')!.getAttribute('aria-label')).toContain('15/03/2024');
  });

  test('a PDF without a table is honest: a clear message, nothing attached', async () => {
    await openImportDialog();
    chooseFile(prosePdf());
    await flush();
    await flush();
    expect(byId('activity-status').textContent).toBe('No table was found in this PDF.');
    expect(byId('activity-propose').classList.contains('hidden')).toBe(true);
    byId('activity-cancel').click();
    expect(byId('activity-panel').classList.contains('hidden')).toBe(true);
  });

  test('the strings follow the interface language (Swedish)', async () => {
    await openImportDialog();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    await flush();
    expect(byId('activity-heading').textContent).toBe('Importera aktiviteter');
    expect(byId('activity-choose').textContent).toBe('Välj PDF');
    chooseFile(prosePdf());
    await flush();
    await flush();
    expect(byId('activity-status').textContent).toBe('Ingen tabell hittades i denna PDF.');
  });

  test('the viewer card has no import action (view-only)', async () => {
    // The card in the viewer is rendered through the same renderDetails; the
    // action is present only when the handlers provide it.
    byId('tab-presentation').click();
    await flush();
    byId('pres-mode-map').click();
    await flush();
    const marker = document.querySelector<HTMLElement>('#presentation-marker-layer .marker')!;
    pointer('pointerdown', marker, STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', marker, STAGE.left + 100, STAGE.top + 100);
    await flush();
    expect(byId('presentation-card').querySelector('.details-economics')).toBeNull();
  });
});
