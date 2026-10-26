import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { byId, mountApp } from './harness';

// The specification version, read from the same status line as the release
// workflow reads for the release tag and the build injection.
const specVersion = readFileSync(join(process.cwd(), 'docs', 'SPECIFICATION.md'), 'utf8').match(/Status: v([0-9]+\.[0-9]+\.[0-9]+)/)![1];

describe('build version in the header', () => {
  test('the header shows the application name followed by the build version', async () => {
    await mountApp();
    expect(byId('app-name').textContent).toBe('MapVibes');
    expect(byId('app-version').textContent).toBe(`v${specVersion}`);
    expect(byId('app-title').textContent).toBe(`MapVibes v${specVersion}`);
    // Top left: the title is the first element of the header.
    expect(byId('app-header').firstElementChild).toBe(byId('app-title'));
  });

  test('the version is not language-dependent and is never written in the source', async () => {
    await mountApp();
    const select = byId<HTMLSelectElement>('select-language');
    select.value = 'sv';
    select.dispatchEvent(new Event('change'));
    expect(byId('app-version').textContent).toBe(`v${specVersion}`);
    for (const file of ['index.html', 'src/main.ts', 'src/i18n.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toContain(specVersion);
    }
  });
});
