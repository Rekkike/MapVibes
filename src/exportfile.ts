// Exported file data (FR-11, FR-39, FR-40). The data island of an exported
// file is a JSON document with its own format name and version. It wraps a
// complete work-state document (the work-state file format, with its own
// schema version and migrations) holding only what the presentation shows:
// rows removed from the list and items switched off for the presentation are
// not in it (FR-39). Alongside the work state it carries the number each
// item has in the Presentation segment (FR-38), and the language and theme of
// the exporting application (FR-20).
//
// Export format version 1 is written and read; any other version is rejected
// with a clear message. A later version must keep reading version 1, as the
// work-state file keeps reading its older versions.

import type { Lang } from './i18n';
import type { ThemeChoice } from './preferences';
import { parseWorkState, serialiseWorkState, WorkStateError, type WorkState } from './workstate';

export const EXPORT_FORMAT = 'mapvibes-export';
export const EXPORT_VERSION = 1;
export const READABLE_EXPORT_VERSIONS = [1];
export const SUGGESTED_EXPORT_NAME = 'mapvibes-presentation.html';

export interface ExportData {
  exportedAt: string;
  // The version of the application that wrote the file.
  application: string;
  lang: Lang;
  theme: ThemeChoice;
  // The work state shown, in ingestion order.
  workState: WorkState;
  // The presentation number of each row of workState.rows, in order.
  numbers: number[];
}

export type ExportErrorCode = 'not-json' | 'not-export' | 'unknown-version' | 'invalid';

export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    // The version for 'unknown-version'; the field for 'invalid'.
    readonly detail: string,
    // The underlying problem of the embedded work state, if any.
    readonly cause?: WorkStateError,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'ExportError';
  }
}

export function serialiseExport(data: Omit<ExportData, 'exportedAt'>, exportedAt: Date): string {
  const file = {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: exportedAt.toISOString(),
    application: data.application,
    preferences: { language: data.lang, theme: data.theme },
    numbers: [...data.numbers],
    workState: JSON.parse(serialiseWorkState(data.workState, exportedAt)) as unknown,
  };
  return JSON.stringify(file, null, 2);
}

type Json = Record<string, unknown>;

const LANGS: Lang[] = ['en', 'sv'];
const THEMES: ThemeChoice[] = ['system', 'light', 'dark'];

export function parseExport(text: string): ExportData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ExportError('not-json', 'the embedded data is not valid JSON');
  }
  if (typeof raw !== 'object' || raw === null || (raw as Json).format !== EXPORT_FORMAT) {
    throw new ExportError('not-export', 'the data is not MapVibes export data');
  }
  const file = raw as Json;
  const version = file.exportVersion;
  if (typeof version !== 'number' || !READABLE_EXPORT_VERSIONS.includes(version)) {
    throw new ExportError('unknown-version', String(version));
  }
  const exportedAt = file.exportedAt;
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) throw new ExportError('invalid', 'exportedAt');
  if (typeof file.application !== 'string') throw new ExportError('invalid', 'application');
  const prefs = file.preferences;
  if (typeof prefs !== 'object' || prefs === null) throw new ExportError('invalid', 'preferences');
  const lang = (prefs as Json).language;
  const theme = (prefs as Json).theme;
  if (!LANGS.includes(lang as Lang)) throw new ExportError('invalid', 'preferences.language');
  if (!THEMES.includes(theme as ThemeChoice)) throw new ExportError('invalid', 'preferences.theme');
  let workState: WorkState;
  try {
    workState = parseWorkState(JSON.stringify(file.workState));
  } catch (e) {
    if (e instanceof WorkStateError) throw new ExportError('invalid', 'workState', e);
    throw e;
  }
  // Every row of an export is shown: none is removed, and each has a
  // presentation number; the numbers rise with the rows and are distinct.
  if (workState.rows.some((r) => r.removed)) throw new ExportError('invalid', 'workState.rows');
  const numbers = file.numbers;
  if (
    !Array.isArray(numbers) ||
    numbers.length !== workState.rows.length ||
    numbers.some((n, i) => !Number.isInteger(n) || n < 1 || (i > 0 && n <= (numbers[i - 1] as number)))
  ) {
    throw new ExportError('invalid', 'numbers');
  }
  return { exportedAt, application: file.application, lang: lang as Lang, theme: theme as ThemeChoice, workState, numbers: numbers as number[] };
}
