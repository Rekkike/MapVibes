import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist', 'build');

function findAsset(prefix: string, suffix: string): string {
  const assets = readdirSync(join(distDir, 'assets'));
  const match = assets.find((a) => a.startsWith(prefix) && a.endsWith(suffix));
  if (!match) throw new Error(`asset not found: ${prefix}*${suffix}`);
  return match;
}

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
function sanitiseForInlineScript(js: string): string {
  let out = js;
  out = out.replaceAll('</script', '<\\/script');
  out = out.replaceAll('<!--', '<\\x21\\x2D\\x2D');
  out = out.replaceAll('<script', '<\\x73cript');
  return out;
}

const jsAsset = findAsset('index-', '.js');
const cssAsset = findAsset('index-', '.css');

const js = readFileSync(join(distDir, 'assets', jsAsset), 'utf8');
const css = readFileSync(join(distDir, 'assets', cssAsset), 'utf8');
let html = readFileSync(join(distDir, 'index.html'), 'utf8');

const scriptTag = `<script type="module" crossorigin src="./assets/${jsAsset}"></script>`;
const cssTag = `<link rel="stylesheet" crossorigin href="./assets/${cssAsset}">`;

if (!html.includes(scriptTag)) throw new Error('script tag not found in built index.html');
if (!html.includes(cssTag)) throw new Error('css tag not found in built index.html');

// Replacer functions keep the substitution literal: a replacement string
// would interpret $&, $', and similar sequences, splicing the remainder of
// the document into the middle of the inlined script.
html = html.replace(cssTag, () => `<style>\n${css}\n</style>`);
html = html.replace(scriptTag, () => `<script type="module">\n${sanitiseForInlineScript(js)}\n</script>`);

writeFileSync(join(distDir, 'index.html'), html);
writeFileSync(join(distDir, 'mapvibes-singlefile.html'), html);

console.log('inlined build written: dist/build/index.html and dist/build/mapvibes-singlefile.html');
