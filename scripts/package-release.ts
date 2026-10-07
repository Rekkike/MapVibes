import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const staging = join(process.cwd(), 'dist', 'release', 'mapvibes');
rmSync(join(process.cwd(), 'dist', 'release'), { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

cpSync(join(process.cwd(), 'dist', 'build', 'index.html'), join(staging, 'index.html'));
cpSync(join(process.cwd(), 'dist', 'build', 'mapvibes-singlefile.html'), join(staging, 'mapvibes-singlefile.html'));

const readme = `# MapVibes — runnable application archive

This archive is the runnable application. The repository remains code-only.

Contents:
- index.html — the application. Open it directly from a local folder (file://) in a modern browser. No server and no dev tools are required.
- mapvibes-singlefile.html — the same application as one fully self-contained HTML file with no external references.

Both files work fully offline. All scripts, styles, fonts, and assets are bundled; the application makes no network calls.

Note: web browser local storage (language and theme preferences, FR-21) is associated with the file's origin. When opened via file://, browsers scope storage per local file path; preferences are still remembered for that file across sessions in common browsers. If the browser blocks local storage entirely, the application falls back to defaults and remains fully functional.
`;
writeFileSync(join(staging, 'README.txt'), readme);

console.log('release staging written: dist/release/mapvibes');
