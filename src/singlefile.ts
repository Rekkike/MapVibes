// Single-file machinery shared by the build and the interactive export
// (FR-11). The post-build inliner (scripts/inline-build.ts) uses the script
// sanitiser to embed the bundle in the page; the export uses the same
// sanitisers to embed the data island into a copy of that page. There is one
// pipeline: the export is the delivered single-file page plus a data island.

// Content-agnostic sanitiser applied to the whole bundle on every build.
// Inside an HTML <script> element the tokenizer treats "<!--", "<script",
// and "</script" as significant token sequences: "<!--" switches the
// tokenizer to escaped state, in which "<script" can enter double-escaped
// state, where "</script>" is consumed as a state transition instead of
// closing the element, and the remainder of the bundle renders as page
// text. These sequences occur inside JavaScript string and regex literals of
// bundled dependencies (today the xlsx bundle; any dependency update may
// introduce new ones), so the sanitiser escapes them with JavaScript hex
// escapes that are valid and semantics-preserving inside string and regex
// literals while breaking the HTML tokenizer sequences:
//   </script  ->  <\/script
//   <!--      ->  <\x21\x2D\x2D
//   <script   ->  <\x73cript
export function sanitiseForInlineScript(js: string): string {
  let out = js;
  out = out.replaceAll('</script', '<\\/script');
  out = out.replaceAll('<!--', '<\\x21\\x2D\\x2D');
  out = out.replaceAll('<script', '<\\x73cript');
  return out;
}

// The same protection for JSON text: in JSON, "<" can occur only inside
// strings, where the escape < is valid and means the same character, so
// replacing every "<" removes all three token sequences while the text stays
// readable and parses to the same value.
export function sanitiseJsonForInlineScript(json: string): string {
  return json.replaceAll('<', '\\u003c');
}

// The element that carries the embedded data of an exported file.
export const DATA_ISLAND_ID = 'mapvibes-export-data';

const MODULE_SCRIPT = '<script type="module">';

// Embeds JSON text into a copy of the single-file page, as a data element
// placed just before the application script, so that the data is in the
// document when the application starts.
export function embedDataIsland(page: string, json: string): string {
  const at = page.indexOf(MODULE_SCRIPT);
  if (at === -1) throw new Error('the page has no inline application script');
  // Only the part before the application script is markup; the script text
  // itself may mention the identifier.
  if (page.slice(0, at).includes(`id="${DATA_ISLAND_ID}"`)) throw new Error('the page already carries a data island');
  const island = `<script type="application/json" id="${DATA_ISLAND_ID}">\n${sanitiseJsonForInlineScript(json)}\n</script>\n`;
  return page.slice(0, at) + island + page.slice(at);
}

// The JSON text of the data island of a document, or null when it has none.
export function readDataIsland(doc: Document): string | null {
  const node = doc.getElementById(DATA_ISLAND_ID);
  return node instanceof HTMLScriptElement && node.type === 'application/json' ? node.textContent : null;
}
