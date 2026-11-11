import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NARROW_QUERY } from '../../src/narrowviewer';

// Desktop safety of the stylesheet (Pass 13, unit 4; FR-58 as amended in
// v1.8.0): every rule after the narrow-layout marker comment lies inside one
// of two gated media blocks, both on the same query as the script that
// drives them: first the viewer's, every rule scoped to the exported viewer,
// then the application's, every rule scoped to the application (not the
// viewer). The marker size band's guard (tests/ui/marker-size-band.test.ts)
// keeps scanning the whole stylesheet, these blocks included.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');
const MARKER = '/* ==== Narrow viewer layout (FR-58) ====';

// The text without comments, which may hold braces of their own.
function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

// The index just after the block that opens at the brace at `open`.
function blockEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}' && --depth === 0) {
      return i + 1;
    }
  }
  throw new Error('unbalanced braces');
}

// A selector list split at its top-level commas (not those inside :is()).
function topLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') {
      depth++;
    } else if (list[i] === ')') {
      depth--;
    } else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out;
}

// The selectors of every rule in a block's body, nested at-rules entered.
function selectors(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) {
      break;
    }
    const prelude = body.slice(i, open).trim();
    const end = blockEnd(body, open);
    if (prelude.startsWith('@media')) {
      out.push(...selectors(body.slice(open + 1, end - 1)));
    } else {
      out.push(...topLevel(prelude));
    }
    i = end;
  }
  return out;
}

// The two blocks after the marker: their queries and their bodies, and
// whatever text lies outside them.
function blocks(after: string): { query: string; body: string }[] {
  const out: { query: string; body: string }[] = [];
  let i = 0;
  for (;;) {
    const start = after.indexOf('@media', i);
    if (start < 0) {
      break;
    }
    expect(after.slice(i, start).trim(), 'nothing between the blocks').toBe('');
    const open = after.indexOf('{', start);
    const end = blockEnd(after, open);
    out.push({ query: after.slice(start + '@media'.length, open).trim(), body: after.slice(open + 1, end - 1) });
    i = end;
  }
  expect(after.slice(i).trim(), 'nothing after the blocks').toBe('');
  return out;
}

const SCOPES = [
  // The viewer, before or after it has started (FR-38 as amended in v1.5.0).
  { name: "the viewer's", prefix: /^html\[data-mode='viewer'\](:not\(\[data-started\]\))? / },
  // The application: every mode but the viewer's.
  // The application: every mode but the viewer's, in any segment or one.
  { name: "the application's", prefix: /^html:not\(\[data-mode='viewer'\]\)(\[data-segment='\w+'\])? / },
];

describe('the narrow media blocks (FR-58 as amended)', () => {
  const at = css.indexOf(MARKER);
  const after = withoutComments(css.slice(at));

  test('the marker comment appears once, and after it there are exactly the two blocks, at the end of the file', () => {
    expect(at).toBeGreaterThan(0);
    expect(css.indexOf(MARKER, at + 1)).toBe(-1);
    expect(blocks(after)).toHaveLength(2);
  });

  test('both queries are the query of the script', () => {
    for (const block of blocks(after)) {
      expect(block.query).toBe(NARROW_QUERY);
    }
  });

  test('every rule of the first block applies to the viewer only, every rule of the second to the application only, and none sizes a marker', () => {
    blocks(after).forEach((block, i) => {
      const found = selectors(block.body);
      expect(found.length, SCOPES[i].name).toBeGreaterThan(10);
      for (const selector of found) {
        expect(selector, `${SCOPES[i].name}: ${selector}`).toMatch(SCOPES[i].prefix);
      }
      expect(
        found.some((s) => /\.marker\b/.test(s)),
        SCOPES[i].name,
      ).toBe(false);
    });
  });

  test('the only nested rule set of either block is the reduced-motion opt-out', () => {
    for (const block of blocks(after)) {
      const nested = [...block.body.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim());
      expect(nested.every((q) => q === '(prefers-reduced-motion: reduce)')).toBe(true);
      expect(nested.length).toBeLessThanOrEqual(1);
    }
  });
});
