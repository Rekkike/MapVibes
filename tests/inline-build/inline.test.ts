import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const builtIndex = join(process.cwd(), 'dist', 'build', 'index.html');
const builtSingleFile = join(process.cwd(), 'dist', 'build', 'mapvibes-singlefile.html');

// Minimal implementation of the WHATWG HTML tokenizer's <script> data states
// (script data, script data escaped, script data double escaped), which is
// the mechanism behind the defect this test guards against: "<!--" inside
// the script switches the tokenizer to escaped state, "<script" can then
// enter double-escaped state, and in that state "</script>" is consumed as
// a state transition instead of closing the element, so the remainder of the
// script renders as page text. Returns the index of the "</script" start tag
// the browser would recognise, or -1 if the element never closes.
function browserScriptClose(html: string, openTagEnd: number): number {
  let i = openTagEnd;
  let state: 'data' | 'escaped' | 'double-escaped' = 'data';
  while (i < html.length) {
    if (state === 'data') {
      if (html.startsWith('<!--', i)) {
        state = 'escaped';
        i += 4;
      } else if (html.startsWith('</script', i) && /[\s>/]/.test(html[i + 8] ?? '>')) {
        return i;
      } else {
        i += 1;
      }
    } else if (state === 'escaped') {
      if (html.startsWith('-->', i)) {
        state = 'data';
        i += 3;
      } else if (html.startsWith('<script', i)) {
        state = 'double-escaped';
        i += 7;
      } else {
        i += 1;
      }
    } else {
      if (html.startsWith('</script', i)) {
        state = 'escaped';
        i += 8;
      } else {
        i += 1;
      }
    }
  }
  return -1;
}

// Extracts the text a browser would render as body text from the built
// document: everything after the browser-recognised close of the inlined
// module script, with all remaining tags stripped.
function renderedBodyText(html: string): { scriptTextLength: number; bodyText: string; unterminated: boolean } {
  const open = html.indexOf('<script type="module">');
  expect(open).toBeGreaterThan(-1);
  const openTagEnd = html.indexOf('>', open) + 1;
  const close = browserScriptClose(html, openTagEnd);
  if (close === -1) return { scriptTextLength: html.length - openTagEnd, bodyText: '', unterminated: true };
  const closeTagEnd = html.indexOf('>', close);
  const bodyStart = closeTagEnd === -1 ? html.length : closeTagEnd + 1;
  const bodyPart = html.slice(bodyStart).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ');
  return { scriptTextLength: close - openTagEnd, bodyText: bodyPart, unterminated: false };
}

const builds: Array<[string, string]> = [
  ['folder build (index.html)', builtIndex],
  ['single-file build (mapvibes-singlefile.html)', builtSingleFile],
];

describe.each(builtIndex ? builds : [])('inlined build renders no script source as body text (%s)', (_label, file) => {
  test('the built artifact exists (run "npm run build" before this suite)', () => {
    expect(existsSync(file)).toBe(true);
  });

  test('the browser tokeniser closes the inlined script where the build intends it', () => {
    expect(existsSync(file)).toBe(true);
    const html = readFileSync(file, 'utf8');
    const { unterminated, scriptTextLength } = renderedBodyText(html);
    expect(unterminated).toBe(false);
    const intendedClose = html.lastIndexOf('</script>');
    const openTagEnd = html.indexOf('>', html.indexOf('<script type="module">')) + 1;
    expect(scriptTextLength).toBe(intendedClose - openTagEnd);
  });

  test('no script source renders as page text above the interface', () => {
    expect(existsSync(file)).toBe(true);
    const html = readFileSync(file, 'utf8');
    const { bodyText, unterminated } = renderedBodyText(html);
    expect(unterminated).toBe(false);
    const text = bodyText.replace(/\s+/g, ' ').trim();
    expect(text.length).toBeLessThan(500);
    for (const marker of ['function', 'return ', '=>', 'var ', 'const ', 'document.', 'Object.defineProperty']) {
      expect(text).not.toContain(marker);
    }
  });

  test('the sanitised bundle contains no raw HTML tokenizer token sequences', () => {
    expect(existsSync(file)).toBe(true);
    const html = readFileSync(file, 'utf8');
    const openTagEnd = html.indexOf('>', html.indexOf('<script type="module">')) + 1;
    const close = browserScriptClose(html, openTagEnd);
    expect(close).toBeGreaterThan(-1);
    const scriptText = html.slice(openTagEnd, close);
    expect(scriptText).not.toContain('<!--');
    expect(scriptText).not.toContain('<script');
    expect(scriptText).not.toContain('</script');
  });
});
