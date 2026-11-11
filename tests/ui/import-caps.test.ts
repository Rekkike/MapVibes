import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { strings } from '../../src/i18n';
import { byId, flush, mountApp } from './harness';

let MAX_IMPORT_BYTES = 0;

function bigFile(name: string, type: string): File {
  return new File([new Uint8Array(MAX_IMPORT_BYTES + 1)], name, { type });
}

async function chooseFile(inputId: string, file: File): Promise<void> {
  const input = byId<HTMLInputElement>(inputId);
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

describe('import size caps (FR-1 and FR-25, noted in v1.15.1)', () => {
  beforeEach(async () => {
    await mountApp();
    ({ MAX_IMPORT_BYTES } = await import('../../src/main'));
    expect(MAX_IMPORT_BYTES).toBe(50 * 1024 * 1024);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('a spreadsheet larger than the cap is refused before reading, in the alert region', async () => {
    await chooseFile('file-input', bigFile('big.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
    const error = byId('ingest-error');
    expect(error.classList.contains('hidden')).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe(strings('en').spreadsheetTooLarge);
    expect(byId('list-panel').classList.contains('hidden')).toBe(true);
  });

  test('a PDF background larger than the cap is refused before reading, in the map alert region', async () => {
    await chooseFile('map-file-input', bigFile('big.pdf', 'application/pdf'));
    const error = byId('map-error');
    expect(error.classList.contains('hidden')).toBe(false);
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.textContent).toBe(strings('en').pdfTooLarge);
  });

  test('a file within the cap is not refused for its size', async () => {
    await chooseFile('file-input', new File([new Uint8Array(16)], 'small.xlsx', { type: 'application/octet-stream' }));
    expect(byId('ingest-error').classList.contains('hidden')).toBe(false);
    expect(byId('ingest-error').textContent).toBe(strings('en').parseError);
  });
});
