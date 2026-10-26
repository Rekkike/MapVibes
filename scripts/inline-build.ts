import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { sanitiseForInlineScript } from '../src/singlefile';

const distDir = join(process.cwd(), 'dist', 'build');

function findAsset(prefix: string, suffix: string): string {
  const assets = readdirSync(join(distDir, 'assets'));
  const match = assets.find((a) => a.startsWith(prefix) && a.endsWith(suffix));
  if (!match) throw new Error(`asset not found: ${prefix}*${suffix}`);
  return match;
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
