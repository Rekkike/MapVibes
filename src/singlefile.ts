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

// The no-scripts notice of an exported file (FR-59), and the small script
// that governs it: placed before the application's script, it marks that
// scripts run, which hides the notice at once, and reveals the notice after
// fifteen seconds if the application has not marked itself started.
export const NOTICE_ID = 'boot-notice';
export const NOTICE_DELAY_MS = 15000;
const BOOT_SCRIPT =
  `<script>document.documentElement.setAttribute('data-scripting','on');` +
  `setTimeout(function(){if(!document.documentElement.hasAttribute('data-started'))document.documentElement.setAttribute('data-boot','failed')},${NOTICE_DELAY_MS});</script>\n`;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Writes the exported copy's static state (FR-38 as amended in v1.5.0): the
// viewer frame in the export's language, so that a recipient whose device
// does not run the program sees the presentation's frame and the notice
// (its paragraphs, the first in bold), never the editor's start screen. Like
// the data island, only markup outside the application script is touched.
export function writeStaticViewerState(page: string, lang: string, notice: string[]): string {
  const at = page.indexOf(MODULE_SCRIPT);
  if (at === -1) throw new Error('the page has no inline application script');
  const html = /<html\b([^>]*)>/i.exec(page.slice(0, at));
  if (!html) throw new Error('the page has no html element before the application script');
  const attributes = html[1].replace(/\s(lang|data-mode)="[^"]*"/g, '');
  const htmlTag = `<html${attributes} lang="${escapeHtml(lang)}" data-mode="viewer">`;
  const before = page.slice(0, html.index) + htmlTag + page.slice(html.index + html[0].length, at);
  const after = page.slice(at);
  const paragraphs = notice.map((text, i) => (i === 0 ? `<p><strong>${escapeHtml(text)}</strong></p>` : `<p>${escapeHtml(text)}</p>`)).join('');
  const element = `\n<div id="${NOTICE_ID}" role="note">${paragraphs}</div>`;
  // The notice opens the body, which precedes the application script (a
  // script at the end of the body) or follows it (a script in the head,
  // whose text cannot hold a closing script tag).
  const bodyBefore = /<body\b[^>]*>/i.exec(before);
  if (bodyBefore) {
    const open = bodyBefore.index + bodyBefore[0].length;
    return before.slice(0, open) + element + before.slice(open) + BOOT_SCRIPT + after;
  }
  const scriptEnd = after.indexOf('</script>');
  const bodyAfter = scriptEnd === -1 ? null : /<body\b[^>]*>/i.exec(after.slice(scriptEnd));
  if (!bodyAfter) throw new Error('the page has no body');
  const open = scriptEnd + bodyAfter.index + bodyAfter[0].length;
  return before + BOOT_SCRIPT + after.slice(0, open) + element + after.slice(open);
}

// The JSON text of the data island of a document, or null when it has none.
export function readDataIsland(doc: Document): string | null {
  const node = doc.getElementById(DATA_ISLAND_ID);
  return node instanceof HTMLScriptElement && node.type === 'application/json' ? node.textContent : null;
}
