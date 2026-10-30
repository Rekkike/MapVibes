import { describe, expect, test } from 'vitest';
import { DATA_ISLAND_ID, embedDataIsland, NOTICE_DELAY_MS, NOTICE_ID, readDataIsland, sanitiseForInlineScript, sanitiseJsonForInlineScript, writeStaticViewerState } from '../../src/singlefile';

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

describe('the exported static state and the no-scripts notice (FR-38 as amended in v1.5.0, FR-59)', () => {
  const NOTICE = ['Not started.', 'Because <of> "this" & that.', 'Open it elsewhere.'];
  // The built page: the application script in the head, the body after it.
  const HEAD_PAGE = '<!doctype html>\n<html lang="en"><head><script type="module">\nconst s = "<body>";\n</script><style>body{}</style></head><body><main id="app"></main></body></html>';

  for (const [where, page] of [
    ['the script in the head', HEAD_PAGE],
    ['the script at the end of the body', PAGE],
  ] as const) {
    test(`the html element carries the viewer mode and the language; the notice opens the body; the small script precedes the application (${where})`, () => {
      const out = writeStaticViewerState(page, 'sv', NOTICE);
      const doc = new DOMParser().parseFromString(out, 'text/html');
      expect(doc.documentElement.getAttribute('data-mode')).toBe('viewer');
      expect(doc.documentElement.getAttribute('lang')).toBe('sv');
      const notice = doc.getElementById(NOTICE_ID)!;
      expect(doc.body.firstElementChild).toBe(notice);
      expect([...notice.querySelectorAll('p')].map((p) => p.textContent)).toEqual(NOTICE);
      expect(notice.querySelector('strong')!.textContent).toBe(NOTICE[0]);
      // Text, never markup: the notice holds no element but its paragraphs.
      expect([...notice.querySelectorAll('*')].map((e) => e.tagName)).toEqual(['P', 'STRONG', 'P', 'P']);
      const scripts = [...doc.querySelectorAll('script')];
      const boot = scripts.findIndex((s) => !s.type);
      expect(boot).toBeGreaterThanOrEqual(0);
      expect(boot).toBeLessThan(scripts.findIndex((s) => s.type === 'module'));
      expect(scripts[boot].textContent).toContain(`${NOTICE_DELAY_MS}`);
      // The application script is untouched.
      expect(out).toContain(page.slice(page.indexOf('<script type="module">'), page.indexOf('</script>') + 9));
    });
  }

  test('the island goes in as before, after the static state', () => {
    const out = embedDataIsland(writeStaticViewerState(HEAD_PAGE, 'en', NOTICE), '{"a": 1}');
    const doc = new DOMParser().parseFromString(out, 'text/html');
    expect(readDataIsland(doc)).toContain('"a": 1');
    expect(doc.getElementById(NOTICE_ID)).not.toBeNull();
  });

  test('a page without an application script or a body is refused', () => {
    expect(() => writeStaticViewerState('<html><body></body></html>', 'en', NOTICE)).toThrow();
    expect(() => writeStaticViewerState('<html><head><script type="module">x</script></head></html>', 'en', NOTICE)).toThrow();
  });
});
