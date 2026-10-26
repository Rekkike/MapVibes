import { describe, expect, test } from 'vitest';
import { DATA_ISLAND_ID, embedDataIsland, readDataIsland, sanitiseForInlineScript, sanitiseJsonForInlineScript } from '../../src/singlefile';

const PAGE = '<!doctype html>\n<html><head><style>body{}</style></head><body><main id="app"></main><script type="module">\nconsole.log("app")\n</script></body></html>';

describe('single-file machinery (FR-11)', () => {
  test('the script sanitiser escapes the three tokenizer sequences', () => {
    expect(sanitiseForInlineScript('a="</script>";b="<!--";c="<script>"')).toBe('a="<\\/script>";b="<\\x21\\x2D\\x2D";c="<\\x73cript>"');
  });

  test('the JSON sanitiser removes every "<" and keeps the value', () => {
    const value = { text: '</script><!-- <script>alert(1)</script> -->', n: 1 };
    const json = JSON.stringify(value, null, 2);
    const safe = sanitiseJsonForInlineScript(json);
    expect(safe).not.toContain('<');
    expect(JSON.parse(safe)).toEqual(value);
  });

  test('the data island is placed just before the application script', () => {
    const page = embedDataIsland(PAGE, '{"a": 1}');
    const island = page.indexOf(`<script type="application/json" id="${DATA_ISLAND_ID}">`);
    expect(island).toBeGreaterThan(page.indexOf('<main id="app">'));
    expect(island).toBeLessThan(page.indexOf('<script type="module">'));
    expect(page.replace(/<script type="application\/json"[\s\S]*?<\/script>\n/, '')).toBe(PAGE);
  });

  test('the island survives hostile text and is read back from the parsed document', () => {
    const value = { note: 'a </script><script>alert(1)</script> <!-- b' };
    const page = embedDataIsland(PAGE, JSON.stringify(value));
    const doc = new DOMParser().parseFromString(page, 'text/html');
    expect(JSON.parse(readDataIsland(doc)!)).toEqual(value);
    // No script element other than the island and the application exists.
    expect(doc.querySelectorAll('script')).toHaveLength(2);
    expect(doc.querySelector('script[type="module"]')!.textContent).toContain('console.log("app")');
  });

  test('a page without an inline application script, or with an island already, is refused', () => {
    expect(() => embedDataIsland('<html><body></body></html>', '{}')).toThrow();
    expect(() => embedDataIsland(embedDataIsland(PAGE, '{}'), '{}')).toThrow();
  });

  test('the application script may mention the island identifier', () => {
    const page = PAGE.replace('console.log("app")', `const id = 'id="${DATA_ISLAND_ID}"';`);
    expect(() => embedDataIsland(page, '{}')).not.toThrow();
  });

  test('a document without an island reads as null', () => {
    expect(readDataIsland(new DOMParser().parseFromString(PAGE, 'text/html'))).toBeNull();
  });
});
