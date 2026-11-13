import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ECON } from '../../src/documenteconomics';
import { FIGURE } from '../../src/documenttimeline';
import { LEGEND_FONT, PPTX_TABLE, TABLE } from '../../src/documents';

// The documents' type floor (FR-12, FR-50, and FR-51 as amended in v2.1.0):
// the smallest type in the PDF and PowerPoint exports is at least 9 pt. The
// painters' font constants are all at least 9, and no text is drawn below 9
// anywhere in the three painters. The marker numbers on the stage page keep
// their 12.8 pt; the timeline's badge markers are marker chips, scaled with
// the line, not set text.

const PAINTERS = ['src/documents.ts', 'src/documenttimeline.ts', 'src/documenteconomics.ts', 'src/pptxwriter.ts'];

describe("the documents' type floor (v2.1.0)", () => {
  test('every font constant of the painters is at least 9 pt', () => {
    const fonts = [
      LEGEND_FONT,
      TABLE.font,
      PPTX_TABLE.font,
      FIGURE.titleFont,
      FIGURE.font,
      FIGURE.headingFont,
      FIGURE.axisFont,
      FIGURE.eventFont,
      FIGURE.captionFont,
      ECON.titleFont,
      ECON.headingFont,
      ECON.totalsFont,
      ECON.noteFont,
    ];
    for (const font of fonts) {
      expect(font, `font ${font}`).toBeGreaterThanOrEqual(9);
    }
  });

  test('no font constant below 9 pt remains in the painters', () => {
    for (const file of PAINTERS) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      const constants = [...src.matchAll(/(?:font|Font):\s*([0-9]+(?:\.[0-9]+)?)/g)].map((m) => Number(m[1]));
      expect(
        constants.filter((n) => n < 9),
        `${file}: font constants below 9 pt`,
      ).toEqual([]);
    }
  });
});
