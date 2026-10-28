import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { byId, markers, mountApp, placeExampleMarkers } from './harness';

// The marker size band (FR-57): markers hold a constant, readable size on
// screen at every zoom level, while annotations (footprints) scale with the
// map. Pinned over the structure and the stylesheet; the real layout is
// pinned by the browser suite.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

describe('the marker size band (FR-57)', () => {
  test('the markers are outside the scaled map content; the annotations are inside it', () => {
    const doc = new DOMParser().parseFromString(readFileSync(join(process.cwd(), 'index.html'), 'utf8'), 'text/html');
    for (const [layer, content, shapes] of [
      ['marker-layer', 'map-content', 'map-annotations'],
      ['presentation-marker-layer', 'presentation-content', 'presentation-annotations'],
    ]) {
      expect(doc.getElementById(content)!.contains(doc.getElementById(layer))).toBe(false);
      expect(doc.getElementById(content)!.contains(doc.getElementById(shapes))).toBe(true);
    }
  });

  test('a marker is sized in rem, never by the view', () => {
    const rule = /^\.marker,\n\.marker-badge \{([^}]*)\}/m.exec(css)![1];
    expect(rule).toMatch(/min-width: 1\.75rem;/);
    expect(rule).toMatch(/height: 1\.75rem;/);
    expect(rule).toMatch(/font-size: 0\.8rem;/);
    expect(css).not.toMatch(/\.marker[^{]*\{[^}]*transform:\s*[^;]*scale\(/);
  });

  test('zooming moves the markers but keeps their size; the map content scales', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 400, 300]]);
    const marker = markers()[0];
    const size = () => [marker.style.width, marker.style.height, marker.style.transform];
    const before = size();
    const contentBefore = byId('map-content').style.transform;
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    expect(size()).toEqual(before);
    expect(byId('map-content').style.transform).not.toBe(contentBefore);
    expect(byId('map-content').style.transform).toMatch(/scale\(/);
  });
});
