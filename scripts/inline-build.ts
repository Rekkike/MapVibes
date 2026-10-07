import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

html = html.replace(cssTag, `<style>\n${css}\n</style>`);
html = html.replace(scriptTag, `<script type="module">\n${js}\n</script>`);

writeFileSync(join(distDir, 'index.html'), html);
writeFileSync(join(distDir, 'mapvibes-singlefile.html'), html);

console.log('inlined build written: dist/build/index.html and dist/build/mapvibes-singlefile.html');
