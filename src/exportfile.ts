// Exported file data (FR-11, FR-39, FR-40). The data island of an exported
// file is a JSON document with its own format name and version. It wraps a
// complete work-state document (the work-state file format, with its own
// schema version and migrations) holding only what the presentation shows:
// rows removed from the list and items switched off for the presentation are
// not in it (FR-39). Alongside the work state it carries the number each
// item has in the Presentation segment (FR-38), and the language and theme of
// the exporting application (FR-20).
//
// Export format version 2 (v1.1.0) is written; versions 1 and 2 are read;
// any other version is rejected with a clear message. Version 2 embeds a
// work state of schema version 6, which carries the annotations, the colour
// labels, the program vocabulary, and the at-a-glance columns, and adds the
// program groups as numbered in the exported presentation (FR-17, FR-43).
// A version 1 file has none of these: its work state is of schema version 5
// at most, and it has no program groups.

import type { Lang } from './i18n';
import type { ThemeChoice } from './preferences';
import { parseWorkState, serialiseWorkState, WorkStateError, type WorkState } from './workstate';

export const EXPORT_FORMAT = 'mapvibes-export';
export const EXPORT_VERSION = 2;
export const READABLE_EXPORT_VERSIONS = [1, 2];
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
  // The numbers as shown, when they differ from the numbers (the grouped
  // numbering, FR-17, for example "2.3"); absent otherwise. An optional
  // addition to version 1: a reader that does not know it shows the numbers.
  labels?: string[];
  // Version 2: the program groups of the grouped numbering, by group number
  // and in that order (FR-17, FR-43); absent when the numbering is global.
  programGroups?: ProgramGroup[];
}

export interface ProgramGroup {
  index: number;
  name: string;
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
    ...(data.labels ? { labels: [...data.labels] } : {}),
    ...(data.programGroups ? { programGroups: data.programGroups.map((g) => ({ ...g })) } : {}),
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
  const labels = file.labels;
  if (labels !== undefined && (!Array.isArray(labels) || labels.length !== numbers.length || labels.some((l) => typeof l !== 'string' || l.trim() === ''))) {
    throw new ExportError('invalid', 'labels');
  }
  // Program groups are read from version 2 only, as version 1 never wrote
  // them.
  const groups = version >= 2 ? file.programGroups : undefined;
  if (
    groups !== undefined &&
    (!Array.isArray(groups) ||
      groups.some(
        (g, i) =>
          typeof g !== 'object' ||
          g === null ||
          !Number.isInteger((g as Json).index) ||
          ((g as Json).index as number) < 1 ||
          typeof (g as Json).name !== 'string' ||
          (i > 0 && ((g as Json).index as number) <= ((groups[i - 1] as Json).index as number)),
      ))
  ) {
    throw new ExportError('invalid', 'programGroups');
  }
  return {
    exportedAt,
    application: file.application,
    lang: lang as Lang,
    theme: theme as ThemeChoice,
    workState,
    numbers: numbers as number[],
    ...(labels !== undefined ? { labels: labels as string[] } : {}),
    ...(groups !== undefined ? { programGroups: (groups as Json[]).map((g) => ({ index: g.index as number, name: g.name as string })) } : {}),
  };
}
