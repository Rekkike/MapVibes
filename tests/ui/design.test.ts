import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

// Design quality bar (FR-29): theming tokens and colour classes are pinned
// by assertions over the stylesheet.
const css = readFileSync(join(process.cwd(), 'src', 'styles.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const light = block(':root');
const dark = block("html[data-theme='dark']");

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const COLOURS = ['green', 'blue', 'yellow', 'red'];

describe('design tokens and theming (FR-29)', () => {
  test('every colour token of the light theme is redefined for the dark theme', () => {
    const colourTokens = Object.entries(light)
      .filter(([, v]) => /^#|rgba?\(/.test(v))
      .map(([k]) => k);
    expect(colourTokens.length).toBeGreaterThan(10);
    for (const token of colourTokens) expect(dark[token], token).toBeDefined();
  });

  test('no literal colour values outside the theme token blocks', () => {
    const withoutTokens = css.replace(/:root\s*\{[^}]*\}/, '').replace(/html\[data-theme='dark'\]\s*\{[^}]*\}/, '');
    expect(withoutTokens.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
  });

  test('spacing and radius come from shared tokens', () => {
    for (const token of ['--space-1', '--space-2', '--space-3', '--radius', '--radius-pill']) expect(light[token]).toBeDefined();
    expect(css.match(/border-radius:\s*\d+px/g)).toBeNull();
  });

  test('each marker colour class uses its own colour token', () => {
    for (const colour of COLOURS) {
      const rule = new RegExp(`\\.marker-${colour}\\s*\\{[^}]*--marker-fill:\\s*var\\(--marker-${colour}\\)`);
      expect(css).toMatch(rule);
      expect(light[`--marker-${colour}`]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(dark[`--marker-${colour}`]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    const values = COLOURS.map((c) => light[`--marker-${c}`]);
    expect(new Set(values).size).toBe(4);
  });

  test('marker numbers meet a 4.5:1 text contrast in both themes', () => {
    for (const theme of [light, dark]) {
      for (const colour of COLOURS) {
        const text = colour === 'yellow' ? theme['--marker-text-on-yellow'] : theme['--marker-text'];
        expect(contrast(text, theme[`--marker-${colour}`]), `${colour}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('foreground, muted, and warning text meet 4.5:1 against the panel in both themes', () => {
    for (const theme of [light, dark]) {
      expect(contrast(theme['--fg'], theme['--panel'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme['--muted'], theme['--panel'])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme['--warning'], theme['--panel'])).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('every marker shape class sets the clip shape, and the symbol layers use the fill and clip variables (FR-26)', () => {
    for (const shape of ['circle', 'square', 'diamond', 'triangle', 'hexagon']) {
      expect(css).toMatch(new RegExp(`\\.marker-shape-${shape}\\s*\\{\\s*--marker-clip:`));
    }
    expect(css).toMatch(/\.marker::after,[^{]*\{[^}]*background:\s*var\(--marker-fill\)/);
    expect(css).toMatch(/\.marker::before,[^{]*\{[^}]*clip-path:\s*var\(--marker-clip\)/);
    expect(light['--marker-neutral']).toBeDefined();
    expect(dark['--marker-neutral']).toBeDefined();
  });

  test('the at-a-glance panel keeps a compact density (FR-28)', () => {
    const rule = css.slice(css.indexOf('.glance-entry {'), css.indexOf('}', css.indexOf('.glance-entry {')));
    expect(rule).toMatch(/padding:\s*var\(--space-1\)\s+var\(--space-2\);/);
    expect(rule).toMatch(/gap:\s*var\(--space-2\);/);
    expect(rule).toMatch(/font-size:\s*0\.875rem;/);
    const list = css.slice(css.indexOf('.glance-list {'), css.indexOf('}', css.indexOf('.glance-list {')));
    expect(list).toMatch(/gap:\s*var\(--space-1\);/);
  });

  test('rendered OpenStreetMap backgrounds keep legible edges against the land colour (FR-31)', async () => {
    const { LAND_COLOUR, OSM_STYLE } = await import('../../src/osm');
    for (const [feature, style] of Object.entries(OSM_STYLE)) {
      const edge = style.casing ?? style.stroke;
      expect(edge, feature).toBeDefined();
      expect(contrast(edge!, LAND_COLOUR), feature).toBeGreaterThanOrEqual(3);
    }
    // Area classes are told apart from each other and from the land.
    const fills = ['green', 'water', 'building'].map((f) => OSM_STYLE[f as keyof typeof OSM_STYLE].fill!);
    expect(new Set([...fills, LAND_COLOUR]).size).toBe(4);
    // Roads draw a lighter centre over a darker casing.
    for (const road of ['minor-road', 'major-road'] as const) {
      expect(luminance(OSM_STYLE[road].stroke!)).toBeGreaterThan(luminance(OSM_STYLE[road].casing!));
    }
  });

  test('markers stay legible on a rendered map in both themes (FR-31, FR-29)', async () => {
    const { LAND_COLOUR } = await import('../../src/osm');
    for (const theme of [light, dark]) {
      expect(contrast(theme['--marker-halo'], LAND_COLOUR)).toBeGreaterThanOrEqual(3);
      for (const colour of COLOURS) {
        const best = Math.max(contrast(theme[`--marker-${colour}`], LAND_COLOUR), contrast(theme['--marker-halo'], LAND_COLOUR));
        expect(best, colour).toBeGreaterThanOrEqual(3);
      }
    }
    expect(css).toMatch(/drop-shadow\(0 0 1px var\(--marker-halo\)\)/);
    // The rendered map is shown as-is: no filter or opacity on the background image in either theme.
    for (const selector of ['#map-image,\n#presentation-image {']) {
      const rule = css.slice(css.indexOf(selector), css.indexOf('}', css.indexOf(selector)));
      expect(rule).not.toMatch(/filter|opacity/);
    }
  });

  test('icons are vector glyphs stroked in the marker number colour, at 4.5:1 against every fill in both themes (FR-26)', () => {
    const glyph = css.slice(css.indexOf('.marker-glyph {'), css.indexOf('}', css.indexOf('.marker-glyph {')));
    expect(glyph).toMatch(/stroke:\s*currentColor;/);
    expect(glyph).toMatch(/fill:\s*none;/);
    for (const theme of [light, dark]) {
      for (const colour of COLOURS) {
        const ink = colour === 'yellow' ? theme['--marker-text-on-yellow'] : theme['--marker-text'];
        expect(contrast(ink, theme[`--marker-${colour}`]), colour).toBeGreaterThanOrEqual(4.5);
      }
      // Swatches and badges without a colour (the legend's symbol list) use the neutral fill.
      expect(contrast(theme['--marker-on-neutral'], theme['--marker-neutral'])).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toMatch(/:where\(\.marker, \.marker-badge, \.legend-swatch\) \{[^}]*color:\s*var\(--marker-on-neutral\)/);
  });
});
