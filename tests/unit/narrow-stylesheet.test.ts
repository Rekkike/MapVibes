import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NARROW_QUERY } from '../../src/narrowviewer';

// Desktop safety of the stylesheet (Pass 13, unit 4): every rule after the
// narrow-layout marker comment lies inside the one narrow media block, on
// the same query as the script that drives it, and applies to the exported
// viewer only. The marker size band's guard (tests/ui/marker-size-band.test.ts)
// keeps scanning the whole stylesheet, this block included.
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
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i + 1;
  }
  throw new Error('unbalanced braces');
}

// The selectors of every rule in a block's body, nested at-rules entered.
function selectors(body: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) break;
    const prelude = body.slice(i, open).trim();
    const end = blockEnd(body, open);
    if (prelude.startsWith('@media')) out.push(...selectors(body.slice(open + 1, end - 1)));
    else out.push(...prelude.split(',').map((s) => s.trim()));
    i = end;
  }
  return out;
}

describe('the narrow media block (FR-58)', () => {
  const at = css.indexOf(MARKER);
  const after = withoutComments(css.slice(at));

  test('the marker comment appears once, and after it there is exactly one media block, at the end of the file', () => {
    expect(at).toBeGreaterThan(0);
    expect(css.indexOf(MARKER, at + 1)).toBe(-1);
    const start = after.indexOf('@media');
    expect(after.slice(0, start).trim()).toBe('');
    const open = after.indexOf('{', start);
    const end = blockEnd(after, open);
    // Nothing follows the block.
    expect(after.slice(end).trim()).toBe('');
  });

  test('its query is the query of the script', () => {
    const start = after.indexOf('@media');
    const query = after.slice(start + '@media'.length, after.indexOf('{', start)).trim();
    expect(query).toBe(NARROW_QUERY);
  });

  test('every rule in it applies to the exported viewer only, and none sizes a marker', () => {
    const start = after.indexOf('@media');
    const open = after.indexOf('{', start);
    const body = after.slice(open + 1, blockEnd(after, open) - 1);
    const found = selectors(body);
    expect(found.length).toBeGreaterThan(10);
    for (const selector of found) expect(selector, selector).toMatch(/^html\[data-mode='viewer'\] /);
    expect(found.some((s) => /\.marker\b/.test(s))).toBe(false);
  });

  test('the only nested rule set is the reduced-motion opt-out', () => {
    const start = after.indexOf('@media');
    const open = after.indexOf('{', start);
    const body = after.slice(open + 1, blockEnd(after, open) - 1);
    expect([...body.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1].trim())).toEqual(['(prefers-reduced-motion: reduce)']);
  });
});
