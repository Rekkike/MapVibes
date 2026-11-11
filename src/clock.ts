// The clock seam (FR-78, FR-79 as amended): today's date for the
// today mark, read from the device's own clock -- the reader's today in an
// exported file (FR-38 as noted), the export date in the documents (FR-12 as
// noted). Tests set the clock (vi.setSystemTime, Playwright's page.clock)
// rather than this module, so that the application reads it one way only.

import { dayNumber } from './dates';

// Today as a day number, by the device's local calendar date.
export function todayDay(now: Date = new Date()): number {
  return dayNumber(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
